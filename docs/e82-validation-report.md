<img src="assets/banner-platform.svg" alt="" width="100%"/>

# 🛡️ E82 Independent Validation & Production Hardening

<sub>Twelve independent reviews that trusted nothing in the repository, eleven critical findings, and the firmware-first corrections — with the decision table for every part that was proposed</sub>

<p>
  <img src="https://img.shields.io/badge/status-LIVE__SPEC-2ea44f?style=flat-square" alt="status: live specification"/>
  <img src="https://img.shields.io/badge/rev-E82-f2b705?style=flat-square" alt="revision E82"/>
  <img src="https://img.shields.io/badge/updated-2026--09--17-8b949e?style=flat-square" alt="updated 2026-09-17"/>
  <img src="https://img.shields.io/badge/reviewers-12_·_9_refuted-d19a00?style=flat-square" alt="reviewers: 12 · 9 refuted"/>
  <img src="https://img.shields.io/badge/critical-11_found_·_10_fixed_·_1_needs_the_layout-e3763c?style=flat-square" alt="critical: 11 found · 10 fixed · 1 needs the layout"/>
  <img src="https://img.shields.io/badge/firmware-330_checks-2ea44f?style=flat-square" alt="firmware: 330 checks"/>
</p>

> [!NOTE]
> **Purpose** — the E82 register. E81 asked "is the design right?"; E82 asked a harder question of the same repository —
> *would the first prototype actually work, and is every rupee in it earning its place?* — with one rule: **no document, gate,
> test or simulation in this repository counts as evidence.** Twelve independent reviewers re-derived the module from the
> schematic code, the C firmware, manufacturer datasheets and first principles; the lead re-verified every CRITICAL claim
> before accepting it and rejected the ones that did not survive. Phase 2 then **implemented** the corrections under the
> owner's directive: *do not over-engineer — firmware wherever firmware is safe and fast enough, independent hardware only
> where reaction time, device survival or failure-mode independence demands it, and stay competitive with Chinese 30–50 kW
> modules.*
>
> **Gate coupling** — every number here reproduces with `sh calculations/run-all.sh` (new at E82: `control/fw-constants-sync`,
> `current-coordination [DCLINK-VIENNA]`, `fault-energy [RESERVOIR]`, the Vienna-die fold and the per-die weak-leg term in
> `envelope-grid`, the E82 rows of `review-checks`) and `sh firmware/run_tests.sh` (330 checks under ASan/UBSan across seven binaries: `boot_test` 22 · `host_sim` 122 · `ctl_test` 20 · `proto_test` 42 · `hal_test` 45 · `app_test` 29 · `e81_test` 50). The reviewer reports, the
> lead's evidence scripts and the knowledge graph are archived with the session in `E82-independent-validation/`.

## At a glance

| | |
|---|---|
| **Question** | would the first prototype work, protect itself, and cost what it should? |
| **Method** | 12 independent reviews (10 × Opus 5, 2 × Sonnet 5) + lead re-verification + a Graphify knowledge graph of the corpus (3,222 nodes · 5,637 edges) |
| **Found** | **11 CRITICAL** (nine of them firmware, all ₹0) · 33 MAJOR · ≈ 60 MODERATE / MINOR · 9 reviewer claims **rejected** after checking |
| **Answer** | the power-stage architecture and its arithmetic are sound; **the first prototype would not have started**, and once started would not have been safe — five independent defects each stopped it delivering power, four made a running module unsafe, one left die survival to a heatsink sensor that cannot see the die |
| **Fixed at E82** | every CRITICAL and every firmware MAJOR is implemented and tested; hardware value / rating corrections are drawn, costed and gated |
| **Cost** | **+₹80 / +₹133 / +₹133 / +₹133 per module** (+0.25…0.37 %) — output bleeder, ADC pin filters, iso-amp output resistors, a correctly rated link damper; −4 balance resistors on 40 / 50 kW |
| **Firmware** | 330 checks under ASan/UBSan across seven binaries: `boot_test` 22 · `host_sim` 122 · `ctl_test` 20 · `proto_test` 42 · `hal_test` 45 · `app_test` 29 · `e81_test` 50 · target build clean |
| **Still needs hardware** | loop inductance and the DPT (C-10), the line-CT step response (M-17), the can RFQ (M-02), a real datasheet for three device classes (M-14) — §11 |

## 0. How to read this page

