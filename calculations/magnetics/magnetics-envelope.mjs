#!/usr/bin/env node
// magnetics-envelope.mjs — E65 standing gate: every LLC magnetic (D3 transformer, D2 trim inductor) evaluated at
// EVERY power-solved simulated corner — the 14 E60 stress corners and the 20-point E65 bank-voltage × load
// envelope — instead of at resonance.
//
// Why it exists: all D3 flux and core-loss checks were pinned to the resonant point (140 kHz, 415 V half-cycle →
// 108/90/109 mT). The decks run 77–88 kHz at bank 500–525 V (gain 1.2–1.27 with the bus capped at 830 V), where
// D3 flux is 1.5–2.2× that and ferrite loss 2–3×; the flux follows bank voltage, not load (it persists at zero
// load), so a power derate cannot relieve it. Independently verified at E65 (3 skeptic lenses, raw waveforms).
//
// Chain, all from committed data:
//   excitation   simulation-results/<sku>/llc-flux.csv (spice/llc/llc-flux-post.mjs) — Im_pk, Ip_pk, and iGSE
//                waveform factors of the SIMULATED flux; tank fingerprint must match calculations/llc/tanks.mjs
//   geometry     calculations/magnetics/geometry.mjs (IEC shapes from OpenMagnetics/MAS, catalog Ae/Ve, former lN)
//   material     N95 (PC95/3C95 class) sine loss = max(TDK datasheet surface, OpenMagnetics MAS Steinmetz(T)) ×
//                LEA-measured calibration (materialdatabase N95, TU Paderborn) — magnetics-data.json
//   copper       winding-physics.mjs: Sullivan litz (primary k 0.25, trim k 1), Dowell foil — at each corner's fsw
//   thermal      equilibrium with temperature-dependent loss; runaway T_crit where loop gain = 1
// Criteria (proper margin, not over-engineering): hot-spot ≤125 °C at 55 °C inlet full power and ≤135 °C at 75 °C
// inlet derated (Fe does NOT derate — flux is volt-second pinned), stable with ≥25 K runaway margin at +25 % Rth,
// B̂ ≤50 % of Bsat at the hot temperature.
// Run: node calculations/magnetics/magnetics-envelope.mjs            (in run-all after conductor-audit)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DATA, CORES, stack, eTurn, FORMER_WALL } from "./geometry.mjs";
import { rho, delta, dowell, litzFr, leakageSPS } from "./winding-physics.mjs";
import { fingerprint, TANKS } from "../llc/tanks.mjs";
import { mechLines } from "../cost/parts-db.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const f = (x, d = 1) => Number(x.toFixed(d));
let fails = 0;
const ck = (sec, name, cond, detail) => { console.log(`${cond ? "  ok  " : "  FAIL"}  [${sec}] ${name} — ${detail}`); if (!cond) fails++; };

