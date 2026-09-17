/* fsm.c — see fsm.h. Logic is the normative implementation of the validated model
 * (calculations/system/fsm-sim.mjs); host_sim.c proves scenario-for-scenario equivalence. */
#include "fsm.h"
#include <math.h>

/* E60/E65 bus reference: the tank must reach the bank voltage it is actually delivering into — gain = 2·bank/bus (E67 full
 * bridge, n = 2) stays inside the simulated envelope (≤1.205 at the 830 V cap, 500 V bank) only if the reference follows that bank. */
static float bus_ref_for(pmp_mode_t mode, float v_op, float vin_ll) {
  float bank = (mode == MODE_SER) ? 0.5f * v_op : v_op;
  return fminf(PMP_BUS_MAX_V, fmaxf(PMP_BUS_MIN_V, fmaxf(2.0f * bank / 0.95f, PMP_BUS_LINE_K * 1.414f * vin_ll)));
}

typedef char pmp_lock_ring_matches[(sizeof(((pmp_fsm_t *)0)->lock_t) / sizeof(uint32_t) == PMP_LOCK_COUNT) ? 1 : -1];

/* E78: the recovery class of every row (docs/firmware-architecture.md §4 — the protection hierarchy) */
pmp_fclass_t pmp_fault_class(pmp_fault_t c) {
  switch (c) {
  case FC_NONE: return FCL_NONE;
  case FC_IN_OV: case FC_IN_UV: case FC_PH_LOSS: case FC_LINE_HZ: return FCL_AUTO_EXT;  /* the grid's */
  case FC_BUS_UV: case FC_MID_IMB: case FC_OT: case FC_FAN: return FCL_AUTO_INT;   /* the module's, recoverable, counted */
  /* F.34 stays LATCH: a start that neither completed nor faulted has no known cause, and retrying it re-energizes the stall */
  case FC_LOCK: return FCL_LOCK;
  default: return FCL_LATCH;
  }
}

static void latch(pmp_fsm_t *f, pmp_fault_t code) {
  if (f->latched != FC_NONE || f->lock) return;
  pmp_fclass_t cl = pmp_fault_class(code);
  f->latched = code;
  if (f->fault_count < 0xFFu) f->fault_count++;       /* lifetime statistic; E78: saturating (it wrapped at 256) */
  f->st = ST_FAULT;
  f->out.pfc_en = false; f->out.llc_en = false; f->out.pwm_kill = true; f->out.stop_ramp = false;
  f->rec_ms = 0;
  if (cl == FCL_AUTO_EXT || cl == FCL_AUTO_INT) {      /* E78: the recovery hold doubles per consecutive AUTO latch */
    if (f->t_ms - f->last_auto_ms > PMP_LOCK_WINDOW_MS) f->auto_streak = 0;
    if (f->auto_streak < PMP_RECOVER_STEPS) f->auto_streak++;
    f->last_auto_ms = f->t_ms;
    f->rec_hold_ms = PMP_RECOVER_MS << (f->auto_streak - 1u);
  }
  if (cl == FCL_AUTO_EXT) return;                      /* E78: a sagging grid must not lock a healthy module */
  if (f->counted < 0xFFu) f->counted++;
  f->lock_t[f->lock_i] = f->t_ms;
  f->lock_i = (uint8_t)((f->lock_i + 1u) % PMP_LOCK_COUNT);
  /* E77: F.31 is PMP_LOCK_COUNT latches inside PMP_LOCK_WINDOW_MS (row 29). lock_i now indexes the oldest of the last five.
     The E24–E76 counter never decayed, so five latches spread over a module's life locked it until a power cycle. */
  if (f->counted >= PMP_LOCK_COUNT && f->t_ms - f->lock_t[f->lock_i] <= PMP_LOCK_WINDOW_MS) { f->lock = true; f->st = ST_LOCK; }
}

/* E77: consecutive-ms persistence — a row fires only after its condition has held for its documented detection time */
static bool persist(uint16_t *c, bool cond, uint16_t ms) {
  *c = cond ? (uint16_t)(*c < 0xFFFFu ? *c + 1u : *c) : 0u;
  return *c >= ms;
}
static bool in_range(float x, float lo, float hi) { return isfinite(x) && x >= lo && x <= hi; }

/* E78: an AUTO row's condition is gone — the hottest zone is back below the derate onset less 5 °C, or the line is back inside
   the start window (15 V inside the trip thresholds, all phases). Rows whose stage is off while latched (bus UV, midpoint, a
   stalled start) re-prove themselves on the restart, so they need only a healthy line. */
static bool recovered(const pmp_fsm_t *f, const pmp_in_t *in) {
  if (in->hal_fault == f->latched) return false;   /* E79: the HAL still holds the row (F.37 while the frequency is out) */
  if (f->latched == FC_OT)return in_range(in->temp_max_c, -60.0f, PMP_OT_RECOVER_C);
  if (f->latched == FC_FAN) return pmp_fan_derate(in) > 0.0f;   /* E80: a fan runs again */
  return in->vin_ll_min >= PMP_IN_UV_RECOVER_V && in->vin_ll_max <= PMP_IN_OV_RECOVER_V && in->phases_ok >= 3;
}

float pmp_fan_derate(const pmp_in_t *in) {
  if (in->fans_total == 0u) return in->fan_ok ? 1.0f : 0.5f;
  if (in->fans_failed == 0u) return 1.0f;
  if (in->fans_total >= 4u) return (in->fans_failed == 1u) ? 0.6f : (in->fans_failed == 2u) ? 0.3f : 0.0f;
  return (in->fans_failed == 1u) ? 0.5f : 0.0f;
}

