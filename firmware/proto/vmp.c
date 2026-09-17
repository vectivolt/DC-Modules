/* vmp.c — VMP 2.0, see vmp.h and docs/can-protocol.md. */
#include "vmp.h"
#include "profile.h"
#include <math.h>
#include <string.h>

static bool is_ctrl(uint8_t a) { return a >= VMP_ADDR_CTRL_MIN && a <= VMP_ADDR_CTRL_MAX; }
static bool addressed(const vmp_t *v) { return v->cfg.addr >= VMP_ADDR_MOD_MIN && v->cfg.addr <= VMP_ADDR_MOD_MAX; }
static uint8_t group_addr(const vmp_t *v) {
  return (v->cfg.group >= 1u && v->cfg.group <= 16u) ? (uint8_t)(VMP_ADDR_GROUP_BASE + v->cfg.group - 1u) : 0u;
}
static bool delivering(const mod_tlm_t *m) {
  return m->rs == MOD_RS_ON || m->rs == MOD_RS_STARTING || m->rs == MOD_RS_STOPPING || m->rs == MOD_RS_MODE_CHANGE;
}
static uint8_t popcount16(uint16_t x) { uint8_t n = 0u; while (x) { n = (uint8_t)(n + (x & 1u)); x >>= 1; } return n; }
static uint32_t hash32(uint32_t x) { x ^= x >> 16; x *= 0x7FEB352Du; x ^= x >> 15; x *= 0x846CA68Bu; x ^= x >> 16; return x; }
static bool due(uint32_t *t_last, uint32_t now, uint32_t period) {
  if (now - *t_last < period) return false;
  *t_last = now;
  return true;
}

static void emit(pmp_txq_t *tx, uint8_t prio, uint8_t fn, uint8_t dst, uint8_t src, const uint8_t *d) {
  pmp_frame_t f;
  f.id = vmp_id(prio, 0u, fn, dst, src); f.dlc = 8u; memcpy(f.data, d, 8u);
  (void)pmp_txq_push(tx, &f);
}
static void ack(const vmp_t *v, pmp_txq_t *tx, uint8_t dst, uint8_t txn, uint8_t fn, uint8_t status, uint8_t detail, uint32_t value) {
  uint8_t d[8] = { txn, fn, status, detail, 0u, 0u, 0u, 0u };
  pmp_put32(d + 4, value);
  emit(tx, VMP_P_EVENT, VMP_F_ACK, dst, addressed(v) ? v->cfg.addr : VMP_ADDR_NULL, d);
}
/* a rejected cyclic frame is reported, at most once per VMP_NAK_GAP_MS — a misconfigured controller cannot turn a module
   into a second flood, and no rejection goes unreported for long */
static void nak(vmp_t *v, uint32_t now, pmp_txq_t *tx, uint8_t dst, uint8_t fn, uint8_t status, uint8_t detail) {
  v->rx_reject++;
  if (v->nak_ok && now - v->t_nak < VMP_NAK_GAP_MS) return;
  v->nak_ok = true; v->t_nak = now;
  ack(v, tx, dst, 0u, fn, status, detail, 0u);
}
static bool unlocked(const vmp_t *v, uint32_t now) { return v->unlocked && now - v->t_unlock <= VMP_UNLOCK_MS; }

static void cfg_sanitize(vmp_cfg_t *c) {   /* a corrupted store must not reach a divide or a timer as zero */
  vmp_cfg_t d; vmp_cfg_default(&d);
  if (!(c->addr >= VMP_ADDR_MOD_MIN && c->addr <= VMP_ADDR_MOD_MAX)) c->addr = VMP_ADDR_NULL;
  if (c->group > 16u) c->group = 0u;
  if (c->slot > 15u) c->slot = 0u;
  if (c->bitrate != 125000u && c->bitrate != 250000u && c->bitrate != 500000u) c->bitrate = d.bitrate;
  if (c->profile >= (uint8_t)PMP_PROFILE_COUNT) c->profile = 0u;
  if (c->comm_timeout_ms < 100u || c->comm_timeout_ms > 10000u) c->comm_timeout_ms = d.comm_timeout_ms;
  if (c->fast_ms < 10u || c->fast_ms > 1000u) c->fast_ms = d.fast_ms;
  if (c->slow_ms < 100u || c->slow_ms > 10000u) c->slow_ms = d.slow_ms;
  if (c->ramp_v_vps < 1u || c->ramp_v_vps > 5000u) c->ramp_v_vps = d.ramp_v_vps;
  if (c->ramp_i_aps < 1u || c->ramp_i_aps > 10000u) c->ramp_i_aps = d.ramp_i_aps;
  if (c->droop_mohm > 500u) c->droop_mohm = 0u;
  if (c->fan_mode > 2u) c->fan_mode = 0u;
}

void vmp_cfg_default(vmp_cfg_t *c) {
  *c = (vmp_cfg_t){ .addr = VMP_ADDR_NULL, .group = 0u, .slot = 0u, .bitrate = VMP_BITRATE_DEFAULT, .profile = 0u,
                    .comm_timeout_ms = 1000u, .fast_ms = 50u, .slow_ms = 1000u, .ramp_v_vps = 500u, .ramp_i_aps = 1000u,
                    .droop_mohm = 0u, .fan_mode = 0u, .p_cap_10w = 0xFFFFu };
}

