# Component Selection & Sourcing — Phase 2

Status: CANDIDATE TABLE FOR RFQ. Electrical stress values trace to `calculations/`. **All prices are RFQ *assumptions* (INR, ~6k–24k pcs/yr aggregate across SKUs), marked (A). MOQ/lead-time are typical-industry assumptions (A) until quotes return.** No part is "qualified" until DPT simulation (Phase 4) + sample validation. LCSC is prototype-source only (§42).

## 1. Power semiconductors

| Pos | MPN (primary) | Mfr | Rating | Package | Worst stress (calc) | Proto src | Direct price (A) | MOQ (A) | Lead (A) | Second source (to qualify) |
|---|---|---|---|---|---|---|---|---|---|---|
| PFC switch pair | B3M010C075Z | BASiC | 750 V, 10 mΩ typ 25 °C | TO-247-4 Kelvin | 425 V + ring (DPT bound ≤560 V); 39 A RMS worst pair | LCSC | ₹330 | 1k | 8–12 wk | SiChain SG*075* 750 V/10 mΩ; InventChip IV*R075*; CR Micro; StarPower (RFQ all 5) |
| PFC boost diode | SiChain 1200 V/40 A JBS (exact p/n via RFQ) | SiChain | 1200 V, 40 A class | TO-247-2 | **850 V full bus** + ring; 27.5 A avg pk-phase | LCSC equiv | ₹120 | 1k | 8 wk | BASiC B3D040120*, CR Micro |
| LLC primary | SG2M023120LJ | SiChain | 1200 V, 23 mΩ | TO-247-4L | 850 V + overshoot; ~15 A RMS/leg | LCSC | ₹390 | 1k | 8–12 wk | BASiC B3M020120ZL (20 mΩ); InventChip 1200 V 18–35 mΩ |
| Secondary rect (baseline) | SiC JBS 1200 V/20 A bridge legs | SiChain/BASiC | 1200 V | TO-247-2 / TO-220-2 | 531 V bank + ring; 8.3 A avg/diode (30 kW parallel mode) | LCSC | ₹90 | 2k | 8 wk | CR Micro; 750 V-class option per Phase 7 |
| Secondary SR (alt) | 1200 V 20–30 mΩ SiC FET | SiChain/BASiC | 1200 V | TO-247-4 | same | LCSC | ₹390 | 1k | 8–12 wk | 900 V low-Rds any credible source |

Rule applied: no device >75% repetitive blocking incl. simulated ring (§4); DPT (Phase 4) enforces.

## 2. Drive, isolation, control

| Function | MPN | Mfr | Key spec | Qty 30/60/120 | Proto | Price (A) | Second source |
|---|---|---|---|---|---|---|---|
| Iso gate driver | NSI6611 | NOVOSENSE | ~10 A, UVLO, Miller clamp, DESAT, soft-off | 9/18/36 | LCSC | ₹85 | NSI6602 variants; 2ED020I12 (non-Chinese fallback) |
| Iso amp (HV sense) | NSI1200 | NOVOSENSE | ±50 mV shunt class | 4/6/10 | LCSC | ₹70 | NSI1300 family |
| Iso ADC/amp (output V) | NSI1311 class | NOVOSENSE | iso ΣΔ | 2 | LCSC | ₹95 | TI AMC1311 fallback |
| Iso CAN | NSI1042 | NOVOSENSE | CAN 2.0B/FD capable | 1 | LCSC | ₹60 | NSI1050 |
| MCU | GD32G553RET6-class | GigaDevice | M33 216 MHz, HRTIMER, 4 ADC | 2 | LCSC | ₹210 | GD32G563 larger pkg (R3 mitigation) |
| Digital iso (relay/fault) | NSI8241 class | NOVOSENSE | 4-ch | 3/4/6 | LCSC | ₹45 | — |

## 3. Passives / electromechanical (power-critical)

| Function | Candidate | Spec | Qty 30/60/120 | Price (A) |
|---|---|---|---|---|
| DC-link electrolytic | 470 µF/450 V snap-in 105 °C (Aishi/ChengX RFQ; Nichicon proto) | ≥2.4 A ripple @10 kHz, 5k h | 10/18/36 | ₹150 |
| Commutation film | 1 µF/900 V PP (Faratronic C3D) | dv/dt class | 6/12/24 | ₹55 |
| Resonant cap | Faratronic PP 1200–1600 V pulse | Irms ≥ 12 A each | 6/12/24 | ₹70 |
| X2/Y2 EMI caps | Faratronic/Songtian | X2 310 VAC, Y2 300 VAC | per EMI calc | — |
| MOV | Songtian/TDK 3-leg network | per §27 calc | 4/4/4 | ₹25 |
| S/P + isolation relays | Hongfa HFE82V-class 1000 VDC | 100/200 A contact sets | 3+2 per unit | ₹420 (100 A) / ₹780 (200 A) |
| PFC inductor core | Kool Mµ-class sendust toroid 60µ (POCO/DMEGC equiv of Magnetics 77439A7) | Ae≈1.99 cm², le≈10.7 cm (catalog, re-verify) | 3/6/12 | ₹95 core |
| LLC transformer core | PQ50/50 PC95/DMR95-class ferrite | Ae≈3.28 cm² (catalog, re-verify) | 3/6/12 sets | ₹140 set |
| Output shunt | Manganin 50 mV class + NSI1200 | 100/200/400 A | 1 (banked) | ₹90–260 |
| Fans | Sanyo-equiv Chinese 120×38 PWM+tach (Sunon/AVC RFQ) | static-pressure selected (Phase 8/29) | 2/2/4 | ₹280 |