void pmp_fsm_init(pmp_fsm_t *f) {
  *f = (pmp_fsm_t){0};
  /* worst-case-safe default AFTER the zeroing (a zero window would latch F.21 on the first
     ST_DISCH tick); HAL narrows per rating via pmp_fsm_set_rating_kw() */
  f->disch_to_ms = PMP_DISCH_TO_MS;
  f->oc_line_a = 120.0f; f->oc_tank_a = 140.0f;  /* E60/E67: lowest (30 kW) class until the strap is read */
  f->i_rated_a = 100.0f;                          /* E77: lowest rating until the strap is read — F.15 can only fire earlier */
  f->can_to_ms = PMP_CAN_TO_MS;                   /* E78: the active protocol profile sets its own before the first step */
  /* E78: "a restart after a reset needs a fresh request" is a protocol rule — what counts as fresh differs (a level must be
     seen low; an event must arrive) — so the profiles own it (vmp.c holds RUN until it sees RUN = 0; a TonHe start is an
     event). A core-level hold here would strand a TonHe module whose one start command arrived during precharge. */
  f->st = ST_INIT;
  f->out.derate = 1.0f;
  f->out.mode = MODE_PAR;
  f->out.v_max = PMP_PAR_VMAX_V;
  f->out.q_disch = false;
}

/* E81 (F-E-02): resume a commanded discharge after a reset — the HAL calls this from app_init when the no-init handoff
   says a discharge was in progress. ST_SHUTDOWN re-commands the dump and hands to ST_DISCH with its own bounded window. */
void pmp_fsm_resume_shutdown(pmp_fsm_t *f) { f->st = ST_SHUTDOWN; }

void pmp_fsm_set_comm_timeout_ms(pmp_fsm_t *f, uint32_t ms) { f->can_to_ms = ms < 100u ? 100u : (ms > 60000u ? 60000u : ms); }

const char *pmp_state_name(pmp_state_t s) {
  static const char *n[] = {"INIT","PRECHG","STANDBY","RUN","DERATE","MODESW","SAFE","FAULT","LOCK","SHUTDOWN","DISCH","OFF"};
  return (s <= ST_OFF) ? n[s] : "?";
}

