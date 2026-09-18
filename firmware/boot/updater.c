/* updater.c — see updater.h. */
#include "updater.h"
#include <string.h>

void upd_init(upd_t *u, uint8_t store_base, uint32_t page_size) {
  nvm_mount(&u->store, store_base, page_size);
  if (!nvm_get(&u->store, BOOTCTL_KIND, (uint8_t *)&u->ctl, (uint8_t)sizeof u->ctl)) bootctl_default(&u->ctl);
  u->mode = SVC_MODE_UPDATE;
}

void upd_scan(upd_t *u) {
  for (uint8_t k = 0u; k < 2u; k++) {
    u->slots.ok[k] = img_verify(boot_flash_map(u->base[k]), u->cap, u->base[k], u->hw_id, 0u, u->keys, u->n_keys, &u->info[k], boot_poll) == IMG_OK;
    u->slots.version[k] = u->slots.ok[k] ? u->info[k].version : 0u;
  }
}

bool upd_store(upd_t *u) { return nvm_put(&u->store, BOOTCTL_KIND, (const uint8_t *)&u->ctl, (uint8_t)sizeof u->ctl, true); }

static bool usable(const upd_t *u, uint8_t k) { return k < 2u && u->slots.ok[k] && u->slots.version[k] >= u->ctl.min_version; }

boot_plan_t upd_boot(upd_t *u, bool service, uint8_t *streak) {
  upd_scan(u);
  boot_plan_t p = boot_decide(&u->ctl, &u->slots, service, streak);
  if (p.store && !upd_store(u) && p.mode == BOOT_RUN && p.slot == u->ctl.pending) {
    p.slot = u->ctl.confirmed;
    if (!usable(u, p.slot)) { p.mode = BOOT_SAFE; p.slot = BOOT_SLOT_NONE; }
  }
  u->mode = (p.mode == BOOT_SAFE) ? SVC_MODE_SAFE : SVC_MODE_UPDATE;
  return p;
}

bool svc_port_info(void *ctx, uint8_t item, uint32_t *v) {
  const upd_t *u = ctx;
  switch (item) {
  case SVC_I_BOOT_VER: *v = u->boot_ver; return true;
  case SVC_I_VER_A: *v = u->slots.version[0]; return true;
  case SVC_I_VER_B: *v = u->slots.version[1]; return true;
  case SVC_I_BASELINE: *v = u->ctl.min_version; return true;
  case SVC_I_SLOT_CAP: *v = u->cap; return true;
  case SVC_I_BLOCK: *v = SVC_BLOCK; return true;
  case SVC_I_HW_ID: *v = u->hw_id; return true;
  case SVC_I_KEY_ID: *v = u->n_keys ? u->keys[0].id : 0u; return true;
  case SVC_I_CONFIRMED: *v = u->ctl.confirmed; return true;
  case SVC_I_STATE: *v = u->ctl.state; return true;
  case SVC_I_MODE: *v = u->mode; return true;
  case SVC_I_LAST_REASON: *v = u->reason; return true;
  default: return false;
  }
}

bool svc_port_may_stop(void *ctx) { (void)ctx; return true; }   /* the bootloader delivers nothing */

uint8_t svc_port_begin(void *ctx, uint8_t slot, uint32_t size) {
  upd_t *u = ctx;
  if (slot > 1u || size < IMG_HDR_LEN + 0x40u || size > u->cap) return SVC_E_RANGE;
  if (slot == u->ctl.confirmed) return SVC_E_STATE;   /* the image that has proven itself is never touched */
  if (u->ctl.pending == slot) {
    u->ctl.pending = BOOT_SLOT_NONE; u->ctl.tries = 0u;
    if (!upd_store(u)) return SVC_E_FLASH;
  }
  u->slots.ok[slot] = false; u->slots.version[slot] = 0u;
  return boot_flash_erase(u->base[slot], size) ? SVC_OK : SVC_E_FLASH;
}

uint8_t svc_port_write(void *ctx, uint8_t slot, uint32_t off, const uint8_t *p, uint32_t n) {
  upd_t *u = ctx;
  if (slot > 1u || off > u->cap || n > u->cap - off) return SVC_E_RANGE;
  const uint8_t *m = boot_flash_map(u->base[slot] + off);
  if (memcmp(m, p, n) == 0) return SVC_OK;
  for (uint32_t k = 0u; k < n; k++) if (m[k] != 0xFFu) return SVC_E_STATE;
  if (!boot_flash_prog(u->base[slot] + off, p, n)) return SVC_E_FLASH;
  return memcmp(boot_flash_map(u->base[slot] + off), p, n) == 0 ? SVC_OK : SVC_E_FLASH;
}

uint8_t svc_port_finish(void *ctx, uint8_t slot, uint32_t size, uint32_t crc, uint16_t *reason) {
  upd_t *u = ctx;
  if (slot > 1u || slot == u->ctl.confirmed || size > u->cap) return SVC_E_STATE;
  const uint8_t *img = boot_flash_map(u->base[slot]);
  img_info_t inf;
  int r = (pmp_crc32_polled(img, size, boot_poll) != crc) ? 0x100
        : img_verify(img, u->cap, u->base[slot], u->hw_id, u->ctl.min_version, u->keys, u->n_keys, &inf, boot_poll);
  if (r == IMG_OK && inf.size + IMG_HDR_LEN != size) r = IMG_E_SIZE;
  *reason = (uint16_t)r;
  u->reason = (uint16_t)r;
  upd_scan(u);
  if (r != IMG_OK) return SVC_E_VERIFY;
  boot_install(&u->ctl, slot);
  return upd_store(u) ? SVC_OK : SVC_E_FLASH;
}
