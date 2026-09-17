// aux-flyback.mjs — §28/§18 aux supply validation (V-21) on D4 rev E: the DRAWN circuit, not a behavioral stand-in.
// Flyback from the FULL unboosted bus (DCP→DCN): runs 321 V (brown-out) … 860 V (OVP corner); every component value is
// read from calculations/magnetics/d4-flyback.mjs, which parses cells.tsx — the deck cannot drift from the schematic.
//
// Why it is built this way: a deck that regulates V24 directly, uses a 200 Ω / 1 nF CS filter (drawn: 1 k / 470 pF),
// 1.38 µH of leakage (k 0.998, against a 12 µH acceptance) and a linear-gate "cycle-by-cycle clamp" runs the switch as
// a ~3 A linear regulator with ~700 V across it. Its energy does not balance (η 61 % at 850 V, 104 % at 342 V) and a
// 20 ns step draws 493 W in, while V24 still reads 24.00 V and every row passes.
// This deck models the NCP1252D functions that matter (clock set, 160 ns LEB, CS ≥ min(1 V, FB/3, SS/4) reset latch,
// DCmax, skip, fault timer → latch-off), the drawn VCC/zener/NPN loop, the RCD clamp, the rail TVS and RAUX24,
// with leakage at the acceptance maximum. Every run must close its own energy balance, stay physical, and one case is
// re-run at half the timestep. Corners: 4 SKU loads × 340/560/860 V, FB-open at 860 V (limit + clamp + fault latch),
// V24/V15 hard shorts at 860 V (ratchet + latch). Cold start (40 ms soft-start) is bench T-29, not simulated.
// Run: node spice/aux/aux-flyback.mjs
import { runDeckAsync } from "../run.mjs";
import { plotSVG } from "../../calculations/plot.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { D4, NCP, SKUS, VBUS_MAX, Bsat, drawn, fingerprint } from "../../calculations/magnetics/d4-flyback.mjs";
import { CORES } from "../../calculations/magnetics/geometry.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const RES = join(HERE, "..", "..", "simulation-results", "30kw");
mkdirSync(join(RES, "plots"), { recursive: true });
const f = (x, d = 2) => Number(x.toFixed(d));
const w = drawn(), FSW = 65e3, T = 1 / FSW, T_STEP = 12e-3;

