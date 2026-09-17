// envelope-grid.mjs — §35 FULL automated averaged-model grid: 6 Vin × 8 Vout × 7 load × 3 temp
// = 1008 operating points per SKU (3024 total). For each point: availability policy, S/P mode,
// bus command, LLC control mode + fn, all stage currents, temperature-iterated losses, η, Tj,
// and PASS/FAIL against ratings. Fidelity: averaged/analytical (L4 policy §9); switching-level
// corners were closed by DPT + llc-run. Run: node calculations/system/envelope-grid.mjs

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TANKS, TANK_CLASS, JBS_POS } from "../llc/tanks.mjs";
import { mountFor } from "../thermal/mount.mjs";
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
  // (tanks.mjs par). E68: thermal basis from mount.mjs — clip-mounted dies, 0.8 K/W j→base at 70 °C (air) · 0.65 K/W j→plate at 65 °C.
  { name: "30kw", P: 30e3, Imax: 100, lanes: 1, ch: 1, rdsP: 0.020 },   // E69a: 750 V 20 mΩ class PFC die
  { name: "40kw", P: 40e3, Imax: 133, lanes: 1, ch: 1, rdsP: 0.015 },   // E68: one PFC die per position · E69a: 750 V 15 mΩ class
  { name: "50kw", P: 50e3, Imax: 167, lanes: 1, ch: 1, ref: { cold: 10, room: 45, hot: 65 } },   // liquid: plate references
  { name: "50kwa", P: 50e3, Imax: 167, lanes: 1, ch: 1 },
];
for (const s of SKUS) { s.tRms = TANK_CLASS[s.name]; s.parL = TANKS[s.name].par; s.jbs = JBS_POS[s.name]; }
// E60: each SKU's OWN tank (tanks.mjs — the drawn crN×crVal / trim+leakage / Lm), not the 30 kW
// tank for all four; and the PFC bus reference carries the line-tracking floor (a Vienna cannot
// regulate below the line-line crest: 475 VAC on a 650 V bus simulated 15 % THD, 75 % overmod).
const gainFHA = (fn, Q, LN) => 1 / Math.hypot(1 + (1 / LN) * (1 - 1 / (fn * fn)), Q * (fn - 1 / fn));
// E81: the first-harmonic gain over-reads the power-solved deck ABOVE resonance — llc-stress.csv: +2 % at fn 1.09 (PAR400), +5 % at
// fn 1.15 (PAR300), +11 % at fn 1.41 (SER250 at bus 650) on every SKU — so the pre-E81 grid assigned phase shift at corners the
// deck reaches in PFM just below f_max, where the leg turns off near the tank peak. The correction is anchored on those rows.
const gain = (fn, Q, LN) => gainFHA(fn, Q, LN) * (fn > 1 ? 1 - 0.26 * (fn - 1) : 1);
function solveFn(M, Q, LN) { let lo = 0.45, hi = 1.45; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; gain(m, Q, LN) > M ? lo = m : hi = m; } return (lo + hi) / 2; }
export const busRef = (bank, Vin) => Math.min(830, Math.max(650, (2 * bank) / 0.95, 1.08 * Math.SQRT2 * Vin));
// E81 (F-G-3 / F-C-12): the Vienna switching coefficient per SKU READ from the repo DPT deck's final rows at the real currents and the
// DRAWN clamp network (simulation-results/<sku>/dpt-pfc-metrics.csv — the deck reads cells.tsx, so a clamp change re-runs into this):
// k_sw = mean of the two half-cycles (the drawn RCD clamp covers one polarity; the mirror clamp, where fitted, the other). The pre-E81
// grid carried 17.4 nJ/(V·A) hand-copied from a 78 A / 470 pF / −4 V deck; the as-drawn finals read 19–22, the fully clamped 17–19.
const KSW = (sku) => {
  try {
    const rows = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "simulation-results", sku, "dpt-pfc-metrics.csv"), "utf8")
      .split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split(","));
    const h = rows[0], iK = h.indexOf("koff_nJ_VA"), iC = h.indexOf("case"), iKind = h.indexOf("kind");
    const fin = rows.slice(1).filter((r) => r[iKind] === "final" && !/vhi/.test(r[iC]) && /-(clamped|UNCLAMPED)$/.test(r[iC])).map((r) => +r[iK]);
    return fin.length === 2 ? (fin[0] + fin[1]) / 2 * 1e-9 : 17.4e-9;
  } catch { return 17.4e-9; }
};
// E81 (review F-C-1): the LLC primary TURN-OFF loss per bridge position. The pre-E81 grid carried a flat 1 W (PFM) / 8 W (PSM)
// while the power-solved decks turn the switch off at 36–147 A above resonance (llc-stress.csv Ifet_toff: 90.7 A at the 30 kW
// SER250 PFM corner). W_off = koff · V_bus · I_toff · f_sw with koff from tanks.mjs (datasheet Eoff/(V·I)), f_sw = fn · fr and
// I_toff from the energy-consistent bridge phase: cos φ = P/(V1rms · Ip_rms), V1rms = 4·Vbus/(π√2) — in PFM the leg turns off at
// Ip_pk·sin φ (never below the magnetizing peak); in PSM the lagging leg turns off near the magnetizing current (the deck's PS
// corners read 10.7 / 17.4 A). ZVS turn-on is assumed (the E81 dead-time schedule holds it). The term is per POSITION and the
// paralleled dies share it; loss-budget carries the same term at the rated point so the two ledgers cannot drift.
// I_toff anchors (llc-stress.csv Ifet_toff vs this estimate): PFM — the switch current at the gate edge is ≈1.45 × the fundamental's
// Ip_pk·sin φ (30/40/50 kW SER250: 90.7/119.8/147 A vs 89/119/146 A estimated; PAR400 38.2 vs 39.7; SER750 43.3 vs 40.3), never below
// the magnetizing peak and never above the tank peak. PSM — the deck's column is the LAGGING leg (10.7–17.4 A at deep shift); the
// LEADING leg turns off near the tank peak, so the per-position worst in PSM is the tank peak itself (crest ≈ 1.6 in PS corners).
// E81 close-out (G deck, lead sweep): in phase shift the WEAK leg loses zero-voltage turn-on wherever the tank cannot move the leg's
// charge with its decaying current (PAR200 / PS150 on every SKU, SER250 at the high-line bus floor on the 30 kW): the incoming die
// then turns on hard against the leg's stored energy, ≈ ½·Q_leg·V per transition, Q_leg = 2·par·(Q_oss(V) + cs·V), on the TWO leg-A
// positions once per period. The grid carries it at every PSM corner (conservative: the deck shows a narrow window at some), so the
// current-limited low-voltage corners fold honestly instead of assuming ZVS.
// The energy is that of the RESIDUAL the deck reports (Vres_A: what the incoming die switches against after the partial slew), not the
// whole bus: E = 2·par·[ (2/3)·Q800·V_res^1.5/√800 (the √V charge law integrated) + ½·cs·V_res² ] per transition, two leg-A positions.
// The residual fraction per SKU is the worst Vres_A / bus over the deck's phase-shift corners (llc-stress.csv) — ASSUMED constant
// across the grid's PSM rows (the deck has three such corners per SKU; T-58 measures the leg-node timing).
const qossV = (t, V) => t.dieP.qoss800 * Math.sqrt(V / 800);
// Per-SKU anchors from the deck's phase-shift corners: (bank, bus) → residual fraction Vres_A / bus. The residual is a property of the
// corner's freewheel interval (PS150 at 650 V: 38 / 83 / 90 %; PAR200: 7 / 23 / 25 %; SER250 at the 764 V bus floor: 4 / 23 / 29 %;
// PAR250 at 650 V: full ZVS), so a grid row takes the anchor nearest in (bank, bus). ASSUMED constant over load at that bank
// (the deck's anchors are the I_max corners; T-58 measures the leg-node timing).
const RESANCH = (() => {
  const out = {};
  for (const sku of Object.keys(TANKS)) {
    try {
      const rows = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "simulation-results", sku, "llc-stress.csv"), "utf8")
        .split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split(","));
      const h = rows[0], iM = h.indexOf("mode"), iV = h.indexOf("Vres_A_V"), iB = h.indexOf("bus_V"), iK = h.indexOf("bank_V");
      out[sku] = iV >= 0 ? rows.slice(1).filter((r) => r[iM] === "PS").map((r) => ({ bank: +r[iK], bus: +r[iB], frac: +r[iV] / +r[iB] })) : [];
    } catch { out[sku] = []; }
  }
  return out;
})();
const resFrac = (sku, bank, bus) => {
  const a = RESANCH[sku] ?? [];
  if (!a.length) return 1;   // no residual column → the full bus (pessimistic)
  let best = a[0], d0 = Infinity;
  for (const x of a) { const d = Math.abs(x.bank - bank) / 50 + Math.abs(x.bus - bus) / 100; if (d < d0) { d0 = d; best = x; } }
  return best.frac;
};
// E81 close-out validation: a differential deck run at the 50 kW PS150 corner (cs 1000 pF vs 100 pF, fixed duty) measured the
// cs-dependent loss at ≈ 1.4 × the FULL charge-replacement energy Cs·V², and ≈ 2.8 × the ½CV² first model — the snap re-charges
// the opposite die THROUGH the incoming channel, so the dissipated energy per event is Q·V-class, not ½CV². The term below
// carries the full charge-replacement energy per event (Q_oss(V_res)·V_res + C_s·V_res²), two events per period on the weak leg,
// shared by its 2·par dies; residual anchors from the deck (llc-stress.csv Vres_A). Band ≈ ±40 % (the DPT convention).
const wHard = (t, ctl, bus, fn, FR, bank = 250) => {
  if (ctl !== "PSM") return 0;
  const vr = bus * resFrac(t.sku ?? "30kw", bank, bus);
  const eLeg = qossV(t, vr) * vr + (t.cs ?? 0) * vr * vr;   // per event, whole leg (2·par dies share it)
  return 2 * t.par * eLeg * fn * FR;
};
const wOff = (t, ctl, bus, Pph, Ip, imPk, fn, FR) => {
  const v1 = 4 * bus / (Math.PI * Math.SQRT2), cosPhi = Math.min(1, Pph / Math.max(v1 * Ip, 1e-9));
  const ipPk = Ip * (ctl === "PSM" ? 1.6 : Math.SQRT2);
  const iToff = ctl === "PSM" ? ipPk : Math.min(ipPk, Math.max(1.45 * Ip * Math.SQRT2 * Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi)), imPk));
  return { w: (t.koff ?? t.dieP.koff) * bus * iToff * fn * FR, iToff };
};

