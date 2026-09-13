// prechg-disch.mjs — R2 closure deck (§G additions / HR-14): precharge, bus discharge and bank
// bleed at ALL THREE SKU capacitances — the original §25 runs existed for 30 kW only while the
// firmware/EOL constants were silently 30 kW-shaped. Verifies, per SKU:
//   · precharge (475 VAC worst, 2×33 Ω in L1/L2, 6-pulse): t95, Ipk, per-resistor energy
//   · firmware F.20 as coded (abort iff t>400 ms AND bus<50 % line pk): must NOT trip
//   · bus discharge 640 Ω from 850 V: t(<60 V) vs per-SKU PMP_DISCH_TO_MS (3.0/5.5/9.0 s)
//   · bank bleed 8.8 kΩ from 500 V (film-only banks, E68c): t(<60 V) vs the registered F.21b window
// Run: node spice/protection/prechg-disch.mjs
import { runDeck } from "../run.mjs";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const RES = join(HERE, "..", "..", "simulation-results", "30kw");
const f = (x, d = 1) => Number(x.toFixed(d));

// E60: the product SKUs (link halves 5/6/8 × 470 µF in series · bank strings 2/3/4 × 235 µF ·
// PMP_DISCH_TO_MS 3000/4000/5000 · F.21b = 2.5·τ, τ = 8.8 k·C_bank) — the retired 60/120 kW rows are gone
const SKUS = [
  // E68c: the banks are film-only — 9 / 12 / 14 × 2.2 µF — and top out at 500 V (E67). The bleed limit stays the registered F.21b
  // window (2.5·τ of the retired E60 strings, protection-thresholds): it now holds by a wide margin.
  { name: "30kw", Cs: 5 * 470e-6 / 2, Cbank: 9 * 2.2e-6, dischTO: 3.0, bleedTO: 10.34 },
  { name: "40kw", Cs: 6 * 470e-6 / 2, Cbank: 12 * 2.2e-6, dischTO: 4.0, bleedTO: 15.51 },
  { name: "50kw", Cs: 8 * 470e-6 / 2, Cbank: 14 * 2.2e-6, dischTO: 5.0, bleedTO: 20.68 },   // 50kwa identical link/banks
];

const prechgDeck = (Cs) => `* precharge per-SKU: 475 VAC, 2x33R in L1/L2, 6-pulse into ${Cs * 1e3} mF eq
VA a 0 SIN(0 ${475 * Math.SQRT2 / Math.sqrt(3)} 50 0 0 0)
VB b 0 SIN(0 ${475 * Math.SQRT2 / Math.sqrt(3)} 50 0 0 120)
VC c 0 SIN(0 ${475 * Math.SQRT2 / Math.sqrt(3)} 50 0 0 240)
RPA a af 33
RPB b bf 33
RC c cf 0.01
D1 af p DR
D2 bf p DR
D3 cf p DR
D4 n af DR
D5 n bf DR
D6 n cf DR
.model DR D(Is=1e-9 N=1.5 Rs=0.01)
CBUS p n ${Cs} ic=0
RBLD p n 200k
.tran 50u 1.2 0 20u uic
.option method=gear reltol=1e-3 abstol=1e-6
.control
set filetype=ascii
run
wrdata NAME.out v(p,n) i(VA)
quit
.endc
.end`;

const rcDeck = (tag, C, R, V0, tstop) => `* ${tag}: ${C} F from ${V0} V into ${R} ohm
CB p 0 ${C} ic=${V0}
RD p 0 ${R}
.tran ${tstop / 4000} ${tstop} 0 ${tstop / 2000} uic
.control
set filetype=ascii
run
wrdata NAME.out v(p)
quit
.endc
.end`;

const rows = [["case", "t95_or_t60_s", "Ipk_A", "E_per_R_J", "fw_limit_s", "verdict"]];
let pass = true;
const push = (c, t, ipk, e, lim, ok) => { rows.push([c, t, ipk, e, lim, ok ? "PASS" : "FAIL"]); if (!ok) pass = false; console.log(`${c}: t=${t}s Ipk=${ipk} E/R=${e}J (limit ${lim}s) → ${ok ? "PASS" : "FAIL"}`); };

for (const s of SKUS) {
  // --- precharge
  {
    const vpk = 475 * Math.SQRT2; // line-line peak = steady-state target
    const r = runDeck(`pre-${s.name}`, prechgDeck(s.Cs).replace("NAME.out", `pre-${s.name}.out`), ["vbus", "ia"]);
    let t95 = NaN, v400 = 0, ipk = 0, eR = 0;
    for (let i = 1; i < r.t.length; i++) {
      const v = r.cols.vbus[i], ia = Math.abs(r.cols.ia[i]), dt = r.t[i] - r.t[i - 1];
      if (isNaN(t95) && v >= 0.95 * vpk) t95 = r.t[i];
      if (r.t[i] <= 0.4 && v > 0) v400 = v;
      if (ia > ipk) ipk = ia;
      eR += ia * ia * 33 * dt; // phase-A resistor energy (upper bound of the two)
    }
    const f20ok = v400 >= 0.5 * vpk;             // firmware F.20: must be >50% at 400 ms
    push(`precharge-${s.name}`, f(t95, 3), f(ipk, 1), f(eR, 0), "F.20 50%@0.4s", !isNaN(t95) && f20ok && t95 < 1.0);
  }
  // --- bus discharge
  {
    const r = runDeck(`dis-${s.name}`, rcDeck("bus-discharge", s.Cs, 640, 850, s.dischTO * 1.4).replace("NAME.out", `dis-${s.name}.out`), ["vbus"]);
    let t60 = NaN;
    for (let i = 0; i < r.t.length; i++) if (r.cols.vbus[i] < 60) { t60 = r.t[i]; break; }
    const eR = 0.5 * s.Cs * 850 * 850 / 4;
    push(`discharge-${s.name}`, f(t60, 2), "1.33", f(eR, 0), s.dischTO, !isNaN(t60) && t60 < s.dischTO);
  }
  // --- bank bleed
  {
    const r = runDeck(`bleed-${s.name}`, rcDeck("bank-bleed", s.Cbank, 8800, 500, 8800 * s.Cbank * 6).replace("NAME.out", `bleed-${s.name}.out`), ["vbank"]);
    let t60 = NaN;
    for (let i = 0; i < r.t.length; i++) if (r.cols.vbank[i] < 60) { t60 = r.t[i]; break; }
    const eR = 0.5 * s.Cbank * 500 * 500 / 4;
    push(`bankbleed-${s.name}`, f(t60, 2), "0.06", f(eR, 0), s.bleedTO, !isNaN(t60) && t60 < s.bleedTO);
  }
}
writeFileSync(join(RES, "prechg-disch-sku.csv"),
  "# ngspice-46; R2/HR-14 closure — per-SKU precharge/discharge/bank-bleed vs the per-SKU firmware+EOL constants\n" +
  rows.map(r => r.join(",")).join("\n") + "\n");
console.log(pass ? "\nPRECHG/DISCH PER-SKU DECK: ALL PASS" : "\nPRECHG/DISCH PER-SKU DECK: FAILURES");
process.exit(pass ? 0 : 1);
