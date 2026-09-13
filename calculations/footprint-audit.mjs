#!/usr/bin/env node
// footprint-audit.mjs — E61: what package each component on the release sheets names, and whether a land
// exists for it. Layout is parked (E36), so this does not fail on the open queue; it fails only if the queue
// GROWS — a part added without a package name, or a value-row MPN whose package disagrees with its land.
// Numbers feed docs/footprints-to-draw.md. Run: node calculations/footprint-audit.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BLANK_MAX = 0, MISMATCH_MAX = 0;   // E64: queue CLOSED — every part names its package, every named part matches its land

const LIB = join(ROOT, "kicad5/footprints");
const lands = new Map(readdirSync(LIB).filter((f) => f.endsWith(".kicad_mod"))
  .map((f) => [f.slice(0, -10), /APPROXIMATE/.test(readFileSync(join(LIB, f), "utf8")) ? "approximate" : "generated"]));
const CL = { "05": "0402", 10: "0603", 21: "0805", 31: "1206", 32: "1210", 43: "1812" };
const mpnPkg = (m) => m.match(/^(?:RC|CC|PT|CRM)(\d{4})/)?.[1] ?? CL[m.match(/^CL(\d\d)[A-Z]/)?.[1]];
const STANDARD = /^([RCL]\d{4}|TO-247|SOIC|SOP|SOT|SOD|SMA|SMB|SMC|LQFP|VSON)/;

const fp = new Map(), blank = new Map(), mismatch = new Map();
const bump = (map, k) => map.set(k, (map.get(k) ?? 0) + 1);
for (const dir of readdirSync(join(ROOT, "kicad5")).filter((d) => d.startsWith("dc-modules-"))) {
  for (const f of readdirSync(join(ROOT, "kicad5", dir)).filter((x) => /-\w+\.sch$/.test(x) && x !== `${dir}.sch`)) {
    for (const [, blk] of readFileSync(join(ROOT, "kicad5", dir, f), "utf8").matchAll(/\$Comp\n([\s\S]*?)\$EndComp/g)) {
      if (/F 0 "#/.test(blk)) continue;
      const name = blk.match(/F 2 "([^"]*)"/)[1], mpn = blk.match(/F \d+ "([^"]*)"[^\n]*"MPN"/)?.[1] ?? "?";
      if (!name) { bump(blank, mpn); continue; }
      if (!fp.has(name)) fp.set(name, { n: 0, mpns: new Set() });
      fp.get(name).n++; fp.get(name).mpns.add(mpn);
      const land = name.match(/^[RCL](\d{4})$/)?.[1], pkg = mpnPkg(mpn);
      if (land && pkg && pkg !== land) bump(mismatch, `${mpn} on ${name}`);
    }
  }
}
const kind = (name) => lands.get(name) ?? (STANDARD.test(name) ? "standard" : /^(ASSY_|DIN_)/.test(name) ? "assembly (no PCB land)" : "to draw");
const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
const byKind = {};
for (const [name, { n }] of fp) byKind[kind(name)] = (byKind[kind(name)] ?? 0) + n;

console.log("=== FOOTPRINT AUDIT (E61 gate · E64 queue closed) ===");
console.log(`  ${fp.size} package names · ${sum(new Map([...fp].map(([k, v]) => [k, v.n])))} instances named · ` +
  Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(" · "));
console.log("  TO DRAW:");
for (const [name, { n, mpns }] of [...fp].filter(([k]) => kind(k) === "to draw").sort((a, b) => b[1].n - a[1].n))
  console.log(`    ${String(n).padStart(4)}  ${name.padEnd(30)} ${[...mpns].join(", ")}`);
console.log(`  NO PACKAGE NAMED: ${sum(blank)} instances · ${blank.size} MPNs`);
for (const [m, n] of [...blank].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}  ${m}`);
console.log(`  MPN PACKAGE ≠ LAND: ${sum(mismatch)} instances · ${mismatch.size} pairs`);
for (const [m, n] of [...mismatch].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}  ${m}`);
const grew = sum(blank) > BLANK_MAX || sum(mismatch) > MISMATCH_MAX;
console.log(grew ? `\nFOOTPRINT QUEUE REOPENED (E64 closed it at ${BLANK_MAX} unnamed · ${MISMATCH_MAX} mismatched — a new part shipped without a package, or a value row lost its land)` : "\nFOOTPRINT AUDIT CLEAN — every component names its package and every named part matches its drawn land (E64)");
process.exit(grew ? 1 : 0);
