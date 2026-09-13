<img src="assets/banner-verification.svg" alt="" width="100%"/>

# 🔬 EVT Test Plan

<sub>The first-hardware campaign T-00…T-32, and the rule that lets bench results reopen a calculation</sub>

<p>
  <img src="https://img.shields.io/badge/status-LIVE__SPEC-2ea44f?style=flat-square" alt="status: live specification"/>
  <img src="https://img.shields.io/badge/rev-E61-f2b705?style=flat-square" alt="revision E61"/>
  <img src="https://img.shields.io/badge/updated-2026--09--13-8b949e?style=flat-square" alt="updated 2026-09-13"/>
</p>

> [!NOTE]
> **Purpose** — the first-hardware campaign for the board pairs: what each test does, how it is run, what passes,
> and which results gate the BOM freeze. End-of-line production tests derive from subsets of it.

> [!IMPORTANT]
> **The reopen rule.** Every test logs to the [verification matrix](verification-matrix.md). A simulation-vs-bench
> delta **above 20 % reopens the owning calculation or simulation** — the model is recalibrated before anything
> downstream of it is trusted.

## At a glance

<table>
<tr><td valign="top" width="52%">

| Domain | Tests |
|---|---|
| Device and protection | T-01 · T-06 · T-16 · T-17 · T-20 · T-26 · **T-30** |
| Bring-up and power quality | T-00 · T-02 · T-03 · T-10 · T-19 |
| Pulse parts and discharge | T-05 · T-21 · T-22 · T-27 · T-28 |
| Aux supply | T-09 · T-11 · T-12 · T-18 · T-29 |
| Thermal and environment | T-04 · T-15 · T-23 · **T-32** · **T-33** |
| EMI and insulation | T-08 · T-13 · T-14 |
| Relays and series / parallel | T-07 · T-24 |
| Magnetics and tank | T-25 · **T-31** |

</td><td valign="top" width="48%">

```mermaid
pie showData title 34 tests by domain
  "device and protection" : 7
  "bring-up and quality" : 5
  "pulse parts and discharge" : 5
  "aux supply" : 5
  "thermal and environment" : 5
  "EMI and insulation" : 3
  "relays and S/P" : 2
  "magnetics and tank" : 2
```

</td></tr>
</table>

**Preconditions:** boards assembled minus SiC for T-00 bare bring-up · lab aux input (§28) · HV supply + 3-φ
variac / source · programmable load · LISN · thermal chamber.

```mermaid
flowchart LR
  A["T-00<br/>bare bring-up"] --> B["T-01<br/>bench DPT<br/>(closes A1 / R5)"]
  B --> C["T-02 / T-03<br/>PFC + DC quality"]
  C --> D["T-04 / T-23 / T-32<br/>thermal + cold chamber"]
  C --> E["T-05 / T-21 / T-22<br/>pulse parts"]
  C --> F["T-06 / T-16 / T-17 / T-20 / T-26<br/>protection injection"]
  F --> SC["T-30<br/>short-circuit timing<br/>both polarities"]
  F --> G["T-07 / T-24 / T-25<br/>S/P transitions + corners"]
  D --> H["T-08<br/>EMI pre-scan"]
  E --> I["T-09 / T-11–T-13 / T-18 / T-19 / T-27–T-29<br/>aux · discharge · PV drive"]
  G --> J["T-10 / T-14 / T-15<br/>soak · hipot · thermography"]
  M["T-31<br/>magnetics first articles<br/>Rac @ 140 kHz"] --> K
  VB["T-33<br/>D1 as-mounted<br/>vibration + bond"] --> K
  H --> K(["BOM freeze gates<br/>loaded PV Vgs · both-polarity trip<br/>D4 clamp · magnetics first articles"])
  I --> K
  J --> K
  SC --> K
  style K stroke:#2ea44f,stroke-width:2.5px
  style SC stroke:#bc4e9c,stroke-width:2px
```

## 1. Core campaign (T-00…T-10)

