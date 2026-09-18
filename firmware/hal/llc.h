/* llc.h — the full-bridge LLC modulator. Portable C99, no HAL.
 *
 * The regulator's normalized demand u (core/ctl.c pmp_reg_step) becomes a switching frequency and a phase-shift duty:
 *   u ≥ u_psm      PFM, linear from fmax (u = u_psm) down to the frequency floor (u = 1), full duty
 *   u < u_psm      phase shift at fmax, duty = u / u_psm
 * The map is frequency-based on purpose — re-mapping u onto tank gain instead costs 100 A of tank peak on the
 * cycle-by-cycle plant. Its sensitivity dV/du spans 23× over the 150–1000 V envelope (53 V/unit near resonance,
 * 1211 V/unit in deep phase shift), which one fixed PI pair cannot drive: the phase-shift end crosses
 * |T(z = −1)| = 1 and limit-cycles at 5 kHz. llc_step therefore publishes that sensitivity as llc_t.k_norm and the
 * caller divides its voltage-loop gain by it: the plant is inverted in the LOOP, not in the modulator.
 *   duty < d_min   burst: the bridge stops at the end of its period and restarts above d_on — only with the bank at 100 V or
 *                  more. Into a discharged output the tank works into a near-short, and bursting there costs 129 A tank peaks
 *                  and ±13 % output ripple at 60 V on the cycle-by-cycle plant; phase-shifting continuously down to zero duty
 *                  below 100 V holds 22–44 A and ±0.5 %
 * The demand map's lower endpoint is the FIXED fn_floor and the ZVS boundary is applied as a CLAMP on top of it. Making
 * f_min both the guard and the map endpoint, recomputed every 100 µs from the instantaneous output power, means a rise
 * in load RAISES the commanded frequency for every u < 1 — a positive-feedback path inside the modulator
 * (di/du = −313 A/unit measured on the repo's own cycle-by-cycle plant at 0.30 Ω, u = 0.57). The load estimate feeds a
 * ~10 ms filter and the ZVS table is interpolated instead of ceil-ed to its grid.
 *
 * The floor is the higher of the tank design's lowest solved point (fn_floor 0.55: D3 flux, Cr voltage) and the zero-voltage-
 * switching boundary for the load in force — the frequency below which the tank input impedance turns capacitive — evaluated at
 * the worst tolerance corner (Lr ±5 %, Cr ±5 %, Lm ±7 %, Ln 10) with 3 % margin. A demand for more gain than the tank has (a bus
 * sag at the 500 V-bank corner, a start into a low output) settles on the boundary instead of in capacitive mode, and the
 * regulator's anti-windup holds it there. The full-power corner needs fn 0.58 where the boundary is 0.38, so the guard never
 * removes a real operating point. Both regions are linear in u; the loop gains that absorb the tank's
 * nonlinearity are tuned per SKU on HIL (firmware-architecture §5.4).
 *
 * ADAPTIVE DEAD TIME. A fixed 120 ns loses ZVS at every light-magnetizing corner: the leg's two devices
 * must be charged and discharged by the magnetizing current alone during the transition. Per C-sic-thermal §SNUBBER SWEEP (2),
 * the requirement is
 *       t_dead = 1.25 · 2 · par · (Qoss(V) + cs·V) / I_toff     (both switches of the leg slew, 25 % margin)
 * with Qoss(V) = qoss800 · sqrt(V/800) (3·Eoss/V on the datasheet's Eoss ∝ V^1.5 curve — 335 nC at 650 V, 363 nC at 764 V,
 * against the 250 pF linear model's 49 %) and I_toff the magnetizing peak Im_pk = n·v_bank/(4·f·Lm). Constants are copied from
 * calculations/llc/tanks.mjs (par, cs, Lm, n) and DIES["23m"].qoss800; the coefficient below is that n_die,leg = 2·par.
 * The result is clamped to [120 ns, 900 ns]: a start into a deeply discharged pack (a 50 V bank at f_max) asks for more than
 * a microsecond on paper and must be bounded, and 60 ns is the shortest transition the drivers' propagation-delay match can
 * honour. The port's generator runs at DTGCKDIV = 0010 (2.315 ns per step, 9 bits → 1.18 µs), so 900 ns is inside range.
 *
 * Extra plant inputs: v_bus (the DC link, for Qoss) is an argument; v_ref (the node's reference, for the burst floor)
 * rides llc_t.in_v_ref, written by the caller before the call. Both read 0 as "unknown": the dead time parks at the
 * 900 ns ceiling and the burst falls back to its duty-only rule, so a caller that sets neither is safe, not silently wrong.
 * The tank rms is NOT an input. Read from the resonant CT it would be aliased — the ADC converts at 100 kHz locked to
 * the PFC carrier while the tank runs 77–203 kHz, and the 10-sample mean of that is ≈ 0, so the per-leg schedule would
 * silently use its long value everywhere except near 100/200 kHz, where the alias lands at DC. llc_step computes it
 * from P, V_bank, f and Lm and publishes it as llc_t.i_rms. */
