/* app_test.c — E79 the module application end to end: app_init, the PFC and LLC interrupts at their rates and the 1 ms tick,
 * driving the core, the TonHe V1.2 profile and the HAL modules against averaged plants — grid, precharge path, PFC power, LLC
 * tank gain, bank and terminal nodes behind the output diode, bypass mirror contact, NTCs, fans, a CAN monitor and a RAM flash.
 *   what it proves: the §2 sequence and every cross-context path — boot offsets, configuration and calibration records,
 *   precharge to delivery through a vendor profile, the controlled stop, the attribution of each HRTIMER fault channel, the
 *   HAL's own rows (F.30, F.32, F.35, F.37), the sequenced watchdog, sag ride-through with the bus fold-back, a start into a
 *   node above the setpoint, CAN bus-off recovery and configuration storage
 *   what it does not: control fidelity (firmware/test/hal_test.c) and timing on the MCU (EVT T-44)
 * Build/run: firmware/run_tests.sh */
#include "../hal/app.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define PI 3.14159265358979323846
#define LSB (3.3 / 4096.0)
#define AIR50 2482.0f   /* the 15 k strap: 2.0 V */

static int checks = 0, fails = 0;
static void ck(const char *name, int cond) {
  checks++;
  if (!cond) { fails++; printf("FAIL %s\n", name); } else printf("PASS %s\n", name);
}

/* ---------------------------------------------------------------- RAM flash: pages 0/1 = records, 2/3 = event ring */
#define PG 4096u
static uint8_t flash[8][PG];
bool nvm_port_read(uint8_t page, uint32_t off, uint8_t *p, uint32_t n) {
  if (page > 7u || off + n > PG) return false;
  memcpy(p, flash[page] + off, n);
  return true;
}
bool nvm_port_prog(uint8_t page, uint32_t off, const uint8_t *p, uint32_t n) {
  if (page > 7u || off + n > PG) return false;
  for (uint32_t k = 0; k < n; k++) flash[page][off + k] &= p[k];
  return true;
}
bool nvm_port_erase(uint8_t page) {
  if (page > 7u) return false;
  memset(flash[page], 0xFF, PG);
  return true;
}

/* ---------------------------------------------------------------- averaged plants (50 kW air) */
typedef struct {
  double t, theta, amp, hz;            /* grid: phase crest, frequency */
  double vbus, vb, vo, ib, iout, load_r;
  bool kpre_cmd, kpre_fb; double t_kpre;
  bool llc_stall; uint8_t can_state;
  double p_llc_in;
  double i_inject[3];                  /* E82 (C-02): amps added to a phase's CT reading, either polarity */
  double t_sink_c;                     /* E82 (C-11): what the PFC and LLC sink NTCs read, °C (0 = the 40 °C the suite always used) */
  meas_cal_t cal;                      /* the sense chains as drawn */
} plant_t;

static app_t app;
static plant_t pl;
static app_tick_out_t last_o;
static app_pfc_out_t po;
static app_llc_out_t lo;
static pmp_frame_t rxq[8];
static uint8_t rx_n;
static long kicks = 0;
static int state_byte = -1;
static uint8_t rsp_txn; static uint32_t rsp_val; static int rsp_got;   /* E80: last READ_RSP seen by run_ms */

static float counts(int ch, double value) { return (float)(value / pl.cal.ch[ch].gain + pl.cal.ch[ch].off); }
static double gain(double fn, double q) { return 1.0 / hypot(1.0 + 0.1 * (1.0 - 1.0 / (fn * fn)), q * (fn - 1.0 / fn)); }

