#!/usr/bin/env node
// mtbf-budget.mjs — E64 standing gate: a parts-count reliability PREDICTION for every module SKU,
// computed from the generated BOM CSVs (so it moves when the BOM moves, and only then).
//
// Method: Telcordia SR-332-class parts-count, Method I style — sum a base failure rate (FIT,
// failures per 1e9 h) per part class over the BOM quantities. Basis declared, not hidden:
// 40 °C module internal ambient (fan inlet +55 °C is the CORNER, not the life-weighted mean),
// ground fixed controlled-ish environment, quality level II. The result is a PREDICTION for
// comparison and driver-ranking, not a measured MTBF — the benchmark's "MTBF 500 kh" claim is the
// same kind of number with an undisclosed basis, and the page says so.
//
// Wear-out items (fans L10, electrolytic endurance, relay cycles) are NOT random failures and are
// reported separately — mixing them into an MTBF is how datasheet numbers get inflated.
//
// Gate: recomputed FIT totals must match the REGISTERED table (±1 %) — any BOM change that moves
// the reliability picture must re-register consciously. Run: node calculations/reliability/mtbf-budget.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// FIT per unit at 40 °C, quality II — SR-332-class base rates, conservative side of published tables.
const CLASSES = [
  { name: "SiC power die",        fit: 20,  m: (r) => /SiC (MOSFET|JBS|FET)|SiC diode/i.test(r.desc) },
  { name: "Si power semi",        fit: 10,  m: (r) => /MOSFET|IGBT|rectifier|zener|TVS diode|diode/i.test(r.desc) && !/SiC/i.test(r.desc) && r.cat !== "protection" && !/µF|nF|pF/.test(r.desc) },   // E68: a capacitor whose text says "rectifier-side" is not a semiconductor
  { name: "MCU",                  fit: 15,  m: (r) => /MCU|Cortex/i.test(r.desc) },
  { name: "iso driver / iso amp", fit: 10,  m: (r) => /iso (gate driver|voltage-sense|15→|CAN)|isolator|AMC|NSI/i.test(r.desc) },
  { name: "bias / iso module",    fit: 15,  m: (r) => /module/i.test(r.desc) && /iso|bias/i.test(r.desc) },
  { name: "analog / logic IC",    fit: 8,   m: (r) => /amp|controller|driver|logic|NOR|shift|reference|comparator|LDO|buck|watchdog|opto/i.test(r.desc) },
  { name: "electrolytic",         fit: 8,   m: (r) => /µF.*snap|450 V snap|electrolytic/i.test(r.desc) },
  { name: "film capacitor",       fit: 2,   m: (r) => /film|PP |X1 |Y1 |pulse/i.test(r.desc) && /F\b|µF|nF/.test(r.desc) },
  { name: "MLCC / chip C",        fit: 0.35,m: (r) => /MLCC|C0G|X7R|X5R|pF|nF/i.test(r.desc) },
  { name: "chip / power R",       fit: 0.5, m: (r) => /Ω|resistor|shunt|ceramic|wirewound/i.test(r.desc) },
  { name: "relay / contactor",    fit: 25,  m: (r) => /relay|contactor/i.test(r.desc) },
  { name: "magnetic (wound)",     fit: 4,   m: (r) => /choke|transformer|inductor|CT\b|current transformer/i.test(r.desc) },
  { name: "protection (MOV/GDT/fuse)", fit: 3, m: (r) => /MOV|GDT|discharge tube|fuse/i.test(r.desc) },
  { name: "connector / stud",     fit: 3,   m: (r) => /header|connector|stud|tab|harness/i.test(r.desc) },
  { name: "HMI / misc",           fit: 2,   m: () => true },
];
const PCB_FIT = 5;      // per board (2 power boards + 1 card)
const CARD_CONN_FIT = 6; // 88-way mated pair, vibration-relevant

// REGISTERED at E68c (single dies E68a · star-X2 filter E68b · film-only banks E68c, and the film caps no longer classed as Si
// semis — "rectifier-side" in a capacitor's text had put the E67 bank films at 10 FIT each). E68a was 2661/2809/2875/2887 FIT,
// E67 2757/2953/2999/3259, E64 3081/3297/3396/3552 — recomputed every run, ±1 % drift fails.
const REGISTERED = { "30kw": { fit: 2613, mtbfKh: 383 }, "40kw": { fit: 2753, mtbfKh: 363 }, "50kw": { fit: 2791, mtbfKh: 358 }, "50kwa": { fit: 2803, mtbfKh: 357 } };
// E55 products = N modules. E66: the 150 kW CSU adder (card-class assembly + DIN supply + carrier, 350 FIT) is deleted.
const PRODUCTS = { "100kw (2×50L)": { n: 2, base: "50kw", csu: 0 }, "100kw air (2×50a)": { n: 2, base: "50kwa", csu: 0 },
                   "150kw (3×50L)": { n: 3, base: "50kw", csu: 0 }, "150kw air (3×50a)": { n: 3, base: "50kwa", csu: 0 } };
