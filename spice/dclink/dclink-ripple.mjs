// dclink-ripple.mjs — E81 / review G (F-G-1): HF RIPPLE SHARE IN THE REAL DC LINK, closing open item E74-1 / R10.
//
// Why it exists: every LLC deck (spice/llc/llc-run.mjs) feeds the full bridge from an IDEAL source, `VBUS bus 0 DC <V>`.
// No simulation on record therefore knows how the 2·fsw bridge ripple divides between the bridge entry films, the stud /
// pillar path, the split electrolytic link and the Vienna commutation films — and the link is the one place in the module
// where a wrong answer is a wear-out failure rather than a bang. This deck is the SAME E67 full bridge (same tank, same
// behavioural switches with the E81 non-linear Coss, same body diodes) at the SAME operating points the committed
// llc-stress.csv solved, with the link network in place of the ideal source:
//
//   ideal ±V/2 ──50 µH──┬─ DCP ─┬─ nCan × [Rc + Lc + 470 µF] ─ MID          (electrolytic bank, per half)
//                       │       └─ 60 nH ─ 3 × [5 mΩ + 15 nH + 1 µF] ─ MID  (Vienna commutation films, per half)
//                       │ studL + studR per rail
//                       └─ bridge ── nFilm × [5 mΩ + 15 nH + 1 µF]  (+ optional RC damper 2.2 µF + 0.33 Ω)
//                      …mirrored MID → DCN…
//
// ASSUMPTIONS — stated, not fetched (no Aishi ELH datasheet reachable offline). Every one of them is a line in the CSV header.
//   · can 470 µF/450 V snap-in: ESR 0.15 Ω at 100 kHz, ESL 20 nH
//   · can ripple CLASS = 3.5 A rms at 105 °C  (2.5 A at 120 Hz × the usual 1.4 100 kHz multiplier). Gate: ≤ 60 % = 2.1 A
//   · 1 µF/1100 V film (parts-db `PP-1u-1100`, FilmBoxFP 27.5): ESR 5 mΩ, ESL 15 nH, rms line 10 A (the same 27.5 mm box
//     family the bank gate already rates at 10.5 A for the 2.2 µF part)
//   · stud / pillar bank→bridge: `studL` nH and 1 mΩ TOTAL LOOP, split half per rail
//   · Vienna commutation films 60 nH from the bank node (they sit on the AC-DC board beside the legs)
//   · the Vienna stage is an open circuit at 2·fsw, modelled as an ideal source behind 50 µH per rail (|Z| ≈ 128 Ω at 406 kHz)
//   · link cans per half: 5 / 6 / 8 (30 / 40 / 50 kW) — `vienna-switched.mjs D1[sku].cHalf`, i.e. 10/12/16 cans per module,
//     equivalently 5/6/8 strings of 2 × 470 µF in series across the full link
//
// THE PHYSICS THIS FINDS: the bridge entry film bank resonates with the stud loop, and the Vienna films resonate with their
// 60 nH stub, both in the 350–400 kHz decade — and 2·fsw at the PSM ceiling (f_max = 1.45·fr = 203 kHz) is 406 kHz. As drawn
// (4 × 1 µF at the bridge) the link rings and the electrolytics carry several times their class. The sweep below is the cost
// ladder: bridge film total × RC damper × stud inductance.
//
// Run AFTER spice/llc/llc-run.mjs (the operating points are read from the committed llc-stress.csv):
//   node spice/dclink/dclink-ripple.mjs [sku ...]
import { runDeck } from "../run.mjs";
import { ENTRY_FILM } from "../../calculations/cost/parts-db.mjs";
import { TANKS, fingerprint } from "../../calculations/llc/tanks.mjs";
import { cjoFor, COSS_M, COSS_VJ } from "../llc/llc-run.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const f = (x, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)) : "NaN");
const TDEAD = 120e-9;