static void plant_pfc(app_pfc_adc_t *s) {
  const double dt = 10e-6;
  pl.theta += 2 * PI * pl.hz * dt;
  double vg[3], crest = pl.amp * sqrt(3.0);
  for (int k = 0; k < 3; k++) vg[k] = pl.amp * sin(pl.theta - 2 * PI / 3 * k);
  /* the averaged stage delivers the power its loop commands (the law itself is hal_test's) */
  double ipk = po.en ? app.pfc.i_pk : 0.0, p_in = 1.5 * pl.amp * ipk * 0.985;
  if (pl.kpre_fb) { if (pl.vbus < 0.98 * crest) pl.vbus += (0.98 * crest - pl.vbus) * dt / 1e-3; }   /* the diode bridge */
  else if (pl.vbus < crest) pl.vbus += (crest - pl.vbus) * dt / 0.06;                                 /* through the precharge resistor */
  double bleed = pl.vbus / 94e3 + ((last_o.do_bits & APP_DO_QDIS) ? pl.vbus / 640.0 : 0.0);
  pl.vbus += ((p_in - pl.p_llc_in) / fmax(pl.vbus, 50.0) - bleed) / 1.88e-3 * dt;
  if (pl.vbus < 0.0) pl.vbus = 0.0;
  s->ia = counts(MCH_IA, ipk * vg[0] / pl.amp + pl.i_inject[0]);
  s->ib = counts(MCH_IB, ipk * vg[1] / pl.amp + pl.i_inject[1]);
  s->ic = counts(MCH_IC, ipk * vg[2] / pl.amp + pl.i_inject[2]);
  for (int k = 0; k < 3; k++) s->vac[k] = counts(MCH_VAC1 + k, vg[k]);
  s->vbus = counts(MCH_VBUS, pl.vbus); s->vmid = counts(MCH_VMID, pl.vbus / 2);
}

static void plant_llc(app_llc_adc_t *s) {
  const double dt = 100e-6;
  double target = 0.0;
  if (lo.gate && lo.f_hz > 0.0f) {   /* the tank as a source behind its impedance at this frequency, referred to the bank */
    double fn = lo.f_hz / 140e3, q = 3.132 * fmax(pl.vo * pl.iout, 0.0) / (3.2423 * fmax(pl.vb * pl.vb, 2500.0));
    double voc = gain(fn, q) * (lo.duty < 1.0f ? sin(PI / 2 * lo.duty) : 1.0) * pl.vbus / 2;
    double req = fmax(3.132 * fabs(fn - 1.0 / fn), 0.2) / 4.0;
    target = fmin(fmax((voc - pl.vb) / req, 0.0), 400.0);
  }
  pl.ib += (target - pl.ib) * dt / 5e-4;
  pl.vb += pl.ib / 400e-6 * dt;
  if (last_o.do_bits & APP_DO_QDISBK) pl.vb -= pl.vb / 8.8e3 / 400e-6 * dt;
  double iload = pl.vo / pl.load_r, vo0 = pl.vo;
  pl.vo -= iload / 100e-6 * dt;
  if (pl.vb > pl.vo + 1.0) { double v = (400e-6 * (pl.vb - 1.0) + 100e-6 * pl.vo) / 500e-6; pl.vb = v + 1.0; pl.vo = v; }   /* DOUT */
  pl.iout = iload + (pl.vo - vo0) * 100e-6 / dt;
  pl.p_llc_in = pl.vb * pl.ib / 0.975;
  double d = pl.iout / pl.cal.ch[MCH_IOUT].gain;
  s->vout = counts(MCH_VOUT, pl.vo); s->iout_p = (float)(1601.0 + d / 2); s->iout_n = (float)(1601.0 - d / 2);
  s->ires = counts(MCH_IRES, 1.5 * pl.ib); s->vbka = counts(MCH_VBKA, pl.vb); s->vbkb = counts(MCH_VBKB, pl.vb);
}

static float tach_scale[4] = { 1.0f, 1.0f, 1.0f, 1.0f };   /* E80: per-fan speed knob (fraction of commanded) */

static void plant_tick(app_tick_in_t *ti) {
  bool k = (last_o.do_bits & APP_DO_KPRE) != 0u;
  if (k != pl.kpre_cmd) { pl.kpre_cmd = k; pl.t_kpre = pl.t; }
  if (pl.t - pl.t_kpre >= 0.015) pl.kpre_fb = pl.kpre_cmd;   /* operate and release in 15 ms */
  double r = 1e4 * exp(3435.0 * (1.0 / (40.0 + 273.15) - 1.0 / 298.15));
  float ntc = (float)(4095.0 * r / (1e4 + r));
  ti->t_pfc = ti->t_inlet = ti->t_llc = ti->t_xfmr = ntc;
  if (pl.t_sink_c > 0.0) {                                   /* E82 (C-11): the two SINK zones only — the inlet zone trips at 75 °C */
    double rs = 1e4 * exp(3435.0 * (1.0 / (pl.t_sink_c + 273.15) - 1.0 / 298.15));
    ti->t_pfc = ti->t_llc = (float)(4095.0 * rs / (1e4 + rs));
  }
  ti->v24 = (float)(24.0 / (LSB * 9.2)); ti->v15 = (float)(15.0 / (LSB * 5.7)); ti->vrefint = (float)(1.20 / 3.3 * 4096.0);
  ti->avmid = (float)(1.65 / 3.3 * 4095.0);   /* E81 (F-D-13): the AVMID buffer reads back mid-rail */
  ti->di = (uint16_t)(APP_DI_DRV_RDY | (pl.kpre_fb ? APP_DI_RLY_PRE : 0u));
  for (int n = 0; n < 4; n++) ti->tach_hz[n] = last_o.fan_duty[0] * 120.0f * tach_scale[n];
  ti->can_state = pl.can_state;
  ti->stack_pct = 40u;
  ti->pfc_exec_us = 3u; ti->llc_exec_us = 20u;
}