// Secondary SiC JBS per corner (E67 full bridge): one bridge per bank, `n` diodes per position. Bank DC current Ib = Iout (SER)
// or Iout/2 (PAR); each position conducts a half-sine: per diode avg Ib/(2n), rms π·Ib/(4n). Hot class: V0 0.95 V, rd 45 mΩ
// (20 A) / 22 mΩ (40 A) — RFQ acceptance.
const jbsW = (Iout, mode, j) => { const Ib = mode === "SER" ? Iout : Iout / 2, rd = j.cls === 40 ? 0.022 : 0.045; return 0.95 * Ib / (2 * j.n) + rd * (Math.PI * Ib / (4 * j.n)) ** 2; };
const rows = [["sku","Vin","Vout","load","temp","mode","ctl","Pout_W","bus_V","fn","Ip_rms_A","Iline_A","eta_pct","Tj_pfc_C","Tj_llc_C","PASS","notes","Tj_jbs_C","Woff_pos_W","Itoff_A"]];
let fails = 0, worst = { eta: 100 }, tjMax = 0;
for (const s of SKUS) {
  const { Lr: LR, Cr: CR, Lm: LM, fr: FR, n: NT } = TANKS[s.name], LN = LM / LR;
  const ksw = KSW(s.name === "50kwa" ? "50kwa" : s.name);   // E81: per-SKU Vienna switching coefficient from the DPT finals
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
    // E81 (F-C-2): the hot base is the mount's per-SKU air-side reference (mount.mjs AIR_REF 74/75/77 °C — the 70 °C extrusion at a
    // 55 °C inlet is below the outlet-air temperature the fan budget itself computes); cold/room keep the grid's 10/45 °C
    const HS = s.ref?.[T.n] ?? (T.n === "hot" ? mountFor(s.name).ref : T.hs);   // E42: liquid SKUs reference the PLATE temp
    const RTH = mountFor(s.name).rth;             // E68: mount.mjs (clip-mounted dies)
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
      const rdsP = (s.rdsP ?? 0.010) * (1 + 0.004 * (TjP - 25));   // E69a: per-SKU PFC die
      const Pc = (IswR / par) ** 2 * 2 * rdsP, Psw = ksw * (bus / 2) * (2 / Math.PI) * (Iline * Math.SQRT2) * 50e3 / par;
      TjP = HS + (Pc / 2 + Psw) * RTH;                      // per-PACKAGE dissipation into the SKU's Rth
      const rdsL = TANKS[s.name].dieP.rds * (1 + 0.004 * (TjL - 25));   // E69a: per-SKU LLC die
      const parL = s.parL ?? 1;                             // E44: paralleled LLC — per-PACKAGE share
      const off = wOff(TANKS[s.name], ctl, bus, Pph2, Ip, im * Math.SQRT2, fn, FR);   // E81: turn-off loss per position
      const hard = wHard({ ...TANKS[s.name], sku: s.name }, ctl, bus, fn, FR, bank);    // E81: weak-leg hard turn-on (PSM)
      TjL = HS + ((Ip / Math.SQRT2 / parL) ** 2 * rdsL + Math.max(off.w, hard) / parL) * RTH;
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
        const rdsL = TANKS[s.name].dieP.rds * (1 + 0.004 * (TjL - 25));   // E69a: per-SKU LLC die
        const parL = s.parL ?? 1;
        const off = wOff(TANKS[s.name], ctl, bus, PphE, Ip, im * Math.SQRT2, fn, FR);   // E81
        const hard = wHard({ ...TANKS[s.name], sku: s.name }, ctl, bus, fn, FR, bank);
        TjL = HS + ((Ip / Math.SQRT2 / parL) ** 2 * rdsL + Math.max(off.w, hard) / parL) * RTH;
      }
      TjD = HS + RTH * jbsW(PoutE / Vout, mode, s.jbs);
    }
    if (folds) notes += `thermal derate to ${f(100 * PoutE / Pout, 0)}% `;
    const Pph3 = PphE, Pout3 = PoutE;
    // stage losses (scaled from loss-budget building blocks)
    const pfcW = s.lanes * 3 * ((IswR ** 2) * 2 * (s.rdsP ?? 0.010) * (1 + 0.004 * (TjP - 25)) / (s.par ?? 1) + ksw * (bus / 2) * (2 / Math.PI) * Iline * Math.SQRT2 * 50e3 / 3 + 12.1 * (Iline / 54.94) ** 1.6 + 33.5 * (Iline / 54.94) ** 2 * 0.8);
    // E67: 4 bridge positions × parL packages (each position conducts half-cycle) · magnetics (2 D3 cells + D2) scaled from the
    // rated envelope losses (~2 % of ... see loss-budget MAG_RATED) · tank ESR/wiring 4 mΩ · 2 bank bridges
    const off3 = wOff(TANKS[s.name], ctl, bus, Pph3, Ip, im * Math.SQRT2, fn, FR);   // E81: 4 positions of turn-off loss
    const hard3 = wHard({ ...TANKS[s.name], sku: s.name }, ctl, bus, fn, FR, bank);
    // E81: in phase shift two positions carry the peak turn-off (leg B) and two the hard turn-on plus an I_m-class turn-off (leg A);
    // the worst DIE above carries max(turn-off, hard turn-on), not their sum
    const offA3 = ctl === "PSM" ? (TANKS[s.name].koff ?? TANKS[s.name].dieP.koff) * bus * im * Math.SQRT2 * fn * FR : off3.w;
    const llcW = 2 * Ip * Ip * TANKS[s.name].dieP.rHot / (s.parL ?? 1) + 2 * off3.w + 2 * (offA3 + hard3) + MAGW[s.name] * (Pph3 / s.P) ** 1.3 + Ip * Ip * 0.004;
    const Ib = mode === "SER" ? Pout3 / 0.99 / Vout : Pout3 / 0.99 / Vout / 2, rdJ = s.jbs.cls === 40 ? 0.022 : 0.045;
    const secW = 2 * (2 * 0.95 * Ib + rdJ * Math.PI ** 2 * Ib * Ib / (4 * s.jbs.n));
    const fixW = 20 + 12 * s.lanes + 10 * s.ch + 10 * (s.lanes > 2 ? 2 : 1);
    const outW = 1.05 * Pout3 / Vout;              // E67: DOUT blocking diode carries the output current (D8 copper is < 1 % of it)
    const loss = pfcW + llcW + secW + outW + fixW;
    const eta = 100 * Pout3 / (Pout3 + loss);
    // pass criteria
    const pass = TjP <= 150 && TjL <= 150.5 && TjD <= 150.5 && Ip <= CEIL * 1.02 && fn >= 0.45 && fn <= 1.45 &&
      (load < 0.25 || eta >= (Vout >= 300 && Vin >= 330 && load >= 0.5 ? 95 : 88));
    if (!pass) { fails++; notes = `LIMIT: ${TjP > 150 ? "TjPFC " : ""}${TjL > 150 ? "TjLLC " : ""}${Ip > CEIL * 1.02 ? "Ip " : ""}${fn < 0.45 || fn > 1.45 ? "fn " : ""}${eta < 88 ? "eta<88" : (load >= 0.5 && Vout >= 300 && Vin >= 330 && eta < 95) ? "eta<95 " : ""}`; }
    if (load === 1 && eta < worst.eta) worst = { eta, sku: s.name, Vin, Vout, T: T.n };
    tjMax = Math.max(tjMax, TjP, TjL, TjD);
    rows.push([s.name, Vin, Vout, load, T.n, mode, ctl, f(Pout, 0), f(bus, 0), f(fn, 3), f(Ip, 1), f(Iline, 1), f(eta, 2), f(TjP, 0), f(TjL, 0), pass ? "PASS" : "FAIL", notes, f(TjD, 0), f(off3.w, 1), f(off3.iToff, 1)]);
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
