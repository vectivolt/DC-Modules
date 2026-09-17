/* hrtimer.c — E80 the switching engine (facts-hrtimer.md; UM chapter 25). E81: adaptive dead time, E81 pin swap, F-D-2/3/12.
 *   LLC   ST0 = leg A (CH0/CH1 complementary, adaptive dead time), ST1 = leg B. Up-counting, HALFM (CMP0 = CAR/2): CH0 set on
 *         period, reset on CMP0 → 50 % square. ST1's counter resets on ST0's CMP1 (STxCNTRST bit 20), so ST0CMP1 = the leg-B
 *         lag = duty · CAR/2 counts (phase-shift modulation). CAR sets the frequency: f = 3.456 GHz / CAR (CNTCKDIV = 001).
 *         Shadow updates land on ST0's roll-over and ST1 updates with ST0 (UPBST0), so both legs re-time on the same cycle.
 *   PFC   ST3/4/5 = phases A/B/C, center-aligned (CAM), 50 kHz: CAR = 34560, counter 0→CAR→0. One compare (CMP0) in the SET
 *         crossbar makes the symmetric pulse: high on the up-crossing, low on the down-crossing (UM center-aligned set/reset
 *         rule), so ON fraction = (CAR − CMP0)/CAR around the peak — the hal_test carrier exactly. ADC trigger at BOTH
 *         roll-overs (ADCROVM = 00) = 100 kHz regular sampling; the sample set is read one update later and the duty lands
 *         at the next roll-over — the one-update transport delay the law models.
 *   E82 (M-21) THE CONTROL INTERRUPT IS THE ADC RING'S END OF SEQUENCE, NOT A TIMER COMPARE (adc.c CTL_DMACH).
 *         The real deadline is not the 10 µs update period: the compare SHADOWS load at the next roll-over, so everything
 *         the ISR does must finish before it. ST3 CMP3 at CAR/2 fired 5 µs after each trigger and the measured worst-case
 *         PFC ISR is 4.6–6.1 µs — it could miss, landing the duty one half-period late, with jitter.
 *         CMP3 could NOT simply be moved earlier. With the counter at 0 at t=0, CAR at t=10 µs and 0 at t=20 µs, a compare
 *         c is crossed on the up slope at 10·c/CAR and on the down slope at 20 − 10·c/CAR: the delay after the two triggers
 *         is 10·c/CAR and 10 − 10·c/CAR, EQUAL ONLY AT c = CAR/2. Any earlier constant alternates (3 µs / 7 µs at 0.3·CAR)
 *         — a 100 kHz jitter on the sample-to-apply path, which is worse than the tight budget it buys.
 *         The ADC sequences finish 2.51–2.82 µs after the trigger, so the longest ring's DMA half/full-transfer flag is a
 *         symmetric 100 kHz event ≈ 7.2 µs before the roll-over. The sampling instants and the transport delay are
 *         UNCHANGED — the trigger, the shadow update and the law's 15 µs model all stay as they were.
 *   LLC tick  the master timer runs at 10 kHz (CNTCKDIV = 101 → CAR = 21600) and its repetition interrupt is the LLC control
 *         ISR; master CMP0 feeds ADCTRIG1 (reserved for slower sequences if a port build wants a second rate).
 *   Faults  Table 25-21: FLT0 ← CMP1 (I_B0) · FLT1 ← CMP3 (I_A0, E81 pin swap) · FLT2 ← PB10 pin (wire-OR, active LOW) ·
 *         FLT3 ← CMP0 (VOUT) · FLT4 ← CMP2 (I_C0) · FLT5 ← CMP4 (VBUS). Every channel kills every power timer
 *         (CHxFLTOS = inactive), FLTAR = 0 (latched); re-arm = software re-enable of the commanded outputs, per channel
 *         (E81 F-E-11). IRQ76 attributes the channel to the app. */
#include "port.h"

#define LLC_FCK   3456000000.0f   /* ST0/ST1 counter clock, CNTCKDIV = 001 (289.35 ps) */
#define PFC_CAR   34560u          /* 50 kHz center-aligned at CNTCKDIV = 001: CAR = f_PSC / (2 · 50 kHz) */
#define MT_CAR    21600u          /* 10 kHz master at CNTCKDIV = 101 (216 MHz) */
#define CMPMIN    0x30u           /* Table 25-1 minimum compare/period at CNTCKDIV = 001 */
/* E81: the dead-time generator moves to DTGCKDIV = 0010 (f_DTGCK = 8·f_HRTIMER_CK/4 = 432 MHz → 2.3148 ns per step,
   UM §25.5.2 HRTIMER_STxDTCTL). 9 writable bits → 511 steps = 1.183 µs, against 296 ns on the DTGCKDIV 0000 this carried.
   The E81 adaptive schedule needs the range: a start into a deeply discharged pack has almost no magnetizing current and
   asks for hundreds of ns to a microsecond of ZVS transition (C-sic-thermal §SNUBBER SWEEP). Resolution is still far finer
   than the tank cares about. The schedule itself is clamped to llc.h's [60 ns, 900 ns]. */
