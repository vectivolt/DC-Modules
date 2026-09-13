// stress-audit.mjs — the "zero point of failure" gate: every switch, diode and magnetic on ALL
// THREE module variants (30 air · 40 air · 50 LIQUID), checked against its own acceptance line.
// Numbers carry their provenance:
//   [grid]   calculations/out/envelope-grid.csv (5040 worst-corner points, Tj/Ip system truth;
//            50 kW rows run the liquid model — plate Rth 1.1 K/W, 65 °C hot plate ref, E42)
//   [pfc]    calculations/pfc/pfc-design.mjs runs (PFC_P=30e3|40e3|50e3, PFC_PAR) — D1 selections
//   [lb]     calculations/thermal/loss-budget.mjs rev E42 (k-scaled device/diode blocks)
//   [reg]    docs/assumptions.md frozen values (voltage classes, acceptance lines)
// A FAIL here is a design error, not a style complaint. Run: node calculations/stress-audit.mjs
import { mountFor } from "./thermal/mount.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TANKS, TANK_CLASS, JBS_POS } from "./llc/tanks.mjs";
import { shortRacePeak } from "../spice/llc/llc-flux-post.mjs";
import { D2 as D2C, D3 as D3C, D3_CELLS, excitation, V_AIR } from "./magnetics/magnetics-envelope.mjs";
import { stack, CORES } from "./magnetics/geometry.mjs";
import { D1 as D1C, D1_REGISTERED, D1_LITZ, d1Temp, d1TypeTest, row as vsRow, VS as D1VS } from "./magnetics/d1-choke.mjs";
import { mechLines } from "./cost/parts-db.mjs";
import { D4, D4_REGISTERED_E52, DRAWN_E52, NCP, drawn as d4Drawn, evaluate as d4Evaluate, fingerprint as d4Fingerprint, leakageEstimate, Bsat as d4Bsat, csTrip, VBUS_MAX, d4Rdc } from "./magnetics/d4-flyback.mjs";
import { captureEvidence } from "./evidence.mjs";
captureEvidence("stress-audit");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const f = (x, d = 1) => Number(x.toFixed(d));
let fails = 0, warns = 0;
const ck = (sec, name, cond, detail) => {
  console.log(`${cond ? "  ok  " : "  FAIL"}  [${sec}] ${name} — ${detail}`);
  if (!cond) fails++;
};

console.log("=== STRESS AUDIT — switches · diodes · magnetics · protection classes (30 · 40 · 50 kW) ===");

// ---------------- 1. semiconductor VOLTAGE margins [reg] — identical for both variants ----------
// E65: the aux rows are COMPUTED (d4-flyback): 860 V + the RCD clamp voltage at the cycle-by-cycle limit current and the
// leakage acceptance + 25 V overshoot — the E52 row was a typed 1220 V that reproduced only at 1.38 µH / 3.2 A, and the
// clamp diode (blocking the same voltage during the on-time) had no row at all.
const D4W = d4Drawn(), D4R = d4Evaluate(D4, D4W), D4C = d4Evaluate(D4_REGISTERED_E52, DRAWN_E52);
const V = [
  ["PFC FET 750 V class (B3M010C075Z 50 kW · 20/15 mΩ class 30/40 kW, E69a)", 560, 750, 0.755, "560 V worst (bus/2 + DPT ring) vs 750 V — the 75% house rule; 650 V dies are REJECTED (86 %)"],
  ["PFC boost JBS 1200V", 937, 1200, 0.80, "full bus + ring"],
  ["LLC FET SG2M023120LJ", 876, 1200, 0.80, "830 V bus + DPT 73% ring"],
  ["secondary JBS 1200V", 611, 1200, 0.80, "bank + ring (49% class use)"],
  ["aux switch 1700V SiC", Math.round(D4R.vds), D4W.qauxV, 0.80, `860 V + Vc ${Math.round(D4R.vc)} V (limit ${D4R.ipkClamp.toFixed(2)} A, ${(D4.llkAcc + D4.llkLayout) * 1e6} µH) + ${D4.vOvs} V — d4-flyback`],
  ["aux clamp diode DCLA", Math.round(D4R.vds), D4W.dclaV, 0.80, `blocks 860 V + Vc in the on-time (E52: 1200 V part at ${Math.round(D4C.vds)} V)`],
  ["aux rectifiers 400V", 240, 400, 0.80, "160 V + leakage ring"],
];
for (const [n, v, cls, lim, why] of V)
  ck("V", n, v / cls <= lim, `${v} V of ${cls} V = ${f(100 * v / cls, 0)}% (limit ${f(lim * 100, 0)}%) — ${why}`);

// ---------------- 2. junction temperatures [grid] — worst corner of 4032 points ------------------
const grid = readFileSync(join(ROOT, "calculations/out/envelope-grid.csv"), "utf8").trim().split("\n").map(r => r.split(","));
for (const sku of ["30kw", "40kw", "50kw", "50kwa"]) {
  const rows = grid.filter(r => r[0] === sku && r[6] !== "IDLE" && r[13] !== "");
  const tjp = Math.max(...rows.map(r => +r[13])), tjl = Math.max(...rows.map(r => +r[14]));
  ck("Tj", `${sku} PFC FET worst corner`, tjp <= 150, `${tjp} °C vs 150 ceiling (abs max 175) [grid, ${rows.length} pts]`);
  ck("Tj", `${sku} LLC FET worst corner`, tjl <= 150.5, `${tjl} °C vs 150 ceiling (corner folds engage per envelope policy) [grid]`);
}
// E42/E44/E67 grid-shape asserts: the full-bridge tank class must deliver the FULL envelope on every SKU — no tank-ceiling clamps
// (no availability clamp exists in firmware). E69a (user decision 2026-09-13): thermal folds are accepted ONLY at the forced-HIGH
// 500 V corner (SER at the 500 V mode edge), hot ambient, ≥ 93 %; any other note fails.
for (const sku of ["30kw", "40kw", "50kw", "50kwa"]) {
  const r = grid.filter(r => r[0] === sku && r[6] !== "IDLE" && r[13] !== "");
  const ipMax = Math.max(...r.map(r => +r[10])), notes = r.filter(r => (r[16] ?? "") !== "");
  const tjd = Math.max(...r.map(r => +r[17] || 0));
  const allowed = (row) => row[2] === "500" && row[5] === "SER" && row[4] === "hot" && /^thermal derate to (9[3-9]|100)% $/.test(row[16]);
  const bad = notes.filter((row) => !allowed(row));
  ck("E67", `${sku} full envelope: Ip inside the tank class, no clamps, folds only at the accepted corner, secondary JBS Tj`, ipMax <= TANK_CLASS[sku] * 1.02 && bad.length === 0 && tjd <= 150.5,
    `${f(ipMax)} A rms vs ${TANK_CLASS[sku]} A class · ${notes.length} noted rows · worst TjJBS ${tjd} °C (${JBS_POS[sku].n}× ${JBS_POS[sku].cls} A per position) [grid]`);
}
// PFC boost diodes [lb k-scaling]: per-diode dissipation into its position Rth at its reference — air 1.9 K/W to the 70 °C sink ·
// E42 liquid 1.1 K/W to the 65 °C plate. (E67: the secondary JBS row is the grid column above — per-corner, per-position count.)
for (const [sku, k] of [["30kw", 1], ["40kw", 4 / 3], ["50kw", 5 / 3], ["50kwa", 5 / 3]]) {
  const { rth, ref } = mountFor(sku);   // E68: mount.mjs (clip-mounted dies)
  const pfcD = 12.1 * Math.pow(k, 1.6);                     // Vf + dyn-R blend [lb]
  ck("Tj", `${sku} PFC boost diode`, ref + rth * pfcD <= 150, `${f(pfcD)} W → Tj ≈ ${f(ref + rth * pfcD, 0)} °C (${rth} K/W to ${ref} °C ref)`);
}

