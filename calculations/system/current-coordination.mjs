// current-coordination.mjs — E60 standing gate: every current the power path carries, taken from the
// SIMULATIONS (not hand formulas), coordinated against every threshold, observability ceiling,
// magnetic flux limit, device timing and part class it must respect. It exists because the E60
// sweep found the chain broken in five places at once: LLC ngspice evidence non-physical (no body
// diodes), grid tank "A pk" ceilings that were A rms, the SER hysteresis corner never evaluated,
// F.11 below the real operating peak on 40/50 kW (and AT it on 30 kW), F.01 undefined for 40/50 kW
// with a DESAT blank (100 pF → 2.3 µs + delays) longer than a discrete 1200 V SiC's withstand.
// Inputs: simulation-results/<sku>/llc-stress{.csv,-summary.json} (spice/llc/llc-run.mjs, pinned
// by tank fingerprint) · calculations/out/vienna-switched.csv (calculations/pfc/vienna-switched.mjs)
// Run: node calculations/system/current-coordination.mjs        (run-all, after vienna-switched)
import { mountFor } from "../thermal/mount.mjs";
import { shortRacePeak } from "../../spice/llc/llc-flux-post.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TANKS, TANK_CLASS, JBS_POS, fingerprint } from "../llc/tanks.mjs";
import { D2 as D2C } from "../magnetics/magnetics-envelope.mjs";
import { stack } from "../magnetics/geometry.mjs";
import { D1, Ld1 } from "../pfc/vienna-switched.mjs";
import { captureEvidence } from "../evidence.mjs";
captureEvidence("current-coordination");
// E69a: pulsed rating IDM (25 °C) per die — listings where they exist, otherwise the RFQ acceptance line the part must meet
const PFC_DIE = { "30kw": { mpn: "SIC-750V-20mR", idm: 210, src: "RFQ acceptance IDM ≥ 210 A" }, "40kw": { mpn: "SIC-750V-15mR", idm: 260, src: "RFQ acceptance IDM ≥ 260 A" },
  "50kw": { mpn: "B3M010C075Z", idm: 480, src: "TME listing" }, "50kwa": { mpn: "B3M010C075Z", idm: 480, src: "TME listing" } };
const LLC_IDM = { SG2M023120LJ: { idm: 265, src: "RFQ acceptance IDM ≥ 265 A (the C3M0021120K class lists 250 A)" } };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rd = (p) => readFileSync(join(ROOT, p), "utf8");
const f = (x, d = 1) => Number(x.toFixed(d));
let fails = 0;
const ck = (sec, name, cond, detail) => { console.log(`${cond ? "  ok  " : "  FAIL"}  [${sec}] ${name} — ${detail}`); if (!cond) fails++; };

// ---- THE coordination classes. fsm.c, boards.tsx/cells.tsx, parts-db and protection-thresholds.md
// are asserted against this table (section K) so the carriers cannot drift apart again.
export const OC = {
  // E67 full bridge: ONE resonant CT carries the whole tank. F.11 = 1.2 × the power-solved worst peak (the PSM-at-f_max 764 V-bus
  // corner: 113/148/183 A); the post-short race from that corner crosses F.11 1.35–1.5 µs after the bank collapse and reaches
  // 328/417/503 A at +3 µs, so the burden drops to keep that monitor peak on the ADC rail (thresholds 0.66 V above AVMID)
  "30kw": { F01: 120, lineRb: 22, F11: 140, resRb: 0.47, lineMpn: "R1206-22R-1%", resMpn: "R2512-0R47-1W-1%" },
  "40kw": { F01: 155, lineRb: 18, F11: 180, resRb: 0.36, lineMpn: "R1206-18R-1%", resMpn: "R2512-0R36-1W-1%" },
  "50kw": { F01: 195, lineRb: 13, F11: 220, resRb: 0.30, lineMpn: "R1206-13R-1%", resMpn: "R2512-0R30-2W-1%" },
};
OC["50kwa"] = OC["50kw"];
export const BLANK = { pfc: 47e-12, llc: 22e-12 };              // DESAT blanking caps (NSI66x1A)
const RULE = { margin: 1.2, avmid: 1.65, rail: 3.27, thrMaxV: 3.0 };
const Bsat130 = 0.499 + (0.401 - 0.499) / 75 * (130 - 25);      // measured 3C95 (temp-critique basis)
console.log("=== CURRENT & PROTECTION COORDINATION (E60 gate, E67 full bridge) — simulated currents vs thresholds, ceilings, flux, timing, parts ===");

