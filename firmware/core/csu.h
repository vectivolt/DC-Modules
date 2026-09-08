/* csu.h — cabinet supervisor role (E39): ONE control card coordinates 2..8 modules over CAN.
 * Same card p/n, third strap identity: RATING band ~0.82 V (3.32 k against the card's 10 k
 * pullup) selects this main loop at boot instead of the power FSM (E24 rev C).
 *
 * Deliberately minimal (cabinet directive: no overengineering):
 *   - modules self-protect and self-sequence (their own FSM owns precharge/faults/K_OUT);
 *     the CSU only decides WHO runs and HOW MUCH current each contributes
 *   - equal-share commanded-CC: share = min(per-module cap, demand / alive), re-computed
 *     every step, so a module dropout re-shares automatically (graceful degrade, not a fault)
 *   - staggered starts (one enable per PMP_CSU_STAGGER_MS) so four precharges never coincide
 *   - addressing is claim-by-hearing: any src heard on STATUS frames is a module; no straps
 *   - ESTOP is a latch: broadcast disable every step until power cycle
 * Portable C99, no HAL: caller feeds heard frames + time, and transmits what out requests. */
#ifndef PMP_CSU_H
#define PMP_CSU_H
#include <stdint.h>
#include <stdbool.h>

#define PMP_CSU_MAXMOD     8u
#define PMP_CSU_ALIVE_MS   1000u   /* status silence longer than this = module gone */
#define PMP_CSU_SETTLE_MS  500u    /* listen this long before the first enable */
#define PMP_CSU_STAGGER_MS 300u    /* gap between successive module enables */

typedef enum { CSU_WAIT = 0, CSU_START, CSU_RUN, CSU_ESTOP } pmp_csu_state_t;

typedef struct {
  uint8_t  st;                          /* pmp_csu_state_t */
  uint8_t  src[PMP_CSU_MAXMOD];         /* claimed module CAN addresses, in hearing order */
  uint32_t last_ms[PMP_CSU_MAXMOD];     /* last STATUS heard */
  bool     used[PMP_CSU_MAXMOD], enabled[PMP_CSU_MAXMOD];
  uint32_t t_state;                     /* entry time of current state */
  uint32_t t_last_en;                   /* last enable sent (stagger clock) */
  uint32_t i_req_ma;                    /* cabinet demand (set by host/HMI/EVSE layer) */
  uint32_t i_mod_cap_ma;                /* per-module ceiling (100 A class output) */
} pmp_csu_t;

typedef struct {
  int      enable_idx;       /* slot to send MODULE_CTL{enable}+setpoint to this tick, or -1 */
  uint32_t i_set_ma;         /* per-module share to broadcast as SET_OUTPUT this tick */
  bool     broadcast_estop;  /* send MODULE_CTL{enable=false} to all, every tick, latched */
} pmp_csu_out_t;

void pmp_csu_init(pmp_csu_t *c, uint32_t i_mod_cap_ma);
void pmp_csu_hear(pmp_csu_t *c, uint8_t src, uint32_t now_ms);   /* any module STATUS frame */
void pmp_csu_estop(pmp_csu_t *c);
void pmp_csu_step(pmp_csu_t *c, uint32_t now_ms, pmp_csu_out_t *out);
uint8_t pmp_csu_alive(const pmp_csu_t *c, uint32_t now_ms);

#endif