static void run_ms(long n) {
  for (long ms = 0; ms < n; ms++) {
    for (int j = 0; j < 100; j++) {
      app_pfc_adc_t ps; plant_pfc(&ps); app_pfc_isr(&app, &ps, &po);
      if (j % 10 == 9) { app_llc_adc_t ls; plant_llc(&ls); if (!pl.llc_stall) app_llc_isr(&app, &ls, &lo); }
      pl.t += 10e-6;
    }
    app_tick_in_t ti; memset(&ti, 0, sizeof ti);
    plant_tick(&ti);
    ti.rx = rxq; ti.rx_n = rx_n;
    app_tick(&app, &ti, &last_o);
    rx_n = 0;
    if (last_o.wdt_kick) kicks++;
    pmp_frame_t f;
    while (pmp_txq_pop(&app.txq, &f)) {
      if (f.id == 0x1801A001u) state_byte = f.data[0];
      if (((f.id >> 16) & 0xFFu) == 0x51u) { rsp_txn = f.data[0]; rsp_val = pmp_get32(f.data + 4); rsp_got = 1; }
    }
  }
}

static bool boot_no_cal;                                     /* E80: a factory-blank card (no calibration record) */
static void boot_as(bool wdt, const meas_cal_t *cal, uint8_t profile) {
  memset(flash, 0xFF, sizeof flash);
  nvm_t n; nvm_mount(&n, 0u, PG);
  app_cfg_t c; app_cfg_default(&c); c.vmp.profile = profile;
  c.vmp.addr = 0x10u;                                        /* addressed, so READ objects answer (E80) */
  nvm_put(&n, APP_NV_CFG, (const uint8_t *)&c, (uint8_t)sizeof c, true);
  meas_cal_t def;
  if (!cal && !boot_no_cal) { meas_cal_default(&def, 50); cal = &def; }   /* E80 (HR-29): tests run CALIBRATED */
  if (cal) nvm_put(&n, APP_NV_CAL, (const uint8_t *)cal, (uint8_t)sizeof *cal, true);
  for (int k = 0; k < 4; k++) tach_scale[k] = 1.0f;
  memset(&pl, 0, sizeof pl); memset(&last_o, 0, sizeof last_o); memset(&po, 0, sizeof po); memset(&lo, 0, sizeof lo);
  pl.amp = 400.0 * sqrt(2.0 / 3.0); pl.hz = 50.0; pl.load_r = 1e6;
  meas_cal_default(&pl.cal, 50);
  /* E81 (F-E-03): the boot record carries the RAW reset cause (RCU_RSTSCK 31:24). Bit 2 of the byte is EPRSTF — the pin
     reset the TPS3430's WDO produces, which is the card's dominant watchdog path; bit 3 is POR. */
  app_boot_t b = { .rating_counts = AIR50, .reset_cause = (uint8_t)(wdt ? (1u << 2) : (1u << 3)),
                   .uid = 0x12345678u, .fw = 0x00010203u, .nvm_page_size = PG,
                   .fw_crc = 0xC0DEC0DEu, .boot_ver = 0x01000000u, .boot_state = 0u, .evlog_pages = 2u };
  app_init(&app, &b);
  rx_n = 0; state_byte = -1;
}
static void boot(bool wdt, const meas_cal_t *cal) { boot_as(wdt, cal, (uint8_t)PMP_PROFILE_TONHE_V12); }

static void th_start(double v, double i) {   /* TonHe start of module 1 (A.2.4): 0.1 V and 0.01 A per bit */
  uint16_t dv = (uint16_t)lround(v * 10.0), di = (uint16_t)lround(i * 100.0);
  pmp_frame_t f = { 0x080601A0u, 8u, { 0xAA, 0x01, (uint8_t)dv, (uint8_t)(dv >> 8), (uint8_t)di, (uint8_t)(di >> 8), 0, 0 } };
  rxq[rx_n++] = f;
}
static void th_stop(void) { pmp_frame_t f = { 0x080601A0u, 8u, { 0x55, 0x01, 0, 0, 0, 0, 0, 0 } }; rxq[rx_n++] = f; }

