# Product structure

**The module comes in two variants — 30 kW and 40 kW (E41) — on one platform, one card each.**
Higher ratings are cabinets of modules, not bigger boards. Price-per-kW ladder (generated,
[docs/bom-cost.md](../docs/bom-cost.md)): 30→₹1,003/kW · 40→₹858/kW · 120 kW cheapest as
**3×40+CSU = ₹104,743 (₹873/kW)** vs 4×30 = ₹122,150; N−1 granularity 67 % vs 75 % — pick the
runner at the volume decision.

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
| `control-card` | 120 × 80 | 43 | clean; one card = the module brain (E40) |

`60kw/` is kept buildable for reference (it exercises the cell library at 2 lanes and is the
card's sizing role). **`120kw/` no longer builds — deliberately**: since the card split,
`cardMap()` refuses 4 lanes (AIN needs 17 of 13), which is the architecture saying what the
geometry, relays and fuse frames already said. Its source stays as the 4-lane cell-instantiation
reference; its last pre-split sheet set lives in `kicad5/archive/`; every pipeline consumer
iterates `BUILDABLE_SKUS` (parts-db) and the 120 kW product cost is a 4×-module roll-up in
`bom-gen` (E36 scope note in the register).

## The 60/120 kW cabinet contract (audit 2026-09-08 — this IS the 60/120 kW resolution)

**60 kW = 2 × 30 kW modules; 120 kW = 4 × 30 kW modules, in a cabinet.** Every path to a bigger
single board was independently closed: board geometry (5 measurements, §above), the control card
(88 ways / HRTIMER units / 100 pins — `docs/control-card-scope.md`, and `cardMap()` now *throws*
beyond 60 kW), the HF167F relay family ceiling (R3 §3.4: 90 A switching — cannot reach 110/220 A),
and fuse frames past 125 A. This is also how the commercial market builds (module + cabinet).

## 120 kW cabinet adder (E39) — cost on top of 4 × module roll-up

| line | part | ₹ @10k |
|---|---|---|
| CSU card | same control-card assembly as the module cards (1×) | ≈ card assembly cost |
| Carrier header | CONN-CARD-88-H | 45 |
| CSU supply | **PSU-15V-DIN-WDR** (MeanWell WDR-60-15, **180–550 VAC input** — it is fed L1–L2 at 400 VAC line-to-line; an 85–264 VAC MDR-class part would fail) | 1300 |
| Cabinet studs | 6 × STUD-M8 (L1/L2/L3/PE entry + BUS_P/BUS_N; M10/busbar at 400 A per the bus note) | 168 |
| CAN chain | 2 × 120 Ω + 3.32 k strap + 0 R shield bond + 0 R SGND reference tie | ≈ 2 |
| CAN/AC harness | integrator-supplied, cabinet-length dependent | — |

120 kW product: 4×30,079 + adder ₹1,834 = **₹122,150** or **3×34,303 + adder = ₹104,743** @10k (bom-cost.md carries the 4×-only roll-up).

**The cabinet brain (E39):** one CSU — the same control card p/n strapped into the CSU band —
on a passive carrier (15 V DIN supply + 3.32 k strap), joining the CAN chain alongside each
module's DC-DC card. Equal-share commanded-CC with staggered starts and graceful degrade on module
dropout (`firmware/core/csu.c`, 45/45 with the module suite). `boards/cabinet.tsx` +
`kicad5/dc-modules-cabinet/` is the cabinet interconnect drawing of record.

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
