#!/usr/bin/env node
// Transform calculations/out/easyeda/{side}-{page}.json payloads into extract-ready
// apply chunks for the EasyEDA Copilot MCP, applying the probe-derived pin remaps
// (see out/easyeda/part-uuid-map.json; probe session 2026-09-05).
// Output: out/easyeda/apply/{side}-{page}.json  { page_uuid, chunks: [ [comp,...], ... ], nc: {des:[pins]}, warnings }

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SKU = process.argv[2] || "30kw";
const srcDir = SKU === "30kw" ? join(here, "out/easyeda") : join(here, "out/easyeda", SKU);
const outDir = join(srcDir, "apply");
mkdirSync(outDir, { recursive: true });

const uuidMap = JSON.parse(readFileSync(join(here, "out/easyeda", "part-uuid-map.json"), "utf8"));

// GD32G553VET6 LQFP100 physical pin allocation (R3). The previous map was STM32G474-derived and
// symbolic: it put a fault output on pin 74 (VSS) and BOOT0 on pin 100 (VDD) — two hard shorts —
// and SWD on PA6/PA7. Allocated against GD32G553xx Rev 2.0 Table 2-4 and adversarially audited;
// see docs/mcu-pin-allocation-gd32.md for the open architecture decisions.
const MCU_ALLOC = JSON.parse(readFileSync(join(here, "out/mcu-pin-allocation.json"), "utf8"));
const MCU_REF = { UPFC: "UPFC", ULLC: "ULLC" };

// Live page UUIDs. page-uuids-new.json is rewritten whenever the pages are recreated
// and is the authoritative map (pages rebuilt 2026-09-06 in canonical signal order).
// page UUIDs only exist for the 30 kW EasyEDA project; other SKUs emit KiCad only
const PAGE_UUIDS = SKU === "30kw"
  ? JSON.parse(readFileSync(join(srcDir, "page-uuids-new.json"), "utf8"))
  : new Proxy({}, { get: (_, k) => `sku-${SKU}-${String(k)}`, has: () => true });

// Human-facing page titles: SKU, which board of the pair, position in the set, function.
const PAGE_TITLES = {
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
  "FAST-1200-1A", "SICJBS-1200-10", "SICJBS-1200-20", "SICJBS-1200-40"]);

const uuidOf = (mpn) => {
  if (uuidMap[mpn]) return uuidMap[mpn].part_uuid;
  if (/^(R-small|R0603|R0805|R1206|R2512|HV73-|CER-|WW-|SQP-)/.test(mpn)) return uuidMap["R-ALL"].part_uuid;
  if (/^(MLCC|C1812)/.test(mpn)) return uuidMap["MLCC-ALL"].part_uuid;
  if (/^(PP-|FILM-|X1-|Y1-)/.test(mpn)) return uuidMap["FILM-ALL"].part_uuid;
  if (/^(ELH-|EL-)/.test(mpn)) return uuidMap["ELCAP-ALL"].part_uuid;
  // Relay families share one placeholder part. Without this fallback a per-SKU or re-specified
  // variant has no uuid and the component is SKIPPED ENTIRELY from the apply output — which is how
  // renaming KPREA/KPREB to HFE82V-20-M-CLASS for R8 silently dropped both relays and left
  // COIL_KPREA/B and KPREA/B_B as single-pin nets. Only a full rebuild from source surfaced it.
  if (/^(HFE\d|HFE82V|HF167F)/.test(mpn)) return uuidMap["HFE82V-M-CLASS"].part_uuid;
  if (/^(IND-|DM-)/.test(mpn)) return uuidMap["IND-ALL-2P"].part_uuid;
  return null;
};

const sig = (c, name) => c.pins.find((p) => p.name === name)?.signal_name;
const P = (n, name, s) => ({ pin_number: n, name, signal_name: s ?? "" });

