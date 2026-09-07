#!/usr/bin/env node
// free-space.mjs — largest empty rectangles on a placed board.
//
// Written after placing several cells by eye on a board that was only a third full and colliding
// anyway. Guessing at "the empty bit" costs a build cycle each time; this answers it once.
// Run: node calculations/free-space.mjs [sku] [side] [minW] [minH]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extents } from "./pcb-geom.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [sku = "30kw", side = "acdc", mw = "25", mh = "15"] = process.argv.slice(2);
const f = sku === "control-card" ? join(ROOT, "dist/boards/control-card/circuit.json")
                                 : join(ROOT, `dist/boards/${sku}/${side}/circuit.json`);
const { parts, board } = extents(JSON.parse(readFileSync(f, "utf8")));
const W = board.width, H = board.height, G = 4;
const nx = Math.floor(W / G), ny = Math.floor(H / G);
const occ = Array.from({ length: ny }, () => new Uint8Array(nx));
for (const p of parts) {
  const i0 = Math.max(0, Math.floor((p.x0 + W / 2) / G)), i1 = Math.min(nx - 1, Math.ceil((p.x1 + W / 2) / G));
  const j0 = Math.max(0, Math.floor((H / 2 - p.y1) / G)), j1 = Math.min(ny - 1, Math.ceil((H / 2 - p.y0) / G));
  for (let r = j0; r <= j1; r++) for (let c = i0; c <= i1; c++) occ[r][c] = 1;
}
const best = [], h = new Int32Array(nx);
for (let r = 0; r < ny; r++) {
  for (let c = 0; c < nx; c++) h[c] = occ[r][c] ? 0 : h[c] + 1;
  const st = [];
  for (let c = 0; c <= nx; c++) {
    const cur = c < nx ? h[c] : 0; let start = c;
    while (st.length && st[st.length - 1][1] >= cur) {
      const [sx, ht] = st.pop(); start = sx;
      best.push([(c - sx) * G, ht * G, sx * G - W / 2, H / 2 - (r + 1) * G + ht * G]);
    }
    st.push([start, cur]);
  }
}
best.sort((a, b) => b[0] * b[1] - a[0] * a[1]);
const fill = parts.reduce((s, p) => s + p.area, 0) / (W * H) * 100;
console.log(`${sku}-${side}: ${W}x${H}, ${parts.length} parts, ${fill.toFixed(1)} % fill`);
const seen = [];
for (const [w, ht, x, y] of best) {
  if (w < +mw || ht < +mh) continue;
  if (seen.some((s) => Math.abs(s[2] - x) < 25 && Math.abs(s[3] - y) < 25)) continue;
  seen.push([w, ht, x, y]);
  console.log(`  ${w.toFixed(0).padStart(4)} x ${ht.toFixed(0).padStart(3)} mm   x ${x.toFixed(0).padStart(5)}..${(x + w).toFixed(0).padEnd(5)} y ${(y - ht).toFixed(0).padStart(5)}..${y.toFixed(0)}`);
  if (seen.length >= 6) break;
}
