/* host_sim.c — host-side verification of the PRODUCTION supervisory logic (fsm.c + group.c):
 *   1) the same 26 §36 scenarios as calculations/system/fsm-sim.mjs, against the same 1 ms plant (relay mirror
 *      contacts follow their coils, so F.19 is live in every scenario);
 *   2) the row-by-row regression checks and the every-tick invariants;
 *   3) the group share law on three nodes.
 * The wire codecs live in firmware/proto/ (VMP 2.0 + TonHe V1.2) and are verified by test/proto_test.c.
 * Build/run: firmware/run_tests.sh */
#include "../core/fsm.h"
#include "../core/group.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

typedef struct {                 /* behavioral plant, mirrors fsm-sim.mjs 1 ms model */
  float bus, bankA, bankB, temp, vout, iout, prevR;
  float voutc;                   /* the 9.4 uF terminal capacitors behind DOUT (tau ~36 s on the divider) */
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
  float bank_clamp;              /* >0 stalls the LLC plant at this bank voltage (start-stall scenarios) */
  bool saw_bleed;                /* q_disch_bk observed asserted during the run */
} sim_t;

static void sim_init(sim_t *s) {
  memset(s, 0, sizeof *s);
  pmp_fsm_init(&s->f);
  s->in.vin_ll = s->in.vin_ll_min = s->in.vin_ll_max = 400; s->in.phases_ok = 3; s->in.vmid_frac = 0.5f;
  s->in.fan_ok = true; s->in.aux_ok = true; s->in.wdt_ok = true;
  s->in.vcmd = 400; s->in.icmd = 100;
  s->p.temp = 60; s->rload_ovr = 0;
  s->in.relay_fb_wired = PMP_RLY_PRE | PMP_RLY_SER | PMP_RLY_PARA | PMP_RLY_PARB;   /* F.19 live in every scenario */
}

