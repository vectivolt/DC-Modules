#!/usr/bin/env node
// mag-docs.mjs — E70: one magnetics page per module SKU (docs/magnetics-<sku>.md), generated on every battery run.
//
// Each page is the whole story of that module's magnetics: what each part does, the drawing to quote, the proof the gates
// computed at the simulated corners (quoted row by row from calculations/out/evidence/*.json — never retyped), how a
// winder builds and accepts it, how to prototype it, and what it costs (from the generated BOM CSV).
// The drawing rows below are the registered constructions; mag-sync asserts their identity tokens independently.
// Run (after stress-audit, conductor-audit, magnetics-envelope, temp-critique, current-coordination, bom-gen; mag-sync checks the result):
//   node calculations/magnetics/mag-docs.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { D1 } from "./d1-choke.mjs";
import { D2, D3 } from "./magnetics-envelope.mjs";
import { TANKS } from "../llc/tanks.mjs";
import { masthead, footer } from "../doc-chrome.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "calculations", "out");
const SKUS = ["30kw", "40kw", "50kw", "50kwa"];
const NAME = { "30kw": "30 kW", "40kw": "40 kW", "50kw": "50 kW liquid", "50kwa": "50 kW air" };
const base = (sku) => (sku === "50kwa" ? "50kw" : sku);
const inr = (x) => Math.round(x).toLocaleString("en-IN");
const cell = (t) => String(t).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

// ---- gate evidence ----
const EV = Object.fromEntries(["stress-audit", "conductor-audit", "magnetics-envelope", "temp-critique", "current-coordination"]
  .map((g) => { const p = join(OUT, "evidence", `${g}.json`); if (!existsSync(p)) throw new Error(`mag-docs: ${g} evidence missing — run the gate first`); return [g, JSON.parse(readFileSync(p, "utf8"))]; }));
