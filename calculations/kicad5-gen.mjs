#!/usr/bin/env node
// kicad5-gen.mjs — emit the hand-placed schematic in KiCad 5.1 LEGACY format, the only
// schematic format EasyEDA Pro can import.
//
// EasyEDA Pro's importer accepts "KiCad 5.1 / 5.9" projects (prodocs.easyeda.com/en/import-export/
// import-kicad/), which is the pre-S-expression Eeschema format: .sch + .lib + .pro, zipped.
// The KiCad 10 .kicad_sch files kicad-gen.mjs writes are a newer format it cannot read, so the
// handcrafted geometry could never have reached EasyEDA through them.
//
// Geometry is identical to kicad-gen.mjs: every pin gets a short stub ending in a global label,
// components sit on a 50 mil grid in uniform columns, sections are framed with notes lines and
// titled. Legacy units are mils and 1.27 mm == 50 mil exactly, so the grid maps without rounding.
//
// Output: kicad5/dc-modules-30kw/*.sch + dc-modules.lib + dc-modules-30kw.pro
// Run:    node calculations/kicad5-gen.mjs

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lcscFor, lcscForPart } from "./cost/lcsc-map.mjs";
import { SHEET_TITLES, SHEET_IDENT } from "./schematic-sections.mjs";
import { DB, skuOverrides } from "./cost/parts-db.mjs";
import { footprintForRef, realPackages } from "./footprint-map.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKU = process.argv[2] || "30kw";
const SRC = SKU === "30kw"
  ? join(ROOT, "calculations/out/easyeda/apply")
  : join(ROOT, "calculations/out/easyeda", SKU, "apply");
const OUT = join(ROOT, `kicad5/dc-modules-${SKU}`);
// Library name is revision-stamped: EasyEDA will NOT overwrite an existing library of the same
// name (it reports "A library with the same name already exists" and keeps the old symbols),
// so a re-import would silently mix new sheets with stale pin geometry. Bump on any symbol change.
const LIB_NAME = `dcmod-r4`;
// The class map is right about WHICH family a part belongs to but not always about its package,
// because a cell may declare a footprint that differs from its family default. The built land is
// the authority for chip packages; see realPackages().
const REAL_PKG = realPackages(SKU);
const fpFor = (designator, mpn) => {
  const cls = footprintForRef(designator, mpn);
  const pkg = REAL_PKG.get(designator);
  const m = cls.match(/^([RCL])(\d{4})$/);
  return (m && pkg && pkg !== m[2]) ? `${m[1]}${pkg}` : cls;
};
const REV = "D.3";   // D.1 -> D.2 output-return fix (R4) -> D.3 importer-mirror fix (R5)
// An early run wrote 30 kW sheets into the 60/120 kW directories and they sat there for days.
// Packaging lists files explicitly so nothing shipped, but a stale foreign-SKU sheet in an output
// folder is a trap — clear anything that is not this SKU's before writing.
if (existsSync(OUT)) {
  for (const f of readdirSync(OUT)) {
    if ((f.endsWith(".sch") || f.endsWith(".pro")) && !f.includes(SKU)) {
      unlinkSync(join(OUT, f));
      console.log(`  removed stale foreign-SKU file: ${f}`);
    }
  }
}
mkdirSync(OUT, { recursive: true });

// ---- geometry in mils (50 mil grid) ------------------------------------------------------
const YGRID = 250;            // frame tops AND frame heights land on this grid
const G = 50;                 // 1.27 mm
const snap = (v) => Math.round(v / G) * G;
const PITCH = 100;            // pin pitch (2.54 mm)
const STUB = 200;             // pin stub before its label
const ROW = 400;              // vertical pitch between stacked 2-pin parts
const COLGAP = 400;
const SECPAD = 200;
const SECTITLE = 250;
const SECGAP = 400;
const MARGIN = 500;
const CHW = 27;               // label glyph advance at 40 mil text size

let tsid = 0x5E000000;
const nextId = () => (++tsid).toString(16).toUpperCase().padStart(8, "0");

// ---- part classification (same rules as the v10 generator) -------------------------------
function pinSide(name) {
  if (/^(VDD|VCC|VIN|VP|VDD1|VDD2|VCC1|VCC2|V\+|COM)$/i.test(name)) return "top";
  if (/^(GND|GND1|GND2|VEE|VEE2|VSS|VN|V-|EP)$/i.test(name)) return "bottom";
  if (/^(OUT|OUTP|OUTN|OUTH|OUTL|Y\d?|DRV|GATE|SW|VO|Q\d|CANH|CANL|TXD|RXD|P5|P18|\+VO|-VO|0V)$/i.test(name)) return "right";
  if (/^OUT/i.test(name) || /^Q\d/.test(name)) return "right";
  return "left";
}
function groupPins(pins) {
// Pins are ordered by NAME FAMILY, not by pin number. Numeric order scattered related pins: the
// relays read COIL1, NO2, COM1, COM2, NO1, COIL2, so COM1 sat three rows from its own NO1, and the
// MCU read PC13, PF9, PF10, PC0, PC1 with every port interleaved. Grouping by the alphabetic stem
// and then the numeric suffix puts COIL1/COIL2, COM1/COM2, NO1/NO2 and PA0..PA15 together. Pin
// NUMBERS are still printed on every pin, so nothing is lost for tracing back to the datasheet.
const famKey = (p) => {
  const m = String(p.name ?? "").match(/^(.*?)(\d*)$/);
  return [m ? m[1] : "", m && m[2] ? +m[2] : -1];
};
const byFamily = (a, b) => {
  const [af, an] = famKey(a), [bf, bn] = famKey(b);
  return af.localeCompare(bf) || an - bn || Number(a.pin_number) - Number(b.pin_number);
};
  const g = { left: [], right: [], top: [], bottom: [] };
  for (const p of pins) g[pinSide(p.name)].push(p);
  for (const k of Object.keys(g)) g[k].sort(byFamily);
  if (g.left.length > 16 && g.right.length * 2 < g.left.length) {
    const half = Math.ceil(g.left.length / 2);
    g.right = g.left.slice(half).concat(g.right).sort(byFamily);
    g.left = g.left.slice(0, half);
  }
  return g;
}
const CAT = (value, mpn, pins) => {
  if (pins.length === 1) return "TERM";        // stud / tab: a terminal, not a chip
  if (pins.length !== 2) return "IC";
  const m = String(mpn || value);
  if (/^(R-|R\d|HV73|CER-|WW-|SQP-|R0805|R1206|R2512|R0603)/.test(m) || /^\d+(\.\d+)?(k|M|R|Ω)?$/.test(value)) return "R";
  if (/^(MLCC|PP-|FILM-|X1-|Y1-|C1812|EL-|ELH-)/.test(m)) return /^(EL-|ELH-)/.test(m) ? "CP" : "C";
  if (/^(IND-|DM-|FB-)/.test(m)) return "L";
  if (/^(US\d|UF-|1N4148|SMBJ|FAST-|SICJBS|STTH)/.test(m)) return "D";
  return "R";
};

// ---- legacy .lib symbol library ----------------------------------------------------------
const lib = new Map();
const libName = (s) => String(s).replace(/[^A-Za-z0-9_.+-]/g, "_");

