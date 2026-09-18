/* fsm.h — the supervisory state machine and protection evaluator of the 30 / 40 / 50 kW module.
 * Portable C99, no HAL dependency: the scheduler calls pmp_fsm_step() every 1 ms with measured inputs; the outputs
 * command the relays, the stage enables and the derate. Thresholds mirror docs/protection-thresholds.md; the semantics
 * are verified against the scenario suite (calculations/system/fsm-sim.mjs) by firmware/test/host_sim.c on every build.
 * One MCU runs this machine for both stages of the module.
 * The core knows no wire protocol: a protocol profile (firmware/proto/) fills the canonical command (core/modapi.h) and
 * sets the communication timeout; nothing in this file changes when a profile is added. */
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
  FC_BACKFEED = 33, FC_START_TO = 34,  /* soft-start / make-permit stall (F.34) */
  FC_OVERRUN = 35, FC_INTERNAL = 36,   /* control-deadline overrun (HAL verdict) · a state value the enum does not define */
  FC_LINE_HZ = 37,                     /* line frequency outside 45–65 Hz, or no zero crossing on a live line, for 200 ms */
  FC_HALF_OV = 38                      /* a half-link above PMP_HALF_OV_V for 10 ms — the 860 V total and 40 V midpoint
                                          rows together still allow one 450 V bank to reach 454–468 V */
} pmp_fault_t;

/* What a latched row asks of the outside world (docs/firmware-architecture.md §4). AUTO rows clear themselves once
 * their condition has been gone for the recovery hold (2 s, doubling per consecutive AUTO latch up to 64 s); the module then
 * waits in STANDBY for a fresh ENABLE edge. AUTO_EXT rows are the grid's, so they never count toward F.31. LATCH rows need
 * CLEAR. LOCK needs a power cycle or service. */
typedef enum { FCL_NONE = 0, FCL_AUTO_EXT, FCL_AUTO_INT, FCL_LATCH, FCL_LOCK } pmp_fclass_t;

typedef enum { MODE_PAR = 0, MODE_SER = 1 } pmp_mode_t;
/* Output-voltage mode as the charging-module market sets it (UUGreen/ENR "set high or low voltage mode", Tonhe low/high
 * section, NIUERA 0xA0/0xA1/0xA2) — MODULE_CTL force_lv / force_hv, neither = AUTO. Applied only in STANDBY. */
typedef enum { OMODE_AUTO = 0, OMODE_LOW = 1, OMODE_HIGH = 2 } pmp_omode_t;

/* relay mirror-contact bits (pmp_in_t.relay_fb / relay_fb_wired and pmp_relay_cmd) */
#define PMP_RLY_PRE   (1u << 0)
#define PMP_RLY_SER   (1u << 1)
#define PMP_RLY_PARA  (1u << 2)
#define PMP_RLY_PARB  (1u << 3)

typedef struct {            /* measured / external inputs, engineering units */
  float vin_ll;             /* the line-line VAC farthest from nominal — telemetry/display only */
  float vin_ll_min, vin_ll_max;   /* each limit reads its own side — one "worst" scalar hides a 280 / 505 / 505 V set
                                     from F.07, and feeds a 505 V line's crest into precharge as 280 V */
  uint8_t phases_ok;        /* count of live phases */
  float vbus, vmid_frac;    /* total bus V; midpoint as fraction of bus */
  float vbank_a, vbank_b;
  float vout_meas, iout_meas, vext;
  bool ext_connected;
  float temp_max_c;         /* worst NTC zone (per-zone handling in zone table upstream) */
  bool fan_ok, aux_ok, wdt_ok;
  uint8_t fans_total, fans_failed;        /* fans fitted and failed; fans_total 0 = fan_ok alone (0.5) */
  bool desat_flt, oc_pfc_flt;             /* latched HW flags (read-clear) */
  uint32_t can_age_ms, link_age_ms;
  bool enable_req, clear_req;
  float vcmd, icmd;                       /* CAN setpoints — non-finite or negative reads as 0, above the ceiling clamps */
  pmp_omode_t omode_req;                  /* MODULE_CTL force_lv/force_hv (AUTO when neither) */
  bool shutdown_req;                      /* controlled shutdown + link/bank discharge, acted on its rising edge in any
                                             state (a locked module can still be discharged for service) */
  bool wake_req;                          /* leave OFF (re-precharge) — the only exit from OFF short of a power cycle */
  uint8_t relay_fb;                       /* mirror-contact readback, PMP_RLY_* bits, 1 = main contact closed */
  uint8_t relay_fb_wired;                 /* the PMP_RLY_* bits the HAL reads; 0 = none (F.19 blind, PMP_W_RELAY_FB_OFF) */
  bool ctl_overrun;                       /* HAL verdict — the control ISR missed its deadline persistently (F.35) */
  pmp_fault_t hal_fault;                  /* a row the HAL has already decided — a hardware latch it attributed (F.03 CMP4,
                                             F.11 tank window, F.13 CMP0), F.29 reference, F.30 calibration, F.36 stack, F.37 line
                                             frequency. Held while the condition lasts, FC_NONE otherwise. Latched in every state
                                             but the shutdown path; an AUTO row does not recover while the HAL still holds it. */
} pmp_in_t;

