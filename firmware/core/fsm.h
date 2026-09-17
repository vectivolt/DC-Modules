/* fsm.h — production supervisory FSM + protection evaluator for the 30/60/120 kW modules.
 * Portable C99, no HAL dependency: the scheduler calls fsm_step() every 1 ms with measured
 * inputs; outputs command relays/PWM-enables/derate. Thresholds mirror
 * docs/protection-thresholds.md rev B; semantics are verified 1:1 against the 26-scenario
 * suite (calculations/system/fsm-sim.mjs) by firmware/test/host_sim.c on every build.
 * MCU integration: MCU-LLC runs this master FSM; MCU-PFC runs the subordinate enable/precharge
 * slice and mirrors PWM_KILL in hardware.
 * E78: the core knows no wire protocol. A protocol profile (firmware/proto/) fills the canonical command
 * (core/modapi.h) and sets the communication timeout; nothing in this file changes when a profile is added. */
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
  FC_IN_OV = 7, FC_IN_UV = 8, FC_PH_LOSS = 9, FC_TANK_OC = 11, FC_OUT_OVP = 13, FC_OUT_OC = 15, FC_OUT_SHORT = 16,
  FC_BANK_IMB = 17, FC_WELD = 18, FC_RELAY = 19, FC_PRECHG = 20, FC_DISCH = 21, FC_OT = 22, FC_FAN = 25,
  FC_AUX_UV = 26, FC_LINK = 27, FC_CAN_TO = 28, FC_SENSOR = 29, FC_CAL = 30, FC_LOCK = 31, FC_WDT = 32,
  FC_BACKFEED = 33, FC_START_TO = 34,  /* E76: soft-start / make-permit stall (F.34) */
  FC_OVERRUN = 35, FC_INTERNAL = 36,   /* E78: control-deadline overrun (HAL verdict) · a state value the enum does not define */
  FC_LINE_HZ = 37,                     /* E79: line frequency outside 45–65 Hz, or no zero crossing on a live line, for 200 ms */
  FC_HALF_OV = 38                      /* E80 (review HR-06/R10): a half-link above PMP_HALF_OV_V for 10 ms — the 860 V total
                                          and 40 V midpoint rows together still allowed one 450 V bank to reach 454–468 V */
} pmp_fault_t;

/* E78: what a latched row asks of the outside world (docs/firmware-architecture.md §4). AUTO rows clear themselves once
 * their condition has been gone for the recovery hold (2 s, doubling per consecutive AUTO latch up to 64 s); the module then
 * waits in STANDBY for a fresh ENABLE edge. AUTO_EXT rows are the grid's, so they never count toward F.31. LATCH rows need
 * CLEAR. LOCK needs a power cycle or service. */
typedef enum { FCL_NONE = 0, FCL_AUTO_EXT, FCL_AUTO_INT, FCL_LATCH, FCL_LOCK } pmp_fclass_t;

typedef enum { MODE_PAR = 0, MODE_SER = 1 } pmp_mode_t;
/* E67: output-voltage mode as the charging-module market sets it (UUGreen/ENR "set high or low voltage mode", Tonhe low/high
 * section, NIUERA 0xA0/0xA1/0xA2) — MODULE_CTL force_lv / force_hv, neither = AUTO. Applied only in STANDBY. */
typedef enum { OMODE_AUTO = 0, OMODE_LOW = 1, OMODE_HIGH = 2 } pmp_omode_t;

/* E78: relay mirror-contact bits (pmp_in_t.relay_fb / relay_fb_wired and pmp_relay_cmd) */
#define PMP_RLY_PRE   (1u << 0)
#define PMP_RLY_SER   (1u << 1)
#define PMP_RLY_PARA  (1u << 2)
#define PMP_RLY_PARB  (1u << 3)

