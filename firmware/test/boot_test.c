/* boot_test.c — E80 verification of the bootloader's portable logic (firmware/boot).
 *   sha256    "abc", the empty message and lengths across the one- and two-block padding boundaries, one-shot and in uneven
 *             pieces, against node's OpenSSL (boot_vectors.h)
 *   p256      every generated vector: node- and BigInt-signed, high-s, mutated digests and signatures, r or s of 0, n or all
 *             ones, keys off the curve, outside the field or zero, Q = G, Q = -G, Q = 2G, e = n + 5, e = 2^256 - 1, e = n, e = 0
 *   image     the signed images accepted in their slot and refused in the other slot, for another card, below the baseline,
 *             under an unknown key or a foreign signature; a changed signed field, body-hash byte, signature byte or body byte;
 *             an oversize length and an erased slot; the unsigned reserved bytes do not matter
 *   bootctl   first boot, trial boots counted and stored, rollback, confirmation and the baseline, a pending image that no longer
 *             verifies, a corrupted confirmed image, the reset streak, a damaged record, a service request
 *   update    the service protocol and the updater on RAM flash with the real verification and record store: selection, INFO,
 *             BEGIN on the confirmed slot, blocks out of order or short, a dropped DATA frame, a corrupted block, a repeated
 *             block, FINISH early, with a wrong CRC and with a foreign signature, a good image end to end, its trial boot and
 *             confirmation, an abandoned transfer, a record store that fails
 * What this does not prove: the flash driver, the CAN driver and the jump on the MCU (EVT T-47).
 * Build/run: firmware/run_tests.sh */
#include "../boot/sha256.h"
#include "../boot/p256.h"
#include "../boot/image.h"
#include "../boot/bootctl.h"
#include "../boot/svc.h"
#include "../boot/updater.h"
#include "../port/gd32g553/flash_map.h"
#include "../boot/keys_dev.h"
#include "boot_vectors.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int checks = 0, fails = 0;
static void ck(const char *name, int cond) {
  checks++;
  if (!cond) { fails++; printf("FAIL %s\n", name); } else printf("PASS %s\n", name);
}

#define V(a, b, c, d) (((uint32_t)(a) << 24) | ((uint32_t)(b) << 16) | ((uint32_t)(c) << 8) | (uint32_t)(d))

/* ---------------------------------------------------------------- RAM flash: two slots and four record pages */
#define PG 1024u
static uint8_t slot_mem[2][FM_SLOT_SIZE];
static uint8_t page_mem[4][PG];
static bool store_dead = false;
static const uint32_t BASE[2] = { FM_SLOT_A, FM_SLOT_B };

static int slot_of(uint32_t addr, uint32_t n) {
  for (int k = 0; k < 2; k++) if (addr >= BASE[k] && addr - BASE[k] <= FM_SLOT_SIZE && n <= FM_SLOT_SIZE - (addr - BASE[k])) return k;
  printf("FAIL flash access outside the slots: 0x%08X + %u\n", addr, n);
  exit(1);
}
const uint8_t *boot_flash_map(uint32_t addr) { int k = slot_of(addr, 0u); return slot_mem[k] + (addr - BASE[k]); }
static long polls;
void boot_poll(void) { polls++; }
bool boot_flash_erase(uint32_t addr, uint32_t len) {
  int k = slot_of(addr, len);
  uint32_t lo = (addr - BASE[k]) / PG * PG, hi = (addr - BASE[k] + len + PG - 1u) / PG * PG;
  memset(slot_mem[k] + lo, 0xFF, (hi > FM_SLOT_SIZE ? FM_SLOT_SIZE : hi) - lo);
  return true;
}
bool boot_flash_prog(uint32_t addr, const uint8_t *p, uint32_t n) {
  int k = slot_of(addr, n);
  for (uint32_t i = 0; i < n; i++) slot_mem[k][addr - BASE[k] + i] &= p[i];
  return true;
}
bool nvm_port_read(uint8_t page, uint32_t off, uint8_t *p, uint32_t n) {
  if (page > 3u || off + n > PG) return false;
  memcpy(p, page_mem[page] + off, n);
  return true;
}
/* E82 (C-04): the record pages are the GD32G553 FMC — 64-bit rows with ECC, a second program of a row is refused
 * (UM §2.3.8, FMC_STAT PGERR), an all-FF write is bypassed and leaves the row erased (UM §2.3.2 note 6). The boot
 * record, the trial counter and the anti-rollback baseline all live in this store, so the bootloader's decisions are
 * only proved if the store behaves like the part. The packing is port/gd32g553/nvmport.c's, verbatim. */
