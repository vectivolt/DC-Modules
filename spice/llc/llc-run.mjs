// llc-run.mjs — Phase 7 (§13/§36): 3-phase LLC switching validation in ngspice.
// Method: bank held by ideal V-source (operating-point technique) — sweep fsw at fixed (bus, bank),
// record delivered power, primary RMS, ZVS state at every gate edge; compare against Phase-6 FHA.
// Full 3-leg, 3-tank, star-primary, dual-secondary bridges into bank A/B (tied per mode).
// Devices: gate-modulated conductances (35 mΩ hot SIC1200_23R pair path), softened bridge diodes —
// device-edge fidelity was closed at L1 DPT; this level validates tank/gain/ZVS/currents (§9).
// Run: node spice/llc/llc-run.mjs

import { runDeck, trapz, maxIn } from "../run.mjs";
import { plotSVG } from "../../calculations/plot.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const RES = join(HERE, "..", "..", "simulation-results", "30kw");
mkdirSync(join(RES, "plots"), { recursive: true });
const f = (x, d = 2) => Number.isFinite(x) ? Number(x.toFixed(d)) : "NaN";

const FR = 140e3, LR = 7.0e-6, CR = 185.4e-9, LM = 63e-6;

function llcDeck({ VBUS, VBANK, fsw, duty = 0.483, series = false, tstop = 400e-6 }) {
  const T = 1 / fsw, ton = duty * T;
  const leg = (X, shift) => `
VGH${X} gh${X} 0 PULSE(0 1 ${(shift * T).toExponential(4)} 20n 20n ${ton.toExponential(4)} ${T.toExponential(4)})
VGL${X} gl${X} 0 PULSE(0 1 ${((shift + 0.5) * T).toExponential(4)} 20n 20n ${ton.toExponential(4)} ${T.toExponential(4)})
BSH${X} bus leg${X} I=v(bus,leg${X})*(2e-5+v(gh${X})*28.57)
BSL${X} leg${X} 0 I=v(leg${X})*(2e-5+v(gl${X})*28.57)
CPAR${X} leg${X} 0 250p
VSP${X} leg${X} tk${X} DC 0
CR${X} tk${X} tk${X}b ${CR} ic=${VBUS / 2}
LR${X} tk${X}b pri${X} ${LR}
RW${X} pri${X} pri${X}b 0.005
LM${X} pri${X}b star ${LM}
LS1${X} s1${X}w s1${X}n ${LM}
RW1${X} s1${X}w s1${X}p 0.005
LS2${X} s2${X}w s2${X}n ${LM}
RW2${X} s2${X}w s2${X}p 0.005
KA${X} LM${X} LS1${X} 0.9999
KB${X} LM${X} LS2${X} 0.9999
KC${X} LS1${X} LS2${X} 0.9999
RB1${X} s1${X}p 0ba 1meg
RB2${X} s1${X}n 0ba 1meg
RB3${X} s2${X}p 0bb 1meg
RB4${X} s2${X}n 0bb 1meg
DA1${X} s1${X}p bkA DREC
DA2${X} 0ba s1${X}p DREC
DA3${X} s1${X}n bkA DREC
DA4${X} 0ba s1${X}n DREC
DB1${X} s2${X}p bkB DREC
DB2${X} 0bb s2${X}p DREC
DB3${X} s2${X}n bkB DREC
DB4${X} 0bb s2${X}n DREC`;
  // banks as ideal sources (op-point method): series vs parallel are electrically identical here;
  // the S/P difference is exercised in the relay-transition sim (sp-transition.mjs).
  const bankBlock = `VBKA bkA 0ba DC ${VBANK}
VBKB bkB 0bb DC ${VBANK}
RTA 0ba 0 1u
RTB 0bb 0 1u`;
  return `* 3-phase LLC op-point VBUS=${VBUS} VBANK=${VBANK} fsw=${(fsw / 1e3).toFixed(1)}k ${series ? "SER" : "PAR"}
.model DREC D(Is=1e-9 N=1.8 Rs=0.022)
VBUS bus 0 DC ${VBUS}
${leg("1", 0)}
${leg("2", 1 / 3)}
${leg("3", 2 / 3)}
${bankBlock}
RSTAR star 0 100meg
.tran 30n ${tstop} 0 15n uic
.option method=gear reltol=1e-3 abstol=1e-6 vntol=1u itl4=100
.control
set filetype=ascii
run
wrdata NAME.out i(VSP1) i(VBKA) i(VBKB) v(leg1) v(gh1) i(VSP2)
quit
.endc
.end`;
}

// FHA: solve fn that delivers target per-phase power at (bus, bank) — forward direction.
const gain = (fn, Q, Ln) => 1 / Math.hypot(1 + (1 / Ln) * (1 - 1 / (fn * fn)), Q * (fn - 1 / fn));
function fhaFn(VBUS, VBANK, Pph) {
  const M = VBANK / (VBUS / 2);
  const Rac = (8 / Math.PI ** 2) * VBANK * VBANK / Pph;
  const Qop = Math.sqrt(LR / CR) / Rac;
  let lo = 0.5, hi = 1.45;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; (gain(mid, Qop, 9) > M) ? (lo = mid) : (hi = mid); }
  return (lo + hi) / 2;
}

