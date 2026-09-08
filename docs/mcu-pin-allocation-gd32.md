# GD32G553VET6 pin allocation (R3) — replaces the symbolic map

`calculations/out/mcu-pinmap.csv` was headed `pin(symbolic)` and its numbers came from
STM32G474 conventions. Gate item **A6** recorded the GD32G553 datasheet check as pending; it was
never closed. The R3 audit found the consequences:

| Signal | Old pin | What that pin actually is | Consequence |
|---|---|---|---|
| `FLT_PFC` / `FLT_LLC` | 74 | **VSS** | fault output driven into ground |
| `BOOT0` | 100 | **VDD** | strap resistor shorts VDD to GND |
| SWDIO / SWCLK | 28 / 29 | PA6 / PA7 (ADC) | part unprogrammable |
| VDDA | ~19/20 | PF3 / PF4 | analog supply unconnected |

Allocated against **GD32G553xx Datasheet Rev 2.0, Table 2-4** (LQFP100), sized for the **120 kW
worst case**, then adversarially audited. Machine-readable:
`calculations/out/mcu-pin-allocation.json`, applied by `calculations/easyeda-apply-gen.mjs`.

## Fixed pins (datasheet facts, not choices)

VDD 24/49/64/75/100 · VSS 23/48/63/74/99 · VDDA 37 · VSSA 35 · VREFP 36 · VBAT 6 ·
NRST 14 · **BOOT0 95 (PB8, shared, sampled at reset)** · **SWDIO 76 (PA13)** · **SWCLK 77 (PA14)**.
There is no VREFN pin — it is internally tied to VSSA. All five VDD/VSS pairs are populated.


## UPFC — AC-DC / Vienna PFC

Fits with spare I/O. 61 signals over 69 pin landings.

