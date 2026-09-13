// tanks.mjs — E60: the ONE per-SKU LLC tank table (D2 trim turns/Ae = the E60 rev D drawings;
// protection classes live in current-coordination.mjs OC). Before E60 the grid, the
// Monte-Carlo and the SPICE op-point runner all carried the 30 kW tank for every SKU, while the
// drawings (boards.tsx crN/crVal/trim/ctBurden) carried per-SKU values — three engines, one tank.
// mag-sync asserts this table against the drawing strings; SPICE result CSVs carry its fingerprint.
export const TANKS = {
  "30kw": { P: 30e3, Imax: 100, crN: 4, crNF: 46, Lr: 7.0e-6, trim: 4.0e-6, bins: [3.3, 3.65, 4.0, 4.35], nTrim: 4, aeTrim: 656e-6, Lm: 63e-6, coss: 250e-12, gOn: 28.57 },
  "40kw": { P: 40e3, Imax: 133, crN: 6, crNF: 33, Lr: 6.5e-6, trim: 3.5e-6, bins: [3.2, 3.5, 3.8], nTrim: 5, aeTrim: 683e-6, Lm: 63e-6, coss: 250e-12, gOn: 28.57 },
  "50kw": { P: 50e3, Imax: 167, crN: 8, crNF: 27, Lr: 6.0e-6, trim: 3.0e-6, bins: [2.8, 3.0, 3.2], nTrim: 3, aeTrim: 1366e-6, Lm: 63e-6, coss: 250e-12, gOn: 28.57 },
  "50kwa": { P: 50e3, Imax: 167, crN: 8, crNF: 27, Lr: 6.0e-6, trim: 3.0e-6, bins: [2.8, 3.0, 3.2], nTrim: 3, aeTrim: 1366e-6, Lm: 63e-6, coss: 500e-12, gOn: 57.14 },   // E44: paralleled LLC FETs
};
for (const t of Object.values(TANKS)) {
  t.Cr = t.crN * t.crNF * 1e-9;
  t.fr = 1 / (2 * Math.PI * Math.sqrt(t.Lr * t.Cr));
}
export const fingerprint = (sku) => {
  const t = TANKS[sku];
  return `${sku}:Lr${t.Lr * 1e6}u/Cr${t.crN}x${t.crNF}n/Lm${t.Lm * 1e6}u/Coss${Math.round(t.coss * 1e12)}p`;
};
