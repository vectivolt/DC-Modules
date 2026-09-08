// Shared section map: which designators belong to which functional section.
// Extracted from schematic-export.mjs so the exporter and the composer cannot drift.
export const SECTIONS = {
  // The control card (E35): one card, both converter roles; single-segment target "control-card".
  "control-card": [
    ["MCU GD32G553VET7 & DECOUPLING", /^(UCARD|CCARDD\d|CCARDA[12]|CCARDVR|RCARDRST|FBCARDA)$/],
    ["SWD + BOOT", /^(JSWDCARD|RCARDBOOT|CCARDRST)$/],
    ["SAFETY CHAIN (WD + AND)", /^(USUPCARD|UANDCARD|R(WPU|ENR|ENL|GPD|RDY)CARD|CSFCARD|CWDCARD|CRSTCARD)$/],
    ["FLT WIRED-OR + GROUND TIE", /^(RFLTC|CFLTC|RAGTC)$/],
    ["3V3 SYNC BUCK", /^(UBKCARD|LBKCARD|CBK[IO]CARD|CBSTCARD|RBKF[12]CARD)$/],
    ["ANALOG MID-RAIL", /^(RAV[HLIF]|CAV[MFO]|UAVB)$/],
    ["ROLE STRAPS", /^RROLE[01]$/],
    ["88-WAY INTERFACE", /^JCARD$/],
  ],
  acdc: [
    ["AC INPUT & PROTECTION", /^(JACL\d|JPE$|F[123]$|MOV[123]$|MOVP[123]$|GDT[123]$)/],
    ["EMI FILTER", /^(CMC[12]$|CX\d\d$|CY[123]$|LDM[123]$)/],
    ["PRECHARGE", /^(KPRE[12]$|RPRE[12]$|RKFBP$)/],
    ["LINE CTs", /^(CT[ABC]\d$|R[ABC]\d[BF]$|C[ABC]\dF$|D[ABC]\d[PN]$)/],
    ["VIENNA PFC LANES", /^(?:L|Q|D|C|R|U|PS)[ABC]\d/],
    ["DC LINK", /^(CD[TB]\d|RBAL[TB]\d)/],
    ["BUS DISCHARGE", /^(RDIS\d|QDIS$|QDISF$|UQD$|PSQD$|RQD)/],
    ["ISOLATED HV SENSING", /^(RNS\d[AB]$|PS5(AC|BUS)$|UIV(V\d|BP|BM)$|R(V\d|BP|BM)D\d?L?$|C(V\d|BP|BM)DF$)/],
    ["ANALOG MID-RAIL & TEMP", /^(RAV[HLIF]$|CAV[MFO]$|UAVB$|[JRC]T(PFC|INL))/],
    ["CARD INTERFACE (88-WAY)", /^(JA|RPD\d|RROLE)$/],
    ["GROUND BONDS", /^(RPET|CPET)$/],
    ["AUX 110 W FLYBACK + 3V3 + RAIL MONITORS", /^(UAUX|QAUX|RAUX\w*|RCSF|CCSF|TAUX|DAUX\w*|CAUX\d\d|CVCC|DTVS\d\d|RBR\w+|RFB[12]|RCOMP|CCOMP|DCLA|CCLA|RCLA[12]|UBKA|LBKA|CBKIA|CBKOA|CBSTA|RBKF[12]A|RM(24|15)[AB])$/],
    ["COIL DRIVER", /^UPA$/],
    ["FANS", /^(JFAN\d|RFT\d)$/],
    ["DC OUT + HARNESS", /^(JICA$|RA(LTX|LRX|LTS|LRS)$|JDCP$|JDCN$|JPEB$)/],
  ],
  dcdc: [
    ["BUS ENTRY & COMMUTATION FILMS", /^(JDCP$|JDCN$|JPEB$|CF\d+$)/],
    ["LLC HALF-BRIDGE LEGS", /^(Q\d+[HL]$|U\d+[HL]$|PS\d+[HL]$|[RC]\d+[HL]\w*$|D\d+[HL]S\d$)/],
    ["LLC TANKS, TRANSFORMERS & RECTIFIERS", /^(C\d+R\d$|L\d+T$|T\d+$|D\d+[AB][1-4]$|CT\d+$|R\d+C[TF]$|C\d+CF$|D\d+C[PN]$)/],
    ["BANK CAPACITORS & BALANCE", /^(CB[AB]\d+[TB]$|RBAL[TB][AB][12]$|CB[AB]F$)/],
    ["SERIES/PARALLEL MATRIX", /^(K(SER|PARA|PARB|OUT|PREA|PREB)2?$|RKPU|RPRE[AB]$)/],
    ["BANK BLEEDERS", /^(RBD[AB]\d$|QDIS[AB]$|UPV[AB]$|RPV[LB][AB]$)/],
    ["OUTPUT & SHUNT", /^(RSHO$|USHO$|PSSH$|COF[12]$|CYO[12]$|JOUTP$|JOUTN$)/],
    ["ISOLATED SENSING", /^(PS5BK[AB]$|UIVO[ABV]$|RO[ABV]D\d?L?$|CO[ABV]DF$)/],
    ["ANALOG MID-RAIL & TEMP", /^(RAV[HLIF]$|CAV[MFO]$|UAVB$|[JRC]T(LLC|XFR))/],
    ["CARD INTERFACE (88-WAY)", /^(JB|RPDB\d|RROLEB)$/],
    ["COIL DRIVER", /^ULB$/],
    ["ISOLATED CAN", /^(UCAN|PSCAN|LCAN|JCAN|RTERM|JTERM|TVSCAN|RCGB|CCGB)$/],
    ["CONFIG HMI", /^(DISP1|USR1|RSEG\d|QDIG[12]|RDIG[12]|SW[12]|RSW[12]|CSW[12])$/],
    ["HARNESS", /^(JICB$|RB(LTX|LRX|LTS|LRS)$)/],
  ],
};

