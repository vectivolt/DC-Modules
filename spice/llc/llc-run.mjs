// llc-run.mjs — per-SKU, POWER-SOLVED full-bridge LLC switching validation (ngspice-46).
// E60 method, E67 topology. Each corner's fsw (PFM) or phase shift (PS) is SOLVED against the simulated bank power, per SKU
// tank (calculations/llc/tanks.mjs), and the deck reports what protection and magnetics need — tank peak and RMS, magnetizing
// peak, Cr AC voltage, secondary/diode currents, FET turn-off current, ZVS on all four switches — plus tolerance corners and an
// internal-short transient for the F.11 timing race.
// E67: one full bridge (legs A/B, `par` FETs per position lumped as conductance + Coss) → Cr → Lr → transformer n:1:1 (Lm on the
// primary, two secondaries into bank A/B through SiC bridges). PS is a TRUE phase shift of leg B at f_max = 1.45·fr (hybrid PFM →
// PSM: below the PFM gain floor the bridge stays at f_max and phase-shifts; the E60 half-bridge deck used a duty surrogate at fr,
// which on one bridge ran 111 A rms / 199 A pk at the 764 V-bus corner against 93 / 148 A at f_max — E67 scan).
// Output modes: LOW ≤ 500 V (banks parallel) / HIGH ≥ 500 V (banks series), set in standby — so the bank spans 150–500 V and the
// corners below are the two mode edges plus the interior.
// Method limits (unchanged, documented): banks are ideal V-sources (op-point), FETs are gate-modulated conductances, JBS are
// behavioral diodes; device-edge fidelity is the DPT level's job. Run: node spice/llc/llc-run.mjs [sku ...]
//
// E81 / review G (F-G-9) — NON-LINEAR Coss. Until E81 each leg node carried ONE LINEAR capacitor of `tanks.mjs t.coss`, so a
// ZVS transition moved 250 pF × V of charge per die where the real die moves `dieP.qoss800` = 371 nC at 800 V (2.9 × more), and
// only ONE device's capacitance was modelled where a real leg must discharge the outgoing device AND charge the incoming one.
// Now the die's output capacitance IS the body diode's junction capacitance (Cds is that junction), fitted as
//   C(V) = Cjo/(1+V/Vj)^M  with  M = 0.5, Vj = 2 V   →   Q(V) = Cjo·Vj/(1−M)·[(1+V/Vj)^(1−M) − 1]
// and Cjo solved per die so that Q(800 V) = dieP.qoss800. For the 23 mΩ die that is Cjo = 4.876 nF, which also returns
// C(800 V) = 243 pF — i.e. the fit reproduces BOTH the datasheet charge and the 250 pF small-signal value the E60 deck used.
// The E81 turn-off snubber `tanks.mjs t.cs` stays LINEAR and sits drain–source on every die of both devices.
// The ZVS acceptance window is 20 V (was 50 V on an 830 V bus = 6 % of the rail).
import { runDeck } from "../run.mjs";
import { plotSVG } from "../../calculations/plot.mjs";
import { TANKS, fingerprint } from "../../calculations/llc/tanks.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESROOT = join(HERE, "..", "..", "simulation-results");
const f = (x, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)) : "NaN");
const TDEAD = 120e-9, CYC = 16;
export const FMAX = 1.45;                           // PFM ceiling as a multiple of fr; PSM runs here
export const busFor = (bank) => Math.min(830, Math.max(650, (2 * bank) / 0.95));
export const ZVS_WIN = 20;                          // V from the rail still counted as zero-voltage turn-on (F-G-9: was 50)
// E81 Coss fit: C(V) = Cjo/(1+V/Vj)^M, Q(V) = Cjo·Vj/(1−M)·[(1+V/Vj)^(1−M) − 1]; Cjo solved from Qoss(800 V)
export const COSS_M = 0.5, COSS_VJ = 2;
const qShape = (V) => (COSS_VJ / (1 - COSS_M)) * (Math.pow(1 + V / COSS_VJ, 1 - COSS_M) - 1);
export const cjoFor = (qoss800) => qoss800 / qShape(800);              // F per die
export const qossDie = (V, qoss800) => cjoFor(qoss800) * qShape(V);    // C per die at V

