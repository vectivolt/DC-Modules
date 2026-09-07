#!/usr/bin/env node
// fab-release.mjs — gate a board before it can be called a fabrication release, then export.
//
// "It builds" is not a release. A board is releasable when every gate this repo owns is clean AND
// the routing is actually complete -- an autorouter that leaves nets unrouted still produces a
// gerber, and that gerber is a board that does not work.
//
// Gates, in the order a defect is cheapest to fix:
//   1. netlist      no unconnected ports, no missing traces
//   2. placement    placement-audit.mjs  (tscircuit DRC + the floorplan rules)
//   3. physics      emi-thermal-audit.mjs
//   4. routing      routing-audit.mjs    (copper justified by current, barrier sides)
//   5. clearances   no trace/via/pad clearance violations from the router
//
// Run: node calculations/fab-release.mjs <sku> <side>     e.g. 30kw acdc
//      node calculations/fab-release.mjs control-card

import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [a, b] = process.argv.slice(2);
const isCard = a === "control-card";
const label = isCard ? "control-card" : `${a}-${b}`;
const jsonPath = isCard ? join(ROOT, "dist/boards/control-card/circuit.json")
                        : join(ROOT, `dist/boards/${a}/${b}/circuit.json`);
const srcPath = isCard ? "boards/control-card.tsx" : `boards/${a}/${b}.tsx`;

if (!existsSync(jsonPath)) { console.error(`no build at ${jsonPath}`); process.exit(2); }
const j = JSON.parse(readFileSync(jsonPath, "utf8"));
const count = (t) => j.filter((e) => e.type === t).length;

let fail = 0;
const gate = (name, bad, detail) => {
  if (bad) fail++;
  console.log(`  ${bad ? "FAIL" : "ok  "} ${name.padEnd(11)} ${detail}`);
};

console.log(`\n== fabrication release check — ${label}\n`);

// 1. netlist
const unconn = count("pcb_port_not_connected_error");
const missing = count("pcb_trace_missing_error");
gate("netlist", unconn + missing, `${unconn} unconnected port(s), ${missing} missing trace(s)`);

// 2-4. the repo's own gates, run as subprocesses so their own output stays authoritative
const run = (script) => {
  try {
    execFileSync(process.execPath, [join(ROOT, "calculations", script), ...(isCard ? [] : [a, b])],
      { stdio: "pipe" });
    return 0;
  } catch { return 1; }
};
if (!isCard) {
  gate("placement", run("placement-audit.mjs"), "placement-audit.mjs");
  gate("physics", run("emi-thermal-audit.mjs"), "emi-thermal-audit.mjs");
  gate("routing", run("routing-audit.mjs"), "routing-audit.mjs");
}

// 5. clearances produced by the router itself
const clr = ["pcb_trace_error", "pcb_via_trace_clearance_error", "pcb_pad_trace_clearance_error",
             "pcb_pad_pad_clearance_error", "pcb_courtyard_overlap_error", "pcb_footprint_overlap_error"]
  .map((t) => [t, count(t)]).filter(([, n]) => n);
gate("clearances", clr.reduce((s, [, n]) => s + n, 0),
  clr.length ? clr.map(([t, n]) => `${t.replace(/^pcb_|_error$/g, "")} ${n}`).join(", ") : "none");

// routing completeness. A board with no copper still exports a gerber -- and that gerber is a
// board that does not work -- so this is a gate, not a footnote. Power nets are plane-served and
// legitimately have no trace, so the bar is that SOME routing happened and nothing is left dangling.
const srcTraces = count("source_trace"), pcbTraces = count("pcb_trace"), vias = count("pcb_via");
const pours = count("pcb_copper_pour");
gate("routed", srcTraces > 0 && pcbTraces === 0 ? 1 : 0,
  `${pcbTraces} traces, ${vias} vias, ${pours} pours, from ${srcTraces} source traces`);

if (fail) {
  console.log(`\n${fail} gate(s) failed — NOT a release. Fix these before exporting fabrication data.`);
  process.exit(1);
}
console.log(`\nall gates pass — exporting fabrication data`);
mkdirSync(join(ROOT, "dist/fab"), { recursive: true });
for (const fmt of ["gerbers", "pcb-svg", "readable-netlist"]) {
  const out = join(ROOT, `dist/fab/${label}.${fmt === "gerbers" ? "zip" : fmt === "pcb-svg" ? "svg" : "txt"}`);
  try {
    execFileSync("npx", ["tsci", "export", srcPath, "-f", fmt, "-o", out], { cwd: ROOT, stdio: "pipe" });
    console.log(`   ${fmt.padEnd(17)} -> ${out.replace(ROOT + "/", "")}`);
  } catch (e) { console.log(`   ${fmt.padEnd(17)} FAILED`); fail++; }
}
process.exit(fail ? 1 : 0);
