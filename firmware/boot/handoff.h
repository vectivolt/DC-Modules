/* handoff.h — what the application and the bootloader leave each other across a reset: a small CRC-sealed record in no-init
 * RAM (FM_HANDOFF on the target). A power-on reset leaves garbage, which fails the seal and reads as "nothing left".
 *   reason     why the last software reset happened: an expected reboot, a service request, or a fault handler's reset
 *   streak     unexpected resets of a confirmed image in a row (the bootloader counts; the application clears it after 10 min)
 *   addr       the module's CAN source address for service-space responses (0xFE when it has none)
 *   bitrate    the bus bit rate in use, the bootloader's first candidate
 *   slot       the slot the bootloader started, for the application */
#ifndef PMP_HANDOFF_H
#define PMP_HANDOFF_H
#include "../hal/nvm.h"

#define HANDOFF_MAGIC 0x46464F48u   /* "HOFF" */
enum { HANDOFF_NONE = 0, HANDOFF_REBOOT = 1, HANDOFF_ENTER = 2, HANDOFF_FAULT = 3 };

typedef struct {
  uint32_t magic;
  uint8_t reason, streak, addr, slot;
  uint32_t bitrate;
  uint32_t crc;
} boot_handoff_t;

static inline void handoff_seal(boot_handoff_t *h) {
  h->magic = HANDOFF_MAGIC;
  h->crc = pmp_crc32((const uint8_t *)h, offsetof(boot_handoff_t, crc));
}
static inline bool handoff_valid(const boot_handoff_t *h) {
  return h->magic == HANDOFF_MAGIC && h->crc == pmp_crc32((const uint8_t *)h, offsetof(boot_handoff_t, crc));
}

/* The application's OWN no-init record (FM_HANDOFF_APP): a commanded discharge that must outlive a reset
 * (app.h disch_intent → disch_pending). Kept apart from boot_handoff_t so the bootloader's layout, seal and streak logic
 * never touch it — it survives a service round trip and a bootloader update alike. A power-on reset leaves garbage
 * that fails the seal and reads as "no discharge pending", which is right: the link is not being fed then either. */
#define APP_HANDOFF_MAGIC 0x48434944u   /* "DICH" */
typedef struct { uint32_t magic, disch, crc; } app_handoff_t;
static inline void app_handoff_seal(app_handoff_t *h) {
  h->magic = APP_HANDOFF_MAGIC;
  h->crc = pmp_crc32((const uint8_t *)h, offsetof(app_handoff_t, crc));
}
static inline bool app_handoff_valid(const app_handoff_t *h) {
  return h->magic == APP_HANDOFF_MAGIC && h->crc == pmp_crc32((const uint8_t *)h, offsetof(app_handoff_t, crc));
}
#endif