// EasyEDA's KiCad-legacy importer places a symbol's pins at (ux+px, uy+py) — it does NOT apply
// the "1 0 0 -1" orientation matrix that maps library Y-up to sheet Y-down. Measured, not
// guessed: of 90 pins EasyEDA reported floating on 30kw-dcdc, this transform predicts all 90
// (its only extra 9 are our deliberate no-connects). Pins at library Y=0 land correctly either
// way, which is why most of the sheet survived — but 454 pins across the two 30 kW sheets
// landed silently on the WRONG net, with no DRC warning at all.
// So the library is written pre-mirrored about Y: EasyEDA mirrors it back and the sheet is
// correct. Mirroring twice is the identity, so the round trip is exact.
// Largest empty rectangle on the sheet, as a fraction of sheet area. "Density" and "ragged bottom"
// both missed the defect the eye sees first: a big blank channel THROUGH the middle of a sheet.
// A short column is invisible to a bottom-edge measure, and a sheet can be 70% full and still have
// one ugly hole. Rasterise coarsely and run the classic largest-rectangle-in-histogram sweep.
const largestVoid = (rects, W, H) => {
  const TBW = 9000, TBH = 2600;                       // title-block corner, reserved by convention
  rects = [...rects, { x0: W - TBW, y0: H - TBH, x1: W, y1: H }];
  const NX = 64, NY = 44, cw = W / NX, ch = H / NY;
  const occ = Array.from({ length: NY }, () => new Uint8Array(NX));
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x0 / cw)), x1 = Math.min(NX - 1, Math.ceil(r.x1 / cw) - 1);
    const y0 = Math.max(0, Math.floor(r.y0 / ch)), y1 = Math.min(NY - 1, Math.ceil(r.y1 / ch) - 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) occ[y][x] = 1;
  }
  const hgt = new Int32Array(NX);
  let best = 0, bx0 = 0, bx1 = 0, by0 = 0, by1 = 0;
  for (let y = 0; y < NY; y++) {
    for (let x = 0; x < NX; x++) hgt[x] = occ[y][x] ? 0 : hgt[x] + 1;
    const st = [];
    for (let x = 0; x <= NX; x++) {
      const h = x === NX ? 0 : hgt[x];
      let start = x;
      while (st.length && st[st.length - 1].h >= h) {
        const t = st.pop();
        const a = t.h * (x - t.x);
        if (a > best) { best = a; bx0 = t.x; bx1 = x; by0 = y - t.h + 1; by1 = y; }
        start = t.x;
      }
      st.push({ x: start, h });
    }
  }
  // the rect too: a hole the search could not remove is a hole to FILL deliberately
  return { frac: best / (NX * NY), x0: bx0 * cw, y0: by0 * ch, x1: bx1 * cw, y1: (by1 + 1) * ch };
};

// Top-N empty rectangles, greedily: find the biggest, mark it used, repeat. The gate only cares
// about the largest, but PLACEMENT wants a choice -- a notes block belongs in a consistent corner
// across a drawing set, not wherever the biggest hole happens to fall on each sheet.
const voidCandidates = (rects, W, H, n) => {
  const NX = 64, NY = 44, cw = W / NX, ch = H / NY;
  const occ = Array.from({ length: NY }, () => new Uint8Array(NX));
  const mark = (r) => {
    const x0 = Math.max(0, Math.floor(r.x0 / cw)), x1 = Math.min(NX - 1, Math.ceil(r.x1 / cw) - 1);
    const y0 = Math.max(0, Math.floor(r.y0 / ch)), y1 = Math.min(NY - 1, Math.ceil(r.y1 / ch) - 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) occ[y][x] = 1;
  };
  rects.forEach(mark);
  const out = [];
  for (let k = 0; k < n; k++) {
    const hgt = new Int32Array(NX);
    let best = 0, bx0 = 0, bx1 = 0, by0 = 0, by1 = 0;
    for (let y = 0; y < NY; y++) {
      for (let x = 0; x < NX; x++) hgt[x] = occ[y][x] ? 0 : hgt[x] + 1;
      const st = [];
      for (let x = 0; x <= NX; x++) {
        const h = x === NX ? 0 : hgt[x];
        let start = x;
        while (st.length && st[st.length - 1].h >= h) {
          const t = st.pop(), a = t.h * (x - t.x);
          if (a > best) { best = a; bx0 = t.x; bx1 = x; by0 = y - t.h + 1; by1 = y; }
          start = t.x;
        }
        st.push({ x: start, h });
      }
    }
    if (!best) break;
    const r = { x0: bx0 * cw, y0: by0 * ch, x1: bx1 * cw, y1: (by1 + 1) * ch, frac: best / (NX * NY) };
    out.push(r);
    mark(r);
  }
  return out;
};

const mirrorLibY = (text) => text.split("\n").map((l) => {
  const t = l.split(" ");
  const neg = (i) => { t[i] = String(-Number(t[i])); };
  const ang = (i) => { t[i] = String(((-Number(t[i])) % 3600 + 3600) % 3600); };
  switch (t[0]) {
    // X name num posx posy length orient ... -> posy is t[4], orientation t[6]
    case "X": neg(4); if (t[6] === "U") t[6] = "D"; else if (t[6] === "D") t[6] = "U"; break;
    case "S": neg(2); neg(4); break;
    case "C": neg(2); break;
    case "P": { const n = Number(t[1]); for (let k = 0; k < n; k++) neg(6 + 2 * k); break; }
    case "A": { neg(2); const s0 = t[4], e0 = t[5]; t[4] = e0; t[5] = s0; ang(4); ang(5);
                neg(11); neg(13);
                const sx = t[10], sy = t[11]; t[10] = t[12]; t[11] = t[13]; t[12] = sx; t[13] = sy; break; }
    case "F0": case "F1": case "F2": case "F3": neg(3); break;
    default: return l;
  }
  return t.join(" ");
}).join("\n");

// Components in the apply payload carry no MPN — the BOM resolves it by matching the designator
// against parts-db (with per-SKU overrides for the relays/fuses/CT that change rating by power
// class). Do exactly the same here so the sheet, the BOM and the LCSC map can never disagree.
const partOf = (designator, value) => {
  const rule = DB.find((r) => r.m.test(designator));
  const ov = (skuOverrides[SKU] ?? {})[designator] ?? {};
  const mpn = ov.mpn ?? rule?.mpn ?? "";
  if (!mpn) return { mpn: "", lc: { status: "UNMAPPED" } };
  const hit = lcscForPart(mpn, value);          // family+value first, then the per-MPN map
  return { mpn: hit.mpn ?? mpn, lc: hit };
};

function termLib(pinNum, pinName) {
  const nm = `TERM_${pinNum}`;
  if (lib.has(nm)) return nm;
  lib.set(nm, `#\n# ${nm}\n#\nDEF ${nm} J 0 40 N N 1 F N\n`
    + `F0 "J" 0 130 50 H V C CNN\nF1 "${nm}" 0 -130 50 H V C CNN\n`
    + `F2 "" 0 0 50 H I C CNN\nF3 "" 0 0 50 H I C CNN\nDRAW\n`
    + `C 50 0 35 0 1 8 N\n`
    + `X ${pinName.replace(/\s+/g, "_")} ${pinNum} -100 0 115 R 50 50 1 1 P\n`
    + `ENDDRAW\nENDDEF\n`);
  return nm;
}

