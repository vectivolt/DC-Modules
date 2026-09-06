#!/usr/bin/env node
// alignment-audit.mjs — scan EVERY coordinate on every sheet for near-miss alignment.
//
// "Almost aligned reads as careless, clearly aligned reads as deliberate." A 50-200 mil offset
// between two things that should share an edge is invisible at sheet zoom, obvious at working
// zoom, and impossible to find by sampling tiles — there are 58 frames and 615-1347 symbols per
// SKU. So measure all of them instead of looking at nine tiles and hoping.
//
// A near-miss is two coordinates close enough that the eye expects them equal, but not equal.
// Exact equality is fine (deliberate). A large gap is fine (clearly separate). The defect lives
// in between, so each check reports the count of DISTINCT values and how many pairs sit in the
// suspicious band.
//
// Checks, all derived from the emitted .sch so they measure the deliverable, not the intent:
//   FRAME-X   section frame left edges        — should come from a small set (the column grid)
//   FRAME-Y   section frame top edges
//   SYM-X     symbol x per TYPE within a frame — identical parts must share one x exactly
//   PITCH     row spacing per type per column  — every gap a whole multiple of the column's base
//   STUB      wire stub length                — every stub the same length
//
// Run: node calculations/alignment-audit.mjs [sku]

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKUS = process.argv[2] ? [process.argv[2]] : ["30kw", "60kw", "120kw"];
const NEAR = 249;            // mil: SUB-GRID only. Frames snap to a 250 mil Y grid, so a 250 mil
                             // gap is an adjacent grid slot (deliberate); anything less is a miss.

let findings = 0;
const near = (vals) => {      // distinct sorted values -> pairs closer than NEAR but not equal
  const v = [...new Set(vals)].sort((a, b) => a - b);
  const bad = [];
  for (let i = 1; i < v.length; i++) if (v[i] - v[i - 1] <= NEAR) bad.push([v[i - 1], v[i]]);
  return { distinct: v.length, bad };
};

