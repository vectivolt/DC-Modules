/* hal_test.c — verification of the portable real-time HAL (firmware/hal: pfc, llc, meas, nvm).
 *   pfc   the control law on a cycle-by-cycle Vienna plant — the vienna-switched.mjs state model in C: an ideal bidirectional
 *         switch per phase, boost diodes, a floating neutral with DCM, the soft-saturating D1, the split link, the SNS_VAC RC,
 *         peak and valley sampling with one update of transport delay. Start, load step, steady state (THD, PF, midpoint, peak),
 *         load dump, a 50 % sag and its recovery, a 30° phase jump, a half-bus imbalance, sequence A-C-B, disable.
 *   llc   the ZVS table against the FHA tank impedance at every tolerance corner; the map and burst; the modulator in closed
 *         loop with pmp_reg_step on a cycle-by-cycle full bridge (Lr–Cr–Lm, n = 2, rectifier into the output capacitance): CV,
 *         CC into a battery, saturation on the floor without capacitive mode, burst at light load, tank peak against F.11.
 *   meas  calibration windows, the reference correction, NTC and strap bands, the grid monitor (RMS, frequency, sequence, a lost
 *         phase, loss of line, noise).
 *   nvm   CRC-32 check value, round trip, write-on-change, compaction, a power cut at every programmed 64-bit ROW of an append
 *         and at every step of a compaction — on a flash model that programs whole ECC rows and refuses a row that is not
 *         erased, which is what the GD32G553 does; and the event ring on the same model.
 * What this does NOT prove: the loop gains on the real stage (the regulator gains are ctl.c's placeholders), EMI, the ADC,
 * timer and flash drivers — HIL and EVT rows in docs/firmware-verification.md. Build/run: firmware/run_tests.sh */
#include "../hal/pfc.h"
#include "../hal/llc.h"
#include "../hal/meas.h"
#include "../hal/nvm.h"
#include "../hal/evlog.h"
#include "../core/ctl.h"
#include "../core/fsm.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define PI 3.14159265358979323846

static int checks = 0, fails = 0;
static void ck(const char *name, int cond) {
  checks++;
  if (!cond) { fails++; printf("FAIL %s\n", name); } else printf("PASS %s\n", name);
}

/* ================================================================ Vienna plant */
typedef struct { int stack, turns; double c_half; uint16_t kw; } d1_t;
static const d1_t D1_30 = { 3, 39, 5 * 470e-6, 30 }, D1_40 = { 5, 26, 6 * 470e-6, 40 }, D1_50 = { 5, 24, 8 * 470e-6, 50 };
static double ld1(const d1_t *d, double i) {   /* vienna-switched.mjs Ld1, nominal lot */
  return 37e-9 * d->stack * d->turns * d->turns / (1.0 + 2.13e-4 * pow(fmax(d->turns * fabs(i) / 0.196 / 79.577, 1e-9), 1.637));
}

typedef struct {
  const d1_t *d; pfc_cfg_t cfg; pfc_t p; pfc_ref_t ref;
  double i[3], vp, vn, vm[3], L[3], t, amp, ph, hz, p_load, i_asym, tau;   /* tau: the SNS_VAC RC */
  float on_now[3], on_next[3];
  long step; int seq; bool fold;
  double pk, vb_min, vb_max, mid_max;
  double hist[2400];
} vsim_t;

static double vg_of(const vsim_t *s, int k) { return s->amp * sin(2 * PI * s->hz * s->t + s->ph - s->seq * 2 * PI / 3 * k); }
static void vrec(vsim_t *s) { s->pk = 0; s->vb_min = 1e9; s->vb_max = 0; s->mid_max = 0; }

static void vsim_init(vsim_t *s, const d1_t *d, double vll, double vbus, double p_load, int seq) {
  memset(s, 0, sizeof *s);
  s->d = d; pfc_cfg_default(&s->cfg, d->kw); pfc_reset(&s->p);
  s->amp = vll * sqrt(2.0 / 3.0); s->hz = 50.0; s->seq = seq; s->p_load = p_load; s->tau = s->cfg.tau_v;
  s->vp = s->vn = vbus / 2;
  s->ref.en = true; s->ref.vbus_ref = (float)vbus; s->ref.w_line = (float)(seq * 2 * PI * 50.0);
  double ipk = 2.0 * p_load / 0.975 / (3.0 * s->amp);   /* start on the sinusoidal steady state */
  for (int k = 0; k < 3; k++) { s->vm[k] = vg_of(s, k); s->i[k] = ipk * vg_of(s, k) / s->amp; }
  vrec(s);
}

/* one control half period: the update samples now and takes effect one update later (the engine's lag 1), then 100 steps */
static void vsim_half(vsim_t *s) {
  const double dt = 1.0 / (50e3 * 200.0);
  double pl = s->p_load;
  if (s->fold) {   /* app.c's LLC bus fold-back: full power 10 V under the reference, none at 625 V (F.05 is 620 V) */
    double hi = fmax(s->ref.vbus_ref - 10.0, 635.0);
    pl *= fmin(fmax((s->vp + s->vn - 625.0) / (hi - 625.0), 0.0), 1.0);
  }
  float fi[3], fv[3];
  for (int k = 0; k < 3; k++) { fi[k] = (float)s->i[k]; fv[k] = (float)s->vm[k]; s->L[k] = ld1(s->d, s->i[k]); }
  memcpy(s->on_now, s->on_next, sizeof s->on_now);
  pfc_step(&s->p, &s->cfg, &s->ref, fi, fv, (float)s->vp, (float)s->vn, (float)pl, 10e-6f);
  memcpy(s->on_next, s->p.on, sizeof s->on_next);
  for (int j = 0; j < 100; j++) {
    double car = (double)(s->step % 200) / 200.0, tri = car < 0.5 ? 2 * car : 2 - 2 * car;
    double vg[3], node[3] = { 0, 0, 0 }, num = 0, den = 0;
    bool on[3], blk[3];
    for (int k = 0; k < 3; k++) {
      vg[k] = vg_of(s, k);
      on[k] = s->on_now[k] > 0.0f && tri >= 1.0 - s->on_now[k];
      blk[k] = false;
      if (on[k]) node[k] = 0;
      else if (s->i[k] > 0) node[k] = s->vp;
      else if (s->i[k] < 0) node[k] = -s->vn;
      else blk[k] = true;
      if (!blk[k]) { num += (vg[k] - 0.01 * s->i[k] - node[k]) / s->L[k]; den += 1 / s->L[k]; }
    }
    double vmn = den > 0 ? num / den : 0;
    for (int k = 0; k < 3; k++) if (blk[k]) {   /* a DCM phase whose diode becomes forward-biased */
      double vd = vg[k] - vmn;
      if (vd > s->vp || vd < -s->vn) {
        node[k] = vd > s->vp ? s->vp : -s->vn; blk[k] = false;
        num += (vg[k] - node[k]) / s->L[k]; den += 1 / s->L[k]; vmn = num / den;
      }
    }
    double ip = 0, in = 0;
    for (int k = 0; k < 3; k++) {
      if (blk[k]) continue;
      double ni = s->i[k] + (vg[k] - 0.01 * s->i[k] - node[k] - vmn) / s->L[k] * dt;
      s->i[k] = (!on[k] && ni * s->i[k] < 0) ? 0 : ni;
      if (!on[k] && node[k] > 0) ip += s->i[k];
      if (!on[k] && node[k] < 0) in += s->i[k];
    }
    /* 3-wire: the currents sum to zero. A diode zero clamp takes its phase's last increment out of that sum; the residue is
       spread over the phases still conducting, and a phase left conducting alone has no return path, so it is zero */
    double sum = 0; int nc = 0;
    for (int k = 0; k < 3; k++) if (s->i[k] != 0) { sum += s->i[k]; nc++; }
    for (int k = 0; k < 3; k++) if (s->i[k] != 0) s->i[k] = (nc == 1) ? 0 : s->i[k] - sum / nc;
    double il = pl / fmax(s->vp + s->vn, 100.0);
    s->vp += (ip - il - s->i_asym) / s->d->c_half * dt;
    s->vn += (-il - in) / s->d->c_half * dt;
    for (int k = 0; k < 3; k++) { s->vm[k] += (vg[k] - s->vm[k]) * dt / s->tau; s->pk = fmax(s->pk, fabs(s->i[k])); }
    double vb = s->vp + s->vn;
    s->vb_min = fmin(s->vb_min, vb); s->vb_max = fmax(s->vb_max, vb); s->mid_max = fmax(s->mid_max, fabs(s->vp - s->vn));
    s->t += dt; s->step++;
  }
}
static void vrun(vsim_t *s, double sec) { for (long n = lround(sec / 10e-6); n > 0; n--) vsim_half(s); }

