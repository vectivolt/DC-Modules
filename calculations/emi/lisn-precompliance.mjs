// lisn-precompliance.mjs — §26 conducted-emissions PRE-COMPLIANCE ESTIMATE (never a compliance claim).
// DM path: PFC choke ripple spectrum (triangular, 50 kHz, worst-θ 21.4 App per phase) with N-lane
// interleave comb cancellation → 2-stage DM filter (CM-choke leakage 9 µH ×2 + X 2.2 µF ×2) → LISN 50Ω/50µH.
// CM path: node dv/dt (DPT: 46 V/ns eff.) × heatsink capacitance 200 pF spectrum → CM choke 2 mH ×2 + Y 3×4.7 nF.
// Compared against CISPR-32/EN55032 Class A conducted QP limits (150k–30 MHz). Uncertainty ±20 dB —
// this ranks design options and finds gross gaps only; chamber test at EVT T-08 is the arbiter.
// Run: node calculations/emi/lisn-precompliance.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { plotSVG } from "../plot.mjs";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const f = (x, d = 1) => Number(x.toFixed(d));

const FSW = 50e3, DIPP = 21.4;
const limitA = (fHz) => (fHz < 500e3 ? 79 : fHz < 5e6 ? 73 : 73);          // dBµV QP Class A
const dbuv = (v) => 20 * Math.log10(Math.max(v, 1e-12) / 1e-6);

// triangle harmonic amplitude (A) at n·FSW: In = 8·ΔI/(π²·n²) for odd-ish; use |sinc-shaped| general
const Ih = (n) => (8 * DIPP) / (Math.PI * Math.PI * n * n);
// interleave comb: N lanes shifted 2π/N → only harmonics with n % N == 0 survive (ideal); mismatch floor 5%
const comb = (n, N) => (n % N === 0 ? 1 : 0.05);
// DM filter attenuation: 2 stages of L=9µH (CMC leakage) into C=2.2µF, source = choke current (current divider);
// per-stage |H| ≈ 1/((f/f0)^2) above f0 = 1/(2π√(LC)) with damping floor
const f0 = 1 / (2 * Math.PI * Math.sqrt(9e-6 * 2.2e-6));
const f0dm = 1 / (2 * Math.PI * Math.sqrt(22e-6 * 2.2e-6));   // 3rd stage: dedicated 22 µH DM chokes (E22)
const attDM = (fHz) => { const x = fHz / f0, xd = fHz / f0dm;
  const per = x > 1 ? 1 / (x * x) : 1, perD = xd > 1 ? 1 / (xd * xd) : 1;
  return Math.max(per * per * perD, 1e-12); };
// CM: trapezoid dv/dt spectrum: Vn ≈ 2·Vbus/(π n)·sinc-ish with corner at 1/(π·tr); i_cm = Vn·ω·Cp
const TR = 9e-9, CP = 200e-12, VSW = 425;
const attCM = (fHz) => { const fc = 1 / (2 * Math.PI * Math.sqrt(2e-3 * 4.7e-9 * 3)); const x = fHz / fc; const per = x > 1 ? 1 / (x * x) : 1; return Math.max(per * per, 1e-9); };

const rows = [["f_kHz", "lane1_dBuV", "lane2_dBuV", "lane4_dBuV", "CM_dBuV", "limitA_dBuV", "margin_worst_dB"]];
const series = { 1: [], 2: [], 4: [], cm: [], lim: [] };
let worstMargin = 1e9, worstAt = 0;
for (let n = 3; n * FSW <= 30e6; n++) {
  const fHz = n * FSW;
  if (fHz < 150e3) continue;
  const dm = {};
  for (const N of [1, 2, 4]) {
    const iRes = Ih(n) * comb(n, N) * attDM(fHz);
    dm[N] = dbuv(iRes * 25);                                            // LISN transimpedance ≈ 25 Ω
  }
  const nCorner = 1 / (Math.PI * TR);
  const vn = (2 * VSW) / (Math.PI * n) * (fHz < nCorner ? 1 : nCorner / fHz);
  const icm = vn * 2 * Math.PI * fHz * CP * attCM(fHz);
  const cm = dbuv(icm * 25);
  const lim = limitA(fHz);
  const worst = Math.max(dm[1], cm);
  const margin = lim - worst;
  if (margin < worstMargin) { worstMargin = margin; worstAt = fHz; }
  if (n % 2 === 1 || n % 10 === 0) {
    rows.push([f(fHz / 1e3, 0), f(dm[1]), f(dm[2]), f(dm[4]), f(cm), lim, f(margin)]);
    series[1].push({ x: fHz, y: dm[1] }); series[2].push({ x: fHz, y: dm[2] }); series[4].push({ x: fHz, y: dm[4] });
    series.cm.push({ x: fHz, y: cm }); series.lim.push({ x: fHz, y: lim });
  }
}
writeFileSync(join(OUT, "lisn-precompliance.csv"),
  "# PRE-COMPLIANCE ESTIMATE ±20 dB (§26) — not a compliance claim; CISPR-32 A QP limits; chamber = EVT T-08\n" +
  rows.map(r => r.join(",")).join("\n") + "\n");
const mk = (k, label, color) => ({ label, x: series[k].map(p => p.x), y: series[k].map(p => p.y), color });
plotSVG({ title: "Conducted pre-compliance estimate vs CISPR-32 A (±20 dB band applies)", xlabel: "Hz", ylabel: "dBµV",
  path: join(OUT, "..", "..", "simulation-results", "30kw", "plots", "lisn-precompliance.svg"),
  series: [mk(1, "DM 1-lane (30 kW)"), mk(2, "DM 2-lane (60 kW)", "#3A6B8C"), mk(4, "DM 4-lane (120 kW)", "#3A6B45"), mk("cm", "CM est.", "#A83232"), mk("lim", "Class A QP", "#666")] });
console.log(`Worst margin: ${f(worstMargin)} dB at ${f(worstAt / 1e3, 0)} kHz (positive = under limit).`);
console.log(`Interleave benefit at first surviving DM harmonic: 2-lane +${f(dbuv(Ih(3)) - dbuv(Ih(4) * 1), 0)}-class dB shift upward in frequency; 4-lane pushes first full harmonic to 200 kHz where filter gives ${f(-10 * Math.log10(attDM(200e3)), 1)} dB.`);
console.log("→ calculations/out/lisn-precompliance.csv, plots/lisn-precompliance.svg");