typedef struct {            /* measured / external inputs, engineering units */
  float vin_ll;             /* the line-line VAC farthest from nominal — telemetry/display only (E80) */
  float vin_ll_min, vin_ll_max;   /* E80 (review R06/HR-24): each limit reads its own side — one "worst" scalar hid a
                                     280 / 505 / 505 V set from F.07, and fed a 505 V line's crest into precharge as 280 V */
  uint8_t phases_ok;        /* count of live phases */
  float vbus, vmid_frac;    /* total bus V; midpoint as fraction of bus */
  float vbank_a, vbank_b;
  float vout_meas, iout_meas, vext;
  bool ext_connected;
  float temp_max_c;         /* worst NTC zone (per-zone handling in zone table upstream) */
  bool fan_ok, aux_ok, wdt_ok;
  uint8_t fans_total, fans_failed;        /* E80 (FW-21): fans fitted and failed; fans_total 0 = fan_ok alone, as before (0.5) */
  bool desat_flt, oc_pfc_flt;             /* latched HW flags (read-clear) */
  uint32_t can_age_ms, link_age_ms;
  bool enable_req, clear_req;
  float vcmd, icmd;                       /* CAN setpoints — E77: non-finite or negative reads as 0, above the ceiling clamps */
  pmp_omode_t omode_req;                  /* E67: MODULE_CTL force_lv/force_hv (AUTO when neither) */
  bool shutdown_req;                      /* E77: controlled shutdown + link/bank discharge, acted on its rising edge in any
                                             state (a locked module can still be discharged for service) */
  bool wake_req;                          /* E78: leave OFF (re-precharge) — the only exit from OFF short of a power cycle */
  uint8_t relay_fb;                       /* E78: mirror-contact readback, PMP_RLY_* bits, 1 = main contact closed */
  uint8_t relay_fb_wired;                 /* E78: the PMP_RLY_* bits the HAL reads; 0 = none (F.19 blind, PMP_W_RELAY_FB_OFF) */
  bool ctl_overrun;                       /* E78: HAL verdict — the control ISR missed its deadline persistently (F.35) */
  pmp_fault_t hal_fault;                  /* E79: a row the HAL has already decided — a hardware latch it attributed (F.03 CMP4,
                                             F.11 tank window, F.13 CMP0), F.29 reference, F.30 calibration, F.36 stack, F.37 line
                                             frequency. Held while the condition lasts, FC_NONE otherwise. Latched in every state
                                             but the shutdown path; an AUTO row does not recover while the HAL still holds it. */
} pmp_in_t;

/* E77: conditions the core reports without stopping — recomputed every tick, carried to telemetry by the protocol layer */
#define PMP_W_LINE_WAIT    (1u << 0)   /* precharge holds: line out of range or not all phases present */
#define PMP_W_IN_RIDE      (1u << 1)   /* an input row is inside its persistence window (ride-through) */
#define PMP_W_DERATE_TH    (1u << 2)   /* thermal derate active */
#define PMP_W_DERATE_FAN   (1u << 3)   /* fan derate active */
#define PMP_W_COLD_STBY    (1u << 4)   /* STOP held past the warm hold: PFC off, matrix open */
#define PMP_W_NO_SETPOINT  (1u << 5)   /* start requested without a usable voltage setpoint or battery */
#define PMP_W_MEAS_GLITCH  (1u << 6)   /* a non-finite / out-of-range sample inside its persistence */
#define PMP_W_STOPPING     (1u << 7)   /* E78: controlled stop — the current reference ramps to zero before the LLC stops */
#define PMP_W_RELAY_FB_OFF (1u << 8)   /* E78: no relay feedback wired — F.19 cannot see a failed contact */
#define PMP_W_RECOVERING   (1u << 9)   /* E78: an AUTO row is waiting out its recovery hold */
#define PMP_W_REARM        (1u << 10)  /* E78: ENABLE is held, but a fresh edge is required after a module-initiated stop */

typedef struct {            /* commands to drivers/relays/loops */
  bool pfc_en, llc_en, pwm_kill;
  bool k_pre, k_ser, k_para, k_parb, q_disch;   /* E67: K_OUT + pre-insertion retired — the output blocking diode */
  bool q_disch_bk;          /* E76 (review R03): bank bleeders (CTL_QDISBK) — commanded during the matrix
                               make-permit wait, through MODESW and in SHUTDOWN/DISCH; default-OFF in hardware */
  bool stop_ramp;           /* E78: controlled stop in progress — core/ctl.c ramps the current reference to 0 */
  float derate;             /* 0..1 multiplier on power/current limits */
  pmp_mode_t mode;
  float vbus_ref;           /* E10 policy */
  float v_max;              /* E67: voltage-loop ceiling of the bank connection — PAR 500 V, SER 1000 V */
  uint32_t warn;            /* E77: PMP_W_* bits */
} pmp_out_t;

static inline uint8_t pmp_relay_cmd(const pmp_out_t *o) {   /* E78: the commanded contacts as PMP_RLY_* bits */
  return (uint8_t)((o->k_pre ? PMP_RLY_PRE : 0u) | (o->k_ser ? PMP_RLY_SER : 0u) | (o->k_para ? PMP_RLY_PARA : 0u) | (o->k_parb ? PMP_RLY_PARB : 0u));
}

