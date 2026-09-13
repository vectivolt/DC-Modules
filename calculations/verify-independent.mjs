// verify-independent.mjs — E43 clean-room end-to-end verification of EVERY board, kept as a
// PERMANENT gate. Deliberately independent: its own circuit.json parser (union-find), its own
// physics — zero reuse of the design engines it checks. If an engine and this file disagree,
// somebody is wrong and the build should stop. Covers: system currents · tank resonance/duty ·
// protection energies/classes/timing · thermal closed-form vs the grid CSV · aux budget ·
// 3-φ interleave capacitor ripple · per-board STRUCTURAL walks (default-OFF coverage, mirror
// chains, discharge/precharge paths, per-variant counts) · firmware coherence.
// Run: node calculations/verify-independent.mjs   (needs fresh tsci builds + envelope grid)
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const f = (x, d = 2) => Number(x.toFixed(d));
let fails = 0, checks = 0;
const ck = (sec, name, cond, detail) => {
  checks++; console.log(`${cond ? "  ok  " : "  FAIL"} [${sec}] ${name} — ${detail}`);
  if (!cond) fails++;
};

// ---------- standalone circuit.json parser (union-find over ports/nets via traces) ----------
function loadNet(path) {
  if (!existsSync(path)) return null;
  const j = JSON.parse(readFileSync(path, "utf8"));
  const comps = new Map(), ports = new Map(), nets = new Map();
  for (const e of j) {
    if (e.type === "source_component") comps.set(e.source_component_id, e);
    else if (e.type === "source_port") ports.set(e.source_port_id, e);
    else if (e.type === "source_net") nets.set(e.source_net_id, e);
  }
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
  for (const id of [...ports.keys(), ...nets.keys()]) parent.set(id, id);
  for (const e of j) if (e.type === "source_trace") {
    const ids = [...(e.connected_source_port_ids ?? []), ...(e.connected_source_net_ids ?? [])];
    for (let i = 1; i < ids.length; i++) if (parent.has(ids[0]) && parent.has(ids[i])) uni(ids[0], ids[i]);
  }
  const repName = new Map();
  for (const [nid, n] of nets) { const r = find(nid); if (!repName.has(r) || n.name < repName.get(r)) repName.set(r, n.name); }
  const netOfPin = new Map(), pinsOfNet = new Map(), val = new Map(), byName = new Map();
  const coerce = (v) => {
    if (typeof v !== "string") return v;
    const m = v.match(/^([\d.]+)\s*(p|n|u|µ|m|k|M)?/);
    if (!m) return NaN;
    const mult = { p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, m: 1e-3, k: 1e3, M: 1e6 }[m[2]] ?? 1;
    return Number(m[1]) * mult;
  };
  for (const [, c] of comps) { byName.set(c.name, c);
    val.set(c.name, coerce(c.resistance ?? c.capacitance ?? c.inductance)); }
  for (const [pid, p] of ports) {
    const c = comps.get(p.source_component_id); if (!c) continue;
    const r = find(pid); const nn = repName.get(r) ?? `__anon_${r}`;
    const key = `${c.name}.${p.name ?? p.pin_number}`;
    netOfPin.set(key, nn);
    if (!pinsOfNet.has(nn)) pinsOfNet.set(nn, []);
    pinsOfNet.get(nn).push(key);
  }
  return { netOfPin, pinsOfNet, val, byName, names: [...byName.keys()] };
}
const B = {};
for (const sku of ["30kw", "40kw", "50kw", "50kwa"]) {
  B[sku] = { ac: loadNet(`${ROOT}/dist/boards/${sku}/acdc/circuit.json`), dc: loadNet(`${ROOT}/dist/boards/${sku}/dcdc/circuit.json`) };
}
B.card = loadNet(`${ROOT}/dist/boards/control-card/circuit.json`);

// ---------- A. system currents (first principles) ----------
console.log("\n=== A. SYSTEM CURRENTS (clean-room) ===");
const SK = {   // E67 full bridge: crN × 33 nF · external Lr (D2 rev F) · tank class (A rms) · 0.05 mm litz area · bank film/electrolytic counts
  "30kw": { P: 30e3, Imax: 100, par: 1, parL: 1, nHalf: 5, fans: 2, crN: 7, crV: 33e-9, lr: 5.16e-6, tRms: 78, fuse: 80, kpre: 80, lineCT: 100, lineB: 22, resB: 0.47, F01: 120, F11: 140, disch: 3000, litz: 15.7, nF: 9, nE: 0, dPar: 2, dout: 150 },
  "40kw": { P: 40e3, Imax: 133, par: 1, parL: 2, nHalf: 6, fans: 3, crN: 9, crV: 33e-9, lr: 4.07e-6, tRms: 100, fuse: 125, kpre: 100, lineCT: 150, lineB: 18, resB: 0.36, F01: 155, F11: 180, disch: 4000, litz: 19.6, nF: 12, nE: 0, dPar: 2, dout: 200 },
  "50kw": { P: 50e3, Imax: 167, par: 1, parL: 2, nHalf: 8, fans: 0, crN: 11, crV: 33e-9, lr: 3.28e-6, tRms: 120, fuse: 160, kpre: 250, lineCT: 150, lineB: 13, resB: 0.30, F01: 195, F11: 220, disch: 5000, litz: 23.6, nF: 14, nE: 0, dPar: 2, dout: 250 },
  "50kwa": { P: 50e3, Imax: 167, par: 1, parL: 2, nHalf: 8, fans: 4, crN: 11, crV: 33e-9, lr: 3.28e-6, tRms: 120, fuse: 160, kpre: 250, lineCT: 150, lineB: 13, resB: 0.30, F01: 195, F11: 220, disch: 5000, litz: 23.6, nF: 14, nE: 0, dPar: 2, dout: 250 },
};
for (const [sku, s] of Object.entries(SK)) {
  s.Iline = (s.P / 0.965) / (Math.sqrt(3) * 330 * 0.99);
  s.Ipk = s.Iline * Math.SQRT2;
  s.Iout = s.Imax;
  s.Ip1max = (Math.PI / (2 * Math.SQRT2)) * (s.P / 500) / 0.98;   // E67: reflected load current (n = 2) at the 500 V HIGH-mode floor, rms
  console.log(`  ${sku}: Iline ${f(s.Iline, 1)} A (pk ${f(s.Ipk, 1)}) · Iout ${s.Iout} A · tank load-bound ${f(s.Ip1max, 1)} A rms at the HIGH floor · class ${s.tRms} A rms`);
}
ck("A", "registered line currents reproduce", Math.abs(SK["40kw"].Iline - 73.25) < 0.4 && Math.abs(SK["50kw"].Iline - 91.57) < 0.4,
  `40: ${f(SK["40kw"].Iline, 1)} vs 73.3 · 50: ${f(SK["50kw"].Iline, 1)} vs 91.6 (30 kW doc constant 55.9 is 1.7% conservative vs ${f(SK["30kw"].Iline, 1)} — fuse math uses the conservative one, safe direction)`);
