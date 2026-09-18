/* adc.c — four ADCs, one 100 kHz trigger, DMA into per-ADC rings (facts-system §6; DMA/DMAMUX from UM ch. 8/9:
 * CHxCTL 0x08+0x14x {MWIDTH 11:10 · PWIDTH 9:8 · MNAGA 7 · CMEN 5 · DIR 4 · CHEN 0}, CHxCNT/PADDR/MADDR follow;
 * DMAMUX_RM_CHxCFG 0x04·x MUXID: ADC0 = 5 · ADC1 = 34 · ADC2 = 35 · ADC3 = 36; RCU AHB1EN DMA0 21 · DMAMUX 23).
 *
 * Sequences (every channel every 10 µs; the ISR reads the completed set from the previous trigger — the one-update
 * transport delay the control law models; LLC and slow channels are averaged down in the ISRs). I_A0 is PB0 = ADC0_IN12
 * and T_LLC is PC2 = ADC01_IN7, AVMID (PC3, ADC01_IN8) is converted last, there is no live RATING slot (it could not
 * settle and nothing reads it), and the two 8–10 kOhm rail dividers get their own sample time:
 *   ADC0: I_B0(3) · I_A0(12) · VOUT(1) · I_RES(0) · AVMID(8) · T_LLC(7)    6 × 22 cyc = 132 = 1.83 µs at 72 MHz
 *   ADC1: I_C0(6) · VAC1(5) · VAC2(15) · IOUT(3) · IOUTN(4) · T_INLET(2)   6 × 22        = 132 = 1.83 µs
 *   ADC2: VBUS(4) · VMID(6) · T_PFC(2) · T_XFMR(0) · V15(14 @ SMP_HIZ)     4 × 22 + 115  = 203 = 2.82 µs  ← longest
 *   ADC3: VAC3(5) · VBKA(12) · VBKB(11) · V24(7 @ SMP_HIZ)                 3 × 22 + 115  = 181 = 2.51 µs
 * Every ring is double-buffered (2 × sequence, circular DMA): the ISR reads the half the DMA is not filling, and the
 * end of the LONGEST ring raises the 100 kHz control interrupt (CTL_DMACH below). */
#include "port.h"

#define DMA_CHCTL(x)  RD(DMA0_BASE + 0x08u + 0x14u * (x))
#define DMA_CHCNT(x)  RD(DMA0_BASE + 0x0Cu + 0x14u * (x))
#define DMA_CHPADDR(x) RD(DMA0_BASE + 0x10u + 0x14u * (x))
#define DMA_CHMADDR(x) RD(DMA0_BASE + 0x14u + 0x14u * (x))
#define DMAMUX_CFG(x) RD(DMAMUX_BASE + 0x04u * (x))

enum { N0 = 6, N1 = 6, N2 = 5, N3 = 4 };
/* The control interrupt is the end of the LONGEST ring, not a timer compare. ADC2 is that ring (2.82 µs), so DMA0
   channel 2's half/full transfer flags fire once per sequence = 100 kHz, ≈ 7.2 µs before the roll-over that loads the
   compare shadows. See hrtimer.c's timing block for why an ST3 compare cannot simply be placed earlier instead (a
   single compare in center-aligned mode is symmetric only at CAR/2). */
#define CTL_DMACH 2u
volatile uint16_t adc_buf0[2 * N0], adc_buf1[2 * N1], adc_buf2[2 * N2], adc_buf3[2 * N3];

/* half-select. DMA CNT is the REMAINING count: it starts at 2N and counts DOWN, so remaining > N means fewer than N words have
   been written — the DMA is filling the FIRST half and the complete one is the SECOND; remaining ≤ N means the first half is
   complete. Swapping the two is a silent 10 µs error: at the control interrupt (5 µs after the trigger, conversions
   done in ≤ 2.8 µs) CNT is exactly N or 2N, so the swapped form returns the half written one trigger EARLIER every
   time, making the real PFC transport delay 25 µs instead of the 15 µs the gains are derived for. */
#define HALF(x, n) ((DMA_CHCNT(x) > (uint32_t)(n)) ? (uint32_t)(n) : 0u)

