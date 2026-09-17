#!/usr/bin/env node
// kicad5-detail.mjs — render a REGION of an emitted sheet at working zoom, faithfully: symbol
// bodies and their pins, wire stubs, net-label text at its real size and justification, and
// designator/value text at their real positions.
//
// This exists so the detail inspection the drawing is judged on can be done against the actual
// deliverable geometry itself. The .sch + .lib pair IS the record (the KiCad terminal face),
// so anything wrong here is wrong in the deliverable; and unlike a screenshot this can be
// zoomed anywhere, on any sheet, without the app being reachable.
//
// Run: node calculations/kicad5-detail.mjs <sku> <sheet> [cols] [rows]
//   e.g. node calculations/kicad5-detail.mjs 30kw acdc 3 3   -> 9 tiles covering the sheet

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKU = process.argv[2] || "30kw";
const SIDE = process.argv[3] || "acdc";
const COLS = +(process.argv[4] || 3), ROWS = +(process.argv[5] || 3);
const SCH = join(ROOT, `kicad5/dc-modules-${SKU}`);
const OUT = join(ROOT, "calculations/out/detail");
mkdirSync(OUT, { recursive: true });

const libFile = readdirSync(SCH).find((f) => f.endsWith(".lib"));
const LIB = new Map();
for (const blk of readFileSync(join(SCH, libFile), "utf8").split(/^DEF /m).slice(1)) {
  const name = blk.split(/\s+/)[0];
  const pins = [], shapes = [];
  for (const l of blk.split("\n")) {
    const t = l.split(/\s+/);
    if (l.startsWith("X ")) pins.push({ name: t[1], num: t[2], x: +t[3], y: +t[4], len: +t[5], o: t[6] });
    else if (l.startsWith("S ")) shapes.push({ k: "S", x0: +t[1], y0: +t[2], x1: +t[3], y1: +t[4] });
    else if (l.startsWith("C ")) shapes.push({ k: "C", x: +t[1], y: +t[2], r: +t[3] });
    else if (l.startsWith("P ")) {
      const n = +t[1], pts = [];
      for (let i = 0; i < n; i++) pts.push([+t[5 + 2 * i], +t[6 + 2 * i]]);
      shapes.push({ k: "P", pts });
    }
    // A posx posy radius startAngle endAngle unit convert thickness fill sx sy ex ey
    // Inductors are drawn purely from arcs, so without this they rendered as bare pin numbers.
    else if (l.startsWith("A ")) shapes.push({ k: "A", r: +t[3], sx: +t[10], sy: +t[11], ex: +t[12], ey: +t[13] });
  }
  LIB.set(name, { pins, shapes });
}

const file = join(SCH, `${SKU}-${SIDE}.sch`);
const lines = readFileSync(file, "utf8").split("\n");
const [W, H] = lines.find((l) => l.startsWith("$Descr")).split(/\s+/).slice(2).map(Number);

const wires = [], labels = [], notes = [], texts = [], syms = [], ncs = [];
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  if (L === "Wire Wire Line") wires.push(lines[++i].trim().split(/\s+/).map(Number));
  else if (L === "Wire Notes Line") notes.push(lines[++i].trim().split(/\s+/).map(Number));
  else if (L.startsWith("NoConn ~")) { const t = L.split(/\s+/); ncs.push([+t[2], +t[3]]); }
  else if (L.startsWith("Text Label ") || L.startsWith("Text GLabel ")) {
    const t = L.split(/\s+/);
    labels.push({ x: +t[2], y: +t[3], dir: +t[4], size: +t[5], net: lines[++i] });
  } else if (L.startsWith("Text Notes ")) {
    const t = L.split(/\s+/); texts.push({ x: +t[2], y: +t[3], size: +t[5], s: lines[++i] });
  } else if (L === "$Comp") {
    let lib = "", ref = "", val = "", x = 0, y = 0, rp = null, vp = null;
    for (let k = i + 1; lines[k] !== "$EndComp"; k++) {
      const t = lines[k].split(/\s+/);
      if (lines[k].startsWith("L ")) { lib = t[1].split(":").pop(); ref = t[2]; }
      else if (lines[k].startsWith("P ")) { x = +t[1]; y = +t[2]; }
      // F n "text" ORIENT posx posy size ...  -> t[3] is the H/V orientation char, not x
      else if (lines[k].startsWith("F 0 ")) { rp = [+t[4], +t[5], +t[6]]; }
      else if (lines[k].startsWith("F 1 ")) { val = lines[k].split('"')[1]; vp = [+t[4], +t[5], +t[6]]; }
    }
    syms.push({ lib, ref, val, x, y, rp, vp });
  }
}

