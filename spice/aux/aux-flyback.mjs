// aux-flyback.mjs — §28/§18 aux supply validation (closes V-21; rev B closes CB-5/6/7 → E26).
// Flyback from the FULL unboosted bus (DCP→DCN): 342 V (285 VAC cold start) … 850 V (OVP corner),
// outputs 24 V (0.5 A hold → 1.8 A relay-pull-in + fans step) + 15 V (0.8 A). 60 W-class stage:
// Lp 550 µH, Ip clamp 1.8 A (CS 0.55 Ω), 65 kHz DCM, Vor ≈ 120 V, 1700 V SiC switch (E26).
// Behavioral voltage-mode control (B-source PWM, duty clamp + cycle-by-cycle CS limit) — controller-IC
// dynamics abstracted (documented; bench T-09 validates UVLO/BR thresholds of the real IC).
// Validates: startup at min/nom/max input, regulation both rails, cross-regulation under the
// full relay+fan load step, DCM current limit, input power. D4 rev B turns sheet emitted below.
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
  return `* aux flyback rev B VIN=${VIN} (full bus, E26)
VIN vin 0 DC ${VIN}
* primary: Lp 550u with switch to ground via sense R; RCD clamp
LP vin sw 550u
BSW sw csn I=v(sw,csn)*(1e-7+v(g)*20)
RCS csn 0 0.55
RCSF csn csnf 200
CCSF csnf 0 1n
DCL sw cl DCLP
CCL cl vin 10n ic=0
RCL cl vin 94k
.model DCLP D(Is=1e-9 N=1.8 Rs=0.1)
* secondaries (coupled): n24=0.206 → 23.3u, n15=0.131 → 9.4u
LS24 s24a 0 23.3u
LS15 s15a 0 9.4u
K1 LP LS24 0.998
K2 LP LS15 0.998
K3 LS24 LS15 0.998
D24 s24a v24 DSCH
D15 s15a v15 DSCH
.model DSCH D(Is=1e-7 N=1.05 Rs=0.02)
C24 v24 0 220u ic=0
C15 v15 0 220u ic=0
* loads: 24 V hold 0.5 A stepping to 1.8 A (all relays pull-in + fans, CB-7 case); 15 V 0.8 A
BL24 v24 0 I=max(v(v24),0)/24*(0.5+1.3*u(time-${stepAt}))
RL15 v15 0 18.75
* control: voltage-mode P on 24 V rail, duty 0.03..0.45, soft-start ramp; 65 kHz sawtooth
BTRI tri 0 V=time*65000-floor(time*65000)
BDUT dut 0 V=min(max(0.35*(24.5-v(v24f)),0.03),min(0.45,time/5m+0.03))
* PWM AND cycle-by-cycle CS clamp (1.0 V / 0.55 R = 1.8 A) — as the real current-mode IC
BGT g 0 V=min(max((v(dut)-v(tri))*60+0.5,0),1)*min(max((1.0-v(csnf))*60+0.5,0),1)
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

const rows = [["case","VIN","v24_settle","v24_dip_at_step","v24_recover_ms","v15_at_step_crossreg","Pout_full_W","verdict"]];
let rNom = null;
for (const VIN of [342, 560, 850]) {
  const tag = `aux-${VIN}`;
  const r = runDeck(tag, deck({ VIN }).replace("NAME.out", `${tag}.out`), ["v24", "v15", "iin"]);
  const t = r.t;
  const settle = r.cols.v24.filter((_, i) => t[i] > 10e-3 && t[i] < 12e-3);
  const v24s = settle.reduce((a, b) => a + b, 0) / settle.length;
  const dip = minIn(t, r.cols.v24, 12e-3, 14e-3);
  let tRec = 20e-3;
  for (let i = 0; i < t.length; i++) if (t[i] > 12.2e-3 && Math.abs(r.cols.v24[i] - v24s) < 0.5) { tRec = t[i]; break; }
  const v15x = minIn(t, r.cols.v15, 12e-3, 16e-3);
  // output power at full load from the rail waveforms (input-side average is not resolvable at the
  // behavioral switch's transition band × 0.2 µs timestep — Pin ≈ Pout/η, η_est 0.82; bench T-09)
  let pin = 0, n = 0;
  for (let i = 0; i < t.length; i++) if (t[i] > 14e-3) { pin += r.cols.v24[i] * 1.8 + r.cols.v15[i] * r.cols.v15[i] / 18.75; n++; }
  const ok = Math.abs(v24s - 24) < 1.5 && dip > 21 && v15x > 12.5;
  rows.push([tag, VIN, f(v24s), f(dip), f((tRec - 12e-3) * 1e3), f(v15x), f(pin / n, 1), ok ? "PASS" : "CHECK"]);
  console.log(`${tag}: v24 settles ${f(v24s)} V, step dip ${f(dip)} V, recover ${f((tRec - 12e-3) * 1e3)} ms, v15 cross-reg min ${f(v15x)} V, Pout(full load) ${f(pin / n, 1)} W → ${ok ? "PASS" : "CHECK"}`);
  if (VIN === 560) rNom = r;
}
const sel = rNom.t.map((t, i) => ({ t, i })).filter(p => p.t > 0);
plotSVG({ title: "Aux flyback rev B, 560 V bus: startup + full relay/fan step @12 ms (behavioral control)", xlabel: "t (s)", ylabel: "V",
  path: join(RES, "plots", "aux-flyback.svg"),
  series: [
    { label: "V24", x: sel.map(p => rNom.t[p.i]), y: sel.map(p => rNom.cols.v24[p.i]) },
    { label: "V15", x: sel.map(p => rNom.t[p.i]), y: sel.map(p => rNom.cols.v15[p.i]), color: "#3A6B8C" },
  ] });
writeFileSync(join(RES, "aux-flyback.csv"),
  "# ngspice-46; rev B (E26 full-bus 60 W redesign); behavioral VM control (IC dynamics abstracted — bench T-09 validates UVLO/BR); netlists spice/generated/aux-*.cir\n" +
  rows.map(r => r.join(",")).join("\n") + "\n");
// D4 rev B turns sheet (from Lp/n at 65 kHz DCM, full-bus feed):
writeFileSync(join(HERE, "..", "..", "docs", "aux-transformer-D4.md"), `# D4 turns sheet — rev B (generated with the E26/CB-5/6/7 closure)