export const SHEET_TITLES = {
  "30kw/acdc": "DC-Modules 30 kW — AC-DC board (Vienna PFC)",
  "30kw/dcdc": "DC-Modules 30 kW — DC-DC board (3-phase LLC)",
  "60kw/acdc": "DC-Modules 60 kW — AC-DC board (Vienna PFC, 2x cells)",
  "60kw/dcdc": "DC-Modules 60 kW — DC-DC board (3-phase LLC, 2x cells)",
  "control-card": "DC-Modules — Control Card (GD32G553VET7, one card for both converter roles)",
};

// Which board this sheet is, and where it sits in the product set. Rendered into the title
// block so a sheet is self-identifying when printed on its own.
export const SHEET_IDENT = {
  "30kw/acdc":  { sku: "30 kW", board: "AC-DC (lower)", sheet: "1 of 3", cells: "1x Vienna PFC cell + 1x 3-ph LLC cell" },
  "30kw/dcdc":  { sku: "30 kW", board: "DC-DC (upper)", sheet: "2 of 3", cells: "1x Vienna PFC cell + 1x 3-ph LLC cell" },
  "60kw/acdc":  { sku: "60 kW", board: "AC-DC (lower)", sheet: "1 of 3", cells: "2x Vienna PFC cells + 2x 3-ph LLC cells" },
  "60kw/dcdc":  { sku: "60 kW", board: "DC-DC (upper)", sheet: "2 of 3", cells: "2x Vienna PFC cells + 2x 3-ph LLC cells" },
  "control-card": { sku: "30/60 kW", board: "Control card", sheet: "3 of 3", cells: "role-agnostic: AC-DC or DC-DC slot via ROLE straps" },
  "40kw/acdc":  { sku: "40 kW", board: "AC-DC (lower)", sheet: "1 of 3", cells: "E41 hot variant: paralleled PFC pairs, 124 uH chokes, 12-can link, 3 fans" },
  "40kw/dcdc":  { sku: "40 kW", board: "DC-DC (upper)", sheet: "2 of 3", cells: "E41 hot variant: 6x33 nF tanks, re-binned trim, 3 strings/bank" },
  "cabinet": { sku: "120 kW", board: "Cabinet interconnect", sheet: "1 of 1", cells: "4x 30 kW module + CSU carrier (E39)" },
};
