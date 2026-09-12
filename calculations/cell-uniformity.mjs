#!/usr/bin/env node
// cell-uniformity.mjs — prove the REPLICATED cells are byte-for-byte the same circuit.
//
// The platform is one ~10 kW cell pair repeated 3x / 6x / 12x. That makes a strong claim testable:
// every LLC leg must be identical to every other LLC leg, every resonant tank to every other tank,
// every Vienna phase to every other phase of its letter. If one differs, something reached it that
// did not reach its twins.
//
// This is also what makes visual inspection tractable. There are 54 working-zoom tiles across the
// six sheets; proving 21 LLC legs identical means looking at one of them covers all 21. Sampling
// tiles and hoping is not the same claim.
//
// It earned its place immediately: LEG-5 differed from the other 20 on both 60 kW and 120 kW. The
// /^PS5\w+$/ part rule (iso-sense 5 VOLT module) was swallowing PS5H/PS5L, leg FIVE's gate-bias
// modules -- a different part, a different symbol, and two connections short. Legs 1-4 and 6-12
// were fine, so it only existed on sheets big enough to have a leg 5.
//
// Signature = multiset of (symbol|value) + net-label names, with every instance index digit-stripped,
// so LEG-1 and LEG-7 collapse to one string exactly when they are really the same circuit.
//
// Run: node calculations/cell-uniformity.mjs

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const canon = (s) => s.replace(/\d+/g, "#");
// families that are pure replication and MUST be uniform; everything else may legitimately differ
// per SKU (bank cap count, fan count, MCU pin usage, per-board control nets)
const MUST = [/ LLC-LEGS \/ LEG-#$/, / LLC-TANKS \/ TANK-#$/, / VIENNA-PFC \/ PHASE-[ABC]#$/];   // E50: keys are "<sku> <family>"

const families = new Map();
for (const SKU of ["30kw", "40kw", "50kw", "50kwa"]) for (const SIDE of ["acdc", "dcdc"]) {
  const f = join(ROOT, `kicad5/dc-modules-${SKU}/${SKU}-${SIDE}.sch`);
  if (!existsSync(f)) continue;
  const L = readFileSync(f, "utf8").split("\n");
  const notes = [], comps = [], labels = [], titles = [];
  for (let i = 0; i < L.length; i++) {
    if (L[i] === "Wire Notes Line") notes.push(L[++i].trim().split(/\s+/).map(Number));
    else if (L[i].startsWith("Text Notes ")) {
      const t = L[i].split(/\s+/), txt = L[i + 1];
      if (txt && txt.includes(" / ")) titles.push({ x: +t[2], y: +t[3], txt });
    } else if (L[i].startsWith("Text Label ")) {
      const t = L[i].split(/\s+/); labels.push({ x: +t[2], y: +t[3], n: L[++i] });
    } else if (L[i] === "$Comp") {
      let lib = "", val = "", x = 0, y = 0;
      for (let k = i + 1; L[k] !== "$EndComp"; k++) {
        if (L[k].startsWith("L ")) lib = L[k].split(/\s+/)[1].split(":").pop();
        else if (L[k].startsWith("P ")) { const t = L[k].split(/\s+/); x = +t[1]; y = +t[2]; }
        else if (L[k].startsWith('F 1 "')) val = L[k].split('"')[1];
      }
      comps.push({ lib, val, x, y });
    }
  }
  const frames = [];
  for (let i = 0; i + 3 < notes.length; i += 4) {
    const s = notes.slice(i, i + 4);
    const xs = s.flatMap((a) => [a[0], a[2]]), ys = s.flatMap((a) => [a[1], a[3]]);
    frames.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
  }
  const inside = (o, fr) => o.x >= fr.x0 && o.x <= fr.x1 && o.y >= fr.y0 && o.y <= fr.y1;
  for (const fr of frames) {
    const t = titles.find((t) => inside(t, fr));
    if (!t) continue;
    const sig = [
      ...comps.filter((c) => inside(c, fr)).map((c) => `C:${c.lib}|${c.val}`),
      ...labels.filter((l) => inside(l, fr)).map((l) => `N:${canon(l.n)}`),
    ].sort().join(";");
    // E50: family key includes the SKU — replication is a WITHIN-sheet claim. Pooling across
    // SKUs false-fails on legitimate per-variant differences (paralleled gate branches, tank
    // cap counts, trim bins) — the measure-like-with-like rule.
    const fam = `${SKU} ${canon(t.txt)}`;
    if (!families.has(fam)) families.set(fam, new Map());
    const m = families.get(fam);
    if (!m.has(sig)) m.set(sig, []);
    m.get(sig).push(`${SKU}-${SIDE}:${t.txt}`);
  }
}

let fail = 0;
for (const [fam, sigs] of [...families].sort()) {
  const total = [...sigs.values()].reduce((a, b) => a + b.length, 0);
  const must = MUST.some((r) => r.test(fam));
  const ok = sigs.size === 1;
  if (!must) { if (!ok) console.log(`  --   ${fam.padEnd(32)} ${String(total).padStart(3)}x in ${sigs.size} variants (per-SKU, not required uniform)`); continue; }
  if (!ok) fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${fam.padEnd(32)} ${String(total).padStart(3)} instances, ${ok ? "all identical" : `${sigs.size} VARIANTS`}`);
  if (!ok) for (const [, who] of [...sigs].sort((a, b) => b[1].length - a[1].length))
    console.log(`         ${String(who.length).padStart(3)}x  ${who.slice(0, 5).join(", ")}${who.length > 5 ? " ..." : ""}`);
}
console.log(fail ? `\n${fail} replicated famil(ies) not uniform` : "\nevery replicated cell is identical to its twins");
process.exit(fail ? 1 : 0);
