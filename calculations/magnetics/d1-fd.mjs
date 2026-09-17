#!/usr/bin/env node
// d1-fd.mjs — 2-D eddy-current anchor for the D1 bundle copper at the 50 kHz ripple → calculations/out/d1-fd.csv
//
// Why it exists: the D1 bundles are 9 or 13 strands of 1.6 mm (d/δ ≈ 4.7 at 50 kHz, 100 °C) packed into 1–3 turn layers. The two
// closed forms disagree there by 2.5× (Ferreira orthogonality on the strands vs Dowell on strand rows) because neither sees the
// neighbours' shielding. This solves the field. d1-choke keeps the closed form for the exact turn distribution and the bore
// curvature, and takes the 2-D shielding factor k2D = FD / Ferreira-on-the-same-cell from here (fingerprinted per build).
//
// Method: magnetoquasistatic A_z phasor, cell-centred grid (h 0.1 mm), periodic along the layer; imposed tangential H at the core
// surface (Ampère: cell current / pitch), A = 0 above the hole side; every strand carries its prescribed current through a uniform
// source field (superposition, one small dense solve). Row-block Thomas elimination (exact for the banded system).
// Cells: bore = the smallest repeating pattern of the turn layers (q ≤ 3), OD = one spread layer, end faces = mean per turn.
// Two strand-current states: EQUAL (a twisted / transposed bundle — the design basis, the upper bound) and BUNDLE (strands
// paralleled only at the terminals, the sharing set by equal whole-winding strand voltages — a flat untwisted bundle).
// Guards (the run fails): skin-only strand vs the Kelvin closed form, dense strand rows vs Dowell (the exact 1-D limit),
// BUNDLE ≤ EQUAL, current conservation.
// Run: node calculations/magnetics/d1-fd.mjs        (≈1 min; re-run when a D1 construction changes — d1-choke checks the fingerprint)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { D1, geom, fdFingerprint } from "./d1-choke.mjs";
import { rho, delta, dowell, ferreira, MU0 } from "./winding-physics.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const f = (x, d = 3) => Number(x.toFixed(d));
const FQ = 50e3, T = 100, H = 0.1e-3, DE = 1.066;

// ---- complex dense helpers: matrices as [re, im] Float64Array(n·n), row-major
const cinv = (re0, im0, n) => {                         // Gauss–Jordan, partial pivoting
  const ar = Float64Array.from(re0), ai = Float64Array.from(im0), br = new Float64Array(n * n), bi = new Float64Array(n * n);
  for (let i = 0; i < n; i++) br[i * n + i] = 1;
  for (let c = 0; c < n; c++) {
    let p = c, pm = 0;
    for (let r = c; r < n; r++) { const m = ar[r * n + c] ** 2 + ai[r * n + c] ** 2; if (m > pm) { pm = m; p = r; } }
    if (p !== c) for (let k = 0; k < n; k++) for (const a of [ar, ai, br, bi]) { const t = a[c * n + k]; a[c * n + k] = a[p * n + k]; a[p * n + k] = t; }
    const dr = ar[c * n + c] / pm, di = -ai[c * n + c] / pm;             // 1/pivot
    for (let k = 0; k < n; k++) {
      const x = ar[c * n + k], y = ai[c * n + k]; ar[c * n + k] = x * dr - y * di; ai[c * n + k] = x * di + y * dr;
      const u = br[c * n + k], v = bi[c * n + k]; br[c * n + k] = u * dr - v * di; bi[c * n + k] = u * di + v * dr;
    }
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const fr = ar[r * n + c], fi = ai[r * n + c];
      if (fr === 0 && fi === 0) continue;
      for (let k = 0; k < n; k++) {
        const x = ar[c * n + k], y = ai[c * n + k]; ar[r * n + k] -= fr * x - fi * y; ai[r * n + k] -= fr * y + fi * x;
        const u = br[c * n + k], v = bi[c * n + k]; br[r * n + k] -= fr * u - fi * v; bi[r * n + k] -= fr * v + fi * u;
      }
    }
  }
  return [br, bi];
};
const csolve = (Mr, Mi, br, bi, n) => { const [ir, ii] = cinv(Mr, Mi, n), xr = new Float64Array(n), xi = new Float64Array(n);
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) { xr[r] += ir[r * n + k] * br[k] - ii[r * n + k] * bi[k]; xi[r] += ir[r * n + k] * bi[k] + ii[r * n + k] * br[k]; }
  return [xr, xi]; };

