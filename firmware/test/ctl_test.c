/* ctl_test.c — E78 verification of core/ctl.c.
 *   shaper:    soft start, bumpless start into a battery, current slew, the controlled-stop ramp, constant power above the
 *              knee, the controller power limit, the divide guard, E1 input derate, derate attribution, the group share,
 *              the CV share trim (rate, clamp, decay, frozen in CC), mode-window clamps, NaN containment
 *   regulator: bounds under fuzz, no windup after long saturation, bumpless CV→CC takeover at the limit, skip hysteresis
 * What this does NOT prove: loop stability and transient numbers on the real LLC — those are HIL/EVT criteria
 * (docs/firmware-verification.md C-rows). Build/run: firmware/run_tests.sh */
#include "../core/ctl.h"
#include "../core/fsm.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>

static int checks = 0, fails = 0;
static void ck(const char *name, int cond) {
  checks++;
  if (!cond) { fails++; printf("FAIL %s\n", name); } else printf("PASS %s\n", name);
}
static int near(float a, float b, float tol) { return fabsf(a - b) <= tol; }

static pmp_ctl_in_t base(void) {
  pmp_ctl_in_t in = {0};
  in.en = true; in.v_set = 400.0f; in.i_set = 100.0f; in.p_set = -1.0f; in.v_max_mode = 500.0f; in.derate = 1.0f;
  in.vin_ll = 400.0f; in.peer_avg_a = NAN;
  return in;
}

