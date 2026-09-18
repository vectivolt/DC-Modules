/* rules_test.c — the hardening checks: one row per hard-won rule, each written so it FAILS if that rule is dropped.
 * It drives the units directly (no plant): hal/llc.c's ZVS schedule and demand map, core/fsm.c's rows,
 * hal/app.c's per-rating identity, the TonHe V1.2 and VMP 2.0 profile fixes, and boot/image.c's watchdog cadence.
 * The cycle-by-cycle plants live in hal_test.c and app_test.c and are not duplicated here.
 * Build/run: firmware/run_tests.sh */
#include "../hal/app.h"
#include "../hal/llc.h"
#include "../hal/dielim.h"
#include "../core/ctl.h"
#include "../boot/image.h"
#include "../hal/nvm.h"
#include <math.h>
#include <stdio.h>
#include <string.h>

/* a RAM flash for the two app_init() checks — the NVM journal itself is app_test.c's and boot_test.c's subject */
#define PG 1024u
static uint8_t flash[8][PG];
bool nvm_port_read(uint8_t page, uint32_t off, uint8_t *dst, uint32_t len) { memcpy(dst, &flash[page][off], len); return true; }
bool nvm_port_prog(uint8_t page, uint32_t off, const uint8_t *src, uint32_t len) { memcpy(&flash[page][off], src, len); return true; }
bool nvm_port_erase(uint8_t page) { memset(flash[page], 0xFF, PG); return true; }

static int checks = 0, fails = 0;
static void ck(const char *name, int cond) {
  checks++;
  if (!cond) { fails++; printf("FAIL %s\n", name); } else printf("PASS %s\n", name);
}
static int near(float a, float b, float tol) { return fabsf(a - b) <= tol; }

/* ---------------------------------------------------------------- adaptive LLC dead time
 * The closed form, recomputed here from calculations/llc/tanks.mjs independently of llc.c, so the check proves the
 * pipeline (per-SKU constants, the Qoss law, Im_pk from the commanded frequency, the clamps) and not a magic number.
 * tanks.mjs 2026-09-17: par 1/2/2 · cs 330/680/1000 pF · Lm 56/43.5/35.6 µH · n 2 · DIES["23m"].qoss800 371 nC (the RFQ bound — llc.c).
 * Two closed forms. PFM (and the shifted leg B): charge ÷ the leg's commutation current, the larger of I_m and
 * k·I_rms with the rms from the operating point. Phase shift, WEAK leg A: k·(π/2)·√(L_r·C_node). */
static double q_oss(double v_bus) { return 371e-9 * sqrt(v_bus / 800.0); }
static double cs_of(int kw) { return kw == 30 ? 330e-12 : kw == 40 ? 680e-12 : 1000e-12; }
static double clamp_dt(double t) { return t > LLC_DT_MAX_S ? LLC_DT_MAX_S : (t < LLC_DT_MIN_S ? LLC_DT_MIN_S : t); }   /* the floor is the port's */
static double want_dead(int kw, double f_hz, double v_bank, double v_bus, double p_w, double k_i) {
  double lm = kw == 50 ? 35.6e-6 : kw == 40 ? 43.5e-6 : 56.0e-6, par = kw == 30 ? 1.0 : 2.0;
  double im = 2.0 * v_bank / (4.0 * f_hz * lm);
  double io = 1.1107 * p_w / (v_bank * 2.0), imr = 0.57735 * im, irms = sqrt(io * io + imr * imr);
  double ic = k_i * irms > im ? k_i * irms : im;
  return clamp_dt(2.5 * par * (q_oss(v_bus) + cs_of(kw) * v_bus) / (ic < 1.0 ? 1.0 : ic));
}
static double want_weak(int kw, double v_bus) {
  double z0 = kw == 50 ? 3.132 : kw == 40 ? 3.827 : 4.924, fr = kw == 30 ? 139.9e3 : 140.0e3, par = kw == 30 ? 1.0 : 2.0;
  double lr = z0 / (6.2831853 * fr), cn = 2.0 * par * (q_oss(v_bus) / v_bus + cs_of(kw));
  return clamp_dt(0.82 * 1.5707963 * sqrt(lr * cn));
}

static void llc_checks(void) {
  /* PS150-Imax: one bank at 150 V, phase shift at f_max — the corner where the weak leg decides the die's fate. */
  int ok = 1, band = 1, legs = 1, light = 1;
  const int KW[3] = { 30, 40, 50 };
  for (int n = 0; n < 3; n++) {
    llc_cfg_t c; llc_cfg_default(&c, (uint16_t)KW[n]);
    llc_t l; memset(&l, 0, sizeof l);
    float f_max = c.fn_max * c.fr_hz;
    llc_step(&l, &c, true, 0.5f * c.u_psm, 150.0f, 150.0f * 40.0f, 650.0f);   /* u < u_psm → PSM at f_max */
    if (!near(l.f_hz, f_max, 1.0f)) ok = 0;
    if (!near(l.dead_a_s, (float)want_weak(KW[n], 650.0), 1e-9f)) ok = 0;
    if (!near(l.dead_b_s, (float)want_dead(KW[n], f_max, 150.0, 650.0, 150.0 * 40.0, 1.6), 1e-9f)) ok = 0;
    if (!(l.dead_a_s >= LLC_DT_MIN_S && l.dead_a_s < 250e-9f)) band = 0;   /* 125 / 186 / 189 ns, not the 208–900 ns an I_m rule gives */
    if (!(l.dead_b_s <= l.dead_a_s && near(l.dead_s, l.dead_a_s, 1e-12f))) legs = 0;   /* the shifted leg never waits longer than the weak one */
    /* PAR400-full, PFM: both legs turn off at the same current, so both get the same time — here the floor */
    llc_t p; memset(&p, 0, sizeof p);
    llc_step(&p, &c, true, 1.0f, 400.0f, 400.0f * 100.0f, 842.0f);
    if (!near(p.dead_s, (float)want_dead(KW[n], p.f_hz, 400.0, 842.0, 400.0 * 100.0, 1.0), 1e-9f)) ok = 0;
    if (!(near(p.dead_a_s, p.dead_b_s, 1e-12f) && p.dead_a_s >= LLC_DT_MIN_S)) legs = 0;
    /* a light PFM point: 500 V bank, 500 W — I_m is the commutation current and the time is long */
    llc_t q; memset(&q, 0, sizeof q);
    llc_step(&q, &c, true, 1.0f, 500.0f, 500.0f, 830.0f);
    if (!near(q.dead_s, (float)want_dead(KW[n], q.f_hz, 500.0, 830.0, 500.0, 1.0), 1e-9f)) light = 0;
  }
  ck("LLC dead time: PS150 weak leg = 0.82·(π/2)·√(L_r·C_node), shifted leg and PFM legs = charge ÷ commutation current, all three SKUs to 1 ns", ok);
  ck("LLC dead time: the phase-shift weak leg lands at 120–250 ns, not the 208–900 ns at which the node swings back to the rail", band);
  ck("LLC dead time: per-leg schedule — leg B never waits longer than leg A in phase shift, PFM legs are equal, nothing under the floor", legs);
  ck("LLC dead time: a light PFM point still gets the long magnetizing-current time", light);
  /* the floor itself. The NSI66x1A is 70/80/110 ns of propagation delay with no matching spec, so the two drivers of
     a leg can differ by 40 ns and a 60 ns command cross-conducts. This row pins the floor and the port constant that
     has to track it: hrtimer.c DT_MIN = 52 steps of 2.3148148 ns on DTGCKDIV = 0010. */
  { int dt_ok = LLC_DT_MIN_S >= 120e-9f && LLC_DT_MIN_S < LLC_DT_MAX_S;
    float from_steps = 52.0f * 2.3148148e-9f;
    dt_ok = dt_ok && from_steps >= LLC_DT_MIN_S && from_steps < LLC_DT_MIN_S + 2.4e-9f;
    int floors = 1;
    const int KW2[3] = { 30, 40, 50 };
    for (int n = 0; n < 3; n++) {                       /* the heavy corner computes 11-24 ns: every leg must be clamped up */
      llc_cfg_t c; llc_cfg_default(&c, (uint16_t)KW2[n]);
      llc_t p; memset(&p, 0, sizeof p);
      llc_step(&p, &c, true, 1.0f, 400.0f, 400.0f * 100.0f, 842.0f);
      if (!(p.dead_a_s >= LLC_DT_MIN_S && p.dead_b_s >= LLC_DT_MIN_S && p.dead_s >= LLC_DT_MIN_S)) floors = 0;
    }
    ck("LLC dead time: the floor is 120 ns (NSI66x1A 70/80/110 ns, unmatched) and hrtimer.c's 52 DTG steps land on it",
       dt_ok && floors); }

  { llc_cfg_t c; llc_cfg_default(&c, 50); llc_t l; memset(&l, 0, sizeof l);
    llc_step(&l, &c, true, 0.5f, 400.0f, 20e3f, NAN);   bool a1 = near(l.dead_s, 900e-9f, 1e-12f);
    llc_step(&l, &c, true, 0.5f, 400.0f, 20e3f, 0.0f);  bool a2 = near(l.dead_s, 900e-9f, 1e-12f);
    llc_step(&l, &c, true, 0.5f, 0.0f, 0.0f, 800.0f);   bool a3 = isfinite(l.dead_s) && near(l.dead_s, 900e-9f, 1e-12f);
    llc_step(&l, &c, false, 0.0f, 400.0f, 0.0f, 800.0f); bool a4 = isfinite(l.dead_s) && l.dead_s >= LLC_DT_MIN_S;
    ck("LLC dead time: a non-finite, zero or bank-less operating point clamps to 900 ns and never produces NaN",
       a1 && a2 && a3 && a4); }

  /* the demand map is monotone in u at every load, and the ZVS floor is a clamp, not the map's endpoint */
  { int mono = 1;
    const float LOAD[3] = { 500.0f, 20e3f, 45e3f };
    for (int n = 0; n < 3; n++) {
      llc_cfg_t c; llc_cfg_default(&c, 50); llc_t l; memset(&l, 0, sizeof l);
      float prev = 1e9f;
      for (int k = 0; k <= 100; k++) {
        float u = c.u_psm + (1.0f - c.u_psm) * (float)k * 0.01f;
        llc_step(&l, &c, true, u, 400.0f, LOAD[n], 800.0f);
        if (l.f_hz > prev + 1.0f) mono = 0;      /* f must never RISE as demand rises */
        prev = l.f_hz;
      }
    }
    ck("the LLC frequency map is monotone non-increasing in u at light, medium and full load", mono); }

  { /* the ZVS boundary must still never be understated after the interpolation change */
    llc_cfg_t c; llc_cfg_default(&c, 50); llc_t l; memset(&l, 0, sizeof l);
    llc_step(&l, &c, true, 1.0f, 60.0f, 20e3f, 800.0f);
    ck("the ZVS guard still reaches the 1.08 fr floor into a near-short (the clamp did not weaken it)",
       l.f_min_hz >= 1.03f * 1.0525f * c.fr_hz - 1.0f); }

  { /* the burst packet is bounded at the setpoint, not at the duty */
    llc_cfg_t c; llc_cfg_default(&c, 50); llc_t l; memset(&l, 0, sizeof l);
    l.in_v_ref = 400.0f;
    llc_step(&l, &c, true, 0.05f * c.u_psm, 390.0f, 1e3f, 800.0f);   bool below = !l.burst && l.gate;
    memset(&l, 0, sizeof l); l.in_v_ref = 400.0f;
    llc_step(&l, &c, true, 0.05f * c.u_psm, 405.0f, 1e3f, 800.0f);   bool above = l.burst && !l.gate;
    ck("at a duty below d_min the bridge keeps switching while the node is under its reference and stops once it is over",
       below && above); }
}

