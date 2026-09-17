/* llc.c — see llc.h. */
#include "llc.h"
#include <math.h>

/* E79: tolerance-worst ZVS boundary fn for nominal Q = 0, 0.05 … 1.0, then 1.5, 2.0 and Q → ∞ (the series tank alone at
   fr · 1.0526) — monotonic, from Im(Zin) = 0 of the FHA tank over the eight corners; hal_test recomputes and checks it */
static const float ZVS_FN[24] = { 0.3204f, 0.3237f, 0.3340f, 0.3533f, 0.3851f, 0.4401f, 0.5379f, 0.6489f, 0.7407f, 0.8076f,
  0.8558f, 0.8912f, 0.9178f, 0.9383f, 0.9544f, 0.9674f, 0.9779f, 0.9866f, 0.9939f, 1.0000f, 1.0052f, 1.0317f, 1.0408f, 1.0525f };

/* E82 (M-30): the tank's own no-load FHA gain M(fn) = Ln·fn² / ((Ln+1)·fn² − 1) and its slope, used to publish how much
   output voltage one unit of demand is worth at the operating point in force (llc_t.k_norm — see llc_step).
   Ln = Lm/Lr = 10.0 on all three SKUs by tank design (Lr = z0/(2π·fr)); deriving it from the shipped constants keeps the
   modulator consistent with whatever tanks.mjs ships instead of carrying a fourth copy of the number. */
/* V per unit of demand at the LEAST sensitive point of the map — the PFM/PSM hand-over, where dM/dfn is flattest. Every
   other point is livelier than this, so the ratio below is >= 1 and the normalisation can only ever REMOVE loop gain, never
   add it: no operating point that the cycle-by-cycle plant already validated has its gain raised. */
#define LLC_KV_REF 420.0f
#define LLC_KV_TAU   0.002f    /* per 100 µs call → ≈ 50 ms on the published ratio (see llc_step) */
static float llc_ln(const llc_cfg_t *c) { return c->lm_h * 6.28318531f * c->fr_hz / c->z0_ohm; }
static float llc_m(float ln, float fn) { return ln * fn * fn / ((ln + 1.0f) * fn * fn - 1.0f); }
static float llc_dm_dfn(float ln, float fn) {    /* d/dfn of the above — always negative above the asymptote */
  float d = (ln + 1.0f) * fn * fn - 1.0f;
  return -2.0f * ln * fn / (d * d);
}

void llc_cfg_default(llc_cfg_t *c, uint16_t kw) {
  /* tanks.mjs: Lr 5.6 / 4.35 / 3.56 µH · Cr 7 / 9 / 11 × 33 nF → fr 139.9 / 140.0 / 140.0 kHz · Z0 4.924 / 3.827 / 3.132 Ω */
  c->fr_hz = (kw == 30u) ? 139.9e3f : 140.0e3f;
  c->z0_ohm = (kw == 50u) ? 3.132f : (kw == 40u) ? 3.827f : 4.924f;
  c->fn_floor = 0.55f;
  c->fn_max = 1.45f;
  c->u_psm = 0.35f;
  c->d_min = 0.08f;
  c->d_on = 0.12f;
  /* E81 ZVS constants — calculations/llc/tanks.mjs TANKS[sku] (n, Lm, cs, par) and DIES["23m"].qoss800 */
  c->n = 2.0f;
  c->lm_h = (kw == 50u) ? 35.6e-6f : (kw == 40u) ? 43.5e-6f : 56.0e-6f;
  c->cs_f = (kw == 30u) ? 330.0e-12f : (kw == 40u) ? 680.0e-12f : 1000.0e-12f;   /* E81 close-out: tanks.mjs cs 330 / 680 / 1000 pF */
  /* E82 (F-H1-3): 371 nC is NOT the C3M0021120K's charge (its 99 µJ is E_oss at 1000 V and Q = 3E/V overstates a flat
     C_oss — the charge-validated fit is 226 nC). It is kept on purpose: the ordered die is a different part with no public
     datasheet, the RFQ line admits E_oss ≤ 110 µJ at 800 V, and 371 nC is that bound. Every budget that reads it errs long. */
  c->qoss800_c = 371.0e-9f;
  c->par = (kw == 30u) ? 1u : 2u;
}

