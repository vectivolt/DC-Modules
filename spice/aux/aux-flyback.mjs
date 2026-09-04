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
const SKUS = {
  "30kw": { i24h: 0.7, i24s: 1.6, i15: 1.0 },
  "60kw": { i24h: 0.9, i24s: 1.9, i15: 1.45 },
  "120kw": { i24h: 1.6, i24s: 2.6, i15: 2.55 },
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
    const ok = Math.abs(v24s - 24) < 1.5 && dip > 21 && v15x > 12.5;
    if (!ok) allPass = false;
    rows.push([tag, VIN, sku, f(v24s), f(dip), f((tRec - 12e-3) * 1e3), f(v15x), f(pout / n, 1), ok ? "PASS" : "CHECK"]);
    console.log(`${tag}: v24 ${f(v24s)} V, dip ${f(dip)} V, rec ${f((tRec - 12e-3) * 1e3)} ms, v15min ${f(v15x)} V, Pout ${f(pout / n, 1)} W → ${ok ? "PASS" : "CHECK"}`);
    if (VIN === 560 && sku === "120kw") rNom = r;
  }
}
const sel = rNom.t.map((t, i) => ({ t, i })).filter(p => p.t > 0);
plotSVG({ title: "Aux flyback rev C (110 W), 560 V bus, 120 kW load: startup + full step @12 ms", xlabel: "t (s)", ylabel: "V",
  path: join(RES, "plots", "aux-flyback.svg"),
  series: [
    { label: "V24", x: sel.map(p => rNom.t[p.i]), y: sel.map(p => rNom.cols.v24[p.i]) },
    { label: "V15", x: sel.map(p => rNom.t[p.i]), y: sel.map(p => rNom.cols.v15[p.i]), color: "#3A6B8C" },
  ] });
writeFileSync(join(RES, "aux-flyback.csv"),
  "# ngspice-46; rev C (E26 rev C 110 W, per-SKU load matrix — R2/CB-20); behavioral VM control (bench T-09 validates NCP1252A UVLO/BO); netlists spice/generated/aux-*.cir\n" +
  rows.map(r => r.join(",")).join("\n") + "\n");
// D4 rev C turns sheet:
writeFileSync(join(HERE, "..", "..", "docs", "aux-transformer-D4.md"), `# D4 turns sheet — rev C (generated with the E26 rev C / R2 CB-19/CB-20 closure)

Stage: **110 W-class** DCM flyback, input 342–860 VDC (full unboosted bus), 65 kHz, Vor ≈ 157 V,
Ip clamp 3.2 A (CS 0.31 Ω → 1.0 V threshold), 1700 V SiC switch (72 % at 860 V + clamp ring).
Sized for the per-SKU load matrix (R2 §J): 27–42 / 40–53 / **70–90 W** steady at 30/60/120 kW —
one p/n family-wide, ≥20 % corner margin at 120 kW (Lp +10 %, f −5 % worst).

Core **ETD34 PC95** (Ae 97.1 mm²), gapped to AL ≈ 239 nH/T²: Np = 38 (Lp 345 µH),
N24 = 6 (n = 0.158), N15 = 4 (n = 0.105), Naux(VCC) = 4. Bpk = Lp·Ip/(Np·Ae) =
345 µ·3.2/(38·97.1 mm²) ≈ **0.30 T** (DCM full swing — PC95 at 65 kHz, ~0.9 W core).
DCM proof at Vin,min 342 V full power: t_on = 3.2 µs + t_reset = 7.0 µs = 10.3 µs < 13.8 µs
usable ✓ (holds at Lp +10 %). Rectifiers (CB-19): PIV = Vo + 860·n ≈ **160 V (24 V) /
151 V (15 V/VCC)** + leakage ring → **400 V ultrafast** (UF-400V-3A SMC / US2G), never Schottky-100 V.

Insulation: primary is at bus potential — reinforced barrier pri→all secondaries (TIW secondaries
+ 3 mm margin tape), hipot 4 kV 100 % (E25 SELV control domain depends on this barrier). Aux(VCC)
winding is primary-side (DCN-referenced) — functional insulation only to primary, reinforced to
secondaries. Rev C — bench T-09 verifies NCP1252A UVLO/BO thresholds and thermal (T-18 at the
per-SKU load table).
`);
console.log(`→ simulation-results/30kw/aux-flyback.csv, plots/aux-flyback.svg, docs/aux-transformer-D4.md ${allPass ? "(ALL PASS)" : "(CHECK FAILURES!)"}`);
