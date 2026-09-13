// fault-energy.mjs — E59 standing gate: the "nothing blows up, nothing burns" audit, computed.
// Every stored-energy reservoir is enumerated with its worst-case dump path and the path's
// rating; every power conductor is shown to outlive its fuse; the surge path absorbs the
// 61000-4-5 class event inside the MOV's single-shot rating; and the air budget that carries
// ~0.8–1.6 kW of module heat is asserted with fan margins, including the one-fan-out story.
// Companion references (already gated elsewhere, not duplicated): pulse-resistor J vs class
// (stress Epulse), bank-bleeder ≤32 J (E33), discharge timelines (R8-A), magnetics runaway
// (temp-critique E58), Tj ceilings (grid).  Run: node calculations/system/fault-energy.mjs
import { readFileSync } from "node:fs";
import { captureEvidence } from "../evidence.mjs";
captureEvidence("fault-energy");
const f = (x, d = 1) => Number(x.toFixed(d));
let fails = 0;
const ck = (sec, name, cond, detail) => {
  console.log(`${cond ? "  ok  " : "  FAIL"}  [${sec}] ${name} — ${detail}`);
  if (!cond) fails++;
};
console.log("=== FAULT-ENERGY / BURN-SAFETY AUDIT (E59) ===");

// ---- 1. energy reservoirs and their dump paths (J at the worst legal voltage) ----
// E60: module heat read from the loss-budget output (was hand-copied and went stale when the
// LLC current basis was re-solved)
const LBL = readFileSync(new URL("../out/loss-budget.csv", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(","));
const LB = Object.fromEntries(LBL.slice(1).map((c) => [c[0].toLowerCase(), +c[LBL[0].indexOf("total_jbs_W")]]));   // E67: by header — a new loss column shifted the index
const SKUS = {
  "30kw": { linkCans: 10, bankC: 9 * 2.2e-6, Pworst: LB["30kw"], fans: 2, out: 100 },
  "40kw": { linkCans: 12, bankC: 12 * 2.2e-6, Pworst: LB["40kw"], fans: 3, out: 133 },
  "50kw": { linkCans: 16, bankC: 14 * 2.2e-6, Pworst: LB["50kw"], fans: 0, out: 167 },   // liquid
  "50kwa": { linkCans: 16, bankC: 14 * 2.2e-6, Pworst: LB["50kwa"], fans: 4, out: 167 },
};
for (const [sku, s] of Object.entries(SKUS)) {
  const Clink = (s.linkCans / 2) * 470e-6 / 1;            // 2-series strings paralleled
  const Elink = 0.5 * (Clink / 1) * 860 ** 2 / 1;         // at HW OVP
  const perR = Elink / 4;                                  // 4× discharge resistors share (RDIS0-3)
  const rClass = sku === "30kw" || sku === "40kw" ? (sku === "40kw" ? 480 : 480) : 480;  // 25 W CER family point 480 J single-event (HR-14 basis; 50 W parts at 50 kW)
  ck("RESERVOIR", `${sku} DC link ${f(Elink, 0)} J @860 V`, perR <= rClass,
    `C=${f(Clink * 1e3, 2)} mF → ${f(perR, 0)} J per discharge resistor vs ${rClass} J family point (50 kW uses the 50 W class — stress Epulse gates the exact parts)`);
  const Ebank = 0.5 * s.bankC * 500 ** 2;   // E68: film-only bank (nF × 2.2 µF), bank ≤ 500 V
  ck("RESERVOIR", `${sku} bank ${f(Ebank, 0)} J @500 V`, Ebank / 4 <= 65,
    `per bleeder-chain resistor ${f(Ebank / 4, 1)} J ≤ 65 J (E33 line; passive 47k backup path is W-trivial)`);
}
ck("RESERVOIR", "tank caps (E67 full bridge, 11 × 33 nF worst)", 0.5 * 363e-9 * 865 ** 2 < 0.2,
  `${f(0.5 * 363e-9 * 865 ** 2 * 1000, 0)} mJ — three orders below any pulse rating; rings down in the tank R`);
// E60: at the 50 kW observability ceiling (311 A on 13 Ω) the D1-50 is soft-saturated — L(311 A,
// lot −8 %) ≈ 15.8 µH on the catalog 26µ curve (current-coordination owns the per-SKU race)
ck("RESERVOIR", "D1 magnetic energy at the CT ceiling", 0.5 * 15.8e-6 * 311 ** 2 < 2,
  `${f(0.5 * 15.8e-6 * 311 ** 2, 2)} J → freewheels into the DC link through the boost diodes (their normal path); link absorbs it as ${f(0.5 * 15.8e-6 * 311 ** 2 / 434 * 100, 2)}% of one link-charge`);

// ---- 2. surge: 61000-4-5 class 4 (4 kV line-line, 2 Ω source) into the MOV Δ ----
{
  const Vc = 900, Rsrc = 2, Ip = (4000 - Vc) / Rsrc;       // clamp ~900 V at kA class for S20K550
  const E = Vc * Ip * 20e-6 * 1.4;                          // 8/20 energy ≈ Vc·Ipk·τ·k
  ck("SURGE", "MOV single-shot energy vs class", E <= 160 && Ip <= 6500,
    `Ipk ≈ ${f(Ip, 0)} A, E ≈ ${f(E, 0)} J vs S20K550 class (Wmax ~160 J, Imax 6.5 kA 8/20) — and the MOV Δ + series GDT sits BEFORE the chokes (HR-7 netlist gate), so no magnetics see the un-clamped front`);
}

// ---- 3. conductor vs fuse coordination: the wire must never be the fuse ----
// adiabatic Cu: I²t_wire = (K·A)² with K ≈ 115 A/mm² per √s; gG 22×58/NH00 total clearing
// I²t at short ≤ ~1e5–3e5 A²s (class data, worst end used here).
for (const [path, Amm2, fuseI2t] of [["D1 winding 18 mm² (30 kW, 80 A gG)", 18, 1.2e5], ["D1 winding 25.8 mm² (40/50, 125/160 A)", 25.8, 3e5], ["busbar min 50 mm² class", 50, 3e5]]) {
  const wire = (115 * Amm2) ** 2;
  ck("COORD", path, wire >= 10 * fuseI2t,
    `wire I²t ${f(wire / 1e6, 1)}·10⁶ ≥ 10× fuse clearing ${f(fuseI2t / 1e6, 2)}·10⁶ A²s — the gG element always melts first`);
}

// ---- 4. electrolytic venting: series-string margin + the failure that COULD vent ----
ck("VENT", "bank/link can strings", 900 >= 525 * 1.55 && true,
  "2-series 450 V cans = 900 V string vs ≤525 V (58%) — venting requires a BALANCE failure, which F-rows detect via the bank senses; DFM carries the vent-clearance rule (E59)");

// ---- 5. the air budget: can the fans actually carry the heat? ----
// m³/h needed = 3600·P/(ρ·cp·ΔT) at ΔT=20 K through the module; a 120×38 fan of the 160 m³/h
// class delivers ~60% of free-flow at the sandwich's static pressure (A8 curve basis).
const need = (P) => 3600 * P / (1.16 * 1005 * 20);
for (const [sku, s] of Object.entries(SKUS)) {
  if (s.fans === 0) {
    const dT = s.Pworst / ((6.5 / 60) * 1042 * 3.4);   // E67: 6.5 L/min (was 6 — the DOUT + D8 output path added 188 W) × ρ1042 × cp3.4 J/gK (50/50 EG)
    ck("AIR", `${sku} liquid loop`, dT <= 5,
      `${f(s.Pworst, 0)} W into 6.5 L/min 50/50 EG-water → coolant ΔT ${f(dT, 1)} K ≤ 5 (E42 basis 4 K at 1,585 W) — cart-side flow assurance, module dry-run = plate NTC ladder`);
    continue;
  }
  const req = need(s.Pworst), have = s.fans * 160 * 0.6;
  const oneOut = (s.fans - 1) * 160 * 0.6, reqDerated = need(s.Pworst * 0.55);   // FSM derate 0.6 → ~55% loss
  ck("AIR", `${sku} airflow margin`, have >= 1.15 * req,
    `need ${f(req, 0)} m³/h @ΔT20 for ${s.Pworst} W vs ${s.fans}×160×0.6 = ${f(have, 0)} — margin ${f(have / req, 2)}×`);
  ck("AIR", `${sku} one-fan-out (FSM derate 0.6)`, oneOut >= reqDerated,
    `(n−1) = ${f(oneOut, 0)} m³/h vs derated need ${f(reqDerated, 0)} (tachs all monitored — E44; OT ladder is the second net)`);
}
console.log(fails ? `\n${fails} FAULT-ENERGY FAILURE(S)` : "\nFAULT-ENERGY AUDIT CLEAN — every reservoir has a rated dump path, wires outlive fuses, the surge lands in the MOV, and the fans carry the heat with n−1 covered");
process.exit(fails ? 1 : 0);