/* E81 (F-E-01): continuous instead of ceil-to-grid. The table is a conservative UPPER envelope, so the curve has to stay
   at or above the grid point ABOVE q (the ceil value) — interpolating between the two points below would dip under the
   true boundary in the table's concave region. Interpolating between ceil(q) and ceil(q)+1 keeps exactly the ceil form's
   conservatism while removing its up-to-0.11·fr ≈ 15 kHz steps, which is what made f_min jump. */
float llc_zvs_fn(float q) {
  if (isnan(q)) return ZVS_FN[23];
  if (q <= 0.0f) return ZVS_FN[0];
  if (q <= 1.0f) {
    float x = q * 20.0f;
    int k = (int)x;
    if (k >= 20) return ZVS_FN[20];
    return ZVS_FN[k + 1] + (x - (float)k) * (ZVS_FN[k + 2 > 23 ? 23 : k + 2] - ZVS_FN[k + 1]);
  }
  if (q <= 1.5f) return ZVS_FN[22] + (q - 1.0f) * 2.0f * (ZVS_FN[23] - ZVS_FN[22]);
  return ZVS_FN[23];
}

/* E81: the ZVS transition this operating point needs (llc.h). f is the frequency actually commanded, so the schedule
   follows PSM (f_max, the weakest magnetizing current) as well as PFM. */
#define LLC_ITOFF_PFM_K 1.0f   /* E82 (F-H1-2): measured 0.85–1.30 × tank rms over 27 solved points (E81 carried 1.2, up to 29 % short on time) */
#define LLC_ITOFF_PSM_K 1.6f   /* E81: the shifted leg turns off at the PSM tank peak (crest ≈ 1.6 × rms) */
static float zvs_dead_s(const llc_cfg_t *c, float f_hz, float v_bank, float v_bus, float i_comm) {
  if (!(isfinite(v_bus) && v_bus > 1.0f) || !(f_hz > 1.0f) || !(c->lm_h > 0.0f)) return LLC_DT_MAX_S;
  float vb = isfinite(v_bank) ? fabsf(v_bank) : 0.0f;
  float im = c->n * vb / (4.0f * f_hz * c->lm_h);              /* magnetizing peak, A — the floor of any leg's commutation current */
  float ic = fmaxf(im, (isfinite(i_comm) && i_comm > 0.0f) ? i_comm : 0.0f);   /* E81: the leg's own commutation current */
  float qoss = c->qoss800_c * sqrtf(v_bus * 0.00125f);          /* 3·Eoss/V on the Eoss ∝ V^1.5 curve */
  float t = LLC_DT_K * (float)c->par * (qoss + c->cs_f * v_bus) / fmaxf(ic, 1.0f);
  if (!isfinite(t) || t > LLC_DT_MAX_S) return LLC_DT_MAX_S;
  return (t < LLC_DT_MIN_S) ? LLC_DT_MIN_S : t;
}

/* E82 (C-11 / F-H1-1): the WEAK leg in phase shift. E81 gave leg A the long I_m time (charge ÷ magnetizing current, up to
   900 ns) on the premise that it "commutates on I_m alone". At load it does not: the zero state ends with the rectifier
   still conducting, so L_m is clamped and the leg swings on what is left of the tank current through L_r ALONE — a
   resonance of L_r against the leg's node capacitance that reaches its valley in a quarter period (≈ 130 ns at 30 kW) and
   then swings BACK, because that current collapses at (V_bus + n·V_bank + v_Cr)/L_r ≈ 300 A/µs. A gate edge 200–900 ns
   later finds the node back at the rail and turns on hard against the whole link: 60–130 W per die, load-independent.
   The E82 switched model's dead-time sweep puts the best edge at 90–130 ns on the one-die leg with a 40 ns window, in CCM
   and DCM alike (90–190 ns in CCM and 190–270 ns in DCM on the two-die 50 kW leg), and cuts the 30 kW PAR150 loss from 50 W
   to 9 W per die. The valley time is the tank's and the leg's own: k · (π/2) · √(L_r · C_node), C_node = 2·par·(Q_oss(V)/V +
   C_s) — no measurement, nothing to tune per unit. k = 0.82 on the RFQ-bound charge puts 125 / 186 / 189 ns (30 / 40 / 50 kW)
   inside those windows; T-58 (leg-node probe) is the bench row that trims it. */