§1 is the answer. §3 lists every CRITICAL with what was wrong, how it was proven and what was changed. §4 is the decision
table the owner asked for — for every protection or part that was proposed: what it prevents, whether firmware can do it,
how fast it must act, how likely and how bad, what it costs, what it does to efficiency, and what commercial modules do.
§5 says where hardware stops and firmware starts. §8 compares the result with the reference Chinese module. §10 is the
bring-up sequence; §11 is what is genuinely still open.

## 1. Executive summary

**Sound.** Filter / precharge / Vienna / LLC / matrix topology and every polarity in the built netlists; the TPS3430 strap;
the NCP1252**D** behaviour and the aux cold-start budget; every `meas.c` scaling constant; the F.11 window ladder; the
magnetics against vendor data; the tank (f_r, Z0, currents within 1–2 % of an independent ngspice model with datasheet
C_oss); the efficiency ledger within 0.2 pt; link, precharge and discharge energies; the PFC loop coefficients; the relay
matrix and its exclusion gate; TonHe V1.2 byte-exact; CAN bit timing; the signed A/B boot logic; the GD32G553's resources.

**Would not have started.** (C-01) the window watchdog is violated all along the boot path — one P-256 verification is
≈ 100 ms un-serviced against a 23.4 ms window, twice per boot; (C-02) E81's "bipolar" F.01 loads a comparator reference
below mid-rail into a non-inverting comparator on an active-high fault input — a fault asserted in normal operation;
(C-03) VREFINT is converted with a 132 ns aperture where the part needs ≥ 17.1 µs — F.29 100 ms after every boot; (C-04)
the journal's 12-byte header puts every record on a flash row that is already programmed — nothing persists, so the
calibration E80 made mandatory can never be stored; (C-05) the bypass closes at 0.97 × √2 × V_rms, which flat-topped mains
never reaches — F.20, LOCK after five tries.

**Would not have been safe.** (C-06) both watchdogs were serviced from SysTick behind a sticky flag — a hung main loop was
never detected while both control interrupts kept switching; (C-07) a latched code survived shutdown → wake, after which
the module ignored STOP and a pulled CAN cable; (C-08) `latch()` dropped every later fault, so a DESAT that followed a
grid sag was lost and the module auto-restarted into the faulted leg; (C-09) the control interrupts re-armed the outputs
10 µs / 100 µs after every hardware trip; (C-11) the thermal grid's folds — including a corner its own model reads at
229–335 °C *at any load* — were implemented by nothing: the derate ladder reads a heatsink NTC, and these corners heat a
die 80–170 K above a sink that is still at 75 °C.

**Root cause.** The port layer and both control interrupts have never run on silicon, and every host plant was kinder than
the hardware: byte-granular flash, unlimited watchdog time, ideal comparators, a sinusoidal grid, a DC-coupled current
sensor, a link that ramped for ever. E82 replaced the plants that hid defects (row-granular program-once flash, a
high-pass current sensor, a link that stops at the crest) — the negative runs are recorded with each fix.

## 2. Method

| Layer | What it did |
|---|---|
| **Knowledge graph** | Graphify over the engineering sources (generated output, PDFs and SPICE dumps excluded). Its own finding: three edges between `firmware/` and `calculations/`, none to the schematic — every ADC scale, tank constant and loop gain in the C was hand-copied (M-29 → the `fw-constants-sync` gate) |
| **Twelve reviewers** | power path · control hardware · magnetics · SiC and thermal · MCU ↔ firmware · state machine and protection · control loops · boot and CAN driver · independent LLC simulation · independent front-end simulation · benchmark and cost · CAN protocol. Each with its own scripts and datasheets; the two simulation reviewers were forbidden the repo's decks and test plants |
| **Lead verification** | every CRITICAL re-proven before acceptance: instruction-accurate Cortex-M33 emulation of the bootloader's own `p256.c` (12.7 M instructions per verification); capacitor current from the firmware's actual modulator against Kolar's closed form; a high-pass-sensor model of the line-current loop; datasheet extraction for TPS3430, NCP1252, NSI66x1A; the repo's own DPT deck re-run at realistic loop inductance |
| **Evidence tags** | `DATASHEET` · `CALCULATED` · `SIMULATED` (actually run) · `CODE-VERIFIED` · `ASSUMED` · `HW-TEST` |
| **Phase 2** | six implementers on disjoint file sets, patches merged and re-tested by the lead; every behavioural change carries a check that fails without it |

## 3. CRITICAL findings and what was done

