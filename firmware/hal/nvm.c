/* nvm.c — see nvm.h. */
#include "nvm.h"
#include <string.h>

/* The flash programs, and carries ECC over, 64-bit rows, and refuses a row that is not erased (GD32G553 UM
 * §2.3.8 / FMC_STAT PGERR). Every offset this file hands the port must therefore start a fresh row: a 16-byte header and
 * entries padded to a multiple of 8 keep the CRC — the commit marker — alone in the last row of its entry, programmed
 * after the payload. A 12-byte header would put the first entry in the header's own upper half and nothing would store. */
#define HDR_LEN   16u
#define NVM_MAGIC 0x314D564Eu   /* "NVM1" */
#define ENTRY_MAX ((8u + NVM_MAX_LEN + 4u + 7u) & ~7u)

static void put32(uint8_t *b, uint32_t v) { b[0] = (uint8_t)v; b[1] = (uint8_t)(v >> 8); b[2] = (uint8_t)(v >> 16); b[3] = (uint8_t)(v >> 24); }
static uint32_t get32(const uint8_t *b) { return (uint32_t)b[0] | ((uint32_t)b[1] << 8) | ((uint32_t)b[2] << 16) | ((uint32_t)b[3] << 24); }
static uint32_t entry_len(uint32_t len) { return (8u + ((len + 3u) & ~3u) + 4u + 7u) & ~7u; }

uint32_t pmp_crc32(const uint8_t *p, size_t n) {
  uint32_t c = 0xFFFFFFFFu;
  while (n--) { c ^= *p++; for (int k = 0; k < 8; k++) c = (c >> 1) ^ (0xEDB88320u & (0u - (c & 1u))); }
  return ~c;
}

static bool read_hdr(uint8_t page, uint32_t *seq) {
  uint8_t h[HDR_LEN];
  if (!nvm_port_read(page, 0u, h, HDR_LEN) || get32(h) != NVM_MAGIC || get32(h + 8) != pmp_crc32(h, 8u)) return false;
  *seq = get32(h + 4);
  return true;
}

static bool write_hdr(uint8_t page, uint32_t seq) {
  uint8_t h[HDR_LEN], chk[HDR_LEN];
  memset(h, 0xFF, sizeof h);                       /* the tail of the second row is pad, not stack */
  put32(h, NVM_MAGIC); put32(h + 4, seq); put32(h + 8, pmp_crc32(h, 8u));
  return nvm_port_prog(page, 0u, h, HDR_LEN) && nvm_port_read(page, 0u, chk, HDR_LEN) && memcmp(h, chk, HDR_LEN) == 0;
}

/* programs one entry and reads it back */
static bool append(uint8_t page, uint32_t off, uint8_t kind, const uint8_t *buf, uint8_t len, uint32_t seq) {
  uint8_t e[ENTRY_MAX], chk[ENTRY_MAX];
  uint32_t n = 8u + len;
  e[0] = kind; e[1] = len; e[2] = 0x5Au; e[3] = 0xA5u; put32(e + 4, seq);
  memcpy(e + 8, buf, len);
  uint32_t crc = pmp_crc32(e, n);
  while (n + 4u < entry_len(len)) e[n++] = 0xFFu;   /* pad so the CRC lands at tot − 4, alone in the last row */
  put32(e + n, crc); n += 4u;
  return nvm_port_prog(page, off, e, n) && nvm_port_read(page, off, chk, n) && memcmp(e, chk, n) == 0;
}

/* the entry at off: its total length · 0 at the erased end · UINT32_MAX when torn, damaged or out of room */
static uint32_t read_entry(const nvm_t *s, uint8_t page, uint32_t off, uint8_t *kind, uint8_t *len, uint32_t *seq, uint8_t *payload) {
  uint8_t e[ENTRY_MAX];
  if (off + 12u > s->page_size || !nvm_port_read(page, off, e, 8u)) return UINT32_MAX;
  if (e[0] == 0xFFu && e[1] == 0xFFu && e[2] == 0xFFu && e[3] == 0xFFu) return 0u;
  if (e[0] >= NVM_KINDS || e[1] > NVM_MAX_LEN || e[2] != 0x5Au || e[3] != 0xA5u) return UINT32_MAX;
  uint32_t tot = entry_len(e[1]);
  if (off + tot > s->page_size || !nvm_port_read(page, off + 8u, e + 8, tot - 8u)) return UINT32_MAX;
  if (get32(e + tot - 4u) != pmp_crc32(e, 8u + e[1])) return UINT32_MAX;
  *kind = e[0]; *len = e[1]; *seq = get32(e + 4);
  if (payload) memcpy(payload, e + 8, e[1]);
  return tot;
}

static uint8_t pg(const nvm_t *s, uint8_t k) { return (uint8_t)(s->base + k); }

