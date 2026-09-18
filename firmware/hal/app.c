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
/* F.01 is a POSITIVE DAC reference plus a software magnitude test (trip polarity is open decision O-15; EVT injection
   decides). A reference that follows the sign of the measured current would let a through-window CT's unknown primary
   orientation stop mattering, but the comparators are non-inverted into active-HIGH fault inputs, so loading
   AVMID − k·I_trip asserts the fault for the whole time the current reads negative — at idle, where the sign of ≈ 0 A is
   noise, that is F.01 within milliseconds of boot. The CT-orientation problem is answered instead by |i| in app_pfc_isr,
   which is sign-blind by construction, backed by Σi = 0: in a 3-wire stage a negative fault beyond 2·I_trip always shows
   as a positive one at or above I_trip elsewhere. */
#define LSB              (3.3f / 4096.0f)

enum { FLT_OC = 0, FLT_DESAT, FLT_VBUS, FLT_VOUT, FLT_TANK };
typedef char app_nv_records_fit[(sizeof(app_cfg_t) <= NVM_MAX_LEN && sizeof(meas_cal_t) <= NVM_MAX_LEN) ? 1 : -1];

static float clampf(float x, float lo, float hi) { return x < lo ? lo : (x > hi ? hi : x); }
#define BIT8(n) ((uint8_t)(1u << (n)))   /* RCU_RSTSCK bits 31:24 packed into app_boot_t.reset_cause */
static uint32_t app_aux_read(void *ctx, uint16_t obj, uint8_t sub, bool *ok);   /* registered on the native profile */
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
  a->k_ref = a->k_boot = a->k_track = 1.0f;
  a->w_line = 314.16f;
  a->kw = meas_rating_kw(b->rating_counts * 3.3f / 4095.0f, &a->liquid);
  a->strap_bad = a->kw == 0u;
  if (a->strap_bad) a->kw = 30u;                 /* the tightest current classes; F.30 keeps the output off */
  /* Fan count per rating: 30 kW 3 · 40 kW 3 · 50 kW liquid 0 · 50 kW air 4. The 30 kW third fan lands on
     FAN_TACH3 / FAN_PWM2 and carries the air-budget margin at 55 °C inlet (16–18 K module rise). */
  a->n_fans = a->liquid ? 0u : (a->kw == 50u) ? 4u : 3u;
  pmp_fsm_init(&a->fsm);
  pmp_fsm_set_rating_kw(&a->fsm, a->kw);
  pmp_ctl_init(&a->ctl);
  pmp_ctl_cfg_default(&a->ctl_cfg, a->kw);
  pmp_reg_cfg_default(&a->reg_cfg);
  pfc_cfg_default(&a->pfc_cfg, a->kw);
  llc_cfg_default(&a->llc_cfg, a->kw);
  dielim_cfg_default(&a->die_cfg, a->kw, a->liquid);
  dielim_reset(&a->die);
  meas_cal_default(&a->cal, a->kw);
  mod_cmd_init(&a->cmd);

  nvm_mount(&a->nvm, 0u, b->nvm_page_size);
  meas_cal_t cal;
  if (nvm_get(&a->nvm, APP_NV_CAL, (uint8_t *)&cal, (uint8_t)sizeof cal)) {
    if (meas_cal_plausible(&cal, a->kw)) a->cal = cal; else a->cal_bad = true;
  } else a->uncal = true;
  /* The bandgap spreads a few percent part to part and the 3V3 buck another ±2.5 %; judged against a NOMINAL 1.20 V the
     two together cross the ±5 % reference window (F.29) on a corner unit that has nothing wrong with it. The part
     carries its own factory reading — with it the window sees the rail alone. Applied before AND after calibration, so
     the channel gains the calibration stores hold were taken with the same reference the module runs on. */
  if (b->vrefint_v > 1.10f && b->vrefint_v < 1.30f) a->cal.vrefint_v = b->vrefint_v;
  app_cfg_t cfg;
  if (!nvm_get(&a->nvm, APP_NV_CFG, (uint8_t *)&cfg, (uint8_t)sizeof cfg) || cfg.version != APP_CFG_VERSION) app_cfg_default(&cfg);
  if (cfg.vmp.profile >= (uint8_t)PMP_PROFILE_COUNT) cfg.vmp.profile = (uint8_t)PMP_PROFILE_NATIVE;
  if (cfg.th_addr_mode > 1u) cfg.th_addr_mode = 0u;
  if (cfg.th_addr_can == 0u || cfg.th_addr_can > 240u) cfg.th_addr_can = 1u;
  if (cfg.panel_addr == 0u || cfg.panel_addr > 240u) cfg.panel_addr = 1u;
  a->cfg = cfg;
  (void)nvm_get(&a->nvm, APP_NV_COUNTERS, (uint8_t *)&a->cnt, (uint8_t)sizeof a->cnt);

  /* The card's real supervisor is the TPS3430, whose WDO is wire-ORed onto NRST — it arrives as EPRSTF (RSTSCK bit 26,
     i.e. bit 2 of this byte), never as FWDGTRSTF (bit 29 → bit 5), so testing for FWDGT alone would leave F.32 silent
     on the dominant hang path. Any reset that is neither power-on (bit 27 → 3) nor a sealed reboot is a watchdog
     event. The raw byte goes out as VMP object 0x000A and into the event ring. */
  a->ident.reset_cause = b->reset_cause;
  a->ident.hw_rev = b->hw_rev;
  a->wdt_boot = (b->reset_cause & (BIT8(5) | BIT8(6))) != 0u ||                       /* FWDGT · WWDGT */
                ((b->reset_cause & BIT8(2)) != 0u && (b->reset_cause & BIT8(3)) == 0u && !b->handoff_reboot);
  a->ident.uid = b->uid; a->ident.fw = b->fw; a->ident.product = a->kw;
  a->ident.fw_crc = b->fw_crc; a->ident.boot_ver = b->boot_ver; a->ident.boot_state = b->boot_state;
  a->ident.features = (uint16_t)(VMP_FEAT_GROUP | VMP_FEAT_LEVEL_LAW | VMP_FEAT_P_LIMIT | VMP_FEAT_SHARE_TRIM |
                                 VMP_FEAT_FAN_MODES | VMP_FEAT_TIME_SYNC | VMP_FEAT_BOOTLOADER |
                                 (a->liquid ? VMP_FEAT_LIQUID : 0u) | (PMP_WITH_TONHE_V12 ? VMP_FEAT_TONHE_V12 : 0u));
  if (b->evlog_pages) {                       /* the event ring sits behind the record store's pages */
    evlog_mount(&a->ev, 4u, b->evlog_pages, b->nvm_page_size);   /* port pages: 0/1 records · 2/3 boot control · 4… events */
    evlog_add(&a->ev, 1u /* boot */, a->ident.reset_cause, (uint16_t)(b->fw & 0xFFFFu), 0u);
  }
  a->prof = pmp_profile_get((pmp_profile_id_t)a->cfg.vmp.profile);