| # | Finding | Evidence | Correction (all ₹0) |
|---|---|---|---|
| **C-01** | window watchdog violated along the boot path: P-256 verify ≈ 90–105 ms un-serviced (×2 slots), slot erase without service, 32–53 ms application hand-off, crystal wait 20–40 ms | `SIMULATED` emulation of `p256.c`: 12,733,076 instructions; TPS3430 `DATASHEET` t_WDU,min 23.375 ms | service inside the ladder and the inversions (longest gap 0.6 ms), 4 KB hash pieces, RAM-resident flash primitives that service before every operation and after every erase, start-up services across the hand-off, crystal wait bounded by DWT to 10 ms |
| **C-02** | F.01 reference below AVMID = standing fault | `CODE-VERIFIED` | positive reference only + a 100 kHz software magnitude trip on the raw current; Σi = 0 makes the other two comparators the hardware backstop for the negative polarity |
| **C-03** | VREFINT sampled for 132 ns (needs ≥ 17.1 µs) → F.29 at boot | `DATASHEET` | out of the 100 kHz ring; read once at boot at 28.5 µs; the part's factory word replaces the 1.20 V nominal |
| **C-04** | journal re-programs 64-bit ECC rows → nothing persists → F.30 for ever | UM §2.3.8; negative run: 10 checks fail with only the layout reverted | 16-byte header, 8-aligned entries, commit marker alone in the last row; the host flash models are now row-granular and program-once |
| **C-05** | bypass rule unreachable on flat-topped mains | `CALCULATED` link settles at 0.949–0.993 of the sinusoidal crest | close on a **settled** link (two 20 ms steps < 3 V and ≥ 0.85 × crest) |
| **C-06** | hung main loop never detected | `CODE-VERIFIED`; 500 services in 5 s of dead loop | permission is a token purse the loop must keep paying into; a dead loop resets ≤ 30 ms + one window later |
| **C-07** | stale latch after shutdown → wake: module cannot be stopped | reproduced | wake clears the latch; a LOCK survives |
| **C-08** | `latch()` drops later faults | `CODE-VERIFIED` | a LATCH-class row replaces a self-clearing one |
| **C-09** | hardware trips re-armed by the control interrupts | `CODE-VERIFIED` | `trip_n / trip_ack`: outputs stay off until the supervisor has seen and latched the trip |
| **C-10** | over-voltage and turn-off basis assumes a 5 / 7 nH commutation loop | the repo's own DPT deck re-run by the lead at 10–30 nH, per-die currents: R_g,off 0 Ω reads 78–92 % of 1200 V at 10 nH and **90–103 % at 20–30 nH**; R_g,off 4.7 Ω holds 75–90 % at any loop but k_off rises 3–5× — thermally impossible on the one-die 30 kW | the ≤ 10 nH layout rule is **load-bearing, not a preference**: ring-down measurement before any high-power run (Stage 7); if the loop measures > 10 nH the choice is a gate resistor **and** a second 30 kW die or a fold — decided on the measured k_off, not before. `HW-TEST` |
| **C-11** | the thermal grid's folds exist only in the grid | grid's own rows: two-die SKUs at 150 V in phase shift 229–335 °C at any load, accepted as "a documented spec limit"; `core/ctl.c` availability = rating × NTC ladder × input derate | (a) **the cause**: E81 gave the weak bridge leg a 200–900 ns dead time; at load it swings on the decayed tank current through L_r alone, reaches its valley in ≈ a quarter period and swings *back* — independent switched model: best edge 90–130 ns (30 kW) / 90–270 ns (50 kW), loss 50 → 9 W per die at the worst 30 kW point → `weak_dead_s()` = 0.82·(π/2)·√(L_r·C_node) = 125 / 186 / 189 ns. (b) **the guard**: `hal/dielim.c`, a junction observer on the measured base temperature with the grid's own loss terms; proportional fold 142–150 °C, a point the fold cannot cool is *declined* and says so. (c) the link reference now **leads the measured output** instead of jumping to the command — vehicles send their maximum voltage as the setpoint, which parked the link at 830 V over a 330 V pack and pushed the bridge into phase shift in the middle of the mainstream range |

## 4. Does it earn its place? — the decision table