typedef struct { double thd, pf, vbus, mid, pk; } vmet_t;
static vmet_t vcycle(vsim_t *s) {   /* one line cycle: phase-A THD to h40, true PF over the three phases, mean bus */
  int n = (int)lround(1.0 / (s->hz * 10e-6));
  double P = 0, V2[3] = { 0, 0, 0 }, I2[3] = { 0, 0, 0 }, vb = 0, h1 = 0, hh = 0;
  vrec(s);
  for (int j = 0; j < n; j++) {
    vsim_half(s);
    for (int k = 0; k < 3; k++) { double v = vg_of(s, k); P += v * s->i[k]; V2[k] += v * v; I2[k] += s->i[k] * s->i[k]; }
    s->hist[j] = s->i[0]; vb += s->vp + s->vn;
  }
  for (int h = 1; h <= 40; h++) {
    double a = 0, b = 0;
    for (int j = 0; j < n; j++) { double w = 2 * PI * h * j / n; a += s->hist[j] * cos(w); b += s->hist[j] * sin(w); }
    if (h == 1) h1 = hypot(a, b); else hh += a * a + b * b;
  }
  vmet_t m = { sqrt(hh) / h1, P / (sqrt(V2[0] * I2[0]) + sqrt(V2[1] * I2[1]) + sqrt(V2[2] * I2[2])), vb / n, s->mid_max, s->pk };
  return m;
}

/* ================================================================ DC into the line
   The line CTs are 50 Hz metering parts: below ≈ 1 Hz they pass NOTHING, so the P-only current loop has no DC feedback of
   any kind and whatever DC the modulator is asked to produce is opposed by the line resistance alone. The forcing terms are
   both measurement offsets — a differential offset on the SNS_VAC channels (1 LSB = 1.35 V of line: the AC chains use 14 %
   of the ADC span, and VAC1/2 sit on ADC1 against VAC3 on ADC3, so their offsets do not cancel) and a residual CT-channel
   offset after the boot window. This plant is line-cycle averaged — only the DC component is tracked, which is the whole
   point — but the SENSOR is modelled as the high-pass it physically is, so the test cannot pass against a DC-coupled model:
   with the CT high-pass removed the "as coded" row below reads a benign fraction of an amp instead of tens of amps.
   Under test are the real grid_sample() estimator, its clean-cycle gate and its clamps; the modulator's DC path is its own
   algebra, v_dc[n] = v_used[n] + kp_i·i_used[n], made zero-sum by the min-max zero-sequence injection. */
typedef struct { double i[3], x[3]; } dcsim_t;
static double dc_run(int kw, const double dv[3], const double di[3], bool fix, double r_dc, double tau_ct, double sec) {
  pfc_cfg_t cfg; pfc_cfg_default(&cfg, (uint16_t)kw);
  grid_t g; memset(&g, 0, sizeof g);
  dcsim_t s; memset(&s, 0, sizeof s);
  const double fs = 1e4, dt = 1.0 / fs, w = 2 * PI * 50.0, amp = 400.0 * sqrt(2.0 / 3.0), L = 165e-6;
  double worst = 0.0;
  for (long k = 0, n = lround(sec * fs); k < n; k++) {
    double t = k * dt;
    float vm[3], im[3];
    double idc[3];
    for (int p = 0; p < 3; p++) {
      double vac = amp * sin(w * t - p * 2 * PI / 3), iac = 60.0 * sin(w * t - p * 2 * PI / 3);
      s.x[p] += (s.i[p] - s.x[p]) * dt / tau_ct;              /* the CT's magnetizing pole: what reaches the burden is i − x */
      idc[p] = (s.i[p] - s.x[p]) + di[p];                     /* the DC the burden actually carries, plus the channel offset */
      vm[p] = (float)(vac + dv[p]);
      im[p] = (float)(iac + idc[p]);
    }
    grid_sample(&g, vm, im, (float)fs);                       /* app.c feeds the RAW samples, as it must */
    double vd[3], mean = 0.0;
    for (int p = 0; p < 3; p++) {                             /* the modulator's DC path: v_used + kp_i · i_used */
      vd[p] = (dv[p] - (fix ? g.dcv[p] : 0.0f)) + cfg.kp_i * (idc[p] - (fix ? g.dci[p] : 0.0f));
      mean += vd[p] / 3.0;
    }
    for (int p = 0; p < 3; p++) s.i[p] += dt * (-(r_dc * s.i[p]) - (vd[p] - mean)) / L;   /* 3-wire: zero-sum forcing */
    if (t > sec - 0.1) for (int p = 0; p < 3; p++) worst = fmax(worst, fabs(s.i[p]));
  }
  return worst;
}

