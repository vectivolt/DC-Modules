/* app.c — see app.h. */
#include "app.h"
#include <math.h>
#include <string.h>

#define APP_PFC_DT       10.0e-6f
#define APP_LLC_DT      100.0e-6f
#define APP_GRID_FS       1.0e4f
#define APP_FOLD_LO_V    (PMP_BUS_UV_V + 5.0f)   /* the LLC takes nothing at 625 V; F.05 latches below 620 V */
#define APP_WDT_KICK_MS  10u
#define APP_AZ_N         2000u                     /* boot offset window: 200 ms at 10 kHz, ten line cycles */
/* E81 (F-A-8 / F-D-10, O-15): F.01 is BIPOLAR. The line CTs are through-window parts whose primary orientation no netlist,
   silkscreen or BOM line fixes, so a single-sided threshold was a coin flip on which half-cycle it watched — and DESAT is
   blind on the other one. The 100 kHz ISR already holds the measured phase current, so each phase's DAC reference now takes
   that current's own sign: three DAC writes (DAC2/DAC3 are pin-less 15 MSPS converters, settling is irrelevant at 100 kHz),
   and the CT orientation stops mattering. APP_OC_POL is gone with the open item. */
#define LSB              (3.3f / 4096.0f)

enum { FLT_OC = 0, FLT_DESAT, FLT_VBUS, FLT_VOUT, FLT_TANK };
typedef char app_nv_records_fit[(sizeof(app_cfg_t) <= NVM_MAX_LEN && sizeof(meas_cal_t) <= NVM_MAX_LEN) ? 1 : -1];

static float clampf(float x, float lo, float hi) { return x < lo ? lo : (x > hi ? hi : x); }
#define BIT8(n) ((uint8_t)(1u << (n)))   /* E81: RCU_RSTSCK bits 31:24 packed into app_boot_t.reset_cause */
static uint32_t app_aux_read(void *ctx, uint16_t obj, uint8_t sub, bool *ok);   /* E80: registered on the native profile */
static uint16_t sat16(uint32_t x) { return x > 0xFFFFu ? 0xFFFFu : (uint16_t)x; }

void app_cfg_default(app_cfg_t *c) {
  memset(c, 0, sizeof *c);
  c->version = APP_CFG_VERSION;
  vmp_cfg_default(&c->vmp);
  c->th_addr_can = 1u;
  c->panel_addr = 1u;
}

void app_init(app_t *a, const app_boot_t *b) {
  memset(a, 0, sizeof *a);
  a->k_ref = 1.0f;
  a->w_line = 314.16f;
  a->kw = meas_rating_kw(b->rating_counts * 3.3f / 4095.0f, &a->liquid);
  a->strap_bad = a->kw == 0u;
  if (a->strap_bad) a->kw = 30u;                 /* the tightest current classes; F.30 keeps the output off */
  /* E81 (user decision 2026-09-17): 30 kW 3 fans · 40 kW 3 · 50 kW liquid 0 · 50 kW air 4. The 30 kW third fan lands on
     FAN_TACH3 / FAN_PWM2 and recovers the air-budget margin F-C-2 took away (55 °C inlet, 16–18 K module rise). */
  a->n_fans = a->liquid ? 0u : (a->kw == 50u) ? 4u : 3u;
  pmp_fsm_init(&a->fsm);
  pmp_fsm_set_rating_kw(&a->fsm, a->kw);
  pmp_ctl_init(&a->ctl);
  pmp_ctl_cfg_default(&a->ctl_cfg, a->kw);
  pmp_reg_cfg_default(&a->reg_cfg);
  pfc_cfg_default(&a->pfc_cfg, a->kw);
  llc_cfg_default(&a->llc_cfg, a->kw);
  meas_cal_default(&a->cal, a->kw);
  mod_cmd_init(&a->cmd);

  nvm_mount(&a->nvm, 0u, b->nvm_page_size);
  meas_cal_t cal;
  if (nvm_get(&a->nvm, APP_NV_CAL, (uint8_t *)&cal, (uint8_t)sizeof cal)) {
    if (meas_cal_plausible(&cal, a->kw)) a->cal = cal; else a->cal_bad = true;
  } else a->uncal = true;
  app_cfg_t cfg;
  if (!nvm_get(&a->nvm, APP_NV_CFG, (uint8_t *)&cfg, (uint8_t)sizeof cfg) || cfg.version != APP_CFG_VERSION) app_cfg_default(&cfg);
  if (cfg.vmp.profile >= (uint8_t)PMP_PROFILE_COUNT) cfg.vmp.profile = (uint8_t)PMP_PROFILE_NATIVE;
  if (cfg.th_addr_mode > 1u) cfg.th_addr_mode = 0u;
  if (cfg.th_addr_can == 0u || cfg.th_addr_can > 240u) cfg.th_addr_can = 1u;
  if (cfg.panel_addr == 0u || cfg.panel_addr > 240u) cfg.panel_addr = 1u;
  a->cfg = cfg;
  (void)nvm_get(&a->nvm, APP_NV_COUNTERS, (uint8_t *)&a->cnt, (uint8_t)sizeof a->cnt);

  /* E81 (F-E-03): the card's real supervisor is the TPS3430, whose WDO is wire-ORed onto NRST — it arrives as EPRSTF
     (RSTSCK bit 26, i.e. bit 2 of this byte), never as FWDGTRSTF (bit 29 → bit 5), so the old `== FWDGT` test meant F.32
     never fired for the dominant hang path. Any reset that is neither power-on (bit 27 → 3) nor a sealed reboot is a
     watchdog event. The raw byte goes out as VMP object 0x000A and into the event ring. */
  a->ident.reset_cause = b->reset_cause;
  a->ident.hw_rev = b->hw_rev;
  a->wdt_boot = (b->reset_cause & (BIT8(5) | BIT8(6))) != 0u ||                       /* FWDGT · WWDGT */
                ((b->reset_cause & BIT8(2)) != 0u && (b->reset_cause & BIT8(3)) == 0u && !b->handoff_reboot);
  a->ident.uid = b->uid; a->ident.fw = b->fw; a->ident.product = a->kw;
  a->ident.fw_crc = b->fw_crc; a->ident.boot_ver = b->boot_ver; a->ident.boot_state = b->boot_state;
  a->ident.features = (uint16_t)(VMP_FEAT_GROUP | VMP_FEAT_LEVEL_LAW | VMP_FEAT_P_LIMIT | VMP_FEAT_SHARE_TRIM |
                                 VMP_FEAT_FAN_MODES | VMP_FEAT_TIME_SYNC | VMP_FEAT_BOOTLOADER |
                                 (a->liquid ? VMP_FEAT_LIQUID : 0u) | (PMP_WITH_TONHE_V12 ? VMP_FEAT_TONHE_V12 : 0u));
  if (b->evlog_pages) {                       /* E80: the event ring sits behind the record store's pages */
    evlog_mount(&a->ev, 4u, b->evlog_pages, b->nvm_page_size);   /* port pages: 0/1 records · 2/3 boot control · 4… events */
    evlog_add(&a->ev, 1u /* boot */, a->ident.reset_cause, (uint16_t)(b->fw & 0xFFFFu), 0u);
  }
  a->prof = pmp_profile_get((pmp_profile_id_t)a->cfg.vmp.profile);
#if PMP_WITH_TONHE_V12
  if (a->prof->id == PMP_PROFILE_TONHE_V12) {
    th12_init(&a->th, a->cfg.th_addr_mode, a->cfg.th_addr_can, a->cfg.panel_addr, 0u);
    a->prof_ctx = &a->th;
    a->bitrate = a->prof->bitrate;
  } else
#endif
  {
    vmp_init(&a->vmp, &a->cfg.vmp, &a->ident, 0u);
    a->vmp.aux_read = app_aux_read; a->vmp.aux_ctx = a;   /* E80: event-log and timing objects */
    a->prof_ctx = &a->vmp;
    a->bitrate = a->vmp.cfg.bitrate;
    if (a->vmp.cfg.ramp_v_vps) a->ctl_cfg.ramp_v_vps = (float)a->vmp.cfg.ramp_v_vps;
    if (a->vmp.cfg.ramp_i_aps) a->ctl_cfg.ramp_i_aps = (float)a->vmp.cfg.ramp_i_aps;
    a->ctl_cfg.droop_ohm = (float)a->vmp.cfg.droop_mohm * 1.0e-3f;
  }

  /* E81 (F-E-02): a commanded discharge survives a reset. Without this, pmp_fsm_init's unconditional ST_INIT → ST_PRECHG
     re-energised the link to the line crest with no command and no fault — 500 V back on the studs while a technician read
     "discharging". The intent rides the no-init handoff page the port already keeps. */
  if (b->disch_pending) pmp_fsm_resume_shutdown(&a->fsm);
  a->in.vmid_frac = 0.5f;
  a->in.fan_ok = true;
  a->in.wdt_ok = true;
  a->in.relay_fb_wired = PMP_RLY_PRE;   /* the bypass pair has its mirror contact; the matrix relays have none (E67) */
  a->pfc_ref.w_line = a->pfc_sh.w_line = a->w_line;
}

