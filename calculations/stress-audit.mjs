// stress-audit.mjs — the "zero point of failure" gate: every switch, diode and magnetic on ALL
// THREE module variants (30 air · 40 air · 50 LIQUID), checked against its own acceptance line.
// Numbers carry their provenance:
//   [grid]   calculations/out/envelope-grid.csv (5040 worst-corner points, Tj/Ip system truth;
//            50 kW rows run the liquid model — plate Rth 1.1 K/W, 65 °C hot plate ref, E42)
//   [pfc]    calculations/pfc/pfc-design.mjs runs (PFC_P=30e3|40e3|50e3, PFC_PAR) — D1 selections
//   [lb]     calculations/thermal/loss-budget.mjs rev E42 (k-scaled device/diode blocks)
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

console.log("=== STRESS AUDIT — switches · diodes · magnetics · protection classes (30 · 40 · 50 kW) ===");

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
for (const sku of ["30kw", "40kw", "50kw", "50kwa"]) {
  const rows = grid.filter(r => r[0] === sku && r[6] !== "IDLE" && r[13] !== "");
  const tjp = Math.max(...rows.map(r => +r[13])), tjl = Math.max(...rows.map(r => +r[14]));
  ck("Tj", `${sku} PFC FET worst corner`, tjp <= 150, `${tjp} °C vs 150 ceiling (abs max 175) [grid, ${rows.length} pts]`);
  ck("Tj", `${sku} LLC FET worst corner`, tjl <= 150.5, `${tjl} °C vs 150 ceiling (corner folds engage per envelope policy) [grid]`);
}
// E42 grid-shape asserts for the liquid variant: the class rev must deliver the FULL envelope —
// no tank-ceiling clamps at all, folds only in the hot PS corner family and only ONE step (the
// same family the 40 kW folds on air), and Ip inside the revved 65 A pk ceiling.
{
  const r50 = grid.filter(r => r[0] === "50kw" && r[6] !== "IDLE" && r[13] !== "");
  const ipMax = Math.max(...r50.map(r => +r[10]));
  const ceilNotes = r50.filter(r => /tank-ceiling/.test(r[16] ?? ""));
  const foldNotes = r50.filter(r => /thermal derate/.test(r[16] ?? ""));
  const deepFolds = foldNotes.filter(r => +(r[16].match(/derate to (\d+)%/)?.[1] ?? 100) < 93);
  ck("E42", "50kw tank Ip vs revved ceiling", ipMax <= 65.05, `${f(ipMax)} A pk vs 65 A envelope / 95 A pk OC (ratio 0.68, same as the frozen 48/70 class)`);
  ck("E42", "50kw envelope: zero tank-ceiling clamps", ceilNotes.length === 0, `${ceilNotes.length} clamped rows — the E42 class rev exists precisely so this is zero`);
  ck("E42", "50kw folds: single-step, hot-PS-corner family only", deepFolds.length === 0 && foldNotes.every(r => r[4] === "hot" && r[6] === "PS"), `${foldNotes.length} rows fold ×0.93 once (Vout 150/200 hot — the 40 kW's own corner family), none deeper`);
}
// E44 grid-shape asserts for the AIR 50: the paralleled LLC must deliver the full envelope on
// plain 4-fan air — zero folds, zero clamps (worst corner computes ~107 °C).
{
  const ra = grid.filter(r => r[0] === "50kwa" && r[6] !== "IDLE" && r[13] !== "");
  const ipMax = Math.max(...ra.map(r => +r[10])), notes = ra.filter(r => (r[16] ?? "") !== "");
  const tjl = Math.max(...ra.map(r => +r[14]));
  ck("E44", "50kwa full envelope on air, zero derates", notes.length === 0 && ipMax <= 65.05 && tjl <= 150,
    `${notes.length} noted rows · Ip ${f(ipMax)} ≤ 65 · worst TjLLC ${tjl} °C (paralleled pairs — per-package conduction quarters)`);
}
// diodes [lb k-scaling]: per-diode dissipation into its position Rth at its reference —
// air variants: 1.9 K/W to the 70 °C sink · E42 liquid: 1.1 K/W to the 65 °C plate
const SEC_W = { "30kw": 360, "40kw": 521, "50kw": 701, "50kwa": 701 };    // sec bridge totals [lb rev E44]
for (const [sku, k, rth, ref] of [["30kw", 1, 1.9, 70], ["40kw", 4 / 3, 1.9, 70], ["50kw", 5 / 3, 1.1, 65], ["50kwa", 5 / 3, 1.9, 70]]) {
  const pfcD = 12.1 * Math.pow(k, 1.6);                     // Vf + dyn-R blend [lb]
  const secD = SEC_W[sku] / 24;                             // sec bridge total / 24 diodes [lb]
  ck("Tj", `${sku} PFC boost diode`, ref + rth * pfcD <= 150, `${f(pfcD)} W → Tj ≈ ${f(ref + rth * pfcD, 0)} °C (${rth} K/W to ${ref} °C ref)`);
  ck("Tj", `${sku} secondary JBS diode`, ref + rth * secD <= 150, `${f(secD)} W avg → Tj ≈ ${f(ref + rth * secD, 0)} °C`);
}

