// footprint-map.mjs — intended package per part family.
//
// EasyEDA raises a FATAL DRC error for any component without a Footprint property (44 per page
// on import). PCB layout is out of scope by standing directive, so these are the specified
// packages, not placed library footprints: the schematic states the intended package and the
// error clears honestly. Names follow the JEITA/JEDEC package designation; where the package is
// a decision not yet frozen the entry says so.
export const FOOTPRINT = {
  // --- power semiconductors ---
  "B3M010C075Z": "TO-247-4",        "SG2M023120LJ": "TO-247-4L",
  "SICJBS-1200-10": "TO-247-2",     "SICJBS-1200-20": "TO-247-2",
  "SICJBS-1200-40": "TO-247-2",     "SIC-1700-1R": "TO-247-3",
  "SIC-1200-5A": "TO-247-3",        "S8050": "SOT-23-3",
  // --- ICs ---
  "GD32G553VET6": "LQFP-100_14x14mm_P0.5mm", "NSI6611": "SOIC-16W_7.5mm",
  "NCP1252A": "SOIC-8_3.9mm",       "TPS54202-class": "SOT-23-6",
  "TPS3430-class": "VSON-10_3x3mm", "TLV9061-class": "SOT-23-5",
  "AMC1311-class": "SOIC-8W_7.5mm", "AMC1350-class": "SOIC-8W_7.5mm",
  "NSI1200-DSWR": "SOIC-8W_7.5mm",  "NSI1042": "SOIC-16W_7.5mm",
  "74HC11": "SOIC-14_3.9mm",        "74HC595": "SOIC-16_3.9mm",
  "ULN2803A": "SOIC-18W_7.5mm",     "VOM1271T": "SOP-4_4.4x2.6mm",
  "TLP152-class": "SO-6_4.4x3.6mm",
  // --- diodes / protection ---
  "US1M": "SMA_DO-214AC",           "US2G": "SMB_DO-214AA",
  "UF-400V-3A": "SMC_DO-214AB",     "1N4148WS": "SOD-323",
  "SMBJ26A": "SMB_DO-214AA",        "SMBJ16A": "SMB_DO-214AA",
  "FAST-1200-1A": "SMB_DO-214AA",   "PESD1CAN": "SOT-23-3",
  "S20K550": "DISC-20mm_RM10",      "GDT-3k5-20kA": "GDT-8mm_RM6",
  // --- passives ---
  "R-small": "R_0805_2012Metric",   "R0603-220": "R_0603_1608Metric",
  "R0805-10k": "R_0805_2012Metric", "R0805-prec-0.1%": "R_0805_2012Metric",
  "R1206-33R-1%": "R_1206_3216Metric", "R1206-RG-0.5W": "R_1206_3216Metric",
  "R1206-R31-1%-0.5W": "R_1206_3216Metric", "HV73-475k-1%": "R_1206_3216Metric",
  "R2512-47k-HV-AS": "R_2512_6332Metric", "R2512-10R-2W": "R_2512_6332Metric",
  "R2512-HV": "R_2512_6332Metric",  "R2512-2R0-1W-1%": "R_2512_6332Metric",
  "CER-25W-AX": "R_Axial_Power_25W_L60mm", "CER-50W-AX": "R_Axial_Power_50W_L75mm",
  "CER-2k2-10W-AX": "R_Axial_Power_10W_L48mm", "SQP-10R-25W": "R_Axial_Power_25W_L60mm",
  "WW-470R-10W": "R_Axial_Power_10W_L48mm",
  "MLCC-small": "C_0603_1608Metric", "MLCC-100n-0402": "C_0402_1005Metric",
  "MLCC-100p-0603": "C_0603_1608Metric", "MLCC-1u-0805": "C_0805_2012Metric",
  "MLCC-10u-0805": "C_0805_2012Metric", "C1812-100p-1k": "C_1812_4532Metric",
  "EL-47u-35": "CP_Radial_D6.3mm_P2.50mm", "EL-220u-35": "CP_Radial_D8.0mm_P3.50mm",
  "ELH-470u450": "CP_Snap-In_D30mm_P10.00mm",
  "PP-46n-1200": "C_Film_L31.5mm_W13mm_P27.5mm", "PP-1u-600": "C_Film_L26.5mm_W11mm_P22.5mm",
  "PP-1u-1100": "C_Film_L31.5mm_W13mm_P27.5mm", "PP-4u7-1200": "C_Film_L41.5mm_W20mm_P37.5mm",
  "PP-10n-1200": "C_Film_L18mm_W5mm_P15mm", "FILM-100n-250": "C_Film_L7.2mm_W3.5mm_P5.0mm",
  "X1-2u2-530": "C_Film_X1_L26.5mm_W11mm_P22.5mm", "Y1-4n7-440": "C_Film_Y1_L11mm_W5mm_P10mm",
  "FB-600R-0805": "L_0805_2012Metric", "IND-10u-3A": "L_Bourns_SRN6045",
  // --- magnetics / electromechanical (custom or class-level) ---
  "IND-PFC-165u": "L_Toroid_3xT79_26u_custom", "IND-TRIM-BIN4": "L_Toroid_trim_bin_custom",
  "DM-22u-SKU": "L_Toroid_sendust_per-SKU", "CMC-3PH-2mH-SKU": "L_CMC_3ph_nanocryst_per-SKU",
  "CMC-CAN-51uH": "L_CMC_ACT45B_4.5x3.2mm", "XFMR-LLC-10K": "XFMR_3xPQ50-50_custom",
  "XFMR-AUX-FLY-C": "XFMR_ETD34_custom",
  "CT-100A-1:2500": "CT_window_100A_1-2500", "CT-RES-1:100": "CT_window_res_1-100",
  "HF167F-80A-M": "RELAY_HF167F_PCB", "HF167F-120A-M": "RELAY_HF167F_PCB",
  "HF167F-250A-M": "RELAY_contactor_250A_stud", "HFE82V-M-CLASS": "RELAY_HFE82V_PCB",
  "HFE9-10A-1kV-M": "RELAY_HFE9_PCB",
  "FUSE-gG-690V": "FUSE_holder_RT28-32", "FUSE-gG-690V-63A": "FUSE_holder_RT28-32",
  "FUSE-gG-690V-125A": "FUSE_holder_NH00", "FUSE-gG-690V-250A": "FUSE_holder_NH01",
  "SHUNT-MANG": "SHUNT_4-terminal_manganin",
  // --- modules / connectors / HMI ---
  "QA01C": "DIP-7_MORNSUN_QA01C",   "ISO5V-RFC-6K": "SIP-4_iso-module",
  "MICROFIT3-16": "Molex_MicroFit3.0_2x8_P3.00mm", "PH-2": "JST_PH_B2B-PH-K_1x2_P2.00mm",
  "PH-4": "JST_PH_B4B-PH-K_1x4_P2.00mm", "PH-4-FAN": "JST_PH_B4B-PH-K_1x4_P2.00mm",
  "HDR-1x5-2.54": "PinHeader_1x05_P2.54mm", "TACT-6x6": "SW_Tactile_6x6mm",
  "LED-2DIG-0.56CC": "LED_7SEG_2DIGIT_0.56in", "STUD-M8": "TERM_Stud_M8",
  "TAB-M4": "TERM_Tab_M4",
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
