<img src="assets/banner-platform.svg" alt="" width="100%"/>

# 🛡️ Validation Report

<sub>What the independent validation found, what is fixed, what is still open and why — with the decision table for every proposed part and the first-prototype bring-up plan</sub>

<p>
  <img src="https://img.shields.io/badge/status-LIVE__SPEC-2ea44f?style=flat-square" alt="status: live specification"/>
  <img src="https://img.shields.io/badge/rev-E84-f2b705?style=flat-square" alt="revision E84"/>
  <img src="https://img.shields.io/badge/updated-2026--09--18-8b949e?style=flat-square" alt="updated 2026-09-18"/>
  <img src="https://img.shields.io/badge/verdict-READY_FOR_BENCH_BRING--UP-d19a00?style=flat-square" alt="verdict: READY FOR BENCH BRING-UP"/>
  <img src="https://img.shields.io/badge/open-C--10_needs_the_layout-d19a00?style=flat-square" alt="open: C-10 needs the layout"/>
</p>

> [!NOTE]
> **Purpose** — the state of the design, as the independent validation (2026-09) left it. The question it asked was
> *would the first prototype actually work, and is every rupee in it earning its place?*, and the rule was that **no
> document, gate, test or simulation in this repository counts as evidence**. Twelve independent reviewers re-derived
> the module from the schematic code, the C firmware, manufacturer datasheets and first principles; the lead re-verified
> every CRITICAL claim before accepting it and rejected the nine that did not survive; the corrections were then
> implemented under one constraint — *firmware wherever firmware is safe and fast enough, independent hardware only
> where reaction time, device survival or failure-mode independence demands it.*
>
> **Gate coupling** — every number here reproduces with `sh calculations/run-all.sh` and `sh firmware/run_tests.sh`.

## At a glance

| | |
|---|---|
| **Question** | would the first prototype work, protect itself, and cost what it should? |
| **Method** | 12 independent reviews + lead re-verification + a knowledge graph of the engineering corpus (3,222 nodes · 5,637 edges) |
| **Found** | **11 CRITICAL** (nine of them firmware, all ₹0) · 33 MAJOR · ≈ 60 MODERATE / MINOR · 9 reviewer claims **rejected** after checking |
| **Answer** | the power-stage architecture and its arithmetic are sound; the first prototype **would not have started**, and once started would not have been safe — five independent defects each stopped it delivering power, four made a running module unsafe, one left die survival to a heatsink sensor that cannot see the die |
| **State now** | every CRITICAL and every firmware MAJOR is implemented and tested; the hardware value and rating corrections are drawn, costed and gated |
| **Cost of the corrections** | **₹80 / 133 / 133 / 133 per module** (0.25–0.37 % of COGS) — §7 |
| **Firmware** | 334 checks under ASan/UBSan across seven binaries: `boot_test` 22 · `host_sim` 122 · `ctl_test` 20 · `proto_test` 42 · `hal_test` 45 · `app_test` 32 · `rules_test` 51 · target build clean |
| **First-prototype verdict** | **READY FOR BENCH BRING-UP** — the port has never run on silicon, and full power waits on the commutation-loop measurement (§9) |

## 1. Scope and method

| Layer | What it did |
|---|---|
| **Knowledge graph** | a graph over the engineering sources (generated output, PDFs and SPICE dumps excluded). Its own finding: three edges between `firmware/` and `calculations/`, none to the schematic — every ADC scale, tank constant and loop gain in the C was hand-copied, which is why `fw-constants-sync` exists |
| **Twelve reviewers** | power path · control hardware · magnetics · SiC and thermal · MCU ↔ firmware · state machine and protection · control loops · boot and CAN driver · independent LLC simulation · independent front-end simulation · benchmark and cost · CAN protocol. Each with its own scripts and datasheets; the two simulation reviewers were forbidden the repo's decks and test plants |
| **Lead verification** | every CRITICAL re-proven before acceptance: instruction-accurate Cortex-M33 emulation of the bootloader's own `p256.c`; capacitor current from the firmware's actual modulator against Kolar's closed form; a high-pass-sensor model of the line-current loop; datasheet extraction for TPS3430, NCP1252, NSI66x1A; the repo's own double-pulse deck re-run at realistic loop inductance |
| **Evidence tags** | `DATASHEET` · `CALCULATED` · `SIMULATED` (actually run) · `CODE-VERIFIED` · `ASSUMED` · `HW-TEST` |
| **Implementation** | six implementers on disjoint file sets, patches merged and re-tested by the lead; every behavioural change carries a check that fails without it |

**Why the defects were there.** The port layer and both control interrupts have never run on silicon, and every host
plant was kinder than the hardware: byte-granular flash, unlimited watchdog time, ideal comparators, a sinusoidal grid,
a DC-coupled current sensor, a link that ramped for ever. The plants that hid defects were replaced — row-granular
program-once flash, a high-pass current sensor, a link that stops at the crest — and the negative runs are recorded
with each fix.

## 2. Verdict

**Sound.** Filter / precharge / Vienna / LLC / matrix topology and every polarity in the built netlists; the TPS3430
strap; the NCP1252**D** behaviour and the aux cold-start budget; every `meas.c` scaling constant; the F.11 window
ladder; the magnetics against vendor data; the tank (f_r, Z0, currents within 1–2 % of an independent ngspice model with
datasheet C_oss); the efficiency ledger within 0.2 pt; link, precharge and discharge energies; the PFC loop
coefficients; the relay matrix and its exclusion gate; TonHe V1.2 byte-exact; CAN bit timing; the signed A/B boot logic;
the GD32G553's resources.

