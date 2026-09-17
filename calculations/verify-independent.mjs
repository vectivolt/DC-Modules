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
// E81 [SYNC] (section L): the ONE exception to this file's no-reuse rule, and deliberately so —
// the per-die turn-off snubber is a TANK parameter that the schematic has to draw, so the check
// reads tanks.mjs as DATA and compares it against the built netlist. It verifies nothing of the
// tank physics; it verifies that two carriers of the same number agree.
import { TANKS } from "./llc/tanks.mjs";
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
  "30kw": { P: 30e3, Imax: 100, par: 1, parL: 1, nHalf: 5, fans: 3, crN: 7, crV: 33e-9, lr: 5.00e-6, tRms: 78, fuse: 80, kpre: 80, lineCT: 100, lineB: 22, resB: 0.47, F01: 120, F11: 140, disch: 3000, litz: 15.7, nF: 9, nE: 0, dPar: 2, dout: 150 },
  "40kw": { P: 40e3, Imax: 133, par: 1, parL: 2, nHalf: 6, fans: 3, crN: 9, crV: 33e-9, lr: 3.99e-6, tRms: 100, fuse: 125, kpre: 100, lineCT: 150, lineB: 18, resB: 0.36, F01: 155, F11: 180, disch: 4000, litz: 19.6, nF: 12, nE: 0, dPar: 2, dout: 200 },
  "50kw": { P: 50e3, Imax: 167, par: 1, parL: 2, nHalf: 8, fans: 0, crN: 11, crV: 33e-9, lr: 3.20e-6, tRms: 120, fuse: 160, kpre: 250, lineCT: 150, lineB: 13, resB: 0.30, F01: 195, F11: 220, disch: 5000, litz: 23.6, nF: 14, nE: 0, dPar: 2, dout: 250 },
  "50kwa": { P: 50e3, Imax: 167, par: 1, parL: 2, nHalf: 8, fans: 4, crN: 11, crV: 33e-9, lr: 3.20e-6, tRms: 120, fuse: 160, kpre: 250, lineCT: 150, lineB: 13, resB: 0.30, F01: 195, F11: 220, disch: 5000, litz: 23.6, nF: 14, nE: 0, dPar: 2, dout: 250 },
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
// E81 (F-B-3): the MMF breadth in the 1-D energy model is the CONDUCTOR BAND (28 mm), not the 41 mm
// window height — leakage ∝ 1/b, so the window under-stated it by 41/28 = 1.46×. This clean-room
// model made the same substitution the engine did and is corrected here independently; with the
// re-issued D2 nominals above it lands back on the committed tank Lr to three figures.
const llkOf = (x) => 4e-7 * Math.PI * x.N * x.N * x.mlt / (4 * 0.028) * (2 * 0.3e-3 + (2 * x.N * x.nf * (x.foil + 50e-6) + x.N * x.cuP / (0.55 * 0.028) + 0.6e-3) / 3);
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
  // E82 (M-12): the star resistor is read from the NETLIST, not assumed — E68 added a third X stage and left the 47 k star
  // in place, which put the terminals over the 5 s rule for permanently connected equipment. Both rules are checked now.
  const A30 = B["30kw"].ac, cX = ((A30.val.get("CX01") + A30.val.get("CX11") + A30.val.get("CX21") + A30.val.get("CX24")) / 3 + (A30.val.get("CDMP1") ?? 0)) * 1e6;
  const rStar = A30.val.get("RNS1A");
  const tauX = 0.42 * cX / (2.2 + 2.2) * (rStar / 47e3);
  const t60 = tauX * Math.log(475 * Math.SQRT2 / 60);
  ck("C", "X-cap bleed after the star X2 stages + damper", Math.abs(rStar - 33e3) < 1 && tauX <= 1.0 && t60 <= 5.0,
    `${f(rStar / 1e3, 0)} k per star element (netlist) · τ ${f(tauX, 2)} s for ${f(cX, 1)} µF line-to-line equivalent ≤ 1 s pluggable rule · 672 V pk → 60 V in ${f(t60, 2)} s ≤ 5 s permanently-connected rule (E82 M-12: 47 k read ${f(t60 * 47 / 33, 2)} s here and 5.3 / 6.4 s on the E82 per-phase-star form)`);
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
  // E82 (C-11): the E81 F-L-1 exclusion (150 V output in phase shift on the two-die SKUs) is GONE here exactly as it is in
  // stress-audit — the weak leg's dead time was the defect, the grid charged each weak-leg die twice, and with both fixed
  // no row fails, so the ceiling check and the closed-form reproduction run on EVERY row of the envelope.
  const rows = grid.filter(r => r[0] === sku && r[6] !== "IDLE" && r[13] !== "");
  const wl = rows.reduce((a, r) => (+r[14] > +a[14] ? r : a));
  return { p: Math.max(...rows.map(r => +r[13])), l: +wl[14], ip: Math.max(...rows.map(r => +r[10])), lRow: wl };
}
{ // 50 kW liquid: re-derive the grid's OWN worst LLC row closed-form (E67: full bridge, par FETs per position)
  // E81: the grid's flat 1 W (PFM) / 8 W (PSM) turn-off placeholder is gone — it now carries a real
  // per-position term. This file re-derives that term INDEPENDENTLY from the three declared inputs
  // (tanks.mjs k_off for the fitted C_s / R_g,off pair, the row's own bus and I_toff, and
  // f_sw = fn × fr computed from the tank's own L and C) and checks BOTH the watts and the junction.
  const g = tjWorst("50kw"), ipW = +g.lRow[10], par = SK["50kw"].parL;
  const t50 = TANKS["50kw"], fr50 = 1 / (2 * Math.PI * Math.sqrt(t50.Lr * t50.crN * t50.crNF * 1e-9));
  const fsw = +g.lRow[9] * fr50, woffIndep = t50.koff * +g.lRow[8] * +g.lRow[19] * fsw, woffGrid = +g.lRow[18];
  const plate = { cold: 10, room: 45, hot: 65 }[g.lRow[4]];
  // E82 (M-06): the R_DS(on) slope is the proxy datasheet's 0.0054 /K (21 → 38 mΩ, 25 → 175 °C), typed here independently of the grid
  let Tj = 80; for (let i = 0; i < 40; i++) Tj = plate + ((ipW / Math.SQRT2 / par) ** 2 * 0.023 * (1 + 0.0054 * (Tj - 25)) + woffIndep / par) * 0.65;   // E68 clip mount onto the plate
  ck("D", "50kw LLC turn-off watts re-derived from k_off · V · I_toff · f_sw", Math.abs(woffIndep - woffGrid) <= 0.12 * Math.max(woffGrid, 1),
    `closed-form ${f(woffIndep, 1)} W/position vs grid ${f(woffGrid, 1)} W (k_off ${f(t50.koff * 1e9, 1)} nJ/(V·A) at C_s ${f(t50.cs * 1e12, 0)} pF, bus ${g.lRow[8]} V, I_toff ${g.lRow[19]} A, f_sw ${f(fsw / 1e3, 0)} kHz)`);
  ck("D", "50kw LLC worst corner reproduces", Math.abs(Tj - g.l) < 4, `closed-form ${f(Tj, 0)} °C vs grid ${g.l} at its worst row (${g.lRow[2]} V ${g.lRow[5]} ${g.lRow[6]} ${g.lRow[4]}, Ip ${ipW} A rms, ${f(woffIndep, 1)} W turn-off per position — ${par} FETs per position, liquid model)`);
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
    `${nBias} bias modules + coils ${f(coils, 1)} W + fans ${fansW} W (${s.fans} fitted — E81: 30 kW gains a third) + logic ≈ ${f(est, 0)} W ≤ 93 (85% of 110)`);
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
  // E81 (F-C-4 / F-G-1 FIX-D): the DC-DC entry film. Four 1 µF parts put the bank on a 268–425 kHz
  // anti-resonance with the stud loop, inside the 280–406 kHz 2·fsw band, and the cans then carried
  // 6.5–18 A rms against ≈3 A. Sixteen films plus one 2.2 µF + 0.33 Ω series-RC across the same
  // rails at the bridge: per-can 0.77 A and the bus ring 37 V instead of 209 V.
  // E81 close-out: the count is PER SKU — the 40 nH-stud deck holds the 30/40 kW cans at 58/68 % of the RFQ ripple line with
  // 16 films, the 50 kW pair needs 20 (81 % at 16). Independent re-declaration here; parts-db ENTRY_FILM and boards.tsx are the
  // other two carriers, tied to each other by current-coordination [SYNC].
  const N_ENTRY_FILM = { "30kw": 16, "40kw": 16, "50kw": 20, "50kwa": 20 }[sku];
  ck("G", `${sku} DC-link entry film + RC damper (E81 FIX-D)`,
    cnt(D, /^CF\d+$/) === N_ENTRY_FILM && Math.abs(D.val.get("CF0") - 1e-6) < 1e-9
    && Math.abs(D.val.get("CFDMP") - 2.2e-6) < 1e-8 && D.netOfPin.get("CFDMP.pin1") === "DCP"
    && D.netOfPin.get("CFDMP.pin2") === D.netOfPin.get("RFDMP.A") && D.netOfPin.get("RFDMP.B") === "DCN",
    `${cnt(D, /^CF\d+$/)} × 1 µF/1100 V at the bridge (need ${N_ENTRY_FILM}) + 2.2 µF in series with 0.33 Ω across DCP–DCN`);
  ck("G", `${sku} film-only banks`, cnt(D, /^CF[AB]\d+$/) === 2 * s.nF && !D.byName.has("LFA") && !D.byName.has("CEA0") && D.netOfPin.get("CFA0.pin1") === "BKAP" && D.netOfPin.get("CFB0.pin2") === "BKBN" && D.netOfPin.get("D1A1.pin2") === "BKAP",
    `per bank ${s.nF}× 2.2 µF film across BK·P–BK·N, JBS cathodes straight onto the bank (E68)`);
  ck("G", `${sku} secondary bridges`, cnt(D, /^D1[AB][1-4](P[23])?$/) === 8 * s.dPar, `${8 * s.dPar} JBS (2 bridges × 4 positions × ${s.dPar})`);
  ck("G", `${sku} output: blocking diode, no K_OUT / pre-insertion`, D.netOfPin.get("DOUT.pin1") === "BKAP" && D.netOfPin.get("DOUT.pin2") === "OUTP" && !D.byName.has("KOUT") && !D.byName.has("KPREA") && !D.byName.has("RPREA") && !D.byName.has("UEXCL2"),
    "BKAP → DOUT → OUTP · matrix KSER/KPARA/KPARB only (E67)");
  ck("G", `${sku} RATING strap`, Math.abs(D.val.get("RROLEB") - { "30kw": 0, "40kw": 1000, "50kw": 10000, "50kwa": 15000 }[sku]) < 1, `${D.val.get("RROLEB")} Ω`);
  // E65: the filter the pre-compliance and stability gates model — Y trios on BOTH CM-choke nodes (two CM stages)
  // and the CX2-node Rd–Cd damper; then the PE leakage those Y caps imply
  // E81 (F-L-4): the CONVERTER-node trio is 10 nF, the inter-choke trio stays 4.7 nF.
  const yOn = (node, c) => A.names.filter((n) => /^CY\d$/.test(n) && A.netOfPin.get(`${n}.pin1`) === node && A.netOfPin.get(`${n}.pin2`) === "PE" && Math.abs(A.val.get(n) - c) < 1e-11).length;
  ck("G", `${sku} two-stage CM ladder`, [1, 2, 3].every((p) => yOn(`AC${p}`, 10e-9) === 1 && yOn(`AC${p}M`, 4.7e-9) === 1 && A.netOfPin.get(`CMC1.B${p}`) === `AC${p}M` && A.netOfPin.get(`CMC2.A${p}`) === `AC${p}M`),
    "Y2 10 nF L-PE on the converter node AC1..3 (E81: the LLC bridge counted as a CM source) and Y1 4.7 nF on AC1M..3M between CMC1 and CMC2");
  // E81 (F-G-5, reviewer E sweep): the damper is per SKU — 50 kW (liquid and air) 4.7 µF / 4.7 Ω,
  // 30/40 kW 2.2 µF / 6.8 Ω. Undamped-to-lightly-damped the filter's LCL modes oscillate at
  // 75.6 % (40 kW) / 194.7 % (50 kW) of the SHIPPED 15 µs control delay.
  const dmpC = /^50kw/.test(sku) ? 4.7e-6 : 2.2e-6, dmpR = /^50kw/.test(sku) ? 4.7 : 6.8;
  ck("G", `${sku} CX2-node damper`, [1, 2, 3].every((p) => A.netOfPin.get(`CDMP${p}.pin1`) === `AC${p}` && A.netOfPin.get(`CDMP${p}.pin2`) === A.netOfPin.get(`RDMP${p}.pin1`)
    && A.netOfPin.get(`RDMP${p}.pin2`) === `AC${p % 3 + 1}` && Math.abs(A.val.get(`CDMP${p}`) - dmpC) < 1e-8 && Math.abs(A.val.get(`RDMP${p}`) - dmpR) < 0.01),
    `${dmpC * 1e6} µF + ${dmpR} Ω in series, delta across AC1..3 (E81 per-SKU)`);
  // E68: the InfyPower filter — three star X2 stages (4.7 µF each, own floating star), no DM choke
  const starOk = (pre, node, star) => [1, 2, 3].every((p) => A.netOfPin.get(`${pre}${p}.pin1`) === node(p) && A.netOfPin.get(`${pre}${p}.pin2`) === star && Math.abs(A.val.get(`${pre}${p}`) - 4.7e-6) < 1e-8);
  ck("G", `${sku} star X2 stages, no DM choke`, starOk("CX0", (p) => `LF${p}`, "XSTAR0") && starOk("CX1", (p) => `AC${p}M`, "XSTAR1") && starOk("CX2", (p) => `AC${p}`, "XSTAR2")
    && [4, 5, 6].every((q) => A.netOfPin.get(`CX2${q}.pin1`) === `AC${q - 3}` && A.netOfPin.get(`CX2${q}.pin2`) === "XSTAR2" && Math.abs(A.val.get(`CX2${q}`) - 4.7e-6) < 1e-8)
    && !A.byName.has("LDM1") && [1, 2, 3].every((p) => A.netOfPin.get(`CMC2.B${p}`) === `AC${p}`), "CX0x on LF · CX1x on AC·M · 2 × CX2x on AC — 4.7 µF★ each, CMC2 straight to the converter");
  // one line open at 1.1 × 475 VAC with +20 % Y tolerance: the two live phases drive ω·1.2·C·Vph into PE
  const cyPh = A.names.filter((n) => /^CY\d$/.test(n) && A.netOfPin.get(`${n}.pin2`) === "PE").reduce((a, n) => a + A.val.get(n), 0) / 3;
  const iPE = 2 * Math.PI * 50 * 1.2 * cyPh * 1.1 * 475 / Math.sqrt(3);
  // E81: this gate is LEFT HONEST. The F-L-4 CM fix (CY1-3 4.7 → 10 nF) is a real +0.6 mA/module,
  // and the 3.5 mA line is a charger-level PE-architecture constraint, not a number to widen when a
  // change crosses it. Failing here is the finding: at 10 nF only TWO modules share a PE conductor.
  // E81 (lead decision, listed as a USER lever in the E81 report): the converter-node trio is 10 nF for the LLC bridge's in-band CM
  // fundamental (F-L-4: +0.2 → +3.1…+7.1 dB), and the rack architecture is ONE PE CONDUCTOR PER MODULE (each module's PE pin bonds
  // to the rack PE bar — the backplane practice of every vendor module read at E81), so the 3.5 mA line applies per module.
  // The alternatives are recorded: 6.8 nF (−3 dB of CM margin) or two modules per shared conductor.
  ck("G", `${sku} Y leakage to PE (one line open, one PE conductor per module)`, iPE <= 3.5e-3, `${f(cyPh * 1e9, 1)} nF/phase → ${f(iPE * 1e3, 2)} mA per module vs the 3.5 mA line on its own PE conductor (EVT T-14; three modules on ONE conductor would read ${f(3 * iPE * 1e3, 2)} mA — the E81 rack rule is one conductor per module; the 6.8 nF alternative costs ≈ 3 dB of CM margin)`);
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
  // E81 (F-F-8): the WDO→NRST leg is now a 0 Ω LINK (RWDOLCARD). Without it a blank chip resets
  // 23 ms after power-up and SWD programming never completes. The SAFETY path is deliberately
  // UPSTREAM of the link: the pull-up and both AND inhibits stay on WDO_CARD, so a board shipped
  // with the link lifted still gates its drivers on the watchdog verdict — it just cannot reset.
  const wdoN = C.netOfPin.get("USUPCARD.WDO");
  ck("J", "card WDO → NRST through the 0 Ω programming link", !!nrst && !!wdoN && wdoN !== nrst
    && C.netOfPin.get("RWDOLCARD.pin1") === wdoN && C.netOfPin.get("RWDOLCARD.pin2") === nrst && Math.abs(C.val.get("RWDOLCARD")) < 1e-9
    && C.netOfPin.get("JSWDCARD.RST") === nrst && C.netOfPin.get("RCARDRST.pin2") === nrst
    && C.netOfPin.get("UANDCARD.B1") === wdoN && C.netOfPin.get("UANDCARD.B2") === wdoN && C.netOfPin.get("RWPUCARD.pin2") === wdoN,
    `supervisor WDO (${wdoN}) → 0 Ω → MCU NRST + SWD RST (${nrst}); pull-up and both AND inhibits on the WDO side so lifting the link disables the RESET only`);
  ck("J", "card watchdog kick is terminated and probeable", C.netOfPin.get("RWDICARD.pin1") === C.netOfPin.get("USUPCARD.WDI") && C.netOfPin.get("RWDICARD.pin2") === "DGND" && C.netOfPin.get("TPWDICARD.P") === C.netOfPin.get("USUPCARD.WDI") && C.netOfPin.get("USUPCARD.VDD2") === C.netOfPin.get("USUPCARD.VDD"),
    "WDI 10 k pull-down (F-A-26: a FALLING-edge-triggered input must not float) + fixture test point (F-F-8) · TPS3430 VDD2 bonded to VDD1, which the datasheet makes mandatory (F-A-2)");
  ck("J", "card AND-gate bypass", C.netOfPin.get("CANDCARD.pin1") === C.netOfPin.get("UANDCARD.VCC") && C.netOfPin.get("CANDCARD.pin2") === "DGND",
    "100 n at the safety AND VCC (R5-C)");
  // R6-A: the merge must be VISIBLE — the canonical net NAME on every one of those pins is
  // NRST_CARD itself (the R5 net-net trace was electrically right but drew as two label groups;
  // the reviewer read "watchdog not connected" off the face).
  ck("J", "card WDO face-name = NRST_CARD", nrst === "NRST_CARD" && C.netOfPin.get("RWDOLCARD.pin2") === "NRST_CARD",
    "one NAME, every pin — the sheet shows the connection the netlist always had (R6-A). E81: the pull-up moved to the WDO side of the 0 Ω link, so the link's far pin is what carries the NRST_CARD face name");
  // R7-A: comparator-INSTANCE-aware current-sense allocation (B and C shared CMP2 before)
  // R7-A kept comparator-INSTANCE-aware allocation (B and C shared CMP2 before). E81 (F-I-2) then
  // swapped AIN8 ⇄ TSNS0: phase A's current sense was the ONE signal of 75 that does not carry to
  // the second-source STM32G474VET7, where pin 17 (also PC2) lists ADC12_IN8 and NO comparator.
  // PB0 carries a comparator input on BOTH parts (STM32 COMP4_INP at INPSEL 0, RM0440 Table 196)
  // and COMP4 reaches HRTIMER fault FLT2 directly (Table 213), so the hardware OC trip survives the
  // swap; T_LLC is a slow NTC that never wanted a comparator and PC2's ADC serves it on both parts.
  ck("J", "card CMP allocation (R7-A + the E81 AIN8⇄TSNS0 dual-footprint swap)",
    C.netOfPin.get("UCARD.pin32") === "AIN8" && C.netOfPin.get("UCARD.pin17") === "TSNS0" && C.netOfPin.get("UCARD.pin25") === "AIN9" && C.netOfPin.get("UCARD.pin16") === "AIN10" && C.netOfPin.get("UCARD.pin15") === "AIN11",
    "I_A0→PB0 (GD32 CMP · STM32 COMP4_INP→FLT2) · T_LLC→PC2/ADC · I_B0→PA3/CMP1_IP · I_C0→PC1/CMP2_IP · VAC1→PC0/ADC — three INDEPENDENT comparators on both parts");
  ck("J", "card 8 MHz crystal on OSC_IN/OSC_OUT (F-A-30 / F-F-1)",
    C.netOfPin.get("UCARD.pin12") === C.netOfPin.get("XCARD.X1") && C.netOfPin.get("UCARD.pin13") === C.netOfPin.get("XCARD.X2")
    && C.netOfPin.get("CCARDX1.pin1") === C.netOfPin.get("UCARD.pin12") && C.netOfPin.get("CCARDX2.pin1") === C.netOfPin.get("UCARD.pin13")
    && C.netOfPin.get("RCARDXF.pin1") === C.netOfPin.get("UCARD.pin12") && C.netOfPin.get("RCARDXF.pin2") === C.netOfPin.get("UCARD.pin13")
    && Math.abs(C.val.get("CCARDX1") - 12e-12) < 1e-13,
    "CAN off the IRC8M was ±2–3 % against an ISO 11898-1 budget of ±0.485 % at 16 tq/SJW 2 — 5× over. 8 MHz ±30 ppm + 2 × 12 pF + 1 M on the free pins 12/13");
  // E75: the F.03/F.13 "HW comp" rows now have comparators behind them — SNS_VBUSP on PB13
  // (CMP4_IP, ref DAC3_OUT0, HRTIMER fault ch 5) and SNS_VOUT on PA1 (CMP0_IP, ref DAC0_OUT0
  // internal-only MODE0=011, fault ch 3); before E75 those senses sat on PE15/PA5 (no usable CMP).
  ck("J", "card OVP CMP allocation (E75)", C.netOfPin.get("UCARD.pin52") === "ANA14" && C.netOfPin.get("UCARD.pin21") === "AIN3",
    "SNS_VBUSP→PB13/CMP4_IP · SNS_VOUT→PA1/CMP0_IP (GD32G553 DS Rev 1.01 Table 2-4 + UM Table 25-21 verified)");
  // E76 (external review R01): the netlist had E75 but the DELIVERED KiCad face did not — the
  // kicad5 chain has an upstream stage (sheet-pages: dist → page tables) that a partial regen can
  // skip, and kicad5-verify only proves face ⇄ payload, so a stale payload verifies clean (the
  // R4-1/R6-A class, third occurrence). This check reads the SHIP .sch/.lib FACE itself and
  // traces the eight §J pins to their label stubs — payload staleness can no longer pass.
  {
    const schT = readFileSync(join(ROOT, "kicad5/dc-modules-control-card/control-card-card.sch"), "utf8");
    const libT = readFileSync(join(ROOT, "kicad5/dc-modules-control-card/dcmod-r4.lib"), "utf8");
    const cm = schT.match(/L dcmod-r4:GD32G553VET7 UCARD\nU 1 1 \S+\nP (\d+) (\d+)\n(?:F .*\n)*\s*1\s+\d+\s+\d+\n\s*([\d\s-]+)\n/);
    const [cpx, cpy] = [Number(cm[1]), Number(cm[2])], [ma, mb, mc, md] = cm[3].trim().split(/\s+/).map(Number);
    const symT = libT.match(/DEF GD32G553VET7 [\s\S]*?ENDDEF/)[0];
    const pinXY = {}; for (const pm of symT.matchAll(/X \S+ (\d+) (-?\d+) (-?\d+) \d+ [UDLR] /g)) pinXY[pm[1]] = [Number(pm[2]), Number(pm[3])];
    const faceOf = (num) => {
      const [x, y] = pinXY[num], sx = cpx + ma * x + mb * y, sy = cpy + mc * x + md * y;
      const lm = schT.match(new RegExp(`Text Label ${sx - 200} ${sy} .*\\n(\\S+)`));
      return lm ? lm[1] : "(none)";
    };
    const WANT = { 21: "AIN3", 27: "AIN1", 46: "PWM8", 52: "ANA14", 32: "AIN8", 17: "TSNS0", 25: "AIN9", 16: "AIN10", 15: "AIN11" };
    ck("J", "card SHIP FACE pin ownership (E76 — R01)", Object.entries(WANT).every(([n, w]) => faceOf(n) === w),
      Object.entries(WANT).map(([n, w]) => `pin${n}=${faceOf(n)}${faceOf(n) === w ? "" : "≠" + w}`).join(" · "));
  }
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
  // E82 (M-10): ONE network per MODULE on every SKU (cells.tsx `bal`, boards pass bal={k === 0}) — the 40/50 kW banks
  // fitted the pair TWICE, which is how E81's 22 k became 15.7 W of standby inside the electrolytic bank. The passive
  // discharge rides these same resistors, so the count, the VALUE and the two end nets are all proven from the netlist.
  const nSets = A.names.filter((n) => /^RBALT\d+A$/.test(n)).length;   // one "RBALT<bank>A" per fitted network
  const rBal = A.val.get("RBALT0A");
  const tPas = 94e3 * ((sku === "30kw" ? 5 : sku === "40kw" ? 6 : 8) * 470e-6) * (rBal / 47e3) / nSets * Math.log(321 / 60);
  ck("J", `${sku} link balance population`, nSets === 1 && Math.abs(rBal - 47e3) < 1 && A.netOfPin.get("RBALT0A.pin1") === "DCP" && A.netOfPin.get("RBALB0B.pin2") === "DCN"
    && !A.byName.has("RBALT1A") && !A.byName.has("RBALT2A"),
    `${nSets}× (2×${f(rBal / 1e3, 0)}k) per half drawn → 188k full-link on EVERY SKU (E82 M-10) → 321→60 V in ${f(tPas, 0)} s = ${f(tPas / 60, 1)} min; banks 1/2 carry cans only`);
  // R7-B: PV bleeder drive at the guaranteed point — V15-fed LEDs behind the shared low-side
  ck("J", `${sku} PV bleeder drive network`, D.netOfPin.get("RPVLA.pin1") === "V15" && D.netOfPin.get("RPVLB.pin1") === "V15" && D.netOfPin.get("UPVA.CAT") === "PV_SINK" && D.netOfPin.get("UPVB.CAT") === "PV_SINK" && D.netOfPin.get("QPVD.C") === "PV_SINK" && D.netOfPin.get("QPVD.E") === "DGND" && D.netOfPin.get("RPVDP.pin1") === D.netOfPin.get("QPVD.B") && Math.abs(D.val.get("RPVBA") - 6.8e6) < 1e3 && Math.abs(D.val.get("RPVLA") - 1000) < 1,
    "1 k/2010 LED feed holds ≥10 mA to the 13.5 V rail floor via QPVD; 6.8 M gate bleed (R7-B/R8 — 25 °C-endpoint model, EVT gates the FET)");
  // R5-E: symmetric parallel gate branches — every paralleled device behind its OWN 2.2 Ω
  const lpar = D.byName.has("Q1H2");
  // E81 (F-C-19): the VIENNA common-source pair now carries a per-die 1 Ω de-Q on EVERY SKU — the
  // two dies rode net.G_{id} directly, and two 5–6 nF C_iss gates tied together through package lead
  // inductance are an undamped 50–200 MHz loop no simulation covers (the DPT has one device). No
  // bare gate branch survives anywhere: every die sits behind its own series resistor.
  ck("J", `${sku} per-die gate branches (Vienna de-Q + LLC parallel symmetry)`,
    A.netOfPin.get("RGA0A1.pin1") === "G_A0" && A.netOfPin.get("RGA0A1.pin2") === A.netOfPin.get("QA0A.G") && A.netOfPin.get("QA0A.G") !== "G_A0"
    && A.netOfPin.get("RGB0B1.pin1") === "G_B0" && A.netOfPin.get("RGB0B1.pin2") === A.netOfPin.get("QB0B.G")
    && Math.abs(A.val.get("RGA0A1") - 1) < 0.01 &&
    (!lpar || (D.netOfPin.get("RG1H1.pin1") === "GH_1" && D.netOfPin.get("RG1H1.pin2") === D.netOfPin.get("Q1H.G") && D.netOfPin.get("Q1H.G") !== "GH_1" && Math.abs(D.val.get("RG1H1") - 2.2) < 0.01)) &&
    (lpar || (D.netOfPin.get("Q1H.G") === "GH_1")),
    `Vienna 1 Ω per die on both halves of every common-source pair · LLC ${lpar ? "2.2 Ω per die on the paralleled positions" : "single die rides the gate net (30 kW, one die per position)"}`);
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

