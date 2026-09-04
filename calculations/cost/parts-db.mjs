// parts-db.mjs — component database + name-pattern classifier for BOM generation (§42/§43/§49-21/22).
// price1k = INR at ~1000-module aggregate (RFQ-target, assumption A7 ±25%); breaks: 100 pc ×1.35,
// 5000 pc ×0.88 unless overridden. Every entry carries a second source (§49-22).
// SKU-dependent parts (relays, fuses, KOUT paralleling, DM chokes) resolved via skuOverrides.
// rev C (2026-09-05): production-review fixes — X1-530/Y1-440 filter class (CB-1/MR-4), bank
// electrolytics in 2-series strings (CB-2/E29), 1100/1200 V films (HR-1/HR-8), line-rated precharge
// bypass relays (CB-8), mirror-contact HV relays (E30), aux redesign parts (CB-5/6/7: 1700 V switch,
// EF25 60 W transformer, startup/clamp/BR networks), iso voltage-sense set (E25/CB-3), safety-chain
// parts (CB-10), isolated discharge driver (CB-11), SWD headers (CB-13), Vienna phase films (CB-9),
// snubber re-rating (E28/HR-2/HR-3), pulse resistors on axial footprints (MR-1/HR-12), bias modules
// reverted to packaged p/n (HR-10 — custom E23 transformer deferred to cost ECO-1).
// Ordering matters: first matching pattern wins; keep specific patterns above the catch-alls.