**Corrected.** Five defects that each stopped the module starting, four that made a running module unsafe, one that
left die survival to a sensor that cannot see the die, and the analogue, timing, rating and sourcing work behind them —
then, at the edge where the port meets the HAL: comparator codes that ignored the ADC's own reference correction, an
enable write that could re-arm a tripped stage, an LLC period written in two halves, a fan tach handed over ten times
too fast, a discharge intent the port never kept across a reset, two link rows that could end a commanded dump, and a
driver-ready inhibit the pages credited while the gate inputs were tied high.
§3 is the list, and it is the list a bench engineer should read before Stage 0: each row names the check that will fail
if the fix is ever undone.

## 3. Defect classes found and closed

Read this as *what to watch on the bench*: the row is the failure mode, the fix is what the design does now, and the
check is what keeps it that way.

| # | Defect | Fix | The check that guards it |
|---|---|---|---|
| **C-01** | the window watchdog is violated all along the boot path: one P-256 verification runs ≈ 90–105 ms un-serviced against a 23.375 ms window, twice per boot, plus slot erase, a 32–53 ms application hand-off and a 20–40 ms crystal wait | service inside the ladder and the inversions (longest gap 0.6 ms), 4 kB hash pieces, RAM-resident flash primitives that service before every operation and after every erase, start-up services across the hand-off, crystal wait bounded by DWT to 10 ms | `boot_test` · Stage 2 scopes WDI / WDO / NRST |
| **C-02** | a comparator reference below AVMID on an active-high fault input asserts a standing F.01 in normal operation | positive reference only, plus a 100 kHz software magnitude trip on the raw current; Σi = 0 makes the other two comparators the hardware backstop for the negative polarity | `app_test` magnitude trip · Stage 5 (d) |
| **C-03** | VREFINT converted with a 132 ns aperture where the part needs ≥ 17.1 µs → F.29 100 ms after every boot | out of the 100 kHz ring; read once at boot at 28.5 µs; the part's factory calibration word replaces the 1.20 V nominal | `hal_test` · Stage 2 prints `ti.vrefint` |
| **C-04** | the journal's 12-byte header puts every record on a flash row that is already programmed — nothing persists, so the mandatory calibration can never be stored | 16-byte header, 8-aligned entries, commit marker alone in the last row; the host flash models are row-granular and program-once | `boot_test` on the row-granular model (10 checks fail with only the layout reverted) · Stage 2 power-cut writes |
| **C-05** | the precharge bypass closes at 0.97 × √2 × V_rms, which flat-topped mains never reaches — F.20, then LOCK after five tries | close on a **settled** link: two 20 ms steps under 3 V and at least 0.85 × crest | `host_sim` flat-topped plant · Stage 9 |
| **C-06** | both watchdogs serviced from SysTick behind a sticky flag — a hung main loop is never detected while the control interrupts keep switching | permission is a token purse the main loop must keep paying into; a dead loop resets within 30 ms plus one window | `app_test` · Stage 2 `while(1)` build |
| **C-07** | a latched code survives shutdown → wake, after which the module ignores STOP and a pulled CAN cable | a wake clears the latch; a LOCK survives it | `host_sim` |
| **C-08** | `latch()` drops every later fault, so a DESAT that follows a grid sag is lost and the module auto-restarts into the faulted leg | a LATCH-class row replaces the self-clearing one | `host_sim` |
| **C-09** | the control interrupts re-arm the outputs 10 µs / 100 µs after every hardware trip | `trip_n / trip_ack`: outputs stay off until the supervisor has seen and latched the trip | `app_test` · Stage 5 (d) — outputs must not come back by themselves |
| **C-10** | the over-voltage and turn-off basis assumes a 5–7 nH commutation loop. Re-run per die at 10–30 nH: R_g,off 0 Ω reads 78–92 % of 1200 V at 10 nH and **90–103 % at 20–30 nH**; R_g,off 4.7 Ω holds 75–90 % at any loop but costs 3–5 × the turn-off energy, which the one-die 30 kW cannot carry | the ≤ 10 nH layout rule is **load-bearing, not a preference** — §9 and Stage 7 | `stress-audit` `[DPT]` · ring-down before any high-power run |
| **C-11** | the thermal grid's folds existed only in the grid: one corner reads 229–335 °C at any load, and the derate ladder it was supposed to feed reads a heatsink NTC 80–170 K below the die | three things, together: the weak bridge leg gets a valley-timed dead time (125 / 186 / 189 ns) instead of one computed on the magnetising current; the grid stops charging every weak-leg die twice; `hal/dielim.c` becomes a junction observer that folds 142–150 °C on an estimated die temperature and **declines** a point it cannot cool. The link reference also **leads the measured output** instead of jumping to the command, so a vehicle's maximum-voltage setpoint no longer parks the link at 830 V over a 330 V pack | `envelope-grid` (no FAIL row) · `fw-constants-sync` residual map · `hal_test` observer · Stage 8 T-58 |
| **Analogue front end** | 22 channels sampled for 132 ns at the end of a harness that runs beside PWM ways, with no anti-alias and no iso-amp source impedance; a 3-LSB sense offset injects 23 A of DC into the line current, unbounded by design | 1 nF at every ADC pin, 100 Ω at every iso-amp output, and per-cycle mean removal on the sensed voltages and the CT channels (23 A → 0.17 A on the high-pass-sensor plant) | `hal_test` mean removal · Stage 5 (a)–(c) · Stage 9 DC clamp |
| **Control loops** | the CV loop's worst \|T(z = −1)\| is 1.79 — unstable at the low-voltage corners; tank rms was read from an aliased ADC channel | a loop-gain ceiling from the modulator's own sensitivity (worst 0.43), tank rms from the operating point, integrator bound and skip window for a load dump, trim slower than the peer refresh | `ctl_test` · Stage 8 CV sweep |
| **Timing and interrupts** | no dead-time floor against unmatched driver delays; the control interrupt had 5.0 µs of budget; one missed LLC tick latched F.35 | 120 ns dead-time floor in firmware and in the SPICE decks; the control interrupt moved onto the ADC end-of-sequence transfer (≈ 7.2 µs to the roll-over); F.35 needs three missed ticks inside 100 ms, and a stopped interrupt still latches inside 3 ms | `rules_test` floor · `hal_test` · Stage 6 gate-to-gate · T-64 |
| **FSM and recovery** | a relay weld, a stuck discharge, a missing aux rail, a command-relative over-current and a grid-caused bus collapse had no row; every latch left the bypass closed | new or corrected rows F.18, F.21, F.26, F.15, F.05 → F.07/8/9; every latch opens the bypass and recovery re-precharges; an F.01 inside 500 ms of a disturbed line is filed as F.08 — self-recovering and uncounted — because the EMI filter rings 121–199 A pk at a line return through the boost diodes, which no switch can stop | `host_sim` scenario rows · Stage 11 |
| **Link and passive ratings** | the DC-link can was bought on the LLC's share alone (0.8–2.4 A) while the Vienna's own 50 kHz current was in no budget; the link damper resistor was a 3 W part dissipating 7–36 W; the balance network cost 3–10 W of standby; nothing bled the output studs | can re-specified to its real duty (5.7 / 6.5 / 5.9 A per can at 400 VAC); damper re-rated to a heatsink-clipped 50 W TO-247; one 47 kΩ balance string per half; a 3 × 150 kΩ output bleeder; the X-cap bleed star at 33 kΩ | `current-coordination` `[DCLINK-VIENNA]` · `fault-energy` `[RESERVOIR]` · `standby-budget` · Stages 0, 8, 10 |
| **Parts and order codes** | a gate-bias module ordered by a part number that does not exist, HV chip resistors below their element voltage, an aux switch specified at the wrong gate voltage, a fan class the 110 W aux cannot carry, a precharge resistor with no failure mode, and a snubber BOM line that said 1 nF against a 330 pF drawing | every line re-issued against an RFQ acceptance row instead of a proxy's typical: bias module as a class with a light-load row, ≥ 500 V element voltage, Q_AUX at a 12–15 V gate, fans ≤ 0.6 A at 24 V, a flameproof **fail-open** precharge resistor, snubber 330 / 680 / 1000 pF per die | `bom-maturity` · `stress-audit` · `review-checks` |
| **Carriers out of step** | the generated magnetics drawings repeated inductances the engines had moved, and THD / power factor were claimed over a load range the Vienna does not hold | the drawings read D2 and D3 from `magnetics-envelope`; THD ≤ 5 % and PF ≥ 0.98 are specified from 25 % load to full load, below which the cabinet sheds modules rather than idling them | `mag-sync` per page · `review-checks` |
| **Firmware ↔ hardware drift** | nothing in `calculations/` read a firmware constant: every ADC scale, tank number and loss coefficient in the C was hand-copied | `fw-constants-sync` reads `hal/meas.c`, `hal/llc.c` and `hal/pfc.c` against `boards.tsx` / `cells.tsx` / `tanks.mjs` / `parts-db` / the thermal grid | `fw-constants-sync`, 30 rows, inside `run-all` |
| **Thermal basis ↔ firmware** | the derating curve and the derated corner of every magnetics gate assumed 40 % power at 75 °C inlet; the firmware delivers 60 % there, and two protections the pages claimed (a cold-start power limit, an airflow estimator) exist in no code | the engines are solved at the law the firmware implements (every thermal gate still clean); the unimplemented claims are gone — the sink-zone ladders and the junction observer are what act | two `fw-constants-sync` rows hold the curve and the derated corner to `hal/app.c` and `core/fsm.h` |
| **Drawing ↔ engine ↔ BOM** | the input-filter damper is drawn 2.2 µF / 6.8 Ω (30–40 kW) and 4.7 µF / 4.7 Ω (50 kW) while the stability engine modelled 2.2 µF / 10 Ω everywhere and the BOM bought 10 Ω; the aux deck modelled 26 / 16 V rail TVS against the drawn 28 / 18 V parts; sheet title blocks typed the wrong snubber values; the 40 and 50 kW fuse-holder packages were swapped on the sheets | `pfc-control` reads the damper from the drawing (modulus margin 0.63 / 0.61 / 0.71); the BOM buys the drawn value; the deck models the drawn TVS; the title-block line is computed from `tanks.mjs`; the footprint map is corrected | `review-checks` `FILTER-DAMPER-VALUE` and `FUSE-FRAME` · `repo-hygiene` footprint rules |
| **Stale evidence** | post-processed results were older than their inputs — the internal-short envelope, the magnetics excitation table, the CT front-end results and the double-pulse turn-off current had not been regenerated after the runner that feeds them changed (the 30 kW internal-short kill peak read 196 A against 210 A) | every SPICE suite re-run; derived result files carry `# inputs <hash> <- files` | `repo-hygiene`: a derived file whose inputs have moved fails the battery |
| **Dead and duplicated table entries** | a bypass relay defined twice at 50 kW (the first definition silently dead), BOM rules matching no part, a ₹0 line for a part that does not exist, overrides describing the wrong part (an 18 Ω burden printed as 22 Ω), 60-odd sourcing and footprint entries for parts the BOM cannot emit, a footprint library that missed the Y-capacitor land and shipped two unused ones | removed or corrected; the footprint generator scans every sheet, the control card included, and prunes | `repo-hygiene`: dead rules, dead map entries, repeated keys, library ≡ what the sheets ask for |
| **Comparator codes vs the reference** | the DAC references inverted the NOMINAL transfer: the ADC path corrects every absolute reading by the measured VREFP (`k_ref`) while the codes written to the VREFP-referenced DACs did not, so a rail 2.5 % high moved F.03 from 860 V to 922 V and F.13 (LOW) from 560 V to 614 V with the telemetry reading correctly | `dac_v` inverts `meas_val` at the `k_ref` in force — absolute channels on the whole reading, AVMID-ratiometric ones on the swing; VREFP is read once at boot, so the codes carry the rail's post-boot movement, ≤ ±1 % for the buck class (§9) | `app_test`: the code read back through `meas_val` lands on 860 / 560 V and the F.01 class with VREFP 2.5 % high · `review-checks` `DAC-INVERSE-KREF` · T-26 |
| **AVMID judged on the wrong scale** | the half-rail check divided a RATIOMETRIC reading by `k_ref`: a healthy buffer on a rail 3.1 % high (inside the ±5 % reference window) failed F.29, and a buffer that drifted with the rail passed | judged on the nominal scale with no correction — the one reading that sees the ladder and the buffer alone | `app_test`: rail +4 % passes, buffer +4 % is F.29 · `review-checks` `AVMID-RATIOMETRIC` |
| **The enable write after a trip** | each control interrupt decided its outputs from `trip_n == trip_ack` and then wrote CHOUTEN; a fault landing between the two had already killed every output in hardware and the write re-armed them — for one control period, or for good, since the timer resumes a pulse fault the moment the source is gone; the tick's re-arm also cleared fault flags the fault interrupt had not yet consumed | the two control interrupts are the only writers that can enable an output (the tick's re-arm path is gone — a stage comes back only through its own interrupt once the supervisor has acknowledged the trip and commands it), and after every such write the port tests the software count AND the HRTIMER's own fault flags (set in the kill's clock domain, before the NVIC has taken the interrupt), disabling everything if either moved; only the fault interrupt clears flags | `review-checks` `TRIP-GUARD-AFTER-ENABLE` · T-44 fault-at-every-boundary injection |
| **LLC period written in two halves** | dead time, both periods and the phase compare were five separate shadow writes with the transfer free to land between them (the 100 kHz interrupt pre-empts the sequence about 1 % of the time): one cycle with leg A on the new period and leg B on the old one and the old phase | ST0UPDIS / ST1UPDIS hold the transfer while the set is written; one roll-over takes it whole | `review-checks` `LLC-UPDATE-COHERENT` · T-72 gate capture through a frequency step |
| **Tach units** | the port computed tenths of hertz and handed them to the HAL as hertz: a fan at 10 Hz (300 rpm) read 100 Hz and passed the full-duty floor of 42 Hz; telemetry read 36 000 rpm for 3 600 | hertz end to end | `review-checks` `TACH-IN-HERTZ` · T-54 injection |
| **A reset during a commanded discharge** | the HAL emitted the intent and could resume from it, but the port never stored it and the boot record had no field: a watchdog reset mid-dump booted into INIT → PRECHG with the link recharging and the banks left as they were | the intent is sealed into the application's own no-init record before the tick acts and read back at boot; the record is apart from the bootloader's, so a service round trip or a bootloader update keeps it | `app_test`: a pre-reset record resumes the bounded dump, never precharges, reaches OFF · `review-checks` `DISCH-INTENT-SEALED` · T-44 reset at every discharge transition |
| **Link rows on the shutdown path** | F.06 (midpoint) and F.38 (half-link) ran during the dump; a midpoint excursion while the link came down latched, ST_FAULT ended the dump, and F.06 — an AUTO row — recovered into precharge with the shutdown forgotten | both rows carry the shutdown exemption every other row already had | `rules_test`: a 108 V midpoint error during the dump does not end it · `review-checks` `LINK-ROWS-EXEMPT-ON-SHUTDOWN` |
| **Driver-ready inhibit** | the pages credited a global asynchronous gate-off on DRV_RDY, but the line only reached a firmware input read every millisecond — the safety AND gates' third inputs were tied high | DRV_RDY is the third input of both enable gates: a collapsing bias on any of the seven channels drops both enables in nanoseconds; the firmware's 1 ms path (rails → `aux_ok` → SAFE, fresh ENABLE required) keeps them down | `review-checks` `DRV-RDY-IN-AND` · T-80 |

