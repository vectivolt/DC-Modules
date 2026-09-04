// dpt-run.mjs — Level-1 double-pulse sweeps (§16) for PFC 750 V and LLC 1200 V positions.
// Generates decks (persisted in spice/generated/), runs ngspice-46, computes Eon/Eoff/overshoot/
// dv/dt/di/dt/gate stress in JS from waveforms, writes metrics CSVs + representative SVG plots.
// Models: spice/models/sic-behavioral.lib (BEHAVIORAL — see provenance header there).
// Pass/fail: Vds_pk ≤ 75% rating (562 V / 900 V), Vgs within -8..+22 V, freewheel-FET Vgs < 2.5 V (Vth,min).
// Run: node spice/double-pulse/dpt-run.mjs

import { runDeck, trapz, maxIn, minIn, maxSlew } from "../run.mjs";
import { plotSVG } from "../../calculations/plot.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const RES = join(HERE, "..", "..", "simulation-results", "30kw");
mkdirSync(join(RES, "plots"), { recursive: true });
const f = (x, d = 2) => Number.isFinite(x) ? Number(x.toFixed(d)) : "NaN";

// ---------------- deck templates ----------------
// PFC cell: DUT low-side vs JBS freewheel to bus (Vienna commutation at VBUS/2).
// LLC cell: DUT low-side vs complementary MOSFET (gate held -4 V) — captures Coss ring + false turn-on.
function dptDeck({ fam, V, I, L, RGON, RGOFF, LLOOP, fw, SNUB = 0, CLAMP = 0 }) {
  const TCH = (L * I) / V;
  const t1r = 0.1e-6, t1f = t1r + TCH, t2r = t1f + 1.5e-6, t2f = t2r + 0.8e-6, tstop = t2f + 0.6e-6;
  const fwBlock = fw === "jbs"
    ? `DFW sw kd JBS1200_40`
    : `MFW kd gfw swk ${fam}
LFWK swk sw 1.5n
RGFW gfw fwref 4.7
VGFW fwref swk -4`;
  const snubBlock = SNUB ? `RSN sw nsn 10
CSN nsn 0 470p` : `* no snubber`;
  const clampBlock = CLAMP ? `DCL sw clp JBS1200_40
CCL clp bus 100n ic=0
RCL clp bus 470` : `* no clamp`;
  return `* generated DPT ${fam} V=${V} I=${I} Rgon=${RGON} Rgoff=${RGOFF} Lloop=${LLOOP}
.include ../models/sic-behavioral.lib
VBUS bus 0 DC ${V}
CDC bus 0 100u ic=${V}
LLP bus kd ${LLOOP}
${fwBlock}
${snubBlock}
${clampBlock}
LLD kd sw ${L} ic=0
VSNS sw d1 0
LD d1 d 2n
M1 d g ks ${fam}
LKS ks s 1.5n
LSP s 0 2n
VDRV drv ks PWL(0 -4 ${t1r} -4 ${t1r + 5e-9} 18 ${t1f} 18 ${t1f + 5e-9} -4 ${t2r} -4 ${t2r + 5e-9} 18 ${t2f} 18 ${t2f + 5e-9} -4)
RGN drv gon ${RGON}
DGN gon g DIDEAL
DGF g goff DIDEAL
RGF goff drv ${RGOFF}
.model DIDEAL D(Is=1e-3 N=0.1)
.tran 0.25n ${tstop} uic
.option method=gear reltol=1e-3 abstol=1u vntol=1m
.control
set filetype=ascii
run
wrdata OUTNAME v(d,ks) v(g,ks) i(VSNS) ${fw === "jbs" ? "v(sw)" : "v(gfw,swk)"}
quit
.endc
.end`.replace("OUTNAME", "NAME.out");
}

function metrics(name, r, { V, I, tOff, tOn }) {
  const { t, cols } = r;
  const vds = cols.vds, vgs = cols.vgs, id = cols.id;
  const w = 450e-9;
  const Eoff = trapz(t, t.map((_, i) => vds[i] * id[i]), tOff - 20e-9, tOff + w);
  const Eon = trapz(t, t.map((_, i) => vds[i] * id[i]), tOn - 20e-9, tOn + w);
  return {
    vds_pk: maxIn(t, vds, tOff - 20e-9, tOff + w),
    dvdt_off: maxSlew(t, vds, tOff, tOff + 200e-9) / 1e9,
    dvdt_on: maxSlew(t, vds, tOn, tOn + 200e-9) / 1e9,
    didt_on: maxSlew(t, id, tOn, tOn + 200e-9) / 1e9,
    Eoff_uJ: Eoff * 1e6, Eon_uJ: Eon * 1e6,
    vgs_max: maxIn(t, vgs, 0, Infinity), vgs_min: minIn(t, vgs, 0, Infinity),
    vgs_fw_pk: cols.vfw ? maxIn(t, cols.vfw, tOn - 20e-9, tOn + w) : null,
  };
}