#if PMP_WITH_TONHE_V12
  if (a->prof->id == PMP_PROFILE_TONHE_V12) {
    th12_init(&a->th, a->cfg.th_addr_mode, a->cfg.th_addr_can, a->cfg.panel_addr, a->ident.uid, 0u);
    a->prof_ctx = &a->th;
    a->bitrate = a->prof->bitrate;
  } else
#endif
  {
    vmp_init(&a->vmp, &a->cfg.vmp, &a->ident, 0u);
    a->vmp.aux_read = app_aux_read; a->vmp.aux_ctx = a;   /* event-log and timing objects */
    a->prof_ctx = &a->vmp;
    a->bitrate = a->vmp.cfg.bitrate;
    if (a->vmp.cfg.ramp_v_vps) a->ctl_cfg.ramp_v_vps = (float)a->vmp.cfg.ramp_v_vps;
    if (a->vmp.cfg.ramp_i_aps) a->ctl_cfg.ramp_i_aps = (float)a->vmp.cfg.ramp_i_aps;
    a->ctl_cfg.droop_ohm = (float)a->vmp.cfg.droop_mohm * 1.0e-3f;
  }

  /* A commanded discharge survives a reset. Without this, pmp_fsm_init's unconditional ST_INIT → ST_PRECHG re-energises
     the link to the line crest with no command and no fault — 500 V back on the studs while a technician reads
     "discharging". The intent rides the no-init handoff page the port keeps. */
  if (b->disch_pending) pmp_fsm_resume_shutdown(&a->fsm);
  a->in.vmid_frac = 0.5f;
  a->in.fan_ok = true;
  a->in.wdt_ok = true;
  a->in.relay_fb_wired = PMP_RLY_PRE;   /* the bypass pair has its mirror contact; the matrix relays have none */
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
  /* The line-cycle work is handed to the 10 kHz context. grid_sample carries four vsqrt and two vdiv and the offset
     window three more branches — ~360 cycles, which landing on one 100 kHz tick in ten would make the WORST-case PFC
     ISR 7.4 µs against a 10 µs deadline. Nine floats and an index cost ~15 cycles on the same tick.
     This hands over the RAW samples, before the DC correction below — the grid monitor's rms, isum (F.29) and the boot
     offset window must all keep seeing the chain as it really is. */
  if (++a->grid_div >= 10u) {
    a->grid_div = 0u;
    uint8_t w = (uint8_t)(a->g_idx ^ 1u);
    for (int n = 0; n < 3; n++) { a->g_buf[w].v[n] = v[n]; a->g_buf[w].i[n] = i[n]; }
    a->g_buf[w].ia = s->ia; a->g_buf[w].ib = s->ib; a->g_buf[w].ic = s->ic;
    a->g_idx = w;
    a->g_new = 1u;
  }
  /* F.01's comparators carry the POSITIVE reference only (outputs(), and the file header); the negative polarity is
     covered by this magnitude test plus Σi = 0 — in a 3-wire stage a negative fault beyond 2·I_trip necessarily shows as a
     positive one at or above I_trip in another phase, which the comparator catches in ns. This runs on the RAW current, so
     protection never depends on the DC-correction path below, and it takes the same route a hardware trip takes: trip_n
     holds both stages off from the o->en line below, and app_tick latches F.01 on the next 1 ms pass. (app_fault_isr is
     also called from the HRTIMER fault vector; a preemption can lose one COUNT, never the inequality the tick tests.) */
  for (int n = 0; n < 3; n++)
    if (fabsf(i[n]) > a->fsm.oc_line_a) { app_fault_isr(a, 1u << APP_FLT_IA, 0.0f); break; }
  /* the DC the loop cannot see. A CT passes nothing below ≈ 1 Hz, so the P-only current loop has no DC feedback at all
     and a measurement offset — dominated by the SNS_VAC channels, 1 LSB = 1.35 V of line — drives real DC line current
     through the line resistance alone. Both means are zero by physics, so the per-cycle estimate IS the offset. */
  for (int n = 0; n < 3; n++) { i[n] -= a->grid.dci[n]; v[n] -= a->grid.dcv[n]; }
  pfc_step(&a->pfc, &a->pfc_cfg, &a->pfc_ref, i, v, vbus - vn, vn, a->p_llc, APP_PFC_DT);
  o->en = a->pfc.run && a->trip_n == a->trip_ack;   /* a hardware trip holds the stage off until the tick has latched it */
  for (int n = 0; n < 3; n++) o->on[n] = a->pfc.on[n];
  a->vbus_now = vbus;
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
  /* the 10 kHz line-cycle work the PFC ISR handed over */
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
  /* the floor tracks the LINE CREST. Fixed at 625 V it would let a 475 VAC site (crest 671.8 V) sit between the crest
     and the reference — the rectifier conducting uncontrolled, line current unshaped — while the LLC still drew 52 %
     of rated power and no row fired. Below the crest the Vienna cannot regulate, so the LLC takes nothing. */
  float fold_lo = fmaxf(APP_FOLD_LO_V, r->fold_crest_v);
  float kb = clampf((a->vbus_now - fold_lo) / fmaxf(r->fold_hi_v - fold_lo, 10.0f), 0.0f, 1.0f);
  /* the terminal while the diode conducts; the stack while a battery or charged terminal capacitors above it block the diode */
  /* the voltage loop's gain is divided by the modulator's own sensitivity at the point it is standing on (llc.h k_norm,
     from the previous 100 µs pass — it moves far slower than the loop). Folding it into v_scale is exactly
     kp_v/(v_scale·k_norm), a plant inversion, and it leaves ctl.c's gains and llc.c's validated map alone. Without it
     one fixed PI pair drives a map whose sensitivity spans 23×, and the phase-shift end limit-cycles at 5 kHz. */
  float u = pmp_reg_step(&a->reg, &a->reg_cfg, r->en, r->v_ref, r->i_ref * kb, fminf(vout, stack), iout,
                         r->v_scale * (a->llc.k_norm > 0.0f ? a->llc.k_norm : 1.0f),
                         a->ctl_cfg.i_rated_a, APP_LLC_DT);
  /* the two extra plant inputs (llc.h) — the DC link for the ZVS charge, the node reference for the burst floor */
  a->llc.in_v_ref = r->ser ? 0.5f * r->v_ref : r->v_ref;
  llc_step(&a->llc, &a->llc_cfg, r->en, u, r->ser ? 0.5f * stack : stack, stack * iout, a->vbus_now);
  o->gate = a->llc.gate && a->trip_n == a->trip_ack;   /* no re-strike into a tripped tank / DESAT / OVP */
  o->f_hz = a->llc.f_hz; o->duty = a->llc.duty; o->dead_s = a->llc.dead_s;
  o->dead_a_s = a->llc.dead_a_s; o->dead_b_s = a->llc.dead_b_s;
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
  a->trip_n++;   /* hold both stages off until app_tick acknowledges (after the FSM saw it and the refs are committed) */
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
  uint16_t n = a->flt_n[kind];
  if (n == a->flt_seen[kind]) return false;
  a->flt_seen[kind] = n;
  return true;
}