## 4. Does it earn its place? — the decision table

Seven questions per item: **(1)** failure prevented · **(2)** can firmware do it · **(3)** response time · **(4)** probability ×
consequence · **(5)** cost · **(6)** efficiency / density · **(7)** what commercial modules do (reference: the InfyPower
REG1K0135A2 teardown — Si super-junction PFC switches on plain low-side drivers, one 33 mΩ SiC die per LLC position at
40 kW, shunt + AMC1200 sensing, LMV393 comparators, gate transformers and **no DESAT**, opto-regulated aux, 680 µF /
475 V cans, series output diodes, active output discharge, three fans, potting).

| Proposal | Decision | Why |
|---|---|---|
| passive output bleeder 3 × 150 kΩ behind D_OUT | **added** ₹9 | 1000 V / 4.7 J stayed on the studs ≈ 100 s and no commanded path reaches past the diode; the reference has an active one |
| 1 nF at every ADC pin + 100 Ω at the iso-amp outputs | **added** ₹6 | 22 channels sampled for 132 ns at the end of a harness beside PWM ways — aliasing and kick-back are analogue |
| link damper resistor **≥ 50 W TO-247** | **re-rated** +₹80 | it dissipates 7 / 16 / 36 W whenever the bridge runs at f_max (2·f_sw on the entry-film resonance); the repo's own deck reads 35.6 W. 0.68–2.2 Ω dissipate the same 40 W and ring more — the power is the source's |
| X-cap bleed star 33 kΩ | **value** ₹0 | with the third X stage fitted, 47 kΩ takes more than 5 s to reach 60 V |
| one 47 kΩ balance string per half | **simplified** −₹4…12, −3…10 W standby | firmware watches MID in every energised state and the Vienna balances actively; the service label is 15 min |
| precharge resistor: flameproof, **fail-open** | **RFQ row** ₹0–5 | a shorted link puts 4.8–8.4 kW on it and nothing in the module can disconnect it — the part opening without flame *is* the protection |
| fan electrical class ≤ 14 W | **RFQ row** ₹0 | the 110 W aux is sized on it; a 25 W fan overloads the four-fan SKU into the NCP1252's latched over-current |
| DESAT-pin Schottky clamps, 14 diodes | **rejected** | the vendor's own mitigation is the 100 Ω series resistor already fitted; bench check only |
| second DESAT leg for the Vienna's other polarity | **rejected** | needs a prior diode failure; diode chains form a *minimum* selector and would mask the protection that exists; the reference has no DESAT at all |
| mirror RCD clamps on the 30 / 40 kW production BOM | **not added** | footprints exist; the double-pulse test at the real loop decides, and R_g is free |
| gate-bias preload resistors, TL431 / opto regulation of V15 | **rejected** | the rise is idle-only and inside abs-max; the BOM already carries a ±2 % zener; an 830 V reinforced opto is not a ₹6 part |
| extra DC-link cans | **rejected for now** | the can is re-specified for its real duty (≥ 5.2 A at 100 kHz, ESR ≤ 80 mΩ); the 340 VAC corner is a declared exceedance with levers |
| hardware zero-current detector for capacitive mode | **rejected** | the ZVS-boundary f_min table does it in firmware |
| e-stop input, coolant-flow switch, open-drain fan stage | **not added** | cabinet-level function · NTC rate-of-rise covers it · order 3.3 V-PWM fans |
| F.11 threshold 140 → 120 A | **rejected** | I_DM is a thermally limited repetitive rating; a single < 1 µs excursion to 105 % is far inside the short-circuit withstand, DESAT stands behind it, and 12 % headroom invites nuisance trips |
| link maximum 830 → 800 V | **rejected** | it eats the 2 % gain margin at the 500 V bank edge; the cure for overshoot is the loop |
| shunt + iso-amp PFC current sensing | **deferred to data** | both commercial references use shunts; CT acceptance rows (50 kHz amplitude / phase, ≤ 1 µs step, ≥ 5 A DC tolerance) are on the RFQ — three failed samples switch the design |