void vmp_init(vmp_t *v, const vmp_cfg_t *cfg, const vmp_ident_t *id, uint32_t now) {
  memset(v, 0, sizeof *v);
  v->cfg = *cfg; cfg_sanitize(&v->cfg);
  v->id = id; v->t_boot = now; v->t_addr = now;
  pmp_group_init(&v->grp);
  v->omode = OMODE_AUTO; v->p_set = -1.0f;
  v->hold_run = true;   /* after a module (re)boot RUN counts only once RUN = 0 has been seen — a controller holding RUN through a
                           module reset cannot restart it blind; MOD_HB's new session id tells the controller to cycle RUN */
  v->tokens = VMP_REQ_BURST; v->t_tok = now;
  v->announce_due = true; v->t_announce = now + hash32(id->uid) % 200u;   /* boot announce, de-synchronized by identity */
  v->boot_event = true;
  uint32_t ph = (uint32_t)v->cfg.addr * 7u;   /* telemetry phased by address */
  v->t_fast = now - ph % v->cfg.fast_ms; v->t_limits = now - ph % 200u; v->t_derate = now - ph % 1000u;
  v->t_ac = now - ph % v->cfg.slow_ms; v->t_dc = v->t_ac - v->cfg.slow_ms / 4u; v->t_therm = v->t_ac - v->cfg.slow_ms / 2u;
  v->t_cool = v->t_ac - 3u * v->cfg.slow_ms / 4u; v->t_share = v->t_limits; v->t_bits = v->t_derate;
  v->t_detail = v->t_derate; v->t_hb = v->t_derate; v->t_stats = now;
}

/* ---------------- receive ---------------- */

/* 4-bit counter verdict: +1…+7 accepted (up to six frames lost), 0 = duplicate or frozen sender (freshness is NOT refreshed,
   so a controller stuck repeating one buffer times out), −8…−1 = an older frame arriving late (rejected). The first frame,
   and any frame after a timeout, resynchronizes. */
static int cnt_verdict(bool ok, uint8_t last, uint8_t c) {
  if (!ok) return 1;
  uint8_t d = (uint8_t)((c - last) & 0x0Fu);
  return d == 0u ? 0 : (d <= 7u ? 1 : -1);
}

static void take_owner(vmp_t *v, uint8_t src) {
  if (v->owner != src) { v->owner = src; v->session_ok = false; }
}

static void apply_run(vmp_t *v, bool run) {
  if (v->hold_run && !run) v->hold_run = false;   /* the owner's first RUN = 0 after it restarted re-arms the stream */
  v->run = run && !v->hold_run;
}

static void rx_ctrl(vmp_t *v, const pmp_frame_t *f, uint32_t now, pmp_txq_t *tx) {
  uint8_t src = (uint8_t)f->id;
  const uint8_t *d = f->data;
  if (f->dlc != 8u) { nak(v, now, tx, src, VMP_F_CTRL, VMP_E_LENGTH, f->dlc); return; }
  if (pmp_crc8_frame(f->id, d, 7u) != d[7]) { nak(v, now, tx, src, VMP_F_CTRL, VMP_E_CRC, 0u); return; }
  if ((d[0] & 0x08u) || ((d[0] >> 1) & 3u) == 3u) { nak(v, now, tx, src, VMP_F_CTRL, VMP_E_RESERVED_BITS, d[0]); return; }
  bool fresh = v->ctrl_seen && now - v->t_ctrl <= v->cfg.comm_timeout_ms;
  bool gfresh = v->gctrl_seen && now - v->t_gctrl <= v->cfg.comm_timeout_ms;
  if (v->owner && v->owner != src && (fresh || gfresh)) { nak(v, now, tx, src, VMP_F_CTRL, VMP_E_OWNED, v->owner); return; }
  if (!fresh || !v->unicast) v->cnt_ok = false;
  uint8_t c = d[0] >> 4;
  int verdict = cnt_verdict(v->cnt_ok, v->cnt, c);
  if (verdict == 0) { v->rx_dup++; return; }
  if (verdict < 0) { nak(v, now, tx, src, VMP_F_CTRL, VMP_E_SEQUENCE, c); return; }
  /* E81 (F-F-6): the CYCLIC setpoints get the coarse range check the WRITE path always had. The power stage was never
     at risk — fsm.c's v_max and ctl.c's i_avail/p_avail clamp independently — but a broken controller got no NAK, no
     rejection code, and telemetry echoed its impossible setpoint back as if the module had agreed to it. */
  float vs = (float)pmp_get16(d + 1) * 0.1f, is = (float)pmp_get16(d + 3) * 0.05f;
  if (vs > PMP_SER_VMAX_V * 1.1f) { nak(v, now, tx, src, VMP_F_CTRL, VMP_E_RANGE, 1u); return; }
  if (is > 400.0f) { nak(v, now, tx, src, VMP_F_CTRL, VMP_E_RANGE, 3u); return; }
  take_owner(v, src);
  v->cnt = c; v->cnt_ok = true; v->t_ctrl = now; v->ctrl_seen = true; v->unicast = true;
  apply_run(v, d[0] & 1u);
  v->omode = (pmp_omode_t)((d[0] >> 1) & 3u);
  v->v_set = vs;
  v->i_set = is;
  uint16_t p = pmp_get16(d + 5);
  v->p_set = (p == 0xFFFFu) ? -1.0f : (float)p * 10.0f;
}

static void rx_group(vmp_t *v, const pmp_frame_t *f, uint32_t now) {   /* group frames are never acknowledged (N replies) */
  uint8_t src = (uint8_t)f->id;
  const uint8_t *d = f->data;
  if (f->dlc != 8u || pmp_crc8_frame(f->id, d, 7u) != d[7] || ((d[0] >> 1) & 3u) == 3u) { v->rx_reject++; return; }
  bool fresh = v->ctrl_seen && now - v->t_ctrl <= v->cfg.comm_timeout_ms;
  bool gfresh = v->gctrl_seen && now - v->t_gctrl <= v->cfg.comm_timeout_ms;
  if (fresh && v->unicast) return;                       /* unicast control of this module wins over its group */
  if (v->owner && v->owner != src && (fresh || gfresh)) { v->rx_reject++; return; }
  if (!gfresh || v->unicast) v->gcnt_ok = false;
  uint8_t c = d[0] >> 4;
  int verdict = cnt_verdict(v->gcnt_ok, v->gcnt, c);
  if (verdict == 0) { v->rx_dup++; return; }
  if (verdict < 0) { v->rx_reject++; return; }
  take_owner(v, src);
  v->gcnt = c; v->gcnt_ok = true; v->t_gctrl = now; v->gctrl_seen = true; v->unicast = false;
  apply_run(v, d[0] & 1u);
  v->omode = (pmp_omode_t)((d[0] >> 1) & 3u);
  v->v_set = (float)pmp_get16(d + 1) * 0.1f;
  v->p_set = -1.0f;
  uint16_t members = pmp_get16(d + 5);
  uint32_t raw = pmp_get16(d + 3);
  /* EQUAL (bit 3 = 0): the field is the group total and group.c divides it by the members. LEVEL (bit 3 = 1): the field is
     each member's ceiling — a controller water-filling unequal capabilities; handed to group.c as level × members. */
  uint32_t da = (d[0] & 0x08u) ? raw * popcount16(members) / 2u : raw / 2u;
  pmp_group_set_t g = { .v_set_dv = pmp_get16(d + 1), .i_req_da = (uint16_t)(da > 65535u ? 65535u : da), .members = members, .base = 0u };
  pmp_group_frame(&v->grp, &g, v->cfg.slot, now);
}