ck("A", "tank classes cover the load-set current at the HIGH-mode floor (+ magnetizing in quadrature)", Object.values(SK).every((s) => Math.hypot(s.Ip1max, 0.2 * s.Ip1max) <= s.tRms),
  Object.entries(SK).map(([k, s]) => `${k} ${f(s.Ip1max, 1)} A (+20 % Im quadrature ${f(Math.hypot(s.Ip1max, 0.2 * s.Ip1max), 1)}) ≤ ${s.tRms}`).join(" · "));

// ---------- B. tank resonance + capacitor duty (independent) ----------
console.log("\n=== B. TANK — fr, per-cap duty, trim ===");
// E67 clean-room tank: two series-primary cells, each an S1–P–S2 interleave — 1-D MMF energy L = µ0·N²·MLT/(4b)·(2g + (2hS + hP)/3)
// with this file's own build guesses (foil + 50 µm film per layer, litz at 0.55 Cu fill + 0.6 mm serving across the 28 mm conductor
// breadth, 0.3 mm barrier, E70 former lN 230.5 mm (2-set) / 293 mm (3-set)); tank Lr = external D2 + 2 × cell leakage + 0.1 µH loop
const XF = { "30kw": { N: 6, mlt: 0.2305, cuP: 12e-6, foil: 0.10e-3, nf: 1 }, "40kw": { N: 4, mlt: 0.293, cuP: 14e-6, foil: 0.08e-3, nf: 2 }, "50kw": { N: 4, mlt: 0.293, cuP: 14e-6, foil: 0.08e-3, nf: 2 } };
XF["50kwa"] = XF["50kw"];
const llkOf = (x) => 4e-7 * Math.PI * x.N * x.N * x.mlt / (4 * 0.041) * (2 * 0.3e-3 + (2 * x.N * x.nf * (x.foil + 50e-6) + x.N * x.cuP / (0.55 * 0.028) + 0.6e-3) / 3);
for (const [sku, s] of Object.entries(SK)) {
  const LLK = 2 * llkOf(XF[sku]) + 0.1e-6, Cr = s.crN * s.crV, Lr = LLK + s.lr;
  const fr = 1 / (2 * Math.PI * Math.sqrt(Lr * Cr));
  ck("B", `${sku} tank re-centers to fr 140 kHz`, Math.abs(fr - 140e3) < 3e3 && LLK < 0.8e-6, `${s.crN}×${f(s.crV * 1e9, 0)} nF + ${f(s.lr * 1e6, 2)} µH external + ${f(LLK * 1e6, 2)} µH 2-cell leakage+loop (clean-room) → fr ${f(fr / 1e3, 1)} kHz`);
  const iCap = s.tRms / s.crN, vCap = iCap / (2 * Math.PI * 140e3 * s.crV);
  const esr = 2e-4 / (2 * Math.PI * 140e3 * s.crV), wCap = iCap * iCap * esr;
  ck("B", `${sku} per-cap duty`, iCap <= 12 && vCap < 530 && wCap < 1.0,
    `${f(iCap, 1)} A · ${f(vCap, 0)} V rms @140 kHz · ${f(wCap, 2)} W dielectric (O-8 line: curve ≥ ${f(vCap * 1.3, 0)} V — 942C class covers)`);
  // clean-room D2 external Lr: own Sullivan litz proximity at the 200 kHz PSM corner; thermal proof is the envelope gate's
  const Nt = 5, Ae = 1366e-6, mltT = 0.218, dS = 0.05e-3, nS = s.litz * 1e-6 / (Math.PI * dS * dS / 4);
  const B_ = s.lr * 1.03 * s.tRms * Math.SQRT2 / (Nt * Ae) * 1e3;
  const J = s.tRms / s.litz;
  const rh = 1.7241e-8 * (1 + 0.00393 * 80), w = 2 * Math.PI * 200e3, mu0 = 4e-7 * Math.PI;
  const FrS = 1 + Math.PI ** 2 * w * w * mu0 * mu0 * Nt * Nt * nS * nS * dS ** 6 / (768 * rh * rh * 0.041 * 0.041);
  const pcu = s.tRms ** 2 * rh * Nt * mltT / (s.litz * 1e-6) * FrS;
  ck("B", `${sku} external Lr: Bpk/J/Fr (clean-room Sullivan @200 kHz)`, B_ <= 100.5 && J <= 5.65 && FrS <= 3.5,
    `2×E70 N5 0.05 mm litz (${f(nS, 0)} strands) · Bpk ${f(B_, 0)} mT · J ${f(J, 1)} A/mm² · Fr ${f(FrS, 2)} → Cu ${f(pcu, 1)} W at the ${s.tRms} A rms class current`);
}

