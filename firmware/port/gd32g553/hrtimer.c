/* hrtimer.c — E80 the switching engine (facts-hrtimer.md; UM chapter 25).
 *   LLC   ST0 = leg A (CH0/CH1 complementary, 120 ns dead time), ST1 = leg B. Up-counting, HALFM (CMP0 = CAR/2): CH0 set on
 *         period, reset on CMP0 → 50 % square. ST1's counter resets on ST0's CMP1 (STxCNTRST bit 20), so ST0CMP1 = the leg-B
 *         lag = duty · CAR/2 counts (phase-shift modulation). CAR sets the frequency: f = 3.456 GHz / CAR (CNTCKDIV = 001).
 *         Shadow updates land on ST0's roll-over and ST1 updates with ST0 (UPBST0), so both legs re-time on the same cycle.
 *   PFC   ST3/4/5 = phases A/B/C, center-aligned (CAM), 50 kHz: CAR = 34560, counter 0→CAR→0. One compare (CMP0) in the SET
 *         crossbar makes the symmetric pulse: high on the up-crossing, low on the down-crossing (UM center-aligned set/reset
 *         rule), so ON fraction = (CAR − CMP0)/CAR around the peak — the hal_test carrier exactly. ADC trigger at BOTH
 *         roll-overs (ADCROVM = 00) = 100 kHz regular sampling; the control interrupt is ST3 CMP3 at CAR/2 (fires mid-slope
 *         on both slopes → 100 kHz, 5 µs after each trigger), so the ISR reads a finished conversion set and its duty lands
 *         at the next roll-over — the one-update transport delay the law models.
 *   LLC tick  the master timer runs at 10 kHz (CNTCKDIV = 101 → CAR = 21600) and its repetition interrupt is the LLC control
 *         ISR; master CMP0 feeds ADCTRIG1 (reserved for slower sequences if a port build wants a second rate).
 *   Faults  Table 25-21: FLT0 ← CMP1 (I_B0) · FLT2 ← PB10 pin (wire-OR, active LOW) · FLT3 ← CMP0 (VOUT) · FLT4 ← CMP2 (I_C0) ·
 *         FLT5 ← CMP4 (VBUS) · FLT7 ← CMP7 (I_A0). Every channel kills every power timer (CHxFLTOS = inactive), FLTAR = 0
 *         (latched); re-arm = software re-enable of the commanded outputs. IRQ76 attributes the channel to the app. */
#include "port.h"

#define LLC_FCK   3456000000.0f   /* ST0/ST1 counter clock, CNTCKDIV = 001 (289.35 ps) */
#define PFC_CAR   34560u          /* 50 kHz center-aligned at CNTCKDIV = 001: CAR = f_PSC / (2 · 50 kHz) */
#define MT_CAR    21600u          /* 10 kHz master at CNTCKDIV = 101 (216 MHz) */
#define CMPMIN    0x30u           /* Table 25-1 minimum compare/period at CNTCKDIV = 001 */

static const uint8_t PFC_ST[3] = { 3u, 4u, 5u };

static void dac_write(uint8_t inst, uint8_t out, uint16_t counts) {
  if (out) DAC_R12DH1(inst) = counts; else DAC_R12DH0(inst) = counts;
}

/* the comparator DAC thresholds (E75 allocation): CMP7/I_A0 ← DAC3_OUT1 · CMP1/I_B0 ← DAC2_OUT1 · CMP2/I_C0 ← DAC2_OUT0 ·
 * CMP4/VBUS ← DAC3_OUT0 · CMP0/VOUT ← DAC0_OUT0 (MODE0 = 011 keeps PA4 analog) · the HW-REC-1 clamp value ← DAC0_OUT1 */
void cmpdac_init(void) {
  DAC_MDCR(0) = (3u << 16) | 3u;             /* DAC0 both outputs buffer-off, peripherals only */
  DAC_CTL0(0) = BIT(16) | BIT(0);
  DAC_CTL0(2) = BIT(16) | BIT(0);            /* DAC2/DAC3 are pin-less 15 MSPS converters */
  DAC_CTL0(3) = BIT(16) | BIT(0);
  delay_us(3u);                              /* t_WAKEUP */
  /* CS: PSEL bit 20 · MSEL 18:16 · HST 001 (10 mV) · EN. Sources per facts-hrtimer §9. */
  CMP_CS(0) = (0u << 20) | (5u << 16) | (1u << 8) | 1u;   /* PA1 vs DAC0_OUT0 */
  CMP_CS(1) = (1u << 20) | (4u << 16) | (1u << 8) | 1u;   /* PA3 vs DAC2_OUT1 */
  CMP_CS(2) = (1u << 20) | (4u << 16) | (1u << 8) | 1u;   /* PC1 vs DAC2_OUT0 */
  CMP_CS(4) = (0u << 20) | (4u << 16) | (1u << 8) | 1u;   /* PB13 vs DAC3_OUT0 */
  CMP_CS(7) = (0u << 20) | (4u << 16) | (1u << 8) | 1u;   /* PC2 vs DAC3_OUT1 */
}

