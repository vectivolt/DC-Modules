import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// footprint-map.mjs — intended package per part family.
//
// KiCad raises a FATAL DRC error for any component without a Footprint property (44 per page
// on import). PCB layout is out of scope by standing directive, so these are the specified
// packages, not placed library footprints: the schematic states the intended package and the
// error clears honestly. Names follow the JEITA/JEDEC package designation; where the package is
// a decision not yet frozen the entry says so.
export const FOOTPRINT = {
  // --- power semiconductors ---
  "B3M010C075Z": "TO-247-4_L15.8-W5.0-P2.54-L",        "SG2M023120LJ": "TO-247-4_L15.8-W5.0-P2.54-L",
  "SICJBS-1200-10": "TO-247-3_L15.9-W5.0-P5.44-L",     "SICJBS-1200-20": "TO-247-3_L15.9-W5.0-P5.44-L",
  "SICJBS-1200-40": "TO-247-3_L15.9-W5.0-P5.44-L",     "SIC-1700-1R": "TO-247-3_L15.9-W5.0-P5.44-L",
  "SIC-1200-5A": "TO-247-3_L15.9-W5.0-P5.44-L",        "S8050": "SOT-23-3_L2.9-W1.3-P1.90-LS2.4-BR",
  // --- ICs ---
  "GD32G553VET7": "LQFP-100_L14.0-W14.0-P0.50-LS16.0-BL", "NSI6611": "SOIC-16_L10.3-W7.5-P1.27-LS10.3-BL",
  "NCP1252D": "SOIC-8_L4.9-W3.9-P1.27-LS6.0-BL",       "TPS54202-class": "SOT-23-6_L2.9-W1.6-P0.95-LS2.8-BL",
  "TPS3430-class": "VSON-10_L3.0-W3.0-P0.50-TL-EP", "TLV9061-class": "SOT-23-5_L3.0-W1.7-P0.95-LS2.8-BL",
  "AMC1311-class": "SOIC-8_L5.9-W7.5-P1.27-LS11.5-BL", "AMC1350-class": "SOIC-8_L5.9-W7.5-P1.27-LS11.5-BL",
  "NSI1200-DSWR": "SOIC-8_L5.9-W7.5-P1.27-LS11.5-BL",  "NSI1042-DSWR": "SOIC-16_L10.3-W7.5-P1.27-LS10.3-BL",
  "74HC11": "SOIC-14_L8.7-W3.9-P1.27-LS6.0-BL",        "74HC595": "SOIC-16_L9.9-W3.9-P1.27-LS6.0-BL",
  "ULN2803A": "SOIC-18_L11.6-W7.5-P1.27-LS10.3-BL",     "VOM1271T": "SOP-4_L4.4-W4.3-P2.54-LS7.0-BL",
  "TLP152-class": "SOP-6_L7.0-W4.4-P1.27-LS7.6-BL",
  // --- diodes / protection ---
  "US1M": "SMA_L4.4-W2.8-LS5.4-RD",           "US2G": "SMB_L4.5-W3.6-LS5.3-RD",
  "UF-400V-3A": "SMC_L8.0-W5.9-LS9.0-RD",     "1N4148WS": "SOD-323_L1.8-W1.3-LS2.5-RD",
  "SMBJ26A": "SMB_L4.5-W3.6-LS5.3-RD",        "SMBJ16A": "SMB_L4.5-W3.6-LS5.3-RD",
  "SIC-SBD-1700V": "SMB_L4.5-W3.6-LS5.3-RD",     "PESD1CAN": "SOT-23-3_L2.9-W1.3-P1.90-LS2.4-BR",
  "S20K550": "DISC-20mm_RM10",      "GDT-3k5-20kA": "GDT-8mm_RM6",
  // --- passives ---
  "R-small": "R0805",   "R0603-220": "R0603",
  "R0805-10k": "R0805", "R0805-prec-0.1%": "R0805",
  "R1206-33R-1%": "R1206", "R1206-RG-0.5W": "R1206",
  "R1206-R28-1%-0.5W": "R1206", "HV73-475k-1%": "R1206",
  "R2512-47k-HV-AS": "R2512", "R2512-10R-2W": "R2512",
  "R2512-HV": "R2512",  "R2512-2R0-1W-1%": "R2512",
  "R2512-11k-2W-AS": "R2512", "R2512-R05-1W-1%": "R2512",
  "CER-25W-33R-AX": "RES-TH_L60.0-W9.0-P66.00", "CER-25W-160R-AX": "RES-TH_L60.0-W9.0-P66.00", "CER-50W-33R-AX": "RES-TH_L75.0-W12.0-P82.00", "CER-50W-160R-AX": "RES-TH_L75.0-W12.0-P82.00",
  "CER-2k2-10W-AX": "RES-TH_L48.0-W8.0-P54.00", "SQP-10R-25W": "RES-TH_L60.0-W9.0-P66.00",
  "WW-470R-10W": "RES-TH_L48.0-W8.0-P54.00",
  "MLCC-small": "C0603", "MLCC-100n-0402": "C0402",
  "MLCC-100p-0603": "C0603", "MLCC-1u-0805": "C0805",
  "MLCC-10u-0805": "C0805", "C1812-100p-1k": "C1812",
  "EL-47u-35": "CAP-TH_L6.3-W6.3-P2.50", "EL-220u-35": "CAP-TH_L8.0-W8.0-P3.50",
  "ELH-470u450": "CAP-TH_L30.0-W30.0-P10.00",
  "PP-33n-1200V": "CAP-TH_L31.5-W13.0-P27.50", "PP-1u-600": "CAP-TH_L26.5-W11.0-P22.50",
  "PP-1u-1100": "CAP-TH_L31.5-W13.0-P27.50", "PP-2u2-630": "CAP-TH_L31.5-W13.0-P27.50", "ELH-330u550": "CAP-TH_L30.0-W30.0-P10.00", "IND-BANK-30": "L_Toroid_sendust_stack_custom", "IND-BANK-40": "L_Toroid_sendust_stack_custom", "IND-BANK-50": "L_Toroid_sendust_stack_custom", "DIODE-1600V-150A-MOD": "DIODE_MOD_2T_34mm", "DIODE-1600V-200A-MOD": "DIODE_MOD_2T_34mm", "DIODE-1600V-250A-MOD": "DIODE_MOD_2T_34mm", "PP-4u7-1200": "CAP-TH_L41.5-W20.0-P37.50",
  "PP-10n-1200": "CAP-TH_L18.0-W5.0-P15.00", "FILM-100n-250": "CAP-TH_L7.2-W3.5-P5.00",
  "X1-2u2-530": "CAP-TH_L26.5-W11.0-P22.50", "Y1-4n7-440": "CAP-TH_L11.0-W5.0-P10.00",
  "FB-600R-0805": "L0805", "IND-10u-3A": "IND-SMD_L6.0-W6.0",
  // --- magnetics / electromechanical (custom or class-level) ---
  "IND-PFC-165u": "L_Toroid_3xT79_26u_custom", "IND-LR-E70-30": "L_E70_2set_gapped_custom", "IND-LR-E70-40": "L_E70_2set_gapped_custom", "IND-LR-E70-50": "L_E70_2set_gapped_custom",
  "DM-22u-SKU": "L_Toroid_sendust_per-SKU", "CMC-3PH-2mH-SKU": "L_CMC_3ph_nanocryst_per-SKU",
  "CMC-CAN-51uH": "IND-SMD_L4.5-W3.2_CMC", "XFMR-LLC-CELL-2E70-30": "XFMR_E70_cell_custom", "XFMR-LLC-CELL-3E70-40": "XFMR_E70_cell_custom", "XFMR-LLC-CELL-3E70-50": "XFMR_E70_cell_custom",
  "XFMR-AUX-FLY-E": "XFMR_ETD44_custom",   // E65 D4 rev E: land to draw (pins 1–4 primary row / 5–8 SELV row) — layout open item
  "CT-100A-1:2500": "CT_window_100A_1-2500", "CT-RES-1:100": "CT_window_res_1-100",
  // NOT the catalogue HF167F/24-HF land (LCSC C2757422). Tried it; KiCad's DRC rejected it:
  // "Pin has no corresponding pad: 5, 6, 8; Pad has no corresponding pin: 2". The catalogue part
  // is a plain 4-pad SPST-NO relay, while E30 requires the MIRROR-CONTACT variant — pins 5/6/8
  // are the mirror used for readback. Different part, different land; the placeholder stays until
  // the mirror-contact p/n is confirmed (lcsc-map already flags it REVIEW).
  "HF167F-80A-M": "RELAY_HF167F_PCB", "HF167F-120A-M": "RELAY_HF167F_PCB",
  "HF167F-250A-M": "RELAY_contactor_250A_stud", "RELAY-PCB-120A-24V": "RELAY_PCB_120A_4pin", "RELAY-PCB-150A-24V": "RELAY_PCB_120A_4pin",
  "HFE9-10A-1kV-M": "RELAY_HFE9_PCB",
  // R9: the holder must match the LINK size, and RT28-32 takes only 10x38 mm / 2-32 A. A 63 A gG
  // link is 14x51 and a 125 A is 22x58, so each SKU needs its own holder; 250 A leaves the RT28
  // range entirely and is a different MOUNTING class (NH1 blade / bolted tag), not a substitution.
  "FUSE-gG-690V": "FUSE_holder_22x58", "FUSE-gG-690V-80A": "FUSE_holder_22x58",
  "FUSE-gG-690V-125A": "FUSE_holder_NH00", "FUSE-gG-690V-250A": "FUSE_holder_NH01",
  "SHUNT-50MV-100A": "SHUNT_4-terminal_manganin", "SHUNT-50MV-133A": "SHUNT_4-terminal_manganin", "SHUNT-50MV-167A": "SHUNT_4-terminal_manganin", "SHUNT-50MV-200A": "SHUNT_4-terminal_manganin", "SHUNT-50MV-400A": "SHUNT_4-terminal_manganin",
  // --- modules / connectors / HMI ---
  "QA01C": "PWRM-TH_QA01C",           // LCSC C2757491 (MORNSUN), real catalogue land
  // Was silently swallowed by the comment on the line above, so every PS5* isolated 5 V module
  // resolved to no footprint at all. Found while resolving footprints for PCB placement.
  "ISO5V-RFC-6K": "SIP-4_iso-module",
  "MICROFIT3-16": "CONN-TH_16P-P3.00_MicroFit", "PH-2": "CONN-TH_2P-P2.00_PH",
  "PH-4": "CONN-TH_4P-P2.00_PH", "PH-4-FAN": "CONN-TH_4P-P2.00_PH",
  "HDR-1x5-2.54": "HDR-TH_5P-P2.54-V-M", "TACT-6x6": "KEY-SMD_4P-L6.0-W6.0",
  "LED-2DIG-0.56CC": "LED-SEG-TH_2DIG-0.56", "STUD-M8": "TERM_Stud_M8",
  "TAB-M4": "TERM_Tab_M4",
  // ---- E64: the R17 unnamed-package queue, closed. Every class added E55–E60 now states its
  // intended package. Chip classes carry the size their code already names; wound parts and
  // relays point at the placeholder their family already uses (to-draw queue, layout phase);
  // cabinet blocks and the DIN supply are assemblies with no PCB land, and say so.
  "R0603-10k": "R0603", "R0805-2R2": "R0805", "R0603-120R-1%": "R0603",
  "R0603-0R": "R0603", "R2010-1k-0.75W-1%": "R2010",
  "R2512-0R30-2W-1%": "R2512", "R2512-0R36-1W-1%": "R2512", "R2512-0R47-1W-1%": "R2512",
  "R1206-13R-1%": "R1206", "R1206-18R-1%": "R1206", "R1206-22R-1%": "R1206",
  "MLCC-22p-0603": "C0603", "MLCC-47p-0603": "C0603",
  "X1-4u7-530": "CAP-TH_L31.5-W17.0-P27.50",   // class-typical X1 4.7 µF 530 VAC box (C424W class); confirm at part choice
  "QA01C-18": "PWRM-TH_QA01C",                 // same catalogue land family as QA01C
  "74HC02": "SOIC-14_L8.7-W3.9-P1.27-LS6.0-BL",
  "BZT52-C15": "SOD-123_L2.7-W1.6-LS3.7-RD",
  "CT-LINE-2500-150A": "CT_window_150A_1-2500",   // ACX-1150 38.1 mm body — its own land, per Talema drawing
  "CT-RES-1:100-100A": "CT_window_res_1-100", "CT-RES-1:100-150A": "CT_window_res_1-100",
  "ACX-1100": "CT_window_100A_1-2500", "AS-404": "CT_window_res_1-100",
  "DM-CHOKE-30": "L_Toroid_sendust_per-SKU", "DM-CHOKE-40": "L_Toroid_sendust_per-SKU", "DM-CHOKE-50": "L_Toroid_sendust_per-SKU",
  "MICROFIT3-40": "CONN-TH_40P-P3.00_MicroFit",
  "CONN-CARD-88-H": "HDR-TH_88P-2R-P2.54-V-M", // 2×44 keyed header — generated dual-row land
  "CONN-CARD-88-R": "SKT-TH_88P-2R-P2.54-V",   // mating receptacle — per the chosen series drawing
  "TLV3202-class": "SOIC-8_L4.9-W3.9-P1.27-LS6.0-BL", "BAT54A": "SOT-23-3_L2.9-W1.3-P1.90-LS2.4-BR",
  "PMP-50KW-MODULE": "ASSY_MODULE_INTERFACE",  // cabinet block: a module, not a PCB part
  "CHARGER-CONTROLLER-CAN-PORT": "ASSY_MODULE_INTERFACE",  // cabinet block: the controller port (E66), not a PCB part
};
export const footprintFor = (mpn) => FOOTPRINT[mpn] ?? "";

