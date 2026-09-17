/* image.c — see image.h. */
#include "image.h"
#include "p256.h"
#include "sha256.h"
#include <string.h>

static uint32_t rd32(const uint8_t *b) { return (uint32_t)b[0] | ((uint32_t)b[1] << 8) | ((uint32_t)b[2] << 16) | ((uint32_t)b[3] << 24); }
static uint16_t rd16(const uint8_t *b) { return (uint16_t)(b[0] | (b[1] << 8)); }

int img_verify(const uint8_t *img, uint32_t cap, uint32_t slot_base, uint32_t hw_id, uint32_t min_version,
               const img_key_t *keys, uint32_t n_keys, img_info_t *info, void (*poll)(void)) {
  memset(info, 0, sizeof *info);
  if (cap < IMG_HDR_LEN) return IMG_E_SIZE;
  if (rd32(img) != IMG_MAGIC || rd16(img + 4) != IMG_HDR_VER || rd16(img + 6) != IMG_HDR_LEN) return IMG_E_HEADER;
  info->size = rd32(img + 0x08); info->load = rd32(img + 0x0C); info->version = rd32(img + 0x10);
  info->min_version = rd32(img + 0x14); info->hw = rd32(img + 0x18); info->key_id = rd32(img + 0x1C);
  if (info->size < 0x40u || info->size > cap - IMG_HDR_LEN) return IMG_E_SIZE;   /* at least the core vector table */
  if (info->load != slot_base + IMG_HDR_LEN) return IMG_E_LOAD;
  if ((info->hw & hw_id) == 0u) return IMG_E_HW;
  if (info->version < min_version || info->min_version > info->version) return IMG_E_VERSION;
  const img_key_t *key = NULL;
  for (uint32_t k = 0u; k < n_keys; k++) if (keys[k].id == info->key_id) { key = &keys[k]; break; }
  if (key == NULL) return IMG_E_KEY;
  uint8_t h[32];
  sha256(img, 0x40u, h);
  if (poll) poll();
  /* The signature check is ≈ 12.9 M instructions ≈ 90–105 ms at 216 MHz (measured on the -Os build under a Cortex-M33
     emulator) — four TPS3430 windows. It is serviced from INSIDE the ladder: with WDO on NRST an unserviced
     verification resets the part during every boot, for ever. */
  if (!p256_verify_poll(key->xy, h, img + 0x40, poll)) return IMG_E_SIGNATURE;
  if (poll) poll();
  sha256_t s;
  sha256_init(&s);
  for (uint32_t off = 0u; off < info->size; off += 0x1000u) {         /* 4 KB pieces (≈ 1.6 ms each), a kick between them */
    uint32_t n = info->size - off < 0x1000u ? info->size - off : 0x1000u;
    sha256_update(&s, img + IMG_HDR_LEN + off, n);
    if (poll) poll();
  }
  sha256_final(&s, h);
  if (memcmp(h, img + 0x20, sizeof h) != 0) return IMG_E_HASH;
  return IMG_OK;
}
