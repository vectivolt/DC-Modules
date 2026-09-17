<img src="assets/banner-platform.svg" alt="" width="100%"/>

# 🩺 E80 External Recheck — Response Register

<sub>Two independent hardware rechecks (33 + 38 findings) triaged claim by claim — fixed, already closed, refuted, or mapped to its test row</sub>

<p>
  <img src="https://img.shields.io/badge/status-LIVE__SPEC-2ea44f?style=flat-square" alt="status: live specification"/>
  <img src="https://img.shields.io/badge/rev-E81-f2b705?style=flat-square" alt="revision E81"/>
  <img src="https://img.shields.io/badge/updated-2026--09--17-8b949e?style=flat-square" alt="updated 2026-09-17"/>
  <img src="https://img.shields.io/badge/findings-71_rows_·_2_reviews-d19a00?style=flat-square" alt="findings: 71 rows · 2 reviews"/>
</p>

> [!NOTE]
> **Purpose** — the two external hardware rechecks of the E79 release, triaged claim by claim: what was fixed, what
> was already closed, what was refuted against the built sources, and what maps to a test row. Superseded in part by
> the [E81 full-system validation](e81-validation-report.md), which re-derived the same domains from first principles.
>
> **Gate coupling** — each FIXED row names the gate that re-ran for it (`kicad5-verify`, `review-checks`,
> `verify-independent`, `run_tests.sh`); each EVT / RFQ HOLD row names its [EVT](evt-plan.md) test.

Two independent reviews of the E79 release arrived 2026-09-17: register **HR-01…HR-33** and register **R01…R38**
(overlapping scopes, occasionally contradicting each other). This page is the E45/E46/E74 pattern applied to both at
once: every claim re-derived against the built netlists, the generated exports, the firmware sources and the vendor
data already in the repository. Verdicts:

- **FIXED** — confirmed and corrected in this revision (source, data or firmware; gates re-run).
- **ALREADY CLOSED** — the repository fixed or decided it at an earlier revision; the claim is stale.
- **REFUTED** — the claim does not hold against the built sources; the evidence is cited.
- **EVT / RFQ HOLD** — a real qualification requirement no repository edit can discharge; mapped to its test row.
- **OPEN** — a genuine open decision, registered with an owner.

## At a glance

| | |
|---|---|
| **Inputs** | two independent external hardware rechecks of the E79 release — **HR-01…HR-33** and **R01…R38** (71 rows, overlapping and occasionally contradicting each other) |
| **Method** | the E45 / E46 / E74 pattern: every claim re-derived against the built netlists, the generated exports, the firmware sources and the vendor data already in the repository |
| **Verdicts** | FIXED · ALREADY CLOSED · REFUTED · EVT / RFQ HOLD · OPEN — each with its evidence cited |
| **Superseded in part by** | the [E81 full-system validation](e81-validation-report.md), which re-derived the same domains from first principles with nine reviewers |

## 1. Confirmed and fixed in E80