// ---------------- material: N95-class sine loss surface ----------------
const N95 = DATA.N95;
const lerp = (pts, x) => { let i = 1; while (i < pts.length - 1 && pts[i][0] < x) i++; const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); };
const loglerp = (pts, x) => Math.exp(lerp(pts.map(([a, b]) => [Math.log(a), Math.log(b)]), Math.log(x)));
const F100 = Object.fromEntries(Object.entries(N95.pv_over_f_at_100C).map(([k, v]) => [Number(k), v]));
const TS = Object.fromEntries(Object.entries(N95.pv_over_T_at_100kHz).map(([k, v]) => [Number(k), v]));
const datasheet100 = (fq, B) => {
  if (B >= 0.2) return loglerp(F100[0.2], fq) * Math.pow(B / 0.2, N95.beta_above_200mT);
  const lo = B >= 0.1 ? 0.1 : 0.05, hi = B >= 0.1 ? 0.2 : 0.1, Bc = Math.max(B, 0.02);
  const pl = loglerp(F100[lo], fq), ph = loglerp(F100[hi], fq);
  return Math.exp(Math.log(pl) + ((Math.log(ph) - Math.log(pl)) * Math.log(Bc / lo)) / Math.log(hi / lo));
};
const tShape = (B, T) => {
  const p = TS[B >= 0.15 ? 0.2 : B >= 0.075 ? 0.1 : 0.05];
  const at = (x) => (x <= p.at(-1)[0] ? lerp(p, x) : p.at(-1)[1] + ((p.at(-1)[1] - p.at(-2)[1]) / (p.at(-1)[0] - p.at(-2)[0])) * (x - p.at(-1)[0]));
  return at(T) / at(100);
};
const masSteinmetz = (fq, B, T) => {                     // OpenMagnetics MKF form: k f^α B^β (ct2 T² − ct1 T + ct0)
  const r = N95.MAS_steinmetz.find((x) => fq >= x.minimumFrequency && fq <= x.maximumFrequency) ?? N95.MAS_steinmetz.at(-1);
  return r.k * Math.pow(fq, r.alpha) * Math.pow(B, r.beta) * Math.max(0.2, r.ct2 * T * T - r.ct1 * T + r.ct0);
};
export const CAL = 1.14;   // LEA-measured N95 / datasheet model in the high-flux window (≥150 mT, 70–130 kHz); broad window 1.04, worst 1.21
export const pvSine = (fq, B, T) => CAL * Math.max(datasheet100(fq, B) * tShape(B, T), masSteinmetz(fq, B, T));
const BsatAt = (T) => N95.Bsat_T_25C + ((N95.Bsat_T_100C - N95.Bsat_T_25C) / 75) * (T - 25);

// ---------------- thermal model: two-node network (core, winding) from the real geometry ----------------
// E65 rev: a lumped part-to-wall resistance hid the two real bottlenecks (independent verifier network): ferrite conducts
// only ~4 W/mK through a 66 mm set height, and the winding reaches the core only through its former and its own build.
//   core → wall   ferrite column to the bonded yoke face(s): uniform generation, max-point ΔT = P·L/(2kA) one face,
//                 P·L/(8kA) both faces (A = leg area; the Lm/trim gap blocks the centre leg for a one-face bond) + gap pad
//   core → air    forced convection on the unbonded, uncovered faces (air SKUs; h = 24√(v/2.5) + 5 W/m²K)
//   winding → core  build conduction (vacuum-impregnated: both faces, k 0.6; dry: inner face only, k 0.15) + former
//                 (1.2 mm, k 0.3) ∥ resin fill to the outer legs
//   winding → air end turns outside the stack
// Wall: liquid plate 65 °C; air-SKU extrusion web = inlet + 5 + 20·load (thermal-report 20 K sink rise). Air = inlet + 10·load.
const K = { fe: 4.0, pad: 3.0, tPad: 0.5e-3, former: 0.3, tFormer: 1.2e-3, wImp: 0.6, wDry: 0.15, resin: 0.4, pot: 0.8, tPot: 5e-3 };
export const network = (part, c, s, mount, v, impregnated = true) => {
  const d = CORES[c.core].dims, H = (2 * d.B) / 1000, A = d.A / 1000, D = (c.n * d.C) / 1000;
  const aFace = A * D, faces = /2$/.test(mount) ? 2 : /1$/.test(mount) ? 1 : 0;
  const aCond = faces === 2 ? 2 * s.Ae : s.Ae;                         // one face: far-half centre leg blocked by the gap
  const Rcw = faces ? (faces === 2 ? H / (8 * K.fe * aCond) : H / (2 * K.fe * aCond)) + K.tPad / (K.pad * faces * aFace) : Infinity;
  const h = v > 0 ? 24 * Math.sqrt(v / 2.5) + 5 : 0;
  const aExp = 2 * H * D + (2 - faces) * aFace + 0.5 * 2 * A * H;        // sides + unbonded yoke faces + half the ends (rest under end turns)
  const build = part === "D3" ? 2 * c.N * (c.foil + 0.05e-3) + (c.N * c.cuP) / (0.55 * c.b) + 0.6e-3 + 2 * c.gap
    : (c.strands * Math.PI * c.dS ** 2) / 4 / 0.6 / (c.b / c.N) + 0.3e-3;
  const aIn = 2 * D * c.b, gapFill = Math.max(0.5e-3, s.windowW - K.tFormer - build - (part === "D2" ? 3e-3 : 0));
  const Rf = K.tFormer / ((c.formerK ?? K.former) * aIn);
  const Rwc = impregnated ? build / (8 * K.wImp * aIn) + 1 / (1 / Rf + (K.resin * aIn) / gapFill) : build / (2 * K.wDry * aIn) + Rf;
  const mlt = part === "D3" ? d3Build(c).mltP : d2Mlt(c);
  const aEnd = 2 * c.b * Math.max(0, mlt - 2 * D);                     // end-turn surface outside the stack
  return { Rcw, Gca: h * aExp, Rwc, Gwa: c.pot ? 0 : h * aEnd, Gww: c.pot ? (K.pot * aEnd) / K.tPot : 0, h };
};
const solve2 = (loss, nw, Twall, Tair, cuK, k = 1) => {
  const Rcw = nw.Rcw * k, Rwc = nw.Rwc * k, Gca = nw.Gca / k, Gwa = nw.Gwa / k, Gww = nw.Gww / k;
  let Tc = Tair + 30, Tw = Tair + 30;
  for (let i = 0; i < 600; i++) {
    const nc = (loss.fe(Tc) + (Number.isFinite(Rcw) ? Twall / Rcw : 0) + Tair * Gca + Tw / Rwc) / ((Number.isFinite(Rcw) ? 1 / Rcw : 0) + Gca + 1 / Rwc);
    const nwT = (cuK * loss.cu(Tw) + Tc / Rwc + Tair * Gwa + Twall * Gww) / (1 / Rwc + Gwa + Gww);
    if (nc > 320 || nwT > 320) return { Tc: Infinity, Tw: Infinity, hot: Infinity };
    Tc = 0.6 * Tc + 0.4 * nc; Tw = 0.6 * Tw + 0.4 * nwT;
  }
  return { Tc, Tw, hot: Math.max(Tc, Tw) };
};
// local air velocity at the magnetics scales with the per-SKU airflow need (thermal-report air budget 128/187/245 m³/h)
export const V_AIR = { "30kw": 2.0, "40kw": 2.5, "50kw": 0, "50kwa": 3.2 };
export const wallAt = (sku, Tin, frac) => (sku === "50kw" ? 65 : Tin + 5 + 20 * frac);

