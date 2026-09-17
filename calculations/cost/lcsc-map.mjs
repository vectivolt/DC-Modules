// LCSC part numbers per design part family.
//
// Two kinds of entry, deliberately kept apart — a purchasable part number must never be
// guessed:
//   ORDERABLE  a specific LCSC part that meets the design rating, verified against the LCSC
//              catalogue (2026-09-05/06).
//   CLASS      the design specifies a rating, not a part (film/X/Y capacitors, MLCCs, power
//              ceramics, precision dividers). A generic symbol stands in on the schematic.
//              Purchasing selects against the stated rating; codes here would be fiction.
//
// This file is the source — edit here.

export const LCSC = {
  // ---- ORDERABLE: semiconductors ----
  "ULN2803A":          { lcsc: "C2865085",   status: "ORDERABLE", note: "TI ULN2803ADW SOIC-18" },
  "NSI6611":           { lcsc: "C7470934",   status: "ORDERABLE", note: "NSI6611ASC-Q1SWR" },
  "TPS54202-class":    { lcsc: "C191884", mpn: "TPS54202DDCR",    status: "ORDERABLE", note: "TPS54202DDCR" },
  "TPS3430-class":     { lcsc: "C2870545", mpn: "TPS3430WDRCR",   status: "ORDERABLE", note: "TPS3430WDRCR" },
  "74HC11":            { lcsc: "C5524384",   status: "ORDERABLE", note: "74HC11D SOIC-14" },
  "74HC595":           { lcsc: "C19192516",  status: "ORDERABLE", note: "74HC595D SOP-16" },
  "TLV9061-class":     { lcsc: "C398358", mpn: "TLV9061IDBVR",    status: "ORDERABLE", note: "TLV9061IDBVR" },
  "AMC1311-class":     { lcsc: "C456277", mpn: "AMC1311DWVR",    status: "ORDERABLE", note: "AMC1311DWVR" },
  "AMC1350-class":     { lcsc: "C5214206", mpn: "AMC1350QDWVRQ1",   status: "ORDERABLE", note: "AMC1350QDWVRQ1" },
  "NSI1200-DSWR":      { lcsc: "C3029747",   status: "ORDERABLE", note: "NSI1200-DSWVR" },
  "NSI1042":           { lcsc: "C3445856",   status: "ORDERABLE", note: "NSi1042-DSWR SO-16 isolated CAN" },
  "PESD1CAN":          { lcsc: "C143073",    status: "ORDERABLE" },
  "VOM1271T":          { lcsc: "C146286",    status: "ORDERABLE" },
  "TLP152-class":      { lcsc: "C17255258", mpn: "TLP152",  status: "ORDERABLE", note: "TLP152(E" },
  "S8050":             { lcsc: "C2146",      status: "ORDERABLE", note: "JLCPCB Basic" },
  "US1M":              { lcsc: "C412437",    status: "ORDERABLE", note: "JLCPCB Basic" },
  "US2G":              { lcsc: "C49263",     status: "ORDERABLE" },
  "UF-400V-3A":        { lcsc: "C3039981", mpn: "US3M",   status: "ORDERABLE", note: "US3M 1 kV 3 A" },
  "1N4148WS":          { lcsc: "C2128",      status: "ORDERABLE", note: "JLCPCB Basic" },
  "SMBJ26A":           { lcsc: "C127562",    status: "ORDERABLE" },
  "SMBJ16A":           { lcsc: "C151859",    status: "ORDERABLE" },
  "SIC-SBD-1700V":     { status: "CLASS", spec: "SiC Schottky ≥1700 V, IF(AV) ≥1 A, IFRM ≥10 A at tp ≤1 µs, no forward recovery — aux RCD clamp DCLA (E65: blocks 860 V + Vc at ≤80 %)", note: "E65 retired the ORDERABLE STTH112U (C56792, 1.2 kV) — it blocked 1.3 kV. Candidates to qualify at RFQ: GeneSiC GAP3SLT33-214 (3.3 kV SMB — confirm IFRM), Littelfuse LSIC2SD170B-class (1.7 kV TO-247-2), Wolfspeed C3D-170 class; never a guessed C-number" },
  "SIC-750V-20mR":     { status: "CLASS", spec: "SiC MOSFET 750 V 20 mΩ TO-247-4 class (E69a 30 kW PFC) — BASiC/SiChain/Sanan RFQ" },
  "SIC-750V-15mR":     { status: "CLASS", spec: "SiC MOSFET 750 V 15 mΩ TO-247-4 class (E69a 40 kW PFC) — BASiC/SiChain/Sanan RFQ" },
  "B3M010C075Z":       { lcsc: "C5713521",   status: "SECOND-SOURCE", note: "C3M0021120K 1200 V/21 mΩ TO-247-4 — BASiC 750 V/10 mΩ not on LCSC; requalify Vds" },
  "SG2M023120LJ":      { lcsc: "C5713523",   status: "SECOND-SOURCE", note: "R3: LCSC C5713523 is Wolfspeed C3M0016120K (1200 V/16 mOhm) — NOT the SiChain part, so vendor/price/RdsOn on this row describe the second source, not the primary. Pinouts are identical (1=D/tab 2=S 3=driver source 4=G) so there is no footprint risk. Gate drive differs: SiChain -4/+18 V for 23 mOhm, Wolfspeed C3M -4/+15 V." },
  "SICJBS-1200-10":    { lcsc: "C7435087", mpn: "GC4D10120H",   status: "ORDERABLE", note: "GC4D10120H 1200 V SiC JBS" },
  "SICJBS-1200-20":    { lcsc: "C5713501", mpn: "C4D20120D",   status: "ORDERABLE", note: "C4D20120D 1200 V SiC JBS" },
  "SICJBS-1200-40":    { lcsc: "C7435099", mpn: "GC4D20120D",   status: "REVIEW", note: "E80 DO-NOT-ORDER (reviews HR-03/R15 CONFIRMED): GC4D20120D is a TO-247-3 DUAL common-cathode die (pin1/pin3 anodes, pin2+tab cathode), 16.5 A/leg at Tc 135 °C, IFSM 71 A/leg 10 ms — not the 2-terminal 40 A part this row requires, and the drawn footprint is 2-pin. Resolve at RFQ: a true single-die ≥40 A TO-247-2 (BASiC B3D040120H candidate), or redesign the position for the dual part (both legs bonded, 3-pin land, sharing/surge recalculated). The old \"34 A\" note came from the LCSC listing, the 40 A from the RFQ class — neither matches the mfr datasheet; freeze identity before any PO." },
  "SIC-1700-1R":       { lcsc: "C5713500", mpn: "C2M1000170D",   status: "ORDERABLE", note: "C2M1000170D 1700 V" },
  "SIC-1200-5A":       { lcsc: "C536285", mpn: "IMW120R350M1H",    status: "ORDERABLE", note: "IMW120R350M1H" },

  // ---- ORDERABLE: magnetics, relays, modules, connectors, electromechanical ----
  "QA01C":             { lcsc: "C2757491",   status: "REVIEW", note: "R3: \"QA01C-15S18\" does not exist in MORNSUN's catalogue. Real variants: QA01C = +20/-4 V, QA01C-18 = +18/-3 V. Pin map (1=Vin 2=GND 5=-Vo 6=0V 7=+Vo) was already correct. DECISION NEEDED: B3M010C075Z recommends VGSop -5/+18 V (abs max +22), so QA01C's +20 V is above the recommended drive; QA01C-18 gives +18/-3 V but SG2M023120LJ specifies 23 mOhm at +18 V." },
  "ISO5V-RFC-6K":      { lcsc: "C20613048",  status: "REVIEW", note: "B1505S-1WR2 is 3 kVDC basic; E-rev D calls for a REINFORCED ≥6 kV module — confirm before release" },
  "MICROFIT3-16":      { lcsc: "C277731",    status: "ORDERABLE", note: "Molex 430451600" },
  "PH-2":              { lcsc: "C20504437", mpn: "B2B-PH-K-S",  status: "ORDERABLE", note: "JST B2B-PH-K-S" },
  "PH-4":              { lcsc: "C131334", mpn: "B4B-PH-K-S",    status: "ORDERABLE", note: "JST B4B-PH-K-S" },
  "PH-4-FAN":          { lcsc: "C131334", mpn: "B4B-PH-K-S",    status: "ORDERABLE", note: "JST B4B-PH-K-S" },
  "HDR-1x5-2.54":      { lcsc: "C492404", mpn: "PZ254V-11-05P",    status: "ORDERABLE", note: "PZ254V-11-05P" },
  "TACT-6x6":          { lcsc: "C318884",    status: "REVIEW" , note: "TS-1187A, JLCPCB Basic — 2026-09-06: two candidate series checked and BOTH rejected on size — TS-1088-AR02016 (C720477) is 3.9x3.0 mm and ALPS SKQG is 5.2x5.2 mm; the design specifies a 6.0x6.0 mm body. Schurter's 6x6 tact family is the right size and has a published land pattern (schurter.com/en/datasheet/typ_6x6_mm_tact_switches.pdf) — start there. No footprint drawn: a 4-pad tactile land is NOT determined by the body size alone, it varies by series, so it needs the chosen part's own drawing." },
  "LED-2DIG-0.56CC":   { lcsc: "C9900021773", status: "REVIEW" , note: "05621G 2-digit 0.56in CC — 2026-09-06 PIN MAP NEEDS VALIDATION. The industry-standard 0.56in 2-digit CC part (XLITX 5621AS, 10-pin multiplexed variant: body 25.0x19.0x8.0, two rows of 5 on 2.54 pitch, 15.24 row spacing) has pinout A=10 B=9 C=1 D=4 E=3 F=6 G=5 DP=2 DIG1=8 DIG2=7. Our sheet pin map (sheet-netlist-gen) is A=10 B=7 C=4 D=2 E=1 F=9 G=5 DP=3 DIG1=8 DIG2=6 -- only A, G and DIG1 agree. 2-digit displays vary by maker, so ours may match a different part, but the BOM p/n is generic so there is nothing to check it against. Pick the part, then make the remap match it. Consequence if wrong: segments light in the wrong places (visible HMI fault, not a safety issue). No footprint drawn until the pinout is fixed -- pads must match the symbol pin numbers or the KiCad netlist will land on the wrong pads." },
  "CMC-CAN-51uH":      { lcsc: "C55213551", mpn: "ACT45B-510-2P-TL003",  status: "ORDERABLE" , note: "ACT45B-510-2P 51 µH — 2026-09-06 RESOLVED from the TDK ACT45B datasheet: ACT45B-510-2P-TL003 — 51 uH common-mode, 200 mA, 50 V DC, Rmax 1.0 ohm, EIA 1812 (4.5x3.2x2.8), AEC-Q200, purpose-built for CAN bus. Land from TDK layout recommendation. NOTE: cells.tsx declares footprint=\"soic8\" for LCAN, which is wrong for a 4-terminal 1812 part — harmless for the schematic (the F2 name comes from footprint-map) but should be corrected if the tscircuit PCB is ever used." },
  "FB-600R-0805":      { lcsc: "C1017", mpn: "GZ2012D601TF",      status: "ORDERABLE", note: "GZ2012D601TF, JLCPCB Basic" },
  "S20K550":           { status: "CLASS", mpn: "B72220S0551K101", spec: "550 VAC 20 mm MOV (delta line-line + GDT series)", note: "E57: B72220S0551K101 IS the TDK order code for S20K550; Chinese eq JVR-20N551K class. The earlier C317868 (350 VAC) must NOT be fitted." },
  "GDT-3k5-20kA":      { status: "CLASS", spec: "3-pole GDT 3.5 kV / 20 kA 8x10 class (L-PE surge path, HR-7)", note: "candidates: Bourns 2038-35 series / Littelfuse CG3 3.5 kV class — select on the published 20 kA 8/20 rating at RFQ" },
  "FUSE-gG-690V":      { status: "CLASS", note: "gG element per SKU in a 22×58 frame with matching holder — the previously-mapped RT28-32 (C4255278) is a 10×38/32 A holder and is unusable at any SKU current (audit F6)" },
  "ACX-1100":          { status: "DIRECT", note: "Talema line CT 2500:1/100 A/Ø14.6 window — catalog part, made at Talema Salem (India); not an LCSC line: buy Talema direct (Digi-Key ~$8 retail is not the volume price). Closes the custom line-CT REVIEW (audit)" },
  "AS-404":            { status: "DIRECT", note: "Talema resonant CT 1:100/50 A/20–200 kHz pass-through — catalog part via Talema India; alt Coilcraft CST2010-100L (SMT, 47 A — at its 40 K rise at 46 A rms, airflow-verify). Closes the custom resonant-CT REVIEW (audit)" },
  "HF167F-80A-M":      { mpn: "HF167F/024-HATF(764)", status: "DIRECT", note: "HF167F/24-HF 100 A@1000 VAC; mirror-contact variant to be confirmed — 2026-09-06 RESOLVED from the Hongfa HF167F datasheet: the auxiliary contact is an ORDERING OPTION. Code is HF167F <coilV> -H <aux> <constr> <material> <insul> (special), where the field after H is the AUXILIARY CONTACT ARRANGEMENT (A = 1 Form A, Nil = none). Aux is only offered on the 764 flux-proofed type. Part needed: HF167F/024-HATF(764) -- 24 V coil, main 1 Form A carrying 100 A / breaking 30 A @1000 VAC, auxiliary 1 Form A 1 A 12 VDC for weld detection, PCB termination, body 38x33x43 mm, main blades on 20 mm centres. This is what E30 calls the mirror contact. C2757422 (HF167F/24-HF) is the NON-auxiliary variant, which is why its land had no pads 5/6/8."},
  "SHUNT-MANG":        { lcsc: "C508584",    status: "REVIEW", note: "HoFLQ60-75A-75mV — match to per-SKU output current" },

  // ---- CLASS: rating specified, part selected by purchasing ----
  "PP-1u-600":         { status: "CLASS", spec: "1 µF 600 V film" },
  "PP-1u-1100":        { status: "CLASS", spec: "1 µF 1100 V film" },
  "PP-4u7-1200":       { status: "CLASS", spec: "4.7 µF 1200 V film" },
  "PP-2u2-630":        { status: "CLASS", spec: "2.2 µF 630 V PP film, ripple-rated ≥ 10 A rms @100–200 kHz (E67 bank rectifier film)", note: "Faratronic C3D / KEMET R76 / CDE 944U class" },
  "DIODE-1600V-150A-MOD": { status: "DIRECT", spec: "1600 V 150 A rectifier diode, insulated-base 2-terminal module (E67 output blocking diode, 30 kW)", note: "MacMic MDD150-16 / IXYS MDD class — RFQ" },
  "DIODE-1600V-200A-MOD": { status: "DIRECT", spec: "1600 V 200 A rectifier diode, insulated-base 2-terminal module (E67 output blocking diode, 40/50 kW)", note: "MacMic MDD200-16 / IXYS MDD class — RFQ" },
  "DIODE-1600V-250A-MOD": { status: "DIRECT", spec: "1600 V 250 A rectifier diode, insulated-base 2-terminal module (E67 output blocking diode, 50 kW)", note: "MacMic MDD250-16 / IXYS MDD class — RFQ" },
  "RELAY-PCB-120A-24V": { status: "DIRECT", spec: "PCB power relay 120 A, 24 V coil, zero-current S/P matrix duty (E67, 30/40 kW). E75 RFQ line: release + bounce <= 35 ms WITH coil-diode suppression (ULN COM clamp freewheels the coil — the fsm open->close gap is 51 ms)", note: "Hongfa HF161F / Churod CHC-D120 class" },
  "RELAY-PCB-150A-24V": { status: "DIRECT", spec: "PCB power relay 150 A, 24 V coil, zero-current S/P matrix duty (E67, 50 kW). E75 RFQ line: release + bounce <= 35 ms WITH coil-diode suppression (fsm open->close gap 51 ms)", note: "Hongfa / Churod 150 A class" },
  "PP-10n-1200":       { status: "CLASS", spec: "10 nF 1200 V film" },
  "X1-2u2-530":        { status: "CLASS", spec: "2.2 µF 530 VAC X1 safety film" },
  "X2-4u7-305":        { status: "CLASS", spec: "4.7 µF 305 VAC X2 MKP safety film, 27.5 mm pitch (E68 star X stages)" },
  "Y1-4n7-440":        { lcsc: "C499492", mpn: "VY1472M63Y5UQ63V0", status: "ORDERABLE", spec: "4.7 nF 440 VAC Y1 safety",
                         note: "Vishay VY1 disc, 4.7nF, safety class X1/Y1, THT P=10mm. Rated 500 VAC Y1 - ABOVE the 440 VAC the class asks for, so it covers it. No Basic/Preferred Y1 4.7nF exists at JLCPCB; this class is always an Extended part." },
  "FILM-100n-250":     { status: "CLASS", spec: "100 nF 250 V film" },
  "C1812-100p-1k":     { lcsc: "C577319", mpn: "CC1812JKNPODBN101", status: "ORDERABLE", spec: "100 pF 1 kV C0G 1812",
                         note: "YAGEO 100pF 1kV C0G/NP0 1812, Vienna snubber." },
  "EL-47u-35":         { lcsc: "C13654", mpn: "KS476M035E07RR0VH2FP0", status: "ORDERABLE", spec: "47 µF 35 V electrolytic",
                         note: "CX KS series 47uF 35V THT, 6.3mm dia, 2.5mm pitch. DEVIATION: body is 6.3 x 7.0 mm, not the 6.3 x 6.3 the class named - same footprint, 0.7 mm taller; no 6.3x6.3 radial exists at this CV. CHECK: endurance only 1000h@105C (economy grade) - upgrade if this position carries real ripple." },
  "EL-220u-35":        { lcsc: "C45078", mpn: "GR227M035F12RR0VL4FP0", status: "ORDERABLE", spec: "220 µF 35 V electrolytic",
                         note: "CX GR series 220uF 35V D8xL12 THT, 3.5mm pitch. Datasheet p.7 rating table gives 0.130 ohm impedance and 640 mA rms ripple @100kHz/105C, so the low-ESR requirement is met with a published number. CHECK: endurance only 3000h@105C - verify against life target for a warm aux rail." },
  "ELH-470u450":       { status: "CLASS", spec: "470 µF 450 V snap-in, 105 °C, DC-link grade, −40 °C category temperature (A11 rev C: −30 °C operating floor; many 450 V snap-in series stop at −25 °C — confirm per series at RFQ). E74/E76: RFQ must state the 100 kHz/105 °C ripple rating AND the −40 °C category explicitly — the named Aishi LH family is −25…+105 °C and FAILS the cold line (reviewer R11); pick a −40-category series at RFQ. Ripple duty (E76-corrected): the E67 full bridge has no interleave cancellation and the PFM identity on the power-solved decks gives bridge-input AC ≈ 50 / 66 / 82 A rms at the SER250-full corner — the per-can share depends entirely on the film/electrolytic impedance split (open line: probe i(Vbus) in llc-run, solve the network, EVT T-43 — all before PO)" },
  "MLCC-10u-0805":     { status: "CLASS", spec: "10 µF 0805 X7R/X5R" },
  "MLCC-100p-0603":    { status: "CLASS", spec: "100 pF 0603 C0G" },
  "MLCC-47p-0603":     { status: "CLASS", spec: "47 pF 0603 C0G/NP0 50 V (DESAT blank, Vienna — E60)" },
  "MLCC-22p-0603":     { status: "CLASS", spec: "22 pF 0603 C0G/NP0 50 V (DESAT blank, LLC — E60)" },
  "R1206-22R-1%":      { status: "CLASS", spec: "22 Ω 1206 1% (30 kW line-CT burden — E60 F.01 120 A pk observability)" },
  "R1206-18R-1%":      { status: "CLASS", spec: "18 Ω 1206 1% (40 kW line-CT burden — E60)" },
  "R1206-13R-1%":      { status: "CLASS", spec: "13 Ω 1206 1% (50 kW line-CT burden — E60)" },
  "MLCC-1u-0805":      { status: "CLASS", spec: "1 µF 0805 X7R" },
  "MLCC-100n-0402":    { status: "CLASS", spec: "100 nF 0402 X7R decoupling" },
  "MLCC-small":        { status: "CLASS", spec: "0402–0805 MLCC, value per schematic" },
  "CER-25W-AX":        { status: "CLASS", spec: "25 W axial ceramic pulse resistor" },
  "CER-2k2-10W-AX":    { status: "CLASS", spec: "2.2 kΩ 10 W wirewound axial" },
  "SQP-10R-25W":       { status: "CLASS", spec: "10 Ω 25 W wirewound pulse, axial" },
  "WW-470R-10W":       { status: "CLASS", spec: "470 Ω 10 W wirewound axial" },
  "R2512-47k-HV-AS":   { lcsc: "C2793932", mpn: "PS122WF4702T4E", status: "REVIEW", spec: "47 kΩ 2512 anti-surge HV, 2-series per position",
                         note: "UNI-ROYAL PS = High-Precision Anti-Surge, 47k 1% 2W 2512, 500 V working / 1000 V overload. sqrt(2W x 47k) = 306 V so it is power-limited, not voltage-limited, above the 250 V need. STOCK RISK: this and every true anti-surge 47k 2512 2W on LCSC read zero stock / pre-sale on 2026-09-06 - C2770528 (AS122WJ0473T4E, 5%) is the same-spec AS-series alternate, also pre-sale. Re-check stock before release; kept at REVIEW for that reason, not for spec." },
  "R2512-10R-2W":      { lcsc: "C840605", mpn: "CRM2512-FX-10R0ELF", status: "ORDERABLE", spec: "10 Ω 2512 2 W",
                         note: "Bourns CRM2512 10 ohm 1% 2W 2512. E28 says 0.86 W actual in the Vienna snubber, so 2 W is a 2.3x margin." },
  "R2512-HV":          { status: "CLASS", spec: "2512 HV-rated resistor, value per schematic" },
  "R2512-2R0-1W-1%":   { lcsc: "C49298", mpn: "25121WF200KT4E", status: "ORDERABLE", spec: "2.0 Ω 1% 1 W 2512, resonant-CT burden",
                         note: "UNI-ROYAL 2.0 ohm 1% 1W 2512, resonant-CT burden (CB-16)." },
  "HV73-475k-1%":      { lcsc: "C4121673", mpn: "HV732BTTD4753F", status: "ORDERABLE", spec: "475 kΩ 1206 1% anti-surge HV divider",
                         note: "KOA HV73 475k 1% 1206 anti-surge HV divider element (MR-3) - the series the class is named for." },
  "R0805-prec-0.1%":   { status: "CLASS", spec: "0.1% precision divider bottom" },
  "R1206-R28-1%-0.5W": { status: "CLASS", spec: "0.28 Ω 1% 0.5 W 1206 current sense (aux CS, E65 — PT1206FR-7W0R28L family; the retired 0.31 Ω row was C6148847)", note: "C-number to be read back, never invented" },
  "R2512-11k-2W-AS":   { status: "CLASS", spec: "11 kΩ 1% 2512 2 W anti-surge, ≥200 V working (aux RCD clamp 3-series, E65)", note: "same anti-surge 2512 family as PS122WF4702T4E (R2512-47k-HV-AS) — value row at read-back" },
  "R2512-R05-1W-1%":   { status: "CLASS", spec: "50 mΩ 1% 1 W 2512 current-sense class (RAUX24 V24 short-loop resistor, E65)", note: "Yageo PT2512 / UniOhm LRx 2512 families — C-number to be read back" },
  "R1206-27R-1%":      { status: "CLASS", spec: "27 Ω 1206 1% (line-CT burden — R3/audit: 33 Ω clipped 150 A pk observability at the 3.3 V ADC rail)" },
  "R1206-RG-0.5W":     { status: "CLASS", spec: "gate resistor 1206 0.5 W, value per schematic",
                         note: "2026-09-06: tried to resolve to a catalogue part and DELIBERATELY did not. The obvious 1206 thick-film (RC1206FR-074R7L, C137258) is 250 mW — half the specified rating, on a resistor that takes the gate-drive pulse. A generic 1206 is the wrong part here; the 0.5 W class needs a pulse-rated series (ERJ-P / RL-class) selected at RFQ. CLASS is the correct status, not an unfinished lookup." },
  "R0805-10k":         { status: "CLASS", spec: "10 kΩ 0805 gate-source" },
  "R0603-220":         { status: "CLASS", spec: "220 Ω 0603 LED segment" },
  "R-small":           { status: "CLASS", spec: "0402–0805 small-signal resistor, value per schematic" },
  "IND-10u-3A":        { lcsc: "C5189958", mpn: "CYA0630-10UH", status: "ORDERABLE", spec: "10 µH 3 A shielded power inductor",
                         note: "SHOU HAN CYA0630 molded shielded metal-composite, 10uH +/-20%, Irms 4A, Isat 5.5A, DCR 71 mOhm, 7.2x6.6mm. Both current ratings clear the 3 A requirement with margin for the 3V3 buck." },
  "IND-PFC-165u":      { status: "CUSTOM", spec: "165 µH-class PFC choke, 3× 0077908A7 26µ sendust, N=39±1 lot trim, 18 mm² flat Cu (D1 rev B, audit) — custom wind" },
  "CMC-3PH-2mH-SKU":   { status: "CUSTOM", spec: "3-phase 2 mH nanocrystalline CM choke, current-rated per SKU — no LCSC equivalent. 30 kW: qualify Schaffner RT8131-63-2M8 (63 A/2.8 mH, Digi-Key) as catalog drop-in; custom drawing stays second source (audit)" },
  "XFMR-AUX-FLY-E":    { status: "CUSTOM", spec: "aux flyback ETD44 PC95, 110 W, 321–860 Vin, Np 38/6/4/4, Lp 345 µH ±5 %, leakage ≤4 µH sandwich, pins 1–4 primary / 5–8 SELV (D4 rev E, E65) — custom wind" },


  // ---- E57 maturation: every mpn the BOM can emit resolves here (statuses honest, no guessed codes) ----
  "GD32G553VET7":      { status: "REVIEW", mpn: "GD32G553VET7", note: "R5-I real order code; LCSC listing to re-verify (the old C9900185865 row was keyed VET6 pre-R5-I)" },
  "NCP1252D":          { status: "ORDERABLE", mpn: "NCP1252DDR2G", note: "onsemi D-suffix (R6-G cold-start fix); wide distribution" },
  "NSI1042-DSWR":      { lcsc: "C3445856", status: "ORDERABLE", note: "same silicon as the NSI1042 row; -DSWR is the verified order suffix (R5-H/R7)" },
  "74HC02":            { status: "ORDERABLE", mpn: "74HC02D", note: "any major vendor (Nexperia/TI/onsemi), SOIC-14 — JLC-basic class" },
  "BZT52-C15":         { status: "ORDERABLE", mpn: "BZT52C15", note: "generic 15 V zener SOD-123, any vendor" },
  "QA01C-18":          { status: "REVIEW", mpn: "QA01C-18", note: "MORNSUN +18/-3 V gate-bias module — O-11 CLOSED (E45, reconfirmed E80): the catalogue rails ARE the design rails; −3 V leaves 2 V to the B3M010C075Z −5 V conditional floor, undershoot scoped at DPT. R5-F input-range cross-reg at EVT; REVIEW = RFQ bulk-decoupling per MORNSUN app note" },
  "IND-LR-E70-30":     { status: "CUSTOM", spec: "D2-30 rev F (E67): external resonant inductor 5.16 µH ±3%, 2x E70/33/32 gapped, N=5, litz 6000x0.05 — pack sheet" },
  "IND-LR-E70-40":     { status: "CUSTOM", spec: "D2-40 rev F (E67): external resonant inductor 4.06 µH ±3%, 2x E70/33/32 gapped, N=5, litz 8000x0.05 — pack sheet" },
  "IND-LR-E70-50":     { status: "CUSTOM", spec: "D2-50 rev F (E67): external resonant inductor 3.27 µH ±3%, 2x E70/33/32 gapped, N=5, litz 10000x0.05 — pack sheet" },
  "XFMR-LLC-CELL-2E70-30": { status: "CUSTOM", spec: "D3-30 rev D (E67): full-bridge transformer cell, 2x E70/33/32, 6:6||6, B66372A2000 former, Lm 28 µH/cell ±7% — pack sheet" },
  "XFMR-LLC-CELL-3E70-40": { status: "CUSTOM", spec: "D3-40 rev D (E67): full-bridge transformer cell, 3x E70/33/32, 4:4||4, 3-set former, Lm 21.75 µH/cell ±7% — pack sheet" },
  "XFMR-LLC-CELL-3E70-50": { status: "CUSTOM", spec: "D3-50 rev D (E67): full-bridge transformer cell, 3x E70/33/32, 4:4||4, 3-set former, Lm 17.8 µH/cell ±7% — pack sheet" },
  "CT-RES-1:100-150A": { status: "DIRECT", spec: "resonant CT 1:100, 150 A rms class, 20–250 kHz pass-through (E67 40/50 kW full-bridge tank)", note: "Talema AS-family upsize RFQ" },
  "R2512-0R47-1W-1%":  { status: "CLASS", spec: "0.47 Ω 1% 1 W 2512 (30 kW resonant-CT burden — E67 F.11 140 A pk)" },
  "R2512-0R36-1W-1%":  { status: "CLASS", spec: "0.36 Ω 1% 1 W 2512 (40 kW resonant-CT burden — E67 F.11 180 A pk)" },
  "R2512-0R30-2W-1%":  { status: "CLASS", spec: "0.30 Ω 1% 2 W 2512 (50 kW resonant-CT burden — E67 F.11 220 A pk)", note: "Bourns CRM/Yageo SR anti-surge families" },
  "PP-33n-1200V":      { status: "CLASS", spec: "33 nF 1200 V PP resonant-duty film (E67 full-bridge tank, all SKUs; Vrms-vs-f >=460 V @140 kHz)", note: "candidates: CDE 942C20P33K / Faratronic resonant PP" },
  "CER-25W-33R-AX":    { status: "CLASS", spec: "33 R 25 W axial ceramic pulse (AC precharge; 160 J family point)", note: "TE SQP25/CGS class — pulse curve is the acceptance" },
  "CER-25W-160R-AX":   { status: "CLASS", spec: "160 R 25 W axial ceramic pulse (bus discharge string)", note: "TE SQP25/CGS class" },
  "CER-50W-33R-AX":    { status: "CLASS", spec: "33 R 50 W axial ceramic pulse — 50 kW precharge (~212 J/event, E43)", note: "TE/Vitrohm 50 W pulse class" },
  "CER-50W-160R-AX":   { status: "CLASS", spec: "160 R 50 W axial ceramic pulse — 50 kW discharge (162 J/event)", note: "TE/Vitrohm 50 W pulse class" },
  "FUSE-gG-690V-160A": { status: "CLASS", spec: "160 A gG 690 VAC NH00 blade + base — 50 kW input (E42; 22x58 ends at 125 A)", note: "candidates: Bussmann NH00 gG 160 A / SIBA NH00 / local NH00 base" },
  "HF167F-100A-M":     { status: "DIRECT", mpn: "HF167F/024-HATF(764)", note: "same documented Hongfa code family as the 80 A row — 100 A main / 30 A break @1000 VAC, aux 1 Form A (E30 mirror); 40 kW precharge bypass" },
  "CT-LINE-2500-150A": { status: "DIRECT", spec: "line CT 2500:1, 150 A class, 4 kV hipot — Talema ACX-1150 (linear to 200 A at 33 Ω; 38.1×38.1 mm body, 33.0 mm pin row — its own land) — 40/50 kW (E60)", note: "Talema ACX-family upsize RFQ (Salem India); burden 21.5 R on PCB" },
  "CT-RES-1:100-100A": { status: "DIRECT", spec: "resonant CT 1:100, 100 A rms class, 20–250 kHz pass-through (E67 30 kW full-bridge tank)", note: "Talema AS-family upsize RFQ" },
  "SHUNT-50MV-100A":   { status: "CLASS", spec: "manganin shunt 50 mV @ 100 A, Kelvin 4-T (30 kW)", note: "FL-2C class (wide CN availability) or Isabellenhuette eq; EOL gain-cal absorbs tolerance" },
  "SHUNT-50MV-133A":   { status: "CLASS", spec: "manganin shunt 50 mV @ 133 A, Kelvin 4-T (40 kW)", note: "FL-2C class custom tap — value in code (R5-G)" },
  "SHUNT-50MV-167A":   { status: "CLASS", spec: "manganin shunt 50 mV @ 167 A, Kelvin 4-T (50 kW)", note: "FL-2C class custom tap" },
  "R1206-21R5-1%":     { status: "CLASS", spec: "21.5 R 1% 1206 (50 kW line-CT burden re-scale)", note: "E96 value, any thick-film" },
  "R2010-1k-0.75W-1%": { status: "CLASS", spec: "1 k 0.75 W 2010 (PV-driver LED feed, R8)", note: "any thick-film 2010" },
  "R0603-10k":         { status: "CLASS", spec: "10 k 0603 (card-way pull-downs, E27 default-OFF)" },
  "R0805-2R2":         { status: "CLASS", spec: "2.2 R 0805 (per-device gate R on paralleled SiC, R5-E)" },
  "MICROFIT3-40":      { status: "CLASS", spec: "Micro-Fit 3.0 dual-row 40-ckt vertical header, 5 A/contact (HARNESS40)", note: "Molex 43045-40xx — finish/retention variant at RFQ; mate = receptacle 43025-40xx with crimp harness" },
  "CONN-CARD-88-H":    { status: "CLASS", spec: "88-way 2x44 2.54 mm PIN HEADER, keyed (board side)", note: "Samtec TSW-144 class / generic gold-flash — mate of -R" },
  "CONN-CARD-88-R":    { status: "CLASS", spec: "88-way 2x44 2.54 mm RECEPTACLE, keyed (card side)", note: "Samtec SSW-144 class" },
  "IND-PFC-116u-40":   { status: "CUSTOM", spec: "D1-40 rev B: 5x 0077908A7, N=26+/-1 lot-trim (E51) — pack sheet PMP-MAG-D1-40" },
  "IND-PFC-107u-50":   { status: "CUSTOM", spec: "D1-50 rev B: 5x T79 26u, N=24+/-1 (E51) — pack sheet PMP-MAG-D1-50" },
  "TLV3202-class":     { status: "CLASS", spec: "dual push-pull comparator ≤50 ns, 2.7–5.5 V, SOIC/VSSOP-8 (E65 F.11 window) — TLV3202AIDR" },
  "BAT54A":            { status: "CLASS", spec: "dual Schottky common anode SOT-23 (E65 F.11 diode-OR)" },

  // SKU-scaled variants. The 30 kW part number was previously printed on every SKU, which read
  // as an undersized relay/fuse on the 60/120 kW drawings even though price and class notes
  // were already scaled. These are the classes the design actually calls for.
  "HF167F-250A-M":     { status: "REVIEW", spec: "250 A precharge-bypass relay/contactor w/ mirror aux — 50 kW (91.6 A line = 37% of class, E42)", note: "ACTION: HF167F tops at ~100 A main — the 250 A class needs the Hongfa HFE18V/NB90 contactor family or TE EV200-class with aux; pick + land pattern at RFQ (mech line carries the frame)" },
  "FUSE-gG-690V-80A":  { status: "CLASS", spec: "80 A gG 690 VAC 22×58 — 30 kW (55.9 A worst continuous; audit F6: 63 A ran 88% nameplate and NEGATIVE after the ~0.72× enclosed/+55 °C derate)", note: "holder = 22×58 base (RT28-63 / RT18-125 class)" },
  "FUSE-gG-690V-125A": { status: "CLASS", spec: "125 A gG 690 VAC — 60 kW (110 A line)" , note: "2026-09-06 R9: RT28-32 holds 32 A max; 125 A needs the 22x58 mm RT28-125."},
  "FUSE-gG-690V-250A": { status: "CLASS", spec: "250 A gG 690 VAC — 120 kW (220 A line)" , note: "2026-09-06 R9: 250 A EXCEEDS the whole RT28 range (max 125 A). Needs an NH-type blade fuse (NH1) or bolted-tag class — a size and mounting change, not a substitution."},
  "CER-50W-AX":        { status: "CLASS", spec: "50 W axial ceramic pulse resistor — 120 kW precharge/discharge (477 J/event, HR-14)" },
  "STUD-M8":           { status: "CLASS", spec: "M8 stud terminal / busbar landing" },
  "TAB-M4":            { status: "CLASS", spec: "M4 heatsink tab stud" },
};