for (const [g, e] of Object.entries(EV)) if (e.exit !== 0) throw new Error(`mag-docs: ${g} did not pass (exit ${e.exit}) — a failing gate cannot be published as proof`);
const rows = (gate, pred) => EV[gate].rows.filter(pred).map((r) => ({ gate, ...r }));
// E71: the PyOpenMagnetics second opinion runs by hand in a Python venv (calculations/magnetics/mkf-crosscheck.py) — optional here,
// but a failing run is never published
const MKF_PATH = join(OUT, "evidence", "mkf-crosscheck.json"), MKF = existsSync(MKF_PATH) ? JSON.parse(readFileSync(MKF_PATH, "utf8")) : null;
if (MKF && MKF.exit !== 0) throw new Error("mag-docs: mkf-crosscheck did not pass — re-run it or remove its evidence file");
const mkfRows = (pred) => (MKF ? MKF.rows.filter(pred).map((r) => ({ gate: "mkf-crosscheck", ...r })) : []);
const skuRe = (sku) => new RegExp(`^${sku}\\b`);
const proof = (list) => `| Gate | Check | Result | |
|---|---|---|:---:|
${list.map((r) => `| \`${r.gate}\` | ${cell(r.status === "info" ? `${r.tag} · ${r.name}` : r.name)} | ${cell(r.detail || "—")} | ${r.status === "ok" ? "✅" : r.status === "info" ? "ℹ️" : "❌"} |`).join("\n")}`;

// ---- prices from the generated BOM ----
const bom = (sku) => {
  const lines = readFileSync(join(OUT, `bom-${sku}.csv`), "utf8").trim().split("\n");
  const H = lines[0].split(",");
  const m = new Map();
  for (const l of lines.slice(1)) {
    const c = l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.replace(/^"|"$/g, ""));
    const r = Object.fromEntries(H.map((h, i) => [h, c[i]]));
    if (!r.mpn || r.mpn === "MECH" || /^TOTAL/.test(r.mpn)) continue;
    const x = m.get(r.mpn) ?? { qty: 0, u1k: +r.unit_1k, u10k: +r.unit_10k, status: r.lcsc_status };
    x.qty += +r.qty || 0; m.set(r.mpn, x);
  }
  return m;
};

// ---- the registered drawings, per SKU (construction identity = the engines' tables; acceptance lines = the register) ----
const T = (sku) => TANKS[base(sku)];
const DRAW = {
  D1: {
    "30kw": { mpn: "IND-PFC-165u", dwg: "PMP-MAG-D1-30 rev C", L0: "150–185 µH (165 nom)", Lpk: "L @ 78 A pk ≥ 75 µH", rdc: "≤ 6.9 mΩ @ 25 °C (build 6.08) and within ±5 % of the lot median", op: "54.7 A fundamental + 6.3 A rms 50 kHz ripple at 330 VAC", size: "⌀ 92 × H 88 mm", mass: "1.9 kg", layers: "21 / 15 / 3", cut: "≥ 7.1 m", tt: "74 A DC → hot-spot ≤ 19 K above the plate", cutout: "not required — one lost pad computes 131 °C, inside Class F (stress-audit)" },
    "40kw": { mpn: "IND-PFC-116u-40", dwg: "PMP-MAG-D1-40 rev C", L0: "106–135 µH (116 nom)", Lpk: "L @ 104 A pk ≥ 61 µH", rdc: "≤ 4.55 mΩ @ 25 °C (build 3.97) and within ±5 % of the lot median", op: "72.9 A fundamental + 7.83 A rms ripple at 330 VAC", size: "⌀ 94 × H 115 mm", mass: "2.8 kg", layers: "17 / 9", cut: "≥ 6.9 m", tt: "95.9 A DC → hot-spot ≤ 22 K above the plate", cutout: "not required — one lost pad computes 116 °C, inside Class F (stress-audit)" },
    "50kw": { mpn: "IND-PFC-107u-50", dwg: "PMP-MAG-D1-50 rev C", L0: "98–124 µH (107 nom)", Lpk: "L @ 129.5 A pk ≥ 45 µH", rdc: "≤ 4.15 mΩ @ 25 °C (build 3.63) and within ±5 % of the lot median", op: "91.2 A fundamental + 10.16 A rms ripple at 330 VAC", size: "⌀ 94 × H 115 mm", mass: "2.7 kg", layers: "17 / 7", cut: "≥ 6.4 m", tt: "117.3 A DC → hot-spot ≤ 26 K above the plate", cutout: "**mandatory on the liquid SKU** — a lost pad has no air path in the sealed module: NC 130 ± 5 °C thermostat on each D1 clamp cap, in the magnetics cutout loop" },
  },
  D2: {
    "30kw": { mpn: "IND-LR-E70-30", dwg: "PMP-MAG-D2-30 rev F", L: "5.16 µH", gap: "Σ ≈ 8.3 mm", rdc: "≤ 1.35 mΩ", rac: "≤ 3.35 mΩ", pd: "≥ 2.0 kV", mass: "1.3 kg" },
    "40kw": { mpn: "IND-LR-E70-40", dwg: "PMP-MAG-D2-40 rev F", L: "4.07 µH", gap: "Σ ≈ 10.5 mm", rdc: "≤ 1.1 mΩ", rac: "≤ 3.45 mΩ", pd: "≥ 1.9 kV", mass: "1.3 kg" },
    "50kw": { mpn: "IND-LR-E70-50", dwg: "PMP-MAG-D2-50 rev F", L: "3.28 µH", gap: "Σ ≈ 13.1 mm", rdc: "≤ 0.92 mΩ", rac: "≤ 3.7 mΩ", pd: "≥ 2.0 kV", mass: "1.35 kg" },
  },
  D3: {
    "30kw": { mpn: "XFMR-LLC-CELL-2E70-30", dwg: "PMP-MAG-D3-30 rev D", sets: 2, former: "TDK B66372B2000 (2-set, lN 230.5 mm)", turns: "6:6∥6", Lm: "28 µH", AL: "0.778 µH/T² (Σ gap ≈ 2.2 mm)", pri: "TIW-served litz 3850×0.063 mm (12 mm²)", sec: "Cu foil 0.10 × 28 mm, one per turn", mlt: "189 / 211 / 232 mm", llk: "0.172 µH", rdc: "P ≤ 2.1 · S1 half ≤ 8.0 · S2 half ≤ 9.8 mΩ", pd: "≥ 2.0 kV", size: "≤ 70.5 × 65.9 × 91 mm plus headers", mass: "1.3 kg" },
    "40kw": { mpn: "XFMR-LLC-CELL-3E70-40", dwg: "PMP-MAG-D3-40 rev D", sets: 3, former: "3-set former, lN 293 mm (custom — tooling in the part price)", turns: "4:4∥4", Lm: "21.75 µH", AL: "1.359 µH/T² (Σ gap ≈ 1.9 mm)", pri: "TIW-served litz 3536×0.071 mm (14 mm²)", sec: "2 × Cu foil 0.08 × 28 mm per turn", mlt: "253 / 272 / 290 mm", llk: "0.090 µH", rdc: "P ≤ 1.55 · S1 half ≤ 4.5 · S2 half ≤ 5.1 mΩ", pd: "≥ 1.9 kV", size: "≤ 70.5 × 65.9 × 120 mm plus headers", mass: "1.85 kg" },
    "50kw": { mpn: "XFMR-LLC-CELL-3E70-50", dwg: "PMP-MAG-D3-50 rev D", sets: 3, former: "3-set former, lN 293 mm (custom — shared with D3-40)", turns: "4:4∥4", Lm: "17.8 µH", AL: "1.113 µH/T² (Σ gap ≈ 2.3 mm)", pri: "TIW-served litz 3536×0.071 mm (14 mm²)", sec: "2 × Cu foil 0.08 × 28 mm per turn", mlt: "253 / 272 / 290 mm", llk: "0.090 µH", rdc: "P ≤ 1.55 · S1 half ≤ 4.5 · S2 half ≤ 5.1 mΩ", pd: "≥ 2.0 kV", size: "≤ 70.5 × 65.9 × 120 mm plus headers", mass: "1.85 kg" },
  },
  CT: {
    "30kw": { line: "Talema ACX-1100 (2500:1, 100 A)", lineMpn: "ACX-1100", rb: "22 Ω", F01: 120, sat01: "150 A pk", obs01: "166 A", res: "1:100, 100 A rms class (tank class 78 A = 78 %)", resMpn: "CT-RES-1:100-100A", rr: "0.47 Ω", F11: 140, lin11: "335 A pk (1.05 × the 318.6 A monitor peak)" },
    "40kw": { line: "Talema ACX-1150 class (2500:1, 150 A)", lineMpn: "CT-LINE-2500-150A", rb: "18 Ω", F01: 155, sat01: "194 A pk", obs01: "205 A", res: "1:100, 150 A rms class (tank class 100 A = 67 %)", resMpn: "CT-RES-1:100-150A", rr: "0.36 Ω", F11: 180, lin11: "438 A pk (1.05 × the 417 A monitor peak)" },
    "50kw": { line: "Talema ACX-1150 class (2500:1, 150 A)", lineMpn: "CT-LINE-2500-150A", rb: "13 Ω", F01: 195, sat01: "244 A pk", obs01: "266 A", res: "1:100, 150 A rms class (tank class 120 A = 80 %)", resMpn: "CT-RES-1:100-150A", rr: "0.30 Ω", F11: 220, lin11: "528 A pk (1.05 × the 502.7 A monitor peak)" },
  },
};
const D7 = JSON.parse(readFileSync(join(OUT, "dm-choke-design.json"), "utf8")).d7;
const D7_ACC = { "30kw": { irms: 55.9, dm: 83, od: 95, h: 40 }, "40kw": { irms: 73.3, dm: 110, od: 95, h: 40 }, "50kw": { irms: 91.6, dm: 138, od: 106, h: 46 } };

// ---- page ----
function page(sku) {
  const b = base(sku), path = `docs/magnetics-${sku}.md`, P = bom(sku), air = sku !== "50kw";
  const d1 = D1[sku], d2 = D2[sku], d3 = D3[sku], t = T(sku), W1 = DRAW.D1[b], W2 = DRAW.D2[b], W3 = DRAW.D3[b], CT = DRAW.CT[b], d7 = D7[b], A7 = D7_ACC[b];
  const price = (mpn) => P.get(mpn) ?? { qty: 0, u1k: 0, u10k: 0, status: "—" };
  const mount = sku === "50kw" ? "both yoke faces gap-padded to the two coldplates, end turns potted to the plate" : "both yoke faces gap-padded to the upper and lower extrusion webs, end turns potted to the web";
  const bill = [
    ["D1", "PFC boost choke", W1.mpn, `${d1.stack} × 0077908A7 Kool Mµ 26µ, N = ${d1.N} ± 1, ${d1.nw} × ${d1.d * 1e3} mm bundle`],
    ["D2", "external resonant inductor", W2.mpn, `2 × E70/33/32 PC95-class, N 5, litz ${d2.strands}×0.05 mm, ${W2.L} ± 3 %`],
    ["D3", "full-bridge transformer cell", W3.mpn, `${W3.sets} × E70/33/32 per cell, ${W3.turns}, primaries of the two cells in series (n = 2)`],
    ["D7", "3-phase CM choke", "CMC-3PH-2mH-SKU", `nanocrystalline ${d7.core} (A_Fe ≥ ${d7.AFe_mm2} mm²), 3 × ${d7.N} T, ${d7.aw_mm2} mm²${b === "30kw" ? " — Schaffner RT8131-63-2M8 catalog primary" : ""}`],
    ["D4", "110 W aux flyback", "XFMR-AUX-FLY-E", "ETD44 PC95, Np 38 / 6 / 4 / 4, reinforced barrier (common to every SKU)"],
    ["CT", "line current transformer", CT.lineMpn, `${CT.line}, burden ${CT.rb}`],
    ["CT", "resonant current transformer", CT.resMpn, `${CT.res}, burden ${CT.rr}`],
    ["—", "3.3 V buck inductor (catalog)", "CYA0630-10UH", "10 µH 3 A shielded"],
    ["—", "CAN common-mode choke (catalog)", "ACT45B-510-2P-TL003", "51 µH, 2-line"],
  ].map(([id, fn, mpn, what]) => ({ id, fn, mpn, what, ...price(mpn) }));
  const total10 = bill.reduce((a, r) => a + r.qty * r.u10k, 0);

  const V = MKF?.values?.[sku];
  const mkfPart = (part) => mkfRows((r) => skuRe(sku).test(r.name) && r.name.includes(` ${part} `));
  const envD = (part) => rows("magnetics-envelope", (r) => r.tag === part && skuRe(sku).test(r.name));
  const envLost = (part) => rows("magnetics-envelope", (r) => r.tag === `${part}-BOND-LOST` && skuRe(sku).test(r.name));
  const out = [masthead(path), `
