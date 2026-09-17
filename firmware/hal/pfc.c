/* pfc.c — see pfc.h. */
#include "pfc.h"
#include <math.h>

static float clampf(float x, float lo, float hi) { return x < lo ? lo : (x > hi ? hi : x); }

void pfc_cfg_default(pfc_cfg_t *c, uint16_t kw) {
  /* Derivation (30 / 40 / 50 kW): D1 L(i) on the Kool Mµ 26 roll-off at the clamp crest 74.5 / 61.2 / 46.0 µH
     (vienna-switched.mjs D1 table); voltage loop Gv = η / (s·C·Vbus) on the drawn link 1.175 / 1.41 / 1.88 mF at 800 V,
     15 Hz with a PI zero for 65° (the pfc-control.mjs method, in watts) */
  c->kp_i = (kw == 50u) ? 0.866f : (kw == 40u) ? 1.154f : 1.405f;
  c->kp_v = (kw == 50u) ? 133.0f : (kw == 40u) ? 99.8f : 83.2f;
  c->ki_v = (kw == 50u) ? 5850.0f : (kw == 40u) ? 4390.0f : 3660.0f;
  c->i_clamp = (kw == 50u) ? 134.6f : (kw == 40u) ? 107.7f : 80.8f;
  c->p_clamp_w = 404.1f * c->i_clamp;   /* 54.4 / 43.5 / 32.6 kW = 1.05 × rated / 0.965 */
  c->i_lim_a = 0.15f * c->i_clamp;
  c->k_step = (kw == 50u) ? 0.326f : (kw == 40u) ? 0.245f : 0.201f;   /* 15 µs / 46.0 · 61.2 · 74.5 µH */
  c->k_mid = 0.5f;
  c->tau_v = 114.6e-6f;   /* (11.5 k ∥ 3.8 M) · 10 nF — pfc-control.mjs TAUV */
  c->ramp_vps = 250.0f;
  /* The skip band must stay well under F.03: bus_ref_for() returns the 830 V cap for any bank at or above 395 V — a
     400 V output in PAR, an 800 V one in SER, i.e. most real charging — which leaves 30 V to the 860 V trip, so a 15 V
     band would spend half of it before any dynamics. 9 V is still nine times the link's own ripple. */
  c->skip_v = 9.0f;
  c->eta_llc = 0.975f;
  c->on_min = 0.01f;      /* 200 ns at 50 kHz */
}

void pfc_reset(pfc_t *p) { *p = (pfc_t){0}; }

