// d1-choke.mjs — E65: the D1 PFC swing-choke model, ONE source for conductor-audit (copper, production Rdc rows), stress-audit
// (temperature and the cooling decision), loss-budget (rated loss) and mag-sync (mass).
//
// Why it exists (E65 D1 audit + an independent 2-D field check): the conductor gate counted two strand layers (Dowell m = 2,
// Fr 11.4) where the 9- and 13-strand bundles put 10–12 strand rows in the bore field; the ΔT rows were typed constants
// (36/30/41 K) from a 280 cm²/core surface model that overstates the wound stack; the A3 core-loss fit read ≈2× under the
// Magnetics equation; and three MLTs (0.190 / 0.242 / 0.278 m) were live at once.
//
// Chain, all computed:
//   excitation  calculations/out/vienna-switched.csv — fundamental, 50 kHz ripple rms and iGSE core loss on the simulated flux
//               (Kool Mµ 26 published equation, MAS), scaled to the datasheet MAXIMUM (900 mW/cm³ at 100 kHz / 100 mT)
//   geometry    geometry.mjs toroidWound — Magnetics winding-length table (MLT), turn layers of the taped bundle, wound surfaces
//   copper      winding-physics ferreira: each strand row at the bore and OD sees H = (enclosed ampere-turns)/(2πr) at its own
//               radius; the end faces ramp 0 → NI/(2πr) across their rows; × k2D, the neighbour-shielding factor solved by the 2-D
//               eddy-current anchor (d1-fd.mjs → calculations/out/d1-fd.csv, fingerprinted per build) for the twisted/transposed
//               bundle — the design basis; the flat untwisted bundle computes ≈0.5× that HF and is reported, not relied on
//   thermal     winding node (copper conducts along the turn at 400 W/mK; the core loss enters through the wrap) → forced air on the
//               exposed wound surfaces (Churchill–Bernstein cylinder in cross-flow, bore at 0.3 h, radiation ε 0.9 × view 0.5 on
//               air SKUs) ∥ gap-pad bond of ONE end face to the extrusion web / coldplate; hot-spot = node + along-turn rise of the
//               bore segment to the nearest cooled face
// Boundary conditions are the magnetics-envelope ones (tunnel air = inlet + 10·load, web = inlet + 5 + 20·load, liquid plate 65 °C).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { D1 as SIM } from "../pfc/vienna-switched.mjs";
import { DATA, toroidWound, WRAP } from "./geometry.mjs";
import { rho, delta, ferreira } from "./winding-physics.mjs";
import { V_AIR, wallAt } from "./magnetics-envelope.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const csv = (p) => readFileSync(join(ROOT, p), "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
const vs = csv("calculations/out/vienna-switched.csv");
const vh = vs[0].split(",");
export const VS = vs.slice(1).map((l) => Object.fromEntries(l.match(/("[^"]*"|[^,]+)/g).map((v, i) => [vh[i], v])));
export const row = (sku, tag) => VS.find((r) => r.sku === (sku === "50kwa" ? "50kw" : sku) && r.case === tag);

// ---- constructions: the drawn parts (stack/N from the simulation table) + conductor + mount. mount: "air" = centre bolt on a
// standoff (mount face uncredited), "web1" = one end face gap-padded to the extrusion web, "plate1" = one end face to the coldplate
const cond = (sku, over) => ({ sku, ...SIM[sku === "50kwa" ? "50kw" : sku], lay: 1, ...over });
export const D1 = {
  "30kw": cond("30kw", { nw: 9, d: 1.6e-3, mount: "web1" }),     // E65: bonded like D1-50 (was "air" — the control group below)
  "40kw": cond("40kw", { nw: 13, d: 1.6e-3, mount: "web1" }),
  "50kw": cond("50kw", { nw: 13, d: 1.6e-3, mount: "plate1" }),
  "50kwa": cond("50kwa", { nw: 13, d: 1.6e-3, mount: "web1" }),
};
export const D1_REGISTERED = { "30kw": "air", "40kw": "air", "50kw": "plate1", "50kwa": "web1" };   // E51/E60 as drawn
// the evaluated alternative to the bond: Type-2 litz of 0.2 mm strands, same copper area, air-cooled (lay-length +3 % Rdc)
export const D1_LITZ = Object.fromEntries(Object.entries(D1).map(([k, c]) => [k, { ...c, nw: c.nw === 9 ? 576 : 832, d: 0.2e-3, lay: 1.03, mount: "air" }]));

// thermal materials (declared): gap pad 1.0 mm at 3 W/mK over 50 % of the bonded winding face, enamel + varnish film 50 µm at
// 0.2 W/mK, wrap 0.13 mm polyester at 0.2 W/mK + 0.2 mm varnish at 0.3 W/mK core→winding
export const PAD = { t: 1.0e-3, k: 3.0, contact: 0.5, tFilm: 0.05e-3, kFilm: 0.2 };
const gBond = (g) => (PAD.contact * g.area.face) / (PAD.t / PAD.k + PAD.tFilm / PAD.kFilm);
const FE_MAX = (() => { const m = DATA.KoolMu_MAS["26"], ds = DATA.T79_0077908A7; return ds.loss_max_mW_cm3_100kHz_100mT * 1e3 / (m.a * 0.1 ** m.b * 100e3 ** m.c); })();

export const geom = (c) => toroidWound("T79", c.stack, { N: c.N, nw: c.nw, d: c.d });
export const fdFingerprint = (c) => `N${c.N}·nw${c.nw}·d${c.d * 1e3}·x${c.stack}·L${geom(c).layers.join("/")}`;
// the 2-D anchor for this construction: solid 1.6 mm strands need a matching fingerprint; fine litz (d/δ < 1) needs none (k2D → 1)
let FD = null;
export const fdAnchor = (c) => {
  if (c.d / delta(50e3, 100) < 1) return { ok: true, k2D: 1, kBundle: 1, src: "litz: no shielding correction below d/δ 1" };
  if (!FD) { try { const L = csv("calculations/out/d1-fd.csv"), h = L[0].split(","); FD = L.slice(1).map((l) => Object.fromEntries(l.split(",").map((v, i) => [h[i], v]))); } catch { FD = []; } }
  const r = FD.find((x) => x.fingerprint === fdFingerprint(c));
  return r ? { ok: true, k2D: +r.k2D, kBundle: +r.k_bundle, src: `d1-fd ${r.fingerprint}` } : { ok: false, k2D: 1, kBundle: 1, src: `NO d1-fd row for ${fdFingerprint(c)} — re-run d1-fd.mjs` };
};
const rowsPerBundle = (g) => Math.max(1, Math.round((g.Db - g.dE) / (0.866 * g.dE)) + 1);   // hex-packed strand rows across the bundle
// mean (H / I_strand)² per strand over one turn (and over the bore strands alone) → Ferreira orthogonality
export const fieldFactor = (c, g) => {
  const wires = c.N * c.nw, q = rowsPerBundle(g);
  let bore = 0, enc = 0;
  for (let L = g.layers.length - 1; L >= 0; L--) for (let j = q - 1; j >= 0; j--) {        // hole side → core surface
    const n = (g.layers[L] * c.nw) / q, r = g.rI - g.Db * (L + (j + 0.5) / q), h = (enc + n / 2) / (2 * Math.PI * r);
    bore += n * h * h; enc += n;
  }
  let od = 0; enc = 0;
  const nOd = q * g.odLayers;
  for (let j = 0; j < nOd; j++) {                                                           // core surface → outside
    const n = wires / nOd, r = g.rO + (g.Db * g.odLayers * (j + 0.5)) / nOd, h = (wires - enc - n / 2) / (2 * Math.PI * r);
    od += n * h * h; enc += n;
  }
  let ends = 0;
  for (let j = 0; j < 40; j++) {
    const r = g.rI + ((g.rO - g.rI) * (j + 0.5)) / 40, M = Math.max(1, (c.N * g.Db) / (2 * Math.PI * r)) * q;
    ends += ((wires / (2 * Math.PI * r)) ** 2 * (4 * M * M - 1)) / (12 * M * M) / 40;
  }
  return { mean: (g.Hs * (bore + od) / wires + 2 * g.w * ends) / (2 * g.Hs + 2 * g.w), bore: bore / wires };
};

// ---- losses at winding temperature T for a vienna-switched row
export const d1Loss = (c, r, T = 100) => {
  const g = geom(c), ff = fieldFactor(c, g), A = (c.nw * Math.PI * c.d * c.d) / 4, fd = fdAnchor(c);
  const Rdc = (rho(T) * c.N * g.mlt * c.lay) / A, { FR, GR } = ferreira(c.d, 50e3, T);
  const FrFerreira = 2 * FR + 2 * GR * ff.mean, Fr = fd.k2D * FrFerreira, FrBore = fd.k2D * (2 * FR + 2 * GR * ff.bore);
  const I1 = +r.I1pk_A / Math.SQRT2, Ihf = +r.Ihf_rms_A;
  return { g, ff, fd, Rdc, Rdc25: (rho(25) * c.N * g.mlt * c.lay) / A, FrFerreira, Fr, FrBore, I1, Ihf, A,
    lf: I1 * I1 * Rdc, hf: Ihf * Ihf * Rdc * Fr, hfUntwisted: Ihf * Ihf * Rdc * Fr * fd.kBundle, fe: +r.Pfe_igse_W * FE_MAX };
};

// ---- steady state at inlet Tin and load fraction frac: LF copper scales lfK (the 75 °C derate), ripple copper and core loss are
// volt-second pinned; k multiplies every thermal resistance (+25 % stress); vK scales the local air velocity. Returns winding node,
// hot-spot, core, and the watts the bond puts into the web/plate.
export const d1Temp = (c, r, { Tin = 55, frac = 1, lfK = 1, k = 1, mount = c.mount, vK = 1 } = {}) => {
  const air = Tin + 10 * frac, wall = wallAt(c.sku, Tin, frac), v = V_AIR[c.sku] * vK, g = geom(c);
  const Re = (v * g.OD) / 2.1e-5, Pr = 0.7;                                                // air near 80 °C: ν 2.1e-5 m²/s, k 0.030 W/mK
  const Nu = v > 0 ? 0.3 + ((0.62 * Math.sqrt(Re) * Pr ** (1 / 3)) / (1 + (0.4 / Pr) ** (2 / 3)) ** 0.25) * (1 + (Re / 282000) ** 0.625) ** 0.8 : 0;
  const h = (Nu * 0.030) / g.OD, Aexp = g.area.outer + g.area.face, bonded = /1$/.test(mount);
  const Gbond = bonded ? gBond(g) : 0;
  const Acore = 2 * Math.PI * (g.rI + g.rO) * g.Hs + 2 * Math.PI * (g.rO ** 2 - g.rI ** 2), Rcore = (WRAP / 0.2 + 0.2e-3 / 0.3) / Acore;
  let T = air + 40, L;
  for (let i = 0; i < 60; i++) {
    L = d1Loss(c, r, T);
    const Ta = air + 273.15, Ts = T + 273.15, hr = v > 0 ? 0.9 * 0.5 * 5.67e-8 * (Ts * Ts + Ta * Ta) * (Ts + Ta) : 0;
    const Gair = ((h + hr) * Aexp + 0.3 * h * g.area.bore) / k, Gb = Gbond / k, P = lfK * L.lf + L.hf + L.fe;
    const next = Gair + Gb > 0 ? (P + Gair * air + Gb * wall) / (Gair + Gb) : Infinity;
    if (!(next < 320)) return { Tw: Infinity, hot: Infinity, Tcore: Infinity, L, g, h, Gbond };
    T = 0.5 * T + 0.5 * next;
  }
  // along-turn rise: the bore segment's own loss density conducted along the bundle to the nearest cooled face
  const len = bonded ? g.Hs + g.w / 2 : (g.Hs + g.w) / 2, qB = (lfK * L.I1 * L.I1 + L.Ihf * L.Ihf * L.FrBore) * L.Rdc / (c.N * g.mlt);
  const fin = (k * qB * len * len) / (2 * 400 * L.A);
  return { Tw: T, hot: T + fin, fin, Tcore: T + L.fe * Rcore * k, L, g, h, Gbond, air, wall, bondW: (Gbond / k) * (T - wall) };
};
// production-reproducible bonded type test: the corner's total loss (100 °C basis) as DC in still air, bonded face on a plate held
// at temperature → hot-spot rise above the plate = P/G_bond + along-turn rise (no convection credit). A missing or dry pad shows here.
export const d1TypeTest = (c, r) => {
  const L = d1Loss(c, r, 100), P = L.lf + L.hf + L.fe, Gbond = gBond(L.g);
  const q = P / (c.N * L.g.mlt), len = L.g.Hs + L.g.w / 2;
  return { P, Idc: Math.sqrt(P / L.Rdc), rise: P / Gbond + (q * len * len) / (2 * 400 * L.A) };
};
