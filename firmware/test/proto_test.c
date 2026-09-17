/* proto_test.c — E78 protocol conformance, robustness, and one core behind every profile.
 *   frame:      saturating encoders, CRC-8/AUTOSAR check value, priority-aware bounded TX queue
 *   TonHe V1.2: identifiers and golden payloads from the specification's own examples (§9, Appendix A.2), bitmap
 *               addressing with the address multiple, range-edge setpoints, the 20 s communication rule, address mode
 *               and address setting, DC-input refusal, 500 ms + on-change cadence, fault umbrella rules, address conflict,
 *               the peer-average sharing input, 1 M fuzzed frames
 *   VMP 2.0:    identifier layout, CTRL accept / CRC / must-understand / counter (duplicate, frozen, late, gap) /
 *               ownership / controller restart / boot re-arm, group EQUAL and LEVEL laws with the sum invariant,
 *               ACTION / READ / WRITE status codes, unknown functions, discovery and UID assignment, address conflict,
 *               telemetry cadence and events, saturation, 1 M fuzzed frames
 *   one core:   the same FSM driven end to end through each profile — start, communication loss, fresh-request re-arm
 * Build/run: firmware/run_tests.sh */
#include "../proto/frame.h"
#include "../proto/profile.h"
#include "../proto/tonhe_v12.h"
#include "../proto/vmp.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int checks = 0, fails = 0;
static void ck(const char *name, int cond) {
  checks++;
  if (!cond) { fails++; printf("FAIL %s\n", name); } else printf("PASS %s\n", name);
}
#define FB(n) (1ull << ((n) - 1u))
static pmp_frame_t out[512];

static mod_tlm_t tlm(void) {
  mod_tlm_t m;
  memset(&m, 0, sizeof m);
  m.rs = MOD_RS_READY; m.v_min = 150.0f; m.v_max = 500.0f; m.i_rated = 166.7f; m.p_rated = 50000.0f; m.derate = 1.0f;
  m.vin_ph[0] = 227.7f; m.vin_ph[1] = 228.1f; m.vin_ph[2] = 226.3f; m.vin_ll = 395.0f; m.line_hz = 50.0f;
  m.t_inlet = 24.0f; m.t_pfc = 60.0f; m.t_llc = 60.0f; m.t_xfmr = 60.0f;
  m.t_coolant = NAN; m.t_diode = NAN; m.t_bank = NAN; m.t_mcu = NAN;
  m.i_avail = 166.7f; m.p_avail = 50000.0f;
  return m;
}
static pmp_frame_t mk(uint32_t id, uint8_t dlc, const uint8_t d[8]) { pmp_frame_t f; f.id = id; f.dlc = dlc; memcpy(f.data, d, 8); return f; }
static int drain(pmp_txq_t *q) { int n = 0; pmp_frame_t f; while (pmp_txq_pop(q, &f)) { if (n < 512) out[n] = f; n++; } return n; }
static uint8_t fn_of(const pmp_frame_t *f) { return (uint8_t)(f->id >> 16); }
static const pmp_frame_t *find_fn(int n, uint8_t fn) { for (int k = n - 1; k >= 0; k--) if (fn_of(&out[k]) == fn) return &out[k]; return NULL; }

/* ======================================================================== frame */
static void frame_tests(void) {
  ck("frame: saturating encoders (NaN → 0, ±overflow → the type limits, i8 NaN → −128)",
     pmp_sat_u16(NAN, 0.1f) == 0u && pmp_sat_u16(1e9f, 0.1f) == 65535u && pmp_sat_u16(-5.0f, 0.1f) == 0u && pmp_sat_u16(400.0f, 0.1f) == 4000u &&
     pmp_sat_i16(-1e9f, 0.05f) == INT16_MIN && pmp_sat_i16(INFINITY, 0.05f) == INT16_MAX && pmp_sat_i8(NAN, 1.0f) == INT8_MIN &&
     pmp_sat_i8(-1e9f, 1.0f) == -127 && pmp_sat_u8(300.0f, 1.0f) == 255u);
  ck("frame: CRC-8/AUTOSAR check value \"123456789\" = 0xDF", pmp_crc8((const uint8_t *)"123456789", 9u) == 0xDFu);
  pmp_txq_t q; memset(&q, 0, sizeof q);
  for (uint8_t k = 0; k < PMP_TXQ_LEN; k++) { pmp_frame_t f = { 0x14000000u + 1u, 8u, { k } }; pmp_txq_push(&q, &f); }
  pmp_frame_t cmd = { 0x04000000u, 8u, { 0xAA } }, low = { 0x1C000000u, 8u, { 0 } };
  bool in_cmd = pmp_txq_push(&q, &cmd), in_low = pmp_txq_push(&q, &low);
  pmp_frame_t a, b, c;
  pmp_txq_pop(&q, &a); pmp_txq_pop(&q, &b); pmp_txq_pop(&q, &c);
  ck("frame: a full TX queue evicts the newest lowest-priority frame for a command, refuses a lower one, pops by priority then FIFO",
     in_cmd && !in_low && q.dropped == 2u && a.data[0] == 0xAA && b.data[0] == 0 && c.data[0] == 1 && q.n == PMP_TXQ_LEN - 3u);
}

