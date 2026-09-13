// tanks.mjs — E60: the ONE per-SKU LLC tank table (D2 trim turns/Ae = the E60 rev D drawings;
// protection classes live in current-coordination.mjs OC). Before E60 the grid, the
// Monte-Carlo and the SPICE op-point runner all carried the 30 kW tank for every SKU, while the
// drawings (boards.tsx crN/crVal/trim/ctBurden) carried per-SKU values — three engines, one tank.
// mag-sync asserts this table against the drawing strings; SPICE result CSVs carry its fingerprint.
// E65: the "engineered 3 µH" transformer leakage was not physically reachable — a concentric S1–P–S2 interleave on
// these windows computes 0.15–0.22 µH (winding-physics leakageSPS; three independent verifiers agreed). D2 therefore
// carries ~all of Lr: bins = Lr − (0.20/0.35/0.50/0.65 µH), covering measured transformer leakage + 0.1 µH tank-loop
// stray from 0.125 to 0.725 µH (magnetics-envelope asserts the computed leakage sits inside that window).
// Lr, Cr, Lm and Coss are unchanged, so the fingerprint — and every LLC simulation — stays valid.
export const TANKS = {
  "30kw": { P: 30e3, Imax: 100, crN: 4, crNF: 46, Lr: 7.0e-6, trim: 6.65e-6, bins: [6.35, 6.5, 6.65, 6.8], nTrim: 8, aeTrim: 683e-6, Lm: 63e-6, coss: 250e-12, gOn: 28.57 },
  "40kw": { P: 40e3, Imax: 133, crN: 6, crNF: 33, Lr: 6.5e-6, trim: 6.15e-6, bins: [5.85, 6.0, 6.15, 6.3], nTrim: 5, aeTrim: 1366e-6, Lm: 63e-6, coss: 250e-12, gOn: 28.57 },
  "50kw": { P: 50e3, Imax: 167, crN: 8, crNF: 27, Lr: 6.0e-6, trim: 5.65e-6, bins: [5.35, 5.5, 5.65, 5.8], nTrim: 5, aeTrim: 1366e-6, Lm: 63e-6, coss: 250e-12, gOn: 28.57 },
  "50kwa": { P: 50e3, Imax: 167, crN: 8, crNF: 27, Lr: 6.0e-6, trim: 5.65e-6, bins: [5.35, 5.5, 5.65, 5.8], nTrim: 5, aeTrim: 1366e-6, Lm: 63e-6, coss: 500e-12, gOn: 57.14 },   // E44: paralleled LLC FETs
};
for (const t of Object.values(TANKS)) {
  t.Cr = t.crN * t.crNF * 1e-9;
  t.fr = 1 / (2 * Math.PI * Math.sqrt(t.Lr * t.Cr));
}
export const fingerprint = (sku) => {
  const t = TANKS[sku];
  return `${sku}:Lr${t.Lr * 1e6}u/Cr${t.crN}x${t.crNF}n/Lm${t.Lm * 1e6}u/Coss${Math.round(t.coss * 1e12)}p`;
};