static void rx_hb(vmp_t *v, const pmp_frame_t *f) {
  if (f->dlc < 4u || (uint8_t)f->id != v->owner) return;
  uint32_t s = pmp_get32(f->data);
  if (v->session_ok && s != v->session) { v->hold_run = true; v->run = false; }   /* the owner restarted: its old RUN no longer counts */
  v->session = s; v->session_ok = true;
}

static bool obj_get(const vmp_t *v, const mod_tlm_t *m, uint16_t o, uint8_t sub, uint32_t *val) {
  const vmp_ident_t *id = v->id;
  const vmp_cfg_t *c = &v->cfg;
  float knee = (m->i_rated > 0.0f) ? m->p_rated / m->i_rated : 0.0f;
  switch (o) {
  case VMP_O_PROTO: *val = (VMP_VER_MAJOR << 8) | VMP_VER_MINOR; return true;
  case VMP_O_PRODUCT: *val = id->product; return true;
  case VMP_O_UID: *val = id->uid; return true;
  case VMP_O_SERIAL: if (sub > 3u) return false; *val = pmp_get32((const uint8_t *)id->serial + 4u * sub); return true;
  case VMP_O_HW_REV: *val = id->hw_rev; return true;
  case VMP_O_FW: *val = id->fw; return true;
  case VMP_O_FW_CRC: *val = id->fw_crc; return true;
  case VMP_O_BOOT_VER: *val = id->boot_ver; return true;
  case VMP_O_BOOT_STATE: *val = id->boot_state; return true;
  case VMP_O_RESET_CAUSE: *val = id->reset_cause; return true;
  case VMP_O_FEATURES: *val = id->features; return true;
  case VMP_O_V_MIN: *val = pmp_sat_u16(m->v_min, 0.1f); return true;
  case VMP_O_V_MAX: *val = pmp_sat_u16(PMP_SER_VMAX_V, 0.1f); return true;
  case VMP_O_I_RATED: *val = pmp_sat_u16(m->i_rated, 0.05f); return true;
  case VMP_O_P_RATED: *val = pmp_sat_u16(m->p_rated, 10.0f); return true;
  case VMP_O_LOW_VMAX: *val = pmp_sat_u16(PMP_PAR_VMAX_V, 0.1f); return true;
  case VMP_O_HIGH_VMIN: *val = pmp_sat_u16(PMP_XOVER_UP_V, 0.1f); return true;
  case VMP_O_ENVELOPE: {   /* corner points of the V–I envelope: value = V (0.1 V) << 16 | I (0.05 A) */
    float pv[3] = { m->v_min, knee, PMP_SER_VMAX_V }, pi[3] = { m->i_rated, m->i_rated, m->p_rated / PMP_SER_VMAX_V };
    if (sub > 2u) return false;
    *val = ((uint32_t)pmp_sat_u16(pv[sub], 0.1f) << 16) | pmp_sat_u16(pi[sub], 0.05f);
    return true; }
  case VMP_O_ADDR: *val = c->addr; return true;
  case VMP_O_GROUP: *val = c->group; return true;
  case VMP_O_SLOT: *val = c->slot; return true;
  case VMP_O_BITRATE: *val = c->bitrate; return true;
  case VMP_O_PROFILE: *val = c->profile; return true;
  case VMP_O_COMM_TO: *val = c->comm_timeout_ms; return true;
  case VMP_O_FAST_MS: *val = c->fast_ms; return true;
  case VMP_O_SLOW_MS: *val = c->slow_ms; return true;
  case VMP_O_RAMP_V: *val = c->ramp_v_vps; return true;
  case VMP_O_RAMP_I: *val = c->ramp_i_aps; return true;
  case VMP_O_DROOP: *val = c->droop_mohm; return true;
  case VMP_O_FAN_MODE: *val = c->fan_mode; return true;
  case VMP_O_P_CAP: *val = c->p_cap_10w; return true;
  case VMP_O_OP_S: *val = m->op_s; return true;
  case VMP_O_ENERGY: *val = m->energy_wh / 100u; return true;   /* 0.1 kWh */
  case VMP_O_STARTS: *val = m->starts; return true;
  case VMP_O_FAULTS: *val = m->fault_total; return true;
  default:
    if (v->aux_read && o >= 0x0400u) { bool ok = false; *val = v->aux_read(v->aux_ctx, o, sub, &ok); return ok; }
    return false;
  }
}

