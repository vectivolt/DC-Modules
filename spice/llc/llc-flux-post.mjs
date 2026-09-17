// llc-flux-post.mjs — turn the power-solved LLC waveforms into a committed magnetics excitation table.
//
// The ngspice .out files are git-ignored (tens of MB); the magnetics gates must not depend on them. This
// post-processor reads the waveform of every simulated corner (llc-stress.csv + llc-envelope.csv) and writes
// simulation-results/<sku>/llc-flux.csv carrying, per corner:
//   · Im_pk / Im_pp — primary-referred magnetizing current (full bridge: im = ip − (isa + isb)/n) → D3 flux is Lm·im/(Np·Ae)
//   · k_igse_D3     — iGSE core-loss factor of the SIMULATED magnetizing-flux waveform relative to a sinusoid of
//                     the same peak and frequency (Venkatachalam et al., COMPEL 2002; α 1.55, β 2.8 — the local
//                     N95/PC95 exponents at 80–180 kHz, 100–250 mT from the TDK N95 curves)
//   · k_igse_D2     — the same for the tank current (D2 external Lr flux follows ip)
// The waveform SHAPE factor is independent of N·Ae, so a core or turns change never needs a re-simulation;
// only a tank change does, and the tank fingerprint in the header catches that (magnetics-envelope gate).
// Run after llc-run.mjs / llc-envelope.mjs:  node spice/llc/llc-flux-post.mjs [sku ...]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TANKS, fingerprint } from "../../calculations/llc/tanks.mjs";
import { TOL } from "./llc-run.mjs";
import { inputStamp } from "../run.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
export const ALPHA = 1.55, BETA = 2.8;
// peak |Ip| a kill of `killUs` µs after |Ip| first crosses `thr` (committed llc-short.csv envelope). F.11 is a WINDOW
// comparator (both polarities) diode-ORed onto HRTIMER_FLT2 — 1 µs covers the 220 ns front-end RC, the 40 ns comparator,
// the fault input, the driver and the SiC fall with margin
export const F11_KILL_US = 1.0;
// the HRTIMER fault filter (0b0011) + comparator ~50 ns + driver ~60 ns + t_d,off ~50 ns makes the REAL kill
// path ≈ 0.3 µs, so 0.5 µs is the budgeted window and 1 µs the conservative one; 3 µs is the observability (ADC-rail) window.
// llc-short.csv now carries all three as columns, so a consumer never has to walk the envelope twice.
export const F11_FAST_US = 0.5, F11_MON_US = 3.0;
export const KILL_COLS = [F11_FAST_US, F11_KILL_US, F11_MON_US];
export const shortRacePeak = (sku, thr, killUs = F11_KILL_US) => {
  const env = readFileSync(join(ROOT, `simulation-results/${sku}/llc-short.csv`), "utf8").split("\n").filter((l) => /^\d/.test(l)).map((l) => l.split(",").map(Number));
  const x = env.find(([, ip]) => ip >= thr); if (!x) return { tX: NaN, peak: env.at(-1)[1] };
  const ci = KILL_COLS.indexOf(killUs);
  if (ci >= 0 && x.length > 2 + ci) return { tX: x[0], peak: x[2 + ci] };           // pre-computed column
  return { tX: x[0], peak: (env.find(([t]) => t >= x[0] + killUs) ?? env.at(-1))[1] };   // legacy 2-column fallback
};

const readCsv = (p) => {
  const L = readFileSync(p, "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
  const H = L[0].split(",");
  return L.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [H[i], v])));
};

// iGSE factor of a sampled periodic waveform x(t) (one period T ending at the last sample)
export const igseFactor = (t, x, fsw, alpha = ALPHA, beta = BETA) => {
  const T = 1 / fsw, i0 = t.findIndex((v) => v >= t[t.length - 1] - T);
  let mx = -Infinity, mn = Infinity;
  for (let i = i0; i < t.length; i++) { if (x[i] > mx) mx = x[i]; if (x[i] < mn) mn = x[i]; }
  const pp = mx - mn;
  let acc = 0;
  for (let i = i0 + 1; i < t.length; i++) { const dt = t[i] - t[i - 1]; if (dt > 0) acc += Math.pow(Math.abs((x[i] - x[i - 1]) / dt), alpha) * dt; }
  let ic = 0; const M = 4000;
  for (let k = 0; k < M; k++) ic += Math.pow(Math.abs(Math.cos((2 * Math.PI * k) / M)), alpha) * ((2 * Math.PI) / M);
  const num = (acc / T) * Math.pow(pp, beta - alpha);
  const den = Math.pow(2 * Math.PI, alpha - 1) * ic * Math.pow(2, beta - alpha) * Math.pow(fsw, alpha) * Math.pow(pp / 2, beta);
  return { k: num / den, pk: Math.max(mx, -mn), pp };
};

