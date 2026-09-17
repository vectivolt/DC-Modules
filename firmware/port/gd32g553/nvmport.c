/* nvmport.c — the flash back end (FMC facts: facts-system §3). One global page map (flash_map.h):
 *   port page 0/1 → FM_NVM (application records) · 2/3 → FM_BOOTCTL (boot record) · 4.. → FM_EVLOG (event ring).
 * The FMC programs 64 bits at a time (two CBUS word writes, 8-byte aligned) onto erased cells only; hal/nvm.c and
 * hal/evlog.c program 4-byte-aligned runs, so the port assembles each pair into one double word and pads with 0xFF —
 * flash AND semantics make the pad writes idempotent (all-FF double words are skipped: ECC bypass rule, UM L4762).
 * That pad is only legal on an ERASED row — a second program of the same row raises PGERR (UM §2.3.8), so both
 * journals hand this port 8-byte-aligned runs and no row is ever written twice.
 * DBS = 1 (dual bank, 1 KB pages) is the supported shape, checked before every erase; nvm_port_page_size() reports it.
 * Timing: double word ≈ 80 µs typical, page erase 1 ms typical / 20 ms max (DS Table 4-25) — the application's §9
 * discipline (append with the LLC off, erase with both stages off; ISRs execute from TCM) keeps that out of the control
 * paths, and flash_service() keeps the window watchdog fed across it. */
#include "port.h"
#include "../../hal/nvm.h"
#include "flash_map.h"

#define PAGE_SZ 1024u
/* Every FMC operation is bounded by the datasheet — DS Rev 2.0 Table 4-25: page erase 1 ms min / 20 ms MAX,
 * double word 80 µs typical. 50 ms covers the erase with 2.5× margin; past it the FMC is dead and the caller is told so
 * instead of spinning for ever. FLASH_WAIT_MS and the watchdog grant flash_service() buys are the same number, so a
 * wait that runs long outlives its services and ends in a watchdog reset rather than a silent hang. */
#define FLASH_WAIT_MS 50u

/* The FMC stalls CBUS on the bank it is erasing or programming, so NOTHING in that bank executes
 * meanwhile — not the loop, not the watchdog service. The primitives therefore live in RAM (.ramfunc) and service the
 * window watchdog BEFORE each operation: one page erase (≤ 20 ms) or one 1 KB block (128 × 80 µs ≈ 10 ms) then fits
 * inside one TPS3430 window (23.375 ms). The bootloader overrides this with its WDI pulse, the application with
 * port_kick_grant(); the weak default keeps host builds and any future link honest. */
RAMFUNC __attribute__((weak)) void flash_service(void) {}

static uint32_t page_addr(uint8_t page) {
  if (page <= 1u) return FM_NVM + PAGE_SZ * page;
  if (page <= 3u) return FM_BOOTCTL + PAGE_SZ * (page - 2u);
  return FM_EVLOG + PAGE_SZ * (page - 4u);
}
static int page_ok(uint8_t page) { return page < 4u + FM_EVLOG_SIZE / PAGE_SZ; }

uint32_t nvm_port_page_size(void) { return PAGE_SZ; }

RAMFUNC static void fmc_unlock(void) {
  if (FMC_CTL & BIT(31)) { FMC_KEY = 0x45670123u; FMC_KEY = 0xCDEF89ABu; }
}
/* The FMC is left locked between operations, so a runaway pointer cannot erase the bootloader */
RAMFUNC static int fmc_done(int ok) { FMC_CTL |= BIT(31); return ok; }

RAMFUNC static int fmc_wait(void) {
  uint32_t t0 = DWT_CYCCNT;
  while (FMC_STAT & BIT(16))
    if (DWT_CYCCNT - t0 > FLASH_WAIT_MS * (PORT_SYSCLK_HZ / 1000u)) return 0;   /* a dead FMC is not a hang */
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

RAMFUNC bool nvm_port_prog(uint8_t page, uint32_t off, const uint8_t *p, uint32_t n) {
  if (!page_ok(page) || off + n > PAGE_SZ || (off & 3u) || (n & 3u)) return false;
  uint32_t a = page_addr(page) + off;
  flash_service();
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
    if (!ok) return fmc_done(false);
    a += used; p += used; n -= used;
  }
  return fmc_done(true);
}

RAMFUNC static bool erase_page_at(uint32_t addr) {
  /* The page arithmetic below is the DBS = 1 shape (dual bank, 1 KB pages). On a part whose option byte says
     single bank the same index addresses a 2 KB page at half the intended offset — page 9 would erase inside the
     bootloader. Refuse instead; production programming sets DBS (see the manufacturing note). */
  if (!(FMC_OBCTL & BIT(22))) return false;
  flash_service();
  fmc_unlock();
  uint32_t bank1 = addr >= FM_BANK1;
  uint32_t pn = (addr - (bank1 ? FM_BANK1 : FM_FLASH_BASE)) / PAGE_SZ;
  if (!fmc_wait()) return fmc_done(false);
  FMC_CTL = (FMC_CTL & ~((0xFFu << 3) | BIT(12))) | BIT(1) | (pn << 3) | (bank1 ? BIT(12) : 0u);
  FMC_CTL |= BIT(16);                           /* START */
  int ok = fmc_wait();
  FMC_CTL &= ~BIT(1);
  flash_service();                              /* an erase may have held the bank (and its SysTick) for 20 ms — fresh edge now */
  return fmc_done(ok);
}

RAMFUNC bool nvm_port_erase(uint8_t page) {
  if (!page_ok(page)) return false;
  return erase_page_at(page_addr(page));
}

/* ---- the bootloader's raw-slot interface (boot/updater.h) */
const uint8_t *boot_flash_map(uint32_t addr) { return (const uint8_t *)addr; }

/* A slot is up to 208 pages — 208 ms typical and 4.2 s at the datasheet maximum, so a loop that held WDI still would
   reset the card mid-erase on every BEGIN. erase_page_at() services the watchdog per page from RAM. */
RAMFUNC bool boot_flash_erase(uint32_t addr, uint32_t len) {
  for (uint32_t a = addr & ~(PAGE_SZ - 1u); a < addr + len; a += PAGE_SZ)
    if (!erase_page_at(a)) return false;
  return true;
}

RAMFUNC bool boot_flash_prog(uint32_t addr, const uint8_t *p, uint32_t n) {
  /* svc.c hands 8-byte-aligned 1 KB blocks (the last one 4-aligned); route through the same double-word writer */
  uint8_t page_local[8];
  flash_service();
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
    if (!ok) return fmc_done(false);
    addr += chunk; p += chunk; n -= chunk;
  }
  return fmc_done(true);
}
