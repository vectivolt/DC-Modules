// geometry.mjs — E65: the ONE source of magnetic-core geometry for every magnetics engine and gate.
//
// Why it exists: turn lengths were hand-typed per gate. The PQ50/50 multi-set parts carried a single-post
// MLT (0.115 m) while their flux math multiplied Ae by the set count, and the 5×T79 D1 stacks carried
// 0.190 m while pfc-design's own model gives 0.242 m. Every MLT, Ae, Ve and window below is computed from
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
         lN1: 0.166, lNstep: 2 * S["E 70/33/32"].C / 1000 },                                 // TDK former B66372B1000 lN 166 mm; +1 set adds 2·C (B66372B2000 = 230.5 ✓)
  PQ50: { dims: S["PQ 50/50"], Ae: 328e-6, le: 0.113, Ve: 37.1e-6, kgSet: 0.195,           // TDK/Ferroxcube PQ50/50
          lN1: 0.115, lNstep: 2 * S["PQ 50/50"].C / 1000 },                                  // single-post former lN; side-by-side sets form a racetrack: +2·C per set
  ETD39: { dims: S["ETD 39/20/13"], Ae: 125e-6, le: 0.0922, Ve: 11.5e-6, kgSet: 0.060 },
  ETD44: { dims: S["ETD 44/22/15"], Ae: 173e-6, le: 0.103, Ve: 17.8e-6, kgSet: 0.094 },       // TDK ETD 44/22/15 (B66365) — D4 rev E (E65)
  T79: { dims: S["T 79/48/17"], Ae: 221e-6, le: 0.196, Ve: 43.4e-6, kgCore: 0.30,          // Magnetics 0077908A7 Kool Mµ 26 (datasheet rev 10/7/2021)
         mlt0: 0.098, mltK: 0.036 },                                                          // pfc-design winding model: + one core height ×2 per stacked core
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

export const toroidMlt = (core, cores) => CORES[core].mlt0 + CORES[core].mltK * (cores - 1);
// one turn of an E-core winding whose conductor centre sits r (m) out from the centre leg: anchored to the catalog
// former lN (= the turn at the full-window mean radius, former clearances included), shorter by 2π·Δr nearer the leg
export const FORMER_WALL = 1.2e-3;
export const eTurn = (core, n, r) => { const s = stack(core, n); return s.mlt - 2 * Math.PI * (FORMER_WALL + s.windowW / 2 - r); };

// ---- self-check: the catalog former anchors must reproduce (fails loudly if data drift) ----
{
  const two = stack("E70", 2).mlt;
  if (Math.abs(two - 0.2305) > 0.004) throw new Error(`geometry: E70 2-set MLT ${two} ≠ TDK B66372B2000 lN 0.2305 m`);
  if (Math.abs(stack("E70", 1).Ae - 683e-6) > 1e-9) throw new Error("geometry: E70 Ae drift");
  if (Math.abs(toroidMlt("T79", 3) - 0.170) > 0.002) throw new Error("geometry: T79 3-stack MLT ≠ registered 0.170");
}