/* -------------------------------------------------------------------------------------------------------------------- tick */
static uint32_t app_aux_read(void *ctx, uint16_t obj, uint8_t sub, bool *ok) {   /* VMP objects 0x04xx / 0x05xx */
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
  case VMP_O_DIAG_EV_SUP: return a->vmp.ev_suppressed;   /* EVENT frames dropped by the per-code rate limit */
  case VMP_O_DIAG_RX_OVR: return a->can_rx_ovr;          /* the only evidence of a lost frame the controller has */
  default: break;
  }
  *ok = false;
  return 0u;
}

static void events(app_t *a) {   /* fault transitions into the ring (flushed by nvm_service, never while delivering) */
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
  /* A tick that stands for a backlog of missed milliseconds is not evidence about the ISRs. Judged, catch-up ticks run
     back to back, each seeing dl ≈ 0, and fire the "three LLC periods missing" verdict — so the firmware's own flash
     writes would latch F.35 (a LATCH row, which also blocks A/B image confirmation) on the first configuration write
     of every module's life. Re-baseline and judge no overrun — but a heartbeat is still a heartbeat: interrupts that ran
     during the backlog advanced their counters, and ones that did not must not keep the watchdog fed. */
  a->hb_ok = dp > 0u && dl > 0u;
  a->wdt_good = a->hb_ok ? (uint8_t)(a->wdt_good < 255u ? a->wdt_good + 1u : 255u) : 0u;
  if (ti->late) { a->in.ctl_overrun = false; return; }
  bool warm = a->now_ms > 20u;                                  /* the first ticks line the ISR phases up */
  bool miss = warm && (dp < 98u || dp > 102u || dl < 9u || dl > 11u);
  bool slow = ti->pfc_exec_us > 10u || ti->llc_exec_us > 100u;  /* ran past its own period */
  if (miss || slow) a->ovr_win++;
  /* F.35 is a LATCH row, and the "three LLC periods missing inside one tick" arm must not fire on ONE sample — a single
     preempted millisecond would take a module out of service until a technician cleared it. The hardware trips do not
     depend on this row, so it can afford evidence: three such ticks inside one 100 ms window. */
  if (warm && dl <= 7u && a->ovr_hard < 255u) a->ovr_hard++;
  bool verdict = a->ovr_hard >= 3u;                              /* a STOPPED interrupt still latches inside 3 ms */
  if (a->now_ms % 100u == 0u) { verdict = verdict || a->ovr_win >= 10u; a->ovr_seen = a->ovr_win > 0u; a->ovr_win = 0u; a->ovr_hard = 0u; }
  a->in.ctl_overrun = verdict;
}

static const struct { float derate, trip; } ZONE[4] = {   /* §7: T_PFC · inlet (air or coolant) · T_LLC · T_XFMR */
  { 95.0f, 105.0f }, { 55.0f, 75.0f }, { 100.0f, 110.0f }, { 105.0f, 115.0f } };