void cmpdac_thresholds(const float dac_v[APP_DAC_COUNT]) {
  static const struct { uint8_t inst, out; } M[APP_DAC_COUNT] = {
    { 3, 1 },  /* APP_DAC_IA  → DAC3_OUT1 (CMP7) */
    { 2, 1 },  /* APP_DAC_IB  → DAC2_OUT1 (CMP1) */
    { 2, 0 },  /* APP_DAC_IC  → DAC2_OUT0 (CMP2) */
    { 3, 0 },  /* APP_DAC_VBUS → DAC3_OUT0 (CMP4) */
    { 0, 0 },  /* APP_DAC_VOUT → DAC0_OUT0 (CMP0) */
    { 0, 1 },  /* APP_DAC_CLAMP → DAC0_OUT1 (HW-REC-1: value armed; comparator routing lands with the hardware decision) */
  };
  for (int k = 0; k < APP_DAC_COUNT; k++) {
    float v = dac_v[k] * (4096.0f / 3.3f);
    uint16_t c = v <= 0.0f ? 0u : v >= 4095.0f ? 4095u : (uint16_t)v;
    dac_write(M[k].inst, M[k].out, c);
  }
}

static void fault_cfg(void) {
  /* FLTFDIV first, then per-channel {FC filter 8 samples · SRC0 · polarity · EN}; INSRC[1] bits stay 0 (codes 00 pin, 01 CMP) */
  uint32_t cmp_hi = (0xFu << 3) | BIT(2) | BIT(1) | BIT(0);   /* SRC0 = 1 (internal CMP) · active HIGH · filtered · EN */
  uint32_t pin_lo = (0xFu << 3) | (0u << 2) | (0u << 1) | BIT(0);   /* PB10 wire-OR: pin source, active LOW */
  HRT_FLTINCFG1 = (0u << 24);                                  /* filter clock = f_CK */
  HRT_FLTINCFG0 = cmp_hi | (pin_lo << 16) | (cmp_hi << 24);    /* FLT0 = CMP1 · FLT2 = PB10 · FLT3 = CMP0 */
  HRT_FLTINCFG1 |= cmp_hi | (cmp_hi << 8);                     /* FLT4 = CMP2 · FLT5 = CMP4 */
  HRT_FLTINCFG4 = (cmp_hi << 8);                               /* FLT7 = CMP7 */
  uint32_t en = BIT(0) | BIT(2) | BIT(3) | BIT(4) | BIT(5) | BIT(7);
  for (int t = 0; t < 3; t++) HRT_STFLTCTL(PFC_ST[t]) = en;
  HRT_STFLTCTL(0) = en;
  HRT_STFLTCTL(1) = en;
  HRT_INTEN = en | BIT(5);                                     /* FLTxIE + SYSFLT on IRQ76 (INTF bit 5 = SYSFLT, 6/7 = FLT5/6) */
}

