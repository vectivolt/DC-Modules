// bom-gen.mjs — BOM generator (§49-7/21/22, §43): reads built circuit JSON of all six boards,
// classifies every component via parts-db patterns, emits per-board BOM CSVs, per-module costed
// roll-ups at 100/1k/5k/10k pcs, a second-source BOM, and docs/bom-cost.md.
// rev D (2026-09-05): 10k tier added on the customer's ≥10k units/yr directive (A7 rev B) —
// heuristic ×0.80 electronics / ×0.87 mech off the 1k basis, overridden per-part where a
// volume-specific quote basis exists (`p10k` in parts-db: bias/iso modules, PV drivers).
// UNMATCHED components are listed loudly — the BOM is not "perfect" until that list is empty.
// Run (after tsci builds): node calculations/cost/bom-gen.mjs

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DB, skuOverrides, mechLines, mech2U, biasCommon, BUILDABLE_SKUS } from "./parts-db.mjs";
import { lcscFor, lcscForPart, lcscSummary, LCSC_BY_VALUE } from "./lcsc-map.mjs";
import { realPackagesFrom } from "../footprint-map.mjs";   // E64: the drawn land decides the part
import { footer, masthead } from "../doc-chrome.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const f = (x, d = 0) => Number(x.toFixed(d));

const SKUS = BUILDABLE_SKUS; // the four module SKUs: 30 kW · 40 kW · 50 kW liquid · 50 kW air (E72: modules only)
const TARGETS = { "40kw": [33000, 29000],  // E41: 30k red-line x1.33 rounded — provisional until pricing directive
   "50kw": [43000, 39000],                 // E42: 40k red-line x1.25 + coldplate adder — provisional until pricing directive
   "50kwa": [43000, 39000],                // E44: air twin, same provisional line
   "30kw": [25000, 22000] };
const csvq = (x) => `"${String(x).replace(/"/g, '""')}"`;   // RFC 4180: a 0.56" display or a comma in a maker name must not shift columns

const CAT = (mpn, desc) =>
  /SiC|MOSFET|JBS|FET 1200|650 V 4 A/.test(desc) ? "semiconductors"
    : /driver|iso |LDO|MCU|shift|ULN|flyback controller|transceiver|amplifier/.test(desc) ? "drive+control ICs"
    : /module/.test(desc) ? "bias/iso modules"
    : /choke|transformer|inductor|trim/i.test(desc) || /\bCT\b/.test(desc) ? "magnetics"   // E61: a case-insensitive "CT " matched every relay "contact " · E70: an inductor is magnetics whatever its text says about trims
    : /µF|nF|pF|film|snap|X2|Y2|MLCC/i.test(desc) ? "capacitors"
    : /resistor|shunt|Ω|ceramic/i.test(desc) ? "resistors/shunts"
    : /relay/i.test(desc) ? "relays"
    : /MOV|fuse|TVS/i.test(desc) ? "protection"
    : /stud|header|connector|harness/i.test(desc) ? "connectors"
    : /7-seg|tactile/.test(desc) ? "HMI"
    : "misc";

// Same engineering-notation formatter the schematic uses, so a (family|value) key formed here
// matches the one formed there — the sheet and the BOM must not disagree about a part number.
const eng = (x, unit) => {
  if (!(x > 0)) return "";
  const p = [[1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "u"], [1e-9, "n"], [1e-12, "p"]];
  for (const [m, sfx] of p) if (x >= m * 0.9999) return `${Number((x / m).toPrecision(3))}${sfx}${unit}`;
  return `${x}${unit}`;
};
const valueOf = (c) => c.ftype === "simple_resistor"
  ? (Number(c.resistance) === 0 ? "0R" : eng(Number(c.resistance), ""))
  : c.ftype === "simple_capacitor" ? eng(Number(c.capacitance), "F") : "";

// E69f: China-supplier RFQ-TARGET basis (user directive 2026-09-13) — landed factors (freight + ~10 % duty included) on today's India
// 10k estimate, by part category. FLAGGED TARGETS, not quotes: they state the price a China RFQ must reach for the parity comparison.
// Assembly/EOL stays at the India basis (the module is built in India).
const CN = { semiconductors: 0.75, "drive+control ICs": 0.85, "bias/iso modules": 0.85, magnetics: 0.80, capacitors: 0.80,
  "resistors/shunts": 0.90, relays: 0.85, protection: 0.85, connectors: 0.90, HMI: 0.90, misc: 0.90 };