typedef struct {
  pmp_state_t st;
  pmp_fault_t latched;
  uint8_t fault_count;      /* lifetime latches (saturating) */
  uint8_t counted;          /* E78: latches that count toward F.31 — AUTO_EXT rows do not */
  bool lock, need_enable;
  uint32_t t_ms, dwell_ms, sw_step, short_ms, weld_ms, prechg_ms, disch_ms, pre_blank_ms;
  uint32_t start_ms;        /* E76: STANDBY energized-start supervision (F.34 window) */
  uint32_t disch_to_ms;     /* F.21 window — runtime per rating (card strap), default = macro */
  uint32_t can_to_ms;       /* E78: communication timeout — owned by the active protocol profile (pmp_fsm_set_comm_timeout_ms) */
  float oc_line_a, oc_tank_a;  /* E60: F.01 / F.11 hardware-comparator thresholds, A pk, per rating —
                                  the HAL programs the CMP DACs from these (firmware may tighten, never loosen) */
  float i_rated_a;          /* E77: rated output current from the strap — the F.15 rows are relative to it (row 15) */
  /* E77: persistence counters (consecutive ms a row's condition has held) — the rows' documented detection times */
  uint16_t p_bad, p_mid, p_inov, p_inuv, p_ph, p_busuv, p_ocf, p_ocs, p_ovpa, p_ovps;
  uint16_t p_relay, p_aux;  /* E78: F.19 persistence · aux-stable hold out of SAFE */
  uint16_t p_half;          /* E80: F.38 half-link persistence */
  uint16_t p_make;          /* E80 (review HR-08): ms since the matrix close command — no mirror contacts on the matrix
                               relays (E67), so the soft start waits out operate + bounce instead of trusting the coil bit */
  uint32_t lock_t[5];       /* E77: times of the last PMP_LOCK_COUNT (5) latches — F.31 counts inside PMP_LOCK_WINDOW_MS */
  uint8_t lock_i;
  uint32_t idle_ms;         /* E77: STANDBY time without a start request while still warm */
  bool shut_prev;           /* E77: shutdown_req edge detector */
  uint32_t stop_ms;         /* E78: controlled-stop ramp timer */
  bool stop_can;            /* E78: the stop in progress is a communication loss — the PFC also stops at its end */
  uint32_t rec_ms, rec_hold_ms, last_auto_ms;  /* E78: AUTO recovery — condition-gone time, the hold it must reach, last AUTO latch */
  uint8_t auto_streak;      /* E78: consecutive AUTO latches inside PMP_LOCK_WINDOW_MS (sets the doubling hold) */
  pmp_omode_t omode;        /* E67: the mode in force for this session (latched from omode_req in STANDBY) */
  pmp_out_t out;
} pmp_fsm_t;

void pmp_fsm_init(pmp_fsm_t *f);
void pmp_fsm_step(pmp_fsm_t *f, const pmp_in_t *in);   /* call every 1 ms */
void pmp_fsm_set_comm_timeout_ms(pmp_fsm_t *f, uint32_t ms);   /* E78: profile-owned, clamped 100–60 000 ms */
pmp_fclass_t pmp_fault_class(pmp_fault_t c);                   /* E78 */
/* E80 (FW-21, firmware-architecture §7): the power a module may keep with failed fans — 4 fans (50 kW air): one failed 0.6, two
   0.3; 2–3 fans: one failed 0.5; fewer fans than that: 0, which is F.25 (AUTO_INT: it recovers when a fan runs again) */
float pmp_fan_derate(const pmp_in_t *in);
/* Card promise (CARD_RULES): ONE firmware image, rating read at boot from the RATING strap on
 * ROLE1's ADC (card 10k pull-up to V3P3, board resistor to DGND) — E24 rev G bands:
 *   <0.15 V  (0R)    -> 30 kW module
 *   0.15-0.55 (1k)   -> 40 kW module (E41)
 *   0.55-1.24 (3.32k)-> RESERVED (HAL treats this band as no host, fault)
 *   1.24-1.82 (10k)  -> 50 kW LIQUID module (E42 — HAL ties fan_ok = true: sealed, zero fans,
 *                       tach inputs held defined-low by the board)
 *   1.82-2.30 (15k)  -> 50 kW AIR module (E44 — 4 fans, all four tachs supervised incl. the
 *                       W39/pin-90 TACH4; fans 3+4 gang FAN_PWM2)
 *   >2.40 V  (open)  -> no host, fault.
 * Both 50 kW bands call pmp_fsm_set_rating_kw(50) — same link, same F.21 window; only the
 * fan personality differs (HAL, band-decided). Rev G retired rev F's single 1.24-2.40 band.
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
#define PMP_CAN_TO_MS     1000u     /* E78: the native profile's default; a profile sets its own at boot */
#define PMP_LINK_TO_MS      50u
/* E73: the precharge bypass closes at 90 % of line peak (fsm.c) and the remaining ≤ 10 % step drives an LC pulse through D1,
 * the CMC leakage and the rectifier into the link — 199 / 218 / 231 A pk simulated at 475 VAC on a stiff grid (current-coordination
 * [INRUSH]), above F.01. The PFC is not switching then, so F.01 is blanked for this window: relay operate ≤ 25 ms + bounce ≤ 5 ms +
 * the ≤ 10 ms pulse, with margin. PFC enable waits for the window to end. The HAL clears the HRTIMER fault latch at its end. */
