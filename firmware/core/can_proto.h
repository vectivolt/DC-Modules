/* can_proto.h — CAN 2.0B 29-bit codec per docs/can-protocol.md. Little-endian on the wire. */
#ifndef PMP_CAN_PROTO_H
#define PMP_CAN_PROTO_H
#include <stdint.h>
#include <stdbool.h>

enum { PMP_MT_SET_OUTPUT = 0x10, PMP_MT_MODULE_CTL = 0x11, PMP_MT_GROUP_SET = 0x12,
       PMP_MT_ADDR_ASSIGN = 0x13, PMP_MT_TIME_SYNC = 0x1F,
       PMP_MT_STATUS1 = 0x20, PMP_MT_STATUS2 = 0x21, PMP_MT_LIMITS = 0x22, PMP_MT_AC = 0x23,
       PMP_MT_TEMPS = 0x24, PMP_MT_BUS = 0x25, PMP_MT_RELAYFAN = 0x26, PMP_MT_IDENT = 0x27,
       PMP_MT_STATS = 0x28, PMP_MT_FAULT_EVT = 0x2E };

typedef struct { uint8_t prio, msgtype, dest, src, group; } pmp_can_hdr_t;
typedef struct { uint32_t v_set_mv, i_set_ma; } pmp_set_output_t;
typedef struct { bool enable, clear_faults, force_hv, force_lv, locate, walk_in; } pmp_module_ctl_t;
typedef struct { uint16_t p_avail_10w, i_avail_10ma; uint8_t state, mode; uint16_t fault_lo; } pmp_status2_t;

uint32_t pmp_can_id(uint8_t prio, uint8_t msgtype, uint8_t dest, uint8_t src, uint8_t group);
void pmp_can_id_parse(uint32_t id, pmp_can_hdr_t *h);
bool pmp_dec_set_output(const uint8_t *d, uint8_t dlc, pmp_set_output_t *o);
void pmp_enc_set_output(uint8_t *d, const pmp_set_output_t *o);
bool pmp_dec_module_ctl(const uint8_t *d, uint8_t dlc, pmp_module_ctl_t *o);
void pmp_enc_status1(uint8_t *d, uint32_t vout_mv, uint32_t iout_ma);
bool pmp_dec_status1(const uint8_t *d, uint8_t dlc, uint32_t *v, uint32_t *i);
void pmp_enc_status2(uint8_t *d, const pmp_status2_t *s);
bool pmp_dec_status2(const uint8_t *d, uint8_t dlc, pmp_status2_t *s);
void pmp_enc_temps(uint8_t *d, int8_t inlet, int8_t pfc, int8_t llc, int8_t xfmr, uint16_t f1_10rpm, uint16_t f2_10rpm);
void pmp_enc_bus(uint8_t *d, uint16_t vbp_10, uint16_t vbn_10, uint16_t va_10, uint16_t vb_10);
#endif
