/* svc.h — E80 the VMP service space (identifier bit 24 = 1): firmware update and boot control. Portable C99, sans-IO. The
 * state machine runs in the BOOTLOADER only (svc_init / svc_rx are called from port/gd32g553/boot_main.c and nowhere else);
 * the host supplies information, flash and verification through svc_port_* (link-time, like hal/nvm.h).
 * E82 (G-10): the E80 sentence here claimed the application ran SELECT / INFO / ENTER / RESET and that the space was
 * "reachable in every protocol profile" — neither was true. The way INTO the bootloader is a sealed HANDOFF_ENTER: the VMP
 * ENTER_BOOT action on the native profile, or both panel buttons held for 3 s inside the first 10 s after power-up on any
 * profile (hal/app.c panel()) — the only route a TonHe-profile module has.
 *
 * Identifier: priority 6 · native 1 · space 1 · function · destination · source (docs/can-protocol.md §10). A tool (source
 * 0x01–0x0F) broadcasts every request (destination 0xFF): it SELECTs one module by UID, and only the selected module acts on
 * what follows. Selecting another UID deselects the rest — one tool at a time.
 *   tool → module                                          module → tool (destination = the tool)
 *   0x01 SELECT  uid u32 (0xFFFFFFFF deselects all)        0x41 SELECT_RSP  uid u32 · mode u8 · confirmed slot u8 · state u8 ·
 *                                                                           flags u8 (bit 0: a transfer is open)
 *   0x02 INFO    item u8                                   0x42 INFO_RSP    item u8 · 0 · 0 · 0 · value u32
 *   0x03 ENTER   key "BOOT" u32                            0x50 ACK         function u8 · status u8 · arg u16 · value u32
 *   0x04 BEGIN   size u32 · slot u8                        (a finished block is acknowledged with function DATA)
 *   0x05 BLOCK   index u16 · length u16 · CRC-32 u32
 *   0x06 DATA    sequence u8 · 1–7 bytes
 *   0x07 FINISH  image CRC-32 u32
 *   0x08 RESET   key "RBT!" u32
 *   0x09 ABORT
 * A block is SVC_BLOCK bytes, the last one shorter, carried in DATA frames numbered from 0. The module acknowledges a block once
 * it is programmed and read back; a block sent again with identical content is acknowledged again (a lost acknowledgement
 * costs a resend, never a restart). FINISH checks the whole-image CRC-32, then the header, key, signature and body hash
 * (image.h), and only then puts the slot on trial (bootctl.h). The slot being run or confirmed is never erased. */
#ifndef PMP_SVC_H
#define PMP_SVC_H
#include "../proto/frame.h"

#define SVC_BLOCK      1024u
#define SVC_IDLE_MS    10000u           /* an open transfer with no frame for this long is abandoned */
#define SVC_SLOT_NONE  0xFFu
#define SVC_KEY_ENTER  0x544F4F42u      /* "BOOT" */
#define SVC_KEY_RESET  0x21544252u      /* "RBT!" */

enum { SVC_F_SELECT = 0x01, SVC_F_INFO = 0x02, SVC_F_ENTER = 0x03, SVC_F_BEGIN = 0x04, SVC_F_BLOCK = 0x05, SVC_F_DATA = 0x06,
       SVC_F_FINISH = 0x07, SVC_F_RESET = 0x08, SVC_F_ABORT = 0x09,
       SVC_F_SELECT_RSP = 0x41, SVC_F_INFO_RSP = 0x42, SVC_F_ACK = 0x50 };

/* status — the VMP 2.0 codes, plus two of the service space */
enum { SVC_OK = 0, SVC_E_UNSUPPORTED_FUNCTION = 2, SVC_E_UNSUPPORTED_ITEM = 3, SVC_E_LENGTH = 4, SVC_E_CRC = 5, SVC_E_RANGE = 6,
       SVC_E_STATE = 7, SVC_E_KEY = 13, SVC_E_SEQUENCE = 14, SVC_E_FLASH = 16, SVC_E_VERIFY = 17 };

/* INFO items */
enum { SVC_I_BOOT_VER = 0, SVC_I_VER_A = 1, SVC_I_VER_B = 2, SVC_I_BASELINE = 3, SVC_I_SLOT_CAP = 4, SVC_I_BLOCK = 5,
       SVC_I_HW_ID = 6, SVC_I_KEY_ID = 7, SVC_I_CONFIRMED = 8, SVC_I_STATE = 9, SVC_I_MODE = 10, SVC_I_LAST_REASON = 11,
       SVC_I_PRODUCT = 12, SVC_I_RUNNING = 13 };
enum { SVC_MODE_APP = 0, SVC_MODE_UPDATE = 1, SVC_MODE_SAFE = 2 };

typedef struct {
  bool boot;                  /* the bootloader (every function) or the application */
  void *ctx;                  /* handed to the port hooks */
  uint32_t uid;
  uint8_t src;                /* source address on responses: the module address, or 0xFE */
  bool sel;
  uint8_t slot;               /* the slot being written, SVC_SLOT_NONE outside a transfer */
  uint32_t size, t_act;
  uint16_t next, blk, blk_len, got;   /* next block expected · the block in progress, its length, bytes received */
  uint32_t blk_crc;
  uint8_t seq; bool in_blk;
  uint16_t reason;            /* the last FINISH outcome (IMG_E_* or 0x100 + an image CRC mismatch) */
  bool enter_req, reset_req;  /* for the host: act once the acknowledgement has left */
  uint8_t buf[SVC_BLOCK];
} svc_t;

void svc_init(svc_t *s, bool boot, void *ctx, uint32_t uid, uint8_t src);
void svc_rx(svc_t *s, const pmp_frame_t *f, uint32_t now_ms, pmp_txq_t *tx);
void svc_tick(svc_t *s, uint32_t now_ms);
static inline bool svc_frame(const pmp_frame_t *f) { return ((f->id >> 24) & 3u) == 3u; }   /* native marker and service space */

/* supplied by the host */
bool svc_port_info(void *ctx, uint8_t item, uint32_t *value);
bool svc_port_may_stop(void *ctx);                                                        /* not delivering power */
uint8_t svc_port_begin(void *ctx, uint8_t slot, uint32_t size);                           /* erase the slot for size bytes */
uint8_t svc_port_write(void *ctx, uint8_t slot, uint32_t off, const uint8_t *p, uint32_t n);   /* program and read back */
uint8_t svc_port_finish(void *ctx, uint8_t slot, uint32_t size, uint32_t crc, uint16_t *reason);
#endif