const cnFactor = (cat, desc) => (cat === "capacitors" && /MLCC|C0G|X7R|X5R|pF\b/.test(desc) ? 0.90 : CN[cat] ?? 0.90);
const cnMech = (desc) => (/^PCB/.test(desc) ? 0.75 : /Assembly|EOL/i.test(desc) ? 1.00 : 0.85);
// E70: every designator's schematic section, read off the audited sheet payloads, so a per-SKU BOM page groups cost the way
// the release sheets are drawn (sheet-pages → sheet-netlist-gen → kicad5). Missing payloads leave parts under "Unassigned".
const SECTION_TITLE = {
  "acdc:INPUT-EMI": "AC input, surge and EMI filter", "acdc:VIENNA-PFC": "Vienna PFC stage", "acdc:DC-LINK": "Split DC link and discharge",
  "acdc:AC-SENSING": "AC and bus sensing", "acdc:CONTROL": "AC-DC control interface", "acdc:AUX-POWER": "Auxiliary supply and fans",
  "dcdc:LLC-LEGS": "Full-bridge LLC legs", "dcdc:LLC-TANKS": "Resonant tank, transformer and rectifiers",
  "dcdc:BANKS-SP": "Output banks, S/P relays and output diode", "dcdc:OUTPUT-SENSING": "Output and bank sensing",
  "dcdc:CONTROL": "DC-DC control interface", "dcdc:COMMS-HMI": "CAN and HMI", "card:CONTROL": "Control card",
};
const sectionMap = (sku) => {
  const m = new Map();
  const dirs = [[sku === "30kw" ? join(ROOT, "calculations/out/sheets/apply") : join(ROOT, "calculations/out/sheets", sku, "apply"), ["acdc", "dcdc"]],
    [join(ROOT, "calculations/out/sheets/control-card/apply"), ["card"]]];
  for (const [dir, sides] of dirs) {
    if (!existsSync(dir)) continue;
    for (const fn of readdirSync(dir)) {
      const side = fn.split("-")[0];
      if (!sides.includes(side) || !fn.endsWith(".json")) continue;
      const page = JSON.parse(readFileSync(join(dir, fn), "utf8"));
      for (const chunk of page.chunks) for (const c of chunk) m.set(`${side}:${c.designator}`, `${side}:${page.page.replace(/^(acdc|dcdc|card)-/, "")}`);
    }
  }
  return m;
};
const summary = {};
const detail = {};   // E70: per-SKU section roll-up and line items for docs/bom-<sku>.md
let anyUnmatched = false;
for (const sku of SKUS) {
  const parts = new Map();
  const unmatched = new Set();
  const secOf = sectionMap(sku);
  const sec = {};   // section → { cost10: ₹ @10k, parts: count, lines: Map(key → {rec, qty}) }
  // Each power board pairs with one control card (role-agnostic, one p/n) -> TWO cards per
  // module. The card's parts were in NO BOM before this line (audit E35 follow-through).
  for (const [side, mult, pth] of [["acdc", 1, null], ["dcdc", 1, null], ["card", 1, join(ROOT, "dist", "boards", "control-card", "circuit.json")]   /* E40: ONE brain per module */]) {
    const p = pth ?? join(ROOT, "dist", "boards", sku, side, "circuit.json");
    if (!existsSync(p)) { console.log(`!! missing build: ${sku}/${side} — run tsci build first`); continue; }
    const j = JSON.parse(readFileSync(p, "utf8"));
    const landOf = realPackagesFrom([p]);        // E64: chip-size per designator, read off the built land
    for (const c of j.filter(e => e.type === "source_component")) {
      const name = c.name;
      if (/^NC_/.test(name)) continue;
      const rule = DB.find(r => r.m.test(name));
      if (!rule) { unmatched.add(`${side}:${name} (${c.ftype ?? "?"})`); anyUnmatched = true; continue; }
      const ov = (skuOverrides[sku] ?? {})[name] ?? {};
      // Split a generic family into per-value lines where a real catalogue part exists for that
      // value (LCSC_BY_VALUE) — "R-small" is two different orderable parts at 10k and at 1k.
      const val = valueOf(c);
      const pkg = landOf.get(name);              // E64: one family|value can be two parts by land
      const pkgKey = pkg && LCSC_BY_VALUE[`${ov.mpn ?? rule.mpn}|${val}|${pkg}`] ? `#${pkg}` : "";
      const vKey = (LCSC_BY_VALUE[`${ov.mpn ?? rule.mpn}|${val}`] || pkgKey) ? `#${val}` : "";
      const key = ((ov.price1k || ov.mpn) ? `${ov.mpn ?? rule.mpn}@${name}` : rule.mpn) + vKey + pkgKey;
      const resolved = lcscForPart(ov.mpn ?? rule.mpn, val, pkgKey ? pkg : undefined);
      // keep the CLASS as well as the resolved part: the row's mpn becomes the catalogue number,
      // and re-resolving from that later cannot find a LCSC_BY_VALUE entry keyed on the class
      const rec = parts.get(key) ?? { mpn: resolved.mpn ?? ov.mpn ?? rule.mpn, cls: ov.mpn ?? rule.mpn, val, pkg: pkgKey ? pkg : undefined, mfr: rule.mfr, desc: (ov.desc ?? rule.desc) + (ov.note ? ` [${ov.note}]` : ""), alt: rule.alt, qty: 0, price1k: ov.price1k ?? rule.price1k, p10k: ov.p10k ?? rule.p10k, sides: new Set(), refs: [] };
      rec.qty += (ov.qtyMul ?? 1) * mult;
      rec.sides.add(side);
      if (rec.refs.length < 12) rec.refs.push(name);
      parts.set(key, rec);
      const sk = secOf.get(`${side}:${name}`) ?? "unassigned";
      const S = (sec[sk] ??= { cost10: 0, parts: 0, lines: new Map() });
      const q = (ov.qtyMul ?? 1) * mult;
      S.cost10 += q * (rec.p10k ?? f(rec.price1k * 0.80, 1)); S.parts += q;
      const L = S.lines.get(key) ?? { key, qty: 0, refs: [] };
      L.qty += q; if (L.refs.length < 8) L.refs.push(name);
      S.lines.set(key, L);
    }
  }
  const rows = [...parts.values()].sort((a, b) => b.qty * b.price1k - a.qty * a.price1k);
  const csv = [["mpn", "lcsc", "lcsc_status", "manufacturer", "description", "second_source", "boards", "qty", "unit_100", "unit_1k", "unit_5k", "unit_10k", "ext_1k_INR", "ext_10k_INR", "sample_refs"]];
  let totE = 0, totE10 = 0, totE10cn = 0;
  const cats = {};
  for (const r of rows) {
    const u10 = r.p10k ?? f(r.price1k * 0.80, 1);
    const ext = r.qty * r.price1k, ext10 = r.qty * u10;
    totE += ext; totE10 += ext10;
    const cat = CAT(r.mpn, r.desc);
    cats[cat] = (cats[cat] ?? 0) + ext;
    totE10cn += ext10 * cnFactor(cat, r.desc);
    const lc = lcscForPart(r.cls ?? r.mpn, r.val ?? "", r.pkg);
    if (!lc.status) throw new Error(`bom-gen: ${r.mpn} has no lcsc_status`);   // E61: five value lines per SKU shipped blank past bom-maturity
    r.u10 = u10; r.ext10 = ext10; r.cat = cat; r.cn = cnFactor(cat, r.desc); r.lcsc = lc.lcsc ?? ""; r.status = lc.status;
    csv.push([r.mpn, lc.lcsc ?? "", lc.status, csvq(r.mfr), csvq(`${r.desc}${r.val && (LCSC_BY_VALUE[`${r.cls ?? r.mpn}|${r.val}`] || r.pkg) ? ` ${r.val}${r.pkg ? ` (${r.pkg} land)` : ""}` : ""}`), csvq(r.alt), [...r.sides].join("+"), r.qty, f(r.price1k * 1.35, 1), r.price1k, f(r.price1k * 0.88, 1), u10, f(ext), f(ext10), r.refs.join(" ")]);
  }
  csv.push(["BIAS-XFMR-SET", "", "CUSTOM", "custom", csvq(biasCommon.desc), `"—"`, "acdc+dcdc", 2, 0, biasCommon.price1k, 0, 0, 2 * biasCommon.price1k, 0, ""]);
  totE += 2 * biasCommon.price1k;
  cats["bias/iso modules"] = (cats["bias/iso modules"] ?? 0) + 2 * biasCommon.price1k;
  let mechTot = 0, mech10cn = 0;
  for (const [d, q, pr] of mechLines[sku]) { const e = q * pr; mechTot += e; mech10cn += e * 0.87 * cnMech(d); csv.push([`MECH`, "", "MECH", "—", csvq(d), `"—"`, "module", q, f(pr * 1.15, 0), pr, f(pr * 0.93, 0), f(pr * 0.87, 0), f(e), f(e * 0.87), ""]); }
  cats["mechanical/assembly"] = mechTot;
  detail[sku] = { sec, parts, rows, mech: mechLines[sku], mech2U: mech2U[sku] ?? null };
  const grand = totE + mechTot;
  const grand10 = totE10 + mechTot * 0.87;
  csv.push(["TOTAL_ELECTRONIC", "", "", "", "", "", "", "", "", "", "", "", f(totE), f(totE10), ""]);
  csv.push(["TOTAL_MODULE", "", "", "", "", "", "", "", "", "", "", "", f(grand), f(grand10), ""]);
  writeFileSync(join(ROOT, "calculations", "out", `bom-${sku}.csv`), csv.map(r => r.join(",")).join("\n") + "\n");
  const [red, stretch] = TARGETS[sku];
  const m2 = mech2U[sku] ? mech2U[sku].reduce((a, [, q, pr]) => a + q * pr, 0) : null;   // E69e scenario: mechanical/assembly lines only
  const m2cn = mech2U[sku] ? mech2U[sku].reduce((a, [d, q, pr]) => a + q * pr * 0.87 * cnMech(d), 0) : null;
  summary[sku] = { grand, g100: f(totE * 1.35 + mechTot * 1.15), g5k: f(totE * 0.88 + mechTot * 0.93), g10k: f(grand10), g10kCN: f(totE10cn + mech10cn),
    s2U: m2 === null ? null : f(totE10 + m2 * 0.87), s2UCN: m2cn === null ? null : f(totE10cn + m2cn), red, stretch, cats, nLines: rows.length, unmatched: [...unmatched] };
  console.log(`${sku}: ${rows.length} BOM lines, electronics ₹${f(totE)}, module ₹${f(grand)} @1k / ₹${f(grand10)} @10k (red ₹${red}) ${grand10 <= red ? "10k ≤ RED ✓" : "10k OVER by ₹" + f(grand10 - red)}`);
  if (unmatched.size) console.log(`   UNMATCHED (${unmatched.size}): ${[...unmatched].slice(0, 10).join(", ")}${unmatched.size > 10 ? " …" : ""}`);
}