// Resolve by DESIGNATOR through parts-db, not by the payload's value field: most passives carry
// no MPN in the page payloads (their value is "47k"), and parts-db is already the authoritative
// designator -> part mapping used by the BOM, so the two cannot drift.
import { DB } from "./cost/parts-db.mjs";
export const footprintForRef = (designator, mpnHint) => {
  if (mpnHint && FOOTPRINT[mpnHint]) return FOOTPRINT[mpnHint];
  const rule = DB.find((r) => r.m.test(designator));
  return (rule && FOOTPRINT[rule.mpn]) || "";
};

// ---- real chip package, read off the BUILT land ---------------------------------------------
// footprintForRef resolves by MPN class, which is wrong whenever a part's declared footprint
// differs from its class default: CAVO and CBKIA are declared 0805 in cells.tsx but their class
// "MLCC-small" defaults to C0603, so the sheet named a land the part does not fit. Measured
// across all six boards, 309 of 1325 chip-package components (23%) carried the wrong package.
// The built circuit knows the truth — pcb_component gives each part's actual land size — so use
// that for chip packages and keep the class map for everything else.
const LAND_MM = { "0402": 1.55, "0603": 2.0, "0805": 2.85, "1206": 4.0, "1210": 4.3, "1812": 5.5, "2512": 7.0 };

export const realPackagesFrom = (files) => {   // E64: explicit-file variant (bom-gen needs the card too)
  const out = new Map();
  for (const p of files) {
    if (!existsSync(p)) continue;
    const j = JSON.parse(readFileSync(p, "utf8"));
    const name = new Map();
    for (const e of j) if (e.type === "source_component") name.set(e.source_component_id, e.name);
    for (const e of j) {
      if (e.type !== "pcb_component" || !name.has(e.source_component_id)) continue;
      const w = e.width;
      let best = null;
      for (const [code, mm] of Object.entries(LAND_MM))
        if (!best || Math.abs(mm - w) < Math.abs(LAND_MM[best] - w)) best = code;
      // only trust it when the match is close; odd-shaped parts are not chip packages
      if (best && Math.abs(LAND_MM[best] - w) / LAND_MM[best] <= 0.15) out.set(name.get(e.source_component_id), best);
    }
  }
  return out;
};

export const realPackages = (sku) =>
  realPackagesFrom(["acdc", "dcdc"].map((side) => join(ROOT, "dist/boards", sku, side, "circuit.json")));