// ---------------- A. simulation freshness + physicality ----------------
const SUM = {}, LLC = {};
for (const sku of Object.keys(TANKS)) {
  const s = JSON.parse(rd(`simulation-results/${sku}/llc-stress-summary.json`));
  SUM[sku] = s;
  const lines = rd(`simulation-results/${sku}/llc-stress.csv`).split("\n").filter((l) => l && !l.startsWith("#"));
  const hdr = lines[0].split(","); LLC[sku] = lines.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [hdr[i], v])));
  ck("SIM", `${sku} LLC deck pinned to the drawn tank`, s.fingerprint === fingerprint(sku),
    `${s.fingerprint} vs tanks.mjs ${fingerprint(sku)} — a tank change without a re-run fails here (the pre-E60 suite ran the 30 kW tank for everything)`);
  ck("SIM", `${sku} deck physical + capable`, s.legsInRails && s.zvsAll && LLC[sku].every((r) => r.mode !== "NO-CAPABILITY" && (r.mode === "BURST" || Math.abs(+r.P_err_pct) <= 2.5)),
    `legs inside the rails on every corner (the no-body-diode deck swung ±6 kV) · ZVS on all 4 switches every corner · power solved ≤2.5 % (BURST corners excepted: capability above target at f_max) incl. the gain-worst tolerance corner`);
}
const vs = rd("calculations/out/vienna-switched.csv").split("\n").filter((l) => l && !l.startsWith("#"));
const vh = vs[0].split(","), VS = vs.slice(1).map((l) => { const c = l.match(/("[^"]*"|[^,]+)/g); return Object.fromEntries(c.map((v, i) => [vh[i], v])); });

// ---------------- B/C/D. PFC: F.01 against the cycle-by-cycle peaks ----------------
const race = (d, i0, V, dt = 0.02e-6) => { let i = i0; for (let t = 0; t < 3e-6; t += dt) i += (V / Ld1(d, i, 0.92)) * dt; return i - i0; };
for (const sku of ["30kw", "40kw", "50kw"]) {
  const c = OC[sku], d = D1[sku], rows = VS.filter((r) => r.sku === sku);
  const legal = rows.filter((r) => !/bus650/.test(r.case) || +r.VLL < 475);
  const pk = Math.max(...legal.map((r) => +r.Ipk_A));
  const worst = legal.find((r) => +r.Ipk_A === pk);
  ck("F.01", `${sku} threshold ≥ ${RULE.margin}× simulated worst line peak`, c.F01 >= RULE.margin * pk,
    `${c.F01} A pk vs ${f(pk)} A (${worst.case}: ripple on the soft-saturated D1 at lot AL−8 %, bus 830, incl. 30 %/50 % dips + 20° jump with the FW-R6 1.05× reference clamp) → ${f(c.F01 / pk, 2)}×`);
  const asIs = rows.filter((r) => /bus650/.test(r.case) && +r.VLL >= 475), fixed = rows.filter((r) => /busFloor/.test(r.case));
  ck("F.01", `${sku} high-line bus floor proven`, asIs.every((r) => +r.THD40_pct > 5 && +r.overmod_pct > 50) && fixed.every((r) => +r.THD40_pct < 1 && +r.overmod_pct === 0),
    `AS-IS 650 V bus at 475/500 VAC: THD ${asIs.map((r) => r.THD40_pct).join("/")} %, overmod ${asIs.map((r) => r.overmod_pct).join("/")} % → with 1.08·√2·VLL floor: THD ${fixed.map((r) => r.THD40_pct).join("/")} % (fsm.c E60)`);
  const di = race(d, c.F01, 560), ceil = (RULE.rail - RULE.avmid) * 2500 / c.lineRb, thrV = RULE.avmid + c.F01 * c.lineRb / 2500;
  ck("F.01", `${sku} observability through the 3 µs kill race`, c.F01 + di <= ceil && thrV <= RULE.thrMaxV,
    `Δi(3 µs, 560 V, L(i) at AL−8 %) = ${f(di)} A → ${f(c.F01 + di)} A ≤ ceiling ${f(ceil)} A on ${c.lineRb} Ω · threshold at ${f(thrV, 2)} V ≤ ${RULE.thrMaxV} V`);
  const mu = Ld1(d, c.F01 + di, 1) / Ld1(d, 0.01, 1);
  ck("F.01", `${sku} D1 stays soft at the fault peak`, mu >= 0.15,
    `µ(${f(c.F01 + di)} A) = ${f(mu, 3)} of initial (sendust soft-sat — di/dt grows ${f(1 / mu, 1)}×, never a hard collapse; Kool Mµ Tc 500 °C)`);
  // E69a fault-pulse rule (both stages): a trip-limited, non-repetitive µs pulse at low VDS may reach 80 % of the die's pulsed rating IDM
  // (25 °C listing, −20 % for a hot start). One die per PFC position since E68a; class dies carry their IDM as an RFQ ACCEPTANCE line.
  const pd = PFC_DIE[sku];
  ck("F.01", `${sku} PFC FET pulse class at the fault peak`, c.F01 + di <= 0.8 * pd.idm,
    `${f(c.F01 + di)} A per die (one ${pd.mpn} per position) vs 80 % of IDM ${pd.idm} A (${pd.src})`);
  const dpk = Math.max(...legal.map((r) => +r.Id_pk_A));
  ck("F.01", `${sku} boost-diode repetitive peak`, dpk <= c.F01,
    `diode peak ${f(dpk)} A (sim) ≤ F.01 ${c.F01} A — anything above is a fault by definition; the surge class is the parts-db IFSM line, held against the bypass-closure pulse in [INRUSH]`);
}

// ---------------- E/F/G/H. LLC: F.11, flux, caps, rectifiers ----------------
const SEC = Object.fromEntries(["30kw", "40kw", "50kw", "50kwa"].map((k) => [k, mountFor(k)]));   // E68: mount.mjs
for (const sku of Object.keys(TANKS)) {
  const t = TANKS[sku], c = OC[sku], s = SUM[sku], rows = LLC[sku];
  const pkNom = Math.max(...rows.map((r) => +r.Ip_pk_A)), rmsNom = Math.max(...rows.map((r) => +r.Ip_rms_A));
  ck("F.11", `${sku} threshold ≥ ${RULE.margin}× simulated worst tank peak`, c.F11 >= RULE.margin * s.ipPkMax,
    `${c.F11} A pk vs ${s.ipPkMax} A (${s.worstCorner}) → ${f(c.F11 / s.ipPkMax, 2)}×`);
  // E65: F.11 is a hardware WINDOW comparator on the tank CT (both polarities → HRTIMER_FLT2): the kill lands ≤1 µs after |Ip|
  // crosses F.11 on the committed post-short envelope (llc-short.csv). The E60 check sampled fixed times after the short and
  // assumed a positive-only threshold — which the worst section crosses 4.5–6.4 µs late because the fault swings it negative.
  const { tX, peak: racePk } = shortRacePeak(sku, c.F11), mon = shortRacePeak(sku, c.F11, 3).peak;
  const di = racePk - c.F11, ceil = (RULE.rail - RULE.avmid) * 100 / c.resRb, thrV = RULE.avmid + c.F11 * c.resRb / 100;
  ck("F.11", `${sku} window-comparator kill + observability`, racePk * 1.2 <= ceil && mon * 1.05 <= ceil && thrV <= RULE.thrMaxV && 2 * RULE.avmid - thrV >= 0.3,
    `|Ip| crosses F.11 ${f(tX, 2)} µs after the short → kill peak ${f(racePk)} A (+1 µs, ×1.2 ≤ ${f(ceil)} A on ${c.resRb} Ω) · monitor peak +3 µs ${f(mon)} A ×1.05 in rail · window ${f(2 * RULE.avmid - thrV, 2)}/${f(thrV, 2)} V`);
  const li = LLC_IDM[t.dieP.mpn];
  ck("F.11", `${sku} LLC FET pulse class at the kill peak`, li && racePk / t.par <= 0.8 * li.idm,
    `${f(racePk / t.par)} A per die (${t.par}× ${t.dieP.mpn} per position) vs 80 % of IDM ${li?.idm} A (${li?.src}) — non-repetitive µs pulse at low VDS`);
  const d2 = D2C[sku], Ae2 = stack(d2.core, d2.n).Ae;
  const bNorm = d2.Lmax * pkNom / (d2.N * Ae2), bFault = d2.Lmax * racePk / (d2.N * Ae2);
  ck("D2", `${sku} external Lr flux: operating + fault`, bNorm <= 0.110 && bFault <= 0.6 * Bsat130,
    `Lmax ${f(d2.Lmax * 1e6, 2)} µH (${d2.n}×${d2.core} N ${d2.N}): ${f(bNorm * 1e3, 0)} mT at the worst simulated peak (≤110) · ${f(bFault * 1e3, 0)} mT at the F.11 kill peak ≤ 60 % Bsat(130 °C) ${f(0.6 * Bsat130 * 1e3, 0)} mT`);
  const perCap = rmsNom / t.crN, vcr = s.vcrAcMax / Math.SQRT2;
  ck("Cr", `${sku} resonant caps at the simulated corners`, perCap <= 12 && vcr <= 530,
    `${f(perCap, 2)} A rms per cap (${t.crN}× ${t.crNF} nF) ≤ 12 · Vcr ${s.vcrAcMax} V pk = ${f(vcr, 0)} V rms ≤ 530 (O-8 RFQ line; max sits at the gain-critical 77–82 kHz corner, not at fr)`);
  ck("TANK", `${sku} tank RMS inside the drawn class`, rmsNom <= TANK_CLASS[sku] * 1.02,
    `${f(rmsNom)} A rms (nominal + tolerance corners) vs class ${TANK_CLASS[sku]} A — D2 litz/ΔT, Cr and the resonant CT are sized to it`);
  const jp = JBS_POS[sku], rdJ = jp.cls === 40 ? 0.022 : 0.045;
  const dAvg = Math.max(...rows.map((r) => +r.Idiode_avg_A)) / jp.n, dRms = Math.max(...rows.map((r) => +r.Isec_rms_A)) / Math.SQRT2 / jp.n;
  const pD = 0.95 * dAvg + rdJ * dRms * dRms, tj = SEC[sku].ref + SEC[sku].rth * pD;
  ck("JBS", `${sku} secondary diodes (${jp.n}× ${jp.cls} A per position) at the HIGH-mode floor`, tj <= 150.5,
    `sim ${f(dAvg)} A avg / ${f(dRms)} A rms per diode → ${f(pD)} W → Tj ${f(tj, 0)} °C (hot JBS V0 0.95 V / rd ${rdJ * 1e3} mΩ — RFQ acceptance)`);
}

// ---------------- H2. E68 output stage: film-only bank + blocking diode, from the committed ngspice ripple ----------------
// Every simulated corner: ripple current per 2.2 µF film (≤ 10.5 A line) and bank ripple VOLTAGE ≤ 0.5 % RMS of the output
// (InfyPower/Tonhe-class "effective value ≤ 0.5 %"; SER stacks two in-phase banks on the output, so each bank gets half).
{
  const boards = rd("packages/common-components/boards.tsx");
  const BF = { "30kw": { nF: 9 }, "40kw": { nF: 12 }, "50kw": { nF: 14 } };
  const DOUT = { "30kw": { A: 150, rjc: 0.25 }, "40kw": { A: 200, rjc: 0.18 }, "50kw": { A: 250, rjc: 0.15 } };
  for (const sku of Object.keys(TANKS)) {
    const k = sku === "50kwa" ? "50kw" : sku, b = BF[k], t = TANKS[sku];
    const L = rd(`simulation-results/${sku}/llc-flux.csv`).split("\n").filter((l) => l && !l.startsWith("#")), h = L[0].split(",");
    const rows = L.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [h[i], +v || v]))).filter((r) => r.Ibank_rip_A);
    const C = 0.9 * b.nF * 2.2e-6;   // −10 % film tolerance
    const ev = rows.map((r) => { const f2 = 2 * r.fsw_kHz * 1e3, dv = r.Ibank_rip_A / (2 * Math.PI * f2 * C), ser = /^SER/.test(r.corner);
      return { r, f2, perCap: r.Ibank_rip_A / b.nF, pct: 100 * dv * (ser ? 2 : 1) / (r.bank_V * (ser ? 2 : 1)) }; });
    const wc = ev.reduce((a, e) => (e.perCap > a.perCap ? e : a)), wv = ev.reduce((a, e) => (e.pct > a.pct ? e : a));
    ck("OUT", `${sku} film-only bank: ripple current per film + output ripple voltage`, wc.perCap <= 10.5 && wv.pct <= 0.5,
      `${b.nF}× 2.2 µF 630 V per bank (ripple at −10 % C) · worst current ${f(wc.r.Ibank_rip_A)} A rms at ${wc.r.corner} → ${f(wc.perCap, 2)} A per film (≤10.5) · worst ripple ${f(wv.pct, 2)} % RMS at ${wv.r.corner} (${wv.r.bank_V} V bank, 2·fsw ${f(wv.f2 / 1e3, 0)} kHz; ≤0.5 %) — E68, no D8 inductor / electrolytic`);
    const Iout = t.Imax, pD = 1.05 * Iout, TjD = (sku === "50kw" ? 65 : 70) + pD * (DOUT[k].rjc + 0.08 + 0.1);
    ck("OUT", `${sku} output blocking diode DOUT`, Iout <= 0.8 * DOUT[k].A && TjD <= 140,
      `${Iout} A of the ${DOUT[k].A} A class (${f(100 * Iout / DOUT[k].A, 0)} %) · ${f(pD, 0)} W at Vf 1.05 V → Tj ${f(TjD, 0)} °C (Rjc ${DOUT[k].rjc} + TIM 0.08 + local 0.1 K/W to the ${sku === "50kw" ? 65 : 70} °C ref) — InfyPower practice; 1600 V vs 1000 V out = 63 %`);
  }
  ck("SYNC", "boards.tsx film-only bank per rating", /pw === 50 \? \{ nF: 14 \} : pw === 40 \? \{ nF: 12 \} : \{ nF: 9 \}/.test(boards),
    "30 kW 9× · 40 kW 12× · 50 kW 14× 2.2 µF film per bank (E68)");
}

