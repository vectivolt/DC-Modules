/* app.h — E79 the module application: the one place the power core, the protocol profile and the portable HAL modules meet.
 * Sans-IO. A port (firmware/port/<mcu>) reads the peripherals, calls these entries from its interrupts and its 1 ms timer, and
 * writes back what they return; firmware/test/app_test.c does the same against plant models. Flash access (hal/nvm.h) is the
 * only link-time call.
 *
 *   entry           context (priority)                        work
 *   app_fault_isr   HRTIMER fault (highest)                   attribute the latched channels: F.01 · F.02 · F.03 · F.11 · F.13
 *   app_pfc_isr     carrier peak and valley, 100 kHz          calibrate → pfc_step → ON fractions · grid monitor and offsets
 *                                                             at 10 kHz · 1 ms bus means
 *   app_llc_isr     end of the output sequence, 10 kHz        calibrate → bus fold-back → pmp_reg_step → llc_step · 1 ms means
 *   app_tick        1 kHz (lowest)                            supervision · measurements and the HAL's rows · the §2 sequence ·
 *                                                             relays, gate enables, comparator references · fans · panel ·
 *                                                             telemetry · NVM · CAN recovery · watchdog
 * Data crosses contexts one way each: the tick commits references to an ISR (shadow, then a commit flag the ISR takes at entry);
 * an ISR publishes 1 ms means under a sequence counter that is odd while it writes, and the tick re-reads until it copies an even,
 * unchanged one; fault events are per-kind counters with one writer each. No locks, no heap. */
#ifndef PMP_APP_H
#define PMP_APP_H
#include "pfc.h"
#include "llc.h"
#include "meas.h"
#include "nvm.h"
#include "../core/fsm.h"
#include "../core/ctl.h"
#include "../core/modapi.h"
#include "../proto/profile.h"
#include "../proto/vmp.h"
#ifndef PMP_WITH_TONHE_V12
#define PMP_WITH_TONHE_V12 1
#endif
#if PMP_WITH_TONHE_V12
#include "../proto/tonhe_v12.h"
#endif

/* HRTIMER fault channels (umod-pinmap E48 / E75, GD32G553 UM Table 25-21) */
#define APP_FLT_IB     0u   /* CMP1 ← I_B0 */
#define APP_FLT_EXT    2u   /* the FLT wire-OR on PB10: gate-driver DESAT and the F.11 tank window */
#define APP_FLT_VOUT   3u   /* CMP0 ← SNS_VOUT */
#define APP_FLT_IC     4u   /* CMP2 ← I_C0 */
#define APP_FLT_VBUS   5u   /* CMP4 ← SNS_VBUSP */
#define APP_FLT_IA     7u   /* CMP7 ← I_A0 */

#define APP_DO_KPRE    (1u << 0)   /* CTL_KPRE — precharge bypass */
#define APP_DO_KSER    (1u << 1)
#define APP_DO_KPARA   (1u << 2)
#define APP_DO_KPARB   (1u << 3)
#define APP_DO_QDIS    (1u << 4)   /* CTL_QDIS — bus discharge */
#define APP_DO_QDISBK  (1u << 5)   /* CTL_QDISBK — bank bleeders */
#define APP_DO_EN_PFC  (1u << 6)   /* into the GATE_EN_A safety AND */
#define APP_DO_EN_LLC  (1u << 7)   /* into the GATE_EN_B safety AND */

#define APP_DI_RLY_PRE (1u << 0)   /* RELAY_FB_KPRE reads the bypass closed */
#define APP_DI_DRV_RDY (1u << 1)   /* the gate drivers' supplies are good */
#define APP_DI_BTN1    (1u << 2)   /* pressed */
#define APP_DI_BTN2    (1u << 3)

enum { APP_DAC_IA = 0, APP_DAC_IB, APP_DAC_IC, APP_DAC_VBUS, APP_DAC_VOUT, APP_DAC_COUNT };

/* the HAL's warnings, above the core's PMP_W_* bits in mod_tlm_t.warn */
#define APP_W_UNCAL    (1u << 16)  /* no calibration record: nominal scaling (±3 % class) */
#define APP_W_OFFSET   (1u << 17)  /* current flowed through every boot offset window: calibration offsets in use */
#define APP_W_NVM      (1u << 18)  /* a store failed three times running */
#define APP_W_CAN      (1u << 19)  /* CAN error-passive or bus-off */
#define APP_W_STACK    (1u << 20)  /* a stack past 70 % of its size */
#define APP_W_OVERRUN  (1u << 21)  /* control deadlines missed in the last 100 ms, below the F.35 verdict */

typedef struct { float ia, ib, ic, vbus, vmid, vac[3]; } app_pfc_adc_t;        /* counts at this peak or valley */
typedef struct { float vout, iout_p, iout_n, ires, vbka, vbkb; } app_llc_adc_t; /* counts, the mean of the period's samples */
typedef struct { float on[3]; bool en; } app_pfc_out_t;
typedef struct { float f_hz, duty; bool gate; } app_llc_out_t;

typedef struct {
  float t_pfc, t_inlet, t_llc, t_xfmr;   /* NTC counts */
  float v24, v15, vrefint;               /* counts */
  uint16_t di;                           /* APP_DI_* */
  float tach_hz[4];
  uint8_t can_state;                     /* 0 error-active · 1 error-passive · 2 bus-off */
  uint8_t stack_pct;                     /* worst painted stack */
  uint16_t pfc_exec_us, llc_exec_us;     /* longest ISR execution since the last tick (DWT) */
  const pmp_frame_t *rx; uint8_t rx_n;   /* frames received since the last tick, acceptance-filtered */
} app_tick_in_t;

