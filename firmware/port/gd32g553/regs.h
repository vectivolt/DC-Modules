/* regs.h — E80 GD32G553 register definitions, written from the GD32G553 User Manual Rev 1.3 and Datasheet Rev 2.0 with no
 * vendor code (the GigaDevice library's SLA was not accepted). Every block cites the UM lines it was read from
 * (scratchpad extraction: facts-system.md, facts-hrtimer.md, facts-can.md). Only the registers this port uses are here. */
#ifndef PORT_REGS_H
#define PORT_REGS_H
#include <stdint.h>

#define RD(a)         (*(volatile uint32_t *)(a))
#define BIT(n)        (1u << (n))

/* ---------------- RCU (base 0x4002 1000, UM L8341) */
#define RCU_CTL       RD(0x40021000u)   /* PLLSTB 25 · PLLEN 24 · CKMEN 19 · HXTALBPS 18 · HXTALSTB 17 · HXTALEN 16 · IRC8MSTB 1 (L8345+) */
#define RCU_PLLR      RD(0x40021004u)   /* PLLR 31:27 · PLLQ 26:23 · PLLSEL 22 · PLLREN 21 · PLLQEN 20 · PLLPEN 19 · PLLP 17:16 · PLLN 13:6 · PLLPSC 3:0 (L8449+) */
#define RCU_CFG0      RD(0x40021008u)   /* APB3PSC 29:27 · APB2PSC 15:13 · APB1PSC 12:10 · AHBPSC 7:4 · SCSS 3:2 · SCS 1:0 (L8579+) */
#define RCU_INT       RD(0x4002100Cu)   /* CKMIC 23 · CKMIF 7 (L8688+) */
#define RCU_AHB1EN    RD(0x40021030u)   /* CRCEN 12 (L9448) */
#define RCU_AHB2EN    RD(0x40021034u)   /* PAEN..PFEN 17..22 (L9488+) */
#define RCU_APB1EN    RD(0x40021040u)   /* PMUEN 28 · TIMER3EN 2 · TIMER1EN 0 (L9588+) */
#define RCU_APB2EN    RD(0x40021044u)   /* TRIGSELEN 31 · HRTIMEREN 29 · TIMER19EN 15 · SYSCFGEN 14 · CAN2..0EN 10..8 · CMPEN 3 · VREFEN 2 (L9729+) */
#define RCU_APB3EN    RD(0x40021048u)   /* DAC3..0EN 20..17 · DACHOLDEN 16 · ADC3..0EN 11..8 (L9860+) */
#define RCU_APB2RST   RD(0x40021024u)   /* CAN1RST 9 · HRTIMERRST 29 (L9184+) */
#define RCU_RSTSCK    RD(0x40021074u)   /* LPRSTF 31 · WWDGTRSTF 30 · FWDGTRSTF 29 · SWRSTF 28 · PORRSTF 27 · EPRSTF 26 · BORRSTF 25 · RSTFC 24 (L10644+) */
#define RCU_CFG1      RD(0x4002108Cu)   /* CAN2SEL 13:12 · CAN1SEL 11:10 · CAN0SEL 9:8 — 00 IRC8M · 01 APB2 · 10 PLLQ · 11 HXTAL (L10742+) */
#define RCU_CFG2      RD(0x40021090u)   /* ADC3SEL 29:28 · ADC012SEL 27:26 (01 = CK_PLLR) · HRTIMERSEL 19 (1 = CK_SYS) (L10834+) */

/* ---------------- PMU (base 0x4000 7000, L7398) */
#define PMU_CTL0      RD(0x40007000u)   /* LDOVS 15:11 — 01100 = 1.10 V (reset) · 01110 = 1.15 V, set while the PLL is closed (L7472+) */

/* ---------------- FMC (base 0x4002 2000, L5709) */
#define FMC_WS        RD(0x40022000u)   /* DCEN 10 · ICEN 9 · PFEN 8 · WSCNT 3:0 (7 for 216 MHz, L4791+) */
#define FMC_KEY       RD(0x40022008u)   /* 0x45670123 then 0xCDEF89AB unlocks FMC_CTL (L4874) */
#define FMC_STAT      RD(0x40022010u)   /* BUSY 16 · PGSERR 7 · PGMERR 6 · PGAERR 5 · WPERR 4 · PGERR 3 · OPRERR 1 · ENDF 0 (L5884+) */
#define FMC_CTL       RD(0x40022014u)   /* LK 31 · START 16 · MER1 15 · BKSEL 12 · PNSEL 10:3 · MER0 2 · PER 1 · PG 0 (L5969+) */
#define FMC_OBCTL     RD(0x40022020u)   /* DBS bit 22: 1 = dual bank, 1 KB pages (L4614+, L6258) */

