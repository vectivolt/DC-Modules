/* svc.c — see svc.h. */
#include "svc.h"
#include "../hal/nvm.h"
#include <string.h>

static uint32_t rsp_id(uint8_t fn, uint8_t dst, uint8_t src) {
  return (6u << 26) | (1u << 25) | (1u << 24) | ((uint32_t)fn << 16) | ((uint32_t)dst << 8) | src;
}

static void emit(const svc_t *s, pmp_txq_t *tx, uint8_t fn, uint8_t dst, const uint8_t *d) {
  pmp_frame_t f;
  f.id = rsp_id(fn, dst, s->src); f.dlc = 8u;
  memcpy(f.data, d, 8u);
  (void)pmp_txq_push(tx, &f);
}

static void ack(const svc_t *s, pmp_txq_t *tx, uint8_t dst, uint8_t fn, uint8_t st, uint16_t arg, uint32_t val) {
  uint8_t d[8] = { fn, st, (uint8_t)arg, (uint8_t)(arg >> 8), 0u, 0u, 0u, 0u };
  pmp_put32(d + 4, val);
  emit(s, tx, SVC_F_ACK, dst, d);
}

static uint32_t info(const svc_t *s, uint8_t item) { uint32_t v = 0u; (void)svc_port_info(s->ctx, item, &v); return v; }

void svc_init(svc_t *s, bool boot, void *ctx, uint32_t uid, uint8_t src) {
  memset(s, 0, sizeof *s);
  s->boot = boot; s->ctx = ctx; s->uid = uid; s->src = src;
  s->slot = SVC_SLOT_NONE;
}

void svc_tick(svc_t *s, uint32_t now) {
  if (s->slot != SVC_SLOT_NONE && now - s->t_act > SVC_IDLE_MS) { s->slot = SVC_SLOT_NONE; s->in_blk = false; }
}

