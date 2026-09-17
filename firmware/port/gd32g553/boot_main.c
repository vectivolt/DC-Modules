/* boot_main.c — E80 the bootloader image (32 KB at FM_BOOT). Kicks the TPS3430 from power-up (fixed window: first kick
 * ≥ 2.22 ms after the last edge, every kick before 23.375 ms — boot_poll rate-limits at ≥ 5 ms), decides the slot
 * (boot/updater.h: verify → boot_decide → store BEFORE the jump), runs the service loop when asked (handoff reason,
 * or no bootable image), and jumps: VTOR to the slot's vector table, MSP from it, reset-style register state. */
#include "port.h"
#include "flash_map.h"
#include "../../boot/handoff.h"
#include "../../boot/updater.h"
#include "../../boot/keys_dev.h"
#include <string.h>

#define HANDOFF (*(boot_handoff_t *)FM_HANDOFF)

static uint32_t last_kick;
void boot_poll(void) {                            /* img_verify's chunk callback (image.h) */
  uint32_t now = DWT_CYCCNT;
  if (now - last_kick >= 5u * (PORT_SYSCLK_HZ / 1000u)) { wdi_pulse(); last_kick = now; }
}

/* E82 (C-01b, M-20): nvmport.c's hook, called before every page erase and every programmed block. The bootloader
 * executes from bank 0 and erases slot A in bank 0, so while the FMC holds that bank nothing in flash runs at all —
 * this drives WDI itself, from RAM, instead of calling wdi_pulse()/boot_poll() in .text (pin_set and the delay are
 * inline; the build checks that this function calls nothing). Rate-limited to the window's EARLY boundary, not to
 * boot_poll's 5 ms: a page erase is 1 ms typical, so an unguarded edge per page would land inside the prohibited
 * 2.22 ms and trip the watchdog it is meant to feed. Skipping an edge is safe — 3 ms + a 20 ms erase (the datasheet
 * maximum, DS Table 4-25) still clears the 23.375 ms upper bound. */
RAMFUNC void flash_service(void) {
  uint32_t now = DWT_CYCCNT;
  if (now - last_kick < 3u * (PORT_SYSCLK_HZ / 1000u)) return;
  pin_set(BP_WDI, 1);
  for (volatile uint32_t d = 0u; d < 32u; d++) {}   /* ≫ the 50 ns minimum WDI pulse (TPS3430 §6.6) */
  pin_set(BP_WDI, 0);
  last_kick = now;
}

static void jump_to(uint32_t slot_base) {
  uint32_t vtor = slot_base + 0x200u;             /* IMG_HDR_LEN: the vector table behind the signed header */
  uint32_t sp = *(const uint32_t *)vtor;
  uint32_t pc = *(const uint32_t *)(vtor + 4u);
  __asm volatile ("cpsid i");
  SYST_CSR = 0u;
  SCB_VTOR = vtor;
  __asm volatile ("dsb\n isb\n msr msp, %0\n cpsie i\n bx %1" : : "r"(sp), "r"(pc));
  for (;;) {}
}

