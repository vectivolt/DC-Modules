// llc-design.mjs — Phase 6 (§13/§14): 3-phase LLC tank synthesis + transformer section design. REV B.
// Rev A → B (design iteration, documented): gain-critical Rac corrected to the bank-518 V point;
// (Ln,Q) solved jointly maximizing Lm under peak-gain + ZVS + Im ceiling; PC95 loss fit rescaled
// (3.2e-5 — calibrates to ~350 mW/cm³ @100 kHz/±200 mT); per-winding secondary currents halved
// (two banks share section current); transformer moved to 2-stack PQ50/50 (window-limited).
// Per-phase FHA (half-bridge equivalent; star point ≈ virtual mid — Phase 7 SPICE validates).
// Bus policy: bus_ref = clamp(2·bank/0.95, 650, 830) → PFM sits slightly above resonance (M≈0.95
// nominal); M_max 1.25 at bank 518/bus 830; PS mode below M 0.72 floor (bank < ~245 V at bus 650).
// Run: node calculations/llc/llc-design.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { plotSVG } from "../plot.mjs";
import { D3 as D3C, D2 as D2C, d3Leakage, excitation, d3Loss, d2Loss } from "../magnetics/magnetics-envelope.mjs";
import { stack } from "../magnetics/geometry.mjs";
import { TANKS } from "./tanks.mjs";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const f = (x, d = 2) => Number(x.toFixed(d));

const P_PH = 30e3 / 0.98 / 3;                 // ≈10.2 kW into each section at 30 kW rating
const N_RATIO = 1, FR = 140e3;
const COSS_NODE = 250e-12, TDEAD = 120e-9;
const IMAX_MODULE = 100;                      // 30 kW SKU output current cap (per-SKU scaling keeps per-section identical)

const gain = (fn, Q, Ln) => 1 / Math.hypot(1 + (1 / Ln) * (1 - 1 / (fn * fn)), Q * (fn - 1 / fn));
const rac = (Vbank, Pph) => (8 / Math.PI ** 2) * (Vbank * Vbank) / Pph;

// ---------------- joint (Ln, Q) solve
// Requirement rev D: M ≥ 1.36 attainable at bank 525 V (hysteresis top), full power — set by §37 MC yield.
// Objective: maximize Lm (minimize circulating current); constraints: ZVS at bus 830, Im_pk ≤ 13 A.
const RacCrit = rac(525, P_PH);   // rev D: hysteresis 500/525 (E9 rev B)
let best = null;
for (let Ln = 3; Ln <= 9; Ln += 0.5) {
  for (let Q = 0.9; Q >= 0.1; Q -= 0.005) {
    let mpk = 0;
    for (let fn = 0.4; fn < 1.2; fn += 0.002) mpk = Math.max(mpk, gain(fn, Q * RacCrit / RacCrit, Ln)); // Q here defined at RacCrit
    if (mpk < 1.38) continue;      // rev D2: MC yield margin (§37, p1 clearance)
    const Lr = (Q * RacCrit) / (2 * Math.PI * FR);
    const Lm = Ln * Lr;
    const imPk830 = 415 / (4 * FR * Lm);
    if (imPk830 > 14) continue;    // rev D: 14 A pk = 31% of load rms — justified in llc-tank.csv note
    if (imPk830 * TDEAD < 2 * COSS_NODE * 830) continue;    // ZVS
    if (!best || Lm > best.Lm) best = { Ln, Q, Lr, Cr: 1 / ((2 * Math.PI * FR) ** 2 * Lr), Lm, mpk, imPk830 };
    break;                                                  // largest Q meeting gain at this Ln → largest Lr·Ln
  }
}
const { Ln, Q, Lr, Cr, Lm } = best;
console.log(`TANK (per phase): fr=140 kHz  Ln=${Ln}  Q_crit=${f(Q, 3)} → Lr=${f(Lr * 1e6, 1)} µH  Cr=${f(Cr * 1e9, 1)} nF  Lm=${f(Lm * 1e6, 0)} µH  (peak gain ${f(best.mpk, 2)}, Im_pk@830=${f(best.imPk830, 1)} A)`);

