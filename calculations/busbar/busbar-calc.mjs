// busbar-calc.mjs — §34/§48: every bulk-current path per SKU: RMS current, cross-section, R, loss,
// ΔT, inductance, Cu-vs-Al decision. Paths: 3× AC input, DC+, MID, DC−, OUT+, OUT− plus the E17
// board-to-board stud pillars. Emits calculations/out/busbar.csv + docs/busbar-drawings.md.
// Method: J-limited sizing (Cu 3 A/mm² bulk, Al 2 A/mm²), R = ρL/A at 90 °C, ΔT from natural+forced
// convection h=25 W/m²K on exposed bar area, partial-inductance L ≈ 0.2·l·(ln(2l/(w+t))+0.5) µH (l in m).
// Run: node calculations/busbar/busbar-calc.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mechLines } from "../cost/parts-db.mjs";
import { footer, masthead } from "../doc-chrome.mjs";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
mkdirSync(OUT, { recursive: true });
const f = (x, d = 2) => Number(x.toFixed(d));
const RHO = { Cu: 2.05e-8, Al: 3.4e-8 };            // Ωm @90 °C
const DENS = { Cu: 8900, Al: 2700 }, PRICE = { Cu: 950, Al: 260 }; // ₹/kg

const SKUS = [
  { name: "30kw", Iac: 54.9, Idc: 39, Iout: 100, len: { ac: 0.25, dc: 0.30, out: 0.30 } },
  { name: "40kw", Iac: 73.2, Idc: 52, Iout: 133, len: { ac: 0.25, dc: 0.30, out: 0.30 } },
  { name: "50kw", Iac: 91.6, Idc: 65, Iout: 167, len: { ac: 0.25, dc: 0.30, out: 0.30 } },   // E61: 50 kW row added (liquid and air share every bulk current)
  // E54: 60/120 kW single-board rows retired (products are cabinets; archive/pre-focus-E49)
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
const TABLES = {}, SETCOST = {};
for (const s of SKUS) {
  let skuCost = 0;
  TABLES[s.name] = [];
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
    TABLES[s.name].push(`| ${b.path} | ${f(b.I, 1)} | ${w} × ${t} | ${f(b.I / Aact, 2)} | ${f(R * 1e6, 0)} | ${f(P, 1)} | ${f(dT, 0)} | ${f(L, 0)} | ${alV} |`);
  }
  totCu += skuCost;
  SETCOST[s.name] = skuCost;
  const bomLine = mechLines[s.name].find(([d]) => /^Busbars/.test(d))[2];
  console.log(`${s.name}: busbar set ≈ ₹${f(skuCost, 0)} vs BOM 'Busbars + studs + harness' line ₹${bomLine}`);
}
writeFileSync(join(OUT, "busbar.csv"), rows.map(r => r.join(",")).join("\n") + "\n");

// drawings doc
const H = "| Path | I rms (A) | W × T (mm) | J (A/mm²) | R (µΩ, 90 °C) | Loss (W) | ΔT (K) | L (nH) | Aluminium verdict |\n|---|---:|---:|---:|---:|---:|---:|---:|---|";
const md = [masthead("docs/busbar-drawings.md"), `
> [!NOTE]
> **Purpose** — every bulk-current copper path in a module: the current it carries, its section, resistance, loss,
> temperature rise and inductance, whether aluminium is allowed, and how each joint is made.
> **Generated by \`calculations/busbar/busbar-calc.mjs\` — do not hand-edit.** Machine table: \`calculations/out/busbar.csv\`.

## Where the bulk current flows

\`\`\`mermaid
flowchart LR
  AC["AC studs<br/>L1 · L2 · L3"] -->|"Cu mandated<br/>EMI zone"| PFC["Vienna PFC<br/>AC-DC board"]
  PFC -->|"DC+ / DC− laminated pair<br/>≤ 40 nH / 300 mm"| STUD["B2B stud pillars<br/>DCP · DCN · PE"]
  PFC -.- MID["midpoint bar<br/>AC-DC board only · lane ripple"]
  STUD --> LLC["full-bridge LLC<br/>DC-DC board"]
  LLC --> BANKS["banks A + B"]
  BANKS -->|"OUT+ via relays + DOUT"| OUT["output studs"]
  BANKS -->|"OUT− via shunt<br/>Kelvin zone"| OUT
  style STUD stroke:#d19a00,stroke-width:2px
\`\`\`

## Construction rules (all SKUs)

| Rule | Value |
|---|---|
| Material | ETP copper, tin-plated 3–5 µm, bend radius ≥ 1.5 × t, chamfered edges |
| Sizing | J ≤ 3 A/mm² (Cu), 15 mm² mechanical minimum; R at 90 °C; ΔT from h = 25 W/m²K on exposed area |
| Insulation | heat-shrink 1 kV class except joint pads; OUT± keep 6.3 mm creepage to chassis ([insulation coordination](insulation-coordination.md)) |
| DC± | laminated pair from PFC output to the B2B studs, ≤ 2 mm spacing with Nomex between; loop target ≤ 40 nH / 300 mm |
| Aluminium | only on paths marked *Al viable*: ≥ 2 A/mm² sizing, Cu–Al bimetal washers, alodine + joint compound, re-torque at 24 h, creep-rated hardware. EMI filter joints, commutation loops and the shunt Kelvin zone stay copper |

> [!IMPORTANT]
> **Thermal acceptance:** the worst bar ΔT at rated current is ${f(Math.max(...rows.slice(1).map((r) => Number(r[9]))), 0)} K against the 25 K line; bars share the tunnel airflow.

## Sizing per SKU
`];
for (const s of SKUS) {
  const bomLine = mechLines[s.name].find(([d]) => /^Busbars/.test(d))[2];
  md.push(`### ${s.name === "50kw" ? "50 kW (liquid and air share every bulk current)" : s.name.replace("kw", " kW")} — ${s.Iac} A line · ${s.Idc} A bus · ${s.Iout} A output\n`, H, ...TABLES[s.name],
    `\nBusbar set ≈ **₹${f(SETCOST[s.name], 0)}** (copper × 1.6 fabrication) · BOM mechanical line "busbars + studs + harness" ₹${bomLine}${Math.abs(SETCOST[s.name] - bomLine) > 25 ? " — reconcile at the mechanical RFQ" : ""}.\n`);
}
md.push(`## Joint schedule (all SKUs)

| Joint | Hardware | Torque | Acceptance |
|---|---|---:|---|
| B2B stud pillars DCP / DCN / PE | M8 × 1.25, Belleville + flat washer | 12 N·m | ≤ 50 µΩ each (EOL milliohm check) |
| Relay lugs (K_SER / K_PAR / K_OUT) | M6 | 8 N·m | ≤ 80 µΩ |
| Shunt terminals | M8, Kelvin taps untouched | 12 N·m | calibration validates |
| AC input studs | M8 | 12 N·m | ≤ 60 µΩ |
| Choke centre bolt (D1 stacks) | M6 + silicone pad; ≥ 3 kg stacks add two-point banding | first article | leads are soldered flying leads — the old M5 lug row predated D1 rev B |

${footer("docs/busbar-drawings.md")}`);
writeFileSync(join(OUT, "..", "..", "docs", "busbar-drawings.md"), md.join("\n") + "\n");
console.log("→ calculations/out/busbar.csv, docs/busbar-drawings.md");
