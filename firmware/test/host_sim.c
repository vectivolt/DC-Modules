/* host_sim.c — host-side verification of the PRODUCTION C logic (fsm.c + can_proto.c):
 *   1) the same 26 §36 scenarios as calculations/system/fsm-sim.mjs, against the same 1 ms plant;
 *   2) CAN codec round-trip + range/contradiction rejection;
 *   3) 100k-frame malformed-input fuzz of every decoder (run under ASan/UBSan by run_tests.sh).
 * Build/run: firmware/run_tests.sh */
#include "../core/fsm.h"
#include "../core/can_proto.h"
#include "../core/group.h"
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
  float bankT = o->llc_en ? fminf(vtar / (o->mode == MODE_SER ? 2 : 1), 500) : 0;
  p->bankA += ((o->llc_en ? bankT : p->bankA * 0.995f) - p->bankA) * 0.08f;
  p->bankB += ((o->llc_en ? bankT : p->bankB * 0.995f) - p->bankB) * 0.08f;
  /* a welded K_PARA: paralleled banks track; in SER (KSER closed) it shorts bank A (E67 → F.17 at the soft start) */
  if (s->welded_para) { if (o->mode == MODE_SER && o->k_ser) p->bankA = 0; else p->bankB = p->bankA; }
  float stack = (o->mode == MODE_SER) ? (o->k_ser ? p->bankA + p->bankB : p->bankA)
                                      : (o->k_para ? fmaxf(p->bankA, p->bankB) : p->bankA);
  bool out = s->f.st == ST_RUN || s->f.st == ST_DERATE;             /* E67: the output diode conducts once RUN is entered */
  p->vout = o->llc_en ? fmaxf(stack, s->in.ext_connected ? s->in.vext : 0) : (s->in.ext_connected ? s->in.vext : 0);
  p->iout = (out && o->llc_en) ? fminf(stack / fmaxf(rload, 0.01f), ilim * 1.02f) : 0;
  p->temp += ((o->llc_en ? 40 + 55 * o->derate + (s->in.fan_ok ? 0 : 15) : 40) - p->temp) * 0.002f;
  /* feed measurements */
  s->in.vbus = p->bus;
  s->in.vbank_a = p->bankA; s->in.vbank_b = p->bankB;
  s->in.vout_meas = s->vout_stuck_en ? s->vout_stuck : p->vout;
  s->in.iout_meas = p->iout;
  s->in.temp_max_c = p->temp;
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
static int excl_viol = 0;   /* R5-D: matrix exclusion invariant, checked EVERY tick of EVERY scenario */
static void runsim(sim_t *s, script_fn fn, int ticks) {
  for (s->t = 0; s->t < ticks; s->t++) {
    if (fn) fn(s);
    plant_step(s);
    pmp_fsm_step(&s->f, &s->in);
    /* the hardware UEXCL/UEXCL2 pair enforces this state-wise; firmware must never even ASK
     * for it: KSER commanded together with a parallel-side contact */
    if (s->f.out.k_ser && (s->f.out.k_para || s->f.out.k_parb)) excl_viol++;
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
SCRIPT(sc_start490) { if (s->t == 1) s->in.vcmd = 490; sc_en(s); }
SCRIPT(sc_start510) { if (s->t == 1) s->in.vcmd = 510; sc_en(s); }
/* E67 2-mode convention: forced LOW at a 700 V command runs PAR capped at 500 V; forced HIGH at 450 V is refused; a mode
 * request that arrives while running waits for the next start; AUTO returns to PAR only below 480 V */
SCRIPT(sc_lowforced) { if (s->t == 1) { s->in.vcmd = 700; s->in.omode_req = OMODE_LOW; } sc_en(s); }
SCRIPT(sc_highlow) { if (s->t == 1) { s->in.vcmd = 450; s->in.omode_req = OMODE_HIGH; } sc_en(s); }
SCRIPT(sc_reqrun) { if (s->t == 1) s->in.vcmd = 750; sc_en(s); if (s->t == 1500) s->in.omode_req = OMODE_LOW; }
SCRIPT(sc_hyst) { if (s->t == 1) s->in.vcmd = 510; sc_en(s); if (s->t == 1500) s->in.vcmd = 490; }
SCRIPT(sc_hiline) { if (s->t == 1) { s->in.vin_ll = 475; s->in.vcmd = 300; } sc_en(s); }
SCRIPT(sc_weld) { if (s->t == 1) s->welded_para = true; sc_en(s); if (s->t == 1200) s->in.vcmd = 750; }
/* E65: EV sends its maximum (800 V) as vcmd while the pack sits at 450 V — must start PAR, never SER at bank 225 V */
SCRIPT(sc_extlow) { if (s->t == 1) { s->in.ext_connected = true; s->in.vext = 450; s->in.vcmd = 800; } sc_en(s); s->rload_ovr = 4.5f; }
/* E65: session starts at 300 V (bus ref 650) and the command climbs to 520 V — the reference must follow (830) */
SCRIPT(sc_climb) { if (s->t == 1) s->in.vcmd = 300; sc_en(s); if (s->t == 1800) s->in.vcmd = 495; }
/* E65: a magnetics cutout opens — the T_XFMR channel hits the rail and the guard reports 150 °C */
SCRIPT(sc_ntcopen) { sc_en(s); if (s->t >= 1500) s->p.temp = pmp_ntc_guard_c(70.0f, 0.995f); }
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
  sim_init(&s); runsim(&s, sc_en, 3000);     expect("enable->run PAR", &s, "|RUN|", -1, s.f.out.k_para && s.f.out.k_parb && !s.f.out.k_ser);
  sim_init(&s); runsim(&s, sc_ser, 3000);    expect("enable->run SER 750V", &s, "|RUN|", -1, s.f.out.k_ser);
  sim_init(&s); runsim(&s, sc_steps, 3000);  expect("load steps 0-25-100-25", &s, "|RUN|", -1, s.p.iout < 135);
  sim_init(&s); runsim(&s, sc_cvcc, 3000);   expect("CV->CC->CV", &s, "|RUN|", -1, s.p.iout <= 135);
  sim_init(&s); runsim(&s, sc_open, 3000);   expect("output open", &s, "|RUN|", -1, s.p.iout < 1);
  sim_init(&s); runsim(&s, sc_short, 3000);  expect("output short F.16", &s, "|FAULT|LOCK|", FC_OUT_SHORT, 1);
  sim_init(&s); runsim(&s, sc_extok, 3000);  expect("E67 ext battery: stack meets it through the diode", &s, "|RUN|", -1, s.p.iout > 0);
  sim_init(&s); runsim(&s, sc_extrev, 3000); expect("reverse backfeed F.33", &s, "|FAULT|LOCK|", FC_BACKFEED, 1);
  sim_init(&s); runsim(&s, sc_phloss, 3000); expect("phase loss F.09", &s, "|FAULT|LOCK|", FC_PH_LOSS, 1);
  sim_init(&s); runsim(&s, sc_swell, 3000);  expect("swell F.07", &s, "|FAULT|LOCK|", FC_IN_OV, 1);
  sim_init(&s); runsim(&s, sc_sag, 3000);    expect("sag F.08", &s, "|FAULT|LOCK|", FC_IN_UV, 1);
  sim_init(&s); runsim(&s, sc_busov, 3000);  expect("bus OVP F.03", &s, "|FAULT|LOCK|", FC_BUS_OVP, 1);
  sim_init(&s); runsim(&s, sc_mid, 3000);    expect("midpoint F.06", &s, "|FAULT|LOCK|", FC_MID_IMB, 1);
  sim_init(&s); runsim(&s, sc_modesw, 3000); expect("S/P transition w/ dwell", &s, "|RUN|", -1, s.f.out.mode == MODE_SER && s.f.out.k_ser);
  sim_init(&s); runsim(&s, sc_start490, 3000); expect("E67 start at 490 V selects LOW/PAR", &s, "|RUN|", -1, s.f.out.mode == MODE_PAR && s.f.out.k_para && !s.f.out.k_ser && s.f.out.v_max == 500.0f);
  sim_init(&s); runsim(&s, sc_start510, 3000); expect("E67 start at 510 V selects HIGH/SER (line = 500 V)", &s, "|RUN|", -1, s.f.out.mode == MODE_SER && s.f.out.k_ser && !s.f.out.k_para);
  sim_init(&s); runsim(&s, sc_lowforced, 3000); expect("E67 forced LOW at 700 V runs PAR capped 500 V", &s, "|RUN|", -1, s.f.out.mode == MODE_PAR && s.f.out.v_max == 500.0f && s.p.bankA <= 501.0f);
  sim_init(&s); runsim(&s, sc_highlow, 3000); expect("E67 forced HIGH at 450 V refused (standby)", &s, "|STANDBY|", -1, !s.f.out.llc_en && !s.f.out.k_ser);
  sim_init(&s); runsim(&s, sc_reqrun, 3000); expect("E67 mode request ignored while running", &s, "|RUN|", -1, s.f.out.mode == MODE_SER && s.f.omode == OMODE_AUTO);
  sim_init(&s); runsim(&s, sc_hyst, 3000);   expect("E67 AUTO holds SER at 490 V (return 480 V)", &s, "|RUN|", -1, s.f.out.mode == MODE_SER);
  sim_init(&s); runsim(&s, sc_hiline, 3000); expect("E60 bus floor at 475 VAC >= 1.08*sqrt2*VLL", &s, "|RUN|", -1, s.f.out.vbus_ref >= 1.08f * 1.414f * 475.0f - 0.5f);
  sim_init(&s); runsim(&s, sc_extlow, 3000); expect("E65 vcmd 800 / battery 450 V starts PAR", &s, "|RUN|", -1, s.f.out.mode == MODE_PAR && s.f.out.k_para && !s.f.out.k_ser);
  sim_init(&s); runsim(&s, sc_climb, 3000);  expect("E65 bus ref follows a climbing bank (300 -> 495 V)", &s, "|RUN|", -1, s.f.out.vbus_ref >= 829.0f && s.f.out.mode == MODE_PAR);
  sim_init(&s); runsim(&s, sc_ntcopen, 3000); expect("E65 open NTC/cutout loop F.22", &s, "|FAULT|LOCK|", FC_OT, 1);
  ck("E65 ntc guard passes a healthy -40 C reading", pmp_ntc_guard_c(-40.0f, 0.96f) == -40.0f);
  sim_init(&s); runsim(&s, sc_weld, 3000);   expect("E67 welded K_PARA -> F.17 at the SER soft start", &s, "|FAULT|LOCK|", FC_BANK_IMB, 1);
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
  sim_init(&s); pmp_fsm_set_rating_kw(&s.f, 50);   /* E42: 5000 ms window (16-can link) — open at 4600, latched by 6600 */
  runsim(&s, sc_dstuck, 4600);               expect("stuck discharge, 50 kW window still open", &s, "|DISCH|", -1, s.f.out.q_disch);
  sim_init(&s); pmp_fsm_set_rating_kw(&s.f, 50);
  runsim(&s, sc_dstuck, 6600);               expect("stuck discharge, 50 kW window F.21", &s, "|FAULT|LOCK|", FC_DISCH, 1);
  sim_init(&s); pmp_fsm_set_rating_kw(&s.f, 50);
  checks++; if (s.f.oc_line_a != 195.0f || s.f.oc_tank_a != 220.0f) { fails++; puts("FAIL E67 50 kW OC classes"); } else puts("PASS E67 50 kW OC classes 195/220 A pk");
  pmp_fsm_set_rating_kw(&s.f, 40);
  checks++; if (s.f.oc_line_a != 155.0f || s.f.oc_tank_a != 180.0f) { fails++; puts("FAIL E67 40 kW OC classes"); } else puts("PASS E67 40 kW OC classes 155/180 A pk");
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

  /* ---- E66 group share law: 3 module nodes on ONE GROUP_SET stream from the charger controller (no CSU) ---- */
  {
    pmp_group_t g[3]; pmp_group_out_t go[3];
    for (int k = 0; k < 3; k++) pmp_group_init(&g[k]);
    const uint8_t addr[3] = { 0x40, 0x41, 0x42 };
    const uint32_t cap = 1670;                                /* 167.0 A per 50 kW module */
    uint32_t first_deliver[3] = { 0, 0, 0 }; int viol = 0, stale_ok = 1;
    uint32_t max_sum = 0;
    for (uint32_t t = 0; t < 14000; t++) {
      pmp_group_set_t m = { .v_set_dv = 4000, .i_req_da = 4500, .members = 0x7, .base = 0x40 };
      if (t >= 5000 && t < 8000) m.members = 0x3;             /* controller drops node 2 (its STATUS went silent) */
      if (t % 100 == 0) for (int k = 0; k < 3; k++) {
        bool rx = !(k == 2 && t >= 5000 && t < 8000)         /* node 2 partitioned while dropped */
               && !(k == 1 && t >= 8000 && t < 9400);         /* node 1 misses every frame across the re-join */
        if (rx) pmp_group_frame(&g[k], &m, addr[k], t);
      }
      uint32_t sum = 0;
      for (int k = 0; k < 3; k++) {
        pmp_group_step(&g[k], addr[k], cap, t, &go[k]);
        sum += go[k].i_set_da;
        if (go[k].deliver && !first_deliver[k]) first_deliver[k] = t;
      }
      if (sum > 4500) viol++;
      if (sum > max_sum) max_sum = sum;
      if (t == 9300 && go[1].i_set_da != 0) stale_ok = 0;     /* node 1 stale since 9000 → zero */
    }
    ck("group: sum of shares never exceeds I_req (join, drop, partition, re-join)", viol == 0);
    ck("group: staggered first delivery by rank >= 300 ms", first_deliver[0] >= PMP_GRP_HOLD_MS && first_deliver[1] >= first_deliver[0] + PMP_GRP_STAGGER_MS && first_deliver[2] >= first_deliver[1] + PMP_GRP_STAGGER_MS);
    ck("group: equal share 450 A / 3 = 150 A at full membership", max_sum == 4500);
    ck("group: node missing frames > 1 s goes to zero", stale_ok);
    { pmp_group_t a; pmp_group_out_t ao; pmp_group_init(&a);
      pmp_group_set_t m2 = { .v_set_dv = 4000, .i_req_da = 4500, .members = 0x3, .base = 0x40 };
      for (uint32_t t = 0; t < 4000; t++) { if (t % 100 == 0) pmp_group_frame(&a, &m2, 0x40, t); pmp_group_step(&a, 0x40, 1670, t, &ao); }
      ck("group: 2-node share clamps at the module cap (225 A req -> 167 A)", ao.deliver && ao.i_set_da == 1670); }
    { pmp_group_t a; pmp_group_out_t ao; pmp_group_init(&a);
      pmp_group_set_t m3 = { .v_set_dv = 4000, .i_req_da = 3000, .members = 0x5, .base = 0x40 };
      for (uint32_t t = 0; t < 4000; t++) { if (t % 100 == 0) pmp_group_frame(&a, &m3, 0x41, t); pmp_group_step(&a, 0x41, 1670, t, &ao); }
      ck("group: non-member never delivers", !ao.deliver && ao.i_set_da == 0); }
    { uint8_t b8[8]; pmp_group_set_t e = { 7500, 4500, 0x7, 0x40 }, d; pmp_enc_group_set(b8, &e);
      ck("can GROUP_SET roundtrip + guards", pmp_dec_group_set(b8, 8, &d) && d.i_req_da == 4500 && d.members == 7 && d.base == 0x40 && !pmp_dec_group_set(b8, 7, &d)); }
    for (int i = 0; i < 100000; i++) { uint8_t fb[8]; for (int k = 0; k < 8; k++) fb[k] = (uint8_t)rand(); pmp_group_set_t d; pmp_dec_group_set(fb, (uint8_t)(rand() % 10), &d); }
  }
  (void)buf;
  ck("matrix exclusion invariant (no KSER+KPAR/KPRE tick, all scenarios)", excl_viol == 0);
  printf("\nRESULT: %d/%d checks passed\n", checks - fails, checks);
  return fails ? 1 : 0;
}