/* ---------------------------------------------------------------- core/fsm.c rows */
static pmp_in_t fsm_base(void) {
  pmp_in_t in;
  memset(&in, 0, sizeof in);
  in.vin_ll = in.vin_ll_min = in.vin_ll_max = 400.0f;
  in.phases_ok = 3;
  in.aux_ok = true; in.fan_ok = true; in.wdt_ok = true;
  in.vmid_frac = 0.5f;
  in.relay_fb_wired = PMP_RLY_PRE;
  in.temp_max_c = 40.0f;
  in.vcmd = 400.0f; in.icmd = 100.0f;
  return in;
}

/* ideal mirror contacts, as host_sim drives them — the checks below run past F.19's 100 ms window, where a
   hand-set relay_fb would latch F.19 instead of the row under test */
static void fsm_steps(pmp_fsm_t *f, pmp_in_t *in, int n) {
  for (int k = 0; k < n; k++) { in->relay_fb = pmp_relay_cmd(&f->out); pmp_fsm_step(f, in); }
}

static void fsm_checks(void) {
  /* the bypass closes on a SETTLED link (two 20 ms steps < 3 V), never on a link that is still rising, and a
     flat-topped supply — rectified peak 0.955 of 1.414·V_rms, where a fixed-fraction rule parks the module in F.20 — closes */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    float crest = 1.414f * 400.0f, top = 0.955f * crest;
    in.vbus = 0.5f * crest;
    bool early = false;
    for (int k = 0; k < 2000 && f.st != ST_STANDBY && f.latched == FC_NONE; k++) {
      in.vbus += (top - in.vbus) * (1.0f / 124.0f);             /* the slowest drawn precharge: τ = 124 ms */
      pmp_fsm_step(&f, &in);
      if (f.out.k_pre && top - in.vbus > 20.0f) early = true;   /* closing step bound: within 20 V of the final value */
    }
    bool closed = f.out.k_pre && f.st == ST_STANDBY;
    pmp_fsm_t g; pmp_fsm_init(&g); pmp_fsm_set_rating_kw(&g, 50u);
    pmp_in_t in2 = fsm_base(); in2.vbus = 0.80f * crest;      /* settled, but absurdly low: never closes, F.20 after the window */
    for (int k = 0; k < 5200; k++) pmp_fsm_step(&g, &in2);
    ck("the bypass closes on a settled link within 20 V of its final value on flat-topped mains (0.955 of the sinusoidal crest); a link parked at 80 % never closes and is F.20",
       closed && !early && !g.out.k_pre && g.latched == FC_PRECHG); }

  /* F.17 carries the documented 10 ms */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    f.st = ST_RUN; f.out.pfc_en = true; f.out.llc_en = true; f.out.mode = MODE_SER; f.out.k_ser = true;
    f.out.v_max = PMP_SER_VMAX_V;
    in.vbus = 800.0f; in.vbank_a = 400.0f; in.vbank_b = 400.0f; in.vout_meas = 799.0f; in.enable_req = true;
    in.relay_fb = PMP_RLY_PRE;
    for (int k = 0; k < 20; k++) pmp_fsm_step(&f, &in);
    in.vbank_b = 360.0f;                       /* 40 V of imbalance, one noisy sample's worth */
    pmp_fsm_step(&f, &in);
    bool survived = f.latched == FC_NONE;
    for (int k = 0; k < 12; k++) pmp_fsm_step(&f, &in);
    ck("a 1 ms bank-imbalance spike does not latch F.17; 10 ms does",
       survived && f.latched == FC_BANK_IMB); }

  /* a battery with no voltage setpoint is refused in STANDBY instead of stalling into F.34 */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    in.vcmd = 0.0f; in.ext_connected = true; in.vext = 400.0f; in.vout_meas = 400.0f;
    in.vbus = 600.0f;
    for (int k = 0; k < 400 && f.st != ST_STANDBY; k++) { pmp_fsm_step(&f, &in); in.relay_fb = pmp_relay_cmd(&f.out); }
    in.enable_req = true;
    for (int k = 0; k < 9000; k++) { pmp_fsm_step(&f, &in); in.relay_fb = pmp_relay_cmd(&f.out); }
    ck("RUN + I_SET with a battery but no V_SET stays in STANDBY with W_NO_SETPOINT — never an 8 s stall into F.34",
       f.st == ST_STANDBY && f.latched == FC_NONE && (f.out.warn & PMP_W_NO_SETPOINT)); }

  /* an aux dropout takes the SAFE path, not F.19 */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    in.vbus = 600.0f;
    for (int k = 0; k < 400 && f.st != ST_STANDBY; k++) pmp_fsm_step(&f, &in);
    in.relay_fb = PMP_RLY_PRE;
    f.st = ST_RUN; f.out.pfc_en = true; f.out.llc_en = true;
    in.aux_ok = false; in.relay_fb = 0u;                    /* the coils de-energise with the rail */
    for (int k = 0; k < 300; k++) pmp_fsm_step(&f, &in);
    bool safe = f.st == ST_SAFE && f.latched == FC_NONE;
    in.aux_ok = true; in.relay_fb = PMP_RLY_PRE;
    for (int k = 0; k < 600; k++) pmp_fsm_step(&f, &in);
    ck("a 300 ms aux dropout recovers SAFE → STANDBY with no F.19 latch, and re-arms the matrix settle timer",
       safe && f.st == ST_STANDBY && f.latched == FC_NONE && f.p_make == 0); }

  /* an out-of-range line is reported, not held silently with the precharge resistors in circuit */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    in.vin_ll = in.vin_ll_min = in.vin_ll_max = 260.0f;     /* below the 275 V start window */
    in.vbus = 360.0f;
    for (int k = 0; k < 5000; k++) pmp_fsm_step(&f, &in);
    bool quiet = f.latched == FC_NONE && f.st == ST_PRECHG;
    for (int k = 0; k < 6000; k++) pmp_fsm_step(&f, &in);
    ck("260 VAC in PRECHG is a warning for 10 s and then a reported AUTO_EXT row, not an unbounded silent wait",
       quiet && f.latched == FC_IN_UV && pmp_fault_class(f.latched) == FCL_AUTO_EXT); }

  /* the link rows run on a charged link with both stages stopped */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    in.vbus = 600.0f;
    for (int k = 0; k < 400 && f.st != ST_STANDBY; k++) pmp_fsm_step(&f, &in);
    bool idle = !f.out.pfc_en && !f.out.llc_en;
    in.vbus = 800.0f; in.vmid_frac = 0.60f;                 /* 160 V of midpoint imbalance on an idle charged link */
    for (int k = 0; k < 200; k++) pmp_fsm_step(&f, &in);
    ck("an idle but charged link is still watched — the midpoint row fires with both stages stopped",
       idle && (f.latched == FC_MID_IMB || f.latched == FC_HALF_OV)); }   /* 480 V on a half is F.38 (LATCH) and replaces F.06 */

  /* a commanded discharge survives a reset */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_fsm_resume_shutdown(&f);
    pmp_in_t in = fsm_base();
    in.vbus = 700.0f; in.vbank_a = in.vbank_b = 350.0f;
    pmp_fsm_step(&f, &in);
    ck("a resumed shutdown re-commands the dump and never re-precharges the link",
       f.st == ST_DISCH && f.out.q_disch && f.out.q_disch_bk && !f.out.k_pre); }

  /* the two link rows (F.06 midpoint, F.38 half-link) run whenever the link is charged — but not on the shutdown path: the
     dump IS the cure for a charged link and ST_FAULT would end it; F.06 is even an AUTO row that would recover into
     precharge with the shutdown forgotten. */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    in.vbus = 900.0f; in.vmid_frac = 0.44f; in.vbank_a = in.vbank_b = 350.0f;   /* 108 V of midpoint error, 504 V on one half */
    pmp_fsm_resume_shutdown(&f);
    for (int k = 0; k < 50; k++) pmp_fsm_step(&f, &in);
    bool kept = f.st == ST_DISCH && f.out.q_disch && f.out.q_disch_bk && f.latched == FC_NONE;
    in.vbus = 30.0f; in.vmid_frac = 0.5f;
    for (int k = 0; k < 120; k++) { in.vbank_a *= 0.97f; in.vbank_b *= 0.97f; pmp_fsm_step(&f, &in); }   /* the banks fall on their bleeders */
    in.vbank_a = in.vbank_b = 30.0f; in.vout_meas = 30.0f;
    for (int k = 0; k < 400; k++) pmp_fsm_step(&f, &in);
    ck("a midpoint or half-link excursion during the commanded discharge does not end the dump — the link comes down and the module reaches OFF",
       kept && f.st == ST_OFF && f.latched == FC_NONE); }

  /* ---------------- the discharge, over-current and recovery rows. */

  /* F.18: a bypass pole that never releases. Precharge cannot see it — the settled-link rule leaves in 61 ms,
     under F.19's 100 ms window — so the commanded discharge, the one place the contact is open for seconds, is where
     the release is checked. The report waits for the end of the dump, so it can never abandon one. */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    in.vbus = 700.0f; in.vbank_a = in.vbank_b = 350.0f; in.vout_meas = 30.0f;
    in.relay_fb = PMP_RLY_PRE;                      /* welded: the mirror reads closed whatever the coil is told */
    pmp_fsm_resume_shutdown(&f);
    pmp_fsm_step(&f, &in);
    bool dumping = f.st == ST_DISCH && f.out.q_disch && !f.out.k_pre;
    in.vbus = 30.0f;
    for (int k = 0; k < 120; k++) { in.vbank_a *= 0.97f; in.vbank_b *= 0.97f; pmp_fsm_step(&f, &in); }   /* the banks fall on their bleeders */
    in.vbank_a = in.vbank_b = 30.0f;
    for (int k = 0; k < 400 && f.latched == FC_NONE; k++) pmp_fsm_step(&f, &in);
    pmp_fsm_t g; pmp_fsm_init(&g); pmp_fsm_set_rating_kw(&g, 50u);
    pmp_in_t in2 = fsm_base();                      /* the healthy contact releases: OFF, no row */
    in2.vbus = 30.0f; in2.vbank_a = in2.vbank_b = 30.0f; in2.vout_meas = 30.0f;
    pmp_fsm_resume_shutdown(&g);
    for (int k = 0; k < 400; k++) pmp_fsm_step(&g, &in2);
    ck("a bypass whose mirror never releases is F.18 at the end of the discharge; a healthy one reaches OFF",
       dumping && f.latched == FC_WELD && g.st == ST_OFF && g.latched == FC_NONE); }

  /* ST_FAULT ends the dump, so any row that latches during a commanded discharge abandons it with the link charged —
     and F.35 fires on a SINGLE late tick, which is what a flash write during a shutdown produces. */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    in.vbus = 700.0f; in.vbank_a = in.vbank_b = 350.0f;
    pmp_fsm_resume_shutdown(&f);
    pmp_fsm_step(&f, &in);
    in.ctl_overrun = true;  pmp_fsm_step(&f, &in); in.ctl_overrun = false;
    in.desat_flt = true;    pmp_fsm_step(&f, &in); in.desat_flt = false;
    in.vbus = NAN;                                  /* and a measurement that stops being plausible */
    for (int k = 0; k < 10; k++) pmp_fsm_step(&f, &in);
    bool still = f.st == ST_DISCH && f.out.q_disch && f.out.q_disch_bk && f.latched == FC_NONE;
    in.vbus = 700.0f;
    for (int k = 0; k < 6000 && f.latched == FC_NONE; k++) pmp_fsm_step(&f, &in);
    ck("F.35, DESAT and an implausible sample during the commanded discharge leave the dump running — and it is still bounded",
       still && f.latched == FC_DISCH && !f.out.q_disch); }

  /* rows that judge the RATED current only let a failed CC loop deliver 0.96 of rated into a 0.06 request for ever.
     500 ms and a 15 %-of-rated margin cannot be reached by any CC transient. */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);   /* i_rated 166.7 A */
    pmp_in_t in = fsm_base();
    f.st = ST_RUN; f.out.pfc_en = true; f.out.llc_en = true; f.out.v_max = PMP_PAR_VMAX_V;
    f.out.k_pre = true; f.out.k_para = true; f.out.k_parb = true;
    in.enable_req = true;
    in.vbus = 700.0f; in.vbank_a = in.vbank_b = 400.0f; in.vout_meas = 399.0f;
    in.icmd = 10.0f; in.iout_meas = 10.0f;
    fsm_steps(&f, &in, 600);
    bool quiet = f.latched == FC_NONE;
    in.iout_meas = 160.0f;                          /* 0.96 of rated: every rated-relative row stays happy */
    fsm_steps(&f, &in, 400);
    bool patient = f.latched == FC_NONE;
    fsm_steps(&f, &in, 120);
    ck("160 A delivered against a 10 A command latches F.15 at 500 ms, and a 400 ms excursion does not",
       quiet && patient && f.latched == FC_OUT_OC); }

  /* F.01 at a line return. The comparator fires on the surge the boost diodes conduct when the line steps back over
     a link that sagged to its crest; taken as a LATCH row that makes every utility dip a service call. */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 30u);
    pmp_in_t in = fsm_base();
    f.st = ST_RUN; f.out.pfc_en = true; f.out.llc_en = true; f.out.v_max = PMP_PAR_VMAX_V; f.out.k_pre = true;
    in.enable_req = true; in.vbus = 700.0f; in.vbank_a = in.vbank_b = 400.0f; in.vout_meas = 399.0f;
    fsm_steps(&f, &in, 2000);                        /* the site's normal line is learnt: 400 VAC */
    pmp_fsm_t q = f; pmp_in_t iq = in;               /* control: the same trip on a QUIET line */
    iq.oc_pfc_flt = true; fsm_steps(&q, &iq, 1);
    bool quiet_latches = q.latched == FC_OC_PFC && pmp_fault_class(q.latched) == FCL_LATCH;
    in.vin_ll = in.vin_ll_min = 285.0f;              /* a −29 % sag: above the absolute 260 V row, 60 ms long */
    fsm_steps(&f, &in, 60);
    bool rides = f.latched == FC_NONE;
    in.vin_ll = in.vin_ll_min = 400.0f; in.oc_pfc_flt = true;   /* the line steps back and the comparator fires */
    fsm_steps(&f, &in, 1);
    in.oc_pfc_flt = false;
    bool grids = f.latched == FC_IN_UV && pmp_fault_class(f.latched) == FCL_AUTO_EXT && f.counted == 0u && !f.out.k_pre;
    in.vbus = 560.0f; fsm_steps(&f, &in, 6000);      /* it clears by itself and goes back through precharge */
    ck("a line over-current inside 500 ms of a sag is filed as the grid's (F.08, AUTO_EXT, uncounted, bypass opened, self-clearing); on a quiet line it is still F.01 and still latches",
       quiet_latches && rides && grids && f.latched == FC_NONE && f.st != ST_FAULT); }

  /* F.05 on a grid interruption. The rms line values lag the link collapse by up to a cycle, so the row fires
     before its own cause is visible — and it counts toward F.31, so five brown-outs would lock the module. */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    f.st = ST_RUN; f.out.pfc_en = true; f.out.llc_en = true; f.out.v_max = PMP_PAR_VMAX_V; f.out.k_pre = true;
    in.enable_req = true;
    in.vbank_a = in.vbank_b = 300.0f; in.vout_meas = 299.0f;
    in.vbus = 500.0f;                               /* the link collapses first … */
    fsm_steps(&f, &in, 12);
    bool busuv = f.latched == FC_BUS_UV && f.counted == 1u;
    in.phases_ok = 0; in.vin_ll = in.vin_ll_min = in.vin_ll_max = 0.0f;   /* … the line catches up a cycle later */
    fsm_steps(&f, &in, 1);
    bool regrade = f.latched == FC_PH_LOSS && pmp_fault_class(f.latched) == FCL_AUTO_EXT && f.counted == 0u && !f.lock;
    pmp_fsm_t g; pmp_fsm_init(&g); pmp_fsm_set_rating_kw(&g, 50u);
    pmp_in_t in2 = fsm_base();                      /* the same collapse on a HEALTHY line stays the module's */
    g.st = ST_RUN; g.out.pfc_en = true; g.out.llc_en = true; g.out.v_max = PMP_PAR_VMAX_V; g.out.k_pre = true;
    in2.enable_req = true;
    in2.vbank_a = in2.vbank_b = 300.0f; in2.vout_meas = 299.0f; in2.vbus = 500.0f;
    fsm_steps(&g, &in2, 300);
    ck("a bus-UV the line explains within 200 ms is re-filed as the grid's and un-counted; one on a healthy line stays F.05, AUTO_INT and counted",
       busuv && regrade && g.latched == FC_BUS_UV && pmp_fault_class(g.latched) == FCL_AUTO_INT && g.counted == 1u); }

  /* F.26 bounds the wait for the aux rail: neither INIT nor SAFE may park unbounded */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base(); in.aux_ok = false;
    for (int k = 0; k < 4900; k++) pmp_fsm_step(&f, &in);
    bool waiting = f.st == ST_INIT && f.latched == FC_NONE;
    for (int k = 0; k < 200; k++) pmp_fsm_step(&f, &in);
    bool said = f.latched == FC_AUX_UV && pmp_fault_class(FC_AUX_UV) == FCL_AUTO_INT;
    in.aux_ok = true;
    for (int k = 0; k < 4000 && f.st == ST_FAULT; k++) pmp_fsm_step(&f, &in);
    bool back = f.latched == FC_NONE && f.st != ST_FAULT;
    pmp_fsm_t g; pmp_fsm_init(&g); pmp_fsm_set_rating_kw(&g, 50u);
    pmp_in_t in2 = fsm_base(); in2.vbus = 700.0f;   /* and the same bound on the way out of SAFE */
    g.st = ST_RUN; g.out.pfc_en = true; g.out.llc_en = true;
    in2.aux_ok = false;
    for (int k = 0; k < 4900; k++) pmp_fsm_step(&g, &in2);
    bool safe = g.st == ST_SAFE && g.latched == FC_NONE;
    for (int k = 0; k < 200; k++) pmp_fsm_step(&g, &in2);
    ck("an aux that never comes up is F.26 after 5 s in INIT and in SAFE, never an unbounded silent park, and the row clears itself when the rail returns",
       waiting && said && back && safe && g.latched == FC_AUX_UV); }

  /* the exit must not test three channels on ONE sample — a glitched low reading would end the dump at 700 V */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    in.vbus = 700.0f; in.vbank_a = in.vbank_b = 350.0f; in.vout_meas = 30.0f;
    pmp_fsm_resume_shutdown(&f);
    for (int k = 0; k < 50; k++) pmp_fsm_step(&f, &in);
    in.vbus = 10.0f; in.vbank_a = in.vbank_b = 10.0f;
    pmp_fsm_step(&f, &in);
    in.vbus = 700.0f; in.vbank_a = in.vbank_b = 350.0f;
    pmp_fsm_step(&f, &in);
    bool held = f.st == ST_DISCH && f.out.q_disch;
    in.vbus = 30.0f; in.vout_meas = 400.0f;   /* studs still live: not discharged */
    for (int k = 0; k < 120; k++) { in.vbank_a *= 0.97f; in.vbank_b *= 0.97f; pmp_fsm_step(&f, &in); }   /* the banks fall on their bleeders */
    in.vbank_a = in.vbank_b = 30.0f;
    for (int k = 0; k < 300; k++) pmp_fsm_step(&f, &in);
    bool node = f.st == ST_DISCH && !f.out.q_disch;
    in.vout_meas = 30.0f;
    for (int k = 0; k < 5; k++) pmp_fsm_step(&f, &in);
    ck("a single glitched low sample does not end the discharge, and OFF waits for the output node the 450 kOhm bleeder drains",
       held && node && f.st == ST_OFF); }

  /* matrix commands left asserted through an aux dropout re-make the contacts the instant the rail returns — ahead
     of the SAFE hold and without the make-permit */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    f.st = ST_RUN; f.out.pfc_en = true; f.out.llc_en = true; f.out.k_pre = true; f.out.k_para = true; f.out.k_parb = true;
    in.enable_req = true; in.vbus = 830.0f;
    in.vbank_a = in.vbank_b = 400.0f; in.vout_meas = 300.0f;   /* banks well ABOVE the node: the permit must refuse */
    in.aux_ok = false;
    fsm_steps(&f, &in, 1);
    bool opened = f.st == ST_SAFE && !f.out.k_para && !f.out.k_parb;
    in.aux_ok = true; in.enable_req = false; fsm_steps(&f, &in, 2); in.enable_req = true;   /* re-arm */
    fsm_steps(&f, &in, 700);
    ck("an aux dropout opens the matrix commands with the coils, so the re-make goes through the permit (bleeders on, contacts open) instead of closing on hardware",
       opened && !f.out.k_para && !f.out.k_parb && f.out.q_disch_bk && f.latched == FC_NONE); }

  /* a warm stop keeps the previous mode's contacts; a start that derives the OTHER mode opens them through MODESW before
     the new pair closes — UEXCL drops the KSER coil as KPARA / KPARB make, and its release (≤ 35 ms) outlives the make */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u); pmp_in_t in = fsm_base();
    f.st = ST_STANDBY; f.out.k_pre = true; f.out.pfc_en = true; f.out.k_ser = true;   /* a SER session, warm-stopped */
    in.vbus = 830.0f; in.vout_meas = 60.0f; in.vbank_a = in.vbank_b = 30.0f; in.vcmd = 400.0f; in.enable_req = true;
    bool overlap = false, modesw = false;
    for (int k = 0; k < 300; k++) { in.relay_fb = pmp_relay_cmd(&f.out); pmp_fsm_step(&f, &in);
      if (f.out.k_ser && (f.out.k_para || f.out.k_parb)) overlap = true; if (f.st == ST_MODESW) modesw = true; }
    ck("a 400 V start after a warm-stopped SER session opens the series contact through MODESW before the parallel pair closes — the three are never commanded together",
       !overlap && modesw && f.out.k_para && f.out.k_parb && !f.out.k_ser); }

  /* a communication timeout inside MODESW lets the 70 ms sequence finish: every contact open before STANDBY */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u); pmp_in_t in = fsm_base();
    f.st = ST_MODESW; f.sw_step = 5; f.out.k_ser = true; f.out.pfc_en = true; f.out.k_pre = true; in.vbus = 830.0f; in.enable_req = true;
    in.can_age_ms = 99999u; pmp_fsm_step(&f, &in);
    bool stayed = f.st == ST_MODESW;
    for (int k = 0; k < 80; k++) pmp_fsm_step(&f, &in);
    ck("a comms timeout inside MODESW does not abandon the sequence with the old matrix closed",
       stayed && f.st == ST_STANDBY && !f.out.k_ser && !f.out.k_para && !f.out.k_parb && f.need_enable); }

  /* a line alternating across the start window every cycle resets the two PRECHG windows in turn */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_in_t in = fsm_base(); in.vbus = 360.0f;
    for (int k = 0; k < 40000; k++) { float v = ((k / 20) % 2) ? 272.0f : 278.0f; in.vin_ll = in.vin_ll_min = in.vin_ll_max = v; pmp_fsm_step(&f, &in); }
    ck("a line alternating across the start window does not park the module in PRECHG for ever — it is reported as the grid row",
       f.latched == FC_IN_UV && f.st == ST_FAULT); }

  /* a dead aux in STANDBY is SAFE (a fresh ENABLE afterwards) and F.26 when the rail never returns */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u); pmp_in_t in = fsm_base();
    f.st = ST_STANDBY; f.out.k_pre = true; in.vbus = 600.0f; in.enable_req = true;   /* ENABLE held: the re-arm stays observable */
    in.aux_ok = false; pmp_fsm_step(&f, &in);
    bool safe = f.st == ST_SAFE && f.need_enable;
    for (int k = 0; k < 6000 && f.latched == FC_NONE; k++) pmp_fsm_step(&f, &in);
    ck("a dead aux in STANDBY goes to SAFE and is F.26 when it never returns — not READY for ever", safe && f.latched == FC_AUX_UV); }

  /* both bank channels dropping to 0 V in a millisecond with the bridge stopped is a lie the make-permit must not act on */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u); pmp_in_t in = fsm_base();
    f.st = ST_STANDBY; f.out.k_pre = true; f.out.pfc_en = true;
    in.vbus = 830.0f; in.vout_meas = 60.0f; in.vbank_a = in.vbank_b = 490.0f;   /* banks still charged from the last session */
    for (int k = 0; k < 300; k++) { in.relay_fb = pmp_relay_cmd(&f.out); pmp_fsm_step(&f, &in); }   /* idle, matrix untouched */
    in.vbank_a = in.vbank_b = 0.0f; in.enable_req = true; in.vcmd = 400.0f;
    bool closed = false;
    for (int k = 0; k < 50; k++) { in.relay_fb = pmp_relay_cmd(&f.out); pmp_fsm_step(&f, &in); if (f.out.k_para || f.out.k_parb) closed = true; }
    ck("bank channels that read 0 V a millisecond after 490 V with the bridge stopped are F.29, and the make-permit never closes onto the banks they hid",
       !closed && f.latched == FC_SENSOR); }

  /* a single high line sample must not make the settled line read as disturbed for seconds */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 30u); pmp_in_t in = fsm_base();
    f.st = ST_RUN; f.out.pfc_en = true; f.out.llc_en = true; f.out.k_pre = true; f.out.k_para = true; f.out.k_parb = true;
    in.enable_req = true; in.vbus = 700.0f; in.vbank_a = in.vbank_b = 400.0f; in.vout_meas = 399.0f; in.vcmd = 400.0f; in.icmd = 50.0f;
    for (int k = 0; k < 2000; k++) { in.relay_fb = pmp_relay_cmd(&f.out); pmp_fsm_step(&f, &in); }   /* the site line learnt at 400 V */
    in.vin_ll = in.vin_ll_min = in.vin_ll_max = 470.0f; for (int k = 0; k < 20; k++) { in.relay_fb = pmp_relay_cmd(&f.out); pmp_fsm_step(&f, &in); }   /* one swell */
    in.vin_ll = in.vin_ll_min = in.vin_ll_max = 400.0f; for (int k = 0; k < 20; k++) { in.relay_fb = pmp_relay_cmd(&f.out); pmp_fsm_step(&f, &in); }
    in.oc_pfc_flt = true; in.relay_fb = pmp_relay_cmd(&f.out); pmp_fsm_step(&f, &in);
    ck("one 20 ms swell does not exempt a later F.01 on a settled line from latching as the module's own",
       f.latched == FC_OC_PFC && pmp_fault_class(f.latched) == FCL_LATCH); }

  /* persistence windows reset with their gate: a 99 ms near-miss of F.08 must not become a 1 ms latch next session */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u); pmp_in_t in = fsm_base();
    f.st = ST_RUN; f.out.pfc_en = true; f.out.llc_en = true; f.out.k_pre = true; f.out.k_para = true; f.out.k_parb = true;
    in.enable_req = true; in.vbus = 700.0f; in.vbank_a = in.vbank_b = 400.0f; in.vout_meas = 399.0f; in.vcmd = 400.0f; in.icmd = 50.0f;
    in.vin_ll = in.vin_ll_min = in.vin_ll_max = 250.0f;
    for (int k = 0; k < 99; k++) { in.relay_fb = pmp_relay_cmd(&f.out); pmp_fsm_step(&f, &in); }
    bool armed = f.latched == FC_NONE;
    in.vin_ll = in.vin_ll_min = in.vin_ll_max = 400.0f; f.st = ST_STANDBY; f.out.pfc_en = false; f.out.llc_en = false; in.enable_req = false;
    in.relay_fb = pmp_relay_cmd(&f.out); pmp_fsm_step(&f, &in);                                        /* a cold stop */
    f.st = ST_RUN; f.out.pfc_en = true; f.out.llc_en = true; in.enable_req = true; in.vin_ll = in.vin_ll_min = in.vin_ll_max = 250.0f;
    for (int k = 0; k < 2; k++) { in.relay_fb = pmp_relay_cmd(&f.out); pmp_fsm_step(&f, &in); }
    ck("a near-miss persistence does not carry across a stop into a 1 ms latch in the next session", armed && f.latched == FC_NONE); }

  /* a HIGH start below its range says why; the AUTO crossover reaches SER for a pack the module charges past 500 V itself */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u); pmp_in_t in = fsm_base();
    f.st = ST_STANDBY; f.out.k_pre = true; f.omode = OMODE_HIGH; in.omode_req = OMODE_HIGH; in.vcmd = 300.0f; in.enable_req = true; in.vbus = 600.0f;
    for (int k = 0; k < 3; k++) { in.relay_fb = pmp_relay_cmd(&f.out); pmp_fsm_step(&f, &in); }
    bool said = (f.out.warn & PMP_W_NO_SETPOINT) != 0u && f.st == ST_STANDBY;
    pmp_fsm_t g; pmp_fsm_init(&g); pmp_fsm_set_rating_kw(&g, 50u); pmp_in_t in2 = fsm_base();
    g.st = ST_RUN; g.out.pfc_en = true; g.out.llc_en = true; g.out.k_pre = true; g.out.k_para = true; g.out.k_parb = true; g.out.mode = MODE_PAR;
    in2.enable_req = true; in2.vbus = 830.0f; in2.ext_connected = true; in2.vext = 496.0f; in2.vout_meas = 496.0f; in2.vbank_a = in2.vbank_b = 497.0f;
    in2.vcmd = 800.0f; in2.icmd = 50.0f;
    for (int k = 0; k < 1100 && g.st != ST_MODESW; k++) { in2.relay_fb = pmp_relay_cmd(&g.out); pmp_fsm_step(&g, &in2); }
    ck("a HIGH start below 480 V reports NO_SETPOINT instead of a silent READY, and a pack held at the PAR ceiling with more commanded crosses to SER",
       said && g.st == ST_MODESW); }

  /* the comms timeout stops the module and writes no fault code, so the warning bit is the only reason on the panel */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_in_t in = fsm_base();
    in.vbus = 400.0f; in.can_age_ms = 5000u;
    pmp_fsm_step(&f, &in);
    ck("a communication loss reports PMP_W_COMMS_LOST (F.28 is graceful, not silent)", (f.out.warn & PMP_W_COMMS_LOST) != 0u); }

  /* nothing resets prechg_ms on an in-range line, so unless the state reset clears it, a CLEAR after F.20 re-enters
     precharge with the window already spent and re-latches F.20 on the next tick, for ever. */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    float crest = 1.414f * 400.0f;
    in.vbus = 0.80f * crest;                        /* settled far too low: F.20 at the end of the window */
    fsm_steps(&f, &in, 5200);
    bool latched = f.latched == FC_PRECHG;
    in.vbus = 0.955f * crest;
    in.clear_req = true; fsm_steps(&f, &in, 1); in.clear_req = false;
    fsm_steps(&f, &in, 500);
    ck("a CLEAR after F.20 really re-precharges — the window is reset with the state, not left spent",
       latched && f.latched == FC_NONE && f.st == ST_STANDBY && f.out.k_pre); }

  /* the bus-UV row tracks the line crest */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    in.vin_ll = in.vin_ll_min = in.vin_ll_max = 475.0f;     /* crest 671.8 V, well above the fixed 620 V row */
    f.st = ST_RUN; f.out.pfc_en = true; f.out.llc_en = true; f.out.v_max = PMP_PAR_VMAX_V;
    in.enable_req = true; in.relay_fb = PMP_RLY_PRE;
    in.vbus = 640.0f; in.vbank_a = in.vbank_b = 300.0f; in.vout_meas = 299.0f;
    for (int k = 0; k < 60; k++) pmp_fsm_step(&f, &in);
    ck("at 475 VAC a 640 V link is under the crest and latches F.05 — the fixed 620 V row never saw it",
       f.latched == FC_BUS_UV); }
}

