// d4-flyback.mjs — E65 D4 rev E: the ONE aux-flyback design model. stress-audit (V table + D4 rows), temp-critique
// (BSAT D4) and the aux SPICE deck (spice/aux/aux-flyback.mjs) take every number from here, so a value change moves
// every carrier together.
//
// Why it exists (E65 D4 sweep, verified before implementing): the flux gates assumed Ip = 3.2 A, but the drawn
// NCP1252D sense chain (1 k / 470 pF ∥ the IC's 26.5 k ramp resistor = 453 ns, plus tILIM ≤150 ns) lets the limit
// overshoot to 4.6–5.1 A at 830–860 V → 339–410 mT on ETD39 (113 % of Bsat 130 °C). The RCD clamp diode was a
// 1200 V part blocking Vbus + Vc ≈ 1325 V at the stack-up leakage. The brown-in ignored the IC's IBO hysteresis
// source (369 V, not 321 V). A V24 hard short ratchets the drawn chain far past saturation before the 10–20 ms
// fault latch. Everything below is COMPUTED from the drawn cells.tsx values and the NCP1252/D Table 3 limits; the
// E52 registered design is kept as the control group the gates must reject.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CORES, FORMER_WALL } from "./geometry.mjs";
import { leakageSPS, rho } from "./winding-physics.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// onsemi NCP1252/D Table 3 (min / typ / max; −25…125 °C). IBO printed "mA" in the text extract = µA (eq. 5 example).
export const NCP = {
  vilim: [0.92, 1.0, 1.08], fcs: [0.9, 1.0, 1.1], tLEB: 160e-9, tILIM: [70e-9, 150e-9], tOff: 30e-9,   // + SiC turn-off
  vramp: [3.15, 3.5, 3.85], rramp: 26.5e3, fosc: 0.08, jitter: 0.05, dcMax: 0.442,
  vbo: [0.974, 1.0, 1.026], ibo: [8.8e-6, 10e-6, 11.2e-6], vccOn: [13.1, 14, 14.9], icc1: 100e-6, icc3: 3.5e-3, tFault: [10e-3, 15e-3, 20e-3],
};
export const VBUS_MAX = 860;                          // F.03 bus OVP
export const VLL_START = 285;                         // A4: the module runs (derated) down to 285 VAC → the aux must start there

// per-SKU worst steady aux loads (R2 §J budget; E60 product deltas) — V24 hold → step (relay pull-in + fans 100 %), V15.
// Moved here from the SPICE deck (E65) so the gate and the deck size the same load.
export const SKUS = {
  "30kw": { i24h: 0.7, i24s: 1.6, i15: 1.0 },
  "40kw": { i24h: 0.8, i24s: 2.0, i15: 1.1 },
  "50kw": { i24h: 0.45, i24s: 1.1, i15: 1.1 },
  "50kwa": { i24h: 1.0, i24s: 2.4, i15: 1.2 },
};
export const ETA = 0.88, VF = 0.9, P_VCC = 0.2;       // stage efficiency basis, rectifier drop, controller + drive
export const pinReq = (s) => ((24 + VF) * s.i24s + (15 + VF) * s.i15 + P_VCC) / ETA;

