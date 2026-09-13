#!/usr/bin/env python3
# mkf-crosscheck.py — E71: the D2 / D3 constructions re-built in PyOpenMagnetics (OpenMagnetics MKF) and compared with the
# in-repo 1-D engines at the same corner. A second, geometry-level opinion, NOT battery evidence: it needs a Python venv
# (PyOpenMagnetics 1.4.0 wheel, macOS arm64 / Python 3.12 — the 1.7.x sdist does not build here) and is run by hand.
#
# Per SKU:
#   [MKF-RDC]     winding Rdc from MKF's own turn layout vs the production build rows (an MLT or copper-area slip) — ±5 %
#   [MKF-GAP]     inductance from the drawn distributed gap under MKF's fringing reluctance models, and the Σ gap that
#                 reaches the target — the parts are ground to AL, so this corrects the first-grind guide, not the part
#   [MKF-CU]      copper loss at the gate's copper corner (MKF 2-D field: ohmic + skin + proximity) vs Dowell / Sullivan,
#                 and the D3 short-circuit resistance both models predict for the production test fixture
#   [MKF-THERMAL] the magnetics-envelope thermal network re-run with MKF's copper: ok = design lines hold · info = only the
#                 125 / 135 °C design lines are exceeded (the foil band that restores them is computed) · FAIL = the class
#                 lines break (+25 % Rth > 155 °C or runaway margin < 25 K)
# Leakage is NOT taken from MKF: in 1.4.0 foil / rectangular turns return 90–170 µH per cell and the value RISES with foil
# height (physically it falls). Recorded once as [MKF-LEAK]; the 1-D leakage and the first-article measurement stand.
#
# Run:  <venv>/bin/python calculations/magnetics/mkf-crosscheck.py   → calculations/out/evidence/mkf-crosscheck.json
import contextlib, io, json, math, os, subprocess, sys

from PyOpenMagnetics import PyOpenMagnetics as P

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MU0 = 4e-7 * math.pi
rows, values, fails = [], {}, 0


def row(status, tag, name, detail):
    global fails
    fails += status == "FAIL"
    rows.append({"status": status, "tag": tag, "name": name, "detail": detail})
    print(f"  {status:<5} [{tag}] {name} — {detail}")


def node(code):
    out = subprocess.run(["node", "--input-type=module", "-e", code], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def quiet(fn, *a):   # wind() echoes its arguments to stdout
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*a)


# ---- the gate's constructions, copper corner, 1-D copper split and 1-D short-circuit R (one source: magnetics-envelope) ----
DATA = node("""
const M = await import("./calculations/magnetics/magnetics-envelope.mjs");
const { TANKS } = await import("./calculations/llc/tanks.mjs");
const W = await import("./calculations/magnetics/winding-physics.mjs");
const out = {};
for (const sku of ["30kw", "40kw", "50kw", "50kwa"]) {
  const rowsX = M.excitation(sku).rows, c3 = M.D3[sku], c2 = M.D2[sku];
  const e3 = M.evaluate(sku, "D3", c3, rowsX), e2 = M.evaluate(sku, "D2", c2, rowsX);
  const r = rowsX.find((x) => x.corner === e3.cu.corner), g = M.d3Build(c3), fq = r.fsw_kHz * 1e3;
  const rP = (T) => (W.rho(T) * c3.N * g.mltP) / c3.cuP * W.litzFr({ fq, T, N: c3.N, n: c3.strands, d: c3.dS, b: c3.b, k: 0.25 });
  const rS = (T) => (W.rho(T) * c3.N * (g.mltS1 + g.mltS2) / 2) / (c3.nf * c3.foil * c3.foilW) * W.dowell((c3.foil / W.delta(fq, T)) * Math.sqrt(c3.foilW / c3.b), c3.N * c3.nf);
  const rdc = (mlt, area) => (W.rho(25) * mlt) / area;
  out[sku] = { d3: c3, d2: c2, cellLm: TANKS[sku].Lm / M.D3_CELLS, corner: r.corner, fq, Ip: r.Ip_rms_A, Ih: r.Isec_rms_A / 2,
    d3cu: e3.cu.cu100, d3cuP: rP(100) * r.Ip_rms_A ** 2, d3cuS: 2 * rS(100) * (r.Isec_rms_A / 2) ** 2, rsc1d: rP(25) + rS(25) / 2,
    d2cu: e2.cu.cu100, d2corner: e2.cu.corner, T55: e3.w55.T55,
    rdc3: [rdc(c3.N * g.mltP, c3.cuP), rdc(c3.N * g.mltS1, c3.nf * c3.foil * c3.foilW), rdc(c3.N * g.mltS2, c3.nf * c3.foil * c3.foilW)],
    rdc2: rdc(c2.N * M.d2Mlt(c2), (c2.strands * Math.PI * c2.dS ** 2) / 4) };
}
console.log(JSON.stringify(out));
""")