static bool page_row[4][PG / 8u];
static long store_pgerr = 0;
bool nvm_port_prog(uint8_t page, uint32_t off, const uint8_t *p, uint32_t n) {
  if (page > 3u || off + n > PG || (off & 3u) || (n & 3u) || store_dead) return false;
  uint32_t a = off;
  while (n) {
    uint32_t lo = 0xFFFFFFFFu, hi = 0xFFFFFFFFu, base = a & ~7u;
    if (a & 4u) { for (int k = 0; k < 4; k++) hi = (hi & ~(0xFFu << (8 * k))) | ((uint32_t)p[k] << (8 * k)); }
    else {
      for (int k = 0; k < 4; k++) lo = (lo & ~(0xFFu << (8 * k))) | ((uint32_t)p[k] << (8 * k));
      if (n >= 8u) { hi = 0u; for (int k = 0; k < 4; k++) hi |= (uint32_t)p[4 + k] << (8 * k); }
    }
    uint32_t used = (a & 4u) ? 4u : (n >= 8u ? 8u : 4u);
    if (lo != 0xFFFFFFFFu || hi != 0xFFFFFFFFu) {
      if (page_row[page][base / 8u]) { store_pgerr++; return false; }
      for (int k = 0; k < 4; k++) page_mem[page][base + k] &= (uint8_t)(lo >> (8 * k));
      for (int k = 0; k < 4; k++) page_mem[page][base + 4 + k] &= (uint8_t)(hi >> (8 * k));
      page_row[page][base / 8u] = true;
    }
    a += used; p += used; n -= used;
  }
  return true;
}
bool nvm_port_erase(uint8_t page) {
  if (page > 3u || store_dead) return false;
  memset(page_mem[page], 0xFF, PG);
  memset(page_row[page], 0, sizeof page_row[page]);
  return true;
}

/* ---------------------------------------------------------------- SHA-256 · P-256 */
static void crypto_tests(void) {
  int ok = 1;
  size_t ns = sizeof BV_SHA / sizeof BV_SHA[0];
  for (size_t i = 0; i < ns; i++) {
    uint8_t d[32];
    sha256(BV_SHA[i].msg, BV_SHA[i].len, d);
    if (memcmp(d, BV_SHA[i].digest, 32)) { ok = 0; printf("      sha256 of %u bytes differs\n", BV_SHA[i].len); }
    sha256_t s;
    sha256_init(&s);
    for (uint32_t off = 0, step = 1; off < BV_SHA[i].len; off += step, step = step * 3u % 71u + 1u)
      sha256_update(&s, BV_SHA[i].msg + off, step < BV_SHA[i].len - off ? step : BV_SHA[i].len - off);
    sha256_final(&s, d);
    if (memcmp(d, BV_SHA[i].digest, 32)) { ok = 0; printf("      sha256 in pieces of %u bytes differs\n", BV_SHA[i].len); }
  }
  ck("sha256: \"abc\", the empty message and 1–1000 bytes across the padding boundaries match OpenSSL, one-shot and in uneven pieces",
     ok && ns == 12u);

  size_t ne = sizeof BV_ECDSA / sizeof BV_ECDSA[0];
  int bad = 0, pos = 0, neg = 0;
  for (size_t i = 0; i < ne; i++) {
    bool r = p256_verify(BV_ECDSA[i].pub, BV_ECDSA[i].hash, BV_ECDSA[i].sig);
    if (r != BV_ECDSA[i].ok) { bad++; printf("      p256 \"%s\": verify gave %d\n", BV_ECDSA[i].what, r); }
    if (BV_ECDSA[i].ok) pos++; else neg++;
  }
  printf("      p256: %d vectors accepted and %d refused as the references expect\n", pos, neg);
  ck("p256: every vector agrees with OpenSSL and the BigInt reference — valid, high-s, Q = ±G, Q = 2G, e ≥ n and e ≡ 0 accepted; mutated, out-of-range and bad-key vectors refused",
     bad == 0 && pos == 43 && neg == 29);
  ck("keys: the development key table is the key the vectors and test images were signed with",
     BOOT_N_KEYS == 1u && BOOT_KEYS[0].id == BV_KEY_ID && memcmp(BOOT_KEYS[0].xy, BV_PUB, 64) == 0);
}

