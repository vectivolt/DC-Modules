/* fsm.h — production supervisory FSM + protection evaluator for the 30/60/120 kW modules.
 * Portable C99, no HAL dependency: the scheduler calls fsm_step() every 1 ms with measured
 * inputs; outputs command relays/PWM-enables/derate. Thresholds mirror
 * docs/protection-thresholds.md rev B; semantics are verified 1:1 against the 26-scenario
 * suite (calculations/system/fsm-sim.mjs) by firmware/test/host_sim.c on every build.
 * MCU integration: MCU-LLC runs this master FSM; MCU-PFC runs the subordinate enable/precharge
 * slice and mirrors PWM_KILL in hardware. */
#ifndef PMP_FSM_H
#define PMP_FSM_H
#include <stdint.h>
#include <stdbool.h>

typedef enum {
  ST_INIT = 0, ST_PRECHG, ST_STANDBY, ST_RUN, ST_DERATE, ST_MODESW,
  ST_SAFE, ST_FAULT, ST_LOCK, ST_SHUTDOWN, ST_DISCH, ST_OFF
} pmp_state_t;

typedef enum {
  FC_NONE = 0, FC_OC_PFC = 1, FC_DESAT = 2, FC_BUS_OVP = 3, FC_BUS_UV = 5, FC_MID_IMB = 6,
  FC_IN_OV = 7, FC_IN_UV = 8, FC_PH_LOSS = 9, FC_OUT_OVP = 13, FC_OUT_OC = 15, FC_OUT_SHORT = 16,
  FC_BANK_IMB = 17, FC_WELD = 18, FC_PRECHG = 20, FC_DISCH = 21, FC_OT = 22, FC_FAN = 25,
  FC_AUX_UV = 26, FC_LINK = 27, FC_CAN_TO = 28, FC_SENSOR = 29, FC_LOCK = 31, FC_WDT = 32,
  FC_BACKFEED = 33
} pmp_fault_t;

typedef enum { MODE_PAR = 0, MODE_SER = 1 } pmp_mode_t;

typedef struct {            /* measured / external inputs, engineering units */
  float vin_ll;             /* worst line-line VAC */
  uint8_t phases_ok;        /* count of live phases */
  float vbus, vmid_frac;    /* total bus V; midpoint as fraction of bus */
  float vbank_a, vbank_b;
  float vout_meas, iout_meas, vext;
  bool ext_connected;
  float temp_max_c;         /* worst NTC zone (per-zone handling in zone table upstream) */
  bool fan_ok, aux_ok, wdt_ok;
  bool desat_flt, oc_pfc_flt;             /* latched HW flags (read-clear) */
  bool relay_fb[6];                       /* contact readback: SER,PARA,PARB,OUT,PREA,PREB */
  uint32_t can_age_ms, link_age_ms;
  bool enable_req, clear_req;
  float vcmd, icmd;                       /* CAN setpoints */
} pmp_in_t;

typedef struct {            /* commands to drivers/relays/loops */
  bool pfc_en, llc_en, pwm_kill;
  bool k_pre, k_ser, k_para, k_parb, k_out, k_prea, k_preb, q_disch;
  float derate;             /* 0..1 multiplier on power/current limits */
  pmp_mode_t mode;
  float vbus_ref;           /* E10 policy */
} pmp_out_t;

typedef struct {
  pmp_state_t st;
  pmp_fault_t latched;
  uint8_t fault_count;
  bool lock, need_enable;
  uint32_t t_ms, dwell_ms, sw_step, short_ms, weld_ms, prechg_ms, disch_ms;
  uint32_t disch_to_ms;     /* F.21 window — runtime per rating (card strap), default = macro */
  float icmd_saved;
  pmp_out_t out;
} pmp_fsm_t;

void pmp_fsm_init(pmp_fsm_t *f);
void pmp_fsm_step(pmp_fsm_t *f, const pmp_in_t *in);   /* call every 1 ms */
/* Card promise (CARD_RULES): ONE firmware image, rating read at boot from the RATING strap on
 * ROLE1's ADC (card 10k pull-up to V3P3, board resistor to DGND) — E24 rev F bands:
 *   <0.15 V  (0R)    -> 30 kW module
 *   0.15-0.55 (1k)   -> 40 kW module (E41)
 *   0.55-1.24 (3.32k)-> cabinet CSU role
 *   1.24-2.40 (10k)  -> 50 kW LIQUID module (E42 — retires the stale two-card-era 10k = "60 kW"
 *                       mapping; no single-brain 60 exists, E40. At 50 kW the HAL also ties
 *                       fan_ok = true (sealed module, zero fans) and leaves the tach inputs
 *                       ignored — the board holds them defined-low.)
 *   >2.40 V  (open)  -> no host, fault.
 * HAL decodes the band and calls this once before enabling; unknown ratings keep the
 * worst-case default window (longer timeout = later F.21 report, never an unsafe one). */
void pmp_fsm_set_rating_kw(pmp_fsm_t *f, uint16_t kw);
const char *pmp_state_name(pmp_state_t s);

/* thresholds (protection-thresholds.md rev B) — exposed for EOL/limits telemetry */
#define PMP_BUS_OVP_V      860.0f
#define PMP_BUS_UV_V       620.0f
#define PMP_IN_OV_V        500.0f
#define PMP_IN_UV_V        260.0f
#define PMP_MID_IMB_V       40.0f
#define PMP_BANK_IMB_V      25.0f
#define PMP_OT_TRIP_C      115.0f
#define PMP_OT_DERATE_C    105.0f
#define PMP_SHORT_V         50.0f
#define PMP_SHORT_I_FRAC     0.90f
#define PMP_SHORT_MS        10u
#define PMP_OC_FRAC          1.30f
#define PMP_CAN_TO_MS     1000u
#define PMP_LINK_TO_MS      50u
#define PMP_WELD_DV_V        1.5f
#define PMP_WELD_MS        200u
#define PMP_MODE_DWELL_MS   30u     /* scaled: 30 s in product, 30 ms in host sim timebase */
#define PMP_XOVER_UP_V     500.0f   /* E9 rev B */
#define PMP_XOVER_DN_V     525.0f
#define PMP_LOCK_COUNT       5u
/* F.21 discharge supervision (R2 review: the doc row previously had no implementation).
   Physics scales with bus C: t(<60 V) ≈ 2.0 / 3.6 / 7.2 s at 30/60/120 kW (640 Ω, 850 V) —
   HAL builds override per SKU: 30 kW 3000, 60 kW 5500, 120 kW 9000. Default covers the worst. */
#ifndef PMP_DISCH_TO_MS
#define PMP_DISCH_TO_MS   9000u
#endif
#endif
