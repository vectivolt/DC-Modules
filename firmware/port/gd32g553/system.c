/* system.c — clocks, flash timing, watchdogs, DWT, GPIO table. Register facts: facts-system.md (UM lines cited there).
 * 216 MHz recipe (UM §4 procedures 1.1/1.2): PMU clock on → LDOVS = 1.15 V while the PLL is closed → FMC WSCNT = 7 →
 * PLL (src /PSC = 4 MHz, ×108 = 432 MHz VCO, /2 = 216 MHz; Q /9 = 48 MHz for CAN) → prescalers /1 → SCS = PLLP.
 * With PORT_HXTAL_HZ set the PLL runs from the crystal with the clock monitor armed; a stuck crystal falls back to IRC8M
 * (hardware forces it) and the port re-locks the PLL from IRC8M — the module keeps regulating; CAN accuracy is then
 * HW-REC-4's problem, reported through the app's CAN warning.
 * That whole recipe is SKIPPED when the clock tree already matches it — the bootloader runs this same function, so
 * the application would otherwise tear a working 216 MHz down and rebuild it. The crystal wait is bounded in real
 * time by DWT, and the LVD is armed at the end. */
#include "port.h"

uint32_t port_reset_cause;   /* RCU_RSTSCK at boot, cleared after capture */

/* PLLPSC divides the source to 4 MHz; PLLN 108 → VCO 432 MHz; P /2 → 216 MHz; Q /9 → 48 MHz (CAN); R /6 → 72 MHz (ADC) */
static uint32_t pll_word(uint32_t src_hxtal) {
  uint32_t psc = src_hxtal ? (PORT_HXTAL_HZ / 4000000u - 1u) : 1u;
  return (6u << 27) | (9u << 23) | (src_hxtal ? BIT(22) : 0u) | BIT(21) | BIT(20) | BIT(19) | (0u << 16) |
         (108u << 6) | psc;
}

static void pll_config(uint32_t src_hxtal) {
  RCU_PLLR = pll_word(src_hxtal);
  RCU_CTL |= BIT(24);                          /* PLLEN */
  while (!(RCU_CTL & BIT(25))) {}              /* PLLSTB (lock ≤ 400 µs) */
}

static uint32_t sys_on_pllp(void) { return (RCU_CFG0 & (3u << 2)) == (3u << 2); }

