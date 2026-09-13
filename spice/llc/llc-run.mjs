// llc-run.mjs — E60 rev: per-SKU, POWER-SOLVED 3-phase LLC switching validation (ngspice-46).
// Why the rev: the pre-E60 runner set fsw from FHA and accepted whatever power came out — its own
// CSV shows −77…+71 % power error, so every "sim current" it reported was measured at the wrong
// power (the 42.3 A "series-entry ✓" ran at 27.8 kW, not 31.25 kW), and it only ever ran the
// 30 kW tank. Now: each corner's fsw (PFM) or duty (PS surrogate) is SOLVED against the simulated
// bank power, per SKU tank (calculations/llc/tanks.mjs), and the deck reports what the protection
// and magnetics need — instantaneous tank peak, RMS per section, magnetizing peak, Cr AC voltage,
// secondary/diode currents, FET turn-off current, ZVS on all three legs — plus tolerance corners,
// section mismatch, and an internal-short transient for the F.11 timing race.
// Method limits (unchanged, documented): banks are ideal V-sources (op-point), FETs are gate-
// modulated conductances + lumped Coss, JBS are behavioral diodes; device-edge fidelity is the
// DPT level's job. Run: node spice/llc/llc-run.mjs [sku ...]   (~15–25 min for all four SKUs)
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
const busFor = (bank) => Math.min(830, Math.max(650, (2 * bank) / 0.95));

export function deck(t, { VBUS, VBANK, fsw, duty = null, tol = [{}, {}, {}], shortAt = null, tstop, tstart }) {
  const T = 1 / fsw;
  const pw = duty === null ? T / 2 - TDEAD - 20e-9 : duty * T;
  const leg = (X) => {
    const k = tol[X - 1], sh = (X - 1) / 3;
    const Cr = t.Cr * (k.cr ?? 1), Lr = t.Lr * (k.lr ?? 1), Lm = t.Lm * (k.lm ?? 1);
    return `
VGH${X} gh${X} 0 PULSE(0 1 ${(sh * T).toExponential(5)} 20n 20n ${pw.toExponential(5)} ${T.toExponential(5)})
VGL${X} gl${X} 0 PULSE(0 1 ${((sh + 0.5) * T).toExponential(5)} 20n 20n ${pw.toExponential(5)} ${T.toExponential(5)})
VHS${X} bus bh${X} DC 0
BSH${X} bh${X} leg${X} I=v(bh${X},leg${X})*(2e-5+v(gh${X})*${t.gOn})
BSL${X} leg${X} 0 I=v(leg${X})*(2e-5+v(gl${X})*${t.gOn})
DBH${X} leg${X} bh${X} DBODY
DBL${X} 0 leg${X} DBODY
CPAR${X} leg${X} 0 ${t.coss}
VSP${X} leg${X} tk${X} DC 0
CR${X} tk${X} tk${X}b ${Cr.toExponential(5)} ic=0
LR${X} tk${X}b pri${X} ${Lr.toExponential(5)}
RW${X} pri${X} pri${X}b 0.005
LM${X} pri${X}b star ${Lm.toExponential(5)}
LS1${X} s1${X}w s1${X}n ${Lm.toExponential(5)}
RW1${X} s1${X}w s1${X}p 0.005
VSA${X} s1${X}p s1${X}q DC 0
LS2${X} s2${X}w s2${X}n ${Lm.toExponential(5)}
RW2${X} s2${X}w s2${X}p 0.005
VSB${X} s2${X}p s2${X}q DC 0
KA${X} LM${X} LS1${X} 0.9999
KB${X} LM${X} LS2${X} 0.9999
KC${X} LS1${X} LS2${X} 0.9999
RB1${X} s1${X}q 0ba 1meg
RB2${X} s1${X}n 0ba 1meg
RB3${X} s2${X}q 0bb 1meg
RB4${X} s2${X}n 0bb 1meg
DA1${X} s1${X}q bkA DREC
DA2${X} 0ba s1${X}q DREC
DA3${X} s1${X}n bkA DREC
DA4${X} 0ba s1${X}n DREC
DB1${X} s2${X}q bkB DREC
DB2${X} 0bb s2${X}q DREC
DB3${X} s2${X}n bkB DREC
DB4${X} 0bb s2${X}n DREC`;
  };
  const src = shortAt === null ? `DC ${VBANK}` : `PWL(0 ${VBANK} ${shortAt.toExponential(5)} ${VBANK} ${(shortAt + 1e-6).toExponential(5)} 0.5)`;
  return `* E60 3-phase LLC ${fingerprint(t.sku)} VBUS=${VBUS} VBANK=${VBANK} fsw=${f(fsw / 1e3, 3)}k ${duty === null ? "PFM" : `PS duty=${f(duty, 4)}`}${shortAt === null ? "" : " INTERNAL-SHORT"}
.model DREC D(Is=1e-9 N=1.8 Rs=0.022)
.model DBODY D(Is=1e-12 N=4 Rs=0.03)
VBUS bus 0 DC ${VBUS}
${leg(1)}
${leg(2)}
${leg(3)}
VBKA bkA 0ba ${src}
VBKB bkB 0bb ${src}
RTA 0ba 0 1u
RTB 0bb 0 1u
* primary star held at mid-bus by the drawn 2×47 k per side star/balance chain (HR-20) — Cr carries no DC
RSTP star bus 94k
RSTN star 0 94k
.tran 30n ${tstop.toExponential(5)} ${tstart.toExponential(5)} 15n uic
.option method=gear reltol=1e-3 abstol=1e-6 vntol=1u itl4=100
.control
set filetype=ascii
run
let vcr1 = v(tk1)-v(tk1b)
let vcr2 = v(tk2)-v(tk2b)
let vcr3 = v(tk3)-v(tk3b)
wrdata NAME.out i(VSP1) i(VSP2) i(VSP3) i(VSA1) i(VSB1) vcr1 vcr2 vcr3 v(leg1) v(leg2) v(leg3) v(gh1) v(gh2) v(gh3) v(gl1) i(VBKA) i(VBKB) i(VHS1)
quit
.endc
.end`;
}
const COLS = ["ip1", "ip2", "ip3", "isa", "isb", "vcr1", "vcr2", "vcr3", "leg1", "leg2", "leg3", "gh1", "gh2", "gh3", "gl1", "ibka", "ibkb", "ihs"];

