/* port.c — E80 the application image's main loop and interrupt glue: the one file where firmware/hal/app.h meets the metal.
 * Contexts (firmware-architecture §2/§3): HRTIMER fault IRQ76 (prio 0) → app_fault_isr · ST3 CMP3 IRQ71 at 100 kHz
 * (prio 1) → app_pfc_isr · master REP IRQ67 at 10 kHz (prio 2) → app_llc_isr · SysTick 1 kHz (prio 14) → app_tick.
 * The 100 kHz and 10 kHz paths live in TCM (.ramfunc) so flash appends never stall them (§3.5, review HR-26). */
#include "port.h"
#include "../../boot/handoff.h"
#include "flash_map.h"
#include "../../boot/bootctl.h"
#include "../../boot/image.h"
#include <string.h>

static app_t app;                                    /* ~6 KB, SRAM0 */
static app_tick_out_t out;
static volatile uint32_t tick_due;
static pmp_frame_t rxbuf[16];

/* ISR → tick aggregation (each field one writer) */
static volatile uint16_t pfc_us_max, llc_us_max;
static float lsum[6]; static uint32_t lsum_n;        /* vout · iout+ · iout− · ires · vbka · vbkb — written at 100 kHz */
/* E81 (F-E-16): the 100 kHz writer decimates and PUBLISHES into a double buffer; the 10 kHz reader never clears the
   accumulator, so the old read-divide-clear race against the higher-priority PFC ISR (a 10 % scale error on one channel,
   deterministic per build) cannot happen. It also moves six FPU divisions out of the 10 kHz ISR (F-D-7). */
static app_llc_adc_t lmean[2]; static volatile uint8_t lmean_i;
static volatile uint32_t tach_cnt[4];
static uint8_t hmi_phase;

#define HANDOFF (*(boot_handoff_t *)FM_HANDOFF)

/* ---------------- 100 kHz: sample set from the previous roll-over trigger, control law, duties for the next roll-over */
RAMFUNC void hrtimer_st3_isr(void) {
  uint32_t t0 = DWT_CYCCNT;
  HRT_STINTC(3) = BIT(3);                            /* CMP3IF */
  app_pfc_adc_t s;
  float ires, vout, ioutp, ioutn, t_inlet, vbka, vbkb, v24, vref;
  adc_read_pfc(&s, &ires, &vout, &ioutp, &ioutn, &t_inlet, &vbka, &vbkb, &v24, &vref);
  app_pfc_out_t po;
  app_pfc_isr(&app, &s, &po);
  hrtimer_pfc_apply(&po);
  lsum[0] += vout; lsum[1] += ioutp; lsum[2] += ioutn; lsum[3] += ires; lsum[4] += vbka; lsum[5] += vbkb;
  if (++lsum_n >= 10u) {                             /* E81: decimate in the writer, publish, then reset */
    uint8_t w = (uint8_t)(lmean_i ^ 1u);
    lmean[w].vout = lsum[0] * 0.1f; lmean[w].iout_p = lsum[1] * 0.1f; lmean[w].iout_n = lsum[2] * 0.1f;
    lmean[w].ires = lsum[3] * 0.1f; lmean[w].vbka = lsum[4] * 0.1f; lmean[w].vbkb = lsum[5] * 0.1f;
    lmean_i = w;
    for (int k = 0; k < 6; k++) lsum[k] = 0.0f;
    lsum_n = 0u;
  }
  (void)t_inlet; (void)v24; (void)vref;              /* consumed by the tick path through adc_read_pfc's ring */
  uint32_t us = (DWT_CYCCNT - t0) / (PORT_SYSCLK_HZ / 1000000u);
  if (us > pfc_us_max) pfc_us_max = (uint16_t)us;
}

/* ---------------- 10 kHz: the LLC regulator on the 100 kHz means */
RAMFUNC void hrtimer_mt_isr(void) {
  uint32_t t0 = DWT_CYCCNT;
  HRT_MTINTC = BIT(4);                               /* REPIF */
  app_llc_out_t lo;
  app_llc_isr(&app, &lmean[lmean_i], &lo);
  hrtimer_llc_apply(&lo);
  uint32_t us = (DWT_CYCCNT - t0) / (PORT_SYSCLK_HZ / 1000000u);
  if (us > llc_us_max) llc_us_max = (uint16_t)us;
}