/* ---------------------------------------------------------------- images */
static void put_img(int slot, int which) {
  memset(slot_mem[slot], 0xFF, FM_SLOT_SIZE);
  memcpy(slot_mem[slot], BV_IMG[which].img, BV_IMG[which].len);
}
static int check_slot(int slot, uint32_t baseline, img_info_t *inf) {
  return img_verify(slot_mem[slot], FM_SLOT_SIZE, BASE[slot], IMG_HW_UMOD_A, baseline, BOOT_KEYS, BOOT_N_KEYS, inf, boot_poll);
}

static void image_tests(void) {
  img_info_t inf;
  put_img(0, BV_A_V1); int a = check_slot(0, 0u, &inf);
  bool fields = inf.version == V(1, 0, 0, 1) && inf.min_version == V(1, 0, 0, 0) && inf.size == BV_IMG[BV_A_V1].len - IMG_HDR_LEN &&
                inf.load == FM_SLOT_A + IMG_HDR_LEN && inf.key_id == BV_KEY_ID;
  put_img(1, BV_A_V1); int other = check_slot(1, 0u, &inf);
  put_img(1, BV_B_V2); int b = check_slot(1, 0u, &inf);
  put_img(1, BV_B_HW2); int hw = check_slot(1, 0u, &inf);
  put_img(1, BV_B_FOREIGN); int foreign = check_slot(1, 0u, &inf);
  put_img(1, BV_B_UNKNOWN_KEY); int unknown = check_slot(1, 0u, &inf);
  put_img(0, BV_A_V09); int old0 = check_slot(0, 0u, &inf), old = check_slot(0, V(1, 1, 0, 0), &inf);
  ck("image: accepted in its own slot with its header fields; refused in the other slot (load address), for another card, under an unknown key, with a foreign signature, below the baseline",
     a == IMG_OK && fields && other == IMG_E_LOAD && b == IMG_OK && hw == IMG_E_HW && foreign == IMG_E_SIGNATURE && unknown == IMG_E_KEY &&
     old0 == IMG_OK && old == IMG_E_VERSION);

  int r[6];
  put_img(0, BV_A_V1); slot_mem[0][IMG_HDR_LEN + 300] ^= 0x01; r[0] = check_slot(0, 0u, &inf);   /* a body byte */
  put_img(0, BV_A_V1); slot_mem[0][0x14] ^= 0x01; r[1] = check_slot(0, 0u, &inf);                /* minimum 1.0.0.1: still passes the field checks */
  put_img(0, BV_A_V1); slot_mem[0][0x25] ^= 0x80; r[2] = check_slot(0, 0u, &inf);                /* the body hash */
  put_img(0, BV_A_V1); slot_mem[0][0x70] ^= 0x01; r[3] = check_slot(0, 0u, &inf);                /* the signature */
  put_img(0, BV_A_V1); slot_mem[0][0x100] = 0x00; r[4] = check_slot(0, 0u, &inf);                /* reserved, unsigned */
  put_img(0, BV_A_V1); slot_mem[0][0x0B] = 0x7F; r[5] = check_slot(0, 0u, &inf);                 /* a body length beyond the slot */
  memset(slot_mem[1], 0xFF, FM_SLOT_SIZE); int erased = check_slot(1, 0u, &inf);
  ck("image: a changed body byte fails the hash; a changed signed field, body-hash byte or signature byte fails the signature; reserved bytes do not matter; an oversize length and an erased slot are refused first",
     r[0] == IMG_E_HASH && r[1] == IMG_E_SIGNATURE && r[2] == IMG_E_SIGNATURE && r[3] == IMG_E_SIGNATURE && r[4] == IMG_OK &&
     r[5] == IMG_E_SIZE && erased == IMG_E_HEADER);
}

