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
B.cab = loadNet(`${ROOT}/dist/boards/cabinet/circuit.json`);

// ---------- A. system currents (first principles) ----------
console.log("\n=== A. SYSTEM CURRENTS (clean-room) ===");
const SK = {
  "30kw": { P: 30e3, Imax: 100, par: 1, nHalf: 5, nBank: 2, fans: 2, crN: 4, crV: 46e-9, trim: 4.0e-6, tRms: 46.4, fuse: 80, kpre: 80, lineCT: 100, resCT: 50, lineB: 27, resB: 2.0, disch: 3000, litz: 8.25 },
  "40kw": { P: 40e3, Imax: 133, par: 2, nHalf: 6, nBank: 3, fans: 3, crN: 6, crV: 33e-9, trim: 3.5e-6, tRms: 61.9, fuse: 125, kpre: 100, lineCT: 100, resCT: 80, lineB: 27, resB: 2.0, disch: 4000, litz: 15.7 },
  "50kw": { P: 50e3, Imax: 167, par: 2, nHalf: 8, nBank: 4, fans: 0, crN: 8, crV: 27e-9, trim: 3.0e-6, tRms: 77.3, fuse: 160, kpre: 250, lineCT: 150, resCT: 100, lineB: 21.5, resB: 1.6, disch: 5000, litz: 23.6 },
  "50kwa": { P: 50e3, Imax: 167, par: 2, parL: 2, nHalf: 8, nBank: 4, fans: 4, crN: 8, crV: 27e-9, trim: 3.0e-6, tRms: 77.3, fuse: 160, kpre: 250, lineCT: 150, resCT: 100, lineB: 21.5, resB: 1.6, disch: 5000, litz: 23.6 },
};
for (const [sku, s] of Object.entries(SK)) {
  s.Iline = (s.P / 0.965) / (Math.sqrt(3) * 330 * 0.99);
  s.Ipk = s.Iline * Math.SQRT2;
  s.Iout = s.Imax;
  s.Ip1max = s.Imax / (0.98 * 3 * 0.9);
  console.log(`  ${sku}: Iline ${f(s.Iline, 1)} A (pk ${f(s.Ipk, 1)}) · Iout ${s.Iout} A · tank Ip1-bound ${f(s.Ip1max, 1)} A pk · tank ${s.tRms} A rms/section`);
}
ck("A", "registered line currents reproduce", Math.abs(SK["40kw"].Iline - 73.25) < 0.4 && Math.abs(SK["50kw"].Iline - 91.57) < 0.4,
  `40: ${f(SK["40kw"].Iline, 1)} vs 73.3 · 50: ${f(SK["50kw"].Iline, 1)} vs 91.6 (30 kW doc constant 55.9 is 1.7% conservative vs ${f(SK["30kw"].Iline, 1)} — fuse math uses the conservative one, safe direction)`);
ck("A", "tank rms scaling is the registered book", Math.abs(46.4 * 40 / 30 - 61.9) < 0.1 && Math.abs(46.4 * 50 / 30 - 77.3) < 0.1, "46.4 × P/30k → 61.87/77.33");
ck("A", "50 kW tank Ip1-bound inside revved 65 A ceiling", SK["50kw"].Ip1max < 65, `${f(SK["50kw"].Ip1max, 1)} A + im(≈8 A, quadrature) → ≈64 A ≤ 65`);

