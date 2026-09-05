#!/usr/bin/env node
// kicad-verify.mjs — prove the generated KiCad sheets carry the intended netlist.
//
// The drawing is only worth anything if it is electrically identical to the source design, so
// this exports KiCad's OWN netlist (kicad-cli, i.e. the same netlister the PCB would use) and
// diffs every pin against calculations/out/easyeda/apply/*.json. Nothing here trusts the
// generator; the check is against KiCad's independent reading of the files it produced.
//
// Run: node calculations/kicad-verify.mjs

import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "calculations/out/easyeda/apply");
const SCH = join(ROOT, "kicad/dc-modules-30kw");
const CLI = "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli";
const tmp = mkdtempSync(join(tmpdir(), "kicad-verify-"));

/** pin -> net from a KiCad sexpr netlist: {"REF.PIN": "NET"} */
function readNetlist(path) {
  const s = readFileSync(path, "utf8");
  const out = new Map();
  const netsAt = s.indexOf("(nets");
  const body = s.slice(netsAt);
  const netRe = /\(net\s+\(code "[^"]*"\)\s+\(name "([^"]*)"\)/g;
  let m, bounds = [];
  while ((m = netRe.exec(body))) bounds.push([m.index, m[1]]);
  bounds.push([body.length, null]);
  for (let i = 0; i < bounds.length - 1; i++) {
    const [start, name] = bounds[i], end = bounds[i + 1][0];
    const chunk = body.slice(start, end);
    for (const n of chunk.matchAll(/\(ref "([^"]+)"\)\s*\(pin "([^"]+)"\)/g)) {
      out.set(`${n[1]}.${n[2]}`, name);
    }
  }
  return out;
}

let totPins = 0, totOk = 0, totBad = 0, totMissing = 0, pages = 0, comps = 0;
const problems = [];

for (const f of readdirSync(SRC).filter((x) => x.endsWith(".json")).sort()) {
  const page = JSON.parse(readFileSync(join(SRC, f), "utf8"));
  const schFile = join(SCH, `${page.page}.kicad_sch`);
  const nl = join(tmp, `${page.page}.net`);
  try {
    execFileSync(CLI, ["sch", "export", "netlist", "--format", "kicadsexpr", "-o", nl, schFile],
      { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    problems.push(`${page.page}: netlist export FAILED — ${String(e.stderr ?? e).slice(0, 120)}`);
    continue;
  }
  const got = readNetlist(nl);
  const want = page.chunks.flat();
  let bad = 0, missing = 0, ok = 0;
  const seen = new Set();
  for (const c of want) {
    comps++;
    for (const p of c.pins) {
      if (!p.signal_name) continue;
      totPins++;
      const key = `${c.designator}.${p.pin_number}`;
      seen.add(c.designator);
      const actual = got.get(key);
      if (actual === undefined) { missing++; if (problems.length < 60) problems.push(`${page.page}: ${key} absent from netlist (expected ${p.signal_name})`); }
      else if (actual !== p.signal_name) { bad++; if (problems.length < 60) problems.push(`${page.page}: ${key} on ${actual}, expected ${p.signal_name}`); }
      else ok++;
    }
  }
  // every component must actually exist in the exported netlist
  const refs = new Set([...got.keys()].map((k) => k.split(".")[0]));
  // a part with no connected pins legitimately contributes no netlist node
  const absent = want.filter((c) => c.pins.some((p) => p.signal_name)).map((c) => c.designator).filter((d) => !refs.has(d));
  if (absent.length) problems.push(`${page.page}: components absent from netlist: ${absent.slice(0, 8).join(",")}${absent.length > 8 ? ` +${absent.length - 8}` : ""}`);

  totOk += ok; totBad += bad; totMissing += missing; pages++;
  const verdict = bad + missing + absent.length ? `FAIL  ${bad} wrong · ${missing} absent · ${absent.length} missing parts` : "PASS";
  console.log(`${verdict.padEnd(46)} ${page.page.padEnd(22)} ${ok}/${ok + bad + missing} pins`);
}

console.log(`\n== ${pages} sheets · ${comps} components · ${totPins} connected pins ==`);
console.log(`correct ${totOk} · wrong ${totBad} · absent ${totMissing}  → ${(100 * totOk / totPins).toFixed(2)}%`);
if (problems.length) {
  console.log(`\nfirst problems:`);
  for (const p of problems.slice(0, 25)) console.log("  " + p);
}
process.exit(totBad + totMissing ? 1 : 0);