## 4. Sourcing policy (per §42)

- RFQ round 1 (all five SiC vendors + NOVOSENSE + GigaDevice + Hongfa + Faratronic + core vendors) issues after Phase 4 freezes Rg/bias per vendor — quotes are only comparable with the drive spec fixed.
- Every power semiconductor position carries **two qualified vendors** before Phase 17 sign-off; qualification = DPT sim with that vendor's model/parameters + sample DPT bench test at EVT (out of scope here, in EVT plan).
- Lifecycle: all candidates are active/volume parts per vendor sites as of 2026-09 (to re-verify at RFQ).
- LCSC-only parts (no direct line) are disqualified for production BOM.

Cost roll-up lives in `calculations/out/cost-model.csv` and `docs/bom-cost.md` (Phase 17).

## 5. Rev-B deltas (E17–E21, 2026-09-04)

| Function | Part | Qty 30/60/120 | Price (A) | Note |
|---|---|---|---|---|
| Line CT | ZEMCT-class 60 A 1:2500 | 3/6/12 | ₹65 | replaces shunt+NSI1200 phase sensing (E18) |
| Resonant CT | custom 1:100 toroid | 3/6/12 | ₹55 | per section |
| Gate-bias module (proto) | MORNSUN QA01C class | 9/18/36 | ₹95 | production: custom multi-output transformer (§18) — lever L1 |
| Iso 5 V modules | MORNSUN B1505S | 2 | ₹45 | CAN + output-shunt side |
| Relay coil driver | ULN2803A | 2 | ₹9 | one per board |
| Precharge bypass | Hongfa HF115F-2Z 2-pole | 1 | ₹95 | with 2× 33 Ω 25 W ceramic (E14b) |
| Pre-insertion relays | HFE9-class 10 A 1 kV | 2 | ₹190 | E12 |
| Aux flyback FET | 650 V 4 A SJ | 1 | ₹28 | fed DCP→MID (E20) |
| Discharge FET | 1200 V 5 A SiC | 1 | ₹120 | E19 logic |
| HMI display | 2-digit 0.56" CC 7-seg | 1 | ₹18 | E21 |
| HMI buttons | 6×6 tactile | 2 | ₹3 | E21 |
| HMI driver | 74HC595 + 2× S8050 | 1+2 | ₹5 | E21 |
| B2B harness | JST PHD 2.0 16-way + leads | 1 set | ₹22+ | E17 |
| Bus studs | M8 pillar sets ×3 | 1 set | ₹84 | E17, torque 12 N·m |

Full quantities/pricing authority: `calculations/out/bom-*.csv` (generated; §49-21/22).


---

## Rev C parts deltas (2026-09-05, production-review closure)

| Change | Was | Now | Driver |
|---|---|---|---|
| X caps | X2 2.2 µF **310 VAC** | **X1 2.2 µF 530 VAC** | CB-1: 475 VAC line-line continuous |
| Y caps (incl. output, PE bond) | Y2 300 VAC | **Y1 440 VAC** | MR-4 |
| Bank electrolytics | 1× 450 V across ≤525 V | **2-series 450 V strings + balance** | CB-2/E29 |
| Bus/bank film | 900 V | **1100 V** (830 V = 76 %) | HR-1 |
| Output film | 1100 V | **1200 V** (1000 V = 83 %) | HR-8 |
| Vienna phase films | — (missing) | **2× 1 µF 600 V per phase** | CB-9 |
| Precharge bypass | HF115F-2Z 8 A 2-pole | **2× HF167F-class power relay w/ mirror (80/120/250 A per SKU)** | CB-8/E30 |
| S/P + pre-insertion relays | plain | **mirror-contact variants (-M)** | E30/HR-4 |
| Aux switch | 650 V SJ (half-bus) | **1700 V SiC** (full-bus feed) | CB-6/E26 |
| Aux transformer | EF20 19 W | **ETD29 60 W (D4 rev B)** | CB-7 |
| Aux controller wiring | FB→15 V rail only | **full application circuit** | CB-5 |
| HV senses | resistive dividers → AGND | **AMC1311/1350-class iso amps + iso 5 V bias per domain** | CB-3/E25 |
| Watchdog + AND | — | **TPS3430-class + 74HC11 per board** | CB-10/E27 |
| Discharge drive | ULN + V15 pullup (fail-engaged) | **opto driver + DCN bias module, default-OFF** | CB-11 |
| Gate driver CLAMP | floating | **wired to gate** | CB-12 |
| SWD/BOOT | — | **1×5 header + BOOT0 strap + NRST cap per MCU** | CB-13 |
| LLC node snubbers | 10 Ω 1 W + 470 pF | **deleted** | E28 |
| Vienna snubber | 470 pF + 1 W R | **100 pF + 2 W R** | E28 |
| Clamp bleeder | 470 Ω 1 W 2512 | **470 Ω 5 W axial** | HR-3 |
| Pre-insertion R | 10 W ceramic on 2512 | **SQP 25 W pulse axial** | HR-12/MR-1 |
| Precharge/discharge R | 25 W p/n on 2512 | **axial footprints** | MR-1 |
| DM chokes | ₹38 unsized | **D6 drawing, per-SKU rated** | HR-9 |
| HV divider resistors | plain 1206 | **anti-surge (HV73-class)** | MR-3 |
| Bias modules | custom E23 set (BOM) vs modules (schematic) | **modules (QA01C-class) both; E23 → ECO-1** | HR-10 |
| L-PE surge | — | **3× MOV 550 VAC + GDT 3.5 kV** | HR-7 |
| ULN spare inputs | floating | **grounded** | MR-8 |