#define DT_DIV    2u
#define DT_STEP_S 2.3148148e-9f
#define DT_MAX    388u            /* 898.1 ns — the llc.h ceiling */
/* E82 (M-15/T-12): the floor is 120 ns, not 60. The NSI66x1A's propagation delay is specified 70 ns min / 80 ns typ /
   110 ns max with NO part-to-part matching figure, so the two drivers of one leg can differ by up to 40 ns; R_g,off 0 Ω
   against R_g,on 4.7 Ω adds device-level asymmetry worth ≈ 20 ns. A 60 ns programmed dead time does not survive that.
   Keep this in step with llc.h's LLC_DT_MIN_S — e81_test.c asserts both. */
#define DT_MIN    52u             /* 120.4 ns — the llc.h floor */

static const uint8_t PFC_ST[3] = { 3u, 4u, 5u };

static void dac_write(uint8_t inst, uint8_t out, uint16_t counts) {
  if (out) DAC_R12DH1(inst) = counts; else DAC_R12DH0(inst) = counts;
}

/* E81 (reviewer I §7 pin swap): I_A0 moved PC2 → PB0, so phase A's trip is CMP3 (CMP3PSEL 0 = PB0, UM §19.4.6) instead of
 * CMP7. CMP3's only internal-DAC references are DAC2_OUT1 (MSEL 100) and DAC0_OUT0 (MSEL 101); DAC0_OUT0 belongs to CMP0/VOUT
 * and CMP0/CMP2 between them own both of {DAC2_OUT0, DAC0_OUT0}, so CMP3 must take DAC2_OUT1, I_B0/CMP1 moves to its other
 * option DAC0_OUT1 (MSEL 101), and the HW-REC-1 clamp value moves to DAC3_OUT1 — freed by CMP7 leaving. Five independent
 * thresholds, no sharing.
 * E82 (C-02): every comparator here is non-inverting (CMPxPL = 0, UM §19.4 "0: Output is not inverted") into a fault input
 * configured ACTIVE HIGH, so a threshold BELOW the 1.65 V AVMID rest level is asserted during normal operation. E81's
 * bipolar F.01 wrote exactly such a threshold whenever a phase current went negative and would have latched a hardware
 * fault within one line half-cycle of every boot. The line-OC references are POSITIVE-ONLY again; the negative half is
 * app.c's 100 kHz software |i| trip, and a genuine negative fault of 2·I_trip or more still reaches a comparator through
 * Σi = 0 on the other two phases. cmpdac_thresholds() below is the ONLY writer of these DACs, from the 1 ms tick.
 * E81 allocation: CMP3/I_A0 ← DAC2_OUT1 · CMP1/I_B0 ← DAC0_OUT1 · CMP2/I_C0 ← DAC2_OUT0 · CMP4/VBUS ← DAC3_OUT0 ·
 * CMP0/VOUT ← DAC0_OUT0 (MODE = 011 keeps PA4/PA5 analog) · the HW-REC-1 clamp value ← DAC3_OUT1 */
void cmpdac_init(void) {
  DAC_MDCR(0) = (3u << 16) | 3u;             /* DAC0 both outputs buffer-off, peripherals only */
  DAC_CTL0(0) = BIT(16) | BIT(0);
  DAC_CTL0(2) = BIT(16) | BIT(0);            /* DAC2/DAC3 are pin-less 15 MSPS converters */
  DAC_CTL0(3) = BIT(16) | BIT(0);
  delay_us(3u);                              /* t_WAKEUP */
  /* CS: PSEL bit 20 · MSEL 18:16 · HST 001 (10 mV) · EN. Sources per facts-hrtimer §9 / UM §19.4.3–19.4.10. */
  CMP_CS(0) = (0u << 20) | (5u << 16) | (1u << 8) | 1u;   /* PA1 vs DAC0_OUT0 */
  CMP_CS(1) = (1u << 20) | (5u << 16) | (1u << 8) | 1u;   /* PA3 vs DAC0_OUT1 (E81) */
  CMP_CS(2) = (1u << 20) | (4u << 16) | (1u << 8) | 1u;   /* PC1 vs DAC2_OUT0 */
  CMP_CS(3) = (0u << 20) | (4u << 16) | (1u << 8) | 1u;   /* PB0 vs DAC2_OUT1 (E81: phase A) */
  CMP_CS(4) = (0u << 20) | (4u << 16) | (1u << 8) | 1u;   /* PB13 vs DAC3_OUT0 */
}

