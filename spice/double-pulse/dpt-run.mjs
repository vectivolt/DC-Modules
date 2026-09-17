// dpt-run.mjs — PER-SKU double-pulse suite (§16, rev E81).
//
// WHAT CHANGED AT E81 (C-sic F-C-3 / F-C-5 / F-C-9 / F-C-12). The pre-E81 deck ran ONE 30 kW-class
// case per family, at a gate network and snubber the schematic does not draw, at a current far below
// the real one, and at a −4 V off-bias the hardware does not have; nothing in the battery read the
// resulting CSVs, so 20 of their 30 rows were FAIL rows that no gate saw. This suite instead:
//   · runs BOTH families for EVERY SKU at that SKU's own simulated currents
//     (LLC: llc-stress.csv Ifet_toff / Ip_pk · PFC: vienna-switched.csv switch peak),
//   · reads the gate network, the RC snubber and the RCD clamp OUT OF cells.tsx (drawn() below), so a
//     schematic edit changes the simulation instead of silently invalidating it,
//   · uses the drawn −3 V off-bias (QA01C-18) everywhere,
//   · uses the datasheet-fitted 1200 V model (spice/models/sic-1200-c3m.lib) whose output charge is
//     the datasheet's, not half of it,
//   · reports CHANNEL turn-off energy, not the drain-node integral, so the E81 turn-off snubber
//     (tanks.mjs `cs`) is credited correctly, and
//   · writes a fingerprinted CSV per SKU that calculations/stress-audit.mjs GATES.
//
// The PFC 750 V family still runs the SIC750_10R model in sic-behavioral.lib. It was NOT re-fitted at
// E81: its Cjo 8.7 nF gives Eoss(415 V) = 46 µJ, which is the right order for a 750 V 10 mΩ die, and
// the 30/40 kW 20/15 mΩ dies have SMALLER Coss — using the 10 mΩ model there is the conservative
// direction for turn-off energy and the optimistic one for ring damping. Re-fit it when a real 750 V
// datasheet lands (RFQ).
//
// Run: node spice/double-pulse/dpt-run.mjs
import { runDeck, trapz, maxIn, minIn, maxSlew } from "../run.mjs";
import { plotSVG } from "../../calculations/plot.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MIRROR_CLAMP } from "../../calculations/cost/parts-db.mjs";
import { TANKS, fingerprint } from "../../calculations/llc/tanks.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const f = (x, d = 2) => Number.isFinite(x) ? Number(x.toFixed(d)) : "NaN";
const SKUS = ["30kw", "40kw", "50kw", "50kwa"];

// ---------------------------------------------------------------- acceptance criteria (ONE place)
export const DPT = {
  vLlc: 1200, vPfc: 750,
  vgsFwMax: 1.4,       // V — hot MINIMUM Vgs(th) of the 1200 V class (1.8 V min @25 °C, ~5 mV/K)
  vgsMax: 19, vgsMin: -8,   // C3M0021120K transient absolute maximum gate window
  // E81 LAYOUT RULE: the LLC commutation loop is specified at 5 nH (laminated bus, bridge films at the
  // package pins), because Vds_pk is dominated by I*sqrt(L/C) and 10 nH cannot meet the 80 % house rule
  // at any cs the ZVS budget allows. EVT T-59 measures it from the ring frequency. 10 nH is kept as a
  // sensitivity row on every corner so the cost of missing the rule is visible.
  lloopLlc: 5e-9, lloopLlcSens: 10e-9,
  lloopPfc: 5e-9, lloopPfcSweep: [5e-9, 7e-9, 10e-9],
  // Acceptance. REPETITIVE corners get the 80 % house rule. The +6 % bus row is 880 V, ABOVE the 860 V
  // F.03 hardware trip, so the bridge can only see it for the F.03 kill time (one switching period plus
  // the HRTIMER fault path) — a non-repetitive excursion, held to 90 %.
  // E81 decision (lead): 0.85 on repetitive corners. At the 5 nH design loop the achievable with 100–165 A turn-off and a 1 kV C0G
  // snubber is 81–84 % of 1200 V (LLC) and 76–82 % of 750 V (Vienna, single clamp); the DC bus itself sits at ≤ 69 % / 57 %, both die
  // classes are avalanche-rated, and no cheaper network (2.2 nF breaks ZVS at PS150; an RC snubber is CV²f) reaches 80 %. T-59 measures.
  vdsPctRepetitive: 0.85, vdsPctExcursion: 0.90,
  voff: -3,            // QA01C-18 drawn off-bias
  rgOffLlcDecided: 0,  // E81 decision: R{id}OFF deleted on the LLC channels (driver ROL 0.3 Ω)
  // ---- the ZVS dead-time budget that bounds `cs` from ABOVE.
  // HRTIMER dead-time generator: 9-bit count. DTGCKDIV 0 = 578.7 ps/step → 296 ns; DTGCKDIV 1 =
  // 1.157 ns/step → 592 ns, which is what the E81 adaptive schedule uses. Two independent limits:
  //   (a) firmware clamp with margin: the adaptive schedule is clamped to [60, 900] ns on DTGCKDIV 2
  //       (2.3 ns steps, 1.18 µs range), so 0.75 × 900 ns = 675 ns
  //   (b) duty budget: t_dead ≤ 12 % of the PSM period (4.93 µs at f_max 203 kHz) = 592 ns  ← binding
  deadClampNs: 900, deadFrac: 0.75, dutyFrac: 0.12, fswMax: 203e3,
  csMax: 2.2e-9,       // above this the L_loop–cs ring lengthens and Vds_pk comes back (C-sic §snubber)
  csSweep: [0, 150e-12, 330e-12, 470e-12, 1e-9],
  // per-SKU extra cs candidates the lead is choosing between (E81): 40 kW needs the 470 pF-1 nF gap
  // resolved because 470 pF leaves its 330 VAC / 500 V-series / 55 C row at eta 94.94 % vs the 95 %
  // grid floor, while 1 nF rings PAR500 to 91 % of the die rating.
  csExtra: { "40kw": [680e-12, 820e-12] },
  // FALSIFICATION HOOK. DPT_CS_PF=<n> forces the recommendation to that cs so the stress-audit [DPT]
  // gate can be shown to discriminate (e.g. DPT_CS_PF=4700 must fail the ZVS budget). Not for production.
};
DPT.deadMax = Math.min(DPT.deadFrac * DPT.deadClampNs * 1e-9, DPT.dutyFrac / DPT.fswMax);
// datasheet C3M0021120K: Eoss(800 V) = 99 µJ; for an m = 0.5 junction Qoss = 3·Eoss/V.
export const Eoss = (V) => 99e-6 * Math.pow(V / 800, 1.5);
export const Qoss = (V) => 3 * Eoss(V) / V;