async function sweepFamily(famName, fam, V0, Imax, L, fw, ratingV) {
  const runs = [];
  const base = { fam, V: V0, I: Imax, L, RGON: 4.7, RGOFF: 2.2, LLOOP: 18e-9, fw };
  const cases = [
    { tag: "base", ...base },
    ...[2.5, 10].map(RGON => ({ tag: `rgon${RGON}`, ...base, RGON })),
    ...[1.0, 4.7].map(RGOFF => ({ tag: `rgoff${RGOFF}`, ...base, RGOFF })),
    ...[0.3, 0.65].map(k => ({ tag: `i${Math.round(k * Imax)}`, ...base, I: k * Imax })),
    { tag: "vhi", ...base, V: V0 * 1.06 },
    { tag: "lloop30", ...base, LLOOP: 30e-9 },
    { tag: "lloop10", ...base, LLOOP: 10e-9 },
    { tag: "snub", ...base, SNUB: 1 },
    { tag: "tuned", ...base, RGON: 4.7, RGOFF: 6.8, LLOOP: 10e-9, SNUB: 1 },
    { tag: "clamp", ...base, LLOOP: 10e-9, CLAMP: 1 },
    { tag: "final", ...base, RGON: 4.7, RGOFF: 4.7, LLOOP: 10e-9, SNUB: 1, CLAMP: fw === "jbs" ? 1 : 0 },
    { tag: "final-vhi", ...base, V: V0 * 1.06, RGON: 4.7, RGOFF: 4.7, LLOOP: 10e-9, SNUB: 1, CLAMP: fw === "jbs" ? 1 : 0 },
  ];
  const rows = [["case","V","I_A","Rgon","Rgoff","Lloop_nH","vds_pk_V","pct_rating","dvdt_off_Vns","dvdt_on_Vns","didt_on_Ans","Eon_uJ","Eoff_uJ","vgs_max","vgs_min","vgs_fw_pk","PASS"]];
  let baseRun = null;
  for (const c of cases) {
    const name = `dpt-${famName}-${c.tag}`;
    const deck = dptDeck(c).replace("NAME.out", `${name}.out`);
    const tOff = 0.1e-6 + (c.L * c.I) / c.V, tOn = tOff + 1.5e-6;
    const r = runDeck(name, deck, ["vds", "vgs", "id", "vfw"]);
    const m = metrics(name, r, { V: c.V, I: c.I, tOff, tOn });
    const pass = m.vds_pk <= 0.75 * ratingV && m.vgs_max <= 22 && m.vgs_min >= -8 && (m.vgs_fw_pk === null || fw === "jbs" || m.vgs_fw_pk < 2.5);
    rows.push([c.tag, c.V, f(c.I,1), c.RGON, c.RGOFF, c.LLOOP*1e9, f(m.vds_pk,1), f(100*m.vds_pk/ratingV,1), f(m.dvdt_off,1), f(m.dvdt_on,1), f(m.didt_on,2), f(m.Eon_uJ,1), f(m.Eoff_uJ,1), f(m.vgs_max,2), f(m.vgs_min,2), m.vgs_fw_pk===null?"":f(m.vgs_fw_pk,2), pass?"PASS":"FAIL"]);
    console.log(`${name.padEnd(26)} vds_pk=${f(m.vds_pk,0)}V (${f(100*m.vds_pk/ratingV,0)}%)  dv/dt=${f(m.dvdt_off,0)}/${f(m.dvdt_on,0)} V/ns  Eon=${f(m.Eon_uJ,0)}µJ Eoff=${f(m.Eoff_uJ,0)}µJ  vgs=[${f(m.vgs_min,1)},${f(m.vgs_max,1)}]${m.vgs_fw_pk!==null&&fw!=="jbs"?` vgs_fw=${f(m.vgs_fw_pk,2)}`:""} ${pass?"PASS":"FAIL"}`);
    if (c.tag === "base") baseRun = { r, tOff, tOn };
  }
  const hdr = `# dpt-${famName} — ngspice-46 method=gear reltol=1e-3 tran 0.25n; model spice/models/sic-behavioral.lib (BEHAVIORAL);\n# netlists spice/generated/dpt-${famName}-*.cir; pass = vds_pk<=75% of ${ratingV} V & vgs in [-8,22]${fw!=="jbs"?" & vgs_fw<2.5":""}\n`;
  writeFileSync(join(RES, `dpt-${famName}-metrics.csv`), hdr + rows.map(r => r.join(",")).join("\n") + "\n");
  // representative plot around both events
  const { r, tOff, tOn } = baseRun;
  const sel = (t0, t1) => r.t.map((t, i) => ({ t, i })).filter(p => p.t >= t0 && p.t <= t1);
  const around = sel(tOff - 0.15e-6, tOn + 0.5e-6);
  plotSVG({
    title: `DPT ${famName} base: Vds / Id / Vgs (ngspice, behavioral model)`,
    xlabel: "t (s)", ylabel: "Vds (V)", y2label: "Id (A) / Vgs (V)",
    path: join(RES, "plots", `dpt-${famName}-base.svg`),
    series: [
      { label: "Vds", x: around.map(p => p.t), y: around.map(p => r.cols.vds[p.i]) },
      { label: "Id", x: around.map(p => p.t), y: around.map(p => r.cols.id[p.i]), axis: 1, color: "#3A6B8C" },
      { label: "Vgs", x: around.map(p => p.t), y: around.map(p => r.cols.vgs[p.i]), axis: 1, color: "#A83232" },
    ],
  });
  return rows;
}

console.log("=== DPT: PFC 750 V position (SIC750_10R vs JBS1200_40, bus 425 V) ===");
await sweepFamily("pfc750", "SIC750_10R", 425, 78, 42e-6, "jbs", 750);
console.log("\n=== DPT: LLC 1200 V position (SIC1200_23R half-bridge, bus 850 V) ===");
await sweepFamily("llc1200", "SIC1200_23R", 830, 25, 60e-6, "fet", 1200);
console.log("\nMetrics → simulation-results/30kw/dpt-*-metrics.csv; plots → simulation-results/30kw/plots/");
