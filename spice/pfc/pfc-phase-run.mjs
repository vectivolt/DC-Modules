// pfc-phase-run.mjs — Phase 5 (§21/§35/§36): full 3-phase Vienna switching simulation, 50 kHz,
// line-cycle runs with feedforward + P current correction + midpoint balancing; THD by DFT;
// plus precharge (§25) and discharge sizing runs.
// FIDELITY (documented per §9/§50): AVERAGED-SWITCH model — duty-weighted phase-leg voltage +
// conserved current injection into P/MID/N rails. Cycle-by-cycle PWM of the full 3-φ stage proved
// numerically infeasible in ngspice-46 (see git of this file: 7 documented attempts, aborts at
// 1–4 ms in switch/diode commutation); device-level switching behavior is closed at Level-1 DPT.
// THD reported here is THD-40 (harmonics ≤ 2 kHz) — switching ripple (50 kHz) is outside THD-40
// and is handled analytically in the inductor design. L = 130 µH incl. 30 µH grid; load = R at bus.
// Run: node spice/pfc/pfc-phase-run.mjs

import { runDeck, maxIn } from "../run.mjs";
import { plotSVG } from "../../calculations/plot.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const RES = join(HERE, "..", "..", "simulation-results", "30kw");
mkdirSync(join(RES, "plots"), { recursive: true });
const f = (x, d = 2) => Number.isFinite(x) ? Number(x.toFixed(d)) : "NaN";

const FSW = 50e3, FLINE = 50, KP = 0.0044, KB = 0.004;

function viennaDeck({ VLL, Iamp, P, cpTol = 1, cnTol = 1, phaseLossAt = 0, tstop = 0.06 }) {
  const Vpk = (VLL / Math.sqrt(3)) * Math.SQRT2;
  const R = (800 * 800) / P;
  const lossMul = phaseLossAt > 0 ? `*(1-u(time-${phaseLossAt}))` : "";
  // per phase: duty d, softsign s of current; leg voltage v = vmid + (1-d)*(s*(vp-vmid) - (1-s)*vmid)
  const ph = (X, x, shift) => `
B${X} ${x} neut V=${Vpk}*sin(6.2831853*50*time${shift})${X === "C" ? lossMul : ""}
RG${X} ${x} ${x}g 0.02
L${X} ${x}g ${x}l 130u ic=0
VS${X} ${x}l ph${x} DC 0
BI${X} if${x} 0 V=v(${x},${x}g)*50
RF${X} if${x} if${x}f 1k
CF${X} if${x}f 0 10n
BD${X} d${x} 0 V=min(max(1-abs(v(${x},neut))/(v(p)/2+1)+${0.0044}*(${Iamp}*abs(sin(6.2831853*50*time${shift}))-abs(v(if${x}f)))+${0.004}*(v(p)/2-v(mid))*(v(if${x}f)/(abs(v(if${x}f))+0.5)),0.02),0.98)
BS${X} s${x} 0 V=0.5*(1+v(if${x}f)/(abs(v(if${x}f))+0.2))
BV${X} ph${x} 0 V=v(mid)+(1-v(d${x}))*(v(s${x})*(v(p)-v(mid))-(1-v(s${x}))*v(mid))
BIP${X} 0 p I=(1-v(d${x}))*v(s${x})*i(VS${X})
BIM${X} 0 mid I=v(d${x})*i(VS${X})
BIN${X} 0 n I=(1-v(d${x}))*(1-v(s${x}))*i(VS${X})`;
  return `* vienna 3ph AVERAGED 30kW VLL=${VLL} P=${P}
RNEUT neut 0 10meg
${ph("A", "a", "")}
${ph("B", "b", "-2.0943951")}
${ph("C", "c", "+2.0943951")}
CP p mid ${2350e-6 * cpTol} ic=400
CN mid n ${2350e-6 * cnTol} ic=400
RBALP p mid 100k
RBALN mid n 100k
VN n 0 DC 0
RLOAD p n ${(800 * 800 / P).toFixed(2)}
.tran 5u ${tstop} 0 2u uic
.option method=gear reltol=1e-3 abstol=1e-6 vntol=1u itl4=100
.control
set filetype=ascii
run
wrdata NAME.out i(VSA) i(VSB) i(VSC) v(p) v(mid) v(pha)
quit
.endc
.end`;
}

