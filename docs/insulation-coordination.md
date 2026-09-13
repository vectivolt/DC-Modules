<img src="assets/banner-power.svg" alt="" width="100%"/>

# 🧱 Insulation Coordination

<sub>The barrier map, creepage and clearance values, the standards matrix and the hipot plan</sub>

<p>
  <img src="https://img.shields.io/badge/status-LIVE__SPEC-2ea44f?style=flat-square" alt="status: live specification"/>
  <img src="https://img.shields.io/badge/rev-E73-f2b705?style=flat-square" alt="revision E73"/>
  <img src="https://img.shields.io/badge/updated-2026--09--14-8b949e?style=flat-square" alt="updated 2026-09-14"/>
</p>

> [!NOTE]
> **Purpose** — the barrier map, creepage and clearance design values, the SELV architecture and the hipot plan.

## At a glance

| Rating | Value |
|---|---|
| Overvoltage category | **OVC III** at AC mains — 300 V line-to-neutral system (415 V line-to-line) |
| Pollution degree | **PD2** inside the enclosure (filtered forced air) |
| Altitude | **≤ 2000 m** (derate note above 2000 m in the manual) |
| Material group | **IIIa** (CTI ≥ 175), FR-4 baseline |
| Environment | A11 rev C: −30…+75 °C operating, 5–95 % RH non-condensing; insulation materials quoted to −40 °C |
| Basis standards | IEC 60664-1 (coordination) · IEC 62477-1 (PECS safety — decides most clearances) · IEC/IS 61851-23 (DC EVSE system) · IEC 61000-4-x (immunity) · CISPR 32 / EN 55032-class conducted (pre-compliance) |

> [!CAUTION]
> **No compliance is claimed.** This is the design-to table; every value is to be verified against the purchased
> editions of the standards at design qualification, and the checklist at the end tracks what is still open.

## 1. The barrier map

```mermaid
flowchart LR
  AC["AC mains<br/>300 V L-N · OVC III"] -- "basic · 4 kV impulse<br/>hipot 2.5 kV DC" --- PE(("PE"))
  AC --- BUS["DC bus<br/>830 V (primary)"]
  BUS -- "REINFORCED<br/>D3 transformer · D4 aux · iso ICs ≥ 5 kVrms<br/>hipot 4 kV" --- OUT["output banks<br/>1000 VDC, floating"]
  OUT -- "basic · hipot 1.5 kV" --- PE
  BUS -- "functional<br/>isolated amplifiers + dividers" --- CTRL["control domain<br/>SELV"]
  BUS -- "REINFORCED<br/>D4 aux transformer" --- CTRL
  CTRL -- "1 MΩ ∥ 4.7 nF Y1<br/>soft bond" --- PE
  CTRL -- "iso CAN ≥ 5 kV" --- CAN["CGND<br/>external CAN"]
  BUS -- "basic (E65)<br/>bonded magnetics D1 · D2 · D3<br/>gap pad / clamp cap / bore sleeve" --- PE
  style OUT stroke:#bc4e9c,stroke-width:2px
  style CTRL stroke:#2ea44f,stroke-width:2px
```

## 2. System insulation classes