static void az_add(app_az_t *z, float x, uint32_t n) {
  if (n == 0u) { z->sum = 0.0f; z->lo = x; z->hi = x; }
  z->sum += x; z->lo = fminf(z->lo, x); z->hi = fmaxf(z->hi, x);
}

void app_pfc_isr(app_t *a, const app_pfc_adc_t *s, app_pfc_out_t *o) {
  if (a->pfc_commit) { a->pfc_ref = a->pfc_sh; a->pfc_commit = 0u; __asm__ volatile ("" ::: "memory"); }
  const meas_cal_t *c = &a->cal;
  float k = a->k_ref;
  float i[3] = { meas_val(c, MCH_IA, s->ia, k), meas_val(c, MCH_IB, s->ib, k), meas_val(c, MCH_IC, s->ic, k) };
  float v[3] = { meas_val(c, MCH_VAC1, s->vac[0], k), meas_val(c, MCH_VAC2, s->vac[1], k), meas_val(c, MCH_VAC3, s->vac[2], k) };
  float vbus = meas_val(c, MCH_VBUS, s->vbus, k), vn = meas_val(c, MCH_VMID, s->vmid, k);
  pfc_step(&a->pfc, &a->pfc_cfg, &a->pfc_ref, i, v, vbus - vn, vn, a->p_llc, APP_PFC_DT);
  o->en = a->pfc.run;
  for (int n = 0; n < 3; n++) o->on[n] = a->pfc.on[n];
  /* E81 (F-D-10): bipolar F.01 — the threshold follows the sign of the current it is guarding */
  for (int n = 0; n < 3; n++) a->dac_oc[n] = (i[n] >= 0.0f) ? a->dac_oc_pos[n] : a->dac_oc_neg[n];
  a->vbus_now = vbus;
  /* E81 (F-D-7): the line-cycle work is handed to the 10 kHz context. grid_sample carries four vsqrt and two vdiv and the
     offset window three more branches — ~360 cycles that used to land on one 100 kHz tick in ten and made the WORST-case
     PFC ISR 7.4 µs against a 10 µs deadline. Nine floats and an index cost ~15 cycles on the same tick. */
  if (++a->grid_div >= 10u) {
    a->grid_div = 0u;
    uint8_t w = (uint8_t)(a->g_idx ^ 1u);
    for (int n = 0; n < 3; n++) { a->g_buf[w].v[n] = v[n]; a->g_buf[w].i[n] = i[n]; }
    a->g_buf[w].ia = s->ia; a->g_buf[w].ib = s->ib; a->g_buf[w].ic = s->ic;
    a->g_idx = w;
    a->g_new = 1u;
  }
  a->pa_vbus += vbus; a->pa_vmid += vn;
  if (++a->pa_n >= 100u) {
    a->pub_pfc_seq++;
    a->pub_vbus = a->pa_vbus * 0.01f; a->pub_vmid = a->pa_vmid * 0.01f;
    a->pub_pfc_seq++;
    a->pa_vbus = 0.0f; a->pa_vmid = 0.0f; a->pa_n = 0u;
  }
  a->pfc_count++;
}