// D4 rev E transformer spec (drawing values — PMP-MAG-D4 rev E) + declared allowances, each with its evidence route
export const D4 = {
  rev: "E", mpn: "XFMR-AUX-FLY-E", core: "ETD44", Np: 38, N24: 6, N15: 4, Naux: 4,
  Lp: 345e-6, tolL: 0.05,        // AL 239 nH/T² gap-ground, 100 % Lp test (±5 % — the flux and fault stacks both need it)
  llkAcc: 4.0e-6,                // P/2–S–P/2 sandwich, all secondaries shorted @10 kHz (1-D estimate ≈2 µH below)
  llkLayout: 1.0e-6,             // V24/V15 rectifier-loop inductance reflected ×n² (≤25 nH V24 loop — layout open item)
  vOvs: 25,                      // clamp overshoot: SiC SBD (no forward recovery) + ~10 nH clamp loop — T-09 scopes it
  rLoopMin: 0.05, vfShort: 0.9,  // hard-short loop: winding + rectifier dynamic ≥30 + board/short ≥10 mΩ — E73: the winding term is computed below
  idmQaux: 10,                   // 1700 V ~1 Ω SiC pulsed-drain class (C2M1000170D-class datasheet 10 A) — VERIFY at RFQ
  pRcla: 2.0, vRcla: 200,        // RCLA per part: 2512 2 W anti-surge, 200 V working (the conservative thick-film class)
  // P/2–S–P/2 build (pack rows): 19 T + 19 T of 0.5 mm grade-2 (OD 0.55) inside 3 mm margins on the 29.5 mm ETD44 former;
  // S24 6 T + S15 4 T TIW 0.8 mm² (OD 1.4) side by side in one layer; Naux 4 T (0.35 mm build) + 0.1 mm tape between
  build: { breadth: 29.5e-3, margin: 3e-3, hHalfP: 0.55e-3, hSec: 1.4e-3, gap: (0.1e-3 + 0.35e-3 + 0.1e-3) / 2 },
};
// 1-D MMF leakage of the sandwich (winding-physics leakageSPS with the primary halves outside, the secondaries in the middle)
export const leakageEstimate = (d = D4) => {
  const b = d.build, F = CORES[d.core].dims.F / 1000;
  const build = 2 * b.hHalfP + b.hSec + 2 * b.gap, mlt = Math.PI * (F + 2 * FORMER_WALL + build);
  return leakageSPS({ N: d.Np, mlt, b: b.breadth - 2 * b.margin, hS: b.hHalfP, hP: b.hSec, gap: b.gap });
};
// E73: the drawn conductors and their DC resistance — the drawing's acceptance rows and the hard-short loop floor read these
// (radial order from the former: P/2 · tape · aux · tape · S24 ∥ S15 side by side · tape · P/2)
export const WIRE = { p: { d: 0.50e-3 }, s24: { a: 0.8e-6 }, s15: { a: 0.8e-6 }, aux: { d: 0.30e-3 } };
export const d4Rdc = (d = D4, T = 25) => {
  const b = d.build, F = CORES[d.core].dims.F / 1000, t = 0.1e-3, hAux = 0.35e-3, mlt = (r) => Math.PI * (F + 2 * FORMER_WALL + 2 * r);
  const area = (w) => w.a ?? (Math.PI * w.d ** 2) / 4;
  const rP1 = b.hHalfP / 2, rAux = b.hHalfP + t + hAux / 2, rS = b.hHalfP + 2 * t + hAux + b.hSec / 2, rP2 = b.hHalfP + 3 * t + hAux + b.hSec + b.hHalfP / 2;
  return { p: (rho(T) * (d.Np / 2) * (mlt(rP1) + mlt(rP2))) / area(WIRE.p), s24: (rho(T) * d.N24 * mlt(rS)) / area(WIRE.s24),
    s15: (rho(T) * d.N15 * mlt(rS)) / area(WIRE.s15), aux: (rho(T) * d.Naux * mlt(rAux)) / area(WIRE.aux) };
};
// the shorted-output loop floor: the colder, smaller secondary winding at −30 °C + rectifier dynamic 30 + board/short 10 mΩ
D4.rLoopMin = 0.040 + Math.min(d4Rdc(D4, -30).s24, d4Rdc(D4, -30).s15);
// E52 as registered — the CONTROL GROUP: the gates below must reject it (a gate that cannot fail proves nothing)
export const D4_REGISTERED_E52 = { ...D4, rev: "D", mpn: "XFMR-AUX-FLY-D", core: "ETD39", tolL: 0.10, llkAcc: 12e-6, llkLayout: 0 };
export const DRAWN_E52 = { rcs: 0.31, rcsf: 1e3, ccsf: 470e-12, rcla: 94e3, nRcla: 2, ccla: 10e-9, rbrUp: 4.8e6, rbrLo: 15e3, rst: 940e3, cvcc: 220e-6, r24: 0, dclaV: 1200, qauxV: 1700 };

