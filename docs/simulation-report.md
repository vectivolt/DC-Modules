<img src="assets/banner-verification.svg" alt="" width="100%"/>

# 📈 Simulation Report

<sub>The simulation-truth ledger — every executed run, its result, and what it may be used to claim</sub>

<p>
  <img src="https://img.shields.io/badge/status-EVIDENCE-1a9fb3?style=flat-square" alt="status: evidence record"/>
  <img src="https://img.shields.io/badge/rev-E61-f2b705?style=flat-square" alt="revision E61"/>
  <img src="https://img.shields.io/badge/updated-2026--09--14-8b949e?style=flat-square" alt="updated 2026-09-14"/>
</p>

> [!NOTE]
> **Purpose** — the simulation-truth ledger: every executed run, its result, and what it may be used to claim.
> Nothing in the documentation claims beyond it.

> [!CAUTION]
> **E60 re-basis — read this before §5 below.** The §5 LLC operating-point record was produced by a deck with **no
> MOSFET body diodes**. Its legs swung to ±6 kV on a 650 V bus, so its ZVS, power and current figures are
> **non-physical and withdrawn**. It also ran only the 30 kW tank and missed target power by −77…+71 %. The
> replacement evidence is §13 (E60): power-solved per-SKU LLC stress decks with a physicality guard and tank
> fingerprints, the cycle-by-cycle Vienna model, and per-SKU CT/precharge/aux decks. §1–§4 and §6–§12 stand
> within their stated fidelity. The retired-SKU (60/120 kW) rows in §11b and V-21 are superseded by the §13
> per-SKU runs. How to run and read everything: [`simulation-toolchain.md`](simulation-toolchain.md).

## Ledger at a glance