#define LLC_DT_WEAK_K 0.82f
static float weak_dead_s(const llc_cfg_t *c, float v_bus) {
  if (!(isfinite(v_bus) && v_bus > 1.0f) || !(c->fr_hz > 1.0f) || !(c->z0_ohm > 0.0f)) return LLC_DT_MAX_S;
  float lr = c->z0_ohm / (6.2831853f * c->fr_hz);
  float cn = 2.0f * (float)c->par * (c->qoss800_c * sqrtf(v_bus * 0.00125f) / v_bus + c->cs_f);
  float t = LLC_DT_WEAK_K * 1.5707963f * sqrtf(lr * cn);
  return (t < LLC_DT_MIN_S) ? LLC_DT_MIN_S : (t > LLC_DT_MAX_S ? LLC_DT_MAX_S : t);
}

void llc_step(llc_t *l, const llc_cfg_t *c, bool en, float u, float v_bank, float p_out, float v_bus) {
  float vb = fmaxf(isfinite(v_bank) ? v_bank : 0.0f, 50.0f);
  float p = (isfinite(p_out) && p_out > 0.0f) ? p_out : 0.0f;
  l->q = c->z0_ohm * p / (3.2423f * vb * vb);   /* Z0 / Rac with Rac = (8 n² / π²) · Vbank² / P, n = 2 (llc-design.mjs) */
  /* E81 (F-E-01): the ZVS guard's load estimate rises INSTANTLY and decays over ~10 ms. Losing ZVS is a hard failure, so
     a step into a heavier load must raise the floor on the same call; only the way back down is filtered, which is what
     stops the load estimate from chattering the floor. */
  l->q_f = fmaxf(l->q, l->q_f + (l->q - l->q_f) * 0.01f);
  float f_floor = c->fn_floor * c->fr_hz;       /* the map's endpoint is FIXED — the guard is a clamp, not the endpoint */
  l->f_min_hz = fmaxf(f_floor, 1.03f * llc_zvs_fn(l->q_f) * c->fr_hz);
  float f_max = c->fn_max * c->fr_hz;
  if (!en || !isfinite(u)) {
    l->gate = false; l->burst = false; l->f_hz = f_max; l->duty = 0.0f;
    l->dead_a_s = l->dead_b_s = l->dead_s = zvs_dead_s(c, f_max, v_bank, v_bus, 0.0f);
    return;
  }
  u = (u < 0.0f) ? 0.0f : (u > 1.0f ? 1.0f : u);
  if (u >= c->u_psm) {
    l->duty = 1.0f;
    l->f_hz = fmaxf(f_max - (u - c->u_psm) / (1.0f - c->u_psm) * (f_max - f_floor), l->f_min_hz);
  } else { l->duty = u / c->u_psm; l->f_hz = f_max; }
  /* E82 (M-30): how many volts of output one unit of demand is worth HERE, as a ratio to the sensitivity the shipped CV
     gains are tuned for. The map itself is E79's and stays exactly as the cycle-by-cycle plant validated it — what was
     broken is that its sensitivity spans 23× over the 150–1000 V envelope (53 V/unit near resonance against 1211 V/unit in
     deep phase shift) while ONE fixed PI pair drives it: at the phase-shift end |T(z = −1)| crossed 1 and the loop limit-
     cycled at 5 kHz, 0–160 V pk-pk, exactly at the cable-check/pre-charge point of every low-voltage pack. The caller
     divides its voltage-loop gain by this ratio (app.c), which holds the loop gain constant without moving a single
     validated operating point. PFM: dM/dfn · dfn/du · v_bus/n. PSM: the bridge's fundamental is (4/π)·v_bus·sin(π·duty/2),
     so the sensitivity carries that cosine — it is what makes deep phase shift so much livelier than resonance. */
  { float ln = llc_ln(c), vbn = fmaxf(v_bus, 1.0f) / c->n, kv;
    if (l->duty >= 1.0f) {
      float fn = l->f_hz / c->fr_hz;
      kv = -llc_dm_dfn(ln, fn) * ((c->fn_max - c->fn_floor) / (1.0f - c->u_psm)) * vbn;
    } else {
      /* the bridge's fundamental is (4/π)·v_bus·sin(π·duty/2), so the sensitivity carries cos(π·duty/2) — which is what
         makes deep phase shift so much livelier than resonance. The target has no libm (port/gd32g553/include/math.h is
         FPU builtins and logf), so the cosine is bounded from ABOVE by (1 − d²)(1 − 0.21·d²): exact at both ends, never
         under the true value anywhere on [0, 1] and at most 0.9 % over it. Overstating the sensitivity only removes a
         little more loop gain than strictly needed, which is the safe side of this fix. */
      float d2 = l->duty * l->duty;
      kv = 1.57079633f * (1.0f - d2) * (1.0f - 0.21f * d2) * llc_m(ln, c->fn_max) / c->u_psm * vbn;
    }
    kv = (isfinite(kv) && kv > 0.0f) ? fminf(fmaxf(kv / LLC_KV_REF, 1.0f), 40.0f) : 1.0f;
    /* the ratio must follow the point the loop is REGULATING, not the instantaneous duty. Inside a burst the duty collapses
       towards zero, where the cosine above is largest, so an unfiltered ratio would divide the loop's gain by ~3 exactly
       while it is trying to climb back out — the drawn film bank then fell 55 V before the bridge restarted. A real
       operating point moves with the battery, over seconds; LLC_KV_TAU is 50 ms, slow against a burst and fast against that. */
    l->k_norm = (l->k_norm > 0.0f) ? l->k_norm + (kv - l->k_norm) * LLC_KV_TAU : kv;
  }
  /* E81 per-leg schedule (G deck, F-C-7): in PSM leg A commutates on I_m alone and leg B (the shifted leg) near the tank peak
     (crest ≈ 1.6 × rms); in PFM both legs turn off at the same current, ≈ 1.2 × rms above resonance.
     E82 (M-31): the rms comes from the operating point, not from a measurement. I_RES is converted at 100 kHz locked to the
     PFC carrier while the tank runs 77–203 kHz asynchronously, so the caller's 10-sample mean of it read ≈ 0 (the schedule
     silently fell back to its long I_m value on every leg — the E81 fix was inert) except near 100/200 kHz, where the alias
     lands at DC and it read an arbitrary value up to the crest. The tank rms is the reflected output current in quadrature
     with the triangular magnetizing current, and llc_step already holds every term: π/(2√2·n) · P/V_bank, and I_m/√3. */
  float io = 1.1107f * p / (vb * c->n);                                  /* reflected output current, A rms */
  float imr = 0.57735f * c->n * vb / (4.0f * l->f_hz * c->lm_h);         /* magnetizing current, A rms */
  float irms = sqrtf(io * io + imr * imr);
  l->i_rms = irms;
  bool psm = l->duty < 1.0f;
  l->dead_a_s = psm ? weak_dead_s(c, v_bus) : zvs_dead_s(c, l->f_hz, v_bank, v_bus, LLC_ITOFF_PFM_K * irms);
  l->dead_b_s = zvs_dead_s(c, l->f_hz, v_bank, v_bus, (psm ? LLC_ITOFF_PSM_K : LLC_ITOFF_PFM_K) * irms);
  l->dead_s = fmaxf(l->dead_a_s, l->dead_b_s);
  if (!(v_bank >= 100.0f)) { l->burst = false; l->gate = l->duty > 0.0f; }   /* a discharged output: continuous phase shift */
  else {
    /* E81 (F-E-08): the packet is bounded at the SETPOINT, not at the duty. Stopping the bridge purely on duty parked the
       output up to +2.9 % high with 4 % pk-pk burst ripple on the drawn 9.4–40.2 µF film bank (the 200 µF test plant hid
       it: the error scales as 1/C). With a reference in hand the bridge only stops once the node has reached it. */
    if (l->duty < c->d_min && (!(l->in_v_ref > 0.0f) || v_bank >= l->in_v_ref)) l->burst = true;
    /* E82 (M-30): the packet ENDS on the setpoint too, not on the duty alone. E81 (F-E-08) already refused to stop the
       bridge until the node had reached its reference; restarting purely on the demand climbing back to d_on left the off
       time at the mercy of the voltage loop's gain, and once that gain is normalised for stability (k_norm above) the drawn
       film bank fell 21 % before the bridge came back. A node 1 % under its reference is reason enough to switch, whatever
       the demand is doing, and it bounds the burst ripple on every SKU without depending on a tuned loop gain. */
    else if (l->duty >= c->d_on || (l->in_v_ref > 0.0f && v_bank < 0.99f * l->in_v_ref)) l->burst = false;
    l->gate = !l->burst;
  }
}