/* ======================================================================== TonHe V1.2 */
static void tonhe_tests(void) {
  pmp_txq_t q; mod_cmd_t cmd; mod_tlm_t m; th12_t t;
  mod_cmd_init(&cmd);
  memset(&q, 0, sizeof q);

  ck("TonHe: identifiers match every V1.2 example (M_C_1/2/3/4, C_M_1/2/3/12/23/24/4)",
     th12_id(6, 0x01, 0xA0, 1) == 0x1801A001u && th12_id(2, 0x02, 0xA0, 1) == 0x0802A001u && th12_id(6, 0x0B, 0xA0, 1) == 0x180BA001u &&
     th12_id(7, 0x91, 0xA0, 1) == 0x1C91A001u && th12_id(2, 0x03, 0xFF, 0xA0) == 0x0803FFA0u && th12_id(4, 0x04, 0xFF, 0xA0) == 0x1004FFA0u &&
     th12_id(6, 0x05, 0xFF, 0xA0) == 0x1805FFA0u && th12_id(2, 0x06, 0x01, 0xA0) == 0x080601A0u && th12_id(6, 0x09, 0xFF, 0xA0) == 0x1809FFA0u &&
     th12_id(7, 0x90, 0xFF, 0xA0) == 0x1C90FFA0u && th12_id(6, 0xAA, 0xFF, 0xA0) == 0x18AAFFA0u);

  th12_init(&t, 0, 0, 1, 0, 1000); m = tlm(); m.rs = MOD_RS_ON; m.v_out = 400.0f; m.i_out = 100.0f;
  { pmp_frame_t f; th12_enc_state(&t, &m, 1000, &f); const uint8_t g[8] = { 0x01, 0xa0, 0x0f, 0x10, 0x27, 0x00, 0x00, 0x00 };
    ck("TonHe: A.2.1 state frame (ON, 400 V, 100 A, no fault) is byte-exact", f.id == 0x1801A001u && f.dlc == 8u && !memcmp(f.data, g, 8)); }

  m = tlm(); m.rs = MOD_RS_FAULT; m.fault_bits = FB(6);
  { pmp_frame_t f; th12_enc_state(&t, &m, 1000, &f);
    ck("TonHe: §9.1.1 bus-bias example — state 0x11, fault word 0x0880 (PFC shutdown + hardware umbrella), PFC bus-bias bit 5",
       f.data[0] == 0x11 && pmp_get16(f.data + 5) == 0x0880u && f.data[7] == 0x20); }

  m = tlm();
  { pmp_frame_t f; th12_enc_ac(&t, &m, &f); const uint8_t g[8] = { 0xE5, 0x08, 0xE9, 0x08, 0xD7, 0x08, 0x18, 0x00 };
    ck("TonHe: §9.1.3 AC frame (227.7 / 228.1 / 226.3 V, 24 °C) is byte-exact", f.id == 0x180BA001u && !memcmp(f.data, g, 8)); }

  { const uint8_t d[8] = { 0x07, 0, 0, 0xAA, 0, 0, 0, 0 }; pmp_frame_t f = mk(0x0803FFA0u, 8, d); m = tlm();
    th12_t a, b; th12_init(&a, 0, 0, 2, 0, 1000); th12_init(&b, 0, 0, 5, 0, 1000);
    th12_rx(&a, &f, 1000, &m, &cmd, &q); th12_rx(&b, &f, 1000, &m, &cmd, &q);
    ck("TonHe: A.2.2 broadcast start of modules 1–3 starts module 2, not module 5", a.run && !b.run); }

  { const uint8_t d[8] = { 0x07, 0, 0, 0x00, 0xa0, 0x0f, 0x10, 0x27 }; pmp_frame_t f = mk(0x1004FFA0u, 8, d); m = tlm();
    th12_t a, b; th12_init(&a, 0, 0, 3, 0, 1000); th12_init(&b, 0, 0, 4, 0, 1000);
    th12_rx(&a, &f, 1000, &m, &cmd, &q); th12_rx(&b, &f, 1000, &m, &cmd, &q);
    ck("TonHe: A.2.3 parameter setting 400 V / 100 A reaches module 3 only",
       fabsf(a.v_set - 400.0f) < 0.01f && fabsf(a.i_set - 100.0f) < 0.01f && b.v_set == 0.0f); }

  { const uint8_t d[8] = { 0xaa, 0x01, 0xa0, 0x0f, 0x10, 0x27, 0x00, 0x00 }; pmp_frame_t f = mk(0x080601A0u, 8, d); m = tlm();
    th12_init(&t, 0, 0, 1, 0, 1000); memset(&q, 0, sizeof q); th12_rx(&t, &f, 1000, &m, &cmd, &q);
    int n = drain(&q); const uint8_t g[8] = { 0x01, 0, 0, 0, 0, 0, 0, 0 };
    ck("TonHe: A.2.4 start of module 1 (mode byte 0x01 tolerated) runs 400 V / 100 A and confirms 0802a001 01",
       t.run && fabsf(t.v_set - 400.0f) < 0.01f && n == 1 && out[0].id == 0x0802A001u && !memcmp(out[0].data, g, 8)); }

  { const uint8_t d1[8] = { 0x20, 0, 0, 0x01, 0xa0, 0x0f, 0x10, 0x27 }, d0[8] = { 0x20, 0, 0, 0x00, 0xa0, 0x0f, 0x10, 0x27 }; m = tlm();
    th12_t a, b; th12_init(&a, 0, 0, 30, 0, 1000); th12_init(&b, 0, 0, 30, 0, 1000);
    pmp_frame_t f1 = mk(0x1004FFA0u, 8, d1), f0 = mk(0x1004FFA0u, 8, d0);
    th12_rx(&a, &f1, 1000, &m, &cmd, &q); th12_rx(&b, &f0, 1000, &m, &cmd, &q);
    ck("TonHe: the address multiple selects the 24-address window (module 30 = multiple 1, bit 5)", a.v_set > 0.0f && b.v_set == 0.0f); }

  { const uint8_t aa[8] = { 0xaa, 0x00, 0xa0, 0x0f, 0x10, 0x27, 0, 0 }; m = tlm(); th12_init(&t, 0, 0, 1, 0, 1000); memset(&q, 0, sizeof q);
    pmp_frame_t f = mk(0x080601A0u, 8, aa); th12_rx(&t, &f, 1000, &m, &cmd, &q);
    th12_tick(&t, 20999, &m, &cmd, &q);
    int alive = !t.comm_lost && t.run && cmd.run && cmd.age_ms == 19999u && cmd.timeout_ms == 20000u;
    th12_tick(&t, 21001, &m, &cmd, &q); drain(&q);
    pmp_frame_t e; th12_enc_ext(&t, &m, &e);
    ck("TonHe: 19.999 s of silence keeps the session; 20.001 s ends it (run and setpoints cleared, CAN-timeout bit)",
       alive && t.comm_lost && !t.run && !cmd.run && t.v_set == 0.0f && (pmp_get16(e.data + 2) & (1u << 2))); }

  { m = tlm(); th12_init(&t, 0, 0, 7, 0, 1000); memset(&q, 0, sizeof q);
    const uint8_t set12[8] = { 12, 0, 0, 0, 0, 0, 0, 0 }, manual[8] = { 1, 0, 0, 0, 0, 0, 0, 0 }, autom[8] = { 0 }, set20[8] = { 20, 0, 0, 0, 0, 0, 0, 0 };
    pmp_frame_t fs = mk(0x1809FFA0u, 8, set12), fm = mk(0x1C90FFA0u, 8, manual), fa = mk(0x1C90FFA0u, 8, autom), f20 = mk(0x1809FFA0u, 8, set20);
    th12_rx(&t, &fs, 1000, &m, &cmd, &q); int stays = th12_addr(&t) == 7 && t.addr_can == 12;
    th12_rx(&t, &fm, 1001, &m, &cmd, &q); int manual_ok = th12_addr(&t) == 12 && t.nv_dirty;
    m.rs = MOD_RS_ON; th12_rx(&t, &fa, 1002, &m, &cmd, &q); th12_rx(&t, &f20, 1003, &m, &cmd, &q);
    ck("TonHe: address set is stored but automatic mode keeps the local address; manual puts it in force; neither changes while delivering",
       stays && manual_ok && t.addr_mode == 1 && th12_addr(&t) == 12); }

  { m = tlm(); th12_init(&t, 0, 0, 1, 0, 1000);
    const uint8_t dc[8] = { 0 }, ac[8] = { 1, 0, 0, 0, 0, 0, 0, 0 };
    pmp_frame_t fdc = mk(0x18AAFFA0u, 8, dc), fac = mk(0x18AAFFA0u, 8, ac);
    th12_rx(&t, &fdc, 1000, &m, &cmd, &q); th12_rx(&t, &fac, 1000, &m, &cmd, &q);
    pmp_frame_t e; th12_enc_ext(&t, &m, &e);
    ck("TonHe: DC input mode is refused (counted) and the module keeps reporting AC input", t.unsupported == 1u && !(pmp_get16(e.data) & (1u << 3))); }

  { m = tlm(); m.rs = MOD_RS_ON; th12_init(&t, 0, 0, 1, 0, 1000); memset(&q, 0, sizeof q);
    int nst = 0, nac = 0, next = 0, lat = -1; const uint8_t tm[8] = { 0 };
    for (uint32_t now = 1000; now < 11000; now++) {
      if ((now - 1000u) % 5000u == 0u) { pmp_frame_t f = mk(0x1805FFA0u, 8, tm); th12_rx(&t, &f, now, &m, &cmd, &q); }
      if (now == 5000u) m.fault_bits = FB(15);
      th12_tick(&t, now, &m, &cmd, &q);
      int n = drain(&q);
      for (int k = 0; k < n; k++) {
        uint8_t pf = fn_of(&out[k]);
        nst += pf == 0x01; nac += pf == 0x0B; next += pf == 0x91;
        if (pf == 0x01 && lat < 0 && now >= 5000u && (pmp_get16(out[k].data + 5) & (1u << 4))) lat = (int)(now - 5000u);
      }
    }
    ck("TonHe: 10 s gives 20±2 state, AC and extended frames; a new fault is reported within 50 ms",
       nst >= 20 && nst <= 23 && nac >= 19 && nac <= 21 && next >= 19 && next <= 22 && lat >= 0 && lat <= 50); }

  { m = tlm(); th12_init(&t, 0, 0, 1, 0, 1000); memset(&q, 0, sizeof q);
    m.fault_bits = FB(3); pmp_frame_t f; th12_enc_state(&t, &m, 1000, &f);
    uint16_t w = pmp_get16(f.data + 5);
    int busov = (f.data[7] & 0x80) && (w & (1u << 11)) && (w & (1u << 7));
    m = tlm(); m.rs = MOD_RS_ON; m.v_set = 400.0f; m.v_out = 430.0f;
    for (uint32_t now = 1000; now <= 2100; now++) { th12_tick(&t, now, &m, &cmd, &q); drain(&q); }
    th12_enc_state(&t, &m, 2100, &f); w = pmp_get16(f.data + 5);
    ck("TonHe: umbrella rules — PFC bus OV sets PFC bit 7 and word bits 11 + 7; a 1 s output-OV warning sets bits 13 + 7",
       busov && (w & (1u << 13)) && (w & (1u << 7))); }

  { m = tlm(); th12_init(&t, 0, 0, 1, 0, 1000); memset(&q, 0, sizeof q); t.run = true;
    const uint8_t st[8] = { 0x01, 0xa0, 0x0f, 0x10, 0x27, 0, 0, 0 }; pmp_frame_t f = mk(0x1801A001u, 8, st);
    th12_rx(&t, &f, 1000, &m, &cmd, &q); th12_tick(&t, 1001, &m, &cmd, &q); drain(&q);
    pmp_frame_t s; th12_enc_state(&t, &m, 1001, &s);
    int during = t.conflict && !cmd.run && (s.data[7] & 0x10);
    th12_tick(&t, 11002, &m, &cmd, &q); drain(&q);
    ck("TonHe: a frame sent under this module's address flags a conflict (PFC bit 4) and blocks delivery until 10 s quiet", during && !t.conflict && cmd.run); }

  /* E82 (K-3): before this fix the transmit phase was address-only, so two modules mis-set to the same address computed
     the identical phase and transmitted in lock-step forever. This fails without the fix (both a.t_state == b.t_state). */
  { th12_t a, b; th12_init(&a, 0, 0, 9, 0x11111111u, 0); th12_init(&b, 0, 0, 9, 0x22222222u, 0);
    ck("TonHe: two modules sharing an address but not a UID no longer share a transmit phase", a.t_state != b.t_state); }

  { m = tlm(); m.i_out = 60.0f; th12_init(&t, 0, 0, 1, 0, 1000); memset(&q, 0, sizeof q);
    const uint8_t grp[8] = { 0x07, 0, 0, 0x00, 0xa0, 0x0f, 0x10, 0x27 }; pmp_frame_t g = mk(0x1004FFA0u, 8, grp);
    th12_rx(&t, &g, 1000, &m, &cmd, &q);
    uint8_t p2[8] = { 0x01, 0xa0, 0x0f, 0, 0, 0, 0, 0 }, p3[8] = { 0x01, 0xa0, 0x0f, 0, 0, 0, 0, 0 };
    pmp_put16(p2 + 3, 9000); pmp_put16(p3 + 3, 12000);
    pmp_frame_t f2 = mk(0x1801A002u, 8, p2), f3 = mk(0x1801A003u, 8, p3), f9 = mk(0x1801A009u, 8, p3);
    th12_rx(&t, &f2, 1000, &m, &cmd, &q); th12_rx(&t, &f3, 1000, &m, &cmd, &q); th12_rx(&t, &f9, 1000, &m, &cmd, &q);
    th12_tick(&t, 1001, &m, &cmd, &q); int ok = cmd.peer_n == 3 && fabsf(cmd.peer_avg_a - 90.0f) < 0.01f;
    th12_tick(&t, 2600, &m, &cmd, &q); drain(&q);
    ck("TonHe: group frames define the peers; their currents average with this module's (90 A of 3); an outsider and stale peers drop out",
       ok && cmd.peer_n == 0 && isnan(cmd.peer_avg_a)); }

  { m = tlm(); th12_init(&t, 0, 0, 1, 0, 1000); memset(&q, 0, sizeof q);
    const uint8_t z[8] = { 0xaa, 0, 0, 0, 0, 0, 0, 0 }; pmp_frame_t f = mk(0x080601A0u, 8, z); th12_rx(&t, &f, 1000, &m, &cmd, &q);
    int zero = t.v_set == 0.0f && fabsf(t.i_set - 1.0f) < 1e-3f;
    uint8_t lo[8] = { 0x01, 0, 0, 0x00, 0, 0, 0, 0 }; pmp_put16(lo + 4, 500); pmp_put16(lo + 6, 50000);
    pmp_frame_t g = mk(0x1004FFA0u, 8, lo); th12_rx(&t, &g, 1000, &m, &cmd, &q); drain(&q);
    ck("TonHe: zero volts means no setpoint; below-minimum and above-maximum requests serve the range edges (150 V, 1 A, 166.7 A)",
       zero && fabsf(t.v_set - 150.0f) < 1e-3f && fabsf(t.i_set - 166.7f) < 1e-3f); }

  { m = tlm(); th12_init(&t, 0, 0, 1, 0, 1000); memset(&q, 0, sizeof q);
    const uint8_t bad[8] = { 0x5A, 0, 0xa0, 0x0f, 0x10, 0x27, 0, 0 }; pmp_frame_t f = mk(0x080601A0u, 8, bad); th12_rx(&t, &f, 1000, &m, &cmd, &q);
    int n = drain(&q);
    ck("TonHe: an invalid start/stop byte is confirmed 0x00 (not received) and changes nothing", n == 1 && out[0].data[0] == 0x00 && !t.run && t.v_set == 0.0f); }

  /* E82 (K-2): before this fix a short C_M_24 (here 5 of the 6 bytes §9.2.4 needs) was dropped with no reply at all —
     indistinguishable from a bus glitch — and this same early return also skipped the t_rx presence update below,
     which used to run unconditionally for any dlc >= 6 frame reaching this case. Fails on either half without the fix. */
  { m = tlm(); th12_init(&t, 0, 0, 1, 0, 1000); memset(&q, 0, sizeof q);
    const uint8_t shortss[8] = { 0xaa, 0, 0xa0, 0x0f, 0x10, 0x27, 0, 0 }; pmp_frame_t f = mk(0x080601A0u, 5, shortss);
    th12_rx(&t, &f, 5000, &m, &cmd, &q);
    int n2 = drain(&q);
    ck("TonHe: a short C_M_24 is confirmed 0x00 like a bad command byte, but does not refresh presence or run",
       n2 == 1 && out[0].data[0] == 0x00 && !t.run && t.t_rx == 1000u); }

  { m = tlm(); th12_init(&t, 0, 0, 1, 0, 1000); memset(&q, 0, sizeof q);
    const uint8_t tm[8] = { 0 }, aa[8] = { 0xaa, 0, 0xa0, 0x0f, 0x10, 0x27, 0, 0 };
    pmp_frame_t f = mk(0x1805FFA1u, 8, tm), g = mk(0x080601A1u, 8, aa);
    th12_rx(&t, &f, 9000, &m, &cmd, &q); th12_rx(&t, &g, 9000, &m, &cmd, &q);
    ck("TonHe: frames from any source other than the monitor 0xA0 neither refresh presence nor command", t.t_rx == 1000u && !t.run && drain(&q) == 0); }

  { th12_t fz; m = tlm(); th12_init(&fz, 1, 1, 0, 0, 0); memset(&q, 0, sizeof q); srand(99); int bad = 0;
    static const uint8_t pfs[] = { 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x09, 0x0B, 0x90, 0x91, 0xAA, 0x77 };
    for (uint32_t k = 0; k < 1000000u; k++) {
      pmp_frame_t f; f.dlc = (uint8_t)(rand() % 9);
      for (int j = 0; j < 8; j++) f.data[j] = (uint8_t)rand();
      uint8_t pf = pfs[rand() % 12], ps = (rand() % 3 == 0) ? 0xFF : (uint8_t)((rand() % 4) ? th12_addr(&fz) : rand());
      uint8_t sa = (rand() % 2) ? 0xA0 : (uint8_t)rand();
      f.id = th12_id((uint8_t)rand(), pf, ps, sa) | ((rand() % 16 == 0) ? ((uint32_t)(rand() % 4) << 24) : 0u);
      m.rs = (mod_run_state_t)(rand() % 11);
      th12_rx(&fz, &f, k, &m, &cmd, &q);
      if (k % 64u == 0u) { th12_tick(&fz, k, &m, &cmd, &q); drain(&q); }
      if (!isfinite(cmd.v_set_v) || cmd.v_set_v < 0.0f || cmd.v_set_v > 1000.0f || !isfinite(cmd.i_set_a) || cmd.i_set_a < 0.0f ||
          cmd.i_set_a > 166.7f + 1e-3f || q.n > PMP_TXQ_LEN) bad++;
    }
    ck("TonHe: 1 M fuzzed frames — no sanitizer trap, commands finite and inside the module range, TX queue bounded", bad == 0); }
}

