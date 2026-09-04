# Verification Matrix & Risk Register (§49-23/24, §50)

Status letters: **V** = verified by executed calc/sim (file cited) · **P** = planned/spec'd, not executed · **N** = not applicable at this phase. Nothing marked V without an artifact on disk.

## Requirements → evidence

| Req (§2) | Evidence | Status |
|---|---|---|
| PF ≥0.99 / THD ≤5% (stretch 3%) | `pfc-phase-runs.csv`: THD-40 0.59–1.05% full, 2.55% @25% | V (averaged fidelity; bench confirm at EVT T-02) |
| Output 150–1000 V CV/CC envelope | `llc-opmap.csv` (60 pts) + `llc-oppoints.csv` (ZVS all, boost margin +59%) | V analysis / P bench |
| Peak η ≥97% | `loss-budget.csv`: 97.4–97.5% @nominal (JBS) | V calc / P bench |
| Full power to +55 °C, derate to 75 °C | `derating.csv`, heatsink Rth ≤0.032 K/W requirement | V calc / P thermal chamber |
| Ripple ≤±0.5% | bank/output film+elyt sizing; 3-φ interleave | P (bench T-03) |
| V-acc ±0.5% / I-acc ±1% | divider 0.1% bottom + EOL cal flow (§45) | P (cal at EOL) |
| Standby <10 W | aux budget 6.8 W calc @idle (LLC off, fans off) | P bench |
| Input derating curve | E1 curve + `input-currents.csv` | V |
| Protections (30 items) | `protection-thresholds.md` — HW paths in schematic (DESAT/COMP/OVP nets) | V design / P bench T-06 |
| Mode-change FSM safety | `sp-transition.csv` → pre-insertion architecture E12/E13 | V sim / P bench T-07 |

## Schematic/BOM verification (this rev)

| Check | Result |
|---|---|
| Netlist build errors ("could not find port", invalid pins) | **0 on all six boards** (30/60 pairs verified; 120 pair after background build — this line updates at final review) |
| MCU pin conflicts | `assertUniquePins` throws at build — **passing** on built boards (incl. HW-pin exclusions) |
| Driver channels fully powered/wired (bias, DESAT, EN, FLT) | V — `DriverCh` cell used for all 9/18/36 channels |
| Every relay coil driven | V — ULN outputs mapped, KPRE on AC-DC ULN, 6 coils on DC-DC ULN |
| Sense chain completeness | V — 5 HV dividers +3(AC), CTs per phase/section, output shunt, 4 NTC |
| HMI (E21) | V — 2 buttons, 2-digit display, 595+mux wired to MCU-LLC pins 88–94 |
| BOM coverage | bom-gen reports **unmatched = 0** required for sign-off (currently: snubber rule added; re-run pending 120 kW build) |
| Diode orientation TO-247-2 pin1=anode | ASSUMED — VERIFY vendor drawing before fab (§40) |
| PCB layout | **N — explicitly out of scope per customer directive 2026-09-04** (placement DRC warnings ignored; layout phase reopens later) |
| Production supervisory logic (E24) | **V — C99 fsm+CAN codec, 33/33 checks (26 scenarios + codec + 100k-frame fuzz) under ASan/UBSan**; found+fixed K_OUT gate defect (E12b) |

## SPICE matrix status (§35/§36) — deltas from simulation-report.md

Executed: DPT (26), PFC loops AC, Vienna line-cycle (6), precharge/discharge, LLC op-points (8, re-run at rev D2), S/P mismatch (4),
**§35 grid 3024 pts (0 fail)**, **§37 Monte-Carlo 6 batches (all PASS after rev-D2 iteration)**, **aux flyback V-21 (PASS both corners)**,
**LISN pre-compliance (E22 closes 30 kW gap, +7.8 dB estimate margin)**, **§36 scenario suite 26/26 PASS (fsm-sim)**.
Open: none in the simulation domain. Hardware-domain items (bench/chamber/PD/relay-life) = EVT T-01…T-10 — physically outside this environment.

## Independent design review (2026-09-05)

Adversarial production audit `design-review-production.md`: **verdict NO** — 15 critical blockers
(filter/bank cap ratings, isolation-breaching sense dividers, floating AGND, aux block unbuildable +
range/budget, precharge bypass rating, missing Vienna film caps, enable/kill/WD chain unimplemented,
discharge fail-engaged hazard, CLAMP pins floating, no SWD/boot, link TX/TX, unbiased bipolar senses),
12 high, 10 medium. Fault-matrix delta rows FAIL until fixed; §K datasheet gate defined. This
supersedes the earlier schematic-verification optimism: ERC-clean ≠ electrically correct.

**Fix closure (rev C, same day):** all 15 blockers + the HR/MR list implemented in schematic rev C
(cells v3 / boards v3 / parts-db rev C — see the Fix log appendix in `design-review-production.md`).
Evidence: six boards rebuilt 0 netlist errors; aux flyback rev B simulated at 342/560/850 V (PASS);
per-fix grep assertions in `calculations/review-checks.mjs`. Still open by nature: §K datasheet
gate, ECO-1 (E23), bench EVT (T-01…T-18).

## Risk register (rev B)

| ID | Risk | Sev×Lik | Mitigation / retirement | Status |
|---|---|---|---|---|
| R1 | LLC gain hole 150–260 V bank | H×M | Hybrid PS mode — ZVS shown at PS-150 op point; duty→P calibration FW-R2 | Mitigated (design), bench pending |
| R2 | ~~120 kW single-PCB density~~ → superseded by E17 two-board split; new: inter-board 156 A stud joints | M×M | Milliohm EOL check, belleville hardware, torque spec | Open (design done) |
| R3 | 2-MCU ceiling at 120 kW | M×M | Pin maps assert-clean at 12+12 PWM; ADC rate margin 19× | Closed (analysis) |
| R4 | SiC RFQ pricing ±25% | H×M | 5-vendor RFQ round 1 after DPT freeze | Open |
| R5 | 1000 V relay qual (make/weld/400 A) | H×M | Pre-insertion + paralleled-relay make policy; vendor qual plan | Open |
| R6 | Behavioral SiC model band (±40% Esw) | M×H | k_sw worst-case used for fsw choice; vendor models at NDA; bench DPT T-01 | Mitigated |
| R7 | Transformer PD at 1 kV class | H×M | D3 insulation system + PD sample test | Open (spec'd) |
| R8 | EMI pre-compliance gap | M×H | 2-stage filter + interleave; LISN deck P; chamber at EVT | Open |
| R9 | GD32G553 datasheet deltas (pins/HRTIM) | M×M | A6 verify; pin maps regenerate from tables | Open |
| R10 | Vienna zero-cross distortion (common-gate) | L×M | THD sims clean at averaged level; bench check T-02 | Mitigated |
| R11 | Two-board harness single point of failure | M×L | KILL/EN fail-safe + link CRC/timeout; harness retention + shield | Mitigated (design) |
| R12 | COGS over red-line at schematic-exact count | H×H | **Internal levers EXECUTED**: E23 custom bias (−₹0.9k @30 kW, in BOM); remaining levers are external RFQs (quantified in bom-cost.md); stretch unreachable — management flag stands | **Open (external-quote-dependent only)** |

## EVT plan pointer

Bench-first items T-01…T-10 in `docs/evt-plan.md` (DPT bench vs sim, THD/PF, ripple/accuracy, thermal chamber, precharge/discharge pulse ratings, protection injection, S/P transition, EMI pre-scan, aux brown-out, HMI/CAN soak).