| Signal | Pin | Port | Function |
|---|---|---|---|
| `BOOT0_PFC` | 95 | PB8 | BOOT0 - 10k pulldown, test point only, no other load |
| `CTL_KPRE` | 83 | PD1 | GPIO output (precharge contactor drive) |
| `CTL_QDIS` | 87 | PD5 | GPIO output (bus discharge) |
| `DGND` | 23 | VSS | VSS |
| `DGND` | 48 | VSS | VSS |
| `DGND` | 63 | VSS | VSS |
| `DGND` | 74 | VSS | VSS |
| `DGND` | 99 | VSS | VSS |
| `EN_PFC` | 82 | PD0 | GPIO (enable from DC-DC board) |
| `FAN_PWM1` | 59 | PD12 | TIMER3_CH0 (PWM out) |
| `FAN_PWM2` | 60 | PD13 | TIMER3_CH1 (PWM out) |
| `FAN_PWM3` | 61 | PD14 | TIMER3_CH2 (PWM out) |
| `FAN_PWM4` | 62 | PD15 | TIMER3_CH3 (PWM out) |
| `FAN_TACH1` | 85 | PD3 | TIMER1_CH0 (input capture, 32-bit) |
| `FAN_TACH2` | 86 | PD4 | TIMER1_CH1 (input capture, 32-bit) |
| `FAN_TACH3` | 89 | PD7 | TIMER1_CH2 (input capture, 32-bit) |
| `FAN_TACH4` | 88 | PD6 | TIMER1_CH3 (input capture, 32-bit) |
| `FLT_PFC` | 47 | PB10 | HRTIMER_FLT2 - hardware gates all 12 outputs, active low, filtered |
| `HXTAL_IN (reserved, not in requested set)` | 12 | PF0 | OSCIN |
| `HXTAL_OUT (reserved, not in requested set)` | 13 | PF1 | OSCOUT |
| `I_A0` | 20 | PA0 | ADC0_IN0 (regular rank 0) |
| `I_A1` | 34 | PB2 | ADC1_IN11 (regular rank 1) |
| `I_A2` | 38 | PE7 | ADC2_IN3 (regular rank 2) |
| `I_A3` | 43 | PE12 | ADC3_IN15 (regular rank 3) |
| `I_B0` | 21 | PA1 | ADC1_IN1 (regular rank 0) |
| `I_B1` | 44 | PE13 | ADC2_IN2 (regular rank 1) |
| `I_B2` | 42 | PE11 | ADC3_IN14 (regular rank 2) |
| `I_B3` | 25 | PA3 | ADC0_IN3 (regular rank 3) |
| `I_C0` | 32 | PB0 | ADC2_IN11 (regular rank 0) |
| `I_C1` | 46 | PE15 | ADC3_IN1 (regular rank 1) |
| `I_C2` | 22 | PA2 | ADC0_IN2 (regular rank 2) |
| `I_C3` | 26 | PA4 | ADC1_IN15 (regular rank 3) - keep DAC0_OUT0 disabled |
| `LINK_RX` | 80 | PC11 | USART2_RX |
| `LINK_TX` | 79 | PC10 | USART2_TX |
| `NRST_PFC` | 14 | NRST-PG10 | NRST - keep NRST_MDSEL at reset function, do not remap to PG10 |
| `PWM_A0` | 69 | PA8 | HRTIMER_ST0CH0 (lane0, carrier 0deg) |
| `PWM_A1` | 51 | PB12 | HRTIMER_ST2CH0 (lane1, carrier 90deg) |
| `PWM_A2` | 67 | PC8 | HRTIMER_ST4CH0 (lane2, carrier 180deg) |
| `PWM_A3` | 97 | PE0 | HRTIMER_ST6CH0 (lane3, carrier 270deg) |
| `PWM_B0` | 70 | PA9 | HRTIMER_ST0CH1 (lane0, carrier 0deg) |
| `PWM_B1` | 52 | PB13 | HRTIMER_ST2CH1 (lane1, carrier 90deg) |
| `PWM_B2` | 68 | PC9 | HRTIMER_ST4CH1 (lane2, carrier 180deg) |
| `PWM_B3` | 98 | PE1 | HRTIMER_ST6CH1 (lane3, carrier 270deg) |
| `PWM_C0` | 71 | PA10 | HRTIMER_ST1CH0 (lane0, carrier 0deg) |
| `PWM_C1` | 53 | PB14 | HRTIMER_ST3CH0 (lane1, carrier 90deg) |
| `PWM_C2` | 65 | PC6 | HRTIMER_ST5CH0 (lane2, carrier 180deg) |
| `PWM_C3` | 1 | PE2 | HRTIMER_ST7CH0 (lane3, carrier 270deg) |
| `RELAY_FB_KPRE` | 81 | PC12 | GPIO input (precharge relay aux contact feedback) |
| `SNS_V15` | 33 | PB1 | ADC2_IN0 (regular rank 4) |
| `SNS_V24` | 27 | PA5 | ADC1_IN12 (regular rank 4) - keep DAC0_OUT1 disabled |
| `SNS_VAC1` | 17 | PC2 | ADC1_IN7 (regular rank 2) |
| `SNS_VAC2` | 39 | PE8 | ADC2_IN5 (regular rank 3) |
| `SNS_VAC3` | 16 | PC1 | ADC0_IN6 (regular rank 4) |
| `SNS_VBUSP` | 45 | PE14 | ADC3_IN0 (regular rank 0) |
| `SNS_VMID` | 15 | PC0 | ADC0_IN5 (regular rank 1) |
| `SWCLK_PFC` | 77 | PA14 | SWCLK (JTCK) |
| `SWDIO_PFC` | 76 | PA13 | SWDIO (JTMS) |
| `T_INLET` | 18 | PC3 | ADC0_IN8 (regular rank 5) |
| `T_PFC` | 41 | PE10 | ADC3_IN13 (regular rank 4) |
| `V3P3` | 24 | VDD | VDD |
| `V3P3` | 49 | VDD | VDD |
| `V3P3` | 64 | VDD | VDD |
| `V3P3` | 75 | VDD | VDD |
| `V3P3` | 100 | VDD | VDD |
| `VBAT_PFC` | 6 | VBAT | VBAT - tie to V3P3 via 0R, no coin cell |
| `VDDA_PFC` | 37 | VDDA | VDDA - filtered from V3P3 via ferrite + 1uF||100nF |
| `VREFP_PFC` | 36 | VREFP | VREFP - external reference, not strapped to VDDA |
| `VSSA_PFC` | 35 | VSSA | VSSA - analog return, star-tied to DGND (no VREFN pin exists) |
| `WDI_PFC` | 84 | PD2 | GPIO output (external watchdog kick) |

### Status 2026-09-06 — 2 of the 10 closed against the actual circuit

The findings below were raised against the ALLOCATION alone, several of them conditionally
("harmless if X", "keep it only if Y"). Two of those conditions can be settled from the design as
drawn rather than left hanging.

**FLT_PFC on PB10 (not 5 V tolerant) — CLOSED.** The condition was "keep PB10 only if the fault
source is confirmed 3.3 V push-pull". The fault net is a wired-OR of three NSI6611 `FLT#` pins,
which are OPEN-DRAIN and can only pull low, with the sole pull-up `RFLTA` going to **V3P3** and
`CFLTA` filtering to DGND. `FLT_PFC` therefore cannot exceed 3.3 V under any condition, so PB10's
lack of 5 V tolerance is not reachable. Identical on the DC-DC board via `RFLTB` / `CFLTB` on
`FLT_LLC`. No pin move needed.

