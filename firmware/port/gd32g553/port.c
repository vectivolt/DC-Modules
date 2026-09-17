/* port.c — the application image's main loop and interrupt glue: the one file where firmware/hal/app.h meets the metal.
 * Contexts (firmware-architecture §2/§3): HRTIMER fault IRQ76 (prio 0) → app_fault_isr · DMA0 channel 2 IRQ13 at 100 kHz
 * (prio 1) → app_pfc_isr · master REP IRQ67 at 10 kHz (prio 2) → app_llc_isr · SysTick 1 kHz (prio 14) → app_tick.
 * The 100 kHz and 10 kHz paths live in TCM (.ramfunc), and so does the vector table, so flash appends never stall
 * them OR the exception entry that reaches them (§3.5). */
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
/* The 100 kHz writer decimates and PUBLISHES into a double buffer; the 10 kHz reader never clears the accumulator, so
   a read-divide-clear race against the higher-priority PFC ISR (a 10 % scale error on one channel, deterministic per
   build) cannot happen. It also keeps six FPU divisions out of the 10 kHz ISR. */
static app_llc_adc_t lmean[2]; static volatile uint8_t lmean_i;
static volatile uint32_t tach_cnt[4];
static uint8_t hmi_phase;
/* The internal reference, read once at boot with a legal 28.5 µs aperture (adc.c). It is not in the 100 kHz sequence,
   so the tick reports this constant — the same units (counts) the hal expects. */
static uint16_t vrefint_counts;

#define HANDOFF (*(boot_handoff_t *)FM_HANDOFF)

/* ---------------- 100 kHz: sample set from the previous roll-over trigger, control law, duties for the next roll-over.
   Raised by the END of the longest ADC sequence (DMA0 channel 2 half/full transfer, adc.c CTL_DMACH), not by an ST3
   compare — ≈ 7.2 µs before the roll-over that loads the compare shadows instead of 5.0, against a 4.6–6.1 µs ISR.
   Clearing GIF2 clears that channel's FTF/HTF/ERR together (UM §8.5.2: channel x owns bits 4x..4x+3). */
RAMFUNC void pfc_ctl_isr(void) {
  uint32_t t0 = DWT_CYCCNT;
  DMA_INTC = 0xFu << (4u * 2u);
  app_pfc_adc_t s;
  float ires, vout, ioutp, ioutn, t_inlet, vbka, vbkb, v24;
  adc_read_pfc(&s, &ires, &vout, &ioutp, &ioutn, &t_inlet, &vbka, &vbkb, &v24);
  app_pfc_out_t po;
  app_pfc_isr(&app, &s, &po);
  hrtimer_pfc_apply(&po);
  lsum[0] += vout; lsum[1] += ioutp; lsum[2] += ioutn; lsum[3] += ires; lsum[4] += vbka; lsum[5] += vbkb;
  if (++lsum_n >= 10u) {                             /* decimate in the writer, publish, then reset */
    uint8_t w = (uint8_t)(lmean_i ^ 1u);
    lmean[w].vout = lsum[0] * 0.1f; lmean[w].iout_p = lsum[1] * 0.1f; lmean[w].iout_n = lsum[2] * 0.1f;
    lmean[w].ires = lsum[3] * 0.1f; lmean[w].vbka = lsum[4] * 0.1f; lmean[w].vbkb = lsum[5] * 0.1f;
    lmean_i = w;
    for (int k = 0; k < 6; k++) lsum[k] = 0.0f;
    lsum_n = 0u;
  }
  (void)t_inlet; (void)v24;                          /* consumed by the tick path through adc_read_pfc's ring */
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
  if (ch) app_fault_isr(&app, ch, adc_ires_now());   /* the freshest completed I_RES, not the 100 kHz cache */
}

/* The WDI/FWDGT cadence belongs to SysTick, not to tick(). A blocking flash erase inside tick() queues up to 20
   catch-up ticks; kicks that land on `now_ms % 10 == 0` then arrive ~1 ms apart, below the TPS3430's 2.22 ms lower
   bound, and the 9 + 20 ms gap before them breaks the 23.375 ms upper bound. Kicking from the interrupt keeps exactly
   10 ms of real time between edges, straight through an erase (which busy-waits with interrupts enabled). The
   sequenced-watchdog property is preserved: the tick still decides whether kicking is PERMITTED.
   Permission is a TOKEN COUNT the main loop must keep paying for, not a level. A sticky flag would let a hung main
   loop (a flash busy-wait that never ends, a corrupted app_t, any while() bug) leave permission granted for ever:
   SysTick would keep servicing the TPS3430 AND the FWDGT while the 100 kHz / 10 kHz control interrupts went on
   delivering power on frozen references with every supervisory protection row dead. Each kick consumes a token;
   tick() tops the purse up to PORT_KICK_TOKENS (30 ms of grace — one collapsed backlog), a flash erase buys its own
   bounded allowance through port_kick_grant(), and a dead loop is reset ≤ 30 ms + one TPS3430 window later. */
