# Busbar Drawings & Joint Spec (§34/§49-16) — rev A

<p align="left"><img src="https://img.shields.io/badge/status-LIVE__SPEC-2ea44f?style=flat-square" alt="LIVE__SPEC"/> <img src="https://img.shields.io/badge/rev-E52-f2b705?style=flat-square" alt="rev"/> <img src="https://img.shields.io/badge/updated-2026--09--12-555?style=flat-square" alt="updated"/></p>

> **Purpose** — Busbar/stud copper: sections, lengths, joint spec, per-SKU currents (busbar-calc).


Sizing table: `calculations/out/busbar.csv` (generated). All bars ETP copper, tin-plated 3–5 µm,
bend radius ≥1.5×t, chamfered edges. Insulation: heat-shrink 1 kV class except joint pads.
DC+/DC− run as a laminated pair (≤2 mm spacing, Nomex between) from PFC output to the B2B studs —
loop inductance target ≤40 nH/300 mm (partial-L per table). OUT± maintain 6.3 mm creepage to
chassis (insulation-coordination.md). Aluminium: permitted only on paths marked "Al viable"
(≥2 A/mm² sizing, Cu-Al bimetal transition washers, alodine + joint compound, re-torque at 24 h,
creep-rated hardware) — per-path verdicts in the CSV; joints into the EMI filter, commutation
loops, and the shunt Kelvin zone are Cu-mandated.

## Joint schedule (all SKUs)
| Joint | Hardware | Torque | Acceptance |
|---|---|---|---|
| B2B stud pillars DCP/DCN/PE | M8×1.25, belleville + flat | 12 N·m | ≤50 µΩ each (EOL milliohm) |
| Relay lugs (K_SER/PAR/OUT) | M6 | 8 N·m | ≤80 µΩ |
| Shunt terminals | M8, Kelvin taps untouched | 12 N·m | cal validates |
| AC input studs | M8 | 12 N·m | ≤60 µΩ |
| Choke lug → PCB pad | M5 | 5 N·m | visual + pull |

Thermal: worst bar ΔT from table ≤ 25 °C at rated (see CSV); bars share tunnel airflow.
