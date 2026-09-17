/* ctl.h — the output reference shaper and regulator kernel. Portable C99, no HAL.
 *
 * pmp_ctl_step (1 kHz, right after pmp_fsm_step) composes the current target from the command, the module's availability
 * (rating × FSM derate × the input-voltage derate), the power limits and the group share, then slews the references the
 * regulator follows: a bumpless soft start from the output node, slew-limited rises, the controlled-stop ramp and the CV
 * share trim for paralleled modules. It names the limit that binds (telemetry "limiter") and why power is reduced.
 *
 * pmp_reg_step (control ISR) runs the voltage and current regulators side by side and applies the lower demand
 * (min-select). Back-calculation pulls each integrator toward the demand actually applied, so neither winds up while the
 * other loop (or a clamp, or the skip) holds the output, and the idle loop waits above the applied demand by exactly its own
 * headroom (tt · ki · error) — it takes over when its limit is reached, without a step. An output above its reference by
 * the skip band forces zero demand until it falls back: the firmware image of the cycle-by-cycle clamp
 * (docs/firmware-architecture.md §5, HW-REC-1).
 *
 * Gains are per rating and tuned on the HIL rig against the LLC small-signal model; the host tests (firmware/test/ctl_test.c)
 * verify the structure: bounds, no windup, bumpless transfer at the limit, NaN containment, slew and stop-ramp limits. */
#ifndef PMP_CTL_H
#define PMP_CTL_H
#include <stdbool.h>
#include <stdint.h>

/* the limit that binds the current reference (reported as-is in telemetry) */
enum { PMP_LIM_NONE = 0, PMP_LIM_CV = 1, PMP_LIM_CC = 2, PMP_LIM_AVAIL = 3, PMP_LIM_CP = 4, PMP_LIM_CP_AVAIL = 5,
       PMP_LIM_GROUP = 6, PMP_LIM_RAMP = 7, PMP_LIM_STOP = 8 };
/* why the available power is below rating (bit set) */
#define PMP_DR_THERMAL  (1u << 0)
#define PMP_DR_FAN      (1u << 1)
#define PMP_DR_INPUT    (1u << 2)   /* line below 330 VAC — constant input current */
#define PMP_DR_P_CMD    (1u << 3)   /* the controller's power limit binds */
#define PMP_DR_GROUP    (1u << 4)   /* the group share binds */
#define PMP_DR_CP       (1u << 5)   /* the rated-power curve binds (output above the knee) */

#define PMP_CTL_VIN_FULL_V   330.0f  /* full-power line floor */
#define PMP_CTL_VMAX_ABS    1100.0f
#define PMP_CTL_STOP_S         0.08f /* rated current to zero inside 80 ms — well inside the FSM's 100 ms stop window */
#define PMP_CTL_TRIM_MIN_FRAC  0.05f /* no share trim below 5 % of rated average current (noise, burst mode) */
#define PMP_CTL_TRIM_DECAY_S   5.0f  /* without peer data the trim returns to zero with this time constant */

typedef struct {
  float i_rated_a, p_rated_w;   /* per rating (card strap) */
  float v_min_v;                /* lowest regulated output */
  float ramp_v_vps;             /* voltage reference rise rate (soft start and setpoint increases); falls at twice this */
  float ramp_i_aps;             /* current reference rise rate; falls at the stop rate */
  float droop_ohm;              /* virtual output resistance (0 = off) */
  float trim_max_frac;          /* share-trim authority as a fraction of the voltage command */
  float trim_rate_vpas;         /* share-trim integral gain, V per (A·s) of error */
} pmp_ctl_cfg_t;

void pmp_ctl_cfg_default(pmp_ctl_cfg_t *c, uint16_t rating_kw);

typedef struct {
  bool en, stop_ramp;           /* FSM out.llc_en / out.stop_ramp */
  bool cv_active;               /* the regulator's selection on its last period (pmp_reg_t.cv) */
  float v_set, i_set, p_set;    /* canonical command: v ≤ 0 none · i ≤ 0 none · p < 0 no power limit */
  float v_max_mode, derate;     /* FSM out.v_max / out.derate */
  uint32_t fsm_warn;            /* FSM out.warn — derate attribution */
  float vin_ll;                 /* worst line-line VAC */
  float v_out, i_out;           /* 1 kHz averaged output measurements */
  bool grp_active; float grp_share_a;
  float peer_avg_a; uint8_t peer_n;
  float die_fold;               /* the die-temperature observer's fold (hal/dielim.h), 0 = none … 1 = declined */
} pmp_ctl_in_t;

typedef struct {
  float v_ref, i_ref;           /* slewed references handed to the regulator */
  float v_tgt, i_tgt;           /* unslewed targets */
  float i_avail, p_avail, p_lim, trim_v;
  uint8_t limiter; uint16_t derate_why;
  bool was_en, trim_active;
} pmp_ctl_t;

void pmp_ctl_init(pmp_ctl_t *s);
void pmp_ctl_step(pmp_ctl_t *s, const pmp_ctl_cfg_t *c, const pmp_ctl_in_t *in, float dt_s);

typedef struct {
  float kp_v, ki_v;             /* per unit of v_scale error */
  float kp_i, ki_i;             /* per unit of i_scale error */
  float tt_s;                   /* back-calculation (tracking) time constant */
  float skip_hi_frac, skip_hi_v, skip_lo_frac;   /* skip above v_ref·(1+hi)+hi_v, resume below v_ref·(1+lo) */
} pmp_reg_cfg_t;

typedef struct { float xv, xi, u; bool cv, skip; } pmp_reg_t;

void pmp_reg_cfg_default(pmp_reg_cfg_t *c);
void pmp_reg_reset(pmp_reg_t *r);
/* returns the normalized power demand u ∈ [0, 1] (the HAL maps it to LLC frequency / burst) */
float pmp_reg_step(pmp_reg_t *r, const pmp_reg_cfg_t *c, bool en, float v_ref, float i_ref, float v, float i,
                   float v_scale, float i_scale, float dt_s);
#endif
