#!/usr/bin/env node
// unwired-pins.mjs — find pins a symbol DECLARES but the design never connects.
//
// This is the systematic version of a defect that kept turning up one at a time by eye: the pin
// exists in the cell's `pinLabels`, so the part really has it and it really does something, but
// no trace ever reaches it. ERC cannot see this — nothing is "unbound" from its point of view,
// because the pin was never asked to connect. Found this way so far:
//
//   NSI6611 RDY   open-drain power-good that could never pull
//   TPS3430 CWD   watchdog timeout program -> window undefined
//   TPS3430 CRST  reset-delay program
//   NCP1252A RT   switching-frequency program -> no defined Fsw
//
// It works off the BUILT netlist, not the source text. A first version grepped the .tsx and was
// wrong in both directions: it could not see traces generated in a loop (`.USR1 > .${q}`), so it
// cried wolf over the whole HMI display, and it matched pin names globally, so a pin wired on one
// part looked wired on every part that shared a pin map. The built circuit has no such ambiguity.
//
// A pin listed here is NOT automatically a bug — genuinely unused pins exist. It is a list to
// ADJUDICATE, and the adjudications live in KNOWN so the list stays short and each carries a
// reason someone can disagree with.
//
// Run: node calculations/unwired-pins.mjs [sku]

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKU = process.argv[2] || "30kw";

// pin name -> why it is legitimately unconnected
const KNOWN = {
  NC: "explicit no-connect", NC1: "explicit no-connect", NC2: "explicit no-connect",
  NC3: "explicit no-connect", NC4: "explicit no-connect",
  QHS: "shift-register cascade output, single device so nothing to cascade into",
  Y2: "spare AND gate output (its inputs are tied low)",
  Y3: "spare AND gate output (its inputs are tied low)",
  TAB: "package tab, bonded to drain — carried by the drain pin",
  N1: "unused choke winding tap", N2: "unused choke winding tap", N3: "unused choke winding tap",
  N4: "unused module pin",
  P2: "tactile switch: contacts 1-2 and 3-4 are internally paired, one of each pair is enough",
  P4: "tactile switch: contacts 1-2 and 3-4 are internally paired, one of each pair is enough",
  SHLD: "CAN connector shield, single-point grounded at the charger end (not on this board)",
  FPWM: "harness spare — fan PWM exists on the AC-DC board only, so the DC-DC connector pin is spare",
  FTACH: "harness spare — fan tach is AC-DC side only",
  TINL: "harness spare — reserved for a future inlet-temperature sensor",
};

let total = 0;
const findings = [];
for (const side of ["acdc", "dcdc"]) {
  const p = join(ROOT, "dist/boards", SKU, side, "circuit.json");
  if (!existsSync(p)) { console.log(`!! missing build: ${SKU}/${side}`); continue; }
  const j = JSON.parse(readFileSync(p, "utf8"));

  const comp = new Map();
  for (const e of j) if (e.type === "source_component") comp.set(e.source_component_id, e.name);
  const connected = new Set();
  for (const e of j) if (e.type === "source_trace")
    for (const id of e.connected_source_port_ids ?? []) connected.add(id);

  for (const e of j) {
    if (e.type !== "source_port") continue;
    total++;
    if (connected.has(e.source_port_id)) continue;
    const ref = comp.get(e.source_component_id) ?? "?";
    if (/^NC_/.test(ref)) continue;
    findings.push({ side, ref, pin: e.pin_number, name: e.name ?? "?" });
  }
}

// A pin still called "pinNN" was never given a function name, which on the 100-pin MCUs means a
// deliberately spare GPIO. Those are expected, not defects.
const spare = (f) => KNOWN[f.name] || /^pin\d+$/.test(f.name);
const real = findings.filter((f) => !spare(f));
const excused = findings.length - real.length;

console.log(`${SKU}: ${total} declared pins across both boards`);
console.log(`${findings.length} not reached by any trace — ${excused} with a recorded reason, ${real.length} to adjudicate`);
if (real.length) {
  console.log("");
  const byPart = new Map();
  for (const f of real) {
    const k = `${f.name}`;
    if (!byPart.has(k)) byPart.set(k, []);
    byPart.get(k).push(`${f.ref}.${f.pin}`);
  }
  for (const [name, refs] of [...byPart].sort((a, b) => b[1].length - a[1].length))
    console.log(`   .${name.padEnd(8)} ${refs.length.toString().padStart(3)}x   ${refs.slice(0, 6).join(" ")}${refs.length > 6 ? " ..." : ""}`);
}
process.exit(real.length ? 1 : 0);