def thermal(sku, foil_w, mkf_total):
    """The gate's own D3 network with copper scaled to MKF's total at the copper corner (currents × √k leave the core loss alone)."""
    return node("""
const M = await import("./calculations/magnetics/magnetics-envelope.mjs");
const sku = "%s", c = { ...M.D3[sku], foilW: %r }, rowsX = M.excitation(sku).rows;
const k = %r / M.evaluate(sku, "D3", c, rowsX).cu.cu100;
const e = M.evaluate(sku, "D3", c, rowsX.map((r) => ({ ...r, Ip_rms_A: r.Ip_rms_A * Math.sqrt(k), Isec_rms_A: r.Isec_rms_A * Math.sqrt(k) })));
console.log(JSON.stringify({ k, T55: e.w55.T55, T75: e.w75.T75, Ts: e.wS.Tstress, margin: e.wM.margin, Tw: e.w55.Tw55, Tc: e.w55.Tc55 }));
""" % (sku, foil_w, mkf_total))


# ---- MKF builders ----
def core(stacks, total_gap, seg_max):
    k = max(1, math.ceil(total_gap / seg_max - 1e-9))
    gapping = [{"type": "subtractive", "length": total_gap / k}] * k + [{"type": "residual", "length": 1e-5}] * 2
    return P.calculate_core_data({"functionalDescription": {"type": "two-piece set", "material": "N95", "shape": "E 70/33/32",
                                                            "numberStacks": stacks, "gapping": gapping}, "name": "x"}, False), k


def drawn_gap(stacks, N, L):   # the drawings quote Σ gap from µ0·Ae·N²/L, without fringing
    c, _ = core(stacks, 1e-5, 1)
    return MU0 * c["processedDescription"]["columns"][0]["area"] * N * N / L


def litz(n, d):
    return {"type": "litz", "material": "copper", "numberConductors": n, "strand": "Round %s - Grade 1" % ("%.3f" % (d * 1e3)).rstrip("0"),
            "outerDiameter": {"nominal": P.get_wire_outer_diameter_served_litz(d, n, 1, 1, "IEC 60317")}, "coating": {"type": "served", "numberLayers": 1}}


def foil(t, h):
    return {"type": "foil", "material": "copper", "numberConductors": 1, "conductingWidth": {"nominal": t}, "conductingHeight": {"nominal": h},
            "outerWidth": {"nominal": t + 25e-6}, "outerHeight": {"nominal": h}}


def sine(f, rms, ph):
    t = [k / (256 * f) for k in range(257)]
    return {"waveform": {"data": [math.sqrt(2) * rms * math.sin(2 * math.pi * f * x + ph) for x in t], "time": t}}


