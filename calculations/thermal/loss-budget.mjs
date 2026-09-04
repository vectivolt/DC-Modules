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
const PFC_LANE = { semis: 3 * (43.5 + 24.2), mag: 3 * 33.5, note: "3 pairs @43.5 W + 3 diode-pairs 24.2 W (per-diode 12.1 W ×2) + 3 chokes 33.5 W @330 V corner" };
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
  { name: "60kW", P: 60e3, lanes: 2, ch: 2, Iout: 200, fans: 2 },
  { name: "120kW", P: 120e3, lanes: 4, ch: 4, Iout: 400, fans: 4 },
];
// rev D (R2 HR-18): EMI-filter copper — previously entirely unbudgeted. As-drawn D6/D7 windings
// at the design-point line currents (Rdc from turn-length/section; D6/D7 ΔT acceptances bind the
// winder if first articles run hot — losses here are the as-drawn numbers, honest not hopeful):
//   CMC per choke (D7 rev D foil): 11.5 / 16.7 / 36 W ×2 chokes
//   LDM per choke (D6): 8.8 / 32.7 / 58.6 W ×3 chokes (60/120 kW foils run 17–18 A/mm² — the
//   D6 ΔT≤45 K acceptance is the governing check; next foil gauge absorbed in D6 price if it fails)
const EMI_FILTER = { "30kW": 2 * 11.5 + 3 * 8.8, "60kW": 2 * 16.7 + 3 * 32.7, "120kW": 2 * 36 + 3 * 58.6 };
const rows = [["sku","pfc_semis_W","pfc_mag_W","dclink_W","llc_pri_W","xfmr_W","tank_W","sec_jbs_W","sec_sr_W","busbar_shunt_W","emi_filter_W","aux_gate_W","fans_W","total_jbs_W","eta_jbs_pct","total_sr_W","eta_sr_pct"]];
console.log("=== LOSS BUDGET at rated point (400 VAC, ≥300 V out, full power) — rev D incl. EMI filter ===");
for (const s of SKUS) {
  // 400 VAC nominal: PFC semis scale from 330 V corner by (45.3/54.9)² conduction share ≈ 0.75 avg
  const pfcSemis = PFC_LANE.semis * 0.78 * s.lanes;
  const pfcMag = PFC_LANE.mag * 0.72 * s.lanes;
  const dclink = 12 * s.lanes;                       // ESR heating estimate (ripple current calc, ±50%)
  const llc = LLC_CH(IP_NOM);
  const pri = llc.pri * s.ch, xf = llc.xfmr * s.ch, tank = llc.tank * s.ch;
  const { jbsW, srW } = secondary(100);
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