/* runs up to max_ms re-sending the start each second; returns the ms at which RUN was reached, −1 if never */
static long start_run(double v, double i, long max_ms) {
  for (long k = 0; k < max_ms; k++) {
    if (k % 1000 == 0) th_start(v, i);
    run_ms(1);
    if (app.fsm.st == ST_RUN) return k;
  }
  return -1;
}
static void hold(double v, double i, long ms) { for (long k = 0; k < ms; k++) { if (k % 1000 == 0) th_start(v, i); run_ms(1); } }

static app_t snap_app;
static plant_t snap_pl;
static app_tick_out_t snap_o;
static app_pfc_out_t snap_po;
static app_llc_out_t snap_lo;
static uint8_t snap_flash[8][PG];
static void snapshot(void) { snap_app = app; snap_pl = pl; snap_o = last_o; snap_po = po; snap_lo = lo; memcpy(snap_flash, flash, sizeof flash); }
static void restore(void) { app = snap_app; pl = snap_pl; last_o = snap_o; po = snap_po; lo = snap_lo; memcpy(flash, snap_flash, sizeof flash); rx_n = 0; }

int main(void) {
  boot(false, NULL);
  long k0 = kicks;
  run_ms(1000);
  ck("app: boot offsets, precharge and the confirmed bypass reach STANDBY inside 1 s on a 400 VAC line, without a fault",
     app.fsm.st == ST_STANDBY && app.fsm.latched == FC_NONE && app.az_done && !app.az_bad && (last_o.do_bits & APP_DO_KPRE) && pl.kpre_fb);
  ck("app: the watchdog kick is permitted on ≥ 95 % of ticks once both ISRs run (E81: the port owns the 10 ms cadence)", kicks - k0 >= 950);
  printf("      comparator references: F.01 %.3f V · F.03 %.3f V · F.13 %.3f V · clamp %.3f V\n",
         last_o.dac_v[APP_DAC_IA], last_o.dac_v[APP_DAC_VBUS], last_o.dac_v[APP_DAC_VOUT], last_o.dac_v[APP_DAC_CLAMP]);
  /* E80: F.03 carries the corrected AMC1311 1.44 V common mode (HR-04); F.13 is scheduled by mode — 560 V in LOW (R09) */
  ck("app: the 50 kW air strap gives four fans and the comparator references F.01 2.664 V, F.03 2.208 V, F.13 (LOW) 1.940 V",
     app.kw == 50u && app.n_fans == 4u && fabsf(last_o.dac_v[APP_DAC_IA] - 2.664f) < 0.01f &&
     fabsf(last_o.dac_v[APP_DAC_VBUS] - 2.208f) < 0.01f && fabsf(last_o.dac_v[APP_DAC_VOUT] - 1.940f) < 0.01f);
  ck("app: idle, the HW-REC-1 clamp reference arms at the mode's F.13 threshold", fabsf(last_o.dac_v[APP_DAC_CLAMP] - last_o.dac_v[APP_DAC_VOUT]) < 0.005f);

  pl.load_r = 5.0;
  long t_run = start_run(400.0, 100.0, 6000);
  hold(400.0, 100.0, 1500);
  printf("      TonHe start: RUN after %ld ms · %.1f V · %.1f A · bus %.0f V · state byte 0x%02X\n", t_run, pl.vo, pl.iout, pl.vbus, state_byte);
  ck("app: a TonHe start (400 V, 100 A) into 5 Ω reaches RUN within 3 s and holds 400 V ± 2 % at 80 A",
     t_run >= 0 && t_run < 3000 && fabs(pl.vo - 400.0) < 8.0 && fabs(pl.iout - 80.0) < 4.0 && app.fsm.latched == FC_NONE);
  ck("app: telemetry reads ON and the TonHe state frame carries it (0x01)", app.tlm.rs == MOD_RS_ON && state_byte == 0x01);
  /* E80: economizer duty — closed coils hold at 40 % after the 60 ms pull-in; open coils read 0 */
  ck("app: relay-coil economizer holds KPRE and the closed matrix pair at 40 % after pull-in, open coils at 0",
     last_o.relay_duty[APP_RLY_KPRE] == 0.4f && last_o.relay_duty[APP_RLY_KPARA] == 0.4f &&
     last_o.relay_duty[APP_RLY_KPARB] == 0.4f && last_o.relay_duty[APP_RLY_KSER] == 0.0f);
  /* E80 (HW-REC-1): delivering at 400 V the clamp reference rides v_ref · 1.05 + 10 = 430 V */
  { float want = (float)((430.0 / app.cal.ch[MCH_VOUT].gain + app.cal.ch[MCH_VOUT].off) * LSB);
    ck("app: the HW-REC-1 clamp reference follows the running setpoint (430 V at a 400 V command)",
       fabsf(last_o.dac_v[APP_DAC_CLAMP] - want) < 0.01f); }
  snapshot();

  th_stop();
  long t_stop = -1;
  for (long k = 0; k < 300 && t_stop < 0; k++) { run_ms(1); if (app.fsm.st == ST_STANDBY && !app.fsm.out.llc_en) t_stop = k; }
  ck("app: a TonHe stop ramps the current out and stops the LLC inside 150 ms, the PFC kept warm", t_stop >= 0 && t_stop <= 150 && app.fsm.out.pfc_en);

  int got[5];
  const struct { uint16_t ch; double ires; pmp_fault_t want; } F[5] = {
    { 1u << APP_FLT_VBUS, 0.0, FC_BUS_OVP }, { 1u << APP_FLT_VOUT, 0.0, FC_OUT_OVP }, { 1u << APP_FLT_EXT, 0.95 * 220.0, FC_TANK_OC },
    { 1u << APP_FLT_EXT, 10.0, FC_DESAT }, { 1u << APP_FLT_IA, 0.0, FC_OC_PFC } };
  for (int n = 0; n < 5; n++) {
    restore();
    app_fault_isr(&app, F[n].ch, counts(MCH_IRES, F[n].ires));
    run_ms(2);
    got[n] = app.fsm.latched == F[n].want && !(last_o.do_bits & (APP_DO_EN_PFC | APP_DO_EN_LLC));
  }
  ck("app: each HRTIMER channel is attributed — CMP4 F.03, CMP0 F.13, the wire-OR F.11 at 95 % of the tank class else F.02, CMP3 F.01 (E81 pin swap) — and both gate enables drop",
     got[0] && got[1] && got[2] && got[3] && got[4]);

  { /* E82 (C-02): F.01's comparators carry the POSITIVE reference only. E81 made the DAC reference follow the sign of the
       measured current so that a through-window CT's unknown primary orientation stopped mattering — but the comparators
       are non-inverted into active-HIGH fault inputs, so the negative reference asserts the fault for the whole time the
       current reads negative, and at idle the sign of ≈ 0 A is noise. The negative polarity is covered instead by a
       100 kHz |i| test in app_pfc_isr (3-wire Σi = 0 makes a positive comparator trip the backstop) — so the reference
       must now be the positive one at every sample, a NEGATIVE over-current must still stop the stage inside one ISR and
       latch F.01, and idle noise around zero must never trip. */
    restore();
    int pos_ref = 1;
    for (int k = 0; k < 400; k++) {                       /* a whole line cycle of both polarities */
      app_pfc_adc_t ps; plant_pfc(&ps); app_pfc_isr(&app, &ps, &po);
      if (!(fabsf(last_o.dac_v[APP_DAC_IA] - 2.664f) < 0.01f)) pos_ref = 0;
    }
    int quiet = app.fsm.latched == FC_NONE && app.trip_n == app.trip_ack;

    restore();                                            /* idle: the stage off, the CT channels on noise around zero */
    for (int k = 0; k < 2000; k++) {
      for (int n = 0; n < 3; n++) pl.i_inject[n] = ((k + n) % 7 - 3) * 0.3;   /* ±0.9 A, ~10 LSB of the 50 kW chain */
      app_pfc_adc_t ps; plant_pfc(&ps); app_pfc_isr(&app, &ps, &po);
    }
    int no_nuisance = app.fsm.latched == FC_NONE && app.trip_n == app.trip_ack;
    for (int n = 0; n < 3; n++) pl.i_inject[n] = 0.0;

    restore();                                            /* a NEGATIVE over-current on one phase */
    pl.i_inject[1] = -1.05 * app.fsm.oc_line_a - 130.0;   /* beyond the trip whatever the phase is carrying at this instant of the line cycle (≤ 124 A pk) */
    app_pfc_adc_t ps; plant_pfc(&ps); app_pfc_isr(&app, &ps, &po);
    int one_isr = !po.en && app.trip_n != app.trip_ack;
    run_ms(2);
    int latched = app.fsm.latched == FC_OC_PFC && !(last_o.do_bits & (APP_DO_EN_PFC | APP_DO_EN_LLC));
    for (int n = 0; n < 3; n++) pl.i_inject[n] = 0.0;
    printf("      C-02: F.01 ref %.3f V both half cycles · negative %.0f A stopped in one ISR %d, latched %s\n",
           (double)last_o.dac_v[APP_DAC_IA], -1.05 * app.fsm.oc_line_a - 130.0, one_isr,
           app.fsm.latched == FC_OC_PFC ? "F.01" : "none");
    ck("E82 C-02: the F.01 reference stays positive through both half cycles, a negative over-current stops the PFC inside one ISR and latches F.01, and idle noise around zero never trips",
       pos_ref && quiet && no_nuisance && one_isr && latched); }

  restore(); pl.hz = 40.0; run_ms(400);
  int f37 = app.fsm.latched == FC_LINE_HZ && pmp_fault_class(FC_LINE_HZ) == FCL_AUTO_EXT;
  pl.hz = 50.0; run_ms(3000);
  ck("app: 40 Hz on a live line latches F.37 (AUTO_EXT) and the row clears by itself once 50 Hz is back", f37 && app.fsm.latched == FC_NONE);

  restore(); pl.llc_stall = true; run_ms(1); pl.llc_stall = false; run_ms(150);
  ck("app (E82 E-15): ONE millisecond without the LLC interrupt is not F.35 — the LATCH row needs three inside 100 ms", app.fsm.latched == FC_NONE);
  restore(); k0 = kicks; pl.llc_stall = true; run_ms(20); pl.llc_stall = false;
  ck("app: an LLC interrupt that stops latches F.35 and the watchdog gets no kick while it is stopped", app.fsm.latched == FC_OVERRUN && kicks == k0);

  restore(); pl.load_r = 3.2; hold(400.0, 150.0, 1500);
  double vmin = 1e9, bmin = 1e9, amp0 = pl.amp;
  pl.amp = amp0 * 230.0 / 400.0;
  for (int k = 0; k < 60; k++) { run_ms(1); vmin = fmin(vmin, pl.vo); bmin = fmin(bmin, pl.vbus); }
  pl.amp = amp0;
  for (int k = 0; k < 800; k++) { if (k % 1000 == 0) th_start(400.0, 150.0); run_ms(1); bmin = fmin(bmin, pl.vbus); }
  printf("      sag to 230 VAC for 60 ms at 50 kW: output min %.0f V · bus min %.0f V · after %.1f V · fault %d\n", vmin, bmin, pl.vo, app.fsm.latched);
  ck("app: a 60 ms sag to 230 VAC at 50 kW rides through — no latch, the fold-back holds the bus above F.05, 400 V back inside 0.8 s",
     app.fsm.latched == FC_NONE && bmin > 620.0 && fabs(pl.vo - 400.0) < 8.0);

  /* E82 (C-11 / M-06) end to end, 50 kW air. (1) Low line on the 830 V link is a corner the thermal grid folds on a hot
     day for the VIENNA die (285 VAC: 164 °C unfolded): on a 40 °C sink the module serves it, on a 77 °C sink (55 °C inlet)
     the junction observer trims the availability until the die sits inside its band — a thermal derate the charge
     controller can read, not a fault. (2) 150 V into a RESISTOR on the same hot sink has no equilibrium: folding the
     current drops the voltage, the tank gain falls, the weak leg's residual rises — the module DECLINES the point (0 A
     available) instead of cooking leg A, and says why. (A pack holds its voltage, so the same corner FOLDS on a pack.) */
  { boot(false, NULL); pl.amp = 285.0 * sqrt(2.0 / 3.0); run_ms(1000); pl.load_r = 3.7;
    hold(400.0, 150.0, 8000);
    double i_cool = pl.iout; int cool_ok = app.fsm.latched == FC_NONE && !(app.ctl.derate_why & PMP_DR_THERMAL) && !app.die.declined;
    boot(false, NULL); pl.amp = 285.0 * sqrt(2.0 / 3.0); run_ms(1000); pl.load_r = 3.7; pl.t_sink_c = 77.0;
    hold(400.0, 150.0, 14000);
    double i_hot = pl.iout; float tj_hot = app.die.tj_pfc;
    int fold_ok = app.fsm.latched == FC_NONE && (app.ctl.derate_why & PMP_DR_THERMAL) && !app.die.declined &&
                  i_hot > 0.75 * i_cool && i_hot < 0.97 * i_cool && tj_hot > DIELIM_TJ_C - DIELIM_BAND_K && tj_hot <= DIELIM_TJ_C + 0.5f;
    boot(false, NULL); run_ms(1000); pl.load_r = 0.94; pl.t_sink_c = 77.0;
    hold(150.0, 166.0, 12000);
    printf("      50 kW air at 285 VAC, 400 V into 3.7 ohm: %.1f A on a 40 C sink · %.1f A on a 77 C sink (Vienna Tj est %.0f C) · 150 V into 0.94 ohm at 77 C: %.0f A, declined %d, fault %d\n",
           i_cool, i_hot, (double)tj_hot, pl.iout, app.die.declined, (int)app.fsm.latched);
    ck("app (E82 C-11 / M-06): 285 VAC on the 830 V link runs unfolded on a 40 °C sink and folds 3–25 % on a 77 °C sink — thermal derate reported, the Vienna junction estimate inside its band, no fault",
       cool_ok && i_cool > 100.0 && fold_ok);
    ck("app (E82 C-11): 150 V into a resistor on a 77 °C sink is DECLINED on the two-die 50 kW air — 0 A available with the thermal-derate bit, no fault latched, the link at its 650 V floor",
       app.die.declined && app.fsm.latched == FC_NONE && (app.ctl.derate_why & PMP_DR_THERMAL) && pl.iout < 5.0 && app.ctl.i_avail == 0.0f && pl.vbus < 670.0);
    /* … and the refusal belongs to that POINT, not to the module: stop (the PFC stays warm), ask for 400 V, get it */
    th_stop(); run_ms(400); pl.load_r = 5.0;
    hold(400.0, 100.0, 4000);
    ck("app (E82 C-11): after a declined point a stop and a new start at 400 V delivers — the refusal is not inherited through the warm-standby hold",
       !app.die.declined && app.fsm.latched == FC_NONE && pl.iout > 70.0);
    pl.t_sink_c = 0.0; }

  meas_cal_t bad; meas_cal_default(&bad, 50); bad.ch[MCH_VOUT].gain *= 1.2f;
  boot(false, &bad); run_ms(500);
  ck("app: a calibration record out of range is F.30 from boot — no precharge, no output",
     app.fsm.latched == FC_CAL && !(last_o.do_bits & (APP_DO_KPRE | APP_DO_EN_PFC | APP_DO_EN_LLC)));

  boot(true, NULL); run_ms(50);
  ck("app: the first boot after a watchdog reset reports F.32 and holds the module", app.fsm.latched == FC_WDT);

  boot(false, NULL); run_ms(1000);
  pl.vo = 450.0; pl.load_r = 1e6;
  t_run = start_run(300.0, 10.0, 6000);
  printf("      start at 300 V into 450 V terminal capacitors: RUN after %ld ms · stack %.0f V · node %.0f V\n", t_run, pl.vb, pl.vo);
  ck("app: a start at 300 V into terminal capacitors held at 450 V reaches RUN on the stack (no F.34) and the node stays up",
     t_run >= 0 && app.fsm.latched == FC_NONE && pl.vo > 440.0 && fabs(pl.vb - 301.0) < 15.0);

  boot(false, NULL); run_ms(200);
  long gaps[12], cnt = 0;
  for (int n = 0; n < 12 && cnt < 12; n++) {
    pl.can_state = 2u;
    long g = -1;
    for (long k = 0; k < 7000; k++) { run_ms(1); if (last_o.can_restart) { g = k + 1; break; } }
    gaps[cnt++] = g;
    pl.can_state = 0u; run_ms(60);
  }
  printf("      bus-off restart delays:");
  for (long n = 0; n < cnt; n++) printf(" %ld", gaps[n]);
  printf(" ms\n");
  int early = 1;
  for (int n = 0; n < 9; n++) if (gaps[n] < 100 || gaps[n] > 102) early = 0;
  ck("app: CAN bus-off restarts after 100 ms; the tenth inside a minute holds off 5 s", early && gaps[9] >= 5000);

  boot_no_cal = true; boot(false, NULL); run_ms(500);
  ck("app: a card with NO calibration record latches F.30 from boot — no precharge, no output, APP_W_UNCAL says why (HR-29)",
     app.fsm.latched == FC_CAL && app.uncal && (app.tlm.warn & APP_W_UNCAL) &&
     !(last_o.do_bits & (APP_DO_KPRE | APP_DO_EN_PFC | APP_DO_EN_LLC)));
  boot_no_cal = false;

  boot(false, NULL); run_ms(1000);
  pl.load_r = 5.0;
  (void)start_run(400.0, 100.0, 6000);
  tach_scale[2] = 0.15f;                                       /* fan 3 at 15 % of its commanded speed */
  hold(400.0, 100.0, 3500);
  int one_failed = app.fan_fail == 0x04u && app.in.fans_failed == 1u && app.fsm.latched == FC_NONE;
  float d_target = app.fsm.out.derate;
  tach_scale[1] = 0.0f; tach_scale[3] = 0.0f;                  /* three of four gone: nothing can cool full power */
  hold(400.0, 100.0, 3500);
  printf("      fan curve: one slow fan -> fail 0x%02X derate %.2f · three failed -> F.%d\n", 0x04, d_target, (int)app.fsm.latched);
  ck("app: a fan at 15 %% of commanded speed fails the curve in 3 s (0.6 derate on the 4-fan SKU); three failed latch F.25 (HR-25/FW-21)",
     one_failed && d_target <= 0.61f && d_target > 0.35f && app.fsm.latched == FC_FAN);

  boot_as(false, NULL, (uint8_t)PMP_PROFILE_NATIVE); run_ms(1200);
  { /* E80: the event ring holds the boot event and a fault set/clear pair; the VMP objects read it back */
    app_fault_isr(&app, 1u << APP_FLT_VBUS, 0.0f);
    run_ms(200);
    int latched = app.fsm.latched == FC_BUS_OVP;
    pmp_frame_t fr = { 0u, 8u, { 0x99, 0x03, 0x00, 0, 0, 0, 0, 0 } };   /* READ txn 0x99 obj 0x0400 sub 0 */
    fr.id = (6u << 26) | (1u << 25) | (0x11u << 16) | (0x10u << 8) | 0x01u;
    fr.data[1] = 0x00; fr.data[2] = 0x04; fr.data[3] = 0;               /* obj 0x0400 little-endian */
    rxq[rx_n++] = fr;
    rsp_got = 0; run_ms(2);
    uint32_t cnt = rsp_got && rsp_txn == 0x99u ? rsp_val : 0u;
    ck("app: the event log records boot and the F.03 latch, and VMP object 0x0400 reads the count (E80)",
       latched && cnt >= 2u && evlog_count(&app.ev) == cnt);
    ck("app: a LATCH row blocks the 60 s boot confirmation (boot_ok stays false)", !last_o.boot_ok && app.latch_seen); }

  boot_as(false, NULL, (uint8_t)PMP_PROFILE_NATIVE); run_ms(61000);
  ck("app: 60 s of healthy standby raises boot_ok — the port confirms a pending slot on this edge (E80)", last_o.boot_ok);
  { /* ENTER_BOOT: unlock, then the action — the module reports enter_boot once the acknowledgement has left */
    pmp_frame_t fu = { (1u << 26) | (1u << 25) | (0x10u << 16) | (0x10u << 8) | 0x01u, 8u, { 0x01, 6, 0, 0, 0, 0, 0, 0 } };
    pmp_put32(fu.data + 2, 0x32504D56u);
    fu.data[7] = pmp_crc8_frame(fu.id, fu.data, 7u);
    rxq[rx_n++] = fu; run_ms(2);
    pmp_frame_t fb = fu; fb.data[1] = 8; pmp_put32(fb.data + 2, 0u); fb.data[7] = pmp_crc8_frame(fb.id, fb.data, 7u);
    rxq[rx_n++] = fb; run_ms(3);
    ck("app: UNLOCK then ENTER_BOOT sets enter_boot for the port (handoff into the bootloader)", last_o.enter_boot); }

  boot(false, NULL); run_ms(500);
  { pmp_frame_t fm = { 0x1C90FFA0u, 8u, { 1, 0, 0, 0, 0, 0, 0, 0 } }; rxq[rx_n++] = fm; }
  run_ms(11000);
  nvm_t n2; nvm_mount(&n2, 0u, PG);
  app_cfg_t c2;
  int stored = nvm_get(&n2, APP_NV_CFG, (uint8_t *)&c2, (uint8_t)sizeof c2);
  ck("app: a TonHe address-mode change is stored within 10 s on a stopped module and reads back after a remount",
     stored && c2.th_addr_mode == 1u && c2.vmp.profile == (uint8_t)PMP_PROFILE_TONHE_V12);

  printf("\nRESULT: %d/%d checks passed\n", checks - fails, checks);
  return fails ? 1 : 0;
}