Seven questions per item: **(1)** failure prevented · **(2)** can firmware do it · **(3)** response time · **(4)** probability ×
consequence · **(5)** cost · **(6)** efficiency / density · **(7)** what commercial modules do (reference: InfyPower REG1K0135A2
teardown — Si super-junction PFC switches on plain low-side drivers, one 33 mΩ SiC die per LLC position at 40 kW, shunt +
AMC1200 sensing, LMV393 comparators, gate transformers and **no DESAT**, opto-regulated aux, 680 µF / 475 V cans, series
output diodes, active output discharge, three fans, potting).

| Proposal | Decision | Why |
|---|---|---|
| passive output bleeder 3 × 150 kΩ behind D_OUT | **added** ₹9 | 1000 V / 4.7 J stayed on the studs ≈ 100 s and no commanded path reaches past the diode; the reference has an active one |
| 1 nF at every ADC pin + 100 Ω at the iso-amp outputs | **added** ₹6 | 22 channels sampled for 132 ns at the end of a harness beside PWM ways — aliasing and kick-back are analogue |
| link damper resistor ≥ 3 W → **≥ 50 W TO-247** | **re-rated** +₹80 | it dissipates 7 / 16 / 36 W whenever the bridge runs at f_max (2·f_sw on the entry-film resonance); the repo's own deck reads 35.6 W. 0.68–2.2 Ω dissipate the same 40 W and ring more — the power is the source's |
| X-cap bleed star 47 k → 33 k | **value** ₹0 | > 5 s to 60 V since E68's third X stage |
| balance network 2 × (2 × 22 k) → one 47 k string per module | **simplified** −₹4…12, −3…10 W standby | firmware watches MID in every energised state and the Vienna balances actively; service label 10 → 15 min |
| precharge resistor: flameproof, **fail-open** | **RFQ row** ₹0–5 | a shorted link puts 4.8–8.4 kW on it and nothing in the module can disconnect it — the part opening without flame *is* the protection |
| fan electrical class ≤ 14 W | **RFQ row** ₹0 | the 110 W aux is sized on it; a 25 W fan overloads the four-fan SKU into the NCP1252's latched over-current |
| DESAT-pin Schottky clamps, 14 diodes | **rejected** | the vendor's own mitigation is the 100 Ω series resistor already fitted; bench check only |
| second DESAT leg for the Vienna's other polarity | **rejected** | needs a prior diode failure; diode chains form a *minimum* selector and would mask the protection that exists; the reference has no DESAT at all |
| mirror RCD clamps on the 30 / 40 kW production BOM | **not added** | footprints exist; the DPT at the real loop decides, and R_g is free |
| gate-bias preload resistors, TL431 / opto regulation of V15 | **rejected** | the rise is idle-only and inside abs-max; the BOM already carries a ±2 % zener; an 830 V reinforced opto is not a ₹6 part |
| extra DC-link cans | **rejected for now** | the can is re-specified for its real duty (≥ 5.2 A at 100 kHz, ESR ≤ 80 mΩ); the 340 VAC corner is a declared exceedance with levers |
| hardware zero-current detector for capacitive mode | **rejected** | the ZVS-boundary f_min table does it in firmware |
| e-stop input, coolant-flow switch, open-drain fan stage | **not added** | cabinet-level function · NTC rate-of-rise covers it · order 3.3 V-PWM fans |
| F.11 threshold 140 → 120 A | **rejected** | I_DM is a thermally limited repetitive rating; a single < 1 µs excursion to 105 % is far inside the short-circuit withstand, DESAT stands behind it, and 12 % headroom invites nuisance trips |
| link maximum 830 → 800 V | **rejected** | it eats the 2 % gain margin at the 500 V bank edge; the cure for overshoot is the loop |
| shunt + iso-amp PFC current sensing | **deferred to data** | both commercial references use shunts; CT acceptance rows (50 kHz amplitude / phase, ≤ 1 µs step, ≥ 5 A DC tolerance) are on the RFQ — three failed samples switch the design |

**Kept, because the owner's own rule demands hardware there:** DESAT + Miller clamp + UVLO on the four LLC drivers (leg
shoot-through never passes the tank CT); the F.11 window comparator (150 A/µs); the on-chip comparators for F.01 / F.03 /
F.13; driver UVLO → DRV_RDY; fuses, MOV / GDT, precharge with auxiliary-contact feedback; the 74HC02 matrix exclusion; D_OUT.

## 5. Where hardware stops and firmware starts