// ---- drawn values: parsed off cells.tsx (the schematic is the authority) + voltage classes off parts-db ----
const num = (s) => {
  const m = String(s).match(/^([\d.]+)\s*([pnuµmkM]?)/);
  if (!m) throw new Error(`d4-flyback: cannot parse value "${s}"`);
  return +m[1] * ({ p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, m: 1e-3, k: 1e3, M: 1e6, "": 1 })[m[2]];
};
export const drawn = () => {
  const src = readFileSync(join(ROOT, "packages/power-primitives/cells.tsx"), "utf8");
  const db = readFileSync(join(ROOT, "calculations/cost/parts-db.mjs"), "utf8");
  const v = (name, attr = "resistance") => {
    const m = src.match(new RegExp(`name="${name}" ${attr}="([^"]+)"`));
    if (!m) throw new Error(`d4-flyback: ${name} ${attr} not found in cells.tsx`);
    return num(m[1]);
  };
  const rcla = [...src.matchAll(/name="RCLA\d" resistance="([^"]+)"/g)].map((m) => num(m[1]));
  const cls = (ref) => +(db.match(new RegExp(`m: /\\^${ref}\\$/, mpn: "[^"]*?(\\d{4})`))?.[1] ?? NaN);
  return { rcs: v("RAUXCS"), rcsf: v("RCSF"), ccsf: v("CCSF", "capacitance"), rcla: rcla.reduce((a, b) => a + b, 0), nRcla: rcla.length,
    ccla: v("CCLA", "capacitance"), rbrUp: v("RBR1A") + v("RBR1B"), rbrLo: v("RBR2"), rst: v("RAUXST1") + v("RAUXST2"),
    cvcc: v("CVCC", "capacitance"), r24: src.includes('name="RAUX24"') ? v("RAUX24") : 0, dclaV: cls("DCLA"), qauxV: cls("QAUX") };
};
export const fingerprint = (d = D4, w = drawn()) =>
  `D4${d.rev}:${d.core}/${d.Np}:${d.N24}:${d.N15}:${d.Naux}/Lp${d.Lp * 1e6}u±${d.tolL * 100}%/Llk${d.llkAcc * 1e6}+${d.llkLayout * 1e6}u/` +
  `Rcs${w.rcs}/CS${w.rcsf / 1e3}k-${Math.round(w.ccsf * 1e12)}p/CL${w.rcla / 1e3}k-${Math.round(w.ccla * 1e9)}n/DCLA${w.dclaV}V`;

// ---- current-sense comparator: ramp through the RC filter, closed form (first-order response to a ramp + offset) ----
// vs(t) = k·Rcs·(Iv + S·t) + Vramp·(t/T)·Rf/(Rf+Rramp),  k = Rramp/(Rramp+Rf),  τ = (Rf∥Rramp)·Cf
const vFilt = (a, b, tau, t) => b * (1 - Math.exp(-t / tau)) + a * (t - tau * (1 - Math.exp(-t / tau)));
const chain = ({ Vin, L, rcs, rcsf, ccsf, f, vramp, Iv = 0 }) => {
  const k = NCP.rramp / (NCP.rramp + rcsf), tau = ((rcsf * NCP.rramp) / (rcsf + NCP.rramp)) * ccsf, S = Vin / L;
  return { S, tau, a: k * rcs * S + (vramp * f * rcsf) / (rcsf + NCP.rramp), b: k * rcs * Iv };
};
// actual peak current when the filtered CS reaches vth (armed after LEB), + propagation / turn-off delay
export const csTrip = (p) => {
  const { S, tau, a, b } = chain(p), tMax = 0.456 / p.f, Iv = p.Iv ?? 0;
  let t = NCP.tLEB;
  if (vFilt(a, b, tau, t) < p.vth) {
    let lo = t, hi = tMax;
    if (vFilt(a, b, tau, hi) < p.vth) return { ipk: Iv + S * tMax, ton: tMax };
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (vFilt(a, b, tau, m) >= p.vth) hi = m; else lo = m; }
    t = hi;
  }
  const ton = Math.min(t + p.tdel, tMax);
  return { ipk: Iv + S * ton, ton };
};
// filtered CS at turn-off for a FB-terminated pulse whose actual peak is ipk (what the FCS fault comparator sees)
export const csSensed = (p) => { const { S, tau, a, b } = chain(p); return vFilt(a, b, tau, p.ipk / S); };
// anchor: the closed form must reproduce a brute-force time-stepped RC (fails loudly on a model edit)
{
  const p = { Vin: 860, L: 345e-6, rcs: 0.31, rcsf: 1e3, ccsf: 470e-12, f: 65e3, vramp: 3.5, vth: 1.0, tdel: 100e-9 };
  const { tau, a } = chain(p);
  let t = 0, vf = 0; const dt = 1e-10;
  while (!(t >= NCP.tLEB && vf >= p.vth)) { vf += (a * (t + dt / 2) - vf) * (1 - Math.exp(-dt / tau)); t += dt; }
  const brute = (p.Vin / p.L) * (t + p.tdel), cf = csTrip(p).ipk;
  if (Math.abs(brute / cf - 1) > 0.01) throw new Error(`d4-flyback: CS closed form ${cf} A ≠ time-step ${brute} A`);
}