static void measure(app_t *a, const app_tick_in_t *ti) {
  pmp_in_t *in = &a->in;
  const meas_cal_t *c = &a->cal;

  /* The reference, in two parts. k_boot: VREFINT against VREFP, read once at boot with its legal aperture (adc.c) — the
     rail's whole initial error; beyond ±5 % the reference itself is broken (F.29 after 100 ms). k_track: where VREFP has
     gone SINCE, read every line cycle from the three AC channels' common DC (meas.h dcc): a 3-wire set sums to zero, so the
     line cannot put a common offset there — only VREFP moving against the three isolators' 1.44 V common mode can, and the
     DACs move with VREFP exactly as the ADC does. Driven to zero as an integrator (≈ 0.2 s behind the estimator's 80 ms,
     updated below where a cycle closes), it holds while no clean cycle closes, is off on a card without a calibration
     record (its AC offsets are then part tolerance, not drift) and is bounded: beyond ±2 % neither the rail nor the
     isolators can legitimately have moved, so that too is F.29. The comparator codes (outputs()) carry k_ref, so a trip
     threshold follows the rail instead of drifting ≈ 25 V per percent. Its floor is the common drift of the three
     isolators' output common mode; T-26 measures it. */
  float kr = (ti->vrefint > 100.0f) ? c->vrefint_v * 4096.0f / (3.3f * ti->vrefint) : NAN;
  bool ref_ok = isfinite(kr) && fabsf(kr - 1.0f) <= 0.05f && fabsf(a->k_track - 1.0f) <= 0.02f;
  if (ref_ok) a->k_boot += (kr - a->k_boot) * 0.01f;
  a->k_ref = a->k_boot * a->k_track;
  a->ref_bad_ms = ref_ok ? 0u : sat16(a->ref_bad_ms + 1u);

  /* AVMID is converted and judged. Every bipolar sense (three line CTs, the resonant CT, the F.11 window)
     is referenced to this buffer; if it or its 10 k/10 k ladder drifts, all three phase currents and the F.01/F.11
     thresholds shift together and only the once-per-boot offset window would ever have noticed. 1.65 V ± 50 mV on the
     NOMINAL scale, with no reference correction: the ladder hangs on the same V3P3 that is VREFP, so a healthy buffer
     reads half scale whatever the rail does, and this is the one reading that sees the ladder and the buffer alone.
     Divided by k_ref it failed a healthy buffer on a rail 3.1 % high (inside the ±5 % reference window) and passed a
     buffer that had drifted with the rail. */
  float avmid = ti->avmid * (3.3f / 4095.0f);
  bool avmid_ok = isfinite(avmid) && fabsf(avmid - 1.65f) <= 0.05f;
  a->avmid_bad_ms = avmid_ok ? 0u : sat16(a->avmid_bad_ms + 1u);

  float v24 = meas_val(c, MCH_V24, ti->v24, a->k_ref), v15 = meas_val(c, MCH_V15, ti->v15, a->k_ref);
  bool rails = v15 > 12.75f && v15 < 17.25f && v24 > 20.4f && v24 < 27.6f && (ti->di & APP_DI_DRV_RDY) != 0u;
  a->rails_ms = rails ? sat16(a->rails_ms + 1u) : 0u;
  in->aux_ok = a->az_done && a->rails_ms >= 10u;

  /* each zone's own derate and trip mapped onto the core's 105 / 115 °C scale — the zone nearest its limit drives both (§7) */
  float t[4] = { meas_ntc_c(ti->t_pfc / 4095.0f), meas_ntc_c(ti->t_inlet / 4095.0f), meas_ntc_c(ti->t_llc / 4095.0f),
                 meas_ntc_c(ti->t_xfmr / 4095.0f) };
  float worst = -60.0f, sink = -60.0f, margin = 1000.0f;
  for (int z = 0; z < 4; z++) {
    float d = ZONE[z].derate;
    float core = (t[z] < d) ? PMP_OT_DERATE_C - (d - t[z])
                            : PMP_OT_DERATE_C + (t[z] - d) * (PMP_OT_TRIP_C - PMP_OT_DERATE_C) / (ZONE[z].trip - d);
    worst = fmaxf(worst, core);
    if (z != 1) sink = fmaxf(sink, core);   /* the fans blow with the inlet — they can only ever lower a SINK */
    margin = fminf(margin, d - t[z]);
    a->t_zone[z] = t[z];
  }
  in->temp_max_c = worst;
  a->t_sink_core = sink; a->t_margin_k = margin;

  float vbus, vmid, vout, iout, va, vb;
  uint32_t q;
  do { q = a->pub_pfc_seq; vbus = a->pub_vbus; vmid = a->pub_vmid; } while ((q & 1u) || q != a->pub_pfc_seq);
  do { q = a->pub_llc_seq; vout = a->pub_vout; iout = a->pub_iout; va = a->pub_vbka; vb = a->pub_vbkb; }
  while ((q & 1u) || q != a->pub_llc_seq);
  in->vbus = vbus;
  /* The output current channel has no twin, and everything that limits the vehicle's current reads it — the CC loop,
     F.15, F.16, the ZVS load estimate. Its one independent witness is the Vienna: the power it is commanded to draw
     (1.5 · V̂ · Î at its efficiency) must agree with what the output says leaves, inside the losses, the link's own
     charging (< 0.4 kW at the 250 V/s reference slew) and a burst. A channel stuck at zero read a full-power session as
     0 A — no current limit of any kind left — and one stuck high reads current that is not flowing. Either is F.29. */
  { float p_pfc = a->pfc.run ? 1.5f * sqrtf(fmaxf(a->pfc.vpk2, 2500.0f)) * a->pfc.i_pk * 0.985f : 0.0f;
    float p_out = fmaxf(vout * iout, 0.0f), slack = 0.15f * a->ctl_cfg.p_rated_w;
    bool bad = a->fsm.out.llc_en && (p_pfc > slack + 2.0f * p_out || p_out > slack + 2.0f * p_pfc);
    a->pbal_bad_ms = bad ? sat16(a->pbal_bad_ms + 1u) : 0u; }
  in->vmid_frac = (vbus > 50.0f) ? clampf(vmid / vbus, 0.0f, 1.0f) : 0.5f;
  in->vout_meas = vout; in->iout_meas = iout; in->vbank_a = va; in->vbank_b = vb;
  /* a node above 60 V with the LLC off sets the operating point — a battery, or terminal capacitors still charged */
  if (!a->fsm.out.llc_en) { if (vout > PMP_MAKE_FLOOR_V) a->ext = true; else if (vout < 50.0f) a->ext = false; }
  in->ext_connected = a->ext;
  in->vext = vout;

  const volatile grid_t *g = &a->grid;
  float vph[3], vll[3], irms[3], isum, hz, dcc;
  bool abc;
  do {
    q = g->seq;
    for (int n = 0; n < 3; n++) { vph[n] = g->vph[n]; vll[n] = g->vll[n]; irms[n] = g->irms[n]; }
    isum = g->isum; hz = g->hz; abc = g->abc; dcc = g->dcc;
  } while ((q & 1u) || q != g->seq);
  if (q != a->grid_seen) {   /* a line cycle closed */
    a->grid_seen = q;
    /* the live reference (see the reference block above): the common DC reads ≈ gain · off · (k_ref / k_true − 1) */
    float frac = dcc / (c->ch[MCH_VAC1].gain * c->ch[MCH_VAC1].off);
    if (!a->uncal && !a->cal_bad && isfinite(frac)) a->k_track = clampf(a->k_track * (1.0f - 0.1f * frac), 0.97f, 1.03f);
    float mx = fmaxf(fmaxf(vll[0], vll[1]), vll[2]), mn = fminf(fminf(vll[0], vll[1]), vll[2]);
    in->vin_ll = (mx - 400.0f > 400.0f - mn) ? mx : mn;          /* display keeps the line farthest from nominal */
    in->vin_ll_min = mn; in->vin_ll_max = mx;                    /* each protection row reads its own side */
    a->iline_rms = fmaxf(fmaxf(irms[0], irms[1]), irms[2]);      /* the Vienna die model reads the worst phase */
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
    /* NO calibration record inhibits delivery exactly like a bad one — even with the nominal transfers a blank card
       still carries the sense chains' full part tolerances; the EOL fixture writes the record (there is deliberately
       no CAN write path for calibration). APP_W_UNCAL names the cause next to F.30. */
    if (a->strap_bad || a->cal_bad || a->uncal) h = FC_CAL;
    /* isum is republished once per line cycle and held between publishes, so its window is counted in cycles: three
       consecutive bad cycles (60 ms) — one disturbed cycle latched a LATCH row before */
    else if (a->az_bad || a->ref_bad_ms >= 100u || a->isum_bad_ms >= 60u || a->avmid_bad_ms >= 100u || a->pbal_bad_ms >= 500u) h = FC_SENSOR;
    else if (ti->stack_pct >= 90u) h = FC_INTERNAL;
    else if (a->hz_bad_ms >= 200u) h = FC_LINE_HZ;
  }
  /* No flux-walk detector: the series Cr blocks a common-mode DC, and the resonant CT has no DC response and is sampled
     asynchronously to the tank, so a differential imbalance between the two cells is not observable here. F.11 and the
     130 °C magnetics cutouts are what act on a real walk. */

  in->hal_fault = h;
  in->wdt_ok = !(a->wdt_boot && a->now_ms <= 1u);             /* a watchdog reset reports F.32 once */
  in->relay_fb = (ti->di & APP_DI_RLY_PRE) ? PMP_RLY_PRE : 0u;
  in->link_age_ms = 0u;                                       /* no inter-card link exists: one MCU runs both stages */
}

