# Simulation Report — Executed Runs (§50 format)

Solver for all runs: **ngspice-46 (KLU), method=gear**, macOS arm64. Every generated netlist is preserved under `spice/generated/*.cir`; raw waveform data `spice/generated/*.out`; metrics CSVs under `simulation-results/30kw/`. Models: `spice/models/sic-behavioral.lib` (BEHAVIORAL — provenance and limitations in the file header; vendor-encrypted PSpice models documented as ngspice-incompatible per §8). Anything not listed here is **NOT VERIFIED**.

## 1. Level-1 double-pulse (§16) — `spice/double-pulse/dpt-run.mjs`

- Netlists: `dpt-pfc750-*.cir` (13 cases), `dpt-llc1200-*.cir` (13 cases). Timestep 0.25 ns, reltol 1e-3, abstol 1u, tran to ~13 µs, uic.
- Sweeps: Rg_on {2.5,4.7,10}, Rg_off {1,2.2,4.7,6.8}, I {30%,65%,100%}, V {nom,+6..10%}, L_loop {10,18,30 nH}, snubber, RCD clamp.
- Pass criteria: Vds_pk ≤ 75% rating incl. ring; Vgs ∈ [−8,+22] V; freewheel-FET Vgs_pk < 2.5 V.
- Outputs: `dpt-pfc750-metrics.csv`, `dpt-llc1200-metrics.csv`, plots `dpt-*-base.svg`.
- Results: PFC **final config PASS** — 523 V (70%) @425 V/78 A; 549 V (73%) @+10% bus. LLC **final PASS at operational max** — 870 V (73%) @830 V; 880 V corner 77% → **HW OVP moved to 860 V** (E2). False turn-on margin: Vgs_fw ≤ 2.05 V vs 2.5 V limit. Measured k_sw = 17.4 nJ/(V·A) fed back into fsw selection (E3). Model-band caveat: ±40% on energies until vendor models (A1).
- Design iterations driven by this level: parasitic split correction (package 2 nH vs PCB loop), RCD clamp addition, Rg_off softening, fsw 100→50 kHz.

## 2. PFC control loops (§21/§38) — `calculations/pfc/pfc-control.mjs` + deck `pfc-acloop.cir`

- Current loop: analytical Bode with 1.5·Tsw transport delay: **fc 2976 Hz, PM 50.2°, GM 8.7 dB**; ngspice AC sweep of the same compensated loop (delay corrected analytically): fc 2924 Hz, **PM 50.6° — CROSS-CHECK PASS** (<0.5° delta).
- Voltage loop by placement: fc 15 Hz, PM 65°. Output: `out/pfc-loops.csv`. Note: fsw/10 crossover proved unreachable (delay 54° at 5 kHz) — 3 kHz is the delay-limited optimum.

## 3. PFC line-cycle (§21/§35/§36) — `spice/pfc/pfc-phase-run.mjs`

- Fidelity: averaged-switch 3-port Vienna model (documented decision — see assumptions.md; 7 cycle-by-cycle attempts aborted in ngspice, header logs kept). Grid 30 µH/20 mΩ, floating wye, split bus 2×2350 µF, feedforward + P(0.0044) + midpoint balancing (0.004·sgn).
- Runs (tran 5 µs/2 µs, 40–60 ms): 330/400/475 V full, 400 V 25%, ±20% cap imbalance, phase-C loss at 25 ms.
- Results: **THD-40 0.59 / 0.74 / 1.05% full-power; 2.55% @25%** (spec ≤5%, stretch ≤3% — MET). Tracking exact (I1pk = ref). Midpoint dev ≤6.7 V incl. imbalance. Phase loss: bounded 59 A, bus droop 640 V, THD 9.7% → firmware foldback requirement FW-R1. Output `pfc-phase-runs.csv`, plot `pfc-330-currents.svg`.

## 4. Precharge / discharge (§25) — same runner

- Precharge (worst 475 VAC, 6-pulse through Vienna diodes, discharged 1175 µF): R=33 Ω → **Ipk 20.3 A, t95 160 ms, E_R 243 J**, Vend 667 V. Fixed selection E14. R=22/47 Ω table in CSV.
- Discharge: 640 Ω from 850 V: **1.99 s to <60 V**, 1129 W pk, 424 J. → 4× 160 Ω/25 W series + FET, pulse rating verify at EVT (T-05).

## 5. LLC operating points (§13/§36) — `spice/llc/llc-run.mjs`

- Full 3-leg switching deck: gate-modulated conductances, 3 tanks (rev D2: 7.0 µH/185.4 nF/63 µH — re-run after §37 iteration; ZVS held at every edge, boost margin +71%), tri-coupled windings (k=0.9999, pairwise), dual JBS bridges, banks as V-sources (op-point method). tran 30 ns/15 ns to 400 µs.
- 8 points run (par 400/500/300/260 V, ser 250, half-load, PS-150 duty surrogate): **ZVS = YES at every checked gate edge in every run** (28–41 edges each). Boost capability: bank 518 delivers 48.8 kW vs 30.6 kW target (+59% margin). Series-entry stress current 42.3 A sim vs 45.6 A design ✓. Near-fn≈1 point-power deviations up to ±46% = FHA slope limitation, documented acceptance basis (assumptions.md). PS mode functional; duty→P mapping to firmware calibration (FW-R2).
- Outputs: `llc-oppoints.csv`, `llc-nom-waveforms.svg`.