/* ---------------------------------------------------------------- the boot decision */
static void bootctl_tests(void) {
  bootctl_t c;
  boot_slots_t s = { { true, false }, { V(1, 0, 0, 1), 0u } };
  uint8_t streak = 0u;
  bootctl_default(&c);
  boot_plan_t p = boot_decide(&c, &s, false, &streak);
  bool first = p.mode == BOOT_RUN && p.slot == 0u && p.store && c.confirmed == 0u && c.state == BOOT_ST_CONFIRMED;
  p = boot_decide(&c, &s, false, &streak);
  ck("bootctl: a first boot confirms the only verified slot and stores it; the next boot runs it without a store",
     first && p.mode == BOOT_RUN && p.slot == 0u && !p.store);

  s.ok[1] = true; s.version[1] = V(1, 1, 0, 0);
  boot_install(&c, 1u);
  int trials = 0;
  for (unsigned k = 1u; k <= 3u; k++) {
    p = boot_decide(&c, &s, false, &streak);
    if (p.mode == BOOT_RUN && p.slot == 1u && p.store && c.tries == k && c.state == BOOT_ST_PENDING) trials++;
  }
  p = boot_decide(&c, &s, false, &streak);
  ck("bootctl: an installed slot gets three trial boots, each counted and stored before the jump; unconfirmed, the fourth boot rolls back",
     trials == 3 && p.mode == BOOT_RUN && p.slot == 0u && p.store && c.pending == BOOT_SLOT_NONE && c.state == BOOT_ST_ROLLED_BACK);

  boot_install(&c, 1u);
  p = boot_decide(&c, &s, false, &streak);
  bool conf = boot_confirm(&c, 1u, V(1, 1, 0, 0));
  p = boot_decide(&c, &s, false, &streak);
  bool twice = !boot_confirm(&c, 1u, V(1, 1, 0, 0));
  ck("bootctl: a trial image that confirms becomes the confirmed slot and raises the baseline; confirming again changes nothing",
     conf && c.confirmed == 1u && c.state == BOOT_ST_CONFIRMED && c.min_version == V(1, 1, 0, 0) && p.mode == BOOT_RUN && p.slot == 1u && !p.store && twice);

  s.ok[1] = false;   /* the confirmed image corrupts; slot A holds 1.0.0.1, below the 1.1 baseline */
  p = boot_decide(&c, &s, false, &streak);
  bool safe_base = p.mode == BOOT_SAFE;
  c.min_version = 0u;
  p = boot_decide(&c, &s, false, &streak);
  ck("bootctl: a confirmed image that no longer verifies falls back to the other slot (rolled back), unless that one is below the baseline (safe mode)",
     safe_base && p.mode == BOOT_RUN && p.slot == 0u && c.confirmed == 0u && c.state == BOOT_ST_ROLLED_BACK && p.store);

  bootctl_default(&c);
  s.ok[0] = s.ok[1] = true; s.version[0] = V(1, 0, 0, 1); s.version[1] = V(1, 1, 0, 0);
  p = boot_decide(&c, &s, false, &streak);
  bool newest = p.slot == 1u && c.confirmed == 1u;
  boot_install(&c, 0u); s.ok[0] = false;
  p = boot_decide(&c, &s, false, &streak);
  ck("bootctl: a first boot with two verified slots takes the newest; a pending slot that does not verify is dropped as failed and the confirmed slot runs",
     newest && p.mode == BOOT_RUN && p.slot == 1u && c.state == BOOT_ST_FAILED && c.pending == BOOT_SLOT_NONE);

  streak = 3u; p = boot_decide(&c, &s, false, &streak); bool safe = p.mode == BOOT_SAFE;
  streak = 2u; p = boot_decide(&c, &s, false, &streak); bool run2 = p.mode == BOOT_RUN;
  s.ok[0] = true; boot_install(&c, 0u); streak = 5u;
  p = boot_decide(&c, &s, false, &streak);
  ck("bootctl: three unexpected resets of the confirmed image in a row enter safe mode, two do not; a trial boot clears the streak",
     safe && run2 && p.mode == BOOT_RUN && p.slot == 0u && streak == 0u);

  c.confirmed = 7u;
  p = boot_decide(&c, &s, false, &streak);
  bool damaged = p.store && c.version == BOOTCTL_VERSION && c.confirmed == 1u;
  p = boot_decide(&c, &s, true, &streak);
  ck("bootctl: a record no writer produces is replaced by the default; a service request goes to the service loop", damaged && p.mode == BOOT_SERVICE);
}

