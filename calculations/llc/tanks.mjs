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
  // E81 (F-C-1): the 30 kW single die per position (E68) is CONDUCTION-limited at the SER-250 V corner — 48 A rms in one die = 82 W hot
  // before any switching term. Two dies per position (+₹1,560 = 5.2 % of the 30 kW COGS on its own) would hold rated power there, but
  // the user's ceiling is ≤ 5 % per module for the whole review, so the 30 kW KEEPS one die: the snubber below removes the turn-off
  // term, the adaptive dead time removes the body-diode term, and the FSM thermal fold carries the one remaining corner — grid (E81):
  // 500 V series, full load, 55 °C ambient only: 93 % at ≤ 400 VAC, 86 % at 450–475 VAC; 100 % everywhere else incl. every LOW-mode
  // Imax corner and the whole envelope at ≤ 25 °C. The F.11 kill peak vs the die's 200 A I_DM (F-C-10) is re-gated on the E81 fast kill
  // path (fault filter 0b0011: ≈ 0.3 µs, gated at +0.5 µs) instead of the +1 µs race (209 A).
  // cs = the E81 turn-off snubber per die (1 kV C0G 1206, drain–source at the package pins, both dies of a leg) with R{id}OFF = 0 Ω;
  // koff = the SIMULATED channel turn-off coefficient for that (cs, Rg_off) pair — worst of the 650 V/90.7 A, 725 V/101 A and
  // 830 V/68 A corners, corrected-Coss DPT deck (spice/double-pulse, E81). Baseline as drawn (2.2 Ω, no cs) reads 13–15 nJ/(V·A) on
  // the same deck = 1.43 × the datasheet 10.5, so these carry ≈ 40 % model pessimism. cs is bounded ABOVE by the ZVS budget at the
  // PS150-Imax corner (t_dead = n_die·(Qoss + cs·V)/I_toff ≤ 296 ns HRTIMER ceiling, 25 % margin): 620 / 225 / 380 pF.
  // koff values = the repo DPT deck's per-SKU FINAL rows at the real turn-off currents (simulation-results/<sku>/dpt-llc-metrics.csv,
  // worst of SER250-PFM / PS150-lead / PAR500-full at the E81 design loop of 5 nH; stress-audit [DPT] asserts tanks.koff ≥ that).
  // E81 close-out (weak-leg ZVS, non-linear Coss deck): in phase shift the WEAK leg (leg A) commutates on a decaying ~I_m and its
  // slew is an ENERGY limit — the snubber charge it must move is bounded by ½·Lr·i². The deck's dead-time window for leg A at the
  // SER250-bus764 corner: 30 kW cs 0 → [120, 160] ns, 330 pF → 160 ns only, ≥ 470 pF → none; 40 kW 470 pF holds, 680 pF+ does not;
  // 50 kW (2 dies, Lr 3.56 µH) holds to ≈ 680 pF by the same energy law. At PAR200-Imax and PS150-Imax the weak leg loses ZVS on
  // EVERY SKU at ANY cs (an E67-era limit the linear 250 pF model hid) — the grid now carries the hard turn-on there and folds those
  // current-limited low-voltage corners; the mitigation (PSM frequency policy / secondary-side modulation / Lr) is registered for E82.
  // cs = 330 / 680 / 1000 pF; koff = the DPT finals at those values on the residual-chain currents, 5 nH. Dead-time budget 592 ns (0.75 × 900 ns clamp, 12 % of the
  // 203 kHz PSM period). Commutation loop: the decks'
  // FINAL rows run at the E81 layout rule L_loop ≤ 5 nH (laminated bus, films at the package pins; T-59 measures it) — at 10 nH the same
  // rows read 82–92 % of 1200 V. Acceptance: repetitive peaks ≤ 85 % of the rating (the DC bus itself is ≤ 69 %; the achievable at 5 nH
  // with 100–165 A turn-off is 81–84 %; both die classes are avalanche-rated), the +6 % bus row ≤ 90 % (above the 860 V F.03 trip).
  "30kw": { P: 30e3, Imax: 100, n: 2, crN: 7, crNF: 33, Lr: 5.6e-6, Lm: 56e-6, par: 1, cs: 330e-12, koff: 3.4e-9 },   // E68: one die per position on the clip mount (E81: kept, see above)
  "40kw": { P: 40e3, Imax: 133, n: 2, crN: 9, crNF: 33, Lr: 4.35e-6, Lm: 43.5e-6, par: 2, cs: 680e-12, koff: 5.3e-9 },   // E81 DPT (residual-chain currents): 680 pF all-PASS (83.9 % rep / 88.9 % vhi), koff 5.23; 820 pF+ rings PAR500 past 85 %
  "50kw": { P: 50e3, Imax: 167, n: 2, crN: 11, crNF: 33, Lr: 3.56e-6, Lm: 35.6e-6, par: 2, cs: 1000e-12, koff: 4.0e-9 },   // E81 DPT (residual-chain currents): 1 nF all-PASS (80.7 % rep / 87.3 % vhi), koff 3.91; 470 pF rang PS150-lead to 88.4 %
  "50kwa": { P: 50e3, Imax: 167, n: 2, crN: 11, crNF: 33, Lr: 3.56e-6, Lm: 35.6e-6, par: 2, cs: 1000e-12, koff: 4.0e-9 },   // E68: the air twin = the liquid (was 3)
};
// E69a: LLC die per SKU — 23 mΩ SG2M023120LJ (35 mΩ hot, 250 pF lumped node C per die) or the 1200 V 16 mΩ class die at 40 kW
// (24.3 mΩ hot; node C scaled by die area ≈ 23/16 → 360 pF). The fold that single 16 mΩ die accepts is the forced-HIGH 500 V
// corner at 55 °C only (user decision 2026-09-13).
// E81 (F-C-1/F-C-7): turn-off energy and output charge for the 1200 V 21–23 mΩ TO-247-4 class (C3M0021120K rev 4, the public
// proxy the LCSC row names — DATASHEET): koff = Eoff/(V·I) = 0.42 mJ/(800 V·50 A) = 10.5 nJ/(V·A) at Rg(ext) 2.5 Ω, Tj 175 °C;
// qoss800 = 3·Eoss/V = 371 nC at 800 V (the linear 250 pF carries only 49 % of that charge — the ZVS floor and the dead-time schedule
// read the charge). The pre-E81 grid carried a flat 1 W (PFM) / 8 W (PSM) turn-off term per position while the power-solved decks
// turn the switch off at 36–147 A above resonance (llc-stress.csv Ifet_toff). RFQ line for SG2M023120LJ: Eoff ≤ 0.45 mJ at
// 800 V / 50 A / 2.5 Ω / 175 °C and Eoss ≤ 110 µJ at 800 V — a part above either line re-runs the grid before it is accepted.
export const DIES = { "23m": { rds: 0.023, rHot: 0.035, coss: 250e-12, koff: 10.5e-9, qoss800: 371e-9, mpn: "SG2M023120LJ" } };
for (const t of Object.values(TANKS)) {
  t.Cr = t.crN * t.crNF * 1e-9;
  t.fr = 1 / (2 * Math.PI * Math.sqrt(t.Lr * t.Cr));
  t.dieP = DIES[t.die ?? "23m"];
  t.coss = (t.dieP.coss + (t.cs ?? 0)) * t.par;   // lumped leg node capacitance (E60 basis: 250 pF per 23 mΩ die) + the E81 snubber per die
  t.koff = t.koff ?? t.dieP.koff;    // E81: per-SKU (cs, Rg_off) turn-off coefficient; the bare die's datasheet value otherwise
  t.gOn = t.par / t.dieP.rHot;       // hot channel conductance of the position
}
// E67 tank RMS classes (nominal + tolerance corners, A rms) — D2 litz/ΔT, Cr per cap and the resonant CT are sized to these;
// secondary SiC JBS per bridge position: count × current class (hot V0 0.95 V; rd 45 mΩ for the 20 A class, 22 mΩ for 40 A)
export const TANK_CLASS = { "30kw": 78, "40kw": 100, "50kw": 120, "50kwa": 120 };
export const JBS_POS = { "30kw": { n: 2, cls: 40 }, "40kw": { n: 2, cls: 40 }, "50kw": { n: 2, cls: 40 }, "50kwa": { n: 2, cls: 40 } };   // one 40 A part everywhere (InfyPower: 16 × 40 A at 40 kW) · E68: 8 at 30 kW was checked and REJECTED — +135 W rd loss, airflow margin 1.11×
export const fingerprint = (sku) => {
  const t = TANKS[sku];
  return `${sku}:FB n${t.n}/Lr${+(t.Lr * 1e6).toFixed(3)}u/Cr${t.crN}x${t.crNF}n/Lm${+(t.Lm * 1e6).toFixed(3)}u/Coss${Math.round(t.coss * 1e12)}p`;
};