void pmp_fsm_step(pmp_fsm_t *f, const pmp_in_t *in) {
  pmp_out_t *o = &f->out;
  f->t_ms++;
  o->pwm_kill = false;
  o->warn = 0;

  /* ---------------- E77: inputs are sanitized before any row reads them. A measurement that is non-finite or physically
     impossible for PMP_BAD_SAMPLE_MS is a sensing fault (F.29) — before E77 a NaN temperature, bus or current command made
     every comparison false, so OT, bus UV/OV and F.15 went blind while the module kept running. Setpoints are the
     controller's, not the module's: non-finite or negative reads as 0 (no delivery), above the ceiling clamps. */
  bool meas_ok = in_range(in->vin_ll, 0.0f, 700.0f) && in_range(in->vin_ll_min, 0.0f, 700.0f)
              && in_range(in->vin_ll_max, 0.0f, 700.0f) && in->vin_ll_max >= in->vin_ll_min
              && in_range(in->vbus, -20.0f, 1100.0f) && in_range(in->vmid_frac, 0.0f, 1.0f)
              && in_range(in->vbank_a, -20.0f, 650.0f) && in_range(in->vbank_b, -20.0f, 650.0f)
              && in_range(in->vout_meas, -50.0f, 1150.0f) && in_range(in->iout_meas, -50.0f, 400.0f)
              && in_range(in->temp_max_c, -60.0f, 200.0f) && (!in->ext_connected || in_range(in->vext, -1150.0f, 1150.0f));
  if (f->st != ST_INIT && f->st != ST_OFF && f->st != ST_LOCK) {
    if (!meas_ok) o->warn |= PMP_W_MEAS_GLITCH;
    if (persist(&f->p_bad, !meas_ok, PMP_BAD_SAMPLE_MS)) latch(f, FC_SENSOR);
  }
  float vcmd = (isfinite(in->vcmd) && in->vcmd > 0.0f) ? fminf(in->vcmd, PMP_SER_VMAX_V) : 0.0f;
  float icmd = (isfinite(in->icmd) && in->icmd > 0.0f) ? fminf(in->icmd, f->i_rated_a) : 0.0f;
  /* E77: a start needs a usable voltage setpoint or a battery that sets the operating point — a corrupted (NaN) command
     started the module and ran it to the mode ceiling (500 V in PAR). E78: the same test holds while delivering — losing the
     setpoint with no battery is a controlled stop, never a collapse of the output reference under load. */
  /* E81 (F-E-09): a battery alone is NOT an operating point. core/ctl.c's shaper has no path from vext to v_cmd, so a
     start with a pack but no voltage setpoint slewed v_ref to 0, commanded u = 0, never reached its target and latched
     F.34 after 8 s — every time, with no explanation. The module now stays in STANDBY and says PMP_W_NO_SETPOINT. */
  bool have_sp = vcmd >= PMP_VCMD_START_MIN_V;

  /* ---------------- hardware-fast mirror (comparators do this in <µs; firmware re-asserts) */
  if (in->vbus > PMP_BUS_OVP_V) latch(f, FC_BUS_OVP);
  if (in->desat_flt) latch(f, FC_DESAT);
  if (in->oc_pfc_flt && f->pre_blank_ms == 0) latch(f, FC_OC_PFC);   /* E73: blanked while the precharge bypass closes */
  if (f->pre_blank_ms) f->pre_blank_ms--;
  if (!in->wdt_ok) latch(f, FC_WDT);
  if (in->ctl_overrun) latch(f, FC_OVERRUN);                        /* E78: the HAL's deadline verdict (firmware-architecture §3) */
  /* E79: rows the HAL decides. Not on the shutdown path: an AUTO row latched in OFF would recover into precharge and restart a
     module that was shut down on purpose. */
  if (in->hal_fault != FC_NONE && f->st != ST_SHUTDOWN && f->st != ST_DISCH && f->st != ST_OFF) latch(f, in->hal_fault);
  if (!in->aux_ok) {
    o->pfc_en = false; o->llc_en = false; o->stop_ramp = false;
    if (f->st == ST_RUN || f->st == ST_DERATE) { f->st = ST_SAFE; f->need_enable = true; }   /* E78: module-initiated → re-arm */
    /* E81 (F-E-07): an aux dropout de-energises every coil physically while the FSM still commands them, so F.19 would
       latch after 100 ms and replace the designed SAFE → (500 ms) → STANDBY recovery with a row needing a CAN CLEAR.
       The matrix settle timer is re-armed too: when the aux returns the contacts have just re-closed and are bouncing. */
    f->p_relay = 0; f->p_make = 0;
  }

  /* E76 (review R06): the enable release is the public STOP — and the RE-ARM. need_enable (set by a
     fault clear or CAN timeout) demands a FRESH enable: it clears only when the host is seen holding
     enable low. The old core never cleared it (host_sim reached into the struct), so a field module
     could not restart after a fault clear. */
  if (!in->enable_req) f->need_enable = false;
  if (f->need_enable && in->enable_req) o->warn |= PMP_W_REARM;    /* E78: say why a held ENABLE is not starting the module */

  /* ---------------- E78 F.19: a relay contact that does not follow its command (mirror readback). 100 ms covers operate, bounce
     and the diode-suppressed release. Shutdown, discharge and off are exempt — a latch there would abandon the discharge. */
  if (!in->relay_fb_wired) o->warn |= PMP_W_RELAY_FB_OFF;
  else if (f->st != ST_INIT && f->st != ST_SAFE && f->st != ST_SHUTDOWN && f->st != ST_DISCH && f->st != ST_OFF
           && f->st != ST_LOCK
           && persist(&f->p_relay, ((pmp_relay_cmd(o) ^ in->relay_fb) & in->relay_fb_wired) != 0u, PMP_RELAY_FB_MS))
    latch(f, FC_RELAY);

  /* ---------------- supervisory checks (E76/review R05: SAFETY checks run whenever the converter is
     energized — a soft-start that stalls in STANDBY is otherwise unsupervised; LOAD checks stay
     bound to the delivering states) */
  bool operating = (f->st == ST_RUN || f->st == ST_DERATE);
  /* E81 (F-A-7): the two LINK rows run whenever the link is CHARGED, not only while a stage is enabled. The 2 × 47 k
     balance string carries 4.4 mA against a hot leakage imbalance of up to ~17 mA, so an idle charged link can drift one
     half toward its can rating with nothing watching — the E24–E80 core only looked while the converter ran. */
  if ((operating || o->pfc_en || o->llc_en || in->vbus > 100.0f) && f->st != ST_INIT && f->st != ST_LOCK) {
    if (persist(&f->p_mid, fabsf(in->vmid_frac - 0.5f) * in->vbus > PMP_MID_IMB_V, PMP_MID_MS)) latch(f, FC_MID_IMB);
    /* E80 (review HR-06/R10): each half-link absolutely — 860 V total and ±40 V midpoint together still let one
       450 V bank reach 454–468 V without either row firing */
    if (persist(&f->p_half, fmaxf(in->vmid_frac, 1.0f - in->vmid_frac) * in->vbus > PMP_HALF_OV_V, PMP_HALF_OV_MS))
      latch(f, FC_HALF_OV);
  } else { f->p_mid = 0; f->p_half = 0; }
  if (operating || o->pfc_en || o->llc_en) {
    float stack = (o->mode == MODE_SER) ? (o->k_ser ? in->vbank_a + in->vbank_b : in->vbank_a)
                                        : (o->k_para ? fmaxf(in->vbank_a, in->vbank_b) : in->vbank_a);
    /* E67: behind the output diode Vout sits at the stack (minus Vf) while the module delivers; a battery above it only
       reverse-biases the diode — so the plausibility window is one-sided when a vehicle is connected */
    /* E77: rows 6–9 carry their documented persistence (a 1 ms sag, phase dropout or midpoint spike latched before) */
    /* E80 (review R06/HR-24): overvoltage reads the HIGHEST line, undervoltage the LOWEST — the old single scalar
       (farthest from 400 V) selected 280 V out of a 280/505/505 V set and hid the overvoltage entirely */
    bool inov = in->vin_ll_max > PMP_IN_OV_V, inuv = in->vin_ll_min < PMP_IN_UV_V, ph = in->phases_ok < 3;
    if (inov || inuv || ph) o->warn |= PMP_W_IN_RIDE;
    if (persist(&f->p_inov, inov, PMP_IN_OV_MS)) latch(f, FC_IN_OV);
    if (persist(&f->p_inuv, inuv, PMP_IN_UV_MS)) latch(f, FC_IN_UV);
    if (persist(&f->p_ph, ph, PMP_PH_LOSS_MS)) { o->derate = 0.0f; latch(f, FC_PH_LOSS); }
    /* E77 F.13 firmware mirror on the module's OWN stack: above the mode ceiling (or Vout above 1050 V) for 2 ms, or above
       its command while it sources current for 200 ms (a CV failure). Comparing Vout with the command latched whenever a
       battery sat above the setpoint behind DOUT, or ENABLE arrived before the first SET_OUTPUT with a battery present. */
    if (persist(&f->p_ovpa, stack > fminf(PMP_OUT_OVP_ABS_V, o->v_max * 1.05f + 20.0f) || in->vout_meas > PMP_OUT_OVP_ABS_V, PMP_OVP_MS))
      latch(f, FC_OUT_OVP);
    if (persist(&f->p_ovps, o->llc_en && in->iout_meas > PMP_MAKE_IOUT_A && stack > vcmd * 1.06f + 20.0f, PMP_OVP_SRC_MS))
      latch(f, FC_OUT_OVP);
    /* E81 (F-E-06): 10 ms, as protection-thresholds row 17 specifies, and the same >50 V gate the soft-start copy uses.
       The calibrated bank channels are a ±1 % class at 500 V, so the static differential error alone can be 10 V before
       ripple — one noisy sample had only to add 15 V to latch a LATCH row that ends the session. F.17's real job (a
       welded KPARA in SER) is a persistent condition, so 10 ms costs it nothing. */
    if (persist(&f->p_bank, o->mode == MODE_SER && o->k_ser && fmaxf(in->vbank_a, in->vbank_b) > 50.0f &&
                            fabsf(in->vbank_a - in->vbank_b) > PMP_BANK_IMB_V, PMP_BANK_IMB_MS))
      latch(f, FC_BANK_IMB);
    if (in->temp_max_c > PMP_OT_TRIP_C) latch(f, FC_OT);
    if (pmp_fan_derate(in) <= 0.0f) latch(f, FC_FAN);   /* E80: too few fans left for any power (FW-21) */
    /* E76: the plausibility check is LOW-SIDE ONLY — vout above the stack is a legitimate
       reverse-biased-diode condition (a higher battery, or the terminal capacitors holding an
       earlier voltage that only the 3.8 MOhm divider drains after a downward step); the high
       side is protected by F.13 OVP. A vout reading far BELOW a delivering stack is the real
       sensor fault this row exists for (a stuck-low sensor blinds OVP). E77: non-finite readings are the p_bad row above. */
    if (o->llc_en && stack > 100.0f && stack - in->vout_meas > stack * 0.2f)
      latch(f, FC_SENSOR);
    /* E76 (review R09): derate is RECOMPUTED from present conditions. E77: the thermal part is continuous (60 % at the trip)
       and every increase is slew-limited — the E76 1.0/0.6 step with 5 °C hysteresis chattered as a 40 % current step
       with the thermal time constant. Reductions act at once. */
    if (f->latched == FC_NONE) {
      float th = fminf(1.0f, fmaxf(PMP_DERATE_MIN_TH, 1.0f - PMP_DERATE_SLOPE * (in->temp_max_c - PMP_OT_DERATE_C)));
      float fan = pmp_fan_derate(in), tgt = fminf(th, fan);   /* E80: by failed-fan count (FW-21) */
      o->derate = (tgt < o->derate) ? tgt : fminf(tgt, o->derate + PMP_DERATE_UP_PER_MS);
      if (th < 1.0f) o->warn |= PMP_W_DERATE_TH;
      if (fan < 1.0f) o->warn |= PMP_W_DERATE_FAN;
    }
    /* graceful, not latched (F.28); E76 (review R07): a graceful event must never downgrade a latch that fired this tick.
       E78: the timeout belongs to the active protocol profile, and a delivering module ramps its current out before stopping. */
    if (in->can_age_ms > f->can_to_ms && f->latched == FC_NONE) {
      f->need_enable = true;
      if (operating) { if (!o->stop_ramp) f->stop_ms = 0; o->stop_ramp = true; f->stop_can = true; }
      else { f->st = ST_STANDBY; o->llc_en = false; o->pfc_en = false; }
    }
    if (in->link_age_ms > PMP_LINK_TO_MS) latch(f, FC_LINK);
    /* E65: recomputed every tick — a session that starts low (bus 650 V) and climbs to a 525 V bank would otherwise
       run gain 1.6, outside every simulated corner (the reference was only set in STANDBY) */
    o->vbus_ref = bus_ref_for(o->mode, fmaxf(vcmd, in->vout_meas), in->vin_ll_max);   /* E80: the floor tracks the HIGHEST line */
  }
  if (operating) {
    /* E77 row 15 as documented: relative to the RATED current, 130 % for 2 ms or 102 % for 100 ms — the CC loop limits below
       that. The E24–E76 test against the command (iout > 1.3 · icmd) latched F.15 whenever a controller lowered its current
       setpoint faster than the loop ramps the output, i.e. on every normal ramp-down to a stop. */
    bool ocf = persist(&f->p_ocf, in->iout_meas > PMP_OC_FAST_FRAC * f->i_rated_a, PMP_OC_FAST_MS);
    bool ocs = persist(&f->p_ocs, in->iout_meas > PMP_OC_SLOW_FRAC * f->i_rated_a, PMP_OC_SLOW_MS);
    if (ocf || ocs) latch(f, FC_OUT_OC);
    /* row 16: the current floor keeps a zero command from reading any low-voltage current as a short */
    /* E78: not while the controlled stop takes the output down on purpose (found by proto_test: a stop into a resistive load
       reads as "low voltage with current"). The ramp ends inside 100 ms; F.15 fast and the hardware trips stay armed. */
    f->short_ms = (!o->stop_ramp && in->vout_meas < PMP_SHORT_V && in->iout_meas > fmaxf(icmd * PMP_SHORT_I_FRAC, 0.1f * f->i_rated_a))
                    ? f->short_ms + 1 : 0;
    if (f->short_ms > PMP_SHORT_MS) latch(f, FC_OUT_SHORT);
    /* E81 (F-E-05): the bus-UV row tracks the line crest too — at 475 VAC the crest is 671.8 V, so a fixed 620 V row
       left a 50 V band where the rectifier conducts uncontrolled and nothing fired. */
    if (persist(&f->p_busuv, in->vbus < fmaxf(PMP_BUS_UV_V, 1.414f * in->vin_ll_max - 20.0f), PMP_BUS_UV_MS))
      latch(f, FC_BUS_UV);   /* E77: row 5 had no code */
    /* E76 (review R06): honor the STOP. E78: through the controlled-stop ramp (current out first, then the LLC) */
    if ((!in->enable_req || !have_sp) && f->latched == FC_NONE && !o->stop_ramp) {
      o->stop_ramp = true; f->stop_ms = 0; f->stop_can = false;
    }
    if (!have_sp) o->warn |= PMP_W_NO_SETPOINT;
  }

  /* ---------------- E77: the public controlled shutdown (the E24–E76 core had no input for it; tests wrote the state
     variable). Rising edge only, so a held request cannot restart a supervised discharge that has already latched F.21. */
  if (in->shutdown_req && !f->shut_prev && f->st != ST_SHUTDOWN && f->st != ST_DISCH && f->st != ST_OFF) {
    o->llc_en = false; o->pfc_en = false; o->stop_ramp = false;
    f->st = ST_SHUTDOWN;
  }
  f->shut_prev = in->shutdown_req;

  /* ---------------- state machine */
  switch (f->st) {
  case ST_INIT:
    if (in->aux_ok) f->st = ST_PRECHG;
    break;
  case ST_PRECHG: {
    /* E77: the bypass closes only on an in-range line with all phases present. Before E77 an AC-sense channel reading 0
       closed it at once (0.9 · 0 is always met) with the bus at the ~330 V aux brown-in level — the unprecharged difference
       to the true crest dumped through the relay; a NaN reading parked the module here with no fault. A non-finite reading
       is now F.29 (above); an out-of-range line waits, reported, and the F.20 window only counts while the line is valid.
       E78: "in range" is the start window (275–485 VAC), 15 V inside the trip rows, so a grid at an edge cannot cycle it. */
    /* E80 (review R06): the bypass-close threshold uses the HIGHEST line's crest (the rectifier charges to it), and the
       start window holds every line — min above UV, max below OV. The old scalar let a 280/505/505 V set close at 356 V. */
    float crest = 1.414f * in->vin_ll_max;
    bool line_ok = in->vin_ll_min >= PMP_IN_UV_RECOVER_V && in->vin_ll_max <= PMP_IN_OV_RECOVER_V && in->phases_ok >= 3;
    o->k_pre = false;
    /* E81 (F-E-13): an out-of-range line used to park the module here for ever — precharge resistors in circuit, the
       110 W bus-fed aux drawn through them (5–25 W continuous in two 33 Ω parts), and only a warning bit, so the panel
       showed the CAN address and a technician saw a module that "does nothing". After 10 s it is reported as the grid
       row it is: F.07/F.08 are AUTO_EXT, so it clears itself the moment the supply comes back. */
    if (!line_ok) {
      f->prechg_ms = 0;
      o->warn |= PMP_W_LINE_WAIT;
      if (persist(&f->p_line, true, PMP_LINE_WAIT_MS))
        latch(f, in->vin_ll_max > PMP_IN_OV_RECOVER_V ? FC_IN_OV : FC_IN_UV);
      break;
    }
    f->p_line = 0;
    f->prechg_ms++;
    if (in->vbus >= PMP_BYPASS_CLOSE_K * crest) { o->k_pre = true; f->pre_blank_ms = PMP_PRE_BLANK_MS; f->st = ST_STANDBY; }
    else if ((f->prechg_ms > 400 && in->vbus < 0.5f * crest) || f->prechg_ms > PMP_PRECHG_MAX_MS) latch(f, FC_PRECHG);
    break; }
  case ST_STANDBY:
    /* E76 (review R04): the mode latches only with EVERY matrix contact open — a request that
       lands mid-soft-start (contacts closed) routes through ST_MODESW like any other
       reconfiguration instead of closing the new relays on top of the old ones (the old code
       commanded KSER with KPARA/KPARB still closed; hardware UEXCL blocked the coil, but the
       FSM then ran SER arithmetic on a paralleled matrix). */
    if (!o->k_ser && !o->k_para && !o->k_parb) f->omode = in->omode_req;
    else if (in->omode_req != f->omode) { f->st = ST_MODESW; f->sw_step = 0; break; }
    if (f->pre_blank_ms) break;                                    /* E73: no PFC enable until the bypass-closure window ends */
    bool want = in->enable_req && !f->need_enable && !f->lock && in->can_age_ms < f->can_to_ms;
    if (want && !have_sp) { o->warn |= PMP_W_NO_SETPOINT; want = false; }   /* E77 — have_sp is computed with the setpoints above */
    if (!want) {
      f->start_ms = 0;
      /* E77: a STOP (or a lost setpoint) during the soft start stops the LLC — the E76 core left it switching in STANDBY with
         the F.34 window reset, unsupervised. The make-permit bleed also ends; the permit is re-evaluated on the next start. */
      o->llc_en = false; o->q_disch_bk = false;
      /* E77: STOP leaves the PFC and the matrix ready for a quick restart for PMP_WARM_HOLD_MS, then goes cold — PFC off,
         matrix open at zero current. The E76 core kept the PFC switching and the relays energized indefinitely. */
      if (o->pfc_en || o->k_ser || o->k_para || o->k_parb) {
        if (++f->idle_ms > PMP_WARM_HOLD_MS && fabsf(in->iout_meas) < PMP_MAKE_IOUT_A) {
          o->pfc_en = false; o->k_ser = false; o->k_para = false; o->k_parb = false; o->q_disch_bk = false;
          f->p_make = 0;   /* E80: the matrix opened — the next close waits again */
        }
      } else { f->idle_ms = 0; if (o->k_pre) o->warn |= PMP_W_COLD_STBY; }
    } else f->idle_ms = 0;
    /* E78: the PFC starts only once the bypass contact is confirmed closed (a precharge resistor left in series with the line
       current burns) — F.19 latches if it never confirms */
    if (want && in->aux_ok && (!(in->relay_fb_wired & PMP_RLY_PRE) || (in->relay_fb & PMP_RLY_PRE))) {
      /* E65: a connected battery sets the operating voltage — EVs often send their MAXIMUM as vcmd while the pack sits far
       * below it; choosing SER from vcmd then ran banks under the 250 V SER floor */
      float v_start = (in->ext_connected && in->vext > 0.0f) ? in->vext : vcmd;
      /* E67: HIGH below its range is a setting the module does not accept — it stays in STANDBY (the monitor re-selects) */
      if (f->omode == OMODE_HIGH && v_start < PMP_XOVER_UP_V) break;
      pmp_mode_t m = (f->omode == OMODE_LOW) ? MODE_PAR : (f->omode == OMODE_HIGH) ? MODE_SER
                   : (v_start > PMP_XOVER_DN_V) ? MODE_SER : MODE_PAR;
      o->pfc_en = true;
      o->vbus_ref = bus_ref_for(m, v_start, in->vin_ll_max);
      /* E76 (review R02): readiness is RELATIVE TO THE COMMANDED REFERENCE. The old fixed
         "vbus > 700" could never pass at any point where bus_ref_for() returns < 700 — a
         correctly regulated 650 V bus (every PAR start below ~332 V, every SER start below
         ~665 V) left the module in STANDBY forever. 0.95·ref always demands a real boost:
         the FW-R7 line floor (1.08·√2·VLL) keeps 0.95·ref above the unloaded rectifier crest. */
      /* E80 (review HR-28): the PFC ramp itself sits inside the F.34 window — a boost that never reaches its
         reference (a stalled stage, a wrong sense) was energized in STANDBY with no bound at all */
      if (!(in->vbus > 0.95f * o->vbus_ref)) { if (++f->start_ms > PMP_START_TO_MS) latch(f, FC_START_TO); }
      else {
        if (in->ext_connected && in->vext < 0.0f) { latch(f, FC_BACKFEED); break; }
        o->mode = m;
        o->v_max = (m == MODE_SER) ? PMP_SER_VMAX_V : PMP_PAR_VMAX_V;
        bool ready = (o->mode == MODE_SER) ? o->k_ser : (o->k_para && o->k_parb);
        if (!ready) {
          /* E76 (review R03): the make-permit. "Zero-current, banks bled" was an ASSUMPTION —
             after a PAR→SER crossover the banks hold ~500 V each and the new series stack
             (~1 kV) forward-biases DOUT against the battery THROUGH THE MAKING CONTACT (a
             ~2 J film-bank dump, weld class). The matrix now closes only when the NEW stack
             sits below the output node (battery when connected, else the terminal capacitors)
             by PMP_MAKE_MARGIN_V, at zero measured current; until then the existing bank
             bleeders run (τ ≈ 0.17–0.27 s — the permit lands in 0.12–0.7 s). The LLC stays
             OFF through the wait so it cannot fight the bleed. */
          float vlim = fmaxf(in->ext_connected ? in->vext : in->vout_meas, PMP_MAKE_FLOOR_V) - PMP_MAKE_MARGIN_V;
          /* E80 (review HR-09/R07): PAR additionally bounds the BANK-TO-BANK mismatch — closing both parallel
             contacts equalizes the banks through them (E = C·ΔV²/4), which the output current cannot see; 25 V on
             30.8 µF is < 5 mJ. The bleeders run until both conditions hold. */
          bool safe = fabsf(in->iout_meas) < PMP_MAKE_IOUT_A &&
                      ((o->mode == MODE_SER) ? (in->vbank_a + in->vbank_b <= vlim)
                                             : (fmaxf(in->vbank_a, in->vbank_b) <= vlim &&
                                                fabsf(in->vbank_a - in->vbank_b) <= PMP_BANK_IMB_V));
          o->q_disch_bk = !safe;
          if (safe) {
            o->q_disch_bk = false;
            if (o->mode == MODE_PAR) { o->k_para = true; o->k_parb = true; }
            else o->k_ser = true;
            f->p_make = 0;   /* E80 (HR-08): the settle wait starts at the close command */
          } else if (++f->start_ms > PMP_START_TO_MS) latch(f, FC_START_TO);   /* F.34: bleeder/permit stall */
        } else {
          o->q_disch_bk = false;
          /* E78: the soft start waits until every wired contact confirms its command (F.19 bounds the wait) */
          if (((pmp_relay_cmd(o) ^ in->relay_fb) & in->relay_fb_wired) != 0u) break;
          /* E80 (review HR-08): the matrix relays have no mirror contacts (E67), so the coil bit is not a settled
             contact — wait out operate + bounce once after the close command. A warm restart's counter is already
             past the wait, so contacts that never opened add nothing. */
          if (f->p_make < PMP_RELAY_MAKE_MS) { f->p_make++; break; }
          o->llc_en = true;
          float stack = (o->mode == MODE_SER) ? in->vbank_a + in->vbank_b : fmaxf(in->vbank_a, in->vbank_b);
          /* E67: a welded matrix contact shows during the soft start — in SER a welded K_PARA holds bank A at 0 V (F.17) */
          if (o->mode == MODE_SER && fmaxf(in->vbank_a, in->vbank_b) > 50.0f && fabsf(in->vbank_a - in->vbank_b) > PMP_BANK_IMB_V) { latch(f, FC_BANK_IMB); break; }
          /* RUN entry: the stack reaches its target — vext when a vehicle is present (the diode then conducts), else vcmd
           * clamped to the mode ceiling. (Found by host_sim: post-transition banks can sit at the old-mode ceiling.) */
          /* E79: never above the command — a battery or charged terminal capacitors above the setpoint stay behind the reverse-
           * biased diode at zero current, so the stack only has to reach the setpoint (a start into them stalled into F.34) */
          float vlim = (vcmd > 0.0f) ? fminf(vcmd, o->v_max) : o->v_max;
          float tgt = in->ext_connected ? fminf(in->vext, vlim) : vlim;
          float band = fmaxf(10.0f, 0.05f * fabsf(tgt));
          if (fabsf(stack - tgt) < band) { f->st = ST_RUN; f->start_ms = 0; }
          else if (++f->start_ms > PMP_START_TO_MS) latch(f, FC_START_TO);     /* F.34: soft-start stall */
        }
      }
    }
    break;
  case ST_RUN:
  case ST_DERATE:
    /* E76 (review R09): one delivering super-state — DERATE recovers to RUN through the
       recomputed derate, and the AUTO crossover is evaluated while derated too (a derated
       session crossing 500 V previously stalled at the PAR ceiling). */
    f->st = (o->derate < 1.0f) ? ST_DERATE : ST_RUN;
    /* E78: the controlled stop. core/ctl.c ramps the current reference to zero; the LLC stops once the output current is below
       the make-permit level or the window ends. A STOP withdrawn inside the ramp continues the session without a restart;
       a communication loss cannot be withdrawn (it also stops the PFC and needs a fresh ENABLE). */
    if (o->stop_ramp) {
      o->warn |= PMP_W_STOPPING;
      if (in->enable_req && have_sp && !f->need_enable && !f->stop_can) o->stop_ramp = false;
      else if (fabsf(in->iout_meas) < PMP_MAKE_IOUT_A || ++f->stop_ms >= PMP_STOP_RAMP_MS) {
        o->stop_ramp = false; o->llc_en = false; f->st = ST_STANDBY;
        if (f->stop_can) { o->pfc_en = false; f->stop_can = false; }
      }
      break;
    }
    if (f->omode == OMODE_AUTO) { float v_x = in->ext_connected ? in->vout_meas : vcmd;   /* E65: crossover on the real battery voltage */
    if ((o->mode == MODE_PAR && v_x > PMP_XOVER_DN_V) ||
        (o->mode == MODE_SER && v_x < PMP_XOVER_UP_V)) {
      if (++f->dwell_ms > PMP_MODE_DWELL_MS) { f->st = ST_MODESW; f->sw_step = 0; }
    } else f->dwell_ms = 0; }
    break;
  case ST_MODESW:
    f->sw_step++;
    if (f->sw_step == 10) { o->llc_en = false; }
    /* the mode-switch invariant is "EVERY matrix contact open" — opened at zero current (LLC stopped, diode blocking);
       E76 (review R03): the bank bleeders start with the open, so the make-permit in STANDBY is reached quickly */
    if (f->sw_step == 20) { o->k_ser = false; o->k_para = false; o->k_parb = false; o->q_disch_bk = true; f->p_make = 0; }
    /* E75: the open->close command gap must exceed the relay's DIODE-SUPPRESSED release — the ULN
     * clamp freewheels the coil, stretching drop-out 2-3x vs the unsuppressed figure. Hand back to
     * STANDBY at step 70: earliest re-close is then >=51 ms after the open command, against the
     * RFQ line "release+bounce <=35 ms with coil-diode suppression" on the matrix relays. An
     * overlap would dump a charged film bank (~3 J at 500 V) through two making contacts.
     * E76: the mode itself is no longer flipped here — STANDBY re-derives it (from f->omode, or
     * from the battery voltage in AUTO) and closes the new matrix only through the make-permit. */
    if (f->sw_step >= 70) { f->st = ST_STANDBY; f->start_ms = 0; }
    break;
  case ST_SAFE:
    /* E78: the aux must hold for PMP_AUX_STABLE_MS — a rail hovering at its UVLO otherwise cycles the converter */
    if (persist(&f->p_aux, in->aux_ok, PMP_AUX_STABLE_MS)) { f->st = ST_STANDBY; f->p_aux = 0; }
    break;
  case ST_FAULT: {
    o->q_disch = false; o->q_disch_bk = false;   /* E80 (HR-11): no unsupervised dump in FAULT — SHUTDOWN re-runs it bounded */
    /* E78: AUTO rows clear themselves once their condition has been gone for the recovery hold. CLEAR ends a LATCH row, or an
       AUTO row whose condition is already gone (it skips the hold, never the condition). Every exit demands a fresh ENABLE. */
    pmp_fclass_t cl = pmp_fault_class(f->latched);
    bool is_auto = (cl == FCL_AUTO_EXT || cl == FCL_AUTO_INT);
    bool gone = is_auto && recovered(f, in);
    f->rec_ms = gone ? f->rec_ms + 1u : 0u;
    if (is_auto) o->warn |= PMP_W_RECOVERING;
    if ((in->clear_req && !f->lock && (!is_auto || gone)) || (is_auto && f->rec_ms >= f->rec_hold_ms)) {
      /* E79: back through precharge when the bypass is open (a latch during precharge or discharge) — STANDBY with the bypass
         open never starts, because the PFC waits for the bypass feedback, and never says why */
      f->latched = FC_NONE; f->st = o->k_pre ? ST_STANDBY : ST_PRECHG; f->need_enable = true; f->rec_ms = 0;
    }
    break; }
  case ST_LOCK:                                                     /* only power-cycle/service exits */
    break;
  case ST_SHUTDOWN:
    o->pfc_en = false; o->llc_en = false; o->k_pre = false; o->q_disch = true;
    o->q_disch_bk = true;   /* E76: banks bleed with the bus (E33 shutdown contract; F.21b supervises HAL-side) */
    f->disch_ms = 0;
    f->st = ST_DISCH;
    break;
  case ST_DISCH:
    f->disch_ms++;
    /* E80 (review HR-12/R12): discharged means the LINK AND BOTH BANKS below 60 V — a bus at 59 V with banks at
       400 V previously entered OFF and removed the bank bleeders */
    if (in->vbus < 60.0f && in->vbank_a < 60.0f && in->vbank_b < 60.0f) { f->st = ST_OFF; o->q_disch = false; o->q_disch_bk = false; }
    else if (f->disch_ms > f->disch_to_ms) {
      latch(f, FC_DISCH);   /* F.21 — the module is NOT discharged; the code says so */
      /* E80 (review HR-11/R11): a maintained source (the permanent precharge-resistor path with AC still applied) would
         otherwise feed the 640 Ω dump for as long as the fault stands — beyond any pulse rating. The dump commands end
         with the window; F.21 = "isolate upstream, then verify", never "keep burning". */
      o->q_disch = false; o->q_disch_bk = false;
    }
    break;
  case ST_OFF:
    if (in->wake_req) { f->st = ST_INIT; f->need_enable = true; }   /* E78: the public exit from OFF */
    break;
  default:   /* E78: a state value the enum does not define (memory corruption) is a fault, never a silent no-op */
    o->pfc_en = false; o->llc_en = false; o->pwm_kill = true; o->stop_ramp = false;
    f->st = f->lock ? ST_LOCK : ST_FAULT;
    latch(f, FC_INTERNAL);
    break;
  }
}