// ---------------- I. DESAT timing vs short-circuit withstand ----------------
{
  const cells = rd("packages/power-primitives/cells.tsx"), boards = rd("packages/common-components/boards.tsx");
  // NSI66x1A Rev 1.1 (Novosense): ICHG 430/500/600 µA · VDESAT_TH 8.5/9.26/9.8 V · tLEB 200 ns ·
  // tDESAT_OFF 150/250/300 ns · ISTO 250/400/570 mA. SCWT classes: 1200 V discrete SiC at ≤800 V
  // = 2 µs (Infineon CoolSiC G2 datasheet class); 1200 V SiC at 50 % rated V = 4.2 µs minimum
  // (Wolfspeed PRD-08296 Fig. 12, Tj 175 °C) — applied to the 750 V part at half-bus.
  const resp = (C, qg) => C * 1.1 * 9.8 / 430e-6 + 200e-9 + 300e-9 + 0.6 * qg / 0.25;
  const blankMin = (C) => C * 0.9 * 8.5 / 600e-6 + 200e-9;
  for (const [stage, C, qg, scwt, minBlank] of [["LLC 1200 V (ZVS turn-on)", BLANK.llc, 160e-9, 2.0e-6, 0.4e-6], ["PFC 750 V (hard turn-on)", BLANK.pfc, 220e-9, 4.2e-6, 0.8e-6]]) {
    const r = resp(C, qg), r100 = resp(100e-12, qg);
    ck("DESAT", `${stage} response inside 75 % of SCWT`, r <= 0.75 * scwt && blankMin(C) >= minBlank * 0.99,
      `${f(C * 1e12, 0)} pF: worst blank+LEB+delay+soft-off = ${f(r * 1e6, 2)} µs ≤ ${f(0.75 * scwt * 1e6, 2)} µs (SCWT class ${f(scwt * 1e6, 1)} µs) · min blank ${f(blankMin(C) * 1e6, 2)} µs ≥ ${f(minBlank * 1e6, 2)} µs noise floor — the as-drawn 100 pF computed ${f(r100 * 1e6, 2)} µs (${f(100 * r100 / scwt, 0)} % of SCWT)`);
  }
  ck("DESAT", "blanking caps carried by the drawing", /cBlank = "100pF"/.test(cells) === false && /capacitance=\{cBlank\}/.test(cells) && /cBlank="47pF"/.test(cells) && /cBlank="22pF"/.test(cells),
    "DriverCh takes cBlank per channel: Vienna pairs 47 pF, LLC half-bridges 22 pF");
  void boards;
}