// ---------------------------------------------------------------- the DRAWN network, read off cells.tsx
export function drawn() {
  const src = readFileSync(join(ROOT, "packages/power-primitives/cells.tsx"), "utf8");
  const num = (s) => (/[munp]F$/.test(s) ? Number(s.slice(0, -2)) * { m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12 }[s.slice(-2, -1)] : Number(s));
  const llc = src.match(/id=\{`\$\{id\}H`\}[\s\S]{0,220}?rgOn="([\d.]+)" rgOff="([\d.]+)"/);
  const pfc = src.match(/id=\{`\$\{id\}G`\}[\s\S]{0,260}?rgOn="([\d.]+)" rgOff="([\d.]+)"/);
  const rsn = src.match(/name=\{`R\$\{id\}SN`\} resistance="([\d.]+)"/);
  const csn = src.match(/name=\{`C\$\{id\}SN`\} capacitance="([\w.]+)"/);
  const ccl = src.match(/name=\{`C\$\{id\}C`\} capacitance="([\w.]+)"/);
  if (!llc || !pfc || !rsn || !csn) throw new Error("dpt-run: could not read the drawn gate/snubber network out of cells.tsx");
  return {
    llcRgOn: +llc[1], llcRgOff: +llc[2],
    pfcRgOn: +pfc[1], pfcRgOff: +pfc[2],
    snubR: +rsn[1], snubC: num(csn[1]),
    clampC: ccl ? num(ccl[1]) : 0,
    // the RCD clamp as drawn catches PH ABOVE DCP only — there is no mirror to DCN (C-sic F-C-13),
    // so the negative half-cycle runs with snubber only. Both polarities are `final` rows.
    clampSingleSided: /name=\{`D\$\{id\}C`\}[\s\S]{0,40}TO247_2/.test(src) && !/name=\{`D\$\{id\}CN`\}/.test(src),
  };
}