// ---- price per kW: ₹ / kW must fall 30 → 40 → 50 kW (E55 rule), with both 50 kW twins below the 40 kW module ----
const PKW = [
  ["30 kW module", 30, summary["30kw"].g10k, "air · 3 fans"],
  ["40 kW module", 40, summary["40kw"].g10k, "air · 3 fans"],
  ["50 kW liquid module", 50, summary["50kw"].g10k, "two coldplates · no fans"],
  ["50 kW air module", 50, summary["50kwa"].g10k, "air · 4 fans"],
].map(([n, kw, cost, note]) => [n, kw, f(cost), f(cost / kw, 2), note]);
console.log("\nPRICE PER kW @10k:");
for (const [n, , cost, pkw, note] of PKW) console.log(`  ${n.padEnd(20)} INR ${String(cost).padStart(7)}  ->  ${pkw}/kW   (${note})`);
{
  const at = (kw) => PKW.filter((r) => r[1] === kw).map((r) => r[3]);
  const falls = Math.max(...at(40)) < Math.min(...at(30)) && Math.max(...at(50)) < Math.min(...at(40));
  console.log(`\nLADDER ${falls ? "OK" : "FAIL"} — ₹/kW ${PKW.map((r) => `${r[0]} ${r[3]}`).join(" · ")} (falls 30 → 40 → 50: ${falls})`);
  if (!falls) process.exitCode = 1;
}

