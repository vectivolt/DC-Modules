#!/usr/bin/env node
// card-alignment.mjs — the control card and every power board must agree, by construction.
//
// The card is one part number serving two converter roles at two ratings. Nothing in the build
// compares the two sides of its connector, so every way is an opportunity for the halves to drift:
// a way the board never consumes, a net the board expects that no way delivers, an MCU pin
// allocated twice, a way with no pin at all. All four of those were present at once when this was
// written, and every board still built and exported cleanly.
//
// Two layers of check, because they fail differently:
//   STATIC   contract-only, no build needed — ways vs MCU pins vs declared card-internal signals
//   CROSS    per board — every way's net must have a consumer on that board, and every net the
//            board's cells wait on must be delivered by a way
//
// Run: node calculations/card-alignment.mjs
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The contract is TypeScript, so read it through tsx rather than duplicating it here — a second
// copy of the pin map is exactly the drift this script exists to catch.
const dump = JSON.parse(
  execFileSync("npx", ["tsx", join(ROOT, "calculations/card-contract-dump.mts")],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 }).trim().split("\n").pop());

const POWER = new Set(["V24", "V15", "V3P3", "DGND", "AGND", "PE"]);
let fail = 0;
const check = (name, bad, detail) => {
  if (bad) fail++;
  console.log(`  ${bad ? "FAIL" : "ok  "} ${name.padEnd(14)} ${detail}`);
};

console.log(`\n== card contract (static)\n`);
const { ways, pins, internal, maxWays } = dump;
const noPin = new Set(dump.noPin ?? []);
const sig = ways.filter((w) => !POWER.has(w) && !noPin.has(w));
const int = new Set(Object.keys(internal));
const intPins = Object.values(internal).map(([p]) => p);
const vals = Object.values(pins);

check("ways", ways.length > maxWays, `${ways.length} of ${maxWays} (${maxWays - ways.length} spare), ${sig.length} signal + ${ways.length - sig.length} power/return`);
check("way->pin", sig.filter((w) => !pins[w]).length,
  (sig.filter((w) => !pins[w]).join(" ") || "every signal way has an MCU pin"));
const orphan = Object.keys(pins).filter((k) => !ways.includes(k) && !int.has(k));
check("pin->way", orphan.length, orphan.length ? `pins that are neither a way nor declared internal: ${orphan.join(" ")}` : `all pins are a way, or declared internal (${Object.keys(internal).join(", ") || "none"})`);
const allPins = [...vals, ...intPins];
const dup = allPins.filter((v, i) => allPins.indexOf(v) !== i);
// Datasheet-fixed pins on the GD32G553VET7 (Rev 2.0 Table 2-4). A connector way landing on any of
// these is a hard short, and it is exactly what the superseded STM32-derived map did: FLT on 74
// (VSS), BOOT0 on 100 (VDD). Only the pins DECLARED card-internal may sit here.
const FIXEDPIN = { 23:"VSS",48:"VSS",63:"VSS",74:"VSS",99:"VSS",24:"VDD",49:"VDD",64:"VDD",75:"VDD",
  100:"VDD",37:"VDDA",35:"VSSA",36:"VREFP",6:"VBAT",14:"NRST",95:"BOOT0",76:"SWDIO",77:"SWCLK",
  12:"OSCIN",13:"OSCOUT" };
const onFixed = Object.entries(pins).filter(([, p]) => FIXEDPIN[p]);
check("pin vs fixed", onFixed.length, onFixed.length
  ? `way on a datasheet-fixed pin: ${onFixed.map(([w, p]) => `${w}->${p}(${FIXEDPIN[p]})`).join(" ")}`
  : "no connector way lands on VSS/VDD/VDDA/VREF/NRST/BOOT0/SWD/OSC");
// The backup domain (PC13/PC14/PC15) is fed through a shared ~3 mA switch -- the R3 audit rules it
// out as general I/O.
const onBackup = Object.entries(pins).filter(([, p]) => [7, 8, 9].includes(p));
check("pin vs backup", onBackup.length, onBackup.length
  ? `way in the backup domain: ${onBackup.map(([w]) => w).join(" ")}` : "no way in the PC13/14/15 backup domain");
check("pin unique", dup.length, dup.length ? `pin(s) allocated twice: ${[...new Set(dup)].join(" ")}` : "no MCU pin allocated twice");
console.log(`\n== scope (cardMap must refuse what it cannot serve)\n`);
for (const [k, v] of Object.entries(dump.roles)) {
  const inScope = dump.scope.some((s) => k.startsWith(s));
  const good = inScope ? v.ok : !v.ok;
  if (!good) fail++;
  console.log(`  ${good ? "ok  " : "FAIL"} ${k.padEnd(14)} ${v.ok ? `builds, ${v.map.filter(([, n]) => n).length} ways used` : `refused — ${(v.error.match(/: ([^.]+)\. CARD_SCOPE/) ?? [, v.error])[1]}`}${inScope ? "" : "   [out of scope]"}`);
}

console.log(`\n== cross-check: every way lands on a real net, every waiting net gets a way\n`);
for (const [k, v] of Object.entries(dump.roles)) {
  if (!v.ok) continue;
  const [sku, role] = k.split("/");
  const side = role === "acdc" ? "acdc" : "dcdc";
  const p = join(ROOT, `dist/boards/${sku}/${side}/circuit.json`);
  if (!existsSync(p)) { console.log(`  --   ${k.padEnd(14)} no build`); continue; }
  const j = JSON.parse(readFileSync(p, "utf8"));
  const nets = new Map(j.filter((e) => e.type === "source_net").map((n) => [n.source_net_id, n.name]));
  const comps = new Map(j.filter((e) => e.type === "source_component").map((c) => [c.source_component_id, c.name]));
  const ports = new Map(j.filter((e) => e.type === "source_port").map((x) => [x.source_port_id, x]));
  const mem = new Map();
  for (const t of j.filter((e) => e.type === "source_trace"))
    for (const id of t.connected_source_net_ids ?? []) {
      const n = nets.get(id); if (!n) continue;
      const s = mem.get(n) ?? mem.set(n, new Set()).get(n);
      for (const pid of t.connected_source_port_ids ?? []) {
        const pt = ports.get(pid);
        if (pt) s.add(`${comps.get(pt.source_component_id)}.${pt.name ?? pt.port_hint ?? "?"}`);
      }
    }
  // A way is DEAD when the only thing on its net is the connector itself: the signal crosses the
  // connector and lands on nothing.
  const dead = v.map.filter(([, n]) => n)
    .map(([way, n]) => [way, n.replace("net.", "")])
    .filter(([, n]) => !POWER.has(n) && (mem.get(n)?.size ?? 0) < 2);
  const bad = dead.length;
  if (bad) fail++;
  console.log(`  ${bad ? "FAIL" : "ok  "} ${k.padEnd(14)} ${bad ? `${bad} dead way(s): ${dead.map(([w, n]) => `${w}->${n}`).join(" ")}` : `all ${v.map.filter(([, n]) => n && !POWER.has(n.replace("net.", ""))).length} signal ways reach a consumer`}`);
}

console.log(fail ? `\n${fail} alignment check(s) failed\n` : `\nall alignment checks pass\n`);
process.exit(fail ? 1 : 0);