// E81 lead decision on the can line: the ASSUMED 3.5 A class (2.5 A @120 Hz × 1.4) with a 60 % line was the deck's first gate; the
// purchased part carries an RFQ acceptance of ≥ 3.0 A rms @100 kHz / 105 °C (parts-db, 470 µF / 500 V), and the module's can ambient is
// ≤ 70 °C, where every snap-in datasheet allows ≥ 1.3 × the 105 °C ripple. The gate is 80 % of the 105 °C RFQ line (2.4 A) at the
// 40 nH design stud — the 20 nH stud is a printed sensitivity — and the 20-film variant is the registered lever (T-43 / T-57).
export const CAN = { C: 470e-6, esr: 0.15, esl: 20e-9, classA: 3.5, rfqA: 3.0, gateFrac: 0.8 };
export const FILM = { C: 1e-6, esr: 5e-3, esl: 15e-9, rmsA: 10, mpn: "PP-1u-1100" };
export const DAMP = { C: 2.2e-6, R: 0.33 };
export const NCAN_HALF = { "30kw": 5, "40kw": 6, "50kw": 8, "50kwa": 8 };
export const VIENNA_FILM_PER_HALF = 3, VIENNA_STUB_L = 60e-9, SRC_L = 50e-6;
// what the schematic must draw for the gate to pass — the cheapest sweep point that holds BOTH corners on EVERY SKU
export const DRAWN = { nFilm: 16, damper: true };   // default; per SKU see drawnFor()
export const drawnFor = (sku) => ({ nFilm: ENTRY_FILM[sku] ?? DRAWN.nFilm, damper: DRAWN.damper });   // E81 lead decision: 16 × 1 µF + damper is what boards.tsx draws (nEntryFilm); the 20-film variant (−22 % per-can current) is the registered lever if T-57 measures a stud loop ≤ 25 nH — at the 40 nH design stud the 16 µF rows read 27–38 % of class
// the corners the sweep runs, by their llc-stress.csv row name
export const CORNERS = ["SER250-full-bus764", "PAR400-full"];

// read VBUS / VBANK / fsw / duty for one corner straight out of the committed power-solved CSV
export function opPoint(sku, corner) {
  const L = readFileSync(join(ROOT, `simulation-results/${sku}/llc-stress.csv`), "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
  const H = L[0].split(",");
  const row = L.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [H[i], v]))).find((r) => r.corner === corner);
  if (!row) throw new Error(`dclink: corner ${corner} not in simulation-results/${sku}/llc-stress.csv — run spice/llc/llc-run.mjs first`);
  return { VBUS: +row.bus_V, VBANK: +row.bank_V, fsw: +row.fsw_kHz * 1e3, duty: row.duty === "" ? null : +row.duty, P: +row.P_sim_W };
}

function link(nCan, VBUS, Idc, { nFilm = DRAWN.nFilm, damper = DRAWN.damper, studL = 40e-9, studR = 1e-3 } = {}) {   // callers pass drawnFor(sku)
  const Vh = VBUS / 2;
  let s = `* ---- DC link (E81/F-G-1): ideal source behind ${SRC_L * 1e6} uH per rail, MID grounded; ${nCan} cans/half; ${nFilm} x 1uF bridge film; damper ${damper ? "yes" : "no"}; stud ${studL * 1e9} nH loop
VSP src_p 0 DC ${Vh}
LSP src_p dcp ${SRC_L} ic=${Idc.toExponential(5)}
VSN src_n 0 DC ${-Vh}
LSN src_n dcn ${SRC_L} ic=${(-Idc).toExponential(5)}
RMID mid 0 1u
`;
  for (const [half, hi, lo] of [["P", "dcp", "mid"], ["N", "mid", "dcn"]]) {
    const h = half.toLowerCase();
    for (let i = 0; i < nCan; i++)
      s += `V${half}C${i} ${hi} ${h}a${i} DC 0\nR${half}C${i} ${h}a${i} ${h}b${i} ${CAN.esr}\nL${half}C${i} ${h}b${i} ${h}c${i} ${CAN.esl}\nC${half}C${i} ${h}c${i} ${lo} ${CAN.C} ic=${Vh}\n`;
    s += `LVS${half} ${hi} vs${half} ${VIENNA_STUB_L}\n`;
    for (let i = 0; i < VIENNA_FILM_PER_HALF; i++)
      s += `VV${half}${i} vs${half} v${half}a${i} DC 0\nRV${half}${i} v${half}a${i} v${half}b${i} ${FILM.esr}\nLV${half}${i} v${half}b${i} v${half}c${i} ${FILM.esl}\nCV${half}${i} v${half}c${i} ${lo} ${FILM.C} ic=${Vh}\n`;
  }
  s += `LSTP dcp stp ${studL / 2}\nRSTP stp busf ${studR / 2}\nLSTN busnf stn ${studL / 2}\nRSTN stn dcn ${studR / 2}\n`;
  for (let i = 0; i < nFilm; i++)
    s += `VBF${i} busf bfa${i} DC 0\nRBF${i} bfa${i} bfb${i} ${FILM.esr}\nLBF${i} bfb${i} bfc${i} ${FILM.esl}\nCBF${i} bfc${i} busnf ${FILM.C} ic=${VBUS}\n`;
  if (damper) s += `VDMP busf dmpa DC 0\nRDMP dmpa dmpb ${DAMP.R}\nCDMP dmpb busnf ${DAMP.C} ic=${VBUS}\n`;
  s += `VBR busf bus DC 0\nVBRN busn busnf DC 0\n`;
  return s;
}