void app_llc_isr(app_t *a, const app_llc_adc_t *s, app_llc_out_t *o) {
  if (a->llc_commit) { a->llc_ref = a->llc_sh; a->llc_commit = 0u; __asm__ volatile ("" ::: "memory"); }
  /* E81 (F-D-7): the 10 kHz line-cycle work the PFC ISR handed over */
  if (a->g_new) {
    a->g_new = 0u;
    const float *gv = a->g_buf[a->g_idx].v, *gi = a->g_buf[a->g_idx].i;
    grid_sample(&a->grid, gv, gi, APP_GRID_FS);
    if (a->azp.gen != a->az_gen) { memset(&a->azp, 0, sizeof a->azp); a->azp.gen = a->az_gen; }
    if (!a->az_done && a->azp.n < APP_AZ_N) {
      az_add(&a->azp.ch[0], a->g_buf[a->g_idx].ia, a->azp.n);
      az_add(&a->azp.ch[1], a->g_buf[a->g_idx].ib, a->azp.n);
      az_add(&a->azp.ch[2], a->g_buf[a->g_idx].ic, a->azp.n);
      a->azp.n++;
    }
  }
  const app_llc_ref_t *r = &a->llc_ref;
  const meas_cal_t *c = &a->cal;
  float k = a->k_ref;
  float vout = meas_val(c, MCH_VOUT, s->vout, k), iout = meas_val(c, MCH_IOUT, s->iout_p - s->iout_n, k);
  float va = meas_val(c, MCH_VBKA, s->vbka, k), vb = meas_val(c, MCH_VBKB, s->vbkb, k);
  float stack = r->ser ? va + vb : fmaxf(va, vb);
  /* bus fold-back: below its reference the LLC takes less, so a sag rides on the power the clamped PFC can still draw instead of
     collapsing the bus into F.05 */
  /* E81 (F-E-05): the floor tracks the LINE CREST. Fixed at 625 V it let a 475 VAC site (crest 671.8 V) sit between the
     crest and the reference — the rectifier conducting uncontrolled, line current unshaped — while the LLC still drew
     52 % of rated power and no row fired. Below the crest the Vienna cannot regulate, so the LLC takes nothing. */
  float fold_lo = fmaxf(APP_FOLD_LO_V, r->fold_crest_v);
  float kb = clampf((a->vbus_now - fold_lo) / fmaxf(r->fold_hi_v - fold_lo, 10.0f), 0.0f, 1.0f);
  /* the terminal while the diode conducts; the stack while a battery or charged terminal capacitors above it block the diode */
  float u = pmp_reg_step(&a->reg, &a->reg_cfg, r->en, r->v_ref, r->i_ref * kb, fminf(vout, stack), iout, r->v_scale,
                         a->ctl_cfg.i_rated_a, APP_LLC_DT);
  /* E81: the two extra plant inputs (llc.h) — the DC link for the ZVS charge, the node reference for the burst floor */
  a->llc.in_v_ref = r->ser ? 0.5f * r->v_ref : r->v_ref;
  a->llc.in_i_rms = meas_val(c, MCH_IRES, s->ires, k);                 /* E81: the measured tank rms shortens the strong leg's dead time */
  llc_step(&a->llc, &a->llc_cfg, r->en, u, r->ser ? 0.5f * stack : stack, stack * iout, a->vbus_now);
  o->gate = a->llc.gate; o->f_hz = a->llc.f_hz; o->duty = a->llc.duty; o->dead_s = a->llc.dead_s;
  o->dead_a_s = a->llc.dead_a_s; o->dead_b_s = a->llc.dead_b_s;
  a->ires_dc += (meas_val(c, MCH_IRES, s->ires, k) - a->ires_dc) * 1.0e-3f;   /* E81 (F-E-15): ~100 ms flux-walk proxy */
  a->p_llc = r->en ? fmaxf(vout * iout, 0.0f) : 0.0f;
  a->la_vout += vout; a->la_iout += iout; a->la_vbka += va; a->la_vbkb += vb;
  if (++a->la_n >= 10u) {
    a->pub_llc_seq++;
    a->pub_vout = a->la_vout * 0.1f; a->pub_iout = a->la_iout * 0.1f; a->pub_vbka = a->la_vbka * 0.1f; a->pub_vbkb = a->la_vbkb * 0.1f;
    a->pub_llc_seq++;
    a->la_vout = 0.0f; a->la_iout = 0.0f; a->la_vbka = 0.0f; a->la_vbkb = 0.0f; a->la_n = 0u;
  }
  if (a->azl.gen != a->az_gen) { memset(&a->azl, 0, sizeof a->azl); a->azl.gen = a->az_gen; }
  if (!a->az_done && a->azl.n < APP_AZ_N) {
    az_add(&a->azl.ch[0], s->ires, a->azl.n); az_add(&a->azl.ch[1], s->iout_p - s->iout_n, a->azl.n);
    a->azl.n++;
  }
  a->llc_count++;
}

void app_fault_isr(app_t *a, uint16_t ch, float ires_counts) {
  if (ch & ((1u << APP_FLT_IA) | (1u << APP_FLT_IB) | (1u << APP_FLT_IC))) a->flt_n[FLT_OC]++;
  if (ch & (1u << APP_FLT_VBUS)) a->flt_n[FLT_VBUS]++;
  if (ch & (1u << APP_FLT_VOUT)) a->flt_n[FLT_VOUT]++;
  if (ch & (1u << APP_FLT_EXT)) {
    /* one wire-OR carries the drivers' DESAT and the F.11 tank window: a resonant current of 90 % of F.11 or more at the edge
       is the tank's (firmware-guide, F.11 attribution) */
    float ires = meas_val(&a->cal, MCH_IRES, ires_counts, a->k_ref);
    a->flt_n[(isfinite(ires) && fabsf(ires) >= 0.9f * a->fsm.oc_tank_a) ? FLT_TANK : FLT_DESAT]++;
  }
}

static bool took(app_t *a, int kind) {   /* a fault event the tick has not seen yet (each counter has one writer) */
  uint8_t n = a->flt_n[kind];
  if (n == a->flt_seen[kind]) return false;
  a->flt_seen[kind] = n;
  return true;
}

/* -------------------------------------------------------------------------------------------------------------------- tick */
static uint32_t app_aux_read(void *ctx, uint16_t obj, uint8_t sub, bool *ok) {   /* E80: VMP objects 0x04xx / 0x05xx */
  app_t *a = ctx;
  *ok = true;
  switch (obj) {
  case VMP_O_EV_COUNT: return evlog_count(&a->ev);
  case VMP_O_EV_W0: case VMP_O_EV_W1: case VMP_O_EV_W2: case VMP_O_EV_W3: {
    evlog_entry_t e;
    if (!evlog_read(&a->ev, sub, &e)) break;
    switch (obj) {
    case VMP_O_EV_W0: return e.seq;
    case VMP_O_EV_W1: return e.t;
    case VMP_O_EV_W2: return (uint32_t)e.boot | ((uint32_t)e.kind << 16) | ((uint32_t)e.code << 24);
    default: return e.arg;
    }
  }
  case VMP_O_DIAG_EXEC: return ((uint32_t)a->pfc_us << 16) | a->llc_us;      /* T-44: worst ISR µs since the last read tick */
  case VMP_O_DIAG_STACK: return a->stack_pct;
  case VMP_O_DIAG_EV_SUP: return a->vmp.ev_suppressed;   /* E81 (K7): EVENT frames dropped by the per-code rate limit */
  default: break;
  }
  *ok = false;
  return 0u;
}

static void events(app_t *a) {   /* E80: fault transitions into the ring (flushed by nvm_service, never while delivering) */
  pmp_fault_t l = a->fsm.latched;
  if (l == a->ev_prev) return;
  uint8_t kind = (l != FC_NONE) ? 2u : 3u;                     /* fault set / cleared (vmp EVENT kinds) */
  uint8_t code = (uint8_t)(l != FC_NONE ? l : a->ev_prev);
  if (l != FC_NONE) {
    pmp_fclass_t cl = pmp_fault_class(l);
    if (cl == FCL_LATCH || cl == FCL_LOCK) a->latch_seen = true;   /* a pending image is not confirmed past these */
  }
  uint32_t t = a->now_ms / 1000u;
  if (a->prof->id == PMP_PROFILE_NATIVE && a->vmp.epoch_ok) { t = a->vmp.epoch_s + (a->now_ms - a->vmp.t_epoch) / 1000u; kind |= EVLOG_KIND_UNIX; }
  evlog_add(&a->ev, kind, code, (uint16_t)a->fsm.counted, t);
  a->ev_prev = l;
}

