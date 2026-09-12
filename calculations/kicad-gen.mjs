#!/usr/bin/env node
// kicad-gen.mjs — author the schematic set as KiCad files with hand-placed geometry.
//
// Why this exists: the EasyEDA Copilot MCP exposes no way to set a component position, draw a
// wire, or place a frame — it auto-grids symbols and drops net ports, and its own success
// reports are unreliable (see docs/history/easyeda-transcription.md). So a millimetre-accurate,
// deliberately composed schematic cannot be produced through that API. Authoring KiCad source
// puts every coordinate under our control, gives a real verification loop (kicad-cli erc +
// netlist export diffed against circuit.json), and imports into EasyEDA Pro.
//
// Layout is the dense label-stub style used for large industrial designs, chosen because it
// satisfies the drawing rules by construction:
//   * every pin gets a short stub ending in a net label -> no long wires, no crossings ever
//   * inter-section links are net labels, never wires
//   * components sit on a 2.54 mm grid in uniform columns inside a titled section frame
//   * sections tile with uniform gutters, left-to-right then top-to-bottom
//
// Input:  calculations/out/easyeda/apply/*.json  (verified 608/608 components, pins -> nets)
// Output: kicad/dc-modules-30kw/*.kicad_sch + dc-modules.kicad_sym + .kicad_pro
// Run:    node calculations/kicad-gen.mjs

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { LCSC } from "./cost/lcsc-map.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "calculations/out/easyeda/apply");
const OUT = join(ROOT, "kicad/dc-modules-30kw");
mkdirSync(OUT, { recursive: true });

// ---- geometry, all in mm on a 1.27 grid -------------------------------------------------
const G = 1.27;
const snap = (v) => Math.round(v / G) * G;
const PITCH = 2.54;          // pin pitch
const STUB = 5.08;           // pin stub before its label
const ROW = 10.16;           // vertical pitch between stacked 2-pin parts (7.62 collided ref/value)
const COLGAP = 10.16;        // gap between component columns inside a section
const SECPAD = 5.08;         // padding inside a section frame
const SECTITLE = 6.35;       // head-room for the section title
const SECGAP = 10.16;        // gutter between section frames
const MARGIN = 12.7;         // sheet margin
const CHW = 0.82;            // label glyph advance at 1.27 mm font

