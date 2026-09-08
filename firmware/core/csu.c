/* csu.c — see csu.h. Logic verified by firmware/test/host_sim.c (CSU section). */
#include "csu.h"

void pmp_csu_init(pmp_csu_t *c, uint32_t i_mod_cap_ma) {
  *c = (pmp_csu_t){0};
  c->i_mod_cap_ma = i_mod_cap_ma ? i_mod_cap_ma : 100000u;
}

void pmp_csu_hear(pmp_csu_t *c, uint8_t src, uint32_t now_ms) {
  for (uint8_t i = 0; i < PMP_CSU_MAXMOD; i++)
    if (c->used[i] && c->src[i] == src) { c->last_ms[i] = now_ms; return; }
  for (uint8_t i = 0; i < PMP_CSU_MAXMOD; i++)
    if (!c->used[i]) { c->used[i] = true; c->src[i] = src; c->last_ms[i] = now_ms; c->enabled[i] = false; return; }
}

void pmp_csu_estop(pmp_csu_t *c) { c->st = CSU_ESTOP; }

static bool alive_i(const pmp_csu_t *c, uint8_t i, uint32_t now) {
  return c->used[i] && (now - c->last_ms[i]) <= PMP_CSU_ALIVE_MS;
}

uint8_t pmp_csu_alive(const pmp_csu_t *c, uint32_t now) {
  uint8_t n = 0;
  for (uint8_t i = 0; i < PMP_CSU_MAXMOD; i++) if (alive_i(c, i, now)) n++;
  return n;
}

void pmp_csu_step(pmp_csu_t *c, uint32_t now, pmp_csu_out_t *out) {
  *out = (pmp_csu_out_t){ .enable_idx = -1, .i_set_ma = 0, .broadcast_estop = false };
  if (c->st == CSU_ESTOP) { out->broadcast_estop = true; return; }

  uint8_t alive = pmp_csu_alive(c, now);
  /* a silent module is disabled bookkeeping-wise so a comeback re-staggers, not slams on */
  for (uint8_t i = 0; i < PMP_CSU_MAXMOD; i++)
    if (c->enabled[i] && !alive_i(c, i, now)) c->enabled[i] = false;

  switch (c->st) {
  case CSU_WAIT:
    if (alive == 0) { c->t_state = now; break; }
    if (now - c->t_state >= PMP_CSU_SETTLE_MS) { c->st = CSU_START; c->t_state = now; c->t_last_en = 0; }
    break;
  case CSU_START:
  case CSU_RUN: {
    if (alive == 0) { c->st = CSU_WAIT; c->t_state = now; break; }
    /* equal share, capped per module — recomputed every step so dropouts re-share */
    uint32_t share = c->i_req_ma / alive;
    if (share > c->i_mod_cap_ma) share = c->i_mod_cap_ma;
    out->i_set_ma = share;
    /* stagger one enable at a time; also how a hot-added module joins during RUN */
    if (c->t_last_en == 0 || now - c->t_last_en >= PMP_CSU_STAGGER_MS) {
      for (uint8_t i = 0; i < PMP_CSU_MAXMOD; i++)
        if (alive_i(c, i, now) && !c->enabled[i]) {
          c->enabled[i] = true; c->t_last_en = now; out->enable_idx = (int)i; break;
        }
    }
    if (c->st == CSU_START) {
      bool all = true;
      for (uint8_t i = 0; i < PMP_CSU_MAXMOD; i++) if (alive_i(c, i, now) && !c->enabled[i]) all = false;
      if (all) { c->st = CSU_RUN; c->t_state = now; }
    }
    break;
  }
  default: break;
  }
}