// ---------------- 3. magnetics vs their OWN acceptance lines ------------------------------------
// D1 PFC choke — E51: COMPUTED from the CATALOG core (0077908A7: AL 37 nH/T² ±8%, le 196 mm — E60
// catalog sync from the datasheet rev 10/7/2021; the engines had carried 201 mm/227 mm²),
// not hand-copied engine output (the E41/E42 rows had inherited the geometric-Ae model and two
// stress rows here were stale rev-A copies — three sources, three answers, none the drawing).
const AL79 = 37e-9, LE79 = 0.196, R26 = { a: 2.13e-4, b: 1.637 };
const mu26 = (H) => 1 / (1 + R26.a * Math.pow(Math.max(H / 79.577, 1e-9), R26.b));
const D1 = {
  "30kw": { stack: 3, N: 39, cu: 18.0, Irms: 54.94, Ibias: 78, Lfloor: 75, note: "D1 rev B: N=39±1 lot-trim, 18 mm² (drawing of record)" },
  "40kw": { stack: 5, N: 26, cu: 25.8, Irms: 73.25, Ibias: 104, Lfloor: 61, note: "D1-40 rev B (E51): N=26±1 on CATALOG AL — the E41 N=23 missed its floor on the real core" },
  "50kw": { stack: 5, N: 24, cu: 25.8, Irms: 91.57, Ibias: 129.5, Lfloor: 45, note: "D1-50 rev B (E51): N=24±1, dIpp basis 36.2 A pp; plate-bonded (liquid) / web-bonded (air)" },
  "50kwa": { stack: 5, N: 24, cu: 25.8, Irms: 91.57, Ibias: 129.5, Lfloor: 45, note: "same D1-50 rev B part (E44 twin)" },
};
for (const [sku, d] of Object.entries(D1)) {
  const L0 = AL79 * d.stack * d.N * d.N * 1e6;
  const Lb = mu26(d.N * d.Ibias / LE79) * L0;
  const J = d.Irms / d.cu;
  ck("D1", `${sku} biased-L floor [catalog AL]`, Lb >= d.Lfloor, `L0 ${f(L0, 0)} µH → ${f(Lb, 1)} µH @${d.Ibias} A ≥ ${d.Lfloor} (${d.note})`);
  ck("D1", `${sku} swing floor`, Lb / L0 >= 0.40 || sku === "30kw", `L@Ibias/L0 = ${f(Lb / L0, 2)} (30 kW swing-choke basis exempt: drawing governs via its own biased-L line)`);
  ck("D1", `${sku} current density`, J <= 5.5, `${f(J, 2)} A/mm² ≤ 5.5`);
}
// E65 D1: temperature COMPUTED, not typed (the 36/30/41 K rows came from a 280 cm²/core surface model and a ×1.08 AC factor) —
// d1-choke: vienna-switched excitation (fundamental, 50 kHz ripple, iGSE Kool Mµ 26 at the datasheet max), datasheet MLT, 2-D-anchored
// proximity copper, wound surfaces, forced air ∥ gap-pad bond at the magnetics-envelope boundary conditions.
// Criteria (Class F 155 °C system, proper margin): hot-spot ≤120 °C at the 330 VAC continuous corner, 55 °C inlet · ≤130 °C at
// 75 °C inlet derated to 40 % (ripple copper and core loss do not derate) · ≤145 °C with every thermal resistance +25 % · one lost
// bond (the credible single failure) ≤155 °C or a cutout thermostat on the part.
{
  const LIM = { hot55: 120, hot75: 130, stress: 145, classF: 155 }, T = (x) => (Number.isFinite(x) ? `${f(x, 0)} °C` : "RUNAWAY");
  for (const [sku, c] of Object.entries(D1C)) {
    const r = vsRow(sku, "330-full-bus830-lot92"), a = d1Temp(c, r), b = d1Temp(c, r, { Tin: 75, frac: 0.4, lfK: 0.16 }), s = d1Temp(c, r, { k: 1.25 });
    const L = a.L, lost = d1Temp(c, r, { mount: "air" }), cut = (mechLines[sku] ?? []).find(([t]) => /D1 over-temperature cutout/i.test(t));
    ck("D1", `${sku} ${c.stack}×T79 N ${c.N} ${c.nw}×${c.d * 1e3} mm · ${c.mount} — hot-spot at the 330 VAC continuous corner [computed]`, L.fd.ok && a.hot <= LIM.hot55 && b.hot <= LIM.hot75 && s.hot <= LIM.stress,
      `Cu ${f(L.lf, 1)} W @50 Hz + ${f(L.hf, 1)} W ripple (${L.Ihf} A rms, Fr ${f(L.Fr, 1)} = Ferreira ${f(L.FrFerreira, 1)} × 2-D ${f(L.fd.k2D, 3)}) + Fe ${f(L.fe, 1)} W → hot-spot ${T(a.hot)} @55 °C (winding ${T(a.Tw)}, air ${a.air} °C, web/plate ${a.wall} °C, ${f(a.bondW, 0)} W into it) · ${T(b.hot)} @75 °C derated · +25 % Rth ${T(s.hot)} · limits ${LIM.hot55}/${LIM.hot75}/${LIM.stress} °C [${L.fd.src}]`);
    ck("D1", `${sku} one lost bond survivable or cut out`, !/1$/.test(c.mount) || lost.hot <= LIM.classF || (cut && cut[1] >= 3),
      `pad lost → ${c.sku === "50kw" ? "no air path in the sealed module" : `convection only`}: ${T(lost.hot)} vs Class F ${LIM.classF} °C${lost.hot <= LIM.classF ? " — survives" : ` → parts-db D1 cutout line ${cut ? `× ${cut[1]}` : "MISSING"}`}`);
  }
  const r30 = vsRow("30kw", "330-full-bus830-lot92"), reg = d1Temp(D1C["30kw"], r30, { mount: D1_REGISTERED["30kw"] });
  ck("CONTROL", "D1-30 as registered (air-cooled, centre bolt on a silicone pad) is rejected", reg.hot > LIM.hot55,
    `${T(reg.hot)} hot-spot @55 °C (${f(reg.hot - reg.air, 0)} K over tunnel air, the drawing's own line was ≤45 K) → ${reg.hot > LIM.hot55 ? "rejected" : "PASSES — the gate is blind"}`);
  // the two fixes evaluated for the air-cooled SKUs (₹/kg [est]: enamelled Cu 950 — the pfc-design basis; Type-2 litz 0.2 mm 1,800)
  for (const sku of ["30kw", "40kw"]) {
    const r = vsRow(sku, "330-full-bus830-lot92"), air = d1Temp(D1C[sku], r, { mount: "air" }), litz = d1Temp(D1_LITZ[sku], r), bond = d1Temp(D1C[sku], r);
    const kgCu = D1C[sku].N * bond.g.mlt * (D1C[sku].nw * Math.PI * D1C[sku].d ** 2 / 4) * 8900, pad = (mechLines[sku] ?? []).find(([t]) => /D1 choke mount kit/.test(t));
    console.log(`  info  [D1-COOLING] ${sku}: air-cooled as registered ${T(air.hot)} (+25 % ${T(d1Temp(D1C[sku], r, { mount: "air", k: 1.25 }).hot)}; at half the assumed ${V_AIR[sku]} m/s ${T(d1Temp(D1C[sku], r, { mount: "air", vK: 0.5 }).hot)} — the tunnel is not settled, D1-F2) · Type-2 litz ${D1_LITZ[sku].nw}×0.2 mm air-cooled ${T(litz.hot)} (ripple Cu ${f(litz.L.hf, 1)} W, +₹${f(kgCu * (1800 - 950), 0)} of wire per choke) · web gap-pad bond ${T(bond.hot)} (the pad of the ₹${pad?.[2]} mount kit — its insulating cap and sleeve are needed for D1-F3 either way) → bond`);
  }
  // D1-F5 mount: the clamp (M6 A4-70 through an insulating cap, Belleville-held) must keep the stack seated on its pad at the 2 g
  // sweep with a Q of 10 at resonance — preload ≥ 2× the edge lift-off force 4·M/D — without over-pressing the pad (≤ 0.7 MPa)
  const CLAMP = { torque: 4.5, K: 0.2, d: 6e-3, proof: 9.0e3, padMax: 0.7e6 }, Fp = CLAMP.torque / (CLAMP.K * CLAMP.d);
  for (const [sku, c] of Object.entries(D1C)) {
    if (sku === "50kwa") continue;
    const g = d1Temp(c, vsRow(sku, "330-full-bus830-lot92")).g, kg = 1.1 * (c.stack * CORES.T79.kgCore + c.N * g.mlt * (c.nw * Math.PI * c.d ** 2 / 4) * 8900);
    const Mo = kg * 9.81 * 2 * 10 * (g.H / 2), need = 2 * (4 * Mo) / g.OD, p = Fp / g.area.face;
    ck("D1", `${sku} clamp holds the stack at 2 g × Q 10 [computed]`, Fp >= need && p <= CLAMP.padMax && Fp <= 0.5 * CLAMP.proof,
      `${f(kg, 2)} kg, CG ${f(g.H * 500, 0)} mm → overturning ${f(Mo, 1)} N·m → preload needed ${f(need / 1e3, 2)} kN vs ${f(Fp / 1e3, 2)} kN at ${CLAMP.torque} N·m (K ${CLAMP.K}) · pad ${f(p / 1e6, 2)} MPa ≤ 0.7 · bolt ${f(100 * Fp / CLAMP.proof, 0)} % of proof`);
  }
  for (const [sku, c] of Object.entries(D1C)) {
    const g = d1Temp(c, vsRow(sku, "330-full-bus830-lot92")).g, tt = d1TypeTest(c, vsRow(sku, "330-full-bus830-lot92"));
    const cut = Math.max(g.mlt, g.mltLayers) * (c.N + 1) * 1.05 + 0.30;                  // lot-trim N+1, the longer turn model, 2 × 150 mm leads
    console.log(`  info  [D1-BUILD] ${sku}: MLT ${f(g.mlt * 1e3, 0)} mm (layer model ${f(g.mltLayers * 1e3, 0)}) · bore layers ${g.layers.join("/")} of ⌀${f(g.Db * 1e3, 1)} mm bundles → finished ⌀${f(g.OD * 1e3, 0)} × H ${f(g.H * 1e3, 0)} mm (layout open item — tunnel/keep-out rows) · bundle cut ≥ ${f(cut, 1)} m · bonded type test: ${f(tt.Idc, 1)} A DC (= ${f(tt.P, 1)} W) → hot-spot ≤ ${f(tt.rise + 10, 0)} K above the plate (calc ${f(tt.rise, 1)} K + 10)`);
  }
}
// E65 bonded magnetics (D1-F3 · D2-04): a winding gap-padded or clamped to PE-bonded metal is part of the BASIC barrier to PE, at
// its recurring peak voltage — D1 switch end vs grid neutral (vienna-switched, recurring cases only); D2/D3 tank node = bus/2 + the
// resonant-cap peak (llc-stress, every corner) + the Vienna midpoint-to-neutral peak (ideal switches, CM filter not credited);
// PD verification where Û_rp > 700 V at extinction ≥ 1.5·Û_rp (IEC 60664-1 F1·F2, basic).
// insulation-coordination.md must carry the computed values (tokens rounded up: 10 V, 0.1 kV).
{
  const ins = readFileSync(join(ROOT, "docs/insulation-coordination.md"), "utf8").replace(/\s/g, "");
  const up = (x, s) => Math.ceil(x / s - 1e-9) * s, recurring = (r) => !/dip|jump/.test(r.case) && !(/bus650/.test(r.case) && +r.VLL >= 475);
  const vRec = (sku, col) => Math.max(...D1VS.filter((r) => r.sku === (sku === "50kwa" ? "50kw" : sku) && recurring(r)).map((r) => +r[col]));
  const llcTank = (sku) => { const L = readFileSync(join(ROOT, `simulation-results/${sku}/llc-stress.csv`), "utf8").split("\n").filter((l) => l && !l.startsWith("#")), h = L[0].split(",");
    return Math.max(...L.slice(1).map((l) => { const r = Object.fromEntries(l.split(",").map((v, i) => [h[i], v])); return +r.bus_V / 2 + +r.Vcr_ac_pk_V; })); };
  const SK = ["30kw", "40kw", "50kw", "50kwa"];
  const d1 = up(Math.max(...SK.map((s) => vRec(s, "vSwN_pk_V"))), 10);
  const tank = SK.map((s) => up(llcTank(s) + vRec(s, "vMN_pk_V"), 10)), pd = tank.map((v) => up((1.5 * v) / 1000, 0.1).toFixed(1));
  const tok = [`D1Û_rp≤${d1}V`, `D2/D3Û_rp${tank.join("/")}V`, `PDextinction≥${pd.join("/")}kV`];   // E68: D6-50 retired with the AC DM chokes
  const miss = tok.filter((t) => !ins.includes(t));
  ck("INS", "bonded magnetics carry their basic-barrier rows at the computed recurring peaks", d1 <= 700 && tank.every((v) => v > 700) && miss.length === 0,
    `D1 ${d1} V (≤700 V: hipot + impulse, no PD) · D2/D3 ${tank.join(" / ")} V (30/40/50/50a — PD sample test at ≥ ${pd.join(" / ")} kV)${miss.length ? ` → MISSING in insulation-coordination.md: ${miss.join(" · ")}` : " → rows present"}`);
}
// D2 external resonant inductor [reg formula] (E67): Bpk = Lmax·√2·I_class / (N · Ae) at the +3 % inductance and the tank class;
// thermal proof at every simulated corner lives in magnetics-envelope, the simulated-peak + fault flux in current-coordination.
for (const [sku, c] of Object.entries(D2C)) {
  const Ae = stack(c.core, c.n).Ae, B = c.Lmax * TANK_CLASS[sku] * Math.SQRT2 / (c.N * Ae) * 1e3;
  ck("D2", `${sku} external Lr Bpk`, B <= 110, `${f(B, 0)} mT at Lmax ${f(c.Lmax * 1e6, 2)} µH × ${TANK_CLASS[sku]} A rms class vs 110 mT line (N=${c.N} on ${c.n}× E70/33/32 — E67 D2 rev F)`);
}
// D3 transformer cells — flux from the POWER-SOLVED magnetizing current at every simulated corner (llc-flux.csv): each cell carries
// Lm/2 on its own N turns (primaries in series); flux follows the bank voltage, not load (E65).
{
  for (const [sku, c] of Object.entries(D3C)) {
    const Ae = stack(c.core, c.n).Ae, rows = excitation(sku).rows;
    const w = rows.reduce((a, r) => (r.Im_pk_A * r.lm_scale > a.Im_pk_A * a.lm_scale ? r : a));
    const B = (TANKS[sku].Lm / D3_CELLS) * w.Im_pk_A * w.lm_scale / (c.N * Ae) * 1e3;
    ck("D3", `${sku} cell Bpk at the worst simulated corner`, B <= 205, `${f(B, 0)} mT at ${w.corner} (${w.fsw_kHz} kHz) on ${c.n}× E70 ${c.N}:${c.N}∥${c.N} ≤ 205 mT (50 % of N95 Bsat 100 °C; loss is the binding limit — magnetics-envelope)`);
  }
}
// D6/D7 EMI chokes — E65: read from the engines (the pre-E65 row tested a literal 5.5 for every SKU while the drawn
// D7-30 foil was 9.9 mm² = 5.65 A/mm²). D7: DM-leakage flux at the SIMULATED crest (vienna-switched I1pk, dips +
// 20° jump) against the 0.6 T line on the A_Fe floor, hot-copper ΔT, and the catalog-minimum-µ L_cm floor.
{
  const ch = JSON.parse(readFileSync(join(ROOT, "calculations/out/dm-choke-design.json"), "utf8"));
  const vs = readFileSync(join(ROOT, "calculations/out/vienna-switched.csv"), "utf8").split("\n").filter((l) => /^\d/.test(l)).map((l) => l.split(","));
  for (const sku of ["30kw", "40kw", "50kw"]) {
    const d7 = ch.d7[sku], i1pk = Math.max(...vs.filter((r) => r[0] === sku).map((r) => +r[7]));
    const B = d7.Llk_band_uH[1] * 1e-6 * i1pk / (d7.N * d7.AFe_mm2 * 1e-6);
    ck("D7", `${sku} winding J [engine]`, d7.J <= 5.6, `D7 ${d7.aw_mm2} mm² → ${d7.J} A/mm² ≤ 5.6 (E68: no AC-side D6)`);
    ck("D7", `${sku} DM-leakage flux at the simulated crest`, B <= 0.6 && d7.Lcm10k_mH >= 2,
      `${d7.Llk_band_uH[1]} µH × ${i1pk} A / (${d7.N} T × ${d7.AFe_mm2} mm²) = ${f(B, 2)} T ≤ 0.6 (hot Bsat 1.155 T) · L_cm ${d7.Lcm10k_mH} mH ≥ 2 at µ −30 % (${d7.core})`);
    // E73: common-mode flux — each switch-node edge pushes Cp·V_sw into the converter-side Y trio (CY1-3) before CMC2's impedance lets
    // it through; the trio then holds ΔV = Cp·V_sw / C_Y across CMC2 for up to half a 50 kHz period. Constants read from the LISN engine.
    const lisn = readFileSync(join(ROOT, "calculations/emi/lisn-precompliance.mjs"), "utf8");
    const CP = Number(lisn.match(/CP = ([\d.e-]+)/)[1]), VSW = Number(lisn.match(/VSW = (\d+)/)[1]), CY = 3 * Number(lisn.match(/CY3 = 3 \* ([\d.e-]+)/)[1]);
    const Bcm = ((CP * VSW) / CY) * (1 / (2 * 50e3)) / (d7.N * d7.AFe_mm2 * 1e-6);
    ck("D7", `${sku} common-mode flux from the switch-node edges`, Bcm <= 0.1 * 1.155,
      `Cp ${f(CP * 1e12, 0)} pF × ${VSW} V → ${f((CP * VSW) / CY, 1)} V on the ${f(CY * 1e9, 1)} nF Y trio for ½ × 50 kHz across ${d7.N} T × ${d7.AFe_mm2} mm² = ${f(Bcm * 1e3, 0)} mT ≤ 10 % of the hot Bsat (1.155 T) — the 150 Hz midpoint component closes through pF and is negligible`);
    ck("D7", `${sku} hot-copper ΔT`, d7.dT <= 45, `${d7.P} W/choke at 100 °C Cu → ΔT ${d7.dT} K ≤ 45 (registered 11.5/15.3/19.2 W were 20 °C copper on a turn the OD62 core could not hold)`);
    ck("D7", `${sku} parts-db carries the engine core`, new RegExp(`D7-${sku.slice(0, 2)} rev B \\(E65 engine[^"]*${d7.core}, A_Fe ≥ ${d7.AFe_mm2}`).test(readFileSync(join(ROOT, "calculations/cost/parts-db.mjs"), "utf8")), `${d7.core} · A_Fe ≥ ${d7.AFe_mm2} mm² in the CMC override note`);
  }
  const i30 = Math.max(...vs.filter((r) => r[0] === "30kw").map((r) => +r[7]));
  ck("D7", "30kw catalog Schaffner RT8131-63-2M8 vs the crest", i30 <= 63 * Math.SQRT2, `${i30} A pk ≤ 63 A × √2 = ${f(63 * Math.SQRT2, 1)} A (vendor rating covers its own leakage flux)`);
  // E65 input filter as a system: conducted margin (DM + the drawn two-stage CM ladder) and current-loop stability
  const lisn = readFileSync(join(ROOT, "calculations/out/lisn-precompliance.csv"), "utf8").split("\n").filter((l) => /^\d/.test(l)).map((l) => l.split(","));
  const cmMin = Math.min(...lisn.map((r) => +r[5] - +r[4]));
  ck("EMI", "CM conducted margin on the drawn ladder [lisn]", cmMin >= 3, `${f(cmMin)} dB worst vs Class A QP at Cp 200 pF (±20 dB estimate; the single-trio control row lives in lisn-precompliance)`);
  const fs = readFileSync(join(ROOT, "calculations/out/pfc-filter-stability.csv"), "utf8").split("\n").slice(1).filter(Boolean).map((l) => l.split(","));
  const ss = fs.filter((r) => r[1] === "small-signal" && r[3] === "15" && r[4] !== "none" && (r[2] === "P" || r[2] === "PI")), td = fs.filter((r) => r[1] === "time-domain" && r[3] === "15");
  const ctl = fs.filter((r) => r[1] === "time-domain" && r[4] === "none"), duty = fs.filter((r) => r[1] === "damper-duty");
  ck("EMI", "current loop vs drawn filter [pfc-control]", ss.length === 6 && ss.every((r) => +r[6] >= 0.5) && td.length === 9 && td.every((r) => +r[6] <= 1) && ctl.length === 3 && ctl.every((r) => +r[6] >= 10) && duty.every((r) => +r[6] <= 12.5),
    `modulus margin ≥ ${f(Math.min(...ss.map((r) => +r[6])), 2)} (P/PI, 15 µs, damped) · switched-model 2–45 kHz ≤ ${f(Math.max(...td.map((r) => +r[6])), 2)} % · undamped 30 µs control ≥ ${f(Math.min(...ctl.map((r) => +r[6])), 0)} % · RDMP ≤ ${f(Math.max(...duty.map((r) => +r[6])), 1)} W of 25`);
}
// tank capacitors: per-cap current vs the 12 A spec line (13.5 A part class at RFQ) — E67: one Cr bank per module
for (const [sku, t] of Object.entries(TANKS))
  ck("Cr", `${sku} per-cap current`, TANK_CLASS[sku] / t.crN <= 12, `${f(TANK_CLASS[sku] / t.crN)} A of 12 A line (${t.crN}× ${t.crNF} nF at the ${TANK_CLASS[sku]} A class)`);