/* ---------------- highest priority: a hardware latch fired — attribute it while the outputs are already dead */
RAMFUNC void hrtimer_flt_isr(void) {
  uint16_t ch = hrtimer_fault_read_clear();
  if (ch) app_fault_isr(&app, ch, adc_ires_now());   /* E81 (F-E-10): the freshest completed I_RES, not the 100 kHz cache */
}

/* E81 (F-D-9 / F-E-01a): the WDI/FWDGT cadence belongs to SysTick, not to tick(). A blocking flash erase inside tick()
   queued up to 20 catch-up ticks; the two kicks that landed on `now_ms % 10 == 0` then arrived ~1 ms apart, below the
   TPS3430's 2.22 ms lower bound, and the 9 + 20 ms gap before them broke the 23.375 ms upper bound. Kicking from the
   interrupt keeps exactly 10 ms of real time between edges, straight through an erase (which busy-waits with interrupts
   enabled). The sequenced-watchdog property is preserved: the tick still decides whether kicking is PERMITTED. */
static volatile uint8_t kick_arm;
void systick_isr(void) {
  static uint16_t kick_ms;
  tick_due++;
  if (++kick_ms >= 10u) { kick_ms = 0u; if (kick_arm) { wdi_pulse(); fwdgt_kick(); } }
}

/* tach edges (two pulses per revolution): EXTI 2 (PF2) · 14 (PD14) · 5 (PD5) · 3 (PB3) */
void exti2_isr(void)  { EXTI_PD = BIT(2);  tach_cnt[0]++; }
void exti14_isr(void) { EXTI_PD = BIT(14); tach_cnt[1]++; }
void exti5_isr(void)  { EXTI_PD = BIT(5);  tach_cnt[2]++; }
void exti3_isr(void)  { EXTI_PD = BIT(3);  tach_cnt[3]++; }

static void exti_init(void) {
  SYSCFG_EXTISS(0) = (SYSCFG_EXTISS(0) & ~(0xFu << 8)) | (5u << 8);     /* EXTI2 ← PF */
  SYSCFG_EXTISS(0) = (SYSCFG_EXTISS(0) & ~(0xFu << 12)) | (1u << 12);   /* EXTI3 ← PB */
  SYSCFG_EXTISS(1) = (SYSCFG_EXTISS(1) & ~(0xFu << 4)) | (3u << 4);     /* EXTI5 ← PD */
  SYSCFG_EXTISS(3) = (SYSCFG_EXTISS(3) & ~(0xFu << 24)) | (3u << 24);   /* EXTI14 ← PD */
  EXTI_RTEN |= BIT(2) | BIT(3) | BIT(5) | BIT(14);
  EXTI_INTEN |= BIT(2) | BIT(3) | BIT(5) | BIT(14);
  irq_prio(8u, 13u); irq_enable(8u);     /* EXTI2 */
  irq_prio(9u, 13u); irq_enable(9u);     /* EXTI3 */
  irq_prio(23u, 13u); irq_enable(23u);   /* EXTI5–9 */
  irq_prio(40u, 13u); irq_enable(40u);   /* EXTI10–15 */
}