static uint8_t obj_set(vmp_t *v, const mod_tlm_t *m, uint16_t o, uint32_t val, uint32_t now, uint32_t *applied) {
  vmp_cfg_t *c = &v->cfg;
  uint32_t dummy;
  *applied = val;
  if (o < 0x0200u || o >= 0x0300u) return obj_get(v, m, o, 0u, &dummy) ? VMP_E_READ_ONLY : VMP_E_UNSUPPORTED_ITEM;
  bool critical = o == VMP_O_ADDR || o == VMP_O_BITRATE || o == VMP_O_PROFILE;
  bool structural = critical || o == VMP_O_GROUP || o == VMP_O_SLOT;
  if (o > VMP_O_P_CAP) return VMP_E_UNSUPPORTED_ITEM;
  if (critical && !unlocked(v, now)) return VMP_E_LOCKED;
  if (structural && delivering(m)) return VMP_E_STATE;
  switch (o) {
  case VMP_O_ADDR: if (val < VMP_ADDR_MOD_MIN || val > VMP_ADDR_MOD_MAX) return VMP_E_RANGE;
    if (c->addr != val) { c->addr = (uint8_t)val; v->t_addr = now; v->owner = 0u; v->announce_due = true; v->t_announce = now; }
    break;
  case VMP_O_GROUP: if (val > 16u) return VMP_E_RANGE; c->group = (uint8_t)val; break;
  case VMP_O_SLOT: if (val > 15u) return VMP_E_RANGE; c->slot = (uint8_t)val; break;
  case VMP_O_BITRATE: if (val != 125000u && val != 250000u && val != 500000u) return VMP_E_RANGE; c->bitrate = val; break;
  case VMP_O_PROFILE: if (val >= (uint32_t)PMP_PROFILE_COUNT) return VMP_E_RANGE; c->profile = (uint8_t)val; break;
  case VMP_O_COMM_TO: if (val < 100u || val > 10000u) return VMP_E_RANGE; c->comm_timeout_ms = (uint16_t)val; break;
  case VMP_O_FAST_MS: if (val < 10u || val > 1000u) return VMP_E_RANGE; c->fast_ms = (uint16_t)val; break;
  case VMP_O_SLOW_MS: if (val < 100u || val > 10000u) return VMP_E_RANGE; c->slow_ms = (uint16_t)val; break;
  case VMP_O_RAMP_V: if (val < 1u || val > 5000u) return VMP_E_RANGE; c->ramp_v_vps = (uint16_t)val; break;
  case VMP_O_RAMP_I: if (val < 1u || val > 10000u) return VMP_E_RANGE; c->ramp_i_aps = (uint16_t)val; break;
  case VMP_O_DROOP: if (val > 500u) return VMP_E_RANGE; c->droop_mohm = (uint16_t)val; break;
  case VMP_O_FAN_MODE: if (val > 2u) return VMP_E_RANGE; c->fan_mode = (uint8_t)val; break;
  case VMP_O_P_CAP: if (val > 0xFFFFu) return VMP_E_RANGE; c->p_cap_10w = (uint16_t)val; break;
  default: return VMP_E_UNSUPPORTED_ITEM;
  }
  v->nv_dirty = true;
  return VMP_OK;
}

static bool take_token(vmp_t *v, uint32_t now, pmp_txq_t *tx, uint8_t src, uint8_t fn) {
  if (v->tokens) { v->tokens--; return true; }
  nak(v, now, tx, src, fn, VMP_E_BUSY, 0u);
  return false;
}

static void rx_action(vmp_t *v, const pmp_frame_t *f, uint32_t now, const mod_tlm_t *m, mod_cmd_t *cmd, pmp_txq_t *tx, bool uni) {
  uint8_t src = (uint8_t)f->id;
  const uint8_t *d = f->data;
  if (uni && !take_token(v, now, tx, src, VMP_F_ACTION)) return;
  if (f->dlc != 8u) { if (uni) ack(v, tx, src, d[0], VMP_F_ACTION, VMP_E_LENGTH, f->dlc, 0u); return; }
  if (pmp_crc8_frame(f->id, d, 7u) != d[7]) { v->rx_reject++; if (uni) ack(v, tx, src, d[0], VMP_F_ACTION, VMP_E_CRC, 0u, 0u); return; }
  uint8_t a = d[1];
  uint32_t arg = pmp_get32(d + 2);
  /* actions that change what the module is (reboot, factory state, bootloader) or open writes are never taken from a
     group or broadcast frame */
  if (!uni && (a == VMP_A_REBOOT || a == VMP_A_UNLOCK || a == VMP_A_FACTORY_RESET || a == VMP_A_ENTER_BOOT || a == VMP_A_RELEASE)) return;
  uint8_t st = VMP_OK;
  switch (a) {
  case VMP_A_CLEAR: if (m->rs == MOD_RS_LOCKED) st = VMP_E_LOCKED; else cmd->clear = true; break;
  case VMP_A_SHUTDOWN: cmd->shutdown = true; break;                        /* stopping is always permitted, owner or not */
  case VMP_A_WAKE: if (m->rs != MOD_RS_OFF) st = VMP_E_STATE; else cmd->wake = true; break;
  case VMP_A_LOCATE: cmd->locate_s = (uint16_t)(arg > 3600u ? 3600u : arg); break;
  case VMP_A_REBOOT: st = arg != VMP_KEY_REBOOT ? VMP_E_KEY : delivering(m) ? VMP_E_STATE : VMP_OK; if (st == VMP_OK) v->reboot_req = true; break;
  case VMP_A_UNLOCK: if (arg != VMP_KEY_UNLOCK) st = VMP_E_KEY; else { v->unlocked = true; v->t_unlock = now; } break;
  case VMP_A_FACTORY_RESET: st = !unlocked(v, now) ? VMP_E_LOCKED : delivering(m) ? VMP_E_STATE : VMP_OK; if (st == VMP_OK) v->factory_req = true; break;
  case VMP_A_ENTER_BOOT: st = !unlocked(v, now) ? VMP_E_LOCKED : delivering(m) ? VMP_E_STATE : VMP_OK; if (st == VMP_OK) v->boot_req = true; break;
  case VMP_A_RELEASE: if (v->owner == src) { v->owner = 0u; v->run = false; } else st = VMP_E_OWNED; break;
  default: st = VMP_E_UNSUPPORTED_ITEM; break;
  }
  if (uni) ack(v, tx, src, d[0], VMP_F_ACTION, st, a, arg);
}

