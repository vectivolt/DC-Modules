/* frame.c — see frame.h. */
#include "frame.h"
#include <math.h>

static float rnd(float x, float lsb) { return (float)floor((double)(x / lsb) + 0.5); }

uint16_t pmp_sat_u16(float x, float lsb) {
  if (!isfinite(x) && !isinf(x)) return 0u;
  float y = rnd(x, lsb);
  return y <= 0.0f ? 0u : (y >= 65535.0f ? 65535u : (uint16_t)y);
}
int16_t pmp_sat_i16(float x, float lsb) {
  if (isnan(x)) return 0;
  float y = rnd(x, lsb);
  return y <= -32768.0f ? INT16_MIN : (y >= 32767.0f ? INT16_MAX : (int16_t)y);
}
uint8_t pmp_sat_u8(float x, float lsb) {
  if (isnan(x)) return 0u;
  float y = rnd(x, lsb);
  return y <= 0.0f ? 0u : (y >= 255.0f ? 255u : (uint8_t)y);
}
int8_t pmp_sat_i8(float x, float lsb) {
  if (isnan(x)) return INT8_MIN;
  float y = rnd(x, lsb);
  return y <= -127.0f ? -127 : (y >= 127.0f ? 127 : (int8_t)y);   /* −128 stays reserved for "not fitted" */
}

static uint8_t crc8_run(uint8_t crc, const uint8_t *p, size_t n) {
  while (n--) {
    crc ^= *p++;
    for (int k = 0; k < 8; k++) crc = (crc & 0x80u) ? (uint8_t)((crc << 1) ^ 0x2Fu) : (uint8_t)(crc << 1);
  }
  return crc;
}
uint8_t pmp_crc8(const uint8_t *p, size_t n) { return (uint8_t)(crc8_run(0xFFu, p, n) ^ 0xFFu); }
uint8_t pmp_crc8_frame(uint32_t id, const uint8_t *d, uint8_t n) {
  uint8_t idb[4];
  pmp_put32(idb, id & 0x1FFFFFFFu);
  return (uint8_t)(crc8_run(crc8_run(0xFFu, idb, 4u), d, n) ^ 0xFFu);
}

bool pmp_txq_push(pmp_txq_t *q, const pmp_frame_t *f) {
  if (q->n < PMP_TXQ_LEN) { q->q[q->n++] = *f; return true; }
  uint8_t worst = 0u;
  for (uint8_t k = 1u; k < q->n; k++) if (q->q[k].id >= q->q[worst].id) worst = k;
  q->dropped++;
  if (f->id >= q->q[worst].id) return false;
  for (uint8_t k = worst; k + 1u < q->n; k++) q->q[k] = q->q[k + 1u];
  q->q[q->n - 1u] = *f;
  return true;
}

bool pmp_txq_pop(pmp_txq_t *q, pmp_frame_t *f) {
  if (!q->n) return false;
  uint8_t best = 0u;
  for (uint8_t k = 1u; k < q->n; k++) if (q->q[k].id < q->q[best].id) best = k;
  *f = q->q[best];
  for (uint8_t k = best; k + 1u < q->n; k++) q->q[k] = q->q[k + 1u];
  q->n--;
  return true;
}