**Kept, because the owner's own rule demands hardware there:** DESAT + Miller clamp + UVLO on the four LLC drivers (leg
shoot-through never passes the tank CT); the F.11 window comparator (150 A/µs); the on-chip comparators for F.01 / F.03 /
F.13; driver UVLO → DRV_RDY; fuses, MOV / GDT, precharge with auxiliary-contact feedback; the 74HC02 matrix exclusion;
D_OUT.

## 5. Where hardware stops and firmware starts

| Event | Time scale | Owner | Path |
|---|---|---|---|
| leg shoot-through, die short | 2–3 µs | **hardware** | driver DESAT → soft-off, DRV_RDY low → GATE_EN |
| output short, tank over-current | ≈ 1 µs | **hardware** | TLV3202 window → HRTIMER fault → all outputs idle |
| line over-current, link and output over-voltage | µs | **hardware** | on-chip comparators → HRTIMER fault; the supervisor latches, and **nothing re-arms until it has** |
| gate-drive under-voltage, bias collapse | µs · ns | **hardware** | driver UVLO; DRV_RDY low → both GATE_EN low in the safety AND; firmware SAFE within 1 ms, fresh ENABLE required |
| hung firmware | 30–55 ms | **hardware** + firmware | TPS3430 window and the internal watchdog, fed only while the main loop pays |
| negative-polarity line over-current | 10 µs | firmware | 100 kHz magnitude trip; Σi = 0 gives a hardware answer at 2 × I_trip |
| die over-temperature at a point the NTC cannot see | 0.1–1 s | firmware | junction observer → fold → decline |
| grid return after an interruption | ms | firmware | every latch opens the bypass; recovery re-precharges |
| line over-current at a line return (the EMI filter rings above a link that sagged to its crest: 121–199 A pk on a stiff site) | µs + 2 s | **hardware** trips, firmware classifies | inside 500 ms of a disturbed line F.01 is filed as F.08 — self-recovering, uncounted, re-precharged; on a quiet line it still latches |
| DC in the line current | cycles | firmware | per-cycle mean removal on the sensed voltages and the CT channels |
| load dump, low-voltage CV stability, share trim | ms | firmware | integrator bound and skip window · loop-gain ceiling from the modulator's own sensitivity · trim slower than the peer refresh |
| relay weld, stuck discharge, aux rail missing, command-relative over-current, grid-caused bus collapse | ms–s | firmware | F.18, F.21, F.26, F.15, F.05 → F.07/8/9 |

