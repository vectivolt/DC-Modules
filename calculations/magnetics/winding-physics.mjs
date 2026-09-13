// winding-physics.mjs — shared AC copper physics (moved out of conductor-audit at E65 so the magnetics envelope
// gate and the conductor audit use one implementation).
// IEC 60028 annealed Cu (ρ20 1.7241e-8 Ω·m, α 0.00393/K) · skin depth δ = √(ρ/(π f µ0)) · Dowell (1966) for foil
// and round-wire layers (porosity-corrected Δ) · Sullivan (TPEL 1999) litz proximity factor.
export const MU0 = 4e-7 * Math.PI;
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
// E65 D1: round-wire skin/proximity (Ferreira orthogonality, TPEL 1994; Kelvin-function form of Wojda & Kazimierczuk): per unit
// length P = R'dc·(2·FR·I² + 2·GR·H²), I and H rms, H the local transverse field. FR → 1/2 and GR → π²d²ξ⁴/32 at low frequency.
// Kelvin functions ber/bei_n(x) = Re/Im J_n(x·e^{3πi/4}) by power series (exact to double precision for x ≲ 20).
const kelvin = (n, x) => {
  const zr = (x / 2) * Math.cos((3 * Math.PI) / 4), zi = (x / 2) * Math.sin((3 * Math.PI) / 4), z2r = zr * zr - zi * zi, z2i = 2 * zr * zi;
  let tr = 1, ti = 0; for (let k = 0; k < n; k++) [tr, ti] = [tr * zr - ti * zi, tr * zi + ti * zr];
  for (let k = 2; k <= n; k++) { tr /= k; ti /= k; }
  let sr = tr, si = ti;
  for (let k = 1; k < 120; k++) { [tr, ti] = [-(tr * z2r - ti * z2i) / (k * (k + n)), -(tr * z2i + ti * z2r) / (k * (k + n))]; sr += tr; si += ti; }
  return [sr, si];
};
export const ferreira = (d, fq, T) => {
  const xi = d / (Math.SQRT2 * delta(fq, T)), [b0, i0] = kelvin(0, xi), [b1, i1] = kelvin(1, xi), [b2, i2] = kelvin(2, xi);
  const FR = ((xi / (4 * Math.SQRT2)) * (b0 * i1 - b0 * b1 - i0 * b1 - i0 * i1)) / (b1 * b1 + i1 * i1);
  const GR = ((-xi * Math.PI ** 2 * d * d) / (2 * Math.SQRT2)) * ((b2 * b1 + b2 * i1 - i2 * b1 + i2 * i1) / (b0 * b0 + i0 * i0));
  return { FR, GR, xi };
};
{ // self-check: both low-frequency limits, and the high-frequency skin asymptote 2·FR → d/(4δ) + 1/4 (Bessel, isolated wire)
  const lo = ferreira(1.6e-3, 50, 100), hi = ferreira(10e-3, 1e6, 100);
  if (Math.abs(lo.FR - 0.5) > 1e-3 || Math.abs(lo.GR / ((Math.PI ** 2 * 2.56e-6 * lo.xi ** 4) / 32) - 1) > 0.01) throw new Error("winding-physics: Ferreira low-frequency limits");
  if (Math.abs((2 * hi.FR) / (10e-3 / (4 * delta(1e6, 100)) + 0.25) - 1) > 0.02) throw new Error("winding-physics: Ferreira skin asymptote");
}
// E65: primary-referred leakage of a concentric S1–P–S2 interleave (1-D MMF energy, Rogowski factor taken as 1 —
// conservative-high). MMF 0 → NI/2 across S1, flat over the barrier gap, → −NI/2 across P, flat, → 0 across S2:
// L = µ0·N²·MLT/(4·b) · (gap1 + gap2 + (hS1 + hP + hS2)/3). Winding breadth b along the leg, build heights h radial.
export const leakageSPS = ({ N, mlt, b, hS, hP, gap }) => (MU0 * N * N * mlt) / (4 * b) * (2 * gap + (2 * hS + hP) / 3);