| Review row | Finding | What changed | Evidence |
|---|---|---|---|
| **HR-01** | The CAN choke's label→pin map put the transceiver pair across ACT45B winding 1–4 and the connector pair across 2–3 — no through-path on all four exported variants | `calculations/sheet-netlist-gen.mjs` LCAN map: CANH 1→4, CANL 2→3; termination/TVS ride the bus labels onto 4/3; all five KiCad sets + PDFs regenerated | `kicad5-verify` 100 % ×5 · apply payload shows `1=A1 2=A2 4=B1 3=B2` |
| **HR-02 · R01** | TPS3430 CWD 1 nF + SET00 puts the early window at ~15–18 ms while firmware kicks WDI every 10 ms — every correct kick was an early-window violation | Fixed-window strap: CWD **open**, SET0 low, **SET1 → V3P3** (`cells.tsx` SafetyChain, netlist rule, card rebuilt); valid window 2.22–23.375 ms with no capacitor tolerance; the bootloader kicks every ~10 ms from power-up and chunks image verification (`boot/image.c` poll every 32 KB, rate-limited ≥ 5 ms) | card netlist: `SET1 → V3P3`, `CWDCARD` gone · `review-checks` R3-WDT/E80 · EVT **T-53** scopes the window |
| **HR-04 · R02** | AMC1311 nominal output common mode is 1.44 V typical, not 1.39 V — every uncalibrated DC channel read ≈ 56 V high | `hal/meas.c` DC offset 1.39 → **1.44 V** | app_test comparator rows re-derived (F.03 2.208 V) |
| **HR-05 · R03** | AMC1350 gain is 0.40 (slope 0.200, not 0.205) and its ~1.25 MΩ input loads the 11.5 k divider — line read ≈ 3.3 % low | `hal/meas.c` AC transfer: slope 0.200, bottom = 11.5 k ∥ 1.25 M | hal_test meas rows green |
| **HR-24 · R06** | One “farthest from 400 V” scalar hid a 280/505/505 V set from F.07 and fed 280 V into the precharge crest | `pmp_in_t` carries **vin_ll_min / vin_ll_max**; F.07 reads the max, F.08 the min, precharge crest and the bus floor read the max, availability (E1 derate) the min; `vin_ll` stays display-only | host_sim E80 R06 check · `core/fsm.c` |
| **HR-06 · R10** | 860 V total + 40 V midpoint still allowed one 450 V half-link bank 454–468 V | New row **F.38 half-link OV**: either half > 440 V for 10 ms latches (`FC_HALF_OV`); trip span 435.6–444.4 V at the calibrated ±1 % class, normal worst half 438 V at the F.06 boundary | host_sim E80 HR-06 check · [protection thresholds §11](protection-thresholds.md) |
| **HR-25 · R25** | 5 Hz (150 rpm) passed the tach check at any duty; no check below 30 %; one boolean hid the failure count | Fan supervision is a **curve**: judged from 20 % duty, floor = max(5 Hz, 35 % of commanded speed), 3 s persistence; the core derates by **failed count** (FW-21: 4-fan SKU 0.6 / 0.3, 2–3-fan 0.5) and **F.25 latches when nothing can cool** (AUTO_INT) | app_test fan-curve check · host_sim FW-21 check |
| **HR-29 · R04** | A factory-blank card ran on nominal scaling with only a warning | **No calibration record inhibits delivery** like a bad one (F.30 from boot); `APP_W_UNCAL` names the cause; the EOL fixture is the only calibration writer | app_test HR-29 check |
| **HR-28** | An energized PFC ramp that never reached 0.95 · ref sat in STANDBY unbounded | The ramp counts inside the F.34 window (8 s) | host_sim E80 HR-28 check |
| **HR-08 · R08** | LLC enable trailed the matrix coil command by one tick; the matrix has no mirror contacts (E67) | 40 ms make-settle wait after a matrix close command (RFQ operate ≤ 25 ms + bounce ≤ 5 ms + margin); a warm restart with contacts already closed does not wait again | host_sim E80 HR-08 check |
| **HR-09 · R07** | The PAR make permit bounded each bank against the node but not against each other (450 V/200 V closes → C·ΔV²/4 through the contacts) | PAR make additionally requires **\|V_A − V_B\| ≤ 25 V** (≈ 5 mJ at 30.8 µF); the bleeders run until both conditions hold | host_sim E80 HR-09 check |
| **HR-12 · R12** | Bus < 60 V alone ended discharge — banks at 400 V lost their bleeders | DISCH → OFF needs **the link AND both banks** below 60 V | host_sim E80 check |
| **HR-11 · R11** | After the F.21 timeout the dump stayed commanded — a live source (the permanent precharge path) feeds 640 Ω indefinitely | **F.21 ends both dump commands** (the code says “not discharged — isolate upstream, then verify”); FAULT never runs an unsupervised dump; SHUTDOWN re-runs it bounded | host_sim E80 HR-11 check |
| **R09 · HR-07** | CMP0 stayed at 1050 V in LOW mode (FW-19’s documented interim was never coded) | F.13 threshold **scheduled by mode**: LOW 560 V · HIGH 1050 V (`hal/app.c`); HW-REC-1 readiness: the non-latching clamp reference (v_ref · 1.05 + 10 V) is computed and armed on `APP_DAC_CLAMP` every tick | app_test threshold + clamp checks |
| **R34** | The share trim’s +1 % authority carried the final voltage target past the mode ceiling (505 V in LOW) | Final `v_tgt` clamp after trim and droop (`core/ctl.c`) | ctl_test R34 check |
| **HR-18 · R20** | B66372**B**2000 former is class B 130 °C / UL94 HB — below the winding system | Former part is now **B66372A2000** (class F 155 °C / V-0, same TDK geometry) across parts data, sheet notes and magnetics pages; dimensional fit confirmed at first article | parts-db/lcsc/mag pages regenerated |
| **HR-03 · R15** | GC4D20120D is not the 2-terminal 40 A part the requirement row describes (mfr data: TO-247-3 dual common-cathode, 16.5 A/leg at 135 °C, IFSM 71 A/leg) | LCSC row set to **REVIEW / DO-NOT-ORDER**; the BOM row states the requirement class and both closure paths (true single-die ≥ 40 A TO-247-2, or a deliberate dual-die redesign with 3-pin land and sharing/surge recalculated) | `lcsc-map.mjs` · BOM pages regenerated |
| **R38** | The insulation page credited output Y capacitors with a ±500 V DC centre — capacitors set no steady-state DC division | §6 rewritten: no capacitive DC-centring credit; barrier stress = the full possible offset under the installation’s leakage envelope unless the system provides a bound | [insulation §6](insulation-coordination.md) |
| **HR-19 · R19** | “Σ gap” could be read as summed across the two parallel core sets | Every D2 gap line now says **per flux path** (the numbers always were per path — they equal the reviews’ own per-path values) with assembled-AL acceptance | parts-db descriptions · mag pages |
| **HR-15 (rail label)** | Carriers still said +18/−4 V | Every carrier now states the catalogue **+18/−3 V** (O-11 was closed at E45; an E61 doc pass had re-opened the label) | parts-db · lcsc-map · architecture · benchmark pages |
| **R31 · HR-27** | “Portable firmware is not a demonstrated target controller” | E80 delivers the **register-level GD32G553 port** (no vendor library; every register cited to the UM): clocks/PMU/FMC ws, HRTIMER (center-aligned Vienna carrier, PFM+PSM legs with 120 ns dead time, six fault channels per Table 25-21), 4×ADC+DMA double-buffered rings, CMP/DAC thresholds, CAN mailbox driver, FWDGT+WDI, TCM `.ramfunc` (whole 100 kHz path at 0x1000xxxx), signed A/B images, bootloader with chunked-verification watchdog kicks; pin table gated against the card generator (`port-pin-audit`, 56 pins) | `firmware/port/gd32g553/` builds boot + slot A/B signed images · run-all gate |