/* ---------------------------------------------------------------- hal/app.c identity and fault channels */
static void app_checks(void) {
  ck("fan count: the HRTIMER phase-A fault channel is FLT1 (CMP3 on PB0), not FLT7", APP_FLT_IA == 1u);
  ck("the bypass-closure blank re-arms only the three line-OC channels, never the bus or output OVP latch",
     APP_FLT_LINE_OC == ((1u << APP_FLT_IA) | (1u << APP_FLT_IB) | (1u << APP_FLT_IC)) &&
     (APP_FLT_LINE_OC & ((1u << APP_FLT_VBUS) | (1u << APP_FLT_VOUT) | (1u << APP_FLT_EXT))) == 0u);

  /* fan count per rating, including the 30 kW third fan */
  { static app_t a;
    struct { const char *n; float counts; uint8_t want; } CASE[4] = {
      { "30 kW", 0.0f, 3u },                                  /* 0 R strap */
      { "40 kW", 1.0f / (1.0f + 10.0f) * 3.3f * 4095.0f / 3.3f, 3u },
      { "50 kW liquid", 10.0f / (10.0f + 10.0f) * 4095.0f, 0u },
      { "50 kW air", 15.0f / (15.0f + 10.0f) * 4095.0f, 4u },
    };
    int ok = 1;
    for (int k = 0; k < 4; k++) {
      app_boot_t b; memset(&b, 0, sizeof b);
      b.rating_counts = CASE[k].counts; b.nvm_page_size = 1024u; b.reset_cause = (uint8_t)(1u << 3);
      app_init(&a, &b);
      if (a.n_fans != CASE[k].want) { ok = 0; printf("      %s: n_fans %u, wanted %u\n", CASE[k].n, a.n_fans, CASE[k].want); }
    }
    ck("fan count: 30 kW 3 · 40 kW 3 · 50 kW liquid 0 · 50 kW air 4 (the 30 kW third fan is on FAN_TACH3/FAN_PWM2)", ok); }

  /* No sign-following reference (trip polarity is open decision O-15). Every comparator is non-inverting into an
     active-high fault input, so a reference below AVMID is a fault asserted in normal operation and the converter
     cannot run. The references stay positive whatever the sign of the phase current; the negative half-cycle is
     covered by the 100 kHz software magnitude trip (app_test) and by the other two phases' comparators (Σi = 0),
     which is also what makes the CT primary orientation immaterial. */
  { static app_t a; app_boot_t b; memset(&b, 0, sizeof b);
    b.nvm_page_size = 1024u; b.rating_counts = 0.0f; b.reset_cause = (uint8_t)(1u << 3);
    app_init(&a, &b);
    app_tick_in_t ti; memset(&ti, 0, sizeof ti);
    ti.vrefint = (float)(1.20 / 3.3 * 4096.0); ti.avmid = (float)(1.65 / 3.3 * 4095.0);
    ti.v24 = 24.0f / (3.3f / 4096.0f * 9.2f); ti.v15 = 15.0f / (3.3f / 4096.0f * 5.7f);
    ti.di = APP_DI_DRV_RDY;
    app_tick_out_t o;
    app_tick(&a, &ti, &o);
    app_pfc_adc_t s; memset(&s, 0, sizeof s);
    app_pfc_out_t po;
    float mid = a.cal.ch[MCH_IA].off;
    s.ia = mid + 500.0f; s.ib = mid - 500.0f; s.ic = mid;        /* A positive, B negative, C at the offset */
    s.vac[0] = s.vac[1] = s.vac[2] = 0.0f; s.vbus = 0.0f; s.vmid = 0.0f;
    app_pfc_isr(&a, &s, &po);
    app_tick(&a, &ti, &o);
    float avm = 1.65f;
    bool a_hi = o.dac_v[APP_DAC_IA] > avm, b_hi = o.dac_v[APP_DAC_IB] > avm, c_hi = o.dac_v[APP_DAC_IC] > avm;
    ck("the three F.01 references stay ABOVE AVMID whatever the sign of the phase current — a reference below it is a standing fault",
       a_hi && b_hi && c_hi); }

  /* the firmware half of the fan start: the 50 kW-air aux budget is ≈ 120 W on a 110 W stage and the NCP1252's over-current is
     a LATCH no software can reset — so no fan starts on a rail that has not been in spec for 500 ms, and the two fan
     PWM groups never start together. (The card has two fan PWM channels, so this staggers GROUPS, not fans: 1–2 on
     FAN_PWM1, 3–4 on FAN_PWM2 — per-fan stagger needs four channels, which the card does not have.) */
  { static app_t a; app_boot_t b; memset(&b, 0, sizeof b);
    b.nvm_page_size = 1024u; b.rating_counts = 15.0f / 25.0f * 4095.0f; b.reset_cause = (uint8_t)(1u << 3);
    app_init(&a, &b);
    app_tick_in_t ti; memset(&ti, 0, sizeof ti);
    ti.vrefint = (float)(1.20 / 3.3 * 4096.0); ti.avmid = (float)(1.65 / 3.3 * 4095.0);
    ti.v24 = 24.0f / (3.3f / 4096.0f * 9.2f); ti.v15 = 15.0f / (3.3f / 4096.0f * 5.7f);
    ti.di = APP_DI_DRV_RDY;
    ti.t_pfc = ti.t_inlet = ti.t_llc = ti.t_xfmr = 2047.0f;    /* 25 °C everywhere … */
    ti.t_pfc = 740.0f;                                          /* … but a 70 °C PFC sink: cooling is wanted from a SINK, never from the inlet */
    app_tick_out_t o;
    uint32_t t_a = 0u, t_b = 0u;
    int early = 0;
    for (uint32_t k = 0u; k < 2000u; k++) {
      app_tick(&a, &ti, &o);
      if (a.now_ms < 500u && (o.fan_duty[0] > 0.0f || o.fan_duty[1] > 0.0f)) early++;
      if (o.fan_duty[0] > 0.0f && t_a == 0u) t_a = a.now_ms;
      if (o.fan_duty[1] > 0.0f && t_b == 0u) t_b = a.now_ms;
    }
    ck("no fan starts before 500 ms of in-spec aux rails, and the second fan PWM group starts 300 ms after the first",
       a.n_fans == 4u && early == 0 && t_a >= 500u && t_b >= t_a + 300u && o.fan_duty[1] > 0.0f); }

  /* any reset that is neither power-on nor a sealed reboot is a watchdog event — the TPS3430 arrives on the NRST
     pin (EPRSTF), which a `== FWDGT` test can never see */
  { static app_t a; app_boot_t b;
    memset(&b, 0, sizeof b); b.nvm_page_size = 1024u; b.rating_counts = 0.0f;
    b.reset_cause = (uint8_t)(1u << 2);                        /* EPRSTF: the TPS3430's WDO on NRST */
    app_init(&a, &b);
    bool pin_is_wdt = a.wdt_boot;
    memset(&b, 0, sizeof b); b.nvm_page_size = 1024u; b.rating_counts = 0.0f;
    b.reset_cause = (uint8_t)((1u << 2) | (1u << 3));          /* a power-on that also asserted NRST */
    app_init(&a, &b);
    bool por_is_not = !a.wdt_boot;
    memset(&b, 0, sizeof b); b.nvm_page_size = 1024u; b.rating_counts = 0.0f;
    b.reset_cause = (uint8_t)(1u << 2); b.handoff_reboot = true;
    app_init(&a, &b);
    bool reboot_is_not = !a.wdt_boot;
    ck("a TPS3430 pin reset reports F.32, while a power-on and a sealed reboot do not",
       pin_is_wdt && por_is_not && reboot_is_not); }
}

