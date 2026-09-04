// ct-frontend.mjs — R2 closure deck (§G additions): resonant CT front-end at the corrected
// 2.0 Ω burden (CB-16) + AVMID buffer stability with the MR-11 dual-feedback network.
// Two questions, answered by simulation instead of assertion:
//   1. Does the AVMID buffer (behavioral 10 MHz-GBW op-amp) ring or oscillate into its 10 µF
//      reservoir with the rev-D network (4.7 Ω isolation, 10 k DC / 100 pF AC feedback)?
//      The rev-C topology (op-amp OUT hard-tied to the 10 µF) is run side-by-side as the
//      regression baseline — it is expected to ring/oscillate.
//   2. Does the corrected resonant chain (46 A rms → 1:100 → 2.0 Ω → 1 k/1 nF) keep the ADC
//      node inside the rails with F.11 (70 A pk) representable at 3.05 V?
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

function ctDeck(ipk) {
  // resonant primary ipk A at 140 kHz → CT 1:100 → 2.0 Ω burden biased at AVMID 1.65 V stiff
  return `* resonant CT front-end, corrected burden (CB-16): Ipri_pk=${ipk} A
VAV avmid 0 1.65
ICT avmid b SIN(0 ${ipk / 100} 140k)
RB b avmid 2.0
RF b adc 1k
CF adc avmid 220p
VDD vdd 0 3.3
DP adc vdd DCLMP
DN 0 adc DCLMP
.model DCLMP D(Is=1e-9 N=1.05 Rs=1)
.tran 20n 200u 0 10n uic
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
// 2a. full-load resonant: 46 A rms = 65 A pk → ADC within rails, no clamp conduction
{
  const r = runDeck("ctfe-res-65", ctDeck(65).replace("NAME.out", "ctfe-res-65.out"), ["adc", "b"]);
  const hi = maxIn(r.t, r.cols.adc, 50e-6, 200e-6), lo = minIn(r.t, r.cols.adc, 50e-6, 200e-6);
  push("res-fullload-65Apk", "ADC max (V)", f(hi), "≤3.2", hi <= 3.2);
  push("res-fullload-65Apk", "ADC min (V)", f(lo), "≥0.1", lo >= 0.1);
}
// 2b. F.11 threshold: 70 A pk must land at ~3.05 V (representable, above full-load peak)
{
  const r = runDeck("ctfe-res-70", ctDeck(70).replace("NAME.out", "ctfe-res-70.out"), ["adc", "b"]);
  const hi = maxIn(r.t, r.cols.adc, 50e-6, 200e-6);
  push("res-F11-70Apk", "ADC peak (V)", f(hi), "3.02±0.1 & ≤3.3", Math.abs(hi - 3.02) < 0.1 && hi <= 3.3);
}
writeFileSync(join(RES, "ct-frontend.csv"),
  "# ngspice-46; R2 §G closure deck — AVMID dual-feedback stability (MR-11) + corrected resonant burden (CB-16); behavioral 10 MHz op-amp\n" +
  rows.map(r => r.join(",")).join("\n") + "\n");
console.log(pass ? "\nCT FRONT-END DECK: ALL PASS" : "\nCT FRONT-END DECK: FAILURES");
process.exit(pass ? 0 : 1);
