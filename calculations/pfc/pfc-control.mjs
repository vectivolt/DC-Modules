// pfc-control.mjs — Phase 5 (§21/§38): PFC current & voltage loop design.
// Method: analytical PI design on averaged plants + ngspice AC-sweep cross-check of the same
// compensated loop (B-source averaged model). Both results reported side by side.
// Plants (averaged, per-phase d-axis approx — full dq model in firmware phase):
//   Current loop:  Gid(s) = (VBUS/2) / (s·L + R)         L = 100 µH (biased line-cycle avg of 165→83 µH), R = 15 mΩ
//   Delay: 1.5·Tsw transport (PWM + sampling) → phase term  e^{-s·1.5/fsw}
//   Voltage loop:  power balance  C/2·dVbus²/dt = Pin − Pout → Gv(s) = (3/2·Vph_pk·kI)/ (s·C·VBUS/2...) — implemented numerically below
// Targets: current loop fc ≈ fsw/10 = 5 kHz, PM ≥ 50°; voltage loop fc ≈ 15 Hz (below 2×line/3 ripple), PM ≥ 60°.
// Run: node calculations/pfc/pfc-control.mjs

import { runDeck } from "../../spice/run.mjs";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const f = (x, d = 2) => Number(x.toFixed(d));

const FSW = 50e3, L = 100e-6, RL = 0.015, VHALF = 425, C = 1.175e-3, VBUS = 800;
const Vph_pk = 269.4, ETA = 0.965;

// ---------- current loop: PI via phase-margin placement
const fc_i = 3000, PM_i = 50;   // fsw/10=5 kHz unreachable: 1.5·Tsw delay costs 54° there; 3 kHz is the delay-limited choice
const wc = 2 * Math.PI * fc_i;
// plant gain/phase at wc (incl. 1.5 Tsw delay)
const delay = 1.5 / FSW;
const Gmag = VHALF / Math.hypot(wc * L, RL);
const Gph = -Math.atan2(wc * L, RL) * 180 / Math.PI - wc * delay * 180 / Math.PI;
// PI: Kp·(1 + wz/s): choose zone: phase of PI at wc = PM_i - 180 - Gph
const phiPI = Math.min(PM_i - 180 - Gph, -1);                // required PI phase (deg), must be negative (PI only lags)
const wz = wc * Math.tan(-phiPI * Math.PI / 180);            // PI(jw)=Kp(1 - j·wz/w) → ∠ = -atan(wz/w)
const KpI = 1 / (Gmag * Math.hypot(1, wz / wc));
const KiI = KpI * wz;
console.log(`CURRENT LOOP: plant @3 kHz: |G|=${f(Gmag, 1)}, ∠G=${f(Gph, 1)}°  → PI Kp=${f(KpI, 5)} Ki=${f(KiI, 2)} (zero @ ${f(wz / 2 / Math.PI, 0)} Hz)`);

// closed-loop check across frequency (analytical Bode of T = PI·G·delay)
function loopI(fHz) {
  const w = 2 * Math.PI * fHz;
  const magPI = KpI * Math.hypot(1, KiI / (KpI * w));
  const phPI = Math.atan2(-KiI / (KpI * w), 1);
  const magG = VHALF / Math.hypot(w * L, RL);
  const phG = -Math.atan2(w * L, RL) - w * delay;
  return { mag: magPI * magG, ph: (phPI + phG) * 180 / Math.PI };
}
let fcx = 0, pm = 0, gm = 0;
for (let fHz = 100; fHz < 25000; fHz *= 1.01) { const { mag } = loopI(fHz); if (mag >= 1) fcx = fHz; }
pm = 180 + loopI(fcx).ph;
for (let fHz = fcx; fHz < FSW; fHz *= 1.01) { const r = loopI(fHz); if (r.ph <= -180) { gm = -20 * Math.log10(r.mag); break; } }
console.log(`  analytical: fc=${f(fcx, 0)} Hz, PM=${f(pm, 1)}°, GM=${gm ? f(gm, 1) + " dB" : ">check band"}`);

