// design-basis.mjs — Phase 1/2 preliminary sizing for the 30/60/120 kW monoblock platform.
// The Phase-1 design basis (input currents, DC link, LLC window, device counts) — its outputs feed loss-budget and the register.
// Status: ANALYTICAL ESTIMATE. No SPICE has been run. Component prices are placeholders pending RFQ.
// Run: node calculations/design-basis.mjs   (writes CSVs to calculations/out/)

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out");
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- assumptions
const ETA = 0.965;      // sizing efficiency (main-window target, conservative vs 0.97 peak)
const PF = 0.99;        // rated-operation power factor target
const SQRT3 = Math.sqrt(3);
const V_FULL = 330;     // full-power floor, VAC line-line; linear power derate below (constant input current)
const VBUS_NOM = 800;   // split DC link nominal (650–850 V command window)
const VBUS_MAX = 850;
const RIPPLE_FRACTIONS = [0.15, 0.25];      // PFC inductor peak-peak ripple as fraction of peak phase current
const FSW_CANDIDATES = [40e3, 50e3, 70e3, 100e3];
const DCLINK_UF_PER_KW = 35;                // three-phase PFC: no 2f line ripple; sized for transients/LLC decoupling
const CAP_UF = 470, CAP_V = 450;            // candidate electrolytic building block

const SKUS = [
  { name: "30kW",  P: 30e3,  Iout: 100, pfcLanes: 1, llcChannels: 1 },
  { name: "40kW",  P: 40e3,  Iout: 133, pfcLanes: 1, llcChannels: 1 },   // E41 variant: same structure, +33% current
  { name: "60kW",  P: 60e3,  Iout: 200, pfcLanes: 2, llcChannels: 2 },
  { name: "120kW", P: 120e3, Iout: 400, pfcLanes: 4, llcChannels: 4 },
];
const VLIST = [285, 300, 330, 400, 415, 450, 475];
const LOADS = [0.25, 0.5, 0.75, 1.0];

const csv = (rows) => rows.map(r => r.join(",")).join("\n") + "\n";
const f = (x, d = 1) => Number(x.toFixed(d));

// ------------------------------------------------- 1. input currents (§10)
// Iline = Pin / (sqrt(3)·VLL·PF), Pin = Pout/η.  Pavail derates linearly below V_FULL.
const pAvail = (P, V) => (V >= V_FULL ? P : (P * V) / V_FULL);
const iLine = (Pout, V) => Pout / ETA / (SQRT3 * V * PF);

const icRows = [["sku", "VLL_V", "load_frac", "Pout_W", "Pin_W", "Iline_Arms", "Ipk_A"]];
for (const s of SKUS)
  for (const V of VLIST)
    for (const load of LOADS) {
      const Pout = pAvail(s.P, V) * load;
      const I = iLine(Pout, V);
      icRows.push([s.name, V, load, f(Pout, 0), f(Pout / ETA, 0), f(I, 2), f(I * Math.SQRT2, 2)]);
    }
writeFileSync(join(OUT, "input-currents.csv"), csv(icRows));

console.log("=== INPUT CURRENT @100% AVAILABLE POWER (Arms/phase) ===");
console.log("VLL(V)  " + SKUS.map(s => s.name.padStart(8)).join(""));
for (const V of VLIST)
  console.log(String(V).padEnd(8) + SKUS.map(s => f(iLine(pAvail(s.P, V), V), 1).toString().padStart(8)).join("")
    + (V < V_FULL ? `   (derated to ${f(100 * pAvail(1, V), 0)}%)` : ""));

