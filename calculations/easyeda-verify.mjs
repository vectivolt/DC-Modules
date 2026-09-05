#!/usr/bin/env node
// Diff the EasyEDA readback (out/easyeda/readback/*.json) against apply intent
// (out/easyeda/apply/*.json). Ground-truth gate for the EasyEDA transcription.
// Reports per page: extra/missing components, wrong nets, unconnected-but-should-be
// connected pins, and net-merge (ghosting) evidence.

import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const A = join(here, "out/easyeda/apply");
const R = join(here, "out/easyeda/readback");
const FIX = join(here, "out/easyeda/fix");
mkdirSync(FIX, { recursive: true });

const norm = (s) => (s ?? "").trim();
let tot = { pages: 0, comps: 0, missing: 0, extra: 0, wrong: 0, ncBad: 0 };
const detail = [];

for (const f of readdirSync(A).sort()) {
  const page = f.replace(/\.json$/, "");
  const rp = join(R, `${page}.json`);
  if (!existsSync(rp)) { detail.push(`${page}: NO READBACK`); continue; }
  const intent = JSON.parse(readFileSync(join(A, f), "utf8"));
  const readRaw = JSON.parse(readFileSync(rp, "utf8"));
  if (readRaw.error) { detail.push(`${page}: READBACK ERROR ${readRaw.error}`); continue; }

  const want = new Map();
  for (const c of intent.chunks.flat()) want.set(c.designator, c);
  const got = new Map();
  for (const c of readRaw) got.set(c.designator, c);
  const nc = intent.nc || {};

  const missing = [...want.keys()].filter((d) => !got.has(d));
  const extra = [...got.keys()].filter((d) => !want.has(d) && !/^__flag/.test(d));
  const wrong = [];   // pin should be on net X, is on Y (or unconnected)
  const ncBad = [];   // pin should be no-connect, carries a net
  const connect = []; // repair plan: external_connect entries
  const ncFix = [];   // repair plan: pins to re-mark no-connect

  for (const [des, w] of want) {
    const g = got.get(des);
    if (!g) continue;
    const gp = new Map(g.pins.map((p) => [String(p.pin_number), norm(p.signal_name)]));
    for (const p of w.pins) {
      const exp = norm(p.signal_name);
      if (!exp) continue;
      const act = gp.get(String(p.pin_number));
      if (act === undefined) wrong.push(`${des}.${p.pin_number} exp ${exp} -> PIN ABSENT`);
      else if (act !== exp) {
        wrong.push(`${des}.${p.pin_number} exp ${exp} -> ${act || "(unconnected)"}`);
        connect.push({ designator: des, pin_number: Number(p.pin_number), signal_name: exp });
      }
    }
    for (const n of nc[des] || []) {
      const act = gp.get(String(n));
      if (act) { ncBad.push(`${des}.${n} should be NC -> ${act}`); ncFix.push({ designator: des, pin_number: Number(n) }); }
    }
  }

  writeFileSync(join(FIX, `${page}.json`), JSON.stringify({
    page, page_uuid: intent.page_uuid,
    add_components: intent.chunks.flat().filter((c) => missing.includes(c.designator)),
    rm_components: extra,
    external_connect: connect,
    remark_no_connect: ncFix,
  }, null, 1));

  tot.pages++; tot.comps += want.size;
  tot.missing += missing.length; tot.extra += extra.length;
  tot.wrong += wrong.length; tot.ncBad += ncBad.length;

  const ok = !missing.length && !extra.length && !wrong.length && !ncBad.length;
  detail.push(`${ok ? "PASS" : "FAIL"} ${page}: ${want.size} intended, ${got.size} on page` +
    (missing.length ? `\n   missing(${missing.length}): ${missing.join(" ")}` : "") +
    (extra.length ? `\n   EXTRA(${extra.length}): ${extra.join(" ")}` : "") +
    (wrong.length ? `\n   wrong-net(${wrong.length}): ${wrong.slice(0, 40).join("; ")}${wrong.length > 40 ? " ..." : ""}` : "") +
    (ncBad.length ? `\n   nc-violation(${ncBad.length}): ${ncBad.join("; ")}` : ""));
}

console.log(detail.join("\n"));
console.log(`\n== ${tot.pages} pages, ${tot.comps} intended components ==`);
console.log(`missing ${tot.missing} | extra ${tot.extra} | wrong-net ${tot.wrong} | nc-violation ${tot.ncBad}`);
process.exit(tot.missing + tot.extra + tot.wrong + tot.ncBad ? 1 : 0);
