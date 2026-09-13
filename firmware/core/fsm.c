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

static void latch(pmp_fsm_t *f, pmp_fault_t code) {
  if (f->latched != FC_NONE || f->lock) return;
  f->latched = code;
  f->fault_count++;
  f->st = ST_FAULT;
  f->out.pfc_en = false; f->out.llc_en = false; f->out.pwm_kill = true;
  if (f->fault_count >= PMP_LOCK_COUNT) { f->lock = true; f->st = ST_LOCK; }
}

void pmp_fsm_init(pmp_fsm_t *f) {
  *f = (pmp_fsm_t){0};
  /* worst-case-safe default AFTER the zeroing (a zero window would latch F.21 on the first
     ST_DISCH tick); HAL narrows per rating via pmp_fsm_set_rating_kw() */
  f->disch_to_ms = PMP_DISCH_TO_MS;
  f->oc_line_a = 120.0f; f->oc_tank_a = 140.0f;  /* E60/E67: lowest (30 kW) class until the strap is read */
  f->st = ST_INIT;
  f->out.derate = 1.0f;
  f->out.mode = MODE_PAR;
  f->out.v_max = PMP_PAR_VMAX_V;
  f->out.q_disch = false;
}

const char *pmp_state_name(pmp_state_t s) {
  static const char *n[] = {"INIT","PRECHG","STANDBY","RUN","DERATE","MODESW","SAFE","FAULT","LOCK","SHUTDOWN","DISCH","OFF"};
  return (s <= ST_OFF) ? n[s] : "?";
}