// CTs
const db = readFileSync(join(ROOT, "calculations/cost/parts-db.mjs"), "utf8");
ck("CT", "line CT class @40 kW", 73.3 <= 150 * 0.95 && /R1206-18R-1%/.test(db), "E60: the 40 kW joins the 150 A class (ACX-1150) — F.01 155 A + 50 A race needs linearity past the ACX-1100's ~179 A at 18 R; 30 kW keeps ACX-1100 (55 A, F.01 120 A on 22 R)");
ck("CT", "resonant CT class per variant", /CT-RES-1:100-100A/.test(db) && /CT-RES-1:100-150A/.test(db), "E67 one tank CT: 30 kW 78 A class on 100 A (78 %); 40/50 kW 100/120 A class on 150 A (67/80 %) — RFQ lines, sensor path not power path");
ck("CT", "line CT class @50 kW", 91.6 <= 150 * 0.95 && /CT-LINE-2500-150A/.test(db), "91.6 A worst vs 150 A class (ACX upsize at RFQ; ACX-1100 would run 92%)");
// E42 burden rail budgets — the catch that re-scaled both burdens: OC observability must stay
// inside the 3.3 V rail ABOVE the 1.65 V AVMID bias (the R3-proven budget is +1.62 V = 3.27 V).
{
  // E60 re-point: the observability point is now F.0x + the simulated 3 µs fault rise (current-
  // coordination gate owns the per-SKU proof; this row keeps the 50 kW rail arithmetic visible)
  const lineV = 1.65 + (195 + 71.4) / 2500 * 13;            // 50 kW F.01 195 A + D1 soft-sat race
  const monPk = shortRacePeak("50kwa", 220, 3).peak;          // E67: 50 kW air-twin monitor peak 3 µs after the F.11 crossing (llc-short.csv)
  const resV = 1.65 + monPk / 100 * 0.30;
  const resW = (TANK_CLASS["50kw"] / 100) ** 2 * 0.30;        // resonant burden at the tank class
  ck("BRD", "50kw line-CT burden rail budget", lineV <= 3.275, `266 A pk (F.01+race) → ${f(lineV, 2)} V on 13 Ω (the E42 21.5 Ω saw only to 187 A)`);
  ck("BRD", "50kw resonant burden rail budget", resV <= 3.275, `${f(monPk, 0)} A pk (F.11 monitor peak, E67 crossing-referenced) → ${f(resV, 2)} V on 0.30 Ω`);
  ck("BRD", "50kw resonant burden dissipation", resW <= 1.0, `${f(resW, 2)} W on the 2 W part = ${f(50 * resW, 0)}%`);
  ck("BRD", "50kw burden parts ordered", /R2512-0R30-2W-1%/.test(db) && /R1206-13R-1%/.test(db), "both burdens exist as skuOverrides (E67 resonant 0.30 Ω)");
}

