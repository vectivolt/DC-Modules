/* ctl.c — see ctl.h. */
#include "ctl.h"
#include "fsm.h"
#include <math.h>

static float fin0(float x) { return isfinite(x) ? x : 0.0f; }
static float clampf(float x, float lo, float hi) { return x < lo ? lo : (x > hi ? hi : x); }
static float slew(float x, float tgt, float up, float dn) { return tgt > x ? fminf(tgt, x + up) : fmaxf(tgt, x - dn); }

void pmp_ctl_cfg_default(pmp_ctl_cfg_t *c, uint16_t kw) {
  c->p_rated_w = (kw == 50u) ? 50000.0f : (kw == 40u) ? 40000.0f : 30000.0f;
  c->i_rated_a = (kw == 50u) ? 166.7f : (kw == 40u) ? 133.3f : 100.0f;   /* = fsm.c i_rated_a */
  c->v_min_v = 150.0f;
  c->ramp_v_vps = 500.0f;       /* 0 → 750 V in 1.5 s (TonHe TH750 publishes a 2–4 s soft start) */
  c->ramp_i_aps = 1000.0f;      /* 10 → 90 % of 166.7 A in 0.13 s */
  c->droop_ohm = 0.0f;          /* accuracy first; the share trim equalizes paralleled modules */
  c->trim_max_frac = 0.01f;
  /* E82 (M-33): the trim loop must be slower than the peers it listens to. A module in CV is a near-ideal voltage source, so
     its share of the load moves by 1/R_series — busbar, DOUT and shunt, 5–15 mΩ — per volt of trim: at 0.5 V/(A·s) the loop
     crossed over near 8 Hz against peer currents that arrive every 200 ms (VMP TLM_SHARE) or 500 ms (TonHe), which is a
     hunting loop, not a sharing one. 0.002 still answers a 10 A mismatch in a few seconds, far faster than any CV taper,
     and is slow enough for the SLOWER of the two profiles, so it needs no profile plumbing. */
  c->trim_rate_vpas = 0.002f;
}

void pmp_ctl_init(pmp_ctl_t *s) { *s = (pmp_ctl_t){0}; }

void pmp_ctl_step(pmp_ctl_t *s, const pmp_ctl_cfg_t *c, const pmp_ctl_in_t *in, float dt) {
  float vout = fmaxf(fin0(in->v_out), 0.0f), iout = fin0(in->i_out);
  float k_in = clampf(fin0(in->vin_ll) / PMP_CTL_VIN_FULL_V, 0.0f, 1.0f);   /* E1: full power from 330 VAC, constant current below */
  /* E82 (C-11): the NTC ladder (in->derate) cannot see a die that runs 80–170 K over a cool sink — phase shift at low
     output voltage, the 500 V series corner, low line on a high link. The HAL's junction observer folds for those; it
     multiplies the availability the charge controller is TOLD, and reads as a thermal derate. */
  float die = clampf(fin0(in->die_fold), 0.0f, 1.0f);
  float der = clampf(fin0(in->derate), 0.0f, 1.0f) * (1.0f - die);
  s->i_avail = c->i_rated_a * der * k_in;
  s->p_avail = c->p_rated_w * der * k_in;
  s->derate_why = (uint16_t)((((in->fsm_warn & PMP_W_DERATE_TH) || die > 0.0f) ? PMP_DR_THERMAL : 0u) |
                             ((in->fsm_warn & PMP_W_DERATE_FAN) ? PMP_DR_FAN : 0u) | (k_in < 1.0f ? PMP_DR_INPUT : 0u));
  float p_cmd = (isfinite(in->p_set) && in->p_set >= 0.0f) ? in->p_set : INFINITY;
  s->p_lim = fminf(s->p_avail, p_cmd);
  /* the power limits become current limits at the measured output voltage; below half the knee the rated current binds
     first, so that floor is also the divide-by-zero guard */
  float v_p = fmaxf(vout, 0.5f * c->p_rated_w / c->i_rated_a);
  float tgt = (isfinite(in->i_set) && in->i_set > 0.0f) ? in->i_set : 0.0f;
  uint8_t lim = PMP_LIM_CC;
  if (s->i_avail < tgt) { tgt = s->i_avail; lim = PMP_LIM_AVAIL; }
  if (s->p_avail / v_p < tgt) { tgt = s->p_avail / v_p; lim = PMP_LIM_CP_AVAIL; s->derate_why |= PMP_DR_CP; }
  if (p_cmd / v_p < tgt) { tgt = p_cmd / v_p; lim = PMP_LIM_CP; s->derate_why |= PMP_DR_P_CMD; }
  if (in->grp_active) {
    float g = fmaxf(fin0(in->grp_share_a), 0.0f);
    if (g < tgt) { tgt = g; lim = PMP_LIM_GROUP; s->derate_why |= PMP_DR_GROUP; }
  }
  if (in->stop_ramp) { tgt = 0.0f; lim = PMP_LIM_STOP; }
  s->i_tgt = tgt;

  /* voltage target: the command clamped to the mode window, plus the share trim, less the droop */
  float vmax = clampf(fin0(in->v_max_mode), 0.0f, PMP_CTL_VMAX_ABS);
  float v_cmd = (isfinite(in->v_set) && in->v_set > 0.0f) ? clampf(in->v_set, fminf(c->v_min_v, vmax), vmax) : 0.0f;
  /* CV share trim: only while this module regulates voltage and its peers' average is meaningful. The errors of all members
     sum to zero, so the group voltage does not drift; the clamp bounds a lone module's authority; without data it decays. */
  bool trim_on = in->en && !in->stop_ramp && in->cv_active && in->peer_n >= 2 && isfinite(in->peer_avg_a)
              && in->peer_avg_a > PMP_CTL_TRIM_MIN_FRAC * c->i_rated_a;
  if (trim_on) s->trim_v += c->trim_rate_vpas * (in->peer_avg_a - iout) * dt;
  else s->trim_v -= s->trim_v * fminf(dt / PMP_CTL_TRIM_DECAY_S, 1.0f);
  float tmax = c->trim_max_frac * v_cmd;
  s->trim_v = clampf(fin0(s->trim_v), -tmax, tmax);
  s->trim_active = trim_on;
  /* E80 (review R34): the FINAL target is clamped to the mode window — the share trim's +1 % authority otherwise
     carried the command past the ceiling (505 V in LOW) after the earlier clamp had already run */
  s->v_tgt = (v_cmd > 0.0f) ? clampf(v_cmd + s->trim_v - c->droop_ohm * fmaxf(iout, 0.0f), 0.0f, vmax) : 0.0f;

  if (!in->en) {   /* idle: the references wait at the output node, so the next start is bumpless */
    s->v_ref = fminf(vout, s->v_tgt); s->i_ref = 0.0f; s->was_en = false; s->limiter = PMP_LIM_NONE;
    return;
  }
  if (!s->was_en) { s->v_ref = fminf(vout, s->v_tgt); s->i_ref = 0.0f; s->was_en = true; }   /* soft start from the node */
  s->v_ref = slew(fin0(s->v_ref), s->v_tgt, c->ramp_v_vps * dt, 2.0f * c->ramp_v_vps * dt);
  s->i_ref = slew(fin0(s->i_ref), tgt, c->ramp_i_aps * dt, c->i_rated_a / PMP_CTL_STOP_S * dt);
  s->limiter = in->cv_active ? PMP_LIM_CV : (s->i_ref < tgt - 0.01f * c->i_rated_a ? PMP_LIM_RAMP : lim);
}