// E81 / review G: PER-LEG dead time. In PSM leg A is the LEADING leg (it turns off at the tank peak and slews fast, so a
// long dead time lets the tank current reverse and pull the node back before the incoming gate) and leg B is the LAGGING
// leg (it commutates on the magnetizing current alone and needs a long one). The HRTIMER programs ST0 and ST1 separately.
export function deck(t, { VBUS, VBANK, fsw, duty = null, tol = {}, shortAt = null, tstop, tstart, tdead = TDEAD, tdeadA = tdead, tdeadB = tdead }) {
  const T = 1 / fsw, d = duty ?? 0.5;
  const pwOf = (td) => T / 2 - td - 20e-9;
  const Cr = t.Cr * (tol.cr ?? 1), Lr = t.Lr * (tol.lr ?? 1), Lm = t.Lm * (tol.lm ?? 1), Ls = Lm / (t.n * t.n);
  const csDie = t.cs ?? 0, cjo = cjoFor(t.dieP.qoss800) * t.par;   // E81: non-linear Coss per POSITION (par dies), snubber separate
  const at = (x) => (((x % 1) + 1) % 1 * T).toExponential(5);
  const leg = (X, hi, lo, pw) => `
VGH${X} gh${X} 0 PULSE(0 1 ${at(hi)} 20n 20n ${pw.toExponential(5)} ${T.toExponential(5)})
VGL${X} gl${X} 0 PULSE(0 1 ${at(lo)} 20n 20n ${pw.toExponential(5)} ${T.toExponential(5)})
VHS${X} bus bh${X} DC 0
BSH${X} bh${X} leg${X} I=v(bh${X},leg${X})*(2e-5+v(gh${X})*${t.gOn})
BSL${X} leg${X} 0 I=v(leg${X})*(2e-5+v(gl${X})*${t.gOn})
DBH${X} leg${X} bh${X} DBODY
DBL${X} 0 leg${X} DBODY
CSH${X} bh${X} leg${X} ${(csDie * t.par).toExponential(5)}
CSL${X} leg${X} 0 ${(csDie * t.par).toExponential(5)}`;
  const src = shortAt === null ? `DC ${VBANK}` : `PWL(0 ${VBANK} ${shortAt.toExponential(5)} ${VBANK} ${(shortAt + 1e-6).toExponential(5)} 0.5)`;
  return `* E67 full-bridge LLC ${fingerprint(t.sku)} VBUS=${VBUS} VBANK=${VBANK} fsw=${f(fsw / 1e3, 3)}k ${duty === null ? "PFM" : `PS d=${f(duty, 4)}`} tdeadA=${f(tdeadA * 1e9, 0)}n tdeadB=${f(tdeadB * 1e9, 0)}n${shortAt === null ? "" : " INTERNAL-SHORT"}
* E81 Coss model: body-diode junction Cjo=${(cjo * 1e9).toFixed(3)}n Vj=${COSS_VJ} M=${COSS_M} per position (Qoss(800 V)=${(t.dieP.qoss800 * t.par * 1e9).toFixed(0)} nC) + linear snubber ${(csDie * t.par * 1e12).toFixed(0)} pF drain-source on BOTH devices
.model DREC D(Is=1e-9 N=1.8 Rs=0.022)
.model DBODY D(Is=1e-12 N=4 Rs=0.03 Cjo=${cjo.toExponential(5)} Vj=${COSS_VJ} M=${COSS_M})
VBUS bus 0 DC ${VBUS}
${leg("A", 0, 0.5, pwOf(tdeadA))}
${leg("B", d, d + 0.5, pwOf(tdeadB))}
VSP legA tk DC 0
CR tk tkb ${Cr.toExponential(5)} ic=0
LR tkb pri ${Lr.toExponential(5)}
RW pri prib 0.004
LM prib legB ${Lm.toExponential(5)}
LS1 s1w s1n ${Ls.toExponential(5)}
RW1 s1w s1p 0.002
VSA s1p s1q DC 0
LS2 s2w s2n ${Ls.toExponential(5)}
RW2 s2w s2p 0.002
VSB s2p s2q DC 0
KA LM LS1 0.9999
KB LM LS2 0.9999
KC LS1 LS2 0.9999
RB1 s1q 0ba 1meg
RB2 s1n 0ba 1meg
RB3 s2q 0bb 1meg
RB4 s2n 0bb 1meg
DA1 s1q bkA DREC
DA2 0ba s1q DREC
DA3 s1n bkA DREC
DA4 0ba s1n DREC
DB1 s2q bkB DREC
DB2 0bb s2q DREC
DB3 s2n bkB DREC
DB4 0bb s2n DREC
VBKA bkA 0ba ${src}
VBKB bkB 0bb ${src}
RTA 0ba 0 1u
RTB 0bb 0 1u
.tran 30n ${tstop.toExponential(5)} ${tstart.toExponential(5)} 15n uic
.option method=gear reltol=1e-3 abstol=1e-6 vntol=1u itl4=100
.control
set filetype=ascii
run
let vcr = v(tk)-v(tkb)
wrdata NAME.out i(VSP) i(VSA) i(VSB) vcr v(legA) v(legB) v(ghA) v(glA) v(ghB) v(glB) i(VBKA) i(VBKB) i(VHSA)
quit
.endc
.end`;
}
export const COLS = ["ip", "isa", "isb", "vcr", "legA", "legB", "ghA", "glA", "ghB", "glB", "ibka", "ibkb", "ihs"];