/* ======================================================================== VMP 2.0 */
static const vmp_ident_t ID = { .uid = 0x12345678u, .session = 0xCAFEF00Du, .fw = 0x02000001u, .fw_crc = 0xDEADBEEFu, .boot_ver = 0x01000000u,
  .product = 0x0050u, .features = VMP_FEAT_GROUP | VMP_FEAT_LEVEL_LAW | VMP_FEAT_P_LIMIT | VMP_FEAT_SHARE_TRIM | VMP_FEAT_TONHE_V12,
  .hw_rev = 4u, .boot_state = 0u, .reset_cause = 1u, .serial = { 'V', 'V', '5', '0', '-', '0', '0', '0', '1', '-', '2', '6', '0', '9', 'A', 'B' } };
static const vmp_ident_t ID2 = { .uid = 0x9ABCDEF0u, .session = 1u, .product = 0x0050u };

static void vsetup(vmp_t *v, const vmp_ident_t *id, uint8_t addr, uint8_t group, uint8_t slot, uint32_t now) {
  vmp_cfg_t c; vmp_cfg_default(&c); c.addr = addr; c.group = group; c.slot = slot; vmp_init(v, &c, id, now);
}
static pmp_frame_t vctrl(uint8_t src, uint8_t dst, int run, uint8_t omode, uint8_t cnt, float v, float i, int p10w) {
  pmp_frame_t f; memset(&f, 0, sizeof f);
  f.id = vmp_id(VMP_P_CMD, 0u, VMP_F_CTRL, dst, src); f.dlc = 8u;
  f.data[0] = (uint8_t)((run ? 1u : 0u) | ((omode & 3u) << 1) | ((cnt & 0x0Fu) << 4));
  pmp_put16(f.data + 1, pmp_sat_u16(v, 0.1f)); pmp_put16(f.data + 3, pmp_sat_u16(i, 0.05f));
  pmp_put16(f.data + 5, p10w < 0 ? 0xFFFFu : (uint16_t)p10w);
  f.data[7] = pmp_crc8_frame(f.id, f.data, 7u);
  return f;
}
static pmp_frame_t vgroup(uint8_t src, uint8_t group, int run, int level, uint8_t cnt, float v, float i, uint16_t members) {
  pmp_frame_t f; memset(&f, 0, sizeof f);
  f.id = vmp_id(VMP_P_CMD, 0u, VMP_F_GROUP_CTRL, (uint8_t)(VMP_ADDR_GROUP_BASE + group - 1u), src); f.dlc = 8u;
  f.data[0] = (uint8_t)((run ? 1u : 0u) | (level ? 8u : 0u) | ((cnt & 0x0Fu) << 4));
  pmp_put16(f.data + 1, pmp_sat_u16(v, 0.1f)); pmp_put16(f.data + 3, pmp_sat_u16(i, 0.05f)); pmp_put16(f.data + 5, members);
  f.data[7] = pmp_crc8_frame(f.id, f.data, 7u);
  return f;
}
static void vact(vmp_t *v, uint8_t txn, uint8_t a, uint32_t arg, uint32_t now, const mod_tlm_t *m, mod_cmd_t *cmd, pmp_txq_t *q) {
  uint8_t d[8] = { txn, a, 0, 0, 0, 0, 0, 0 }; pmp_put32(d + 2, arg);
  pmp_frame_t f = mk(vmp_id(VMP_P_CMD, 0u, VMP_F_ACTION, v->cfg.addr, 0x01), 8u, d); f.data[7] = pmp_crc8_frame(f.id, f.data, 7u);
  vmp_rx(v, &f, now, m, cmd, q);
}
static void vrw(vmp_t *v, uint8_t fn, uint8_t txn, uint16_t obj, uint32_t val, uint32_t now, const mod_tlm_t *m, mod_cmd_t *cmd, pmp_txq_t *q) {
  uint8_t d[8] = { txn, 0, 0, 0, 0, 0, 0, 0 }; pmp_put16(d + 1, obj); pmp_put32(d + 4, val);
  pmp_frame_t f = mk(vmp_id(VMP_P_SVC, 0u, fn, v->cfg.addr, 0x01), 8u, d);
  vmp_rx(v, &f, now, m, cmd, q);
}
/* the status of the acknowledgement carrying txn for fn (0xFF: none), and the READ_RSP value when there is one */
static uint8_t reply(pmp_txq_t *q, uint8_t txn, uint8_t fn, uint32_t *value) {
  int n = drain(q); uint8_t st = 0xFFu;
  for (int k = 0; k < n; k++) {
    if (fn_of(&out[k]) == VMP_F_ACK && out[k].data[0] == txn && out[k].data[1] == fn) { st = out[k].data[2]; if (value) *value = pmp_get32(out[k].data + 4); }
    if (fn_of(&out[k]) == VMP_F_READ_RSP && out[k].data[0] == txn) { st = VMP_OK; if (value) *value = pmp_get32(out[k].data + 4); }
  }
  return st;
}