const parseOut = (file, n) => {
  const t = [], ip = [], im = [], ib = [];
  for (const line of readFileSync(file, "utf8").trim().split("\n")) {
    const p = line.trim().split(/\s+/).map(Number);   // pairs: t ip t isa t isb ... t ibka (llc-run.mjs COLS)
    t.push(p[0]); ip.push(p[1]); im.push(p[1] - (p[3] + p[5]) / n); ib.push(p[21]);
  }
  return { t, ip, im, ib };
};
// AC (ripple) RMS of the bank-A rectifier current — the full bridge has no interleave cancellation; the bank filter
// (film → Lf → electrolytic) is sized to this committed column
const rippleRms = (t, x) => { let s = 0, s2 = 0; const T = t.at(-1) - t[0]; for (let i = 1; i < t.length; i++) { const dt = t[i] - t[i - 1]; s += 0.5 * (x[i] + x[i - 1]) * dt; s2 += 0.5 * (x[i] ** 2 + x[i - 1] ** 2) * dt; } return Math.sqrt(Math.max(s2 / T - (s / T) ** 2, 0)); };

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const skus = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TANKS);
  for (const sku of skus) {
    const corners = [
      ...readCsv(join(ROOT, `simulation-results/${sku}/llc-stress.csv`)).map((r) => ({ src: "stress", tag: r.corner, r })),
      ...(existsSync(join(ROOT, `simulation-results/${sku}/llc-envelope.csv`))
        ? readCsv(join(ROOT, `simulation-results/${sku}/llc-envelope.csv`)).map((r) => ({ src: "envelope", tag: `ENV${r.bank_V}-${Math.round(r.P_frac * 100)}`, r }))
        : []),
    ];
    const out = [["corner", "source", "bank_V", "P_frac", "fsw_kHz", "Im_pk_A", "Im_pp_A", "k_igse_D3", "Ip_pk_A", "k_igse_D2", "Ip_rms_A", "Isec_rms_A", "lm_scale", "Ibank_rip_A"]];
    let missing = 0;
    for (const { src, tag, r } of corners) {
      const file = join(ROOT, `spice/generated/llc-${sku}-${tag}.out`);
      if (!existsSync(file)) { missing++; console.log(`  MISSING waveform ${file} — re-run the runner for ${sku}`); continue; }
      const w = parseOut(file, TANKS[sku].n), fsw = Number(r.fsw_kHz) * 1e3;
      const d3 = igseFactor(w.t, w.im, fsw), d2 = igseFactor(w.t, w.ip, fsw);
      const lmScale = /tolLo|gainWorst/.test(tag) ? TOL.lo.lm : /tolHi/.test(tag) ? TOL.hi.lm : 1;   // deck tolerance on Lm
      out.push([tag, src, r.bank_V, src === "stress" ? 1 : r.P_frac, r.fsw_kHz, d3.pk.toFixed(2), d3.pp.toFixed(2), d3.k.toFixed(3), d2.pk.toFixed(2), d2.k.toFixed(3), r.Ip_rms_A, r.Isec_rms_A, lmScale, rippleRms(w.t, w.ib).toFixed(2)]);
    }
    if (missing) { console.log(`${sku}: ${missing} waveform(s) missing — llc-flux.csv NOT written`); process.exitCode = 1; continue; }
    // the internal-short race as a committed running-max envelope of |Ip| after the bank collapse at 300 µs —
    // current-coordination measures its 3 µs kill window from the F.11 CROSSING on this trace. Sampling at fixed
    // times after the short instead under-reads the 30/40 kW peaks by 17–21 A.
    const sf = join(ROOT, `spice/generated/llc-${sku}-internal-short.out`);
    if (existsSync(sf)) {
      const env = [["t_after_short_us", "ip_abs_runmax_A", ...KILL_COLS.map((u) => `ip_plus${u}us_A`)]];
      const pts = readFileSync(sf, "utf8").trim().split("\n").map((l) => l.trim().split(/\s+/).map(Number));
      const runMax = (us) => { const tEnd = 300e-6 + us * 1e-6; let m = 0; for (const p of pts) if (p[0] >= 300e-6 && p[0] <= tEnd) m = Math.max(m, Math.abs(p[1])); return m; };
      for (let k = 0; k <= 200; k++) {
        const us = k * 0.05;
        env.push([us.toFixed(2), runMax(us).toFixed(2), ...KILL_COLS.map((u) => runMax(us + u).toFixed(2))]);
      }
      writeFileSync(join(ROOT, `simulation-results/${sku}/llc-short.csv`), `# internal-short |Ip| running max after the 300 µs bank collapse; ${fingerprint(sku)}\n# ip_plusNus_A = the running max N µs LATER — the kill-path budgets (0.5 µs real, 1 µs conservative, 3 µs observability)\n# inputs ${inputStamp([`spice/generated/llc-${sku}-*.cir`])}\n` + env.map((x) => x.join(",")).join("\n") + "\n");
    } else { console.log(`  MISSING ${sf} — llc-short.csv not written`); process.exitCode = 1; }
    writeFileSync(join(ROOT, `simulation-results/${sku}/llc-flux.csv`),
      `# magnetics excitation from ngspice waveforms; ${fingerprint(sku)}; iGSE alpha ${ALPHA} beta ${BETA}\n# inputs ${inputStamp([`spice/generated/llc-${sku}-*.cir`])}\n` + out.map((x) => x.join(",")).join("\n") + "\n");
    const worst = out.slice(1).reduce((a, x) => (Number(x[5]) > Number(a[5]) ? x : a));
    console.log(`${sku}: ${out.length - 1} corners → simulation-results/${sku}/llc-flux.csv · worst Im ${worst[5]} A at ${worst[0]} (${worst[4]} kHz, k_iGSE ${worst[7]})`);
  }
}
