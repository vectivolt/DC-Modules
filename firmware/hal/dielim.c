/* dielim.c — see dielim.h. */
#include "dielim.h"
#include <math.h>

void dielim_cfg_default(dielim_cfg_t *c, uint16_t kw, bool liquid) {
  c->rth_kpw = liquid ? 0.65f : 0.80f;                                  /* mount.mjs MOUNT */
  c->llc_rds25 = 0.023f;                                                /* tanks.mjs DIES["23m"].rds */
  c->llc_koff = (kw == 50u) ? 4.0e-9f : (kw == 40u) ? 5.3e-9f : 3.4e-9f;   /* tanks.mjs koff */
  c->llc_cs_f = (kw == 50u) ? 1000.0e-12f : (kw == 40u) ? 680.0e-12f : 330.0e-12f;   /* tanks.mjs cs */
  c->llc_qoss800_c = 371.0e-9f;                                         /* tanks.mjs DIES["23m"].qoss800 — the RFQ bound (llc.c) */
  c->llc_par = (kw == 30u) ? 1u : 2u;
  /* weak-leg residual / link against gain M, at the programmed dead times. Deck anchors (llc-stress.csv Vres_A, 30 / 40 / 50 kW):
     PS150 at 650 V, M 0.46: 0.45 / 0.60 / 0.60 · PAR200, M 0.62: 0.19 / 0.40 / 0.41 · SER250 at 764 V, M 0.65: 0.11 /
     0.30 / 0.30 · PAR250, M 0.77: 0. The independent switched model agrees inside ten points and adds 0.63 at M 0.41
     (PS150 on a 725 V link, 50 kW). The lines below sit 0.02–0.12 above every one of them. */
  c->wl_m0 = (kw == 30u) ? 0.74f : 0.83f;
  c->wl_slope = (kw == 30u) ? 1.90f : 1.95f;
  c->pfc_rds25 = (kw == 50u) ? 0.010f : (kw == 40u) ? 0.015f : 0.020f;  /* envelope-grid.mjs SKUS[].rdsP */
  c->pfc_ksw = 20.0e-9f;                                                /* ≥ the DPT finals' mean on every SKU (18.1–19.4 nJ) */
  c->pfc_fsw_hz = 50.0e3f;
}

void dielim_reset(dielim_t *d) { d->tj_llc = d->tj_pfc = NAN; d->declined = false; }

static float rds_at(float r25, float tj_c) {
  float t = (isfinite(tj_c) && tj_c > 25.0f) ? fminf(tj_c, 175.0f) : 25.0f;
  return r25 * (1.0f + DIELIM_RDS_TC * (t - 25.0f));
}

float dielim_llc_w(const dielim_cfg_t *c, float v_bank, float v_bus, float f_hz, float duty, float i_tank, bool running, float tj_c) {
  if (!running || !(isfinite(v_bus) && v_bus > 1.0f && isfinite(f_hz) && f_hz > 1.0e3f && isfinite(duty)) || c->llc_par == 0u) return 0.0f;
  float par = (float)c->llc_par, i = (isfinite(i_tank) && i_tank > 0.0f) ? i_tank : 0.0f;
  float cond = i * i * rds_at(c->llc_rds25, tj_c) / (2.0f * par * par);      /* (I/√2/par)²·R per die */
  bool psm = duty < 1.0f;
  /* leg B (both legs in PFM): turn-off k_off·V·k_I·I·f shared by the position's dies — 1.2·I_rms above resonance,
     the tank peak ≈ 1.6·I_rms on the shifted leg */
  float w_b = cond + c->llc_koff * v_bus * (psm ? 1.6f : 1.2f) * i * f_hz / par;
  if (!psm) return w_b;
  /* leg A in phase shift: hard turn-on against the residual the leg could not swing — Q_oss(V_r)·V_r + C_s·V_r² per die
     and per period, whatever the load (the RFQ-bound charge, 1.64 × the proxy's, is the margin on the energy) */
  float m = 2.0f * fmaxf(isfinite(v_bank) ? v_bank : 0.0f, 0.0f) / v_bus;
  float r = c->wl_slope * (c->wl_m0 - m);
  if (!(r > 0.0f)) return w_b;
  float vr = fminf(r, 1.0f) * v_bus;
  float w_a = cond + f_hz * (c->llc_qoss800_c * sqrtf(vr * 0.00125f) * vr + c->llc_cs_f * vr * vr);
  return fmaxf(w_a, w_b);
}

float dielim_pfc_w(const dielim_cfg_t *c, float vin_ll, float v_bus, float i_line_rms, bool running, float tj_c) {
  if (!running || !(isfinite(vin_ll) && vin_ll > 50.0f && isfinite(v_bus) && v_bus > 100.0f && isfinite(i_line_rms))) return 0.0f;
  /* the switch carries the line current for (1 − m·|sin θ|) of each carrier period, m = V̂_phase / (V_bus/2):
     I_sw,rms² = Î²·(1/2 − 4m/(3π)); switching k_sw·(V_bus/2)·(2/π)·Î·f_sw — both in the line crest Î */
  float ipk = 1.41421f * fmaxf(i_line_rms, 0.0f);
  float m = fminf(vin_ll * 0.81650f / (0.5f * v_bus), 1.0f);
  return ipk * ipk * rds_at(c->pfc_rds25, tj_c) * fmaxf(0.5f - 0.42441f * m, 0.02f)
       + c->pfc_ksw * 0.5f * v_bus * 0.63662f * ipk * c->pfc_fsw_hz;
}

static float track(float tj, float w, float t_base, float rth, float dt) {
  if (!(isfinite(w) && isfinite(t_base))) return tj;
  float tgt = t_base + rth * w;
  return isfinite(tj) ? tj + (tgt - tj) * fminf(dt / DIELIM_TAU_S, 1.0f) : t_base;   /* first call: the die sits on its base */
}

float dielim_step(dielim_t *d, const dielim_cfg_t *c, float w_llc, float t_llc, float w_pfc, float t_pfc, float dt) {
  d->tj_llc = track(d->tj_llc, w_llc, t_llc, c->rth_kpw, dt);
  d->tj_pfc = track(d->tj_pfc, w_pfc, t_pfc, c->rth_kpw, dt);
  float tj = fmaxf(isfinite(d->tj_llc) ? d->tj_llc : -60.0f, isfinite(d->tj_pfc) ? d->tj_pfc : -60.0f);
  float fold = (tj - (DIELIM_TJ_C - DIELIM_BAND_K)) / DIELIM_BAND_K;
  fold = fold < 0.0f ? 0.0f : (fold > 1.0f ? 1.0f : fold);
  if (fold >= 1.0f) d->declined = true;
  return d->declined ? 1.0f : fold;
}
