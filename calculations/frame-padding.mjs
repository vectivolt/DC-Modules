#!/usr/bin/env node
// frame-padding.mjs — measure the INNER PADDING of every section frame: the gap between the frame
// border and the nearest ink inside it, on each of the four sides.
//
// "Elegant boxes with consistent spacing, sizing and hierarchy" is a claim that can be measured.
// A frame whose content hugs the left border but floats 2000 mil off the right one reads as
// accidental even when nothing overlaps — and no collision check can see it, because a gap is not
// a collision. This finds the frames whose padding disagrees with the rest of the drawing.
//
// Ink counted: symbol pin endpoints and body rectangles, net-label text extents, and the
// designator/value field text. The section title is excluded — it lives in the title band by
// design, so it would swamp the top measurement.
//
// Run: node calculations/frame-padding.mjs [sku] [side]

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKU = process.argv[2] || "30kw";
const SIDES = process.argv[3] ? [process.argv[3]] : ["acdc", "dcdc"];
const CHW = 0.62;                                    // text width per point of size, measured
const SECTITLE = 400;                                // title band reserved at the top of a frame

const rows = [];
for (const SIDE of SIDES) {
  const dir = join(ROOT, `kicad5/dc-modules-${SKU}`);
  const libFile = readdirSync(dir).find((f) => f.endsWith(".lib"));
  const LIB = new Map();
  for (const blk of readFileSync(join(dir, libFile), "utf8").split(/^DEF /m).slice(1)) {
    const name = blk.split(/\s+/)[0];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const put = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
    for (const l of blk.split("\n")) {
      const t = l.split(/\s+/);
      if (l.startsWith("X ")) {
        const x = +t[3], y = +t[4], len = +t[5], o = t[6];
        put(x, y);
        put(x + (o === "R" ? len : o === "L" ? -len : 0), y + (o === "U" ? -len : o === "D" ? len : 0));
      } else if (l.startsWith("S ")) { put(+t[1], +t[2]); put(+t[3], +t[4]); }
      else if (l.startsWith("C ")) { put(+t[1] - +t[3], +t[2] - +t[3]); put(+t[1] + +t[3], +t[2] + +t[3]); }
    }
    if (x0 < Infinity) LIB.set(name, { x0, y0, x1, y1 });
  }

  const lines = readFileSync(join(dir, `${SKU}-${SIDE}.sch`), "utf8").split("\n");
  const notes = [], ink = [];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (L === "Wire Notes Line") notes.push(lines[++i].trim().split(/\s+/).map(Number));
    else if (L.startsWith("Text Label ") || L.startsWith("Text GLabel ")) {
      const t = L.split(/\s+/), x = +t[2], y = +t[3], d = +t[4], size = +t[5], s = lines[++i];
      const w = s.length * size * CHW;
      // dir 0/1 run right/up from the anchor, 2/3 run left/down (right-aligned)
      const [ax0, ax1] = (d === 2 || d === 3) ? [x - w, x] : [x, x + w];
      ink.push({ x0: ax0, y0: y - size / 2, x1: ax1, y1: y + size / 2 });
    } else if (L === "$Comp") {
      let lib = "", x = 0, y = 0;
      for (let k = i + 1; lines[k] !== "$EndComp"; k++) {
        const t = lines[k].split(/\s+/);
        if (lines[k].startsWith("L ")) lib = t[1].split(":").pop();
        else if (lines[k].startsWith("P ")) { x = +t[1]; y = +t[2]; }
        else if (/^F [01] /.test(lines[k])) {
          const fx = +t[4], fy = +t[5], sz = +t[6], txt = lines[k].split('"')[1] ?? "";
          const w = txt.length * sz * CHW;
          ink.push({ x0: fx - w / 2, y0: fy - sz / 2, x1: fx + w / 2, y1: fy + sz / 2 });
        }
      }
      const g = LIB.get(lib);
      if (g) ink.push({ x0: x + g.x0, y0: y + g.y0, x1: x + g.x1, y1: y + g.y1 });
    }
  }

  // frames are emitted as runs of four Wire Notes Line segments
  for (let i = 0; i + 3 < notes.length; i += 4) {
    const seg = notes.slice(i, i + 4);
    const xs = seg.flatMap((s) => [s[0], s[2]]), ys = seg.flatMap((s) => [s[1], s[3]]);
    const f = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    const inside = ink.filter((k) => k.x0 >= f.x0 - 30 && k.x1 <= f.x1 + 30
      && k.y0 >= f.y0 + SECTITLE - 30 && k.y1 <= f.y1 + 30);
    if (inside.length < 2) continue;                 // the index panel and any near-empty frame
    const c = {
      x0: Math.min(...inside.map((k) => k.x0)), x1: Math.max(...inside.map((k) => k.x1)),
      y0: Math.min(...inside.map((k) => k.y0)), y1: Math.max(...inside.map((k) => k.y1)),
    };
    rows.push({
      side: SIDE, n: inside.length,
      L: Math.round(c.x0 - f.x0), R: Math.round(f.x1 - c.x1),
      T: Math.round(c.y0 - (f.y0 + SECTITLE)), B: Math.round(f.y1 - c.y1),
    });
  }
}

const stat = (k) => {
  const v = rows.map((r) => r[k]).sort((a, b) => a - b);
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { min: v[0], p50: q(0.5), p90: q(0.9), max: v[v.length - 1] };
};
console.log(`${SKU}: ${rows.length} frames measured\n`);
console.log("side    min    p50    p90    max");
for (const k of ["L", "R", "T", "B"]) {
  const s = stat(k);
  console.log(`${k}    ${String(s.min).padStart(6)} ${String(s.p50).padStart(6)} ${String(s.p90).padStart(6)} ${String(s.max).padStart(6)}`);
}
const worst = rows.map((r) => ({ ...r, spread: Math.max(r.L, r.R, r.T, r.B) - Math.min(r.L, r.R, r.T, r.B) }))
  .sort((a, b) => b.spread - a.spread).slice(0, 8);
console.log(`\nframes whose four paddings disagree most:`);
for (const w of worst)
  console.log(`   ${w.side}  L=${String(w.L).padStart(5)} R=${String(w.R).padStart(5)} T=${String(w.T).padStart(5)} B=${String(w.B).padStart(5)}   spread ${w.spread}`);
