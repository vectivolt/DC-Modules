/* profile.c — the registry. Adding a vendor = one adapter file pair + one row here; core/ does not change. */
#include "profile.h"
#include "vmp.h"
#ifndef PMP_WITH_TONHE_V12
#define PMP_WITH_TONHE_V12 1
#endif
#if PMP_WITH_TONHE_V12
#include "tonhe_v12.h"
#endif

static void vmp_rx_op(void *c, const pmp_frame_t *f, uint32_t now, const mod_tlm_t *m, mod_cmd_t *cmd, pmp_txq_t *tx) { vmp_rx((vmp_t *)c, f, now, m, cmd, tx); }
static void vmp_tick_op(void *c, uint32_t now, const mod_tlm_t *m, mod_cmd_t *cmd, pmp_txq_t *tx) { vmp_tick((vmp_t *)c, now, m, cmd, tx); }
#if PMP_WITH_TONHE_V12
static void th12_rx_op(void *c, const pmp_frame_t *f, uint32_t now, const mod_tlm_t *m, mod_cmd_t *cmd, pmp_txq_t *tx) { th12_rx((th12_t *)c, f, now, m, cmd, tx); }
static void th12_tick_op(void *c, uint32_t now, const mod_tlm_t *m, mod_cmd_t *cmd, pmp_txq_t *tx) { th12_tick((th12_t *)c, now, m, cmd, tx); }
#endif

static const pmp_profile_t PROFILES[] = {
  { PMP_PROFILE_NATIVE, "vmp-2.0", VMP_BITRATE_DEFAULT, vmp_rx_op, vmp_tick_op },
#if PMP_WITH_TONHE_V12
  { PMP_PROFILE_TONHE_V12, "tonhe-v1.2", TH12_BITRATE, th12_rx_op, th12_tick_op },
#endif
};

const pmp_profile_t *pmp_profile_get(pmp_profile_id_t id) {
  for (unsigned k = 0u; k < sizeof PROFILES / sizeof PROFILES[0]; k++) if (PROFILES[k].id == id) return &PROFILES[k];
  return &PROFILES[0];
}