// hex-lattice strand pattern of a round bundle: the nw lattice points nearest the centre
const bundlePts = (nw, p) => {
  const pts = [];
  for (let a = -5; a <= 5; a++) for (let b = -5; b <= 5; b++) { const x = (a + b / 2) * p, y = (b * Math.sqrt(3) / 2) * p; pts.push([Math.round((x * x + y * y) * 1e12), Math.atan2(y, x), x, y]); }
  pts.sort((u, v) => u[0] - v[0] || u[1] - v[1]);
  const s = pts.slice(0, nw), cx = s.reduce((a, q) => a + q[2], 0) / nw, cy = s.reduce((a, q) => a + q[3], 0) / nw;
  return s.map((q) => [q[2] - cx, q[3] - cy]);
};

// ---- one periodic cell: bundles = [[x, y], ...], each holding strands 0..nw-1 of diameter d at enamel pitch dE
const cell = ({ nw, d, bundles, px, Ly, pts = bundlePts(nw, d * DE) }) => {
  const sig = 1 / rho(T), w = 2 * Math.PI * FQ, nx = Math.max(8, Math.round(px / H)), hx = px / nx, ny = Math.round(Ly / H), hy = Ly / ny, s = 1 / (hy * hy);
  const occ = new Int32Array(nx * ny).fill(-1), strand = [];
  let G = 0;
  for (const [bx, by] of bundles) for (let q = 0; q < pts.length; q++, G++) {
    const cx = bx + pts[q][0], cy = by + pts[q][1]; strand.push(q);
    for (let j = 0; j < ny; j++) { const y = (j + 0.5) * hy; if (Math.abs(y - cy) > d / 2) continue;
      for (let i = 0; i < nx; i++) { const x = (i + 0.5) * hx; for (const sx of [-px, 0, px]) if ((x - cx - sx) ** 2 + (y - cy) ** 2 <= (d / 2) ** 2) occ[j * nx + i] = G; } }
  }
  const n = nx, Gr = [], Gi = [];                                          // row-block elimination, inverses kept for back-solves
  for (let j = 0; j < ny; j++) {
    const dr = new Float64Array(n * n), di = new Float64Array(n * n);
    for (let i = 0; i < n; i++) {
      dr[i * n + i] = -2 / (hx * hx) - 2 * s + (j === 0 ? s : 0) - (j === ny - 1 ? s : 0);
      dr[i * n + ((i + 1) % n)] += 1 / (hx * hx); dr[i * n + ((i + n - 1) % n)] += 1 / (hx * hx);
      if (occ[j * nx + i] >= 0) di[i * n + i] = -w * MU0 * sig;
    }
    if (j > 0) for (let k = 0; k < n * n; k++) { dr[k] -= s * s * Gr[j - 1][k]; di[k] -= s * s * Gi[j - 1][k]; }
    const [ir, ii] = cinv(dr, di, n); Gr.push(ir); Gi.push(ii);
  }
  const bsolve = (rr, ri) => {                                              // rows of length nx
    const yr = new Float64Array(nx * ny), yi = new Float64Array(nx * ny), ar = new Float64Array(nx * ny), ai = new Float64Array(nx * ny);
    const mul = (Mr, Mi, vr, vi, off, outr, outi, oo, sc) => { for (let r = 0; r < n; r++) { let a = 0, b = 0; for (let k = 0; k < n; k++) { const x = vr[off + k], y = vi[off + k]; a += Mr[r * n + k] * x - Mi[r * n + k] * y; b += Mr[r * n + k] * y + Mi[r * n + k] * x; } outr[oo + r] += sc * a; outi[oo + r] += sc * b; } };
    for (let i = 0; i < nx; i++) { yr[i] = rr[i]; yi[i] = ri[i]; }
    for (let j = 1; j < ny; j++) { for (let i = 0; i < nx; i++) { yr[j * nx + i] = rr[j * nx + i]; yi[j * nx + i] = ri[j * nx + i]; } mul(Gr[j - 1], Gi[j - 1], yr, yi, (j - 1) * nx, yr, yi, j * nx, -s); }
    mul(Gr[ny - 1], Gi[ny - 1], yr, yi, (ny - 1) * nx, ar, ai, (ny - 1) * nx, 1);
    for (let j = ny - 2; j >= 0; j--) { const tr = new Float64Array(nx), ti = new Float64Array(nx);
      for (let i = 0; i < nx; i++) { tr[i] = yr[j * nx + i] - s * ar[(j + 1) * nx + i]; ti[i] = yi[j * nx + i] - s * ai[(j + 1) * nx + i]; }
      mul(Gr[j], Gi[j], tr, ti, 0, ar, ai, j * nx, 1); }
    return [ar, ai];
  };
  const cond = [], cellOf = []; for (let k = 0; k < nx * ny; k++) if (occ[k] >= 0) { cond.push(k); cellOf.push(occ[k]); }
  const cA = hx * hy, area = new Float64Array(G); for (const g of cellOf) area[g] += cA;
  const zeros = () => new Float64Array(nx * ny);
  const rN = zeros(); for (let i = 0; i < nx; i++) rN[i] = (MU0 / px) / hy;                        // unit total current, core-side H
  const [ANr, ANi] = bsolve(rN, zeros()), aNr = new Float64Array(G), aNi = new Float64Array(G);
  cond.forEach((k, c) => { aNr[cellOf[c]] += ANr[k]; aNi[cellOf[c]] += ANi[k]; });
  const AgR = [], AgI = [];                                                   // strand responses on conductor cells only
  for (let g = 0; g < G; g++) { const r = zeros(); cond.forEach((k, c) => { if (cellOf[c] === g) r[k] = -MU0 * sig; });
    const [ar, ai] = bsolve(r, zeros()); AgR.push(Float64Array.from(cond, (k) => ar[k])); AgI.push(Float64Array.from(cond, (k) => ai[k])); }
  const Kr = new Float64Array(G * G), Ki = new Float64Array(G * G);
  for (let gm = 0; gm < G; gm++) cond.forEach((k, c) => { const gi = cellOf[c]; Kr[gi * G + gm] += w * sig * cA * AgI[gm][c]; Ki[gi * G + gm] -= w * sig * cA * AgR[gm][c]; });
  for (let g = 0; g < G; g++) Kr[g * G + g] += sig * area[g];
  const [KIr, KIi] = cinv(Kr, Ki, G);
  // prescribed occurrence currents → J on conductor cells
  const J = (cur) => {
    const Itot = cur.reduce((a, x) => a + x, 0), br = Float64Array.from(cur, (x, g) => x - w * sig * cA * aNi[g] * Itot), bi = Float64Array.from(cur, (x, g) => w * sig * cA * aNr[g] * Itot);
    const Er = new Float64Array(G), Ei = new Float64Array(G);
    for (let r = 0; r < G; r++) for (let k = 0; k < G; k++) { Er[r] += KIr[r * G + k] * br[k] - KIi[r * G + k] * bi[k]; Ei[r] += KIr[r * G + k] * bi[k] + KIi[r * G + k] * br[k]; }
    const Jr = new Float64Array(cond.length), Ji = new Float64Array(cond.length);
    cond.forEach((k, c) => { let ar = ANr[k] * Itot, ai = ANi[k] * Itot; for (let g = 0; g < G; g++) { ar += Er[g] * AgR[g][c] - Ei[g] * AgI[g][c]; ai += Er[g] * AgI[g][c] + Ei[g] * AgR[g][c]; }
      const g = cellOf[c]; Jr[c] = sig * (Er[g] + w * ai); Ji[c] = sig * (Ei[g] - w * ar); });
    return { Er, Ei, Jr, Ji };
  };
  // per unit strand j (same current in every bundle of the cell): strand coupling Z (sharing only) and the exact loss form Q
  const nwC = pts.length, Zr = new Float64Array(nwC * nwC), Zi = new Float64Array(nwC * nwC), Js = [];
  for (let j = 0; j < nwC; j++) { const r = J(strand.map((q) => (q === j ? 1 : 0))); Js.push(r); for (let g = 0; g < G; g++) { Zr[strand[g] * nwC + j] += r.Er[g]; Zi[strand[g] * nwC + j] += r.Ei[g]; } }
  const Qr = new Float64Array(nwC * nwC), Qi = new Float64Array(nwC * nwC);
  for (let a = 0; a < nwC; a++) for (let b = 0; b < nwC; b++) { let re = 0, im = 0; for (let c = 0; c < cond.length; c++) { re += Js[a].Jr[c] * Js[b].Jr[c] + Js[a].Ji[c] * Js[b].Ji[c]; im += Js[a].Jr[c] * Js[b].Ji[c] - Js[a].Ji[c] * Js[b].Jr[c]; } Qr[a * nwC + b] = (re * cA) / sig; Qi[a * nwC + b] = (im * cA) / sig; }
  const dc = strand.reduce((a, q, g) => a + 1 / (nwC * nwC * sig * area[g]), 0) / bundles.length;   // W/m per bundle at 1 A, equal strands (×½ applied by the caller)
  // conservation check on the equal state
  const eq = J(strand.map(() => 1 / nwC)), Igr = new Float64Array(G), Igi = new Float64Array(G);
  cond.forEach((_, c) => { Igr[cellOf[c]] += eq.Jr[c] * cA; Igi[cellOf[c]] += eq.Ji[c] * cA; });
  const Ierr = Math.max(...Array.from(Igr, (x, g) => Math.hypot(x - 1 / nwC, Igi[g]) * nwC));
  const ys = bundles.flatMap(([, by]) => pts.map(([, y]) => by + y));
  return { Zr, Zi, Qr, Qi, nw: nwC, dc, Ierr, ys, px, bundles: bundles.length };
};

