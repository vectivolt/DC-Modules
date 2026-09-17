/* evlog.h — the event log: fixed 16-byte entries in a ring over consecutive flash pages, through the same port hooks as
 * hal/nvm.h (pages base … base + pages − 1). Portable C99.
 *   page    a 16-byte header (magic, generation, CRC-32) then entries; the valid page with the highest generation is the head
 *   entry   sequence u32 · time u32 · boot u16 · kind u8 · code u8 · arg u16 · CRC-16 (low half of CRC-32 over the 14 bytes).
 *           Time is seconds since boot, or UNIX seconds when kind bit 7 is set (the VMP TIME_SYNC epoch).
 *   append  into the head page's next slot; a full head moves the ring on — erase the page after it, header with generation + 1,
 *           append there. The newest (pages − 1) to pages pages of entries are kept.
 *   torn    a slot neither erased nor valid (a power cut while programming) is skipped and never programmed again; a page
 *           whose header did not complete is not part of the chain
 *   queue   events wait in RAM until the owner flushes them (EVLOG_Q deep; beyond that the oldest is dropped, and the count of
 *           dropped events is logged ahead of the survivors). app.c flushes only while no power is delivered, moves the ring
 *           only with both stages stopped, and rate-limits what it logs, which bounds the wear.
 * Capacity with four pages: 189–252 entries at 1 KB, 381–508 at 2 KB. */
#ifndef PMP_EVLOG_H
#define PMP_EVLOG_H
#include "nvm.h"

#define EVLOG_Q          16u
#define EVLOG_HDR        16u
#define EVLOG_ENTRY      16u
#define EVLOG_KIND_UNIX  0x80u   /* kind bit 7: the time is UNIX seconds */
#define EVLOG_LOST       12u     /* the log's own kind: arg = events dropped from a full queue */

typedef struct { uint32_t seq, t; uint16_t boot; uint8_t kind, code; uint16_t arg; } evlog_entry_t;

typedef struct {
  uint8_t base, pages; uint16_t per;   /* first port page · page count · entries per page */
  uint8_t head; uint32_t gen;          /* the newest page and its generation (0 = nothing formatted yet) */
  uint16_t wr;                         /* the head page's next slot */
  uint32_t seq; uint16_t boot;         /* the next sequence number · this boot's number */
  evlog_entry_t q[EVLOG_Q]; uint8_t qn;
  uint16_t lost;                       /* dropped and not yet logged */
  uint32_t lost_total;
  bool io_err;                         /* the last flush met a program or erase failure */
} evlog_t;

void evlog_mount(evlog_t *l, uint8_t base, uint8_t pages, uint32_t page_size);
void evlog_add(evlog_t *l, uint8_t kind, uint8_t code, uint16_t arg, uint32_t t);
void evlog_flush(evlog_t *l, bool may_erase);   /* writes what it can; without may_erase it stops where an erase is needed */
uint16_t evlog_count(const evlog_t *l);
bool evlog_read(const evlog_t *l, uint16_t age, evlog_entry_t *e);   /* age 0 = the newest entry on flash */
#endif
