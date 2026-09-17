#!/usr/bin/env node
// fw-constants-sync.mjs — E82 (M-29) standing gate: the firmware's hard-coded HARDWARE constants,
// read back out of the C and asserted against the source that owns them.
//
// Why it exists: the E82 knowledge-graph pass found THREE edges between firmware/ and calculations/
// and none at all to the schematic source. Every ADC scale factor (CT burdens, shunt values, divider
// ratios), every LLC tank constant and the link capacitance the voltage loop is tuned on are typed
// into hal/*.c by hand. They are all right today — agents A2 and D re-derived every one — and
// nothing whatsoever keeps them right. A burden changed in boards.tsx, a tank re-solved in
// tanks.mjs or a can count changed in the schematic would leave the firmware silently reading the
// wrong current on a µs-class trip, and no gate in this repository would notice.
//
// It reads, never writes: firmware is owned elsewhere. A mismatch is a FAIL with both numbers named.
// Run: node calculations/control/fw-constants-sync.mjs        (run-all, after port-pin-audit)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TANKS } from "../llc/tanks.mjs";
import { NCAN_HALF } from "../../spice/dclink/dclink-ripple.mjs";
import { DIES } from "../llc/tanks.mjs";
import { MOUNT } from "../thermal/mount.mjs";
import { WEAK_K, DT_MIN } from "../../spice/llc/llc-run.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rd = (p) => readFileSync(join(ROOT, p), "utf8");
const meas = rd("firmware/hal/meas.c"), llc = rd("firmware/hal/llc.c"), pfc = rd("firmware/hal/pfc.c");
const boards = rd("packages/common-components/boards.tsx"), cells = rd("packages/power-primitives/cells.tsx");