## 6. Readiness verdicts

Scale: NOT READY · READY FOR BENCH BRING-UP · READY FOR LOW-POWER TEST · READY FOR FULL-POWER PROTOTYPE · PRODUCTION-CANDIDATE.

| Area | Verdict | What gates the next step |
|---|---|---|
| Power hardware | **low-power test** | commutation-loop inductance (C-10), the DC-link can RFQ (M-02) |
| Magnetics | **low-power test** | winder quotes against the D2 drawing; matched L_m pairs |
| SiC switching | **bench bring-up** | the double-pulse test at the measured loop decides R_g, C_s and the 30 kW die count |
| Thermal | **low-power test** | T-38 (R_th under the tab), T-04 (base temperature); the folds are now real |
| Control hardware | **bench bring-up** | V15 matrix, CT step response, NCP1252 latch behaviour |
| MCU capability | **full-power prototype** | measure the interrupt budget with DWT |
| Firmware | **bench bring-up** | the port has never run on silicon — Stage 2 and Stage 5 are its first test |
| Hardware ↔ firmware coordination | **bench bring-up** | comparator / trip paths proven at Stage 5 |
| Protections | **low-power test** | fault injection, Stage 11 |
| Communications | **low-power test** | — |
| Control-loop stability | **low-power test** | Stage 8 CV sweep at 150–250 V |
| Manufacturability | **not ready** | device freeze, layout, production programming flow (specified) |
| **First prototype** | **bench bring-up** | — |
| Production | **not ready** | EMC, safety, calibration, capacitor life, sourcing |

