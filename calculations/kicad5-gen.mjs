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

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LCSC } from "./cost/lcsc-map.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "calculations/out/easyeda/apply");
const OUT = join(ROOT, "kicad5/dc-modules-30kw");
mkdirSync(OUT, { recursive: true });

// ---- geometry in mils (50 mil grid) ------------------------------------------------------
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
const CHW = 33;               // label glyph advance at 50 mil text size

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
  const g = { left: [], right: [], top: [], bottom: [] };
  for (const p of pins) g[pinSide(p.name)].push(p);
  for (const k of Object.keys(g)) g[k].sort((a, b) => Number(a.pin_number) - Number(b.pin_number));
  if (g.left.length > 16 && g.right.length * 2 < g.left.length) {
    const half = Math.ceil(g.left.length / 2);
    g.right = g.left.slice(half).concat(g.right).sort((a, b) => Number(a.pin_number) - Number(b.pin_number));
    g.left = g.left.slice(0, half);
  }
  return g;
}
const CAT = (value, mpn, pins) => {
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
  const px = (p, x, y, orient) =>
    `X ${p.name.replace(/\s+/g, "_")} ${p.pin_number} ${x} ${y} 150 ${orient} 50 40 1 1 ${
      /^(GND|VEE|VSS|EP|VDD|VCC|VIN|VP|COM)/i.test(p.name) ? "W" : "P"}\n`;
  g.left.forEach((p, i) => { draw += px(p, -halfW - 150, halfH - PITCH - i * PITCH, "R"); });
  g.right.forEach((p, i) => { draw += px(p, halfW + 150, halfH - PITCH - i * PITCH, "L"); });
  g.top.forEach((p, i) => { draw += px(p, -halfW + PITCH + i * PITCH, halfH + 150, "D"); });
  g.bottom.forEach((p, i) => { draw += px(p, -halfW + PITCH + i * PITCH, -halfH - 150, "U"); });
  lib.set(nm, `#\n# ${nm}\n#\nDEF ${nm} U 0 40 Y Y 1 F N\n`
    + `F0 "U" ${-halfW} ${halfH + 100} 50 H V L CNN\nF1 "${nm}" ${-halfW} ${-halfH - 100} 50 H V L CNN\n`
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
  const topExtra = g.top.length ? 150 + STUB + 120 : 0;
  const bottomExtra = g.bottom.length ? 150 + STUB + 120 : 0;
  const TEXT = 120;
  return { cat, w: halfW * 2 + (150 + STUB) * 2 + lw + rw,
    h: TEXT + topExtra + halfH * 2 + bottomExtra + TEXT + PITCH,
    halfW, halfH, topExtra, TEXT, lw, rw, groups: g };
}

// ---- emit ---------------------------------------------------------------------------------
const files = [];
let totalComps = 0, totalLabels = 0;

for (const file of readdirSync(SRC).filter((f) => f.endsWith(".json")).sort()) {
  const page = JSON.parse(readFileSync(join(SRC, file), "utf8"));
  const blocks = page.block_order.map((b, i) => ({ title: b, comps: page.chunks[i] }));

  for (const b of blocks) {
    b.items = b.comps.map((c) => ({ c, s: shapeOf(c) }));
    b.items.sort((a, z) => (z.s.cat === "IC") - (a.s.cat === "IC") || a.c.designator.localeCompare(z.c.designator));
    const maxColH = Math.max(2500, Math.ceil(Math.sqrt(b.items.reduce((a, i) => a + i.s.h, 0) * 550)));
    const cols = []; let col = [], h = 0;
    for (const it of b.items) {
      if (col.length && h + it.s.h > maxColH) { cols.push(col); col = []; h = 0; }
      col.push(it); h += it.s.h;
    }
    if (col.length) cols.push(col);
    let x = 0, maxH = 0;
    for (const c of cols) {
      const cw = Math.max(...c.map((i) => i.s.w));
      let y = 0;
      for (const it of c) { it.x = x; it.y = y; y += it.s.h; }
      maxH = Math.max(maxH, y); x += cw + COLGAP;
    }
    b.w = x - COLGAP + 2 * SECPAD; b.h = maxH + 2 * SECPAD + SECTITLE;
  }

  const targetW = Math.max(Math.sqrt(blocks.reduce((a, b) => a + (b.w + SECGAP) * (b.h + SECGAP), 0) * 1.5),
    Math.max(...blocks.map((b) => b.w)));
  const rows = []; let row = [], rw = 0;
  for (const b of blocks) {
    if (row.length && rw + SECGAP + b.w > targetW) { rows.push(row); row = []; rw = 0; }
    row.push(b); rw += (row.length > 1 ? SECGAP : 0) + b.w;
  }
  if (row.length) rows.push(row);
  let cy = MARGIN;
  for (const r of rows) {
    let cx = MARGIN;
    for (const b of r) { b.X = snap(cx); b.Y = snap(cy); cx += b.w + SECGAP; }
    cy += Math.max(...r.map((b) => b.h)) + SECGAP;
  }
  const sheetW = snap(Math.max(...rows.map((r) => r.reduce((a, b, i) => a + b.w + (i ? SECGAP : 0), 0))) + 2 * MARGIN);
  const sheetH = snap(cy - SECGAP + MARGIN + 800);

  let body = "", nLabels = 0;
  const GL = (net, x, y, dir) => {                     // dir: 0 right, 2 left, 1 up, 3 down
    nLabels++;
    return `Text GLabel ${x} ${y} ${dir}    50   ${dir === 2 ? "Input" : "Output"} ~ 0\n${net}\n`;
  };

  for (const b of blocks) {
    const x0 = b.X, y0 = b.Y, x1 = snap(b.X + b.w), y1 = snap(b.Y + b.h);
    body += `Wire Notes Line\n\t${x0} ${y0} ${x1} ${y0}\nWire Notes Line\n\t${x1} ${y0} ${x1} ${y1}\n`
      + `Wire Notes Line\n\t${x1} ${y1} ${x0} ${y1}\nWire Notes Line\n\t${x0} ${y1} ${x0} ${y0}\n`;
    body += `Text Notes ${x0 + 60} ${y0 + 160} 0    79   ~ 16\n${b.title}\n`;

    for (const it of b.items) {
      const { c, s } = it;
      const ox = snap(b.X + SECPAD + it.x + s.lw + STUB);
      const oy = snap(b.Y + SECTITLE + SECPAD + it.y);
      const lc = LCSC[c.mpn] ?? {};
      if (s.cat !== "IC") {
        const cx = snap(ox + 250), cyy = snap(oy + ROW / 2);
        const nm = passiveLib(s.cat, s.nums[0] ?? "1", s.nums[1] ?? "2");
        body += `$Comp\nL dc-modules:${nm} ${c.designator}\nU 1 1 ${nextId()}\nP ${cx} ${cyy}\n`
          + `F 0 "${c.designator}" H ${cx} ${cyy - 160} 50  0000 C CNN\n`
          + `F 1 "${c.value}" H ${cx} ${cyy + 170} 50  0000 C CNN\n`
          + `F 2 "" H ${cx} ${cyy} 50  0001 C CNN\nF 3 "~" H ${cx} ${cyy} 50  0001 C CNN\n`
          + `F 4 "${lc.lcsc ?? lc.status ?? ""}" H ${cx} ${cyy} 50  0001 C CNN "LCSC"\n`
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
        body += `$Comp\nL dc-modules:${nm} ${c.designator}\nU 1 1 ${nextId()}\nP ${cx} ${cyy}\n`
          + `F 0 "${c.designator}" H ${cx - s.halfW} ${cyy - s.halfH - 100} 50  0000 L CNN\n`
          + `F 1 "${c.value}" H ${cx - s.halfW} ${cyy + s.halfH + 130} 50  0000 L CNN\n`
          + `F 2 "" H ${cx} ${cyy} 50  0001 C CNN\nF 3 "~" H ${cx} ${cyy} 50  0001 C CNN\n`
          + `F 4 "${lc.lcsc ?? lc.status ?? ""}" H ${cx} ${cyy} 50  0001 C CNN "LCSC"\n`
          + `\t1    ${cx} ${cyy}\n\t1    0    0    -1  \n$EndComp\n`;
        const bound = new Map(c.pins.map((p) => [String(p.pin_number), p.signal_name]));
        const g = s.groups;
        g.left.forEach((p, i) => {
          const sig = bound.get(String(p.pin_number)); if (!sig) return;
          const pxx = snap(cx - s.halfW - 150), py = snap(cyy - s.halfH + PITCH + i * PITCH);
          const ex = snap(pxx - STUB);
          body += `Wire Wire Line\n\t${pxx} ${py} ${ex} ${py}\n` + GL(sig, ex, py, 2);
        });
        g.right.forEach((p, i) => {
          const sig = bound.get(String(p.pin_number)); if (!sig) return;
          const pxx = snap(cx + s.halfW + 150), py = snap(cyy - s.halfH + PITCH + i * PITCH);
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
    + `Title "${page.title ?? page.page}"\nDate "${new Date().toISOString().slice(0, 10)}"\nRev "D.1"\n`
    + `Comp "DC-Modules - 30 kW module"\n`
    + `Comment1 "${page.page} - ${blocks.length} sections - ${page.total} components"\n`
    + `Comment2 "Cross-section links are global net labels; wires are pin stubs only"\n`
    + `Comment3 ""\nComment4 ""\n$EndDescr\n${body}$EndSCHEMATC\n`;
  writeFileSync(join(OUT, `${page.page}.sch`), sch);
  files.push(page.page);
  console.log(`${page.page.padEnd(22)} ${String(page.total).padStart(3)} comps · ${blocks.length} sections · ${nLabels} labels · ${sheetW}×${sheetH} mil`);
}

// Root sheet referencing all twelve pages, so EasyEDA imports the whole board set in one go
// rather than one loose file at a time.
{
  let root = "", sx = 1000, sy = 1000;
  files.forEach((name, i) => {
    const col = i % 3, rowi = Math.floor(i / 3);
    const X = sx + col * 3200, Y = sy + rowi * 1600;
    root += `$Sheet\nS ${X} ${Y} 2600 900\nU ${nextId()}\n`
      + `F0 "${name}" 60\nF1 "${name}.sch" 60\n$EndSheet\n`;
  });
  const rootSch = `EESchema Schematic File Version 4\nEELAYER 30 0\nEELAYER END\n`
    + `$Descr User 12000 8000\nencoding utf-8\nSheet 1 1\n`
    + `Title "DC-Modules 30 kW module - schematic set"\nDate "${new Date().toISOString().slice(0, 10)}"\nRev "D.1"\n`
    + `Comp "DC-Modules"\nComment1 "AC-DC (Vienna PFC) sheets 1-6 - DC-DC (3-phase LLC) sheets 7-12"\n`
    + `Comment2 "60 kW = 2x these cells - 120 kW = 4x"\nComment3 ""\nComment4 ""\n$EndDescr\n`
    + `${root}$EndSCHEMATC\n`;
  writeFileSync(join(OUT, "dc-modules-30kw.sch"), rootSch);
}

writeFileSync(join(OUT, "dc-modules.lib"),
  `EESchema-LIBRARY Version 2.4\n#encoding utf-8\n${[...lib.values()].join("")}#\n#End Library\n`);
writeFileSync(join(OUT, "dc-modules.dcm"), `EESchema-DOCLIB  Version 2.0\n#\n#End Doc Library\n`);
writeFileSync(join(OUT, "dc-modules-30kw.pro"),
  `update=Date\nversion=1\nlast_client=eeschema\n[general]\nversion=1\n[eeschema]\nversion=1\nLibDir=\n[eeschema/libraries]\nLibName1=dc-modules\n`);
console.log(`\n${files.length} sheets · ${totalComps} components · ${totalLabels} labels · ${lib.size} symbols → kicad5/dc-modules-30kw/`);