/* Conditions the core reports without stopping — recomputed every tick, carried to telemetry by the protocol layer */
#define PMP_W_LINE_WAIT    (1u << 0)   /* precharge holds: line out of range or not all phases present */
#define PMP_W_IN_RIDE      (1u << 1)   /* an input row is inside its persistence window (ride-through) */
#define PMP_W_DERATE_TH    (1u << 2)   /* thermal derate active */
#define PMP_W_DERATE_FAN   (1u << 3)   /* fan derate active */
#define PMP_W_COLD_STBY    (1u << 4)   /* STOP held past the warm hold: PFC off, matrix open */
#define PMP_W_NO_SETPOINT  (1u << 5)   /* start requested without a usable voltage setpoint or battery */
#define PMP_W_MEAS_GLITCH  (1u << 6)   /* a non-finite / out-of-range sample inside its persistence */
#define PMP_W_STOPPING     (1u << 7)   /* controlled stop — the current reference ramps to zero before the LLC stops */
#define PMP_W_RELAY_FB_OFF (1u << 8)   /* no relay feedback wired — F.19 cannot see a failed contact */
#define PMP_W_RECOVERING   (1u << 9)   /* an AUTO row is waiting out its recovery hold */
#define PMP_W_REARM        (1u << 10)  /* ENABLE is held, but a fresh edge is required after a module-initiated stop */
#define PMP_W_COMMS_LOST   (1u << 11)  /* the controller is past its timeout — F.28 stops the module gracefully and never
                                          writes a fault code, so without this bit a technician sees a module that stopped
                                          for no stated reason (warn = 0, fault = 0). The bit is the report; the row stays
                                          un-latched. */

typedef struct {            /* commands to drivers/relays/loops */
  bool pfc_en, llc_en, pwm_kill;
  bool k_pre, k_ser, k_para, k_parb, q_disch;   /* the output is isolated by a blocking diode, not a contactor */
  bool q_disch_bk;          /* bank bleeders (CTL_QDISBK) — commanded during the matrix make-permit wait,
                               through MODESW and in SHUTDOWN/DISCH; default-OFF in hardware */
  bool stop_ramp;           /* controlled stop in progress — core/ctl.c ramps the current reference to 0 */
  float derate;             /* 0..1 multiplier on power/current limits */
  pmp_mode_t mode;
  float vbus_ref;           /* commanded DC-link reference (bus_ref_for) */
  float v_max;              /* voltage-loop ceiling of the bank connection — PAR 500 V, SER 1000 V */
  uint32_t warn;            /* PMP_W_* bits */
} pmp_out_t;

static inline uint8_t pmp_relay_cmd(const pmp_out_t *o) {   /* the commanded contacts as PMP_RLY_* bits */
  return (uint8_t)((o->k_pre ? PMP_RLY_PRE : 0u) | (o->k_ser ? PMP_RLY_SER : 0u) | (o->k_para ? PMP_RLY_PARA : 0u) | (o->k_parb ? PMP_RLY_PARB : 0u));
}

