// bom-gen.mjs — BOM generator (§49-7/21/22, §43): reads built circuit JSON of all six boards,
// classifies every component via parts-db patterns, emits per-board BOM CSVs, per-module costed
// roll-ups at 100/1k/5k/10k pcs, a second-source BOM, and docs/bom-cost.md.
// rev D (2026-09-05): 10k tier added on the customer's ≥10k units/yr directive (A7 rev B) —
// heuristic ×0.80 electronics / ×0.87 mech off the 1k basis, overridden per-part where a
// volume-specific quote basis exists (`p10k` in parts-db: bias/iso modules, PV drivers).
// UNMATCHED components are listed loudly — the BOM is not "perfect" until that list is empty.
// Run (after tsci builds): node calculations/cost/bom-gen.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DB, skuOverrides, mechLines, biasCommon } from "./parts-db.mjs";
import { lcscFor, lcscForPart, lcscSummary, LCSC_BY_VALUE } from "./lcsc-map.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const f = (x, d = 0) => Number(x.toFixed(d));

const SKUS = ["30kw", "60kw", "120kw"];
const TARGETS = { "30kw": [25000, 22000], "60kw": [42000, 36000], "120kw": [78000, 68000] };
const CAT = (mpn, desc) =>
  /SiC|MOSFET|JBS|FET 1200|650 V 4 A/.test(desc) ? "semiconductors"
    : /driver|iso |LDO|MCU|shift|ULN|flyback controller|transceiver|amplifier/.test(desc) ? "drive+control ICs"
    : /module/.test(desc) ? "bias/iso modules"
    : /choke|transformer|trim|CT /i.test(desc) ? "magnetics"
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