static void rx_read(vmp_t *v, const pmp_frame_t *f, uint32_t now, const mod_tlm_t *m, pmp_txq_t *tx) {
  uint8_t src = (uint8_t)f->id;
  if (!take_token(v, now, tx, src, VMP_F_READ)) return;
  if (f->dlc < 4u) { ack(v, tx, src, f->data[0], VMP_F_READ, VMP_E_LENGTH, f->dlc, 0u); return; }
  uint16_t o = pmp_get16(f->data + 1);
  uint8_t sub = f->data[3];
  uint32_t val = 0u;
  if (!obj_get(v, m, o, sub, &val)) { ack(v, tx, src, f->data[0], VMP_F_READ, VMP_E_UNSUPPORTED_ITEM, sub, o); return; }
  uint8_t d[8] = { f->data[0], (uint8_t)o, (uint8_t)(o >> 8), sub, 0u, 0u, 0u, 0u };
  pmp_put32(d + 4, val);
  emit(tx, VMP_P_SVC, VMP_F_READ_RSP, src, v->cfg.addr, d);
}

static void rx_write(vmp_t *v, const pmp_frame_t *f, uint32_t now, const mod_tlm_t *m, pmp_txq_t *tx) {
  uint8_t src = (uint8_t)f->id;
  if (!take_token(v, now, tx, src, VMP_F_WRITE)) return;
  if (f->dlc != 8u) { ack(v, tx, src, f->data[0], VMP_F_WRITE, VMP_E_LENGTH, f->dlc, 0u); return; }
  uint16_t o = pmp_get16(f->data + 1);
  uint32_t applied = 0u;
  uint8_t st = obj_set(v, m, o, pmp_get32(f->data + 4), now, &applied);
  ack(v, tx, src, f->data[0], VMP_F_WRITE, st, f->data[3], applied);
}

static void rx_discover(vmp_t *v, const pmp_frame_t *f, uint32_t now) {
  if (f->dlc < 2u || ((f->data[0] & 1u) && addressed(v))) return;
  uint32_t win = f->data[1] ? (uint32_t)f->data[1] * 10u : 500u;
  v->announce_due = true;
  v->t_announce = now + hash32(v->id->uid ^ now) % win;   /* modules answer spread across the window */
}

static void rx_assign(vmp_t *v, const pmp_frame_t *f, uint32_t now, const mod_tlm_t *m, pmp_txq_t *tx) {
  const uint8_t *d = f->data;
  if (f->dlc != 8u || pmp_crc8_frame(f->id, d, 7u) != d[7] || pmp_get32(d) != v->id->uid) return;
  uint8_t st = VMP_OK;
  if (d[4] < VMP_ADDR_MOD_MIN || d[4] > VMP_ADDR_MOD_MAX || d[5] > 16u || (d[6] != 0xFFu && d[6] > 15u)) st = VMP_E_RANGE;
  else if (delivering(m)) st = VMP_E_STATE;
  else {
    if (v->cfg.addr != d[4]) v->t_addr = now;
    v->cfg.addr = d[4];
    if (d[5]) v->cfg.group = d[5];
    if (d[6] != 0xFFu) v->cfg.slot = d[6];
    v->nv_dirty = true; v->conflict = false; v->owner = 0u;
    v->announce_due = true; v->t_announce = now;
  }
  ack(v, tx, (uint8_t)f->id, 0u, VMP_F_ADDR_ASSIGN, st, d[4], v->id->uid);
}

static void rx_module(vmp_t *v, const pmp_frame_t *f, uint32_t now, const mod_tlm_t *m) {
  uint8_t fn = (uint8_t)(f->id >> 16), src = (uint8_t)f->id;
  if (addressed(v) && src == v->cfg.addr) {       /* another node transmits with this module's address */
    if (now - v->t_addr >= VMP_INCUMBENT_MS) { v->conflict = true; v->t_conflict = now; }
    else if (!delivering(m)) { v->cfg.addr = VMP_ADDR_NULL; v->owner = 0u; v->run = false; v->announce_due = true; v->t_announce = now; }
    return;
  }
  if (fn == VMP_F_TLM_SHARE && f->dlc == 8u && v->cfg.group && f->data[0] == v->cfg.group && f->data[1] < 16u && f->data[1] != v->cfg.slot) {
    uint8_t s = f->data[1];
    v->peer[s].i_raw = (int16_t)pmp_get16(f->data + 2); v->peer[s].t = now; v->peer[s].seen = true;
  }
}

void vmp_rx(vmp_t *v, const pmp_frame_t *f, uint32_t now, const mod_tlm_t *m, mod_cmd_t *cmd, pmp_txq_t *tx) {
  uint32_t id = f->id & 0x1FFFFFFFu;
  if (!((id >> 25) & 1u) || ((id >> 24) & 1u) || f->dlc > 8u) return;   /* not native, or the bootloader's service space */
  uint8_t fn = (uint8_t)(id >> 16), dst = (uint8_t)(id >> 8), src = (uint8_t)id;
  if (fn >= 0x40u && fn <= 0x7Fu) { rx_module(v, f, now, m); return; }
  if (!is_ctrl(src)) return;
  bool uni = addressed(v) && dst == v->cfg.addr, grp = group_addr(v) && dst == group_addr(v), all = dst == VMP_ADDR_ALL;
  switch (fn) {
  case VMP_F_CTRL: if (uni) rx_ctrl(v, f, now, tx); return;
  case VMP_F_GROUP_CTRL: if (grp && addressed(v)) rx_group(v, f, now); return;
  case VMP_F_CTRL_HB: if (all || uni) rx_hb(v, f); return;
  case VMP_F_ACTION: if (uni || grp || all) rx_action(v, f, now, m, cmd, tx, uni); return;
  case VMP_F_READ: if (uni) rx_read(v, f, now, m, tx); return;
  case VMP_F_WRITE: if (uni) rx_write(v, f, now, m, tx); return;
  case VMP_F_DISCOVER: if (all) rx_discover(v, f, now); return;
  case VMP_F_ADDR_ASSIGN: if (all) rx_assign(v, f, now, m, tx); return;
  case VMP_F_TIME_SYNC: if (all && f->dlc >= 4u) { v->epoch_s = pmp_get32(f->data); v->t_epoch = now; v->epoch_ok = true; } return;
  default: if (uni) nak(v, now, tx, src, fn, VMP_E_UNSUPPORTED_FUNCTION, 0u); return;
  }
}