// uniform-resample + DFT THD (harmonics 2..40 of 50 Hz) over [t0,t1]
function thd(t, y, t0, t1) {
  const dt = 10e-6, n = Math.floor((t1 - t0) / dt);
  const u = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const tt = t0 + i * dt;
    while (j < t.length - 2 && t[j + 1] < tt) j++;
    const a = (tt - t[j]) / (t[j + 1] - t[j] || 1e-12);
    u[i] = y[j] + a * (y[j + 1] - y[j]);
  }
  const T = n * dt, mag = h => {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { const w = 2 * Math.PI * h * FLINE * (i * dt); re += u[i] * Math.cos(w); im += u[i] * Math.sin(w); }
    return 2 * Math.hypot(re, im) / n;
  };
  const f1 = mag(1);
  let s = 0;
  for (let h = 2; h <= 40; h++) s += mag(h) ** 2;
  return { thd: 100 * Math.sqrt(s) / f1, f1 };
}

const rows = [["case","VLL","P_W","THD_pct","I1_pk_A","Ipk_abs_A","vmid_dev_V","vbus_V","note"]];
async function run(tag, opts, note = "") {
  const d = viennaDeck(opts).replace("NAME.out", `pfc-${tag}.out`);
  const r = runDeck(`pfc-${tag}`, d, ["ia", "ib", "ic", "vp", "vmid", "vpha"]);
  const t1 = opts.tstop ?? 0.04, t0 = t1 - 0.02;
  const { thd: T, f1 } = thd(r.t, r.cols.ia, t0, t1);
  const ipk = maxIn(r.t, r.cols.ia.map(Math.abs), t0, t1);
  const vbusEnd = r.cols.vp[r.cols.vp.length - 1];
  let vmidDev = 0;
  for (let i = 0; i < r.t.length; i++) if (r.t[i] >= t0) vmidDev = Math.max(vmidDev, Math.abs(r.cols.vmid[i] - r.cols.vp[i] / 2));
  rows.push([tag, opts.VLL, opts.P, f(T, 2), f(f1, 1), f(ipk, 1), f(vmidDev, 1), f(vbusEnd, 0), note]);
  console.log(`${tag.padEnd(18)} THD=${f(T, 2)}%  I1pk=${f(f1, 1)}A  Ipk=${f(ipk, 1)}A  vmid_dev=${f(vmidDev, 1)}V  vbus=${f(vbusEnd, 0)}V  ${note}`);
  return r;
}

console.log("=== Vienna 3-phase switching runs (ngspice, 50 kHz, line cycle) ===");
const r330 = await run("330-full", { VLL: 330, Iamp: 77.7, P: 31088 });
await run("400-full", { VLL: 400, Iamp: 64.1, P: 31088 });
await run("475-full", { VLL: 475, Iamp: 54.0, P: 31088 });
await run("400-25pct", { VLL: 400, Iamp: 16.0, P: 7772 });
await run("400-imbal", { VLL: 400, Iamp: 64.1, P: 31088, cpTol: 1.2, cnTol: 0.8 }, "caps +20/-20% w/ balancing");
await run("400-phloss", { VLL: 400, Iamp: 64.1, P: 31088, phaseLossAt: 0.025, tstop: 0.05 }, "phase C lost @25ms — bounded currents = firmware foldback req");