> [!NOTE]
> **Purpose** — every magnetic on the **${NAME[sku]} module**: what it does, the drawing to quote, the proof the gates computed at
> the simulated corners, how a winder builds and accepts it, how to prototype it, and what it costs. **Generated by
> \`calculations/magnetics/mag-docs.mjs\` from the last battery run's gate evidence — do not hand-edit.** Method, materials,
> insulation system and the common parts (D4, test methods, failure modes): [magnetics hub](magnetics.md).

## At a glance

| Part | Function | Qty | Construction | ₹ / unit @10k | ₹ @10k | Status |
|---|---|---:|---|---:|---:|---|
${bill.map((r) => `| **${r.id}** | ${r.fn} · \`${r.mpn}\` | ${r.qty} | ${cell(r.what)} | ${inr(r.u10k)} | ${inr(r.qty * r.u10k)} | ${r.status} |`).join("\n")}
| **Total** | | | | | **${inr(total10)}** | |

\`\`\`mermaid
flowchart LR
  AC(["3-φ AC"]) --> D7["D7 · CM chokes × 2<br/>${d7.core}"] --> D1["D1 · PFC chokes × 3<br/>${d1.stack} × T79 · N ${d1.N}"]
  D1 --> BUS[("split DC bus<br/>650–830 V")]
  BUS --> FB["full-bridge LLC"] --> TANK["Cr ${t.crN} × 33 nF + D2 ${W2.L}"] --> D3["D3 cells × 2<br/>${W3.turns} · primaries in series"] --> BK["banks A + B"]
  BUS --> D4["D4 · aux flyback"]
  LCT["line CTs × 3 · ${CT.rb}"] -.- D1
  RCT["resonant CT · ${CT.rr}"] -.- TANK
  style D1 stroke:#d19a00,stroke-width:2px
  style D3 stroke:#1a9fb3,stroke-width:2px
  style TANK stroke:#b8732e,stroke-width:2px
\`\`\`

## How to read the proof tables

Every proof row below is copied from a gate's own output on the last battery run; a ✅ row passed its line, ℹ️ is information the
gate reports, and a failing gate stops the battery before this page is written.

| Gate | What it computes | The line it holds |
|---|---|---|
| \`magnetics-envelope\` | D2 and D3 flux, iGSE core loss and Dowell/Sullivan copper at all 32 power-solved corners, through a two-node (core, winding) thermal network of the real geometry | hot-spot ≤ 125 °C at 55 °C inlet · ≤ 135 °C at 75 °C inlet derated · ≤ 155 °C with every Rth +25 % · runaway margin ≥ 25 K · B̂ ≤ 50 % of hot Bsat |
| \`conductor-audit\` | AC resistance of every winding at the simulated switching frequency, and the production Rdc rows that catch a short strand count | Rac/Rdc inside the drawing's row |
| \`stress-audit\` | D1 biased inductance, current density, bonded thermal, clamp preload and bond loss; D7 DM-leakage flux and hot copper; CT classes | the acceptance line printed in each row |
| \`temp-critique\` | saturation at the 130 °C cutout, cold equilibria and the fault chain on measured 3C95 surfaces | B̂ ≤ 50 % Bsat(130 °C) · fault flux ≤ 60 % |
| \`current-coordination\` | D2 flux at the F.11 kill peak and CT observability through each trip's race | ≤ 217 mT · the kill lands inside the ADC rail |
| \`mag-sync\` | the identity of every part against every carrier, and the computed mass | tokens present · mass within ± 20 % |
| \`mkf-crosscheck\` | the D2 / D3 builds re-made in PyOpenMagnetics (OpenMagnetics MKF): winding Rdc from its own turn layout, the drawn gap under five fringing models, 2-D copper loss, and the thermal network at that copper — run by hand in a Python venv | Rdc ± 5 % · class lines (+25 % Rth ≤ 155 °C, runaway ≥ 25 K) at MKF's copper; ℹ️ where only a design line moves |

## D1 — PFC boost choke · qty 3 · \`${W1.mpn}\`

Vienna phase inductor at 50 kHz: DC bias from the line current plus switching ripple, a swing design on sendust that softens
without collapsing. The winding sits at line / switch-node potential and its bonded face is part of the basic barrier to PE.

| Row | Specification — ${W1.dwg} |
|---|---|
| Core | **${d1.stack} × Magnetics 0077908A7** Kool Mµ 26µ toroid (OD 78.94 / ID 48.21 / HT 17.02 mm max; AL 37 nH/T² ± 8 % per core); faces epoxy-bonded, distributed gap — no grinding |
| Winding | **N = ${d1.N} nominal, winder trims ± 1 turn per core lot** · **${d1.nw} × ${d1.d * 1e3} mm** grade-2 dual-coat enamelled round (Class 200), taped into one bundle every 150 mm, laid flat · bore layers ${W1.layers} · spread ≥ 300° |
| Electrical acceptance (100 %) | L₀ @ 0.1 V / 100 kHz **${W1.L0}** · **${W1.Lpk}** (pulse method) · Rdc **${W1.rdc}** — one open strand fails the lot window |
| Operating point | ${W1.op}, bus 830 V, AL − 8 % — loss and hot-spot in the proof table |
| Insulation | basic insulation to PE: bonded face through the module gap pad, bore through sleeve + clamp cap; recurring peak ≤ 540 V (no PD test) · winding ↔ core functional · Class F (155 °C) UL 1446 system |
| Thermal | one end face gap-pad bonded to the ${sku === "50kw" ? "coldplate" : "extrusion web"} · hot-spot limit 120 °C at 55 °C inlet · bonded type test: ${W1.tt} |
| Over-temperature cutout | ${sku === "50kwa" ? "not required on the air twin — one lost pad computes 129 °C, inside Class F (the liquid SKU carries one per choke)" : W1.cutout} |
| Mechanical · mounting | finished ${W1.size}, mass **${W1.mass}** (computed) · M6 A4-70 through the bore at 4.5 N·m on a Belleville via a GF-PPS insulating cap · 2-point glass banding |
| Terminations | 2 × tinned flying leads, 60 mm, strain-relief loop ≥ 10 mm before the board |
| Production test | 100 %: L₀ · L @ Ipk pulse · Rdc (row + lot window) · hipot **2.5 kV DC 1 min** winding ↔ bond-face plate + bore mandrel · first article: 4 kV 1.2/50 impulse × 5 each polarity, Rac @ 50 kHz recorded |
| Marking · qty | label p/n, rev, lot, date, N · qty 3 per module · operating ambient −40 … +55 °C full power, derated to +75 °C |

<details><summary><b>Proof at the simulated corners</b></summary>

${proof([
  ...rows("stress-audit", (r) => (r.tag === "D1" || r.tag === "D1-BUILD" || r.tag === "D1-COOLING") && skuRe(sku).test(r.name)),
  ...rows("conductor-audit", (r) => r.tag === "D1" && skuRe(b).test(r.name)),
  ...rows("temp-critique", (r) => r.tag === "D1-FAULT" && skuRe(b).test(r.name)),
])}

</details>

**Build and hold points.** (1) Stack the ${d1.stack} cores on the arbor, epoxy-bond the faces, cure clamped, band with 2 turns of glass tape.
(2) One layer 0.13 mm polyester over the stack. (3) Cut the ${d1.nw}-wire bundle ${W1.cut} and tape it every 150 mm. (4) Wind N from the
lot-trim card (the incoming AL sets ${d1.N} ± 1), bore layers ${W1.layers}, spread ≥ 300°, exits 25–35 mm apart. (5) Twist, sleeve and tin the
leads. **H1** L₀ inside the window, Rdc, turns photo. (6) Varnish per the hub's impregnation rule. **H2** L @ Ipk pulse. **H3** hipot, label.

## D2 — external resonant inductor · qty 1 · \`${W2.mpn}\`

The one gapped inductor of the full-bridge tank (InfyPower practice): it carries Lr ${(t.Lr * 1e6).toFixed(2)} µH minus the two D3 cells'
leakage and the 0.1 µH loop stray, at full AC swing and tank potential, 83–203 kHz. No bins — the ± 3 % gap tolerance plus the ± 30 %
cell-leakage band stays inside the ± 5 % Lr the tank decks were solved at.

| Row | Specification — ${W2.dwg} |
|---|---|
| Inductance | **${W2.L} ± 3 %** @ 140 kHz, 0.1 V (100 %) |
| Core · former | **2 × E70/33/32** PC95 / N95 / 3C95-class MnZn on TDK **B66372B2000** — powder cores prohibited in this slot |
| Winding | **N = 5**, compacted litz **${d2.strands}×0.05** mm (${((d2.strands * Math.PI * 0.05 ** 2) / 4).toFixed(1)} mm²), one layer across the 41 mm breadth over a ≥ 3 mm radial spacer |
| Gap | distributed centre-leg gap **${V ? `Σ ≈ ${V.d2GapMm.toFixed(1)} mm in ${V.d2GapSegments} segments` : W2.gap}**, every segment ≤ 1.0 mm, outer legs mated — ground to the AL that gives ${W2.L} at N 5${V ? "; Σ is the fringing-corrected first-grind guide (MKF)" : ""} |
| Rdc · Rac | Rdc **${W2.rdc}** @ 25 °C (100 %) · Rac **${W2.rac}** @ 203 kHz, 100 °C (sample 5 / lot) |
| Insulation · hipot · PD | basic insulation to PE through former + spacer + VPI class H · 100 % winding → bonded-face foil 2.5 kV DC · PD 5 / lot, extinction **${W2.pd}**, ≤ 10 pC |
| Thermal | ${mount} · hot-spot ≤ 125 °C at 55 °C inlet (type test, thermocouples beside a gap and on the winding) |
| Over-temperature cutout | one NC 130 ± 5 °C thermostat beside a gap, in the magnetics cutout loop |
| Mechanical · terminations | ≤ 70.5 × 65.9 × 59 mm · **${W2.mass}** · 2 litz flying leads out of one end-turn face, tinned 12 mm |
| Marking · qty | label p/n, rev, lot, serial, measured L · qty 1 per module · operating ambient −40 … +55 °C full power |

<details><summary><b>Proof at the simulated corners</b></summary>

${proof([
  ...rows("magnetics-envelope", (r) => r.tag === "LR" && skuRe(sku).test(r.name)),
  ...envD("D2"), ...envLost("D2"),
  ...rows("stress-audit", (r) => (r.tag === "D2" || r.tag === "D2c") && skuRe(sku).test(r.name)),
  ...rows("conductor-audit", (r) => r.tag === "D2" && skuRe(b).test(r.name)),
  ...rows("current-coordination", (r) => r.tag === "D2" && skuRe(sku).test(r.name)),
  ...mkfPart("D2"),
])}

</details>

**Build and hold points.** (1) Grind or space the centre-leg gap in segments of ≤ 1.0 mm toward the AL that gives ${W2.L} at N 5; glue,
cure clamped, re-measure (cure shifts AL about 1 %). (2) Wrap a ≥ 3 mm radial spacer over the former so the litz stays out of the gap
field. (3) Wind 5 turns of ${d2.strands}×0.05 mm litz in one layer. (4) Tin the served ends at 400 ± 20 °C. **H1** L inside ± 3 %, Rdc.
(5) VPI class H with the yoke faces masked. **H2** L re-check, Rac sample. (6) Fit the cutout beside a gap. **H3** 2.5 kV DC winding →
bonded-face foil, label with the measured L.

## D3 — full-bridge transformer cell · qty 2 · \`${W3.mpn}\`

One of two identical cells whose primaries are wired in series (overall n = 2); each cell's secondary feeds one bank through S1 ∥ S2.
Flux follows bank voltage, not load, so a power derate does not relieve the core corner. **Safety-critical:** this part carries the
reinforced barrier between the DC bus and the output — its barrier steps and hipot are witnessed on every unit.

| Row | Specification — ${W3.dwg} |
|---|---|
| Ratio · magnetizing | **${W3.turns} exactly** (P : S1 ∥ S2, S1 and S2 paralleled at the header) · Lm **${W3.Lm} ± 7 %** per cell @ 10 kHz, 0.1 V |
| Core · former | **${W3.sets} × E70/33/32** PC95 / N95 / 3C95-class · ${W3.former} |
| Gap | centre legs only, equal on every set, no position > 0.5 mm, ground to AL **${V ? W3.AL.replace(/Σ gap ≈ [\d.]+ mm/, `Σ gap ≈ ${V.d3GapMm.toFixed(1)} mm with fringing`) : W3.AL}** on the assembled cell |
| Primary | **${W3.pri}**, one layer |
| Secondary halves | ${W3.sec} · MLT S1 / P / S2 ${W3.mlt} |
| Leakage | per cell, both halves shorted, 140 kHz, after VPI: **${W3.llk} ± 30 %** — measured and labelled |
| Rdc @ 25 °C (100 %) | ${W3.rdc} |
| AC resistance (sample 5 / lot) | short-circuit R at 203 kHz with both halves shorted (the leakage fixture), referred to P, 25 °C${V ? ` — expected **${V.rsc1dMohm}–${V.rscMkfMohm} mΩ** (1-D … MKF)` : ""}; the first article fixes the lot line at its median + 10 %. Not a per-winding open-circuit Rac/Rdc: that loses the interleaved field cancellation and rejects good parts |
| Insulation system | Class H — VPI class H · TIW grade Class F minimum · pri ↔ sec **reinforced**, one barrier system: TIW wall + ≥ 3 barrier-tape layers between each shield and its secondary · shields to SH → DCN on the board |
| Hipot · PD | **100 %: pri ↔ sec ≥ 4.25 kV DC 1 s, witnessed and logged** · P → bonded-face foil 2.5 kV DC · S → foil 1.5 kV DC · PD type test + 5 / lot: extinction **${W3.pd}**, ≤ 10 pC after 1.2 × pre-stress |
| Thermal | ${mount} · type test at the named corners: ≤ 125 °C at 55 °C inlet, ≤ 135 °C at 75 °C derated (thermocouples at the winding outer surface and the centre leg) |
| Over-temperature cutout | one NC 130 ± 5 °C thermostat per cell at the winding hot-spot witness point — a lost bond is screened at EOL by the bonded thermal soak |
| Terminations | primary header P1 · P2 · SH on one end-turn face · secondary header SA · SB on the opposite face, ≥ 8 mm plus a slot between groups |
| Mechanical · marking | ${W3.size} · the 65.9 mm yoke-face height is controlled · **${W3.mass}** per cell · label p/n, rev, lot, serial, measured leakage, polarity dots |
| Production test | 100 %: ratio, Lm, leakage + label, Rdc × 3, pri ↔ sec and bonded-face hipots · sample: short-circuit R 5 / lot, PD 5 / lot · first article: dimensions, cross-section, impulse, PD and thermal type tests |

**Winding table (each cell)** — radial order from the centre leg; breadth 41 mm; conductors confined to the 28 mm centre band.

| # | Element | Construction | Laid over it |
|---:|---|---|---|
| 0 | former + base wrap | 1.2 mm wall | ≥ 2 layers barrier tape |
| 1 | **S1** (half of the secondary) | ${d3.N} T, ${W3.sec} | ≥ 3 layers barrier tape |
| 2 | shield 1 | 1 T foil, ends insulated from each other | 1 layer tape |
| 3 | **P** | ${d3.N} T ${W3.pri}, one layer | 1 layer tape |
| 4 | shield 2 | as shield 1 | ≥ 3 layers barrier tape |
| 5 | **S2** (the other half) | as S1 | ≥ 2 layers outer wrap |

<details><summary><b>Proof at the simulated corners</b></summary>

${proof([
  ...envD("D3"), ...envLost("D3"),
  ...rows("magnetics-envelope", (r) => r.tag === "BOND" && skuRe(sku).test(r.name)),
  ...rows("stress-audit", (r) => r.tag === "D3" && skuRe(sku).test(r.name)),
  ...rows("conductor-audit", (r) => r.tag === "D3" && skuRe(b).test(r.name)),
  ...rows("temp-critique", (r) => r.tag === "BSAT" && /D3/.test(r.name)),
  ...mkfPart("D3"), ...mkfRows((r) => r.tag === "MKF-LEAK"),
])}

</details>

**Build and hold points.** (1) Grind the centre legs to the AL target, equally on every set, ≤ 0.5 mm per position; glue-stack into the
former, cure, re-measure. (2) Base wrap. (3) S1 foil with fold-back tails to the bank side, then ≥ 3 barrier layers. (4) Shield 1, ends
insulated (no shorted turn), tail to SH. (5) Primary TIW-served litz in one even layer — strip the triple wall only to the drawing's window
with a thermal stripper, never a blade. (6) Shield 2 and ≥ 3 barrier layers. (7) S2 and the outer wrap. **H1** ratio, Lm, leakage written
on the traveler, Rdc × 3, polarity. (8) VPI class H with bond faces and headers masked. (9) Terminate the headers on opposite faces; fit
the cutout. **H2** full acceptance row, leakage re-measured after VPI. **H3** pri ↔ sec hipot — always the last electrical test — PD sample,
label with the post-VPI leakage and serial.

## D7 — 3-phase common-mode choke · qty 2 · \`CMC-3PH-2mH-SKU\`

Two CM stages with Y1 trios on the node between them and on the converter side (E65); the X2 star stages of the E68b filter carry the
differential mode, so no DM choke exists. The choke's own leakage (6–12 µH) rides every line crest, so its DM-bias flux is an acceptance
line, not a typical.${b === "30kw" ? " **At 30 kW the catalog Schaffner RT8131-63-2M8 is the primary part** (63 A / 2.8 mH, 89.1 A pk above the 82.6 A crest); this drawing is its second source." : ""}

| Row | Specification — PMP-MAG-D7-${b.replace("kw", "")} rev B |
|---|---|
| Core | nanocrystalline tape-wound toroid, µi(10 kHz) 25–40 k class (VITROPERM 500F / Nanoperm 30000 / AT&M CMC grade), Bsat ≥ 1.2 T · **${d7.core}** (${d7.ref} class) · the quote must state **A_Fe ≥ ${d7.AFe_mm2} mm²** (iron, excluding case) · never impregnated |
| Windings | 3 sectors × **${d7.N} T**, same sense, start and finish on one side · Cu **${d7.aw_mm2} mm²**, ≤ ${d7.layers} layers · sector spacing ≥ 3 mm plus a UL 1446 barrier · J ${d7.J} A/mm² |
| Electrical acceptance | **L_cm ≥ 2.0 mH @ 10 kHz** (design ${d7.Lcm10k_mH} mH at µ − 30 %) · **L_cm ≥ 1.0 mH @ 150 kHz** · DM-bias row: L_cm @ 10 kHz ≥ 2.0 mH and ≥ 80 % of unbiased with **${A7.dm} A** DM injected · leakage **${d7.Llk_band_uH.join("–")} µH**, measured and reported · quote check L_lk × I_pk / (8 × A_Fe) ≤ 0.6 T · Rdc per winding ≤ 0.85 mΩ @ 20 °C (calc ${d7.Rdc20_mR}), matched ± 5 % |
| Hipot | winding ↔ winding 2.5 kV AC 1 min · winding ↔ core 2.5 kV |
| Thermal | ΔT ≤ 45 K at **${A7.irms} A rms** (calc ${d7.dT} K at 100 °C copper, ${d7.P} W) · thermocouple between sectors |
| Mechanical | finished ⌀ ≤ ${A7.od} mm, H ≤ ${A7.h} mm (calc ${d7.ODw_mm} × ${d7.Hw_mm}) · bonded base plus band · 6 leads into plated holes · ≈ ${d7.kg} kg |
| Production test · marking · qty | 100 %: L_cm @ 10 kHz, Rdc × 3 matched, hipot · sample 5 / lot: L_cm @ 150 kHz, leakage · first article: DM-bias row and ΔT · label p/n, lot · qty 2 per module |

<details><summary><b>Proof at the simulated crest</b></summary>

${proof(rows("stress-audit", (r) => r.tag === "D7" && skuRe(b).test(r.name)))}

</details>

**Build.** Never remove the core case — nanocrystalline tape is strain-sensitive. Wind three sectors at 120° with ≥ 3 mm taped walls,
${d7.N} T each. **H1** L_cm, three matched Rdc, measured leakage recorded (the LISN model consumes it). No vacuum impregnation — surface
seal only. **H2/H3** hipots, label.

## D4 — aux flyback transformer · qty 1 · \`XFMR-AUX-FLY-E\`

The same part on every SKU (ETD44, reinforced barrier, 100 % hipot), qty 1 per module — core, windings, outline, terminations and acceptance rows on the [magnetics hub](magnetics.md#d4--aux-flyback-transformer-rev-e).

<details><summary><b>Proof</b></summary>

${proof([...rows("stress-audit", (r) => r.tag === "D4"), ...rows("temp-critique", (r) => /D4/.test(r.name))])}

</details>

## Current transformers · 3 line + 1 resonant

| Row | Line CT × 3 · \`${CT.lineMpn}\` | Resonant CT × 1 · \`${CT.resMpn}\` |
|---|---|---|
| Part | ${CT.line}, ± 1 %, 4 kV hipot, PCB pins | ${CT.res}, 20–250 kHz, pass-through — the tank conductor is the primary |
| Burden (on the PCB) | **${CT.rb}** → F.01 **${CT.F01} A pk** | **${CT.rr}** → F.11 **${CT.F11} A pk**, both polarities |
| Acceptance | ratio ± 0.5 % (100 %) · no saturation below **${CT.sat01}** (1.25 × F.01) at 25 °C on the fitted burden · linear to the F.01 + race point **${CT.obs01}** · phase ≤ 1° @ 50/60 Hz · ΔT ≤ 30 K | ratio ± 0.5 % **at 140 kHz** · linear to **${CT.lin11}** at 25 °C on the fitted burden · ΔT ≤ 30 K at the tank class current — a line-frequency core does not serve this slot |
| Outline · qty | catalogue outline (${b === "30kw" ? "ACX-1100: ⌀ 42 mm body, ⌀ 14.6 mm window" : "ACX-1150 class: 38.1 × 38.1 mm body, 33.0 mm pin row"}) · qty 3 per module | catalogue case with the pass-through window · qty 1 per module |
| Quote | bare — the burden lives on the PCB; secondary Rdc recorded per unit (EOL calibration) | bare |

<details><summary><b>Proof — trips observable through their race</b></summary>

${proof([
  ...rows("current-coordination", (r) => (r.tag === "F.01" || r.tag === "F.11") && skuRe(sku).test(r.name) && /threshold|observability|kill/.test(r.name)),
  ...rows("stress-audit", (r) => r.tag === "CT" || (r.tag === "BRD" && skuRe(b).test(r.name))),
])}

</details>

## Prototype route — before the winder

| Part | Fastest honest route for the first ${NAME[sku]} build |
|---|---|
| D1 | wind in-house on stocked 0077908A7 cores with 1.6 mm grade-2 wire to this sheet; measure L₀, L @ Ipk and Rdc against the rows |
| D2 · D3 | stocked TDK E70/33/32 N95 sets and B66372B2000 formers${W3.sets === 3 ? " (the 3-set former is custom — a machined or stacked-former prototype is acceptable for EVT)" : ""}; litz to order; wind to this sheet and measure Lm, leakage and Rac at 140 kHz (EVT T-31 / T-34) before trusting any tank result |
| D7 | ${b === "30kw" ? "Schaffner RT8131-63-2M8 from stock" : `custom wind on a cased ${d7.core} nanocrystalline core; qualify the DM-bias row before the LISN scan`} |
| CTs | Talema catalogue parts (ACX line CTs, AS-series resonant CT) |
| D4 | bring the control up on a catalogue 24 V supply (Mean Well RSDH-150-24 class plus a 24 → 15 V converter) until the ETD44 part arrives |

## EVT hooks

| Test | What it closes for these magnetics |
|---|---|
| T-31 | first-article D3 short-circuit R at 203 kHz against the 1-D … MKF bracket — it decides which copper model the D3 thermal margin rests on — plus D2 Rac and ΔT at the class current for every D2 / D3 winding${V?.watch ? " · **watch:** at MKF's copper this D3 cell exceeds its 125 °C design line (class lines hold) — the D3 proof table carries the computed foil-band fallback" : ""} |
| T-33 | D1 as-mounted resonance search and endurance |
| T-34 | the assembled tank: D2 ± 3 %, cell leakage ± 30 %, fr within ± 5 % |
| T-37 | D2 flux at the F.11 kill with a search coil |
| T-09 · T-18 · T-29 | D4 clamp, thermal and cold start |

${footer(path)}`];
  writeFileSync(join(ROOT, path), out.join("\n") + "\n");
  return total10;
}

const totals = Object.fromEntries(SKUS.map((s) => [s, page(s)]));
console.log(`→ docs/magnetics-{${SKUS.join(",")}}.md — magnetics ₹ @10k ${SKUS.map((s) => `${s} ${inr(totals[s])}`).join(" · ")}`);
