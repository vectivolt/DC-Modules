<img src="../../docs/assets/banner-platform.svg" alt="" width="100%"/>

# 📋 30 kW Module Walkthrough

<sub>The canonical board pair, cell by cell — every cell reused unchanged across the family</sub>

<p>
  <img src="https://img.shields.io/badge/status-LIVE__SPEC-2ea44f?style=flat-square" alt="status: live specification"/>
  <img src="https://img.shields.io/badge/rev-E61-f2b705?style=flat-square" alt="revision E61"/>
  <img src="https://img.shields.io/badge/updated-2026--09--13-8b949e?style=flat-square" alt="updated 2026-09-13"/>
</p>

> [!NOTE]
> **Purpose** — the canonical cell-level walkthrough of one module. Every cell explained here is instantiated
> unchanged across the family; the 40 and 50 kW SKUs differ only in the deltas recorded in register rows E41, E42
> and E44 and in the variant tables of [magnetics](../../docs/magnetics.md).

## At a glance

| | |
|---|---|
| **Input** | 3-φ 285–475 VAC — full power from 330 VAC, 86 % constant-current derate at 285 VAC (E1) |
| **Output** | 150–1000 VDC · **100 A max** · CV/CC · automatic series/parallel banks |
| **Boards** | AC-DC 420 × 300 mm (6-layer) · DC-DC 460 × 320 mm (6-layer), face to face |
| **Cells** | 1 Vienna lane (3 phases) · 1 LLC channel (3 legs + 3 sections) |
| **Control** | one control card in the DC-DC slot (JB); the AC-DC board has only the 40-way harness header (JICA) |
| **Fast trips** | F.01 line 120 A pk · F.11 tank 85 A pk · DESAT on every SiC switch |
| **Cost** | **₹30,980 @10k** (₹38,279 @1k) — [cost roll-up](../../docs/bom-cost.md) |
| **Release sheets** | 30 kW AC-DC and DC-DC PDFs in [`boards/out-pdf/`](../out-pdf/) · KiCad-5 set `kicad5/DC-Modules-30kw-SHIP.zip` |

## 🔻 AC-DC board — [`acdc.tsx`](acdc.tsx)

```mermaid
flowchart LR
  J["AC studs<br/>L1 · L2 · L3 · PE"] --> F["gG fuses 80 A<br/>22 × 58"] --> MOV["MOV Δ + GDT<br/>S20K550"]
  MOV --> CM1["CMC1<br/>3-φ CM 2 mH"] --> X1["CX11–13<br/>X1 2.2 µF"] --> CM2["CMC2"] --> LDM["LDM1–3<br/>DM 14 µH (D6)"] --> X2["CX21–23 X1 4.7 µF<br/>CY1–3 Y1 4.7 nF"]
  X2 --> PRE["KPRE1 + KPRE2 80 A<br/>2 × 33 Ω pulse"]
  PRE --> PH["3 × Vienna phase<br/>A0 · B0 · C0"]
  PH --> DC[("split DC link<br/>2 × 5 × 470 µF + balance")]
  DC --> ST["DCP · DCN · PE pillars<br/>→ DC-DC board"]
  PH -. "PWM · FLT" .- HAR["40-way harness JICA<br/>→ card on the DC-DC board"]
  DC -. "isolated senses" .- HAR
  AUX["aux flyback 110 W<br/>NCP1252D · full bus"] -. "V24 · V15 · 3.3 V" .- HAR
  style PH stroke:#d19a00,stroke-width:2.5px
```

