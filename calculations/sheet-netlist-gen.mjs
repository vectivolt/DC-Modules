#!/usr/bin/env node
// sheet-netlist-gen.mjs — transform calculations/out/sheets/{side}-{page}.json section tables
// into sheet payloads with REAL physical package pins per part (the vendor pin maps live in the
// translation branches below — R3/R4 provenance). kicad5-gen consumes these payloads; the
// KiCad-5 SHIP set is the terminal face; nothing here talks to any external tool.
// Output: out/sheets/{sku}/apply/{side}-{page}.json  { page, chunks: [[comp,...],...], nc, warnings }

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SKU = process.argv[2] || "30kw";
const srcDir = SKU === "30kw" ? join(here, "out/sheets") : join(here, "out/sheets", SKU);
const outDir = join(srcDir, "apply");
mkdirSync(outDir, { recursive: true });

// GD32G553VET7 LQFP100 physical pin allocation (R3). The previous map was STM32G474-derived and
// symbolic: it put a fault output on pin 74 (VSS) and BOOT0 on pin 100 (VDD) — two hard shorts —
// and SWD on PA6/PA7. Allocated against GD32G553xx Rev 2.0 Table 2-4 and adversarially audited
// (control-card-scope.md).
const MCU_ALLOC = JSON.parse(readFileSync(join(here, "out/mcu-pin-allocation.json"), "utf8"));
const MCU_REF = { UPFC: "UPFC", ULLC: "ULLC" };

// Human-facing page titles: SKU, which board of the pair, position in the set, function.
const PAGE_TITLES = {
  "card-CONTROL": "Control Card 1of1 CONTROL",
  "acdc-INPUT-EMI": "30kW ACDC 1of6 INPUT-EMI",
  "acdc-VIENNA-PFC": "30kW ACDC 2of6 VIENNA-PFC",
  "acdc-DC-LINK": "30kW ACDC 3of6 DC-LINK",
  "acdc-AC-SENSING": "30kW ACDC 4of6 AC-SENSING",
  "acdc-CONTROL": "30kW ACDC 5of6 CONTROL",
  "acdc-AUX-POWER": "30kW ACDC 6of6 AUX-POWER",
  "dcdc-LLC-LEGS": "30kW DCDC 1of6 LLC-LEGS",
  "dcdc-LLC-TANKS": "30kW DCDC 2of6 LLC-TANKS",
  "dcdc-BANKS-SP": "30kW DCDC 3of6 BANKS-SP",
  "dcdc-OUTPUT-SENSING": "30kW DCDC 4of6 OUTPUT-SENSING",
  "dcdc-CONTROL": "30kW DCDC 5of6 CONTROL",
  "dcdc-COMMS-HMI": "30kW DCDC 6of6 COMMS-HMI",
};

const DIODES = new Set(["US1M", "US2G", "UF-400V-3A", "1N4148WS", "SMBJ16A", "SMBJ26A",
  "SIC-SBD-1700V", "SICJBS-1200-10", "SICJBS-1200-20", "SICJBS-1200-40", "BZT52-C15", "BZX84-B15",   /* the ±2 % reference zener — this Set is what names a diode's anode/cathode, and kicad5-gen REFUSES to seat a glyph whose polarity is unnamed */
  "SMBJ18A", "SMBJ28A",
  "DIODE-1600V-150A-MOD", "DIODE-1600V-200A-MOD", "DIODE-1600V-250A-MOD"]);   /* DOUT: source pin1 = anode (DiodeModFP portHints) */

const sig = (c, name) => c.pins.find((p) => p.name === name)?.signal_name;
// The cells author the REAL package pin numbers, so the branches below are not a translation — they
// are a GUARD. This checks symbol number == emitted number per pin NAME and warns on any drift, so a
// symbol edit that re-scrambles a pinout cannot pass silently.
const PKG_GUARD = {
  "TPS54202-class": { VIN: 3, GND: 1, SW: 2, FB: 4, EN: 5, BST: 6 },
  "TPS3430-class": { VDD: 1, CWD: 2, SET0: 3, CRST: 4, GND: 5, SET1: 6, WDI: 7, WDO: 8, NC: 9, VDD2: 10 },
  "TLP152-class": { ANO: 1, NC1: 2, CAT: 3, VEE: 4, OUT: 5, VCC: 6 },
  "VOM1271T": { ANO: 1, CAT: 2, VN: 3, VP: 4 },
};
const pkgGuard = (c, m, warn) => {
  const want = PKG_GUARD[m]; if (!want) return;
  for (const pin of c.pins) {
    const w = want[pin.name];
    if (w !== undefined && Number(pin.pin_number) !== w)
      warn.push(`${c.designator}: symbol pin ${pin.name} is ${pin.pin_number}, package says ${w} (pin-number guard)`);
  }
};
const P = (n, name, s) => ({ pin_number: n, name, signal_name: s ?? "" });

