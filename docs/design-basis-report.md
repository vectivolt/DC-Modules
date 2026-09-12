# Design Basis Report — 30/60/120 kW Unidirectional 1000 VDC EV Charging Monoblocks

<p align="left"><img src="https://img.shields.io/badge/status-HISTORICAL__RECORD-555?style=flat-square" alt="HISTORICAL__RECORD"/> <img src="https://img.shields.io/badge/rev-E52-f2b705?style=flat-square" alt="rev"/> <img src="https://img.shields.io/badge/updated-2026--09--12-555?style=flat-square" alt="updated"/></p>

> **Purpose** — Phase-1 design basis (dated). Superseded values carry arrow-notes; the register is authoritative.
>
> **Gate coupling** — design-basis.mjs greps this file — gate-pinned path.


> **HISTORICAL RECORD** — kept verbatim as the Phase-1 basis; the live system is docs/architecture.md (rev E49).

Status: **PHASE 1 DELIVERABLE — ANALYTICAL BASIS ONLY.** No SPICE simulation has been executed yet. Every number below is either a documented assumption or traces to `calculations/design-basis.mjs` (outputs in `calculations/out/*.csv`). Items that require simulation or RFQ confirmation are explicitly marked. Nothing in this document is claimed as verified.

---

## A. Finalized assumptions

| # | Assumption | Value | Basis |
|---|---|---|---|
| A1 | Sizing efficiency for input-current math | η = 0.965 | Main-window target (§2); conservative vs 0.97 peak |
| A2 | Power factor at rated operation | 0.99 | Spec §2 |
| A3 | Full-power input floor | **330 VAC** line-line | Calculated derating decision, §B below |
| A4 | Below 330 VAC | Linear power derate at constant input current (86% at 285 VAC) | Matches commercial module practice; caps copper/SiC/EMI sizing |
| A5 | DC link | Split bus, 800 V nominal, 650–850 V slow command window | §3/§12; LLC requests VBUS_ref to stay near resonance |
| A6 | Grid frequency | 45–65 Hz | Spec §2 |
| A7 | No neutral; PE/chassis only | — | Spec §2 |
| A8 | Unidirectional only | No AFE/DAB | Spec §3 |
| A9 | Output S/P crossover band | ~450–550 V with hysteresis, **placeholder** | To be optimized numerically in Phase 7 (§F) |
| A10 | Repeatable-cell strategy | One ~10 kW PFC phase cell and one ~10 kW transformer section reused 3/6/12× | Commonization (§D/§E); cost proof due Phase 12 |
| A11 | Ambient envelope | Full power to +55 °C, derate to +75 °C | Spec §2 |
| A12 | Cost basis | INR, ~1000 u/SKU, direct-China semiconductor RFQ assumed achievable | §L; ±25% confidence until RFQs return |
| A13 | Charger-level items (gun, IMD, EVCC, OCPP, output contactors, meter) excluded from COGS | — | Spec §1 |
| A14 | Standards targeted for design-for-compliance (not certification claims) | IEC 61851-23, IEC 62477-1, IEC 60664-1, IEC 61000 series | §47 |

No blocking questions were identified (§N). Where a decision could not be finalized analytically, a documented default + a phase that must prove it is given instead.

## B. Product specifications (frozen for Phase 2+)

Common: 3-phase 285–475 VAC (nominal 400/415), 45–65 Hz, no neutral. Output 150–1000 VDC commanded, CV/CC automatic. PF ≥ 0.99, THD ≤ 5% (stretch 3%), peak η ≥ 97%, window η ≥ 96.5%, V-accuracy ±0.5%, I-accuracy ±1%, ripple ±0.5%, full power to +55 °C, standby < 10 W (30 kW) / < 15 W (60) / < 20 W (120, target).

| | 30 kW | 60 kW | 120 kW |
|---|---|---|---|
| Max output current | 100 A | 200 A | 400 A |
| Envelope | min(P, V·Imax): 15 kW @150 V … full ≥300 V | 30 kW @150 V … full ≥300 V | 60 kW @150 V … full ≥300 V |
| Phase current, design point (330 VAC, full P) | **54.9 A** | **109.9 A** | **219.8 A** |
| Phase current @400 VAC | 45.3 A | 90.7 A | 181.3 A |
| Phase current @475 VAC | 38.2 A | 76.3 A | 152.7 A |
| Available power @285 VAC | 25.9 kW (86%) | 51.8 kW | 103.6 kW |

