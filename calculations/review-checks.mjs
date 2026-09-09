// review-checks.mjs — machine-checkable closure gate for the production reviews
// (docs/design-review-production.md R1 + design-review-production-r2.md R2). Each check is the
// grep that FOUND the defect, inverted into an assertion against the schematic source / parts DB.
// Run: node calculations/review-checks.mjs — exit 1 on any failure.
// R2 lesson: the gate also carries CLASS checks (rail sourcing, FLT/CTL nets reaching pin maps)
// so whole categories can't regress, not just the specific instances that were caught.

import { readFileSync, existsSync } from "node:fs";
const { skuOverrides: skuOverridesForCheck, BUILDABLE_SKUS } = await import("./cost/parts-db.mjs");
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cells = readFileSync(join(ROOT, "packages/power-primitives/cells.tsx"), "utf8");
const boards = readFileSync(join(ROOT, "packages/common-components/boards.tsx"), "utf8");
const card = readFileSync(join(ROOT, "packages/common-components/control-card.tsx"), "utf8");
const umodGen = readFileSync(join(ROOT, "packages/common-components/umod-map.gen.ts"), "utf8");
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
ck("CB-4", /name="RAGTC"/.test(boards) && !/name="RAGT[AB]"/.test(boards), "AGND–DGND single-point tie lives on the card (RAGTC); RAGTA/RAGTB deleted from power boards (card-split rev)");
ck("CB-5", /RAUXST2 > \.pin2" to="\.UAUX > \.VCC"/.test(cells) && /\.UAUX > \.BO/.test(cells) && /\.UAUX > \.SS/.test(cells) && /\.TAUX > \.AXA/.test(cells) && !/"\.UAUX > \.FB" to="net\.V15"/.test(cells), "aux controller fully wired on the REAL NCP1252 map (VCC startup, BO, SS, aux winding — R4-3)");
ck("CB-6", /AuxPower dcp="net.DCP" dcn="net.DCN"/.test(boards) && /SIC-1700/.test(db), "aux fed from full bus with 1700 V switch");
ck("CB-7", /Lp 345 µH|Lp 345u/.test(cells) && /3\.2 A/.test(cells) && /XFMR-AUX-FLY-C/.test(db), "aux at the E26 rev C design point (110 W — R2/CB-20 superseded the 60 W closure)");
ck("CB-8", /KPRE\[12\]/.test(db) && /HF167F/.test(db) && !/HF115F-2Z/.test(db) && /KPRE1/.test(boards), "precharge bypass = line-rated power relays");
ck("CB-9", /C\$\{id\}FP/.test(cells) && /C\$\{id\}FN/.test(cells), "Vienna per-phase film commutation caps present");
ck("CB-10", /SafetyChain/.test(cells) && /USUP/.test(cells) && /RGPD/.test(cells) && /SafetyChain id="CARD"/.test(boards) && !/net\.PWM_KILL/.test(boards), "enable chain: WD + AND + pulldowns on the card (one card per board role); PWM_KILL retired");
ck("CB-11", /DischargeCtl/.test(cells) && /RQDPD/.test(cells) && !/RQDPU/.test(boards), "discharge default-OFF via isolated driver (V15 pull-up gone)");
ck("CB-12", /\.CLAMP.*to=\{gate\}|CLAMP`\} to=\{gate\}/.test(cells) || /U\$\{id\} > \.CLAMP/.test(cells), "driver CLAMP pin wired to gate");
ck("CB-13", /SwdPort/.test(cells) && /SwdPort id="CARD"/.test(boards) && /BOOT0.*net\.BOOT0_CARD/.test(card) && /SWDIO.*net\.SWDIO_CARD/.test(card), "SWD + BOOT0 provisioning on the card MCU (card-split rev)");
ck("CB-14", /Interconnect40 id="B" map=\{HARNESS40\}/.test(boards) && !/InterconnectSignals/.test(boards), "E40 rev: straight-through 40-way harness on both boards; the crossed UART link is gone");
ck("CB-15", /AnalogMid/.test(cells) && /net\.AVMID/.test(cells) && /\.CT\$\{id\} > \.S2`\} to="net\.AVMID"/.test(cells) && /D\$\{id\}N/.test(cells), "bipolar senses biased to buffered AVMID with dual clamps");