function transform(c, page, all, warn) {
  const m = c.mpn || c.value;
  const out = { designator: c.designator, value: c.value, block_name: c.block_name,
    pins: [], nc: [] };   // every classified component is ALWAYS emitted — a skip path was the entire silent-drop bug family
  const byNum = Object.fromEntries(c.pins.map((p) => [p.pin_number, p.signal_name]));
  pkgGuard(c, m, warn);

  if (DIODES.has(m)) {
    out.pins = [P(2, "A", byNum[1]), P(1, "C", byNum[2])];
  } else if (["B3M010C075Z", "SG2M023120LJ", "SIC-750V-20mR", "SIC-750V-15mR"].includes(m)) {   // these classes share the TO-247-4 map
    // TO-247-4 symbol: 1=D 2=S 3=DS 4=G
    out.pins = [P(4, "G", sig(c, "G")), P(1, "D", sig(c, "D")), P(2, "S", sig(c, "S")), P(3, "DS", sig(c, "KS"))];
  } else if (m === "NSI6611") {
    // The CELLS author the REAL NSI6611ASC map (GND2 = Kelvin, TEST -> GND1, ASC tied inactive),
    // so this branch is a pure pass-through. A translation layer here is what puts TEST on the
    // Kelvin; the tell is a KSRC != GND2 warning.
    out.pins = [
      P(15, "VCC1", sig(c, "VCC1")), P(9, "GND1", sig(c, "GND1")), P(10, "IN+", sig(c, "INP")),
      P(11, "IN-", sig(c, "INN")), P(14, "RST#/EN", sig(c, "EN")), P(13, "FLT#", sig(c, "FLT")),
      P(2, "DESAT", sig(c, "DST")), P(3, "GND2", sig(c, "GND2")), P(1, "ASC", sig(c, "ASC")),
      P(16, "TEST", sig(c, "TEST")),
      P(5, "VCC2", sig(c, "VCC2")), P(4, "OUTH", sig(c, "OUTH")), P(6, "OUTL", sig(c, "OUTL")),
      P(7, "CLAMP", sig(c, "CLAMP")), P(8, "VEE2", sig(c, "VEE")), P(12, "RDY", sig(c, "RDY")),
    ];
    out.nc = [];
  } else if (m === "TLP152-class") {
    out.pins = [P(1, "Anode", sig(c, "ANO")), P(3, "Cathode", sig(c, "CAT")),
      P(4, "GND", sig(c, "VEE")), P(5, "VO", sig(c, "OUT")), P(6, "VCC", sig(c, "VCC"))];
  } else if (m === "VOM1271T") {
    out.pins = [P(1, "A1", sig(c, "ANO")), P(2, "C1", sig(c, "CAT")),
      P(4, "A2", sig(c, "VP")), P(3, "C2", sig(c, "VN"))];
  } else if (m === "TPS3430-class") {
    const gnd = sig(c, "GND"), vdd = sig(c, "VDD") ?? sig(c, "VDD1");
    out.pins = [P(7, "WDI", sig(c, "WDI")), P(5, "GND", gnd), P(11, "EP", gnd),
      P(3, "SET0", sig(c, "SET0")), P(6, "SET1", sig(c, "SET1")), P(8, "WDO#", sig(c, "WDO")),
      P(10, "VDD2", vdd), P(1, "VDD1", vdd),
      // Pin 4 CRST carries the reset-delay cap. Per the TI datasheet, CWD 1 nF with SET00 puts the window's EARLY
      // boundary at ~15-18 ms, so the 10 ms kick contract (app.c APP_WDT_KICK_MS) would service it inside the
      // prohibited window — a reset loop. Fixed-window strap instead:
      // CWD unconnected, SET0 low, SET1 high -> valid service after 2.22 ms and before 23.375 ms; 10 ms kicks are legal
      // with no capacitor tolerance in the window. Boot contract: the bootloader kicks every ~10 ms from power-up,
      // chunking image verification (boot/image.h poll); EVT T-48 confirms the window on the fitted part.
      P(4, "CRST", sig(c, "CRST"))];
    out.nc = [2, 9];
  } else if (m === "TPS54202-class") {
    out.pins = [P(3, "VIN", sig(c, "VIN")), P(1, "GND", sig(c, "GND")), P(2, "SW", sig(c, "SW")),
      P(4, "FB", sig(c, "FB")), P(5, "EN", sig(c, "EN")), P(6, "BOOT", sig(c, "BST"))];
  } else if (m === "TLV9061-class") {
    out.pins = [P(1, "OUT", sig(c, "OUT")), P(4, "IN-", sig(c, "INN")), P(3, "IN+", sig(c, "INP")),
      P(2, "V-", sig(c, "VN")), P(5, "V+", sig(c, "VP"))];
  } else if (/^NCP1252/.test(m)) {   /* every NCP1252 order code shares the SOIC-8 cell */
    // cells author the real map (FB/BO/CS/RT/GND/DRV/VCC/SS) — pass-through.
    out.pins = [P(1, "FB", sig(c, "FB")), P(2, "BO", sig(c, "BO")), P(3, "CS", sig(c, "CS")),
      P(4, "RT", sig(c, "RT")), P(5, "GND", sig(c, "GND")), P(6, "DRV", sig(c, "DRV")),
      P(7, "VCC", sig(c, "VCC")), P(8, "SS", sig(c, "SS"))];
    out.nc = [];
  } else if (/^(QA0\d|ISO-GBIAS)/.test(m)   /* the 1 W and 2 W gate-bias parts share this land and map; matching the class PREFIX, not an exact code, is what stops a half-migrated tree silently dropping a module */) {
    // Symbol: 1=VIN 2=GND 5=-VO 6=0V 7=+VO. The cells wire the dual rail explicitly — COM is the
    // 0 V/Kelvin node, the negative pin is the off-bias rail. The rails are +15/−3 V, so the cell
    // pins are P15/N3; the P18/N4 spelling is accepted too for the same reason.
    out.pins = [P(1, "VIN", sig(c, "VIN")), P(2, "GND", sig(c, "GND")),
      P(7, "+VO", sig(c, "P15") ?? sig(c, "P18")), P(6, "0V", sig(c, "COM"))];
    const nNeg = sig(c, "N3") ?? sig(c, "N4");
    if (nNeg) out.pins.push(P(5, "-VO", nNeg)); else out.nc = [5];
  } else if (m === "ISO5V-RFC-6K") {
    out.pins = [P(2, "Vin", sig(c, "VIN")), P(1, "GND", sig(c, "GND")),
      P(4, "+Vo", sig(c, "P5")), P(3, "-Vo", sig(c, "COM"))];
  // Match the relay FAMILY, not an exact MPN list. These share one 6-pin arrangement (main +
  // mirror + coil), and the list silently excluded every per-SKU variant: renaming KPREA/KPREB to
  // HFE82V-20-M-CLASS for R8 dropped them out of the branch entirely, leaving COIL_KPREA/B and
  // KPREA/B_B as single-pin nets. HF167F-120A-M and -250A-M were the same trap waiting to fire.
  } else if (/^(HF167F-|HFE82V-|HFE9-)/.test(m)) {
    out.pins = [P(1, "COIL1", sig(c, "C1")), P(8, "COIL2", sig(c, "C2")),
      P(4, "COM1", sig(c, "A")), P(6, "NO1", sig(c, "B")),
      P(5, "COM2", sig(c, "M1")), P(3, "NO2", sig(c, "M2"))];
    out.nc = [2, 7];
  } else if (m.startsWith("SHUNT-")) {   /* value-carrying order codes, same 4-terminal cell */
    out.pins = [P(1, "A", sig(c, "A")), P(2, "B", sig(c, "B")), P(3, "KA", sig(c, "KA")), P(4, "KB", sig(c, "KB"))];
    out.nc = [5, 6];
  } else if (/^NSI1042/.test(m)) {   /* -DSWR order code (R7) — same SO-16 translation */
    // NSi1042-DSWR SO-16 isolated CAN: isolation preserved (GND1 logic side, GND2 bus side)
    const g1 = sig(c, "GND1"), g2 = sig(c, "GND2");
    // R3: pin 7 is NC on every orderable variant — do not tie it to GND1
    out.pins = [P(1, "VDD1", sig(c, "VDD1")), P(2, "GND1", g1), P(8, "GND1", g1),
      P(3, "RXD", sig(c, "RXD")), P(6, "TXD", sig(c, "TXD")),
      P(16, "VDD2", sig(c, "VDD2")), P(9, "GND2", g2), P(10, "GND2", g2), P(15, "GND2", g2),
      P(12, "CANL", sig(c, "CANL")), P(13, "CANH", sig(c, "CANH"))];
    out.nc = [4, 5, 7, 11, 14];
  } else if (m === "CMC-CAN-51uH") {
    // ACT45B windings are pins 1-4 and 2-3 (TDK ACT45B datasheet circuit). Mapping A1=1 A2=4 / B1=2 B2=3 puts the
    // TRANSCEIVER PAIR across winding 1-4 and the CONNECTOR PAIR across 2-3, leaving no conductive through-path for
    // either CAN signal on any exported variant. Correct: CANH flows 1→4, CANL 2→3;
    // the bus-side termination/TVS ride the B labels and land on 4/3 with this map.
    out.pins = [P(1, "A1", sig(c, "A1")), P(2, "A2", sig(c, "A2")), P(4, "B1", sig(c, "B1")), P(3, "B2", sig(c, "B2"))];
  } else if (/^XFMR-LLC-CELL-/.test(m)) {   /* D3 rev D cell: P1 P2 SH SA SB, all five bound */
    out.pins = c.pins.map((p) => P(p.pin_number, p.name, p.signal_name));
  } else if (m === "CMC-3PH-2mH-SKU") {
    out.pins = c.pins.map((p) => P(p.pin_number, p.name, p.signal_name));
    out.nc = [7, 8];
  } else if (m === "TAB-M4") {
    out.pins = [];
    out.nc = [1];
  } else if (m === "LED-2DIG-0.56CC") {
    // 05621G 10-pin dual-digit CC standard order: 1 E, 2 D, 3 DP, 4 C, 5 G, 6 DIG2(cathode),
    // 7 B, 8 DIG1(cathode), 9 F, 10 A
    const s = (n) => sig(c, n);
    out.pins = [P(10, "A", s("SA")), P(7, "B", s("SB")), P(4, "C", s("SC")), P(2, "D", s("SD")),
      P(1, "E", s("SE")), P(9, "F", s("SF")), P(5, "G", s("SG")), P(3, "DP", s("DP")),
      P(8, "DIG1", s("DIG1")), P(6, "DIG2", s("DIG2"))];
  } else if (MCU_REF[c.designator] && MCU_ALLOC[c.designator]) {
    // Map each bound signal onto its real package pin. A signal may land on more than one pin
    // (supply rails, and FLT_LLC which needs one break input per advanced timer).
    const alloc = MCU_ALLOC[c.designator].map;
    const used = new Set();
    for (const pin of c.pins) {
      const sigName = pin.signal_name;
      if (!sigName) continue;
      const landings = alloc[sigName];
      if (!landings) { warn.push(`${c.designator}: ${sigName} has no pin allocation`); continue; }
      for (const l of landings) {
        if (used.has(l.pin)) continue;
        used.add(l.pin);
        out.pins.push(P(l.pin, l.port, sigName));
      }
    }
    for (let n = 1; n <= 100; n++) if (!used.has(n)) out.nc.push(n);
  } else {
    // Direct: numbering already matches the chosen symbol
    out.pins = c.pins.map((p) => P(p.pin_number, p.name, p.signal_name));
    out.nc = (c.nc_pins || []).slice();
  }
  // NCP1252 VIN/VCC merged onto pin 7: nothing extra to do (same net).
  return out;
}

