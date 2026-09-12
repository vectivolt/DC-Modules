#!/usr/bin/env node
// wiring-audit.mjs — check the WIRING rules, which no other tool here measures.
//
// The alignment audit checks where things sit. This checks how they are joined, against the four
// explicit drawing rules:
//
//   LONG      "avoid long wires wherever possible"        — every wire should be a short stub
//   ESCAPE    "do not connect distant blocks with wires"  — no wire may leave its section frame
//   CROSS     "no unnecessary crossings"                  — wires that intersect without a junction
//   FLOW      "signal flow left-to-right"                 — inputs enter left, outputs leave right
//
// ESCAPE is the one that matters most: inter-section communication is supposed to be by net label,
// so a wire crossing a frame border means two distant blocks got joined by a line. CROSS is
// counted geometrically (an H wire and a V wire whose spans overlap at a point that is not a
// declared junction), which is the same thing the eye catches as a mess.
//
// Run: node calculations/wiring-audit.mjs [sku]

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKUS = process.argv[2] ? [process.argv[2]] : ["30kw", "40kw", "50kw", "50kwa"];
const LONG = 1000;           // mil: a wire longer than this is not a stub any more

let bad = 0;
for (const SKU of SKUS) {
  for (const SIDE of ["acdc", "dcdc"]) {
    const f = join(ROOT, `kicad5/dc-modules-${SKU}/${SKU}-${SIDE}.sch`);
    if (!existsSync(f)) continue;
    const lines = readFileSync(f, "utf8").split("\n");
    const wires = [], notes = [], junc = new Set(), labels = [], comps = [];
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (L === "Wire Wire Line") wires.push(lines[++i].trim().split(/\s+/).map(Number));
      else if (L === "Wire Notes Line") notes.push(lines[++i].trim().split(/\s+/).map(Number));
      else if (L.startsWith("Connection ~")) {
        const t = L.split(/\s+/); junc.add(`${t[2]},${t[3]}`);
      } else if (L === "$Comp") {
        let x = 0, y = 0;
        for (let k = i + 1; lines[k] !== "$EndComp"; k++) {
          const t = lines[k].split(/\s+/);
          if (lines[k].startsWith("P ")) { x = +t[1]; y = +t[2]; }
        }
        comps.push({ x, y });
      } else if (L.startsWith("Text Label ") || L.startsWith("Text GLabel ")) {
        const t = L.split(/\s+/);
        labels.push({ x: +t[2], y: +t[3], dir: +t[4], net: lines[++i] });
      }
    }
    const frames = [];
    for (let i = 0; i + 3 < notes.length; i += 4) {
      const seg = notes.slice(i, i + 4);
      const xs = seg.flatMap((s) => [s[0], s[2]]), ys = seg.flatMap((s) => [s[1], s[3]]);
      frames.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
    }
    const inFrame = (x, y) => frames.find((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);

    const long = wires.filter((w) => Math.hypot(w[2] - w[0], w[3] - w[1]) > LONG);
    // a wire escapes if its two ends sit in different frames (or one end sits outside every frame)
    const escaped = wires.filter((w) => {
      const a = inFrame(w[0], w[1]), b = inFrame(w[2], w[3]);
      return a !== b;
    });

    const H = wires.filter((w) => w[1] === w[3]), V = wires.filter((w) => w[0] === w[2]);
    let crossings = 0;
    for (const h of H) {
      const [hx0, hx1] = [Math.min(h[0], h[2]), Math.max(h[0], h[2])], hy = h[1];
      for (const v of V) {
        const [vy0, vy1] = [Math.min(v[1], v[3]), Math.max(v[1], v[3])], vx = v[0];
        if (vx <= hx0 || vx >= hx1 || hy <= vy0 || hy >= vy1) continue;   // strict interior only
        if (!junc.has(`${vx},${hy}`)) crossings++;
      }
    }

    // FLOW: a label's dir says which way its text runs -- dir 2 (left) is an incoming name drawn to
    // the left of its pin, dir 0 (right) an outgoing one. Measure each label against ITS OWN
    // COLUMN, not against the frame midpoint. A section may hold several columns, so a left-hand
    // label belonging to column 2 legitimately sits right of the frame's centre; scoring it
    // against the midpoint reported 62-71% on multi-column frames while single-column frames were
    // 100/100 -- the check was wrong, not the drawing.
    let flowOk = 0, flowTot = 0;
    const colsOf = new Map();
    for (const c of comps) {
      const fr = inFrame(c.x, c.y);
      if (!fr) continue;
      if (!colsOf.has(fr)) colsOf.set(fr, new Set());
      colsOf.get(fr).add(c.x);
    }
    for (const l of labels) {
      const fr = inFrame(l.x, l.y);
      if (!fr || (l.dir !== 0 && l.dir !== 2) || !colsOf.has(fr)) continue;
      const cols = [...colsOf.get(fr)];
      const col = cols.reduce((a, b) => Math.abs(b - l.x) < Math.abs(a - l.x) ? b : a);
      flowTot++;
      if ((l.dir === 2 && l.x < col) || (l.dir === 0 && l.x > col)) flowOk++;
    }

    const maxLen = Math.max(...wires.map((w) => Math.hypot(w[2] - w[0], w[3] - w[1])));
    const flag = (c) => { if (c) bad++; return c ? "FLAG" : "ok  "; };
    console.log(`\n== ${SKU}-${SIDE}   ${wires.length} wires, ${frames.length} frames`);
    console.log(`  ${flag(long.length)} LONG    ${long.length} wire(s) over ${LONG} mil (longest ${Math.round(maxLen)})`);
    console.log(`  ${flag(escaped.length)} ESCAPE  ${escaped.length} wire(s) crossing a frame border`);
    console.log(`  ${flag(crossings)} CROSS   ${crossings} un-junctioned crossing(s)`);
    console.log(`  ${flag(flowOk !== flowTot)} FLOW    ${flowOk}/${flowTot} directional labels on the expected side`);
  }
}
console.log(bad ? `\n${bad} check(s) flagged` : "\nwiring is clean on every sheet");
process.exit(bad ? 1 : 0);