// ---------------------------------------------------------------- per-SKU operating points
const csvRows = (p) => { const L = readFileSync(join(ROOT, p), "utf8").split("\n").filter((l) => l && !l.startsWith("#")); const h = L[0].split(","); return L.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [h[i], isNaN(+v) ? v : +v]))); };
// CURRENT CONVENTION. The cell simulates ONE die at the PER-POSITION current. That is deliberate and
// conservative on two counts: (i) koff = Eoff/(V·I) is then directly the POSITION's coefficient, because
// `par` dies each carrying I/par contribute par·k·V·(I/par) = k·V·I; (ii) koff rises with current, so
// measuring at the whole-position current over-states it — and it is also the real stress if one die of
// a paralleled position opens. In PSM the LEADING leg turns off near the tank peak (Ip_pk) while the
// LAGGING leg turns off near zero; the leading leg sets the LOSS and the lagging leg sets the ZVS budget.
export function llcPoints(sku) {
  const r = csvRows(`simulation-results/${sku}/llc-stress.csv`);
  const at = (c) => r.find((x) => x.corner === c);
  const ser = at("SER250-full"), ps = at("PS150-Imax"), p5 = at("PAR500-full");
  return [
    { tag: "SER250-PFM", V: ser.bus_V, I: ser.Ifet_toff_A, fsw: ser.fsw_kHz * 1e3, note: "SER 250 V bank, PFM above resonance — the current-critical corner (both legs turn off at Ifet_toff)" },
    { tag: "PS150-lead", V: 725, I: ps.Ip_pk_A, fsw: ps.fsw_kHz * 1e3, note: "PS150-Imax LEADING leg at 475 VAC (bus floor 1.08*sqrt2*475 = 725 V) — PSM, the leading leg turns off at the tank peak" },
    { tag: "PAR500-full", V: p5.bus_V, I: p5.Ifet_toff_A, fsw: p5.fsw_kHz * 1e3, note: "PAR 500 V bank at the 830 V bus cap — the worst VOLTAGE corner, PFM" },
    { tag: "PAR500-pk", V: p5.bus_V, I: p5.Ip_pk_A, fsw: p5.fsw_kHz * 1e3, note: "same corner at the tank PEAK current — the conservative bound if the modulator ever phase-shifts here" },
  ];
}
// the ZVS-critical point: the LAGGING leg at PS150-Imax, which turns off at almost nothing
export function zvsPoint(sku) {
  const ps = csvRows(`simulation-results/${sku}/llc-stress.csv`).find((x) => x.corner === "PS150-Imax");
  return { V: ps.bus_V, I: ps.Ifet_toff_A, fsw: ps.fsw_kHz * 1e3 };
}
export const tDeadReq = (sku, V, I, cs) => 2 * TANKS[sku].par * (Qoss(V) + cs * V) / I;
export function pfcPoints(sku) {
  const k = sku === "50kwa" ? "50kw" : sku;
  const vs = readFileSync(join(ROOT, "calculations/out/vienna-switched.csv"), "utf8").split("\n").filter((l) => /^\d/.test(l)).map((l) => l.split(","));
  const row = vs.find((x) => x[0] === k && x[1] === "330-full-bus830-lot92");
  const Isw = Math.round(+row[8]);     // switch peak incl. ripple at the 330 VAC continuous corner
  // The Vienna pair blocks |V_PH − V_MID| ≈ bus/2 in BOTH polarities; the drawn RCD clamps only the
  // positive one, so the two halves of the line cycle are two different stresses (C-sic F-C-13).
  return [
    { tag: "clamped", V: 425, I: Isw, CLAMP: 1, note: "positive half-cycle — PH above DCP, the drawn RCD clamps it" },
    { tag: "UNCLAMPED", V: 425, I: Isw, CLAMP: 0, note: "negative half-cycle — PH below DCN, NO clamp as drawn (F-C-13)" },
    { tag: "UNCLAMPED-vhi", V: 450.5, I: Isw, CLAMP: 0, note: "+6 % bus, unclamped polarity" },
  ];
}