/* ---------------- SYSCFG (0x4001 0000, L2490) · EXTI (0x4001 0400, L11340) */
#define SYSCFG_EXTISS(n) RD(0x40010008u + 4u * (n))   /* EXTISS0..3: 4-bit port codes 0=PA 1=PB 2=PC 3=PD 4=PE 5=PF (L2642+) */
#define EXTI_INTEN    RD(0x40010400u)
#define EXTI_RTEN     RD(0x40010408u)
#define EXTI_FTEN     RD(0x4001040Cu)
#define EXTI_PD       RD(0x40010414u)

/* ---------------- GPIO (bases 0x4800 0000 + 0x400 per port, L14803+) */
#define GPIO_BASE(p)  (0x48000000u + 0x400u * (uint32_t)(p))
#define GPIO_CTL(p)   RD(GPIO_BASE(p) + 0x00u)   /* 2-bit: 00 in · 01 out · 10 AF · 11 analog (reset) */
#define GPIO_OMODE(p) RD(GPIO_BASE(p) + 0x04u)
#define GPIO_OSPD(p)  RD(GPIO_BASE(p) + 0x08u)
#define GPIO_PUD(p)   RD(GPIO_BASE(p) + 0x0Cu)   /* 01 pull-up · 10 pull-down */
#define GPIO_ISTAT(p) RD(GPIO_BASE(p) + 0x10u)
#define GPIO_OCTL(p)  RD(GPIO_BASE(p) + 0x14u)
#define GPIO_BOP(p)   RD(GPIO_BASE(p) + 0x18u)   /* 15:0 set · 31:16 clear */
#define GPIO_AFSEL0(p) RD(GPIO_BASE(p) + 0x20u)  /* 4-bit AF per pin; AF10–15 valid per the datasheet tables (UM "reserved" is a doc error, facts-system A5) */
#define GPIO_AFSEL1(p) RD(GPIO_BASE(p) + 0x24u)
enum { PA = 0, PB, PC, PD, PE, PF };

/* ---------------- ADC (bases 0x5000 0000/0400/0800/0C00, L23758; no inserted group on this family) */
#define ADC_BASE(n)   (0x50000000u + 0x400u * (uint32_t)(n))
#define ADC_STAT(n)   RD(ADC_BASE(n) + 0x00u)    /* ROVF 5 · EOC 1 (L23767+) */
#define ADC_CTL0(n)   RD(ADC_BASE(n) + 0x04u)    /* DRES 25:24 · SM 8 (L23835+) */
#define ADC_CTL1(n)   RD(ADC_BASE(n) + 0x08u)    /* SWRCST 30 · ETMRC 29:28 · INREFEN 24 · DMA 8 · CALNUM 6:4 · RSTCLB 3 · CLB 2 · CTN 1 · ADCON 0 (L23955+) */
#define ADC_RSQ(n, k) RD(ADC_BASE(n) + 0x24u + 4u * (k))   /* RSQ0: RL 23:20 + slot15 · RSQ1..7 two slots · RSQ8 slot 0 (L24154+) */
#define ADC_RDATA(n)  RD(ADC_BASE(n) + 0x64u)
#define ADC_SYNCCTL   RD(0x50000304u)             /* at ADC0 base: ADCCK 19:16(? see facts: ADCCK codes /1../256) · ADCSCK (L24975+) */
#define ADC_SLOT(ch, smp) ((uint32_t)(ch) | ((uint32_t)(smp) << 5))   /* per-slot: RSQn 4:0 · RSMPn 14:5, t_samp = RSMP + 2.5 cyc (L24480) */

/* ---------------- DMA0 + DMAMUX (bases 0x4002 0000 / 0x4002 0800, L16047/L16999) — filled by adc.c from its own extraction */
#define DMA0_BASE     0x40020000u
#define DMAMUX_BASE   0x40020800u

/* ---------------- TRIGSEL (base 0x4001 8400, L12337) */
#define TRIGSEL_ADC(n) RD(0x40018410u + 4u * (uint32_t)(n))   /* INSEL0 7:0 → ADCx routine trigger; 0x7D.. = HRTIMER_ADCTRIG0.. (L12514+, L11891) */
#define TRIGSEL_IN_HRT_ADCTRIG(k) (0x7Du + (uint32_t)(k))