// ---------------- the E65 constructions (drawings of record after E65) ----------------
// D3: turns ratio 1:1:1 and Lm 63 µH unchanged from E60 → tank fingerprint and every LLC simulation stay valid.
// Build heights for the leakage estimate: foil turns + 2×25 µm film; compacted TIW-served litz at 0.55 Cu fill + 0.6 mm
// serving; barrier gap = shield foil + tapes. former: TDK B66372B2000 (2-set, lN 230.5 mm) or a 3-set former (lN 293 mm,
// custom — TDK lists 1- and 2-set only; tooling at RFQ).
export const D3 = {
  "30kw": { core: "E70", n: 2, N: 7, cuP: 9.8e-6, strands: 2475, dS: 0.071e-3, foil: 0.10e-3, foilW: 0.028, b: 0.041, gap: 0.3e-3, mount: "web2", pot: false, former: "B66372B2000" },
  "40kw": { core: "E70", n: 2, N: 6, cuP: 13.8e-6, strands: 3486, dS: 0.071e-3, foil: 0.127e-3, foilW: 0.028, b: 0.041, gap: 0.3e-3, mount: "web2", pot: true, former: "B66372B2000" },
  "50kw": { core: "E70", n: 3, N: 5, cuP: 17.3e-6, strands: 4370, dS: 0.071e-3, foil: 0.127e-3, foilW: 0.028, b: 0.041, gap: 0.3e-3, mount: "plate2", pot: true, former: "3-set custom" },
  "50kwa": { core: "E70", n: 3, N: 5, cuP: 17.3e-6, strands: 4370, dS: 0.071e-3, foil: 0.127e-3, foilW: 0.028, b: 0.041, gap: 0.3e-3, mount: "web2", pot: true, former: "3-set custom" },
};
// the E60 drawings as registered — the CONTROL GROUP: this gate must reject them (a gate that cannot fail proves nothing)
export const D3_REGISTERED_E60 = {
  "30kw": { core: "PQ50", n: 3, N: 7, cuP: 9.8e-6, strands: 2475, dS: 0.071e-3, foil: 0.10e-3, foilW: 0.028, b: 0.0304, gap: 0.3e-3, mount: "air" },
  "40kw": { core: "E70", n: 2, N: 6, cuP: 13.8e-6, strands: 3486, dS: 0.071e-3, foil: 0.127e-3, foilW: 0.028, b: 0.041, gap: 0.3e-3, mount: "air" },
  "50kw": { core: "E70", n: 2, N: 5, cuP: 17.3e-6, strands: 4370, dS: 0.071e-3, foil: 0.127e-3, foilW: 0.028, b: 0.041, gap: 0.3e-3, mount: "plate1" },
  "50kwa": { core: "E70", n: 2, N: 5, cuP: 17.3e-6, strands: 4370, dS: 0.071e-3, foil: 0.127e-3, foilW: 0.028, b: 0.041, gap: 0.3e-3, mount: "air" },
};
// D2: carries ~all of Lr (tanks.mjs bins), 0.05 mm compacted litz, single layer ≥3 mm clear of a distributed centre-leg gap
// Every D3/D2: vacuum-impregnated (class H, k ≥0.6 W/mK); mount web2 = BOTH yoke faces gap-padded to the upper and lower
// extrusion webs (the 66 mm stack spans the 62 mm tunnel through the board cut-outs), plate2 = both coldplates; pot = end
// turns encapsulated in ≥0.8 W/mK silicone bridged ≥5 mm to the web/plate
export const D2 = {
  "30kw": { core: "E70", n: 1, N: 8, strands: 6112, dS: 0.05e-3, b: 0.041, mount: "web2", pot: false, former: "B66372B1000" },
  "40kw": { core: "E70", n: 2, N: 5, strands: 8149, dS: 0.05e-3, b: 0.041, mount: "web2", pot: false, former: "B66372B2000" },
  "50kw": { core: "E70", n: 2, N: 5, strands: 8149, dS: 0.05e-3, b: 0.041, mount: "plate2", pot: true, former: "B66372B2000" },
  "50kwa": { core: "E70", n: 2, N: 5, strands: 8149, dS: 0.05e-3, b: 0.041, mount: "web2", pot: false, former: "B66372B2000" },
};
for (const [sku, c] of Object.entries(D2)) c.Lmax = Math.max(...TANKS[sku].bins) * 1e-6;
export const LOOP_STRAY = 0.1e-6;                                  // half-bridge → Cr → D2 → D3 loop on the power PCB (first-article measured)
// radial build of the S1–P–S2 lay-up → per-winding mean turn (production Rdc rows) and leakage
export const d3Build = (c) => {
  const hS = c.N * (c.foil + 0.05e-3), hP = (c.N * c.cuP) / (0.55 * c.b) + 0.6e-3, w = FORMER_WALL;
  return { hS, hP, mltS1: eTurn(c.core, c.n, w + hS / 2), mltP: eTurn(c.core, c.n, w + hS + c.gap + hP / 2), mltS2: eTurn(c.core, c.n, w + hS + 2 * c.gap + hP + hS / 2) };
};
export const d3Leakage = (c) => { const b = d3Build(c); return leakageSPS({ N: c.N, mlt: b.mltP, b: c.b, gap: c.gap, hS: b.hS, hP: b.hP }); };
// D2 single layer of compacted litz (0.6 Cu fill) ≥3 mm clear of the distributed gap
export const d2Mlt = (c) => { const A = (c.strands * Math.PI * c.dS ** 2) / 4, h = A / 0.6 / (c.b / c.N); return eTurn(c.core, c.n, FORMER_WALL + 3e-3 + h / 2); };

