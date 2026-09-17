/* vmp.h — E78 VMP 2.0, the native module protocol. docs/can-protocol.md is its specification; this header is the table of
 * record for identifiers, codes and objects, and the page quotes it.
 *
 * Identifier (29 bit): priority(3) · 1 (native marker = J1939 EDP, so VMP frames never parse as J1939 / TonHe PDU1) ·
 * space(1: 0 application, 1 service/bootloader) · function(8) · destination(8) · source(8). Little-endian payloads; every
 * quantity has exactly one scaling: voltage 0.1 V · current 0.05 A (signed where direction matters) · power 10 W ·
 * temperature 1 °C signed (−128 = not fitted) · ratio 0.5 %. */
#ifndef PMP_VMP_H
#define PMP_VMP_H
#include "frame.h"
#include "../core/modapi.h"
#include "../core/group.h"

#define VMP_VER_MAJOR 2u
#define VMP_VER_MINOR 0u
#define VMP_BITRATE_DEFAULT 250000u

static inline uint32_t vmp_id(uint8_t prio, uint8_t space, uint8_t fn, uint8_t dst, uint8_t src) {
  return ((uint32_t)(prio & 7u) << 26) | (1u << 25) | ((uint32_t)(space & 1u) << 24) | ((uint32_t)fn << 16) | ((uint32_t)dst << 8) | src;
}

/* addresses */
#define VMP_ADDR_CTRL_MIN   0x01u   /* controllers and tools 0x01–0x0F (0x01 primary charger controller) */
#define VMP_ADDR_CTRL_MAX   0x0Fu
#define VMP_ADDR_MOD_MIN    0x10u   /* modules 0x10–0xDF (208) */
#define VMP_ADDR_MOD_MAX    0xDFu
#define VMP_ADDR_GROUP_BASE 0xE0u   /* group g (1–16) listens on 0xE0 + g − 1 */
#define VMP_ADDR_NULL       0xFEu   /* an unaddressed module's source address */
#define VMP_ADDR_ALL        0xFFu

/* priorities (lower wins arbitration) */
#define VMP_P_CMD    1u   /* CTRL, GROUP_CTRL, ACTION */
#define VMP_P_EVENT  2u   /* ACK, FAULT_BITS, FAULT_DETAIL, EVENT */
#define VMP_P_FAST   3u   /* TLM_FAST, controller heartbeat */
#define VMP_P_MED    4u   /* TLM_LIMITS, TLM_SHARE, TLM_DERATE, WARN_BITS */
#define VMP_P_SLOW   5u   /* AC, DC, thermal, cooling, module heartbeat, stats */
#define VMP_P_SVC    6u   /* READ/WRITE and responses, discovery, addressing, time */

/* functions: controller → module 0x00–0x3F · module → controller 0x40–0x7F */
enum {
  VMP_F_CTRL = 0x01, VMP_F_GROUP_CTRL = 0x02, VMP_F_CTRL_HB = 0x08, VMP_F_ACTION = 0x10, VMP_F_READ = 0x11, VMP_F_WRITE = 0x12,
  VMP_F_DISCOVER = 0x18, VMP_F_ADDR_ASSIGN = 0x19, VMP_F_TIME_SYNC = 0x1F,
  VMP_F_TLM_FAST = 0x40, VMP_F_TLM_LIMITS = 0x41, VMP_F_TLM_DERATE = 0x42, VMP_F_TLM_AC = 0x43, VMP_F_TLM_DC = 0x44,
  VMP_F_TLM_THERMAL = 0x45, VMP_F_TLM_COOLING = 0x46, VMP_F_TLM_SHARE = 0x47, VMP_F_FAULT_BITS = 0x48, VMP_F_WARN_BITS = 0x49,
  VMP_F_FAULT_DETAIL = 0x4A, VMP_F_EVENT = 0x4B, VMP_F_STATS = 0x4C, VMP_F_ACK = 0x50, VMP_F_READ_RSP = 0x51,
  VMP_F_ANNOUNCE = 0x58, VMP_F_MOD_HB = 0x59
};

/* acknowledgement status — no rejection is silent (cyclic-frame rejections are rate-limited, never suppressed) */
enum {
  VMP_OK = 0, VMP_OK_CLAMPED = 1, VMP_E_UNSUPPORTED_FUNCTION = 2, VMP_E_UNSUPPORTED_ITEM = 3, VMP_E_LENGTH = 4, VMP_E_CRC = 5,
  VMP_E_RANGE = 6, VMP_E_STATE = 7, VMP_E_LOCKED = 8, VMP_E_OWNED = 9, VMP_E_BUSY = 10, VMP_E_NVM = 11, VMP_E_READ_ONLY = 12,
  VMP_E_KEY = 13, VMP_E_SEQUENCE = 14, VMP_E_RESERVED_BITS = 15
};

