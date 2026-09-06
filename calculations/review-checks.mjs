// review-checks.mjs — machine-checkable closure gate for the production reviews
// (docs/design-review-production.md R1 + design-review-production-r2.md R2). Each check is the
// grep that FOUND the defect, inverted into an assertion against the schematic source / parts DB.
// Run: node calculations/review-checks.mjs — exit 1 on any failure.
// R2 lesson: the gate also carries CLASS checks (rail sourcing, FLT/CTL nets reaching pin maps)
// so whole categories can't regress, not just the specific instances that were caught.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cells = readFileSync(join(ROOT, "packages/power-primitives/cells.tsx"), "utf8");
const boards = readFileSync(join(ROOT, "packages/common-components/boards.tsx"), "utf8");
const db = readFileSync(join(ROOT, "calculations/cost/parts-db.mjs"), "utf8");

let fail = 0;
const ck = (id, cond, what) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${id}  ${what}`);
  if (!cond) fail++;
};

// --- Critical blockers
ck("CB-1", /X1-2u2-530/.test(db) && !/X2-2u2-310/.test(db), "X caps are X1 530 VAC class");
ck("CB-2", /CB\[AB\]\\d\+\[TB\]/.test(db) && /CBA\$\{i\}T/.test(boards) && /net\.BKAM/.test(boards) && /RBALBA/.test(boards), "bank electrolytics are 2-series strings with midpoint + balance");
ck("CB-3", /IsoVSense id="OA" hv="net.BKAP" ref="net.BKAN"/.test(boards) && /IsoVSense id="OV" hv="net.OUTP" ref="net.OUTN"/.test(boards) && !/HvDivider/.test(boards), "bank/output senses are in-domain IsoVSense (no HvDivider left)");
ck("CB-4", /RAGTA[\s\S]*?net\.AGND[\s\S]*?net\.DGND/.test(boards) && /RAGTB/.test(boards), "AGND–DGND 0 Ω tie on both boards");
ck("CB-5", /RAUXST2 > \.pin2" to="\.UAUX > \.VCC"/.test(cells) && /\.UAUX > \.COMP/.test(cells) && /\.UAUX > \.BR/.test(cells) && /\.TAUX > \.AXA/.test(cells) && !/"\.UAUX > \.FB" to="net\.V15"/.test(cells), "aux controller fully wired (VCC startup, COMP, BR, aux winding; FB no longer tied to V15)");
ck("CB-6", /AuxPower dcp="net.DCP" dcn="net.DCN"/.test(boards) && /SIC-1700/.test(db), "aux fed from full bus with 1700 V switch");
ck("CB-7", /Lp 345 µH|Lp 345u/.test(cells) && /3\.2 A/.test(cells) && /XFMR-AUX-FLY-C/.test(db), "aux at the E26 rev C design point (110 W — R2/CB-20 superseded the 60 W closure)");
ck("CB-8", /KPRE\[12\]/.test(db) && /HF167F/.test(db) && !/HF115F-2Z/.test(db) && /KPRE1/.test(boards), "precharge bypass = line-rated power relays");
ck("CB-9", /C\$\{id\}FP/.test(cells) && /C\$\{id\}FN/.test(cells), "Vienna per-phase film commutation caps present");
ck("CB-10", /SafetyChain/.test(cells) && /USUP/.test(cells) && /RGPD/.test(cells) && /SafetyChain id="A"/.test(boards) && /SafetyChain id="B"/.test(boards) && !/net\.PWM_KILL/.test(boards), "enable chain: WD + AND + pulldowns on both boards; PWM_KILL retired");
ck("CB-11", /DischargeCtl/.test(cells) && /RQDPD/.test(cells) && !/RQDPU/.test(boards), "discharge default-OFF via isolated driver (V15 pull-up gone)");
ck("CB-12", /\.CLAMP.*to=\{gate\}|CLAMP`\} to=\{gate\}/.test(cells) || /U\$\{id\} > \.CLAMP/.test(cells), "driver CLAMP pin wired to gate");
ck("CB-13", /SwdPort/.test(cells) && /BOOT0_PFC/.test(boards) && /BOOT0_LLC/.test(boards) && /SWDIO_PFC/.test(boards), "SWD + BOOT0 provisioning on both MCUs");
ck("CB-14", /id="B" ltx="net.LINK_RX" lrx="net.LINK_TX"/.test(boards), "link TX↔RX crossed on the DC-DC side");
ck("CB-15", /AnalogMid/.test(cells) && /net\.AVMID/.test(cells) && /\.CT\$\{id\} > \.S2`\} to="net\.AVMID"/.test(cells) && /D\$\{id\}N/.test(cells), "bipolar senses biased to buffered AVMID with dual clamps");

// --- High risks
ck("HR-1", /PP-1u-1100/.test(db) && !/PP-1u-900/.test(db), "bus/bank film 1100 V");
ck("HR-2", !/R\$\{id\}SN[\s\S]{0,400}LlcHalfBridgeLeg/.test(cells) && !/leg\$\{id\}[\s\S]*?SN/.test(cells.split("LlcHalfBridgeLeg")[1].split("LlcSection")[0]), "LLC node RC snubbers deleted");
ck("HR-3", /WW-470R-10W/.test(db), "clamp bleeder ≥10 W axial (R2/MR-19 raised the HR-3 5 W fix — 4.3 W worst now 43% of rating)");
ck("HR-4", /RELAY_FB_\$\{k\}|RELAY_FB_/.test(cells + boards) && /M1/.test(cells) && /HFE82V-M/.test(db), "mirror-contact relays + readback nets");
ck("HR-5", /RFLTA/.test(boards) && /RFLTB/.test(boards), "FLT pullups on both boards");
ck("HR-6", /R\$\{id\}PD/.test(cells), "PWM pulldowns per channel");
ck("HR-7", /GDT[123]?/.test(boards) && /MOVP/.test(boards), "L-PE MOV+GDT surge path");
ck("HR-8", /PP-4u7-1200/.test(db), "output film 1200 V");
ck("HR-9", /DM-22u-SKU/.test(db) && /LDM1: \{ price1k: 480/.test(db), "DM chokes per-SKU rated (D6)");
// R3: the assertion previously grepped "QA01C-15S18" — a part number that does not exist at
// MORNSUN (real variants: QA01C = +20/-4 V, QA01C-18 = +18/-3 V). The gate was pinning a typo.
ck("HR-10", /QA01C\b/.test(db) && /price1k: 0/.test(db.split("biasCommon")[1] ?? ""), "bias modules in BOM; E23 deferred (biasCommon 0)");
ck("HR-11", /C\$\{id\}RST/.test(cells) && /R\$\{id\}BOOT/.test(cells), "NRST cap + BOOT0 strap");
ck("HR-12", /SQP-10R-25W/.test(db), "pre-insertion pulse resistors");

// --- Medium
ck("MR-1", /CER-25W-AX/.test(db) && /RPRE1" footprint=\{FilmBoxFP\(25\)\}/.test(boards), "precharge/discharge resistors on axial footprints");
ck("MR-6", /SNS_IOUTN/.test(boards) && /OUTN/.test(cells.split("OutputShunt")[1]), "shunt OUTN routed");
ck("MR-7", /FB\$\{id\}A/.test(cells) && /VDDA_/.test(cells), "VDDA ferrite + caps");
ck("MR-8", !/net\.NC_U\d/.test(boards), "ULN spare inputs grounded");

// ===== R2 review closure (docs/design-review-production-r2.md, 2026-09-05) =====
const fsmH = readFileSync(join(ROOT, "firmware/core/fsm.h"), "utf8");
const fsmC = readFileSync(join(ROOT, "firmware/core/fsm.c"), "utf8");
ck("R2-CB16", cells.includes('R${id}CT`} resistance="2"') && /R2512-2R0/.test(db) && db.includes("R\\d+CT"), "resonant CT burden 2.0 Ω 2512 (46 A rms/1:100 scaling; 33 Ω was the line-CT value)");
ck("R2-CB17", /Rail3V3 id="A"/.test(boards) && /Rail3V3 id="B"/.test(boards), "3.3 V rail sourced on BOTH boards (DC-DC previously had no source)");
ck("R2-CB18", /TPS54202/.test(db) && !/AMS1117/.test(db), "3.3 V is a sync buck, not a 15 V-fed LDO");
ck("R2-CB19", /UF-400V-3A/.test(db) && /US2G/.test(db) && !/SS310/.test(db), "aux rectifiers 400 V ultrafast (PIV ≈ 160 V; 100 V Schottky retired)");
ck("R2-CB20", /Lp 345/.test(cells) && /0\.31/.test(cells) && /ETD34/.test(db), "aux 110 W stage values in cells + D4 rev C part");
ck("R2-CB21", /\["net\.FLT_LLC", 74\]/.test(boards), "FLT_LLC mapped to an MCU-LLC pin");
ck("R2-CB22", /capacitance="46nF"/.test(cells) && /PP-46n-1200/.test(db) && /IND-TRIM-BIN4/.test(db), "tank = frozen rev D2 (46 nF Cr + binned trim in BOM)");
ck("R2-HR13", /USUP\$\{id\} > \.VDD/.test(cells) && /SET0/.test(cells), "watchdog symbol has supply + window-set pins");
ck("R2-HR14", /RPRE1: \{ price1k: 45/.test(db) && /RDIS0: \{ price1k: 45/.test(db) && /PMP_DISCH_TO_MS/.test(fsmH) && /disch_ms/.test(fsmC), "per-SKU pulse parts @120 kW + F.21 implemented in firmware");
ck("R2-HR15", /QDISA/.test(boards) && /QDISB/.test(boards) && /RBDA0/.test(boards) && /CTL_QDISBK/.test(boards), "commanded bank bleeders exist (banks no longer hold 525 V for minutes)");
ck("R2-HR16", /ISO5V-RFC-6K/.test(db) && !/B1505S-2WR2/.test(db), "iso-5V bias modules reinforced-rated (they ARE the barrier)");
ck("R2-HR17", /FAN_PWM\$\{i \+ 1\}|nFans/.test(boards) && /lanes === 4 \? 4 : 2/.test(boards), "fan ports scale with SKU (4 @120 kW, each with tach)");
ck("R2-HR18", /CMC-3PH-2mH-SKU/.test(db) && /CMC1: \{ price1k: 780/.test(db), "CM chokes per-SKU rated (D7)");
ck("R2-HR19", /dual = false/.test(cells) && /dual=\{channels === 4\}/.test(boards) && !/qtyMul: 2/.test(db), "120 kW paralleled relays are schematic instances, not BOM multipliers");
ck("R2-HR20", /RBALT\$\{id\}A/.test(cells) && /RBALTA1/.test(boards) && /RNS\d\[AB\]|RNS\$\{i\}A/.test(boards + db.replace(/\\/g, "")), "balance/star resistors 2-series HV");
ck("R2-MR11", /RAVI/.test(cells) && /CAVF/.test(cells), "AVMID buffer dual-feedback (no bare op-amp into 10 µF)");
ck("R2-MR12", /GD32G553VET6/.test(db) && !/GD32G553RET6/.test(db), "MCU mpn is the 100-pin V suffix");
ck("R2-MR13", /NCP1252A/.test(db) && /resistance="15k"/.test(cells), "aux controller = NCP1252A; BO divider sized for its 1.0 V threshold (brown-in ≈ 322 V)");
ck("R2-MR14", /MICROFIT3-16/.test(db) && /\.SP1`\} to="net\.DGND"/.test(cells), "harness 5 A contacts + spares carry GND");
ck("R2-MR17", /DTVS24/.test(cells) && /SMBJ26A/.test(db), "aux rail TVS clamps (FB-open single fault)");
ck("R2-MR18", /cf="1nF"/.test(boards), "OVP-participating senses use the fast filter");
ck("R2-MR22", /CSW1/.test(cells), "HMI button ESD caps");
// class checks — categories, not instances:
for (const m of boards.matchAll(/net\.(FLT_\w+)/g)) {
  const net = m[1];
  ck(`R2-CLASS-FLT-${net}`, new RegExp(`\\["net\\.${net}", \\d+\\]`).test(boards), `${net} reaches a pin map`);
}
ck("R2-CLASS-RAIL", (boards.match(/Rail3V3 id=/g) || []).length >= 2, "every board generator sources V3P3");
// ===== rev D ECO closures (10k-volume directive, 2026-09-05) =====
ck("ECO-2a", /PvGateDrive id="A"/.test(boards) && /PvGateDrive id="B"/.test(boards) && /VOM1271/.test(db) && !/DischargeCtl id="A"/.test(boards), "bank bleeders on PV drivers (opto+bias stacks retired; bus discharge keeps its opto chain)");
ck("ECO-2b", /p10k: 65/.test(db) && /p10k: 55/.test(db), "volume-quote p10k pricing on module classes");
ck("E23-revB", /RETIRED/.test(db.split("biasCommon")[1] ?? "") && /price1k: 0/.test(db.split("biasCommon")[1] ?? ""), "E23 custom bias transformer retired (modules permanent at 10k volume)");
ck("A7-revB", /p10k/.test(readFileSync(join(ROOT, "calculations/cost/bom-gen.mjs"), "utf8")), "BOM machinery carries the 10k tier");

console.log(fail ? `\n${fail} CHECK(S) FAILED` : "\nALL REVIEW CHECKS PASS");
process.exit(fail ? 1 : 0);
