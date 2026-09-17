// llc-design.mjs — Phase 6 (§13/§14): LLC tank synthesis check + operating map + magnetics summary, full bridge.
// The tank of record lives in tanks.mjs (chosen by the ngspice scan); this engine is its first-harmonic cross-check:
//   · gain at the gain-critical mode edge (500 V bank, bus 830 → M 1.205): FHA floor + the ngspice gain-worst corner solved
//   · an FHA operating map over both output modes (LOW 150–500 V banks parallel · HIGH 500–1000 V banks series)
//   · the D3 cell / D2 external-Lr constructions and their rated-point losses from magnetics-envelope
// FHA (full bridge, n = Np/Ns): Rac = (8 n²/π²)·Vbank²/P, M = n·Vbank/Vbus, fundamental of the ±Vbus square wave.
// Bus policy: bus_ref = clamp(2·bank/0.95, 650, 830) (fsm.c bus_ref_for). Run: node calculations/llc/llc-design.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { plotSVG } from "../plot.mjs";
import { D3 as D3C, D2 as D2C, D3_CELLS, d3Leakage, excitation, d3Loss, d2Loss, LOOP_STRAY } from "../magnetics/magnetics-envelope.mjs";
import { stack } from "../magnetics/geometry.mjs";
import { TANKS } from "./tanks.mjs";
import { TOL } from "../../spice/llc/llc-run.mjs";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const f = (x, d = 2) => Number(x.toFixed(d));
let fails = 0;
const ck = (name, cond, detail) => { console.log(`${cond ? "  ok  " : "  FAIL"}  ${name} — ${detail}`); if (!cond) fails++; };

const gain = (fn, Q, Ln) => 1 / Math.hypot(1 + (1 / Ln) * (1 - 1 / (fn * fn)), Q * (fn - 1 / fn));
const busFor = (bank) => Math.min(830, Math.max(650, (2 * bank) / 0.95));
const peak = (Q, Ln) => { let m = 0, at = 1; for (let fn = 0.55; fn <= 1.2; fn += 0.001) { const g = gain(fn, Q, Ln); if (g > m) { m = g; at = fn; } } return { m, at }; };