## 7. Cost

The hardware corrections add **₹80 / 133 / 133 / 133** per module at the 10k India basis (**0.25–0.37 %** of COGS):
the 3 × 150 kΩ output bleeder, 22 × 1 nF ADC-pin capacitors, 10 × 100 Ω iso-amp output resistors and the link damper
re-rated to a 50 W TO-247 part, less four balance resistors on the 40 and 50 kW SKUs. Nothing else in the correction
set costs money — every firmware fix is ₹0, and the re-issued RFQ lines change what is *specified*, not what is *paid*
until quotes land.

| | 30 kW | 40 kW | 50 kW liquid | 50 kW air |
|---|---:|---:|---:|---:|
| **Build cost @10k, India basis** | ₹31,613 | ₹36,103 | ₹42,761 | ₹40,688 |
| China RFQ target @10k | ₹25,920 | ₹29,520 | ₹35,023 | ₹33,243 |
| Red-line | ₹25,000 | ₹33,000 | ₹43,000 | ₹43,000 |
| Against the red-line | ⚠️ over by ₹6,613 | ⚠️ over by ₹3,103 | ✅ under by ₹239 | ✅ under by ₹2,312 |

Two RFQ rows carry a price risk that is declared rather than applied: the DC-link can bought against its real 100 kHz
duty, and the fail-open precharge resistor. The cost levers that remain — and why each is not executed — are in the
[teardown benchmark](benchmark-infypower-teardown.md).

## 8. First-prototype bring-up plan

**Ground rules.** One change at a time; a stage is entered only when the previous stage's exit list is written down. HV
work: isolated differential probes (≥ 1.5 kV), discharge stick, a second person, a polycarbonate shield over the SiC
rails from Stage 6. Sources in order of use: bench supply 30 V / 5 A → isolated HV DC supply 0–900 V with a current limit
(≤ 0.5 A until Stage 8) → three-phase variac + isolation transformer + 3 × 10 A breakers → mains through the real fuses
only at Stage 10. Bring up the 30 kW first (fewest dies). **R_WDOL unfitted and DESAT reporting only until Stage 5 has
proven both.** Production programming never lifts R_WDOL: the fixture toggles `TPWDI` every ≈ 10 ms for the SWD session.