/* ---------------------------------------------------------------- the update end to end */
static upd_t U;
static svc_t S;
static pmp_txq_t TX;
static uint32_t now_ms = 1000u;

static void new_updater(upd_t *u) {
  memset(u, 0, sizeof *u);
  u->base[0] = FM_SLOT_A; u->base[1] = FM_SLOT_B; u->cap = FM_SLOT_SIZE; u->hw_id = IMG_HW_UMOD_A; u->boot_ver = V(1, 0, 0, 0);
  u->keys = BOOT_KEYS; u->n_keys = BOOT_N_KEYS;
  upd_init(u, 2u, PG);
}
static void send(uint8_t fn, const uint8_t *d, uint8_t dlc) {
  pmp_frame_t f;
  f.id = (6u << 26) | (1u << 25) | (1u << 24) | ((uint32_t)fn << 16) | (0xFFu << 8) | 0x05u; f.dlc = dlc;
  memset(f.data, 0, 8u); memcpy(f.data, d, dlc);
  svc_rx(&S, &f, now_ms++, &TX);
}
static int ack_of(uint8_t fn, uint16_t *arg) {   /* the last acknowledgement for fn, −1 if none; drains the queue */
  pmp_frame_t f;
  int st = -1;
  while (pmp_txq_pop(&TX, &f))
    if (((f.id >> 16) & 0xFFu) == SVC_F_ACK && f.data[0] == fn) { st = f.data[1]; if (arg) *arg = pmp_get16(f.data + 2); }
  return st;
}
static int begin(uint8_t slot, uint32_t size) {
  uint8_t d[5]; pmp_put32(d, size); d[4] = slot;
  send(SVC_F_BEGIN, d, 5u);
  return ack_of(SVC_F_BEGIN, NULL);
}
static int block(const uint8_t *img, uint32_t size, uint16_t k, int drop, int corrupt) {
  uint32_t off = (uint32_t)k * SVC_BLOCK, len = size - off < SVC_BLOCK ? size - off : SVC_BLOCK;
  uint8_t d[8];
  pmp_put16(d, k); pmp_put16(d + 2, (uint16_t)len); pmp_put32(d + 4, pmp_crc32(img + off, len));
  send(SVC_F_BLOCK, d, 8u);
  int st = ack_of(SVC_F_BLOCK, NULL);
  if (st != SVC_OK) return 100 + st;
  int seq = 0;
  for (uint32_t i = 0; i < len; i += 7u, seq++) {
    uint8_t n = (uint8_t)(len - i < 7u ? len - i : 7u), fr[8];
    fr[0] = (uint8_t)seq; memcpy(fr + 1, img + off + i, n);
    if (corrupt >= 0 && (uint32_t)corrupt >= i && (uint32_t)corrupt < i + n) fr[1 + corrupt - (int)i] ^= 0x10;
    if (seq != drop) send(SVC_F_DATA, fr, (uint8_t)(n + 1u));
  }
  return ack_of(SVC_F_DATA, NULL);
}
static int send_image(const bv_img_t *m) {
  for (uint16_t k = 0; (uint32_t)k * SVC_BLOCK < m->len; k++) { int st = block(m->img, m->len, k, -1, -1); if (st != SVC_OK) return st; }
  return SVC_OK;
}
static int finish(uint32_t crc, uint16_t *reason) {
  uint8_t d[4]; pmp_put32(d, crc);
  send(SVC_F_FINISH, d, 4u);
  return ack_of(SVC_F_FINISH, reason);
}

