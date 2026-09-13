/* group.h — E66: charger-controller-mastered group share law, run on EVERY module card.
 * When a charger runs several modules in parallel, the charger controller (A13, outside module scope) is the group
 * master — there is no supervisor card to lose — and broadcasts GROUP_SET (0x12) at 10 Hz: demand + membership bitmap. Each module derives its own
 * share from that ONE frame, so no module infers its peers by hearing (no split brain):
 *   share   = own bit ? min(own I_avail, I_req / popcount(members)) : 0
 *   lower   at once; RAISE only after PMP_GRP_HOLD_MS — a peer still on an older, larger share must have missed every
 *           frame for longer than the stale window and already ramped to zero, so the sum never exceeds I_req
 *   deliver only after the own bit has been present for HOLD + rank × PMP_GRP_STAGGER_MS (rank = member bits below own):
 *           deterministic staggered starts with no election
 *   stale   no frame for > PMP_GRP_STALE_MS → share 0, no delivery (the FSM's F.28 ramp-off does the rest)
 * The per-module SET_OUTPUT (0x10) path stays: controllers that water-fill unequal shares keep using it.
 * Portable C99, no HAL. Proven in firmware/test/host_sim.c (3-node co-simulation, sum-of-shares invariant every tick). */
#ifndef PMP_GROUP_H
#define PMP_GROUP_H
#include <stdint.h>
#include <stdbool.h>

#define PMP_GRP_STALE_MS   1000u   /* = PMP_CAN_TO_MS */
#define PMP_GRP_HOLD_MS    1300u   /* stale 1000 + ramp-down bound 200 + one 100 ms frame period */
#define PMP_GRP_STAGGER_MS  300u

typedef struct { uint16_t v_set_dv, i_req_da, members; uint8_t base; } pmp_group_set_t;   /* 0.1 V, 0.1 A, bit k = addr base+k */

typedef struct {
  bool have, member, raising;
  pmp_group_set_t last;
  uint32_t t_frame, t_member, t_raise, share_da;
} pmp_group_t;

typedef struct { uint32_t i_set_da; bool deliver; } pmp_group_out_t;

void pmp_group_init(pmp_group_t *g);
void pmp_group_frame(pmp_group_t *g, const pmp_group_set_t *m, uint8_t self_addr, uint32_t now_ms);
void pmp_group_step(pmp_group_t *g, uint8_t self_addr, uint32_t i_avail_da, uint32_t now_ms, pmp_group_out_t *out);
#endif