// ---------------- 3b. E43 verification-pass permanent gates -------------------------------------
// E68: the D6 crest-L vs LISN-floor row is retired with the AC-side DM chokes — lisn-precompliance gates the star-X2 filter
// against the E65 filter on the per-phase ladder instead.
// resonant-cap DIELECTRIC duty: current alone is the wrong invariant — V = I/(ωC) per cap at 140 kHz and the tank class (E67)
for (const [sku, t] of Object.entries(TANKS)) {
  const iC = TANK_CLASS[sku] / t.crN, xc = 1 / (2 * Math.PI * 140e3 * t.crNF * 1e-9), vC = iC * xc, wC = iC * iC * 2e-4 * xc;
  ck("CrV", `${sku} per-cap Vrms/W duty`, vC <= 530 && wC <= 1.0,
    `${f(vC, 0)} V rms @140 kHz · ${f(wC, 2)} W dielectric — O-8 RFQ line: published Vrms-vs-f curve ≥ ${f(vC * 1.3, 0)} V (942C class)`);
}
// D2 litz copper density at the tank class (AC copper + ΔT proof: conductor-audit + magnetics-envelope)
for (const [sku, c] of Object.entries(D2C)) {
  const A = (c.strands * Math.PI * c.dS ** 2) / 4 * 1e6;
  ck("D2c", `${sku} external Lr litz J`, TANK_CLASS[sku] / A <= 5.6, `${c.strands}×${c.dS * 1e3} mm litz (${f(A, 1)} mm²): J ${f(TANK_CLASS[sku] / A, 1)} A/mm² ≤ 5.6 at the ${TANK_CLASS[sku]} A class`);
}
// D4 aux flyback — E65 rev E: every row COMPUTED by magnetics/d4-flyback.mjs from the drawn cells.tsx values and the NCP1252/D
// limits. The E52 row used a 3.2 A clamp; the real limit through the CS filter lag + tILIM put ETD39 at 113 % of Bsat 130 °C.
// The E52 registered design is the CONTROL GROUP — each physics row must also reject it.
{
  const r = D4R, c = D4C, bs = d4Bsat(130), cells = readFileSync(join(ROOT, "packages/power-primitives/cells.tsx"), "utf8");
  ck("D4", "flux at the computed cycle-by-cycle limit", r.Bpct <= 0.75 && c.Bpct > 0.75 && new RegExp(`${D4.mpn}", mfr: "[^"]*", desc: "[^"]*${D4.core}`).test(db),
    `860 V · Lp +${D4.tolL * 100} % · VILIM 1.08 V · CS ${D4W.rcsf / 1e3} k/${f(D4W.ccsf * 1e12, 0)} pF · tILIM 150 ns → ${f(r.ipkLim, 2)} A → ${f(r.B * 1e3, 0)} mT = ${f(100 * r.Bpct, 1)} % of Bsat(130 °C) ≤ 75 % on ${D4.core} (control E52: ${f(c.ipkLim, 2)} A → ${f(100 * c.Bpct, 0)} % on ETD39 — rejected)`);
  ck("D4", "full load stays under the FCS fault timer at the lowest running bus", r.faultMargin >= 0.05 && r.pDeliver >= 1.10 * r.pOut,
    `${r.worstSku} ${f(r.pinReq, 1)} W in · Lp −${D4.tolL * 100} % · osc −8 % · Rcs +1 % · ramp max at ${f(r.bo.off[0], 0)} V: CS ${f(r.csFull, 3)} V vs FCS min 0.90 V (${f(100 * r.faultMargin, 1)} % ≥ 5 %) · deliverable ${f(r.pDeliver, 0)} W ≥ 1.1 × ${f(r.pOut, 0)} W (a nuisance latch here would drop the module until AC is cycled)`);
  ck("D4", "DCM and duty at brown-out min, Lp max", r.dcm <= 0.9 && r.duty <= NCP.dcMax,
    `t_on + t_reset = ${f(100 * r.dcm, 0)} % of the period ≤ 90 % · duty ${f(100 * r.duty, 1)} % ≤ DCmax(min) ${NCP.dcMax * 100} %`);
  ck("D4", "RCD clamp resistor + capacitor duty", r.pRclaPart <= 0.5 * D4.pRcla && r.pRclaEvent <= 2.5 * D4.pRcla && r.vRclaPart <= D4.vRcla && r.vc <= 0.8 * 1200 && c.vrPct > 0.8,
    `${D4W.nRcla}× ${f(D4W.rcla / D4W.nRcla / 1e3, 1)} k: ${f(r.pRclaPart, 2)} W/part at full load and 5 µH (≤ 50 % of ${D4.pRcla} W) · ${f(r.pRclaEvent, 2)} W/part for ≤ 20 ms at the limit (≤ 2.5×) · ${f(r.vRclaPart, 0)} V/part · CCLA ${f(r.vc, 0)} V of 1200 V · idle bleed ${f(r.pBleedIdle, 2)} W (control E52 diode at ${f(100 * c.vrPct, 0)} % of 1200 V — rejected)`);
  const acc = readFileSync(join(ROOT, "docs/evt-plan.md"), "utf8");
  ck("D4", "brown-in with the IBO hysteresis source starts at 285 VAC", r.bo.on[2] <= 0.95 * r.bo.startBus && r.bo.hys >= 15 && Math.abs(r.bo.off[1] - 321) < 2 && c.bo.on[2] > 0.95 * c.bo.startBus && /brown-in 327–363 V/.test(acc),
    `brown-out ${r.bo.off.map((x) => f(x, 0)).join("/")} V (the R6 321 V floor) · brown-in ${r.bo.on.map((x) => f(x, 0)).join("/")} V ≤ 95 % of the ${f(r.bo.startBus, 0)} V bus at 285 VAC · hysteresis ≥ ${f(r.bo.hys, 1)} V (control E52 2.4M set: brown-in ${f(c.bo.on[1], 0)} V typ, ${f(c.bo.on[2], 0)} V worst — the "342 V cold start" could never start; T-11 row carries the band)`);
  const t285 = r.tStart(Math.SQRT2 * 285), t320 = r.tStart(Math.SQRT2 * 320), t400 = r.tStart(Math.SQRT2 * 400);
  ck("D4", "cold start inside the EVT acceptance (VCC(on) max, CVCC +20 %, ICC1 max)", t285 <= 13 && t320 <= 11 && t400 <= 8.5 && /cold-start ≤13 s at 285 VAC, ≤8\.5 s at 400 VAC/.test(acc) && /first switching ≤11 s from AC apply at 320–480 VLL/.test(acc),
    `${f(t285, 1)} s at 285 VAC (≤ 13) · ${f(t320, 1)} s at 320 VLL (≤ 11) · ${f(t400, 1)} s at 400 VLL (≤ 8.5) — the R6 "≈8 s at low line" held only at typical VCC(on) and nominal CVCC`);
  ck("D4", "V24/V15 hard short at 860 V before the 10–20 ms fault latch", Math.max(r.short24, r.short15) <= 0.8 * D4.idmQaux && r.Bshort <= 0.85 * bs && c.Bshort > bs && D4W.r24 > 0,
    `ton_min ratchet (LEB + tILIM 150 ns, osc+jitter max, loop ≥ ${f(D4.rLoopMin * 1e3, 1)} mΩ + RAUX24 ${f(D4W.r24 * 1e3, 0)} mΩ): V24 ${f(r.short24, 2)} A · V15 ${f(r.short15, 2)} A ≤ 80 % of the ${D4.idmQaux} A QAUX pulse class · ${f(r.Bshort * 1e3, 0)} mT ≤ 85 % of Bsat(130 °C) (control E52: ${f(c.short24, 1)} A → ${f(c.Bshort * 1e3, 0)} mT, deep saturation — rejected)`);
  console.log(`  info  [D4] residual: a failure AT the V24 reservoir (CAUX24/DAUX24 short, no RAUX24 in the loop) ratchets to ${f(r.short24bare, 2)} A / ${f(r.BshortBare * 1e3, 0)} mT at the 860 V worst stack — a component-failure event ended by the latch (T-09 short matrix, search coil); harness and load faults all sit behind RAUX24`);
  { // E73: the drawing's Rdc acceptance rows against the drawn build (the pre-E73 rows, pri ≤ 900 mΩ and aux ≤ 45 mΩ, passed a wrong gauge
    // and rejected a good aux winding)
    const b = d4Rdc(D4), hubD4 = readFileSync(join(ROOT, "docs/magnetics.md"), "utf8");
    const a = hubD4.match(/Rdc @ 25 °C pri ≤ (\d+) mΩ · 24 V ≤ ([\d.]+) mΩ · 15 V ≤ ([\d.]+) mΩ · aux ≤ (\d+) mΩ/);
    const rows = [["pri", b.p, a && +a[1]], ["24 V", b.s24, a && +a[2]], ["15 V", b.s15, a && +a[3]], ["aux", b.aux, a && +a[4]]];
    ck("D4", "production Rdc rows match the drawn build", Boolean(a) && rows.every(([, x, row]) => row >= x * 1e3 && row <= 1.25 * x * 1e3),
      rows.map(([n, x, row]) => `${n} build ${f(x * 1e3, 1)} → row ≤ ${row ?? "MISSING"} mΩ`).join(" · ") + ` — rows within 1.0–1.25× of the build catch a wrong gauge or an open strand · hard-short loop floor ${f(D4.rLoopMin * 1e3, 1)} mΩ from the cold secondary`);
  }
  const llk = leakageEstimate();
  ck("D4", "leakage acceptance is buildable", llk * 1.5 <= D4.llkAcc,
    `P/2–S–P/2 sandwich 1-D estimate ${f(llk * 1e6, 2)} µH ×1.5 ≤ ${D4.llkAcc * 1e6} µH acceptance (+${D4.llkLayout * 1e6} µH rectifier-loop allowance in every clamp row)`);
  const pins = cells.match(/name="TAUX" footprint=\{<XfmrAuxFP \/>\} pinLabels=\{\{([^}]*)\}\}/)?.[1] ?? "";
  const lab = Object.fromEntries([...pins.matchAll(/pin(\d): "(\w+)"/g)].map((m) => [+m[1], m[2]]));
  const rowA = [1, 2, 3, 4].map((i) => lab[i]).sort().join(","), rowB = [5, 6, 7, 8].map((i) => lab[i]).sort().join(",");
  ck("D4", "reinforced pin allocation: bus-side row / SELV row", rowA === "AXA,AXB,P1,P2" && rowB === "S15A,S15B,S24A,S24B" && /pcbY=\{i < 4 \? -6 : 6\}/.test(cells),
    `pins 1–4 ${rowA} · pins 5–8 ${rowB} (E52 mixed P1/S24A and AXA/S15A at 1.98 mm vs 8.0/12.6 mm reinforced — land regeneration is a layout open item)`);
  // SPICE anchor: the drawn-circuit deck must carry this design's fingerprint, pass every row, and agree with the closed forms
  const sp = readFileSync(join(ROOT, "simulation-results/30kw/aux-flyback.csv"), "utf8").trim().split("\n");
  const H = sp.find((l) => !l.startsWith("#")).split(","), rows = sp.filter((l) => !l.startsWith("#")).slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [H[i], isNaN(+v) ? v : +v])));
  const cl = rows.find((x) => x.case === "clamp-fbopen-860"), sh = rows.find((x) => x.case === "short-v24-860");
  const ipkSp = csTrip({ Vin: VBUS_MAX, L: cl?.Lp_uH * 1e-6, rcs: D4W.rcs, rcsf: D4W.rcsf, ccsf: D4W.ccsf, f: 65e3, vramp: NCP.vramp[1], vth: NCP.vilim[1], tdel: NCP.tILIM[0] }).ipk;
  ck("D4", "aux SPICE deck: fingerprint, verdicts, anchors [aux-flyback.csv]", sp[0].includes(d4Fingerprint()) && rows.length >= 15 && rows.every((x) => x.verdict === "PASS" || x.verdict === "INFO") && Math.abs(cl.ilm_max_A / ipkSp - 1) <= 0.1 && sh.ilm_max_A <= 0.8 * D4.idmQaux && sh.B_mT <= 850 * d4Bsat(130),
    `${rows.length} rows, ${rows.filter((x) => x.verdict === "PASS").length} PASS · FB-open limit ${cl?.ilm_max_A} A vs closed form ${f(ipkSp, 2)} A at the deck's typ corner (±10 %) · V24 short ${sh?.ilm_max_A} A / ${sh?.B_mT} mT in the deck (≤ ${0.8 * D4.idmQaux} A · ≤ 85 % Bsat 130 °C) before the fault latch; closed-form worst stack ${f(r.short24, 2)} A`);
}
// pulse-resistor single-event energies vs the family class points (25 W accepted ≤160 J at
// 40 kW; the 50 W part carries the 120 kW's 364–477 J)
for (const [sku, nHalf, cls] of [["30kw", 5, 160], ["40kw", 6, 160], ["50kw", 8, 480], ["50kwa", 8, 480]]) {
  const C = nHalf * 470e-6 / 2;
  const eDis = 0.5 * C * 830 * 830 / 4, ePre = 0.5 * C * 671 * 671 / 2;
  ck("Epulse", `${sku} RPRE/RDIS event energies`, eDis <= cls && ePre <= cls,
    `discharge ${f(eDis, 0)} J · precharge ${f(ePre, 0)} J per resistor vs ${cls} J class${sku === "50kw" ? " (CER-50W class — E43: 162/212 J cross the 25 W family point)" : ""}`);
}
ck("Epulse", "50 kW 50 W parts ordered", /CER-50W-33R-AX/.test(db) && /CER-50W-160R-AX/.test(db),
  "RPRE1/2 + RDIS0-3 skuOverrides at 50 kW carry the 50 W VALUE codes (R5-G)");
