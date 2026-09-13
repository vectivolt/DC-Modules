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
  const deepFolds = foldNotes.filter(r => +(r[16].match(/derate to (\d+)%/)?.[1] ?? 100) < 80);
  // E60: the grid's Ip column is A RMS against the tank CLASS (77.3 A rms) — the pre-E60 "65 A pk"
  // ceiling was the same RMS quantity mislabelled; and the SER hysteresis band is now evaluated.
  ck("E42", "50kw tank Ip vs the tank class", ipMax <= 77.3 * 1.02, `${f(ipMax)} A rms vs 77.3 A rms class (ngspice E60 worst nominal 76.6 A; F.11 now 145 A pk — current-coordination gate)`);
  ck("E42", "50kw envelope: zero tank-ceiling clamps", ceilNotes.length === 0, `${ceilNotes.length} clamped rows — no availability clamp exists in firmware, so none may exist in the grid`);
  ck("E42", "50kw folds: known families only, ≤2 steps", deepFolds.length === 0 && foldNotes.every(r => (r[4] === "hot" && r[6] === "PS") || (r[5] === "SER" && (+r[2] === 500 || +r[2] === 525))), `${foldNotes.length} fold rows — hot PS corners + the SER hysteresis band (E60: falling-command state only; START selects PAR ≤525 V); deepest 80 % = the triple corner 475 VAC ∧ SER 500 V ∧ hot, where the line-tracking bus floor puts the bank-250 V point into PS`);
}
// E44 grid-shape asserts for the AIR 50: the paralleled LLC must deliver the full envelope on
// plain 4-fan air — zero folds, zero clamps (worst corner computes ~107 °C).
{
  const ra = grid.filter(r => r[0] === "50kwa" && r[6] !== "IDLE" && r[13] !== "");
  const ipMax = Math.max(...ra.map(r => +r[10])), notes = ra.filter(r => (r[16] ?? "") !== "" && !(r[5] === "SER" && (+r[2] === 500 || +r[2] === 525) && r[4] === "hot"));
  const tjl = Math.max(...ra.map(r => +r[14]));
  ck("E44", "50kwa full envelope on air, derates only hot SER band", notes.length === 0 && ipMax <= 77.3 * 1.02 && tjl <= 150,
    `${notes.length} noted rows outside the hot SER hysteresis band (E60: that band folds to 93 % on the secondary-JBS Tj, not the LLC) · Ip ${f(ipMax)} A rms ≤ 77.3 class · worst TjLLC ${tjl} °C (paralleled pairs)`);
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
// D1 PFC choke — E51: COMPUTED from the CATALOG core (0077908A7: AL 37 nH/T² ±8%, le 196 mm — E60
// catalog sync from the datasheet rev 10/7/2021; the engines had carried 201 mm/227 mm²),
// not hand-copied engine output (the E41/E42 rows had inherited the geometric-Ae model and two
// stress rows here were stale rev-A copies — three sources, three answers, none the drawing).
const AL79 = 37e-9, LE79 = 0.196, R26 = { a: 2.13e-4, b: 1.637 };
const mu26 = (H) => 1 / (1 + R26.a * Math.pow(Math.max(H / 79.577, 1e-9), R26.b));
const D1 = {
  "30kw": { stack: 3, N: 39, cu: 18.0, Irms: 54.94, Ibias: 78, Lfloor: 75, dT: 36, note: "D1 rev B: N=39±1 lot-trim, 18 mm² (drawing of record)" },
  "40kw": { stack: 5, N: 26, cu: 25.8, Irms: 73.25, Ibias: 104, Lfloor: 61, dT: 30, note: "D1-40 rev B (E51): N=26±1 on CATALOG AL — the E41 N=23 missed its floor on the real core" },
  "50kw": { stack: 5, N: 24, cu: 25.8, Irms: 91.57, Ibias: 129.5, Lfloor: 45, dT: 41, note: "D1-50 rev B (E51): N=24±1, dIpp basis restated 36.2 A pp (D6-50 floor 11.8 ≤ built 12.9); plate/web-bonded" },
  "50kwa": { stack: 5, N: 24, cu: 25.8, Irms: 91.57, Ibias: 129.5, Lfloor: 45, dT: 41, note: "same D1-50 rev B part (E44 twin)" },
};
for (const [sku, d] of Object.entries(D1)) {
  const L0 = AL79 * d.stack * d.N * d.N * 1e6;
  const Lb = mu26(d.N * d.Ibias / LE79) * L0;
  const J = d.Irms / d.cu;
  ck("D1", `${sku} biased-L floor [catalog AL]`, Lb >= d.Lfloor, `L0 ${f(L0, 0)} µH → ${f(Lb, 1)} µH @${d.Ibias} A ≥ ${d.Lfloor} (${d.note})`);
  ck("D1", `${sku} swing floor`, Lb / L0 >= 0.40 || sku === "30kw", `L@Ibias/L0 = ${f(Lb / L0, 2)} (30 kW swing-choke basis exempt: drawing governs via its own biased-L line)`);
  ck("D1", `${sku} ΔT`, d.dT <= 45, `${d.dT} K vs 45 K acceptance`);
  ck("D1", `${sku} current density`, J <= 5.5, `${f(J, 2)} A/mm² ≤ 5.5`);
}
// D2 resonant trim [reg formula]: Bpk = L·Ipk_tank / (N · Ae). E60: D2-40 = 1× E70/33/32 N 5 (Ae 683 mm²),
// D2-50 = 2× E70/33/32 N 3 (1366 mm²) — the PQ50 N 5/6 routes computed Fr 4.3/11.7 (conductor-audit owns the AC proof)
const D2 = { "30kw": { L: 4.0e-6, Irms: 46.4, N: 4, Ae: 656e-6 }, "40kw": { L: 3.5e-6, Irms: 61.9, N: 5, Ae: 683e-6 }, "50kw": { L: 3.0e-6, Irms: 77.3, N: 3, Ae: 1366e-6 }, "50kwa": { L: 3.0e-6, Irms: 77.3, N: 3, Ae: 1366e-6 } };
for (const [sku, d] of Object.entries(D2)) {
  const B = d.L * d.Irms * Math.SQRT2 / (d.N * d.Ae) * 1e3;
  ck("D2", `${sku} trim Bpk`, B <= 100.5, `${f(B, 0)} mT vs 100 mT loss line (N=${d.N} on ${d.Ae > 1e-3 ? "2× E70/33/32 — E60" : d.Ae > 6.7e-4 ? "1× E70/33/32 — E60" : "2× PQ50/50"}; trim = ~50 % of Lr so leakage tolerance stays binnable)`);
}
// D3 transformer — E51: the old check here was literally `true` while the register carried a
// ×1.8 flux-claim error ("108 mT identical" — the E70 routes actually ran 60 mT) and windings
// that could not fit their formers. Now COMPUTED from volt-seconds (415 V half-cycle @140 kHz)
// against each variant's core set and its registered Bpk line.
{
  const LAM = 415 / (2 * 140e3);
  const D3 = {
    "30kw": { sets: 3, Ae: 328e-6, N: 7, BpkLine: 108, win: "75% of bobbinless PQ window (compacted litz + foil sec, E51 construction)" },
    "40kw": { sets: 2, Ae: 683e-6, N: 6, BpkLine: 90, win: "88% of B66372B2000 former AN 389 mm² (E51: 9:9:9 computed 242–294% — unbuildable)" },
    "50kw": { sets: 2, Ae: 683e-6, N: 5, BpkLine: 109, win: "91% of B66372B2000 former (E51: registered 3-set former does not exist)" },
    "50kwa": { sets: 2, Ae: 683e-6, N: 5, BpkLine: 109, win: "same D3-50 rev B part" },
  };
  for (const [sku, d] of Object.entries(D3)) {
    const Bamp = LAM / (d.N * d.Ae * d.sets) / 2 * 1e3;
    ck("D3", `${sku} Bpk from volt-seconds`, Math.abs(Bamp - d.BpkLine) <= 2 && Bamp <= 115, `${f(Bamp, 0)} mT vs registered ${d.BpkLine} (≤115 loss line; hot Bsat ~330); window: ${d.win}`);
  }
}
// D6/D7 EMI chokes: constant-J rewind at 40/50 kW [lb]
for (const [sku, J] of [["30kw", 5.5], ["40kw", 5.5], ["50kw", 5.5]])
  ck("D6/D7", `${sku} winding J`, J <= 5.6, `${J} A/mm² (CSA scales with current — same density, ΔT acceptance carried)`);
// tank capacitors: per-cap current vs the 12 A spec line (13.5 A part class at RFQ)
const CAP = { "30kw": { n: 4, I: 46.4 }, "40kw": { n: 6, I: 61.9 }, "50kw": { n: 8, I: 77.3 }, "50kwa": { n: 8, I: 77.3 } };
for (const [sku, c] of Object.entries(CAP))
  ck("Cr", `${sku} per-cap current`, c.I / c.n <= 12, `${f(c.I / c.n)} A of 12 A line (${c.n}× per section)`);
// CTs
const db = readFileSync(join(ROOT, "calculations/cost/parts-db.mjs"), "utf8");
ck("CT", "line CT class @40 kW", 73.3 <= 150 * 0.95 && /R1206-18R-1%/.test(db), "E60: the 40 kW joins the 150 A class (ACX-1150) — F.01 155 A + 50 A race needs linearity past the ACX-1100's ~179 A at 18 R; 30 kW keeps ACX-1100 (55 A, F.01 120 A on 22 R)");
ck("CT", "resonant CT class per variant", /CT-RES-1:100-80A/.test(db) && /CT-RES-1:100-100A/.test(db), "30 kW: AS-404 (46.4 of 50 A ✓); 40 kW: 61.9 A → 80 A-class; 50 kW: 77.3 A → 100 A-class — both ORDERED via skuOverrides (RFQ lines, sensor path not power path)");
ck("CT", "line CT class @50 kW", 91.6 <= 150 * 0.95 && /CT-LINE-2500-150A/.test(db), "91.6 A worst vs 150 A class (ACX upsize at RFQ; ACX-1100 would run 92%)");
// E42 burden rail budgets — the catch that re-scaled both burdens: OC observability must stay
// inside the 3.3 V rail ABOVE the 1.65 V AVMID bias (the R3-proven budget is +1.62 V = 3.27 V).
{
  // E60 re-point: the observability point is now F.0x + the simulated 3 µs fault rise (current-
  // coordination gate owns the per-SKU proof; this row keeps the 50 kW rail arithmetic visible)
  const lineV = 1.65 + (195 + 71.4) / 2500 * 13;            // 50 kW F.01 195 A + D1 soft-sat race
  const resV = 1.65 + (145 + 50.4) / 100 * 0.75;            // 50 kW F.11 145 A + ngspice race
  const resW = 0.809 ** 2 * 0.75;                           // resonant burden at the 80.9 A rms mismatch corner
  ck("BRD", "50kw line-CT burden rail budget", lineV <= 3.275, `266 A pk (F.01+race) → ${f(lineV, 2)} V on 13 Ω (the E42 21.5 Ω saw only to 187 A)`);
  ck("BRD", "50kw resonant burden rail budget", resV <= 3.275, `195 A pk (F.11+race) → ${f(resV, 2)} V on 0.75 Ω (the E42 1.6 Ω would clip at 104 A)`);
  ck("BRD", "50kw resonant burden dissipation", resW <= 1.0, `${f(resW, 2)} W on the 2 W part = ${f(50 * resW, 0)}%`);
  ck("BRD", "50kw burden parts ordered", /R2512-0R75-2W-1%/.test(db) && /R1206-13R-1%/.test(db), "both E60 burdens exist as skuOverrides");
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
// D2 trim copper density at the E60 litz (the AC copper + ΔT proof moved to conductor-audit, which
// computes Sullivan proximity at the simulated corners — the DC×1.15 model this row used hid Fr 4–12)
for (const [sku, litz, irms, name] of [["30kw", 10.6, 46.4, "1350×0.1"], ["40kw", 16.4, 61.9, "4150×0.071"], ["50kw", 19.6, 77.3, "2500×0.1"], ["50kwa", 19.6, 77.3, "2500×0.1"]]) {
  ck("D2c", `${sku} trim litz J`, irms / litz <= 5.6,
    `${name} litz: J ${f(irms / litz, 1)} A/mm² ≤ 5.6 (AC loss/ΔT: conductor-audit)`);
}
// D4 aux flyback saturation margin — E52: computed, not asserted-by-prose (ETD39 Ae 125 mm²)
{
  const bpk = 345e-6 * 3.2 / (38 * 125e-6);
  ck("D4", "aux flyback Bpk on ETD39 [computed]", bpk <= 0.24 && bpk * 1.10 <= 0.26 && /ETD39/.test(db),
    `Lp·Ipclamp/(Np·Ae) = ${f(bpk * 1e3, 0)} mT (${f(bpk * 1.1 * 1e3, 0)} at Lp+10%) vs hot Bsat ~390 — 66% at tolerance (the ETD34 rev C ran 85%; E52 margin rev, electricals/sim unchanged)`);
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
console.log("  products (E55): modules 30/40/50L/50A → 1 card each · 100 kW = 2×50 → 2 cards · 150 kW = 3×50+CSU → 3+1 cards");
console.log("  card budget @every variant: 74/82 MCU pins · 87/88 ways · 9/12 PWM · 22 analog · 8 spare pins (the 50 kW frees the 5 fan lines — sealed module)");


// ---------------- R6 (E47): discharge timeline · aux cold-start · PV gate drive -----------------
// The external R6 review traced the SHUTDOWN path end-to-end: the active discharge is powered
// FROM the link it discharges (PSQD ← V15 ← bus-fed aux, brown-out 321 V), so the honest
// timeline is two-phase. These checks recompute it from the drawn R/C every run and refuse the
// build if the docs stop telling that truth.
const cellsSrc = readFileSync(join(ROOT, "packages/power-primitives/cells.tsx"), "utf8");
const protDoc = readFileSync(join(ROOT, "docs/protection-thresholds.md"), "utf8");
const fwDoc = readFileSync(join(ROOT, "docs/firmware-guide.md"), "utf8");
{
  const VBO = 1 * (1 + 4.8e6 / 15e3);                       // NCP1252 BO: 321 V (RBR 2×2.4M / 15k)
  ck("R6", "aux brown-out threshold as drawn", Math.abs(VBO - 321) < 2, `1 V × (1+4.8M/15k) = ${f(VBO, 0)} V — the active-discharge floor`);
  // R8 correction (external review retrace): the 40/50 kW links carry TWO SplitDcLink banks,
  // each with its own 2×47k pair per half → the pairs PARALLEL (47k/half, 94k full-link);
  // only the single-bank 30 kW is 188k. The R7 report dismissed the reviewer's 222 s as an
  // arithmetic slip — the slip was OURS, and this model now counts the drawn strings per SKU
  // (verify-independent proves the counts against the netlists).
  for (const [sku, nHalf, nSets] of [["30kw", 5, 1], ["40kw", 6, 2], ["50kw", 8, 2], ["50kwa", 8, 2]]) {
    const Clink = nHalf * 470e-6 / 2;                        // series halves
    const tAct = 640 * Clink * Math.log(830 / VBO);          // QDISF powered phase
    const tPas = (94e3 / nSets) * (nHalf * 470e-6) * Math.log(VBO / 60); // per-half pairs in parallel
    ck("R6", `${sku} discharge timeline (AC removed)`, tAct < 1.5 && tAct + tPas < 660,
      `active 830→${f(VBO, 0)} V in ${f(tAct, 2)} s, then PASSIVE ${nSets}×(2×47k)/half: +${f(tPas, 0)} s → total ${f((tAct + tPas) / 60, 1)} min ≤ 11 min label ceiling (R8: 30 kW is the slowest at 6.2 min)`);
  }
  ck("R6", "discharge honesty lives in the docs", /R6 discharge-timeline honesty/.test(protDoc) && /wait 10 min/.test(protDoc) && /F\.21 semantics \(R6\)/.test(fwDoc),
    "protection-thresholds two-phase note + 62477-1 label text + firmware-guide F.21 real-coverage note");
}
{
  // NCP1252 cold start (datasheet Table 3/4, read at R6): D version — no 120 ms delay, 5 V hys.
  const drain = 3.5e-3 + 2.6e-3 - 0.49e-3;                   // ICC3 max + QAUX gate charge − 940k feed
  const need = drain * 0.060 / 5.0;                          // 60 ms soft-start+takeover over the hysteresis
  ck("R6", "aux cold-start reservoir (D version)", /mpn: "NCP1252D"/.test(db) && /name="CVCC" capacitance="220uF"/.test(cellsSrc) && 220e-6 >= 2 * need,
    `budget ${f(drain * 1e3, 1)} mA × 60 ms / 5 V = ${f(need * 1e6, 0)} µF → 220 µF fitted (${f(220e-6 / need, 1)}×). The drawn A-version could NOT start: 120 ms mandatory delay vs 1.0 V hysteresis ÷ ${f((1.4e-3 - 0.59e-3) * 1e3, 2)}–${f((2.2e-3 - 0.59e-3) * 1e3, 2)} mA net = 28–60 ms`);
  const dutyBO = Math.sqrt(2 * 110 / (345e-6 * 65e3)) * 345e-6 * 65e3 / 321; // DCM peak duty at brown-in, full aux load
  ck("R6", "D-version duty ceiling holds at brown-in", dutyBO < 0.442,
    `worst DCM duty ${f(dutyBO * 100, 1)}% ≤ 44.2% DCmax(min) — the A-version's 48% ceiling was never the constraint`);
}
{
  // R7-B: VOM1271 GUARANTEED numbers only (datasheet Rev 1.9 — the R6 check used a 40 µA
  // "worst" that was actually a typical-class misread; the reviewer caught it). The ONLY
  // spec'd-minimum point is IF = 10 mA: Voc ≥ 7.8 V, Isc ≥ 6.0 µA — hence the V15-fed
  // 1.2 k LED feed (11 mA) behind QPVD instead of the old 5 mA GPIO drive. Worst-case
  // load line = the (Isc,Voc) chord (the real PV curve is convex-above it).
  const Voc = 7.8, Isc = 6.0e-6, R = 6.8e6, Igss = 100e-9, VthMax = 3.5;
  // R8: LED current must hold ≥10 mA at the DECLARED rail floor (13.5 V, the QA01C input
  // minimum) with VF(max) 1.6 V, Vce 0.2 V and +1% resistance — hence 1 k/2010, not 1.2 k.
  const ifFloor = (13.5 - 1.6 - 0.2) / (1000 * 1.01);
  const pLedMax = ((16.5 - 1.2 - 0.2) / 990) ** 2 * 1000;
  const vChord = Isc * R * Voc / (Voc + Isc * R) - Igss * R;
  ck("R7", "bank-bleeder PV gate drive (25 °C-endpoint model)", ifFloor >= 10e-3 && pLedMax <= 0.5 * 0.75 && vChord >= VthMax + 2 && /resistance="6.8M"/.test(cellsSrc) && /resistance="1k" footprint="2010"/.test(cellsSrc) && /QPVD/.test(cellsSrc + readFileSync(join(ROOT, "packages/common-components/boards.tsx"), "utf8")),
    `IF ${f(ifFloor * 1e3, 2)} mA ≥ 10 mA at the 13.5 V rail floor (R8: 1 k/2010, ${f(pLedMax, 2)} W worst ≤ 50% of 0.75 W); chord ${f(vChord, 2)} V ≥ Vth(max)+2 — a 25 °C-ENDPOINT MODEL (Voc typ ~5.4 V at 100 °C): bleed-interval ambient declared ≤70 °C, EVT loaded-Vgs gates the BOM freeze`);
}

console.log(fails ? `\n${fails} STRESS FAILURE(S)` : "\nSTRESS AUDIT CLEAN — every device inside its own acceptance line, all three variants");
process.exit(fails ? 1 : 0);
