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
// E70: the drawings live on the four generated module pages; the hub carries D4 and the common requirements.
const hub = readFileSync(join(ROOT, "docs/magnetics.md"), "utf8");
const pages = ["30kw", "40kw", "50kw", "50kwa"].map((k) => [k, readFileSync(join(ROOT, `docs/magnetics-${k}.md`), "utf8")]);

// Split each document on its drawing headings; a section ends at the next level-2 heading.
const parts = [];
for (const [doc, md] of [["hub", hub], ...pages]) {
  const heads = [...md.matchAll(/^## .*$/gm)];
  heads.forEach((h, i) => {
    const t = h[0].replace(/^##\s+/, "").trim();
    if (!/^(D\d|CTs?\b|Current transformers)/.test(t)) return;
    parts.push({ title: `${doc} ${t}`, body: md.slice(h.index, i + 1 < heads.length ? heads[i + 1].index : md.length) });
  });
}
const md = hub;
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
  // the fields a winder also needs to hold a part to its rating — the third element limits a field to the parts it applies to
  ["current",     /A rms|A pk|A DC|current rating|A class/],
  ["temp class",  /Class [BFH]\b|Class 200|class [FH]\b|155 °C|180 °C/],
  ["tolerance",   /±|tolerance/],
  ["gap",         /\bgap\b|gapped|no grinding/i, /^(D1|D2|D3|D4)$/],
  ["wind order",  /winding table|radial order|sandwich|P\/2–S–P\/2|sectors|lay-up/i, /^(D3|D4|D7)$/],
];

// §0 is a COMMON-REQUIREMENTS section ("unless otherwise specified"), which is how drawing sets
// are normally organised -- and §0.1 carries a per-part mechanical table. So a field counts as
// specified for a part if it appears in the part's own section, OR in §0 on a line that names that
// part. Requiring every field in every section would report a correctly-organised set as broken.
const c0 = md.indexOf("## Common requirements");
const common = c0 >= 0 ? md.slice(c0, md.indexOf("\n## D4", c0)) : "";
const partId = (t) => (t.replace(/^\S+\s+/, "").match(/^(D\d|CT|Current)/) ?? [])[1] ?? t.slice(0, 2);
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
  const row = FIELDS.map(([, re, only]) => (only && !only.test(partId(p.title)) ? null : re.test(scope)));
  miss += row.filter((x) => x === false).length;
  console.log("  " + p.title.slice(0, 33).padEnd(34) + row.map((x) => (x === null ? "  na  " : x ? "  ok  " : "  --  ")).join(""));
}
console.log(`\n  legend: ${FIELDS.map(([n]) => `${n.slice(0, 5)}=${n}`).join("  ")}`);
console.log(`\n  ${miss} missing field(s) across ${parts.length} drawings\n`);
for (const p of parts) {
  const gaps = FIELDS.filter(([, re, only]) => !(only && !only.test(partId(p.title))) && !re.test(p.body + "\n" + commonFor(p.title))).map(([n]) => n);
  if (gaps.length) console.log(`  ${p.title.split("—")[0].trim().padEnd(12)} missing: ${gaps.join(", ")}`);
}
console.log(miss ? `\nRFQ AUDIT: ${miss} MISSING FIELD(S) — a drawing that cannot be quoted` : "RFQ AUDIT CLEAN — every magnetic drawing carries every field a winder quotes against");
process.exit(miss ? 1 : 0);