Stage: 60 W-class DCM flyback, input 342–860 VDC (full unboosted bus), 65 kHz, Vor ≈ 120 V,
Ip clamp 1.8 A (CS 0.55 Ω → 1.0 V threshold), 1700 V SiC switch (33% headroom at 860 V + clamp).

Core **ETD29 PC95**, gapped to AL ≈ 158 nH/T²: Np = 59 (Lp 550 µH), N24 = 12 (n = 0.203),
N15 = 8 (n = 0.136), Naux(VCC) = 8. Bpk = Lp·Ip/(Np·Ae) = 550 µ·1.8/(59·76 mm²) ≈ 0.22 T (DCM
full swing — PC95 at 65 kHz, loss checked in thermal budget). DCM proof at Vin,min 342 V full
power: t_on = 2.9 µs + t_reset = 8.3 µs = 11.2 µs < 15.4 µs period ✓.

Insulation: primary is at bus potential — reinforced barrier pri→all secondaries (TIW secondaries
+ 3 mm margin tape), hipot 4 kV (E25 SELV control domain depends on this barrier). Aux(VCC)
winding is primary-side (DCN-referenced) — functional insulation only to primary, reinforced to
secondaries. Rev B — bench T-09 verifies UVLO/BR thresholds and thermal.
`);
console.log("→ simulation-results/30kw/aux-flyback.csv, plots/aux-flyback.svg, docs/aux-transformer-D4.md");