const summary = {};
let anyUnmatched = false;
for (const sku of SKUS) {
  const parts = new Map();
  const unmatched = new Set();
  for (const side of ["acdc", "dcdc"]) {
    const p = join(ROOT, "dist", "boards", sku, side, "circuit.json");
    if (!existsSync(p)) { console.log(`!! missing build: ${sku}/${side} — run tsci build first`); continue; }
    const j = JSON.parse(readFileSync(p, "utf8"));
    for (const c of j.filter(e => e.type === "source_component")) {
      const name = c.name;
      if (/^NC_/.test(name)) continue;
      const rule = DB.find(r => r.m.test(name));
      if (!rule) { unmatched.add(`${side}:${name} (${c.ftype ?? "?"})`); anyUnmatched = true; continue; }
      const ov = (skuOverrides[sku] ?? {})[name] ?? {};
      // Split a generic family into per-value lines where a real catalogue part exists for that
      // value (LCSC_BY_VALUE) — "R-small" is two different orderable parts at 10k and at 1k.
      const val = valueOf(c);
      const vKey = LCSC_BY_VALUE[`${ov.mpn ?? rule.mpn}|${val}`] ? `#${val}` : "";
      const key = ((ov.price1k || ov.mpn) ? `${ov.mpn ?? rule.mpn}@${name}` : rule.mpn) + vKey;
      const resolved = lcscForPart(ov.mpn ?? rule.mpn, val);
      const rec = parts.get(key) ?? { mpn: resolved.mpn ?? ov.mpn ?? rule.mpn, val, mfr: rule.mfr, desc: rule.desc + (ov.note ? ` [${ov.note}]` : ""), alt: rule.alt, qty: 0, price1k: ov.price1k ?? rule.price1k, p10k: ov.p10k ?? rule.p10k, sides: new Set(), refs: [] };
      rec.qty += ov.qtyMul ?? 1;
      rec.sides.add(side);
      if (rec.refs.length < 12) rec.refs.push(name);
      parts.set(key, rec);
    }
  }
  const rows = [...parts.values()].sort((a, b) => b.qty * b.price1k - a.qty * a.price1k);
  const csv = [["mpn", "lcsc", "lcsc_status", "manufacturer", "description", "second_source", "boards", "qty", "unit_100", "unit_1k", "unit_5k", "unit_10k", "ext_1k_INR", "ext_10k_INR", "sample_refs"]];
  let totE = 0, totE10 = 0;
  const cats = {};
  for (const r of rows) {
    const u10 = r.p10k ?? f(r.price1k * 0.80, 1);
    const ext = r.qty * r.price1k, ext10 = r.qty * u10;
    totE += ext; totE10 += ext10;
    const cat = CAT(r.mpn, r.desc);
    cats[cat] = (cats[cat] ?? 0) + ext;
    const lc = lcscForPart(r.mpn, r.val ?? "");
    csv.push([r.mpn, lc.lcsc ?? "", lc.status, r.mfr, `"${r.desc}${r.val && LCSC_BY_VALUE[`${r.mpn}|${r.val}`] ? ` ${r.val}` : ""}"`, `"${r.alt}"`, [...r.sides].join("+"), r.qty, f(r.price1k * 1.35, 1), r.price1k, f(r.price1k * 0.88, 1), u10, f(ext), f(ext10), r.refs.join(" ")]);
  }
  csv.push(["BIAS-XFMR-SET", "", "CUSTOM", "custom", `"${biasCommon.desc}"`, `"—"`, "acdc+dcdc", 2, 0, biasCommon.price1k, 0, 0, 2 * biasCommon.price1k, 0, ""]);
  totE += 2 * biasCommon.price1k;
  cats["bias/iso modules"] = (cats["bias/iso modules"] ?? 0) + 2 * biasCommon.price1k;
  let mechTot = 0;
  for (const [d, q, pr] of mechLines[sku]) { const e = q * pr; mechTot += e; csv.push([`MECH`, "", "MECH", "—", `"${d}"`, `"—"`, "module", q, f(pr * 1.15, 0), pr, f(pr * 0.93, 0), f(pr * 0.87, 0), f(e), f(e * 0.87), ""]); }
  cats["mechanical/assembly"] = mechTot;
  const grand = totE + mechTot;
  const grand10 = totE10 + mechTot * 0.87;
  csv.push(["TOTAL_ELECTRONIC", "", "", "", "", "", "", "", "", "", "", "", f(totE), f(totE10), ""]);
  csv.push(["TOTAL_MODULE", "", "", "", "", "", "", "", "", "", "", "", f(grand), f(grand10), ""]);
  writeFileSync(join(ROOT, "calculations", "out", `bom-${sku}.csv`), csv.map(r => r.join(",")).join("\n") + "\n");
  const [red, stretch] = TARGETS[sku];
  summary[sku] = { grand, g100: f(totE * 1.35 + mechTot * 1.15), g5k: f(totE * 0.88 + mechTot * 0.93), g10k: f(grand10), red, stretch, cats, nLines: rows.length, unmatched: [...unmatched] };
  console.log(`${sku}: ${rows.length} BOM lines, electronics ₹${f(totE)}, module ₹${f(grand)} @1k / ₹${f(grand10)} @10k (red ₹${red}) ${grand10 <= red ? "10k ≤ RED ✓" : "10k OVER by ₹" + f(grand10 - red)}`);
  if (unmatched.size) console.log(`   UNMATCHED (${unmatched.size}): ${[...unmatched].slice(0, 10).join(", ")}${unmatched.size > 10 ? " …" : ""}`);
}