void pfc_step(pfc_t *p, const pfc_cfg_t *c, const pfc_ref_t *r, const float i[3], const float v[3], float vp, float vn,
              float p_load_w, float dt) {
  float vbus = vp + vn;
  if (!r->en || !(vp > 50.0f) || !(vn > 50.0f) || !isfinite(vbus) || !isfinite(i[0] + i[1] + i[2]) ||
      !isfinite(v[0] + v[1] + v[2]) || !isfinite(r->vbus_ref) || !isfinite(r->w_line)) { pfc_reset(p); return; }
  if (!p->run) { p->run = true; p->vref = vbus; p->ivp = 1.0f / vp; p->ivn = 1.0f / vn; }

  float s = 0.6667f * (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);   /* balanced set: the phase crest² */
  p->vpk2 = (s > p->vpk2) ? s : p->vpk2 + (s - p->vpk2) * fminf(dt * 200.0f, 1.0f);   /* falls in 5 ms */
  float vpk = sqrtf(fmaxf(p->vpk2, 2500.0f)), inv_vpk = 1.0f / vpk;
  p->vnom = (vpk > p->vnom) ? vpk : p->vnom + (vpk - p->vnom) * fminf(dt * 0.5f, 1.0f);   /* falls in 2 s */

  float up = c->ramp_vps * dt;
  p->vref = (r->vbus_ref > p->vref) ? fminf(r->vbus_ref, p->vref + up) : fmaxf(r->vbus_ref, p->vref - 2.0f * up);
  float e = p->vref - vbus;
  /* power command: the LLC's input power, then the PI on the bus error; the amplitude is P / (1.5 · Vpk) */
  float ff = fmaxf(isfinite(p_load_w) ? p_load_w : 0.0f, 0.0f) / c->eta_llc;
  /* A load dump (an EV opening its contactor at full power — a normal end-of-session event) collapses the
     feed-forward within one 100 µs LLC pass, but the integrator still holds the whole pre-dump correction and unwinds only
     at ki_v·e ≈ 55 kW/s, so unbounded the stage keeps pushing while the bus climbs into the LATCHING 860 V F.03. The feed-forward is
     the honest estimate of what the load now takes, so while the bus is ABOVE its reference the integrator may not claim
     more than a fifth of rated on top of it. It is a ceiling, not a reset: a real load step keeps ff large and is untouched,
     and the ordinary negative-error unwind is unchanged. */
  if (e < 0.0f) p->xi = fminf(p->xi, 0.2f * c->p_clamp_w);
  float p_cmd = ff + c->kp_v * e + p->xi;
  float k_i = 0.6667f * inv_vpk;
  float i_max = fminf(fminf(c->i_clamp, c->p_clamp_w * k_i), fmaxf(1.1f * c->i_clamp - c->k_step * (p->vnom - vpk), 0.0f));
  p->skip = e < -c->skip_v;
  if (p->burst) { if (e > 2.0f) p->burst = false; }
  else if (p_cmd < 0.02f * c->p_clamp_w && e < -3.0f) p->burst = true;
  bool off = p->skip || p->burst;
  bool hi = p_cmd * k_i >= i_max, lo = p_cmd <= 0.0f;
  if (++p->vdiv >= 10u) {   /* conditional integration: frozen while off, or while the limit holds against the error */
    p->vdiv = 0u;
    p->ivp = 1.0f / vp; p->ivn = 1.0f / vn;
    if (!off && !(hi && e > 0.0f) && !(lo && e < 0.0f))
      p->xi = clampf(p->xi + c->ki_v * e * 10.0f * dt, -1.5f * c->p_clamp_w, 1.5f * c->p_clamp_w);
  }
  if (p->skip) p->xi = fminf(p->xi, 0.0f);
  p->clamp = hi;
  p->i_pk = off ? 0.0f : clampf(p_cmd * k_i, 0.0f, i_max);
  if (off) { p->on[0] = p->on[1] = p->on[2] = 0.0f; return; }

  float g = p->i_pk * inv_vpk;                                /* resistive emulation, A per V */
  float k = r->w_line * c->tau_v * 0.57735f;                  /* (v_c − v_b)/√3 leads v_a by 90° in a balanced set */
  float vc[3] = { v[0] + k * (v[2] - v[1]), v[1] + k * (v[0] - v[2]), v[2] + k * (v[1] - v[0]) };
  float ref[3], vs[3];
  for (int n = 0; n < 3; n++) {
    ref[n] = clampf(g * vc[n], -i_max, i_max);
    vs[n] = vc[n] - c->kp_i * (ref[n] - i[n]);
  }
  float v0 = -0.5f * (fmaxf(fmaxf(vs[0], vs[1]), vs[2]) + fminf(fminf(vs[0], vs[1]), vs[2])) - c->k_mid * (vp - vn);
  float i_sgn = 0.02f * c->i_clamp;
  for (int n = 0; n < 3; n++) {
    float vk = vs[n] + v0;
    bool pos = (fabsf(i[n]) > i_sgn ? i[n] : vc[n]) >= 0.0f;   /* the rail is the current's; too small to sign: the voltage's */
    float on = 1.0f - clampf(pos ? vk * p->ivp : -vk * p->ivn, 0.0f, 1.0f);
    if (fabsf(i[n]) > fabsf(ref[n]) + c->i_lim_a) on = 0.0f;   /* LIMIT: the rail against the current this update */
    p->on[n] = (on < c->on_min) ? 0.0f : (on > 1.0f - c->on_min) ? 1.0f : on;
  }
}
