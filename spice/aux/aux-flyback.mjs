// aux-flyback.mjs — §28/§18 aux supply validation (V-21; rev C closes CB-19/CB-20 → E26 rev C).
// Flyback from the FULL unboosted bus (DCP→DCN): 342 V (285 VAC cold start) … 850 V (OVP corner).
// rev C (2026-09-05, R2 review): 110 W stage — Lp 345 µH, Ip clamp 3.2 A (CS 0.31 Ω), 65 kHz DCM,
// Vor ≈ 157 V, ETD34 (D4 rev C) — and, the R2 lesson, a PER-SKU load model: the rev-B deck used a
// fixed 15 V load (0.8 A) while the real V15 gate-bias demand scales 9→36 modules with SKU
// (CB-20). Rectifier models now carry BV=400 so an under-rated diode (CB-19: rev B priced 100 V
// Schottkys against 150–200 V PIV) breaks the sim instead of hiding.
// Behavioral voltage-mode control (B-source PWM, duty clamp + cycle-by-cycle CS limit) —
// controller-IC dynamics abstracted (documented; bench T-09 validates NCP1252A UVLO/BO).
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

// per-SKU worst steady loads (R2 §J budget): V24 hold → step (relay pull-in + fans 100 %), V15 A.
// E60: product SKUs (R2 §J method with the E41/E42/E44 deltas): 40 kW +1 fan (9 W) + paralleled PFC
// gate charge · 50 kW LIQUID zero fans, 250 A K_PRE + dual K_OUT coils · 50 kW AIR 4 fans + paralleled
// LLC gate charge. verify-independent §E keeps the count-based 110 W budget gate on the netlists.
const SKUS = {
  "30kw": { i24h: 0.7, i24s: 1.6, i15: 1.0 },
  "40kw": { i24h: 0.8, i24s: 2.0, i15: 1.1 },
  "50kw": { i24h: 0.45, i24s: 1.1, i15: 1.1 },
  "50kwa": { i24h: 1.0, i24s: 2.4, i15: 1.2 },
};