typedef struct {
  pmp_state_t st;
  pmp_fault_t latched;
  uint8_t fault_count;      /* lifetime latches (saturating) */
  uint8_t counted;          /* latches that count toward F.31 — AUTO_EXT rows do not */
  bool lock, need_enable;
  uint32_t t_ms, dwell_ms, sw_step, short_ms, weld_ms, prechg_ms, pre_total_ms, disch_ms, pre_blank_ms;
  float vin_nom;            /* the line this site normally has — follows vin_ll_min up over ≈ 0.1 s, down over ≈ 5 s */
  float vbk_prev[2];        /* the bank readings a tick ago, for the stopped-bridge plausibility test (a bank cannot halve in 1 ms) */
  uint16_t line_evt_ms;     /* ms since the line was last disturbed (saturating) */
  uint16_t mtx_ms; uint8_t mtx_prev;   /* ms since a matrix contact was last commanded, and those commands — a make (or a welded
                                          contact behind one) can move a bank in a millisecond, so the bank test waits it out */
  float pre_v_prev, pre_v_last;   /* the two last PMP_PRE_SETTLE_MS link samples of the running precharge */
  uint32_t start_ms;        /* STANDBY energized-start supervision (F.34 window) */
  uint32_t disch_to_ms;     /* F.21 window — runtime per rating (card strap), default = macro */
  uint32_t can_to_ms;       /* communication timeout — owned by the active protocol profile (pmp_fsm_set_comm_timeout_ms) */
  float oc_line_a, oc_tank_a;  /* F.01 / F.11 hardware-comparator thresholds, A pk, per rating —
                                  the HAL programs the CMP DACs from these (firmware may tighten, never loosen) */
  float i_rated_a;          /* rated output current from the strap — the F.15 rows are relative to it (row 15) */
  /* persistence counters (consecutive ms a row's condition has held) — the rows' documented detection times */
  uint16_t p_bad, p_mid, p_inov, p_inuv, p_ph, p_busuv, p_ocf, p_ocs, p_ovpa, p_ovps;
  uint16_t p_relay, p_aux;  /* F.19 persistence · aux-stable hold out of SAFE, and the INIT aux wait */
  uint16_t p_occ;           /* ms the output current has stood above the COMMAND by the F.15c margin */
  uint16_t p_disch;         /* ms the link and both banks have read below 60 V on plausible samples */
  uint8_t stall_n;          /* consecutive 100 ms discharge samples in which the link did not fall */
  float disch_v;            /* the link 100 ms ago */
  uint16_t p_half;          /* F.38 half-link persistence */
  uint16_t p_bank;          /* F.17 bank-imbalance persistence — the documented 10 ms */
  uint16_t p_line;          /* ms parked in PRECHG on an out-of-range line */
  uint16_t p_make;          /* ms since the matrix close command — no mirror contacts on the matrix relays, so the soft
                               start waits out operate + bounce instead of trusting the coil bit */
  uint32_t lock_t[5];       /* times of the last PMP_LOCK_COUNT (5) latches — F.31 counts inside PMP_LOCK_WINDOW_MS */
  uint8_t lock_i;
  uint32_t idle_ms;         /* STANDBY time without a start request while still warm */
  bool shut_prev;           /* shutdown_req edge detector */
  uint32_t stop_ms;         /* controlled-stop ramp timer */
  bool stop_can;            /* the stop in progress is a communication loss — the PFC also stops at its end */
  uint32_t rec_ms, rec_hold_ms, last_auto_ms;  /* AUTO recovery — condition-gone time, the hold it must reach, last AUTO latch */
  uint8_t auto_streak;      /* consecutive AUTO latches inside PMP_LOCK_WINDOW_MS (sets the doubling hold) */
  pmp_omode_t omode;        /* the mode in force for this session (latched from omode_req in STANDBY) */
  pmp_out_t out;
} pmp_fsm_t;

void pmp_fsm_init(pmp_fsm_t *f);
void pmp_fsm_step(pmp_fsm_t *f, const pmp_in_t *in);   /* call every 1 ms */
void pmp_fsm_set_comm_timeout_ms(pmp_fsm_t *f, uint32_t ms);   /* profile-owned, clamped 100–60 000 ms */
void pmp_fsm_resume_shutdown(pmp_fsm_t *f);                    /* resume a discharge that a reset interrupted */
pmp_fclass_t pmp_fault_class(pmp_fault_t c);
/* The power a module may keep with failed fans (firmware-architecture §7) — 4 fans (50 kW air): one failed 0.6, two
   0.3; 2–3 fans: one failed 0.5; fewer fans than that: 0, which is F.25 (AUTO_INT: it recovers when a fan runs again) */