// ---------- L. E81 [SYNC] — the drawn turn-off snubber vs tanks.mjs ----------
// The per-die C_s is a TANK parameter: tanks.mjs uses it in the leg node capacitance (and therefore
// in the ZVS dead-time schedule and the k_off the grid burns), while boards.tsx has to DRAW it. Two
// carriers, one number. This walks the BUILT netlist back to tanks.mjs so a re-sweep of `cs` cannot
// leave the schematic behind — the E51/E59 drift class, which is why mag-sync exists for magnetics.
console.log("\n=== L. E81 [SYNC] — drawn LLC turn-off snubber vs tanks.mjs `cs` ===");
{
  for (const [sku, s] of Object.entries(SK)) {
    const D = B[sku].dc, want = TANKS[sku].cs, par = TANKS[sku].par;
    const names = D.names.filter((n) => /^C\d[HL]OS\d$/.test(n));
    const drawn = names.map((n) => D.val.get(n));
    const placed = names.every((n) => {
      const q = n[1], side = n[2], k = n.slice(-1);
      const fet = `Q${q}${side}${k === "1" ? "" : k}`;
      return D.netOfPin.get(`${n}.pin1`) === D.netOfPin.get(`${fet}.D`) && D.netOfPin.get(`${n}.pin2`) === D.netOfPin.get(`${fet}.S`);
    });
    ck("SYNC", `${sku} turn-off snubber count/value/placement vs tanks.mjs`,
      names.length === 4 * par && drawn.every((v) => Math.abs(v - want) < 1e-13) && placed && par === s.parL,
      `${names.length} × ${f(want * 1e12, 0)} pF drawn drain–source (tanks.mjs cs = ${f(want * 1e12, 0)} pF, par ${par} → 4 × par = ${4 * par} expected)${placed ? "" : " — PLACEMENT MISMATCH"}`);
    ck("SYNC", `${sku} LLC turn-off resistor deleted (E81 F-C-5/C sweep), land kept`,
      Math.abs(D.val.get("R1HOFF")) < 1e-9 && Math.abs(D.val.get("R1LOFF")) < 1e-9 && Math.abs(B[sku].ac.val.get("RA0GOFF") - 4.7) < 0.01,
      `LLC R_off ${f(D.val.get("R1HOFF"), 2)} Ω (0 Ω only works WITH C_s fitted: un-snubbed it lifts V_ds,pk 71→77 % and the gate undershoot to −6.7 V) · Vienna keeps ${f(B[sku].ac.val.get("RA0GOFF"), 1)} Ω`);
  }
}

console.log(`\n${checks} checks — ${fails ? fails + " FAILURE(S)" : "ALL CLEAN"}`);
process.exit(fails ? 1 : 0);