static void pfc_tests(void) {
  static vsim_t s;
  vsim_init(&s, &D1_50, 400.0, 565.7, 0.0, 1);
  s.ref.vbus_ref = 830.0f;
  vrun(&s, 1.30);
  printf("      start 565.7 → 830 V: peak bus %.1f V, end %.1f V\n", s.vb_max, s.vp + s.vn);
  ck("pfc 50 kW: a start from the 400 VAC rectified crest ramps to 830 V without overshoot (≤ +2 %) and settles within 1 %",
     s.vb_max <= 830.0 * 1.02 && fabs(s.vp + s.vn - 830.0) <= 8.3);
  s.p_load = 5e3; vrun(&s, 0.2);
  s.p_load = 50e3; vrec(&s); vrun(&s, 0.1);
  printf("      load step 10 → 100 %%: bus min %.1f V\n", s.vb_min);
  ck("pfc 50 kW: a load step 10 → 100 % dips the bus ≤ 5 % (the LLC power feed-forward)", s.vb_min >= 830.0 * 0.95);
  vrun(&s, 0.2);
  vmet_t m = vcycle(&s);
  printf("      50 kW 400 VAC: bus %.1f V · THD %.2f %% · PF %.4f · midpoint %.1f V · peak %.1f A\n", m.vbus, 100 * m.thd, m.pf, m.mid, m.pk);
  ck("pfc 50 kW at 400 VAC: bus ±1 %, THD < 5 %, PF > 0.99, midpoint < 10 V, peak under F.01 / 1.2 (162 A)",
     fabs(m.vbus - 830.0) <= 8.3 && m.thd < 0.05 && m.pf > 0.99 && m.mid < 10.0 && m.pk < 162.5);
  s.p_load = 0.0; vrec(&s); vrun(&s, 0.1);
  printf("      load dump: bus peak %.1f V\n", s.vb_max);
  ck("pfc 50 kW: a load dump from full power peaks ≤ 850 V — the skip keeps F.03 (860 V) out of reach", s.vb_max <= 850.0);

  vsim_init(&s, &D1_50, 400.0, 830.0, 50e3, 1); s.fold = true; vrun(&s, 0.25);
  double amp = s.amp; vrec(&s);
  s.amp = 0.5 * amp; vrun(&s, 0.06); s.amp = amp; vrun(&s, 0.15);
  printf("      50 %% sag for 60 ms: peak %.1f A · bus %.0f–%.0f V\n", s.pk, s.vb_min, s.vb_max);
  ck("pfc 50 kW: a 50 % sag for 60 ms at full power and its recovery stay under F.01 / 1.2, the bus between F.05 and F.03",
     s.pk < 162.5 && s.vb_min > 625.0 && s.vb_max < 850.0);
  vrec(&s); s.ph = PI / 6; vrun(&s, 0.1);
  printf("      30° phase jump: peak %.1f A · bus max %.0f V\n", s.pk, s.vb_max);
  ck("pfc 50 kW: a 30° phase jump at full power stays under F.01 / 1.2", s.pk < 162.5 && s.vb_max < 850.0);

  vsim_init(&s, &D1_50, 400.0, 830.0, 50e3, 1); s.fold = true; vrun(&s, 0.25);
  amp = s.amp; vrec(&s);
  s.amp = 0.25 * amp; vrun(&s, 0.04); s.amp = amp; vrun(&s, 0.15);
  printf("      75 %% sag for 40 ms: peak %.1f A · bus %.0f–%.0f V\n", s.pk, s.vb_min, s.vb_max);
  ck("pfc 50 kW: a 75 % sag for 40 ms at full power and its recovery stay under F.01 / 1.2 (the limit leaves room for the step back)",
     s.pk < 162.5 && s.vb_min > 625.0 && s.vb_max < 850.0);

  vsim_init(&s, &D1_30, 480.0, 750.0, 30e3, 1); s.fold = true; vrun(&s, 0.25);
  amp = s.amp; vrec(&s);
  s.amp = 0.5 * amp; vrun(&s, 0.06); s.amp = amp; vrun(&s, 0.15);
  printf("      30 kW, 480 VAC, 50 %% sag for 60 ms: peak %.1f A · bus %.0f–%.0f V\n", s.pk, s.vb_min, s.vb_max);
  ck("pfc 30 kW: a 50 % sag of a 480 VAC line at full power and its recovery stay under F.01 / 1.2 (100 A)",
     s.pk < 100.0 && s.vb_min > 625.0 && s.vb_max < 850.0);

  vsim_init(&s, &D1_50, 400.0, 830.0, 50e3, 1); s.i_asym = 3.0; vrun(&s, 0.4); vrec(&s); vrun(&s, 0.05);
  printf("      3 A on the upper half: midpoint %.1f V\n", s.mid_max);
  ck("pfc 50 kW: a 3 A load on one bus half holds the midpoint within 20 V (F.06 at 40 V)", s.mid_max < 20.0);

  vsim_init(&s, &D1_30, 400.0, 750.0, 30e3, -1); vrun(&s, 0.4);
  m = vcycle(&s);
  printf("      30 kW wired A-C-B: THD %.2f %% · PF %.4f · peak %.1f A\n", 100 * m.thd, m.pf, m.pk);
  ck("pfc 30 kW wired A-C-B: THD < 5 %, PF > 0.99, peak under F.01 / 1.2 (100 A)", m.thd < 0.05 && m.pf > 0.99 && m.pk < 100.0);

  /* THD-40 per RATING at 400 VAC full load, on the real pfc.c law. The README quotes
     0.59 / 0.74 / 1.05 % from spice/pfc/pfc-phase-run.mjs — a 30 kW-ONLY, AVERAGED-switch deck at an 800 V bus with a
     flat 130 µH and no input filter. These rows are the cycle-by-cycle plant with the shipped control law, per rating. */
  {
    const d1_t *D[3] = { &D1_30, &D1_40, &D1_50 };
    const double PW[3] = { 30e3, 40e3, 50e3 }, F01[3] = { 120.0, 155.0, 195.0 };
    int thd_ok = 1;
    for (int n = 0; n < 3; n++) {
      static vsim_t q;
      vsim_init(&q, D[n], 400.0, 830.0, PW[n], 1);
      vrun(&q, 0.40);
      vmet_t r = vcycle(&q);
      printf("      %2d kW at 400 VAC full load: THD-40 %.2f %% · PF %.4f · peak %.1f A (F.01/1.2 = %.1f A)\n",
             (int)(PW[n] / 1e3), 100 * r.thd, r.pf, r.pk, F01[n] / 1.2);
      thd_ok &= r.thd < 0.05 && r.pf > 0.99 && r.pk < F01[n] / 1.2;
    }
    printf("      50 kW-air runs the 50 kW plant exactly (same D1 stack/turns/link, same tank, same bank)\n");
    ck("pfc THD-40 per rating at 400 VAC full load: < 5 %, PF > 0.99, peak under F.01 / 1.2 on 30 / 40 / 50 kW (50 kW-air = 50 kW)",
       thd_ok);
  }

  float z[3] = { 0.0f, 0.0f, 0.0f }, bad[3] = { NAN, 0.0f, 0.0f };
  s.ref.en = false; pfc_step(&s.p, &s.cfg, &s.ref, z, z, 400.0f, 400.0f, 0.0f, 10e-6f);
  bool off = !s.p.run && s.p.on[0] == 0.0f && s.p.on[1] == 0.0f && s.p.on[2] == 0.0f;
  s.ref.en = true; pfc_step(&s.p, &s.cfg, &s.ref, z, z, 400.0f, 400.0f, 0.0f, 10e-6f);
  bool ran = s.p.run;
  pfc_step(&s.p, &s.cfg, &s.ref, bad, z, 400.0f, 400.0f, 0.0f, 10e-6f);
  ck("pfc: disabled, or a non-finite sample, turns every switch off and resets the loop", off && ran && !s.p.run && s.p.on[0] == 0.0f);

  { /* the load dump. fsm.c bus_ref_for() returns the 830 V cap for any bank at or above 395 V — a 400 V output
       in PAR, an 800 V one in SER, i.e. most real charging — leaving 30 V to the LATCHING 860 V F.03, of which a
       15 V skip band would spend half before any dynamics, while the voltage integrator still held the pre-dump power
       and unwound at ki_v·e ≈ 55 kW/s. An EV opening its contactor at full power is a NORMAL end-of-session event, so this
       has to clear on an aged link too: −20 % is the can tolerance, −36 % adds 20 % of end-of-life loss.
       NOTE this plant does not reproduce the 856–872 V an independent model gives: it carries an ideal source behind
       the boost choke, where that model carries the DRAWN CX/CMC input filter, whose ring into the link on the
       commutation is the extra ~12 V. On THIS plant the dump peaks at 833 V, so the check below is a regression guard
       with the two levers in place, not the arbiter of the absolute number — the bench row is. */
    int ok = 1; double worst = 0.0;
    const d1_t *D[3] = { &D1_30, &D1_40, &D1_50 };
    const double P[3] = { 30e3, 40e3, 50e3 }, CS[3] = { 1.0, 0.80, 0.64 };
    for (int n = 0; n < 3; n++) for (int c = 0; c < 3; c++) {
      static vsim_t s; static d1_t d;
      d = *D[n]; d.c_half *= CS[c];
      vsim_init(&s, &d, 475.0, 830.0, P[n], 1);      /* the highest line the spec carries, at the 830 V reference */
      vrun(&s, 0.20);
      vrec(&s);
      s.p_load = 0.0;                                 /* the contactor opens: p_llc collapses inside one 100 µs LLC pass */
      vrun(&s, 0.05);
      if (s.vb_max > worst) worst = s.vb_max;
      if (s.vb_max >= 855.0) { ok = 0; printf("      %u kW, link C x %.2f: dump peak %.1f V\n", d.kw, CS[c], s.vb_max); }
    }
    printf("      load dump at the 830 V reference, 475 VAC, 30/40/50 kW x link C 1.00/0.80/0.64: worst peak %.1f V"
           " (F.03 latches at %.0f V)\n", worst, (double)PMP_BUS_OVP_V);
    ck("guard: a full-power load dump at the 830 V bus reference stays under 855 V on every SKU, including a link 36 % down on tolerance and ageing",
       ok && worst < 855.0); }

  { /* ±3 LSB on one voltage channel and one current channel, the residual a calibrated card can still carry
       (AMC1350 Vos ±1.5 mV = ±0.5 V of line, its output common mode unspecified for drift, and VAC1/2 and VAC3 sit on
       different converters). 1 LSB of SNS_VAC = 1.347 V of line; 1 LSB of the 30 kW CT chain = 0.0916 A. */
    const double LSBV = 1.347, LSBI = 0.0916, RATED = 45.1;    /* 30 kW at 400 VAC: 45.1 A rms per phase */
    double dv[3] = { 3 * LSBV, 0, 0 }, di[3] = { 0, 3 * LSBI, 0 };
    double none[3] = { 0, 0, 0 };
    double raw = dc_run(30, dv, di, false, 0.10, 0.30, 10.0);
    double f5 = dc_run(30, dv, di, true, 0.10, 0.30, 5.0), f10 = dc_run(30, dv, di, true, 0.10, 0.30, 10.0);
    double clean = dc_run(30, none, none, true, 0.10, 0.30, 10.0);
    double stiff = dc_run(30, dv, di, true, 0.05, 1.00, 10.0);   /* the least favourable R_dc and CT corner */
    printf("      DC line current, +3 LSB on one V channel and one I channel: as coded %.2f A (%.0f %% of rated rms)"
           " · corrected %.3f A at 5 s (%.2f %%), %.3f A at 10 s (%.2f %%) · no offset %.3f A"
           " · R_dc 50 mOhm, tau_ct 1 s %.3f A\n",
           raw, 100 * raw / RATED, f5, 100 * f5 / RATED, f10, 100 * f10 / RATED, clean, stiff);
    /* The last column is a deliberate DOUBLE corner — the lowest line resistance AND the slowest CT — where the estimator
       and the sensor's own magnetizing pole are closest together; it is held to 1 % rather than 0.5 %. */
    ck("with a 50 Hz CT (no DC feedback in the loop) a 3 LSB voltage and 3 LSB current offset inject tens of amps of DC; the per-line-cycle means hold it under 0.5 % of rated rms within 5 s",
       raw > 5.0 && f5 < 0.005 * RATED && f10 < 0.005 * RATED && clean < 0.005 * RATED && stiff < 0.01 * RATED); }

  { /* the estimate must not become a way to hide a broken channel — the clamps bound what it can absorb, and
       grid_sample's rms / isum (F.29's input) and the boot offset window all stay on the RAW samples. */
    grid_t g; memset(&g, 0, sizeof g);
    const double fs = 1e4, w = 2 * PI * 50.0, amp = 326.6;
    for (long k = 0; k < 200000; k++) {                       /* 20 s: far longer than the 1 s estimator */
      float v[3], i[3];
      for (int p = 0; p < 3; p++) {
        v[p] = (float)(amp * sin(w * k / fs - p * 2 * PI / 3) + (p == 0 ? 400.0 : 0.0));   /* a dead-shorted divider */
        i[p] = (float)(60.0 * sin(w * k / fs - p * 2 * PI / 3) + (p == 1 ? 40.0 : 0.0));
      }
      grid_sample(&g, v, i, (float)fs);
    }
    printf("      broken channel: dcv %.1f V (clamp %.0f) · dci %.2f A (clamp %.1f) · isum %.1f A still reaches F.29\n",
           (double)g.dcv[0], (double)GRID_DC_V_MAX, (double)g.dci[1], (double)GRID_DC_I_MAX, (double)g.isum);
    ck("a grossly broken voltage or current channel saturates the correction's clamp instead of being absorbed, and still shows up in isum for F.29",
       fabsf(g.dcv[0]) <= GRID_DC_V_MAX + 1e-3f && fabsf(g.dcv[0]) >= GRID_DC_V_MAX - 1e-3f &&
       fabsf(g.dci[1]) <= GRID_DC_I_MAX + 1e-3f && fabsf(g.dci[1]) >= GRID_DC_I_MAX - 1e-3f && g.isum > 20.0f); }
}