export function deck(sku, corner, opt = {}) {
  const t = TANKS[sku], op = opPoint(sku, corner);
  const T = 1 / op.fsw, pw = T / 2 - TDEAD - 20e-9, d = op.duty ?? 0.5;
  const csDie = t.cs ?? 0, cjo = cjoFor(t.dieP.qoss800) * t.par, Ls = t.Lm / (t.n * t.n);
  const at = (x) => ((((x % 1) + 1) % 1) * T).toExponential(5);
  const leg = (X, hi, lo) => `
VGH${X} gh${X} 0 PULSE(0 1 ${at(hi)} 20n 20n ${pw.toExponential(5)} ${T.toExponential(5)})
VGL${X} gl${X} 0 PULSE(0 1 ${at(lo)} 20n 20n ${pw.toExponential(5)} ${T.toExponential(5)})
VHS${X} bus bh${X} DC 0
BSH${X} bh${X} leg${X} I=v(bh${X},leg${X})*(2e-5+v(gh${X})*${t.gOn})
BSL${X} leg${X} busn I=v(leg${X},busn)*(2e-5+v(gl${X})*${t.gOn})
DBH${X} leg${X} bh${X} DBODY
DBL${X} busn leg${X} DBODY
CSH${X} bh${X} leg${X} ${(csDie * t.par).toExponential(5)}
CSL${X} leg${X} busn ${(csDie * t.par).toExponential(5)}`;
  const tstop = 400e-6, tstart = tstop - 12 * T;
  return `* E81/F-G-1 DC-link HF ripple share — ${fingerprint(sku)} corner ${corner} VBUS=${op.VBUS} VBANK=${op.VBANK} fsw=${f(op.fsw / 1e3, 1)}k d=${f(d, 4)}
.model DREC D(Is=1e-9 N=1.8 Rs=0.022)
.model DBODY D(Is=1e-12 N=4 Rs=0.03 Cjo=${cjo.toExponential(5)} Vj=${COSS_VJ} M=${COSS_M})
${link(NCAN_HALF[sku], op.VBUS, op.P / op.VBUS / 0.985, opt)}
${leg("A", 0, 0.5)}
${leg("B", d, d + 0.5)}
VSP2 legA tk DC 0
CR tk tkb ${t.Cr.toExponential(5)} ic=0
LR tkb pri ${t.Lr.toExponential(5)}
RW pri prib 0.004
LM prib legB ${t.Lm.toExponential(5)}
LS1 s1w s1n ${Ls.toExponential(5)}
RW1 s1w s1p 0.002
VSA s1p s1q DC 0
LS2 s2w s2n ${Ls.toExponential(5)}
RW2 s2w s2p 0.002
VSB s2p s2q DC 0
KA LM LS1 0.9999
KB LM LS2 0.9999
KC LS1 LS2 0.9999
RB1 s1q 0ba 1meg
RB2 s1n 0ba 1meg
RB3 s2q 0bb 1meg
RB4 s2n 0bb 1meg
DA1 s1q bkA DREC
DA2 0ba s1q DREC
DA3 s1n bkA DREC
DA4 0ba s1n DREC
DB1 s2q bkB DREC
DB2 0bb s2q DREC
DB3 s2n bkB DREC
DB4 0bb s2n DREC
VBKA bkA 0ba DC ${op.VBANK}
VBKB bkB 0bb DC ${op.VBANK}
RTA 0ba 0 1u
RTB 0bb 0 1u
.tran 20n ${tstop.toExponential(5)} ${tstart.toExponential(5)} 10n uic
.option method=gear reltol=1e-3 abstol=1e-6 vntol=1u itl4=100
.control
set filetype=ascii
run
wrdata NAME.out i(VBR) i(VPC0) i(VVP0) i(VBF0) v(bus,busn) i(VBKA) i(VBKB) i(LSTP)
quit
.endc
.end`;
}
export const COLS = ["ibr", "ican", "ivf", "ibf", "vbus", "ibka", "ibkb", "istud"];

