// tanks.mjs — the ONE per-SKU LLC tank table (mag-sync asserts the drawing strings against it; every SPICE result CSV
// carries its fingerprint, so a tank change invalidates the simulations that were run on the old one).
//
// E67: the InfyPower REG1K0135A2-class SINGLE FULL-BRIDGE LLC replaces the E60–E66 three interleaved half-bridge sections
// (3 × D3 transformer + 3 × D2 trim). One bridge drives one Cr bank → one external Lr (D2) → one transformer n:1:1 (D3,
// two secondaries into bank A / bank B).
//   · Gain is unchanged by construction: M = n·Vbank/Vbus with n = 2 equals the half-bridge Vbank/(Vbus/2), so the 830 V
//     bus cap and the busFor() policy stand.
//   · Output follows the charging-module convention (UUGreen/ENR "set high or low voltage mode", Tonhe "low/high voltage
//     section", NIUERA 0xA0/0xA1/0xA2): LOW mode 150–500 V (banks parallel), HIGH mode 500–1000 V (banks series), mode set
//     only in standby. The bank therefore tops out at 500 V (M ≤ 1.205, was 525 V / 1.265 with the E60 in-run hysteresis).
//   · Design: Ln = Lm/Lr = 10, Q = Z0/Rac ≈ 0.19 at a 500 V bank, fr 140 kHz — chosen by the E67 ngspice scan (Ln 8/10/12 ×
//     Q 0.15–0.35): Ln 10 held Vcr ≤ 584 V pk at the gain-worst corner with the lowest nominal RMS; lower Q/Ln pushed Im.
//   · Cr = crN × 33 nF 1200 V resonant film (the E41 part): ≤ 10.3 A rms per cap at the 250 V-bank full-power corner (12 A line).
//   · Lr is the TOTAL series inductance; the D2 external inductor carries Lr − (D3 leakage + loop stray) — magnetics-envelope
//     asserts that split. par = SG2M023120LJ per bridge position (per-package conduction at the current-critical corner).
export const TANKS = {
  "30kw": { P: 30e3, Imax: 100, n: 2, crN: 7, crNF: 33, Lr: 5.6e-6, Lm: 56e-6, par: 2 },
  "40kw": { P: 40e3, Imax: 133, n: 2, crN: 9, crNF: 33, Lr: 4.35e-6, Lm: 43.5e-6, par: 2 },
  "50kw": { P: 50e3, Imax: 167, n: 2, crN: 11, crNF: 33, Lr: 3.56e-6, Lm: 35.6e-6, par: 2 },
  "50kwa": { P: 50e3, Imax: 167, n: 2, crN: 11, crNF: 33, Lr: 3.56e-6, Lm: 35.6e-6, par: 3 },   // air: a third FET per position
};
for (const t of Object.values(TANKS)) {
  t.Cr = t.crN * t.crNF * 1e-9;
  t.fr = 1 / (2 * Math.PI * Math.sqrt(t.Lr * t.Cr));
  t.coss = 250e-12 * t.par;          // lumped leg node capacitance (E60 basis: 250 pF per single-FET position)
  t.gOn = 28.57 * t.par;             // 35 mΩ hot per SG2M023120LJ
}
// E67 tank RMS classes (nominal + tolerance corners, A rms) — D2 litz/ΔT, Cr per cap and the resonant CT are sized to these;
// secondary SiC JBS per bridge position: count × current class (hot V0 0.95 V; rd 45 mΩ for the 20 A class, 22 mΩ for 40 A)
export const TANK_CLASS = { "30kw": 78, "40kw": 100, "50kw": 120, "50kwa": 120 };
export const JBS_POS = { "30kw": { n: 2, cls: 40 }, "40kw": { n: 2, cls: 40 }, "50kw": { n: 2, cls: 40 }, "50kwa": { n: 3, cls: 40 } };   // one 40 A part everywhere (InfyPower: 16 × 40 A)
export const fingerprint = (sku) => {
  const t = TANKS[sku];
  return `${sku}:FB n${t.n}/Lr${+(t.Lr * 1e6).toFixed(3)}u/Cr${t.crN}x${t.crNF}n/Lm${+(t.Lm * 1e6).toFixed(3)}u/Coss${Math.round(t.coss * 1e12)}p`;
};
