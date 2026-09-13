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
import { shortRacePeak } from "../../spice/llc/llc-flux-post.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TANKS, fingerprint } from "../llc/tanks.mjs";
import { D1, Ld1 } from "../pfc/vienna-switched.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rd = (p) => readFileSync(join(ROOT, p), "utf8");
const f = (x, d = 1) => Number(x.toFixed(d));
let fails = 0;
const ck = (sec, name, cond, detail) => { console.log(`${cond ? "  ok  " : "  FAIL"}  [${sec}] ${name} — ${detail}`); if (!cond) fails++; };

// ---- THE coordination classes. fsm.c, boards.tsx/cells.tsx, parts-db and protection-thresholds.md
// are asserted against this table (section K) so the carriers cannot drift apart again.
export const OC = {
  // E65 resonant burdens 1.2/0.91/0.75 → 1.0/0.82/0.68 Ω: the internal-short race measured from the F.11 CROSSING peaks at
  // 149/180/213 A (216 A air twin) — beyond the 135/178 A ceilings of the E60 burdens at 30/40 kW, 0.2 % inside at 50 kW air
  "30kw": { F01: 120, lineRb: 22, F11: 85, resRb: 1.0, lineMpn: "R1206-22R-1%", resMpn: "R2512-1R00-1W-1%" },
  "40kw": { F01: 155, lineRb: 18, F11: 115, resRb: 0.82, lineMpn: "R1206-18R-1%", resMpn: "R2512-0R82-1W-1%" },
  "50kw": { F01: 195, lineRb: 13, F11: 145, resRb: 0.68, lineMpn: "R1206-13R-1%", resMpn: "R2512-0R68-2W-1%" },
};
OC["50kwa"] = OC["50kw"];
export const BLANK = { pfc: 47e-12, llc: 22e-12 };              // DESAT blanking caps (NSI66x1A)
const RULE = { margin: 1.2, avmid: 1.65, rail: 3.27, thrMaxV: 3.0 };
const Bsat130 = 0.499 + (0.401 - 0.499) / 75 * (130 - 25);      // measured 3C95 (temp-critique basis)
console.log("=== CURRENT & PROTECTION COORDINATION (E60) — simulated currents vs thresholds, ceilings, flux, timing, parts ===");

// ---------------- A. simulation freshness + physicality ----------------
const SUM = {}, LLC = {};
for (const sku of Object.keys(TANKS)) {
  const s = JSON.parse(rd(`simulation-results/${sku}/llc-stress-summary.json`));
  SUM[sku] = s;
  const lines = rd(`simulation-results/${sku}/llc-stress.csv`).split("\n").filter((l) => l && !l.startsWith("#"));
  const hdr = lines[0].split(","); LLC[sku] = lines.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [hdr[i], v])));
  ck("SIM", `${sku} LLC deck pinned to the drawn tank`, s.fingerprint === fingerprint(sku),
    `${s.fingerprint} vs tanks.mjs ${fingerprint(sku)} — a tank change without a re-run fails here (the pre-E60 suite ran the 30 kW tank for everything)`);
  ck("SIM", `${sku} deck physical + capable`, s.legsInRails && s.zvsAll && LLC[sku].every((r) => r.mode !== "NO-CAPABILITY" && Math.abs(+r.P_err_pct) <= 2.5),
    `legs inside the rails on every corner (the no-body-diode deck swung ±6 kV) · ZVS on all 3 legs every corner · power solved ≤2.5 % incl. the gain-worst tolerance corner`);
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
  const par = sku === "30kw" ? 1 : 2;
  ck("F.01", `${sku} PFC FET pulse class at the fault peak`, (c.F01 + di) / par <= 0.6 * 480,
    `${f((c.F01 + di) / par)} A per B3M010C075Z (×${par}) vs 60 % of IDM 480 A (TME listing) — µs event, SC-SOA is the governing limit (DESAT row)`);
  const dpk = Math.max(...legal.map((r) => +r.Id_pk_A));
  ck("F.01", `${sku} boost-diode repetitive peak`, dpk <= c.F01,
    `diode peak ${f(dpk)} A (sim) ≤ F.01 ${c.F01} A — anything above is a fault by definition; JBS IFSM/I²t class at RFQ ≥ 5× the F.01 point`);
}