export const DB = [
  // --- power semiconductors
  { m: /^Q[ABC]\d+[AB]$/, mpn: "B3M010C075Z", mfr: "BASiC", desc: "SiC MOSFET 750 V 10 mΩ TO-247-4", price1k: 330, alt: "SiChain 750V/10mΩ (RFQ)" },
  { m: /^Q\d+[HL]$/, mpn: "SG2M023120LJ", mfr: "SiChain", desc: "SiC MOSFET 1200 V 23 mΩ TO-247-4L", price1k: 390, alt: "BASiC B3M020120ZL" },
  { m: /^D[ABC]\d+[TB]$/, mpn: "SICJBS-1200-40", mfr: "SiChain", desc: "SiC JBS 1200 V 40 A TO-247-2 (exact p/n at RFQ)", price1k: 120, alt: "BASiC B3D040120H" },
  { m: /^D[ABC]\d+C$/, mpn: "SICJBS-1200-10", mfr: "SiChain", desc: "SiC JBS 1200 V 10 A TO-247-2 (RCD clamp)", price1k: 55, alt: "CR Micro 1200V/10A" },
  { m: /^D\d+[AB][1-4]$/, mpn: "SICJBS-1200-20", mfr: "SiChain", desc: "SiC JBS 1200 V 20 A TO-247-2 (secondary bridge)", price1k: 90, alt: "CR Micro 1200V/20A" },
  { m: /^QDISF$/, mpn: "SIC-1200-5A", mfr: "CR Micro", desc: "SiC FET 1200 V 5 A (bus discharge)", price1k: 120, alt: "BASiC small 1200V" },
  { m: /^QAUX$/, mpn: "SIC-1700-1R", mfr: "CR Micro/BASiC", desc: "SiC FET 1700 V ~1 Ω TO-220 (aux flyback, full-bus feed E26)", price1k: 160, alt: "G3R1700 class" },
  { m: /^DCLA$/, mpn: "FAST-1200-1A", mfr: "MDD/eq", desc: "1200 V 1 A fast diode SMB (aux RCD clamp)", price1k: 6, alt: "US1M ×2 series" },
  { m: /^D\w*S[12]$/, mpn: "US1M", mfr: "Yageo/MDD", desc: "1 kV 1 A fast diode SMA (DESAT chain)", price1k: 1.2, alt: "M7/US1M any" },
  { m: /^DAUX(24|15|VC)$/, mpn: "SS310", mfr: "MDD", desc: "100 V 3 A Schottky SMB (aux secondaries/self-supply)", price1k: 2.2, alt: "SS36" },
  { m: /^D\w+P$/, mpn: "1N4148WS", mfr: "any", desc: "clamp diode SOD-323 (to 3V3)", price1k: 0.4, alt: "BAS316" },
  { m: /^D\w+N$/, mpn: "1N4148WS", mfr: "any", desc: "clamp diode SOD-323 (from AGND — CB-15 bipolar front-end)", price1k: 0.4, alt: "BAS316" },
  { m: /^QDIG[12]$/, mpn: "S8050", mfr: "CJ", desc: "NPN SOT-23 (display digit driver)", price1k: 0.4, alt: "MMBT2222" },
  // --- gate drive, isolation & safety chain
  { m: /^U([ABC]\d+G|\d+[HL])$/, mpn: "NSI6611", mfr: "NOVOSENSE", desc: "iso gate driver 10 A, DESAT/Miller(CLAMP wired, CB-12)/UVLO, SOIC-16", price1k: 85, alt: "NSI6602B" },
  { m: /^PS(CAN|SH)$/, mpn: "B1505S-2WR2", mfr: "MORNSUN", desc: "iso 15→5 V 2 W module (CAN/output domain)", price1k: 45, alt: "WRB1505S" },
  { m: /^PS5\w+$/, mpn: "B1505S-2WR2", mfr: "MORNSUN", desc: "iso 15→5 V 2 W module (iso-sense floating bias, E25)", price1k: 45, alt: "WRB1505S" },
  { m: /^PSQD$/, mpn: "QA01C-15S18", mfr: "MORNSUN", desc: "iso 15→18 V module, DCN-referenced (discharge driver bias, CB-11)", price1k: 95, alt: "B1518S" },
  { m: /^PS\w+$/, mpn: "QA01C-15S18", mfr: "MORNSUN", desc: "iso gate-bias module +18/−4-configured (HR-10: packaged module; custom E23 transformer = cost ECO-1, C_io ≤10 pF spec D5)", price1k: 95, alt: "custom multi-secondary set (ECO-1, ₹24 share)" },
  { m: /^USHO$/, mpn: "NSI1200-DSWR", mfr: "NOVOSENSE", desc: "iso shunt amplifier SOIC-8 (differential OUTP/OUTN both routed, MR-6)", price1k: 70, alt: "AMC1200" },
  { m: /^UIVV[123]$/, mpn: "AMC1350-class", mfr: "TI/NOVOSENSE", desc: "iso voltage-sense amp ±5 V input (AC phase sense vs artificial star, E25)", price1k: 135, alt: "NSI1300 class" },
  { m: /^UIV\w+$/, mpn: "AMC1311-class", mfr: "TI/NOVOSENSE", desc: "iso voltage-sense amp 0–2 V input (bus/bank/output senses, E25/CB-3)", price1k: 115, alt: "NSI1311 class" },
  { m: /^UCAN$/, mpn: "NSI1042", mfr: "NOVOSENSE", desc: "iso CAN transceiver", price1k: 60, alt: "NSI1050" },
  { m: /^UQD$/, mpn: "TLP152-class", mfr: "Toshiba/eq", desc: "opto gate driver (isolated discharge control, default-OFF — CB-11)", price1k: 42, alt: "1ED31xx lite" },
  { m: /^USUP[AB]$/, mpn: "TPS3430-class", mfr: "TI/eq", desc: "external windowed watchdog (protection rows 24/30 — CB-10)", price1k: 35, alt: "MAX6753" },
  { m: /^UAND[AB]$/, mpn: "74HC11", mfr: "any", desc: "triple 3-input AND (gate-enable wired-AND, E27)", price1k: 8, alt: "74LVC1G11 ×1" },
  { m: /^UAVB$/, mpn: "TLV9061-class", mfr: "TI/3PEAK", desc: "rail-to-rail op-amp (AVMID buffer, E31)", price1k: 12, alt: "LMV321" },
  // --- control
  { m: /^U(PFC|LLC)$/, mpn: "GD32G553RET6", mfr: "GigaDevice", desc: "MCU Cortex-M33 216 MHz LQFP100 (pkg/pins TBC, A6; BOOT0 strap + SWD fitted, CB-13)", price1k: 210, alt: "GD32G563" },
  { m: /^USR1$/, mpn: "74HC595", mfr: "any", desc: "shift register SOIC-16 (HMI segments)", price1k: 4, alt: "TPIC6C595" },
  { m: /^U(PA|LB)$/, mpn: "ULN2803A", mfr: "any", desc: "8-ch relay coil driver SOIC-18 (unused inputs grounded, MR-8)", price1k: 9, alt: "TBD62083" },
  { m: /^UAUX$/, mpn: "UCC28C43-class", mfr: "TI/onsemi", desc: "current-mode flyback controller SOIC-8 (full application wired — CB-5; final IC O-3)", price1k: 22, alt: "NCP1252" },
  { m: /^U3V3$/, mpn: "AMS1117-3.3", mfr: "AMS/eq", desc: "3.3 V LDO SOT-223", price1k: 6, alt: "SPX1117" },
  // --- magnetics (custom assemblies; costed builds from magnetics calc)
  { m: /^L[ABC]\d+$/, mpn: "IND-PFC-165u", mfr: "custom (docs/magnetics.md D1)", desc: "PFC choke 165 µH, 3× T79 26µ sendust, N=36", price1k: 1035, alt: "POCO/DMEGC equiv core" },
  { m: /^L\d+T$/, mpn: "IND-TRIM-4u3", mfr: "custom (D2)", desc: "resonant trim 4.3 µH ±5%", price1k: 85, alt: "air-core option" },
  { m: /^T\d+$/, mpn: "XFMR-LLC-10K", mfr: "custom (D3)", desc: "LLC section transformer 3× PQ50/50 PC95, 7:7:7", price1k: 680, alt: "PQ65 single-core variant" },
  { m: /^TAUX$/, mpn: "XFMR-AUX-FLY-B", mfr: "custom (D4 rev B)", desc: "aux flyback transformer EF25, 60 W, 342–860 V input (E26)", price1k: 140, alt: "—" },
  { m: /^LDM[123]$/, mpn: "DM-22u-SKU", mfr: "custom/POCO (D6)", desc: "DM line choke 22 µH sendust toroid, line-current rated per SKU (HR-9, drawing D6)", price1k: 120, alt: "DMEGC eq" },
  { m: /^CMC[12]$/, mpn: "CMC-3PH-2mH", mfr: "custom/Hongfa mag", desc: "3-phase CM choke 2 mH nanocrystalline", price1k: 210, alt: "sendust CM" },
  { m: /^CT[ABC]\d+$/, mpn: "CT-60A-1:2500", mfr: "ZEMCT/eq", desc: "line CT 60 A class (E18)", price1k: 65, alt: "HCT series" },
  { m: /^CT\d+$/, mpn: "CT-RES-1:100", mfr: "custom", desc: "resonant CT (toroid, 1:100)", price1k: 55, alt: "—" },
  // --- capacitors
  { m: /^CD[TB]\d*\d$/, mpn: "ELH-470u450", mfr: "Aishi", desc: "470 µF 450 V snap-in 105 °C (split bus: 415 V max per half)", price1k: 150, alt: "ChengX/Nichicon" },
  { m: /^CB[AB]\d+[TB]$/, mpn: "ELH-470u450", mfr: "Aishi", desc: "470 µF 450 V snap-in — 2-series string, 900 V vs ≤525 V bank (E29/CB-2)", price1k: 150, alt: "ChengX" },
  { m: /^C\d+R\d$/, mpn: "PP-44n-1200", mfr: "Faratronic", desc: "46 nF 1200 V PP pulse film (resonant, rev D)", price1k: 68, alt: "Songtian pulse PP" },
  { m: /^C\w+F[PN]$/, mpn: "PP-1u-600", mfr: "Faratronic", desc: "1 µF 600 V film (Vienna per-phase commutation, CB-9)", price1k: 32, alt: "Songtian" },
  { m: /^C(F\d+|B[AB]F)$/, mpn: "PP-1u-1100", mfr: "Faratronic", desc: "1 µF 1100 V film (bus commutation/bank — HR-1: 830 V ≤ 76%)", price1k: 68, alt: "Songtian" },
  { m: /^COF[12]$/, mpn: "PP-4u7-1200", mfr: "Faratronic", desc: "4.7 µF 1200 V film (output — HR-8: 1000 V = 83%)", price1k: 125, alt: "—" },
  { m: /^CX\d+$/, mpn: "X1-2u2-530", mfr: "Faratronic/Songtian", desc: "X1 2.2 µF 530 VAC (delta across 475 VAC line-line — CB-1)", price1k: 62, alt: "Vishay 3386 X1" },
  { m: /^(CY(O)?[123]?|CPET)$/, mpn: "Y1-4n7-440", mfr: "Songtian/Faratronic", desc: "Y1 4.7 nF 440 VAC (L-PE / output-PE / DGND-PE — MR-4; DC use verify O-7)", price1k: 16, alt: "TDK CD series" },
  { m: /^C\w+SN$/, mpn: "C1812-100p-1k", mfr: "any MLCC", desc: "100 pF 1 kV C0G 1812 (Vienna snubber, E28 re-size: CV²f = 0.86 W)", price1k: 7, alt: "film 630V" },
  { m: /^CCLA$/, mpn: "PP-10n-1200", mfr: "Faratronic", desc: "10 nF 1200 V film (aux RCD clamp)", price1k: 9, alt: "MLCC 1kV ×2" },
  { m: /^C\w+C$/, mpn: "FILM-100n-250", mfr: "Faratronic", desc: "100 nF 250 V film (Vienna RCD clamp)", price1k: 18, alt: "MLCC 250V" },
  { m: /^CAUX(24|15)$/, mpn: "EL-220u-35", mfr: "Aishi", desc: "220 µF 35 V", price1k: 4, alt: "any" },
  { m: /^CVCC$/, mpn: "EL-47u-35", mfr: "Aishi", desc: "47 µF 35 V (controller VCC reservoir — CB-5)", price1k: 3, alt: "any" },
  { m: /^C3V3$/, mpn: "MLCC-10u-0805", mfr: "any", desc: "10 µF 0805", price1k: 1.2, alt: "any" },
  { m: /^C\w*(BL)$/, mpn: "MLCC-100p-0603", mfr: "any", desc: "100 pF 0603 (DESAT blank)", price1k: 0.4, alt: "any" },
  { m: /^C\w*B[12]$/, mpn: "MLCC-1u-0805", mfr: "any", desc: "1 µF 0805 (driver bias)", price1k: 0.8, alt: "any" },
  { m: /^C(PFC|LLC)D\d$/, mpn: "MLCC-100n-0402", mfr: "any", desc: "100 nF 0402 decoupling", price1k: 0.3, alt: "any" },
  { m: /^C[A-Z0-9]+$/, mpn: "MLCC-small", mfr: "any", desc: "filter/decoupling MLCC 0402–0805", price1k: 0.5, alt: "any" },
  // --- resistors (power/pulse/precision first, catch-all last)
  { m: /^R(PRE[12]|DIS\d)$/, mpn: "CER-25W-AX", mfr: "TE/local", desc: "25 W ceramic pulse resistor, axial (precharge 33 Ω / discharge 160 Ω; MR-1 footprint fixed; pulse VERIFY T-05)", price1k: 28, alt: "SQP25" },
  { m: /^RPRE[AB]$/, mpn: "SQP-10R-25W", mfr: "local", desc: "10 Ω 25 W wirewound pulse, axial (bank pre-insertion — HR-12: 94 J single-fault case)", price1k: 24, alt: "—" },
  { m: /^(RBAL[TB]\w*|RNS[123])$/, mpn: "R2512-100k-3W", mfr: "any", desc: "100 kΩ 2512 3 W (balance / artificial star)", price1k: 6, alt: "2× 1206 series" },
  { m: /^R\w*SN$/, mpn: "R2512-10R-2W", mfr: "any", desc: "10 Ω 2512 2 W (Vienna snubber — E28: 0.86 W actual)", price1k: 6, alt: "any" },
  { m: /^R(AUXST[12]|BR1[AB]|CLA[12])$/, mpn: "R2512-HV", mfr: "UniOhm", desc: "2512 HV-rated (aux startup/brown-in/clamp — 2-series per 860 V)", price1k: 2.5, alt: "any 500V-rated" },
  { m: /^R\w+C$/, mpn: "WW-470R-5W", mfr: "local/TE", desc: "470 Ω 5 W wirewound axial (Vienna clamp bleeder — HR-3: 4.3 W worst-case)", price1k: 14, alt: "SQP5" },
  { m: /^R\w+D[0-7]$/, mpn: "HV73-475k-1%", mfr: "KOA/UniOhm", desc: "475 kΩ 1206 1% anti-surge (HV divider — MR-3)", price1k: 1.4, alt: "any anti-surge 1%" },
  { m: /^R\w+DL$/, mpn: "R0805-prec-0.1%", mfr: "UniOhm", desc: "divider bottom 0.1% (6.8 k unipolar / 11.5 k AC)", price1k: 2.5, alt: "any 0.1%" },
  { m: /^R\w+(ON|OFF)$/, mpn: "R1206-RG", mfr: "any", desc: "gate resistor 1206 (4.7/2.2 Ω per E5/E6)", price1k: 1.5, alt: "any" },
  { m: /^R\w+GS$/, mpn: "R0805-10k", mfr: "any", desc: "10 kΩ gate-source", price1k: 0.5, alt: "any" },
  { m: /^R\w+(B|CT)$/, mpn: "R1206-33R-1%", mfr: "any", desc: "33 Ω CT burden 1%", price1k: 1.5, alt: "any" },
  { m: /^RSH?O$/, mpn: "SHUNT-MANG", mfr: "Isabellenhütte-eq/local", desc: "manganin shunt 50 mV class (SKU current)", price1k: 120, alt: "local manganin" },
  { m: /^RSEG\d$/, mpn: "R0603-220", mfr: "any", desc: "220 Ω segment", price1k: 0.3, alt: "any" },
  { m: /^R[A-Z0-9]+$/, mpn: "R-small", mfr: "any", desc: "small-signal resistor 0402–0805 (pulls/filters/feedback)", price1k: 0.4, alt: "any" },
  // --- ferrites
  { m: /^FB\w+$/, mpn: "FB-600R-0805", mfr: "any", desc: "ferrite bead 600 Ω@100 MHz (VDDA feed — MR-7)", price1k: 0.8, alt: "any" },
  // --- electromech / connectors / HMI / protection
  { m: /^KPRE[12]$/, mpn: "HF167F-80A-M", mfr: "Hongfa", desc: "power relay ≥80 A/line w/ mirror contact (precharge bypass carries full line current — CB-8; SKU class via override)", price1k: 260, alt: "TE T9G / contactor option" },
  { m: /^KPRE[AB]$/, mpn: "HFE9-10A-1kV-M", mfr: "Hongfa", desc: "aux HV relay 10 A 1000 VDC w/ mirror contact (pre-insertion)", price1k: 210, alt: "—" },
  { m: /^K(SER|PARA|PARB|OUT)$/, mpn: "HFE82V-M-CLASS", mfr: "Hongfa", desc: "HV DC relay 1000 V w/ mirror contact (E30 readback; current class per SKU)", price1k: 460, alt: "GIGAVAC eq" },
  { m: /^MOVP?[123]$/, mpn: "S20K550", mfr: "TDK/Songtian", desc: "MOV 550 VAC 20 mm (Δ line-line + series w/ GDT to PE)", price1k: 22, alt: "Songtian eq" },
  { m: /^GDT[123]$/, mpn: "GDT-3k5-20kA", mfr: "Bourns/eq", desc: "gas discharge tube 3.5 kV (L-PE surge path, HR-7)", price1k: 18, alt: "Littelfuse CG3" },
  { m: /^F[123]$/, mpn: "FUSE-gG-690V", mfr: "local/Bussmann", desc: "gG fuse 690 VAC (rating per SKU)", price1k: 90, alt: "SIBA" },
  { m: /^DISP1$/, mpn: "LED-2DIG-0.56CC", mfr: "any", desc: "2-digit 7-seg 0.56\" common-cathode (HMI)", price1k: 18, alt: "any" },
  { m: /^SW[12]$/, mpn: "TACT-6x6", mfr: "any", desc: "tactile switch 6×6 (HMI; pinout pairing VERIFY at BOM freeze, MR-10)", price1k: 3, alt: "any" },
  { m: /^JSWD\w+$/, mpn: "HDR-1x5-2.54", mfr: "any", desc: "SWD/boot header (EOL programming — CB-13; LV-only test state §45)", price1k: 8, alt: "TC2030 pads" },
  { m: /^J(ACL\d|PE|PEB|DCP|DCN|OUTP|OUTN|QDIS)?$/, mpn: "STUD-M8", mfr: "local", desc: "M8 stud terminal", price1k: 28, alt: "M6 for signal PE" },
  { m: /^JIC[AB]$/, mpn: "PHD2.0-16", mfr: "JST/eq", desc: "16-way board-to-board harness header (link crossover in DC-DC net map — CB-14)", price1k: 22, alt: "Molex" },
  { m: /^JCAN$/, mpn: "PH-4", mfr: "JST", desc: "CAN connector 4-way", price1k: 8, alt: "any" },
  { m: /^JFAN[12]$/, mpn: "PH-4-FAN", mfr: "JST", desc: "fan header 4-way (fan p/n must accept 3.3 V PWM — MR-9)", price1k: 6, alt: "any" },
  { m: /^J(TERM|T\w+)$/, mpn: "PH-2", mfr: "JST", desc: "2-way header (NTC/term)", price1k: 3, alt: "any" },
  { m: /^LCAN$/, mpn: "CMC-CAN-51uH", mfr: "any", desc: "CAN common-mode choke", price1k: 8, alt: "any" },
  { m: /^TVSCAN$/, mpn: "PESD1CAN", mfr: "Nexperia/eq", desc: "CAN TVS", price1k: 4, alt: "any" },
  { m: /^QDIS$/, mpn: "TAB-M4", mfr: "local", desc: "discharge FET heatsink tab stud", price1k: 6, alt: "—" },
];