| # | Stage | Do | Expect | STOP if |
|---|---|---|---|---|
| 0 | visual / continuity | polarity of every electrolytic, TVS, DESAT diode, D_OUT, clamp diode; pin 1 of NSI6611 / AMC / NSI1200, bias modules, TPS54202, TPS3430, TLP152, VOM1271; creepage slots clean. DCP–DCN > 150 kΩ (one 188 kΩ balance string ∥ dividers), halves within 2 %, OUTP–OUTN ≈ 450 kΩ, each gate–Kelvin 10 kΩ, rails > 100 Ω, PE–DGND 1 MΩ | as listed | any rail < 100 Ω, half-link mismatch > 5 %, a gate–Kelvin off by > 5 % |
| 1 | card alone, 15 V / 0.3 A | card out of the module, V15 on the slot pins | 40–80 mA; V3P3 3.30 ± 0.07 V; AVMID 1.650 ± 0.02 V; WDO toggling ≈ every 27 ms with no firmware; 8 MHz on OSC_OUT after flashing | V3P3 outside 3.15–3.45 V; buck not switching; > 150 mA |
| 2 | flash + boot timing | bootloader + signed application (R_WDOL open); scope WDI, WDO, NRST | first WDI edge < 23 ms after NRST; then an edge every 10.0 ± 0.2 ms, **never two closer than 2.3 ms, never a gap > 20 ms — through the ≈ 200 ms image check, a slot erase and a journal compaction, from slot A and from slot B**; print `ti.vrefint` = 1490 ± 5 %; write and read 100 calibration-size records, cut power inside an append 50 times: every boot mounts, no NMI loop (`port_flash_ecc` may count). Then fit R_WDOL, 20 power cycles. A `while(1)` build resets in < 60 ms | any WDO low pulse with good firmware; a boot loop; the hang build not reset; a record lost without a power cut |
| 3 | aux flyback alone | HV supply on DCP–DCN, 0.2 A limit, 0 → 400 V slowly, then 321–860 V; electronic loads on V24 and V15 | starts at 345 ± 15 V in < 8 s (9–12 s at the 321 V corner is normal), stops at 321 ± 15 V; **V15 14.3–15.8 V and V24 22.5–25.5 V over the whole load matrix — record it, it is the gate-bias budget**; Q_AUX V_DS,pk < 1.35 kV at 860 V, gate plateau ≥ 12 V; **short V24 for 1 s and release: the supply restarts by itself within 15 s at a 565 V and at an 800 V link** (the NCP1252 latches — it must be able to drop below V_CC(off) against the start-up string); power-up with every load connected does not latch (15 ms fault timer against a 32–51 ms soft start) | V15 outside 13.5–16.5 V; V_DS > 1.45 kV; the supply stays latched with the link up (raise the start-up string or bleed V_CC) |
| 4 | all rails, no HV | V15 / V24 from bench supplies; both boards, card, harness | each bias module +15.0 ± 0.8 V / −3 ± 0.5 V **at the driver pins and ≤ +17.5 V at 5 % load**; DRV_RDY high; every isolated 5 V within ± 5 %; fan current ≤ 0.6 A each at 100 % | DRV_RDY low; a bias < 13.2 V; a fan > 0.6 A |
| 5 | sensors and trips, no HV | (a) CT channels 2048 ± 25 counts, V channels 0 ± 20 V after the boot window. (b) 1 A / 10 A AC through each line CT: gain ± 3 %, and **phase A/B/C ↔ PWM A/B/C ↔ VAC 1/2/3**, one at a time. (c) **CT step response with a 10 A / 100 ns edge: ≤ 1 µs to 90 %, and ratio within 1 % with 5 A DC superimposed** — three samples; a fail switches the design to the drawn shunt fallback. (d) inject into every trip path and scope FLT and the PWM pin: F.01 each phase (positive in hardware, **negative through the software trip inside one PWM period**), F.11 both polarities, F.03, F.13, DESAT. (e) NTC decade box. (f) RELAY_FB by hand | trip → PWM low in < 1 µs (F.11), < 3 µs (comparators), < 2 µs (DESAT incl. soft-off start), ≤ 10 µs (negative F.01); **outputs stay off until the supervisor re-arms** | a path > 2 × its budget; a wrong polarity; outputs that come back by themselves |
| 6 | gate drive, no HV | PWM test mode; V_GS at the package pins with a spring-tip probe | +15 ± 1 V / −3 ± 0.7 V, overshoot inside +18 / −6 V; **dead time gate-to-gate at the 120 ns floor: effective ≥ 80 ns on every leg with every driver pair**, and 125 / 186 / 189 ns on leg A in phase shift; complementary pairs never both > 0 V; outputs LOW in reset, under SWD halt, with the card or the harness unplugged | effective dead time < 80 ns; a gate high in reset |
| 7 | loop inductance + double pulse | one LLC leg and one Vienna leg: ring-down first (L = (T/2π)²/C_oss), then DPT 100 → 400 → 600 → 830 V. Start at R_g,off 4.7 Ω (LLC) / 10 Ω (Vienna) **for safety only**, then step to the drawn 0 Ω. At 830 V sweep I_off **30 → 160 A** — the worst overshoot is a low current on a long loop. Sweep C_s 330 / 680 / 1000 pF on a two-die leg | external loop **≤ 10 nH** (the basis of every over-voltage and k_off number); V_DS,pk ≤ 85 % repetitive, ≤ 90 % at +6 % link; off-device V_GS < +1 V; k_off logged → `tanks.mjs` and `dielim.c`; **pick the smallest C_s that meets the line — every pF costs C_s·V²·f in the weak leg** | loop > 10 nH → do not raise power: a gate resistor costs 3–5 × k_off, which the one-die 30 kW cannot carry — decide die count or fold on the measured number |
| 8 | LLC on a current-limited supply | 100 → 300 → 650 V at ≤ 2 A, PFC off, 100–200 Ω load, PAR. Open loop at f_max with a phase-shift ramp, then closed-loop CV 150 → 400 V at ≤ 1 kW; a start from 0 V into the resistor | sinusoidal tank current; ZVS on both legs in PFM; **T-58: probe the leg-A node through phase shift at 25 / 50 / 100 % load — record the residual and sweep `LLC_DT_WEAK_K`**; no 5 kHz on V_out in a no-load CV sweep at 150 / 200 / 250 V; the link stays at its 650 V floor until the output has climbed (the reference leads the output); bank A / B within 2 %; **R_FDMP case temperature at a point that runs at f_max** | hard switching at a PFM point; F.11 nuisance trips; bank imbalance > 10 V; a magnetic > 40 K |
| 9 | Vienna on a variac | LLC off, 1–3 kW on the link. 3 × 60 → 120 → 230 → 400 VAC L-L. Log V_bus(t), the bypass instant and the inrush; then PFC at 230 VAC, link 450 V | precharge **settles** then closes with < 20 A of step, at 275 / 300 / 350 / 400 / 485 VAC and on a distorted source; sinusoidal currents in phase; **DC clamp meter < 0.5 A per phase, cold to 60 °C; a deliberate 5 V offset on one SNS_VAC channel nulls inside a second**; MID ± 5 V; THD < 5 % above 25 % load | DC > 1 A; MID drifting; F.01 below 50 % current |
| 10 | both stages on the real mains | 400 VAC, real fuses, 10 → 25 → 50 → 75 → 100 %, 15 min each, PAR 300–400 V then SER 600–800 V; IR camera | η ≥ 95 % at half load; NTCs < 85 °C; **a current probe on one link can: ≤ 6.8 A rms at 400 VAC, case < 75 °C — repeat at 340 VAC**; R_FDMP < 120 °C; magnetics < 110 °C; D_OUT < 110 °C; with a vehicle-style command (setpoint at the pack maximum, pack far below) the link follows the pack, not the command | a part over its limit; η < 93 % at half load (something is hard-switching); can case > 80 °C |
| 11 | fault injection, 25–50 % power first | output short, load dump **at an 830 V link with low-tolerance cans**, a phase lost, 20 ms / 100 ms / 1 s / 3 s interruptions **with return**, −30 % sag, CAN pulled, ENABLE dropped, a fan unplugged, NTC open / short, V24 short, main loop killed, MCU reset and power cut while delivering, discharge with AC present, a welded-bypass simulation, **one sacrificial precharge resistor across a shorted link — it must open without flame** | the documented code and a safe state every time; **no re-strike after a hardware trip**; grid return re-precharges; link never > 880 V; F.18 reported at the end of the discharge; F.21 ends a dump that cannot win in 300 ms | any undocumented behaviour; any device failure → root cause first |
| 12 | soak, corners, EMC pre-scan, hipot | 55 °C inlet, min / max line, PAR 150 V / I_max, SER 500 V at high line, low line at an 830 V link; 2 h each; LISN pre-scan; then hipot and PE bond | the folds act as the [thermal report](thermal-report.md) lists them and the junction (case + model) stays ≤ 150 °C; a declined point reads 0 A available with the thermal-derate bit, not a fault; QP margin ≥ 6 dB | — |

