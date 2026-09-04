# Assumptions & Frozen Decisions Register

Rev: Phase 9 freeze, 2026-09-04. Every entry: value + provenance + what invalidates it.
Statuses: **FROZEN** (change = formal ECO), **BASELINED** (best current, revisit trigger named), **ASSUMED** (needs external confirmation).

## Electrical architecture

| ID | Item | Value | Status | Provenance / invalidator |
|---|---|---|---|---|
| E1 | Full-power input floor | 330 VAC; linear derate to 86% @285 V (constant current) | FROZEN | `design-basis.mjs`; invalidated by a contract demanding full P @285 |
| E2 | DC bus window | 650–830 V operational, 800 nominal; **HW OVP 860 V** | FROZEN | DPT llc1200: 830 V→73% ✓, 880 V→77% ✗; OVP set to keep ring ≤75.4% |
| E3 | PFC switching frequency | **50 kHz** | FROZEN | `pfc-design.mjs` after DPT k_sw recalibration (17.4 nJ/VA); 70/100 kHz rejected on Tj>150 °C |
| E4 | PFC topology detail | Common-source pair, 1 PWM/phase; 1200 V JBS blocks full bus | FROZEN | Topology analysis; makes 2-MCU/120 kW feasible |
| E5 | Gate drive (PFC 750 V) | Rg_on 4.7 / Rg_off 4.7, +18/−4 V, loop ≤10 nH, RC 10 Ω+470 pF, **RCD clamp 100 nF+470 Ω to rail** | FROZEN | DPT `dpt-pfc750-final`: 70%/73% PASS |
| E6 | Gate drive (LLC 1200 V) | Rg_on 4.7 / Rg_off 2.2, +18/−4 V, loop ≤15 nH, RC 10 Ω+470 pF, no clamp | FROZEN | DPT `dpt-llc1200-final` 73% @830 V PASS |
| E7 | LLC tank (per phase) | **rev D2:** fr 140 kHz, Lr 7.0 µH (3 leak + 4.0 trim, leakage-compensating bins ±3%), Cr 185 nF (4×46 nF 1200 V PP ±5%), Lm 63 µH ±7% (gap-ground), Ln 9, Q_crit 0.28, capability 1.39; firmware stores per-unit bank_max from EOL gain-cal (fallback) | FROZEN | `llc-design.mjs` rev D — §37 MC yield drove requirement 1.36; ZVS re-verified in `llc-run.mjs` |
| E8 | Transformer section | 3× PQ50/50 stack PC95-class, Np=Ns=Ns2=7, ΔB 215 mT, 20.5 W, fill 93% | FROZEN | `llc-design.mjs`; invalidated if bobbin study fails 93% fill → PQ65 alt |
| E9 | S/P crossover | **rev B: 500 V up / 525 V down + 30 s FSM dwell** | FROZEN | rev-A 550 top was unreachable at full load (gain 1.325 — §37 MC exposed); 525 top needs 1.265, met at p1=1.29+ |
| E10 | Control modes | PFM 0.72–1.32 gain; phase-shift/duty below 260 V bank; burst light-load; bus_ref = clamp(2·bank/0.95, 650, 830) | FROZEN | Gain-hole analysis + `llc-run.mjs` PS case ZVS ✓ |
| E11 | Secondary rectification | **SiC JBS bridge all SKUs**; SR = premium variant | BASELINED | `loss-budget.mjs`: net ₹2.7k against SR @₹28/W cooling; flips >₹41/W — revisit at Phase 17 with heatsink quotes |
| E12 | S/P relay matrix | K_SER + K_PAR_A/B **with 10 Ω pre-insertion aux relays** + K_OUT isolation + discharge | FROZEN | `sp-transition.mjs`: hard parallel at 2 V = 205 A; pre-insertion mandatory |
| E12b | K_OUT closure gate rev B | stack must match target (vext if vehicle present, else vcmd) within max(10 V, 5%) before K_OUT closes | FROZEN | host_sim found post-transition banks at old-mode ceiling → OVP on blind close; fixed in fsm.c + model |
| E24 | Production supervisory firmware | portable C99 `firmware/core/{fsm,can_proto}` = normative logic; verified vs 26-scenario suite + codec + 100k fuzz under ASan/UBSan (`firmware/run_tests.sh`) | FROZEN | HAL binding = firmware phase on real MCU |
| E13 | Bank matching before parallel make | pre-insert until ΔV<0.5 V; weld detect 1.5 V/200 ms @≥10 A | FROZEN | same |
| E14 | Precharge / discharge | 33 Ω (20 A pk, 243 J, t95=160 ms) / 640 Ω active (2.0 s to <60 V, 424 J) | FROZEN | `pfc-phase-run.mjs` §25 runs |
| E15 | Control loops (PFC) | I-loop Kp 0.00439/Ki 11.7 → fc 2.98 kHz PM 50.2° GM 8.7 dB; V-loop Kp 0.206/Ki 9.05 fc 15 Hz | BASELINED | `pfc-control.mjs` analytical + ngspice cross-check 50.6° |
| E16 | Scaling | 60 kW = 2 lanes/2 ch; 120 kW = 4 lanes (0/90/180/270°)/4 ch; 2 MCUs | FROZEN | Phase 12 COGS check (bom-cost.md) |
| E17 | **Two-board sandwich** | AC-DC board (lower) + DC-DC board (upper), faces inward, bolted DCP/DCN/PE studs + 16-way harness | FROZEN | **Customer directive 2026-09-04, supersedes single-PCB §30**; docs/interconnect.md; cost impact ≈ +₹1.45k @30 kW recorded in bom-cost.md |
| E14b | Precharge rev B | 2× 33 Ω in L1+L2 with 2-pole bypass (3-wire correctness: every line-line loop sees ≥1 R); Ipk ≈ 10 A, t95 ≈ 230 ms | FROZEN | 3-wire loop analysis; supersedes single-R E14 sim point (bounds hold) |
| E18 | Phase/resonant current sensing | CTs (line 1:2500 + burden; resonant 1:100) replace shunt+iso-amp | FROZEN | §19 comparison: −₹240 net, inherent isolation, faster OC path; output current stays manganin shunt + NSI1200 |
| E19 | Discharge drive logic | ULN sink + V15 pull-up (inverted): discharge engages on command OR control collapse with aux alive | FROZEN | fail-safe analysis in interconnect.md |
| E20 | Aux primary feed | DCP→MID (425 V max) → 650 V flyback FET; mid-load ≪ balancer authority | FROZEN | avoids 1500 V-class aux FET; balancing margin checked in `pfc-phase-run` imbalance case |
| E22 | 3rd DM filter stage | 3× 22 µH sendust line chokes after CM2 (family-wide) | FROZEN | LISN pre-compliance: 30 kW 3rd harmonic at 150 kHz was −24.8 dB; stage adds ~33 dB there |
| E23 | Production gate-bias | custom multi-output bias transformer + push-pull driver per board; per-channel QA01C = prototype only | FROZEN | §18 mandate; −₹0.9k @30 kW in BOM; validated cell = D5 winding sheet TBD at proto |
| E21 | **Config HMI** | 2 buttons + 2-digit 7-seg on DC-DC board, 74HC595 + 2 NPN mux, 7 GPIO on MCU-LLC | FROZEN | Customer directive 2026-09-04; spec in interconnect.md |