// ---------- C. protection ladder (energies, classes, timing) ----------
console.log("\n=== C. PROTECTION — classes, energies, timing ===");
for (const [sku, s] of Object.entries(SK)) {
  const Cser = s.nHalf * 470e-6 / 2;
  // discharge through the 4×160 Ω chain
  const tau = 640 * Cser, tDis = tau * Math.log(830 / 60);
  ck("C", `${sku} discharge window physics`, tDis * 1000 < s.disch * 0.8,
    `τ ${f(tau, 2)} s → ${f(tDis, 2)} s to <60 V vs ${s.disch} ms window (${f(100 * tDis * 1000 / s.disch, 0)}% used)`);
  const eDis = 0.5 * Cser * 830 * 830 / 4, ePre = 0.5 * Cser * 671 * 671 / 2;
  const cls = /^50kw/.test(sku) ? 480 : 160;   // 50 W family part (both 50s) vs highest-accepted 25 W point
  ck("C", `${sku} pulse-resistor energies inside class`, eDis <= cls && ePre <= cls,
    `RDIS ${f(eDis, 0)} J · RPRE ${f(ePre, 0)} J per resistor vs ${cls} J (${sku === "50kw" ? "CER-50W-AX ordered — E43" : "25 W family point"})`);
  // precharge completes long before the FSM abort line
  const t95 = 3 * 65.3 * Cser;
  ck("C", `${sku} precharge t95 vs 400 ms abort`, t95 * 1000 < 400,
    `t95 ≈ ${f(t95 * 1000, 0)} ms (and bus is ≥96% by 400 ms — the 50% abort bar can never false-trip)`);
  const cap = s.fuse * 0.72;
  ck("C", `${sku} fuse derate`, cap >= (sku === "30kw" ? 55.9 : s.Iline),
    `${s.fuse} A gG → ${f(cap, 1)} A enclosed/hot ≥ ${f(sku === "30kw" ? 55.9 : s.Iline, 1)} A`);
  ck("C", `${sku} precharge-bypass class`, (sku === "30kw" ? 55.9 : s.Iline) / s.kpre <= 0.75, `${f(100 * (sku === "30kw" ? 55.9 : s.Iline) / s.kpre, 0)}% of ${s.kpre} A`);
  ck("C", `${sku} output blocking diode class (E67, K_OUT retired)`, s.Iout / s.dout <= 0.70, `${s.Iout} A on the ${s.dout} A module = ${f(100 * s.Iout / s.dout, 0)} %`);
  // OC observability inside the rail
  // E60: the comparator thresholds themselves (F.01 line / F.11 tank) must be representable with
  // ≥0.27 V left to the rail; the observability-through-the-fault-race proof is current-coordination's
  const obs = 1.65 + s.F01 / 2500 * s.lineB;
  const res = 1.65 + s.F11 / 100 * s.resB;
  ck("C", `${sku} CT burden rail budgets`, obs <= 3.0 && res <= 3.0,
    `F.01 ${s.F01} A on ${s.lineB} Ω → ${f(obs, 2)} V · F.11 ${s.F11} A on ${s.resB} Ω → ${f(res, 2)} V (≤3.0, headroom for the kill race)`);
  // bank bleeders
  const cBank = s.nE * 330e-6 + s.nF * 2.2e-6, tauB = 4 * 2200 * cBank;
  ck("C", `${sku} bank bleeder window (E68 film bank)`, tauB <= 17 && 0.5 * cBank * 500 * 500 / 4 <= 65,
    `${f(cBank * 1e6, 1)} µF per bank → τ ${f(tauB, 2)} s (≤ 17 s; film-only banks bleed in well under a second) · ${f(0.5 * cBank * 500 * 500 / 4, 2)} J/resistor ≤ 65`);
}
{ // X-bleed (E68): three star X2 stages (a star C is C/3 line-to-line) + the Δ damper cap (its 10 Ω is ≪ the bleed star)
  const A30 = B["30kw"].ac, cX = ((A30.val.get("CX01") + A30.val.get("CX11") + A30.val.get("CX21") + A30.val.get("CX24")) / 3 + (A30.val.get("CDMP1") ?? 0)) * 1e6;
  const tauX = 0.42 * cX / (2.2 + 2.2);
  ck("C", "X-cap bleed after the star X2 stages + damper", tauX <= 1.0, `τ ${f(tauX, 2)} s for ${f(cX, 1)} µF line-to-line equivalent (netlist) ≤ 1 s pluggable rule (star unchanged)`);
}
{ // RATING bands with 1% parts
  const v = (R) => 3.3 * R / (R + 10e3);
  const lo = (R) => 3.3 * (R * 0.99) / (R * 0.99 + 10e3 * 1.01), hi = (R) => 3.3 * (R * 1.01) / (R * 1.01 + 10e3 * 0.99);
  ck("C", "RATING bands hold at ±1% parts", lo(1e3) > 0.15 && hi(1e3) < 0.55 && lo(3.32e3) > 0.55 && hi(3.32e3) < 1.24 && lo(10e3) > 1.24 && hi(10e3) < 1.82 && lo(15e3) > 1.82 && hi(15e3) < 2.30,
    `1k → ${f(lo(1e3), 3)}–${f(hi(1e3), 3)} · 3.32k → ${f(lo(3.32e3), 3)}–${f(hi(3.32e3), 3)} · 10k → ${f(lo(10e3), 3)}–${f(hi(10e3), 3)} · 15k → ${f(lo(15e3), 3)}–${f(hi(15e3), 3)} V (rev G edges 0.15/0.55/1.24/1.82/2.30)`);
}

// ---------- D. thermal cross-check vs the grid's own worst rows ----------
console.log("\n=== D. THERMAL — closed-form vs grid CSV ===");
const grid = readFileSync(`${ROOT}/calculations/out/envelope-grid.csv`, "utf8").trim().split("\n").map(r => r.split(","));
function tjWorst(sku) {
  const rows = grid.filter(r => r[0] === sku && r[6] !== "IDLE" && r[13] !== "");
  const wl = rows.reduce((a, r) => (+r[14] > +a[14] ? r : a));
  return { p: Math.max(...rows.map(r => +r[13])), l: +wl[14], ip: Math.max(...rows.map(r => +r[10])), lRow: wl };
}
{ // 50 kW liquid: re-derive the grid's OWN worst LLC row closed-form (E67: full bridge, par FETs per position)
  const g = tjWorst("50kw"), ipW = +g.lRow[10], psW = g.lRow[6] === "PSM" ? 8 : 1, par = SK["50kw"].parL;
  const plate = { cold: 10, room: 45, hot: 65 }[g.lRow[4]];
  let Tj = 80; for (let i = 0; i < 40; i++) Tj = plate + ((ipW / Math.SQRT2 / par) ** 2 * 0.023 * (1 + 0.004 * (Tj - 25)) + psW / par) * 0.65;   // E68 clip mount onto the plate
  ck("D", "50kw LLC worst corner reproduces", Math.abs(Tj - g.l) < 3, `closed-form ${f(Tj, 0)} °C vs grid ${g.l} at its worst row (${g.lRow[2]} V ${g.lRow[5]} ${g.lRow[6]} ${g.lRow[4]}, Ip ${ipW} A rms — ${par} FETs per position, liquid model)`);
  ck("D", "50kw Ip max inside the tank class", g.ip <= SK["50kw"].tRms * 1.02, `${g.ip} A rms ≤ ${SK["50kw"].tRms} A rms class`);
}
for (const sku of ["30kw", "40kw", "50kwa"]) {
  const g = tjWorst(sku);
  ck("D", `${sku} grid worst temps inside ceilings`, g.p <= 150 && g.l <= 150.5 && g.ip <= SK[sku].tRms * 1.02, `TjPFC ${g.p} · TjLLC ${g.l} · Ip ${g.ip} A rms ≤ ${SK[sku].tRms} class`);
}