def operating_point(f, currents, temp):
    # current-driven fields only, like the 1-D engines: a near-zero voltage keeps MKF from adding magnetizing-flux fringing
    # loss (the [GAP] item, closed by construction and first article) — with 100 V it put a fixed ~0.06 W floor under a 1 A test
    ex = [{"name": n, "frequency": f, "current": sine(f, i, ph), "voltage": sine(f, 0.1, ph + math.pi / 2)} for n, i, ph in currents]
    return P.process_inputs({"designRequirements": {"magnetizingInductance": {"nominal": 1e-5}, "turnsRatios": [{"nominal": 1}] * (len(ex) - 1)},
                             "operatingPoints": [{"conditions": {"ambientTemperature": temp}, "excitationsPerWinding": ex}]})["operatingPoints"][0]


def losses(mag, op, temp):
    r = P.calculate_winding_losses(mag, op, temp)
    per = [(x["name"], x["ohmicLosses"]["losses"], sum((x.get("skinEffectLosses") or {}).get("lossesPerHarmonic") or []),
            sum((x.get("proximityEffectLosses") or {}).get("lossesPerHarmonic") or [])) for x in r["windingLossesPerWinding"]]
    return r["windingLosses"], per


def inductance(c, w, model):
    sig = {"processed": {"label": "Sinusoidal", "peakToPeak": 0.2, "offset": 0, "dutyCycle": 0.5}}
    op = {"conditions": {"ambientTemperature": 25}, "excitationsPerWinding": [{"frequency": 10e3, "current": sig, "voltage": sig}]}
    return P.calculate_inductance_from_number_turns_and_gapping(c, w, op, {"reluctance": model})


def d3_magnetic(c3, cell_lm, foil_w):
    cc, _ = core(c3["n"], drawn_gap(c3["n"], c3["N"], cell_lm), 0.5e-3)
    coil = P.set_intersection_insulation({"bobbin": P.create_simple_bobbin_from_core(cc), "functionalDescription": [
        {"name": "P", "numberTurns": c3["N"], "numberParallels": 1, "isolationSide": "primary", "wire": litz(c3["strands"], c3["dS"])},
        {"name": "S1", "numberTurns": c3["N"], "numberParallels": c3["nf"], "isolationSide": "secondary", "wire": foil(c3["foil"], foil_w)},
        {"name": "S2", "numberTurns": c3["N"], "numberParallels": c3["nf"], "isolationSide": "secondary", "wire": foil(c3["foil"], foil_w)}]}, c3["gap"], 1)
    return {"core": cc, "coil": quiet(P.wind, coil, 1, [0.34, 0.33, 0.33], [1, 0, 2], [[0.0, 0.0]] * 3)}


GAP_MODELS = ["ZHANG", "MUEHLETHALER", "PARTRIDGE", "BALAKRISHNAN", "STENGLEIN"]


def gap_check(label, sku, stacks, N, target, tol, seg_max, winding):
    drawn = drawn_gap(stacks, N, target)
    c, k = core(stacks, drawn, seg_max)
    w = quiet(P.wind, {"bobbin": P.create_simple_bobbin_from_core(c), "functionalDescription": [winding]}, 1, [1.0], [0], [[0.0, 0.0]])
    L = {m: inductance(c, w, m) for m in GAP_MODELS}
    lo, hi = drawn, drawn * 1.6                                   # Σ that reaches the target under MKF's default (Zhang) model
    for _ in range(30):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if inductance(core(stacks, mid, seg_max)[0], w, "ZHANG") > target else (lo, mid)
    kk = max(1, math.ceil(lo / seg_max - 1e-9))
    dz = L["ZHANG"] / target - 1
    row("ok" if abs(dz) <= tol else "info", "MKF-GAP", f"{sku} {label} from the drawn gap Σ {drawn * 1e3:.2f} mm in {k} × {drawn / k * 1e3:.2f} mm",
        f"Zhang {L['ZHANG'] * 1e6:.2f} µH ({dz * 100:+.1f} %) · Muehlethaler {L['MUEHLETHALER'] * 1e6:.2f} · Partridge {L['PARTRIDGE'] * 1e6:.2f} · "
        f"Balakrishnan {L['BALAKRISHNAN'] * 1e6:.2f} · Stenglein {L['STENGLEIN'] * 1e6:.2f} vs {target * 1e6:.2f} µH ± {tol * 100:.0f} % → with fringing "
        f"Σ ≈ {lo * 1e3:.1f} mm ({kk} × {lo / kk * 1e3:.2f} mm) reaches the target — ground to AL either way; this is the first-grind guide")
    return round(lo * 1e3, 1), kk