| Cell (source) | What it is | The engineering inside |
|---|---|---|
| `ViennaPhase` × 3 | one PFC phase | 165 µH-class sendust choke, 3 × 0077908A7, N = 39 ± 1 lot-trim ([D1](../../docs/magnetics.md)); **common-source 750 V SiC pair** (B3M010C075Z × 2) on one driver channel; two 1200 V / 40 A JBS diodes to the rails, which block the full bus; 10 Ω + 100 pF RC snubber (2 W) **and** an RCD clamp per node — the network that took double-pulse overshoot from 115 % to **70 %** |
| `DriverCh` × 3 | isolated gate channel | NSI6611 (DESAT, Miller clamp, UVLO, soft-off) · split Rg 4.7 / 4.7 Ω (E5) · +18 / −4 V drawn from a reinforced QA01C-18 bias module (the catalogue part is +18 / −3 V — O-11 open at §K) · two series 1 kV DESAT diodes + **47 pF blank** (E60) + 100 Ω series resistor (R5-B) · gate pull-down · Kelvin return |
| `SplitDcLink` | energy buffer | 2 × 5 × 470 µF / 450 V snap-in (415 V max per half, −40 °C category), balance resistors, sensed midpoint; window 650–830 V, **hardware OVP 860 V** (E2); per-phase film commutation caps (CB-9) |
| precharge | inrush control | 33 Ω in **two lines** plus a 2-pole bypass — a single-line resistor is a three-wire fallacy (E14b); t₉₅ ≈ 193 ms on the per-SKU deck |
| discharge | touch safety | 640 Ω active path with a 1200 V SiC switch, default-OFF through its DCN-referenced pull-down (E19): 830 → 60 V in **2.0 s** with AC present |
| `CtSensor` × 3 | phase current | Talema ACX-1100 1:2500 line CTs + **22 Ω burden** (E60) → ADC and the on-chip comparators (F.01 120 A pk) |
| `IsoVSense` × 5 | AC and bus sense | anti-surge resistor chain **inside the measured domain** + isolated amplifier + isolated 5 V bias (E25 / CB-3): AC against an artificial star, bus and midpoint against DCN |
| `AuxPower` | house power | 110 W full-bus flyback (E26 rev C): NCP1252**D**, 220 µF VCC reservoir, D4 rev D on ETD39; brown-in 321 V; V24 / V15 / 3.3 V; re-simulated per SKU at 342 / 560 / 850 V |
| harness header `JICA` | control boundary | the 40-way PFC bundle to the card; default-OFF pull-downs on every enable, relay drive and PWM at the receiving end — see [interconnect](../../docs/interconnect.md) |

## 🔺 DC-DC board — [`dcdc.tsx`](dcdc.tsx)

```mermaid
flowchart LR
  ST["DCP · DCN · PE<br/>pillars"] --> CF["film commutation caps"]
  CF --> L1["3 × LLC half-bridge leg<br/>1200 V SiC + 2 driver channels"]
  L1 --> TK["3 × LLC section<br/>4 × 46 nF Cr · 4.0 µH trim bin<br/>resonant CT · 3 × PQ50 7:7:7"]
  TK --> BR["2 × JBS bridges per section<br/>→ bank A + bank B"]
  BR --> BC["bank caps<br/>2-series 470 µF strings + film"]
  BC --> SP["S/P matrix<br/>KSER · KPARA / KPARB + 10 Ω pre-insertion<br/>K_OUT with the E12b gate"]
  SP --> OF["output filter"] --> SH["manganin shunt<br/>+ NSI1200"] --> OUT["OUT± M8 studs"]
  CARD["control card · 88-way slot JB"] -.-> SP
  CARD -.-> HMI["HMI · 2 buttons<br/>2-digit 7-segment"]
  CARD -.-> CAN["isolated CAN<br/>NSI1042-DSWR"]
  style TK stroke:#1a9fb3,stroke-width:2.5px
  style CARD stroke:#2ea44f,stroke-width:2.5px
```