static void supervise(app_t *a, const app_tick_in_t *ti) {
  uint32_t pc = a->pfc_count, lc = a->llc_count, dp = pc - a->pfc_last, dl = lc - a->llc_last;
  a->pfc_last = pc; a->llc_last = lc;
  /* E81 (F-E-01a): a tick that stands for a backlog of missed milliseconds is not evidence about the ISRs. The catch-up
     ticks used to run back to back, each seeing dl ≈ 0, and fired the "three LLC periods missing" verdict — so the
     firmware's own flash writes latched F.35 (a LATCH row, which also blocked A/B image confirmation) on the first
     configuration write of every module's life. Re-baseline and judge nothing. */
  if (ti->late) { a->hb_ok = true; a->in.ctl_overrun = false; return; }
  bool warm = a->now_ms > 20u;                                  /* the first ticks line the ISR phases up */
  a->hb_ok = dp > 0u && dl > 0u;
  bool miss = warm && (dp < 98u || dp > 102u || dl < 9u || dl > 11u);
  bool slow = ti->pfc_exec_us > 10u || ti->llc_exec_us > 100u;  /* ran past its own period */
  if (miss || slow) a->ovr_win++;
  bool verdict = warm && dl <= 7u;                              /* three LLC periods missing inside one tick */
  if (a->now_ms % 100u == 0u) { verdict = verdict || a->ovr_win >= 10u; a->ovr_seen = a->ovr_win > 0u; a->ovr_win = 0u; }
  a->in.ctl_overrun = verdict;
  a->wdt_good = a->hb_ok ? (uint8_t)(a->wdt_good < 255u ? a->wdt_good + 1u : 255u) : 0u;
}

static const struct { float derate, trip; } ZONE[4] = {   /* §7: T_PFC · inlet (air or coolant) · T_LLC · T_XFMR */
  { 95.0f, 105.0f }, { 55.0f, 75.0f }, { 100.0f, 110.0f }, { 105.0f, 115.0f } };

