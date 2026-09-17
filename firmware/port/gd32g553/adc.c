/* adc.c — E80 four ADCs, one 100 kHz trigger, DMA into per-ADC rings (facts-system §6; DMA/DMAMUX from UM ch. 8/9:
 * CHxCTL 0x08+0x14x {MWIDTH 11:10 · PWIDTH 9:8 · MNAGA 7 · CMEN 5 · DIR 4 · CHEN 0}, CHxCNT/PADDR/MADDR follow;
 * DMAMUX_RM_CHxCFG 0x04·x MUXID: ADC0 = 5 · ADC1 = 34 · ADC2 = 35 · ADC3 = 36; RCU AHB1EN DMA0 21 · DMAMUX 23).
 *
 * Sequences (every channel every 10 µs; the ISR reads the completed set from the previous trigger — the one-update
 * transport delay the control law models; LLC and slow channels are averaged down in the ISRs):
 *   ADC0: I_B0(3) · I_A0(7) · VOUT(1) · I_RES(0)                     4 conversions ≈ 1.2 µs at 72 MHz
 *   ADC1: I_C0(6) · VAC1(5) · VAC2(15) · IOUT(3) · IOUTN(4) · T_INLET(2)   6 ≈ 1.8 µs
 *   ADC2: VBUS(4) · VMID(6)? — VMID is ADC23_IN6: kept on ADC2 · VAC3?(ADC23_IN5 → ADC3) · T_PFC(2) · T_LLC(11) · T_XFMR(0) · RATING(3) · V15(14)   7 ≈ 2.1 µs
 *   ADC3: VAC3(5) · VBKA(12) · VBKB(11) · V24(7) · VREFINT(20)       5 ≈ 1.5 µs
 * Every ring is double-buffered (2 × sequence, circular DMA): the ISR reads the half the DMA is not filling. */
#include "port.h"

#define DMA_CHCTL(x)  RD(DMA0_BASE + 0x08u + 0x14u * (x))
#define DMA_CHCNT(x)  RD(DMA0_BASE + 0x0Cu + 0x14u * (x))
#define DMA_CHPADDR(x) RD(DMA0_BASE + 0x10u + 0x14u * (x))
#define DMA_CHMADDR(x) RD(DMA0_BASE + 0x14u + 0x14u * (x))
#define DMAMUX_CFG(x) RD(DMAMUX_BASE + 0x04u * (x))

enum { N0 = 4, N1 = 6, N2 = 7, N3 = 5 };
volatile uint16_t adc_buf0[2 * N0], adc_buf1[2 * N1], adc_buf2[2 * N2], adc_buf3[2 * N3];

/* half-select: DMA CNT counts DOWN from 2N; remaining > N means it is filling the SECOND half → read the first */
#define HALF(x, n) ((DMA_CHCNT(x) > (uint32_t)(n)) ? 0u : (uint32_t)(n))

static const uint8_t SEQ0[N0] = { 3, 7, 1, 0 };
static const uint8_t SEQ1[N1] = { 6, 5, 15, 3, 4, 2 };
static const uint8_t SEQ2[N2] = { 4, 6, 2, 11, 0, 3, 14 };
static const uint8_t SEQ3[N3] = { 5, 12, 11, 7, 20 };
#define SMP 7u   /* 9.5 + 12.5 cycles ≈ 0.31 µs per conversion at 72 MHz */

static void seq_load(unsigned n, const uint8_t *ch, unsigned len) {
  uint32_t rsq[9] = { 0u };
  rsq[0] = ((uint32_t)(len - 1u) << 20);
  for (unsigned k = 0u; k < len; k++) {          /* slot k: RSQ8 holds slot 0; RSQ7..1 hold slots 1..14 two per register */
    uint32_t slot = ADC_SLOT(ch[k], SMP);
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

void adc_read_slow(float *t_pfc, float *t_llc, float *t_xfmr, float *rating, float *v15) {
  uint32_t h2 = HALF(2u, N2);
  *t_pfc = (float)adc_buf2[h2 + 2u]; *t_llc = (float)adc_buf2[h2 + 3u]; *t_xfmr = (float)adc_buf2[h2 + 4u];
  *rating = (float)adc_buf2[h2 + 5u]; *v15 = (float)adc_buf2[h2 + 6u];
}