const uuid = (s) => {
  const h = createHash("sha1").update(s).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// ---- part shape classification ----------------------------------------------------------
const isGnd = (n) => /^(GND|DGND|AGND|CGND|PE|VEE|VSS|COM|VN|OUTN_SH)$/i.test(n) || /GND$/i.test(n);
const isRail = (n) => /^(V3P3|V15|V24|VDD|VCC|VIN|VBUS|DCP|DCN|MID|AVMID|B5\w*|BK[AB][PN]|OUT[PN]|NSTAR|VDDA\w*)$/i.test(n);

/** Which side of an IC body a pin belongs on, so the symbol reads like a drawn part. */
function pinSide(name, sig) {
  if (/^(VDD|VCC|VIN|VP|VDD1|VDD2|VCC1|VCC2|V\+|COM)$/i.test(name)) return "top";
  if (/^(GND|GND1|GND2|VEE|VEE2|VSS|VN|V-|EP)$/i.test(name)) return "bottom";
  if (/^(OUT|OUTP|OUTN|OUTH|OUTL|Y\d?|DRV|GATE|SW|VO|Q\d|CANH|CANL|TXD|RXD|P5|P18|\+VO|-VO|0V)$/i.test(name)) return "right";
  if (/^OUT/i.test(name) || /^Q\d/.test(name)) return "right";
  return "left";
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

// ---- symbol library ---------------------------------------------------------------------
const libSymbols = new Map();

function termSymbol(pinNum, pinName) {
  const id = `dc-modules:TERM_${pinNum}`;
  if (libSymbols.has(id)) return id;
  libSymbols.set(id, `(symbol "dc-modules:TERM_${pinNum}"
    (pin_names (offset 0.762) (hide yes)) (exclude_from_sim no) (in_bom yes) (on_board yes)
    (property "Reference" "J" (at 0 3.302 0) (effects (font (size 1.016 1.016))))
    (property "Value" "TERM" (at 0 -3.302 0) (effects (font (size 1.016 1.016))))
    (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "~" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (symbol "TERM_${pinNum}_0_1"
      (circle (center 1.27 0) (radius 0.889)
        (stroke (width 0.254) (type default)) (fill (type none))))
    (symbol "TERM_${pinNum}_1_1"
      (pin passive line (at -2.54 0 0) (length 2.921)
        (name "${esc(pinName)}" (effects (font (size 1.016 1.016))))
        (number "${esc(String(pinNum))}" (effects (font (size 1.016 1.016)))))))`);
  return id;
}

function passiveSymbol(kind, n1 = "1", n2 = "2") {
  const suffix = (n1 === "1" && n2 === "2") ? "" : `_${n1}${n2}`;
  const id = `dc-modules:${kind}${suffix}`;
  if (libSymbols.has(id)) return id;
  let body = "";
  if (kind === "R") {
    body = `(rectangle (start -1.016 2.54) (end 1.016 -2.54)
        (stroke (width 0.254) (type default)) (fill (type none)))`;
  } else if (kind === "C") {
    body = `(polyline (pts (xy -2.032 0.635) (xy 2.032 0.635)) (stroke (width 0.508) (type default)) (fill (type none)))
      (polyline (pts (xy -2.032 -0.635) (xy 2.032 -0.635)) (stroke (width 0.508) (type default)) (fill (type none)))`;
  } else if (kind === "CP") {
    body = `(polyline (pts (xy -2.032 0.635) (xy 2.032 0.635)) (stroke (width 0.508) (type default)) (fill (type none)))
      (arc (start 2.032 -1.27) (mid 0 -0.254) (end -2.032 -1.27) (stroke (width 0.508) (type default)) (fill (type none)))`;
  } else if (kind === "L") {
    body = `(arc (start 0 -2.54) (mid 0.635 -1.27) (end 0 0) (stroke (width 0.254) (type default)) (fill (type none)))
      (arc (start 0 0) (mid 0.635 1.27) (end 0 2.54) (stroke (width 0.254) (type default)) (fill (type none)))`;
  } else if (kind === "D") {
    body = `(polyline (pts (xy -1.27 1.27) (xy -1.27 -1.27) (xy 1.27 0) (xy -1.27 1.27))
        (stroke (width 0.254) (type default)) (fill (type outline)))
      (polyline (pts (xy 1.27 1.27) (xy 1.27 -1.27)) (stroke (width 0.508) (type default)) (fill (type none)))`;
  }
  // horizontal part: pin 1 left, pin 2 right — reads label · stub · body · stub · label
  const sym = `(symbol "dc-modules:${kind}${suffix}"
    (pin_names (offset 0.762) (hide yes))
    (exclude_from_sim no) (in_bom yes) (on_board yes)
    (property "Reference" "${kind === "D" ? "D" : kind === "L" ? "L" : kind.startsWith("C") ? "C" : "R"}" (at 0 3.302 0)
      (effects (font (size 1.016 1.016))))
    (property "Value" "${kind}" (at 0 -3.302 0) (effects (font (size 1.016 1.016))))
    (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "~" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (symbol "${kind}${suffix}_0_1" ${body})
    (symbol "${kind}${suffix}_1_1"
      (pin passive line (at -6.35 0 0) (length 4.318)
        (name "${n1}" (effects (font (size 1.016 1.016)))) (number "${n1}" (effects (font (size 1.016 1.016)))))
      (pin passive line (at 6.35 0 180) (length 4.318)
        (name "${n2}" (effects (font (size 1.016 1.016)))) (number "${n2}" (effects (font (size 1.016 1.016)))))))`;
  libSymbols.set(id, sym);
  return id;
}

/** Group a part's pins onto body sides. ONE definition, used by both the symbol builder and
 *  the placer — when these two disagreed, every label landed on the wrong pin. Large pin
 *  counts are balanced across left/right so a 100-pin MCU reads as a box, not a tall column. */
function groupPins(pins) {
  const g = { left: [], right: [], top: [], bottom: [] };
  for (const p of pins) g[pinSide(p.name, p.signal_name)].push(p);
  for (const k of Object.keys(g)) g[k].sort((a, b) => Number(a.pin_number) - Number(b.pin_number));
  if (g.left.length > 16 && g.right.length * 2 < g.left.length) {
    const half = Math.ceil(g.left.length / 2);
    g.right = g.left.slice(half).concat(g.right).sort((a, b) => Number(a.pin_number) - Number(b.pin_number));
    g.left = g.left.slice(0, half);
  }
  return g;
}

/** A box symbol for a multi-pin part, pins grouped by function so it reads deliberately. */
function icSymbol(rawKey, pins) {
  const key = String(rawKey).replace(/[^A-Za-z0-9_.+-]/g, "_");
  const id = `dc-modules:${key}`;
  if (libSymbols.has(id)) return id;
  const groups = groupPins(pins);

  const rows = Math.max(groups.left.length, groups.right.length, 1);
  const halfH = Math.max(rows * PITCH / 2 + PITCH, PITCH * 2);
  const nameW = Math.max(...pins.map((p) => p.name.length), 4) * 0.75;
  const halfW = Math.max(snap(nameW + 3.81), 7.62);

  let body = `(rectangle (start ${-halfW} ${halfH}) (end ${halfW} ${-halfH})
      (stroke (width 0.254) (type default)) (fill (type background)))`;
  let pinS = "";
  const emit = (p, x, y, rot) => {
    const type = isGnd(p.signal_name) || /^(GND|VEE|VSS|EP)/i.test(p.name) ? "power_in"
      : /^(VDD|VCC|VIN|VP|COM)/i.test(p.name) ? "power_in"
      : pinSide(p.name, p.signal_name) === "right" ? "output" : "input";
    const side = pinSide(p.name, p.signal_name);
    const shown = (side === "top" || side === "bottom") ? "~" : p.name;   // "~" = no name drawn
    pinS += `(pin ${type} line (at ${x} ${y} ${rot}) (length 3.81)
        (name "${esc(shown)}" (effects (font (size 1.016 1.016))))
        (number "${esc(String(p.pin_number))}" (effects (font (size 0.762 0.762)))))\n      `;
  };
  groups.left.forEach((p, i) => emit(p, -halfW - 3.81, halfH - PITCH - i * PITCH, 0));
  groups.right.forEach((p, i) => emit(p, halfW + 3.81, halfH - PITCH - i * PITCH, 180));
  groups.top.forEach((p, i) => emit(p, -halfW + PITCH + i * PITCH, halfH + 3.81, 270));
  groups.bottom.forEach((p, i) => emit(p, -halfW + PITCH + i * PITCH, -halfH - 3.81, 90));

  libSymbols.set(id, `(symbol "dc-modules:${key}"
    (pin_names (offset 0.508)) (exclude_from_sim no) (in_bom yes) (on_board yes)
    (property "Reference" "U" (at ${-halfW - 1.27} ${halfH + 2.54} 0) (effects (font (size 1.016 1.016)) (justify right)))
    (property "Value" "${esc(key)}" (at ${-halfW} ${-halfH - 2.54} 0) (effects (font (size 1.016 1.016)) (justify left)))
    (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "~" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (symbol "${key}_0_1" ${body})
    (symbol "${key}_1_1" ${pinS}))`);
  return id;
}

// geometry of a placed instance, so the packer knows the footprint it must reserve
function shapeOf(c) {
  const cat = CAT(c.value, c.mpn, c.pins);
  const allPins = cat === "IC" ? unionPins(c) : c.pins;
  if (cat === "TERM") {
    const lw = (c.pins[0]?.signal_name?.length ?? 0) * CHW;
    return { cat, w: 5.08 + STUB + lw, h: ROW, lw, rw: 0 };
  }
  if (cat !== "IC") {
    const l = c.pins.find((p) => String(p.pin_number) === "1") ?? c.pins[0];
    const r = c.pins.find((p) => String(p.pin_number) === "2") ?? c.pins[1];
    const lw = (l?.signal_name?.length ?? 0) * CHW, rw = (r?.signal_name?.length ?? 0) * CHW;
    return { cat, w: 12.7 + STUB * 2 + lw + rw, h: ROW, lw, rw };
  }
  const groups = groupPins(allPins);
  const rows = Math.max(groups.left.length, groups.right.length, 1);
  const nameW = Math.max(...allPins.map((p) => p.name.length), 4) * 0.75;
  const halfW = Math.max(snap(nameW + 3.81), 7.62);
  const lw = Math.max(0, ...groups.left.map((p) => (p.signal_name || "").length)) * CHW;
  const rw = Math.max(0, ...groups.right.map((p) => (p.signal_name || "").length)) * CHW;
  const halfH = Math.max(rows * PITCH / 2 + PITCH, PITCH * 2);
  // reserve the full drawn extent: body + pin stubs + their labels + ref/value text, or the
  // boxes overlap their neighbours (1-pin studs stacked on top of each other)
  const topExtra = groups.top.length ? 3.81 + STUB + 3.0 : 0;
  const bottomExtra = groups.bottom.length ? 3.81 + STUB + 3.0 : 0;
  const TEXT = 3.0;
  return { cat, w: halfW * 2 + (3.81 + STUB) * 2 + lw + rw,
    h: TEXT + topExtra + halfH * 2 + bottomExtra + TEXT + PITCH,
    halfW, halfH, topExtra, TEXT, lw, rw, groups };
}

// ---- symbol pin unions ------------------------------------------------------------------
// One part number = one symbol, carrying every pin any instance of it binds anywhere in the
// design. Building from a single instance loses pins for parts used with different subsets.
const PIN_UNION = new Map();
for (const f of readdirSync(SRC).filter((x) => x.endsWith(".json"))) {
  const pg = JSON.parse(readFileSync(join(SRC, f), "utf8"));
  for (const c of pg.chunks.flat()) {
    if (c.pins.length === 2) continue;                 // passives use the shared shape symbols
    const key = c.mpn || c.value;
    if (!PIN_UNION.has(key)) PIN_UNION.set(key, new Map());
    const u = PIN_UNION.get(key);
    for (const p of c.pins) if (!u.has(String(p.pin_number))) u.set(String(p.pin_number), { ...p });
  }
}
const unionPins = (c) => {
  const u = PIN_UNION.get(c.mpn || c.value);
  return u ? [...u.values()] : c.pins;
};

// ---- page emitter -----------------------------------------------------------------------
const PAGES = readdirSync(SRC).filter((f) => f.endsWith(".json")).sort();
const files = [];
let totalComps = 0, totalLabels = 0;

for (const file of PAGES) {
  const page = JSON.parse(readFileSync(join(SRC, file), "utf8"));
  const name = page.page;
  const blocks = page.block_order.map((b, i) => ({ title: b, comps: page.chunks[i] }));

  // --- lay out each block: components in columns, uniform pitch ---
  for (const b of blocks) {
    b.items = b.comps.map((c) => ({ c, s: shapeOf(c) }));
    // ICs first, then passives — big things anchor the block, small things fill
    b.items.sort((a, z) => (z.s.cat === "IC") - (a.s.cat === "IC") || a.c.designator.localeCompare(z.c.designator));
    const maxColH = Math.max(60, Math.ceil(Math.sqrt(b.items.reduce((a, i) => a + i.s.h, 0) * 14)));
    const cols = [];
    let col = [], h = 0;
    for (const it of b.items) {
      if (col.length && h + it.s.h > maxColH) { cols.push(col); col = []; h = 0; }
      col.push(it); h += it.s.h;
    }
    if (col.length) cols.push(col);
    let x = 0, maxH = 0;
    for (const c of cols) {
      const cw = Math.max(...c.map((i) => i.s.w));
      let y = 0;
      for (const it of c) { it.x = x; it.y = y; it.colw = cw; y += it.s.h; }
      maxH = Math.max(maxH, y);
      x += cw + COLGAP;
    }
    b.w = x - COLGAP + 2 * SECPAD;
    b.h = maxH + 2 * SECPAD + SECTITLE;
  }

  // --- tile the blocks: uniform gutters, rows, left-to-right ---
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
  const sheetH = snap(cy - SECGAP + MARGIN + 20);

  // --- emit symbols, stubs and labels ---
  let body = "", nLabels = 0;
  for (const b of blocks) {
    body += `\t(rectangle (start ${b.X} ${b.Y}) (end ${snap(b.X + b.w)} ${snap(b.Y + b.h)})
\t\t(stroke (width 0.254) (type dash)) (fill (type none)) (uuid "${uuid(name + b.title + "frame")}"))
\t(text "${esc(b.title)}" (at ${snap(b.X + 2.54)} ${snap(b.Y + 4.06)} 0)
\t\t(effects (font (size 2.032 2.032) (bold yes)) (justify left)) (uuid "${uuid(name + b.title + "t")}"))\n`;

    for (const it of b.items) {
      const { c, s } = it;
      const ox = snap(b.X + SECPAD + it.x + s.lw + STUB);
      const oy = snap(b.Y + SECTITLE + SECPAD + it.y);
      const lcsc = LCSC[c.mpn] ?? {};
      if (s.cat === "TERM") {
        const p0 = c.pins[0];
        const cx = snap(ox + 2.54), cy2 = snap(oy + ROW / 2);
        const lib = termSymbol(p0.pin_number, p0.name);
        body += `\t(symbol (lib_id "${lib}") (at ${cx} ${cy2} 0) (unit 1)
\t\t(exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no) (uuid "${uuid(name + c.designator)}")
\t\t(property "Reference" "${esc(c.designator)}" (at ${cx} ${snap(cy2 - 3.302)} 0) (effects (font (size 1.016 1.016))))
\t\t(property "Value" "${esc(c.value)}" (at ${cx} ${snap(cy2 + 3.556)} 0) (effects (font (size 1.016 1.016))))
\t\t(property "LCSC" "${esc(lcsc.lcsc ?? lcsc.status ?? "")}" (at ${cx} ${cy2} 0) (effects (font (size 1.016 1.016)) (hide yes)))
\t\t(instances (project "dc-modules-30kw" (path "/${uuid(name)}" (reference "${esc(c.designator)}") (unit 1)))))\n`;
        if (p0.signal_name) {
          const px2 = snap(cx - 2.54), ex = snap(px2 - STUB);
          body += `\t(wire (pts (xy ${px2} ${cy2}) (xy ${ex} ${cy2})) (stroke (width 0) (type default)) (uuid "${uuid(name + c.designator + "w")}"))\n`;
          body += `\t(global_label "${esc(p0.signal_name)}" (shape input) (at ${ex} ${cy2} 180)
\t\t(effects (font (size 1.016 1.016)) (justify right)) (uuid "${uuid(name + c.designator + "l")}"))\n`;
          nLabels++;
        }
      } else if (s.cat !== "IC") {
        const cx = snap(ox + 6.35), cy2 = snap(oy + ROW / 2);
        const pnums = c.pins.map((q) => String(q.pin_number)).sort((a, b) => Number(a) - Number(b));
        const lib = passiveSymbol(s.cat, pnums[0] ?? "1", pnums[1] ?? "2");
        body += `\t(symbol (lib_id "${lib}") (at ${cx} ${cy2} 0) (unit 1)
\t\t(exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no) (uuid "${uuid(name + c.designator)}")
\t\t(property "Reference" "${esc(c.designator)}" (at ${cx} ${snap(cy2 - 3.302)} 0) (effects (font (size 1.016 1.016))))
\t\t(property "Value" "${esc(c.value)}" (at ${cx} ${snap(cy2 + 3.556)} 0) (effects (font (size 1.016 1.016))))
\t\t(property "LCSC" "${esc(lcsc.lcsc ?? lcsc.status ?? "")}" (at ${cx} ${cy2} 0) (effects (font (size 1.016 1.016)) (hide yes)))
\t\t(instances (project "dc-modules-30kw" (path "/${uuid(name)}" (reference "${esc(c.designator)}") (unit 1)))))\n`;
        for (const [pn, px, dir] of [[pnums[0], snap(cx - 6.35), -1], [pnums[1], snap(cx + 6.35), 1]]) {
          const p = c.pins.find((q) => String(q.pin_number) === String(pn));
          if (!p || !p.signal_name) continue;
          const ex = snap(px + dir * STUB);
          body += `\t(wire (pts (xy ${px} ${cy2}) (xy ${ex} ${cy2})) (stroke (width 0) (type default)) (uuid "${uuid(name + c.designator + pn + "w")}"))\n`;
          body += `\t(global_label "${esc(p.signal_name)}" (shape ${dir < 0 ? "input" : "output"}) (at ${ex} ${cy2} ${dir < 0 ? 180 : 0})
\t\t(effects (font (size 1.016 1.016)) (justify ${dir < 0 ? "right" : "left"})) (uuid "${uuid(name + c.designator + pn + "l")}"))\n`;
          nLabels++;
        }
      } else {
        const cx = snap(ox + s.halfW + 3.81), cy2 = snap(oy + s.TEXT + s.topExtra + s.halfH);
        const lib = icSymbol(c.mpn || c.value, unionPins(c));
        body += `\t(symbol (lib_id "${lib}") (at ${cx} ${cy2} 0) (unit 1)
\t\t(exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no) (uuid "${uuid(name + c.designator)}")
\t\t(property "Reference" "${esc(c.designator)}" (at ${snap(cx - s.halfW - 2.54)} ${snap(cy2 - s.halfH - 2.54)} 0) (effects (font (size 1.016 1.016)) (justify right)))
\t\t(property "Value" "${esc(c.value)}" (at ${snap(cx - s.halfW - 2.54)} ${snap(cy2 + s.halfH + 2.54)} 0) (effects (font (size 1.016 1.016)) (justify right)))
\t\t(property "LCSC" "${esc(lcsc.lcsc ?? lcsc.status ?? "")}" (at ${cx} ${cy2} 0) (effects (font (size 1.016 1.016)) (hide yes)))
\t\t(instances (project "dc-modules-30kw" (path "/${uuid(name)}" (reference "${esc(c.designator)}") (unit 1)))))\n`;
        const bound = new Map(c.pins.map((p) => [String(p.pin_number), p.signal_name]));
        const put = (p0, px, py, dir, rot) => {
          const p = { ...p0, signal_name: bound.get(String(p0.pin_number)) || "" };
          if (!p.signal_name) return;
          const ex = snap(px + dir * STUB), ey = py;
          body += `\t(wire (pts (xy ${px} ${py}) (xy ${ex} ${ey})) (stroke (width 0) (type default)) (uuid "${uuid(name + c.designator + p.pin_number + "w")}"))\n`;
          body += `\t(global_label "${esc(p.signal_name)}" (shape ${dir < 0 ? "input" : "output"}) (at ${ex} ${ey} ${rot})
\t\t(effects (font (size 1.016 1.016)) (justify ${dir < 0 ? "right" : "left"})) (uuid "${uuid(name + c.designator + p.pin_number + "l")}"))\n`;
          nLabels++;
        };
        // an unbound pin gets an explicit no-connect marker rather than a bare stub
        const nc = (px2, py2) => { body += `\t(no_connect (at ${px2} ${py2}) (uuid "${uuid(name + c.designator + px2 + py2 + "nc")}"))\n`; };
        s.groups.left.forEach((p, i) => {
          const px2 = snap(cx - s.halfW - 3.81), py2 = snap(cy2 - s.halfH + PITCH + i * PITCH);
          if (!bound.get(String(p.pin_number))) return nc(px2, py2);
          put(p, px2, py2, -1, 180);
        });
        s.groups.right.forEach((p, i) => {
          const px2 = snap(cx + s.halfW + 3.81), py2 = snap(cy2 - s.halfH + PITCH + i * PITCH);
          if (!bound.get(String(p.pin_number))) return nc(px2, py2);
          put(p, px2, py2, 1, 0);
        });
        // power/ground leave vertically then turn into a horizontal label, so nothing collides
        s.groups.top.forEach((p, i) => {
          const px = snap(cx - s.halfW + PITCH + i * PITCH), py = snap(cy2 - s.halfH - 3.81);
          const sig = bound.get(String(p.pin_number)); if (!sig) return;
          const ey = snap(py - STUB);
          body += `\t(wire (pts (xy ${px} ${py}) (xy ${px} ${ey})) (stroke (width 0) (type default)) (uuid "${uuid(name + c.designator + p.pin_number + "w")}"))\n`;
          body += `\t(global_label "${esc(sig)}" (shape input) (at ${px} ${ey} 90)
\t\t(effects (font (size 1.016 1.016)) (justify left)) (uuid "${uuid(name + c.designator + p.pin_number + "l")}"))\n`;
          nLabels++;
        });
        s.groups.bottom.forEach((p, i) => {
          const px = snap(cx - s.halfW + PITCH + i * PITCH), py = snap(cy2 + s.halfH + 3.81);
          const sig = bound.get(String(p.pin_number)); if (!sig) return;
          const ey = snap(py + STUB);
          body += `\t(wire (pts (xy ${px} ${py}) (xy ${px} ${ey})) (stroke (width 0) (type default)) (uuid "${uuid(name + c.designator + p.pin_number + "w")}"))\n`;
          body += `\t(global_label "${esc(sig)}" (shape input) (at ${px} ${ey} 270)
\t\t(effects (font (size 1.016 1.016)) (justify left)) (uuid "${uuid(name + c.designator + p.pin_number + "l")}"))\n`;
          nLabels++;
        });
      }
      totalComps++;
    }
  }
  totalLabels += nLabels;

  const sch = `(kicad_sch
\t(version 20250114)
\t(generator "dc-modules kicad-gen")
\t(generator_version "10.0")
\t(uuid "${uuid(name)}")
\t(paper "User" ${sheetW} ${sheetH})
\t(title_block
\t\t(title "${esc(page.title ?? name)}")
\t\t(date "${new Date().toISOString().slice(0, 10)}")
\t\t(rev "D.1")
\t\t(company "DC-Modules — 30 kW module")
\t\t(comment 1 "${esc(name)} · ${blocks.length} sections · ${page.total} components")
\t\t(comment 2 "Cross-section links are global net labels; wires are pin stubs only")
\t)
\t(lib_symbols
${[...libSymbols.values()].map((s) => "\t\t" + s).join("\n")}
\t)
${body}\t(sheet_instances (path "/" (page "1")))
)
`;
  const fn = `${name}.kicad_sch`;
  writeFileSync(join(OUT, fn), sch);
  files.push({ fn, name, blocks: blocks.length, comps: page.total, labels: nLabels, w: sheetW, h: sheetH });
  console.log(`${name.padEnd(22)} ${String(page.total).padStart(3)} comps · ${blocks.length} sections · ${nLabels} labels · ${sheetW}×${sheetH} mm`);
}

writeFileSync(join(OUT, "dc-modules.kicad_sym"),
  `(kicad_symbol_lib (version 20241209) (generator "dc-modules kicad-gen") (generator_version "10.0")\n${[...libSymbols.values()].join("\n")}\n)\n`);
writeFileSync(join(OUT, "dc-modules-30kw.kicad_pro"), JSON.stringify({
  board: {}, boards: [], cvpcb: { equivalence_files: [] },
  libraries: { pinned_footprint_libs: [], pinned_symbol_libs: [] },
  meta: { filename: "dc-modules-30kw.kicad_pro", version: 1 },
  schematic: { legacy_lib_dir: "", legacy_lib_list: [] },
  sheets: files.map((f, i) => [uuid(f.name), f.name]),
  text_variables: {},
}, null, 2));
console.log(`\n${files.length} sheets · ${totalComps} components · ${totalLabels} net labels · ${libSymbols.size} symbols → kicad/dc-modules-30kw/`);