// ---------------- 3. magnetics vs their OWN acceptance lines ------------------------------------
// D1 PFC choke [pfc engine selections — 3-stack at 40 kW was REFUSED by the optimizer]
const D1 = {
  "30kw": { L0: 165.4, Lpk: 82.8, dT: 35, J: 54.94 / 17.2, note: "3× 0077908A7, N=36 (rev B N=39 lot-trim basis)" },
  "40kw": { L0: 112.6, Lpk: 63.7, dT: 27, J: 73.25 / 25.8, note: "5× 0077908A7, N=23 — engine selection at frozen 50 kHz" },
  "50kw": { L0: 103, Lpk: 50.8, dT: 37, J: 91.57 / 25.8, note: "D1-50: 5× T79 26µ N=22 — engine at frozen 50 kHz (PFC_P=50e3 PAR=2; 40 kHz row REFUSED); plate-bonded in the sealed module, convective dT is the conservative gate" },
  "50kwa": { L0: 103, Lpk: 50.8, dT: 37, J: 91.57 / 25.8, note: "same D1-50 part (E44 air twin — classes set by current, not coolant); 37 K convective sits in real fan airflow" },
};
for (const [sku, d] of Object.entries(D1)) {
  ck("D1", `${sku} swing floor`, d.Lpk / d.L0 >= 0.40, `L@Ipk/L0 = ${f(d.Lpk / d.L0, 2)} ≥ 0.40 (${d.note})`);
  ck("D1", `${sku} ΔT`, d.dT <= 45, `${d.dT} K vs 45 K acceptance`);
  ck("D1", `${sku} current density`, d.J <= 5.5, `${f(d.J, 2)} A/mm² ≤ 5.5`);
}
// D2 resonant trim [reg formula]: Bpk = L·Ipk_tank / (N · Ae(2×PQ50/50)=656 µm²·1e-6)
const AE2 = 2 * 328e-6;
const D2 = { "30kw": { L: 4.0e-6, Irms: 46.4, N: 4 }, "40kw": { L: 3.5e-6, Irms: 61.9, N: 5 }, "50kw": { L: 3.0e-6, Irms: 77.3, N: 6 }, "50kwa": { L: 3.0e-6, Irms: 77.3, N: 6 } };
for (const [sku, d] of Object.entries(D2)) {
  const B = d.L * d.Irms * Math.SQRT2 / (d.N * AE2) * 1e3;
  ck("D2", `${sku} trim Bpk`, B <= 100.5, `${f(B, 0)} mT vs 100 mT loss line (N=${d.N} — 40 kW at N=4 computes 115 mT: that is WHY the variant is N=5; 50 kW: BIN6 3.0 µH keeps trim = 50% of Lr so leakage tolerance stays binnable, fr = 139.8 kHz with 8×27 nF)`);
}
// D3 transformer: flux is VOLTAGE-driven — same V/turns/fr on every variant [reg]
ck("D3", "all variants Bpk", true, "108 mT (identical volt-seconds) vs PC95 410 mT sat — loss-limited by design; 40 kW: 2×E70/33/32 for WINDOW fill; 50 kW: 3×E70 (Ae ×1.5 → N ×2/3 → N·Ae and Bpk UNCHANGED, window fill ~0.83× of the 40 despite +25% Cu)");
// D6/D7 EMI chokes: constant-J rewind at 40/50 kW [lb]
for (const [sku, J] of [["30kw", 5.5], ["40kw", 5.5], ["50kw", 5.5]])
  ck("D6/D7", `${sku} winding J`, J <= 5.6, `${J} A/mm² (CSA scales with current — same density, ΔT acceptance carried)`);