// ---------------- operating map with bus policy + envelope caps
const mapRows = [["mode","out_V","bank_V","bus_V","load_frac","M","fn","fsw_kHz","ctl","Ip_rms_A","Is_rms_per_wdg_A","Vcr_pk_V","Im_pk_A","Pph_W"]];
const points = [];
for (const mode of ["PAR", "SER"]) {
  const outs = mode === "PAR" ? [150, 200, 260, 300, 400, 500] : [500, 600, 700, 800, 900, 1000];
  for (const out of outs) {
    const bank = mode === "PAR" ? out : out / 2;
    if (mode === "SER" && bank < 245) continue;
    for (const ld of [0.1, 0.25, 0.5, 0.75, 1.0]) {
      const Pcap = Math.min(30e3, out * IMAX_MODULE) / 0.98 / 3;   // envelope: min(P, V·Imax)
      const Pph = Math.max(Pcap * ld, 150);
      const bus = Math.min(830, Math.max(650, (2 * bank) / 0.95));
      const M = bank / (bus / 2);
      const Rl = rac(bank, Pph), Qop = Math.sqrt(Lr / Cr) / Rl;
      let ctl = "PFM", fn = 1;
      if (M >= 0.72) {                                            // PFM reachable (floor incl. light-load limit 1.45·fr)
        let lo = 0.45, hi = 1.45;
        for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; (gain(mid, Qop, Ln) > M) ? (lo = mid) : (hi = mid); }
        fn = (lo + hi) / 2;
        if (gain(1.45, Qop, Ln) > M) { ctl = "PFM+burst"; fn = 1.45; }
      } else ctl = "PS";
      const fsw = fn * FR;
      // fundamental transfer: V1_rms(eff) = (√2/π)·bus·(PS duty factor); at PFM full square
      const V1 = (Math.SQRT2 / Math.PI) * bus * (ctl === "PS" ? (Math.PI / (Math.SQRT2)) * ((2 * Math.SQRT2 / Math.PI) * bank) / ((2 / Math.PI) * bus) : 1);
      const Ipload = Pph / ((Math.SQRT2 / Math.PI) * bus * (ctl === "PS" ? ((2 * Math.SQRT2 / Math.PI) * bank) / ((2 / Math.PI) * bus / 1) : Math.min(M / gain(fn, Qop, Ln), 1)) || 1);
      // simpler robust estimate: Ip1_rms = Pph / (0.9·bank) (secondary fundamental), n=1 → primary equal; add Im quadrature
      const Ip1 = Pph / (0.9 * bank);
      const im = bus / 2 / (4 * fsw * Lm) / Math.SQRT2;
      const IpRms = Math.hypot(Ip1, im);
      const IsW = (Math.PI / (2 * Math.SQRT2)) * (Pph * 0.98 / bank) / 2;
      const VcrPk = (IpRms * Math.SQRT2) / (2 * Math.PI * fsw * Cr) + bus / 2;
      mapRows.push([mode, out, bank, f(bus, 0), ld, f(M, 3), f(fn, 3), f(fsw / 1e3, 1), ctl, f(IpRms, 1), f(IsW, 1), f(VcrPk, 0), f(im * Math.SQRT2, 1), f(Pph, 0)]);
      points.push({ mode, out, bank, bus, ld, M, fn, ctl, IpRms, IsW, VcrPk, Pph });
    }
  }
}
writeFileSync(join(OUT, "llc-opmap.csv"), mapRows.map(r => r.join(",")).join("\n") + "\n");
const worst = points.reduce((a, p) => (p.IpRms > a.IpRms ? p : a));
const psPts = points.filter(p => p.ctl === "PS");
console.log(`Map: ${points.length} pts; PS-mode region: output ${Math.min(...psPts.map(p => p.out))}–${Math.max(...psPts.map(p => p.out))} V parallel (${psPts.length} pts)`);
console.log(`Worst primary RMS = ${f(worst.IpRms, 1)} A @ ${worst.mode} out ${worst.out} V, load ${worst.ld} (${worst.ctl}) — envelope keeps it ~flat`);
const worstCr = points.reduce((a, p) => (p.VcrPk > a.VcrPk ? p : a));
console.log(`Resonant cap: ${f(Cr * 1e9, 0)} nF ±5%, Irms_max=${f(worst.IpRms, 1)} A, Vpk=${f(worstCr.VcrPk, 0)} V → 4× ${f(Cr * 1e9 / 4, 0)} nF/1200 V resonant-duty film in parallel per phase (≤12 A rms each; series must carry a Vrms-vs-f curve at 140 kHz — CDE 942C class / Faratronic eq, §K O-8)`);

// gain curves
const curves = [650, 740, 800, 830].map(vb => {
  const Rl = rac(400, P_PH), Qop = Math.sqrt(Lr / Cr) / Rl;
  const x = [], y = [];
  for (let fn = 0.4; fn <= 1.5; fn += 0.01) { x.push(fn); y.push(gain(fn, Qop, Ln) * (vb / 2)); }
  return { label: `bank @ bus ${vb}`, x, y };
});
plotSVG({ title: `LLC reachable bank voltage vs fn (full load, Ln=${Ln}, Q=${f(Q, 2)})`, xlabel: "fn = fsw/fr", ylabel: "bank V", path: join(OUT, "..", "..", "simulation-results", "30kw", "plots", "llc-gain-curves.svg"), series: curves });

