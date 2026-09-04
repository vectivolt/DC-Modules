# Insulation Coordination (§33) + Standards Matrix (§47) — rev A

Basis standards (current editions to be pulled at DQ): IEC 60664-1 (coordination), IEC 62477-1
(PECS safety, decides most clearances), IEC/IS 61851-23 (DC EVSE system level), IEC 61000-4-x
(immunity), CISPR 32/EN 55032-class conducted (pre-compliance basis). **No compliance is claimed** —
this is the design-to table (§47 checklist at end).

## System insulation classes

Ratings: OVC III at AC mains 300 V line-neutral system (415 V L-L), pollution degree PD2 inside
enclosure (filtered forced air), altitude ≤2000 m (>2000 m derate note in manual), material group
IIIa (CTI ≥175) FR-4 baseline.

| Barrier | Class | Working V | Impulse / test |
|---|---|---|---|
| AC line ↔ PE | basic | 300 Vrms | 4 kV imp; hipot 2.5 kV DC 1 min (EOL) |
| AC/primary ↔ secondary (output) | **REINFORCED** | 1000 VDC working (output) vs primary 830 VDC | 8 kV-class imp path via transformer: D3 TIW + margins, hipot 4 kV; iso components ≥5 kVrms parts (NSI66xx/NSI1042/NSI1200, MORNSUN modules) |
| Output ↔ PE | basic (IT-side per 61851-23 system: IMD at charger level, excluded scope §1) | 1000 VDC | hipot 1.5 kV; creepage per 62477-1 D2 table |
| Bus (830 V) ↔ control (primary-referenced) | functional | 830 V | spacing per functional table; HV dividers = 8× series 1206 (per-resistor ≤104 V working, 200 V rated) |
| Board-to-board studs | same domain (bus) | 830 V | stud-stud spacing ≥14 mm |

## Creepage/clearance design values (PD2, mat IIIa — from 62477-1-class tables, VERIFY at DQ)

| V working | Clearance | Creepage used |
|---|---|---|
| 300 Vrms AC (line-line/PE, basic) | 3.0 mm | 4.0 mm |
| 830 VDC bus (functional) | 4.0 mm | 5.5 mm (slot under TO-247 rows where <5.5) |
| 1000 VDC output (basic to PE) | 4.5 mm | 6.3 mm |
| Reinforced pri↔sec (board area under transformer/iso parts) | 8.0 mm | 12.6 mm + routed slots under iso ICs |

Layout rules bank (for the later PCB phase): slots under every iso component; guard the S/P relay
area (banks float — both banks treated at 1000 V class to PE); Y-caps only across defined barriers
(3 line-PE Y2 on AC-DC; 2 output-PE Y2 on DC-DC); no SELV track inside HV zones; CAN connector
domain (CGND) floats — 4 mm to everything.

## §47 design-for-compliance checklist (excerpt, full tracking in verification matrix)

- [x] Insulation coordination table (this doc) — VERIFY table values against purchased standard editions
- [x] Protective separation of external CAN (iso 5 kV part + floating CGND + TVS)
- [x] Touch-discharge: bus <60 V in ≤2 s active +100k passive backup (E14, F.21 supervision)
- [x] Single-fault: aux collapse → gates held low (T-09); relay weld detected (F.18); fan fail derate
- [ ] Leakage current budget through Y network (calc pending with final Y values, EMI rev)
- [ ] 61851-23 system items delegated to charger integrator documented in manual (IMD, output contactors, gun lock)
- [ ] EMC immunity plan (surge 61000-4-5 on MOV/fuse network — §27 energy calc at EMI rev)