/* ACTION codes */
enum { VMP_A_CLEAR = 1, VMP_A_SHUTDOWN = 2, VMP_A_WAKE = 3, VMP_A_LOCATE = 4, VMP_A_REBOOT = 5, VMP_A_UNLOCK = 6,
       VMP_A_FACTORY_RESET = 7, VMP_A_ENTER_BOOT = 8, VMP_A_RELEASE = 9 };
#define VMP_KEY_UNLOCK 0x32504D56u   /* "VMP2" as little-endian bytes */
#define VMP_KEY_REBOOT 0x21544252u   /* "RBT!" */

/* EVENT kinds */
enum { VMP_EV_BOOT = 1, VMP_EV_FAULT_SET = 2, VMP_EV_FAULT_CLEAR = 3, VMP_EV_WARN_SET = 4, VMP_EV_WARN_CLEAR = 5, VMP_EV_STATE = 6 };

/* feature bits (object 0x0100) */
#define VMP_FEAT_GROUP       (1u << 0)
#define VMP_FEAT_LEVEL_LAW   (1u << 1)
#define VMP_FEAT_P_LIMIT     (1u << 2)
#define VMP_FEAT_BIDIR       (1u << 3)   /* reverse power — 0 on every current SKU (output blocking diode) */
#define VMP_FEAT_SHARE_TRIM  (1u << 4)
#define VMP_FEAT_FAN_MODES   (1u << 5)
#define VMP_FEAT_LIQUID      (1u << 6)
#define VMP_FEAT_BOOTLOADER  (1u << 7)
#define VMP_FEAT_TIME_SYNC   (1u << 8)
#define VMP_FEAT_TONHE_V12   (1u << 9)   /* the image also carries the TonHe V1.2 profile */

/* protocol-level warnings (WARN_BITS bits 32+; bits 0–31 are the core's PMP_W_*) */
#define VMP_W_CMD_STALE   32u
#define VMP_W_ADDR_CONFL  33u
#define VMP_W_TX_DROP     34u
#define VMP_W_RX_REJECT   35u

/* objects (READ / WRITE) */
enum {
  VMP_O_PROTO = 0x0001, VMP_O_PRODUCT = 0x0002, VMP_O_UID = 0x0003, VMP_O_SERIAL = 0x0004, VMP_O_HW_REV = 0x0005,
  VMP_O_FW = 0x0006, VMP_O_FW_CRC = 0x0007, VMP_O_BOOT_VER = 0x0008, VMP_O_BOOT_STATE = 0x0009, VMP_O_RESET_CAUSE = 0x000A,
  VMP_O_FEATURES = 0x0100, VMP_O_V_MIN = 0x0101, VMP_O_V_MAX = 0x0102, VMP_O_I_RATED = 0x0103, VMP_O_P_RATED = 0x0104,
  VMP_O_LOW_VMAX = 0x0105, VMP_O_HIGH_VMIN = 0x0106, VMP_O_ENVELOPE = 0x0107,
  VMP_O_ADDR = 0x0200, VMP_O_GROUP = 0x0201, VMP_O_SLOT = 0x0202, VMP_O_BITRATE = 0x0203, VMP_O_PROFILE = 0x0204,
  VMP_O_COMM_TO = 0x0205, VMP_O_FAST_MS = 0x0206, VMP_O_SLOW_MS = 0x0207, VMP_O_RAMP_V = 0x0208, VMP_O_RAMP_I = 0x0209,
  VMP_O_DROOP = 0x020A, VMP_O_FAN_MODE = 0x020B, VMP_O_P_CAP = 0x020C,
  VMP_O_OP_S = 0x0300, VMP_O_ENERGY = 0x0301, VMP_O_STARTS = 0x0302, VMP_O_FAULTS = 0x0303,
  /* E80: the event log (sub-index = age, 0 = newest) and the T-44 timing diagnostics */
  VMP_O_EV_COUNT = 0x0400, VMP_O_EV_W0 = 0x0401, VMP_O_EV_W1 = 0x0402, VMP_O_EV_W2 = 0x0403, VMP_O_EV_W3 = 0x0404,
  VMP_O_DIAG_EXEC = 0x0500, VMP_O_DIAG_STACK = 0x0501
};