function passiveLib(kind, n1, n2) {
  const nm = `${kind}${n1 === "1" && n2 === "2" ? "" : `_${n1}${n2}`}`;
  if (lib.has(nm)) return nm;
  const ref = kind === "D" ? "D" : kind === "L" ? "L" : kind.startsWith("C") ? "C" : "R";
  let draw = "";
  if (kind === "R") draw = "S -40 100 40 -100 0 1 10 N\n";
  else if (kind === "C") draw = "P 2 0 1 12 -80 25 80 25 N\nP 2 0 1 12 -80 -25 80 -25 N\n";
  else if (kind === "CP") draw = "P 2 0 1 12 -80 25 80 25 N\nA 0 -150 130 563 1037 0 1 12 N -80 -50 80 -50\n";
  else if (kind === "L") draw = "A 0 -50 50 -899 899 0 1 8 N 0 -100 0 0\nA 0 50 50 -899 899 0 1 8 N 0 0 0 100\n";
  else if (kind === "D") draw = "P 4 0 1 8 -50 50 -50 -50 50 0 -50 50 F\nP 2 0 1 12 50 50 50 -50 N\n";
  // pins point away from the body; legacy orientation letters: L R U D = direction the pin runs
  lib.set(nm, `#\n# ${nm}\n#\nDEF ${nm} ${ref} 0 40 N N 1 F N\n`
    + `F0 "${ref}" 0 130 50 H V C CNN\nF1 "${nm}" 0 -130 50 H V C CNN\n`
    + `F2 "" 0 0 50 H I C CNN\nF3 "" 0 0 50 H I C CNN\nDRAW\n${draw}`
    + `X ${n1} ${n1} -250 0 170 R 50 50 1 1 P\nX ${n2} ${n2} 250 0 170 L 50 50 1 1 P\n`
    + `ENDDRAW\nENDDEF\n`);
  return nm;
}

function icLib(rawKey, pins) {
  const nm = libName(rawKey);
  if (lib.has(nm)) return nm;
  const g = groupPins(pins);
  const rows = Math.max(g.left.length, g.right.length, 1);
  const halfH = Math.max(rows * PITCH / 2 + PITCH, 2 * PITCH);
  const nameW = Math.max(...pins.map((p) => p.name.length), 4) * 30;
  const halfW = Math.max(snap(nameW + 150), 300);
  let draw = `S ${-halfW} ${halfH} ${halfW} ${-halfH} 0 1 10 f\n`;
  const px = (p, x, y, orient) => {
    // power pins sit on the top/bottom edges; their name would be drawn inside the body where
    // it collides with the first left/right pin name. "~" suppresses it.
    const side = pinSide(p.name);
    const nm = (side === "top" || side === "bottom") ? "~" : p.name.replace(/\s+/g, "_");
    return `X ${nm} ${p.pin_number} ${x} ${y} 150 ${orient} 50 40 1 1 ${
      /^(GND|VEE|VSS|EP|VDD|VCC|VIN|VP|COM)/i.test(p.name) ? "W" : "P"}\n`;
  };
  g.left.forEach((p, i) => { draw += px(p, -halfW - 150, halfH - PITCH - i * PITCH, "R"); });
  g.right.forEach((p, i) => { draw += px(p, halfW + 150, halfH - PITCH - i * PITCH, "L"); });
  g.top.forEach((p, i) => { draw += px(p, -halfW + PITCH + i * PITCH, halfH + 150, "D"); });
  g.bottom.forEach((p, i) => { draw += px(p, -halfW + PITCH + i * PITCH, -halfH - 150, "U"); });
  lib.set(nm, `#\n# ${nm}\n#\nDEF ${nm} U 0 40 Y Y 1 F N\n`
    + `F0 "U" ${-halfW - 50} ${halfH + 100} 50 H V R CNN\nF1 "${nm}" ${-halfW} ${-halfH - 100} 50 H V L CNN\n`
    + `F2 "" 0 0 50 H I C CNN\nF3 "" 0 0 50 H I C CNN\nDRAW\n${draw}ENDDRAW\nENDDEF\n`);
  return nm;
}

// ---- shape used by the packer (must mirror the library geometry) --------------------------
const PIN_UNION = new Map();
for (const f of readdirSync(SRC).filter((x) => x.endsWith(".json"))) {
  const pg = JSON.parse(readFileSync(join(SRC, f), "utf8"));
  for (const c of pg.chunks.flat()) {
    if (c.pins.length === 2) continue;
    const key = c.mpn || c.value;
    if (!PIN_UNION.has(key)) PIN_UNION.set(key, new Map());
    const u = PIN_UNION.get(key);
    for (const p of c.pins) if (!u.has(String(p.pin_number))) u.set(String(p.pin_number), { ...p });
  }
}
const unionPins = (c) => PIN_UNION.get(c.mpn || c.value) ? [...PIN_UNION.get(c.mpn || c.value).values()] : c.pins;

function shapeOf(c) {
  const cat = CAT(c.value, c.mpn, c.pins);
  if (cat === "TERM") {
    const lw = (c.pins[0]?.signal_name?.length ?? 0) * CHW;
    return { cat, w: 200 + STUB + lw, h: ROW, lw, rw: 0 };
  }
  if (cat !== "IC") {
    const ns = c.pins.map((p) => String(p.pin_number)).sort((a, b) => Number(a) - Number(b));
    const l = c.pins.find((p) => String(p.pin_number) === ns[0]);
    const r = c.pins.find((p) => String(p.pin_number) === ns[1]);
    const lw = (l?.signal_name?.length ?? 0) * CHW, rw = (r?.signal_name?.length ?? 0) * CHW;
    return { cat, nums: ns, w: 500 + STUB * 2 + lw + rw, h: ROW, lw, rw };
  }
  const all = unionPins(c);
  const g = groupPins(all);
  const rows = Math.max(g.left.length, g.right.length, 1);
  const halfH = Math.max(rows * PITCH / 2 + PITCH, 2 * PITCH);
  const nameW = Math.max(...all.map((p) => p.name.length), 4) * 30;
  const halfW = Math.max(snap(nameW + 150), 300);
  const lw = Math.max(0, ...g.left.map((p) => (p.signal_name || "").length)) * CHW;
  const rw = Math.max(0, ...g.right.map((p) => (p.signal_name || "").length)) * CHW;
  const topExtra = g.top.length ? 150 + STUB + 150 : 0;    // 500: on the G grid
  const bottomExtra = g.bottom.length ? 150 + STUB + 150 : 0;
  const TEXT = 125;                                        // 2*TEXT + PITCH = 350: on the G grid
  return { cat, w: halfW * 2 + (150 + STUB) * 2 + lw + rw,
    // halfH is always a multiple of G, so h lands on the grid iff the CONSTANT terms do.
    // They did not: 2*TEXT + PITCH = 340 and topExtra = 470, so an odd pin count produced a height
    // off-grid, and because each row's cumulative y is snapped independently the gaps in a column
    // of identical parts came out 1150, 1150, 1100 (relays) / 1300, 1300, 1350 (fan headers).
    // Uniform-looking, 50 mil wrong. TEXT 120->125 and the extras' 120->150 fix it by moving each
    // symbol at most 60 mil, where rounding h to G moved sections enough to repack the sheet from
    // 55.3% fill to 44.8%.
    h: TEXT + topExtra + halfH * 2 + bottomExtra + TEXT + PITCH,
    halfW, halfH, topExtra, TEXT, lw, rw, groups: g };
}

// ---- emit ---------------------------------------------------------------------------------
const files = [];
let totalComps = 0, totalLabels = 0;