static const uint8_t SEQ0[N0] = { 3, 12, 1, 0, 8, 7 };
static const uint8_t SEQ1[N1] = { 6, 5, 15, 3, 4, 2 };
static const uint8_t SEQ2[N2] = { 4, 6, 2, 0, 14 };
/* VREFINT (ADC3_IN20, UM §17.4 "VREFINT is internally connected to … ADC3_IN20") is deliberately NOT in this
   sequence. ds Table 4-36 note 2 asks for a sampling time of NOT LESS THAN 17.1 µs on VREFINT and the temperature
   sensor — longer than the whole 10 µs frame, so no RSMP code can make it legal here. At SMP 7 (131.9 ns) the sample
   capacitor moves ≈7 % of the way from the previous slot (SNS_V24 at ≈2.6 V) toward the 1.2 V bandgap, so the ADC
   reports ≈3150 counts instead of ≈1490, k_ref ≈ 0.47, and app.c's ±5 % reference check latches F.29 100 ms after
   every boot. It is read once at boot by adc_vrefint_read() at 36 MHz × 1025.5 cycles = 28.5 µs instead. */
static const uint8_t SEQ3[N3] = { 5, 12, 11, 7 };
#define SMP 7u   /* 9.5 + 12.5 cycles = 22 = 0.31 µs per conversion at 72 MHz */
/* SNS_V15 (47 k || 10 k = 8.25 kOhm) and SNS_V24 (82 k || 10 k = 8.91 kOhm) drive the sample capacitor from ~9 kOhm;
   at SMP 7 the 131.9 ns aperture admits 927 Ohm (ds Table 4-35: t_s/(C_ADC·ln 2^14) − R_ADC), so V15 would read 12.6 V
   on a 30 kW card and aux_ok would never be true. RSMP 100 is 102.5 SAMPLE cycles (regs.h: t_samp = RSMP + 2.5) =
   1.42 µs → 18.6 kOhm admitted, and 115 cycles with the conversion, so ADC2's five slots are 4×22 + 115 = 203 cycles
   = 2.82 µs. Both still fit the 10 µs frame. */
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
  /* the control ring also raises HTFIE/FTFIE (UM §8.5.3 DMA_CHxCTL: ERRIE 3 · HTFIE 2 · FTFIE 1 · CHEN 0).
     Half transfer = the first sequence finished, full transfer = the second: one interrupt per sequence, 100 kHz. */
  uint32_t ie = (dmach == CTL_DMACH) ? (BIT(2) | BIT(1)) : 0u;
  DMA_CHCTL(dmach) = (1u << 10) | (1u << 8) | BIT(7) | BIT(5) | (3u << 12) | ie | BIT(0);   /* 16-bit both · MNAGA · circular · ultra prio · EN */
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

/* single blocking conversion before the engine starts. ctl1_extra carries the channel's own CTL1 bits (INREFEN for the
   internal reference), smp the per-slot RSMP code — a strap settles in 1.4 µs, the bandgap needs 28 µs (see below). */
static uint16_t adc_once(unsigned n, uint8_t ch, uint16_t smp, uint32_t ctl1_extra) {
  ADC_CTL1(n) = BIT(0) | ctl1_extra;
  delay_us(2u);
  ADC_CTL1(n) |= BIT(2);
  while (ADC_CTL1(n) & BIT(2)) {}
  if (ctl1_extra) delay_us(20u);                 /* t_START of the internal reference before its first sample */
  ADC_RSQ(n, 0) = 0u;
  ADC_RSQ(n, 8) = ADC_SLOT(ch, smp);
  ADC_CTL1(n) |= BIT(30);                        /* SWRCST */
  while (!(ADC_STAT(n) & BIT(1))) {}
  uint32_t v = ADC_RDATA(n);
  ADC_CTL1(n) = 0u;                              /* back off; adc_init reconfigures */
  return (uint16_t)v;
}

uint16_t adc_read_once(unsigned n, uint8_t ch) { return adc_once(n, ch, 100u, 0u); }   /* the ROLE1 rating strap */

