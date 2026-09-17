/* nvmport.c — E80 the flash back end (FMC facts: facts-system §3). One global page map (flash_map.h):
 *   port page 0/1 → FM_NVM (application records) · 2/3 → FM_BOOTCTL (boot record) · 4.. → FM_EVLOG (event ring).
 * The FMC programs 64 bits at a time (two CBUS word writes, 8-byte aligned) onto erased cells only; hal/nvm.c and
 * hal/evlog.c program 4-byte-aligned runs, so the port assembles each pair into one double word and pads with 0xFF —
 * flash AND semantics make the pad writes idempotent (all-FF double words are skipped: ECC bypass rule, UM L4762).
 * DBS = 1 (dual bank, 1 KB pages) is the supported shape; nvm_port_page_size() reports it to main.
 * Timing: double word ≈ 80 µs typical, page erase ms-class — the application's §9 discipline (append with the LLC off,
 * erase with both stages off; ISRs execute from TCM) keeps that out of the control paths. */
#include "port.h"
#include "../../hal/nvm.h"
#include "flash_map.h"

#define PAGE_SZ 1024u

static uint32_t page_addr(uint8_t page) {
  if (page <= 1u) return FM_NVM + PAGE_SZ * page;
  if (page <= 3u) return FM_BOOTCTL + PAGE_SZ * (page - 2u);
  return FM_EVLOG + PAGE_SZ * (page - 4u);
}
static int page_ok(uint8_t page) { return page < 4u + FM_EVLOG_SIZE / PAGE_SZ; }

uint32_t nvm_port_page_size(void) { return PAGE_SZ; }

static void fmc_unlock(void) {
  if (FMC_CTL & BIT(31)) { FMC_KEY = 0x45670123u; FMC_KEY = 0xCDEF89ABu; }
}
static int fmc_wait(void) {
  while (FMC_STAT & BIT(16)) {}
  uint32_t st = FMC_STAT;
  FMC_STAT = st & 0xFAu;                        /* clear the error flags (rc_w1) */
  return (st & 0xFAu) == 0u;
}

bool nvm_port_read(uint8_t page, uint32_t off, uint8_t *p, uint32_t n) {
  if (!page_ok(page) || off + n > PAGE_SZ) return false;
  const uint8_t *src = (const uint8_t *)(page_addr(page) + off);
  for (uint32_t k = 0u; k < n; k++) p[k] = src[k];
  return true;
}

bool nvm_port_prog(uint8_t page, uint32_t off, const uint8_t *p, uint32_t n) {
  if (!page_ok(page) || off + n > PAGE_SZ || (off & 3u) || (n & 3u)) return false;
  uint32_t a = page_addr(page) + off;
  fmc_unlock();
  while (n) {
    uint32_t lo = 0xFFFFFFFFu, hi = 0xFFFFFFFFu;
    uint32_t base = a & ~7u;
    if (a & 4u) { for (int k = 0; k < 4; k++) hi = (hi & ~(0xFFu << (8 * k))) | ((uint32_t)p[k] << (8 * k)); }
    else {
      for (int k = 0; k < 4; k++) lo = (lo & ~(0xFFu << (8 * k))) | ((uint32_t)p[k] << (8 * k));
      if (n >= 8u) { hi = 0u; for (int k = 0; k < 4; k++) hi |= (uint32_t)p[4 + k] << (8 * k); }
    }
    uint32_t used = (a & 4u) ? 4u : (n >= 8u ? 8u : 4u);
    FMC_CTL |= BIT(0);                          /* PG */
    *(volatile uint32_t *)base = lo;            /* two CBUS writes form the 64-bit program unit */
    *(volatile uint32_t *)(base + 4u) = hi;
    int ok = fmc_wait();
    FMC_CTL &= ~BIT(0);
    if (!ok) return false;
    a += used; p += used; n -= used;
  }
  return true;
}

static bool erase_page_at(uint32_t addr) {
  fmc_unlock();
  uint32_t bank1 = addr >= FM_BANK1;
  uint32_t pn = (addr - (bank1 ? FM_BANK1 : FM_FLASH_BASE)) / PAGE_SZ;
  while (FMC_STAT & BIT(16)) {}
  FMC_CTL = (FMC_CTL & ~((0xFFu << 3) | BIT(12))) | BIT(1) | (pn << 3) | (bank1 ? BIT(12) : 0u);
  FMC_CTL |= BIT(16);                           /* START */
  int ok = fmc_wait();
  FMC_CTL &= ~BIT(1);
  return ok;
}

bool nvm_port_erase(uint8_t page) {
  if (!page_ok(page)) return false;
  return erase_page_at(page_addr(page));
}

/* ---- the bootloader's raw-slot interface (boot/updater.h) */
const uint8_t *boot_flash_map(uint32_t addr) { return (const uint8_t *)addr; }

bool boot_flash_erase(uint32_t addr, uint32_t len) {
  for (uint32_t a = addr & ~(PAGE_SZ - 1u); a < addr + len; a += PAGE_SZ)
    if (!erase_page_at(a)) return false;
  return true;
}

bool boot_flash_prog(uint32_t addr, const uint8_t *p, uint32_t n) {
  /* svc.c hands 8-byte-aligned 1 KB blocks (the last one 4-aligned); route through the same double-word writer */
  uint8_t page_local[8];
  while (n) {
    uint32_t chunk = n >= 8u ? 8u : n;
    for (uint32_t k = 0u; k < 8u; k++) page_local[k] = k < chunk ? p[k] : 0xFFu;
    fmc_unlock();
    FMC_CTL |= BIT(0);
    *(volatile uint32_t *)(addr) = (uint32_t)page_local[0] | ((uint32_t)page_local[1] << 8) |
                                   ((uint32_t)page_local[2] << 16) | ((uint32_t)page_local[3] << 24);
    *(volatile uint32_t *)(addr + 4u) = (uint32_t)page_local[4] | ((uint32_t)page_local[5] << 8) |
                                        ((uint32_t)page_local[6] << 16) | ((uint32_t)page_local[7] << 24);
    int ok = fmc_wait();
    FMC_CTL &= ~BIT(0);
    if (!ok) return false;
    addr += chunk; p += chunk; n -= chunk;
  }
  return true;
}