/* ---------------- CMP (base 0x4001 7C00, L26996) */
#define CMP_STAT      RD(0x40017C00u)
#define CMP_CS(n)     RD(0x40017C08u + 4u * (uint32_t)(n))
/* CS: LK 31 · BLK 27:24 · PSEL 20 · MSEL 18:16 · HST 10:8 · PL 3 · EN 0 (L27184+) */

/* ---------------- DAC0..3 (bases 0x5000 1000/1400/1800/1C00, L25723) */
#define DAC_BASE(n)   (0x50001000u + 0x400u * (uint32_t)(n))
#define DAC_CTL0(n)   RD(DAC_BASE(n) + 0x00u)    /* DEN1 16 · DEN0 0; trigger disabled = data transfers on write (L25729+) */
#define DAC_R12DH0(n) RD(DAC_BASE(n) + 0x08u)
#define DAC_R12DH1(n) RD(DAC_BASE(n) + 0x14u)
#define DAC_MDCR(n)   RD(DAC_BASE(n) + 0x3Cu)    /* MODE1 18:16 · MODE0 2:0; 011 = buffer off, peripherals only (L26456+) */

/* ---------------- HRTIMER (master 0x4001 5800 · ST0..5 +0x80.. · common 0x4001 5B80, L57058+) */
#define HRT_MT        0x40015800u
#define HRT_ST(x)     (0x40015880u + 0x80u * (uint32_t)(x))   /* ST0..5; ST6/7 elsewhere, unused */
#define HRT_CM        0x40015B80u
#define HRT_MTCTL0    RD(HRT_MT + 0x00u)   /* SHWEN 27 · ST7..0CEN 24:17 · MTCEN 16 · CTNM 3 · CNTCKDIV 2:0 (L57088+) */
#define HRT_MTINTF    RD(HRT_MT + 0x04u)
#define HRT_MTINTC    RD(HRT_MT + 0x08u)
#define HRT_MTDMAINTEN RD(HRT_MT + 0x0Cu)  /* REPIE 4 · CMPxIE 3:0 (L57409+) */
#define HRT_MTCAR     RD(HRT_MT + 0x14u)
#define HRT_MTCREP    RD(HRT_MT + 0x18u)
#define HRT_MTCMP0V   RD(HRT_MT + 0x1Cu)
#define HRT_STCTL0(x)  RD(HRT_ST(x) + 0x00u)  /* UPSEL 31:28 · SHWEN 27 · UPBST4..0 23:19 · UPRST 18 · HALFM 5 · CTNM 3 · CNTCKDIV 2:0 (L57787+) */
#define HRT_STINTF(x)  RD(HRT_ST(x) + 0x04u)  /* RSTIF 13 · CMP3IF..CMP0IF 3:0 (L58049+) */
#define HRT_STINTC(x)  RD(HRT_ST(x) + 0x08u)
#define HRT_STDMAINTEN(x) RD(HRT_ST(x) + 0x0Cu)   /* RSTIE 13 · CMP3IE..0IE 3:0 (L58291+) */
#define HRT_STCAR(x)   RD(HRT_ST(x) + 0x14u)
#define HRT_STCMP0V(x) RD(HRT_ST(x) + 0x1Cu)
#define HRT_STCMP1V(x) RD(HRT_ST(x) + 0x24u)
#define HRT_STCMP3V(x) RD(HRT_ST(x) + 0x2Cu)
#define HRT_STDTCTL(x) RD(HRT_ST(x) + 0x38u)  /* DTFS 25 · DTFCFG 24:16 · DTGCKDIV 13:10 · DTRS 9 · DTRCFG 8:0 (L58823+) */
#define HRT_STCH0SET(x) RD(HRT_ST(x) + 0x3Cu) /* PER bit 2 · CMP0 bit 3 (CH0SCMP0) · CMPn bits 6:3 (L58936+) */
#define HRT_STCH0RST(x) RD(HRT_ST(x) + 0x40u)
#define HRT_STCH1SET(x) RD(HRT_ST(x) + 0x44u)
#define HRT_STCH1RST(x) RD(HRT_ST(x) + 0x48u)
#define HRT_STCNTRST(x) RD(HRT_ST(x) + 0x54u) /* ST1 bit 20 = ST0CMP1RST (L60039+) */
#define HRT_STCHOCTL(x) RD(HRT_ST(x) + 0x64u) /* CH1FLTOS 21:20 · CH1P 17 · DTEN 8 · CH0FLTOS 5:4 · ISO 19/3 · CH0P 1 (L62588+) */
#define HRT_STFLTCTL(x) RD(HRT_ST(x) + 0x68u) /* FLT7EN..FLT0EN 7:0 (L62770+) */
#define HRT_STCTL1(x)  RD(HRT_ST(x) + 0x6Cu)  /* ADCROVM 11:10 · OUTROVM 9:8 · ROVM 7:6 · CAM 4 (L62839+) */
#define HRT_STACTL(x)  RD(HRT_ST(x) + 0x7Cu)  /* DTFCFG 15:9 hi · DTRCFG 15:9 hi · FLTAR 8 (L64121+) */
#define HRT_CTL0      RD(HRT_CM + 0x00u)   /* ADTG0USRC 18:16 (0 = master update) (L64202+) */
#define HRT_CTL1      RD(HRT_CM + 0x04u)   /* STxSUP 7:1 · MTSUP 0 (L64351+) */
#define HRT_INTF      RD(HRT_CM + 0x08u)   /* DLLCALIF 16 · FLT7IF 8 · FLT6..5IF 7:6 · SYSFLTIF 5 · FLT4..0IF 4:0 (L64484) */
#define HRT_INTC      RD(HRT_CM + 0x0Cu)
#define HRT_INTEN     RD(HRT_CM + 0x10u)
#define HRT_CHOUTEN   RD(HRT_CM + 0x14u)   /* STxCHyEN bits 2x+y (L64732+) */
#define HRT_CHOUTDIS  RD(HRT_CM + 0x18u)
#define HRT_EXEVCFG0  RD(HRT_CM + 0x30u)
#define HRT_ADCTRIGS0 RD(HRT_CM + 0x3Cu)   /* TRG0ST3PER bit 27 (L65717+) */
#define HRT_ADCTRIGS1 RD(HRT_CM + 0x40u)   /* TRG1MTC3..C0 bits 3:0 · TRG1MTPER 4 (L65905+) */
#define HRT_DLLCCTL   RD(HRT_CM + 0x4Cu)   /* CLBPEREN 1 · CLBSTRT 0 (L66462+) */
#define HRT_FLTINCFG0 RD(HRT_CM + 0x50u)   /* FLT0..3, 8 bits each: {PROT 7 · FC 6:3 · SRC0 2 · P 1 · EN 0} (L66514+) */
#define HRT_FLTINCFG1 RD(HRT_CM + 0x54u)   /* FLT4 7:0 · FLT5 15:8 · FLT7..0 INSRC[1] 23:16 · FLTFDIV 25:24 (L66644+) */
#define HRT_FLTINCFG4 RD(HRT_CM + 0x10Cu)  /* FLT6 7:0 · FLT7 15:8 (L67551) */
#define HRT_ADCPSCR0  RD(HRT_CM + 0x80u)