// ½ i^H Q i and the strand sharing for a scaled region set
const quad = (Qr, Qi, n, i) => { let p = 0; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) p += Qr[a * n + b] * (i[a][0] * i[b][0] + i[a][1] * i[b][1]) + Qi[a * n + b] * (i[a][0] * i[b][1] - i[a][1] * i[b][0]); return 0.5 * p; };
const share = (Zr, Zi, n) => {                                    // Z i = V·1, Σi = 1
  const m = n + 1, Mr = new Float64Array(m * m), Mi = new Float64Array(m * m), br = new Float64Array(m), bi = new Float64Array(m);
  for (let a = 0; a < n; a++) { for (let b = 0; b < n; b++) { Mr[a * m + b] = Zr[a * n + b]; Mi[a * m + b] = Zi[a * n + b]; } Mr[a * m + n] = -1; Mr[n * m + a] = 1; }
  br[n] = 1; const [xr, xi] = csolve(Mr, Mi, br, bi, m); return Array.from({ length: n }, (_, k) => [xr[k], xi[k]]);
};
// Ferreira orthogonality on the same cell (strand centre field = enclosed strand current from the hole side / pitch)
const ferreiraCell = (c, d) => { const { FR, GR } = ferreira(d, FQ, T), n = c.nw, ys = [...c.ys].sort((a, b) => b - a);
  return ys.reduce((a, _, k) => a + 2 * FR / (n * n) + 2 * GR * (((k + 0.5) / n) / c.px) ** 2, 0) / (c.bundles / n); };   // Fr per bundle (R'·I² units)