#define PMP_PRE_BLANK_MS    60u
#define PMP_WELD_DV_V        1.5f
#define PMP_WELD_MS        200u
/* E78: the build value IS the product value (it read "30 u, scaled: 30 s in product" — a macro cannot be both, and a 30 s dwell
   would hold a battery that climbed past the 500 V PAR ceiling at zero current for 30 s). The 20 V hysteresis below prevents
   chatter; the dwell only has to outlast measurement noise and a load step. */
#define PMP_MODE_DWELL_MS 1000u
/* E80 (review HR-06/R10): absolute half-link ceiling, either half, 450 V cans. Normal worst half = 415 (830 ref) + 20
   (F.06 lets the midpoint move 40 V) + 3 ripple = 438 at the F.06 boundary; the 10 ms persistences overlap so whichever
   row's condition holds fires. Sensing is the calibrated ±1 % class: trip spans 435.6–444.4 V, under the can rating. */
#define PMP_HALF_OV_V      440.0f
#define PMP_HALF_OV_MS      10u
/* E80 (review HR-08): matrix relays carry no mirror contacts (E67) — the LLC waits out the RFQ operate ≤ 25 ms +
   bounce ≤ 5 ms with margin after a close command instead of starting on the next tick */
#define PMP_RELAY_MAKE_MS   40u
/* E67: LOW (banks parallel) ≤ 500 V, HIGH (banks series) ≥ 500 V. AUTO starts on the 500 V line and switches in RUN (stop,
   reconfigure, restart) with a 480 V return so a battery at the boundary cannot chatter; HIGH refuses a start below 480 V. */
#define PMP_XOVER_UP_V     480.0f
#define PMP_XOVER_DN_V     500.0f
#define PMP_PAR_VMAX_V     500.0f
#define PMP_SER_VMAX_V    1000.0f
/* E60: bus reference floor tracks the line — a Vienna rectifier cannot regulate below the line-line
   crest (cycle-by-cycle sim: 475 VAC on a 650 V bus = 75 % overmodulation, 15 % THD; with the floor
   0.1 % THD). vbus_ref = clamp(max(2·bank/0.95, K·√2·VLL), 650, 830). */
#define PMP_BUS_MIN_V      650.0f
#define PMP_BUS_MAX_V      830.0f
#define PMP_BUS_LINE_K       1.08f
/* E65: magnetics bond-loss cover — six NC 130 °C cutouts (one per D3/D2) run in series with the T_XFMR NTC. Any open
   cutout, or a broken NTC lead, pulls the channel to the rail; the HAL passes every NTC zone through this guard before
   taking the zone max, so an open loop reports PMP_NTC_OPEN_C and latches F.22 instead of reading "very cold".
   10 k pull-up / 10 k B3435 NTC reads ≤0.96 of Vref at −40 °C, so 0.98 never trips on a healthy cold sensor. */
#define PMP_NTC_OPEN_FRAC    0.98f
#define PMP_NTC_OPEN_C     150.0f
static inline float pmp_ntc_guard_c(float t_c, float adc_frac) { return adc_frac >= PMP_NTC_OPEN_FRAC ? PMP_NTC_OPEN_C : t_c; }
#define PMP_LOCK_COUNT       5u
/* E77: the documented row timings the E60–E76 code did not implement (every row latched on its first 1 ms sample, so a
   1 ms grid sag, phase dropout or midpoint spike ended a session), the F.31 window (the counter never decayed: five
   latches over a module's life locked it), and the limits a smooth, bounded core needs. */