for (const SKU of SKUS) {
  const dir = join(ROOT, `kicad5/dc-modules-${SKU}`);
  if (!existsSync(dir)) continue;
  for (const SIDE of ["acdc", "dcdc"]) {
    const f = join(dir, `${SKU}-${SIDE}.sch`);
    if (!existsSync(f)) continue;
    const lines = readFileSync(f, "utf8").split("\n");
    const notes = [], comps = [], wires = [];
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (L === "Wire Notes Line") notes.push(lines[++i].trim().split(/\s+/).map(Number));
      else if (L === "Wire Wire Line") wires.push(lines[++i].trim().split(/\s+/).map(Number));
      else if (L === "$Comp") {
        let x = 0, y = 0, ref = "", lib = "";
        for (let k = i + 1; lines[k] !== "$EndComp"; k++) {
          const t = lines[k].split(/\s+/);
          if (lines[k].startsWith("L ")) { ref = t[2]; lib = t[1].split(":").pop(); }
          else if (lines[k].startsWith("P ")) { x = +t[1]; y = +t[2]; }
        }
        comps.push({ x, y, ref, lib });
      }
    }
    const panels = [];
    for (let i = 0; i < lines.length; i++)
      // both filler panels use the frame border style but are NOT section frames: they sit at
      // void coordinates, so comparing their edges to the frame grid flags correct work
      if (lines[i] === "SHEET INDEX" || lines[i] === "NET NAMING") panels.push(lines[i - 1].split(/\s+/).slice(2, 4).map(Number));
    const frames = [], frameAll = [];
    for (let i = 0; i + 3 < notes.length; i += 4) {
      const seg = notes.slice(i, i + 4);
      const xs = seg.flatMap((s) => [s[0], s[2]]), ys = seg.flatMap((s) => [s[1], s[3]]);
      const fr = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
      frameAll.push(fr);
      // skip the sheet-index panel: same border style, but it is not a section
      if (panels.some((p) => p[0] >= fr.x0 - 400 && p[0] <= fr.x1 && p[1] >= fr.y0 - 400 && p[1] <= fr.y1)) continue;
      frames.push(fr);
    }

    const out = [];
    const fx = near(frames.map((k) => k.x0));
    const fy = near(frames.map((k) => k.y0));
    out.push(["FRAME-X", frames.length, fx]);
    out.push(["FRAME-Y", frames.length, fy]);

    // Compare LIKE WITH LIKE. The emitted P coordinate is each symbol's own centre -- ox+250 for a
    // passive, ox+100 for a terminal, half-width for an IC -- so two perfectly left-aligned parts
    // of different types have different P.x by design. Comparing across types flags correct work.
    // Grouping by symbol type inside a frame is exactly the zig-zag defect: identical resistors
    // that should share one x and did not.
    let symBad = 0, symCols = 0, pitchBad = 0, pitchCols = 0;
    for (const fr of frames) {
      const inside = comps.filter((c) => c.x >= fr.x0 && c.x <= fr.x1 && c.y >= fr.y0 && c.y <= fr.y1);
      if (inside.length < 2) continue;
      const byLib = new Map();
      for (const c of inside) { if (!byLib.has(c.lib)) byLib.set(c.lib, []); byLib.get(c.lib).push(c); }
      for (const g of byLib.values()) {
        if (g.length < 2) continue;
        const r = near(g.map((c) => c.x));
        symCols += r.distinct; symBad += r.bad.length;
        const byX = new Map();
        for (const c of g) { if (!byX.has(c.x)) byX.set(c.x, []); byX.get(c.x).push(c.y); }
        for (const ys of byX.values()) {
          if (ys.length < 3) continue;
          ys.sort((a, b) => a - b);
          // Not "all gaps equal" -- a larger gap is where another part type sits between them,
          // which is legitimate interleaving, and flagging it condemns correct work. The real
          // rhythm invariant is that every gap is a WHOLE number of row pitches.
          const gaps = ys.slice(1).map((v, i) => v - ys[i]);
          pitchCols++;
          // Multiples of the column's OWN smallest gap, not of the 2-pin ROW. A relay bank paces
          // itself at 1150 and a fan header at 1350 -- their own uniform rhythm -- while a column
          // of passives with something interleaved reads 400, 800, 400. Both are correct; a gap
          // that is not a whole multiple of the base is the drift worth catching.
          const base = Math.min(...gaps);
          if (gaps.some((g) => g % base !== 0)) pitchBad++;
        }
      }
    }
    out.push(["SYM-X", symCols, { distinct: symCols, bad: new Array(symBad).fill(0) }]);
    out.push(["PITCH", pitchCols, { distinct: pitchCols, bad: new Array(pitchBad).fill(0) }]);

    // PANEL: the notes panels are skipped by every check above (they are not sections), which is
    // exactly why a 200 mil misalignment between the stacked index and legend survived on all six
    // sheets while the code that draws them claimed a "shared left edge". Whatever is excluded
    // from the audit is where the defect hides, so audit it here on its own terms.
    if (panels.length === 2) {
      const box = (p) => frameAll.find((r) => Math.abs(r.x0 - (p[0] - 60)) < 2 && Math.abs(r.y0 - (p[1] - 160)) < 2);
      const a2 = box(panels[0]), b2 = box(panels[1]);
      // The pair may be STACKED (shares left+right edges) or ABREAST (shares top+bottom). Both are
      // a deliberate notes block; only accepting the stacked form flagged a correct side-by-side
      // pair on 30kw-dcdc. Either way an edge that is NEARLY but not exactly shared still fails,
      // which is the defect this exists to catch.
      const ok = a2 && b2 && ((a2.x0 === b2.x0 && a2.x1 === b2.x1) || (a2.y0 === b2.y0 && a2.y1 === b2.y1));
      out.push(["PANEL", 2, { distinct: ok ? 1 : 2, bad: ok ? [] : [[a2 ? a2.x0 : 0, b2 ? b2.x0 : 0]] }]);
    }

    const stubs = wires.filter((w) => w[1] === w[3]).map((w) => Math.abs(w[2] - w[0]))
      .filter((n) => n > 0 && n < 1200);
    const su = [...new Set(stubs)].sort((a, b) => a - b);
    out.push(["STUB", stubs.length, { distinct: su.length, bad: su.length > 1 ? [su] : [] }]);

    console.log(`\n== ${SKU}-${SIDE}`);
    for (const [name, n, r] of out) {
      const ok = r.bad.length === 0;
      if (!ok) findings++;
      console.log(`  ${ok ? "ok  " : "FLAG"} ${name.padEnd(8)} ${String(n).padStart(4)} items, ${String(r.distinct).padStart(3)} distinct`
        + (ok ? "" : `  -> ${r.bad.length} near-miss${name === "STUB" ? " lengths " + JSON.stringify(r.bad[0]) : ""}`
          + (r.bad[0] && name.startsWith("FRAME") ? "  e.g. " + r.bad.slice(0, 3).map((p) => p.join(" vs ")).join(", ") : "")));
    }
  }
}
console.log(findings ? `\n${findings} check(s) flagged` : "\nno near-miss alignment anywhere");
process.exit(findings ? 1 : 0);