void pmp_fsm_step(pmp_fsm_t *f, const pmp_in_t *in) {
  pmp_out_t *o = &f->out;
  f->t_ms++;
  o->pwm_kill = false;

  /* ---------------- hardware-fast mirror (comparators do this in <µs; firmware re-asserts) */
  if (in->vbus > PMP_BUS_OVP_V) latch(f, FC_BUS_OVP);
  if (in->desat_flt) latch(f, FC_DESAT);
  if (in->oc_pfc_flt) latch(f, FC_OC_PFC);
  if (!in->wdt_ok) latch(f, FC_WDT);
  if (!in->aux_ok) {
    o->pfc_en = false; o->llc_en = false;
    if (f->st == ST_RUN || f->st == ST_DERATE) f->st = ST_SAFE;
  }

  /* ---------------- supervisory checks in operating states */
  if (f->st == ST_RUN || f->st == ST_DERATE) {
    float stack = (o->mode == MODE_SER) ? (o->k_ser ? in->vbank_a + in->vbank_b : in->vbank_a)
                                        : (o->k_para ? fmaxf(in->vbank_a, in->vbank_b) : in->vbank_a);
    /* E67: behind the output diode Vout sits at the stack (minus Vf) while the module delivers; a battery above it only
       reverse-biases the diode — so the plausibility window is one-sided when a vehicle is connected */
    if (in->vin_ll > PMP_IN_OV_V) latch(f, FC_IN_OV);
    if (in->vin_ll < PMP_IN_UV_V) latch(f, FC_IN_UV);
    if (in->phases_ok < 3) { o->derate = 0.0f; latch(f, FC_PH_LOSS); }
    if (fabsf(in->vmid_frac - 0.5f) * in->vbus > PMP_MID_IMB_V) latch(f, FC_MID_IMB);
    if (in->vout_meas > fminf(1050.0f, in->vcmd * 1.06f + 20.0f)) latch(f, FC_OUT_OVP);
    if (in->iout_meas > in->icmd * PMP_OC_FRAC) latch(f, FC_OUT_OC);
    f->short_ms = (in->vout_meas < PMP_SHORT_V && in->iout_meas > in->icmd * PMP_SHORT_I_FRAC)
                    ? f->short_ms + 1 : 0;
    if (f->short_ms > PMP_SHORT_MS) latch(f, FC_OUT_SHORT);
    if (o->mode == MODE_SER && o->k_ser && fabsf(in->vbank_a - in->vbank_b) > PMP_BANK_IMB_V) latch(f, FC_BANK_IMB);
    if (in->temp_max_c > PMP_OT_TRIP_C) latch(f, FC_OT);
    else if (in->temp_max_c > PMP_OT_DERATE_C) o->derate = fminf(o->derate, 0.6f);
    if (!in->fan_ok) o->derate = fminf(o->derate, 0.5f);
    if (isnan(in->vout_meas) ||
        (o->llc_en && stack > 100.0f && (in->vout_meas - stack > stack * 0.2f || stack - in->vout_meas > stack * 0.2f)))
      latch(f, FC_SENSOR);
    if (in->can_age_ms > PMP_CAN_TO_MS) {          /* graceful, not latched (F.28) */
      f->st = ST_STANDBY; o->llc_en = false; f->need_enable = true;
    }
    if (in->link_age_ms > PMP_LINK_TO_MS) latch(f, FC_LINK);
    /* E65: recomputed every tick — a session that starts low (bus 650 V) and climbs to a 525 V bank would otherwise
       run gain 1.6, outside every simulated corner (the reference was only set in STANDBY) */
    o->vbus_ref = bus_ref_for(o->mode, fmaxf(in->vcmd, in->vout_meas), in->vin_ll);
  }

  /* ---------------- state machine */
  switch (f->st) {
  case ST_INIT:
    if (in->aux_ok) f->st = ST_PRECHG;
    break;
  case ST_PRECHG:
    f->prechg_ms++;
    o->k_pre = false;
    if (in->vbus >= 0.9f * in->vin_ll * 1.414f) { o->k_pre = true; f->st = ST_STANDBY; }
    else if (f->prechg_ms > 400 && in->vbus < 0.5f * in->vin_ll * 1.414f) latch(f, FC_PRECHG);
    break;
  case ST_STANDBY:
    f->omode = in->omode_req;                                      /* E67: the mode can change only here */
    if (in->enable_req && !f->need_enable && !f->lock && in->can_age_ms < PMP_CAN_TO_MS) {
      /* E65: a connected battery sets the operating voltage — EVs often send their MAXIMUM as vcmd while the pack sits far
       * below it; choosing SER from vcmd then ran banks under the 250 V SER floor */
      float v_start = (in->ext_connected && in->vext > 0.0f) ? in->vext : in->vcmd;
      /* E67: HIGH below its range is a setting the module does not accept — it stays in STANDBY (the monitor re-selects) */
      if (f->omode == OMODE_HIGH && v_start < PMP_XOVER_UP_V) break;
      pmp_mode_t m = (f->omode == OMODE_LOW) ? MODE_PAR : (f->omode == OMODE_HIGH) ? MODE_SER
                   : (v_start > PMP_XOVER_DN_V) ? MODE_SER : MODE_PAR;
      o->pfc_en = true;
      o->vbus_ref = bus_ref_for(m, v_start, in->vin_ll);
      if (in->vbus > 700.0f) {
        if (in->ext_connected && in->vext < 0.0f) { latch(f, FC_BACKFEED); break; }
        o->mode = m;
        o->v_max = (m == MODE_SER) ? PMP_SER_VMAX_V : PMP_PAR_VMAX_V;
        o->llc_en = true;
        bool ready = (o->mode == MODE_SER) ? o->k_ser : (o->k_para && o->k_parb);
        if (!ready) {
          /* E67: zero-current make — the LLC is stopped behind the blocking diode and the banks start bled/equal, so the
           * matrix closes directly (the E12 pre-insertion pair is retired with K_OUT) */
          if (o->mode == MODE_PAR) { o->k_para = true; o->k_parb = true; }
          else o->k_ser = true;
        } else {
          float stack = (o->mode == MODE_SER) ? in->vbank_a + in->vbank_b : fmaxf(in->vbank_a, in->vbank_b);
          /* E67: a welded matrix contact shows during the soft start — in SER a welded K_PARA holds bank A at 0 V (F.17) */
          if (o->mode == MODE_SER && fmaxf(in->vbank_a, in->vbank_b) > 50.0f && fabsf(in->vbank_a - in->vbank_b) > PMP_BANK_IMB_V) { latch(f, FC_BANK_IMB); break; }
          /* RUN entry: the stack reaches its target — vext when a vehicle is present (the diode then conducts), else vcmd
           * clamped to the mode ceiling. (Found by host_sim: post-transition banks can sit at the old-mode ceiling.) */
          float tgt = in->ext_connected ? in->vext : fminf(in->vcmd, o->v_max);
          float band = fmaxf(10.0f, 0.05f * fabsf(tgt));
          if (fabsf(stack - tgt) < band) f->st = ST_RUN;
        }
      }
    }
    break;
  case ST_RUN:
    if (o->derate < 1.0f) f->st = ST_DERATE;
    if (f->omode == OMODE_AUTO) { float v_x = in->ext_connected ? in->vout_meas : in->vcmd;   /* E65: crossover on the real battery voltage */
    if ((o->mode == MODE_PAR && v_x > PMP_XOVER_DN_V) ||
        (o->mode == MODE_SER && v_x < PMP_XOVER_UP_V)) {
      if (++f->dwell_ms > PMP_MODE_DWELL_MS) { f->st = ST_MODESW; f->sw_step = 0; }
    } else f->dwell_ms = 0; }
    break;
  case ST_DERATE:
    if (o->derate >= 1.0f) f->st = ST_RUN;
    break;
  case ST_MODESW:
    f->sw_step++;
    if (f->sw_step == 1) { f->icmd_saved = in->icmd; }               /* controller ramps I to 0 */
    if (f->sw_step == 10) { o->llc_en = false; }
    /* the mode-switch invariant is "EVERY matrix contact open" — opened at zero current (LLC stopped, diode blocking) */
    if (f->sw_step == 20) { o->k_ser = false; o->k_para = false; o->k_parb = false; }
    if (f->sw_step == 40) {
      o->mode = (o->mode == MODE_PAR) ? MODE_SER : MODE_PAR;
      f->st = ST_STANDBY;
    }
    break;
  case ST_SAFE:
    if (in->aux_ok) f->st = ST_STANDBY;
    break;
  case ST_FAULT:
    if (in->clear_req && !f->lock) { f->latched = FC_NONE; f->st = ST_STANDBY; f->need_enable = true; }
    break;
  case ST_LOCK:                                                     /* only power-cycle/service exits */
    break;
  case ST_SHUTDOWN:
    o->pfc_en = false; o->llc_en = false; o->k_pre = false; o->q_disch = true;
    f->disch_ms = 0;
    f->st = ST_DISCH;
    break;
  case ST_DISCH:
    f->disch_ms++;
    if (in->vbus < 60.0f) { f->st = ST_OFF; o->q_disch = false; }
    else if (f->disch_ms > f->disch_to_ms) latch(f, FC_DISCH);   /* F.21 — discharge kept commanded */
    break;
  case ST_OFF:
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
  /* E42 50 kW: 16-can link (8/half, 1.88 mF series) into the 640 R chain — 3.16 s to <60 V,
   * 5000 ms window = 58% margin, same policy band as 30/40. 60 kW row is the retired
   * two-lane reference, kept so a legacy strap read stays safe (longer window, never shorter). */
}