// ------------------------------------------------- 2. PFC inductor (§10/§11), per 10 kW phase cell
// Three-level Vienna worst-case ripple: dIpp = VBUS / (8·L·fsw)  →  L = VBUS / (8·fsw·dIpp)
// Design point: full power at V_FULL (max phase current).
const cell = { P: 10e3 };                                   // one phase of one lane; reused 3/6/12×
const IphDesign = iLine(3 * cell.P, V_FULL);                 // = 30 kW stage phase current at 330 V
const IpkDesign = IphDesign * Math.SQRT2;
const indRows = [["fsw_kHz", "ripple_frac", "dIpp_A", "L_uH", "Ipk_incl_ripple_A", "E_half_LI2_J"]];
console.log(`\n=== PFC INDUCTOR (per phase cell, Iph=${f(IphDesign)} Arms, Ipk=${f(IpkDesign)} A @ ${V_FULL} VAC full power) ===`);
for (const fsw of FSW_CANDIDATES)
  for (const r of RIPPLE_FRACTIONS) {
    const dIpp = r * IpkDesign;
    const L = VBUS_MAX / (8 * fsw * dIpp);
    const IpkTot = IpkDesign + dIpp / 2;
    const E = 0.5 * L * IpkTot * IpkTot;
    indRows.push([fsw / 1e3, r, f(dIpp, 1), f(L * 1e6, 1), f(IpkTot, 1), f(E, 3)]);
    console.log(`fsw=${fsw / 1e3} kHz  ripple=${r * 100}%  dIpp=${f(dIpp, 1)} A  L=${f(L * 1e6, 1)} uH  Ipk=${f(IpkTot, 1)} A  E=${f(E, 3)} J`);
  }
writeFileSync(join(OUT, "pfc-inductor.csv"), csv(indRows));

// ------------------------------------------------- 3. DC link (§12)
const dcRows = [["sku", "C_total_uF", "C_per_half_uF", "caps_470uF_450V", "E_stored_J", "precharge_E_J"]];
console.log("\n=== DC LINK (split bus, 2×450 V series banks) ===");
for (const s of SKUS) {
  const Ctot = (DCLINK_UF_PER_KW * s.P) / 1e3;              // µF
  const Chalf = 2 * Ctot;
  const nCaps = 2 * Math.ceil(Chalf / CAP_UF);
  const CtotActual = (Math.ceil(Chalf / CAP_UF) * CAP_UF) / 2;
  const E = 0.5 * CtotActual * 1e-6 * VBUS_NOM ** 2;
  dcRows.push([s.name, f(CtotActual, 0), f(CtotActual * 2, 0), nCaps, f(E, 0), f(E, 0)]);
  console.log(`${s.name}: C_total=${f(CtotActual, 0)} uF (${nCaps}× ${CAP_UF}uF/${CAP_V}V), E=${f(E, 0)} J (precharge must deliver this)`);
}
writeFileSync(join(OUT, "dclink.csv"), csv(dcRows));

// ------------------------------------------------- 4. LLC operating window / S-P bank check (§5/§13)
// Half-bridge legs across full bus → per-section unity-gain bank voltage = (VBUS/2)/n_eff.
// n_eff = 1.0 chosen so bank = 400 V at VBUS=800, gain 1.
const N_EFF = 1.0, G_MIN = 0.8, G_MAX = 1.25;
const bank = (vbus, g) => (vbus / 2 / N_EFF) * g;
const bankMin = bank(650, G_MIN), bankMax = bank(850, G_MAX);
const llcRows = [
  ["param", "value"],
  ["n_eff", N_EFF], ["g_pfm_min", G_MIN], ["g_pfm_max", G_MAX],
  ["bank_V_min_PFM", f(bankMin)], ["bank_V_max_PFM", f(bankMax)],
  ["bank_V_required_min", 150], ["bank_V_required_max", 525],
  ["gain_hole_V", `150-${f(bankMin, 0)}`],
  ["g_needed_at_150V_bus650", f(150 / (650 / 2), 3)],
];
writeFileSync(join(OUT, "llc-window.csv"), csv(llcRows));
console.log(`\n=== LLC / S-P WINDOW ===`);
console.log(`PFM-only bank window: ${f(bankMin)}–${f(bankMax)} V (bus 650–850 V, gain ${G_MIN}–${G_MAX})`);
console.log(`Required bank window: 150–~525 V (parallel 150–500 V out, series 300–1000 V out, crossover band ~450–550 V)`);
console.log(`GAIN HOLE below ${f(bankMin, 0)} V bank: needs g=${f(150 / 325, 2)} @ bus 650 V → hybrid PFM+phase-shift/burst region (Phase 6/7 must prove)`);

