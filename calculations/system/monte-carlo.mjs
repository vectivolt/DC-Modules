// monte-carlo.mjs — §37 tolerance analysis, executed (not nominal-only sign-off).
// Batches (10,000 samples each unless noted):
//  A) Resonant tank, E67 full bridge per SKU (tanks.mjs): Lr = D2 external inductor ±3 % + two D3 cells' leakage ±30 % + loop
//     stray ±20 %; Cr ±5 %; Lm gap-ground ±7 %. Requirement: FHA peak gain ≥ M = n·500/830 at the 500 V-bank mode edge, and
//     the magnetizing current at fr charges a leg's node capacitance inside the dead time (ZVS). (The E7 batch sampled the
//     retired 3-section tank — 7 µH / 185 nF — and passed on a design that no longer existed.)
//  B) PFC choke ±12% (core AL lot + turns) → worst-θ ripple + soft-sat floor.
//  C) Output-V sense chain: 8× 1% top (independent) + 0.1% bottom + iso 0.5% + ADC ref 0.5%
//     + drift 50 ppm/°C×40 °C → pre-cal and post-2-pt-cal accuracy vs ±0.5% spec.
//  D) Output-I chain: shunt 0.5% + amp gain 1% + offset 100 µV/50 mV → vs ±1% spec (post-cal).
//  F) Dead-time/Vth/driver-delay spread on the LLC full-bridge legs: shoot-through margin check.
// Run: node calculations/system/monte-carlo.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { TANKS } from "../llc/tanks.mjs";
import { D2, D3, D3_CELLS, d3Leakage, LOOP_STRAY } from "../magnetics/magnetics-envelope.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
mkdirSync(OUT, { recursive: true });
const f = (x, d = 3) => Number(x.toFixed(d));
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const unif = (lo, hi) => lo + (hi - lo) * rnd();
const gauss = (mu, sig) => { let u = 0, v = 0; while (!u) u = rnd(); v = rnd(); return mu + sig * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const N = 10000, LN = 9;
const gain = (fn, Q, Ln) => 1 / Math.hypot(1 + (1 / Ln) * (1 - 1 / (fn * fn)), Q * (fn - 1 / fn));
const pct = (arr, p) => arr.slice().sort((a, b) => a - b)[Math.floor(p / 100 * (arr.length - 1))];

const report = [];
// ---- A: tank (E67 full bridge, per SKU)
for (const [sku, t] of Object.entries(TANKS)) {
  let frArr = [], gpkArr = [], imArr = [], zvsFail = 0, gainFail = 0;
  const Mneed = (t.n * 500) / 830, llk = d3Leakage(D3[sku]), L2 = D2[sku].Lnom;
  for (let i = 0; i < N; i++) {
    const Lr = L2 * unif(0.97, 1.03) + D3_CELLS * llk * unif(0.7, 1.3) + LOOP_STRAY * unif(0.8, 1.2);
    const Cr = t.Cr * unif(0.95, 1.05);
    const Lm = t.Lm * unif(0.93, 1.07);
    const fr = 1 / (2 * Math.PI * Math.sqrt(Lr * Cr));
    const Rac = ((8 * t.n * t.n) / Math.PI ** 2) * 500 * 500 / t.P;
    const Q = Math.sqrt(Lr / Cr) / Rac, Ln = Lm / Lr;
    let gpk = 0; for (let fn = 0.55; fn < 1.2; fn += 0.005) gpk = Math.max(gpk, gain(fn, Q, Ln));
    const im = (t.n * 500) / (4 * fr * Lm);
    frArr.push(fr / 1e3); gpkArr.push(gpk); imArr.push(im);
    if (gpk < Mneed) gainFail++;
    if (im * 120e-9 < 2 * t.coss * 830) zvsFail++;   // a leg's two node capacitances swung inside the 120 ns dead time
  }
  report.push([`A tank ${sku}`, `fr ${f(pct(frArr, 1), 1)}–${f(pct(frArr, 99), 1)} kHz (1–99%)`, `FHA peak gain p1=${f(pct(gpkArr, 1))} (need ${f(Mneed)}) → fail ${f(100 * gainFail / N, 2)}%`, `Im p1=${f(pct(imArr, 1), 1)} A · ZVS fail ${f(100 * zvsFail / N, 2)}%`, (gainFail / N <= 0.001 && zvsFail === 0) ? "PASS (FHA floor — the ngspice gain-worst corner is the proof)" : "MARGIN-FAIL"]);
}
// ---- B: PFC choke — E60 re-point to the DRAWN D1-30 rev B (3× 0077908A7 catalog core, AL 37 nH/T²
// ±8 % lot, le 196 mm, N = 39 with the winder's ±1-turn lot-trim) against its OWN acceptance rows
// (L0 150–185 µH, L@78 A ≥ 75 µH). Rev A's N=36 geometric model (Ae 2.62, le 201) was retired at E51
// but this batch kept it. Ripple is informational here: the cycle-by-cycle Vienna sim owns the peak
// (current-coordination F.01) and proved the 150 kHz EMI basis conservative.
{
  // Two roll-off curves, two questions: YIELD uses the catalog GUARANTEED minimum (80 %@95 Oe,
  // 50 %@205 Oe → µ = 1/(1+6.83e-5·H^1.802)) — what real cores do at worst; MARGIN (stress-audit
  // floors) keeps the deliberately pessimistic design fit (80 %@75, 50 %@175). On the pessimistic fit
  // ~19 % of low-AL lots cannot be trimmed to the 75 µH row — that is the fit's conservatism, not the part.
  let accFail = 0, accFailFit = 0, worstR = 0;
  const muPU = (H) => 1 / (1 + 2.13e-4 * Math.pow(H / 79.577, 1.637));
  const muMin = (H) => 1 / (1 + 6.83e-5 * Math.pow(H / 79.577, 1.802));
  for (let i = 0; i < N; i++) {
    const kAL = unif(0.92, 1.08), le = 0.196;
    const L0n = (n) => 37e-9 * kAL * 3 * n * n;
    const okN = (n, mu) => L0n(n) >= 150e-6 && L0n(n) <= 185e-6 && mu(n * 78 / le) * L0n(n) >= 75e-6;
    const Nt = [38, 39, 40, 41].find((n) => okN(n, muMin)) ?? 39;       // winder's lot-trim card: first N meeting BOTH rows
    if (![38, 39, 40, 41].some((n) => okN(n, muPU))) accFailFit++;
    let dImax = 0;
    for (let k = 1; k < 40; k++) {
      const th = Math.PI * k / 40, iTh = 77.7 * Math.sin(th);
      const L = muPU(Nt * iTh / le) * L0n(Nt);
      dImax = Math.max(dImax, (269.4 * Math.sin(th) * (1 - 0.649 * Math.sin(th))) / (50e3 * L));
    }
    worstR = Math.max(worstR, dImax);
    if (!okN(Nt, muMin)) accFail++;
  }
  report.push(["B PFC choke lot ±8 % + trim", `worst ΔIpp ${f(worstR, 1)} A at bus 830 (single-phase formula on the pessimistic fit — vienna-switched owns the peak)`, `acceptance yield on the catalog-minimum curve: fail ${100 * accFail / N}% (pessimistic fit, informational: ${f(100 * accFailFit / N, 1)}%)`, `F.01 120 A pk (E60)`, accFail === 0 ? "PASS" : "CHECK"]);
}
// ---- C: Vout accuracy
{
  let pre = [], post = [];
  for (let i = 0; i < N; i++) {
    let top = 0; for (let k = 0; k < 8; k++) top += 475e3 * (1 + gauss(0, 0.01 / 3));
    const bot = 6.8e3 * (1 + gauss(0, 0.001 / 3));
    const iso = 1 + gauss(0, 0.005 / 3), adc = 1 + gauss(0, 0.005 / 3);
    const ratioErr = (top / (8 * 475e3)) / (bot / 6.8e3) * iso * adc - 1;
    pre.push(100 * ratioErr);
    const drift = gauss(0, 50e-6 * 40 / 3) + gauss(0, 0.0008 / 3); // tempco ±40 °C + aging/1yr class
    post.push(100 * drift);
  }
  report.push(["C Vout chain", `pre-cal ±${f(Math.max(-pct(pre, 0.5), pct(pre, 99.5)), 2)}% (99% CI) → CAL REQUIRED`, `post-2pt-cal ±${f(Math.max(-pct(post, 0.5), pct(post, 99.5)), 2)}% over ±40 °C`, "spec ±0.5%", Math.max(-pct(post, 0.5), pct(post, 99.5)) <= 0.5 ? "PASS (with EOL cal)" : "FAIL"]);
}
// ---- D: Iout accuracy
{
  let post = [];
  for (let i = 0; i < N; i++) {
    const drift = gauss(0, 30e-6 * 40 / 3) + gauss(0, 0.002 / 3) + gauss(0, 100e-6 / 50e-3 / 3 * 0.1);
    post.push(100 * drift);
  }
  report.push(["D Iout chain", `post-cal ±${f(Math.max(-pct(post, 0.5), pct(post, 99.5)), 2)}% (99% CI, ±40 °C)`, "shunt tempco 30 ppm class + amp drift", "spec ±1%", Math.max(-pct(post, 0.5), pct(post, 99.5)) <= 1 ? "PASS (with EOL cal)" : "FAIL"]);
}
// ---- F: dead-time margin
{
  let minMargin = 1e9;
  for (let i = 0; i < N; i++) {
    const dt = 120e-9 + gauss(0, 8e-9); // HRTIM dead-time gen ±jitter
    const dProp = gauss(0, 15e-9 / 3) - gauss(0, 15e-9 / 3); // driver prop-delay mismatch (NSI6611 class ±15 ns 3σ)
    const tOff = unif(20e-9, 45e-9); // gate fall to channel-off spread w/ Rg/Vth ±
    minMargin = Math.min(minMargin, dt + dProp - tOff);
  }
  report.push(["F dead-time", `min margin ${f(minMargin * 1e9, 1)} ns across N=10k (dt 120 ns nom)`, "shoot-through requires margin ≤0", "", minMargin > 20e-9 ? "PASS" : "CHECK"]);
}

const csv = [["batch", "result1", "result2", "result3", "verdict"], ...report];
writeFileSync(join(OUT, "monte-carlo.csv"), csv.map(r => r.map(c => `"${c}"`).join(",")).join("\n") + "\n");
for (const r of report) console.log(r.join(" | "));
console.log("→ calculations/out/monte-carlo.csv");
