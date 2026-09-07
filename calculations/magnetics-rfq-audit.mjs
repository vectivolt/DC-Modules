#!/usr/bin/env node
// magnetics-rfq-audit.mjs — is each magnetic drawing complete enough to ORDER?
//
// Every magnetic in this design is custom-by-drawing, so the drawing IS the part. A winder cannot
// quote, build or accept a part from an electrical design alone: they need the mechanical envelope,
// the terminations, the insulation system, the acceptance tests and the traceability that decides
// whether a delivered unit is good. A spec that is complete electrically and silent mechanically
// gets quoted anyway -- with the winder's assumptions substituted for yours, discovered at FAI.
//
// This checks presence, not correctness. A field it reports as present may still be wrong; a field
// it reports missing is definitely not orderable.
//
// Run: node calculations/magnetics-rfq-audit.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const md = readFileSync(join(ROOT, "docs/magnetics.md"), "utf8")
  + "\n" + readFileSync(join(ROOT, "docs/aux-transformer-D4.md"), "utf8");

// Split on the drawing headings.
const parts = [];
for (const m of md.matchAll(/^##+\s+(D\d[^\n]*|CTs?\b[^\n]*)$/gm)) parts.push({ title: m[1].trim(), at: m.index });
for (let i = 0; i < parts.length; i++)
  parts[i].body = md.slice(parts[i].at, i + 1 < parts.length ? parts[i + 1].at : md.length);
// A superseded drawing is not quotable by definition, so holding it to ordering completeness would
// report a defect that does not exist. It must still SAY it is superseded -- that is the check.
const live = parts.filter((p) => {
  // Must be the explicit marker, not any mention: D4 rev C's body says "Superseded rev A and rev B"
  // -- describing what IT replaces. Matching loosely dropped the live drawing.
  if (!/\*\*SUPERSEDED\b/.test(p.body)) return true;
  console.log(`  --   ${p.title.split("—")[0].trim().padEnd(12)} superseded, not audited`);
  return false;
});
parts.length = 0; parts.push(...live);

// What a winder needs. Each field is a set of alternative phrasings -- any hit counts as present.
const FIELDS = [
  ["core",        /core|toroid|ETD|PQ\d|EE\d|EF\d|nanocryst|sendust|ferrite/i],
  ["winding",     /winding|turns|\bN\s*=|\bNp\b|litz|foil|AWG/i],
  ["terminations",/terminat|flying lead|ring.?lug|pin ?out|bobbin pin|solder tab|lead length/i],
  ["envelope",    /envelope|max(imum)? dimensions|outline|footprint|OD\d|height|mass/i],
  ["mounting",    /mount|clamp|bolt|bracket|pad/i],
  ["L accept",    /L @|L\(|inductance|Lp |Lm |L_cm|AL /i],
  ["DCR/ACR",     /Rdc|Rac|DCR|ACR|mΩ|milliohm/i],
  ["thermal",     /ΔT|dT|temp(erature)? rise|hotspot|thermocouple/i],
  ["op temp",     /operating temp|ambient range|-40|−40|\bTa\b|class [BFH]\b/i],
  ["insulation",  /insulat|TIW|margin tape|reinforced|UL ?1446|functional/i],
  ["hipot",       /hi-?pot|hipot|kV|VAC\/1|dielectric/i],
  ["marking",     /marking|label|traceab|lot|serial|polarity dot|dot at start/i],
  ["qty",         /qty|quantity|per SKU|qty \d/i],
];

// §0 is a COMMON-REQUIREMENTS section ("unless otherwise specified"), which is how drawing sets
// are normally organised -- and §0.1 carries a per-part mechanical table. So a field counts as
// specified for a part if it appears in the part's own section, OR in §0 on a line that names that
// part. Requiring every field in every section would report a correctly-organised set as broken.
const c0 = md.indexOf("# §0");
const common = c0 >= 0 ? md.slice(c0) : "";
const partId = (t) => (t.match(/^(D\d|CT)/) ?? [])[1] ?? t.slice(0, 2);
const commonFor = (t) => {
  const id = partId(t);
  return common.split("\n").filter((l) => !l.startsWith("|") || new RegExp(`\\b${id}\\b`).test(l)).join("\n");
};

let miss = 0;
console.log(`\n== magnetics RFQ completeness — ${parts.length} drawings\n`);
const w = Math.max(...FIELDS.map(([n]) => n.length));
console.log("  " + "drawing".padEnd(34) + FIELDS.map(([n]) => n.slice(0, 5).padEnd(6)).join(""));
for (const p of parts) {
  const scope = p.body + "\n" + commonFor(p.title);
  const row = FIELDS.map(([, re]) => re.test(scope));
  miss += row.filter((x) => !x).length;
  console.log("  " + p.title.slice(0, 33).padEnd(34) + row.map((x) => (x ? "  ok  " : "  --  ")).join(""));
}
console.log(`\n  legend: ${FIELDS.map(([n]) => `${n.slice(0, 5)}=${n}`).join("  ")}`);
console.log(`\n  ${miss} missing field(s) across ${parts.length} drawings\n`);
for (const p of parts) {
  const gaps = FIELDS.filter(([, re]) => !re.test(p.body + "\n" + commonFor(p.title))).map(([n]) => n);
  if (gaps.length) console.log(`  ${p.title.split("—")[0].trim().padEnd(12)} missing: ${gaps.join(", ")}`);
}
console.log();