/** LCSC record for an MPN, or a CLASS placeholder when the design specifies a rating. */
export const lcscFor = (mpn) => LCSC[mpn] ?? { status: "UNMAPPED" };

export const lcscSummary = () => {
  const c = {};
  for (const v of Object.values(LCSC)) c[v.status] = (c[v.status] ?? 0) + 1;
  return c;
};

// ---- value-resolved ordinary passives ----------------------------------------------------
// Generic families like `R-small` / `MLCC-small` cover several values, so a per-MPN LCSC number
// cannot express them — the part depends on (family, value). Every entry below was read back
// from the LCSC catalogue; none is from memory.
// Deliberately NOT resolved: anything whose CLASS *is* the specification — HV73 high-voltage
// dividers, PP film caps rated by voltage class, WW/CER power resistors, custom magnetics.
// Substituting a generic part there would silently drop a rating the design depends on.
export const LCSC_BY_VALUE = {
  "R0805-prec-0.1%|11.5k": { lcsc: "C865153",  mpn: "RT0805BRD0711K5L", note: "YAGEO RT 11.5k 0.1% 25ppm 0805 thin film, 150V" },
  "R0805-prec-0.1%|6.8k":  { lcsc: "C3033907", mpn: "ARG05BTC6801",     note: "Viking ARG 6.8k 0.1% 25ppm 0805 thin film, 150V. Chosen over Panasonic C445656 (100V) on voltage headroom; the series-matching YAGEO 6.8k (C865628) is out of stock. 150V is ample here because these are divider BOTTOM elements - the HV is dropped across the HV73-475k top string." },
  "R1206-RG-0.5W|4.7":     { lcsc: "C859161",  mpn: "RC1206FR-7W4R7L",  note: "YAGEO 4.7 ohm 1% 500mW 1206 gate resistor (84 positions)" },
  "R1206-RG-0.5W|2.2":     { lcsc: "C873951",  mpn: "SR1206FR-7W2R2L",  note: "YAGEO SR anti-surge 2.2 ohm 1% 500mW 1206 (42 positions). The exact-series RC1206FR-7W2R2L (C326574) is OUT OF STOCK - do not order it." },
  "R-small|10k":        { lcsc: "C84376",  mpn: "RC0805FR-0710KL",   note: "10k 0805 1% 125mW" },
  "R0805-10k|10k":      { lcsc: "C84376",  mpn: "RC0805FR-0710KL",   note: "10k 0805 1% 125mW" },
  "R-small|1k":         { lcsc: "C95781",  mpn: "RC0805FR-071KL",    note: "1k 0805 1%" },
  "R0603-220|220":      { lcsc: "C107696", mpn: "RC0603FR-07220RL",  note: "220R 0603 1% 100mW" },
  "MLCC-small|100nF":   { lcsc: "C14663",  mpn: "CC0603KRX7R9BB104", note: "100nF 0603 X7R 50V (JLC Basic)" },
  "MLCC-small|1nF":     { lcsc: "C100040", mpn: "CC0603KRX7R9BB102", note: "1nF 0603 X7R" },
  "MLCC-small|220pF":   { lcsc: "C106210", mpn: "CC0603JRNPO9BN221", note: "220pF 0603 NP0 50V" },
  "MLCC-1u-0805|1uF":   { lcsc: "C28323",  mpn: "CL21B105KBFNNNE",   note: "1uF 0805 X7R 50V (JLC Basic)" },
  "MLCC-100p-0603|100pF": { lcsc: "C14665", mpn: "CC0603JRNPO9BN101", note: "100pF 0603 NP0 50V" },
  "MLCC-47p-0603|47pF": { mpn: "CC0603JRNPO9BN470", note: "47pF 0603 NP0 50V (YAGEO CC series, same family as the 100pF line) — C-number to be read back, never invented" },
  "MLCC-22p-0603|22pF": { mpn: "CC0603JRNPO9BN220", note: "22pF 0603 NP0 50V (YAGEO CC series) — C-number to be read back, never invented" },
  "R1206-22R-1%|22":    { mpn: "RC1206FR-0722RL", note: "22R 1206 1% (YAGEO RC) — C-number to be read back" },
  "R1206-18R-1%|18":    { mpn: "RC1206FR-0718RL", note: "18R 1206 1% (YAGEO RC) — C-number to be read back" },
  "R1206-13R-1%|13":    { mpn: "RC1206FR-0713RL", note: "13R 1206 1% (YAGEO RC) — C-number to be read back" },
  "R1206-27R-1%|10k":   { lcsc: "C132649", mpn: "RC1206FR-0710KL",   note: "10k 1206 1% 250mW" },
  "R1206-27R-1%|27":    { mpn: "RC1206FR-0727RL", note: "27R 1206 1% — C-number to be read back from the LCSC catalogue (convention: never invent an LCSC code); the old 33R C137308 must NOT be fitted" },
  "R-small|100":        { lcsc: "C105577", mpn: "RC0805FR-07100RL",  note: "100R 0805 1%" },
  "R-small|100k":       { lcsc: "C96346",  mpn: "RC0805FR-07100KL",  note: "100k 0805 1%" },
  "MLCC-small|10nF":    { lcsc: "C100042", mpn: "CC0603KRX7R9BB103", note: "10nF 0603 X7R 50V" },
  "MLCC-small|10uF":    { lcsc: "C15850",  mpn: "CL21A106KAYNNNE",   note: "10uF 0805 X5R 25V (JLC Basic) — sits on V15, so 25V class not 6.3/10V" },
  "MLCC-small|22uF":    { lcsc: "C86817",  mpn: "GRM21BR61C226ME44L", note: "22uF 0805 X5R 16V — V3P3 rail" },
  "MLCC-small|2.2nF":   { lcsc: "C107146", mpn: "CC0805KRX7R9BB222", note: "2.2nF 0805 X7R 50V" },
  "MLCC-small|1uF":     { lcsc: "C28323",  mpn: "CL21B105KBFNNNE",   note: "1uF 0805 X7R 50V (JLC Basic) — same part as MLCC-1u-0805" },
  "R-small|2.2k":       { lcsc: "C114561", mpn: "RC0805FR-072K2L",   note: "2.2k 0805 1%" },
  "R-small|4.7":        { lcsc: "C137513", mpn: "RC0805FR-074R7L",   note: "4.7R 0805 1% — RAVI, the AVMID buffer's series isolation R, small-signal (NOT a gate resistor)" },
  "R1206-27R-1%|100k":  { lcsc: "C96346",  mpn: "RC0805FR-07100KL",  note: "100k — these instances are on an 0805 land, same part as R-small|100k" },
  "R-small|1M":         { lcsc: "C107700", mpn: "RC0805FR-071ML",    note: "1M 0805 1%" },
  "R-small|47k":        { lcsc: "C126351", mpn: "RC0805FR-0747KL",  note: "47k 0805 1%" },
  "R-small|68k":        { lcsc: "C114548", mpn: "RC0805FR-0768KL",  note: "68k 0805 1%" },
  "R-small|15k":        { lcsc: "C114559", mpn: "RC0805FR-0715KL",  note: "15k 0805 1%" },
  "R-small|7.5k":       { mpn: "RC0603FR-077K5L", note: "7.5k 0603 1% — RBR2, the NCP1252D brown-in divider bottom (E65); C-number to be read back, never invented" },
  "R-small|330":        { lcsc: "C110440", mpn: "RC0805FR-07330RL", note: "330R 0805 1%" },
  "R1206-27R-1%|1M":    { lcsc: "C107700", mpn: "RC0805FR-071ML",   note: "1M — these instances are on an 0805 land" },
  "R1206-27R-1%|330":   { lcsc: "C110440", mpn: "RC0805FR-07330RL", note: "330R — 0805 land" },
  "R1206-27R-1%|4.7k":  { lcsc: "C60816",  mpn: "RC0805FR-074K7L",  note: "4.7k — 0805 land, same part as R-small|4.7k" },
  "R-small|4.7k":       { lcsc: "C60816",  mpn: "RC0805FR-074K7L",  note: "4.7k 0805 1%" },
  "R-small|0R":         { lcsc: "C96345",  mpn: "RC0805JR-070RL",   note: "0R 0805 jumper" },
  "R-small|45.3k":      { lcsc: "C273885", mpn: "RC0805FR-0745K3L", note: "45.3k 0805 1%" },
  "R-small|118k":       { lcsc: "C274001", mpn: "RC0805FR-07118KL", note: "118k 0805 1%" },
  "R-small|120":        { lcsc: "C114928", mpn: "RC1206FR-07120RL", note: "120R 1206 1% 250mW" },
  "MLCC-small|4.7nF":   { lcsc: "C107208", mpn: "CC1206KRX7R9BB472", note: "4.7nF 1206 X7R 50V — CCGB, the CGND/DGND common-mode bridge. Generic (not Y-class) is correct: E25 FROZEN puts CAN inside the touch-safe SELV control domain (\"HMI/SWD/fans/CAN need no additional barriers\", architecture.md), so CGND-DGND is FUNCTIONAL isolation breaking a ground loop to the off-board controller, not a safety barrier. See R11." },
  "MLCC-100n-0402|100nF": { lcsc: "C60474", mpn: "CC0402KRX7R7BB104", note: "100nF 0402 X7R 16V — used only on the 3.3 V rail (~5x derating)" },
  // ---- E64: package-keyed rows (family|value|pkg). The value map was land-blind, so 344 sheet
  // positions named a part whose package differed from their own drawn land (footprint-audit).
  // The DRAWN LAND is the authority (it is what layout will place); the part follows it.
  // Same-series siblings in the drawn size; C-numbers to be read back, never invented.
  "MLCC-small|100nF|0805":  { mpn: "CC0805KRX7R9BB104", note: "100nF 0805 X7R 50V — land-matched (E64); C-number to be read back" },
  "MLCC-small|1nF|0805":    { mpn: "CC0805KRX7R9BB102", note: "1nF 0805 X7R 50V — land-matched (E64); C-number to be read back" },
  "MLCC-small|10nF|0805":   { mpn: "CC0805KRX7R9BB103", note: "10nF 0805 X7R 50V — land-matched (E64); C-number to be read back" },
  "MLCC-small|220pF|0805":  { mpn: "CC0805JRNPO9BN221", note: "220pF 0805 NP0 50V — land-matched (E64); C-number to be read back" },
  "MLCC-small|2.2nF|0603":  { mpn: "CC0603KRX7R9BB222", note: "2.2nF 0603 X7R 50V — land-matched (E64); C-number to be read back" },
  "MLCC-small|10uF|0603":   { mpn: "CL10A106KP8NNNC",   note: "10uF 0603 X5R 10V — card analog nodes <=3.3 V ONLY; the V15 positions stay on the 0805 25 V row (E64); C-number to be read back" },
  "MLCC-small|1uF|0402":    { mpn: "CL05A105KO5NNNC",   note: "1uF 0402 X5R >=16 V (driver 5 V logic side) — verify suffix at read-back (E64)" },
  "MLCC-small|1uF|0603":    { mpn: "CL10A105KB8NNNC",   note: "1uF 0603 X7R 25V — land-matched (E64); C-number to be read back" },
  "MLCC-1u-0805|1uF|0402":  { mpn: "CL05A105KO5NNNC",   note: "1uF 0402 X5R >=16 V (driver 5 V logic side) — verify suffix at read-back (E64)" },
  "MLCC-1u-0805|1uF|0603":  { mpn: "CL10A105KB8NNNC",   note: "1uF 0603 X7R 25V — land-matched (E64); C-number to be read back" },
  "MLCC-22p-0603|22pF|0805": { mpn: "CC0805JRNPO9BN220", note: "22pF 0805 C0G 50V (DESAT blank, LLC — E60 value unchanged; the drawn land is 0805) — C-number to be read back (E64)" },
  "MLCC-47p-0603|47pF|0805": { mpn: "CC0805JRNPO9BN470", note: "47pF 0805 C0G 50V (DESAT blank, Vienna — E60 value unchanged; the drawn land is 0805) — C-number to be read back (E64)" },
  "R0603-220|220|0805":     { mpn: "RC0805FR-07220RL",  note: "220R 0805 1% (7-seg segment feeds drawn 0805) — land-matched (E64); C-number to be read back" },
  "R-small|10k|0603":       { mpn: "RC0603FR-0710KL", note: "10k 0603 1% — land-matched (E67: the drawn land is 0603; the E61 classifier read it as 0805); C-number to be read back" },
  "R-small|100|0603":       { mpn: "RC0603FR-07100RL", note: "100 0603 1% — land-matched (E67: the drawn land is 0603; the E61 classifier read it as 0805); C-number to be read back" },
  "R-small|1k|0603":        { mpn: "RC0603FR-071KL", note: "1k 0603 1% — land-matched (E67: the drawn land is 0603; the E61 classifier read it as 0805); C-number to be read back" },
  "R-small|2.2k|0603":      { mpn: "RC0603FR-072K2L", note: "2.2k 0603 1% — land-matched (E67: the drawn land is 0603; the E61 classifier read it as 0805); C-number to be read back" },
  "R-small|100k|0603":      { mpn: "RC0603FR-07100KL", note: "100k 0603 1% — land-matched (E67: the drawn land is 0603; the E61 classifier read it as 0805); C-number to be read back" },
  "R-small|45.3k|0603":     { mpn: "RC0603FR-0745K3L", note: "45.3k 0603 1% — land-matched (E67: the drawn land is 0603; the E61 classifier read it as 0805); C-number to be read back" },
  "R-small|47k|0603":       { mpn: "RC0603FR-0747KL", note: "47k 0603 1% — land-matched (E67: the drawn land is 0603; the E61 classifier read it as 0805); C-number to be read back" },
  "R-small|330|0603":       { mpn: "RC0603FR-07330RL", note: "330 0603 1% — land-matched (E67: the drawn land is 0603; the E61 classifier read it as 0805); C-number to be read back" },
  "R-small|4.7k|0603":      { mpn: "RC0603FR-074K7L", note: "4.7k 0603 1% — land-matched (E67: the drawn land is 0603; the E61 classifier read it as 0805); C-number to be read back" },
  "R-small|0R|0603":        { mpn: "RC0603JR-070RL", note: "0R 0603 jumper — land-matched (E67: the drawn land is 0603; the E61 classifier read it as 0805); C-number to be read back" },
  "R-small|15k|0603":       { mpn: "RC0603FR-0715KL", note: "15k 0603 1% — land-matched (E67: the drawn land is 0603; the E61 classifier read it as 0805); C-number to be read back" },
  "R-small|1M|1206":        { mpn: "RC1206FR-071ML",    note: "1M 1206 1% 200 V working (CGND bleed / PE-tie class drawn 1206) — land-matched (E64); C-number to be read back" },
  "R1206-27R-1%|1M|1206":   { mpn: "RC1206FR-071ML",    note: "1M 1206 1% — land-matched (E64); C-number to be read back" },
};

// Resolve by family AND value where we have a real catalogue part, else fall back to the
// per-MPN map (which is where the class-specified parts correctly stay).
// A LCSC_BY_VALUE hit carries a real C-number but no status field, so 32 BOM rows showed a part
// number against a BLANK status — unreadable as sourcing state. In this taxonomy a mapped
// C-number IS the orderable state, so default it rather than leave the column empty. An entry
// that sets its own status (REVIEW, SECOND-SOURCE) keeps it.
export const lcscForPart = (mpn, value, pkg) => {
  // E64: land-aware — a package-keyed row (family|value|pkg) beats the package-blind row, so the
  // named part always matches the drawn land. pkg is the chip size ("0402".."2512") or undefined.
  const hit = (pkg && LCSC_BY_VALUE[`${mpn}|${value}|${pkg}`]) ?? LCSC_BY_VALUE[`${mpn}|${value}`];
  if (!hit) return lcscFor(mpn);
  if (hit.lcsc) return { ...hit, status: hit.status ?? "ORDERABLE" };
  return { ...lcscFor(mpn), ...hit };   // E61: a value row with only a candidate mpn keeps its class status (sheets printed "undefined")
};