const REG_PRODUCTS = { "100kw (2×50L)": 179, "100kw air (2×50a)": 178, "150kw (3×50L)": 119, "150kw air (3×50a)": 119 };   // E68c

let fails = 0;
const ck = (name, ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${name} — ${msg}`); if (!ok) fails++; };
const f0 = (x) => Math.round(x);

console.log("=== MTBF BUDGET (E64) — parts-count prediction, 40 °C basis, wear-out reported separately ===");
export const results = {};
for (const sku of ["30kw", "40kw", "50kw", "50kwa"]) {
  const rows = readFileSync(join(ROOT, `calculations/out/bom-${sku}.csv`), "utf8").trim().split("\n").slice(1)
    .map((l) => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/))
    .map((c) => ({ mpn: c[0], status: c[2], desc: (c[4] ?? "").replace(/^"|"$/g, ""), qty: Number(c[7]) || 0, cat: c[2] }))
    .filter((r) => !/^TOTAL|^BIAS-XFMR/.test(r.mpn) && r.qty > 0);
  const byClass = {};
  let fit = 3 * PCB_FIT + CARD_CONN_FIT;
  byClass["PCB + card slot"] = 3 * PCB_FIT + CARD_CONN_FIT;
  for (const r of rows) {
    if (r.status === "MECH") continue;         // enclosure/fans: fans are wear-out, metal does not fail randomly
    const cls = CLASSES.find((c) => c.m(r));
    const add = cls.fit * r.qty;
    byClass[cls.name] = (byClass[cls.name] ?? 0) + add;
    fit += add;
  }
  const mtbfH = 1e9 / fit, mtbfKh = mtbfH / 1000;
  results[sku] = { fit: f0(fit), mtbfKh: f0(mtbfKh), byClass };
  const reg = REGISTERED[sku];
  ck(`${sku} prediction vs registered`, Math.abs(fit - reg.fit) / reg.fit < 0.01 && Math.abs(mtbfKh - reg.mtbfKh) < 2,
    `ΣFIT ${f0(fit)} → MTBF ≈ ${f0(mtbfKh)} kh (registered ${reg.fit} → ${reg.mtbfKh} kh)`);
  const top = Object.entries(byClass).sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([k, v]) => `${k} ${f0(v)} (${f0((100 * v) / fit)}%)`).join(" · ");
  console.log(`        drivers: ${top}`);
}
for (const [name, p] of Object.entries(PRODUCTS)) {
  const fit = p.n * results[p.base].fit + p.csu;
  const kh = f0(1e9 / fit / 1000);
  ck(`${name} product roll-up`, Math.abs(kh - REG_PRODUCTS[name]) <= 2,
    `ΣFIT ${f0(fit)} → ≈ ${kh} kh to the FIRST random failure of the set (registered ${REG_PRODUCTS[name]}) — a module failure degrades the product to n−1 power (50 % / 67 %), it does not take it dark; availability ≠ series MTBF`);
}
console.log(`  wear-out (separate clocks, not in the MTBF): fans L10 ≥70 kh @40 °C (dual-ball spec, E52) — the
  first scheduled maintenance item; DC-link/bank electrolytics ≥ ~8 y at the E29 ripple/endurance basis and
  55 °C-corner duty; HV relays are cycle-limited (session-rated, mirror-checked at every operation, E30);
  acrylic coating re-inspection at service. System view: 100/150 kW products degrade to N−1, never to zero.
  Benchmark context: the REG1K0135A2 family publishes "MTBF 500 kh" with no stated basis [D] — a 25 °C
  ground-benign Telcordia figure is routinely 3–5× a 40 °C one on identical hardware; the honest comparison is
  method-for-method at EVT/field, not number-for-number.`);
console.log(fails ? `\n${fails} MTBF BUDGET FAILURE(S)` : "\nMTBF BUDGET CONSISTENT — prediction matches the registered table; drivers ranked");
process.exit(fails ? 1 : 0);