float pmp_fan_derate(const pmp_in_t *in);
/* Card promise (CARD_RULES): ONE firmware image, rating read at boot from the RATING strap on
 * ROLE1's ADC (card 10k pull-up to V3P3, board resistor to DGND) — bands:
 *   <0.15 V  (0R)    -> 30 kW module
 *   0.15-0.55 (1k)   -> 40 kW module
 *   0.55-1.24 (3.32k)-> RESERVED (HAL treats this band as no host, fault)
 *   1.24-1.82 (10k)  -> 50 kW LIQUID module (HAL ties fan_ok = true: sealed, zero fans,
 *                       tach inputs held defined-low by the board)
 *   1.82-2.30 (15k)  -> 50 kW AIR module (4 fans, all four tachs supervised incl. the
 *                       W39/pin-90 TACH4; fans 3+4 gang FAN_PWM2)
 *   >2.40 V  (open)  -> no host, fault.
 * Both 50 kW bands call pmp_fsm_set_rating_kw(50) — same link, same F.21 window; only the
 * fan personality differs (HAL, band-decided). The two 50 kW bands are separate on purpose:
 * one band spanning 1.24-2.40 V cannot tell a sealed liquid card from a four-fan air card.
 * HAL decodes the band and calls this once before enabling; unknown ratings keep the
 * worst-case default window (longer timeout = later F.21 report, never an unsafe one). */
void pmp_fsm_set_rating_kw(pmp_fsm_t *f, uint16_t kw);
const char *pmp_state_name(pmp_state_t s);

/* thresholds (docs/protection-thresholds.md) — exposed for EOL/limits telemetry */
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
#define PMP_CAN_TO_MS     1000u     /* the native profile's default; a profile sets its own at boot */
#define PMP_LINK_TO_MS      50u
/* The precharge bypass closes at 90 % of line peak (fsm.c) and the remaining ≤ 10 % step drives an LC pulse through D1,
 * the CMC leakage and the rectifier into the link — 199 / 218 / 231 A pk simulated at 475 VAC on a stiff grid (current-coordination
 * [INRUSH]), above F.01. The PFC is not switching then, so F.01 is blanked for this window: relay operate ≤ 25 ms + bounce ≤ 5 ms +
 * the ≤ 10 ms pulse, with margin. PFC enable waits for the window to end. The HAL clears the HRTIMER fault latch at its end. */
#define PMP_PRE_BLANK_MS    60u
/* F.18: a welded bypass pole is invisible while the contact is COMMANDED closed, which is every state but precharge and
   the commanded discharge, and precharge is over in 61 ms (below F.19's 100 ms window). The discharge is the one place
   the command is open for long enough to mean something, so the release is checked there. */
#define PMP_WELD_MS        200u
/* The build value IS the product value: a macro cannot be one thing in test and another in the field, and a 30 s dwell
   would hold a battery that climbed past the 500 V PAR ceiling at zero current for 30 s. The 20 V hysteresis below
   prevents chatter; the dwell only has to outlast measurement noise and a load step. */
#define PMP_MODE_DWELL_MS 1000u
/* Absolute half-link ceiling, either half, 500 V cans. Normal worst half = 415 (830 ref) + 20 (F.06 lets the midpoint
   move 40 V) + 3 ripple = 438 at the F.06 boundary; the 10 ms persistences overlap so whichever row's condition holds
   fires. Sensing is the calibrated ±1 % class plus the live reference (±0.2 % class, bounded at ±2 % → F.29): the trip
   spans 431–449 V at the bound, under the can rating. */
#define PMP_HALF_OV_V      440.0f
#define PMP_HALF_OV_MS      10u
/* Matrix relays carry no mirror contacts — the LLC waits out the RFQ operate ≤ 25 ms + bounce ≤ 5 ms with margin
   after a close command instead of starting on the next tick */
#define PMP_RELAY_MAKE_MS   40u
/* LOW (banks parallel) ≤ 500 V, HIGH (banks series) ≥ 500 V. AUTO starts on the 500 V line and switches in RUN (stop,
   reconfigure, restart) with a 480 V return so a battery at the boundary cannot chatter; HIGH refuses a start below 480 V. */