**Input derating decision (A3):** sizing full power down to 285 VAC would raise design phase current 15.8% (63.6 vs 54.9 A at 30 kW), inflating SiC conduction loss ~34% (I²), PFC inductor energy, EMI filter, connectors and copper — for a corner of the envelope real sites rarely occupy continuously. Full power is therefore guaranteed 330–475 VAC; below 330 VAC the module holds its design input current and derates power linearly (86% at 285 VAC). This mirrors the behavior of the commercial reference modules (which derate below ~304 VAC). Full 7-voltage × 4-load current tables: `calculations/out/input-currents.csv`.

## C. Selected topology

```
3φ AC → fuse/MOV surge → EMI (CM+DM) → precharge →
  [N× interleaved] 3-level Vienna PFC (750 V SiC pairs, 1200 V SiC JBS) →
  split DC link 650–850 V (2× series 450 V electrolytic banks + film commutation caps) →
  [N× interleaved] 3-phase half-bridge LLC (1200 V SiC), 3 transformer sections/channel →
  two floating secondary banks, SiC rectification (JBS baseline / SR alternative) →
  series-parallel relay matrix → output filter → 150–1000 VDC busbar
```

- **PFC:** Three-level Vienna. Switch pair sees VBUS/2 (≤425 V + ringing → 750 V SiC at ~70% margin pre-overshoot; DPT to confirm). **The opposite-rail boost diode blocks the full bus (up to 850 V + ringing) when the phase is clamped to a rail — 1200 V JBS is an electrical requirement, not margin padding.** Reference: STDES-30KWVRECT (control architecture only; all values recalculated).
- **Bidirectional switch realization:** common-source SiC pair, both gates driven together → **one PWM signal and one isolated driver per phase**. This is what makes the 2-MCU / 120 kW arrangement feasible (§H).
- **DC-DC:** 3-phase interleaved half-bridge LLC per channel, star-connected primaries, ~10 kW transformer sections. References: STDES-30KWLLC, STDES-60KWLLCWR (recalculated).
- **Secondary:** two floating banks per module, each 150–~530 V working, bridge rectification (center-tap rejected: 2·Vbank ≈ 1060 V pushes 1200 V parts; bridge halves device stress and permits 750 V-class parts as a cost option).
- **Variable bus:** LLC requests VBUS 650–850 V so PFM stays within ~0.8–1.25 gain. This is load-bearing (§E, §M-R1).
- Unidirectional confirmed; no bidirectional hardware anywhere.

## D. PFC scaling strategy comparison

| Criterion | 60-A: one big Vienna (parallel SiC, 3 large L) | **60-B: 2× interleaved Vienna lanes (chosen prelim.)** | 120-A: one huge Vienna | **120-B: 4× interleaved lanes @ 0/90/180/270° (chosen prelim.)** |
|---|---|---|---|---|
| Magnetics | 3 new large inductors (new p/n, ~0.9 J each) | 6× the 30 kW inductor p/n | 3 very large custom L | 12× the 30 kW inductor p/n |
| SiC | Paralleled dies, matched-pair binning needed | Same 6-FET set as 30 kW, ×2 | 4-way paralleling, sharing risk | Same set ×4, no die paralleling |
| Ripple/EMI | Full ripple into filter | Interleaving cancels ~50% ripple at 2× eff. freq. | Full ripple | ~4× effective freq., deepest cancellation |
| PWM/control | 3 PWM | 6 PWM, phase-shifted timers | 3 PWM + sharing control | 12 PWM (fits one HRTIM, §H) |
| Current sharing | Static+dynamic die sharing (Monte-Carlo risk) | Per-lane current loops — sharing by control | Worst sharing risk | Per-lane loops |
| Cost driver | Fewer drivers (−3) | One inductor p/n across all SKUs; volume 3+6+12 | Fewest drivers | Driver count ×4 but max part commonality |

**Preliminary selection: 60-B and 120-B** — interleaved repeats of the proven 30 kW lane. Rationale: eliminates die-paralleling risk entirely, cancels ripple (smaller EMI filter — quantification due in Phase 26 EMI sims), and puts one PFC inductor and one FET part number across the whole family (~21,000 inductors/yr at 1000 u/SKU — real leverage). Cost delta of extra drivers (+₹~350/60 kW, +₹~1,050/120 kW) is expected to be repaid by EMI-filter and magnetics commonality; **formal total-COGS proof is Phase 12 and the decision reverses if it fails.** All on one PCB, one controller system.