// ---------------- excitation (committed, fingerprinted) ----------------
const readCsv = (p) => {
  const raw = readFileSync(p, "utf8").split("\n").filter(Boolean);
  const hdr = raw.find((l) => l.startsWith("#")) ?? "";
  const L = raw.filter((l) => !l.startsWith("#")), H = L[0].split(",");
  return { hdr, rows: L.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [H[i], isNaN(+v) || v === "" ? v : +v]))) };
};
export const excitation = (sku) => {
  const flux = readCsv(join(ROOT, `simulation-results/${sku}/llc-flux.csv`));
  const stress = readCsv(join(ROOT, `simulation-results/${sku}/llc-stress.csv`));
  const env = readCsv(join(ROOT, `simulation-results/${sku}/llc-envelope.csv`));
  const share = Object.fromEntries(stress.rows.map((r) => [r.corner, 1 + Math.max(0, Number(r.share_pct) || 0) / 100]));
  return { fp: flux.hdr.includes(fingerprint(sku)) && stress.hdr.includes(fingerprint(sku)) && env.hdr.includes(fingerprint(sku)),
    aligned: flux.rows.length === stress.rows.length + env.rows.length &&
      stress.rows.every((r) => flux.rows.some((x) => x.corner === r.corner && Math.abs(x.fsw_kHz - r.fsw_kHz) < 0.05)),
    rows: flux.rows.map((r) => ({ ...r, share: share[r.corner] ?? 1 })) };
};

