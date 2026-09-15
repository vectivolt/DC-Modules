/* llc.h — E79 full-bridge LLC modulator. Portable C99, no HAL.
 *
 * The regulator's normalized demand u (core/ctl.c pmp_reg_step) becomes a switching frequency and a phase-shift duty:
 *   u ≥ u_psm      PFM, linear from fmax (u = u_psm) down to the frequency floor (u = 1), full duty
 *   u < u_psm      phase shift at fmax, duty = u / u_psm
 *   duty < d_min   burst: the bridge stops at the end of its period and restarts above d_on — only with the bank at 100 V or
 *                  more. Into a discharged output the tank works into a near-short, and bursting there cost 129 A tank peaks
 *                  and ±13 % output ripple at 60 V on the cycle-by-cycle plant; phase-shifting continuously down to zero duty
 *                  below 100 V held 22–44 A and ±0.5 % (E79)
 * The floor is the higher of the tank design's lowest solved point (fn_floor 0.55: D3 flux, Cr voltage) and the zero-voltage-
 * switching boundary for the load in force — the frequency below which the tank input impedance turns capacitive — evaluated at
 * the worst tolerance corner (Lr ±5 %, Cr ±5 %, Lm ±7 %, Ln 10) with 3 % margin. A demand for more gain than the tank has (a bus
 * sag at the 500 V-bank corner, a start into a low output) settles on the boundary instead of in capacitive mode, and the
 * regulator's anti-windup holds it there. The full-power corner needs fn 0.58 where the boundary is 0.38, so the guard never
 * removes a real operating point (E79 derivation). Both regions are linear in u; the loop gains that absorb the tank's
 * nonlinearity are tuned per SKU on HIL (firmware-architecture §5.4). */
#ifndef PMP_LLC_H
#define PMP_LLC_H
#include <stdbool.h>
#include <stdint.h>

typedef struct {
  float fr_hz, z0_ohm;      /* nominal tank (tanks.mjs) */
  float fn_floor, fn_max;   /* 0.55 · 1.45 */
  float u_psm;              /* demand where PFM hands over to phase shift */
  float d_min, d_on;        /* burst hysteresis on the duty */
  float dead_s;             /* bridge dead time the port programs (the llc-run decks' 120 ns; worst ZVS transition 77 ns) */
} llc_cfg_t;

typedef struct {
  float f_hz, duty;         /* next period */
  float f_min_hz, q;        /* the floor in force and the load's Q (telemetry) */
  bool gate, burst;
} llc_t;

void llc_cfg_default(llc_cfg_t *c, uint16_t rating_kw);
float llc_zvs_fn(float q);  /* tolerance-worst ZVS boundary / fr for a nominal Q (conservative table) */
/* u: regulator demand · v_bank: one bank's voltage (V) · p_out: output power (W). en false, or a non-finite u, stops the bridge. */
void llc_step(llc_t *l, const llc_cfg_t *c, bool en, float u, float v_bank, float p_out);
#endif