## E. LLC scaling strategy comparison

| Criterion | One big bridge, paralleled SiC | 2× 60 kW channels (120 kW) | **N× ~30 kW 3-phase channels (chosen prelim.)** |
|---|---|---|---|
| Transformer | New large p/n per SKU | 2 mid p/n | **One ~10 kW section p/n: 3/6/12 sections** |
| Resonant tolerance | One tank, huge caps | 2 tanks | N tanks; per-channel trim; ±5% Cr Monte-Carlo shared |
| Device stress | Parallel dynamic sharing in resonant loop (hard) | Mild | None — per-leg currents are the 30 kW values |
| Light load | Poor (one big tank circulating) | Channel shedding ×2 | **Channel + phase shedding: 120 kW can idle down to one 3-φ channel** |
| Control | 3 PWM + sharing | 6 PWM | 3N PWM, common PFM frequency, per-channel enable |

**Preliminary selection: repeatable ~30 kW 3-phase LLC channels** (1/2/4 channels; 3/6/12 identical transformer sections). Interleaving channels (0/60° effective) reduces output ripple; phase/channel shedding directly serves the <10 W standby and light-load efficiency targets. Same caveat: Phase 12 must prove total COGS vs the 2×60 kW alternative for the 120 kW SKU (fewer, larger sections save drivers/board area but break commonality and reintroduce paralleling).

## F. Output series/parallel architecture

Two floating secondary banks (A, B), each fed by rectifiers from all transformer sections of its channel group.

- **Parallel mode:** banks paralleled → 150–~500 V out, full current (each bank carries Iout/2).
- **Series mode:** banks stacked → ~300–1000 V out, each bank at Vout/2, full Iout through both.
- Relay set: K_SER (series link), K_PAR_A, K_PAR_B (parallel links) + precharge + discharge. 1000 VDC-class relays (Hongfa HFE82-family or equivalent; 120 kW parallel links at 200 A each — single 400 A path avoided by splitting, to be verified in Phase 13).
- **Mode-change FSM (mandatory sequence):** ramp Iout→0 → LLC PWM off → verify I≈0 → break-before-make with dwell → **pre-close bank-voltage matching: LLC actively charges/discharges banks to ΔV < 10 V before any parallel closure** → close → verify contact state via per-bank voltage sensors → resume. Weld detection: commanded-open + banks still tracking ⇒ latched fault. Hysteresis band around crossover (default 450/550 V) so a vehicle sitting at 470 V never cycles relays.
- **Crossover optimization (Phase 7):** sweep crossover 400–600 V against transformer ratio, rectifier conduction, winding RMS, relay stress, ripple; §A9 default is a placeholder, not a decision.

**Calculated LLC window behind this** (`calculations/out/llc-window.csv`): with n_eff = 1.0 (bank 400 V at bus 800 V, gain 1) and PFM gain 0.8–1.25 over bus 650–850 V, the reachable bank window is **260–531 V**. The 150–260 V bank region (needed for 150–260 V parallel-mode output) requires g down to 0.46 — **unreachable by PFM alone. Hybrid control (phase-shift/duty below ~260 V bank, burst at light load) is a mandatory design element, not an option.** Power in that region is envelope-capped (≤ ~26 kW/30 kW-equivalent at 260 V), which bounds the phase-shift-mode RMS penalty; Phase 6/7 must produce the exact mode map and prove tank stress. This is risk R1 (§M).

## G. Preliminary semiconductor table

All parts are **candidates pending DPT simulation (Phase 4) + RFQ (Phase 2)**. Qty = 30/60/120 kW.

