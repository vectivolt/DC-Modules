/* nvm.h — the power-cut-safe record store on two flash pages. Portable C99; the port supplies read / program / erase.
 *   entry     kind · length · marker · sequence · payload · CRC-32, appended to the active page. The newest valid entry of a kind
 *             wins. A torn entry (power cut while programming) fails its marker or CRC and is never trusted — nor is anything
 *             after it, and nothing more is appended behind it.
 *   compact   when the active page cannot take an entry: erase the other page, copy the newest entry of every kind, append the
 *             new one, and only then program the page header (the commit) and erase the old page. A power cut at any step
 *             leaves one complete generation: an uncommitted page has no valid header and loses to the old one.
 *   policy    a write of an unchanged payload does nothing; the caller decides whether an erase may run now (the app allows it
 *             only with the converter de-energized, firmware-architecture §9).
 *   layout    the header is 16 bytes and every entry is a multiple of 8, so no 64-bit flash row is ever written twice —
 *             ECC flash refuses a second program of a row, and a store that does it fails on its first record. A port
 *             whose program granularity is coarser than 8 bytes needs this file's HDR_LEN and entry_len raised to match. */
#ifndef PMP_NVM_H
#define PMP_NVM_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define NVM_KINDS    8u
#define NVM_MAX_LEN  200u

typedef struct { uint32_t off, seq, pcrc; uint8_t len; bool have; } nvm_rec_t;

typedef struct {
  uint8_t base;                /* this store's first port page — pages base and base + 1 (several stores share the hooks) */
  uint32_t page_size;          /* bytes per page, a multiple of 4 */
  uint8_t active;              /* page 0 or 1 */
  uint32_t page_seq;           /* generation of the active page */
  uint32_t wr;                 /* next free offset in the active page */
  uint32_t seq;                /* newest entry sequence */
  bool full;                   /* no append lands in the active page (no room, or a torn / unverified region) */
  nvm_rec_t rec[NVM_KINDS];
} nvm_t;

/* provided by the port: page = a store's base + 0 or 1, off within the page; false on a controller error */
bool nvm_port_read(uint8_t page, uint32_t off, uint8_t *p, uint32_t n);
bool nvm_port_prog(uint8_t page, uint32_t off, const uint8_t *p, uint32_t n);
bool nvm_port_erase(uint8_t page);

uint32_t pmp_crc32(const uint8_t *p, size_t n);   /* CRC-32/ISO-HDLC, check "123456789" = 0xCBF43926 */
uint32_t pmp_crc32_step(uint32_t c, const uint8_t *p, size_t n);   /* running state: seed 0xFFFFFFFF, finish with ~c */
/* pmp_crc32 in 4 KB pieces with poll() between them. The CRC is bit-serial (≈ 40 cycles a byte): a full 208 KB image slot is
   ≈ 38 ms at 216 MHz, past the TPS3430's 23.375 ms window when hashed in one call — the bootloader's FINISH and the
   application's start-up identity both hash a whole image. poll may be NULL. */
uint32_t pmp_crc32_polled(const uint8_t *p, size_t n, void (*poll)(void));
void nvm_mount(nvm_t *s, uint8_t base, uint32_t page_size);   /* formats the first page only when neither holds a valid header */
bool nvm_get(nvm_t *s, uint8_t kind, uint8_t *buf, uint8_t len);
/* true when the payload is stored (or already was); false when it is not — a write error, or a compaction is due and
   may_erase is false (retry later) */
bool nvm_put(nvm_t *s, uint8_t kind, const uint8_t *buf, uint8_t len, bool may_erase);
#endif
