#!/usr/bin/env node
// emi-thermal-audit.mjs — the placement rules that are about PHYSICS rather than fit.
//
// placement-audit.mjs proves nothing collides. That is necessary and not sufficient: a board can be
// collision-free and still be an EMI disaster, cook its electrolytics, or couple a gapped core into
// a current-sense loop. These are the rules from docs/pcb-floorplan.md §3/§6/§7 that a collision
// check cannot see.
//
//   EMI-KEEPOUT  no switching-node part inside the input-filter zone, ON ANY LAYER  (§3)
//                "no switching copper behind, beside or beneath the filter" -- putting the noise
//                source under the filter shorts out the filter, and nothing else will find it.
//   SENSE-SEP    sense/control parts kept away from high-dv/dt nodes, unless the board is between
//                them -- opposite layers with a plane in between is a legitimate separation.
//   MAG-KEEPOUT  no small-signal part within one core-height of a magnetic (§6 fringing field)
//   THERMAL      heat sources need an airflow gap between courtyards; a bank of parts touching
//                each other has no air path (§6, thermal-report.md)
//   LOOP         each phase's commutation films close to its own switch pair (§7 hot loop)
//
// Run: node calculations/emi-thermal-audit.mjs [sku] [side]

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extents } from "./pcb-geom.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKU = process.argv[2] || "30kw", SIDE = process.argv[3] || "acdc";
const SENSE_SEP = 12;     // mm lateral, same layer
const MAG_KEEPOUT = 10;   // mm from a magnetic's courtyard to any small-signal part
const AIR_GAP = 2.5;      // mm between heat-source courtyards, for an airflow path
const LOOP_MAX = 25;      // mm from a switch pair to its commutation film

const f = join(ROOT, `dist/boards/${SKU}/${SIDE}/circuit.json`);
if (!existsSync(f)) { console.error(`no build at ${f}`); process.exit(2); }
const j = JSON.parse(readFileSync(f, "utf8"));
const { by, parts, board } = extents(j);
const byId = new Map(parts.map((p) => [p.id, p]));
const pcbByName = new Map(parts.map((p) => [p.name, p]));

// --- nets per component, via the connectivity map --------------------------------------------
const srcPort = new Map((by.source_port ?? []).map((p) => [p.source_port_id, p]));
const netName = new Map((by.source_net ?? []).map((n) => [n.source_net_id, n.name]));
const keyToNet = new Map();
for (const t of by.source_trace ?? [])
  for (const nid of t.connected_source_net_ids ?? [])
    if (netName.has(nid)) keyToNet.set(t.subcircuit_connectivity_map_key, netName.get(nid));
const compNets = new Map();                       // source_component_id -> Set(net names)
for (const p of by.source_port ?? []) {
  const n = keyToNet.get(p.subcircuit_connectivity_map_key);
  if (!n) continue;
  (compNets.get(p.source_component_id) ?? compNets.set(p.source_component_id, new Set()).get(p.source_component_id)).add(n);
}
const netsOf = (part) => compNets.get(part.sourceId) ?? new Set();

// --- classify ---------------------------------------------------------------------------------
const SWITCHING = /^(PH[ABC]\d|G_[ABC]\d|SW|LX)/;   // high dv/dt only; MID is the quiet DC-link midpoint
const SENSE = /^(SNS_|I_[ABC]|T_|PWM_|WDI|EN_|FLT_|LINK_|CAN|RELAY_FB)/;
const isSwitch = (p) => [...netsOf(p)].some((n) => SWITCHING.test(n));
const isSense  = (p) => [...netsOf(p)].some((n) => SENSE.test(n));
const MAGNETIC = /^(L[A-C]\d|LDM\d|CMC\d|TAUX|L\d)/;
const HEAT = /^(Q[A-C]\d|D[A-C]\d[TBC]|L[A-C]\d|CMC\d|LDM\d|CD[TB]\d|R[A-C]\dC|RDIS\d|QDIS)/;
const SMALL = (p) => p.area < 120;                              // 0402..2512 and small SOICs

let bad = 0;
const line = (tag, n, tot, note) => { if (n) bad++;
  console.log(`  ${n ? "FLAG" : "ok  "} ${tag.padEnd(12)} ${String(n).padStart(4)}${tot != null ? ` / ${String(tot).padStart(4)}` : "     "}  ${note}`); };
const gap = (a, b) => Math.hypot(Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)),
                                 Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1)));

console.log(`\n== ${SKU}-${SIDE}   EMI / thermal / coupling   (${parts.length} parts)\n`);