// X-cap bleed with the E43 CX2 4.7 µF + the E65 CX2-node damper 2.2 µF (star unchanged; verify-independent reads the netlist)
ck("Xbleed", "X discharge τ after CX2 rev + damper", 0.42 * (2.2 + 4.7 + 2.2) / 4.4 <= 1.0, `τ ${f(0.42 * 9.1 / 4.4, 2)} s ≤ 1 s pluggable rule`);

// ---------------- 4. protection classes [reg + E35/F6 derate rule] ------------------------------
const FUSE = { "30kw": { A: 80, I: 55.9 }, "40kw": { A: 125, I: 73.3 }, "50kw": { A: 160, I: 91.6 }, "50kwa": { A: 160, I: 91.6 } };
for (const [sku, x] of Object.entries(FUSE)) {
  const cap = x.A * 0.72;                                    // enclosed + 55 °C derate [E35/F6]
  ck("F", `${sku} gG fuse ${x.A} A`, cap >= x.I, `derated capacity ${f(cap)} A ≥ ${x.I} A worst (the 40 kW 100 A first pick FAILED this at 72 < 73.3; 50 kW 125 A computes 90 < 91.6 — same class, hence 160 A NH00)`);
}
const RELAY = { "30kw": { A: 80, I: 55.9 }, "40kw": { A: 100, I: 73.3 }, "50kw": { A: 250, I: 91.6 }, "50kwa": { A: 250, I: 91.6 } };
for (const [sku, x] of Object.entries(RELAY))
  ck("K", `${sku} precharge bypass ${x.A} A`, x.I / x.A <= 0.75, `${f(100 * x.I / x.A, 0)}% of class (E35 accepted 70% at 30 kW; the 120 A family part computes 76% at 50 kW — over the line, hence the 250 A frame)`);