| ID | Test | Method / acceptance |
|---|---|---|
| T-00 | Bare bring-up | Aux rails from lab supply: V24/V15/V3P3 ±5%; MCU boot, link CRC soak 1 h 0 errors (→ **link retired at E40** — one brain; soak the external CAN instead); HMI digits/buttons; all relays click-test via CAN service mode; gate pulses into dummy loads (PWM-disabled isolation check §45) |
| T-01 | Bench DPT | Fixture on AC-DC + DC-DC positions; compare Vds_pk/dv/dt/Eon/Eoff vs `dpt-*-metrics.csv`; recalibrate models (closes A1/R6); freeze final Rg from bench |
| T-02 | PFC quality | 30 kW pair @330/400/475 V: PF, THD-40 vs sim (≤5% spec; sim said ≤1.05%); midpoint dev <10 V; phase-loss foldback (F.09) |
| T-03 | DC output quality | Envelope sweep vs `llc-opmap.csv`: accuracy after cal (±0.5%/±1%), ripple ≤±0.5%, CV↔CC transitions, burst ripple at 5% load |
| T-04 | Thermal | Chamber 25→55→75 °C at full/derated power: Tj estimators vs thermocouples, choke/xfmr hotspots vs D1/D3 limits, fan curves; validates Rth 0.032 assumption + derating curve (→ **E60 thermal report: upper face ≤ 0.045 K/W, lower ≤ 0.098 K/W at the 30 kW 330 VAC corner**) |
| T-05 | Pulse parts | Precharge ×20 cold-hot cycles (R temp <180 °C), discharge ×10 from 830 V (t<60 V ≤2.2 s, resistor survival), pre-insertion ×50 at ΔV 20 V |
| T-06 | Protection injection | Each row of protection-thresholds.md: forced trip, measured threshold/latency vs table; DESAT via drain short-pulse jig; OVP via bus pump; watchdog kill line |
| T-07 | S/P transition | 100 cycles LV↔HV under FSM at 0 A: contact currents (Rogowski) < 30 A; weld-detect provoked with forced stuck relay (jig) |
| T-08 | EMI pre-scan | LISN conducted 150 k–30 M, CISPR-32-class limits informal; compare interleave on/off (**50 kW — E60 restated from the retired 60 kW board**); gap analysis feeds filter rev |
| T-09 | Aux robustness | Brown-out/black-out of bus 650→300 V: UVLO chain holds gates low (F.26), no spurious pulses (scope on 6 gates); harness-pull test (R11): safe stop. **E65 D4 rev E fault matrix at 830 and 860 V:** (a) V24 hard short on the harness side of RAUX24, (c) V15 short, (d) FB open (lift QAUXFB) — QAUX Id peak ≤ 8 A (current probe), D4 search-coil B̂ ≤ 310 mT, Vds ≤ 1360 V and DCLA Vr ≤ 1360 V (HV differential probe), NCP1252D latches within 10–20 ms, no component damage; (b) V24 short AT CAUX24 (no RAUX24 in the loop — the residual component-failure case) at 830 V only, record Id / B̂ / latch time, sacrificial unit; record whether VCC decays to 9 V while latched (latched ICC vs the 0.43–0.90 mA start-up feed) — restart after AC cycling only is the accepted fail-safe. Clamp: Vc ≤ 460 V at the limit current (FB-open) with the first-article leakage |
| T-10 | Soak + CAN | 48 h at 80% power cycling 25/100%; CAN 1 Hz telemetry integrity, HMI address persistence, fault-snapshot readout; energy counter vs meter ±2% |

### From EVT to end-of-line

EOL (production, §45) derives from T-00/T-03/T-06 subsets: 100% = aux, isolation (PWM-off), hipot
(AC-DC: 2.5 kV pri-PE 1 min; DC-DC: 3.5 kV pri-sec via transformer already covered at part level (→ **4.0 kV DC 100 % per the RFQ pack**) +
1.5 kV out-PE), cal (V/I two-point), limited-power functional (5 kW into load), relay/fan/HMI check.
Sampling = thermal spot (1/50), full envelope sweep (1/200), PD on transformer lot sample (5/lot).


---

## 2. Review-mandated tests

### Rev C additions (T-11…T-18)