static void measure(app_t *a, const app_tick_in_t *ti) {
  pmp_in_t *in = &a->in;
  const meas_cal_t *c = &a->cal;

  /* the internal reference gives VREF / 3.3 V; beyond ±5 % the ADC reference itself is broken (F.29 after 100 ms) */
  float kr = (ti->vrefint > 100.0f) ? c->vrefint_v * 4096.0f / (3.3f * ti->vrefint) : NAN;
  bool ref_ok = isfinite(kr) && fabsf(kr - 1.0f) <= 0.05f;
  if (ref_ok) a->k_ref += (kr - a->k_ref) * 0.01f;
  a->ref_bad_ms = ref_ok ? 0u : sat16(a->ref_bad_ms + 1u);

  /* E81 (F-D-13): AVMID is converted and judged. Every bipolar sense (three line CTs, the resonant CT, the F.11 window)
     is referenced to this buffer; if it or its 10 k/10 k ladder drifts, all three phase currents and the F.01/F.11
     thresholds shift together and only the once-per-boot offset window would ever have noticed. 1.65 V ± 50 mV. */
  float avmid = ti->avmid * (3.3f / 4095.0f) / a->k_ref;
  bool avmid_ok = isfinite(avmid) && fabsf(avmid - 1.65f) <= 0.05f;
  a->avmid_bad_ms = avmid_ok ? 0u : sat16(a->avmid_bad_ms + 1u);

  float v24 = meas_val(c, MCH_V24, ti->v24, a->k_ref), v15 = meas_val(c, MCH_V15, ti->v15, a->k_ref);
  bool rails = v15 > 12.75f && v15 < 17.25f && v24 > 20.4f && v24 < 27.6f && (ti->di & APP_DI_DRV_RDY) != 0u;
  a->rails_ms = rails ? sat16(a->rails_ms + 1u) : 0u;
  in->aux_ok = a->az_done && a->rails_ms >= 10u;

  /* each zone's own derate and trip mapped onto the core's 105 / 115 °C scale — the zone nearest its limit drives both (§7) */
  float t[4] = { meas_ntc_c(ti->t_pfc / 4095.0f), meas_ntc_c(ti->t_inlet / 4095.0f), meas_ntc_c(ti->t_llc / 4095.0f),
                 meas_ntc_c(ti->t_xfmr / 4095.0f) };
  float worst = -60.0f;
  for (int z = 0; z < 4; z++) {
    float d = ZONE[z].derate;
    float core = (t[z] < d) ? PMP_OT_DERATE_C - (d - t[z])
                            : PMP_OT_DERATE_C + (t[z] - d) * (PMP_OT_TRIP_C - PMP_OT_DERATE_C) / (ZONE[z].trip - d);
    worst = fmaxf(worst, core);
    a->t_zone[z] = t[z];
  }
  in->temp_max_c = worst;

  float vbus, vmid, vout, iout, va, vb;
  uint32_t q;
  do { q = a->pub_pfc_seq; vbus = a->pub_vbus; vmid = a->pub_vmid; } while ((q & 1u) || q != a->pub_pfc_seq);
  do { q = a->pub_llc_seq; vout = a->pub_vout; iout = a->pub_iout; va = a->pub_vbka; vb = a->pub_vbkb; }
  while ((q & 1u) || q != a->pub_llc_seq);
  in->vbus = vbus;
  in->vmid_frac = (vbus > 50.0f) ? clampf(vmid / vbus, 0.0f, 1.0f) : 0.5f;
  in->vout_meas = vout; in->iout_meas = iout; in->vbank_a = va; in->vbank_b = vb;
  /* a node above 60 V with the LLC off sets the operating point — a battery, or terminal capacitors still charged */
  if (!a->fsm.out.llc_en) { if (vout > PMP_MAKE_FLOOR_V) a->ext = true; else if (vout < 50.0f) a->ext = false; }
  in->ext_connected = a->ext;
  in->vext = vout;

  const volatile grid_t *g = &a->grid;
  float vph[3], vll[3], irms[3], isum, hz;
  bool abc;
  do {
    q = g->seq;
    for (int n = 0; n < 3; n++) { vph[n] = g->vph[n]; vll[n] = g->vll[n]; irms[n] = g->irms[n]; }
    isum = g->isum; hz = g->hz; abc = g->abc;
  } while ((q & 1u) || q != g->seq);
  if (q != a->grid_seen) {   /* a line cycle closed */
    a->grid_seen = q;
    float mx = fmaxf(fmaxf(vll[0], vll[1]), vll[2]), mn = fminf(fminf(vll[0], vll[1]), vll[2]);
    in->vin_ll = (mx - 400.0f > 400.0f - mn) ? mx : mn;          /* display keeps the line farthest from nominal */
    in->vin_ll_min = mn; in->vin_ll_max = mx;                    /* E80 (R06/HR-24): each protection row reads its own side */
    float vmax = fmaxf(fmaxf(vph[0], vph[1]), vph[2]), imean = (irms[0] + irms[1] + irms[2]) / 3.0f;
    bool loaded = a->pfc.run && imean > 0.05f * a->pfc_cfg.i_clamp;
    uint8_t ok = 0u;
    for (int n = 0; n < 3; n++) ok += (vph[n] >= fmaxf(60.0f, 0.6f * vmax) && !(loaded && irms[n] < 0.1f * imean)) ? 1u : 0u;
    in->phases_ok = ok;
    a->hz_bad = mx > 150.0f && (hz < 45.0f || hz > 65.0f);         /* F.37 only on a live line */
    if (hz >= 40.0f && hz <= 70.0f) a->w_line = (abc ? 6.2832f : -6.2832f) * hz;
    a->isum_bad = a->pfc.run && isum > 0.1f * a->pfc_cfg.i_clamp / 1.485f;   /* Σi beyond 10 % of rated rms: a CT or channel */
    for (int n = 0; n < 3; n++) a->g_vph[n] = vph[n];
    a->g_hz = hz;
  }
  a->hz_bad_ms = a->hz_bad ? sat16(a->hz_bad_ms + 1u) : 0u;
  a->isum_bad_ms = a->isum_bad ? sat16(a->isum_bad_ms + 1u) : 0u;

  /* boot offsets: once both windows are full. A DC offset beyond 150 counts is a broken chain (F.29); a window with current in it
     is taken again, three times, then the calibration offsets stay (warning) */
  if (!a->az_done && a->azp.gen == a->az_gen && a->azl.gen == a->az_gen && a->azp.n >= APP_AZ_N && a->azl.n >= APP_AZ_N) {
    meas_cal_t d;
    meas_cal_default(&d, a->kw);
    const app_az_t *z[5] = { &a->azp.ch[0], &a->azp.ch[1], &a->azp.ch[2], &a->azl.ch[0], &a->azl.ch[1] };
    const int ch[5] = { MCH_IA, MCH_IB, MCH_IC, MCH_IRES, MCH_IOUT };
    bool quiet = true, near = true;
    for (int n = 0; n < 5; n++) {
      quiet = quiet && z[n]->hi - z[n]->lo < 60.0f;
      near = near && fabsf(z[n]->sum / (float)APP_AZ_N - d.ch[ch[n]].off) <= 150.0f;
    }
    if (!near) { a->az_bad = true; a->az_done = true; }
    else if (quiet) {
      for (int n = 0; n < 5; n++) a->cal.ch[ch[n]].off = (ch[n] <= MCH_RATIO_LAST ? 1.0f : a->k_ref) * z[n]->sum / (float)APP_AZ_N;
      a->az_done = true;
    } else if (++a->az_try >= 3u) { a->az_done = true; a->az_gave_up = true; }
    else a->az_gen++;
  }

  in->oc_pfc_flt = took(a, FLT_OC);
  in->desat_flt = took(a, FLT_DESAT);
  pmp_fault_t h = FC_NONE;
  if (took(a, FLT_VBUS)) h = FC_BUS_OVP;
  if (took(a, FLT_VOUT) && h == FC_NONE) h = FC_OUT_OVP;
  if (took(a, FLT_TANK) && h == FC_NONE) h = FC_TANK_OC;
  if (h == FC_NONE) {
    /* E80 (review HR-29/R04): NO calibration record inhibits delivery like a bad one — with the corrected nominal
       transfers a blank card still carries the sense chains' full part tolerances; the EOL fixture writes the record
       (there is deliberately no CAN write path for calibration). APP_W_UNCAL names the cause next to F.30. */
    if (a->strap_bad || a->cal_bad || a->uncal) h = FC_CAL;
    else if (a->az_bad || a->ref_bad_ms >= 100u || a->isum_bad_ms >= 20u || a->avmid_bad_ms >= 100u) h = FC_SENSOR;
    else if (ti->stack_pct >= 90u) h = FC_INTERNAL;
    else if (a->hz_bad_ms >= 200u) h = FC_LINE_HZ;
  }
  /* E81 (F-E-15): the two D3 cells have their primaries in series on one Cr, so Cr blocks a common-mode DC but cannot
     correct a DIFFERENTIAL flux imbalance between them. The resonant CT's slow mean is the cheapest proxy; 2 % of the
     tank class held for 100 ms is a warning, not a latch (F.11 and the 130 °C cutouts remain the only detectors of a
     real walk — recorded as a gap in the FMEA). */
  bool flux = a->fsm.out.llc_en && fabsf(a->ires_dc) > 0.02f * a->fsm.oc_tank_a;
  a->flux_ms = flux ? sat16(a->flux_ms + 1u) : 0u;

  in->hal_fault = h;
  in->wdt_ok = !(a->wdt_boot && a->now_ms <= 1u);             /* a watchdog reset reports F.32 once */
  in->relay_fb = (ti->di & APP_DI_RLY_PRE) ? PMP_RLY_PRE : 0u;
  in->link_age_ms = 0u;                                       /* F.27 retired: one brain (E40) */
}

static void commit(app_t *a) {
  const pmp_out_t *fo = &a->fsm.out;
  a->pfc_commit = 0u;
  __asm__ volatile ("" ::: "memory");
  a->pfc_sh.en = fo->pfc_en && !fo->pwm_kill && a->fsm.pre_blank_ms == 0u;
  a->pfc_sh.vbus_ref = fo->vbus_ref;
  a->pfc_sh.w_line = a->w_line;
  __asm__ volatile ("" ::: "memory");                   /* E81 (F-E-17): C11 orders volatile against volatile only — the
                                                           non-volatile shadow stores may otherwise sink past this flag */
  a->pfc_commit = 1u;
  a->llc_commit = 0u;
  __asm__ volatile ("" ::: "memory");
  a->llc_sh.en = fo->llc_en && !fo->pwm_kill;
  a->llc_sh.ser = fo->mode == MODE_SER;
  a->llc_sh.v_ref = a->ctl.v_ref;
  a->llc_sh.i_ref = a->ctl.i_ref;
  a->llc_sh.v_scale = fmaxf(fo->v_max, PMP_PAR_VMAX_V);
  a->llc_sh.fold_hi_v = fmaxf(fo->vbus_ref - 10.0f, APP_FOLD_LO_V + 10.0f);
  a->llc_sh.fold_crest_v = 1.414f * a->in.vin_ll_max;   /* E81 (F-E-05) */
  __asm__ volatile ("" ::: "memory");                   /* E81 (F-E-17): the shadow stores must precede the flag */
  a->llc_commit = 1u;
}

static float dac_v(const meas_cal_t *c, int ch, float value) { return (value / c->ch[ch].gain + c->ch[ch].off) * LSB; }

