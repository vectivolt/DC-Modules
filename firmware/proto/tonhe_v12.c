/* tonhe_v12.c — see tonhe_v12.h and docs/can-profile-tonhe-v12.md. */
#include "tonhe_v12.h"
#include <math.h>
#include <string.h>

#define FB(n) (1ull << ((n) - 1u))

uint32_t th12_id(uint8_t prio, uint8_t pf, uint8_t dst, uint8_t src) {
  return ((uint32_t)(prio & 7u) << 26) | ((uint32_t)pf << 16) | ((uint32_t)dst << 8) | (uint32_t)src;
}

uint8_t th12_addr(const th12_t *t) {
  uint8_t a = t->addr_mode ? t->addr_can : t->addr_local;
  return (a >= 1u && a <= 240u) ? a : 0u;
}

void th12_init(th12_t *t, uint8_t addr_mode, uint8_t addr_can, uint8_t addr_local, uint32_t now) {
  memset(t, 0, sizeof *t);
  t->addr_mode = addr_mode ? 1u : 0u; t->addr_can = addr_can; t->addr_local = addr_local;
  t->group = 0xFFu;
  for (unsigned a = 0u; a < 241u; a++) t->peer[a].group = 0xFFu;
  t->t_rx = now;                    /* a module on a silent bus reports the communication loss after 20 s as well */
  /* the periodic frames are phased by address, so a rack of modules does not transmit in one burst */
  uint32_t ph = (uint32_t)th12_addr(t) * 37u % TH12_PERIOD_MS;
  t->t_state = now - TH12_PERIOD_MS + ph;
  t->t_ac = now - TH12_PERIOD_MS + (ph + 150u) % TH12_PERIOD_MS;
  t->t_ext = now - TH12_PERIOD_MS + (ph + 300u) % TH12_PERIOD_MS;
}

static bool output_off(const mod_tlm_t *m) {
  return m->rs != MOD_RS_ON && m->rs != MOD_RS_STARTING && m->rs != MOD_RS_STOPPING && m->rs != MOD_RS_MODE_CHANGE;
}

static uint32_t mask24(const uint8_t *d) { return (uint32_t)d[0] | ((uint32_t)d[1] << 8) | ((uint32_t)d[2] << 16); }

/* §9.2.1 note 2: address n is addressed when bit (n − m·24 − 1) of the processing flag is set, m = the address multiple
   (low nibble of the group byte, 0–9) */
static bool bit_for(uint8_t own, const uint8_t *d, uint8_t gm) {
  uint8_t mul = gm & 0x0Fu;
  int k = (int)own - (int)mul * 24 - 1;
  return own != 0u && mul <= 9u && k >= 0 && k < 24 && ((mask24(d) >> k) & 1u);
}

/* the monitor's group frames say which addresses share a group — the peers this module may average for current sharing */
static void note_group(th12_t *t, const uint8_t *d, uint8_t gm) {
  uint8_t mul = gm & 0x0Fu;
  if (mul > 9u) return;
  uint32_t mask = mask24(d);
  for (unsigned k = 0u; k < 24u; k++)
    if ((mask >> k) & 1u) { unsigned a = mul * 24u + k + 1u; if (a <= 240u) t->peer[a].group = (uint8_t)(gm >> 4); }
}

/* §9.2.2 notes 1–2: a request beyond the module's range is served at the range edge. TH-AMB-4: a zero voltage means "no
   setpoint" — the minimum-voltage rule would otherwise turn a zeroed stop frame into a 150 V output on the next start. */
static void set_vi(th12_t *t, const mod_tlm_t *m, uint16_t v_dv, uint16_t i_ca) {
  float i_max = (m->i_rated > 0.0f) ? m->i_rated : 0.0f;
  t->v_set = v_dv ? fminf(fmaxf((float)v_dv * 0.1f, m->v_min), PMP_SER_VMAX_V) : 0.0f;
  t->i_set = fminf(fmaxf((float)i_ca * 0.01f, TH12_I_MIN_A), i_max);
}