void pmp_reg_cfg_default(pmp_reg_cfg_t *c) {
  /* placeholders with the right structure — tuned per rating on the HIL rig (firmware-architecture §5.4). E79: the E78 values
     (2 / 200 · 0.5 / 500) drove the tank to 564 A during a soft start and limit-cycled 81 A peak to peak into a 0.1 Ω battery on
     the cycle-by-cycle 50 kW tank (firmware/test/hal_test.c). A stiff battery puts ~70 per-unit of current on one unit of demand,
     so the current proportional gain must stay far below 1/70. These keep the tank under F.11 and the battery current within a
     few amps; the §5.5 transient targets remain HIL work. */
  /* E82 (M-30): these stay as the HIL and the cycle-by-cycle plant validated them. The loop gain is held constant instead
     by the caller, which scales v_scale by llc_t.k_norm — the modulator's own sensitivity at the operating point — so that
     (kp_v + ki_v·dt/2)·(dV/du)/v_scale is ≈ 0.355 (9 dB of gain margin) everywhere rather than 0.03 … 1.23. */
  c->kp_v = 0.5f; c->ki_v = 150.0f;
  c->kp_i = 0.01f; c->ki_i = 40.0f;
  c->tt_s = 1.0e-3f;
  c->skip_hi_frac = 0.03f; c->skip_hi_v = 5.0f; c->skip_lo_frac = 0.01f;
}

void pmp_reg_reset(pmp_reg_t *r) { *r = (pmp_reg_t){0}; }

float pmp_reg_step(pmp_reg_t *r, const pmp_reg_cfg_t *c, bool en, float v_ref, float i_ref, float v, float i,
                   float v_scale, float i_scale, float dt) {
  if (!en || !isfinite(v_ref) || !isfinite(i_ref) || !isfinite(v) || !isfinite(i) || !(v_scale > 0.0f) || !(i_scale > 0.0f)
      || !(dt > 0.0f) || !(c->tt_s > 0.0f) || !isfinite(r->xv) || !isfinite(r->xi)) { pmp_reg_reset(r); return 0.0f; }
  float ev = (v_ref - v) / v_scale, ei = (i_ref - i) / i_scale;
  float uv = c->kp_v * ev + r->xv, ui = c->kp_i * ei + r->xi;
  bool cv = uv <= ui;
  float u = clampf(cv ? uv : ui, 0.0f, 1.0f);
  if (v > v_ref * (1.0f + c->skip_hi_frac) + c->skip_hi_v) r->skip = true;
  else if (v < v_ref * (1.0f + c->skip_lo_frac)) r->skip = false;
  if (r->skip) u = 0.0f;
  /* back-calculation: both integrators are pulled toward the applied demand at 1/tt. For the selected loop the pull is zero
     unless the demand is clamped or skipped (anti-windup); the idle loop settles tt·ki·error above the applied demand, so it
     takes over exactly where its own limit is reached */
  float g = fminf(dt / c->tt_s, 1.0f);
  r->xv += c->ki_v * ev * dt + (u - uv) * g;
  r->xi += c->ki_i * ei * dt + (u - ui) * g;
  r->xv = clampf(r->xv, -1.0f, 2.0f);
  r->xi = clampf(r->xi, -1.0f, 2.0f);
  r->u = u; r->cv = cv;
  return u;
}