#define PORT_KICK_TOKENS 3u
static volatile uint8_t kick_tokens;
static volatile uint16_t kick_ms;
static volatile uint32_t wdi_t;                      /* DWT_CYCCNT at the last WDI edge */
void port_kick_grant(uint8_t n) { if (n > kick_tokens) kick_tokens = n; }
void systick_isr(void) {
  tick_due++;
  if (++kick_ms >= 10u) { kick_ms = 0u; if (kick_tokens) { kick_tokens--; wdi_t = DWT_CYCCNT; wdi_pulse(); fwdgt_kick(); } }
}
/* nvmport.c calls this immediately before every flash operation and after every page erase. It buys the loop
   50 ms of SysTick services (= nvmport.c's own bound on a wait, so a dead FMC still ends in a reset) and puts a fresh WDI
   edge AT the operation: with the application in slot B an erase of the journal pages stalls every flash fetch in bank 1 —
   SysTick included — for up to 20 ms (DS Table 4-25), and 10 ms of cadence + 20 ms of stall breaks the 23.375 ms window.
   An edge ≤ 2.5 ms old is fresh enough (2.5 + 20 < 23.375) and keeps edges ≥ 2.5 ms apart (TPS3430 lower bound 2.22 ms);
   kick_ms restarts so SysTick's next edge is a full 10 ms away. Interrupts are masked across the compare-and-pulse (≈ 1 µs)
   so SysTick cannot land a second edge inside it. */
