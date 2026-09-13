// vienna-switched.mjs — E60: CYCLE-BY-CYCLE 3-φ Vienna simulation with the REAL D1 inductance.
// Why it exists: the only PFC simulation on record (spice/pfc/pfc-phase-run.mjs) is an AVERAGED
// model — no switching ripple, a flat 130 µH, 30 kW only, 800 V bus — so the number the F.01
// overcurrent trip must clear (instantaneous line-current peak = fundamental + crest ripple on the
// SOFT-SATURATED sendust inductance) had never been simulated for any SKU. ngspice could not run the
// switched 3-φ stage (7 documented aborts); this fixed-step state model can, in seconds:
//   · ideal bidirectional switch per phase (leg → midpoint) + boost diodes to P/N, DCM-aware
//   · floating grid neutral (Σi = 0 solved every step), stiff grid (no grid L — worst ripple)
//   · D1 differential inductance L(i) = µpu(N·i/le)·AL·stack·N² on the CATALOG 26µ curve at lot AL
//   · split-cap bus (the drawn link cans per half) + constant-power LLC load
//   · regular-sampled triangular PWM, P current loop + resistive emulation, PI voltage loop,
//     min-max zero-sequence injection + midpoint balancing (the averaged deck's control family)
//   · E65 D1 excitation: 50 kHz ripple rms (phase A minus its fundamental), core loss by iGSE on the SIMULATED flux
//     (B = ∫v_L dt/(N·Ae·stack) per switching period — Faraday, exact under the L(i) roll-off) with the Magnetics Kool Mµ 26
//     published equation (MAS), and the recurring switch-end-to-grid-neutral peak (insulation-coordination D1 row)
// Fidelity: devices ideal (no Rds/Vf, no dead time), control is a reference implementation (the HAL
// is not in this repo) — peaks, ripple and device current SHAPES are what this level proves.
// Run: node calculations/pfc/vienna-switched.mjs            (→ calculations/out/vienna-switched.csv)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CORES, DATA } from "../magnetics/geometry.mjs";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const f = (x, d = 1) => Number(x.toFixed(d));

export const D1 = {   // drawn D1 rev B parts (magnetics pack) + link cans per half (stress/verify-independent)
  "30kw": { P: 30e3, stack: 3, N: 39, cHalf: 5 * 470e-6 },
  "40kw": { P: 40e3, stack: 5, N: 26, cHalf: 6 * 470e-6 },
  "50kw": { P: 50e3, stack: 5, N: 24, cHalf: 8 * 470e-6 },
};
// Magnetics 0077908A7 datasheet rev 10/7/2021: AL 37 nH/T² ±8 %, Ae 221 mm², le 196 mm (E60 catalog sync —
// engines carried 227/201); the 26µ roll-off fit stays the conservative 80 %@75 Oe / 50 %@175 Oe basis
// (catalog minimums are 80 %@95 Oe / 50 %@205 Oe)
const AL = 37e-9, LE = 0.196, R26 = { a: 2.13e-4, b: 1.637 };
export const Ld1 = (d, i, lot = 1) => lot * AL * d.stack * d.N * d.N / (1 + R26.a * Math.pow(Math.max(d.N * Math.abs(i) / LE / 79.577, 1e-9), R26.b));
// iGSE (Venkatachalam 2002) on the Magnetics form Pv = a·B̂^b·f^c: ki = a / ((2π)^(c−1) · ∫₀^2π |cos θ|^c dθ · 2^(b−c)), ΔB peak-to-peak
const KM = DATA.KoolMu_MAS["26"], KI = KM.a / (Math.pow(2 * Math.PI, KM.c - 1) * Array.from({ length: 4096 }, (_, j) => Math.pow(Math.abs(Math.cos(2 * Math.PI * (j + 0.5) / 4096)), KM.c) * 2 * Math.PI / 4096).reduce((a, x) => a + x) * Math.pow(2, KM.b - KM.c));
{ // self-check: iGSE on a pure sine must return the published equation
  const f0 = 50e3, B0 = 0.05, n = 2000; let e = 0;
  for (let j = 0; j < n; j++) e += Math.pow(Math.abs(2 * Math.PI * f0 * B0 * Math.cos((2 * Math.PI * (j + 0.5)) / n)), KM.c) / (n * f0);
  if (Math.abs((KI * Math.pow(2 * B0, KM.b - KM.c) * e * f0) / (KM.a * B0 ** KM.b * f0 ** KM.c) - 1) > 0.01) throw new Error("vienna-switched: iGSE ki does not reproduce the sine equation");
}

