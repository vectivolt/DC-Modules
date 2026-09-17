/* image.h — E80 the signed application image. Portable C99.
 *
 * An image is IMG_HDR_LEN bytes of header in front of the application's vector table. It is written to slot A or slot B and
 * executes in place; each slot has its own link address, so a release carries one signed image per slot (the tool refuses a
 * body linked for the other slot).
 *   0x00 u32   magic "PMPI"
 *   0x04 u16   header version (1) · u16 header length (IMG_HDR_LEN)
 *   0x08 u32   body length — the bytes after the header: vector table, code, initialized data
 *   0x0C u32   load address — where the vector table sits: slot base + IMG_HDR_LEN
 *   0x10 u32   version — major << 24 | minor << 16 | patch << 8 | build (VMP object 0x0006)
 *   0x14 u32   minimum version — the security baseline this image sets once confirmed; nothing older installs or boots after it
 *   0x18 u32   hardware mask — bit k: the image runs on card hardware k (IMG_HW_UMOD_A = bit 0)
 *   0x1C u32   key id — the public key that signed it
 *   0x20 [32]  SHA-256 of the body
 *   0x40 [64]  ECDSA-P256 signature r ‖ s over SHA-256 of bytes 0x00–0x3F
 *   0x80 …     0xFF up to IMG_HDR_LEN — not signed, never read
 * Everything the bootloader acts on lies inside the 64 signed bytes, and the body hash binds the code to them.
 * Signing: firmware/tools/fw-sign.mjs. */
#ifndef PMP_IMAGE_H
#define PMP_IMAGE_H
#include <stdbool.h>
#include <stdint.h>

#define IMG_MAGIC     0x49504D50u   /* "PMPI" as little-endian bytes */
#define IMG_HDR_VER   1u
#define IMG_HDR_LEN   0x200u        /* the vector table lands on a 512-byte boundary (VTOR alignment) */
#define IMG_HW_UMOD_A (1u << 0)     /* the E40 module card, GD32G553VET7 */

typedef struct { uint32_t id; uint8_t xy[64]; } img_key_t;
typedef struct { uint32_t size, load, version, min_version, hw, key_id; } img_info_t;

enum { IMG_OK = 0, IMG_E_HEADER = 1, IMG_E_SIZE = 2, IMG_E_LOAD = 3, IMG_E_HW = 4, IMG_E_VERSION = 5, IMG_E_KEY = 6,
       IMG_E_SIGNATURE = 7, IMG_E_HASH = 8 };

/* img: the slot's first byte, readable for cap bytes (memory-mapped flash on the target) · slot_base: the slot's address ·
   hw_id: this card's IMG_HW_* bit · min_version: the baseline in force (0 to learn the version of whatever is there).
   Checks the header fields, then the key, the signature over the header, and the body hash — the cheap checks first.
   Returns IMG_OK or the first failure; info carries the header fields whenever the header parsed.
   poll (may be NULL) runs every 32 KB of body hashing: the target watchdog's kick lives there — a 208 KB body takes
   ~40 ms of SHA-256 at 216 MHz, past the TPS3430 fixed window's 23.375 ms late edge (E80/HR-02); the port's poll
   rate-limits itself above the 2.22 ms early edge. */
int img_verify(const uint8_t *img, uint32_t cap, uint32_t slot_base, uint32_t hw_id, uint32_t min_version,
               const img_key_t *keys, uint32_t n_keys, img_info_t *info, void (*poll)(void));
#endif
