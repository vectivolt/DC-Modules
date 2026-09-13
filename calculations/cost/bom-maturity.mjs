// bom-maturity.mjs — E57 standing gate: the BOM is MATURE when every part line resolves to a
// defensible sourcing state. States (lcsc-map taxonomy + E57's DIRECT):
//   ORDERABLE      a specific catalog part (LCSC or named mpn) verified to meet the rating
//   SECOND-SOURCE  primary is off-catalog; a verified equivalent is named
//   DIRECT         vendor-direct order code documented (Talema/Hongfa/MeanWell/Schaffner class)
//   CLASS          the design specifies a rating; purchasing selects — the entry MUST carry the
//                  spec line (and candidates where the class is non-trivial)
//   CUSTOM         built to our drawing (the module magnetics pages)
//   REVIEW         tracked open decision — allowed only WITH an actionable note
// FAIL conditions: any mpn the BOM can emit that resolves UNMAPPED, or an entry with no
// spec/note/lcsc/mpn substance. This is the "generic, widely available, properly matured"
// directive as a gate instead of a hope. Run: node calculations/cost/bom-maturity.mjs
import { DB, skuOverrides, BUILDABLE_SKUS } from "./parts-db.mjs";
import { LCSC, lcscForPart } from "./lcsc-map.mjs";

const mpns = new Set(DB.map((r) => r.mpn));
for (const sku of [...BUILDABLE_SKUS]) for (const ov of Object.values(skuOverrides[sku] ?? {}))
  if (ov.mpn) mpns.add(ov.mpn);

let fails = 0, counts = {}, unmapped = [], thin = [];
for (const m of [...mpns].sort()) {
  const r = lcscForPart(m, "");
  const st = r.status ?? "UNMAPPED";
  counts[st] = (counts[st] ?? 0) + 1;
  if (st === "UNMAPPED") { unmapped.push(m); fails++; continue; }
  const substance = r.lcsc || r.mpn || r.spec || r.note;
  if (!substance) { thin.push(`${m} [${st}]`); fails++; }
  if (st === "REVIEW" && !r.note) { thin.push(`${m} [REVIEW without action note]`); fails++; }
}
console.log("=== BOM MATURITY (E57) ===");
console.log("  " + Object.entries(counts).sort().map(([k, v]) => `${k}: ${v}`).join(" · "));
if (unmapped.length) console.log("  UNMAPPED:\n    " + unmapped.join("\n    "));
if (thin.length) console.log("  NO SUBSTANCE:\n    " + thin.join("\n    "));
const reviews = Object.entries(LCSC).filter(([, v]) => v.status === "REVIEW").map(([k]) => k);
console.log(`  tracked REVIEW decisions (${reviews.length}): ${reviews.join(", ")}`);
console.log(fails ? `\n${fails} MATURITY FAILURE(S)` : "\nBOM MATURE — every line ORDERABLE / SECOND-SOURCE / DIRECT / CLASS(spec) / CUSTOM(drawing) / tracked-REVIEW");
process.exit(fails ? 1 : 0);
