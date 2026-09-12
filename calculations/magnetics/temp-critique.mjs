// temp-critique.mjs — E58 standing gate: INDEPENDENT temperature-behaviour critique of every
// ferrite magnetic (D2/D3/D4) + the sendust fault chain (D1), against the digitized Ferroxcube
// 3C95 datasheet surfaces (upb-lea/materialdatabase — see tempdata-3c95.json provenance; PC95/
// DMR95 are the same material class the drawings specify). The A3/A4 design fits are temperature-
// BLIND; this gate answers the questions they cannot:
//   · hot-corner THERMAL RUNAWAY: ferrite loss has a minimum near 60–80 °C and rises above it —
//     loop gain g = Rth · (dP_fe/dT + dP_cu/dT) must stay < 0.7 at the 130 °C hot-corner core
//   · COLD (−25 °C) loss uplift and the cold equilibrium (stable by the negative slope below
//     the minimum — quantified, not assumed)
//   · SATURATION vs temperature: Bsat(25 °C)=499 mT → Bsat(100 °C)=401 mT (measured curves;
//     the digitized T labels were inverted and are corrected by a physics check) — margins for
//     D3 volt-second flux, D2 envelope + OC-transient flux, and the D4 clamp point at Lp+10 %
//   · D1 FAULT di/dt chain: catalog-AL soft-saturation from the OC threshold to the CT
//     observability ceiling inside the HRTIMER kill budget (R6-C/R8 window, now computed)
//   · Lm gap-dominance: amplitude-permeability swing must not move Lm > ±3 % (bins/MC budget)
// Run: node calculations/magnetics/temp-critique.mjs        (in run-all after stress-audit)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const D = JSON.parse(readFileSync(join(HERE, "tempdata-3c95.json"), "utf8"));
for (const grp of [D.pvT, D.pvB, D.muAmp]) for (const k of Object.keys(grp)) {
  if (!Array.isArray(grp[k])) continue;
  grp[k] = grp[k].filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0]);   // dedupe (thinning kept the last point twice)
}
const f2 = (x, d = 2) => Number(x.toFixed(d));
let fails = 0;
const ck = (sec, name, cond, detail) => {
  console.log(`${cond ? "  ok  " : "  FAIL"}  [${sec}] ${name} — ${detail}`);
  if (!cond) fails++;
};
const interp = (pts, x) => {
  if (x <= pts[0][0]) { const [[x0, y0], [x1, y1]] = pts; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  for (let i = 1; i < pts.length; i++) if (pts[i][0] >= x) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  const [x0, y0] = pts[pts.length - 2], [x1, y1] = pts[pts.length - 1];
  return y0 + (y1 - y0) * (x - x0) / (x1 - x0);   // linear extrapolation beyond the digitized range
};
// base surface: pv(T) at 100 kHz / 100 mT; Steinmetz scaling (A4 exponents) carries (f, B)
const base = D.pvT["100k_100mT"];
const FE = 1.71, BE = 2.9;
const pv = (f, B, T) => interp(base, T) * Math.pow(f / 100e3, FE) * Math.pow(B / 0.1, BE); // W/m3
const dpvdT = (f, B, T) => (pv(f, B, T + 5) - pv(f, B, T - 5)) / 10;
// scaling-model validation against the OTHER three digitized series (independent of the fit)
{
  let worst = 0, worstK = "";
  for (const [k, pts] of Object.entries(D.pvT)) {
    if (k === "100k_100mT") continue;
    const [fk, bm] = k.split("_"); const f = Number(fk) * 1e3, B = Number(bm) / 1e3;
    for (const T of [25, 60, 100]) {
      const dev = Math.abs(pv(f, B, T) / interp(pts, T) - 1);
      if (dev > worst) { worst = dev; worstK = `${k}@${T}C`; }
    }
  }
  ck("MODEL", "Steinmetz (f,B) scaling vs the 3 independent digitized series", worst <= 0.35,
    `worst deviation ${f2(worst * 100, 0)}% at ${worstK} (≤35% band — the gate margins below absorb it; A4 stays the conservative design fit)`);
}
const Bsat = (T) => 0.499 + (0.401 - 0.499) / 75 * (T - 25);   // measured 25/100 °C, linear
console.log(`=== MAGNETICS TEMPERATURE CRITIQUE (E58) — 3C95 measured surfaces; Bsat(130 °C) = ${f2(Bsat(130) * 1e3, 0)} mT ===`);

// ---- ferrite op-set: {f, B̂, Ve[m3], Pfe_design(A4 basis)W, Pcu W, Rth K/W (ΔTspec/Ptot), hot core °C}
const PARTS = [
  { n: "D3-30 (3×PQ50 7:7:7)", f: 140e3, B: 0.1076, Ve: 111.3e-6, PfeA4: 13.0, Pcu: 8.4, Rth: 2.57, Thot: 130 },
  { n: "D3-40 (2×E70 6:6:6)", f: 140e3, B: 0.0904, Ve: 204e-6, PfeA4: 14.4, Pcu: 19.9, Rth: 1.60, Thot: 130 },
  { n: "D3-50 (2×E70 5:5:5)", f: 140e3, B: 0.1085, Ve: 204e-6, PfeA4: 24.4, Pcu: 20.7, Rth: 1.22, Thot: 130 },
  { n: "D2-30 (bin-max, env worst)", f: 140e3, B: 0.100, Ve: 74.2e-6, PfeA4: 6.8, Pcu: 2.9, Rth: 3.70, Thot: 115 },
  { n: "D2-40", f: 140e3, B: 0.093, Ve: 74.2e-6, PfeA4: 5.7, Pcu: 3.7, Rth: 3.68, Thot: 115 },
  { n: "D2-50", f: 140e3, B: 0.083, Ve: 74.2e-6, PfeA4: 4.1, Pcu: 4.6, Rth: 3.37, Thot: 115 },
  { n: "D4 (ETD39 DCM amp)", f: 65e3, B: 0.1165, Ve: 11.5e-6, PfeA4: 0.6, Pcu: 1.8, Rth: 12.0, Thot: 120 },
];
// Core flux is VOLT-SECOND driven — Fe persists at FULL value even when the module derates,
// while Cu falls with load². The two real hot corners are therefore:
//   (a) 55 °C ambient, 100 % load (full Cu + full Fe — the rated corner)
//   (b) 75 °C ambient, 40 % load (derating curve floor: Cu ×0.16, Fe full)
// For each: solve the thermal EQUILIBRIUM with the measured pv(T), then measure the distance to
// the true runaway threshold T_crit where loop gain g(T) = Rth·dP/dT reaches 1.
const solveEq = (p, amb, cuFrac) => {
  let T = amb + 30;
  for (let i = 0; i < 80; i++) T = amb + p.Rth * (pv(p.f, p.B, T) * p.Ve + p.Pcu * cuFrac * (1 + 0.00393 * (T - 100)));
  return T;
};
const gAt = (p, T, cuFrac) => p.Rth * (dpvdT(p.f, p.B, T) * p.Ve + p.Pcu * cuFrac * 0.00393);
const tCrit = (p, cuFrac) => { let T = 60; while (T < 200 && gAt(p, T, cuFrac) < 1) T += 1; return T; };
for (const p of PARTS) {
  const fe100 = pv(p.f, p.B, 100) * p.Ve, feM25 = pv(p.f, p.B, -25) * p.Ve;
  const eqA = solveEq(p, 55, 1), eqB = solveEq(p, 75, 0.16);
  const eq = Math.max(eqA, eqB), cu = eqA >= eqB ? 1 : 0.16;
  const g = gAt(p, eq, cu), Tc = tCrit(p, cu);
  ck("RUNAWAY", p.n, eq <= 120 && g <= 0.6 && Tc - eq >= 25,
    `hot equilibria ${f2(eqA, 0)} °C (55 amb/full) · ${f2(eqB, 0)} °C (75 amb/derated); worst g(T_eq) = ${f2(g)} ≤ 0.6; runaway threshold T_crit(g=1) ${Tc >= 200 ? "≥200 (search cap)" : Tc} °C — margin ${f2(Tc - eq, 0)} K ≥ 25 (measured pv(T); Fe is volt-second-pinned so it does NOT derate with load — this is why the ΔT acceptance line caps the winder's Rth)`);
  ck("A4-CONSERVATIVE", p.n, fe100 <= p.PfeA4 * 1.10,
    `measured-basis Fe @100 °C = ${f2(fe100, 1)} W vs A4 design ${p.PfeA4} W (design fit must not understate by >10%)`);
  // cold: equilibrium at −25 °C ambient (fixed point; slope below the minimum is negative → stable)
  const Tcold = solveEq(p, -25, 1);
  ck("COLD", p.n, feM25 <= 2.2 * fe100 && Tcold < 120,
    `Fe(−25 °C) = ${f2(feM25, 1)} W = ${f2(feM25 / fe100, 2)}× the 100 °C basis; cold equilibrium core ${f2(Tcold, 0)} °C at full load (stable — loss slope negative below the ~80 °C minimum, so cold start SELF-WARMS toward the minimum)`);
}
// ---- saturation margins vs temperature ----
ck("BSAT", "D3 volt-second flux at 130 °C core", 0.1085 <= 0.35 * Bsat(130),
  `worst B̂ 108.5 mT ≤ 35% of Bsat(130 °C)=${f2(Bsat(130) * 1e3, 0)} mT (${f2(100 * 0.1085 / Bsat(130), 0)}%) — loss-limited, never sat-limited`);
ck("BSAT", "D2 OC-transient flux (bin-max L × 95 A pk)", (4.35e-6 * 95) / (4 * 656e-6) <= 0.6 * Bsat(130),
  `${f2((4.35e-6 * 95) / (4 * 656e-6) * 1e3, 0)} mT at the tank OC point vs 60% of Bsat(130) = ${f2(0.6 * Bsat(130) * 1e3, 0)} mT — µs–ms event, trip-limited (F.11)`);
ck("BSAT", "D4 clamp point at Lp+10%, 130 °C", 0.256 <= 0.75 * Bsat(130),
  `256 mT vs 75% of Bsat(130)=${f2(0.75 * Bsat(130) * 1e3, 0)} mT (${f2(100 * 0.256 / Bsat(130), 0)}% absolute) — the E52 ETD39 margin HOLDS at temperature (the ETD34 rev C would sit at ${f2(100 * 0.329 / Bsat(130), 0)}%)`);
// ---- Lm gap dominance: amplitude-permeability swing must not move Lm beyond its ±7% window ----
{
  const mu25 = interp(D.muAmp["25C"] ?? D.muAmp[Object.keys(D.muAmp)[0]], 0.108);
  const mu100 = interp(D.muAmp["100C"] ?? D.muAmp[Object.keys(D.muAmp).at(-1)], 0.108);
  const g = 1.3e-3, le = 0.149;                                  // D3-40/50 class: ~1.3 mm total gap
  const AL = (mu) => 1 / (g + le / mu);                          // ∝, gap-normalized
  const dev = Math.abs(AL(mu100) / AL(mu25) - 1);
  ck("LM", "gap-ground Lm vs amplitude-µ swing 25↔100 °C", dev <= 0.03,
    `µa(108 mT): ${f2(mu25, 0)} → ${f2(mu100, 0)}; Lm shift ${f2(dev * 100, 1)}% (gap-dominated) ≤ 3% — inside the ±7% window with the grind tolerance`);
}
// ---- D1 fault chain: soft-sat di/dt from the OC threshold to the CT ceiling (R6-C/R8) ----
{
  const R26 = { a: 2.13e-4, b: 1.637 }, AL = 37e-9, LE = 0.201;
  const muPU = (H) => 1 / (1 + R26.a * Math.pow(Math.max(H / 79.577, 1e-9), R26.b));
  for (const [sku, stack, N, oc, ceil] of [["30kw", 3, 39, 95, 150], ["40kw", 5, 26, 120, 165], ["50kw", 5, 24, 95, 187]]) {
    const L = (i) => muPU(N * i / LE) * AL * 0.92 * stack * N * N;   // AL −8% worst lot
    let i = oc, t = 0, dt = 0.05e-6, V = 560;                        // 560 V worst across the choke in a shoot-through/reverse fault
    while (i < ceil && t < 6e-6) { i += (V / L(i)) * dt; t += dt; }
    const di3 = (() => { let x = oc, tt = 0; while (tt < 3e-6) { x += (V / L(x)) * dt; tt += dt; } return x - oc; })();
    ck("D1-FAULT", `${sku} OC→ceiling time / 3 µs adder`, di3 <= ceil - oc,
      `L(${oc} A)=${f2(L(oc) * 1e6, 1)} µH (AL−8%) · Δi(3 µs)=${f2(di3, 0)} A ≤ ceiling−threshold ${ceil - oc} A · ceiling reached in ${t >= 6e-6 ? ">6" : f2(t * 1e6, 1)} µs — CT stays observing until the HRTIMER kill lands (R6-C budget 2–3 µs)`);
  }
}
// ---- sendust temperature band (no LEA powder data — catalog-class band, VERIFY first-article) ----
console.log("  info  [SENDUST] Kool Mµ-class µ tempco ≤ ±3% (−55…+125 °C catalog class) — D6 floors carry ≥+9% margin (12.9 vs 11.8 µH) and D1 lot-trim ±1 turn absorbs it; first-article L(I) at −25/+100 °C is the pack's material-equivalence test");
console.log(fails ? `\n${fails} TEMP-CRITIQUE FAILURE(S)` : "\nMAGNETICS TEMP CRITIQUE CLEAN — runaway-stable at every hot corner, sat margins hold at 130 °C, cold equilibria stable, fault chain observed end-to-end");
process.exit(fails ? 1 : 0);