export function sim(name, t, cfg) {
  const T = 1 / cfg.fsw;
  const tstop = cfg.tstop ?? Math.max(400e-6, 60 * T);
  const tstart = cfg.tstart ?? tstop - CYC * T;
  const r = runDeck(name, deck(t, { ...cfg, tstop, tstart }).replace("NAME.out", `${name}.out`), COLS);
  const c = r.cols, n = r.t.length, span = r.t[n - 1] - r.t[0];
  const avg = (a) => { let s = 0; for (let i = 1; i < n; i++) s += 0.5 * (a[i] + a[i - 1]) * (r.t[i] - r.t[i - 1]); return s / span; };
  const rms = (a) => { let s = 0; for (let i = 1; i < n; i++) s += 0.5 * (a[i] ** 2 + a[i - 1] ** 2) * (r.t[i] - r.t[i - 1]); return Math.sqrt(s / span); };
  const pk = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  const ac = (a) => (Math.max(...a) - Math.min(...a)) / 2;
  const im = c.ip1.map((v, i) => v - c.isa[i] - c.isb[i]);
  let zvs = 0, edges = 0, toff = 0;
  for (let i = 1; i < n; i++) {
    for (const X of [1, 2, 3]) {
      const g = c[`gh${X}`], L = c[`leg${X}`];
      if (g[i] > 0.5 && g[i - 1] <= 0.5) { edges++; if (L[i] >= cfg.VBUS - 50) zvs++; }
    }
    if (c.gl1[i] > 0.5 && c.gl1[i - 1] <= 0.5) { edges++; if (c.leg1[i] <= 50) zvs++; }
    if (c.gh1[i] < 0.5 && c.gh1[i - 1] >= 0.5) toff = Math.max(toff, Math.abs(c.ihs[i - 1]));
  }
  const secR = [rms(c.ip1), rms(c.ip2), rms(c.ip3)];
  const mean = (secR[0] + secR[1] + secR[2]) / 3;
  return {
    r, P: cfg.VBANK * (avg(c.ibka) + avg(c.ibkb)),
    ipRms: Math.max(...secR), ipPk: Math.max(pk(c.ip1), pk(c.ip2), pk(c.ip3)), share: 100 * (Math.max(...secR) / mean - 1),
    imPk: pk(im), vcrAc: Math.max(ac(c.vcr1), ac(c.vcr2), ac(c.vcr3)), vcrAbs: Math.max(pk(c.vcr1), pk(c.vcr2), pk(c.vcr3)),
    isRms: rms(c.isa), isPk: pk(c.isa), idAvg: c.isa.reduce((s, v, i) => i ? s + 0.25 * (Math.abs(v) + Math.abs(c.isa[i - 1])) * (r.t[i] - r.t[i - 1]) : s, 0) / span,
    fetRms: rms(c.ihs), fetToff: toff, zvs: `${zvs}/${edges}`, zvsOk: edges > 0 && zvs === edges,
    // physicality guard (E60): the pre-E60 deck had NO body diodes — legs swung to ±6 kV on a 650 V
    // bus and every ZVS/power/current number it produced was non-physical. A leg outside the rails
    // by more than a diode drop now invalidates the run instead of passing silently.
    legOk: [c.leg1, c.leg2, c.leg3].every((a) => Math.min(...a) >= -30 && Math.max(...a) <= cfg.VBUS + 30),
  };
}

