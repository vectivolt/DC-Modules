<img src="assets/banner-verification.svg" alt="" width="100%"/>

# ✅ Verification Matrix & Risk Register

<sub>Every requirement mapped to its evidence, and the risks still open</sub>

<p>
  <img src="https://img.shields.io/badge/status-LIVE__SPEC-2ea44f?style=flat-square" alt="status: live specification"/>
  <img src="https://img.shields.io/badge/rev-E82-f2b705?style=flat-square" alt="revision E82"/>
  <img src="https://img.shields.io/badge/updated-2026--09--17-8b949e?style=flat-square" alt="updated 2026-09-17"/>
  <img src="https://img.shields.io/badge/verify--independent-243%2F243-2ea44f?style=flat-square" alt="verify-independent: 243/243"/>
</p>

> [!NOTE]
> **Purpose** — every specification requirement mapped to the executed artifact that verifies it, the standing
> gates that keep it verified, and the risks still open. **Nothing is marked V without an artifact on disk.**
>
> **Gate coupling** — `sh calculations/run-all.sh` reproduces the battery this matrix cites; a single failing gate
> stops it.

## At a glance

| | |
|---|---|
| **One command** | `sh calculations/run-all.sh` — **exit 0** end to end; a single failing gate stops the battery |
| **Clean-room recompute** | `verify-independent` **243 / 243** from its own netlist parser and its own physics |
| **Firmware** | **330 checks** under ASan/UBSan across seven binaries |
| **Release sheets** | **7,409 / 7,409** connected pins across five KiCad-5 SHIP targets → nine board PDFs |
| **Documentation** | `docs-lint` clean · **43 registered pages** |
| **Status letters** | **V** verified by an executed artifact · **P** planned, not executed · **N** not applicable at this phase |

## Scoreboard

| Gate | What it checks | Result |
|---|---|---|
| `envelope-grid` | 4 SKUs × 6 input voltages × 8 output voltages × 7 loads × 3 temperatures (E67 LOW/HIGH modes) | **4,536 points** · **no FAIL row anywhere** (E82): the 324 LIMIT rows E81 registered as NOT SUSTAINABLE at the 150 V phase-shift corner are gone — weak-leg dead time, the per-die loss term and `hal/dielim.c` closed F-L-1 — leaving a fold map only · worst junction with folds applied **150 °C** |
| `monte-carlo` | tank gain per SKU on the E67 tanks, choke lots, voltage and current chains, full-bridge dead time | **8 batches × 10k samples · pass** |
| `fsm-sim` + `run_tests.sh` | fault scenarios · C firmware under ASan/UBSan | **26 / 26** · **330 checks**: `boot_test` 22 · `host_sim` 122 · `ctl_test` 20 · `proto_test` 42 · `hal_test` 45 · `app_test` 29 · `e81_test` 50 ([firmware verification](firmware-verification.md)) |
| `stress-audit` | every device, magnetic, pulse part and protection class against its acceptance line | **158 checks · clean** (incl. the E69a PFC die classes, the E67 grid-shape assert, the E73 D7 CM-flux and D4 Rdc rows, and the E81 `[DPT]` snubber and ZVS-budget rows) |
| `current-coordination` | simulated peaks vs trips, observability, DESAT vs SCWT, fault flux, **per-die fault pulse ≤ 0.8 × IDM (E69a-2)**, film-bank ripple (E68c), output diode, **precharge-bypass closure (E73)**, the E81 `[DCLINK] [ZVS] [F.11] [SP] [SYNC]` rows | **102 checks · clean** |
| `temp-critique` · `conductor-audit` · `magnetics-envelope` · `mag-sync` | core temperature, AC copper, D3 cells / D2 at every simulated corner, identity sync across five carriers | **10 · 18 · 30 · 48 · clean** (E73: fan-out and cell-imbalance rows) |
| `fault-energy` | stored energy, wire vs fuse, surge, air and coolant budget | **23 checks · clean** |
| `verify-independent` | clean-room recompute from its own netlist parser and physics | **243 / 243** |
| `review-checks` *(outside run-all)* | every audit and external-review closure as an assertion | **154 / 154 pass** (E81: 141) — the nine E82 closure rows added, six re-pointed where a moved number had left them matching prose |
| `kicad5-verify` | release-sheet pins against the netlists | **7,409 / 7,409 · 5 targets** (1,708 · 1,768 · 1,780 · 1,804 · 349) |
| `docs-lint` | links, anchors, page chrome, diagram types | **clean · 43 registered pages** |
| `magnetics-rfq-audit` | every magnetic drawing on the module pages carries every field a winder quotes against (E70: in run-all) | **0 missing · 25 drawings** |
| `bom-gen` · `mag-docs` | the per-module BOM and magnetics pages, generated from the built boards and the gate evidence (E70) | **4 + 4 pages** |
| `mkf-crosscheck` *(by hand)* | PyOpenMagnetics second opinion on every custom magnetic: D1 toroid Rdc and Kool Mµ DC bias, D2 / D3 Rdc, gap fringing, 2-D copper and thermal, D4 gap and copper, D7 permeability (E71 · E73) | **40 rows · Rdc within 6 % · D1 DC-bias conservative · class lines hold · 50 kW air D3 130 °C vs the 125 °C design line → T-31 watch** |
| `footprint-audit` | unnamed packages and MPN / land conflicts on the release sheets | **0 · 0 — queue closed (E64), ratchet at zero** |
| `standby-budget` | drawn HV passive network vs the registered standby arithmetic and the ≤ 10 W target (E64) | **consistent · EVT measures** |
| `mtbf-budget` | parts-count reliability prediction vs the registered table (E64) | **372–410 kh · consistent** (re-registered at E69 on the corrected classifier) |

