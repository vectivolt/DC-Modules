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
// rev D (2026-09-05): R2 review closure (docs/design-review-production-r2.md) — resonant burden
// 2 Ω (CB-16), Cr mpn 46 nF + binned trim (CB-22), buck 3V3 (CB-17/18), 400 V aux rectifiers
// (CB-19), 110 W aux (CB-20/E26 rev C), NCP1252B65 primary (MR-13), VET6 MCU suffix (MR-12),
// reinforced iso-5V modules (HR-16), 6-pin WD (HR-13), 47 k 2-series HV balance/star (HR-20),
// Micro-Fit harness (MR-14), rail TVS (MR-17), 10 W clamp bleeder (MR-19), bank-bleed parts
// (HR-15), per-SKU CMC + pulse-resistor overrides (HR-18/HR-14).
// Ordering matters: first matching pattern wins; keep specific patterns above the catch-alls.

// The buildable/deliverable single-board set. 120 kW is a CABINET (4× 30 kW / 2× 60 kW — product
// structure + E36): its single-board pair cannot exist since the card split (cardMap() correctly
// refuses 4 lanes — AIN needs 17 of 13), so every pipeline consumer iterates THIS list and the
// 120 kW product cost is a 4×-module roll-up in bom-gen.
export const BUILDABLE_SKUS = ["30kw", "60kw"];