console.log("=== LLC DESIGN (full bridge) — FHA cross-check of tanks.mjs, operating map, magnetics summary ===");
const mapRows = [["sku", "mode", "out_V", "bank_V", "bus_V", "load_frac", "M", "fn", "fsw_kHz", "ctl", "Ip_rms_A", "Is_rms_A", "Vcr_pk_V"]];
const tankRows = ["sku,param,value,unit,tolerance,note"];
for (const [sku, t] of Object.entries(TANKS)) {
  const Z0 = Math.sqrt(t.Lr / t.Cr), Ln = t.Lm / t.Lr, racOf = (bank, P) => ((8 * t.n * t.n) / Math.PI ** 2) * bank * bank / P;
  const Q500 = Z0 / racOf(500, t.P), Mneed = (t.n * 500) / 830;
  // gain-worst corner: Lr +5 %, Cr −5 %, Lm +7 % → Q scales with √(Lr/Cr), Ln with Lm/Lr
  const gw = TOL.gainWorst, Qw = Q500 * Math.sqrt(gw.lr / gw.cr), Lnw = Ln * gw.lm / gw.lr, pk = peak(Qw, Lnw);
  // FHA under-reads LLC gain below resonance (the harmonic content grows as fn falls), so it is a floor, not the proof: the
  // ngspice gain-worst corner must also have SOLVED in PFM at full power
  const gwRow = readFileSync(join(OUT, "..", "..", "simulation-results", sku, "llc-stress.csv"), "utf8").split("\n").find((l) => l.startsWith("PAR500-full-gainWorst,"))?.split(",");
  ck(`${sku} gain at the 500 V-bank mode edge`, pk.m >= Mneed && gwRow?.[3] === "PFM" && Math.abs(+gwRow[8]) <= 2.5,
    `fr ${f(t.fr / 1e3, 1)} kHz · Ln ${f(Ln, 1)} · Q ${f(Q500, 3)} (gain-worst ${f(Qw, 3)}, Ln ${f(Lnw, 1)}) → FHA ${f(pk.m, 3)} at fn ≥ 0.55 vs M ${f(Mneed, 3)} · ngspice gain-worst ${gwRow?.[3]} at ${gwRow?.[4]} kHz, P err ${gwRow?.[8]} %`);
  for (const mode of ["LOW", "HIGH"]) {
    const outs = mode === "LOW" ? [150, 200, 250, 300, 400, 500] : [500, 600, 700, 800, 900, 1000];
    for (const out of outs) for (const ld of [0.25, 0.5, 1.0]) {
      const bank = mode === "LOW" ? out : out / 2, bus = busFor(bank), P = Math.min(t.P, out * t.Imax) * ld, M = (t.n * bank) / bus;
      const Qop = Z0 / racOf(bank, P);
      let fn = 1.45, ctl = "PSM@fmax";
      if (gain(1.45, Qop, Ln) <= M) {
        let lo = 0.45, hi = 1.45;
        for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; (gain(mid, Qop, Ln) > M) ? (lo = mid) : (hi = mid); }
        fn = (lo + hi) / 2; ctl = "PFM";
      }
      const fsw = fn * t.fr, Iload = P / (0.9 * t.n * bank), Im = (t.n * bank) / (4 * fsw * t.Lm) / Math.SQRT2;
      const Ip = Math.hypot(Iload, Im), Is = (Math.PI / (2 * Math.SQRT2)) * (P / bank) / 2, Vcr = (Ip * Math.SQRT2) / (2 * Math.PI * fsw * t.Cr);
      mapRows.push([sku, mode, out, bank, f(bus, 0), ld, f(M, 3), f(fn, 3), f(fsw / 1e3, 1), ctl, f(Ip, 1), f(Is, 1), f(Vcr, 0)]);
    }
  }
  const c3 = D3C[sku], c2 = D2C[sku], rated = excitation(sku).rows.find((r) => r.corner === "PAR400-full");
  const a = d3Loss(sku, c3, rated), b = d2Loss(sku, c2, rated), llk = d3Leakage(c3);
  console.log(`  info  ${sku} D3 rev D: ${D3_CELLS} cells ${c3.n}×E70 ${c3.N}:${c3.N}∥${c3.N} (primaries in series → n ${t.n}) · leakage ${f(llk * 1e6, 3)} µH/cell · rated PAR400 Pfe ${f(a.fe(90), 1)} + Pcu ${f(a.cu(90), 1)} W per cell`);
  console.log(`  info  ${sku} D2 rev F: ${c2.n}×E70 N ${c2.N} litz ${c2.strands}×0.05 · ${f(c2.Lnom * 1e6, 2)} µH = Lr ${f(t.Lr * 1e6, 2)} − ${D3_CELLS}×${f(llk * 1e6, 3)} − ${f(LOOP_STRAY * 1e6, 1)} loop · rated Pfe ${f(b.fe(90), 1)} + Pcu ${f(b.cu(90), 1)} W · gap Σ ${f((4e-7 * Math.PI * c2.N ** 2 * stack(c2.core, c2.n).Ae / c2.Lnom) * 1e3, 1)} mm (distributed, ≤1.0 mm per segment)`);
  tankRows.push(
    `${sku},fr,${f(t.fr / 1e3, 1)},kHz,±5%,Lr ±5 % (D2 ±3 % + leakage band) with Cr ±5 %`,
    `${sku},n,${t.n},,exact,${D3_CELLS} cells ${c3.N}:${c3.N} with primaries in series`,
    `${sku},Lr,${f(t.Lr * 1e6, 2)},µH,±5%,D2 ${f(c2.Lnom * 1e6, 2)} µH + ${D3_CELLS}× cell leakage + ${f(LOOP_STRAY * 1e6, 1)} µH loop`,
    `${sku},Cr,${f(t.Cr * 1e9, 0)},nF,±5%,${t.crN}× 33 nF 1200 V resonant-duty film in parallel`,
    `${sku},Lm,${f(t.Lm * 1e6, 1)},µH,±7%,primary-referred; ${f(t.Lm / D3_CELLS * 1e6, 2)} µH per cell`,
    `${sku},Ln,${f(Ln, 1)},,,ngspice scan`, `${sku},Q_500V,${f(Q500, 3)},,,at a 500 V bank full power`);
}
writeFileSync(join(OUT, "llc-opmap.csv"), mapRows.map((r) => r.join(",")).join("\n") + "\n");
writeFileSync(join(OUT, "llc-tank.csv"), tankRows.join("\n") + "\n");
const t40 = TANKS["40kw"], Ln40 = t40.Lm / t40.Lr, Z40 = Math.sqrt(t40.Lr / t40.Cr);
plotSVG({
  title: `40 kW full-bridge LLC — reachable bank voltage vs fn at full load (Ln ${f(Ln40, 1)}, n 2)`, xlabel: "fn = fsw/fr", ylabel: "bank V",
  path: join(OUT, "..", "..", "simulation-results", "40kw", "plots", "llc-gain-curves.svg"),
  series: [650, 740, 830].map((vb) => {
    const x = [], y = [];
    for (let fn = 0.4; fn <= 1.5; fn += 0.01) { x.push(fn); y.push(gain(fn, Z40 / (((8 * 4) / Math.PI ** 2) * 400 * 400 / t40.P), Ln40) * vb / t40.n); }
    return { label: `bus ${vb} V`, x, y };
  }),
});
console.log(fails ? `\n${fails} LLC DESIGN FAILURE(S)` : "\n→ calculations/out/llc-tank.csv, llc-opmap.csv, simulation-results/40kw/plots/llc-gain-curves.svg");
process.exit(fails ? 1 : 0);