static void set_rec(nvm_t *s, uint8_t kind, uint32_t off, uint32_t seq, uint32_t pcrc, uint8_t len) {
  s->rec[kind].off = off; s->rec[kind].seq = seq; s->rec[kind].pcrc = pcrc; s->rec[kind].len = len; s->rec[kind].have = true;
}

void nvm_mount(nvm_t *s, uint8_t base, uint32_t page_size) {
  memset(s, 0, sizeof *s);
  s->base = base;
  s->page_size = page_size;
  uint32_t q0 = 0u, q1 = 0u;
  bool v0 = read_hdr(pg(s, 0u), &q0), v1 = read_hdr(pg(s, 1u), &q1);
  if (!v0 && !v1) {                                  /* blank (first boot) or both headers damaged: a fresh store */
    s->page_seq = 1u; s->wr = HDR_LEN;
    s->full = !(nvm_port_erase(pg(s, 0u)) && write_hdr(pg(s, 0u), 1u));
    return;
  }
  s->active = (v0 && (!v1 || q0 >= q1)) ? 0u : 1u;    /* both valid = a cut after the commit, before the old erase */
  s->page_seq = s->active ? q1 : q0;
  uint32_t off = HDR_LEN;
  uint8_t buf[NVM_MAX_LEN];
  for (;;) {
    uint8_t kind = 0u, len = 0u; uint32_t seq = 0u;
    uint32_t tot = read_entry(s, pg(s, s->active), off, &kind, &len, &seq, buf);
    if (tot == 0u) break;
    if (tot == UINT32_MAX) { s->full = true; break; }
    set_rec(s, kind, off, seq, pmp_crc32(buf, len), len);
    if (seq > s->seq) s->seq = seq;
    off += tot;
  }
  s->wr = off;
}

bool nvm_get(nvm_t *s, uint8_t kind, uint8_t *buf, uint8_t len) {
  if (kind >= NVM_KINDS || !s->rec[kind].have || s->rec[kind].len != len) return false;
  uint8_t k = 0u, l = 0u; uint32_t q = 0u;
  uint32_t t = read_entry(s, pg(s, s->active), s->rec[kind].off, &k, &l, &q, buf);
  return t != 0u && t != UINT32_MAX && k == kind && l == len;
}

static bool compact(nvm_t *s, uint8_t kind, const uint8_t *buf, uint8_t len) {
  uint8_t dst = (uint8_t)(1u - s->active), tmp[NVM_MAX_LEN];
  if (!nvm_port_erase(pg(s, dst))) return false;
  nvm_t n = *s;
  uint32_t off = HDR_LEN;
  for (uint8_t k = 0u; k < NVM_KINDS; k++) {
    n.rec[k].have = false;
    if (k == kind || !s->rec[k].have) continue;
    uint8_t kk = 0u, ll = 0u; uint32_t q = 0u;
    uint32_t t = read_entry(s, pg(s, s->active), s->rec[k].off, &kk, &ll, &q, tmp);
    if (t == 0u || t == UINT32_MAX || kk != k) continue;             /* unreadable now: dropped, never copied torn */
    if (off + t > s->page_size || !append(pg(s, dst), off, k, tmp, ll, q)) return false;
    set_rec(&n, k, off, q, s->rec[k].pcrc, ll);
    off += t;
  }
  uint32_t tot = entry_len(len);
  if (off + tot > s->page_size || !append(pg(s, dst), off, kind, buf, len, s->seq + 1u) || !write_hdr(pg(s, dst), s->page_seq + 1u)) return false;
  set_rec(&n, kind, off, s->seq + 1u, pmp_crc32(buf, len), len);
  (void)nvm_port_erase(pg(s, s->active));   /* a failure here is harmless: the higher generation wins at every mount */
  n.active = dst; n.page_seq = s->page_seq + 1u; n.seq = s->seq + 1u; n.wr = off + tot; n.full = false;
  *s = n;
  return true;
}

bool nvm_put(nvm_t *s, uint8_t kind, const uint8_t *buf, uint8_t len, bool may_erase) {
  if (kind >= NVM_KINDS || len > NVM_MAX_LEN) return false;
  uint32_t pc = pmp_crc32(buf, len), tot = entry_len(len);
  if (s->rec[kind].have && s->rec[kind].len == len && s->rec[kind].pcrc == pc) return true;
  if (!s->full && s->wr + tot <= s->page_size) {
    if (append(pg(s, s->active), s->wr, kind, buf, len, s->seq + 1u)) {
      set_rec(s, kind, s->wr, s->seq + 1u, pc, len);
      s->seq++; s->wr += tot;
      return true;
    }
    s->full = true;   /* a failed program or read-back: nothing more lands behind it */
  }
  return may_erase && compact(s, kind, buf, len);
}