/* ---------------- TIMER19 fans (25 kHz, CH1 + independent MCH0) · TIMER3 matrix-coil hold PWM (20 kHz) */
void pwm_out_init(void) {
  TIM_PSC(TIM19) = 0u; TIM_CAR(TIM19) = 8639u;                       /* 25 kHz at 216 MHz */
  TIM_CHCTL0(TIM19) = (6u << 12) | BIT(11);                          /* CH1 PWM0 + shadow */
  TIM_MCHCTL0(TIM19) = (6u << 4) | BIT(3);                           /* MCH0 PWM0 + shadow, MCH0MS = 00 output */
  TIM_CTL2(TIM19) = (TIM_CTL2(TIM19) & ~(3u << 20));                 /* MCH0 independent of CH0 */
  TIM_CHCTL2(TIM19) = BIT(4) | BIT(2);                               /* CH1EN · MCH0EN */
  TIM_CCHP0(TIM19) = BIT(15);                                        /* POEN */
  TIM_CH1CV(TIM19) = 0u; TIM_MCH0CV(TIM19) = 0u;
  TIM_CTL0(TIM19) = BIT(7) | BIT(0);                                 /* ARSE + CEN */
  TIM_PSC(TIM3) = 0u; TIM_CAR(TIM3) = 10799u;                        /* 20 kHz */
  TIM_CHCTL0(TIM3) = (6u << 4) | BIT(3);                             /* CH0 (KSER) PWM0 + shadow; E81: CH1 retired with KPARA */
  TIM_CHCTL2(TIM3) = BIT(0);
  TIM_CH0CV(TIM3) = 0u;
  TIM_CTL0(TIM3) = BIT(7) | BIT(0);
}
void pwm_fan(float d1, float d2) {
  TIM_CH1CV(TIM19) = (uint32_t)(d1 * 8640.0f);
  TIM_MCH0CV(TIM19) = (uint32_t)(d2 * 8640.0f);
}
void pwm_relay(const float duty[APP_RLY_COUNT]) {
  TIM_CH0CV(TIM3) = (uint32_t)(duty[APP_RLY_KSER] * 10800.0f);
  /* E81 (F-D-6): KPARA is DC, like KPARB. The UEXCL 74HC02 interlock is a LEVEL gate — a 20 kHz / 40 % chop made
     Y3 = KPARA ∨ KPARB low for 60 % of every 50 µs, so a faulted {KSER, KPARA, ¬KPARB} would have driven the KSER coil
     at 60 % of 24 V, far above must-operate, in exactly the fault the gate exists for. +0.42 W of the 110 W aux. */
  pin_set(BP_KPARA, duty[APP_RLY_KPARA] > 0.0f);
  pin_set(BP_KPRE, duty[APP_RLY_KPRE] > 0.0f);        /* no timer pin: full hold (board.h note) */
  pin_set(BP_KPARB, duty[APP_RLY_KPARB] > 0.0f);
}

static void hmi_drive(uint8_t seg, uint8_t dig) {     /* one 74HC595 byte, MSB first, then latch and digit select */
  for (int b = 7; b >= 0; b--) {
    pin_set(BP_HMI_DAT, (seg >> b) & 1);
    pin_set(BP_HMI_CLK, 1);
    pin_set(BP_HMI_CLK, 0);
  }
  pin_set(BP_HMI_LAT, 1);
  pin_set(BP_HMI_LAT, 0);
  pin_set(BP_HMI_DIG1, dig == 1u);
  pin_set(BP_HMI_DIG2, dig == 2u);
}

static uint32_t painted_stack_pct(void);

static nvm_t boot_store;                             /* the boot record's pages (2/3) — confirm path */
static bootctl_t boot_ctl;

