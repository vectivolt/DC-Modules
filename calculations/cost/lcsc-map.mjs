// LCSC part numbers per design part family.
//
// Two kinds of entry, deliberately kept apart — a purchasable part number must never be
// guessed:
//   ORDERABLE  a specific LCSC part that meets the design rating, verified against the LCSC
//              library during the EasyEDA transcription (2026-09-05/06).
//   CLASS      the design specifies a rating, not a part (film/X/Y capacitors, MLCCs, power
//              ceramics, precision dividers). A generic symbol stands in on the schematic.
//              Purchasing selects against the stated rating; codes here would be fiction.
//
// Generated seed: calculations/out/easyeda/part-uuid-map.json. Edit here, not there.

export const LCSC = {
  // ---- ORDERABLE: semiconductors ----
  "GD32G553VET6":      { lcsc: "C9900185865", status: "ORDERABLE" },
  "ULN2803A":          { lcsc: "C2865085",   status: "ORDERABLE", note: "TI ULN2803ADW SOIC-18" },
  "NSI6611":           { lcsc: "C7470934",   status: "ORDERABLE", note: "NSI6611ASC-Q1SWR" },
  "NCP1252A":          { lcsc: "C80800",     status: "ORDERABLE", note: "NCP1252ADR2G" },
  "TPS54202-class":    { lcsc: "C191884",    status: "ORDERABLE", note: "TPS54202DDCR" },
  "TPS3430-class":     { lcsc: "C2870545",   status: "ORDERABLE", note: "TPS3430WDRCR" },
  "74HC11":            { lcsc: "C5524384",   status: "ORDERABLE", note: "74HC11D SOIC-14" },
  "74HC595":           { lcsc: "C19192516",  status: "ORDERABLE", note: "74HC595D SOP-16" },
  "TLV9061-class":     { lcsc: "C398358",    status: "ORDERABLE", note: "TLV9061IDBVR" },
  "AMC1311-class":     { lcsc: "C456277",    status: "ORDERABLE", note: "AMC1311DWVR" },
  "AMC1350-class":     { lcsc: "C5214206",   status: "ORDERABLE", note: "AMC1350QDWVRQ1" },
  "NSI1200-DSWR":      { lcsc: "C3029747",   status: "ORDERABLE", note: "NSI1200-DSWVR" },
  "NSI1042":           { lcsc: "C3445856",   status: "ORDERABLE", note: "NSi1042-DSWR SO-16 isolated CAN" },
  "PESD1CAN":          { lcsc: "C143073",    status: "ORDERABLE" },
  "VOM1271T":          { lcsc: "C146286",    status: "ORDERABLE" },
  "TLP152-class":      { lcsc: "C17255258",  status: "ORDERABLE", note: "TLP152(E" },
  "S8050":             { lcsc: "C2146",      status: "ORDERABLE", note: "JLCPCB Basic" },
  "US1M":              { lcsc: "C412437",    status: "ORDERABLE", note: "JLCPCB Basic" },
  "US2G":              { lcsc: "C49263",     status: "ORDERABLE" },
  "UF-400V-3A":        { lcsc: "C3039981",   status: "ORDERABLE", note: "US3M 1 kV 3 A" },
  "1N4148WS":          { lcsc: "C2128",      status: "ORDERABLE", note: "JLCPCB Basic" },
  "SMBJ26A":           { lcsc: "C127562",    status: "ORDERABLE" },
  "SMBJ16A":           { lcsc: "C151859",    status: "ORDERABLE" },
  "FAST-1200-1A":      { lcsc: "C56792",     status: "ORDERABLE", note: "STTH112U 1.2 kV" },
  "B3M010C075Z":       { lcsc: "C5713521",   status: "SECOND-SOURCE", note: "C3M0021120K 1200 V/21 mΩ TO-247-4 — BASiC 750 V/10 mΩ not on LCSC; requalify Vds" },
  "SG2M023120LJ":      { lcsc: "C5713523",   status: "SECOND-SOURCE", note: "R3: LCSC C5713523 is Wolfspeed C3M0016120K (1200 V/16 mOhm) — NOT the SiChain part, so vendor/price/RdsOn on this row describe the second source, not the primary. Pinouts are identical (1=D/tab 2=S 3=driver source 4=G) so there is no footprint risk. Gate drive differs: SiChain -4/+18 V for 23 mOhm, Wolfspeed C3M -4/+15 V." },
  "SICJBS-1200-10":    { lcsc: "C7435087",   status: "ORDERABLE", note: "GC4D10120H 1200 V SiC JBS" },
  "SICJBS-1200-20":    { lcsc: "C5713501",   status: "ORDERABLE", note: "C4D20120D 1200 V SiC JBS" },
  "SICJBS-1200-40":    { lcsc: "C7435099",   status: "ORDERABLE", note: "GC4D20120D 1200 V 34 A SiC JBS" },
  "SIC-1700-1R":       { lcsc: "C5713500",   status: "ORDERABLE", note: "C2M1000170D 1700 V" },
  "SIC-1200-5A":       { lcsc: "C536285",    status: "ORDERABLE", note: "IMW120R350M1H" },

  // ---- ORDERABLE: magnetics, relays, modules, connectors, electromechanical ----
  "QA01C":             { lcsc: "C2757491",   status: "REVIEW", note: "R3: \"QA01C-15S18\" does not exist in MORNSUN's catalogue. Real variants: QA01C = +20/-4 V, QA01C-18 = +18/-3 V. Pin map (1=Vin 2=GND 5=-Vo 6=0V 7=+Vo) was already correct. DECISION NEEDED: B3M010C075Z recommends VGSop -5/+18 V (abs max +22), so QA01C's +20 V is above the recommended drive; QA01C-18 gives +18/-3 V but SG2M023120LJ specifies 23 mOhm at +18 V." },
  "ISO5V-RFC-6K":      { lcsc: "C20613048",  status: "REVIEW", note: "B1505S-1WR2 is 3 kVDC basic; E-rev D calls for a REINFORCED ≥6 kV module — confirm before release" },
  "MICROFIT3-16":      { lcsc: "C277731",    status: "ORDERABLE", note: "Molex 430451600" },
  "PH-2":              { lcsc: "C20504437",  status: "ORDERABLE", note: "JST B2B-PH-K-S" },
  "PH-4":              { lcsc: "C131334",    status: "ORDERABLE", note: "JST B4B-PH-K-S" },
  "PH-4-FAN":          { lcsc: "C131334",    status: "ORDERABLE", note: "JST B4B-PH-K-S" },
  "HDR-1x5-2.54":      { lcsc: "C492404",    status: "ORDERABLE", note: "PZ254V-11-05P" },
  "TACT-6x6":          { lcsc: "C318884",    status: "ORDERABLE", note: "TS-1187A, JLCPCB Basic" },
  "LED-2DIG-0.56CC":   { lcsc: "C9900021773", status: "ORDERABLE", note: "05621G 2-digit 0.56in CC" },
  "CMC-CAN-51uH":      { lcsc: "C55213551",  status: "ORDERABLE", note: "ACT45B-510-2P 51 µH" },
  "FB-600R-0805":      { lcsc: "C1017",      status: "ORDERABLE", note: "GZ2012D601TF, JLCPCB Basic" },
  "S20K550":           { lcsc: "C317868",    status: "REVIEW", note: "20D561K is 350 VAC/460 VDC — S20K550 needs 550 VAC; size up before release" },
  "GDT-3k5-20kA":      { lcsc: "C9900081756", status: "REVIEW", note: "BGO6000A10-LC2 — confirm 3.5 kV / 20 kA rating" },
  "FUSE-gG-690V":      { lcsc: "C4255278",   status: "REVIEW", note: "RT28-32 RO15 holder class — 690 VAC gG element to be selected per SKU current" },
  "CT-100A-1:2500":    { lcsc: "C94571",     status: "REVIEW", note: "ZMCT103C is 5 A/1000:1 — a 100 A 1:2500 line CT is a custom/alternate part. R3: sized up from 60 A because one cell draws 63.95 A rms at 285 V low line (continuous). Same price class; catch before layout — a 100 A window CT has a different pin pitch." },
  "CT-RES-1:100":      { lcsc: "C94571",     status: "REVIEW", note: "as above; resonant CT ratio differs" },
  "HF167F-80A-M":      { lcsc: "C2757422",   status: "REVIEW", note: "HF167F/24-HF 100 A@1000 VAC; mirror-contact variant to be confirmed" },
  "HFE82V-M-CLASS":    { lcsc: "C340670",    status: "REVIEW", note: "HFE82V-60/12-H2 — 12 V coil; need 24 V + mirror contact" },
  "HFE9-10A-1kV-M":    { lcsc: "C115081",    status: "REVIEW", note: "HFE9-1/12DST — confirm 1 kVDC / mirror contact" },
  "SHUNT-MANG":        { lcsc: "C508584",    status: "REVIEW", note: "HoFLQ60-75A-75mV — match to per-SKU output current" },

  // ---- CLASS: rating specified, part selected by purchasing ----
  "PP-46n-1200":       { status: "CLASS", spec: "46 nF 1200 V PP pulse film, resonant tank" },
  "PP-1u-600":         { status: "CLASS", spec: "1 µF 600 V film" },
  "PP-1u-1100":        { status: "CLASS", spec: "1 µF 1100 V film" },
  "PP-4u7-1200":       { status: "CLASS", spec: "4.7 µF 1200 V film" },
  "PP-10n-1200":       { status: "CLASS", spec: "10 nF 1200 V film" },
  "X1-2u2-530":        { status: "CLASS", spec: "2.2 µF 530 VAC X1 safety film" },
  "Y1-4n7-440":        { status: "CLASS", spec: "4.7 nF 440 VAC Y1 safety" },
  "FILM-100n-250":     { status: "CLASS", spec: "100 nF 250 V film" },
  "C1812-100p-1k":     { status: "CLASS", spec: "100 pF 1 kV C0G 1812" },
  "EL-47u-35":         { status: "CLASS", spec: "47 µF 35 V electrolytic" },
  "EL-220u-35":        { status: "CLASS", spec: "220 µF 35 V electrolytic" },
  "ELH-470u450":       { status: "CLASS", spec: "470 µF 450 V snap-in, 105 °C, DC-link grade" },
  "MLCC-10u-0805":     { status: "CLASS", spec: "10 µF 0805 X7R/X5R" },
  "MLCC-100p-0603":    { status: "CLASS", spec: "100 pF 0603 C0G" },
  "MLCC-1u-0805":      { status: "CLASS", spec: "1 µF 0805 X7R" },
  "MLCC-100n-0402":    { status: "CLASS", spec: "100 nF 0402 X7R decoupling" },
  "MLCC-small":        { status: "CLASS", spec: "0402–0805 MLCC, value per schematic" },
  "CER-25W-AX":        { status: "CLASS", spec: "25 W axial ceramic pulse resistor" },
  "CER-2k2-10W-AX":    { status: "CLASS", spec: "2.2 kΩ 10 W wirewound axial" },
  "SQP-10R-25W":       { status: "CLASS", spec: "10 Ω 25 W wirewound pulse, axial" },
  "WW-470R-10W":       { status: "CLASS", spec: "470 Ω 10 W wirewound axial" },
  "R2512-47k-HV-AS":   { status: "CLASS", spec: "47 kΩ 2512 anti-surge HV, 2-series per position" },
  "R2512-10R-2W":      { status: "CLASS", spec: "10 Ω 2512 2 W" },
  "R2512-HV":          { status: "CLASS", spec: "2512 HV-rated resistor, value per schematic" },
  "R2512-2R0-1W-1%":   { status: "CLASS", spec: "2.0 Ω 1% 1 W 2512, resonant-CT burden" },
  "HV73-475k-1%":      { status: "CLASS", spec: "475 kΩ 1206 1% anti-surge HV divider" },
  "R0805-prec-0.1%":   { status: "CLASS", spec: "0.1% precision divider bottom" },
  "R1206-R31-1%-0.5W": { status: "CLASS", spec: "0.31 Ω 1% 0.5 W 1206 current sense" },
  "R1206-33R-1%":      { status: "CLASS", spec: "33 Ω 1206 1%" },
  "R1206-RG-0.5W":     { status: "CLASS", spec: "gate resistor 1206 0.5 W, value per schematic",
                         note: "2026-09-06: tried to resolve to a catalogue part and DELIBERATELY did not. The obvious 1206 thick-film (RC1206FR-074R7L, C137258) is 250 mW — half the specified rating, on a resistor that takes the gate-drive pulse. A generic 1206 is the wrong part here; the 0.5 W class needs a pulse-rated series (ERJ-P / RL-class) selected at RFQ. CLASS is the correct status, not an unfinished lookup." },
  "R0805-10k":         { status: "CLASS", spec: "10 kΩ 0805 gate-source" },
  "R0603-220":         { status: "CLASS", spec: "220 Ω 0603 LED segment" },
  "R-small":           { status: "CLASS", spec: "0402–0805 small-signal resistor, value per schematic" },
  "IND-10u-3A":        { status: "CLASS", spec: "10 µH 3 A shielded power inductor" },
  "IND-PFC-165u":      { status: "CLASS", spec: "165 µH PFC choke, 3× T79 26µ sendust, N=36 — custom wind" },
  "IND-TRIM-BIN4":     { status: "CLASS", spec: "resonant trim inductor, bin set 3.3/3.65/4.0/4.35 µH ±3%" },
  "DM-22u-SKU":        { status: "CLASS", spec: "22 µH sendust DM line choke, current-rated per SKU" },
  "CMC-3PH-2mH-SKU":   { status: "CUSTOM", spec: "3-phase 2 mH nanocrystalline CM choke, current-rated per SKU — no LCSC equivalent" },
  "XFMR-LLC-10K":      { status: "CUSTOM", spec: "LLC transformer 3× PQ50/50 PC95 7:7:7, Lm 63 µH ±7% — custom wind" },
  "XFMR-AUX-FLY-C":    { status: "CUSTOM", spec: "aux flyback ETD34, 110 W, 342–860 Vin — custom wind" },

  // SKU-scaled variants. The 30 kW part number was previously printed on every SKU, which read
  // as an undersized relay/fuse on the 60/120 kW drawings even though price and class notes
  // were already scaled. These are the classes the design actually calls for.
  "HF167F-120A-M":     { status: "REVIEW", spec: "120 A/line power relay w/ mirror contact — 60 kW (110 A line)" },
  "HF167F-250A-M":     { status: "REVIEW", spec: "250 A/line power relay or contactor w/ mirror contact — 120 kW (220 A line)" },
  "FUSE-gG-690V-63A":  { status: "CLASS", spec: "63 A gG 690 VAC — 30 kW (55 A line)" },
  "FUSE-gG-690V-125A": { status: "CLASS", spec: "125 A gG 690 VAC — 60 kW (110 A line)" },
  "FUSE-gG-690V-250A": { status: "CLASS", spec: "250 A gG 690 VAC — 120 kW (220 A line)" },
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
// from EasyEDA's own LCSC catalogue via component_search; none is from memory.
// Deliberately NOT resolved: anything whose CLASS *is* the specification — HV73 high-voltage
// dividers, PP film caps rated by voltage class, WW/CER power resistors, custom magnetics.
// Substituting a generic part there would silently drop a rating the design depends on.
export const LCSC_BY_VALUE = {
  "R-small|10k":        { lcsc: "C84376",  mpn: "RC0805FR-0710KL",   note: "10k 0805 1% 125mW" },
  "R0805-10k|10k":      { lcsc: "C84376",  mpn: "RC0805FR-0710KL",   note: "10k 0805 1% 125mW" },
  "R-small|1k":         { lcsc: "C95781",  mpn: "RC0805FR-071KL",    note: "1k 0805 1%" },
  "R0603-220|220":      { lcsc: "C107696", mpn: "RC0603FR-07220RL",  note: "220R 0603 1% 100mW" },
  "MLCC-small|100nF":   { lcsc: "C14663",  mpn: "CC0603KRX7R9BB104", note: "100nF 0603 X7R 50V (JLC Basic)" },
  "MLCC-small|1nF":     { lcsc: "C100040", mpn: "CC0603KRX7R9BB102", note: "1nF 0603 X7R" },
  "MLCC-small|220pF":   { lcsc: "C106210", mpn: "CC0603JRNPO9BN221", note: "220pF 0603 NP0 50V" },
  "MLCC-1u-0805|1uF":   { lcsc: "C28323",  mpn: "CL21B105KBFNNNE",   note: "1uF 0805 X7R 50V (JLC Basic)" },
  "MLCC-100p-0603|100pF": { lcsc: "C14665", mpn: "CC0603JRNPO9BN101", note: "100pF 0603 NP0 50V" },
  "R1206-33R-1%|10k":   { lcsc: "C132649", mpn: "RC1206FR-0710KL",   note: "10k 1206 1% 250mW" },
  "R1206-33R-1%|33":    { lcsc: "C137308", mpn: "RC1206FR-0733RL",   note: "33R 1206 1% 250mW" },
  "R-small|100":        { lcsc: "C105577", mpn: "RC0805FR-07100RL",  note: "100R 0805 1%" },
  "R-small|100k":       { lcsc: "C96346",  mpn: "RC0805FR-07100KL",  note: "100k 0805 1%" },
  "MLCC-small|10nF":    { lcsc: "C100042", mpn: "CC0603KRX7R9BB103", note: "10nF 0603 X7R 50V" },
  "MLCC-100n-0402|100nF": { lcsc: "C60474", mpn: "CC0402KRX7R7BB104", note: "100nF 0402 X7R 16V — used only on the 3.3 V rail (~5x derating)" },
};

// Resolve by family AND value where we have a real catalogue part, else fall back to the
// per-MPN map (which is where the class-specified parts correctly stay).
export const lcscForPart = (mpn, value) =>
  LCSC_BY_VALUE[`${mpn}|${value}`] ?? lcscFor(mpn);