| Barrier | Class | Working V | Impulse / test |
|---|---|---|---|
| AC line ↔ PE | basic | 300 Vrms | 4 kV imp; hipot 2.5 kV DC 1 min (EOL) |
| AC/primary ↔ secondary (output) | **REINFORCED** | 1000 VDC working (output) vs primary 830 VDC | 8 kV-class imp path via transformer: D3 TIW + margins, hipot 4 kV; iso components ≥5 kVrms parts (NSI66xx/NSI1042-DSWR/NSI1200, MORNSUN modules → **E60: Mornsun carries a US OFAC flag — qualify MEAN WELL / RECOM / CUI-class reinforced modules**) |
| Output ↔ PE | basic (IT-side per 61851-23 system: IMD at charger level, excluded scope §1) | 1000 VDC | hipot 1.5 kV; creepage per 62477-1 D2 table |
| Bus (830 V) ↔ control (primary-referenced) | functional | 830 V | spacing per functional table; HV dividers = 8× series 1206 (per-resistor ≤104 V working, 200 V rated) |
| Board-to-board studs | same domain (bus) | 830 V | stud-stud spacing ≥14 mm |
| **E65** D1 PFC choke winding ↔ PE-bonded web / plate / M6 bolt (gap pad, insulating clamp cap, bore sleeve) | basic (in series with AC line/bus ↔ PE) | D1 Û_rp ≤ 540 V recurring peak (switch end vs neutral, 50 kHz ripple) | 4 kV impulse type test on the bonded assembly · 100 % part hipot 2.5 kV DC 1 min winding ↔ bond-face + bore electrodes · no PD test (Û_rp ≤ 700 V) |
| **E67** D2 external Lr and D3 cell primary winding ↔ gap-padded ferrite core (core treated as PE) | basic (bus ↔ PE) | D2/D3 Û_rp 1270 / 1260 / 1280 / 1280 V at 83–203 kHz (30 / 40 / 50 / 50a; full-bridge tank node = bus/2 + Cr peak + Vienna midpoint) | 100 % winding ↔ bonded-face foil 2.5 kV DC · PD sample test 5/lot: PD extinction ≥ 2.0 / 1.9 / 2.0 / 2.0 kV, ≤ 10 pC |
| **E67** D3 cell secondary winding ↔ PE-bonded web / plate (gap pad) | basic (output ↔ PE) | ≤ 1000 V DC (top of the HIGH-mode stack), ripple < 10 V | 100 % part hipot 1.5 kV DC (D3 secondary) · module output ↔ PE 1.5 kV · DC stress: no recurring-peak PD row |

## 3. Creepage and clearance design values (PD2, mat IIIa — from 62477-1-class tables, VERIFY at DQ)

| V working | Clearance | Creepage used |
|---|---|---|
| 300 Vrms AC (line-line/PE, basic) | 3.0 mm | 4.0 mm |
| 830 VDC bus (functional) | 4.0 mm | 5.5 mm (slot under TO-247 rows where <5.5) |
| 1000 VDC output (basic to PE) | 4.5 mm | 6.3 mm |
| Reinforced pri↔sec (board area under transformer/iso parts) | 8.0 mm | 12.6 mm + routed slots under iso ICs |
| **E65** D1 winding ↔ bolt, washer, web edge (switch end rides the bus node) | 4.0 mm | 5.5 mm — clamp cap and sleeve set it, not the layout |
| **E65 / E67** D2 / D3 winding ↔ core over the former flanges (B66372B2000 and the E67 3-set cell former) | 4.0 mm | 8.0 mm, or VPI-cemented joints qualified as solid insulation by the PD sample test — VERIFY at DQ (> 30 kHz: IEC 60664-4) |

Layout rules bank (for the later PCB phase): slots under every iso component; guard the S/P relay
area (banks float — both banks treated at 1000 V class to PE); Y-caps only across defined barriers
(3 line-PE + 2 output-PE — **Y1 440 VAC class since rev C/MR-4**; "Y2" in older text is historic);
no SELV track inside HV zones; CAN connector domain (CGND) floats — 4 mm to everything, with the
rev-D 1 MΩ ∥ 4.7 nF static bleed to DGND.

## 4. §47 design-for-compliance checklist (excerpt, full tracking in the [verification matrix](verification-matrix.md))

- [x] Insulation coordination table (this doc) — VERIFY table values against purchased standard editions
- [x] Protective separation of external CAN (iso 5 kV part + floating CGND + TVS)
- [x] Touch-discharge: **bus** < 60 V in **2.0 / 2.4 / 3.2 s** at 30 / 40 / 50 kW (640 Ω active, F.21 per-SKU supervision); **banks** < 60 V in **0.37 / 0.49 / 0.58 s** via the commanded bleeders (F.21b) — the film-only banks (E68c) hold 2–4 J at 500 V; passive balance chains remain the backup. Tool-access marking per 62477 still applies for the passive-only failure case
- [x] Single-fault: aux collapse → gates held low (T-09); relay weld detected (F.18); fan fail derate
- [ ] Leakage current budget through Y network (calc pending with final Y values, EMI rev)
- [ ] 61851-23 system items delegated to charger integrator documented in manual (IMD, output contactors, gun lock)
- [ ] EMC immunity plan (surge 61000-4-5 on MOV/fuse network — §27 energy calc at EMI rev)
- [ ] **E65** bonded magnetics: gap-pad dielectric type test at compressed thickness · D2/D3 PD sample test · per-core common-mode capacitance counted in the LISN budget
- [ ] **E67** D3 cells: 100 % pri ↔ sec 4.25 kV DC per cell (two per module) · PD type test per cell former (2-set and 3-set)