static void tick(bool late) {
  static uint32_t tach_last[4];
  static uint16_t tach_hz_x10[4];
  static uint8_t stack_pct_cached;
  static uint32_t ms;
  ms++;
  app_tick_in_t ti;
  memset(&ti, 0, sizeof ti);
  ti.late = late;
  adc_read_slow(&ti.t_pfc, &ti.t_llc, &ti.t_xfmr, &ti.v15, &ti.avmid);
  app_pfc_adc_t ps; float ires, vout, ioutp, ioutn;
  float t_inlet, vbka, vbkb, v24, vref;
  adc_read_pfc(&ps, &ires, &vout, &ioutp, &ioutn, &t_inlet, &vbka, &vbkb, &v24, &vref);
  ti.t_inlet = t_inlet; ti.v24 = v24; ti.vrefint = vref;
  /* E81 (F-A-5, F-D-1 refuted): the HF167F auxiliary is 1 Form A (NO) and the two are in series, so the chain reads LOW
     only when BOTH bypass contacts are closed and HIGH when at least one is open. The polarity below is correct for that
     and stays; only this comment was wrong. The chain cannot see a single welded contact — that is the card's parallel-
     auxiliary ECO, not firmware. */
  ti.di = (uint16_t)((pin_get(BP_RLY_FB) ? 0u : APP_DI_RLY_PRE)      /* LOW = both bypass contacts closed */
                   | (pin_get(BP_DRV_RDY) ? APP_DI_DRV_RDY : 0u)
                   | (pin_get(BP_BTN1) ? 0u : APP_DI_BTN1) | (pin_get(BP_BTN2) ? 0u : APP_DI_BTN2));
  if (ms % 100u == 0u) {                                             /* tach: edges per 100 ms → Hz */
    for (int k = 0; k < 4; k++) {
      uint32_t c = tach_cnt[k];
      tach_hz_x10[k] = (uint16_t)((c - tach_last[k]) * 10u);
      tach_last[k] = c;
    }
  }
  for (int k = 0; k < 4; k++) ti.tach_hz[k] = (float)tach_hz_x10[k];
  ti.can_state = can_state();
  /* E81 (F-D-8 / F-E-14): the paint scan is ~43 µs of the 1 ms tick for one diagnostic byte that moves on a scale of
     minutes. firmware-architecture §3.2 already says 1 Hz. */
  if (ms % 1000u == 0u) stack_pct_cached = (uint8_t)painted_stack_pct();
  ti.stack_pct = stack_pct_cached;
  ti.pfc_exec_us = pfc_us_max; ti.llc_exec_us = llc_us_max;
  pfc_us_max = 0u; llc_us_max = 0u;
  ti.rx = rxbuf;
  ti.rx_n = can_rx(rxbuf, 16u);

  app_tick(&app, &ti, &out);

  uint16_t d = out.do_bits;
  pin_set(BP_QDIS, (d & APP_DO_QDIS) != 0);
  pin_set(BP_QDISBK, (d & APP_DO_QDISBK) != 0);
  pin_set(BP_EN_PFC, (d & APP_DO_EN_PFC) != 0);
  pin_set(BP_EN_LLC, (d & APP_DO_EN_LLC) != 0);
  pwm_relay(out.relay_duty);                                          /* carries KPRE/KSER/KPARA/KPARB incl. pull-in */
  pwm_fan(out.fan_duty[0], out.fan_duty[1]);
  cmpdac_thresholds(out.dac_v);
  if (out.fault_rearm) hrtimer_rearm(d, out.fault_rearm);
  kick_arm = out.wdt_kick ? 1u : 0u;                                  /* E81: SysTick owns the cadence */
  hmi_phase = out.hmi_dig;
  hmi_drive(out.hmi_seg, out.hmi_dig);
  /* E81 (F-E-18): drain until the mailboxes are busy, not one frame per tick. The profile can queue four events per tick
     plus telemetry, so a 32-deep queue filled in ~11 ticks and dropped exactly the frames that explain a fault storm.
     MTO (lowest-number-first, can.c CTL1 BIT(4)) keeps transmission in mailbox order, so order survives the batch. */
  for (int n = 0; n < 8 && app.txq.n && can_tx_ready(); n++) {
    pmp_frame_t f;
    if (!pmp_txq_pop(&app.txq, &f)) break;
    can_tx(&f);
  }
  if (out.can_restart) can_restart();
  static int confirmed;
  if (out.boot_ok && !confirmed && boot_ctl.pending != BOOT_SLOT_NONE) {
    /* the pending image proved itself: confirm and raise the baseline to this image's own minimum (header field) */
    uint32_t minv = *(const uint32_t *)(((SCB_VTOR >= FM_SLOT_B) ? FM_SLOT_B : FM_SLOT_A) + 0x14u);
    if (boot_confirm(&boot_ctl, boot_ctl.pending, minv))
      (void)nvm_put(&boot_store, BOOTCTL_KIND, (const uint8_t *)&boot_ctl, (uint8_t)sizeof boot_ctl, true);
    confirmed = 1;
  }
  if (out.enter_boot || out.reboot) {
    HANDOFF.reason = out.enter_boot ? HANDOFF_ENTER : HANDOFF_REBOOT;
    HANDOFF.streak = 0u;
    HANDOFF.addr = (app.prof->id == PMP_PROFILE_NATIVE) ? app.vmp.cfg.addr : 0xFEu;
    HANDOFF.bitrate = app.bitrate;
    handoff_seal(&HANDOFF);
    port_reboot();
  }
}

