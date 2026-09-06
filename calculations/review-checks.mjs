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
  for (const sku of ["30kw", "60kw", "120kw"]) {
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
ck("R3-RT", /name="RAUXRT"/.test(cells) && /pin9: "RT"/.test(cells),
  "NCP1252A RT has its frequency-setting resistor (stage had no defined Fsw)");
{ // and the pins must actually be bound in the emitted netlist, not merely present in the source
  const { existsSync, readdirSync } = await import("node:fs");
  for (const sku of ["30kw", "60kw", "120kw"]) {
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
  for (const sku of ["30kw", "60kw", "120kw"]) for (const side of ["acdc", "dcdc"]) {
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
  for (const sku of ["30kw", "60kw", "120kw"]) for (const side of ["acdc", "dcdc"]) {
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
    const lost = mine.filter((d) => DB.findIndex((r) => r.m.test(d)) < i);
    if (lost.some((d) => breadth[DB.findIndex((r) => r.m.test(d))] > breadth[i])) inverted.push(DB[i].mpn);
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
  for (const sku of ["30kw", "60kw", "120kw"]) {
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
  for (const sku of ["30kw", "60kw", "120kw"]) {
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

console.log(fail ? `\n${fail} CHECK(S) FAILED` : "\nALL REVIEW CHECKS PASS");
process.exit(fail ? 1 : 0);