| ID | Test | Pass criterion |
|---|---|---|
| T-11 | Cold-start matrix 285–475 VAC × bus charged/discharged | boots everywhere incl. cold-start ≤13 s at 285 VAC, ≤8.5 s at 400 VAC (E65: VCC(on) 14.9 V max, CVCC +20 %, ICC1 max through the 940 k feed — the R6-G "≈8 s" was typical-only); aux BO (NCP1252D, E65 divider 2×1.2M/7.5k) brown-in 327–363 V, brown-out 306–336 V — the IBO hysteresis source adds 24 V to the 321 V brown-out (the pre-E65 "310–335 V brown-in" row could not pass: the 2.4M set started at 348–390 V) |
| T-12 | Programming-session thermal watch (SWD attached, bus at 830 V, MCU held in reset 10 min) | discharge chain stays OFF (E19 rev B); no component > 60 °C rise |
| T-13 | Filter-cap soak 475 VAC 48 h | CX ΔT ≤ 10 K, no capacitance loss > 5 % |
| T-14 | Hipot + touch-leakage **with all sense chains fitted** | 4 kV pri↔sec < 5 mA (Y-caps dominated), leakage < 3.5 mA |
| T-15 | KPRE thermography at rated line current 1 h | contact rise ≤ 30 K; mirror readback consistent |
| T-16 | Gate-enable glitch capture, 1000 power cycles | zero gate pulses while GATE_EN_x low (scope-latched) |
| T-17 | CT front-end linearity ±150 A line / ±100 A resonant + OC steps | ≤ 1 % to 120 A; F.02 **and F.11** trip points ±5 % — **E60 classes: F.01 120/155/195 A pk on 22/18/13 Ω, F.11 85/115/145 A pk on 1.2/0.91/0.75 Ω** (the R2 2.0 Ω burden set the 70/95 A class, below the simulated peaks); linear through F.xx + the 3 µs race; no ADC injection (AVMID bias, CB-15); AVMID spectrum clean (MR-11 buffer) |
| T-18 | Aux load-dump **at the per-SKU load table (R2 §J)**: all relays pull-in + fans 100 % at 65 °C ambient | V24 ≥ 22.8 V, V15 ≥ 13.5 V; aux switch ≤ 110 °C; D24 PIV scope ≤ 300 V at 850 V bus (CB-19) |

### Rev D additions — R2 re-audit closure (T-19…T-29)

| ID | Test | Pass criterion |
|---|---|---|
| T-19 | 3.3 V rails both boards, 55 °C, full driver load | 3.30 ± 0.15 V; buck Tj-est < 105 °C (CB-17/18) |
| T-20 | FLT injection (driver DESAT jig on one LLC channel) | F.12 latch on the card ≤ 10 ms; no flux-walk on adjacent sections (CB-21) |
| T-21 | Bank discharge: shutdown from series 1000 V and parallel 500 V | both banks < 60 V within 2× τ table; F.21/F.21b timing per SKU (HR-15/HR-14); resistor ΔT per pulse spec |
| T-22 | Precharge/discharge timing per SKU (extends T-05) | **E60 per-SKU deck:** t95 within ±25 % of **193 / 231 / 310 ms** (30/40/50 kW); discharge ≤ 3/4/5 s (deck 2.0/2.4/3.2 s); pulse parts < 180 °C at the 50 W parts on the 50 kW modules |
| T-23 | CM choke thermography at rated line current per SKU (extends T-04) | ΔT ≤ 45 K (D7 windings, HR-18) |
| T-24 | Dual-relay pair current share (Rogowski both paths) — **E60: on the 50 kW dual K_OUT at 167 A** (the 120 kW single-board row is retired) | worst split ≤ 60/40 at rated current, or pair re-binned (HR-19) |
| T-25 | Tolerance-corner gain capability (deliberate worst-bin trim + low-Lm transformer build) | bank_max ≥ 525 V at full load (CB-22 / §37 yield fix validated in hardware) |
| T-26 | PFC fast-trip timing, BOTH current polarities (E47/E48) | measured threshold-crossing → gate-off ≤ the registered budget on every phase; CT polarity ↔ comparator-trip polarity confirmed per phase; DESAT covers the forward direction, CMP the reverse |
| T-27 | Discharge hold-up waveform (E47/E49) | active phase reaches ≤~330 V before aux brown-out; passive continuation matches the per-SKU 370/222/296 s model ±tolerances; label wait verified with residual-V measurement |
| T-28 | PV bleeder loaded drive (R8) | loaded V_GS, drain current and FET temperature with the exact orderable QDIS part across the declared ≤70 °C bleed ambient; discharge time per bank model |
| T-29 | Aux cold-start waveform (R6-G) — **also at −30 °C after cold soak (A11 rev C)** | first switching ≤11 s from AC apply at 320–480 VLL (E65 worst-case 10.7 s at 320 VLL); VCC never crosses VCC(off) during soft-start + takeover; V15 floor during commanded bleed recorded (feeds T-28) |