| Section | Evidence | Status |
|---|---|---|
| [§1](#1-level-1-double-pulse-16--spicedouble-pulsedpt-runmjs) | Level-1 double-pulse — overshoot, dv/dt, gate network | ✅ current (± 40 % energy band) |
| [§2](#2-pfc-control-loops-2138--calculationspfcpfc-controlmjs--deck-pfc-acloopcir) | PFC control loops | ✅ current |
| [§3](#3-pfc-line-cycle-213536--spicepfcpfc-phase-runmjs) · [§4](#4-precharge--discharge-25--same-runner) | PFC line-cycle (averaged) · precharge / discharge | ✅ current — precharge per SKU re-run in §13 |
| [§5](#5-llc-operating-points-1336--spicellcllc-runmjs) | LLC operating points | ⛔ **withdrawn** — no body diodes; replaced by §13 |
| [§6](#6-sp-transition-536--spicellcsp-transitionmjs) | series / parallel transition | ✅ current |
| [§7](#7-35-full-envelope-grid--calculationssystemenvelope-gridmjs-closed) · [§8](#8-37-monte-carlo--calculationssystemmonte-carlomjs-closed-drove-rev-d2) | envelope grid · Monte-Carlo | ✅ current (grid re-based to 5,544 points at E60) |
| [§9](#9-aux-flyback-1828-v-21--spiceauxaux-flybackmjs-closed) · [V-21 rev C](#v-21-rev-c--aux-validation-at-the-per-sku-load-matrix-2026-09-05-e26-rev-c--r2-cb-19cb-20) | aux flyback | ✅ current — per-SKU re-run in §13 ([rev B](#v-21-rev-b--aux-flyback-redesign-validation-2026-09-05-e26--superseded-by-rev-c-above) superseded) |
| [§10](#10-conducted-pre-compliance-26--calculationsemilisn-precompliancemjs-estimate-20-db) | conducted pre-compliance | 🟡 estimate (± 20 dB) — never a compliance claim |
| [§11](#11-36-system-scenario-suite--calculationssystemfsm-simmjs-closed-at-logic-fidelity) · [§11b](#11b-r2-g-closure-decks-2026-09-05-rev-d) | system scenarios · R2 closure decks | ✅ current — 60 / 120 kW rows superseded |
| [§12](#12-remaining-not-simulated-hardware-domain-by-nature) | not simulated (hardware by nature) | 🔬 EVT |
| [§13](#13-e60-evidence-set-2026-09-13--replaces-5-and-the-60120-kw-rows) | **E60 evidence set** — power-solved LLC per SKU, cycle-by-cycle Vienna, CT, precharge, aux | ✅ **current** |

> **HISTORICAL RECORD** — kept verbatim as the Phase-9 execution record; later variant engines (D6 rev C, per-variant LISN/grids, NCP1252D aux re-basis) live in calculations/ and register rows E41–E49.

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

## 11b. R2 §G closure decks (2026-09-05, rev D)

- **CT front-end + AVMID stability** — `spice/protection/ct-frontend.mjs` → `ct-frontend.csv`.
  Behavioral 10 MHz/1e6-Aol op-amp, rev-D dual-feedback network vs the rev-C direct-into-10 µF
  baseline, plus the corrected 2.0 Ω resonant chain. **ALL PASS**: AVMID steady ripple ≈ 0 (limit
  10 mV), clamp-pulse dip 1.64 V (limit ≥1.55); resonant full-load ADC 0.37–2.93 V in-rails;
  **F.11 70 A pk = 3.024 V** at the comparator. The deck-writing process itself forced two value
  refinements (CAVF 100 p→2.2 n — corner must sit below the outer-loop crossover; resonant CF
  1 n→220 p — the 159 kHz pole was eating 25 % of the 140 kHz signal). Fidelity note printed by
  the deck: the single-pole behavioral model under-predicts the rev-C baseline's ring (the real
  part's higher-order poles are why MR-11 stands on datasheet grounds); bench T-17 arbitrates.
- **Per-SKU precharge/discharge/bank-bleed** — `spice/protection/prechg-disch.mjs` →
  `prechg-disch-sku.csv`. **9/9 PASS**: precharge t95 = 193/347/694 ms with F.20-as-coded never
  tripping (bus ≥50 % at 400 ms everywhere); Ipk ≤ 19.5 A; per-resistor energy 113/202/402 J
  (the 120 kW numbers are the HR-14 basis for the 50 W parts); bus discharge 1.99/3.59/7.18 s vs
  `PMP_DISCH_TO_MS` 3.0/5.5/9.0 s; bank bleed 9/18/36 s vs the F.21b 2.5·τ windows — the deck
  caught that a 2.0·τ window would false-fail a healthy bleed (525·e⁻² = 71 V) → F.21b set to 2.5·τ.

## 12. Remaining NOT SIMULATED (hardware-domain by nature)

Bench-physical behavior (real Eon/Eoff, EMI chamber, thermal chamber, relay life, PD) — EVT T-01…T-10.
These are physically outside simulation scope per fidelity policy; nothing else remains unrun.


---

## V-21 rev C — aux validation at the per-SKU load matrix (2026-09-05, E26 rev C / R2 CB-19+CB-20)

The rev-B run below validated a 60 W stage against a **fixed** load (24 V step + 15 V @0.8 A) —
the R2 re-audit showed the real V15 demand scales 9→36 gate-bias modules with SKU (≈90 W peak at
120 kW) and the rev-B rectifier models had no reverse breakdown (hiding 100 V parts at 160–200 V
PIV). Rev C: 110 W stage (Lp 345 µH, Ip 3.2 A, 65 kHz, Vor 157 V, D4 rev C), per-SKU loads,
diodes modeled with BV = 400 V (the specified rating — an under-rated part now breaks the run),
NCP1252A-style light-load skip added to the behavioral control:

| Case (VIN × SKU load) | v24 settle | dip @ full step | recover | v15 min | Pout | Verdict |
|---|---|---|---|---|---|---|
| 342/560/850 V × 30 kW (0.7→1.6 A + 1.0 A) | 24.5–25.2 V | ≥23.7 V | ≤0.22 ms | ≥15.0 V | ≈57 W | **PASS ×3** |
| 342/560/850 V × 60 kW (0.9→1.9 A + 1.45 A) | 24.4–25.2 V | ≥23.3 V | ≤0.28 ms | ≥14.8 V | ≈72 W | **PASS ×3** |
| 342/560/850 V × 120 kW (1.6→2.6 A + 2.55 A) | 24.4 V | ≥23.3 V | ≤0.2 ms | ≥15.4 V | **≈107 W** | **PASS ×3** |

`spice/aux/aux-flyback.mjs` rev C, ngspice-46; netlists `spice/generated/aux-*-*.cir`; results
`simulation-results/30kw/aux-flyback.csv`. Bench T-09/T-18 validate the real NCP1252A UVLO/BO/skip
and thermal at the per-SKU table.

## V-21 rev B — aux flyback redesign validation (2026-09-05, E26) — superseded by rev C above

Re-run of the aux stage after the production-review rework (full-bus feed, 60 W, Lp 550 µH,
Ip clamp 1.8 A, Vor 120 V): `spice/aux/aux-flyback.mjs` rev B, ngspice-46, behavioral VM control
(IC dynamics abstracted — unchanged fidelity note; the *wiring* defects the review found are a
schematic matter, closed in cells v3 and asserted by `review-checks.mjs`, not by this sim).

| Case | VIN | V24 settle | dip @ full step | recover | V15 cross-reg min | Pout | Verdict |
|---|---|---|---|---|---|---|---|
| aux-342 | 342 V (285 VAC cold start) | 24.16 V | 23.27 V | 8 ms | 14.63 V | 54.0 W | **PASS** |
| aux-560 | 560 V (400 VAC cold start) | 24.16 V | 23.37 V | 0.57 ms | 14.72 V | 54.2 W | **PASS** |
| aux-850 | 850 V (OVP corner) | 24.23 V | 23.45 V | 0.62 ms | 14.74 V | 54.4 W | **PASS** |

Step = 24 V load 0.5→1.8 A (all relays pull-in + fans, the CB-7 worst case) with 15 V at 0.8 A.
Input-side average power is not resolvable at the behavioral switch's transition band (documented
in-file); Pout is measured from the rail waveforms, Pin ≈ Pout/0.82 est. Bench T-09/T-18 validate
the real IC's UVLO/BR thresholds and thermal. Netlists preserved in `spice/generated/aux-*.cir`.

---

## 13. E60 evidence set (2026-09-13) — replaces §5 and the 60/120 kW rows

| Suite | Command | Result | Record |
|---|---|---|---|
| **LLC stress, power-solved, per SKU** (14 corners + internal short + dead short) | `node spice/llc/llc-run.mjs <sku>` | worst tank peak **70.2 / 94.0 / 117.9 / 117.7 A**, rms class held (46.3 / 61.6 / 76.6 / 76.0 A), **ZVS 64/64 and legs in rails on every corner**, gain-worst capability at 77–82 kHz, race +42…+52 A in 3 µs | `simulation-results/<sku>/llc-stress.csv` · `-summary.json` · `plots/llc-worst-corner.svg` |
| **Vienna cycle-by-cycle** (steady, dips, 20° jump, high line) | `node calculations/pfc/vienna-switched.mjs` | peaks **97.0 / 127.2 / 159.4 A** incl. transients; high line on a 650 V bus 15–40 % THD → 0.1 % with the FW-R7 floor; 150 kHz band 0.7–1.2 dB under the LISN basis | `calculations/out/vienna-switched.csv` |
| **CT front-ends per SKU** (resonant + line) | `node spice/protection/ct-frontend.mjs` | F.11/F.01 within 20 mV of the DAC point; F.xx + race ≤ 3.17 V — **ALL PASS** | `simulation-results/30kw/ct-frontend.csv` |
| **Precharge / discharge / bank bleed per product SKU** | `node spice/protection/prechg-disch.mjs` | 9/9 PASS (30/40/50 kW) | `simulation-results/30kw/prechg-disch-sku.csv` |
| **Aux flyback per product SKU** | `node spice/aux/aux-flyback.mjs` | 12/12 PASS (57 / 68 / 46 / 80 W) | `simulation-results/30kw/aux-flyback.csv` |
| **LLC nominal (PAR400-full) → loss budget** | same runner, corner `PAR400-full` | **29.0 / 38.0 / 47.0 / 47.1 A rms** at 149–152 kHz, ZVS 64/64; the grid's FHA reads 29.2 / 38.5 / 47.8 (≤2 %) — the loss budget had carried 23.3 A × k from the withdrawn deck → η restated to 97.19 / 96.92 / 96.68 / 96.82 % | `calculations/out/loss-budget.csv` (reads the CSV row) |

Consumed by the standing gates `current-coordination.mjs` and `conductor-audit.mjs` (both CLEAN in run-all).

## 14. E67–E69 evidence set (2026-09-14) — full-bridge LLC, InfyPower BOM clone

| Suite | Command | Result | Record |
|---|---|---|---|
| **LLC stress, power-solved, full bridge per SKU** (12 stress corners + 20-point envelope + internal short + dead short) | `node spice/llc/llc-run.mjs <sku>` → `llc-envelope.mjs` → `llc-flux-post.mjs` | worst tank peak **112.7 / 148.1 / 182.8 / 182.8 A** at SER 250 V on the 764 V bus; tank RMS 70.4 / 93.3 / 116 / 116 A inside the 78 / 100 / 120 A classes; **ZVS 64/64 and legs in rails on every corner**; kill peak 209.1 / 267.1 / 329.7 A | `simulation-results/<sku>/llc-*.csv` (fingerprint `FB n2`) |
| **CT front-ends at the E67 classes** (0.47 / 0.36 / 0.30 Ω, F.11 140 / 180 / 220 A) | `node spice/protection/ct-frontend.mjs` | comparator node within 12 mV of the computed F11_VH; F.11 + race ADC peak **3.120 / 3.124 / 3.131 V** (≤ 3.27 V) — **ALL PASS**; re-run 2026-09-14, the deck had still carried the E65 burdens | `simulation-results/30kw/ct-frontend.csv` |
| **Star-X2 EMI filter with the damper** (E68b) | `node calculations/pfc/pfc-control.mjs` · `lisn-precompliance.mjs` | current-loop modulus margin **0.65 / 0.61 / 0.54**, no sustained oscillation at Lg 0 / 30 / 100 µH; damper 3.1 / 4.0 / 5.9 W per resistor; DM margin **+32.9 / +30.6 / +28.7 dB** (E65 control 19.6 / 19.1 / 18.4) | `calculations/out/pfc-filter-stability.csv` · `lisn-precompliance.csv` |
| **Film-only output banks** (E68c) | `current-coordination.mjs` [OUT] on the stress + envelope corners | 9 / 12 / 14 × 2.2 µF per bank: ≤ 3.93 A per film, output ripple **0.47 / 0.46 / 0.49 % RMS** at PS150-Imax, at −10 % capacitance | run-all log |
| **Envelope grid on the clip mount** (E68a) | `node calculations/system/envelope-grid.mjs` | **4,536 points, 0 failures, 0 folds**, max Tj 139 °C (30 kW LLC, HIGH 500 V, PSM, hot); peak η 98.11–98.30 % | `calculations/out/envelope-grid.csv` |
| **Loss budget at the rated point** | `node calculations/thermal/loss-budget.mjs` | η **96.62 / 96.70 / 96.56 / 96.48 %** with DOUT; SR on the full bridge loses 109 W more than JBS at 30 kW | `calculations/out/loss-budget.csv` |
| **Fault-pulse rule per die** (E69a-2) | `current-coordination.mjs` [F.01] / [F.11] | PFC 165.3 / 204.9 / 266.4 A and LLC 209.1 / 133.6 / 164.8 A per die ≤ 0.8 × IDM at the RFQ acceptance lines | run-all log |

The THD rows of §3 stand: the line-cycle model runs on a stiff 30 µH grid without the EMI filter, so the E68b filter
does not enter it; the filter's effect on the current loop is the `pfc-control` row above.

---

<div align="center">
<sub><a href="simulation-toolchain.md">← Simulation Toolchain</a> &nbsp;·&nbsp; <a href="README.md">🧭 Documentation hub</a> &nbsp;·&nbsp; <a href="verification-matrix.md">Verification Matrix & Risk Register →</a></sub>

<sub>Vectivolt DC-Modules · documentation rev E61 · every number reproduces with <code>sh calculations/run-all.sh</code></sub>
</div>