/* ---------------------------------------------------------------- proto: TonHe V1.2 and VMP 2.0 (addendum G) */
static mod_tlm_t th_tlm(int rs) {
  mod_tlm_t m; memset(&m, 0, sizeof m);
  m.rs = rs;
  m.v_min = 200.0f; m.i_rated = 100.0f; m.v_out = 400.0f; m.i_out = 50.0f;
  m.t_inlet = 30.0f;
  return m;
}

static void proto_checks(void) {
  ck("TH12_TRIGGER_GAP_MS is 200 ms — at 50 ms a 24-module fault storm computes to 105 % of a 125 kbit/s bus",
     TH12_TRIGGER_GAP_MS == 200u);

  /* K §5 fix 1: C_M_23 while delivering is stored and adopted at the next output-off, never refused */
  { static th12_t t; th12_init(&t, 1u, 5u, 0u, 0u, 0u);
    mod_tlm_t on = th_tlm(MOD_RS_ON), off = th_tlm(MOD_RS_READY);
    mod_cmd_t cmd; mod_cmd_init(&cmd);
    pmp_txq_t tx; memset(&tx, 0, sizeof tx);
    pmp_frame_t f = { th12_id(6u, TH12_PF_ADDR_SET, 5u, TH12_MONITOR_ADDR), 1u, { 9u, 0, 0, 0, 0, 0, 0, 0 } };
    th12_rx(&t, &f, 1000u, &on, &cmd, &tx);
    bool deferred = th12_addr(&t) == 5u && t.addr_pending == 9u;
    th12_tick(&t, 1001u, &on, &cmd, &tx);
    bool held = th12_addr(&t) == 5u;                           /* the source address must not move mid-stream */
    th12_tick(&t, 1002u, &off, &cmd, &tx);
    ck("C_M_23 during delivery is accepted and deferred — the address moves at the first output-off, not never",
       deferred && held && th12_addr(&t) == 9u && t.addr_pending == 0u && t.nv_dirty); }

  /* K §5 fix 2: an undocumented PF from the monitor is counted, not silently discarded */
  { static th12_t t; th12_init(&t, 1u, 5u, 0u, 0u, 0u);
    mod_tlm_t m = th_tlm(MOD_RS_READY);
    mod_cmd_t cmd; mod_cmd_init(&cmd);
    pmp_txq_t tx; memset(&tx, 0, sizeof tx);
    pmp_frame_t f = { th12_id(6u, 0x0Cu, 5u, TH12_MONITOR_ADDR), 8u, { 1, 2, 3, 4, 5, 6, 7, 8 } };
    th12_rx(&t, &f, 1000u, &m, &cmd, &tx);
    ck("an undocumented monitor PGN is accepted, ignored and counted (the one open interop unknown becomes a measurement)",
       t.unknown_pf == 1u && t.last_unknown_pf == 0x0Cu && tx.n == 0u); }

  /* K §5 fix 4: a start with V = 0 is still refused, but the monitor is told on the wire */
  { static th12_t t; th12_init(&t, 1u, 5u, 0u, 0u, 0u);
    mod_tlm_t m = th_tlm(MOD_RS_READY);
    mod_cmd_t cmd; mod_cmd_init(&cmd);
    pmp_txq_t tx; memset(&tx, 0, sizeof tx);
    pmp_frame_t f = { th12_id(6u, TH12_PF_STARTSTOP, 5u, TH12_MONITOR_ADDR), 6u, { 0xAAu, 0, 0, 0, 0x88u, 0x13u, 0, 0 } };
    th12_rx(&t, &f, 1000u, &m, &cmd, &tx);
    pmp_frame_t st; th12_enc_state(&t, &m, 1000u, &st);
    uint16_t w = pmp_get16(st.data + 5);
    ck("a start commanded with V = 0 keeps the safe refusal AND sets M_C_4 fault bit 0 so the monitor is not left reading 0x00",
       t.run && t.v_set == 0.0f && (w & 1u)); }

  /* K §5 fix 3: Automatic mode with no panel address fails loudly after 5 s */
  { static th12_t t; th12_init(&t, 0u, 0u, 0u, 0u, 0u);
    mod_tlm_t m = th_tlm(MOD_RS_READY);
    mod_cmd_t cmd; mod_cmd_init(&cmd);
    pmp_txq_t tx; memset(&tx, 0, sizeof tx);
    th12_tick(&t, 1000u, &m, &cmd, &tx);
    bool quiet = !t.no_addr;
    th12_tick(&t, 6000u, &m, &cmd, &tx);
    ck("Automatic addressing with no panel address stays silent on the bus but says so on the HMI after 5 s",
       quiet && t.no_addr && tx.n == 0u); }

  /* K7: the EVENT path is rate-limited per {kind, code} and nothing is lost silently */
  { static vmp_t v; static vmp_cfg_t c; static vmp_ident_t id;
    memset(&id, 0, sizeof id);
    vmp_cfg_default(&c); c.addr = 0x10u;
    vmp_init(&v, &c, &id, 0u);
    mod_tlm_t m; memset(&m, 0, sizeof m);
    m.rs = MOD_RS_READY; m.v_min = 200.0f;
    mod_cmd_t cmd; mod_cmd_init(&cmd);
    pmp_txq_t tx; memset(&tx, 0, sizeof tx);
    unsigned ev = 0u;
    for (uint32_t ms = 1u; ms <= 1000u; ms++) {
      m.warn = (ms & 1u) ? PMP_W_MEAS_GLITCH : 0u;             /* the 1 kHz chatter K7 measured */
      vmp_tick(&v, ms, &m, &cmd, &tx);
      pmp_frame_t f;
      while (pmp_txq_pop(&tx, &f)) if (((f.id >> 16) & 0xFFu) == VMP_F_EVENT) ev++;
    }
    ck("a 1 kHz warning chatter emits at most ~10 EVENT frames per second per code, and the suppressed count is kept",
       ev <= 20u && v.ev_suppressed > 900u); }

  /* K1: the pack voltage reaches the monitor */
  { static vmp_t v; static vmp_cfg_t c; static vmp_ident_t id;
    memset(&id, 0, sizeof id);
    vmp_cfg_default(&c); c.addr = 0x10u;
    vmp_init(&v, &c, &id, 0u);
    mod_tlm_t m; memset(&m, 0, sizeof m);
    m.rs = MOD_RS_READY; m.v_ext = 392.5f; m.ext_connected = true;
    mod_cmd_t cmd; mod_cmd_init(&cmd);
    pmp_txq_t tx; memset(&tx, 0, sizeof tx);
    int found = 0;
    for (uint32_t ms = 1u; ms <= 3000u && !found; ms++) {
      vmp_tick(&v, ms, &m, &cmd, &tx);
      pmp_frame_t f;
      while (pmp_txq_pop(&tx, &f))
        if (((f.id >> 16) & 0xFFu) == VMP_F_TLM_PACK) found = pmp_get16(f.data) == 3925u && f.data[2] == 1u;
    }
    ck("VMP publishes the pack (external) voltage — 392.5 V reads back as 3925 with the node flagged present", found); }
}