static void update_tests(void) {
  memset(page_mem, 0xFF, sizeof page_mem);
  memset(page_row, 0, sizeof page_row);
  memset(slot_mem, 0xFF, sizeof slot_mem);
  memcpy(slot_mem[0], BV_IMG[BV_A_V1].img, BV_IMG[BV_A_V1].len);
  new_updater(&U);
  uint8_t streak = 0u;
  boot_plan_t p = upd_boot(&U, false, &streak);
  upd_t R; new_updater(&R);
  ck("update: a first boot runs the verified slot A and the stored record says so after a remount",
     p.mode == BOOT_RUN && p.slot == 0u && U.ctl.confirmed == 0u && R.ctl.confirmed == 0u);

  p = upd_boot(&U, true, &streak);
  svc_init(&S, true, &U, 0x12345678u, 0xFEu);
  uint8_t d[8];
  pmp_frame_t f;
  pmp_put32(d, 0x11111111u); send(SVC_F_SELECT, d, 4u);
  bool quiet = !pmp_txq_pop(&TX, &f);
  d[0] = SVC_I_VER_A; send(SVC_F_INFO, d, 1u);
  quiet = quiet && !pmp_txq_pop(&TX, &f);
  pmp_put32(d, 0x12345678u); send(SVC_F_SELECT, d, 4u);
  bool sel = pmp_txq_pop(&TX, &f) && ((f.id >> 16) & 0xFFu) == SVC_F_SELECT_RSP && pmp_get32(f.data) == 0x12345678u &&
             f.data[4] == SVC_MODE_UPDATE && f.data[5] == 0u && ((f.id >> 8) & 0xFFu) == 0x05u && (f.id & 0xFFu) == 0xFEu;
  d[0] = SVC_I_VER_A; send(SVC_F_INFO, d, 1u);
  bool info = pmp_txq_pop(&TX, &f) && ((f.id >> 16) & 0xFFu) == SVC_F_INFO_RSP && pmp_get32(f.data + 4) == V(1, 0, 0, 1);
  d[0] = 99u; send(SVC_F_INFO, d, 1u);
  int noinfo = ack_of(SVC_F_INFO, NULL);
  pmp_put32(d, SVC_KEY_ENTER); send(SVC_F_ENTER, d, 4u);
  int enter = ack_of(SVC_F_ENTER, NULL);
  ck("update: an unselected module stays silent; SELECT answers with the update mode and the confirmed slot; INFO reads the slot A version, refuses an unknown item; ENTER inside the bootloader is acknowledged and requests nothing",
     quiet && sel && info && noinfo == SVC_E_UNSUPPORTED_ITEM && enter == SVC_OK && !S.enter_req);

  const bv_img_t *big = &BV_IMG[BV_B_BIG];
  int onconf = begin(0u, big->len), opened = begin(1u, big->len);
  uint8_t bd[8];
  pmp_put16(bd, 1u); pmp_put16(bd + 2, 1024u); pmp_put32(bd + 4, 0u); send(SVC_F_BLOCK, bd, 8u);
  int ahead = ack_of(SVC_F_BLOCK, NULL);
  pmp_put16(bd, 0u); pmp_put16(bd + 2, 1000u); send(SVC_F_BLOCK, bd, 8u);
  int shortb = ack_of(SVC_F_BLOCK, NULL);
  int dropped = block(big->img, big->len, 0u, 5, -1), good0 = block(big->img, big->len, 0u, -1, -1);
  int crc1 = block(big->img, big->len, 1u, -1, 300), good1 = block(big->img, big->len, 1u, -1, -1);
  int again0 = block(big->img, big->len, 0u, -1, -1);
  ck("update: BEGIN on the confirmed slot is refused; a block ahead of sequence or a short block that is not the last is refused; a dropped DATA frame and a corrupted block are refused, then taken when sent again; an acknowledged block sent again is acknowledged",
     onconf == SVC_E_STATE && opened == SVC_OK && ahead == SVC_E_SEQUENCE && shortb == SVC_E_RANGE && dropped == SVC_E_SEQUENCE &&
     good0 == SVC_OK && crc1 == SVC_E_CRC && good1 == SVC_OK && again0 == SVC_OK && S.next == 2u);

  uint16_t reason = 0u;
  int early = finish(pmp_crc32(big->img, big->len), NULL);
  bool rest = block(big->img, big->len, 2u, -1, -1) == SVC_OK && block(big->img, big->len, 3u, -1, -1) == SVC_OK;
  int wrong = finish(0xDEADBEEFu, &reason);
  uint16_t why = reason;
  int closed = finish(pmp_crc32(big->img, big->len), NULL);
  ck("update: FINISH before the last block is refused; a wrong image CRC fails verification (0x100) and closes the transfer; the record is untouched",
     early == SVC_E_STATE && rest && wrong == SVC_E_VERIFY && why == 0x100u && closed == SVC_E_STATE && U.ctl.pending == BOOT_SLOT_NONE);

  const bv_img_t *fo = &BV_IMG[BV_B_FOREIGN];
  int fb = begin(1u, fo->len), fs = send_image(fo), ff = finish(pmp_crc32(fo->img, fo->len), &reason);
  ck("update: an image with a foreign signature transfers, FINISH refuses it (IMG_E_SIGNATURE) and the record is unchanged",
     fb == SVC_OK && fs == SVC_OK && ff == SVC_E_VERIFY && reason == IMG_E_SIGNATURE && U.ctl.pending == BOOT_SLOT_NONE && U.ctl.confirmed == 0u);

  int gb = begin(1u, big->len), gs = send_image(big), gf = finish(pmp_crc32(big->img, big->len), &reason);
  pmp_put32(d, 0u); send(SVC_F_RESET, d, 4u);
  int badkey = ack_of(SVC_F_RESET, NULL);
  pmp_put32(d, SVC_KEY_RESET); send(SVC_F_RESET, d, 4u);
  int rst = ack_of(SVC_F_RESET, NULL);
  new_updater(&R);
  ck("update: a good image end to end puts slot B on trial and stores it; RESET needs its key",
     gb == SVC_OK && gs == SVC_OK && gf == SVC_OK && U.ctl.pending == 1u && R.ctl.pending == 1u && badkey == SVC_E_KEY && rst == SVC_OK && S.reset_req);

  upd_t T; new_updater(&T);   /* the reset: a fresh bootloader */
  streak = 0u;
  p = upd_boot(&T, false, &streak);
  bool trial = p.mode == BOOT_RUN && p.slot == 1u && T.ctl.tries == 1u;
  bool conf = boot_confirm(&T.ctl, 1u, T.info[1].min_version) && upd_store(&T);
  new_updater(&R);
  ck("update: after the reset slot B boots on trial (counted); the application's confirmation makes it the confirmed slot, raises the baseline and survives a remount",
     trial && conf && R.ctl.confirmed == 1u && R.ctl.pending == BOOT_SLOT_NONE && R.ctl.min_version == V(1, 0, 0, 0) && R.ctl.state == BOOT_ST_CONFIRMED);

  new_updater(&U);
  p = upd_boot(&U, true, &streak);
  svc_init(&S, true, &U, 0x12345678u, 0xFEu);
  pmp_put32(d, 0x12345678u); send(SVC_F_SELECT, d, 4u); (void)ack_of(0u, NULL);
  int open_a = begin(0u, big->len);
  now_ms += SVC_IDLE_MS + 1u;
  svc_tick(&S, now_ms);
  int stale = block(big->img, big->len, 0u, -1, -1);
  ck("update: slot A is writable once B is confirmed; a transfer idle for 10 s is abandoned and its next block refused until BEGIN",
     open_a == SVC_OK && stale == 100 + SVC_E_STATE);

  memcpy(slot_mem[0], BV_IMG[BV_A_V1].img, BV_IMG[BV_A_V1].len);
  new_updater(&T);
  boot_install(&T.ctl, 0u);
  store_dead = true;
  p = upd_boot(&T, false, &streak);
  store_dead = false;
  ck("update: when the record cannot be stored a trial does not run (its boots could not be counted) — the confirmed slot runs",
     p.mode == BOOT_RUN && p.slot == 1u);

  /* E82 (C-04): the whole bootctl + update sequence above ran on the row-granular store. On the target the old 12-byte
     header made the FIRST boot record fail to program, so none of it stored: no trial count, no baseline, no install. */
  ck("update (E82 C-04): the boot record store never re-programmed a 64-bit flash row across the whole sequence", store_pgerr == 0);
}

int main(void) {
  crypto_tests();
  image_tests();
  bootctl_tests();
  update_tests();
  printf("\nRESULT: %d/%d checks passed\n", checks - fails, checks);
  return fails ? 1 : 0;
}