// ---- V24 hard short: cycle map of the primary current (linear L — valid only while it stays below Bsat) ----
export const ratchet = ({ d, w, Vin, L, f, n, R }) => {
  const T = 1 / f, Ls = L / (n * n);
  let Ip = 0, pk = 0;
  for (let c = 0; c < 1500; c++) {
    const { ton } = csTrip({ Vin, L, rcs: w.rcs, rcsf: w.rcsf, ccsf: w.ccsf, f, vramp: NCP.vramp[0], vth: NCP.vilim[2], tdel: NCP.tILIM[1] + NCP.tOff, Iv: Ip });
    const ipk = Ip + (Vin / L) * ton;
    let Is = ipk * n; const h = (T - ton) / 400;
    for (let i = 0; i < 400 && Is > 0; i++) Is -= ((d.vfShort + Is * R) / Ls) * h;
    Ip = Math.max(Is, 0) / n;
    if (c > 1400) pk = Math.max(pk, ipk);
  }
  return pk;
};

// ---- the evaluation: every number the gates assert ----
export const Bsat = (T) => 0.499 + ((0.401 - 0.499) / 75) * (T - 25);   // temp-critique's 3C95 measured line (PC95 MAS: 380 mT @120 °C)
export const evaluate = (d = D4, w = drawn()) => {
  const Ae = CORES[d.core].Ae, Lmax = d.Lp * (1 + d.tolL), Lmin = d.Lp * (1 - d.tolL), fsw = 65e3;
  const fLo = fsw * (1 - NCP.fosc), fHi = fsw * (1 + NCP.fosc), fHiJ = fHi * (1 + NCP.jitter);
  const Pin = Math.max(...Object.values(SKUS).map(pinReq)), worstSku = Object.entries(SKUS).find(([, s]) => pinReq(s) === Pin)[0];
  const n24 = d.Np / d.N24, r = {};
  // brown-in/out with the IBO hysteresis source (NCP1252/D eq. 1–2), R ±1 %
  const vOff = (vbo, up, lo) => vbo * (1 + up / lo);
  r.bo = { off: [vOff(NCP.vbo[0], w.rbrUp * 0.99, w.rbrLo * 1.01), vOff(1, w.rbrUp, w.rbrLo), vOff(NCP.vbo[2], w.rbrUp * 1.01, w.rbrLo * 0.99)] };
  r.bo.on = [r.bo.off[0] + NCP.ibo[0] * w.rbrUp * 0.99, r.bo.off[1] + NCP.ibo[1] * w.rbrUp, r.bo.off[2] + NCP.ibo[2] * w.rbrUp * 1.01];
  r.bo.hys = NCP.ibo[0] * w.rbrUp * 0.99;
  r.bo.startBus = Math.SQRT2 * VLL_START;
  const vLow = r.bo.off[0];                                                  // lowest bus any unit still runs at
  // 1. flux at the cycle-by-cycle limit: 860 V, Lp max, VILIM max, Rcs −1 %, C +5 % (C0G), ramp min, tILIM max + turn-off
  const limit = (L) => csTrip({ Vin: VBUS_MAX, L, rcs: w.rcs * 0.99, rcsf: w.rcsf * 1.01, ccsf: w.ccsf * 1.05, f: fLo, vramp: NCP.vramp[0], vth: NCP.vilim[2], tdel: NCP.tILIM[1] + NCP.tOff }).ipk;
  r.ipkLim = limit(Lmax);
  r.B = (Lmax * r.ipkLim) / (d.Np * Ae);
  r.Bpct = r.B / Bsat(130);
  // 2. full load at the lowest running bus: FCS fault-timer margin (FB-terminated pulses must stay under FCS min) and
  //    deliverable power at that ceiling. Lp min, oscillator −8 % (jitter excluded: the timer resets after 3 periods < 1 V),
  //    Rcs +1 %, C −5 %, ramp max; the lag term is smallest at the lowest bus, so scan up from brown-out min.
  r.Ireq = Math.sqrt((2 * Pin) / (Lmin * fLo));
  r.csFull = Math.max(...[vLow, 400, 560, VBUS_MAX].map((Vin) => csSensed({ Vin, L: Lmin, rcs: w.rcs * 1.01, rcsf: w.rcsf * 0.99, ccsf: w.ccsf * 0.95, f: fLo, vramp: NCP.vramp[2], ipk: r.Ireq })));
  r.faultMargin = (NCP.fcs[0] - r.csFull) / NCP.fcs[0];
  const iCeil = csTrip({ Vin: vLow, L: Lmin, rcs: w.rcs * 1.01, rcsf: w.rcsf * 0.99, ccsf: w.ccsf * 0.95, f: fLo, vramp: NCP.vramp[2], vth: NCP.fcs[0], tdel: 0 }).ipk;
  r.pDeliver = 0.5 * Lmin * iCeil * iCeil * fLo * ETA;
  r.pOut = Pin * ETA; r.pinReq = Pin; r.worstSku = worstSku;
  // 3. DCM + duty at the lowest running bus, Lp max (longest t_on + t_reset), V24 at its 22.5 V window floor
  r.dcm = Math.max(...[fLo, fHi].map((f) => { const I = Math.sqrt((2 * Pin) / (Lmax * f)), LI = Lmax * I; return (LI / vLow + LI / (n24 * (22.5 + VF))) * f; }));
  r.duty = Math.max(...[fLo, fHi].map((f) => ((Lmax * Math.sqrt((2 * Pin) / (Lmax * f))) / vLow) * f));
  // 4. RCD clamp energy balance: Vc(Vc − Vor) = R·½·Llk·I²·f at the limit current (Lp min or max, whichever is higher),
  //    Llk acceptance + layout, oscillator + jitter max, R +1 %. Vor at the regulated 24 V: the limit only engages on
  //    start-up, load steps and overload, where V24 is at or below regulation (26.4 V is the light-load corner)
  r.ipkClamp = Math.max(limit(Lmin), r.ipkLim);
  const llk = d.llkAcc + d.llkLayout, vorReg = n24 * (24 + VF);
  const vc = (X, vor) => vor / 2 + Math.sqrt((vor * vor) / 4 + X);
  r.vc = vc(w.rcla * 1.01 * 0.5 * llk * r.ipkClamp ** 2 * fHiJ, vorReg);
  r.vds = VBUS_MAX + r.vc + d.vOvs;
  r.vdsPct = r.vds / w.qauxV; r.vrPct = r.vds / w.dclaV;
  // continuous full load: ½·Llk·I²·f = Llk·Pin/L is frequency-independent → worst at Lp min
  r.vcFull = vc(w.rcla * llk * (Pin / Lmin), vorReg);
  r.pRclaPart = (r.vcFull ** 2 / w.rcla) / w.nRcla;
  r.pRclaEvent = (r.vc ** 2 / w.rcla) / w.nRcla;
  r.vRclaPart = r.vc / w.nRcla;
  r.pBleedIdle = vorReg ** 2 / w.rcla;
  // 5. cold start: VCC charged from the bus through RAUXST to VCC(on) max, CVCC +20 %, R +1 %, ICC1 max
  r.tStart = (Vbus) => { let V = 0, t = 0; const C = w.cvcc * 1.2, R = w.rst * 1.01, dV = 0.01; while (V < NCP.vccOn[2]) { const I = (Vbus - V) / R - NCP.icc1; if (I <= 0) return Infinity; t += (C * dV) / I; V += dV; } return t; };
  // 6. V24 / V15 hard short at 860 V: ratchet equilibrium (linear L) vs Isat(130 °C) and the QAUX pulse class.
  //    Every V24 fault past CAUX24 also sees RAUX24 (E65); a CAUX24 or rectifier failure itself does not (residual, T-09)
  r.short24 = Math.max(...[Lmin, Lmax].map((L) => ratchet({ d, w, Vin: VBUS_MAX, L, f: fHiJ, n: n24, R: d.rLoopMin + w.r24 })));
  r.short24bare = Math.max(...[Lmin, Lmax].map((L) => ratchet({ d, w, Vin: VBUS_MAX, L, f: fHiJ, n: n24, R: d.rLoopMin })));
  r.short15 = Math.max(...[Lmin, Lmax].map((L) => ratchet({ d, w, Vin: VBUS_MAX, L, f: fHiJ, n: d.Np / d.N15, R: d.rLoopMin })));
  r.Bshort = (Lmax * Math.max(r.short24, r.short15)) / (d.Np * Ae);
  r.BshortBare = (Lmax * r.short24bare) / (d.Np * Ae);
  // full-load operating flux (temp-critique op-set: DCM unipolar swing, amplitude = B̂/2)
  r.Bfull = (d.Lp * Math.sqrt((2 * Pin) / (d.Lp * fsw))) / (d.Np * Ae);
  return r;
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const f = (x, k = 2) => Number(x.toFixed(k));
  for (const [name, d, w] of [["rev E (drawn)", D4, drawn()], ["E52 control group", D4_REGISTERED_E52, DRAWN_E52]]) {
    const r = evaluate(d, w);
    console.log(`${name}: ${fingerprint(d, w)}`);
    console.log(`  limit Ipk ${f(r.ipkLim)} A → B ${f(r.B * 1e3, 0)} mT = ${f(100 * r.Bpct, 1)} % Bsat130 · fault margin ${f(100 * r.faultMargin, 1)} % (CS ${f(r.csFull, 3)} V) · P ${f(r.pDeliver, 0)}/${f(r.pOut, 0)} W · DCM ${f(r.dcm, 2)} · duty ${f(r.duty, 3)}`);
    console.log(`  clamp I ${f(r.ipkClamp)} A Vc ${f(r.vc, 0)} V Vds ${f(r.vds, 0)} V (${f(100 * r.vdsPct, 1)} %) DCLA ${f(100 * r.vrPct, 1)} % · RCLA ${f(r.pRclaPart)} W/part cont, ${f(r.pRclaEvent)} W event, ${f(r.vRclaPart, 0)} V/part · idle bleed ${f(r.pBleedIdle)} W`);
    console.log(`  BO off ${r.bo.off.map((x) => f(x, 0)).join("/")} on ${r.bo.on.map((x) => f(x, 0)).join("/")} hys ${f(r.bo.hys, 1)} V · start ${f(r.tStart(403), 1)} s @403 V, ${f(r.tStart(452), 1)} s @452 V, ${f(r.tStart(566), 1)} s @566 V`);
    console.log(`  short V24 ${f(r.short24)} A (${f(r.short24bare)} A at the bare rectifier) · V15 ${f(r.short15)} A → B ${f(r.Bshort * 1e3, 0)} mT (${f(r.BshortBare * 1e3, 0)} bare) · Bfull ${f(r.Bfull * 1e3, 0)} mT`);
  }
}