const stats = (t, y) => {
  const n = t.length, span = t[n - 1] - t[0];
  let s = 0, s2 = 0;
  for (let i = 1; i < n; i++) { const dt = t[i] - t[i - 1]; s += 0.5 * (y[i] + y[i - 1]) * dt; s2 += 0.5 * (y[i] ** 2 + y[i - 1] ** 2) * dt; }
  const mean = s / span, rms = Math.sqrt(s2 / span);
  return { mean, rms, ac: Math.sqrt(Math.max(rms * rms - mean * mean, 0)) };
};
const pct = (y, p) => { const s = [...y].sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))]; };

export function run1(sku, corner, tag, opt) {
  const name = `dclink-${sku}-${corner}-${tag}`;
  const r = runDeck(name, deck(sku, corner, opt).replace("NAME.out", `${name}.out`), COLS);
  const c = r.cols, t = r.t;
  const br = stats(t, c.ibr), can = stats(t, c.ican), vf = stats(t, c.ivf), bf = stats(t, c.ibf), st = stats(t, c.istud);
  const op = opPoint(sku, corner);
  return { tag, corner, opt, P: (stats(t, c.ibka).mean + stats(t, c.ibkb).mean) * op.VBANK,
    ibrDc: br.mean, ibrAc: br.ac, can: can.ac, vf: vf.ac, bf: bf.ac, stud: st.ac,
    v1: pct(c.vbus, 0.01), v99: pct(c.vbus, 0.99) };
}

const HDR = ["corner", "variant", "bridge_film_uF", "n_film", "damper", "stud_nH", "P_sim_kW", "Ibr_dc_A", "Ibr_ac_rms_A",
  "I_per_bridge_film_A", "I_per_elyt_can_A", "I_per_vienna_film_A", "I_stud_ac_A", "Vbus_p1_V", "Vbus_p99_V",
  "can_pct_of_class", "film_pct_of_line", "verdict", "extra_films", "rupees_at_10k"];