// docs/bom-cost.md
const inr = (x) => Math.round(x).toLocaleString("en-IN");
const verdict = (s) => (s.g10k <= s.red ? `✅ under by ₹${inr(s.red - s.g10k)}` : `⚠️ over by ₹${inr(s.g10k - s.red)}`);
const NAMES = { "30kw": "30 kW module", "40kw": "40 kW module", "50kw": "50 kW liquid module", "50kwa": "50 kW air module" };
const md = [masthead("docs/bom-cost.md"), `
> [!NOTE]
> **Purpose** — what each of the four modules costs to build, from 100 pieces to 10k, how that cost falls per kW from
> 30 to 50 kW, and the levers still open. **Generated by \`calculations/cost/bom-gen.mjs\` on every battery run — do not hand-edit.**
>
> **Basis** — schematic-exact quantities from the built boards plus ONE control card per module (E40), parts-db
> RFQ-target pricing (A7 rev B, ±25 %), and mechanical/assembly lines from the thermal and DFM calculations.
> Line-item CSVs with second sources and the 10k column: \`calculations/out/bom-{sku}.csv\`.

| Volume tier | Electronics | Mechanical | Planning role |
|---|---|---|---|
| 100 pcs | × 1.35 | × 1.15 | prototype / pilot |
| 1k | × 1.00 | × 1.00 | parts-db reference |
| 5k | × 0.88 | × 0.93 | ramp |
| **10k** | **× 0.80 + per-part quotes (p10k)** | **× 0.87** | **planning basis** — customer volume directive 2026-09-05 (≥ 10k units/yr) |

## At a glance — cost at 10k against the red-line

> [!IMPORTANT]
> **China RFQ target (E69f)** — the same BOM at landed China-supplier TARGET prices (freight + ~10 % duty included), by category:
> SiC/JBS/diodes × 0.75 · magnetics, film and electrolytic capacitors × 0.80 · gate/iso ICs, bias modules, relays, protection ×
> 0.85 · passives, connectors, MLCC × 0.90 · PCBs × 0.75 · mechanical × 0.85 · India assembly/EOL × 1.00. These are the prices an
> RFQ must reach for the InfyPower parity comparison — **flagged targets, not quotes**.

| Build | ₹ @10k | ₹ / kW | China RFQ target ₹ @10k | ₹ / kW | Red-line | Stretch | Verdict (India basis) |
|---|---:|---:|---:|---:|---:|---:|---|
${SKUS.map((k) => { const s = summary[k], kw = parseInt(k, 10); return `| ${NAMES[k]} | **${inr(s.g10k)}** | ${inr(s.g10k / kw)} | ${inr(s.g10kCN)} | ${inr(s.g10kCN / kw)} | ${inr(s.red)} | ${inr(s.stretch)} | ${verdict(s)} |`; }).join("\n")}

### Scenario — InfyPower-style 2U construction (E69e, not the design basis)

Same electronics; only the mechanical and assembly lines change to the \`mech2U\` estimates in \`parts-db.mjs\`: heatsink chassis
with the magnetics potted into wells, 4-layer boards at about half today's area, 3 × 80 mm fans. **Prerequisites no gate has proven:**
the PFC choke must lie in a well (today's T79 stacks stand 60–95 mm; 40 kW needs a flat-core choke), the chassis must hold the
70 °C device base at 55 °C ambient, and potting must match the two-face magnetics bond. Numbers are estimates until a mechanical
design and quotes exist.

| Build | Design basis ₹ @10k | 2U scenario ₹ @10k | 2U scenario + China RFQ target |
|---|---:|---:|---:|
${SKUS.filter((k) => summary[k].s2U !== null).map((k) => `| ${NAMES[k]} | ${inr(summary[k].g10k)} | ${inr(summary[k].s2U)} | **${inr(summary[k].s2UCN)}** |`).join("\n")}

## Cost per kW across the family

\`\`\`mermaid
xychart-beta
  title "Build cost per kW at 10k volume (₹)"
  x-axis ["30 kW", "40 kW", "50 kW liquid", "50 kW air"]
  y-axis "₹ / kW" 0 --> ${Math.ceil(Math.max(...PKW.map((r) => r[3])) / 100) * 100 + 100}
  bar [${PKW.map((r) => Math.round(r[3])).join(", ")}]
\`\`\`

| Module | Cooling | ₹ @10k | **₹ / kW** |
|---|---|---:|---:|
${PKW.map(([n, , cost, pkw, note]) => `| ${n} | ${note} | ${inr(cost)} | **${pkw.toFixed(0)}** |`).join("\n")}

Cost per kW falls from 30 to 40 to 50 kW because the control card, the enclosure, the AC entry and the auxiliary supply are
shared content that does not grow with power. The two 50 kW twins share their electronics; the air twin is the cost headline,
and the liquid twin carries the sealed, fan-free reliability case with its cooling loop at the charger level (E42 boundary).
`];
md.push(`## Per-module BOM pages

Each module has its own generated page — cost by schematic section, the parts that make that SKU different, every line item and
its sourcing status.

| Module | ₹ @10k | China target | 1k · 5k · 100 pcs | Lines | Page |
|---|---:|---:|---|---:|---|
${SKUS.map((k) => { const s = summary[k]; return `| ${NAMES[k]} | **${inr(s.g10k)}** | ${inr(s.g10kCN)} | ${inr(s.grand)} · ${inr(s.g5k)} · ${inr(s.g100)} | ${s.nLines} | [bom-${k}.md](bom-${k}.md) |`; }).join("\n")}
`);
for (const sku of SKUS) if (summary[sku].unmatched.length) md.push(`> [!CAUTION]\n> **${NAMES[sku]}: UNMATCHED PARTS (${summary[sku].unmatched.length}) — BOM incomplete:** ${summary[sku].unmatched.join(", ")}\n`);
md.push(`## Red-line closure levers (10k basis)

> [!TIP]
> The generic volume break is already inside the 10k column, so no "5k break" lever is counted twice.

| Lever | Δ 30 kW module | Δ 50 kW module (est.) | Condition |
|---|---:|---:|---|
| ~~Custom gate-bias transformer (E23/ECO-1)~~ **retired** — at 10k the module p10k (₹55) beats the custom set's risk-adjusted saving | 0 | 0 | closed decision, E23 rev B |
| ~~ECO-2a/2b (PV bleeder drivers, reinforced-module volume pricing)~~ **executed — in totals** | 0 | 0 | done at rev D |
| Magnetics winder RFQ below target (choke / transformer 10k prices) | −₹880 | −₹970 | quotes at committed volume |
| AC-DC board 4-layer (control zones only need 4) | −₹240 | −₹260 | layout phase confirms |
| Relay direct RFQ (Hongfa annual frame) | −₹400 | −₹520 | volume agreement |
| Fuse → MCB-coordinated external protection (charger-level) | −₹215 | −₹350 | system integrator accepts |
| ~~**E63:** D6 DM chokes deleted~~ **executed at E68b — in totals** (star-X2 filter, DM margin +32.9 / +30.6 / +28.7 dB) | 0 | 0 | EVT T-08 / T-39 confirm |
| ~~**E63/E64:** drop one bank string per bank~~ **superseded at E68c — in totals** (film-only banks, no bank electrolytic) | 0 | 0 | EVT T-40 confirms |
| **E69:** drive clone — gate-drive transformers on the LLC, opto PFC drivers on aux-winding bias, bridge shunt comparator (approved, not executed) | −₹400 [est] | −₹470 [est] | GDT design, D4 re-wind, new trip evidence |
| **E69:** 900 V half-link aux flyback · 90 A relays · 500 VAC fuses | −₹450 [est] | −₹450 [est] | D4 redesign + midpoint duty; relay carry at 89 % vs the 80 % rule |
| **E63:** gate-bias module second source (the OFAC requalification is already planned, E60) | −₹135 | −₹135 | requalified sample |
| **Sum of open levers** | **−₹2,720** | **−₹3,155** | |

The E63 rows come from the [InfyPower teardown benchmark](benchmark-infypower-teardown.md) gap audit; the deliberate
philosophy premium (protection, sensing, relay class — the E62 estimate also counted the 3-φ LLC, which E67 replaced) is priced there and is **not**
on this table — spending it down is a product decision, not a lever.

Architecture-level options not taken without a directive (each changes the product): LV/HV fixed variants that delete
the S/P matrix (−₹3k+ at 30 kW, collapses the single 150–1000 V SKU), 750 V-class secondary diodes (−₹0.8k, thins the
E11 margin), and reversing the sandwich (−₹1.45k, conflicts with directive E17). Stretch targets remain a management
flag (R12).

## Directive cost impacts (recorded)

| Directive | Cost effect |
|---|---|
| Two-board sandwich (E17) | +1 PCB, studs and harness — ≈ +₹1,450 per module at 30 kW |
| HMI (2 buttons + 2-digit display + driver) | ≈ +₹45 |
| Output blocking diode DOUT replacing K_OUT and the pre-insertion relays (E67, InfyPower practice) | the E12 relay set (≈ ₹800 at 30 kW) removed; DOUT ₹336–496 @10k added |
| CTs replacing shunt + isolated-amplifier phase sensing (E18) | −₹240 net at 30 kW |

${footer("docs/bom-cost.md")}`);
writeFileSync(join(ROOT, "docs", "bom-cost.md"), md.join("\n") + "\n");