void system_init(void) {
  SCB_CPACR |= (3u << 20) | (3u << 22);        /* FPU CP10/CP11 full access */
  port_reset_cause = RCU_RSTSCK;
  RCU_RSTSCK |= BIT(24);                       /* RSTFC: clear the cause flags for the next reset */
  /* The cycle counter comes up FIRST — the crystal wait below needs a real time base, and a loop-iteration
     count is not one (it moves with the prefetch buffer, the caches and the compiler). DWT_CYCCNT counts core clocks,
     so the bound is exact whichever source is running. */
  SCB_DEMCR |= BIT(24);
  DWT_CTRL |= 1u;

  RCU_APB1EN |= BIT(28);                       /* PMU */

  /* The BOOTLOADER runs this same function and jumps with the PLL already closed on 216 MHz. Re-locking it
     means opening SCS, stopping and restarting the PLL and re-selecting it — a clock glitch delivered to every
     peripheral, including an HRTIMER that on a warm reboot path may still be driving gates, and ~400 µs of the window
     watchdog's budget for nothing. If the PLL is already running from the source and dividers this build wants, the
     clock tree is left strictly alone and only the peripheral selects, enables and debug holds below are applied. */
  uint32_t want = pll_word(PORT_HXTAL_HZ && (RCU_CTL & BIT(17)) ? 1u : 0u);
  /* SCSS (3:2) is read-only status, so the settled register reads SCS = 3 with every prescaler field at /1 */
  if (!(sys_on_pllp() && (RCU_CTL & BIT(25)) && RCU_PLLR == want && (RCU_CFG0 & ~(3u << 2)) == 3u)) {
    PMU_CTL0 = (PMU_CTL0 & ~(0x1Fu << 11)) | (0x0Eu << 11);   /* LDOVS = 1.15 V (216 MHz needs it), PLL still closed */
    /* PFEN with the wait states. The reset value 0x00040600 already has DCEN and ICEN set but NOT the prefetch
       buffer (UM §2.4.1), and the 1 ms tick runs from flash at 7 wait states — this is free throughput. */
    FMC_WS = (FMC_WS & ~0xFu) | BIT(8) | 7u;   /* PFEN + 7 wait states before raising the clock (Table 2-3) */
#if PORT_HXTAL_HZ
    RCU_CTL |= BIT(16);                        /* HXTALEN */
    /* Bounded to 10 ms of REAL time. A crystal starts in 1–5 ms, and a loop-iteration bound is not a time bound: its
       true cost moves with the prefetch buffer, so it can easily run past the TPS3430's 23.375 ms window and reset the
       card before its first WDI edge. */
    uint32_t hz = sys_on_pllp() ? PORT_SYSCLK_HZ : 8000000u;   /* IRC8M out of reset, else whatever is already selected */
    uint32_t t0 = DWT_CYCCNT;
    while (!(RCU_CTL & BIT(17)) && DWT_CYCCNT - t0 < hz / 100u) {}
    if (RCU_CTL & BIT(17)) {
      RCU_CTL |= BIT(19);                      /* CKMEN — a stuck crystal forces IRC8M and raises the NMI (CKMIF) */
      pll_config(1u);
    } else pll_config(0u);                     /* the crystal never started: run from IRC8M (HW-REC-4 reported by CAN warn) */
#else
    pll_config(0u);
#endif
    RCU_CFG0 = 0u;                             /* AHB/APB1/APB2/APB3 = /1 (216 MHz each, timer clock = CK_APB) */
    RCU_CFG0 = (RCU_CFG0 & ~3u) | 3u;          /* SCS = CK_PLLP */
    while (!sys_on_pllp()) {}
  }

  RCU_CFG2 |= BIT(19) | (1u << 26) | (1u << 28);   /* HRTIMER ← CK_SYS · ADC0/1/2 and ADC3 ← CK_PLLR (72 MHz) */
  RCU_CFG1 = (RCU_CFG1 & ~(3u << 10)) | (2u << 10);   /* CAN1 ← CK_PLLQ 48 MHz */

  RCU_AHB1EN |= BIT(21) | BIT(23);             /* DMA0 · DMAMUX */
  RCU_AHB2EN |= 0x3Fu << 17;                   /* GPIOA..GPIOF */
  RCU_APB2EN |= BIT(31) | BIT(29) | BIT(15) | BIT(14) | BIT(9) | BIT(3) | BIT(2);   /* TRIGSEL HRTIMER TIMER19 SYSCFG CAN1 CMP VREF */
  RCU_APB1EN |= BIT(2);                        /* TIMER3 */
  RCU_APB3EN |= (0xFu << 8) | (0xFu << 17) | BIT(16);   /* ADC0..3 · DAC0..3 · DAC hold clock */

  DWT_CYCCNT = 0u;                             /* re-base for the T-44 budget and µs delays (enabled at entry) */
  DBG_CTL1 |= BIT(12);                         /* halted core: hold FWDGT */
  DBG_CTL2 |= BIT(26) | BIT(20);               /* halted core: hold HRTIMER and TIMER19 (gates freeze safe) */

  /* Brown-out supervision. Without it the MCU runs to its 1.63 V power-down reset (ds Table 4-16) while V3P3
     collapses, because the TPS3430 is a WATCHDOG, not a supply supervisor. The part offers two mechanisms —
     VBOR, which resets but lives in the option bytes (BOR_TH = 0b10, 2.5 V falling: set by the production programming flow,
     docs/dfm-production.md — option bytes are not part of the signed image), and the LVD, which firmware owns.
     LVDT = 100 → 2.75 V (ds Table 4-16 VLVD: 2.75 V rising / 2.65 V falling) sits ~15 % below the ±2.5 % buck's 3.22 V
     floor, so it cannot nuisance-trip, and far above the 1.71 V the part needs to execute. The LVD output drives EXTI
     line 16 (UM §3.4.2); a RISING edge there is the supply crossing DOWN through the threshold. lvd_isr is
     default_handler: outputs to idle-inactive, both enables low, then no WDI so the TPS3430 resets the card. */
  PMU_CTL0 = (PMU_CTL0 & ~(7u << 5)) | (4u << 5) | BIT(4);   /* LVDT = 2.75 V · LVDEN */
  EXTI_RTEN |= BIT(16);
  EXTI_INTEN |= BIT(16);
  irq_prio(1u, 0u); irq_enable(1u);            /* LVD / VAVD / VOVD / VUVD through EXTI (UM Table 5-2 IRQ 1) */
}

void delay_us(uint32_t us) {
  uint32_t t0 = DWT_CYCCNT, n = us * (PORT_SYSCLK_HZ / 1000000u);
  while (DWT_CYCCNT - t0 < n) {}
}

