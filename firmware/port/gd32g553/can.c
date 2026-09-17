/* can.c — E80 CAN1 classic 2.0B driver on the mailbox controller (facts-can.md).
 *   rx    mailboxes 2..9 as a queue (RPFQEN = 1: the first FREE matching mailbox wins). The masks compare IDE alone —
 *         the TonHe profile needs every extended frame and the VMP/service spaces filter by the native-marker bit in
 *         software, so hardware pre-filtering buys nothing here. Lock/unlock discipline per the UM: read MDES0 until
 *         not BUSY (locks), copy, clear MSx, read CAN_TIMER (unlocks).
 *   tx    mailbox 0, one frame in flight (MTO = 1), fed from the app's queue in the 1 ms tick.
 *   bus-off  ABORDIS = 1 (manual recovery): the app decides when to restart (100 ms / 5 s storm policy); restart pulses
 *         ABORDIS 0 → 1 after BORF ("bus off done") and clears the flags.
 *   listen-only  for the bootloader's autobaud: MMOD cycling 250/125/500 k until a frame is seen. */
#include "port.h"

#define B CAN1
#define TXMB 0u
#define RXMB0 2u
#define RXN  8u

static void inactive_enter(void) {
  CAN_CTL0(B) |= BIT(30) | BIT(28);            /* INAMOD + HALT */
  while (!(CAN_CTL0(B) & BIT(24))) {}          /* INAS */
}
static void inactive_leave(void) {
  CAN_CTL0(B) &= ~BIT(28);
  while (CAN_CTL0(B) & BIT(24)) {}
}

uint8_t can_bitrate_bad;                       /* E81 (F-F-4): can_init was asked for a rate it has no table for */
uint16_t can_rx_congested;                     /* E82 (G-20): drains that found every mailbox occupied — frames may have been lost */

void can_init(uint32_t bitrate, int listen_only) {
  RCU_APB2RST |= BIT(9); RCU_APB2RST &= ~BIT(9);
  CAN_CTL0(B) &= ~BIT(31);                     /* CANDIS off */
  while (CAN_CTL0(B) & BIT(20)) {}             /* LPS clear */
  inactive_enter();
  CAN_STAT(B) = 0xFFFFFFFFu;                   /* service every flag */
  (void)CAN_TIMER(B);
  CAN_CTL0(B) = (CAN_CTL0(B) & ~0x1Fu) | 15u;  /* MSZ: 16 units — mailboxes 0..15 */
  /* 48 MHz CANCLK, 16 tq, sample point 87.5 % (facts-can §3, assert-checked):
     125 k = BAUDPSC 23 → 0x02E114C1 · 250 k = 11 → 0x016114C1 · 500 k = 5 → 0x00A114C1 */
  /* E81 (F-F-4): 250 k is an explicit branch and anything else falls back to it AND reports — the old silent `else`
     would have run the wrong bit timing for any future caller that violated cfg_sanitize's {125,250,500} invariant. */
  can_bitrate_bad = (bitrate != 125000u && bitrate != 250000u && bitrate != 500000u);
  CAN_BT(B) = (bitrate == 125000u) ? 0x02E114C1u : (bitrate == 500000u) ? 0x00A114C1u : 0x016114C1u;
  CAN_CTL1(B) = BIT(6) | BIT(4) | (listen_only ? BIT(3) : 0u);   /* ABORDIS manual recovery · MTO lowest-number-first · MMOD */
  CAN_CTL0(B) |= BIT(17) | BIT(16) | BIT(12);  /* SRDIS · RPFQEN (rx queue + private masks) · MST (aborts allowed) */
  for (uint32_t n = 0u; n < 16u; n++) {
    CAN_MB(B, n, 0) = (n >= RXMB0 && n < RXMB0 + RXN) ? 0x04200000u : 0x08000000u;   /* EMPTY + IDE, or TX INACTIVE */
    CAN_MB(B, n, 1) = 0u;
    CAN_MPF(B, n) = BIT(30);                   /* compare IDE only: every extended frame lands in the queue */
  }
  inactive_leave();
}