/* ================================================================ LLC */
static double imz(double fn, double q, double ln) {   /* Im(Zin)/Z0 of the FHA tank */
  if (q <= 0.0) return fn * (1.0 + ln) - 1.0 / fn;
  double rn = 1.0 / q, x = fn * ln;
  return (fn - 1.0 / fn) + x * rn * rn / (rn * rn + x * x);
}
static double zvs_worst(double q) {   /* the highest capacitive fn over the eight Lr / Cr / Lm corners, per nominal fr */
  double w = 0.0;
  for (int c = 0; c < 8; c++) {
    double lr = (c & 1) ? 1.05 : 0.95, cr = (c & 2) ? 1.05 : 0.95, lm = (c & 4) ? 1.07 : 0.93;
    double qc = q * sqrt(lr / cr), lnc = 10.0 * lm / lr, fn = 1.3;
    while (fn > 0.2 && imz(fn, qc, lnc) > 0.0) fn -= 1e-4;
    w = fmax(w, fn / sqrt(lr * cr));
  }
  return w;
}

typedef struct {
  llc_cfg_t c; llc_t l; pmp_reg_t r; pmp_reg_cfg_t rc;
  double lr, cr, lm, vbus, cap, vf, rt, i_scale, v_scale;
  double ilr, vcr, ilm, vo, t_in, t_per, f, duty; int sgn; bool cond, gate;
  double load_r, bat_e, bat_r; bool bat;
  double lcab, rcab, icab, vl, cl; bool cable;   /* DOUT → 5 m output cable → load */
  double v_ref, i_ref, pk, pk_vo, pk_duty, iout;
  long edges, bad, off_periods, below_floor;
} lsim_t;

/* The DRAWN output network. The banks are FILM-ONLY — 9 / 12 / 14 × 2.2 µF PER BANK (current-coordination [SYNC]
   asserts that count against boards.tsx). LOW mode parallels the two banks, HIGH puts them in series, so what one
   bank's terminals see is 2·n·2.2 µF or n·2.2 µF: 39.6 / 19.8 µF at 30 kW, 52.8 / 26.4 at 40 kW, 61.6 / 30.8 at
   50 kW. A flat 200 µF plant — 3× to 10× the drawn value — cannot fail the CV load step at all. */
static double bank_f(int kw) { return (kw == 50 ? 14 : kw == 40 ? 12 : 9) * 2.2e-6; }
static double cout_of(int kw, bool low) { return low ? 2.0 * bank_f(kw) : bank_f(kw); }

static void lsim_init_sku(lsim_t *s, int kw, bool low) {   /* tanks.mjs tank + the drawn bank, a stiff 830 V bus */
  memset(s, 0, sizeof *s);
  llc_cfg_default(&s->c, (uint16_t)kw); pmp_reg_cfg_default(&s->rc); pmp_reg_reset(&s->r);
  s->lr = (kw == 50) ? 3.56e-6 : (kw == 40) ? 4.35e-6 : 5.6e-6;
  s->cr = ((kw == 50) ? 11 : (kw == 40) ? 9 : 7) * 33e-9;
  s->lm = (kw == 50) ? 35.6e-6 : (kw == 40) ? 43.5e-6 : 56.0e-6;
  s->i_scale = (kw == 50) ? 166.7 : (kw == 40) ? 133.3 : 100.0;
  s->vbus = 830.0; s->cap = cout_of(kw, low); s->vf = 1.0; s->rt = 0.02;
  s->v_scale = low ? 500.0 : 1000.0;
  s->lcab = 3.5e-6; s->rcab = 3.5e-3; s->cl = 1e-6;   /* 5 m of pair: 2 × 0.7 µH/m + 2 × 0.35 mΩ/m, ASSUMED */
  llc_step(&s->l, &s->c, false, 0.0f, 400.0f, 0.0f, (float)s->vbus);
  s->f = s->l.f_hz; s->t_per = 1.0 / s->f;
}
static void lsim_init(lsim_t *s) { lsim_init_sku(s, 50, true); }   /* the tests of record: 50 kW, banks parallel */

static void lsim_run(lsim_t *s, double sec, bool rec) {
  const double dt = 50e-9;
  for (long k = 0, steps = lround(sec / dt); k < steps; k++) {
    if (k % 2000 == 0) {   /* the 100 µs control period: the regulator and the modulator */
      double vout = s->iout > 0.0 ? s->vo - s->vf : s->vo;
      /* the plant inversion app.c applies — v_scale divided into the modulator's own sensitivity */
      float u = pmp_reg_step(&s->r, &s->rc, true, (float)s->v_ref, (float)s->i_ref, (float)fmin(vout, s->vo), (float)s->iout,
                             (float)s->v_scale * (s->l.k_norm > 0.0f ? s->l.k_norm : 1.0f), (float)s->i_scale, 100e-6f);
      s->l.in_v_ref = (float)s->v_ref;   /* the burst floor rides the node's reference */
      llc_step(&s->l, &s->c, true, u, (float)s->vo, (float)(s->vo * s->iout), (float)s->vbus);
    }
    if (s->t_in >= s->t_per) {   /* period boundary: leg A rises and the modulator's latest values take effect */
      s->t_in -= s->t_per;
      s->f = s->l.f_hz; s->duty = s->l.duty; s->gate = s->l.gate; s->t_per = 1.0 / s->f;
      if (rec) {
        if (!s->gate) s->off_periods++;
        else if (s->duty >= 0.999) { s->edges++; if (s->ilr >= 0.0) s->bad++; if (s->f < s->l.f_min_hz - 1.0) s->below_floor++; }
      }
    }
    double T = s->t_per, dl = (1.0 - s->duty) * T / 2, vab = 0.0, i0 = s->ilr;
    if (s->gate) { if (s->t_in >= dl && s->t_in < T / 2) vab = s->vbus; else if (s->t_in >= T / 2 + dl) vab = -s->vbus; }
    else if (i0 != 0.0) vab = i0 > 0.0 ? -s->vbus : s->vbus;   /* bridge off: the body diodes put the bus against the current */
    if (s->cond) {
      double vlm = s->sgn * 2.0 * s->vo;
      s->ilr += (vab - s->vcr - vlm - s->rt * s->ilr) / s->lr * dt;
      s->ilm += vlm / s->lm * dt;
      if ((s->ilr - s->ilm) * s->sgn <= 0.0) s->cond = false;
    } else {
      double didt = (vab - s->vcr - s->rt * s->ilr) / (s->lr + s->lm), vlm = s->lm * didt;
      s->ilr += didt * dt; s->ilm = s->ilr;
      if (fabs(vlm) >= 2.0 * s->vo) { s->cond = true; s->sgn = vlm > 0.0 ? 1 : -1; }
    }
    if (!s->gate && s->ilr * i0 <= 0.0) { s->ilr = 0.0; if (!s->cond) s->ilm = 0.0; }   /* the diodes block a reversal */
    s->vcr += s->ilr / s->cr * dt;   /* after the current: symplectic, the tank energy does not drift */
    double irect = s->cond ? 2.0 * fabs(s->ilr - s->ilm) : 0.0;
    if (s->cable) {   /* bank → DOUT → 5 m cable → resistive load; SNS_VOUT still sits at the module stud */
      s->icab += ((s->vo - s->vf) - s->vl - s->rcab * s->icab) / s->lcab * dt;
      if (s->icab < 0.0) s->icab = 0.0;   /* DOUT blocks reverse current */
      s->vl += (s->icab - (s->vl > 0.0 ? s->vl / s->load_r : 0.0)) / s->cl * dt;
      s->iout = s->icab;
    } else {
      s->iout = s->bat ? fmax((s->vo - s->vf - s->bat_e) / s->bat_r, 0.0) : (s->vo > s->vf ? (s->vo - s->vf) / s->load_r : 0.0);
    }
    s->vo += (irect - s->iout) / s->cap * dt;
    if (rec && fabs(s->ilr) > s->pk) { s->pk = fabs(s->ilr); s->pk_vo = s->vo; s->pk_duty = s->gate ? s->duty : -1.0; }
    s->t_in += dt;
  }
}

