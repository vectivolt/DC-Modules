/* modapi.c — see modapi.h. */
#include "modapi.h"
#include <math.h>

void mod_cmd_init(mod_cmd_t *c) {
  *c = (mod_cmd_t){0};
  c->p_set_w = -1.0f;
  c->age_ms = UINT32_MAX / 2u;     /* nothing heard yet: stale, but far from wrap-around arithmetic */
  c->timeout_ms = PMP_CAN_TO_MS;
  c->peer_avg_a = NAN;
}

void pmp_cmd_to_in(mod_cmd_t *cmd, pmp_in_t *in, pmp_fsm_t *f) {
  in->enable_req = cmd->run && (!cmd->grp_active || cmd->grp_deliver);
  in->omode_req = cmd->omode;
  in->vcmd = cmd->v_set_v;
  in->icmd = cmd->grp_active ? fminf(cmd->i_set_a, cmd->grp_share_a) : cmd->i_set_a;
  in->can_age_ms = cmd->age_ms;
  if (f->can_to_ms != cmd->timeout_ms) pmp_fsm_set_comm_timeout_ms(f, cmd->timeout_ms);
  in->clear_req = cmd->clear; in->shutdown_req = cmd->shutdown; in->wake_req = cmd->wake;
  cmd->clear = false; cmd->shutdown = false; cmd->wake = false;
}

void pmp_cmd_to_ctl(const mod_cmd_t *cmd, const pmp_fsm_t *f, const pmp_in_t *in, bool cv_active, pmp_ctl_in_t *ci) {
  ci->en = f->out.llc_en; ci->stop_ramp = f->out.stop_ramp; ci->cv_active = cv_active;
  ci->v_set = in->vcmd; ci->i_set = cmd->i_set_a; ci->p_set = cmd->p_set_w;
  ci->v_max_mode = f->out.v_max; ci->derate = f->out.derate; ci->fsm_warn = f->out.warn;
  ci->vin_ll = in->vin_ll_min; ci->v_out = in->vout_meas; ci->i_out = in->iout_meas;   /* E80: availability from the LOWEST line */
  ci->grp_active = cmd->grp_active; ci->grp_share_a = cmd->grp_share_a;
  ci->peer_avg_a = cmd->peer_avg_a; ci->peer_n = cmd->peer_n;
}

static mod_run_state_t run_state(const pmp_fsm_t *f, const pmp_in_t *in) {
  const pmp_out_t *o = &f->out;
  switch (f->st) {
  case ST_INIT: case ST_PRECHG: return MOD_RS_PRECHARGE;
  case ST_STANDBY: return (in->enable_req && !f->need_enable && (o->pfc_en || o->llc_en || o->q_disch_bk)) ? MOD_RS_STARTING : MOD_RS_READY;
  case ST_RUN: case ST_DERATE: return o->stop_ramp ? MOD_RS_STOPPING : MOD_RS_ON;
  case ST_MODESW: return MOD_RS_MODE_CHANGE;
  case ST_SAFE: return MOD_RS_SAFE;
  case ST_FAULT: return MOD_RS_FAULT;
  case ST_LOCK: return MOD_RS_LOCKED;
  case ST_SHUTDOWN: case ST_DISCH: return MOD_RS_DISCHARGE;
  case ST_OFF: return MOD_RS_OFF;
  default: return MOD_RS_FAULT;
  }
}

void pmp_tlm_from_core(mod_tlm_t *m, const pmp_fsm_t *f, const pmp_in_t *in, const pmp_ctl_t *c, const pmp_ctl_cfg_t *cc) {
  m->v_ext = in->vext; m->ext_connected = in->ext_connected;   /* E81 (K1) */
  m->rs = run_state(f, in);
  m->st = f->st; m->mode = f->out.mode; m->omode = f->omode;
  m->fault = f->lock ? FC_LOCK : f->latched;
  m->fclass = pmp_fault_class(m->fault);
  m->fault_bits = (f->latched != FC_NONE ? (1ull << (f->latched - 1u)) : 0ull) | (f->lock ? (1ull << (FC_LOCK - 1u)) : 0ull);
  m->warn = f->out.warn;
  m->rearm = f->need_enable && in->enable_req;
  m->pfc_en = f->out.pfc_en; m->llc_en = f->out.llc_en;   /* E82 (K-4) */
  m->recover_ms = (m->fclass == FCL_AUTO_EXT || m->fclass == FCL_AUTO_INT) && f->rec_hold_ms > f->rec_ms ? f->rec_hold_ms - f->rec_ms : 0u;
  m->derate = f->out.derate;
  m->limiter = c->limiter; m->derate_why = c->derate_why;
  m->v_set = (isfinite(in->vcmd) && in->vcmd > 0.0f) ? in->vcmd : 0.0f;
  m->v_ref = c->v_ref; m->i_ref = c->i_ref; m->p_lim = c->p_lim; m->i_avail = c->i_avail; m->p_avail = c->p_avail;
  m->trim_v = c->trim_v; m->share_active = c->trim_active;
  m->v_min = cc->v_min_v; m->v_max = f->out.v_max; m->i_rated = cc->i_rated_a; m->p_rated = cc->p_rated_w;
}