**Lane-1 PWM on PB12/PB13/PB14 (not 5 V tolerant) — CLOSED.** The condition was "harmless if every
gate driver input is 3.3 V CMOS with no pull-up above 3.3 V". On 120 kW, `PWM_A1`/`B1`/`C1` carry
exactly three things: the MCU output, the NSI6611 `PWM` input, and `RA1GPD`/`RB1GPD`/`RC1GPD` —
which are pull-DOWNS to DGND, not pull-ups. Nothing on the net can rise above the MCU's own 3.3 V
drive. The asymmetry with the other three lanes is real but electrically inert.

**FAN_PWM1 / FAN_PWM3 on non-5VT pins — STILL OPEN**, and the check above shows why: `FAN_PWM1`
runs straight from the MCU to `JFAN1.PWM` with no buffer, so the fan's own internal pull-up is the
deciding factor and no fan part has been selected yet. This one genuinely needs the fan datasheet.

The remaining seven are architecture and firmware decisions (injected ADC groups for the 4-way
interleave, HRTIMER slave-unit pairing and dead-time, per-lane fault channels, CAN-FD instead of
bare USART for the inter-board link, the VREFP ramp and the VREF-disable rule) and are unchanged.

### Audit findings — 10 raised

- **PWM_A3 / PWM_B3 / PWM_C3 (brief premise, not the allocation)** — The brief's VERIFIED FACT "HRTIMER present (6 slave timing units ST0..ST5, 2 channels each = 12 outputs)" is FALSE. Datasheet Rev2.0 sec.3.22 p.102: "High-resolution timing units: Master_TIMER, Slave_TIMERx (x=0..7)" and "16 digital signals outputs channels: they can be controlled by any timing unit and output independently or coupled into 8 pairs." Eight slave units, sixteen outputs. Table 2-4 co
  - *Fix:* Reject the brief's fact, not the allocation. Record ST0..ST7 / 16 outputs. Spare same-function pins if PE0/PE1/PE2 are ever needed for something else: ST6CH0 also on pin 20 PA0, ST6CH1 on pin 21 PA1, ST7CH0 on pin 22 PA2, ST7CH1 on pin 2 PE3 and pin 25 PA3.
- **I_A0..I_C3 (all 12 phase currents)** — The regular-group rank rotation cannot serve 4-way 90-degree interleaving. Each lane's three currents must be sampled at that lane's own carrier instant, i.e. four distinct trigger events per switching period. Lane0 sits at rank 0 of ADC0/ADC1/ADC2; lane2 sits at rank 2 of ADC0/ADC2/ADC3. ADC0 and ADC2 would each have to convert twice from two different triggers inside a single regular sequence, w
  - *Fix:* Move all 12 phase currents to INJECTED groups: one injected group per lane, triggered by that lane's own HRTIMER slave unit (ST0/ST2/ST4/ST6 ADC trigger events). Leave SNS_VAC1-3, SNS_VBUSP, SNS_VMID, SNS_V24, SNS_V15, T_PFC, T_INLET on the regular group at a slower rate. The pin choices need no cha
- **VREFP_PFC (pin 36)** — "External reference, not strapped to VDDA" combined with "VDDA_PFC filtered from V3P3 via ferrite + 1uF||100nF" violates Table 4-35 note (2): "VREFP should always be equal to or less than VDDA, especially during power up." The ferrite plus 1uF makes VDDA the slowest-rising node on the board. An external reference fed from V3P3 (or from any rail ahead of that ferrite) will be above VDDA for the who
  - *Fix:* Pick one: (a) power the external reference from VDDA post-ferrite, not from V3P3; (b) add a BAT54-class Schottky from VREFP to VDDA; or (c) drop the external part and use the on-chip VREF (sec.3.19: calibrated 2.048 / 2.5 / 2.9 V), which removes the part, the ramp problem and one BOM line.
- **VREFP_PFC (pin 36) - firmware/config rule** — Datasheet sec.3.19: the internal VREF "Connects to VREFP pin to source off-chip circuits." The VREFP pin is bidirectional in that sense. With an external reference driving VREFP, any firmware that enables the internal VREF puts an on-chip buffer in output contention with the external reference. Nothing in the allocation records this constraint, and it is invisible on the schematic.
  - *Fix:* If keeping the external reference, add an explicit note on the schematic and in the init code that the VREF peripheral must remain disabled, and put an assert on the VREF enable bit in the startup self-test.