// ---- guards: the solver must reproduce the two exact limits before any build is trusted
{
  const d = 1.6e-3, iso = cell({ nw: 1, d, bundles: [[10e-3, 10e-3]], px: 20e-3, Ly: 25e-3 });
  const skin = (2 * quad(iso.Qr, iso.Qi, 1, [[1, 0]])) / iso.dc, { FR, GR } = ferreira(d, FQ, T), exact = 2 * FR + 2 * GR * (0.5 / 20e-3) ** 2;
  const rows = cell({ nw: 1, d, bundles: [0, 1, 2, 3].map((m) => [d * DE / 2, 0.13e-3 + d * DE * (m + 0.5)]), px: d * DE, Ly: 0.13e-3 + 4 * d * DE + 1.5e-3 });
  const dense = (2 * quad(rows.Qr, rows.Qi, 1, [[1, 0]])) / (rows.dc * rows.bundles);
  const dow = dowell(Math.pow(Math.PI / 4, 0.75) * (d / delta(FQ, T)) * Math.sqrt(1 / DE), 4);
  console.log(`  guard  skin-dominated strand: FD Fr ${f(skin)} vs Kelvin ${f(exact)} · dense 4-row stack: FD Fr ${f(dense, 1)} vs Dowell ${f(dow, 1)} · current error ${iso.Ierr.toExponential(1)}/${rows.Ierr.toExponential(1)}`);
  if (Math.abs(skin / exact - 1) > 0.05 || Math.abs(dense / dow - 1) > 0.06 || Math.max(iso.Ierr, rows.Ierr) > 1e-6) { console.log("FD GUARD FAILED — the solver does not reproduce the closed-form limits"); process.exit(1); }
}

