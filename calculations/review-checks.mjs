// review-checks.mjs — machine-checkable closure gate for the production review
// (docs/design-review-production.md). Each check is the grep that FOUND the defect, inverted
// into an assertion against the schematic source / parts DB. Run: node calculations/review-checks.mjs
// Exit 1 on any failure. This is a source-level gate — build (netlist) and sim evidence are separate.

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
ck("CB-7", /Lp 550 µH|Lp 550u/.test(cells + db) && /1\.8 A/.test(cells), "aux re-rated to the 60 W design point");
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
ck("HR-3", /WW-470R-5W/.test(db), "clamp bleeder 5 W axial");
ck("HR-4", /RELAY_FB_\$\{k\}|RELAY_FB_/.test(cells + boards) && /M1/.test(cells) && /HFE82V-M/.test(db), "mirror-contact relays + readback nets");
ck("HR-5", /RFLTA/.test(boards) && /RFLTB/.test(boards), "FLT pullups on both boards");
ck("HR-6", /R\$\{id\}PD/.test(cells), "PWM pulldowns per channel");
ck("HR-7", /GDT[123]?/.test(boards) && /MOVP/.test(boards), "L-PE MOV+GDT surge path");
ck("HR-8", /PP-4u7-1200/.test(db), "output film 1200 V");
ck("HR-9", /DM-22u-SKU/.test(db) && /LDM1: \{ price1k: 480/.test(db), "DM chokes per-SKU rated (D6)");
ck("HR-10", /QA01C-15S18/.test(db) && /price1k: 0/.test(db.split("biasCommon")[1] ?? ""), "bias modules in BOM; E23 deferred (biasCommon 0)");
ck("HR-11", /C\$\{id\}RST/.test(cells) && /R\$\{id\}BOOT/.test(cells), "NRST cap + BOOT0 strap");
ck("HR-12", /SQP-10R-25W/.test(db), "pre-insertion pulse resistors");

// --- Medium
ck("MR-1", /CER-25W-AX/.test(db) && /RPRE1" footprint=\{FilmBoxFP\(25\)\}/.test(boards), "precharge/discharge resistors on axial footprints");
ck("MR-6", /SNS_IOUTN/.test(boards) && /OUTN/.test(cells.split("OutputShunt")[1]), "shunt OUTN routed");
ck("MR-7", /FB\$\{id\}A/.test(cells) && /VDDA_/.test(cells), "VDDA ferrite + caps");
ck("MR-8", !/net\.NC_U\d/.test(boards), "ULN spare inputs grounded");

console.log(fail ? `\n${fail} CHECK(S) FAILED` : "\nALL REVIEW CHECKS PASS");
process.exit(fail ? 1 : 0);
