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
  /* E81 ZVS constants — calculations/llc/tanks.mjs TANKS[sku] (n, Lm, cs, par) and DIES["23m"].qoss800 */
  c->n = 2.0f;
  c->lm_h = (kw == 50u) ? 35.6e-6f : (kw == 40u) ? 43.5e-6f : 56.0e-6f;
  c->cs_f = (kw == 30u) ? 330.0e-12f : (kw == 40u) ? 680.0e-12f : 1000.0e-12f;   /* E81 close-out: tanks.mjs cs 330 / 680 / 1000 pF */
  c->qoss800_c = 371.0e-9f;
  c->par = (kw == 30u) ? 1u : 2u;
}

/* E81 (F-E-01): continuous instead of ceil-to-grid. The table is a conservative UPPER envelope, so the curve has to stay
   at or above the grid point ABOVE q (the ceil value) — interpolating between the two points below would dip under the
   true boundary in the table's concave region. Interpolating between ceil(q) and ceil(q)+1 keeps exactly the ceil form's
   conservatism while removing its up-to-0.11·fr ≈ 15 kHz steps, which is what made f_min jump. */
float llc_zvs_fn(float q) {
  if (isnan(q)) return ZVS_FN[23];
  if (q <= 0.0f) return ZVS_FN[0];
  if (q <= 1.0f) {
    float x = q * 20.0f;
    int k = (int)x;
    if (k >= 20) return ZVS_FN[20];
    return ZVS_FN[k + 1] + (x - (float)k) * (ZVS_FN[k + 2 > 23 ? 23 : k + 2] - ZVS_FN[k + 1]);
  }
  if (q <= 1.5f) return ZVS_FN[22] + (q - 1.0f) * 2.0f * (ZVS_FN[23] - ZVS_FN[22]);
  return ZVS_FN[23];
}

/* E81: the ZVS transition this operating point needs (llc.h). f is the frequency actually commanded, so the schedule
   follows PSM (f_max, the weakest magnetizing current) as well as PFM. */
#define LLC_ITOFF_PFM_K 1.2f   /* E81: PFM turn-off current ≈ 1.2 × tank rms above resonance (deck: 0.6–0.9 × peak) */
#define LLC_ITOFF_PSM_K 1.6f   /* E81: the shifted leg turns off at the PSM tank peak (crest ≈ 1.6 × rms) */
static float zvs_dead_s(const llc_cfg_t *c, float f_hz, float v_bank, float v_bus, float i_comm) {
  if (!(isfinite(v_bus) && v_bus > 1.0f) || !(f_hz > 1.0f) || !(c->lm_h > 0.0f)) return LLC_DT_MAX_S;
  float vb = isfinite(v_bank) ? fabsf(v_bank) : 0.0f;
  float im = c->n * vb / (4.0f * f_hz * c->lm_h);              /* magnetizing peak, A — the floor of any leg's commutation current */
  float ic = fmaxf(im, (isfinite(i_comm) && i_comm > 0.0f) ? i_comm : 0.0f);   /* E81: the leg's own commutation current */
  float qoss = c->qoss800_c * sqrtf(v_bus * 0.00125f);          /* 3·Eoss/V on the Eoss ∝ V^1.5 curve */
  float t = LLC_DT_K * (float)c->par * (qoss + c->cs_f * v_bus) / fmaxf(ic, 1.0f);
  if (!isfinite(t) || t > LLC_DT_MAX_S) return LLC_DT_MAX_S;
  return (t < LLC_DT_MIN_S) ? LLC_DT_MIN_S : t;
}

void llc_step(llc_t *l, const llc_cfg_t *c, bool en, float u, float v_bank, float p_out, float v_bus) {
  float vb = fmaxf(isfinite(v_bank) ? v_bank : 0.0f, 50.0f);
  float p = (isfinite(p_out) && p_out > 0.0f) ? p_out : 0.0f;
  l->q = c->z0_ohm * p / (3.2423f * vb * vb);   /* Z0 / Rac with Rac = (8 n² / π²) · Vbank² / P, n = 2 (llc-design.mjs) */
  /* E81 (F-E-01): the ZVS guard's load estimate rises INSTANTLY and decays over ~10 ms. Losing ZVS is a hard failure, so
     a step into a heavier load must raise the floor on the same call; only the way back down is filtered, which is what
     stops the load estimate from chattering the floor. */
  l->q_f = fmaxf(l->q, l->q_f + (l->q - l->q_f) * 0.01f);
  float f_floor = c->fn_floor * c->fr_hz;       /* the map's endpoint is FIXED — the guard is a clamp, not the endpoint */
  l->f_min_hz = fmaxf(f_floor, 1.03f * llc_zvs_fn(l->q_f) * c->fr_hz);
  float f_max = c->fn_max * c->fr_hz;
  float irms = (isfinite(l->in_i_rms) && l->in_i_rms > 0.0f) ? l->in_i_rms : 0.0f;   /* E81: measured tank rms, 0 = unknown */
  if (!en || !isfinite(u)) {
    l->gate = false; l->burst = false; l->f_hz = f_max; l->duty = 0.0f;
    l->dead_a_s = l->dead_b_s = l->dead_s = zvs_dead_s(c, f_max, v_bank, v_bus, 0.0f);
    return;
  }
  u = (u < 0.0f) ? 0.0f : (u > 1.0f ? 1.0f : u);
  if (u >= c->u_psm) {
    l->duty = 1.0f;
    l->f_hz = fmaxf(f_max - (u - c->u_psm) / (1.0f - c->u_psm) * (f_max - f_floor), l->f_min_hz);
  } else { l->duty = u / c->u_psm; l->f_hz = f_max; }
  /* E81 per-leg schedule (G deck, F-C-7): in PSM leg A commutates on I_m alone and leg B (the shifted leg) near the tank peak
     (crest ≈ 1.6 × rms); in PFM both legs turn off at the same current, ≈ 1.2 × rms above resonance. The measured rms only
     SHORTENS a leg's dead time (I_m is the floor inside zvs_dead_s), so an unknown rms degrades to the long, safe value. */
  bool psm = l->duty < 1.0f;
  l->dead_a_s = zvs_dead_s(c, l->f_hz, v_bank, v_bus, psm ? 0.0f : LLC_ITOFF_PFM_K * irms);
  l->dead_b_s = zvs_dead_s(c, l->f_hz, v_bank, v_bus, (psm ? LLC_ITOFF_PSM_K : LLC_ITOFF_PFM_K) * irms);
  l->dead_s = fmaxf(l->dead_a_s, l->dead_b_s);
  if (!(v_bank >= 100.0f)) { l->burst = false; l->gate = l->duty > 0.0f; }   /* a discharged output: continuous phase shift */
  else {
    /* E81 (F-E-08): the packet is bounded at the SETPOINT, not at the duty. Stopping the bridge purely on duty parked the
       output up to +2.9 % high with 4 % pk-pk burst ripple on the drawn 9.4–40.2 µF film bank (the 200 µF test plant hid
       it: the error scales as 1/C). With a reference in hand the bridge only stops once the node has reached it. */
    if (l->duty < c->d_min && (!(l->in_v_ref > 0.0f) || v_bank >= l->in_v_ref)) l->burst = true;
    else if (l->duty >= c->d_on) l->burst = false;
    l->gate = !l->burst;
  }
}
