#!/usr/bin/env node
// mtbf-budget.mjs — standing gate: a parts-count reliability PREDICTION for every module SKU,
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
// Whole-word matching, tried first on the part's own noun phrase (the description before its first " (", " —", ";"
// or ": "). Substring matching over the whole description misfiles parts: "density" matches inside NSI, "InfyPower"
// inside nF and "contact" inside CT, which files PFC chokes and line CTs as isolators, the resonant inductor and aux
// transformer as MLCCs, the gate-bias modules as Si semis and the TVS clamps as logic ICs.
const CLASSES = [
  { name: "SiC power die",        fit: 20,  m: (d) => /\bSiC (MOSFET|JBS|FET|Schottky)\b|\bSiC diode\b/.test(d) },
  { name: "magnetic (wound)",     fit: 4,   m: (d) => /\b(choke|transformer|inductor|CT|current transformer)\b/i.test(d) && !/^\s*[\d.]+\s*[kM]?Ω/.test(d) },
  { name: "bias / iso module",    fit: 15,  m: (d) => /\bmodule\b/i.test(d) && /\b(iso|bias)\b|gate-bias/i.test(d) },
  { name: "Si power semi",        fit: 10,  m: (d) => /\b(MOSFET|IGBT|rectifiers?|zener|TVS|diodes?|NPN|PNP)\b/i.test(d) && !/\bSiC\b/.test(d) && !/\b(µF|nF|pF)\b/.test(d) },
  { name: "MCU",                  fit: 15,  m: (d) => /\b(MCU|Cortex)\b/.test(d) },
  { name: "iso driver / iso amp", fit: 10,  m: (d) => /\biso (gate driver|voltage-sense|15→|CAN)|\bisolator\b|\bAMC\d|\bNSI\d/i.test(d) },
  { name: "MLCC / chip C",        fit: 0.35,m: (d) => /\b(MLCC|C0G|X7R|X5R)\b|\b[\d.]+\s*(nF|pF|µF)\s+(0402|0603|0805|1206|1210)\b/.test(d) },
  { name: "analog / logic IC",    fit: 8,   m: (d) => /\b(amp|amplifier|controller|driver|logic|NOR|shift register|reference|comparator|LDO|buck|watchdog|opto)\b|\binput (AND|OR|NAND|NOR)\b/i.test(d) },
  { name: "relay / contactor",    fit: 25,  m: (d) => /\b(relay|contactor)\b/i.test(d) },
  { name: "electrolytic",         fit: 8,   m: (d) => /µF.*\bsnap|\belectrolytic\b/i.test(d) || (+(d.match(/^\s*(\d+)\s*µF\s+\d+\s*V\b/)?.[1] ?? 0) >= 47 && !/\b(film|PP|MLCC|X7R|X5R|C0G)\b/.test(d)) },
  { name: "film capacitor",       fit: 2,   m: (d) => /\b(film|PP|X1|X2|Y1|pulse)\b/.test(d) && /\b[\d.]+\s*(µF|nF|pF)\b/.test(d) },
  { name: "chip / power R",       fit: 0.5, m: (d) => /^\s*[\d.]+\s*[kM]?(Ω|Ohm)|^\s*(0402|0603|0805|1206|2512)\b|\b(resistor|shunt|wirewound|pull-up|pull-down|divider (top|bottom)|gate R)\b/i.test(d) },
  { name: "protection (MOV/GDT/fuse)", fit: 3, m: (d) => /\b(MOV|GDT|discharge tube|fuse)\b/i.test(d) },
  { name: "connector / stud",     fit: 3,   m: (d) => /\b(header|connector|stud|harness|\d+-way)\b/i.test(d) },
  { name: "HMI / misc",           fit: 2,   m: () => true },
];
const classify = (desc) => {
  const head = desc.split(/ \(| —|;|: /)[0];
  return CLASSES.find((c) => c.name !== "HMI / misc" && c.m(head)) ?? CLASSES.find((c) => c.m(desc));
};
const PCB_FIT = 5;      // per board (2 power boards + 1 card)
const CARD_CONN_FIT = 6; // 88-way mated pair, vibration-relevant

// The REGISTERED table is the FIT picture the platform has consciously accepted. The gate recomputes it from the generated
// BOM CSVs on every run and fails on ±1 % drift, so a BOM change that moves the reliability picture has to be re-registered
// on purpose instead of sliding. Read it knowing what a parts-count model can and cannot see: it prices part COUNT, never
// part STRESS. Adding cheap chip parts (ADC-pin capacitors, iso-amp output resistors, output bleeders at 0.35–0.5 FIT each)
// raises FIT even when they make the module safer, and buying a part more derated — a link can at 87 % of rating rather
// than 98 %, a balance element at 46 % rather than 65 %, a Vienna snubber at 95 % rather than 142 % — does not show up here
// at all. "More parts, each less stressed" is the honest reading of a rising total, not a regression.
const REGISTERED = { "30kw": { fit: 2483, mtbfKh: 403 }, "40kw": { fit: 2601, mtbfKh: 385 }, "50kw": { fit: 2710, mtbfKh: 369 }, "50kwa": { fit: 2724, mtbfKh: 367 } };
let fails = 0;
const ck = (name, ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${name} — ${msg}`); if (!ok) fails++; };
const f0 = (x) => Math.round(x);

console.log("=== MTBF BUDGET — parts-count prediction, 40 °C basis, wear-out reported separately ===");
export const results = {};
for (const sku of ["30kw", "40kw", "50kw", "50kwa"]) {
  const rows = readFileSync(join(ROOT, `calculations/out/bom-${sku}.csv`), "utf8").trim().split("\n").slice(1)
    .map((l) => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/))
    .map((c) => ({ mpn: c[0], status: c[2], desc: (c[4] ?? "").replace(/^"|"$/g, ""), qty: Number(c[7]) || 0 }))
    .filter((r) => !/^TOTAL|^BIAS-XFMR/.test(r.mpn) && r.qty > 0);
  const byClass = {};
  let fit = 3 * PCB_FIT + CARD_CONN_FIT;
  byClass["PCB + card slot"] = 3 * PCB_FIT + CARD_CONN_FIT;
  for (const r of rows) {
    if (r.status === "MECH") continue;         // enclosure/fans: fans are wear-out, metal does not fail randomly
    const cls = classify(r.desc);
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
console.log(`  wear-out (separate clocks, not in the MTBF): fans L10 ≥70 kh @40 °C (dual-ball spec) — the
  first scheduled maintenance item; DC-link electrolytics ≥ ~8 y at the RFQ ripple/endurance basis and
  55 °C-corner duty; HV relays are cycle-limited (session-rated, mirror-checked at every operation);
  acrylic coating re-inspection at service.
  Benchmark context: the REG1K0135A2 family publishes "MTBF 500 kh" with no stated basis [D] — a 25 °C
  ground-benign Telcordia figure is routinely 3–5× a 40 °C one on identical hardware; the honest comparison is
  method-for-method at EVT/field, not number-for-number.`);
console.log(fails ? `\n${fails} MTBF BUDGET FAILURE(S)` : "\nMTBF BUDGET CONSISTENT — prediction matches the registered table; drivers ranked");
process.exit(fails ? 1 : 0);
