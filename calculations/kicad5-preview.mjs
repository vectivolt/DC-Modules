#!/usr/bin/env node
// kicad5-preview.mjs — render an emitted KiCad 5.1 legacy sheet to SVG so the layout can be
// LOOKED AT without a full EasyEDA import (each import is ~20 GUI steps and a minute of waiting,
// which is far too slow for an inspect-fix-repeat loop).
//
// It draws what the eye judges: section frames and their titles, symbol bodies, pin stubs, net
// labels and the title block. It is a layout preview, not a schematic renderer — connectivity is
// the job of kicad5-verify.mjs.
//
// Run: node calculations/kicad5-preview.mjs [sku]   ->  calculations/out/preview/<sheet>.svg

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKU = process.argv[2] || "30kw";
const SCH = join(ROOT, `kicad5/dc-modules-${SKU}`);
const OUT = join(ROOT, "calculations/out/preview");
mkdirSync(OUT, { recursive: true });

const libFile = readdirSync(SCH).find((f) => f.endsWith(".lib"));
const LIB = new Map();
for (const blk of readFileSync(join(SCH, libFile), "utf8").split(/^DEF /m).slice(1)) {
  const name = blk.split(/\s+/)[0];
  const pins = [];
  let box = null;
  for (const l of blk.split("\n")) {
    if (l.startsWith("X ")) { const t = l.split(/\s+/); pins.push({ x: +t[3], y: +t[4] }); }
    else if (l.startsWith("S ") && !box) {
      const t = l.split(/\s+/).map(Number);
      box = { x0: Math.min(t[1], t[3]), y0: Math.min(t[2], t[4]), x1: Math.max(t[1], t[3]), y1: Math.max(t[2], t[4]) };
    } else if (l.startsWith("C ") && !box) {
      const t = l.split(/\s+/).map(Number);
      box = { x0: t[1] - t[3], y0: t[2] - t[3], x1: t[1] + t[3], y1: t[2] + t[3] };
    }
  }
  LIB.set(name, { pins, box: box ?? { x0: -60, y0: -100, x1: 60, y1: 100 } });
}

const stats = [];
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

