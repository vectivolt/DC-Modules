/* adc.c — E80 four ADCs, one 100 kHz trigger, DMA into per-ADC rings (facts-system §6; DMA/DMAMUX from UM ch. 8/9:
 * CHxCTL 0x08+0x14x {MWIDTH 11:10 · PWIDTH 9:8 · MNAGA 7 · CMEN 5 · DIR 4 · CHEN 0}, CHxCNT/PADDR/MADDR follow;
 * DMAMUX_RM_CHxCFG 0x04·x MUXID: ADC0 = 5 · ADC1 = 34 · ADC2 = 35 · ADC3 = 36; RCU AHB1EN DMA0 21 · DMAMUX 23).
 *
 * Sequences (every channel every 10 µs; the ISR reads the completed set from the previous trigger — the one-update
 * transport delay the control law models; LLC and slow channels are averaged down in the ISRs). E81 (F-D-4/13/14 and the
 * reviewer I §7 pin swap): I_A0 is PB0 = ADC0_IN12 and T_LLC is PC2 = ADC01_IN7, AVMID (PC3, ADC01_IN8) is converted at last,
 * the live RATING slot is gone (it could not settle and nothing read it), and the two 8–10 kOhm rail dividers get their own
 * sample time:
 *   ADC0: I_B0(3) · I_A0(12) · VOUT(1) · I_RES(0) · AVMID(8) · T_LLC(7)    6 conversions ≈ 1.8 µs at 72 MHz
 *   ADC1: I_C0(6) · VAC1(5) · VAC2(15) · IOUT(3) · IOUTN(4) · T_INLET(2)   6 ≈ 1.8 µs
 *   ADC2: VBUS(4) · VMID(6) · T_PFC(2) · T_XFMR(0) · V15(14 @ SMP_HIZ)     5 ≈ 2.8 µs
 *   ADC3: VAC3(5) · VBKA(12) · VBKB(11) · V24(7 @ SMP_HIZ) · VREFINT(20)   5 ≈ 2.8 µs
 * Every ring is double-buffered (2 × sequence, circular DMA): the ISR reads the half the DMA is not filling. */
#include "port.h"

#define DMA_CHCTL(x)  RD(DMA0_BASE + 0x08u + 0x14u * (x))
#define DMA_CHCNT(x)  RD(DMA0_BASE + 0x0Cu + 0x14u * (x))
#define DMA_CHPADDR(x) RD(DMA0_BASE + 0x10u + 0x14u * (x))
#define DMA_CHMADDR(x) RD(DMA0_BASE + 0x14u + 0x14u * (x))
#define DMAMUX_CFG(x) RD(DMAMUX_BASE + 0x04u * (x))

enum { N0 = 6, N1 = 6, N2 = 5, N3 = 5 };
volatile uint16_t adc_buf0[2 * N0], adc_buf1[2 * N1], adc_buf2[2 * N2], adc_buf3[2 * N3];

/* half-select: DMA CNT counts DOWN from 2N; remaining > N means it is filling the SECOND half → read the first */
#define HALF(x, n) ((DMA_CHCNT(x) > (uint32_t)(n)) ? 0u : (uint32_t)(n))

static const uint8_t SEQ0[N0] = { 3, 12, 1, 0, 8, 7 };
static const uint8_t SEQ1[N1] = { 6, 5, 15, 3, 4, 2 };
static const uint8_t SEQ2[N2] = { 4, 6, 2, 0, 14 };
static const uint8_t SEQ3[N3] = { 5, 12, 11, 7, 20 };
#define SMP 7u   /* 9.5 + 12.5 cycles ≈ 0.31 µs per conversion at 72 MHz */
/* E81 (F-D-4): SNS_V15 (47 k || 10 k = 8.25 kOhm) and SNS_V24 (82 k || 10 k = 8.91 kOhm) drive the sample capacitor from
   ~9 kOhm; at SMP 7 the 131.9 ns aperture admits 927 Ohm (ds Table 4-35: t_s/(C_ADC·ln 2^14) − R_ADC), so V15 read 12.6 V
   on a 30 kW card and aux_ok was never true. SMP 100 = 112.5 cycles = 1.56 µs → 18.6 kOhm, and both sequences still fit
   the 10 µs window (5 slots: 4×22 + 112.5 = 200.5 cycles = 2.78 µs). */
#define SMP_HIZ 100u
static uint8_t slot_smp(unsigned n, uint8_t ch) {
  return ((n == 2u && ch == 14u) || (n == 3u && ch == 7u)) ? SMP_HIZ : SMP;   /* V15 · V24 */
}

static void seq_load(unsigned n, const uint8_t *ch, unsigned len) {
  uint32_t rsq[9] = { 0u };
  rsq[0] = ((uint32_t)(len - 1u) << 20);
  for (unsigned k = 0u; k < len; k++) {          /* slot k: RSQ8 holds slot 0; RSQ7..1 hold slots 1..14 two per register */
    uint32_t slot = ADC_SLOT(ch[k], slot_smp(n, ch[k]));
    if (k == 0u) rsq[8] = slot;
    else if (k <= 14u) rsq[8u - (k + 1u) / 2u] |= slot << (((k + 1u) & 1u) ? 16u : 0u);
    /* slot layout per facts-system: RSQ7 = slots 2,1 · RSQ6 = 4,3 … low half = the odd slot of the pair */
  }
  for (unsigned k = 0u; k < 9u; k++) ADC_RSQ(n, k) = rsq[k];
}