/* ---------------- transmit ---------------- */

static float tmax_zone(const mod_tlm_t *m) {
  float z[3] = { m->t_pfc, m->t_llc, m->t_xfmr }, t = NAN;
  for (unsigned k = 0u; k < 3u; k++) if (isfinite(z[k]) && !(t >= z[k])) t = z[k];
  return t;
}

static uint64_t warn_bits(const vmp_t *v, const mod_tlm_t *m, uint32_t age, pmp_txq_t *tx) {
  uint64_t w = m->warn;
  if (age > v->cfg.comm_timeout_ms) w |= 1ull << VMP_W_CMD_STALE;
  if (v->conflict) w |= 1ull << VMP_W_ADDR_CONFL;
  if (tx->dropped) w |= 1ull << VMP_W_TX_DROP;
  if (v->rx_reject) w |= 1ull << VMP_W_RX_REJECT;
  if (v->ev_suppressed) w |= 1ull << VMP_W_EV_SUPPRESS;   /* E81 (K7): events were rate-limited — 0x0502 has the count */
  return w;
}

#define W_REPORT (PMP_W_LINE_WAIT | PMP_W_IN_RIDE | PMP_W_DERATE_TH | PMP_W_DERATE_FAN | PMP_W_NO_SETPOINT | PMP_W_MEAS_GLITCH | \
                  PMP_W_RELAY_FB_OFF | PMP_W_RECOVERING | PMP_W_REARM)

/* E81 (K7): one EVENT per {kind, code} per VMP_EVENT_GAP_MS. Returns false when this one is being suppressed. */
static bool ev_allow(vmp_t *v, uint32_t now, uint8_t kind, uint8_t code) {
  for (unsigned k = 0u; k < 8u; k++)
    if (v->ev_gate[k].kind == kind && v->ev_gate[k].code == code) {
      if (now - v->ev_gate[k].t < VMP_EVENT_GAP_MS) { v->ev_suppressed++; v->t_ev_sup = now; return false; }
      v->ev_gate[k].t = now;
      return true;
    }
  v->ev_gate[v->ev_gate_i].kind = kind; v->ev_gate[v->ev_gate_i].code = code; v->ev_gate[v->ev_gate_i].t = now;
  v->ev_gate_i = (uint8_t)((v->ev_gate_i + 1u) & 7u);
  return true;
}

static void tx_event(vmp_t *v, pmp_txq_t *tx, uint32_t now, uint8_t kind, uint8_t code) {
  if (!ev_allow(v, now, kind, code)) return;
  uint8_t d[8] = { 0u };
  pmp_put16(d, ++v->event_no);
  d[2] = kind; d[3] = code;
  pmp_put32(d + 4, now - v->t_boot);
  emit(tx, VMP_P_EVENT, VMP_F_EVENT, VMP_ADDR_ALL, v->cfg.addr, d);
}

static void tx_announce(const vmp_t *v, pmp_txq_t *tx) {
  uint8_t d[8] = { 0u };
  pmp_put32(d, v->id->uid);
  pmp_put16(d + 4, v->id->product);
  d[6] = (uint8_t)((VMP_VER_MAJOR << 4) | VMP_VER_MINOR);
  d[7] = (uint8_t)((addressed(v) ? 1u : 0u) | (v->conflict ? 2u : 0u) | (v->owner ? 4u : 0u) | (v->cfg.group ? 8u : 0u));
  emit(tx, VMP_P_SVC, VMP_F_ANNOUNCE, VMP_ADDR_ALL, addressed(v) ? v->cfg.addr : VMP_ADDR_NULL, d);
}