static void vmp_tests(void) {
  pmp_txq_t q; mod_cmd_t cmd; mod_tlm_t m = tlm(); vmp_t v;
  memset(&q, 0, sizeof q);

  ck("VMP: identifier layout (priority · native marker · space · function · destination · source)",
     vmp_id(1, 0, VMP_F_CTRL, 0x10, 0x01) == 0x06011001u && vmp_id(6, 1, 0x02, 0xFF, 0x0D) == 0x1B02FF0Du);

  { vsetup(&v, &ID, 0x10, 0, 0, 0); mod_cmd_init(&cmd);
    pmp_frame_t th = mk(0x080610A0u, 8u, (const uint8_t[8]){ 0xAA, 0, 0xa0, 0x0f, 0x10, 0x27, 0, 0 });
    vmp_rx(&v, &th, 50, &m, &cmd, &q);
    pmp_frame_t f1 = vctrl(0x01, 0x10, 1, 0, 1, 400, 100, -1); vmp_rx(&v, &f1, 100, &m, &cmd, &q); vmp_tick(&v, 100, &m, &cmd, &q);
    int held = !cmd.run && v.hold_run && v.owner == 0x01;
    pmp_frame_t f2 = vctrl(0x01, 0x10, 0, 0, 2, 400, 100, -1); vmp_rx(&v, &f2, 200, &m, &cmd, &q);
    pmp_frame_t f3 = vctrl(0x01, 0x10, 1, 0, 3, 400, 100, -1); vmp_rx(&v, &f3, 300, &m, &cmd, &q); vmp_tick(&v, 300, &m, &cmd, &q);
    int ok = cmd.run && fabsf(cmd.v_set_v - 400.0f) < 0.01f && fabsf(cmd.i_set_a - 100.0f) < 0.01f && cmd.p_set_w < 0.0f && cmd.age_ms == 0u;
    drain(&q);
    pmp_frame_t bad = vctrl(0x01, 0x10, 1, 0, 4, 700, 100, -1); bad.data[7] ^= 0x5A; vmp_rx(&v, &bad, 350, &m, &cmd, &q);
    uint8_t st = reply(&q, 0, VMP_F_CTRL, NULL);
    ck("VMP: a TonHe frame is ignored; after boot RUN counts only once RUN = 0 is seen; a CRC failure is NAKed without effect",
       held && ok && st == VMP_E_CRC && fabsf(v.v_set - 400.0f) < 0.01f); }

  { vsetup(&v, &ID, 0x10, 0, 0, 0); mod_cmd_init(&cmd); memset(&q, 0, sizeof q);
    pmp_frame_t a = vctrl(0x01, 0x10, 0, 0, 1, 400, 100, -1), b = vctrl(0x01, 0x10, 1, 0, 2, 400, 100, -1);
    vmp_rx(&v, &a, 100, &m, &cmd, &q); vmp_rx(&v, &b, 200, &m, &cmd, &q);
    for (uint32_t now = 300; now <= 1200; now += 100) vmp_rx(&v, &b, now, &m, &cmd, &q);
    vmp_tick(&v, 1250, &m, &cmd, &q);
    int frozen = cmd.age_ms > 1000u && v.rx_dup >= 9u;
    pmp_frame_t r9 = vctrl(0x01, 0x10, 1, 0, 9, 410, 100, -1), l7 = vctrl(0x01, 0x10, 1, 0, 7, 420, 100, -1), g15 = vctrl(0x01, 0x10, 1, 0, 15, 430, 100, -1);
    vmp_rx(&v, &r9, 1600, &m, &cmd, &q); int resync = fabsf(v.v_set - 410.0f) < 0.01f;
    drain(&q); vmp_rx(&v, &l7, 1650, &m, &cmd, &q); uint8_t st = reply(&q, 0, VMP_F_CTRL, NULL); int late = st == VMP_E_SEQUENCE && fabsf(v.v_set - 410.0f) < 0.01f;
    vmp_rx(&v, &g15, 1700, &m, &cmd, &q); drain(&q);
    ck("VMP: a frozen counter does not keep a module alive; after the timeout any counter resynchronizes; a late frame is NAKed; a gap of 6 is accepted",
       frozen && resync && late && fabsf(v.v_set - 430.0f) < 0.01f); }

  { vsetup(&v, &ID, 0x10, 0, 0, 0); mod_cmd_init(&cmd); memset(&q, 0, sizeof q);
    pmp_frame_t a = vctrl(0x01, 0x10, 0, 0, 1, 400, 100, -1), o = vctrl(0x02, 0x10, 1, 0, 1, 900, 100, -1), o2 = vctrl(0x02, 0x10, 0, 0, 5, 350, 100, -1);
    vmp_rx(&v, &a, 100, &m, &cmd, &q); drain(&q);
    vmp_rx(&v, &o, 250, &m, &cmd, &q);
    int n = drain(&q); const pmp_frame_t *ak = find_fn(n, VMP_F_ACK);
    int nak = ak && ak->data[2] == VMP_E_OWNED && ak->data[3] == 0x01 && fabsf(v.v_set - 400.0f) < 0.01f;
    vmp_tick(&v, 1300, &m, &cmd, &q); vmp_rx(&v, &o2, 1300, &m, &cmd, &q); drain(&q);
    ck("VMP: a second controller is NAKed OWNED while the owner is fresh, and takes over once the owner's stream lapses",
       nak && v.owner == 0x02 && fabsf(v.v_set - 350.0f) < 0.01f); }

  { vsetup(&v, &ID, 0x10, 0, 0, 0); mod_cmd_init(&cmd); memset(&q, 0, sizeof q);
    uint8_t hbA[8] = { 0 }, hbB[8] = { 0 }; pmp_put32(hbA, 0xAAAA0001u); pmp_put32(hbB, 0xBBBB0002u);
    pmp_frame_t ha = mk(vmp_id(VMP_P_FAST, 0u, VMP_F_CTRL_HB, 0xFF, 0x01), 8u, hbA), hb = mk(vmp_id(VMP_P_FAST, 0u, VMP_F_CTRL_HB, 0xFF, 0x01), 8u, hbB);
    pmp_frame_t c1 = vctrl(0x01, 0x10, 0, 0, 1, 400, 100, -1), c2 = vctrl(0x01, 0x10, 1, 0, 2, 400, 100, -1), c3 = vctrl(0x01, 0x10, 1, 0, 3, 400, 100, -1);
    pmp_frame_t c4 = vctrl(0x01, 0x10, 0, 0, 4, 400, 100, -1), c5 = vctrl(0x01, 0x10, 1, 0, 5, 400, 100, -1);
    vmp_rx(&v, &c1, 100, &m, &cmd, &q); vmp_rx(&v, &c2, 200, &m, &cmd, &q); vmp_rx(&v, &ha, 300, &m, &cmd, &q);
    int running = v.run;
    vmp_rx(&v, &hb, 400, &m, &cmd, &q); vmp_rx(&v, &c3, 500, &m, &cmd, &q); int held = !v.run;
    vmp_rx(&v, &c4, 600, &m, &cmd, &q); vmp_rx(&v, &c5, 700, &m, &cmd, &q); drain(&q);
    ck("VMP: a controller restart (new heartbeat session) holds RUN until that controller sends RUN = 0 again", running && held && v.run); }

  { vmp_t g[3]; mod_cmd_t c[3]; int viol = 0, active = 1; memset(&q, 0, sizeof q);
    for (int k = 0; k < 3; k++) { vsetup(&g[k], &ID, (uint8_t)(0x10 + k), 1, (uint8_t)k, 0); mod_cmd_init(&c[k]); }
    float last[3] = { 0 };
    for (uint32_t now = 0; now < 5000u; now++) {
      if (now % 100u == 0u) { pmp_frame_t f = vgroup(0x01, 1, now >= 100u, 0, (uint8_t)(now / 100u), 400, 450, 0x0007); for (int k = 0; k < 3; k++) vmp_rx(&g[k], &f, now, &m, &c[k], &q); }
      float sum = 0.0f;
      for (int k = 0; k < 3; k++) { vmp_tick(&g[k], now, &m, &c[k], &q); last[k] = c[k].grp_deliver ? c[k].grp_share_a : 0.0f; sum += last[k]; }
      if (sum > 450.0f + 0.05f) viol++;
      drain(&q);
    }
    for (int k = 0; k < 3; k++) active &= c[k].grp_active && c[k].run && fabsf(last[k] - 150.0f) < 0.05f;
    int equal = viol == 0 && active;
    for (int k = 0; k < 3; k++) { vsetup(&g[k], &ID, (uint8_t)(0x10 + k), 1, (uint8_t)k, 0); mod_cmd_init(&c[k]); }
    for (uint32_t now = 0; now < 5000u; now++) {
      if (now % 100u == 0u) { pmp_frame_t f = vgroup(0x01, 1, now >= 100u, 1, (uint8_t)(now / 100u), 400, 120, 0x0007); for (int k = 0; k < 3; k++) vmp_rx(&g[k], &f, now, &m, &c[k], &q); }
      for (int k = 0; k < 3; k++) { vmp_tick(&g[k], now, &m, &c[k], &q); last[k] = c[k].grp_deliver ? c[k].grp_share_a : 0.0f; }
      drain(&q);
    }
    int level = fabsf(last[0] - 120.0f) < 0.05f && fabsf(last[2] - 120.0f) < 0.05f;
    pmp_frame_t u0 = vctrl(0x01, 0x10, 0, 0, 1, 350, 60, -1), gf = vgroup(0x01, 1, 1, 1, 1, 400, 120, 0x0007);
    vmp_rx(&g[0], &u0, 5000, &m, &c[0], &q); vmp_rx(&g[0], &gf, 5050, &m, &c[0], &q); vmp_tick(&g[0], 5060, &m, &c[0], &q); drain(&q);
    ck("VMP: GROUP_CTRL EQUAL shares 450 A as 150 A × 3 (never above the request), LEVEL gives each 120 A, unicast control wins over the group",
       equal && level && !c[0].grp_active && fabsf(c[0].v_set_v - 350.0f) < 0.01f && fabsf(c[0].i_set_a - 60.0f) < 0.01f); }

  { vsetup(&v, &ID, 0x10, 0, 0, 0); mod_cmd_init(&cmd); memset(&q, 0, sizeof q); m = tlm();
    uint32_t val = 0;
    vact(&v, 1, VMP_A_CLEAR, 0, 10, &m, &cmd, &q); int clr = reply(&q, 1, VMP_F_ACTION, NULL) == VMP_OK && cmd.clear;
    vact(&v, 2, 0x77, 0, 20, &m, &cmd, &q); int unk = reply(&q, 2, VMP_F_ACTION, NULL) == VMP_E_UNSUPPORTED_ITEM;
    m.rs = MOD_RS_ON; vact(&v, 3, VMP_A_REBOOT, VMP_KEY_REBOOT, 30, &m, &cmd, &q); int rbst = reply(&q, 3, VMP_F_ACTION, NULL) == VMP_E_STATE;
    m.rs = MOD_RS_READY; vact(&v, 4, VMP_A_REBOOT, VMP_KEY_REBOOT, 40, &m, &cmd, &q); int rbok = reply(&q, 4, VMP_F_ACTION, NULL) == VMP_OK && v.reboot_req;
    /* E82 (K-4): STANDBY's post-stop warm-hold keeps the PFC switching well after rs has already dropped to READY.
       Fails without the fix — delivering() alone reads MOD_RS_READY as idle and would let this through as rbok did. */
    m.rs = MOD_RS_READY; m.pfc_en = true; v.reboot_req = false;
    vact(&v, 16, VMP_A_REBOOT, VMP_KEY_REBOOT, 45, &m, &cmd, &q); int rbwarm = reply(&q, 16, VMP_F_ACTION, NULL) == VMP_E_STATE && !v.reboot_req;
    m.pfc_en = false;
    vrw(&v, VMP_F_WRITE, 5, VMP_O_ADDR, 0x20, 50, &m, &cmd, &q); int locked = reply(&q, 5, VMP_F_WRITE, NULL) == VMP_E_LOCKED;
    vact(&v, 6, VMP_A_UNLOCK, 0x1234, 60, &m, &cmd, &q); int key = reply(&q, 6, VMP_F_ACTION, NULL) == VMP_E_KEY;
    vact(&v, 7, VMP_A_UNLOCK, VMP_KEY_UNLOCK, 70, &m, &cmd, &q); int unl = reply(&q, 7, VMP_F_ACTION, NULL) == VMP_OK;
    vrw(&v, VMP_F_WRITE, 8, VMP_O_ADDR, 0x05, 80, &m, &cmd, &q); int range = reply(&q, 8, VMP_F_WRITE, NULL) == VMP_E_RANGE;
    vrw(&v, VMP_F_WRITE, 9, VMP_O_COMM_TO, 50, 90, &m, &cmd, &q); int r2 = reply(&q, 9, VMP_F_WRITE, NULL) == VMP_E_RANGE;
    vrw(&v, VMP_F_WRITE, 10, VMP_O_COMM_TO, 2000, 100, &m, &cmd, &q); int to = reply(&q, 10, VMP_F_WRITE, NULL) == VMP_OK;
    vmp_tick(&v, 101, &m, &cmd, &q); drain(&q); to = to && cmd.timeout_ms == 2000u;
    vrw(&v, VMP_F_READ, 11, VMP_O_V_MAX, 0, 110, &m, &cmd, &q); int vmax = reply(&q, 11, VMP_F_READ, &val) == VMP_OK && val == 10000u;
    vrw(&v, VMP_F_READ, 12, VMP_O_I_RATED, 0, 120, &m, &cmd, &q); int irat = reply(&q, 12, VMP_F_READ, &val) == VMP_OK && val == 3334u;
    vrw(&v, VMP_F_READ, 13, 0x7777, 0, 130, &m, &cmd, &q); int nobj = reply(&q, 13, VMP_F_READ, NULL) == VMP_E_UNSUPPORTED_ITEM;
    vrw(&v, VMP_F_WRITE, 14, VMP_O_PROTO, 1, 140, &m, &cmd, &q); int ro = reply(&q, 14, VMP_F_WRITE, NULL) == VMP_E_READ_ONLY;
    vrw(&v, VMP_F_WRITE, 15, VMP_O_ADDR, 0x20, 150, &m, &cmd, &q); int addr = reply(&q, 15, VMP_F_WRITE, NULL) == VMP_OK && v.cfg.addr == 0x20 && v.nv_dirty;
    ck("VMP: ACTION / READ / WRITE — OK, unsupported, illegal-in-state, locked, bad key, range, read-only, warm-standby PFC still live, and the applied values",
       clr && unk && rbst && rbok && rbwarm && locked && key && unl && range && r2 && to && vmax && irat && nobj && ro && addr); }

  { vsetup(&v, &ID, 0x10, 0, 0, 0); mod_cmd_init(&cmd); memset(&q, 0, sizeof q);
    uint8_t d[8] = { 0 };
    pmp_frame_t uf = mk(vmp_id(VMP_P_SVC, 0u, 0x2A, 0x10, 0x01), 8u, d), bf = mk(vmp_id(VMP_P_SVC, 0u, 0x2A, 0xFF, 0x01), 8u, d);
    vmp_rx(&v, &uf, 10, &m, &cmd, &q); uint8_t st = reply(&q, 0, 0x2A, NULL);
    vmp_rx(&v, &bf, 500, &m, &cmd, &q);
    ck("VMP: an unknown request function is answered UNSUPPORTED when addressed, and silently ignored when broadcast", st == VMP_E_UNSUPPORTED_FUNCTION && drain(&q) == 0); }

  { vsetup(&v, &ID, VMP_ADDR_NULL, 0, 0, 0); mod_cmd_init(&cmd); memset(&q, 0, sizeof q); m = tlm();
    int ann = 0, tel = 0;
    for (uint32_t now = 0; now < 2500u; now++) {
      vmp_tick(&v, now, &m, &cmd, &q); int n = drain(&q);
      for (int k = 0; k < n; k++) { ann += fn_of(&out[k]) == VMP_F_ANNOUNCE && (uint8_t)out[k].id == VMP_ADDR_NULL; tel += fn_of(&out[k]) == VMP_F_TLM_FAST; }
    }
    uint8_t d[8] = { 0 }; pmp_put32(d, 0x11111111u); d[4] = 0x30; d[5] = 2; d[6] = 3;
    pmp_frame_t wrong = mk(vmp_id(VMP_P_SVC, 0u, VMP_F_ADDR_ASSIGN, 0xFF, 0x01), 8u, d); wrong.data[7] = pmp_crc8_frame(wrong.id, wrong.data, 7u);
    vmp_rx(&v, &wrong, 2600, &m, &cmd, &q); int ignored = v.cfg.addr == VMP_ADDR_NULL && drain(&q) == 0;
    pmp_put32(d, ID.uid); pmp_frame_t right = mk(vmp_id(VMP_P_SVC, 0u, VMP_F_ADDR_ASSIGN, 0xFF, 0x01), 8u, d); right.data[7] = pmp_crc8_frame(right.id, right.data, 7u);
    vmp_rx(&v, &right, 2700, &m, &cmd, &q); vmp_tick(&v, 2700, &m, &cmd, &q); int n = drain(&q);
    const pmp_frame_t *ak = find_fn(n, VMP_F_ACK), *an = find_fn(n, VMP_F_ANNOUNCE);
    ck("VMP: an unaddressed module announces once a second and sends no telemetry; ADDR_ASSIGN by UID gives it 0x30 / group 2 / slot 3",
       ann >= 2 && ann <= 4 && tel == 0 && ignored && ak && ak->data[2] == VMP_OK && (uint8_t)ak->id == 0x30 && an && (uint8_t)an->id == 0x30 &&
       v.cfg.group == 2 && v.cfg.slot == 3 && v.nv_dirty); }

  { vmp_t a, b; vsetup(&a, &ID, 0x10, 0, 0, 0); vsetup(&b, &ID2, 0x10, 0, 0, 5000); mod_cmd_init(&cmd); memset(&q, 0, sizeof q);
    uint8_t z[8] = { 0 }; pmp_frame_t tf = mk(vmp_id(VMP_P_FAST, 0u, VMP_F_TLM_FAST, 0xFF, 0x10), 8u, z);
    vmp_rx(&a, &tf, 5000, &m, &cmd, &q); vmp_rx(&b, &tf, 5100, &m, &cmd, &q); drain(&q);
    ck("VMP: on a duplicate address the incumbent keeps it and reports the conflict; the newcomer yields to unaddressed",
       a.conflict && a.cfg.addr == 0x10 && b.cfg.addr == VMP_ADDR_NULL); }

  { vsetup(&v, &ID, 0x10, 0, 0, 0); mod_cmd_init(&cmd); memset(&q, 0, sizeof q); m = tlm(); m.rs = MOD_RS_ON; m.v_out = 400.0f; m.i_out = 100.0f;
    int nfast = 0, t_bits = -1, nev = 0, mono = 1; uint16_t prev = 0; pmp_frame_t fast; memset(&fast, 0, sizeof fast);
    for (uint32_t now = 0; now < 2000u; now++) {
      if (now == 1500u) { m.fault = FC_OUT_OC; m.fault_bits = FB(15); m.fclass = FCL_LATCH; m.rs = MOD_RS_FAULT; }
      vmp_tick(&v, now, &m, &cmd, &q); int n = drain(&q);
      for (int k = 0; k < n; k++) {
        uint8_t fn = fn_of(&out[k]);
        if (fn == VMP_F_TLM_FAST) { if (now >= 1000u) nfast++; fast = out[k]; }
        if (fn == VMP_F_FAULT_BITS && now >= 1500u && t_bits < 0 && (pmp_get32(out[k].data) & (1u << 14))) t_bits = (int)(now - 1500u);
        if (fn == VMP_F_EVENT) { uint16_t e = pmp_get16(out[k].data); if (e <= prev) mono = 0; prev = e; nev++; }
      }
    }
    ck("VMP: TLM_FAST at 20 Hz with V / I / state / flags / fault; FAULT_BITS within 20 ms of a latch; events numbered in order",
       nfast >= 19 && nfast <= 21 && t_bits >= 0 && t_bits <= 20 && nev >= 3 && mono && pmp_get16(fast.data) == 4000u && pmp_get16(fast.data + 2) == 2000u &&
       (fast.data[4] & 0x0F) == MOD_RS_FAULT && (fast.data[5] & 1u) && fast.data[7] == FC_OUT_OC); }

  { vsetup(&v, &ID, 0x10, 0, 0, 0); mod_cmd_init(&cmd); memset(&q, 0, sizeof q); m = tlm();
    m.v_out = NAN; m.i_out = 1e9f; m.t_llc = -1e9f; m.p_avail = INFINITY; m.line_hz = NAN;
    pmp_frame_t fast, th; memset(&fast, 0, sizeof fast); memset(&th, 0, sizeof th);
    for (uint32_t now = 0; now < 1100u; now++) {
      vmp_tick(&v, now, &m, &cmd, &q); int n = drain(&q);
      for (int k = 0; k < n; k++) { if (fn_of(&out[k]) == VMP_F_TLM_FAST) fast = out[k]; if (fn_of(&out[k]) == VMP_F_TLM_THERMAL) th = out[k]; }
    }
    ck("VMP: NaN, ±huge and Inf measurements encode saturated (no undefined conversion); unfitted sensors read −128",
       pmp_get16(fast.data) == 0u && (int16_t)pmp_get16(fast.data + 2) == INT16_MAX && (int8_t)th.data[3] == -127 && (int8_t)th.data[1] == INT8_MIN); }

  { vsetup(&v, &ID, 0x10, 0, 0, 0); mod_cmd_init(&cmd); memset(&q, 0, sizeof q); m = tlm();
    pmp_frame_t a = vctrl(0x01, 0x10, 0, 0, 1, 400, 100, -1); vmp_rx(&v, &a, 100, &m, &cmd, &q); drain(&q);
    pmp_frame_t r3 = vctrl(0x01, 0x10, 1, 0, 2, 800, 100, -1); r3.data[0] |= 0x08; r3.data[7] = pmp_crc8_frame(r3.id, r3.data, 7u);
    vmp_rx(&v, &r3, 200, &m, &cmd, &q); uint8_t s1 = reply(&q, 0, VMP_F_CTRL, NULL);
    pmp_frame_t o3 = vctrl(0x01, 0x10, 1, 3, 2, 800, 100, -1);
    vmp_rx(&v, &o3, 400, &m, &cmd, &q); uint8_t s2 = reply(&q, 0, VMP_F_CTRL, NULL);
    ck("VMP: must-understand — a reserved flag or output mode 3 is NAKed and changes nothing", s1 == VMP_E_RESERVED_BITS && s2 == VMP_E_RESERVED_BITS && fabsf(v.v_set - 400.0f) < 0.01f); }

  { vsetup(&v, &ID, 0x10, 1, 0, 0); mod_cmd_init(&cmd); memset(&q, 0, sizeof q); m = tlm(); srand(4242); int bad = 0;
    for (uint32_t k = 0; k < 1000000u; k++) {
      pmp_frame_t f; f.dlc = (uint8_t)(rand() % 9);
      for (int j = 0; j < 8; j++) f.data[j] = (uint8_t)rand();
      static const uint8_t dsts[4] = { 0x10, 0xE0, 0xFF, 0x33 };
      uint8_t fn = (rand() % 3 == 0) ? (uint8_t)(rand() % 0x20) : (uint8_t)rand();
      uint8_t src = (rand() % 2) ? (uint8_t)(1 + rand() % 15) : (uint8_t)rand();
      f.id = vmp_id((uint8_t)rand(), (uint8_t)(rand() % 8 == 0), fn, dsts[rand() % 4], src);
      if (rand() % 16 == 0) f.id &= ~(1u << 25);
      if (f.dlc == 8u && rand() % 2) f.data[7] = pmp_crc8_frame(f.id, f.data, 7u);
      m.rs = (mod_run_state_t)(rand() % 11); m.i_avail = (float)(rand() % 400); m.i_out = (rand() % 3 == 0) ? NAN : (float)(rand() % 300);
      vmp_rx(&v, &f, k, &m, &cmd, &q);
      if (k % 32u == 0u) { vmp_tick(&v, k, &m, &cmd, &q); drain(&q); }
      if (!isfinite(cmd.v_set_v) || cmd.v_set_v < 0.0f || cmd.v_set_v > 6553.5f || !isfinite(cmd.i_set_a) || cmd.i_set_a < 0.0f || cmd.i_set_a > 3276.75f ||
          cmd.p_set_w > 655350.0f || q.n > PMP_TXQ_LEN || (cmd.run && !(v.cfg.addr >= VMP_ADDR_MOD_MIN && v.cfg.addr <= VMP_ADDR_MOD_MAX))) bad++;
    }
    ck("VMP: 1 M fuzzed frames — no sanitizer trap, commands finite and in range, no RUN without an address, TX queue bounded", bad == 0); }
}