/* ---------------- TIMER19 (0x4001 5000, advanced) · TIMER3 (0x4000 0800, general) — fan and relay PWM (facts-system §11) */
#define TIM19         0x40015000u
#define TIM3          0x40000800u
#define TIM_CTL0(b)   RD((b) + 0x00u)   /* CEN 0 · ARSE 7 */
#define TIM_CHCTL0(b) RD((b) + 0x18u)   /* CH0COMCTL 6:4 = 0110 PWM0 + CH0COMSEN 3 · CH1 at 14:12/11 */
#define TIM_CHCTL2(b) RD((b) + 0x20u)   /* CH0EN 0 · MCH0EN 2 · CH1EN 4 */
#define TIM_PSC(b)    RD((b) + 0x28u)
#define TIM_CAR(b)    RD((b) + 0x2Cu)
#define TIM_CH0CV(b)  RD((b) + 0x34u)
#define TIM_CH1CV(b)  RD((b) + 0x38u)
#define TIM_CCHP0(b)  RD((b) + 0x44u)   /* POEN 15 (TIMER19 only) */
#define TIM_MCHCTL0(b) RD((b) + 0x48u)  /* MCH0COMCTL 6:4 + [3] at 16 · MCH0MS 1:0 */
#define TIM_MCH0CV(b) RD((b) + 0x54u)
#define TIM_CTL2(b)   RD((b) + 0x74u)   /* MCH0MSEL 21:20 = 00 independent */

