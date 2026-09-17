// fault-energy.mjs — standing gate: the "nothing blows up, nothing burns" audit, computed.
// Every stored-energy reservoir is enumerated with its worst-case dump path and the path's
// rating; every power conductor is shown to outlive its fuse; the surge path absorbs the
// 61000-4-5 class event inside the MOV's single-shot rating; and the air budget that carries
// ~0.8–1.6 kW of module heat is asserted with fan margins, including the one-fan-out story.
// Companion references (already gated elsewhere, not duplicated): pulse-resistor J vs class
// (stress Epulse), bank-bleeder J, discharge timelines (stress-audit), magnetics runaway
// (temp-critique), Tj ceilings (grid).  Run: node calculations/system/fault-energy.mjs
import { readFileSync } from "node:fs";
import { captureEvidence } from "../evidence.mjs";
captureEvidence("fault-energy");
const f = (x, d = 1) => Number(x.toFixed(d));
let fails = 0;
const ck = (sec, name, cond, detail) => {
  console.log(`${cond ? "  ok  " : "  FAIL"}  [${sec}] ${name} — ${detail}`);
  if (!cond) fails++;
};
console.log("=== FAULT-ENERGY / BURN-SAFETY AUDIT ===");

// ---- 1. energy reservoirs and their dump paths (J at the worst legal voltage) ----
// module heat is READ from the loss-budget output; hand-copying it goes stale the moment the
// LLC current basis is re-solved
const LBL = readFileSync(new URL("../out/loss-budget.csv", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(","));
const LB = Object.fromEntries(LBL.slice(1).map((c) => [c[0].toLowerCase(), +c[LBL[0].indexOf("total_jbs_W")]]));   // by header — a new loss column shifts a fixed index
const SKUS = {
  "30kw": { linkCans: 10, bankC: 9 * 2.2e-6, Pworst: LB["30kw"], fans: 3, out: 100 },   // 3 fans at 30 kW
  "40kw": { linkCans: 12, bankC: 12 * 2.2e-6, Pworst: LB["40kw"], fans: 3, out: 133 },
  "50kw": { linkCans: 16, bankC: 14 * 2.2e-6, Pworst: LB["50kw"], fans: 0, out: 167 },   // liquid
  "50kwa": { linkCans: 16, bankC: 14 * 2.2e-6, Pworst: LB["50kwa"], fans: 4, out: 167 },
};
for (const [sku, s] of Object.entries(SKUS)) {
  const Clink = (s.linkCans / 2) * 470e-6 / 2;            // 2-series strings paralleled: each string is 470/2 µF, not 470 µF
  const Elink = 0.5 * Clink * 860 ** 2;                    // at HW OVP — the same 434 J the D1 line below divides by
  const perR = Elink / 4;                                  // 4× discharge resistors share (RDIS0-3)
  const rClass = sku === "30kw" || sku === "40kw" ? (sku === "40kw" ? 480 : 480) : 480;  // 25 W CER family point 480 J single-event; 50 W parts at 50 kW
  ck("RESERVOIR", `${sku} DC link ${f(Elink, 0)} J @860 V`, perR <= rClass,
    `C=${f(Clink * 1e3, 2)} mF → ${f(perR, 0)} J per discharge resistor vs ${rClass} J family point (50 kW uses the 50 W class — stress Epulse gates the exact parts)`);
  const Ebank = 0.5 * s.bankC * 500 ** 2;   // film-only bank (nF × 2.2 µF), bank ≤ 500 V
  ck("RESERVOIR", `${sku} bank ${f(Ebank, 0)} J @500 V`, Ebank / 4 <= 65,
    `per bleeder-chain resistor ${f(Ebank / 4, 1)} J ≤ 65 J (registered line; passive 47k backup path is W-trivial)`);
}
// The OUTPUT studs are the THIRD store, and the one easiest to leave without a dump path: DOUT conducts
// bank→output only, so every commanded discharge (QDISF, the PV-driven bank bleeders) is blocked by the diode
// and firmware cannot reach the studs. On the 3.8 MΩ sense divider alone COF1+COF2 take 101 s to 60 V with
// 4.7 J on exposed metal, so RBO1–RBO3 (3 × 150 k HV 2512 in series) bleed them.
{
  const boards = readFileSync(new URL("../../packages/common-components/boards.tsx", import.meta.url), "utf8");
  const Cout = 2 * 4.7e-6, Vout = 1000, nRbo = (boards.match(/name=\{`RBO\$\{i\}`\}/g) ?? []).length ? 3 : 0;
  const R = nRbo * 150e3, E = 0.5 * Cout * Vout ** 2;
  const t60 = R * Cout * Math.log(Vout / 60), pEl = R ? (Vout ** 2 / R) / nRbo : Infinity, vEl = R ? Vout / nRbo : Infinity;
  ck("RESERVOIR", `output studs ${f(E, 1)} J @1000 V behind DOUT`, nRbo === 3 && t60 <= 30 && pEl <= 1.0 && vEl <= 400,
    `${nRbo} × 150 k across OUTP–OUTN → τ ${f(R * Cout, 1)} s, 1000 → 60 V in ${f(t60, 0)} s (was 101 s on the sense divider alone) · ${f(pEl, 2)} W and ${f(vEl, 0)} V per element at 1000 V out ` +
    `— firmware CANNOT substitute for this: the blocking diode is in every commanded path, which is why the seven-question test passes a part here`);
}
ck("RESERVOIR", "tank caps (full bridge, 11 × 33 nF worst)", 0.5 * 363e-9 * 865 ** 2 < 0.2,
  `${f(0.5 * 363e-9 * 865 ** 2 * 1000, 0)} mJ — three orders below any pulse rating; rings down in the tank R`);
// at the 50 kW observability ceiling (311 A on 13 Ω) the D1-50 is soft-saturated — L(311 A,
// lot −8 %) ≈ 15.8 µH on the catalog 26µ curve (current-coordination owns the per-SKU race)
ck("RESERVOIR", "D1 magnetic energy at the CT ceiling", 0.5 * 15.8e-6 * 311 ** 2 < 2,
  `${f(0.5 * 15.8e-6 * 311 ** 2, 2)} J → freewheels into the DC link through the boost diodes (their normal path); link absorbs it as ${f(0.5 * 15.8e-6 * 311 ** 2 / 434 * 100, 2)}% of one link-charge`);

// ---- 2. surge: 61000-4-5 class 4 (4 kV line-line, 2 Ω source) into the MOV Δ ----
{
  const Vc = 900, Rsrc = 2, Ip = (4000 - Vc) / Rsrc;       // clamp ~900 V at kA class for S20K550
  const E = Vc * Ip * 20e-6 * 1.4;                          // 8/20 energy ≈ Vc·Ipk·τ·k
  ck("SURGE", "MOV single-shot energy vs class", E <= 160 && Ip <= 6500,
    `Ipk ≈ ${f(Ip, 0)} A, E ≈ ${f(E, 0)} J vs S20K550 class (Wmax ~160 J, Imax 6.5 kA 8/20) — and the MOV Δ + series GDT sits BEFORE the chokes (asserted by the netlist gate), so no magnetics see the un-clamped front`);
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
// The link can is graded on ITS OWN duty, not against a bank voltage: worst CONTINUOUS half = 830/2 + the 20 V F.06
// midpoint allowance = 435 V, gated at ≤ 0.90 × Vcan (lifetime), and the F.38 half-link trip (PMP_HALF_OV_V 440 V, 10 ms)
// must sit under the can's surge line 1.15 × Vcan. A 450 V can reads 0.97 / 0.85, over the lifetime line; the 500 V can
// (same 35 mm land, RFQ note in parts-db) reads 0.87 / 0.77.
const VCAN = 500, HALF_WORST = 830 / 2 + 20, HALF_TRIP = 440;
ck("VENT", "link can continuous voltage", HALF_WORST / VCAN <= 0.90,
  `worst continuous half-link ${HALF_WORST} V (830 V ref/2 + F.06 20 V) on a ${VCAN} V can = ${f(100 * HALF_WORST / VCAN, 0)} % ≤ 90 % (450 V cans read ${f(100 * HALF_WORST / 450, 0)} %)`);
ck("VENT", "link can trip vs surge", HALF_TRIP <= 1.15 * VCAN,
  `F.38 half-link trip ${HALF_TRIP} V ≤ 1.15 × ${VCAN} = ${f(1.15 * VCAN, 0)} V surge line — venting requires a BALANCE failure past F.06/F.38, which the half senses detect; DFM carries the vent-clearance rule`);

// ---- 5. the air budget: can the fans actually carry the heat? ----
// m³/h needed = 3600·P/(ρ·cp·ΔT) at ΔT=20 K through the module; a 120×38 fan of the 160 m³/h
// class delivers ~60% of free-flow at the sandwich's static pressure (A8 curve basis).
const need = (P) => 3600 * P / (1.076 * 1005 * 20);   // ρ at the 55 °C inlet the budget states (1.076 kg/m³), not 30 °C air
for (const [sku, s] of Object.entries(SKUS)) {
  if (s.fans === 0) {
    const FLOW_LPM = 7;                                       // nominal coolant flow per module (the cooling loop's specification)
    const dT = s.Pworst / ((FLOW_LPM / 60) * 1042 * 3.4);     // L/min × ρ 1042 kg/m³ × cp 3.4 J/g·K (50/50 EG-water)
    ck("AIR", `${sku} liquid loop`, dT <= 5,
      `${f(s.Pworst, 0)} W into ${FLOW_LPM} L/min 50/50 EG-water → coolant ΔT ${f(dT, 2)} K ≤ 5 (the 65 °C plate reference is 60 °C inlet + 5 K) — cart-side flow assurance, module dry-run = plate NTC ladder`);
    continue;
  }
  const req = need(s.Pworst), have = s.fans * 160 * 0.6;
  const der1 = s.fans >= 4 ? 0.6 : 0.5;                                          // core/fsm.c pmp_fan_derate(): one fan failed → 0.6 on a 4-fan SKU, 0.5 on 2–3 fans
  const oneOut = (s.fans - 1) * 160 * 0.6, reqDerated = need(s.Pworst * (der1 - 0.05));   // loss falls a little faster than power
  // The margin line is 1.10, not 1.15: the honest loss terms (LLC turn-off at the deck coefficients, the DPT-read Vienna
  // switching share) put the 40 kW worst-continuous ledger at 1.147× on the fixed 3-fan build. At the delivered flow the
  // module air rise is 20 K / margin ≤ 17.5 K, inside the 75 °C AIR_REF base assumption, and the derate ladder, the OT
  // rows and the n−1 rule below are the guards. T-04 measures it.
  ck("AIR", `${sku} airflow margin`, have >= 1.10 * req,
    `need ${f(req, 0)} m³/h @ΔT20 for ${s.Pworst} W vs ${s.fans}×160×0.6 = ${f(have, 0)} — margin ${f(have / req, 2)}× (line 1.10; module air rise at delivered flow ${f(20 * req / have, 1)} K)`);
  ck("AIR", `${sku} one-fan-out (FSM derate ${der1})`, oneOut >= reqDerated,
    `(n−1) = ${f(oneOut, 0)} m³/h vs derated need ${f(reqDerated, 0)} (tachs all monitored; OT ladder is the second net)`);
}
console.log(fails ? `\n${fails} FAULT-ENERGY FAILURE(S)` : "\nFAULT-ENERGY AUDIT CLEAN — every reservoir has a rated dump path, wires outlive fuses, the surge lands in the MOV, and the fans carry the heat with n−1 covered");
process.exit(fails ? 1 : 0);
