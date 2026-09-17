// loss-budget.mjs — Phase 8 (§29): full loss budget, JBS-vs-SR decision (§4), heatsink/fan
// requirements, thermal corners, derating curve. All inputs trace to pfc-design/llc-design/DPT.
// Run: node calculations/thermal/loss-budget.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { plotSVG } from "../plot.mjs";
import { excitation, d3Loss, d2Loss, D3 as D3C, D2 as D2C, D3_CELLS } from "../magnetics/magnetics-envelope.mjs";
import { TANKS, JBS_POS } from "../llc/tanks.mjs";
import { D1 as D1C, d1Loss, row as vsRow } from "../magnetics/d1-choke.mjs";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const f = (x, d = 1) => Number(x.toFixed(d));

// ---------------- per-lane / per-channel building blocks (from Phase 3/6/7 outputs)
// D1: choke loss per SKU from d1-choke on the vienna-switched row (50 Hz + 50 kHz ripple copper at the datasheet MLT with the 2-D
// anchored proximity factor, iGSE Kool Mµ 26 at the datasheet max) — computed per SKU, never a k-scaled 30 kW number
const D1_AT = (sku, tag, T) => { const L = d1Loss(D1C[sku], vsRow(sku, tag), T); return L.lf + L.hf + L.fe; };
const PFC_LANE = { semis: 3 * (43.5 + 24.2), mag: 3 * D1_AT("30kw", "330-full-bus830-lot92", 100), note: "3 pairs @43.5 W + 3 diode-pairs 24.2 W (per-diode 12.1 W ×2) + 3 D1-30 chokes at the 330 VAC corner (d1-choke)" };
// LLC tank current at the nominal full-power point = the power-solved ngspice PAR400-full corner (bank 400 V, bus 830); the
// ONE full-bridge tank carries the whole module. It is read from the deck, never typed: a deck without body diodes reads low.
const IP_NOM = (sku) => +readFileSync(join(OUT, "..", "..", "simulation-results", sku.toLowerCase(), "llc-stress.csv"), "utf8")
  .split("\n").find((l) => l.startsWith("PAR400-full,")).split(",")[9];
// D3 cell and D2 losses at the rated point come from the magnetics-envelope models on the power-solved PAR400-full waveform
// (iGSE Fe + Dowell/Sullivan Cu at the simulated fsw, windings at 90 °C). Cr ESR: tanδ 2e-4 film, parallel set ≈ 1.2 mΩ.
const MAG_RATED = (sku) => {
  const k = sku.toLowerCase(), r = excitation(k).rows.find((x) => x.corner === "PAR400-full");
  const a = d3Loss(k, D3C[k], r), b = d2Loss(k, D2C[k], r);
  return { xfmrCell: a.fe(90) + a.cu(90), lr: b.fe(90) + b.cu(90) };
};
// The LLC turn-off loss at the rated point — koff · V_bus · I_toff · f_sw per position, four positions, with V_bus / f_sw / I_toff
// read from the SAME power-solved PAR400-full deck row that gives IP_NOM (columns bus_V, fsw_kHz, Ifet_toff_A). It is 4 × 36–58 W
// here, ≈ 0.5–0.6 pt of efficiency, so a ledger without it is wrong by that much.
// The Vienna switching coefficient comes per SKU from the DPT finals (same reader as envelope-grid; the deck reads cells.tsx, so the
// drawn clamp state — single RCD or mirrored — is what lands here). Falls back to the registered constant if the CSV is absent.
const KSW_PFC = (sku) => {
  try {
    const rows = readFileSync(join(OUT, "..", "..", "simulation-results", sku, "dpt-pfc-metrics.csv"), "utf8")
      .split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split(","));
    const h = rows[0], iK = h.indexOf("koff_nJ_VA"), iC = h.indexOf("case"), iKind = h.indexOf("kind");
    const fin = rows.slice(1).filter((r) => r[iKind] === "final" && !/vhi/.test(r[iC]) && /-(clamped|UNCLAMPED)$/.test(r[iC])).map((r) => +r[iK]);
    return fin.length === 2 ? (fin[0] + fin[1]) / 2 * 1e-9 : 17.4e-9;
  } catch { return 17.4e-9; }
};
const LLC_OFF = (sku) => {
  const c = readFileSync(join(OUT, "..", "..", "simulation-results", sku.toLowerCase(), "llc-stress.csv"), "utf8")
    .split("\n").find((l) => l.startsWith("PAR400-full,")).split(",");
  const t = TANKS[sku.toLowerCase()];
  return 4 * (t.koff ?? t.dieP.koff) * +c[2] * +c[19] * (+c[4] * 1e3);
};
const LLC_CH = (ip, sku = "30kW") => ({
  pri: 2 * ip * ip * TANKS[sku.toLowerCase()].dieP.rHot / TANKS[sku.toLowerCase()].par,   // 4 positions × par dies, half-period each
  sw: LLC_OFF(sku),                                                                   // turn-off loss, 4 positions
  xfmr: D3_CELLS * MAG_RATED(sku).xfmrCell,
  tank: MAG_RATED(sku).lr + ip * ip * 0.0012,               // D2 external Lr (envelope) + Cr ESR
});
// Secondary options at module full output current Iout (per 30 kW-channel: 100 A total, 50 A/bank):
function secondary(IoutCh, sku = "30kw") {
  // one SiC bridge per bank, n diodes per position (tanks.mjs JBS_POS); rated point = PAR (each bank Iout/2): per bank 2·Vf·Ib
  // (two positions in the conduction path, V0 0.95 V) + rd·π²·Ib²/(4·n) over the four positions · SR variant: 2 × Rds_hot path + gate 1.5 W/bank
  const Ibank = IoutCh / 2, j = JBS_POS[sku], rd = j.cls === 40 ? 0.022 : 0.045;
  const jbsW = 2 * (2 * 0.95 * Ibank + rd * Math.PI ** 2 * Ibank * Ibank / (4 * j.n));   // hot JBS class V0 0.95 V + rd (current-coordination basis)
  const srW = 2 * (2 * 0.035 * (Ibank * 1.11) ** 2 + 1.5);
  return { jbsW, srW };
}

