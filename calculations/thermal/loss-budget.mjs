// loss-budget.mjs — Phase 8 (§29): full loss budget, JBS-vs-SR decision (§4), heatsink/fan
// requirements, thermal corners, derating curve. All inputs trace to pfc-design/llc-design/DPT.
// Run: node calculations/thermal/loss-budget.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { plotSVG } from "../plot.mjs";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const f = (x, d = 1) => Number(x.toFixed(d));

// ---------------- per-lane / per-channel building blocks (from Phase 3/6/7 outputs)
const PFC_LANE = { semis: 3 * (43.5 + 24.2), mag: 3 * 34.8, note: "3 pairs @43.5 W + 3 diode-pairs 24.2 W (per-diode 12.1 W ×2) + 3 chokes 34.8 W @330 V corner (D1 rev B: N=39/18 mm² on the real 0077908A7 core — audit F4; Cu 32.4 + Fe 2.4)" };
// LLC per channel at 30 kW nominal (bank 400, Ip 23.3 A sim / 33 A envelope-worst; use 400 V full-power pt):
const IP_NOM = 23.3, IP_WORST = 45.6;
const LLC_CH = (ip) => ({
  pri: 6 * (ip / Math.SQRT2) ** 2 * 0.035,          // 6 FETs, each conducts half-period, Rds_hot 35 mΩ
  xfmr: 3 * 20.5,
  tank: 3 * ip * ip * 0.008,                        // trim L + Cr ESR ~8 mΩ per phase
});
// Secondary options at module full output current Iout (per 30 kW-channel: 100 A total, 50 A/bank):
function secondary(IoutCh) {
  const Ibank = IoutCh / 2;
  const jbs = 2 * 2 * (1.35 * (Ibank / 2) + (Ibank / 2 * 1.11) ** 2 * 0.022 / 2) * 3 / 3; // 2 banks × bridge(2 series diodes avg-conducting): per bank 2·Vf·Idc + R term, sections share
  const jbsW = 2 * (2 * 1.35 * Ibank + 2 * 0.022 * (Ibank * 1.11) ** 2 / 3);              // per bank: 2 diodes in series path; 3 sections split current
  const srW = 2 * (2 * 0.035 * (Ibank * 1.11) ** 2 / 3 + 1.5);                            // SR: Rds_hot path ×2 devices + gate loss 1.5 W/bank
  return { jbsW, srW };
}