## Component / model assumptions (ASSUMED — confirm at RFQ/sample)

| ID | Item | Value | Confirm by |
|---|---|---|---|
| A1 | SiC behavioral models | VDMOS fits to headline data; Eon/Eoff ±40% band | Vendor models under NDA + bench DPT at EVT |
| A2 | Rds(T) tempco | ×(1+0.004·(T−25)) | Vendor curves |
| A3 | Sendust roll-off/loss fits | anchors 60µ: 80%@30 Oe; 26µ: 80%@75 Oe; loss 52.4·B^2.12·f^1.46 | Core vendor datasheet + sample L(I) measurement |
| A4 | PC95-class loss fit | 3.2e-8·f_kHz^1.71·B_mT^2.9 (396 mW/cm³ @100k/200 mT) | Ferrite vendor curve |
| A5 | Relay make rating | 300 A/10 ms class (HFE82) | Hongfa datasheet + qualification |
| A6 | MCU resources | HRTIM 12 ch, 4 ADC ~4 MSPS, 8 COMP, 2 CAN; pin map on G474 conventions | GD32G553 datasheet check (R9); CAN pin conflict flagged in `mcu-pinmap.csv` |
| A7 | Prices | component-selection.md col "Direct price (A)"; ±25% | RFQ round 1 |
| A8 | Fan curve | 110 Pa @ 160 m³/h class per 120×38 fan | Vendor static-pressure curve |
| A9 | Grid impedance for sims | 30 µH + 20 mΩ per phase | Site-dependent; sensitivity benign |

## Simulation fidelity decisions (per §9, documented)

- L1 DPT: behavioral VDMOS device edge — closed. L3/L4 line-cycle: **averaged-switch model** (cycle-by-cycle 3-φ PWM numerically infeasible in ngspice-46 after 7 documented attempts — see `spice/pfc/pfc-phase-run.mjs` header; THD-40 unaffected, switching ripple handled analytically).
- LLC: switching-level 3-φ validated by bank-source op-point method; near-resonance point-power matching is FHA-limited (±50% at fn≈1) — acceptance = mode correctness + ZVS + stress + capability margin, not point power. Closed-loop regulates power.
- EMI: SPICE LISN = pre-compliance tendency only (§26). Never claimed as compliance.