| Event | Time scale | Owner | Path |
|---|---|---|---|
| leg shoot-through, die short | 2–3 µs | **hardware** | driver DESAT → soft-off, DRV_RDY low → GATE_EN |
| output short, tank over-current | ≈ 1 µs | **hardware** | TLV3202 window → HRTIMER fault → all outputs idle |
| line over-current, link and output over-voltage | µs | **hardware** | on-chip comparators → HRTIMER fault; the supervisor latches, and **nothing re-arms until it has** (C-09) |
| gate-drive under-voltage | µs | **hardware** | driver UVLO |
| hung firmware | 30–55 ms | **hardware** + firmware | TPS3430 window and the internal watchdog, fed only while the main loop pays (C-06) |
| negative-polarity line over-current | 10 µs | firmware | 100 kHz magnitude trip; Σi = 0 gives a hardware answer at 2 × I_trip |
| die over-temperature at a point the NTC cannot see | 0.1–1 s | firmware | junction observer → fold → decline (C-11) |
| grid return after an interruption | ms | firmware | every latch opens the bypass; recovery re-precharges (M-01) |
| line over-current at a line return (the EMI filter rings above a link that sagged to its crest: 121–199 A pk on a stiff site) | µs + 2 s | **hardware** trips, firmware classifies | inside 500 ms of a disturbed line F.01 is filed as F.08 — self-recovering, uncounted, re-precharged; on a quiet line it still latches (H2-2) |
| DC in the line current | cycles | firmware | per-cycle mean removal on the sensed voltages and the CT channels (M-18) |
| load dump, low-voltage CV stability, share trim | ms | firmware | integrator bound and skip window · loop-gain ceiling from the modulator's own sensitivity · trim slower than the peer refresh |
| relay weld, stuck discharge, aux rail missing, command-relative over-current, grid-caused bus collapse | ms–s | firmware | new or corrected FSM rows (F.18, F.21, F.26, F.15, F.05 → F.07/8/9) |

## 6. What changed in the design

**Firmware** — boot: serviced signature check, RAM-resident flash primitives, journals moved to bank 1, listen-only until
traffic is heard, drain-until-empty, EPRSTF in the reset streak, full 96-bit identity, production build refuses the
development key, two-button service entry for a TonHe-profile module, NMI on a torn journal row returns instead of
looping. Port: VREFINT out of the ring, vector table in RAM, control interrupt on the ADC end-of-sequence (7.2 µs of
budget, was 5.0), 120 ns dead-time floor, fault inputs locked, LVD at 2.75 V, crystal wait bounded, no PLL re-lock after
the jump. Control: mean removal (23 A → 0.17 A of DC on the high-pass-sensor plant), loop-gain ceiling (|T(−1)| 1.79 →
0.43), tank rms from the operating point instead of an aliased ADC channel, weak-leg dead time, junction observer, link
reference leads the output. FSM: settled-link bypass, bypass opens on every latch, LATCH replaces AUTO, wake clears a stale
latch, trips held until acknowledged, weld / discharge / aux / over-current rows, a line-return F.01 filed as the grid's, F.35 needs three missed ticks, fan
groups staggered. Protocol: short C_M_24 confirmed 0x00, UID-mixed TonHe phase, reboot refused while a stage is live.

**Hardware** — R_BO1…3 output bleeder; C_ADC0…21 and R_xO / R_SHOP/N on the analogue ways; one 47 k balance network per
module; 33 k star; R_FDMP a heatsink-clipped 50 W part; BOM lines re-issued for the snubber resistor (3 W pulse), the
HV chip resistors (≥ 500 V element voltage), Q_AUX (a 1700 V SiC part specified at a 12–15 V gate), the gate-bias modules
(a class with a light-load acceptance row — "QA01C-15" was not an orderable part), the link can, the line CT, the
precharge resistor, the damper capacitor and the fans. The 30 kW LLC snubber BOM line said 1 nF against a 330 pF drawing.

**Gates** — `fw-constants-sync` (28 rows: firmware ↔ schematic ↔ tanks ↔ the SPICE deck ↔ the thermal grid, incl. the weak-leg residual map ≥ every phase-shift row the deck commits);
`[DCLINK-VIENNA]`: the Vienna's own 50 kHz capacitor current, which was in no budget; `[RESERVOIR]` output store; the
thermal grid gained the Vienna modulation-index term, the datasheet R_DS(on) slope, a Vienna-die fold and a corrected
per-die weak-leg term (E81 charged every weak-leg die twice); the magnetics pages read their D2 / D3 values instead of
carrying pre-E81 strings; the SPICE deck programs the dead times the firmware programs.

