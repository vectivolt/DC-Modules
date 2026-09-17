// Shared section map: which designators belong to which functional section.
// Extracted from schematic-export.mjs so the exporter and the composer cannot drift.
export const SECTIONS = {
  // The control card (E35): one card, both converter roles; single-segment target "control-card".
  "control-card": [
    ["MCU GD32G553VET7 & DECOUPLING", /^(UCARD|CCARDD\d|CCARDA[12]|CCARDVR|RCARDRST|FBCARDA|XCARD|CCARDX[12]|RCARDXF)$/],
    ["SWD + BOOT", /^(JSWDCARD|RCARDBOOT|CCARDRST)$/],
    ["SAFETY CHAIN (WD + AND)", /^(USUPCARD|UANDCARD|R(WPU|ENR|ENL|GPD|GPA|RDY|WDI|WDOL)CARD|CSFCARD|CWDCARD|CRSTCARD|CANDCARD|TPWDICARD)$/],
    ["FLT WIRED-OR + GROUND TIE", /^(RFLTC|CFLTC|RAGTC)$/],
    ["3V3 SYNC BUCK", /^(UBKCARD|LBKCARD|CBK[IO]CARD|CBSTCARD|RBKF[12]CARD)$/],
    ["ANALOG MID-RAIL", /^(RAV[HLIF]|CAV[MFO]|UAVB)$/],
    ["ROLE STRAPS", /^RROLE[01]$/],
    ["88-WAY INTERFACE", /^JCARD$/],
  ],
  acdc: [
    ["AC INPUT & PROTECTION", /^(JACL\d|JPE$|F[123]$|MOV[123]$|MOVP[123]$|GDT[123]$)/],
    ["EMI FILTER", /^(CMC[12]$|CX\d\d$|CY[1-6]$|LDM[123]$|[CR]DMP[123]$)/],
    ["PRECHARGE", /^(KPRE[12]$|RPRE[12]$|RKFBP$)/],
    ["LINE CTs", /^(CT[ABC]\d$|R[ABC]\d[BF]$|C[ABC]\dF$|D[ABC]\d[PN]$|CAVMA$)/],
    ["VIENNA PFC LANES", /^(?:L|Q|D|C|R|U|PS)[ABC]\d/],
    ["DC LINK", /^(CD[TB]\d|RBAL[TB]\d)/],
    ["BUS DISCHARGE", /^(RDIS\d|QDIS$|QDISF$|UQD$|PSQD$|RQD)/],
    ["ISOLATED HV SENSING", /^(RNS\d[AB]$|PS5(AC|BUS)$|UIV(V\d|BP|BM)$|R(V\d|BP|BM)D\d?L?$|C(V\d|BP|BM)DF$)/],
    ["ANALOG MID-RAIL & TEMP", /^(RAV[HLIF]$|CAV[MFO]$|UAVB$|[JRC]T(PFC|INL))/],
    ["CARD INTERFACE (88-WAY)", /^(JA|RPD\d|RROLE)$/],
    ["GROUND BONDS", /^(RPET|CPET)$/],
    ["AUX 110 W FLYBACK + 3V3 + RAIL MONITORS", /^(UAUX|QAUX|RAUX\w*|RCSF|CCSF|TAUX|DAUX\w*|CAUX\d\d|CVCC|DTVS\d\d|RBR\w+|RFB[12]|RCOMP|CCOMP|DCLA|CCLA|RCLA[123]|UBKA|LBKA|CBKIA|CBKOA|CBSTA|RBKF[12]A|RM(24|15)[AB]|CM(24|15)|RPL24)$/],
    ["COIL DRIVER", /^UPA$/],
    ["FANS", /^(JFAN\d|RFT\d|RFPD\d)$/],
    ["DC OUT + HARNESS", /^(JICA$|RA(LTX|LRX|LTS|LRS)$|JDCP$|JDCN$|JPEB$)/],
  ],
  dcdc: [
    ["BUS ENTRY & COMMUTATION FILMS", /^(JDCP$|JDCN$|JPEB$|CF\d+$|CFDMP$|RFDMP$)/],
    ["LLC FULL-BRIDGE LEGS", /^(Q\d+[HL]\d?$|U\d+[HL]$|PS\d+[HL]$|[RC]\d+[HL]\w*$|RG\d+[HL]\d$|D\d+[HL]S\d$)/],
    ["LLC TANK, TRANSFORMER CELLS & RECTIFIERS", /^(C\d+R\d+$|L\d+R$|T\d+[AB]$|D\d+[AB][1-4](P[23])?$|CT\d+$|R\d+C[TF]$|C\d+CF$|D\d+C[PN]$|U\d+W$|D\d+W$|C\d+WB$)/],
    ["BANK CAPACITORS & BALANCE", /^(CB[AB]\d+[TB]$|RBAL[TB][AB][12]$|CB[AB]F$)/],
    ["SERIES/PARALLEL MATRIX", /^(K(SER|PARA|PARB|OUT|PREA|PREB)2?$|RKPU|RPRE[AB]$)/],
    ["BANK BLEEDERS", /^(RBD[AB]\d$|QDIS[AB]$|UPV[AB]$|RPV[LB][AB]$)/],
    ["OUTPUT & SHUNT", /^(RSHO$|USHO$|PSSH$|COF[12]$|CYO[12]$|JOUTP$|JOUTN$)/],
    ["ISOLATED SENSING", /^(PS5BK[AB]$|UIVO[ABV]$|RO[ABV]D\d?L?$|CO[ABV]DF$)/],
    ["ANALOG MID-RAIL & TEMP", /^(RAV[HLIF]$|CAV[MFO]$|UAVB$|[JRC]T(LLC|XFR))/],
    ["CARD INTERFACE (88-WAY)", /^(JB|RPDB\d|RROLEB|CROLEB)$/],
    ["COIL DRIVER", /^ULB$/],
    ["ISOLATED CAN", /^(UCAN|PSCAN|LCAN|JCAN|RTERM|JTERM|TVSCAN|RCGB|CCGB)$/],
    ["CONFIG HMI", /^(DISP1|USR1|RSEG\d|QDIG[12]|RDIG[12]|SW[12]|RSW[12]|CSW[12]|CSR1|RHPD[12])$/],
    ["HARNESS", /^(JICB$|RB(LTX|LRX|LTS|LRS)$)/],
  ],
};