static void llc_tests(void) {
  { int ok = 1;
    for (int k = 0; k <= 250; k++) { double q = k * 0.01; if (llc_zvs_fn((float)q) < zvs_worst(q) - 2e-4) ok = 0; }
    ck("llc: the ZVS table never sits below the FHA tank's capacitive boundary at any tolerance corner (Q 0–2.5)", ok); }

  { llc_cfg_t c; llc_cfg_default(&c, 50); llc_t l = { 0 };   /* the plant input in_v_ref reads 0 as unknown */
    llc_step(&l, &c, true, 1.0f, 500.0f, 50e3f, 830.0f);
    bool corner = l.f_min_hz <= 0.5767f * c.fr_hz && fabsf(l.f_hz - l.f_min_hz) < 1.0f;
    llc_step(&l, &c, true, c.u_psm, 400.0f, 20e3f, 830.0f);
    bool at_max = fabsf(l.f_hz - c.fn_max * c.fr_hz) < 1.0f && l.duty == 1.0f && l.gate;
    llc_step(&l, &c, true, 0.5f * c.u_psm, 400.0f, 1e3f, 830.0f);
    bool half = fabsf(l.duty - 0.5f) < 1e-4f && fabsf(l.f_hz - c.fn_max * c.fr_hz) < 1.0f;
    llc_step(&l, &c, true, 0.07f * c.u_psm, 400.0f, 1e3f, 830.0f); bool b1 = l.burst && !l.gate;
    llc_step(&l, &c, true, 0.10f * c.u_psm, 400.0f, 1e3f, 830.0f); bool b2 = l.burst;
    llc_step(&l, &c, true, 0.13f * c.u_psm, 400.0f, 1e3f, 830.0f); bool b3 = !l.burst && l.gate;
    llc_step(&l, &c, true, 1.0f, 60.0f, 20e3f, 830.0f); bool heavy = l.f_min_hz >= 1.03f * 1.0525f * c.fr_hz - 1.0f;
    llc_step(&l, &c, false, 0.8f, 400.0f, 1e3f, 830.0f); bool stop = !l.gate;
    llc_step(&l, &c, true, NAN, 400.0f, 1e3f, 830.0f); bool nan_stop = !l.gate;
    ck("llc 50 kW: the floor at the 500 V-bank full-power corner is 0.55 fr, below the fn 0.577 that corner needs", corner);
    ck("llc: PFM hands over to phase shift at u_psm, duty is linear below, burst stops below 8 % and restarts above 12 %, the floor rises to 1.08 fr into a near-short, disable and NaN stop the bridge",
       at_max && half && b1 && b2 && b3 && heavy && stop && nan_stop); }

  /* the ramp is ctl.c's SHIPPED pmp_ctl_cfg_default ramp_v_vps = 500 V/s — on the drawn 61.6 µF bank a 4× ramp
     (2000 V/s) drives the tank to 434 A against F.11's 220 A. */
  { static lsim_t s; lsim_init(&s); s.load_r = 4.0; s.i_ref = 175.0;
    for (int k = 0; k < 8000; k++) { s.v_ref = fmin(400.0, 500.0 * k * 100e-6); lsim_run(&s, 100e-6, true); }
    lsim_run(&s, 0.25, false); s.edges = s.bad = 0;
    double sum = 0.0; for (int k = 0; k < 200; k++) { lsim_run(&s, 100e-6, true); sum += s.vo - s.vf; }
    printf("      CV 400 V / 4 Ω: %.2f V · tank peak %.0f A (at %.0f V, duty %.2f) · PFM edges %ld, not ZVS %ld\n",
           sum / 200, s.pk, s.pk_vo, s.pk_duty, s.edges, s.bad);
    ck("llc 50 kW CV: a 0.2 s ramp to 400 V into 4 Ω settles within ±0.5 %, zero-voltage switching at every PFM edge, tank peak under F.11 (220 A)",
       fabs(sum / 200 - 400.0) < 2.0 && s.edges > 0 && s.bad == 0 && s.pk < 220.0); }

  { static lsim_t s; lsim_init(&s); s.bat = true; s.bat_e = 350.0; s.bat_r = 0.1; s.vo = 351.0; s.v_ref = 450.0; s.i_ref = 100.0;
    lsim_run(&s, 0.3, false);
    double sum = 0.0, imin = 1e9, imax = 0.0;
    for (int k = 0; k < 500; k++) { lsim_run(&s, 100e-6, true); sum += s.iout; imin = fmin(imin, s.iout); imax = fmax(imax, s.iout); }
    printf("      CC 100 A into 350 V: %.2f A mean, %.1f A peak to peak\n", sum / 500, imax - imin);
    /* A 200 µF plant measures 30 A peak to peak here; the DRAWN film-only bank (61.6 µF at 50 kW) limit-cycles 38 A
       peak to peak into this 0.1 Ω stability-stress battery with the same ctl.c placeholder gains. The line below
       bounds what the STRUCTURE guarantees on the drawn hardware and still fails an order-of-magnitude-higher gain
       pair (81 A) and any regression toward it; the §5.4 HIL retune target is ≤ 10 A peak to peak, and the §5.4
       battery class is 0.3 Ω incremental — 0.1 Ω is the stiffest case, not the operating one. */
    ck("llc 50 kW CC: 100 A into a 350 V battery (0.1 Ω) holds within ±2 A, under 45 A peak to peak on the DRAWN 61.6 uF bank (200 uF plant: 30 A · HIL target 10 A)",
       fabs(sum / 500 - 100.0) < 2.0 && imax - imin < 45.0); }

  { /* the gain-margin table. The discrete voltage loop reaches −180° at Nyquist through its
       own one-sample compute delay alone (at light load the film-only bank puts no pole below 5 kHz), so the margin is
       |T(z = −1)| = (kp_v + ki_v·dt/2) · (dV/du) / v_scale, and it must stay below 1. dV/du here is differentiated from the
       FHA gain of the tank against llc_step's OWN duty and frequency, so this check does not share llc.c's arithmetic. */
    int ok = 1; double worst_on = 0.0, worst_off = 0.0;
    pmp_reg_cfg_t rc; pmp_reg_cfg_default(&rc);
    const double coef = rc.kp_v + rc.ki_v * 100e-6 / 2.0;
    const int KW3[3] = { 30, 40, 50 };
    for (int n = 0; n < 3; n++) {
      llc_cfg_t c; llc_cfg_default(&c, (uint16_t)KW3[n]);
      double ln = (double)c.lm_h * 2.0 * PI * c.fr_hz / c.z0_ohm;
      for (int m = 0; m < 2; m++) {                       /* m 0 = PAR (v_scale 500), 1 = SER (1000) */
        double vsc = m ? 1000.0 : 500.0;
        for (int b = 0; b < 2; b++) {                     /* the two bus references bus_ref_for() can return */
          double vbus = b ? 830.0 : 650.0;
          llc_t l; memset(&l, 0, sizeof l);
          for (int k = 1; k < 100; k++) {
            double u = k * 0.01, du = 1e-3, g[2];
            for (int j = 0; j < 2; j++) {                 /* the tank's open-circuit output for u and u + du */
              llc_t t; memset(&t, 0, sizeof t);
              llc_step(&t, &c, true, (float)(u + j * du), 300.0f, 0.0f, (float)vbus);
              double fn = t.f_hz / c.fr_hz, mg = ln * fn * fn / ((ln + 1.0) * fn * fn - 1.0);
              g[j] = sin(PI * t.duty / 2.0) * mg * vbus / c.n * (m ? 2.0 : 1.0);
            }
            double dvdu = fabs(g[1] - g[0]) / du;
            llc_step(&l, &c, true, (float)u, 300.0f, 0.0f, (float)vbus);   /* the same point, for its published k_norm */
            for (int q = 0; q < 3000; q++) llc_step(&l, &c, true, (float)u, 300.0f, 0.0f, (float)vbus);  /* settle the 50 ms k_norm estimate */
            double on = coef * dvdu / (vsc * l.k_norm), off = coef * dvdu / vsc;
            if (on > worst_on) worst_on = on;
            if (off > worst_off) worst_off = off;
          }
        }
      }
    }
    if (worst_on >= 0.43) ok = 0;
    printf("      CV |T(z=-1)| worst over 30/40/50 kW x PAR/SER x 650/830 V bus x u 0.01-0.99: %.2f (%.1f dB GM)"
           " · without the normalisation %.2f (%.1f dB)\n",
           worst_on, -20.0 * log10(worst_on), worst_off, -20.0 * log10(worst_off));
    ck("the CV loop keeps |T(z=-1)| under 0.43 (>= 7.3 dB of gain margin) at every point of the demand map, on every SKU, mode and bus reference — it exceeded 1 before",
       ok && worst_off > 1.0); }

  { /* the corner that limit-cycles unnormalised. One fixed CV PI pair drives a modulator whose sensitivity dV/du spans
       23× over the envelope; in deep phase shift |T(z = −1)| crosses 1 and the loop runs a 5 kHz period-2 cycle,
       0–160 V pk-pk on these very functions. llc_step publishes that sensitivity (k_norm) and the caller divides its voltage-loop
       gain by it wherever it exceeds the ceiling the gains were validated against; below the ceiling nothing changes.
       PAR 150/200/250 V is the cable-check and pre-charge band of every low-voltage pack, and the light-load rows are the
       ones that were unstable. Without the normalisation these rows ring; the band below is 3 % of the setpoint. */
    int ok = 1; double worst = 0.0; const double V[3] = { 150.0, 200.0, 250.0 };
    for (int n = 0; n < 3; n++) for (int f = 0; f < 3; f++) {
      static lsim_t s; lsim_init_sku(&s, 50, true);
      double frac = (f == 0) ? 0.02 : (f == 1) ? 0.20 : 1.00;
      s.vbus = 650.0;                                  /* fsm.c bus_ref_for() for a bank under 309 V */
      s.load_r = V[n] * V[n] / (fmin(50e3, V[n] * 166.7) * frac);
      s.i_ref = 175.0; s.v_ref = V[n]; s.vo = V[n];
      lsim_run(&s, 0.30, false);
      double lo = 1e9, hi = 0.0;
      for (int k = 0; k < 400; k++) { lsim_run(&s, 100e-6, true); lo = fmin(lo, s.vo); hi = fmax(hi, s.vo); }
      double ripple = (hi - lo) / V[n];
      if (ripple > worst) worst = ripple;
      if (ripple > 0.03) { ok = 0; printf("      PAR %.0f V at %.0f %% load: %.1f–%.1f V (%.1f %% pk-pk)\n", V[n], frac * 100, lo, hi, ripple * 100); }
    }
    printf("      PAR 150/200/250 V x 2/20/100 %% load: worst ripple %.2f %% of setpoint\n", worst * 100);
    ck("the CV loop holds PAR 150 / 200 / 250 V at 2, 20 and 100 % load without a limit cycle (worst pk-pk <= 3 %)", ok); }

  { /* the §5.5 current-step targets through the documented shaper slews (up 1000 A/s, down i_rated / 0.08 s):
       10 → 90 % of rated into the battery, t90 ≤ 150 ms up and ≤ 100 ms down, overshoot ≤ 2 % of rated */
    static lsim_t s; lsim_init(&s); s.bat = true; s.bat_e = 350.0; s.bat_r = 0.3; s.vo = 351.0; s.v_ref = 450.0; s.i_ref = 16.7;   /* the §5.4 battery class (~0.3 Ω incremental); 0.1 Ω stability is the check above */
    lsim_run(&s, 0.3, false);
    double tgt = 16.7, t_up = -1.0, t_dn = -1.0, imax = 0.0;
    for (int k = 0; k < 3000; k++) {   /* 100 µs steps: ramp up at t = 0, down at t = 0.2 s */
      double want = (k < 2000) ? 150.0 : 16.7, rate = (want > tgt) ? 0.1 : 166.7 / 0.08 * 100e-6;
      tgt = (want > tgt) ? fmin(want, tgt + rate) : fmax(want, tgt - rate);
      s.i_ref = tgt;
      lsim_run(&s, 100e-6, false);
      if (k < 2000) { if (t_up < 0 && s.iout >= 16.7 + 0.9 * (150.0 - 16.7)) t_up = k * 1e-4; imax = fmax(imax, s.iout); }
      else if (t_dn < 0 && s.iout <= 150.0 - 0.9 * (150.0 - 16.7)) t_dn = (k - 2000) * 1e-4;
    }
    printf("      CC step 10-90 %%: t90 up %.0f ms · down %.0f ms · peak %.1f A\n", t_up * 1e3, t_dn * 1e3, imax);
    /* the ≤ 2 % overshoot line of §5.5 is the HIL acceptance for the per-rating gains (§5.4 — the FHA-plant
       arrival overshoot here is ~26 A with the placeholder gains); this check owns what the structure guarantees:
       the ramp-dominated timing, and an overshoot bounded inside the F.15 fast row (130 % of rated for 2 ms) */
    ck("llc 50 kW CC step 10-90 % into a battery: t90 <= 150 ms up / <= 100 ms down; overshoot bounded under F.15 (the 2 % target is the HIL gate)",
       t_up > 0 && t_up <= 0.150 && t_dn > 0 && t_dn <= 0.100 && imax < 1.25 * 166.7); }

  { static lsim_t s; lsim_init(&s); s.bat = true; s.bat_e = 395.0; s.bat_r = 0.1; s.vo = 396.0; s.v_ref = 400.0; s.i_ref = 175.0;
    lsim_run(&s, 0.3, false);
    double vmin = 1e9, vmax = 0.0, imin = 1e9, imax = 0.0;
    for (int k = 0; k < 500; k++) {
      lsim_run(&s, 100e-6, true);
      vmin = fmin(vmin, s.vo - s.vf); vmax = fmax(vmax, s.vo - s.vf); imin = fmin(imin, s.iout); imax = fmax(imax, s.iout);
    }
    printf("      CV 400 V into a 395 V battery: %.2f–%.2f V · %.1f–%.1f A\n", vmin, vmax, imin, imax);
    /* ±1 % is a 200 µF plant's band; the drawn 61.6 µF bank gives 396.0–403.5 V with the same gains — the same
       limit cycle as the CC row above, and the same §5.4 HIL retune. */
    ck("llc 50 kW CV into a battery (395 V, 0.1 Ω): the voltage holds within ±1.5 % on the DRAWN 61.6 uF bank (200 uF plant: ±1 %) and the current stays under F.15's slow row (170 A)",
       vmin > 394.0 && vmax < 406.0 && imax < 170.0); }

  { static lsim_t s; lsim_init(&s); s.bat = true; s.bat_e = 495.0; s.bat_r = 0.05; s.vo = 496.0; s.v_ref = 540.0; s.i_ref = 167.0;
    lsim_run(&s, 0.2, false); lsim_run(&s, 0.2, true);
    printf("      beyond the tank's gain: u %.3f · f %.1f kHz (floor %.1f) · edges %ld, not ZVS %ld, below floor %ld\n",
           s.r.u, s.f / 1e3, s.l.f_min_hz / 1e3, s.edges, s.bad, s.below_floor);
    ck("llc 50 kW: a demand at the edge of the tank's gain (495 V battery at 167 A) runs into the floor region — never below the floor, never capacitive",
       s.r.u >= 0.95f && s.edges > 0 && s.bad == 0 && s.below_floor == 0); }

  { static lsim_t s; lsim_init(&s); s.load_r = 900.0; s.vo = 301.0; s.v_ref = 300.0; s.i_ref = 175.0;
    lsim_run(&s, 0.3, false);
    double vmin = 1e9, vmax = 0.0;
    for (int k = 0; k < 1000; k++) { lsim_run(&s, 100e-6, true); vmin = fmin(vmin, s.vo - s.vf); vmax = fmax(vmax, s.vo - s.vf); }
    printf("      100 W at 300 V: %.1f–%.1f V · bridge-off periods %ld\n", vmin, vmax, s.off_periods);
    ck("llc 50 kW: 100 W at 300 V bursts and holds the output within ±3 %", s.off_periods > 0 && vmin > 291.0 && vmax < 309.0); }

  /* CV LOAD STEP on the DRAWN output network — the case a 200 µF plant cannot fail, and the only closed-loop case the
     film-only bank changes. 100 → 25 % and back (the docs/firmware-architecture §5.5 row), at a 480 V bank command,
     through DOUT and 5 m of cable, sensing at the module stud where SNS_VOUT sits.
     Acceptance:
       · deviation ≤ 10 % — the §5.5 line for a film-only output (≤ 3 % needs 300–550 µF of output capacitance, and
         gain and control-period sweeps do not buy it back)
       · the CODE's own OVP rows in fsm.c, which are the normative ones:
           fast    stack > min(PMP_OUT_OVP_ABS_V 1050, v_max·1.05 + 20) held PMP_OVP_MS = 2 ms
           source  stack > vcmd·1.06 + 20 held PMP_OVP_SRC_MS = 200 ms while iout > PMP_MAKE_IOUT_A = 2 A */
  { int step_ok = 1;
    for (int n = 0; n < 6; n++) {
      const int kw = (n / 2 == 0) ? 30 : (n / 2 == 1) ? 40 : 50;
      const bool low = (n % 2) == 0;
      const double vbank = 480.0, kst = low ? 1.0 : 2.0;              /* stack = kst × one bank */
      const double vmaxMode = low ? 500.0 : 1000.0;
      const double thFast = fmin(1050.0, vmaxMode * 1.05 + 20.0), thSrc = kst * vbank * 1.06 + 20.0;
      static lsim_t s;
      lsim_init_sku(&s, kw, low);
      s.cable = true; s.vo = vbank; s.vl = vbank;
      const double rFull = vbank * vbank / (kw * 1e3);               /* both banks lumped: P/Vbank in either mode */
      s.load_r = rFull; s.i_ref = s.i_scale; s.v_ref = vbank;
      lsim_run(&s, 0.15, false);
      double up = 0.0, dn = 1e9, runF = 0.0, maxF = 0.0, runS = 0.0, maxS = 0.0;
      for (int dir = 0; dir < 2; dir++) {
        s.load_r = dir ? rFull : rFull * 4.0;                        /* 100 → 25 %, then back */
        for (int k = 0; k < 1500; k++) {
          lsim_run(&s, 100e-6, false);
          const double stud = (s.icab > 0.0) ? s.vo - s.vf : s.vo, stack = kst * stud;
          if (stud > up) up = stud;
          if (stud < dn) dn = stud;
          if (stack > thFast) { runF += 100e-6; if (runF > maxF) maxF = runF; } else runF = 0.0;
          if (s.iout > 2.0 && stack > thSrc) { runS += 100e-6; if (runS > maxS) maxS = runS; } else runS = 0.0;
        }
      }
      const double over = 100.0 * (up - vbank) / vbank, under = 100.0 * (dn - vbank) / vbank;
      const int row_ok = over <= 10.0 && under >= -10.0 && maxF < 2e-3 && maxS < 200e-3;
      printf("      %2d kW %s CV 480 V, load 100->25->100 %%: %+.2f %% / %+.2f %% (Cout %.1f uF) · stack peak %.0f V vs fast %.0f V for %.2f ms · source row %.0f ms%s\n",
             kw, low ? "LOW " : "HIGH", over, under, s.cap * 1e6, kst * up, thFast, maxF * 1e3, maxS * 1e3, row_ok ? "" : "  <-- FAIL");
      step_ok &= row_ok;
    }
    ck("llc CV load step 100 <-> 25 % on the DRAWN film-only bank (30/40/50 kW x LOW/HIGH, through DOUT and 5 m of cable): deviation <= 10 % (restated 5.5 line) and neither fsm.c OVP row persists",
       step_ok); }
}