// --- EMI-KEEPOUT -------------------------------------------------------------------------------
const filterParts = parts.filter((p) => /^(CMC\d+|CX\d+|CY\d+|LDM\d+)$/.test(p.name));
let intruders = [];
if (filterParts.length) {
  const z = { x0: Math.min(...filterParts.map((p) => p.x0)), x1: Math.max(...filterParts.map((p) => p.x1)),
              y0: Math.min(...filterParts.map((p) => p.y0)), y1: Math.max(...filterParts.map((p) => p.y1)) };
  intruders = parts.filter((p) => isSwitch(p) && p.x1 > z.x0 && p.x0 < z.x1 && p.y1 > z.y0 && p.y0 < z.y1);
    const fw = z.x1 - z.x0, fh = z.y1 - z.y0;
  const filterArea = filterParts.reduce((a, p) => a + p.area, 0);
  const density = filterArea / (fw * fh);
  line("EMI-BLOCK", density < 0.25 ? 1 : 0, filterParts.length,
    `input filter occupies ${fw.toFixed(0)} x ${fh.toFixed(0)} mm at ${(density * 100).toFixed(0)} % density `
    + `(a filter spread thin is not a filter)`);
  line("EMI-KEEPOUT", intruders.length, filterParts.length,
    `switching-node parts inside the filter zone (${z.x0.toFixed(0)}..${z.x1.toFixed(0)}, ${z.y0.toFixed(0)}..${z.y1.toFixed(0)}), any layer`);
  for (const p of intruders.slice(0, 5)) console.log(`         ${p.name} at (${p.x.toFixed(0)}, ${p.y.toFixed(0)}) layer ${p.layer ?? "?"}`);
} else line("EMI-KEEPOUT", 0, 0, "no filter parts found");

// --- SENSE-SEP ---------------------------------------------------------------------------------
const sw = parts.filter((p) => isSwitch(p) && /^(Q|D|L)[A-C]?\d/.test(p.name));   // real dv/dt sources
const sn = parts.filter((p) => isSense(p) && SMALL(p));
const tooClose = [];
for (const a of sn) for (const b of sw) {
  if (a === b || /^U[A-C]\dG$/.test(a.name)) continue;   // the driver IS the interface
  if (a.layer !== b.layer) continue;              // board + plane in between is real separation
  const d = gap(a, b);
  if (d < SENSE_SEP) tooClose.push([a.name, b.name, d]);
}
line("SENSE-SEP", tooClose.length, sn.length, `sense parts within ${SENSE_SEP} mm of a switching node on the SAME layer`);
for (const [a, b, d] of tooClose.sort((x, y) => x[2] - y[2]).slice(0, 5)) console.log(`         ${a} -> ${b}  ${d.toFixed(1)} mm`);

// --- MAG-KEEPOUT -------------------------------------------------------------------------------
const mags = parts.filter((p) => MAGNETIC.test(p.name));
const near = [];
for (const m of mags) for (const p of parts) {
  if (p === m || !SMALL(p) || !isSense(p)) continue;
  const d = gap(m, p);
  if (d < MAG_KEEPOUT) near.push([p.name, m.name, d]);
}
line("MAG-KEEPOUT", near.length, mags.length, `small-signal sense parts within ${MAG_KEEPOUT} mm of a magnetic`);
for (const [a, b, d] of near.sort((x, y) => x[2] - y[2]).slice(0, 5)) console.log(`         ${a} -> ${b}  ${d.toFixed(1)} mm`);

// --- THERMAL -----------------------------------------------------------------------------------
const heat = parts.filter((p) => HEAT.test(p.name));
const touching = [];
for (let i = 0; i < heat.length; i++) for (let k = i + 1; k < heat.length; k++) {
  if (heat[i].layer !== heat[k].layer) continue;
  const onOneRail = Math.abs(heat[i].y - heat[k].y) < 1 &&
    /^(Q|D)[A-C]\d/.test(heat[i].name) && /^(Q|D)[A-C]\d/.test(heat[k].name);
  if (onOneRail) continue;
  const d = gap(heat[i], heat[k]);
  if (d < AIR_GAP) touching.push([heat[i].name, heat[k].name, d]);
}
line("THERMAL", touching.length, heat.length, `heat-source pairs closer than ${AIR_GAP} mm (no airflow path)`);
for (const [a, b, d] of touching.sort((x, y) => x[2] - y[2]).slice(0, 5)) console.log(`         ${a} -> ${b}  ${d.toFixed(1)} mm`);

// --- LOOP --------------------------------------------------------------------------------------
const loops = [];
for (const q of parts.filter((p) => /^Q[ABC]\dA$/.test(p.name))) {
  const id = q.name.slice(1, 3);
  for (const c of [`C${id}FP`, `C${id}FN`]) {
    const f2 = pcbByName.get(c);
    if (!f2) continue;
    const d = gap(q, f2);
    if (d > LOOP_MAX) loops.push([q.name, c, d]);
  }
}
line("LOOP", loops.length, null, `commutation film further than ${LOOP_MAX} mm from its switch pair`);
for (const [a, b, d] of loops.sort((x, y) => y[2] - x[2]).slice(0, 4)) console.log(`         ${a} -> ${b}  ${d.toFixed(0)} mm`);

console.log(bad ? `\n${bad} physics check(s) flagged` : "\nEMI, thermal, coupling and loop rules all pass");
process.exit(bad ? 1 : 0);