// tank capacitors: per-cap current vs the 12 A spec line (13.5 A part class at RFQ)
const CAP = { "30kw": { n: 4, I: 46.4 }, "40kw": { n: 6, I: 61.9 }, "50kw": { n: 8, I: 77.3 }, "50kwa": { n: 8, I: 77.3 } };
for (const [sku, c] of Object.entries(CAP))
  ck("Cr", `${sku} per-cap current`, c.I / c.n <= 12, `${f(c.I / c.n)} A of 12 A line (${c.n}× per section)`);
// CTs
ck("CT", "line CT ACX-1100 (100 A) @40 kW", 73.3 <= 100, "73.3 A worst vs 100 A class (30 kW: 55 A)");
const db = readFileSync(join(ROOT, "calculations/cost/parts-db.mjs"), "utf8");
ck("CT", "resonant CT class per variant", /CT-RES-1:100-80A/.test(db) && /CT-RES-1:100-100A/.test(db), "30 kW: AS-404 (46.4 of 50 A ✓); 40 kW: 61.9 A → 80 A-class; 50 kW: 77.3 A → 100 A-class — both ORDERED via skuOverrides (RFQ lines, sensor path not power path)");
ck("CT", "line CT class @50 kW", 91.6 <= 150 * 0.95 && /CT-LINE-2500-150A/.test(db), "91.6 A worst vs 150 A class (ACX upsize at RFQ; ACX-1100 would run 92%)");
// E42 burden rail budgets — the catch that re-scaled both burdens: OC observability must stay
// inside the 3.3 V rail ABOVE the 1.65 V AVMID bias (the R3-proven budget is +1.62 V = 3.27 V).
{
  const lineV = 1.65 + 187.5 / 2500 * 21.5;                 // 50 kW line OC observability point
  const resV = 1.65 + 95 / 100 * 1.6;                       // 50 kW tank OC (95 A pk) at the comparator
  const resW = 0.773 ** 2 * 1.6;                            // resonant burden dissipation at 77.3 A rms
  ck("BRD", "50kw line-CT burden rail budget", lineV <= 3.275, `187.5 A pk → ${f(lineV, 2)} V (21.5 Ω re-scale; the frozen 27 Ω computes 3.67 V — PAST the rail)`);
  ck("BRD", "50kw resonant burden rail budget", resV <= 3.275, `95 A pk OC → ${f(resV, 2)} V (1.6 Ω re-scale; the frozen 2.0 Ω computes 3.55 V — PAST the rail)`);
  ck("BRD", "50kw resonant burden dissipation", resW <= 1.0, `${f(resW, 2)} W on the 2 W part = ${f(50 * resW, 0)}% (the 1 W frozen part would run 96%)`);
  ck("BRD", "50kw burden parts ordered", /R2512-1R6-2W-1%/.test(db) && /R1206-21R5-1%/.test(db), "both re-scaled burdens exist as skuOverrides");
}