## 7. Recalculated numbers

| Quantity | Before | E82 | Basis |
|---|---|---|---|
| P-256 verification, un-serviced | "≈ 9 ms" | **90–105 ms** → 0.6 ms longest gap | instruction-accurate emulation |
| DC-link can ripple, per can, 400 VAC | 0.8–2.4 A (LLC share only) | **5.7 / 6.5 / 5.9 A**; 6.7–7.6 A at 340 VAC | firmware's own modulator, Kolar closed form, impedance share at 50 kHz |
| weak-leg dead time in phase shift | 208–900 ns | **125 / 186 / 189 ns** | L_r against the leg's node capacitance; independent sweep windows |
| weak-leg loss, 30 kW PAR150 full load | 50 W per die | **9 W** per die at the best edge | independent switched model |
| link damper resistor | 1.8 W (≥ 3 W part) | **7 / 16 / 36 W** (≥ 50 W part) | two independent link models |
| DC line current from a 3-LSB sense offset | unbounded by design | 23 A → **0.17 A** | high-pass-sensor plant |
| LLC CV loop, worst \|T(z = −1)\| | 1.79 (−5 dB) | **0.43 (+7 dB)** | every SKU × mode × link × demand |
| control interrupt budget | 5.0 µs | **7.2 µs** | ADC end-of-sequence trigger |
| passive link discharge to 60 V | 6.2 / 3.7 / 4.9 min | 6.2 / 7.4 / **9.9 min** (11.9 at C + 20 %) → label **15 min** | one balance network per module |
| output studs to 60 V | ≈ 100 s | **12 s** | 450 kΩ bleeder |
| standby | — | −3.2 W (30 kW) / −10.4 W (40 / 50 kW) | balance network |
| Vienna die, 50 kW air, 285 VAC / 830 V link, 55 °C | 145 °C | 164 °C unfolded → **fold to 86 %** | modulation-index term + R_DS(on) slope |

## 8. Against the reference Chinese module

Reference: InfyPower REG1K0135A2, 40 kW, ChargerLab teardown (re-read at E82 for facts, not for design) — the full
comparison lives in the [teardown benchmark](benchmark-infypower-teardown.md); this table is what E82 adds to it.

| Axis | Reference 40 kW | This module (40 kW row) | E82 verdict |
|---|---|---|---|
| PFC switch | Si super-junction 600 V / 22 mΩ on plain low-side drivers, SiC boost diodes | SiC 750 V pair on an isolated DESAT driver | **they are cheaper here.** Si-SJ in the Vienna is the largest philosophy-neutral cost lever left (≈ ₹600–1,000): the boost diodes stay SiC so the switch sees no recovery, and 50 kHz suits SJ parts. Needs its own DPT and thermal run — registered, not executed |
| PFC protection | comparators on shunts, **no DESAT anywhere** | DESAT on three Vienna channels + comparators | dropping DESAT on the Vienna channels (≈ ₹150) is defensible — no shoot-through path exists in a Vienna leg — but costs driver commonality; decide before layout |
| LLC bridge | one 33 mΩ die per position at 40 kW, low-Z0 tank, gate transformers | two 23 mΩ dies per position, isolated drivers with DESAT | ours runs cooler and survives a leg fault; theirs is ≈ ₹1,500–3,000 cheaper. The low-Z0 tank is a magnetics + control redesign (next revision) |
| Current sensing | shunt + AMC1200 | line CTs + output shunt | theirs has DC response; ours needs the E82 mean removal and a CT acceptance test (M-17), shunts are the drawn fallback |
| Link capacitors | 680 µF / 475 V cans | 470 µF / 500 V cans, now bought against their real 50 kHz duty | equal once the RFQ line is met; their can class is the fallback |
| Output | film + choke + electrolytic, series diodes, **active** discharge | film only, series diode, passive bleeder (E82) + active link discharge | ours has no electrolytic to age at the output; theirs discharges the studs faster |
| Aux supply | 900 V Si FET, opto feedback | 1700 V SiC from the full link, primary-side regulation | ours starts from the link with no mains tap; theirs is ≈ ₹150–200 cheaper |
| Control | two DSPs + analogue muxes | one Cortex-M33 with a window watchdog | ours is simpler and cheaper; E82 made the single controller's supervision real (C-06, C-09, C-11) |
| Self-protection in firmware | not visible from a teardown | operating-point fold from a junction observer, grid-return re-precharge, DC-injection removal, trip hold, weld and stuck-discharge detection | **ours is ahead** — this is where E82 spent its effort, at ₹0 |
| Input range | 260–530 VAC | 285–475 VAC, derated below 330 VAC | theirs is wider; ours is a deliberate SiC / copper / EMI saving |
| Efficiency | > 96 %, peak > 97 % | 96.3 % at full power, peak 97.7–97.8 % | equal |
| Density | 3.96 kW/L, 15.5 kg, potted | ≈ 2.1–2.6 kW/L estimated, serviceable | **theirs wins**; a layout-phase lever |
| Cost at volume | ≈ ₹35 k street | ₹36,103 India basis · ≈ ₹29.5 k China RFQ basis | competitive; E82 added 0.3–0.4 % and removed the failure modes that would have cost far more in the field |

