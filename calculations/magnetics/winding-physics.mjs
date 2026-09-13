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
// E65: primary-referred leakage of a concentric S1–P–S2 interleave (1-D MMF energy, Rogowski factor taken as 1 —
// conservative-high). MMF 0 → NI/2 across S1, flat over the barrier gap, → −NI/2 across P, flat, → 0 across S2:
// L = µ0·N²·MLT/(4·b) · (gap1 + gap2 + (hS1 + hP + hS2)/3). Winding breadth b along the leg, build heights h radial.
export const leakageSPS = ({ N, mlt, b, hS, hP, gap }) => (MU0 * N * N * mlt) / (4 * b) * (2 * gap + (2 * hS + hP) / 3);
