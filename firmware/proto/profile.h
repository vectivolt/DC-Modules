/* profile.h — E78 protocol profiles. A profile is the only code that knows a wire format; it fills the canonical command
 * (core/modapi.h) from received frames and encodes the canonical telemetry into its own frames. The HAL runs exactly one
 * profile per boot:
 *   rx   for every received frame (after the CAN acceptance filters)
 *   tick once per 1 ms tick, before pmp_cmd_to_in() / pmp_fsm_step()
 * Build time: PMP_WITH_TONHE_V12=0 removes the TonHe profile from an image. Runtime: the stored profile id is read once at
 * boot (an id that is not built falls back to native); a new id written over CAN or at the HMI applies at the next boot —
 * a profile never changes while the module is energized. */
#ifndef PMP_PROFILE_H
#define PMP_PROFILE_H
#include "frame.h"
#include "../core/modapi.h"

typedef enum { PMP_PROFILE_NATIVE = 0, PMP_PROFILE_TONHE_V12 = 1, PMP_PROFILE_COUNT } pmp_profile_id_t;

typedef struct {
  pmp_profile_id_t id;
  const char *name;
  uint32_t bitrate;   /* the profile's wire rate */
  void (*rx)(void *ctx, const pmp_frame_t *f, uint32_t now_ms, const mod_tlm_t *m, mod_cmd_t *cmd, pmp_txq_t *tx);
  void (*tick)(void *ctx, uint32_t now_ms, const mod_tlm_t *m, mod_cmd_t *cmd, pmp_txq_t *tx);
} pmp_profile_t;

const pmp_profile_t *pmp_profile_get(pmp_profile_id_t id);   /* never NULL: an id not built returns the native profile */
#endif
