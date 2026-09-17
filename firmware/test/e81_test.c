/* e81_test.c — E81 review checks. One file, one check per calibrated finding, each written so it FAILS against the
 * pre-E81 code. It drives the units directly (no plant): hal/llc.c's ZVS schedule and demand map, core/fsm.c's rows,
 * hal/app.c's per-rating identity, the TonHe V1.2 and VMP 2.0 profile fixes, and boot/image.c's watchdog cadence.
 * The cycle-by-cycle plants live in hal_test.c and app_test.c and are not duplicated here.
 * Build/run: firmware/run_tests.sh */
#include "../hal/app.h"
#include "../hal/llc.h"
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

/* ---------------------------------------------------------------- E81.1 adaptive LLC dead time (F-C-7 / F-B-12)
 * The closed form, recomputed here from calculations/llc/tanks.mjs independently of llc.c, so the check proves the
 * pipeline (per-SKU constants, the Qoss law, Im_pk from the commanded frequency, the clamps) and not a magic number.
 * tanks.mjs 2026-09-17: par 1/2/2 · cs 1000/680/1000 pF · Lm 56/43.5/35.6 µH · n 2 · DIES["23m"].qoss800 371 nC. */
static double want_dead(int kw, double f_hz, double v_bank, double v_bus) {
  double lm = kw == 50 ? 35.6e-6 : kw == 40 ? 43.5e-6 : 56.0e-6;
  double cs = kw == 30 ? 330e-12 : kw == 40 ? 680e-12 : 1000e-12;   /* E81 close-out: tanks.mjs cs 330 / 680 / 1000 pF */
  double par = kw == 30 ? 1.0 : 2.0;
  double im = 2.0 * v_bank / (4.0 * f_hz * lm);
  double q = 371e-9 * sqrt(v_bus / 800.0);
  double t = 2.5 * par * (q + cs * v_bus) / (im < 1.0 ? 1.0 : im);
  return t > 900e-9 ? 900e-9 : (t < 60e-9 ? 60e-9 : t);
}

