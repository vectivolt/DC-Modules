// parts-db.mjs — component database + name-pattern classifier for BOM generation (§42/§43/§49-21/22).
// price1k = INR at ~1000-module aggregate (RFQ-target, assumption A7 ±25%); breaks: 100 pc ×1.35,
// 5000 pc ×0.88 unless overridden. Every entry carries a second source (§49-22).
// SKU-dependent parts (relays, fuses, KOUT paralleling) resolved via skuOverrides.

export const DB = [
  // --- power semiconductors
  { m: /^Q[ABC]\d+[AB]$/, mpn: "B3M010C075Z", mfr: "BASiC", desc: "SiC MOSFET 750 V 10 mΩ TO-247-4", price1k: 330, alt: "SiChain 750V/10mΩ (RFQ)" },
  { m: /^Q\d+[HL]$/, mpn: "SG2M023120LJ", mfr: "SiChain", desc: "SiC MOSFET 1200 V 23 mΩ TO-247-4L", price1k: 390, alt: "BASiC B3M020120ZL" },
  { m: /^D[ABC]\d+[TB]$/, mpn: "SICJBS-1200-40", mfr: "SiChain", desc: "SiC JBS 1200 V 40 A TO-247-2 (exact p/n at RFQ)", price1k: 120, alt: "BASiC B3D040120H" },
  { m: /^D[ABC]\d+C$/, mpn: "SICJBS-1200-10", mfr: "SiChain", desc: "SiC JBS 1200 V 10 A TO-247-2 (RCD clamp)", price1k: 55, alt: "CR Micro 1200V/10A" },
  { m: /^D\d+[AB][1-4]$/, mpn: "SICJBS-1200-20", mfr: "SiChain", desc: "SiC JBS 1200 V 20 A TO-247-2 (secondary bridge)", price1k: 90, alt: "CR Micro 1200V/20A" },
  { m: /^QDISF$/, mpn: "SIC-1200-5A", mfr: "CR Micro", desc: "SiC FET 1200 V 5 A (bus discharge)", price1k: 120, alt: "BASiC small 1200V" },
  { m: /^QAUX$/, mpn: "SPP04N60", mfr: "CR Micro", desc: "650 V 4 A FET (aux flyback from MID half-bus, E20)", price1k: 28, alt: "any 650V/4A SJ" },
  { m: /^D\w*S[12]$/, mpn: "US1M", mfr: "Yageo/MDD", desc: "1 kV 1 A fast diode SMA (DESAT chain)", price1k: 1.2, alt: "M7/US1M any" },
  { m: /^D\w+P$/, mpn: "1N4148WS", mfr: "any", desc: "clamp diode SOD-323", price1k: 0.4, alt: "BAS316" },
  { m: /^DAUX(24|15)$/, mpn: "SS310", mfr: "MDD", desc: "100 V 3 A Schottky SMB", price1k: 2.2, alt: "SS36" },
  { m: /^QDIG[12]$/, mpn: "S8050", mfr: "CJ", desc: "NPN SOT-23 (display digit driver)", price1k: 0.4, alt: "MMBT2222" },
  // --- gate drive & isolation
  { m: /^U([ABC]\d+G|\d+[HL])$/, mpn: "NSI6611", mfr: "NOVOSENSE", desc: "iso gate driver 10 A, DESAT/Miller/UVLO, SOIC-16", price1k: 85, alt: "NSI6602B" },
  { m: /^PS(CAN|SH)$/, mpn: "B1505S-2WR2", mfr: "MORNSUN", desc: "iso 15→5 V 2 W module (CAN/shunt side)", price1k: 45, alt: "WRB1505S" },
  { m: /^PS\w+$/, mpn: "BIAS-SEC-SET", mfr: "custom (§18/E23)", desc: "gate-bias secondary set (+18/−4): winding share of multi-output bias transformer + rect/filter parts (production; QA01C module = proto fallback ₹95)", price1k: 24, alt: "MORNSUN QA01C (proto)" },
  { m: /^USHO$/, mpn: "NSI1200-DSWR", mfr: "NOVOSENSE", desc: "iso shunt amplifier SOIC-8", price1k: 70, alt: "AMC1200" },
  { m: /^UCAN$/, mpn: "NSI1042", mfr: "NOVOSENSE", desc: "iso CAN transceiver", price1k: 60, alt: "NSI1050" },
  // --- control
  { m: /^U(PFC|LLC)$/, mpn: "GD32G553RET6", mfr: "GigaDevice", desc: "MCU Cortex-M33 216 MHz LQFP100 (pkg TBC, A6)", price1k: 210, alt: "GD32G563" },
  { m: /^USR1$/, mpn: "74HC595", mfr: "any", desc: "shift register SOIC-16 (HMI segments)", price1k: 4, alt: "TPIC6C595" },
  { m: /^U(PA|LB)$/, mpn: "ULN2803A", mfr: "any", desc: "8-ch relay coil driver SOIC-18", price1k: 9, alt: "TBD62083" },
  { m: /^UAUX$/, mpn: "NCP1252-class", mfr: "onsemi/eq", desc: "flyback controller SOIC-8", price1k: 18, alt: "UC2843B" },
  { m: /^U3V3$/, mpn: "AMS1117-3.3", mfr: "AMS/eq", desc: "3.3 V LDO SOT-223", price1k: 6, alt: "SPX1117" },
  // --- magnetics (custom assemblies; costed builds from magnetics calc)
  { m: /^L[ABC]\d+$/, mpn: "IND-PFC-165u", mfr: "custom (docs/magnetics.md D1)", desc: "PFC choke 165 µH, 3× T79 26µ sendust, N=36", price1k: 1035, alt: "POCO/DMEGC equiv core" },
  { m: /^L\d+T$/, mpn: "IND-TRIM-4u3", mfr: "custom (D2)", desc: "resonant trim 4.3 µH ±5%", price1k: 85, alt: "air-core option" },
  { m: /^T\d+$/, mpn: "XFMR-LLC-10K", mfr: "custom (D3)", desc: "LLC section transformer 3× PQ50/50 PC95, 7:7:7", price1k: 680, alt: "PQ65 single-core variant" },
  { m: /^TAUX$/, mpn: "XFMR-AUX-FLY", mfr: "custom (D4)", desc: "aux flyback transformer EE19", price1k: 90, alt: "—" },
  { m: /^LDM[123]$/, mpn: "DM-22u-60A", mfr: "custom/POCO", desc: "DM line choke 22 µH sendust toroid (3rd EMI stage, E22)", price1k: 38, alt: "DMEGC eq" },
  { m: /^CMC[12]$/, mpn: "CMC-3PH-2mH", mfr: "custom/Hongfa mag", desc: "3-phase CM choke 2 mH nanocrystalline", price1k: 210, alt: "sendust CM" },
  { m: /^CT[ABC]\d+$/, mpn: "CT-60A-1:2500", mfr: "ZEMCT/eq", desc: "line CT 60 A class (E18)", price1k: 65, alt: "HCT series" },
  { m: /^CT\d+$/, mpn: "CT-RES-1:100", mfr: "custom", desc: "resonant CT (toroid, 1:100)", price1k: 55, alt: "—" },
  // --- capacitors
  { m: /^CD[TB]\d*\d$/, mpn: "ELH-470u450", mfr: "Aishi", desc: "470 µF 450 V snap-in 105 °C", price1k: 150, alt: "ChengX/Nichicon" },
  { m: /^CB[AB]\d$/, mpn: "ELH-470u450", mfr: "Aishi", desc: "470 µF 450 V snap-in (bank)", price1k: 150, alt: "ChengX" },
  { m: /^C\d+R\d$/, mpn: "PP-44n-1200", mfr: "Faratronic", desc: "46 nF 1200 V PP pulse film (resonant, rev D)", price1k: 68, alt: "Songtian pulse PP" },
  { m: /^C(F\d+|B[AB]F)$/, mpn: "PP-1u-900", mfr: "Faratronic", desc: "1 µF 900 V film (commutation/bank)", price1k: 55, alt: "Songtian" },
  { m: /^COF[12]$/, mpn: "PP-4u7-1100", mfr: "Faratronic", desc: "4.7 µF 1100 V film (output)", price1k: 110, alt: "—" },
  { m: /^CX\d+$/, mpn: "X2-2u2-310", mfr: "Songtian", desc: "X2 2.2 µF 310 VAC", price1k: 28, alt: "Faratronic" },
  { m: /^CY(O)?[123]?$/, mpn: "Y2-4n7-300", mfr: "Songtian", desc: "Y2 4.7 nF 300 VAC", price1k: 12, alt: "Faratronic" },
  { m: /^C\w+SN$/, mpn: "C1812-470p-1k", mfr: "any MLCC", desc: "470 pF 1 kV C0G 1812 (snubber)", price1k: 9, alt: "film 630V" },
  { m: /^C\w+C$/, mpn: "FILM-100n-250", mfr: "Faratronic", desc: "100 nF 250 V film (RCD clamp)", price1k: 18, alt: "MLCC 250V" },
  { m: /^CAUX(24|15)$/, mpn: "EL-220u-35", mfr: "Aishi", desc: "220 µF 35 V", price1k: 4, alt: "any" },
  { m: /^C3V3$/, mpn: "MLCC-10u-0805", mfr: "any", desc: "10 µF 0805", price1k: 1.2, alt: "any" },
  { m: /^C\w*(BL)$/, mpn: "MLCC-100p-0603", mfr: "any", desc: "100 pF 0603 (DESAT blank)", price1k: 0.4, alt: "any" },
  { m: /^C\w*B[12]$/, mpn: "MLCC-1u-0805", mfr: "any", desc: "1 µF 0805 (driver bias)", price1k: 0.8, alt: "any" },
  { m: /^C\w+(DF|F)$/, mpn: "MLCC-small", mfr: "any", desc: "filter MLCC 0603/0805", price1k: 0.5, alt: "any" },
  { m: /^C(PFC|LLC)D\d$/, mpn: "MLCC-100n-0402", mfr: "any", desc: "100 nF 0402 decoupling", price1k: 0.3, alt: "any" },
  // --- resistors
  { m: /^R(PRE[12]|DIS\d)$/, mpn: "CER-25W", mfr: "TE/local", desc: "25 W ceramic pulse resistor (precharge/discharge; pulse-rating VERIFY T-05)", price1k: 28, alt: "SQP25" },
  { m: /^RBAL[TB]\d*$/, mpn: "R2512-100k-3W", mfr: "any", desc: "100 kΩ 2512 (balance)", price1k: 6, alt: "2× 1206 series" },
  { m: /^R\w*SN$/, mpn: "R2512-10R", mfr: "any", desc: "10 Ω 2512 1 W (RC snubber)", price1k: 4, alt: "any" },
  { m: /^R\w+C$/, mpn: "R2512-470", mfr: "any", desc: "470 Ω 2512 (clamp bleed)", price1k: 4, alt: "any" },
  { m: /^RPRE[AB]$/, mpn: "CER-10R-10W", mfr: "local", desc: "10 Ω 10 W ceramic (bank pre-insertion)", price1k: 18, alt: "—" },
  { m: /^R\w+D[0-7]$/, mpn: "R1206-475k-1%", mfr: "UniOhm", desc: "475 kΩ 1206 1% (HV divider)", price1k: 0.9, alt: "any 1%" },
  { m: /^R\w+DL$/, mpn: "R0805-6k8-0.1%", mfr: "UniOhm", desc: "6.8 kΩ 0.1% (divider bottom)", price1k: 2.5, alt: "any 0.1%" },
  { m: /^R\w+(ON|OFF)$/, mpn: "R1206-RG", mfr: "any", desc: "gate resistor 1206 (4.7/2.2 Ω per E5/E6)", price1k: 1.5, alt: "any" },
  { m: /^R\w+GS$/, mpn: "R0805-10k", mfr: "any", desc: "10 kΩ gate-source", price1k: 0.5, alt: "any" },
  { m: /^R\w+(B|CT)$/, mpn: "R1206-33R-1%", mfr: "any", desc: "33 Ω CT burden 1%", price1k: 1.5, alt: "any" },
  { m: /^RSH?O$/, mpn: "SHUNT-MANG", mfr: "Isabellenhütte-eq/local", desc: "manganin shunt 50 mV class (SKU current)", price1k: 120, alt: "local manganin" },
  { m: /^RSEG\d$/, mpn: "R0603-220", mfr: "any", desc: "220 Ω segment", price1k: 0.3, alt: "any" },
  { m: /^R(SW|DIG|FT|QD\w*|AUXST|AUXCS|TERM|\w*RST|\w+P|\w+F|\w+L)\d*$/, mpn: "R-small", mfr: "any", desc: "small-signal resistor", price1k: 0.4, alt: "any" },
  // --- electromech / connectors / HMI
  { m: /^KPRE$/, mpn: "HF115F-2Z", mfr: "Hongfa", desc: "2-pole 8 A relay (precharge bypass)", price1k: 95, alt: "Omron G2R-2" },
  { m: /^KPRE[AB]$/, mpn: "HFE9-10A-1kV", mfr: "Hongfa", desc: "aux HV relay 10 A 1000 VDC (pre-insertion)", price1k: 190, alt: "—" },
  { m: /^K(SER|PARA|PARB|OUT)$/, mpn: "HFE82V-CLASS", mfr: "Hongfa", desc: "HV DC relay 1000 V (current class per SKU)", price1k: 420, alt: "GIGAVAC eq" },
  { m: /^MOV[123]$/, mpn: "S20K550", mfr: "TDK/Songtian", desc: "MOV 550 VAC 20 mm", price1k: 22, alt: "Songtian eq" },
  { m: /^F[123]$/, mpn: "FUSE-gG-690V", mfr: "local/Bussmann", desc: "gG fuse 690 VAC (rating per SKU)", price1k: 90, alt: "SIBA" },
  { m: /^DISP1$/, mpn: "LED-2DIG-0.56CC", mfr: "any", desc: "2-digit 7-seg 0.56\" common-cathode (HMI)", price1k: 18, alt: "any" },
  { m: /^SW[12]$/, mpn: "TACT-6x6", mfr: "any", desc: "tactile switch 6×6 (HMI)", price1k: 3, alt: "any" },
  { m: /^J(ACL\d|PE|PEB|DCP|DCN|OUTP|OUTN|QDIS)?$/, mpn: "STUD-M8", mfr: "local", desc: "M8 stud terminal", price1k: 28, alt: "M6 for signal PE" },
  { m: /^JIC[AB]$/, mpn: "PHD2.0-16", mfr: "JST/eq", desc: "16-way board-to-board harness header", price1k: 22, alt: "Molex" },
  { m: /^JCAN$/, mpn: "PH-4", mfr: "JST", desc: "CAN connector 4-way", price1k: 8, alt: "any" },
  { m: /^JFAN[12]$/, mpn: "PH-4-FAN", mfr: "JST", desc: "fan header 4-way", price1k: 6, alt: "any" },
  { m: /^J(TERM|T\w+)$/, mpn: "PH-2", mfr: "JST", desc: "2-way header (NTC/term)", price1k: 3, alt: "any" },
  { m: /^LCAN$/, mpn: "CMC-CAN-51uH", mfr: "any", desc: "CAN common-mode choke", price1k: 8, alt: "any" },
  { m: /^TVSCAN$/, mpn: "PESD1CAN", mfr: "Nexperia/eq", desc: "CAN TVS", price1k: 4, alt: "any" },
  { m: /^QDIS$/, mpn: "TAB-M4", mfr: "local", desc: "discharge FET heatsink tab stud", price1k: 6, alt: "—" },
];