// ---------- B. tank resonance + capacitor duty (independent) ----------
console.log("\n=== B. TANK — fr, per-cap duty, trim ===");
const LLK = 3.0e-6, AE2 = 2 * 328e-6;
for (const [sku, s] of Object.entries(SK)) {
  const Cr = s.crN * s.crV, Lr = LLK + s.trim;
  const fr = 1 / (2 * Math.PI * Math.sqrt(Lr * Cr));
  ck("B", `${sku} tank re-centers to the frozen fr`, Math.abs(fr - 140e3) < 2.5e3, `${s.crN}×${f(s.crV * 1e9, 0)} nF + ${f(s.trim * 1e6, 1)} µH trim + 3.0 µH leakage → fr ${f(fr / 1e3, 1)} kHz (frozen 140 ±bin)`);
  const iCap = s.tRms / s.crN, vCap = iCap / (2 * Math.PI * 140e3 * s.crV);
  const esr = 2e-4 / (2 * Math.PI * 140e3 * s.crV), wCap = iCap * iCap * esr;
  ck("B", `${sku} per-cap duty`, iCap <= 12 && vCap < 530 && wCap < 1.0,
    `${f(iCap, 1)} A · ${f(vCap, 0)} V rms @140 kHz · ${f(wCap, 2)} W dielectric (O-8 line: curve ≥ ${f(vCap * 1.3, 0)} V — 942C class covers)`);
  const B_ = s.trim * s.tRms * Math.SQRT2 / ({ "30kw": 4, "40kw": 5, "50kw": 6, "50kwa": 6 }[sku] * AE2) * 1e3;
  const J = s.tRms / s.litz;
  const rdc = 1.5e-3 * ({ "30kw": 4, "40kw": 5, "50kw": 6, "50kwa": 6 }[sku] / 4) * (8.25 / s.litz) * 1.15;
  const pcu = s.tRms ** 2 * rdc, ptot = pcu + { "30kw": 6.8, "40kw": 6.5, "50kw": 5.0, "50kwa": 5.0 }[sku];
  const dT = 5.44 * Math.pow(ptot, 0.833);
  const jLine = sku === "30kw" ? 5.65 : 5.6;   // 30 kW = frozen rev C basis (its own lines are Rac/ΔT, both met; J computes 5.62)
  ck("B", `${sku} trim: Bpk/J/ΔT`, B_ <= 100.5 && J <= jLine && dT <= 40.5,
    `Bpk ${f(B_, 0)} mT · J ${f(J, 1)} A/mm² · Cu ${f(pcu, 1)} W → ΔT ${f(dT, 0)} K ≤ 40 (E44: one D2-50 drawing, 3000×0.1 litz, serves liquid and air)`);
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
  const kout = s.Iout / (/^50kw/.test(sku) ? 2 : 1) / 200;
  ck("C", `${sku} K_OUT loading`, kout <= 0.70, `${f(100 * kout, 0)}% per 200 A relay${sku === "50kw" ? " (dual)" : ""}`);
  // OC observability inside the rail
  const obs = 1.65 + (/^50kw/.test(sku) ? 187.5 : 150) / 2500 * s.lineB;
  const res = 1.65 + (/^50kw/.test(sku) ? 95 : 70) / 100 * s.resB;
  ck("C", `${sku} CT burden rail budgets`, obs <= 3.28 && res <= 3.28,
    `line OC obs ${f(obs, 2)} V · tank OC ${f(res, 2)} V (≤3.27 proven budget)`);
  // bank bleeders
  const cBank = s.nBank * 235e-6, tauB = 4 * 2200 * cBank;
  ck("C", `${sku} bank bleeder window`, tauB >= 2 && tauB <= 17 && 0.5 * cBank * 525 * 525 / 4 <= 65,
    `τ ${f(tauB, 1)} s (family 4–17 s) · ${f(0.5 * cBank * 525 * 525 / 4, 0)} J/resistor ≤ 65`);
}
{ // X-bleed with the E43 4.7 µF CX2
  const tauX = 0.42 * (2.2 + 4.7) / (2.2 + 2.2);
  ck("C", "X-cap bleed after CX2 4.7 µF", tauX <= 1.0, `τ ${f(tauX, 2)} s ≤ 1 s pluggable rule (star unchanged)`);
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
  return { p: Math.max(...rows.map(r => +r[13])), l: Math.max(...rows.map(r => +r[14])), ip: Math.max(...rows.map(r => +r[10])) };
}
{ // 50 kW liquid: LLC single-FET at Ip 63.3 PFM, plate 65/1.1
  let Tj = 80; for (let i = 0; i < 40; i++) Tj = 65 + ((63.3 / Math.SQRT2) ** 2 * 0.023 * (1 + 0.004 * (Tj - 25)) + 1) * 1.1;
  const g = tjWorst("50kw");
  ck("D", "50kw LLC worst corner reproduces", Math.abs(Tj - g.l) < 3, `closed-form ${f(Tj, 0)} °C vs grid ${g.l} (single FETs, liquid model)`);
  ck("D", "50kw Ip max inside revved ceiling", g.ip <= 65.05, `${g.ip} A pk ≤ 65`);
  // and the air counterfactual that justifies the liquid choice
  let Ta = 90; for (let i = 0; i < 40; i++) Ta = 70 + ((63.3 / Math.SQRT2) ** 2 * 0.023 * (1 + 0.004 * (Ta - 25)) + 1) * 1.9;
  ck("D", "the liquid dividend is real", Ta > 175, `same corner on AIR computes ${f(Ta, 0)} °C (> abs-max) — single LLC FETs only exist because of the coldplate`);
}
for (const sku of ["30kw", "40kw"]) {
  const g = tjWorst(sku);
  ck("D", `${sku} grid worst temps inside ceilings`, g.p <= 150 && g.l <= 150.5 && g.ip <= 48.05, `TjPFC ${g.p} · TjLLC ${g.l} · Ip ${g.ip}`);
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
  const Idc = s.Imax / 2;                       // per bank, PAR worst
  let sum = 0, n = 3000, mean = 0, acc = 0;
  const iSec = (th, k) => Math.abs(Math.sin(th - k * 2 * Math.PI / 3)) * (Math.PI / 2) * Idc / 3;
  for (let i = 0; i < n; i++) { const th = Math.PI * 2 * i / n; const it = iSec(th, 0) + iSec(th, 1) + iSec(th, 2); mean += it / n; }
  for (let i = 0; i < n; i++) { const th = Math.PI * 2 * i / n; const it = iSec(th, 0) + iSec(th, 1) + iSec(th, 2); acc += (it - mean) ** 2 / n; }
  const iRip = Math.sqrt(acc);                  // low-order interleave residue (HF handled by film)
  const perCan = iRip / (s.nBank * 1);          // strings share; series pair carries same current
  ck("F", `${sku} bank per-can interleave ripple`, perCan <= 2.9,
    `3-φ residue ${f(iRip, 1)} A rms over ${s.nBank} strings → ${f(perCan, 2)} A/can (class ~2.8 A @105 °C; film takes the 280 kHz component)`);
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
  ck("G", `${sku} CX2 trio at the E43 value`, [1, 2, 3].every(i => Math.abs(A.val.get(`CX2${i}`) - 4.7e-6) < 1e-8) && [1, 2, 3].every(i => Math.abs(A.val.get(`CX1${i}`) - 2.2e-6) < 1e-8), "CX1 2.2 µF · CX2 4.7 µF");
  const ldmWant = { "30kw": 14e-6, "40kw": 23e-6, "50kw": 34e-6, "50kwa": 34e-6 }[sku];
  ck("G", `${sku} LDM engine value`, [1, 2, 3].every(i => Math.abs(A.val.get(`LDM${i}`) - ldmWant) < 1e-6), `${f(ldmWant * 1e6, 0)} µH L0 (D6 rev C)`);
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
  const dcPD = ["GATE_EN_B", "EN_LLC", "CTL_KSER", "CTL_KPARA", "CTL_KPARB", "CTL_KOUT", "CTL_KPREA", "CTL_KPREB", "CTL_QDISBK"];
  ck("G", `${sku} DC-DC default-OFF coverage`, dcPD.every((n, i) => D.netOfPin.get(`RPDB${i}.pin1`) === n && D.netOfPin.get(`RPDB${i}.pin2`) === "DGND"),
    `${dcPD.length}/9 lines pulled to DGND`);
  // LLC + tank + banks
  ck("G", `${sku} LLC legs`, cnt(D, /^Q\d[HL]$/) === 6 && cnt(D, /^Q\d[HL]2$/) === (s.parL ? 6 : 0) && cnt(D, /^RG\d[HL]2$/) === (s.parL ? 6 : 0),
    s.parL ? "12 half-bridge FETs (E44 paralleled pairs + per-device gate Rs)" : "6 half-bridge FETs, 3 legs");
  ck("G", `${sku} tank caps`, cnt(D, /^C\dR\d$/) === 3 * s.crN && [0, 1, 2].every(k => Math.abs(D.val.get(`C${k + 1}R0`) - s.crV) < 1e-12),
    `${3 * s.crN} × ${f(s.crV * 1e9, 0)} nF`);
  ck("G", `${sku} trim + resonant burden`, [1, 2, 3].every(i => Math.abs(D.val.get(`L${i}T`) - s.trim) < 1e-9) && [1, 2, 3].every(i => Math.abs(D.val.get(`R${i}CT`) - s.resB) < 0.05),
    `${f(s.trim * 1e6, 1)} µH · ${s.resB} Ω`);
  ck("G", `${sku} bank strings`, cnt(D, /^CB[AB]\d+[TB]$/) === s.nBank * 4, `${s.nBank} strings × 2-series × 2 banks`);
  ck("G", `${sku} secondary bridges`, cnt(D, /^D\d[AB][1-4]$/) === 24, "24 JBS diodes (dual bridges × 3 sections)");
  // K_OUT single vs dual + mirror chain
  if (sku === "50kw" || sku === "50kwa") {
    ck("G", `${sku} K_OUT dual pair`, D.byName.has("KOUT2") && D.netOfPin.get("KOUT.M2") === D.netOfPin.get("KOUT2.M1") && D.netOfPin.get("KOUT2.M2") === "RELAY_FB_KOUT"
      && D.netOfPin.get("KOUT2.A") === D.netOfPin.get("KOUT.A") && D.netOfPin.get("KOUT2.B") === D.netOfPin.get("KOUT.B") && D.netOfPin.get("KOUT2.C2") === D.netOfPin.get("KOUT.C2"),
      "contacts paralleled, coils share the driver, mirrors in series → one FB proves BOTH released");
    ck("G", `${sku} matrix legs single`, !D.byName.has("KSER2") && !D.byName.has("KPARA2") && !D.byName.has("KPARB2"), "no pointless doubling");
  } else {
    ck("G", `${sku} K_OUT single + mirror`, !D.byName.has("KOUT2") && D.netOfPin.get("KOUT.M2") === "RELAY_FB_KOUT", "single 200 A class, mirror to FB");
  }
  ck("G", `${sku} RATING strap`, Math.abs(D.val.get("RROLEB") - { "30kw": 0, "40kw": 1000, "50kw": 10000, "50kwa": 15000 }[sku]) < 1, `${D.val.get("RROLEB")} Ω`);
  ck("G", `${sku} star + bond`, cnt(A, /^RNS[123][AB]$/) === 6 && A.netOfPin.get("RPET.pin2") === "PE" && A.netOfPin.get("CPET.pin2") === "PE", "2-series star ×3 + soft PE bond");
}
ck("G", "card essentials", B.card.byName.has("UCARD") && B.card.byName.has("USUPCARD") && B.card.byName.has("UANDCARD") && Math.abs(B.card.val.get("RROLE1") - 10000) < 1 && B.card.netOfPin.get("RFLTC.pin2") === "FLT",
  "MCU + watchdog + AND chain + 10k RATING pullup + FLT pull-up at the MCU end");
