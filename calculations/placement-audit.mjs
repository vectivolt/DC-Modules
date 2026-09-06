#!/usr/bin/env node
// placement-audit.mjs — PCB PLACEMENT gate. boards.tsx says "PCB layout deliberately untuned" and
// README says "placement DRC intentionally unfitted"; this is the gate for the layout phase.
//
// It does NOT re-implement collision checking. tscircuit already emits pcb_courtyard_overlap_error,
// pcb_footprint_overlap_error and pcb_pad_pad_clearance_error, and its numbers are authoritative.
// This reports those, then adds the rules only the floorplan knows:
//
//   OFFBOARD  every cell inside the outline            — a cell hanging off the board is unbuildable
//   CELLOVL   cells do not overlap each other          — parent/child pairs excluded (a child is
//                                                        INSIDE its parent by construction; counting
//                                                        those flags correct work)
//   SPREAD    a cell stays compact                     — §3 "one phase = one contiguous cell"
//   DRIVER    gate driver within 10 mm of its switch   — §7 switching cells
//
// Run: node calculations/placement-audit.mjs [sku] [side]

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKU = process.argv[2] || "30kw";
const SIDE = process.argv[3] || "acdc";
const EDGE = 2.0, DRIVER_MAX = 10.0, SPREAD_MAX = 140;

const f = join(ROOT, `dist/boards/${SKU}/${SIDE}/circuit.json`);
if (!existsSync(f)) { console.error(`no build at ${f} — run: npx tsci build boards/${SKU}/${SIDE}.tsx`); process.exit(2); }
const j = JSON.parse(readFileSync(f, "utf8"));
const by = {};
for (const e of j) (by[e.type] ??= []).push(e);

const board = by.pcb_board?.[0];
const W = board?.width ?? 0, H = board?.height ?? 0;
const src = new Map(by.source_component.map((s) => [s.source_component_id, s]));
const parts = by.pcb_component.map((p) => ({
  name: src.get(p.source_component_id)?.name ?? "?",
  x: p.center.x, y: p.center.y, w: p.width, h: p.height,
}));
const srcGrp = new Map((by.source_group ?? []).map((g) => [g.source_group_id, g]));
const groups = (by.pcb_group ?? []).map((g) => ({
  name: g.name, x: g.center.x, y: g.center.y, w: g.width ?? 0, h: g.height ?? 0,
  id: g.source_group_id, parent: srcGrp.get(g.source_group_id)?.parent_source_group_id,
}));
// a group's full ancestry, so nested cells are never counted as overlapping their own parent
const ancestors = (g) => { const out = new Set(); let p = g.parent;
  while (p) { out.add(p); p = srcGrp.get(p)?.parent_source_group_id; } return out; };

let bad = 0;
const line = (tag, n, total, detail) => {
  if (n) bad++;
  console.log(`  ${n ? "FLAG" : "ok  "} ${tag.padEnd(9)} ${String(n).padStart(4)}${total != null ? ` / ${String(total).padStart(4)}` : "     "}  ${detail}`);
};

console.log(`\n== ${SKU}-${SIDE}   ${parts.length} parts, ${groups.length} cells, board ${W}x${H} mm`);
console.log(`\n  tscircuit DRC (authoritative):`);
for (const k of ["pcb_courtyard_overlap_error", "pcb_footprint_overlap_error",
                 "pcb_pad_pad_clearance_error", "pcb_component_missing_courtyard_warning"])
  line(k.replace(/^pcb_|_error$|_warning$/g, "").slice(0, 9), (by[k] ?? []).length, null, k);

console.log(`\n  floorplan rules:`);
const off = groups.filter((g) => g.w > 0 &&
  (g.x - g.w / 2 < -W / 2 + EDGE || g.x + g.w / 2 > W / 2 - EDGE ||
   g.y - g.h / 2 < -H / 2 + EDGE || g.y + g.h / 2 > H / 2 - EDGE));
line("OFFBOARD", off.length, groups.length, `cells crossing the outline (${EDGE} mm clearance)`);
for (const g of off.slice(0, 6))
  console.log(`         ${g.name.padEnd(12)} x ${(g.x - g.w / 2).toFixed(0)}..${(g.x + g.w / 2).toFixed(0)}  y ${(g.y - g.h / 2).toFixed(0)}..${(g.y + g.h / 2).toFixed(0)}`);

const ov = [];
for (let i = 0; i < groups.length; i++)
  for (let k = i + 1; k < groups.length; k++) {
    const a = groups[i], b = groups[k];
    if (!a.w || !b.w) continue;
    if (ancestors(a).has(b.id) || ancestors(b).has(a.id)) continue;   // nested: not an overlap
    const ox = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
    const oy = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
    if (ox > 0.01 && oy > 0.01) ov.push([a.name, b.name, Math.min(ox, oy)]);
  }
line("CELLOVL", ov.length, (groups.length * (groups.length - 1)) / 2, "cell-to-cell overlaps (nested pairs excluded)");
for (const [a, b, d] of ov.sort((x, y) => y[2] - x[2]).slice(0, 6))
  console.log(`         ${a.padEnd(12)} x ${b.padEnd(12)} ${d.toFixed(1)} mm`);

const wide = groups.filter((g) => Math.max(g.w, g.h) > SPREAD_MAX);
line("SPREAD", wide.length, groups.length, `cells wider than ${SPREAD_MAX} mm`);
for (const g of wide.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h)).slice(0, 5))
  console.log(`         ${g.name.padEnd(12)} ${g.w.toFixed(0)} x ${g.h.toFixed(0)} mm`);

const far = [];
for (const d of parts.filter((p) => /^U[A-C]\dG$/.test(p.name))) {
  const id = d.name.slice(1, 3);
  for (const q of parts.filter((p) => new RegExp(`^Q${id}[AB]$`).test(p.name))) {
    const gap = Math.hypot(d.x - q.x, d.y - q.y);
    if (gap > DRIVER_MAX) far.push([d.name, q.name, gap]);
  }
}
line("DRIVER", far.length, null, `driver-to-switch over ${DRIVER_MAX} mm`);
for (const [a, b, g] of far.sort((x, y) => y[2] - x[2]).slice(0, 4))
  console.log(`         ${a} -> ${b}  ${g.toFixed(0)} mm`);

console.log(bad ? `\n${bad} check(s) flagged — placement is not releasable` : "\nplacement clean");
process.exit(bad ? 1 : 0);