// ---------- voltage loop
// Energy balance: d(½·C·Vbus²)/dt = Pin − Pout. Small-signal around VBUS: C·VBUS·dv/dt = ΔPin.
// Controller output = current amplitude ref Iref; Pin = 3/2·Vph_pk·Iref·η → Gv(s) = (3/2·Vph_pk·η)/(s·C·VBUS)
const fc_v = 15, PM_v = 65;
const wcv = 2 * Math.PI * fc_v;
const GmagV = (1.5 * Vph_pk * ETA) / (wcv * C * VBUS);
const phiPIv = Math.min(PM_v - 180 - (-90), -1);
const wzv = wcv * Math.tan(-phiPIv * Math.PI / 180);
const KpV = 1 / (GmagV * Math.hypot(1, wzv / wcv));
const KiV = KpV * wzv;
console.log(`VOLTAGE LOOP: Gv @15 Hz |G|=${f(GmagV, 2)} → PI Kp=${f(KpV, 4)} Ki=${f(KiV, 3)} (zero @ ${f(wzv / 2 / Math.PI, 1)} Hz)`);

// ---------- ngspice AC cross-check of the compensated current loop (averaged model)
// Loop broken at duty input: Vac injects; B-sources implement PI (via Laplace RC) and plant.
const deck = `* pfc averaged current-loop AC sweep (cross-check of analytical design)
VIN inj 0 DC 0 AC 1
* PI compensator: Kp + Ki/s  (RC realization: E + integrator via B-source and C)
* error = -v(inj) (loop broken at reference summing, unity feedback)
BPI piout 0 V= -(${KpI}*v(inj) + ${KiI}*v(integ))
BINT iint 0 I= -v(inj)
CINT integ 0 1 ic=0
RINT integ iint 1u
* delay ~ 1.5 Tsw via 2nd-order Pade on B-source is messy; approximate with RC chain matched at 5 kHz
* plant: (VHALF)/(sL+R) → current
BPL pl 0 V= v(piout)*${VHALF}
LPL pl ipl ${L}
RPL ipl 0 ${RL}
* loop output = plant current sensed across RPL/RL → v(ipl)... use current through RPL: v(ipl)=i*RL; scale to current:
BOUT out 0 V= v(ipl)/${RL}
.ac dec 40 10 50k
.control
set filetype=ascii
run
wrdata pfc-acloop.out vm(out) vp(out)
quit
.endc
.end`;
const r = runDeck("pfc-acloop", deck, ["mag", "ph"]);
let fcS = 0, pmS = 0;
for (let i = 0; i < r.t.length; i++) if (r.cols.mag[i] >= 1) fcS = r.t[i];
const idx = r.t.findIndex(fq => fq >= fcS);
// vp() is radians; compensator carries an explicit -1, so loop phase = ph_meas - 180 and PM = ph_meas(deg).
if (idx >= 0) pmS = (r.cols.ph[idx] * 180) / Math.PI;
const pmRecon = pmS - fcS * delay * 360;                     // subtract the 1.5·Tsw delay omitted in the SPICE deck
console.log(`  ngspice AC sweep: fc=${f(fcS, 0)} Hz, PM(no delay)=${f(pmS, 1)}° → with 1.5·Tsw delay: ${f(pmRecon, 1)}° vs analytical ${f(pm, 1)}° — ${Math.abs(pmRecon - pm) < 5 ? "CROSS-CHECK PASS" : "MISMATCH"}`);

writeFileSync(join(OUT, "pfc-loops.csv"), [
  "loop,Kp,Ki,fc_Hz,PM_deg,GM_dB,method",
  `current,${f(KpI, 5)},${f(KiI, 2)},${f(fcx, 0)},${f(pm, 1)},${gm ? f(gm, 1) : ""},analytical(with delay)`,
  `current,${f(KpI, 5)},${f(KiI, 2)},${f(fcS, 0)},${f(pmRecon, 1)},,ngspice AC + delay correction`,
  `voltage,${f(KpV, 4)},${f(KiV, 3)},${fc_v},${PM_v},,analytical (placement)`,
].join("\n") + "\n");
console.log("→ calculations/out/pfc-loops.csv");

