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
#include "dielim.h"
#include "meas.h"
#include "nvm.h"
#include "evlog.h"
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

/* HRTIMER fault channels (umod-pinmap E48 / E75 / E81, GD32G553 UM Table 25-21) */
#define APP_FLT_IB     0u   /* CMP1 ← I_B0 */
#define APP_FLT_IA     1u   /* E81: CMP3 ← I_A0 (PB0 after the reviewer-I §7 pin swap; was CMP7 → channel 7) */
#define APP_FLT_EXT    2u   /* the FLT wire-OR on PB10: gate-driver DESAT and the F.11 tank window */
#define APP_FLT_VOUT   3u   /* CMP0 ← SNS_VOUT */
#define APP_FLT_IC     4u   /* CMP2 ← I_C0 */
#define APP_FLT_VBUS   5u   /* CMP4 ← SNS_VBUSP */
#define APP_FLT_LINE_OC ((1u << APP_FLT_IA) | (1u << APP_FLT_IB) | (1u << APP_FLT_IC))
#define APP_FLT_ALL    0x3Fu

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

/* APP_DAC_CLAMP is HW-REC-1 firmware readiness: the non-latching cycle-by-cycle output clamp's reference
   (v_ref · 1.05 + 10 V, never above the latching F.13 threshold). The port maps it only when the hardware exists. */
enum { APP_DAC_IA = 0, APP_DAC_IB, APP_DAC_IC, APP_DAC_VBUS, APP_DAC_VOUT, APP_DAC_CLAMP, APP_DAC_COUNT };
/* E80: relay-coil economizer duties (firmware-guide E26): 100 % pull-in for 60 ms after a close command, then 40 % hold
   at 20 kHz. Order: KPRE · KSER · KPARA · KPARB. do_bits stays the boolean truth; a port without a PWM-capable pin for a
   coil drives the full duty. */
enum { APP_RLY_KPRE = 0, APP_RLY_KSER, APP_RLY_KPARA, APP_RLY_KPARB, APP_RLY_COUNT };
#define APP_RLY_PULL_MS 60u
#define APP_RLY_HOLD    0.4f
/* E80 (review HR-25/R25): fan supervision is a curve, not a floor — full-speed tach of the selected fan (two pulses per
   revolution); a fan below 35 % of the speed its duty commands for 3 s has failed. Calibrate at EVT with the chosen fan. */
#define APP_TACH_FULL_HZ 120.0f

/* the HAL's warnings, above the core's PMP_W_* bits in mod_tlm_t.warn */
#define APP_W_UNCAL    (1u << 16)  /* no calibration record: nominal scaling (±3 % class) */
#define APP_W_OFFSET   (1u << 17)  /* current flowed through every boot offset window: calibration offsets in use */
#define APP_W_NVM      (1u << 18)  /* a store failed three times running */
#define APP_W_CAN      (1u << 19)  /* CAN error-passive or bus-off */
#define APP_W_STACK    (1u << 20)  /* a stack past 70 % of its size */
#define APP_W_OVERRUN  (1u << 21)  /* control deadlines missed in the last 100 ms, below the F.35 verdict */
#define APP_W_FLUX     (1u << 22)  /* E81 (F-E-15): a DC component in the resonant current — transformer flux walk */

typedef struct { float ia, ib, ic, vbus, vmid, vac[3]; } app_pfc_adc_t;        /* counts at this peak or valley */
typedef struct { float vout, iout_p, iout_n, ires, vbka, vbkb; } app_llc_adc_t; /* counts, the mean of the period's samples */
typedef struct { float on[3]; bool en; } app_pfc_out_t;
typedef struct { float f_hz, duty, dead_s, dead_a_s, dead_b_s; bool gate; } app_llc_out_t;   /* E81: per-leg ZVS transitions to program (dead_s = the longer, for single-value readers) */

typedef struct {
  float t_pfc, t_inlet, t_llc, t_xfmr;   /* NTC counts */
  float v24, v15, vrefint, avmid;        /* counts — E81 (F-D-13): AVMID is converted and checked */
  bool late;                             /* E81 (F-E-01a): this tick is a collapsed backlog — the heartbeat re-baselines */
  uint16_t di;                           /* APP_DI_* */
  float tach_hz[4];
  uint8_t can_state;                     /* 0 error-active · 1 error-passive · 2 bus-off */
  uint16_t can_rx_ovr;                   /* E82 (K-6): drains that found every RX mailbox occupied — frames may have been lost */
  uint8_t stack_pct;                     /* worst painted stack */
  uint16_t pfc_exec_us, llc_exec_us;     /* longest ISR execution since the last tick (DWT) */
  const pmp_frame_t *rx; uint8_t rx_n;   /* frames received since the last tick, acceptance-filtered */
} app_tick_in_t;

