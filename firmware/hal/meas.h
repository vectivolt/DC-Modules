/* meas.h — the measurement pipeline. Portable C99, no HAL.
 *   calibration   value = gain · (counts − offset) per channel. The defaults are the drawn sense chains at nominal part values; an
 *                 EOL record replaces them, and a record outside ±10 % gain or ±150 counts offset of nominal is F.30.
 *                 Channels on AVMID (the CTs) are ratiometric to VREF; the iso-amp and divider channels are absolute, so the
 *                 internal reference corrects them (k_ref).
 *   grid monitor  per-line-cycle RMS of the phase and line voltages, the line currents and their sum; the frequency from the
 *                 hysteretic zero crossing of V_AB; the phase sequence. Published under a sequence counter: the writer (the
 *                 PFC ISR) makes it odd while writing, a reader retries until it copies an even, unchanged value.
 *   NTC · strap   the 10 k / B3435 divider through pmp_ntc_guard_c · the rating bands (fsm.h) */
#ifndef PMP_MEAS_H
#define PMP_MEAS_H
#include <stdbool.h>
#include <stdint.h>

enum { MCH_IA = 0, MCH_IB, MCH_IC, MCH_IRES,           /* ratiometric (AVMID) */
       MCH_VBUS, MCH_VMID, MCH_VAC1, MCH_VAC2, MCH_VAC3, MCH_VOUT, MCH_IOUT, MCH_VBKA, MCH_VBKB, MCH_V24, MCH_V15,
       MCH_COUNT };
#define MCH_RATIO_LAST MCH_IRES

typedef struct { float gain, off; } meas_ch_t;
typedef struct { meas_ch_t ch[MCH_COUNT]; float vrefint_v; } meas_cal_t;

void meas_cal_default(meas_cal_t *c, uint16_t rating_kw);
bool meas_cal_plausible(const meas_cal_t *c, uint16_t rating_kw);
/* k_ref = actual VREF / 3.3 V (1 until the internal reference has been read) */
static inline float meas_val(const meas_cal_t *c, int ch, float counts, float k_ref) {
  return (ch <= MCH_RATIO_LAST) ? c->ch[ch].gain * k_ref * (counts - c->ch[ch].off) : c->ch[ch].gain * (k_ref * counts - c->ch[ch].off);
}
float meas_ntc_c(float frac);                      /* frac = counts / 4095 */
uint16_t meas_rating_kw(float volts, bool *liquid); /* 30 · 40 · 50, or 0 for no host / the reserved band */

#define GRID_HYS_V 20.0f
/* The per-line-cycle DC estimate the PFC current loop subtracts before it acts. The Vienna's current loop is
   P-only, so any DC the modulator is asked to produce is opposed by the line resistance ALONE (tens of mΩ) — and the line
   CTs pass nothing below ≈ 1 Hz, so the loop cannot even see the result. Both forcing terms are measurement offsets: a
   differential offset on the three SNS_VAC channels (1 LSB = 1.35 V of line — the AC chains use 14 % of the ADC span, and
   VAC1/2 sit on ADC1 against VAC3 on ADC3, so their offsets do not cancel) and a residual offset on a CT channel after the
   boot window. Both are removable for free: the true mean of a 3-wire phase-voltage set is zero, and the true mean of a
   line current is zero, so the measured mean of each IS its channel's offset.
   The estimate is slow (≈ 1 s, GRID_DC_K per cycle) and frozen on any cycle that is not a clean locked 45–65 Hz cycle whose
   rms did not move — a clamp entering or leaving mid-cycle is exactly what moves rms, so that one test covers it. The bands
   are wide enough for every plausible residual and far too narrow to absorb a broken channel, which still reaches F.29
   through isum and the boot window (both of which stay on the RAW samples).
   The three phase-voltage means are first split into their COMMON part and each channel's residual. The line cannot put a
   common DC on a 3-wire set (the phase-to-star voltages sum to zero at the resistive star, whatever the weights), so a common
   part is measurement only: the ADC reference moving against the three isolators' 1.44 V output common mode. It is
   published as dcc — the live reference tracker's input (app.c k_track) — with its own wider clamp (2 % of the 1.44 V
   common mode's line-equivalent); the median of three keeps one broken channel out of it. Only the residual is a channel's
   own offset (dcv). */
/* Two rates, because the two means are not equally trustworthy. The phase voltages' true mean is zero by physics at every
   instant, whatever the line or the load is doing, so that estimate can be quick. The line currents' mean is only the
   channel's offset once the CT has finished passing whatever real DC is present (its magnetizing pole is 0.2–1 s), so that
   one must be slower than the voltage estimate — otherwise it learns the DC the voltage offset is still producing and the
   two chase each other for seconds. */
#define GRID_DC_KV    0.25f  /* per closed cycle → τ ≈ 80 ms at 50 Hz (the sensed phase voltages) */
#define GRID_DC_KI    0.03f   /* per closed cycle → τ ≈ 0.7 s at 50 Hz (the CT channels) */
#define GRID_DC_V_MAX 15.0f   /* V — ≈ 11 LSB of SNS_VAC, per channel after the common part is removed */
#define GRID_DC_C_MAX 48.0f   /* V — the common part: 2 % of the AC chain's 1.44 V common mode (2 408 V line-equivalent) */
#define GRID_DC_I_MAX 1.6f    /* A — 2 % of the smallest SKU's i_clamp (80.8 A); ≈ 17 LSB on the 30 kW CT chain */
typedef struct {
  float vph[3], vll[3], irms[3], isum, hz;   /* published; hz = 0 when no cycle closed inside 60 ms */
  float dcv[3], dci[3], dcc;                 /* published DC estimate of the sensed phase voltages and line currents; dcc = the
                                                common part of the three voltage means (the reference tracker's input) */
  bool abc;
  uint32_t seq;
  float a_vph[3], a_vll[3], a_i[3], a_is;    /* working state */
  float a_dcv[3], a_dci[3];                  /* the same cycle's LINEAR sums */
  uint32_t n;
  bool pos, locked;
} grid_t;
void grid_sample(grid_t *g, const float v[3], const float i[3], float fs_hz);
#endif
