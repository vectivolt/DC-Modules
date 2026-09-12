# Product structure

**The module comes in four variants on one platform, one card each: 30 kW air · 40 kW air
(E41) · 50 kW LIQUID (E42) · 50 kW AIR (E44 — paralleled LLC pairs, 4 fans, every electrical
class shared with the liquid twin by construction).** Higher ratings are cabinets of modules, not bigger boards.
**E55 product ladder** (generated, [docs/bom-cost.md](../docs/bom-cost.md)): modules
30→₹1,033/kW · 40→₹893/kW · 50-liquid→₹835/kW · **50-AIR→₹829/kW (cheapest module)**; products
**100 kW = 2×50a ₹82,850 (829)** or 2×50L ₹83,546 (835) · **150 kW = 3×50a+CSU ₹126,109 (841)**
or 3×50L+CSU ₹127,153 (848). The 60/80/120 kW compositions are RETIRED (E55): each was dominated
per-kW by a 50-based product; N−1 on a 150 keeps 67 %, on a 100 keeps 50 %.

## The two cooling lines (E41 vs E42) — why the family splits at 40/50

**Air stops paying at 40 kW.** The air-cooled 50 was assessed and declined on five recorded
risks: two possible engine refusals (choke family edge, transformer window), magnetics height
vs the inter-board tunnel, a product-honesty risk (the hot-site folds land exactly on the
low-voltage/high-current region where real LFP/bus sessions sit — a "50 kW" delivering
~44–46 kW), and a fan-reliability regression (4 fans, thinner Tj margins). The **liquid 50
deletes the decisive ones**: the coldplate (Rth 1.1 K/W to a 65 °C plate vs 1.9 K/W to a 70 °C
air sink) runs the *same silicon as the 40* — single LLC FETs at 167 A — with the grid closing
0-FAIL over the FULL envelope, zero fans, sealed enclosure. What it costs instead: the tank
protection class revs (65 A pk envelope / 95 A pk OC / 100 A CT / 8-cap tank), 160 A NH00
fuses, a 250 A precharge class, a dual K_OUT, and a charger-level cooling cart (flow assurance
is the cart's job; the module's plate NTCs + OT ladder are its dry-run protection — E42 system
boundary).

**Why the module family stops at 50 kW (the single-lane/single-brain envelope).** A monolithic 60 needs a second
lane: two lanes = 18 PWM / ~30 analog — past ANY single-brain card (`cardMap()` throws), so a
60 kW module would carry 2 cards and cost what 2×30 already costs (≈₹853/kW for the retired
two-lane machine vs the 40's 858 — no prize for breaking commonality). A single-lane 120 fails
on non-thermal walls — silicon paralleling count, choke stack feasibility, fuse-class ladder,
transformer window, PCB copper — none of which liquid cooling touches. The ladder's shape is
physics: **per-module power is bounded by the single-lane/single-brain envelope (50 kW liquid
is its ceiling), and products above it are cabinets.**

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
| `40kw/acdc` · `40kw/dcdc` | 440 × 500 | 287 · 288 | E41 air variant (netlist scope, E36) |
| `50kw/acdc` · `50kw/dcdc` | 440 × 500 | 285 · 299 | E42 liquid variant (netlist scope; coldplate mech at thermal RFQ) |
| `control-card` | 120 × 80 | 43 | clean; one card = the module brain (E40) |

**E50 (2026-09-12): the `60kw/` and `120kw/` single-board references are OFF `main`** — they
live on branch `archive/pre-focus-E49` (with the superseded `kicad5/archive/` zips). The
architecture facts they demonstrated stand in the register: `cardMap()` refuses ≥2 lanes
(AIN needs 17 of 13), fuse/relay frames stop at 125 A/90 A switching, and the DC-DC board
cannot tile wider. Every pipeline consumer iterates `BUILDABLE_SKUS` (parts-db) and the
120 kW product cost is a module roll-up in `bom-gen`.

## The multi-module contract (audit 2026-09-08 · products re-based E55)

**100 kW = 2 × 50 kW modules; 150 kW = 3 × 50 kW modules + CSU, in a cabinet.** Every path to a bigger
single board was independently closed: board geometry (5 measurements, §above), the control card
(88 ways / HRTIMER units / 100 pins — `docs/control-card-scope.md`, and `cardMap()` now *throws*
beyond 60 kW), the HF167F relay family ceiling (R3 §3.4: 90 A switching — cannot reach 110/220 A),
and fuse frames past 125 A. This is also how the commercial market builds (module + cabinet).

## 150 kW cabinet adder (E39/E55) — cost on top of the 3 × 50 module roll-up

| line | part | ₹ @10k |
|---|---|---|
| CSU card | same control-card assembly as the module cards (1×) | ≈ card assembly cost |
| Carrier header | CONN-CARD-88-H | 45 |
| CSU supply | **PSU-15V-DIN-WDR** (MeanWell WDR-60-15, **180–550 VAC input** — it is fed L1–L2 at 400 VAC line-to-line; an 85–264 VAC MDR-class part would fail) | 1300 |
| Cabinet studs | 6 × STUD-M8 (L1/L2/L3/PE entry + BUS_P/BUS_N; M10/busbar at 400 A per the bus note) | 168 |
| CAN chain | 2 × 120 Ω + 3.32 k strap + 0 R shield bond + 0 R SGND reference tie | ≈ 2 |
| CAN/AC harness | integrator-supplied, cabinet-length dependent | — |

150 kW product (rev E55): 3×41,425 (air) + adder ₹1,834 = **₹126,109** · 3×41,773 (liquid) + adder = **₹127,153** @10k (bom-cost.md carries the air roll-up; 100 kW = plain 2× module, no adder).

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

Nothing that ships depends on the retired 60/120 kW single-board references (E50: archived to
branch `archive/pre-focus-E49` together with their parts-db override blocks and mech lines).