void th12_rx(th12_t *t, const pmp_frame_t *f, uint32_t now, const mod_tlm_t *m, mod_cmd_t *cmd, pmp_txq_t *tx) {
  (void)cmd;
  if ((f->id >> 24) & 3u) return;               /* R and DP are 0 in this protocol — anything else is another family's frame */
  uint8_t pf = (uint8_t)(f->id >> 16), ps = (uint8_t)(f->id >> 8), sa = (uint8_t)f->id;
  const uint8_t *d = f->data;
  uint8_t own = th12_addr(t);
  if (sa != TH12_MONITOR_ADDR) {                /* another node: a peer's current, or someone transmitting as this module */
    if (sa < 1u || sa > 240u) return;
    if (pf != TH12_PF_STATE && pf != TH12_PF_CONFIRM && pf != TH12_PF_AC && pf != TH12_PF_EXT) return;
    if (own && sa == own) { t->conflict = true; t->t_conflict = now; return; }
    if (pf == TH12_PF_STATE && f->dlc >= 5u) { t->peer[sa].i_ca = pmp_get16(d + 3); t->peer[sa].t = now; t->peer[sa].seen = true; }
    return;
  }
  bool to_me = own != 0u && ps == own, bc = ps == TH12_BROADCAST;
  if (!to_me && !bc) return;
  switch (pf) {
  case TH12_PF_STARTSTOP_BC:                    /* C_M_1: bitmap start / stop */
    if (f->dlc < 5u) return;
    note_group(t, d, d[4]);
    if (!bit_for(own, d, d[4]) || (d[3] != 0xAAu && d[3] != 0x55u)) return;
    t->t_rx = now; t->group = (uint8_t)(d[4] >> 4); t->run = d[3] == 0xAAu;
    return;
  case TH12_PF_PARAM:                           /* C_M_2: bitmap voltage / current */
    if (f->dlc < 8u) return;
    note_group(t, d, d[3]);
    if (!bit_for(own, d, d[3])) return;
    t->t_rx = now; t->group = (uint8_t)(d[3] >> 4);
    set_vi(t, m, pmp_get16(d + 4), pmp_get16(d + 6));
    return;
  case TH12_PF_TIMING:                          /* C_M_3: the monitor's 5 s heartbeat */
    t->t_rx = now;
    return;
  case TH12_PF_STARTSTOP: {                     /* C_M_24: this module's start / stop with V / I, confirmed by M_C_2 */
    if (!to_me || f->dlc < 6u) return;          /* TH-AMB-3: addressed only — a broadcast cannot start every module */
    bool ok = d[0] == 0xAAu || d[0] == 0x55u;
    t->t_rx = now;
    if (ok) { set_vi(t, m, pmp_get16(d + 2), pmp_get16(d + 4)); t->run = d[0] == 0xAAu; }
    pmp_frame_t c = { th12_id(2u, TH12_PF_CONFIRM, TH12_MONITOR_ADDR, own), 8u, { ok ? 1u : 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u } };
    (void)pmp_txq_push(tx, &c);
    return; }
  case TH12_PF_ADDR_SET:                        /* C_M_23: stored; in force in manual mode; accepted only with the output off */
    if (f->dlc < 1u) return;
    t->t_rx = now;
    if (d[0] < 1u || d[0] > 240u || !output_off(m)) return;
    if (t->addr_can != d[0]) { t->addr_can = d[0]; t->nv_dirty = true; t->have_state = false; t->have_ext = false; }
    return;
  case TH12_PF_ADDR_MODE:                       /* C_M_12: automatic / manual, accepted only with the output off */
    if (f->dlc < 1u) return;
    t->t_rx = now;
    if (d[0] > 1u || !output_off(m)) return;
    if (t->addr_mode != d[0]) { t->addr_mode = d[0]; t->nv_dirty = true; t->have_state = false; t->have_ext = false; }
    return;
  case TH12_PF_INPUT_MODE:                      /* C_M_4: an AC-input module — DC mode is refused and counted */
    if (f->dlc < 1u) return;
    t->t_rx = now;
    if (d[0] != 1u) t->unsupported++;
    return;
  default:
    return;
  }
}

static uint8_t state_byte(const mod_tlm_t *m) {
  switch (m->rs) {
  case MOD_RS_STARTING: case MOD_RS_ON: case MOD_RS_STOPPING: case MOD_RS_MODE_CHANGE: return 0x01u;
  case MOD_RS_FAULT: case MOD_RS_LOCKED: case MOD_RS_SAFE: return 0x11u;
  default: return 0x00u;
  }
}

