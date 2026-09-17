// LCSC part numbers per design part family.
//
// Two kinds of entry, deliberately kept apart — a purchasable part number must never be
// guessed:
//   ORDERABLE  a specific LCSC part that meets the design rating, verified against the LCSC
//              catalogue.
//   CLASS      the design specifies a rating, not a part (film/X/Y capacitors, MLCCs, power
//              ceramics, precision dividers). A generic symbol stands in on the schematic.
//              Purchasing selects against the stated rating; codes here would be fiction.
// DIRECT is a vendor-direct order code, CUSTOM is built to our drawing, and REVIEW is a tracked
// open sourcing decision that must carry an actionable note.
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
  "PESD1CAN":          { lcsc: "C143073",    status: "ORDERABLE" },
  "VOM1271T":          { lcsc: "C146286",    status: "ORDERABLE" },
  "TLP152-class":      { lcsc: "C17255258", mpn: "TLP152",  status: "ORDERABLE", note: "TLP152(E" },
  "S8050":             { lcsc: "C2146",      status: "ORDERABLE", note: "JLCPCB Basic" },
  "US1M":              { lcsc: "C412437",    status: "ORDERABLE", note: "JLCPCB Basic" },
  "US2G":              { lcsc: "C49263",     status: "ORDERABLE" },
  "UF-400V-3A":        { lcsc: "C3039981", mpn: "US3M",   status: "ORDERABLE", note: "US3M 1 kV 3 A" },
  "1N4148WS":          { lcsc: "C2128",      status: "ORDERABLE", note: "JLCPCB Basic" },
  "SIC-SBD-1700V":     { status: "CLASS", spec: "SiC Schottky ≥1700 V, IF(AV) ≥1 A, IFRM ≥10 A at tp ≤1 µs, no forward recovery — aux RCD clamp DCLA, which blocks 860 V + Vc at ≤80 %", note: "A 1.2 kV part (STTH112U, C56792) must NOT be fitted here: it sees 1.3 kV and avalanches every cycle. Candidates to qualify at RFQ — GeneSiC GAP3SLT33-214 (3.3 kV SMB, confirm IFRM), Littelfuse LSIC2SD170B-class (1.7 kV TO-247-2), Wolfspeed C3D-170 class; never a guessed C-number" },
  "SIC-750V-20mR":     { status: "CLASS", spec: "SiC MOSFET 750 V 20 mΩ TO-247-4 class (30 kW Vienna) — BASiC/SiChain/Sanan RFQ" },
  "SIC-750V-15mR":     { status: "CLASS", spec: "SiC MOSFET 750 V 15 mΩ TO-247-4 class (40/50 kW Vienna) — BASiC/SiChain/Sanan RFQ" },
  "B3M010C075Z":       { lcsc: "C5713521",   status: "SECOND-SOURCE", note: "C3M0021120K 1200 V/21 mΩ TO-247-4 — the BASiC 750 V/10 mΩ primary is not on LCSC; requalify Vds against the second source" },
  "SG2M023120LJ":      { lcsc: "C5713523",   status: "SECOND-SOURCE", note: "LCSC C5713523 is Wolfspeed C3M0016120K (1200 V/16 mOhm), NOT the SiChain part, so vendor, price and RdsOn on this row describe the SECOND SOURCE. Pinouts are identical (1=D/tab 2=S 3=driver source 4=G) so there is no footprint risk. Gate drive differs: SiChain -4/+18 V for 23 mOhm, Wolfspeed C3M -4/+15 V." },
  "SICJBS-1200-10":    { lcsc: "C7435087", mpn: "GC4D10120H",   status: "ORDERABLE", note: "GC4D10120H 1200 V SiC JBS" },
  "SICJBS-1200-40":    { lcsc: "C7435099", mpn: "GC4D20120D",   status: "REVIEW", note: "DO NOT ORDER against this line. GC4D20120D is a TO-247-3 DUAL common-cathode die (pin1/pin3 anodes, pin2+tab cathode), 16.5 A/leg at Tc 135 °C, IFSM 71 A/leg 10 ms — not the 2-terminal 40 A part this row requires, and the drawn footprint is 2-pin. Resolve at RFQ: either a true single-die ≥40 A TO-247-2 (BASiC B3D040120H candidate), or redesign the position for the dual part (both legs bonded, 3-pin land, sharing and surge recalculated). The LCSC listing's 34 A and the RFQ class's 40 A both disagree with the manufacturer datasheet — freeze the identity before any PO." },
  "SIC-1200-5A":       { lcsc: "C536285", mpn: "IMW120R350M1H",    status: "ORDERABLE", note: "IMW120R350M1H" },

  // ---- ORDERABLE: magnetics, relays, modules, connectors, electromechanical ----
  "ISO5V-RFC-6K":      { lcsc: "C20613048",  status: "REVIEW", note: "The mapped B1505S-1WR2 is 3 kVDC BASIC insulation; this position is part of the mains/output→SELV barrier and needs a REINFORCED ≥6 kV module with a certificate. Confirm the certified part before release." },
  "PH-2":              { lcsc: "C20504437", mpn: "B2B-PH-K-S",  status: "ORDERABLE", note: "JST B2B-PH-K-S" },
  "PH-4":              { lcsc: "C131334", mpn: "B4B-PH-K-S",    status: "ORDERABLE", note: "JST B4B-PH-K-S" },
  "PH-4-FAN":          { lcsc: "C131334", mpn: "B4B-PH-K-S",    status: "ORDERABLE", note: "JST B4B-PH-K-S" },
  "HDR-1x5-2.54":      { lcsc: "C492404", mpn: "PZ254V-11-05P",    status: "ORDERABLE", note: "PZ254V-11-05P" },
  "TACT-6x6":          { lcsc: "C318884",    status: "REVIEW" , note: "TS-1187A, JLCPCB Basic. The design specifies a 6.0x6.0 mm body, which rules out two otherwise obvious candidates: TS-1088-AR02016 (C720477) is 3.9x3.0 mm and the ALPS SKQG is 5.2x5.2 mm. Schurter's 6x6 tact family is the right size and has a published land pattern (schurter.com/en/datasheet/typ_6x6_mm_tact_switches.pdf) — start there. No footprint is drawn: a 4-pad tactile land is not determined by body size alone, it varies by series, so it needs the chosen part's own drawing." },
  "LED-2DIG-0.56CC":   { lcsc: "C9900021773", status: "REVIEW" , note: "05621G 2-digit 0.56in CC — PIN MAP NEEDS VALIDATION before release. The industry-standard 0.56in 2-digit CC part (XLITX 5621AS, 10-pin multiplexed variant: body 25.0x19.0x8.0, two rows of 5 on 2.54 pitch, 15.24 row spacing) has pinout A=10 B=9 C=1 D=4 E=3 F=6 G=5 DP=2 DIG1=8 DIG2=7, while the sheet pin map (sheet-netlist-gen) is A=10 B=7 C=4 D=2 E=1 F=9 G=5 DP=3 DIG1=8 DIG2=6 — only A, G and DIG1 agree. 2-digit displays vary by maker and the BOM p/n is generic, so there is nothing to check the map against: pick the part, then make the remap match it. Consequence if wrong: segments light in the wrong places (a visible HMI fault, not a safety issue). No footprint is drawn until the pinout is fixed — pads must match the symbol pin numbers or the KiCad netlist lands on the wrong pads." },
  "CMC-CAN-51uH":      { lcsc: "C55213551", mpn: "ACT45B-510-2P-TL003",  status: "ORDERABLE" , note: "TDK ACT45B-510-2P-TL003: 51 uH common-mode, 200 mA, 50 V DC, Rmax 1.0 ohm, EIA 1812 (4.5x3.2x2.8), AEC-Q200, purpose-built for CAN bus. Land from the TDK layout recommendation. NOTE: cells.tsx declares footprint=\"soic8\" for LCAN, which is wrong for a 4-terminal 1812 part — harmless for the schematic (the F2 name comes from footprint-map) but correct it if the tscircuit PCB is ever used." },
  "FB-600R-0805":      { lcsc: "C1017", mpn: "GZ2012D601TF",      status: "ORDERABLE", note: "GZ2012D601TF, JLCPCB Basic" },
  "S20K550":           { status: "CLASS", mpn: "B72220S0551K101", spec: "550 VAC 20 mm MOV (delta line-line + GDT series)", note: "B72220S0551K101 IS the TDK order code for S20K550; the Chinese equivalent is the JVR-20N551K class. A 350 VAC part (C317868) must NOT be fitted." },
  "FUSE-gG-690V":      { status: "CLASS", note: "gG element per SKU in a 22×58 frame with the matching holder. An RT28-32 (C4255278) is a 10×38 / 32 A holder and is unusable at any SKU current." },
  "ACX-1100":          { status: "DIRECT", note: "Talema line CT 2500:1 / 100 A / Ø14.6 window — catalog part, made at Talema Salem (India). Not an LCSC line: buy Talema direct, because distributor retail (~$8) is not the volume price." },
  "HF167F-80A-M":      { mpn: "HF167F/024-HATF(764)", status: "DIRECT", note: "The auxiliary contact is an ORDERING OPTION on the Hongfa HF167F. The code is HF167F <coilV> -H <aux> <constr> <material> <insul> (special), where the field after H is the AUXILIARY CONTACT ARRANGEMENT (A = 1 Form A, Nil = none), and aux is only offered on the 764 flux-proofed type. Part needed: HF167F/024-HATF(764) — 24 V coil, main 1 Form A carrying 100 A / breaking 30 A @1000 VAC, auxiliary 1 Form A 1 A 12 VDC for weld detection, PCB termination, body 38x33x43 mm, main blades on 20 mm centres. That auxiliary IS the mirror contact. C2757422 (HF167F/24-HF) is the NON-auxiliary variant, which is why its land has no pads 5/6/8."},

  // ---- CLASS: rating specified, part selected by purchasing ----
  "PP-1u-600":         { status: "CLASS", spec: "1 µF 600 V film" },
  "PP-1u-1100":        { status: "CLASS", spec: "1 µF 1100 V film" },
  "PP-4u7-1200":       { status: "CLASS", spec: "4.7 µF 1200 V film" },
  "PP-2u2-630":        { status: "CLASS", spec: "2.2 µF 630 V PP film, ripple-rated ≥ 10 A rms @100–200 kHz (bank rectifier film)", note: "Faratronic C3D / KEMET R76 / CDE 944U class" },
  "DIODE-1600V-150A-MOD": { status: "DIRECT", spec: "1600 V 150 A rectifier diode, insulated-base 2-terminal module (output blocking diode, 30 kW)", note: "MacMic MDD150-16 / IXYS MDD class — RFQ" },
  "DIODE-1600V-200A-MOD": { status: "DIRECT", spec: "1600 V 200 A rectifier diode, insulated-base 2-terminal module (output blocking diode, 40 kW)", note: "MacMic MDD200-16 / IXYS MDD class — RFQ" },
  "DIODE-1600V-250A-MOD": { status: "DIRECT", spec: "1600 V 250 A rectifier diode, insulated-base 2-terminal module (output blocking diode, 50 kW)", note: "MacMic MDD250-16 / IXYS MDD class — RFQ" },
  "RELAY-PCB-120A-24V": { status: "DIRECT", spec: "PCB power relay 120 A, 24 V coil, zero-current S/P matrix duty (30/40 kW). RFQ line: release + bounce <= 35 ms WITH coil-diode suppression (the ULN COM clamp freewheels the coil, and the fsm open->close gap is 51 ms)", note: "Hongfa HF161F / Churod CHC-D120 class" },
  "RELAY-PCB-150A-24V": { status: "DIRECT", spec: "PCB power relay 150 A, 24 V coil, zero-current S/P matrix duty (50 kW). RFQ line: release + bounce <= 35 ms WITH coil-diode suppression (fsm open->close gap 51 ms)", note: "Hongfa / Churod 150 A class" },
  "PP-10n-1200":       { status: "CLASS", spec: "10 nF 1200 V film" },
  "X1-2u2-530":        { status: "CLASS", spec: "2.2 µF 530 VAC X1 safety film" },
  "X2-4u7-305":        { status: "CLASS", spec: "4.7 µF 305 VAC X2 MKP safety film, 27.5 mm pitch (star X stages)" },
  "Y1-4n7-440":        { lcsc: "C499492", mpn: "VY1472M63Y5UQ63V0", status: "ORDERABLE", spec: "4.7 nF 440 VAC Y1 safety",
                         note: "Vishay VY1 disc, 4.7nF, safety class X1/Y1, THT P=10mm. Rated 500 VAC Y1 — above the 440 VAC the class asks for, so it covers it. No Basic/Preferred Y1 4.7nF exists at JLCPCB; this class is always an Extended part." },
  "FILM-100n-250":     { status: "CLASS", spec: "100 nF 250 V film" },
  "EL-220u-35":        { lcsc: "C45078", mpn: "GR227M035F12RR0VL4FP0", status: "ORDERABLE", spec: "220 µF 35 V electrolytic",
                         note: "CX GR series 220uF 35V D8xL12 THT, 3.5mm pitch. The datasheet rating table gives 0.130 ohm impedance and 640 mA rms ripple @100kHz/105C, so the low-ESR requirement is met with a published number. CHECK: endurance is only 3000h@105C — verify against the life target for a warm aux rail." },
  "MLCC-100p-0603":    { status: "CLASS", spec: "100 pF 0603 C0G" },
  "MLCC-47p-0603":     { status: "CLASS", spec: "47 pF 0603 C0G/NP0 50 V (DESAT blank, Vienna)" },
  "R1206-22R-1%":      { status: "CLASS", spec: "22 Ω 1206 1% (30 kW line-CT burden — F.01 120 A pk observability)" },
  "R1206-18R-1%":      { status: "CLASS", spec: "18 Ω 1206 1% (40 kW line-CT burden)" },
  "R1206-13R-1%":      { status: "CLASS", spec: "13 Ω 1206 1% (50 kW line-CT burden)" },
  "MLCC-1u-0805":      { status: "CLASS", spec: "1 µF 0805 X7R" },
  "MLCC-small":        { status: "CLASS", spec: "0402–0805 MLCC, value per schematic" },
  "CER-2k2-10W-AX":    { status: "CLASS", spec: "2.2 kΩ 10 W wirewound axial" },
  "SQP-6R8-25W":       { status: "CLASS", spec: "6.8 Ω 25 W wirewound pulse axial, series L ≤ 10 µH — 30 / 40 kW input-filter damper resistor (the value is a current-loop stability result: do not substitute another resistance)" },
  "WW-470R-10W":       { status: "CLASS", spec: "470 Ω 10 W wirewound axial" },
  "R2512-47k-HV-AS":   { lcsc: "C2793932", mpn: "PS122WF4702T4E", status: "REVIEW", spec: "47 kΩ 2512 anti-surge HV, 2-series per position",
                         note: "UNI-ROYAL PS = High-Precision Anti-Surge, 47k 1% 2W 2512, 500 V working / 1000 V overload. sqrt(2W x 47k) = 306 V, so the part is power-limited rather than voltage-limited above the 250 V need. OPEN ITEM IS STOCK, NOT SPEC: this and every true anti-surge 47k 2512 2W on LCSC have read zero stock or pre-sale; C2770528 (AS122WJ0473T4E, 5%) is the same-spec AS-series alternate, also pre-sale. Re-check stock before release." },
  "R2512-HV":          { status: "CLASS", spec: "2512 HV-rated resistor, value per schematic" },
  "HV73-475k-1%":      { lcsc: "C4121673", mpn: "HV732BTTD4753F", status: "ORDERABLE", spec: "475 kΩ 1206 1% anti-surge HV divider",
                         note: "KOA HV73 475k 1% 1206 anti-surge HV divider element — the series the class is named for." },
  "R0805-prec-0.1%":   { status: "CLASS", spec: "0.1% precision divider bottom" },
  "R1206-R28-1%-0.5W": { status: "CLASS", spec: "0.28 Ω 1% 0.5 W 1206 current sense (aux current-sense; PT1206FR-7W0R28L family)", note: "C-number to be read back, never invented" },
  "R2512-11k-2W-AS":   { status: "CLASS", spec: "11 kΩ 1% 2512 2 W anti-surge, ≥200 V working (aux RCD clamp, 3-series)", note: "same anti-surge 2512 family as PS122WF4702T4E (R2512-47k-HV-AS) — value row at read-back" },
  "R2512-R05-1W-1%":   { status: "CLASS", spec: "50 mΩ 1% 1 W 2512 current-sense class (RAUX24, the V24 short-loop resistor)", note: "Yageo PT2512 / UniOhm LRx 2512 families — C-number to be read back" },
  "R1206-RG-0.5W":     { status: "CLASS", spec: "gate resistor 1206 0.5 W, value per schematic",
                         note: "CLASS is the correct status here, not an unfinished lookup. The obvious 1206 thick-film (RC1206FR-074R7L, C137258) is 250 mW — half the specified rating, on a resistor that takes the gate-drive pulse — so a generic 1206 is the wrong part: the 0.5 W class needs a pulse-rated series (ERJ-P / RL-class) selected at RFQ." },
  "R0805-10k":         { status: "CLASS", spec: "10 kΩ 0805 gate-source" },
  "R0603-220":         { status: "CLASS", spec: "220 Ω 0603 LED segment" },
  "R-small":           { status: "CLASS", spec: "0402–0805 small-signal resistor, value per schematic" },
  "IND-10u-3A":        { lcsc: "C5189958", mpn: "CYA0630-10UH", status: "ORDERABLE", spec: "10 µH 3 A shielded power inductor",
                         note: "SHOU HAN CYA0630 molded shielded metal-composite, 10uH +/-20%, Irms 4A, Isat 5.5A, DCR 71 mOhm, 7.2x6.6mm. Both current ratings clear the 3 A requirement with margin for the 3V3 buck." },
  "IND-PFC-165u":      { status: "CUSTOM", spec: "165 µH-class PFC choke, 3× 0077908A7 26µ sendust, N=39±1 lot trim, 18 mm² Cu bundle (D1 rev B) — custom wind" },
  "CMC-3PH-2mH-SKU":   { status: "CUSTOM", spec: "3-phase 2 mH nanocrystalline CM choke, current-rated per SKU — no LCSC equivalent. 30 kW: qualify Schaffner RT8131-63-2M8 (63 A / 2.8 mH, Digi-Key) as the catalog drop-in; the custom drawing stays the second source" },
  "XFMR-AUX-FLY-E":    { status: "CUSTOM", spec: "aux flyback ETD44 PC95, 110 W, 321–860 Vin, Np 38/6/4/4, Lp 345 µH ±5 %, leakage ≤4 µH sandwich, pins 1–4 primary / 5–8 SELV (D4 rev E) — custom wind" },


  // ---- every mpn the BOM can emit resolves here; statuses honest, no guessed codes ----
  "GD32G553VET7":      { status: "REVIEW", mpn: "GD32G553VET7", note: "The real order code; the LCSC listing is still to be re-verified against it before release." },
  "NCP1252D":          { status: "ORDERABLE", mpn: "NCP1252DDR2G", note: "onsemi D-suffix, wide distribution. The A-suffix cannot cold-start this stage and must not be substituted." },
  "NSI1042-DSWR":      { lcsc: "C3445856", status: "ORDERABLE", note: "same silicon as the NSI1042 row; -DSWR is the verified order suffix" },
  "74HC02":            { status: "ORDERABLE", mpn: "74HC02D", note: "any major vendor (Nexperia/TI/onsemi), SOIC-14 — JLC-basic class" },
  "ELH-470u500":       { status: "CLASS", spec: "470 µF **500 V** snap-in, 105 °C, DC-link grade, −40 °C category. The 500 V class is the requirement: a 450 V part runs 92 % of nominal and 97.8 % at the F.38 boundary, and the free bus-side alternatives are closed (810 V fails the 500 V-bank FHA gain; capping LOW mode at 480 V pushes 480–500 V into HIGH with a 240–250 V bank). Binding RFQ line: height ≤ the drawn can, ripple ≥ 5.2 A rms @ 100 kHz / 105 °C, ESR ≤ 80 mΩ @ 100 kHz, leakage ≤ 0.5 mA/can at 85 °C/415 V graded per half, endurance lot 1000 h at 438 V/105 °C ×5" },
  "PP-2u2-1100":       { status: "CLASS", spec: "2.2 µF 1100 V PP film, 27.5 mm pitch — the capacitor of the DC-link entry RC damper, I_rms ≥ 12 A at 400 kHz / 85 °C" },
  "RTF-50W-R33-TO247": { status: "CLASS", spec: "0.33 Ω ≥ 50 W thick-film NON-INDUCTIVE, TO-247 two-lead, heatsink-clipped, series L ≤ 100 nH — the resistor of the DC-link entry RC damper; duty 7 / 16 / 36 W worst per SKU whenever the bridge runs at f_max (2·f_sw on the entry-film / stud resonance)" },
  "C1206-1n-1kV-C0G":  { status: "CLASS", spec: "1 nF 1 kV C0G 1206 — LLC per-die turn-off snubber at 30 kW and 50 kW L/A (tanks.mjs cs). C0G is the requirement: an X7R at 1 kV loses most of its capacitance under bias and the whole effect with it" },
  "C1206-330p-1kV-C0G":{ status: "CLASS", spec: "330 pF 1 kV C0G 1206 — LLC per-die turn-off snubber at 30 kW (tanks.mjs cs; 470 pF and above shut the leg-A ZVS window at the SER250-bus764 corner). C0G is the requirement: an X7R at 1 kV loses most of its capacitance under bias" },
  "C1206-680p-1kV-C0G":{ status: "CLASS", spec: "680 pF 1 kV C0G 1206 — LLC per-die turn-off snubber at 40 kW (tanks.mjs cs; the knee — 1 nF rings that SKU's PAR500 corner to 91 % of 1200 V). C0G is the requirement: an X7R at 1 kV loses most of its capacitance under bias" },
  "C1812-330p-1k":     { status: "CLASS", spec: "330 pF 1 kV C0G 1812 — Vienna snubber; at 100 pF the unclamped half-cycle sits at 85–89 % of 750 V on the 50 kW SKUs" },
  "MLCC-18p-0603":     { status: "CLASS", spec: "18 pF 0603 C0G/NP0 50 V — LLC DESAT blank. Bounded on both sides: two dies per channel double the soft-off charge, so 22 pF sits over 75 % of the short-circuit withstand, while 10 / 15 pF fall under the 0.4 µs noise floor" },
  "R2512-4k7-1W":      { status: "CLASS", spec: "4.7 kΩ 1 W 2512 — V24 preload; without a minimum load V24 peak-charges to 25–26.5 V against a 26.4 V relay-coil maximum" },
  "X1-4u7-530":        { status: "CLASS", spec: "X1 4.7 µF 530 VAC film — 50 kW input-filter damper cap" },
  "SQP-4R7-25W":       { status: "CLASS", spec: "4.7 Ω 25 W wirewound pulse axial, series L ≤ 10 µH — 50 kW input-filter damper resistor (11.8 W, 47 % of class)" },
  "Y2-10n-300":        { status: "CLASS", spec: "Y2 10 nF 300 VAC safety film — converter-node L-PE trio. NOTE the coupled decision: PE leakage scales with C, so this takes a module to 1.67 mA at 1.1 × 475 VAC with one line open" },
  "GDT-2k5-20kA":      { status: "CLASS", spec: "gas discharge tube 2.5 kV, ≥20 kA 8/20 µs, 8 mm — L-PE surge path in series with the S20K550. A 3.5 kV GDT never fires at the OVC III 4 kV level, which leaves the path open" },
  "BZX84-B15":         { status: "ORDERABLE", mpn: "BZX84-B15", note: "15 V ±2 % zener SOT-23. A ±5 % part (BZT52-C15) puts the V15 upper corner at 16.6 V, outside the bias modules' 13.5–16.5 V window." },
  "SMBJ18A":           { status: "ORDERABLE", note: "V15 rail clamp. The standoff must sit above the rail's normal maximum, or the TVS leaks continuously and is a heater rather than a clamp." },
  "SMBJ28A":           { status: "ORDERABLE", note: "V24 rail clamp, paired with the 4.7 k V24 preload (RPL24)." },
  "XTAL-8M-30PPM-3225":{ status: "CLASS", spec: "8 MHz ±30 ppm (incl. tempco + ageing over −40…+105 °C) SMD crystal, 3.2 × 2.5 mm, CL 12 pF, ESR ≤ 150 Ω — CAN off the ±2–3 % internal RC is 5× the ISO 11898-1 budget" },
  "TP-1mm-PAD":        { status: "CLASS", spec: "1 mm bare test pad on WDI — the fixture kicks the watchdog through it while the WDO→NRST link is lifted for blank-chip SWD programming; a fab-drawing item, not a purchased part" },
  "HFE18V-250A-AUX":   { status: "REVIEW", mpn: "HFE18V/NB90 or TE EV200 class", note: "A genuine 250 A CONTACTOR with a 1 Form A auxiliary is required here — the HF167F family tops out at ~100 A main and cannot reach this rating. Acceptance: make ≥ 360 A pk at bypass closure, ≤ 70 V across the contacts, ≥ 30 000 makes, and the chosen part's own land pattern re-checked before BOM freeze. Price is an estimate until the RFQ lands." },

  "R2512-33k-HV-AS":   { status: "CLASS", spec: "33 kΩ 2512 2 W anti-surge HV, U_max ≥ 250 V, 2-series per position — the artificial star AND the X-capacitor bleed path, which is what sets the value: across three X stages it brings the terminals below 60 V in 3.7 / 4.5 s, inside the 5 s line for permanently connected equipment", note: "same UNI-ROYAL PS / KOA anti-surge 2512 family as PS122WF4702T4E (R2512-47k-HV-AS) — value row at read-back, never invented" },
  "R2512-150k-HV":     { status: "CLASS", spec: "150 kΩ 1 % 2512 HV, U_max ≥ 400 V, 3-series across the output studs — passive output bleeder behind DOUT: 450 kΩ on 9.4 µF = τ 4.2 s, < 60 V in ≈ 12 s from 1000 V; 0.74 W / 333 V per element", note: "HV-rated 2512 families (KOA HV73 tops out at 1206, so this is the RV2512 / UNI-ROYAL PS-HV class) — C-number to be read back" },
  "R2512-10R-3W-PULSE":{ status: "CLASS", spec: "10 Ω 2512 **3 W pulse-proof** — Vienna RC snubber, which dissipates 2.84 W per phase at the 750 V-class swing and 50 kHz with C_SN 330 pF", note: "pulse-rated thick film (Bourns CRM / Vishay PLT / KOA SR class) at 3 W, or 2 × 20 Ω 2 W in parallel on the same land. The Bourns CRM2512-FX-10R0ELF is a 2 W part and must NOT be fitted." },
  "MLCC-1n-0402-C0G":  { status: "CLASS", spec: "1 nF 0402 C0G/NP0 ≥ 50 V — ADC sampling reservoir at every analogue card pin. C0G is the requirement, not a preference: an X7R reservoir has a voltage coefficient, and the thing it feeds is a 12-bit conversion" },
  "SIC-1700-1R-G15":   { status: "CLASS", spec: "SiC MOSFET 1700 V ≈ 1 Ω SPECIFIED AT V_GS 12–15 V — aux flyback switch. Acceptance: R_DS(on) ≤ 1.1 Ω at V_GS 15 V / 25 °C, V_GS(th) ≤ 4.5 V, V_GS(max) ≥ 19 V, R_G,int stated", note: "The C2M1000170D (C5713500) must NOT be fitted: its 1 Ω is a V_GS = 20 V figure and the NCP1252 DRV pin clamps at 15 V typ / 18 V max (Rev 9), so the part is never fully enhanced and at the 9 V UVLO corner is barely on. Candidate class: Infineon CoolSiC trench M1 IMBF170R1K0M1 (a +15 V/−5 V part) — confirm the package against the placeholder land before the PO; never a guessed C-number" },
  "ISO-GBIAS-15-1W":   { status: "CLASS", spec: "reinforced isolated gate-bias module, 1 W, 15 V DC in (13.5–16.5 V), dual out **+15 V / −3…−4 V**, ≥ 5 kVrms 1-min, C_io ≤ 5 pF, SIP land per the QA01C footprint family. ACCEPTANCE: **+15 V ±5 % at 20–100 % load and ≤ +17.5 V at 5 % load** — the channels run at ≈ 17 % load, where an unregulated open-frame module rises +10…+18 %", note: "There is no −15 V-rail MORNSUN variant: the catalogue runs QA01C (+20/−4 V) and QA01C-18 (+18/−3 V), so this row must stay a CLASS and never be written as a QA01C-15 order code. Whether the frozen switch wants the +15 V or the +18 V variant follows ITS recommended V_GS (the SG2M023120LJ has no public datasheet; 1200 V / 23 mΩ Chinese dies are 18 V parts), so the row moves with the device freeze. Candidates to qualify: MORNSUN QA01C-18, RECOM RxxP2xxxD reinforced, Murata MGJ1 class" },
  "ISO-GBIAS-15-2W":   { status: "CLASS", spec: "the same class at **2 W** — the LLC channels that drive TWO paralleled dies at 40/50 kW, where P_gate + driver I_CC2 reaches 1.59 W at f_max 203 kHz (159 % of a 1 W module) and the droop hits the NSI66x1A 9.8–11.8 V VCC2 UVLO. Same acceptance row, same land", note: "see ISO-GBIAS-15-1W — same class reasoning and the same candidate list in the 2 W grade" },

  "IND-LR-E70-30":     { status: "CUSTOM", spec: "D2-30 rev F: external resonant inductor 5.00 µH ±3%, 2x E70/33/32 gapped, N=5, litz 8000x0.05 — pack sheet" },
  "IND-LR-E70-40":     { status: "CUSTOM", spec: "D2-40 rev F: external resonant inductor 3.99 µH ±3%, 2x E70/33/32 gapped, N=5, litz 10000x0.05 — pack sheet" },
  "IND-LR-E70-50":     { status: "CUSTOM", spec: "D2-50 rev F: external resonant inductor 3.20 µH ±3%, 2x E70/33/32 gapped, N=5, litz 12000x0.05 — pack sheet" },
  "XFMR-LLC-CELL-2E70-30": { status: "CUSTOM", spec: "D3-30 rev D: full-bridge transformer cell, 2x E70/33/32, 6:6||6, B66372A2000 former, Lm 28 µH/cell ±7% — pack sheet" },
  "XFMR-LLC-CELL-3E70-40": { status: "CUSTOM", spec: "D3-40 rev D: full-bridge transformer cell, 3x E70/33/32, 4:4||4, 3-set former, Lm 21.75 µH/cell ±7% — pack sheet" },
  "XFMR-LLC-CELL-3E70-50": { status: "CUSTOM", spec: "D3-50 rev D: full-bridge transformer cell, 3x E70/33/32, 4:4||4, 3-set former, Lm 17.8 µH/cell ±7% — pack sheet" },
  "CT-RES-1:100-150A": { status: "CLASS", spec: "resonant CT 1:100, 150 A rms class, 20–250 kHz pass-through (40/50 kW full-bridge tank), secondary ≥ 1.3 A rms continuous", note: "custom HF-CT wind at RFQ — no catalogue AS-family part reaches this secondary current; see the CT-RES-1:100-100A requirement" },
  "R2512-0R47-1W-1%":  { status: "CLASS", spec: "0.47 Ω 1% 1 W 2512 (30 kW resonant-CT burden — F.11 140 A pk)" },
  "R2512-0R36-1W-1%":  { status: "CLASS", spec: "0.36 Ω 1% 1 W 2512 (40 kW resonant-CT burden — F.11 180 A pk)" },
  "R2512-0R30-2W-1%":  { status: "CLASS", spec: "0.30 Ω 1% 2 W 2512 (50 kW resonant-CT burden — F.11 220 A pk)", note: "Bourns CRM/Yageo SR anti-surge families" },
  "PP-33n-1200V":      { status: "CLASS", spec: "33 nF 1200 V PP resonant-duty film (full-bridge tank, all SKUs; Vrms-vs-f >=460 V @140 kHz)", note: "candidates: CDE 942C20P33K / Faratronic resonant PP" },
  "CER-25W-33R-AX":    { status: "CLASS", spec: "33 R 25 W axial ceramic pulse (AC precharge; 160 J family point)", note: "TE SQP25/CGS class — the pulse curve is the acceptance" },
  "CER-25W-160R-AX":   { status: "CLASS", spec: "160 R 25 W axial ceramic pulse (bus discharge string)", note: "TE SQP25/CGS class" },
  "CER-50W-33R-AX":    { status: "CLASS", spec: "33 R 50 W axial ceramic pulse — 50 kW precharge (~212 J/event)", note: "TE/Vitrohm 50 W pulse class" },
  "CER-50W-160R-AX":   { status: "CLASS", spec: "160 R 50 W axial ceramic pulse — 50 kW discharge (162 J/event)", note: "TE/Vitrohm 50 W pulse class" },
  "FUSE-gG-690V-160A": { status: "CLASS", spec: "160 A gG 690 VAC NH00 blade + base — 50 kW input (the 22x58 frame ends at 125 A)", note: "candidates: Bussmann NH00 gG 160 A / SIBA NH00 / local NH00 base" },
  "HF167F-100A-M":     { status: "DIRECT", mpn: "HF167F/024-HATF(764)", note: "same documented Hongfa code family as the 80 A row — 100 A main / 30 A break @1000 VAC, auxiliary 1 Form A as the mirror contact; 40 kW precharge bypass" },
  "CT-LINE-2500-150A": { status: "DIRECT", spec: "line CT 2500:1, 150 A class, 4 kV hipot — Talema ACX-1150 (linear to 200 A at 33 Ω; 38.1×38.1 mm body, 33.0 mm pin row — its own land) — 40/50 kW", note: "Talema ACX-family upsize RFQ (Salem, India); PCB burden per SKU, 18 Ω at 40 kW and 13 Ω at 50 kW" },
  "CT-RES-1:100-100A": { status: "CLASS", spec: "resonant CT 1:100, 100 A rms class, 20–250 kHz pass-through (30 kW full-bridge tank), secondary ≥ 1.3 A rms continuous", note: "custom HF-CT wind at RFQ — no catalogue AS-family part reaches this secondary current: that family stops at 20–200 kHz, a 30 A primary and 15 amp-turns rms" },
  "SHUNT-50MV-100A":   { status: "CLASS", spec: "manganin shunt 50 mV @ 100 A, Kelvin 4-T (30 kW)", note: "FL-2C class (wide CN availability) or Isabellenhuette eq; end-of-line gain calibration absorbs the tolerance" },
  "SHUNT-50MV-133A":   { status: "CLASS", spec: "manganin shunt 50 mV @ 133 A, Kelvin 4-T (40 kW)", note: "FL-2C class custom tap — the value is in the order code" },
  "SHUNT-50MV-167A":   { status: "CLASS", spec: "manganin shunt 50 mV @ 167 A, Kelvin 4-T (50 kW)", note: "FL-2C class custom tap" },
  "R2010-1k-0.75W-1%": { status: "CLASS", spec: "1 k 0.75 W 2010 (PV-driver LED feed)", note: "any thick-film 2010" },
  "R0603-10k":         { status: "CLASS", spec: "10 k 0603 (card-way pull-downs, default-OFF)" },
  "R0805-2R2":         { status: "CLASS", spec: "2.2 R 0805 (per-device gate R on paralleled SiC)" },
  "MICROFIT3-40":      { status: "CLASS", spec: "Micro-Fit 3.0 dual-row 40-ckt vertical header, 5 A/contact (HARNESS40)", note: "Molex 43045-40xx — finish/retention variant at RFQ; mate = receptacle 43025-40xx with crimp harness" },
  "CONN-CARD-88-H":    { status: "CLASS", spec: "88-way 2x44 2.54 mm PIN HEADER, keyed (board side)", note: "Samtec TSW-144 class / generic gold-flash — mate of -R" },
  "CONN-CARD-88-R":    { status: "CLASS", spec: "88-way 2x44 2.54 mm RECEPTACLE, keyed (card side)", note: "Samtec SSW-144 class" },
  "IND-PFC-116u-40":   { status: "CUSTOM", spec: "D1-40 rev B: 5x 0077908A7, N=26+/-1 lot-trim — pack sheet PMP-MAG-D1-40" },
  "IND-PFC-107u-50":   { status: "CUSTOM", spec: "D1-50 rev B: 5x T79 26u, N=24+/-1 — pack sheet PMP-MAG-D1-50" },
  "TLV3202-class":     { status: "CLASS", spec: "dual push-pull comparator ≤50 ns, 2.7–5.5 V, SOIC/VSSOP-8 (F.11 window) — TLV3202AIDR" },
  "BAT54A":            { status: "CLASS", spec: "dual Schottky common anode SOT-23 (F.11 diode-OR)" },

  // SKU-scaled variants: the relay, fuse and CT classes change with module power, so each rating has
  // its own order code. One p/n across the family prints an undersized part on the larger drawings.
  "FUSE-gG-690V-80A":  { status: "CLASS", spec: "80 A gG 690 VAC 22×58 — 30 kW (55.9 A worst continuous; a 63 A element runs 88 % of nameplate and goes negative after the ~0.72× enclosed/+55 °C derate)", note: "holder = 22×58 base (RT28-63 / RT18-125 class)" },
  "FUSE-gG-690V-125A": { status: "CLASS", spec: "125 A gG 690 VAC 22×58 — 40 kW (73.3 A worst continuous; a 100 A element derates to 72 A and does not cover it)" , note: "the 22x58 mm RT28-125 holder is required; an RT28-32 base holds 32 A max."},
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
  "R0805-prec-0.1%|6.8k":  { lcsc: "C3033907", mpn: "ARG05BTC6801",     note: "Viking ARG 6.8k 0.1% 25ppm 0805 thin film, 150V. Chosen over Panasonic C445656 (100V) on voltage headroom; the series-matching YAGEO 6.8k (C865628) is out of stock. 150V is ample here because these are divider BOTTOM elements — the HV is dropped across the HV73-475k top string." },
  "R1206-RG-0.5W|4.7":     { lcsc: "C859161",  mpn: "RC1206FR-7W4R7L",  note: "YAGEO 4.7 ohm 1% 500mW 1206 gate resistor (84 positions)" },
  "R1206-RG-0.5W|2.2":     { lcsc: "C873951",  mpn: "SR1206FR-7W2R2L",  note: "YAGEO SR anti-surge 2.2 ohm 1% 500mW 1206 (42 positions). The exact-series RC1206FR-7W2R2L (C326574) is OUT OF STOCK — do not order it." },
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
  "R1206-27R-1%|27":    { mpn: "RC1206FR-0727RL", note: "27R 1206 1% — C-number to be read back from the LCSC catalogue (convention: never invent an LCSC code). A 33R part (C137308) must NOT be fitted." },
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
  "R-small|7.5k":       { mpn: "RC0603FR-077K5L", note: "7.5k 0603 1% — RBR2, the NCP1252D brown-in divider bottom; C-number to be read back, never invented" },
  "R-small|330":        { lcsc: "C110440", mpn: "RC0805FR-07330RL", note: "330R 0805 1%" },
  "R1206-27R-1%|1M":    { lcsc: "C107700", mpn: "RC0805FR-071ML",   note: "1M — these instances are on an 0805 land" },
  "R1206-27R-1%|330":   { lcsc: "C110440", mpn: "RC0805FR-07330RL", note: "330R — 0805 land" },
  "R1206-27R-1%|4.7k":  { lcsc: "C60816",  mpn: "RC0805FR-074K7L",  note: "4.7k — 0805 land, same part as R-small|4.7k" },
  "R-small|4.7k":       { lcsc: "C60816",  mpn: "RC0805FR-074K7L",  note: "4.7k 0805 1%" },
  "R-small|0R":         { lcsc: "C96345",  mpn: "RC0805JR-070RL",   note: "0R 0805 jumper" },
  "R-small|45.3k":      { lcsc: "C273885", mpn: "RC0805FR-0745K3L", note: "45.3k 0805 1%" },
  "R-small|118k":       { lcsc: "C274001", mpn: "RC0805FR-07118KL", note: "118k 0805 1%" },
  "R-small|120":        { lcsc: "C114928", mpn: "RC1206FR-07120RL", note: "120R 1206 1% 250mW" },
  "MLCC-small|4.7nF":   { lcsc: "C107208", mpn: "CC1206KRX7R9BB472", note: "4.7nF 1206 X7R 50V — CCGB, the CGND/DGND common-mode bridge. A generic (non-Y-class) part is correct: CAN sits inside the touch-safe SELV control domain, so CGND-DGND is FUNCTIONAL isolation breaking a ground loop to the off-board controller, not a safety barrier." },
  "MLCC-100n-0402|100nF": { lcsc: "C60474", mpn: "CC0402KRX7R7BB104", note: "100nF 0402 X7R 16V — used only on the 3.3 V rail (~5x derating)" },
  // ---- package-keyed rows (family|value|pkg). The DRAWN LAND is the authority — it is what layout
  // will place — so the part follows it, with same-series siblings in the drawn size. Without these
  // rows the value map is land-blind and names a part whose package differs from its own footprint.
  // C-numbers to be read back, never invented.
  "MLCC-small|100nF|0805":  { mpn: "CC0805KRX7R9BB104", note: "100nF 0805 X7R 50V — land-matched; C-number to be read back" },
  "MLCC-small|1nF|0805":    { mpn: "CC0805KRX7R9BB102", note: "1nF 0805 X7R 50V — land-matched; C-number to be read back" },
  "MLCC-small|10nF|0805":   { mpn: "CC0805KRX7R9BB103", note: "10nF 0805 X7R 50V — land-matched; C-number to be read back" },
  "MLCC-small|220pF|0805":  { mpn: "CC0805JRNPO9BN221", note: "220pF 0805 NP0 50V — land-matched; C-number to be read back" },
  "MLCC-small|2.2nF|0603":  { mpn: "CC0603KRX7R9BB222", note: "2.2nF 0603 X7R 50V — land-matched; C-number to be read back" },
  "MLCC-small|10uF|0603":   { mpn: "CL10A106KP8NNNC",   note: "10uF 0603 X5R 10V — card analog nodes <=3.3 V ONLY; the V15 positions stay on the 0805 25 V row; C-number to be read back" },
  "MLCC-small|1uF|0402":    { mpn: "CL05A105KO5NNNC",   note: "1uF 0402 X5R >=16 V (driver 5 V logic side) — verify the suffix at read-back" },
  "MLCC-small|1uF|0603":    { mpn: "CL10A105KB8NNNC",   note: "1uF 0603 X7R 25V — land-matched; C-number to be read back" },
  "MLCC-1u-0805|1uF|0402":  { mpn: "CL05A105KO5NNNC",   note: "1uF 0402 X5R >=16 V (driver 5 V logic side) — verify the suffix at read-back" },
  "MLCC-1u-0805|1uF|0603":  { mpn: "CL10A105KB8NNNC",   note: "1uF 0603 X7R 25V — land-matched; C-number to be read back" },
  "MLCC-22p-0603|22pF|0805": { mpn: "CC0805JRNPO9BN220", note: "22pF 0805 C0G 50V — land-matched to a drawn 0805; C-number to be read back" },
  "MLCC-47p-0603|47pF|0805": { mpn: "CC0805JRNPO9BN470", note: "47pF 0805 C0G 50V (DESAT blank, Vienna) — land-matched to a drawn 0805; C-number to be read back" },
  "R0603-220|220|0805":     { mpn: "RC0805FR-07220RL",  note: "220R 0805 1% (7-seg segment feeds are drawn 0805) — land-matched; C-number to be read back" },
  "R-small|10k|0603":       { mpn: "RC0603FR-0710KL", note: "10k 0603 1% — land-matched to the drawn 0603; C-number to be read back" },
  "R-small|100|0603":       { mpn: "RC0603FR-07100RL", note: "100 0603 1% — land-matched to the drawn 0603; C-number to be read back" },
  "R-small|1k|0603":        { mpn: "RC0603FR-071KL", note: "1k 0603 1% — land-matched to the drawn 0603; C-number to be read back" },
  "R-small|2.2k|0603":      { mpn: "RC0603FR-072K2L", note: "2.2k 0603 1% — land-matched to the drawn 0603; C-number to be read back" },
  "R-small|100k|0603":      { mpn: "RC0603FR-07100KL", note: "100k 0603 1% — land-matched to the drawn 0603; C-number to be read back" },
  "R-small|45.3k|0603":     { mpn: "RC0603FR-0745K3L", note: "45.3k 0603 1% — land-matched to the drawn 0603; C-number to be read back" },
  "R-small|47k|0603":       { mpn: "RC0603FR-0747KL", note: "47k 0603 1% — land-matched to the drawn 0603; C-number to be read back" },
  "R-small|330|0603":       { mpn: "RC0603FR-07330RL", note: "330 0603 1% — land-matched to the drawn 0603; C-number to be read back" },
  "R-small|4.7k|0603":      { mpn: "RC0603FR-074K7L", note: "4.7k 0603 1% — land-matched to the drawn 0603; C-number to be read back" },
  "R-small|0R|0603":        { mpn: "RC0603JR-070RL", note: "0R 0603 jumper — land-matched to the drawn 0603; C-number to be read back" },
  "R-small|15k|0603":       { mpn: "RC0603FR-0715KL", note: "15k 0603 1% — land-matched to the drawn 0603; C-number to be read back" },
  "R-small|1M|1206":        { mpn: "RC1206FR-071ML",    note: "1M 1206 1% 200 V working (CGND bleed / PE-tie class, drawn 1206) — land-matched; C-number to be read back" },
  "R1206-27R-1%|1M|1206":   { mpn: "RC1206FR-071ML",    note: "1M 1206 1% — land-matched; C-number to be read back" },
};

// Resolve by family AND value where we have a real catalogue part, else fall back to the
// per-MPN map (which is where the class-specified parts correctly stay).
// A LCSC_BY_VALUE hit carries a real C-number but no status field. In this taxonomy a mapped
// C-number IS the orderable state, so default it rather than leave the column empty; an entry
// that sets its own status (REVIEW, SECOND-SOURCE) keeps it.
export const lcscForPart = (mpn, value, pkg) => {
  // Land-aware: a package-keyed row (family|value|pkg) beats the package-blind row, so the named
  // part always matches the drawn land. pkg is the chip size ("0402".."2512") or undefined.
  const hit = (pkg && LCSC_BY_VALUE[`${mpn}|${value}|${pkg}`]) ?? LCSC_BY_VALUE[`${mpn}|${value}`];
  if (!hit) return lcscFor(mpn);
  if (hit.lcsc) return { ...hit, status: hit.status ?? "ORDERABLE" };
  return { ...lcscFor(mpn), ...hit };   // a value row with only a candidate mpn keeps its class status
};