// ---------------------------------------------------------------- decks
// FREEWHEEL GATE LOOP. The complementary device is held off by OUTL (driver R_OL 0.3 Ohm, DATASHEET
// NSI66x1A rev 1.1) through R{id}OFF, IN PARALLEL with the driver's internal active Miller clamp
// (CLAMP tied straight to the gate in cells.tsx; V_CLAMP = VEE2 + 0.8 V at I_CLAMP = 1 A, so ~0.8 Ohm).
// The pre-E81 deck modelled it as a bare 4.7 Ohm with no clamp at all, which over-states the Miller
// peak by ~2.3x at Rg_off = 0. R_g(int) 3.3 Ohm is inside the model.
const fwGateR = (RGOFF) => 1 / (1 / Math.max(RGOFF + 0.3, 0.3) + 1 / 0.8);
function llcDeck({ V, I, RGON, RGOFF, LLOOP, CS, VOFF, FW = "SIC1200_23R_C" }) {
  const L = 60e-6, t1f = 0.4e-6, t2r = t1f + 1.5e-6, t2f = t2r + 0.8e-6, tstop = t2f + 0.6e-6;
  return `* DPT-LLC V=${V} I=${I} Cs=${CS} Rgoff=${RGOFF} Lloop=${LLOOP} Voff=${VOFF}
.include ../models/sic-1200-c3m.lib
VBUS bus 0 DC ${V}
CDC bus 0 100u ic=${V}
LLP bus kd ${LLOOP}
MFW kd gfw swk ${FW}
LFWK swk sw 1.5n
RGFW gfw fwref ${f(fwGateR(RGOFF), 3)}
VGFW fwref swk ${VOFF}
${CS > 0 ? `CSD sw s ${CS}\nCSF kd swk ${CS}` : "* no turn-off snubber"}
LLD kd sw ${L} ic=${I}
VSNS sw d1 0
LD d1 d 2n
M1 d g ks SIC1200_23R_C
LKS ks s 1.5n
LSP s 0 2n
VDRV drv ks PWL(0 18 ${t1f} 18 ${t1f + 5e-9} ${VOFF} ${t2r} ${VOFF} ${t2r + 5e-9} 18 ${t2f} 18 ${t2f + 5e-9} ${VOFF})
RGN drv gon ${RGON}
DGN gon g DIDEAL
${RGOFF > 0 ? `DGF g goff DIDEAL\nRGF goff drv ${RGOFF}` : "DGF g drv DIDEAL"}
.model DIDEAL D(Is=1e-3 N=0.1)
.tran 0.2n ${tstop} uic
.option method=gear reltol=1e-3 abstol=1u vntol=1m
.control
set filetype=ascii
run
wrdata OUTNAME v(d,ks) v(g,ks) i(VSNS) v(gfw,swk)
quit
.endc
.end`;
}
function pfcDeck({ V, I, RGON, RGOFF, LLOOP, SNUBR, SNUBC, CLAMP, CLAMPC, VOFF }) {
  const L = 42e-6, t1f = 0.4e-6, t2r = t1f + 1.5e-6, t2f = t2r + 0.8e-6, tstop = t2f + 0.6e-6;
  return `* DPT-PFC V=${V} I=${I} Rgoff=${RGOFF} Lloop=${LLOOP} snub=${SNUBR}/${SNUBC} clamp=${CLAMP}
.include ../models/sic-behavioral.lib
VBUS bus 0 DC ${V}
CDC bus 0 100u ic=${V}
LLP bus kd ${LLOOP}
DFW sw kd JBS1200_40
RSN sw nsn ${SNUBR}
CSN nsn 0 ${SNUBC}
${CLAMP ? `DCL sw clp JBS1200_40\nCCL clp bus ${CLAMPC} ic=0\nRCL clp bus 470` : "* no clamp (negative half-cycle as drawn)"}
LLD kd sw ${L} ic=${I}
VSNS sw d1 0
LD d1 d 2n
M1 d g ks SIC750_10R
LKS ks s 1.5n
LSP s 0 2n
VDRV drv ks PWL(0 18 ${t1f} 18 ${t1f + 5e-9} ${VOFF} ${t2r} ${VOFF} ${t2r + 5e-9} 18 ${t2f} 18 ${t2f + 5e-9} ${VOFF})
RGN drv gon ${RGON}
DGN gon g DIDEAL
${RGOFF > 0 ? `DGF g goff DIDEAL\nRGF goff drv ${RGOFF}` : "DGF g drv DIDEAL"}
.model DIDEAL D(Is=1e-3 N=0.1)
.tran 0.2n ${tstop} uic
.option method=gear reltol=1e-3 abstol=1u vntol=1m
.control
set filetype=ascii
run
wrdata OUTNAME v(d,ks) v(g,ks) i(VSNS) v(sw)
quit
.endc
.end`;
}

// ---------------------------------------------------------------- metrics
// CHANNEL turn-off energy, not the drain-node integral. Cs sits at the package pins (sw→s) and so
// bypasses the drain-lead sense VSNS; the device's own Coss does not, so subtracting its datasheet
// stored energy at the settled voltage leaves the channel term. Capacitor charge is recovered
// losslessly at the ZVS turn-on and must NOT be counted as loss.
function measure(r, { tOff, tOn, fam }) {
  const { t, cols } = r, w = 900e-9;
  const Edrain = trapz(t, t.map((_, i) => cols.vds[i] * cols.id[i]), tOff - 20e-9, tOff + w);
  let vEnd = 0; for (let i = 0; i < t.length; i++) if (t[i] <= tOff + w) vEnd = cols.vds[i];
  const Echan = fam === "llc" ? Edrain - Eoss(Math.max(vEnd, 1)) : Edrain;
  return {
    Edrain, Echan,
    Eon: trapz(t, t.map((_, i) => cols.vds[i] * cols.id[i]), tOn - 20e-9, tOn + 600e-9),
    vds_pk: maxIn(t, cols.vds, tOff - 20e-9, tOff + w),
    dvdt: maxSlew(t, cols.vds, tOff, tOff + 400e-9) / 1e9,
    vgs_max: maxIn(t, cols.vgs, 0, Infinity), vgs_min: minIn(t, cols.vgs, 0, Infinity),
    vfw: fam === "llc" ? maxIn(t, cols.vfw, tOn - 20e-9, tOn + 600e-9) : null,
  };
}

const HDRC = ["case", "kind", "V", "I_A", "Cs_pF", "Rg_off", "Lloop_nH", "Eoff_chan_uJ", "koff_nJ_VA",
  "Eon_hard_uJ", "Vds_pk_V", "Vds_pk_pct", "dvdt_Vns", "vgs_fw_pk_V", "vgs_min_V", "t_dead_req_ns", "PASS", "note"];

function pass(fam, m, lim) {
  const rating = fam === "llc" ? DPT.vLlc : DPT.vPfc;
  return m.vds_pk <= (lim ?? DPT.vdsPctRepetitive) * rating && m.vgs_max <= DPT.vgsMax && m.vgs_min >= DPT.vgsMin
    && (fam === "pfc" || m.vfw <= DPT.vgsFwMax);
}

