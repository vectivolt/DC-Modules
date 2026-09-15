/* llc.c — see llc.h. */
#include "llc.h"
#include <math.h>

/* E79: tolerance-worst ZVS boundary fn for nominal Q = 0, 0.05 … 1.0, then 1.5, 2.0 and Q → ∞ (the series tank alone at
   fr · 1.0526) — monotonic, from Im(Zin) = 0 of the FHA tank over the eight corners; hal_test recomputes and checks it */
static const float ZVS_FN[24] = { 0.3204f, 0.3237f, 0.3340f, 0.3533f, 0.3851f, 0.4401f, 0.5379f, 0.6489f, 0.7407f, 0.8076f,
  0.8558f, 0.8912f, 0.9178f, 0.9383f, 0.9544f, 0.9674f, 0.9779f, 0.9866f, 0.9939f, 1.0000f, 1.0052f, 1.0317f, 1.0408f, 1.0525f };

void llc_cfg_default(llc_cfg_t *c, uint16_t kw) {
  /* tanks.mjs: Lr 5.6 / 4.35 / 3.56 µH · Cr 7 / 9 / 11 × 33 nF → fr 139.9 / 140.0 / 140.0 kHz · Z0 4.924 / 3.827 / 3.132 Ω */
  c->fr_hz = (kw == 30u) ? 139.9e3f : 140.0e3f;
  c->z0_ohm = (kw == 50u) ? 3.132f : (kw == 40u) ? 3.827f : 4.924f;
  c->fn_floor = 0.55f;
  c->fn_max = 1.45f;
  c->u_psm = 0.35f;
  c->d_min = 0.08f;
  c->d_on = 0.12f;
  c->dead_s = 120.0e-9f;
}

float llc_zvs_fn(float q) {   /* the next grid point up: conservative on a rising curve; unknown load = the worst */
  if (isnan(q)) return ZVS_FN[23];
  if (q <= 0.0f) return ZVS_FN[0];
  if (q <= 1.0f) { int k = (int)ceilf(q * 20.0f - 1.0e-4f); return ZVS_FN[k > 20 ? 20 : k]; }
  return (q <= 1.5f) ? ZVS_FN[21] : (q <= 2.0f) ? ZVS_FN[22] : ZVS_FN[23];
}

void llc_step(llc_t *l, const llc_cfg_t *c, bool en, float u, float v_bank, float p_out) {
  float vb = fmaxf(isfinite(v_bank) ? v_bank : 0.0f, 50.0f);
  float p = (isfinite(p_out) && p_out > 0.0f) ? p_out : 0.0f;
  l->q = c->z0_ohm * p / (3.2423f * vb * vb);   /* Z0 / Rac with Rac = (8 n² / π²) · Vbank² / P, n = 2 (llc-design.mjs) */
  l->f_min_hz = fmaxf(c->fn_floor, 1.03f * llc_zvs_fn(l->q)) * c->fr_hz;
  float f_max = c->fn_max * c->fr_hz;
  if (!en || !isfinite(u)) { l->gate = false; l->burst = false; l->f_hz = f_max; l->duty = 0.0f; return; }
  u = (u < 0.0f) ? 0.0f : (u > 1.0f ? 1.0f : u);
  if (u >= c->u_psm) { l->duty = 1.0f; l->f_hz = f_max - (u - c->u_psm) / (1.0f - c->u_psm) * (f_max - l->f_min_hz); }
  else { l->duty = u / c->u_psm; l->f_hz = f_max; }
  if (!(v_bank >= 100.0f)) { l->burst = false; l->gate = l->duty > 0.0f; }   /* a discharged output: continuous phase shift */
  else {
    if (l->duty < c->d_min) l->burst = true;
    else if (l->duty >= c->d_on) l->burst = false;
    l->gate = !l->burst;
  }
}