export function sim(name, t, cfg) {
  const T = 1 / cfg.fsw;
  const tstop = cfg.tstop ?? Math.max(400e-6, 60 * T);
  const tstart = cfg.tstart ?? tstop - CYC * T;
  const r = runDeck(name, deck(t, { ...cfg, tstop, tstart }).replace("NAME.out", `${name}.out`), COLS);
  const c = r.cols, n = r.t.length, span = r.t[n - 1] - r.t[0];
  const avg = (a) => { let s = 0; for (let i = 1; i < n; i++) s += 0.5 * (a[i] + a[i - 1]) * (r.t[i] - r.t[i - 1]); return s / span; };
  const rms = (a) => { let s = 0; for (let i = 1; i < n; i++) s += 0.5 * (a[i] ** 2 + a[i - 1] ** 2) * (r.t[i] - r.t[i - 1]); return Math.sqrt(s / span); };
  const pk = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const im = c.ip.map((v, i) => v - (c.isa[i] + c.isb[i]) / t.n);
  let zvs = 0, edges = 0, toff = 0, iComm = Infinity;
  const bad = [], legZ = { A: [0, 0], B: [0, 0] }, iCommLeg = { A: Infinity, B: Infinity }, vRes = { A: 0, B: 0 };   // E81: worst residual at an incoming edge, per leg
  // E81 (F-G-9): the window is ZVS_WIN = 20 V from the rail (was 50), and the leg voltage is read at the LAST sample BEFORE the
  // gate starts to rise. Reading it at the g>0.5 crossing (the pre-E81 check) sampled the node after the channel — already at
  // gOn/2 — had snapped it to the rail, so every corner scored ZVS whatever the dead time.
  const edge = (g, L, high, tag) => {
    for (let i = 1; i < n; i++) if (g[i] > 0.5 && g[i - 1] <= 0.5) {
      let j = i - 1; while (j > 0 && g[j] > 0.02) j--;
      edges++;
      const okz = high ? L[j] >= cfg.VBUS - ZVS_WIN : L[j] <= ZVS_WIN;
      vRes[tag[0]] = Math.max(vRes[tag[0]], Math.min(cfg.VBUS, Math.max(0, high ? cfg.VBUS - L[j] : L[j])));   // E81: what the incoming die switches against
      legZ[tag[0]][1]++; if (okz) { zvs++; legZ[tag[0]][0]++; } else if (!bad.includes(tag)) bad.push(tag);
    }
  };
  edge(c.ghA, c.legA, true, "AH"); edge(c.glA, c.legA, false, "AL"); edge(c.ghB, c.legB, true, "BH"); edge(c.glB, c.legB, false, "BL");
  // commutation current: |i_tank| at each of the four turn-OFF instants — the lagging leg in PSM commutates far below fetToff
  const fall = (g, L) => { for (let i = 1; i < n; i++) if (g[i] < 0.5 && g[i - 1] >= 0.5) { const v = Math.abs(c.ip[i - 1]); iComm = Math.min(iComm, v); iCommLeg[L] = Math.min(iCommLeg[L], v); } };
  fall(c.ghA, "A"); fall(c.glA, "A"); fall(c.ghB, "B"); fall(c.glB, "B");
  for (let i = 1; i < n; i++) if (c.ghA[i] < 0.5 && c.ghA[i - 1] >= 0.5) toff = Math.max(toff, Math.abs(c.ihs[i - 1]));
  // dead time the leg NEEDS: the outgoing device's charge plus the incoming device's, at the worst commutation current
  const qNode = 2 * t.par * (qossDie(cfg.VBUS, t.dieP.qoss800) + (t.cs ?? 0) * cfg.VBUS);
  const tNeed = iComm > 0.05 ? qNode / iComm : Infinity;
  const need = (L) => (iCommLeg[L] > 0.05 ? qNode / iCommLeg[L] : Infinity);   // the E81 law, per leg
  return {
    r, P: cfg.VBANK * (avg(c.ibka) + avg(c.ibkb)), iComm, tNeed, zvsBad: bad.join("|"), tDead: cfg.tdead ?? TDEAD,
    iCommA: iCommLeg.A, iCommB: iCommLeg.B, tNeedA: need("A"), tNeedB: need("B"),
    zvsA: `${legZ.A[0]}/${legZ.A[1]}`, zvsB: `${legZ.B[0]}/${legZ.B[1]}`, vResA: vRes.A, vResB: vRes.B,
    tDeadA: cfg.tdeadA ?? cfg.tdead ?? TDEAD, tDeadB: cfg.tdeadB ?? cfg.tdead ?? TDEAD,
    ipRms: rms(c.ip), ipPk: pk(c.ip), imPk: pk(im), vcrAc: (Math.max(...c.vcr) - Math.min(...c.vcr)) / 2, vcrAbs: pk(c.vcr),
    isRms: rms(c.isa), isPk: pk(c.isa), idAvg: c.isa.reduce((s, v, i) => i ? s + 0.25 * (Math.abs(v) + Math.abs(c.isa[i - 1])) * (r.t[i] - r.t[i - 1]) : s, 0) / span,
    fetRms: rms(c.ihs), fetToff: toff, zvs: `${zvs}/${edges}`, zvsOk: edges > 0 && zvs === edges,
    // physicality guard (E60): a leg outside the rails by more than a diode drop invalidates the run instead of passing silently
    legOk: [c.legA, c.legB].every((a) => Math.min(...a) >= -30 && Math.max(...a) <= cfg.VBUS + 30),
  };
}

