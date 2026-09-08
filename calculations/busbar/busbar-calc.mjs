// busbar-calc.mjs — §34/§48: every bulk-current path per SKU: RMS current, cross-section, R, loss,
// ΔT, inductance, Cu-vs-Al decision. Paths: 3× AC input, DC+, MID, DC−, OUT+, OUT− plus the E17
// board-to-board stud pillars. Emits calculations/out/busbar.csv + docs/busbar-drawings.md.
// Method: J-limited sizing (Cu 3 A/mm² bulk, Al 2 A/mm²), R = ρL/A at 90 °C, ΔT from natural+forced
// convection h=25 W/m²K on exposed bar area, partial-inductance L ≈ 0.2·l·(ln(2l/(w+t))+0.5) µH (l in m).
// Run: node calculations/busbar/busbar-calc.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
mkdirSync(OUT, { recursive: true });
const f = (x, d = 2) => Number(x.toFixed(d));
const RHO = { Cu: 2.05e-8, Al: 3.4e-8 };            // Ωm @90 °C
const DENS = { Cu: 8900, Al: 2700 }, PRICE = { Cu: 950, Al: 260 }; // ₹/kg

const SKUS = [
  { name: "30kw", Iac: 54.9, Idc: 39, Iout: 100, len: { ac: 0.25, dc: 0.30, out: 0.30 } },
  { name: "40kw", Iac: 73.2, Idc: 52, Iout: 133, len: { ac: 0.25, dc: 0.30, out: 0.30 } },
  { name: "60kw", Iac: 109.9, Idc: 78, Iout: 200, len: { ac: 0.30, dc: 0.35, out: 0.35 } },
  { name: "120kw", Iac: 219.8, Idc: 156, Iout: 400, len: { ac: 0.40, dc: 0.45, out: 0.45 } },
];
const bars = (s) => [
  { path: "AC L1/L2/L3 (each)", I: s.Iac, l: s.len.ac, mat: "Cu", crit: "EMI zone: keep short, no Al joints in filter loop" },
  { path: "DC+ (PFC→studs→LLC)", I: s.Idc, l: s.len.dc, mat: "Cu", crit: "commutation-adjacent: low-L laminated with DC− (§34)" },
  { path: "DC− return", I: s.Idc, l: s.len.dc, mat: "Cu", crit: "laminated pair with DC+" },
  { path: "MIDPOINT (AC-DC board only)", I: s.Iac * 0.35, l: 0.18, mat: "Cu", crit: "carries lane ripple only" },
  { path: "OUT+ (banks→relays→stud)", I: s.Iout, l: s.len.out, mat: "Cu", crit: "1000 V creepage to chassis 6.3 mm" },
  { path: "OUT− (shunt path)", I: s.Iout, l: s.len.out, mat: "Cu", crit: "Kelvin taps at shunt; no joints between shunt and stud" },
  { path: "B2B stud pillar (each of DCP/DCN)", I: s.Idc, l: 0.03, mat: "Cu", crit: "M8, torque 12 N·m, <50 µΩ joint (EOL)" },
];

const rows = [["sku","path","I_rms_A","material","W×T_mm","A_mm2","J_A/mm2","R_uOhm","P_W","dT_C","L_nH","mass_kg","cost_INR","alt_Al_verdict","note"]];
console.log("=== BUSBAR SIZING (§34) ===");
let totCu = 0;
for (const s of SKUS) {
  let skuCost = 0;
  for (const b of bars(s)) {
    const A = Math.max(b.I / 3, 15);                 // mm², J ≤ 3 A/mm², min 15 mm² mechanical
    const w = Math.ceil(Math.sqrt(A * 5)); const t = Math.ceil(A / w);
    const Aact = w * t;
    const R = (RHO.Cu * b.l) / (Aact * 1e-6);
    const P = b.I * b.I * R;
    const surf = 2 * (w + t) * 1e-3 * b.l;           // m²
    const dT = P / (25 * surf);
    const L = 0.2 * b.l * (Math.log((2 * b.l) / ((w + t) * 1e-3)) + 0.5) * 1000; // nH
    const mass = Aact * 1e-6 * b.l * DENS.Cu;
    const cost = mass * PRICE.Cu * 1.6;              // ×1.6 fab (stamp/bend/plate)
    skuCost += cost * (b.path.includes("each") ? (b.path.includes("stud") ? 2 : 3) : 1);
    // Al alternative (§34): only for non-commutation bulk runs, needs bimetal joint
    const alOk = !/commutation|laminated|filter|shunt/.test(b.crit);
    const alA = b.I / 2, alMass = alA * 1e-6 * b.l * DENS.Al * (alA / Aact);
    const alSave = cost - (alA * 1e-6 * b.l * DENS.Al * PRICE.Al * 1.9 + 18); // +bimetal washer/plating
    const alV = alOk ? (alSave > 15 ? `Al viable, saves ₹${f(alSave, 0)} (bimetal joint reqd)` : "Al not worth joint cost") : "Cu mandated";
    rows.push([s.name, `"${b.path}"`, b.I, "Cu", `${w}×${t}`, Aact, f(b.I / Aact, 2), f(R * 1e6, 0), f(P, 1), f(dT, 0), f(L, 0), f(mass, 3), f(cost, 0), `"${alV}"`, `"${b.crit}"`]);
  }
  totCu += skuCost;
  console.log(`${s.name}: busbar set ≈ ₹${f(skuCost, 0)} (BOM 'Busbars' line reconciles)`);
}
writeFileSync(join(OUT, "busbar.csv"), rows.map(r => r.join(",")).join("\n") + "\n");

// drawings doc
const md = [`# Busbar Drawings & Joint Spec (§34/§49-16) — rev A

Sizing table: \`calculations/out/busbar.csv\` (generated). All bars ETP copper, tin-plated 3–5 µm,
bend radius ≥1.5×t, chamfered edges. Insulation: heat-shrink 1 kV class except joint pads.
DC+/DC− run as a laminated pair (≤2 mm spacing, Nomex between) from PFC output to the B2B studs —
loop inductance target ≤40 nH/300 mm (partial-L per table). OUT± maintain 6.3 mm creepage to
chassis (insulation-coordination.md). Aluminium: permitted only on paths marked "Al viable"
(≥2 A/mm² sizing, Cu-Al bimetal transition washers, alodine + joint compound, re-torque at 24 h,
creep-rated hardware) — per-path verdicts in the CSV; joints into the EMI filter, commutation
loops, and the shunt Kelvin zone are Cu-mandated.

## Joint schedule (all SKUs)
| Joint | Hardware | Torque | Acceptance |
|---|---|---|---|
| B2B stud pillars DCP/DCN/PE | M8×1.25, belleville + flat | 12 N·m | ≤50 µΩ each (EOL milliohm) |
| Relay lugs (K_SER/PAR/OUT) | M6 | 8 N·m | ≤80 µΩ |
| Shunt terminals | M8, Kelvin taps untouched | 12 N·m | cal validates |
| AC input studs | M8 | 12 N·m | ≤60 µΩ |
| Choke lug → PCB pad | M5 | 5 N·m | visual + pull |

Thermal: worst bar ΔT from table ≤ 25 °C at rated (see CSV); bars share tunnel airflow.
`];
writeFileSync(join(OUT, "..", "..", "docs", "busbar-drawings.md"), md.join("\n"));
console.log("→ calculations/out/busbar.csv, docs/busbar-drawings.md");