// ---------------- E/F/G/H. LLC: F.11, flux, caps, rectifiers ----------------
const SEC = { "30kw": { rth: 1.9, ref: 70 }, "40kw": { rth: 1.9, ref: 70 }, "50kw": { rth: 1.1, ref: 65 }, "50kwa": { rth: 1.9, ref: 70 } };
for (const sku of Object.keys(TANKS)) {
  const t = TANKS[sku], c = OC[sku], s = SUM[sku], rows = LLC[sku];
  const nominal = rows.filter((r) => !/mismatch/.test(r.corner));
  const pkNom = Math.max(...nominal.map((r) => +r.Ip_pk_A)), rmsNom = Math.max(...nominal.map((r) => +r.Ip_rms_A));
  ck("F.11", `${sku} threshold ≥ ${RULE.margin}× simulated worst tank peak`, c.F11 >= RULE.margin * s.ipPkMax,
    `${c.F11} A pk vs ${s.ipPkMax} A (${s.worstCorner}; nominal corners ${f(pkNom)} A) → ${f(c.F11 / s.ipPkMax, 2)}× — the as-drawn 70/70/95 A sat at 1.00/0.74/0.81×`);
  // E65: the 3 µs kill window starts at the F.11 CROSSING on the committed post-short envelope (llc-short.csv), like F.01
  const { tX, peak: racePk } = shortRacePeak(sku, c.F11), di = racePk - c.F11, ceil = (RULE.rail - RULE.avmid) * 100 / c.resRb, thrV = RULE.avmid + c.F11 * c.resRb / 100;
  ck("F.11", `${sku} observability through the internal-short race`, racePk * 1.05 <= ceil && thrV <= RULE.thrMaxV,
    `F.11 crossed ${f(tX, 2)} µs after the short → peak ${f(racePk)} A 3 µs later (Δi ${f(di)} A) ×1.05 ≤ ceiling ${f(ceil)} A on ${c.resRb} Ω · threshold ${f(thrV, 2)} V (E60 fixed-time sampling said ${f(c.F11 + s.race.at3us - s.race.pre)} A)`);
  const Lmax = Math.max(...t.bins) * 1e-6;
  const bNorm = Lmax * pkNom / (t.nTrim * t.aeTrim), bFault = Lmax * (c.F11 + di) / (t.nTrim * t.aeTrim);
  ck("D2", `${sku} trim flux: operating + fault`, bNorm <= 0.110 && bFault <= 0.6 * Bsat130,
    `bin-max ${Math.max(...t.bins)} µH: ${f(bNorm * 1e3, 0)} mT at the worst nominal peak (≤110; the pack's 100 mT line was taken at the NOMINAL bin) · ${f(bFault * 1e3, 0)} mT at F.11+race ≤ 60 % Bsat(130 °C) ${f(0.6 * Bsat130 * 1e3, 0)} mT`);
  const perCap = rmsNom / t.crN, vcr = s.vcrAcMax / Math.SQRT2;
  ck("Cr", `${sku} resonant caps at the simulated corners`, perCap <= 12 && vcr <= 530,
    `${f(perCap, 2)} A rms per cap (${t.crN}× ${t.crNF} nF) ≤ 12 · Vcr ${s.vcrAcMax} V pk = ${f(vcr, 0)} V rms ≤ 530 (O-8 RFQ line; max sits at the gain-critical 77–82 kHz corner, not at fr)`);
  ck("TANK", `${sku} tank RMS inside the drawn class`, rmsNom <= [46.4, 61.9, 77.3][sku === "30kw" ? 0 : sku === "40kw" ? 1 : 2] * 1.02,
    `${f(rmsNom)} A rms (nominal+tolerance corners) vs class ${sku === "30kw" ? 46.4 : sku === "40kw" ? 61.9 : 77.3} — D2 litz/ΔT, Cr, CT all sized to it; the mismatch corner (${s.ipRmsMax} A) is an EOL current-sharing reject, not a thermal state`);
  const dAvg = Math.max(...nominal.map((r) => +r.Idiode_avg_A)), dRms = Math.max(...nominal.map((r) => +r.Isec_rms_A)) / Math.SQRT2;
  const pD = 0.95 * dAvg + 0.045 * dRms * dRms, tj = SEC[sku].ref + SEC[sku].rth * pD;
  ck("JBS", `${sku} secondary diode at the SER-band corner`, tj <= 175 && (tj <= 150.5 || sku === "50kwa"),
    `sim ${f(dAvg)} A avg / ${f(dRms)} A rms per diode → ${f(pD)} W → Tj ${f(tj, 0)} °C${tj > 150 ? " — above 150: the grid folds this corner (93 %, envelope-grid TjJBS column) and the start rule keeps SER out of 500–525 V" : ""} (hot JBS class V0 0.95 V/rd 45 mΩ — RFQ acceptance)`);
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
  const C = 2 * (4 * 470e-6 / 2), R = 0.0125 + 0.010, V = 525;          // 50 kW PAR (worst bank C), ESR + bar/relay path
  const ipk = V / R, i2t = ipk * ipk * (R * C) / 2;
  ck("DUMP", "bank discharge into an external short vs K_OUT and copper", i2t <= 0.1 * 2000 * 2000 * 0.1 && i2t <= 0.01 * (115 * 50) ** 2,
    `Ipk ≈ ${f(ipk / 1e3, 1)} kA, τ ${f(R * C * 1e6, 0)} µs, I²t ${f(i2t, 0)} A²s ≤ 10 % of a 200 A relay's 2 kA/0.1 s class and ≤1 % of the 50 mm² bar — µs-scale, contacts already closed (no arc); the charger-level DC fuse/contactor is the 61851-23 system item`);
}