// ---------- E. aux budget per variant ----------
console.log("\n=== E. AUX 110 W BUDGET (count-based from netlists) ===");
for (const [sku, s] of Object.entries(SK)) {
  const both = [...B[sku].ac.names, ...B[sku].dc.names];
  const nBias = both.filter(n => /^PS/.test(n)).length;
  const coils = (2 * 1.7 + (sku === "50kw" ? 3 : 2) * 1.6) * 0.5 + (sku === "50kw" ? 1.6 * 0.5 : 0); // KPRE pair + closed matrix set, PWM-hold
  const fansW = s.fans * 9;
  const est = nBias * 0.55 + coils + fansW + 2 + 1.5 + 1 + 2.5;   // bias + coils + fans + MCU/3V3 + CAN + HMI + drivers' primary
  ck("E", `${sku} aux load inside the 110 W stage`, est <= 93,
    `${nBias} bias modules + coils ${f(coils, 1)} W + fans ${fansW} W + logic ≈ ${f(est, 0)} W ≤ 93 (85% of 110)`);
}

// ---------- F. bank + link ripple (3-φ interleave, numeric) ----------
console.log("\n=== F. CAPACITOR RIPPLE (numeric interleave model) ===");
for (const [sku, s] of Object.entries(SK)) {
  // E67: one bridge, no interleave — the full-wave rectified ripple √(π²/8 − 1)·Idc at the HIGH-mode floor lands on the rectifier film
  const Idc = s.P / 500, iRip = Math.sqrt(Math.PI ** 2 / 8 - 1) * Idc, perFilm = iRip / s.nF;
  ck("F", `${sku} bank film ripple (full-bridge, clean-room)`, perFilm <= 10.5,
    `Idc ${f(Idc, 0)} A → ${f(iRip, 1)} A rms ripple (sine-rectifier closed form) over ${s.nF}× 2.2 µF = ${f(perFilm, 2)} A/part ≤ 10.5 (ngspice PSM corner reads ~20 % higher — current-coordination gates that)`);
  const pCan = { "30kw": 12, "40kw": 12 * (4 / 3) ** 2 * 10 / 12, "50kw": 12 * (5 / 3) ** 2 * 10 / 16, "50kwa": 12 * (5 / 3) ** 2 * 10 / 16 }[sku] / (s.nHalf * 2);
  ck("F", `${sku} link per-can dissipation vs family control`, pCan <= 1.85,
    `${f(pCan, 2)} W/can (30 kW control ${f(12 / 10, 2)} — same class duty, bench T-03 measures)`);
}