// kind: matrix (hold → step load at 12 ms) · fbopen (single fault: QAUXFB lifted at 12 ms → the 1 V limit every cycle)
//       short24 / short24bare (V24 shorted behind RAUX24 / at CAUX24) · short15
function deck({ VIN, sku, kind = "matrix", lk = 1, step = 20e-9 }) {
  const L = SKUS[sku], Lp = D4.Lp * lk, Lm = Lp - D4.llkAcc, tStop = kind === "matrix" ? 20e-3 : kind === "fbopen" ? 30e-3 : 40e-3;
  const n24 = D4.Np / D4.N24, n15 = D4.Np / D4.N15, nax = D4.Np / D4.Naux, r15 = 15 / L.i15;
  const i24 = kind === "matrix" ? `(${L.i24h}+${f(L.i24s - L.i24h, 3)}*u(time-${T_STEP}))` : `${L.i24h}`;
  const shortNode = { short24: "v24", short24bare: "v24c", short15: "v15" }[kind];
  const win = kind === "matrix" ? [4e-3, tStop] : [T_STEP, tStop];
  return { tStop, deck: `* D4 rev E aux flyback — drawn circuit (${kind}) VIN=${VIN} ${sku} Lp×${lk} · ${fingerprint(D4, w)}
VIN vin 0 DC ${VIN}
* transformer: primary leakage at the acceptance maximum; the layout allowance sits in the rectifier loops (×n²)
LLK vin p1 ${D4.llkAcc}
RLLK vin p1 20k
RPRI p1 p2 0.45
LM p2 sw ${Lm}
LS24 0 a24 ${Lm / n24 ** 2}
LS15 0 a15 ${Lm / n15 ** 2}
LSAX 0 aax ${Lm / nax ** 2}
K1 LM LS24 0.99999
K2 LM LS15 0.99999
K3 LM LSAX 0.99999
K4 LS24 LS15 0.99999
K5 LS24 LSAX 0.99999
K6 LS15 LSAX 0.99999
RS24 a24 b24 0.015
LL24 b24 c24 ${D4.llkLayout / n24 ** 2}
RLL24 b24 c24 20
RS15 a15 b15 0.012
LL15 b15 c15 ${D4.llkLayout / n15 ** 2}
RLL15 b15 c15 20
RSAX aax bax 0.05
VD24 c24 d24 0
D24 d24 v24c DUF
VD15 c15 d15 0
D15 d15 v15 DUF
VDVC bax dvc 0
DVC dvc vcc DUF2
.model DUF D(Is=1e-9 N=1.7 Rs=0.03 BV=1000 IBV=1m Cjo=30p TT=20n)
.model DUF2 D(Is=1e-9 N=1.7 Rs=0.08 BV=400 IBV=1m Cjo=15p TT=20n)
C24 v24c 0 220u ic=23.5
RAUX24 v24c v24 ${w.r24 || 1e-6}
CV24 v24 0 10n ic=23.5
C15 v15 0 220u ic=15.3
CVCC vcc 0 220u ic=15.4
IVCC vcc 0 ${NCP.icc3}
BL24 v24 0 I=max(v(v24),0)/24*${i24}
RL15 v15 0 ${r15}
* rail TVS as drawn: SMBJ28A on V24 (V_BR 31.1 V min at 1 mA), SMBJ18A on V15 (V_BR 20.0 V min at 1 mA)
DTVS24 0 v24 DTV24
DTVS15 0 v15 DTV15
.model DTV24 D(Is=1e-12 N=1 BV=31.1 IBV=1m Rs=0.3)
.model DTV15 D(Is=1e-12 N=1 BV=20.0 IBV=1m Rs=0.2)
${shortNode ? `SSH ${shortNode} 0 shc 0 SWSH\nVSHC shc 0 PULSE(0 1 ${T_STEP} 1u 1u 1 2)` : ""}
.model SWSH SW(Ron=10m Roff=1e9 Vt=0.5 Vh=0.1)
* QAUX: VSW = drain current, VS1 = channel current (the node capacitance discharges through the channel)
VSW sw d 0
VS1 d s1 0
S1 s1 csn gdrv 0 SWSIC
.model SWSIC SW(Ron=1.4 Roff=1e9 Vt=1.5 Vh=0.05)
CSW d csn 60p
DBODY csn d DBD
.model DBD D(Is=1e-12 N=1.5 Rs=0.2 BV=2000)
RCS csn 0 ${w.rcs}
* current sense as drawn: RCSF / CCSF + the NCP1252 internal ${NCP.vramp[1]} V ramp through ${NCP.rramp / 1e3} k
RCSF csn cs ${w.rcsf}
CCSF cs 0 ${w.ccsf}
BRAMP rmp 0 V=${NCP.vramp[1]}*(time*${FSW}-floor(time*${FSW}))
RRAMP rmp cs ${NCP.rramp}
* RCD clamp as drawn (DCLA breakdown at its voltage class: an avalanche shows, it does not hide)
VDC sw dca 0
DCLA dca cl DSIC
.model DSIC D(Is=1e-14 N=1.4 Rs=0.5 BV=${w.dclaV} IBV=1u Cjo=20p)
CCLA cl vin ${w.ccla}
RCLA cl vin ${w.rcla}
* drawn feedback loop: VCC → RZFB 2.2k → DZAUX 15 V → QAUXFB base (RBEFB 10k) → FB; CFBF 1 nF; FB pull-up 3.5k / 40k internal
RZFB vcc zk 2.2k
DZ qb zk DZ15
.model DZ15 D(Is=1e-12 N=1 BV=15 IBV=1m Rs=5)
RBE qb 0 10k
${kind === "fbopen" ? `Q1 fbq qb 0 QN\nSFBO fbq fb fbo 0 SWSH\nVFBO fbo 0 PULSE(1 0 ${T_STEP} 1u 1u 1 2)` : "Q1 fb qb 0 QN"}
.model QN NPN(Bf=200 Is=1e-14 Vaf=100 Cjc=5p Cje=5p)
CFB fb 0 1n
VFBI fbi 0 6.525
RPU fbi fb 3.5k
RZI fb 0 40k
* soft start completed (SS/4 above the 1 V limit; the cold start itself is bench T-29)
CSS ss 0 100n ic=4
ISS 0 ss 10u
DSS ss ssc DSW
VSSC ssc 0 4.0
.model DSW D(Is=1e-14 N=1)
* NCP1252 PWM latch: clock set · LEB · reset on CS ≥ min(1 V, FB/3, SS/4), DCmax, skip (FB < 0.3 V), fault-off
VONE one 0 1
VCLK clk 0 PULSE(0 1 0 1n 1n 30n ${T})
VLEB leb 0 PULSE(0 1 0 1n 1n ${NCP.tLEB} ${T})
VDMX dmx 0 PULSE(0 1 ${0.456 * T} 1n 1n 30n ${T})
BRC rcr 0 V=((v(cs) > min(${NCP.vilim[1]}, min(v(fb)/3, v(ss)/4))) && (v(leb) < 0.5)) || (v(dmx) > 0.5) || (v(fb) < 0.3) || (v(off) > 0.5) ? 1 : 0
RRC rcr rc 1k
CRC rc 0 1p
SSET one q clk 0 SWL
SHLD one qh q 0 SWL
RHLD qh q 2k
SRST q 0 rc 0 SWR
.model SWL SW(Ron=100 Roff=1e9 Vt=0.5 Vh=0.1)
.model SWR SW(Ron=20 Roff=1e9 Vt=0.5 Vh=0.1)
.model SWF SW(Ron=1 Roff=1e9 Vt=0.5 Vh=0.1)
CQ q 0 10p
* DRV: fast turn-on (10 Ω), tILIM typ ${NCP.tILIM[0] * 1e9} ns turn-off delay (100 Ω · 1 nF from 3 V to the 1.5 V threshold)
BGD gd0 0 V=v(q) > 0.5 ? 3 : 0
DGON gd0 gon DSW
RGON gon gdrv 10
RGOF gd0 gdrv 100
CG gdrv 0 1n
* fault timer: CS > FCS after LEB → flag held 3 periods → Tfault ${NCP.tFault[0] * 1e3} ms (min) → permanent off (latched)
BFC fc 0 V=((v(cs) > ${NCP.fcs[1]}) && (v(leb) < 0.5)) ? 1 : 0
SFL one flag fc 0 SWF
RFLG flag 0 ${Math.round((3 * T) / 1e-9)}
CFLG flag 0 1n
BTIM 0 tim I=(v(flag) > 0.3) ? 1e-9/${NCP.tFault[0]} : -1e-9*v(tim)/20e-6
CTIM tim 0 1n ic=0
SOFF one off tim 0 SWT
.model SWT SW(Ron=100 Roff=1e9 Vt=1.0 Vh=0.05)
SOFH one offh off 0 SWL
ROFH offh off 1k
COFF off 0 10p
ROFL off 0 1e8
.tran 1u ${tStop} 0 ${step} uic
.option method=gear reltol=1e-3 abstol=1e-7 vntol=1e-5 itl4=200
.save v(vin) v(sw) v(d) v(s1) v(csn) v(cl) v(v24) v(v24c) v(v15) v(vcc) v(off) v(p1) v(p2) v(a24) v(b24) v(a15) v(b15) v(aax) v(bax) v(d24) v(d15) v(dvc) v(dca) i(VIN) i(VS1) i(VD24) i(VD15) i(VDVC) i(VDC) i(LM) i(LLK)
.control
set filetype=ascii
run
* energy balance on the simulator's own time points: source = channel + sense R + clamp + windings + rectifiers + rail inputs
let pin = -i(VIN)*v(vin)
let psw = (v(s1)-v(csn))*i(VS1)
let pcl = (v(dca)-v(cl))*i(VDC) + (v(cl)-v(vin))*(v(cl)-v(vin))/${w.rcla}
let pout = v(v24c)*i(VD24) + v(v15)*i(VD15) + v(vcc)*i(VDVC)
let psum = psw + v(csn)*v(csn)/${w.rcs} + pcl + (v(p1)-v(p2))*(v(p1)-v(p2))/0.45 + (v(a24)-v(b24))*(v(a24)-v(b24))/0.015 + (v(a15)-v(b15))*(v(a15)-v(b15))/0.012 + (v(aax)-v(bax))*(v(aax)-v(bax))/0.05 + (v(d24)-v(v24c))*i(VD24) + (v(d15)-v(v15))*i(VD15) + (v(dvc)-v(vcc))*i(VDVC) + pout
let vr = v(cl)-v(sw)
let vc = v(cl)-v(vin)
meas tran PIN avg pin from=16m to=20m
meas tran PSUM avg psum from=16m to=20m
meas tran POUT avg pout from=16m to=20m
meas tran PSW avg psw from=16m to=20m
meas tran PCL avg pcl from=16m to=20m
meas tran V24S avg v(v24) from=9m to=12m
meas tran V24DIP min v(v24) from=12m to=14m
meas tran V24MAX max v(v24) from=9m to=${tStop}
meas tran V15MIN min v(v15) from=12m to=16m
meas tran VDSMAX max v(sw) from=${win[0]} to=${win[1]}
meas tran VRMAX max vr from=${win[0]} to=${win[1]}
meas tran VCMAX max vc from=${win[0]} to=${win[1]}
meas tran ILMMAX max i(LM) from=${win[0]} to=${win[1]}
meas tran ILKMAX max i(LLK) from=${win[0]} to=${win[1]}
meas tran OFFEND max v(off) from=${tStop - 1e-3} to=${tStop}
linearize v(v24) v(v15)
wrdata NAME.out v(v24) v(v15)
quit
.endc
.end` };
}