#define PMP_XOVER_UP_V     480.0f
#define PMP_XOVER_DN_V     500.0f
#define PMP_PAR_VMAX_V     500.0f
#define PMP_SER_VMAX_V    1000.0f
/* Bus reference floor tracks the line — a Vienna rectifier cannot regulate below the line-line
   crest (cycle-by-cycle sim: 475 VAC on a 650 V bus = 75 % overmodulation, 15 % THD; with the floor
   0.1 % THD). vbus_ref = clamp(max(2·bank/0.95, K·√2·VLL), 650, 830). */
#define PMP_BUS_MIN_V      650.0f
#define PMP_BUS_MAX_V      830.0f
#define PMP_BUS_LINE_K       1.08f
/* The link reference LEADS THE MEASURED OUTPUT by this much instead of jumping to the command. Vehicles send their
   MAXIMUM voltage as the setpoint and charge in constant current far below it, so a reference taken from the command
   parks the link at 830 V over a 330 V pack: gain 0.80 instead of 0.95 — the bridge pushed up to f_max and into phase
   shift in the middle of the mainstream range, with the turn-off and weak-leg losses that go with it — and every start
   into a discharged output crossing deep phase shift against the full 830 V (the weak-leg energy goes with V²). */
#define PMP_BUS_LEAD_V      25.0f
/* Magnetics bond-loss cover — six NC 130 °C cutouts (one per D3/D2) run in series with the T_XFMR NTC. Any open
   cutout, or a broken NTC lead, pulls the channel to the rail; the HAL passes every NTC zone through this guard before
   taking the zone max, so an open loop reports PMP_NTC_OPEN_C and latches F.22 instead of reading "very cold".
   10 k pull-up / 10 k B3435 NTC reads ≤0.96 of Vref at −40 °C, so 0.98 never trips on a healthy cold sensor. */
#define PMP_NTC_OPEN_FRAC    0.98f
#define PMP_NTC_OPEN_C     150.0f
static inline float pmp_ntc_guard_c(float t_c, float adc_frac) { return adc_frac >= PMP_NTC_OPEN_FRAC ? PMP_NTC_OPEN_C : t_c; }
#define PMP_LOCK_COUNT       5u
/* The documented row timings: without them every row latches on its first 1 ms sample, so a 1 ms grid sag, phase
   dropout or midpoint spike ends a session. The F.31 window makes the lock counter decay, or five latches over a
   module's life lock it. Together with the limits a smooth, bounded core needs. */
#define PMP_LOCK_WINDOW_MS 600000u   /* row 29: 5 latches inside 10 min */
#define PMP_MID_MS            10u    /* row 6 */
#define PMP_IN_OV_MS          20u    /* row 7 */
#define PMP_IN_UV_MS         100u    /* row 8 — the PFC input-current clamp holds through the ride-through */
#define PMP_PH_LOSS_MS        40u    /* row 9 */
#define PMP_BUS_UV_MS         10u    /* row 5 */
/* F.05 is the module's row (AUTO_INT, counted toward F.31) — but at 400 VAC the passive rectifier crest is 566 V, under
   the fixed 620 V floor, so ANY line interruption longer than the link's ride-through (≈ 12 ms at rated power) latches
   it, and five brown-outs inside ten minutes would lock the module. The line is the cause, yet vin_ll_min/max are
   per-cycle rms values and so are up to one cycle (20 ms) STALE when the row fires: the grid evidence arrives AFTER the
   effect. The row is therefore re-filed as the grid's — and its count taken back — if the line is found outside its
   window inside this window. A bus that collapses on a HEALTHY line stays the module's, and stays counted. */
#define PMP_BUSUV_GRID_MS    200u
#define PMP_OC_FAST_FRAC      1.30f  /* row 15: 130 % of the RATED current for 2 ms (the CC loop is the primary limiter; a
                                        test against the COMMAND alone latches whenever a controller lowers its setpoint) */
