/* updater.h — E80 the bootloader behind the service space: the two slots, the boot control record and image verification.
 * Portable C99 (boot_test runs it against RAM flash); the port supplies raw flash through boot_flash_* and the record pages
 * through hal/nvm.h. It implements svc_port_* for the bootloader build.
 *   begin    never the confirmed slot; a pending slot being overwritten stops being pending first (stored)
 *   write    a region already holding the same bytes is acknowledged; anything but erased flash under new bytes is refused
 *   finish   whole-image CRC-32 → img_verify against the baseline → the slot on trial (stored) — or refused, record unchanged
 *   boot     verify both slots, boot_decide, store the record before the jump; a trial whose boot count cannot be stored does
 *            not run (it could repeat forever) — the confirmed image runs, or safe mode */
#ifndef PMP_UPDATER_H
#define PMP_UPDATER_H
#include "bootctl.h"
#include "image.h"
#include "svc.h"
#include "../hal/nvm.h"

typedef struct {
  uint32_t base[2], cap;        /* slot addresses and capacity (flash_map.h on the target) */
  uint32_t hw_id, boot_ver;
  const img_key_t *keys; uint32_t n_keys;
  uint8_t mode;                 /* SVC_MODE_UPDATE or SVC_MODE_SAFE while the service loop runs */
  uint16_t reason;              /* the last finish outcome */
  bootctl_t ctl; nvm_t store;
  boot_slots_t slots; img_info_t info[2];
} upd_t;

/* provided by the port: addr/len inside a slot; the map is valid until the next erase or program */
const uint8_t *boot_flash_map(uint32_t addr);
void boot_poll(void);   /* E80: called through long verification — the port kicks its watchdog (rate-limited); host tests no-op */
bool boot_flash_erase(uint32_t addr, uint32_t len);   /* every page touching [addr, addr + len) */
bool boot_flash_prog(uint32_t addr, const uint8_t *p, uint32_t n);

void upd_init(upd_t *u, uint8_t store_base, uint32_t page_size);   /* mounts the record store and reads the record */
void upd_scan(upd_t *u);                                            /* verifies both slots (baseline 0) */
bool upd_store(upd_t *u);
boot_plan_t upd_boot(upd_t *u, bool service, uint8_t *streak);
#endif