| Position | Primary candidate | Rating | Qty | Worst calculated stress | Alternates (to qualify) |
|---|---|---|---|---|---|
| PFC switch pair | BASiC B3M010C075Z | 750 V, ~10 mΩ, TO-247-4 Kelvin | 6/12/24 | 425 V + ringing (DPT to bound ≤ ~560 V = 75%) | SiChain / InventChip / CR Micro / StarPower 750 V 9–12 mΩ, via RFQ |
| PFC boost diode | SiChain 1200 V / 40 A SiC JBS class | 1200 V TO-247-2 | 6/12/24 | **Full bus 850 V + ringing** (blocks full bus, §C) | BASiC/CR Micro 1200 V JBS |
| LLC primary | SiChain SG2M023120LJ | 1200 V, ~23 mΩ, TO-247-4L | 6/12/24 | 850 V bus + overshoot | BASiC B3M020120ZL (20 mΩ); InventChip/CR Micro 18–35 mΩ |
| Secondary rectifier (baseline) | SiC JBS bridge | 1200 V (750 V-class option, Phase 7) | 24/48/96 | ~531 V bank + overshoot | — |
| Secondary SR (alternative) | 1200 V 20–30 mΩ SiC FET + drivers | — | 24/48/96 + 12/24/48 drv ch | same | 900 V low-Rds if economically sourceable (ST 60 kW precedent) |
| Gate driver | NOVOSENSE NSI6611 class | ~10 A, UVLO, Miller clamp, DESAT, soft-off | 9/18/36 iso ch | CMTI at DPT-measured dv/dt | — |
| HV iso sense | NOVOSENSE NSI1200 class | — | per §19 | — | exact current production p/n in Phase 2 |
| Iso CAN | NOVOSENSE NSI1042/1050 class | — | 1 | — | — |

**Secondary JBS vs SR — the standing COGS comparison (§4):** at 30 kW, JBS bridge ≈ ₹2.2–2.6k with zero drive overhead; conduction loss ≈ 2·V_f·I_avg ≈ **~150 W at 100 A parallel-mode full current** (≈0.5% η, worse at low V). SR ≈ ₹6–8k with drivers + iso bias, cutting that roughly in half (~60–80 W saved) → smaller heatsink share and ~0.3–0.5% efficiency in the low-voltage quadrant. Decision deferred to Phase 7 simulation with real thermal costing; **JBS is the cost baseline, SR the efficiency alternative**, both carried in the BOM model.

Gate bias per vendor datasheet (not commonized blindly): +15/+18 V on, {0, −3, −4, −5} V off candidates swept in DPT.

## H. Preliminary MCU resource map

Two GD32G553-family controllers per monoblock, all SKUs. Feasibility hinges on two architecture facts: (1) one PWM per Vienna phase (common-source pair), (2) interleaved lanes = phase-shifted copies of the same modulator.

| Resource | MCU-PFC (30/60/120) | MCU-LLC (30/60/120) |
|---|---|---|
| High-res PWM | 3/6/12 ch (lane-shifted 0°/180° or 0/90/180/270°) | 3/6/12 half-bridge pairs, common PFM clock |
| ADC | 3 phase V (shared) + 3/6/12 phase I + VBUS+, VBUS−, midpoint + 4 temps | Vout, Iout(shunt), V_bankA, V_bankB, 3/6/12 resonant I (protection-grade), temps |
| Comparators | per-lane OC + bus OVP → PWM kill | resonant OC per channel + output OVP → PWM kill |
| Comms | internal link (CRC+seq+timeout, §22) | same + **external isolated CAN 2.0B, 125 kbps, 29-bit** |
| Other | precharge/discharge drive, fan PWM+tach ×2–4 | S/P relay drives ×3 + state readback, ENABLE logic |

**Known pinch (risk R3):** 120 kW MCU-PFC needs 12 phase-current channels sampled per switching period plus 12 high-res PWM — at the edge of one LQFP100 device. Mitigations in order (§20): larger GD32G553 package → ADC interleave/mux at 90°-staggered sampling instants → only then a third MCU. The formal pin-by-pin matrix is a Phase 2 deliverable and gates the 120 kW schematic (Phase 13).

## I. Required calculation set (§48 — machine-readable, one file each)

Existing now: `calculations/design-basis.mjs` → `out/{input-currents,pfc-inductor,dclink,llc-window,semis-count,cost-model}.csv`.

