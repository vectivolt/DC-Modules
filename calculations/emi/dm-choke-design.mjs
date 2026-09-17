// dm-choke-design.mjs — the D7 3-phase CM-choke design engine (second block), plus the AC DM line
// choke that is NOT fitted and exists here only as the reference the LISN gate grades the drawn
// filter against.
//
// Both halves sweep geometry × material × stack × turns × conductor against their own acceptance
// lines and minimize loss + cost, the way pfc-design.mjs designs D1. A DM choke has to be graded at
// the LINE-FREQUENCY crest, not at zero bias: its inductance at I_pk is what attenuates the 50 kHz
// ripple at the worst emission moment, and on these (deliberately conservative, VERIFY-marked)
// sendust roll-off anchors a single OD47 core at 14 T computes ~12 µH unbiased and ~7–8 µH at the
// 82 A crest — a flat catalog "22 µH" would overstate the stage at every SKU.
//
// DM acceptance lines: L(I_pk) ≥ 15 µH · J ≤ 5.6 A/mm² · ΔT ≤ 45 K convective
// (50 kW liquid: the same number as a plate-bond duty — sealed module) · fill ≤ 40 %.
// Roll-off model: identical anchors to pfc-design.mjs (conservative vs catalog — real cores
// only ride HIGHER, so a pass here is a pass in hardware).
// Run: node calculations/emi/dm-choke-design.mjs        (all three module variants)
//      DM_SKU=40kw node calculations/emi/dm-choke-design.mjs   (one)

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
mkdirSync(OUT, { recursive: true });
const f = (x, d = 2) => Number(x.toFixed(d));

// per-variant line current (worst continuous @330 VAC) and crest incl. PFC ripple share (×1.05,
// the DM choke's own basis: 55 A → 82 A pk). dIpp = the PFC ripple SOURCE the stage attenuates
// (D1 engine selections) — the 15 µH floor was set at the 30 kW source, so holding the SAME
// conducted-emission margin scales the floor ∝ dIpp (att ∝ L at fixed C; source +20·log(dI)).
const SKUS = {
  "30kw": { Irms: 55.9, Ipk: 82, dIpp: 21.4 },
  "40kw": { Irms: 73.3, Ipk: 109, dIpp: 28.0 },
  "50kw": { Irms: 91.6, Ipk: 136, dIpp: 34.8 },
};

// geometry set — catalog-class toroids the family already buys (T48 = 77439A7 class; T79 =
// 0077908/T79 class, the D1 core). T57 is the standard mid size (OD57/ID26/H20).
const GEOMS = [
  { name: "T48 (OD47.6, 77439-class)", Ae: 1.99e-4, le: 0.1074, win: 4.27, Asurf: 95, mlt0: 0.062, mltK: 0.016, cost: 95 },
  { name: "T57 (OD57/ID26/H20)", Ae: 3.10e-4, le: 0.1304, win: 5.31, Asurf: 140, mlt0: 0.075, mltK: 0.020, cost: 130 },
  { name: "T79 (OD79/ID49/H17)", Ae: 2.62e-4, le: 0.201, win: 18.6, Asurf: 280, mlt0: 0.098, mltK: 0.036, cost: 210 },
];
const MATS = [
  { name: "60u", mu: 60, a: 1.455e-3, b: 1.513 },
  { name: "26u", mu: 26, a: 2.13e-4, b: 1.637 },
];
const MU0 = 4e-7 * Math.PI;
const muPU = (m, H_Am) => 1 / (1 + m.a * Math.pow(Math.max(H_Am / 79.577, 1e-9), m.b));
const RHO_CU = 1.68e-8 * 1.33;                       // Cu at ~100 °C
// conductor options: N×AWG12 bundles (3.31 mm² each) and foil widths at 0.4/0.5 mm — bare CSA
const CONDS = [9.9e-6, 13.2e-6, 16.5e-6, 16.0e-6, 20.0e-6, 26.4e-6];