// solve fsw (PFM) or duty (PS) so the simulated bank power meets the target (±1.5 %)
export function solve(tag, t, { VBANK, P, ps = false, tol, VBUS = busFor(VBANK) }) {
  const name = `llc-${t.sku}-${tag}`;
  const at = (x) => sim(name, t, ps ? { VBUS, VBANK, fsw: t.fr, duty: x, tol } : { VBUS, VBANK, fsw: x * t.fr, tol });
  if (ps) {
    let lo = 0.02, hi = 0.5 - (TDEAD + 20e-9) * t.fr, last;
    for (let i = 0; i < 15; i++) { const mid = (lo + hi) / 2; last = at(mid); (last.P < P) ? (lo = mid) : (hi = mid); }
    const d = (lo + hi) / 2, s = at(d);
    return { ...s, VBUS, fsw: t.fr, duty: d, mode: "PS" };
  }
  let fn = 1.45, s = at(fn);
  if (s.P >= P) return { ...s, VBUS, fsw: fn * t.fr, duty: null, mode: "BURST" };
  let prev = fn;
  while (s.P < P && fn > 0.5) { prev = fn; fn = Math.round((fn - 0.05) * 100) / 100; s = at(fn); }
  if (s.P < P) return { ...s, VBUS, fsw: fn * t.fr, duty: null, mode: "NO-CAPABILITY" };
  let lo = fn, hi = prev;                           // P(lo) ≥ target > P(hi)
  for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; (at(mid).P >= P) ? (lo = mid) : (hi = mid); }
  s = at(lo);
  return { ...s, VBUS, fsw: lo * t.fr, duty: null, mode: "PFM" };
}