// ---------- G. structural netlist walks ----------
console.log("\n=== G. STRUCTURE — every board, counts and paths ===");
const cnt = (b, re) => b.names.filter(n => re.test(n)).length;
for (const [sku, s] of Object.entries(SK)) {
  const A = B[sku].ac, D = B[sku].dc;
  ck("G", `${sku} Vienna silicon`, cnt(A, /^Q[ABC]0[AB]$/) === 6 && cnt(A, /^Q[ABC]0[AB]2$/) === (s.par === 2 ? 6 : 0) && cnt(A, /^RG[ABC]0[AB]2$/) === (s.par === 2 ? 6 : 0),
    `${6 + (s.par === 2 ? 6 : 0)} FETs${s.par === 2 ? " (paralleled pairs + per-device gate Rs)" : ""}`);
  ck("G", `${sku} PFC diodes + clamp`, cnt(A, /^D[ABC]0[TB]$/) === 6 && cnt(A, /^D[ABC]0C$/) === 3, "6 boost JBS + 3 RCD clamp");
  ck("G", `${sku} link cans`, cnt(A, /^CD[TB]\d*\d$/) === s.nHalf * 2, `${s.nHalf * 2} × 470 µF (${s.nHalf}/half)`);
  ck("G", `${sku} fans + tach terminators`, cnt(A, /^JFAN\d$/) === s.fans && cnt(A, /^RFDT\d$/) === (s.fans === 0 ? 4 : 0),
    `${s.fans} fans${s.fans === 0 ? " + 4 defined-low tach terminators (sealed; incl. the E44 TACH4 way)" : ""}`);
  ck("G", `${sku} line-CT burden`, [["A"], ["B"], ["C"]].every(([p]) => Math.abs(A.val.get(`R${p}0B`) - s.lineB) < 0.1), `${s.lineB} Ω`);
  // precharge + discharge paths
  ck("G", `${sku} precharge path`, A.netOfPin.get("RPRE1.A") === A.netOfPin.get("KPRE1.A") && A.netOfPin.get("RPRE1.B") === A.netOfPin.get("KPRE1.B"),
    "RPRE1 parallels KPRE1 (AC1 → AC1F)");
  ck("G", `${sku} KPRE mirror chain`, A.netOfPin.get("KPRE1.M2") === A.netOfPin.get("KPRE2.M1") && A.netOfPin.get("KPRE2.M2") === "RELAY_FB_KPRE" && A.netOfPin.get("KPRE1.M1") === "DGND",
    "DGND → M1/M2 series → RELAY_FB_KPRE (both-open proof)");
  ck("G", `${sku} discharge chain`, A.netOfPin.get("RDIS0.A") === "DCP" && A.netOfPin.get("RDIS3.B") === A.netOfPin.get("QDISF.D") && A.netOfPin.get("QDISF.S") === "DCN",
    "DCP → 4×160 Ω → QDISF → DCN, gate on isolated ctl");
  // default-OFF pulldown coverage
  const acPD = ["GATE_EN_A", "EN_PFC", "CTL_KPRE", "CTL_QDIS", "PWM_A0", "PWM_B0", "PWM_C0"];
  ck("G", `${sku} AC-DC default-OFF coverage`, acPD.every((n, i) => A.netOfPin.get(`RPD${i}.pin1`) === n && A.netOfPin.get(`RPD${i}.pin2`) === "DGND"),
    `${acPD.length}/7 lines pulled to DGND`);
  const dcPD = ["GATE_EN_B", "EN_LLC", "CTL_KSER", "CTL_KPARA", "CTL_KPARB", "CTL_QDISBK"];
  ck("G", `${sku} DC-DC default-OFF coverage`, dcPD.every((n, i) => D.netOfPin.get(`RPDB${i}.pin1`) === n && D.netOfPin.get(`RPDB${i}.pin2`) === "DGND") && !D.byName.has(`RPDB${dcPD.length}`),
    `${dcPD.length}/6 lines pulled to DGND (E67: K_OUT + pre-insertion lines retired)`);
  // LLC + tank + banks
  ck("G", `${sku} LLC full bridge`, cnt(D, /^Q[12][HL]$/) === 4 && cnt(D, /^Q[12][HL]2$/) === (s.parL >= 2 ? 4 : 0) && cnt(D, /^Q[12][HL]3$/) === (s.parL === 3 ? 4 : 0) && !D.byName.has("Q3H"),
    `${4 * s.parL} FETs, 2 legs × ${s.parL} per position (E67)`);
  ck("G", `${sku} tank caps + external Lr + transformer cells`, cnt(D, /^C1R\d+$/) === s.crN && Math.abs(D.val.get("C1R0") - s.crV) < 1e-12 && Math.abs(D.val.get("L1R") - s.lr) < 1e-8
      && D.netOfPin.get("C1R0.pin2") === D.netOfPin.get("L1R.pin1") && D.netOfPin.get("L1R.pin2") === D.netOfPin.get("T1A.P1") && D.netOfPin.get("T1A.P2") === D.netOfPin.get("T1B.P1") && D.netOfPin.get("T1B.P2") === D.netOfPin.get("Q2H.S") && D.netOfPin.get("C1R0.pin1") === D.netOfPin.get("Q1H.S") && D.netOfPin.get("Q1H.S") !== D.netOfPin.get("Q2H.S"),
    `SWA → ${s.crN} × ${f(s.crV * 1e9, 0)} nF → ${f(s.lr * 1e6, 2)} µH → T1A.P → T1B.P → SWB (Cr strictly in series: flux-walk blocked)`);
  ck("G", `${sku} resonant burden`, Math.abs(D.val.get("R1CT") - s.resB) < 0.01 && !D.byName.has("CT2"), `${s.resB} Ω on the one tank CT`);
  ck("G", `${sku} film-only banks`, cnt(D, /^CF[AB]\d+$/) === 2 * s.nF && !D.byName.has("LFA") && !D.byName.has("CEA0") && D.netOfPin.get("CFA0.pin1") === "BKAP" && D.netOfPin.get("CFB0.pin2") === "BKBN" && D.netOfPin.get("D1A1.pin2") === "BKAP",
    `per bank ${s.nF}× 2.2 µF film across BK·P–BK·N, JBS cathodes straight onto the bank (E68)`);
  ck("G", `${sku} secondary bridges`, cnt(D, /^D1[AB][1-4](P[23])?$/) === 8 * s.dPar, `${8 * s.dPar} JBS (2 bridges × 4 positions × ${s.dPar})`);
  ck("G", `${sku} output: blocking diode, no K_OUT / pre-insertion`, D.netOfPin.get("DOUT.pin1") === "BKAP" && D.netOfPin.get("DOUT.pin2") === "OUTP" && !D.byName.has("KOUT") && !D.byName.has("KPREA") && !D.byName.has("RPREA") && !D.byName.has("UEXCL2"),
    "BKAP → DOUT → OUTP · matrix KSER/KPARA/KPARB only (E67)");
  ck("G", `${sku} RATING strap`, Math.abs(D.val.get("RROLEB") - { "30kw": 0, "40kw": 1000, "50kw": 10000, "50kwa": 15000 }[sku]) < 1, `${D.val.get("RROLEB")} Ω`);
  // E65: the filter the pre-compliance and stability gates model — Y trios on BOTH CM-choke nodes (two CM stages)
  // and the CX2-node Rd–Cd damper; then the PE leakage those Y caps imply
  const yOn = (node) => A.names.filter((n) => /^CY\d$/.test(n) && A.netOfPin.get(`${n}.pin1`) === node && A.netOfPin.get(`${n}.pin2`) === "PE" && Math.abs(A.val.get(n) - 4.7e-9) < 1e-11).length;
  ck("G", `${sku} two-stage CM ladder`, [1, 2, 3].every((p) => yOn(`AC${p}`) === 1 && yOn(`AC${p}M`) === 1 && A.netOfPin.get(`CMC1.B${p}`) === `AC${p}M` && A.netOfPin.get(`CMC2.A${p}`) === `AC${p}M`),
    "Y1 4.7 nF L-PE on AC1..3 and on AC1M..3M between CMC1 and CMC2");
  ck("G", `${sku} CX2-node damper`, [1, 2, 3].every((p) => A.netOfPin.get(`CDMP${p}.pin1`) === `AC${p}` && A.netOfPin.get(`CDMP${p}.pin2`) === A.netOfPin.get(`RDMP${p}.pin1`)
    && A.netOfPin.get(`RDMP${p}.pin2`) === `AC${p % 3 + 1}` && Math.abs(A.val.get(`CDMP${p}`) - 2.2e-6) < 1e-8 && Math.abs(A.val.get(`RDMP${p}`) - 10) < 0.01), "2.2 µF + 10 Ω in series, delta across AC1..3");
  // E68: the InfyPower filter — three star X2 stages (4.7 µF each, own floating star), no DM choke
  const starOk = (pre, node, star) => [1, 2, 3].every((p) => A.netOfPin.get(`${pre}${p}.pin1`) === node(p) && A.netOfPin.get(`${pre}${p}.pin2`) === star && Math.abs(A.val.get(`${pre}${p}`) - 4.7e-6) < 1e-8);
  ck("G", `${sku} star X2 stages, no DM choke`, starOk("CX0", (p) => `LF${p}`, "XSTAR0") && starOk("CX1", (p) => `AC${p}M`, "XSTAR1") && starOk("CX2", (p) => `AC${p}`, "XSTAR2")
    && [4, 5, 6].every((q) => A.netOfPin.get(`CX2${q}.pin1`) === `AC${q - 3}` && A.netOfPin.get(`CX2${q}.pin2`) === "XSTAR2" && Math.abs(A.val.get(`CX2${q}`) - 4.7e-6) < 1e-8)
    && !A.byName.has("LDM1") && [1, 2, 3].every((p) => A.netOfPin.get(`CMC2.B${p}`) === `AC${p}`), "CX0x on LF · CX1x on AC·M · 2 × CX2x on AC — 4.7 µF★ each, CMC2 straight to the converter");
  // one line open at 1.1 × 475 VAC with +20 % Y tolerance: the two live phases drive ω·1.2·C·Vph into PE
  const cyPh = A.names.filter((n) => /^CY\d$/.test(n) && A.netOfPin.get(`${n}.pin2`) === "PE").reduce((a, n) => a + A.val.get(n), 0) / 3;
  const iPE = 2 * Math.PI * 50 * 1.2 * cyPh * 1.1 * 475 / Math.sqrt(3);
  ck("G", `${sku} Y leakage to PE (one line open)`, 3 * iPE <= 3.5e-3, `${f(cyPh * 1e9, 1)} nF/phase → ${f(iPE * 1e3, 2)} mA per module ≤ 1.17 mA, so a charger that parallels three modules on one PE conductor stays ≤ 3.5 mA (EVT T-14)`);
  ck("G", `${sku} star + bond`, cnt(A, /^RNS[123][AB]$/) === 6 && A.netOfPin.get("RPET.pin2") === "PE" && A.netOfPin.get("CPET.pin2") === "PE", "2-series star ×3 + soft PE bond");
}
ck("G", "card essentials", B.card.byName.has("UCARD") && B.card.byName.has("USUPCARD") && B.card.byName.has("UANDCARD") && Math.abs(B.card.val.get("RROLE1") - 10000) < 1 && B.card.netOfPin.get("RFLTC.pin2") === "FLT",
  "MCU + watchdog + AND chain + 10k RATING pullup + FLT pull-up at the MCU end");