int main(void) {
  system_init();
  board_gpio_init();
  wdi_pulse();                                    /* E82: the FIRST edge after tRST has no early boundary (TPS3430 §7.3: "the first
                                                     pulse must be issued before tWDU(min)") — service it at once */
  last_kick = DWT_CYCCNT;

  boot_handoff_t h = HANDOFF;
  int have_h = handoff_valid(&h);
  int service = have_h && h.reason == HANDOFF_ENTER;
  uint8_t streak = have_h ? h.streak : 0u;
  int unexpected = !have_h || h.reason == HANDOFF_NONE || h.reason == HANDOFF_FAULT;
  /* E82 (G-08): EPRSTF (26) belongs in this mask exactly as it does in hal/app.c — the TPS3430's WDO is wire-ORed onto
     NRST, so the DOMINANT reset cause is an external pin reset, not FWDGT. Without it the streak never reached
     BOOT_STREAK and safe mode was unreachable for every watchdog reset, which is the only kind this board produces.
     The module has no reset button (NRST goes to the supervisor and the SWD header alone), so nothing else sets it. */
  if (unexpected && (port_reset_cause & (BIT(30) | BIT(29) | BIT(28) | BIT(26)))) streak = (uint8_t)(streak + 1u);
  if (port_reset_cause & BIT(27)) streak = 0u;    /* power-on starts fresh */

  static upd_t u;
  u.base[0] = FM_SLOT_A; u.base[1] = FM_SLOT_B; u.cap = FM_SLOT_SIZE;
  u.hw_id = IMG_HW_UMOD_A; u.boot_ver = 0x01000000u;
  u.keys = BOOT_KEYS; u.n_keys = BOOT_N_KEYS;
  upd_init(&u, 2u, nvm_port_page_size());
  boot_plan_t p = upd_boot(&u, service, &streak);

  HANDOFF.reason = HANDOFF_NONE;                  /* next reset without a sealed reason counts toward the streak */
  HANDOFF.streak = streak;
  HANDOFF.addr = have_h ? h.addr : 0xFEu;
  HANDOFF.bitrate = (have_h && h.bitrate) ? h.bitrate : 250000u;   /* VMP default bit rate */
  HANDOFF.slot = p.slot;
  handoff_seal(&HANDOFF);

  if (p.mode == BOOT_RUN) {
    /* E82 (G-03): hand the application a FRESH window — wait out the 5 ms spacing, service, jump */
    while (DWT_CYCCNT - last_kick < 5u * (PORT_SYSCLK_HZ / 1000u)) {}
    wdi_pulse();
    jump_to(u.base[p.slot]);
  }

  /* ---------------- service loop (update mode, or safe mode when nothing boots) */
  svc_t s;
  /* E82 (G-18): the service identity is a CRC over the WHOLE 96-bit device ID. RD(UID_BASE) alone is the wafer/lot word
     and is not unique between lots — two colliding modules both answered SELECT, both from source 0xFE, and their
     identical-identifier frames destroyed each other on the bus. The fixture reads the same CRC and prints it. */
  svc_init(&s, true, &u, pmp_crc32((const uint8_t *)UID_BASE, 12u), have_h && h.addr != 0xFEu ? h.addr : 0xFEu);
  u.mode = (p.mode == BOOT_SAFE) ? SVC_MODE_SAFE : SVC_MODE_UPDATE;
  static const uint32_t RATES[3] = { 250000u, 125000u, 500000u };
  uint32_t rate_i = 0u, silent = 0u, now_ms = 0u, bitrate = HANDOFF.bitrate;
  /* E82 (G-06): join LISTEN-ONLY and stay there until a frame has been received at this rate. The handoff's bit rate is
     a guess on a cold boot, and an error-active node at the wrong rate answers every frame it mis-reads with an active
     error frame — a module power-cycled beside a working charger used to destroy real traffic for the ~16 frames it
     took to reach bus-off. Listening costs nothing: the service protocol always starts with a frame FROM the tool. */
  int listening = 1;
  can_init(bitrate, 1);
  pmp_txq_t tx;
  memset(&tx, 0, sizeof tx);
  for (;;) {
    delay_us(1000u);
    now_ms++;
    boot_poll();
    /* E82 (G-07): drain until the mailboxes are empty. can_rx returns at most the 8 hardware mailboxes; one pass of 4
       was below the ~3.6 frames/ms a 500 kbit/s DATA stream delivers, so a 1 KB block (147 frames, no per-frame flow
       control) overran, the sequence check failed and the transfer restarted for ever. */
    uint8_t n;
    int seen = 0;
    do {
      pmp_frame_t f[8];
      n = can_rx(f, 8u);
      for (uint8_t k = 0u; k < n; k++) if (svc_frame(&f[k])) svc_rx(&s, &f[k], now_ms, &tx);
      seen |= n != 0u;
    } while (n == 8u);
    if (seen) silent = 0u; else if (++silent >= 3000u && !have_h) {   /* cold boot, dead bus: hunt the next bit rate */
      silent = 0u;
      rate_i = (rate_i + 1u) % 3u;
      bitrate = RATES[rate_i];
      can_init(bitrate, 1);
      listening = 1;
      continue;
    }
    if (seen && listening) { can_init(bitrate, 0); listening = 0; }   /* heard traffic on this rate: rejoin for real */
    svc_tick(&s, now_ms);
    while (tx.n && can_tx_ready()) {
      pmp_frame_t o;
      if (!pmp_txq_pop(&tx, &o)) break;
      can_tx(&o);
      break;
    }
    if (s.reset_req && tx.n == 0u && can_tx_ready()) {
      HANDOFF.reason = HANDOFF_REBOOT;
      HANDOFF.streak = 0u;
      handoff_seal(&HANDOFF);
      port_reboot();
    }
  }
}