int main(void) {
  const float dt = 1.0e-3f;
  pmp_ctl_cfg_t c; pmp_ctl_cfg_default(&c, 50);
  pmp_ctl_t s; pmp_ctl_in_t in;

  /* ---------------- shaper ---------------- */
  { pmp_ctl_init(&s); in = base(); int ok = 1; float t_at = -1.0f;
    for (int k = 1; k <= 1200; k++) {
      pmp_ctl_step(&s, &c, &in, dt);
      if (s.v_ref > 500.0f * (float)k * dt + 0.01f) ok = 0;
      if (t_at < 0.0f && s.v_ref >= 400.0f - 1e-3f) t_at = (float)k * dt;
    }
    ck("shaper: soft start rises no faster than 500 V/s and settles on the command", ok && near(s.v_ref, 400.0f, 1e-3f) && t_at > 0.79f && t_at < 0.82f); }

  { pmp_ctl_init(&s); in = base(); in.v_out = 380.0f; pmp_ctl_step(&s, &c, &in, dt);
    ck("shaper: a start into a 380 V battery begins at the battery, not at 0 V", near(s.v_ref, 380.5f, 0.01f) && s.i_ref <= 1.0f + 1e-3f); }

  { pmp_ctl_init(&s); in = base(); in.v_out = 250.0f; in.i_set = 200.0f; int ok = 1; float prev = 0.0f;
    for (int k = 0; k < 200; k++) { pmp_ctl_step(&s, &c, &in, dt); if (s.i_ref - prev > 1.0f + 1e-3f) ok = 0; prev = s.i_ref; }
    ck("shaper: current rises at ≤ 1000 A/s to the rated 166.7 A (availability binds)", ok && near(s.i_ref, 166.7f, 0.01f) && s.limiter == PMP_LIM_AVAIL);
    in.stop_ramp = true; int n = 0, mono = 1; prev = s.i_ref;
    while (s.i_ref > 0.0f && n < 1000) { pmp_ctl_step(&s, &c, &in, dt); if (s.i_ref > prev) mono = 0; prev = s.i_ref; n++; }
    ck("shaper: the controlled stop takes rated current to 0 inside 80 ms, monotonically", n <= 81 && mono && s.limiter == PMP_LIM_STOP); }

  { pmp_ctl_init(&s); in = base(); in.v_set = 700.0f; in.v_max_mode = 1000.0f; in.v_out = 600.0f; in.i_set = 200.0f;
    pmp_ctl_step(&s, &c, &in, dt);
    ck("shaper: above the knee the rated power binds (50 kW / 600 V = 83.3 A)", near(s.i_tgt, 83.33f, 0.02f) && (s.derate_why & PMP_DR_CP)); }

  { pmp_ctl_init(&s); in = base(); in.v_out = 400.0f; in.p_set = 20000.0f; pmp_ctl_step(&s, &c, &in, dt);
    ck("shaper: the controller's power limit binds (20 kW / 400 V = 50 A)", near(s.i_tgt, 50.0f, 0.01f) && (s.derate_why & PMP_DR_P_CMD)); }

  { pmp_ctl_init(&s); in = base(); in.v_out = 0.0f; in.i_set = 500.0f; pmp_ctl_step(&s, &c, &in, dt);
    int ok0 = near(s.i_tgt, 166.7f, 0.01f);
    in.v_out = NAN; pmp_ctl_step(&s, &c, &in, dt);
    ck("shaper: 0 V or NaN at the output cannot divide the power limit into an unbounded current", ok0 && near(s.i_tgt, 166.7f, 0.01f) && isfinite(s.v_ref)); }

  { pmp_ctl_init(&s); in = base(); in.vin_ll = 300.0f; pmp_ctl_step(&s, &c, &in, dt);
    int ok = near(s.i_avail, 166.7f * 300.0f / 330.0f, 0.02f) && (s.derate_why & PMP_DR_INPUT);
    in.vin_ll = NAN; pmp_ctl_step(&s, &c, &in, dt);
    ck("shaper: E1 input derate below 330 VAC; an unreadable line gives no availability", ok && s.i_avail == 0.0f); }

  { pmp_ctl_init(&s); in = base(); in.derate = 0.6f; in.fsm_warn = PMP_W_DERATE_TH; pmp_ctl_step(&s, &c, &in, dt);
    ck("shaper: FSM thermal derate 0.6 → 100 A available, reason THERMAL", near(s.i_avail, 100.02f, 0.02f) && (s.derate_why & PMP_DR_THERMAL)); }

  { pmp_ctl_init(&s); in = base(); in.v_set = NAN; in.i_set = INFINITY; in.p_set = NAN; in.derate = NAN;
    for (int k = 0; k < 10; k++) pmp_ctl_step(&s, &c, &in, dt);
    ck("shaper: NaN / Inf commands and derate give zero targets and finite references", s.v_tgt == 0.0f && s.i_tgt == 0.0f && isfinite(s.v_ref) && isfinite(s.i_ref)); }

  { pmp_ctl_init(&s); in = base(); in.grp_active = true; in.grp_share_a = 50.0f; pmp_ctl_step(&s, &c, &in, dt);
    ck("shaper: the group share binds and is named", near(s.i_tgt, 50.0f, 1e-3f) && (s.derate_why & PMP_DR_GROUP)); }

  { pmp_ctl_init(&s); in = base(); in.v_set = 700.0f; pmp_ctl_step(&s, &c, &in, dt); float hi = s.v_tgt;
    in.v_set = 50.0f; pmp_ctl_step(&s, &c, &in, dt);
    ck("shaper: the voltage command is clamped to the mode window (PAR 500 V) and to the 150 V floor", near(hi, 500.0f, 1e-3f) && near(s.v_tgt, 150.0f, 1e-3f)); }

  { pmp_ctl_init(&s); in = base(); in.v_out = 400.0f; in.i_out = 80.0f; in.cv_active = true; in.peer_n = 3; in.peer_avg_a = 100.0f;
    for (int k = 0; k < 100; k++) pmp_ctl_step(&s, &c, &in, dt);
    int rate = near(s.trim_v, 1.0f, 0.05f) && s.trim_active;
    for (int k = 0; k < 20000; k++) pmp_ctl_step(&s, &c, &in, dt);
    int clamp = near(s.trim_v, 4.0f, 1e-3f) && near(s.v_tgt, 404.0f, 1e-3f);
    in.cv_active = false; float before = s.trim_v;
    for (int k = 0; k < 1000; k++) pmp_ctl_step(&s, &c, &in, dt);
    int frozen = s.trim_v < before && !s.trim_active;
    in.cv_active = true; in.peer_avg_a = NAN;
    for (int k = 0; k < 5000; k++) pmp_ctl_step(&s, &c, &in, dt);
    ck("shaper: share trim integrates at 0.5 V/(A·s), clamps at 1 %, decays in CC and without peer data",
       rate && clamp && frozen && s.trim_v > 1.0f && s.trim_v < 1.4f); }

  /* ---------------- regulator kernel ---------------- */
  pmp_reg_cfg_t rc; pmp_reg_cfg_default(&rc);
  pmp_reg_t r;
  const float rdt = 1.0e-4f, VS = 1000.0f, IS = 166.7f;

  { pmp_reg_reset(&r); srand(7); int bad = 0;
    for (int k = 0; k < 200000; k++) {
      float vals[4];
      for (int j = 0; j < 4; j++) { int p = rand() % 50; vals[j] = p == 0 ? NAN : p == 1 ? INFINITY : (float)(rand() % 2400) - 200.0f; }
      float u = pmp_reg_step(&r, &rc, rand() % 16 != 0, vals[0], vals[1], vals[2], vals[3], VS, IS, rdt);
      if (!(u >= 0.0f && u <= 1.0f) || !isfinite(r.xv) || !isfinite(r.xi) || r.xv < -1.0f || r.xv > 2.0f || r.xi < -1.0f || r.xi > 2.0f) bad++;
    }
    ck("regulator: 200 k fuzzed steps (NaN, Inf, disable) keep u in [0,1] and the integrators bounded", bad == 0); }

  { /* a stiff battery 100 V below the voltage target; the current loop holds 100 A on a current-source plant (i = 200·u) */
    pmp_reg_reset(&r); float i = 0.0f;
    for (int k = 0; k < 50000; k++) { float u = pmp_reg_step(&r, &rc, true, 500.0f, 100.0f, 400.0f, i, VS, IS, rdt); i = 200.0f * u; }
    float u0 = r.u; int held_cc = !r.cv && near(i, 100.0f, 0.5f);
    float u1 = pmp_reg_step(&r, &rc, true, 500.0f, 100.0f, 510.0f, i, VS, IS, rdt);
    /* no windup: the demand falls by the CV loop's proportional kick at once, less its settled headroom tt · ki · error */
    float kick = rc.kp_v * (510.0f - 400.0f) / VS - rc.tt_s * rc.ki_v * (500.0f - 400.0f) / VS;
    ck("regulator: after 5 s current-limited far below the voltage target, an overshoot hands to CV in one step (no windup)",
       held_cc && r.cv && kick > 0.0f && u1 < u0 - 0.5f * kick); }

  { pmp_reg_reset(&r); r.xv = 0.4f; r.xi = 0.55f;   /* CV holding 0.4 demand, the current loop at its settled headroom */
    for (int k = 0; k < 2000; k++) pmp_reg_step(&r, &rc, true, 400.0f, 100.0f, 400.0f, 50.0f, VS, IS, rdt);
    float i = 50.0f, prev_u = r.u, max_du = 0.0f, i_take = -1.0f;
    for (int k = 0; k < 8000; k++) {
      i += 0.01f;
      float u = pmp_reg_step(&r, &rc, true, 400.0f, 100.0f, 400.0f, i, VS, IS, rdt);
      if (fabsf(u - prev_u) > max_du) max_du = fabsf(u - prev_u);
      if (i_take < 0.0f && !r.cv) i_take = i;
      prev_u = u;
    }
    ck("regulator: a current creeping past its limit takes over within 1 A of the limit, without a demand step",
       i_take > 99.0f && i_take < 101.0f && max_du < 0.002f && r.u < 0.4f); }

  { pmp_reg_reset(&r); r.xv = 0.3f; r.xi = 0.9f;
    float a = pmp_reg_step(&r, &rc, true, 400.0f, 100.0f, 420.0f, 20.0f, VS, IS, rdt);
    float b = pmp_reg_step(&r, &rc, true, 400.0f, 100.0f, 410.0f, 20.0f, VS, IS, rdt);
    int held = r.skip;
    pmp_reg_step(&r, &rc, true, 400.0f, 100.0f, 403.0f, 20.0f, VS, IS, rdt);
    ck("regulator: skip above 3 % + 5 V, held through the band, released below 1 %", a == 0.0f && b == 0.0f && held && !r.skip); }

  { pmp_reg_reset(&r);
    for (int k = 0; k < 100; k++) pmp_reg_step(&r, &rc, true, 400.0f, 100.0f, 390.0f, 50.0f, VS, IS, rdt);
    float u = pmp_reg_step(&r, &rc, false, 400.0f, 100.0f, 390.0f, 50.0f, VS, IS, rdt);
    ck("regulator: disable returns zero demand and clears both integrators", u == 0.0f && r.xv == 0.0f && r.xi == 0.0f); }

  printf("\nRESULT: %d/%d checks passed\n", checks - fails, checks);
  return fails ? 1 : 0;
}
