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
// 3rd stage (E22 → E43 rev): dedicated DM chokes into the CX2 trio, now 4.7 µF X1. The choke's
// CREST-BIASED inductance is what attenuates at the worst emission moment — the E43 finding:
// the old model used 22 µH FLAT while the drawn part computed ~7–8 µH at the 82 A crest. The
// per-variant biased values come from the D6 engine (dm-choke-design.mjs, conservative anchors).
import { readFileSync } from "node:fs";
const D6 = JSON.parse(readFileSync(join(OUT, "dm-choke-design.json"), "utf8"));
const CX2 = 4.7e-6;
const attDM3 = (fHz, L3) => { const x = fHz / f0, xd = fHz / (1 / (2 * Math.PI * Math.sqrt(L3 * CX2)));
  const per = x > 1 ? 1 / (x * x) : 1, perD = xd > 1 ? 1 / (xd * xd) : 1;
  return Math.max(per * per * perD, 1e-12); };
const attDM = (fHz) => attDM3(fHz, D6["30kw"].Lpk * 1e-6);   // legacy lane columns ride the 30 kW part
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
// ---- E43: per-MODULE-VARIANT DM margins — each variant's own ripple source (dIpp) through its
// own crest-biased D6 + the 4.7 µF CX2. This is the check the 22 µH-flat model could not do.
{
  const VAR = { "30kw": 21.4, "40kw": 28.0, "50kw": 34.8 };
  console.log("Per-variant DM worst margins (single lane, crest-biased L, CX2 4.7 µF):");
  for (const [sku, dipp] of Object.entries(VAR)) {
    const L3 = D6[sku].Lpk * 1e-6;
    let wm = 1e9, wa = 0;
    for (let n = 3; n * FSW <= 30e6; n++) {
      const fHz = n * FSW; if (fHz < 150e3) continue;
      const iRes = ((8 * dipp) / (Math.PI * Math.PI * n * n)) * attDM3(fHz, L3);
      const m = limitA(fHz) - dbuv(iRes * 25);
      if (m < wm) { wm = m; wa = fHz; }
    }
    console.log(`  ${sku}: D6 ${D6[sku].stack}x ${D6[sku].geom.split(" ")[0]} L(pk)=${D6[sku].Lpk} µH → worst DM margin ${f(wm)} dB at ${f(wa / 1e3, 0)} kHz`);
    if (wm < 3) { console.log(`  ${sku}: MARGIN UNDER +3 dB — D6/CX2 rev insufficient`); process.exitCode = 1; }
  }
}
console.log(`Interleave benefit at first surviving DM harmonic: 2-lane +${f(dbuv(Ih(3)) - dbuv(Ih(4) * 1), 0)}-class dB shift upward in frequency; 4-lane pushes first full harmonic to 200 kHz where filter gives ${f(-10 * Math.log10(attDM(200e3)), 1)} dB.`);
console.log("→ calculations/out/lisn-precompliance.csv, plots/lisn-precompliance.svg");