// ---- the case list, run 4 at a time (each run holds ~1 GB of time points) ----
const CASES = [];
for (const sku of Object.keys(SKUS)) for (const VIN of [340, 560, VBUS_MAX]) CASES.push({ tag: `aux-${sku}-${VIN}`, VIN, sku, kind: "matrix" });
CASES.push({ tag: "tstep-50kwa-860", VIN: VBUS_MAX, sku: "50kwa", kind: "matrix", step: 10e-9, ref: `aux-50kwa-${VBUS_MAX}` });
CASES.push({ tag: "clamp-fbopen-860", VIN: VBUS_MAX, sku: "50kwa", kind: "fbopen", lk: 1 - D4.tolL });
CASES.push({ tag: "short-v24-860", VIN: VBUS_MAX, sku: "50kwa", kind: "short24", lk: 1 - D4.tolL });
CASES.push({ tag: "short-v24bare-860", VIN: VBUS_MAX, sku: "50kwa", kind: "short24bare", lk: 1 - D4.tolL });
CASES.push({ tag: "short-v15-860", VIN: VBUS_MAX, sku: "50kwa", kind: "short15", lk: 1 - D4.tolL });
const res = {};
const queue = [...CASES];
await Promise.all(Array.from({ length: 4 }, async () => {
  for (let c; (c = queue.shift()); ) {
    const { deck: text } = deck(c);
    const t0 = Date.now();
    res[c.tag] = await runDeckAsync(c.tag, text.replace("NAME.out", `${c.tag}.out`), ["v24", "v15"]);
    console.log(`  ran ${c.tag} (${f((Date.now() - t0) / 1e3, 0)} s)`);
  }
}));