static void outputs(app_t *a, app_tick_out_t *o, pmp_state_t st0) {
  const pmp_out_t *fo = &a->fsm.out;
  o->do_bits = (uint16_t)((fo->k_pre ? APP_DO_KPRE : 0u) | (fo->k_ser ? APP_DO_KSER : 0u) | (fo->k_para ? APP_DO_KPARA : 0u) |
                          (fo->k_parb ? APP_DO_KPARB : 0u) | (fo->q_disch ? APP_DO_QDIS : 0u) | (fo->q_disch_bk ? APP_DO_QDISBK : 0u) |
                          (a->pfc_sh.en ? APP_DO_EN_PFC : 0u) | (a->llc_sh.en ? APP_DO_EN_LLC : 0u));
  /* the comparator references from the rating and the calibration in force (firmware may tighten, never loosen).
     E81 (F-D-10): the three line-OC references are written by the 100 kHz ISR, which knows each phase's sign. */
  for (int n = 0; n < 3; n++) {
    a->dac_oc_pos[n] = dac_v(&a->cal, MCH_IA + n, a->fsm.oc_line_a);
    a->dac_oc_neg[n] = dac_v(&a->cal, MCH_IA + n, -a->fsm.oc_line_a);
    o->dac_v[APP_DAC_IA + n] = a->dac_oc[n];
  }
  o->dac_v[APP_DAC_VBUS] = dac_v(&a->cal, MCH_VBUS, PMP_BUS_OVP_V);
  /* E80 (review R09/HR-07, FW-19): the F.13 comparator threshold follows the output mode — LOW mode's banks meet a
     hardware limit at 560 V instead of the HIGH-mode 1050 V (the documented interim until HW-REC-1 is decided; an EV
     contactor opening ends the session anyway, so the latch is the protective outcome, not a nuisance) */
  float th13 = (fo->v_max <= PMP_PAR_VMAX_V) ? 560.0f : PMP_OUT_OVP_ABS_V;
  o->dac_v[APP_DAC_VOUT] = dac_v(&a->cal, MCH_VOUT, th13);
  /* HW-REC-1 readiness: the non-latching clamp reference rides the active CV setpoint; armed high when idle */
  float vr = a->ctl.v_ref;
  o->dac_v[APP_DAC_CLAMP] = dac_v(&a->cal, MCH_VOUT, (vr > 50.0f) ? fminf(vr * 1.05f + 10.0f, th13) : th13);
  /* E80: relay-coil economizer (firmware-guide E26) — 60 ms pull-in, then 40 % hold at 20 kHz; aux-budget relief (R23) */
  static const uint16_t RLY_DO[APP_RLY_COUNT] = { APP_DO_KPRE, APP_DO_KSER, APP_DO_KPARA, APP_DO_KPARB };
  for (int r = 0; r < APP_RLY_COUNT; r++) {
    if (!(o->do_bits & RLY_DO[r])) { a->rly_ms[r] = 0u; o->relay_duty[r] = 0.0f; }
    else {
      if (a->rly_ms[r] < 0xFFFFu) a->rly_ms[r]++;
      o->relay_duty[r] = (a->rly_ms[r] <= APP_RLY_PULL_MS) ? 1.0f : APP_RLY_HOLD;
    }
  }
  /* E73: the latches clear through the bypass-closure blank, and once a latched row has cleared.
     E81 (F-E-11): the blank is an F.01 rule — clear only the three line-OC channels inside it. Clearing F.03 (bus OVP) or
     F.13 (output OVP) sixty times in a row would undo a hardware latch the blank has nothing to say about, and E73's own
     inrush measurement (605 → 726 V) is close enough to F.03 to matter the moment a stage is enabled in the window. */
  o->fault_rearm = a->fsm.pre_blank_ms > 0u ? (uint16_t)APP_FLT_LINE_OC
                 : (st0 == ST_FAULT && a->fsm.st != ST_FAULT && a->fsm.st != ST_LOCK) ? (uint16_t)APP_FLT_ALL : 0u;
  o->disch_intent = a->fsm.st == ST_SHUTDOWN || a->fsm.st == ST_DISCH;   /* E81 (F-E-02) */
}

static void fans(app_t *a, const app_tick_in_t *ti, app_tick_out_t *o) {
  if (a->n_fans == 0u) { a->in.fan_ok = true; return; }       /* 50 kW liquid: sealed, no fans (E42) */
  if (a->now_ms % 10u == 0u) {
    const pmp_out_t *fo = &a->fsm.out;
    float t = a->in.temp_max_c, p = fmaxf(a->in.vout_meas * a->in.iout_meas, 0.0f) / a->ctl_cfg.p_rated_w;
    bool need = fo->pfc_en || fo->llc_en || t > 50.0f;
    /* §7: the larger of the temperature curve (the core's scale, 25 % at 60 °C to full at 100 °C) and the load feed-forward */
    float d = need ? fmaxf(clampf(0.25f + (t - 60.0f) * 0.01875f, 0.25f, 1.0f), fo->llc_en ? 0.25f + 0.75f * clampf(p, 0.0f, 1.0f) : 0.0f)
                   : 0.0f;
    if (a->cfg.vmp.fan_mode == 1u) d = fminf(d, 0.6f);        /* quiet: the thermal derate absorbs the rest */
    else if (a->cfg.vmp.fan_mode == 2u && need) d = 1.0f;     /* boost */
    if (d == 0.0f && a->fan_duty > 0.0f && a->now_ms - a->fan_on_ms < 10000u) d = a->fan_duty;   /* at least 10 s on */
    if (d > a->fan_duty || d < a->fan_duty - 0.1f || d == 0.0f) {   /* 10 % hysteresis on the way down */
      if (a->fan_duty == 0.0f && d > 0.0f) a->fan_on_ms = a->now_ms;
      a->fan_duty = d;
    }
    uint8_t fail = 0u;
    for (uint8_t k = 0u; k < a->n_fans; k++) {
      /* E80 (review HR-25/R25): the floor scales with the command — 5 Hz (150 rpm) used to pass at ANY duty, so a
         fan at 4 % of its commanded speed read healthy. Below 20 % duty the tach is too slow to judge (the running
         floor when cooling is needed is 25 %, so a needed fan is always judged). A failed fan that recovers clears
         its bit and the count-based derate recovers through the FSM's slew. */
      bool judged = a->fan_duty >= 0.2f;
      bool slow = judged && !(ti->tach_hz[k] >= fmaxf(5.0f, 0.35f * a->fan_duty * APP_TACH_FULL_HZ));
      a->fan_still_ms[k] = slow ? sat16(a->fan_still_ms[k] + 10u) : 0u;
      if (a->fan_still_ms[k] >= 3000u) fail = (uint8_t)(fail | (1u << k));
    }
    a->fan_fail = fail;
    a->in.fan_ok = fail == 0u;
    a->in.fans_total = a->n_fans;                             /* E80 (FW-21): the core derates by the failed COUNT */
    uint8_t nf = 0u;
    for (uint8_t k = 0u; k < a->n_fans; k++) nf = (uint8_t)(nf + ((fail >> k) & 1u));
    a->in.fans_failed = nf;
  }
  o->fan_duty[0] = a->fan_duty;
  o->fan_duty[1] = a->fan_duty;
}