// ---------- H. firmware coherence ----------
console.log("\n=== H. FIRMWARE COHERENCE ===");
const fsmc = readFileSync(`${ROOT}/firmware/core/fsm.c`, "utf8"), fsmh = readFileSync(`${ROOT}/firmware/core/fsm.h`, "utf8");
ck("H", "discharge windows match physics", /3000u/.test(fsmc) && /4000u/.test(fsmc) && /5000u/.test(fsmc),
  "3000/4000/5000 ms vs powered-path 1.98/2.37/3.16 s — R6: valid for the AC-PRESENT latch case; AC-removed is two-phase (active→321 V, passive to 60 V — protection-thresholds E47)");
ck("H", "rev G band table in the contract header", /1\.24-1\.82 \(10k\)/.test(fsmh) && /1\.82-2\.30 \(15k\)/.test(fsmh) && /50 kW AIR/.test(fsmh), "fsm.h teaches the shipping decode incl. both 50 kW bands");
ck("H", "OT ladder is the 50 kW dry-run protection", /PMP_OT_TRIP_C\s+115/.test(fsmh) && /fan_ok/.test(fsmc), "plate NTC → derate → 115 °C trip; fan_ok HAL-tied at 50 kW");

// ---------- I. R4 external-review response — electrical proofs from the netlists ----------
console.log("\n=== I. R4 FIXES — proven in the built netlists ===");
for (const [sku, s] of Object.entries(SK)) {
  const A = B[sku].ac, D = B[sku].dc;
  // R4-2: bias COM ≡ driver GND2 ≡ FET Kelvin source, one node per channel (sample per stage)
  const kA = A.netOfPin.get("QA0A.KS");
  ck("I", `${sku} PFC driver GND2≡Kelvin≡bias-COM`, A.netOfPin.get("UA0G.GND2") === kA && A.netOfPin.get("PSA0G.COM") === kA && A.netOfPin.get("UA0G.TEST") === "DGND" && A.netOfPin.get("UA0G.INN") === "DGND" && A.netOfPin.get("UA0G.ASC") === kA,
    `one source-referenced node (${kA}) + TEST/IN- on GND1 + ASC inactive`);
  const kH = D.netOfPin.get("Q1H.KS");
  ck("I", `${sku} LLC driver GND2≡Kelvin≡bias-COM`, D.netOfPin.get("U1H.GND2") === kH && D.netOfPin.get("PS1H.COM") === kH,
    `high-side channel referenced to ${kH}`);
  // R4-5 + R4-4: every board sources V3P3 locally/through its slot, EN inside its abs max
  ck("I", `${sku} AC-DC V3P3 sourced + EN divider`, A.byName.has("UBKA") && A.netOfPin.get("REN1A.pin2") === A.netOfPin.get("UBKA.EN") && A.netOfPin.get("UBKA.EN") !== "V15",
    `local buck present; EN = 15 × 27/127 = ${f(15 * 27 / 127, 2)} V ≤ 5.5 rec (was tied to 15 V)`);
  // R4-3: aux loop closed with the right sign
  ck("I", `${sku} aux regulation loop`, A.netOfPin.get("QAUXFB.C") === A.netOfPin.get("UAUX.FB") && A.netOfPin.get("CAUXSS.pin1") === A.netOfPin.get("UAUX.SS") && A.netOfPin.get("RBR1B.pin2") === A.netOfPin.get("UAUX.BO"),
    "zener-NPN pulls FB DOWN as VCC rises (negative feedback); SS cap on the real pin 8; BO divider on the real pin 2");
  // R4-7: V24 monitor scale
  ck("I", `${sku} V24 monitor observability`, Math.abs(A.val.get("RM24A") - 82000) < 1,
    `82k/10k → 24 V reads ${f(24 * 10 / 92, 2)} V, clips at ${f(3.3 * 92 / 10, 1)} V (+26%)`);
  // R4-8: hardware S/P exclusion truth-table wiring
  ck("I", `${sku} S/P hardware exclusion`, D.netOfPin.get("UEXCL.A1") === "CTL_KPARA" && D.netOfPin.get("UEXCL.B1") === "CTL_KPARB" && D.netOfPin.get("UEXCL.A2") === "CTL_KSER" && D.netOfPin.get("UEXCL.Y4") === "KSER_STG1",
    "stage 1: KSER_STG1 = KSER AND NOT(KPARA OR KPARB) — R5-D adds the pre-insertion stage (section J)");
}
// R4-1: payload anode name ↔ netlist anode net lock (the render-seating defect class, closed at the data level)
{
  const pay = JSON.parse(readFileSync(`${ROOT}/calculations/out/sheets/40kw/apply/acdc-VIENNA-PFC.json`, "utf8"));
  let okA = 0, badA = 0;
  for (const c of pay.chunks.flat()) {
    if (!/^D[ABC]0[TBC]$/.test(c.designator ?? "")) continue;
    const aPin = (c.pins ?? []).find((q) => /^(A|anode)$/i.test(q.name ?? ""));
    // netlist convention (E38, re-proven here): port pin1 IS the anode. The payload's
    // pin_numberING is inverted for diodes (its "A" NAME is correct — that is what the sheets
    // seat by since R4-1); this lock pins name↔netlist so neither layer can drift again.
    const netA = B["40kw"].ac.netOfPin.get(`${c.designator}.pin1`);
    if (aPin && netA && aPin.signal_name === netA) okA++; else badA++;
  }
  ck("I", "payload anode ↔ netlist anode lock", badA === 0 && okA >= 9, `${okA} Vienna diodes agree, ${badA} disagree — the sheets seat by this name`);
}

