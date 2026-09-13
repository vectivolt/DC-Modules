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
  { id: "D2 bins", tokens: { "3.3 / 3.65 / 4.0 / 4.35": [mag], "3.3/3.65/4.0/4.35": [pack], "1350×0.1": [mag, pack, db], "2500x0.1": [k5, db], "IND-TRIM-E70-40": [pack, db], "IND-TRIM-E70-50": [pack, db] } },
  { id: "D3 copper (E60)", tokens: { "0.10 × 28": [mag, pack], "0.127 × 28": [mag, pack], "0.071": [mag, pack, k5, db], "0.10x28": [k5], "0.127x28": [k5] } },
  { id: "D3-30", tokens: { "7:7:7": [mag, k5, db], "Lm 63": [mag], "Lm = 63": [pack] } },   // magnetics.md now carries the compact 7:7:7 identity too (E59)
  { id: "D3-40", tokens: { "6:6:6": [mag, pack, k5, db], "B66372B2000": [mag, pack, k5, db] } },
  { id: "D3-50", tokens: { "5:5:5": [mag, pack, k5, db] } },
  { id: "D4", tokens: { "ETD39": [mag, pack, db], "Np 38": [pack], "XFMR-AUX-FLY-D": [pack, db] } },
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
  ["D2-30", 2 * 37.1 * RHO.ferrite / 1000, CU(0.115, 4, 10.6), 0.45],
  ["D2-40", 102 * RHO.ferrite / 1000, CU(0.166, 5, 16.4), 0.55],                    // E60 1×E70 N5
  ["D2-50", 2 * 102 * RHO.ferrite / 1000, CU(0.2305, 3, 19.6), 1.1],                // E60 2×E70 N3
  ["D3-30", 3 * 37.1 * RHO.ferrite / 1000, CU(0.115, 7 + 14 * 0.286, 9.8), 0.75],   // E60 sec foil 0.10×28 = 2.8 mm² ≈ 0.286×pri
  ["D3-40", 2 * 102 * RHO.ferrite / 1000, CU(0.2305, 6 + 12 * 0.258, 13.8), 1.35],  // sec 0.127×28 = 3.56 mm²
  ["D3-50", 2 * 102 * RHO.ferrite / 1000, CU(0.2305, 5 + 10 * 0.206, 17.3), 1.35],
];
for (const [id, core, cu, doc] of MASS) {
  const m = (core + cu) * 1.10;
  ck(`${id} mass`, Math.abs(m - doc) / m <= 0.20, `computed ${f1(m, 2)} kg (core ${f1(core, 2)} + Cu ${f1(cu, 2)} +10% build) vs documented ${doc} kg`);
}
console.log(fails ? `\n${fails} SYNC FAILURE(S)` : "\nMAGNETICS SYNC CLEAN — every carrier agrees with the identity table; masses computed, not eyeballed");
process.exit(fails ? 1 : 0);