/* one tick's worth of receive: drain completed rx mailboxes into dst (acceptance: extended only; both profiles filter) */
uint8_t can_rx(pmp_frame_t *dst, uint8_t max) {
  uint8_t n = 0u;
  uint32_t stat = CAN_STAT(B);
  /* E82 (G-20): the controller reports no queue-overrun flag, but a pass that finds all eight mailboxes full is the
     condition under which a ninth frame is lost. Count it — it is the only honest congestion evidence available. */
  if ((stat & (((1u << RXN) - 1u) << RXMB0)) == (((1u << RXN) - 1u) << RXMB0) && can_rx_congested < 0xFFFFu) can_rx_congested++;
  for (uint32_t mb = RXMB0; mb < RXMB0 + RXN && n < max; mb++) {
    if (!(stat & BIT(mb))) continue;
    uint32_t d0;
    do { d0 = CAN_MB(B, mb, 0); } while (d0 & (1u << 24));   /* BUSY: CODE[0] */
    uint32_t id = CAN_MB(B, mb, 1) & 0x1FFFFFFFu;
    uint32_t w2 = CAN_MB(B, mb, 2), w3 = CAN_MB(B, mb, 3);
    CAN_STAT(B) = BIT(mb);                     /* clear MSx */
    (void)CAN_TIMER(B);                        /* global unlock */
    if ((d0 & BIT(21)) && !(d0 & BIT(20))) {   /* extended data frames only */
      pmp_frame_t *f = &dst[n++];
      f->id = id;
      f->dlc = (uint8_t)((d0 >> 16) & 0xFu);
      if (f->dlc > 8u) f->dlc = 8u;
      for (int k = 0; k < 4; k++) f->data[k] = (uint8_t)(w2 >> (24 - 8 * k));
      for (int k = 0; k < 4; k++) f->data[4 + k] = (uint8_t)(w3 >> (24 - 8 * k));
    }
  }
  return n;
}

int can_tx_ready(void) {
  if (CAN_STAT(B) & BIT(TXMB)) { CAN_STAT(B) = BIT(TXMB); return 1; }
  return ((CAN_MB(B, TXMB, 0) >> 24) & 0xFu) == 0x8u;        /* INACTIVE */
}

void can_tx(const pmp_frame_t *f) {
  uint32_t w2 = 0u, w3 = 0u;
  for (int k = 0; k < 4; k++) w2 |= (uint32_t)f->data[k] << (24 - 8 * k);
  for (int k = 0; k < 4; k++) w3 |= (uint32_t)f->data[4 + k] << (24 - 8 * k);
  CAN_MB(B, TXMB, 1) = f->id & 0x1FFFFFFFu;
  CAN_MB(B, TXMB, 2) = w2;
  CAN_MB(B, TXMB, 3) = w3;
  CAN_MB(B, TXMB, 0) = (0xCu << 24) | BIT(22) | BIT(21) | ((uint32_t)f->dlc << 16);   /* DATA · SRR · IDE */
}

uint8_t can_state(void) {   /* 0 active · 1 passive · 2 bus-off (ERRSI 5:4; BOF sticky until restarted) */
  if (can_bitrate_bad) return 1u;   /* E81 (F-F-4): an unrecognised bit rate ran the 250 k table — report it as a CAN warning */
  uint32_t e = CAN_ERR1(B);
  if ((e & (3u << 4)) >= (2u << 4) || (e & BIT(2))) return 2u;
  return (e & (3u << 4)) ? 1u : 0u;
}

void can_restart(void) {   /* manual bus-off recovery: after BORF, ABORDIS 0 → resync on 11 recessive bits → ABORDIS 1 */
  uint32_t e = CAN_ERR1(B);
  if (e & BIT(19)) {
    CAN_CTL1(B) &= ~BIT(6);
    CAN_ERR1(B) = BIT(19) | BIT(2);            /* clear BORF + BOF */
    /* E82 (G-20): no wait for SYN. Recovery needs 128 × 11 recessive bits — 11.3 ms at 125 k — so the old 100 000-iteration
       spin (3.2 ms of the 1 ms tick) always timed out anyway, and the UM is explicit that raising ABORDIS again only
       disables the NEXT recovery, never the one in progress. */
    CAN_CTL1(B) |= BIT(6);
  }
}