/* ---------------- CAN1 (base 0x4001 B000, facts-can) */
#define CAN1          0x4001B000u
#define CAN_CTL0(b)   RD((b) + 0x000u)  /* CANDIS 31 · INAMOD 30 · RFEN 29 · HALT 28 · NRDY 27 · SWRST 25 · INAS 24 · SRDIS 17 · RPFQEN 16 · MST 12 · MSZ 4:0 */
#define CAN_CTL1(b)   RD((b) + 0x004u)  /* BOIE 15 · LSCMOD 12 · ABORDIS 6 · MTO 4 · MMOD 3 */
#define CAN_TIMER(b)  RD((b) + 0x008u)  /* read = global rx unlock */
#define CAN_RMPUBF(b) RD((b) + 0x010u)
#define CAN_ERR0(b)   RD((b) + 0x01Cu)  /* RECNT 15:8 · TECNT 7:0 */
#define CAN_ERR1(b)   RD((b) + 0x020u)  /* BORF 19 · ERRSI 5:4 (00 active · 01 passive · 1x bus-off) · BOF 2 */
#define CAN_INTEN(b)  RD((b) + 0x028u)
#define CAN_STAT(b)   RD((b) + 0x030u)  /* MSx rc_w1 */
#define CAN_CTL2(b)   RD((b) + 0x034u)  /* IDERTR_RMF 16 */
#define CAN_BT(b)     RD((b) + 0x050u)  /* BAUDPSC 30:21 · SJW 20:16 · PTS 15:10 · PBS1 9:5 · PBS2 4:0, each +1 */
#define CAN_MB(b, n, w) RD((b) + 0x080u + 0x10u * (uint32_t)(n) + 4u * (uint32_t)(w))   /* MDES0..3 of mailbox n */
#define CAN_MPF(b, n) RD((b) + 0x880u + 4u * (uint32_t)(n))                              /* private mask (Inactive mode only) */

/* ---------------- FWDGT (0x4000 3000, L28468) — IRC32K, ~30–36 kHz over temperature */
#define FWDGT_CTL     RD(0x40003000u)   /* 0x5555 unlock · 0xCCCC start · 0xAAAA reload */
#define FWDGT_PSC     RD(0x40003004u)
#define FWDGT_RLD     RD(0x40003008u)
#define FWDGT_STAT    RD(0x4000300Cu)

/* ---------------- DBG (0xE004 4000) — hold the watchdog and PWM timers while the core is halted */
#define DBG_CTL1      RD(0xE0044008u)   /* FWDGT_HOLD 12 (L22567) */
#define DBG_CTL2      RD(0xE004400Cu)   /* HRTIMER_HOLD 26 · TIMER19_HOLD 20 (L22644+) */

/* ---------------- Cortex-M33 core (ARMv8-M, architecture-defined addresses) */
#define SCB_VTOR      RD(0xE000ED08u)
#define SCB_AIRCR     RD(0xE000ED0Cu)   /* 0x05FA0004 = SYSRESETREQ */
#define SCB_CPACR     RD(0xE000ED88u)   /* CP10/CP11 full access = FPU on */
#define SCB_SHPR3     RD(0xE000ED20u)   /* SysTick priority byte 31:24 */
#define SYST_CSR      RD(0xE000E010u)
#define SYST_RVR      RD(0xE000E014u)
#define SYST_CVR      RD(0xE000E018u)
#define NVIC_ISER(n)  RD(0xE000E100u + 4u * (n))
#define NVIC_IPR(n)   RD(0xE000E400u + 4u * (n))   /* byte-per-IRQ priority, high nibble */
#define DWT_CTRL      RD(0xE0001000u)
#define DWT_CYCCNT    RD(0xE0001004u)
#define SCB_DEMCR     RD(0xE000EDFCu)   /* TRCENA 24 */

/* device signature (facts-system §9) */
#define UID_BASE      0x1FFFB3E8u
#define VREFINT_CAL   (*(volatile uint16_t *)0x1FFFB3FCu)   /* counts at 3.3 V, 25 °C */

static inline void irq_enable(uint32_t irq) { NVIC_ISER(irq >> 5) = BIT(irq & 31u); }
static inline void irq_prio(uint32_t irq, uint32_t p) {   /* p = 0 (highest) .. 15 */
  volatile uint8_t *ipr = (volatile uint8_t *)0xE000E400u;
  ipr[irq] = (uint8_t)(p << 4);
}
#endif
