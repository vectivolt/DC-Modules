// pfc-design.mjs — Phase 3: Vienna PFC electrical + inductor design, fsw selection by system cost (§10/§11).
// Method: numeric integration of Vienna conduction intervals (no recalled closed forms),
// temperature-iterated SiC conduction, datasheet-class switching-energy scaling (k_sw calibrated,
// REFINED BY Phase-4 DPT), sendust-toroid inductor design with bias roll-off.
//
// PROVENANCE / ASSUMPTIONS (all marked, verify per component-selection.md):
//  - Rds25 = 10 mΩ (B3M010C075Z class); Rds(T) = Rds25·(1+0.004·(Tj−25))  [≈1.5× @150 °C, SiC-typical, vendor curve TBD]
//  - Esw_total = k_sw·V·I with k_sw = 17.4e-9 J/(V·A) — RECALIBRATED from DPT run dpt-pfc750-final
//    (Eon+Eoff = 577 µJ @ 425 V/78 A, behavioral model; uncertainty band ±40% until vendor models)
//  - JBS Vf = 1.35 V @Tj,hot incl. Rd; no reverse recovery (SiC JBS), cap. charge folded into k_sw
//  - Core: Kool Mµ-class 60µ toroid, 77439A7 catalog geometry Ae=1.99 cm², le=10.74 cm, AL=135 nH/T², V=21.3 cm³
//  - Bias roll-off µpu = 1/(1+1.455e-3·H_Oe^1.513) calibrated to 80%@30 Oe, 50%@75 Oe anchors (catalog curve, VERIFY)
//  - Core loss (mW/cm³) = 52.4·Bpk_T^2.12·f_kHz^1.46 (Kool Mµ fit, ripple-flux region; VERIFY vs datasheet)
//  - ΔT_core ≈ (P_mW/A_surf_cm²)^0.833 (Magnetics empirical)
//  - Cost proxies: thermal system ₹60/W of stage loss; EMI filter proxy ₹ from ripple×freq weighting (documented inline)
// Run: node calculations/pfc/pfc-design.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
mkdirSync(OUT, { recursive: true });
const f = (x, d = 2) => Number(x.toFixed(d));

// ---- operating point (design): 30 kW lane at 330 VAC full power (worst continuous)
const P_LANE = +(process.env.PFC_P ?? 30e3);   // E41: 40e3 runs the hot-variant design point
const VLL = 330, PIN = P_LANE / 0.965, VBUS = 800;
const Vph_pk = (VLL / Math.sqrt(3)) * Math.SQRT2;          // 269.4 V
const Iph_rms = PIN / (Math.sqrt(3) * VLL * 0.99);
const Ipk = Iph_rms * Math.SQRT2;
const M = Vph_pk / (VBUS / 2);                              // modulation index vs half-bus

// ---- numeric device-current integrals over half line cycle (θ 0..π), CCM, unity PF
const N_INT = 20000;
let sw2 = 0, dAvg = 0, d2 = 0;
for (let i = 0; i < N_INT; i++) {
  const th = (Math.PI * (i + 0.5)) / N_INT;
  const iL = Ipk * Math.sin(th);
  const dSw = 1 - M * Math.sin(th);                         // switch duty (boost to half-bus)
  sw2 += iL * iL * dSw;                                     // switch RMS²
  dAvg += iL * (1 - dSw);                                   // diode average
  d2 += iL * iL * (1 - dSw);                                // diode RMS²
}
const Isw_rms = Math.sqrt(sw2 / N_INT);
const Id_avg = dAvg / N_INT;
const Id_rms = Math.sqrt(d2 / N_INT);

// ---- SiC conduction with Tj iteration (pair = 2 dies in series in Vienna bidirectional switch)
const RTH_JA = 1.9; // K/W junction→air via TIM+heatsink per device position (thermal calc refines, Phase 8)
const TAMB_HS = 70; // heatsink ambient at +55 °C inlet (assumption, Phase 8 refines)
const PAR = +(process.env.PFC_PAR ?? 1);   // E41: 2 = paralleled pair (two B3M per position)
function pairLoss(fsw) {
  // pair = TWO TO-247 packages (x PAR when paralleled); each package carries I/PAR.
  let Tj = 100, Pc = 0, Psw = 0;
  for (let it = 0; it < 40; it++) {
    const rds = 0.010 * (1 + 0.004 * (Tj - 25));
    Pc = Isw_rms ** 2 * 2 * rds / PAR;                      // pair-position total, shared by PAR devices
    Psw = 17.4e-9 * (VBUS / 2) * (2 / Math.PI) * Ipk * fsw;    // total switched (shared)
    const Ppkg = (Isw_rms / PAR) ** 2 * 2 * rds / 2 + Psw / PAR;   // worst PACKAGE
    const TjNew = TAMB_HS + Ppkg * RTH_JA;
    if (Math.abs(TjNew - Tj) < 0.01) { Tj = TjNew; break; }
    Tj = TjNew;
  }
  return { Pc, Psw, Tj };
}
// per-diode over FULL cycle: each of the 6 diodes conducts one half-cycle → avg/2, rms/√2
const Pdiode = 1.35 * (Id_avg / 2) + (Id_rms / Math.SQRT2) ** 2 * 0.012; // Vf + dyn. R (datasheet-class 1200 V/40 A JBS)

