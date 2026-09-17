/* bootctl.c — see bootctl.h. */
#include "bootctl.h"
#include <string.h>

void bootctl_default(bootctl_t *c) {
  memset(c, 0, sizeof *c);
  c->version = BOOTCTL_VERSION;
  c->confirmed = BOOT_SLOT_NONE;
  c->pending = BOOT_SLOT_NONE;
}

static bool sane(const bootctl_t *c) {   /* a record no writer produces is replaced by the default, never interpreted */
  return c->version == BOOTCTL_VERSION && (c->confirmed < 2u || c->confirmed == BOOT_SLOT_NONE) &&
         (c->pending < 2u || c->pending == BOOT_SLOT_NONE) && (c->pending == BOOT_SLOT_NONE || c->pending != c->confirmed) &&
         c->tries <= BOOT_TRIES && c->state <= BOOT_ST_ROLLED_BACK;
}

static bool usable(const bootctl_t *c, const boot_slots_t *s, uint8_t k) { return k < 2u && s->ok[k] && s->version[k] >= c->min_version; }

boot_plan_t boot_decide(bootctl_t *c, const boot_slots_t *s, bool service, uint8_t *streak) {
  boot_plan_t p = { BOOT_SAFE, BOOT_SLOT_NONE, false };
  if (!sane(c)) { bootctl_default(c); p.store = true; }
  if (service) { p.mode = BOOT_SERVICE; return p; }

  if (c->pending != BOOT_SLOT_NONE) {
    uint8_t k = c->pending;
    if (usable(c, s, k) && c->tries < BOOT_TRIES) {
      c->tries++; c->state = BOOT_ST_PENDING; p.store = true;
      *streak = 0u;                                    /* the trial counts its own boots */
      p.mode = BOOT_RUN; p.slot = k;
      return p;
    }
    c->state = usable(c, s, k) ? BOOT_ST_ROLLED_BACK : BOOT_ST_FAILED;
    c->pending = BOOT_SLOT_NONE; c->tries = 0u; p.store = true;
    *streak = 0u;
  }
  if (*streak >= BOOT_STREAK) { p.mode = BOOT_SAFE; return p; }
  if (usable(c, s, c->confirmed)) { p.mode = BOOT_RUN; p.slot = c->confirmed; return p; }

  uint8_t best = BOOT_SLOT_NONE;   /* the confirmed slot no longer verifies, or none was ever confirmed */
  for (uint8_t j = 0u; j < 2u; j++)
    if (j != c->confirmed && usable(c, s, j) && (best == BOOT_SLOT_NONE || s->version[j] > s->version[best])) best = j;
  if (best == BOOT_SLOT_NONE) return p;
  c->state = (c->confirmed == BOOT_SLOT_NONE) ? BOOT_ST_CONFIRMED : BOOT_ST_ROLLED_BACK;
  c->confirmed = best; p.store = true;
  p.mode = BOOT_RUN; p.slot = best;
  return p;
}

void boot_install(bootctl_t *c, uint8_t slot) {
  c->pending = slot; c->tries = 0u; c->state = BOOT_ST_PENDING;
}

bool boot_confirm(bootctl_t *c, uint8_t slot, uint32_t img_min_version) {
  bool changed = false;
  if (slot < 2u && c->pending == slot) {
    c->pending = BOOT_SLOT_NONE; c->tries = 0u; c->confirmed = slot; c->state = BOOT_ST_CONFIRMED;
    changed = true;
  }
  if (slot < 2u && c->confirmed == slot && img_min_version > c->min_version) { c->min_version = img_min_version; changed = true; }
  return changed;
}