void hrtimer_init(void) {
  HRT_DLLCCTL = BIT(0);                       /* one-shot DLL calibration (valid: sysclk 150–216 MHz) */
  while (!(HRT_INTF & BIT(16))) {}
  HRT_INTC = BIT(16);

  /* ---- LLC ST0/ST1: up-count, continuous, shadow, HALFM; dead time 120 ns = 207 · 578.7 ps (DTGCKDIV 0000) */
  for (int x = 0; x < 2; x++) {
    HRT_STCTL0(x) = BIT(27) | BIT(18) | BIT(5) | BIT(3) | 1u | (x ? BIT(19) : 0u);   /* SHWEN · UPRST · HALFM · CTNM · div001 · ST1: UPBST0 */
    HRT_STDTCTL(x) = (207u << 16) | (0u << 10) | (207u << 0);   /* falling/rising 120 ns, positive signs */
    HRT_STCHOCTL(x) = BIT(8) | (2u << 4) | (2u << 20);          /* DTEN · both channels' fault state = inactive */
    HRT_STCH0SET(x) = BIT(2);                                   /* set on period */
    HRT_STCH0RST(x) = BIT(3);                                   /* reset on CMP0 (= CAR/2 via HALFM) */
    HRT_STCAR(x) = (uint32_t)(LLC_FCK / 140000.0f);
  }
  HRT_STCNTRST(1) = BIT(20);                  /* ST1 restarts on ST0 CMP1: the phase-shift lag */
  HRT_STCMP1V(0) = CMPMIN;

  /* ---- Vienna ST3/4/5: center-aligned, ADC trigger at both roll-overs, control IRQ from ST3 CMP3 at mid-slope */
  for (int t = 0; t < 3; t++) {
    uint8_t x = PFC_ST[t];
    HRT_STCTL0(x) = BIT(27) | BIT(18) | BIT(3) | 1u;
    HRT_STCTL1(x) = BIT(4);                   /* CAM; ADCROVM/OUTROVM/ROVM = 00 → both ends */
    HRT_STCHOCTL(x) = (2u << 4);              /* CH0 fault state inactive; no dead time (single switch per phase) */
    HRT_STCH0SET(x) = BIT(3);                 /* CMP0 alone: high up-crossing, low down-crossing (center-aligned rule) */
    HRT_STCH0RST(x) = 0u;
    HRT_STCAR(x) = PFC_CAR;
    HRT_STCMP0V(x) = PFC_CAR;                 /* ON = 0 until the app commands */
  }
  HRT_STCMP3V(3) = PFC_CAR / 2u;              /* mid-slope: the 100 kHz control interrupt, 5 µs after each sample trigger */
  HRT_STDMAINTEN(3) = BIT(3);                 /* CMP3IE */

  /* ---- master: 10 kHz LLC control tick */
  HRT_MTCAR = MT_CAR;
  HRT_MTCREP = 0u;
  HRT_MTDMAINTEN = BIT(4);                    /* REPIE: every period */

  /* ---- ADC trigger 0 = ST3 period(s) (both roll-overs, 100 kHz); update tracked to ST3 */
  HRT_ADCTRIGS0 = BIT(27);                    /* TRG0ST3PER */
  HRT_CTL0 = (4u << 16);                      /* ADTG0USRC = ST3 update */
  HRT_ADCPSCR0 = 0u;

  fault_cfg();

  /* outputs start disabled; one write starts every counter in lock-step (all CEN bits live in MTCTL0) */
  HRT_MTCTL0 = BIT(27) | BIT(16) | BIT(17) | BIT(18) | (BIT(17) << 3) | (BIT(17) << 4) | (BIT(17) << 5) | BIT(3) | 5u;
  /*             SHWEN   MTCEN    ST0CEN    ST1CEN     ST3CEN          ST4CEN          ST5CEN          CTNM  div101 */
}

/* ---- runtime: the PFC ISR writes three ON fractions; compare shadows land at the next roll-over */
void hrtimer_pfc_apply(const app_pfc_out_t *o) {
  uint32_t en = 0u, dis = 0u;
  for (int t = 0; t < 3; t++) {
    uint8_t x = PFC_ST[t];
    uint32_t bit = BIT(2u * x);               /* STxCH0EN */
    if (!o->en || o->on[t] <= 0.0f) { dis |= bit; continue; }
    uint32_t cmp = (uint32_t)((1.0f - o->on[t]) * (float)PFC_CAR);
    if (cmp < CMPMIN) cmp = CMPMIN;
    if (cmp > PFC_CAR - CMPMIN) { dis |= bit; continue; }     /* a sliver below the minimum pulse: off this cycle */
    HRT_STCMP0V(x) = cmp;
    en |= bit;
  }
  if (dis) HRT_CHOUTDIS = dis;
  if (en) HRT_CHOUTEN = en;
}

/* ---- runtime: the LLC ISR writes frequency, phase-shift duty and the gate */
void hrtimer_llc_apply(const app_llc_out_t *o) {
  uint32_t four = BIT(0) | BIT(1) | BIT(2) | BIT(3);          /* ST0CH0/CH1 · ST1CH0/CH1 */
  if (!o->gate || o->f_hz < 1000.0f) { HRT_CHOUTDIS = four; return; }
  uint32_t car = (uint32_t)(LLC_FCK / o->f_hz);
  if (car < 2u * CMPMIN) car = 2u * CMPMIN;
  if (car > 0xFFEFu) car = 0xFFEFu;                           /* Table 25-1 max at div001 */
  uint32_t lag = (uint32_t)(o->duty * 0.5f * (float)car);
  if (lag < CMPMIN) lag = CMPMIN;
  HRT_STCAR(0) = car;
  HRT_STCAR(1) = car;
  HRT_STCMP1V(0) = lag;
  HRT_CHOUTEN = four;
}

void hrtimer_rearm(uint16_t do_bits) {
  /* clear the latched fault flags; outputs re-enable only for stages the app is commanding (STxCHyEN re-enable rule) */
  HRT_INTC = BIT(0) | BIT(2) | BIT(3) | BIT(4) | BIT(7) | BIT(8) | BIT(5) | BIT(6);
  if (do_bits & APP_DO_EN_LLC) HRT_CHOUTEN = 0xFu;
  /* the PFC phases re-enable from the next hrtimer_pfc_apply with en true */
}

uint16_t hrtimer_fault_read_clear(void) {   /* INTF fault bits → APP_FLT_ channel mask (INTF: FLT4..0 at 4:0, FLT5 6, FLT7 8) */
  uint32_t f = HRT_INTF;
  uint16_t ch = (uint16_t)((f & 0x1Fu) | ((f >> 1) & BIT(5)) | ((f >> 1) & BIT(7)));
  HRT_INTC = f & (0x1FFu);
  return ch;
}
