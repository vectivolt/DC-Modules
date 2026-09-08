// dm-choke-design.mjs — D6 DM line-choke design engine (E43 verification pass, 2026-09-08).
//
// WHY THIS EXISTS: the full-family verification found the D6 line was the ONE magnetic without
// an engine. The drawing inherited "22 µH" from E22 and the LISN model uses it FLAT, but a DM
// choke rides the LINE-FREQUENCY crest: its inductance at I_pk is what attenuates the 50 kHz
// ripple at the worst emission moment. On the platform's own (deliberately conservative,
// VERIFY-marked) sendust roll-off anchors, the drawn 14 T on ONE OD47 core computes ~12 µH at
// ZERO bias (not 22) and ~7–8 µH at the 82 A crest — under the registered 15 µH LISN floor at
// every SKU, worse at 40/50 kW. This engine designs the part per variant the same way
// pfc-design.mjs designs D1: sweep geometry × material × stack × turns × conductor against the
// drawing's own acceptance lines, minimize loss + cost.
//
// Acceptance lines (magnetics.md D6): L(I_pk) ≥ 15 µH · J ≤ 5.6 A/mm² · ΔT ≤ 45 K convective
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
// the D6 drawing's own basis: 55 A → 82 A pk). dIpp = the PFC ripple SOURCE the stage attenuates
// (D1 engine selections) — the 15 µH floor was set at the 30 kW source, so holding the SAME
// conducted-emission margin scales the floor ∝ dIpp (att ∝ L at fixed C; source +20·log(dI)).
const SKUS = {
  "30kw": { Irms: 55.9, Ipk: 82, dIpp: 21.4 },
  "40kw": { Irms: 73.3, Ipk: 109, dIpp: 28.0 },
  "50kw": { Irms: 91.6, Ipk: 136, dIpp: 34.8 },
};

// geometry set — catalog-class toroids the family already buys (T48 = 77439A7 class, the drawn
// D6 core; T79 = 0077908/T79 class, the D1 core). T57 is the standard mid size (OD57/ID26/H20).
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

// E43: the stage attenuates as L·C. The 15 µH floor was set against the ORIGINAL 2.2 µF CX2;
// the rev grows CX2 to 4.7 µF X1 (all variants — one cheap cap change, X-bleed tau 0.42→0.66 s,
// still inside the 1 s pluggable-discharge rule), so the per-variant floor is
//   L_floor = 15 µH × (dIpp/21.4) × (2.2/4.7)
// — identical conducted margin at every variant, with the cap carrying its share.
const L_FLOOR30 = 15e-6, CX2_OLD = 2.2e-6, CX2_NEW = 4.7e-6;
let all = {};
const only = process.env.DM_SKU;
console.log("=== D6 DM choke engine — equal-margin floors (CX2 4.7 uF rev), conservative roll-off anchors ===");
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
          fill: f((N * aw * 1e4) / g.win, 2), cost: Math.round(cost) };
        if (!best || P + cand.cost / 60 < best.P + best.cost / 60) best = cand;
      }
    }
  if (!best) { console.log(`${sku}: NO FEASIBLE DESIGN inside the acceptance lines`); continue; }
  best.Lfloor = f(L_FLOOR * 1e6, 1);
  all[sku] = best;
  console.log(`${sku}: ${best.stack}× ${best.geom} ${best.mat}  N=${best.N}  ${best.aw_mm2} mm² (J ${best.J})`
    + `  L0=${best.L0} µH → ${best.Lpk} µH @ ${s.Ipk} A pk (floor ${best.Lfloor})  P=${best.P} W  ΔT=${best.dT} K  fill=${best.fill}  ₹${best.cost}`);
}
// the as-drawn 30 kW part, graded on the same model (the control row — proves the finding)
{
  const g = GEOMS[0], m26 = MATS[1], m60 = MATS[0], s = SKUS["30kw"], N = 14;
  for (const mat of [m26, m60]) {
    const L0 = (MU0 * mat.mu * g.Ae) / g.le * N * N;
    const Lpk = muPU(mat, (N * s.Ipk) / g.le) * L0;
    console.log(`  [as-drawn control] 1× T48 ${mat.name} N=14: L0=${f(L0 * 1e6, 1)} µH, L@82A=${f(Lpk * 1e6, 1)} µH`
      + ` — ${Lpk >= L_FLOOR30 ? "meets" : "MISSES"} the ORIGINAL 15 µH/2.2 µF floor (drawing claims 22 µH ≥70%)`);
  }
}
writeFileSync(join(OUT, "dm-choke-design.json"), JSON.stringify(all, null, 2));
console.log("→ calculations/out/dm-choke-design.json");