void cmpdac_thresholds(const float dac_v[APP_DAC_COUNT]) {
  static const struct { uint8_t inst, out; } M[APP_DAC_COUNT] = {
    { 2, 1 },  /* APP_DAC_IA  → DAC2_OUT1 (CMP3, E81) */
    { 0, 1 },  /* APP_DAC_IB  → DAC0_OUT1 (CMP1, E81) */
    { 2, 0 },  /* APP_DAC_IC  → DAC2_OUT0 (CMP2) */
    { 3, 0 },  /* APP_DAC_VBUS → DAC3_OUT0 (CMP4) */
    { 0, 0 },  /* APP_DAC_VOUT → DAC0_OUT0 (CMP0) */
    { 3, 1 },  /* APP_DAC_CLAMP → DAC3_OUT1 (E81: freed by CMP7; comparator routing lands with the HW-REC-1 decision) */
  };
  for (int k = 0; k < APP_DAC_COUNT; k++) {
    float v = dac_v[k] * (4096.0f / 3.3f);
    uint16_t c = v <= 0.0f ? 0u : v >= 4095.0f ? 4095u : (uint16_t)v;
    dac_write(M[k].inst, M[k].out, c);
  }
}

static void fault_cfg(void) {
  /* FLTFDIV first, then per-channel {FC filter 8 samples · SRC0 · polarity · EN}; INSRC[1] bits stay 0 (codes 00 pin, 01 CMP) */
  /* E81 (F-D-3): FC = 0b0011 = 8 samples at f_CK (216 MHz) = 37 ns. The 0b1111 this carried was f_CK/32 → 1.19 µs, 32× the
     comment and past the F.11 "< 1 µs" row (UM §25.5.3 FLT0INFC: 0011 → fSAMP = fHRTIMER_CK, N = 8). */
  uint32_t cmp_hi = (0x3u << 3) | BIT(2) | BIT(1) | BIT(0);   /* SRC0 = 1 (internal CMP) · active HIGH · filtered · EN */
  uint32_t pin_lo = (0x3u << 3) | (0u << 2) | (0u << 1) | BIT(0);   /* PB10 wire-OR: pin source, active LOW */
  HRT_FLTINCFG1 = (0u << 24);                                  /* filter clock = f_CK */
  HRT_FLTINCFG0 = cmp_hi | (cmp_hi << 8) | (pin_lo << 16) | (cmp_hi << 24);   /* FLT0 = CMP1 · FLT1 = CMP3 · FLT2 = PB10 · FLT3 = CMP0 */
  HRT_FLTINCFG1 |= cmp_hi | (cmp_hi << 8);                     /* FLT4 = CMP2 · FLT5 = CMP4 */
  uint32_t en = BIT(0) | BIT(1) | BIT(2) | BIT(3) | BIT(4) | BIT(5);
  for (int t = 0; t < 3; t++) HRT_STFLTCTL(PFC_ST[t]) = en;
  HRT_STFLTCTL(0) = en;
  HRT_STFLTCTL(1) = en;
  /* E81 (F-D-2): HRTIMER_INTEN does NOT share STxFLTCTL's bit map — UM §25.5.3 puts SYSFLTIE at bit 5 and pushes FLT5/6/7 to
     6/7/8. Reusing the STxFLTCTL mask left FLT5IE (bus OVP) clear, so F.03 never raised IRQ76 and hrtimer_pfc_apply re-armed
     the outputs every 10 µs. The decoder below and hrtimer_rearm() use the same INTF map. */
  HRT_INTEN = BIT(0) | BIT(1) | BIT(2) | BIT(3) | BIT(4) | BIT(5) /* SYSFLT */ | BIT(6) /* FLT5 */;
  /* E82 (D-09): freeze the six fault inputs. FLTxINPROT is bit 7 of each channel's byte (UM §25.5.3: PROT 7 · FC 6:3 ·
     SRC0 2 · P 1 · EN 0) and is write-once — "this bit-field cannot be modified when FLTxINPROT has been programmed".
     The hardware protection layer exists because firmware can be wrong, so the firmware must not be able to unarm it:
     nothing after this point has any business rewriting a fault source, polarity or filter. hrtimer_rearm() clears INTF
     and re-enables outputs, which these bits do not touch. STxFLTCTL is deliberately left writable — see NOTES. */
  HRT_FLTINCFG0 |= BIT(7) | BIT(15) | BIT(23) | BIT(31);
  HRT_FLTINCFG1 |= BIT(7) | BIT(15);
}