void th12_enc_state(const th12_t *t, const mod_tlm_t *m, uint32_t now, pmp_frame_t *f) {
  uint64_t fb = m->fault_bits;
  uint16_t w = 0u;
  uint8_t pfc = 0u;
  if (fb & FB(8)) w |= 1u << 0;                                      /* input undervoltage */
  if (fb & FB(9)) w |= 1u << 1;                                      /* input phase loss */
  if (fb & FB(7)) w |= 1u << 2;                                      /* input overvoltage */
  if (fb & FB(13)) w |= 1u << 3;                                     /* output overvoltage */
  if (fb & FB(15)) w |= 1u << 4;                                     /* output overcurrent */
  if (fb & FB(22)) w |= 1u << 5;                                     /* temperature high */
  if ((m->warn & PMP_W_DERATE_FAN) || m->fan_fail) w |= 1u << 6;     /* fan fault (this module derates instead of stopping) */
  if (fb & FB(5)) w |= 1u << 8;                                      /* bus exception (bus bias is PFC bit 5 — the §9.1.1 example) */
  if (fb & FB(27)) w |= 1u << 9;                                     /* internal communication (F.27 — reserved, one brain) */
  if (fb & FB(21)) w |= 1u << 10;                                    /* discharge fault */
  if (fb & (FB(1) | FB(2) | FB(3) | FB(5) | FB(6))) w |= 1u << 11;   /* PFC shut down by an exception */
  if (t->uvw_on && now - t->t_uvw >= TH12_WARN_HOLD_MS) w |= 1u << 12;
  if (t->ovw_on && now - t->t_ovw >= TH12_WARN_HOLD_MS) w |= 1u << 13;
  if (m->warn & PMP_W_DERATE_TH) w |= 1u << 14;                      /* power limited by temperature */
  if (fb & FB(16)) w |= 1u << 15;                                    /* short circuit */
  if ((fb & (FB(11) | FB(12) | FB(17) | FB(19) | FB(20) | FB(29) | FB(30) | FB(32) | FB(33) | FB(34) | FB(35) | FB(36)))
      || m->rs == MOD_RS_SAFE)
    w |= 1u << 7;                                                    /* hardware fault */
  if (fb & FB(1)) pfc |= 1u << 0;                                    /* input overcurrent */
  if (fb & FB(37)) pfc |= 1u << 1;                                   /* mains frequency fault (E79: F.37 from the HAL) */
  if (t->conflict) pfc |= 1u << 4;                                   /* address conflict (TH-AMB-1: the table, not the example) */
  if (fb & FB(6)) pfc |= 1u << 5;                                    /* bus bias */
  if (fb & FB(3)) pfc |= 1u << 7;                                    /* bus overvoltage */
  if (w & 0x3F00u) w |= 1u << 7;                                     /* §9.1.1 note 1: bits 8–13 also set bit 7 */
  if (pfc & ((1u << 2) | (1u << 7))) w |= 1u << 7;                   /* §9.1.1 note 2: PFC bits 2 and 7 also set bit 7 */
  f->id = th12_id(6u, TH12_PF_STATE, TH12_MONITOR_ADDR, th12_addr(t));
  f->dlc = 8u;
  f->data[0] = state_byte(m);
  pmp_put16(f->data + 1, pmp_sat_u16(m->v_out, 0.1f));
  pmp_put16(f->data + 3, pmp_sat_u16(m->i_out, 0.01f));
  pmp_put16(f->data + 5, w);
  f->data[7] = pfc;
}

void th12_enc_ac(const th12_t *t, const mod_tlm_t *m, pmp_frame_t *f) {
  f->id = th12_id(6u, TH12_PF_AC, TH12_MONITOR_ADDR, th12_addr(t));
  f->dlc = 8u;
  for (unsigned k = 0u; k < 3u; k++) pmp_put16(f->data + 2u * k, pmp_sat_u16(m->vin_ph[k], 0.1f));
  pmp_put16(f->data + 6, pmp_sat_u16(m->t_inlet, 1.0f));   /* TH-AMB-6: no negative encoding is defined — below 0 °C reads 0 */
}

void th12_enc_ext(const th12_t *t, const mod_tlm_t *m, pmp_frame_t *f) {
  uint64_t fb = m->fault_bits;
  uint16_t st = (uint16_t)((m->share_active ? 1u : 0u) | (m->quiet_fan ? 2u : 0u) | (m->log_overflow ? 4u : 0u) | (1u << 5));
  uint16_t w = 0u;
  if (fb & (FB(1) | FB(2) | FB(3) | FB(5) | FB(6))) w |= 1u << 0;    /* front stage stopped switching by protection */
  if (t->comm_lost) w |= 1u << 2;                                    /* CAN communication timeout */
  if (fb & (FB(17) | FB(19))) w |= 1u << 4;                          /* relay operation fault */
  if (fb & FB(22)) w |= 1u << 6;                                     /* internal element over-temperature */
  if (isfinite(m->t_inlet) && m->t_inlet >= TH12_INLET_OT_C) w |= 1u << 7;   /* air inlet over-temperature */
  if (m->derate_why & PMP_DR_INPUT) w |= 1u << 8;                    /* input power limit */
  if (m->derate_why & PMP_DR_THERMAL) w |= 1u << 9;                  /* power limit by over-temperature */
  if (fb & FB(21)) w |= 1u << 10;                                    /* discharge changeover abnormal */
  f->id = th12_id(7u, TH12_PF_EXT, TH12_MONITOR_ADDR, th12_addr(t));
  f->dlc = 8u;
  memset(f->data, 0, 8u);
  pmp_put16(f->data, st);
  pmp_put16(f->data + 2, w);
}