// per-SKU overrides: name → { price1k, qtyMul, note }
export const skuOverrides = {
  "30kw": {
    "F1": { price1k: 90 }, "F2": { price1k: 90 }, "F3": { price1k: 90 },
    KOUT: { price1k: 460 }, KSER: { price1k: 460 }, KPARA: { price1k: 460 }, KPARB: { price1k: 460 },
    KPRE1: { price1k: 260, note: "80 A class (55 A line)" }, KPRE2: { price1k: 260 },
    LDM1: { price1k: 120, note: "D6 60 A winding" }, LDM2: { price1k: 120 }, LDM3: { price1k: 120 },
    RSHO: { price1k: 120 },
  },
  "60kw": {
    "F1": { price1k: 210 }, "F2": { price1k: 210 }, "F3": { price1k: 210 },
    KOUT: { price1k: 820 }, KSER: { price1k: 820 }, KPARA: { price1k: 820 }, KPARB: { price1k: 820 },
    KPRE1: { price1k: 340, note: "120 A class (110 A line)" }, KPRE2: { price1k: 340 },
    LDM1: { price1k: 240, note: "D6 120 A winding" }, LDM2: { price1k: 240 }, LDM3: { price1k: 240 },
    RSHO: { price1k: 180 },
  },
  "120kw": {
    "F1": { price1k: 480 }, "F2": { price1k: 480 }, "F3": { price1k: 480 },
    KOUT: { price1k: 820, qtyMul: 2, note: "2× 200 A paralleled (E12/arch)" }, KSER: { price1k: 820, qtyMul: 2, note: "2× 200 A paralleled" },
    KPARA: { price1k: 820, qtyMul: 2 }, KPARB: { price1k: 820, qtyMul: 2 },
    KPRE1: { price1k: 520, note: "250 A class (220 A line)" }, KPRE2: { price1k: 520 },
    LDM1: { price1k: 480, note: "D6 240 A winding" }, LDM2: { price1k: 480 }, LDM3: { price1k: 480 },
    RSHO: { price1k: 260 },
  },
};