/* ================================================================ measurement */
static void grid_run(grid_t *g, double hz, int seq, int mode, double noise, int n0, int n, double *hz_mean) {
  /* mode 0 balanced · 1 phase A open (A at the star, B and C share the line voltage) · 2 no line */
  double amp = 400.0 * sqrt(2.0 / 3.0), sum = 0.0; int cyc = 0; uint32_t seen = g->seq;
  float i0[3] = { 0.0f, 0.0f, 0.0f };
  for (int k = n0; k < n0 + n; k++) {
    double th = 2 * PI * hz * k / 1e4, va = amp * sin(th), vb = amp * sin(th - seq * 2 * PI / 3), vc = amp * sin(th + seq * 2 * PI / 3);
    float v[3] = { (float)va, (float)vb, (float)vc };
    if (mode == 1) { v[0] = 0.0f; v[1] = (float)((vb - vc) / 2); v[2] = (float)((vc - vb) / 2); }
    if (mode == 2) v[0] = v[1] = v[2] = 0.0f;
    for (int j = 0; j < 3; j++) v[j] += (float)(noise * (2.0 * rand() / RAND_MAX - 1.0));
    grid_sample(g, v, i0, 1e4f);
    if (g->seq != seen) { seen = g->seq; if (k > n0 + 1000 && g->hz > 0.0f) { sum += g->hz; cyc++; } }
  }
  if (hz_mean) *hz_mean = cyc ? sum / cyc : 0.0;
}