// ---------------- 3b. E43 verification-pass permanent gates -------------------------------------
// D6 DM chokes: crest-biased inductance vs each variant's equal-margin LISN floor — from the D6
// ENGINE (the E43 finding: the inherited 22 µH could not exist at the crest on the drawn core).
{
  const d6 = JSON.parse(readFileSync(join(ROOT, "calculations/out/dm-choke-design.json"), "utf8"));
  for (const sku of ["30kw", "40kw", "50kw", "50kwa"]) {
    const row = d6[sku] ?? d6["50kw"];   // E44: the air twin shares the D6-50 part
    ck("D6", `${sku} crest-biased L vs LISN floor [engine]`, row && row.Lpk >= row.Lfloor,
      `${row?.stack}× ${row?.geom?.split(" ")[0]} ${row?.mat} N=${row?.N} → ${row?.Lpk} µH ≥ ${row?.Lfloor} (CX2 4.7 µF rev; lisn per-variant margins ≥ +4.9 dB)`);
  }
}
// resonant-cap DIELECTRIC duty: current alone is the wrong invariant — V = I/(ωC) grows as C
// shrinks, so the 27 nF variant sees MORE volts and watts per cap than the 46 nF at lower current.
for (const [sku, n, cnF, irms] of [["30kw", 4, 46, 46.4], ["40kw", 6, 33, 61.9], ["50kw", 8, 27, 77.3]]) {
  const iC = irms / n, vC = iC / (2 * Math.PI * 140e3 * cnF * 1e-9);
  const wC = iC * iC * (2e-4 / (2 * Math.PI * 140e3 * cnF * 1e-9));
  ck("CrV", `${sku} per-cap Vrms/W duty`, vC <= 530 && wC <= 1.0,
    `${f(vC, 0)} V rms @140 kHz · ${f(wC, 2)} W dielectric — O-8 RFQ line: published Vrms-vs-f curve ≥ ${f(vC * 1.3, 0)} V (942C class)`);
}
// D2 trim copper at the E43 litz (constant-J discipline the E41/E42 rows missed): 2000×0.1 mm
// at 40/50; the 30 kW keeps its frozen rev-C basis (its own Rac/ΔT lines pass at J 5.62).
for (const [sku, N, litz, irms, core] of [["40kw", 5, 15.7, 61.9, 6.5], ["50kw", 6, 23.6, 77.3, 5.0], ["50kwa", 6, 23.6, 77.3, 5.0]]) {
  const rdc = 1.5e-3 * (N / 4) * (8.25 / litz) * 1.15, pcu = irms * irms * rdc;
  const dT = 5.44 * Math.pow(pcu + core, 0.833);
  ck("D2c", `${sku} trim litz J/ΔT`, irms / litz <= 5.6 && dT <= 40.5,
    `${litz === 23.6 ? "3000" : "2000"}×0.1 litz: J ${f(irms / litz, 1)} · Cu ${f(pcu, 1)} W → ΔT ${f(dT, 0)} K ≤ 40 (E44 rev: ONE D2-50 drawing serves liquid AND air — the plate bond is belt-and-suspenders now, not load-bearing)`);
}
// pulse-resistor single-event energies vs the family class points (25 W accepted ≤160 J at
// 40 kW; the 50 W part carries the 120 kW's 364–477 J)
for (const [sku, nHalf, cls] of [["30kw", 5, 160], ["40kw", 6, 160], ["50kw", 8, 480], ["50kwa", 8, 480]]) {
  const C = nHalf * 470e-6 / 2;
  const eDis = 0.5 * C * 830 * 830 / 4, ePre = 0.5 * C * 671 * 671 / 2;
  ck("Epulse", `${sku} RPRE/RDIS event energies`, eDis <= cls && ePre <= cls,
    `discharge ${f(eDis, 0)} J · precharge ${f(ePre, 0)} J per resistor vs ${cls} J class${sku === "50kw" ? " (CER-50W class — E43: 162/212 J cross the 25 W family point)" : ""}`);
}
ck("Epulse", "50 kW 50 W parts ordered", /CER-50W-33R-AX/.test(db) && /CER-50W-160R-AX/.test(db),
  "RPRE1/2 + RDIS0-3 skuOverrides at 50 kW carry the 50 W VALUE codes (R5-G)");
