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
// (CB-19), 110 W aux (CB-20/E26 rev C), NCP1252 primary (MR-13; A→D suffix at R6-G for cold-start), VET6 MCU suffix (MR-12),
// reinforced iso-5V modules (HR-16), 6-pin WD (HR-13), 47 k 2-series HV balance/star (HR-20),
// Micro-Fit harness (MR-14), rail TVS (MR-17), 10 W clamp bleeder (MR-19), bank-bleed parts
// (HR-15), per-SKU CMC + pulse-resistor overrides (HR-18/HR-14).
// Ordering matters: first matching pattern wins; keep specific patterns above the catch-alls.

// The buildable/deliverable single-board set. 120 kW is a CABINET (4× 30 kW / 2× 60 kW — product
// structure + E36): its single-board pair cannot exist since the card split (cardMap() correctly
// refuses 4 lanes — AIN needs 17 of 13), so every pipeline consumer iterates THIS list and the
// 120 kW product cost is a 4×-module roll-up in bom-gen.
export const BUILDABLE_SKUS = ["30kw", "40kw", "50kw", "50kwa"];   // E40 single-brain + E41 40 kW air + E42 50 kW liquid + E44 50 kW AIR; 60/80/100/120/150 kW are cabinets

export const DB = [
  // --- power semiconductors
  { m: /^Q[ABC]\d+[AB]2?$/, mpn: "B3M010C075Z", mfr: "BASiC", desc: "SiC MOSFET 750 V 10 mΩ TO-247-4", price1k: 330, alt: "SiChain 750V/10mΩ (RFQ)" },
  { m: /^Q\d+[HL]2?$/, mpn: "SG2M023120LJ", mfr: "SiChain", desc: "SiC MOSFET 1200 V 23 mΩ TO-247-4L (E44: the air-50 parallels a second per position — Q#H2/L2)", price1k: 390, alt: "BASiC B3M020120ZL" },
  { m: /^D[ABC]\d+[TB]$/, mpn: "SICJBS-1200-40", mfr: "SiChain", desc: "SiC JBS 1200 V 40 A TO-247-2 (exact p/n at RFQ)", price1k: 120, alt: "BASiC B3D040120H" },
  { m: /^D[ABC]\d+C$/, mpn: "SICJBS-1200-10", mfr: "SiChain", desc: "SiC JBS 1200 V 10 A TO-247-2 (RCD clamp)", price1k: 55, alt: "CR Micro 1200V/10A" },
  { m: /^D\d+[AB][1-4]$/, mpn: "SICJBS-1200-20", mfr: "SiChain", desc: "SiC JBS 1200 V 20 A TO-247-2 (secondary bridge)", price1k: 90, alt: "CR Micro 1200V/20A" },
  { m: /^QDIS[FAB]$/, mpn: "SIC-1200-5A", mfr: "CR Micro", desc: "SiC FET 1200 V 5 A (bus discharge QDISF / bank bleeders QDISA-B, HR-15; R7-B/R8 gate spec for the PV-driven bleeders: Vth(max) ≤ 3.5 V, Igss ≤ 100 nA. The 6.8 MΩ load-line figure (≈5.8 V after leakage) is a 25 °C-ENDPOINT MODEL, not an all-temperature guarantee — VOM1271 Voc(typ) falls to ~5.4 V at 100 °C; declared bleed-interval local ambient ≤ 70 °C, and EVT loaded-Vgs/discharge measurement with the exact orderable FET gates the BOM freeze)", price1k: 120, alt: "BASiC small 1200V" },
  { m: /^QAUX$/, mpn: "SIC-1700-1R", mfr: "CR Micro/BASiC", desc: "SiC FET 1700 V ~1 Ω (aux flyback, full-bus E26 rev C; TO-247 likely package — MR-23, footprint placeholder §40)", price1k: 160, alt: "G3R1700 class" },
  { m: /^DZAUX$/, mpn: "BZT52-C15", mfr: "any", desc: "15 V zener SOD-123 (R4-3: primary-side regulation reference — VCC regulates at VZ+VBE ≈ 15.7 V, aux winding tracks the rails)", price1k: 0.8, alt: "MMSZ5245B" },
  { m: /^DCLA$/, mpn: "SIC-SBD-1700V", mfr: "GeneSiC/Littelfuse/Wolfspeed class", desc: "SiC Schottky ≥1700 V, IF(AV) ≥1 A, IFRM ≥10 A, no forward recovery (aux RCD clamp — E65: the 1200 V STTH112U blocked Vbus + Vc = 1307–1337 V at the stack-up leakage and avalanched every cycle; d4-flyback computes Vr ≤ 80 % at 860 V + limit current + 5 µH) [est ₹150 @1k: 1.7 kV SiC SBD distributor class, RFQ]", price1k: 150, alt: "2× STTH112U series (only with a measured VFP allowance re-run through d4-flyback)" },
  { m: /^D\w*S[12]$/, mpn: "US1M", mfr: "Yageo/MDD", desc: "1 kV 1 A fast diode SMA (DESAT chain)", price1k: 1.2, alt: "M7/US1M any" },
  { m: /^DAUX24$/, mpn: "UF-400V-3A", mfr: "onsemi/MDD (MURS340 class)", desc: "400 V 3 A ultrafast, SMC pad (aux 24 V rectifier — CB-19: PIV ≈ 176 V + leakage ring; 100 V Schottky avalanched)", price1k: 5, alt: "ES3 series 400 V" },
  { m: /^DAUX(15|VC)$/, mpn: "US2G", mfr: "MDD/Yageo", desc: "400 V 2 A ultrafast SMB (aux 15 V / self-supply rectifiers — CB-19: PIV ≈ 157 V + ring)", price1k: 3, alt: "MURS240" },
  { m: /^DTVS24$/, mpn: "SMBJ26A", mfr: "any", desc: "TVS 26 V uni SMB (V24 rail clamp — MR-17 FB-open fault)", price1k: 3, alt: "any" },
  { m: /^DTVS15$/, mpn: "SMBJ16A", mfr: "any", desc: "TVS 16 V uni SMB (V15 rail clamp — MR-17)", price1k: 3, alt: "any" },
  { m: /^D\d+W$/, mpn: "BAT54A", mfr: "any", desc: "dual Schottky SOT-23 common anode (E65 F.11 window comparator diode-OR onto the FLT wire-OR)", price1k: 0.6, alt: "BAT54AW" },
  { m: /^D\w+P$/, mpn: "1N4148WS", mfr: "any", desc: "clamp diode SOD-323 (to 3V3)", price1k: 0.4, alt: "BAS316" },
  { m: /^D\w+N$/, mpn: "1N4148WS", mfr: "any", desc: "clamp diode SOD-323 (from AGND — CB-15 bipolar front-end)", price1k: 0.4, alt: "BAS316" },
  { m: /^(QAUXFB|QPVD)$/, mpn: "S8050", mfr: "CJ", desc: "NPN SOT-23 (QAUXFB: R4-3 opto-emulating FB pull-down · QPVD: R7-B low-side switch for the PV-driver LEDs at the guaranteed 10 mA point)", price1k: 0.4, alt: "MMBT2222" },
  { m: /^QDIG[12]$/, mpn: "S8050", mfr: "CJ", desc: "NPN SOT-23 (display digit driver)", price1k: 0.4, alt: "MMBT2222" },
  // --- gate drive, isolation & safety chain
  { m: /^U([ABC]\d+G|\d+[HL])$/, mpn: "NSI6611", mfr: "NOVOSENSE", desc: "iso gate driver 10 A, DESAT/Miller(CLAMP wired, CB-12)/UVLO, SOIC-16", price1k: 85, alt: "NSI6602B" },
  // ---- 150 kW cabinet sheet (E39/E55; E66 no CSU) — interface blocks + controller CAN port ----
  { m: /^MOD\d$/, mpn: "PMP-50KW-MODULE", mfr: "own", desc: "50 kW module interface block (liquid 50kw or air 50kwa — E55 cabinet re-base; cost is the module roll-up, not a part)", price1k: 0, alt: "—" },
  { m: /^CTRL1$/, mpn: "CHARGER-CONTROLLER-CAN-PORT", mfr: "integrator (A13)", desc: "charger controller CAN port — the group master that broadcasts GROUP_SET 0x12 (E66: replaces the cabinet CSU); interface block, not a part", price1k: 0, alt: "—" },
  { m: /^JCAB(L\d|PE|D[PN])$/, mpn: "STUD-M8", mfr: "local", desc: "cabinet entry/bus M8 stud", price1k: 28, alt: "M10 for DC bus" },
  { m: /^RT[12]$/, mpn: "R0603-120R-1%", mfr: "any", desc: "CAN termination 120 Ω (both chain ends)", price1k: 0.4, alt: "any" },
  { m: /^RSHB$/, mpn: "R0603-0R", mfr: "any", desc: "CAN shield single-point PE bond (liftable)", price1k: 0.3, alt: "any" },
  { m: /^PS(CAN|SH)$/, mpn: "ISO5V-RFC-6K", mfr: "MORNSUN QA/URB-grade", desc: "iso 15→5 V ≥1 W REINFORCED-rated module ≥5 kVrms test (HR-16: this module IS part of the mains/output→SELV barrier — B1505S 1.5 kV functional grade rejected; certificate class = §K gate)", price1k: 95, p10k: 65, alt: "RECOM RxxP-R / certified eq" },
  // MUST precede the /^PS5\w+$/ rule below. In "PS5AC"/"PS5BUS" the 5 means 5 VOLTS; in "PS5H"
  // the 5 is the LLC LEG INDEX. The 5 V sense rule was swallowing leg 5's two gate-bias modules,
  // so on 60 kW and 120 kW the leg-5 SiC gate drivers were specified with a 5 V isolated SENSE
  // module instead of the +18/-4 gate-bias module -- a different part, a different symbol, and a
  // gate that cannot turn on. Legs 1-4 and 6-12 were unaffected, which is why it hid: it needed
  // a sheet with a leg 5 on it. Found by proving the replicated cells identical and diffing the
  // one that was not.
  { m: /^PS\d+[HL]$/, overrides: ["ISO5V-RFC-6K"], mpn: "QA01C-18", mfr: "MORNSUN", desc: "iso gate-bias module +18/−4-configured (E23 rev B: modules PERMANENT — at 10k modules/yr (~90k+ pcs aggregated) module pricing ≤₹55 makes the custom-transformer ECO-1 net ≈ ₹0 with added EMC/mfg risk → ECO-1 RETIRED; O-11: drawn P18/COM/N4 dual-rail vs single-out suffix — the −4 V zener-split or a true dual-rail p/n MUST be resolved at §K, E5/E6 off-bias depends on it; R5-F: DC input 13.5–16.5 V vs V15 ≈15.0 V off the regulated 15.65 V aux — inside range, cross-regulation re-verify at EVT)", price1k: 95, p10k: 55, alt: "domestic iso-module eq (2nd source at RFQ)" },
  { m: /^PS5\w+$/, mpn: "ISO5V-RFC-6K", mfr: "MORNSUN QA/URB-grade", desc: "iso 15→5 V reinforced-rated (iso-sense floating bias, E25/HR-16 — same barrier argument per domain: AC star / DCN / BKAN / BKBN)", price1k: 95, p10k: 65, alt: "RECOM RxxP-R / certified eq" },
  { m: /^PSQD\w*$/, mpn: "QA01C", mfr: "MORNSUN", desc: "iso 15→18 V module ≥6 kVDC (bus-discharge driver bias, CB-11; insulation cert class §K)", price1k: 95, p10k: 60, alt: "B1518S-3WR3HD" },
  { m: /^PS\w+$/, mpn: "QA01C-18", mfr: "MORNSUN", desc: "iso gate-bias module +18/−4-configured (E23 rev B: modules PERMANENT — at 10k modules/yr (~90k+ pcs aggregated) module pricing ≤₹55 makes the custom-transformer ECO-1 net ≈ ₹0 with added EMC/mfg risk → ECO-1 RETIRED; O-11: drawn P18/COM/N4 dual-rail vs single-out suffix — the −4 V zener-split or a true dual-rail p/n MUST be resolved at §K, E5/E6 off-bias depends on it; R5-F: DC input 13.5–16.5 V vs V15 ≈15.0 V off the regulated 15.65 V aux — inside range, cross-regulation re-verify at EVT)", price1k: 95, p10k: 55, alt: "domestic iso-module eq (2nd source at RFQ)" },
  { m: /^USHO$/, mpn: "NSI1200-DSWR", mfr: "NOVOSENSE", desc: "iso shunt amplifier SOIC-8 (differential OUTP/OUTN both routed, MR-6)", price1k: 70, alt: "AMC1200" },
  { m: /^UIVV[123]$/, mpn: "AMC1350-class", mfr: "TI/NOVOSENSE", desc: "iso voltage-sense amp ±5 V input (AC phase sense vs artificial star, E25)", price1k: 135, alt: "NSI1300 class" },
  { m: /^UIV\w+$/, mpn: "AMC1311-class", mfr: "TI/NOVOSENSE", desc: "iso voltage-sense amp 0–2 V input (bus/bank/output senses, E25/CB-3; R4 note: on the 1311 class the symbol's pin-3 'VINN' is physically SHTDN — grounded = enabled, netlist correct, label carried from the shared iso-amp table)", price1k: 115, alt: "NSI1311 class" },
  { m: /^UCAN$/, mpn: "NSI1042-DSWR", mfr: "NOVOSENSE", desc: "iso CAN transceiver SO-16 (R5-H HOLD CLOSED at R7: datasheet Rev 1.3 package drawing + pin table AGREE for the -DSWR suffix — VDD1=1, GND1=2/8, RXD=3, TXD=6, GND2=9/10/15, CANL=12, CANH=13, pin 11 NC — exactly the map the sheets already carry; external reviewer independently verified)", price1k: 60, alt: "NSI1050-DSWR" },
  { m: /^UQD$/, mpn: "TLP152-class", mfr: "Toshiba/eq", desc: "opto gate driver (isolated bus-discharge control, default-OFF — CB-11)", price1k: 42, alt: "1ED31xx lite" },
  { m: /^UPV[AB]$/, mpn: "VOM1271T", mfr: "Vishay/eq", desc: "photovoltaic MOSFET driver w/ integrated turn-off (bank bleeders — ECO-2a/E33 rev B: no floating supply needed, ms-class turn-on is the point)", price1k: 35, p10k: 28, alt: "TLP3906" },
  { m: /^USUP(CARD|[AB])$/, mpn: "TPS3430-class", mfr: "TI/eq", desc: "external windowed watchdog SOT-23-6: VDD/GND/WDI/WDO/SET straps (HR-13 — symbol now carries supply + window pins; strap values per datasheet at A6/§K)", price1k: 35, alt: "MAX6753" },
  { m: /^UAND(CARD|[AB])$/, mpn: "74HC11", mfr: "any", desc: "triple 3-input AND (gate-enable wired-AND, E27)", price1k: 8, alt: "74LVC1G11 ×1" },
  { m: /^UEXCL2?$/, mpn: "74HC02", mfr: "any", desc: "quad NOR SOIC-14 (R4-8 + R5-D two-stage hardware S/P exclusion — KSER coil = KSER ∧ ¬(KPARA∨KPARB) ∧ ¬(KPREA∨KPREB); every destructive matrix state involves KSER, so both stages kill all of them)", price1k: 6, alt: "74LVC02A" },
  { m: /^U\d+W$/, mpn: "TLV3202-class", mfr: "TI/3PEAK", desc: "dual 40 ns push-pull comparator SOIC/VSSOP-8, 2.7–5.5 V (E65 F.11 window: trips above F11_VH and below F11_VL, diode-OR onto FLT = HRTIMER_FLT2)", price1k: 16, alt: "TS3022 / LMV7239 ×2" },
  { m: /^UAVB$/, mpn: "TLV9061-class", mfr: "TI/3PEAK", desc: "rail-to-rail op-amp (AVMID buffer, E31)", price1k: 12, alt: "LMV321" },
  // --- control (card-split 2026-09-08: UCARD/USUPCARD/UANDCARD/UBKCARD/LBKCARD live on the
  //     control card — the audit found the old per-board regexes silently dropped ALL of them,
  //     the MCU included, from the BOM after the split)
  { m: /^U(PFC|LLC|CARD)$/, mpn: "GD32G553VET7", mfr: "GigaDevice", desc: "MCU Cortex-M33 216 MHz LQFP100 −40…105 °C (MR-12: V-suffix = 100-pin — the earlier RET6 was the 64-pin part; R5-I: ordering table lists ONLY VET7 (105 °C/216 MHz) and VET3 (125 °C/170 MHz) — the drawn VET6 was not a valid order code, silicon/pinout unchanged; full pin map regenerates at A6)", price1k: 210, alt: "GD32G553VET3 (125 °C)" },
  { m: /^USR1$/, mpn: "74HC595", mfr: "any", desc: "shift register SOIC-16 (HMI segments)", price1k: 4, alt: "TPIC6C595" },
  { m: /^U(PA|LB)$/, mpn: "ULN2803A", mfr: "any", desc: "8-ch relay coil driver SOIC-18 (unused inputs grounded, MR-8)", price1k: 9, alt: "TBD62083" },
  { m: /^UAUX$/, mpn: "NCP1252D", mfr: "onsemi", desc: "current-mode flyback controller, RT-set 65 kHz (66.5 kΩ, datasheet Rev 9), SOIC-8. R6-G: D-suffix REPLACES the drawn A — the A version has a mandatory 120 ms pre-soft-start delay with only 1.0 V UVLO hysteresis, and the 940 k startup feed (0.59 mA) minus ICC (1.4–2.2 mA) crashes VCC in 28–60 ms → cold start would HICCUP FOREVER. D: no delay, VCC(on) 14 V / 5.0 V hysteresis, DCmax 45.6% vs the 22% worst duty this DCM flyback needs at the 321 V brown-in. Startup budget: ≈5.6 mA × 60 ms soft-start+takeover = 336 µC → CVCC ≥ 67 µF → 220 µF fitted (3× margin, cold-start ≈ 5–6 s at 565 V precharged bus — boot-time spec note, firmware-guide)", price1k: 24, alt: "UCC28C43 + RT/CT & BO rework" },
  { m: /^UBK(CARD|[AB])$/, mpn: "TPS54202-class", mfr: "TI/eq", desc: "15→3.3 V 2 A sync buck SOT-23-6 (CB-17/18 — replaces the thermally-impossible 15 V-fed LDO; on the card since the split, exporting V3P3 over the 88-way)", price1k: 15, alt: "MP2451/SY8113" },
  { m: /^LBK(CARD|[AB])$/, mpn: "IND-10u-3A", mfr: "any shielded", desc: "10 µH 3 A shielded power inductor (3V3 buck)", price1k: 6, alt: "any" },
  // --- magnetics (custom assemblies; costed builds from magnetics calc)
  { m: /^L[ABC]\d+$/, mpn: "IND-PFC-165u", mfr: "custom (docs/magnetics.md D1 rev B)", desc: "PFC choke 165 µH class, 3× OD79 26µ sendust (Magnetics 0077908A7 / Chang Sung KS eq, catalog AL 37 nH/T² ±8%), N=39, 9× 1.6 mm enamelled bundle, 18 mm² class (E65 D1: the 3×(6×1 mm) flat-on-edge alternate is withdrawn — its 6 mm dimension lies across the 50 kHz bore field); one end face gap-pad bonded to the PE web under an insulating clamp (d1-choke: 43 W and 87 °C hot-spot at the 330 VAC corner, 131 °C air-cooled as registered); Rdc ≤ 6.9 mΩ @25 °C (audit F4: the rev-A 13.75 mm²/N=36 failed its own Rdc and L lines against the real core)", price1k: 1035, alt: "POCO/DMEGC equiv core" },
  { m: /^L\d+T$/, mpn: "IND-TRIM-BIN4", mfr: "custom (D2 rev E — GAPPED FERRITE, E65)", desc: "D2-30 rev E (E65): resonant trim BIN SET 6.35/6.5/6.65/6.8 µH ±1.5% on 1× E70/33/32 PC95-class (TDK former B66372B1000), N=8, litz 6112×0.05 mm (12.0 mm²) compacted single layer ≥3 mm clear of a DISTRIBUTED centre-leg gap (≤1.0 mm per segment); vacuum-impregnated, both yoke faces gap-padded to the extrusion webs, 130 °C cutout in the magnetics loop. Carries ~all of Lr: the E60 bins (3.3–4.35 µH) assumed an 'engineered 3 µH' transformer leakage that an S1–P–S2 interleave cannot produce (computes 0.22 µH). Envelope gate (two-node core/winding network): ~11.5 W Fe + 10.6 W Cu at the SER250 corner, hot-spot 99 °C at 55 °C inlet; fault flux 127 mT at F.11+race. Bin picked against measured D3 leakage + 0.1 µH loop so Lr(total)=7.0 µH ±3% (DFM step 3). Powder cores prohibited in this slot (audit F1). E65 cost roll-up [est, REVIEW at winder RFQ]: E70/33/32 PC95-class set ₹160, litz 0.05 mm ₹2,600/kg, TIW-served 0.071 mm ₹2,210/kg, Cu foil ₹1,050/kg, +10 % leads, former, insulation, gap work, labour + test → ₹886", price1k: 886, alt: "Ferroxcube 3C95 E71/33/32 set" },
  { m: /^T\d+$/, mpn: "XFMR-LLC-10K", mfr: "custom (D3-30 rev C, E65)", desc: "D3-30 rev C (E65): LLC section transformer 2× E70/33/32 PC95-class on TDK B66372B2000 (same former as D3-40), 7:7:7, Lm 63 µH ±7% (distributed gap ground to AL), S1–P–S2 interleave, primary TIW-served litz 2475×0.071 mm, secondaries Cu foil 0.10×28 mm; vacuum-impregnated, both yoke faces gap-padded to the webs, 130 °C cutout. The 3× PQ50/50 stack it replaces could not be wound (stacked PQ leg tips leave 5–6 mm radial build vs the 8.1 mm lay-up) and its real MLT 191–229 mm (not 115) put Rdc outside its own rows; at the simulated 77–88 kHz / 525 V-bank corner it ran away in air. Envelope gate: Fe 22.3 W (142 mT), Cu 23.9 W (SER250), winding hot-spot 104 °C at 55 °C inlet, B̂ ≤36 % of hot Bsat. E65 cost roll-up [est, REVIEW at winder RFQ]: E70/33/32 PC95-class set ₹160, litz 0.05 mm ₹2,600/kg, TIW-served 0.071 mm ₹2,210/kg, Cu foil ₹1,050/kg, +10 % leads, former, insulation, gap work, labour + test → ₹1,200", price1k: 1200, alt: "Ferroxcube 3C95 E71/33/32 sets" },
  { m: /^TAUX$/, mpn: "XFMR-AUX-FLY-E", mfr: "custom (D4 rev E — E65)", desc: "aux flyback transformer ETD44 PC95, 110 W class, 321–860 V input, Np38/N24 6/N15 4/Naux 4 unchanged, Lp 345 µH ±5 %/AL 239, P/2–S–P/2 sandwich, leakage ≤ 4 µH, primary pins 1–4 / SELV pins 5–8 (E65 D4 sweep: at the REAL cycle-by-cycle limit — CS filter lag + tILIM — ETD39 reached 410 mT = 113 % of Bsat 130 °C; ETD44 Ae 173 mm² with the 0.28 Ω / 100 pF sense chain computes 71 %; reinforced pri→sec barrier, 100 % hipot 4 kV) [est ₹230 @1k: ETD39 wind ₹185 + larger core set/former]", price1k: 230, alt: "—" },
  { m: /^LDM[123]$/, mpn: "DM-CHOKE-SKU", mfr: "custom/POCO (D6 rev C — ENGINE-designed, dm-choke-design.mjs)", desc: "DM line choke, 60µ sendust stack, crest-biased L(Ipk) meets the per-variant LISN floor (E43: the inherited 22 µH could not exist at the crest on the drawn core — 7–8 µH at 82 A pk computed vs the 15 µH floor; engine rows: 30 kW 2×T48 N=7 foil 20 mm², 40 kW 2×T57 N=8 26.4 mm², 50 kW 3×T57 N=8 26.4 mm²)", price1k: 300, alt: "DMEGC/Chang Sung eq cores" },
  { m: /^CMC[12]$/, mpn: "CMC-3PH-2mH-SKU", mfr: "custom/Hongfa mag", desc: "3-phase CM choke 2 mH nanocrystalline, line-current-rated winding per SKU (HR-18/D7). 30 kW: qualify Schaffner RT8131-63-2M8 (63 A/2.8 mH/600 VAC, 3-line nanocrystalline, Digi-Key) as catalog drop-in — audit; custom drawing stays the second source", price1k: 240, alt: "Schaffner RT8131-63-2M8 @30 kW" },
  { m: /^CT[ABC]\d+$/, mpn: "ACX-1100", mfr: "Talema (Salem, India)", desc: "line CT 2500:1, 100 A, ±1%, Ø14.6 mm window, 4 kV hipot, PCB pins (audit: catalog part closes the CT-100A REVIEW; rated for 33 Ω burden so the 27 Ω fitted value is inside spec; quote Talema direct at volume — Digi-Key retail is not the RFQ price) (E18/R3)", price1k: 65, alt: "ZEMCT/HCT class eq" },
  { m: /^CT\d+$/, mpn: "AS-404", mfr: "Talema (Salem, India)", desc: "resonant CT 1:100, 50 A, 20–200 kHz, Ø8 mm pass-through — your tank conductor is the primary, so tank-potential insulation stays on your wire (audit: catalog part; alt Coilcraft CST2010-100L SMT 47 A/1 MHz sits at its 40 K rise at 46 A rms — needs airflow verify)", price1k: 55, alt: "Coilcraft CST2010-100L" },
  // --- capacitors
  { m: /^CD[TB]\d*\d$/, mpn: "ELH-470u450", mfr: "Aishi", desc: "470 µF 450 V snap-in 105 °C, −40 °C category (A11 rev C cold floor −30 °C) (split bus: 415 V max per half)", price1k: 150, alt: "ChengX/Nichicon" },
  { m: /^CB[AB]\d+[TB]$/, mpn: "ELH-470u450", mfr: "Aishi", desc: "470 µF 450 V snap-in, −40 °C category — 2-series string, 900 V vs ≤525 V bank (E29/CB-2)", price1k: 150, alt: "ChengX" },
  { m: /^C\d+R\d$/, mpn: "PP-46n-1200", mfr: "Faratronic", desc: "46 nF 1200 V PP pulse film (resonant — CB-22: mpn now matches the frozen rev-D2 tank; Vrms ≈ 300 V @140 kHz → pulse-grade curve check O-8/§K)", price1k: 68, alt: "Songtian pulse PP" },
  { m: /^$never$/, mpn: "PP-33n-1200V", mfr: "Faratronic/CDE 942C class", desc: "33 nF 1200 V PP resonant-duty film (E41 tank: 6x per section; 355 V rms @140 kHz / 0.73 W per cap — O-8 RFQ line: published Vrms-vs-f curve >=460 V @140 kHz, 942C class; reached via skuOverrides only)", price1k: 11, alt: "942C20P33K" },
  { m: /^$never$/, mpn: "PP-27n-1200V", mfr: "Faratronic/CDE 942C class", desc: "27 nF 1200 V PP resonant-duty film (E42 tank: 8x per section, per-cap ~9.7 A of the 12 A line; 407 V rms @140 kHz / 0.79 W per cap — O-8 RFQ line: published Vrms-vs-f curve >=530 V @140 kHz, 942C class; reached via skuOverrides only — priced at the 46 nF conservative basis until the pulse-film RFQ)", price1k: 11, alt: "942C20P27K" },
  { m: /^C\w+F[PN]$/, mpn: "PP-1u-600", mfr: "Faratronic", desc: "1 µF 600 V film (Vienna per-phase commutation, CB-9)", price1k: 32, alt: "Songtian" },
  { m: /^C(F\d+|B[AB]F)$/, mpn: "PP-1u-1100", mfr: "Faratronic", desc: "1 µF 1100 V film (bus commutation/bank — HR-1: 830 V ≤ 76%)", price1k: 68, alt: "Songtian" },
  { m: /^COF[12]$/, mpn: "PP-4u7-1200", mfr: "Faratronic", desc: "4.7 µF 1200 V film (output — HR-8: 1000 V = 83%)", price1k: 125, alt: "—" },
  { m: /^CX1\d$/, mpn: "X1-2u2-530", mfr: "Faratronic/Songtian", desc: "X1 2.2 µF 530 VAC (delta across 475 VAC line-line — CB-1; inter-CMC stage)", price1k: 62, alt: "Vishay 3386 X1" },
  { m: /^CX2\d$/, mpn: "X1-4u7-530", mfr: "Faratronic/Songtian", desc: "X1 4.7 µF 530 VAC (E43: 3rd-DM-stage cap upsized 2.2→4.7 µF — attenuation is L·C and the cap is the cheap half; X-bleed τ 0.66 s ≤ 1 s through the RNS star)", price1k: 110, alt: "Vishay 3386 X1 4.7µ" },
  { m: /^(CY(O)?[123]?|CPET)$/, mpn: "Y1-4n7-440", mfr: "Songtian/Faratronic", desc: "Y1 4.7 nF 440 VAC (L-PE / output-PE / DGND-PE — MR-4; DC use verify O-7)", price1k: 16, alt: "TDK CD series" },
  { m: /^C\w+SN$/, mpn: "C1812-100p-1k", mfr: "any MLCC", desc: "100 pF 1 kV C0G 1812 (Vienna snubber, E28 re-size: CV²f = 0.86 W)", price1k: 7, alt: "film 630V" },
  { m: /^CCLA$/, mpn: "PP-10n-1200", mfr: "Faratronic", desc: "10 nF 1200 V film (aux RCD clamp)", price1k: 9, alt: "MLCC 1kV ×2" },
  { m: /^C[ABC]\d+C$/, mpn: "FILM-100n-250", mfr: "Faratronic", desc: "100 nF 250 V film (Vienna RCD clamp)", price1k: 18, alt: "MLCC 250V" },
  { m: /^CAUX(24|15)$/, mpn: "EL-220u-35", mfr: "Aishi", desc: "220 µF 35 V", price1k: 4, alt: "any" },
  { m: /^CVCC$/, mpn: "EL-220u-35", mfr: "Aishi", desc: "220 µF 35 V (controller VCC cold-start reservoir — CB-5/R6-G: D-version needs ≥67 µF through soft-start before the aux winding takes over)", price1k: 4, alt: "any" },
  { m: /^C3V3$/, mpn: "MLCC-10u-0805", mfr: "any", desc: "10 µF 0805", price1k: 1.2, alt: "any" },
  { m: /^C[ABC]\d+GBL$/, mpn: "MLCC-47p-0603", mfr: "any", desc: "47 pF 0603 C0G (DESAT blank, Vienna hard turn-on — E60: NSI66x1A worst response 2.21 µs vs the 4.2 µs SCWT class, ≥0.8 µs blank)", price1k: 0.4, alt: "any C0G" },
  { m: /^C\d[HL]BL$/, mpn: "MLCC-22p-0603", mfr: "any", desc: "22 pF 0603 C0G (DESAT blank, LLC ZVS turn-on — E60: 1.44 µs vs the 2 µs discrete-SiC SCWT class; the 100 pF computed 3.39 µs)", price1k: 0.4, alt: "any C0G" },
  { m: /^C\w*B[12]$/, mpn: "MLCC-1u-0805", mfr: "any", desc: "1 µF 0805 (driver bias)", price1k: 0.8, alt: "any" },
  { m: /^C(PFC|LLC)D\d$/, mpn: "MLCC-100n-0402", mfr: "any", desc: "100 nF 0402 decoupling", price1k: 0.3, alt: "any" },
  { m: /^C(5B\w+|SHB|CB5)$/, mpn: "MLCC-1u-0805", mfr: "any", desc: "1 µF 0805 bulk on module-fed floating rails (R5-C: Bias5/shunt-amp/CAN 5 V)", price1k: 0.8, alt: "any" },
  { m: /^CCSF$/, mpn: "MLCC-100p-0603", mfr: "any", desc: "100 pF 0603 C0G ±5 % (aux CS filter — E65: 1 k ∥ 26.5 k ramp R → 96 ns lag; the 470 pF X7R part let the limit overshoot 1.5 A at 860 V)", price1k: 0.5, alt: "any C0G" },
  { m: /^C[A-Z0-9]+$/, mpn: "MLCC-small", mfr: "any", desc: "filter/decoupling MLCC 0402–0805", price1k: 0.5, alt: "any" },
  // --- resistors (power/pulse/precision first, catch-all last)
  { m: /^RPRE[12]$/, mpn: "CER-25W-33R-AX", mfr: "TE/local", desc: "33 Ω 25 W ceramic pulse resistor, axial (AC precharge; R5-G: the ohms now live in the ORDER CODE — a class-only p/n let purchasing buy any value; HR-14: pulse energy scales ×3.6 with SKU C — 50 W variant per-SKU via skuOverride; T-05)", price1k: 28, alt: "SQP25 33R" },
  { m: /^RDIS\d$/, mpn: "CER-25W-160R-AX", mfr: "TE/local", desc: "160 Ω 25 W ceramic pulse resistor, axial (bus discharge string 4× in series; R5-G value-carrying order code; HR-14/T-05 as above)", price1k: 28, alt: "SQP25 160R" },
  { m: /^RBD[AB]\d$/, mpn: "CER-2k2-10W-AX", mfr: "TE/local", desc: "2.2 kΩ 10 W wirewound axial (bank bleeder chain, HR-15 — ≤65 J/pulse at 120 kW, τ 4–17 s to <60 V)", price1k: 14, alt: "SQP10" },
  { m: /^RPRE[AB]$/, mpn: "SQP-10R-25W", mfr: "local", desc: "10 Ω 25 W wirewound pulse, axial (bank pre-insertion — HR-12: 94 J single-fault case)", price1k: 24, alt: "—" },
  { m: /^(RBAL[TB]\w*|RNS[123][AB])$/, mpn: "R2512-47k-HV-AS", mfr: "KOA/UniOhm", desc: "47 kOhm 2512 2 W anti-surge HV, Umax >= 250 V, 2-series per position (R3: 1.04 W worst case; a 1 W 2512 has sqrt(P*R)=217 V < 220 V at +10% bus) (HR-20: halves per-element V and W — ≤208 V / ≤0.92 W continuous)", price1k: 4, alt: "any HV 2512" },
  { m: /^R\w*SN$/, mpn: "R2512-10R-2W", mfr: "any", desc: "10 Ω 2512 2 W (Vienna snubber — E28: 0.86 W actual)", price1k: 6, alt: "any" },
  { m: /^RCLA[123]$/, mpn: "R2512-11k-2W-AS", mfr: "KOA/UniOhm", desc: "11 kΩ 1 % 2512 2 W anti-surge, ≥200 V working (aux RCD clamp 3-series = 33 k — E65: ≤0.94 W/part at full load and 5 µH leakage, ≤158 V/part at the 860 V limit-current event) [est ₹4 @1k, same family as R2512-47k-HV-AS]", price1k: 4, alt: "any 2 W anti-surge 2512" },
  { m: /^R(AUXST[12]|BR1[AB])$/, mpn: "R2512-HV", mfr: "UniOhm", desc: "2512 HV-rated 1 % (aux startup/brown-in — 2-series per 860 V)", price1k: 2.5, alt: "any 500V-rated" },
  { m: /^RAUX24$/, mpn: "R2512-R05-1W-1%", mfr: "any current-sense", desc: "50 mΩ 1 % 1 W 2512 in the V24 distribution after CAUX24 (E65: holds a V24 hard-short loop ≥100 mΩ so the NCP1252D min-on-time ratchet stays ≤80 % of Bsat(130 °C) for the 10–20 ms before the fault latch; 0.29 W at 2.4 A) [est ₹3 @1k]", price1k: 3, alt: "any 2512 CS 1 W" },
  // card-split rescues — MUST precede the two catch-alls below them. The audit ran the DB regexes
  // against the drawn designators: RFLTC (4.7 k FLT pull-up) and RAGTC (0 Ω single-point ground
  // tie) matched the clamp-bleeder rule and became 470 Ω 10 W wirewounds; RPD0..4 (10 k card-way
  // pull-downs, the E27 default-OFF state) matched the HV-divider rule and became 475 k 1206 HV.
  { m: /^R(FLTC|AGTC)$/, mpn: "R-small", mfr: "any", desc: "card FLT wired-OR pull-up 4.7 k 0603 / AGND–DGND 0 Ω 0805 single-point tie (card-split rescue)", price1k: 0.4, alt: "any" },
  { m: /^RPDB?[0-9]$/, mpn: "R0603-10k", mfr: "any", desc: "10 kΩ 0603 card-interface pull-down (board-side default-OFF on GATE_EN/EN/DO ways — CARD_RULES/E27)", price1k: 0.3, alt: "any" },
  { m: /^R\w+C$/, mpn: "WW-470R-10W", mfr: "local/TE", desc: "470 Ω 10 W wirewound axial (Vienna clamp bleeder — HR-3/MR-19: 4.3 W worst-case at 43% of rating)", price1k: 22, alt: "SQP10" },
  { m: /^R\w+D[0-7]$/, mpn: "HV73-475k-1%", mfr: "KOA/UniOhm", desc: "475 kΩ 1206 1% anti-surge (HV divider — MR-3)", price1k: 1.4, alt: "any anti-surge 1%" },
  { m: /^R\w{2}DL$/, mpn: "R0805-prec-0.1%", mfr: "UniOhm", desc: "divider bottom 0.1% (6.8 k unipolar / 11.5 k AC)", price1k: 2.5, alt: "any 0.1%" },
  { m: /^RAUXCS$/, mpn: "R1206-R28-1%-0.5W", mfr: "any current-sense", desc: "0.28 Ω 1% 0.5 W 1206 current-sense (aux cycle-by-cycle limit — E65: with CCSF 100 pF the worst FCS margin at full load is 8 % and the limit flux 71 % of Bsat 130 °C; 0.19 W worst)", price1k: 2.5, alt: "any CS 1206" },
  { m: /^RPVL[AB]$/, mpn: "R2010-1k-0.75W-1%", mfr: "any thick-film", desc: "1 kΩ 0.75 W 2010, PV-driver LED feed (R8: ≥10 mA guaranteed-point drive held to the 13.5 V rail floor; 0.24 W worst = 31%)", price1k: 1.2, alt: "2× 510R 1206 series" },
  { m: /^RG([ABC]\d+[AB]|\d+[HL])[12]$/, mpn: "R0805-2R2", mfr: "any thick-film", desc: "per-device series gate R for paralleled SiC — BOTH branches incl. the original device (E41/E44 pairs; R5-E symmetry)", price1k: 0.5, alt: "any" },
  { m: /^R\w+(ON|OFF)$/, mpn: "R1206-RG-0.5W", mfr: "any thick-film HP", desc: "gate resistor 1206, 0.5 W-rated (4.7/2.2 Ω per E5/E6 — MR-16: LLC R_on dissipates ~0.2 W at 140 kHz; standard 0.25 W part runs 80%)", price1k: 2, alt: "2× 0805 parallel" },
  { m: /^R\w+GS$/, mpn: "R0805-10k", mfr: "any", desc: "10 kΩ gate-source", price1k: 0.5, alt: "any" },
  { m: /^R\d+CT$/, mpn: "R2512-1R00-1W-1%", mfr: "any", desc: "1.0 Ω 1% 1 W 2512 resonant-CT burden (E65: F.11 85 A pk = 2.50 V at the comparator, observable to 162 A — the internal-short race measured from the F.11 crossing peaks at 149 A, past the E60 1.2 Ω ceiling of 135 A; 47.9 A rms worst → 0.23 W. History: CB-16 2.0 Ω/70 A sat AT the 30 kW operating peak)", price1k: 3, alt: "2× 1206 2R0 parallel" },
  { m: /^R[ABC]\d+B$/, mpn: "R1206-22R-1%", mfr: "any", desc: "22 Ω line-CT burden 1% (E60: F.01 120 A pk = 2.71 V; observable to 184 A through the D1 soft-sat 3 µs race; 55 A rms → 0.48 V rms metering. History: R3 27 Ω saw only to 150 A)", price1k: 1.2, alt: "any" },
  { m: /^RSH?O$/, mpn: "SHUNT-50MV-100A", mfr: "Isabellenhütte-eq/local", desc: "manganin shunt, 50 mV @ 100 A (0.5 mΩ, Kelvin 4-terminal; R5-G: rated current now in the order code — per-SKU via skuOverride)", price1k: 120, alt: "local manganin" },
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
  // A connector PAIR is two different parts. One p/n for all three refs meant purchasing would
  // buy three headers and nothing mates (module-interconnect audit, 2026-09-08).
  { m: /^J[AB]$/, mpn: "CONN-CARD-88-H", mfr: "any 2×44 0.1in", desc: "88-way 2×44 2.54 mm card interface, PIN HEADER side (power board), keyed", price1k: 45, alt: "Samtec TSW-144-xx-x-D class" },
  { m: /^JCARD$/, mpn: "CONN-CARD-88-R", mfr: "any 2×44 0.1in", desc: "88-way 2×44 2.54 mm card interface, RECEPTACLE side (card), keyed, mates CONN-CARD-88-H", price1k: 75, alt: "Samtec SSW-144-xx-x-D class" },
  { m: /^DISP1$/, mpn: "LED-2DIG-0.56CC", mfr: "any", desc: "2-digit 7-seg 0.56\" common-cathode (HMI)", price1k: 18, alt: "any" },
  { m: /^SW[12]$/, mpn: "TACT-6x6", mfr: "any", desc: "tactile switch 6×6 (HMI; pinout pairing VERIFY at BOM freeze, MR-10)", price1k: 3, alt: "any" },
  { m: /^JSWD\w+$/, mpn: "HDR-1x5-2.54", mfr: "any", desc: "SWD/boot header (EOL programming — CB-13; LV-only test state §45)", price1k: 8, alt: "TC2030 pads" },
  { m: /^J(ACL\d|PE|PEB|DCP|DCN|OUTP|OUTN|QDIS)?$/, mpn: "STUD-M8", mfr: "local", desc: "M8 stud terminal", price1k: 28, alt: "M6 for signal PE" },
  { m: /^JIC[AB]$/, mpn: "MICROFIT3-40", mfr: "Molex 43045-40 class (2x20)", desc: "40-way inter-board harness header, 5 A/contact (E40: the PFC bundle crosses here — PWM x3, 12 senses, AVMID+Kelvin, fans, precharge, EN/GATE_EN_A/FLT/DRV_RDY, V15/V24, 5 returns, shield)", price1k: 72, alt: "JST VL / TE MicroMate 40" },
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
    LDM1: { price1k: 300, note: "D6-30 rev C: 2x T48 60u N=7, foil 20 mm2 — 7.4 uH @82 A pk (floor 7.0), 2.4 W [engine]", mpn: "DM-CHOKE-30" }, LDM2: { price1k: 300, mpn: "DM-CHOKE-30" }, LDM3: { price1k: 300, mpn: "DM-CHOKE-30" },
    CMC1: { price1k: 240, note: "D7 60 A winding (10 mm² foil)" }, CMC2: { price1k: 240 },
    RSHO: { price1k: 120 },
  },
  // E41 40 kW hot variant — engine-driven (design-basis/loss-budget rev E41): line 73.3 A worst.
  "40kw": {
    // stress-audit: 100 A x 0.72 enclosed-derate = 72 A < 73.3 A worst — the exact E35/F6 failure
    // class. 125 A (existing family part) derates to 90 A: 23% margin.
    "F1": { price1k: 210, mpn: "FUSE-gG-690V-125A" }, "F2": { price1k: 210, mpn: "FUSE-gG-690V-125A" }, "F3": { price1k: 210, mpn: "FUSE-gG-690V-125A" },
    KOUT: { price1k: 460 }, KSER: { price1k: 460 }, KPARA: { price1k: 460 }, KPARB: { price1k: 460 },
    KPRE1: { price1k: 300, note: "100 A class (73 A line)", mpn: "HF167F-100A-M" }, KPRE2: { price1k: 300, mpn: "HF167F-100A-M" },
    LDM1: { price1k: 465, note: "D6-40 rev C: 2x T57 60u N=8, 26.4 mm2 — 10.5 uH @109 A pk (floor 9.2), 4.4 W [engine]", mpn: "DM-CHOKE-40" }, LDM2: { price1k: 465, mpn: "DM-CHOKE-40" }, LDM3: { price1k: 465, mpn: "DM-CHOKE-40" },
    CMC1: { price1k: 290, note: "D7-40 custom wind 75 A (the Schaffner 63 A catalog part is OUT of range here)", mpn: "CMC-3PH-2mH-SKU" }, CMC2: { price1k: 290, mpn: "CMC-3PH-2mH-SKU" },
    RSHO: { price1k: 140, mpn: "SHUNT-50MV-133A" },
    // D1-40 rev B (E51): the E41 selection (N=23/L0 113) came from the engine's GEOMETRIC core
    // model (Ae 2.62) — on the CATALOG 0077908A7 (AL 37 +/-8%, Ae 2.27, the E35-pinned data) it
    // computes L0 98 uH and 55 uH @104 A pk, missing its own 64 uH floor and inflating dIpp to
    // 32 A (the D6/LISN ripple basis). Re-issued: 5-stack, N=26 +/-1 lot-trim -> L0 116 uH
    // [106-135 lot window], >=61 uH @104 A pk, dIpp 27.5 A nom, dT 30 K, fill 36%.
    LA0: { price1k: 1240, mpn: "IND-PFC-116u-40", note: "D1-40 rev B: 5x 0077908A7 CATALOG core, N=26 +/-1 lot-trim (E51)" },
    LB0: { price1k: 1240, mpn: "IND-PFC-116u-40" }, LC0: { price1k: 1240, mpn: "IND-PFC-116u-40" },
    // D2-40 rev D (E60): 1x E70/33/32 (the D3-40 core material, single-set former B66372B1000T001), N=5,
    // bins 3.2/3.5/3.8 uH by distributed gap grind (AL 128/140/152 nH/T2), litz 4150x0.071 (16.4 mm2).
    // The E43 PQ50/N=5/2000x0.1 route computed Sullivan Fr 4.3 -> 13.6 W Cu at the SER corner
    // (the DC x1.15 model called it 4.3 W): proximity scales (N n)^2 / b^2 — fewer turns, taller window.
    L1T: { price1k: 1124, mpn: "IND-TRIM-E70-40", note: "D2-40 rev E (E65): 2x E70/33/32 N=5 on B66372B2000, bins 5.85/6.0/6.15/6.3 uH, litz 8149x0.05 (16.0 mm2), distributed gap, VPI, both yoke faces padded + cutout — carries ~all of Lr (real D3 leakage 0.16 uH). Envelope: ~20 W Fe + 10 W Cu at SER250, 93 C at 55 C inlet; fault flux 150 mT. ₹1,124 E65 roll-up [est]" },
    L2T: { price1k: 1124, mpn: "IND-TRIM-E70-40" }, L3T: { price1k: 1124, mpn: "IND-TRIM-E70-40" },
    // resonant caps: 6x33 nF per section (per-cap ~10.2 A vs the 12 A line — 15% margin)
    "C1R0": { mpn: "PP-33n-1200V" }, "C1R1": { mpn: "PP-33n-1200V" }, "C1R2": { mpn: "PP-33n-1200V" }, "C1R3": { mpn: "PP-33n-1200V" }, "C1R4": { mpn: "PP-33n-1200V" }, "C1R5": { mpn: "PP-33n-1200V" }, "C2R0": { mpn: "PP-33n-1200V" }, "C2R1": { mpn: "PP-33n-1200V" }, "C2R2": { mpn: "PP-33n-1200V" }, "C2R3": { mpn: "PP-33n-1200V" }, "C2R4": { mpn: "PP-33n-1200V" }, "C2R5": { mpn: "PP-33n-1200V" }, "C3R0": { mpn: "PP-33n-1200V" }, "C3R1": { mpn: "PP-33n-1200V" }, "C3R2": { mpn: "PP-33n-1200V" }, "C3R3": { mpn: "PP-33n-1200V" }, "C3R4": { mpn: "PP-33n-1200V" }, "C3R5": { mpn: "PP-33n-1200V" },
    // resonant CT: AS-404 (50 A) would run 122% at 61 A rms — RFQ the 80 A class before EVT
    CT1: { mpn: "CT-RES-1:100-80A", note: "RFQ upsize (Talema AS class); AS-404 stays the 30 kW part — E60 catalog note: AS-407 (1:500, 80 A, same case/Ø8) fits with a 5× burden (4.55 Ω)" },
    // E60 current coordination: F.11 115 A pk on 0.91 Ω (observable to 178 A); F.01 155 A pk on 18 Ω
    // (observable to 225 A) — the ACX-1100 is linear only to ~179 A at 18 Ω, so the 40 kW joins the
    // 150 A line-CT class (Talema ACX-1150, linear to 200 A at 33 Ω)
    R1CT: { mpn: "R2512-0R82-1W-1%", note: "E65: F.11 115 A pk = 2.59 V, ceiling 198 A vs the 180 A crossing-referenced race (E60 0.91 Ω: 178 A); 64.4 A rms → 0.34 W" }, R2CT: { mpn: "R2512-0R82-1W-1%" }, R3CT: { mpn: "R2512-0R82-1W-1%" },
    CTA0: { price1k: 95, mpn: "CT-LINE-2500-150A", note: "E60: 150 A class (ACX-1150) — F.01 155 A + 50 A race needs linearity to ≥205 A" }, CTB0: { price1k: 95, mpn: "CT-LINE-2500-150A" }, CTC0: { price1k: 95, mpn: "CT-LINE-2500-150A" },
    RA0B: { mpn: "R1206-18R-1%", note: "E60: F.01 155 A pk = 2.77 V, ceiling 225 A" }, RB0B: { mpn: "R1206-18R-1%" }, RC0B: { mpn: "R1206-18R-1%" },
    CT2: { mpn: "CT-RES-1:100-80A" }, CT3: { mpn: "CT-RES-1:100-80A" },
    // D3-40 identity (registered at E41, BOM identity landed at E42 close): the 40 kW transformer
    // is the 2x E70/33/32 stack — WINDOW-driven, volt-second-identical, same price basis as the
    // 3x PQ50 drawing until the winder RFQ splits them.
    T1: { price1k: 1279, mpn: "XFMR-LLC-2E70-40", note: "D3-40 rev C (E65): 2x E70/33/32 sets on B66372B2000T001, 6:6:6, TIW-served litz 3486x0.071 + Cu foil 0.127 x 28 mm, S1-P-S2 — construction unchanged from E60; E65 adds VPI, both yoke faces padded to the webs, end turns potted to the web and the 130 C cutout (the power-solved 525 V-bank corner puts B 176 mT / Fe 37 W: runaway in air; 97 C winding hot-spot as built); leakage 0.16 uH computed (the E51 3 uH target was unreachable). ₹1,279 E65 roll-up [est]" },
    T2: { price1k: 1279, mpn: "XFMR-LLC-2E70-40" }, T3: { price1k: 1279, mpn: "XFMR-LLC-2E70-40" },
  },
  // E42 50 kW LIQUID variant — engine-driven (pfc-design @PFC_P=50e3/PFC_PAR=2, frozen 50 kHz;
  // envelope grid at plate Rth 1.1 K/W / 65 C hot plate ref): line 91.6 A worst, output 167 A,
  // tank 77.3 A rms per section. SAME silicon as the 40 kW (paralleled PFC pairs, single LLC
  // FETs) — the coldplate is what buys that. Protection classes rev: see each note.
  "50kw": {
    // stress rule (E35/F6, 0.72x enclosed derate): 125 A -> 90 A < 91.6 A worst — FAILS by the
    // same class E41 caught at 100 A. 160 A gG derates to 115 A (26% margin). Frame steps
    // 22x58 -> NH00 (mech line carries the holder).
    "F1": { price1k: 260, mpn: "FUSE-gG-690V-160A" }, "F2": { price1k: 260, mpn: "FUSE-gG-690V-160A" }, "F3": { price1k: 260, mpn: "FUSE-gG-690V-160A" },
    // K_OUT carries full output current in BOTH modes: 167 A = 84% of one 200 A class -> DUAL
    // (KOUT2 is a real schematic instance, series-mirror readback — the 120 kW HR-19 pattern).
    // KSER (SER-mode <=100 A = 50%) and KPARA/B (per-bank <=84 A = 42%) stay single.
    KOUT: { price1k: 460, note: "2x 200 A paralleled (dual instance, E42)" }, KOUT2: { price1k: 460 },
    KSER: { price1k: 460 }, KPARA: { price1k: 460 }, KPARB: { price1k: 460 },
    // precharge bypass: 120 A class = 76% of class at 91.6 A — over the 75% line. Next existing
    // family part is the 250 A frame (37%); no new p/n invented.
    KPRE1: { price1k: 520, note: "250 A class (91.6 A line = 37%)", mpn: "HF167F-250A-M" }, KPRE2: { price1k: 520, mpn: "HF167F-250A-M" },
    LDM1: { price1k: 630, note: "D6-50 rev C: 3x T57 60u N=8, 26.4 mm2 — 12.9 uH @136 A pk (floor 11.4), 8.1 W [engine]", mpn: "DM-CHOKE-50" }, LDM2: { price1k: 630, mpn: "DM-CHOKE-50" }, LDM3: { price1k: 630, mpn: "DM-CHOKE-50" },
    CMC1: { price1k: 340, note: "D7-50 custom wind 95 A", mpn: "CMC-3PH-2mH-SKU" }, CMC2: { price1k: 340, mpn: "CMC-3PH-2mH-SKU" },
    RSHO: { price1k: 155, mpn: "SHUNT-50MV-167A" },
    // pulse energy (E43 check): per-resistor 162 J discharge / ~211 J precharge at the 16-can link
    // CROSS the highest 25 W-accepted family point (158 J @40 kW) -> the existing 50 W class part
    RPRE1: { price1k: 45, note: "50 W pulse class (E43: ~211 J/event at 1.88 mF link)", mpn: "CER-50W-33R-AX" }, RPRE2: { price1k: 45, mpn: "CER-50W-33R-AX" },
    RDIS0: { price1k: 45, note: "50 W pulse class (E43: 162 J each at 1.88 mF link)", mpn: "CER-50W-160R-AX" }, RDIS1: { price1k: 45, mpn: "CER-50W-160R-AX" }, RDIS2: { price1k: 45, mpn: "CER-50W-160R-AX" }, RDIS3: { price1k: 45, mpn: "CER-50W-160R-AX" },
    // D1-50 rev B (E51): the E42 selection (N=22/L0 103) was geometric-core output — on the
    // CATALOG 0077908A7 it computes 90 uH / 44 uH @129.5 A and over-runs the ripple basis; no N
    // on the 5-stack holds BOTH the 34.8 A pp basis and the 0.40 swing floor at catalog AL.
    // Re-issued at the honest point: N=24 +/-1 lot-trim -> L0 107 uH [98-124], >=45 uH
    // @129.5 A pk, dIpp basis RESTATED 36.2 A pp nom (D6-50 equal-margin floor restates to
    // 11.8 uH — the built D6-50 delivers 12.9, LISN margin stays >= +5.2 dB), swing 0.405,
    // dT 41 K convective (plate/web bond per E42/E44 practice).
    LA0: { price1k: 1240, mpn: "IND-PFC-107u-50", note: "D1-50 rev B: 5x T79 26u CATALOG core, N=24 +/-1 lot-trim (E51)" },
    LB0: { price1k: 1240, mpn: "IND-PFC-107u-50" }, LC0: { price1k: 1240, mpn: "IND-PFC-107u-50" },
    // D2-50 rev E (E65): 2x E70/33/32, N=5, bins 5.35/5.5/5.65/5.8 uH, litz 8149x0.05 — the E60 N=3 part was sized
    // for a 3 uH transformer leakage that does not exist (0.15 uH real), so it would have left Lr ~2.9 uH short.
    L1T: { price1k: 1124, mpn: "IND-TRIM-E70-50", note: "D2-50 rev E (E65): 2x E70/33/32 N=5 on B66372B2000, bins 5.35/5.5/5.65/5.8 uH, litz 8149x0.05 (16.0 mm2), distributed gap, VPI, both yoke faces padded (plates / webs), end turns potted on the liquid SKU + cutout. Envelope: ~26 W Fe + 15 W Cu at SER250, 84 C (liquid) / 101 C (air) at 55 C inlet; fault flux 166 mT; one drawing serves liquid AND air. ₹1,124 E65 roll-up [est]" },
    L2T: { price1k: 1124, mpn: "IND-TRIM-E70-50" }, L3T: { price1k: 1124, mpn: "IND-TRIM-E70-50" },
    // resonant caps: 8x27 nF per section (77.3 A rms / 8 = 9.7 A of the 12 A line)
    "C1R0": { mpn: "PP-27n-1200V" }, "C1R1": { mpn: "PP-27n-1200V" }, "C1R2": { mpn: "PP-27n-1200V" }, "C1R3": { mpn: "PP-27n-1200V" }, "C1R4": { mpn: "PP-27n-1200V" }, "C1R5": { mpn: "PP-27n-1200V" }, "C1R6": { mpn: "PP-27n-1200V" }, "C1R7": { mpn: "PP-27n-1200V" },
    "C2R0": { mpn: "PP-27n-1200V" }, "C2R1": { mpn: "PP-27n-1200V" }, "C2R2": { mpn: "PP-27n-1200V" }, "C2R3": { mpn: "PP-27n-1200V" }, "C2R4": { mpn: "PP-27n-1200V" }, "C2R5": { mpn: "PP-27n-1200V" }, "C2R6": { mpn: "PP-27n-1200V" }, "C2R7": { mpn: "PP-27n-1200V" },
    "C3R0": { mpn: "PP-27n-1200V" }, "C3R1": { mpn: "PP-27n-1200V" }, "C3R2": { mpn: "PP-27n-1200V" }, "C3R3": { mpn: "PP-27n-1200V" }, "C3R4": { mpn: "PP-27n-1200V" }, "C3R5": { mpn: "PP-27n-1200V" }, "C3R6": { mpn: "PP-27n-1200V" }, "C3R7": { mpn: "PP-27n-1200V" },
    // tank protection class rev (E42): envelope ceiling 65 A pk / OC 95 A pk (same 0.68 ratio as
    // the frozen 48/70) — resonant CT to the 100 A class (77.3 rms = 77%, same class use as E41's
    // 80 A pick); 2.0 ohm burden unchanged (95 A pk -> 1.9 V at the comparator, inside the rail)
    CT1: { mpn: "CT-RES-1:100-100A", note: "E42 class rev (Talema AS class RFQ); E60: F.11 145 A pk on 0.75 R = 2.74 V, observable to 216 A through the simulated race" },
    CT2: { mpn: "CT-RES-1:100-100A" }, CT3: { mpn: "CT-RES-1:100-100A" },
    // resonant burden re-scale: 1.6 ohm on a 2 W 2512 (0.96 W worst = 48%; the 1 W frozen part
    // would run 96% at 77.3 A rms) — metering signal identical to the 40 kW (1.24 V rms)
    R1CT: { mpn: "R2512-0R68-2W-1%", note: "E65: F.11 145 A pk = 2.64 V, ceiling 238 A vs the 216 A crossing-referenced race (E60 0.75 Ω: 216 A, 0.2 % margin); 80.9 A rms → 0.45 W on the 2 W class" },
    R2CT: { mpn: "R2512-0R68-2W-1%" }, R3CT: { mpn: "R2512-0R68-2W-1%" },
    // line CTs: ACX-1100 (100 A) would run 92% at 91.6 A rms — class up at RFQ (sensor path)
    CTA0: { price1k: 95, mpn: "CT-LINE-2500-150A", note: "150 A class (Talema ACX-1150 catalog, linear to 200 A at 33 R); E60: F.01 195 A pk on 13 R = 2.66 V, observable to 311 A through the D1 soft-sat race" },
    CTB0: { price1k: 95, mpn: "CT-LINE-2500-150A" }, CTC0: { price1k: 95, mpn: "CT-LINE-2500-150A" },
    RA0B: { mpn: "R1206-13R-1%", note: "E60 line-CT burden (F.01 195 A pk; the E42 21.5 R saw only to 187 A)" },
    RB0B: { mpn: "R1206-13R-1%" }, RC0B: { mpn: "R1206-13R-1%" },
    // D3-50 rev C (E65): 3x E70/33/32 per section at 5:5:5 — the E51 2-set part ran B 237 mT / Fe 79 W at the
    // simulated 525 V-bank corner and had no thermal equilibrium even plate-bonded; +50 % Ae brings it to 158 mT / 38 W.
    T1: { price1k: 1649, mpn: "XFMR-LLC-3E70-50", note: "D3-50 rev C (E65): 3x E70/33/32 sets on a 3-set coil former (lN 293 mm; custom — TDK lists 1/2-set only, tooling amortised in the price), 5:5:5, TIW-served litz 4370x0.071 + Cu foil 0.127 x 28 mm, S1-P-S2 (window fill unchanged from the 2-set 5:5:5, 91 %), Lm 63 uH +/-7 %, VPI, BOTH yoke faces padded to the plates/webs + end turns potted (MANDATORY) + 130 C cutout. Envelope: Fe 38 W (158 mT), Cu 46 W at SER250, winding hot-spot 88 C (liquid plate 65 C) / 101 C (air), B 41 % of hot Bsat. ₹1,649 E65 roll-up [est]" },
    T2: { price1k: 1649, mpn: "XFMR-LLC-3E70-50" }, T3: { price1k: 1649, mpn: "XFMR-LLC-3E70-50" },
  },
  // E44 50 kW AIR variant: every electrical class IDENTICAL to the liquid 50 kW (same line/tank/
  // output currents — the classes were set by current, not by coolant). Assigned programmatically
  // below (skuOverrides["50kwa"] = { ...skuOverrides["50kw"] }) so the two can never drift.
  // E50: the 60/120 kW single-board override blocks are retired with their reference boards
  // (recoverable on branch archive/pre-focus-E49); 60–150 kW products are cabinets of the four
  // module SKUs and cost as module roll-ups in bom-gen.
};

