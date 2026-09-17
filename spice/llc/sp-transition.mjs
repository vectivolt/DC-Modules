// sp-transition.mjs — Phase 7 (§5/§36): series↔parallel bank reconfiguration transient.
// Purpose: derive the pre-closure bank-matching spec (ΔV_max) from relay make-current capability,
// and demonstrate weld-detection observability. LLC PWM is OFF during transition (FSM rule) —
// banks modeled as their real capacitance; loop = relay contact R + busbar/wiring L.
// Relay assumption (Hongfa HF161F / Churod CHC-D120 class, VERIFY at RFQ): make ≤ 300 A, contact 2 mΩ.
//
// E81 / review G (F-G-4) — TWO CORRECTIONS. (1) `CBANK` was 1.5 mF, the retired "3 × 470 µF + film" bank of Phase 12.
// **E68c made the banks FILM-ONLY: 9 / 12 / 14 × 2.2 µF per bank** (current-coordination [SYNC] asserts that count against
// boards.tsx), i.e. 19.8 / 26.4 / 30.8 µF — 50–76× less. The closure peak is ΔV/√(L/C), so the E60 "205 A at 2 V" was
// 7× pessimistic; but the surge impedance now rises, so the peak at the FW-42 PAR permit (|ΔV| ≤ 25 V) is what matters and
// it is NOT covered by a ΔV ≤ 20 V sweep. (2) the weld-detection note printed "dV/dt = I/C = 13.3 V/s" for 20 A into
// 1.5 mF — the correct value is 13.3 kV/s, a factor of 1000; with the film bank it is 1.0 MV/s, so weld detection is
// trivially observable and the old "200 ms @ ≥10 A" window was derived from the slip.
// The deck now sweeps the loop inductance too, because the answer is entirely set by it, and reports the MINIMUM loop
// inductance the FW-42 25 V permit needs against the relay make line — a layout requirement, which is verifiable.
// Run: node spice/llc/sp-transition.mjs [sku ...]

import { runDeck, maxIn } from "../run.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const f = (x, d = 2) => Number(x.toFixed(d));

// E68c film-only output bank per bank — the counts current-coordination [SYNC] asserts against boards.tsx
export const BANK_FILM = { "30kw": 9, "40kw": 12, "50kw": 14, "50kwa": 14 };
export const FILM_UF = 2.2e-6;
export const CBANK = (sku) => BANK_FILM[sku] * FILM_UF;
export const RELAY_MAKE_A = 300;         // HF161F / CHC-D120 class RFQ acceptance line (parts-db K(SER|PARA|PARB) note)
export const FW42_PERMIT_V = 25;         // fsm.c FW-42: PAR permit adds |ΔV| ≤ 25 V
export const LOOPS_NH = [50, 150, 300];  // 50 nH was the E60 busbar estimate; a 9–14-part film bank spans ~240 mm of board
// minimum loop inductance for Ipk(ΔV) ≤ make line, from Ipk = ΔV/√(L/C_series):  L = C_series·(ΔV/I_make)²
export const lMinFor = (sku, dV = FW42_PERMIT_V, iMake = RELAY_MAKE_A) => (CBANK(sku) / 2) * (dV / iMake) ** 2;