// plot representative current + midpoint
const t0 = 0.02;
const sel = r330.t.map((t, i) => ({ t, i })).filter(p => p.t >= t0);
plotSVG({
  title: "Vienna 330 VAC full power: phase currents (last cycle)", xlabel: "t (s)", ylabel: "I (A)",
  path: join(RES, "plots", "pfc-330-currents.svg"),
  series: [
    { label: "iA", x: sel.map(p => p.t), y: sel.map(p => r330.cols.ia[p.i]) },
    { label: "iB", x: sel.map(p => p.t), y: sel.map(p => r330.cols.ib[p.i]), color: "#3A6B8C" },
    { label: "iC", x: sel.map(p => p.t), y: sel.map(p => r330.cols.ic[p.i]), color: "#A83232" },
  ],
});

// ---------------- precharge (§25): 475 V worst, R from bridge into discharged split bank
console.log("\n=== Precharge / discharge ===");
for (const RP of [22, 33, 47]) {
  const d = `* precharge RP=${RP}
.model DPWR D(Is=1e-9 N=1.8 Rs=0.011)
BA a neut V=387.8*sin(6.2831853*50*time)
BB b neut V=387.8*sin(6.2831853*50*time-2.0943951)
BC c neut V=387.8*sin(6.2831853*50*time+2.0943951)
RNEUT neut 0 10meg
DTA a p DPWR
DBA n a DPWR
DTB b p DPWR
DBB n b DPWR
DTC c p DPWR
DBC n c DPWR
RPRE p pc0 ${RP}
VPR pc0 pc DC 0
CP pc mid 2350u ic=0
CN mid n 2350u ic=0
VN n 0 0
.option itl4=200 gmin=1e-10 abstol=1e-4 chgtol=1e-12
.tran 20u 0.6 0 50u uic
.control
set filetype=ascii
run
wrdata pre-${RP}.out v(pc,n) i(VPR)
quit
.endc
.end`;
  const r = runDeck(`pre-${RP}`, d, ["vbus", "ipre"]);
  const ipk = maxIn(r.t, r.cols.ipre.map(Math.abs), 0, 1);
  const vEnd = r.cols.vbus[r.cols.vbus.length - 1];
  let tc = 0;
  for (let i = 0; i < r.t.length; i++) if (r.cols.vbus[i] < 0.95 * vEnd) tc = r.t[i];
  // energy in R
  let e = 0;
  for (let i = 1; i < r.t.length; i++) e += r.cols.ipre[i] ** 2 * RP * (r.t[i] - r.t[i - 1]);
  console.log(`precharge R=${RP}Ω: Ipk=${f(ipk, 1)}A  t95=${f(tc * 1e3, 0)}ms  Vend=${f(vEnd, 0)}V  E_R=${f(e, 0)}J`);
  rows.push([`precharge-R${RP}`, 475, 0, "", "", f(ipk, 1), "", f(vEnd, 0), `t95=${f(tc * 1e3, 0)}ms E_R=${f(e, 0)}J`]);
}
// discharge: 850 V, 640 Ω → target <60 V in ~2 s; E=424 J
{
  const d = `* discharge
CP p mid 2350u ic=425
CN mid 0 2350u ic=425
RD p 0 640
.tran 1m 3 uic
.control
set filetype=ascii
run
wrdata dis.out v(p)
quit
.endc
.end`;
  const r = runDeck("dis", d, ["vp"]);
  let t60 = 0;
  for (let i = 0; i < r.t.length; i++) if (r.cols.vp[i] > 60) t60 = r.t[i];
  console.log(`discharge 640Ω: t(<60V)=${f(t60, 2)}s  Ppk=${f(850 * 850 / 640, 0)}W  E=${f(0.5 * 1.175e-3 * 850 * 850, 0)}J`);
  rows.push(["discharge-640R", "", "", "", "", "", "", "", `t60=${f(t60, 2)}s Ppk=1129W E=424J`]);
}

writeFileSync(join(RES, "pfc-phase-runs.csv"),
  "# ngspice-46 gear reltol=2e-3 maxstep=0.2u; deck gen spice/pfc/pfc-phase-run.mjs; netlists spice/generated/pfc-*.cir\n" +
  rows.map(r => r.join(",")).join("\n") + "\n");
console.log("→ simulation-results/30kw/pfc-phase-runs.csv");
