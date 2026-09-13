# Platform Architecture — rev E60 (2026-09-13)

<p align="left"><img src="https://img.shields.io/badge/status-LIVE__SPEC-2ea44f?style=flat-square" alt="LIVE__SPEC"/> <img src="https://img.shields.io/badge/rev-E60-f2b705?style=flat-square" alt="rev"/> <img src="https://img.shields.io/badge/updated-2026--09--13-555?style=flat-square" alt="updated"/></p>

> **Purpose** — The platform in one read: family, power path, control plane, protection map, rails, thermal snapshot.


One ~10 kW **cell pair** (Vienna PFC phase cell + 3-φ LLC section ×3) on one two-board sandwich
(AC-DC lower + DC-DC upper, faces inward, semiconductors to the outer heatsinks), **one control
card — one brain per module** (GD32G553VET7, E40), one external CAN, one 2-button/2-digit HMI.
Four module SKUs share the platform; higher ratings are **cabinets of modules**. Values below are
the frozen set (register E1–E60 in [`assumptions.md`](assumptions.md)); every number reproduces
from `calculations/run-all.sh`.

```mermaid
flowchart LR
  AC(["3φ 285–475 VAC"]) --> EMI["gG fuse · MOV Δ + GDT<br/>2× CM + DM EMI stages"]
  EMI --> PRE["precharge<br/>2× 33 Ω + 2-pole bypass"]
  PRE --> V["VIENNA PFC · 50 kHz<br/>750 V SiC pairs · 1200 V JBS"]
  V --> BUS[("split DC bus<br/>650–830 V · OVP 860")]
  BUS --> LLC["3-φ LLC · fr 140 kHz<br/>1200 V SiC half-bridges"]
  LLC --> XF["3× section transformers<br/>D3 · E60 copper · Lm 63 µH"]
  XF --> BK["banks A + B<br/>SiC JBS bridges"]
  BK --> SP["S/P matrix + exclusion<br/>pre-insertion · K_OUT"]
  SP --> OUT(["150–1000 VDC<br/>100/133/167 A"])
  CARD["ONE control card<br/>GD32G553VET7 · RATING strap"] -. "40-way harness (PFC bundle)" .-> V
  CARD --- LLC
  AUX["110 W full-bus aux<br/>NCP1252D · D4 rev D"] --> CARD
  BUS --> AUX
  style V stroke:#f2b705,stroke-width:2.5px
  style LLC stroke:#f2b705,stroke-width:2.5px
  style SP stroke:#e3763c,stroke-width:2.5px
  style CARD stroke:#2ea44f,stroke-width:2.5px
```

## The family (E40/E41/E42/E44)

| Module | Silicon vs 30 kW | Cooling | ₹@10k · ₹/kW |
|---|---|---|---|
| **30 kW** | baseline (single B3M pair/phase, single SG2M/position) | air, 2 fans | 30,980 · 1,033 |
| **40 kW** (E41) | PFC pairs **paralleled** (2× B3M/position, own 2.2 Ω each) | air, 3 fans | 35,891 · 897 |
| **50 kW** (E42) | 40 kW silicon (single LLC FETs — the coldplate buys it) | **liquid**, 0 fans | 41,865 · 837 |
| **50 kW air** (E44) | PFC **and** LLC paralleled (per-package conduction quarters) | air, 4 fans | 41,516 · **830 — cheapest** |
| Products (E55) | **100 kW = 2×50** (no CSU) · **150 kW = 3×50 + CSU** (same card, strap role) | | 100a ₹83,032 (830) · 150a ₹1,26,382 (843) — generated `bom-cost.md` (E60) |

## Power path (per module; all four SKUs, one drawing family)

```
3φ 285–475 VAC (full P ≥330 V)
 → fuse (80/125/160 A gG per SKU) • MOV Δ + GDT • 2-stage CM/DM EMI (D6/D7 per SKU)
 → precharge 33 Ω ×2 + 2-pole bypass relay (E14 rev B)
 → Vienna 3-level PFC, 50 kHz: per-SKU D1 choke (biased-L governs — see magnetics.md),
   common-source B3M010C075Z pair (×2 paralleled at 40/50), 2× 1200 V JBS to rails,
   RC snubber + RCD clamp per node, DESAT (fwd, 47 pF blank) + line-CT→CMP→HRTIMER trip (rev, E47/E48;
   E60 class F.01 = 120/155/195 A pk on 22/18/13 Ω burdens)
 → split 800 V bus (650–830 V commanded), 2×(5/6/8× 470 µF) per SKU + films, HW OVP 860 V,
   two-phase discharge: 640 Ω active to the 321 V aux floor, then passive balance
   (370/222/296 s to <60 V at 30/40/50 — label: isolate, wait 10 min, AND verify; E47/E49)
 → 3-phase half-bridge LLC, SG2M023120LJ (×2 paralleled on the air-50), PFM around fr 140 kHz:
   per-SKU Cr bank (4×46 n / 6×33 n / 8×27 n), binned trim (D2: 2×PQ50 N4 · 1×E70 N5 · 2×E70 N3) + leakage = Lr,
   section transformer (E51 revs: 3×PQ50 7:7:7 · 2×E70 6:6:6 · 2×E70 5:5:5; E60 copper: 0.071 mm litz primary,
   0.10/0.127 mm foil secondaries), Lm 63 µH ±7 %, star primaries; resonant CT F.11 = 85/115/145 A pk
 → 2 secondaries/section → 2× SiC JBS bridges → floating banks A, B
 → S/P matrix: K_PAR_A/B (10 Ω pre-insertion), K_SER, K_OUT (dual at 50 kW), bank bleeders
   (VOM1271 PV-driven, R8 drive), two-stage 74HC02 exclusion (KSER ∧ ¬KPAR* ∧ ¬KPRE*, R5-D)
 → output filter → manganin shunt (50 mV, per-SKU rating; positive = delivering, R6-E)
 → studs 150–1000 V · 100/133/167 A per SKU
```

