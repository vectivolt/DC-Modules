// lisn-precompliance.mjs — §26 conducted-emissions PRE-COMPLIANCE ESTIMATE (never a compliance claim).
// DM path: PFC choke ripple spectrum (triangular, 50 kHz, worst-θ 21.4 App per phase) with N-lane
// interleave comb cancellation → the drawn per-phase DM ladder (E68: 3 star X2 stages + 2 CM-choke leakages) → LISN 50 Ω.
// CM path: node dv/dt (DPT: 46 V/ns eff.) × heatsink capacitance 200 pF spectrum → drawn two-stage ladder (E65:
// Y 3×4.7 nF at AC1..3 and at AC1M..3M, CM chokes 2 mH each, nanocrystalline µ(f)) — gated ≥ +3 dB like DM.
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
// E68 (InfyPower filter): the DM path is solved as the DRAWN per-phase ladder, like the CM path — current injected at the
// converter node, divided stage by stage toward a 50 Ω per-line LISN. Star X caps enter at their own value; a Δ cap enters
// as its per-phase star equivalent 3·C. Drawn E68: LF─CX0 4.7 µF★─CMC1 L_lk─CX1 4.7 µF★─CMC2 L_lk─CX2 4.7 µF★─PFC (no DM choke).
// The retired E65 filter (CMC1 L_lk─CX1 2.2 µF Δ─CMC2 L_lk + D6 crest L─CX2 4.7 µF Δ) is the control on the same model.
import { readFileSync } from "node:fs";
const D6 = JSON.parse(readFileSync(join(OUT, "dm-choke-design.json"), "utf8"));
const cx = (re, im = 0) => ({ re, im }), cadd = (a, b) => cx(a.re + b.re, a.im + b.im), cmul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cdiv = (a, b) => { const d = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const cabs = (a) => Math.hypot(a.re, a.im);
// net listed LISN → converter: { C } shunt (5 mΩ ESR) · { L } series (2 mΩ)
const dmLadder = (fHz, net) => {
  const w = 2 * Math.PI * fHz; let z = cx(50), gain = 1;
  for (const e of net) {
    if (e.C) { const zc = cx(5e-3, -1 / (w * e.C)); gain *= cabs(zc) / cabs(cadd(zc, z)); z = cdiv(cmul(z, zc), cadd(z, zc)); }
    else z = cadd(z, cx(2e-3, w * e.L));
  }
  return gain;
};
const X2 = 4.7e-6;
export const DM_E68 = (lk) => [{ C: X2 }, { L: lk }, { C: X2 }, { L: lk }, { C: 2 * X2 }];   // converter node: 2 × 4.7 µF★ per phase
const DM_E65 = (lk, Ld6) => [{ L: lk }, { C: 3 * 2.2e-6 }, { L: lk + Ld6 }, { C: 3 * 4.7e-6 }];
const attDM = (fHz) => dmLadder(fHz, DM_E68(9e-6));   // legacy lane columns (30 kW ripple) on the drawn filter, mid leakage
// CM: trapezoid dv/dt spectrum: Vn ≈ 2·Vbus/(π n)·sinc-ish with corner at 1/(π·tr); i_cm = Vn·ω·Cp
const TR = 9e-9, CP = 200e-12, VSW = 425;
// E65 (EMI-1): the CM path is solved as the DRAWN ladder, not a squared 30 kHz per-stage corner. Converter-side
// Norton source → Y trio on AC1..3 (CY1-3) → CMC2 (+LDM/3) → Y trio on AC1M..3M (CY4-6, E65) → CMC1 → LISN
// (3 lines in parallel, 50/3 Ω). verify-independent proves the netlist carries exactly this ladder. The
// 1709611 board had only the AC1..3 trio: CMC1+CMC2 were 4 mH in series against 14.1 nF (one stage).
// CMC impedance rolls off with the nanocrystalline µ: OpenMagnetics/MAS Nanoperm 30000 µi(f) (the D7 grade
// class); the 2 mH is the D7 10 kHz acceptance floor. Reading stays the conservative 25 Ω transimpedance
// (a CM LISN reads 50/3 Ω per line — +3.5 dB of unclaimed margin).
const NP30K = [[8363, 29447], [14990, 28789], [22916, 27641], [35828, 26352], [55177, 24061], [82343, 20676], [128991, 16070],
  [197906, 11856], [290747, 8852], [445846, 6397], [1045310, 3730], [3562636, 1838], [7401467, 1139], [18553035, 471]];
const muNano = (fHz) => { const k = NP30K.findIndex(([fq]) => fq >= fHz); if (k <= 0) return k ? NP30K.at(-1)[1] : NP30K[0][1];
  const [fa, ma] = NP30K[k - 1], [fb, mb] = NP30K[k]; return ma + (mb - ma) * Math.log(fHz / fa) / Math.log(fb / fa); };
const LCM = 2e-3, CY3 = 3 * 4.7e-9;
// current fraction reaching the LISN through series-L/shunt-C stages listed LISN → source
const ladder = (fHz, stages) => {
  const w = 2 * Math.PI * fHz, rr = muNano(fHz) / muNano(10e3);
  let zr = 50 / 3, zi = 0, gain = 1;
  for (const { L, C } of stages) {
    const sr = zr, si = zi + w * L * rr, ci = -1 / (w * C);           // series branch · shunt cap
    gain *= Math.abs(ci) / Math.hypot(sr, si + ci);                    // Zc/(Zc+Zs)
    const nr = -si * ci, ni = sr * ci, dr = sr, di = si + ci, d2 = dr * dr + di * di;   // Zs·Zc/(Zs+Zc)
    zr = (nr * dr + ni * di) / d2; zi = (ni * dr - nr * di) / d2;
  }
  return gain;
};
const CM_DRAWN = [{ L: LCM, C: CY3 }, { L: LCM, C: CY3 }];   // LISN←CMC1←CY4-6←CMC2←CY1-3 (LDM/3 ≈ 4 µH in the CM path: < 0.3 %, dropped)
const CM_1709611 = [{ L: 2 * LCM, C: CY3 }];                  // control: the single-trio board
const attCM = (fHz, st = CM_DRAWN) => ladder(fHz, st);

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
// ---- E43 → E68: per-MODULE-VARIANT DM margins — each variant's own ripple source (dIpp) through the drawn E68 ladder at both
// CM-leakage band edges, against the retired E65 filter (D6 crest L) on the same model. Gate: ≥ +3 dB AND no worse than
// the control — the E68 filter must attenuate at least as well as the filter E43 accepted.
{
  const VAR = { "30kw": 21.4, "40kw": 28.0, "50kw": 34.8 };
  const worst = (dipp, net) => { let wm = 1e9, wa = 0;
    for (let n = 3; n * FSW <= 30e6; n++) { const fHz = n * FSW; if (fHz < 150e3) continue;
      const m = limitA(fHz) - dbuv(((8 * dipp) / (Math.PI * Math.PI * n * n)) * dmLadder(fHz, net) * 25); if (m < wm) { wm = m; wa = fHz; } }
    return [wm, wa]; };
  console.log("Per-variant DM worst margins (E68 per-phase ladder, CM leakage band 6–12 µH):");
  for (const [sku, dipp] of Object.entries(VAR)) {
    const [m6, a6] = worst(dipp, DM_E68(6e-6)), [m12] = worst(dipp, DM_E68(12e-6)), [mc] = worst(dipp, DM_E65(6e-6, D6[sku].Lpk * 1e-6));
    console.log(`  ${sku}: 12× X2 4.7 µF (3 star stages, 2 per phase at the converter), no DM choke → worst DM margin ${f(m6)} dB at ${f(a6 / 1e3, 0)} kHz (L_lk 6 µH) · ${f(m12)} dB (12 µH) · [E65 control, D6 ${D6[sku].Lpk} µH crest] ${f(mc)} dB`);
    if (m6 < 3 || m6 < mc) { console.log(`  ${sku}: DM MARGIN UNDER +3 dB OR BELOW THE E65 CONTROL — E68 filter insufficient`); process.exitCode = 1; }
  }
}
// ---- E65 (EMI-1): CM margin gate on the drawn two-stage ladder — the CM path had no exit code at all
{
  const cmWorst = (cp, st) => {
    let wm = 1e9, wa = 0;
    for (let n = 3; n * FSW <= 30e6; n++) {
      const fHz = n * FSW, nCorner = 1 / (Math.PI * TR);
      const vn = (2 * VSW) / (Math.PI * n) * (fHz < nCorner ? 1 : nCorner / fHz);
      const m = limitA(fHz) - dbuv(vn * 2 * Math.PI * fHz * cp * attCM(fHz, st) * 25);
      if (m < wm) { wm = m; wa = fHz; }
    }
    return [wm, wa];
  };
  const [m0, a0] = cmWorst(CP, CM_DRAWN), [mc] = cmWorst(CP, CM_1709611);
  let cpMax = CP; while (cmWorst(cpMax + 10e-12, CM_DRAWN)[0] >= 3) cpMax += 10e-12;
  console.log(`CM (drawn ladder CY1-3 · CMC2 · CY4-6 · CMC1, µ(f) roll-off ${f(muNano(150e3) / muNano(10e3), 2)} at 150 kHz): worst margin ${f(m0)} dB at ${f(a0 / 1e3, 0)} kHz @ Cp ${CP * 1e12} pF`
    + ` · ${[400e-12, 600e-12].map((c) => `${c * 1e12} pF ${f(cmWorst(c, CM_DRAWN)[0])} dB`).join(" · ")} · Cp budget for +3 dB = ${f(cpMax * 1e12, 0)} pF switch-node→PE`);
  console.log(`  [1709611 control] one Y trio (CMC1+CMC2 = 4 mH vs 14.1 nF): worst CM margin ${f(mc)} dB — the +22 dB the squared-corner model printed was a second stage that was not drawn`);
  if (m0 < 3 || mc >= 3) { console.log("  CM MARGIN UNDER +3 dB (or the control no longer fails) — CM filter insufficient"); process.exitCode = 1; }
}
console.log(`Interleave benefit at first surviving DM harmonic: 2-lane +${f(dbuv(Ih(3)) - dbuv(Ih(4) * 1), 0)}-class dB shift upward in frequency; 4-lane pushes first full harmonic to 200 kHz where filter gives ${f(-10 * Math.log10(attDM(200e3)), 1)} dB.`);
console.log("→ calculations/out/lisn-precompliance.csv, plots/lisn-precompliance.svg");