To be produced (file → key outputs): `pfc/input-currents` (done, extend w/ semiconductor RMS split) · `pfc/inductor-design` (L, ΔB, Bpeak, N, gap, AC/DC copper, core loss vs fsw 40/50/70/100 kHz — selects fsw by total system cost) · `pfc/sic-loss` (temp-iterated conduction + Eon/Eoff tables at −20/25/100 °C/hot, converged Tj) · `dclink/sizing` (ripple current, ESR heat, lifetime, ±20% imbalance) · `dclink/precharge` (R, peak I, pulse energy vs 376/677/1354 J stored) · `llc/fha` (gain curves 5 bus × 5 load × 2 modes; Ln, Q, fr, ZVS boundary) · `llc/tank` (Lr, Cr, Lm values + tolerances) · `llc/transformer` (turns, Ae, ΔB, leakage target, RMS, losses, insulation/creepage per §14/§33) · `magnetics/skin-proximity` (δ = √(2ρ/ωμ), litz/foil selection) · `busbar/sizing` (per-path R, loss, ΔT, L for 55/110/220 A AC and 100–400 A DC paths) · `thermal/network` (junction→ambient stacks, fan curves vs impedance, derating curves) · `emi/ripple-cancellation` (interleave spectra 1/2/4 lanes) · `cost/model` (done as table; extend to 100/1000/5000 pc breaks + second-source) · `protection/thresholds` (every trip point + tolerance analysis).

## J. SPICE simulation matrix (§8/§9/§35/§36 — planned; **none executed, all currently NOT VERIFIED**)

Engine: ngspice. Vendor PSpice/LTspice models converted where possible; otherwise validated behavioral models with provenance blocks (manufacturer, MPN, datasheet rev, temp assumptions, limitations) per §8. Netlists in `/spice/**`, results to `simulation-results/<sku>/`.

| Level | Deck(s) | Sweeps / cases | Acceptance |
|---|---|---|---|
| L1 device | `double-pulse/dpt-{pfc750,llc1200,sec}.cir` per qualified family | Vbus {400,425,600,800,850}, I {10–90 A}, Rg_on/off grids, T {−20,25,100,Tj_hot}, ±parasitic L, dead-time | VDS ≤ 75% rating incl. ring; no false turn-on (VGS < Vth_min); Eon/Eoff tables exported |
| L2 leg | Vienna node, LLC half-bridge, rectifier leg | dv/dt, dead-time, snubber/RCD variants from L1 | clean commutation at corners; snubber values frozen |
| L3 phase | 1 PFC phase (switching + averaged); 1 LLC phase | line cycle at 6 input V; tank at 5 bus V × loads | THD contribution, ZVS held, stress ≤ limits |
| L4 30 kW stage | full switching at ~24 pruned corners; **averaged model over full §35 grid** (6 Vin × 8 Vout × 7 loads × 3 temp = 1008 runs, automated) | §35 grid + §37 Monte-Carlo (L±10%, Cr±5%, Lm±10%, Rds±10%, Vth, delays, dividers) | envelope met; loop margins ≥45° (AC-sweep, §38) |
| L5 60/120 kW | averaged multi-channel: startup, sharing, mode transitions, fault sequencing; detailed switching only for full-load steady state, load step, S/P transition, sharing transient, worst turn-off | §36 list: all 28 mandatory transients incl. short, backfeed, phase loss, relay weld, fan fail, DESAT, watchdog, CAN timeout | recorded maxima table (§36) within ratings |

Support decks: LISN + conducted-EMI tendency (pre-compliance estimate only, flagged per §26), gate-bias flyback (§18), aux converter (§28), precharge/discharge (§25), protection comparator chains (§24).

## K. TSCircuit repository tree

Created at `power-module-platform/` exactly per §7 (packages: common-components, power-primitives, gate-driver, sensing, magnetics, simulation-models, control-interface; boards 30/60/120 kw; spice models/double-pulse/pfc/llc/aux/protection/system; calculations pfc/llc/magnetics/busbar/thermal/emi/cost; simulation-results; docs). Parameterized components to implement (§7 list): `ViennaSwitchCell → ViennaPhase → ViennaThreePhaseStage` (lane-count parameter), `LlcHalfBridgeLeg → ThreePhaseLlc` (channel parameter), `ResonantTank`, `TransformerPhase`, `SecondaryRectifierBank` (JBS/SR variant flag), `SeriesParallelRelayMatrix`, `SiCGateDriver`, `PfcInductor`, `SplitDcLink`, sense/aux/CAN/MCU blocks. One definition per cell; 30/60/120 boards differ only in instantiation counts + busbar/board outline.

## L. Preliminary COGS budget (INR, ~1000 u/SKU) — `calculations/out/cost-model.csv`

