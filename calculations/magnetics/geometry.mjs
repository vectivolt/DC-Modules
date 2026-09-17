// geometry.mjs — the ONE source of magnetic-core geometry for every magnetics engine and gate.
//
// Why it exists: turn lengths were hand-typed per gate. The PQ50/50 multi-set parts carried a single-post
// MLT (0.115 m) while their flux math multiplied Ae by the set count, and the 5×T79 D1 stacks carried
// 0.190 m in the audits (shorter than the bare 5-stack cross-section perimeter, 0.201 m), 0.278 m in pfc-design (mlt0 +
// mltK·stack, off by one core) and 0.242 m here (its mlt0 sat at the datasheet's 50 % fill) against 0.225–0.227 m from the
// Magnetics winding table (the T79 turn comes from that table). Every MLT, Ae, Ve and window below is computed from
// catalog data (IEC 63093 dimensions frozen from OpenMagnetics/MAS in magnetics-data.json; TDK/Magnetics
// effective parameters and former mean turn lengths) so a stack change moves every carrier together.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA = JSON.parse(readFileSync(join(HERE, "magnetics-data.json"), "utf8"));
const S = DATA.shapes_mm;

// Catalog effective parameters (per single set / single core). Sources in the comments; dimensions from MAS.
export const CORES = {
  E70: { dims: S["E 70/33/32"], Ae: 683e-6, le: 0.149, Ve: 102e-6, kgSet: 0.50,          // TDK E70/33/32 (B66371), set = 2 halves
         lN1: 0.166, lNstep: 2 * S["E 70/33/32"].C / 1000 },                                 // TDK former B66372B1000 lN 166 mm; +1 set adds 2·C (B66372x2000 = 230.5 ✓ — A/B suffix is material class, same geometry; the build uses A2000, class F 155 °C / V-0)
  PQ50: { dims: S["PQ 50/50"], Ae: 328e-6, le: 0.113, Ve: 37.1e-6, kgSet: 0.195,           // TDK/Ferroxcube PQ50/50
          lN1: 0.115, lNstep: 2 * S["PQ 50/50"].C / 1000 },                                  // single-post former lN; side-by-side sets form a racetrack: +2·C per set
  ETD39: { dims: S["ETD 39/20/13"], Ae: 125e-6, le: 0.0922, Ve: 11.5e-6, kgSet: 0.060 },
  ETD44: { dims: S["ETD 44/22/15"], Ae: 173e-6, le: 0.103, Ve: 17.8e-6, kgSet: 0.094 },       // TDK ETD 44/22/15 (B66365) — D4 rev E
  T79: { dims: S["T 79/48/17"], Ae: 221e-6, le: 0.196, Ve: 43.4e-6, kgCore: 0.240,         // Magnetics 0077908A7 Kool Mµ 26 (datasheet rev 10/7/2021: 240 g)
         ds: DATA.T79_0077908A7 },                                                            // winding-length table, coated limits, surface areas
  T57: { Ae: 3.10e-4, le: 0.1304, mlt0: 0.075, mltK: 0.020 },                               // dm-choke-design catalog set
  T48: { Ae: 1.99e-4, le: 0.1074, mlt0: 0.062, mltK: 0.016 },
};

// n sets of an E or PQ core side by side (stacked along depth C): parallel magnetic paths, one winding
export const stack = (core, n) => {
  const c = CORES[core], d = c.dims;
  const windowW = (d.E - d.F) / 2 / 1000, windowH = (2 * d.D) / 1000;
  const mlt = c.lN1 + (n - 1) * c.lNstep;
  // exposed surface of the assembled stack + coil ends (mounting face excluded) — thermal model input
  const H = 2 * d.B / 1000, A = d.A / 1000, depth = n * d.C / 1000;
  const coilEnds = 2 * ((d.F / 1000 + 2 * windowW * 0.9 + 0.002) * windowH + 2 * windowW * 0.9 * windowH);
  const area = 2 * A * H + A * depth + 2 * H * depth + coilEnds;
  return { core, n, Ae: n * c.Ae, Ve: n * c.Ve, le: c.le, mlt, windowW, windowH, area, kg: n * c.kgSet };
};