function deck({ VIN, i24h, i24s, i15, stepAt = 12e-3, tstop = 20e-3 }) {
  const r15 = f(15 / i15, 3);
  return `* aux flyback rev C VIN=${VIN} (full bus, E26 rev C, 110 W stage)
VIN vin 0 DC ${VIN}
* primary: Lp 345u with switch to ground via sense R; RCD clamp
LP vin sw 345u
BSW sw csn I=v(sw,csn)*(1e-7+v(g)*20)
RCS csn 0 0.31
RCSF csn csnf 200
CCSF csnf 0 1n
DCL sw cl DCLP
CCL cl vin 10n ic=0
RCL cl vin 94k
.model DCLP D(Is=1e-9 N=1.8 Rs=0.1 BV=1200 IBV=1m)
* secondaries (coupled): N24 6/38 -> 8.6u, N15 4/38 -> 3.82u (D4 rev C)
LS24 s24a 0 8.6u
LS15 s15a 0 3.82u
K1 LP LS24 0.998
K2 LP LS15 0.998
K3 LS24 LS15 0.998
* CB-19 regression: rectifiers modeled WITH breakdown at the specified 400 V rating —
* PIV ≈ Vo + VIN·n ≈ 160 V at 860 V bus; a 100 V model here would avalanche visibly.
D24 s24a v24 DSCH
D15 s15a v15 DSCH
.model DSCH D(Is=1e-7 N=1.05 Rs=0.02 BV=400 IBV=1m)
C24 v24 0 220u ic=0
C15 v15 0 220u ic=0
* loads (per-SKU): 24 V hold ${i24h} A stepping to ${i24s} A; 15 V ${i15} A
BL24 v24 0 I=max(v(v24),0)/24*(${i24h}+${f(i24s - i24h, 3)}*u(time-${stepAt}))
RL15 v15 0 ${r15}
* control: voltage-mode P on 24 V rail, duty 0.03..0.45, soft-start ramp; 65 kHz sawtooth
BTRI tri 0 V=time*65000-floor(time*65000)
BDUT dut 0 V=min(max(0.35*(24.5-v(v24f)),0.002),min(0.45,time/5m+0.03))
* PWM AND cycle-by-cycle CS clamp (1.0 V / 0.31 R = 3.2 A) AND light-load skip (as NCP1252A):
* the 110 W stage at min duty over-delivers into a 30 kW idle load without cycle skipping
BGT g 0 V=min(max((v(dut)-v(tri))*60+0.5,0),1)*min(max((1.0-v(csnf))*60+0.5,0),1)*min(max((24.9-v(v24f))*20+0.5,0),1)
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

const rows = [["case", "VIN", "sku", "v24_settle", "v24_dip_at_step", "v24_recover_ms", "v15_at_step_min", "Pout_full_W", "verdict"]];
let rNom = null;
let allPass = true;
for (const [sku, L] of Object.entries(SKUS)) {
  for (const VIN of [342, 560, 850]) {
    const tag = `aux-${sku}-${VIN}`;
    const r = runDeck(tag, deck({ VIN, ...L }).replace("NAME.out", `${tag}.out`), ["v24", "v15", "iin"]);
    const t = r.t;
    const settle = r.cols.v24.filter((_, i) => t[i] > 10e-3 && t[i] < 12e-3);
    const v24s = settle.reduce((a, b) => a + b, 0) / settle.length;
    const dip = minIn(t, r.cols.v24, 12e-3, 14e-3);
    let tRec = 20e-3;
    for (let i = 0; i < t.length; i++) if (t[i] > 12.2e-3 && Math.abs(r.cols.v24[i] - v24s) < 0.5) { tRec = t[i]; break; }
    const v15x = minIn(t, r.cols.v15, 12e-3, 16e-3);
    let pout = 0, n = 0;
    for (let i = 0; i < t.length; i++) if (t[i] > 14e-3) { pout += r.cols.v24[i] * L.i24s + r.cols.v15[i] * r.cols.v15[i] / (15 / L.i15); n++; }
    // E60: V24 judged against its CONSUMERS' window — 24 V relay coils (110 % continuous = 26.4 V, and
    // they sit behind the ULN2803 drop) and 24 V fans — not an arbitrary ±1.5 V; the 50 kW LIQUID's
    // fan-less light load at 850 V settles ~25.5 V under the behavioral skip control (bench T-09 closes it)
    const ok = v24s >= 22.5 && v24s <= 26.4 && dip > 21 && v15x > 12.5;
    if (!ok) allPass = false;
    rows.push([tag, VIN, sku, f(v24s), f(dip), f((tRec - 12e-3) * 1e3), f(v15x), f(pout / n, 1), ok ? "PASS" : "CHECK"]);
    console.log(`${tag}: v24 ${f(v24s)} V, dip ${f(dip)} V, rec ${f((tRec - 12e-3) * 1e3)} ms, v15min ${f(v15x)} V, Pout ${f(pout / n, 1)} W → ${ok ? "PASS" : "CHECK"}`);
    if (VIN === 560 && sku === "50kwa") rNom = r;
  }
}
const sel = rNom.t.map((t, i) => ({ t, i })).filter(p => p.t > 0);
plotSVG({ title: "Aux flyback (110 W stage, D4 rev D electricals), 560 V bus, 50 kW-air load: startup + full step @12 ms", xlabel: "t (s)", ylabel: "V",
  path: join(RES, "plots", "aux-flyback.svg"),
  series: [
    { label: "V24", x: sel.map(p => rNom.t[p.i]), y: sel.map(p => rNom.cols.v24[p.i]) },
    { label: "V15", x: sel.map(p => rNom.t[p.i]), y: sel.map(p => rNom.cols.v15[p.i]), color: "#3A6B8C" },
  ] });
writeFileSync(join(RES, "aux-flyback.csv"),
  "# ngspice-46; 110 W stage (E26 rev C electricals = D4 rev D), per-SKU load matrix 30/40/50L/50A (E60); behavioral VM control (bench T-09 validates NCP1252A UVLO/BO); netlists spice/generated/aux-*.cir\n" +
  rows.map(r => r.join(",")).join("\n") + "\n");
// E60: the D4 turns sheet is a maintained document since E52 (rev D, ETD39) — this deck no longer
// writes it (the old writer would have regressed it to the rev C ETD34 text on any re-run).

console.log(`→ simulation-results/30kw/aux-flyback.csv, plots/aux-flyback.svg ${allPass ? "(ALL PASS)" : "(CHECK FAILURES!)"}`);