void hrtimer_init(void) {
  HRT_DLLCCTL = BIT(0);                       /* one-shot DLL calibration (valid: sysclk 150–216 MHz) */
  while (!(HRT_INTF & BIT(16))) {}
  HRT_INTC = BIT(16);

  /* ---- LLC ST0/ST1: up-count, continuous, shadow, HALFM; E81 adaptive dead time on DTGCKDIV = 0010 */
  for (int x = 0; x < 2; x++) {
    HRT_STCTL0(x) = BIT(27) | BIT(18) | BIT(5) | BIT(3) | 1u | (x ? BIT(19) : 0u);   /* SHWEN · UPRST · HALFM · CTNM · div001 · ST1: UPBST0 */
    HRT_STDTCTL(x) = (DT_MAX << 16) | (DT_DIV << 10) | (DT_MAX << 0);   /* falling/rising at the ceiling, positive signs */
    HRT_STCHOCTL(x) = BIT(8) | (2u << 4) | (2u << 20);          /* DTEN · both channels' fault state = inactive */
    /* E81 (F-D-12): set on counter RESET or period. ST1's counter is reset by ST0 CMP1 on the same edge it would roll over,
       so a period-only set can be pre-empted and leg B never turns on again — DC across the transformer primary. */
    HRT_STCH0SET(x) = BIT(1) | BIT(2);                          /* set on reset OR period */
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
  /* E82 (M-21): ST3 CMP3 and its interrupt are gone — the control ISR is adc.c's CTL_DMACH end-of-sequence (header) */

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

/* ---- runtime: the LLC ISR writes frequency, phase-shift duty, the ZVS dead time and the gate */
void hrtimer_llc_apply(const app_llc_out_t *o) {
  uint32_t four = BIT(0) | BIT(1) | BIT(2) | BIT(3);          /* ST0CH0/CH1 · ST1CH0/CH1 */
  /* E81 (F-C-7): the adaptive dead time llc_step solved for this operating point, both edges, both legs, both signs positive */
  /* E81 per-leg: ST0 = leg A, ST1 = leg B (llc.h dead_a_s / dead_b_s); a zero falls back to the common value */
  float da = (o->dead_a_s > 0.0f) ? o->dead_a_s : o->dead_s, db = (o->dead_b_s > 0.0f) ? o->dead_b_s : o->dead_s;
  uint32_t dta = (uint32_t)(da / DT_STEP_S), dtb = (uint32_t)(db / DT_STEP_S);
  if (!(da > 0.0f) || dta > DT_MAX) dta = DT_MAX;
  if (!(db > 0.0f) || dtb > DT_MAX) dtb = DT_MAX;
  if (dta < DT_MIN) dta = DT_MIN;
  if (dtb < DT_MIN) dtb = DT_MIN;
  HRT_STDTCTL(0) = (dta << 16) | (DT_DIV << 10) | dta;
  HRT_STDTCTL(1) = (dtb << 16) | (DT_DIV << 10) | dtb;
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

/* E81 (F-E-11): ch_mask is an APP_FLT_ channel mask, not "everything" — the E73 bypass-closure blank re-arms F.01's three
   line-OC channels 60 times, and clearing F.03/F.13 with it would undo a hardware latch the blank has nothing to do with. */
void hrtimer_rearm(uint16_t do_bits, uint16_t ch_mask) {
  uint32_t f = (uint32_t)(ch_mask & 0x1Fu) | ((uint32_t)(ch_mask & BIT(5)) << 1);   /* channels → INTF bits (FLT5 at 6) */
  HRT_INTC = f;
  if (do_bits & APP_DO_EN_LLC) HRT_CHOUTEN = 0xFu;
  /* the PFC phases re-enable from the next hrtimer_pfc_apply with en true */
}

uint16_t hrtimer_fault_read_clear(void) {   /* INTF fault bits → APP_FLT_ channel mask (INTF: FLT4..0 at 4:0, FLT5 at 6) */
  uint32_t f = HRT_INTF;
  uint16_t ch = (uint16_t)((f & 0x1Fu) | ((f >> 1) & BIT(5)));
  HRT_INTC = f & (0x1FFu);
  return ch;
}