static void commit(app_t *a) {
  const pmp_out_t *fo = &a->fsm.out;
  a->pfc_commit = 0u;
  __asm__ volatile ("" ::: "memory");
  a->pfc_sh.en = fo->pfc_en && !fo->pwm_kill && a->fsm.pre_blank_ms == 0u;
  a->pfc_sh.vbus_ref = fo->vbus_ref;
  a->pfc_sh.w_line = a->w_line;
  __asm__ volatile ("" ::: "memory");                   /* C11 orders volatile against volatile only — the non-volatile
                                                           shadow stores may otherwise sink past this flag */
  a->pfc_commit = 1u;
  a->llc_commit = 0u;
  __asm__ volatile ("" ::: "memory");
  a->llc_sh.en = fo->llc_en && !fo->pwm_kill;
  a->llc_sh.ser = fo->mode == MODE_SER;
  a->llc_sh.v_ref = a->ctl.v_ref;
  a->llc_sh.i_ref = a->ctl.i_ref;
  a->llc_sh.v_scale = fmaxf(fo->v_max, PMP_PAR_VMAX_V);
  a->llc_sh.fold_hi_v = fmaxf(fo->vbus_ref - 10.0f, APP_FOLD_LO_V + 10.0f);
  a->llc_sh.fold_crest_v = 1.414f * a->in.vin_ll_max;   /* the fold floor tracks the line crest */
  __asm__ volatile ("" ::: "memory");                   /* the shadow stores must precede the flag */
  a->llc_commit = 1u;
}

/* The comparator references are the INVERSE of meas_val (meas.h). The DAC is VREFP-referenced exactly as the ADC is
   (UM §18: V_out = VREFP · code / 4096), so the code that lands a threshold on a given SENSOR voltage must carry the
   same k_ref the measurement removes: an absolute channel on the whole reading, a ratiometric (AVMID) channel on the
   swing alone, because AVMID itself tracks VREFP. Without it a rail 2.5 % high moved F.03 from 860 V to 922 V while the
   telemetry still read the bus correctly. Returned in volts on the nominal 3.3 V scale (counts · LSB); the port
   truncates to a code, which only ever tightens an upper threshold. */