// solve fsw (PFM) or phase shift (PS) so the simulated bank power meets the target (±1.5 %)
// E81 (F-G-9 / F-C-7): the shipped modulator programs an ADAPTIVE dead time,
//   t_dead = n_die,leg · (Qoss(V) + cs·V) / I_toff,  n_die,leg = 2·par,  clamped to [60 ns, 900 ns]   (firmware/hal/llc.c)
// so a corner that loses ZVS at the deck's fixed 120 ns is re-simulated at the dead time the law would program, and THAT is
// the committed row. `ZVS@120ns` keeps the fixed-dead-time answer on record — it is what the pre-E81 deck silently assumed.
export const DT_MIN = 60e-9, DT_MAX = 900e-9;   // HRTIMER clamp at DTGCKDIV 2 (E81, lead)
export function solve(tag, t, { VBANK, P, ps = false, tol, VBUS = busFor(VBANK) }) {
  const name = `llc-${t.sku}-${tag}`;
  // E81 per-leg (lead, after the G deck): a single dead time for both legs loses the WEAK leg (leg A in phase shift commutates on
  // I_m alone; leg B, the shifted leg, near the tank peak) — each leg is re-solved at 1.25 × ITS OWN need, the schedule the firmware
  // programs (llc.c dead_a_s / dead_b_s). `tdead` may be a number (both legs) or { a, b }.
  const legs = (tdead) => (typeof tdead === "number" || tdead == null) ? { tdead, tdeadA: tdead, tdeadB: tdead } : { tdead: Math.max(tdead.a, tdead.b), tdeadA: tdead.a, tdeadB: tdead.b };
  const at = (x, tdead) => sim(name, t, { VBUS, VBANK, fsw: x * t.fr, tol, ...legs(tdead) });
  // one full power solve at a GIVEN dead time (the dead time removes duty, so the solve must be redone at it, not just re-run)
  const solveAt = (tdead) => {
    const psAtFmax = () => {
      const atd = (d) => sim(name, t, { VBUS, VBANK, fsw: FMAX * t.fr, duty: d, tol, ...legs(tdead) });
      let lo = 0.02, hi = 0.5;
      for (let i = 0; i < 15; i++) { const mid = (lo + hi) / 2; (atd(mid).P < P) ? (lo = mid) : (hi = mid); }
      const d = (lo + hi) / 2;
      return { ...atd(d), VBUS, fsw: FMAX * t.fr, duty: d, mode: "PS" };
    };
    if (ps) return psAtFmax();
    let fn = FMAX, s = at(fn, tdead);
    // E67: gain still too high at f_max → the hybrid controller phase-shifts at f_max (a regulated point; the E60 "BURST" label
    // reported the unregulated f_max currents, 5–15 % above the target power)
    if (s.P >= P) return psAtFmax();
    let prev = fn;
    while (s.P < P && fn > 0.5) { prev = fn; fn = Math.round((fn - 0.05) * 100) / 100; s = at(fn, tdead); }
    if (s.P < P) return { ...s, VBUS, fsw: fn * t.fr, duty: null, mode: "NO-CAPABILITY" };
    let lo = fn, hi = prev;                           // P(lo) ≥ target > P(hi)
    for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; (at(mid, tdead).P >= P) ? (lo = mid) : (hi = mid); }
    return { ...at(lo, tdead), VBUS, fsw: lo * t.fr, duty: null, mode: "PFM" };
  };
  const s0 = solveAt(TDEAD);
  if (!s0.zvsBad || !Number.isFinite(s0.tNeed)) return { ...s0, zvs120: s0.zvs, zvsBad120: s0.zvsBad };
  // ZVS lost at the fixed 120 ns: re-SOLVE at the dead time the adaptive law programs for this corner. It is NOT escalated
  // beyond that — a corner whose leading leg runs out of magnetizing current does not recover with a longer dead time (the
  // charging current decays and reverses before the node reaches the rail), it recovers with less cs or less Lm. Widening
  // the dead time past the law's value only eats duty; the committed row is what the law would actually program.
  const clampDt = (x) => Math.min(Math.max(x, DT_MIN), DT_MAX);
  const td = { a: clampDt((Number.isFinite(s0.tNeedA) ? s0.tNeedA : s0.tNeed) * 1.25), b: clampDt((Number.isFinite(s0.tNeedB) ? s0.tNeedB : s0.tNeed) * 1.25) };
  const s1 = solveAt(td);
  return { ...s1, tNeed: s0.tNeed, zvs120: s0.zvs, zvsBad120: s0.zvsBad };
}

