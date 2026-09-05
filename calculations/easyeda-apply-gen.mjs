#!/usr/bin/env node
// Transform calculations/out/easyeda/{side}-{page}.json payloads into extract-ready
// apply chunks for the EasyEDA Copilot MCP, applying the probe-derived pin remaps
// (see out/easyeda/part-uuid-map.json; probe session 2026-09-05).
// Output: out/easyeda/apply/{side}-{page}.json  { page_uuid, chunks: [ [comp,...], ... ], nc: {des:[pins]}, warnings }

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "out/easyeda");
const outDir = join(srcDir, "apply");
mkdirSync(outDir, { recursive: true });

const uuidMap = JSON.parse(readFileSync(join(srcDir, "part-uuid-map.json"), "utf8"));

const PAGE_UUIDS = {
  "acdc-INPUT-EMI": "cf3d7bd75151a39a",
  "acdc-VIENNA-PFC": "2deb511a0a22804b",
  "acdc-DC-LINK": "6331fb4a14a834b0",
  "acdc-AC-SENSING": "5968c9bb670d73b9",
  "acdc-CONTROL": "30f27eae62f152f4",
  "acdc-AUX-POWER": "877cff6394eeb620",
  "dcdc-LLC-LEGS": "cd907a8ea53e24b6",
  "dcdc-LLC-TANKS": "15553b4d850f058f",
  "dcdc-BANKS-SP": "de257312b7ec5bd4",
  "dcdc-OUTPUT-SENSING": "3e99a4e01244616b",
  "dcdc-CONTROL": "22ef90c364d7fd7e",
  "dcdc-COMMS-HMI": "0d12bfb80ab5e55a",
};

const DIODES = new Set(["US1M", "US2G", "UF-400V-3A", "1N4148WS", "SMBJ16A", "SMBJ26A",
  "FAST-1200-1A", "SICJBS-1200-10", "SICJBS-1200-20", "SICJBS-1200-40"]);

const uuidOf = (mpn) => {
  if (uuidMap[mpn]) return uuidMap[mpn].part_uuid;
  if (/^(R-small|R0603|R0805|R1206|R2512|HV73-|CER-|WW-|SQP-)/.test(mpn)) return uuidMap["R-ALL"].part_uuid;
  if (/^(MLCC|C1812)/.test(mpn)) return uuidMap["MLCC-ALL"].part_uuid;
  if (/^(PP-|FILM-|X1-|Y1-)/.test(mpn)) return uuidMap["FILM-ALL"].part_uuid;
  if (/^(ELH-|EL-)/.test(mpn)) return uuidMap["ELCAP-ALL"].part_uuid;
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
    ];
    out.nc = [12];
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
      P(10, "VDD2", vdd), P(1, "VDD1", vdd)];
    out.nc = [2, 4, 9];
  } else if (m === "TPS54202-class") {
    out.pins = [P(3, "VIN", sig(c, "VIN")), P(1, "GND", sig(c, "GND")), P(2, "SW", sig(c, "SW")),
      P(4, "FB", sig(c, "FB")), P(5, "EN", sig(c, "EN")), P(6, "BOOT", sig(c, "BST"))];
  } else if (m === "TLV9061-class") {
    out.pins = [P(1, "OUT", sig(c, "OUT")), P(4, "IN-", sig(c, "INN")), P(3, "IN+", sig(c, "INP")),
      P(2, "V-", sig(c, "VN")), P(5, "V+", sig(c, "VP"))];
  } else if (m === "NCP1252A") {
    out.pins = [P(1, "FB", sig(c, "FB")), P(2, "BO", sig(c, "BR")), P(3, "CS", sig(c, "CS")),
      P(5, "GND", sig(c, "GND")), P(6, "DRV", sig(c, "GATE")), P(7, "VCC", sig(c, "VCC")),
      P(8, "SS", sig(c, "COMP"))];
    out.nc = [4];
  } else if (m === "QA01C-15S18") {
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
  } else if (["HF167F-80A-M", "HFE82V-M-CLASS", "HFE9-10A-1kV-M"].includes(m)) {
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
    out.pins = [P(1, "VDD1", sig(c, "VDD1")), P(2, "GND1", g1), P(7, "GND1", g1), P(8, "GND1", g1),
      P(3, "RXD", sig(c, "RXD")), P(6, "TXD", sig(c, "TXD")),
      P(16, "VDD2", sig(c, "VDD2")), P(9, "GND2", g2), P(10, "GND2", g2), P(15, "GND2", g2),
      P(12, "CANL", sig(c, "CANL")), P(13, "CANH", sig(c, "CANH"))];
    out.nc = [4, 5, 11, 14];
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
  } else {
    // Direct: numbering already matches the chosen symbol
    out.pins = c.pins.map((p) => P(p.pin_number, p.name, p.signal_name));
    out.nc = (c.nc_pins || []).slice();
  }
  // NCP1252A VIN/VCC merged onto pin 7: nothing extra to do (same net).
  return out;
}

const CHUNK = 32;
for (const f of readdirSync(srcDir).filter((f) => /^(acdc|dcdc)-.*\.json$/.test(f))) {
  const key = f.replace(/\.json$/, "");
  if (!PAGE_UUIDS[key]) continue;
  const p = JSON.parse(readFileSync(join(srcDir, f), "utf8"));
  const warn = [];
  const comps = p.components.map((c) => transform(c, key, p.components, warn)).filter(Boolean);
  // chunk on block boundaries, <= CHUNK comps per chunk
  const chunks = [];
  let cur = [];
  let curBlocks = new Set();
  for (const c of comps) {
    if (cur.length >= CHUNK && !curBlocks.has(c.block_name)) {
      chunks.push(cur); cur = []; curBlocks = new Set();
    }
    cur.push(c); curBlocks.add(c.block_name);
    if (cur.length >= CHUNK + 16) { chunks.push(cur); cur = []; curBlocks = new Set(); } // hard cap mid-block
  }
  if (cur.length) chunks.push(cur);
  const nc = {};
  for (const c of comps) if (c.nc.length) nc[c.designator] = c.nc;
  const apply = {
    page: key, page_uuid: PAGE_UUIDS[key],
    chunks: chunks.map((ch) => ch.map(({ nc, ...rest }) => rest)),
    nc, warnings: warn, total: comps.length,
  };
  writeFileSync(join(outDir, `${key}.json`), JSON.stringify(apply, null, 1));
  console.log(`${key}: ${comps.length} comps, ${chunks.length} chunk(s), ${Object.keys(nc).length} NC comps${warn.length ? ", WARN: " + warn.join(" | ") : ""}`);
}