const BOARDS = { acdc: [], dcdc: [] };
for (const file of readdirSync(SRC).filter((f) => f.endsWith(".json")).sort()) {
  const pg = JSON.parse(readFileSync(join(SRC, file), "utf8"));
  const side = pg.page.startsWith("acdc") ? "acdc" : "dcdc";
  BOARDS[side].push(pg);
}
const KW = SKU.replace("kw", "").toUpperCase();
const CELLS = { "30kw": "1x", "60kw": "2x", "120kw": "4x" }[SKU] ?? "?";
const SIDE_TITLE = {
  acdc: `${KW} kW ACDC board 1of2 - Vienna PFC (${CELLS} cells)`,
  dcdc: `${KW} kW DCDC board 2of2 - 3-phase LLC (${CELLS} cells)`,
};
for (const [side, pgs] of Object.entries(BOARDS)) {
  const page = { page: `${SKU}-${side}`, title: SIDE_TITLE[side],
    total: pgs.reduce((a, p) => a + p.total, 0),
    nc: Object.assign({}, ...pgs.map((p) => p.nc)) };
  // every functional page contributes its blocks, prefixed so the section reads "PAGE / BLOCK"
  const blocks = pgs.flatMap((p) => p.block_order.map((b, i) => ({
    title: `${p.page.replace(/^(acdc|dcdc)-/, "")} / ${b}`, comps: p.chunks[i] })));

  for (const b of blocks) {
    b.items = b.comps.map((c) => ({ c, s: shapeOf(c) }));
    b.items.sort((a, z) => (z.s.cat === "IC") - (a.s.cat === "IC") || a.c.designator.localeCompare(z.c.designator));
    // Filling columns greedily to a height cap left the last column short, and the frame's height
    // is set by its tallest column — so every frame carried a dead band under its short column,
    // the same shelf problem one level down. Instead, try every sensible column count with the
    // items balanced across them, and keep the layout with the smallest frame area (mildly
    // penalising extreme aspect ratios so a section never becomes a sliver).
    const totalH = b.items.reduce((a, i) => a + i.s.h, 0);
    let bestL = null;
    for (let k = 1; k <= Math.min(6, b.items.length); k++) {
      const target = Math.ceil(totalH / k);
      const cols = []; let col = [], h = 0;
      for (const it of b.items) {
        if (col.length && h + it.s.h > target && cols.length < k - 1) { cols.push(col); col = []; h = 0; }
        col.push(it); h += it.s.h;
      }
      if (col.length) cols.push(col);
      let x = 0, maxH = 0; const placed = [];
      for (const c of cols) {
        // Every symbol in a column starts at the SAME x, set by the column's widest left-hand net
        // label -- not by its own. Offsetting each symbol by its own label width aligned the text
        // and staggered the bodies, so a column of identical resistors visibly zig-zagged (RNS1A
        // sat left of RNS1B because "AC1" is shorter than "N_ACDC_50"). The column has to grow to
        // suit, or the shifted symbols would overflow the frame.
        const mlw = Math.max(...c.map((i) => i.s.lw));
        const cw = mlw + Math.max(...c.map((i) => i.s.w - i.s.lw));
        let y = 0;
        for (const it of c) { placed.push({ it, x, y, clw: mlw }); y += it.s.h; }
        maxH = Math.max(maxH, y); x += cw + COLGAP;
      }
      const w = x - COLGAP + 2 * SECPAD, hh = maxH + 2 * SECPAD + SECTITLE;
      const score = w * hh * (1 + Math.abs(Math.log((w / hh) / 1.3)) * 0.15);
      if (!bestL || score < bestL.score) bestL = { placed, w, h: hh, score };
    }
    for (const { it, x, y, clw } of bestL.placed) { it.x = x; it.y = y; it.clw = clw; }
    // Height rounded UP to the Y grid. Frame TOPS were already snapped to YGRID, which fixed the
    // 10-30 mil near-misses -- but snapping added 0..249 mil to whatever gap sat above, so the
    // vertical gaps between stacked sections came out 400/450/500/550/600/650/700 while the
    // horizontal gaps were a uniform 400. Inconsistent breathing room between sections is exactly
    // the "spacing" half of visual rhythm. With h ALSO on the grid, y + h + SECGAP snaps to a
    // constant +500 every time: grid-aligned tops AND one uniform vertical gap, not a trade.
    b.w = bestL.w; b.h = Math.ceil(bestL.h / YGRID) * YGRID;
  }

  // Shelf rows set a row's height from its tallest frame, so every shorter frame in that row left
  // a dead band beneath it — measured 59-64% sheet fill, right margins ragged by up to 28850 mil,
  // and up to 5100 mil of slack inside a single row. Skyline placement drops each frame at the
  // lowest point it actually fits, reusing that leftover height.
  // Frames are placed in their existing logical order (not sorted by height, the usual packing
  // heuristic) so the signal flow the section list encodes survives the packing.
  const targetW = Math.max(Math.sqrt(blocks.reduce((a, b) => a + (b.w + SECGAP) * (b.h + SECGAP), 0) * 1.6),
    Math.max(...blocks.map((b) => b.w)));
  // Frames are placed on a COLUMN GRID, not free-form. Free skyline placement put 45 frames on 31
  // distinct left edges, with near-misses 50-200 mil apart (8850 vs 9000, 7900 vs 7950) — almost
  // aligned reads as careless, where clearly aligned reads as deliberate. Quantising each frame's
  // width up to a whole number of columns means every left edge comes from the same small set, so
  // the sheet has real columns and a visible rhythm. The width a frame gains becomes symmetric
  // padding inside it (content is centred), which reads as margin rather than as a gap.
  const GRID = 500;
  const gsnap = (v) => Math.ceil(v / GRID) * GRID;
  const widths = blocks.map((b) => b.w).sort((m, n) => m - n);
  // Rounding UP wastes at most COLW/2 per side, which measures as inner padding spanning
  // 283..2099 mil across 58 frames (symmetric -- L and R are always equal -- but a 7x spread).
  // A HALF-column grid was tried to halve that waste, including fixing capFor's unit (the family
  // cap is a COLUMN count, so halving the unit halves a family's physical width). Padding did
  // improve, p50 971->627 and max 2099->1183, but the page paid for it:
  //     30kw-acdc  fill 57.2->50.6  ragged  7450->14600
  //     60kw-acdc  fill 68.1->54.8  ragged  7350->15700
  //     60kw-dcdc  fill 71.8->62.8  ragged  4100->11130
  // A finer grid gives the packer more places to leave a stub of leftover column. Sheet fill and a
  // level bottom edge are far more visible than 1000 mil of symmetric margin inside a frame, so
  // the whole-column grid stays. Measured with calculations/frame-padding.mjs -- do not retry.
  const COLW = Math.max(gsnap(widths[Math.floor(widths.length * 0.4)] + SECGAP), 2500);
  for (const b of blocks) {
    b.span = Math.max(1, Math.ceil((b.w + SECGAP) / COLW));
    const full = b.span * COLW - SECGAP;
    b.pad = Math.round((full - b.w) / 2);          // centre the content in its widened frame
    b.w = full;
  }
  // Column count is searched, not guessed. A heuristic NC left a ragged bottom edge and an
  // L-shaped void in the bottom-right corner — the most visible flaw on the sheet. Score each
  // candidate on how level the columns finish (the ragged bottom) and how close the sheet lands
  // to a landscape 1.45 aspect, and keep the best.
  // Placement is family-aware. Packing purely by lowest-y scattered the three VIENNA-PFC phase
  // frames to opposite ends of the sheet — identical repeated circuits that a reader expects to
  // find side by side. So among the positions within one band of the lowest, prefer the one
  // nearest the family's previous frame: sections stay grouped, and the packing stays tight.
  const RAGGED_DIV = +(process.env.RAGGED_DIV || 2000);  // swept below; lower = level bottom edge matters more
const BAND = 16000;   // swept 2k..40k: 20k collapses family spread 21500->4500 mil without wrecking the aspect                                  // mil of extra height worth paying to stay grouped
  const famCount = new Map(), famSpan = new Map();
  for (const b of blocks) {
    const f = String(b.title).split(" / ")[0];
    famCount.set(f, (famCount.get(f) ?? 0) + 1);
    famSpan.set(f, Math.max(famSpan.get(f) ?? 1, b.span));
  }
  // How many columns a family may occupy is SEARCHED, not guessed. Fixing it at sqrt(n) left the
  // 60 kW AC-DC sheet with its whole bottom-left empty: VIENNA-PFC stacked six phases three rows
  // deep and set the sheet height while every other family finished at 60% of it. Sweeping a
  // multiplier lets a tall family widen out and the sheet come level.
  const capFor = (mul) => new Map([...famCount].map(([f, n]) =>
    [f, Math.max(famSpan.get(f), Math.round(Math.sqrt(n) * mul))]));
  // Frame ORDER is a search dimension too. With one fixed order no candidate could get the largest
  // empty rectangle under 12% on three of the six sheets — a tall frame early in a family leaves a
  // ledge nothing later fits into. Sorting by height inside each family is the standard fix, and it
  // costs nothing structurally: families keep their order and their grouping, only the sequence
  // within one family changes (and within a uniform family like LLC-TANKS it changes nothing).
  const orderings = [
    blocks,
    (() => {
      const byFam = new Map();
      for (const b of blocks) {
        const f = String(b.title).split(" / ")[0];
        if (!byFam.has(f)) byFam.set(f, []);
        byFam.get(f).push(b);
      }
      return [...byFam.values()].flatMap((g) => [...g].sort((m, n) => n.h - m.h));
    })(),
    (() => {                                          // widest-first inside each family
      const byFam = new Map();
      for (const b of blocks) {
        const f = String(b.title).split(" / ")[0];
        if (!byFam.has(f)) byFam.set(f, []);
        byFam.get(f).push(b);
      }
      return [...byFam.values()].flatMap((g) => [...g].sort((m, n) => n.w - m.w || n.h - m.h));
    })(),
  ];
  const runPack = (NC, famCap, order) => {
    const colH = new Array(NC).fill(MARGIN);
    const out = [], famAt = new Map();
    for (const b of order) {
      const fam = String(b.title).split(" / ")[0];
      const cands = [];
      for (let c = 0; c + b.span <= NC; c++) cands.push({ c, y: Math.max(...colH.slice(c, c + b.span)) });
      const minY = Math.min(...cands.map((k) => k.y));
      const seen = famAt.get(fam);
      // Distance is measured to the family's column BAND, not to its last column. Measuring to the
      // last column made "same column" always win at distance 0, so a family grew straight down:
      // on 60kw-dcdc LLC-TANKS stacked four frames in one column and finished 20000 mil below
      // LLC-LEGS, leaving a void over a quarter of the sheet. Treating any column inside the
      // family's band (or immediately beside it) as equally close lets a family spread sideways
      // and finish level, while still staying contiguous.
      // The band is CAPPED. Letting it grow by a column on each placement compounded, and
      // families sprawled back across the sheet (three sheets failed the spread gate). A family
      // of n frames gets about sqrt(n) columns, so it fills a compact rectangle rather than a
      // long stack or a long stripe.
      const cap = famCap.get(fam) ?? 1;
      const dist = (c) => {
        if (!seen) return c;
        const lo = Math.min(seen.lo, c), hi = Math.max(seen.hi, c + b.span - 1);
        if (hi - lo + 1 <= cap) return 0;
        return c < seen.lo ? seen.lo - c : c - seen.hi;
      };
      const best = cands.filter((k) => k.y <= minY + BAND).sort((m, n) =>
        dist(m.c) - dist(n.c) || m.y - n.y || m.c - n.c)[0];
      famAt.set(fam, seen
        ? { lo: Math.min(seen.lo, best.c), hi: Math.max(seen.hi, best.c + b.span - 1) }
        : { lo: best.c, hi: best.c + b.span - 1 });
      // Frame X is quantised to the column grid but Y never was, so tops landed wherever a column
      // happened to finish: the audit found pairs 10, 20 and 30 mil apart (8350 vs 8360, 22290 vs
      // 22300). At that distance the eye reads them as one line and sees the miss as sloppiness.
      // Snapping DOWN to a grid can only increase clearance from the frame above, never overlap.
      const Y = Math.ceil(best.y / YGRID) * YGRID;
      out.push({ b, X: MARGIN + best.c * COLW, Y });
      for (let k = best.c; k < best.c + b.span; k++) colH[k] = Y + b.h + SECGAP;
    }
    const H = Math.max(...colH), W = MARGIN + NC * COLW - SECGAP + MARGIN;
    const ragged = H - Math.min(...colH);            // how uneven the bottom edge finishes
    const sheetArea = W * (H + MARGIN + 800);
    const frameArea = blocks.reduce((a2, b2) => a2 + b2.w * b2.h, 0);
    const aspect = W / (H + MARGIN + 800);
    // three things the eye judges, in one score: how densely the sheet is used, how level the
    // bottom edge finishes, and how close the page is to a landscape proportion.
    // Aspect is a HARD gate, not a weighted term: as a soft penalty the density term ran away and
    // the search happily returned a 11600 x 222350 mil single-column ribbon — dense, and useless
    // as a drawing. Only landscape pages are candidates; among those, prefer dense and level.
    // families must also stay grouped: widest family may span at most 45% of the sheet width
    const famX = new Map();
    for (const { b: bb, X } of out) {
      const f = String(bb.title).split(" / ")[0];
      const e = famX.get(f) ?? [Infinity, -Infinity];
      famX.set(f, [Math.min(e[0], X), Math.max(e[1], X)]);
    }
    // A family's allowed spread scales with how much of the sheet it actually holds. A flat 45%
    // cap is right for a 3-frame family and wrong for VIENNA-PFC's twelve phase frames, which are
    // a third of the sheet's content: forcing them into 45% of the width made them stack tall and
    // pushed everything else into a bottom-left void.
    const famArea = new Map();
    for (const { b: bb } of out) {
      const f = String(bb.title).split(" / ")[0];
      famArea.set(f, (famArea.get(f) ?? 0) + bb.w * bb.h);
    }
    const spreadOver = Math.max(...[...famX].map(([f, [lo, hi]]) =>
      (hi - lo) / W - (0.35 + 0.9 * (famArea.get(f) / frameArea))));
    const spread = Math.max(...[...famX.values()].map(([lo, hi]) => hi - lo));
    // Bounding-box spread says nothing about the order a READER meets a family in. Scanning
    // column-major, 120kw-acdc's 12 VIENNA-PFC sections arrived in 6 separate bursts and
    // 60kw-dcdc's 4 BANKS-SP sections in 4 — related work encountered scattered, even though the
    // spread gate passed. Count contiguous runs per family and penalise fragmentation.
    const seq = [...out].sort((a, b) => (a.X - b.X) || (a.Y - b.Y));
    let runs = 0, prevFam = null;
    for (const { b: bb } of seq) {
      const f = String(bb.title).split(" / ")[0];
      if (f !== prevFam) runs++;
      prevFam = f;
    }
    const frag = runs - famX.size;          // 0 when every family is one contiguous run
    const voidFrac = largestVoid(out.map(({ b: bb, X, Y }) =>
      ({ x0: X, y0: Y, x1: X + bb.w, y1: Y + bb.h })), W, H + MARGIN + 800).frac;
    // Gate swept at 0.12 / 0.09 / 0.07 / 0.05: 0.09 is the optimum (worst void 10.4 -> 7.7%, fill
    // unchanged). Tighter is WORSE, because no candidate qualifies and the fallback takes over.
    // The largest empty rectangle is a GATE too, not just a weighted term. As a weighted term the
    // density objective outvoted it and sheets still came out with a 20-23% blank block in them,
    // which is the first thing the eye lands on.
    const usable = aspect >= 1.15 && aspect <= 2.1 && spreadOver <= 0 && voidFrac <= 0.09;
    // soft score is always computed: when no candidate clears every gate we still want the best
    // layout by the same objective, not whatever happens to be closest to a target aspect.
    // On the bigger sheets no configuration satisfies aspect AND grouping AND void at once, so the
    // soft score has to say which one yields. Grouping wins: a family scattered across two thirds
    // of the sheet contradicts an explicit design instruction ("keep related components tightly
    // grouped"), while a somewhat larger blank block is only untidy. Weight it so a spread
    // violation dominates the density and void terms rather than competing with them.
    const soft = (sheetArea / frameArea) * 10 + ragged / RAGGED_DIV + voidFrac * 60
      // Swept 0/1/3/8. At 1 the excess runs drop 67 -> 45 across the six sheets with the void
      // metric essentially unchanged (max stays 7%). At 3 fragmentation only improves to 38 but a
      // sheet's largest hole blows out to 23%, and the void metric has tracked the eye better than
      // any other number here. So: 1.
      + frag * 1
      + Math.max(0, spreadOver) * 300
      + (aspect >= 1.15 && aspect <= 2.1 ? 0 : 1000);
    const score = usable ? soft : Infinity;
    return { NC, out, colH, W, H, score, soft, aspect };
  };
  const minNC = Math.max(...blocks.map((b) => b.span));
  let pick = null, fallback = null;
  for (const order of orderings) {
    for (const mul of [1.0, 1.3, 1.6, 2.0, 2.5, 3.0, 4.0]) {
      const famCap = capFor(mul);
      for (let NC = minNC; NC <= minNC + 32; NC++) {   // swept to +64: saturates at +32, no candidate improves
        const r = runPack(NC, famCap, order);
        if (r.score < Infinity && (!pick || r.score < pick.score)) pick = r;
        if (!fallback || r.soft < fallback.soft) fallback = r;
      }
    }
  }
  pick = pick ?? fallback;
  { // layout quality, on stderr: the numbers behind what the eye sees on the rendered sheet
    const fa = blocks.reduce((a, b) => a + b.w * b.h, 0);
    const sa = pick.W * (pick.H + MARGIN + 800);
    console.error(`   [layout] ${page.page.padEnd(11)} NC=${String(pick.NC).padStart(2)} `
      + `fill=${(100 * fa / sa).toFixed(1)}% ragged=${pick.H - Math.min(...pick.colH)} `
      + `aspect=${pick.aspect.toFixed(2)} ${pick.score < Infinity ? "gated" : "FALLBACK"}`);
  }
  const NC = pick.NC;
  for (const { b, X, Y } of pick.out) { b.X = X; b.Y = Y; }
  const sheetW = snap(MARGIN + NC * COLW - SECGAP + MARGIN);
  const sheetH = snap(Math.max(...blocks.map((b) => b.Y + b.h)) + MARGIN + 800);

  const key = `${SKU}/${page.page.includes("acdc") ? "acdc" : "dcdc"}`;   // page.page is e.g. "30kw-acdc"
  const ident = SHEET_IDENT[key] ?? { sku: `${KW} kW`, board: "?", sheet: "? of 2", cells: "?" };

  let body = "", nLabels = 0, nNC = 0;
  const GL = (net, x, y, dir) => {                     // dir: 0 right, 2 left, 1 up, 3 down
    nLabels++;
    // Plain "Text Label", NOT "Text GLabel". EasyEDA renders an imported global label as a net
    // PORT: a fixed-width chevron holding about 7 characters, with the text scaled independently,
    // so 43% of this design's names spilled past the outline at any font size. A plain net label
    // has no enclosing glyph, so nothing can overflow. Scope is not lost: each board is a single
    // sheet and EasyEDA merges net labels by name across it; the only nets that leave a sheet are
    // the 14 cross-board ones, which cross physically on the DCP/DCN/PE studs and harness anyway.
    return `Text Label ${x} ${y} ${dir}    45   ~ 0\n${net}\n`;
  };

  // The biggest remaining holes are not packing failures to weight away -- family grouping is a
  // hard gate, so a frame CANNOT move to whichever column is short, and the two goals genuinely
  // conflict (grouping wins, by the user's instruction). What a draftsman does with the leftover is
  // put real content in it. Measuring the top-5 empty rectangles showed some sheets carry TWO
  // comparable holes (30kw-acdc: 7.8% and 7.0%) while only the largest was ever filled, so this
  // fills the top two: the sheet index, then a legend for the net-naming convention.
  {
    const used = blocks.map((b) => ({ x0: b.X, y0: b.Y, x1: b.X + b.w, y1: b.Y + b.h }));
    const PAD = 500, LH = 300, CW = 4200, HEAD = 160 + 260 + Math.round(LH * 1.4);
    const drawPanel = (V, title, sub, rows, footer) => {
      const px0 = snap(V.x0 + PAD), py0 = snap(V.y0 + PAD);
      const px1 = snap(V.x1 - PAD), maxY = snap(V.y1 - PAD);
      // The hole is whatever shape the packer leaves -- a tall slot on one sheet, a wide low band
      // on another -- so the panel lays itself out in as many columns as the space affords.
      const perCol = Math.floor((maxY - py0 - HEAD - LH - Math.round(PAD / 2)) / LH);
      // Column width ADAPTS to the slot. Fixed at 4200 it rejected 120kw-dcdc's 5213x20533
      // right-edge void -- 5213 less padding is 3813, which floors to zero columns -- so the
      // densest sheet ended up with no panel at all despite having a tall slot exactly where a
      // notes block belongs. 2600 still fits the longest row (~55 chars at 60 mil).
      const cw = Math.max(2600, Math.min(CW, px1 - px0 - 460));
      const maxCols = Math.floor((px1 - px0 - 400) / cw);
      if (perCol < 2 || maxCols < 1) return null;
      const ncols = Math.min(maxCols, Math.ceil(rows.length / perCol));
      const cap = ncols * perCol, over = rows.length > cap;
      const shown = rows.slice(0, over ? cap - 1 : rows.length);
      const cell = [...shown, ...(over ? [`+ ${rows.length - shown.length} more`] : [])];
      const nRow = Math.min(perCol, Math.max(1, Math.ceil(cell.length / ncols)));
      // RIGHT-ALIGN inside the void. Drawing at the void's left edge meant a wide bottom-right
      // void still produced a centre-left panel -- 120kw-acdc's index landed at x=51% even though
      // its slot reached the right margin, and nothing could stack beneath it there.
      const pw = 60 + ncols * cw + 200;
      const bx0 = snap(Math.max(px0, px1 - pw));
      const px1b = snap(Math.min(px1, bx0 + pw));
      const py1 = snap(py0 + HEAD + nRow * LH + LH + Math.round(PAD / 2));
      body += `Wire Notes Line\n\t${bx0} ${py0} ${px1b} ${py0}\nWire Notes Line\n\t${px1b} ${py0} ${px1b} ${py1}\n`
        + `Wire Notes Line\n\t${px1b} ${py1} ${bx0} ${py1}\nWire Notes Line\n\t${bx0} ${py1} ${bx0} ${py0}\n`;
      // same title inset as a section frame (60,160) so every titled box on the sheet matches
      body += `Text Notes ${bx0 + 60} ${py0 + 160} 0    79   ~ 16\n${title}\n`;
      body += `Text Notes ${bx0 + 60} ${py0 + 420} 0    60   ~ 0\n${sub}\n`;
      cell.forEach((t, i) => {
        const cx = bx0 + 60 + Math.floor(i / nRow) * cw, cy = py0 + HEAD + (i % nRow) * LH;
        body += `Text Notes ${snap(cx)} ${snap(cy)} 0    60   ~ 0\n${t}\n`;
      });
      if (footer) body += `Text Notes ${bx0 + 60} ${snap(py1 - 200)} 0    60   ~ 0\n${footer}\n`;
      return { x0: bx0, y0: py0, x1: px1b, y1: py1 };
    };
    const fams = new Map();
    for (const b of blocks) {
      const f = String(b.title).split(" / ")[0];
      fams.set(f, (fams.get(f) ?? 0) + 1);
    }
    const famRows = [...fams].sort((a, b2) => b2[1] - a[1] || a[0].localeCompare(b2[0]))
      .map(([f, n]) => `${f}   -   ${n} section${n > 1 ? "s" : ""}`);
    // Pick WHERE from a shortlist, not just the biggest hole. Measured across the six sheets, the
    // largest-hole rule scattered the blocks: index at top-right on one sheet and top-centre on
    // another, with the naming legend at bottom-LEFT while its own index sat at 85% right. A
    // drawing set puts its notes in the same corner on every sheet, so among candidate voids that
    // can actually hold the panel, prefer the one nearest the bottom-right -- beside the title
    // block, where a reader already looks.
    const pickVoid = (occupied) => {
      let cands = voidCandidates(occupied, sheetW, sheetH, 4)
        // must be big enough to hold a panel AND sit in the lower part of the sheet: a notes
        // block in the top strip reads as an accident. Without this the shortlist put the naming
        // legend in 120kw-dcdc's top-right CORNER, on a sheet that had correctly had none before.
        .filter((v) => v.x1 - v.x0 > 5200 && v.y1 - v.y0 > 2200 && v.y1 > sheetH * 0.4);
      if (!cands.length) return { x0: 0, y0: 0, x1: 0, y1: 0 };
      // Right side wins outright when one is available: with the index taking the best slot, the
      // legend was landing at x=22% on 60kw-dcdc while every other sheet had it at 72-85%.
      // Prefer a slot tall enough for BOTH panels so they can stack. Picking the index's slot on
      // its own merits left 120kw-acdc with the two blocks 25% of the sheet apart in the same
      // column -- same margin, but reading as two strays rather than one notes block.
      const tall = cands.filter((v) => v.y1 - v.y0 > 6400);
      cands = tall.length ? tall : cands;
      const right = cands.filter((v) => v.x1 > sheetW * 0.55);
      // RIGHT outweighs LOW. Scoring them equally let a very-low centre void beat a right-side one
      // and put 120kw-acdc's index at x=51%, where nothing could stack beneath it. A notes block
      // belongs against the right edge; how far down it sits matters less.
      return (right.length ? right : cands).sort((a, b) =>
        (2 * b.x1 / sheetW + b.y1 / sheetH) - (2 * a.x1 / sheetW + a.y1 / sheetH))[0];
    };
    const v1 = pickVoid(used);
    const p1 = drawPanel(v1, "SHEET INDEX",
      `${ident.sku} ${ident.board} - ${ident.sheet}`, famRows,
      `rev ${REV}   -   ${blocks.length} sections   -   ${page.total} components`);
    if (p1) {
      used.push(p1);
      // Try to stack the legend directly UNDER the index, in the same void. When the slot is tall
      // enough this keeps the two notes blocks together on a shared left edge -- a notes stack --
      // instead of the legend drifting to whatever hole is left over, which is how it ended up at
      // x=22% on one sheet while its own index sat at 72%.
      const below = { x0: p1.x0 - PAD, y0: p1.y1 + Math.round(PAD / 2), x1: p1.x1 + PAD, y1: v1.y1 };
      // Second hole gets a legend for the net names. Worth the space: every internal junction on
      // this drawing is named for what it JOINS rather than by an ordinal, and that convention is
      // invisible unless it is written down somewhere on the sheet.
      const legend = (V) => drawPanel(V, "NET NAMING",
        "internal junctions are named for what they join", [
          "U<ref>_<PIN>     node at that IC pin        e.g. UIVOA_VINP",
          "R<stem>_M        midpoint of a series pair  e.g. RBALTA_M",
          "R<stem>_<nm>     tap between R<stem>n/m     e.g. RV1D_01",
          "all others are explicit design nets",
        ], "");
      if (!legend(below)) legend(pickVoid(used));
    }
  }

  for (const b of blocks) {
    const x0 = b.X, y0 = b.Y, x1 = snap(b.X + b.w), y1 = snap(b.Y + b.h);
    body += `Wire Notes Line\n\t${x0} ${y0} ${x1} ${y0}\nWire Notes Line\n\t${x1} ${y0} ${x1} ${y1}\n`
      + `Wire Notes Line\n\t${x1} ${y1} ${x0} ${y1}\nWire Notes Line\n\t${x0} ${y1} ${x0} ${y0}\n`;
    body += `Text Notes ${x0 + 60} ${y0 + 160} 0    79   ~ 16\n${b.title}\n`;

    for (const it of b.items) {
      const { c, s } = it;
      const ox = snap(b.X + SECPAD + (b.pad ?? 0) + it.x + (it.clw ?? s.lw) + STUB);
      const oy = snap(b.Y + SECTITLE + SECPAD + it.y);
      const { mpn, lc } = partOf(c.designator, c.value);
      if (s.cat === "TERM") {
        const p0 = c.pins[0];
        const cx = snap(ox + 100), cyy = snap(oy + ROW / 2);
        const nm = termLib(p0.pin_number, p0.name);
        body += `$Comp\nL ${LIB_NAME}:${nm} ${c.designator}\nU 1 1 ${nextId()}\nP ${cx} ${cyy}\n`
          + `F 0 "${c.designator}" H ${cx} ${cyy - 160} 50  0000 C CNN\n`
          + `F 1 "${c.value}" H ${cx} ${cyy + 170} 50  0000 C CNN\n`
          + `F 2 "${fpFor(c.designator, mpn)}" H ${cx} ${cyy} 50  0001 C CNN\nF 3 "~" H ${cx} ${cyy} 50  0001 C CNN\n`
          + `F 4 "${lc.lcsc ?? lc.status}" H ${cx} ${cyy} 50  0001 C CNN "LCSC"\n`
          + `F 5 "${mpn}" H ${cx} ${cyy} 50  0001 C CNN "MPN"\n`
          + `\t1    ${cx} ${cyy}\n\t1    0    0    -1  \n$EndComp\n`;
        if (p0.signal_name) {
          const pxx = snap(cx - 100), ex = snap(pxx - STUB);
          body += `Wire Wire Line\n\t${pxx} ${cyy} ${ex} ${cyy}\n` + GL(p0.signal_name, ex, cyy, 2);
        }
      } else if (s.cat !== "IC") {
        const cx = snap(ox + 250), cyy = snap(oy + ROW / 2);
        const nm = passiveLib(s.cat, s.nums[0] ?? "1", s.nums[1] ?? "2");
        body += `$Comp\nL ${LIB_NAME}:${nm} ${c.designator}\nU 1 1 ${nextId()}\nP ${cx} ${cyy}\n`
          + `F 0 "${c.designator}" H ${cx} ${cyy - 160} 50  0000 C CNN\n`
          + `F 1 "${c.value}" H ${cx} ${cyy + 170} 50  0000 C CNN\n`
          + `F 2 "${fpFor(c.designator, mpn)}" H ${cx} ${cyy} 50  0001 C CNN\nF 3 "~" H ${cx} ${cyy} 50  0001 C CNN\n`
          + `F 4 "${lc.lcsc ?? lc.status}" H ${cx} ${cyy} 50  0001 C CNN "LCSC"\n`
          + `F 5 "${mpn}" H ${cx} ${cyy} 50  0001 C CNN "MPN"\n`
          + `\t1    ${cx} ${cyy}\n\t1    0    0    -1  \n$EndComp\n`;
        const sides = [[s.nums[0], snap(cx - 250), -1], [s.nums[1], snap(cx + 250), 1]];
        for (const [pn, pxx, dir] of sides) {
          const p = c.pins.find((q) => String(q.pin_number) === String(pn));
          if (!p || !p.signal_name) continue;
          const ex = snap(pxx + dir * STUB);
          body += `Wire Wire Line\n\t${pxx} ${cyy} ${ex} ${cyy}\n`;
          body += GL(p.signal_name, ex, cyy, dir < 0 ? 2 : 0);
        }
      } else {
        const cx = snap(ox + s.halfW + 150), cyy = snap(oy + s.TEXT + s.topExtra + s.halfH);
        const nm = icLib(c.mpn || c.value, unionPins(c));
        body += `$Comp\nL ${LIB_NAME}:${nm} ${c.designator}\nU 1 1 ${nextId()}\nP ${cx} ${cyy}\n`
          + `F 0 "${c.designator}" H ${cx - s.halfW - 100} ${cyy - s.halfH - 100} 50  0000 R CNN\n`
          + `F 1 "${c.value}" H ${cx - s.halfW - 100} ${cyy + s.halfH + 130} 50  0000 R CNN\n`
          + `F 2 "${fpFor(c.designator, mpn)}" H ${cx} ${cyy} 50  0001 C CNN\nF 3 "~" H ${cx} ${cyy} 50  0001 C CNN\n`
          + `F 4 "${lc.lcsc ?? lc.status}" H ${cx} ${cyy} 50  0001 C CNN "LCSC"\n`
          + `F 5 "${mpn}" H ${cx} ${cyy} 50  0001 C CNN "MPN"\n`
          + `\t1    ${cx} ${cyy}\n\t1    0    0    -1  \n$EndComp\n`;
        const bound = new Map(c.pins.map((p) => [String(p.pin_number), p.signal_name]));
        const g = s.groups;
        const noConn = (x, y) => { body += `NoConn ~ ${x} ${y}\n`; nNC++; };
        g.left.forEach((p, i) => {
          const pxx = snap(cx - s.halfW - 150), py = snap(cyy - s.halfH + PITCH + i * PITCH);
          const sig = bound.get(String(p.pin_number));
          if (!sig) return noConn(pxx, py);
          const ex = snap(pxx - STUB);
          body += `Wire Wire Line\n\t${pxx} ${py} ${ex} ${py}\n` + GL(sig, ex, py, 2);
        });
        g.right.forEach((p, i) => {
          const pxx = snap(cx + s.halfW + 150), py = snap(cyy - s.halfH + PITCH + i * PITCH);
          const sig = bound.get(String(p.pin_number));
          if (!sig) return noConn(pxx, py);
          const ex = snap(pxx + STUB);
          body += `Wire Wire Line\n\t${pxx} ${py} ${ex} ${py}\n` + GL(sig, ex, py, 0);
        });
        g.top.forEach((p, i) => {
          const sig = bound.get(String(p.pin_number)); if (!sig) return;
          const pxx = snap(cx - s.halfW + PITCH + i * PITCH), py = snap(cyy - s.halfH - 150);
          const ey = snap(py - STUB);
          body += `Wire Wire Line\n\t${pxx} ${py} ${pxx} ${ey}\n` + GL(sig, pxx, ey, 1);
        });
        g.bottom.forEach((p, i) => {
          const sig = bound.get(String(p.pin_number)); if (!sig) return;
          const pxx = snap(cx - s.halfW + PITCH + i * PITCH), py = snap(cyy + s.halfH + 150);
          const ey = snap(py + STUB);
          body += `Wire Wire Line\n\t${pxx} ${py} ${pxx} ${ey}\n` + GL(sig, pxx, ey, 3);
        });
      }
      totalComps++;
    }
  }
  totalLabels += nLabels;

  const sch = `EESchema Schematic File Version 4\nEELAYER 30 0\nEELAYER END\n`
    + `$Descr User ${sheetW} ${sheetH}\nencoding utf-8\nSheet 1 1\n`
    // The title block is the sheet's identity when it is printed on its own: which SKU, which
    // board of the sandwich, which sheet of how many, and what the board contains.
    + `Title "${SHEET_TITLES[key] ?? page.title ?? page.page}"\n`
    + `Date "${new Date().toISOString().slice(0, 10)}"\nRev "${REV}"\n`
    + `Comp "DC-Modules ${ident.sku} - board ${ident.board}, sheet ${ident.sheet}"\n`
    + `Comment1 "Module ${ident.sku} = two-board sandwich: sheet 1 AC-DC (lower) + sheet 2 DC-DC (upper), bolted DCP/DCN/PE studs + 16-way control harness"\n`
    + `Comment2 "Content: ${ident.cells}"\n`
    + `Comment3 "${blocks.length} functional sections - ${page.total} components - cross-section links are global net labels; wires are pin stubs only"\n`
    + `Comment4 "Every component carries MPN + LCSC fields (CLASS = buy to class spec, CUSTOM = made to drawing)"\n$EndDescr\n${body}$EndSCHEMATC\n`;
  writeFileSync(join(OUT, `${page.page}.sch`), sch);
  files.push(page.page);
  console.log(`${page.page.padEnd(22)} ${String(page.total).padStart(3)} comps · ${blocks.length} sections · ${nLabels} labels · ${nNC} no-connects · ${sheetW}×${sheetH} mil`);
}