static float dac_v(const meas_cal_t *c, int ch, float value, float k) {
  float counts = (ch <= MCH_RATIO_LAST) ? c->ch[ch].off + value / (c->ch[ch].gain * k) : (value / c->ch[ch].gain + c->ch[ch].off) / k;
  return counts * LSB;
}

static void outputs(app_t *a, app_tick_out_t *o) {
  const pmp_out_t *fo = &a->fsm.out;
  o->do_bits = (uint16_t)((fo->k_pre ? APP_DO_KPRE : 0u) | (fo->k_ser ? APP_DO_KSER : 0u) | (fo->k_para ? APP_DO_KPARA : 0u) |
                          (fo->k_parb ? APP_DO_KPARB : 0u) | (fo->q_disch ? APP_DO_QDIS : 0u) | (fo->q_disch_bk ? APP_DO_QDISBK : 0u) |
                          (a->pfc_sh.en ? APP_DO_EN_PFC : 0u) | (a->llc_sh.en ? APP_DO_EN_LLC : 0u));
  /* the comparator references from the rating and the calibration in force (firmware may tighten, never loosen).
     POSITIVE reference only: a bipolar F.01 would load AVMID − k·I_trip whenever the measured current read negative,
     and with non-inverted comparators into active-HIGH fault inputs that reference asserts the fault for the whole
     negative half cycle — including at idle, where the sign of ≈ 0 A is noise. The negative polarity is covered
     instead by Σi = 0 and the 100 kHz magnitude test in app_pfc_isr. */
  for (int n = 0; n < 3; n++) {
    a->dac_oc_pos[n] = dac_v(&a->cal, MCH_IA + n, a->fsm.oc_line_a, a->k_ref);
    o->dac_v[APP_DAC_IA + n] = a->dac_oc_pos[n];
  }
  o->dac_v[APP_DAC_VBUS] = dac_v(&a->cal, MCH_VBUS, PMP_BUS_OVP_V, a->k_ref);
  /* the F.13 comparator threshold follows the output mode WHILE THE LLC RUNS — LOW mode's banks meet a hardware limit at
     560 V instead of the HIGH-mode 1050 V (the documented interim until HW-REC-1 is decided; an EV contactor opening
     ends the session anyway, so the latch is the protective outcome, not a nuisance). Idle, the terminals belong to
     whatever the bus carries: a spare module in LOW mode beside an 800 V session sees 800 V through SNS_VOUT with DOUT
     blocking and nothing of its own to protect — at 560 V that is a counted LATCH per session start, F.31 after five.
     The stage cannot raise its output while it is off, so the absolute limit is the right one until it runs. */
  float th13 = (fo->llc_en && fo->v_max <= PMP_PAR_VMAX_V) ? 560.0f : PMP_OUT_OVP_ABS_V;
  o->dac_v[APP_DAC_VOUT] = dac_v(&a->cal, MCH_VOUT, th13, a->k_ref);
  /* HW-REC-1 readiness: the non-latching clamp reference rides the active CV setpoint; armed high when idle */
  float vr = a->ctl.v_ref;
  o->dac_v[APP_DAC_CLAMP] = dac_v(&a->cal, MCH_VOUT, (vr > 50.0f) ? fminf(vr * 1.05f + 10.0f, th13) : th13, a->k_ref);
  /* relay-coil economizer (docs/firmware-guide.md, relay economization) — 60 ms pull-in, then 40 % hold at 20 kHz, which is what keeps the coils inside the aux budget */
  static const uint16_t RLY_DO[APP_RLY_COUNT] = { APP_DO_KPRE, APP_DO_KSER, APP_DO_KPARA, APP_DO_KPARB };
  for (int r = 0; r < APP_RLY_COUNT; r++) {
    if (!(o->do_bits & RLY_DO[r])) { a->rly_ms[r] = 0u; o->relay_duty[r] = 0.0f; }
    else {
      if (a->rly_ms[r] < 0xFFFFu) a->rly_ms[r]++;
      o->relay_duty[r] = (a->rly_ms[r] <= APP_RLY_PULL_MS) ? 1.0f : APP_RLY_HOLD;
    }
  }
  /* No re-arm output: a tripped stage comes back only through its own control interrupt, which re-enables its outputs
     once trip_ack has caught up with trip_n (this tick's commit) and the FSM commands the stage again — through the
     bypass-closure blank (F.01 blanked, the stage held off) and after a latched row has cleared alike. */
  o->disch_intent = a->fsm.st == ST_SHUTDOWN || a->fsm.st == ST_DISCH;   /* the port keeps it across a reset */
}