// ---- the D1 builds
const rows = [["sku", "fingerprint", "cell", "Fr_equal", "Fr_bundle", "Fr_ferreira_cell", "k2D", "k_bundle"]];
const seen = new Map();
for (const [sku, c] of Object.entries(D1)) {
  const fp = fdFingerprint(c);
  if (!seen.has(fp)) {
    const g = geom(c), pts = bundlePts(c.nw, c.d * DE), Db = 2 * (Math.max(...pts.map(([x, y]) => Math.hypot(x, y))) + (c.d * DE) / 2);
    const fills = g.layers.map((n) => n / g.layers[0]);
    const [q, cnt] = [1, 2, 3].map((q) => [q, fills.map((x) => Math.max(1, Math.round(x * q)))]).reduce((a, b) => (b[1].reduce((s, k, i) => s + Math.abs(k / b[0] - fills[i]), 0) < a[1].reduce((s, k, i) => s + Math.abs(k / a[0] - fills[i]), 0) - 1e-9 ? b : a));
    const px = (q * 2 * Math.PI * (g.rI - Db / 2)) / g.layers[0];
    const bore = cell({ nw: c.nw, d: c.d, pts, px, Ly: 0.13e-3 + cnt.length * Db + 1.5e-3, bundles: cnt.flatMap((k, l) => Array.from({ length: k }, (_, m) => [((m + 0.5) * px) / k, 0.13e-3 + Db / 2 + l * Db])) });
    const pxO = (2 * Math.PI * (g.rO + Db / 2)) / c.N, od = cell({ nw: c.nw, d: c.d, pts, px: pxO, Ly: 0.13e-3 + Db + 1.5e-3, bundles: [[pxO / 2, 0.13e-3 + Db / 2]] });
    const n = c.nw, cellsB = g.layers[0] / q, turnsB = cnt.reduce((a, x) => a + x, 0);
    const wB = cellsB * g.Hs, wO = c.N * g.Hs, wE = c.N * 2 * g.w;                // metres of winding per region (bore cell × cells, OD per turn, ends per turn)
    const mix = (ab, ao) => Float64Array.from(ab, (x, k) => wB * x + wO * ao[k] + (wE / 2) * (x / turnsB + ao[k]));
    const Zr = mix(bore.Zr, od.Zr), Zi = mix(bore.Zi, od.Zi), Qr = mix(bore.Qr, od.Qr), Qi = mix(bore.Qi, od.Qi);
    const dc = 0.5 * (wB * bore.dc * turnsB + wO * od.dc + (wE / 2) * (bore.dc + od.dc));
    const eqI = Array.from({ length: n }, () => [1 / n, 0]), bI = share(Zr, Zi, n);
    const Feq = quad(Qr, Qi, n, eqI) / dc, Fb = quad(Qr, Qi, n, bI) / dc;
    const fer = (wB * ferreiraCell(bore, c.d) * turnsB + wO * ferreiraCell(od, c.d) + (wE / 2) * (ferreiraCell(bore, c.d) + ferreiraCell(od, c.d))) / (wB * turnsB + wO + wE);
    if (!(Fb <= Feq * 1.0001) || Math.max(bore.Ierr, od.Ierr) > 1e-6) { console.log(`FD PHYSICALITY FAILED for ${sku}: bundle ${Fb} vs equal ${Feq}`); process.exit(1); }
    seen.set(fp, { cell: cnt.join("/"), Feq, Fb, fer });
    console.log(`  ${fp}: bore cell ${cnt.join("/")} (q ${q}, pitch ${f(px * 1e3, 2)} mm) · OD pitch ${f(pxO * 1e3, 2)} mm → Fr EQUAL ${f(Feq, 1)} · BUNDLE ${f(Fb, 1)} · Ferreira on the same cells ${f(fer, 1)} → k2D ${f(Feq / fer)} · untwisted/twisted ${f(Fb / Feq)}`);
  }
  const r = seen.get(fp);
  rows.push([sku, fp, r.cell, f(r.Feq, 2), f(r.Fb, 2), f(r.fer, 2), f(r.Feq / r.fer, 4), f(r.Fb / r.Feq, 4)]);
}
writeFileSync(join(OUT, "d1-fd.csv"), `# D1 2-D eddy-current anchor (calculations/magnetics/d1-fd.mjs): ${FQ / 1e3} kHz, ${T} °C, h ${H * 1e3} mm\n` + rows.map((x) => x.join(",")).join("\n") + "\n");
console.log("→ calculations/out/d1-fd.csv");