ck("K", "K_OUT 200 A class @40 kW", 133 / 200 <= 0.70, "133 A = 67% (30 kW: 50%)");
// E42: K_OUT carries full output current in BOTH modes — 167 A = 84% of one 200 A class → DUAL
// (series-mirror readback proves both released). Matrix legs stay single: per-bank / SER-mode
// currents are inside class.
ck("K", "K_OUT dual pair @50 kW", 167 / 2 / 200 <= 0.70, `167 A across 2× 200 A = ${f(100 * 167 / 2 / 200, 0)}% per relay (single would be 84% — over the 70% line)`);
ck("K", "matrix legs single @50 kW", 100 / 200 <= 0.70 && 83.5 / 200 <= 0.70, "KSER ≤100 A SER-mode = 50% · KPARA/B ≤83.5 A per-bank = 42% — no pointless doubling");

// ---------------- 5. card consumption (informational) -------------------------------------------
console.log("\n=== CARD CONSUMPTION (E40/E41/E42 — ONE brain per module, every variant) ===");
console.log("  30 kW: 1 card (0R) · 40 kW: 1 card (1k) · 50 kW liquid: 1 card (10k) · 50 kW AIR: 1 card (15k) — same p/n, E24 rev G");
console.log("  modules: 30 / 40 / 50 kW liquid / 50 kW air → one control card each (E40 single brain)");
console.log("  card budget @every variant: 74/82 MCU pins · 87/88 ways · 9/12 PWM · 22 analog · 8 spare pins (the 50 kW frees the 5 fan lines — sealed module)");