**Before Stage 6:** 2 × HV differential probes, a ≥ 30 MHz Rogowski / AC probe, a DC clamp meter, an optical or floating
V_GS probe, an IR camera, a LISN.

## 9. What remains open

Genuine dependencies only — each one is a thing paper cannot settle, with the assumption the design runs on meanwhile.

| Item | Why it cannot be closed on paper | The assumption made meanwhile |
|---|---|---|
| **commutation-loop inductance (C-10)** | it is a property of a layout that does not exist yet | ≤ 10 nH external is the binding layout rule, not a preference; Stage 7 measures it by ring-down before any high-power run, and a loop above 10 nH forces a choice between a gate resistor and a second 30 kW die or a fold, decided on the measured k_off |
| **the port has never run on silicon** | the register-level GD32G553 port builds, signs and passes on host plants, but no plant is the part | the worst PFC ISR is 5.8 µs static by disassembly against a ≈ 7.2 µs budget; Stage 2 (boot and watchdog timing) and Stage 5 (trip paths) are its first real test, and T-64 measures both interrupts with DWT |
| **three device classes without a datasheet (M-14)** | SG2M023120LJ, the 750 V Vienna pair and the 1200 V / 40 A JBS are specified classes, not released parts | every budget reads the RFQ acceptance line (I_DM, E_off ≤ 0.45 mJ and E_oss ≤ 110 µJ at 800 V, I_FSM), never a proxy's typical; a sample outside the line re-runs the grid before it is accepted |
| **line CT at 50 kHz and µs steps (M-17)** | no vendor publishes the step response or the DC tolerance | acceptance rows on the RFQ and Stage 5 (c): 10 A / 100 ns edge ≤ 1 µs to 90 %, ratio within 1 % with 5 A DC superimposed, three samples; shunt + iso-amp is the drawn fallback and three failures switch the design |
| **DC-link can ≥ 5.2 A at 100 kHz (M-02)** | a 5.2 A / 100 kHz 470 µF / 500 V part is at the top of what a 35 mm can offers | the RFQ line states the duty (ESR ≤ 80 mΩ); the computed 5.7 / 6.5 / 5.9 A per can at 400 VAC is inside it and the 6.7 / 7.6 / 7.0 A at 340 VAC is a **declared exceedance** with levers (taller can, or one more can per half); Stage 10 probes one can at both lines |
| **NCP1252 latch restart** | the controller latches on over-current and must then fall below V_CC(off) against its own start-up string — a component-level behaviour no simulation settles | Stage 3 shorts V24 for 1 s and requires self-restart within 15 s at a 565 V and an 800 V link; if it stays latched, the start-up string is raised or V_CC bled |
| **weak-leg residual map (leg-node probe)** | two independent switched models disagree by 2× on the residual at the same operating point | the firmware's map errs high; Stage 8 / T-58 probes the leg-A node through phase shift at 25 / 50 / 100 % load and sweeps `LLC_DT_WEAK_K` to relax it |
| snubber value on the two-die legs | per die, 330 pF and 1 nF read the same overshoot at 10–30 nH, and every pF costs C_s·V²·f in the weak leg | the drawn values stand; Stage 7 picks the smallest C_s that meets the overshoot line at the real loop |
| load dump at an 830 V link (M-32) | it reproduces on one independent model (856–872 V) and not on the repo's plant (833 V) | both ₹0 firmware levers are in; Stage 11 with low-tolerance cans is the arbiter, and the link must never exceed 880 V |
| the rail's movement after boot | the internal reference cannot be sampled inside the 10 µs control frame (it needs ≥ 17.1 µs), so VREFP — the ADC's and the DACs' reference — is measured once at boot | ≤ ±1 % of post-boot drift for the TPS54202 class (its ±1.5 % reference band spans −40…125 °C, plus line / load regulation), carried by every reading and every comparator code — ≈ ±25 V at F.03, ±22 V at F.13 LOW, inside the ±3 % chain class of the threshold budget; T-26 sweeps VREFP ±3 % and requires the measured crossings to follow the corrected codes |

## 10. Reproduction

```bash
sh calculations/run-all.sh          # every gate, exit 0
node calculations/review-checks.mjs # the closure assertions
sh firmware/run_tests.sh            # the host binaries under ASan/UBSan
sh firmware/port/gd32g553/build.sh  # Cortex-M33 images, -Werror
```

> [!TIP]
> **How this page is checked** — every CRITICAL and MAJOR row in §3 names the gate or bench stage that fails if the fix is undone, and `review-checks` asserts the closures against the pages and engines that must still carry them.

---

<div align="center">
<sub><a href="assumptions.md">← Decision Register</a> &nbsp;·&nbsp; <a href="README.md">🧭 Documentation hub</a> &nbsp;·&nbsp; <a href="interconnect.md">Two-Board Sandwich & Interconnect →</a></sub>

<sub>Vectivolt DC-Modules · documentation rev E84 · every number reproduces with <code>sh calculations/run-all.sh</code></sub>
</div>