void vmp_tick(vmp_t *v, uint32_t now, const mod_tlm_t *m, mod_cmd_t *cmd, pmp_txq_t *tx) {
  uint32_t to = v->cfg.comm_timeout_ms;
  if (now - v->t_tok >= 50u) { v->t_tok = now; if (v->tokens < VMP_REQ_BURST) v->tokens++; }
  if (v->unlocked && now - v->t_unlock > VMP_UNLOCK_MS) v->unlocked = false;
  if (v->conflict && now - v->t_conflict > VMP_CONFLICT_HOLD_MS) v->conflict = false;
  bool seen = v->unicast ? v->ctrl_seen : v->gctrl_seen;
  uint32_t age = seen ? now - (v->unicast ? v->t_ctrl : v->t_gctrl) : UINT32_MAX / 2u;
  if (age > to && v->owner) { v->owner = 0u; v->session_ok = false; }   /* ownership lapses with the control stream */

  /* canonical intent. RUN is a level: it is NOT dropped on a timeout — the core then holds the module until the controller
     is seen sending RUN = 0 again, so a stream that simply resumes cannot restart a stopped module. */
  cmd->run = v->run && addressed(v);
  cmd->omode = v->omode; cmd->v_set_v = v->v_set;
  cmd->p_set_w = v->p_set;
  if (v->cfg.p_cap_10w != 0xFFFFu) {
    float cap = (float)v->cfg.p_cap_10w * 10.0f;
    cmd->p_set_w = (cmd->p_set_w < 0.0f) ? cap : fminf(cmd->p_set_w, cap);
  }
  cmd->age_ms = age; cmd->timeout_ms = to;
  cmd->grp_active = !v->unicast && v->gctrl_seen;
  if (cmd->grp_active) {
    pmp_group_out_t go;
    pmp_group_step(&v->grp, v->cfg.slot, pmp_sat_u16(m->i_avail, 0.1f), now, &go);
    cmd->grp_share_a = (float)go.i_set_da * 0.1f; cmd->grp_deliver = go.deliver; cmd->i_set_a = m->i_rated;
  } else { cmd->grp_share_a = 0.0f; cmd->grp_deliver = false; cmd->i_set_a = v->i_set; }
  float sum = 0.0f; uint8_t n = 0u;
  if (v->cfg.group)
    for (uint8_t s = 0u; s < 16u; s++)
      if (s != v->cfg.slot && v->peer[s].seen && now - v->peer[s].t <= VMP_PEER_STALE_MS) { sum += (float)v->peer[s].i_raw * 0.05f; n++; }
  if (n && isfinite(m->i_out)) { cmd->peer_avg_a = (sum + m->i_out) / (float)(n + 1u); cmd->peer_n = (uint8_t)(n + 1u); }
  else { cmd->peer_avg_a = NAN; cmd->peer_n = 0u; }

  if (v->announce_due && (int32_t)(now - v->t_announce) >= 0) {
    tx_announce(v, tx);
    v->announce_due = !addressed(v);               /* an unaddressed module keeps announcing once a second */
    v->t_announce = now + 1000u;
  }
  if (!addressed(v)) return;
  uint8_t me = v->cfg.addr, d[8];

  if (v->boot_event) { tx_event(v, tx, now, VMP_EV_BOOT, v->id->reset_cause); v->boot_event = false; }
  /* events: fault set/clear, each warning edge, run-state changes — at most four per tick; the bit frames carry the rest */
  if (!v->have_ev) { v->ev_fault = m->fault; v->ev_warn = m->warn & W_REPORT; v->ev_rs = (uint8_t)m->rs; v->have_ev = true; }
  unsigned budget = 4u;
  if (m->fault != v->ev_fault && budget) {
    if (v->ev_fault != FC_NONE) { tx_event(v, tx, now, VMP_EV_FAULT_CLEAR, (uint8_t)v->ev_fault); budget--; }
    if (m->fault != FC_NONE && budget) { tx_event(v, tx, now, VMP_EV_FAULT_SET, (uint8_t)m->fault); budget--; }
    v->ev_fault = m->fault;
  }
  uint32_t wr = m->warn & W_REPORT;
  for (unsigned b = 0u; b < 32u && budget; b++) {
    uint32_t bit = 1u << b;
    if ((wr ^ v->ev_warn) & bit) { tx_event(v, tx, now, (wr & bit) ? VMP_EV_WARN_SET : VMP_EV_WARN_CLEAR, (uint8_t)b); v->ev_warn ^= bit; budget--; }
  }
  if ((uint8_t)m->rs != v->ev_rs && budget) { tx_event(v, tx, now, VMP_EV_STATE, (uint8_t)m->rs); v->ev_rs = (uint8_t)m->rs; }

  uint64_t wb = warn_bits(v, m, age, tx);
  if (due(&v->t_fast, now, v->cfg.fast_ms)) {
    pmp_put16(d, pmp_sat_u16(m->v_out, 0.1f));
    pmp_put16(d + 2, (uint16_t)pmp_sat_i16(m->i_out, 0.05f));
    d[4] = (uint8_t)(((uint8_t)m->rs & 0x0Fu) | (uint8_t)((m->limiter & 0x0Fu) << 4));
    d[5] = (uint8_t)((m->fault != FC_NONE ? 1u : 0u) | ((m->warn & W_REPORT) ? 2u : 0u) | (m->derate_why ? 4u : 0u) |
                     (age > to ? 8u : 0u) | ((m->rearm || v->hold_run) ? 16u : 0u) | (m->rs == MOD_RS_LOCKED ? 32u : 0u) |
                     (v->owner == 0u && age <= to ? 64u : 0u) | (v->conflict ? 128u : 0u));
    d[6] = (uint8_t)(((v->unicast ? v->cnt : v->gcnt) & 0x0Fu) | ((v->tx_cnt++ & 0x0Fu) << 4));
    d[7] = (uint8_t)m->fault;
    emit(tx, VMP_P_FAST, VMP_F_TLM_FAST, VMP_ADDR_ALL, me, d);
  }
  if (due(&v->t_limits, now, 200u)) {
    pmp_put16(d, pmp_sat_u16(m->i_avail, 0.05f)); pmp_put16(d + 2, pmp_sat_u16(m->p_avail, 10.0f));
    pmp_put16(d + 4, pmp_sat_u16(m->v_ref, 0.1f)); pmp_put16(d + 6, pmp_sat_u16(m->i_ref, 0.05f));
    emit(tx, VMP_P_MED, VMP_F_TLM_LIMITS, VMP_ADDR_ALL, me, d);
  }
  bool why_ch = m->derate_why != v->sent_why && now - v->t_derate >= 20u;
  if (why_ch || due(&v->t_derate, now, 1000u)) {
    v->t_derate = now; v->sent_why = m->derate_why;
    float tz = tmax_zone(m);
    d[0] = pmp_sat_u8(m->derate * 100.0f, 0.5f);
    pmp_put16(d + 1, m->derate_why); pmp_put16(d + 3, pmp_sat_u16(m->p_lim, 10.0f));
    d[5] = (uint8_t)pmp_sat_i8(isfinite(tz) ? PMP_OT_DERATE_C - tz : NAN, 1.0f);
    d[6] = (uint8_t)((m->rs == MOD_RS_MODE_CHANGE ? 3u : (m->mode == MODE_SER ? 2u : 1u)) | ((uint8_t)m->omode << 4));
    d[7] = 0u;
    emit(tx, VMP_P_MED, VMP_F_TLM_DERATE, VMP_ADDR_ALL, me, d);
  }
  if (due(&v->t_ac, now, v->cfg.slow_ms)) {
    for (unsigned k = 0u; k < 3u; k++) pmp_put16(d + 2u * k, pmp_sat_u16(m->vin_ph[k], 0.1f));
    pmp_put16(d + 6, pmp_sat_u16(m->line_hz, 0.01f));
    emit(tx, VMP_P_SLOW, VMP_F_TLM_AC, VMP_ADDR_ALL, me, d);
  }
  if (due(&v->t_dc, now, v->cfg.slow_ms)) {
    pmp_put16(d, pmp_sat_u16(m->v_bus, 0.1f)); pmp_put16(d + 2, (uint16_t)pmp_sat_i16(m->v_mid_imb, 0.1f));
    pmp_put16(d + 4, pmp_sat_u16(m->v_bank_a, 0.1f)); pmp_put16(d + 6, pmp_sat_u16(m->v_bank_b, 0.1f));
    emit(tx, VMP_P_SLOW, VMP_F_TLM_DC, VMP_ADDR_ALL, me, d);
  }
  if (due(&v->t_therm, now, v->cfg.slow_ms)) {
    float z[8] = { m->t_inlet, m->t_coolant, m->t_pfc, m->t_llc, m->t_xfmr, m->t_diode, m->t_bank, m->t_mcu };
    for (unsigned k = 0u; k < 8u; k++) d[k] = (uint8_t)pmp_sat_i8(z[k], 1.0f);
    emit(tx, VMP_P_SLOW, VMP_F_TLM_THERMAL, VMP_ADDR_ALL, me, d);
  }
  /* E81 (K1): the pack / external node behind DOUT. UUGreen, ENR and GWBZ all carry it; a controller needs it to
     pre-position its reference before the contactor closes and to sanity-check a setpoint against a plausible pack.
     b0–1 pack voltage u16 0.1 V (0xFFFF = none or unknown) · b2 external node present · b3–7 reserved 0. */
  if (due(&v->t_pack, now, v->cfg.slow_ms)) {
    memset(d, 0, sizeof d);
    pmp_put16(d, (m->ext_connected && isfinite(m->v_ext)) ? pmp_sat_u16(m->v_ext, 0.1f) : 0xFFFFu);
    d[2] = m->ext_connected ? 1u : 0u;
    emit(tx, VMP_P_SLOW, VMP_F_TLM_PACK, VMP_ADDR_ALL, me, d);
  }
  if (due(&v->t_cool, now, v->cfg.slow_ms)) {
    for (unsigned k = 0u; k < 4u; k++) d[k] = pmp_sat_u8((float)m->fan_rpm[k], 50.0f);
    d[4] = m->fan_duty; d[5] = m->fan_fail; d[6] = v->cfg.fan_mode; d[7] = 0u;
    emit(tx, VMP_P_SLOW, VMP_F_TLM_COOLING, VMP_ADDR_ALL, me, d);
  }
  if (v->cfg.group && due(&v->t_share, now, 200u)) {
    d[0] = v->cfg.group; d[1] = v->cfg.slot;
    pmp_put16(d + 2, (uint16_t)pmp_sat_i16(m->i_out, 0.05f));
    pmp_put16(d + 4, pmp_sat_u16(cmd->grp_active ? cmd->grp_share_a : m->i_ref, 0.05f));
    d[6] = (uint8_t)pmp_sat_i8(m->v_set > 0.0f ? m->trim_v * 1000.0f / m->v_set : 0.0f, 1.0f);   /* 0.1 % of the command */
    d[7] = (uint8_t)((cmd->grp_active ? 1u : 0u) | (cmd->grp_deliver ? 2u : 0u) | (m->share_active ? 4u : 0u));
    emit(tx, VMP_P_MED, VMP_F_TLM_SHARE, VMP_ADDR_ALL, me, d);
  }
  bool bits_ch = (m->fault_bits != v->sent_fb || wb != v->sent_wb) && now - v->t_bits >= 20u;
  if (bits_ch || due(&v->t_bits, now, 1000u)) {
    v->t_bits = now; v->sent_fb = m->fault_bits; v->sent_wb = wb;
    pmp_put32(d, (uint32_t)m->fault_bits); pmp_put32(d + 4, (uint32_t)(m->fault_bits >> 32));
    emit(tx, VMP_P_EVENT, VMP_F_FAULT_BITS, VMP_ADDR_ALL, me, d);
    pmp_put32(d, (uint32_t)wb); pmp_put32(d + 4, (uint32_t)(wb >> 32));
    emit(tx, VMP_P_MED, VMP_F_WARN_BITS, VMP_ADDR_ALL, me, d);
  }
  bool det_ch = m->fault != v->sent_detail;
  if (det_ch || (m->fault != FC_NONE && due(&v->t_detail, now, 1000u))) {
    v->t_detail = now; v->sent_detail = m->fault;
    d[0] = (uint8_t)m->fault; d[1] = (uint8_t)m->fclass;
    pmp_put16(d + 2, (m->fclass == FCL_AUTO_EXT || m->fclass == FCL_AUTO_INT) ? (uint16_t)((m->recover_ms + 999u) / 1000u) : 0xFFFFu);
    d[4] = 0u; d[5] = m->rearm ? 1u : 0u;
    pmp_put16(d + 6, v->event_no);
    emit(tx, VMP_P_EVENT, VMP_F_FAULT_DETAIL, VMP_ADDR_ALL, me, d);
  }
  if (due(&v->t_hb, now, 1000u)) {
    pmp_put32(d, v->id->session); pmp_put16(d + 4, (uint16_t)((now - v->t_boot) / 1000u));
    d[6] = v->id->reset_cause; d[7] = (uint8_t)((VMP_VER_MAJOR << 4) | VMP_VER_MINOR);
    emit(tx, VMP_P_SLOW, VMP_F_MOD_HB, VMP_ADDR_ALL, me, d);
  }
  if (due(&v->t_stats, now, 60000u)) {
    pmp_put32(d, m->op_s); pmp_put32(d + 4, m->energy_wh / 100u);
    emit(tx, VMP_P_SLOW, VMP_F_STATS, VMP_ADDR_ALL, me, d);
  }
}
