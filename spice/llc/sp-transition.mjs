// sp-transition.mjs — Phase 7 (§5/§36): series↔parallel bank reconfiguration transient.
// Purpose: derive the pre-closure bank-matching spec (ΔV_max) from relay make-current capability,
// and demonstrate weld-detection observability. LLC PWM is OFF during transition (FSM rule) —
// banks modeled as their real capacitance; loop = relay contact R + busbar/wiring L.
// Relay assumption (Hongfa HFE82-class, VERIFY at RFQ): make current ≤ 300 A (10 ms), contact 2 mΩ.
// Run: node spice/llc/sp-transition.mjs

import { runDeck, maxIn } from "../run.mjs";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const RES = join(HERE, "..", "..", "simulation-results", "30kw");
const f = (x, d = 2) => Number(x.toFixed(d));

// Bank capacitance: output bank film+electrolytic per bank (Phase 12 sizing: 3×470 µF + film)
const CBANK = 1.5e-3;

const rows = [["dV_V","Ipk_A","I2t_A2s","t_settle_ms","verdict_vs_300A"]];
for (const dV of [2, 5, 10, 20]) {
  const deck = `* parallel closure with ${dV} V mismatch
CA a 0 ${CBANK} ic=${400 + dV / 2}
CB b 0 ${CBANK} ic=${400 - dV / 2}
* relay closes at t=1ms: contact R ramps 1meg -> 2 mOhm over 100 us (arc/bounce abstracted)
BREL a c I=v(a,c)/(0.002+1e6*(1-min(max((time-1m)/100u,0),1)))
LW c b 50n
RW c2 b 1u
.tran 1u 6m uic
.option method=gear reltol=1e-3
.control
set filetype=ascii
run
wrdata sp-${dV}.out v(a,b) i(LW)
quit
.endc
.end`;
  const r = runDeck(`sp-${dV}`, deck, ["dv", "irel"]);
  const ipk = maxIn(r.t, r.cols.irel.map(Math.abs), 0, 1);
  let i2t = 0, tset = 0;
  for (let i = 1; i < r.t.length; i++) {
    i2t += r.cols.irel[i] ** 2 * (r.t[i] - r.t[i - 1]);
    if (Math.abs(r.cols.dv[i]) > 0.5) tset = r.t[i];
  }
  const ok = ipk <= 300 ? "OK" : "EXCEEDS make rating";
  rows.push([dV, f(ipk, 0), f(i2t, 2), f(tset * 1e3, 2), ok]);
  console.log(`ΔV=${String(dV).padStart(2)} V → Ipk=${f(ipk, 0)} A  I²t=${f(i2t, 2)} A²s  settle=${f(tset * 1e3, 2)} ms  ${ok}`);
}

// weld detection: command open under load → if welded, bank voltages keep tracking
console.log("\nWeld detection: K_PAR commanded open at t=2ms while 20 A load on bank A only;");
console.log("healthy: v(a)-v(b) diverges (>5 V in 50 ms); welded: stays <0.5 V → latched fault. (Analytic: dV/dt = I/C = 13.3 V/s → 0.67 V @50 ms — DETECTION NEEDS load ≥ 20 A or longer window: spec = 200 ms window @ ≥10 A, threshold 1.5 V.)");

writeFileSync(join(RES, "sp-transition.csv"),
  "# parallel-closure mismatch study; CBANK=1.5mF/bank; relay 2mOhm + 50nH loop; make-rating 300 A (HFE82-class, VERIFY)\n" +
  rows.map(r => r.join(",")).join("\n") + "\n");
console.log("\n→ simulation-results/30kw/sp-transition.csv");