/* One image, rating from the card strap (see fsm.h). Values mirror the fsm.h physics note:
 * t(<60 V) ~ 2.0 / 3.6 s at 30 / 60 kW -> windows 3000 / 4000 / 5500 ms (30 / 40 / 60 kW); anything else keeps the
 * worst-case default so an undecoded strap can only delay the F.21 report, never miss it. */
void pmp_fsm_set_rating_kw(pmp_fsm_t *f, uint16_t kw)
{
  /* E24 rev E (E41): 40 kW carries +2 link cans and heavier banks — window scales with C. */
  f->disch_to_ms = (kw == 30u) ? 3000u : (kw == 40u) ? 4000u : (kw == 50u) ? 5000u
                 : (kw == 60u) ? 5500u : PMP_DISCH_TO_MS;
  /* E60 current-coordination classes (calculations/system/current-coordination.mjs): threshold =
   * 1.2 × the simulated worst peak (PFC: cycle-by-cycle incl. dips/phase jumps; LLC: power-solved
   * ngspice incl. tolerance/mismatch), observability to threshold + the 3 µs fault rise. */
  f->oc_line_a = (kw == 50u) ? 195.0f : (kw == 40u) ? 155.0f : 120.0f;
  f->oc_tank_a = (kw == 50u) ? 220.0f : (kw == 40u) ? 180.0f : 140.0f;   /* E67: one full-bridge tank CT */
  f->i_rated_a = (kw == 50u) ? 166.7f : (kw == 40u) ? 133.3f : 100.0f;   /* E77: 50 000 / 40 000 / 30 000 W at the 300 V knee */
  /* E42 50 kW: 16-can link (8/half, 1.88 mF series) into the 640 R chain — 3.16 s to <60 V,
   * 5000 ms window = 58% margin, same policy band as 30/40. 60 kW row is the retired
   * two-lane reference, kept so a legacy strap read stays safe (longer window, never shorter). */
}