// --- High risks
ck("HR-1", /PP-1u-1100/.test(db) && !/PP-1u-900/.test(db), "bus/bank film 1100 V");
ck("HR-2", !/R\$\{id\}SN[\s\S]{0,400}LlcHalfBridgeLeg/.test(cells) && !/leg\$\{id\}[\s\S]*?SN/.test(cells.split("LlcHalfBridgeLeg")[1].split("LlcSection")[0]), "LLC node RC snubbers deleted");
ck("HR-3", /WW-470R-10W/.test(db), "clamp bleeder ≥10 W axial (R2/MR-19 raised the HR-3 5 W fix — 4.3 W worst now 43% of rating)");
ck("HR-4", /RELAY_FB_\$\{k\}|RELAY_FB_/.test(cells + boards) && /M1/.test(cells) && /HFE82V-M/.test(db), "mirror-contact relays + readback nets");
ck("HR-5", /name="RFLTC"/.test(boards) && /name="CFLTC"/.test(boards), "FLT wired-OR pull-up + filter on the card at the MCU end (card-split rev)");
ck("HR-6", /R\$\{id\}PD/.test(cells), "PWM pulldowns per channel");
ck("HR-7", /GDT[123]?/.test(boards) && /MOVP/.test(boards), "L-PE MOV+GDT surge path");
ck("HR-8", /PP-4u7-1200/.test(db), "output film 1200 V");
ck("HR-9", /DM-CHOKE-SKU/.test(db) && /DM-CHOKE-30/.test(db) && /DM-CHOKE-40/.test(db) && /DM-CHOKE-50/.test(db) && /LDM1: \{ price1k: 480/.test(db),
  "DM chokes per-SKU rated (D6 rev C — ENGINE-designed per variant, E43; 120 kW reference row retained)");
// R3: the assertion previously grepped "QA01C-15S18" — a part number that does not exist at
// MORNSUN (real variants: QA01C = +20/-4 V, QA01C-18 = +18/-3 V). The gate was pinning a typo.
ck("HR-10", /QA01C\b/.test(db) && /price1k: 0/.test(db.split("biasCommon")[1] ?? ""), "bias modules in BOM; E23 deferred (biasCommon 0)");
ck("HR-11", /C\$\{id\}RST/.test(cells) && /R\$\{id\}BOOT/.test(cells), "NRST cap + BOOT0 strap");
ck("HR-12", /SQP-10R-25W/.test(db), "pre-insertion pulse resistors");

// --- Medium
ck("MR-1", /CER-25W-33R-AX/.test(db) && /CER-25W-160R-AX/.test(db) && /RPRE1" footprint=\{FilmBoxFP\(25\)\}/.test(boards), "precharge/discharge resistors on axial footprints, value-carrying codes (R5-G)");
ck("MR-6", /SNS_IOUTN/.test(boards) && /OUTN/.test(cells.split("OutputShunt")[1]), "shunt OUTN routed");
ck("MR-7", /FB\$\{id\}A/.test(cells) && /VDDA_/.test(cells), "VDDA ferrite + caps");
ck("MR-8", !/net\.NC_U\d/.test(boards), "ULN spare inputs grounded");

// ===== R2 review closure (docs/design-review-production-r2.md, 2026-09-05) =====
const fsmH = readFileSync(join(ROOT, "firmware/core/fsm.h"), "utf8");
const fsmC = readFileSync(join(ROOT, "firmware/core/fsm.c"), "utf8");
ck("R2-CB16", cells.includes('ctBurden = "2"') && cells.includes('R${id}CT`} resistance={ctBurden}') && /R2512-2R0/.test(db) && db.includes("R\\d+CT"), "resonant CT burden 2.0 Ω 2512 default (46 A rms/1:100 scaling); E42 re-scales per variant via the ctBurden prop — the default stays the frozen value");
ck("R2-CB17", /Rail3V3 id="CARD"/.test(boards), "3.3 V rail sourced on the card (one card per board role — card-split rev of CB-17/18)");
ck("R2-CB18", /TPS54202/.test(db) && !/AMS1117/.test(db), "3.3 V is a sync buck, not a 15 V-fed LDO");
ck("R2-CB19", /UF-400V-3A/.test(db) && /US2G/.test(db) && !/SS310/.test(db), "aux rectifiers 400 V ultrafast (PIV ≈ 160 V; 100 V Schottky retired)");
ck("R2-CB20", /Lp 345/.test(cells) && /0\.31/.test(cells) && /ETD34/.test(db), "aux 110 W stage values in cells + D4 rev C part");
ck("R2-CB21", /flt="net.FLT" en="net.GATE_EN_B"/.test(boards), "E40 rev: the LLC driver fault wire-OR reaches the brain on the single merged FLT line");
ck("R2-CB22", /crVal=\{pw === 50 \? "27nF" : pw === 40 \? "33nF" : "46nF"\}/.test(boards) && /crN=\{pw === 50 \? 8 : pw === 40 \? 6 : 4\}/.test(boards) && /PP-46n-1200/.test(db) && /PP-33n-1200V/.test(db) && /PP-27n-1200V/.test(db) && /IND-TRIM-BIN4/.test(db) && /IND-TRIM-BIN5-40/.test(db) && /IND-TRIM-BIN6-50/.test(db), "tank: 30 kW frozen rev D2 (4x46 nF) + E41 (6x33 nF, BIN5) + E42 (8x27 nF, BIN6) — all three asserted structurally");
ck("R2-HR14", /RPRE1: \{ price1k: 45/.test(db) && /RDIS0: \{ price1k: 45/.test(db) && /PMP_DISCH_TO_MS/.test(fsmH) && /disch_ms/.test(fsmC), "per-SKU pulse parts @120 kW + F.21 implemented in firmware");
ck("R2-HR15", /QDISA/.test(boards) && /QDISB/.test(boards) && /RBDA0/.test(boards) && /CTL_QDISBK/.test(boards), "commanded bank bleeders exist (banks no longer hold 525 V for minutes)");
ck("R2-HR16", /ISO5V-RFC-6K/.test(db) && !/B1505S-2WR2/.test(db), "iso-5V bias modules reinforced-rated (they ARE the barrier)");
ck("R2-HR17", /FAN_PWM\$\{i \+ 1\}|nFans/.test(boards) && /lanes === 4 \? 4 : 2/.test(boards), "fan ports scale with SKU (4 @120 kW, each with tach)");
ck("R2-HR18", /CMC-3PH-2mH-SKU/.test(db) && /CMC1: \{ price1k: 780/.test(db), "CM chokes per-SKU rated (D7)");
ck("R2-HR19", /dual = false/.test(cells) && /dual=\{channels === 4\}/.test(boards) && !/qtyMul: 2/.test(db), "120 kW paralleled relays are schematic instances, not BOM multipliers");
ck("R2-HR20", /RBALT\$\{id\}A/.test(cells) && /RBALTA1/.test(boards) && /RNS\d\[AB\]|RNS\$\{i\}A/.test(boards + db.replace(/\\/g, "")), "balance/star resistors 2-series HV");
ck("R2-MR11", /RAVI/.test(cells) && /CAVF/.test(cells), "AVMID buffer dual-feedback (no bare op-amp into 10 µF)");
ck("R2-MR12", /mpn: "GD32G553VET7"/.test(db) && !/GD32G553RET6/.test(db) && !/mpn: "GD32G553VET6"/.test(db), "MCU mpn is the 100-pin V suffix at a REAL order code (R5-I: only VET7/VET3 exist)");
ck("R2-MR13", /NCP1252D/.test(db) && /resistance="15k"/.test(cells), "aux controller = NCP1252D (R6-G: A-suffix could not cold-start — 120 ms delay vs 1 V hysteresis); BO divider sized for the 1.0 V threshold (brown-in ≈ 321 V)");
ck("R2-MR14", /MICROFIT3-40/.test(db) && /5 returns/.test(db), "E40 rev: 40-way 5 A-contact harness with five dedicated returns (the 2-return weakness MR-14 flagged is over-fixed)");
ck("R2-MR17", /DTVS24/.test(cells) && /SMBJ26A/.test(db), "aux rail TVS clamps (FB-open single fault)");
ck("R2-MR18", /cf="1nF"/.test(boards), "OVP-participating senses use the fast filter");
ck("R2-MR22", /CSW1/.test(cells), "HMI button ESD caps");
// class checks — categories, not instances:
for (const m of boards.matchAll(/net\.(FLT_\w+)/g)) {
  const net = m[1];
  ck(`R2-CLASS-FLT-${net}`, new RegExp(`\\["net\\.${net}", \\d+\\]`).test(boards), `${net} reaches a pin map`);
}
ck("R2-CLASS-RAIL", (boards.match(/Rail3V3 id=/g) || []).length >= 1 && (umodGen.match(/\["V3P3",null\]/g) || []).length === 3, "V3P3 sourced on the card and exported on three 88-way ways (E40 map)");
// ===== rev D ECO closures (10k-volume directive, 2026-09-05) =====
ck("ECO-2a", /PvGateDrive id="A"/.test(boards) && /PvGateDrive id="B"/.test(boards) && /VOM1271/.test(db) && !/DischargeCtl id="A"/.test(boards), "bank bleeders on PV drivers (opto+bias stacks retired; bus discharge keeps its opto chain)");
ck("ECO-2b", /p10k: 65/.test(db) && /p10k: 55/.test(db), "volume-quote p10k pricing on module classes");
ck("E23-revB", /RETIRED/.test(db.split("biasCommon")[1] ?? "") && /price1k: 0/.test(db.split("biasCommon")[1] ?? ""), "E23 custom bias transformer retired (modules permanent at 10k volume)");
ck("A7-revB", /p10k/.test(readFileSync(join(ROOT, "calculations/cost/bom-gen.mjs"), "utf8")), "BOM machinery carries the 10k tier");

// ===== R4 (2026-09-06): output return path =====
// A tscircuit <trace> joins ports, not nets, so a net-to-net trace binds nothing and ERC stays
// clean — that is how BKBN never reached the output shunt. Two checks: the shape can't come
// back, and no net may end up with fewer than two pins.
ck("R4-1", ![...cells.matchAll(/<trace [^>]*from=\{[A-Za-z_]\w*\} to=\{[A-Za-z_]\w*\}/g)].length &&
  ![...boards.matchAll(/<trace [^>]*from=\{[A-Za-z_]\w*\} to=\{[A-Za-z_]\w*\}/g)].length,
  "no net-to-net <trace> (both endpoints bare net vars bind nothing — R4)");
ck("R4-2", /<OutputShunt inn="net\.BKBN"/.test(boards) && !/outn="net\.OUTN_SH"/.test(boards),
  "output shunt sits in the bank-negative return path (BKBN -> RSHO -> OUTN)");
{ // every net must have >= 2 pins, on whichever SKUs have been built
  const { readdirSync, existsSync } = await import("node:fs");
  for (const sku of BUILDABLE_SKUS) {
    const dir = sku === "30kw" ? join(ROOT, "calculations/out/easyeda/apply")
                               : join(ROOT, "calculations/out/easyeda", sku, "apply");
    if (!existsSync(dir)) continue;
    const pins = new Map();
    for (const f of readdirSync(dir).filter(x => x.endsWith(".json")))
      for (const c of JSON.parse(readFileSync(join(dir, f), "utf8")).chunks.flat())
        for (const pin of c.pins)
          if (pin.signal_name) pins.set(pin.signal_name, (pins.get(pin.signal_name) ?? 0) + 1);
    const singles = [...pins].filter(([, n]) => n < 2).map(([n]) => n);
    ck(`R4-3-${sku}`, singles.length === 0, `${sku}: no single-pin nets${singles.length ? " — " + singles.join(", ") : ""}`);
  }
}

// ===== R3 closures (2026-09-06): program/status pins that were left floating =====
// Each of these was found by reading the netlist back, not by ERC — ERC is happy with an
// unbound pin. The check is that the pin is BOUND and that the part driving it exists.
ck("R3-RDY", /\.U\$\{id\} > \.RDY`\} to="net\.DRV_RDY"/.test(cells) && /RRDY\$\{id\}/.test(cells),
  "NSI6611 RDY wired-OR to DRV_RDY with a per-board pull-up (was floating open-drain)");
ck("R3-WDT", /CWD\$\{id\}/.test(cells) && /CRST\$\{id\}/.test(cells) &&
  /pin7: "CWD", pin8: "CRST"/.test(cells),
  "TPS3430 CWD/CRST carry their timing caps (window was undefined)");
ck("R3-RT", /name="RAUXRT"/.test(cells) && /pin4: "RT"/.test(cells),
  "NCP1252 RT has its frequency-setting resistor (stage had no defined Fsw)");
{ // and the pins must actually be bound in the emitted netlist, not merely present in the source
  const { existsSync, readdirSync } = await import("node:fs");
  for (const sku of BUILDABLE_SKUS) {
    const dir = sku === "30kw" ? join(ROOT, "calculations/out/easyeda/apply")
                               : join(ROOT, "calculations/out/easyeda", sku, "apply");
    if (!existsSync(dir)) continue;
    const want = { USUPA: [2, 4], UAUX: [4], U1H: [12] };
    const got = {};
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")))
      for (const c of JSON.parse(readFileSync(join(dir, f), "utf8")).chunks.flat())
        if (want[c.designator]) got[c.designator] = c.pins.map((p) => p.pin_number);
    const missing = Object.entries(want).flatMap(([ref, pins]) =>
      got[ref] ? pins.filter((n) => !got[ref].includes(n)).map((n) => `${ref}.${n}`) : []);
    ck(`R3-BOUND-${sku}`, missing.length === 0,
      `${sku}: R3 program pins bound${missing.length ? " — MISSING " + missing.join(", ") : ""}`);
  }
}

{ // R13 — a designator regex in parts-db that is too loose silently prices and sources unrelated
  // parts as something they are not. /^R\w+(B|CT)$/ once swept 19 parts per SKU into the 33 R CT
  // burden class, 1 MOhm bleeders included. ERC cannot see it; only value consistency can.
  const { DB } = await import("./cost/parts-db.mjs");
  const { existsSync } = await import("node:fs");
  const NARROW = { "R1206-33R-1%": 1, "FILM-100n-250": 1, "R0805-prec-0.1%": 2, "FILM-47u-VCC": 1 };
  const byRule = new Map();
  for (const sku of BUILDABLE_SKUS) for (const side of ["acdc", "dcdc"]) {
    const f = join(ROOT, "dist/boards", sku, side, "circuit.json");
    if (!existsSync(f)) continue;
    for (const c of JSON.parse(readFileSync(f, "utf8"))) {
      if (c.type !== "source_component") continue;
      const r = DB.find((x) => x.m.test(c.name)); if (!r || !NARROW[r.mpn]) continue;
      const v = Number(c.resistance ?? c.capacitance ?? c.inductance);
      if (!(v > 0)) continue;
      if (!byRule.has(r.mpn)) byRule.set(r.mpn, new Set());
      byRule.get(r.mpn).add(v);
    }
  }
  const bad = [...byRule].filter(([mpn, vs]) => vs.size > NARROW[mpn])
    .map(([mpn, vs]) => `${mpn} holds ${vs.size} values (${[...vs].join("/")})`);
  ck("R13-CLASS", bad.length === 0,
    `narrow part classes stay value-consistent — a loose designator regex mis-prices parts${bad.length ? " — " + bad.join("; ") : ""}`);
}

ck("SYNTAX-DUPKEY", (() => {
  // A repeated key in an object literal is legal JS: the last one silently wins and the earlier
  // value is lost. Four lcsc-map entries had TWO note: keys, so each had silently discarded its
  // original datasheet note. Nothing errors, nothing warns -- the text just disappears.
  const src = readFileSync(join(ROOT, "calculations/cost/lcsc-map.mjs"), "utf8");
  const re = /"([A-Za-z0-9_.%|+\-]+)":\s*\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const keys = [...m[2].matchAll(/(?:^|,)\s*([a-zA-Z_][\w]*)\s*:/g)].map((x) => x[1]);
    if (keys.some((k, i) => keys.indexOf(k) !== i)) return false;
  }
  return true;
})(), "no lcsc-map entry repeats a key — a duplicate silently discards the earlier value");

{ // R12/R9 — parts-db is FIRST-MATCH-WINS, so a broad rule can make a correct specific rule
  // unreachable. That is exactly what hid both: /^C\w+C$/ shadowed /^CVCC$/ -> EL-47u-35, and a
  // per-SKU fuse class existed but nothing routed to it. Neither errors; the BOM just quietly
  // states the wrong part. Two checks: no rule may be fully unreachable, and no narrow rule may
  // lose designators to a BROADER rule placed earlier (an ordering inversion).
  const { DB } = await import("./cost/parts-db.mjs");
  const { existsSync } = await import("node:fs");
  const des = new Set();
  for (const sku of BUILDABLE_SKUS) for (const side of ["acdc", "dcdc"]) {
    const f = join(ROOT, "dist/boards", sku, side, "circuit.json");
    if (!existsSync(f)) continue;
    for (const c of JSON.parse(readFileSync(f, "utf8"))) if (c.type === "source_component") des.add(c.name);
  }
  const D = [...des];
  const breadth = DB.map((r) => D.filter((d) => r.m.test(d)).length);
  const dead = [], inverted = [];
  for (let i = 0; i < DB.length; i++) {
    const mine = D.filter((d) => DB[i].m.test(d));
    if (!mine.length) continue;
    if (!mine.some((d) => DB.findIndex((r) => r.m.test(d)) === i)) { dead.push(DB[i].mpn); continue; }
    // `breadth` counts how many designators a regex happens to match, which is a proxy for
    // "broader" and not always the right one: /^PS\d+[HL]$/ matches more designators than
    // /^PS5\w+$/ yet is the CORRECT owner of PS5H/PS5L (there the 5 is a leg index, not 5 volts).
    // No regex comparison can settle that -- it is the author's call -- so a rule may declare the
    // mpn it deliberately takes designators from. Undeclared inversions still fail.
    const lost = mine.filter((d) => DB.findIndex((r) => r.m.test(d)) < i);
    const claimed = (d) => (DB[DB.findIndex((r) => r.m.test(d))].overrides ?? []).includes(DB[i].mpn);
    if (lost.some((d) => !claimed(d) && breadth[DB.findIndex((r) => r.m.test(d))] > breadth[i])) inverted.push(DB[i].mpn);
  }
  const msg = [dead.length ? `UNREACHABLE: ${dead.join(", ")}` : "", inverted.length ? `ORDER-INVERTED: ${inverted.join(", ")}` : ""].filter(Boolean).join(" | ");
  ck("R12-SHADOW", !dead.length && !inverted.length,
    `no parts-db rule is shadowed by an earlier, broader one${msg ? " — " + msg : ""}`);
}

{ // A component with no part_uuid is SKIPPED silently by easyeda-apply-gen — it simply does not
  // appear downstream, and its nets lose an end. Renaming KPREA/KPREB for R8 did exactly that and
  // nothing failed until a full rebuild from source: the committed sheets were right but no longer
  // reproducible, because the intermediate apply files were stale. Compare the two stages directly.
  const { existsSync, readdirSync } = await import("node:fs");
  for (const sku of BUILDABLE_SKUS) {
    const pagesDir = sku === "30kw" ? join(ROOT, "calculations/out/easyeda")
                                    : join(ROOT, "calculations/out/easyeda", sku);
    const applyDir = join(pagesDir, "apply");
    if (!existsSync(applyDir)) continue;
    const want = new Set(), got = new Set();
    for (const f of readdirSync(pagesDir).filter((x) => x.endsWith(".json"))) {
      let j; try { j = JSON.parse(readFileSync(join(pagesDir, f), "utf8")); } catch { continue; }
      for (const c of j.components ?? []) want.add(c.designator);
    }
    for (const f of readdirSync(applyDir).filter((x) => x.endsWith(".json")))
      for (const c of (JSON.parse(readFileSync(join(applyDir, f), "utf8")).chunks ?? []).flat())
        got.add(c.designator);
    const missing = [...want].filter((d) => !got.has(d));
    ck(`APPLY-COMPLETE-${sku}`, missing.length === 0,
      `${sku}: every page component reaches the apply output${missing.length ? " — DROPPED " + missing.slice(0, 8).join(", ") : ""}`);
  }
}

{ // HR-6 / E31 (FROZEN): "driver PWM inputs 10 k pulldown". Every NSI6611 PWM input needs one, or
  // its state during MCU reset depends on undocumented internal termination. DriverCh emits
  // R<id>PD for each channel, so today all 63 nets are covered — but a leg added without going
  // through DriverCh would silently float. Match on the PD SUFFIX, not on "GPD": the Vienna phases
  // name theirs RA0GPD while the half-bridges name theirs R1HPD/R1LPD, and a GPD-only filter
  // reports 24 of 36 nets "unprotected" when every one of them is fine.
  const { existsSync, readdirSync } = await import("node:fs");
  for (const sku of BUILDABLE_SKUS) {
    const dir = sku === "30kw" ? join(ROOT, "calculations/out/easyeda")
                               : join(ROOT, "calculations/out/easyeda", sku);
    if (!existsSync(dir)) continue;
    const nets = new Map();
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
      let j; try { j = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { continue; }
      for (const c of j.components ?? []) for (const p of c.pins ?? []) {
        if (!/^PWM_/.test(p.signal_name ?? "")) continue;
        if (!nets.has(p.signal_name)) nets.set(p.signal_name, []);
        nets.get(p.signal_name).push(c.designator);
      }
    }
    if (!nets.size) continue;
    const bare = [...nets].filter(([, ds]) => !ds.some((d) => /PD$/.test(d))).map(([n]) => n);
    ck(`HR-6-${sku}`, bare.length === 0,
      `${sku}: all ${nets.size} driver PWM nets carry a 10k pull-down${bare.length ? " — BARE: " + bare.slice(0, 8).join(", ") : ""}`);
  }
}

ck("SYNTAX-FPDUP", (() => {
  // Same failure mode as SYNTAX-DUPKEY, one file over: footprint-map is a flat object, so a
  // repeated key silently keeps the LAST mapping. Keys are not always line-initial, so match them
  // anywhere -- a line-anchored scan missed one of the two duplicates that actually existed.
  const src = readFileSync(join(ROOT, "calculations/footprint-map.mjs"), "utf8");
  const body = src.slice(src.indexOf("{"));
  const keys = [...body.matchAll(/"([^"\n]+)"\s*:\s*"/g)].map((m) => m[1]);
  const dup = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
  if (dup.length) console.log(`      duplicates: ${dup.join(", ")}`);
  return dup.length === 0;
})(), "no footprint-map key is mapped twice — the later mapping silently wins");

ck("SYNTAX-LCSC", (() => { try { new Function(readFileSync(join(ROOT, "calculations/cost/lcsc-map.mjs"), "utf8").replace(/^export /gm, "")); return true; } catch { return false; } })(),
  "lcsc-map.mjs parses — a syntax error there silently breaks kicad5-gen AND bom-gen");

// ORDERABLE means a specific part WAS chosen, so the sheet must name that part rather than the
// class it was chosen from. 19 entries showed a class label as their MPN while their C-number
// resolved to a different real part named only in a source note -- a reader looking up
// "SICJBS-1200-40" finds nothing, and the aux 15 V / 24 V rectifiers read as unrelated parts.
// Caught by reading a rendered sheet at working zoom, not by any existing check.
ck("LCSC-CLASS-MPN", (() => {
  const src = readFileSync(join(ROOT, "calculations/cost/lcsc-map.mjs"), "utf8");
  for (const m of src.matchAll(/"([^"]*-class)":\s*\{([^}]*)\}/g))
    if (/status:\s*"ORDERABLE"/.test(m[2]) && !/\bmpn:/.test(m[2])) return false;
  return true;
})(), "every ORDERABLE -class entry names its real manufacturer part via mpn:, so the sheet does not show a class label as a part number");

// What is PRINTED on the sheet, checked on the sheet. Both of these were invisible at whole-sheet
// zoom and obvious the moment a tile was rendered at working zoom: 67 symbols printed an internal
// "-class" suffix, and 246 resistors printed a bare number ("4.7", "220") on drawings whose other
// resistors read "10k" and "475k".
// A per-SKU override changes the PART, so the sheet must say so. F1/F2/F3 printed the same
// "FUSE-gG-690V" on 63 A, 125 A and 250 A boards, and the 120 kW sheet printed "HF167F-80A-M" on
// a 250 A relay and "CER-25W-AX" on a 50 W resistor -- a specific WRONG rating, and precisely the
// per-SKU difference a reader needs to tell the three boards apart.
ck("SKU-VALUE-MATCHES-PART", (() => {
  const ov = skuOverridesForCheck;
  for (const sku of BUILDABLE_SKUS) {
    const want = ov[sku] ?? {};
    for (const side of ["acdc", "dcdc"]) {
      const f = join(ROOT, `kicad5/dc-modules-${sku}/${sku}-${side}.sch`);
      if (!existsSync(f)) continue;
      const L = readFileSync(f, "utf8").split("\n");
      for (let i = 0; i < L.length; i++) {
        if (L[i] !== "$Comp") continue;
        let ref = "", val = "";
        for (let k = i + 1; L[k] !== "$EndComp"; k++) {
          if (L[k].startsWith('F 0 "')) ref = L[k].split('"')[1];
          else if (L[k].startsWith('F 1 "')) val = L[k].split('"')[1];
        }
        const m = want[ref]?.mpn;
        if (m && val !== m) return false;
      }
    }
  }
  return true;
})(), "every per-SKU part override is visible on the sheet, so 30/60/120 kW boards state their own ratings");

ck("SHEET-VALUE-TEXT", (() => {
  for (const sku of BUILDABLE_SKUS) for (const side of ["acdc", "dcdc"]) {
    const f = join(ROOT, `kicad5/dc-modules-${sku}/${sku}-${side}.sch`);
    if (!existsSync(f)) continue;
    const L = readFileSync(f, "utf8").split("\n");
    for (let i = 0; i < L.length; i++) {
      if (L[i] !== "$Comp") continue;
      let ref = "", val = "";
      for (let k = i + 1; L[k] !== "$EndComp"; k++) {
        if (L[k].startsWith('F 0 "')) ref = L[k].split('"')[1];
        else if (L[k].startsWith('F 1 "')) val = L[k].split('"')[1];
      }
      if (/-class$/i.test(val)) return false;                        // internal taxonomy on the drawing
      if (/^R/.test(ref) && /^\d+(\.\d+)?$/.test(val)) return false;  // unitless ohms
    }
  }
  return true;
})(), "no sheet prints an internal -class suffix, and no resistor prints a unitless value");


// --- 2026-09-08 margin-audit closure gates (F1..F8) — functional where possible, not just greps
{
  const { DB } = await import("./cost/parts-db.mjs");
  const rule = (d) => DB.find((r) => r.m.test(d));
  const mpnOf = (d) => rule(d)?.mpn;
  ck("AUD-DB-CARD", mpnOf("UCARD") === "GD32G553VET7" && mpnOf("JCARD") === "CONN-CARD-88-R" &&
    mpnOf("JA") === "CONN-CARD-88-H" && mpnOf("JB") === "CONN-CARD-88-H" && mpnOf("USUPCARD") === "TPS3430-class" &&
    mpnOf("UANDCARD") === "74HC11" && mpnOf("UBKCARD") === "TPS54202-class" &&
    mpnOf("LBKCARD") === "IND-10u-3A",
    "card-split designators all classify (MCU + 88-way + supervisor + AND + buck were absent from the BOM)");
  ck("AUD-DB-CARD-R", mpnOf("RPD0") === "R0603-10k" && mpnOf("RPDB0") === "R0603-10k" && mpnOf("RFLTC") === "R-small" &&
    mpnOf("RAGTC") === "R-small" && mpnOf("RBALTA1") === "R2512-47k-HV-AS" && mpnOf("RV1D0") === "HV73-475k-1%",
    "card resistors rescued from the HV/wirewound catch-alls WITHOUT stealing the catch-alls' own parts");
}
ck("AUD-BURDEN27", cells.includes('burden = "27"') && cells.includes('R${id}B`} resistance={burden}') && /R1206-27R-1%/.test(db) && !/R1206-33R-1%/.test(db),
  "line-CT burden defaults to 27 R (R3 fix: 150 A pk observability inside the 3.3 V rail); E42 re-scales per variant via the burden prop at the same rail budget");
ck("AUD-D2-FERRITE", /GAPPED FERRITE/.test(db) && /PQ50\/50/.test(db.match(/IND-TRIM-BIN4[\s\S]{0,400}/)?.[0] ?? ""),
  "D2 trim is gapped ferrite (F1: sendust at full 140 kHz AC swing = ~43 W core loss, 2:1 L swing)");
ck("AUD-D1-REVB", /N=39/.test(db) && /18 mm²/.test(db) && /0077908A7/.test(db),
  "D1 re-issued against the real core (AL 37) with the calculator's copper (F4)");
ck("AUD-D6-REVC", /dm-choke-design\.mjs/.test(db) && /2x T48 60u N=7/.test(db) && /2x T57 60u N=8/.test(db) && /3x T57 60u N=8/.test(db),
  "D6 rev C supersedes F7's wire-gauge fix: crest-biased L was the real binder (E43 — all three engine rows in the DB; F7 history lives in magnetics.md)");
ck("AUD-FUSE80", /FUSE-gG-690V-80A/.test(db) && !/mpn: "FUSE-gG-690V-63A"/.test(db),
  "30 kW fuse is 80 A gG 22x58 (F6: 63 A was 88% loaded and negative after enclosure/ambient derate)");
ck("AUD-CT-CATALOG", /ACX-1100/.test(db) && /AS-404/.test(db),
  "both CTs are named catalog parts (Talema — closes two REVIEW lines)");
ck("AUD-CARD-AGND2", /\["AGND_2",null\]/.test(umodGen) && /AGND_2" \? "net\.AGND"/.test(card),
  "AVMID's Kelvin return way exists (CARD_RULES said it; the map now does it)");
ck("AUD-CARD-HRTIMER", /"FLT":47/.test(umodGen) && /"PWM0":69/.test(umodGen) && /"PWM6":70/.test(umodGen) && /CARD_PWM_CONTRACT/.test(card),
  "card PWM group on the HRTIMER with FLT on HRTIMER_FLT2 (decision executed; PA6 break-input conflict dissolved)");

// AUD-CAB-COMPLETE: every cabinet netlist component reaches the cabinet apply payload.
// The silent-drop class (HFE82V, CTs, JA/JB, RSGB) has now bitten four times; the module SKUs
// are covered by APPLY-COMPLETE-<sku>, the cabinet was not — this closes it.
try {
  const cabNet = JSON.parse(readFileSync(join(ROOT, "dist/boards/cabinet/circuit.json"), "utf8"))
    .filter((e) => e.type === "source_component").map((e) => e.name);
  const cabAp = JSON.parse(readFileSync(join(ROOT, "calculations/out/easyeda/cabinet/apply/cab-CABINET.json"), "utf8"))
    .chunks.flat().map((c) => c.designator);
  const dropped = cabNet.filter((n) => !cabAp.includes(n));
  ck("AUD-CAB-COMPLETE", dropped.length === 0,
    dropped.length ? `cabinet apply DROPPED ${dropped.join(", ")}` : `cabinet: all ${cabNet.length} components reach the apply payload`);
} catch (e) {
  ck("AUD-CAB-COMPLETE", false, "cabinet build/apply missing: " + e.message);
}

// ===== E42 (2026-09-08): 50 kW LIQUID variant — structural asserts for every deliberate delta.
// Each is the grep that WOULD have found the defect had the delta been half-applied.
ck("E42-FANS", /pw === 50 \? \(air \? 4 : 0\)/.test(boards) && /RFDT/.test(boards) && /pw === 50 \? 8 : pw === 40 \? 6 :/.test(boards),
  "50 kW fans: 0 sealed-liquid / 4 air (E44), defined-low tach terminators on the liquid; 16-can link (8/half)");
ck("E42-KOUT", /dualOut=\{pw === 50\}/.test(boards) && /dual \? HV : dualOut \? \["KOUT"\]/.test(cells) && /KOUT2: \{ price1k: 460/.test(db),
  "K_OUT dual pair at 50 kW only (matrix legs single) — cell prop + board wiring + BOM instance");
ck("E42-BURDENS", /burden=\{pw === 50 \? "21\.5" : "27"\}/.test(boards) && /ctBurden=\{pw === 50 \? "1\.6" : "2"\}/.test(boards),
  "both CT burdens re-scaled at 50 kW (rail budget at the revved OC points — stress-audit BRD carries the numbers)");
ck("E42-CLASSES", /FUSE-gG-690V-160A/.test(db) && /91\.6 A line = 37%/.test(db) && /CT-LINE-2500-150A/.test(db) && /IND-PFC-103u-50/.test(db) && /XFMR-LLC-3E70-50/.test(db) && /Liquid coldplates/.test(db),
  "50 kW protection/magnetics classes + coldplate mech lines all ordered in parts-db");
ck("E42-RATING", /pw === 50 \? \(air \? "15k" : "10k"\) : pw === 40 \? "1k" : "0"/.test(boards) && /"50kw": "10000", "50kwa": "15000"/.test(readFileSync(join(ROOT, "calculations/module-interconnect-audit.mts"), "utf8")),
  "RATING straps 10k = 50 liquid / 15k = 50 AIR (E24 rev G) and the audit knows both");
{
  const grid = readFileSync(join(ROOT, "calculations/system/envelope-grid.mjs"), "utf8");
  ck("E42-GRID", /ipCeil: 65/.test(grid) && /rth: 1\.1/.test(grid) && /ref: \{ cold: 10, room: 45, hot: 65 \}/.test(grid),
    "liquid thermal model + revved tank ceiling registered IN the grid source (not a side note)");
}
{
  const fsm = readFileSync(join(ROOT, "firmware/core/fsm.c"), "utf8");
  ck("E42-FW", /kw == 50u\) \? 5000u/.test(fsm) && /50 kW window/.test(readFileSync(join(ROOT, "firmware/test/host_sim.c"), "utf8")),
    "50 kW discharge window in the FSM + both window tests in host_sim");
}

// ===== R4 (2026-09-08): external PDF-review response — every accepted claim gated so it can
// never regress. The full claim-by-claim disposition lives in the E45 register row.
ck("R4-1", /polarity seating/.test(readFileSync(join(ROOT, "calculations/kicad5-gen.mjs"), "utf8")),
  "polarized 2-pin parts SEAT SEMANTICALLY on the sheets (anode-named pin under the anode glyph) and the generator refuses unproven diodes — the netlists were always right, the sheet face was mirrored");
ck("R4-2", /pin3: "GND2"/.test(cells) && /pin16: "TEST"/.test(cells) && cells.includes("`.U${id} > .GND2`} to={kelvin}") && cells.includes("`.PS${id} > .COM`} to={kelvin}") && cells.includes("`.U${id} > .TEST`} to=\"net.DGND\"") && !/KSRC/.test(cells.split("DRV_PINS")[1].split("ISOAMP_PINS")[0]),
  "NSI6611 on its REAL pin map (datasheet Table 1.1): GND2 IS the Kelvin — bias COM, driver GND2 and FET source are one node; TEST->GND1, IN- grounded, ASC tied inactive; the fictional KSRC pin is gone");
ck("R4-3", /pin1: "FB", pin2: "BO", pin3: "CS", pin4: "RT", pin5: "GND", pin6: "DRV", pin7: "VCC", pin8: "SS"/.test(cells) && /QAUXFB > \.C"} to="\.UAUX > \.FB"/.test(cells.replace(/\s+/g, " ")) || (/QAUXFB/.test(cells) && /DZAUX/.test(cells) && /CAUXSS/.test(cells) && /pin8: "SS"/.test(cells)),
  "aux flyback: REAL NCP1252 map + opto-emulating zener-NPN loop (correct feedback SIGN — the old VCC divider into FB was positive feedback) + SS cap on the real soft-start pin");
ck("R4-4", cells.includes('REN1${id}') && cells.includes('REN2${id}') && !cells.includes('.EN`} to="net.V15"'),
  "TPS54202 EN off the 15 V rail (7 V abs max) — 100k/27k divider = 3.19 V + V15 UVLO at ~5.7 V");
ck("R4-5", /Rail3V3 id="A"/.test(boards),
  "AC-DC board sources its own V3P3 (the E40 slot removal had left it a floating island — iso-amps, clamps and pull-ups unpowered)");
ck("R4-6", /QA01C-18/.test(db),
  "gate-bias pinned to the -18 variant (+18/-3): B3M +22 V abs and SG2M body-diode -4 V limits both hold with real margin (O-11 CLOSED)");
ck("R4-7", /RM24A" resistance="82k"/.test(boards),
  "V24 monitor rescaled 68k->82k: full-scale 30.4 V (+26% observability; the old divider clipped at +7%)");
ck("R4-8", /UEXCL/.test(boards) && /KSER_GATED/.test(boards) && /"net.KSER_GATED", "net.CTL_KPARA"/.test(boards),
  "hardware S/P exclusion: 74HC02 gates the KSER coil so KSER AND (KPARA OR KPARB) cannot energize — layered over the E30 mirror readback + F.18 weld latch");

// ===== E44 (2026-09-08): 50 kW AIR variant — the upgraded-30 discipline asserted structurally.
ck("E44-UPGRADED-30", /lanes=\{1\} pw=\{50\} air/.test(readFileSync(join(ROOT, "boards/50kwa/acdc.tsx"), "utf8")) && /channels=\{1\} pw=\{50\} air/.test(readFileSync(join(ROOT, "boards/50kwa/dcdc.tsx"), "utf8")),
  "air-50 is ONE lane / ONE channel / ONE card — an upgraded 30, never a derated 60 (the user constraint, in the wrappers)");
ck("E44-LLCPAR", /par=\{pw === 50 && air\}/.test(boards) && /Q\$\{id\}H2/.test(cells) && /RG\$\{id\}H2/.test(cells) && /Q\\d\+\[HL\]2\?/.test(db),
  "LLC paralleling: cell pattern (per-device 2.2R off shared gate nets, Kelvin shared) + board wiring + BOM rule");
ck("E44-TACH4", /DI10/.test(umodGen) && /"FAN_TACH4"/.test(umodGen) && /\[39,"FAN_TACH4"\]/.test(umodGen),
  "fan-4 tach end-to-end: card pin 90 (freed ROLE0) → way 88 → harness W39 (generator-asserted, donor-proven)");
ck("E44-CLONE", /skuOverrides\["50kwa"\] = \{ \.\.\.skuOverrides\["50kw"\] \}/.test(db),
  "air-50 electrical classes are the LIQUID's by construction — the two 50s cannot drift");

// ===== R5 (2026-09-09): third external-review round — all R4 majors confirmed closed by the
// reviewer; these are the narrower items raised against the corrected sheets, each verified
// against the built netlists / datasheets before any edit (section J of verify-independent
// carries the electrical proofs; these pin the SOURCES so refactors cannot silently drop them).
const fsmSrc = readFileSync(join(ROOT, "firmware/core/fsm.c"), "utf8");
const simSrc = readFileSync(join(ROOT, "firmware/test/host_sim.c"), "utf8");
const protDoc = readFileSync(join(ROOT, "docs/protection-thresholds.md"), "utf8");
ck("R5-A", /wdoNet = nrst \?\?/.test(cells) && /nrst="net.NRST_CARD"/.test(boards),
  "watchdog WDO rides the MCU NRST net (AND inhibit retained): a hung MCU RESTARTS with enables low — R6-A upgraded the R5 net-net merge to an outright net RENAME so the sheet face shows it");
ck("R5-B", /R\$\{id\}DS`\} resistance="100"/.test(cells) && /R\$\{id\}DS > .pin2`\} to=\{`.D\$\{id\}S1 > .anode/.test(cells),
  "100 R DESAT series resistor in the one driver cell = all 9 channels/module; blanking cap stays driver-side");
ck("R5-C", /C\$\{id\}BV/.test(cells) && /C\$\{id\}VA/.test(cells) && /C\$\{id\}VB/.test(cells) && /CAND\$\{id\}/.test(cells) && /name="CAVB"/.test(cells) && /name="CCV1"/.test(cells) && /name="CSH1"/.test(cells) && /C5B\$\{id\}/.test(cells) && /CQD\$\{id\}/.test(cells) && /name="CEXCL2"/.test(boards),
  "local bypass at every flagged class: NSI6611 VCC1, AMC both sides, bias-module 1 u bulk, CAN both domains, AND/NOR/op-amp VCC, opto driver");
ck("R5-D", /UEXCL2/.test(boards) && /KSER_STG1/.test(boards) && /"net.CTL_KPREA"/.test(boards) && /\/\^UEXCL2\?\$\//.test(db),
  "hardware exclusion extended to the pre-insertion contacts: KSER_GATED = KSER AND NOT(KPARA|KPARB) AND NOT(KPREA|KPREB), two 74HC02 stages");
ck("R5-D-FW", /o->k_prea = false; o->k_preb = false; \}/.test(fsmSrc) && /excl_viol/.test(simSrc) && /matrix exclusion invariant/.test(simSrc),
  "ST_MODESW step-20 opens ALL five matrix contacts explicitly; host_sim asserts the exclusion invariant on every tick of every scenario (50th check)");
ck("R5-E", /RG\$\{id\}A1/.test(cells) && /RG\$\{id\}B1/.test(cells) && /RG\$\{id\}H1/.test(cells) && /RG\$\{id\}L1/.test(cells) && db.includes("RG([ABC]\\d+[AB]|\\d+[HL])[12]"),
  "paralleled pairs are SYMMETRIC: the original device gets its own 2.2 R branch (was: one bare gate beside a resistored twin)");
ck("R5-F", /R5-F: DC input 13.5\u201316.5 V/.test(db),
  "QA01C-18 input range (13.5-16.5 V) vs V15 = 15.0 V recorded on the BOM line; cross-regulation re-verify staged for EVT");
ck("R5-G", /CER-25W-33R-AX/.test(db) && /CER-50W-33R-AX/.test(db) && /CER-25W-160R-AX/.test(db) && /CER-50W-160R-AX/.test(db) && /SHUNT-50MV-100A/.test(db) && /SHUNT-50MV-133A/.test(db) && /SHUNT-50MV-167A/.test(db),
  "RPRE/RDIS/RSHO order codes now CARRY their value/rating per SKU — a class-only p/n could be bought at any value");
ck("R5-H", /R5-H HOLD CLOSED at R7/.test(db) && /NSI1042-DSWR/.test(db),
  "NSI1042 pin-map hold CLOSED: Rev 1.3 drawing + table agree for -DSWR and match the sheets (reviewer-verified independently); full order code in the BOM");
ck("R5-I", /R5-I: ordering table lists ONLY VET7/.test(db),
  "MCU order code corrected VET6->VET7 (GigaDevice lists only VET7 105 C / VET3 125 C; silicon and pinout unchanged) — every sheet title and map key follows");
ck("R5-K", /R5-K/.test(protDoc) && /system-level/.test(protDoc),
  "PFC reverse-direction OC honesty note: device-level DESAT covers the forward direction only; reverse events clear at SYSTEM speed (gG fuse / line OC), demonstrated at EVT both-polarity short test");

// ===== R6 (2026-09-09): fourth external-review round — reviewer confirms the R5 wave landed,
// reads the shutdown path end-to-end, and catches the drawing face + two supply-integrity items.
const protR6 = readFileSync(join(ROOT, "docs/protection-thresholds.md"), "utf8");
const fwR6 = readFileSync(join(ROOT, "docs/firmware-guide.md"), "utf8");
const pinmapR6 = readFileSync(join(ROOT, "calculations/control/umod-pinmap.mts"), "utf8");
const k5genR6 = readFileSync(join(ROOT, "calculations/kicad5-gen.mjs"), "utf8");
ck("R6-A", /wdoNet = nrst \?\?/.test(cells) && !/to=\{nrst\}/.test(cells),
  "the WDO/NRST merge is a net RENAME, not a pin-less net-net trace — the R5 implementation was electrically one node but DREW as two disconnected label groups (the R4-1 face-defect class); one name now labels every pin");
ck("R6-B", /R6 discharge-timeline honesty/.test(protR6) && /R6: this timer's REAL coverage/.test(protR6) && /F\.21 semantics \(R6\)/.test(fwR6),
  "discharge is two-phase (active to the 321 V aux brown-out, then passive 2x47k to 60 V, 4-10 min + 62477-1 label) and F.21 is documented as the AC-PRESENT latch — no more powered-to-60V claims");
ck("R6-C", /INSTANCE- and POLARITY-aware/.test(protR6) && /COMPARATOR-capable/.test(pinmapR6) && /PFC reverse-direction hardware trip/.test(fwR6),
  "reverse-polarity PFC OC has a DESIGNATED us-class path (line-CT -> on-chip CMP -> HRTIMER FLT) with the A6 pin constraint registered at the generator — not just an honesty note");
ck("R6-D", /CVCCB/.test(cells) && /CSR1/.test(cells),
  "last two bypass gaps closed: NCP1252 VCC 100 n at the pin, 74HC595 supply decoupled");
ck("R6-E", /USHO > .VINP" to=".RSHO > .KB/.test(cells) && /positive \(SNS_IOUT/.test(fwR6),
  "output shunt differential flipped so delivering current reads POSITIVE; sign convention + bring-up check in firmware-guide");
ck("R6-G", /mpn: "NCP1252D"/.test(db) && /name="CVCC" capacitance="220uF"/.test(cells) && /EL-220u-35/.test(db),
  "aux controller A->D: the A version could not cold-start (mandatory 120 ms pre-start delay vs 1.0 V hysteresis = 28-60 ms of reservoir); D has no delay + 5 V hysteresis; CVCC 220 uF = 3x the 67 uF budget");
ck("R6-H", /MAGNETICS CONSTRUCTION/.test(k5genR6),
  "sheet NOTES now print the magnetics identity (cores, turns, bins, litz) — the part labels are no longer the only carrier on the deliverable face");

// ===== R7 (2026-09-09): fifth external-review round — reviewer closes the R6 wave (and the
// NSI1042 hold, with the Rev 1.3 datasheet) and catches the comparator-INSTANCE conflict the
// R6 "CMP-capable pin" rule missed, plus a typ-vs-min misread in the PV bleeder claim.
const pinmapR7 = readFileSync(join(ROOT, "calculations/control/umod-pinmap.mts"), "utf8");
const genR7 = readFileSync(join(ROOT, "packages/common-components/umod-map.gen.ts"), "utf8");
ck("R7-A", /AIN9: 25/.test(pinmapR7) && /AIN11: 15/.test(pinmapR7) && /"AIN9":25/.test(genR7.replace(/\s/g, "")) && /CMP1_IP/.test(pinmapR7) && /INSTANCE- and POLARITY-aware/.test(readFileSync(join(ROOT, "docs/protection-thresholds.md"), "utf8")),
  "comparator allocation is INSTANCE-aware: AIN9<->AIN11 swapped in the ONE generator (I_B0 -> PA3/CMP1_IP; B and C no longer share CMP2's two inputs) — verified against GD32G553 Rev 2.0 Fig 2-3");
ck("R7-B", /IF = 10 mA \(Voc ≥ 7.8 V, Isc ≥ 6.0 µA\)/.test(cells) && /resistance="6.8M"/.test(cells) && /QPVD/.test(boards) && /Vth\(max\) ≤ 3.5 V, Igss ≤ 100 nA/.test(db),
  "PV bleeder drive moved to the ONLY guaranteed spec point (V15-fed 11 mA via QPVD, 6.8 M gate bleed, chord >=5.8 V) — the prior claim used a typical current as a worst case (reviewer catch)");
ck("R7-C", /NSI1042-DSWR/.test(db) && /HOLD CLOSED at R7/.test(db),
  "CAN transceiver hold closed with the full order code — Rev 1.3 drawing and table agree and match the sheets exactly (reviewer-verified independently)");
ck("R7-D", /BIASED value governs/.test(readFileSync(join(ROOT, "calculations/kicad5-gen.mjs"), "utf8")) && /Lm 63uH/.test(readFileSync(join(ROOT, "calculations/kicad5-gen.mjs"), "utf8")),
  "the 30 kW D1 panel row carries the biased-inductance value (169 uH L0 is NOT the full-current L) and the D3 row carries the numerical Lm target");
ck("R7-E", /DESIGN TARGET until measured/.test(readFileSync(join(ROOT, "docs/protection-thresholds.md"), "utf8")) && /AND\nverify <60 V at the link/.test(readFileSync(join(ROOT, "docs/protection-thresholds.md"), "utf8")),
  "honesty language: the 2-3 us trip is a target until EVT measures it (ACX HF response unspecified), and the service label reads wait AND verify — never wait OR verify");

// ===== R8 (2026-09-09): sixth external-review round — reviewer closes the comparator swap, the
// PV rework and the CAN order code, and lands a correction ON US: the 40/50 kW links carry TWO
// parallel balance strings per half (94k full-link), so the R7 report's dismissal of their 222 s
// figure was OUR arithmetic error. Model, docs and register corrected; panels gain the missing
// Lm lines and the RIGHT turns (30 kW is 7:7:7 per E8, 50 kW is 6:6:6 per D3-50 — both had been
// transcribed 9:9:9 when the panel was introduced at R6-H).
const k5genR8 = readFileSync(join(ROOT, "calculations/kicad5-gen.mjs"), "utf8");
const protR8 = readFileSync(join(ROOT, "docs/protection-thresholds.md"), "utf8");
ck("R8-A", /nSets/.test(readFileSync(join(ROOT, "calculations/stress-audit.mjs"), "utf8")) && /370 \/ 222 \/ 296/.test(protR8) && /retracted at E49/.test(protR8),
  "discharge model counts the DRAWN balance strings per SKU (30=188k, 40/50=94k full-link); the wrong dismissal is retracted in the register, and verify-independent proves the counts from the netlists");
ck("R8-B", /7:7:7 \(E8\)/.test(k5genR8) && /6:6:6 \(D3-50/.test(k5genR8) && k5genR8.split("Lm 63uH").length === 4,
  "MAG panels: correct turns per SKU (7:7:7 / 9:9:9 / 6:6:6) and the Lm 63uH ±7% line on ALL THREE dcdc rows — the R6-H panel had transcribed two SKUs' turns wrong and printed Lm only at 30 kW");
ck("R8-C", /resistance="1k" footprint="2010"/.test(cells) && /R2010-1k-0.75W/.test(db) && /25 °C-ENDPOINT MODEL/.test(db),
  "PV LED feed 1.2k→1k/2010 (≥10 mA held to the 13.5 V rail floor, 31% of rating at the 16.5 V corner) and the gate-voltage claim de-escalated from guarantee to 25 °C-endpoint model with declared ambient + EVT gate");

console.log(fail ? `\n${fail} CHECK(S) FAILED` : "\nALL REVIEW CHECKS PASS");
process.exit(fail ? 1 : 0);