static void one_adc(unsigned n, const uint8_t *ch, unsigned len, volatile uint16_t *buf, unsigned dmach) {
  ADC_CTL1(n) = BIT(0);                          /* ADCON */
  delay_us(2u);                                  /* ≥ 14 CK_ADC + t_SU */
  ADC_CTL1(n) |= BIT(2);                         /* CLB */
  while (ADC_CTL1(n) & BIT(2)) {}
  ADC_CTL0(n) = BIT(8);                          /* scan mode, 12-bit */
  seq_load(n, ch, len);
  DMAMUX_CFG(dmach) = (n == 0u) ? 5u : 33u + n;  /* MUXID: ADC0 = 5, ADC1..3 = 34..36 */
  DMA_CHPADDR(dmach) = ADC_BASE(n) + 0x64u;      /* ADC_RDATA */
  DMA_CHMADDR(dmach) = (uint32_t)buf;
  DMA_CHCNT(dmach) = 2u * len;
  DMA_CHCTL(dmach) = (1u << 10) | (1u << 8) | BIT(7) | BIT(5) | (3u << 12) | BIT(0);   /* 16-bit both · MNAGA · circular · ultra prio · EN */
  ADC_CTL1(n) |= BIT(8) | (1u << 28) | (n == 3u ? BIT(24) : 0u);   /* DMA · ETMRC rising · ADC3: VREFINT on */
  TRIGSEL_ADC(n) = TRIGSEL_IN_HRT_ADCTRIG(0);    /* every sequence from HRTIMER ADC trigger 0 (both PFC roll-overs) */
}

void adc_init(void) {
  ADC_SYNCCTL = 0u;                              /* async clock: CK_PLLR 72 MHz, /1 */
  one_adc(0u, SEQ0, N0, adc_buf0, 0u);
  one_adc(1u, SEQ1, N1, adc_buf1, 1u);
  one_adc(2u, SEQ2, N2, adc_buf2, 2u);
  one_adc(3u, SEQ3, N3, adc_buf3, 3u);
}

/* single blocking conversion before the engine starts (the rating strap read in app_init's boot record) */
uint16_t adc_read_once(unsigned n, uint8_t ch) {
  ADC_CTL1(n) = BIT(0);
  delay_us(2u);
  ADC_CTL1(n) |= BIT(2);
  while (ADC_CTL1(n) & BIT(2)) {}
  ADC_RSQ(n, 0) = 0u;
  ADC_RSQ(n, 8) = ADC_SLOT(ch, 100u);
  ADC_CTL1(n) |= BIT(30);                        /* SWRCST */
  while (!(ADC_STAT(n) & BIT(1))) {}
  uint32_t v = ADC_RDATA(n);
  ADC_CTL1(n) = 0u;                              /* back off; adc_init reconfigures */
  return (uint16_t)v;
}

/* the PFC ISR's sample set (counts), read from the halves the DMA is not writing */
void adc_read_pfc(app_pfc_adc_t *s, float *ires, float *vout, float *iout, float *iout_n,
                  float *t_inlet, float *vbka, float *vbkb, float *v24, float *vref) {
  uint32_t h0 = HALF(0u, N0), h1 = HALF(1u, N1), h2 = HALF(2u, N2), h3 = HALF(3u, N3);
  s->ib = (float)adc_buf0[h0 + 0u]; s->ia = (float)adc_buf0[h0 + 1u];
  *vout = (float)adc_buf0[h0 + 2u]; *ires = (float)adc_buf0[h0 + 3u];
  s->ic = (float)adc_buf1[h1 + 0u];
  s->vac[0] = (float)adc_buf1[h1 + 1u]; s->vac[1] = (float)adc_buf1[h1 + 2u];
  *iout = (float)adc_buf1[h1 + 3u]; *iout_n = (float)adc_buf1[h1 + 4u]; *t_inlet = (float)adc_buf1[h1 + 5u];
  s->vbus = (float)adc_buf2[h2 + 0u]; s->vmid = (float)adc_buf2[h2 + 1u];
  s->vac[2] = (float)adc_buf3[h3 + 0u];
  *vbka = (float)adc_buf3[h3 + 1u]; *vbkb = (float)adc_buf3[h3 + 2u];
  *v24 = (float)adc_buf3[h3 + 3u]; *vref = (float)adc_buf3[h3 + 4u];
}

void adc_read_slow(float *t_pfc, float *t_llc, float *t_xfmr, float *v15, float *avmid) {
  uint32_t h0 = HALF(0u, N0), h2 = HALF(2u, N2);
  *t_pfc = (float)adc_buf2[h2 + 2u]; *t_xfmr = (float)adc_buf2[h2 + 3u]; *v15 = (float)adc_buf2[h2 + 4u];
  *avmid = (float)adc_buf0[h0 + 4u]; *t_llc = (float)adc_buf0[h0 + 5u];   /* E81 swap: T_LLC is PC2 = ADC0_IN7 */
}

/* E81 (F-E-10): the freshest COMPLETED I_RES conversion, read inside the fault ISR. The cached 100 kHz value could be a
   whole control period (10 µs) old at the FLT edge, and the tank slews 44–52 A in 3 µs — F.11 was being filed as F.02.
   This family has no inserted group (regs.h), so the residual latency is the age of the last regular set: 0–10 µs, typically
   < 3 µs, against 5–15 µs before. EVT T-xx still measures the attribution against a scope. */
RAMFUNC float adc_ires_now(void) { return (float)adc_buf0[HALF(0u, N0) + 3u]; }
