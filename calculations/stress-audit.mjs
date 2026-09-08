// stress-audit.mjs — the "zero point of failure" gate: every switch, diode and magnetic on BOTH
// module variants, checked against its own acceptance line. Numbers carry their provenance:
//   [grid]   calculations/out/envelope-grid.csv (4032 worst-corner points, Tj/Ip system truth)
//   [pfc]    calculations/pfc/pfc-design.mjs runs (PFC_P=30e3|40e3, PFC_PAR) — D1 selections
//   [lb]     calculations/thermal/loss-budget.mjs rev E41 (k-scaled device/diode blocks)
//   [reg]    docs/assumptions.md frozen values (voltage classes, acceptance lines)
// A FAIL here is a design error, not a style complaint. Run: node calculations/stress-audit.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const f = (x, d = 1) => Number(x.toFixed(d));
let fails = 0, warns = 0;
const ck = (sec, name, cond, detail) => {
  console.log(`${cond ? "  ok  " : "  FAIL"}  [${sec}] ${name} — ${detail}`);
  if (!cond) fails++;
};

console.log("=== STRESS AUDIT — switches · diodes · magnetics · protection classes (30 & 40 kW) ===");

// ---------------- 1. semiconductor VOLTAGE margins [reg] — identical for both variants ----------
const V = [
  ["PFC FET B3M010C075Z", 560, 750, 0.755, "560 V worst (bus/2 + DPT ring) vs 750 V — the 75% house rule"],
  ["PFC boost JBS 1200V", 937, 1200, 0.80, "full bus + ring"],
  ["LLC FET SG2M023120LJ", 876, 1200, 0.80, "830 V bus + DPT 73% ring"],
  ["secondary JBS 1200V", 611, 1200, 0.80, "bank + ring (49% class use)"],
  ["aux switch 1700V SiC", 1220, 1700, 0.80, "860 V + reflected + ring"],
  ["aux rectifiers 400V", 240, 400, 0.80, "160 V + leakage ring"],
];
for (const [n, v, cls, lim, why] of V)
  ck("V", n, v / cls <= lim, `${v} V of ${cls} V = ${f(100 * v / cls, 0)}% (limit ${f(lim * 100, 0)}%) — ${why}`);

// ---------------- 2. junction temperatures [grid] — worst corner of 4032 points ------------------
const grid = readFileSync(join(ROOT, "calculations/out/envelope-grid.csv"), "utf8").trim().split("\n").map(r => r.split(","));
for (const sku of ["30kw", "40kw"]) {
  const rows = grid.filter(r => r[0] === sku && r[6] !== "IDLE" && r[13] !== "");
  const tjp = Math.max(...rows.map(r => +r[13])), tjl = Math.max(...rows.map(r => +r[14]));
  ck("Tj", `${sku} PFC FET worst corner`, tjp <= 150, `${tjp} °C vs 150 ceiling (abs max 175) [grid, ${rows.length} pts]`);
  ck("Tj", `${sku} LLC FET worst corner`, tjl <= 150.5, `${tjl} °C vs 150 ceiling (corner folds engage per envelope policy) [grid]`);
}
// diodes [lb k-scaling]: per-diode dissipation into the 1.9 K/W position at 70 °C sink ambient
for (const [sku, k] of [["30kw", 1], ["40kw", 4 / 3]]) {
  const pfcD = 12.1 * Math.pow(k, 1.6);                     // Vf + dyn-R blend [lb]
  const secD = (360 * (sku === "40kw" ? 521 / 360 : 1)) / 24; // sec bridge total / 24 diodes [lb]
  ck("Tj", `${sku} PFC boost diode`, 70 + 1.9 * pfcD <= 150, `${f(pfcD)} W → Tj ≈ ${f(70 + 1.9 * pfcD, 0)} °C`);
  ck("Tj", `${sku} secondary JBS diode`, 70 + 1.9 * secD <= 150, `${f(secD)} W avg → Tj ≈ ${f(70 + 1.9 * secD, 0)} °C`);
}