**Cost-down levers found and not executed** (each needs an owner decision or bench data): Si-SJ Vienna switches
(≈ ₹600–1,000) · no DESAT on the Vienna channels (≈ ₹150) · TPS3430 as DNP once EVT proves the internal watchdog with
the token purse (≈ ₹35–40) · low-Z0 tank, back to one die per position on 40 / 50 kW (≈ ₹1,500–3,000, next revision) ·
sendust cores from KDM / POCO / CSC for D1 (≈ ₹1,000–1,400) · PV-driver instead of TLP152 + isolated bias on the discharge
FET (≈ ₹50) · active link discharge as a variant (≈ ₹350–400) · a 900 V Si aux FET fed from a lower node (≈ ₹150–200).

## 9. Readiness verdicts

Scale: NOT READY · READY FOR BENCH BRING-UP · READY FOR LOW-POWER TEST · READY FOR FULL-POWER PROTOTYPE · PRODUCTION-CANDIDATE.

| Area | Before E82 | After E82 | What still gates the next step |
|---|---|---|---|
| Power hardware | low-power test | **low-power test** | loop inductance (C-10), can RFQ (M-02) |
| Magnetics | low-power test | **low-power test** | winder quotes against the corrected D2 drawing; matched L_m pairs |
| SiC switching | bench bring-up | **bench bring-up** | DPT at the measured loop decides R_g, C_s and the 30 kW die count |
| Thermal | low-power test | **low-power test** | T-38 (R_th under the tab), T-04 (base temperature); the folds are now real |
| Control hardware | bench bring-up | **bench bring-up** | V15 matrix, CT step response, NCP1252 latch behaviour |
| MCU capability | full-power prototype | **full-power prototype** | measure the interrupt budget with DWT |
| Firmware | **not ready** | **bench bring-up** | the port has still never run on silicon — Stage 2 and Stage 5 are its first test |
| Hardware ↔ firmware coordination | **not ready** | **bench bring-up** | comparator / trip paths proven at Stage 5 |
| Protections | **not ready** | **low-power test** | fault injection, Stage 11 |
| Communications | low-power test | **low-power test** | — |
| Control-loop stability | not ready below 300 V | **low-power test** | Stage 8 CV sweep at 150–250 V |
| Manufacturability | not ready | **not ready** | device freeze, layout, production programming flow (now specified) |
| First prototype | bench bring-up after fixes | **bench bring-up** | — |
| Production | not ready | **not ready** | EMC, safety, calibration, capacitor life, sourcing |

## 10. First-prototype bring-up plan

**Ground rules.** One change at a time; a stage is entered only when the previous stage's exit list is written down. HV
work: isolated differential probes (≥ 1.5 kV), discharge stick, a second person, a polycarbonate shield over the SiC
rails from Stage 6. Sources in order of use: bench supply 30 V / 5 A → isolated HV DC supply 0–900 V with a current limit
(≤ 0.5 A until Stage 8) → three-phase variac + isolation transformer + 3 × 10 A breakers → mains through the real fuses
only at Stage 10. Bring up the 30 kW first (fewest dies). **R_WDOL unfitted and DESAT reporting only until Stage 5 has
proven both.** Production programming never lifts R_WDOL: the fixture toggles `TPWDI` every ≈ 10 ms for the SWD session.

