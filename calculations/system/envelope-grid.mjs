// envelope-grid.mjs — §35 FULL automated averaged-model grid: 6 Vin × 8 Vout × 7 load × 3 temp
// = 1008 operating points per SKU (3024 total). For each point: availability policy, S/P mode,
// bus command, LLC control mode + fn, all stage currents, temperature-iterated losses, η, Tj,
// and PASS/FAIL against ratings. Fidelity: averaged/analytical (L4 policy §9); switching-level
// corners were closed by DPT + llc-run. Run: node calculations/system/envelope-grid.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TANKS, TANK_CLASS, JBS_POS } from "../llc/tanks.mjs";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
mkdirSync(OUT, { recursive: true });
const f = (x, d = 2) => Number(x.toFixed(d));
// E67 rated-point LLC magnetics loss per module (2 D3 cells + D2 at PAR400-full, windings 90 °C — magnetics-envelope rows)
const MAGW = { "30kw": 2 * (13.5 + 15.0) + 4.8 + 5.2, "40kw": 2 * (20.2 + 14.7) + 5.2 + 8.2, "50kw": 2 * (20.7 + 22.6) + 5.1 + 12.0, "50kwa": 2 * (20.6 + 22.7) + 5.2 + 12.1 };

const VINS = [285, 300, 330, 400, 450, 475];
const VOUTS = [150, 200, 250, 300, 400, 500, 750, 1000];   // E67: 500 V = the LOW/HIGH mode edge (both modes legal)
const LOADS = [0, 0.05, 0.10, 0.25, 0.50, 0.75, 1.0];
const TEMPS = [{ n: "cold", amb: -20, hs: 10 }, { n: "room", amb: 25, hs: 45 }, { n: "hot", amb: 55, hs: 70 }];
const SKUS = [
  // E67: tRms = the full-bridge tank-current CLASS in A RMS (current-coordination TANK_CLASS); parL = FETs per bridge position
  // (tanks.mjs par). Air thermal default 1.9 K/W j→air-sink at the 70 °C sink ref; liquid 1.1 K/W j→plate (E42).
  { name: "30kw", P: 30e3, Imax: 100, lanes: 1, ch: 1 },
  { name: "40kw", P: 40e3, Imax: 133, lanes: 1, ch: 1, par: 2 },   // E41: paralleled PFC pair
  { name: "50kw", P: 50e3, Imax: 167, lanes: 1, ch: 1, par: 2, rth: 1.1, ref: { cold: 10, room: 45, hot: 65 } },
  { name: "50kwa", P: 50e3, Imax: 167, lanes: 1, ch: 1, par: 2 },
];
for (const s of SKUS) { s.tRms = TANK_CLASS[s.name]; s.parL = TANKS[s.name].par; s.jbs = JBS_POS[s.name]; }
// E60: each SKU's OWN tank (tanks.mjs — the drawn crN×crVal / trim+leakage / Lm), not the 30 kW
// tank for all four; and the PFC bus reference carries the line-tracking floor (a Vienna cannot
// regulate below the line-line crest: 475 VAC on a 650 V bus simulated 15 % THD, 75 % overmod).
const gain = (fn, Q, LN) => 1 / Math.hypot(1 + (1 / LN) * (1 - 1 / (fn * fn)), Q * (fn - 1 / fn));
function solveFn(M, Q, LN) { let lo = 0.45, hi = 1.45; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; gain(m, Q, LN) > M ? lo = m : hi = m; } return (lo + hi) / 2; }
export const busRef = (bank, Vin) => Math.min(830, Math.max(650, (2 * bank) / 0.95, 1.08 * Math.SQRT2 * Vin));

