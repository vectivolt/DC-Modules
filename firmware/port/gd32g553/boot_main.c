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
  delay_us(2500u);                                /* clear of the TPS3430 early window before the first edge */
  wdi_pulse();
  last_kick = DWT_CYCCNT;

  boot_handoff_t h = HANDOFF;
  int have_h = handoff_valid(&h);
  int service = have_h && h.reason == HANDOFF_ENTER;
  uint8_t streak = have_h ? h.streak : 0u;
  int unexpected = !have_h || h.reason == HANDOFF_NONE || h.reason == HANDOFF_FAULT;
  if (unexpected && (port_reset_cause & (BIT(29) | BIT(28) | BIT(30)))) streak = (uint8_t)(streak + 1u);   /* FWDGT/SW/WWDGT with no sealed reason */
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

  if (p.mode == BOOT_RUN) jump_to(u.base[p.slot]);

  /* ---------------- service loop (update mode, or safe mode when nothing boots) */
  svc_t s;
  svc_init(&s, true, &u, RD(UID_BASE), have_h && h.addr != 0xFEu ? h.addr : 0xFEu);
  u.mode = (p.mode == BOOT_SAFE) ? SVC_MODE_SAFE : SVC_MODE_UPDATE;
  static const uint32_t RATES[3] = { 250000u, 125000u, 500000u };
  uint32_t rate_i = 0u, silent = 0u, now_ms = 0u, bitrate = HANDOFF.bitrate;
  int listening = 0;
  can_init(bitrate, 0);
  pmp_txq_t tx;
  memset(&tx, 0, sizeof tx);
  for (;;) {
    delay_us(1000u);
    now_ms++;
    boot_poll();
    pmp_frame_t f[4];
    uint8_t n = can_rx(f, 4u);
    if (n) silent = 0u; else if (++silent >= 3000u && !have_h) {   /* cold boot, dead bus: hunt the bit rate listen-only */
      silent = 0u;
      rate_i = (rate_i + 1u) % 3u;
      bitrate = RATES[rate_i];
      can_init(bitrate, 1);
      listening = 1;
      continue;
    }
    if (n && listening) { can_init(bitrate, 0); listening = 0; }   /* heard traffic on this rate: rejoin for real */
    for (uint8_t k = 0u; k < n; k++) if (svc_frame(&f[k])) svc_rx(&s, &f[k], now_ms, &tx);
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