```mermaid
flowchart LR
  SRC["cells.tsx · boards.tsx<br/>control-card.tsx · parts-db"] --> BUILD["tsci netlist builds<br/>9 boards · 0 errors"]
  BUILD --> ENG["engines<br/>pfc · llc · dm-choke · loss<br/>grid 4,536 pts · Monte-Carlo · fsm-sim · vienna-switched"]
  ENG --> GATES["computing gates<br/>stress · coordination · conductor · temp · fault-energy<br/>interconnect · polarity · schematic"]
  GATES --> IND["verify-independent<br/>243 clean-room checks"]
  IND --> REV["review-checks<br/>154 assertions"]
  REV --> SHIP["KiCad-5 SHIP zips × 5<br/>pin-verify · uniformity"]
  SHIP --> PDF["9 release PDFs"]
  FW["firmware run_tests<br/>330 checks (E82)"] --> REV
  style GATES stroke:#d19a00,stroke-width:2.5px
  style IND stroke:#2ea44f,stroke-width:2.5px
```

## 1. Requirements → evidence

| Requirement (§2) | Evidence | Status |
|---|---|---|
| PF ≥ 0.99 · THD ≤ 5 % (stretch 3 %) | `hal_test` SIL with the shipped law (E81): THD-40 0.76 / 0.65 / 0.69 % at 400 VAC full load, PF 0.9999; cycle-by-cycle Vienna 0.09–0.15 % at 330 VAC; the 30 kW averaged deck (0.59–1.05 %) is superseded | V (averaged + switched fidelity) · P bench T-02 |
| Output 150–1000 V CV/CC envelope | `simulation-results/<sku>/llc-stress.csv` — power-solved full-bridge decks (E67), legs in rails · grid 4,536 points, every point passing or a registered fold. **ZVS is no longer claimed on every edge** (E81 F-G-9: the old claim rested on a linear C_oss); the deck now carries non-linear C_oss + the snubber, ZVS is held by the per-leg adaptive dead time, and the phase-shift corners hard-switch the weak leg (F-L-1) | V analysis · P bench **T-58** |
| Peak η ≥ 97 % | `loss-budget.csv` full load **96.38 / 96.35 / 96.32 / 96.25 %** (E81 ledger — DOUT, LLC turn-off and the DPT switching share included); grid peaks **97.80 / 97.73 / 97.72 / 97.72 %** | V calc · P calorimetric T-03 |
| Full power to +55 °C, derate to +75 °C | `derating.csv`; worst Tj ≤ 150 °C with computed folds (`envelope-grid`, `stress-audit`) | V calc · P chamber T-04 |
| Environment −30…+75 °C (A11 rev C) | `temp-critique` COLD rows at −30 °C; −40 °C-category DC-link class spec; IP55 fan spec line | V spec · P cold soak T-32 |
| Ripple ≤ ± 0.5 % | film-only banks (E68c): 9 / 12 / 14 × 2.2 µF per bank, ≤ 0.5 % RMS at −10 % C on every simulated corner (`current-coordination` [OUT]; worst 0.47 / 0.46 / 0.49 % at PS150-Imax) | V calc · P bench T-03 / T-40 |
| Voltage accuracy ± 0.5 % · current ± 1 % | Monte-Carlo C/D: ± 0.18 % / ± 0.2 % after 2-point EOL calibration | V calc · P EOL |
| Standby < 10 W | aux budget at idle | P bench |
| Input derating curve | E1 curve + `input-currents.csv` | V |
| Every hardware trip ≥ 1.2 × the simulated worst peak | `current-coordination` over `llc-stress.csv` + `vienna-switched.csv` | V sim · P T-30 |
| Trips observable through the 3 µs kill race | same + `spice/protection/ct-frontend.mjs` per SKU | V · P T-17 / T-30 |
| DESAT response ≤ 75 % of SiC short-circuit withstand | NSI66x1A worst timing vs SCWT class (22 / 47 pF blanks) | V datasheet-class · P T-30 |
| Protection hardware paths present | DESAT chains, comparator allocation (E48), OVP, exclusion, WDO ≡ NRST — in the netlists | V design · P injection T-06 |
| Mode-change safety | E67: LOW/HIGH latched in standby, KSER / KPARA / KPARB switched at 0 A behind DOUT, 74HC02 exclusion; per-tick exclusion invariant in `host_sim`; welded KPARA → F.17 at the SER soft start | V sim · P bench T-07 / T-35 |
| Discharge to < 60 V | two-phase model per SKU (active 2.0 / 2.4 / 3.2 s; passive 370 / 222 / 296 s, netlist-proven strings) + label + F.21 AC-present latch | V calc · P hold-up waveform |
| Winding AC copper inside the pack rows | `conductor-audit` + clean-room §B | V model · P first-article Rac T-31 |
| D3 gap fringing on the innermost foil | gap split per core set (pack + build instructions) + FEMMT run | construction · P T-31 |
| Models anchored to sources they did not produce | `verify-independent` §K: Vienna vs Friedli–Kolar ± 0.7 %; LLC vs Wolfspeed CRD-30DD12N-K measurement −8 % pk | V |
| Loss budget and air budget use physical inputs | `loss-budget` reads the PAR400 nominal corner; `fault-energy` reads `loss-budget.csv` | V |
| EOL and EVT windows belong to the product SKUs | `dfm-production` steps 4 / 5 / 8; `evt-plan` T-08 / T-17 / T-22 restated (T-24 retired with K_OUT at E67) | V doc · P first EOL lot |
| Device mounting basis (E68a) | `thermal/mount.mjs`: clip-mounted TO-247 on Al2O3, 0.8 K/W at a 70 °C base (air), 0.65 K/W at 65 °C (liquid) — read by every Tj engine | V model · **P T-38** |
| EMI filter without DM chokes (E68b) | `lisn-precompliance`: drawn star-X2 per-phase ladder, DM margin 32.9 / 30.6 / 28.7 dB against the E65 control 19.6 / 19.1 / 18.4; `pfc-control` modulus margin **0.66 / 0.61 / 0.54** at the shipped 15 µs delay (E81; 0.73 at 50 kW with the 4.7 µF / 4.7 Ω damper) | V sim · P T-08 / **T-39** |
| Right-sized SiC dies survive their trip (E69a-2) | `current-coordination` per-die pulse: PFC 165 / 205 / 266 A and LLC 209 / 134 / 165 A per die ≤ 0.8 × IDM; IDM acceptance lines in `parts-db` | V calc · P RFQ + **T-41** |
| Output diode and zero-current relays (E67) | `current-coordination` [OUT]: DOUT at 67 % of class, Tj 115 / 120 / 123 / 128 °C | V calc · P **T-36** |