static void plant_step(sim_t *s) {
  pmp_out_t *o = &s->f.out;
  plant_t *p = &s->p;
  /* bus — the plant tracks the COMMANDED reference, not a fixed 800 V: a fixed bus masks a
     "vbus > 700" startup gate for every sub-700 V reference (a 650 V reference parks the
     module in STANDBY forever). */
  if (s->f.st == ST_PRECHG) p->bus += (s->in.vin_ll * 1.414f - p->bus) * 0.012f;
  if (o->pfc_en && s->in.aux_ok) p->bus += (o->vbus_ref - p->bus) * 0.05f;
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
  if (s->bank_clamp > 0) bankT = fminf(bankT, s->bank_clamp);       /* stalled-start knob */
  if (o->llc_en) {
    p->bankA += (bankT - p->bankA) * 0.08f;
    p->bankB += (bankT - p->bankB) * 0.08f;
  } else {
    /* honest bank decay — commanded bleeders tau ~175 ms; PASSIVE decay is the 3.8 MOhm sense
       divider (tau ~75 s); a faster shortcut here would hide retained charge */
    float d = o->q_disch_bk ? 0.9943f : 0.999987f;
    p->bankA *= d; p->bankB *= d;
  }
  if (o->q_disch_bk) s->saw_bleed = true;
  /* a welded K_PARA: paralleled banks track; in SER (KSER closed) it shorts bank A (F.17 at the soft start) */
  if (s->welded_para) { if (o->mode == MODE_SER && o->k_ser) p->bankA = 0; else p->bankB = p->bankA; }
  /* the stack follows the RELAY TOPOLOGY and the diode conducts on PHYSICS — keying conduction
     on the FSM being in RUN is wrong, because a passive diode does not wait for the software.
     Output node = battery when connected (stiff), else the terminal capacitors, which charge
     through DOUT whenever the stack exceeds them and decay tau ~36 s. */
  float stack = o->k_ser ? p->bankA + p->bankB
              : ((o->k_para || o->k_parb) ? fmaxf(p->bankA, p->bankB) : 0);
  bool out = s->f.st == ST_RUN || s->f.st == ST_DERATE;
  if (stack - 1.0f > p->voutc) p->voutc = stack - 1.0f;              /* diode charges the node up */
  else if (out && o->llc_en) p->voutc = fmaxf(stack - 1.0f, 0.0f);   /* a connected load pulls it down with the stack */
  /* the terminal node carries the passive 450 kOhm bleeder (tau ~4.2 s:
     1000 V -> 60 V in ~12 s). Before it, only the 3.8 MOhm sense divider drained the node (tau ~36 s, the old
     0.000028f here) and the studs stayed live for minutes after a "completed" discharge. */
  else p->voutc -= p->voutc * 0.000238f;
  float node = s->in.ext_connected ? s->in.vext : p->voutc;
  p->vout = fmaxf(stack - 1.0f, node);
  p->iout = (out && o->llc_en) ? fminf(stack / fmaxf(rload, 0.01f), ilim * 1.02f) : 0;
  p->temp += ((o->llc_en ? 40 + 55 * o->derate + (s->in.fan_ok ? 0 : 15) : 40) - p->temp) * 0.002f;
  /* feed measurements */
  s->in.vbus = p->bus;
  s->in.vbank_a = p->bankA; s->in.vbank_b = p->bankB;
  s->in.vout_meas = s->vout_stuck_en ? s->vout_stuck : p->vout;
  s->in.iout_meas = p->iout;
  s->in.temp_max_c = p->temp;
  s->in.relay_fb = pmp_relay_cmd(o);   /* ideal mirror contacts, one tick behind the coil command */
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
static int excl_viol = 0;   /* matrix exclusion invariant, checked EVERY tick of EVERY scenario */
static int surge_viol = 0;  /* a matrix contact must never MAKE with the new stack
                               above the output node — that forward-biases DOUT through the closing
                               contact (film-bank dump, weld class). Checked at every close edge. */
static int aux_viol = 0;    /* aux_ok false must mean no conversion enable, every tick */
static void runsim(sim_t *s, script_fn fn, int ticks) {
  for (s->t = 0; s->t < ticks; s->t++) {
    bool pk_ser = s->f.out.k_ser, pk_pa = s->f.out.k_para, pk_pb = s->f.out.k_parb;
    if (fn) fn(s);
    plant_step(s);
    pmp_fsm_step(&s->f, &s->in);
    /* the hardware UEXCL/UEXCL2 pair enforces this state-wise; firmware must never even ASK
     * for it: KSER commanded together with a parallel-side contact */
    if (s->f.out.k_ser && (s->f.out.k_para || s->f.out.k_parb)) excl_viol++;
    if ((s->f.out.k_ser && !pk_ser) || (s->f.out.k_para && !pk_pa) || (s->f.out.k_parb && !pk_pb)) {
      float st_new = s->f.out.k_ser ? s->p.bankA + s->p.bankB : fmaxf(s->p.bankA, s->p.bankB);
      float node = s->in.ext_connected ? s->in.vext : s->p.voutc;
      if (st_new - 1.0f > node + 25.0f) surge_viol++;
    }
    if (!s->in.aux_ok && (s->f.out.pfc_en || s->f.out.llc_en)) aux_viol++;
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
SCRIPT(sc_swell) { sc_en(s); if (s->t == 1500) s->in.vin_ll = s->in.vin_ll_min = s->in.vin_ll_max = 505; }
SCRIPT(sc_sag) { sc_en(s); if (s->t == 1500) s->in.vin_ll = s->in.vin_ll_min = s->in.vin_ll_max = 250; }
SCRIPT(sc_busov) { sc_en(s); if (s->t == 1500) s->p.bus = 870; }
SCRIPT(sc_mid) { sc_en(s); if (s->t == 1500) s->in.vmid_frac = 0.44f; }
SCRIPT(sc_modesw) { sc_en(s); if (s->t == 1200) s->in.vcmd = 750; }
SCRIPT(sc_start490) { if (s->t == 1) s->in.vcmd = 490; sc_en(s); }
SCRIPT(sc_start510) { if (s->t == 1) s->in.vcmd = 510; sc_en(s); }
/* 2-mode convention: forced LOW at a 700 V command runs PAR capped at 500 V; forced HIGH at 450 V is refused; a mode
 * request that arrives while running waits for the next start; AUTO returns to PAR only below 480 V */
SCRIPT(sc_lowforced) { if (s->t == 1) { s->in.vcmd = 700; s->in.omode_req = OMODE_LOW; } sc_en(s); }
SCRIPT(sc_highlow) { if (s->t == 1) { s->in.vcmd = 450; s->in.omode_req = OMODE_HIGH; } sc_en(s); }
SCRIPT(sc_reqrun) { if (s->t == 1) s->in.vcmd = 750; sc_en(s); if (s->t == 1500) s->in.omode_req = OMODE_LOW; }
SCRIPT(sc_hyst) { if (s->t == 1) s->in.vcmd = 510; sc_en(s); if (s->t == 1500) s->in.vcmd = 490; }
SCRIPT(sc_hiline) { if (s->t == 1) { s->in.vin_ll = s->in.vin_ll_min = s->in.vin_ll_max = 475; s->in.vcmd = 300; } sc_en(s); }
SCRIPT(sc_weld) { if (s->t == 1) s->welded_para = true; sc_en(s); if (s->t == 1200) s->in.vcmd = 750; }
/* EV sends its maximum (800 V) as vcmd while the pack sits at 450 V — must start PAR, never SER at bank 225 V */
SCRIPT(sc_extlow) { if (s->t == 1) { s->in.ext_connected = true; s->in.vext = 450; s->in.vcmd = 800; } sc_en(s); s->rload_ovr = 4.5f; }
/* session starts at 300 V (bus ref 650) and the command climbs to 520 V — the reference must follow (830) */
SCRIPT(sc_climb) { if (s->t == 1) s->in.vcmd = 300; sc_en(s); if (s->t == 1800) s->in.vcmd = 495; }
/* a magnetics cutout opens — the T_XFMR channel hits the rail and the guard reports 150 °C */
SCRIPT(sc_ntcopen) { sc_en(s); if (s->t >= 1500) s->p.temp = pmp_ntc_guard_c(70.0f, 0.995f); }
SCRIPT(sc_fan) { sc_en(s); if (s->t == 1500) s->in.fan_ok = false; }
SCRIPT(sc_ot) { sc_en(s); if (s->t == 1500) s->p.temp = 118; }
SCRIPT(sc_sensor) { sc_en(s); if (s->t == 1600) { s->vout_stuck_en = true; s->vout_stuck = 12; } }
SCRIPT(sc_aux) { sc_en(s); if (s->t == 1500) s->in.aux_ok = false; }
SCRIPT(sc_desat) { sc_en(s); if (s->t == 1500) s->in.desat_flt = true; }
/* the precharge-bypass inrush trips the F.01 comparator for a few ms after k_pre closes — blanked, and no PFC enable inside */
static int blank_hits = 0, pfc_in_blank = 0;
SCRIPT(sc_inrush) { if (s->t == 1) { blank_hits = 0; pfc_in_blank = 0; s->in.enable_req = true; }
  if (s->f.out.k_pre && s->f.pre_blank_ms > 5) { s->in.oc_pfc_flt = true; blank_hits++; if (s->f.out.pfc_en) pfc_in_blank++; } }
SCRIPT(sc_ocpfc) { sc_en(s); if (s->t == 1500) s->in.oc_pfc_flt = true; }
SCRIPT(sc_wdt) { sc_en(s); if (s->t == 1500) s->in.wdt_ok = false; }
SCRIPT(sc_canto) { sc_en(s); if (s->t > 900) s->in.can_age_ms += 2; }
SCRIPT(sc_link) { sc_en(s); if (s->t > 1500) s->in.link_age_ms += 2; }
/* shutdown through the PUBLIC input, never by writing s->f.st */
SCRIPT(sc_shut) { sc_en(s); if (s->t == 1200) s->in.shutdown_req = true; }
/* F.21 rating plumbing (card strap, one image): the link falls at 50 V/s — too slowly to finish inside any window, but
   fast enough that it IS discharging, so only the rating window can end it (the stall rule stays out of it) */
SCRIPT(sc_dstuck) { sc_en(s); if (s->t == 100) s->in.shutdown_req = true; if (s->t > 100) s->p.bus += 6.95f; }
/* the AC is still applied, so the permanent precharge path holds the link where the 640 Ohm dump chain
   balances it — the link does not move and each 25 W RDIS part carries ~154 W for the whole window */
SCRIPT(sc_dpinned) { sc_en(s); if (s->t == 100) s->in.shutdown_req = true; if (s->t > 100) s->p.bus = 300; }
/* -------- adversarial set: counterexamples that a naive core fails -------- */
SCRIPT(sc_lowv) { if (s->t == 1) s->in.vcmd = 300; sc_en(s); }                     /* 650 V reference must start */
SCRIPT(sc_servlow) { if (s->t == 1) s->in.vcmd = 560; sc_en(s); }                  /* SER at ref < 700 must start */
SCRIPT(sc_stop) { sc_en(s); if (s->t == 1500) s->in.enable_req = false; if (s->t == 2200) s->in.enable_req = true; }
SCRIPT(sc_otcan) { sc_en(s); if (s->t == 1500) { s->p.temp = 118; s->in.can_age_ms = 5000; } }   /* same-tick OT + CAN loss */
SCRIPT(sc_flipmid) { if (s->t == 1) { s->in.vcmd = 400; s->in.omode_req = OMODE_LOW; } sc_en(s);
  /* flip DURING the soft-start — triggered by the observed state (LLC on, still STANDBY), not a tick guess */
  if (s->f.out.llc_en && s->f.st == ST_STANDBY && s->in.omode_req == OMODE_LOW) s->in.omode_req = OMODE_HIGH; }
SCRIPT(sc_stallot) { if (s->t == 1) s->bank_clamp = 5; sc_en(s); if (s->t == 2500) s->p.temp = 130; }   /* a stalled start must obey OT */
SCRIPT(sc_stall) { if (s->t == 1) s->bank_clamp = 5; sc_en(s); }                   /* F.34: stalled start times out */
SCRIPT(sc_auxstart) { sc_en(s); if (s->t == 640) s->in.aux_ok = false; }           /* aux drop mid-start stays off */
SCRIPT(sc_fanrec) { sc_en(s); if (s->t == 1500) s->in.fan_ok = false; if (s->t == 2200) s->in.fan_ok = true; }  /* fan recovery */
SCRIPT(sc_xbatt) { if (s->t == 1) { s->in.ext_connected = true; s->in.vext = 460; s->in.vcmd = 800; s->rload_ovr = 5; } sc_en(s);
  if (s->t > 1000 && s->in.vext < 540) s->in.vext += 0.05f; }                      /* battery climbs through 500 V */
SCRIPT(sc_lock) {
  sc_en(s);
  if (s->t >= 600 && s->t < 2400 && s->t % 300 == 0) s->in.desat_flt = true;
  /* re-arm through the PUBLIC contract — drop enable for one tick after the clear. Reaching
     into the struct to clear need_enable would hide whether the core clears it at all, i.e.
     whether a field module can restart after a fault clear. */
  if (s->t > 600 && s->t % 300 == 150) { s->in.clear_req = true; s->in.enable_req = false; }
  if (s->t > 600 && s->t % 300 == 152) { s->in.enable_req = true; }
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
  sim_init(&s); runsim(&s, sc_extok, 3000);  expect("ext battery: stack meets it through the diode", &s, "|RUN|", -1, s.p.iout > 0);
  sim_init(&s); runsim(&s, sc_extrev, 3000); expect("reverse backfeed F.33", &s, "|FAULT|LOCK|", FC_BACKFEED, 1);
  sim_init(&s); runsim(&s, sc_phloss, 3000); expect("phase loss F.09", &s, "|FAULT|LOCK|", FC_PH_LOSS, 1);
  sim_init(&s); runsim(&s, sc_swell, 3000);  expect("swell F.07", &s, "|FAULT|LOCK|", FC_IN_OV, 1);
  sim_init(&s); runsim(&s, sc_sag, 3000);    expect("sag F.08", &s, "|FAULT|LOCK|", FC_IN_UV, 1);
  sim_init(&s); runsim(&s, sc_busov, 3000);  expect("bus OVP F.03", &s, "|FAULT|LOCK|", FC_BUS_OVP, 1);
  sim_init(&s); runsim(&s, sc_mid, 3000);    expect("midpoint F.06 → F.38 (at 800 V a 48 V imbalance is also a 448 V half — the LATCH row wins)", &s, "|FAULT|LOCK|", FC_HALF_OV, 1);
  sim_init(&s); runsim(&s, sc_modesw, 3000); expect("S/P transition w/ dwell", &s, "|RUN|", -1, s.f.out.mode == MODE_SER && s.f.out.k_ser);
  sim_init(&s); runsim(&s, sc_start490, 3000); expect("start at 490 V selects LOW/PAR", &s, "|RUN|", -1, s.f.out.mode == MODE_PAR && s.f.out.k_para && !s.f.out.k_ser && s.f.out.v_max == 500.0f);
  sim_init(&s); runsim(&s, sc_start510, 3000); expect("start at 510 V selects HIGH/SER (line = 500 V)", &s, "|RUN|", -1, s.f.out.mode == MODE_SER && s.f.out.k_ser && !s.f.out.k_para);
  sim_init(&s); runsim(&s, sc_lowforced, 3000); expect("forced LOW at 700 V runs PAR capped 500 V", &s, "|RUN|", -1, s.f.out.mode == MODE_PAR && s.f.out.v_max == 500.0f && s.p.bankA <= 501.0f);
  sim_init(&s); runsim(&s, sc_highlow, 3000); expect("forced HIGH at 450 V refused (standby)", &s, "|STANDBY|", -1, !s.f.out.llc_en && !s.f.out.k_ser);
  sim_init(&s); runsim(&s, sc_reqrun, 3000); expect("mode request ignored while running", &s, "|RUN|", -1, s.f.out.mode == MODE_SER && s.f.omode == OMODE_AUTO);
  sim_init(&s); runsim(&s, sc_hyst, 3000);   expect("AUTO holds SER at 490 V (return 480 V)", &s, "|RUN|", -1, s.f.out.mode == MODE_SER);
  sim_init(&s); runsim(&s, sc_hiline, 3000); expect("bus floor at 475 VAC >= 1.08*sqrt2*VLL", &s, "|RUN|", -1, s.f.out.vbus_ref >= 1.08f * 1.414f * 475.0f - 0.5f);
  sim_init(&s); runsim(&s, sc_extlow, 3000); expect("vcmd 800 / battery 450 V starts PAR", &s, "|RUN|", -1, s.f.out.mode == MODE_PAR && s.f.out.k_para && !s.f.out.k_ser);
  sim_init(&s); runsim(&s, sc_climb, 3000);  expect("bus ref follows a climbing bank (300 -> 495 V)", &s, "|RUN|", -1, s.f.out.vbus_ref >= 829.0f && s.f.out.mode == MODE_PAR);
  sim_init(&s); runsim(&s, sc_ntcopen, 3000); expect("open NTC/cutout loop F.22", &s, "|FAULT|LOCK|", FC_OT, 1);
  ck("ntc guard passes a healthy -40 C reading", pmp_ntc_guard_c(-40.0f, 0.96f) == -40.0f);
  sim_init(&s); runsim(&s, sc_weld, 3000);   expect("welded K_PARA -> F.17 at the SER soft start", &s, "|FAULT|LOCK|", FC_BANK_IMB, 1);
  sim_init(&s); runsim(&s, sc_fan, 3000);    expect("fan fail derate 50%", &s, "|DERATE|", -1, s.f.out.derate == 0.5f);
  sim_init(&s); runsim(&s, sc_ot, 3000);     expect("OT F.22", &s, "|FAULT|LOCK|", FC_OT, 1);
  sim_init(&s); runsim(&s, sc_sensor, 3000); expect("stuck Vout sensor F.29", &s, "|FAULT|LOCK|", FC_SENSOR, 1);
  sim_init(&s); runsim(&s, sc_aux, 3000);    expect("aux collapse -> SAFE path", &s, "|SAFE|STANDBY|", -1, !s.f.out.pfc_en && !s.f.out.llc_en);
  sim_init(&s); runsim(&s, sc_desat, 3000);  expect("DESAT F.02", &s, "|FAULT|LOCK|", FC_DESAT, 1);
  sim_init(&s); runsim(&s, sc_inrush, 3000); expect("bypass-closure inrush on F.01 is blanked", &s, "|RUN|", -1, blank_hits > 20 && s.f.latched == FC_NONE);
  checks++; if (pfc_in_blank) { fails++; puts("FAIL no PFC enable inside the blank window"); } else puts("PASS no PFC enable inside the blank window");
  sim_init(&s); runsim(&s, sc_ocpfc, 3000);  expect("F.01 line OC while switching latches", &s, "|FAULT|LOCK|", FC_OC_PFC, 1);
  sim_init(&s); runsim(&s, sc_wdt, 3000);    expect("watchdog F.32", &s, "|FAULT|LOCK|", FC_WDT, 1);
  sim_init(&s); runsim(&s, sc_canto, 3000);  expect("CAN timeout -> standby+re-enable", &s, "|STANDBY|", -1, s.f.need_enable);
  sim_init(&s); runsim(&s, sc_link, 3000);   expect("link loss F.27", &s, "|FAULT|LOCK|", FC_LINK, 1);
  /* OFF also waits for the terminal node, which only the 450 kOhm bleeder drains (~8 s from 400 V) */
  sim_init(&s); runsim(&s, sc_shut, 12000);  expect("shutdown discharge <60V (link, banks AND the output node)", &s, "|OFF|", -1,
    s.p.bus < 60 && s.p.voutc < 60);
  sim_init(&s); runsim(&s, sc_lock, 3000);   expect("5 faults -> LOCK", &s, "|LOCK|", -1, s.f.lock);

  /* -------- adversarial set -------- */
  sim_init(&s); runsim(&s, sc_lowv, 3000);   expect("300 V LOW starts at a 650 V reference", &s, "|RUN|", -1,
    s.f.out.llc_en && fabsf(s.p.bus - 650.0f) < 15.0f);
  sim_init(&s); runsim(&s, sc_servlow, 3000); expect("560 V SER starts below the old 700 V gate", &s, "|RUN|", -1,
    s.f.out.k_ser && s.f.out.vbus_ref < 700.0f);
  sim_init(&s); runsim(&s, sc_stop, 2100);   expect("enable release stops to STANDBY", &s, "|STANDBY|", -1, !s.f.out.llc_en);
  sim_init(&s); runsim(&s, sc_stop, 3400);   expect("re-enable after stop returns to RUN", &s, "|RUN|", -1, s.f.out.llc_en);
  sim_init(&s); runsim(&s, sc_otcan, 3000);  expect("same-tick CAN loss cannot downgrade the OT latch", &s, "|FAULT|LOCK|", FC_OT, 1);
  sim_init(&s); runsim(&s, sc_flipmid, 3000); expect("HIGH request mid-LOW-start reconfigures (450 V HIGH then refused, matrix open)", &s, "|STANDBY|", -1,
    !s.f.out.k_para && !s.f.out.k_parb && !s.f.out.k_ser && !s.f.out.llc_en);
  sim_init(&s); runsim(&s, sc_stallot, 4000); expect("stalled energized start obeys OT", &s, "|FAULT|LOCK|", FC_OT, 1);
  sim_init(&s); runsim(&s, sc_stall, 11000); expect("F.34 stalled start latches within the window", &s, "|FAULT|LOCK|", FC_START_TO, 1);
  sim_init(&s); runsim(&s, sc_auxstart, 3000); expect("aux drop mid-start stays disabled", &s, "|STANDBY|SAFE|", -1, !s.f.out.pfc_en && !s.f.out.llc_en);
  ck("aux invariant (no enable while aux_ok=false, all scenarios)", aux_viol == 0);
  /* the recovery is slew-limited (≤ 20 %/s) — 0.5 → 1.0 takes 2.5 s after the fan returns at 2.2 s */
  sim_init(&s); runsim(&s, sc_fanrec, 5000); expect("fan recovery restores derate 1.0 and RUN", &s, "|RUN|", -1, s.f.out.derate == 1.0f);
  sim_init(&s); runsim(&s, sc_xbatt, 9000);  expect("crossover under a live 500 V battery lands in SER", &s, "|RUN|DERATE|", -1,
    s.f.out.k_ser && s.f.out.mode == MODE_SER && s.saw_bleed);


  /* -------- one regression check per protection row (direct drive, no plant) -------- */
  {
    pmp_fsm_t f; pmp_in_t in;
    #define E77_BASE() do { pmp_fsm_init(&f); memset(&in, 0, sizeof in); in.vin_ll = in.vin_ll_min = in.vin_ll_max = 400; in.phases_ok = 3; in.vmid_frac = 0.5f; \
      in.fan_ok = in.aux_ok = in.wdt_ok = true; in.vcmd = 400; in.icmd = 100; in.temp_max_c = 60; in.vbus = 400; } while (0)
    #define E77_STEP(n) do { for (long k_ = 0; k_ < (long)(n); k_++) pmp_fsm_step(&f, &in); } while (0)
    /* drive to RUN at a PAR bank: precharge ramp, the PFC regulates to its reference, banks meet the command */
    #define E77_RUN(vb) do { E77_BASE(); in.vcmd = (vb); for (int t_ = 0; t_ < 4000 && f.st != ST_RUN; t_++) { \
      if (f.st == ST_PRECHG && in.vbus < 1.414f * in.vin_ll_max - 5.0f) in.vbus += 5; if (f.out.pfc_en) in.vbus = f.out.vbus_ref; in.enable_req = t_ > 200; \
      if (f.out.llc_en) { in.vbank_a = in.vbank_b = (vb); in.vout_meas = (vb) - 1; in.iout_meas = 50; } pmp_fsm_step(&f, &in); } } while (0)

    E77_RUN(400); in.icmd = 0; for (int k = 0; k < 40; k++) { in.iout_meas = 50.0f * (1 - k / 40.0f); E77_STEP(1); }
    ck("current setpoint lowered to 0 A during a 40 ms ramp-down: no F.15", f.st == ST_RUN && f.latched == FC_NONE);
    E77_RUN(400); in.iout_meas = 131; E77_STEP(3);
    ck("F.15 fast row: 131 % of rated for 3 ms latches", f.latched == FC_OUT_OC);
    E77_RUN(400); in.iout_meas = 110; E77_STEP(50);
    ck("F.15: 110 % of rated for 50 ms is a CC-loop transient, no latch", f.latched == FC_NONE);
    E77_RUN(400); in.iout_meas = 105; E77_STEP(150);
    ck("F.15 slow row: 105 % of rated for 150 ms latches", f.latched == FC_OUT_OC);
    E77_RUN(400); in.ext_connected = true; in.vext = 480; in.vout_meas = 480; in.vcmd = 400; E77_STEP(300);
    ck("battery 480 V above a 400 V command behind DOUT: no F.13", f.latched == FC_NONE);
    E77_BASE(); for (int t = 0; t < 400; t++) { if (f.st == ST_PRECHG && in.vbus < 1.414f * in.vin_ll_max - 5.0f) in.vbus += 5; E77_STEP(1); }
    in.ext_connected = true; in.vext = 420; in.vout_meas = 420; in.vcmd = 0; in.icmd = 0; in.enable_req = true; E77_STEP(20);
    ck("ENABLE before the first setpoint with a battery present: no F.13", f.latched == FC_NONE);
    E77_RUN(400); in.vbank_a = in.vbank_b = 560; in.vout_meas = 559; E77_STEP(3);
    ck("F.13 firmware mirror: PAR stack above 545 V for 2 ms latches", f.latched == FC_OUT_OVP);
    E77_RUN(400); in.vbank_a = in.vbank_b = 470; in.vout_meas = 469; in.iout_meas = 40; E77_STEP(250);
    ck("F.13 sourcing row: stack 470 V over a 400 V command at 40 A for 250 ms latches", f.latched == FC_OUT_OVP);

    E77_BASE(); in.vin_ll = in.vin_ll_min = in.vin_ll_max = 0; in.vbus = 330; E77_STEP(200);
    ck("AC sense reads 0 in precharge: the bypass never closes, the wait is reported", f.st == ST_PRECHG && !f.out.k_pre && (f.out.warn & PMP_W_LINE_WAIT));
    E77_BASE(); in.vin_ll = in.vin_ll_min = in.vin_ll_max = NAN; in.vbus = 330; E77_STEP(20);
    ck("AC sense NaN in precharge: F.29 instead of a silent park", f.latched == FC_SENSOR);
    E77_RUN(400); in.temp_max_c = NAN; E77_STEP(5);
    ck("temperature NaN in RUN: F.29 (OT and derate would be blind)", f.latched == FC_SENSOR);
    E77_RUN(400); in.vbus = NAN; E77_STEP(5);
    ck("bus voltage NaN in RUN: F.29", f.latched == FC_SENSOR);
    E77_RUN(400); in.temp_max_c = NAN; E77_STEP(2); in.temp_max_c = 60; E77_STEP(20);
    ck("a 2 ms non-finite glitch inside the 3 ms persistence: no latch, reported", f.latched == FC_NONE);
    E77_RUN(400); in.icmd = NAN; in.iout_meas = 400; E77_STEP(5);
    ck("current command NaN keeps F.15 armed (400 A latches)", f.latched == FC_OUT_OC);
    E77_RUN(400); in.icmd = -1; E77_STEP(20);
    ck("negative current command reads as 0 A, no fault", f.latched == FC_NONE);
    E77_BASE(); for (int t = 0; t < 400; t++) { if (f.st == ST_PRECHG && in.vbus < 1.414f * in.vin_ll_max - 5.0f) in.vbus += 5; E77_STEP(1); }
    in.vcmd = NAN; in.enable_req = true; E77_STEP(500);
    ck("voltage command NaN: no start (was: RUN at the 500 V PAR ceiling)", f.st == ST_STANDBY && !f.out.pfc_en && (f.out.warn & PMP_W_NO_SETPOINT));

    E77_RUN(400); in.vin_ll = in.vin_ll_min = in.vin_ll_max = 255; E77_STEP(1); in.vin_ll = in.vin_ll_min = in.vin_ll_max = 400; E77_STEP(5);
    ck("1 ms sag to 255 VAC rides through (row 8: 100 ms)", f.latched == FC_NONE);
    E77_RUN(400); in.vin_ll = in.vin_ll_min = in.vin_ll_max = 255; E77_STEP(99); in.vin_ll = in.vin_ll_min = in.vin_ll_max = 400; E77_STEP(5);
    ck("99 ms sag rides through", f.latched == FC_NONE);
    E77_RUN(400); in.phases_ok = 2; E77_STEP(1); in.phases_ok = 3; E77_STEP(5);
    ck("1 ms phase dropout rides through (row 9: 40 ms)", f.latched == FC_NONE);
    E77_RUN(400); in.vmid_frac = 0.56f; E77_STEP(1); in.vmid_frac = 0.5f; E77_STEP(5);
    ck("1 ms midpoint spike rides through (row 6: 10 ms)", f.latched == FC_NONE);
    E77_RUN(400); in.vbus = 600; E77_STEP(5); in.vbus = f.out.vbus_ref; E77_STEP(5);
    ck("5 ms bus dip below 620 V rides through", f.latched == FC_NONE);
    E77_RUN(400); in.vbus = 600; E77_STEP(12);
    ck("F.05 bus UV in RUN for 10 ms latches (row 5 had no code)", f.latched == FC_BUS_UV);

    { int latches = 0; E77_RUN(400);
      for (int k = 0; k < 6; k++) {
        in.desat_flt = true; E77_STEP(1); in.desat_flt = false; if (f.latched == FC_DESAT) latches++;
        in.enable_req = false; in.clear_req = true; E77_STEP(1); in.clear_req = false;
        for (int t = 0; t < 700000; t++) { E77_STEP(1); if (t > 660000) break; }     /* 11 minutes between faults */
        for (int t = 0; t < 4000 && f.st != ST_RUN; t++) { in.enable_req = true; if (f.out.pfc_en) in.vbus = f.out.vbus_ref;
          if (f.out.llc_en) { in.vbank_a = in.vbank_b = 400; in.vout_meas = 399; in.iout_meas = 50; } E77_STEP(1); }
      }
      ck("F.31 window: six latches 11 min apart never lock — the count decays with the window, it is not a lifetime total", latches == 6 && !f.lock && f.st == ST_RUN); }

    E77_RUN(400); in.enable_req = false; in.iout_meas = 0; E77_STEP(1000);
    int warm = f.out.pfc_en && f.out.k_para;
    E77_STEP(60000);                                                   /* spec: cold 60 s after STOP (not the constant) */
    ck("STOP: warm for the hold, then PFC off and matrix open (standby target)", warm && !f.out.pfc_en && !f.out.k_para && !f.out.k_parb && !f.out.k_ser && (f.out.warn & PMP_W_COLD_STBY));
    in.enable_req = true; for (int t = 0; t < 6000 && f.st != ST_RUN; t++) { if (f.out.pfc_en) in.vbus = f.out.vbus_ref;
      if (f.out.q_disch_bk) { in.vbank_a *= 0.99f; in.vbank_b *= 0.99f; }
      if (f.out.llc_en) { in.vbank_a = in.vbank_b = 400; in.vout_meas = 399; in.iout_meas = 50; } E77_STEP(1); }
    ck("restart from cold standby reaches RUN through the make-permit", f.st == ST_RUN);

    E77_BASE(); for (int t = 0; t < 400; t++) { if (f.st == ST_PRECHG && in.vbus < 1.414f * in.vin_ll_max - 5.0f) in.vbus += 5; E77_STEP(1); }
    in.enable_req = true; for (int t = 0; t < 300 && !f.out.llc_en; t++) { if (f.out.pfc_en) in.vbus = f.out.vbus_ref; E77_STEP(1); }
    int soft = f.out.llc_en; in.enable_req = false; E77_STEP(2);
    ck("STOP during the soft start stops the LLC (was left switching in STANDBY)", soft && !f.out.llc_en && f.st == ST_STANDBY);

    { E77_RUN(400); float last = f.out.derate, max_step_up = 0, max_step_dn = 0;
      for (int t = 0; t < 60000; t++) { in.temp_max_c = 102.5f + 6.0f * (float)sin(t / 3000.0); E77_STEP(1);
        float d = f.out.derate - last; if (d > max_step_up) max_step_up = d; if (-d > max_step_dn) max_step_dn = -d; last = f.out.derate; }
      ck("thermal derate is continuous: no step above 0.03 per ms", max_step_dn < 0.03f && max_step_up < 0.03f); }
    { E77_RUN(400); in.fan_ok = false; E77_STEP(50); float lo = f.out.derate; in.fan_ok = true; E77_STEP(1); float up1 = f.out.derate - lo;
      E77_STEP(1000); float up1s = f.out.derate - lo;
      ck("fan recovery ramps at 20 %/s (a single-tick 0.5 -> 1.0 jump is a current step on the battery)",
         lo <= 0.5f && up1 <= 0.0005f && up1s > 0.15f && up1s < 0.25f); }

    E77_RUN(400); f.lock = true; f.st = ST_LOCK; in.shutdown_req = true; E77_STEP(3);
    ck("shutdown request discharges a locked module (service path)", f.st == ST_DISCH && f.out.q_disch && f.out.q_disch_bk);
    #undef E77_RUN
    #undef E77_STEP
    #undef E77_BASE
  }
  /* -------- core-API checks: runtime rating (card ROLE1 strap -> pmp_fsm_set_rating_kw) -------- */
  sim_init(&s); pmp_fsm_set_rating_kw(&s.f, 30);
  runsim(&s, sc_dstuck, 4500);               expect("stuck discharge, 30 kW window F.21", &s, "|FAULT|LOCK|", FC_DISCH, 1);
  sim_init(&s); pmp_fsm_set_rating_kw(&s.f, 40);   /* 4000 ms window — latched by 5600, not at 3600 */
  runsim(&s, sc_dstuck, 3600);               expect("stuck discharge, 40 kW window still open", &s, "|DISCH|", -1, s.f.out.q_disch);
  sim_init(&s); pmp_fsm_set_rating_kw(&s.f, 40);
  runsim(&s, sc_dstuck, 5600);               expect("stuck discharge, 40 kW window F.21", &s, "|FAULT|LOCK|", FC_DISCH, 1);
  sim_init(&s); pmp_fsm_set_rating_kw(&s.f, 50);   /* 5000 ms window (16-can link) — open at 4600, latched by 6600 */
  runsim(&s, sc_dstuck, 4600);               expect("stuck discharge, 50 kW window still open", &s, "|DISCH|", -1, s.f.out.q_disch);
  sim_init(&s); pmp_fsm_set_rating_kw(&s.f, 50);
  runsim(&s, sc_dstuck, 6600);               expect("stuck discharge, 50 kW window F.21", &s, "|FAULT|LOCK|", FC_DISCH, 1);
  sim_init(&s); pmp_fsm_set_rating_kw(&s.f, 50);
  checks++; if (s.f.oc_line_a != 195.0f || s.f.oc_tank_a != 220.0f) { fails++; puts("FAIL 50 kW OC classes"); } else puts("PASS 50 kW OC classes 195/220 A pk");
  pmp_fsm_set_rating_kw(&s.f, 40);
  checks++; if (s.f.oc_line_a != 155.0f || s.f.oc_tank_a != 180.0f) { fails++; puts("FAIL 40 kW OC classes"); } else puts("PASS 40 kW OC classes 155/180 A pk");
  sim_init(&s); /* no setter: worst-case default window must NOT latch this early */
  runsim(&s, sc_dstuck, 4500);               expect("stuck discharge, default window still open", &s, "|DISCH|", -1, s.f.out.q_disch);
  /* the same rating, but the link is HELD — the dump is stopped at 300 ms of "not falling", not at 5 s */
  sim_init(&s); pmp_fsm_set_rating_kw(&s.f, 50);
  runsim(&s, sc_dpinned, 900);               expect("a held link stops the dump at 300 ms of no fall, not at the 5 s window", &s, "|FAULT|LOCK|", FC_DISCH,
    !s.f.out.q_disch && !s.f.out.q_disch_bk && s.f.disch_ms <= 500);

  /* -------- the protocol-neutral core — profile-owned timeout, controlled stop, recovery classes, relay feedback,
     corrupted state, overrun, the product mode dwell, SAFE hold, WAKE (direct drive, relay mirrors follow their coils) -------- */
  {
    pmp_fsm_t f; pmp_in_t in;
    #define E78_BASE() do { pmp_fsm_init(&f); memset(&in, 0, sizeof in); in.vin_ll = in.vin_ll_min = in.vin_ll_max = 400; in.phases_ok = 3; in.vmid_frac = 0.5f; \
      in.fan_ok = in.aux_ok = in.wdt_ok = true; in.vcmd = 400; in.icmd = 100; in.temp_max_c = 60; in.vbus = 400; } while (0)
    #define E78_STEP(n) do { for (long k_ = 0; k_ < (long)(n); k_++) { in.relay_fb = pmp_relay_cmd(&f.out); pmp_fsm_step(&f, &in); } } while (0)
    #define E78_RUN(vb) do { E78_BASE(); in.relay_fb_wired = 0x0F; in.vcmd = (vb); for (int t_ = 0; t_ < 4000 && f.st != ST_RUN; t_++) { \
      if (f.st == ST_PRECHG && in.vbus < 1.414f * in.vin_ll_max - 5.0f) in.vbus += 5; if (f.out.pfc_en) in.vbus = f.out.vbus_ref; in.enable_req = t_ > 200; \
      if (f.out.llc_en) { in.vbank_a = in.vbank_b = (vb); in.vout_meas = (vb) - 1; in.iout_meas = 50; } E78_STEP(1); } } while (0)
    #define E78_RESTART() do { in.enable_req = false; E78_STEP(1); for (int t_ = 0; t_ < 4000 && f.st != ST_RUN; t_++) { in.enable_req = true; \
      if (f.out.pfc_en) in.vbus = f.out.vbus_ref; if (f.out.llc_en) { in.vbank_a = in.vbank_b = 400; in.vout_meas = 399; in.iout_meas = 50; } E78_STEP(1); } } while (0)

    E78_RUN(400); pmp_fsm_set_comm_timeout_ms(&f, 20000); in.can_age_ms = 15000; E78_STEP(10);
    { int kept = f.st == ST_RUN;
      in.can_age_ms = 20001; E78_STEP(1); int ramp = f.out.stop_ramp && f.out.llc_en && (f.out.warn & PMP_W_STOPPING);
      E78_STEP(101);
      ck("the comm timeout is the profile's: alive at 15 s of 20 s; past it the current ramps out, then STANDBY, PFC off, re-arm",
         kept && ramp && f.st == ST_STANDBY && !f.out.llc_en && !f.out.pfc_en && f.need_enable); }

    E78_RUN(400); in.enable_req = false; E78_STEP(20);
    { int stopping = f.out.stop_ramp && f.st == ST_RUN;
      in.enable_req = true; E78_STEP(1);
      ck("a STOP withdrawn inside the 100 ms ramp continues the session (no restart, no re-arm)", stopping && !f.out.stop_ramp && f.st == ST_RUN && f.out.llc_en); }

    E78_RUN(400); in.enable_req = false; in.iout_meas = 1.0f; E78_STEP(2);
    ck("the controlled stop ends as soon as the output current is below 2 A", f.st == ST_STANDBY && !f.out.llc_en);

    E78_RUN(400); in.vin_ll = in.vin_ll_min = in.vin_ll_max = 250; E78_STEP(110);
    { int lat = f.latched == FC_IN_UV && pmp_fault_class(f.latched) == FCL_AUTO_EXT && (f.out.warn & PMP_W_RECOVERING);
      in.vin_ll = in.vin_ll_min = in.vin_ll_max = 280; E78_STEP(1999); int held = f.st == ST_FAULT;
      E78_STEP(2); int reprech = f.st == ST_PRECHG && !f.out.k_pre;   /* every latch opens the bypass — recovery re-precharges */
      in.vbus = 1.414f * 280.0f - 5.0f; E78_STEP(150);
      ck("an input sag (F.08 AUTO_EXT) clears 2 s after the line is back inside the start window, into STANDBY awaiting a fresh ENABLE, through a fresh precharge",
         lat && held && reprech && f.st == ST_STANDBY && f.out.k_pre && f.latched == FC_NONE && f.need_enable && (f.out.warn & PMP_W_REARM)); }

    { E78_RUN(400); int sags = 0;
      for (int k = 0; k < 8; k++) {
        in.vin_ll = in.vin_ll_min = in.vin_ll_max = 250; E78_STEP(110); if (f.latched == FC_IN_UV) sags++;
        in.vin_ll = in.vin_ll_min = in.vin_ll_max = 400; for (int t = 0; t < 70000 && f.st == ST_FAULT; t++) E78_STEP(1);
        E78_RESTART();
      }
      ck("eight grid sags inside ten minutes never lock the module (AUTO_EXT does not count toward F.31); the hold doubles to 64 s",
         sags == 8 && !f.lock && f.st == ST_RUN && f.rec_hold_ms == 64000u); }

    { E78_RUN(400); int trips = 0;
      for (int k = 0; k < 5 && !f.lock; k++) {
        in.temp_max_c = 118; E78_STEP(2); if (f.latched == FC_OT) trips++;
        in.temp_max_c = 60; for (int t = 0; t < 40000 && f.st == ST_FAULT; t++) E78_STEP(1);
        if (!f.lock) E78_RESTART();
      }
      ck("over-temperature (AUTO_INT) recovers below 100 °C, but five trips inside ten minutes lock the module (F.31)", trips == 5 && f.lock && f.st == ST_LOCK); }

    E78_RUN(400); in.iout_meas = 140; E78_STEP(3);
    { int oc = f.latched == FC_OUT_OC && pmp_fault_class(FC_OUT_OC) == FCL_LATCH;
      in.iout_meas = 0; E78_STEP(70000); int stays = f.st == ST_FAULT;
      in.clear_req = true; E78_STEP(1); in.clear_req = false; int cleared = f.st == ST_PRECHG && f.latched == FC_NONE;   /* CLEAR re-precharges */
      E78_RUN(400); in.vin_ll = in.vin_ll_min = in.vin_ll_max = 250; E78_STEP(110); in.clear_req = true; E78_STEP(5); in.clear_req = false;
      ck("a LATCH row (F.15) waits for CLEAR however long; CLEAR cannot end an AUTO row whose condition is still present",
         oc && stays && cleared && f.st == ST_FAULT && f.latched == FC_IN_UV); }

    { E78_BASE(); in.relay_fb_wired = 0x0F; int pfc_seen = 0;
      for (int t = 0; t < 1000 && f.latched == FC_NONE; t++) {
        if (f.st == ST_PRECHG && in.vbus < 1.414f * in.vin_ll_max - 5.0f) in.vbus += 5;
        in.enable_req = t > 200;
        in.relay_fb = pmp_relay_cmd(&f.out) & (uint8_t)~PMP_RLY_PRE;   /* the bypass contact never closes */
        pmp_fsm_step(&f, &in); if (f.out.pfc_en) pfc_seen = 1;
      }
      ck("a precharge bypass that never closes latches F.19, and the PFC never starts on the precharge resistor", f.latched == FC_RELAY && !pfc_seen); }

    E78_RUN(400);
    { int ok_run = f.st == ST_RUN;
      for (int t = 0; t < 150; t++) { in.relay_fb = pmp_relay_cmd(&f.out) & (uint8_t)~PMP_RLY_PARB; pmp_fsm_step(&f, &in); }
      ck("a matrix contact that drops out while running latches F.19 inside 150 ms", ok_run && f.latched == FC_RELAY); }

    E78_BASE(); E78_STEP(5);
    ck("no relay feedback wired is reported (PMP_W_RELAY_FB_OFF), never silent", (f.out.warn & PMP_W_RELAY_FB_OFF) != 0);

    E78_RUN(400); f.st = (pmp_state_t)77; E78_STEP(1);
    ck("a state value the enum does not define latches F.36 with every enable off", f.latched == FC_INTERNAL && f.st == ST_FAULT && !f.out.pfc_en && !f.out.llc_en);

    E78_RUN(400); in.ctl_overrun = true; E78_STEP(1); in.ctl_overrun = false;
    ck("the HAL's control-overrun verdict latches F.35", f.latched == FC_OVERRUN);


    /* ============================================================ per-line and half-link rows */
    { /* a 280/505/505 V set — a "farthest from 400" scalar chooses 280 and hides the overvoltage */
      E78_RUN(400);
      in.vin_ll = 280; in.vin_ll_min = 280; in.vin_ll_max = 505; E78_STEP(25);
      int ov = f.latched == FC_IN_OV;
      E78_BASE(); in.relay_fb_wired = 0x0F; in.vin_ll = 280; in.vin_ll_min = 280; in.vin_ll_max = 505; E78_STEP(10);
      int wait = f.st == ST_PRECHG && !f.out.k_pre && (f.out.warn & PMP_W_LINE_WAIT);
      ck("280/505/505 V latches F.07 from the HIGHEST line in 20 ms, and precharge refuses the window", ov && wait); }

    { /* one half at 454 V with the total and midpoint rows both satisfied latches F.38 */
      E78_RUN(400);
      in.vbus = 830; in.vmid_frac = 454.0f / 830.0f; E78_STEP(8); int early = f.latched == FC_NONE;
      E78_STEP(4);
      ck("a 454 V half-link (830 V total, 39 V midpoint — inside F.03 and F.06) latches F.38 after 10 ms",
         early && f.latched == FC_HALF_OV); }

    { /* a PFC that never reaches its reference is bounded by F.34 */
      E78_BASE(); in.relay_fb_wired = 0x0F;
      in.enable_req = true; in.relay_fb = PMP_RLY_PRE; in.vbus = 566;
      for (int t_ = 0; t_ < 300 && f.st != ST_STANDBY; t_++) { if (f.st == ST_PRECHG && in.vbus < 1.414f * in.vin_ll_max - 5.0f) in.vbus += 5; E78_STEP(1); }
      long t_latch = -1;
      for (long t_ = 0; t_ < 12000; t_++) { in.relay_fb = pmp_relay_cmd(&f.out); pmp_fsm_step(&f, &in); if (f.latched != FC_NONE) { t_latch = t_; break; } }
      ck("an energized PFC ramp that never reaches 0.95 x ref latches F.34 inside the 8 s window",
         t_latch > 7000 && t_latch <= 8500 && f.latched == FC_START_TO); }

    { /* mismatched banks block the PAR make until the bleeders equalize them */
      E78_BASE(); in.relay_fb_wired = 0x0F; in.relay_fb = PMP_RLY_PRE; in.enable_req = true;
      in.vbus = 700; in.vout_meas = 400; in.ext_connected = true; in.vext = 400;
      in.vbank_a = 300; in.vbank_b = 20;   /* both below the node - the old permit closed here */
      for (int t_ = 0; t_ < 140; t_++) { if (f.out.pfc_en) in.vbus = f.out.vbus_ref; E78_STEP(1); }   /* through the 60 ms bypass blank */
      int blocked = !f.out.k_para && !f.out.k_parb && f.out.q_disch_bk;
      for (int t_ = 0; t_ < 80; t_++) { in.vbank_a *= 0.97f; E78_STEP(1); }   /* the bleeder brings bank A down on its τ, not in a sample */
      in.vbank_a = 30; E78_STEP(3);
      ck("a 280 V bank mismatch holds the PAR make (bleeders on); 10 V of mismatch closes it",
         blocked && f.out.k_para && f.out.k_parb); }

    { /* an undischargeable link (source still applied) latches F.21 and ENDS the dump commands */
      E78_RUN(400); in.shutdown_req = true; E78_STEP(1); in.shutdown_req = false;
      in.vbus = 530; in.vbank_a = in.vbank_b = 30;   /* the precharge path holds the bus: AC not isolated */
      int dumped = 0;
      for (long t_ = 0; t_ < 11000 && f.latched == FC_NONE; t_++) { dumped = f.out.q_disch; E78_STEP(1); }   /* default F.21 window 9 s */
      ck("a bus held up by a live source latches F.21 at the window and turns the dump OFF (isolate upstream, then verify)",
         dumped && f.latched == FC_DISCH && !f.out.q_disch && !f.out.q_disch_bk); }

    { /* the soft start waits out matrix operate + bounce after the close command (no mirror contacts on the matrix) */
      E78_BASE(); in.relay_fb_wired = PMP_RLY_PRE; in.relay_fb = PMP_RLY_PRE; in.enable_req = true;
      in.vbus = 700; in.vout_meas = 0;
      long t_close = -1, t_llc = -1;
      for (long t_ = 0; t_ < 2000 && !f.out.llc_en; t_++) {
        if (f.out.pfc_en) in.vbus = f.out.vbus_ref;
        pmp_fsm_step(&f, &in);
        if (t_close < 0 && (f.out.k_para || f.out.k_parb)) t_close = t_;
        if (t_llc < 0 && f.out.llc_en) t_llc = t_;
      }
      ck("LLC enable trails the matrix close command by the 40 ms settle wait",
         t_close > 0 && t_llc >= t_close + 40 && t_llc <= t_close + 60); }

    { /* fan derate by count - 4-fan SKU: one failed 0.6, two 0.3, three latch F.25 (AUTO_INT) */
      E78_RUN(400); in.fans_total = 4; in.fans_failed = 1; E78_STEP(3000); float d1 = f.out.derate;
      in.fans_failed = 2; E78_STEP(3000); float d2 = f.out.derate;
      in.fans_failed = 3; E78_STEP(5);
      int latched3 = f.latched == FC_FAN && pmp_fault_class(FC_FAN) == FCL_AUTO_INT;
      in.fans_failed = 0; in.fan_ok = true;
      ck("failed-fan derate by count (0.6 / 0.3 on the 4-fan SKU) and F.25 when nothing can run",
         d1 == 0.6f && d2 == 0.3f && latched3); }

    { E78_RUN(400); in.ext_connected = true; int t_sw = -1;
      for (int t = 0; t < 3000; t++) { in.vext = (t < 100) ? 400.0f : 505.0f; in.vout_meas = in.vext; E78_STEP(1); if (t_sw < 0 && f.st == ST_MODESW) t_sw = t; }
      ck("the AUTO crossover waits the 1 s product dwell (the header carried a 30 ms test value)", t_sw >= 1095 && t_sw <= 1110); }

    E78_RUN(400); in.aux_ok = false; E78_STEP(5);
    { int safe = f.st == ST_SAFE && f.need_enable;
      in.aux_ok = true; E78_STEP(499); int hold = f.st == ST_SAFE;
      E78_STEP(2);
      ck("after an aux collapse SAFE ends only after 500 ms of stable aux, and the restart needs a fresh ENABLE", safe && hold && f.st == ST_STANDBY && f.need_enable); }

    E78_RUN(400); in.shutdown_req = true; E78_STEP(1); in.shutdown_req = false; in.vbus = 30; E78_STEP(5);
    { /* the link alone below 60 V is NOT discharged — both banks must be too, nor is it discharged
         while the output studs hold 400 V, and the exit carries a 100 ms persistence */
      int held = f.st == ST_DISCH && f.out.q_disch_bk;
      /* the banks fall on the bleeders (τ ≈ 0.27 s), never by half in a millisecond — a channel that reads that is lying */
      for (int t = 0; t < 120; t++) { in.vbank_a *= 0.97f; in.vbank_b *= 0.97f; E78_STEP(1); }
      in.vbank_a = in.vbank_b = 30; in.vout_meas = 30; E78_STEP(105);
      int off = f.st == ST_OFF && !f.out.q_disch && !f.out.q_disch_bk;
      in.wake_req = true; E78_STEP(1); in.wake_req = false;
      ck("discharge completes only with the link AND both banks below 60 V; WAKE exits OFF through precharge",
         held && off && (f.st == ST_INIT || f.st == ST_PRECHG)); }

    { E78_BASE(); for (int k = 0; k < 300; k++) { in.desat_flt = true; E78_STEP(1); in.desat_flt = false; f.lock = false; f.latched = FC_NONE; f.st = ST_STANDBY; }
      ck("the lifetime latch counter saturates at 255 instead of wrapping", f.fault_count == 255); }
    #undef E78_RESTART
    #undef E78_RUN
    #undef E78_STEP
    #undef E78_BASE
  }

  /* ---- group share law: 3 module nodes on ONE GROUP_SET stream from the charger controller ---- */
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
    /* two membership drops inside one raise-hold — the survivor's grant must wait a FULL hold
       from the SECOND increase, by which time the dropped peer is stale. Granting on the first
       timestamp gives 225 A against a 150 A request for ~0.8 s. */
    { pmp_group_t ga, gb; pmp_group_out_t oa, ob; pmp_group_init(&ga); pmp_group_init(&gb);
      int r08_viol = 0;
      for (uint32_t t = 0; t < 8000; t++) {
        pmp_group_set_t m = { .v_set_dv = 4000, .i_req_da = 1500, .members = 0x7, .base = 0x40 };
        if (t >= 3000) m.members = 0x3;                       /* drop C: target 500 -> 750 */
        if (t >= 3600) m.members = 0x1;                       /* drop B inside A's hold: 750 -> 1500 */
        if (t % 100 == 0) {
          pmp_group_frame(&ga, &m, 0x40, t);
          if (t < 3550) pmp_group_frame(&gb, &m, 0x41, t);    /* B partitioned after the first drop */
        }
        pmp_group_step(&ga, 0x40, 1670, t, &oa);
        pmp_group_step(&gb, 0x41, 1670, t, &ob);
        if (oa.i_set_da + ob.i_set_da > 1500) r08_viol++;
      }
      ck("group: grown raise target restarts the hold (no 225 A vs 150 A window)", r08_viol == 0); }
  }
  ck("matrix exclusion invariant (no KSER+KPAR/KPRE tick, all scenarios)", excl_viol == 0);
  ck("make-permit invariant (no contact ever makes above the output node, all scenarios)", surge_viol == 0);
  printf("\nRESULT: %d/%d checks passed\n", checks - fails, checks);
  return fails ? 1 : 0;
}
