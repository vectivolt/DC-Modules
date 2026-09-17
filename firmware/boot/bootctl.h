/* bootctl.h — E80 which image runs. Portable C99; the bootloader decides, the application confirms, boot_test covers both.
 *
 * The record lives in its own two-page journal (hal/nvm.c, kind BOOTCTL_KIND, its own flash pages):
 *   confirmed     the slot that has proven itself (60 s healthy in the application), BOOT_SLOT_NONE before the first boot
 *   pending       a newly installed slot on trial, and the boots it has had (tries)
 *   state         VMP object 0x0009: 0 running confirmed · 1 update pending · 2 last update failed · 3 rolled back
 *   min_version   the security baseline: the highest minimum version of any image confirmed so far
 * boot_decide takes the record, what verifying each slot found and the reset streak kept in no-init RAM:
 *   a service request             → the service loop (firmware update), nothing else changes
 *   a pending slot                → its trial: it must verify above the baseline and gets BOOT_TRIES boots to confirm itself;
 *                                   then it is dropped (rolled back) and the confirmed slot runs
 *   the confirmed slot            → it runs; if it no longer verifies, the newest other slot that does (rolled back)
 *   BOOT_STREAK unexpected resets of a confirmed image in a row, each within 10 min of its start → safe mode (service only)
 *   nothing verifies              → safe mode
 * The caller stores a changed record BEFORE it jumps: a power cut can repeat a trial boot, never skip one. */
#ifndef PMP_BOOTCTL_H
#define PMP_BOOTCTL_H
#include <stdbool.h>
#include <stdint.h>

#define BOOTCTL_KIND    1u
#define BOOTCTL_VERSION 1u
#define BOOT_SLOT_NONE  0xFFu
#define BOOT_TRIES      3u
#define BOOT_STREAK     3u

enum { BOOT_ST_CONFIRMED = 0, BOOT_ST_PENDING = 1, BOOT_ST_FAILED = 2, BOOT_ST_ROLLED_BACK = 3 };

typedef struct {
  uint8_t version, confirmed, pending, tries, state, rsv[3];
  uint32_t min_version;
} bootctl_t;

typedef struct { bool ok[2]; uint32_t version[2]; } boot_slots_t;   /* img_verify of each slot against baseline 0 */

typedef enum { BOOT_RUN = 0, BOOT_SERVICE, BOOT_SAFE } boot_mode_t;
typedef struct { boot_mode_t mode; uint8_t slot; bool store; } boot_plan_t;

void bootctl_default(bootctl_t *c);
/* streak: unexpected resets in a row including this one; cleared here when a trial starts or a rollback happens */
boot_plan_t boot_decide(bootctl_t *c, const boot_slots_t *s, bool service, uint8_t *streak);
/* the verified image in slot is on trial from the next boot */
void boot_install(bootctl_t *c, uint8_t slot);
/* the application in slot has run healthy: it becomes the confirmed slot and raises the baseline. true when c changed */
bool boot_confirm(bootctl_t *c, uint8_t slot, uint32_t img_min_version);
#endif
