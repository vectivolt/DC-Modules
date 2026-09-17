/* tonhe_v12.h — E78 TonHe V1.2 compatibility profile ("Communication protocol between charging modules and monitor",
 * THJS-TXXY-0060 V1.2), implemented from the documented CAN behaviour and the TH750Q61ND-AX manual's externally observable
 * rules — never from TonHe firmware. docs/can-profile-tonhe-v12.md is the page this code answers to, including every place
 * the document is ambiguous and the reading chosen (TH-AMB-1 … TH-AMB-9).
 *
 * Wire: 125 kbit/s, 29-bit J1939 PDU1 (P · R=0 · DP=0 · PF · PS = destination · SA), low byte first. Monitor 0xA0, modules
 * 1–240, broadcast 0xFF. The profile translates to and from the canonical model (core/modapi.h) and owns every TonHe rule:
 * event-style start/stop, the 24-bit address bitmap with its address multiple, clamp-to-range setpoints, the 20 s
 * communication-loss shutdown, the fault-bit umbrella rules and the 500 ms + on-change telemetry. */
#ifndef PMP_TONHE_V12_H
#define PMP_TONHE_V12_H
#include "frame.h"
#include "../core/modapi.h"

#define TH12_MONITOR_ADDR     0xA0u
#define TH12_BROADCAST        0xFFu
#define TH12_BITRATE        125000u
#define TH12_COMM_TO_MS      20000u   /* TH750 manual: communication interrupted for 20 s → automatic shutdown, fault reported */
#define TH12_PERIOD_MS         500u   /* M_C_1 · M_C_3 · M_C_4 */
/* E81 (K §5 fix 5 / K9): 50 → 200 ms. An 8-byte extended frame at 125 kbit/s is ≈150 bits ≈1.2 ms, so two on-change
   frames per 50 ms is 4.4 % of the bus PER MODULE — a common-mode event across 24 modules computes to 105 %, i.e.
   saturation, and M_C_4 (priority 7) then starves behind M_C_1 (priority 6) with no bit to report the drop. At 200 ms a
   24-module storm is 26 %. §8.1's "500 + Trigger" sets no floor, so this stays conforming; steady state is untouched. */
#define TH12_TRIGGER_GAP_MS    200u
#define TH12_PEER_STALE_MS    1500u   /* a peer's current older than three periods is not averaged */
#define TH12_CONFLICT_HOLD_MS 10000u  /* an address conflict clears after this long without a colliding frame */
#define TH12_WARN_HOLD_MS     1000u   /* output over/under-voltage warnings must persist this long */
#define TH12_I_MIN_A           1.0f   /* §9.2.2 note 2: a current request below the module minimum outputs the minimum */
#define TH12_INLET_OT_C       55.0f   /* inlet at the full-power ambient edge (A11: full power to 55 °C) */

/* PF of each PGN (PGN = PF << 8; R = DP = 0) */
enum { TH12_PF_STATE = 0x01, TH12_PF_CONFIRM = 0x02, TH12_PF_STARTSTOP_BC = 0x03, TH12_PF_PARAM = 0x04, TH12_PF_TIMING = 0x05,
       TH12_PF_STARTSTOP = 0x06, TH12_PF_ADDR_SET = 0x09, TH12_PF_AC = 0x0B, TH12_PF_ADDR_MODE = 0x90, TH12_PF_EXT = 0x91,
       TH12_PF_INPUT_MODE = 0xAA };

typedef struct {
  uint8_t addr_mode;            /* persistent: 0 automatic (the module's local HMI address), 1 manual (CAN-assigned) */
  uint8_t addr_can;             /* persistent: the CAN-assigned address */
  uint8_t addr_local;           /* the HMI address (1–240; 0 = none) */
  bool nv_dirty;                /* addr_mode / addr_can changed — the HAL persists them (rate-limited) and clears this */
  uint8_t group;                /* raw group nibble of the last group frame that addressed this module (0xFF = none) */
  bool run; float v_set, i_set; /* the monitor's intent as last accepted */
  uint32_t t_rx;                /* last frame counted as monitor presence */
  bool comm_lost;
  uint32_t t_state, t_ac, t_ext;  /* last transmission of each periodic PGN */
  uint8_t last_state, last_pfc; uint16_t last_fault; uint32_t last_ext; bool have_state, have_ext;
  bool ovw_on, uvw_on; uint32_t t_ovw, t_uvw;
  bool conflict; uint32_t t_conflict;
  uint32_t unsupported;         /* documented commands this module cannot honour (DC input mode) */
  /* E81 (K §5 fix 2): §8.1 names an over/under-voltage setting confirmation and Appendix A.1.4 an "(address setting /
     overvoltage / undervoltage setting) process", but V1.2 defines no such downlink frame. A real monitor may use an
     undocumented PGN; counting it turns the one open interop unknown into a measurement on the first rack. */
  uint32_t unknown_pf;          /* frames from 0xA0 with a PF this profile does not implement — accepted and ignored */
  uint8_t last_unknown_pf;
  /* E81 (K §5 fix 1): §9.2.5 sets no state precondition on C_M_23, unlike §9.2.6/§9.2.7 which both state one. The
     address is always stored; it is adopted at the next output-off so the source address never moves mid-stream. */
  uint8_t addr_pending;         /* 0 = none */
  bool no_addr;                 /* E81 (K §5 fix 3): Automatic mode with no panel address, for > 5 s — the HMI says so */
  uint32_t t_noaddr;
  struct { uint8_t group; uint16_t i_ca; uint32_t t; bool seen; } peer[241];   /* index = address */
} th12_t;

/* E82 (K-3): uid is this module's 32-bit silicon identity (the same value vmp_ident_t.uid carries) — folded into the
   periodic-frame phase below so two modules mis-set to the same address do not transmit in lock-step forever. */
void th12_init(th12_t *t, uint8_t addr_mode, uint8_t addr_can, uint8_t addr_local, uint32_t uid, uint32_t now_ms);
uint8_t th12_addr(const th12_t *t);   /* the address in force; 0 = none (silent, addressed commands ignored) */
void th12_rx(th12_t *t, const pmp_frame_t *f, uint32_t now_ms, const mod_tlm_t *m, mod_cmd_t *cmd, pmp_txq_t *tx);
void th12_tick(th12_t *t, uint32_t now_ms, const mod_tlm_t *m, mod_cmd_t *cmd, pmp_txq_t *tx);
/* pure mapping — the conformance tests drive these directly */
uint32_t th12_id(uint8_t prio, uint8_t pf, uint8_t dst, uint8_t src);
void th12_enc_state(const th12_t *t, const mod_tlm_t *m, uint32_t now_ms, pmp_frame_t *f);
void th12_enc_ac(const th12_t *t, const mod_tlm_t *m, pmp_frame_t *f);
void th12_enc_ext(const th12_t *t, const mod_tlm_t *m, pmp_frame_t *f);
#endif