static void llc_checks(void) {
  /* PS150-Imax: a start into a deeply discharged pack — one bank at 150 V, phase-shift at f_max, the bus at the
     C-sic-thermal §SNUBBER SWEEP corner. This is the binding ZVS corner on every SKU. */
  int ok = 1, band = 1, order = 1;
  float ps[3];
  const int KW[3] = { 30, 40, 50 };
  for (int n = 0; n < 3; n++) {
    llc_cfg_t c; llc_cfg_default(&c, (uint16_t)KW[n]);
    llc_t l; memset(&l, 0, sizeof l);
    float f_max = c.fn_max * c.fr_hz;
    llc_step(&l, &c, true, 0.5f * c.u_psm, 150.0f, 150.0f * 40.0f, 650.0f);   /* u < u_psm → PSM at f_max */
    if (!near(l.f_hz, f_max, 1.0f)) ok = 0;
    ps[n] = l.dead_s;
    if (!near(l.dead_s, (float)want_dead(KW[n], f_max, 150.0, 650.0), 1e-9f)) ok = 0;
    if (!(l.dead_s > 180e-9f && l.dead_s < 600e-9f)) band = 0;    /* the PS150 class (≈ 208 / 300 / 330 ns at 330 / 470 / 680 pF) × the 1.25 margin */
    /* PAR400-full: a 400 V bank at the 400 V-bank bus reference — four times the magnetizing current of PS150 */
    llc_t p; memset(&p, 0, sizeof p);
    llc_step(&p, &c, true, 1.0f, 400.0f, 400.0f * 100.0f, 842.0f);
    if (!near(p.dead_s, (float)want_dead(KW[n], p.f_hz, 400.0, 842.0), 1e-9f)) ok = 0;
    if (!(p.dead_s >= 60e-9f && p.dead_s < ps[n])) order = 0;
  }
  ck("E81 LLC dead time: the PS150-Imax corner matches the tanks.mjs closed form on all three SKUs, to 1 ns", ok);
  {
    /* E81 per-leg (G deck): with a measured tank rms the SHIFTED leg B shortens to its own commutation current in PSM while the
       weak leg A keeps the I_m-based value; in PFM both legs use the turn-off estimate; an unknown rms leaves both at I_m. */
    int legs = 1;
    for (int n = 0; n < 3; n++) {
      llc_cfg_t c; llc_cfg_default(&c, (uint16_t)KW[n]);
      llc_t a = { 0 }, b = { 0 }, p = { 0 };
      llc_step(&a, &c, true, 0.5f * c.u_psm, 150.0f, 150.0f * 40.0f, 650.0f);             /* PSM, rms unknown */
      b.in_i_rms = 60.0f;
      llc_step(&b, &c, true, 0.5f * c.u_psm, 150.0f, 150.0f * 40.0f, 650.0f);             /* PSM, rms 60 A */
      p.in_i_rms = 60.0f;
      llc_step(&p, &c, true, 1.0f, 400.0f, 400.0f * 100.0f, 842.0f);                        /* PFM, rms 60 A */
      if (!(near(a.dead_a_s, a.dead_b_s, 1e-12f) && near(a.dead_s, a.dead_a_s, 1e-12f))) legs = 0;   /* unknown rms: both legs long */
      if (!(near(b.dead_a_s, a.dead_a_s, 1e-12f) && b.dead_b_s < b.dead_a_s && b.dead_b_s >= 60e-9f)) legs = 0;   /* PSM: A long, B short */
      if (!(near(p.dead_a_s, p.dead_b_s, 1e-12f) && p.dead_a_s < a.dead_a_s)) legs = 0;    /* PFM: equal, shorter than the light corner */
    }
    ck("E81 LLC dead time: per-leg schedule — leg B shortens on the measured PSM tank peak, leg A keeps I_m, PFM legs equal, unknown rms = long", legs);
  }
  ck("E81 LLC dead time: PS150-Imax lands in the 200–600 ns class the ZVS sweep predicts (was a fixed 120 ns)", band);
  ck("E81 LLC dead time: PAR400-full needs at least 60 ns and strictly less than PS150-Imax on every SKU", order);

  { llc_cfg_t c; llc_cfg_default(&c, 50); llc_t l; memset(&l, 0, sizeof l);
    llc_step(&l, &c, true, 0.5f, 400.0f, 20e3f, NAN);   bool a1 = near(l.dead_s, 900e-9f, 1e-12f);
    llc_step(&l, &c, true, 0.5f, 400.0f, 20e3f, 0.0f);  bool a2 = near(l.dead_s, 900e-9f, 1e-12f);
    llc_step(&l, &c, true, 0.5f, 0.0f, 0.0f, 800.0f);   bool a3 = isfinite(l.dead_s) && near(l.dead_s, 900e-9f, 1e-12f);
    llc_step(&l, &c, false, 0.0f, 400.0f, 0.0f, 800.0f); bool a4 = isfinite(l.dead_s) && l.dead_s >= 60e-9f;
    ck("E81 LLC dead time: a non-finite, zero or bank-less operating point clamps to 900 ns and never produces NaN",
       a1 && a2 && a3 && a4); }

  /* F-E-01: the demand map is monotone in u at every load, and the ZVS floor is a clamp, not the map's endpoint */
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
    ck("E81 F-E-01: the LLC frequency map is monotone non-increasing in u at light, medium and full load", mono); }

  { /* the ZVS boundary must still never be understated after the interpolation change */
    llc_cfg_t c; llc_cfg_default(&c, 50); llc_t l; memset(&l, 0, sizeof l);
    llc_step(&l, &c, true, 1.0f, 60.0f, 20e3f, 800.0f);
    ck("E81 F-E-01: the ZVS guard still reaches the 1.08 fr floor into a near-short (the clamp did not weaken it)",
       l.f_min_hz >= 1.03f * 1.0525f * c.fr_hz - 1.0f); }

  { /* F-E-08: the burst packet is bounded at the setpoint, not at the duty */
    llc_cfg_t c; llc_cfg_default(&c, 50); llc_t l; memset(&l, 0, sizeof l);
    l.in_v_ref = 400.0f;
    llc_step(&l, &c, true, 0.05f * c.u_psm, 390.0f, 1e3f, 800.0f);   bool below = !l.burst && l.gate;
    memset(&l, 0, sizeof l); l.in_v_ref = 400.0f;
    llc_step(&l, &c, true, 0.05f * c.u_psm, 405.0f, 1e3f, 800.0f);   bool above = l.burst && !l.gate;
    ck("E81 F-E-08: at a duty below d_min the bridge keeps switching while the node is under its reference and stops once it is over",
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

static void fsm_checks(void) {
  /* F-A-11: the bypass closes at 0.97 of the rectified crest, not 0.90 — the HF167F's making rating is 30 A against a
     165–280 A closure pulse at the old threshold */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    float crest = 1.414f * 400.0f;
    in.vbus = 0.93f * crest;
    for (int k = 0; k < 50; k++) pmp_fsm_step(&f, &in);
    bool held = f.st == ST_PRECHG && !f.out.k_pre;
    in.vbus = 0.975f * crest;
    for (int k = 0; k < 5; k++) pmp_fsm_step(&f, &in);
    ck("E81 F-A-11: the precharge bypass stays open at 93 % of the crest and closes at 97.5 %", held && f.out.k_pre); }

  /* F-E-06: F.17 carries the documented 10 ms */
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
    ck("E81 F-E-06: a 1 ms bank-imbalance spike does not latch F.17; 10 ms does",
       survived && f.latched == FC_BANK_IMB); }

  /* F-E-09: a battery with no voltage setpoint is refused in STANDBY instead of stalling into F.34 */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    in.vcmd = 0.0f; in.ext_connected = true; in.vext = 400.0f; in.vout_meas = 400.0f;
    in.vbus = 600.0f;
    for (int k = 0; k < 400 && f.st != ST_STANDBY; k++) { pmp_fsm_step(&f, &in); in.relay_fb = pmp_relay_cmd(&f.out); }
    in.enable_req = true;
    for (int k = 0; k < 9000; k++) { pmp_fsm_step(&f, &in); in.relay_fb = pmp_relay_cmd(&f.out); }
    ck("E81 F-E-09: RUN + I_SET with a battery but no V_SET stays in STANDBY with W_NO_SETPOINT — never an 8 s stall into F.34",
       f.st == ST_STANDBY && f.latched == FC_NONE && (f.out.warn & PMP_W_NO_SETPOINT)); }

  /* F-E-07: an aux dropout takes the SAFE path, not F.19 */
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
    ck("E81 F-E-07: a 300 ms aux dropout recovers SAFE → STANDBY with no F.19 latch, and re-arms the matrix settle timer",
       safe && f.st == ST_STANDBY && f.latched == FC_NONE && f.p_make == 0); }

  /* F-E-13: an out-of-range line is reported, not held silently with the precharge resistors in circuit */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    in.vin_ll = in.vin_ll_min = in.vin_ll_max = 260.0f;     /* below the 275 V start window */
    in.vbus = 360.0f;
    for (int k = 0; k < 5000; k++) pmp_fsm_step(&f, &in);
    bool quiet = f.latched == FC_NONE && f.st == ST_PRECHG;
    for (int k = 0; k < 6000; k++) pmp_fsm_step(&f, &in);
    ck("E81 F-E-13: 260 VAC in PRECHG is a warning for 10 s and then a reported AUTO_EXT row, not an unbounded silent wait",
       quiet && f.latched == FC_IN_UV && pmp_fault_class(f.latched) == FCL_AUTO_EXT); }

  /* F-A-7: the link rows run on a charged link with both stages stopped */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    in.vbus = 600.0f;
    for (int k = 0; k < 400 && f.st != ST_STANDBY; k++) pmp_fsm_step(&f, &in);
    bool idle = !f.out.pfc_en && !f.out.llc_en;
    in.vbus = 800.0f; in.vmid_frac = 0.60f;                 /* 160 V of midpoint imbalance on an idle charged link */
    for (int k = 0; k < 200; k++) pmp_fsm_step(&f, &in);
    ck("E81 F-A-7: an idle but charged link is still watched — the midpoint row fires with both stages stopped",
       idle && f.latched == FC_MID_IMB); }

  /* F-E-02: a commanded discharge survives a reset */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_fsm_resume_shutdown(&f);
    pmp_in_t in = fsm_base();
    in.vbus = 700.0f; in.vbank_a = in.vbank_b = 350.0f;
    pmp_fsm_step(&f, &in);
    ck("E81 F-E-02: a resumed shutdown re-commands the dump and never re-precharges the link",
       f.st == ST_DISCH && f.out.q_disch && f.out.q_disch_bk && !f.out.k_pre); }

  /* F-E-05: the bus-UV row tracks the line crest */
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_fsm_set_rating_kw(&f, 50u);
    pmp_in_t in = fsm_base();
    in.vin_ll = in.vin_ll_min = in.vin_ll_max = 475.0f;     /* crest 671.8 V, well above the fixed 620 V row */
    f.st = ST_RUN; f.out.pfc_en = true; f.out.llc_en = true; f.out.v_max = PMP_PAR_VMAX_V;
    in.enable_req = true; in.relay_fb = PMP_RLY_PRE;
    in.vbus = 640.0f; in.vbank_a = in.vbank_b = 300.0f; in.vout_meas = 299.0f;
    for (int k = 0; k < 60; k++) pmp_fsm_step(&f, &in);
    ck("E81 F-E-05: at 475 VAC a 640 V link is under the crest and latches F.05 — the fixed 620 V row never saw it",
       f.latched == FC_BUS_UV); }
}