void flash_service(void) {
  port_kick_grant(5u);
  __asm volatile ("cpsid i");
  uint32_t now = DWT_CYCCNT;
  if (now - wdi_t >= PORT_SYSCLK_HZ / 400u) { wdi_t = now; kick_ms = 0u; wdi_pulse(); fwdgt_kick(); }
  __asm volatile ("cpsie i");
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
  TIM_CHCTL0(TIM3) = (6u << 4) | BIT(3);                             /* CH0 (KSER) PWM0 + shadow; KPARA has no channel */
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
  /* KPARA is DC, like KPARB. The UEXCL 74HC02 interlock is a LEVEL gate — a 20 kHz / 40 % chop would hold
     Y3 = KPARA ∨ KPARB low for 60 % of every 50 µs, so a faulted {KSER, KPARA, ¬KPARB} would drive the KSER coil at
     60 % of 24 V, far above must-operate, in exactly the fault the gate exists for. The DC coil costs +0.42 W of the
     110 W aux. */
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

/* `n` is how many SysTicks this call stands for, not a flag: advancing `ms` by one per collapsed backlog would stretch
   every interval measured here by the time the loop had lost (the 100 ms tach window would count ticks, not time, and
   report the fans slow). app_tick's own now_ms advances by one per call on purpose: a backlog only collapses across a
   flash stall, which happens with both stages off, so the supervisory timers lose nothing that matters. */
static void tick(uint32_t n) {
  static uint32_t tach_last[4], tach_ms;
  static uint16_t tach_hz_x10[4];
  static uint8_t stack_pct_cached;
  static uint32_t ms;
  uint32_t ms0 = ms;
  ms += n;
  app_tick_in_t ti;
  memset(&ti, 0, sizeof ti);
  ti.late = n > 1u;
  adc_read_slow(&ti.t_pfc, &ti.t_llc, &ti.t_xfmr, &ti.v15, &ti.avmid);
  app_pfc_adc_t ps; float ires, vout, ioutp, ioutn;
  float t_inlet, vbka, vbkb, v24;
  adc_read_pfc(&ps, &ires, &vout, &ioutp, &ioutn, &t_inlet, &vbka, &vbkb, &v24);
  ti.t_inlet = t_inlet; ti.v24 = v24; ti.vrefint = (float)vrefint_counts;
  /* The HF167F auxiliary is 1 Form A (NO) and the two are in series, so the chain reads LOW only when BOTH bypass
     contacts are closed and HIGH when at least one is open — which is what the polarity below encodes. The chain
     cannot see a single welded contact; that needs the card's parallel-auxiliary wiring, not firmware. */
  ti.di = (uint16_t)((pin_get(BP_RLY_FB) ? 0u : APP_DI_RLY_PRE)      /* LOW = both bypass contacts closed */
                   | (pin_get(BP_DRV_RDY) ? APP_DI_DRV_RDY : 0u)
                   | (pin_get(BP_BTN1) ? 0u : APP_DI_BTN1) | (pin_get(BP_BTN2) ? 0u : APP_DI_BTN2));
  /* a CROSSING, not `ms % 100 == 0` — with a collapsed backlog `ms` steps straight over the boundary and the whole
     window is skipped. The edges are divided by the REAL elapsed milliseconds, so a window that ran long still reports
     the right Hz instead of a scaled-up one. */
  if (ms / 100u != ms0 / 100u) {                                     /* tach: edges per window → Hz */
    uint32_t el = ms - tach_ms;
    for (int k = 0; k < 4; k++) {
      uint32_t c = tach_cnt[k];
      tach_hz_x10[k] = (uint16_t)(el ? (c - tach_last[k]) * 10000u / el : 0u);
      tach_last[k] = c;
    }
    tach_ms = ms;
  }
  for (int k = 0; k < 4; k++) ti.tach_hz[k] = (float)tach_hz_x10[k];
  ti.can_state = can_state(); ti.can_rx_ovr = can_rx_congested;
  /* the paint scan is ~43 µs of the 1 ms tick for one diagnostic byte that moves on a scale of minutes, so it runs
     at 1 Hz (firmware-architecture §3.2). */
  if (ms / 1000u != ms0 / 1000u) stack_pct_cached = (uint8_t)painted_stack_pct();
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
  if (out.wdt_kick) port_kick_grant(PORT_KICK_TOKENS); else kick_tokens = 0u;   /* SysTick owns the cadence, the tick owns the permission */
  hmi_phase = out.hmi_dig;
  hmi_drive(out.hmi_seg, out.hmi_dig);
  /* Drain until the mailboxes are busy, not one frame per tick. The profile can queue four events per tick plus
     telemetry, so at one frame per tick a 32-deep queue fills in ~11 ticks and drops exactly the frames that explain a fault storm.
     MTO (lowest-number-first, can.c CTL1 BIT(4)) keeps transmission in mailbox order, so order survives the batch. */
  for (int n = 0; n < 8 && app.txq.n && can_tx_ready(); n++) {
    pmp_frame_t f;
    if (!pmp_txq_pop(&app.txq, &f)) break;
    can_tx(&f);
  }
  if (out.can_restart) can_restart();
  static int confirmed;
  /* Confirm the slot that is RUNNING, not whatever the record calls pending. They diverge on the path updater.c
     handles — a store failure leaves flash saying "pending" while the confirmed slot runs — and trusting the record
     there promotes an image that has never executed, with the running image's minimum as its baseline. */
  uint8_t run_slot = (port_slot_vtor >= FM_SLOT_B) ? 1u : 0u;
  if (out.boot_ok && !confirmed && boot_ctl.pending == run_slot) {
    /* the pending image proved itself: confirm and raise the baseline to this image's own minimum (header field) */
    uint32_t minv = *(const uint32_t *)((run_slot ? FM_SLOT_B : FM_SLOT_A) + 0x14u);
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
  uint32_t total = (uint32_t)((uintptr_t)_estack - (uintptr_t)_sstack), free_words = 0u;   /* called at 1 Hz */
  for (uint32_t *p = _sstack; p < (uint32_t *)((uintptr_t)_sstack + total) && *p == 0xA5A5A5A5u; p++) free_words++;
  uint32_t used = total - free_words * 4u;
  return used * 100u / total;
}

/* The window watchdog across start-up. The bootloader's last service is ≤ 5 ms old at the jump; waiting for SysTick to
   service it after APP_WDT_KICK_MS good ticks + the next 10 ms boundary puts the first edge ≈ 20 ms AFTER the
   interrupts start, behind clock, ADC calibration, the NVM mount and its software CRC — 32–53 ms in all against
   23.375 ms, i.e. a reset at every application start. boot_kick() services it between the long start-up steps, never
   closer than 3 ms to the previous edge (the 2.22 ms early boundary), and main() hands SysTick a first purse so the
   cadence continues until the tick has proved both control interrupts alive and takes the permission over. */
static void boot_kick(void) {                   /* shares wdi_t with SysTick and flash_service(): one clock for every edge */
  uint32_t now = DWT_CYCCNT;
  if (now - wdi_t >= 3u * (PORT_SYSCLK_HZ / 1000u)) { wdi_pulse(); wdi_t = now; }
}

int main(void) {
  system_init();
  board_gpio_init();
  wdi_t = DWT_CYCCNT;                           /* system_init zeroes the counter: ≥ 3 ms from here to the first edge */
  boot_handoff_t h = HANDOFF;
  int have_h = handoff_valid(&h);

  app_boot_t b;
  memset(&b, 0, sizeof b);
  b.rating_counts = (float)adc_read_once(2u, 3u);                     /* ROLE1 strap on ADC2_IN3, before the engine runs */
  vrefint_counts = adc_vrefint_read();                                /* ADC3_IN20 at 28.5 µs, before adc_init */
  /* Report the RAW cause and let the HAL classify. The design's primary supervisor is the TPS3430, whose WDO is
     wire-ORed onto NRST and therefore arrives as EPRSTF (bit 26), not FWDGTRSTF — testing for FWDGTRSTF alone would
     leave F.32 silent on the dominant hang path. RSTSCK's flags live at 25..31, so the byte carries all of them. */
  b.reset_cause = (uint8_t)((port_reset_cause >> 24) & 0xFFu);
  b.handoff_reboot = have_h && h.reason == HANDOFF_REBOOT;
  b.hw_rev = PORT_HW_REV;                                             /* board.h — no strap on the card */
  b.uid = pmp_crc32((const uint8_t *)UID_BASE, 12u);                  /* all 96 bits — the first word alone is the wafer lot, shared by a whole reel; same identity as the bootloader's */
  b.vrefint_v = (VREFINT_CAL > 1000u && VREFINT_CAL < 2000u) ? (float)VREFINT_CAL * 3.3f / 4096.0f : 0.0f;   /* factory counts at 3.3 V */
  b.nvm_page_size = nvm_port_page_size();
  b.evlog_pages = (uint8_t)(FM_EVLOG_SIZE / nvm_port_page_size());
  /* SCB_VTOR points into TCM — startup.c keeps the slot the bootloader entered in port_slot_vtor */
  const uint8_t *hdr = (const uint8_t *)((port_slot_vtor >= FM_SLOT_B) ? FM_SLOT_B : FM_SLOT_A);
  uint32_t body = *(const uint32_t *)(hdr + 0x08);
  b.fw = *(const uint32_t *)(hdr + 0x10);                             /* image header fields (boot/image.h) */
  b.fw_crc = (body >= 0x40u && body <= FM_SLOT_SIZE - IMG_HDR_LEN) ? pmp_crc32(hdr, IMG_HDR_LEN + body) : 0u;
  b.boot_ver = 0x01000000u;                                           /* the shipped bootloader build (VMP object 0x0008) */
  nvm_mount(&boot_store, 2u, nvm_port_page_size());
  if (!nvm_get(&boot_store, BOOTCTL_KIND, (uint8_t *)&boot_ctl, (uint8_t)sizeof boot_ctl)) bootctl_default(&boot_ctl);
  b.boot_state = boot_ctl.state;

  boot_kick();
  app_init(&app, &b);
  boot_kick();

  cmpdac_init();
  adc_init();
  boot_kick();
  hrtimer_init();
  pwm_out_init();
  exti_init();
  can_init(app.bitrate, 0);
  fwdgt_start();
  boot_kick();
  port_kick_grant(PORT_KICK_TOKENS + 2u);      /* 50 ms of SysTick services while the tick earns its own permission */

  irq_prio(76u, 0u); irq_enable(76u);          /* HRTIMER faults */
  irq_prio(13u, 1u); irq_enable(13u);          /* DMA0 channel2 — ADC2 end of sequence, 100 kHz control */
  irq_prio(67u, 2u); irq_enable(67u);          /* master — 10 kHz control */
  SYST_RVR = PORT_SYSCLK_HZ / 1000u - 1u;
  SYST_CVR = 0u;
  SCB_SHPR3 = (SCB_SHPR3 & 0x00FFFFFFu) | (0xE0u << 24);   /* SysTick lowest-ish */
  SYST_CSR = 7u;

  for (;;) {
    __asm volatile ("wfi");
    /* A backlog is collapsed into ONE tick, flagged late. Replayed as fast ticks it makes supervise() see "three LLC
       periods missing inside one tick" and latch F.35 on every NVM compaction. */
    __asm volatile ("cpsid i");                 /* tick_due -= n would be a non-atomic RMW against SysTick (a lost ms) */
    uint32_t n = tick_due; tick_due = 0u;
    __asm volatile ("cpsie i");
    if (n) tick(n);
  }
}