// docs/bom-cost.md
const md = [`# BOM & Cost Roll-up (generated by calculations/cost/bom-gen.mjs — do not hand-edit)

Basis: schematic-exact quantities from the six built boards (two-board sandwich per module, E17),
parts-db RFQ-target pricing (A7 rev B, ±25%), mechanical/assembly lines from thermal/DFM calcs.
Price breaks: 100 pc = ×1.35 electronics / ×1.15 mech; 5000 pc = ×0.88 / ×0.93;
**10k pc = ×0.80 / ×0.87 with per-part quote-based overrides (p10k)** — customer volume directive
2026-09-05 (≥10k units/yr): the 10k column is the planning basis; heuristics resolve at RFQ round 1.
Full line-item CSVs: \`calculations/out/bom-{sku}.csv\` (second-source + 10k columns included).
`];
for (const sku of SKUS) {
  const s = summary[sku];
  md.push(`## ${sku.toUpperCase()} — module COGS **₹${s.g10k} @10k** (1k ₹${f(s.grand)}, 5k ₹${s.g5k}, 100 pc ₹${s.g100}) vs red-line ₹${s.red} / stretch ₹${s.stretch} → **${s.g10k <= s.red ? `@10k UNDER red-line by ₹${f(s.red - s.g10k)}` : `@10k OVER red-line by ₹${f(s.g10k - s.red)}`}${s.g10k <= s.stretch ? ", meets stretch" : ""}**\n`);
  md.push(`| Category | ₹ @1k | share |`, `|---|---|---|`);
  const tot = s.grand;
  for (const [c, v] of Object.entries(s.cats).sort((a, b) => b[1] - a[1])) md.push(`| ${c} | ${f(v)} | ${f(100 * v / tot, 1)}% |`);
  if (s.unmatched.length) md.push(`\n**UNMATCHED PARTS (${s.unmatched.length}) — BOM incomplete:** ${s.unmatched.join(", ")}`);
  md.push("");
}
md.push(`## Red-line closure levers (R12 rev D — 10k basis; the generic volume break is ALREADY in the 10k column, so the old "5k-break" lever is retired to avoid double-counting)

| Lever | Δ @30 kW | Δ @60 kW | Δ @120 kW | Condition |
|---|---|---|---|---|
| ~~Custom gate-bias transformer (E23/ECO-1)~~ **RETIRED** — at 10k volume the module p10k (₹55) beats the custom set's risk-adjusted saving | 0 | 0 | 0 | closed decision, E23 rev B |
| ~~ECO-2a/2b (PV bleeder drivers, reinforced-module volume pricing)~~ **EXECUTED — in totals** | 0 | 0 | 0 | done rev D |
| Magnetics winder RFQ below target (choke ₹828→640, xfmr ₹544→440 at 10k-basis prices) | −₹880 | −₹1,760 | −₹3,520 | quotes at committed volume |
| AC-DC board 4-layer (control zones only need 4) | −₹240 | −₹345 | −₹590 | layout phase confirms |
| Relay direct RFQ (Hongfa annual frame) | −₹400 | −₹720 | −₹1,520 | volume agreement |
| Fuse→MCB-coordinated external (charger-level absorbs) | −₹215 | −₹505 | −₹1,150 | system integrator accepts |
| 120 kW partial magnetics de-commonization (12→6 larger chokes; 12→6 dual-section xfmrs) | — | — | −₹4,880 | Phase-12 rev; breaks family p/n, keep only if 120 kW volume justifies |
| **Sum of levers** | **−₹1,735** | **−₹3,330** | **−₹11,660** | |

Architecture-level options NOT taken without a directive (they change the product): LV/HV fixed
variants deleting the S/P matrix (−₹3k+ @30 kW, collapses the 150–1000 V single-SKU spec),
750 V-class secondary diodes (−₹0.8k, thins E11 margin), sandwich reversal (−₹1.45k,
**conflicts with directive E17**). **Stretch targets remain a management flag (R12)** — see the
10k headline above for where the red-lines actually stand now.
`);
md.push(`## Directive cost impacts (recorded)
- Two-board sandwich (E17): +1 PCB, interconnect studs/harness — ≈ +₹1,450/-module @30 kW vs single-board baseline.
- HMI (2 buttons + 2-digit display + driver parts): ≈ +₹45.
- Pre-insertion relays + K_OUT (E12, safety-mandatory): ≈ +₹800 @30 kW.
- CTs replacing shunt+iso-amp phase sensing (E18): −₹240 net @30 kW.
`);
writeFileSync(join(ROOT, "docs", "bom-cost.md"), md.join("\n") + "\n");
console.log(`\n→ docs/bom-cost.md, calculations/out/bom-*.csv${anyUnmatched ? "  (FIX UNMATCHED!)" : "  (all components matched ✓)"}`);