// ---------------- SKU roll-up at rated point (400 VAC in, 800 V bus, out ≥300 V full power)
const SKUS = [
  { name: "30kW", P: 30e3, lanes: 1, ch: 1, Iout: 100, fans: 3 },   // 3 / 3 / 0 / 4 fans across the SKUs
  { name: "40kW", P: 40e3, lanes: 1, ch: 1, Iout: 133, fans: 3 },
  { name: "50kW", P: 50e3, lanes: 1, ch: 1, Iout: 167, fans: 0 },   // LIQUID: sealed, zero fans — total heat goes to the coolant loop (ΔT ≤ 5 K at the 7 L/min nominal flow)
  { name: "50kWa", P: 50e3, lanes: 1, ch: 1, Iout: 167, fans: 4, parL: 2 },   // AIR: 4 fans; LLC paralleled (pri conduction halves)
];
// EMI-filter copper is BUDGETED, and every term comes from its engine: the two D7 CM chokes from dm-choke-design at hot copper
// and the worst continuous line current, plus the CX2-node damper (pfc-control switched model, 330 VAC full power). run-all runs
// both first. Grading a CM choke at 20 °C copper on a one-layer turn the core cannot hold reads ≈ 11.5/15.3/19.2 W and is far too
// kind; the ΔT acceptances bind the winder if first articles run hot.
const CH = JSON.parse(readFileSync(join(OUT, "dm-choke-design.json"), "utf8"));
const DAMP = readFileSync(join(OUT, "pfc-filter-stability.csv"), "utf8").split("\n").map((l) => l.split(",")).filter((r) => r[1] === "time-domain" && r[3] === "15");
const emiW = (k) => 2 * CH.d7[k].P + Math.max(...DAMP.filter((r) => r[0] === k).map((r) => +r[7]));   // two CM chokes + damper; the star X2 filter has no DM choke
const EMI_FILTER = { "30kW": emiW("30kw"), "40kW": emiW("40kw"), "50kW": emiW("50kw"), "50kWa": emiW("50kw") };
// Output path — the DOUT blocking diode (Vf 1.05 V, the current-coordination basis) carries the whole output current, and it is
// worth ≈ 0.3 pt of efficiency, so it belongs in the roll-up.
const outW = (Iout) => 1.05 * Iout;   // film-only banks add no inductor copper; the DOUT diode is the whole term
const rows = [["sku","pfc_semis_W","pfc_mag_W","dclink_W","llc_pri_W","xfmr_W","tank_W","sec_jbs_W","sec_sr_W","out_diode_lf_W","busbar_shunt_W","emi_filter_W","aux_gate_W","fans_W","total_jbs_W","eta_jbs_pct","total_sr_W","eta_sr_pct","pfc_ksw_nJ_VA"]];
console.log("=== LOSS BUDGET at rated point (400 VAC, ≥300 V out, full power) — incl. EMI filter ===");
for (const s of SKUS) {
  // k = per-lane power ratio vs the 30 kW design point (1.333 for the 40 kW variant, which keeps
  // 1 lane / 1 channel and runs everything 33 % harder).
  // Scaling bases, honest not hopeful:
  //   · PFC pair loss splits ~0.68 conduction / 0.32 switching at 50 kHz (Phase-3 DPT energy ratio
  //     — VERIFY against the dpt CSV): conduction ∝ k², switching ∝ k. `pfcPar` = 2
  //     paralleled B3M per position (the no-new-part option): conduction halves, switching shared.
  //   · PFC diodes are Vf-dominated ∝ k; D1 chokes are computed per SKU at the 400 VAC rated row, windings 90 °C.
  //   · transformer D3-40 rewound/upsized at constant J → Cu share (0.65) ∝ k, Fe ≈ flat.
  //   · LLC_CH()/secondary() are already current-parameterized.
  const k = (s.P / s.lanes) / 30e3;
  const rP = { "30kW": 2.0, "40kW": 1.5 }[s.name] ?? 1;   // PFC die Rds vs the 10 mΩ DPT basis (conduction share scales, switching does not)
  // the switching share scales with the per-SKU DPT coefficient at the real currents and the DRAWN clamp network
  // (mean of the two half-cycles, simulation-results/<sku>/dpt-pfc-metrics.csv) against the 17.4 nJ/(V·A) the 0.32 share was built on
  const kSw = KSW_PFC(s.name.toLowerCase()) / 17.4e-9;
  const pairW = 43.5 * (0.68 * k * k * rP + 0.32 * k * kSw), pairParW = 43.5 * (0.68 * k * k / 2 + 0.32 * k * kSw);
  if (Math.abs(kSw - 1) > 0.02) console.log(`  ${s.name} PFC switching share × ${f(kSw, 2)} (per-SKU DPT coefficient, drawn clamp network)`);
  const pfcSemis = (3 * pairW + 3 * 24.2 * k) * 0.78 * s.lanes;
  const pfcSemisPar = (3 * pairParW + 3 * 24.2 * k) * 0.78 * s.lanes;
  if (k > 1.01) console.log(`  ${s.name} PFC semi scenarios @330 V corner-scaled: single-FET ${f(pfcSemis / 0.78, 0)} W · 2x-parallel ${f(pfcSemisPar / 0.78, 0)} W (per pair ${f(pairW, 1)} vs ${f(pairParW, 1)} W)`);
  const pfcMag = 3 * D1_AT(s.name.toLowerCase(), "400-full-bus830-nom", 90) * s.lanes;
  const dclink = 12 * s.lanes * k * k * (10 / (10 * k > 10 ? 12 : 10)) * (s.lanes > 1 ? 1 : 1);
  const llc = LLC_CH(IP_NOM(s.name), s.name);
  // transformer = 2 D3 cells at PAR400-full (30 kW 2×E70 6:6∥6 · 40/50 kW 3×E70 4:4∥4) + the D2 external Lr; the worst
  // THERMAL corners (500 V bank / the 764 V-bus PSM corner) are the envelope gate's job, not efficiency's
  const pri = (llc.pri + llc.sw) * s.ch, xf = llc.xfmr * s.ch, tank = llc.tank * s.ch;   // LLC_CH carries the per-position paralleling and the turn-off term
  console.log(`  ${s.name} LLC primary: conduction ${f(llc.pri, 0)} W + turn-off ${f(llc.sw, 0)} W (koff · Vbus · Itoff · fsw at PAR400-full)`);
  const { jbsW, srW } = secondary(s.Iout, s.name.toLowerCase());
  const secJ = jbsW * s.ch, secS = srW * s.ch;
  const bus = 0.00015 * s.Iout ** 2 + 25e-6 * s.Iout ** 2; // busbar ~0.15 mΩ + shunt 25 µΩ paths
  const emi = EMI_FILTER[s.name];
  // the 110 W aux stage at per-SKU load (η 0.85, so dissipation grows with SKU), iso-sense bias
  // modules, per-lane Vienna snubber 3 × 0.86 W + clamp bleeders 3 × ≈ 2 W nominal, driver bias.
  const aux = 20 + 8.5 * s.lanes + 9.5 * s.ch;
  const fansW = s.fans * 10;
  const outP = outW(s.Iout, s.name);
  const totJ = pfcSemis + pfcMag + dclink + pri + xf + tank + secJ + outP + bus + emi + aux + fansW;
  const totS = totJ - secJ + secS;
  rows.push([s.name, f(pfcSemis), f(pfcMag), f(dclink), f(pri), f(xf), f(tank), f(secJ), f(secS), f(outP), f(bus), f(emi), f(aux), f(fansW), f(totJ), f(100 * s.P / (s.P + totJ), 2), f(totS), f(100 * s.P / (s.P + totS), 2), f(kSw * 17.4, 2)]);   // the PFC switching coefficient this row was built on
  console.log(`${s.name}: JBS total ${f(totJ, 0)} W (η=${f(100 * s.P / (s.P + totJ), 2)}%)  |  SR total ${f(totS, 0)} W (η=${f(100 * s.P / (s.P + totS), 2)}%)  | sec JBS ${f(secJ, 0)} vs SR ${f(secS, 0)} W | DOUT + Lf ${f(outP, 0)} W | EMI filter ${f(emi, 0)} W`);
}
writeFileSync(join(OUT, "loss-budget.csv"), rows.map(r => r.join(",")).join("\n") + "\n");