// One extract call per functional block. This is the recipe that produced the only
// fully-correct page (dcdc-LLC-TANKS: 3 calls, one complete block each, 0 wrong nets).
// Mixing or splitting blocks across calls is what corrupts net-port placement, and a
// block split across calls also draws two boxes for one section.
for (const f of readdirSync(srcDir).filter((f) => /^(acdc|dcdc|card|cab)-.*\.json$/.test(f))) {
  const key = f.replace(/\.json$/, "");
  const p = JSON.parse(readFileSync(join(srcDir, f), "utf8"));
  const warn = [];
  const comps = p.components.map((c) => transform(c, key, p.components, warn)).filter(Boolean);

  const byBlock = new Map();
  for (const c of comps) {
    if (!byBlock.has(c.block_name)) byBlock.set(c.block_name, []);
    byBlock.get(c.block_name).push(c);
  }
  // Emit blocks in the page's declared signal-flow order so the sheet reads left-to-right.
  const order = [...new Set([...(p.flow || []), ...byBlock.keys()])].filter((b) => byBlock.has(b));
  const chunks = order.map((b) => byBlock.get(b));
  const oversize = order.filter((b) => byBlock.get(b).length > 24);
  if (oversize.length) warn.push(`blocks over 24 comps (split risk): ${oversize.join(", ")}`);

  const nc = {};
  for (const c of comps) if (c.nc.length) nc[c.designator] = c.nc;
  const apply = {
    page: key, title: PAGE_TITLES[key],
    block_order: order,
    chunks: chunks.map((ch) => ch.map(({ nc, ...rest }) => rest)),
    nc, warnings: warn, total: comps.length,
  };
  writeFileSync(join(outDir, `${key}.json`), JSON.stringify(apply, null, 1));
  console.log(`${key}: ${comps.length} comps in ${chunks.length} blocks [${order.map((b) => `${b}:${byBlock.get(b).length}`).join(" ")}]${warn.length ? "\n   WARN: " + warn.join(" | ") : ""}`);
}
