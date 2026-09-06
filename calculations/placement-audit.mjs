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
import { extents } from "./pcb-geom.mjs";
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
// TRUE extents from courtyards -- pcb_component.width/height is the pad box (a 89 mm choke reports
// 64 x 4), so every distance below would be measured against the wrong geometry.
const parts = extents(j).parts;
const srcGrp = new Map((by.source_group ?? []).map((g) => [g.source_group_id, g]));
// Cell boxes from MEMBER COURTYARDS, not pcb_group.width/height -- that is a pad-extent box too,
// so a cell holding an 89 mm choke reports 64 mm wide and every cell-to-cell test is measured
// against geometry that does not exist.
const memberOf = new Map();                       // source_group_id -> member parts
for (const p of parts) {
  let g = srcGrp.get(p.groupId);
  while (g) { (memberOf.get(g.source_group_id) ?? memberOf.set(g.source_group_id, []).get(g.source_group_id)).push(p);
              g = g.parent_source_group_id ? srcGrp.get(g.parent_source_group_id) : null; }
}
const groups = (by.pcb_group ?? []).map((g) => {
  const mem = memberOf.get(g.source_group_id) ?? [];
  const bb = mem.length
    ? { x0: Math.min(...mem.map((m) => m.x0)), x1: Math.max(...mem.map((m) => m.x1)),
        y0: Math.min(...mem.map((m) => m.y0)), y1: Math.max(...mem.map((m) => m.y1)) }
    : { x0: g.center.x, x1: g.center.x, y0: g.center.y, y1: g.center.y };
  const lay = mem.length && mem.every((m) => m.layer === mem[0].layer) ? mem[0].layer : null;
  return { name: g.name, layer: lay, x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2,
           w: bb.x1 - bb.x0, h: bb.y1 - bb.y0, n: mem.length,
           id: g.source_group_id, parent: srcGrp.get(g.source_group_id)?.parent_source_group_id };
});
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
// Check every PART, not just cells: loose components placed directly on the board belong to no
// cell, so a cells-only test walked straight past five of them sitting 4 mm off the bottom edge.
const off = parts.filter((p) =>
  p.x0 < -W / 2 + EDGE || p.x1 > W / 2 - EDGE || p.y0 < -H / 2 + EDGE || p.y1 > H / 2 - EDGE);
line("OFFBOARD", off.length, parts.length, `parts crossing the outline (${EDGE} mm clearance)`);
for (const p of off.slice(0, 6))
  console.log(`         ${p.name.padEnd(12)} x ${p.x0.toFixed(0)}..${p.x1.toFixed(0)}  y ${p.y0.toFixed(0)}..${p.y1.toFixed(0)}`);

const ov = [];
for (let i = 0; i < groups.length; i++)
  for (let k = i + 1; k < groups.length; k++) {
    const a = groups[i], b = groups[k];
    if (!a.w || !b.w) continue;
    if (ancestors(a).has(b.id) || ancestors(b).has(a.id)) continue;   // nested: not an overlap
    if (a.layer && b.layer && a.layer !== b.layer) continue;         // opposite sides of the board
    const ox = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
    const oy = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
    if (ox > 0.01 && oy > 0.01) ov.push([a.name, b.name, Math.min(ox, oy)]);
  }
line("CELLOVL", ov.length, (groups.length * (groups.length - 1)) / 2, "cell-to-cell overlaps (nested pairs excluded)");
for (const [a, b, d] of ov.sort((x, y) => y[2] - x[2]).slice(0, 6))
  console.log(`         ${a.padEnd(12)} x ${b.padEnd(12)} ${d.toFixed(1)} mm`);

// DENSITY, not width. "One contiguous cell" means the parts fill their own box -- a 10-capacitor
// DC-link bank is legitimately 230 mm wide and perfectly contiguous, so flagging width flags
// correct work. A cell whose members occupy under 12 % of their bounding box is scattered.
const dens = [];
for (const g of groups) {
  const mem = parts.filter((p) => p.x0 >= g.x - g.w / 2 - 1 && p.x1 <= g.x + g.w / 2 + 1 &&
                                  p.y0 >= g.y - g.h / 2 - 1 && p.y1 <= g.y + g.h / 2 + 1);
  if (mem.length < 3) continue;
  const bb = { x0: Math.min(...mem.map((m) => m.x0)), x1: Math.max(...mem.map((m) => m.x1)),
               y0: Math.min(...mem.map((m) => m.y0)), y1: Math.max(...mem.map((m) => m.y1)) };
  const boxA = (bb.x1 - bb.x0) * (bb.y1 - bb.y0);
  const fill = boxA > 0 ? mem.reduce((a, m) => a + m.area, 0) / boxA : 1;
  if (fill < 0.12) dens.push([g.name, mem.length, fill, bb.x1 - bb.x0, bb.y1 - bb.y0]);
}
line("SPREAD", dens.length, groups.length, "cells whose parts fill under 12 % of their own box");
for (const [n, m, f, bw, bh] of dens.sort((a, b) => a[2] - b[2]).slice(0, 5))
  console.log(`         ${n.padEnd(12)} ${String(m).padStart(3)} parts fill ${(f * 100).toFixed(0)}% of ${bw.toFixed(0)}x${bh.toFixed(0)} mm`);

const far = [];
for (const d of parts.filter((p) => /^U[A-C]\dG$/.test(p.name))) {
  const id = d.name.slice(1, 3);
  for (const q of parts.filter((p) => new RegExp(`^Q${id}[AB]$`).test(p.name))) {
    const gx = Math.max(0, Math.max(d.x0, q.x0) - Math.min(d.x1, q.x1));
    const gy = Math.max(0, Math.max(d.y0, q.y0) - Math.min(d.y1, q.y1));
    const gap = Math.hypot(gx, gy);                       // edge-to-edge, 0 if they touch
    if (gap > DRIVER_MAX) far.push([d.name, q.name, gap]);
  }
}
line("DRIVER", far.length, null, `driver-to-switch EDGE gap over ${DRIVER_MAX} mm`);
for (const [a, b, g] of far.sort((x, y) => y[2] - x[2]).slice(0, 4))
  console.log(`         ${a} -> ${b}  ${g.toFixed(0)} mm`);

console.log(bad ? `\n${bad} check(s) flagged — placement is not releasable` : "\nplacement clean");
process.exit(bad ? 1 : 0);
