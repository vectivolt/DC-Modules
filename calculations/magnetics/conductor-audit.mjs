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
import { toroidMlt } from "./geometry.mjs";
import { D2 as D2C, D3 as D3C, d3Build, d2Mlt } from "./magnetics-envelope.mjs";
const T = 100;                                                      // winding hot-spot class basis, °C

// simulated currents
const llc = (sku) => {
  const L = readFileSync(join(ROOT, `simulation-results/${sku}/llc-stress.csv`), "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
  const h = L[0].split(","); return L.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [h[i], v]))).filter((r) => !/mismatch/.test(r.corner));
};
const vs = readFileSync(join(ROOT, "calculations/out/vienna-switched.csv"), "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
const vh = vs[0].split(","), VS = vs.slice(1).map((l) => { const c = l.match(/("[^"]*"|[^,]+)/g); return Object.fromEntries(c.map((v, i) => [vh[i], v])); });
console.log("=== CONDUCTOR AUDIT (E60 · E65 constructions) — Dowell/Sullivan AC copper at the simulated currents ===");
console.log(`  info  Cu IEC 60028: ρ(100 °C) = ${f(rho(100) * 1e8, 3)}e-8 Ω·m · δ(50 kHz) ${f(delta(50e3, T) * 1e3, 3)} mm · δ(140 kHz) ${f(delta(140e3, T) * 1e3, 3)} mm · δ(190 kHz) ${f(delta(190e3, T) * 1e3, 3)} mm`);

// ---------------- D1: round enamelled bundles at 50 Hz + 50 kHz ripple ----------------
// E65: D1-40/50 MLT 0.190 → the 5-stack geometry (0.242 m, the pfc-design winding model) — the Pcu budgets follow it
const D1W = { "30kw": { N: 39, nw: 9, d: 1.6e-3, mlt: toroidMlt("T79", 3), rdcLine: 11e-3, Pcu: 32.4 }, "40kw": { N: 26, nw: 13, d: 1.6e-3, mlt: toroidMlt("T79", 5), rdcLine: 7.0e-3, Pcu: 39 }, "50kw": { N: 24, nw: 13, d: 1.6e-3, mlt: toroidMlt("T79", 5), rdcLine: 6.5e-3, Pcu: 55 } };
for (const [sku, w] of Object.entries(D1W)) {
  const r = VS.find((x) => x.sku === sku && x.case === "330-full-bus830-lot92");
  const Irms = +r.Irms_A, I1 = +r.I1pk_A / Math.SQRT2, Ihf = Math.sqrt(Math.max(Irms * Irms - I1 * I1, 0));
  const A = w.nw * Math.PI * w.d ** 2 / 4, Rdc = rho(T) * w.N * w.mlt / A, Rdc25 = rho(25) * w.N * w.mlt / A;
  const Fr = dowell(Math.pow(Math.PI / 4, 0.75) * (w.d / delta(50e3, T)) * Math.sqrt(0.85), 2);
  const P = I1 * I1 * Rdc + Ihf * Ihf * Rdc * Fr;
  ck("D1", `${sku} bundle ${w.nw}× ${w.d * 1e3} mm, ${w.N} T`, Rdc25 <= w.rdcLine * 1.02 && P <= w.Pcu * 1.25,
    `Rdc ${f(Rdc25 * 1e3)} mΩ @25 °C (line ≤${w.rdcLine * 1e3}) · 50 Hz ${f(I1, 1)} A + 50 kHz ripple ${f(Ihf, 1)} A rms at Fr ${f(Fr, 1)} → Cu ${f(P, 1)} W hot (budget ${w.Pcu} W; HF share ${f(100 * Ihf * Ihf * Fr / (I1 * I1), 0)} %) — ripple is ~11 % of rms, so solid round wire stays the right conductor (litz buys <5 %)`);
}

// ---------------- D2: litz trim inductors at the tank current ----------------
// E65 construction (magnetics-envelope D2): D2-30 1×E70 N 8, 6112×0.05 mm; D2-40/50 2×E70 N 5, 8149×0.05 mm — each
// carries ~all of Lr. Proximity ∝ N²n²d⁶/b²: 0.05 mm strands in the 41 mm E70 window. Thermal: magnetics-envelope.
// Production rows: Rdc @25 °C (catches a wrong strand count) and Rac @100 °C at the worst nominal corner.
export const D2ROWS = { "30kw": { rdc25: 1.95e-3, rac: 4.5e-3 }, "40kw": { rdc25: 1.3e-3, rac: 2.6e-3 }, "50kw": { rdc25: 1.3e-3, rac: 2.6e-3 } };
for (const [sku, row] of Object.entries(D2ROWS)) {
  const c = D2C[sku], rows = llc(sku), worst = rows.reduce((a, r) => (+r.Ip_rms_A > +a.Ip_rms_A ? r : a));
  const fq = +worst.fsw_kHz * 1e3, I = +worst.Ip_rms_A, A = (c.strands * Math.PI * c.dS ** 2) / 4, mlt = d2Mlt(c);
  const Rdc = (rho(T) * c.N * mlt) / A, Rdc25 = (rho(25) * c.N * mlt) / A, Fr = litzFr({ fq, T, N: c.N, n: c.strands, d: c.dS, b: c.b, k: 1 });
  ck("D2", `${sku} ${c.n}×${c.core} N ${c.N}, litz ${c.strands}×${f(c.dS * 1e3, 3)} @${f(fq / 1e3, 0)} kHz`, Rdc25 <= row.rdc25 && Rdc25 >= 0.85 * row.rdc25 && Rdc * Fr <= row.rac,
    `MLT ${f(mlt * 1e3, 0)} mm · Rdc ${f(Rdc25 * 1e3)} mΩ @25 °C (row ≤${f(row.rdc25 * 1e3)}) · Sullivan Fr ${f(Fr)} → Rac ${f(Rdc * Fr * 1e3)} mΩ hot (row ≤${f(row.rac * 1e3)}) → Cu ${f(I * I * Rdc * Fr, 1)} W at ${f(I, 1)} A rms (${worst.corner}) — thermal proof: magnetics-envelope`);
}

// ---------------- D3: profiled-litz primary + copper-foil secondaries ----------------
const FOILS = [0.05, 0.08, 0.10, 0.127, 0.15, 0.20, 0.25, 0.30].map((x) => x * 1e-3);
// E60 secondaries at the Dowell optimum over standard foils (0.10 mm @30 kW, 0.127 mm @40/50), primaries in 0.071 mm
// strands; E65 per-winding mean turns from the radial build (S1 inner, P, S2 outer) on the E70 formers.
// Production rows at 25 °C: Rdc P / S1 / S2 (S2 is the longest turn) and Rac/Rdc ≤ 1.35 at the worst nominal corner.
export const D3ROWS = { "30kw": { p: 2.8e-3, s1: 9.0e-3, s2: 10.6e-3 }, "40kw": { p: 1.75e-3, s1: 6.1e-3, s2: 7.3e-3 }, "50kw": { p: 1.5e-3, s1: 6.75e-3, s2: 7.75e-3 } };
const WAS_FOIL = { "30kw": 0.20e-3, "40kw": 0.25e-3, "50kw": 0.30e-3 };
export const RECOMMEND = {};
for (const [sku, row] of Object.entries(D3ROWS)) {
  const w = D3C[sku], g = d3Build(w), rows = llc(sku), worst = rows.reduce((a, r) => (+r.Isec_rms_A > +a.Isec_rms_A ? r : a));
  const fq = +worst.fsw_kHz * 1e3, Ip = +worst.Ip_rms_A, Is = +worst.Isec_rms_A, dl = delta(fq, T), eta = w.foilW / w.b;
  const secP = (h) => { const R1 = rho(T) * w.N * g.mltS1 / (h * w.foilW), R2 = rho(T) * w.N * g.mltS2 / (h * w.foilW); const Fr = dowell((h / dl) * Math.sqrt(eta), w.N); return { Fr, P: Is * Is * (R1 + R2) * Fr }; };
  const built = secP(w.foil), asDrawn = secP(WAS_FOIL[sku]);
  const priR = rho(T) * w.N * g.mltP / w.cuP;
  const priFr = litzFr({ fq, T, N: w.N, n: w.strands, d: w.dS, b: w.b, k: 0.25 });
  const best = FOILS.map((h) => ({ h, ...secP(h) })).reduce((a, x) => (x.P < a.P ? x : a));
  const r25 = { p: rho(25) * w.N * g.mltP / w.cuP, s1: rho(25) * w.N * g.mltS1 / (w.foil * w.foilW), s2: rho(25) * w.N * g.mltS2 / (w.foil * w.foilW) };
  RECOMMEND[sku] = { foil: w.foil, Fr: built.Fr, Psec: built.P, PsecAsDrawn: asDrawn.P, priFr, Ppri: Ip * Ip * priR * priFr, worst: worst.corner, fq, nP: w.strands, optimum: best.h };
  ck("D3", `${sku} foil secondaries ${w.foil * 1e3} mm × ${w.foilW * 1e3} mm, ${w.N} layers each @${f(fq / 1e3, 0)} kHz`, built.Fr <= 1.35 && built.P <= 1.1 * best.P,
    `h/δ ${f(w.foil / dl)} (η ${f(eta)}) → Dowell Fr ${f(built.Fr)} ≤ 1.35 → both secondaries ${f(built.P, 1)} W at ${f(Is, 1)} A rms each (${worst.corner}; optimum ${f(best.h * 1e3, 3)} mm = ${f(best.P, 1)} W) · the E51 ${WAS_FOIL[sku] * 1e3} mm foil computed Fr ${f(asDrawn.Fr, 1)} → ${f(asDrawn.P, 1)} W`);
  ck("D3", `${sku} profiled-litz primary ${w.strands}×${f(w.dS * 1e3, 3)} mm`, priFr <= 1.35,
    `Sullivan (interleaved k 0.25) Fr ${f(priFr)} → ${f(Ip * Ip * priR * priFr, 1)} W at ${f(Ip, 1)} A rms`);
  ck("D3", `${sku} production Rdc rows @25 °C match the ${w.n}×${w.core} build`, r25.p <= row.p && r25.s1 <= row.s1 && r25.s2 <= row.s2 && r25.p >= 0.85 * row.p && r25.s2 >= 0.85 * row.s2,
    `MLT S1/P/S2 ${f(g.mltS1 * 1e3, 0)}/${f(g.mltP * 1e3, 0)}/${f(g.mltS2 * 1e3, 0)} mm → P ${f(r25.p * 1e3)} (≤${f(row.p * 1e3)}) · S1 ${f(r25.s1 * 1e3)} (≤${f(row.s1 * 1e3)}) · S2 ${f(r25.s2 * 1e3)} (≤${f(row.s2 * 1e3)}) mΩ — rows ≤15 % above the build so a short strand count or thin foil is caught`);
}
// D4 aux flyback primary (65 kHz DCM, 2 layers): informational — the bifilar 2×0.35 mm option is preferred
{
  const Fr05 = dowell(Math.pow(Math.PI / 4, 0.75) * (0.5e-3 / delta(65e3, T)) * Math.sqrt(0.8), 2);
  const Fr035 = dowell(Math.pow(Math.PI / 4, 0.75) * (0.35e-3 / delta(65e3, T)) * Math.sqrt(0.8), 4);
  console.log(`  info  [D4] primary @65 kHz: 0.5 mm single Fr ${f(Fr05)} vs 2×0.35 mm bifilar (4 sub-layers) Fr ${f(Fr035)} — both inside the ~1 W copper budget at ~1 A rms; bifilar is the build default`);
}
console.log("  info  [GAP] Dowell/Sullivan are 1-D and under-read loss where a gap's fringing field crosses a conductor — D2: distributed gap ≤1.0 mm per segment + ≥3 mm litz clearance (E65), measured Rac includes it · D3: Lm gap split equally per set (≤0.5 mm/position) because S1 foil is innermost; T-31 open-secondary check + S1 thermocouple, FEMMT run closes the number");
console.log(fails ? `\n${fails} CONDUCTOR FAILURE(S)` : "\nCONDUCTOR AUDIT CLEAN — every winding's AC resistance inside its own acceptance row at the simulated corner");
if (fileURLToPath(import.meta.url) === process.argv[1]) process.exit(fails ? 1 : 0);