| Cell | What it is | The engineering inside |
|---|---|---|
| `LlcHalfBridgeLeg` × 3 | resonant legs | SG2M023120LJ 1200 V / 23 mΩ pair, Rg 4.7 / 2.2 Ω (E6), **22 pF DESAT blank** (E60); PFM from ≈ 80 kHz at the gain-critical corner to ≈ 180 kHz, phase shift at low bank voltage; **ZVS on every edge of every power-solved corner** |
| `LlcSection` × 3 | tank and isolation | Cr = 4 × 46 nF / 1200 V pulse polypropylene · trim inductor D2-30 (2 × PQ50, N = 4, 1350 × 0.1 litz) **binned against the mated transformer's measured leakage** · resonant CT + **1.2 Ω burden** (F.11 85 A pk) · transformer **3 × PQ50/50, 7:7:7**, Lm 63 µH ± 7 %, 0.071 mm litz primary + 0.10 mm foil secondaries, reinforced barrier, PD-sampled ([D2 / D3](../../docs/magnetics.md)) |
| JBS bridges | rectification | 24 × C4D20120D 1200 V / 20 A across the three sections — diodes over synchronous rectification on a quantified ₹/W (E11; SR stays a premium variant) |
| `SeriesParallelRelayMatrix` | range extension | K_SER · K_PARA / K_PARB with **10 Ω pulse-rated pre-insertion** (a hard close across a 2 V mismatch is 205 A — simulated, E12) · **K_OUT with the E12b gate** · mirror contact readback on every relay (E30) · two-stage 74HC02 hardware exclusion (R5-D) |
| `OutputShunt` | current truth | manganin + NSI1200 isolated amplifier, Kelvin taps; ± 0.2 % after EOL calibration (Monte-Carlo) |
| `ConfigHmi` | field configuration | 2 buttons + 2-digit display via 74HC595 + 2 NPN multiplexers — address, group, `F.xx` paging |
| `IsolatedCan` | external world | CAN 2.0B, 125 kbps, 29-bit, isolated + CM choke + TVS + jumpered 120 Ω ([protocol](../../docs/can-protocol.md)) |
| `CoilDriver` | relay drive | 24 V coils, flyback-clamped, economised to ~40 % hold after pull-in |

## Control interface (E40 — one brain per module)

The card sits only in the DC-DC board's 88-way `JB` slot and runs both boards: LLC pairs on HRTIMER units, the
three Vienna PWMs over the harness, resonant and line CTs, bank / output senses, S/P relay drives and readbacks, HMI
and isolated CAN. The pin map is generated by `calculations/control/umod-pinmap.mts` (75 of 82 MCU pins), and the
module-interconnect audit proves every way lands on real electronics on both sides.

## Protections on this pair

| Layer | On this module |
|---|---|
| **Hardware, µs** | line CT comparators F.01 120 A pk → HRTIMER kill · resonant CT comparators F.11 85 A pk · DESAT on every SiC switch · bus OVP 860 V · output OVP · driver UVLO (aux collapse holds gates low) |
| **Safety chain** | watchdog WDO ≡ NRST (a hung brain restarts with enables low) · GATE_EN chains with default-OFF pull-downs across the harness · two-stage relay exclusion |
| **Supervisory** | the full F.xx ladder ([protection thresholds](../../docs/protection-thresholds.md)), exercised by the 26-scenario suite and the C firmware (**54 / 54** under sanitizers) |

## Top cost drivers (@10k, from [`bom-30kw.csv`](../../calculations/out/bom-30kw.csv))

| MPN | Description | Qty | ₹ / unit | ₹ ext |
|---|---|---:|---:|---:|
| `IND-PFC-165u` | PFC choke D1-30, 3 × 0077908A7 sendust | 3 | 828 | **2,484** |
| `ELH-470u450` | 470 µF 450 V snap-in, −40 °C category (DC link + bank strings) | 18 | 120 | **2,160** |
| `SG2M023120LJ` | SiC MOSFET 1200 V 23 mΩ TO-247-4L | 6 | 312 | **1,872** |
| `C4D20120D` | SiC JBS 1200 V 20 A (secondary bridges) | 24 | 72 | **1,728** |
| `XFMR-LLC-10K` | LLC section transformer 3 × PQ50/50, 7:7:7 | 3 | 544 | **1,632** |
| `B3M010C075Z` | SiC MOSFET 750 V 10 mΩ TO-247-4 | 6 | 264 | **1,584** |
| `PP-46n-1200` | 46 nF 1200 V pulse film (resonant) | 12 | 54 | **653** |

Mechanical lines (assembly and EOL ₹1,653, heatsinks ₹1,305, the two PCBs ₹2,262, enclosure ₹870) and the lever
plan are in the [cost roll-up](../../docs/bom-cost.md); the method is in the [BOM guide](../../docs/bom-guide.md).

---

<div align="center">
<sub><a href="../README-product-structure.md">← Product Structure</a> &nbsp;·&nbsp; <a href="../../docs/README.md">🧭 Documentation hub</a> &nbsp;·&nbsp; <a href="../../docs/protection-thresholds.md">Protection Thresholds →</a></sub>

<sub>Vectivolt DC-Modules · documentation rev E61 · every number reproduces with <code>sh calculations/run-all.sh</code></sub>
</div>