typedef struct {
  uint16_t do_bits;                      /* APP_DO_* */
  float fan_duty[2];                     /* FAN_PWM1 · FAN_PWM2 (fans 3 and 4 share PWM2) */
  float dac_v[APP_DAC_COUNT];            /* comparator references, volts on the 3.3 V DAC scale */
  bool wdt_kick;                         /* pulse WDI */
  bool fault_rearm;                      /* clear the HRTIMER fault latches */
  bool can_restart; uint32_t can_bitrate;
  bool reboot;                           /* a profile's reboot, once its acknowledgement has left */
  uint8_t hmi_seg, hmi_dig;              /* segments (bit 0 = a … bit 7 = DP) for digit 1 or 2 */
} app_tick_out_t;

typedef struct {
  float rating_counts;                   /* ROLE1 strap */
  bool wdt_reset;                        /* the reset cause was the watchdog */
  uint32_t uid, fw, nvm_page_size;
} app_boot_t;

#define APP_CFG_VERSION 1u
enum { APP_NV_CFG = 1, APP_NV_CAL = 2, APP_NV_COUNTERS = 3 };
typedef struct {
  uint16_t version;
  vmp_cfg_t vmp;                         /* the native profile's configuration; it also carries the profile id and bit rate */
  uint8_t th_addr_mode, th_addr_can;     /* TonHe V1.2 persistent address state */
  uint8_t panel_addr;                    /* the panel's address, 1–240 (TonHe automatic mode) */
} app_cfg_t;
typedef struct { uint32_t op_s, energy_wh, starts; uint16_t faults; } app_counters_t;

typedef struct { float sum, lo, hi; } app_az_t;
typedef struct { app_az_t ch[3]; uint32_t n, gen; } app_azs_t;

typedef struct { bool en, ser; float v_ref, i_ref, v_scale, fold_hi_v; } app_llc_ref_t;

typedef struct {
  /* identity and configuration */
  uint16_t kw; uint8_t n_fans; bool liquid, strap_bad, cal_bad, uncal, wdt_boot;
  app_cfg_t cfg; app_counters_t cnt; bool cfg_dirty;
  pfc_cfg_t pfc_cfg; llc_cfg_t llc_cfg; pmp_ctl_cfg_t ctl_cfg; pmp_reg_cfg_t reg_cfg; meas_cal_t cal;
  nvm_t nvm;
  /* the core and the protocol */
  pmp_fsm_t fsm; pmp_in_t in; pmp_ctl_t ctl; mod_cmd_t cmd; mod_tlm_t tlm;
  const pmp_profile_t *prof; void *prof_ctx; vmp_t vmp; vmp_ident_t ident;
#if PMP_WITH_TONHE_V12
  th12_t th;
#endif
  pmp_txq_t txq; uint32_t bitrate, now_ms;
  float k_ref, w_line;
  /* PFC ISR */
  pfc_t pfc; pfc_ref_t pfc_sh, pfc_ref; volatile uint8_t pfc_commit;
  grid_t grid; uint8_t grid_div;
  float pa_vbus, pa_vmid; uint32_t pa_n;
  volatile float pub_vbus, pub_vmid, vbus_now; volatile uint32_t pub_pfc_seq, pfc_count;
  app_azs_t azp;
  /* LLC ISR */
  pmp_reg_t reg; llc_t llc; app_llc_ref_t llc_sh, llc_ref; volatile uint8_t llc_commit;
  float la_vout, la_iout, la_vbka, la_vbkb; uint32_t la_n;
  volatile float pub_vout, pub_iout, pub_vbka, pub_vbkb, p_llc; volatile uint32_t pub_llc_seq, llc_count;
  app_azs_t azl;                          /* ch 0 I_RES, ch 1 the output differential */
  uint32_t az_gen; bool az_done, az_bad; uint8_t az_try;
  /* fault ISR — one counter per kind, the tick keeps what it has seen */
  volatile uint8_t flt_n[5]; uint8_t flt_seen[5];
  /* tick state */
  uint32_t pfc_last, llc_last, ovr_win; uint8_t wdt_good; bool hb_ok, ovr_seen;
  uint32_t grid_seen; float g_vph[3], g_hz; uint16_t hz_bad_ms, isum_bad_ms, ref_bad_ms, rails_ms;
  bool hz_bad, isum_bad, ext;
  float t_zone[4];
  float fan_duty; uint32_t fan_on_ms; uint16_t fan_still_ms[4]; uint8_t fan_fail;
  uint16_t b1_ms, b2_ms; bool edit; uint8_t edit_addr; uint16_t edit_ms;
  uint32_t op_ms, t_cfg, t_cnt; float e_mws; bool llc_was, cnt_due; uint8_t nvm_fail;
  bool busoff; uint32_t t_busoff, busoff_t[10]; uint8_t busoff_i, busoff_n;
} app_t;

void app_cfg_default(app_cfg_t *c);
void app_init(app_t *a, const app_boot_t *b);
void app_pfc_isr(app_t *a, const app_pfc_adc_t *s, app_pfc_out_t *o);
void app_llc_isr(app_t *a, const app_llc_adc_t *s, app_llc_out_t *o);
/* ch: the fault channels latched (bit n = channel n) · ires_counts: I_RES sampled at the FLT edge */
void app_fault_isr(app_t *a, uint16_t ch, float ires_counts);
void app_tick(app_t *a, const app_tick_in_t *ti, app_tick_out_t *o);
#endif