export const SHEET_TITLES = {
  "30kw/acdc": "DC-Modules 30 kW — AC-DC board (Vienna PFC)",
  "30kw/dcdc": "DC-Modules 30 kW — DC-DC board (full-bridge LLC)",
  "40kw/acdc": "DC-Modules 40 kW — AC-DC board (Vienna PFC)",
  "40kw/dcdc": "DC-Modules 40 kW — DC-DC board (full-bridge LLC)",
  "50kw/acdc": "DC-Modules 50 kW liquid — AC-DC board (Vienna PFC)",
  "50kw/dcdc": "DC-Modules 50 kW liquid — DC-DC board (full-bridge LLC)",
  "50kwa/acdc": "DC-Modules 50 kW air — AC-DC board (Vienna PFC)",
  "50kwa/dcdc": "DC-Modules 50 kW air — DC-DC board (full-bridge LLC)",
  "control-card": "DC-Modules — Control Card (GD32G553VET7, one card for both converter roles)",
};

// Which board this sheet is, and where it sits in the product set. Rendered into the title
// block so a sheet is self-identifying when printed on its own.
export const SHEET_IDENT = {
  "30kw/acdc":  { sku: "30 kW", board: "AC-DC (lower)", sheet: "1 of 3", cells: "Vienna PFC: 1x 750 V SiC die per position, D1 3x T79 N=39, 10-can link, 3 fans (E68/E69/E81)" },
  "30kw/dcdc":  { sku: "30 kW", board: "DC-DC (upper)", sheet: "2 of 3", cells: "full-bridge LLC: 1x SG2M023120LJ per position + 1 nF turn-off snubber, 7x33 nF + D2 rev F 5.00 uH, 2 cells, film banks 9x2.2 uF, DOUT (E67/E68)" },
  "40kw/acdc":  { sku: "40 kW", board: "AC-DC (lower)", sheet: "1 of 3", cells: "Vienna PFC: 1x 750 V SiC die per position, D1 5x T79 N=26, 12-can link, 3 fans (E68/E69)" },
  "40kw/dcdc":  { sku: "40 kW", board: "DC-DC (upper)", sheet: "2 of 3", cells: "full-bridge LLC: 2x SG2M023120LJ per position + 470 pF/die turn-off snubber, 9x33 nF + D2 rev F 3.99 uH, 2 cells, film banks 12x2.2 uF, DOUT (E67/E68)" },
  "50kw/acdc":  { sku: "50 kW liquid", board: "AC-DC (lower)", sheet: "1 of 3", cells: "Vienna PFC: 1x B3M010C075Z per position, D1 5x T79 N=24, 16-can link, coldplates, 0 fans (E68)" },
  "50kw/dcdc":  { sku: "50 kW liquid", board: "DC-DC (upper)", sheet: "2 of 3", cells: "full-bridge LLC: 2x SG2M023120LJ per position + 470 pF/die turn-off snubber, 11x33 nF + D2 rev F 3.20 uH, 2 cells, film banks 14x2.2 uF, DOUT (E67/E68)" },
  "50kwa/acdc": { sku: "50 kW air", board: "AC-DC (lower)", sheet: "1 of 3", cells: "Vienna PFC: 1x B3M010C075Z per position, D1 5x T79 N=24, 16-can link, 4 fans (E68)" },
  "50kwa/dcdc": { sku: "50 kW air", board: "DC-DC (upper)", sheet: "2 of 3", cells: "full-bridge LLC: 2x SG2M023120LJ per position + 470 pF/die turn-off snubber, 11x33 nF + D2 rev F 3.20 uH, 2 cells, film banks 14x2.2 uF, DOUT (E67/E68)" },
  "control-card": { sku: "30/40/50 kW", board: "Control card", sheet: "3 of 3", cells: "role-agnostic: AC-DC or DC-DC slot via ROLE straps" },
};