/* ======================================================================== one core behind both profiles */
typedef struct { pmp_fsm_t f; pmp_in_t in; mod_cmd_t cmd; mod_tlm_t m; pmp_ctl_t c; pmp_ctl_cfg_t cc; pmp_txq_t q; } rig_t;

static void rig_init(rig_t *r) {
  memset(r, 0, sizeof *r);
  pmp_fsm_init(&r->f); pmp_fsm_set_rating_kw(&r->f, 50);
  mod_cmd_init(&r->cmd); pmp_ctl_cfg_default(&r->cc, 50); pmp_ctl_init(&r->c);
  r->in.vin_ll = r->in.vin_ll_min = r->in.vin_ll_max = 400.0f; r->in.phases_ok = 3; r->in.vmid_frac = 0.5f; r->in.fan_ok = true; r->in.aux_ok = true; r->in.wdt_ok = true;
  r->in.temp_max_c = 60.0f; r->in.vbus = 400.0f;
  r->m = tlm();
}
/* the HAL's 1 ms sequence after the profile tick: intent → FSM → shaper → telemetry, on a direct-drive plant */
static void rig_step(rig_t *r) {
  pmp_cmd_to_in(&r->cmd, &r->in, &r->f);
  if (r->f.st == ST_PRECHG && r->in.vbus < 1.414f * r->in.vin_ll_max - 5.0f) r->in.vbus += 5.0f;   /* E82: a precharging link stops at the crest */
  if (r->f.out.pfc_en) r->in.vbus = r->f.out.vbus_ref;
  if (r->f.out.llc_en) {
    float b = (r->in.vcmd > 0.0f) ? fminf(r->in.vcmd, r->f.out.v_max) : 0.0f;
    r->in.vbank_a = r->in.vbank_b = (r->f.out.mode == MODE_SER) ? 0.5f * b : b;
    r->in.vout_meas = b - 1.0f; r->in.iout_meas = 50.0f;
  } else r->in.iout_meas = 0.0f;
  pmp_fsm_step(&r->f, &r->in);
  pmp_ctl_in_t ci; pmp_cmd_to_ctl(&r->cmd, &r->f, &r->in, false, &ci); pmp_ctl_step(&r->c, &r->cc, &ci, 1.0e-3f);
  pmp_tlm_from_core(&r->m, &r->f, &r->in, &r->c, &r->cc);
  r->m.v_out = r->in.vout_meas; r->m.i_out = r->in.iout_meas;
}