#define PMP_OC_FAST_MS         2u
#define PMP_OC_SLOW_FRAC      1.02f  /* row 15: 102 % of rated for 100 ms */
#define PMP_OC_SLOW_MS       100u
/* Row 15 relative to the COMMAND, with margin and persistence. Rated-only rows leave nothing limiting delivery against
   what the vehicle asked for, and the CC loop — a wound-up integrator, a shorted shunt amplifier, a stuck reference —
   becomes its own only supervisor: 160 A into a 10 A request can run for 60 s with no row. The margin is wide enough
   that no CC transient reaches it (the loop's own overshoot class is ~25 % of the COMMAND) and the 500 ms is five
   times the slow row's, so it can only fire on a delivery that is wrong, not late. Suppressed while the stop ramp
   takes the output down and while nothing is commanded (a zero command is the ramp-down case a bare iout > 1.3·icmd
   test trips on; F.15 fast/slow and the hardware rows stay armed). */
#define PMP_OC_CMD_FRAC       0.15f  /* of RATED, added to the command */
#define PMP_OC_CMD_MIN_A      5.0f   /* … or this, whichever is larger: a 2 A command must not sit against a 0.3 A band */
#define PMP_OC_CMD_MS        500u
#define PMP_OUT_OVP_ABS_V   1050.0f  /* row 13 firmware mirror (CMP0 is the fast path) */
#define PMP_OVP_MS             2u
#define PMP_OVP_SRC_MS       200u    /* the module's OWN stack above its command while it sources current: a CV failure.
                                        Vout is not compared with the command — behind DOUT a battery above it is normal */
#define PMP_BAD_SAMPLE_MS      3u    /* non-finite or physically impossible measurement → F.29 */
#define PMP_PRECHG_MAX_MS   5000u    /* an in-range line that never finishes precharge is bounded → F.20 */
#define PMP_BANK_IMB_MS       10u    /* protection-thresholds row 17 — F.17 needs 10 ms, not one sample */
#define PMP_LINE_WAIT_MS   10000u    /* PRECHG on an out-of-range line is reported after this, not held silently
                                        with the precharge resistors carrying the 110 W bus-fed aux */
#define PMP_PRE_SETTLE_MS     20u    /* the link is sampled every 20 ms of precharge … */
#define PMP_PRE_SETTLE_DV    3.0f    /* … and has settled when two consecutive 20 ms steps moved it < 3 V: ≤ 18 V below its final value at τ = 124 ms */
#define PMP_BYPASS_MIN_K    0.85f    /* … provided it sits above this fraction of 1.414·V_LL(rms) (flat-topped mains: 0.96–0.99) */
#define PMP_WARM_HOLD_MS   60000u    /* after STOP: PFC and matrix stay ready this long, then PFC off + matrix open at
                                        zero current (the standby ≤ 10 W target cannot hold with the PFC switching) */
#define PMP_DERATE_SLOPE      0.04f  /* thermal derate per °C above PMP_OT_DERATE_C: continuous, 60 % at the 115 °C trip */
#define PMP_DERATE_MIN_TH     0.60f
#define PMP_DERATE_UP_PER_MS  0.0002f /* recovery ≤ 20 %/s, reduction immediate — a limit that steps back up re-heats and hunts */
#define PMP_VCMD_START_MIN_V 150.0f  /* no start without a real voltage setpoint unless a battery sets the operating point — the
                                        shaper's lowest regulated output (ctl.c v_min_v): a 100–122 V command was accepted here,
                                        raised to 150 V there, and then latched F.13's sourcing row against its own command */
/* Recovery (AUTO rows) and the controlled stop. The start / recovery line window sits 15 V inside the run window, so a grid
   at the edge cannot cycle the module (TonHe TH750 publishes the same 15 V class: 270/285, 490/475 VAC). */
#define PMP_IN_OV_RECOVER_V  485.0f
#define PMP_IN_UV_RECOVER_V  275.0f
/* F.01 at a LINE RETURN is the grid's, not the module's. After a sag or an interruption the link sits near the line
   crest; when the line steps back the EMI filter rings above it and the boost DIODES conduct a surge the switches
   cannot stop — 121–199 A pk against F.01 at 120 / 155 / 195 A on a stiff (50 µH) site, the 30 kW worst because the
   surge is the filter's and barely scales with the rating. The comparator is right to fire; the class is what matters:
   F.01 is a LATCH row, so taken at face value every utility dip takes the module out of service until somebody sends a
   CLEAR. A line over-current inside PMP_LINE_EVT_MS of a disturbed line (a phase missing, or the lowest line more than
   10 % under what this site normally shows — the absolute 260 V row never sees a −30 % sag from 400 V) is filed as
   F.08, AUTO_EXT and uncounted: the latch opens the bypass, the recovery re-precharges through the 33 Ω parts, and
   delivery resumes by itself. The same trip on a quiet line is F.01 and latches. */