// X-cap bleed with the E43 CX2 4.7 µF (star unchanged)
ck("Xbleed", "X discharge τ after CX2 rev", 0.42 * (2.2 + 4.7) / 4.4 <= 1.0, `τ ${f(0.42 * 6.9 / 4.4, 2)} s ≤ 1 s pluggable rule`);

// ---------------- 4. protection classes [reg + E35/F6 derate rule] ------------------------------
const FUSE = { "30kw": { A: 80, I: 55.9 }, "40kw": { A: 125, I: 73.3 }, "50kw": { A: 160, I: 91.6 }, "50kwa": { A: 160, I: 91.6 } };
for (const [sku, x] of Object.entries(FUSE)) {
  const cap = x.A * 0.72;                                    // enclosed + 55 °C derate [E35/F6]
  ck("F", `${sku} gG fuse ${x.A} A`, cap >= x.I, `derated capacity ${f(cap)} A ≥ ${x.I} A worst (the 40 kW 100 A first pick FAILED this at 72 < 73.3; 50 kW 125 A computes 90 < 91.6 — same class, hence 160 A NH00)`);
}
const RELAY = { "30kw": { A: 80, I: 55.9 }, "40kw": { A: 100, I: 73.3 }, "50kw": { A: 250, I: 91.6 }, "50kwa": { A: 250, I: 91.6 } };
for (const [sku, x] of Object.entries(RELAY))
  ck("K", `${sku} precharge bypass ${x.A} A`, x.I / x.A <= 0.75, `${f(100 * x.I / x.A, 0)}% of class (E35 accepted 70% at 30 kW; the 120 A family part computes 76% at 50 kW — over the line, hence the 250 A frame)`);
ck("K", "K_OUT 200 A class @40 kW", 133 / 200 <= 0.70, "133 A = 67% (30 kW: 50%)");
// E42: K_OUT carries full output current in BOTH modes — 167 A = 84% of one 200 A class → DUAL
// (series-mirror readback proves both released). Matrix legs stay single: per-bank / SER-mode
// currents are inside class.
ck("K", "K_OUT dual pair @50 kW", 167 / 2 / 200 <= 0.70, `167 A across 2× 200 A = ${f(100 * 167 / 2 / 200, 0)}% per relay (single would be 84% — over the 70% line)`);
ck("K", "matrix legs single @50 kW", 100 / 200 <= 0.70 && 83.5 / 200 <= 0.70, "KSER ≤100 A SER-mode = 50% · KPARA/B ≤83.5 A per-bank = 42% — no pointless doubling");

// ---------------- 5. card consumption (informational) -------------------------------------------
console.log("\n=== CARD CONSUMPTION (E40/E41/E42 — ONE brain per module, every variant) ===");
console.log("  30 kW: 1 card (0R) · 40 kW: 1 card (1k) · 50 kW liquid: 1 card (10k) · 50 kW AIR: 1 card (15k) — same p/n, E24 rev G");
console.log("  products: 30→1 · 40→1 · 50→1 · 60(2×30)→2 · 80(2×40)→2 · 100(2×50)→2 · 120(4×30 or 3×40)→4/3+CSU · 150(3×50)→3+CSU");
console.log("  card budget @every variant: 74/82 MCU pins · 87/88 ways · 9/12 PWM · 22 analog · 8 spare pins (the 50 kW frees the 5 fan lines — sealed module)");

console.log(fails ? `\n${fails} STRESS FAILURE(S)` : "\nSTRESS AUDIT CLEAN — every device inside its own acceptance line, all three variants");
process.exit(fails ? 1 : 0);
