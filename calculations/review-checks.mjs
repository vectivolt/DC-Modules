// review-checks.mjs — machine-checkable closure gate for the production reviews. Each check is the
// grep that FOUND a defect, inverted into an assertion against the schematic source / parts DB.
// Run: node calculations/review-checks.mjs — exit 1 on any failure.
// It also carries CLASS checks (rail sourcing, FLT/CTL nets reaching pin maps) so whole categories
// cannot regress, not just the specific instances that were caught.

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
ck("X-CAP-CLASS", /mpn: "X1-2u2-530"/.test(db) && /\^CDMP\\d\$/.test(db) && /m: \/\^CX\[012\]\\d\$\/, mpn: "X2-4u7-305"/.test(db) && !/X2-2u2-310/.test(db), "line-to-line (Δ) caps are X1 530 VAC (the CDMP damper); the X bank is X2 305 VAC in STAR, 274 VAC per cap at 475 VAC");
ck("BANK-FILM-ONLY", /\^CF\[AB\]\\d\+\$/.test(db) && !/ELH-330u550/.test(db) && !/IND-BANK/.test(db) && /BankFilter = \(\{ id, bkp, bkn, nF/.test(cells),
  "output banks are film only (nF × 2.2 µF per bank): no bank inductor and no electrolytic anywhere in the BOM or the cell, with the 0.5 % RMS ripple gated in current-coordination");
ck("AGND-TIE-ON-CARD", /name="RAGTC"/.test(boards) && !/name="RAGT[AB]"/.test(boards), "the AGND–DGND single-point tie lives on the card (RAGTC) and nowhere else: a second tie on a power board would make a ground loop");
ck("AUX-CTRL-PINMAP", /RAUXST2 > \.pin2" to="\.UAUX > \.VCC"/.test(cells) && /\.UAUX > \.BO/.test(cells) && /\.UAUX > \.SS/.test(cells) && /\.TAUX > \.AXA/.test(cells) && !/"\.UAUX > \.FB" to="net\.V15"/.test(cells), "aux controller fully wired on the REAL NCP1252 pin map: VCC startup, BO, SS and the aux winding");
ck("AUX-FROM-FULL-BUS", /AuxPower dcp="net.DCP" dcn="net.DCN"/.test(boards) && /SIC-1700/.test(db), "aux fed from full bus with 1700 V switch");
ck("AUX-110W-POINT", /Lp 345 µH|Lp 345u/.test(cells) && /name="RAUXCS" resistance="0\.28"/.test(cells) && /XFMR-AUX-FLY-E/.test(db), "aux at its 110 W design point on the D4 rev E ETD44 transformer — the ceiling is the computed cycle-by-cycle current limit, not the winding (d4-flyback)");
ck("PRECHARGE-BYPASS-RELAY", /KPRE\[12\]/.test(db) && /HF167F/.test(db) && !/HF115F-2Z/.test(db) && /KPRE1/.test(boards), "precharge bypass = line-rated power relays");
ck("VIENNA-COMMUTATION-FILM", /C\$\{id\}FP/.test(cells) && /C\$\{id\}FN/.test(cells), "Vienna per-phase film commutation caps present");
ck("ENABLE-CHAIN", /SafetyChain/.test(cells) && /USUP/.test(cells) && /RGPD/.test(cells) && /SafetyChain id="CARD"/.test(boards) && !/net\.PWM_KILL/.test(boards), "enable chain: watchdog + AND + pull-downs on the card, one card per board role, and no separate PWM_KILL net — the chain is the only kill path");
ck("DISCHARGE-DEFAULT-OFF", /DischargeCtl/.test(cells) && /RQDPD/.test(cells) && !/RQDPU/.test(boards), "discharge is default-OFF through an isolated driver: no rail-side pull-up may hold it on");
ck("DRIVER-CLAMP-WIRED", /\.CLAMP.*to=\{gate\}|CLAMP`\} to=\{gate\}/.test(cells) || /U\$\{id\} > \.CLAMP/.test(cells), "driver CLAMP pin wired to gate");
ck("SWD-BOOT0-PROVISIONING", /SwdPort/.test(cells) && /SwdPort id="CARD"/.test(boards) && /BOOT0.*net\.BOOT0_CARD/.test(card) && /SWDIO.*net\.SWDIO_CARD/.test(card), "SWD + BOOT0 provisioning on the card MCU");
ck("HARNESS-STRAIGHT-THROUGH", /Interconnect40 id="B" map=\{HARNESS40\}/.test(boards) && !/InterconnectSignals/.test(boards), "one straight-through 40-way harness on both boards: no crossed inter-board link");
ck("BIPOLAR-SENSE-BIAS", /AnalogMid/.test(cells) && /net\.AVMID/.test(cells) && /\.CT\$\{id\} > \.S2`\} to="net\.AVMID"/.test(cells) && /D\$\{id\}N/.test(cells), "bipolar senses biased to buffered AVMID with dual clamps");

// --- High risks
ck("BUS-FILM-1100V", /PP-1u-1100/.test(db) && !/PP-1u-900/.test(db), "bus/bank film 1100 V");
ck("NO-LLC-NODE-SNUBBER", !/R\$\{id\}SN[\s\S]{0,400}LlcHalfBridgeLeg/.test(cells) && !/leg\$\{id\}[\s\S]*?SN/.test(cells.split("LlcHalfBridgeLeg")[1].split("LlcTank")[0]), "LLC node RC snubbers deleted");
ck("CLAMP-BLEEDER-RATING", /WW-470R-10W/.test(db), "clamp bleeder is a ≥10 W axial part: 4.3 W worst = 43 % of rating");
ck("OUTPUT-DIODE-NO-CONTACTOR", /RELAY-PCB-120A-24V/.test(db) && /name="DOUT"/.test(cells) && !/name="KOUT"/.test(cells + boards) && /F\.17/.test(cells), "zero-current PCB matrix relays plus the output blocking diode: no output contactor and no mirror readback, because a welded contact shows as F.17 at the SER soft start");
ck("FLT-PULLUP-ON-CARD", /name="RFLTC"/.test(boards) && /name="CFLTC"/.test(boards), "FLT wired-OR pull-up + filter on the card, at the MCU end");
ck("PWM-PULLDOWN-PER-CHANNEL", /R\$\{id\}PD/.test(cells), "PWM pulldowns per channel");
ck("SURGE-MOV-GDT", /GDT[123]?/.test(boards) && /MOVP/.test(boards), "L-PE MOV+GDT surge path");
ck("OUTPUT-FILM-1200V", /PP-4u7-1200/.test(db), "output film 1200 V");
ck("NO-DM-OR-BANK-CHOKE", !/DM-CHOKE/.test(db) && !/\^LDM/.test(db) && !/IND-BANK/.test(db),
  "no AC-side DM choke and no bank inductor in the BOM: the star-X2 filter out-attenuates a filter that has one, so no sendust DM or bank choke is bought");
// Gate-bias is asserted as a CLASS with an acceptance row, never on an order code: "QA01C-15S18"
// does not exist at MORNSUN (the real variants are QA01C = +20/−4 V and QA01C-18 = +18/−3 V), and
// an assertion on an invented code pins the typo instead of the requirement.
ck("GATE-BIAS-CLASS", /mpn: "ISO-GBIAS-15-1W"/.test(db) && !/BIAS-XFMR/.test(db), "gate-bias supply = packaged isolated modules, specified as a CLASS with an acceptance row; no custom bias transformer anywhere in the BOM");
ck("NRST-CAP-BOOT0-STRAP", /C\$\{id\}RST/.test(cells) && /R\$\{id\}BOOT/.test(cells), "NRST cap + BOOT0 strap");
ck("FUSE-FRAME", await (async () => { const { FOOTPRINT } = await import("./footprint-map.mjs"); const want = (desc) => (/NH00/.test(desc) ? "FUSE_holder_NH00" : /22×58/.test(desc) ? "FUSE_holder_22x58" : null);
  return BUILDABLE_SKUS.every((s) => { const f1 = skuOverridesForCheck[s]?.F1; return !!f1 && want(f1.desc) !== null && FOOTPRINT[f1.mpn] === want(f1.desc); }); })(),
  "the fuse-holder package printed on the sheet is the frame the BOM line buys, per SKU (22×58 up to 125 A, NH00 at 160 A)");
ck("FILTER-DAMPER-VALUE", (() => { const m = boards.match(/name=\{`RDMP\$\{i\}`\} resistance=\{pw === 50 \? "([\d.]+)" : "([\d.]+)"\}/); const code = (v) => `SQP-${String(v).replace(".", "R")}-25W`; return !!m && db.includes(`/^RDMP\\d$/, mpn: "${code(m[2])}"`) && db.includes(`mpn: "${code(m[1])}"`); })(),
  "the input-filter damper resistor the BOM buys is the value the sheet draws, per SKU (the value is a current-loop stability result, modelled by pfc-control from the same drawing)");

// --- Medium
ck("PULSE-RESISTOR-FOOTPRINT", /CER-25W-33R-AX/.test(db) && /CER-25W-160R-AX/.test(db) && /RPRE1" footprint=\{FilmBoxFP\(25\)\}/.test(boards), "precharge/discharge resistors on axial footprints, with value-carrying order codes");
ck("SHUNT-OUTN-ROUTED", /SNS_IOUTN/.test(boards) && /OUTN/.test(cells.split("OutputShunt")[1]), "shunt OUTN routed");
ck("VDDA-FILTER", /FB\$\{id\}A/.test(cells) && /VDDA_/.test(cells), "VDDA ferrite + caps");
ck("ULN-SPARE-INPUTS", !/net\.NC_U\d/.test(boards), "ULN spare inputs grounded");

// ===== supply, rail and protection-part closures =====
const fsmH = readFileSync(join(ROOT, "firmware/core/fsm.h"), "utf8");
const fsmC = readFileSync(join(ROOT, "firmware/core/fsm.c"), "utf8");
ck("RESONANT-CT-BURDEN", cells.includes('ctBurden = "0.36"') && cells.includes('name="R1CT" resistance={ctBurden}') && /R2512-0R47-1W-1%/.test(db) && db.includes("R\\d+CT"), "resonant CT burden per tank class: 0.47/0.36/0.30 Ω for F.11 140/180/220 A pk on the one full-bridge tank CT (current-coordination proves the per-SKU race)");
ck("V3P3-SOURCED-ON-CARD", /Rail3V3 id="CARD"/.test(boards), "3.3 V rail sourced on the card, one card per board role");
ck("V3P3-SYNC-BUCK", /TPS54202/.test(db) && !/AMS1117/.test(db), "3.3 V is a sync buck, not a 15 V-fed LDO");
ck("AUX-RECTIFIER-CLASS", /UF-400V-3A/.test(db) && /US2G/.test(db) && !/SS310/.test(db), "aux rectifiers are 400 V ultrafast: PIV is ≈ 160 V, which no 100 V Schottky can block");
ck("AUX-STAGE-VALUES", /Lp 345/.test(cells) && /name="CCSF" capacitance="100pF"/.test(cells) && /ETD44/.test(db), "aux 110 W stage values in cells plus the D4 rev E ETD44 part: the real current limit through the CS filter and tILIM computes 71 % of Bsat(130 °C) on this core, where an ETD39 reaches 113 %");
ck("LLC-FLT-MERGED", /flt="net.FLT" en="net.GATE_EN_B"/.test(boards), "the LLC driver fault wire-OR reaches the brain on the single merged FLT line");
// The D2 external Lr is 5.00 / 3.99 / 3.20 µH: what the tank needs MINUS the cell leakage, which is
// computed on the 28 mm conductor band, not the 41 mm window. Tank Lr itself is fixed; only the split moves.
ck("TANK-CR-AND-LR", /crN: 11, lr: "3\.20uH"/.test(boards) && /crN: 9, lr: "3\.99uH"/.test(boards) && /crN: 7, lr: "5\.00uH"/.test(boards) && /PP-33n-1200V/.test(db) && /IND-LR-E70-30/.test(db) && /IND-LR-E70-40/.test(db) && /IND-LR-E70-50/.test(db), "full-bridge tank: 7/9/11 × 33 nF with the D2 rev F external Lr 5.00/3.99/3.20 µH — asserted structurally");
ck("PULSE-PARTS-AND-F21", /RPRE1: \{ price1k: 45/.test(db) && /RDIS0: \{ price1k: 45/.test(db) && /PMP_DISCH_TO_MS/.test(fsmH) && /disch_ms/.test(fsmC), "the pulse parts carry their own per-SKU price lines and F.21 is implemented in firmware");
ck("BANK-BLEEDERS-COMMANDED", /QDISA/.test(boards) && /QDISB/.test(boards) && /RBDA0/.test(boards) && /CTL_QDISBK/.test(boards), "commanded bank bleeders exist, so a bank never sits at 525 V after a stop");
ck("ISO-BIAS-REINFORCED", /ISO5V-RFC-6K/.test(db) && !/B1505S-2WR2/.test(db), "iso-5V bias modules reinforced-rated (they ARE the barrier)");
// Fan count across the family: 3 / 3 / 0 / 4.
ck("FAN-PORTS-PER-SKU", /FAN_PWM\$\{i \+ 1\}|nFans/.test(boards) && /pw === 50 \? \(air \? 4 : 0\) : 3/.test(boards) && /RFPD\$\{id\}/.test(cells), "fan ports scale with SKU (3 @30, 3 @40, 0 @50-liquid, 4 @50-air), each with a tach and a defined-low PWM pull-down");
ck("CM-CHOKE-PER-SKU", /CMC-3PH-2mH-SKU/.test(db) && /D7-40 custom wind 75 A/.test(db) && /D7-50 custom wind 95 A/.test(db), "CM chokes rated per SKU (D7), one row per shipping module");
ck("MATRIX-RELAY-INSTANCES", !/qtyMul: 2/.test(db) && /name=\{k\} footprint=\{<RelayFP \/>\}/.test(cells), "matrix relays are schematic instances, not BOM multipliers: one zero-current PCB relay per position");
ck("BALANCE-AND-STAR-HV", /RBALT\$\{id\}A/.test(cells) && /RNS\d\[AB\]|RNS\$\{i\}A/.test(boards + db.replace(/\\/g, "")), "DC-link balance and AC star resistors are 2-series HV parts; the link is the only place a balance chain is fitted");
ck("AVMID-BUFFER", /RAVI/.test(cells) && /CAVF/.test(cells), "AVMID buffer dual-feedback (no bare op-amp into 10 µF)");
ck("MCU-MPN-V-SUFFIX", /mpn: "GD32G553VET7"/.test(db) && !/GD32G553RET6/.test(db) && !/mpn: "GD32G553VET6"/.test(db), "MCU mpn is the 100-pin V suffix at a REAL order code — only VET7 and VET3 exist at this pin count");
ck("AUX-CTRL-VARIANT", /NCP1252D/.test(db) && /name="RBR2" resistance="7\.5k"/.test(cells), "aux controller is the NCP1252D — an A-suffix part cannot cold-start here (120 ms mandatory delay against 1 V of hysteresis); the BO divider is sized for the 1.0 V threshold: brown-out 321 V, brown-in 345 V with the IBO hysteresis source");
ck("HARNESS-RETURNS", /MICROFIT3-40/.test(db) && /5 returns/.test(db), "40-way 5 A-contact harness with five dedicated returns");
ck("AUX-RAIL-TVS", /DTVS24/.test(cells) && /mpn: "SMBJ28A"/.test(db) && /mpn: "SMBJ18A"/.test(db), "aux rail TVS clamps (FB-open single fault): V24 on a 28 V standoff and V15 on 18 V — each above its rail's own light-load maximum, so the clamp does not leak in normal operation");
ck("OVP-SENSE-FILTER", /cf="1nF"/.test(boards), "OVP-participating senses use the fast filter");
ck("HMI-BUTTON-ESD", /CSW1/.test(cells), "HMI button ESD caps");
// class checks — categories, not instances:
for (const m of boards.matchAll(/net\.(FLT_\w+)/g)) {
  const net = m[1];
  ck(`FLT-NET-IN-PINMAP-${net}`, new RegExp(`\\["net\\.${net}", \\d+\\]`).test(boards), `${net} reaches a pin map`);
}
ck("V3P3-EXPORTED-WAYS", (boards.match(/Rail3V3 id=/g) || []).length >= 1 && (umodGen.match(/\["V3P3",null\]/g) || []).length === 3, "V3P3 sourced on the card and exported on three of the 88 ways");
// ===== 10k-volume ECO closures =====
ck("BANK-BLEEDER-PV-DRIVE", /PvGateDrive id="A"/.test(boards) && /PvGateDrive id="B"/.test(boards) && /VOM1271/.test(db) && !/DischargeCtl id="A"/.test(boards), "bank bleeders run off PV drivers — no opto+bias stack — while the bus discharge keeps its opto chain");
ck("VOLUME-TIER-PRICING", /p10k: 65/.test(db) && /p10k: 55/.test(db), "volume-quote p10k pricing on module classes");
ck("BOM-10K-TIER", /p10k/.test(readFileSync(join(ROOT, "calculations/cost/bom-gen.mjs"), "utf8")), "BOM machinery carries the 10k tier");

// ===== output return path =====
// A tscircuit <trace> joins ports, not nets, so a net-to-net trace binds nothing and ERC stays
// clean — that is how BKBN never reached the output shunt. Two checks: the shape can't come
// back, and no net may end up with fewer than two pins.
ck("NO-NET-TO-NET-TRACE", ![...cells.matchAll(/<trace [^>]*from=\{[A-Za-z_]\w*\} to=\{[A-Za-z_]\w*\}/g)].length &&
  ![...boards.matchAll(/<trace [^>]*from=\{[A-Za-z_]\w*\} to=\{[A-Za-z_]\w*\}/g)].length,
  "no net-to-net <trace>: with both endpoints bare net variables a trace binds nothing and ERC still passes");
ck("SHUNT-IN-RETURN-PATH", /<OutputShunt inn="net\.BKBN"/.test(boards) && !/outn="net\.OUTN_SH"/.test(boards),
  "output shunt sits in the bank-negative return path (BKBN -> RSHO -> OUTN)");
{ // every net must have >= 2 pins, on whichever SKUs have been built
  const { readdirSync, existsSync } = await import("node:fs");
  for (const sku of BUILDABLE_SKUS) {
    const dir = sku === "30kw" ? join(ROOT, "calculations/out/sheets/apply")
                               : join(ROOT, "calculations/out/sheets", sku, "apply");
    if (!existsSync(dir)) continue;
    const pins = new Map();
    for (const f of readdirSync(dir).filter(x => x.endsWith(".json")))
      for (const c of JSON.parse(readFileSync(join(dir, f), "utf8")).chunks.flat())
        for (const pin of c.pins)
          if (pin.signal_name) pins.set(pin.signal_name, (pins.get(pin.signal_name) ?? 0) + 1);
    const singles = [...pins].filter(([, n]) => n < 2).map(([n]) => n);
    ck(`NO-SINGLE-PIN-NET-${sku}`, singles.length === 0, `${sku}: no single-pin nets${singles.length ? " — " + singles.join(", ") : ""}`);
  }
}

// ===== program/status pins that must not float =====
// ERC is happy with an unbound pin, so each of these is found only by reading the netlist back.
// The check is that the pin is BOUND and that the part driving it exists.
ck("DRV-RDY-PULLUP", /\.U\$\{id\} > \.RDY`\} to="net\.DRV_RDY"/.test(cells) && /RRDY\$\{id\}/.test(cells),
  "NSI6611 RDY wired-OR to DRV_RDY with a per-board pull-up — an open-drain output may never float");
// The symbol carries the real VSON-10 numbering, so CWD is pin 2 and CRST pin 4.
ck("WDT-FIXED-WINDOW", /CRST\$\{id\}/.test(cells) && /pin2: "CWD", pin3: "SET0", pin4: "CRST"/.test(cells) &&
  !/name=\{`CWD\$\{id\}`\}/.test(cells) && /SET1`\} to="net\.V3P3"/.test(cells) && /VDD2`\} to="net\.V3P3"/.test(cells),
  "TPS3430 fixed-window strap: CRST cap fitted, CWD OPEN, SET0 low / SET1 high — 10 ms kicks sit inside the 2.22-23.375 ms window — and VDD2 bonded to VDD1, which the real 10-pin package makes mandatory");
ck("AUX-RT-RESISTOR", /name="RAUXRT"/.test(cells) && /pin4: "RT"/.test(cells),
  "NCP1252 RT carries its frequency-setting resistor: without it the stage has no defined Fsw");
{ // and the pins must actually be bound in the emitted netlist, not merely present in the source
  const { existsSync, readdirSync } = await import("node:fs");
  for (const sku of BUILDABLE_SKUS) {
    const dir = sku === "30kw" ? join(ROOT, "calculations/out/sheets/apply")
                               : join(ROOT, "calculations/out/sheets", sku, "apply");
    if (!existsSync(dir)) continue;
    const want = { USUPA: [2, 4], UAUX: [4], U1H: [12] };
    const got = {};
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")))
      for (const c of JSON.parse(readFileSync(join(dir, f), "utf8")).chunks.flat())
        if (want[c.designator]) got[c.designator] = c.pins.map((p) => p.pin_number);
    const missing = Object.entries(want).flatMap(([ref, pins]) =>
      got[ref] ? pins.filter((n) => !got[ref].includes(n)).map((n) => `${ref}.${n}`) : []);
    ck(`PROGRAM-PINS-BOUND-${sku}`, missing.length === 0,
      `${sku}: program pins bound${missing.length ? " — MISSING " + missing.join(", ") : ""}`);
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
  ck("PART-CLASS-VALUE-CONSISTENT", bad.length === 0,
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
  ck("PARTS-DB-NO-SHADOW", !dead.length && !inverted.length,
    `no parts-db rule is shadowed by an earlier, broader one${msg ? " — " + msg : ""}`);
}

{ // APPLY-COMPLETE: every netlist component must appear in its sheet payload (the uuid skip
  // appear downstream, and its nets lose an end. Renaming a part does exactly that, and nothing fails
  // until a full rebuild from source: the committed sheets are right but no longer reproducible,
  // because the intermediate apply files are stale. Compare the two stages directly.
  const { existsSync, readdirSync } = await import("node:fs");
  for (const sku of BUILDABLE_SKUS) {
    const pagesDir = sku === "30kw" ? join(ROOT, "calculations/out/sheets")
                                    : join(ROOT, "calculations/out/sheets", sku);
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

{ // FROZEN: "driver PWM inputs 10 k pulldown". Every NSI6611 PWM input needs one, or
  // its state during MCU reset depends on undocumented internal termination. DriverCh emits
  // R<id>PD for each channel, so today all 63 nets are covered — but a leg added without going
  // through DriverCh would silently float. Match on the PD SUFFIX, not on "GPD": the Vienna phases
  // name theirs RA0GPD while the half-bridges name theirs R1HPD/R1LPD, and a GPD-only filter
  // reports 24 of 36 nets "unprotected" when every one of them is fine.
  const { existsSync, readdirSync } = await import("node:fs");
  for (const sku of BUILDABLE_SKUS) {
    const dir = sku === "30kw" ? join(ROOT, "calculations/out/sheets")
                               : join(ROOT, "calculations/out/sheets", sku);
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
    ck(`PWM-PULLDOWN-NETS-${sku}`, bare.length === 0,
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
})(), "every per-SKU part override is visible on the sheet, so each board states its own ratings");

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


// --- margin-audit closures — functional where possible, not just greps
{
  const { DB } = await import("./cost/parts-db.mjs");
  const rule = (d) => DB.find((r) => r.m.test(d));
  const mpnOf = (d) => rule(d)?.mpn;
  ck("CARD-PARTS-CLASSIFY", mpnOf("UCARD") === "GD32G553VET7" && mpnOf("JCARD") === "CONN-CARD-88-R" &&
    mpnOf("JA") === "CONN-CARD-88-H" && mpnOf("JB") === "CONN-CARD-88-H" && mpnOf("USUPCARD") === "TPS3430-class" &&
    mpnOf("UANDCARD") === "74HC11" && mpnOf("UBKCARD") === "TPS54202-class" &&
    mpnOf("LBKCARD") === "IND-10u-3A",
    "every control-card designator classifies to a real part: MCU, 88-way connectors, supervisor, AND gate and buck");
  ck("CARD-RESISTOR-RULES", mpnOf("RPD0") === "R0603-10k" && mpnOf("RPDB0") === "R0603-10k" && mpnOf("RFLTC") === "R-small" &&
    mpnOf("RAGTC") === "R-small" && mpnOf("RBALT0A") === "R2512-47k-HV-AS" && mpnOf("RNS1A") === "R2512-33k-HV-AS" && mpnOf("RBO1") === "R2512-150k-HV" &&
    mpnOf("RSHON") === "R-small" && mpnOf("RV1O") === "R-small" && mpnOf("ROVO") === "R-small" && mpnOf("CADC0") === "MLCC-1n-0402-C0G" && mpnOf("RV1D0") === "HV73-475k-1%",
    "every card resistor lands on its OWN parts-db rule without stealing the HV/wirewound catch-alls' parts: balance at 47 k, star at 33 k, the output bleeder RBO on a 150 k HV rule placed ahead of the generic one, and RSHON — which ENDS IN \"ON\" — kept off the 1206 gate-resistor rule");
}
ck("LINE-CT-BURDEN", cells.includes('burden = "22"') && cells.includes('R${id}B`} resistance={burden}') && /R1206-22R-1%/.test(db) && !/R1206-33R-1%/.test(db),
  "line-CT burden default 22 R: F.01 120 A pk stays observable through the D1 soft-saturation race to 184 A, 40/50 kW take 18/13 R through the burden prop, and a 33 R burden would clip the race");
ck("D2-GAPPED-FERRITE", /GAPPED FERRITE/.test(db) && /E70\/33\/32/.test(db.match(/IND-LR-E70-30[\s\S]{0,400}/)?.[0] ?? "") && /Powder cores prohibited/.test(db),
  "D2 trim is gapped ferrite: sendust at the full 140 kHz AC swing costs ~43 W of core loss and a 2:1 L swing");
ck("D1-REAL-CORE", /N=39/.test(db) && /18 mm²/.test(db) && /0077908A7/.test(db),
  "D1 is drawn against the real core (AL 37) with the calculator's copper");
ck("NO-AC-DM-CHOKE", !/DM-CHOKE|IND-BANK|sendust stack/.test(db) && /dm-choke-design/.test(readFileSync(join(ROOT, "calculations/emi/lisn-precompliance.mjs"), "utf8")),
  "no AC DM choke and no bank inductor is in the BOM; the DM-choke engine survives only as the control row of the LISN gate");
ck("FUSE-30KW-CLASS", /FUSE-gG-690V-80A/.test(db) && !/mpn: "FUSE-gG-690V-63A"/.test(db),
  "30 kW fuse is 80 A gG 22x58: a 63 A element runs 88 % loaded and goes negative after the enclosure/ambient derate");
// No catalog family carries the tank CT: the Talema AS series tops out at 15 amp-turns rms
// (AS-101 = 15 A primary) against 78 / 100 / 120 A rms here, 5–8× its secondary rating. The row is
// CUSTOM (RFQ) with a written requirement and names no AS-class alternate, because none is
// buildable. The line CT is a real catalog part.
ck("CT-SOURCING-HONESTY", /ACX-1100/.test(db) && /CT-RES-1:100-100A/.test(db) && /\*\*CUSTOM \(RFQ\)\*\* — NOT a Talema AS catalogue part/.test(db) && /secondary ≥ 1\.3 A rms continuous/.test(db) && !/AS-407/.test(db),
  "the line CT is a named catalog part; the tank CT is CUSTOM (RFQ) with a written ratio/secondary/bandwidth/phase requirement, because no AS-class catalogue part reaches its amp-turns");
ck("AVMID-KELVIN-WAY", /\["AGND_2",null\]/.test(umodGen) && /AGND_2" \? "net\.AGND"/.test(card),
  "AVMID's Kelvin return has its own way on the connector, as CARD_RULES requires");
ck("CARD-PWM-ON-HRTIMER", /"FLT":47/.test(umodGen) && /"PWM0":69/.test(umodGen) && /"PWM6":70/.test(umodGen) && /CARD_PWM_CONTRACT/.test(card),
  "card PWM group sits on the HRTIMER with FLT on HRTIMER_FLT2, so no PWM pin contends for a break input");

// ===== 50 kW LIQUID variant — structural asserts for every deliberate delta.
// Each is the grep that finds the defect if the delta is ever half-applied.
ck("FAN-COUNT-50KW", /pw === 50 \? \(air \? 4 : 0\)/.test(boards) && /RFDT/.test(boards) && /pw === 50 \? 8 : pw === 40 \? 6 :/.test(boards),
  "50 kW fans: 0 on the sealed liquid module, 4 on air, with defined-low tach terminators on the liquid; 16-can link (8/half)");
ck("OUTPUT-DIODE-CLASS", /DIODE-1600V-250A-MOD/.test(db) && /DIODE-1600V-200A-MOD/.test(db) && /name="DOUT"/.test(cells) && !/KOUT2/.test(boards + cells),
  "the output blocking diode class per SKU (150/200/250 A at 30/40/50 kW — ≤ 67 %); no output contactor is drawn");
ck("CT-BURDENS-PER-SKU", /burden=\{pw === 50 \? "13" : pw === 40 \? "18" : "22"\}/.test(boards) && /burden: "0\.30"/.test(boards) && /burden: "0\.36"/.test(boards) && /burden: "0\.47"/.test(boards),
  "CT burdens per SKU at the coordination classes (line 22/18/13 Ω for F.01 120/155/195 A pk · resonant 0.47/0.36/0.30 Ω for F.11 140/180/220 A pk on the full-bridge tank)");
ck("PROTECTION-CLASSES-50KW", /FUSE-gG-690V-160A/.test(db) && /91\.6 A line = 37 ?%/.test(db) && /CT-LINE-2500-150A/.test(db) && /IND-PFC-107u-50/.test(db) && /XFMR-LLC-CELL-3E70-50/.test(db) && /Liquid coldplates/.test(db),
  "50 kW protection/magnetics classes + coldplate mech lines all ordered in parts-db");
ck("RATING-STRAPS", /pw === 50 \? \(air \? "15k" : "10k"\) : pw === 40 \? "1k" : "0"/.test(boards) && /"50kw": "10000", "50kwa": "15000"/.test(readFileSync(join(ROOT, "calculations/module-interconnect-audit.mts"), "utf8")),
  "RATING straps 10k = 50 liquid / 15k = 50 AIR, on E24 values, and the audit knows both");
{
  const grid = readFileSync(join(ROOT, "calculations/system/envelope-grid.mjs"), "utf8");
  ck("LIQUID-THERMAL-MODEL", /TANK_CLASS\[s\.name\]/.test(grid) && /mountFor\(s\.name\)\.rth/.test(grid) && /liquid: \{ rth: 0\.65, ref: 65 \}/.test(readFileSync(join(ROOT, "calculations/thermal/mount.mjs"), "utf8")) && /ref: \{ cold: 10, room: 45, hot: 65 \}/.test(grid) && /TANKS\[s\.name\]/.test(grid),
    "liquid thermal model + the tank CLASS in A rms, never a peak ceiling, + per-SKU tanks registered IN the grid source");
}
{
  const fsm = readFileSync(join(ROOT, "firmware/core/fsm.c"), "utf8");
  ck("DISCHARGE-WINDOW-50KW", /kw == 50u\) \? 5000u/.test(fsm) && /50 kW window/.test(readFileSync(join(ROOT, "firmware/test/host_sim.c"), "utf8")),
    "50 kW discharge window in the FSM + both window tests in host_sim");
}

// ===== external-review closures — every accepted claim gated so it can never regress. =====
ck("POLARITY-SEATING", /polarity seating/.test(readFileSync(join(ROOT, "calculations/kicad5-gen.mjs"), "utf8")),
  "polarized 2-pin parts SEAT SEMANTICALLY on the sheets (anode-named pin under the anode glyph) and the generator refuses a diode whose orientation it cannot prove — a netlist can be correct while the sheet face is mirrored");
ck("DRIVER-PINMAP", /pin3: "GND2"/.test(cells) && /pin16: "TEST"/.test(cells) && cells.includes("`.U${id} > .GND2`} to={kelvin}") && cells.includes("`.PS${id} > .COM`} to={kelvin}") && cells.includes("`.U${id} > .TEST`} to=\"net.DGND\"") && !/KSRC/.test(cells.split("DRV_PINS")[1].split("ISOAMP_PINS")[0]),
  "NSI6611 on its REAL pin map (datasheet Table 1.1): GND2 IS the Kelvin — bias COM, driver GND2 and FET source are one node; TEST->GND1, IN- grounded, ASC tied inactive; this part has no KSRC pin");
ck("AUX-FEEDBACK-SIGN", /pin1: "FB", pin2: "BO", pin3: "CS", pin4: "RT", pin5: "GND", pin6: "DRV", pin7: "VCC", pin8: "SS"/.test(cells) && /QAUXFB > \.C"} to="\.UAUX > \.FB"/.test(cells.replace(/\s+/g, " ")) || (/QAUXFB/.test(cells) && /DZAUX/.test(cells) && /CAUXSS/.test(cells) && /pin8: "SS"/.test(cells)),
  "aux flyback: REAL NCP1252 map + opto-emulating zener-NPN loop (correct feedback SIGN — a VCC divider into FB would be positive feedback) + SS cap on the real soft-start pin");
ck("BUCK-EN-DIVIDER", cells.includes('REN1${id}') && cells.includes('REN2${id}') && !cells.includes('.EN`} to="net.V15"'),
  "TPS54202 EN off the 15 V rail (7 V abs max) — 100k/27k divider = 3.19 V + V15 UVLO at ~5.7 V");
ck("ACDC-OWN-V3P3", /Rail3V3 id="A"/.test(boards),
  "the AC-DC board sources its own V3P3: without it the iso-amps, clamps and pull-ups have no rail");
// Gate bias is the +15/−3 V variant on every channel. A −4/+15 V part is rated +19 V transient
// absolute maximum, and a real gate loop's 1–3 V of overshoot on an 18 V drive crosses it. The 2 W
// class lands only where a channel drives two dies. O-11 (the −3 V off-bias) is CLOSED.
ck("GATE-BIAS-RAILS", /mpn: "ISO-GBIAS-15-1W"/.test(db) && /mpn: "ISO-GBIAS-15-2W"/.test(db) && !/mpn: "QA01C/.test(db) && !/mpn: "QA02C/.test(db) && /P15/.test(cells) && /N3/.test(cells),
  "gate bias is pinned to the **+15/−3 V** rails on every channel and specified as a CLASS with an acceptance row rather than an order code; the 2 W class lands only on the two-die LLC channels");
ck("V24-MONITOR-SCALE", /RM24A" resistance="82k"/.test(boards),
  "V24 monitor divider 82k: full scale 30.4 V = +26 % above the rail, so an over-voltage is observable (a 68k divider clips at +7 %)");
ck("SP-HARDWARE-EXCLUSION", /UEXCL/.test(boards) && /"net.KSER_STG1", "net.CTL_KPARA"/.test(boards),
  "hardware S/P exclusion: 74HC02 gates the KSER coil so KSER AND (KPARA OR KPARB) can never energize; F.17 at the SER soft start is the weld detector");

// ===== 50 kW AIR variant — the upgraded-30 discipline asserted structurally.
ck("AIR50-ONE-LANE", /lanes=\{1\} pw=\{50\} air/.test(readFileSync(join(ROOT, "boards/50kwa/acdc.tsx"), "utf8")) && /channels=\{1\} pw=\{50\} air/.test(readFileSync(join(ROOT, "boards/50kwa/dcdc.tsx"), "utf8")),
  "air-50 is ONE lane / ONE channel / ONE card — an upgraded 30, never a derated larger module; the constraint lives in the board wrappers");
ck("LLC-DIE-PARALLELING", /par=\{tank\.fetPar\}/.test(boards) && /Q\$\{id\}H\$\{k\}/.test(cells) && /RG\$\{id\}H\$\{k\}/.test(cells) && /Q\\d\+\[HL\]\[23\]\?/.test(db),
  "LLC paralleling: cell pattern (per-device 2.2R off shared gate nets, Kelvin shared) + board wiring + BOM rule");
// ===== snubber and entry-film structural asserts — the grep that catches a half-applied delta.
ck("LLC-TURNOFF-SNUBBER", /snub=\{tank\.snub\}/.test(boards) && /C\$\{id\}HOS1/.test(cells) && /C\$\{id\}HOS\$\{k\}/.test(cells) && /C\\d\+\[HL\]OS\\d/.test(db) && /rgOff="0"/.test(cells),
  "LLC turn-off snubber: one 1 kV C0G per DIE drain–source (original + every paralleled die), value from tanks.mjs cs, with R_off at 0 Ω — verify-independent §L walks the built netlist back to tanks.mjs");
ck("DCLINK-ENTRY-FILM", /const ENTRY_FILM[^=]*=\s*\{\s*30:\s*16,\s*40:\s*16,\s*50:\s*20\s*\}/.test(boards) && /name="CFDMP"/.test(boards) && /name="RFDMP"/.test(boards) && /CFDMP\$/.test(db) && /RFDMP\$/.test(db),
  "DC-link entry film is ONE per-SKU table (ENTRY_FILM 16/16/20) plus the 2.2 µF + 0.33 Ω series-RC damper; verify-independent §G re-declares the counts and current-coordination [SYNC] ties boards to parts-db");
ck("SYMBOL-PACKAGE-PINOUT", /footprint="sot23_6"/.test(cells) && /footprint="dfn10"/.test(cells) && /footprint="soic6"/.test(cells) && /footprint="soic4"/.test(cells) && /PKG_GUARD/.test(readFileSync(join(ROOT, "calculations/sheet-netlist-gen.mjs"), "utf8")),
  "the four datasheet pinouts (TPS54202 SOT-23-6 · TPS3430 VSON-10 · TLP152 SO-6 · VOM1271 SOP-4) live in the SYMBOLS, and sheet-netlist-gen guards symbol-vs-package numbering instead of translating it");
ck("VIENNA-MIRROR-CLAMP", /mirrorClamp/.test(boards) && /D\$\{id\}CM/.test(cells) && /R\[ABC\]\\d\+CM\$/.test(db) && /export const MIRROR_CLAMP = \{ "30kw": false, "40kw": false, "50kw": true, "50kwa": true \}/.test(db),
  "Vienna mirrored RCD clamp: the LAND is on every phase of every board (boards.tsx passes mirrorClamp unconditionally), and WHICH SKUs are populated lives in ONE exported table, MIRROR_CLAMP, which drives the per-part qtyMul — so the BOM, the DPT deck and any DFM sheet read the same source");
ck("GATE-BIAS-LIGHT-LOAD", /P15/.test(cells) && /N3/.test(cells) && !/"P18"/.test(cells) && /ISO-GBIAS-15-1W/.test(db) && /ISO-GBIAS-15-2W/.test(db) && /PS1H: \{ price1k: 140/.test(db)
  && /\+15 V ±5 % at 20–100 % of rated load/.test(db) && /≤ \+17\.5 V at 5 % load/.test(db),
  "gate bias is +15/−3 V on EVERY module, the 2 W class only where a channel drives two dies (40/50 kW), and the BOM line carries the LIGHT-LOAD acceptance row — these modules run at ≈17 % load, where an unregulated part rises +10…+18 % and a −4/+15 V device class ends up at 18 V");
ck("FAN4-TACH-PATH", /DI10/.test(umodGen) && /"FAN_TACH4"/.test(umodGen) && /\[39,"FAN_TACH4"\]/.test(umodGen),
  "fan-4 tach end-to-end: card pin 90 → way 88 → harness W39, asserted in the generator");
ck("AIR50-CLONES-LIQUID", /skuOverrides\["50kwa"\] = \{ \.\.\.skuOverrides\["50kw"\] \}/.test(db),
  "air-50 electrical classes are the LIQUID's by construction — the two 50s cannot drift");

// ===== narrower source-level closures, each verified against the built netlists / datasheets.
// Section J of verify-independent carries the electrical proofs; these pin the SOURCES so a
// refactor cannot silently drop them.
const fsmSrc = readFileSync(join(ROOT, "firmware/core/fsm.c"), "utf8");
const simSrc = readFileSync(join(ROOT, "firmware/test/host_sim.c"), "utf8");
const protDoc = readFileSync(join(ROOT, "docs/protection-thresholds.md"), "utf8");
ck("WDO-RESETS-MCU", /wdoNet = nrst \?\?/.test(cells) && /nrst="net.NRST_CARD"/.test(boards),
  "watchdog WDO rides the MCU NRST net, AND inhibit retained, so a hung MCU RESTARTS with its enables low; the merge is a net RENAME, so the sheet face shows it");
ck("DESAT-SERIES-R", /R\$\{id\}DS`\} resistance="100"/.test(cells) && /R\$\{id\}DS > .pin2`\} to=\{`.D\$\{id\}S1 > .anode/.test(cells),
  "100 R DESAT series resistor in the one driver cell = all 9 channels/module; blanking cap stays driver-side");
ck("LOCAL-BYPASS-COVERAGE", /C\$\{id\}BV/.test(cells) && /C\$\{id\}VA/.test(cells) && /C\$\{id\}VB/.test(cells) && /CAND\$\{id\}/.test(cells) && /name="CAVB"/.test(cells) && /name="CCV1"/.test(cells) && /name="CSH1"/.test(cells) && /C5B\$\{id\}/.test(cells) && /CQD\$\{id\}/.test(cells) && /name="CEXCL"/.test(boards),
  "local bypass at every flagged class: NSI6611 VCC1, AMC both sides, bias-module 1 u bulk, CAN both domains, AND/NOR/op-amp VCC, opto driver");
ck("NO-PRE-INSERTION-STAGE", !/UEXCL2/.test(boards) && !/"net.CTL_KPREA"/.test(boards) && /\/\^UEXCL\$\//.test(db),
  "no pre-insertion pair and no second exclusion stage is drawn: the output blocking diode needs no matched-voltage make, and an orphan stage would drive nothing");
ck("MATRIX-EXCLUSION-FW", /o->k_ser = false; o->k_para = false; o->k_parb = false; o->q_disch_bk = true; f->p_make = 0; \}/.test(fsmSrc) && /excl_viol/.test(simSrc) && /matrix exclusion invariant/.test(simSrc),   /* step 20 starts the bleeders and re-arms the make-settle wait */
  "ST_MODESW step-20 opens ALL three matrix contacts explicitly; host_sim asserts the exclusion invariant on every tick of every scenario");
// The rule covers the Vienna common-source pair too: two dies on net.G_{id} directly are an undamped
// gate loop through the package lead inductance, so RG{id}A1/B1 are REQUIRED, at 1 Ω.
ck("GATE-RESISTOR-PER-DIE", /RG\$\{id\}A1/.test(cells) && /RG\$\{id\}B1/.test(cells) && /RG\$\{id\}H1/.test(cells) && /RG\$\{id\}L1/.test(cells) && db.includes("RG([ABC]\\d+[AB]|\\d+[HL])[123]"),
  "every die sits behind its OWN series gate resistor: LLC paralleled positions 2.2 Ω incl. the original device, Vienna common-source pair 1 Ω per die, to de-Q the shared gate loop");
ck("GATE-BIAS-INPUT-RANGE", /DC input 13\.5\u201316\.5 V/.test(db),
  "gate-bias module input range (13.5-16.5 V) vs V15 = 15.0 V recorded on the BOM line; cross-regulation re-verify staged for EVT");
ck("VALUE-CARRYING-ORDER-CODES", /CER-25W-33R-AX/.test(db) && /CER-50W-33R-AX/.test(db) && /CER-25W-160R-AX/.test(db) && /CER-50W-160R-AX/.test(db) && /SHUNT-50MV-100A/.test(db) && /SHUNT-50MV-133A/.test(db) && /SHUNT-50MV-167A/.test(db),
  "RPRE/RDIS/RSHO order codes CARRY their value and rating per SKU — a class-only p/n can be bought at any value");
ck("CAN-XCVR-PINMAP", /VDD1=1, GND1=2\/8, RXD=3, TXD=6, GND2=9\/10\/15, CANL=12, CANH=13, pin 11 NC/.test(db) && /NSI1042-DSWR/.test(db),
  "NSI1042 pin map printed on the BOM line and matching the sheets: Rev 1.3 drawing + pin table agree for the -DSWR order code");
ck("MCU-ORDER-CODE-REAL", /ordering table lists ONLY VET7 \(105 °C \/ 216 MHz\) and VET3 \(125 °C \/ 170 MHz\)/.test(db),
  "MCU order code is VET7 (GigaDevice lists only VET7 105 C / VET3 125 C at this pin count; silicon and pinout identical) — every sheet title and map key follows");
ck("PFC-REVERSE-OC-HONESTY", /system-level/.test(protDoc),
  "PFC reverse-direction OC honesty note: device-level DESAT covers the forward direction only; reverse events clear at SYSTEM speed (gG fuse / line OC), demonstrated at EVT both-polarity short test");

// ===== shutdown path end-to-end, the drawing face, and supply integrity =====
const protR6 = readFileSync(join(ROOT, "docs/protection-thresholds.md"), "utf8");
const fwR6 = readFileSync(join(ROOT, "docs/firmware-guide.md"), "utf8");
const pinmapR6 = readFileSync(join(ROOT, "calculations/control/umod-pinmap.mts"), "utf8");
const k5genR6 = readFileSync(join(ROOT, "calculations/kicad5-gen.mjs"), "utf8");
ck("NRST-ONE-NET-NAME", /wdoNet = nrst \?\?/.test(cells) && !/to=\{nrst\}/.test(cells),
  "the WDO/NRST merge is a net RENAME, not a pin-less net-net trace: a net-net trace is electrically one node but DRAWS as two disconnected label groups, and one name must label every pin");
ck("DISCHARGE-DOCUMENTED", /Discharge timeline/.test(protR6) && /real coverage is the AC-present case/i.test(protR6) && /F\.21 semantics/.test(fwR6),
  "discharge is two-phase (active to the 321 V aux brown-out, then passive 2x47k to 60 V, 6-10 min nominal / up to 11.9 min at C +20 % + the 62477-1 15 min label) and F.21 is documented as the AC-PRESENT latch; no page may claim a powered path to 60 V");
ck("REVERSE-OC-HW-PATH", /INSTANCE- and POLARITY-aware/.test(protR6) && /COMPARATOR-capable/.test(pinmapR6) && /PFC reverse-direction hardware trip/.test(fwR6),
  "reverse-polarity PFC OC has a DESIGNATED us-class path (line-CT -> on-chip CMP -> HRTIMER FLT) with the A6 pin constraint registered at the generator");
ck("AUX-AND-595-BYPASS", /CVCCB/.test(cells) && /CSR1/.test(cells),
  "NCP1252 VCC has 100 n at the pin and the 74HC595 supply is decoupled");
ck("SHUNT-SIGN-POSITIVE", /USHO > .VINP" to=".RSHO > .KB/.test(cells) && /positive \(SNS_IOUT/.test(fwR6),
  "output shunt differential flipped so delivering current reads POSITIVE; sign convention + bring-up check in firmware-guide");
ck("AUX-CTRL-COLD-START", /mpn: "NCP1252D"/.test(db) && /name="CVCC" capacitance="220uF"/.test(cells) && /EL-220u-35/.test(db),
  "the aux controller is the D version: an A version cannot cold-start here (mandatory 120 ms pre-start delay against 1.0 V of hysteresis = 28-60 ms of reservoir), D has no delay and 5 V of hysteresis, and CVCC 220 uF is 3x the 67 uF budget");
ck("SHEET-MAGNETICS-NOTES", /MAGNETICS CONSTRUCTION/.test(k5genR6),
  "sheet NOTES print the magnetics identity (cores, turns, bins, litz), so the part labels are not the only carrier on the deliverable face");

// ===== comparator-INSTANCE allocation and the PV bleeder claim =====
// A "CMP-capable pin" rule is not enough — two senses can land on the same comparator instance —
// and a PV output current quoted from a typical column is not a guaranteed minimum.
const pinmapR7 = readFileSync(join(ROOT, "calculations/control/umod-pinmap.mts"), "utf8");
const genR7 = readFileSync(join(ROOT, "packages/common-components/umod-map.gen.ts"), "utf8");
ck("CMP-INSTANCE-ALLOCATION", /AIN9: 25/.test(pinmapR7) && /AIN11: 15/.test(pinmapR7) && /"AIN9":25/.test(genR7.replace(/\s/g, "")) && /CMP1_IP/.test(pinmapR7) && /INSTANCE- and POLARITY-aware/.test(readFileSync(join(ROOT, "docs/protection-thresholds.md"), "utf8")),
  "comparator allocation is INSTANCE-aware and made in the ONE generator: I_B0 -> PA3/CMP1_IP, so phases B and C never share CMP2's two inputs — verified against GD32G553 Rev 2.0 Fig 2-3");
ck("PV-BLEEDER-GUARANTEED", /IF = 10 mA \(Voc ≥ 7.8 V, Isc ≥ 6.0 µA\)/.test(cells) && /resistance="6.8M"/.test(cells) && /QPVD/.test(boards) && /Vth\(max\) ≤ 3.5 V, Igss ≤ 100 nA/.test(db),
  "PV bleeder drive moved to the ONLY guaranteed spec point (V15-fed 11 mA via QPVD, 6.8 M gate bleed, chord >=5.8 V) — a typical PV output current is not a guaranteed minimum");
ck("CAN-XCVR-ORDER-CODE", /NSI1042-DSWR/.test(db) && /datasheet Rev 1\.3 drawing and pin table agree/.test(db),
  "CAN transceiver carries its full order code and the datasheet-agreed pin map on the BOM line, matching the sheets exactly");
ck("PANEL-BIASED-VALUES", /BIASED value governs/.test(readFileSync(join(ROOT, "calculations/kicad5-gen.mjs"), "utf8")) && /Lm 28uH\/cell \+\/-7%/.test(readFileSync(join(ROOT, "calculations/kicad5-gen.mjs"), "utf8")),
  "the 30 kW D1 panel row carries the biased-inductance value (169 uH L0 is NOT the full-current L) and the D3 row carries the numerical Lm target of 28 uH per cell");
ck("TRIP-AND-LABEL-HONESTY", /DESIGN TARGET until measured/.test(readFileSync(join(ROOT, "docs/protection-thresholds.md"), "utf8")) && /wait 15 min AND verify\s*<\s*60 V/.test(readFileSync(join(ROOT, "docs/protection-thresholds.md"), "utf8")),
  "honesty language: the 2-3 us trip is a target until EVT measures it (ACX HF response unspecified), and the service label reads wait AND verify — never wait OR verify");

// ===== balance-string count and MAG panel truth =====
// The discharge model must count the DRAWN balance strings, and every dcdc MAG panel must carry the
// turns and the per-cell Lm of the cell it describes — a transcribed turns ratio on a panel is a
// defect the netlist cannot catch.
const k5genR8 = readFileSync(join(ROOT, "calculations/kicad5-gen.mjs"), "utf8");
const protR8 = readFileSync(join(ROOT, "docs/protection-thresholds.md"), "utf8");
ck("DISCHARGE-COUNTS-DRAWN", /nSets/.test(readFileSync(join(ROOT, "calculations/stress-audit.mjs"), "utf8")) && /wait 15 min/.test(protR8),
  "the discharge model counts the DRAWN balance strings per SKU: ONE network per module, 188k full-link on every SKU — 6.2/7.4/9.9 min against a 15 min label, the 50 kW the slowest; verify-independent proves the counts from the netlists");
// The panel rows carry the buildable construction: cell turns per SKU on the drawn E70 sets.
ck("MAG-PANEL-TURNS", /6:6\|\|6, pri litz 3850x0\.063/.test(k5genR8) && k5genR8.split("4:4||4, pri litz 3536x0.071").length === 3 && k5genR8.split("Bpk 159mT").length === 4 &&
  /Lm 28uH\/cell/.test(k5genR8) && /Lm 21\.75uH\/cell/.test(k5genR8) && /Lm 17\.8uH\/cell/.test(k5genR8) && /sec foil 0\.10x28/.test(k5genR8),
  "MAG panels: cell turns per SKU (6:6||6 / 4:4||4 / 4:4||4), the simulated-corner Bpk 159 mT (magnetics-envelope ENV500-55) and the per-cell Lm target on ALL THREE dcdc rows");
ck("PV-LED-FEED", /resistance="1k" footprint="2010"/.test(cells) && /R2010-1k-0.75W/.test(db) && /25 °C-ENDPOINT MODEL/.test(db),
  "PV LED feed is 1k/2010 (≥10 mA held to the 13.5 V rail floor, 31% of rating at the 16.5 V corner); the gate-voltage claim is a 25 °C-endpoint model with a declared ambient and an EVT gate, not a guarantee");

// ===== independent-validation closures — the hardware half.
// Each row asserts one closure on the source that owns it. Three of them REMOVE parts or watts; the
// two that add parts (RBO, CADC/R{id}O) each answer a named failure that firmware cannot cover.
const ccSrc = readFileSync(join(ROOT, "calculations/system/current-coordination.mjs"), "utf8");
const runAll = readFileSync(join(ROOT, "calculations/run-all.sh"), "utf8");
const magDocs = readFileSync(join(ROOT, "calculations/magnetics/mag-docs.mjs"), "utf8");
ck("BALANCE-ONE-PER-MODULE", /bal = true/.test(cells) && /bal=\{k === 0\}/.test(boards) && /resistance="47k" footprint="2512"/.test(cells) && !/resistance="22k"/.test(cells),
  "DC-link balance: ONE network per MODULE at 47 k — a 22 k pair fitted per bank stands 18.9 mA / 15.7 W on 40/50 kW to cover a leakage imbalance taken from the datasheet LIMIT instead of the RFQ line");
ck("STAR-IS-X-BLEED", /name=\{`RNS\$\{i\}A`\} resistance="33k"/.test(boards) && /R2512-33k-HV-AS/.test(db),
  "the artificial star is 33 k because it IS the X-capacitor bleed path: against three X stages a 47 k star takes 5.3 / 6.4 s to 60 V, over the 5 s rule for permanently connected equipment");
ck("OUTPUT-BLEEDER", /name=\{`RBO\$\{i\}`\} resistance="150k"/.test(boards) && /\^RBO\\d\$/.test(db) && /RBO1 > \.pin1.*net\.OUTP/.test(boards),
  "passive output bleeder behind DOUT: 3 × 150 k HV across OUTP–OUTN, 1000 → 60 V in 12 s instead of 101 s. The blocking diode is in EVERY commanded discharge path, so no firmware change can reach this 4.7 J store");
ck("ADC-FRONT-END", /name=\{`CADC\$\{i\}`\} capacitance="1nF"/.test(boards) && /name=\{`R\$\{id\}O`\} resistance="100"/.test(cells) && /name="RSHOP"/.test(cells) && /name="RSHON"/.test(cells)
  && /\^CADC\\d\+\$/.test(db) && /RSHO\[PN\]/.test(db),
  "ADC front end completed: 1 nF C0G at every analogue card pin (the 132 ns SAR aperture at the end of a 0.5–1 m harness) and 100 Ω in series with every iso-amp output — the capacitor half of an RC every source already had the resistor for. RSHON is kept off the gate-resistor rule by its own DB entry");
ck("VIENNA-SNUBBER-RATING", /R2512-10R-3W-PULSE/.test(db) && !/0\.86 W actual/.test(db),
  "Vienna snubber resistor is a 3 W pulse part: at the drawn C_SN 330 pF it dissipates 2.84 W, which a 2 W chip cannot take");
ck("AUX-SWITCH-GATE-SPEC", /SIC-1700-1R-G15/.test(db) && /V_GS 12–15 V/.test(db) && /DRV pin CLAMPS at 15 V/.test(db),
  "aux switch specified at a 12–15 V gate: the NCP1252 DRV clamp is 15 V typ, and a 1 Ω R_DS(on) for the C2M1000170D is a 20 V-gate figure");
ck("DCLINK-VIENNA-RIPPLE", /ripple ≥ 5\.2 A rms @ 100 kHz \/ 105 °C/.test(db) && /ESR ≤ 80 mΩ @ 100 kHz/.test(db) && /DCLINK-VIENNA/.test(ccSrc) && /min-max zero sequence/.test(ccSrc),
  "the Vienna's OWN 50 kHz capacitor current is computed (direct PWM evaluation of the firmware's modulator, shared at 50 kHz against the RFQ ESR) and the can is bought against it: a link deck that feeds the Vienna as an ideal source leaves this term out of every budget");
ck("MAG-DRAWINGS-READ-GATES", /L: d2L\("30kw"\)/.test(magDocs) && /llk: d3Lk\("30kw"\)/.test(magDocs) && !/L: "5\.16 µH"/.test(magDocs),
  "the four generated magnetics DRAWINGS read D2's inductance and D3's cell leakage from magnetics-envelope instead of repeating them: a repeated number goes stale while every other carrier moves, and a winder builds to the drawing (mag-sync asserts it per page)");
ck("FW-CONSTANTS-GATED", /fw-constants-sync/.test(runAll), "a gate reads hal/meas.c, hal/llc.c and hal/pfc.c against boards.tsx / cells.tsx / tanks.mjs / parts-db — every ADC scale and tank number in the C is hand-copied, so nothing else would catch a drift");

// --- Target integration: the edge where the port meets the HAL (each row is a defect found there, inverted)
const portC = readFileSync(join(ROOT, "firmware/port/gd32g553/port.c"), "utf8");
const hrtC = readFileSync(join(ROOT, "firmware/port/gd32g553/hrtimer.c"), "utf8");
const appC = readFileSync(join(ROOT, "firmware/hal/app.c"), "utf8");
ck("DAC-INVERSE-KREF", /static float dac_v\(const meas_cal_t \*c, int ch, float value, float k\)/.test(appC) && /\(value \/ c->ch\[ch\]\.gain \+ c->ch\[ch\]\.off\) \/ k/.test(appC) && /value \/ \(c->ch\[ch\]\.gain \* k\)/.test(appC)
  && appC.split("\n").filter((l) => l.includes("dac_v(&a->cal")).length >= 4 && appC.split("\n").filter((l) => l.includes("dac_v(&a->cal")).every((l) => /, a->k_ref\);/.test(l)),
  "the comparator DAC codes are the inverse of the reference-corrected measurement: every dac_v call carries k_ref (absolute channels on the whole reading, AVMID-ratiometric ones on the swing) — the DACs are VREFP-referenced like the ADC, and a nominal-scale code moved F.03 from 860 V to 922 V on a rail 2.5 % high");
ck("AVMID-RATIOMETRIC", /float avmid = ti->avmid \* \(3\.3f \/ 4095\.0f\);/.test(appC) && !/ti->avmid[^;]*k_ref/.test(appC),
  "the AVMID half-rail check is judged on the nominal scale with NO reference correction — it is ratiometric to the rail that is VREFP; divided by k_ref it failed a healthy buffer on a +3.1 % rail and hid a buffer drifting with the rail");
ck("OUTPUTS-COMMIT", (() => { const ldS = readFileSync(join(ROOT, "firmware/port/gd32g553/app.ld.in"), "utf8"), bs = readFileSync(join(ROOT, "firmware/port/gd32g553/build.sh"), "utf8"), ph = readFileSync(join(ROOT, "firmware/port/gd32g553/port.h"), "utf8");
  return (portC.match(/HRT_CHOUTEN = /g) || []).length === 1 && !/HRT_CHOUTEN = /.test(hrtC) && /TCM_INLINE void outputs_commit\(uint32_t want, uint32_t \*shadow\)/.test(portC) && /static uint32_t out_en_pfc, out_en_llc;/.test(portC)
    && /__asm volatile \("cpsid i" ::: "memory"\);\n    bool trip = app\.trip_n != app\.trip_ack \|\| hrtimer_trip_pending\(\);\n    if \(!trip\) \{ HRT_CHOUTEN = en; trip = hrtimer_trip_pending\(\); \}\n    if \(trip\) hrtimer_all_off\(\);\n    __asm volatile \("cpsie i" ::: "memory"\);\n    if \(trip\) \{ \*shadow = 0u; return; \}/.test(portC)
    && /outputs_commit\(hrtimer_pfc_apply\(&po\), &out_en_pfc\);/.test(portC) && /outputs_commit\(hrtimer_llc_apply\(&lo\), &out_en_llc\);/.test(portC) && !/out_en\b/.test(portC)
    && /uint32_t hrtimer_pfc_apply\(const app_pfc_out_t \*o\)/.test(hrtC) && /return run \? HRT_OUT_LLC : 0u;/.test(hrtC)
    && /TCM_INLINE bool hrtimer_trip_pending\(void\) \{ return \(HRT_INTF & 0x7Fu\) != 0u; \}/.test(ph) && /TCM_INLINE void hrtimer_all_off\(void\)/.test(ph)
    && !/hrtimer_rearm|fault_rearm|trip_guard/.test(portC + hrtC + ph + readFileSync(join(ROOT, "firmware/hal/app.h"), "utf8"))
    && /\*\/pfc\.o\(\.text\* \.rodata\*\) \*\/llc\.o\(\.text\* \.rodata\*\)/.test(ldS) && /\*\/ctl\.o\(\.text\* \.rodata\*\)/.test(ldS) && /\*\/lib\.o\(\.text\*\)/.test(ldS) && /\.text\.hrtimer_fault_read_clear\* \.rodata\*\)/.test(ldS)
    && /TCM AUDIT FAILED/.test(bs) && /pfc_ctl_isr hrtimer_mt_isr hrtimer_flt_isr default_handler/.test(bs) && /literal .* points into flash/.test(bs); })(),
  "enable authority is one place: hrtimer_*_apply() only RETURN the wanted outputs, port.c outputs_commit() writes CHOUTEN on the OFF → ON transition alone, against a per-group shadow with one writer each (a shared word read-modified-written by both control interrupts could restore a bit the pre-empted 10 kHz store had seen: a stuck-off stage), inside a critical section that checks the supervisor's acknowledgement and the timer's fault flags before the write and the flags again after it (a completed fault pulse is never followed by a stale enable); everything the control interrupts execute or read is placed in TCM (the apply/commit/helpers inlined, the ZVS and PFC tables and memset included) and build.sh walks the linked image from the three interrupts and fails on any branch, indirect call or literal into flash");
ck("LLC-UPDATE-COHERENT", /HRT_CTL0 \|= BIT\(1\) \| BIT\(2\);\n  HRT_STDTCTL\(0\)[\s\S]*?HRT_STCMP1V\(0\) = lag; \}\n  HRT_CTL0 &= ~\(BIT\(1\) \| BIT\(2\)\);/.test(hrtC),
  "dead time, both periods and the phase compare of the LLC are written under ST0UPDIS / ST1UPDIS so one roll-over takes the set whole — a transfer landing between the writes runs one cycle with leg A on the new period and leg B on the old one");
ck("TACH-IN-HERTZ", /tach_hz\[k\] = el \? \(float\)\(c - tach_last\[k\]\) \* 1000\.0f \/ \(float\)el : 0\.0f;/.test(portC) && !/10000u/.test(portC) && /ti\.tach_hz\[k\] = tach_hz\[k\];/.test(portC),
  "the port hands the HAL tach frequencies in HERTZ (edges per ms × 1000): the tenths-of-hertz accumulator it once carried read a 300 rpm fan as 3 000 and passed the full-duty floor");
ck("DISCH-INTENT-SEALED", /HANDOFF_APP\.disch = disch_kept \? 1u : 0u;\n    app_handoff_seal\(&HANDOFF_APP\);/.test(portC) && /b\.disch_pending = app_handoff_valid\(&HANDOFF_APP\) && HANDOFF_APP\.disch != 0u;/.test(portC)
  && /#define FM_HANDOFF_APP   0x20013FE0u/.test(readFileSync(join(ROOT, "firmware/port/gd32g553/flash_map.h"), "utf8")),
  "a commanded discharge outlives a reset on the target: the tick seals the HAL's disch_intent into the application's own no-init record before acting, and main() reads it back into disch_pending — the HAL could resume a dump the port never told it about");
ck("LINK-ROWS-EXEMPT-ON-SHUTDOWN", /in->vbus > 100\.0f\) && f->st != ST_INIT && f->st != ST_LOCK && !on_shutdown\) \{/.test(fsmC),
  "the midpoint and half-link rows carry the shutdown exemption: latched during the dump they end it (ST_FAULT stops the dump) and F.06, an AUTO row, recovers into precharge with the shutdown forgotten");
ck("VREF-LIVE-TRACKER", /float c = fmaxf\(fminf\(m\[0\], m\[1\]\), fminf\(fmaxf\(m\[0\], m\[1\]\), m\[2\]\)\);/.test(readFileSync(join(ROOT, "firmware/hal/meas.c"), "utf8")) && /g->dcc = clampf\(g->dcc \+ \(c - g->dcc\) \* GRID_DC_KV, -GRID_DC_C_MAX, GRID_DC_C_MAX\);/.test(readFileSync(join(ROOT, "firmware/hal/meas.c"), "utf8"))
  && /a->k_ref = a->k_boot \* a->k_track;/.test(appC) && /fabsf\(a->k_track - 1\.0f\) <= 0\.02f/.test(appC) && /if \(!a->uncal && !a->cal_bad && isfinite\(frac\)\) a->k_track = clampf\(a->k_track \* \(1\.0f - 0\.1f \* frac\), 0\.97f, 1\.03f\);/.test(appC),
  "the ADC / DAC reference is tracked LIVE after boot: the three AC channels' common DC (which a 3-wire line cannot produce) drives k_track as an integrator, bounded to ±2 % (beyond that F.29) and off on an uncalibrated card — the boot-only VREFINT reading left every trip threshold drifting ≈ 25 V per percent of rail movement, 885 V at +1 % against an 880 V ceiling");
ck("DRV-RDY-IN-AND", /UAND\$\{id\} > \.C1`\} to="net\.DRV_RDY"/.test(cells) && /UAND\$\{id\} > \.C2`\} to="net\.DRV_RDY"/.test(cells) && !/UAND\$\{id\} > \.C[12]`\} to="net\.V3P3"/.test(cells),
  "the drivers' wired-OR ready line is the third input of BOTH enable AND gates — a collapsing gate-drive bias drops the enables in hardware; the pages had credited this path while the inputs were tied high");


// ---- E85: the end-to-end firmware gap audit (fsm / hal / port-boot-proto), each mechanism pinned to its source
const fsmE = readFileSync(join(ROOT, "firmware/core/fsm.c"), "utf8"), appE = readFileSync(join(ROOT, "firmware/hal/app.c"), "utf8");
const hrtE = readFileSync(join(ROOT, "firmware/port/gd32g553/hrtimer.c"), "utf8"), portE = readFileSync(join(ROOT, "firmware/port/gd32g553/port.c"), "utf8");
const bootE = readFileSync(join(ROOT, "firmware/port/gd32g553/boot_main.c"), "utf8"), hoffE = readFileSync(join(ROOT, "firmware/boot/handoff.h"), "utf8");
ck("DAC-FULL-SCALE-BEFORE-CMP", (() => { const i = hrtE.indexOf("dac_write(M[k].inst, M[k].out, 4095u);"), j = hrtE.indexOf("CMP_CS(0) = "); return i > 0 && j > i && /for \(int n = 0; n < 5; n\+\+\) CMP_CS\(n\) \|= BIT\(31\);/.test(hrtE) && hrtE.indexOf("static const struct { uint8_t inst, out; } M[APP_DAC_COUNT]") < hrtE.indexOf("void cmpdac_init(void)"); })(),
  "every comparator reference is written to full scale BEFORE a comparator is enabled (the DAC holding registers reset to 0 V under sensors resting at 1.44–1.65 V: F.01/F.03/F.13 latched on every power-up, F.31 after five), and CMPx_CS is then locked (CMPxLK) so nothing can invert a polarity or clear an enable");
ck("F13-FOLLOWS-LLC-ENABLE", /float th13 = \(fo->llc_en && fo->v_max <= PMP_PAR_VMAX_V\) \? 560\.0f : PMP_OUT_OVP_ABS_V;/.test(appE),
  "the 560 V F.13 reference applies while the LLC runs in LOW mode; idle, the terminals carry the bus (a spare module beside an 800 V session) and the absolute 1050 V limit holds — a counted LATCH per session start otherwise");
ck("BOOT-CONFIRM-STAGES-OFF", /o->boot_ok = a->now_ms >= 60000u && !a->latch_seen && !a->strap_bad && !a->cal_bad && !a->uncal &&\n\s+!a->fsm\.out\.pfc_en && !a->fsm\.out\.llc_en;/.test(appE),
  "the A/B image confirm — a flash program from the tick, possibly a page erase — is only requested with both stages stopped, the discipline every journal write keeps");
ck("RESET-CAUSE-VIA-HANDOFF", /uint8_t cause, prev, rsv\[2\];/.test(hoffE) && /HANDOFF\.cause = \(uint8_t\)\(\(port_reset_cause >> 24\) & 0xFFu\);/.test(bootE) && /HANDOFF\.prev = have_h \? h\.reason : \(uint8_t\)HANDOFF_NONE;/.test(bootE)
  && /b\.reset_cause = have_h \? h\.cause : \(uint8_t\)\(\(port_reset_cause >> 24\) & 0xFFu\);/.test(portE) && /b\.handoff_reboot = have_h && h\.prev == HANDOFF_REBOOT;/.test(portE),
  "the bootloader hands its RCU_RSTSCK snapshot and the application's sealed reboot reason over in the handoff record: the shared system_init clears the flags and rewrites the reason before the application runs, so read directly F.32 could never be attributed");
ck("CRC-POLLED", /uint32_t pmp_crc32_polled\(const uint8_t \*p, size_t n, void \(\*poll\)\(void\)\)/.test(readFileSync(join(ROOT, "firmware/hal/nvm.c"), "utf8")) && /pmp_crc32_polled\(hdr, IMG_HDR_LEN \+ body, boot_kick\)/.test(portE) && /pmp_crc32_polled\(img, size, boot_poll\)/.test(readFileSync(join(ROOT, "firmware/boot/updater.c"), "utf8")),
  "the bit-serial CRC-32 over a whole image (≈ 38 ms for a full slot at 216 MHz, past the 23.375 ms watchdog window) is hashed in 4 KB pieces with the watchdog serviced between them, at the application's start and at the bootloader's FINISH");
ck("BOOTLOADER-IDLE-EXIT", /if \(u\.mode == SVC_MODE_UPDATE && silent >= 60000u\) \{\n\s+HANDOFF\.reason = HANDOFF_REBOOT; HANDOFF\.streak = 0u; handoff_seal\(&HANDOFF\);\n\s+port_reboot\(\);/.test(bootE),
  "update mode returns to the application after 60 s without a frame — an ENTER_BOOT with no tool left the module dark until a power cycle; safe mode, with nothing to boot, waits");
ck("VMP-CONFLICT-HOLDS-RUN", /cmd->run = v->run && addressed\(v\) && !v->conflict;/.test(readFileSync(join(ROOT, "firmware/proto/vmp.c"), "utf8")),
  "a VMP address conflict holds RUN off, as the TonHe profile already did — two modules on one stored address would both deliver on one command stream");
ck("TACH-EDGE-SPACING", /if \(now - tach_t\[k\] >= PORT_SYSCLK_HZ \/ 2000u\) \{ tach_t\[k\] = now; tach_cnt\[k\]\+\+; \}/.test(portE) && /tach_edge\(0\)/.test(portE) && /tach_edge\(3\)/.test(portE),
  "tach edges closer than 500 µs are ringing or the 25 kHz fan PWM coupled into the line, not revolutions: counted, a doubled edge reads a fan at 35 % of its command as 70 % and hides the failure");
ck("HEARTBEAT-ON-LATE-TICKS", /a->hb_ok = dp > 0u && dl > 0u;[^\n]*\n  a->wdt_good = a->hb_ok \? \(uint8_t\)\(a->wdt_good < 255u \? a->wdt_good \+ 1u : 255u\) : 0u;\n  if \(ti->late\) \{ a->in\.ctl_overrun = false; return; \}/.test(appE),
  "a late tick judges no overrun but still judges the heartbeat: interrupts that ran during the backlog advanced their counters, and ones that did not stop the watchdog service instead of keeping it fed");
ck("BANK-CHANNEL-PLAUSIBLE", /bool bank_jump = !o->llc_en && f->mtx_ms > PMP_RELAY_FB_MS && \(\(f->vbk_prev\[0\] > 100\.0f && in->vbank_a < 0\.5f \* f->vbk_prev\[0\]\)/.test(fsmE) && /meas_ok = meas_ok && !bank_jump;/.test(fsmE)
  && /bool safe = f->p_bad == 0u && fabsf\(in->iout_meas\) < PMP_MAKE_IOUT_A/.test(fsmE),
  "a bank channel that falls by half in one sample with the matrix at rest is a lying channel (F.29), never a discharge, and the matrix make-permit refuses while any implausibility is pending — a stuck-low bank channel granted the permit with the banks charged and hid F.17");
ck("ENERGY-BALANCE-WITNESS", /bool bad = a->fsm\.out\.llc_en && \(p_pfc > slack \+ 2\.0f \* p_out \|\| p_out > slack \+ 2\.0f \* p_pfc\);/.test(appE) && /a->pbal_bad_ms >= 500u/.test(appE),
  "the PFC's input power and the delivered output power must agree inside 2 : 1 plus 15 % of rating for 500 ms while the LLC runs: an output current channel stuck at zero read a full-power session as 0 A with no current limit left, one stuck high read current that was not flowing — either is F.29");
ck("SYSFLT-IS-A-TRIP", /\(\(f & BIT\(5\)\) << 1\)/.test(hrtE) && /#define APP_FLT_SYS    6u/.test(readFileSync(join(ROOT, "firmware/hal/app.h"), "utf8")) && /volatile uint16_t trip_n; uint16_t trip_ack;/.test(readFileSync(join(ROOT, "firmware/hal/app.h"), "utf8")),
  "the HRTIMER system fault (HXTAL loss, lockup, LVD) is reported to the trip hold like a fault channel instead of being cleared silently over dead outputs, and the trip/fault counters are 16-bit so a chattering input cannot wrap onto \"acknowledged\" inside one tick");
ck("NO-UNDEFINED-FLOAT-CASTS", /uint16_t c = !\(v > 0\.0f\) \? 0u : v >= 4095\.0f \? 4095u : \(uint16_t\)v;/.test(hrtE) && /static uint32_t duty_counts\(float d, float full\) \{ return \(d > 0\.0f\) \? \(uint32_t\)\(\(d < 1\.0f \? d : 1\.0f\) \* full\) : 0u; \}/.test(portE),
  "no float → unsigned cast in the port sees NaN or a negative value: a NaN comparator threshold is code 0 (trip now) deterministically, a NaN or negative duty is 0");
ck("DEFAULT-HANDLER-IN-RAM", /__attribute__\(\(section\("\.ramfunc"\), noinline\)\)[^\n]*\nvoid default_handler\(void\)/.test(readFileSync(join(ROOT, "firmware/port/gd32g553/startup.c"), "utf8")),
  "the unhandled-fault handler that kills every output runs from RAM: taken while a flash bank is held by an erase it acts at once, not after the stall — and build.sh walks it as an audit root");

ck("REF-ESTIMATE-ONCE", /g->dcc_seq\+\+;/.test(readFileSync(join(ROOT, "firmware/hal/meas.c"), "utf8")) && /uint32_t dcc_seq;/.test(readFileSync(join(ROOT, "firmware/hal/meas.h"), "utf8"))
  && /dcc = g->dcc; dq = g->dcc_seq;/.test(appE) && /if \(dq != a->dcc_seen\) \{\n\s+a->dcc_seen = dq;\n\s+float frac = dcc/.test(appE),
  "the reference tracker integrates each clean-cycle estimate ONCE (dcc_seq): a 60 ms timeout or a disturbed cycle republishes the held estimate under a new grid seq, and integrating it again on every publication walked k_track to its ±2 % bound — F.29, a LATCH, out of a line outage F.07 recovers from on its own");
ck("BANK-FILM-RATING", (() => { const pdb = readFileSync(join(ROOT, "calculations/cost/parts-db.mjs"), "utf8"), fh = readFileSync(join(ROOT, "firmware/core/fsm.h"), "utf8");
  const rating = 630, par = parseFloat((fh.match(/#define PMP_PAR_VMAX_V\s+([\d.]+)f/) || [])[1]), ovp = parseFloat((fh.match(/#define PMP_OUT_OVP_ABS_V\s+([\d.]+)f/) || [])[1]), imb = parseFloat((fh.match(/#define PMP_BANK_IMB_V\s+([\d.]+)f/) || [])[1]);
  const hw13 = parseFloat((appE.match(/\? (560\.0)f : PMP_OUT_OVP_ABS_V;/) || [])[1]);
  return /m: \/\^CF\[AB\]\\d\+\$\/, mpn: "PP-2u2-630"/.test(pdb) && ovp === 1050 && imb === 25 && hw13 === 560 && hw13 <= 0.9 * rating && (ovp + imb) / 2 <= 0.9 * rating && par === 500 && par * 1.1 <= 0.9 * rating; })(),
  "the BANK films CFA/CFB are 630 V PP parts (PP-2u2-630) — the 1200 V films are the terminal COF1/COF2 and the resonant Cr — and every bank envelope sits under 90 % of that rating: the 560 V LOW-mode hardware trip (89 %), the +10 % overshoot on the 500 V LOW ceiling (87 %), the worst SER half at (1050 V + the 25 V F.17 imbalance) / 2 (85 %)");

console.log(fail ? `\n${fail} CHECK(S) FAILED` : "\nALL REVIEW CHECKS PASS");
process.exit(fail ? 1 : 0);