// ------------------------------------------------- 5. semiconductor & driver counts (§4/§17)
// Vienna bidirectional switch = common-source FET pair, ONE gate signal + ONE isolated driver per phase.
// LLC: 3 half-bridge legs per channel = 6 FETs, 6 isolated channels. Secondary baseline: JBS bridge ×2 banks ×3 sections.
const cntRows = [["sku", "pfc_fets", "pfc_diodes", "llc_pri_fets", "sec_jbs_diodes", "iso_drv_channels", "pwm_pfc", "pwm_llc"]];
for (const s of SKUS) {
  const pfcF = 6 * s.pfcLanes, pfcD = 6 * s.pfcLanes, llcF = 6 * s.llcChannels, secD = 24 * s.llcChannels;
  const drv = 3 * s.pfcLanes + 6 * s.llcChannels;
  cntRows.push([s.name, pfcF, pfcD, llcF, secD, drv, 3 * s.pfcLanes, 3 * s.llcChannels]);
}
writeFileSync(join(OUT, "semis-count.csv"), csv(cntRows));
console.log("\n=== DEVICE / DRIVER / PWM COUNTS (JBS-secondary baseline) ===");
console.log(cntRows.map(r => r.join("\t")).join("\n"));

// ------------------------------------------------- 6. COGS model (§43) — INR @ ~1000 u/SKU
// Two pricing scenarios: proto (LCSC/small-qty) and rfq (direct-manufacturer volume target).
// mult60/mult120: row scaling vs 30 kW (1 = shared, 2/4 = per-power-stage).
const rows = [
  ["SiC PFC MOSFET 750V/10mΩ ×6",  3900, 1980, 2, 4],
  ["SiC PFC JBS 1200V/40A ×6",     1200,  720, 2, 4],
  ["SiC LLC primary 1200V/~20mΩ ×6",2880, 2340, 2, 4],
  ["Secondary SiC JBS bridge ×24", 2640, 2160, 2, 4],
  ["Gate drive (9 iso ch + bias)", 1440, 1150, 2, 4],
  ["MCU/control/logic (2× GD32G553)",700,  600, 1, 1],
  ["Sensing (shunts/iso-amps/dividers)",900,750, 1.5, 2.5],
  ["DC-link electrolytics",        1800, 1500, 2, 4],
  ["Film caps (commutation+resonant)",900, 750, 2, 4],
  ["EMI filter + surge",           1300, 1100, 1.8, 3.2],
  ["PFC inductors ×3",             1140,  950, 2, 4],
  ["LLC transformers ×3 sections", 1560, 1300, 2, 4],
  ["Resonant caps / ext. Lr",       540,  450, 2, 4],
  ["S/P + precharge relays",       1400, 1100, 1.5, 2.5],
  ["Aux supply",                    550,  480, 1.2, 1.5],
  ["Main PCB",                     1500, 1250, 1.6, 2.6],
  ["Busbars/copper",                600,  500, 1.9, 3.6],
  ["Connectors (AC/DC/CAN)",        700,  600, 1.5, 2.4],
  ["Heatsink + TIM",               1300, 1100, 1.9, 3.6],
  ["Fans",                          700,  600, 2, 3.5],
  ["Enclosure sheet metal",        1000,  850, 1.35, 1.9],
  ["Assembly + cal + EOL test",    1800, 1500, 1.45, 2.1],
  ["Misc hardware",                 400,  350, 1.5, 2.5],
];
const costRows = [["item", "proto30", "rfq30", "proto60", "rfq60", "proto120", "rfq120"]];
const tot = { p30: 0, r30: 0, p60: 0, r60: 0, p120: 0, r120: 0 };
for (const [name, p, r, m60, m120] of rows) {
  const vals = [p, r, p * m60, r * m60, p * m120, r * m120].map(v => Math.round(v));
  costRows.push([`"${name}"`, ...vals]);
  tot.p30 += vals[0]; tot.r30 += vals[1]; tot.p60 += vals[2]; tot.r60 += vals[3]; tot.p120 += vals[4]; tot.r120 += vals[5];
}
costRows.push(["TOTAL", tot.p30, tot.r30, tot.p60, tot.r60, tot.p120, tot.r120]);
writeFileSync(join(OUT, "cost-model.csv"), csv(costRows));
console.log("\n=== COGS MODEL, INR @1000u (proto pricing / direct-RFQ target pricing) ===");
console.log(`30 kW : ${tot.p30} / ${tot.r30}   (red-line 25000, stretch 22000)`);
console.log(`60 kW : ${tot.p60} / ${tot.r60}   (red-line 42000, stretch 36000)`);
console.log(`120 kW: ${tot.p120} / ${tot.r120}   (red-line 78000, stretch 68000)`);
console.log("\nCSVs written to calculations/out/");