/* internal watchdog (defence in depth behind the TPS3430 WDO≡NRST chain): ~100 ms at the slowest IRC32K corner */
void fwdgt_start(void) {
  FWDGT_CTL = 0x5555u;
  FWDGT_PSC = 2u;                              /* /16 → 0.5 ms/count at 32 kHz (0.44 ms at 36 kHz) */
  FWDGT_RLD = 220u;                            /* ≥ 97 ms even at the fast IRC32K corner */
  while (FWDGT_STAT & 7u) {}
  FWDGT_CTL = 0xCCCCu;
  FWDGT_CTL = 0xAAAAu;
}
void fwdgt_kick(void) { FWDGT_CTL = 0xAAAAu; }

/* WDI: the TPS3430 fixed window takes a FALLING edge per service */
void wdi_pulse(void) {
  pin_set(BP_WDI, 1);
  delay_us(2u);
  pin_set(BP_WDI, 0);
}

static void pin_cfg(uint8_t port, uint8_t pin, uint8_t mode, uint8_t af) {
  uint32_t two = (uint32_t)pin * 2u;
  uint32_t m = (mode == PM_AN) ? 3u : (mode == PM_OUT) ? 1u : (mode >= PM_AF) ? 2u : 0u;
  GPIO_CTL(port) = (GPIO_CTL(port) & ~(3u << two)) | (m << two);
  if (mode == PM_AF_OD) GPIO_OMODE(port) |= BIT(pin);
  if (mode == PM_IN_PU) GPIO_PUD(port) = (GPIO_PUD(port) & ~(3u << two)) | (1u << two);
  GPIO_OSPD(port) = (GPIO_OSPD(port) & ~(3u << two)) | (1u << two);   /* 60 MHz class on every driven pin */
  if (mode >= PM_AF) {
    volatile uint32_t *sel = (pin < 8u) ? &GPIO_AFSEL0(port) : &GPIO_AFSEL1(port);
    uint32_t four = ((uint32_t)pin & 7u) * 4u;
    *sel = (*sel & ~(0xFu << four)) | ((uint32_t)af << four);
  }
}

void board_gpio_init(void) {
  static const board_pin_t T[] = {
    /* analog stays in its reset (analog) mode — listed for the audit gate only */
    { BP_L1H, PM_AF, 13 }, { BP_L1L, PM_AF, 13 }, { BP_L2H, PM_AF, 13 }, { BP_L2L, PM_AF, 13 },
    { BP_PWM_A0, PM_AF, 13 }, { BP_PWM_B0, PM_AF, 3 }, { BP_PWM_C0, PM_AF, 13 }, { BP_FLT, PM_AF, 13 },
    { BP_FAN1, PM_AF, 6 }, { BP_FAN2, PM_AF, 6 }, { BP_KSER, PM_AF, 2 },
    { BP_CAN_RX, PM_AF, 9 }, { BP_CAN_TX, PM_AF, 9 },
    /* KPARA is plain GPIO, not TIMER3_CH1 — the UEXCL NOR needs a steady level, not a 20 kHz chop */
    { BP_KPARA, PM_OUT, 0 },
    { BP_KPARB, PM_OUT, 0 }, { BP_KPRE, PM_OUT, 0 }, { BP_QDIS, PM_OUT, 0 }, { BP_QDISBK, PM_OUT, 0 },
    { BP_EN_PFC, PM_OUT, 0 }, { BP_EN_LLC, PM_OUT, 0 }, { BP_WDI, PM_OUT, 0 },
    { BP_HMI_DAT, PM_OUT, 0 }, { BP_HMI_CLK, PM_OUT, 0 }, { BP_HMI_LAT, PM_OUT, 0 },
    { BP_HMI_DIG1, PM_OUT, 0 }, { BP_HMI_DIG2, PM_OUT, 0 },
    { BP_DRV_RDY, PM_IN, 0 }, { BP_RLY_FB, PM_IN, 0 },
    { BP_TACH1, PM_IN_PU, 0 }, { BP_TACH2, PM_IN_PU, 0 }, { BP_TACH3, PM_IN_PU, 0 }, { BP_TACH4, PM_IN_PU, 0 },
    { BP_BTN1, PM_IN_PU, 0 }, { BP_BTN2, PM_IN_PU, 0 },
  };
  for (unsigned k = 0u; k < sizeof T / sizeof T[0]; k++) pin_cfg(T[k].port, T[k].pin, T[k].mode, T[k].af);
  /* enables, relays and WDI must sit LOW before the pins leave input mode: OCTL resets 0 — nothing to do, listed as intent */
}

void port_reboot(void) {
  __asm volatile ("dsb");
  SCB_AIRCR = 0x05FA0004u;
  for (;;) {}
}