## 6. S/P transition (§5/§36) — `spice/llc/sp-transition.mjs`

- Parallel closure, 1.5 mF/bank, contact 2 mΩ + 50 nH, ΔV {2,5,10,20} V: **205/512/1023/2047 A** → hard closure unsafe ≥5 V; drove E12 (pre-insertion architecture). Weld-detect spec derived (E13). Output `sp-transition.csv`.

## 7. §35 full envelope grid — `calculations/system/envelope-grid.mjs` (CLOSED)

3×1008 = **3024 points** (6 Vin × 8 Vout × 7 loads × 3 temps × 3 SKUs), averaged fidelity with
temperature-iterated losses and mode/bus/fn resolution per point. **Zero failures**; worst full-load
η 95.47% (285 V/150 V/hot — derated envelope edge); max Tj 139 °C. `out/envelope-grid.csv`.

## 8. §37 Monte-Carlo — `calculations/system/monte-carlo.mjs` (CLOSED, drove rev D2)

10k-sample batches. Rev-A tank tolerances FAILED (17.7% below required peak gain) → design
iterations: leakage-compensating trim binning (D2 rev B), Lm gap-ground ±7% (D3 rev B), hysteresis
500/525+dwell (E9 rev B), capability re-solve to 1.39 (E7 rev D2) → **fail 0.01%, covered by
per-unit EOL gain-cal fallback → PASS**. Sense chains: Vout post-cal ±0.18% (spec 0.5%), Iout ±0.2%
(spec 1%) — **EOL 2-point cal is mandatory** (pre-cal ±0.7%). Lane sharing ±0.62%; dead-time min
margin 42 ns. `out/monte-carlo.csv`.

## 9. Aux flyback (§18/§28, V-21) — `spice/aux/aux-flyback.mjs` (CLOSED)

ngspice coupled-flyback with behavioral current-mode control (cycle CS clamp 0.85 A — its absence
in rev A reproduced a real failure mode: CCM staircase at 425 V soft-start). 300 V and 425 V:
24 V settles 24.1/24.3 V, load-step dip <0.6 V, 0.2 ms recovery, 15 V cross-reg ≥15.0 V — **both PASS**.
D4 turns sheet emitted (`docs/aux-transformer-D4.md`). IC-specific UVLO/limits = bench T-09.

## 10. Conducted pre-compliance (§26) — `calculations/emi/lisn-precompliance.mjs` (ESTIMATE, ±20 dB)

Found a real gap: 30 kW 3rd harmonic at 150 kHz was **−24.8 dB vs CISPR-32 A** (interleaved SKUs
pass — comb cancellation quantified: 4-lane pushes first full DM harmonic to 200 kHz). Design
response E22 (3× 22 µH DM stage, family-wide) → worst margin **+7.8 dB**. Pre-compliance only;
chamber (T-08) arbitrates. `out/lisn-precompliance.csv`, plot in results.

## 11. §36 system-scenario suite — `calculations/system/fsm-sim.mjs` (CLOSED at logic fidelity)

Production FSM + full protection table executed against 26 scripted scenarios (startup chain,
load steps, CV↔CC, open, short, backfeed both polarities, phase loss, swell/sag, bus OVP, midpoint,
S/P transition incl. welded-relay and dwell, fan fail, OT, stuck sensor, aux collapse, DESAT,
watchdog, CAN timeout with re-enable, link loss, shutdown-discharge, 5-fault lockout):
**26/26 PASS** (`out/fsm-scenarios.csv`). Found and fixed a spec defect: F.16 short criterion
unreachable with a healthy CC loop → rev B (V<50 V & I>90% sustained). Power-stage dynamics for
these events were closed at L1–L4; this suite closes the LOGIC layer.

**Production C implementation (E24):** `firmware/core/fsm.c` + `can_proto.c` are the normative
logic, verified by `firmware/test/host_sim.c` — the same 26 scenarios against the same plant,
plus CAN codec round-trip/guards and a 100k-frame malformed-input fuzz, compiled
`-Wall -Wextra -Werror -fsanitize=address,undefined`: **33/33**. The C pass exposed one further
real defect the JS pass had masked — blind K_OUT closure with no vehicle attached after a mode
transition (banks parked at the old-mode ceiling → instant OVP) — fixed as the E12b gate in both.

## 12. Remaining NOT SIMULATED (hardware-domain by nature)

Bench-physical behavior (real Eon/Eoff, EMI chamber, thermal chamber, relay life, PD) — EVT T-01…T-10.
These are physically outside simulation scope per fidelity policy; nothing else remains unrun.