// event: { type: "dip", t0, t1, depth } (grid amplitude × depth between t0..t1) | { type: "jump", t0, deg }
// E65 (EMI-2): `filter` inserts the DRAWN input filter between the grid EMF and D1 (default null = the E60 stiff grid,
// bit-identical): grid Lg+Rg and CMC1 leakage → CX1 (Δ → star 3·C) → CMC2 leakage + D6 L(i) (floating-neutral solve, like
// D1) → CX2 ∥ damper Rd–Cd (Δ) → D1. The controller then sees what the hardware gives it: the CX2-node voltage through the
// SNS_VAC divider RC (tauV), its 50 Hz lag rotated out with the other two phases (αβ, a memoryless mix), sampled every `upd`
// fine steps and applied `lag` updates later (upd 400/lag 1 = double update, 15 µs; upd 800/lag 1 = 1.5·Tsw, 30 µs).
//   filter = { Lg, Rg, Llk, Rf, C1, C2, Cd, Rd, d6: { L0 µH, roll: [a, b, N/le] }, tauV, upd, lag }
export function vienna(sku, { VLL, Pout, vbus, lot = 1, fsw = 50e3, cycles = 4, Rg = 0.01, event = null, clamp = 1.05, filter: F = null }) {
  const d = D1[sku], W = 2 * Math.PI * 50, Vpk = VLL * Math.SQRT2 / Math.sqrt(3);
  const Ts = 1 / fsw, dt = Ts / 800, nPer = Math.round(0.02 / dt), nTot = cycles * nPer;
  const Pin = Pout / 0.965;                                    // design-basis chain efficiency (54.94 A @330 V/30 kW)
  const Iph = Pin / (3 * Vpk / Math.SQRT2);
  const i = [0, 0, 0], node = [0, 0, 0], on = [true, true, true], blocked = [false, false, false], m = [0, 0, 0];
  let Vp = vbus / 2, Vn = vbus / 2, Gint = 0, vMN = 0;
  const G0 = Iph / (Vpk / Math.SQRT2);                             // A per V (resistive emulation)
  // FIRMWARE REQUIREMENT modelled (E60 FW-R6): current-reference AMPLITUDE clamp at clamp × the
  // rated crest at the 330 VAC full-power floor — a sag can never command more than this
  const Iclamp = clamp * (d.P / 0.965) / (Math.sqrt(3) * 330) * Math.SQRT2;
  const Kpi = 2 * Math.PI * 3000 * Ld1(d, Iph * Math.SQRT2, lot);   // ~3 kHz current loop at the crest L
  // records over the LAST line cycle
  const rec = { pk: [0, 0, 0], sq: [0, 0, 0], swSq: 0, dAvg: 0, dSq: 0, dPk: 0, clip: 0, n: 0, re: [0, 0, 0], im: [0, 0, 0], err: 0, vbMin: 1e9, vbMax: 0, mid: 0, hsum: 0, vMN: 0, vSw: 0 };
  const recStart = event ? Math.round((event.t0 - 0.005) / dt) : nTot - nPer;
  const NAe = d.N * CORES.T79.Ae * d.stack, fx = { B: 0, hi: 0, lo: 0, int: 0, E: 0, T: 0, dBmax: 0 };   // phase-A flux, per switching period
  const iHist = new Float64Array(2000);                        // resampled phase-A current for THD
  const iHf = new Float64Array(20000);                         // 1 MHz samples for the 150 kHz CISPR-band content
  let hIdx = 0, fIdx = 0;
  const upd = F?.upd ?? 400, lag = F?.lag ?? 0, mNext = [0, 0, 0];
  const iG = [0, 0, 0], iF = [0, 0, 0], v1 = [0, 0, 0], v2 = [0, 0, 0], vd = [0, 0, 0], vm = [0, 0, 0], vff = [0, 0, 0], LF = [0, 0, 0];
  const gHist = new Float64Array(2000);
  let pDamp = 0;
  if (F) for (let k = 0; k < 3; k++) {                          // start on the no-load sinusoidal steady state
    const th = -2 * Math.PI / 3 * [0, 1, -1][k], dv = Vpk * W * Math.cos(th);
    v1[k] = v2[k] = vd[k] = vm[k] = Vpk * Math.sin(th);
    iF[k] = 3 * (F.C2 + F.Cd) * dv; iG[k] = iF[k] + 3 * F.C1 * dv;
  }
  const sub3 = (a) => { const c = (a[0] + a[1] + a[2]) / 3; a[0] -= c; a[1] -= c; a[2] -= c; };   // 3-wire: no zero sequence
  for (let s = 0; s < nTot; s++) {
    const t = s * dt;
    const amp = event?.type === "dip" && t >= event.t0 && t < event.t1 ? Vpk * event.depth : Vpk;
    const ph = event?.type === "jump" && t >= event.t0 ? event.deg * Math.PI / 180 : 0;
    const vg = [amp * Math.sin(W * t + ph), amp * Math.sin(W * t + ph - 2 * Math.PI / 3), amp * Math.sin(W * t + ph + 2 * Math.PI / 3)];
    const vq = F ? v2 : vg;                                    // the voltage D1 actually sees
    let vc = vg;
    if (F) { for (let k = 0; k < 3; k++) vff[k] = vm[k] + W * F.tauV * (vm[(k + 2) % 3] - vm[(k + 1) % 3]) / Math.sqrt(3); vc = vff; }
    // ---- control update at carrier peak and valley (regular sampling, 2×fsw)
    if (s % upd === 0) {
      const e = vbus - (Vp + Vn);
      Gint += 0.02 * e * (Ts / 2) * G0;                         // voltage PI (slow, ~15 Hz class)
      const Gmax = Iclamp / Math.max(amp, 1);
      if (Gint > Gmax - G0) Gint = Gmax - G0;                   // anti-windup at the clamp
      const G = Math.min(G0 * (1 + 0.004 * e) + Gint, Gmax);
      const vs = [0, 0, 0];
      for (let k = 0; k < 3; k++) vs[k] = vc[k] - Kpi * (G * vc[k] - i[k]);
      const v0 = -(Math.max(...vs) + Math.min(...vs)) / 2 - 0.5 * (Vp - Vn);
      for (let k = 0; k < 3; k++) {
        const v = vs[k] + v0, pos = (Math.abs(i[k]) > 0.5 ? i[k] : G * vc[k]) >= 0;
        let mk = pos ? v / Vp : -v / Vn;
        if (mk > 1) { mk = 1; if (s >= nTot - nPer) rec.clip++; }
        if (lag) { m[k] = mNext[k]; mNext[k] = Math.max(0, mk); } else m[k] = Math.max(0, mk);
      }
    }
    const car = (s % 800) / 800, tri = car < 0.5 ? 2 * car : 2 - 2 * car;
    if (s % 800 === 0 && s >= recStart) {                    // close one switching period of phase-A flux
      if (s > recStart) { const dB = fx.hi - fx.lo; fx.E += KI * Math.pow(dB, KM.b - KM.c) * fx.int; fx.T += Ts; fx.dBmax = Math.max(fx.dBmax, dB); }
      fx.hi = fx.lo = fx.B; fx.int = 0;
    }
    // ---- leg states: switch OFF (node at a rail) while carrier below the modulation fraction
    let num = 0, den = 0;
    for (let k = 0; k < 3; k++) {
      on[k] = tri >= m[k];
      const L = Ld1(d, i[k], lot);
      if (on[k]) { node[k] = 0; blocked[k] = false; }
      else if (i[k] > 0) { node[k] = Vp; blocked[k] = false; }
      else if (i[k] < 0) { node[k] = -Vn; blocked[k] = false; }
      else blocked[k] = true;
      if (!blocked[k]) { num += (vq[k] - Rg * i[k] - node[k]) / L; den += 1 / L; }
    }
    vMN = den > 0 ? num / den : 0;
    // un-block a DCM phase whose diode becomes forward-biased
    for (let k = 0; k < 3; k++) if (blocked[k]) {
      const vD = vq[k] - vMN;
      if (vD > Vp || vD < -Vn) { node[k] = vD > Vp ? Vp : -Vn; blocked[k] = false; const L = Ld1(d, 0, lot); num += (vq[k] - node[k]) / L; den += 1 / L; vMN = num / den; }
    }
    let iP = 0, iN = 0;
    for (let k = 0; k < 3; k++) {
      if (blocked[k]) continue;
      const L = Ld1(d, i[k], lot), vL = vq[k] - Rg * i[k] - node[k] - vMN;
      const ni = i[k] + vL / L * dt;
      if (k === 0 && s >= recStart) { fx.B += vL * dt / NAe; fx.hi = Math.max(fx.hi, fx.B); fx.lo = Math.min(fx.lo, fx.B); fx.int += Math.pow(Math.abs(vL / NAe), KM.c) * dt; }
      i[k] = (!on[k] && ni * i[k] < 0) ? 0 : ni;               // diode stops conduction at zero
      if (!on[k] && node[k] > 0) iP += i[k];
      if (!on[k] && node[k] < 0) iN += i[k];
    }
    if (F) {                                                   // filter states (symplectic: currents, then node voltages)
      for (let k = 0; k < 3; k++) iG[k] += (vg[k] - v1[k] - F.Rg * iG[k]) / (F.Lg + F.Llk) * dt;
      sub3(iG);
      let nu = 0, de = 0;
      for (let k = 0; k < 3; k++) {
        LF[k] = F.Llk + F.d6.L0 * 1e-6 / (1 + F.d6.roll[0] * Math.pow(Math.max(F.d6.roll[2] * Math.abs(iF[k]) / 79.577, 1e-9), F.d6.roll[1]));
        nu += (v1[k] - v2[k] - F.Rf * iF[k]) / LF[k]; de += 1 / LF[k];
      }
      for (let k = 0; k < 3; k++) iF[k] += (v1[k] - v2[k] - F.Rf * iF[k] - nu / de) / LF[k] * dt;
      for (let k = 0; k < 3; k++) {
        const id = F.Cd ? (v2[k] - vd[k]) / (F.Rd / 3) : 0;
        if (F.Cd) vd[k] += id / (3 * F.Cd) * dt;
        if (s >= nTot - nPer) pDamp += id * id * (F.Rd / 3);
        v1[k] += (iG[k] - iF[k]) / (3 * F.C1) * dt;
        v2[k] += (iF[k] - i[k] - id) / (3 * F.C2) * dt;
        vm[k] += (v2[k] - vm[k]) * dt / F.tauV;
      }
      sub3(v1); sub3(v2); sub3(vd); sub3(vm);
    }
    const iLoad = Pin / (Vp + Vn);
    Vp += (iP - iLoad) / d.cHalf * dt;
    Vn += (-iLoad - iN) / d.cHalf * dt;
    // ---- records (last cycle)
    if (s >= recStart) {
      rec.n++;
      rec.vMN = Math.max(rec.vMN, Math.abs(vMN));
      for (let k = 0; k < 3; k++) rec.vSw = Math.max(rec.vSw, Math.abs(blocked[k] ? vg[k] : node[k] + vMN));   // switch end vs grid neutral
      for (let k = 0; k < 3; k++) {
        rec.pk[k] = Math.max(rec.pk[k], Math.abs(i[k]));
        rec.sq[k] += i[k] * i[k];
        rec.re[k] += i[k] * Math.cos(W * t - 2 * Math.PI / 3 * [0, 1, -1][k]);
        rec.im[k] += i[k] * Math.sin(W * t - 2 * Math.PI / 3 * [0, 1, -1][k]);
      }
      if (on[0]) rec.swSq += i[0] * i[0];
      else if (node[0] > 0) { rec.dAvg += i[0]; rec.dSq += i[0] * i[0]; rec.dPk = Math.max(rec.dPk, i[0]); }
      rec.err += (i[0] - (G0 + Gint) * vg[0]) ** 2;
      rec.vbMin = Math.min(rec.vbMin, Vp + Vn); rec.vbMax = Math.max(rec.vbMax, Vp + Vn);
      rec.mid = Math.max(rec.mid, Math.abs(Vp - Vn));
      if (s % Math.round(10e-6 / dt) === 0 && hIdx < iHist.length) { gHist[hIdx] = iG[0]; iHist[hIdx++] = i[0]; }
      if (s % Math.round(1e-6 / dt) === 0 && fIdx < iHf.length) iHf[fIdx++] = i[0];
    }
  }
  const n = rec.n;
  const i1 = [0, 1, 2].map((k) => 2 * Math.hypot(rec.re[k], rec.im[k]) / n);
  let h1 = 0, hh = 0;
  for (let h = 1; h <= 40; h++) {
    let a = 0, b = 0;
    for (let j = 0; j < hIdx; j++) { const w = 2 * Math.PI * h * j / hIdx; a += iHist[j] * Math.cos(w); b += iHist[j] * Math.sin(w); }
    const amp = Math.hypot(a, b);
    if (h === 1) h1 = amp; else hh += amp * amp;
  }
  // 150 kHz band (9 kHz RBW, 145.5–154.5 kHz): RMS of the line-cycle-resolved spectrum, as a peak-equivalent
  let band = 0;
  for (let fq = 145500; fq <= 154500; fq += 50) {
    let a = 0, b = 0;
    for (let j = 0; j < fIdx; j++) { const w = 2 * Math.PI * fq * j * 1e-6; a += iHf[j] * Math.cos(w); b += iHf[j] * Math.sin(w); }
    band += (2 * Math.hypot(a, b) / fIdx) ** 2 / 2;
  }
  // E65: sustained-oscillation detector — grid-current content between h40 (2 kHz) and h900 (45 kHz) of the last line
  // cycle against the fundamental; the filter/loop modes sit at 3–25 kHz, a stable loop leaves only PWM residue there
  let g1 = 0, gh = 0;
  if (F) for (let h = 1; h < 900; h = h === 1 ? 40 : h + 1) {
    let a = 0, b = 0;
    for (let j = 0; j < hIdx; j++) { const w = 2 * Math.PI * h * j / hIdx; a += gHist[j] * Math.cos(w); b += gHist[j] * Math.sin(w); }
    if (h === 1) g1 = a * a + b * b; else gh += a * a + b * b;
  }
  return {
    oscPct: F ? 100 * Math.sqrt(gh / g1) : 0, pDamp: F ? pDamp / nPer : 0,
    VLL, vbus, lot, Pout, band150pk: Math.sqrt(band) * Math.SQRT2, Irms: Math.sqrt(rec.sq[0] / n), I1pk: Math.max(...i1), Ipk: Math.max(...rec.pk),
    ripHalf: Math.max(...rec.pk) - Math.max(...i1), Isw: Math.sqrt(rec.swSq / n), Id: { avg: rec.dAvg / n, rms: Math.sqrt(rec.dSq / n), pk: rec.dPk },
    L_at_pk: Ld1(d, Math.max(...rec.pk), lot), thd: 100 * Math.sqrt(hh) / h1, track: Math.sqrt(rec.err / n) / (Math.max(...i1) / Math.SQRT2),
    clipPct: 100 * rec.clip / (n / 400), vbusMin: rec.vbMin, vbusMax: rec.vbMax, midDev: rec.mid,
    Ihf: Math.sqrt(Math.max(0, rec.sq[0] / n - (2 * Math.hypot(rec.re[0], rec.im[0]) / n) ** 2 / 2)), dBpp: fx.dBmax,
    PfeW: fx.E / fx.T * CORES.T79.Ve * d.stack, vMNpk: rec.vMN, vSwNpk: rec.vSw,
  };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const floor = (VLL) => Math.min(830, Math.max(650, 1.08 * Math.SQRT2 * VLL));
  const EV = [
    ["330-full-dip70-10ms-recovery", { VLL: 330, vbus: 830, lot: 0.92, cycles: 6, event: { type: "dip", t0: 0.060, t1: 0.070, depth: 0.7 } }, "IEC 61000-4-11-class 30 % dip, 10 ms, recovery at the crest-worst corner"],
    ["330-full-jump20deg", { VLL: 330, vbus: 830, lot: 0.92, cycles: 6, event: { type: "jump", t0: 0.0625, deg: 20 } }, "20° phase jump at the crest (weak-grid switching event)"],
    ["330-full-dip50-5ms-recovery", { VLL: 330, vbus: 830, lot: 0.92, cycles: 6, event: { type: "dip", t0: 0.0605, t1: 0.0655, depth: 0.5 } }, "50 % dip, 5 ms, recovery mid-slope"],
  ];
  const CASES = [
    ["330-full-bus830-lot92", { VLL: 330, vbus: 830, lot: 0.92 }, "worst ripple + softest lot (F.01 basis)"],
    ["330-full-bus800-nom", { VLL: 330, vbus: 800, lot: 1 }, "design point (pack operating row)"],
    ["400-full-bus830-nom", { VLL: 400, vbus: 830, lot: 1 }, "E65 rated point (loss budget: 400 VAC, bank 400 V puts the bus at the 830 V cap)"],
    ["285-derated-bus650", { VLL: 285, vbus: 650, lot: 0.92, pf: 285 / 330 }, "low-line derate floor"],
    ["475-full-bus650", { VLL: 475, vbus: 650, lot: 1 }, "AS-IS policy at high line: bus BELOW line-line peak 672 V"],
    ["475-full-busFloor", { VLL: 475, lot: 1, fix: true }, "E60 line-tracking floor 1.08·√2·VLL"],
    ["500-full-bus650", { VLL: 500, vbus: 650, lot: 1 }, "F.07 edge, AS-IS: 707 V line peak"],
    ["500-full-busFloor", { VLL: 500, lot: 1, fix: true }, "F.07 edge with the floor"],
  ];
  const rows = [["sku", "case", "VLL", "bus_V", "lot_AL", "Pout_W", "Irms_A", "I1pk_A", "Ipk_A", "ripple_half_A", "L_at_pk_uH", "Isw_rms_A", "Id_avg_A", "Id_rms_A", "Id_pk_A", "THD40_pct", "track_err", "overmod_pct", "vbus_min", "vbus_max", "mid_dev_V", "band150_pk_A", "lisn_basis_150_pk_A", "Ihf_rms_A", "dBpp_max_mT", "Pfe_igse_W", "vMN_pk_V", "vSwN_pk_V", "note"]];
  const LISN_DIPP = { "30kw": 21.4, "40kw": 28.0, "50kw": 34.8 };   // lisn-precompliance/dm-choke-design triangular ripple basis
  for (const sku of Object.keys(D1)) for (const [tag, c, note] of [...CASES, ...EV]) {
    const vbus = c.fix ? floor(c.VLL) : c.vbus;
    const r = vienna(sku, { VLL: c.VLL, vbus, lot: c.lot, Pout: D1[sku].P * (c.pf ?? 1), cycles: c.cycles ?? 4, event: c.event ?? null });
    rows.push([sku, tag, c.VLL, f(vbus, 0), c.lot, f(r.Pout, 0), f(r.Irms), f(r.I1pk), f(r.Ipk), f(r.ripHalf), f(r.L_at_pk * 1e6), f(r.Isw), f(r.Id.avg), f(r.Id.rms), f(r.Id.pk), f(r.thd, 2), f(r.track, 3), f(r.clipPct, 1), f(r.vbusMin, 0), f(r.vbusMax, 0), f(r.midDev, 1), f(r.band150pk, 3), f(4 * LISN_DIPP[sku] / (Math.PI ** 2 * 9), 3), f(r.Ihf, 2), f(r.dBpp * 1e3, 1), f(r.PfeW, 2), f(r.vMNpk, 0), f(r.vSwNpk, 0), `"${note}"`]);
    console.log(`${sku} ${tag.padEnd(24)} Irms ${f(r.Irms)} · I1pk ${f(r.I1pk)} · Ipk ${f(r.Ipk)} A (ripple/2 ${f(r.ripHalf)}; L@pk ${f(r.L_at_pk * 1e6)} µH) · sw ${f(r.Isw)} · diode avg ${f(r.Id.avg)}/pk ${f(r.Id.pk)} · THD ${f(r.thd, 2)}% · overmod ${f(r.clipPct, 1)}% · mid ${f(r.midDev, 1)} V · 150 kHz band ${f(r.band150pk, 3)} A pk-eq vs LISN basis ${f(4 * LISN_DIPP[sku] / (Math.PI ** 2 * 9), 3)} · D1 ripple ${f(r.Ihf, 2)} A rms, ΔB ${f(r.dBpp * 1e3, 1)} mT pp, Fe ${f(r.PfeW, 2)} W · switch end ${f(r.vSwNpk, 0)} V pk to N`);
  }
  writeFileSync(join(OUT, "vienna-switched.csv"), "# E60 cycle-by-cycle Vienna (calculations/pfc/vienna-switched.mjs): ideal devices, catalog 26µ L(i), stiff grid; E65 D1 excitation (ripple rms, iGSE Kool Mµ 26, switch-end peak)\n" + rows.map((r) => r.join(",")).join("\n") + "\n");
  console.log("→ calculations/out/vienna-switched.csv");
}