// E67: Lr ±5 % = external D2 gapped to ±3 % plus the D3 leakage spread (±30 % of ~0.5 µH) — no trim bins
export const TOL = { hi: { lr: 1.05, cr: 1.05, lm: 0.93 }, lo: { lr: 0.95, cr: 0.95, lm: 1.07 }, gainWorst: { lr: 1.05, cr: 0.95, lm: 1.07 } };
// E81 (F-G-9): the last three columns are APPENDED — current-coordination reads x[3] and x[8] positionally
const HDR = ["corner", "bank_V", "bus_V", "mode", "fsw_kHz", "duty", "P_target_W", "P_sim_W", "P_err_pct", "Ip_rms_A", "Ip_pk_A", "crest", "Im_pk_A", "Vcr_ac_pk_V", "Vcr_abs_pk_V", "Isec_rms_A", "Isec_pk_A", "Idiode_avg_A", "Ifet_rms_A", "Ifet_toff_A", "ZVS", "legs_in_rails", "Icomm_min_A", "t_dead_need_ns", "t_dead_used_ns", "ZVS_at_120ns", "ZVS_fail_legs", "Vres_A_V", "Vres_B_V"];   // E81: residual leg voltage at the incoming edge (0 = full ZVS)
if (fileURLToPath(import.meta.url) === process.argv[1]) {
const skus = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TANKS);
for (const sku of skus) {
  const t = { ...TANKS[sku], sku };
  const RES = join(RESROOT, sku);
  mkdirSync(join(RES, "plots"), { recursive: true });
  const I = t.Imax;
  const CORNERS = [
    ["SER250-full", { VBANK: 250, P: t.P }, "HIGH-mode floor (Vout 500 V, banks series) at full power — the current-critical corner"],
    ["SER250-full-tolHi", { VBANK: 250, P: t.P, tol: TOL.hi }, "Lr+5 % Cr+5 % Lm−7 %"],
    ["SER250-full-tolLo", { VBANK: 250, P: t.P, tol: TOL.lo }, "Lr−5 % Cr−5 % Lm+7 %"],
    ["SER250-full-bus764", { VBANK: 250, P: t.P, VBUS: 764, ps: true }, "E60 high-line bus floor (1.08·√2·500 VAC): M 0.65 → PS"],
    ["PAR500-full", { VBANK: 500, P: t.P }, "gain-critical mode edge: LOW 500 V ≡ HIGH 1000 V (same bank V and power), bus 830, M 1.205"],
    ["PAR500-full-gainWorst", { VBANK: 500, P: t.P, tol: TOL.gainWorst }, "lowest peak gain: Lr+5 % Cr−5 % Lm+7 %"],
    ["SER750-full", { VBANK: 375, P: t.P }, "HIGH mode interior, bus 789"],
    ["PAR400-full", { VBANK: 400, P: t.P }, "nominal: 400 VAC, bus 830 — the loss-budget current basis"],
    ["PAR300-full", { VBANK: 300, P: Math.min(t.P, 300 * I) }, "constant-power floor"],
    ["PAR250-Imax", { VBANK: 250, P: 250 * I }, "Imax-bound PFM (M 0.77)"],
    ["PAR200-Imax", { VBANK: 200, P: 200 * I, ps: true }, "Imax-bound, phase shift at f_max"],
    ["PS150-Imax", { VBANK: 150, P: 150 * I, ps: true }, "Imax-bound, phase shift at f_max, Vout floor"],
  ];
  const rows = [HDR];
  let worst = null;
  console.log(`\n=== ${sku}: ${fingerprint(sku)} fr=${f(t.fr / 1e3, 1)} kHz ===`);
  for (const [tag, cfg, note] of CORNERS) {
    const s = solve(tag, t, cfg);
    const err = 100 * (s.P - cfg.P) / cfg.P;
    rows.push([tag, cfg.VBANK, f(s.VBUS, 0), s.mode, f(s.fsw / 1e3, 1), s.duty === null ? "" : f(s.duty, 4), f(cfg.P, 0), f(s.P, 0), f(err, 1), f(s.ipRms, 1), f(s.ipPk, 1), f(s.ipPk / s.ipRms, 3), f(s.imPk, 1), f(s.vcrAc, 0), f(s.vcrAbs, 0), f(s.isRms, 1), f(s.isPk, 1), f(s.idAvg, 1), f(s.fetRms, 1), f(s.fetToff, 1), s.zvs, s.legOk ? "YES" : "NO", f(s.iComm, 1), f(s.tNeed * 1e9, 0), f(s.tDead * 1e9, 0), s.zvs120 ?? s.zvs, s.zvsBad || "-", f(s.vResA ?? 0, 0), f(s.vResB ?? 0, 0)]);
    console.log(`${tag.padEnd(24)} ${s.mode.padEnd(6)} fsw ${f(s.fsw / 1e3, 1)} kHz${s.duty === null ? "" : ` d=${f(s.duty, 3)}`} P ${f(s.P / 1e3, 2)}/${f(cfg.P / 1e3, 2)} kW  Ip ${f(s.ipRms, 1)} A rms / ${f(s.ipPk, 1)} A pk  Im ${f(s.imPk, 1)}  Vcr ${f(s.vcrAc, 0)} V  toff ${f(s.fetToff, 1)} A  ZVS ${s.zvs}${s.zvsBad ? ` FAIL:${s.zvsBad}` : ""}  i_comm ${f(s.iComm, 1)} A → t_dead ${f(s.tNeed * 1e9, 0)} ns (used ${f(s.tDead * 1e9, 0)}; at 120 ns ZVS ${s.zvs120 ?? s.zvs})  (${note})`);
    if (!worst || s.ipPk > worst.s.ipPk) worst = { tag, s, cfg };
  }
  // internal-short race (secondary/rectifier failure): bank collapses in 1 µs from the worst corner
  const wT = 1 / worst.s.fsw, tShort = 300e-6;
  const sc = runDeck(`llc-${sku}-internal-short`, deck(t, { VBUS: worst.s.VBUS, VBANK: worst.cfg.VBANK, fsw: worst.s.fsw, duty: worst.s.duty, shortAt: tShort, tstop: tShort + 40e-6, tstart: tShort - 4 * wT }).replace("NAME.out", `llc-${sku}-internal-short.out`), COLS);
  const scAt = (dt) => { let m = 0; for (let i = 0; i < sc.t.length; i++) if (sc.t[i] <= tShort + dt) m = Math.max(m, Math.abs(sc.cols.ip[i])); return m; };
  const race = { pre: scAt(0), at2us: scAt(2e-6), at3us: scAt(3e-6), at5us: scAt(5e-6), at10us: scAt(10e-6), at40us: scAt(40e-6) };
  console.log(`internal short from ${worst.tag}: |Ip| pre ${f(race.pre, 1)} → +2 µs ${f(race.at2us, 1)} · +3 µs ${f(race.at3us, 1)} · +5 µs ${f(race.at5us, 1)} · +10 µs ${f(race.at10us, 1)} · +40 µs ${f(race.at40us, 1)} A (no trip modeled)`);
  // dead-short at fmax: what PFM alone would push into a 0 V bank (why start-up/short must be PS/burst-limited)
  const fm = sim(`llc-${sku}-short-fmax`, t, { VBUS: 650, VBANK: 0.5, fsw: FMAX * t.fr });
  console.log(`dead short at 1.45·fr, bus 650: Ip ${f(fm.ipRms, 1)} A rms / ${f(fm.ipPk, 1)} A pk`);
  const w = worst.s.r, sel = w.t.map((x, i) => i).filter((i) => w.t[i] >= w.t.at(-1) - 3 * wT);
  plotSVG({
    title: `${sku} full-bridge LLC worst tank-peak corner ${worst.tag} (ngspice, power-solved)`, xlabel: "t (s)", ylabel: "v(A) − v(B) (V)", y2label: "currents (A)",
    path: join(RES, "plots", "llc-worst-corner.svg"),
    series: [
      { label: "v(legA)−v(legB)", x: sel.map((i) => w.t[i]), y: sel.map((i) => w.cols.legA[i] - w.cols.legB[i]) },
      { label: "i(tank)", x: sel.map((i) => w.t[i]), y: sel.map((i) => w.cols.ip[i]), axis: 1, color: "#3A6B8C" },
      { label: "i(sec A)", x: sel.map((i) => w.t[i]), y: sel.map((i) => w.cols.isa[i]), axis: 1, color: "#2EA44F" },
    ],
  });
  writeFileSync(join(RES, "llc-stress.csv"),
    `# E67 ngspice-46 power-solved full-bridge LLC stress; ${fingerprint(sku)}; netlists spice/generated/llc-${sku}-*.cir\n` +
    `# E81 device model: non-linear Coss (body-diode junction Cjo/(1+V/${COSS_VJ})^${COSS_M} fitted to Qoss(800 V)=${Math.round(t.dieP.qoss800 * 1e9)} nC per die, ×${t.par} dies, on BOTH devices of a leg) + ${Math.round((t.cs ?? 0) * 1e12)} pF linear snubber per die; ZVS window ${ZVS_WIN} V; deck dead time ${TDEAD * 1e9} ns\n` +
    rows.map((x) => x.join(",")).join("\n") + "\n" +
    `# internal-short race from ${worst.tag}: pre ${f(race.pre, 1)} A, +2us ${f(race.at2us, 1)}, +3us ${f(race.at3us, 1)}, +5us ${f(race.at5us, 1)}, +10us ${f(race.at10us, 1)}, +40us ${f(race.at40us, 1)} A\n` +
    `# dead-short at 1.45 fr (bus 650, bank 0.5 V): Ip ${f(fm.ipRms, 1)} A rms / ${f(fm.ipPk, 1)} A pk\n`);
  const col = (h) => rows.slice(1).map((x) => +x[HDR.indexOf(h)]), mx = (h, d = 1) => f(Math.max(...col(h)), d);
  const summary = {
    fingerprint: fingerprint(sku), worstCorner: worst.tag,
    ipPkMax: mx("Ip_pk_A"), ipRmsMax: mx("Ip_rms_A"), imPkMax: mx("Im_pk_A"), vcrAcMax: mx("Vcr_ac_pk_V", 0),
    isRmsMax: mx("Isec_rms_A"), isPkMax: mx("Isec_pk_A"), idAvgMax: mx("Idiode_avg_A"), fetRmsMax: mx("Ifet_rms_A"), fetToffMax: mx("Ifet_toff_A"),
    zvsAll: rows.slice(1).every((x) => { const [a, b] = String(x[HDR.indexOf("ZVS")]).split("/"); return a === b && +b > 0; }),
    // E81 (F-G-9): the worst dead time any corner needs, and where ZVS is lost at the 120 ns the deck programs
    tDeadNeedMaxNs: mx("t_dead_need_ns", 0), iCommMin: Math.min(...col("Icomm_min_A")),
    zvsFailCorners: rows.slice(1).filter((x) => x[HDR.indexOf("ZVS_fail_legs")] !== "-").map((x) => `${x[0]}:${x[HDR.indexOf("ZVS_fail_legs")]}`),
    cossModel: `nonlinear Cjo/(1+V/${COSS_VJ})^${COSS_M} fitted to Qoss(800 V)=${Math.round(TANKS[sku].dieP.qoss800 * 1e9)} nC/die + ${Math.round((TANKS[sku].cs ?? 0) * 1e12)} pF snubber/die, both devices; ZVS window ${ZVS_WIN} V`,
    legsInRails: rows.slice(1).every((x) => x[HDR.indexOf("legs_in_rails")] === "YES"),
    capability: rows.slice(1).every((x) => x[3] !== "NO-CAPABILITY" && Math.abs(+x[8]) <= 2),
    race, shortFmax: { rms: f(fm.ipRms, 1), pk: f(fm.ipPk, 1) },
  };
  writeFileSync(join(RES, "llc-stress-summary.json"), JSON.stringify(summary, null, 2) + "\n");
}
console.log(`\n→ simulation-results/<sku>/llc-stress.csv · llc-stress-summary.json · plots/llc-worst-corner.svg`);
}
