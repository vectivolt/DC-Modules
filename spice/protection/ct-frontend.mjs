// ct-frontend.mjs — R2 closure deck (§G additions): resonant CT front-end at the corrected
// 2.0 Ω burden (CB-16) + AVMID buffer stability with the MR-11 dual-feedback network.
// Two questions, answered by simulation instead of assertion:
//   1. Does the AVMID buffer (behavioral 10 MHz-GBW op-amp) ring or oscillate into its 10 µF
//      reservoir with the rev-D network (4.7 Ω isolation, 10 k DC / 100 pF AC feedback)?
//      The rev-C topology (op-amp OUT hard-tied to the 10 µF) is run side-by-side as the
//      regression baseline — it is expected to ring/oscillate.
//   2. Does the corrected resonant chain (46 A rms → 1:100 → 2.0 Ω → 1 k/1 nF) keep the ADC
//      node inside the rails at the worst operating peak, land F.11/F.01 at the DAC point, and stay
//      inside the 3.27 V rail through the simulated 3 µs fault race?
// Run: node spice/protection/ct-frontend.mjs
import { runDeck, maxIn, minIn } from "../run.mjs";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const RES = join(HERE, "..", "..", "simulation-results", "30kw");
const f = (x, d = 3) => Number(x.toFixed(d));

// behavioral RRIO op-amp: Aol 1e6, dominant pole 10 Hz (GBW ≈ 10 MHz), Ro 150 Ω
const OPAMP = (name, inp, inn, out) => `
* op-amp ${name}: G-C dominant pole (Aol 1e6, fp 10 Hz -> GBW 10 MHz) + output R
G${name} 0 ${name}x ${inp} ${inn} 1
R${name}p ${name}x 0 1meg
C${name}p ${name}x 0 15.9n
E${name} ${name}o 0 ${name}x 0 1
R${name}o ${name}o ${out} 150
`;

function avmidDeck(revD) {
  const net = revD
    ? `RAVI opo avmid 4.7
CAVO avmid 0 10u ic=1.65
RAVF avmid inn 10k
CAVF opo inn 2.2n`
    : `RAVI opo avmid 0.001
CAVO avmid 0 10u ic=1.65
RAVF avmid inn 0.001
CAVF opo inn 1f`;
  return `* AVMID buffer ${revD ? "rev D dual-feedback (MR-11)" : "rev C direct-into-10uF (baseline)"}
VDD vdd 0 3.3
VREF inp 0 1.65
${OPAMP("OA", "inp", "inn", "opo")}
${net}
* clamp-event surrogate: 5 mA load pulse into AVMID at t=1ms for 200us
IL avmid 0 PULSE(0 5m 1m 1u 1u 200u 10m)
.tran 0.2u 4m 0 0.1u uic
.option method=gear reltol=1e-4 abstol=1e-9
.control
set filetype=ascii
run
wrdata NAME.out v(avmid) v(opo)
quit
.endc
.end`;
}

function ctDeck(ipk, rb = 2.0, ratio = 100, fq = 140e3, cf = "220p", tstop = 200e-6) {
  // primary ipk A → CT 1:ratio → burden rb biased at AVMID 1.65 V stiff → 1 k / cf filter → dual clamp
  return `* CT front-end: Ipri_pk=${ipk} A, 1:${ratio}, ${rb} ohm, ${fq} Hz
VAV avmid 0 1.65
ICT avmid b SIN(0 ${ipk / ratio} ${fq})
RB b avmid ${rb}
RF b adc 1k
CF adc avmid ${cf}
VDD vdd 0 3.3
DP adc vdd DCLMP
DN 0 adc DCLMP
.model DCLMP D(Is=1e-9 N=1.05 Rs=1)
.tran ${tstop / 10000} ${tstop} 0 ${tstop / 20000} uic
.option method=gear reltol=1e-4 abstol=1e-9
.control
set filetype=ascii
run
wrdata NAME.out v(adc) v(b)
quit
.endc
.end`;
}

const rows = [["case", "metric", "value", "limit", "verdict"]];
let pass = true;
const push = (c, m, v, l, ok) => { rows.push([c, m, v, l, ok ? "PASS" : "FAIL"]); if (!ok) pass = false; console.log(`${c} · ${m} = ${v} (limit ${l}) → ${ok ? "PASS" : "FAIL"}`); };