## 2. Already closed at an earlier revision (stale claims)

| Review row | Claim | Where it was closed |
|---|---|---|
| **HR-20 · R18 (name)** | “116 µH label vs 125 µH build” | E74 F12: the D1-40 page prints L₀ 106–135 µH (125 nom), the class name marked historical |
| **R16** | “C5713523 is not the SiChain part” | The lcsc row has said exactly that since R3: documented **SECOND-SOURCE** (C3M0016120K, same pinout, gate-drive delta stated) |
| **HR-13** | Passive discharge after aux dropout needs a bounded service policy | R6-B: 370/445/593 s tails computed, IEC 62477-1 label rule, F.21’s real coverage stated |
| **R13 (rails)** | QA01C −4 V does not exist as drawn | O-11 closed at E45 (+18/−3); E80 re-aligned the stale carriers (see §1) |
| **HR-32 (F.11 values)** | “85/115/145 A headline is obsolete” | E60/E67: the ladders are 120/155/195 A and 140/180/220 A everywhere the gates read |
| **R24 (fan count)** | Repo “still” 2/3/0/4 | 2/3/0/4 **was** the E41/E44 build (harness has exactly four tach ways); the other review asserts 3/4/5 — resolved at E81 by user decision as **3/3/0/4** (O-16, §5) |

## 3. Refuted against the built sources

| Review row | Claim | Evidence against |
|---|---|---|
| **R30 (termination)** | Per-module 120 Ω would overload the bus | The 120 Ω is a **jumper** (JTERM); the protocol page has always said “120 Ω jumper termination” — populated at the two bus ends only |
| **R32** | The LLC modulator is “not fail-safe” on zero/invalid bank inputs | Layered by design: invalid sensing is F.29 inside 3 ms (delivery stops), the CC loop bounds current, the ZVS floor rises with measured Q, F.11’s window backs it in hardware — `hal_test` runs the discharged-output, short-class and beyond-gain cases on the cycle-by-cycle tank |
| **R36 (rearm)** | The blanking re-arm could “clear an active bank OVP/DESAT” | The HRTIMER latch only kills PWM; the FSM latch (which the re-arm never touches) holds both gate enables low through the safety AND — a cleared hardware latch cannot re-energize a faulted module. The port additionally re-enables outputs only for stages the FSM still commands |
| **HR-26 · R33 (append while PFC runs)** | Flash appends can stall the control ISRs | The premise the review itself allows (“unless execution from independent memory is proven”) is the design: both control ISRs and the whole 100 kHz path execute from **TCM** (`app.ld.in` places them; the ELF map shows 0x1000xxxx), and dual-bank RWW covers the tick when running from the other bank. T-44 measures it on silicon |

## 4. Real qualification holds — mapped to their test rows