static void fans(app_t *a, const app_tick_in_t *ti, app_tick_out_t *o) {
  if (a->n_fans == 0u) { a->in.fan_ok = true; return; }       /* 50 kW liquid: sealed, no fans */
  if (a->now_ms % 10u == 0u) {
    const pmp_out_t *fo = &a->fsm.out;
    /* the SINK zones on the core scale, never the inlet: the inlet is what the fans blow with, and on the worst-zone
       scale a 40 °C ambient alone read as 81 % duty in cold standby — fans that never stopped above 0 °C */
    float t = a->t_sink_core, p = fmaxf(a->in.vout_meas * a->in.iout_meas, 0.0f) / a->ctl_cfg.p_rated_w;
    bool need = fo->pfc_en || fo->llc_en || t > 50.0f;
    /* §7: the larger of the temperature curve (the core's scale, 25 % at 60 °C to full at 100 °C) and the load feed-forward */
    float d = need ? fmaxf(clampf(0.25f + (t - 60.0f) * 0.01875f, 0.25f, 1.0f), fo->llc_en ? 0.25f + 0.75f * clampf(p, 0.0f, 1.0f) : 0.0f)
                   : 0.0f;
    if (a->cfg.vmp.fan_mode == 1u) d = fminf(d, 0.6f);        /* quiet: the thermal derate absorbs the rest */
    else if (a->cfg.vmp.fan_mode == 2u && need) d = 1.0f;     /* boost */
    if (d == 0.0f && a->fan_duty > 0.0f && a->now_ms - a->fan_on_ms < 10000u) d = a->fan_duty;   /* at least 10 s on */
    /* The 50 kW-air aux budget is ≈ 120 W on a 110 W stage, and the NCP1252's over-current protection is a LATCH —
       once it trips, only a power cycle clears it. So nothing starts on a rail that has not been in spec for 500 ms
       (rails_ms is the measured rails, not in.aux_ok: the fans must not wait on the boot offset window, which needs
       the stages running), and the two fan PWM channels never start together. */
    if (a->rails_ms < 500u) d = 0.0f;
    if (d > a->fan_duty || d < a->fan_duty - 0.1f || d == 0.0f) {   /* 10 % hysteresis on the way down */
      if (a->fan_duty == 0.0f && d > 0.0f) a->fan_on_ms = a->now_ms;
      a->fan_duty = d;
    }
    uint8_t fail = 0u;
    for (uint8_t k = 0u; k < a->n_fans; k++) {
      /* the floor scales with the command — a fixed 5 Hz (150 rpm) passes at ANY duty, so a fan at 4 % of its
         commanded speed would read healthy. Below 20 % duty the tach is too slow to judge (the running floor when
         cooling is needed is 25 %, so a needed fan is always judged). A failed fan that recovers clears its bit and
         the count-based derate recovers through the FSM's slew. */
      /* each fan against the duty of ITS OWN PWM group — fans 3 and 4 trail group 1 by the 300 ms stagger, which used
         to count against their 3 s window; and a tach reading three times full speed is noise on an open or chattering
         line, not a fan: it reads as stopped, so a disconnected fan cannot pass as healthy */
      float dk = (k >= 2u && a->now_ms - a->fan_on_ms < 300u) ? 0.0f : a->fan_duty;
      float hz = (ti->tach_hz[k] > 3.0f * APP_TACH_FULL_HZ) ? 0.0f : ti->tach_hz[k];
      bool judged = dk >= 0.2f;
      bool slow = judged && !(hz >= fmaxf(5.0f, 0.35f * dk * APP_TACH_FULL_HZ));
      a->fan_still_ms[k] = slow ? sat16(a->fan_still_ms[k] + 10u) : 0u;
      if (a->fan_still_ms[k] >= 3000u) fail = (uint8_t)(fail | (1u << k));
    }
    a->fan_fail = fail;
    a->in.fan_ok = fail == 0u;
    a->in.fans_total = a->n_fans;                             /* the core derates by the failed COUNT */
    uint8_t nf = 0u;
    for (uint8_t k = 0u; k < a->n_fans; k++) nf = (uint8_t)(nf + ((fail >> k) & 1u));
    a->in.fans_failed = nf;
  }
  o->fan_duty[0] = a->fan_duty;
  /* FAN_PWM2 (fans 3–4, or the 30 kW third fan) trails the first group by 300 ms, so four fans never draw
     their starting current together. The card carries two fan PWM channels, so this is the whole firmware half of the
     stagger — fans 1 and 2 share FAN_PWM1 and always start together, which is a hardware fact, not a policy. */
  o->fan_duty[1] = (a->now_ms - a->fan_on_ms < 300u) ? 0.0f : a->fan_duty;
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
  } else if (hold1 && idle && a->b2_ms == 0u) { a->edit = true; a->edit_addr = a->cfg.panel_addr; a->edit_ms = 0u; }
  /* BOTH buttons held for 3 s inside the first 10 s after power-up = service request. It is the only way into the
     bootloader that needs no VMP controller: a TonHe-profile module has no ENTER_BOOT action and its SWD header is
     behind the 88-way connector. Both stages must be off, like every other reboot. */
  if (a->now_ms < 10000u && !a->wrapped && idle && a->b1_ms >= 3000u && a->b2_ms >= 3000u) o->enter_boot = true;

  uint8_t d1, d2;
  int f = (int)a->tlm.fault;
  if (a->fsm.lock) { d1 = 0x38u; d2 = 0x3Fu; }                                   /* "LO" */
#if PMP_WITH_TONHE_V12
  /* TonHe §9.2.6 promises automatic address assignment at power-on and defines no mechanism. With no
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
  m->t_margin_k = a->t_margin_k;
  m->derate = m->derate * (1.0f - a->die_fold);   /* the availability the controller is TOLD includes the observer's fold — a declined point read 100 % */
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
             (ti->can_state != 0u ? APP_W_CAN : 0u) | (ti->stack_pct >= 70u ? APP_W_STACK : 0u) | (a->ovr_seen ? APP_W_OVERRUN : 0u);
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
  if (a->factory_pend && a->now_ms - a->t_cfg >= 100u) {      /* FACTORY_RESET — defaults stored, then reboot */
    app_cfg_default(&a->cfg);
    a->cfg.vmp.profile = (uint8_t)PMP_PROFILE_NATIVE;
    if (nvm_put(&a->nvm, APP_NV_CFG, (const uint8_t *)&a->cfg, (uint8_t)sizeof a->cfg, quiet)) {
      a->factory_pend = false; a->reboot_pend = true;
      a->t_cfg = a->now_ms;
    }
  }
  if (a->ev.qn || a->ev.lost) evlog_flush(&a->ev, quiet);       /* events append outside delivery; the ring moves
                                                                   only with both stages stopped (§9 flash discipline) */
  bool hourly = a->now_ms - a->t_cnt >= 3600000u;
  if ((a->cnt_due || hourly) && a->now_ms - a->t_cnt >= 600000u) {   /* at a session end or hourly, at most one per 10 min */
    app_counters_t c = a->cnt;
    c.faults = sat16((uint32_t)a->cnt.faults + a->fsm.fault_count);
    if (nvm_put(&a->nvm, APP_NV_COUNTERS, (const uint8_t *)&c, (uint8_t)sizeof c, quiet)) { a->t_cnt = a->now_ms; a->cnt_due = false; }
  }
}