const libHash = createHash("sha256").update(readFileSync(join(HERE, "..", "models", "sic-1200-c3m.lib"))).digest("hex").slice(0, 12);

async function runFamily(sku, fam, cases) {
  const rows = [HDRC];
  const t1f = 0.4e-6, tOff = t1f, tOn = t1f + 1.5e-6;
  let plotted = null;
  for (const c of cases) {
    const name = `dpt-${fam}-${sku}-${c.tag}`;
    const deck = (fam === "llc" ? llcDeck(c) : pfcDeck(c)).replace("OUTNAME", `${name}.out`);
    const r = runDeck(name, deck, ["vds", "vgs", "id", "vfw"]);
    const m = measure(r, { tOff, tOn, fam });
    const rating = fam === "llc" ? DPT.vLlc : DPT.vPfc;
    const koff = m.Echan / (c.V * c.I);
    // ZVS dead-time need for the LLC leg at this voltage and turn-off current (both dies of both positions)
    // the ZVS-BINDING dead time for this cs: the PS150-Imax LAGGING leg, which turns off at almost
    // nothing — not this row's own (large) turn-off current.
    const zp2 = fam === "llc" ? zvsPoint(sku === "50kwa" ? "50kw" : sku) : null;
    const tDead = fam === "llc" ? tDeadReq(sku, zp2.V, zp2.I, c.CS ?? 0) * 1e9 : "";
    const ok = pass(fam, m, c.vdsLim);
    rows.push([c.tag, c.kind, c.V, f(c.I, 1), Math.round((c.CS ?? 0) * 1e12), c.RGOFF, c.LLOOP * 1e9,
      f(m.Echan * 1e6, 1), f(koff * 1e9, 2), f(m.Eon * 1e6, 1), f(m.vds_pk, 1), f(100 * m.vds_pk / rating, 1),
      f(m.dvdt, 1), m.vfw === null ? "" : f(m.vfw, 2), f(m.vgs_min, 2), tDead === "" ? "" : f(tDead, 0),
      ok ? "PASS" : "FAIL", `"${c.note ?? ""}"`]);
    console.log(`  ${name.padEnd(30)} ${c.kind.padEnd(11)} Eoff_ch ${String(f(m.Echan * 1e6, 0)).padStart(5)} µJ  koff ${String(f(koff * 1e9, 2)).padStart(6)}  Vpk ${String(f(m.vds_pk, 0)).padStart(5)} V (${f(100 * m.vds_pk / rating, 0)} %)  dv/dt ${String(f(m.dvdt, 0)).padStart(4)}${m.vfw !== null ? `  vgs_fw ${f(m.vfw, 2)}` : ""}  ${ok ? "PASS" : "FAIL"}`);
    if (c.kind === "final" && !plotted) plotted = { r, name };
  }
  return { rows, plotted };
}