print("=== MKF CROSS-CHECK (PyOpenMagnetics 1.4.0) — D2 / D3 against the in-repo engines ===")
for sku, d in DATA.items():
    c3, c2, v = d["d3"], d["d2"], {}
    primary = {"name": "P", "numberTurns": c3["N"], "numberParallels": 1, "isolationSide": "primary", "wire": litz(c3["strands"], c3["dS"])}
    v["d3GapMm"], v["d3GapSegments"] = gap_check("D3 cell Lm", sku, c3["n"], c3["N"], d["cellLm"], 0.07, 0.5e-3, primary)

    mag = d3_magnetic(c3, d["cellLm"], c3["foilW"])
    rdc = P.calculate_dc_resistance_per_winding(mag["coil"], 25)
    dev = [m / b - 1 for m, b in zip(rdc, d["rdc3"])]
    row("ok" if max(map(abs, dev)) <= 0.05 else "FAIL", "MKF-RDC", f"{sku} D3 cell Rdc per winding @25 °C from MKF's turn layout",
        " · ".join(f"{n} {m * 1e3:.2f} vs {b * 1e3:.2f} mΩ ({x * 100:+.1f} %)" for n, m, b, x in zip(("P", "S1", "S2"), rdc, d["rdc3"], dev)) + " — acceptance ±5 %")

    tot, per = losses(mag, operating_point(d["fq"], [("P", d["Ip"], 0.0), ("S1", d["Ih"], math.pi), ("S2", d["Ih"], math.pi)], 100), 100)
    sc, _ = losses(mag, operating_point(d["fq"], [("P", 10.0, 0.0), ("S1", 5.0, math.pi), ("S2", 5.0, math.pi)], 25), 25)
    v["rsc1dMohm"], v["rscMkfMohm"] = round(d["rsc1d"] * 1e3, 2), round(sc / 100 * 1e3, 2)
    row("info", "MKF-CU", f"{sku} D3 cell copper at {d['corner']} {d['fq'] / 1e3:.1f} kHz, 100 °C",
        f"MKF {tot:.1f} W (" + " · ".join(f"{n} {o:.1f} ohmic + {s:.1f} skin + {p:.1f} prox" for n, o, s, p in per) +
        f") vs 1-D {d['d3cu']:.1f} W (litz {d['d3cuP']:.1f} Sullivan + foils {d['d3cuS']:.1f} Dowell) → ×{tot / d['d3cu']:.2f}: MKF resolves the edge current where the "
        f"{c3['foilW'] * 1e3:.0f} mm foil stops short of the window, which the 1-D porosity factor reads low · short-circuit R at {d['fq'] / 1e3:.0f} kHz, halves shorted, 25 °C: "
        f"1-D {v['rsc1dMohm']:.2f} · MKF {v['rscMkfMohm']:.2f} mΩ")

    t = thermal(sku, c3["foilW"], tot)
    klass = t["Ts"] <= 155 and t["margin"] >= 25
    design = t["T55"] <= 125 and t["T75"] <= 135
    detail = (f"hot-spot {t['T55']:.0f} °C @55 °C (core {t['Tc']:.0f} / winding {t['Tw']:.0f}) vs 125 · {t['T75']:.0f} °C @75 °C derated vs 135 · "
              f"+25 % Rth {t['Ts']:.0f} °C vs 155 · runaway margin {t['margin']:.0f} K vs 25")
    if klass and not design:
        alt = []
        for w in (0.032, 0.036):
            ta = thermal(sku, w, losses(d3_magnetic(c3, d["cellLm"], w), operating_point(d["fq"], [("P", d["Ip"], 0.0), ("S1", d["Ih"], math.pi), ("S2", d["Ih"], math.pi)], 100), 100)[0])
            alt.append(f"{w * 1e3:.0f} mm band {ta['T55']:.0f} °C")
        detail += (f" → the design line is exceeded only under MKF's copper; the class lines hold. First article decides (short-circuit R and the bonded thermal type test); "
                   f"a wider foil band restores the line under MKF copper: {' · '.join(alt)} (the side margins shrink — an insulation-coordination change)")
        v["watch"] = True
    row("ok" if klass and design else "info" if klass else "FAIL", "MKF-THERMAL", f"{sku} D3 cell with MKF copper ×{t['k']:.2f} in the magnetics-envelope network", detail)

    winding = {"name": "L", "numberTurns": c2["N"], "numberParallels": 1, "isolationSide": "primary", "wire": litz(c2["strands"], c2["dS"])}
    v["d2GapMm"], v["d2GapSegments"] = gap_check("D2 L", sku, c2["n"], c2["N"], c2["Lnom"], 0.03, 1.0e-3, winding)
    c2c, _ = core(c2["n"], drawn_gap(c2["n"], c2["N"], c2["Lnom"]), 1.0e-3)
    w2 = quiet(P.wind, {"bobbin": P.create_simple_bobbin_from_core_with_custom_thickness(c2c, 4.2e-3), "functionalDescription": [winding]}, 1, [1.0], [0], [[0.0, 0.0]])
    r2 = P.calculate_dc_resistance_per_winding(w2, 25)[0]
    row("ok" if abs(r2 / d["rdc2"] - 1) <= 0.05 else "FAIL", "MKF-RDC", f"{sku} D2 Rdc @25 °C from MKF's turn layout",
        f"{r2 * 1e3:.2f} vs {d['rdc2'] * 1e3:.2f} mΩ ({(r2 / d['rdc2'] - 1) * 100:+.1f} %) — acceptance ±5 %")
    t2, p2 = losses({"core": c2c, "coil": w2}, operating_point(d["fq"], [("L", d["Ip"], 0.0)], 100), 100)
    row("info", "MKF-CU", f"{sku} D2 copper at {d['d2corner']} {d['fq'] / 1e3:.1f} kHz, 100 °C",
        f"MKF {t2:.1f} W ({p2[0][1]:.1f} ohmic + {p2[0][2]:.1f} skin + {p2[0][3]:.1f} prox) vs Sullivan {d['d2cu']:.1f} W → ×{t2 / d['d2cu']:.2f} — the gate's D2 copper is the conservative figure")
    values[sku] = v

row("info", "MKF-LEAK", "leakage is not taken from MKF 1.4.0",
    "foil and rectangular turns return 90–170 µH per D3 cell and the value rises with foil height (physically it falls); litz stand-ins give 1–2 µH. "
    "The 1-D S1–P–S2 figure (0.09–0.17 µH) and the first-article leakage measurement stand")

os.makedirs(os.path.join(ROOT, "calculations", "out", "evidence"), exist_ok=True)
with open(os.path.join(ROOT, "calculations", "out", "evidence", "mkf-crosscheck.json"), "w") as fh:
    json.dump({"gate": "mkf-crosscheck", "exit": 1 if fails else 0, "rows": rows, "values": values}, fh, indent=1, ensure_ascii=False)
    fh.write("\n")
print(f"\n{fails} MKF CROSS-CHECK FAILURE(S)" if fails else
      "\nMKF CROSS-CHECK CLEAN — winding geometry agrees within 5 %, every D3 cell keeps its class lines at MKF's copper, and the gap guides are fringing-corrected")
sys.exit(1 if fails else 0)