function transform(c, page, all, warn) {
  const m = c.mpn || c.value;
  const out = { designator: c.designator, value: c.value, block_name: c.block_name,
    search_query: (c.query || m).trim(), part_uuid: uuidOf(m), pins: [], nc: [] };
  if (!out.part_uuid) { warn.push(`${c.designator}: no part_uuid for ${m}`); return null; }
  const byNum = Object.fromEntries(c.pins.map((p) => [p.pin_number, p.signal_name]));

  if (DIODES.has(m)) {
    out.pins = [P(2, "A", byNum[1]), P(1, "C", byNum[2])];
  } else if (m === "B3M010C075Z" || m === "SG2M023120LJ") {
    // TO-247-4 symbol: 1=D 2=S 3=DS 4=G
    out.pins = [P(4, "G", sig(c, "G")), P(1, "D", sig(c, "D")), P(2, "S", sig(c, "S")), P(3, "DS", sig(c, "KS"))];
  } else if (m === "NSI6611") {
    const ks = sig(c, "KSRC"), g2 = sig(c, "GND2");
    if (g2 && ks && g2 !== ks) warn.push(`${c.designator}: KSRC(${ks}) != GND2(${g2}); GND2 pin3 uses KSRC`);
    out.pins = [
      P(15, "VCC1", sig(c, "VIA")), P(9, "GND1", sig(c, "GNDA")), P(10, "IN+", sig(c, "PWM")),
      P(11, "IN-", sig(c, "GNDA")), P(14, "RST#/EN", sig(c, "EN")), P(13, "FLT#", sig(c, "FLT")),
      P(2, "DESAT", sig(c, "DST")), P(3, "GND2", ks), P(1, "ASC", ks), P(16, "TEST", ks),
      P(5, "VCC2", sig(c, "VCC2")), P(4, "OUTH", sig(c, "OUTH")), P(6, "OUTL", sig(c, "OUTL")),
      P(7, "CLAMP", sig(c, "CLAMP")), P(8, "VEE2", sig(c, "VEE")),
      // R3 CLOSED: pin 12 is RDY, an active-low open-drain power-good. It is now wired-OR onto the
      // per-board DRV_RDY net with a single 10 k pull-up in SafetyChain, so it can actually pull.
      P(12, "RDY", sig(c, "RDY")),
    ];
    out.nc = [];
  } else if (m === "TLP152-class") {
    out.pins = [P(1, "Anode", sig(c, "ANO")), P(3, "Cathode", sig(c, "CAT")),
      P(4, "GND", sig(c, "VEE")), P(5, "VO", sig(c, "OUT")), P(6, "VCC", sig(c, "VCC"))];
  } else if (m === "VOM1271T") {
    out.pins = [P(1, "A1", sig(c, "ANO")), P(2, "C1", sig(c, "CAT")),
      P(4, "A2", sig(c, "VP")), P(3, "C2", sig(c, "VN"))];
  } else if (m === "TPS3430-class") {
    const gnd = sig(c, "GND"), vdd = sig(c, "VDD");
    out.pins = [P(7, "WDI", sig(c, "WDI")), P(5, "GND", gnd), P(11, "EP", gnd),
      P(3, "SET0", sig(c, "SET0")), P(6, "SET1", sig(c, "SET1")), P(8, "WDO#", sig(c, "WDO")),
      P(10, "VDD2", vdd), P(1, "VDD1", vdd),
      // R3 CLOSED: pin 2 CWD programs the watchdog timeout, pin 4 CRST the reset delay. Both now
      // carry their timing cap to GND, so the window is defined rather than floating.
      P(2, "CWD", sig(c, "CWD")), P(4, "CRST", sig(c, "CRST"))];
    out.nc = [9];
  } else if (m === "TPS54202-class") {
    out.pins = [P(3, "VIN", sig(c, "VIN")), P(1, "GND", sig(c, "GND")), P(2, "SW", sig(c, "SW")),
      P(4, "FB", sig(c, "FB")), P(5, "EN", sig(c, "EN")), P(6, "BOOT", sig(c, "BST"))];
  } else if (m === "TLV9061-class") {
    out.pins = [P(1, "OUT", sig(c, "OUT")), P(4, "IN-", sig(c, "INN")), P(3, "IN+", sig(c, "INP")),
      P(2, "V-", sig(c, "VN")), P(5, "V+", sig(c, "VP"))];
  } else if (m === "NCP1252A") {
    out.pins = [P(1, "FB", sig(c, "FB")), P(2, "BO", sig(c, "BR")), P(3, "CS", sig(c, "CS")),
      P(5, "GND", sig(c, "GND")), P(6, "DRV", sig(c, "GATE")), P(7, "VCC", sig(c, "VCC")),
      P(8, "SS", sig(c, "COMP")),
      // R3 CLOSED: pin 4 is RT — the resistor to GND that sets Fsw. RAUXRT now provides it.
      P(4, "RT", sig(c, "RT"))];
    out.nc = [];
  } else if (m === "QA01C" || m === "QA01C-15S18") {
    // Symbol: 1=VIN 2=GND 5=-VO 6=0V 7=+VO. If COM net == paired driver VEE net, COM is the -4V
    // rail: COM->5 and 0V->driver KSRC net. Else unipolar: COM->6, NC 5.
    const com = sig(c, "COM");
    const drv = all.find((d) => (d.mpn || d.value) === "NSI6611" &&
      d.pins.some((p) => p.name === "VEE" && p.signal_name === com));
    out.pins = [P(1, "VIN", sig(c, "VIN")), P(2, "GND", sig(c, "GND")), P(7, "+VO", sig(c, "P18"))];
    if (drv) {
      out.pins.push(P(5, "-VO", com), P(6, "0V", drv.pins.find((p) => p.name === "KSRC").signal_name));
    } else {
      out.pins.push(P(6, "0V", com));
      out.nc = [5];
    }
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
  } else if (m === "SHUNT-MANG") {
    out.pins = [P(1, "A", sig(c, "A")), P(2, "B", sig(c, "B")), P(3, "KA", sig(c, "KA")), P(4, "KB", sig(c, "KB"))];
    out.nc = [5, 6];
  } else if (m === "NSI1042") {
    // NSi1042-DSWR SO-16 isolated CAN: isolation preserved (GND1 logic side, GND2 bus side)
    const g1 = sig(c, "GND1"), g2 = sig(c, "GND2");
    // R3: pin 7 is NC on every orderable variant — do not tie it to GND1
    out.pins = [P(1, "VDD1", sig(c, "VDD1")), P(2, "GND1", g1), P(8, "GND1", g1),
      P(3, "RXD", sig(c, "RXD")), P(6, "TXD", sig(c, "TXD")),
      P(16, "VDD2", sig(c, "VDD2")), P(9, "GND2", g2), P(10, "GND2", g2), P(15, "GND2", g2),
      P(12, "CANL", sig(c, "CANL")), P(13, "CANH", sig(c, "CANH"))];
    out.nc = [4, 5, 7, 11, 14];
  } else if (m === "CMC-CAN-51uH") {
    // ACT45B windings 1-4 and 2-3
    out.pins = [P(1, "A1", sig(c, "A1")), P(4, "A2", sig(c, "A2")), P(2, "B1", sig(c, "B1")), P(3, "B2", sig(c, "B2"))];
  } else if (m === "XFMR-LLC-10K") {
    out.pins = c.pins.map((p) => P(p.pin_number, p.name, p.signal_name));
    out.nc = [8];
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
  // NCP1252A VIN/VCC merged onto pin 7: nothing extra to do (same net).
  return out;
}

// One extract call per functional block. This is the recipe that produced the only
// fully-correct page (dcdc-LLC-TANKS: 3 calls, one complete block each, 0 wrong nets).
// Mixing or splitting blocks across calls is what corrupts net-port placement, and a
// block split across calls also draws two boxes for one section.
for (const f of readdirSync(srcDir).filter((f) => /^(acdc|dcdc)-.*\.json$/.test(f))) {
  const key = f.replace(/\.json$/, "");
  if (!PAGE_UUIDS[key]) continue;
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
    page: key, page_uuid: PAGE_UUIDS[key], title: PAGE_TITLES[key],
    block_order: order,
    chunks: chunks.map((ch) => ch.map(({ nc, ...rest }) => rest)),
    nc, warnings: warn, total: comps.length,
  };
  writeFileSync(join(outDir, `${key}.json`), JSON.stringify(apply, null, 1));
  console.log(`${key}: ${comps.length} comps in ${chunks.length} blocks [${order.map((b) => `${b}:${byBlock.get(b).length}`).join(" ")}]${warn.length ? "\n   WARN: " + warn.join(" | ") : ""}`);
}
