/* frame.h — the CAN frame and the byte-level rules every protocol profile shares: little-endian packing, saturating
 * float → integer conversion (casting a NaN or out-of-range float to an integer type is undefined behaviour in C, so every
 * encoder goes through these), CRC-8/AUTOSAR, and a bounded, priority-aware transmit queue. */
#ifndef PMP_FRAME_H
#define PMP_FRAME_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct { uint32_t id; uint8_t dlc; uint8_t data[8]; } pmp_frame_t;   /* 29-bit extended identifiers only */

static inline void pmp_put16(uint8_t *b, uint16_t v) { b[0] = (uint8_t)v; b[1] = (uint8_t)(v >> 8); }
static inline void pmp_put32(uint8_t *b, uint32_t v) {
  b[0] = (uint8_t)v; b[1] = (uint8_t)(v >> 8); b[2] = (uint8_t)(v >> 16); b[3] = (uint8_t)(v >> 24);
}
static inline uint16_t pmp_get16(const uint8_t *b) { return (uint16_t)(b[0] | (b[1] << 8)); }
static inline uint32_t pmp_get32(const uint8_t *b) {
  return (uint32_t)b[0] | ((uint32_t)b[1] << 8) | ((uint32_t)b[2] << 16) | ((uint32_t)b[3] << 24);
}

/* round(x / lsb), saturated to the type; NaN → 0 (i8: NaN → INT8_MIN, the "not fitted" code) */
uint16_t pmp_sat_u16(float x, float lsb);
int16_t pmp_sat_i16(float x, float lsb);
uint8_t pmp_sat_u8(float x, float lsb);
int8_t pmp_sat_i8(float x, float lsb);

/* CRC-8/AUTOSAR (poly 0x2F, init 0xFF, xorout 0xFF, no reflection; check "123456789" = 0xDF) */
uint8_t pmp_crc8(const uint8_t *p, size_t n);
/* the frame CRC: over the 29-bit identifier (4 bytes, little-endian) then n data bytes — a frame that reaches the wrong
   function or address fails it as surely as a corrupted payload */
uint8_t pmp_crc8_frame(uint32_t id, const uint8_t *d, uint8_t n);

#define PMP_TXQ_LEN 32u
typedef struct { pmp_frame_t q[PMP_TXQ_LEN]; uint8_t n; uint32_t dropped; } pmp_txq_t;
/* full queue: the newest frame of the lowest priority is evicted if the new frame outranks it, else the new frame is dropped
   (commands, acknowledgements and fault events survive a telemetry backlog); either way the drop is counted */
bool pmp_txq_push(pmp_txq_t *q, const pmp_frame_t *f);
/* lowest identifier first — the order bus arbitration would grant — and FIFO among equal identifiers */
bool pmp_txq_pop(pmp_txq_t *q, pmp_frame_t *f);
#endif