---

## 5. Bonded magnetics

A magnetic that is gap-padded or clamped to PE-bonded metal is part of the **basic** barrier to PE (E65). The module EOL hipot
(2.5 kV DC line ↔ PE) stresses those paths, so each carries specified solid insulation and, where the recurring peak exceeds
700 V, a partial-discharge sample test.

- **Recurring peaks are computed, not assumed** — `stress-audit.mjs` [INS] reads `vienna-switched.csv` (D1 switch end vs grid
  neutral, recurring cases) and every `llc-stress.csv` corner (D2 / D3: bus/2 + resonant-capacitor peak + the Vienna
  midpoint-to-neutral peak, ideal switches, CM filter not credited), and fails if the rows above stop matching. The full-bridge
  tank node computes **1270 / 1260 / 1280 / 1280 V** at 30 / 40 / 50 / 50a kW, so the PD sample extinction is **≥ 2.0 / 1.9 / 2.0 / 2.0 kV**.
- **D1 build-up** (the pad touches the winding, not the core): fiberglass-reinforced silicone gap pad 1.0 mm, ≥ 3 W/mK, ≥ 5 kVAC
  (ASTM D149), qualified at its 0.8 mm compressed thickness for 2.5 kV DC 1 min and 4 kV impulse, RTI ≥ 150 °C, UL 94 V-0; a
  GF-PPS clamp cap (≥ 4.0 mm clearance / 5.5 mm creepage winding ↔ bolt head and washer) and a bore sleeve (≥ 1.0 mm wall) on the
  M6 bolt. The 0.13 mm wrap and enamel stay functional. The D1 winding stays under 700 V recurring, so no PD test.
- **D2 / D3**: the ferrite core is conductive and touches the pad, so the winding ↔ core insulation (former, tapes, VPI) is the basic
  barrier; the pads are specified for heat and low dissipation factor, not credited as insulation.
- **D3 reinforced barrier**: TIW primary plus ≥ 3 barrier-tape layers each side of the shields, in two cells per module; the 3-set
  former used by the 40 and 50 kW cells is new tooling, so its flange creepage is a first-article check.
- **Open** (not this page's to close): the pad's common-mode capacitance on the D2 / D3 tank node (~50–70 pF per core) in the LISN
  budget.

## 6. Isolated components and the SELV domain

- **No resistive path crosses the reinforced barrier.** Bank and output voltages are sensed inside their own domains by isolated
  amplifiers; the primary ↔ secondary barrier is purely magnetic, optical or iso-amp.
- **The D4 aux transformer barrier is safety-load-bearing** for the SELV control domain (its primary sits at bus potential):
  reinforced, 100 % hipot in production, never sampled.
- **Isolated amplifiers and their 5 V bias modules are reinforced-rated** for their domain's working voltage (1000 V output domain /
  830 V bus / AC mains star) — the BOM specifies reinforced-class modules at every Bias5 / PSCAN / PSSH position; the same
  certificate audit applies to the gate-bias and discharge-driver modules, whose barriers parallel the NSI6611's reinforced one.
- **Control domain to PE**: 1 MΩ ∥ 4.7 nF Y1 soft bond — no hard earth loop, leakage < 1 mA budget.

---

<div align="center">
<sub><a href="thermal-report.md">← Thermal Report</a> &nbsp;·&nbsp; <a href="README.md">🧭 Documentation hub</a> &nbsp;·&nbsp; <a href="busbar-drawings.md">Busbar Drawings & Joint Spec →</a></sub>

<sub>Vectivolt DC-Modules · documentation rev E73 · every number reproduces with <code>sh calculations/run-all.sh</code></sub>
</div>
