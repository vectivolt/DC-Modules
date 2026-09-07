# Product structure

**The module is 30 kW.** Higher ratings are cabinets of 30 kW modules, not bigger boards.

|  | AC-DC depth | DC-DC single-row width | verdict |
|---|---|---|---|
| 30 kW | 356 mm | 261 mm | **fits a 3U rack card** |
| 60 kW | 528 mm | 528 mm | DC-DC too wide for 440 mm |
| 120 kW | 872 mm | 1062 mm | far over |

Measured from the cells as actually placed — Vienna phase 89 × 161 mm, LLC section 83 × 225 mm.
The DC-DC board is the binding constraint: six LLC sections will not tile across a 440 mm rack card,
and two rows break the single horizontal isolation barrier *and* exceed the 560 mm depth class.

This is the same conclusion `docs/pcb-floorplan.md` §2 reached from five independent measurements
before anything was placed (secondary device rail at 234 %, 902 mm of board depth, over a standard
fab panel, 560 mm of front face needed in 440, 9.4 m/s exhaust velocity) — and the same one the
commercial survey reached: Wolfspeed's 60 kW LLC PCBA is 490 mm long and does not fit a 19-inch
rack either.

## What ships

| board | outline | parts | state |
|---|---|---|---|
| `30kw/acdc` | 440 × 500 | 271 | placement clean, EMI/thermal pass, planes assigned |
| `30kw/dcdc` | 440 × 500 | 282 | placement clean, barrier-bounded planes, BARRIER 0 |
| `control-card` | 120 × 80 | 43 | clean; one card serves both roles |

`60kw/` and `120kw/` are kept buildable for reference and because they exercise the cell library at
higher lane counts, but they are not product outlines.

## The 60/120 kW cabinet contract (audit 2026-09-08 — this IS the 60/120 kW resolution)

**60 kW = 2 × 30 kW modules; 120 kW = 4 × 30 kW modules, in a cabinet.** Every path to a bigger
single board was independently closed: board geometry (5 measurements, §above), the control card
(88 ways / HRTIMER units / 100 pins — `docs/control-card-scope.md`, and `cardMap()` now *throws*
beyond 60 kW), the HF167F relay family ceiling (R3 §3.4: 90 A switching — cannot reach 110/220 A),
and fuse frames past 125 A. This is also how the commercial market builds (module + cabinet).

What the cabinet integrator gets per module, already designed in:

- **Electrical:** own AC entry (80 A gG fuse, MOV/GDT, EMI filter, precharge) per module — cabinet
  input protection is a switch-disconnector/MCB coordinating with N× 80 A branches. Own PE stud.
- **Output paralleling:** modules parallel at the DC output bus through each module's own K_OUT
  (200 A class at 100 A — 50% loaded). Current sharing is **commanded CC**: the cabinet controller
  (or the group master) distributes per-module current setpoints over CAN; the FSM's K_OUT closure
  gate (E12b: stack matches target before close) makes hot-joining a live bus safe. V-accuracy
  ±0.5% keeps steady-state share within CC regulation, not droop luck.
- **Control:** CAN 2.0B with per-module address 00–63 + **group id** set on the HMI (E21) —
  `firmware/core/can_proto` already speaks it. No cabinet-level hardware on the module changes.
- **Thermal:** each module is its own front-to-back airflow unit with its own fans and derating
  curve — cabinets stack modules, never share a module's airstream budget.
- **Service:** commanded bank/bus discharge, touch-safe SELV control face, per-module HMI fault
  ring — all module-local, cabinet-independent.

The `60kw/` and `120kw/` single-board references remain **library exercisers only**: their
fuse (125/250 A) and relay rows carry annotations in `parts-db.mjs` saying so, and their known
reference-only limitations (R3 relay ceiling, PA6 break-input conflict in the 120 kW ULLC map)
are documented where they live. Nothing that ships depends on them.
