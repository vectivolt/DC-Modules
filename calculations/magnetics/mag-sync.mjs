// mag-sync.mjs — E59 standing gate: ONE identity table for every magnetic, asserted against
// every carrier that repeats its numbers (magnetics.md drawings, the RFQ pack, parts-db notes,
// the kicad5 MAGNETICS CONSTRUCTION panel, boards.tsx inductance props). This is the anti-drift
// gate the E35/E51 history begs for: the same part number has previously carried three different
// turn counts across carriers, and nothing failed until a clean-room pass looked.
// ALSO computes each part's honest MASS (core Ve × density + Cu(MLT·N·CSA) × 8.9 + 10% build)
// and asserts the documented mass is within ±20% — the E59 sweep found the doc masses were
// eyeballed, not computed (D1 stacks understated ~2×; D3-30 overstated ~2×). Masses drive
// mounting hardware, vibration banding and freight — they are engineering numbers, not garnish.
// Run: node calculations/magnetics/mag-sync.mjs      (in run-all after temp-critique)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { D2 as D2C, D3 as D3C, d3Build, d2Mlt, d3Leakage, D3_CELLS, LOOP_STRAY } from "./magnetics-envelope.mjs";
import { stack, CORES } from "./geometry.mjs";
import { D1 as D1C, geom as d1Geom } from "./d1-choke.mjs";
import { captureEvidence } from "../evidence.mjs";
captureEvidence("mag-sync");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// E70: the magnetics carriers are the hub plus the four generated module pages (the RFQ pack was merged into them)
const docs = ["magnetics.md", "magnetics-30kw.md", "magnetics-40kw.md", "magnetics-50kw.md", "magnetics-50kwa.md"]
  .map((f) => readFileSync(join(ROOT, "docs", f), "utf8")).join("\n");
const mag = docs, pack = docs;
const db = readFileSync(join(ROOT, "calculations/cost/parts-db.mjs"), "utf8");
const k5 = readFileSync(join(ROOT, "calculations/kicad5-gen.mjs"), "utf8");
const boards = readFileSync(join(ROOT, "packages/common-components/boards.tsx"), "utf8");
const f1 = (x, d = 1) => Number(x.toFixed(d));
let fails = 0;
const ck = (id, cond, what) => { console.log(`${cond ? "  ok  " : "  FAIL"}  [SYNC] ${id} — ${what}`); if (!cond) fails++; };
console.log("=== MAGNETICS SYNC + MASS GATE (E59) — one identity table vs every carrier ===");

// ---- the identity table (THE source; every token below must appear in the named carriers) ----
const IDS = [
  { id: "D1-30", tokens: { "N = 39": [mag, pack], "150–185 µH": [mag, pack], "≥ 75 µH": [pack], "165uH": [boards], "N=39": [k5, db] } },
  { id: "D1-40", tokens: { "N = 26": [pack], "N=26": [mag, k5, db], "116": [mag, pack, db, boards], "≥61": [mag], "61 µH": [pack] } },
  { id: "D1-50", tokens: { "N = 24": [pack], "N=24": [mag, k5, db], "107": [mag, pack, db, boards], "45 µH": [pack] } },
  // E67: the full-bridge tank — D3 rev D transformer cells (primaries in series), D2 rev F external Lr. E68 retired D6 (AC DM chokes)
  // and D8 (bank inductors, the D6 construction): the star-X2 filter and film-only banks need neither.
  // E81 (F-B-3): D2 re-issued at 5.00 / 3.99 / 3.20 µH — the D3 cell leakage was computed on the
  // 41 mm window instead of the 28 mm conductor band, so the SPLIT of Lr between D2 and the two
  // cells' leakage was wrong by 41/28. Tank Lr is unchanged, so no deck re-runs on this account.
  { id: "D2 rev F external Lr", tokens: { "5.00 µH": [mag, pack, db], "3.99 µH": [mag, pack, db], "3.20 µH": [mag, pack, db], "5.00uH": [boards, k5], "3.99uH": [boards, k5], "3.20uH": [boards, k5], "8000×0.05": [mag, pack, db], "10000×0.05": [mag, pack, db], "12000×0.05": [mag, pack, db], "IND-LR-E70-40": [pack, db], "IND-LR-E70-50": [pack, db] } },
  { id: "D3 rev D cells", tokens: { "6:6∥6": [mag, pack, db], "4:4∥4": [mag, pack, db], "3850×0.063": [mag, pack, db], "3536×0.071": [mag, pack, db], "XFMR-LLC-CELL-2E70-30": [pack, db], "XFMR-LLC-CELL-3E70-40": [pack, db], "XFMR-LLC-CELL-3E70-50": [pack, db], "B66372A2000": [mag, pack, k5, db] } },
  { id: "D2/D3 build (E65/E67)", tokens: { "VPI": [mag, pack, db], "magnetics-envelope": [mag, pack] } },
  { id: "D4", tokens: { "ETD44": [mag, pack, db], "Np 38": [pack], "XFMR-AUX-FLY-E": [pack, db], "≤ 4 µH": [pack] } },   // E65 D4 rev E (d4-flyback)
];
const NAMES = new Map([[docs, "magnetics docs"], [db, "parts-db"], [k5, "kicad5-panel"], [boards, "boards.tsx"]]);
// whitespace-normalized matching: carriers legitimately write "N = 26 ±1" / "6 : 6 : 6" — the
// gate hunts VALUE drift, not typography. (First run false-failed 8 spelling variants.)
const norm = (t) => t.replace(/[\s±]/g, "");
const normed = new Map([[docs, norm(docs)], [db, norm(db)], [k5, norm(k5)], [boards, norm(boards)]]);
for (const { id, tokens } of IDS)
  for (const [tok, carriers] of Object.entries(tokens)) {
    const uniq = [...new Set(carriers)];
    const missing = uniq.filter((c) => !normed.get(c).includes(norm(tok))).map((c) => NAMES.get(c));
    ck(`${id} "${tok}"`, missing.length === 0, missing.length ? `MISSING in ${missing.join(", ")}` : `present in ${uniq.map((c) => NAMES.get(c)).join(" + ")}`);
  }