## 2. Schematic and BOM verification

| Check | Result |
|---|---|
| Netlist build errors | **0 on all 9 boards** (4 SKU pairs + card) |
| Release-sheet pins | `kicad5-verify.mjs`: **7,409 / 7,409** connected pins across the five SHIP targets (title blocks carry each board's E67–E69 content) |
| Schematic symbol overlaps | **0** on every SKU pair |
| Module interconnect | clean — studs, all 40 harness ways, the 88-way slot, RATING straps |
| Polarity | every polarized part has its + / anode on pin 1 as the glyphs draw it (E38 gate + R4-1 seating fix) |
| Driver channels | one `DriverCh` cell for all 7 channels per module — 3 Vienna + 4 full-bridge LLC since E67 (real NSI6611 map R4-2, DESAT series R R5-B, per-stage blank E60) |
| BOM coverage | 0 unmatched designators; every class part carries a value-carrying order code; `bom-maturity` MATURE |
| Supervisory logic | C99 FSM + CAN codec + group share law + the E73 bypass-closure window + the E81 and E82 rows: **330 checks** under ASan/UBSan |
| PCB layout | **N** — out of scope: the design face ends at the audited KiCad-5 schematics (E36, E70) |

## 3. Simulation matrix

| Domain | Executed | Result |
|---|---|---|
| Device edge | double-pulse (26 runs), behavioural SiC | overshoot 70 % with the RCD clamp; ± 40 % energy band |
| Vienna | line-cycle averaged (6) + cycle-by-cycle (7 cases + 3 events per SKU) | peaks 97 / 127 / 159 A; THD fixed at high line by FW-R7 |
| LLC | power-solved full bridge per SKU (E67), stress corners + 20-point envelope + internal-short race | ZVS 64/64; worst tank peak 112.7 / 148.1 / 182.8 A (SER 250 V) |
| Protection | CT front-ends per SKU · precharge / discharge / bank bleed | all pass |
| Aux | flyback per SKU at 342 / 560 / 850 V | 12 / 12 pass |
| System | grid 4,536 · Monte-Carlo 6 batches · 26 scenarios | 0 failures · pass · 26 / 26 |
| EMI | LISN pre-compliance per variant (E68b star-X2 ladder) | DM margins + 32.9 / + 30.6 / + 28.7 dB · CM + 8 dB at 200 pF |

> [!WARNING]
> The pre-E60 LLC op-point record was produced by a deck without MOSFET body diodes and is **withdrawn**; the
> power-solved decks above replace it. See [simulation report](simulation-report.md) §13 and
> [simulation toolchain](simulation-toolchain.md).

## 4. Review history

| Round | Verdict at review | Closure |
|---|---|---|
| **R1** adversarial audit | NO — 15 critical | rev C, same day |
| **R2** re-audit | NO — 7 new criticals inside the rev C fixes | rev D, same day; assertion suite began |
| **R3** external PDF | "do not manufacture" on pin numbering | allocation regenerated from the datasheet |
| **E35 / E37 / E38** margin, interconnect, polarity audits | 8 + 4 + 0 findings | same-day closure, permanent gates |
| **R4–R8** external PDF rounds (register E45–E49) | ~40 claims per round, triaged against netlists and datasheets | every real defect fixed and gated, including one retraction of our own arithmetic (E49) |
| **E51 / E58 / E60** magnetics recompute, temperature critique, current coordination | unbuildable windows, temperature-blind fits, trips below real peaks, non-physical LLC deck | re-issued constructions, computing gates |

## 5. Risk register

| ID | Risk | Severity × likelihood | Mitigation / retirement | Status |
|---|---|---|---|---|
| R1 | LLC gain hole at 150–260 V per bank | H × M | hybrid phase-shift mode, ZVS shown; duty → power calibration in firmware | mitigated · bench pending |
| R2 | Inter-board stud joints at bus current | M × M | milliohm EOL check, Belleville hardware, torque spec | open (design done) |
| R3 | SiC RFQ pricing ± 25 % | H × M | 5-vendor RFQ round 1 after the DPT freeze | open |
| R4 | 1000 V relay make / weld qualification, mirror variant | H × M | pre-insertion, matched-voltage make, two-stage exclusion; Hongfa RFQ · **E67:** the S/P relays switch at 0 A behind DOUT, K_OUT and pre-insertion are retired — the residual is a welded KPARA (F.17, T-35) | narrowed (E67) |
| R5 | Behavioural SiC model band (± 40 % switching energy) | M × H | worst-case k_sw used for fsw; bench DPT T-01 | mitigated |
| R6 | Transformer partial discharge at the 1 kV class | H × M | D3 insulation system + PD sampling | open (specified) |
| R7 | EMI pre-compliance gap | M × H | per-variant LISN margins on the drawn E68b star-X2 ladder (no DM chokes) with the E65 filter as control; **E81:** with the LLC bridge counted as a second CM source the margin is **+3.1 dB at the 100 pF leg-node requirement and +7.1 dB at the 50 pF design target** with CY1-3 raised to 10 nF — the analytic ladder flips sign between 200 and 600 pF of switch-node capacitance; chamber at EVT (T-08 / **T-39**) | mitigated (analysis) · **Cp is ASSUMED** |
| R8 | GD32G553 alternate-function / comparator table deltas | M × M | pin map regenerated from the vendor table; comparator instances pinned (E48) | open (narrowed) |
| R9 | PV bleeder gate drive over temperature | M × M | guaranteed 10 mA drive + 25 °C-endpoint model; EVT loaded-Vgs gates BOM freeze | open (measurement) |
| R10 | Aux cold start at low line and −30 °C | L × M | NCP1252D + 220 µF (3 × budget); T-29 / T-32 waveforms | mitigated (design) |
| R11 | COGS against the red-line | H × M | 10k basis near or below red-lines; levers in the cost roll-up | open (quote-dependent) |
| R12 | Real SiC short-circuit withstand shorter than the class used | H × L | DESAT at ≤ 75 % of the class; RFQ acceptance tSC ≥ 2 µs at 800 V; T-30 | open (vendor data) |
| R13 | D3 innermost-foil fringing loss above the 1-D model | M × M | gap split per set; FEMMT run; T-31 open-secondary check + S1 thermocouple | mitigated (construction) |
| R14 | 480 V grid customers need 530 VAC input | M × M | product-owner decision — filter already X1 530 VAC / Y1 440 VAC / MOV 550 VAC; F.07 trip at 500 VAC and 21 V of bus headroom are the real work | open (decision) |
| R15 | Sourcing restrictions on bias / isolation modules (Mornsun OFAC flag) | M × M | qualify MEAN WELL / RECOM / CUI-class second sources before volume | open |
| R16 | BOM busbar line below the computed set at 40 / 50 kW (₹953 / ₹1,188 vs ₹810 / ₹850) | L × H | reconcile at the mechanical RFQ | open (cost) |
| R17 | ~~Release sheets not layout-ready: 307 components named no package; 344 carried an MPN whose package differed from its land~~ | M × H | **resolved at E64** — every part names its package, the value map is land-aware, `footprint-audit` holds both counts at zero; the C-number read-back list is purchasing work (REVIEW lines on each module BOM page), not a design gap | **resolved (E64)** |
| R18 | ~~No series output blocking diode: reverse-battery and bus back-feed held by K_OUT isolation, the E12b matched-voltage make and mirror weld-check~~ | L × M | **resolved at E67** — DOUT (1600 V, 150 / 200 / 250 A class, InfyPower practice) is fitted on every SKU and K_OUT is retired; its loss is in the loss budget and its Tj in `current-coordination` | **resolved (E67)** |
| R19 | Clip-mount Rth basis unproven: every Tj gate reads 0.8 / 0.65 K/W from `mount.mjs`, and the single-die decisions of E68a/E69a depend on it | H × M | EVT T-38 with a +15 % acceptance; a miss reopens the mount and restores paralleled dies where the grid folds | open (EVT) |
| R20 | Right-sized SiC dies miss their pulsed-current line at RFQ (SG2M023120LJ IDM ≥ 265 A; 750 V 20 / 15 mΩ classes ≥ 210 / 260 A) | M × M | acceptance lines in `parts-db`; T-41 sample pulse test; revert path per SKU (two LLC dies / B3M010C075Z) priced | open (RFQ) |
| R21 | Cost gap to InfyPower: the India 10k basis is ~38–47 % above the E62 teardown estimate (≈ ₹23.6k at 40 kW) | H × H | China RFQ-target column (E69f); 2U construction scenario (E69e); deferred drive clone (−₹470) and aux / relay levers; buy and measure one REG1K0135A2 to replace estimates with data | open (commercial) |
| R22 | 2U construction prerequisites unproven: the PFC choke must lie in a well (T79 stacks 60–95 mm), a 3-core 40 kW D1 fails F.01, the chassis must hold a 70 °C base at 55 °C | M × H | scenario only — the design basis stays the 3U card; needs a flat-core D1 and a mechanical design with quotes | open (design) |

| ~~**R23**~~ | ~~**Sub-200 V output on the 40 / 50 kW SKUs (E81 F-L-1)**: the 150 V phase-shift corner hard-switches the weak leg and is registered **NOT SUSTAINABLE**~~ | H × H | **closed at E82 (C-11)** — it was a weak-leg dead time computed on the magnetising current (`weak_dead_s()` now 125 / 186 / 189 ns, the SPICE deck programs the same edge), a per-die weak-leg loss the grid charged twice, and a fold no firmware implemented (`hal/dielim.c`). No grid row fails; the residual at PS150 falls to 0.45 / 0.60 / 0.60 of the link | **closed** — the residual map stays firmware-conservative until **T-58** |
| **R24** | PFC ISR budget on real silicon: 5.8 µs static by disassembly | H × M | trims are in; **E82 (M-21) moved the control interrupt onto the ADC end-of-sequence transfer, raising the budget to the roll-over from 5.0 to ≈ 7.2 µs**; the single-update fallback is **forbidden** on 40 / 50 kW; GD32G553 at 216 MHz chosen over the STM32G474 for this reason | open (**T-64**, measured with DWT) |
| **R25** | Layout promises the DPT and DC-link decks assume: link impedance 40 / 60 nH and loop inductance 5 / 7 nH | H × **H at E82 (C-10)** | layout rules in the netlists; every final DPT row passes at those loops — a miss reopens the snubber set. **E82 re-ran the repo's own DPT deck at a realistic 10–30 nH: R_g,off 0 Ω reads 78–92 % of 1200 V at 10 nH and 90–103 % at 20–30 nH**, so the ≤ 10 nH rule is load-bearing, not a preference — a ring-down measurement gates every high-power run, and a miss costs a gate resistor **and** a second 30 kW die or a fold (k_off rises 3–5×) | open (**T-57 / T-59**, Stage 7) |
| **R26** | CV load-step overshoot on the film-only bank (+4.9 … +9.7 % at the stud) | M × M | spec restated ≤ 10 % with the code's F.14 thresholds; the ≈ +₹500 electrolytic route is registered — the E81 teardown re-read shows the benchmark's banks are **not** film-only | open (user decision · **T-60**) |

The bench campaign that retires the P rows is the [EVT test plan](evt-plan.md).

> [!TIP]
> **How this page is checked** — `sh calculations/run-all.sh` reproduces the whole battery this matrix cites — a single failing gate stops it — and `verify-independent` recomputes 243 of its claims from its own parser and physics.

---

<div align="center">
<sub><a href="simulation-report.md">← Simulation Report</a> &nbsp;·&nbsp; <a href="README.md">🧭 Documentation hub</a> &nbsp;·&nbsp; <a href="evt-plan.md">EVT Test Plan →</a></sub>

<sub>Vectivolt DC-Modules · documentation rev E82 · every number reproduces with <code>sh calculations/run-all.sh</code></sub>
</div>
