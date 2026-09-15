/* meas.h — E79 measurement pipeline. Portable C99, no HAL.
 *   calibration   value = gain · (counts − offset) per channel. The defaults are the drawn sense chains at nominal part values; an
 *                 EOL record replaces them, and a record outside ±10 % gain or ±150 counts offset of nominal is F.30.
 *                 Channels on AVMID (the CTs) are ratiometric to VREF; the iso-amp and divider channels are absolute, so the
 *                 internal reference corrects them (k_ref).
 *   grid monitor  per-line-cycle RMS of the phase and line voltages, the line currents and their sum; the frequency from the
 *                 hysteretic zero crossing of V_AB; the phase sequence. Published under a sequence counter: the writer (the
 *                 PFC ISR) makes it odd while writing, a reader retries until it copies an even, unchanged value.
 *   NTC · strap   the 10 k / B3435 divider through pmp_ntc_guard_c · the E24 rev G rating bands (fsm.h) */
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
typedef struct {
  float vph[3], vll[3], irms[3], isum, hz;   /* published; hz = 0 when no cycle closed inside 60 ms */
  bool abc;
  uint32_t seq;
  float a_vph[3], a_vll[3], a_i[3], a_is;    /* working state */
  uint32_t n;
  bool pos, locked;
} grid_t;
void grid_sample(grid_t *g, const float v[3], const float i[3], float fs_hz);
#endif