const HDR = ["dV_V", "loop_nH", "Ipk_A", "I2t_A2s", "t_settle_ms", "verdict_vs_make"];

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const skus = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BANK_FILM);
  let bad = 0;
  for (const sku of skus) {
    const C = CBANK(sku), RES = join(ROOT, "simulation-results", sku);
    mkdirSync(RES, { recursive: true });
    const rows = [HDR];
    console.log(`\n=== ${sku} S/P closure: ${BANK_FILM[sku]} × 2.2 µF film per bank = ${f(C * 1e6, 1)} µF (E68c) ===`);
    for (const Lnh of LOOPS_NH) for (const dV of [2, 5, 10, 20, FW42_PERMIT_V]) {
      const tag = `sp-${sku}-${dV}V-${Lnh}n`;
      const deck = `* parallel closure with ${dV} V mismatch, ${sku} film bank ${f(C * 1e6, 1)} uF/bank, loop ${Lnh} nH
CA a 0 ${C.toExponential(5)} ic=${400 + dV / 2}
CB b 0 ${C.toExponential(5)} ic=${400 - dV / 2}
* relay closes at t=1ms: contact R ramps 1meg -> 2 mOhm over 100 us (arc/bounce abstracted)
BREL a c I=v(a,c)/(0.002+1e6*(1-min(max((time-1m)/100u,0),1)))
LW c b ${Lnh}n
.tran 0.2u 6m 0 0.1u uic
.option method=gear reltol=1e-3
.control
set filetype=ascii
run
wrdata ${tag}.out v(a,b) i(LW)
quit
.endc
.end`;
      const r = runDeck(tag, deck, ["dv", "irel"]);
      const ipk = maxIn(r.t, r.cols.irel.map(Math.abs), 0, 1);
      let i2t = 0, tset = 0;
      for (let i = 1; i < r.t.length; i++) {
        i2t += r.cols.irel[i] ** 2 * (r.t[i] - r.t[i - 1]);
        if (Math.abs(r.cols.dv[i]) > 0.5) tset = r.t[i];
      }
      const ok = ipk <= RELAY_MAKE_A;
      rows.push([dV, Lnh, f(ipk, 0), f(i2t, 3), f(tset * 1e3, 2), ok ? "OK" : "EXCEEDS make rating"]);
      console.log(`  ΔV=${String(dV).padStart(2)} V · loop ${String(Lnh).padStart(3)} nH → Ipk=${String(f(ipk, 0)).padStart(4)} A  I²t=${f(i2t, 3)} A²s  settle=${f(tset * 1e3, 2)} ms  ${ok ? "OK" : "EXCEEDS make rating"}`);
    }
    const lMin = lMinFor(sku);
    const okL = lMin <= 300e-9;
    if (!okL) bad++;
    console.log(`  → the FW-42 |ΔV| ≤ ${FW42_PERMIT_V} V permit needs a closure loop of at least ${f(lMin * 1e9, 0)} nH against the ${RELAY_MAKE_A} A make line (${okL ? "achievable on this board" : "NOT achievable — tighten the permit or the relay class"})`);
    // weld detection, corrected: bank A alone carries the load, so its node falls at I/C
    const iLoad = 10, dvdt = iLoad / C;
    console.log(`  weld detection: K_PAR commanded open with ${iLoad} A on bank A only → dV/dt = I/C = ${f(dvdt / 1e3, 1)} kV/s`);
    console.log(`    (the E60 note printed 13.3 V/s for 20 A into 1.5 mF — 1000× low; healthy banks now diverge past a 1.5 V`);
    console.log(`     threshold in ${f((1.5 / dvdt) * 1e6, 1)} µs, so the window can be the FSM tick, not 200 ms)`);
    writeFileSync(join(RES, "sp-transition.csv"),
      `# E81/F-G-4 parallel-closure mismatch study; ${sku}: ${BANK_FILM[sku]} × 2.2 µF FILM-ONLY bank = ${f(C * 1e6, 1)} µF/bank (E68c, was 1.5 mF)\n` +
      `# relay ${RELAY_MAKE_A} A make (HF161F/CHC-D120 class, RFQ) + 2 mΩ contact; loop inductance swept ${LOOPS_NH.join("/")} nH\n` +
      `# FW-42 permit |ΔV| ≤ ${FW42_PERMIT_V} V needs loop L ≥ ${f(lMin * 1e9, 0)} nH — current-coordination [SP] gates that\n` +
      `# weld detection: ${iLoad} A on one bank → dV/dt ${f(dvdt / 1e3, 1)} kV/s → 1.5 V in ${f((1.5 / dvdt) * 1e6, 1)} µs\n` +
      rows.map((r) => r.join(",")).join("\n") + "\n");
    console.log(`→ simulation-results/${sku}/sp-transition.csv`);
  }
  process.exit(bad ? 1 : 0);
}