// ---------------- per-part evaluation ----------------
const T_WIND = 100;
export const d3Loss = (sku, c, r) => {
  const s = stack(c.core, c.n), fq = r.fsw_kHz * 1e3;
  const B = (63e-6 * r.lm_scale * r.Im_pk_A) / (c.N * s.Ae);
  const fe = (T) => pvSine(fq, B, T) * r.k_igse_D3 * s.Ve;
  const g = d3Build(c);                                           // E65: per-winding mean turns (S1 inner, P, S2 outer)
  const RpDc = (rho(T_WIND) * c.N * g.mltP) / c.cuP;
  const FrP = litzFr({ fq, T: T_WIND, N: c.N, n: c.strands, d: c.dS, b: c.b, k: 0.25 });
  const RsDc = (rho(T_WIND) * c.N * (g.mltS1 + g.mltS2) / 2) / (c.foil * c.foilW);
  const FrS = dowell((c.foil / delta(fq, T_WIND)) * Math.sqrt(c.foilW / c.b), c.N);
  const Is = r.Isec_rms_A * r.share;
  const cu = (T) => (RpDc * FrP * r.Ip_rms_A ** 2 + 2 * RsDc * FrS * Is ** 2) * (1 + 0.00393 * (T - T_WIND));
  return { s, B, fe, cu, FrP, FrS };
};
export const d2Loss = (sku, c, r) => {
  const s = stack(c.core, c.n), fq = r.fsw_kHz * 1e3;
  const B = (c.Lmax * r.Ip_pk_A) / (c.N * s.Ae);
  const fe = (T) => pvSine(fq, B, T) * r.k_igse_D2 * s.Ve;
  const Rdc = (rho(T_WIND) * c.N * d2Mlt(c)) / ((c.strands * Math.PI * c.dS ** 2) / 4);
  const Fr = litzFr({ fq, T: T_WIND, N: c.N, n: c.strands, d: c.dS, b: c.b, k: 1 });
  const cu = (T) => Rdc * Fr * r.Ip_rms_A ** 2 * (1 + 0.00393 * (T - T_WIND));
  return { s, B, fe, cu, Fr };
};
const tCrit = (loss, nw, k) => {                                      // core loop gain dP/dT · R_core ≥ 1
  const R = 1 / ((Number.isFinite(nw.Rcw) ? 1 / (nw.Rcw * k) : 0) + nw.Gca / k);
  let T = 60; while (T < 260 && R * (loss.fe(T + 1) - loss.fe(T - 1)) / 2 < 1) T++; return T;
};
export const evaluate = (sku, part, c, rows, mountOverride, impregnated = true) => {
  const s = stack(c.core, c.n), mount = mountOverride ?? c.mount;
  const nw = network(part, c, s, mount, V_AIR[sku], impregnated);
  const res = rows.map((r) => {
    const loss = part === "D3" ? d3Loss(sku, c, r) : d2Loss(sku, c, r);
    const frac = r.source === "envelope" ? r.P_frac : 1;
    const cu75 = Math.min(1, (0.4 / frac) ** 2);                  // derated to 40 % power at 75 °C inlet — Cu scales, Fe does not
    const e55 = solve2(loss, nw, wallAt(sku, 55, frac), 55 + 10 * frac, 1), e75 = solve2(loss, nw, wallAt(sku, 75, 0.4), 75 + 4, cu75);
    const st = [solve2(loss, nw, wallAt(sku, 55, frac), 55 + 10 * frac, 1, 1.25), solve2(loss, nw, wallAt(sku, 75, 0.4), 79, cu75, 1.25)];
    const eol = /mismatch/.test(r.corner);                        // EOL sharing reject: flux/saturation corner, never a thermal state
    const Tstress = eol ? 0 : Math.max(st[0].hot, st[1].hot), hot = Math.max(e55.hot, e75.hot), Tcore = Math.max(e55.Tc, e75.Tc);
    return { corner: r.corner, fsw: r.fsw_kHz, B: loss.B, fe100: eol ? 0 : loss.fe(100), cu100: eol ? 0 : loss.cu(100), T55: eol ? 0 : e55.hot, T75: eol ? 0 : e75.hot, Tw55: e55.Tw, Tc55: e55.Tc, Tstress,
      margin: eol ? 999 : tCrit(loss, nw, 1.25) - Math.min(Tcore, 300), bsat: loss.B / BsatAt(Math.min(eol ? 100 : Tcore, 200)) };
  });
  const pick = (key, lo = false) => res.reduce((a, x) => ((lo ? x[key] < a[key] : x[key] > a[key]) ? x : a));
  const w55 = pick("T55"), w75 = pick("T75"), wS = pick("Tstress"), wB = pick("bsat"), wM = pick("margin", true), fe = pick("fe100"), cu = pick("cu100");
  const ok = w55.T55 <= 125 && w75.T75 <= 135 && wS.Tstress <= 155 && wM.margin >= 25 && wB.bsat <= 0.5;
  return { s, nw, mount, w55, w75, wS, wB, wM, fe, cu, ok, res };
};

