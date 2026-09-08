// envelope-grid.mjs — §35 FULL automated averaged-model grid: 6 Vin × 8 Vout × 7 load × 3 temp
// = 1008 operating points per SKU (3024 total). For each point: availability policy, S/P mode,
// bus command, LLC control mode + fn, all stage currents, temperature-iterated losses, η, Tj,
// and PASS/FAIL against ratings. Fidelity: averaged/analytical (L4 policy §9); switching-level
// corners were closed by DPT + llc-run. Run: node calculations/system/envelope-grid.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
mkdirSync(OUT, { recursive: true });
const f = (x, d = 2) => Number(x.toFixed(d));

const VINS = [285, 300, 330, 400, 450, 475];
const VOUTS = [150, 200, 250, 300, 400, 500, 750, 1000];
const LOADS = [0, 0.05, 0.10, 0.25, 0.50, 0.75, 1.0];
const TEMPS = [{ n: "cold", amb: -20, hs: 10 }, { n: "room", amb: 25, hs: 45 }, { n: "hot", amb: 55, hs: 70 }];
const SKUS = [
  { name: "30kw", P: 30e3, Imax: 100, lanes: 1, ch: 1 },
  { name: "40kw", P: 40e3, Imax: 133, lanes: 1, ch: 1, par: 2 },   // E41: paralleled PFC pair
  // E42 LIQUID variant: same silicon as 40 kW (paralleled PFC pairs, SINGLE LLC FETs — the
  // coldplate is what buys that). Thermal model: rth = j→plate ≈ 0.55 die + 0.35 TIM + 0.2
  // local plate constriction = 1.1 K/W into `ref` = plate temp at the device (coolant inlet
  // ≤60 °C + ~5 K spread at hot; cold = chiller floor; VERIFY both at plate thermal RFQ).
  // Tank class REVVED (E42): ceiling 65 A pk / OC 95 A pk / 100 A-class CT / 8×27 nF + BIN6 —
  // same 0.68 ceiling:OC ratio as the frozen 48/70 class the 30/40 share.
  { name: "50kw", P: 50e3, Imax: 167, lanes: 1, ch: 1, par: 2, rth: 1.1, ref: { cold: 10, room: 45, hot: 65 }, ipCeil: 65 },
  // E44 AIR variant: same tank class + PFC pairs as the liquid; the LLC half-bridges PARALLEL
  // (parL: per-package conduction quarters) so plain 4-fan air holds the full envelope — worst
  // corner ~99 °C, no folds. Air thermal defaults (1.9 K/W to the 70 °C sink ref).
  { name: "50kwa", P: 50e3, Imax: 167, lanes: 1, ch: 1, par: 2, parL: 2, ipCeil: 65 },
  { name: "60kw", P: 60e3, Imax: 200, lanes: 2, ch: 2 },
  { name: "120kw", P: 120e3, Imax: 400, lanes: 4, ch: 4 },
];
const LR = 7.0e-6, CR = 185.4e-9, LM = 63e-6, LN = 9, FR = 140e3;
const gain = (fn, Q) => 1 / Math.hypot(1 + (1 / LN) * (1 - 1 / (fn * fn)), Q * (fn - 1 / fn));

function solveFn(M, Q) { let lo = 0.45, hi = 1.45; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; gain(m, Q) > M ? lo = m : hi = m; } return (lo + hi) / 2; }