// ---------- J. R5 external-review response — electrical proofs from the built netlists ----------
console.log("\n=== J. R5 FIXES — proven in the built netlists ===");
// R5-A: the watchdog verdict RESETS the brain (card) — one open-drain wire-OR node
{
  const C = B.card;
  const nrst = C.netOfPin.get("UCARD.pin14");
  ck("J", "card WDO ≡ NRST merge", !!nrst && C.netOfPin.get("USUPCARD.WDO") === nrst && C.netOfPin.get("JSWDCARD.RST") === nrst && C.netOfPin.get("UANDCARD.B1") === nrst && C.netOfPin.get("UANDCARD.B2") === nrst && C.netOfPin.get("RCARDRST.pin2") === nrst,
    `supervisor WDO + MCU NRST + SWD RST + both AND inhibits share one node (${nrst}) — hung MCU restarts with enables low`);
  ck("J", "card AND-gate bypass", C.netOfPin.get("CANDCARD.pin1") === C.netOfPin.get("UANDCARD.VCC") && C.netOfPin.get("CANDCARD.pin2") === "DGND",
    "100 n at the safety AND VCC (R5-C)");
  // R6-A: the merge must be VISIBLE — the canonical net NAME on every one of those pins is
  // NRST_CARD itself (the R5 net-net trace was electrically right but drew as two label groups;
  // the reviewer read "watchdog not connected" off the face).
  ck("J", "card WDO face-name = NRST_CARD", nrst === "NRST_CARD" && C.netOfPin.get("RWPUCARD.pin2") === "NRST_CARD",
    "one NAME, every pin — the sheet now shows the connection the netlist always had (R6-A)");
  // R7-A: comparator-INSTANCE-aware current-sense allocation (B and C shared CMP2 before)
  ck("J", "card CMP allocation (R7-A)", C.netOfPin.get("UCARD.pin17") === "AIN8" && C.netOfPin.get("UCARD.pin25") === "AIN9" && C.netOfPin.get("UCARD.pin16") === "AIN10" && C.netOfPin.get("UCARD.pin15") === "AIN11",
    "I_A0→PC2/CMP7_IP · I_B0→PA3/CMP1_IP · I_C0→PC1/CMP2_IP · VAC1→PC0/ADC — three INDEPENDENT comparators (GD32G553 Fig 2-3 verified)");
}
for (const [sku] of Object.entries(SK)) {
  const A = B[sku].ac, D = B[sku].dc;
  // R5-B: DESAT series R, blanking cap stays driver-side (PFC + LLC samples cover both cell uses)
  const dstA = A.netOfPin.get("UA0G.DST"), dstH = D.netOfPin.get("U1H.DST");
  ck("J", `${sku} DESAT series R`, A.netOfPin.get("RA0GDS.pin1") === dstA && A.netOfPin.get("RA0GDS.pin2") === A.netOfPin.get("DA0GS1.pin1") && A.netOfPin.get("CA0GBL.pin1") === dstA && D.netOfPin.get("R1HDS.pin1") === dstH && D.netOfPin.get("R1HDS.pin2") === D.netOfPin.get("D1HS1.pin1"),
    "DST → 100 Ω → HV diode chain, 100 pF blank on the pin side — all channels via the one cell");
  // R5-C: bypass at every flagged pin class
  ck("J", `${sku} driver + iso-amp bypass`, A.netOfPin.get("CA0GBV.pin1") === A.netOfPin.get("UA0G.VCC1") && A.netOfPin.get("CA0GBV.pin2") === "DGND" && D.netOfPin.get("C1HBV.pin1") === D.netOfPin.get("U1H.VCC1") && A.netOfPin.get("CV1VA.pin1") === A.netOfPin.get("UIVV1.VDD1") && A.netOfPin.get("CV1VB.pin1") === A.netOfPin.get("UIVV1.VDD2") && D.netOfPin.get("COVVA.pin1") === D.netOfPin.get("UIVOV.VDD1") && D.netOfPin.get("CSH1.pin1") === D.netOfPin.get("USHO.VDD1") && D.netOfPin.get("CSH2.pin1") === D.netOfPin.get("USHO.VDD2"),
    "NSI6611 VCC1 + AMC class both sides at the pins");
  ck("J", `${sku} floating-rail bulk + CAN`, A.netOfPin.get("C5BAC.pin1") === A.netOfPin.get("PS5AC.P5") && A.netOfPin.get("C5BBUS.pin1") === A.netOfPin.get("PS5BUS.P5") && D.netOfPin.get("C5BBKA.pin1") === D.netOfPin.get("PS5BKA.P5") && D.netOfPin.get("CSHB.pin1") === D.netOfPin.get("USHO.VDD1") && D.netOfPin.get("CCV1.pin1") === D.netOfPin.get("UCAN.VDD1") && D.netOfPin.get("CCV2.pin1") === D.netOfPin.get("UCAN.VDD2") && D.netOfPin.get("CCB5.pin1") === D.netOfPin.get("PSCAN.P5") && A.netOfPin.get("CQD.pin1") === A.netOfPin.get("UQD.VCC"),
    "1 µ reservoirs live at the module-fed rails; opto driver decoupled at its pins");
  // R4-8 exclusion stage (E67: the pre-insertion second stage retired with the pre-insertion pair) — the KSER coil input is gated
  ck("J", `${sku} S/P exclusion gate`, D.netOfPin.get("UEXCL.A1") === "CTL_KPARA" && D.netOfPin.get("UEXCL.B1") === "CTL_KPARB" && D.netOfPin.get("UEXCL.Y4") === "KSER_STG1" && D.netOfPin.get("ULB.IN1") === "KSER_STG1",
    "KSER coil = KSER ∧ ¬(KPARA∨KPARB) — the forbidden bank-short state is unreachable in hardware");
  // R6-E: output-current sign — VINP rides KB (OUTN side) so delivering current reads POSITIVE
  ck("J", `${sku} shunt differential sign`, D.netOfPin.get("USHO.VINP") === D.netOfPin.get("RSHO.KB") && D.netOfPin.get("USHO.VINN") === D.netOfPin.get("RSHO.KA"),
    "return current OUTN→B→A: KB high of KA when delivering — positive reading = charging (R6-E)");
  // R6-D/G: the last two bypass gaps + the cold-start reservoir at the pins
  ck("J", `${sku} aux + HMI bypass`, A.netOfPin.get("CVCCB.pin1") === A.netOfPin.get("UAUX.VCC") && A.netOfPin.get("CVCCB.pin2") === A.netOfPin.get("UAUX.GND") && A.netOfPin.get("CVCC.pin1") === A.netOfPin.get("UAUX.VCC") && D.netOfPin.get("CSR1.pin1") === D.netOfPin.get("USR1.VCC") && D.netOfPin.get("CSR1.pin2") === "DGND",
    "NCP1252 VCC: 100 n at the pin + 220 µF cold-start reservoir; 74HC595 decoupled (R6-D/G)");
  // R8: balance-string count per SKU — the passive-discharge model MUST match the drawn
  // population (the R7 report modeled one 2×47k pair per half everywhere; the 40/50 links
  // have TWO bank blocks in parallel — the external reviewer's retrace was right).
  const nSets = A.byName.has("RBALT1A") ? 2 : 1;
  ck("J", `${sku} link balance population`, nSets === (sku === "30kw" ? 1 : 2) && A.netOfPin.get("RBALT0A.pin1") === "DCP" && A.netOfPin.get("RBALB0B.pin2") === "DCN",
    `${nSets}× (2×47k) per half drawn → ${nSets === 1 ? "188k" : "94k"} full-link (R8-corrected discharge model uses the drawn count)`);
  // R7-B: PV bleeder drive at the guaranteed point — V15-fed LEDs behind the shared low-side
  ck("J", `${sku} PV bleeder drive network`, D.netOfPin.get("RPVLA.pin1") === "V15" && D.netOfPin.get("RPVLB.pin1") === "V15" && D.netOfPin.get("UPVA.CAT") === "PV_SINK" && D.netOfPin.get("UPVB.CAT") === "PV_SINK" && D.netOfPin.get("QPVD.C") === "PV_SINK" && D.netOfPin.get("QPVD.E") === "DGND" && D.netOfPin.get("RPVDP.pin1") === D.netOfPin.get("QPVD.B") && Math.abs(D.val.get("RPVBA") - 6.8e6) < 1e3 && Math.abs(D.val.get("RPVLA") - 1000) < 1,
    "1 k/2010 LED feed holds ≥10 mA to the 13.5 V rail floor via QPVD; 6.8 M gate bleed (R7-B/R8 — 25 °C-endpoint model, EVT gates the FET)");
  // R5-E: symmetric parallel gate branches — every paralleled device behind its OWN 2.2 Ω
  const vpar = A.byName.has("QA0A2"), lpar = D.byName.has("Q1H2");
  ck("J", `${sku} symmetric pair gates`,
    (!vpar || (A.netOfPin.get("RGA0A1.pin1") === "G_A0" && A.netOfPin.get("RGA0A1.pin2") === A.netOfPin.get("QA0A.G") && A.netOfPin.get("QA0A.G") !== "G_A0" && A.netOfPin.get("RGB0B1.pin2") === A.netOfPin.get("QB0B.G"))) &&
    (!lpar || (D.netOfPin.get("RG1H1.pin1") === "GH_1" && D.netOfPin.get("RG1H1.pin2") === D.netOfPin.get("Q1H.G") && D.netOfPin.get("Q1H.G") !== "GH_1" && D.netOfPin.get("RG3L1.pin2") === D.netOfPin.get("Q3L.G"))) &&
    (vpar || (A.netOfPin.get("QA0A.G") === "G_A0")) && (lpar || (D.netOfPin.get("Q1H.G") === "GH_1")),
    vpar || lpar ? "no bare-gate branch beside a resistored twin (di/dt shares match)" : "single devices ride the gate net directly (30 kW frozen)");
}