| # | Stage | Do | Expect | STOP if |
|---|---|---|---|---|
| 0 | visual / continuity | polarity of every electrolytic, TVS, DESAT diode, D_OUT, clamp diode; pin 1 of NSI6611 / AMC / NSI1200, bias modules, TPS54202, TPS3430, TLP152, VOM1271; creepage slots clean. DCP–DCN > 150 kΩ (one 188 k balance string ∥ dividers), halves within 2 %, OUTP–OUTN ≈ 450 kΩ (the E82 bleeder), each gate–Kelvin 10 k, rails > 100 Ω, PE–DGND 1 MΩ | as listed | any rail < 100 Ω, half-link mismatch > 5 %, a gate–Kelvin off by > 5 % |
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
| 11 | fault injection, 25–50 % power first | output short, load dump **at an 830 V link with low-tolerance cans (the M-32 arbiter)**, a phase lost, 20 ms / 100 ms / 1 s / 3 s interruptions **with return**, −30 % sag, CAN pulled, ENABLE dropped, a fan unplugged, NTC open / short, V24 short, main loop killed, MCU reset and power cut while delivering, discharge with AC present, a welded-bypass simulation, **one sacrificial precharge resistor across a shorted link — it must open without flame** | the documented code and a safe state every time; **no re-strike after a hardware trip**; grid return re-precharges; link never > 880 V; F.18 reported at the end of the discharge; F.21 ends a dump that cannot win in 300 ms | any undocumented behaviour; any device failure → root cause first |
| 12 | soak, corners, EMC pre-scan, hipot | 55 °C inlet, min / max line, PAR 150 V / I_max, SER 500 V at high line, low line at an 830 V link; 2 h each; LISN pre-scan; then hipot and PE bond | the folds act as the [thermal report](thermal-report.md) lists them and the junction (case + model) stays ≤ 150 °C; a declined point reads 0 A available with the thermal-derate bit, not a fault; QP margin ≥ 6 dB | — |

**Before Stage 6:** 2 × HV differential probes, a ≥ 30 MHz Rogowski / AC probe, a DC clamp meter, an optical or floating
V_GS probe, an IR camera, a LISN.

## 11. What remains open — genuine dependencies only

| Item | Why it cannot be closed on paper | The assumption made meanwhile |
|---|---|---|
| commutation-loop inductance (C-10) | it is a property of a layout that does not exist yet | ≤ 10 nH external is the binding layout rule; Stage 7 measures it before any high-power run |
| snubber value on the two-die legs | the repo's DPT convention put the whole position current in one die; per die, 330 pF and 1 nF read the same overshoot at 10–30 nH, and every pF costs C_s·V²·f in the weak leg | the E81 values stay drawn; the bench picks **the smallest C_s that meets the overshoot line at the real loop** |
| weak-leg residual map | two independent switched models disagree by 2× on the residual at the same point | the firmware's map errs high; T-58 (leg-node probe) relaxes it |
| three device classes without a datasheet (M-14) | SG2M023120LJ, the 750 V Vienna pair, the 1200 V / 40 A JBS | every budget reads the RFQ acceptance line, not the proxy's typical |
| line CT at 50 kHz and µs steps (M-17) | no vendor data | acceptance rows on the RFQ; shunt + iso-amp is the drawn fallback |
| DC-link can (M-02) | a 5.2 A / 100 kHz 470 µF / 500 V can is at the top of what a 35 mm can offers | the RFQ line states the duty; taller can or + 1 can per half are the levers; 340 VAC is a declared exceedance |
| load dump at 830 V (M-32) | reproduces on one independent model (856–872 V) and not on the repo's plant (833 V) | both ₹0 levers are in; the bench row is the arbiter |
| whether a same-bank flash operation stalls the bus or faults it | the manual does not say | the design no longer depends on the answer |

## 12. Reproduction

```bash
sh calculations/run-all.sh          # every gate, exit 0
node calculations/review-checks.mjs # 154 closure assertions
sh firmware/run_tests.sh            # 330 checks
sh firmware/port/gd32g553/build.sh  # Cortex-M33 images, -Werror
```

The reviewer reports, the lead's evidence (`boot-watchdog-budget/`, `dclink-ripple/`, `ct-dc-blindness/`), the
knowledge graph and the decision register with every rejected claim are in `E82-independent-validation/` beside this
repository.

---

<div align="center">
<sub><a href="e81-validation-report.md">← E81 Full-System Validation</a> &nbsp;·&nbsp; <a href="README.md">🧭 Documentation hub</a> &nbsp;·&nbsp; <a href="interconnect.md">Two-Board Sandwich & Interconnect →</a></sub>

<sub>Vectivolt DC-Modules · documentation rev E82 · every number reproduces with <code>sh calculations/run-all.sh</code></sub>
</div>