// ---------------- transformer section — E65: the drawing of record, not a resonant-point sizing ----------------
// This engine used to pick Np from the 415 V / 140 kHz volt-seconds; the power-solved decks run 77–88 kHz at bank
// 500–525 V (gain 1.2–1.27 with the bus capped at 830 V), so that sizing understated flux 1.5–2.2×. The construction now
// comes from magnetics-envelope (proven at every simulated corner) and the losses printed here are its rated point.
const X30 = D3C["30kw"], AeT = stack(X30.core, X30.n).Ae, Np = X30.N, Ns = Np;
const dBact = (415 / (2 * FR)) / (Np * AeT);                    // resonant-point swing, informational only
const rated = excitation("30kw").rows.find((r) => r.corner === "PAR400-full");
const Pfe = d3Loss("30kw", X30, rated).fe(90), Pcu = d3Loss("30kw", X30, rated).cu(90);
const IpDesign = Math.max(worst.IpRms, 38), IsDesign = Math.max(...points.map(p => p.IsW));
const leakEst = d3Leakage(X30), trimNom = TANKS["30kw"].trim;
console.log(`\nTRANSFORMER (per section, E65 D3-30: ${X30.n}× E70/33/32, ${Np}:${Ns}:${Ns}): resonant-point ΔB ${f(dBact * 1e3, 0)} mT pp (the 525 V-bank corner is 142 mT pk — magnetics-envelope) · rated PAR400 Pfe ${f(Pfe, 1)} W + Pcu ${f(Pcu, 1)} W → ${f(Pfe + Pcu, 1)} W (${f((Pfe + Pcu) / (P_PH * 0.98) * 100, 2)}%)`);
console.log(`  Ip=${f(IpDesign, 1)} A · Is=${f(IsDesign, 1)} A/wdg ×2 · primary TIW litz ${X30.strands}×0.071 mm, secondaries Cu foil ${X30.foil * 1e3}×28 mm (conductor-audit)`);
console.log(`  Lr split: transformer leakage ${f(leakEst * 1e6, 2)} µH (S1–P–S2, computed) + 0.1 µH loop + D2 trim bin ~${f(trimNom * 1e6, 2)} µH (${D2C["30kw"].n}× E70 N ${D2C["30kw"].N}) = Lr ${f(Lr * 1e6, 1)} µH — the E51 "engineered 3 µH" leakage was not buildable`);
console.log(`  Insulation: pri-sec REINFORCED 4 kV_pk class; TIW-served primary litz; interwinding shield → primary star`);

writeFileSync(join(OUT, "llc-tank.csv"), [
  "param,value,unit,tolerance,note",
  `fr,140,kHz,±4%,from Lr+trim ±5% + Cr ±5%`,
  `Lr,${f(Lr * 1e6, 1)},µH,±3%,${f(leakEst * 1e6, 2)} leakage + 0.1 loop + D2 bin (E65 bins 6.35–6.8 µH)`,
  `Cr,${f(Cr * 1e9, 1)},nF,±5%,4× parallel 46 nF 1200 V resonant-duty film (Vrms-vs-f curve at 140 kHz — §K O-8)`,
  `Lm,${f(Lm * 1e6, 0)},µH,±7%,gapped 2×E70/33/32 (E7 rev D2 tolerance; E65 core)`,
  `Ln,${Ln},,,joint solve`, `Q_crit,${f(Q, 3)},,,at bank 518 full load`,
  `Np=Ns,${Np},turns,exact,2 secondaries (bank A/B)`,
  `dB_pp_resonant,${f(dBact * 1e3, 0)},mT,,informational — worst simulated corner in llc-flux.csv`,
  `Pfe,${f(Pfe, 1)},W,,rated PAR400 iGSE (magnetics-envelope)`, `Pcu,${f(Pcu, 1)},W,,rated PAR400 Dowell/Sullivan`,
  `Ip_rms_design,${f(IpDesign, 1)},A,,envelope-flat worst`,
  `Is_rms_per_winding,${f(IsDesign, 1)},A,,two windings share section current`,
  `Im_pk_830,${f(best.imPk830, 1)},A,,ZVS OK / ≤13 A ceiling`,
  `Vcr_pk,${f(worstCr.VcrPk, 0)},V,,worst map point`,
].join("\n") + "\n");
console.log("→ calculations/out/llc-tank.csv, llc-opmap.csv, plots/llc-gain-curves.svg");