// ---------------- SKU roll-up at rated point (400 VAC in, 800 V bus, out ≥300 V full power)
const SKUS = [
  { name: "30kW", P: 30e3, lanes: 1, ch: 1, Iout: 100, fans: 2 },
  { name: "40kW", P: 40e3, lanes: 1, ch: 1, Iout: 133, fans: 2 },   // E41: engine decides if 2 fans hold
  { name: "50kW", P: 50e3, lanes: 1, ch: 1, Iout: 167, fans: 0 },   // E42 LIQUID: sealed, zero fans — total heat goes to the coolant loop (ΔT ≈ 5 K at 6 L/min)
  { name: "60kW", P: 60e3, lanes: 2, ch: 2, Iout: 200, fans: 2 },
  { name: "120kW", P: 120e3, lanes: 4, ch: 4, Iout: 400, fans: 4 },
];
// rev D (R2 HR-18): EMI-filter copper — previously entirely unbudgeted. As-drawn D6/D7 windings
// at the design-point line currents (Rdc from turn-length/section; D6/D7 ΔT acceptances bind the
// winder if first articles run hot — losses here are the as-drawn numbers, honest not hopeful):
//   CMC per choke (D7 rev D foil): 11.5 / 16.7 / 36 W ×2 chokes
//   LDM per choke (D6 rev B — audit F7, every winding one gauge up to ≤5.6 A/mm²):
//   5.9 / 9.8 / 18.3 W ×3 chokes (rev-A as-drawn 8.8/32.7/58.6 ran 8.3–18 A/mm² and the 30 kW
//   part computed past its own ΔT≤45 K acceptance; scaled by conductor CSA 6.6→9.9 / 6→20 / 12.5→40)
// E43: LDM (D6) losses now come from the D6 ENGINE (dm-choke-design.mjs rev C — foil windings,
// crest-biased L floors): 2.4 / 4.4 / 8.1 W per choke at 30/40/50 kW. CMC (D7) rows unchanged.
const EMI_FILTER = { "30kW": 2 * 11.5 + 3 * 2.4, "40kW": 2 * 15.3 + 3 * 4.4, "50kW": 2 * 19.2 + 3 * 8.1, "60kW": 2 * 16.7 + 3 * 9.8, "120kW": 2 * 36 + 3 * 18.3 };
const rows = [["sku","pfc_semis_W","pfc_mag_W","dclink_W","llc_pri_W","xfmr_W","tank_W","sec_jbs_W","sec_sr_W","busbar_shunt_W","emi_filter_W","aux_gate_W","fans_W","total_jbs_W","eta_jbs_pct","total_sr_W","eta_sr_pct"]];
console.log("=== LOSS BUDGET at rated point (400 VAC, ≥300 V out, full power) — rev D incl. EMI filter ===");
for (const s of SKUS) {
  // E41: k = per-lane power ratio vs the 30 kW design point (1.0 for every legacy row; 1.333 for
  // the 40 kW variant, which keeps 1 lane / 1 channel and runs everything 33% harder).
  // Scaling bases, honest not hopeful:
  //   · PFC pair loss splits ~0.68 conduction / 0.32 switching at 50 kHz (Phase-3 DPT energy ratio
  //     — VERIFY against dpt CSV at E41 close): conduction ∝ k², switching ∝ k. `pfcPar` = 2
  //     paralleled B3M per position (the no-new-part option): conduction halves, switching shared.
  //   · PFC diodes are Vf-dominated ∝ k; D1 choke REWOUND at constant J → Cu ∝ k, Fe ≈ flat.
  //   · transformer D3-40 rewound/upsized at constant J → Cu share (0.65) ∝ k, Fe ≈ flat.
  //   · LLC_CH()/secondary() are already current-parameterized.
  const k = (s.P / s.lanes) / 30e3;
  const pairW = 43.5 * (0.68 * k * k + 0.32 * k), pairParW = 43.5 * (0.68 * k * k / 2 + 0.32 * k);
  const pfcSemis = (3 * pairW + 3 * 24.2 * k) * 0.78 * s.lanes;
  const pfcSemisPar = (3 * pairParW + 3 * 24.2 * k) * 0.78 * s.lanes;
  if (k > 1.01) console.log(`  ${s.name} PFC semi scenarios @330 V corner-scaled: single-FET ${f(pfcSemis / 0.78, 0)} W · 2x-parallel ${f(pfcSemisPar / 0.78, 0)} W (per pair ${f(pairW, 1)} vs ${f(pairParW, 1)} W)`);
  const pfcMag = 3 * (32.4 * k + 2.4) * 0.72 * s.lanes;
  const dclink = 12 * s.lanes * k * k * (10 / (10 * k > 10 ? 12 : 10)) * (s.lanes > 1 ? 1 : 1);
  const llc = LLC_CH(IP_NOM * k);
  const pri = llc.pri * s.ch, xf = 3 * 20.5 * (0.65 * k + 0.35) * s.ch, tank = llc.tank * s.ch;
  const { jbsW, srW } = secondary(100 * k);
  const secJ = jbsW * s.ch, secS = srW * s.ch;
  const bus = 0.00015 * s.Iout ** 2 + 25e-6 * s.Iout ** 2; // busbar ~0.15 mΩ + shunt 25 µΩ paths
  const emi = EMI_FILTER[s.name];
  // rev C (review closure): E26 aux stage at running load, iso-sense bias modules (E25),
  // per-lane Vienna snubber 3×0.86 W + clamp bleeders 3×~2 W nominal (E28/HR-3), driver bias.
  // rev D: E26 rev C 110 W stage at per-SKU load (η 0.85) — dissipation grows with SKU.
  const aux = 20 + 8.5 * s.lanes + 9.5 * s.ch;
  const fansW = s.fans * 10;
  const totJ = pfcSemis + pfcMag + dclink + pri + xf + tank + secJ + bus + emi + aux + fansW;
  const totS = totJ - secJ + secS;
  rows.push([s.name, f(pfcSemis), f(pfcMag), f(dclink), f(pri), f(xf), f(tank), f(secJ), f(secS), f(bus), f(emi), f(aux), f(fansW), f(totJ), f(100 * s.P / (s.P + totJ), 2), f(totS), f(100 * s.P / (s.P + totS), 2)]);
  console.log(`${s.name}: JBS total ${f(totJ, 0)} W (η=${f(100 * s.P / (s.P + totJ), 2)}%)  |  SR total ${f(totS, 0)} W (η=${f(100 * s.P / (s.P + totS), 2)}%)  | sec JBS ${f(secJ, 0)} vs SR ${f(secS, 0)} W | EMI filter ${f(emi, 0)} W`);
}
writeFileSync(join(OUT, "loss-budget.csv"), rows.map(r => r.join(",")).join("\n") + "\n");