#define PMP_LOCK_WINDOW_MS 600000u   /* row 29: 5 latches inside 10 min */
#define PMP_MID_MS            10u    /* row 6 */
#define PMP_IN_OV_MS          20u    /* row 7 */
#define PMP_IN_UV_MS         100u    /* row 8 — FW-R6 clamps the current reference through the ride-through */
#define PMP_PH_LOSS_MS        40u    /* row 9 */
#define PMP_BUS_UV_MS         10u    /* row 5 */
#define PMP_OC_FAST_FRAC      1.30f  /* row 15: 130 % of the RATED current for 2 ms (the CC loop is the primary limiter; the
                                        old test against the COMMAND latched whenever a controller lowered its setpoint) */
#define PMP_OC_FAST_MS         2u
#define PMP_OC_SLOW_FRAC      1.02f  /* row 15: 102 % of rated for 100 ms */
#define PMP_OC_SLOW_MS       100u
#define PMP_OUT_OVP_ABS_V   1050.0f  /* row 13 firmware mirror (CMP0 is the fast path, E75) */
#define PMP_OVP_MS             2u
#define PMP_OVP_SRC_MS       200u    /* the module's OWN stack above its command while it sources current: a CV failure.
                                        Vout is not compared with the command — behind DOUT a battery above it is normal */
#define PMP_BAD_SAMPLE_MS      3u    /* non-finite or physically impossible measurement → F.29 */
#define PMP_PRECHG_MAX_MS   5000u    /* an in-range line that never finishes precharge is bounded → F.20 */
#define PMP_WARM_HOLD_MS   60000u    /* after STOP: PFC and matrix stay ready this long, then PFC off + matrix open at
                                        zero current (the E63 standby ≤ 10 W target cannot hold with the PFC switching) */
#define PMP_DERATE_SLOPE      0.04f  /* thermal derate per °C above PMP_OT_DERATE_C: continuous, 60 % at the 115 °C trip */
#define PMP_DERATE_MIN_TH     0.60f
#define PMP_DERATE_UP_PER_MS  0.0002f /* recovery ≤ 20 %/s, reduction immediate — a limit that steps back up re-heats and hunts */
#define PMP_VCMD_START_MIN_V 100.0f  /* no start without a real voltage setpoint unless a battery sets the operating point */
/* E78: recovery (AUTO rows) and the controlled stop. The start / recovery line window sits 15 V inside the run window, so a grid
   at the edge cannot cycle the module (TonHe TH750 publishes the same 15 V class: 270/285, 490/475 VAC). */
#define PMP_IN_OV_RECOVER_V  485.0f
#define PMP_IN_UV_RECOVER_V  275.0f
#define PMP_OT_RECOVER_C     (PMP_OT_DERATE_C - 5.0f)
#define PMP_RECOVER_MS      2000u    /* first AUTO hold; doubles per consecutive AUTO latch */
#define PMP_RECOVER_STEPS      6u    /* 2 · 4 · 8 · 16 · 32 · 64 s */
#define PMP_STOP_RAMP_MS     100u    /* STOP / communication loss: current to < PMP_MAKE_IOUT_A, then the LLC stops */
#define PMP_RELAY_FB_MS      100u    /* F.19: operate ≤ 25 ms + bounce ≤ 5 ms, diode-suppressed release ≤ 35 ms */
#define PMP_AUX_STABLE_MS    500u    /* SAFE → STANDBY only after the aux has held this long */
/* E76 (review R05): a start that neither completes nor faults must not stay energized unsupervised —
   the STANDBY make-permit wait and the soft-start each fit well inside this window (bank bleed to the
   permit level is 0.12–0.7 s; the CV ramp is sub-second); a stall latches F.34. */
#define PMP_START_TO_MS   8000u
/* E76 (review R03): matrix make-permit margin — the new bank connection must sit at least this far
   below the output node (battery when connected, else the terminal capacitors) so DOUT stays
   reverse-biased at contact make; with the 60 V floor an unloaded make is bounded at ~12 mJ. */
#define PMP_MAKE_MARGIN_V   10.0f
#define PMP_MAKE_FLOOR_V    60.0f
#define PMP_MAKE_IOUT_A      2.0f
/* F.21 discharge supervision (R2 review: the doc row previously had no implementation).
   Physics scales with bus C: t(<60 V) ≈ 2.0 / 3.6 / 7.2 s at 30/60/120 kW (640 Ω, 850 V) —
   HAL builds override per SKU: 30 kW 3000, 60 kW 5500, 120 kW 9000. Default covers the worst. */
#ifndef PMP_DISCH_TO_MS
#define PMP_DISCH_TO_MS   9000u
#endif
#endif