static uint8_t addr_shown(const app_t *a, bool *none) {
#if PMP_WITH_TONHE_V12
  if (a->prof->id == PMP_PROFILE_TONHE_V12) { uint8_t v = th12_addr(&a->th); *none = v == 0u; return v; }
#endif
  *none = a->vmp.cfg.addr == VMP_ADDR_NULL;
  return a->vmp.cfg.addr;
}

static const uint8_t SEG[16] = { 0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F, 0x77, 0x7C, 0x39, 0x5E, 0x79, 0x71 };

static void panel(app_t *a, const app_tick_in_t *ti, app_tick_out_t *o) {
  a->b1_ms = (ti->di & APP_DI_BTN1) ? sat16(a->b1_ms + 1u) : 0u;
  a->b2_ms = (ti->di & APP_DI_BTN2) ? sat16(a->b2_ms + 1u) : 0u;
  bool p1 = a->b1_ms == 50u, p2 = a->b2_ms == 50u, hold1 = a->b1_ms == 3000u;   /* debounced press · 3 s hold */
  bool idle = !a->fsm.out.pfc_en && !a->fsm.out.llc_en;
  /* the panel address (TonHe automatic mode) changes only with both stages stopped and applies at the next boot */
  if (a->edit) {
    if (p1) { a->edit_addr = (uint8_t)(a->edit_addr >= 240u ? 1u : a->edit_addr + 1u); a->edit_ms = 0u; }
    if (p2) { a->edit_addr = (uint8_t)(a->edit_addr <= 1u ? 240u : a->edit_addr - 1u); a->edit_ms = 0u; }
    a->edit_ms = sat16(a->edit_ms + 1u);
    if (a->edit_ms >= 5000u || !idle) {
      if (idle && a->edit_addr != a->cfg.panel_addr) { a->cfg.panel_addr = a->edit_addr; a->cfg_dirty = true; }
      a->edit = false;
    }
  } else if (hold1 && idle) { a->edit = true; a->edit_addr = a->cfg.panel_addr; a->edit_ms = 0u; }

  uint8_t d1, d2;
  int f = (int)a->tlm.fault;
  if (a->fsm.lock) { d1 = 0x38u; d2 = 0x3Fu; }                                   /* "LO" */
#if PMP_WITH_TONHE_V12
  /* E81 (K §5 fix 3): TonHe §9.2.6 promises automatic address assignment at power-on and defines no mechanism. With no
     panel address the module is correctly silent on the bus — and invisible. Show "A-" so a commissioning engineer sees
     the cause in seconds instead of hunting a dark slot. */
  else if (a->prof->id == PMP_PROFILE_TONHE_V12 && a->th.no_addr && f == 0) { d1 = 0x77u; d2 = 0x40u; }
#endif
  else if (a->edit) {
    bool on = a->now_ms % 500u < 300u;
    d1 = on ? SEG[a->edit_addr >> 4] : 0u; d2 = on ? SEG[a->edit_addr & 15u] : 0u;
  } else if (f != 0) {                                                            /* the F number, both points lit, blinking */
    bool on = a->now_ms % 1000u < 600u;
    d1 = on ? (uint8_t)(SEG[(f / 10) % 10] | 0x80u) : 0u; d2 = on ? (uint8_t)(SEG[f % 10] | 0x80u) : 0u;
  } else {
    bool none;
    uint8_t v = addr_shown(a, &none);
    d1 = none ? 0x40u : SEG[v >> 4]; d2 = none ? 0x40u : SEG[v & 15u];
  }
  bool left = (a->now_ms / 5u) % 2u == 0u;
  o->hmi_dig = left ? 1u : 2u;
  o->hmi_seg = left ? d1 : d2;
}

static void telemetry(app_t *a, const app_tick_in_t *ti) {
  mod_tlm_t *m = &a->tlm;
  const pmp_in_t *in = &a->in;
  pmp_tlm_from_core(m, &a->fsm, in, &a->ctl, &a->ctl_cfg);
  m->v_out = in->vout_meas; m->i_out = in->iout_meas; m->v_bus = in->vbus;
  m->v_mid_imb = (1.0f - 2.0f * in->vmid_frac) * in->vbus;   /* upper half less lower half */
  m->v_bank_a = in->vbank_a; m->v_bank_b = in->vbank_b;
  m->vin_ll = in->vin_ll; m->line_hz = a->g_hz;
  for (int n = 0; n < 3; n++) m->vin_ph[n] = a->g_vph[n];
  m->t_pfc = a->t_zone[0]; m->t_inlet = a->t_zone[1]; m->t_llc = a->t_zone[2]; m->t_xfmr = a->t_zone[3];
  m->t_diode = NAN; m->t_bank = NAN; m->t_mcu = NAN; m->t_coolant = a->liquid ? a->t_zone[1] : NAN;
  for (int n = 0; n < 4; n++)                                /* two tach pulses per revolution */
    m->fan_rpm[n] = (n < a->n_fans && ti->tach_hz[n] > 0.0f) ? (uint16_t)(fminf(ti->tach_hz[n], 2000.0f) * 30.0f) : 0u;
  m->fan_duty = (uint8_t)(a->fan_duty * 100.0f + 0.5f);
  m->fan_fail = a->fan_fail;
  m->quiet_fan = a->cfg.vmp.fan_mode == 1u;

  bool on = a->fsm.out.llc_en;
  if (on && !a->llc_was) a->cnt.starts++;
  if (on && ++a->op_ms >= 1000u) { a->op_ms = 0u; a->cnt.op_s++; }
  float p = fmaxf(in->vout_meas * in->iout_meas, 0.0f);
  if (on && isfinite(p)) { a->e_mws += p; if (a->e_mws >= 3.6e6f) { a->e_mws -= 3.6e6f; a->cnt.energy_wh++; } }
  if (a->llc_was && !on) a->cnt_due = true;
  a->llc_was = on;
  m->uptime_s = a->now_ms / 1000u; m->op_s = a->cnt.op_s; m->energy_wh = a->cnt.energy_wh; m->starts = a->cnt.starts;
  m->fault_total = sat16((uint32_t)a->cnt.faults + a->fsm.fault_count);   /* cnt.faults is the boot base */
  m->warn |= (a->uncal ? APP_W_UNCAL : 0u) | (a->az_gave_up ? APP_W_OFFSET : 0u) | (a->nvm_fail >= 3u ? APP_W_NVM : 0u) |
             (ti->can_state != 0u ? APP_W_CAN : 0u) | (ti->stack_pct >= 70u ? APP_W_STACK : 0u) | (a->ovr_seen ? APP_W_OVERRUN : 0u) |
             (a->flux_ms >= 100u ? APP_W_FLUX : 0u);
}

