// conductor-audit.mjs — E60 standing gate: AC copper physics of every power winding, at the SIMULATED
// currents and frequencies (llc-stress / vienna-switched), against each drawing's own acceptance rows.
// Models: IEC 60028 annealed Cu (ρ20 1.7241e-8 Ω·m, α 0.00393/K) · skin depth δ = √(ρ/(π f µ0)) ·
// Dowell (1966) for foil and round-wire layers (porosity-corrected Δ) · Sullivan (TPEL 1999) litz
// proximity factor. Geometry: TDK PQ50/50 former B65982E winding width 30.4 mm (datasheet 10/22),
// E70 2-set former ~41 mm; MLTs = the mag-sync mass-table values.
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
const MU0 = 4e-7 * Math.PI;
export const rho = (T) => 1.7241e-8 * (1 + 0.00393 * (T - 20));
export const delta = (fq, T) => Math.sqrt(rho(T) / (Math.PI * fq * MU0));
export const dowell = (D, m) => {
  const z1 = (Math.sinh(2 * D) + Math.sin(2 * D)) / (Math.cosh(2 * D) - Math.cos(2 * D));
  const z2 = (Math.sinh(D) - Math.sin(D)) / (Math.cosh(D) + Math.cos(D));
  return D * (z1 + (2 / 3) * (m * m - 1) * z2);
};
// Sullivan litz: Fr = 1 + π²ω²µ0²N²n²d⁶k / (768 ρ² b²); k = 1 for a 0→NI winding portion, 0.25 for a layer
// sandwiched between two half-current windings (MMF −NI/2 → +NI/2)
export const litzFr = ({ fq, T, N, n, d, b, k }) => 1 + (Math.PI ** 2 * (2 * Math.PI * fq) ** 2 * MU0 ** 2 * N * N * n * n * d ** 6 * k) / (768 * rho(T) ** 2 * b * b);
const T = 100;                                                      // winding hot-spot class basis, °C