// ---- E70: one custom BOM page per module SKU (docs/bom-<sku>.md) — generated, never hand-edited ----
const STATUS_BADGE = { ORDERABLE: "2ea44f", "SECOND-SOURCE": "2ea44f", DIRECT: "1a9fb3", CLASS: "d19a00", CUSTOM: "b8732e", REVIEW: "bc4e9c" };
const STATUS_MEANS = { ORDERABLE: "a specific catalogue part, verified against the rating", "SECOND-SOURCE": "the primary is off-catalogue; a verified equivalent is named",
  DIRECT: "a vendor-direct order code (Talema, Hongfa, Mean Well class)", CLASS: "the rating is the specification; purchasing selects to the spec line",
  CUSTOM: "built to our drawing — see the magnetics page", REVIEW: "a tracked open decision, closed before release" };
const SECTION_ORDER = Object.keys(SECTION_TITLE);
const cell = (t) => String(t).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const trim = (t, n = 110) => { const c = cell(t.replace(/\s*\[[^\]]*\]\s*$/, "")); return c.length <= n ? c : `${c.slice(0, c.lastIndexOf(" ", n))} …`; };
const PAGE = { "30kw": "30 kW", "40kw": "40 kW", "50kw": "50 kW liquid", "50kwa": "50 kW air" };
const KW = { "30kw": 30, "40kw": 40, "50kw": 50, "50kwa": 50 };
for (const sku of SKUS) {
  const s = summary[sku], d = detail[sku], kw = KW[sku], path = `docs/bom-${sku}.md`;
  const secs = Object.entries(d.sec).sort(([a], [b]) => (SECTION_ORDER.indexOf(a) + 1 || 99) - (SECTION_ORDER.indexOf(b) + 1 || 99));
  const cn = (L) => { const r = d.parts.get(L.key); return L.qty * r.u10 * r.cn; };
  const secRows = secs.map(([k, S]) => ({ k, title: SECTION_TITLE[k] ?? "Unassigned (no sheet section)", parts: S.parts, lines: S.lines.size, c10: S.cost10, cn: [...S.lines.values()].reduce((a, L) => a + cn(L), 0), S }));
  const mech10 = d.mech.reduce((a, [, q, pr]) => a + q * pr * 0.87, 0), mechCN = d.mech.reduce((a, [dd, q, pr]) => a + q * pr * 0.87 * cnMech(dd), 0);
  const total10 = secRows.reduce((a, r) => a + r.c10, 0) + mech10;
  const board = (b) => secRows.filter((r) => r.k.startsWith(`${b}:`)).reduce((a, r) => a + r.parts, 0);
  const counts = {}; for (const r of d.rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const review = d.rows.filter((r) => r.status === "REVIEW");
  const custom = d.rows.filter((r) => r.status === "CUSTOM");
  const ov = skuOverrides[sku] ?? {};
  const ovRows = [...new Map(Object.entries(ov).filter(([, o]) => o.mpn || o.price1k).map(([ref, o]) => {
    const r = d.rows.find((x) => x.refs.includes(ref));
    return [o.mpn ?? ref, { mpn: o.mpn ?? r?.mpn ?? ref, refs: Object.entries(ov).filter(([, x]) => (x.mpn ?? "") === (o.mpn ?? "")).map(([k]) => k), u10: r?.u10, note: o.note ?? o.desc ?? r?.desc ?? "" }];
  })).values()];
  // per-designator override records (T1A / T1B …) are one part on the page
  const merged = [...d.rows.reduce((m, r) => { const k = `${r.mpn}|${r.u10}`; const x = m.get(k); if (x) { x.qty += r.qty; x.ext10 += r.ext10; } else m.set(k, { ...r }); return m; }, new Map()).values()];
  const top = merged.sort((a, b) => b.ext10 - a.ext10).slice(0, 15);
  const pie = [...secRows.map((r) => [r.title, r.c10]), ["Mechanics, thermal and assembly", mech10]].sort((a, b) => b[1] - a[1]);
  const pg = [masthead(path), `
> [!NOTE]
> **Purpose** — the complete bill of materials of the **${PAGE[sku]} module**: what it costs, where the money goes by schematic
> section, the parts that make this SKU different, and every line item with its sourcing status. **Generated by
> \`calculations/cost/bom-gen.mjs\` on every battery run — do not hand-edit.** Machine-readable lines: \`calculations/out/bom-${sku}.csv\`.

## At a glance

| | |
|---|---|
| **Build cost @10k** (India basis) | **₹${inr(s.g10k)}** · ₹${inr(s.g10k / kw)} / kW |
| **China RFQ target @10k** (E69f) | **₹${inr(s.g10kCN)}** · ₹${inr(s.g10kCN / kw)} / kW — landed targets, not quotes |
${s.s2U !== null ? `| **2U construction scenario** (E69e) | ₹${inr(s.s2U)} · China target ₹${inr(s.s2UCN)} — flagged estimate, not the design basis |\n` : ""}| **1k · 5k · 100 pcs** | ₹${inr(s.grand)} · ₹${inr(s.g5k)} · ₹${inr(s.g100)} |
| **Red-line / stretch** | ₹${inr(s.red)} / ₹${inr(s.stretch)} → ${verdict(s)} |
| **BOM lines · placed parts** | ${s.nLines} lines · ${inr(board("acdc") + board("dcdc") + board("card"))} parts (AC-DC ${inr(board("acdc"))} · DC-DC ${inr(board("dcdc"))} · control card ${inr(board("card"))}) |
| **Built to our drawings** | ${custom.length} custom lines — specifications on the [${PAGE[sku]} magnetics page](magnetics-${sku}.md) |
| **Open sourcing decisions** | ${review.length} REVIEW line${review.length === 1 ? "" : "s"} |

## Where the money goes

\`\`\`mermaid
pie showData title ${PAGE[sku]} module — ₹ @10k by section
${pie.filter(([, v]) => v >= 1).map(([t, v]) => `  "${t}" : ${Math.round(v)}`).join("\n")}
\`\`\`

| Section (schematic sheet) | Parts | Lines | ₹ @10k | Share | China target ₹ |
|---|---:|---:|---:|---:|---:|
${secRows.map((r) => `| ${r.title} | ${r.parts} | ${r.lines} | ${inr(r.c10)} | ${f(100 * r.c10 / total10, 1)} % | ${inr(r.cn)} |`).join("\n")}
| Mechanics, thermal and assembly | — | ${d.mech.length} | ${inr(mech10)} | ${f(100 * mech10 / total10, 1)} % | ${inr(mechCN)} |
| **Module** | | | **${inr(total10)}** | 100 % | **${inr(secRows.reduce((a, r) => a + r.cn, 0) + mechCN)}** |

> [!TIP]
> Sections follow the release sheets, so a line here is found on the sheet of the same name. The small difference against the
> headline figure is the gate-bias transformer set, which is priced at 1k only.

## Top cost drivers

| # | Part | What it is | Qty | ₹ / unit @10k | ₹ @10k | China target ₹ | Status |
|---:|---|---|---:|---:|---:|---:|---|
${top.map((r, i) => `| ${i + 1} | \`${r.mpn}\` | ${trim(r.desc, 90)} | ${r.qty} | ${inr(r.u10)} | **${inr(r.ext10)}** | ${inr(r.ext10 * r.cn)} | ${r.status} |`).join("\n")}

## What is specific to this SKU

${ovRows.length ? `These lines replace the shared-cell default on the ${PAGE[sku]} module (\`skuOverrides\` in \`parts-db.mjs\`); everything else is the common design.

| Part | Where | ₹ / unit @10k | Why this part |
|---|---|---:|---|
${ovRows.map((o) => `| \`${o.mpn}\` | ${cell(o.refs.slice(0, 6).join(" · "))}${o.refs.length > 6 ? " …" : ""} | ${o.u10 != null ? inr(o.u10) : "—"} | ${trim(o.note, 160)} |`).join("\n")}` : "The 30 kW module is the reference build: every line is the shared-cell default, apart from the per-SKU values the cells take as parameters."}

## Line items by section

${secRows.map((r) => {
  const lines = [...[...r.S.lines.values()].reduce((m, L) => { const p = d.parts.get(L.key), k = `${p.mpn}|${p.u10}`;
    const x = m.get(k); if (x) { x.L.qty += L.qty; x.L.refs.push(...L.refs); } else m.set(k, { L: { ...L, refs: [...L.refs] }, r: p }); return m; }, new Map()).values()]
    .sort((a, b) => b.L.qty * b.r.u10 - a.L.qty * a.r.u10);
  return `<details><summary><b>${r.title}</b> — ₹${inr(r.c10)} @10k · ${r.parts} parts · ${r.lines} lines</summary>