#define PMP_LINE_EVT_K       0.90f
#define PMP_LINE_EVT_MS      500u
#define PMP_OT_RECOVER_C     (PMP_OT_DERATE_C - 5.0f)
#define PMP_RECOVER_MS      2000u    /* first AUTO hold; doubles per consecutive AUTO latch */
#define PMP_RECOVER_STEPS      6u    /* 2 · 4 · 8 · 16 · 32 · 64 s */
#define PMP_STOP_RAMP_MS     100u    /* STOP / communication loss: current to < PMP_MAKE_IOUT_A, then the LLC stops */
#define PMP_RELAY_FB_MS      100u    /* F.19: operate ≤ 25 ms + bounce ≤ 5 ms, diode-suppressed release ≤ 35 ms */
#define PMP_AUX_STABLE_MS    500u    /* SAFE → STANDBY only after the aux has held this long */
/* INIT and SAFE are both bounded by F.26. Unbounded, a dead V15 rail, an open DRV_RDY or an ADC channel stuck low
   presents as a module that does nothing, reports nothing and answers telemetry with PRECHARGE or SAFE for ever. The
   row is AUTO_INT: it is the module's, and it clears itself when the rail returns (recovered() reads aux_ok, not the
   line — an aux row must not self-clear into the same dead rail). */
#define PMP_AUX_WAIT_MS     5000u
/* A start that neither completes nor faults must not stay energized unsupervised —
   the STANDBY make-permit wait and the soft-start each fit well inside this window (bank bleed to the
   permit level is 0.12–0.7 s; the CV ramp is sub-second); a stall latches F.34. */
#define PMP_START_TO_MS   8000u
/* Matrix make-permit margin — the new bank connection must sit at least this far
   below the output node (battery when connected, else the terminal capacitors) so DOUT stays
   reverse-biased at contact make; with the 60 V floor an unloaded make is bounded at ~12 mJ. */
#define PMP_MAKE_MARGIN_V   10.0f
#define PMP_MAKE_FLOOR_V    60.0f
#define PMP_MAKE_IOUT_A      2.0f
/* F.21 discharge supervision. The window scales with the link capacitance and is selected per rating by
   pmp_fsm_set_rating_kw() (3 / 4 / 5 s at 30 / 40 / 50 kW). This default applies only while the RATING strap is
   undecoded: it is longer than every SKU window, so an undecoded strap can delay the F.21 report but never miss it. */
#ifndef PMP_DISCH_TO_MS
#define PMP_DISCH_TO_MS   9000u
#endif
/* The dump must not end on ONE sample of three channels — a single glitched low reading would finish a discharge with
   the link at 700 V. Every other row in this file carries a persistence; so does this one, on plausible samples. */
#define PMP_DISCH_OK_MS    100u
/* The OUTPUT node is not part of that window. Nothing in the module dumps it — the passive 450 kΩ bleeder is the only
   path (τ ≈ 4.2 s: 1000 V → 60 V in ≈ 12 s, three times the 3–5 s F.21 window), and a connected pack never falls at
   all. So the node is waited out AFTER the link and banks are down, under its own bound, and its expiry is not a
   fault: the link and both banks — everything the module can act on — are already discharged. */
#define PMP_DISCH_OUT_MS 20000u
/* A discharge commanded with the AC still applied is fed through the permanent precharge path: the link
   stops falling at the level where the 640 Ω dump chain balances that feed, and ~154 W then stands in each 25 W RDIS
   part for the whole F.21 window. A link that is not falling is not discharging — report F.21 and stop the dump at
   300 ms instead of at 3–9 s. Checked only while the link is above the 60 V exit level (the tail of a healthy dump is
   slow by construction, and by then there is nothing left to dissipate). */
#define PMP_DISCH_STALL_DV   2.0f    /* < 2 V per 100 ms sample = dV/dt > −20 V/s */
#define PMP_DISCH_STALL_N      3u    /* … in three consecutive samples */
#endif