skuOverrides["50kwa"] = { ...skuOverrides["50kw"] };   // E44: air-50 shares every class part with the liquid

// E23 custom bias transformer: RETIRED (rev D, 10k-volume decision — E23 rev B). At 10k
// modules/yr the QA01C-class module lands ≤₹55 (p10k), making the custom multi-secondary
// transformer's net saving ≈ ₹0 against real EMC (C_io), winding-house and second-source risk.
// Modules are the permanent production architecture; D5 drawing cancelled.
export const biasCommon = { desc: 'BIAS-XFMR multi-secondary set (E23) — RETIRED at 10k volume (modules permanent, E23 rev B)', price1k: 0 };
export const mechLines = {
  "30kw": [
    ["PCB-ACDC 6L 420×300", 1, 1200], ["PCB-DCDC 6L 460×320", 1, 1400],
    ["Heatsink extrusions (2, sandwich outer faces)", 1, 1500], ["Fans 120×38 PWM (3.3 V-PWM p/n, dual-ball-bearing, L10 ≥70 kh @40 °C, IP55, −30…+70 °C — E52/E60 field-reliability spec; IP55 premium at RFQ)", 2, 280],
    ["Enclosure sheet metal + hardware", 1, 1000], ["Busbars/interconnect studs + harness (busbar-calc)", 1, 724],
    ["NTC sensor assemblies (insulated tip spec, E25)", 4, 18], ["TIM/insulators/fasteners", 1, 350],
    ["Magnetics over-temperature cutout loop (E65): NC hermetic snap-action thermostat 130 ±5 °C, gold dry-circuit contacts, reinforced-insulated case + leads, one per D3 and D2, series-wired into the T_XFMR NTC loop (open loop → firmware OT trip)", 6, 48],
    ["Magnetics bond kit (E65): 3 W/mK silicone gap pads on BOTH yoke faces of every D3/D2 to the upper/lower extrusion webs + clamp bars, CTE-compliant (no rigid epoxy to aluminium); VPI is in the part price", 1, 350],
    ["D1 choke mount kit (E65 D1): per stack — fiberglass-reinforced silicone gap pad 1.0 mm ≥3 W/mK (≥5 kVAC ASTM D149, basic insulation to the PE-bonded web), GF-PPS insulating clamp cap + bore sleeve (basic insulation winding↔bolt), M6 A4 bolt + Belleville + nut, 2-point glass banding; the bonded end face is the D1 cooling path [est: pad ₹45, cap+sleeve ₹42, hardware+banding ₹18]", 3, 105],
    ["Conformal coating (acrylic, both boards + card — E52/A11 rev B baseline)", 1, 320],
    ["Assembly + calibration + EOL test", 1, 1900],
  ],
  // E41 40 kW: same envelope; +1 fan, heavier busbars/heatsink share, 2 extra link cans in PCB area
  "40kw": [
    ["PCB-ACDC 6L 440×500", 1, 1250], ["PCB-DCDC 6L 440×500", 1, 1450],
    ["Heatsink extrusions (2, sandwich outer faces — 40 kW fin stock)", 1, 1750],
    ["Fans 120×38 PWM (3.3 V-PWM p/n, dual-ball-bearing, L10 ≥70 kh @40 °C, IP55, −30…+70 °C — E52/E60 field-reliability spec; IP55 premium at RFQ)", 3, 280],
    ["Enclosure sheet metal + hardware", 1, 1000], ["Busbars/interconnect studs + harness (busbar-calc)", 1, 810],
    ["NTC sensor assemblies (insulated tip spec, E25)", 4, 18], ["TIM/insulators/fasteners", 1, 380],
    ["Magnetics over-temperature cutout loop (E65): NC hermetic snap-action thermostat 130 ±5 °C, gold dry-circuit contacts, reinforced-insulated case + leads, one per D3 and D2, series-wired into the T_XFMR NTC loop (open loop → firmware OT trip)", 6, 48],
    ["Magnetics bond kit (E65): 3 W/mK silicone gap pads on BOTH yoke faces of every D3/D2 to the upper/lower extrusion webs + clamp bars, D3 end turns potted to the web (≥0.8 W/mK silicone), CTE-compliant; VPI is in the part price", 1, 620],
    ["D1 choke mount kit (E65 D1): per stack — fiberglass-reinforced silicone gap pad 1.0 mm ≥3 W/mK (≥5 kVAC ASTM D149, basic insulation to the PE-bonded web), GF-PPS insulating clamp cap + bore sleeve (basic insulation winding↔bolt), M6 A4 bolt + Belleville + nut, 2-point glass banding; the bonded end face is the D1 cooling path [est: pad ₹45, cap+sleeve ₹42, hardware+banding ₹18]", 3, 105],
    ["Conformal coating (acrylic, both boards + card — E52/A11 rev B baseline)", 1, 340],
    ["Assembly + calibration + EOL test", 1, 1950],
  ],
  // E42 50 kW LIQUID: same 440x500 envelope; coldplates REPLACE the extrusions AND the fans
  // (sealed module). Coldplate pricing is the thermal-RFQ estimate (brazed/FSW channel plate at
  // 10k/yr) — flagged REVIEW like the other custom lines. EOL adds the pressure/leak test.
  "50kw": [
    ["PCB-ACDC 6L 440×500 (50 kW copper masses)", 1, 1300], ["PCB-DCDC 6L 440×500", 1, 1500],
    ["Liquid coldplates (2, sandwich outer faces, brazed channel — REVIEW at thermal RFQ)", 1, 4400],
    ["Coolant fittings: 2× quick-disconnect + internal manifold/hose set", 1, 380],
    ["Gap pads + potting (choke stacks / transformers / EMI magnetics → plate webs)", 1, 420],
    ["Magnetics two-face plate bond (E65): gap pads on BOTH yoke faces of every D3/D2 to the two coldplates, D3/D2 end turns potted to the plate (adds to the E42 potting line); VPI is in the part price", 1, 330],
    ["Enclosure sheet metal + hardware (sealed, gasket set; NH00 fuse bases)", 1, 1250],
    ["Busbars/interconnect studs + harness (busbar-calc, 167 A output class)", 1, 850],
    ["NTC sensor assemblies (insulated tip spec, E25 — plate-mounted)", 4, 18],
    ["Magnetics over-temperature cutout loop (E65): NC hermetic snap-action thermostat 130 ±5 °C, gold dry-circuit contacts, reinforced-insulated case + leads, one per D3 and D2, series-wired into the T_XFMR NTC loop (open loop → firmware OT trip)", 6, 48],
    ["D1 choke mount kit (E65 D1): per stack — gap pad in the E42 plate-web line above; GF-PPS insulating clamp cap + bore sleeve (basic insulation winding↔bolt), M6 A4 bolt + Belleville + nut, 2-point glass banding; the bonded end face is the D1 cooling path [est: pad ₹45, cap+sleeve ₹42, hardware+banding ₹18]", 3, 60],
    ["D1 over-temperature cutout (E65 D1): NC snap-action thermostat 130 ±5 °C on each D1 clamp cap, basic-insulated to line potential, series-wired into the magnetics cutout loop — bond-loss cover in the sealed liquid module (no air path: a lost D1 pad has no fallback)", 3, 48],
    ["TIM/insulators/fasteners", 1, 420],
    ["Conformal coating (acrylic, both boards + card — E52/A11 rev B baseline)", 1, 360],
    ["Assembly + calibration + EOL test (incl. coolant-loop pressure/leak test)", 1, 2150],
  ],
  // E44 50 kW AIR: extrusions + 4 fans replace the coldplate set; vented enclosure; same PCBs
  "50kwa": [
    ["PCB-ACDC 6L 440×500 (50 kW copper masses)", 1, 1300], ["PCB-DCDC 6L 440×500", 1, 1500],
    ["Heatsink extrusions (2, sandwich outer faces — 50 kW fin stock)", 1, 1900],
    ["Fans 120×38 PWM (3 front + 1 rear, 3.3 V-PWM p/n, dual-ball L10 ≥70 kh, IP55, −30…+70 °C — E52/E60; IP55 premium at RFQ)", 4, 280],
    ["Enclosure sheet metal + hardware (vented; NH00 fuse bases)", 1, 1000],
    ["Busbars/interconnect studs + harness (busbar-calc, 167 A output class)", 1, 850],
    ["NTC sensor assemblies (insulated tip spec, E25)", 4, 18],
    ["Magnetics over-temperature cutout loop (E65): NC hermetic snap-action thermostat 130 ±5 °C, gold dry-circuit contacts, reinforced-insulated case + leads, one per D3 and D2, series-wired into the T_XFMR NTC loop (open loop → firmware OT trip)", 6, 48],
    ["Magnetics bond kit (E65): 3 W/mK silicone gap pads on BOTH yoke faces of every D3/D2 to the upper/lower extrusion webs + clamp bars, D3 end turns potted to the web (≥0.8 W/mK silicone), CTE-compliant; VPI is in the part price", 1, 620],
    ["D1 choke mount kit (E65 D1): per stack — fiberglass-reinforced silicone gap pad 1.0 mm ≥3 W/mK (≥5 kVAC ASTM D149, basic insulation to the PE-bonded web), GF-PPS insulating clamp cap + bore sleeve (basic insulation winding↔bolt), M6 A4 bolt + Belleville + nut, 2-point glass banding; the bonded end face is the D1 cooling path [est: pad ₹45, cap+sleeve ₹42, hardware+banding ₹18]", 3, 105],
    ["TIM/insulators/fasteners", 1, 420],
    ["Conformal coating (acrylic, both boards + card — E52/A11 rev B baseline)", 1, 360],
    ["Assembly + calibration + EOL test", 1, 2000],
  ],
  // E50: 60/120 kW single-board mech lines retired (archive/pre-focus-E49) — cabinet products
  // carry their own adders in bom-gen/README-product-structure.
};
