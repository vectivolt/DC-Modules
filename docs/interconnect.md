# Two-Board Sandwich Architecture & Interconnect (E17, customer directive 2026-09-04)

Each module = **AC-DC board (lower)** + **DC-DC board (upper)**, component faces toward each
other in the housing, heatsink surfaces outward (power semiconductors clamp to the outer
extrusions; magnetics stand in the inter-board volume). Supersedes the single-board §30 rule.

## Board contents

| | AC-DC (lower) | DC-DC (upper) |
|---|---|---|
| Power | AC studs, fuses, MOV Δ, 2× 3-φ CM stages + X/Y, precharge (2× 33 Ω + 2-pole bypass, E14 rev B), N× Vienna lanes, split DC link, bus discharge | film commutation caps, 3N× LLC legs, tanks + N×3 transformer sections, dual JBS banks, bank caps, S/P matrix (+pre-insertion, K_OUT), output filter/shunt/studs |
| Control | **MCU-PFC**, line CTs, AC/bus HV dividers, NTC ×2, fans ×2(×4), aux flyback (bus-fed from DCP→MID, E20), coil driver (KPRE, QDIS) | **MCU-LLC**, resonant CTs, bank/output dividers, output iso-shunt, NTC ×2, coil driver (6 relays), isolated CAN, **HMI: 2 buttons + 2-digit 7-seg** |

## Power interconnect (bolted, no connector)

3× M8 stud pairs, board-to-board pillars: **DCP, DCN, PE** (midpoint stays on AC-DC board).
Currents 39/78/156 A DC at 800 V — pillar + 2× M8 with belleville washers, torque 12 N·m,
joint R < 50 µΩ each (EOL milliohm check). Creepage stud-to-stud ≥ 14 mm (§33 doc).

## Signal harness (JICA ↔ JICB, 16-way, 300 mm shielded)

| Pins | Signal | Notes |
|---|---|---|
| 1,2 | +24 V | fans/relays rail, 2 A |
| 3,4 | GND (control) | single-point control-ground bond lives on AC-DC board |
| 5,6 | +15 V | bias/logic feed for DC-DC board (local 3.3 LDO there) |
| 7,8 | LINK_TX/RX | internal UART link, CRC16+seq+50 ms timeout (§22) |
| 9 | GATE_EN | global enable, active high, pull-down both ends |
| 10 | PWM_KILL | hardware kill line, open-drain wire-OR both MCUs + comparators |
| 11,12 | FAN_PWM/FAN_TACH spare cross-feed | 120 kW rear fans |
| 13 | T_INLET share | inlet NTC lives on AC-DC air entry |
| 14,15 | spares | |
| 16 | shield drain | to PE at AC-DC end only |

Loss of harness (any of: LINK timeout, GATE_EN low, V24 missing) ⇒ both boards to safe state:
PFC PWM off after bus-sag-controlled stop, LLC PWM off immediately, relays open per FSM, discharge per policy.

## HMI behavior (config spec)

2-digit display + SET/▲(SW1) & ▼/ENTER(SW2): short-press pages {module CAN address 00–63,
group id, fault code ring, fw version}; long-press SET = edit (blink), ▲/▼ change, ENTER save
to EEPROM (CRC'd, §24). Display timeout 60 s. During faults: display shows `F.xx` code (table in
protection-thresholds.md). Driven by MCU-LLC: 74HC595 (segments) + 2 NPN digit mux + 2 GPIO buttons.

## MCU pin-map deltas (extends calculations/out/mcu-pinmap.csv; asserted unique at build)

MCU-LLC adds: HMI_DAT/CLK/LAT = pins 88/89/90, DIG1/2 = 91/92, BTN1/2 = 93/94; relay controls
CTL_KSER..KPREB = 80–85; CAN moved to 48/49; senses per boards.tsx map. MCU-PFC adds:
CTL_KPRE = 72, CTL_QDIS = 73 (inverted drive, pull-up to V15 — discharge engages when commanded
or on control collapse with aux still alive; documented E19), FLT_PFC = 74.


---

## Rev C deltas (2026-09-05, production-review closure)

**Harness pin semantics (16-way, unchanged pinout — net mapping revised):**

| Pin | Label | Rev C meaning |
|---|---|---|
| 7 | LTX | AC-DC: `LINK_TX` (MCU-PFC TX) → **DC-DC maps it to `LINK_RX`** (CB-14 crossover lives in the DC-DC net map — harness itself stays straight-through pin-to-pin) |
| 8 | LRX | AC-DC: `LINK_RX` ← DC-DC maps `LINK_TX` |
| 9 | EN | `EN_PFC` (MCU-PFC's enable *output*, both boards) |
| 10 | KILL | `EN_LLC` (MCU-LLC's enable output; the legacy KILL label is kept on the connector) |
| 13 | TINL | **reserved** — inlet NTC is read by MCU-PFC only and shared over the link (MR-2: no double-biased analog node across the harness) |
| 16 | SHLD | bonded to PE on both boards |

Both link lines carry 10 k idle pullups on each board. Each board's `SafetyChain` ANDs
(own EN) × (received EN, 100 k pulldown → harness loss = gates off) × (local watchdog WDO) into
`GATE_EN_A/B` with a 10 k pulldown — the E27 default-disabled chain. Loss of the harness therefore
disables **both** boards' gates within the driver's EN response time.

**Discharge (E19 rev B):** `CTL_QDIS` drives an opto gate driver's LED (active-high, 330 Ω);
the output stage is biased by a DCN-referenced isolated module and the QDISF gate has a 10 k
pulldown to DCN — MCU dead/reset/unprogrammed = discharge OFF. The rev-A "fail-engaged" behavior
is deleted (review CB-11).

**Grounding (E25):** AGND–DGND 0 Ω tie per board (single point, at the MCU ADC ground — layout
note P-3); DGND→PE 1 MΩ ∥ 4.7 nF on the AC-DC board. The whole control domain is SELV; every HV
measurement crosses on an isolated amplifier, so the HMI (buttons/display), SWD headers, fan
connectors and CAN stay touch-safe by architecture.