// ---------------- J. bank energy into an external output short ----------------
{
  const C = 2 * (4 * 470e-6 / 2), R = 0.0125 + 0.010, V = 500;          // 50 kW LOW mode (worst bank C), ESR + bar/relay path
  const ipk = V / R, i2t = ipk * ipk * (R * C) / 2;
  ck("DUMP", "bank discharge into an external short vs K_OUT and copper", i2t <= 0.1 * 2000 * 2000 * 0.1 && i2t <= 0.01 * (115 * 50) ** 2,
    `Ipk ≈ ${f(ipk / 1e3, 1)} kA, τ ${f(R * C * 1e6, 0)} µs, I²t ${f(i2t, 0)} A²s ≤ 10 % of a 200 A relay's 2 kA/0.1 s class and ≤1 % of the 50 mm² bar — µs-scale, contacts already closed (no arc); the charger-level DC fuse/contactor is the 61851-23 system item`);
}

// ---------------- L. E73 startup: precharge-bypass closure ----------------
// fsm.c closes the bypass when the bus reaches 90 % of line peak. The ≤ 10 % that is left drives an LC pulse through the CMC leakage,
// D1 (catalog L(i) at lot −8 %) and the passive rectifier into the link — the PFC is not switching yet. Worst case: 475 VAC, stiff
// grid, CMC leakage at the band minimum (2 × 6 µH), closure instant swept every 2° over the 60° six-pulse period; link = the series
// halves.
const RELAY_OPERATE_MS = 25, RELAY_BOUNCE_MS = 5;
const GG_PREARC = { "30kw": 1500, "40kw": 4000, "50kw": 7000 };  // A²s — gG 80 / 125 / 160 A pre-arcing I²t, low end of the class data
const bypassClosure = (sku, angDeg, { VLL = 475, lot = 0.92, Llk = 12e-6, R = 0.01, dt = 2e-7, after = 0.02 } = {}) => {
  // the bus sits at the firmware threshold (90 % of peak) when the contacts close — no credit for the relay's operate time, during
  // which the resistors keep charging — and the closure instant is the swept variable (the peak is sharply sensitive to it)
  const d = D1[sku], C = d.cHalf / 2, w = 2 * Math.PI * 50, Vph = (VLL * Math.SQRT2) / Math.sqrt(3), pk = VLL * Math.SQRT2, ang = (angDeg * Math.PI) / 180;
  let i = [0, 0, 0], vb = 0.9 * pk, t = 0, ipk = 0, Lpk = Ld1(d, 0, lot), i2t = [0, 0, 0], tOn = 0, vmax = vb;
  const vbc = vb;
  while (t < after) {
    const e = [0, 1, 2].map((k) => Vph * Math.sin(w * t + ang - (k * 2 * Math.PI) / 3));
    const Lk = [0, 1, 2].map((k) => Llk + Ld1(d, i[k], lot));
    let sg = i.map((x) => Math.sign(x));
    if (sg.filter(Boolean).length < 2) {                         // no path yet: the largest line-line voltage above the bus starts one
      const kx = e.indexOf(Math.max(...e)), kn = e.indexOf(Math.min(...e));
      sg = [0, 0, 0]; if (e[kx] - e[kn] > vb) { sg[kx] = 1; sg[kn] = -1; }
    }
    const on = [0, 1, 2].filter((k) => sg[k]);
    if (on.length >= 2) {
      const u = sg.map((x) => (x * vb) / 2);
      const vn = on.reduce((a, k) => a + (e[k] - R * i[k] - u[k]) / Lk[k], 0) / on.reduce((a, k) => a + 1 / Lk[k], 0);
      const old = i.slice();
      i = i.map((x, k) => (sg[k] ? (x || sg[k] * 1e-9) + ((e[k] - R * x - u[k] - vn) / Lk[k]) * dt : 0));
      i = i.map((x, k) => (old[k] && Math.sign(x) !== Math.sign(old[k]) ? 0 : x));   // a diode stops at its zero crossing
      for (const k of [0, 1, 2]) if (!sg[k]) { const v = e[k] - vn; if (v > vb / 2) i[k] = 1e-9; else if (v < -vb / 2) i[k] = -1e-9; }
      vb += ((i.reduce((a, x) => a + Math.max(x, 0), 0)) / C) * dt;
    }
    t += dt;
    const m = Math.max(...i.map(Math.abs));
    if (m > ipk) { ipk = m; Lpk = Ld1(d, m, lot); }
    i2t = i2t.map((a, k) => a + i[k] * i[k] * dt);
    if (m > 10) tOn = t;
    vmax = Math.max(vmax, vb);
  }
  return { ipk, Lpk, L0: Ld1(d, 0, lot), i2t: Math.max(...i2t), tPulse: tOn * 1e3, vbc, vmax, pk };
};
const fsmH = rd("firmware/core/fsm.h"), fsmC = rd("firmware/core/fsm.c"), dbL = rd("calculations/cost/parts-db.mjs");
const blankMs = Number(fsmH.match(/#define PMP_PRE_BLANK_MS\s+(\d+)u/)?.[1] ?? 0);
const blankWired = /oc_pfc_flt && f->pre_blank_ms == 0/.test(fsmC) && /f->pre_blank_ms = PMP_PRE_BLANK_MS/.test(fsmC) && /if \(f->pre_blank_ms\) break;/.test(fsmC);
const ifsmLine = Number(dbL.match(/IFSM ≥ (\d+) A \(10 ms half-sine/)?.[1] ?? 0);
for (const sku of ["30kw", "40kw", "50kw"]) {
  const r = Array.from({ length: 30 }, (_, j) => bypassClosure(sku, 2 * j)).reduce((a, x) => (x.ipk > a.ipk ? x : a));
  const make = Number(dbL.match(new RegExp(`KPRE1: \\{[^}]*make ≥ (\\d+) A pk \\(E73 ${sku.replace("kw", "")} kW`))?.[1] ?? 0);
  ck("INRUSH", `${sku} precharge-bypass closure at 90 % of line peak · F.01 blanked, D1, link`, blankWired && blankMs >= RELAY_OPERATE_MS + RELAY_BOUNCE_MS + r.tPulse && r.vmax <= 860,
    `${f(r.ipk, 0)} A pk through D1 and the rectifier (${r.ipk > OC[sku].F01 ? "above" : "below"} F.01 ${OC[sku].F01} A) · D1 falls to ${f(r.Lpk * 1e6, 0)} µH from ${f(r.L0 * 1e6, 0)} µH at the peak — ` +
    `soft powder saturation for ${f(r.tPulse, 1)} ms, winding +${f((r.i2t * 0.006) / (2.2 * 385), 3)} K adiabatic · bus ${f(r.vbc, 0)} → ${f(r.vmax, 0)} V ≤ 860 V OVP · F.01 blanked ${blankMs} ms ≥ relay ${RELAY_OPERATE_MS} + bounce ${RELAY_BOUNCE_MS} + pulse ${f(r.tPulse, 1)} ms, no PFC enable inside (fsm.c)`);
  ck("INRUSH", `${sku} rectifier diode surge at bypass closure`, ifsmLine > 0 && r.i2t <= 0.5 * (ifsmLine ** 2 * 0.01) / 2,
    `${f(r.i2t, 0)} A²s per diode vs 50 % of the RFQ line IFSM ≥ ${ifsmLine} A (10 ms half-sine → ${f((ifsmLine ** 2 * 0.01) / 2, 0)} A²s)`);
  ck("INRUSH", `${sku} bypass relay make and gG fuse at closure`, make >= 1.25 * r.ipk && r.i2t <= 0.1 * GG_PREARC[sku],
    `make ${f(r.ipk, 0)} A pk at ≤ ${f(r.pk - r.vbc, 0)} V across the contacts vs the RFQ make line ${make} A pk (≥ 1.25×) · fuse ${f(r.i2t, 0)} A²s ≤ 10 % of the gG pre-arc ${GG_PREARC[sku]} A²s — no melting, no ageing`);
}

// ---------------- K. carriers agree with the classes ----------------
{
  const fsm = rd("firmware/core/fsm.c"), cells = rd("packages/power-primitives/cells.tsx"), boards = rd("packages/common-components/boards.tsx");
  const db = rd("calculations/cost/parts-db.mjs"), prot = rd("docs/protection-thresholds.md");
  ck("SYNC", "fsm.c per-rating OC classes", /oc_line_a = \(kw == 50u\) \? 195\.0f : \(kw == 40u\) \? 155\.0f : 120\.0f/.test(fsm) && /oc_tank_a = \(kw == 50u\) \? 220\.0f : \(kw == 40u\) \? 180\.0f : 140\.0f/.test(fsm),
    "HAL programs the CMP DACs from these (120/155/195 line · 140/180/220 tank, E67)");
  ck("SYNC", "boards.tsx burdens per rating", /burden=\{pw === 50 \? "13" : pw === 40 \? "18" : "22"\}/.test(boards) && /pw === 50 \? \{[^}]*burden: "0\.30"[^}]*\}\s*: pw === 40 \? \{[^}]*burden: "0\.36"[^}]*\} : \{[^}]*burden: "0\.47"/.test(boards) && /ctBurden=\{tank\.burden\}/.test(boards),
    "line 22/18/13 Ω · resonant 0.47/0.36/0.30 Ω (E67)");
  // E65: the drawn F.11 window ladder must reproduce each rating's F.11 on its burden (ratiometric from V3P3, AVMID = V3P3/2)
  const lad = boards.match(/<F11Window rOut=\{pw === 50 \? "([\d.]+)k" : pw === 40 \? "([\d.]+)k" : "([\d.]+)k"\} rMid=\{pw === 50 \? "([\d.]+)k" : pw === 40 \? "([\d.]+)k" : "([\d.]+)k"\}/);
  const winA = lad ? [["50kw", +lad[1], +lad[4]], ["40kw", +lad[2], +lad[5]], ["30kw", +lad[3], +lad[6]]].map(([k, ro, rm]) => {
    const vh = 3.3 * (ro + rm) / (2 * ro + rm); return [k, (vh - 1.65) * 100 / OC[k].resRb];
  }) : [];
  ck("SYNC", "boards.tsx F.11 window ladder per rating", winA.length === 3 && winA.every(([k, a]) => Math.abs(a / OC[k].F11 - 1) <= 0.02),
    winA.length ? winA.map(([k, a]) => `${k} ${f(a, 1)} A (F.11 ${OC[k].F11})`).join(" · ") + " — ladder ±1 % + comparator offset" : "F11Window ladder MISSING in boards.tsx");
  ck("SYNC", "parts-db burden mpns per rating", Object.values(OC).every((c) => db.includes(c.lineMpn) && db.includes(c.resMpn)),
    Object.entries(OC).filter(([k]) => k !== "50kwa").map(([k, c]) => `${k}: ${c.lineMpn} + ${c.resMpn}`).join(" · "));
  ck("SYNC", "protection-thresholds carries the E67 class table", /E67 full-bridge F\.11 classes/.test(prot) && ["120", "155", "195", "140", "180", "220"].every((v) => prot.includes(`${v} A pk`)),
    "per-SKU F.01/F.11 table + DESAT timing note present");
  void cells;
}
console.log(fails ? `\n${fails} COORDINATION FAILURE(S)` : "\nCURRENT COORDINATION CLEAN — every simulated peak sits ≥1.2× under its trip, every trip is observable through its kill race, flux/timing/parts hold at the fault point");
process.exit(fails ? 1 : 0);