// per-SKU overrides: name → { price1k, qtyMul, note }
export const skuOverrides = {
  "30kw": { "F1": { price1k: 90 }, "F2": { price1k: 90 }, "F3": { price1k: 90 }, KOUT: { price1k: 420 }, KSER: { price1k: 420 }, KPARA: { price1k: 420 }, KPARB: { price1k: 420 }, RSHO: { price1k: 120 } },
  "60kw": { "F1": { price1k: 210 }, "F2": { price1k: 210 }, "F3": { price1k: 210 }, KOUT: { price1k: 780 }, KSER: { price1k: 780 }, KPARA: { price1k: 780 }, KPARB: { price1k: 780 }, RSHO: { price1k: 180 } },
  "120kw": { "F1": { price1k: 480 }, "F2": { price1k: 480 }, "F3": { price1k: 480 }, KOUT: { price1k: 780, qtyMul: 2, note: "2× 200 A paralleled (E12/arch)" }, KSER: { price1k: 780, qtyMul: 2, note: "2× 200 A paralleled" }, KPARA: { price1k: 780, qtyMul: 2 }, KPARB: { price1k: 780, qtyMul: 2 }, RSHO: { price1k: 260 } },
};

// non-schematic (mechanical/assembly) lines per module — from thermal/DFM calcs; two-PCB split per E17.
export const biasCommon = { desc: 'BIAS-XFMR multi-secondary transformer + SN6505-class push-pull driver (one per board pair, E23)', price1k: 165 };
export const mechLines = {
  "30kw": [
    ["PCB-ACDC 6L 420×300", 1, 1200], ["PCB-DCDC 6L 460×320", 1, 1400],
    ["Heatsink extrusions (2, sandwich outer faces)", 1, 1500], ["Fans 120×38 PWM", 2, 280],
    ["Enclosure sheet metal + hardware", 1, 1000], ["Busbars/interconnect studs + harness (busbar-calc)", 1, 724],
    ["NTC sensor assemblies", 4, 18], ["TIM/insulators/fasteners", 1, 350],
    ["Assembly + calibration + EOL test", 1, 1900],
  ],
  "60kw": [
    ["PCB-ACDC 6L 460×420", 1, 1750], ["PCB-DCDC 6L 520×420", 1, 1950],
    ["Heatsink extrusions", 1, 2700], ["Fans 120×38 PWM", 2, 280],
    ["Enclosure sheet metal + hardware", 1, 1350], ["Busbars/interconnect + harness (busbar-calc)", 1, 1645],
    ["NTC sensor assemblies", 4, 18], ["TIM/insulators/fasteners", 1, 550],
    ["Assembly + calibration + EOL test", 1, 2600],
  ],
  "120kw": [
    ["PCB-ACDC 6L 560×600", 1, 3000], ["PCB-DCDC 6L 640×620", 1, 3550],
    ["Heatsink extrusions", 1, 5200], ["Fans 120×38 PWM", 4, 280],
    ["Enclosure sheet metal + hardware", 1, 1900], ["Busbars/interconnect + harness (busbar-calc)", 1, 4169],
    ["NTC sensor assemblies", 4, 18], ["TIM/insulators/fasteners", 1, 950],
    ["Assembly + calibration + EOL test", 1, 3900],
  ],
};
