// conductor-audit.mjs — E60 standing gate: AC copper physics of every power winding, at the SIMULATED
// currents and frequencies (llc-stress / vienna-switched), against each drawing's own acceptance rows.
// Models: IEC 60028 annealed Cu (ρ20 1.7241e-8 Ω·m, α 0.00393/K) · skin depth δ = √(ρ/(π f µ0)) ·
// Dowell (1966) for foil and round-wire layers (porosity-corrected Δ) · Sullivan (TPEL 1999) litz
// proximity factor (shared: winding-physics.mjs). Geometry: geometry.mjs (catalog former lN, per-winding radial build)
// — E65: constructions come from the magnetics-envelope tables, so a drawing change moves both gates together.
// Why it exists: the E51 construction rev moved the D3 secondaries to 0.20/0.25/0.30 mm copper foil,
// 5–7 layers each, at 140–190 kHz — h/δ ≈ 1.0–1.5, where Dowell puts Rac/Rdc at 5–12 while the pack
// row says ≤1.35 and the loss budget carried 1.15. Nothing computed it until this gate.
// Run: node calculations/magnetics/conductor-audit.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const f = (x, d = 2) => Number(x.toFixed(d));
let fails = 0;
const ck = (sec, name, cond, detail) => { console.log(`${cond ? "  ok  " : "  FAIL"}  [${sec}] ${name} — ${detail}`); if (!cond) fails++; };
import { rho, delta, dowell, litzFr } from "./winding-physics.mjs";
import { D1 as D1C, d1Loss } from "./d1-choke.mjs";
import { D2 as D2C, D3 as D3C, d3Build, d2Mlt } from "./magnetics-envelope.mjs";
import { captureEvidence } from "../evidence.mjs";
captureEvidence("conductor-audit");
const T = 100;                                                      // winding hot-spot class basis, °C