// ---------------------------------------------------------------- main
// Only RUN the suite when invoked directly; stress-audit imports DPT/drawn()/Qoss from here.
const MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (MAIN) await main();
async function main() {
const D = drawn();
console.log("=== DPT SUITE (E81) — per SKU, at the drawn network and the simulated currents ===");
console.log(`drawn(): LLC Rg ${D.llcRgOn}/${D.llcRgOff} Ω · Vienna Rg ${D.pfcRgOn}/${D.pfcRgOff} Ω · snubber ${D.snubR} Ω / ${D.snubC * 1e12} pF · clamp ${f(D.clampC * 1e9, 0)} nF ${D.clampSingleSided ? "(single-sided — no mirror to DCN)" : ""}`);
if (D.llcRgOff !== DPT.rgOffLlcDecided)
  console.log(`  NOTE cells.tsx still draws R{id}OFF = ${D.llcRgOff} Ω on the LLC channels; the E81 decision (and tanks.mjs koff) is ${DPT.rgOffLlcDecided} Ω. The final rows (and tanks.koff) use 0 ohm; a drawn-* row carries the schematic value and stress-audit fails until the two agree.`);

const REC = {};   // per-SKU recommendation printed at the end for tanks.mjs

for (const sku of SKUS) {
  const src = sku === "50kwa" ? "50kw" : sku;
  const t = TANKS[sku], RES = join(ROOT, "simulation-results", sku);
  mkdirSync(join(RES, "plots"), { recursive: true });
  console.log(`\n--- ${sku}  (par ${t.par}, tanks cs ${Math.round((t.cs ?? 0) * 1e12)} pF, tanks koff ${f((t.koff ?? 0) * 1e9, 2)} nJ/(V·A))`);

  // ---- LLC. Sweep cs at the E81 Rg_off = 0 Ω over this SKU's own three corners, then pick the
  // recommended cs under the three constraints and re-label those rows `final`.
  const lp = llcPoints(src), zp = zvsPoint(src);
  const base = { RGON: D.llcRgOn, LLOOP: DPT.lloopLlc, VOFF: DPT.voff, RGOFF: DPT.rgOffLlcDecided };
  const csT = t.cs ?? 0;   // finals are pinned to tanks.mjs, not to the sweep's own pick
  const llcCases = [];
  for (const CS of (process.env.DPT_CS_PF ? [...new Set([...DPT.csSweep, +process.env.DPT_CS_PF * 1e-12])] : [...new Set([...DPT.csSweep, ...(DPT.csExtra[sku] ?? []), csT])])) for (const p of lp)
    llcCases.push({ ...base, ...p, CS, tag: `cs${Math.round(CS * 1e12)}-${p.tag}`, kind: "sweep" });
  // the schematic-drift row: the same worst-voltage corner at whatever cells.tsx draws TODAY
  llcCases.push({ ...base, ...lp[2], CS: csT, RGOFF: D.llcRgOff, tag: "drawn-PAR500-full", kind: "drawn",
    note: `cells.tsx R{id}OFF = ${D.llcRgOff} Ω` });
  for (const p of lp) llcCases.push({ ...base, ...p, CS: csT, LLOOP: DPT.lloopLlcSens, tag: `sensL10-${p.tag}`, kind: "sensitivity",
    note: "the same corner at 10 nH — the cost of missing the E81 5 nH layout rule" });
  if (sku === "30kw") llcCases.push({ ...base, ...lp[0], CS: csT, tag: "control-lowVth-fw", kind: "control",
    FW: "SIC1200_23R_LOWVT", note: "freewheel die at the datasheet MIN Vgs(th), hot" });
  const llc = await runFamily(sku, "llc", llcCases);

  // ---- choose cs: (a) t_dead at the PS150 LAGGING leg inside the budget, (b) Vds_pk no worse than
  // cs = 0 at every corner, (c) cs <= csMax. Largest surviving cs wins (lowest koff).
  const H = llc.rows[0], col = (r, n) => r[H.indexOf(n)];
  const sweep = llc.rows.slice(1).filter((r) => col(r, "kind") === "sweep");
  const byCs = new Map();
  for (const r of sweep) { if (/PAR500-pk$/.test(col(r, "case"))) continue; const k = +col(r, "Cs_pF"); if (!byCs.has(k)) byCs.set(k, []); byCs.get(k).push(r); }
  const bound = sweep.filter((r) => /PAR500-pk$/.test(col(r, "case")));
  const vpk0 = Math.max(...byCs.get(0).map((r) => +col(r, "Vds_pk_pct")));
  const cand = [];
  for (const [csp, rs] of byCs) {
    const CS = csp * 1e-12, td = tDeadReq(sku, zp.V, zp.I, CS) * 1e9;
    const vpk = Math.max(...rs.map((r) => +col(r, "Vds_pk_pct")));
    // (a) ZVS budget with 10 % of headroom — the budget is computed from a PROXY datasheet Qoss, so a
    // knife-edge selection is not engineering · (b) Vds no worse than cs = 0 · (c) the ring ceiling
    const ok = td <= 0.90 * DPT.deadMax * 1e9 && vpk <= vpk0 + 0.5 && CS <= DPT.csMax;
    cand.push({ csp, CS, td, vpk, koff: Math.max(...rs.map((r) => +col(r, "koff_nJ_VA"))), vfw: Math.max(...rs.map((r) => +col(r, "vgs_fw_pk_V"))), ok });
    console.log(`     cs ${String(csp).padStart(4)} pF: t_dead(PS150 lag, ${zp.I} A) ${f(td, 0)} ns ${td <= 0.90 * DPT.deadMax * 1e9 ? "ok " : "OVER"} (≤ ${f(0.90 * DPT.deadMax * 1e9, 0)} = 90 % of ${f(DPT.deadMax * 1e9, 0)}) · worst Vds ${f(vpk, 1)} % (cs0 ${f(vpk0, 1)} %) · worst koff ${f(Math.max(...rs.map((r) => +col(r, "koff_nJ_VA"))), 2)} · vgs_fw ${f(Math.max(...rs.map((r) => +col(r, "vgs_fw_pk_V"))), 2)} V ${ok ? "" : "← rejected"}`);
  }
  const forced = process.env.DPT_CS_PF ? +process.env.DPT_CS_PF : null;
  // bestFree = the cs the constraints would pick on their own; best = what tanks.mjs actually carries,
  // so the finals and the [DPT] gate always describe the shipped design, and a better cs cannot hide.
  const bestFree = cand.filter((c) => c.ok).sort((a, b) => b.csp - a.csp)[0] ?? cand.find((c) => c.csp === 0);
  const best = forced !== null
    ? (cand.find((c) => c.csp === forced) ?? { csp: forced, CS: forced * 1e-12, td: tDeadReq(sku, zp.V, zp.I, forced * 1e-12) * 1e9, vpk: NaN, koff: NaN, vfw: NaN, ok: false })
    : (cand.find((c) => c.csp === Math.round(csT * 1e12)) ?? bestFree);
  REC[sku] = best;
  console.log(`     → FINALS at tanks cs = ${best.csp} pF, Rg_off 0 Ω, ${DPT.lloopLlc * 1e9} nH → koff ${f(best.koff, 2)} nJ/(V·A), t_dead ${f(best.td, 0)} ns, worst Vds ${f(best.vpk, 1)} %` +
    (bestFree.csp !== best.csp ? `   (free optimum would be ${bestFree.csp} pF → koff ${f(bestFree.koff, 2)}, Vds ${f(bestFree.vpk, 1)} %)` : ""));
  // E81 candidate set: the lead picks cs per SKU from these. `final` is whatever tanks.mjs carries
  // TODAY (so the gate always describes the shipped design); the other candidate rides as final-cs<n>.
  const CAND_CS = [470, 1000, ...(DPT.csExtra[sku] ?? []).map((x) => Math.round(x * 1e12))];
  for (const csp of new Set([...CAND_CS, best.csp])) {
    const rs = [...(byCs.get(csp) ?? []), ...bound.filter((r) => +col(r, "Cs_pF") === csp)];
    const isFinal = csp === Math.round(csT * 1e12);
    for (const r of rs) {
      const isBound = /PAR500-pk$/.test(r[H.indexOf("case")]);
      r[H.indexOf("kind")] = isBound ? "bound" : (isFinal ? "final" : `final-cs${csp}`);
      r[H.indexOf("case")] = r[H.indexOf("case")].replace(/^cs\d+-/, isBound ? "bound-" : `final-cs${csp}-`);
    }
  }

  // ---- the +6 % bus row at the recommended cs
  const vhi = await runFamily(sku, "llc", [...new Set([470, 1000, ...(DPT.csExtra[sku] ?? []).map((x) => Math.round(x * 1e12)), Math.round(csT * 1e12)])].map((csp) => ({
    ...base, ...lp[2], V: Math.round(lp[2].V * 1.06), CS: csp * 1e-12, vdsLim: DPT.vdsPctExcursion,
    tag: csp === Math.round(csT * 1e12) ? "final-PAR500-vhi" : `final-cs${csp}-PAR500-vhi`,
    kind: csp === Math.round(csT * 1e12) ? "final" : `final-cs${csp}`,
    note: "+6 % bus = 880 V, ABOVE the 860 V F.03 trip — a kill-time excursion, 90 % limit" })));
  llc.rows.push(...vhi.rows.slice(1));

  // ---- PFC: both line-cycle polarities at the drawn snubber/clamp
  const pp = pfcPoints(src);
  const pb = { RGON: D.pfcRgOn, RGOFF: D.pfcRgOff, LLOOP: DPT.lloopPfc, SNUBR: D.snubR, SNUBC: D.snubC, CLAMPC: D.clampC, VOFF: DPT.voff };
  // Both line-cycle polarities at 5 / 7 / 10 nH. The "mirror clamp" variant is the CLAMP=1 result read
  // as the negative half-cycle too, so it costs no extra decks: drawn = max(clamped, unclamped),
  // mirrored = clamped on both halves.
  // E81: the mirrored RCD clamp is a per-SKU populated option (parts-db MIRROR_CLAMP drives the BOM); where it is fitted the
  // negative half-cycle FINAL rows run clamped too (CLAMP=1) and say so — the readers (grid, loss-budget, stress-audit) key on
  // the row names, so the drawn clamp state lands in the thermal ledgers without a rename.
  const mirror = !!MIRROR_CLAMP[sku];
  const withMirror = (p) => (mirror && /UNCLAMPED/.test(p.tag)) ? { ...p, CLAMP: 1, note: `${p.note ?? ""} — MIRROR CLAMP FITTED on this SKU (parts-db MIRROR_CLAMP): clamped on both half-cycles` } : p;
  const pfcCases = [];
  for (const LLOOP of DPT.lloopPfcSweep) for (const p of pp.slice(0, 2))
    pfcCases.push({ ...pb, ...withMirror(p), LLOOP, tag: `L${LLOOP * 1e9}-${p.tag}`, kind: LLOOP === DPT.lloopPfc ? "final" : "sensitivity" });
  for (const p of pp.slice(2)) pfcCases.push({ ...pb, ...withMirror(p), tag: `final-${p.tag}`, kind: "final", vdsLim: DPT.vdsPctExcursion,
    note: mirror ? "+6 % bus, negative polarity with the MIRROR CLAMP fitted — a line excursion, 90 % limit" : "+6 % bus, unclamped polarity — a line excursion, 90 % limit" });
  const pfc = await runFamily(sku, "pfc", pfcCases);

  const fp = (fam, rg, csp) => `# fingerprint: ${fingerprint(sku)} | cs=${Math.round(csp * 1e12)}p | RgOn=${fam === "llc" ? D.llcRgOn : D.pfcRgOn} RgOff=${rg} | Lloop=${(fam === "llc" ? DPT.lloopLlc : DPT.lloopPfc) * 1e9}nH | Voff=${DPT.voff}V | model=${fam === "llc" ? `sic-1200-c3m.lib#${libHash}` : "sic-behavioral.lib:SIC750_10R"}${fam === "pfc" ? ` | mirror=${MIRROR_CLAMP[sku] ? 1 : 0}` : ""}\n`;
  const crit = (fam) => `# PASS = Vds_pk <= ${Math.round(DPT.vdsPctRepetitive * 100)} % of ${fam === "llc" ? DPT.vLlc : DPT.vPfc} V on REPETITIVE corners (E81: 85 % at the 5 nH design loop), <= ${Math.round(DPT.vdsPctExcursion * 100)} % on the +6 %-bus row\n#   (880 V is above the 860 V F.03 trip, so the bridge sees it only for the F.03 kill time), AND vgs in [${DPT.vgsMin},${DPT.vgsMax}] V` +
    (fam === "llc" ? ` AND vgs_fw_pk <= ${DPT.vgsFwMax} V (hot MIN Vgs(th) of the 1200 V class; the pre-E81 2.5 V line was the TYPICAL 25 C threshold)\n` : ` (the PFC freewheel is a JBS diode — no gate to hold off)\n`);
  const head = (fam, rg, csp) =>
    `# dpt-${fam} ${sku} — ngspice-46, decks in spice/generated/dpt-${fam}-${sku}-*.cir.\n` +
    `# kind=final is the RECOMMENDED network (LLC: Rg_off 0 + cs; PFC: exactly what cells.tsx draws); kind=sweep/sensitivity/\n` +
    `# control/drawn are informative and NOT gated. ONE die at the PER-POSITION current (see dpt-run.mjs current convention).\n` +
    `# Eoff_chan = CHANNEL dissipation: drain-node integral minus the device's datasheet Eoss at the settled voltage;\n` +
    `# the cs snubber sits at the package pins and bypasses the sense, and its charge is recovered at the ZVS turn-on.\n` +
    `# Eon_hard = the energy paid per transition IF ZVS does not complete. t_dead_req = n_die,leg*(Qoss(V)+cs*V)/I_toff.\n` +
    fp(fam, rg, csp) + crit(fam);
  writeFileSync(join(RES, "dpt-llc-metrics.csv"), head("llc", DPT.rgOffLlcDecided, best.CS) + llc.rows.map((r) => r.join(",")).join("\n") + "\n");
  writeFileSync(join(RES, "dpt-pfc-metrics.csv"), head("pfc", D.pfcRgOff, 0) + pfc.rows.map((r) => r.join(",")).join("\n") + "\n");

  if (sku === "30kw") for (const { r, name } of [llc.plotted, pfc.plotted].filter(Boolean)) {
    const sel = r.t.map((tt, i) => ({ t: tt, i })).filter((p) => p.t >= 0.25e-6 && p.t <= 2.5e-6);
    plotSVG({ title: `${name} — Vds / Id / Vgs (ngspice, E81 deck)`, xlabel: "t (s)", ylabel: "Vds (V)", y2label: "Id (A) / Vgs (V)",
      path: join(RES, "plots", `${name}.svg`),
      series: [{ label: "Vds", x: sel.map((p) => p.t), y: sel.map((p) => r.cols.vds[p.i]) },
        { label: "Id", x: sel.map((p) => p.t), y: sel.map((p) => r.cols.id[p.i]), axis: 1, color: "#3A6B8C" },
        { label: "Vgs", x: sel.map((p) => p.t), y: sel.map((p) => r.cols.vgs[p.i]), axis: 1, color: "#A83232" }] });
  }
  console.log(`  → simulation-results/${sku}/dpt-llc-metrics.csv · dpt-pfc-metrics.csv`);
}

console.log("\n=== RECOMMENDATION for tanks.mjs (cs, koff) — lead updates tanks.mjs from this table ===");
console.log("sku     cs_pF  Rg_off  koff_nJ_VA  t_dead@PS150_ns  worst_Vds_pct  worst_vgs_fw_V  tanks_now");
for (const sku of SKUS) {
  const b = REC[sku], t = TANKS[sku];
  const drift = (t.koff ?? 0) * 1e9 < b.koff ? "  *** tanks koff is OPTIMISTIC ***" : "";
  console.log(`${sku.padEnd(7)} ${String(b.csp).padStart(5)}      0  ${String(f(b.koff, 2)).padStart(10)}  ${String(f(b.td, 0)).padStart(15)}  ${String(f(b.vpk, 1)).padStart(13)}  ${String(f(b.vfw, 2)).padStart(14)}  cs ${Math.round((t.cs ?? 0) * 1e12)}p / koff ${f((t.koff ?? 0) * 1e9, 2)}${drift}`);
}
console.log("\nDPT suite complete — calculations/stress-audit.mjs [DPT] gates these files.");
}