static void core_tests(void) {
  { pmp_fsm_t f; pmp_fsm_init(&f); pmp_in_t in; memset(&in, 0, sizeof in); mod_cmd_t c; mod_cmd_init(&c);
    c.timeout_ms = 20000u; c.clear = true; c.run = true; c.grp_active = true; c.grp_deliver = false; c.i_set_a = 100.0f; c.grp_share_a = 40.0f;
    pmp_cmd_to_in(&c, &in, &f);
    int a = f.can_to_ms == 20000u && in.clear_req && !c.clear && !in.enable_req && fabsf(in.icmd - 40.0f) < 1e-3f;
    pmp_cmd_to_in(&c, &in, &f);
    ck("glue: the profile's timeout reaches the FSM, pulses are consumed once, a group member without permission is not enabled", a && !in.clear_req); }

  { const pmp_profile_t *th = pmp_profile_get(PMP_PROFILE_TONHE_V12), *na = pmp_profile_get(PMP_PROFILE_NATIVE), *bad = pmp_profile_get((pmp_profile_id_t)9);
    th12_t t; th12_init(&t, 0, 0, 1, 0, 0); mod_cmd_t c; mod_cmd_init(&c); mod_tlm_t m = tlm(); pmp_txq_t q; memset(&q, 0, sizeof q);
    const uint8_t aa[8] = { 0xaa, 0, 0xa0, 0x0f, 0x10, 0x27, 0, 0 }; pmp_frame_t f = mk(0x080601A0u, 8u, aa);
    th->rx(&t, &f, 10, &m, &c, &q); th->tick(&t, 11, &m, &c, &q); drain(&q);
    ck("profiles: registry names and rates, an unbuilt id falls back to native, dispatch through the table reaches the adapter",
       !strcmp(th->name, "tonhe-v1.2") && th->bitrate == 125000u && na->bitrate == 250000u && bad->id == PMP_PROFILE_NATIVE && c.run &&
       fabsf(c.v_set_v - 400.0f) < 0.01f); }

  { rig_t r; rig_init(&r); th12_t t; th12_init(&t, 0, 0, 1, 0, 0);
    const uint8_t aa[8] = { 0xaa, 0, 0xa0, 0x0f, 0x10, 0x27, 0, 0 }, tm[8] = { 0 };
    pmp_frame_t start = mk(0x080601A0u, 8u, aa), timing = mk(0x1805FFA0u, 8u, tm);
    int reached = 0, stopped, again = 0;
    for (uint32_t now = 1; now < 3000u; now++) {
      if (now == 100u) th12_rx(&t, &start, now, &r.m, &r.cmd, &r.q);
      if (now % 1000u == 0u) th12_rx(&t, &timing, now, &r.m, &r.cmd, &r.q);
      th12_tick(&t, now, &r.m, &r.cmd, &r.q); rig_step(&r); drain(&r.q);
      if (r.f.st == ST_RUN) reached = 1;
    }
    const char *st1 = pmp_state_name(r.f.st); int lat1 = r.f.latched;
    for (uint32_t now = 3000; now < 23000u; now++) { th12_tick(&t, now, &r.m, &r.cmd, &r.q); rig_step(&r); drain(&r.q); }
    stopped = r.f.st == ST_STANDBY && !r.f.out.llc_en && r.f.latched == FC_NONE;
    const char *st2 = pmp_state_name(r.f.st); int lat2 = r.f.latched;
    for (uint32_t now = 23000; now < 26000u; now++) {
      if (now == 23000u) th12_rx(&t, &start, now, &r.m, &r.cmd, &r.q);
      th12_tick(&t, now, &r.m, &r.cmd, &r.q); rig_step(&r); drain(&r.q);
      if (r.f.st == ST_RUN) again = 1;
    }
    if (!(reached && stopped && again))
      printf("  detail: reached=%d (%s, F.%d) stopped=%d (%s, F.%d) again=%d (%s, F.%d, need_enable=%d, run=%d, warn=0x%x)\n", reached, st1, lat1,
             stopped, st2, lat2, again, pmp_state_name(r.f.st), (int)r.f.latched, r.f.need_enable, r.cmd.run, (unsigned)r.f.out.warn);
    ck("one core · TonHe V1.2: start command → RUN; 20 s of silence → controlled stop; a new start command → RUN again", reached && stopped && again); }

  { rig_t r; rig_init(&r); vmp_t v; vsetup(&v, &ID, 0x10, 0, 0, 0);
    uint8_t cnt = 0; int reached = 0, stopped, held = 1, rearm = 0, again = 0;
    for (uint32_t now = 1; now < 3000u; now++) {
      if (now % 100u == 0u) { pmp_frame_t f = vctrl(0x01, 0x10, now >= 500u, 0, cnt++, 400, 100, -1); vmp_rx(&v, &f, now, &r.m, &r.cmd, &r.q); }
      vmp_tick(&v, now, &r.m, &r.cmd, &r.q); rig_step(&r); drain(&r.q);
      if (r.f.st == ST_RUN) reached = 1;
    }
    for (uint32_t now = 3000; now < 5000u; now++) { vmp_tick(&v, now, &r.m, &r.cmd, &r.q); rig_step(&r); drain(&r.q); }
    stopped = r.f.st == ST_STANDBY && !r.f.out.llc_en;
    for (uint32_t now = 5000; now < 7000u; now++) {
      if (now % 100u == 0u) { pmp_frame_t f = vctrl(0x01, 0x10, 1, 0, cnt++, 400, 100, -1); vmp_rx(&v, &f, now, &r.m, &r.cmd, &r.q); }
      vmp_tick(&v, now, &r.m, &r.cmd, &r.q); rig_step(&r); drain(&r.q);
      if (r.f.st == ST_RUN) held = 0;
      if (r.m.rearm && (r.m.warn & PMP_W_REARM)) rearm = 1;
    }
    for (uint32_t now = 7000; now < 10000u; now++) {
      if (now % 100u == 0u) { pmp_frame_t f = vctrl(0x01, 0x10, now >= 7300u, 0, cnt++, 400, 100, -1); vmp_rx(&v, &f, now, &r.m, &r.cmd, &r.q); }
      vmp_tick(&v, now, &r.m, &r.cmd, &r.q); rig_step(&r); drain(&r.q);
      if (r.f.st == ST_RUN) again = 1;
    }
    ck("one core · VMP 2.0: RUN → RUN; stream loss → controlled stop; a resumed RUN = 1 stream does not restart it (REARM); RUN 0 → 1 does",
       reached && stopped && held && rearm && again); }
}

int main(void) {
  frame_tests();
  tonhe_tests();
  vmp_tests();
  core_tests();
  printf("\nRESULT: %d/%d checks passed\n", checks - fails, checks);
  return fails ? 1 : 0;
}