// ---------- K. E60 switched models vs peer-reviewed closed forms and a measured reference ----------
console.log("\n=== K. E60 — Vienna vs Friedli/Kolar closed forms · LLC vs Wolfspeed CRD-30DD12N-K measurement ===");
// Friedli, Hartmann, Kolar, "The Essence of Three-Phase PFC Rectifier Systems — Part II", IEEE TPEL 29(2)
// 2014: CCM local averages with d = 1 − |m|. Integrated numerically with the min-max offset the modulator
// uses; switch = the bidirectional position (both half-cycles), diode = one rail diode.
const vienna = readFileSync(`${ROOT}/calculations/out/vienna-switched.csv`, "utf8").trim().split("\n").filter((l) => !l.startsWith("#")).map((l) => l.split(","));
for (const sku of ["30kw", "40kw", "50kw"]) {
  const r = vienna.find((c) => c[0] === sku && c[1] === "330-full-bus830-lot92");
  const M = (+r[2] * Math.SQRT2 / Math.sqrt(3)) / (+r[3] / 2), Ia = +r[7], N = 20000;
  let sw2 = 0, dA = 0, d2 = 0;
  for (let k = 0; k < N; k++) {
    const t = 2 * Math.PI * (k + 0.5) / N, u = [0, 1, 2].map((j) => M * Math.sin(t - j * 2 * Math.PI / 3));
    const m = Math.abs(u[0] - (Math.max(...u) + Math.min(...u)) / 2), i = Ia * Math.sin(t);
    sw2 += i * i * (1 - m); if (i > 0) { dA += i * m; d2 += i * i * m; }
  }
  const cf = { sw: Math.sqrt(sw2 / N), da: dA / N, dr: Math.sqrt(d2 / N) }, sim = { sw: +r[11], da: +r[12], dr: +r[13] };
  const dev = Object.keys(cf).map((q) => sim[q] / cf[q] - 1);
  ck("K", `${sku} Vienna device currents vs closed form (330 VAC, bus 830)`, dev.every((d) => Math.abs(d) <= 0.05),
    `M ${f(M, 3)}, Ia ${Ia} A → switch ${f(cf.sw, 1)} / diode avg ${f(cf.da, 1)} / diode rms ${f(cf.dr, 1)} A vs cycle-by-cycle ${sim.sw} / ${sim.da} / ${sim.dr} A (${dev.map((d) => `${d >= 0 ? "+" : ""}${f(100 * d, 1)} %`).join(" · ")}; the switched model adds ripple, ≤ ±5 %)`);
}
// E67 anchor: the one-bridge tank current at the HIGH-mode floor against the full-wave first-harmonic closed form — load current
// P/(0.9·n·Vbank) in quadrature with the simulated magnetizing peak/√3 (the CRD-30DD12N-K 3-phase scaling retired with the sections)
{
  const L = readFileSync(`${ROOT}/simulation-results/30kw/llc-stress.csv`, "utf8").split("\n").filter((l) => l && !l.startsWith("#")), h = L[0].split(",");
  const r = Object.fromEntries(L.find((l) => l.startsWith("SER250-full,")).split(",").map((v, i) => [h[i], v]));
  const cf = Math.hypot(30e3 / (0.9 * 2 * 250), +r.Im_pk_A / Math.sqrt(3)), d = +r.Ip_rms_A / cf - 1;
  ck("K", "30kw LLC SER-250 tank current vs the first-harmonic closed form", Math.abs(d) <= 0.10,
    `sim ${r.Ip_rms_A} A rms (${r.fsw_kHz} kHz, above resonance) vs closed form ${f(cf, 1)} A (${f(100 * d, 1)} %, ±10 % band — FHA ignores the rectifier conduction-angle shape)`);
}

console.log(`\n${checks} checks — ${fails ? fails + " FAILURE(S)" : "ALL CLEAN"}`);
process.exit(fails ? 1 : 0);