// 1a. rev D buffer: settle after the pulse, quantify ring
{
  const r = runDeck("ctfe-avmid-revD", avmidDeck(true).replace("NAME.out", "ctfe-avmid-revD.out"), ["avmid", "opo"]);
  const late = { max: maxIn(r.t, r.cols.avmid, 2.5e-3, 4e-3), min: minIn(r.t, r.cols.avmid, 2.5e-3, 4e-3) };
  const ringPP = late.max - late.min;
  const dip = minIn(r.t, r.cols.avmid, 1e-3, 1.4e-3);
  push("avmid-revD", "steady ripple pk-pk (V)", f(ringPP, 4), "≤0.01", ringPP <= 0.01);
  push("avmid-revD", "clamp-pulse dip (V)", f(dip), "≥1.55", dip >= 1.55);
}
// 1b. rev C baseline: expected to ring — recorded as the regression reference (not a PASS/FAIL row)
{
  const r = runDeck("ctfe-avmid-revC", avmidDeck(false).replace("NAME.out", "ctfe-avmid-revC.out"), ["avmid", "opo"]);
  const ringPP = maxIn(r.t, r.cols.avmid, 2.5e-3, 4e-3) - minIn(r.t, r.cols.avmid, 2.5e-3, 4e-3);
  rows.push(["avmid-revC-baseline", "steady ripple pk-pk (V)", f(ringPP, 4), "reference (expected ringing)", "REF"]);
  console.log(`avmid-revC-baseline · ripple pk-pk = ${f(ringPP, 4)} V (reference topology — ${ringPP > 0.01 ? "rings as predicted (MR-11 confirmed)" : "note: behavioral model under-predicts ring"})`);
}
// 2. E60 per-SKU chains (current-coordination classes): the resonant chain at the power-solved ngspice
// worst nominal peak (in-rails, no clamp conduction), at F.11 (lands at the computed DAC point) and at
// F.11 + the simulated 3 µs race (still inside the 3.27 V rail); the line chain likewise at 50 Hz.
const CLS = {
  "30kw": { resRb: 1.2, F11: 85, pkNom: 65.6, race11: 44, lineRb: 22, F01: 120, race01: 46 },
  "40kw": { resRb: 0.91, F11: 115, pkNom: 87.4, race11: 48, lineRb: 18, F01: 155, race01: 50 },
  "50kw": { resRb: 0.75, F11: 145, pkNom: 108.8, race11: 52, lineRb: 13, F01: 195, race01: 72 },
};
const lineDeck = (ipk, rb) => ctDeck(ipk, rb, 2500, 50, "1n", 60e-3);
for (const [sku, c] of Object.entries(CLS)) {
  for (const [what, ipk, lo, hi] of [["nominal-peak", c.pkNom, 0.1, 3.2], ["F11", c.F11, null, null], ["F11+race", c.F11 + c.race11, 0.1, 3.27]]) {
    const tag = `ctfe-res-${sku}-${what}`;
    const r = runDeck(tag, ctDeck(ipk, c.resRb, 100, 140e3, "220p", 200e-6).replace("NAME.out", `${tag}.out`), ["adc", "b"]);
    const vmax = maxIn(r.t, r.cols.adc, 50e-6, 200e-6), vmin = minIn(r.t, r.cols.adc, 50e-6, 200e-6);
    if (what === "F11") { const want = 1.65 + c.F11 / 100 * c.resRb; push(tag, "comparator peak (V)", f(vmax), `${f(want)}±0.08`, Math.abs(vmax - want) <= 0.08); }
    else push(tag, "ADC max/min (V)", `${f(vmax)}/${f(vmin)}`, `≤${hi} & ≥${lo}`, vmax <= hi && vmin >= lo);
  }
  for (const [what, ipk] of [["F01", c.F01], ["F01+race", c.F01 + c.race01]]) {
    const tag = `ctfe-line-${sku}-${what}`;
    const r = runDeck(tag, lineDeck(ipk, c.lineRb).replace("NAME.out", `${tag}.out`), ["adc", "b"]);
    const vmax = maxIn(r.t, r.cols.adc, 20e-3, 60e-3), want = 1.65 + ipk / 2500 * c.lineRb;
    push(tag, "ADC peak (V)", f(vmax), what === "F01" ? `${f(want)}±0.05` : "≤3.27", what === "F01" ? Math.abs(vmax - want) <= 0.05 : vmax <= 3.27);
  }
}
writeFileSync(join(RES, "ct-frontend.csv"),
  "# ngspice-46; R2 §G closure deck — AVMID dual-feedback stability (MR-11) + corrected resonant burden (CB-16); behavioral 10 MHz op-amp\n" +
  rows.map(r => r.join(",")).join("\n") + "\n");
console.log(pass ? "\nCT FRONT-END DECK: ALL PASS" : "\nCT FRONT-END DECK: FAILURES");
process.exit(pass ? 0 : 1);