// ---- verdicts: each row must close its energy balance and stay physical before its electrical criteria count ----
const Ae = CORES[D4.core].Ae, bs = Bsat(130);
const rows = [["case", "VIN", "sku", "Lp_uH", "v24_settle", "v24_dip", "v24_max", "v15_min", "Pin_W", "Pout_W", "eta", "closure_pct", "Psw_W", "Pclamp_W", "vds_max_V", "vr_max_V", "vc_max_V", "ilm_max_A", "B_mT", "latched", "verdict", "note"]];
let allPass = true;
for (const c of CASES) {
  const m = res[c.tag].meas, Lp = D4.Lp * (c.lk ?? 1), B = ((Lp - D4.llkAcc) * m.ilmmax) / (D4.Np * Ae);
  const closure = Math.abs(m.pin - m.psum) / m.pin, eta = m.pout / m.pin, latched = m.offend > 0.5;
  const volts = m.vdsmax <= 0.8 * w.qauxV && m.vrmax <= 0.8 * w.dclaV;
  let ok, note = "";
  if (c.kind === "matrix") {
    ok = closure <= 0.05 && eta >= 0.8 && eta <= 0.96 && m.psw <= 0.05 * m.pin && volts && !latched &&
      m.v24s >= 22.5 && m.v24max <= 26.4 && m.v24dip > 21 && m.v15min > 12.5;
    note = `energy closes to ${f(100 * closure, 1)} %`;
    if (c.ref) {                                                     // timestep convergence: the same case at half the step
      const r = res[c.ref].meas, dV = Math.abs(m.v24s - r.v24s), dVds = Math.abs(m.vdsmax / r.vdsmax - 1), dP = Math.abs(m.pin / r.pin - 1);
      ok = ok && dV <= 0.05 && dVds <= 0.02 && dP <= 0.02;
      note = `vs ${c.ref} at 20 ns: dV24 ${f(dV, 3)} V · dVds ${f(100 * dVds, 2)} % · dPin ${f(100 * dP, 2)} %`;
    }
  } else if (c.kind === "fbopen") {
    ok = latched && volts; note = "single fault: limit every cycle then the fault latch";
  } else {
    // the NCP1252D fault timer (10–20 ms) latches after the deck window; what the deck must prove is that the ratchet it
    // reaches before then stays inside the core and switch classes
    ok = B <= 0.85 * bs && m.ilkmax <= 0.8 * D4.idmQaux;
    note = c.kind === "short24bare" ? "residual (no RAUX24 in the loop) — informational" : `ratchet bounded before the fault latch (B ${f(B * 1e3, 0)} mT ≤ ${f(850 * bs, 0)} · ${f(m.ilkmax, 2)} A ≤ ${0.8 * D4.idmQaux} A)`;
    if (c.kind === "short24bare") ok = latched;
  }
  const verdict = c.kind === "short24bare" ? (ok ? "INFO" : "CHECK") : ok ? "PASS" : "CHECK";
  if (verdict === "CHECK") allPass = false;
  rows.push([c.tag, c.VIN, c.sku, f(Lp * 1e6, 1), f(m.v24s), f(m.v24dip), f(m.v24max), f(m.v15min), f(m.pin, 1), f(m.pout, 1), f(eta, 3), f(100 * closure, 2), f(m.psw, 2), f(m.pcl, 2),
    f(m.vdsmax, 0), f(m.vrmax, 0), f(m.vcmax, 0), f(m.ilmmax, 2), f(B * 1e3, 0), latched ? "yes" : "no", verdict, note]);
  console.log(`${c.tag}: V24 ${f(m.v24s)} (dip ${f(m.v24dip)}) · V15min ${f(m.v15min)} · Pin ${f(m.pin, 1)} W η ${f(eta, 3)} closure ${f(100 * closure, 1)} % · Vds ${f(m.vdsmax, 0)} V · Vr ${f(m.vrmax, 0)} V · iLM ${f(m.ilmmax, 2)} A (${f(B * 1e3, 0)} mT) · latched ${latched} → ${verdict}`);
}
const nom = res[`aux-50kwa-560`];
plotSVG({ title: "Aux flyback (D4 rev E drawn circuit), 560 V bus, 50 kW-air load: regulation + full step @12 ms", xlabel: "t (s)", ylabel: "V",
  path: join(RES, "plots", "aux-flyback.svg"),
  series: [
    { label: "V24", x: nom.t, y: nom.cols.v24 },
    { label: "V15", x: nom.t, y: nom.cols.v15, color: "#3A6B8C" },
  ] });
writeFileSync(join(RES, "aux-flyback.csv"),
  `# ngspice-46 drawn-circuit deck (D4 rev E); ${fingerprint(D4, w)}; NCP1252D functions modelled (LEB/latch/FB/3/fault timer), leakage at acceptance max, typ controller timing (tolerance stacks live in d4-flyback); netlists spice/generated/{aux,tstep,clamp,short}-*.cir\n` +
  rows.map((r) => r.join(",")).join("\n") + "\n");
console.log(`→ simulation-results/30kw/aux-flyback.csv, plots/aux-flyback.svg ${allPass ? "(ALL PASS)" : "(CHECK FAILURES!)"}`);
process.exit(allPass ? 0 : 1);
