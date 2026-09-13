#!/usr/bin/env node
// void-audit.mjs — rank sheets by their worst ENCLOSED hole.
//
// The layout gate already scores fill and largest-empty-rectangle. Neither matches what the eye
// objects to, and a visual pass over all six sheets proved it: on 60kw-acdc the largest empty
// rectangle sits at the sheet edge, where it reads as margin, while the hole that actually looks
// wrong is a narrower one with drawing on BOTH sides. Ranking by raw area put the wrong sheet
// first; ranking by enclosure agreed with the eye.
//
// So the measured property here is enclosure, not size: an empty rectangle counts only if some
// frame overlapping its y-band lies entirely to its left AND another entirely to its right.
// Whitespace against the paper edge is margin and is not counted.
//
// Informational by default — it exits non-zero only past FAIL, so it guards against a future
// packing change blowing a hole open without crying wolf about the ones that are already there
// and already judged acceptable (recorded at E56).
//
// Run: node calculations/void-audit.mjs [sku]

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKUS = process.argv[2] ? [process.argv[2]] : ["30kw", "40kw", "50kw", "50kwa"];
const FAIL = 12;              // % of sheet area; current worst is 8.2 on 60kw-acdc
const MINAREA = 1e6;          // ignore slivers

let worst = 0;
const rows = [];
for (const SKU of SKUS) for (const SIDE of ["acdc", "dcdc"]) {
  const f = join(ROOT, `kicad5/dc-modules-${SKU}/${SKU}-${SIDE}.sch`);
  if (!existsSync(f)) continue;
  const L = readFileSync(f, "utf8").split("\n");
  const notes = []; let W = 0, H = 0;
  for (let i = 0; i < L.length; i++) {
    if (L[i] === "Wire Notes Line") notes.push(L[++i].trim().split(/\s+/).map(Number));
    else if (L[i].startsWith("$Descr")) { const t = L[i].split(/\s+/); W = +t[2]; H = +t[3]; }
  }
  const R = [];
  for (let i = 0; i + 3 < notes.length; i += 4) {
    const s = notes.slice(i, i + 4);
    const xs = s.flatMap((a) => [a[0], a[2]]), ys = s.flatMap((a) => [a[1], a[3]]);
    R.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
  }
  // candidate edges are the frame edges themselves: a hole the eye sees is always bounded by them
  const XS = [...new Set(R.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
  const YS = [...new Set(R.flatMap((r) => [r.y0, r.y1]))].sort((a, b) => a - b);
  let best = null;
  for (let a = 0; a < XS.length; a++) for (let b = a + 1; b < XS.length; b++)
    for (let c = 0; c < YS.length; c++) for (let d = c + 1; d < YS.length; d++) {
      const q = { x0: XS[a], x1: XS[b], y0: YS[c], y1: YS[d] };
      const area = (q.x1 - q.x0) * (q.y1 - q.y0);
      if (area < MINAREA || (best && area <= best.area)) continue;
      if (R.some((r) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) continue;
      const band = (r) => r.y0 < q.y1 && r.y1 > q.y0;
      if (!R.some((r) => band(r) && r.x1 <= q.x0)) continue;
      if (!R.some((r) => band(r) && r.x0 >= q.x1)) continue;
      best = { ...q, area };
    }
  const pct = best ? 100 * best.area / (W * H) : 0;
  worst = Math.max(worst, pct);
  rows.push([`${SKU}-${SIDE}`, pct, best]);
}

rows.sort((a, b) => b[1] - a[1]);
for (const [name, pct, b] of rows)
  console.log(`  ${pct > FAIL ? "FLAG" : "ok  "} ${name.padEnd(12)} worst enclosed hole ${pct.toFixed(1)}%`
    + (b ? `  ${Math.round(b.x1 - b.x0)}x${Math.round(b.y1 - b.y0)} at (${b.x0},${b.y0})` : "  none"));
console.log(worst > FAIL
  ? `\nworst ${worst.toFixed(1)}% exceeds ${FAIL}% — a packing change opened a hole`
  : `\nworst enclosed hole ${worst.toFixed(1)}% (limit ${FAIL}%)`);
process.exit(worst > FAIL ? 1 : 0);