// ---------------- secondary rectification: SiC JBS bridge vs synchronous rectification
const d30 = secondary(100), dW = d30.jbsW - d30.srW;
console.log(`\n=== SECONDARY RECTIFICATION (30 kW): JBS ${f(d30.jbsW, 0)} W vs SR ${f(d30.srW, 0)} W (Δ ${f(dW, 0)} W)`);
console.log(dW > 0
  ? `SR would save ${f(dW, 0)} W at 30 kW; the JBS bridge stays the baseline until that saving pays for the SR FETs, drivers and bias.`
  : `SiC JBS bridge on every SKU: on the full bridge one 35 mΩ SR FET per position loses ${f(-dW, 0)} W MORE than the JBS bridge at 30 kW (the whole bank current flows through each bridge), before its drivers and bias are paid for.`);

// ---------------- heatsink requirement + corners + derating
// Worst continuous: 330 VAC full power, JBS baseline, +55 °C ambient.
const totalWorst30 = PFC_LANE.semis + PFC_LANE.mag + 12 + LLC_CH(IP_NOM("30kW")).pri + LLC_CH(IP_NOM("30kW")).sw + LLC_CH(IP_NOM("30kW")).xfmr + LLC_CH(IP_NOM("30kW")).tank + secondary(100).jbsW + outW(100) + 3.75 + EMI_FILTER["30kW"] * 1.35 + 40 + 20; // filter at 330 V corner: I² ×(54.9/45.3)² ≈ ×1.35
const semisShare = PFC_LANE.semis + LLC_CH(IP_NOM("30kW")).pri + LLC_CH(IP_NOM("30kW")).sw + secondary(100).jbsW + 1.05 * 100;   // DOUT is heatsink-mounted; the LLC term includes turn-off
console.log(`\n30 kW worst-corner dissipation ≈ ${f(totalWorst30, 0)} W, of which heatsink-mounted semis ≈ ${f(semisShare, 0)} W`);
const RthReq = 20 / semisShare;                       // allow 20 K sink-to-air rise at 55 °C ambient → sink ≤75 °C
console.log(`Heatsink Rth(sink-air) ≤ ${f(RthReq, 3)} K/W @ rated airflow → forced-air extrusion, ~${f(semisShare * 1, 0)} cm² base, 2× 120×38 fans on static-pressure curve (fan calc: ~110 Pa @ 160 m³/h class, VERIFY vendor curve)`);
// Derating vs inlet temperature = the law the firmware implements (hal/app.c ZONE[1] 55 → 75 °C, fsm.h PMP_DERATE_MIN_TH):
// 100 % to DER.start, linear to DER.floor % at DER.trip, and the inlet zone trips F.22 there. fw-constants-sync holds the
// three numbers against the C; the magnetics gates solve their derated corner at the same floor.
export const DER = { start: 55, trip: 75, floor: 60 };
const der = [];
for (let ta = 40; ta <= 80; ta += 1) der.push({ ta, p: ta <= DER.start ? 100 : ta < DER.trip ? 100 - (ta - DER.start) * (100 - DER.floor) / (DER.trip - DER.start) : ta === DER.trip ? DER.floor : 0 });
plotSVG({ title: "Output power derating vs inlet temperature (all SKUs, %)", xlabel: "inlet °C", ylabel: "% rated power",
  path: join(OUT, "..", "..", "simulation-results", "30kw", "plots", "derating-curve.svg"),
  series: [{ label: "P_avail %", x: der.map(d => d.ta), y: der.map(d => d.p) }] });
writeFileSync(join(OUT, "derating.csv"), "inlet_C,percent_power\n" + der.map(d => `${d.ta},${d.p}`).join("\n") + "\n");
console.log(`Derating: 100 % ≤ ${DER.start} °C → linear → ${DER.floor} % @ ${DER.trip} °C inlet, where the inlet zone trips (F.22) — plots/derating-curve.svg`);
console.log("→ calculations/out/loss-budget.csv, derating.csv");