static void can_service(app_t *a, const app_tick_in_t *ti, app_tick_out_t *o) {
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
    if (a->vmp.boot_req) o->enter_boot = true;                  /* the port writes the handoff and resets */
    if (a->vmp.factory_req) { a->vmp.factory_req = false; a->factory_pend = true; }
  }
}

/* One step of the junction observer (hal/dielim.h) on the point the stages are standing on. The LLC loss needs
   the modulator's frequency, phase-shift duty and tank rms and counts only while the bridge is gated (a burst's off time
   cools); the Vienna loss needs the line and the worst phase current. A stopped stage's estimate falls back onto its base
   (a die is there in a second, a restart takes longer), and stopping the LLC forgets a declined point: the PFC stays warm
   for 60 s after a stop, and a session restarted at a voltage the module CAN serve must not inherit the refusal. */
static void die_limit(app_t *a, pmp_ctl_in_t *ci) {
  const pmp_out_t *fo = &a->fsm.out;
  if (!fo->llc_en) { a->die.tj_llc = NAN; a->die.declined = false; a->die.over_s = 0.0f; }
  if (!fo->pfc_en) a->die.tj_pfc = NAN;
  float vbank = (fo->mode == MODE_SER) ? 0.5f * a->in.vout_meas : a->in.vout_meas;
  float w_llc = dielim_llc_w(&a->die_cfg, vbank, a->vbus_now, a->llc.f_hz, a->llc.duty, a->llc.i_rms, fo->llc_en && a->llc.gate, a->die.tj_llc);
  float w_pfc = dielim_pfc_w(&a->die_cfg, a->in.vin_ll_min, a->vbus_now, a->iline_rms, fo->pfc_en && a->pfc.run, a->die.tj_pfc);
  ci->die_fold = dielim_step(&a->die, &a->die_cfg, w_llc, a->t_zone[2], w_pfc, a->t_zone[0], 1.0e-3f);
  a->die_fold = ci->die_fold;
}

void app_tick(app_t *a, const app_tick_in_t *ti, app_tick_out_t *o) {
  memset(o, 0, sizeof *o);
  if (++a->now_ms == 0u) a->wrapped = true;   /* 49.7 days: the boot-window tests below must not re-open */
  uint16_t trip_snap = a->trip_n;   /* only the trips that exist NOW are acknowledged at the end of this tick */
  a->pfc_us = ti->pfc_exec_us > a->pfc_us ? ti->pfc_exec_us : a->pfc_us;   /* T-44: high-water since boot */
  a->llc_us = ti->llc_exec_us > a->llc_us ? ti->llc_exec_us : a->llc_us;
  a->stack_pct = ti->stack_pct > a->stack_pct ? ti->stack_pct : a->stack_pct;
  a->can_rx_ovr = ti->can_rx_ovr;
  supervise(a, ti);
  measure(a, ti);
  /* firmware-architecture §2 */
  for (uint8_t k = 0u; k < ti->rx_n; k++) a->prof->rx(a->prof_ctx, &ti->rx[k], a->now_ms, &a->tlm, &a->cmd, &a->txq);
  a->prof->tick(a->prof_ctx, a->now_ms, &a->tlm, &a->cmd, &a->txq);
  pmp_cmd_to_in(&a->cmd, &a->in, &a->fsm);
  pmp_fsm_step(&a->fsm, &a->in);
  pmp_ctl_in_t ci;
  pmp_cmd_to_ctl(&a->cmd, &a->fsm, &a->in, a->reg.cv, &ci);
  die_limit(a, &ci);
  pmp_ctl_step(&a->ctl, &a->ctl_cfg, &ci, 1.0e-3f);
  commit(a);
  a->trip_ack = trip_snap;         /* the FSM has seen those trips and its (dis)enables are committed to the ISRs */
  outputs(a, o);
  fans(a, ti, o);
  panel(a, ti, o);
  telemetry(a, ti);
  events(a);
  /* a pending image confirms after 60 s of healthy standby — no LATCH/LOCK row since boot (AUTO grid rows do
     not block a good image; F.30/F.29/F.32 do). The port acts on the rising edge (boot/bootctl.h) with a flash
     program, possibly a page erase, from the tick — so only with both stages stopped, the discipline every journal
     write keeps (nvm_service): a 20 ms erase stall under power would freeze every supervisory row while the TCM loops ran on. */
  o->boot_ok = a->now_ms >= 60000u && !a->latch_seen && !a->strap_bad && !a->cal_bad && !a->uncal &&
               !a->fsm.out.pfc_en && !a->fsm.out.llc_en;
  nvm_service(a);
  can_service(a, ti, o);
  /* the sequenced watchdog: the HAL says whether kicking is PERMITTED — both ISRs advanced on each of the last
     10 ticks — and the port pulses WDI on its own 10 ms of real time, so a blocking flash erase cannot bunch two
     edges inside the TPS3430's 2.22 ms lower bound or stretch past its 23.375 ms upper one. */
  o->wdt_kick = a->wdt_good >= APP_WDT_KICK_MS;
}