// ---------- E65 (EMI-2): the current loop against the DRAWN input filter and the grid ----------
// Both loop models above (and vienna-switched) closed the current loop on a bare inductor / stiff grid. The drawn
// filter (E68: CX0 4.7 µF★ · CMC1 leakage · CX1 4.7 µF★ · CMC2 leakage · CX2 4.7 µF★ — the InfyPower star-X2 filter, no DM choke;
// E65 was CMC1 leakage · CX1 2.2 µF Δ · CMC2 leakage + D6 L(i) · CX2 4.7 µF Δ) peaks at 3–25 kHz, beside the 3 kHz
// crossover, and nothing damped it. Two checks, both able to fail:
//  (1) small-signal — converter admittance Y(s) = [1 − e^(−sTd)·H(s)·(ff − C(s)·G0)] / [s·L1 + C(s)·e^(−sTd)] (P or
//      PI current controller C, resistive emulation G0, feed-forward of the SENSED phase voltage through the drawn
//      SNS_VAC RC H) against the filter output impedance Zo (grid Lg/Rg of A9 + 0/100 µH, leakage band, D6 at L0 and
//      at crest, D1 at L0 and at crest, winding R only — no ESR/core-loss damping claimed). Nyquist winding count of
//      1 + Y·Zo (−1 encircled = unstable) and the modulus margin min|1 + Y·Zo| (≥ 0.5 ⇒ GM ≥ 6 dB, PM ≥ 29°).
//  (2) time-domain — vienna() with the filter states, the same RC-sensed feed-forward and a real sampling delay; a
//      sustained oscillation shows as grid-current content between 2 and 45 kHz.
import { readFileSync as readJson } from "node:fs";
import { vienna, D1, Ld1 } from "./vienna-switched.mjs";
{
  const CH = JSON.parse(readJson(join(OUT, "dm-choke-design.json"), "utf8"));
  // E81 / review G (F-G-5): the gate used to run on `2π·3 kHz·L_D1(Ipk, lot −8 %)` — close to, but not equal to, what the
  // firmware ships. The SHIPPED proportional gain is now READ OUT of firmware/hal/pfc.c and gated, so a HIL retune that
  // raises it has to pass this margin before it can land.
  const PFC_C = readJson(join(OUT, "..", "..", "firmware", "hal", "pfc.c"), "utf8");
  const kpm = PFC_C.match(/c->kp_i\s*=\s*\(kw == 50u\)\s*\?\s*([\d.]+)f\s*:\s*\(kw == 40u\)\s*\?\s*([\d.]+)f\s*:\s*([\d.]+)f;/);
  if (!kpm) throw new Error("pfc-control: could not read c->kp_i out of firmware/hal/pfc.c — the gate must run on the shipped gain");
  const KP_SHIP = { "50kw": +kpm[1], "40kw": +kpm[2], "30kw": +kpm[3] };
  const cx = (re, im = 0) => [re, im], cadd = (a, b) => [a[0] + b[0], a[1] + b[1]], csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cdiv = (a, b) => { const q = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / q, (a[1] * b[0] - a[0] * b[1]) / q]; };
  const cpar = (a, b) => cdiv(cmul(a, b), cadd(a, b));
  // drawn values (verify-independent proves them on every netlist): E68 X bank = 4.7 µF★ X2 at LF, AC·M and 2 × 4.7 µF★ at AC (one at
  // the converter node left 24 W in each damper R); E65 damper CDMP 2.2 µF + RDMP 10 Ω Δ across AC1..3; SNS_VAC divider 8×475 k
  // over 11.5 k with 10 nF (cells.tsx IsoVSense)
  const X2 = 4.7e-6, C2X = 2 * 4.7e-6, CD = 2.2e-6, RD = 10, TAUV = (11.5e3 * 3.8e6 / (11.5e3 + 3.8e6)) * 10e-9;
  const VPH = 330 / Math.sqrt(3), FWDELAY = 15e-6, GRIDS = [[0, 0.01], [30e-6, 0.02], [100e-6, 0.02]];
  const margin = ({ L1, Lg, Rg, Llk, Rcm, Kp, wz, Td, G0, ff, damp }) => {
    let wind = 0, prev = null, md = Infinity, fAt = 0;
    const NPTS = 6000;
    for (let k = -NPTS; k <= NPTS; k++) {
      if (!k) continue;
      const fq = Math.sign(k) * 10 ** (6.3 * Math.abs(k) / NPTS), w = 2 * Math.PI * fq, s = cx(0, w);
      const e = cx(Math.cos(w * Td), -Math.sin(w * Td)), H = cdiv(cx(1), cx(1, w * TAUV));
      const Cc = cmul(cx(Kp), cadd(cx(1), cdiv(cx(wz), s)));
      const Y = cdiv(csub(cx(1), cmul(cmul(e, H), csub(cx(ff), cmul(Cc, cx(G0))))), cadd(cmul(cx(L1), s), cmul(Cc, e)));
      const Z0 = cpar(cadd(cx(Rg), cmul(cx(Lg), s)), cdiv(cx(1), cmul(cx(X2), s)));                 // E68: star X2 stages, no D6
      const Z1 = cpar(cadd(Z0, cadd(cx(Rcm), cmul(cx(Llk), s))), cdiv(cx(1), cmul(cx(X2), s)));
      let Zc2 = cdiv(cx(1), cmul(cx(C2X), s));                                                           // E68: converter-side star X2 bank
      if (damp) Zc2 = cpar(Zc2, cadd(cx(RD / 3), cdiv(cx(1), cmul(cx(3 * CD), s))));
      const T = cadd(cx(1), cmul(Y, cpar(cadd(Z1, cadd(cx(Rcm), cmul(cx(Llk), s))), Zc2)));
      const a = Math.atan2(T[1], T[0]);
      if (prev !== null) wind += ((a - prev + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      prev = a;
      const dist = Math.hypot(T[0], T[1]); if (dist < md) { md = dist; fAt = Math.abs(fq); }
    }
    return Math.round(wind / (2 * Math.PI)) !== 0 ? { m: 0, fAt } : { m: md, fAt };
  };
  const csv = [["sku", "method", "controller", "delay_us", "damper", "grid_uH", "result", "damper_W", "detail"]];
  let bad = 0;
  console.log("\nE65 CURRENT LOOP vs DRAWN INPUT FILTER (modulus margin min|1+Y·Zo|; 0 = unstable)");
  for (const sku of ["30kw", "40kw", "50kw"]) {
    const d = D1[sku], d7 = CH.d7[sku];
    const Rcm = d7.P / (3 * 1.05 * { "30kw": 55.9, "40kw": 73.3, "50kw": 91.6 }[sku] ** 2);   // hot winding R: one D7 winding (E68: no D6)
    const Ipk = d7.Ipk, G0 = (d.P / 0.965) / (3 * VPH * VPH);
    // P = the vienna-switched reference (3 kHz at the crest L); PI = the same proportional gain with the zero placed above
    // (KiI/KpI). The single-gain PI above was placed on a 100 µH plant: on the 40/50 kW D1 (crest 50–42 µH at lot −8 %) its
    // 1.87 V/A crosses at 5–7 kHz — FW-EMI-3 scales the gain per rating instead (printed below, not gated).
    const CTL = { P: { Kp: 2 * Math.PI * 3000 * Ld1(d, Ipk, 0.92), wz: 0 }, PI: { Kp: 2 * Math.PI * 3000 * Ld1(d, Ipk, 0.92), wz: KiI / KpI },
      SHIP: { Kp: KP_SHIP[sku], wz: 0 }, "PI@1.87": { Kp: KpI * VHALF, wz: KiI / KpI } };
    for (const [ctl0, c] of Object.entries(CTL)) for (const Td of [FWDELAY, delay]) for (const damp of [false, true]) for (const ff of [1, 0]) {
      if (!ff && !(damp && Td === FWDELAY && ctl0 !== "PI@1.87")) continue;   // no-feed-forward rows: why FW-EMI-2 exists (info)
      let worst = { m: Infinity };
      const ctl = ff ? ctl0 : `${ctl0} noFF`;
      for (const [Lg, Rg] of GRIDS) for (const Llk of d7.Llk_band_uH.map((x) => x * 1e-6)) for (const i of [0, Ipk]) {
        const r = margin({ L1: Ld1(d, i, 0.92), Lg, Rg, Llk, Rcm, Kp: c.Kp, wz: c.wz, Td, G0, ff, damp });
        if (r.m < worst.m) worst = { ...r, at: `Lg ${Lg * 1e6} µH · L_lk ${Llk * 1e6} µH · ${i ? "crest" : "zero-crossing"} L`, };
      }
      const gated = ff && damp && Td === FWDELAY && ctl0 !== "PI@1.87", ok = worst.m >= 0.5;
      if (gated && !ok) bad++;
      csv.push([sku, "small-signal", ctl, f(Td * 1e6, 0), damp ? "CDMP 2.2uF+RDMP 10R" : "none", "0/30/100", f(worst.m, 2), "", `"worst at ${worst.at} (${f(worst.fAt / 1e3, 1)} kHz)"`]);
      console.log(`  ${sku} ${ctl.padEnd(10)} Td ${f(Td * 1e6, 0)} µs ${damp ? "damped  " : "undamped"}: ${worst.m === 0 ? "UNSTABLE" : "margin " + f(worst.m, 2)} at ${worst.at} ≈${f(worst.fAt / 1e3, 1)} kHz${gated ? (ok ? "  [gate ≥0.5 ok]" : "  [GATE FAIL <0.5]") : ""}`);
    }
    console.log(`  ${sku} FW-EMI-3 current-loop proportional gain 2π·3 kHz·L_D1(${Ipk} A, lot −8 %) = ${f(CTL.P.Kp, 2)} V/A (L ${f(Ld1(d, Ipk, 0.92) * 1e6, 1)} µH; the single PI carries ${f(KpI * VHALF, 2)} V/A)`);
    // (2) time-domain confirmation on the switched model (P structure, the vienna-switched reference controller)
    const run = (Lg, Rg, damp, upd) => vienna(sku, { VLL: 330, vbus: 830, lot: 0.92, Pout: d.P, cycles: 4,
      filter: { Lg, Rg, Rcm, Llk: 12e-6, Rf: Rcm, C0: X2, C1: X2, C2: C2X, star: true, Cd: damp ? CD : 0, Rd: RD, d6: null, tauV: TAUV, upd, lag: 1 } });
    let pD = 0;
    for (const [Lg, Rg] of GRIDS) {
      const r = run(Lg, Rg, true, 400), ok = r.oscPct <= 1;
      if (!ok) bad++;
      pD = Math.max(pD, r.pDamp);
      csv.push([sku, "time-domain", "P+FF", 15, "CDMP 2.2uF+RDMP 10R", f(Lg * 1e6, 0), f(r.oscPct, 2), f(r.pDamp, 2), `"2-45 kHz grid-current content, % of fundamental; Ipk ${f(r.Ipk, 1)} A"`]);
      console.log(`  ${sku} time-domain damped Td 15 µs Lg ${f(Lg * 1e6, 0)} µH: 2–45 kHz content ${f(r.oscPct, 2)} % of fundamental · damper ${f(r.pDamp, 2)} W · Ipk ${f(r.Ipk, 1)} A ${ok ? "ok" : "SUSTAINED OSCILLATION"}`);
    }
    const c30 = run(100e-6, 0.02, false, 800), h30 = run(100e-6, 0.02, true, 800), u15 = run(30e-6, 0.02, false, 400);
    if (!Number.isFinite(c30.oscPct)) c30.oscPct = 999;             // a run-away to overflow is an oscillation too
    if (!(c30.oscPct >= 10)) bad++;                                // the control must still fail, or the detector is blind
    csv.push([sku, "time-domain", "P+FF", 30, "none", 100, f(c30.oscPct, 1), "", '"control: undamped at the pfc-control 1.5 Tsw basis"']);
    csv.push([sku, "time-domain", "P+FF", 30, "CDMP 2.2uF+RDMP 10R", 100, f(h30.oscPct, 2), f(h30.pDamp, 2), '"damper alone at 1.5 Tsw (P structure)"']);
    // E81 / review G (F-G-5): this row USED to be labelled "quiet in the switched model" — true only at 30 kW. At 40 and
    // 50 kW the undamped filter runs 75 % and 195 % of fundamental in 2–45 kHz at the SHIPPED 15 µs delay: the damper is the
    // only thing holding the current loop up, it is a single unmonitored film, and an open CDMP is an undetected instability.
    csv.push([sku, "time-domain-HAZARD", "P+FF", 15, "none", 30, f(u15.oscPct, 2), "",
      `"HAZARD: undamped at the SHIPPED 15 µs delay this rating runs ${f(u15.oscPct, 1)} % of fundamental in 2-45 kHz — CDMP is a single unmonitored part with no detection in pfc.c"`]);
    console.log(`  ${sku} [control] undamped Td 30 µs Lg 100 µH: ${f(c30.oscPct, 1)} % (${c30.oscPct >= 10 ? "oscillates — detector live" : "DID NOT OSCILLATE — detector blind"}) · damped at 30 µs: ${f(h30.oscPct, 2)} % · [HAZARD] undamped at the shipped 15 µs, Lg 30 µH: ${f(u15.oscPct, 2)} % of fundamental${u15.oscPct > 10 ? " — the damper is load-bearing, not insurance" : ""}`);
    // damper resistor duty: simulated ripple share at 330 VAC + the 50 Hz share re-taken at 550 VAC (1.1 × the 500 VAC F.07 edge)
    const p50 = (v) => (v * 2 * Math.PI * 50 * CD) ** 2 * RD, pRes = (pD - 3 * p50(330)) / 3 + p50(550);
    const okR = pRes <= 0.5 * 25;
    if (!okR) bad++;
    const eOn = 0.5 * CD * (1.1 * 475 * Math.SQRT2) ** 2;           // line-connect at the crest: the series R takes ½·C·V²
    csv.push([sku, "damper-duty", "-", "-", "RDMP 10R 25W", "-", f(pRes, 2), "", `"W per resistor worst (${f(100 * pRes / 25, 0)}% of 25 W); ${f(eOn, 2)} J per line-connect; standby 50 Hz at 400 VAC ${f(3 * p50(400), 2)} W total"`]);
    console.log(`  ${sku} RDMP duty ${f(pRes, 2)} W per resistor worst (${f(100 * pRes / 25, 0)} % of the 25 W part) · ${f(eOn, 2)} J per line-connect · standby 50 Hz share at 400 VAC ${f(3 * p50(400), 2)} W ${okR ? "ok" : "OVER 50 %"}`);
  }
  writeFileSync(join(OUT, "pfc-filter-stability.csv"), csv.map((r) => r.join(",")).join("\n") + "\n");
  console.log(bad ? `  ${bad} FILTER-STABILITY FAILURE(S)` : "  FILTER-LOOP STABLE — damped filter holds ≥0.5 modulus margin at the FW-EMI-1 15 µs delay (P and PI), no sustained oscillation in the switched model, damper inside rating");
  console.log("→ calculations/out/pfc-filter-stability.csv");
  if (bad) process.exitCode = 1;
}