#ifndef PMP_LLC_H
#define PMP_LLC_H
#include <stdbool.h>
#include <stdint.h>

/* The dead-time floor is 120 ns. The NSI66x1A gate driver specifies t_PLH/t_PHL as 70 ns min / 80 ns typ / 110 ns max
   and publishes NO part-to-part matching figure, so the high-side and low-side drivers of one leg can differ by up to
   40 ns; R_g,off 0 Ohm against R_g,on 4.7 Ohm adds ~20 ns of device-level asymmetry. A 60 ns command does not survive
   that and the leg cross-conducts. The computed ZVS transition is 11–24 ns at the heavy corners, so this floor binds
   there and costs body-diode conduction: at PAR400-full, 4.5 V of V_SD on a -3 V gate, ~40 A of commutation current,
   2 edges per period at 140 kHz, the extra 60 ns is 4.5 x 40 x 60e-9 x 140e3 x 2 = 3.0 W per die. Bought against a
   cross-conduction event that destroys the leg. hrtimer.c's DT_MIN (52 steps x 2.3148 ns) must match; the host suites
   assert it. */
#define LLC_DT_MIN_S 120.0e-9f
#define LLC_DT_MAX_S 900.0e-9f
#define LLC_DT_K       2.5f      /* 1.25 margin × 2 switches per leg (see the dead-time note above) */

typedef struct {
  float fr_hz, z0_ohm;      /* nominal tank (tanks.mjs) */
  float fn_floor, fn_max;   /* 0.55 · 1.45 */
  float u_psm;              /* the knee of the control variable: below it phase shift at f_max (duty = u / u_psm), above it PFM. A partition of the control range set in llc_cfg_default, not a plant quantity */
  float d_min, d_on;        /* burst hysteresis on the duty */
  /* ZVS schedule — every value from calculations/llc/tanks.mjs */
  float n;                  /* transformer turns ratio (2) */
  float lm_h;               /* magnetizing inductance, H (56 / 43.5 / 35.6 µH) */
  float cs_f;               /* turn-off snubber per die, F (330 / 680 / 1000 pF — tanks.mjs cs) */
  float qoss800_c;          /* device output charge at 800 V, C (371 nC, DIES["23m"]) */
  uint8_t par;              /* dies per bridge position (1 / 2 / 2) */
} llc_cfg_t;

typedef struct {
  float in_v_ref;           /* INPUT — the node's reference, written by the caller before llc_step; 0 = unknown */
  float f_hz, duty;         /* next period */
  float f_min_hz, q, q_f;   /* the floor in force, the load's Q and its ~10 ms estimate (telemetry) */
  float dead_s;             /* the longer of the two leg dead times below (for the single-value readers) */
  float dead_a_s, dead_b_s; /* per-LEG dead time — leg A is the weak leg in PSM (commutates on I_m alone), leg B, the
                               shifted leg, turns off near the tank peak and must NOT wait: a dead time far beyond its slew lets
                               the tank current reverse and the node swing back (the deck loses every ZVS edge at 900 ns) */
  float i_rms;              /* tank rms from the operating point (A), not from the aliased I_RES measurement */
  float k_norm;             /* dV_bank/du here, over the sensitivity the CV gains are tuned for. The caller
                               divides its voltage-loop gain by this, which is what keeps one fixed PI pair valid across a
                               map whose own sensitivity spans 23×. 1.0 until the first call. */
  bool gate, burst;
} llc_t;

void llc_cfg_default(llc_cfg_t *c, uint16_t rating_kw);
float llc_zvs_fn(float q);  /* tolerance-worst ZVS boundary / fr for a nominal Q (conservative table) */
/* u: regulator demand · v_bank: one bank's voltage (V) · p_out: output power (W) · v_bus: the DC link (V), for the ZVS
   charge; l->in_v_ref carries the burst floor. en false, or a non-finite u, stops the bridge; a non-finite or zero v_bus
   parks dead_s at the 900 ns ceiling. */
void llc_step(llc_t *l, const llc_cfg_t *c, bool en, float u, float v_bank, float p_out, float v_bus);
#endif