// Root sheet referencing all twelve pages, so EasyEDA imports the whole board set in one go
// rather than one loose file at a time.
{
  let root = "", sx = 1000, sy = 1000;
  files.forEach((name, i) => {
    const col = i % 2, rowi = Math.floor(i / 2);
    const X = sx + col * 5200, Y = sy + rowi * 2200;
    root += `$Sheet\nS ${X} ${Y} 4200 1400\nU ${nextId()}\n`
      + `F0 "${SIDE_TITLE[name.replace(`${SKU}-`, "")] ?? name}" 70\nF1 "${name}.sch" 70\n$EndSheet\n`;
  });
  const rootSch = `EESchema Schematic File Version 4\nEELAYER 30 0\nEELAYER END\n`
    + `$Descr User 12000 8000\nencoding utf-8\nSheet 1 1\n`
    + `Title "DC-Modules ${KW} kW module - schematic set"\nDate "${new Date().toISOString().slice(0, 10)}"\nRev "D.1"\n`
    + `Comp "DC-Modules"\nComment1 "AC-DC (Vienna PFC) sheets 1-6 - DC-DC (3-phase LLC) sheets 7-12"\n`
    + `Comment2 "${CELLS} Vienna PFC cells + ${CELLS} 3-phase LLC cells per module"\nComment3 ""\nComment4 ""\n$EndDescr\n`
    + `${root}$EndSCHEMATC\n`;
  writeFileSync(join(OUT, `dc-modules-${SKU}.sch`), rootSch);
}

writeFileSync(join(OUT, `${LIB_NAME}.lib`),
  mirrorLibY(`EESchema-LIBRARY Version 2.4\n#encoding utf-8\n${[...lib.values()].join("")}#\n#End Library\n`));
writeFileSync(join(OUT, `${LIB_NAME}.dcm`), `EESchema-DOCLIB  Version 2.0\n#\n#End Doc Library\n`);
writeFileSync(join(OUT, `dc-modules-${SKU}.pro`),
  `update=Date\nversion=1\nlast_client=eeschema\n[general]\nversion=1\n[eeschema]\nversion=1\nLibDir=\n[eeschema/libraries]\nLibName1=${LIB_NAME}\n`);
console.log(`\n${files.length} sheets · ${totalComps} components · ${totalLabels} labels · ${lib.size} symbols → kicad5/dc-modules-${SKU}/`);