// The stage attenuates as L·C. The 15 µH floor belongs to a 2.2 µF CX2; the drawn CX2 is 4.7 µF X1
// on every variant (X-bleed τ 0.66 s, inside the 1 s pluggable-discharge rule), so the floor is
//   L_floor = 15 µH × (dIpp/21.4) × (2.2/4.7)
// — identical conducted margin at every variant, with the cap carrying its share.
const L_FLOOR30 = 15e-6, CX2_OLD = 2.2e-6, CX2_NEW = 4.7e-6;
let all = {};
const only = process.env.DM_SKU;
console.log("=== DM CHOKE REFERENCE (not fitted) — equal-margin floors, conservative roll-off anchors ===");
for (const [sku, s] of Object.entries(SKUS)) {
  if (only && sku !== only) continue;
  const L_FLOOR = L_FLOOR30 * (s.dIpp / 21.4) * (CX2_OLD / CX2_NEW);
  let best = null;
  for (const g of GEOMS) for (const mat of MATS) for (let stack = 1; stack <= 3; stack++)
    for (const aw of CONDS) {
      const J = s.Irms / (aw * 1e6);
      if (J > 5.6) continue;
      for (let N = 6; N <= 40; N++) {
        if ((N * aw * 1e4) / g.win > 0.40) break;     // bare-Cu fill ≤ 40 %
        const AL = (MU0 * mat.mu * g.Ae) / g.le;
        const L0 = AL * stack * N * N;
        const Lpk = muPU(mat, (N * s.Ipk) / g.le) * L0;
        if (Lpk < L_FLOOR) continue;
        const MLT = g.mlt0 + g.mltK * stack;
        const Rdc = (RHO_CU * N * MLT) / aw;
        const P = s.Irms ** 2 * Rdc * 1.05;           // +5% AC/proximity at line freq + residual ripple
        const dT = Math.pow((P * 1000) / (g.Asurf * (1 + 0.35 * (stack - 1))), 0.833);
        if (dT > 45) continue;
        const cost = stack * g.cost + N * MLT * aw * 8900 * 950;
        const cand = { geom: g.name, mat: mat.name, stack, N, aw_mm2: f(aw * 1e6, 1), J: f(J, 2),
          L0: f(L0 * 1e6, 1), Lpk: f(Lpk * 1e6, 1), Rdc_mR: f(Rdc * 1e3, 2), P: f(P, 1), dT: f(dT, 0),
          fill: f((N * aw * 1e4) / g.win, 2), cost: Math.round(cost),
          roll: [mat.a, mat.b, N / g.le] };            // L(i) = L0/(1 + a·(roll[2]·i/79.577)^b) — the filter-stability model reads it
        if (!best || P + cand.cost / 60 < best.P + best.cost / 60) best = cand;
      }
    }
  if (!best) { console.log(`${sku}: NO FEASIBLE DESIGN inside the acceptance lines`); continue; }
  best.Lfloor = f(L_FLOOR * 1e6, 1);
  all[sku] = best;
  console.log(`${sku}: ${best.stack}× ${best.geom} ${best.mat}  N=${best.N}  ${best.aw_mm2} mm² (J ${best.J})`
    + `  L0=${best.L0} µH → ${best.Lpk} µH @ ${s.Ipk} A pk (floor ${best.Lfloor})  P=${best.P} W  ΔT=${best.dT} K  fill=${best.fill}  ₹${best.cost}`);
}
// a single-core 30 kW part graded on the same model — the control row that keeps the gate honest
{
  const g = GEOMS[0], m26 = MATS[1], m60 = MATS[0], s = SKUS["30kw"], N = 14;
  for (const mat of [m26, m60]) {
    const L0 = (MU0 * mat.mu * g.Ae) / g.le * N * N;
    const Lpk = muPU(mat, (N * s.Ipk) / g.le) * L0;
    console.log(`  [as-drawn control] 1× T48 ${mat.name} N=14: L0=${f(L0 * 1e6, 1)} µH, L@82A=${f(Lpk * 1e6, 1)} µH`
      + ` — ${Lpk >= L_FLOOR30 ? "meets" : "MISSES"} the ORIGINAL 15 µH/2.2 µF floor (drawing claims 22 µH ≥70%)`);
  }
}
// ---- D7 3-phase CM chokes through the same engine. A CM choke carries ALL the line current: its DM
// leakage flux Φ = L_lk·I/N rides the nanocrystalline core at every crest (Heldwein/Kolar bound
// B = (L_cm·I_cm + L_lk·I_dm)/(N·A_Fe), the CM term is mA). Copper is graded HOT and the turn has to
// fit the core it is wound on, so the design lines are:
//   L_cm(10 kHz) ≥ 2 mH on the CATALOG-MINIMUM µ (−30 %) · B_DM = L_lk,max·I1pk/(N·A_Fe) ≤ 0.6 T
//   (hot Bsat 1.155 T ÷ ~1.25 sector-ring peaking ÷ 1.5) · J ≤ 5.6 · ΔT ≤ 40 K (5 K under the 45 K
//   acceptance) on the platform toroid convection formula · windable in ≤ 2 layers.
// N = 8 and the leakage band 6–12 µH are the registered basis (leakage is MEASURED at first article;
// the A_Fe floor is set against the band maximum). I1pk = the simulated fundamental crest incl. dips and
// the 20° jump (vienna-switched.csv), not a hand basis.
import { readFileSync } from "node:fs";
import { rho } from "../magnetics/winding-physics.mjs";
{
  const vs = readFileSync(join(OUT, "vienna-switched.csv"), "utf8").split("\n").filter((l) => l && !l.startsWith("#") && !l.startsWith("sku,")).map((l) => l.split(","));
  // nanocrystalline toroids listed in OpenMagnetics/MAS cores.ndjson (dims OD/ID/H mm) — AT&M 1K107 CC-series, Magnetec Nanoperm M-series
  const NCORES = [["T 65/50/25", 65, 50, 25, "AT&M CC197"], ["T 63/50/30", 63, 50, 30, "Magnetec M-112"], ["T 80/63/30", 80, 63, 30, "Magnetec M-113"],
    ["T 80/50/25", 80, 50, 25, "AT&M CC050"], ["T 90/60/20", 90, 60, 20, "AT&M CC051"], ["T 90/50/30", 90, 50, 30, "AT&M CC243"],
    ["T 100/80/30", 100, 80, 30, "Magnetec M-114"], ["T 102/76/25", 102, 76, 25, "AT&M CC204"]];
  const MU10K = 29300, MU_MIN = 0.70 * MU10K;          // MAS Nanoperm 30000 µi at 10 kHz; catalog AL tolerance −30 %
  const N = 8, LLK_MAX = 12e-6, B_LINE = 0.6, KFE = 0.75, CASE = 1.0, GAP = 3.0;   // mm: trough/insulation wall, sector spacing (pack)
  const d7 = {}, grade = (od, id, h, A, s) => {
    const w = (od - id) / 2, AFe = w * h * KFE, le = Math.PI * (od + id) / 2, d = Math.sqrt(4 * A / Math.PI) + 0.25;
    let placed = 0, layers = 0, mlt = 0;
    for (let j = 0; j < 2 && placed < 3 * N; j++) {                // nested layers at 0.87·d pitch, 3 sector gaps per layer
      const r = id / 2 - CASE - d / 2 - j * 0.87 * d; if (r <= d) break;
      const n = Math.min(Math.floor((2 * Math.PI * r - 3 * GAP) / d), 3 * N - placed); placed += n; layers++;
      mlt += n * (2 * (w + 2 * CASE + (2 * j + 1) * d) + 2 * (h + 2 * CASE + (2 * j + 1) * d));
    }
    const MLT = mlt / Math.max(placed, 1), P = 3 * s.Irms ** 2 * rho(100) * N * MLT * 1e-3 / (A * 1e-6) * 1.05;
    const ODw = od + 2 * CASE + 2 * d, IDw = Math.max(id - 2 * CASE - 2 * layers * d, 0), Hw = h + 2 * CASE + 2 * d;
    const Acm2 = (Math.PI / 2 * (ODw ** 2 - IDw ** 2) + Math.PI * (ODw + IDw) * Hw) / 100;
    const kg = AFe * le * 7.3e-6 + 3 * N * MLT * A * 8.9e-6;
    return { AFe, le, fits: placed >= 3 * N, layers, MLT, P, dT: Math.pow(P * 1000 / Acm2, 0.833), Lcm: MU0 * MU_MIN * AFe * 1e-6 / (le * 1e-3) * N * N, ODw, Hw, R20: rho(20) * N * MLT / A * 1e6,
      B: LLK_MAX * s.Ipk / (N * AFe * 1e-6), kg, cost: AFe * le * 7.3e-6 * 1500 + 3 * N * MLT * A * 8.9e-6 * 1050 + 200 };   // ₹1,500/kg cased nanocrystalline [est] · Cu ₹1,050/kg · ₹200 wind+test [est]
  };
  console.log("=== D7 3-phase CM choke — N=8, L_lk ≤ 12 µH band max, catalog-minimum µ, simulated crest ===");
  for (const [sku, s0] of Object.entries(SKUS)) {
    if (only && sku !== only) continue;
    const s = { Irms: s0.Irms, Ipk: Math.max(...vs.filter((r) => r[0] === sku).map((r) => +r[7])) };
    let best = null;
    for (const [name, od, id, h, ref] of NCORES) for (const A of [10, 13.3, 16.7, 20, 25, 30]) {
      if (s.Irms / A > 5.6) continue;
      const g = grade(od, id, h, A, s);
      if (!g.fits || g.Lcm < 2e-3 || g.B > B_LINE || g.dT > 40) continue;
      if (!best || g.P + g.cost / 60 < best.P + best.cost / 60)
        best = { core: name, ref, N, aw_mm2: A, J: f(s.Irms / A, 2), layers: g.layers, MLT_mm: f(g.MLT, 0), AFe_mm2: f(g.AFe, 0), le_mm: f(g.le, 0),
          Lcm10k_mH: f(g.Lcm * 1e3, 2), Llk_band_uH: [6, 12], Ipk: s.Ipk, B_T: f(g.B, 2), P: f(g.P, 1), dT: f(g.dT, 0), kg: f(g.kg, 2), cost: Math.round(g.cost),
          Rdc20_mR: f(g.R20, 2), ODw_mm: f(g.ODw, 0), Hw_mm: f(g.Hw, 0) };
    }
    if (!best) { console.log(`${sku}: D7 NO FEASIBLE DESIGN`); process.exitCode = 1; continue; }
    d7[sku] = best;
    console.log(`${sku}: D7 ${best.core} (${best.ref} class, A_Fe ≥ ${best.AFe_mm2} mm²) 3×${N} T ${best.aw_mm2} mm² (J ${best.J}, ${best.layers} layer)  L_cm ≥ ${best.Lcm10k_mH} mH @µmin`
      + `  B_DM ${best.B_T} T @ ${s.Ipk} A pk × 12 µH  P=${best.P} W  ΔT=${best.dT} K  ${best.kg} kg  ₹${best.cost}`);
    // the registered OD62 part on the same model — the control row the design has to beat
    const reg = { "30kw": 10, "40kw": 13.3, "50kw": 16.7 }[sku], g = grade(62, 32, 25, reg, s);
    console.log(`  [as-registered control] OD62/32/25 3×8 T ${reg} mm²: ${g.fits ? g.layers + " layer" : "DOES NOT FIT in 2 layers"}, P=${f(g.P, 1)} W (registered ${{ "30kw": 11.5, "40kw": 15.3, "50kw": 19.2 }[sku]}), ΔT=${f(g.dT, 0)} K, J ${f(s.Irms / reg, 2)}, B_DM ${f(g.B, 2)} T`);
  }
  all.d7 = d7;
}
writeFileSync(join(OUT, "dm-choke-design.json"), JSON.stringify(all, null, 2));
console.log("→ calculations/out/dm-choke-design.json");