// ---- toroid stacks (D1). The Magnetics winding-length table is plain geometry — its 0 % row is (OD − ID) + 2·HT on the coated
// limits — so each stacked core adds 2·HT to the turn. K = insulated wire area / window (the Magnetics winding factor).
const WL = (t, K) => { let i = 1; while (i < t.length - 1 && t[i][0] < K) i++; const [k0, l0] = t[i - 1], [k1, l1] = t[i]; return (l0 + ((l1 - l0) * (K - k0)) / (k1 - k0)) / 1000; };
export const toroidMlt = (core, cores, K) => { const ds = CORES[core].ds; return WL(ds.winding_length_per_turn_mm, K) + (2 * (cores - 1) * ds.coated_mm.HT_max) / 1000; };
// wound build of a taped round bundle (nw strands, grade-2 enamel ⌀ dE, circle-packed bundle ⌀ Db): turn layers at the bore
// (2πr/Db per layer), one OD layer per 2πr/Db turns, finished envelope and exposed surfaces → D1 proximity rows, thermal, envelope
export const WRAP = 0.13e-3, BOND_LINE = 0.1e-3;
const PACK = { 1: 1, 7: 3, 8: 3.305, 9: 3.613, 13: 4.236 };                                   // circle-in-circle R/r (Graham–Lubachevsky)
export const toroidWound = (core, cores, { N, nw, d, dE = d * 1.066, Db = dE * (PACK[nw] ?? Math.sqrt(nw / 0.75)) }) => {
  const ds = CORES[core].ds, c = ds.coated_mm, rI = c.ID_min / 2000 - WRAP, rO = c.OD_max / 2000 + WRAP, w = (c.OD_max - c.ID_min) / 2000;
  const Hs = (cores * c.HT_max) / 1000 + (cores - 1) * BOND_LINE, layers = [];
  for (let left = N, L = 0; left > 0; L++) {
    const n = Math.min(left, Math.floor((2 * Math.PI * (rI - Db * (L + 0.5))) / Db));
    if (n <= 0) throw new Error(`geometry: ${N} T of ⌀${(Db * 1e3).toFixed(1)} mm close the ${core} bore`);
    layers.push(n); left -= n;
  }
  const K = (N * nw * Math.PI * dE * dE) / 4 / (ds.window_mm2 * 1e-6), odLayers = Math.ceil((N * Db) / (2 * Math.PI * (rO + Db / 2)));
  const tB = layers.length * Db, tO = odLayers * Db, H = Hs + 2 * (WRAP + tB), OD = 2 * (rO + tO), hole = 2 * (rI - tB);
  const mltLayers = layers.reduce((s, n, L) => s + n * (2 * Hs + 2 * w + Math.PI * Db * (L + 0.5) + Math.PI * (Db * odLayers) / 2), 0) / N;
  return { K, mlt: toroidMlt(core, cores, K), mltLayers, layers, odLayers, dE, Db, rI, rO, w, Hs, H, OD, hole,
    area: { outer: Math.PI * OD * H, face: (Math.PI / 4) * (OD * OD - hole * hole), bore: Math.PI * hole * H } };
};
// one turn of an E-core winding whose conductor centre sits r (m) out from the centre leg: anchored to the catalog
// former lN (= the turn at the full-window mean radius, former clearances included), shorter by 2π·Δr nearer the leg
export const FORMER_WALL = 1.2e-3;
export const eTurn = (core, n, r) => { const s = stack(core, n); return s.mlt - 2 * Math.PI * (FORMER_WALL + s.windowW / 2 - r); };

// ---- self-check: the catalog former anchors must reproduce (fails loudly if data drift) ----
{
  const two = stack("E70", 2).mlt;
  if (Math.abs(two - 0.2305) > 0.004) throw new Error(`geometry: E70 2-set MLT ${two} ≠ TDK B66372x2000 lN 0.2305 m`);
  if (Math.abs(stack("E70", 1).Ae - 683e-6) > 1e-9) throw new Error("geometry: E70 Ae drift");
  const ds = CORES.T79.ds, c = ds.coated_mm;
  if (Math.abs(toroidMlt("T79", 1, 0) * 1000 - (c.OD_max - c.ID_min + 2 * c.HT_max)) > 0.1) throw new Error("geometry: T79 winding table 0 % row ≠ coated (OD − ID) + 2·HT");
  const d40 = 1.0e-3 * 1.066, s40 = toroidWound("T79", 1, { N: Math.round((0.4 * ds.window_mm2 * 1e-6) / ((Math.PI * d40 * d40) / 4)), nw: 1, d: 1.0e-3 }), a = s40.area;
  if (Math.abs((a.outer + 2 * a.face + a.bore) / (ds.surface_area_mm2.wf40 * 1e-6) - 1) > 0.12) throw new Error("geometry: T79 wound surface at 40 % ≠ datasheet 240 cm² ±12 %");
  for (const [n, N, nw] of [[3, 39, 9], [5, 26, 13], [5, 24, 13]]) {                          // the three D1 builds: two independent turn models
    const g = toroidWound("T79", n, { N, nw, d: 1.6e-3 });
    if (Math.abs(g.mltLayers / g.mlt - 1) > 0.08) throw new Error(`geometry: T79×${n} N ${N} layer-model turn ${g.mltLayers} ≠ datasheet table ${g.mlt} ±8 %`);
    if (g.mlt <= 2 * (g.Hs + g.w)) throw new Error("geometry: T79 turn shorter than the bare stack cross-section perimeter");
  }
}