// simulated currents
const llc = (sku) => {
  const L = readFileSync(join(ROOT, `simulation-results/${sku}/llc-stress.csv`), "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
  const h = L[0].split(","); return L.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [h[i], v]))).filter((r) => !/mismatch/.test(r.corner));
};
const vs = readFileSync(join(ROOT, "calculations/out/vienna-switched.csv"), "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
const vh = vs[0].split(","), VS = vs.slice(1).map((l) => { const c = l.match(/("[^"]*"|[^,]+)/g); return Object.fromEntries(c.map((v, i) => [vh[i], v])); });
console.log("=== CONDUCTOR AUDIT (E60) — Dowell/Sullivan AC copper at the simulated currents ===");
console.log(`  info  Cu IEC 60028: ρ(100 °C) = ${f(rho(100) * 1e8, 3)}e-8 Ω·m · δ(50 kHz) ${f(delta(50e3, T) * 1e3, 3)} mm · δ(140 kHz) ${f(delta(140e3, T) * 1e3, 3)} mm · δ(190 kHz) ${f(delta(190e3, T) * 1e3, 3)} mm`);

// ---------------- D1: round enamelled bundles at 50 Hz + 50 kHz ripple ----------------
const D1W = { "30kw": { N: 39, nw: 9, d: 1.6e-3, mlt: 0.170, rdcLine: 11e-3, Pcu: 32.4 }, "40kw": { N: 26, nw: 13, d: 1.6e-3, mlt: 0.190, rdcLine: 7.0e-3, Pcu: 39 }, "50kw": { N: 24, nw: 13, d: 1.6e-3, mlt: 0.190, rdcLine: 6.5e-3, Pcu: 55 } };
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
// E60 construction: D2-30 unchanged (2×PQ50/50, N 4, 1350×0.1); D2-40 → 1× E70/33/32 N 5 in 0.071 mm litz
// (0.54 kg); D2-50 → 2× E70/33/32 N 3, 2500×0.1 (no single-set option held 40 K) — the as-drawn
// 2000×0.1/N 5 and 3000×0.1/N 6 on PQ50 computed Fr 4.3/11.7
// (13.6/45 W at the SER corner): the E43/E44 "upsizing" cut DC density and multiplied proximity (∝ N²n²).
const D2W = {
  "30kw": { core: "2×PQ50/50", N: 4, n: 1350, b: 30.4e-3, mlt: 0.115, racLine: 4e-3, Asurf: 131, fe: 5.3, was: null },
  "40kw": { core: "1×E70/33/32", N: 5, n: 4150, d: 0.071e-3, b: 41e-3, mlt: 0.166, racLine: 2.6e-3, Asurf: 179, fe: 5.3, was: { core: "2×PQ50/50", N: 5, n: 2000, b: 30.4e-3, mlt: 0.115 } },
  "50kw": { core: "2×E70/33/32", N: 3, n: 2500, b: 41e-3, mlt: 0.2305, racLine: 2.0e-3, Asurf: 266, fe: 7.1, was: { core: "2×PQ50/50", N: 6, n: 3000, b: 30.4e-3, mlt: 0.115 } },
};
const rac = (w, fq) => { const d = w.d ?? 0.1e-3, A = w.n * Math.PI * d ** 2 / 4, Rdc = rho(T) * w.N * w.mlt / A, Fr = litzFr({ fq, T, N: w.N, n: w.n, d, b: w.b, k: 1 }); return { Rdc, Fr, Rac: Rdc * Fr }; };
for (const [sku, w] of Object.entries(D2W)) {
  const rows = llc(sku), worst = rows.reduce((a, r) => (+r.Ip_rms_A > +a.Ip_rms_A ? r : a));
  const fq = +worst.fsw_kHz * 1e3, I = +worst.Ip_rms_A, r = rac(w, fq);
  const P = I * I * r.Rac, dT = Math.pow(1000 * (P + w.fe) / w.Asurf, 0.833);
  const was = w.was ? rac(w.was, fq) : null;
  ck("D2", `${sku} ${w.core} N ${w.N}, litz ${w.n}×${f((w.d ?? 0.1e-3) * 1e3, 3)} @${f(fq / 1e3, 0)} kHz`, r.Rac <= w.racLine && dT <= 40,
    `Rdc ${f(r.Rdc * 1e3)} mΩ hot · Sullivan Fr ${f(r.Fr)} → Rac ${f(r.Rac * 1e3)} mΩ (row ≤${w.racLine * 1e3}) · Cu ${f(P, 1)} W + Fe ${w.fe} W (measured basis) at ${f(I, 1)} A rms (${worst.corner}) → ΔT ${f(dT, 0)} K ≤ 40${was ? ` · as drawn (${w.was.core} N ${w.was.N}, ${w.was.n}×0.1): Fr ${f(was.Fr, 1)} → ${f(I * I * was.Rac, 1)} W` : ""}`);
}

// ---------------- D3: profiled-litz primary + copper-foil secondaries ----------------
const FOILS = [0.05, 0.08, 0.10, 0.127, 0.15, 0.20, 0.25, 0.30].map((x) => x * 1e-3);
// E60 construction: secondaries at the Dowell optimum over standard foils (0.10 mm @30 kW, 0.127 mm @40/50)
// and primaries in 0.071 mm strands at the SAME copper area; `wasFoil`/0.1 mm strands = the E51 as-drawn
const D3W = {
  "30kw": { N: 7, cuP: 9.8e-6, dP: 0.071e-3, foil: 0.10e-3, wasFoil: 0.20e-3, b: 30.4e-3, mlt: 0.115, racLine: 1.35 },
  "40kw": { N: 6, cuP: 13.8e-6, dP: 0.071e-3, foil: 0.127e-3, wasFoil: 0.25e-3, b: 41e-3, mlt: 0.2305, racLine: 1.35 },
  "50kw": { N: 5, cuP: 17.3e-6, dP: 0.071e-3, foil: 0.127e-3, wasFoil: 0.30e-3, b: 41e-3, mlt: 0.2305, racLine: 1.35 },
};
export const RECOMMEND = {};
for (const [sku, w] of Object.entries(D3W)) {
  const rows = llc(sku), worst = rows.reduce((a, r) => (+r.Isec_rms_A > +a.Isec_rms_A ? r : a));
  const fq = +worst.fsw_kHz * 1e3, Ip = +worst.Ip_rms_A, Is = +worst.Isec_rms_A, dl = delta(fq, T), eta = 28e-3 / w.b;
  const secP = (h) => { const R = rho(T) * w.N * w.mlt / (h * 28e-3); const Fr = dowell((h / dl) * Math.sqrt(eta), w.N); return { R, Fr, P: 2 * Is * Is * R * Fr }; };
  const built = secP(w.foil), asDrawn = secP(w.wasFoil);
  const nP = Math.round(w.cuP / (Math.PI * w.dP ** 2 / 4)), priR = rho(T) * w.N * w.mlt / w.cuP;
  const priFr = litzFr({ fq, T, N: w.N, n: nP, d: w.dP, b: w.b, k: 0.25 });
  const priWas = litzFr({ fq, T, N: w.N, n: Math.round(w.cuP / (Math.PI * 0.1e-3 ** 2 / 4)), d: 0.1e-3, b: w.b, k: 0.25 });
  const best = FOILS.map((h) => ({ h, ...secP(h) })).reduce((a, x) => (x.P < a.P ? x : a));
  RECOMMEND[sku] = { foil: w.foil, Fr: built.Fr, Psec: built.P, PsecAsDrawn: asDrawn.P, priFr, Ppri: Ip * Ip * priR * priFr, worst: worst.corner, fq, nP, optimum: best.h };
  ck("D3", `${sku} foil secondaries ${w.foil * 1e3} mm × 28 mm, ${w.N} layers each @${f(fq / 1e3, 0)} kHz`, built.Fr <= w.racLine && built.P <= 1.1 * best.P,
    `h/δ ${f(w.foil / dl)} (η ${f(eta)}) → Dowell Fr ${f(built.Fr)} ≤ ${w.racLine} → both secondaries ${f(built.P, 1)} W at ${f(Is, 1)} A rms each (${worst.corner}; optimum ${f(best.h * 1e3, 3)} mm = ${f(best.P, 1)} W) · the E51 ${w.wasFoil * 1e3} mm foil computed Fr ${f(asDrawn.Fr, 1)} → ${f(asDrawn.P, 1)} W`);
  ck("D3", `${sku} profiled-litz primary ${nP}×${f(w.dP * 1e3, 3)} mm`, priFr <= w.racLine,
    `Sullivan (interleaved k 0.25) Fr ${f(priFr)} → ${f(Ip * Ip * priR * priFr, 1)} W at ${f(Ip, 1)} A rms (0.1 mm strands at the same area computed Fr ${f(priWas)})`);
}
// D4 aux flyback primary (65 kHz DCM, 2 layers): informational — the bifilar 2×0.35 mm option is preferred
{
  const Fr05 = dowell(Math.pow(Math.PI / 4, 0.75) * (0.5e-3 / delta(65e3, T)) * Math.sqrt(0.8), 2);
  const Fr035 = dowell(Math.pow(Math.PI / 4, 0.75) * (0.35e-3 / delta(65e3, T)) * Math.sqrt(0.8), 4);
  console.log(`  info  [D4] primary @65 kHz: 0.5 mm single Fr ${f(Fr05)} vs 2×0.35 mm bifilar (4 sub-layers) Fr ${f(Fr035)} — both inside the ~1 W copper budget at ~1 A rms; bifilar is the build default`);
}
console.log("  info  [GAP] Dowell/Sullivan are 1-D and under-read loss where a gap's fringing field crosses a conductor — D2: distributed gaps + ≥5 mm litz clearance, measured Rac includes it · D3: Lm gap split equally per set (≤0.5 mm/position) because S1 foil is innermost; T-31 open-secondary check + S1 thermocouple, FEMMT run closes the number");
console.log(fails ? `\n${fails} CONDUCTOR FAILURE(S)` : "\nCONDUCTOR AUDIT CLEAN — every winding's AC resistance inside its own acceptance row at the simulated corner");
if (fileURLToPath(import.meta.url) === process.argv[1]) process.exit(fails ? 1 : 0);
