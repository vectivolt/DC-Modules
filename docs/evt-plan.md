# EVT Test Plan (§49-25) — first-article board pairs, rev A

Preconditions: boards assembled minus SiC (T-00 bare bring-up), lab aux input (§28), HV supply +
3-φ variac/source, chroma load, LISN, thermal chamber. Every test logs to the verification matrix;
sim-vs-bench deltas >20% reopen the owning calc/sim.

| ID | Test | Method / acceptance |
|---|---|---|
| T-00 | Bare bring-up | Aux rails from lab supply: V24/V15/V3P3 ±5%; MCU boot, link CRC soak 1 h 0 errors; HMI digits/buttons; all relays click-test via CAN service mode; gate pulses into dummy loads (PWM-disabled isolation check §45) |
| T-01 | Bench DPT | Fixture on AC-DC + DC-DC positions; compare Vds_pk/dv/dt/Eon/Eoff vs `dpt-*-metrics.csv`; recalibrate models (closes A1/R6); freeze final Rg from bench |
| T-02 | PFC quality | 30 kW pair @330/400/475 V: PF, THD-40 vs sim (≤5% spec; sim said ≤1.05%); midpoint dev <10 V; phase-loss foldback (F.09) |
| T-03 | DC output quality | Envelope sweep vs `llc-opmap.csv`: accuracy after cal (±0.5%/±1%), ripple ≤±0.5%, CV↔CC transitions, burst ripple at 5% load |
| T-04 | Thermal | Chamber 25→55→75 °C at full/derated power: Tj estimators vs thermocouples, choke/xfmr hotspots vs D1/D3 limits, fan curves; validates Rth 0.032 assumption + derating curve |
| T-05 | Pulse parts | Precharge ×20 cold-hot cycles (R temp <180 °C), discharge ×10 from 830 V (t<60 V ≤2.2 s, resistor survival), pre-insertion ×50 at ΔV 20 V |
| T-06 | Protection injection | Each row of protection-thresholds.md: forced trip, measured threshold/latency vs table; DESAT via drain short-pulse jig; OVP via bus pump; watchdog kill line |
| T-07 | S/P transition | 100 cycles LV↔HV under FSM at 0 A: contact currents (Rogowski) < 30 A; weld-detect provoked with forced stuck relay (jig) |
| T-08 | EMI pre-scan | LISN conducted 150 k–30 M, CISPR-32-class limits informal; compare interleave on/off (60 kW); gap analysis feeds filter rev |
| T-09 | Aux robustness | Brown-out/black-out of bus 650→300 V: UVLO chain holds gates low (F.26), no spurious pulses (scope on 6 gates); harness-pull test (R11): safe stop |
| T-10 | Soak + CAN | 48 h at 80% power cycling 25/100%; CAN 1 Hz telemetry integrity, HMI address persistence, fault-snapshot readout; energy counter vs meter ±2% |

EOL (production, §45) derives from T-00/T-03/T-06 subsets: 100% = aux, isolation (PWM-off), hipot
(AC-DC: 2.5 kV pri-PE 1 min; DC-DC: 3.5 kV pri-sec via transformer already covered at part level +
1.5 kV out-PE), cal (V/I two-point), limited-power functional (5 kW into load), relay/fan/HMI check.
Sampling = thermal spot (1/50), full envelope sweep (1/200), PD on transformer lot sample (5/lot).


---

## Rev C additions — review-mandated tests (T-11…T-18)

| ID | Test | Pass criterion |
|---|---|---|
| T-11 | Cold-start matrix 285–475 VAC × bus charged/discharged | boots everywhere; aux BR brown-in 320–340 V |
| T-12 | Programming-session thermal watch (SWD attached, bus at 830 V, MCU held in reset 10 min) | discharge chain stays OFF (E19 rev B); no component > 60 °C rise |
| T-13 | Filter-cap soak 475 VAC 48 h | CX ΔT ≤ 10 K, no capacitance loss > 5 % |
| T-14 | Hipot + touch-leakage **with all sense chains fitted** | 4 kV pri↔sec < 5 mA (Y-caps dominated), leakage < 3.5 mA |
| T-15 | KPRE thermography at rated line current 1 h | contact rise ≤ 30 K; mirror readback consistent |
| T-16 | Gate-enable glitch capture, 1000 power cycles | zero gate pulses while GATE_EN_x low (scope-latched) |
| T-17 | CT front-end linearity ±150 A + OC step | ≤ 1 % to 120 A; F.02 trip point ±5 %; no ADC injection (AVMID bias, CB-15) |
| T-18 | Aux load-dump: all relays pull-in + fans 100 % at 65 °C ambient | V24 ≥ 22.8 V, V15 ≥ 13.5 V; aux switch ≤ 110 °C |