const rows = [["case","VBUS","VBANK","mode","fsw_kHz","P_sim_W","P_fha_W","err_pct","Ip_rms_A","ZVS","Ppair_est_W"]];
async function op(tag, cfg) {
  const d = llcDeck(cfg).replace("NAME.out", `llc-${tag}.out`);
  const r = runDeck(`llc-${tag}`, d, ["ip1", "ibkA", "ibkB", "vleg1", "vgh1", "ip2"]);
  const t1 = cfg.tstop ?? 400e-6, t0 = t1 * 0.5;
  // delivered power: banks are V-sources; current INTO + terminal is negative i() by convention
  const pw = (arr) => cfg.VBANK * trapz(r.t, arr, t0, t1) / (t1 - t0);
  const P = pw(r.cols.ibkA) + pw(r.cols.ibkB);
  let sum = 0, n = 0;
  for (let i = 0; i < r.t.length; i++) if (r.t[i] >= t0) { sum += r.cols.ip1[i] ** 2; n++; }
  const ipRms = Math.sqrt(sum / n);
  // ZVS: v(leg1) at each rising edge of gh1 should be ≈ VBUS (high-side turning on ⇒ node already flown high)
  let zvsOK = true, edges = 0;
  for (let i = 1; i < r.t.length; i++)
    if (r.t[i] >= t0 && r.cols.vgh1[i] > 0.5 && r.cols.vgh1[i - 1] <= 0.5) {
      edges++;
      if (r.cols.vleg1[i] < cfg.VBUS - 60) zvsOK = false;
    }
  const Pfha = cfg.Ptarget ?? NaN;
  const err = Pfha > 0 ? (100 * (P - Pfha)) / Pfha : NaN;
  const Ppair = ipRms * ipRms * 0.035 + 0; // conduction est (hot pair path), switching ≈ 0 if ZVS
  rows.push([tag, cfg.VBUS, cfg.VBANK, cfg.series ? "SER" : "PAR", f(cfg.fsw / 1e3, 1), f(P, 0), f(Pfha, 0), f(err, 1), f(ipRms, 1), zvsOK ? "YES" : "NO", f(Ppair, 1)]);
  console.log(`${tag.padEnd(16)} P=${f(P / 1e3, 2)} kW (FHA ${f(Pfha / 1e3, 2)} kW, ${f(err, 1)}%)  Ip=${f(ipRms, 1)} A  ZVS=${zvsOK ? "YES" : "NO"} (${edges} edges)`);
  return r;
}

console.log("=== 3-phase LLC operating-point runs: fn solved from FHA for target P, sim must deliver it ===");
function mk(tag, VBUS, VBANK, Ptot) {
  const fn = fhaFn(VBUS, VBANK, Ptot / 3);
  return { tag, cfg: { VBUS, VBANK, fsw: fn * FR, Ptarget: Ptot } };
}
const cases = [
  mk("par400-full", 830, 400, 31.25e3),
  mk("par400-half", 830, 400, 15.6e3),
  mk("par500-full", 830, 500, 30.6e3),
  mk("par300-full", 632 > 650 ? 650 : 650, 300, 30.6e3),
  mk("par260-full", 650, 260, 26.5e3),
  mk("ser250-full", 650, 250, 31.25e3),
  mk("ser400-full", 830, 400, 31.25e3),
];
let rNom = null;
for (const c of cases) { const r = await op(c.tag, c.cfg); if (c.tag === "par400-full") rNom = r; }
await op("ps-150", { VBUS: 650, VBANK: 150, fsw: 140e3, duty: 0.28, Ptarget: 15.6e3 });

// waveform plot
const t0 = 300e-6;
const sel = rNom.t.map((t, i) => ({ t, i })).filter(p => p.t >= t0 && p.t <= t0 + 3 / 140e3);
plotSVG({
  title: "LLC nominal @fr: leg1 voltage + primary current (ngspice)", xlabel: "t (s)", ylabel: "V(leg1) V", y2label: "Ip (A)",
  path: join(RES, "plots", "llc-nom-waveforms.svg"),
  series: [
    { label: "v(leg1)", x: sel.map(p => p.t), y: sel.map(p => rNom.cols.vleg1[p.i]) },
    { label: "i(pri1)", x: sel.map(p => p.t), y: sel.map(p => rNom.cols.ip1[p.i]), axis: 1, color: "#3A6B8C" },
  ],
});
writeFileSync(join(RES, "llc-oppoints.csv"),
  "# ngspice-46 gear 30n/15n reltol=1e-3; bank-source method; netlists spice/generated/llc-*.cir; FHA cmp from calculations/llc/llc-design.mjs\n" +
  rows.map(r => r.join(",")).join("\n") + "\n");
console.log("→ simulation-results/30kw/llc-oppoints.csv, plots/llc-nom-waveforms.svg");
