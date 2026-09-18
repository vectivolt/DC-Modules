/* meas.c — see meas.h. */
#include "meas.h"
#include "../core/fsm.h"
#include <math.h>
#include <string.h>

#define LSB (3.3f / 4096.0f)

static float clampf(float x, float lo, float hi) { return x < lo ? lo : (x > hi ? hi : x); }

void meas_cal_default(meas_cal_t *c, uint16_t kw) {
  float rb = (kw == 50u) ? 13.0f : (kw == 40u) ? 18.0f : 22.0f;            /* line CT burden */
  float rr = (kw == 50u) ? 0.30f : (kw == 40u) ? 0.36f : 0.47f;            /* resonant CT burden */
  float rs = (kw == 50u) ? 0.299e-3f : (kw == 40u) ? 0.376e-3f : 0.500e-3f; /* output shunt, 50 mV at the rated code */
  /* The AMC1311's OUTP common mode is 1.44 V TYPICAL (1.39 V is its minimum); 1.39 V here reads every DC channel 56 V
     high on an uncalibrated card (0.05 V × 2 × 559.8). EOL calibration replaces the pair. */
  meas_ch_t dc = { 2.0f * LSB * (3.8e6f + 6.8e3f) / 6.8e3f, 1.44f / LSB };   /* AMC1311 class: OUTP = 1.44 V + Vin/2 · 8×475 k / 6.8 k */
  /* AMC1350 differential gain is 0.40 (single-ended slope 0.200, not 0.205), and its ~1.25 MΩ input loads the 11.5 k
     divider bottom to 11.396 k — get either wrong and the nominal reads the line 3.3 % low */
  float rac = 11.5e3f * 1.25e6f / (11.5e3f + 1.25e6f);
  meas_ch_t ac = { LSB / 0.200f * (3.8e6f + rac) / rac, 1.44f / LSB };       /* AMC1350 class: OUTP = 1.44 V + 0.40·Vin/2 · loaded divider */
  for (int k = MCH_IA; k <= MCH_IC; k++) c->ch[k] = (meas_ch_t){ LSB * 2500.0f / rb, 2048.0f };
  c->ch[MCH_IRES] = (meas_ch_t){ LSB * 100.0f / rr, 2048.0f };
  c->ch[MCH_VBUS] = c->ch[MCH_VMID] = c->ch[MCH_VOUT] = c->ch[MCH_VBKA] = c->ch[MCH_VBKB] = dc;
  for (int k = MCH_VAC1; k <= MCH_VAC3; k++) c->ch[k] = ac;
  c->ch[MCH_IOUT] = (meas_ch_t){ LSB / 8.0f / rs, 0.0f };   /* SNS_IOUT − SNS_IOUTN, gain 8; positive = delivering */
  c->ch[MCH_V24] = (meas_ch_t){ LSB * 9.2f, 0.0f };         /* 82 k / 10 k */
  c->ch[MCH_V15] = (meas_ch_t){ LSB * 5.7f, 0.0f };         /* 47 k / 10 k */
  c->vrefint_v = 1.20f;
}

bool meas_cal_plausible(const meas_cal_t *c, uint16_t kw) {
  meas_cal_t d; meas_cal_default(&d, kw);
  for (int k = 0; k < MCH_COUNT; k++) {
    float g = c->ch[k].gain, g0 = d.ch[k].gain, o = c->ch[k].off;
    if (!isfinite(g) || !isfinite(o) || fabsf(g - g0) > 0.1f * fabsf(g0) || fabsf(o - d.ch[k].off) > 150.0f) return false;
  }
  return isfinite(c->vrefint_v) && c->vrefint_v > 1.10f && c->vrefint_v < 1.30f;
}

float meas_ntc_c(float frac) {
  float x = fmaxf(fminf(isfinite(frac) ? frac : 1.0f, 0.999f), 0.001f);
  float t = 1.0f / (1.0f / 298.15f + logf(x / (1.0f - x)) / 3435.0f) - 273.15f;   /* R/10 k = x/(1−x) against the 10 k pull-up */
  return pmp_ntc_guard_c(t, isfinite(frac) ? frac : 1.0f);   /* a shorted sensor reads > 200 °C: out of range, F.29 */
}

uint16_t meas_rating_kw(float v, bool *liquid) {
  *liquid = false;
  if (!isfinite(v) || v < 0.0f) return 0u;
  if (v < 0.15f) return 30u;
  if (v < 0.55f) return 40u;
  if (v < 1.24f) return 0u;                          /* 3.32 k: reserved */
  if (v < 1.82f) { *liquid = true; return 50u; }
  if (v < 2.30f) return 50u;
  return 0u;                                         /* the open strap, or the 2.30–2.40 V gap between bands */
}