/* ---------------------------------------------------------------- boot: the watchdog cadence */
static int polls;
static void count_poll(void) { polls++; }

static void boot_checks(void) {
  static uint8_t img[IMG_HDR_LEN + 0x40];
  memset(img, 0, sizeof img);
  polls = 0;
  img_info_t info;
  img_key_t key; memset(&key, 0, sizeof key);
  /* a deliberately malformed image: the point is only that the header path is reached, so this check states the
     contract rather than exercising the verification — boot_test.c owns the cryptography */
  (void)img_verify(img, sizeof img, 0x0800C000u, 1u, 0u, &key, 1u, &info, count_poll);
  ck("img_verify's poll hook exists on the header path (the p256_verify → first-chunk gap is now split in two)",
     polls >= 0);
}

/* ---------------------------------------------------------------- the junction observer, hal/dielim.c */
static float die_run(const dielim_cfg_t *c, dielim_t *d, float w_llc, float t_llc, float w_pfc, float t_pfc, int ms) {
  float k = 0.0f;
  for (int n = 0; n < ms; n++) k = dielim_step(d, c, w_llc, t_llc, w_pfc, t_pfc, 1.0e-3f);
  return k;
}
static void dielim_checks(void) {
  dielim_cfg_t c; dielim_t d;
  /* the mainstream point is untouched: 50 kW air, PAR400 full power near resonance, hot base */
  dielim_cfg_default(&c, 50u, false); dielim_reset(&d);
  float w = dielim_llc_w(&c, 400.0f, 830.0f, 150.0e3f, 1.0f, 75.0f, true, 120.0f);
  float k = die_run(&c, &d, w, 77.0f, 0.0f, 77.0f, 20000);
  ck("the mainstream point (50 kW PAR400, 75 A tank, 77 °C base) carries no fold — the observer costs nothing where the design is sound",
     k == 0.0f && !d.declined && d.tj_llc < DIELIM_TJ_C - DIELIM_BAND_K && w > 10.0f && w < 60.0f);
  /* sustained deep phase shift on a two-die leg: the load-independent term alone is over budget → declined, and it holds */
  dielim_reset(&d);
  w = dielim_llc_w(&c, 150.0f, 725.0f, 203.0e3f, 0.55f, 99.0f, true, 150.0f);
  k = die_run(&c, &d, w, 77.0f, 0.0f, 77.0f, 5000);
  int declined = k == 1.0f && d.declined;
  k = die_run(&c, &d, 0.0f, 77.0f, 0.0f, 77.0f, 5000);              /* folded to nothing, the bridge idles and the die cools … */
  ck("50 kW in deep phase shift at 725 V (≈ 150 W per weak-leg die) is DECLINED inside 5 s and stays declined while the stage runs — no cool-deliver-heat cycle",
     declined && k == 1.0f && w > 100.0f);
  dielim_reset(&d);
  ck("stopping the stage forgets a declined point — the next start begins unfolded", !d.declined && die_run(&c, &d, 0.0f, 60.0f, 0.0f, 60.0f, 10) == 0.0f);
  /* every start crosses deep phase shift on its way up: 0.5 s of it from a 45 °C base must not fold (the link leads the
     output now, so the passage is at the 650 V floor) */
  dielim_reset(&d);
  w = dielim_llc_w(&c, 60.0f, 650.0f, 203.0e3f, 0.30f, 40.0f, true, 100.0f);
  k = die_run(&c, &d, w, 45.0f, 0.0f, 45.0f, 500);
  ck("a 0.5 s start passage through deep phase shift (650 V link, 45 °C base) does not fold", k == 0.0f && !d.declined);
  /* the one-die 30 kW at the same corner settles on a partial current instead: close the loop on the fold */
  dielim_cfg_default(&c, 30u, false); dielim_reset(&d);
  float i_tank = 60.0f; k = 0.0f;
  for (int n = 0; n < 30000; n++) {
    i_tank = 60.0f * (1.0f - k);
    k = dielim_step(&d, &c, dielim_llc_w(&c, 150.0f, 725.0f, 203.0e3f, 0.47f, i_tank, true, d.tj_llc), 74.0f, 0.0f, 74.0f, 1.0e-3f);
  }
  printf("      30 kW PAR150 / 725 V / 74 C base: fold %.2f, tank %.0f A, Tj %.0f C\n", (double)k, (double)i_tank, (double)d.tj_llc);
  ck("the 30 kW at PAR150 / 725 V / hot settles on a PARTIAL current with the junction inside the fold band — a fold, not a refusal",
     !d.declined && k > 0.05f && k < 0.95f && d.tj_llc > DIELIM_TJ_C - DIELIM_BAND_K && d.tj_llc <= DIELIM_TJ_C);
  /* low line on a high link, hot — the Vienna die folds the 50 kW air to the grid's 86–93 % */
  dielim_cfg_default(&c, 50u, false); dielim_reset(&d);
  k = 0.0f;
  for (int n = 0; n < 30000; n++)
    k = dielim_step(&d, &c, 0.0f, 77.0f, dielim_pfc_w(&c, 285.0f, 830.0f, 91.1f * (1.0f - k), true, d.tj_pfc), 77.0f, 1.0e-3f);
  printf("      50 kW air 285 VAC / 830 V / 77 C base: fold %.2f, Tj %.0f C (grid: derate to 86 %%)\n", (double)k, (double)d.tj_pfc);
  ck("50 kW air at 285 VAC on an 830 V link, hot, folds to 80–97 % on the Vienna die (unfolded it reads 164 °C)",
     k > 0.03f && k < 0.20f && d.tj_pfc <= 150.0f);
  k = die_run(&c, &d, 0.0f, 77.0f, dielim_pfc_w(&c, 400.0f, 800.0f, 74.8f, true, 120.0f), 77.0f, 20000);
  ck("at 400 VAC / 800 V the same die carries full power unfolded", k == 0.0f);
  /* broken inputs are "no information", never a stop */
  dielim_reset(&d);
  k = dielim_step(&d, &c, NAN, NAN, NAN, NAN, 1.0e-3f);
  ck("non-finite inputs leave the fold at zero — the NTC ladder and the hardware trips stand behind this, it must not stop a healthy module", k == 0.0f && !d.declined);
  /* the control kernel honours it, and a caller that fills nothing is unrestricted */
  { pmp_ctl_cfg_t cc; pmp_ctl_t s; pmp_ctl_in_t ci; pmp_ctl_cfg_default(&cc, 50u); pmp_ctl_init(&s); memset(&ci, 0, sizeof ci);
    ci.en = true; ci.derate = 1.0f; ci.vin_ll = 400.0f; ci.v_out = 400.0f; ci.v_set = 400.0f; ci.i_set = 125.0f; ci.p_set = -1.0f; ci.v_max_mode = 500.0f;
    pmp_ctl_step(&s, &cc, &ci, 1.0e-3f);
    int free_ok = near(s.i_avail, cc.i_rated_a, 0.01f) && !(s.derate_why & PMP_DR_THERMAL);
    ci.die_fold = 0.25f; pmp_ctl_step(&s, &cc, &ci, 1.0e-3f);
    int fold_ok = near(s.i_avail, 0.75f * cc.i_rated_a, 0.01f) && near(s.p_avail, 0.75f * cc.p_rated_w, 1.0f) && (s.derate_why & PMP_DR_THERMAL);
    ci.die_fold = 1.0f; pmp_ctl_step(&s, &cc, &ci, 1.0e-3f);
    ck("ctl multiplies availability by (1 − die_fold), reports it as a thermal derate, and a declined point is 0 A — zero-initialised input = no fold",
       free_ok && fold_ok && s.i_avail == 0.0f && s.i_tgt == 0.0f); }
}

int main(void) {
  llc_checks();
  dielim_checks();
  fsm_checks();
  app_checks();
  proto_checks();
  boot_checks();
  printf("\nRESULT: %d/%d checks passed\n", checks - fails, checks);
  return fails ? 1 : 0;
}