| Part | What it is | Refs | Qty | ₹ / unit @10k | ₹ @10k | LCSC | Status |
|---|---|---|---:|---:|---:|---|---|
${lines.map(({ L, r: p }) => `| \`${p.mpn}\` | ${trim(p.desc)} | ${cell(L.refs.slice(0, 8).join(" "))}${L.qty > Math.min(8, L.refs.length) ? " …" : ""} | ${L.qty} | ${inr(p.u10)} | ${inr(L.qty * p.u10)} | ${p.lcsc || "—"} | ${p.status} |`).join("\n")}

</details>`;
}).join("\n\n")}

## Mechanics, thermal and assembly

| Item | Qty | ₹ @1k | ₹ @10k | China target ₹ |
|---|---:|---:|---:|---:|
${d.mech.map(([dd, q, pr]) => `| ${trim(dd, 140)} | ${q} | ${inr(q * pr)} | ${inr(q * pr * 0.87)} | ${inr(q * pr * 0.87 * cnMech(dd))} |`).join("\n")}
| **Total** | | **${inr(d.mech.reduce((a, [, q, pr]) => a + q * pr, 0))}** | **${inr(mech10)}** | **${inr(mechCN)}** |
${d.mech2U ? `
<details><summary><b>2U construction scenario lines</b> (E69e — estimate, not the design basis)</summary>