export const DB = [
  // --- power semiconductors
  { m: /^Q[ABC]\d+[AB]$/, mpn: "B3M010C075Z", mfr: "BASiC", desc: "SiC MOSFET 750 V 10 mΩ TO-247-4", price1k: 330, alt: "SiChain 750V/10mΩ (RFQ)" },
  { m: /^Q\d+[HL]$/, mpn: "SG2M023120LJ", mfr: "SiChain", desc: "SiC MOSFET 1200 V 23 mΩ TO-247-4L", price1k: 390, alt: "BASiC B3M020120ZL" },
  { m: /^D[ABC]\d+[TB]$/, mpn: "SICJBS-1200-40", mfr: "SiChain", desc: "SiC JBS 1200 V 40 A TO-247-2 (exact p/n at RFQ)", price1k: 120, alt: "BASiC B3D040120H" },
  { m: /^D[ABC]\d+C$/, mpn: "SICJBS-1200-10", mfr: "SiChain", desc: "SiC JBS 1200 V 10 A TO-247-2 (RCD clamp)", price1k: 55, alt: "CR Micro 1200V/10A" },
  { m: /^D\d+[AB][1-4]$/, mpn: "SICJBS-1200-20", mfr: "SiChain", desc: "SiC JBS 1200 V 20 A TO-247-2 (secondary bridge)", price1k: 90, alt: "CR Micro 1200V/20A" },
  { m: /^QDIS[FAB]$/, mpn: "SIC-1200-5A", mfr: "CR Micro", desc: "SiC FET 1200 V 5 A (bus discharge QDISF / bank bleeders QDISA-B, HR-15)", price1k: 120, alt: "BASiC small 1200V" },
  { m: /^QAUX$/, mpn: "SIC-1700-1R", mfr: "CR Micro/BASiC", desc: "SiC FET 1700 V ~1 Ω (aux flyback, full-bus E26 rev C; TO-247 likely package — MR-23, footprint placeholder §40)", price1k: 160, alt: "G3R1700 class" },
  { m: /^DCLA$/, mpn: "FAST-1200-1A", mfr: "MDD/eq", desc: "1200 V 1 A fast diode SMB (aux RCD clamp)", price1k: 6, alt: "US1M ×2 series" },
  { m: /^D\w*S[12]$/, mpn: "US1M", mfr: "Yageo/MDD", desc: "1 kV 1 A fast diode SMA (DESAT chain)", price1k: 1.2, alt: "M7/US1M any" },
  { m: /^DAUX24$/, mpn: "UF-400V-3A", mfr: "onsemi/MDD (MURS340 class)", desc: "400 V 3 A ultrafast, SMC pad (aux 24 V rectifier — CB-19: PIV ≈ 176 V + leakage ring; 100 V Schottky avalanched)", price1k: 5, alt: "ES3 series 400 V" },
  { m: /^DAUX(15|VC)$/, mpn: "US2G", mfr: "MDD/Yageo", desc: "400 V 2 A ultrafast SMB (aux 15 V / self-supply rectifiers — CB-19: PIV ≈ 157 V + ring)", price1k: 3, alt: "MURS240" },
  { m: /^DTVS24$/, mpn: "SMBJ26A", mfr: "any", desc: "TVS 26 V uni SMB (V24 rail clamp — MR-17 FB-open fault)", price1k: 3, alt: "any" },
  { m: /^DTVS15$/, mpn: "SMBJ16A", mfr: "any", desc: "TVS 16 V uni SMB (V15 rail clamp — MR-17)", price1k: 3, alt: "any" },
  { m: /^D\w+P$/, mpn: "1N4148WS", mfr: "any", desc: "clamp diode SOD-323 (to 3V3)", price1k: 0.4, alt: "BAS316" },
  { m: /^D\w+N$/, mpn: "1N4148WS", mfr: "any", desc: "clamp diode SOD-323 (from AGND — CB-15 bipolar front-end)", price1k: 0.4, alt: "BAS316" },
  { m: /^QDIG[12]$/, mpn: "S8050", mfr: "CJ", desc: "NPN SOT-23 (display digit driver)", price1k: 0.4, alt: "MMBT2222" },
  // --- gate drive, isolation & safety chain
  { m: /^U([ABC]\d+G|\d+[HL])$/, mpn: "NSI6611", mfr: "NOVOSENSE", desc: "iso gate driver 10 A, DESAT/Miller(CLAMP wired, CB-12)/UVLO, SOIC-16", price1k: 85, alt: "NSI6602B" },
  { m: /^PS(CAN|SH)$/, mpn: "ISO5V-RFC-6K", mfr: "MORNSUN QA/URB-grade", desc: "iso 15→5 V ≥1 W REINFORCED-rated module ≥5 kVrms test (HR-16: this module IS part of the mains/output→SELV barrier — B1505S 1.5 kV functional grade rejected; certificate class = §K gate)", price1k: 95, p10k: 65, alt: "RECOM RxxP-R / certified eq" },
  // MUST precede the /^PS5\w+$/ rule below. In "PS5AC"/"PS5BUS" the 5 means 5 VOLTS; in "PS5H"
  // the 5 is the LLC LEG INDEX. The 5 V sense rule was swallowing leg 5's two gate-bias modules,
  // so on 60 kW and 120 kW the leg-5 SiC gate drivers were specified with a 5 V isolated SENSE
  // module instead of the +18/-4 gate-bias module -- a different part, a different symbol, and a
  // gate that cannot turn on. Legs 1-4 and 6-12 were unaffected, which is why it hid: it needed
  // a sheet with a leg 5 on it. Found by proving the replicated cells identical and diffing the
  // one that was not.
  { m: /^PS\d+[HL]$/, overrides: ["ISO5V-RFC-6K"], mpn: "QA01C", mfr: "MORNSUN", desc: "iso gate-bias module +18/−4-configured (E23 rev B: modules PERMANENT — at 10k modules/yr (~90k+ pcs aggregated) module pricing ≤₹55 makes the custom-transformer ECO-1 net ≈ ₹0 with added EMC/mfg risk → ECO-1 RETIRED; O-11: drawn P18/COM/N4 dual-rail vs single-out suffix — the −4 V zener-split or a true dual-rail p/n MUST be resolved at §K, E5/E6 off-bias depends on it)", price1k: 95, p10k: 55, alt: "domestic iso-module eq (2nd source at RFQ)" },
  { m: /^PS5\w+$/, mpn: "ISO5V-RFC-6K", mfr: "MORNSUN QA/URB-grade", desc: "iso 15→5 V reinforced-rated (iso-sense floating bias, E25/HR-16 — same barrier argument per domain: AC star / DCN / BKAN / BKBN)", price1k: 95, p10k: 65, alt: "RECOM RxxP-R / certified eq" },
  { m: /^PSQD\w*$/, mpn: "QA01C", mfr: "MORNSUN", desc: "iso 15→18 V module ≥6 kVDC (bus-discharge driver bias, CB-11; insulation cert class §K)", price1k: 95, p10k: 60, alt: "B1518S-3WR3HD" },
  { m: /^PS\w+$/, mpn: "QA01C", mfr: "MORNSUN", desc: "iso gate-bias module +18/−4-configured (E23 rev B: modules PERMANENT — at 10k modules/yr (~90k+ pcs aggregated) module pricing ≤₹55 makes the custom-transformer ECO-1 net ≈ ₹0 with added EMC/mfg risk → ECO-1 RETIRED; O-11: drawn P18/COM/N4 dual-rail vs single-out suffix — the −4 V zener-split or a true dual-rail p/n MUST be resolved at §K, E5/E6 off-bias depends on it)", price1k: 95, p10k: 55, alt: "domestic iso-module eq (2nd source at RFQ)" },
  { m: /^USHO$/, mpn: "NSI1200-DSWR", mfr: "NOVOSENSE", desc: "iso shunt amplifier SOIC-8 (differential OUTP/OUTN both routed, MR-6)", price1k: 70, alt: "AMC1200" },
  { m: /^UIVV[123]$/, mpn: "AMC1350-class", mfr: "TI/NOVOSENSE", desc: "iso voltage-sense amp ±5 V input (AC phase sense vs artificial star, E25)", price1k: 135, alt: "NSI1300 class" },
  { m: /^UIV\w+$/, mpn: "AMC1311-class", mfr: "TI/NOVOSENSE", desc: "iso voltage-sense amp 0–2 V input (bus/bank/output senses, E25/CB-3)", price1k: 115, alt: "NSI1311 class" },
  { m: /^UCAN$/, mpn: "NSI1042", mfr: "NOVOSENSE", desc: "iso CAN transceiver", price1k: 60, alt: "NSI1050" },
  { m: /^UQD$/, mpn: "TLP152-class", mfr: "Toshiba/eq", desc: "opto gate driver (isolated bus-discharge control, default-OFF — CB-11)", price1k: 42, alt: "1ED31xx lite" },
  { m: /^UPV[AB]$/, mpn: "VOM1271T", mfr: "Vishay/eq", desc: "photovoltaic MOSFET driver w/ integrated turn-off (bank bleeders — ECO-2a/E33 rev B: no floating supply needed, ms-class turn-on is the point)", price1k: 35, p10k: 28, alt: "TLP3906" },
  { m: /^USUP(CARD|[AB])$/, mpn: "TPS3430-class", mfr: "TI/eq", desc: "external windowed watchdog SOT-23-6: VDD/GND/WDI/WDO/SET straps (HR-13 — symbol now carries supply + window pins; strap values per datasheet at A6/§K)", price1k: 35, alt: "MAX6753" },
  { m: /^UAND(CARD|[AB])$/, mpn: "74HC11", mfr: "any", desc: "triple 3-input AND (gate-enable wired-AND, E27)", price1k: 8, alt: "74LVC1G11 ×1" },
  { m: /^UAVB$/, mpn: "TLV9061-class", mfr: "TI/3PEAK", desc: "rail-to-rail op-amp (AVMID buffer, E31)", price1k: 12, alt: "LMV321" },
  // --- control (card-split 2026-09-08: UCARD/USUPCARD/UANDCARD/UBKCARD/LBKCARD live on the
  //     control card — the audit found the old per-board regexes silently dropped ALL of them,
  //     the MCU included, from the BOM after the split)
  { m: /^U(PFC|LLC|CARD)$/, mpn: "GD32G553VET6", mfr: "GigaDevice", desc: "MCU Cortex-M33 216 MHz LQFP100 (MR-12: V-suffix = 100-pin — the earlier RET6 was the 64-pin part; full pin map regenerates at A6)", price1k: 210, alt: "GD32G563" },
  { m: /^USR1$/, mpn: "74HC595", mfr: "any", desc: "shift register SOIC-16 (HMI segments)", price1k: 4, alt: "TPIC6C595" },
  { m: /^U(PA|LB)$/, mpn: "ULN2803A", mfr: "any", desc: "8-ch relay coil driver SOIC-18 (unused inputs grounded, MR-8)", price1k: 9, alt: "TBD62083" },
  { m: /^UAUX$/, mpn: "NCP1252A", mfr: "onsemi", desc: "current-mode flyback controller, RT-set frequency (pin 4: 66.5 kΩ → ~65 kHz; 43 k→100 kHz / 8.5 k→500 kHz per datasheet Rev 9 — audit closed the §K RT line), A-suffix = 48% DCmax, BO pin, VCC-resistor startup, SOIC-8 — MR-13: the drawn application IS this IC", price1k: 24, alt: "UCC28C43 + RT/CT & BO rework" },
  { m: /^UBK(CARD|[AB])$/, mpn: "TPS54202-class", mfr: "TI/eq", desc: "15→3.3 V 2 A sync buck SOT-23-6 (CB-17/18 — replaces the thermally-impossible 15 V-fed LDO; on the card since the split, exporting V3P3 over the 88-way)", price1k: 15, alt: "MP2451/SY8113" },
  { m: /^LBK(CARD|[AB])$/, mpn: "IND-10u-3A", mfr: "any shielded", desc: "10 µH 3 A shielded power inductor (3V3 buck)", price1k: 6, alt: "any" },
  // --- magnetics (custom assemblies; costed builds from magnetics calc)
  { m: /^L[ABC]\d+$/, mpn: "IND-PFC-165u", mfr: "custom (docs/magnetics.md D1 rev B)", desc: "PFC choke 165 µH class, 3× OD79 26µ sendust (Magnetics 0077908A7 / Chang Sung KS eq, catalog AL 37 nH/T² ±8%), N=39, 3×(6×1 mm) flat Cu 18 mm² (audit F4: the rev-A 13.75 mm²/N=36 failed its own Rdc and L lines against the real core)", price1k: 1035, alt: "POCO/DMEGC equiv core" },
  { m: /^L\d+T$/, mpn: "IND-TRIM-BIN4", mfr: "custom (D2 rev C — GAPPED FERRITE)", desc: "resonant trim BIN SET 3.3/3.65/4.0/4.35 µH ±3% on 2× stacked PQ50/50 PC95-class (same core p/n as D3), N=4 litz, distributed gap ~3.3 mm ground per bin — audit F1: the rev-B sendust toroid at full 140 kHz AC swing computed ~43 W core loss vs a ~4 W tank budget and its L swung 2:1 over each cycle; powder cores are prohibited in this slot. Bin picked against measured transformer leakage so Lr(total)=7.0 µH (kitting per DFM step 3)", price1k: 110, alt: "air-core (lossier, stray field)" },
  { m: /^T\d+$/, mpn: "XFMR-LLC-10K", mfr: "custom (D3)", desc: "LLC section transformer 3× PQ50/50 PC95, 7:7:7, Lm 63 µH ±7% (E7 rev D2)", price1k: 680, alt: "PQ65 single-core variant" },
  { m: /^TAUX$/, mpn: "XFMR-AUX-FLY-C", mfr: "custom (D4 rev C)", desc: "aux flyback transformer ETD34, 110 W class, 342–860 V input, Np38/N24 6/N15 4/Naux 4 (E26 rev C — CB-20 SKU-load closure; reinforced pri→sec barrier, 100% hipot 4 kV)", price1k: 165, alt: "—" },
  { m: /^LDM[123]$/, mpn: "DM-22u-SKU", mfr: "custom/POCO (D6 rev B)", desc: "DM line choke 22 µH sendust toroid, line-current rated per SKU (HR-9; audit F7: 30 kW winding is 14 T × 3×AWG12 eq 9.9 mm² — the rev-A 2×AWG12 ran 8.3 A/mm² and computed ΔT 46–49 K vs the 45 K acceptance)", price1k: 120, alt: "DMEGC eq" },
  { m: /^CMC[12]$/, mpn: "CMC-3PH-2mH-SKU", mfr: "custom/Hongfa mag", desc: "3-phase CM choke 2 mH nanocrystalline, line-current-rated winding per SKU (HR-18/D7). 30 kW: qualify Schaffner RT8131-63-2M8 (63 A/2.8 mH/600 VAC, 3-line nanocrystalline, Digi-Key) as catalog drop-in — audit; custom drawing stays the second source", price1k: 240, alt: "Schaffner RT8131-63-2M8 @30 kW" },
  { m: /^CT[ABC]\d+$/, mpn: "ACX-1100", mfr: "Talema (Salem, India)", desc: "line CT 2500:1, 100 A, ±1%, Ø14.6 mm window, 4 kV hipot, PCB pins (audit: catalog part closes the CT-100A REVIEW; rated for 33 Ω burden so the 27 Ω fitted value is inside spec; quote Talema direct at volume — Digi-Key retail is not the RFQ price) (E18/R3)", price1k: 65, alt: "ZEMCT/HCT class eq" },
  { m: /^CT\d+$/, mpn: "AS-404", mfr: "Talema (Salem, India)", desc: "resonant CT 1:100, 50 A, 20–200 kHz, Ø8 mm pass-through — your tank conductor is the primary, so tank-potential insulation stays on your wire (audit: catalog part; alt Coilcraft CST2010-100L SMT 47 A/1 MHz sits at its 40 K rise at 46 A rms — needs airflow verify)", price1k: 55, alt: "Coilcraft CST2010-100L" },
  // --- capacitors
  { m: /^CD[TB]\d*\d$/, mpn: "ELH-470u450", mfr: "Aishi", desc: "470 µF 450 V snap-in 105 °C (split bus: 415 V max per half)", price1k: 150, alt: "ChengX/Nichicon" },
  { m: /^CB[AB]\d+[TB]$/, mpn: "ELH-470u450", mfr: "Aishi", desc: "470 µF 450 V snap-in — 2-series string, 900 V vs ≤525 V bank (E29/CB-2)", price1k: 150, alt: "ChengX" },
  { m: /^C\d+R\d$/, mpn: "PP-46n-1200", mfr: "Faratronic", desc: "46 nF 1200 V PP pulse film (resonant — CB-22: mpn now matches the frozen rev-D2 tank; Vrms ≈ 300 V @140 kHz → pulse-grade curve check O-8/§K)", price1k: 68, alt: "Songtian pulse PP" },
  { m: /^C\w+F[PN]$/, mpn: "PP-1u-600", mfr: "Faratronic", desc: "1 µF 600 V film (Vienna per-phase commutation, CB-9)", price1k: 32, alt: "Songtian" },
  { m: /^C(F\d+|B[AB]F)$/, mpn: "PP-1u-1100", mfr: "Faratronic", desc: "1 µF 1100 V film (bus commutation/bank — HR-1: 830 V ≤ 76%)", price1k: 68, alt: "Songtian" },
  { m: /^COF[12]$/, mpn: "PP-4u7-1200", mfr: "Faratronic", desc: "4.7 µF 1200 V film (output — HR-8: 1000 V = 83%)", price1k: 125, alt: "—" },
  { m: /^CX\d+$/, mpn: "X1-2u2-530", mfr: "Faratronic/Songtian", desc: "X1 2.2 µF 530 VAC (delta across 475 VAC line-line — CB-1)", price1k: 62, alt: "Vishay 3386 X1" },
  { m: /^(CY(O)?[123]?|CPET)$/, mpn: "Y1-4n7-440", mfr: "Songtian/Faratronic", desc: "Y1 4.7 nF 440 VAC (L-PE / output-PE / DGND-PE — MR-4; DC use verify O-7)", price1k: 16, alt: "TDK CD series" },
  { m: /^C\w+SN$/, mpn: "C1812-100p-1k", mfr: "any MLCC", desc: "100 pF 1 kV C0G 1812 (Vienna snubber, E28 re-size: CV²f = 0.86 W)", price1k: 7, alt: "film 630V" },
  { m: /^CCLA$/, mpn: "PP-10n-1200", mfr: "Faratronic", desc: "10 nF 1200 V film (aux RCD clamp)", price1k: 9, alt: "MLCC 1kV ×2" },
  { m: /^C[ABC]\d+C$/, mpn: "FILM-100n-250", mfr: "Faratronic", desc: "100 nF 250 V film (Vienna RCD clamp)", price1k: 18, alt: "MLCC 250V" },
  { m: /^CAUX(24|15)$/, mpn: "EL-220u-35", mfr: "Aishi", desc: "220 µF 35 V", price1k: 4, alt: "any" },
  { m: /^CVCC$/, mpn: "EL-47u-35", mfr: "Aishi", desc: "47 µF 35 V (controller VCC reservoir — CB-5)", price1k: 3, alt: "any" },
  { m: /^C3V3$/, mpn: "MLCC-10u-0805", mfr: "any", desc: "10 µF 0805", price1k: 1.2, alt: "any" },
  { m: /^C\w*(BL)$/, mpn: "MLCC-100p-0603", mfr: "any", desc: "100 pF 0603 (DESAT blank)", price1k: 0.4, alt: "any" },
  { m: /^C\w*B[12]$/, mpn: "MLCC-1u-0805", mfr: "any", desc: "1 µF 0805 (driver bias)", price1k: 0.8, alt: "any" },
  { m: /^C(PFC|LLC)D\d$/, mpn: "MLCC-100n-0402", mfr: "any", desc: "100 nF 0402 decoupling", price1k: 0.3, alt: "any" },
  { m: /^C[A-Z0-9]+$/, mpn: "MLCC-small", mfr: "any", desc: "filter/decoupling MLCC 0402–0805", price1k: 0.5, alt: "any" },
  // --- resistors (power/pulse/precision first, catch-all last)
  { m: /^R(PRE[12]|DIS\d)$/, mpn: "CER-25W-AX", mfr: "TE/local", desc: "25 W ceramic pulse resistor, axial (precharge 33 Ω / discharge 160 Ω; HR-14: pulse energy scales ×3.6 with SKU C — 50 W variant at 120 kW via skuOverride; per-SKU T-05)", price1k: 28, alt: "SQP25" },
  { m: /^RBD[AB]\d$/, mpn: "CER-2k2-10W-AX", mfr: "TE/local", desc: "2.2 kΩ 10 W wirewound axial (bank bleeder chain, HR-15 — ≤65 J/pulse at 120 kW, τ 4–17 s to <60 V)", price1k: 14, alt: "SQP10" },
  { m: /^RPRE[AB]$/, mpn: "SQP-10R-25W", mfr: "local", desc: "10 Ω 25 W wirewound pulse, axial (bank pre-insertion — HR-12: 94 J single-fault case)", price1k: 24, alt: "—" },
  { m: /^(RBAL[TB]\w*|RNS[123][AB])$/, mpn: "R2512-47k-HV-AS", mfr: "KOA/UniOhm", desc: "47 kOhm 2512 2 W anti-surge HV, Umax >= 250 V, 2-series per position (R3: 1.04 W worst case; a 1 W 2512 has sqrt(P*R)=217 V < 220 V at +10% bus) (HR-20: halves per-element V and W — ≤208 V / ≤0.92 W continuous)", price1k: 4, alt: "any HV 2512" },
  { m: /^R\w*SN$/, mpn: "R2512-10R-2W", mfr: "any", desc: "10 Ω 2512 2 W (Vienna snubber — E28: 0.86 W actual)", price1k: 6, alt: "any" },
  { m: /^R(AUXST[12]|BR1[AB]|CLA[12])$/, mpn: "R2512-HV", mfr: "UniOhm", desc: "2512 HV-rated (aux startup/brown-in/clamp — 2-series per 860 V)", price1k: 2.5, alt: "any 500V-rated" },
  // card-split rescues — MUST precede the two catch-alls below them. The audit ran the DB regexes
  // against the drawn designators: RFLTC (4.7 k FLT pull-up) and RAGTC (0 Ω single-point ground
  // tie) matched the clamp-bleeder rule and became 470 Ω 10 W wirewounds; RPD0..4 (10 k card-way
  // pull-downs, the E27 default-OFF state) matched the HV-divider rule and became 475 k 1206 HV.
  { m: /^R(FLTC|AGTC)$/, mpn: "R-small", mfr: "any", desc: "card FLT wired-OR pull-up 4.7 k 0603 / AGND–DGND 0 Ω 0805 single-point tie (card-split rescue)", price1k: 0.4, alt: "any" },
  { m: /^RPDB?[0-9]$/, mpn: "R0603-10k", mfr: "any", desc: "10 kΩ 0603 card-interface pull-down (board-side default-OFF on GATE_EN/EN/DO ways — CARD_RULES/E27)", price1k: 0.3, alt: "any" },
  { m: /^R\w+C$/, mpn: "WW-470R-10W", mfr: "local/TE", desc: "470 Ω 10 W wirewound axial (Vienna clamp bleeder — HR-3/MR-19: 4.3 W worst-case at 43% of rating)", price1k: 22, alt: "SQP10" },
  { m: /^R\w+D[0-7]$/, mpn: "HV73-475k-1%", mfr: "KOA/UniOhm", desc: "475 kΩ 1206 1% anti-surge (HV divider — MR-3)", price1k: 1.4, alt: "any anti-surge 1%" },
  { m: /^R\w{2}DL$/, mpn: "R0805-prec-0.1%", mfr: "UniOhm", desc: "divider bottom 0.1% (6.8 k unipolar / 11.5 k AC)", price1k: 2.5, alt: "any 0.1%" },
  { m: /^RAUXCS$/, mpn: "R1206-R31-1%-0.5W", mfr: "any current-sense", desc: "0.31 Ω 1% 0.5 W 1206 current-sense (aux Ip clamp 3.2 A — was misclassified into the small-signal catch-all)", price1k: 2.5, alt: "any CS 1206" },
  { m: /^R\w+(ON|OFF)$/, mpn: "R1206-RG-0.5W", mfr: "any thick-film HP", desc: "gate resistor 1206, 0.5 W-rated (4.7/2.2 Ω per E5/E6 — MR-16: LLC R_on dissipates ~0.2 W at 140 kHz; standard 0.25 W part runs 80%)", price1k: 2, alt: "2× 0805 parallel" },
  { m: /^R\w+GS$/, mpn: "R0805-10k", mfr: "any", desc: "10 kΩ gate-source", price1k: 0.5, alt: "any" },
  { m: /^R\d+CT$/, mpn: "R2512-2R0-1W-1%", mfr: "any", desc: "2.0 Ω 1% 1 W 2512 resonant-CT burden (CB-16: 46 A rms/1:100 → 0.92 V rms, 0.42 W; F.11 70 A pk = 3.05 V at comparator — the 33 Ω line-CT value was mis-copied here)", price1k: 3, alt: "2× 1206 1R0 series" },
  { m: /^R[ABC]\d+B$/, mpn: "R1206-27R-1%", mfr: "any", desc: "27 Ω CT burden 1% (line CTs 1:2500 → 0.59 V/55 A rms; 150 A pk OC observability = 1.62 V above AVMID, inside the 3.3 V rail — R3 fix, landed by margin audit 2026-09-08: the drawn 33 Ω put 150 A pk at 3.63 V, past the ADC rail)", price1k: 1.5, alt: "any" },
  { m: /^RSH?O$/, mpn: "SHUNT-MANG", mfr: "Isabellenhütte-eq/local", desc: "manganin shunt 50 mV class (SKU current)", price1k: 120, alt: "local manganin" },
  { m: /^RSEG\d$/, mpn: "R0603-220", mfr: "any", desc: "220 Ω segment", price1k: 0.3, alt: "any" },
  { m: /^R[A-Z0-9]+$/, mpn: "R-small", mfr: "any", desc: "small-signal resistor 0402–0805 (pulls/filters/feedback)", price1k: 0.4, alt: "any" },
  // --- ferrites
  { m: /^FB\w+$/, mpn: "FB-600R-0805", mfr: "any", desc: "ferrite bead 600 Ω@100 MHz (VDDA feed — MR-7)", price1k: 0.8, alt: "any" },
  // --- electromech / connectors / HMI / protection
  { m: /^KPRE[12]$/, mpn: "HF167F-80A-M", mfr: "Hongfa", desc: "power relay ≥80 A/line w/ mirror contact (precharge bypass carries full line current — CB-8; SKU class via override; MR-25: contact-gap withstand & insulation group at the 475 VAC system + ~660 V pk precharge transient = §K line)", price1k: 260, alt: "TE T9G / contactor option" },
  { m: /^KPRE[AB]$/, mpn: "HFE82V-20-M-CLASS", mfr: "Hongfa", desc: "HV DC relay 20 A 1000 VDC w/ auxiliary contact (pre-insertion) — was HFE9, see R8", price1k: 300, alt: "Panasonic AEV / TE EVC" },
  { m: /^K(SER|PARA|PARB|OUT)2?$/, mpn: "HFE82V-M-CLASS", mfr: "Hongfa", desc: "HV DC relay 1000 V w/ mirror contact (E30 readback; current class per SKU; *2 = 120 kW paralleled pair, HR-19 — contact-R matched at assembly or 250 A-class, §K)", price1k: 460, alt: "GIGAVAC eq" },
  { m: /^MOVP?[123]$/, mpn: "S20K550", mfr: "TDK/Songtian", desc: "MOV 550 VAC 20 mm (Δ line-line + series w/ GDT to PE)", price1k: 22, alt: "Songtian eq" },
  { m: /^GDT[123]$/, mpn: "GDT-3k5-20kA", mfr: "Bourns/eq", desc: "gas discharge tube 3.5 kV (L-PE surge path, HR-7)", price1k: 18, alt: "Littelfuse CG3" },
  { m: /^F[123]$/, mpn: "FUSE-gG-690V", mfr: "local/Bussmann", desc: "gG fuse 690 VAC, 22×58 frame (rating per SKU — audit F6: 80 A @30 kW; the 63 A part ran 88% loaded at 55.9 A worst and NEGATIVE against the ~0.72× enclosed/+55 °C derate; holder must be the matching 22×58 base, NOT the 10×38 RT28-32)", price1k: 105, alt: "SIBA" },
  { m: /^J(A|B|CARD)$/, mpn: "CONN-CARD-88", mfr: "any 2×44 0.1in", desc: "88-way 2×44 2.54 mm card interface — header on power board, receptacle on card, keyed (card-split rescue: the module's main mating interface matched no DB rule and was absent from the BOM)", price1k: 55, alt: "Samtec SSW/TSW class" },
  { m: /^DISP1$/, mpn: "LED-2DIG-0.56CC", mfr: "any", desc: "2-digit 7-seg 0.56\" common-cathode (HMI)", price1k: 18, alt: "any" },
  { m: /^SW[12]$/, mpn: "TACT-6x6", mfr: "any", desc: "tactile switch 6×6 (HMI; pinout pairing VERIFY at BOM freeze, MR-10)", price1k: 3, alt: "any" },
  { m: /^JSWD\w+$/, mpn: "HDR-1x5-2.54", mfr: "any", desc: "SWD/boot header (EOL programming — CB-13; LV-only test state §45)", price1k: 8, alt: "TC2030 pads" },
  { m: /^J(ACL\d|PE|PEB|DCP|DCN|OUTP|OUTN|QDIS)?$/, mpn: "STUD-M8", mfr: "local", desc: "M8 stud terminal", price1k: 28, alt: "M6 for signal PE" },
  { m: /^JIC[AB]$/, mpn: "MICROFIT3-16", mfr: "Molex 43045-16 class", desc: "16-way board-to-board harness header, 5 A/contact (MR-14: JST PHD's 1 A contacts were over-run by V15/GND at 120 kW; spares 14/15 now carry GND)", price1k: 38, alt: "JST VL / TE MicroMate" },
  { m: /^JCAN$/, mpn: "PH-4", mfr: "JST", desc: "CAN connector 4-way", price1k: 8, alt: "any" },
  { m: /^JFAN[1-4]$/, mpn: "PH-4-FAN", mfr: "JST", desc: "fan header 4-way (fan p/n must accept 3.3 V PWM — MR-9; 3/4 fitted at 120 kW, HR-17)", price1k: 6, alt: "any" },
  { m: /^J(TERM|T\w+)$/, mpn: "PH-2", mfr: "JST", desc: "2-way header (NTC/term)", price1k: 3, alt: "any" },
  { m: /^LCAN$/, mpn: "CMC-CAN-51uH", mfr: "any", desc: "CAN common-mode choke", price1k: 8, alt: "any" },
  { m: /^TVSCAN$/, mpn: "PESD1CAN", mfr: "Nexperia/eq", desc: "CAN TVS", price1k: 4, alt: "any" },
  { m: /^QDIS$/, mpn: "TAB-M4", mfr: "local", desc: "discharge FET heatsink tab stud", price1k: 6, alt: "—" },
];