// ---------------- JBS vs SR decision (§4)
const d30 = secondary(100);
const dW = d30.jbsW - d30.srW;
const heatsinkSave = dW * 28;                        // ₹28/W marginal heatsink+fan cost (extrusion ₹18/W + fan/airflow ₹10/W;
                                                     // the ₹60/W figure used in the fsw trade covers the full cooling chain incl.
                                                     // enclosure scaling and is not the marginal rate here — sensitivity: SR wins if >₹41/W)
const srCost = 24 * 390 + 12 * 85 + 450;             // 24 FETs + 12 dual drivers + bias (30 kW)
const jbsCost = 24 * 90;
console.log(`\n=== SECONDARY DECISION (30 kW): JBS ${f(d30.jbsW, 0)} W vs SR ${f(d30.srW, 0)} W (Δ ${f(dW, 0)} W)`);
console.log(`SR extra BOM ₹${srCost - jbsCost}; thermal credit ₹${f(heatsinkSave, 0)}; net ₹${f(srCost - jbsCost - heatsinkSave, 0)} AGAINST SR`);
console.log(`+ MCU matrix showed SR timer-infeasible at 120 kW (needs SR-controller ICs, +₹~700).`);
console.log(`DECISION: SiC JBS bridge baseline on all SKUs — net ₹ against SR at ₹28/W marginal thermal cost,`);
console.log(`commonization across SKUs, and 120 kW SR drive infeasibility. SR = qualified premium-η variant (+0.68 pt).`);
console.log(`SENSITIVITY (documented): SR becomes net-positive above ₹41/W marginal cooling cost or if EOL fan-noise/`);
console.log(`fan-life field costs are priced in — revisit at Phase 17 with real heatsink quotes.`);

// ---------------- heatsink requirement + corners + derating
// Worst continuous: 330 VAC full power, JBS baseline, +55 °C ambient.
const totalWorst30 = PFC_LANE.semis + PFC_LANE.mag + 12 + LLC_CH(IP_NOM).pri + 3 * 20.5 + LLC_CH(IP_NOM).tank + secondary(100).jbsW + 3.75 + EMI_FILTER["30kW"] * 1.35 + 40 + 20; // filter at 330 V corner: I² ×(54.9/45.3)² ≈ ×1.35
const semisShare = PFC_LANE.semis + LLC_CH(IP_NOM).pri + secondary(100).jbsW;
console.log(`\n30 kW worst-corner dissipation ≈ ${f(totalWorst30, 0)} W, of which heatsink-mounted semis ≈ ${f(semisShare, 0)} W`);
const RthReq = 20 / semisShare;                       // allow 20 K sink-to-air rise at 55 °C ambient → sink ≤75 °C
console.log(`Heatsink Rth(sink-air) ≤ ${f(RthReq, 3)} K/W @ rated airflow → forced-air extrusion, ~${f(semisShare * 1, 0)} cm² base, 2× 120×38 fans on static-pressure curve (fan calc: ~110 Pa @ 160 m³/h class, VERIFY vendor curve)`);
// derating: hold Tj ≤150 → above 55 °C reduce power linearly to 75 °C
const der = [];
for (let ta = 40; ta <= 80; ta += 1) der.push({ ta, p: ta <= 55 ? 100 : Math.max(0, 100 - (ta - 55) * (100 - 40) / 20) });
plotSVG({ title: "Output power derating vs inlet temperature (all SKUs, %)", xlabel: "inlet °C", ylabel: "% rated power",
  path: join(OUT, "..", "..", "simulation-results", "30kw", "plots", "derating-curve.svg"),
  series: [{ label: "P_avail %", x: der.map(d => d.ta), y: der.map(d => d.p) }] });
writeFileSync(join(OUT, "derating.csv"), "inlet_C,percent_power\n" + der.map(d => `${d.ta},${d.p}`).join("\n") + "\n");
console.log(`Derating: 100% ≤55 °C → linear → 40% @75 °C → 0 @88 °C (fault) — plots/derating-curve.svg`);
console.log("→ calculations/out/loss-budget.csv, derating.csv");