const T = (x) => (Number.isFinite(x) ? `${f(x, 0)} °C` : "RUNAWAY");
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log("=== MAGNETICS ENVELOPE (E65) — D3 / D2 at every power-solved corner (stress + bank-voltage × load envelope) ===");
  for (const sku of ["30kw", "40kw", "50kw", "50kwa"]) {
    const ex = excitation(sku), t = TANKS[sku];
    ck("DATA", `${sku} excitation table current`, ex.fp && ex.aligned,
      `llc-flux.csv ${ex.rows.length} corners · tank fingerprint ${ex.fp ? "matches" : "STALE — re-run llc-run / llc-envelope / llc-flux-post"} · rows ${ex.aligned ? "aligned with llc-stress + llc-envelope" : "MISALIGNED"}`);
    const k = ex.rows.map((r) => r.k_igse_D3);
    console.log(`  info  [${sku}] iGSE waveform factor D3 ${f(Math.min(...k), 2)}–${f(Math.max(...k), 2)} · D2 ${f(Math.min(...ex.rows.map((r) => r.k_igse_D2)), 2)}–${f(Math.max(...ex.rows.map((r) => r.k_igse_D2)), 2)}`);
    // Lr split: the D2 bins must cover the transformer leakage the construction can actually produce (build spread ×0.5…×2.5)
    const llk = d3Leakage(D3[sku]), lo = 0.5 * llk + LOOP_STRAY, hi = 2.5 * llk + LOOP_STRAY;
    const cover = [t.Lr - Math.max(...t.bins) * 1e-6, t.Lr - Math.min(...t.bins) * 1e-6];
    ck("LR", `${sku} D2 bins cover the real transformer leakage`, lo >= cover[0] - 0.05e-6 && hi <= cover[1] + 0.05e-6,
      `D3 S1–P–S2 leakage ${f(llk * 1e6, 2)} µH computed (build spread ${f(0.5 * llk * 1e6, 2)}–${f(2.5 * llk * 1e6, 2)}) + ${f(LOOP_STRAY * 1e6, 2)} µH loop → ${f(lo * 1e6, 2)}–${f(hi * 1e6, 2)} µH vs bins covering ${f(cover[0] * 1e6, 2)}–${f(cover[1] * 1e6, 2)} µH (Lr ${t.Lr * 1e6} µH)`);
    ck("LR", `${sku} tank table carries the D2 construction`, t.nTrim === D2[sku].N && Math.abs(t.aeTrim - stack(D2[sku].core, D2[sku].n).Ae) < 1e-9,
      `tanks.mjs nTrim ${t.nTrim} / aeTrim ${f(t.aeTrim * 1e6, 0)} mm² vs D2 ${D2[sku].n}×${D2[sku].core} N ${D2[sku].N}`);
    const unprotected = [];
    for (const [part, table] of [["D3", D3], ["D2", D2]]) {
      const c = table[sku], e = evaluate(sku, part, c, ex.rows);
      ck(part, `${sku} ${c.n}×${c.core} ${part === "D3" ? `${c.N}:${c.N}:${c.N}` : `N ${c.N} · ${f(c.Lmax * 1e6, 2)} µH bin-max`} · ${e.mount} · R core→wall ${f(e.nw.Rcw, 2)} · winding→core ${f(e.nw.Rwc, 2)} K/W`, e.ok,
        `core corner ${e.fe.corner} ${e.fe.fsw} kHz B̂ ${f(e.fe.B * 1e3, 0)} mT Fe ${f(e.fe.fe100)} W · copper corner ${e.cu.corner} ${e.cu.fsw} kHz Cu ${f(e.cu.cu100)} W · hot-spot ${T(e.w55.T55)} @55 °C (${e.w55.corner}; core ${T(e.w55.Tc55)} / winding ${T(e.w55.Tw55)}) / ${T(e.w75.T75)} @75 °C derated (${e.w75.corner}) · +25 % Rth ${T(e.wS.Tstress)} · runaway margin ${f(e.wM.margin, 0)} K · B̂ ${f(e.wB.bsat * 100, 0)} % of hot Bsat`);
      // a failed bond: one gap pad delaminated (the credible single failure) — the other face + convection must carry it
      const lost = c.mount.replace(/2$/, "1"), a = evaluate(sku, part, c, ex.rows, lost);
      console.log(`  info  [${part}-BOND-LOST] ${sku}: one face lost (${lost}) → ${T(a.w55.T55)} @55 / ${T(a.w75.T75)} @75 · +25 % ${T(a.wS.Tstress)} → ${a.ok ? "survives" : "NOT survivable — needs the cutout loop"}`);
      if (!a?.ok) unprotected.push(part);
    }
    const loop = (mechLines[sku] ?? []).find(([d]) => /over-temperature cutout/i.test(d));
    ck("BOND", `${sku} bond-loss protection fitted where a part cannot survive one lost gap pad`, !unprotected.length || (loop && loop[1] >= 3 * (D3[sku].mount === "bond") + 3 * (D2[sku].mount === "bond")),
      unprotected.length ? `${unprotected.join(" + ")} need it → parts-db mech line: ${loop ? `"${loop[0].slice(0, 90)}…" × ${loop[1]}` : "MISSING"}` : "every part survives one lost gap pad (loop fitted regardless — one line per SKU)");
    const reg = D3_REGISTERED_E60[sku], er = evaluate(sku, "D3", reg, ex.rows);
    ck("CONTROL", `${sku} gate rejects the E60 D3 as registered (${reg.n}×${reg.core} ${reg.N}:${reg.N}:${reg.N} ${reg.mount})`, !er.ok,
      `hot-spot ${T(er.w55.T55)} @55 / ${T(er.w75.T75)} @75 · Fe ${f(er.fe.fe100)} W at B̂ ${f(er.fe.B * 1e3, 0)} mT · MLT ${f(stack(reg.core, reg.n).mlt * 1e3, 0)} mm → ${er.ok ? "PASSES — the gate is blind" : "rejected"}`);
  }
  console.log(fails ? `\n${fails} MAGNETICS ENVELOPE FAILURE(S)` : "\nMAGNETICS ENVELOPE CLEAN — every D3 and D2 holds temperature, runaway margin and saturation margin at every simulated corner; the Lr split is physical; bond loss is covered");
  process.exit(fails ? 1 : 0);
}