/* The internal reference, once, before adc_init() takes the ADCs over. ds Table 4-36 note 2 wants
   ≥ 17.1 µs of sampling; the RSMP field is 10 bits (regs.h ADC_SLOT), so 1023 gives 1025.5 cycles — 14.2 µs at the
   72 MHz the engine runs at, which is short. ADCCK 0001 halves the asynchronous ADC clock to 36 MHz (UM §17.7.26
   ADC_SYNCCTL: ADCCK[3:0] at 23:20, 0000 = div1 … 0001 = div2; "All ADCs are common"), making it 28.5 µs. The divider
   is restored here and adc_init() rewrites ADC_SYNCCTL = 0 anyway, so the 100 kHz engine still runs at 72 MHz.
   Boot-only, with its budget stated: VREFP = VDDA = V3P3, so the boot reading removes the rail's whole initial error
   (buck reference and divider tolerance) and what is left is the rail's movement AFTER boot — the buck reference's
   drift over the card's temperature excursion plus line / load regulation, ≤ ±1 % for the TPS54202 class (its ±1.5 %
   reference band spans −40…125 °C). Every measurement and, through app.c's dac_v(), every comparator reference carries
   that ±1 % (≈ ±25 V at F.03, ±22 V at F.13 LOW), inside the ±3 % chain class the threshold budget already holds. It is
   NOT caught by the V15 / V24 rails check — those read against the same VREFP — nor by the LVD, which only sees a gross
   drop. A periodic refresh is deliberately not added: the bandgap cannot be sampled inside the 10 µs frame, and a
   software-triggered conversion on an ADC the 100 kHz engine owns is a risk to the fast path for a ±1 % quantity. */
uint16_t adc_vrefint_read(void) {
  ADC_SYNCCTL = (1u << 20);                      /* ADCCK = div2 → 36 MHz */
  uint16_t v = adc_once(3u, 20u, 1023u, BIT(24));   /* ADC3_IN20, INREFEN */
  ADC_SYNCCTL = 0u;
  return v;
}

/* the PFC ISR's sample set (counts), read from the halves the DMA is not writing */
void adc_read_pfc(app_pfc_adc_t *s, float *ires, float *vout, float *iout, float *iout_n,
                  float *t_inlet, float *vbka, float *vbkb, float *v24) {
  uint32_t h0 = HALF(0u, N0), h1 = HALF(1u, N1), h2 = HALF(2u, N2), h3 = HALF(3u, N3);
  s->ib = (float)adc_buf0[h0 + 0u]; s->ia = (float)adc_buf0[h0 + 1u];
  *vout = (float)adc_buf0[h0 + 2u]; *ires = (float)adc_buf0[h0 + 3u];
  s->ic = (float)adc_buf1[h1 + 0u];
  s->vac[0] = (float)adc_buf1[h1 + 1u]; s->vac[1] = (float)adc_buf1[h1 + 2u];
  *iout = (float)adc_buf1[h1 + 3u]; *iout_n = (float)adc_buf1[h1 + 4u]; *t_inlet = (float)adc_buf1[h1 + 5u];
  s->vbus = (float)adc_buf2[h2 + 0u]; s->vmid = (float)adc_buf2[h2 + 1u];
  s->vac[2] = (float)adc_buf3[h3 + 0u];
  *vbka = (float)adc_buf3[h3 + 1u]; *vbkb = (float)adc_buf3[h3 + 2u];
  *v24 = (float)adc_buf3[h3 + 3u];
}

void adc_read_slow(float *t_pfc, float *t_llc, float *t_xfmr, float *v15, float *avmid) {
  uint32_t h0 = HALF(0u, N0), h2 = HALF(2u, N2);
  *t_pfc = (float)adc_buf2[h2 + 2u]; *t_xfmr = (float)adc_buf2[h2 + 3u]; *v15 = (float)adc_buf2[h2 + 4u];
  *avmid = (float)adc_buf0[h0 + 4u]; *t_llc = (float)adc_buf0[h0 + 5u];   /* T_LLC is PC2 = ADC0_IN7 */
}

/* The freshest COMPLETED I_RES conversion, read inside the fault ISR. The cached 100 kHz value can be a whole control
   period (10 µs) old at the FLT edge, and the tank slews 44–52 A in 3 µs, which files F.11 as F.02. This family has no
   inserted group (regs.h), so the residual latency is the age of the last regular set: 0–10 µs, typically < 3 µs. EVT
   measures the attribution against a scope. */
RAMFUNC float adc_ires_now(void) { return (float)adc_buf0[HALF(0u, N0) + 3u]; }
