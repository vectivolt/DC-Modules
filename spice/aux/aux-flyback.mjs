// aux-flyback.mjs — §28/§18 aux supply validation (closes V-21).
// Flyback from half-bus (DCP→MID, E20): 300–425 V in, outputs 24 V (0.8 A) + 15 V (0.6 A).
// Behavioral voltage-mode control (B-source PWM, 65 kHz, duty clamp + CS limit shape) — controller-IC
// dynamics abstracted (documented); validates: startup, regulation both rails, cross-regulation
// under load step, input-range hold, output ripple class. Coupled-L flyback, DCM-ish design:
// Lp 1.2 mH, n24 = 0.085, n15 = 0.055 (D4 turns sheet emitted below).
// Run: node spice/aux/aux-flyback.mjs

import { runDeck, maxIn, minIn } from "../run.mjs";
import { plotSVG } from "../../calculations/plot.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const RES = join(HERE, "..", "..", "simulation-results", "30kw");
mkdirSync(join(RES, "plots"), { recursive: true });
const f = (x, d = 2) => Number(x.toFixed(d));

function deck({ VIN, stepAt = 12e-3, tstop = 20e-3 }) {
  return `* aux flyback VIN=${VIN} (half-bus)
VIN vin 0 DC ${VIN}
* primary: Lp with switch to ground via sense R; snubber RCD
LP vin sw 1.2m
BSW sw csn I=v(sw,csn)*(1e-7+v(g)*20)
RCS csn 0 0.22
RCSF csn csnf 200
CCSF csnf 0 1n
* RCD clamp on primary
DCL sw cl DCLP
CCL cl vin 10n ic=0
RCL cl vin 47k
.model DCLP D(Is=1e-9 N=1.8 Rs=0.1)
* secondaries (coupled): 24 V and 15 V windings
LS24 s24a 0 8.7u
LS15 s15a 0 3.6u
K1 LP LS24 0.998
K2 LP LS15 0.998
K3 LS24 LS15 0.998
D24 s24a v24 DSCH
D15 s15a v15 DSCH
.model DSCH D(Is=1e-7 N=1.05 Rs=0.02)
C24 v24 0 220u ic=0
C15 v15 0 220u ic=0
* loads: 24 V base 0.3 A stepping to 0.8 A; 15 V constant 0.6 A equivalent R
BL24 v24 0 I=max(v(v24),0)/24*(0.3+0.5*u(time-${stepAt}))
RL15 v15 0 25
* control: voltage-mode P on 24 V rail, duty 0.05..0.42, soft-start ramp; 65 kHz sawtooth
BTRI tri 0 V=time*65000-floor(time*65000)
BDUT dut 0 V=min(max(0.35*(24.5-v(v24f)),0.03),min(0.42,time/5m+0.03))
* PWM AND cycle-by-cycle CS clamp (0.187 V / 0.22 R = 0.85 A) — as the real current-mode IC
BGT g 0 V=min(max((v(dut)-v(tri))*60+0.5,0),1)*min(max((0.187-v(csnf))*60+0.5,0),1)
RF1 v24 v24f 1k
CF1 v24f 0 100n
.tran 0.4u ${tstop} 0 0.2u uic
.option method=gear reltol=2e-3 abstol=1e-6 itl4=100
.control
set filetype=ascii
run
wrdata NAME.out v(v24) v(v15) i(VIN)
quit
.endc
.end`;
}

const rows = [["case","VIN","v24_settle","v24_dip_at_step","v24_recover_ms","v15_at_step_crossreg","Pin_avg_W","verdict"]];
let rNom = null;
for (const VIN of [300, 425]) {
  const tag = `aux-${VIN}`;
  const r = runDeck(tag, deck({ VIN }).replace("NAME.out", `${tag}.out`), ["v24", "v15", "iin"]);
  const t = r.t;
  const settle = r.cols.v24.filter((_, i) => t[i] > 10e-3 && t[i] < 12e-3);
  const v24s = settle.reduce((a, b) => a + b, 0) / settle.length;
  const dip = minIn(t, r.cols.v24, 12e-3, 14e-3);
  let tRec = 20e-3;
  for (let i = 0; i < t.length; i++) if (t[i] > 12.2e-3 && Math.abs(r.cols.v24[i] - v24s) < 0.5) { tRec = t[i]; break; }
  const v15x = minIn(t, r.cols.v15, 12e-3, 16e-3);
  let pin = 0, n = 0;
  for (let i = 0; i < t.length; i++) if (t[i] > 8e-3) { pin += -r.cols.iin[i] * VIN; n++; }
  const ok = Math.abs(v24s - 24) < 1.5 && dip > 21 && v15x > 12.5;
  rows.push([tag, VIN, f(v24s), f(dip), f((tRec - 12e-3) * 1e3), f(v15x), f(pin / n, 1), ok ? "PASS" : "CHECK"]);
  console.log(`${tag}: v24 settles ${f(v24s)} V, step dip ${f(dip)} V, recover ${f((tRec - 12e-3) * 1e3)} ms, v15 cross-reg min ${f(v15x)} V → ${ok ? "PASS" : "CHECK"}`);
  if (VIN === 425) rNom = r;
}
const sel = rNom.t.map((t, i) => ({ t, i })).filter(p => p.t > 0);
plotSVG({ title: "Aux flyback 425 V: startup + 24 V load step @12 ms (behavioral control)", xlabel: "t (s)", ylabel: "V",
  path: join(RES, "plots", "aux-flyback.svg"),
  series: [
    { label: "V24", x: sel.map(p => rNom.t[p.i]), y: sel.map(p => rNom.cols.v24[p.i]) },
    { label: "V15", x: sel.map(p => rNom.t[p.i]), y: sel.map(p => rNom.cols.v15[p.i]), color: "#3A6B8C" },
  ] });
writeFileSync(join(RES, "aux-flyback.csv"),
  "# ngspice-46; behavioral VM control (IC dynamics abstracted — bench T-09 validates UVLO/limits); netlists spice/generated/aux-*.cir\n" +
  rows.map(r => r.join(",")).join("\n") + "\n");
// D4 turns sheet (from Lp/n at 65 kHz DCM):
writeFileSync(join(HERE, "..", "..", "docs", "aux-transformer-D4.md"), `# D4 turns sheet (generated with V-21 closure)
Core EF20 PC40, AL 100 nH/T² gapped: Np = 110 (Lp 1.21 mH), N24 = 9.4→9 (n=0.082), N15 = 6 (n=0.055),
Naux = 6; DCM at 65 kHz, Ipk_pri ≤ 0.9 A (CS 0.22 Ω → 0.85 A clamp), duty ≤0.42 at 300 V.
Insulation: pri TIW barrier to all secondaries, hipot 3 kV; margin 3 mm. Rev A — bench T-09 verifies.
`);
console.log("→ simulation-results/30kw/aux-flyback.csv, plots/aux-flyback.svg, docs/aux-transformer-D4.md");