// ---- inductor design per fsw
// Geometry: 77439A7-class toroid (catalog: Ae=1.99 cm², le=10.74 cm, V=21.3 cm³, window≈4.27 cm², OD 47.6 mm).
// Materials: sendust 60µ (AL 135 nH/T²) and 26µ (AL scaled 135·26/60 = 58.5 nH/T², same geometry — exact 26µ p/n
// to confirm at core RFQ). Roll-off anchors (catalog curves, VERIFY): 60µ 80%@30 Oe · 50%@75 Oe;
// 26µ 80%@75 Oe · 50%@175 Oe. Swing design: ripple criterion enforced at the worst volt-second angle
// with the biased L(i(θ)) — not at crest with L0. Soft-sat floor: µpu ≥ 0.35 at Ipk+ΔI/2.
// Geometries: dimensions → Ae, le, window derived geometrically; AL derived as µ0·µr·Ae/le (self-check:
// 77439 60µ gives 139.7 nH/T² vs 135 catalog — 3.5% agreement validates the method).
const GEOMS = [
  { name: "T48 (77439-class)", Ae: 1.99e-4, le: 0.1074, Vc: 21.3, win: 4.27, Asurf: 95, mlt0: 0.062, mltK: 0.016, cost: 95 },
  { name: "T79 (OD79/ID49/H17 sendust)", Ae: 2.62e-4, le: 0.201, Vc: 52.7, win: 18.6, Asurf: 280, mlt0: 0.098, mltK: 0.036, cost: 210 },
];
const MATS = [
  { name: "60u", mu: 60, a: 1.455e-3, b: 1.513 },
  { name: "26u", mu: 26, a: 2.13e-4, b: 1.637 },
];
const MU0 = 4e-7 * Math.PI;
const muPU = (m, H_Am) => 1 / (1 + m.a * Math.pow(Math.max(H_Am / 79.577, 1e-9), m.b));
const RHO_CU = 1.68e-8 * 1.33;                              // Cu at ~100 °C
const WIRES = [10.6e-6, 13.75e-6, 17.2e-6, 21.5e-6, 25.8e-6];   // total Cu mm²: bundles of 1.6 mm strands / foil (drawing decides; E41 adds 10-12 strand bundles)
function inductorDesign(fsw, rippleFrac) {
  const dItgt = rippleFrac * Ipk;
  let bestI = null;
  for (const g of GEOMS)
    for (const mat of MATS)
      for (let stack = 1; stack <= 5; stack++)   /* E41: taller stacks of the SAME real core before any new p/n */
        for (const aw of WIRES) {
          if (Iph_rms / (aw * 1e6) > 5.5) continue;         // J ≤ 5.5 A/mm²
          for (let N = 10; N <= 80; N++) {
            if ((N * aw * 1e4) / g.win > 0.35) break;       // fill ≤ 0.35
            const AL = (MU0 * mat.mu * g.Ae) / g.le;
            const Lb = (I) => muPU(mat, (N * I) / g.le) * AL * stack * N * N;
            let dImax = 0, dBmax = 0;                       // ripple sweep with biased L(i(θ))
            for (let k = 1; k < 60; k++) {
              const th = (Math.PI * k) / 60;
              const L = Lb(Ipk * Math.sin(th));
              const dI = (Vph_pk * Math.sin(th) * (1 - M * Math.sin(th))) / (fsw * L);
              if (dI > dImax) dImax = dI;
              const dB = (L * dI) / (N * g.Ae * stack);
              if (dB > dBmax) dBmax = dB;
            }
            if (dImax > dItgt * 1.1) continue;
            if (muPU(mat, (N * (Ipk + dImax / 2)) / g.le) < 0.40) continue; // swing floor at peak (control margin)
            const MLT = g.mlt0 + g.mltK * stack;
            const Rdc = (RHO_CU * N * MLT) / aw;
            const Pcu = Iph_rms ** 2 * Rdc * 1.08;          // +8% AC factor on ripple component
            const Pfe = (52.4 * Math.pow(dBmax / 2, 2.12) * Math.pow(fsw / 1e3, 1.46) * g.Vc * stack) / 1e3;
            const P = Pcu + Pfe;
            const dT = Math.pow((P * 1000) / (g.Asurf * (1 + 0.35 * (stack - 1))), 0.833);
            if (dT > 65) continue;
            const cost = stack * g.cost + N * MLT * aw * 8900 * 950;
            const cand = { geom: g.name, mat: mat.name, stack, N, aw_mm2: aw * 1e6,
              L0: f(Lb(1) * 1e6, 1), Lpk: f(Lb(Ipk) * 1e6, 1), dIpp: f(dImax, 1), dB: f(dBmax * 1e3, 1),
              Rdc: f(Rdc * 1e3, 2), Pcu: f(Pcu, 1), Pfe: f(Pfe, 1), P: f(P, 1), dT: f(dT, 0),
              cost: Math.round(cost), Ltgt: f((VBUS / (8 * fsw * dItgt)) * 1e6, 1) };
            if (!bestI || P + cand.cost / 60 < bestI.P + bestI.cost / 60) bestI = cand;
          }
        }
  return bestI;
}

