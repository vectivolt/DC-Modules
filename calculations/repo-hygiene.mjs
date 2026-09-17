#!/usr/bin/env node
// repo-hygiene.mjs — main carries the CURRENT design only. This gate fails when something that is no longer produced,
// referenced or buildable is still tracked. Every rule here caught a real leftover when it was introduced.
// Run: node calculations/repo-hygiene.mjs   (inside run-all)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DB, skuOverrides, BUILDABLE_SKUS } from "./cost/parts-db.mjs";
import { LCSC } from "./cost/lcsc-map.mjs";
import { FOOTPRINT } from "./footprint-map.mjs";
import { inputStamp } from "../spice/run.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean);
let fails = 0;
const ck = (what, bad) => { console.log(`  ${bad.length ? "FAIL" : "ok  "}  ${what}${bad.length ? ` → ${bad.slice(0, 12).join(" · ")}${bad.length > 12 ? ` … (+${bad.length - 12})` : ""}` : ""}`); if (bad.length) fails++; };
console.log("=== REPO HYGIENE — only what the current design produces and uses is tracked ===");

// 1. a file an ignore rule covers must not be tracked (build outputs, raw simulator dumps, private keys)
ck("no tracked file is covered by an ignore rule", git("ls-files", "-ci", "--exclude-standard"));

// 2. persisted SPICE decks belong to a runner that exists. Deck names are <family>-<case>.cir; a family nobody writes is a leftover.
const runners = git("ls-files", "spice/*.mjs", "spice/**/*.mjs").map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n");
const decks = git("ls-files", "spice/generated/*.cir").map((f) => f.split("/").pop());
const family = (d) => d.replace(/\.cir$/, "").split(/[-_]/)[0];
ck("every persisted deck family has a runner that names it", [...new Set(decks.map(family))].filter((fam) => !new RegExp("[`\"']" + fam + "([-_`\"'$]|$)").test(runners)));

// 3. the footprint library is exactly the set of generated-family lands the sheets ask for (every drawn sheet, the card included)
const GEN = /^((CAP|RES)-TH_L|TERM_(Stud|Tab)_|CONN-TH_\d+P-|HDR-TH_\d+P-|DISC-\d|GDT-\d)/;
const asked = new Set();
for (const dir of readdirSync(join(ROOT, "kicad5")).filter((d) => d.startsWith("dc-modules-")))
  for (const f of readdirSync(join(ROOT, "kicad5", dir)).filter((x) => x.endsWith(".sch")))
    for (const m of readFileSync(join(ROOT, "kicad5", dir, f), "utf8").matchAll(/^F 2 "([^"]+)"/gm)) if (GEN.test(m[1])) asked.add(m[1]);
const lib = new Set(readdirSync(join(ROOT, "kicad5/footprints")).filter((x) => x.endsWith(".kicad_mod")).map((x) => x.slice(0, -10)));
ck("every land a sheet asks for exists in kicad5/footprints", [...asked].filter((n) => !lib.has(n)));
ck("no land in kicad5/footprints is unused", [...lib].filter((n) => !asked.has(n)));

// 4. the sourcing and footprint maps hold no entry for a part the BOM cannot emit
const live = new Set(DB.map((r) => r.mpn));
for (const s of BUILDABLE_SKUS) for (const ov of Object.values(skuOverrides[s] ?? {})) if (ov.mpn) live.add(ov.mpn);
ck("lcsc-map has no entry for an mpn the BOM cannot emit", Object.keys(LCSC).filter((k) => !live.has(k)));
ck("footprint-map has no entry for an mpn the BOM cannot emit", Object.keys(FOOTPRINT).filter((k) => !live.has(k)));

// 5. every parts-db rule is the first match of at least one drawn part (needs the built boards)
const builds = [...BUILDABLE_SKUS.flatMap((s) => ["acdc", "dcdc"].map((b) => `dist/boards/${s}/${b}/circuit.json`)), "dist/boards/control-card/circuit.json"].map((p) => join(ROOT, p));
if (builds.every(existsSync)) {
  const names = new Set();
  for (const p of builds) for (const e of JSON.parse(readFileSync(p, "utf8"))) if (e.type === "source_component" && e.name) names.add(e.name);
  const all = [...names];
  ck("every parts-db rule is the first match of a drawn part", DB.filter((r, i) => !all.some((n) => r.m.test(n) && DB.findIndex((q) => q.m.test(n)) === i)).map((r) => String(r.m)));
} else console.log("  --    parts-db dead-rule check skipped (boards not built: dist/ missing)");

// 6. derived evidence is not older than what it was derived from. A result file that is computed from OTHER results carries
//    "# inputs <hash> <- <files>"; when an input has moved on and the derived file was not regenerated, the hash no longer matches.
//    (The internal-short envelope and the CT front-end results both went stale this way: the LLC runner was re-run, its post-
//    processors were not, and every gate downstream kept reading the old peaks.)
{
  const stale = [];
  for (const f of git("ls-files", "simulation-results")) {
    if (!/\.(csv|json)$/.test(f)) continue;
    const m = readFileSync(join(ROOT, f), "utf8").match(/^# inputs ([0-9a-f]{12} <- (\S+))$/m);
    if (m && inputStamp(m[2].split(",")) !== m[1]) stale.push(f);
  }
  ck("no derived result file is older than its inputs", stale);
  ck("the LLC post-processed results carry an input stamp", BUILDABLE_SKUS.flatMap((s) => ["llc-short.csv", "llc-flux.csv"].map((n) => `simulation-results/${s}/${n}`)).concat("simulation-results/30kw/ct-frontend.csv")
    .filter((f) => !/^# inputs [0-9a-f]{12} <- /m.test(readFileSync(join(ROOT, f), "utf8"))));
}

// 7. no lookup table repeats a key. A repeated key in an object literal is legal JavaScript: the LAST one silently wins, so
//    the first definition is dead text that still reads as live (a 50 kW bypass relay was defined twice this way).
{
  const ts = (await import(join(ROOT, "node_modules/typescript/lib/typescript.js"))).default;
  const tables = ["calculations/cost/parts-db.mjs", "calculations/cost/lcsc-map.mjs", "calculations/footprint-map.mjs", "calculations/llc/tanks.mjs",
    "calculations/schematic-sections.mjs", "calculations/doc-chrome.mjs", "calculations/control/umod-pinmap.mts"].map((f) => join(ROOT, f));
  const prog = ts.createProgram(tables, { allowJs: true, checkJs: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext });
  const dup = ts.getPreEmitDiagnostics(prog).filter((d) => d.code === 1117 && d.file && tables.includes(d.file.fileName))
    .map((d) => `${d.file.fileName.slice(ROOT.length + 1)}:${d.file.getLineAndCharacterOfPosition(d.start).line + 1}`);
  ck("no lookup table repeats an object key", dup);
}

console.log(fails ? `\n${fails} HYGIENE FAILURE(S)` : "\nREPO HYGIENE CLEAN");
process.exit(fails ? 1 : 0);