## 3. Coordination, copper and environment on real hardware (E60 · T-30…T-32)

| Test | Procedure | Pass criterion |
|---|---|---|
| T-30 | **DESAT / short-circuit timing with the E60 blanks (22 pF LLC, 47 pF Vienna)** — SC type I (turn-on into short) and type II (fault under load) at 830 V (LLC) / 415 V half-bus (Vienna), Tj 25 °C and hot, both current polarities; Rogowski + Vds/Vgs capture | measured fault-to-gate-off ≤ **75 % of the vendor tSC** (and ≤ 1.5 µs LLC / ≤ 3.15 µs Vienna); no false DESAT over 10⁴ normal turn-ons at the hot corner; F.11/F.01 comparator trips land within ±5 % of 85/115/145 · 120/155/195 A pk |
| T-31 | **First-article AC resistance + class-current thermal** — every D2/D3 winding at 140 kHz (impedance analyser; D3 shorted-secondary method), then ΔT at the class current (46.4 / 61.9 / 77.3 A rms) | Rac within **+15 %** of the conductor-audit row (D3 Rac/Rdc ≤ 1.35 per winding; D2 ≤ 4.0 / 2.6 / 2.0 mΩ); ΔT ≤ 40 K (D2) / hotspot ≤ +55 K (D3). **D3 adds an open-secondary 140 kHz check and an S1 thermocouple at PAR-525** (gap fringing is invisible to shorted-secondary Rac); S1 within +10 K of the S2 reading. A miss is a construction error: re-check strand size, foil gauge, lay-up, gap split |
| T-32 | **Cold soak −30 °C, 4 h, then start and ramp (A11 rev C competitor parity)** — per SKU in the chamber, 330 and 475 VAC | aux starts per T-29; precharge inside the EOL window ×1.3; FW-R3 soft limit engages and releases; no F.xx trip; e-cap ESR/ripple, fan start and magnetics self-warming logged |

## 4. Bonded PFC chokes on real hardware (E65 · T-33)

| Test | Procedure | Pass criterion |
|---|---|---|
| T-33 | **D1 as-mounted resonance search and endurance (IEC 60068-2-6)** — one module per SKU with the E65 D1 mount (gap pad, GF-PPS clamp cap, bore sleeve, M6 at 4.5 N·m on a Belleville, 2-point banding, strain-relieved leads): pre-test L₀, 4-wire Rdc and bonded-face thermal (the `stress-audit` [D1-BUILD] type-test current); 0.5 g sine search 10–500 Hz, 1 oct/min, 3 axes, accelerometers on the clamp cap and the stack top; 2 g sweep; 10 min dwell at each resonance with transmissibility > 2; final 0.5 g search. Then the D1 rows of T-04 at 330 VAC / 55 °C inlet with a thermocouple at the inner bore | no mode shift > 10 % between searches (nothing loosened); no pad walk, fretting or cap cracking; lead joints intact (cross-section one joint per SKU); L₀ and Rdc inside ±5 % of the pre-test values; residual bolt torque ≥ 80 %; bonded thermal rise within the pre-test value + 3 K; T-04 bore hot-spot ≤ the `stress-audit` D1 value + 10 K |

---

<div align="center">
<sub><a href="verification-matrix.md">← Verification Matrix & Risk Register</a> &nbsp;·&nbsp; <a href="README.md">🧭 Documentation hub</a> &nbsp;·&nbsp; <a href="final-validation-e51.md">End-to-End Validation Verdict →</a></sub>

<sub>Vectivolt DC-Modules · documentation rev E61 · every number reproduces with <code>sh calculations/run-all.sh</code></sub>
</div>