// E23 custom bias transformer: DEFERRED to cost ECO-1 (HR-10 — schematic ships packaged modules).
// Kept at 0 so the roll-up reflects the buildable design; restore ₹165 + module deltas when ECO-1 runs.
export const biasCommon = { desc: 'BIAS-XFMR multi-secondary set (E23) — deferred to ECO-1, modules fitted instead (HR-10)', price1k: 0 };
export const mechLines = {
  "30kw": [
    ["PCB-ACDC 6L 420×300", 1, 1200], ["PCB-DCDC 6L 460×320", 1, 1400],
    ["Heatsink extrusions (2, sandwich outer faces)", 1, 1500], ["Fans 120×38 PWM (3.3 V-PWM-compatible p/n)", 2, 280],
    ["Enclosure sheet metal + hardware", 1, 1000], ["Busbars/interconnect studs + harness (busbar-calc)", 1, 724],
    ["NTC sensor assemblies (insulated tip spec, E25)", 4, 18], ["TIM/insulators/fasteners", 1, 350],
    ["Assembly + calibration + EOL test", 1, 1900],
  ],
  "60kw": [
    ["PCB-ACDC 6L 460×420", 1, 1750], ["PCB-DCDC 6L 520×420", 1, 1950],
    ["Heatsink extrusions", 1, 2700], ["Fans 120×38 PWM (3.3 V-PWM-compatible p/n)", 2, 280],
    ["Enclosure sheet metal + hardware", 1, 1350], ["Busbars/interconnect + harness (busbar-calc)", 1, 1645],
    ["NTC sensor assemblies (insulated tip spec, E25)", 4, 18], ["TIM/insulators/fasteners", 1, 550],
    ["Assembly + calibration + EOL test", 1, 2600],
  ],
  "120kw": [
    ["PCB-ACDC 6L 560×600", 1, 3000], ["PCB-DCDC 6L 640×620", 1, 3550],
    ["Heatsink extrusions", 1, 5200], ["Fans 120×38 PWM (3.3 V-PWM-compatible p/n)", 4, 280],
    ["Enclosure sheet metal + hardware", 1, 1900], ["Busbars/interconnect + harness (busbar-calc)", 1, 4169],
    ["NTC sensor assemblies (insulated tip spec, E25)", 4, 18], ["TIM/insulators/fasteners", 1, 950],
    ["Assembly + calibration + EOL test", 1, 3900],
  ],
};