let fails = 0;
const ck = (name, ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL"}  [FW-SYNC] ${name} — ${msg}`); if (!ok) fails++; };
const f = (x, d = 3) => Number(x.toFixed(d));
const near = (a, b, rel = 2e-3) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= rel * Math.abs(b || 1);
/** every float the C writes for a ternary triple, in the file's own order */
const trip = (txt, re) => (txt.match(re) ?? []).slice(1).map(Number);
/** a resistance/capacitance prop from the TSX, in SI units */
const si = (s) => {
  const m = String(s).match(/^([\d.]+)\s*([kMunp]?)/);
  return m ? Number(m[1]) * ({ k: 1e3, M: 1e6, u: 1e-6, n: 1e-9, p: 1e-12 }[m[2]] ?? 1) : NaN;
};

console.log("=== FIRMWARE ↔ HARDWARE CONSTANT SYNC (E82 / M-29) — hal/*.c read back against the source that owns each number ===");

// ---- 1. meas.c vs the drawn sense chains (boards.tsx / cells.tsx / parts-db order codes) ----
{
  // line-CT burden per rating: boards.tsx passes it to CtSensor, meas.c retypes it
  const bB = boards.match(/burden=\{pw === 50 \? "([\d.]+)" : pw === 40 \? "([\d.]+)" : "([\d.]+)"\}/);
  const mB = trip(meas, /float rb = \(kw == 50u\) \? ([\d.]+)f : \(kw == 40u\) \? ([\d.]+)f : ([\d.]+)f;/);
  ck("line-CT burden 50/40/30", !!bB && mB.length === 3 && mB.every((v, i) => near(v, Number(bB[i + 1]))),
    `meas.c ${mB.join(" / ")} Ω vs boards.tsx ${bB ? bB.slice(1, 4).join(" / ") : "NOT FOUND"} Ω`);

  // resonant-CT burden per rating: boards.tsx tank table → LlcTank ctBurden
  const bR = boards.match(/burden: "([\d.]+)"[\s\S]{0,200}?burden: "([\d.]+)"[\s\S]{0,200}?burden: "([\d.]+)"/);
  const mR = trip(meas, /float rr = \(kw == 50u\) \? ([\d.]+)f : \(kw == 40u\) \? ([\d.]+)f : ([\d.]+)f;/);
  ck("resonant-CT burden 50/40/30", !!bR && mR.length === 3 && mR.every((v, i) => near(v, Number(bR[i + 1]))),
    `meas.c ${mR.join(" / ")} Ω vs boards.tsx ${bR ? bR.slice(1, 4).join(" / ") : "NOT FOUND"} Ω`);

  // output shunt: the VALUE lives in the parts-db order code (50 mV at the rated current — R5-G/E76)
  const codes = [...rd("calculations/cost/parts-db.mjs").matchAll(/SHUNT-50MV-(\d+)A/g)].map((m) => Number(m[1]));
  const want = [167, 133, 100].map((a) => (codes.includes(a) ? 0.050 / a : NaN));
  const mS = trip(meas, /float rs = \(kw == 50u\) \? ([\d.e-]+)f : \(kw == 40u\) \? ([\d.e-]+)f : ([\d.e-]+)f;/);
  ck("output shunt 50/40/30", mS.length === 3 && mS.every((v, i) => near(v, want[i], 5e-3)),
    `meas.c ${mS.map((v) => f(v * 1e3, 3)).join(" / ")} mΩ vs 50 mV / (167 / 133 / 100 A) = ${want.map((v) => f(v * 1e3, 3)).join(" / ")} mΩ from the parts-db order codes`);

  // HV divider: 8 × 475 k top (cells.tsx IsoVSense) over the per-channel bottom
  const nTop = (cells.match(/resistance="475k"/g) ?? []).length ? 8 : 0;   // R{id}D0..D7 — one Array.from row
  const rTop = nTop * 475e3;
  const mTop = Number(meas.match(/\(([\d.e+]+)f \+ 6\.8e3f\) \/ 6\.8e3f/)?.[1]);
  const rBotDefault = si(cells.match(/rBot = "([\d.]+k)"/)?.[1]);
  ck("bus/bank divider 3.8 M / 6.8 k", near(mTop, rTop) && near(rBotDefault, 6.8e3),
    `meas.c ${f(mTop / 1e6, 2)} MΩ over 6.8 kΩ vs cells.tsx ${nTop} × 475 k = ${f(rTop / 1e6, 2)} MΩ over the IsoVSense default rBot ${f(rBotDefault / 1e3, 1)} k`);

  const acBot = si(boards.match(/id="V1"[^>]*rBot="([\d.]+k)"/)?.[1]);
  const mAcBot = Number(meas.match(/float rac = ([\d.e+]+)f \* 1\.25e6f/)?.[1]);
  ck("AC divider bottom 11.5 k", near(mAcBot, acBot),
    `meas.c ${f(mAcBot / 1e3, 1)} k (loaded by the 1.25 M AMC1350 input) vs boards.tsx IsoVSense V1 rBot ${f(acBot / 1e3, 1)} k`);

  // rail monitors: the drawn dividers, not a remembered ratio
  for (const [rail, hi, lo] of [["V24", "RM24A", "RM24B"], ["V15", "RM15A", "RM15B"]]) {
    const rh = si(boards.match(new RegExp(`name="${hi}" resistance="([\\d.]+k)"`))?.[1]);
    const rl = si(boards.match(new RegExp(`name="${lo}" resistance="([\\d.]+k)"`))?.[1]);
    const fw = Number(meas.match(new RegExp(`MCH_${rail}\\] = \\(meas_ch_t\\)\\{ LSB \\* ([\\d.]+)f`))?.[1]);
    ck(`${rail} monitor divider`, near(fw, (rh + rl) / rl, 5e-3),
      `meas.c ×${fw} vs boards.tsx (${f(rh / 1e3, 0)} k + ${f(rl / 1e3, 0)} k) / ${f(rl / 1e3, 0)} k = ×${f((rh + rl) / rl, 2)}`);
  }
}

// ---- 2. llc.c vs tanks.mjs — the ONE tank table ----
{
  const cr = (s) => TANKS[s].crN * 33e-9;
  const fr = (s) => 1 / (2 * Math.PI * Math.sqrt(TANKS[s].Lr * cr(s)));
  const z0 = (s) => Math.sqrt(TANKS[s].Lr / cr(s));
  const frFw = trip(llc, /c->fr_hz = \(kw == 30u\) \? ([\d.e+]+)f : ([\d.e+]+)f;/);
  ck("LLC f_r", frFw.length === 2 && near(frFw[0], fr("30kw"), 1e-3) && near(frFw[1], fr("40kw"), 1e-3) && near(frFw[1], fr("50kw"), 1e-3),
    `llc.c ${frFw.map((v) => f(v / 1e3, 1)).join(" / ")} kHz (30 / 40+50) vs tanks.mjs ${["30kw", "40kw", "50kw"].map((s) => f(fr(s) / 1e3, 1)).join(" / ")} kHz`);
  for (const [name, re, want, unit, scale] of [
    ["Z0", /c->z0_ohm = \(kw == 50u\) \? ([\d.]+)f : \(kw == 40u\) \? ([\d.]+)f : ([\d.]+)f;/, ["50kw", "40kw", "30kw"].map(z0), "Ω", 1],
    ["L_m", /c->lm_h = \(kw == 50u\) \? ([\d.e-]+)f : \(kw == 40u\) \? ([\d.e-]+)f : ([\d.e-]+)f;/, ["50kw", "40kw", "30kw"].map((s) => TANKS[s].Lm), "µH", 1e6],
    ["C_s (turn-off snubber)", /c->cs_f = \(kw == 30u\) \? ([\d.e-]+)f : \(kw == 40u\) \? ([\d.e-]+)f : ([\d.e-]+)f;/, ["30kw", "40kw", "50kw"].map((s) => TANKS[s].cs), "pF", 1e12],
  ]) {
    const got = trip(llc, re);
    ck(`LLC ${name}`, got.length === 3 && got.every((v, i) => near(v, want[i], 3e-3)),
      `llc.c ${got.map((v) => f(v * scale, 2)).join(" / ")} ${unit} vs tanks.mjs ${want.map((v) => f(v * scale, 2)).join(" / ")} ${unit}`);
  }
  const parFw = trip(llc, /c->par = \(kw == 30u\) \? (\d)u : (\d)u;/);
  ck("LLC dies per position", parFw.length === 2 && parFw[0] === TANKS["30kw"].par && parFw[1] === TANKS["40kw"].par && parFw[1] === TANKS["50kw"].par,
    `llc.c ${parFw.join(" / ")} (30 / 40+50) vs tanks.mjs ${["30kw", "40kw", "50kw"].map((s) => TANKS[s].par).join(" / ")} — the ZVS dead-time schedule scales with it`);
}

// ---- 3. pfc.c voltage loop vs the DRAWN link bank ----
{
  const got = (pfc.match(/drawn link ([\d.]+) \/ ([\d.]+) \/ ([\d.]+) mF/) ?? []).slice(1).map(Number);
  const want = ["30kw", "40kw", "50kw"].map((s) => NCAN_HALF[s] * 470e-6 / 2 * 1e3);   // series halves
  ck("PFC voltage-loop link C", got.length === 3 && got.every((v, i) => near(v, want[i], 5e-3)),
    `pfc.c Gv = η/(s·C·Vbus) on ${got.join(" / ")} mF vs the drawn ${["30kw", "40kw", "50kw"].map((s) => NCAN_HALF[s]).join(" / ")} cans per half × 470 µF in series halves = ${want.map((v) => f(v, 3)).join(" / ")} mF`);
}

// ---- 4. E82 (C-11): the weak-leg dead time and the junction observer — three copies of each number (firmware · the SPICE deck
//         that produces the residual anchors · the thermal grid), held together here ----
{
  const llcH = rd("firmware/hal/llc.h"), die = rd("firmware/hal/dielim.c"), dieH = rd("firmware/hal/dielim.h"), grid = rd("calculations/system/envelope-grid.mjs");
  const num = (txt, re) => Number((txt.match(re) ?? [])[1]);
  const kFw = num(llc, /#define LLC_DT_WEAK_K ([\d.]+)f/), dtMin = num(llcH, /#define LLC_DT_MIN_S\s+([\d.e-]+)f/);
  ck("LLC weak-leg dead-time coefficient", near(kFw, WEAK_K, 1e-6), `llc.c LLC_DT_WEAK_K ${kFw} vs spice/llc/llc-run.mjs WEAK_K ${WEAK_K} — the deck's Vres_A anchors are only the firmware's if both program the same edge`);
  ck("LLC dead-time floor", near(dtMin, DT_MIN, 1e-6), `llc.h LLC_DT_MIN_S ${f(dtMin * 1e9, 0)} ns vs llc-run.mjs DT_MIN ${f(DT_MIN * 1e9, 0)} ns`);
  const qFw = num(llc, /c->qoss800_c = ([\d.e-]+)f;/), qDie = num(die, /c->llc_qoss800_c = ([\d.e-]+)f;/);
  ck("output charge Q_oss(800 V)", near(qFw, DIES["23m"].qoss800) && near(qDie, DIES["23m"].qoss800), `llc.c ${f(qFw * 1e9, 0)} nC · dielim.c ${f(qDie * 1e9, 0)} nC vs tanks.mjs DIES ${f(DIES["23m"].qoss800 * 1e9, 0)} nC (the RFQ bound, not the proxy datasheet's 226 nC — see llc.c)`);
  const rth = (die.match(/c->rth_kpw = liquid \? ([\d.]+)f : ([\d.]+)f;/) ?? []).slice(1).map(Number);
  ck("junction → base R_th", rth.length === 2 && near(rth[0], MOUNT.liquid.rth) && near(rth[1], MOUNT.air.rth), `dielim.c ${rth.join(" / ")} K/W (liquid / air) vs thermal/mount.mjs ${MOUNT.liquid.rth} / ${MOUNT.air.rth} K/W`);
  const tri = (re) => trip(die, re);
  const koff = tri(/c->llc_koff = \(kw == 50u\) \? ([\d.e-]+)f : \(kw == 40u\) \? ([\d.e-]+)f : ([\d.e-]+)f;/), csD = tri(/c->llc_cs_f = \(kw == 50u\) \? ([\d.e-]+)f : \(kw == 40u\) \? ([\d.e-]+)f : ([\d.e-]+)f;/);
  const S3 = ["50kw", "40kw", "30kw"];
  ck("observer LLC k_off", koff.length === 3 && koff.every((v, i) => near(v, TANKS[S3[i]].koff)), `dielim.c ${koff.map((v) => f(v * 1e9, 2)).join(" / ")} nJ/(V·A) (50/40/30) vs tanks.mjs ${S3.map((k) => f(TANKS[k].koff * 1e9, 2)).join(" / ")}`);
  ck("observer LLC C_s", csD.length === 3 && csD.every((v, i) => near(v, TANKS[S3[i]].cs)), `dielim.c ${csD.map((v) => f(v * 1e12, 0)).join(" / ")} pF vs tanks.mjs ${S3.map((k) => f(TANKS[k].cs * 1e12, 0)).join(" / ")} pF`);
  ck("observer LLC die R_DS(on) and dies per position", near(num(die, /c->llc_rds25 = ([\d.]+)f;/), DIES["23m"].rds) && /c->llc_par = \(kw == 30u\) \? 1u : 2u;/.test(die) && TANKS["30kw"].par === 1 && TANKS["40kw"].par === 2 && TANKS["50kw"].par === 2,
    `dielim.c ${num(die, /c->llc_rds25 = ([\d.]+)f;/)} Ω, par 1 / 2 vs tanks.mjs ${DIES["23m"].rds} Ω, par ${["30kw", "40kw", "50kw"].map((k) => TANKS[k].par).join(" / ")}`);
  const rp = tri(/c->pfc_rds25 = \(kw == 50u\) \? ([\d.]+)f : \(kw == 40u\) \? ([\d.]+)f : ([\d.]+)f;/);
  const gP = [num(grid, /s\.rdsP \?\? ([\d.]+)\)/), num(grid, /name: "40kw"[^}]*rdsP: ([\d.]+)/), num(grid, /name: "30kw"[^}]*rdsP: ([\d.]+)/)];
  ck("observer Vienna die R_DS(on)", rp.length === 3 && rp.every((v, i) => near(v, gP[i])), `dielim.c ${rp.join(" / ")} Ω (50/40/30) vs envelope-grid.mjs ${gP.join(" / ")} Ω`);
  const tc = num(dieH, /#define DIELIM_RDS_TC\s+([\d.]+)f/), gTc = num(grid, /const RDS_TC = ([\d.]+);/);
  ck("R_DS(on) temperature slope", near(tc, gTc), `dielim.h ${tc} /K vs envelope-grid.mjs RDS_TC ${gTc} /K`);
  const kswFw = num(die, /c->pfc_ksw = ([\d.e-]+)f;/);
  const kswDeck = ["30kw", "40kw", "50kw", "50kwa"].map((sku) => {
    const rows = rd(`simulation-results/${sku}/dpt-pfc-metrics.csv`).split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split(","));
    const h = rows[0], iK = h.indexOf("koff_nJ_VA"), iC = h.indexOf("case"), iKind = h.indexOf("kind");
    const fin = rows.slice(1).filter((r) => r[iKind] === "final" && !/vhi/.test(r[iC]) && /-(clamped|UNCLAMPED)$/.test(r[iC])).map((r) => +r[iK]);
    return (fin[0] + fin[1]) / 2 * 1e-9;
  });
  ck("observer Vienna switching coefficient", kswDeck.every((v) => kswFw >= v), `dielim.c ${f(kswFw * 1e9, 1)} nJ/(V·A) ≥ the DPT finals' mean on every SKU (${kswDeck.map((v) => f(v * 1e9, 1)).join(" / ")}) — one conservative number instead of four`);
  // the weak-leg residual map must sit AT OR ABOVE every phase-shift row the deck commits, at the dead times this firmware programs
  const m0 = (die.match(/c->wl_m0 = \(kw == 30u\) \? ([\d.]+)f : ([\d.]+)f;/) ?? []).slice(1).map(Number), sl = (die.match(/c->wl_slope = \(kw == 30u\) \? ([\d.]+)f : ([\d.]+)f;/) ?? []).slice(1).map(Number);
  for (const sku of ["30kw", "40kw", "50kw", "50kwa"]) {
    const L = rd(`simulation-results/${sku}/llc-stress.csv`).split("\n").filter((l) => l && !l.startsWith("#")), H = L[0].split(",");
    const ps = L.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [H[i], v]))).filter((r) => r.mode === "PS");
    const k = sku === "30kw" ? 0 : 1, r = (M) => Math.min(1, Math.max(0, sl[k] * (m0[k] - M)));
    const rows = ps.map((x) => ({ c: x.corner, M: 2 * +x.bank_V / +x.bus_V, deck: +x.Vres_A_V / +x.bus_V })).map((x) => ({ ...x, fw: r(x.M) }));
    const low = rows.filter((x) => x.fw < x.deck - 1e-3), fat = rows.filter((x) => x.fw > x.deck + 0.30);
    ck(`weak-leg residual map ≥ the deck, ${sku}`, m0.length === 2 && sl.length === 2 && ps.length >= 3 && low.length === 0 && fat.length === 0,
      rows.map((x) => `${x.c} M ${f(x.M, 2)}: fw ${f(x.fw, 2)} vs deck ${f(x.deck, 2)}`).join(" · ") + (low.length ? ` — BELOW the deck at ${low.map((x) => x.c).join(", ")}` : "") + (fat.length ? ` — more than 0.30 above the deck at ${fat.map((x) => x.c).join(", ")} (a map that fat folds a sound corner)` : ""));
  }
  const tjFw = num(dieH, /#define DIELIM_TJ_C\s+([\d.]+)f/);
  ck("junction ceiling", tjFw === 150 && /TjL > 150 \|\| TjD > 150 \|\| TjP > 150/.test(grid), `dielim.h ${tjFw} °C vs the grid's fold loop at 150 °C`);
}

console.log(fails ? `\n${fails} FW-SYNC FAILURE(S) — the firmware and the hardware source disagree; fix the C, not this gate`
  : "\nFIRMWARE CONSTANTS IN SYNC — every ADC scale, tank constant and link-C the firmware types by hand matches the source that owns it");
process.exit(fails ? 1 : 0);
