/* system.c — E80 clocks, flash timing, watchdogs, DWT, GPIO table. Register facts: facts-system.md (UM lines cited there).
 * 216 MHz recipe (UM §4 procedures 1.1/1.2): PMU clock on → LDOVS = 1.15 V while the PLL is closed → FMC WSCNT = 7 →
 * PLL (src /PSC = 4 MHz, ×108 = 432 MHz VCO, /2 = 216 MHz; Q /9 = 48 MHz for CAN) → prescalers /1 → SCS = PLLP.
 * With PORT_HXTAL_HZ set the PLL runs from the crystal with the clock monitor armed; a stuck crystal falls back to IRC8M
 * (hardware forces it) and the port re-locks the PLL from IRC8M — the module keeps regulating; CAN accuracy is then
 * HW-REC-4's problem, reported through the app's CAN warning. */
#include "port.h"

uint32_t port_reset_cause;   /* RCU_RSTSCK at boot, cleared after capture */

static void pll_config(uint32_t src_hxtal) {
  /* PLLPSC divides the source to 4 MHz; PLLN 108 → VCO 432 MHz; P /2 → 216 MHz; Q /9 → 48 MHz (CAN); R /6 → 72 MHz (ADC) */
  uint32_t psc = src_hxtal ? (PORT_HXTAL_HZ / 4000000u - 1u) : 1u;
  RCU_PLLR = (6u << 27) | (9u << 23) | (src_hxtal ? BIT(22) : 0u) | BIT(21) | BIT(20) | BIT(19) | (0u << 16) |
             (108u << 6) | psc;
  RCU_CTL |= BIT(24);                          /* PLLEN */
  while (!(RCU_CTL & BIT(25))) {}              /* PLLSTB (lock ≤ 400 µs) */
}

void system_init(void) {
  SCB_CPACR |= (3u << 20) | (3u << 22);        /* FPU CP10/CP11 full access */
  port_reset_cause = RCU_RSTSCK;
  RCU_RSTSCK |= BIT(24);                       /* RSTFC: clear the cause flags for the next reset */

  RCU_APB1EN |= BIT(28);                       /* PMU */
  PMU_CTL0 = (PMU_CTL0 & ~(0x1Fu << 11)) | (0x0Eu << 11);   /* LDOVS = 1.15 V (216 MHz needs it), PLL still closed */
  /* E81 (F-D-7): PFEN with the wait states. The reset value 0x00040600 already has DCEN and ICEN set but NOT the
     prefetch buffer (UM §2.4.1), and the 1 ms tick runs from flash at 7 wait states — this is free throughput. */
  FMC_WS = (FMC_WS & ~0xFu) | BIT(8) | 7u;     /* PFEN + 7 wait states before raising the clock (Table 2-3) */

#if PORT_HXTAL_HZ
  RCU_CTL |= BIT(16);                          /* HXTALEN */
  /* E81 (F-F-1): bounded to ~20 ms of IRC8M time (≈4 cycles/iteration at 8 MHz). A crystal starts in 1–5 ms; waiting the
     old 4 M iterations (~2 s) would have let the TPS3430's 23.375 ms window reset the part before the first WDI edge. */
  for (uint32_t t = 0u; t < 40000u && !(RCU_CTL & BIT(17)); t++) {}
  if (RCU_CTL & BIT(17)) {
    RCU_CTL |= BIT(19);                        /* CKMEN — a stuck crystal forces IRC8M and raises the NMI (CKMIF) */
    pll_config(1u);
  } else pll_config(0u);                       /* the crystal never started: run from IRC8M (HW-REC-4 reported by CAN warn) */
#else
  pll_config(0u);
#endif
  RCU_CFG0 = 0u;                               /* AHB/APB1/APB2/APB3 = /1 (216 MHz each, timer clock = CK_APB) */
  RCU_CFG0 = (RCU_CFG0 & ~3u) | 3u;            /* SCS = CK_PLLP */
  while ((RCU_CFG0 & (3u << 2)) != (3u << 2)) {}

  RCU_CFG2 |= BIT(19) | (1u << 26) | (1u << 28);   /* HRTIMER ← CK_SYS · ADC0/1/2 and ADC3 ← CK_PLLR (72 MHz) */
  RCU_CFG1 = (RCU_CFG1 & ~(3u << 10)) | (2u << 10);   /* CAN1 ← CK_PLLQ 48 MHz */

  RCU_AHB1EN |= BIT(21) | BIT(23);             /* DMA0 · DMAMUX */
  RCU_AHB2EN |= 0x3Fu << 17;                   /* GPIOA..GPIOF */
  RCU_APB2EN |= BIT(31) | BIT(29) | BIT(15) | BIT(14) | BIT(9) | BIT(3) | BIT(2);   /* TRIGSEL HRTIMER TIMER19 SYSCFG CAN1 CMP VREF */
  RCU_APB1EN |= BIT(2);                        /* TIMER3 */
  RCU_APB3EN |= (0xFu << 8) | (0xFu << 17) | BIT(16);   /* ADC0..3 · DAC0..3 · DAC hold clock */

  SCB_DEMCR |= BIT(24);                        /* DWT cycle counter for the T-44 budget and µs delays */
  DWT_CYCCNT = 0u;
  DWT_CTRL |= 1u;
  DBG_CTL1 |= BIT(12);                         /* halted core: hold FWDGT */
  DBG_CTL2 |= BIT(26) | BIT(20);               /* halted core: hold HRTIMER and TIMER19 (gates freeze safe) */
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

/* WDI: the TPS3430 fixed window takes a FALLING edge per service (HR-02) */
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
    /* E81 (F-D-6): KPARA leaves TIMER3_CH1 for plain GPIO — the UEXCL NOR needs a steady level, not a 20 kHz chop */
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
