/* group.c — see group.h. */
#include "group.h"

static int own_bit(const pmp_group_set_t *m, uint8_t self) {
  return (self >= m->base && self < m->base + 16u) ? (int)(self - m->base) : -1;
}
static uint8_t popcount16(uint16_t v) { uint8_t n = 0; while (v) { n += v & 1u; v >>= 1; } return n; }

void pmp_group_init(pmp_group_t *g) { *g = (pmp_group_t){0}; }

void pmp_group_frame(pmp_group_t *g, const pmp_group_set_t *m, uint8_t self_addr, uint32_t now_ms) {
  int b = own_bit(m, self_addr);
  bool own = b >= 0 && (m->members >> b) & 1u;
  if (own && !(g->have && g->member)) g->t_member = now_ms;
  g->member = own; g->last = *m; g->t_frame = now_ms; g->have = true;
}

void pmp_group_step(pmp_group_t *g, uint8_t self_addr, uint32_t i_avail_da, uint32_t now_ms, pmp_group_out_t *out) {
  out->i_set_da = 0; out->deliver = false;
  if (!g->have || now_ms - g->t_frame > PMP_GRP_STALE_MS) { g->member = false; g->share_da = 0; g->raising = false; return; }
  uint8_t n = popcount16(g->last.members);
  uint32_t target = (g->member && n) ? g->last.i_req_da / n : 0;
  if (target > i_avail_da) target = i_avail_da;
  if (target <= g->share_da) { g->share_da = target; g->raising = false; }
  else {
    /* the hold must guard the TARGET IT GRANTS. Timestamping only the FIRST increase lets a second
       membership drop mid-hold inherit the stale timestamp and grant the larger share while a
       not-yet-stale peer still delivers its old one (group 225 A against a 150 A request for
       ~0.8 s, under every per-module limit). A grown pending target restarts the hold; an
       identical or smaller one never does, so a raise cannot be starved. */
    if (!g->raising) { g->raising = true; g->t_raise = now_ms; }
    else if (target > g->pend_da) g->t_raise = now_ms;
    g->pend_da = target;
    if (now_ms - g->t_raise >= PMP_GRP_HOLD_MS) { g->share_da = target; g->raising = false; }
  }
  int b = own_bit(&g->last, self_addr);
  uint8_t rank = (b > 0) ? popcount16((uint16_t)(g->last.members & ((1u << b) - 1u))) : 0;
  out->deliver = g->member && now_ms - g->t_member >= PMP_GRP_HOLD_MS + rank * PMP_GRP_STAGGER_MS;
  out->i_set_da = out->deliver ? g->share_da : 0;
}