const HDR = ["corner", "bank_V", "bus_V", "mode", "fsw_kHz", "duty", "P_target_W", "P_sim_W", "P_err_pct", "Ip_rms_A", "Ip_pk_A", "crest", "Im_pk_A", "Vcr_ac_pk_V", "Vcr_abs_pk_V", "Isec_rms_A", "Isec_pk_A", "Idiode_avg_A", "Ifet_rms_A", "Ifet_toff_A", "share_pct", "ZVS", "legs_in_rails"];
if (fileURLToPath(import.meta.url) === process.argv[1]) {
const skus = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TANKS);
const summary = {};
for (const sku of skus) {
  const t = { ...TANKS[sku], sku };
  const RES = join(RESROOT, sku);
  mkdirSync(join(RES, "plots"), { recursive: true });
  const I = t.Imax;
  const TOL = {
    hi: [{ lr: 1.03, cr: 1.05, lm: 0.93 }, { lr: 1.03, cr: 1.05, lm: 0.93 }, { lr: 1.03, cr: 1.05, lm: 0.93 }],
    lo: [{ lr: 0.97, cr: 0.95, lm: 1.07 }, { lr: 0.97, cr: 0.95, lm: 1.07 }, { lr: 0.97, cr: 0.95, lm: 1.07 }],
    gainWorst: [{ lr: 1.03, cr: 0.95, lm: 1.07 }, { lr: 1.03, cr: 0.95, lm: 1.07 }, { lr: 1.03, cr: 0.95, lm: 1.07 }],
    mismatch: [{ lr: 0.97, cr: 0.95 }, { lr: 1.03, cr: 1.05 }, { lr: 1.03, cr: 1.05 }],
  };
  const CORNERS = [
    ["SER250-full", { VBANK: 250, P: t.P }, "SER hysteresis floor, Vout 500 V — twice the PAR tank current at the same Vout"],
    ["SER250-full-tolHi", { VBANK: 250, P: t.P, tol: TOL.hi }, "Lr+3 % Cr+5 % Lm−7 %"],
    ["SER250-full-tolLo", { VBANK: 250, P: t.P, tol: TOL.lo }, "Lr−3 % Cr−5 % Lm+7 %"],
    ["SER250-full-mismatch", { VBANK: 250, P: t.P, tol: TOL.mismatch }, "section 1 fast (−3/−5 %), sections 2–3 slow (+3/+5 %)"],
    ["SER250-full-bus764", { VBANK: 250, P: t.P, VBUS: 764, ps: true }, "E60 high-line bus floor (1.08·√2·500 VAC): M 0.65 → PS"],
    ["PAR525-full", { VBANK: 525, P: t.P }, "gain-critical: bus 830, M 1.265"],
    ["PAR525-full-gainWorst", { VBANK: 525, P: t.P, tol: TOL.gainWorst }, "lowest peak gain: Lr+3 % Cr−5 % Lm+7 %"],
    ["SER1000-full", { VBANK: 500, P: t.P }, "bus 830, M 1.205"],
    ["SER750-full", { VBANK: 375, P: t.P }, "near resonance, bus 789"],
    ["PAR400-full", { VBANK: 400, P: t.P }, "nominal: 400 VAC, bus 830 — the loss-budget current basis"],
    ["PAR300-full", { VBANK: 300, P: Math.min(t.P, 300 * I) }, "constant-power floor"],
    ["PAR250-Imax", { VBANK: 250, P: 250 * I }, "Imax-bound PFM (M 0.77)"],
    ["PAR200-Imax", { VBANK: 200, P: 200 * I, ps: true }, "Imax-bound, PS surrogate"],
    ["PS150-Imax", { VBANK: 150, P: 150 * I, ps: true }, "Imax-bound, PS surrogate, Vout floor"],
  ];
  const rows = [HDR];
  let worst = null;
  console.log(`\n=== ${sku}: ${fingerprint(sku)} fr=${f(t.fr / 1e3, 1)} kHz ===`);
  for (const [tag, cfg, note] of CORNERS) {
    const s = solve(tag, t, cfg);
    const err = 100 * (s.P - cfg.P) / cfg.P;
    rows.push([tag, cfg.VBANK, f(s.VBUS, 0), s.mode, f(s.fsw / 1e3, 1), s.duty === null ? "" : f(s.duty, 4), f(cfg.P, 0), f(s.P, 0), f(err, 1), f(s.ipRms, 1), f(s.ipPk, 1), f(s.ipPk / s.ipRms, 3), f(s.imPk, 1), f(s.vcrAc, 0), f(s.vcrAbs, 0), f(s.isRms, 1), f(s.isPk, 1), f(s.idAvg, 1), f(s.fetRms, 1), f(s.fetToff, 1), f(s.share, 2), s.zvs, s.legOk ? "YES" : "NO"]);
    console.log(`${tag.padEnd(24)} ${s.mode.padEnd(6)} fsw ${f(s.fsw / 1e3, 1)} kHz${s.duty === null ? "" : ` d=${f(s.duty, 3)}`} P ${f(s.P / 1e3, 2)}/${f(cfg.P / 1e3, 2)} kW  Ip ${f(s.ipRms, 1)} A rms / ${f(s.ipPk, 1)} A pk  Im ${f(s.imPk, 1)}  Vcr ${f(s.vcrAc, 0)} V  toff ${f(s.fetToff, 1)} A  ZVS ${s.zvs}  (${note})`);
    if (!worst || s.ipPk > worst.s.ipPk) worst = { tag, s, cfg };
  }
  // internal-short race (secondary/rectifier failure): bank collapses in 1 µs from the worst corner
  const wT = 1 / worst.s.fsw, tShort = 300e-6;
  const sc = runDeck(`llc-${sku}-internal-short`, deck(t, { VBUS: worst.s.VBUS, VBANK: worst.cfg.VBANK, fsw: worst.s.fsw, duty: worst.s.duty, shortAt: tShort, tstop: tShort + 40e-6, tstart: tShort - 4 * wT }).replace("NAME.out", `llc-${sku}-internal-short.out`), COLS);
  const scAt = (dt) => { let m = 0; for (let i = 0; i < sc.t.length; i++) if (sc.t[i] <= tShort + dt) m = Math.max(m, Math.abs(sc.cols.ip1[i]), Math.abs(sc.cols.ip2[i]), Math.abs(sc.cols.ip3[i])); return m; };
  const race = { pre: scAt(0), at2us: scAt(2e-6), at3us: scAt(3e-6), at5us: scAt(5e-6), at10us: scAt(10e-6), at40us: scAt(40e-6) };
  console.log(`internal short from ${worst.tag}: |Ip| pre ${f(race.pre, 1)} → +2 µs ${f(race.at2us, 1)} · +3 µs ${f(race.at3us, 1)} · +5 µs ${f(race.at5us, 1)} · +10 µs ${f(race.at10us, 1)} · +40 µs ${f(race.at40us, 1)} A (no trip modeled)`);
  // dead-short at fmax: what PFM alone would push into a 0 V bank (why start-up/short must be PS/burst-limited)
  const fm = sim(`llc-${sku}-short-fmax`, t, { VBUS: 650, VBANK: 0.5, fsw: 1.45 * t.fr });
  console.log(`dead short at 1.45·fr, bus 650: Ip ${f(fm.ipRms, 1)} A rms / ${f(fm.ipPk, 1)} A pk`);
  const w = worst.s.r, sel = w.t.map((x, i) => i).filter((i) => w.t[i] >= w.t.at(-1) - 3 * wT);
  plotSVG({
    title: `${sku} LLC worst tank-peak corner ${worst.tag} (ngspice, power-solved)`, xlabel: "t (s)", ylabel: "V(leg1) V", y2label: "tank currents (A)",
    path: join(RES, "plots", "llc-worst-corner.svg"),
    series: [
      { label: "v(leg1)", x: sel.map((i) => w.t[i]), y: sel.map((i) => w.cols.leg1[i]) },
      { label: "i(tank1)", x: sel.map((i) => w.t[i]), y: sel.map((i) => w.cols.ip1[i]), axis: 1, color: "#3A6B8C" },
      { label: "i(tank2)", x: sel.map((i) => w.t[i]), y: sel.map((i) => w.cols.ip2[i]), axis: 1, color: "#B4642A" },
      { label: "i(sec1)", x: sel.map((i) => w.t[i]), y: sel.map((i) => w.cols.isa[i]), axis: 1, color: "#2EA44F" },
    ],
  });
  writeFileSync(join(RES, "llc-stress.csv"),
    `# E60 ngspice-46 power-solved LLC stress; ${fingerprint(sku)}; netlists spice/generated/llc-${sku}-*.cir\n` +
    rows.map((x) => x.join(",")).join("\n") + "\n" +
    `# internal-short race from ${worst.tag}: pre ${f(race.pre, 1)} A, +2us ${f(race.at2us, 1)}, +3us ${f(race.at3us, 1)}, +5us ${f(race.at5us, 1)}, +10us ${f(race.at10us, 1)}, +40us ${f(race.at40us, 1)} A\n` +
    `# dead-short at 1.45 fr (bus 650, bank 0.5 V): Ip ${f(fm.ipRms, 1)} A rms / ${f(fm.ipPk, 1)} A pk\n`);
  summary[sku] = {
    fingerprint: fingerprint(sku), worstCorner: worst.tag,
    ipPkMax: f(Math.max(...rows.slice(1).map((x) => +x[10])), 1), ipRmsMax: f(Math.max(...rows.slice(1).map((x) => +x[9])), 1),
    imPkMax: f(Math.max(...rows.slice(1).map((x) => +x[12])), 1), vcrAcMax: f(Math.max(...rows.slice(1).map((x) => +x[13])), 0),
    isRmsMax: f(Math.max(...rows.slice(1).map((x) => +x[15])), 1), isPkMax: f(Math.max(...rows.slice(1).map((x) => +x[16])), 1),
    idAvgMax: f(Math.max(...rows.slice(1).map((x) => +x[17])), 1), fetRmsMax: f(Math.max(...rows.slice(1).map((x) => +x[18])), 1),
    fetToffMax: f(Math.max(...rows.slice(1).map((x) => +x[19])), 1), shareMax: f(Math.max(...rows.slice(1).map((x) => +x[20])), 2),
    zvsAll: rows.slice(1).every((x) => { const [a, b] = String(x[21]).split("/"); return a === b && +b > 0; }),
    legsInRails: rows.slice(1).every((x) => x[22] === "YES"),
    capability: rows.slice(1).every((x) => x[3] !== "NO-CAPABILITY" && Math.abs(+x[8]) <= 2),
    race, shortFmax: { rms: f(fm.ipRms, 1), pk: f(fm.ipPk, 1) },
  };
  writeFileSync(join(RES, "llc-stress-summary.json"), JSON.stringify(summary[sku], null, 2) + "\n");
}
console.log(`\n→ simulation-results/<sku>/llc-stress.csv · llc-stress-summary.json · plots/llc-worst-corner.svg`);
}
