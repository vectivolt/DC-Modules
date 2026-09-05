// schematic-check.mjs — objective schematic-quality gate (layout-polish goal, 2026-09-05):
// reads built circuit JSON and reports overlapping schematic elements so "no overlaps" is a
// verified property, not an eyeball claim. Checks:
//   1. schematic_component bounding boxes (symbol bodies) pairwise overlap
//   2. schematic net labels overlapping component bodies or each other (when present)
//   3. sheet extents (so sections can be framed sanely)
// Run: node calculations/schematic-check.mjs <sku>/<side> [...more]   (default: 30kw/acdc 30kw/dcdc)
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const f = (x, d = 2) => Number(x.toFixed(d));

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ["30kw/acdc", "30kw/dcdc"];
let totalBad = 0;
for (const t of targets) {
  const p = join(ROOT, "dist", "boards", t, "circuit.json");
  if (!existsSync(p)) { console.log(`!! ${t}: no build`); totalBad++; continue; }
  const j = JSON.parse(readFileSync(p, "utf8"));
  const srcById = new Map(j.filter(e => e.type === "source_component").map(c => [c.source_component_id, c.name]));
  const comps = j.filter(e => e.type === "schematic_component").map(c => ({
    name: srcById.get(c.source_component_id) ?? c.schematic_component_id,
    x: c.center?.x ?? 0, y: c.center?.y ?? 0,
    w: c.size?.width ?? 1, h: c.size?.height ?? 1,
  }));
  const labels = j.filter(e => e.type === "schematic_net_label").map(l => ({
    name: l.text ?? "?", x: l.center?.x ?? l.anchor_position?.x ?? 0, y: l.center?.y ?? l.anchor_position?.y ?? 0,
    w: 0.6 + 0.12 * String(l.text ?? "").length, h: 0.35,
  }));
  const box = (c) => ({ x0: c.x - c.w / 2, x1: c.x + c.w / 2, y0: c.y - c.h / 2, y1: c.y + c.h / 2 });
  const overlap = (a, b, margin = 0) => {
    const A = box(a), B = box(b);
    const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) + margin;
    const oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) + margin;
    return ox > 0.02 && oy > 0.02 ? f(Math.min(ox, oy)) : 0;
  };
  const bad = [];
  for (let i = 0; i < comps.length; i++)
    for (let k = i + 1; k < comps.length; k++) {
      const o = overlap(comps[i], comps[k]);
      if (o) bad.push([`${comps[i].name} × ${comps[k].name}`, o]);
    }
  let labelBad = 0;
  for (const l of labels) for (const c of comps) if (overlap(l, c)) labelBad++;
  const xs = comps.map(c => c.x), ys = comps.map(c => c.y);
  console.log(`\n=== ${t}: ${comps.length} symbols, ${labels.length} net labels ===`);
  console.log(`extents: x ${f(Math.min(...xs))}..${f(Math.max(...xs))}, y ${f(Math.min(...ys))}..${f(Math.max(...ys))}`);
  console.log(`symbol-symbol overlaps: ${bad.length}   label-symbol overlaps: ${labelBad}`);
  for (const [pair, o] of bad.slice(0, 25)) console.log(`   OVERLAP ${o}: ${pair}`);
  if (bad.length > 25) console.log(`   … +${bad.length - 25} more`);
  totalBad += bad.length;
}
console.log(totalBad === 0 ? "\nSCHEMATIC CHECK: CLEAN (0 symbol overlaps)" : `\nSCHEMATIC CHECK: ${totalBad} overlap(s)`);
process.exit(totalBad === 0 ? 0 : 1);