void svc_rx(svc_t *s, const pmp_frame_t *f, uint32_t now, pmp_txq_t *tx) {
  uint32_t id = f->id & 0x1FFFFFFFu;
  uint8_t fn = (uint8_t)(id >> 16), dst = (uint8_t)(id >> 8), src = (uint8_t)id;
  if (!svc_frame(f) || f->dlc > 8u || dst != 0xFFu || src < 0x01u || src > 0x0Fu || fn >= 0x40u) return;
  const uint8_t *d = f->data;

  if (fn == SVC_F_SELECT) {
    if (f->dlc < 4u) return;
    s->sel = pmp_get32(d) == s->uid && s->uid != 0xFFFFFFFFu;
    if (!s->sel) return;
    s->t_act = now;
    uint8_t r[8];
    pmp_put32(r, s->uid);
    r[4] = (uint8_t)info(s, SVC_I_MODE); r[5] = (uint8_t)info(s, SVC_I_CONFIRMED); r[6] = (uint8_t)info(s, SVC_I_STATE);
    r[7] = s->slot != SVC_SLOT_NONE ? 1u : 0u;
    emit(s, tx, SVC_F_SELECT_RSP, src, r);
    return;
  }
  if (!s->sel) return;
  s->t_act = now;

  switch (fn) {
  case SVC_F_INFO: {
    uint32_t v = 0u;
    if (f->dlc < 1u) { ack(s, tx, src, fn, SVC_E_LENGTH, f->dlc, 0u); return; }
    if (!svc_port_info(s->ctx, d[0], &v)) { ack(s, tx, src, fn, SVC_E_UNSUPPORTED_ITEM, d[0], 0u); return; }
    uint8_t r[8] = { d[0], 0u, 0u, 0u, 0u, 0u, 0u, 0u };
    pmp_put32(r + 4, v);
    emit(s, tx, SVC_F_INFO_RSP, src, r);
    return;
  }
  case SVC_F_ENTER:
  case SVC_F_RESET: {
    if (f->dlc < 4u) { ack(s, tx, src, fn, SVC_E_LENGTH, f->dlc, 0u); return; }
    uint8_t st = SVC_OK;
    if (pmp_get32(d) != (fn == SVC_F_ENTER ? SVC_KEY_ENTER : SVC_KEY_RESET)) st = SVC_E_KEY;
    else if (!s->boot && !svc_port_may_stop(s->ctx)) st = SVC_E_STATE;   /* never while the module delivers power */
    else if (fn == SVC_F_RESET) s->reset_req = true;
    else if (!s->boot) s->enter_req = true;                                /* the bootloader is already there */
    ack(s, tx, src, fn, st, 0u, 0u);
    return;
  }
  default: break;
  }

  if (!s->boot) {   /* the transfer functions belong to the bootloader: ENTER first */
    if (fn >= SVC_F_BEGIN && fn <= SVC_F_ABORT && fn != SVC_F_DATA) ack(s, tx, src, fn, SVC_E_STATE, 0u, 0u);
    else if (fn > SVC_F_ABORT) ack(s, tx, src, fn, SVC_E_UNSUPPORTED_FUNCTION, 0u, 0u);
    return;
  }

  switch (fn) {
  case SVC_F_BEGIN: {
    if (f->dlc < 5u) { ack(s, tx, src, fn, SVC_E_LENGTH, f->dlc, 0u); return; }
    uint32_t size = pmp_get32(d);
    s->slot = SVC_SLOT_NONE; s->in_blk = false; s->next = 0u;
    uint8_t st = (size == 0u) ? SVC_E_RANGE : svc_port_begin(s->ctx, d[4], size);
    if (st == SVC_OK) { s->slot = d[4]; s->size = size; }
    ack(s, tx, src, fn, st, d[4], size);
    return;
  }
  case SVC_F_BLOCK: {
    if (f->dlc < 8u) { ack(s, tx, src, fn, SVC_E_LENGTH, f->dlc, 0u); return; }
    uint16_t k = pmp_get16(d), len = pmp_get16(d + 2);
    uint32_t off = (uint32_t)k * SVC_BLOCK;
    uint8_t st = SVC_OK;
    s->in_blk = false;
    if (s->slot == SVC_SLOT_NONE) st = SVC_E_STATE;
    else if (k > s->next) st = SVC_E_SEQUENCE;
    else if (len == 0u || len > SVC_BLOCK || off + len > s->size || (len < SVC_BLOCK && off + len != s->size)) st = SVC_E_RANGE;
    else { s->blk = k; s->blk_len = len; s->blk_crc = pmp_get32(d + 4); s->got = 0u; s->seq = 0u; s->in_blk = true; }
    ack(s, tx, src, fn, st, k, len);
    return;
  }
  case SVC_F_DATA: {
    if (!s->in_blk) return;   /* the rest of a block already refused: its refusal has been sent */
    uint16_t n = (uint16_t)(f->dlc - 1u);
    if (f->dlc < 2u || d[0] != s->seq || s->got + n > s->blk_len) {
      s->in_blk = false;
      ack(s, tx, src, SVC_F_DATA, SVC_E_SEQUENCE, s->blk, s->got);
      return;
    }
    memcpy(s->buf + s->got, d + 1, n);
    s->got = (uint16_t)(s->got + n); s->seq++;
    if (s->got < s->blk_len) return;
    s->in_blk = false;
    uint8_t st = (pmp_crc32(s->buf, s->blk_len) != s->blk_crc)
                   ? SVC_E_CRC : svc_port_write(s->ctx, s->slot, (uint32_t)s->blk * SVC_BLOCK, s->buf, s->blk_len);
    if (st == SVC_OK && s->blk == s->next) s->next++;
    ack(s, tx, src, SVC_F_DATA, st, s->blk, s->blk_len);
    return;
  }
  case SVC_F_FINISH: {
    if (f->dlc < 4u) { ack(s, tx, src, fn, SVC_E_LENGTH, f->dlc, 0u); return; }
    uint8_t st;
    uint16_t reason = 0u;
    if (s->slot == SVC_SLOT_NONE || (uint32_t)s->next * SVC_BLOCK < s->size) st = SVC_E_STATE;
    else { st = svc_port_finish(s->ctx, s->slot, s->size, pmp_get32(d), &reason); s->reason = reason; s->slot = SVC_SLOT_NONE; }
    ack(s, tx, src, fn, st, reason, s->size);
    return;
  }
  case SVC_F_ABORT:
    s->slot = SVC_SLOT_NONE; s->in_blk = false;
    ack(s, tx, src, fn, SVC_OK, 0u, 0u);
    return;
  default:
    ack(s, tx, src, fn, SVC_E_UNSUPPORTED_FUNCTION, 0u, 0u);
    return;
  }
}