| Item | Qty | ₹ @1k | ₹ @10k |
|---|---:|---:|---:|
${d.mech2U.map(([dd, q, pr]) => `| ${trim(dd, 140)} | ${q} | ${inr(q * pr)} | ${inr(q * pr * 0.87)} |`).join("\n")}

</details>
` : ""}
## Sourcing status

| Status | Lines | Meaning |
|---|---:|---|
${Object.keys(STATUS_BADGE).filter((k) => counts[k]).map((k) => `| ![${k}](https://img.shields.io/badge/-${k.replace(/-/g, "--")}-${STATUS_BADGE[k]}?style=flat-square) | ${counts[k]} | ${STATUS_MEANS[k]} |`).join("\n")}
${review.length ? `
**Open REVIEW lines:** ${review.map((r) => `\`${r.mpn}\``).join(" · ")} — each carries its action note in \`lcsc-map.mjs\`.` : ""}

Method, price basis and the maturity gate: [BOM guide](bom-guide.md) · family roll-up and cost per kW: [BOM & cost](bom-cost.md).

${footer(path)}`];
  writeFileSync(join(ROOT, path), pg.join("\n") + "\n");
}
console.log(`→ docs/bom-{${SKUS.join(",")}}.md (per-SKU pages)`);

console.log(`\n→ docs/bom-cost.md, calculations/out/bom-*.csv${anyUnmatched ? "  (FIX UNMATCHED!)" : "  (all components matched ✓)"}`);