// per-SKU overrides: name → { price1k, qtyMul, note }
export const skuOverrides = {
  "30kw": {
    // audit F6 2026-09-08: 63 A gG at 55.9 A worst continuous = 88% nameplate and NEGATIVE after
    // the ~0.72× enclosed/+55 °C derate → 80 A, 22×58 frame (matching holder; RT28-32 was 10×38/32 A).
    "F1": { price1k: 105, mpn: "FUSE-gG-690V-80A" }, "F2": { price1k: 105, mpn: "FUSE-gG-690V-80A" }, "F3": { price1k: 105, mpn: "FUSE-gG-690V-80A" },
    KOUT: { price1k: 460 }, KSER: { price1k: 460 }, KPARA: { price1k: 460 }, KPARB: { price1k: 460 },
    KPRE1: { price1k: 260, note: "80 A class (55 A line)" , mpn: "HF167F-80A-M"}, KPRE2: { price1k: 260 , mpn: "HF167F-80A-M"},
    LDM1: { price1k: 120, note: "D6 60 A winding" }, LDM2: { price1k: 120 }, LDM3: { price1k: 120 },
    CMC1: { price1k: 240, note: "D7 60 A winding (10 mm² foil)" }, CMC2: { price1k: 240 },
    RSHO: { price1k: 120 },
  },
  "60kw": {
    // reference board (product = 2× 30 kW modules, each with its own 80 A): 125 A at 110 A carries
    // the same 88%/derate problem as F6 if ever built single-board — size to 160 A NH00 then.
    "F1": { price1k: 210, mpn: "FUSE-gG-690V-125A" }, "F2": { price1k: 210, mpn: "FUSE-gG-690V-125A" }, "F3": { price1k: 210, mpn: "FUSE-gG-690V-125A" },
    KOUT: { price1k: 820 }, KSER: { price1k: 820 }, KPARA: { price1k: 820 }, KPARB: { price1k: 820 },
    KPRE1: { price1k: 340, note: "120 A class (110 A line)" , mpn: "HF167F-120A-M"}, KPRE2: { price1k: 340 , mpn: "HF167F-120A-M"},
    LDM1: { price1k: 240, note: "D6 120 A winding" }, LDM2: { price1k: 240 }, LDM3: { price1k: 240 },
    CMC1: { price1k: 420, note: "D7 120 A winding (25 mm² foil, larger core)" }, CMC2: { price1k: 420 },
    RSHO: { price1k: 180 },
  },
  "120kw": {
    "F1": { price1k: 480, mpn: "FUSE-gG-690V-250A" }, "F2": { price1k: 480, mpn: "FUSE-gG-690V-250A" }, "F3": { price1k: 480, mpn: "FUSE-gG-690V-250A" },
    // HR-19: the paralleled second relays are now real schematic instances (KOUT2 etc. in the
    // dual matrix) — qtyMul retired so BOM = schematic again.
    KOUT: { price1k: 820, note: "2× 200 A paralleled (dual instance)" }, KSER: { price1k: 820, note: "2× 200 A paralleled" },
    KPARA: { price1k: 820 }, KPARB: { price1k: 820 },
    KOUT2: { price1k: 820 }, KSER2: { price1k: 820 }, KPARA2: { price1k: 820 }, KPARB2: { price1k: 820 },
    KPRE1: { price1k: 520, note: "250 A class (220 A line)" , mpn: "HF167F-250A-M"}, KPRE2: { price1k: 520 , mpn: "HF167F-250A-M"},
    LDM1: { price1k: 480, note: "D6 240 A winding" }, LDM2: { price1k: 480 }, LDM3: { price1k: 480 },
    CMC1: { price1k: 780, note: "D7 240 A winding (busbar/foil, stacked cores — was 28 A/mm², HR-18)" }, CMC2: { price1k: 780 },
    RPRE1: { price1k: 45, note: "50 W pulse variant (477 J/event — HR-14)" , mpn: "CER-50W-AX"}, RPRE2: { price1k: 45 , mpn: "CER-50W-AX"},
    RDIS0: { price1k: 45, note: "50 W pulse variant (382 J — HR-14)" , mpn: "CER-50W-AX"}, RDIS1: { price1k: 45 , mpn: "CER-50W-AX"}, RDIS2: { price1k: 45 , mpn: "CER-50W-AX"}, RDIS3: { price1k: 45 , mpn: "CER-50W-AX"},
    RSHO: { price1k: 260 },
  },
};

// E23 custom bias transformer: RETIRED (rev D, 10k-volume decision — E23 rev B). At 10k
// modules/yr the QA01C-class module lands ≤₹55 (p10k), making the custom multi-secondary
// transformer's net saving ≈ ₹0 against real EMC (C_io), winding-house and second-source risk.
// Modules are the permanent production architecture; D5 drawing cancelled.
export const biasCommon = { desc: 'BIAS-XFMR multi-secondary set (E23) — RETIRED at 10k volume (modules permanent, E23 rev B)', price1k: 0 };
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
