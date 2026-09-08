/* host_sim.c — host-side verification of the PRODUCTION C logic (fsm.c + can_proto.c):
 *   1) the same 26 §36 scenarios as calculations/system/fsm-sim.mjs, against the same 1 ms plant;
 *   2) CAN codec round-trip + range/contradiction rejection;
 *   3) 100k-frame malformed-input fuzz of every decoder (run under ASan/UBSan by run_tests.sh).
 * Build/run: firmware/run_tests.sh */
#include "../core/fsm.h"
#include "../core/can_proto.h"
#include "../core/csu.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

typedef struct {                 /* behavioral plant, mirrors fsm-sim.mjs 1 ms model */
  float bus, bankA, bankB, temp, vout, iout, prevR;
  int transient;
} plant_t;

typedef struct {
  int t;
  pmp_in_t in;
  plant_t p;
  pmp_fsm_t f;
  float rload_ovr;               /* <=0 → derive from vcmd/icmd */
  bool welded_para, vout_stuck_en;
  float vout_stuck;
} sim_t;

static void sim_init(sim_t *s) {
  memset(s, 0, sizeof *s);
  pmp_fsm_init(&s->f);
  s->in.vin_ll = 400; s->in.phases_ok = 3; s->in.vmid_frac = 0.5f;
  s->in.fan_ok = true; s->in.aux_ok = true; s->in.wdt_ok = true;
  s->in.vcmd = 400; s->in.icmd = 100;
  s->p.temp = 60; s->rload_ovr = 0;
}

static void plant_step(sim_t *s) {
  pmp_out_t *o = &s->f.out;
  plant_t *p = &s->p;
  /* bus */
  if (s->f.st == ST_PRECHG) p->bus += (s->in.vin_ll * 1.414f - p->bus) * 0.012f;
  if (o->pfc_en && s->in.aux_ok) p->bus += (800 - p->bus) * 0.05f;
  if (!o->pfc_en && s->f.st != ST_PRECHG && p->bus > 0) p->bus -= (o->q_disch ? 7.0f : 0.15f);
  if (p->bus < 0) p->bus = 0;
  /* CV/CC target drives BANKS (banks are the output) */
  float rload = s->rload_ovr > 0 ? s->rload_ovr : s->in.vcmd / fmaxf(s->in.icmd, 1);
  if (p->prevR > 0 && rload < p->prevR / 5) s->p.transient = 3;
  p->prevR = rload;
  float ilim = s->p.transient > 0 ? s->in.icmd * 1.25f : s->in.icmd;
  if (s->p.transient > 0) s->p.transient--;
  float vtar = fminf(s->in.vcmd, ilim * rload);
  float bankT = o->llc_en ? fminf(vtar / (o->mode == MODE_SER ? 2 : 1), 525) : 0;
  p->bankA += ((o->llc_en ? bankT : p->bankA * 0.995f) - p->bankA) * 0.08f;
  p->bankB += ((o->llc_en ? bankT : p->bankB * 0.995f) - p->bankB) * 0.08f;
  if (s->welded_para) p->bankB = p->bankA;
  float stack = (o->mode == MODE_SER) ? (o->k_ser ? p->bankA + p->bankB : p->bankA)
                                      : (o->k_para ? fmaxf(p->bankA, p->bankB) : p->bankA);
  p->vout = o->k_out ? stack : (s->in.ext_connected ? s->in.vext : 0);
  p->iout = (o->k_out && o->llc_en) ? fminf(stack / fmaxf(rload, 0.01f), ilim * 1.02f) : 0;
  p->temp += ((o->llc_en ? 40 + 55 * o->derate + (s->in.fan_ok ? 0 : 15) : 40) - p->temp) * 0.002f;
  /* feed measurements */
  s->in.vbus = p->bus;
  s->in.vbank_a = p->bankA; s->in.vbank_b = p->bankB;
  s->in.vout_meas = s->vout_stuck_en ? s->vout_stuck : p->vout;
  s->in.iout_meas = p->iout;
  s->in.temp_max_c = p->temp;
  s->in.relay_fb[1] = s->welded_para || o->k_para;   /* PARA readback tracks weld */
  s->in.relay_fb[2] = s->welded_para || o->k_parb;
}