typedef struct {
  uint16_t do_bits;                      /* APP_DO_* */
  float relay_duty[APP_RLY_COUNT];       /* E80: economizer duty per coil (0 = open) */
  float fan_duty[2];                     /* FAN_PWM1 · FAN_PWM2 (fans 3 and 4 share PWM2) */
  float dac_v[APP_DAC_COUNT];            /* comparator references, volts on the 3.3 V DAC scale */
  bool wdt_kick;                         /* E81: kicking is PERMITTED — the port owns the 10 ms cadence (F-D-9) */
  uint16_t fault_rearm;                  /* E81 (F-E-11): the HRTIMER fault channels to clear (APP_FLT_* bits; 0 = none) */
  bool disch_intent;                     /* E81 (F-E-02): a commanded discharge is in progress — survive a reset */
  bool can_restart; uint32_t can_bitrate;
  bool reboot;                           /* a profile's reboot, once its acknowledgement has left */
  bool enter_boot;                       /* E80: ACTION ENTER_BOOT accepted — reset into the bootloader (handoff.h) */
  bool boot_ok;                          /* E80: 60 s of healthy standby and no LATCH/LOCK row since boot — the port
                                            confirms a pending slot (boot/bootctl.h) on its rising edge */
  uint8_t hmi_seg, hmi_dig;              /* segments (bit 0 = a … bit 7 = DP) for digit 1 or 2 */
} app_tick_out_t;

typedef struct {
  float rating_counts;                   /* ROLE1 strap */
  float vrefint_v;                       /* E82 (D-07): the part's own factory VREFINT (V); 0 = not available */
  uint8_t reset_cause;                   /* E81 (F-E-03): RCU_RSTSCK bits 31:24 raw — the HAL classifies */
  uint8_t hw_rev;                        /* E81 (F-D-15): card revision strap (0 = rev A) */
  bool handoff_reboot;                   /* the last reset was a deliberate, sealed reboot */
  bool disch_pending;                    /* E81 (F-E-02): the pre-reset handoff says a discharge was commanded */
  uint32_t uid, fw, nvm_page_size;
  uint32_t fw_crc, boot_ver;             /* E80: from the image header / bootloader (0 when absent) */
  uint8_t boot_state;                    /* E80: VMP object 0x0009 (boot/bootctl.h state) */
  uint8_t evlog_pages;                   /* E80: port pages 4 … 4 + n − 1 hold the event ring (0 = no event log); pages 2/3 are the bootloader's record store */
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

typedef struct { bool en, ser; float v_ref, i_ref, v_scale, fold_hi_v, fold_crest_v; } app_llc_ref_t;   /* E81: fold_crest_v = 1.414·VLL_max (F-E-05) */

typedef struct {
  /* identity and configuration */
  uint16_t kw; uint8_t n_fans; bool liquid, strap_bad, cal_bad, uncal, wdt_boot;
  app_cfg_t cfg; app_counters_t cnt; bool cfg_dirty;
  pfc_cfg_t pfc_cfg; llc_cfg_t llc_cfg; pmp_ctl_cfg_t ctl_cfg; pmp_reg_cfg_t reg_cfg; meas_cal_t cal;
  dielim_cfg_t die_cfg; dielim_t die; float iline_rms;   /* E82 (C-11): junction observer · worst phase rms for it */
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
  uint32_t az_gen; bool az_done, az_bad, az_gave_up; uint8_t az_try;
  /* fault ISR — one counter per kind, the tick keeps what it has seen */
  volatile uint8_t flt_n[5]; uint8_t flt_seen[5];
  /* E82 (LV-4): the hardware trip HOLD. trip_n counts HRTIMER fault interrupts (one writer: app_fault_isr); trip_ack is the
     count the 1 ms sequence has carried through the FSM and committed (one writer: app_tick). While they differ the two
     control interrupts command their outputs OFF — without it the port's unconditional CHOUTEN writes re-armed a tripped
     stage 10 µs (PFC) / 100 µs (LLC) later, for as long as the tick took to latch (1 ms, or 20+ ms behind a flash erase). */
  volatile uint8_t trip_n; uint8_t trip_ack;
  /* tick state */
  uint32_t pfc_last, llc_last, ovr_win; uint8_t wdt_good, ovr_hard; bool hb_ok, ovr_seen;
  uint32_t grid_seen; float g_vph[3], g_hz; uint16_t hz_bad_ms, isum_bad_ms, ref_bad_ms, rails_ms, avmid_bad_ms, flux_ms;
  bool hz_bad, isum_bad, ext;
  /* E81 (F-D-7): the 1-in-10 line-cycle work moved out of the 100 kHz ISR. The PFC ISR fills the spare half of a double
     buffer and publishes an index; the 10 kHz LLC ISR does grid_sample() and the boot offset window from it. */
  struct { float v[3], i[3], ia, ib, ic; } g_buf[2];
  volatile uint8_t g_idx, g_new;
  float ires_dc;                          /* E82 (M-31): DEAD — a CT has no DC response, so this never was a flux-walk proxy */
  float dac_oc_pos[3];                    /* E82 (C-02): the F.01 comparator reference, positive polarity only */
  float t_zone[4];
  float fan_duty; uint32_t fan_on_ms; uint16_t fan_still_ms[4]; uint8_t fan_fail;
  uint16_t b1_ms, b2_ms; bool edit; uint8_t edit_addr; uint16_t edit_ms;
  uint32_t op_ms, t_cfg, t_cnt; float e_mws; bool llc_was, cnt_due; uint8_t nvm_fail;
  /* E80: event log, bootloader glue, diagnostics, relay economizer */
  evlog_t ev; pmp_fault_t ev_prev; bool latch_seen, factory_pend, reboot_pend;
  uint16_t pfc_us, llc_us, can_rx_ovr; uint8_t stack_pct;
  uint16_t rly_ms[APP_RLY_COUNT];
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