void grid_sample(grid_t *g, const float v[3], const float i[3], float fs) {
  float ll[3] = { v[0] - v[1], v[1] - v[2], v[2] - v[0] }, is = i[0] + i[1] + i[2];
  for (int k = 0; k < 3; k++) { g->a_vph[k] += v[k] * v[k]; g->a_vll[k] += ll[k] * ll[k]; g->a_i[k] += i[k] * i[k]; }
  for (int k = 0; k < 3; k++) { g->a_dcv[k] += v[k]; g->a_dci[k] += i[k]; }   /* the same cycle's linear sums */
  g->a_is += is * is;
  g->n++;
  bool up = false;
  if (g->pos) { if (ll[0] < -GRID_HYS_V) g->pos = false; }
  else if (ll[0] > GRID_HYS_V) { g->pos = true; up = true; }
  bool relock = up && !g->locked;                              /* the first crossing after a timeout opens a cycle */
  bool cycle = up && g->locked && (float)g->n >= fs / 70.0f;   /* a second crossing inside 14 ms is noise: the cycle goes on */
  bool timeout = (float)g->n >= fs * 0.06f;                    /* 60 ms without a crossing: no line, or below 17 Hz */
  if (!relock && !cycle && !timeout) return;
  if (!relock) {                         /* publish the closed cycle, or the timeout with hz = 0 */
    float inv = 1.0f / (float)g->n;
    float hz = cycle ? fs * inv : 0.0f;
    /* a clean cycle also advances the DC estimate. "Clean" is a locked 45–65 Hz cycle whose per-phase current
       rms has not moved by more than a quarter — the one test that also catches a clamp, a skip or a burst starting or
       ending inside the cycle, because that is precisely what moves the rms. Note this runs BEFORE the rms is republished,
       so g->irms still holds the previous cycle's. */
    bool clean = cycle && hz > 45.0f && hz < 65.0f;
    for (int k = 0; k < 3; k++) {
      float ir = sqrtf(g->a_i[k] * inv);
      if (fabsf(ir - g->irms[k]) > 0.25f * fmaxf(fmaxf(ir, g->irms[k]), 1.0f)) clean = false;
    }
    g->seq++;
    __asm__ volatile ("" ::: "memory");   /* the published stores stay between the two seq writes (C11 orders volatile against volatile only) */
    for (int k = 0; k < 3; k++) { g->vph[k] = sqrtf(g->a_vph[k] * inv); g->vll[k] = sqrtf(g->a_vll[k] * inv); g->irms[k] = sqrtf(g->a_i[k] * inv); }
    g->isum = sqrtf(g->a_is * inv);
    g->hz = hz;
    if (cycle) g->abc = ll[1] < 0.0f;   /* at V_AB's rising crossing V_BC is negative in sequence A-B-C */
    if (clean) {
      /* the common part of the three voltage means is the reference moving, not the line (meas.h): the median of three,
         blind to one broken channel, goes to dcc; each channel keeps only its own residual */
      float m[3];
      for (int k = 0; k < 3; k++) m[k] = g->a_dcv[k] * inv;
      float c = fmaxf(fminf(m[0], m[1]), fminf(fmaxf(m[0], m[1]), m[2]));
      g->dcc = clampf(g->dcc + (c - g->dcc) * GRID_DC_KV, -GRID_DC_C_MAX, GRID_DC_C_MAX);
      for (int k = 0; k < 3; k++) {
        g->dcv[k] = clampf(g->dcv[k] + (m[k] - c - g->dcv[k]) * GRID_DC_KV, -GRID_DC_V_MAX, GRID_DC_V_MAX);
        g->dci[k] = clampf(g->dci[k] + (g->a_dci[k] * inv - g->dci[k]) * GRID_DC_KI, -GRID_DC_I_MAX, GRID_DC_I_MAX);
      }
    }
    __asm__ volatile ("" ::: "memory");
    g->seq++;
  }
  memset(g->a_vph, 0, sizeof g->a_vph); memset(g->a_vll, 0, sizeof g->a_vll); memset(g->a_i, 0, sizeof g->a_i);
  memset(g->a_dcv, 0, sizeof g->a_dcv); memset(g->a_dci, 0, sizeof g->a_dci);
  g->a_is = 0.0f; g->n = 0u;
  g->locked = up;                        /* a crossing (re)starts a cycle; a timeout waits for the next one */
}