static void nvm_service(app_t *a) {
  if (a->now_ms % 100u != 0u) return;
  const pmp_out_t *fo = &a->fsm.out;
  if (fo->llc_en) return;                                     /* nothing is programmed while power is delivered */
  bool quiet = !fo->pfc_en;                                   /* an erase stalls the flash: only with both stages stopped */
  bool dirty = a->cfg_dirty || (a->prof->id == PMP_PROFILE_NATIVE && a->vmp.nv_dirty);
#if PMP_WITH_TONHE_V12
  dirty = dirty || (a->prof->id == PMP_PROFILE_TONHE_V12 && a->th.nv_dirty);
#endif
  if (dirty && a->now_ms - a->t_cfg >= 10000u) {              /* at most one configuration record per 10 s */
    a->t_cfg = a->now_ms;
    if (a->prof->id == PMP_PROFILE_NATIVE) a->cfg.vmp = a->vmp.cfg;
#if PMP_WITH_TONHE_V12
    else { a->cfg.th_addr_mode = a->th.addr_mode; a->cfg.th_addr_can = a->th.addr_can; }
#endif
    if (nvm_put(&a->nvm, APP_NV_CFG, (const uint8_t *)&a->cfg, (uint8_t)sizeof a->cfg, quiet)) {
      a->cfg_dirty = false;
      a->vmp.nv_dirty = false;
#if PMP_WITH_TONHE_V12
      a->th.nv_dirty = false;
#endif
      a->nvm_fail = 0u;
    } else if (quiet && a->nvm_fail < 255u) a->nvm_fail++;
  }
  if (a->factory_pend && a->now_ms - a->t_cfg >= 100u) {      /* E80: FACTORY_RESET — defaults stored, then reboot */
    app_cfg_default(&a->cfg);
    a->cfg.vmp.profile = (uint8_t)PMP_PROFILE_NATIVE;
    if (nvm_put(&a->nvm, APP_NV_CFG, (const uint8_t *)&a->cfg, (uint8_t)sizeof a->cfg, quiet)) {
      a->factory_pend = false; a->reboot_pend = true;
      a->t_cfg = a->now_ms;
    }
  }
  if (a->ev.qn || a->ev.lost) evlog_flush(&a->ev, quiet);       /* E80: events append outside delivery; the ring moves
                                                                   only with both stages stopped (§9 flash discipline) */
  bool hourly = a->now_ms - a->t_cnt >= 3600000u;
  if ((a->cnt_due || hourly) && a->now_ms - a->t_cnt >= 600000u) {   /* at a session end or hourly, at most one per 10 min */
    app_counters_t c = a->cnt;
    c.faults = sat16((uint32_t)a->cnt.faults + a->fsm.fault_count);
    if (nvm_put(&a->nvm, APP_NV_COUNTERS, (const uint8_t *)&c, (uint8_t)sizeof c, quiet)) { a->t_cnt = a->now_ms; a->cnt_due = false; }
  }
}

static void can_service(app_t *a, const app_tick_in_t *ti, app_tick_out_t *o) {
  o->can_bitrate = a->bitrate;
  if (!a->busoff) {
    if (ti->can_state == 2u && a->now_ms - a->t_busoff >= 50u) {   /* 50 ms after a restart the controller has had its chance */
      a->busoff = true; a->t_busoff = a->now_ms;
      a->busoff_t[a->busoff_i] = a->now_ms;
      a->busoff_i = (uint8_t)((a->busoff_i + 1u) % 10u);
      if (a->busoff_n < 10u) a->busoff_n++;
    }
  } else {
    /* recover after 100 ms; ten bus-offs inside a minute hold off 5 s — a shorted or unterminated bus is not hammered */
    bool storm = a->busoff_n >= 10u && a->now_ms - a->busoff_t[a->busoff_i] <= 60000u;
    if (a->now_ms - a->t_busoff >= (storm ? 5000u : 100u)) { o->can_restart = true; a->busoff = false; a->t_busoff = a->now_ms; }
  }
  if (a->prof->id == PMP_PROFILE_NATIVE && a->txq.n == 0u) {
    if (a->vmp.reboot_req || a->reboot_pend) o->reboot = true;
    if (a->vmp.boot_req) o->enter_boot = true;                  /* E80: the port writes the handoff and resets */
    if (a->vmp.factory_req) { a->vmp.factory_req = false; a->factory_pend = true; }
  }
}

void app_tick(app_t *a, const app_tick_in_t *ti, app_tick_out_t *o) {
  memset(o, 0, sizeof *o);
  a->now_ms++;
  a->pfc_us = ti->pfc_exec_us > a->pfc_us ? ti->pfc_exec_us : a->pfc_us;   /* E80 T-44: high-water since boot */
  a->llc_us = ti->llc_exec_us > a->llc_us ? ti->llc_exec_us : a->llc_us;
  a->stack_pct = ti->stack_pct > a->stack_pct ? ti->stack_pct : a->stack_pct;
  supervise(a, ti);
  measure(a, ti);
  /* firmware-architecture §2 */
  for (uint8_t k = 0u; k < ti->rx_n; k++) a->prof->rx(a->prof_ctx, &ti->rx[k], a->now_ms, &a->tlm, &a->cmd, &a->txq);
  a->prof->tick(a->prof_ctx, a->now_ms, &a->tlm, &a->cmd, &a->txq);
  pmp_cmd_to_in(&a->cmd, &a->in, &a->fsm);
  pmp_state_t st0 = a->fsm.st;
  pmp_fsm_step(&a->fsm, &a->in);
  pmp_ctl_in_t ci;
  pmp_cmd_to_ctl(&a->cmd, &a->fsm, &a->in, a->reg.cv, &ci);
  pmp_ctl_step(&a->ctl, &a->ctl_cfg, &ci, 1.0e-3f);
  commit(a);
  outputs(a, o, st0);
  fans(a, ti, o);
  panel(a, ti, o);
  telemetry(a, ti);
  events(a);
  /* E80: a pending image confirms after 60 s of healthy standby — no LATCH/LOCK row since boot (AUTO grid rows do
     not block a good image; F.30/F.29/F.32 do). The port acts on the rising edge (boot/bootctl.h). */
  o->boot_ok = a->now_ms >= 60000u && !a->latch_seen && !a->strap_bad && !a->cal_bad && !a->uncal;
  nvm_service(a);
  can_service(a, ti, o);
  /* the sequenced watchdog. E81 (F-D-9): the HAL says whether kicking is PERMITTED — both ISRs advanced on each of the
     last 10 ticks — and the port pulses WDI on its own 10 ms of real time, so a blocking flash erase can no longer bunch
     two edges inside the TPS3430's 2.22 ms lower bound or stretch past its 23.375 ms upper one. */
  o->wdt_kick = a->wdt_good >= APP_WDT_KICK_MS;
}