const frames = [];
for (let i = 0; i + 3 < notes.length; i += 4) {
  const seg = notes.slice(i, i + 4);
  const xs = seg.flatMap((s) => [s[0], s[2]]), ys = seg.flatMap((s) => [s[1], s[3]]);
  frames.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// native lib — sheet pin position is (cx + px, cy − py) under the standard matrix
const P = (c, p) => [c.x + p.x, c.y - p.y];

for (let r = 0; r < ROWS; r++) for (let cIdx = 0; cIdx < COLS; cIdx++) {
  const tw = W / COLS, th = H / ROWS;
  const vx = cIdx * tw, vy = r * th;
  const inTile = (x, y) => x >= vx - 500 && x <= vx + tw + 500 && y >= vy - 500 && y <= vy + th + 500;

  let g = "";
  for (const f of frames)
    if (f.x1 > vx && f.x0 < vx + tw && f.y1 > vy && f.y0 < vy + th)
      g += `<rect x="${f.x0}" y="${f.y0}" width="${f.x1 - f.x0}" height="${f.y1 - f.y0}" fill="#f6f1e3" fill-opacity=".5" stroke="#a08b62" stroke-width="10" stroke-dasharray="80 55"/>`;
  for (const t of texts)
    if (inTile(t.x, t.y))
      g += `<text x="${t.x}" y="${t.y}" font-family="Helvetica,Arial" font-size="${t.size}" font-weight="700" fill="#5d4037">${esc(t.s)}</text>`;
  for (const [a, b, c, d] of wires)
    if (inTile(a, b) || inTile(c, d))
      g += `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="#00695c" stroke-width="6"/>`;
  for (const [x, y] of ncs)
    if (inTile(x, y))
      g += `<g stroke="#2e7d32" stroke-width="7"><line x1="${x - 30}" y1="${y - 30}" x2="${x + 30}" y2="${y + 30}"/><line x1="${x - 30}" y1="${y + 30}" x2="${x + 30}" y2="${y - 30}"/></g>`;

  for (const c of syms) {
    const s = LIB.get(c.lib);
    if (!s || !inTile(c.x, c.y)) continue;
    for (const sh of s.shapes) {
      if (sh.k === "S") g += `<rect x="${c.x + Math.min(sh.x0, sh.x1)}" y="${c.y + Math.min(sh.y0, sh.y1)}" width="${Math.abs(sh.x1 - sh.x0)}" height="${Math.abs(sh.y1 - sh.y0)}" fill="#fff" stroke="#1a237e" stroke-width="8"/>`;
      else if (sh.k === "C") g += `<circle cx="${c.x + sh.x}" cy="${c.y + sh.y}" r="${sh.r}" fill="#fff" stroke="#1a237e" stroke-width="8"/>`;
      else if (sh.k === "P") g += `<polyline points="${sh.pts.map(([a, b]) => `${c.x + a},${c.y + b}`).join(" ")}" fill="none" stroke="#1a237e" stroke-width="8"/>`;
      else if (sh.k === "A") g += `<path d="M ${c.x + sh.sx} ${c.y + sh.sy} A ${sh.r} ${sh.r} 0 0 1 ${c.x + sh.ex} ${c.y + sh.ey}" fill="none" stroke="#1a237e" stroke-width="8"/>`;
    }
    for (const p of s.pins) {
      const [px, py] = P(c, p);
      const dx = p.o === "R" ? p.len : p.o === "L" ? -p.len : 0;
      const dy = p.o === "U" ? -p.len : p.o === "D" ? p.len : 0;   // lib pre-mirrored
      g += `<line x1="${px}" y1="${py}" x2="${px + dx}" y2="${py + dy}" stroke="#1a237e" stroke-width="6"/>`;
      g += `<circle cx="${px}" cy="${py}" r="9" fill="#c62828"/>`;
      // pin NAME inside the body and pin NUMBER just outside — the two things that decide whether
      // a multi-pin IC is actually readable, and the thing an empty box hides.
      if (p.name && p.name !== "~") {
        const ix = px + (p.o === "R" ? p.len + 40 : p.o === "L" ? -p.len - 40 : 0);
        const iy = py + (p.o === "U" ? -p.len - 40 : p.o === "D" ? p.len + 40 : 18);
        const a = p.o === "R" ? "start" : p.o === "L" ? "end" : "middle";
        g += `<text x="${ix}" y="${iy}" font-family="Helvetica,Arial" font-size="50" fill="#455a64" text-anchor="${a}">${esc(p.name)}</text>`;
      }
      const nx = px + (p.o === "R" ? p.len / 2 : p.o === "L" ? -p.len / 2 : 0);
      const ny = py + (p.o === "U" ? -p.len / 2 : p.o === "D" ? p.len / 2 : -25);
      g += `<text x="${nx}" y="${ny}" font-family="Helvetica,Arial" font-size="40" fill="#9e9e9e" text-anchor="middle">${esc(p.num)}</text>`;
    }
    if (c.rp) g += `<text x="${c.rp[0]}" y="${c.rp[1]}" font-family="Helvetica,Arial" font-size="${c.rp[2]}" fill="#6a1b9a" text-anchor="middle">${esc(c.ref)}</text>`;
    if (c.vp) g += `<text x="${c.vp[0]}" y="${c.vp[1]}" font-family="Helvetica,Arial" font-size="${c.vp[2]}" fill="#00838f" text-anchor="middle">${esc(c.val)}</text>`;
  }

  for (const l of labels) {
    if (!inTile(l.x, l.y)) continue;
    // dir: 0 right, 1 UP, 2 left, 3 DOWN. 1 and 3 are ROTATED 90 degrees — drawing them
    // horizontally made adjacent top/bottom pin labels look like they collide when they do not.
    const vert = l.dir === 1 || l.dir === 3;
    const anchor = (l.dir === 2 || l.dir === 3) ? "end" : "start";
    const off = (l.dir === 2 || l.dir === 3) ? -20 : 20;
    const attrs = `font-family="Helvetica,Arial" font-size="${l.size}" fill="#ad1457" text-anchor="${anchor}"`;
    g += vert
      ? `<text ${attrs} transform="translate(${l.x + l.size * 0.36} ${l.y + off}) rotate(-90)">${esc(l.net)}</text>`
      : `<text x="${l.x + off}" y="${l.y + l.size * 0.36}" ${attrs}>${esc(l.net)}</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${tw} ${th}" width="1700" height="${Math.round(1700 * th / tw)}">`
    + `<rect x="${vx}" y="${vy}" width="${tw}" height="${th}" fill="#fffdf7"/>${g}</svg>`;
  writeFileSync(join(OUT, `${SKU}-${SIDE}-r${r}c${cIdx}.svg`), svg);
}
console.log(`${COLS * ROWS} tiles of ${SKU}-${SIDE} (${W}x${H} mil) -> calculations/out/detail/`);