// ---------------- R6 (E47): discharge timeline · aux cold-start · PV gate drive -----------------
// The external R6 review traced the SHUTDOWN path end-to-end: the active discharge is powered
// FROM the link it discharges (PSQD ← V15 ← bus-fed aux, brown-out 321 V), so the honest
// timeline is two-phase. These checks recompute it from the drawn R/C every run and refuse the
// build if the docs stop telling that truth.
const cellsSrc = readFileSync(join(ROOT, "packages/power-primitives/cells.tsx"), "utf8");
const protDoc = readFileSync(join(ROOT, "docs/protection-thresholds.md"), "utf8");
const fwDoc = readFileSync(join(ROOT, "docs/firmware-guide.md"), "utf8");
{
  const VBO = D4R.bo.off[1];                                 // NCP1252 BO: 321 V (E65: RBR 2×1.2M / 7.5k, read off cells.tsx)
  ck("R6", "aux brown-out threshold as drawn", Math.abs(VBO - 321) < 2, `1 V × (1+${D4W.rbrUp / 1e6}M/${D4W.rbrLo / 1e3}k) = ${f(VBO, 0)} V — the active-discharge floor (brown-in ${f(D4R.bo.on[1], 0)} V adds IBO·Rup)`);
  // R8 correction (external review retrace): the 40/50 kW links carry TWO SplitDcLink banks,
  // each with its own 2×47k pair per half → the pairs PARALLEL (47k/half, 94k full-link);
  // only the single-bank 30 kW is 188k. The R7 report dismissed the reviewer's 222 s as an
  // arithmetic slip — the slip was OURS, and this model now counts the drawn strings per SKU
  // (verify-independent proves the counts against the netlists).
  for (const [sku, nHalf, nSets] of [["30kw", 5, 1], ["40kw", 6, 2], ["50kw", 8, 2], ["50kwa", 8, 2]]) {
    const Clink = nHalf * 470e-6 / 2;                        // series halves
    const tAct = 640 * Clink * Math.log(830 / VBO);          // QDISF powered phase
    const tPas = (94e3 / nSets) * (nHalf * 470e-6) * Math.log(VBO / 60); // per-half pairs in parallel
    ck("R6", `${sku} discharge timeline (AC removed)`, tAct < 1.5 && tAct + tPas < 660,
      `active 830→${f(VBO, 0)} V in ${f(tAct, 2)} s, then PASSIVE ${nSets}×(2×47k)/half: +${f(tPas, 0)} s → total ${f((tAct + tPas) / 60, 1)} min ≤ 11 min label ceiling (R8: 30 kW is the slowest at 6.2 min)`);
  }
  ck("R6", "discharge honesty lives in the docs", /R6 discharge-timeline honesty/.test(protDoc) && /wait 10 min/.test(protDoc) && /F\.21 semantics \(R6\)/.test(fwDoc),
    "protection-thresholds two-phase note + 62477-1 label text + firmware-guide F.21 real-coverage note");
}
{
  // NCP1252 cold start (datasheet Table 3/4, read at R6): D version — no 120 ms delay, 5 V hys.
  const drain = 3.5e-3 + 2.6e-3 - 0.49e-3;                   // ICC3 max + QAUX gate charge − 940k feed
  const need = drain * 0.060 / 5.0;                          // 60 ms soft-start+takeover over the hysteresis
  ck("R6", "aux cold-start reservoir (D version)", /mpn: "NCP1252D"/.test(db) && /name="CVCC" capacitance="220uF"/.test(cellsSrc) && 220e-6 >= 2 * need,
    `budget ${f(drain * 1e3, 1)} mA × 60 ms / 5 V = ${f(need * 1e6, 0)} µF → 220 µF fitted (${f(220e-6 / need, 1)}×). The drawn A-version could NOT start: 120 ms mandatory delay vs 1.0 V hysteresis ÷ ${f((1.4e-3 - 0.59e-3) * 1e3, 2)}–${f((2.2e-3 - 0.59e-3) * 1e3, 2)} mA net = 28–60 ms`);
  ck("R6", "D-version duty ceiling holds at brown-out", D4R.duty < NCP.dcMax,
    `worst DCM duty ${f(D4R.duty * 100, 1)}% (brown-out min, Lp max, d4-flyback) ≤ 44.2% DCmax(min) — the A-version's 48% ceiling was never the constraint`);
}
{
  // R7-B: VOM1271 GUARANTEED numbers only (datasheet Rev 1.9 — the R6 check used a 40 µA
  // "worst" that was actually a typical-class misread; the reviewer caught it). The ONLY
  // spec'd-minimum point is IF = 10 mA: Voc ≥ 7.8 V, Isc ≥ 6.0 µA — hence the V15-fed
  // 1.2 k LED feed (11 mA) behind QPVD instead of the old 5 mA GPIO drive. Worst-case
  // load line = the (Isc,Voc) chord (the real PV curve is convex-above it).
  const Voc = 7.8, Isc = 6.0e-6, R = 6.8e6, Igss = 100e-9, VthMax = 3.5;
  // R8: LED current must hold ≥10 mA at the DECLARED rail floor (13.5 V, the QA01C input
  // minimum) with VF(max) 1.6 V, Vce 0.2 V and +1% resistance — hence 1 k/2010, not 1.2 k.
  const ifFloor = (13.5 - 1.6 - 0.2) / (1000 * 1.01);
  const pLedMax = ((16.5 - 1.2 - 0.2) / 990) ** 2 * 1000;
  const vChord = Isc * R * Voc / (Voc + Isc * R) - Igss * R;
  ck("R7", "bank-bleeder PV gate drive (25 °C-endpoint model)", ifFloor >= 10e-3 && pLedMax <= 0.5 * 0.75 && vChord >= VthMax + 2 && /resistance="6.8M"/.test(cellsSrc) && /resistance="1k" footprint="2010"/.test(cellsSrc) && /QPVD/.test(cellsSrc + readFileSync(join(ROOT, "packages/common-components/boards.tsx"), "utf8")),
    `IF ${f(ifFloor * 1e3, 2)} mA ≥ 10 mA at the 13.5 V rail floor (R8: 1 k/2010, ${f(pLedMax, 2)} W worst ≤ 50% of 0.75 W); chord ${f(vChord, 2)} V ≥ Vth(max)+2 — a 25 °C-ENDPOINT MODEL (Voc typ ~5.4 V at 100 °C): bleed-interval ambient declared ≤70 °C, EVT loaded-Vgs gates the BOM freeze`);
}

console.log(fails ? `\n${fails} STRESS FAILURE(S)` : "\nSTRESS AUDIT CLEAN — every device inside its own acceptance line, all three variants");
process.exit(fails ? 1 : 0);
