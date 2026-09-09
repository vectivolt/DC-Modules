# DFM & Production Flow (§44/§45) — rev A, two-board sandwich

## Commonization scorecard (§44)
One SiC set, one driver p/n, one bias architecture, one PFC choke p/n, one transformer section p/n,
one relay family, one fan p/n, one connector set, two board designs per SKU generated from ONE cell
library — unique-per-SKU items: board outlines, fuse/relay current class, shunt, busbar lengths.
Fasteners: M3 (PCB), M4 (TO-247 clamps/tabs), M5 (choke lugs), M6 (relay), M8 (power studs) — 5 sizes total.

## Assembly sequence (per module)
1. SMT both boards (double-sided reflow; THT wave/selective for drivers' pin-rows, relays, film caps).
2. THT power: TO-247 rows loose-fit → clamp bars → snap-in caps → studs.
3. Magnetics kitting: transformer units mated to trim-inductor **bin per leakage label (D2 rev C — gapped-ferrite bins, audit E35; kitting flow unchanged)**; chokes torqued M6, thermocouple pocket check (first article per lot).
4. Board test A (AC-DC) and B (DC-DC) separately at low voltage with a **test control card** in the slot/harness: aux rails, **card program+boot via its JSWD header (BOOT0 strapped low; CB-13)**, gate pulses into dummy RC (PWM-off isolation §45), relay click **+ mirror-contact readback** test (E30), HMI/CAN on B.
5. TO-247 clamp to respective extrusion with phase-change TIM (0.5 K·cm²/W class), torque M4 = 1.2 N·m, pattern center-out; TIM coverage witness on 1/50.
6. Sandwich mate: pillar studs DCP/DCN/PE 12 N·m + belleville; 40-way harness (HARNESS40) with retention clip, shield drain to PE (AC-DC end only).
7. Enclosure: tunnel baffles, fans (arrow check), filter, front panel (display window + button actuators + CAN/term access).
8. EOL (below) → serialize, HMI address 00, ship config via CAN IDENT write.

## Torque table
| Fastener | N·m | Tool check |
|---|---|---|
| M4 TO-247 clamp | 1.2 | click, weekly cal |
| M5 choke lug | 5 | |
| M6 relay lug | 8 | |
| M8 studs/pillars | 12 | ±10%, re-torque audit 1/shift |

## EOL test (§45) — 100% unless noted
1. Safety earth bond 25 A / <100 mΩ.
2. Hipot: AC-in↔PE 2.5 kV DC 1 min; OUT↔PE 1.5 kV; (pri↔sec covered at transformer part level 4 kV + PD sample 5/lot).
3. LV functional: aux from bus-sim 700 V bench source at 200 W ceiling; rails ±5%; link CRC soak 60 s; watchdog kill line provoked.
4. Gate-driver test PWM-disabled: bias ±rails per channel, DESAT loop-back pulse.
5. Precharge into internal bank (timing window **per SKU**: 120–250 / 220–420 / 450–780 ms — R2 HR-14: charge time scales with bus C), discharge <60 V within the per-SKU F.21 window (≤2.5 / ≤4.5 / ≤8.5 s) **+ bank-bleed check (E33): both banks <60 V within the F.21b window**.
6. **Gain-capability cal (rev D2)**: measure per-unit peak bank voltage at bus 830 low-current → store bank_max (fallback E7); 2-point V/I calibration both directions (accuracy budget: monte-carlo.csv says post-cal ±0.18%/±0.2%).
7. Limited-power functional 5 kW into load bank: THD sniff (FFT on line CT), midpoint balance, mode transition LV↔HV once (contact currents logged), fan tach, all NTC plausibility.
8. Fault-injection subset: OVP comparator (bus pump), CAN timeout ramp-off, HMI buttons/display segments.
Statistical: full-envelope sweep 1/200; thermal spot 1/50; conducted EMI pre-scan 1/500/lot-change; relay life audit lot sample per Hongfa agreement.
Records: serial-keyed CSV to MES; firmware locks lifetime counters at first RUN.
