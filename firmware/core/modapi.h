/* modapi.h — E78 the ONE internal module-control data model.
 *
 * A protocol profile (firmware/proto/) is the only code that knows a wire format. It writes mod_cmd_t from the frames it
 * accepts and encodes mod_tlm_t into its own frames. The power core (fsm, ctl, group) reads mod_cmd_t only through
 * pmp_cmd_to_in() / pmp_cmd_to_ctl() and never sees an identifier, a scaling, a vendor fault bit or a vendor timeout.
 * Adding a vendor profile adds a file under proto/ and a registry line; nothing here or in core/ changes. */
#ifndef PMP_MODAPI_H
#define PMP_MODAPI_H
#include "fsm.h"
#include "ctl.h"

/* the module's externally meaningful state — every profile maps its own vocabulary from this, never from pmp_state_t */
typedef enum { MOD_RS_OFF = 0, MOD_RS_PRECHARGE, MOD_RS_READY, MOD_RS_STARTING, MOD_RS_ON, MOD_RS_STOPPING,
               MOD_RS_MODE_CHANGE, MOD_RS_SAFE, MOD_RS_FAULT, MOD_RS_LOCKED, MOD_RS_DISCHARGE } mod_run_state_t;

typedef struct {                /* controller intent — written only by the active profile */
  bool run;                     /* level; after any module-initiated stop the core needs it seen low, then high */
  pmp_omode_t omode;
  float v_set_v;                /* ≤ 0 = no setpoint */
  float i_set_a;                /* per module, ≤ 0 = none */
  float p_set_w;                /* < 0 = no power limit */
  uint32_t age_ms;              /* since the last frame this profile counts as controller presence */
  uint32_t timeout_ms;          /* this profile's communication timeout */
  bool clear, shutdown, wake;   /* one-tick pulses, consumed by pmp_cmd_to_in() */
  uint16_t locate_s;            /* LED / display locate request, seconds left (HAL counts down) */
  bool grp_active, grp_deliver; /* group control in force · the share law permits delivery */
  float grp_share_a;
  float peer_avg_a;             /* paralleled peers' average output current heard on the bus (CV share trim), NaN = none */
  uint8_t peer_n;               /* modules in that average, including this one */
} mod_cmd_t;

void mod_cmd_init(mod_cmd_t *c);

typedef struct {                /* module truth — core + HAL write it once per tick, every profile reads it */
  mod_run_state_t rs; pmp_state_t st; pmp_mode_t mode; pmp_omode_t omode;
  pmp_fault_t fault; pmp_fclass_t fclass;
  uint64_t fault_bits;          /* bit n−1 = F.n latched (F.31 while locked) */
  uint32_t warn;                /* PMP_W_* */
  bool rearm;                   /* ENABLE held, fresh edge required */
  uint32_t recover_ms;          /* AUTO row: ms until the recovery hold completes (0 when none) */
  uint8_t limiter; uint16_t derate_why; float derate;
  float v_set;                  /* the voltage command in force (canonical, after sanitization) */
  float v_ref, i_ref, p_lim, i_avail, p_avail, trim_v; bool share_active;
  float v_min, v_max, i_rated, p_rated;   /* capability in force (v_max follows the output mode) */
  /* HAL-filled measurements (NaN where not fitted) */
  float v_out, i_out, v_bus, v_mid_imb, v_bank_a, v_bank_b;
  float vin_ll, vin_ph[3], line_hz;
  float t_inlet, t_pfc, t_llc, t_xfmr, t_diode, t_bank, t_mcu, t_coolant;
  uint16_t fan_rpm[4]; uint8_t fan_duty, fan_fail;
  uint32_t uptime_s, op_s, energy_wh, starts; uint16_t fault_total;
  bool log_overflow, quiet_fan;
} mod_tlm_t;

/* intent → FSM inputs: copies, consumes the one-tick pulses, plumbs the profile's timeout */
void pmp_cmd_to_in(mod_cmd_t *cmd, pmp_in_t *in, pmp_fsm_t *f);
/* intent + FSM outputs + measurements → shaper inputs */
void pmp_cmd_to_ctl(const mod_cmd_t *cmd, const pmp_fsm_t *f, const pmp_in_t *in, bool cv_active, pmp_ctl_in_t *ci);
/* core truth → telemetry (measurement fields are left to the HAL) */
void pmp_tlm_from_core(mod_tlm_t *m, const pmp_fsm_t *f, const pmp_in_t *in, const pmp_ctl_t *c, const pmp_ctl_cfg_t *cc);
#endif