typedef void (*script_fn)(sim_t *s);
static int checks = 0, fails = 0;
static void ck(const char *name, int cond) {
  checks++;
  if (!cond) { fails++; printf("FAIL %-42s\n", name); } else printf("PASS %-42s\n", name);
}
static void expect(const char *name, sim_t *s, const char *states, int code, int cond) {
  checks++;
  char st[16]; snprintf(st, sizeof st, "|%s|", pmp_state_name(s->f.st));
  int okst = strstr(states, st) != NULL;
  int okc = (code < 0) ? 1 : ((int)s->f.latched == code);
  if (!(okst && okc && cond)) {
    fails++;
    printf("FAIL %-42s st=%s latched=%d (want %s code=%d cond=%d)\n",
           name, pmp_state_name(s->f.st), (int)s->f.latched, states, code, cond);
  } else printf("PASS %-42s (%s)\n", name, pmp_state_name(s->f.st));
}
static void runsim(sim_t *s, script_fn fn, int ticks) {
  for (s->t = 0; s->t < ticks; s->t++) {
    if (fn) fn(s);
    plant_step(s);
    pmp_fsm_step(&s->f, &s->in);
    s->in.desat_flt = false; s->in.oc_pfc_flt = false; s->in.clear_req = false; /* read-clear */
  }
}
#define SCRIPT(name) static void name(sim_t *s)

SCRIPT(sc_none) { (void)s; }
SCRIPT(sc_en) { if (s->t == 500) s->in.enable_req = true; }
SCRIPT(sc_ser) { if (s->t == 1) s->in.vcmd = 750; sc_en(s); }
SCRIPT(sc_steps) { sc_en(s); if (s->t == 900) s->rload_ovr = 16; if (s->t == 1200) s->rload_ovr = 4; if (s->t == 1500) s->rload_ovr = 16; }
SCRIPT(sc_cvcc) { sc_en(s); if (s->t == 1000) s->rload_ovr = 2.5f; if (s->t == 1800) s->rload_ovr = 8; }
SCRIPT(sc_open) { sc_en(s); if (s->t == 1200) s->rload_ovr = 1e6f; }
SCRIPT(sc_short) { sc_en(s); if (s->t == 1400) s->rload_ovr = 0.02f; }
SCRIPT(sc_extok) { if (s->t == 1) { s->in.ext_connected = true; s->in.vext = 400; } sc_en(s); }
SCRIPT(sc_extrev) { if (s->t == 1) { s->in.ext_connected = true; s->in.vext = -350; } sc_en(s); }
SCRIPT(sc_phloss) { sc_en(s); if (s->t == 1500) s->in.phases_ok = 2; }
SCRIPT(sc_swell) { sc_en(s); if (s->t == 1500) s->in.vin_ll = 505; }
SCRIPT(sc_sag) { sc_en(s); if (s->t == 1500) s->in.vin_ll = 250; }
SCRIPT(sc_busov) { sc_en(s); if (s->t == 1500) s->p.bus = 870; }
SCRIPT(sc_mid) { sc_en(s); if (s->t == 1500) s->in.vmid_frac = 0.44f; }
SCRIPT(sc_modesw) { sc_en(s); if (s->t == 1200) s->in.vcmd = 750; }
SCRIPT(sc_weld) { if (s->t == 1) s->welded_para = true; sc_en(s); if (s->t == 1200) s->in.vcmd = 750; }
SCRIPT(sc_fan) { sc_en(s); if (s->t == 1500) s->in.fan_ok = false; }
SCRIPT(sc_ot) { sc_en(s); if (s->t == 1500) s->p.temp = 118; }
SCRIPT(sc_sensor) { sc_en(s); if (s->t == 1600) { s->vout_stuck_en = true; s->vout_stuck = 12; } }
SCRIPT(sc_aux) { sc_en(s); if (s->t == 1500) s->in.aux_ok = false; }
SCRIPT(sc_desat) { sc_en(s); if (s->t == 1500) s->in.desat_flt = true; }
SCRIPT(sc_wdt) { sc_en(s); if (s->t == 1500) s->in.wdt_ok = false; }
SCRIPT(sc_canto) { sc_en(s); if (s->t > 900) s->in.can_age_ms += 2; }
SCRIPT(sc_link) { sc_en(s); if (s->t > 1500) s->in.link_age_ms += 2; }
SCRIPT(sc_shut) { sc_en(s); if (s->t == 1200) s->f.st = ST_SHUTDOWN; }
/* F.21 rating plumbing (card strap, one image): bus held up so discharge can never finish */
SCRIPT(sc_dstuck) { sc_en(s); if (s->t == 100) s->f.st = ST_SHUTDOWN; if (s->t > 100) s->p.bus = 300; }
SCRIPT(sc_lock) {
  sc_en(s);
  if (s->t >= 600 && s->t < 2400 && s->t % 300 == 0) s->in.desat_flt = true;
  if (s->t > 600 && s->t % 300 == 150) { s->in.clear_req = true; s->in.enable_req = true; s->f.need_enable = false; }
}

