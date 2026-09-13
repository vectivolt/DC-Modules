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
// Fidelity: devices ideal (no Rds/Vf, no dead time), control is a reference implementation (the HAL
// is not in this repo) — peaks, ripple and device current SHAPES are what this level proves.
// Run: node calculations/pfc/vienna-switched.mjs            (→ calculations/out/vienna-switched.csv)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

// event: { type: "dip", t0, t1, depth } (grid amplitude × depth between t0..t1) | { type: "jump", t0, deg }
export function vienna(sku, { VLL, Pout, vbus, lot = 1, fsw = 50e3, cycles = 4, Rg = 0.01, event = null, clamp = 1.05 }) {
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
  const rec = { pk: [0, 0, 0], sq: [0, 0, 0], swSq: 0, dAvg: 0, dSq: 0, dPk: 0, clip: 0, n: 0, re: [0, 0, 0], im: [0, 0, 0], err: 0, vbMin: 1e9, vbMax: 0, mid: 0, hsum: 0 };
  const iHist = new Float64Array(2000);                        // resampled phase-A current for THD
  const iHf = new Float64Array(20000);                         // 1 MHz samples for the 150 kHz CISPR-band content
  let hIdx = 0, fIdx = 0;
  for (let s = 0; s < nTot; s++) {
    const t = s * dt;
    const amp = event?.type === "dip" && t >= event.t0 && t < event.t1 ? Vpk * event.depth : Vpk;
    const ph = event?.type === "jump" && t >= event.t0 ? event.deg * Math.PI / 180 : 0;
    const vg = [amp * Math.sin(W * t + ph), amp * Math.sin(W * t + ph - 2 * Math.PI / 3), amp * Math.sin(W * t + ph + 2 * Math.PI / 3)];
    // ---- control update at carrier peak and valley (regular sampling, 2×fsw)
    if (s % 400 === 0) {
      const e = vbus - (Vp + Vn);
      Gint += 0.02 * e * (Ts / 2) * G0;                         // voltage PI (slow, ~15 Hz class)
      const Gmax = Iclamp / Math.max(amp, 1);
      if (Gint > Gmax - G0) Gint = Gmax - G0;                   // anti-windup at the clamp
      const G = Math.min(G0 * (1 + 0.004 * e) + Gint, Gmax);
      const vs = [0, 0, 0];
      for (let k = 0; k < 3; k++) vs[k] = vg[k] - Kpi * (G * vg[k] - i[k]);
      const v0 = -(Math.max(...vs) + Math.min(...vs)) / 2 - 0.5 * (Vp - Vn);
      for (let k = 0; k < 3; k++) {
        const v = vs[k] + v0, pos = (Math.abs(i[k]) > 0.5 ? i[k] : G * vg[k]) >= 0;
        let mk = pos ? v / Vp : -v / Vn;
        if (mk > 1) { mk = 1; if (s >= nTot - nPer) rec.clip++; }
        m[k] = Math.max(0, mk);
      }
    }
    const car = (s % 800) / 800, tri = car < 0.5 ? 2 * car : 2 - 2 * car;
    // ---- leg states: switch OFF (node at a rail) while carrier below the modulation fraction
    let num = 0, den = 0;
    for (let k = 0; k < 3; k++) {
      on[k] = tri >= m[k];
      const L = Ld1(d, i[k], lot);
      if (on[k]) { node[k] = 0; blocked[k] = false; }
      else if (i[k] > 0) { node[k] = Vp; blocked[k] = false; }
      else if (i[k] < 0) { node[k] = -Vn; blocked[k] = false; }
      else blocked[k] = true;
      if (!blocked[k]) { num += (vg[k] - Rg * i[k] - node[k]) / L; den += 1 / L; }
    }
    vMN = den > 0 ? num / den : 0;
    // un-block a DCM phase whose diode becomes forward-biased
    for (let k = 0; k < 3; k++) if (blocked[k]) {
      const vd = vg[k] - vMN;
      if (vd > Vp || vd < -Vn) { node[k] = vd > Vp ? Vp : -Vn; blocked[k] = false; const L = Ld1(d, 0, lot); num += (vg[k] - node[k]) / L; den += 1 / L; vMN = num / den; }
    }
    let iP = 0, iN = 0;
    for (let k = 0; k < 3; k++) {
      if (blocked[k]) continue;
      const L = Ld1(d, i[k], lot);
      const ni = i[k] + (vg[k] - Rg * i[k] - node[k] - vMN) / L * dt;
      i[k] = (!on[k] && ni * i[k] < 0) ? 0 : ni;               // diode stops conduction at zero
      if (!on[k] && node[k] > 0) iP += i[k];
      if (!on[k] && node[k] < 0) iN += i[k];
    }
    const iLoad = Pin / (Vp + Vn);
    Vp += (iP - iLoad) / d.cHalf * dt;
    Vn += (-iLoad - iN) / d.cHalf * dt;
    // ---- records (last cycle)
    if (s >= (event ? Math.round((event.t0 - 0.005) / dt) : nTot - nPer)) {
      rec.n++;
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
      if (s % Math.round(10e-6 / dt) === 0 && hIdx < iHist.length) iHist[hIdx++] = i[0];
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
  return {
    VLL, vbus, lot, Pout, band150pk: Math.sqrt(band) * Math.SQRT2, Irms: Math.sqrt(rec.sq[0] / n), I1pk: Math.max(...i1), Ipk: Math.max(...rec.pk),
    ripHalf: Math.max(...rec.pk) - Math.max(...i1), Isw: Math.sqrt(rec.swSq / n), Id: { avg: rec.dAvg / n, rms: Math.sqrt(rec.dSq / n), pk: rec.dPk },
    L_at_pk: Ld1(d, Math.max(...rec.pk), lot), thd: 100 * Math.sqrt(hh) / h1, track: Math.sqrt(rec.err / n) / (Math.max(...i1) / Math.SQRT2),
    clipPct: 100 * rec.clip / (n / 400), vbusMin: rec.vbMin, vbusMax: rec.vbMax, midDev: rec.mid,
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
    ["285-derated-bus650", { VLL: 285, vbus: 650, lot: 0.92, pf: 285 / 330 }, "low-line derate floor"],
    ["475-full-bus650", { VLL: 475, vbus: 650, lot: 1 }, "AS-IS policy at high line: bus BELOW line-line peak 672 V"],
    ["475-full-busFloor", { VLL: 475, lot: 1, fix: true }, "E60 line-tracking floor 1.08·√2·VLL"],
    ["500-full-bus650", { VLL: 500, vbus: 650, lot: 1 }, "F.07 edge, AS-IS: 707 V line peak"],
    ["500-full-busFloor", { VLL: 500, lot: 1, fix: true }, "F.07 edge with the floor"],
  ];
  const rows = [["sku", "case", "VLL", "bus_V", "lot_AL", "Pout_W", "Irms_A", "I1pk_A", "Ipk_A", "ripple_half_A", "L_at_pk_uH", "Isw_rms_A", "Id_avg_A", "Id_rms_A", "Id_pk_A", "THD40_pct", "track_err", "overmod_pct", "vbus_min", "vbus_max", "mid_dev_V", "band150_pk_A", "lisn_basis_150_pk_A", "note"]];
  const LISN_DIPP = { "30kw": 21.4, "40kw": 28.0, "50kw": 34.8 };   // lisn-precompliance/dm-choke-design triangular ripple basis
  for (const sku of Object.keys(D1)) for (const [tag, c, note] of [...CASES, ...EV]) {
    const vbus = c.fix ? floor(c.VLL) : c.vbus;
    const r = vienna(sku, { VLL: c.VLL, vbus, lot: c.lot, Pout: D1[sku].P * (c.pf ?? 1), cycles: c.cycles ?? 4, event: c.event ?? null });
    rows.push([sku, tag, c.VLL, f(vbus, 0), c.lot, f(r.Pout, 0), f(r.Irms), f(r.I1pk), f(r.Ipk), f(r.ripHalf), f(r.L_at_pk * 1e6), f(r.Isw), f(r.Id.avg), f(r.Id.rms), f(r.Id.pk), f(r.thd, 2), f(r.track, 3), f(r.clipPct, 1), f(r.vbusMin, 0), f(r.vbusMax, 0), f(r.midDev, 1), f(r.band150pk, 3), f(4 * LISN_DIPP[sku] / (Math.PI ** 2 * 9), 3), `"${note}"`]);
    console.log(`${sku} ${tag.padEnd(24)} Irms ${f(r.Irms)} · I1pk ${f(r.I1pk)} · Ipk ${f(r.Ipk)} A (ripple/2 ${f(r.ripHalf)}; L@pk ${f(r.L_at_pk * 1e6)} µH) · sw ${f(r.Isw)} · diode avg ${f(r.Id.avg)}/pk ${f(r.Id.pk)} · THD ${f(r.thd, 2)}% · overmod ${f(r.clipPct, 1)}% · mid ${f(r.midDev, 1)} V · 150 kHz band ${f(r.band150pk, 3)} A pk-eq vs LISN basis ${f(4 * LISN_DIPP[sku] / (Math.PI ** 2 * 9), 3)}`);
  }
  writeFileSync(join(OUT, "vienna-switched.csv"), "# E60 cycle-by-cycle Vienna (calculations/pfc/vienna-switched.mjs): ideal devices, catalog 26µ L(i), stiff grid\n" + rows.map((r) => r.join(",")).join("\n") + "\n");
  console.log("→ calculations/out/vienna-switched.csv");
}