// ---- fsw selection: stage loss + magnetics + EMI proxy, per 30 kW lane (3 phases)
console.log(`Design point: ${VLL} VAC, Iph=${f(Iph_rms)} A, Ipk=${f(Ipk)} A, M=${f(M, 3)}`);
console.log(`Device currents (numeric): Isw_rms=${f(Isw_rms)} A, Id_avg=${f(Id_avg)} A, Id_rms=${f(Id_rms)} A\n`);
const rows = [["fsw_kHz","geom_mat","stack","N","L0_uH","Lpk_uH","dIpp_A","dB_mT","Pcu_W","Pfe_W","Pind_W","dT_C","ind_cost","Ppair_W","Tj_C","Pdiode_W","Pstage_W","emi_proxy","total_score"]];
let best = null;
for (const fsw of [40e3, 50e3, 70e3, 100e3]) {
  const ind = inductorDesign(fsw, 0.25);
  if (!ind) { console.log(`fsw=${fsw / 1e3} kHz: no feasible inductor (fill/sat/60 °C limits)`); continue; }
  const { Pc, Psw, Tj } = pairLoss(fsw);
  if (Tj > 150) { console.log(`fsw=${fsw / 1e3} kHz: REJECTED, Tj=${f(Tj, 0)} °C > 150 °C ceiling at worst corner`); continue; }
  const Ppair = Pc + Psw;
  const Pstage = 3 * (Ppair + Pdiode + ind.P);              // per lane
  // EMI proxy: lower fsw → bigger DM filter; ≥150 kHz fundamentals land in the conducted band — weight table (documented judgment):
  const emiProxy = { 40e3: 900, 50e3: 750, 70e3: 650, 100e3: 800 }[fsw];
  const score = Pstage * 60 + 3 * ind.cost + emiProxy;      // ₹: thermal ₹60/W + magnetics + EMI proxy
  rows.push([fsw / 1e3, `${ind.geom}|${ind.mat}|${ind.aw_mm2}mm2`, ind.stack, ind.N, ind.L0, ind.Lpk, ind.dIpp, ind.dB, ind.Pcu, ind.Pfe, ind.P, ind.dT, ind.cost, f(Ppair, 1), f(Tj, 0), f(Pdiode, 1), f(Pstage, 0), emiProxy, Math.round(score)]);
  console.log(`fsw=${String(fsw / 1e3).padStart(3)} kHz  ${ind.mat} ${ind.geom} ${ind.stack}-stack N=${ind.N}  L0=${ind.L0}→${ind.Lpk}µH@pk  ΔI=${ind.dIpp}A  Pind=${ind.P}W ΔT=${ind.dT}°C ₹${ind.cost}  Ppair=${f(Ppair, 1)}W Tj=${f(Tj, 0)}°C  Pstage=${f(Pstage, 0)}W  score=₹${Math.round(score)}`);
  if (!best || score < best.score) best = { fsw, score, ind, Ppair, Tj, Pstage };
}
writeFileSync(join(OUT, "pfc-design.csv"), rows.map(r => r.join(",")).join("\n") + "\n");
console.log(`\nSELECTED fsw = ${best.fsw / 1e3} kHz (min system score). PFC lane loss ${f(best.Pstage, 0)} W → lane η ≈ ${f(100 * (1 - best.Pstage / PIN), 2)}%`);
console.log(`Inductor: ${best.ind.stack}× ${best.ind.geom} ${best.ind.mat} sendust, N=${best.ind.N}, L0=${best.ind.L0} µH → ${best.ind.Lpk} µH @ Ipk`);
writeFileSync(join(OUT, "pfc-selected.json"), JSON.stringify({ fsw: best.fsw, L_uH: best.ind.Lpk, stack: best.ind.stack, N: best.ind.N, Isw_rms: f(Isw_rms), Id_avg: f(Id_avg), Iph_rms: f(Iph_rms), Ipk: f(Ipk), Pstage_lane_W: f(best.Pstage, 0), Tj_C: f(best.Tj, 0) }, null, 2));
