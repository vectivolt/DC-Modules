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
