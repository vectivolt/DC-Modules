/* pfc.h — E79 Vienna rectifier control law. Portable C99, no HAL.
 *
 * The law is the one the cycle-by-cycle engine validated (calculations/pfc/vienna-switched.mjs, E60–E68): a per-phase P current
 * loop on resistive emulation with the sensed phase voltage as feed-forward (its RC lag rotated out, FW-EMI-2), min-max
 * zero-sequence injection with midpoint balancing, regular sampling at the carrier peak and valley (FW-EMI-1) and the FW-R6
 * current-amplitude clamp. The voltage loop is the pfc-control.mjs design (15 Hz, 65°) acting on the current amplitude, with the
 * LLC's input power as feed-forward so a load step does not wait for the 15 Hz loop. The loop commands POWER: the current
 * amplitude is that power over the measured crest, so when the line recovers from a sag the amplitude falls with it at once (an
 * amplitude-commanding loop kept the sag's amplitude into the full line: 269 A on the plant, above F.01).
 *
 * What the real stage adds to the engine's law:
 *   - the bus reference ramps from the measured bus (a bumpless start from the rectified crest)
 *   - OFF (every switch open — the passive rectifier, which moves no charge while the bus sits above the line crest):
 *       skip   bus above its reference by skip_v, at any load — a load dump never reaches the 860 V F.03 trip
 *       burst  below 2 % power the stage stops 3 V above the reference and resumes 2 V below it: modulating a near-zero
 *              reference runs the phases in DCM, which pumps charge (the plant ran the bus away at no load)
 *   - amplitude limit, the lowest of: the FW-R6 current clamp; the same power (1.05 × rated input) above 330 VAC; and room for
 *     the line to come back — a line step lands k_step amps per volt on the current during the 15 µs transport delay, before any
 *     sample can answer, so the limit is 1.1 × clamp less k_step × (recent crest − crest). From the plain clamp a 50 % sag
 *     recovered at 184 A (50 kW, 6 % under F.01), and worse from a high line. The crest estimate rises at once and falls in
 *     5 ms; the recent crest falls in 2 s, so a sustained low line gets the full clamp back (E1). Every phase reference is
 *     clamped to the limit.
 *   - LIMIT tier: a phase current above its reference by i_lim_a turns that switch off for the update, which puts the rail
 *     against the current (the fastest fall the stage has) — the RC-lagged feed-forward cannot carry a line step into F.01
 *   - with a current too small to sign, the rail follows the phase voltage (the reference's sign under resistive emulation);
 *     following the zero reference instead boosted the bus without limit at no load
 *   - pulses narrower than on_min are dropped or held on (gate-driver minimum pulse)
 *   - the phase sequence is a sign on w_line, so a module wired A-C-B keeps its feed-forward lead
 * Gains per rating come from calculations/pfc (see pfc_cfg_default) and are confirmed on HIL (firmware-architecture §5.4).
 *
 * E81 — THE 50 kHz SINGLE-UPDATE FALLBACK IS FORBIDDEN ON 40 AND 50 kW. docs/firmware-architecture.md §3.5 offered "one
 * update per carrier period (50 kHz), which halves the PFC load" as the answer if the 100 kHz ISR proves too expensive.
 * It is not an answer: at Td = 30 µs the current loop's modulus margin against the DRAWN input filter collapses to 0.26
 * (40 kW) and 0.17 (50 kW) against the project's own >= 0.50 criterion (F-G-5; the repo's margin() run with the shipped
 * gains gives 30/40/50 kW = 0.315/0.257/0.170 at 30 µs versus 0.658/0.614/0.544 at 15 µs), and the repo's own switched
 * model oscillates — 78.1 % of fundamental between 2 and 45 kHz on the 30 kW undamped case. kp_i is UNCHANGED and the
 * 100 kHz double update STAYS; the CPU was bought back by moving grid_sample and the boot offset window out of the
 * 100 kHz ISR (app.c), decimating the 10 kHz means in the writer (port.c) and enabling the flash prefetch buffer.
 * `pfc_exec_us` (VMP object 0x0500) measures the result: the bring-up STOP criterion is <= 5 µs worst case. If that is
 * ever missed, the honest levers are a lower crossover (~1.5 kHz, accepting the THD) or CDMP/RDMP on the damper —
 * never this fallback. */
#ifndef PMP_PFC_H
#define PMP_PFC_H
#include <stdbool.h>
#include <stdint.h>

typedef struct {
  float kp_i;         /* V/A — 2π · 3 kHz · L_D1 at the clamp crest (delay-limited crossover; lower bandwidth at low current) */
  float kp_v, ki_v;   /* W per V · W per V·s — 15 Hz, 65° on the drawn link capacitance */
  float i_clamp;      /* A pk — FW-R6: 1.05 × the rated crest at the 330 VAC full-power floor */
  float p_clamp_w;    /* W — the same limit as power: 1.5 · 269.4 V (the 330 VAC crest) · i_clamp */
  float i_lim_a;      /* A — a phase current above its reference by this much turns its switch off (LIMIT, below F.01) */
  float k_step;       /* A per V — 15 µs / L_D1 at the clamp: what the transport delay adds per volt of line step */
  float k_mid;        /* zero-sequence volts per volt of half imbalance */
  float tau_v;        /* s — the SNS_VAC divider RC */
  float ramp_vps;     /* bus reference slew (falls at twice this) */
  float skip_v;       /* bus above the reference by this much: no power */
  float eta_llc;      /* feed-forward: rectifier output power = LLC output power / eta */
  float on_min;       /* narrowest ON fraction */
} pfc_cfg_t;

typedef struct {      /* committed by the 1 ms tick, copied at ISR entry */
  bool en;            /* FSM pfc_en and no kill */
  float vbus_ref;     /* FSM out.vbus_ref */
  float w_line;       /* rad/s from the grid monitor, negative for sequence A-C-B */
} pfc_ref_t;

typedef struct {
  bool run, clamp, skip, burst;
  uint8_t vdiv;       /* the voltage-loop integrator advances every 10th update */
  float vref;         /* ramped bus reference */
  float xi;           /* voltage-loop integrator, W */
  float i_pk;         /* commanded phase-current amplitude */
  float vpk2;         /* phase crest², peak-following */
  float vnom;         /* recent crest, peak-following with a 2 s fall — the line a sag can return to */
  float ivp, ivn;     /* 1 / bus halves, refreshed every 10th update (a half moves < 0.3 % in 100 µs) — two FPU divisions
                         saved on nine updates in ten of the 100 kHz interrupt */
  float on[3];        /* switch ON fraction for the next half period; 0 = off (the node sits on a rail, a passive rectifier) */
} pfc_t;

void pfc_cfg_default(pfc_cfg_t *c, uint16_t rating_kw);
void pfc_reset(pfc_t *p);
/* One update at a carrier peak or valley, dt = half the switching period. i: line currents into the rectifier (A); v: sensed
   phase-to-star voltages (V); vp, vn: upper and lower bus halves (V); p_load_w: LLC output power (W). Anything non-finite, a
   half below 50 V, or en false turns every switch off and resets the loop. */
void pfc_step(pfc_t *p, const pfc_cfg_t *c, const pfc_ref_t *r, const float i[3], const float v[3], float vp, float vn,
              float p_load_w, float dt);
#endif
