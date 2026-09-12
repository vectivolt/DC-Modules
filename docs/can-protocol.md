# External CAN Interface (§23/§46/§49-20) — rev A

<p align="left"><img src="https://img.shields.io/badge/status-LIVE__SPEC-2ea44f?style=flat-square" alt="LIVE__SPEC"/> <img src="https://img.shields.io/badge/rev-E52-f2b705?style=flat-square" alt="rev"/> <img src="https://img.shields.io/badge/updated-2026--09--12-555?style=flat-square" alt="updated"/></p>

> **Purpose** — External CAN 2.0B contract: addressing, frames, telemetry, service mode.
>
> **Gate coupling** — firmware/core/can_proto.c is the normative codec (fuzzed, 50/50).


Physical: ISO 11898-2, isolated (NSI1042-DSWR + iso 5 V), 120 Ω jumper-selectable termination, CM choke + TVS.
Protocol: **CAN 2.0B, 125 kbps, 29-bit extended ID** (CAN-FD capable transceiver for future, E-arch).
Behavioral compatibility with NIUERA/Tonhe/Maxwell/UUGreenPower module classes (§46) — capability-equivalent,
**not** packet-cloned (interop packet layout only under contract, N-2).

## Addressing

Module address `A` = 0–63 set via HMI (2-digit display) or CAN assign; group `G` = 0–7.
ID layout (29-bit): `[prio 3][msgtype 8][dest 8][src 8][group 2]` — src = 0x40+A, controller = 0x01, broadcast dest = 0xFF.

## Control (controller → module), 8-byte, little-endian

| Type | Content | Rate |
|---|---|---|
| 0x10 SET_OUTPUT | u32 V_set mV, u32 I_set mA | ≥1 Hz (timeout 1 s → F.28 ramp-off) |
| 0x11 MODULE_CTL | b0 ENABLE, b1 clear-faults, b2 force-HV mode, b3 force-LV, b4 LED/locate, b5 walk-in en | on change |
| 0x12 GROUP_SET | group power/current share params | opt |
| 0x13 ADDR_ASSIGN | serial-match → address | commissioning |
| 0x1F TIME_SYNC | epoch | opt |

## Telemetry (module → controller), 1 Hz default (0x2x on-change ≤10 Hz)

| Type | Content |
|---|---|
| 0x20 STATUS1 | u32 V_out mV, u32 I_out mA |
| 0x21 STATUS2 | u16 P_avail W/10, u16 I_avail mA/10, u8 state {IDLE,PRECHG,RUN,DERATE,FAULT,LOCK}, u8 mode {LV∥, HV series, transitioning}, u16 fault-bitmap-low |
| 0x22 LIMITS | u16 derate % (thermal), u16 derate % (input, E1 curve), u16 V_bus V/10, u16 fault-bitmap-high |
| 0x23 AC | 3× u16 VAC L-L V/10, u16 freq Hz/100 |
| 0x24 TEMPS | i8 inlet, i8 PFC, i8 LLC, i8 XFMR °C, u16 fan1 rpm/10, u16 fan2 rpm/10 |
| 0x25 BUS | u16 Vbus+ V/10, u16 Vbus− V/10, u16 VbankA V/10, u16 VbankB V/10 |
| 0x26 RELAY/FAN | relay state bits + readback bits, fan cmd % |
| 0x27 IDENT | serial u32, fw u16, hw u16 (multi-frame on request 0x30) |
| 0x28 STATS | lifetime hours u32, energy kWh u32 |
| 0x2E FAULT_EVT | on latch: code u8, snapshot seq u8, key values (matches F.xx table) |

## Rules (§23/§46)

- Output only when: ENABLE set AND valid SET_OUTPUT within timeout AND no latched fault.
- Timeout (default 1 s, configurable 0.2–5 s): ramp to zero, open K_OUT at I≈0, state→IDLE; **new ENABLE required** after >10 s loss (§23).
- clear-faults never clears lockout F.31 (needs power cycle or service bit).
- Mode transitions (LV∥↔HV-series) follow the E12 FSM regardless of force bits; force bits only bias auto-selection hysteresis (§5).
- All multi-byte CRC-relevant config frames (address, group, cal) are EEPROM-committed with CRC and echoed back for verify.