const rows = [["sku","Vin","Vout","load","temp","mode","ctl","Pout_W","bus_V","fn","Ip_rms_A","Iline_A","eta_pct","Tj_pfc_C","Tj_llc_C","PASS","notes"]];
let fails = 0, worst = { eta: 100 }, tjMax = 0;
for (const s of SKUS) {
  for (const Vin of VINS) for (const Vout of VOUTS) for (const load of LOADS) for (const T of TEMPS) {
    const availIn = Vin >= 330 ? 1 : Vin / 330;
    const Pcap = Math.min(s.P * availIn, Vout * s.Imax);
    const Pout = Pcap * load;
    const mode = Vout <= 500 ? "PAR" : "SER";                      // hysteresis band handled by FSM; grid uses 500 boundary
    const bank = mode === "PAR" ? Vout : Vout / 2;
    const bus = Math.min(830, Math.max(650, (2 * bank) / 0.95));
    const M = bank / (bus / 2);
    let notes = "";
    if (Pout === 0) { rows.push([s.name, Vin, Vout, load, T.n, mode, "IDLE", 0, f(bus, 0), "", 0, 0, "", "", "", "PASS", "standby"]); continue; }
    const HS = s.ref?.[T.n] ?? T.hs;              // E42: liquid SKUs reference the PLATE temp
    const RTH = s.rth ?? 1.9;                     // E42: 1.1 K/W j→plate vs 1.9 K/W j→air-sink
    const CEIL = s.ipCeil ?? 48;                  // E42: per-variant tank envelope ceiling (A pk)
    const Pph = Pout / 0.98 / (3 * s.ch);
    const Rac = (8 / Math.PI ** 2) * bank * bank / Pph;
    const Q = Math.sqrt(LR / CR) / Rac;
    let ctl = "PFM", fn = 1;
    if (M < 0.72) { ctl = "PS"; fn = 1; }
    else { fn = solveFn(M, Q); if (gain(1.45, Q) > M) { ctl = load <= 0.1 ? "BURST" : "PFM-hi"; fn = 1.45; } }
    let Ip1 = Pph / (0.9 * bank);
    let im = bus / 2 / (4 * fn * FR * LM) / Math.SQRT2;
    let Ip = Math.hypot(Ip1, im);
    // E41 corner policy: the tank hardware (CT class, trim bins, F.11 OC at 70 A pk, the 48 A pk
    // envelope ceiling) is IDENTICAL on the 30/40 — availability CLAMPS to the ceiling instead
    // of growing the tank. At 30 kW this never engages (grid unchanged); at 40 kW it derates the
    // low-line x low-output corners, exactly the commercial envelope-curve shape. Two-pass
    // re-solve so fn/Q/im are consistent at the clamped power.
    // E42: the 50 kW REVS the class instead (ipCeil 65 / OC 95 / 100 A CT / 8-cap tank) because
    // its Imax-bound region sits at Ip1 = 167/(0.98·3·0.9) = 63.1 A — clamping to 48 would fold
    // a third of the commercial envelope, which is a class-selection problem, not a physics one.
    let PoutE = Pout, PphE = Pph;
    if (Ip > CEIL) {
      for (let it = 0; it < 2; it++) {
        const Ip1max = Math.sqrt(Math.max(CEIL * CEIL - im * im, 1));
        const kx = Math.min(1, (Ip1max * 0.9 * bank) / PphE);
        PphE = PphE * kx; PoutE = PoutE * kx;
        const RacE = (8 / Math.PI ** 2) * bank * bank / PphE;
        const QE = Math.sqrt(LR / CR) / RacE;
        if (M >= 0.72) { fn = solveFn(M, QE); if (gain(1.45, QE) > M) fn = 1.45; }
        im = bus / 2 / (4 * fn * FR * LM) / Math.SQRT2;
        Ip1 = PphE / (0.9 * bank);
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
      TjL = HS + ((Ip / Math.SQRT2 / parL) ** 2 * rdsL + (ctl === "PS" ? 8 : 1) / parL) * RTH;
    }
    // E41: thermal fold — the FSM's DERATE ladder in grid form. If the LLC package exceeds its
    // ceiling at the (already tank-clamped) corner, availability folds back until it holds; the
    // 30 kW grid never engages this, the 40 kW hot PS corners do — exactly like the shipping
    // derating curve (100% <=55C -> linear fold).
    let folds = 0;
    while (TjL > 150 && folds < 10) {
      PphE *= 0.93; PoutE *= 0.93; folds++;
      Ip1 = PphE / (0.9 * bank); Ip = Math.hypot(Ip1, im);
      TjL = HS + 15;
      for (let i = 0; i < 25; i++) {
        const rdsL = 0.023 * (1 + 0.004 * (TjL - 25));
        const parL = s.parL ?? 1;
        TjL = HS + ((Ip / Math.SQRT2 / parL) ** 2 * rdsL + (ctl === "PS" ? 8 : 1) / parL) * RTH;
      }
    }
    if (folds) notes += `thermal derate to ${f(100 * PoutE / Pout, 0)}% `;
    const Pph3 = PphE, Pout3 = PoutE;
    // stage losses (scaled from loss-budget building blocks)
    const pfcW = s.lanes * 3 * ((IswR ** 2) * 2 * 0.010 * (1 + 0.004 * (TjP - 25)) / (s.par ?? 1) + 17.4e-9 * (bus / 2) * (2 / Math.PI) * Iline * Math.SQRT2 * 50e3 / 3 + 12.1 * (Iline / 54.94) ** 1.6 + 33.5 * (Iline / 54.94) ** 2 * 0.8);
    const llcW = s.ch * (6 * (Ip / Math.SQRT2) ** 2 * 0.035 / (s.parL ?? 1) + 3 * (20.5 * (Pph3 / 10.2e3) ** 1.3) + 3 * Ip * Ip * 0.008);
    const secW = s.ch * 2 * (2 * 1.35 * (Pout3 / 0.99 / (2 * s.ch)) / bank + 2 * 0.022 * ((Pout3 / (2 * s.ch) / bank) * 1.11) ** 2 / 3);
    const fixW = 20 + 12 * s.lanes + 10 * s.ch + 10 * (s.lanes > 2 ? 2 : 1);
    const loss = pfcW + llcW + secW + fixW;
    const eta = 100 * Pout3 / (Pout3 + loss);
    // pass criteria
    const pass = TjP <= 150 && TjL <= 150.5 && Ip <= CEIL + 0.05 && fn >= 0.45 && fn <= 1.45 &&
      (load < 0.25 || eta >= (Vout >= 300 && Vin >= 330 && load >= 0.5 ? 95 : 88));
    if (!pass) { fails++; notes = `LIMIT: ${TjP > 150 ? "TjPFC " : ""}${TjL > 150 ? "TjLLC " : ""}${Ip > CEIL + 0.05 ? "Ip " : ""}${eta < 88 ? "eta" : ""}`; }
    if (load === 1 && eta < worst.eta) worst = { eta, sku: s.name, Vin, Vout, T: T.n };
    tjMax = Math.max(tjMax, TjP, TjL);
    rows.push([s.name, Vin, Vout, load, T.n, mode, ctl, f(Pout, 0), f(bus, 0), f(fn, 3), f(Ip, 1), f(Iline, 1), f(eta, 2), f(TjP, 0), f(TjL, 0), pass ? "PASS" : "FAIL", notes]);
  }
}
writeFileSync(join(OUT, "envelope-grid.csv"),
  "# §35 full grid, averaged fidelity; models from pfc-design/llc-design/loss-budget; PASS = Tj<=150, Ip<=48 A, fn in [0.45,1.45], eta floor\n" +
  rows.map(r => r.join(",")).join("\n") + "\n");
console.log(`Grid: ${rows.length - 1} points evaluated (${SKUS.length}×${VINS.length}×${VOUTS.length}×${LOADS.length}×${TEMPS.length}).`);
console.log(`FAILURES: ${fails}`);
console.log(`Worst full-load η: ${f(worst.eta, 2)}% at ${worst.sku} ${worst.Vin}VAC/${worst.Vout}V/${worst.T}`);
console.log(`Max Tj anywhere: ${f(tjMax, 0)} °C (ceiling 150)`);
if (fails) {
  const fr = rows.filter(r => r[15] === "FAIL").slice(0, 8);
  for (const r of fr) console.log("  FAIL:", r.join(","));
}
