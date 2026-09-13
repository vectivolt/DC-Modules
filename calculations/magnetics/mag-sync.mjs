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
import { D2 as D2C, D3 as D3C, d3Build, d2Mlt } from "./magnetics-envelope.mjs";
import { stack } from "./geometry.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const mag = readFileSync(join(ROOT, "docs/magnetics.md"), "utf8");
const pack = readFileSync(join(ROOT, "docs/magnetics-manufacturing-pack.md"), "utf8");
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
  // E65: D2 carries ~all of Lr on E70 (bins from tanks.mjs); D3-30 → 2×E70, D3-50 → 3×E70 (XFMR-LLC-3E70-50)
  { id: "D2 bins", tokens: { "6.35 / 6.5 / 6.65 / 6.8": [mag], "6.35/6.5/6.65/6.8": [pack, db, k5], "5.85/6.0/6.15/6.3": [pack, db, k5], "5.35/5.5/5.65/5.8": [pack, db, k5], "6112×0.05": [mag, pack, db], "8149x0.05": [k5, db], "IND-TRIM-E70-40": [pack, db], "IND-TRIM-E70-50": [pack, db] } },
  { id: "D3 copper (E60)", tokens: { "0.10 × 28": [mag, pack], "0.127 × 28": [mag, pack], "0.071": [mag, pack, k5, db], "0.10x28": [k5], "0.127x28": [k5] } },
  { id: "D3-30", tokens: { "7:7:7": [mag, pack, k5, db], "Lm 63": [mag], "Lm = 63": [pack] } },
  { id: "D3-40", tokens: { "6:6:6": [mag, pack, k5, db], "B66372B2000": [mag, pack, k5, db] } },
  { id: "D3-50", tokens: { "5:5:5": [mag, pack, k5, db], "XFMR-LLC-3E70-50": [pack, db] } },
  { id: "D2/D3 build (E65)", tokens: { "VPI": [mag, pack, db], "130 °C": [mag, pack, db], "magnetics-envelope": [mag, pack] } },
  { id: "D4", tokens: { "ETD44": [mag, pack, db], "Np 38": [pack], "XFMR-AUX-FLY-E": [pack, db], "≤ 4 µH": [pack] } },   // E65 D4 rev E (d4-flyback)
  { id: "D6", tokens: { "N=7": [db], "N=8": [db], "7 T": [mag], "8 T": [mag], "7.4": [mag, db], "10.5": [mag, db], "12.9": [mag, db] } },
];
const NAMES = new Map([[mag, "magnetics.md"], [pack, "pack"], [db, "parts-db"], [k5, "kicad5-panel"], [boards, "boards.tsx"]]);
// whitespace-normalized matching: carriers legitimately write "N = 26 ±1" / "6 : 6 : 6" — the
// gate hunts VALUE drift, not typography. (First run false-failed 8 spelling variants.)
const norm = (t) => t.replace(/[\s±]/g, "");
const normed = new Map([[mag, norm(mag)], [pack, norm(pack)], [db, norm(db)], [k5, norm(k5)], [boards, norm(boards)]]);
for (const { id, tokens } of IDS)
  for (const [tok, carriers] of Object.entries(tokens)) {
    const missing = carriers.filter((c) => !normed.get(c).includes(norm(tok))).map((c) => NAMES.get(c));
    ck(`${id} "${tok}"`, missing.length === 0, missing.length ? `MISSING in ${missing.join(", ")}` : `present in ${carriers.map((c) => NAMES.get(c)).join(" + ")}`);
  }

// ---- computed masses (kg): core Ve[cm3]×ρ + Cu(MLT[m]×Neff×CSA[mm2])×8.9g/cm3, ×1.10 build ----
const RHO = { sendust: 7.0, ferrite: 4.85 };   // g/cm3 (Kool Mµ ~7.0; MnZn ~4.85)
const CU = (mlt, n, csa) => mlt * n * csa * 8.9 / 1000;   // kg (mlt m · csa mm2)
const MASS = [
  // [id, core kg, cu kg, doc'd kg in pack, where]
  ["D1-30", 3 * 45.6 * RHO.sendust / 1000, CU(0.170, 39, 18.0), 2.2],
  ["D1-40", 5 * 45.6 * RHO.sendust / 1000, CU(0.190, 26, 25.8), 3.0],
  ["D1-50", 5 * 45.6 * RHO.sendust / 1000, CU(0.190, 24, 25.8), 2.9],
  // E65: D2/D3 from the envelope construction tables + per-winding mean turns (geometry.mjs)
  ...Object.entries({ "30kw": 0.70, "40kw": 1.27, "50kw": 1.27 }).map(([sku, doc]) => {
    const c = D2C[sku]; return [`D2-${sku.replace("kw", "")}`, stack(c.core, c.n).kg, c.N * d2Mlt(c) * (c.strands * Math.PI * c.dS ** 2 / 4) * 8900, doc];
  }),
  ...Object.entries({ "30kw": 1.32, "40kw": 1.36, "50kw": 1.97 }).map(([sku, doc]) => {
    const c = D3C[sku], g = d3Build(c); return [`D3-${sku.replace("kw", "")}`, stack(c.core, c.n).kg, c.N * (g.mltP * c.cuP + (g.mltS1 + g.mltS2) * c.foil * c.foilW) * 8900, doc];
  }),
];
for (const [id, core, cu, doc] of MASS) {
  const m = (core + cu) * 1.10;
  ck(`${id} mass`, Math.abs(m - doc) / m <= 0.20, `computed ${f1(m, 2)} kg (core ${f1(core, 2)} + Cu ${f1(cu, 2)} +10% build) vs documented ${doc} kg`);
}
console.log(fails ? `\n${fails} SYNC FAILURE(S)` : "\nMAGNETICS SYNC CLEAN — every carrier agrees with the identity table; masses computed, not eyeballed");
process.exit(fails ? 1 : 0);