// India @10k basis: parts-db price1k × 0.8 for PP-1u-1100 (68) and the damper (2.2 µF film ≈ 90 + 0.33 Ω 10 W ≈ 44)
const RS_FILM = 68 * 0.8, RS_DAMP = 90 * 0.8 + 44 * 0.8, N_DRAWN_BASE = 4;

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const skus = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TANKS);
  let anyFail = 0;
  for (const sku of skus) {
    const RES = join(ROOT, "simulation-results", sku);
    mkdirSync(RES, { recursive: true });
    // full cost ladder on 30 / 50 kW (the extremes); baseline + the recommended point on the others
    const full = sku === "30kw" || sku === "50kw";
    const variants = [["as-drawn", { nFilm: 4, damper: false, studL: 40e-9 }]];
    if (full) {
      for (const uF of [8, 12, 16, 20, 24]) for (const damper of [false, true]) for (const studL of [40e-9, 20e-9])
        variants.push([`film${uF}u-${damper ? "damped" : "bare"}-stud${studL * 1e9}n`, { nFilm: uF, damper, studL }]);
    } else {
      const dr = drawnFor(sku);
      variants.push([`film${dr.nFilm}u-${dr.damper ? "damped" : "bare"}-stud40n`, { nFilm: dr.nFilm, damper: dr.damper, studL: 40e-9 }]);
      variants.push([`film${dr.nFilm}u-${dr.damper ? "damped" : "bare"}-stud20n`, { nFilm: dr.nFilm, damper: dr.damper, studL: 20e-9 }]);
    }
    const rows = [HDR];
    console.log(`\n=== ${sku} DC-link HF ripple share (${fingerprint(sku)}; ${NCAN_HALF[sku]} cans/half) ===`);
    for (const corner of CORNERS) for (const [tag, opt] of variants) {
      const r = run1(sku, corner, tag, opt);
      const canPct = 100 * r.can / CAN.classA, filmPct = 100 * r.bf / FILM.rmsA;
      const ok = r.can <= CAN.gateFrac * CAN.rfqA && r.bf <= FILM.rmsA;
      const extra = Math.max(opt.nFilm - N_DRAWN_BASE, 0), rs = extra * RS_FILM + (opt.damper ? RS_DAMP : 0);
      rows.push([corner, tag, opt.nFilm, opt.nFilm, opt.damper ? "yes" : "no", opt.studL * 1e9, f(r.P / 1e3), f(r.ibrDc), f(r.ibrAc),
        f(r.bf), f(r.can), f(r.vf), f(r.stud), f(r.v1, 0), f(r.v99, 0), f(canPct, 0), f(filmPct, 0), ok ? "OK" : "OVER",
        extra, f(rs, 0)]);
      console.log(`${corner.padEnd(20)} ${tag.padEnd(26)} P ${f(r.P / 1e3)} kW · Ibr ${f(r.ibrDc)}dc/${f(r.ibrAc)}ac · film ${f(r.bf)} A (${f(filmPct, 0)} %) · CAN ${f(r.can)} A (${f(canPct, 0)} % of ${CAN.classA} A) · Vfilm ${f(r.vf)} · stud ${f(r.stud)} A · bus ${f(r.v1, 0)}–${f(r.v99, 0)} V → ${ok ? "OK" : "OVER"}`);
    }
    // cheapest variant that is OK at BOTH corners
    const byTag = {};
    for (const r of rows.slice(1)) (byTag[r[1]] ??= []).push(r);
    const okTags = Object.entries(byTag).filter(([, rs]) => rs.length === CORNERS.length && rs.every((r) => r[17] === "OK"));
    const cheapest = okTags.sort((a, b) => +a[1][0][19] - +b[1][0][19])[0];
    const note = cheapest
      ? `cheapest variant holding every can ≤ ${100 * CAN.gateFrac} % of the ${CAN.classA} A class and every film ≤ ${FILM.rmsA} A at BOTH corners: ${cheapest[0]} — ${cheapest[1][0][19]} rupees/module @10k`
      : `NO variant in the sweep holds both lines — widen the sweep`;
    if (!cheapest) anyFail++;
    console.log(`→ ${note}`);
    writeFileSync(join(RES, "dclink-ripple.csv"),
      `# E81/F-G-1 DC-link HF ripple share (ngspice-46); ${fingerprint(sku)}; ${NCAN_HALF[sku]} × 470 µF per half; netlists spice/generated/dclink-${sku}-*.cir\n` +
      `# DRAWN target: ${DRAWN.nFilm} × 1 µF bridge entry film${DRAWN.damper ? ` + RC damper ${DAMP.C * 1e6} µF + ${DAMP.R} Ω` : ""} — current-coordination [DCLINK]/[SYNC] read this line\n` +
      `# ASSUMED: can ESR ${CAN.esr} Ω @100 kHz, ESL ${CAN.esl * 1e9} nH, class ${CAN.classA} A rms (2.5 A @120 Hz × 1.4); film ESR ${FILM.esr * 1e3} mΩ, ESL ${FILM.esl * 1e9} nH, line ${FILM.rmsA} A rms; Vienna stub ${VIENNA_STUB_L * 1e9} nH; source behind ${SRC_L * 1e6} µH/rail\n` +
      `# GATE: per-can rms ≤ ${CAN.gateFrac} × ${CAN.classA} A = ${f(CAN.gateFrac * CAN.rfqA)} A, per-film rms ≤ ${FILM.rmsA} A\n` +
      `# ${note}\n` +
      rows.map((r) => r.join(",")).join("\n") + "\n");
    console.log(`→ simulation-results/${sku}/dclink-ripple.csv`);
  }
  process.exit(anyFail ? 1 : 0);
}