int main(void) {
  sim_t s;
  /* -------- scenarios (mirror fsm-sim.mjs) -------- */
  sim_init(&s); runsim(&s, sc_none, 3000);   expect("power-up->precharge->standby", &s, "|STANDBY|", -1, 1);
  sim_init(&s); runsim(&s, sc_en, 3000);     expect("enable->run PAR", &s, "|RUN|", -1, s.f.out.k_para && s.f.out.k_out);
  sim_init(&s); runsim(&s, sc_ser, 3000);    expect("enable->run SER 750V", &s, "|RUN|", -1, s.f.out.k_ser);
  sim_init(&s); runsim(&s, sc_steps, 3000);  expect("load steps 0-25-100-25", &s, "|RUN|", -1, s.p.iout < 135);
  sim_init(&s); runsim(&s, sc_cvcc, 3000);   expect("CV->CC->CV", &s, "|RUN|", -1, s.p.iout <= 135);
  sim_init(&s); runsim(&s, sc_open, 3000);   expect("output open", &s, "|RUN|", -1, s.p.iout < 1);
  sim_init(&s); runsim(&s, sc_short, 3000);  expect("output short F.16", &s, "|FAULT|LOCK|", FC_OUT_SHORT, 1);
  sim_init(&s); runsim(&s, sc_extok, 3000);  expect("ext battery matched close", &s, "|RUN|", -1, s.f.out.k_out);
  sim_init(&s); runsim(&s, sc_extrev, 3000); expect("reverse backfeed F.33", &s, "|FAULT|LOCK|", FC_BACKFEED, 1);
  sim_init(&s); runsim(&s, sc_phloss, 3000); expect("phase loss F.09", &s, "|FAULT|LOCK|", FC_PH_LOSS, 1);
  sim_init(&s); runsim(&s, sc_swell, 3000);  expect("swell F.07", &s, "|FAULT|LOCK|", FC_IN_OV, 1);
  sim_init(&s); runsim(&s, sc_sag, 3000);    expect("sag F.08", &s, "|FAULT|LOCK|", FC_IN_UV, 1);
  sim_init(&s); runsim(&s, sc_busov, 3000);  expect("bus OVP F.03", &s, "|FAULT|LOCK|", FC_BUS_OVP, 1);
  sim_init(&s); runsim(&s, sc_mid, 3000);    expect("midpoint F.06", &s, "|FAULT|LOCK|", FC_MID_IMB, 1);
  sim_init(&s); runsim(&s, sc_modesw, 3000); expect("S/P transition w/ dwell", &s, "|RUN|", -1, s.f.out.mode == MODE_SER && s.f.out.k_ser);
  sim_init(&s); runsim(&s, sc_weld, 3000);   expect("welded K_PARA F.18", &s, "|FAULT|LOCK|", FC_WELD, 1);
  sim_init(&s); runsim(&s, sc_fan, 3000);    expect("fan fail derate 50%", &s, "|DERATE|", -1, s.f.out.derate == 0.5f);
  sim_init(&s); runsim(&s, sc_ot, 3000);     expect("OT F.22", &s, "|FAULT|LOCK|", FC_OT, 1);
  sim_init(&s); runsim(&s, sc_sensor, 3000); expect("stuck Vout sensor F.29", &s, "|FAULT|LOCK|", FC_SENSOR, 1);
  sim_init(&s); runsim(&s, sc_aux, 3000);    expect("aux collapse -> SAFE path", &s, "|SAFE|STANDBY|", -1, !s.f.out.pfc_en && !s.f.out.llc_en);
  sim_init(&s); runsim(&s, sc_desat, 3000);  expect("DESAT F.02", &s, "|FAULT|LOCK|", FC_DESAT, 1);
  sim_init(&s); runsim(&s, sc_wdt, 3000);    expect("watchdog F.32", &s, "|FAULT|LOCK|", FC_WDT, 1);
  sim_init(&s); runsim(&s, sc_canto, 3000);  expect("CAN timeout -> standby+re-enable", &s, "|STANDBY|", -1, s.f.need_enable);
  sim_init(&s); runsim(&s, sc_link, 3000);   expect("link loss F.27", &s, "|FAULT|LOCK|", FC_LINK, 1);
  sim_init(&s); runsim(&s, sc_shut, 3000);   expect("shutdown discharge <60V", &s, "|OFF|", -1, s.p.bus < 60);
  sim_init(&s); runsim(&s, sc_lock, 3000);   expect("5 faults -> LOCK", &s, "|LOCK|", -1, s.f.lock);

  /* -------- core-API checks: runtime rating (card ROLE1 strap -> pmp_fsm_set_rating_kw) -------- */
  sim_init(&s); pmp_fsm_set_rating_kw(&s.f, 30);
  runsim(&s, sc_dstuck, 4500);               expect("stuck discharge, 30 kW window F.21", &s, "|FAULT|LOCK|", FC_DISCH, 1);
  sim_init(&s); pmp_fsm_set_rating_kw(&s.f, 40);   /* E41: 4000 ms window — latched by 5600, not at 3600 */
  runsim(&s, sc_dstuck, 3600);               expect("stuck discharge, 40 kW window still open", &s, "|DISCH|", -1, s.f.out.q_disch);
  sim_init(&s); pmp_fsm_set_rating_kw(&s.f, 40);
  runsim(&s, sc_dstuck, 5600);               expect("stuck discharge, 40 kW window F.21", &s, "|FAULT|LOCK|", FC_DISCH, 1);
  sim_init(&s); /* no setter: worst-case default window must NOT latch this early */
  runsim(&s, sc_dstuck, 4500);               expect("stuck discharge, default window still open", &s, "|DISCH|", -1, s.f.out.q_disch);

  /* -------- CAN codec round-trip + guards -------- */
  uint8_t buf[8];
  pmp_set_output_t so = { .v_set_mv = 750000, .i_set_ma = 100000 }, so2;
  pmp_enc_set_output(buf, &so);
  checks++; if (!pmp_dec_set_output(buf, 8, &so2) || so2.v_set_mv != 750000 || so2.i_set_ma != 100000) { fails++; puts("FAIL can set_output roundtrip"); } else puts("PASS can set_output roundtrip");
  uint8_t bad[8] = {0}; bad[3] = 0x40;                       /* v = 1.07 GV → reject */
  checks++; if (pmp_dec_set_output(bad, 8, &so2)) { fails++; puts("FAIL can range guard"); } else puts("PASS can range guard");
  checks++; if (pmp_dec_set_output(buf, 7, &so2)) { fails++; puts("FAIL can dlc guard"); } else puts("PASS can dlc guard");
  uint8_t ctl = (1u << 2) | (1u << 3);                       /* force_hv & force_lv */
  pmp_module_ctl_t mc;
  checks++; if (pmp_dec_module_ctl(&ctl, 1, &mc)) { fails++; puts("FAIL can ctl contradiction"); } else puts("PASS can ctl contradiction guard");
  uint32_t id = pmp_can_id(2, PMP_MT_STATUS1, 0x01, 0x40 + 7, 1);
  pmp_can_hdr_t h; pmp_can_id_parse(id, &h);
  checks++; if (h.msgtype != PMP_MT_STATUS1 || h.src != 0x47 || h.dest != 1 || h.group != 1 || h.prio != 2) { fails++; puts("FAIL can id roundtrip"); } else puts("PASS can id roundtrip");
  pmp_status2_t st2 = { .p_avail_10w = 3000, .i_avail_10ma = 10000, .state = 2, .mode = 1, .fault_lo = 0 }, st2b;
  pmp_enc_status2(buf, &st2);
  checks++; if (!pmp_dec_status2(buf, 8, &st2b) || st2b.p_avail_10w != 3000 || st2b.mode != 1) { fails++; puts("FAIL can status2 roundtrip"); } else puts("PASS can status2 roundtrip");

  /* -------- fuzz all decoders (ASan/UBSan-guarded) -------- */
  srand(12345);
  for (int i = 0; i < 100000; i++) {
    uint8_t fb[8]; for (int k = 0; k < 8; k++) fb[k] = (uint8_t)rand();
    uint8_t dlc = (uint8_t)(rand() % 10);
    pmp_dec_set_output(fb, dlc, &so2);
    pmp_dec_module_ctl(fb, dlc, &mc);
    uint32_t v, iq; pmp_dec_status1(fb, dlc, &v, &iq);
    pmp_dec_status2(fb, dlc, &st2b);
    pmp_can_id_parse((uint32_t)rand() << 16 ^ (uint32_t)rand(), &h);
  }
  checks++; puts("PASS decoder fuzz 100k frames (no sanitizer trap)");

  /* ---- CSU (E39): cabinet supervisor — staggered starts, equal share, degrade, estop ---- */
  {
    pmp_csu_t c; pmp_csu_out_t o2;
    pmp_csu_init(&c, 100000); c.i_req_ma = 240000;
    uint32_t en_t[8]; int en_n = 0;
    for (uint32_t t = 0; t < 5000; t++) {
      if (t >= 100) for (uint8_t sc = 0; sc < 4; sc++)
        if (t % 100 == (uint32_t)sc * 10) pmp_csu_hear(&c, (uint8_t)(0x10 + sc), t);
      pmp_csu_step(&c, t, &o2);
      if (o2.enable_idx >= 0 && en_n < 8) en_t[en_n++] = t;
    }
    ck("csu enables all four modules", en_n == 4);
    { int stag = 1; for (int i = 1; i < en_n; i++) if (en_t[i] - en_t[i - 1] < PMP_CSU_STAGGER_MS) stag = 0;
      ck("csu staggers starts >= 300 ms apart", stag); }
    ck("csu waits the settle window first", en_n > 0 && en_t[0] >= 100 + PMP_CSU_SETTLE_MS);
    ck("csu equal share 240 A / 4 = 60 A", o2.i_set_ma == 60000);
    ck("csu reaches RUN", c.st == CSU_RUN);
    uint32_t t2 = 5000;
    for (; t2 < 8000; t2++) {
      for (uint8_t sc = 0; sc < 4; sc++) if (sc != 2 && t2 % 100 == (uint32_t)sc * 10) pmp_csu_hear(&c, (uint8_t)(0x10 + sc), t2);
      pmp_csu_step(&c, t2, &o2);
    }
    ck("csu dropout re-shares 240 A / 3 = 80 A", o2.i_set_ma == 80000 && pmp_csu_alive(&c, t2 - 1) == 3);
    c.i_req_ma = 500000; pmp_csu_step(&c, t2, &o2);
    ck("csu clamps at per-module cap 100 A", o2.i_set_ma == 100000);
    { int re_en = 0;
      for (uint32_t t3 = t2; t3 < t2 + 2000; t3++) {
        for (uint8_t sc = 0; sc < 4; sc++) if (t3 % 100 == (uint32_t)sc * 10) pmp_csu_hear(&c, (uint8_t)(0x10 + sc), t3);
        pmp_csu_step(&c, t3, &o2);
        if (o2.enable_idx == 2) re_en = 1;
      }
      ck("csu re-staggers a returning module", re_en); }
    pmp_csu_estop(&c);
    pmp_csu_step(&c, t2 + 3000, &o2);
    ck("csu estop latches disable broadcast", o2.broadcast_estop && o2.enable_idx < 0 && o2.i_set_ma == 0);
    { pmp_csu_t c1; pmp_csu_init(&c1, 100000); c1.i_req_ma = 240000;
      for (uint32_t t = 100; t < 3000; t++) { if (t % 100 == 0) pmp_csu_hear(&c1, 0x21, t); pmp_csu_step(&c1, t, &o2); }
      ck("csu single-module cabinet: RUN at cap", c1.st == CSU_RUN && o2.i_set_ma == 100000); }
  }
  (void)buf;
  printf("\nRESULT: %d/%d checks passed\n", checks - fails, checks);
  return fails ? 1 : 0;
}
