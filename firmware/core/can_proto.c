/* can_proto.c — CAN 2.0B codec per docs/can-protocol.md (little-endian, bounds-checked).
 * Pure functions over byte buffers; transport (bxCAN/FDCAN driver) is HAL-side. */
#include "can_proto.h"
#include <string.h>

uint32_t pmp_can_id(uint8_t prio, uint8_t msgtype, uint8_t dest, uint8_t src, uint8_t group) {
  return ((uint32_t)(prio & 7u) << 26) | ((uint32_t)msgtype << 18) |
         ((uint32_t)dest << 10) | ((uint32_t)src << 2) | (group & 3u);
}
void pmp_can_id_parse(uint32_t id, pmp_can_hdr_t *h) {
  h->prio = (id >> 26) & 7u; h->msgtype = (id >> 18) & 0xFFu;
  h->dest = (id >> 10) & 0xFFu; h->src = (id >> 2) & 0xFFu; h->group = id & 3u;
}

static void put_u32(uint8_t *b, uint32_t v) { b[0]=v; b[1]=v>>8; b[2]=v>>16; b[3]=v>>24; }
static void put_u16(uint8_t *b, uint16_t v) { b[0]=v; b[1]=v>>8; }
static uint32_t get_u32(const uint8_t *b) { return (uint32_t)b[0] | ((uint32_t)b[1]<<8) | ((uint32_t)b[2]<<16) | ((uint32_t)b[3]<<24); }
static uint16_t get_u16(const uint8_t *b) { return (uint16_t)((uint16_t)b[0] | ((uint16_t)b[1]<<8)); }

bool pmp_dec_set_output(const uint8_t *d, uint8_t dlc, pmp_set_output_t *o) {
  if (dlc != 8 || !d || !o) return false;
  o->v_set_mv = get_u32(d); o->i_set_ma = get_u32(d + 4);
  if (o->v_set_mv > 1000000u || o->i_set_ma > 420000u) return false;   /* range guard */
  return true;
}
void pmp_enc_set_output(uint8_t *d, const pmp_set_output_t *o) { put_u32(d, o->v_set_mv); put_u32(d + 4, o->i_set_ma); }

bool pmp_dec_module_ctl(const uint8_t *d, uint8_t dlc, pmp_module_ctl_t *o) {
  if (dlc < 1 || !d || !o) return false;
  o->enable = d[0] & 1u; o->clear_faults = (d[0] >> 1) & 1u;
  o->force_hv = (d[0] >> 2) & 1u; o->force_lv = (d[0] >> 3) & 1u;
  o->locate = (d[0] >> 4) & 1u; o->walk_in = (d[0] >> 5) & 1u;
  if (o->force_hv && o->force_lv) return false;                        /* contradictory */
  return true;
}

void pmp_enc_status1(uint8_t *d, uint32_t vout_mv, uint32_t iout_ma) { put_u32(d, vout_mv); put_u32(d + 4, iout_ma); }
bool pmp_dec_status1(const uint8_t *d, uint8_t dlc, uint32_t *v, uint32_t *i) {
  if (dlc != 8 || !d) return false; *v = get_u32(d); *i = get_u32(d + 4); return true;
}
void pmp_enc_status2(uint8_t *d, const pmp_status2_t *s) {
  put_u16(d, s->p_avail_10w); put_u16(d + 2, s->i_avail_10ma);
  d[4] = s->state; d[5] = s->mode; put_u16(d + 6, s->fault_lo);
}
bool pmp_dec_status2(const uint8_t *d, uint8_t dlc, pmp_status2_t *s) {
  if (dlc != 8 || !d || !s) return false;
  s->p_avail_10w = get_u16(d); s->i_avail_10ma = get_u16(d + 2);
  s->state = d[4]; s->mode = d[5]; s->fault_lo = get_u16(d + 6);
  return s->state <= 5 && s->mode <= 2;
}
void pmp_enc_temps(uint8_t *d, int8_t inlet, int8_t pfc, int8_t llc, int8_t xfmr, uint16_t f1_10rpm, uint16_t f2_10rpm) {
  d[0]=(uint8_t)inlet; d[1]=(uint8_t)pfc; d[2]=(uint8_t)llc; d[3]=(uint8_t)xfmr;
  put_u16(d + 4, f1_10rpm); put_u16(d + 6, f2_10rpm);
}
void pmp_enc_bus(uint8_t *d, uint16_t vbp_10, uint16_t vbn_10, uint16_t va_10, uint16_t vb_10) {
  put_u16(d, vbp_10); put_u16(d + 2, vbn_10); put_u16(d + 4, va_10); put_u16(d + 6, vb_10);
}
/* E66 GROUP_SET 0x12 (8 bytes LE): u16 V_set 0.1 V · u16 I_req 0.1 A · u16 member bitmap · u8 base address · u8 reserved */
void pmp_enc_group_set(uint8_t *d, const pmp_group_set_t *g) {
  put_u16(d, g->v_set_dv); put_u16(d + 2, g->i_req_da); put_u16(d + 4, g->members); d[6] = g->base; d[7] = 0;
}
bool pmp_dec_group_set(const uint8_t *d, uint8_t dlc, pmp_group_set_t *g) {
  if (dlc != 8 || !d || !g) return false;
  g->v_set_dv = get_u16(d); g->i_req_da = get_u16(d + 2); g->members = get_u16(d + 4); g->base = d[6];
  return g->v_set_dv <= 10000u && d[7] == 0;                            /* ≤1000 V, reserved byte must be zero */
}