| | 30 kW | 60 kW | 120 kW |
|---|---|---|---|
| **Proto pricing (LCSC/small-qty)** | 30,850 | 56,170 | 104,985 |
| **Direct-RFQ target pricing** | **24,080** | **43,519** | **80,855** |
| Red-line | 25,000 | 42,000 | 78,000 |
| Stretch | 22,000 | 36,000 | 68,000 |

Reading (honest): **30 kW clears red-line only on direct-manufacturer pricing** (semis drop ₹10.6k→₹7.2k; SiC is 30–35% of COGS and is the single biggest lever). **60/120 kW sit ~3.5% over red-line** at RFQ pricing. Identified closure levers, to be quantified per §43 (cost/η/thermal/area/reliability deltas each): (1) secondary architecture — series-connected section secondaries or 750 V-class bridge parts could cut the 96-diode 120 kW position ~₹2–3k; (2) relay rationalization at 120 kW; (3) heatsink/enclosure Indian localization (currently scaled conservatively ×3.6/×1.9); (4) 5000-pc semiconductor breaks; (5) JBS-vs-SR outcome. Stretch targets are **not** currently supported by this model — they require topology-level wins, not line-item shaving. Confidence ±25% until RFQs return (risk R4). No protection content is deleted in any scenario (§1/§53).

## M. Major engineering risks

| ID | Risk | Exposure | Retirement |
|---|---|---|---|
| R1 | **LLC gain hole 150–260 V bank** — PFM can't reach g=0.46; hybrid phase-shift/burst region must hold ripple, ZVS-loss heat and tank stress | Envelope non-compliance 150–260 V | Phase 6/7 FHA + switching sims; mode map deliverable |
| R2 | 120 kW single-PCB density: 400 A output, 36 electrolytics, 12 magnetics, busbar-PCB thermal coupling | Layout infeasible → repartition | Phase 14 floorplan with busbar calcs before any routing |
| R3 | 2-MCU ceiling at 120 kW (12 PWM + 12 I-sense on MCU-PFC) | 3rd MCU (+cost, +complexity) | Phase 2 formal pin/timer/ADC matrix |
| R4 | SiC direct pricing assumption (±25%) swings 30 kW across red-line | Commercial viability | Phase 2 RFQs to BASiC/SiChain/InventChip/CR Micro/StarPower |
| R5 | 1000 VDC relay qualification: break capability, weld detect, 400 A path | Safety + availability | Phase 7 relay stress sims + vendor qualification |
| R6 | ngspice compatibility of Chinese vendor SiC models (often encrypted PSpice) | Behavioral-model effort, fidelity limits | Phase 4: convert or build + document per §8 |
| R7 | Transformer insulation/PD at 1000 V-class secondary, altitude, repeated hipot | Redesign of section bobbin | Phase 6 insulation coordination doc (§14/§33) |
| R8 | EMI knowledge only pre-compliance until hardware LISN | EVT surprise | Margin: interleaving + designed filter (§26); flagged not claimed |
| R9 | GD32G553 HRTIM ecosystem maturity (docs/errata vs STM32G4) | Firmware schedule | Phase 2 bench eval alongside resource matrix |
| R10 | Vienna common-gate modulation near zero-crossings (current distortion) | THD ≤5% at light load | Phase 5 switching sims + zero-cross logic |

Full register to be maintained in `docs/verification-matrix.md` companion (§49-24).

## N. Blocking questions

**None.** Three assumptions a stakeholder could overturn cheaply *now* rather than after Phase 9: (1) the 330 VAC full-power floor (§B) — if a customer contract demands full power at 285 VAC, SiC/magnetics/EMI sizing changes ~16% and COGS rises ~₹1.5–2k/30 kW; (2) external CAN protocol is *ours* (reference-compatible in capability, not packet-cloned) unless interoperability with NIUERA/Tonhe/Maxwell/UUGreenPower masters is contractually required (§46); (3) stretch COGS targets are currently unsupported (§L) — accepting red-line as the Phase-17 gate avoids topology churn.

---

## Execution order from here (§51)

Phase 2 next: RFQ-ready semiconductor candidate table + GD32G553 resource matrix → Phase 3 PFC analytical design + inductor design (fsw selection by total cost) → Phase 4 DPT decks → … per §51 without skipping. Each phase lands as calculations + SPICE decks + docs in this repo; TSCircuit schematic work begins at Phase 10 only after the 30 kW electrical architecture freezes at Phase 9.