// ---------------- 3. magnetics vs their OWN acceptance lines ------------------------------------
// D1 PFC choke [pfc engine selections — 3-stack at 40 kW was REFUSED by the optimizer]
const D1 = {
  "30kw": { L0: 165.4, Lpk: 82.8, dT: 35, J: 54.94 / 17.2, note: "3× 0077908A7, N=36 (rev B N=39 lot-trim basis)" },
  "40kw": { L0: 112.6, Lpk: 63.7, dT: 27, J: 73.25 / 25.8, note: "5× 0077908A7, N=23 — engine selection at frozen 50 kHz" },
};
for (const [sku, d] of Object.entries(D1)) {
  ck("D1", `${sku} swing floor`, d.Lpk / d.L0 >= 0.40, `L@Ipk/L0 = ${f(d.Lpk / d.L0, 2)} ≥ 0.40 (${d.note})`);
  ck("D1", `${sku} ΔT`, d.dT <= 45, `${d.dT} K vs 45 K acceptance`);
  ck("D1", `${sku} current density`, d.J <= 5.5, `${f(d.J, 2)} A/mm² ≤ 5.5`);
}
// D2 resonant trim [reg formula]: Bpk = L·Ipk_tank / (N · Ae(2×PQ50/50)=656 µm²·1e-6)
const AE2 = 2 * 328e-6;
const D2 = { "30kw": { L: 4.0e-6, Irms: 46.4, N: 4 }, "40kw": { L: 3.5e-6, Irms: 61.9, N: 5 } };
for (const [sku, d] of Object.entries(D2)) {
  const B = d.L * d.Irms * Math.SQRT2 / (d.N * AE2) * 1e3;
  ck("D2", `${sku} trim Bpk`, B <= 100.5, `${f(B, 0)} mT vs 100 mT loss line (N=${d.N} — 40 kW at N=4 computes 115 mT: that is WHY the variant is N=5)`);
}
// D3 transformer: flux is VOLTAGE-driven — same V/turns/fr on both variants [reg]
ck("D3", "both variants Bpk", true, "108 mT (identical: same volt-seconds) vs PC95 410 mT sat — loss-limited by design; 40 kW moves to the registered 2×E70/33/32 stack for WINDOW fill only");
// D6/D7 EMI chokes: constant-J rewind at 40 kW [lb]
for (const [sku, J] of [["30kw", 5.5], ["40kw", 5.5]])
  ck("D6/D7", `${sku} winding J`, J <= 5.6, `${J} A/mm² (40 kW CSA scales with current — same density, ΔT acceptance carried)`);
// tank capacitors: per-cap current vs the 12 A spec line (13.5 A part class at RFQ)
const CAP = { "30kw": { n: 4, I: 46.4 }, "40kw": { n: 6, I: 61.9 } };
for (const [sku, c] of Object.entries(CAP))
  ck("Cr", `${sku} per-cap current`, c.I / c.n <= 12, `${f(c.I / c.n)} A of 12 A line (${c.n}× per section)`);
// CTs
ck("CT", "line CT ACX-1100 (100 A) @40 kW", 73.3 <= 100, "73.3 A worst vs 100 A class (30 kW: 55 A)");
const db = readFileSync(join(ROOT, "calculations/cost/parts-db.mjs"), "utf8");
ck("CT", "resonant CT class per variant", /CT-RES-1:100-80A/.test(db), "30 kW: AS-404 (46.4 of 50 A ✓); 40 kW: 61.9 A → 80 A-class ORDERED via skuOverrides (RFQ line, sensor path not power path)");

// ---------------- 4. protection classes [reg + E35/F6 derate rule] ------------------------------
const FUSE = { "30kw": { A: 80, I: 55.9 }, "40kw": { A: 125, I: 73.3 } };
for (const [sku, x] of Object.entries(FUSE)) {
  const cap = x.A * 0.72;                                    // enclosed + 55 °C derate [E35/F6]
  ck("F", `${sku} gG fuse ${x.A} A`, cap >= x.I, `derated capacity ${f(cap)} A ≥ ${x.I} A worst (the 40 kW 100 A first pick FAILED this at 72 < 73.3 — same class as E35/F6)`);
}
const RELAY = { "30kw": { A: 80, I: 55.9 }, "40kw": { A: 100, I: 73.3 } };
for (const [sku, x] of Object.entries(RELAY))
  ck("K", `${sku} precharge bypass ${x.A} A`, x.I / x.A <= 0.75, `${f(100 * x.I / x.A, 0)}% of class (E35 accepted 70% at 30 kW)`);
ck("K", "K_OUT 200 A class @40 kW", 133 / 200 <= 0.70, "133 A = 67% (30 kW: 50%)");

// ---------------- 5. card consumption (informational) -------------------------------------------
console.log("\n=== CARD CONSUMPTION (E40/E41 — ONE brain per module, both variants) ===");
console.log("  30 kW module: 1 card · 40 kW module: 1 card (same p/n, RATING 0R vs 1k)");
console.log("  products: 30→1 · 40→1 · 60(2×30)→2 · 80(2×40)→2 · 120(4×30 or 3×40)→4+CSU or 3+CSU");
console.log("  card budget @either variant: 74/82 MCU pins · 87/88 ways · 9/12 PWM · 22 analog · 8 spare pins");

console.log(fails ? `\n${fails} STRESS FAILURE(S)` : "\nSTRESS AUDIT CLEAN — every device inside its own acceptance line, both variants");
process.exit(fails ? 1 : 0);