// ---------------- K. carriers agree with the classes ----------------
{
  const fsm = rd("firmware/core/fsm.c"), cells = rd("packages/power-primitives/cells.tsx"), boards = rd("packages/common-components/boards.tsx");
  const db = rd("calculations/cost/parts-db.mjs"), prot = rd("docs/protection-thresholds.md");
  ck("SYNC", "fsm.c per-rating OC classes", /oc_line_a = \(kw == 50u\) \? 195\.0f : \(kw == 40u\) \? 155\.0f : 120\.0f/.test(fsm) && /oc_tank_a = \(kw == 50u\) \? 145\.0f : \(kw == 40u\) \? 115\.0f : 85\.0f/.test(fsm),
    "HAL programs the CMP DACs from these (120/155/195 line · 85/115/145 tank)");
  ck("SYNC", "boards.tsx burdens per rating", /burden=\{pw === 50 \? "13" : pw === 40 \? "18" : "22"\}/.test(boards) && /ctBurden=\{pw === 50 \? "0\.68" : pw === 40 \? "0\.82" : "1\.0"\}/.test(boards),
    "line 22/18/13 Ω · resonant 1.0/0.82/0.68 Ω (E65)");
  ck("SYNC", "parts-db burden mpns per rating", Object.values(OC).every((c) => db.includes(c.lineMpn) && db.includes(c.resMpn)),
    Object.entries(OC).filter(([k]) => k !== "50kwa").map(([k, c]) => `${k}: ${c.lineMpn} + ${c.resMpn}`).join(" · "));
  ck("SYNC", "protection-thresholds carries the E60 class table", /E60 current-coordination classes/.test(prot) && ["120", "155", "195", "85", "115", "145"].every((v) => prot.includes(`${v} A pk`)),
    "per-SKU F.01/F.11 table + DESAT timing note present");
  void cells;
}
console.log(fails ? `\n${fails} COORDINATION FAILURE(S)` : "\nCURRENT COORDINATION CLEAN — every simulated peak sits ≥1.2× under its trip, every trip is observable through its kill race, flux/timing/parts hold at the fault point");
process.exit(fails ? 1 : 0);