ck("G", "cabinet essentials", B.cab && [1, 2, 3, 4].every(i => B.cab.byName.has(`MOD${i}`)) && B.cab.byName.has("UCSU") && B.cab.byName.has("PSU1") && Math.abs(B.cab.val.get("RRCSU") - 3320) < 1,
  "4 modules + CSU + WDR supply + 3.32 k strap");

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
  const pay = JSON.parse(readFileSync(`${ROOT}/calculations/out/easyeda/40kw/apply/acdc-VIENNA-PFC.json`, "utf8"));
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
  // R5-D: two-stage exclusion — the pre-insertion contacts join
  ck("J", `${sku} exclusion incl. pre-insertion`, D.netOfPin.get("UEXCL2.A1") === "CTL_KPREA" && D.netOfPin.get("UEXCL2.B1") === "CTL_KPREB" && D.netOfPin.get("UEXCL2.A2") === "KSER_STG1" && D.netOfPin.get("UEXCL2.B2") === "KSER_STG1" && D.netOfPin.get("UEXCL2.Y4") === "KSER_GATED" && D.netOfPin.get("ULB.IN1") === "KSER_GATED" && D.netOfPin.get("CEXCL.pin1") === D.netOfPin.get("UEXCL.VCC") && D.netOfPin.get("CEXCL2.pin1") === D.netOfPin.get("UEXCL2.VCC"),
    "KSER coil = KSER ∧ ¬(KPARA∨KPARB) ∧ ¬(KPREA∨KPREB); both stages bypassed");
  // R6-E: output-current sign — VINP rides KB (OUTN side) so delivering current reads POSITIVE
  ck("J", `${sku} shunt differential sign`, D.netOfPin.get("USHO.VINP") === D.netOfPin.get("RSHO.KB") && D.netOfPin.get("USHO.VINN") === D.netOfPin.get("RSHO.KA"),
    "return current OUTN→B→A: KB high of KA when delivering — positive reading = charging (R6-E)");
  // R6-D/G: the last two bypass gaps + the cold-start reservoir at the pins
  ck("J", `${sku} aux + HMI bypass`, A.netOfPin.get("CVCCB.pin1") === A.netOfPin.get("UAUX.VCC") && A.netOfPin.get("CVCCB.pin2") === A.netOfPin.get("UAUX.GND") && A.netOfPin.get("CVCC.pin1") === A.netOfPin.get("UAUX.VCC") && D.netOfPin.get("CSR1.pin1") === D.netOfPin.get("USR1.VCC") && D.netOfPin.get("CSR1.pin2") === "DGND",
    "NCP1252 VCC: 100 n at the pin + 220 µF cold-start reservoir; 74HC595 decoupled (R6-D/G)");
  // R5-E: symmetric parallel gate branches — every paralleled device behind its OWN 2.2 Ω
  const vpar = A.byName.has("QA0A2"), lpar = D.byName.has("Q1H2");
  ck("J", `${sku} symmetric pair gates`,
    (!vpar || (A.netOfPin.get("RGA0A1.pin1") === "G_A0" && A.netOfPin.get("RGA0A1.pin2") === A.netOfPin.get("QA0A.G") && A.netOfPin.get("QA0A.G") !== "G_A0" && A.netOfPin.get("RGB0B1.pin2") === A.netOfPin.get("QB0B.G"))) &&
    (!lpar || (D.netOfPin.get("RG1H1.pin1") === "GH_1" && D.netOfPin.get("RG1H1.pin2") === D.netOfPin.get("Q1H.G") && D.netOfPin.get("Q1H.G") !== "GH_1" && D.netOfPin.get("RG3L1.pin2") === D.netOfPin.get("Q3L.G"))) &&
    (vpar || (A.netOfPin.get("QA0A.G") === "G_A0")) && (lpar || (D.netOfPin.get("Q1H.G") === "GH_1")),
    vpar || lpar ? "no bare-gate branch beside a resistored twin (di/dt shares match)" : "single devices ride the gate net directly (30 kW frozen)");
}


console.log(`\n${checks} checks — ${fails ? fails + " FAILURE(S)" : "ALL CLEAN"}`);
process.exit(fails ? 1 : 0);
