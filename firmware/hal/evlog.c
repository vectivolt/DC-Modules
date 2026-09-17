/* evlog.c — see evlog.h. */
#include "evlog.h"
#include <string.h>

#define EVLOG_MAGIC 0x31475645u   /* "EVG1" */

static void put16(uint8_t *b, uint16_t v) { b[0] = (uint8_t)v; b[1] = (uint8_t)(v >> 8); }
static void put32(uint8_t *b, uint32_t v) { put16(b, (uint16_t)v); put16(b + 2, (uint16_t)(v >> 16)); }
static uint16_t get16(const uint8_t *b) { return (uint16_t)(b[0] | (b[1] << 8)); }
static uint32_t get32(const uint8_t *b) { return (uint32_t)get16(b) | ((uint32_t)get16(b + 2) << 16); }
static uint8_t pg(const evlog_t *l, uint8_t k) { return (uint8_t)(l->base + k); }

static uint32_t hdr_gen(const evlog_t *l, uint8_t k) {   /* 0 when the page has no valid header */
  uint8_t h[EVLOG_HDR];
  if (!nvm_port_read(pg(l, k), 0u, h, EVLOG_HDR) || get32(h) != EVLOG_MAGIC || get32(h + 8) != pmp_crc32(h, 8u)) return 0u;
  return get32(h + 4);
}

/* 1 valid · 0 erased · −1 torn or unreadable */
static int slot(const evlog_t *l, uint8_t k, uint16_t i, evlog_entry_t *e) {
  uint8_t b[EVLOG_ENTRY];
  if (!nvm_port_read(pg(l, k), EVLOG_HDR + (uint32_t)i * EVLOG_ENTRY, b, EVLOG_ENTRY)) return -1;
  uint8_t all = 0xFFu;
  for (unsigned j = 0u; j < EVLOG_ENTRY; j++) all &= b[j];
  if (all == 0xFFu) return 0;
  if (get16(b + 14) != (uint16_t)pmp_crc32(b, 14u)) return -1;
  e->seq = get32(b); e->t = get32(b + 4); e->boot = get16(b + 8); e->kind = b[10]; e->code = b[11]; e->arg = get16(b + 12);
  return 1;
}

void evlog_mount(evlog_t *l, uint8_t base, uint8_t pages, uint32_t page_size) {
  memset(l, 0, sizeof *l);
  l->base = base; l->pages = pages; l->per = (uint16_t)((page_size - EVLOG_HDR) / EVLOG_ENTRY);
  for (uint8_t k = 0u; k < pages; k++) { uint32_t g = hdr_gen(l, k); if (g > l->gen) { l->gen = g; l->head = k; } }
  if (l->gen == 0u) return;
  evlog_entry_t e, newest;
  bool have = false;
  for (uint16_t i = 0u; i < l->per; i++) {
    int r = slot(l, l->head, i, &e);
    if (r != 0) l->wr = (uint16_t)(i + 1u);
    if (r == 1) { newest = e; have = true; }
  }
  uint8_t prev = (uint8_t)((l->head + pages - 1u) % pages);
  if (!have && pages > 1u && hdr_gen(l, prev) == l->gen - 1u)   /* a ring that just moved: the newest is on the page before */
    for (uint16_t i = 0u; i < l->per; i++) if (slot(l, prev, i, &e) == 1) { newest = e; have = true; }
  if (have) { l->seq = newest.seq + 1u; l->boot = (uint16_t)(newest.boot + 1u); }
}

void evlog_add(evlog_t *l, uint8_t kind, uint8_t code, uint16_t arg, uint32_t t) {
  if (l->qn == EVLOG_Q) {
    memmove(l->q, l->q + 1, (EVLOG_Q - 1u) * sizeof l->q[0]);
    l->qn--;
    if (l->lost < 0xFFFFu) l->lost++;
    l->lost_total++;
  }
  evlog_entry_t *e = &l->q[l->qn++];
  e->seq = 0u; e->t = t; e->boot = l->boot; e->kind = kind; e->code = code; e->arg = arg;
}

static bool append(evlog_t *l, const evlog_entry_t *e, bool may_erase) {
  if (l->gen == 0u || l->wr >= l->per) {   /* format the first page, or move the ring on */
    if (!may_erase) return false;
    uint8_t k = (l->gen == 0u) ? 0u : (uint8_t)((l->head + 1u) % l->pages), h[EVLOG_HDR];
    memset(h, 0xFF, sizeof h);
    put32(h, EVLOG_MAGIC); put32(h + 4, l->gen + 1u); put32(h + 8, pmp_crc32(h, 8u));
    if (!nvm_port_erase(pg(l, k)) || !nvm_port_prog(pg(l, k), 0u, h, EVLOG_HDR) || hdr_gen(l, k) != l->gen + 1u) { l->io_err = true; return false; }
    l->head = k; l->gen++; l->wr = 0u;
  }
  uint8_t b[EVLOG_ENTRY], chk[EVLOG_ENTRY];
  put32(b, l->seq); put32(b + 4, e->t); put16(b + 8, e->boot); b[10] = e->kind; b[11] = e->code; put16(b + 12, e->arg);
  put16(b + 14, (uint16_t)pmp_crc32(b, 14u));
  uint32_t off = EVLOG_HDR + (uint32_t)l->wr * EVLOG_ENTRY;
  l->wr++;   /* a slot that fails is never programmed again */
  if (!nvm_port_prog(pg(l, l->head), off, b, EVLOG_ENTRY) || !nvm_port_read(pg(l, l->head), off, chk, EVLOG_ENTRY) ||
      memcmp(b, chk, EVLOG_ENTRY) != 0) { l->io_err = true; return false; }
  l->seq++;
  return true;
}

void evlog_flush(evlog_t *l, bool may_erase) {
  l->io_err = false;
  if (l->lost && l->qn) {
    evlog_entry_t e = { 0u, l->q[0].t, l->boot, (uint8_t)(EVLOG_LOST | (l->q[0].kind & EVLOG_KIND_UNIX)), 0u, l->lost };
    if (!append(l, &e, may_erase)) return;
    l->lost = 0u;
  }
  uint8_t done = 0u;
  while (done < l->qn && append(l, &l->q[done], may_erase)) done++;
  if (done) { memmove(l->q, l->q + done, (size_t)(l->qn - done) * sizeof l->q[0]); l->qn = (uint8_t)(l->qn - done); }
}

/* newest first: the head page from its write position down, then each page before it whose generation continues the chain */
static uint16_t scan(const evlog_t *l, int32_t age, evlog_entry_t *out, bool *found) {
  uint16_t n = 0u;
  *found = false;
  if (l->gen == 0u) return 0u;
  uint8_t k = l->head;
  uint32_t g = l->gen;
  for (uint8_t p = 0u; p < l->pages; p++) {
    if (p > 0u) { k = (uint8_t)((k + l->pages - 1u) % l->pages); if (--g == 0u || hdr_gen(l, k) != g) break; }
    for (uint16_t i = (p == 0u) ? l->wr : l->per; i-- > 0u;) {
      evlog_entry_t e;
      if (slot(l, k, i, &e) != 1) continue;
      if (age >= 0 && n == (uint16_t)age) { *out = e; *found = true; return n; }
      n++;
    }
  }
  return n;
}

uint16_t evlog_count(const evlog_t *l) { bool f; evlog_entry_t e; return scan(l, -1, &e, &f); }
bool evlog_read(const evlog_t *l, uint16_t age, evlog_entry_t *e) { bool f; (void)scan(l, (int32_t)age, e, &f); return f; }