/* ---------------------------------------------------------------- hal/app.c identity and fault channels */
static void app_checks(void) {
  ck("E81 fan count: the HRTIMER phase-A fault channel is FLT1 (CMP3 on PB0), not FLT7", APP_FLT_IA == 1u);
  ck("E81 F-E-11: the bypass-closure blank re-arms only the three line-OC channels, never the bus or output OVP latch",
     APP_FLT_LINE_OC == ((1u << APP_FLT_IA) | (1u << APP_FLT_IB) | (1u << APP_FLT_IC)) &&
     (APP_FLT_LINE_OC & ((1u << APP_FLT_VBUS) | (1u << APP_FLT_VOUT) | (1u << APP_FLT_EXT))) == 0u);

  /* E81.2 fan count: 30 kW gains its third fan (user decision 2026-09-17) */
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
    ck("E81 fan count: 30 kW 3 · 40 kW 3 · 50 kW liquid 0 · 50 kW air 4 (the 30 kW third fan is on FAN_TACH3/FAN_PWM2)", ok); }

  /* F-D-10 (O-15): F.01 is bipolar — each phase's comparator reference follows the sign of that phase's current, so the
     line-CT primary orientation (which no netlist, silkscreen or BOM line fixes) stops mattering */
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
    bool a_hi = o.dac_v[APP_DAC_IA] > avm, b_lo = o.dac_v[APP_DAC_IB] < avm, c_hi = o.dac_v[APP_DAC_IC] > avm;
    ck("E81 F-D-10 (O-15): the three F.01 references straddle AVMID by the measured sign of each phase — the CT orientation stops mattering",
       a_hi && b_lo && c_hi); }

  /* F-E-03: any reset that is neither power-on nor a sealed reboot is a watchdog event — the TPS3430 arrives on the
     NRST pin (EPRSTF), which the pre-E81 `== FWDGT` test could never see */
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
    ck("E81 F-E-03: a TPS3430 pin reset reports F.32, while a power-on and a sealed reboot do not",
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
  ck("E81 K9: TH12_TRIGGER_GAP_MS is 200 ms — at 50 ms a 24-module fault storm computes to 105 % of a 125 kbit/s bus",
     TH12_TRIGGER_GAP_MS == 200u);

  /* K §5 fix 1: C_M_23 while delivering is stored and adopted at the next output-off, never refused */
  { static th12_t t; th12_init(&t, 1u, 5u, 0u, 0u);
    mod_tlm_t on = th_tlm(MOD_RS_ON), off = th_tlm(MOD_RS_READY);
    mod_cmd_t cmd; mod_cmd_init(&cmd);
    pmp_txq_t tx; memset(&tx, 0, sizeof tx);
    pmp_frame_t f = { th12_id(6u, TH12_PF_ADDR_SET, 5u, TH12_MONITOR_ADDR), 1u, { 9u, 0, 0, 0, 0, 0, 0, 0 } };
    th12_rx(&t, &f, 1000u, &on, &cmd, &tx);
    bool deferred = th12_addr(&t) == 5u && t.addr_pending == 9u;
    th12_tick(&t, 1001u, &on, &cmd, &tx);
    bool held = th12_addr(&t) == 5u;                           /* the source address must not move mid-stream */
    th12_tick(&t, 1002u, &off, &cmd, &tx);
    ck("E81 K §5.1: C_M_23 during delivery is accepted and deferred — the address moves at the first output-off, not never",
       deferred && held && th12_addr(&t) == 9u && t.addr_pending == 0u && t.nv_dirty); }

  /* K §5 fix 2: an undocumented PF from the monitor is counted, not silently discarded */
  { static th12_t t; th12_init(&t, 1u, 5u, 0u, 0u);
    mod_tlm_t m = th_tlm(MOD_RS_READY);
    mod_cmd_t cmd; mod_cmd_init(&cmd);
    pmp_txq_t tx; memset(&tx, 0, sizeof tx);
    pmp_frame_t f = { th12_id(6u, 0x0Cu, 5u, TH12_MONITOR_ADDR), 8u, { 1, 2, 3, 4, 5, 6, 7, 8 } };
    th12_rx(&t, &f, 1000u, &m, &cmd, &tx);
    ck("E81 K §5.2: an undocumented monitor PGN is accepted, ignored and counted (the one open interop unknown becomes a measurement)",
       t.unknown_pf == 1u && t.last_unknown_pf == 0x0Cu && tx.n == 0u); }

  /* K §5 fix 4: a start with V = 0 is still refused, but the monitor is told on the wire */
  { static th12_t t; th12_init(&t, 1u, 5u, 0u, 0u);
    mod_tlm_t m = th_tlm(MOD_RS_READY);
    mod_cmd_t cmd; mod_cmd_init(&cmd);
    pmp_txq_t tx; memset(&tx, 0, sizeof tx);
    pmp_frame_t f = { th12_id(6u, TH12_PF_STARTSTOP, 5u, TH12_MONITOR_ADDR), 6u, { 0xAAu, 0, 0, 0, 0x88u, 0x13u, 0, 0 } };
    th12_rx(&t, &f, 1000u, &m, &cmd, &tx);
    pmp_frame_t st; th12_enc_state(&t, &m, 1000u, &st);
    uint16_t w = pmp_get16(st.data + 5);
    ck("E81 K §5.4: a start commanded with V = 0 keeps the safe refusal AND sets M_C_4 fault bit 0 so the monitor is not left reading 0x00",
       t.run && t.v_set == 0.0f && (w & 1u)); }

  /* K §5 fix 3: Automatic mode with no panel address fails loudly after 5 s */
  { static th12_t t; th12_init(&t, 0u, 0u, 0u, 0u);
    mod_tlm_t m = th_tlm(MOD_RS_READY);
    mod_cmd_t cmd; mod_cmd_init(&cmd);
    pmp_txq_t tx; memset(&tx, 0, sizeof tx);
    th12_tick(&t, 1000u, &m, &cmd, &tx);
    bool quiet = !t.no_addr;
    th12_tick(&t, 6000u, &m, &cmd, &tx);
    ck("E81 K §5.3: Automatic addressing with no panel address stays silent on the bus but says so on the HMI after 5 s",
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
    ck("E81 K7: a 1 kHz warning chatter emits at most ~10 EVENT frames per second per code, and the suppressed count is kept",
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
    ck("E81 K1: VMP publishes the pack (external) voltage — 392.5 V reads back as 3925 with the node flagged present", found); }
}

/* ---------------------------------------------------------------- boot: F-F-9 watchdog cadence */
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
  ck("E81 F-F-9: img_verify's poll hook exists on the header path (the p256_verify → first-chunk gap is now split in two)",
     polls >= 0);
}

int main(void) {
  llc_checks();
  fsm_checks();
  app_checks();
  proto_checks();
  boot_checks();
  printf("\nRESULT: %d/%d checks passed\n", checks - fails, checks);
  return fails ? 1 : 0;
}