void th12_tick(th12_t *t, uint32_t now, const mod_tlm_t *m, mod_cmd_t *cmd, pmp_txq_t *tx) {
  uint8_t own = th12_addr(t);
  uint32_t age = now - t->t_rx;
  /* the 20 s rule: the monitor's intent ends with the communication — a new start command is needed afterwards. The
     setpoints end once the output is off: the controlled stop still ramps out on them (zeroing them at once collapsed the
     output reference under load — found by proto_test's end-to-end rig as a false F.16) */
  if (age > TH12_COMM_TO_MS) {
    if (!t->comm_lost) { t->comm_lost = true; t->run = false; }
    if (output_off(m)) { t->v_set = 0.0f; t->i_set = 0.0f; }
  } else t->comm_lost = false;
  if (t->conflict && now - t->t_conflict > TH12_CONFLICT_HOLD_MS) t->conflict = false;
  bool on = m->rs == MOD_RS_ON;
  bool ovw = on && m->v_set > 0.0f && m->v_out > m->v_set * 1.03f + 10.0f, uvw = on && m->v_out < m->v_min;
  if (ovw && !t->ovw_on) t->t_ovw = now;
  if (uvw && !t->uvw_on) t->t_uvw = now;
  t->ovw_on = ovw; t->uvw_on = uvw;

  /* canonical intent (two modules on one address may not deliver — the monitor cannot tell their currents apart) */
  cmd->run = t->run && !t->conflict && own != 0u;
  cmd->omode = OMODE_AUTO;
  cmd->v_set_v = t->v_set; cmd->i_set_a = t->i_set; cmd->p_set_w = -1.0f;
  cmd->age_ms = age; cmd->timeout_ms = TH12_COMM_TO_MS;
  cmd->grp_active = false; cmd->grp_deliver = false; cmd->grp_share_a = 0.0f;
  float sum = 0.0f; uint8_t n = 0u;
  if (own && t->group != 0xFFu && t->peer[own].group == t->group)
    for (unsigned a = 1u; a <= 240u; a++)
      if (a != own && t->peer[a].seen && t->peer[a].group == t->group && now - t->peer[a].t <= TH12_PEER_STALE_MS) {
        sum += (float)t->peer[a].i_ca * 0.01f; n++;
      }
  if (n && isfinite(m->i_out)) { cmd->peer_avg_a = (sum + m->i_out) / (float)(n + 1u); cmd->peer_n = (uint8_t)(n + 1u); }
  else { cmd->peer_avg_a = NAN; cmd->peer_n = 0u; }
  if (!own) return;                             /* no address in force: silent (TH-AMB-5) */

  pmp_frame_t fr;
  th12_enc_state(t, m, now, &fr);
  uint16_t fw = pmp_get16(fr.data + 5);
  bool ch = !t->have_state || fr.data[0] != t->last_state || fw != t->last_fault || fr.data[7] != t->last_pfc;
  if (now - t->t_state >= TH12_PERIOD_MS || (ch && now - t->t_state >= TH12_TRIGGER_GAP_MS)) {
    (void)pmp_txq_push(tx, &fr);
    t->t_state = now; t->last_state = fr.data[0]; t->last_fault = fw; t->last_pfc = fr.data[7]; t->have_state = true;
  }
  th12_enc_ext(t, m, &fr);
  uint32_t ew = pmp_get32(fr.data);
  if (now - t->t_ext >= TH12_PERIOD_MS || ((!t->have_ext || ew != t->last_ext) && now - t->t_ext >= TH12_TRIGGER_GAP_MS)) {
    (void)pmp_txq_push(tx, &fr);
    t->t_ext = now; t->last_ext = ew; t->have_ext = true;
  }
  if (now - t->t_ac >= TH12_PERIOD_MS) { th12_enc_ac(t, m, &fr); (void)pmp_txq_push(tx, &fr); t->t_ac = now; }
}