## Control plane (E40 single brain)

- **One control card** in the DC-DC slot runs Vienna + LLC together: all nine PWMs on HRTIMER
  units (LLC pairs ST0–2 with hardware dead-time, PFC singles ST3–5), 22 analog channels,
  one merged FLT on HRTIMER_FLT2. The 88-way slot carries the DC-DC side; a **40-way
  straight-through harness** (HARNESS40, generated) carries the whole PFC bundle to the AC-DC
  board. No inter-MCU link exists.
- **Identity = one RATING strap** (E24 rev G): 0 R → 30 kW · 1 k → 40 kW · 3.32 k → cabinet
  CSU · 10 k → 50 kW liquid · 15 k → 50 kW air · open → fault. One card p/n, one firmware
  image, family-wide (1/2/3–5 cards at module/2×/cabinet scale).
- Loops: per-phase current (fc ≈3 kHz, PM 50°), bus voltage (15 Hz) with bus_ref =
  clamp(max(2·bank/0.95, 1.08·√2·VLL), 650, 830) (E60 FW-R7 line-tracking floor), PFC reference clamp 1.05× (FW-R6),
  PLL + midpoint balance; LLC CV/CC with mode map
  (PFM / phase-shift <260 V bank / burst), S/P FSM with pre-insertion, weld check, the
  E12b K_OUT gate and SER start only above 525 V (FW-R8). External CAN 2.0B 125 kbps, 29-bit ([`can-protocol.md`](can-protocol.md)).
- Supervisory C99 core (`firmware/`) is the normative logic — 26 scenarios + CSU + codec +
  fuzz + invariants, **54/54 under ASan/UBSan** ([`firmware-guide.md`](firmware-guide.md)).

## Protection map (full table: [`protection-thresholds.md`](protection-thresholds.md))

Hardware-fast, no firmware in the loop: per-phase line-CT → on-chip comparator (A/B/C on
CMP7/CMP1/CMP2, instance-verified E48) → HRTIMER kill for the DESAT-blind polarity; NSI6611
DESAT (100 Ω series, R5-B; **E60 blanks 22 pF LLC / 47 pF Vienna** — worst response 1.44 / 2.21 µs, inside 75 % of the SiC
short-circuit withstand) for the forward polarity; resonant OC comparators (F.11); bus/output OVP;
driver UVLO; the two-stage relay exclusion; and the watchdog — whose open-drain WDO both
gates the enable AND **resets the MCU** (WDO ≡ NRST, R5-A/R6-A: a hung brain restarts with
every enable low). Supervisory firmware carries the ~30-row F.xx ladder with per-SKU windows.

## Auxiliary and rails

Full-bus 110 W flyback (D4 rev D — ETD39, E52 sat margin): **NCP1252D** (R6-G — the A-suffix could not cold-start:
120 ms mandatory delay vs 1 V hysteresis), 220 µF VCC reservoir, brown-out at 321 V bus,
cold start ≈5–6 s nominal (≈8 s low-line). Rails: V24 (coils/fans), V15 (bias + card feed),
per-board 3.3 V sync bucks (100 k/27 k EN dividers, R4-4), reinforced-class isolated bias
modules (QA01C-18, +18/−3) for every floating driver/sense domain.

## Efficiency / thermal snapshot (per-variant engines; grid 5,544 pts, 0 fail)

η at 400 VAC / full load: **97.19 / 96.92 / 96.68 / 96.82 %** (30/40/50L/50A; peaks
98.45–98.58 % — loss budget rev E60, LLC current from the power-solved nominal). Worst-corner Tj ≤150 °C (computed folds) vs the
150 °C policy ceiling, every device inside its own acceptance line (`stress-audit.mjs`, in
run-all). Cooling: extrusions + 2/3/4 fans, or the E42 coldplate pair (sealed, zero fans).

## Revision trail

The power path froze at Phase 9; everything since is closure and variants, recorded
decision-by-decision in the register (E17 sandwich · E25–E33 production closure · E35–E39
audits · E40 single brain · E41/E42/E44 variants · E43 family verification · **E45–E49 the
five external-review rounds R4–R8** · E50–E55: repo focus, the independent magnetics
recomputation and re-issues, production margins, docs restructure, deep clean, and the E55
product ladder · E56–E59: EasyEDA layer removed, BOM maturity, magnetics temperature FMEA, fault-energy gate ·
**E60: current coordination, AC copper and the simulation re-basis** — [`current-coordination.md`](current-coordination.md)). Dated fix logs: `design-review-production*.md`,
`history/review-response-r3.md`; the audit trail summary lives in the top-level
[`README.md`](../README.md).