| Review rows | Hold | Row |
|---|---|---|
| R05 · HR-16 | Both-polarity fast-trip proof (DESAT-blind direction vs `APP_OC_POL`) — the reviews’ direction analysis contradicts protection-thresholds §3; injection decides, nothing is flipped on paper | EVT **R6/R7-A both-polarity test** (firmware-guide) |
| R14 · HR-17 | Dead time, DESAT blank, snubbers, gate undershoot at −3 V | DPT rows, [evt-plan](evt-plan.md) |
| R17 · HR-21 | Capacitor ripple sharing and hot ratings | **T-43** + llc-run per-can probe (E74-1) |
| R22 · HR-22/R23 | Aux budget with the final fan MPN; TVS clamp coordination; aux OVP | **T-55** (new) aux fault matrix |
| R26 · HR-14 | PV bleeder gate margin hot/humid | **T-56** (new) |
| R28 · HR-30 | Fuse/MOV/GDT coordination, insulation/PD, EMC | standing EVT/§K set |
| R37 · HR-33 | Thermal/harsh-service qualification, liquid flow interlock (cart-side) | T-31/T-32 class rows |
| R27 · HR-27 (residual) | WCET on silicon, boot/update on target | **T-44** · **T-52** (new) |
| HR-02 (residual) | Watchdog window on the fitted part over temperature | **T-53** (new) |
| HR-25 (residual) | The tach curve’s full-speed constant for the selected fan | **T-54** (new) |

## 5. Open decisions registered

| ID | Question | State |
|---|---|---|
| **O-15** | Fast-trip polarity: protection-thresholds §3 says +1 trips the DESAT-blind direction; both reviews argue the opposite sign. Contradiction between carriers = open decision (never “correct” one silently) | **Closed at E81:** F.01 is made bipolar in firmware — the 100 kHz ISR sets the comparator DAC sign from the measured phase-current sign, so the hardware trip covers both half-cycles whichever way the line CT is fitted; both polarities are still demonstrated by injection at EVT (T-12) |
| **O-16** | Fan complement: the build is 2/3/0/4 (E41/E44, four tach ways in HARNESS40); one review asserts a 3/4/5 basis that would need a fifth tach way (the 40-way harness has none spare — W40 is SHLD) | **Closed at E81 (user decision 2026-09-17): 3/3/0/4.** The 30 kW gains a third fan on the existing FAN_TACH3/FAN_PWM2 ways (no harness change); the air budget at the 55 °C inlet density reads 1.65× / 1.27× / 1.27× (30 / 40 / 50 kW air), n−1 covered |
| **O-17** | The 202 W secondary/output-diode accounting mismatch between `loss-budget` and `envelope-grid` operating points (R35/HR-31) — a model-reconciliation task, not a hardware change; neither 96 % nor 98 % is treated as measured | **Closed at E81:** not an accounting error — the two ledgers evaluate different operating points with the same formulas (reviewer C, F-C-18). Both now carry the LLC turn-off term the pre-E81 models lacked (a flat 1 W / 8 W per position where the decks turn off at 36–147 A), the grid runs on the per-SKU air base 74 / 75 / 77 °C, and the real worst corner (500 V SER at high line, hot) is in the grid's fold table |
| **HW-REC-4** | No crystal on the card; IRC8M ±2.5 % is outside CAN’s ~±0.5 % tolerance need. The port runs the PLL from HXTAL when fitted (clock monitor armed, IRC8M fallback keeps regulating) and reports through the CAN warning path otherwise | **Closed at E81:** 8 MHz crystal + 2 × 12 pF + 1 MΩ on OSCIN/OSCOUT (pins 12/13) drawn on the card; `PORT_HXTAL_HZ` = 8 MHz in the port build (F-F-1/F-A-30: ISO 11898-1 budget ±0.485 % at 16 tq / SJW 2) |
| **HW-REC-5** | Route DRV_RDY into the spare third inputs of the safety AND (asynchronous global-ready), per HR-23 | User decision; firmware already supervises `aux_ok` at 10 ms |

## 6. What the reviews got structurally right

Both registers repeat the E74 lesson: **the netlist face, the data rows and the firmware must be one revision.** E80’s
answer is more gates, not more prose: the watchdog strap is asserted by `review-checks`, the port pins by
`port-pin-audit`, the choke map by the regenerated `kicad5-verify` set, the firmware rows by 260 host checks, and the
signed-image chain by `boot_test` against OpenSSL-derived vectors. The full verdict table the reviews asked for lives in
[verification-matrix](verification-matrix.md); nothing on this page claims a bench result it does not have.

<sub>previous · [assumptions](assumptions.md) — hub · [README](README.md) — next · [verification matrix](verification-matrix.md)</sub>

> [!TIP]
> **How this page is checked** — each FIXED row names the gate that re-ran for it (`kicad5-verify`, `review-checks`, `verify-independent`, `run_tests.sh`) and each HOLD row names its EVT test; `sh calculations/run-all.sh` re-runs the lot.

---

<div align="center">
<sub><a href="assumptions.md">← Decision Register</a> &nbsp;·&nbsp; <a href="README.md">🧭 Documentation hub</a> &nbsp;·&nbsp; <a href="e81-validation-report.md">E81 Full-System Validation →</a></sub>

<sub>Vectivolt DC-Modules · documentation rev E81 · every number reproduces with <code>sh calculations/run-all.sh</code></sub>
</div>