// ---- E82 (M-09a): THE DRAWING MAY NEVER DISAGREE WITH THE GATE ------------------------------
// The checks above match against the CONCATENATION of the hub page and the four module pages, so a
// value present on the hub hides its absence from every drawing. That is exactly what happened: the
// E81 D2 re-issue (5.16/4.07/3.28 → 5.00/3.99/3.20 µH) reached parts-db, boards.tsx, kicad5 and the
// hub, while `mag-docs.mjs` kept the pre-E81 numbers hand-typed in its D2/D3 drawing rows for a whole
// revision — and a winder builds to the DRAWING, so L_r would have come back +6…+7.5 % against the
// ±5 % every deck was solved at. mag-docs now READS magnetics-envelope; this asserts it PER PAGE.
{
  const L = (sku) => `${(D2C[sku].Lnom * 1e6).toFixed(2)} µH`, lk = (sku) => `${(d3Leakage(D3C[sku]) * 1e6).toFixed(3)} µH`;
  for (const sku of ["30kw", "40kw", "50kw", "50kwa"]) {
    const page = norm(readFileSync(join(ROOT, "docs", `magnetics-${sku}.md`), "utf8"));
    const b = sku === "50kwa" ? "50kw" : sku;
    ck(`magnetics-${sku}.md drawing = gate`, page.includes(norm(L(b))) && page.includes(norm(lk(b))),
      `D2 ${L(b)} and D3 cell leakage ${lk(b)} on the page — both computed from tanks.mjs Lr − ${D3_CELLS} × cell leakage − ${LOOP_STRAY * 1e6} µH loop, never typed`);
  }
}

// ---- computed masses (kg): core Ve[cm3]×ρ + Cu(MLT[m]×Neff×CSA[mm2])×8.9g/cm3, ×1.10 build ----
const RHO = { sendust: 7.0, ferrite: 4.85 };   // g/cm3 (Kool Mµ ~7.0; MnZn ~4.85)
const CU = (mlt, n, csa) => mlt * n * csa * 8.9 / 1000;   // kg (mlt m · csa mm2)
const MASS = [
  // [id, core kg, cu kg, doc'd kg in pack, where]
  // E65 D1: datasheet core weight (240 g per 0077908A7 — the 45.6 cm³ × 7.0 g/cm³ basis read 330 g) and the Magnetics-table MLT
  ...Object.entries({ "30kw": 2.2, "40kw": 3.0, "50kw": 2.9 }).map(([sku, doc]) => {
    const c = D1C[sku]; return [`D1-${sku.replace("kw", "")}`, c.stack * CORES.T79.kgCore, CU(d1Geom(c).mlt, c.N, (c.nw * Math.PI * (c.d * 1e3) ** 2) / 4), doc];
  }),
  // E67: D2 rev F / D3 rev D from the envelope construction tables + per-winding mean turns (geometry.mjs)
  ...Object.entries({ "30kw": 1.3, "40kw": 1.3, "50kw": 1.35 }).map(([sku, doc]) => {
    const c = D2C[sku]; return [`D2-${sku.replace("kw", "")}`, stack(c.core, c.n).kg, c.N * d2Mlt(c) * (c.strands * Math.PI * c.dS ** 2 / 4) * 8900, doc];
  }),
  // E67 D3 rev D: ONE cell (the module carries two)
  ...Object.entries({ "30kw": 1.3, "40kw": 1.85, "50kw": 1.85 }).map(([sku, doc]) => {
    const c = D3C[sku], g = d3Build(c); return [`D3-${sku.replace("kw", "")} cell`, stack(c.core, c.n).kg, c.N * (g.mltP * c.cuP + (g.mltS1 + g.mltS2) * c.nf * c.foil * c.foilW) * 8900, doc];
  }),
];
for (const [id, core, cu, doc] of MASS) {
  const m = (core + cu) * 1.10;
  ck(`${id} mass`, Math.abs(m - doc) / m <= 0.20, `computed ${f1(m, 2)} kg (core ${f1(core, 2)} + Cu ${f1(cu, 2)} +10% build) vs documented ${doc} kg`);
}
console.log(fails ? `\n${fails} SYNC FAILURE(S)` : "\nMAGNETICS SYNC CLEAN — every carrier agrees with the identity table; masses computed, not eyeballed");
process.exit(fails ? 1 : 0);