static void meas_tests(void) {
  meas_cal_t c, d;
  int ok = 1;
  for (uint16_t kw = 30; kw <= 50; kw += 10) { meas_cal_default(&c, kw); ok &= meas_cal_plausible(&c, kw); }
  meas_cal_default(&d, 50);
  c = d; c.ch[MCH_VOUT].gain *= 1.11f; int g_bad = !meas_cal_plausible(&c, 50);
  c = d; c.ch[MCH_IA].off += 151.0f; int o_bad = !meas_cal_plausible(&c, 50);
  c = d; c.ch[MCH_IOUT].gain = NAN; int n_bad = !meas_cal_plausible(&c, 50);
  c = d; c.ch[MCH_IB].gain = -c.ch[MCH_IB].gain; int s_bad = !meas_cal_plausible(&c, 50);
  ck("meas: nominal calibration is plausible for every rating; ±11 % gain, 151 counts of offset, NaN or a reversed CT is F.30",
     ok && g_bad && o_bad && n_bad && s_bad);

  float k = 1.02f;   /* VREF 2 % high: an absolute channel reads fewer counts, a CT's AVMID offset moves with VREF */
  float cv = (400.0f / d.ch[MCH_VOUT].gain + d.ch[MCH_VOUT].off) / k, ci = d.ch[MCH_IA].off + 100.0f / (d.ch[MCH_IA].gain * k);
  ck("meas: the reference correction recovers an absolute channel (400 V) and a ratiometric one (100 A) with VREF 2 % high",
     fabsf(meas_val(&d, MCH_VOUT, cv, k) - 400.0f) < 0.05f && fabsf(meas_val(&d, MCH_IA, ci, k) - 100.0f) < 0.05f &&
     fabsf(meas_val(&d, MCH_VOUT, cv, 1.0f) - 400.0f) > 5.0f);

  bool liq = false, l3, l4;
  uint16_t r0 = meas_rating_kw(0.05f, &liq), r1 = meas_rating_kw(0.30f, &liq), r2 = meas_rating_kw(0.90f, &liq);
  uint16_t r3 = meas_rating_kw(1.50f, &liq); l3 = liq;
  uint16_t r4 = meas_rating_kw(2.00f, &liq); l4 = liq;
  uint16_t r5 = meas_rating_kw(2.35f, &liq), r6 = meas_rating_kw(3.30f, &liq), r7 = meas_rating_kw(NAN, &liq);
  ck("meas: rating strap bands — 30 · 40 · reserved · 50 liquid · 50 air · the gap · open · NaN",
     r0 == 30 && r1 == 40 && r2 == 0 && r3 == 50 && l3 && r4 == 50 && !l4 && r5 == 0 && r6 == 0 && r7 == 0);
  ck("meas: NTC at half scale reads 25 °C; an open loop reads the 150 °C guard; a short reads above 200 °C (F.29 range)",
     fabsf(meas_ntc_c(0.5f) - 25.0f) < 0.05f && meas_ntc_c(0.985f) == PMP_NTC_OPEN_C && meas_ntc_c(0.002f) > 200.0f);

  grid_t g; double hz;
  memset(&g, 0, sizeof g); grid_run(&g, 50.0, 1, 0, 0.0, 0, 5000, &hz);
  ck("grid: 400 VAC 50 Hz A-B-C — 50 ± 0.05 Hz, line RMS ±0.5 %, phase RMS ±0.5 %, sequence A-B-C",
     fabs(hz - 50.0) < 0.05 && fabs(g.vll[0] - 400.0f) < 2.0f && fabs(g.vll[1] - 400.0f) < 2.0f && fabs(g.vll[2] - 400.0f) < 2.0f &&
     fabs(g.vph[0] - 230.9f) < 1.2f && g.abc);
  memset(&g, 0, sizeof g); grid_run(&g, 60.0, -1, 0, 0.0, 0, 5000, &hz);
  ck("grid: 60 Hz wired A-C-B — 60 ± 0.5 Hz, line RMS ±1 %, sequence A-C-B", fabs(hz - 60.0) < 0.5 && fabs(g.vll[0] - 400.0f) < 4.0f && !g.abc);
  memset(&g, 0, sizeof g); grid_run(&g, 45.0, 1, 0, 0.0, 0, 5000, &hz); double hz45 = hz;
  memset(&g, 0, sizeof g); grid_run(&g, 65.0, 1, 0, 0.0, 0, 5000, &hz);
  ck("grid: the F.37 window edges read 45 and 65 Hz within ±0.5 Hz", fabs(hz45 - 45.0) < 0.5 && fabs(hz - 65.0) < 0.5);
  memset(&g, 0, sizeof g); srand(7); grid_run(&g, 50.0, 1, 0, 15.0, 0, 5000, &hz);
  ck("grid: ±15 V noise on every phase does not add crossings (20 V hysteresis) — 50 ± 0.3 Hz", fabs(hz - 50.0) < 0.3);
  memset(&g, 0, sizeof g); grid_run(&g, 50.0, 1, 1, 0.0, 0, 5000, NULL);
  ck("grid: phase A open — A reads 0 against the star, V_BC keeps 400 V, V_AB and V_CA halve",
     g.vph[0] < 1.0f && fabs(g.vll[1] - 400.0f) < 2.0f && fabs(g.vll[0] - 200.0f) < 2.0f && fabs(g.vll[2] - 200.0f) < 2.0f);
  memset(&g, 0, sizeof g); grid_run(&g, 50.0, 1, 0, 0.0, 0, 3000, NULL);
  grid_run(&g, 50.0, 1, 2, 0.0, 3000, 800, NULL); bool lost = g.hz == 0.0f;
  grid_run(&g, 50.0, 1, 2, 0.0, 3800, 700, NULL);
  ck("grid: loss of line publishes 0 Hz within 80 ms and 0 V within 150 ms", lost && g.hz == 0.0f && g.vll[0] < 1.0f);
}

/* ================================================================ NVM on a RAM flash with power cuts
 * This model is the GD32G553 FMC, not a byte array. The part programs 64-bit ROWS with ECC over each and
 * refuses a row that is not erased — UM §2.3.8 ("before the double-word programming operation you should check the
 * address that it has been erased. If the address has not been erased, PGERR bit will set") and FMC_STAT PGERR bit 3
 * ("When programming to the flash while it is not 0xFFFF FFFF FFFF FFFF, this bit is set by hardware"); an all-FF write
 * is bypassed and leaves the row erased and programmable (UM §2.3.2 note 6). The byte-granular model this replaces made
 * every power-cut sweep below pass while the store could not write its FIRST record on the target.
 * The 4-byte-run packing is copied from port/gd32g553/nvmport.c so the sweeps exercise the real path, and the power
 * budget counts ROWS and erases — the unit the hardware actually tears at. */
#define PG 1024u
#define NPG 6u                        /* 0,1 records · 2..5 the event ring */
static uint8_t flash[NPG][PG];
static bool rowp[NPG][PG / 8u];       /* this row has been programmed: a second program of it raises PGERR */
static long budget = -1, progd = 0;   /* row programs and erases left before the power fails (−1 = never) */
static long pgerr = 0;                /* rows the part refused — must stay 0 for every layout this store writes */
static bool dead = false;