- **FLT_PFC (pin 47, PB10)** — PB10 is NOT 5 V tolerant. Table 2-4 lists pin 47 PB10 as I/O Level = blank (plain I/O), unlike its neighbours PD13/PD15/PC4 which are explicitly 5VT. A PFC fault line is commonly a 5 V comparator output, an opto collector pulled to 5 V, or a gate-driver /FLT open-drain pin with a 5 V pull-up. Any of those clamps into PB10's ESD diode continuously while the fault is asserted. Five of the eight HRTI
  - *Fix:* Move FLT_PFC to HRTIMER_FLT7 on pin 30 (PC4) - 5VT and currently unallocated. Alternatives, all 5VT and free: FLT0 pin 73 PA12, FLT1 pin 78 PA15, FLT4 pin 66 PC7. Keep PB10 only if the fault source is confirmed 3.3 V push-pull.
- **FLT_PFC - fault granularity** — One fault input gates all 12 outputs across four independent 30 kW lanes. The gating itself is correct (all 12 PWMs are genuinely HRTIMER outputs, so FLT2 really does reach every one, and Table 4-68 gives 24 ns max latency), but there is no way to identify which lane tripped, and a single driver fault in one lane shuts down the entire 120 kW stack with no diagnostic. For a machine this size that i
  - *Fix:* Give each lane its own fault channel. Four free 5V-tolerant HRTIMER fault inputs exist on four free pins: FLT0 = pin 73 PA12, FLT1 = pin 78 PA15, FLT4 = pin 66 PC7, FLT7 = pin 30 PC4. Configure each to gate all 12 outputs (same protective behaviour as today) while latching a per-lane flag.
