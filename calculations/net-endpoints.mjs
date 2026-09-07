#!/usr/bin/env node
// net-endpoints.mjs — every net must have at least two endpoints.
//
// A one-endpoint net is unroutable and the router is right to skip it, but the failure it reports
// names the part that IS on the net -- so the message accuses a connector while the part that
// should have been the second endpoint goes unmentioned, because it is not on the net to mention.
// This is how a whole MCU came to be wired to nothing while the board still built and exported.
//
// Run: node calculations/net-endpoints.mjs <sku> <side> | control-card
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [a, b] = process.argv.slice(2);
const isCard = a === "control-card";
const p = isCard ? join(ROOT, "dist/boards/control-card/circuit.json")
                 : join(ROOT, `dist/boards/${a}/${b}/circuit.json`);
if (!existsSync(p)) { console.error(`no build at ${p}`); process.exit(2); }
const j = JSON.parse(readFileSync(p, "utf8"));

const nets = new Map(j.filter((e) => e.type === "source_net").map((n) => [n.source_net_id, n.name]));
const comps = new Map(j.filter((e) => e.type === "source_component").map((c) => [c.source_component_id, c.name]));
const ports = new Map(j.filter((e) => e.type === "source_port").map((x) => [x.source_port_id, x]));

const mem = new Map();                                  // net name -> Set of "COMP.PIN"
for (const t of j.filter((e) => e.type === "source_trace"))
  for (const id of t.connected_source_net_ids ?? []) {
    const n = nets.get(id); if (!n) continue;
    const s = mem.get(n) ?? mem.set(n, new Set()).get(n);
    for (const pid of t.connected_source_port_ids ?? []) {
      const pt = ports.get(pid);
      if (pt) s.add(`${comps.get(pt.source_component_id)}.${pt.name ?? pt.port_hint ?? "?"}`);
    }
  }

// A net carried by a copper pour reaches every part on it through the plane, so its endpoint count
// is not a routing question. Everything else needs a second endpoint to be a connection at all.
const poured = new Set(j.filter((e) => e.type === "pcb_copper_pour")
  .map((e) => nets.get(e.source_net_id)).filter(Boolean));

// NC_* is the repo convention for a deliberately unused device output tied to a named net. It
// documents intent, so it is not an island -- but nothing else gets that pass.
const islands = [...mem].filter(([n, s]) => s.size < 2 && !poured.has(n) && !/^NC_/.test(n));
console.log(`\n== net endpoints — ${isCard ? "control-card" : `${a}-${b}`}`);
console.log(`   ${mem.size} nets, ${poured.size} plane-served`);
if (!islands.length) { console.log(`   ok   every net has >= 2 endpoints\n`); process.exit(0); }
console.log(`   FAIL ${islands.length} island net(s) — one endpoint, nothing to route to:\n`);
for (const [n, s] of islands.slice(0, 40)) console.log(`     ${n.padEnd(18)} ${[...s][0] ?? "(no port)"}`);
if (islands.length > 40) console.log(`     ... and ${islands.length - 40} more`);
console.log();
process.exit(1);