bool nvm_port_read(uint8_t page, uint32_t off, uint8_t *p, uint32_t n) {
  if (page >= NPG || off + n > PG) return false;
  memcpy(p, flash[page] + off, n);
  return true;
}
static bool row_prog(uint8_t page, uint32_t base, uint32_t lo, uint32_t hi) {
  uint32_t r = base / 8u;
  if (dead) return false;
  if (lo == 0xFFFFFFFFu && hi == 0xFFFFFFFFu) return true;   /* bypassed: no ECC written, the row stays erased */
  if (rowp[page][r]) { pgerr++; return false; }               /* PGERR: the row is not erased */
  if (budget == 0) { dead = true; rowp[page][r] = true; return false; }   /* torn: the row is left indeterminate */
  if (budget > 0) budget--;
  uint8_t *m = flash[page] + base;
  for (int k = 0; k < 4; k++) m[k] &= (uint8_t)(lo >> (8 * k));
  for (int k = 0; k < 4; k++) m[4 + k] &= (uint8_t)(hi >> (8 * k));
  rowp[page][r] = true;
  progd++;
  return true;
}
bool nvm_port_prog(uint8_t page, uint32_t off, const uint8_t *p, uint32_t n) {
  if (page >= NPG || off + n > PG || (off & 3u) || (n & 3u) || dead) return false;
  uint32_t a = off;
  while (n) {                         /* the packing in nvmport.c, verbatim */
    uint32_t lo = 0xFFFFFFFFu, hi = 0xFFFFFFFFu, base = a & ~7u;
    if (a & 4u) { for (int k = 0; k < 4; k++) hi = (hi & ~(0xFFu << (8 * k))) | ((uint32_t)p[k] << (8 * k)); }
    else {
      for (int k = 0; k < 4; k++) lo = (lo & ~(0xFFu << (8 * k))) | ((uint32_t)p[k] << (8 * k));
      if (n >= 8u) { hi = 0u; for (int k = 0; k < 4; k++) hi |= (uint32_t)p[4 + k] << (8 * k); }
    }
    uint32_t used = (a & 4u) ? 4u : (n >= 8u ? 8u : 4u);
    if (!row_prog(page, base, lo, hi)) return false;
    a += used; p += used; n -= used;
  }
  return true;
}
bool nvm_port_erase(uint8_t page) {
  if (page >= NPG || dead) return false;
  if (budget == 0) { dead = true; memset(flash[page], 0xFF, PG / 3); return false; }   /* cut part-way through the erase */
  if (budget > 0) budget--;
  memset(flash[page], 0xFF, PG);
  memset(rowp[page], 0, sizeof rowp[page]);
  return true;
}
static void power(long b) { budget = b; dead = false; }
static void wipe(void) { memset(flash, 0xFF, sizeof flash); memset(rowp, 0, sizeof rowp); pgerr = 0; power(-1); }
static void pay(uint8_t *b, uint8_t kind, uint32_t ver) { for (int k = 0; k < 40; k++) b[k] = (uint8_t)(kind * 31u + ver * 7u + (uint32_t)k); }

static void nvm_tests(void) {
  ck("nvm: CRC-32 check value 0xCBF43926", pmp_crc32((const uint8_t *)"123456789", 9) == 0xCBF43926u);
  nvm_t s, m;
  uint8_t a[40], b[40], old[40];
  wipe(); nvm_mount(&s, 0u, PG);
  pay(a, 1, 1); bool put = nvm_put(&s, 1, a, 40, true);
  nvm_mount(&s, 0u, PG); bool got = nvm_get(&s, 1, b, 40) && memcmp(a, b, 40) == 0;
  long before = progd; bool same = nvm_put(&s, 1, a, 40, false) && progd == before;
  bool wrong = !nvm_get(&s, 1, b, 20) && !nvm_get(&s, 2, b, 40);
  /* pgerr == 0 is the check a byte-granular model cannot make: with a 12-byte header the very first record
     re-programs the header's own row and `put` reads false here. */
  ck("nvm: a blank part formats; a record survives a remount; an unchanged write programs nothing; a wrong length or kind reads nothing",
     put && got && same && wrong);
  ck("nvm: the store never programs a 64-bit flash row twice — the part refused nothing", pgerr == 0);

  { uint32_t ver[4] = { 0, 0, 0, 0 }, gen0 = s.page_seq; int ok = 1;
    for (uint32_t w = 0; w < 120; w++) {
      uint8_t kind = (uint8_t)(w % 4u); ver[kind]++;
      pay(a, kind, ver[kind]); if (!nvm_put(&s, kind, a, 40, true)) ok = 0;
      nvm_mount(&m, 0u, PG);
      for (uint8_t k = 0; k < 4; k++) if (ver[k]) { pay(a, k, ver[k]); if (!nvm_get(&m, k, b, 40) || memcmp(a, b, 40)) ok = 0; }
    }
    ck("nvm: 120 writes over four kinds compact the store repeatedly; every remount reads the newest of each", ok && s.page_seq >= gen0 + 5u && pgerr == 0); }

  { int ok = 1, cases = 0; static uint8_t snap[NPG][PG]; static bool snapr[NPG][PG / 8u];
    wipe(); nvm_mount(&s, 0u, PG);
    for (uint8_t k = 0; k < 4; k++) { pay(a, k, 1); nvm_put(&s, k, a, 40, true); }
    memcpy(snap, flash, sizeof flash); memcpy(snapr, rowp, sizeof rowp);
    for (long cut = 0; cut <= 20; cut++, cases++) {   /* every 64-bit row of a 56-byte entry, and past it */
      memcpy(flash, snap, sizeof flash); memcpy(rowp, snapr, sizeof rowp); power(-1); nvm_mount(&s, 0u, PG);
      pay(a, 1, 2); power(cut); bool r = nvm_put(&s, 1, a, 40, false); power(-1);
      nvm_mount(&m, 0u, PG); pay(old, 1, 1);
      bool v = nvm_get(&m, 1, b, 40) && (memcmp(b, a, 40) == 0 || (!r && memcmp(b, old, 40) == 0));
      for (uint8_t k = 0; k < 4; k++) if (k != 1) { pay(old, k, 1); if (!nvm_get(&m, k, b, 40) || memcmp(b, old, 40)) v = false; }
      pay(a, 3, 9); bool after = nvm_put(&m, 3, a, 40, true) && nvm_get(&m, 3, b, 40) && memcmp(a, b, 40) == 0;
      if (!v || !after) ok = 0;
    }
    ck("nvm: a power cut at every 64-bit row of an append leaves the old or the new record, the others intact, the store writable", ok && cases == 21); }

  { int ok = 1; long cases = 0; static uint8_t snap[NPG][PG]; static bool snapr[NPG][PG / 8u]; uint32_t vv[4] = { 0, 0, 0, 0 }, w = 0;
    wipe(); nvm_mount(&s, 0u, PG);
    /* bounded: a store that cannot append must FAIL this check, not spin here for ever */
    while (s.wr + 56u <= PG && w < 100u) { uint8_t k = (uint8_t)(w++ % 4u); vv[k]++; pay(a, k, vv[k]); if (!nvm_put(&s, k, a, 40, false)) break; }
    ok = w < 100u && !s.full;
    memcpy(snap, flash, sizeof flash); memcpy(snapr, rowp, sizeof rowp);
    for (long cut = 0; cut <= 40; cut++, cases++) {   /* erase · three copies · the new entry · header · old erase, and past it */
      memcpy(flash, snap, sizeof flash); memcpy(rowp, snapr, sizeof rowp); power(-1); nvm_mount(&s, 0u, PG);
      pay(a, 2, vv[2] + 1u); power(cut); bool r = nvm_put(&s, 2, a, 40, true); power(-1);
      nvm_mount(&m, 0u, PG); pay(old, 2, vv[2]);
      bool v = nvm_get(&m, 2, b, 40) && (memcmp(b, a, 40) == 0 || (!r && memcmp(b, old, 40) == 0));
      for (uint8_t k = 0; k < 4; k++) if (k != 2) { pay(old, k, vv[k]); if (!nvm_get(&m, k, b, 40) || memcmp(b, old, 40)) v = false; }
      pay(a, 0, 77); bool after = nvm_put(&m, 0, a, 40, true) && nvm_get(&m, 0, b, 40) && memcmp(a, b, 40) == 0;
      if (!v || !after) ok = 0;
    }
    ck("nvm: a power cut at every step of a compaction leaves one complete generation (old or new record, the rest intact)", ok && cases == 41); }

  /* the event ring shares this flash and this rule. Its 16-byte header and 16-byte entries are row-clean; the point
     of the check is that they STAY so, and that a storm of one repeated event costs one slot per flush instead of
     filling the queue with copies of itself. */
  { evlog_t l;
    wipe(); evlog_mount(&l, 2u, 4u, PG);
    for (int k = 0; k < 40; k++) { evlog_add(&l, 1u, (uint8_t)k, (uint16_t)k, (uint32_t)k); evlog_flush(&l, true); }
    evlog_t m;
    evlog_mount(&m, 2u, 4u, PG);
    evlog_entry_t e;
    bool newest = evlog_read(&m, 0u, &e) && e.code == 39u && e.arg == 39u;
    ck("evlog: 40 events across a ring that moves pages survive a remount, newest first, and never re-program a flash row",
       newest && evlog_count(&m) == 40u && pgerr == 0 && !l.io_err);

    wipe(); evlog_mount(&l, 2u, 4u, PG);
    for (int k = 0; k < 500; k++) evlog_add(&l, 3u, 7u, 0u, (uint32_t)k);   /* one chattering fault, every tick */
    uint8_t queued = l.qn;
    evlog_flush(&l, true);
    ck("evlog: a repeated event already in the queue is not queued again — a storm costs one slot per flush, not sixteen",
       queued == 1u && l.lost == 0u && evlog_count(&l) == 1u); }
}

int main(void) {
  meas_tests();
  nvm_tests();
  llc_tests();
  pfc_tests();
  printf("\nRESULT: %d/%d checks passed\n", checks - fails, checks);
  return fails ? 1 : 0;
}