#define VMP_NAK_GAP_MS       100u    /* at most one rejection report per 100 ms */
#define VMP_REQ_BURST         20u    /* request token bucket: 20 deep, refilled 20 / s */
#define VMP_UNLOCK_MS      10000u    /* an UNLOCK opens critical writes for 10 s */
#define VMP_INCUMBENT_MS    3000u    /* a module 3 s on its address keeps it in a conflict; a newcomer yields */
#define VMP_CONFLICT_HOLD_MS 10000u
#define VMP_PEER_STALE_MS    600u    /* three TLM_SHARE periods */

typedef struct {                /* persistent configuration — loaded and stored by the HAL; nv_dirty says when */
  uint8_t addr, group, slot;    /* addr 0x10–0xDF or VMP_ADDR_NULL · group 1–16 (0 = none) · slot 0–15 */
  uint32_t bitrate;             /* 125 000 · 250 000 · 500 000 — applied at the next boot */
  uint8_t profile;              /* pmp_profile_id_t — applied at the next boot */
  uint16_t comm_timeout_ms, fast_ms, slow_ms;
  uint16_t ramp_v_vps, ramp_i_aps, droop_mohm;
  uint8_t fan_mode;             /* 0 normal · 1 quiet · 2 boost */
  uint16_t p_cap_10w;           /* installer power cap, 0xFFFF = none */
} vmp_cfg_t;

typedef struct {                /* identity — read-only, from the HAL */
  uint32_t uid, session, fw, fw_crc, boot_ver;
  uint16_t product, features;
  uint8_t hw_rev, boot_state, reset_cause;
  char serial[16];
} vmp_ident_t;

typedef struct {
  vmp_cfg_t cfg; const vmp_ident_t *id;
  /* E80: objects the HAL owns (event log, timing) — read-only, registered after vmp_init; the protocol layer stays
     ignorant of HAL types */
  uint32_t (*aux_read)(void *ctx, uint16_t obj, uint8_t sub, bool *ok);
  void *aux_ctx;
  bool nv_dirty;                          /* configuration changed — the HAL stores it (rate-limited, CRC) and clears this */
  bool reboot_req, factory_req, boot_req; /* the HAL acts once the acknowledgement has left */
  uint32_t t_boot;
  /* control plane */
  uint8_t owner;                          /* the controller that holds control (0 = none) */
  bool unicast;                           /* the stream in force is CTRL (else GROUP_CTRL) */
  bool ctrl_seen, gctrl_seen, cnt_ok, gcnt_ok, session_ok, hold_run;
  uint8_t cnt, gcnt;
  uint32_t t_ctrl, t_gctrl, session;
  bool run; pmp_omode_t omode; float v_set, i_set, p_set;
  pmp_group_t grp;
  bool unlocked; uint32_t t_unlock;
  uint32_t t_nak; bool nak_ok;
  uint8_t tokens; uint32_t t_tok;
  /* addressing */
  uint32_t t_addr; bool conflict; uint32_t t_conflict;
  bool announce_due; uint32_t t_announce;
  /* telemetry */
  uint32_t t_fast, t_limits, t_derate, t_ac, t_dc, t_therm, t_cool, t_share, t_bits, t_detail, t_hb, t_stats;
  uint8_t tx_cnt; uint16_t event_no;
  bool boot_event, have_ev;
  pmp_fault_t ev_fault; uint32_t ev_warn; uint8_t ev_rs;
  uint64_t sent_fb, sent_wb; uint16_t sent_why; pmp_fault_t sent_detail;
  uint32_t epoch_s, t_epoch; bool epoch_ok;
  struct { int16_t i_raw; uint32_t t; bool seen; } peer[16];   /* by slot, same group (TLM_SHARE) */
  uint32_t rx_reject, rx_dup;
} vmp_t;

void vmp_cfg_default(vmp_cfg_t *c);
void vmp_init(vmp_t *v, const vmp_cfg_t *cfg, const vmp_ident_t *id, uint32_t now_ms);
void vmp_rx(vmp_t *v, const pmp_frame_t *f, uint32_t now_ms, const mod_tlm_t *m, mod_cmd_t *cmd, pmp_txq_t *tx);
void vmp_tick(vmp_t *v, uint32_t now_ms, const mod_tlm_t *m, mod_cmd_t *cmd, pmp_txq_t *tx);
#endif