// simulated currents
const llc = (sku) => {
  const L = readFileSync(join(ROOT, `simulation-results/${sku}/llc-stress.csv`), "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
  const h = L[0].split(","); return L.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [h[i], v])));
};
const vs = readFileSync(join(ROOT, "calculations/out/vienna-switched.csv"), "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
const vh = vs[0].split(","), VS = vs.slice(1).map((l) => { const c = l.match(/("[^"]*"|[^,]+)/g); return Object.fromEntries(c.map((v, i) => [vh[i], v])); });
console.log("=== CONDUCTOR AUDIT (E60 gate · E67 full-bridge constructions) — Dowell/Sullivan AC copper at the simulated currents ===");
console.log(`  info  Cu IEC 60028: ρ(100 °C) = ${f(rho(100) * 1e8, 3)}e-8 Ω·m · δ(50 kHz) ${f(delta(50e3, T) * 1e3, 3)} mm · δ(140 kHz) ${f(delta(140e3, T) * 1e3, 3)} mm · δ(190 kHz) ${f(delta(190e3, T) * 1e3, 3)} mm`);

// ---------------- D1: taped round-wire bundles at 50 Hz + 50 kHz ripple ----------------
// E65 (d1-choke): the E60 row counted two layers of strands (Dowell m = 2, Fr 11.4) and 0.170/0.190 m turns. The bundles put 8–10
// strand rows in the bore field: copper is now Ferreira on every strand at its own radius × the 2-D shielding factor solved by
// d1-fd (twisted/transposed bundle = design basis), on the datasheet MLT; temperature is proven in stress-audit.
// Production rows at 25 °C (D1-F4): an absolute row ≤15 % above the build that still passes a good part at the lot-trim N+1 with
// +3 % turn length and a −2.25 % wire area (IEC 60317 1.6 mm ±0.018 mm), and catches two open strands; a ±5 % per-lot window
// around the median of the lot's first five parts (4-wire, corrected to 25 °C) catches ONE open strand (+12.5 % of 9, +8.3 % of 13).
export const D1ROWS = { "30kw": { rdc25: 6.9e-3 }, "40kw": { rdc25: 4.55e-3 }, "50kw": { rdc25: 4.15e-3 } };
export const D1_LOT_WINDOW = 0.05;
for (const [sku, row] of Object.entries(D1ROWS)) {
  const c = D1C[sku], r = VS.find((x) => x.sku === sku && x.case === "330-full-bus830-lot92"), L = d1Loss(c, r, T);
  ck("D1", `${sku} bundle ${c.nw}× ${c.d * 1e3} mm, ${c.N} T on ${c.stack}×T79`, L.fd.ok && L.fd.k2D >= 0.5 && L.fd.k2D <= 1,
    `MLT ${f(L.g.mlt * 1e3, 0)} mm (Magnetics table, K ${f(L.g.K * 100, 0)} %) · 50 Hz ${f(L.I1, 1)} A → ${f(L.lf, 1)} W · 50 kHz ripple ${f(L.Ihf, 2)} A rms at Fr ${f(L.Fr, 1)} (Ferreira ${f(L.FrFerreira, 1)} × 2-D ${f(L.fd.k2D, 3)}; a flat untwisted bundle computes ${f(L.hfUntwisted, 1)} W) → ${f(L.hf, 1)} W · Cu ${f(L.lf + L.hf, 1)} W hot — the E60 m = 2 model read ${f(L.Ihf * L.Ihf * L.Rdc * dowell(Math.pow(Math.PI / 4, 0.75) * (c.d / delta(50e3, T)) * Math.sqrt(0.85), 2), 1)} W ripple copper [${L.fd.src}]`);
  const good = (L.Rdc25 * (c.N + 1) / c.N) * 1.03 / (1 - 0.0225), twoOpen = (L.Rdc25 * c.nw) / (c.nw - 2), oneOpen = c.nw / (c.nw - 1) - 1;
  ck("D1", `${sku} production Rdc row @25 °C catches open strands`, row.rdc25 <= 1.15 * L.Rdc25 && row.rdc25 >= good && twoOpen > row.rdc25 && oneOpen > D1_LOT_WINDOW + 0.03,
    `build ${f(L.Rdc25 * 1e3)} mΩ · row ≤${f(row.rdc25 * 1e3)} mΩ (${f(100 * (row.rdc25 / L.Rdc25 - 1), 0)} % above; worst good part ${f(good * 1e3)}; 2 strands open ${f(twoOpen * 1e3)}) · lot window ±${D1_LOT_WINDOW * 100} % vs one open strand +${f(100 * oneOpen, 1)} % — the E60 lines ≤11 / 7.0 / 6.5 mΩ passed a third of the strands open`);
}

// ---------------- D2: the external resonant inductor at the tank current (E67 rev F) ----------------
// Construction from magnetics-envelope D2: 2×E70, N 5, compacted 0.05 mm litz single layer ≥3 mm clear of a distributed gap. Proximity
// ∝ N²n²d⁶/b²; Rac is minimal near Sullivan Fr ≈ 2 at the worst corner. Thermal: magnetics-envelope.
// Production rows: Rdc @25 °C (catches a wrong strand count) and Rac @100 °C at the worst simulated RMS corner.
export const D2ROWS = { "30kw": { rdc25: 1.35e-3, rac: 3.35e-3 }, "40kw": { rdc25: 1.1e-3, rac: 3.45e-3 }, "50kw": { rdc25: 0.92e-3, rac: 3.7e-3 } };
for (const [sku, row] of Object.entries(D2ROWS)) {
  const c = D2C[sku], rows = llc(sku), worst = rows.reduce((a, r) => (+r.Ip_rms_A > +a.Ip_rms_A ? r : a));
  const fq = +worst.fsw_kHz * 1e3, I = +worst.Ip_rms_A, A = (c.strands * Math.PI * c.dS ** 2) / 4, mlt = d2Mlt(c);
  const Rdc = (rho(T) * c.N * mlt) / A, Rdc25 = (rho(25) * c.N * mlt) / A, Fr = litzFr({ fq, T, N: c.N, n: c.strands, d: c.dS, b: c.b, k: 1 });
  ck("D2", `${sku} ${c.n}×${c.core} N ${c.N}, litz ${c.strands}×${f(c.dS * 1e3, 3)} @${f(fq / 1e3, 0)} kHz`, Rdc25 <= row.rdc25 && Rdc25 >= 0.85 * row.rdc25 && Rdc * Fr <= row.rac,
    `MLT ${f(mlt * 1e3, 0)} mm · Rdc ${f(Rdc25 * 1e3)} mΩ @25 °C (row ≤${f(row.rdc25 * 1e3)}) · Sullivan Fr ${f(Fr)} → Rac ${f(Rdc * Fr * 1e3)} mΩ hot (row ≤${f(row.rac * 1e3)}) → Cu ${f(I * I * Rdc * Fr, 1)} W at ${f(I, 1)} A rms (${worst.corner}) — thermal proof: magnetics-envelope`);
}

// ---------------- D3 cells: profiled-litz primary + copper-foil secondary halves (E67 rev D) ----------------
const FOILS = [0.05, 0.08, 0.10, 0.127, 0.15, 0.20, 0.25, 0.30].map((x) => x * 1e-3);
// Two identical cells, primaries in series; each cell's secondary is S1 ∥ S2 around the primary, so each half carries HALF the bank
// current in nf foils per turn (Dowell m = N·nf). Primaries in TIW-served litz. Per-winding mean turns from the radial build.
// Production rows at 25 °C per cell: Rdc P / S1 half / S2 half (S2 is the longest turn) and Rac/Rdc ≤ 1.35 at the worst corner.
export const D3ROWS = { "30kw": { p: 2.1e-3, s1: 8.0e-3, s2: 9.8e-3 }, "40kw": { p: 1.55e-3, s1: 4.5e-3, s2: 5.1e-3 }, "50kw": { p: 1.55e-3, s1: 4.5e-3, s2: 5.1e-3 } };
export const RECOMMEND = {};
for (const [sku, row] of Object.entries(D3ROWS)) {
  const w = D3C[sku], g = d3Build(w), rows = llc(sku), worst = rows.reduce((a, r) => (+r.Isec_rms_A > +a.Isec_rms_A ? r : a));
  const fq = +worst.fsw_kHz * 1e3, Ip = +worst.Ip_rms_A, Is = +worst.Isec_rms_A, Ih = Is / 2, dl = delta(fq, T), eta = w.foilW / w.b;
  const secP = (h) => { const R1 = rho(T) * w.N * g.mltS1 / (w.nf * h * w.foilW), R2 = rho(T) * w.N * g.mltS2 / (w.nf * h * w.foilW); const Fr = dowell((h / dl) * Math.sqrt(eta), w.N * w.nf); return { Fr, P: Ih * Ih * (R1 + R2) * Fr }; };
  const built = secP(w.foil);
  const priR = rho(T) * w.N * g.mltP / w.cuP;
  const priFr = litzFr({ fq, T, N: w.N, n: w.strands, d: w.dS, b: w.b, k: 0.25 });
  const best = FOILS.map((h) => ({ h, ...secP(h) })).reduce((a, x) => (x.P < a.P ? x : a));
  const r25 = { p: rho(25) * w.N * g.mltP / w.cuP, s1: rho(25) * w.N * g.mltS1 / (w.nf * w.foil * w.foilW), s2: rho(25) * w.N * g.mltS2 / (w.nf * w.foil * w.foilW) };
  RECOMMEND[sku] = { foil: w.foil, nf: w.nf, Fr: built.Fr, Psec: built.P, priFr, Ppri: Ip * Ip * priR * priFr, worst: worst.corner, fq, nP: w.strands, optimum: best.h };
  ck("D3", `${sku} cell foil halves ${w.nf}× ${w.foil * 1e3} mm × ${w.foilW * 1e3} mm, ${w.N} turns @${f(fq / 1e3, 0)} kHz`, built.Fr <= 1.35 && built.P <= 1.1 * best.P,
    `h/δ ${f(w.foil / dl)} (η ${f(eta)}) → Dowell Fr ${f(built.Fr)} (m ${w.N * w.nf}) ≤ 1.35 → both halves ${f(built.P, 1)} W at ${f(Ih, 1)} A rms each (${worst.corner}; optimum ${f(best.h * 1e3, 3)} mm = ${f(best.P, 1)} W)`);
  ck("D3", `${sku} cell profiled-litz primary ${w.strands}×${f(w.dS * 1e3, 3)} mm`, priFr <= 1.35,
    `Sullivan (interleaved k 0.25) Fr ${f(priFr)} → ${f(Ip * Ip * priR * priFr, 1)} W at ${f(Ip, 1)} A rms`);
  ck("D3", `${sku} production Rdc rows @25 °C match the ${w.n}×${w.core} cell build`, r25.p <= row.p && r25.s1 <= row.s1 && r25.s2 <= row.s2 && r25.p >= 0.85 * row.p && r25.s2 >= 0.85 * row.s2,
    `MLT S1/P/S2 ${f(g.mltS1 * 1e3, 0)}/${f(g.mltP * 1e3, 0)}/${f(g.mltS2 * 1e3, 0)} mm → P ${f(r25.p * 1e3)} (≤${f(row.p * 1e3)}) · S1 ${f(r25.s1 * 1e3)} (≤${f(row.s1 * 1e3)}) · S2 ${f(r25.s2 * 1e3)} (≤${f(row.s2 * 1e3)}) mΩ — rows ≤15 % above the build so a short strand count or thin foil is caught`);
}
// D4 aux flyback primary (65 kHz DCM): informational. E65 rev E = P/2–S–P/2 sandwich on ETD44 — each 19 T half is ONE layer
// (0.5 mm grade-2 or 2×0.35 mm bifilar both fit the 23.5 mm margin-to-margin breadth), so Dowell m = 1 per half
{
  const Fr05 = dowell(Math.pow(Math.PI / 4, 0.75) * (0.5e-3 / delta(65e3, T)) * Math.sqrt(0.8), 1);
  const Fr035 = dowell(Math.pow(Math.PI / 4, 0.75) * (0.35e-3 / delta(65e3, T)) * Math.sqrt(0.8), 1);
  console.log(`  info  [D4] primary @65 kHz (rev E sandwich, one layer per half): 0.5 mm single Fr ${f(Fr05)} vs 2×0.35 mm bifilar Fr ${f(Fr035)} — both inside the ~1 W copper budget at ~1 A rms (the E52 two-layer build read Fr ${f(dowell(Math.pow(Math.PI / 4, 0.75) * (0.5e-3 / delta(65e3, T)) * Math.sqrt(0.8), 2))})`);
}
console.log("  info  [GAP] Dowell/Sullivan are 1-D and under-read loss where a gap's fringing field crosses a conductor — D2: distributed gap ≤1.0 mm per segment + ≥3 mm litz clearance (E65), measured Rac includes it · D3: Lm gap split equally per set (≤0.5 mm/position) because S1 foil is innermost; T-31 open-secondary check + S1 thermocouple, FEMMT run closes the number");
console.log(fails ? `\n${fails} CONDUCTOR FAILURE(S)` : "\nCONDUCTOR AUDIT CLEAN — every winding's AC resistance inside its own acceptance row at the simulated corner");
if (fileURLToPath(import.meta.url) === process.argv[1]) process.exit(fails ? 1 : 0);