/* painted stacks: startup fills [stack limit, sp) with 0xA5; the high-water mark is where the paint ends */
extern uint32_t _sstack[], _estack[];
static uint32_t painted_stack_pct(void) {
  uint32_t total = (uint32_t)((uintptr_t)_estack - (uintptr_t)_sstack), free_words = 0u;   /* E81: called at 1 Hz */
  for (uint32_t *p = _sstack; p < (uint32_t *)((uintptr_t)_sstack + total) && *p == 0xA5A5A5A5u; p++) free_words++;
  uint32_t used = total - free_words * 4u;
  return used * 100u / total;
}

int main(void) {
  system_init();
  board_gpio_init();
  boot_handoff_t h = HANDOFF;
  int have_h = handoff_valid(&h);

  app_boot_t b;
  memset(&b, 0, sizeof b);
  b.rating_counts = (float)adc_read_once(2u, 3u);                     /* ROLE1 strap on ADC2_IN3, before the engine runs */
  /* E81 (F-E-03): report the RAW cause and let the HAL classify. The design's primary supervisor is the TPS3430, whose
     WDO is wire-ORed onto NRST and therefore arrives as EPRSTF (bit 26), not FWDGTRSTF — the old `== BIT(29)` test meant
     F.32 never fired for the dominant hang path. RSTSCK's flags live at 25..31, so the byte carries all of them. */
  b.reset_cause = (uint8_t)((port_reset_cause >> 24) & 0xFFu);
  b.handoff_reboot = have_h && h.reason == HANDOFF_REBOOT;
  b.hw_rev = PORT_HW_REV;                                             /* E81 (F-D-15): board.h — no strap on the card yet */
  b.uid = RD(UID_BASE);
  b.nvm_page_size = nvm_port_page_size();
  b.evlog_pages = (uint8_t)(FM_EVLOG_SIZE / nvm_port_page_size());
  const uint8_t *hdr = (const uint8_t *)((SCB_VTOR >= FM_SLOT_B) ? FM_SLOT_B : FM_SLOT_A);
  uint32_t body = *(const uint32_t *)(hdr + 0x08);
  b.fw = *(const uint32_t *)(hdr + 0x10);                             /* image header fields (boot/image.h) */
  b.fw_crc = (body >= 0x40u && body <= FM_SLOT_SIZE - IMG_HDR_LEN) ? pmp_crc32(hdr, IMG_HDR_LEN + body) : 0u;
  b.boot_ver = 0x01000000u;                                           /* the shipped bootloader build (VMP object 0x0008) */
  nvm_mount(&boot_store, 2u, nvm_port_page_size());
  if (!nvm_get(&boot_store, BOOTCTL_KIND, (uint8_t *)&boot_ctl, (uint8_t)sizeof boot_ctl)) bootctl_default(&boot_ctl);
  b.boot_state = boot_ctl.state;

  app_init(&app, &b);

  cmpdac_init();
  adc_init();
  hrtimer_init();
  pwm_out_init();
  exti_init();
  can_init(app.bitrate, 0);
  fwdgt_start();

  irq_prio(76u, 0u); irq_enable(76u);          /* HRTIMER faults */
  irq_prio(71u, 1u); irq_enable(71u);          /* ST3 CMP3 — 100 kHz control */
  irq_prio(67u, 2u); irq_enable(67u);          /* master — 10 kHz control */
  SYST_RVR = PORT_SYSCLK_HZ / 1000u - 1u;
  SYST_CVR = 0u;
  SCB_SHPR3 = (SCB_SHPR3 & 0x00FFFFFFu) | (0xE0u << 24);   /* SysTick lowest-ish */
  SYST_CSR = 7u;

  for (;;) {
    __asm volatile ("wfi");
    /* E81 (F-E-01a): a backlog is collapsed into ONE tick, flagged late. Replaying it as fast ticks made supervise() see
       "three LLC periods missing inside one tick" and latch F.35 on every NVM compaction. */
    uint32_t n = tick_due;
    if (n) { tick_due -= n; tick(n > 1u); }
  }
}