// Secondary SiC JBS per corner (E67 full bridge): one bridge per bank, `n` diodes per position. Bank DC current Ib = Iout (SER)
// or Iout/2 (PAR); each position conducts a half-sine: per diode avg Ib/(2n), rms π·Ib/(4n). Hot class: V0 0.95 V, rd 45 mΩ
// (20 A) / 22 mΩ (40 A) — RFQ acceptance.
const jbsW = (Iout, mode, j) => { const Ib = mode === "SER" ? Iout : Iout / 2, rd = j.cls === 40 ? 0.022 : 0.045; return 0.95 * Ib / (2 * j.n) + rd * (Math.PI * Ib / (4 * j.n)) ** 2; };
const rows = [["sku","Vin","Vout","load","temp","mode","ctl","Pout_W","bus_V","fn","Ip_rms_A","Iline_A","eta_pct","Tj_pfc_C","Tj_llc_C","PASS","notes","Tj_jbs_C"]];
let fails = 0, worst = { eta: 100 }, tjMax = 0;
for (const s of SKUS) {
  const { Lr: LR, Cr: CR, Lm: LM, fr: FR, n: NT } = TANKS[s.name], LN = LM / LR;
  for (const Vin of VINS) for (const Vout of VOUTS) for (const mode of Vout < 500 ? ["PAR"] : Vout === 500 ? ["PAR", "SER"] : ["SER"]) for (const load of LOADS) for (const T of TEMPS) {
    const availIn = Vin >= 330 ? 1 : Vin / 330;
    const Pcap = Math.min(s.P * availIn, Vout * s.Imax);
    const Pout = Pcap * load;
    // E67: at the 500 V mode edge BOTH modes are legal (a HIGH session starts at 500 V; AUTO returns to LOW only below 480 V) —
    // SER at 500 V puts the bank at 250 V with twice the PAR tank current: the current-critical corner
    const bank = mode === "PAR" ? Vout : Vout / 2;
    const bus = busRef(bank, Vin);
    const M = (NT * bank) / bus;
    let notes = "";
    if (Pout === 0) { rows.push([s.name, Vin, Vout, load, T.n, mode, "IDLE", 0, f(bus, 0), "", 0, 0, "", "", "", "PASS", "standby"]); continue; }
    const HS = s.ref?.[T.n] ?? T.hs;              // E42: liquid SKUs reference the PLATE temp
    const RTH = s.rth ?? 1.9;                     // E42: 1.1 K/W j→plate vs 1.9 K/W j→air-sink
    const CEIL = s.tRms;                          // E67: full-bridge tank-current CLASS, A RMS
    const Pph = Pout / 0.98;                      // E67: ONE bridge carries the module
    const Rac = ((8 * NT * NT) / Math.PI ** 2) * bank * bank / Pph;
    const Q = Math.sqrt(LR / CR) / Rac;
    let ctl = "PFM", fn = 1;
    if (gain(1.45, Q, LN) > M) { ctl = "PSM"; fn = 1.45; }   // E67: phase shift at f_max below the PFM gain floor
    else fn = solveFn(M, Q, LN);
    let Ip1 = Pph / (0.9 * NT * bank);
    let im = (NT * bank) / (4 * fn * FR * LM) / Math.SQRT2;
    let Ip = Math.hypot(Ip1, im);
    let PoutE = Pout, PphE = Pph;
    if (Ip > CEIL) {                              // availability clamps to the tank class (never engaged by the E67 classes)
      for (let it = 0; it < 2; it++) {
        const Ip1max = Math.sqrt(Math.max(CEIL * CEIL - im * im, 1));
        const kx = Math.min(1, (Ip1max * 0.9 * NT * bank) / PphE);
        PphE = PphE * kx; PoutE = PoutE * kx;
        const QE = Math.sqrt(LR / CR) / (((8 * NT * NT) / Math.PI ** 2) * bank * bank / PphE);
        if (gain(1.45, QE, LN) > M) fn = 1.45; else fn = solveFn(M, QE, LN);
        im = (NT * bank) / (4 * fn * FR * LM) / Math.SQRT2;
        Ip1 = PphE / (0.9 * NT * bank);
        Ip = Math.hypot(Ip1, im);
      }
      notes = `tank-ceiling derate to ${f(100 * PoutE / Pout, 0)}% `;
    }
    const Pph2 = PphE, Pout2 = PoutE;
    // PFC side
    const Pin = Pout2 / 0.97;
    const Iline = Pin / (Math.sqrt(3) * Vin * 0.99) / s.lanes;      // per-lane phase current
    const IswR = 35.95 * (Iline / 54.94);
    // losses w/ Tj iteration (per worst package)
    let TjP = HS + 20, TjL = HS + 15;
    for (let i = 0; i < 25; i++) {
      const par = s.par ?? 1;                               // E41: paralleled devices share the pair current
      const rdsP = 0.010 * (1 + 0.004 * (TjP - 25));
      const Pc = (IswR / par) ** 2 * 2 * rdsP, Psw = 17.4e-9 * (bus / 2) * (2 / Math.PI) * (Iline * Math.SQRT2) * 50e3 / par;
      TjP = HS + (Pc / 2 + Psw) * RTH;                      // per-PACKAGE dissipation into the SKU's Rth
      const rdsL = 0.023 * (1 + 0.004 * (TjL - 25));
      const parL = s.parL ?? 1;                             // E44: paralleled LLC — per-PACKAGE share
      TjL = HS + ((Ip / Math.SQRT2 / parL) ** 2 * rdsL + (ctl === "PSM" ? 8 : 1) / parL) * RTH;
    }
    // E41: thermal fold — the FSM's DERATE ladder in grid form. If the LLC package exceeds its
    // ceiling at the (already tank-clamped) corner, availability folds back until it holds; the
    // 30 kW grid never engages this, the 40 kW hot PS corners do — exactly like the shipping
    // derating curve (100% <=55C -> linear fold).
    let folds = 0;
    let TjD = HS + RTH * jbsW(PoutE / Vout, mode, s.jbs);
    while ((TjL > 150 || TjD > 150) && folds < 10) {
      PphE *= 0.93; PoutE *= 0.93; folds++;
      Ip1 = PphE / (0.9 * NT * bank); Ip = Math.hypot(Ip1, im);
      TjL = HS + 15;
      for (let i = 0; i < 25; i++) {
        const rdsL = 0.023 * (1 + 0.004 * (TjL - 25));
        const parL = s.parL ?? 1;
        TjL = HS + ((Ip / Math.SQRT2 / parL) ** 2 * rdsL + (ctl === "PSM" ? 8 : 1) / parL) * RTH;
      }
      TjD = HS + RTH * jbsW(PoutE / Vout, mode, s.jbs);
    }
    if (folds) notes += `thermal derate to ${f(100 * PoutE / Pout, 0)}% `;
    const Pph3 = PphE, Pout3 = PoutE;
    // stage losses (scaled from loss-budget building blocks)
    const pfcW = s.lanes * 3 * ((IswR ** 2) * 2 * 0.010 * (1 + 0.004 * (TjP - 25)) / (s.par ?? 1) + 17.4e-9 * (bus / 2) * (2 / Math.PI) * Iline * Math.SQRT2 * 50e3 / 3 + 12.1 * (Iline / 54.94) ** 1.6 + 33.5 * (Iline / 54.94) ** 2 * 0.8);
    // E67: 4 bridge positions × parL packages (each position conducts half-cycle) · magnetics (2 D3 cells + D2) scaled from the
    // rated envelope losses (~2 % of ... see loss-budget MAG_RATED) · tank ESR/wiring 4 mΩ · 2 bank bridges
    const llcW = 2 * Ip * Ip * 0.035 / (s.parL ?? 1) + MAGW[s.name] * (Pph3 / s.P) ** 1.3 + Ip * Ip * 0.004;
    const Ib = mode === "SER" ? Pout3 / 0.99 / Vout : Pout3 / 0.99 / Vout / 2, rdJ = s.jbs.cls === 40 ? 0.022 : 0.045;
    const secW = 2 * (2 * 0.95 * Ib + rdJ * Math.PI ** 2 * Ib * Ib / (4 * s.jbs.n));
    const fixW = 20 + 12 * s.lanes + 10 * s.ch + 10 * (s.lanes > 2 ? 2 : 1);
    const outW = 1.05 * Pout3 / Vout;              // E67: DOUT blocking diode carries the output current (D8 copper is < 1 % of it)
    const loss = pfcW + llcW + secW + outW + fixW;
    const eta = 100 * Pout3 / (Pout3 + loss);
    // pass criteria
    const pass = TjP <= 150 && TjL <= 150.5 && TjD <= 150.5 && Ip <= CEIL * 1.02 && fn >= 0.45 && fn <= 1.45 &&
      (load < 0.25 || eta >= (Vout >= 300 && Vin >= 330 && load >= 0.5 ? 95 : 88));
    if (!pass) { fails++; notes = `LIMIT: ${TjP > 150 ? "TjPFC " : ""}${TjL > 150 ? "TjLLC " : ""}${Ip > CEIL * 1.02 ? "Ip " : ""}${eta < 88 ? "eta" : ""}`; }
    if (load === 1 && eta < worst.eta) worst = { eta, sku: s.name, Vin, Vout, T: T.n };
    tjMax = Math.max(tjMax, TjP, TjL, TjD);
    rows.push([s.name, Vin, Vout, load, T.n, mode, ctl, f(Pout, 0), f(bus, 0), f(fn, 3), f(Ip, 1), f(Iline, 1), f(eta, 2), f(TjP, 0), f(TjL, 0), pass ? "PASS" : "FAIL", notes, f(TjD, 0)]);
  }
}
writeFileSync(join(OUT, "envelope-grid.csv"),
  "# §35 full grid (E67 rev: full-bridge tanks, LOW/HIGH mode edge at 500 V, PSM at f_max, line-tracking bus floor), averaged fidelity; PASS = Tj<=150, Ip_rms<=tank class (78/100/120 A rms), fn in [0.45,1.45], eta floor\n" +
  rows.map(r => r.join(",")).join("\n") + "\n");
console.log(`Grid: ${rows.length - 1} points evaluated (${SKUS.length}×${VINS.length}×${VOUTS.length}×${LOADS.length}×${TEMPS.length}).`);
console.log(`FAILURES: ${fails}`);
console.log(`Worst full-load η: ${f(worst.eta, 2)}% at ${worst.sku} ${worst.Vin}VAC/${worst.Vout}V/${worst.T}`);
console.log(`Max Tj anywhere: ${f(tjMax, 0)} °C (ceiling 150)`);
if (fails) {
  const fr = rows.filter(r => r[15] === "FAIL").slice(0, 8);
  for (const r of fr) console.log("  FAIL:", r.join(","));
}