for (const file of readdirSync(SCH).filter((f) => /^\d.*-(acdc|dcdc)\.sch$/.test(f)).sort()) {
  const lines = readFileSync(join(SCH, file), "utf8").split("\n");
  const [W, H] = lines.find((l) => l.startsWith("$Descr")).split(/\s+/).slice(2).map(Number);
  const title = (lines.find((l) => l.startsWith("Title ")) ?? "").slice(6).replace(/"/g, "");
  const comp = (lines.find((l) => l.startsWith("Comp ")) ?? "").slice(5).replace(/"/g, "");

  const notes = [], wires = [], labels = [], texts = [], syms = [];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (L === "Wire Notes Line") notes.push(lines[++i].trim().split(/\s+/).map(Number));
    else if (L === "Wire Wire Line") wires.push(lines[++i].trim().split(/\s+/).map(Number));
    else if (L.startsWith("Text Label ") || L.startsWith("Text GLabel ")) { const t = L.split(/\s+/); labels.push({ x: +t[2], y: +t[3], dir: +t[4], net: lines[++i] }); }
    else if (L.startsWith("Text Notes ")) { const t = L.split(/\s+/); texts.push({ x: +t[2], y: +t[3], s: lines[++i] }); }
    else if (L === "$Comp") {
      let lib = "", x = 0, y = 0;
      for (let k = i + 1; lines[k] !== "$EndComp"; k++) {
        if (lines[k].startsWith("L ")) lib = lines[k].split(/\s+/)[1].split(":").pop();
        else if (lines[k].startsWith("P ")) { const t = lines[k].split(/\s+/); x = +t[1]; y = +t[2]; }
      }
      syms.push({ lib, x, y });
    }
  }

  // frames come as 4 note segments each
  const frames = [];
  for (let i = 0; i + 3 < notes.length; i += 4) {
    const seg = notes.slice(i, i + 4);
    const xs = seg.flatMap((s) => [s[0], s[2]]), ys = seg.flatMap((s) => [s[1], s[3]]);
    frames.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
  }

  // Letterbox into a square viewBox: macOS qlmanage renders square thumbnails and would crop the
  // right third of a landscape sheet, which reads as frames running off the page when they do not.
  const S = Math.max(W, H), ox0 = (S - W) / 2, oy0 = (S - H) / 2;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-ox0} ${-oy0} ${S} ${S}" width="1800" height="1800">`
    + `<rect x="${-ox0}" y="${-oy0}" width="${S}" height="${S}" fill="#e8e4d9"/>`
    + `<rect width="${W}" height="${H}" fill="#fffdf7" stroke="#8d6e63" stroke-width="30"/>`;
  for (const f of frames)
    svg += `<rect x="${f.x0}" y="${f.y0}" width="${f.x1 - f.x0}" height="${f.y1 - f.y0}" fill="#f4efe2" fill-opacity=".55" stroke="#9c8f70" stroke-width="12" stroke-dasharray="90 60"/>`;
  svg += `<g stroke="#c0392b" stroke-width="7" opacity=".55">`;
  for (const [a, b, c, d] of wires) svg += `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}"/>`;
  svg += `</g><g fill="#7d3c98" opacity=".75">`;
  for (const l of labels) svg += `<circle cx="${l.x}" cy="${l.y}" r="26"/>`;
  svg += `</g>`;
  for (const s of syms) {
    const b = LIB.get(s.lib)?.box;
    if (!b) continue;
    svg += `<rect x="${s.x + b.x0}" y="${s.y + b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" fill="#ffffff" stroke="#1f4e79" stroke-width="12"/>`;
  }
  for (const t of texts)
    svg += `<text x="${t.x}" y="${t.y}" font-family="Helvetica,Arial" font-size="150" font-weight="700" fill="#5d4037">${esc(t.s)}</text>`;
  svg += `<text x="${W / 2}" y="${H - 120}" text-anchor="middle" font-family="Helvetica,Arial" font-size="230" fill="#33691e">${esc(title)}  |  ${esc(comp)}</text>`;
  svg += `</svg>`;

  const name = file.replace(".sch", ".svg");
  writeFileSync(join(OUT, name), svg);
  const frameArea = frames.reduce((a, f) => a + (f.x1 - f.x0) * (f.y1 - f.y0), 0);
  let overlaps = 0;
  for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) {
    const a = frames[i], b2 = frames[j];
    if (a.x0 < b2.x1 && b2.x0 < a.x1 && a.y0 < b2.y1 && b2.y0 < a.y1) overlaps++;
  }
  const fam = new Map();
  for (const t of texts) {
    const k = String(t.s).split(" / ")[0];
    if (!fam.has(k)) fam.set(k, []);
    fam.get(k).push(t.x);
  }
  const spans = [...fam.values()].filter((v) => v.length > 1).map((v) => Math.max(...v) - Math.min(...v));
  const spread = spans.length ? Math.round(spans.reduce((a, b2) => a + b2, 0) / spans.length) : 0;
  const fill = 100 * frameArea / (W * H);
  stats.push({ name, aspect: W / H, fill, overlaps, spread, spreadPct: 100 * spread / W });
  console.log(`${name.padEnd(18)} ${W}x${H} mil · aspect ${(W / H).toFixed(2)} · ${frames.length} frames · ${syms.length} symbols · fill ${fill.toFixed(0)}% · family spread ${spread} mil (${(100 * spread / W).toFixed(0)}% of width) · overlaps ${overlaps}`);
}
// Layout gate: the qualities the sheet is judged on, asserted rather than eyeballed.
let bad = 0;
for (const r of stats) {
  const fails = [];
  if (r.aspect < 1.1 || r.aspect > 2.2) fails.push(`aspect ${r.aspect.toFixed(2)} outside 1.10-2.20`);
  if (r.fill < 40) fails.push(`frame fill ${r.fill.toFixed(0)}% below 40%`);
  if (r.overlaps) fails.push(`${r.overlaps} frame overlaps`);
  // relative, not absolute: a 12-frame family legitimately spans more columns on a bigger sheet
  if (r.spreadPct > 45) fails.push(`family spread ${r.spread} mil = ${r.spreadPct.toFixed(0)}% of sheet width, above 45%`);
  if (fails.length) { bad++; console.log(`FAIL ${r.name}: ${fails.join("; ")}`); }
}
console.log(bad ? `\n${bad} sheet(s) fail the layout gate` : `\nlayout gate: all sheets pass (aspect, fill, no frame overlap, families grouped)`);
console.log(`→ ${OUT}`);
process.exit(bad ? 1 : 0);