- **PWM_A0/B0, PWM_A1/B1, PWM_A2/B2, PWM_A3/B3 (paired-channel units ST0, ST2, ST4, ** — Zero hardware dead-time is available on any of the 12 gate outputs. Sec.3.22 says the 16 outputs "output independently or coupled into 8 pairs" - the dead-time generator lives in the pair. The allocation puts two DIFFERENT phases on the two channels of the same unit (ST0CH0 = PWM_A0, ST0CH1 = PWM_B0; same for ST2/ST4/ST6), so those units must run in independent mode and their dead-time generators 
  - *Fix:* Confirm the power stage is a genuine single-gate-per-phase Vienna. If any leg is T-type, ANPC, or a two-gate Vienna needing dead-time, the entire PWM map must be re-cut: one slave unit per phase leg (12 legs will not fit in 8 units, so lanes would have to drop to 4 units / 8 outputs, or dead-time mu
- **FAN_PWM1 (pin 59, PD12) and FAN_PWM3 (pin 61, PD14)** — Not 5 V tolerant, while FAN_PWM2 (pin 60 PD13) and FAN_PWM4 (pin 62 PD15) are - an inconsistent set across four identical channels. 4-wire fans present a pull-up on the PWM line (frequently 5 V, sometimes 12 V through a divider); open-drain drive into that pull-up over-stresses PD12 and PD14 but not PD13 and PD15. Also burns three ADC-capable pins (PD12 = ADC23_IN8, PD13 = ADC23_IN9, PD14 = ADC23_
  - *Fix:* Either drive all four push-pull at 3.3 V and confirm the fan datasheet has no pull-up above 3.3 V, or relocate. Free 5VT non-ADC alternatives: TIMER3_CH0 on pin 93 PB6 or pin 72 PA11, TIMER3_CH1 on pin 94 PB7 or pin 73 PA12, TIMER3_CH3 on pin 96 PB9. Note TIMER3_CH2 is stuck: its only other pins are
- **LINK_TX / LINK_RX (pins 79, 80)** — The inter-board safety-relevant link (it carries EN_PFC context between the DC-DC and AC-DC boards on a 120 kW converter) is a bare USART2 with no frame CRC, no acknowledgement and no bus-off detection. Table 2-1 shows the part has 3x CAN-FD, entirely unused.
  - *Fix:* CAN2 is fully free and 5V tolerant: CAN2_RX on pin 90 PB3, CAN2_TX on pin 91 PB4. Move the link there and keep USART2 on PC10/PC11 as a service/console port. Note the tradeoff: PB3 is also the only JTDO/SWO pin, so choosing CAN2 there forecloses SWO trace (currently unassigned anyway).
- **PWM_A1/B1/C1 (pins 51, 52, 53 - PB12/PB13/PB14)** — Minor, but lane 1 is the only lane whose three gate outputs sit on non-5V-tolerant pins - Table 2-4 gives PB12, PB13, PB14 as plain I/O while lanes 0, 2 and 3 (PA8/PA9/PA10, PC8/PC9/PC6, PE0/PE1/PE2) are all 5VT. Lane 1 is also the only lane burning ADC-capable pins (PB12 = ADC3_IN2/ADC0_IN10, PB13 = ADC2_IN4, PB14 = ADC3_IN3/ADC0_IN4). Four supposedly identical lanes are not electrically identica
  - *Fix:* Harmless if every gate driver input is 3.3 V CMOS with no pull-up above 3.3 V - verify that on the driver datasheet and note it. Otherwise the ST2/ST3 outputs have no 5VT alternative and lane 1 needs a series/level-shift treatment the other three lanes do not.

## ULLC — DC-DC / 3-phase LLC

Fits with spare I/O. 77 signals over 87 pin landings.

| Signal | Pin | Port | Function |
|---|---|---|---|
| `BOOT0_LLC` | 95 | PB8/BOOT0 | BOOT0 (sampled at reset), GPIO thereafter |
| `BTN1` | 84 | PD2 | GPIO input / EXTI2 |
| `BTN2` | 85 | PD3 | GPIO input / EXTI3 |
| `CAN_RX` | 92 | PB5 | CAN1_RX |
| `CAN_TX` | 93 | PB6 | CAN1_TX |
| `CTL_KOUT` | 94 | PB7 | GPIO output |
| `CTL_KPARA` | 86 | PD4 | GPIO output |
| `CTL_KPARB` | 89 | PD7 | GPIO output |
| `CTL_KPREA` | 96 | PB9 | GPIO output |
| `CTL_KPREB` | 62 | PD15 | GPIO output |
| `CTL_KSER` | 83 | PD1 | GPIO output |
| `CTL_QDISBK` | 34 | PB2 | GPIO output |
| `DGND` | 23 | VSS | VSS |
| `DGND` | 48 | VSS | VSS |
| `DGND` | 63 | VSS | VSS |
| `DGND` | 74 | VSS | VSS |
| `DGND` | 99 | VSS | VSS |
| `EN_LLC` | 47 | PB10 | GPIO output (pin is also TIMER0_BRKIN0 alt - spare break input) |
| `FLT_LLC` | 28 | PA6 | TIMER7_BRKIN0 (AF4) |
| `FLT_LLC` | 10 | PF9 | TIMER19_BRKIN0 (AF1) |
| `FLT_LLC` | 7 | PC13 | TIMER0_BRKIN0 — R3 audit fix; the only free TIMER0 break pin |
| `HMI_CLK` | 52 | PB13 | SPI1_SCK |
| `HMI_DAT` | 54 | PB15 | SPI1_MOSI |
| `HMI_DIG1` | 53 | PB14 | GPIO output |
| `HMI_DIG2` | 50 | PB11 | GPIO output |
| `HMI_LAT` | 51 | PB12 | GPIO output (SPI1_NSS pin, driven as GPIO strobe) |
| `I_RES1` | 20 | PA0 | ADC0_IN0 |
| `I_RES10` | 59 | PD12 | ADC3_IN8 |
| `I_RES11` | 60 | PD13 | ADC3_IN9 |
| `I_RES12` | 61 | PD14 | ADC3_IN10 |
| `I_RES2` | 21 | PA1 | ADC0_IN1 |
| `I_RES3` | 22 | PA2 | ADC0_IN2 |
| `I_RES4` | 27 | PA5 | ADC1_IN12 |
| `I_RES5` | 29 | PA7 | ADC1_IN3 |
| `I_RES6` | 30 | PC4 | ADC1_IN4 |
| `I_RES7` | 38 | PE7 | ADC2_IN3 |
| `I_RES8` | 57 | PD10 | ADC2_IN6 |
| `I_RES9` | 58 | PD11 | ADC2_IN7 |
| `LINK_RX` | 88 | PD6 | USART1_RX |
| `LINK_TX` | 87 | PD5 | USART1_TX |
| `NRST_LLC` | 14 | NRST | NRST |
| `PWM_L10H` | 2 | PE3 | TIMER19_CH1 |
| `PWM_L10L` | 4 | PE5 | TIMER19_MCH1 |
| `PWM_L11H` | 19 | PF2 | TIMER19_CH2 |
| `PWM_L11L` | 5 | PE6 | TIMER19_MCH2 |
| `PWM_L12H` | 98 | PE1 | TIMER19_CH3 |
| `PWM_L12L` | 97 | PE0 | TIMER19_MCH3 |
| `PWM_L1H` | 40 | PE9 | TIMER0_CH0 |
| `PWM_L1L` | 39 | PE8 | TIMER0_MCH0 |
| `PWM_L2H` | 42 | PE11 | TIMER0_CH1 |
| `PWM_L2L` | 41 | PE10 | TIMER0_MCH1 |
| `PWM_L3H` | 44 | PE13 | TIMER0_CH2 |
| `PWM_L3L` | 43 | PE12 | TIMER0_MCH2 |
| `PWM_L4H` | 45 | PE14 | TIMER0_CH3 |
| `PWM_L4L` | 46 | PE15 | TIMER0_MCH3 |
| `PWM_L5H` | 65 | PC6 | TIMER7_CH0 |
| `PWM_L5L` | 79 | PC10 | TIMER7_MCH0 |
| `PWM_L6H` | 66 | PC7 | TIMER7_CH1 |
| `PWM_L6L` | 80 | PC11 | TIMER7_MCH1 |
| `PWM_L7H` | 67 | PC8 | TIMER7_CH2 |
| `PWM_L7L` | 81 | PC12 | TIMER7_MCH2 |
| `PWM_L8H` | 68 | PC9 | TIMER7_CH3 |
| `PWM_L8L` | 82 | PD0 | TIMER7_MCH3 |
| `PWM_L9H` | 1 | PE2 | TIMER19_CH0 |
| `PWM_L9L` | 3 | PE4 | TIMER19_MCH0 |
| `RELAY_FB_KOUT` | 72 | PA11 | GPIO input (5V tolerant) |
| `RELAY_FB_KPARA` | 70 | PA9 | GPIO input (5V tolerant) |
| `RELAY_FB_KPARB` | 71 | PA10 | GPIO input (5V tolerant) |
| `RELAY_FB_KPREA` | 73 | PA12 | GPIO input (5V tolerant) |
| `RELAY_FB_KPREB` | 78 | PA15 | GPIO input (JTDI released in SWD mode) |
| `RELAY_FB_KSER` | 69 | PA8 | GPIO input (5V tolerant) |
| `SNS_IOUT` | 15 | PC0 | ADC0_IN5 |
| `SNS_IOUTN` | 16 | PC1 | ADC0_IN6 |
| `SNS_VBKA` | 56 | PD9 | ADC3_IN12 |
| `SNS_VBKB` | 55 | PD8 | ADC3_IN11 |
| `SNS_VOUT` | 17 | PC2 | ADC1_IN7 |
| `SWCLK_LLC` | 77 | PA14 | JTCK/SWCLK |
| `SWDIO_LLC` | 76 | PA13 | JTMS/SWDIO |
| `T_LLC` | 32 | PB0 | ADC2_IN11 |
| `T_XFMR` | 33 | PB1 | ADC2_IN0 |
| `V3P3` | 24 | VDD | VDD |
| `V3P3` | 49 | VDD | VDD |
| `V3P3` | 64 | VDD | VDD |
| `V3P3` | 75 | VDD | VDD |
| `V3P3` | 100 | VDD | VDD |
| `VDDA_LLC` | 37 | VDDA | VDDA |
| `WDI_LLC` | 11 | PF10 | GPIO output |

### Audit findings — 10 raised

- **FLT_LLC -> pin 28 (PA6) "TIMER0_BRKIN0 + TIMER7_BRKIN0 (same pin serves both tim** — HARD ERROR, safety-critical. Table 2-10 (Port A AF summary) puts TIMER7_BRKIN0 on PA6 at AF4 and TIMER0_BRKIN0 on PA6 at AF6. A GPIO selects exactly ONE alternate function via AFSEL, so PA6 can be the break input for TIMER0 OR TIMER7, never both. As written, one of the three advanced timers (4 of the 12 legs = 8 switches at 120 kW) has NO hardware break input at all. Every other TIMER0_BRKIN0-capa
  - *Fix:* Land FLT_LLC on three pins, one per timer: PA6 = TIMER7_BRKIN0 (AF4), PF9 = TIMER19_BRKIN0 (AF1, already correct), and add pin 7 PC13 = TIMER0_BRKIN0 (Table 2-12 confirms it) -- PC13 is currently SPARE and is the only free TIMER0_BRKIN0 pin left. Break inputs are inputs, so PC13's limited source dri
- **(RESERVED - VBAT) -> pin 6 (VBAT), "tie to V3P3 or DGND"** — The DGND option is out of spec and interlocks with the fix above. Table 4-3 gives VBAT operating min = 1.71 V. The Table 4-29 note states PC13/PC14/PC15 are supplied through the backup Power Switch (typ 3 mA shared source). Ground VBAT and the backup domain is unpowered: pins 7/8/9 (PC13, PC14, PC15) -- listed here as three spares, and the pin needed for the TIMER0 break landing -- stop working.
  - *Fix:* Delete the DGND option. VBAT to V3P3 only, with the 100 nF to VSS shown in Figure 4-1. Note 7 of Table 4-3 also requires VBAT <= VDD + 0.3 V, which a direct V3P3 tie satisfies.
- **EN_LLC -> pin 47 (PB10) "pin is also TIMER0_BRKIN0 alt - spare break input"** — False annotation that masks the PA6 defect. PB10 is allocated as a GPIO output; a pin cannot be a push-pull output and a timer break input simultaneously. Neither TIMER0_BRKIN0 (AF12) nor HRTIMER_FLT2 (AF13) on PB10 is available in this configuration, so the map has no spare break capacity anywhere.
  - *Fix:* Strike the "spare break input" note, or relocate EN_LLC to a plain GPIO (e.g. PF2 once freed) and use PB10 as the TIMER0 break landing instead of PC13.
- **I_RES7 -> pin 38 (PE7) as ADC2_IN3** — Placement defect. PE7 is the ONLY analog pin inside the TIMER0 gate-drive block: pin 37 is VDDA, pin 39 is PE8 = PWM_L1L, and pins 40-46 are seven more hard-switching gate PWMs. A resonant-tank current sense is pin-adjacent to a switching output and to the analog supply, on a 120 kW converter. Nothing in the datasheet forbids it, which is exactly why a pin-level check alone passes it.
  - *Fix:* Move I_RES7 to pin 18 PC3 (ADC01_IN8), already declared a spare, inside the contiguous analog block at pins 15-34. Leave PE7 spare or use it for a slow digital signal.
- **PWM_L11H -> pin 19 (PF2) as TIMER19_CH2** — Mirror-image of the previous defect: PF2 is the only switching output inside the analog block, sitting between pin 18 (PC3) and pin 20 (PA0 = I_RES1), with SNS_IOUT/SNS_IOUTN/SNS_VOUT two to four pins away. Gate-drive edges couple straight into the current-sense cluster.
  - *Fix:* TIMER19_CH2 is also available on pin 67 PC8 (Table 2-4). Rotate: PWM_L11H -> PC8; PWM_L7H (TIMER7_CH2) -> pin 96 PB9, which is the only other TIMER7_CH2 pin in this package; move CTL_KPREA to the freed PF2. Verify against Tables 2-11/2-12 before committing.
- **HRTIMER (allocated nowhere) vs 12 PWM legs on TIMER0/TIMER7/TIMER19** — Architectural, and it is a one-way door once this pinout is frozen. The HRTIMER's 6 slave units x 2 channels = exactly the 12 outputs this board needs, with sub-ns resolution and native per-unit phase offset -- the reason the part exists for LLC. The advanced timers give ~4.6 ns period granularity at 216 MHz, and a 120-degree interleave across three independent timer instances is not a natively su
  - *Fix:* Make the HRTIMER-vs-advanced-timer decision explicitly and record it before freezing the pinout. If advanced timers are genuinely the choice, document the interleave scheme (master/slave chaining plus counter preload) so the review does not have to rediscover the limitation.
- **SNS_IOUT -> pin 15 (PC0) ADC0_IN5 / SNS_IOUTN -> pin 16 (PC1) ADC0_IN6** — Inconsistent intent. The net names declare a differential pair; the allocation declares two independent single-ended channels. The ADC does support differential mode (Table 4-38 lists separate differential INL/DNL/THD specs), and in that mode a pair consumes one channel index and its neighbour, so the software channel map as written is wrong. If single-ended is actually intended, SNS_IOUTN is a fl
  - *Fix:* State which mode is used. Datasheet does not give the pairing rule -- confirm the ADCx_INi/INi+1 pairing in the GD32G5x3 User Manual before assuming IN5/IN6 is a legal pair.
- **Fan tach and fan PWM (absent from the entire map)** — Completeness gap on a 120 kW converter: no input-capture channel and no fan PWM output is allocated anywhere in the 100 pins, and there is no spare left in a convenient location once the break-input and placement fixes above land.
  - *Fix:* Allocate now, not later. TIMER1 channels are reachable on PD3/PD4/PD6/PD7 (pins 85/86/88/89) and TIMER2/TIMER3 channels on several currently-GPIO pins; pick tach capture plus one PWM before freeze.
- **HMI_DIG1 -> pin 53 (PB14), HMI_DIG2 -> pin 50 (PB11) as GPIO outputs** — Digit-select lines for a multiplexed display driven directly from GPIO. Table 4-2 caps IIO at 20 mA per pin and sum-IIO at 100 mA across all GPIO; a multiplexed digit common carries the summed segment current and will exceed that if the segments are driven at any useful brightness.
  - *Fix:* Confirm external digit drivers or current limiting. Separately: PB11/PB12/PB13/PB14/PB15 plus PB2 burn six ADC-capable pins on the HMI and a slow control -- fine only if no further analog channels are ever needed.
- **VDDA_LLC -> pin 37 (VDDA)** — The distinct net name implies an independently derived analog rail. Table 4-2 note 3 requires VDD and VDDA to be powered by the same source, with the difference not exceeding 300 mV during power-up and operation. An independent LDO or a sequenced rail violates this and can latch the part.
  - *Fix:* Derive VDDA_LLC as a ferrite/RC branch off V3P3 only, never a separate regulator. Also confirm VREFP (pin 36) is <= VDDA during power-up per the Table 4-35 note.

## Applied here

- Every fixed pin above, which removes both hard shorts.
- **`FLT_LLC` now lands on three pins** — 28 (PA6, TIMER7_BRKIN0), 10 (PF9, TIMER19_BRKIN0),
  7 (PC13, TIMER0_BRKIN0). The audit caught that PA6 cannot be TIMER0_BRKIN0 *and*
  TIMER7_BRKIN0 simultaneously (AF6 vs AF4, one AFSEL per pin), which would have left four LLC
  legs — eight switches at 120 kW — with no hardware fault shutdown.
- `VBAT` (pin 6) ties to **V3P3 only**, never DGND: grounding it unpowers the backup domain and
  kills PC13/PC14/PC15, one of which now carries a break input.

## Open decisions — these need an engineering call, not a default

1. **HRTIMER vs advanced timers for the LLC.** The PFC allocation puts all 12 Vienna PWMs on the
   HRTIMER so that a single pin (PB10 / HRTIMER_FLT2) gates every switch in hardware. The LLC
   allocation uses TIMER0/7/19 for its 24 outputs, which is why it needs three fault pins. The
   HRTIMER has 8 slave units × 2 = 16 outputs — not enough for 24 alone. Decide before freeze:
   this is a one-way door once the pinout is committed.
2. **ADC interleave scheme (PFC).** The rank-rotation proposed for simultaneous three-phase
   sampling needs checking against the 4-way 90° interleave.
3. **Fan channels on the LLC** were not in its brief and are unallocated there.
4. **`SNS_IOUT`/`SNS_IOUTN`**: declare single-ended or differential ADC mode; the pairing rule
   must come from the User Manual, not the datasheet.

Until 1–4 are settled this map is *correct but not frozen*: it is safe to draw and to route
supplies against, and it is no longer capable of shorting a rail.

## UMOD — E40 merged 30 kW single-brain role (generated)

One card runs the whole 30 kW module (E40). The allocation is **generated, not hand-edited**:
`calculations/control/umod-pinmap.mts` merges the two role subsets above and resolves every
collision by a documented move onto a pin freed by the dropped lanes/legs — donor row quoted per
move, uniqueness/fixed-pin/capability asserted on every run. Output of record:
`calculations/out/umod-pinmap.csv` (65 signals · 22 analog · 9 PWM · 17 usable pins spare).

Highlights of the merge:
- **All nine PWMs on the HRTIMER**: PFC keeps ST0CH0/CH1 + ST1CH0; LLC legs take the ST2/ST4/ST6
  pairs freed by lanes 1–3. Hardware dead-time per leg; one merged `FLT` wired-OR on
  **HRTIMER_FLT7 / PC4 / pin 30** (this doc's own audit-recommended free pin) kills every switch.
- The inter-card `LINK` (USART2, pins 79/80) **dies with the second card**; its pins take the
  S/P relay feedbacks displaced from PA8–PA10 by the PFC PWMs.
- ADC collisions vacate onto the lane-1..3 CT pins (PE7/PE11/PE12/PE13/PE15) and I_RES8/9's
  PD10/PD11 — 22 simultaneous analog channels, all on documented ADC-capable pins.
- `FLT_LLC`'s PC13 frees for BTN1; TIMER19 pins freed by legs 9–12 absorb HMI_LAT/CLK and
  the displaced KSER/KPARA drives.

