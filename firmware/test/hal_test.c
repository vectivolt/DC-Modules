/* hal_test.c — E79 verification of the portable real-time HAL (firmware/hal: pfc, llc, meas, nvm).
 *   pfc   the control law on a cycle-by-cycle Vienna plant — the vienna-switched.mjs state model in C: an ideal bidirectional
 *         switch per phase, boost diodes, a floating neutral with DCM, the soft-saturating D1, the split link, the SNS_VAC RC,
 *         peak and valley sampling with one update of transport delay. Start, load step, steady state (THD, PF, midpoint, peak),
 *         load dump, a 50 % sag and its recovery, a 30° phase jump, a half-bus imbalance, sequence A-C-B, disable.
 *   llc   the ZVS table against the FHA tank impedance at every tolerance corner; the map and burst; the modulator in closed
 *         loop with pmp_reg_step on a cycle-by-cycle full bridge (Lr–Cr–Lm, n = 2, rectifier into the output capacitance): CV,
 *         CC into a battery, saturation on the floor without capacitive mode, burst at light load, tank peak against F.11.
 *   meas  calibration windows, the reference correction, NTC and strap bands, the grid monitor (RMS, frequency, sequence, a lost
 *         phase, loss of line, noise).
 *   nvm   CRC-32 check value, round trip, write-on-change, compaction, a power cut at every programmed byte of an append and at
 *         every step of a compaction.
 * What this does NOT prove: the loop gains on the real stage (the regulator gains are ctl.c's placeholders), EMI, the ADC,
 * timer and flash drivers — HIL and EVT rows in docs/firmware-verification.md. Build/run: firmware/run_tests.sh */
#include "../hal/pfc.h"
#include "../hal/llc.h"
#include "../hal/meas.h"
#include "../hal/nvm.h"
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
static const d1_t D1_30 = { 3, 39, 5 * 470e-6, 30 }, D1_50 = { 5, 24, 8 * 470e-6, 50 };
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

  float z[3] = { 0.0f, 0.0f, 0.0f }, bad[3] = { NAN, 0.0f, 0.0f };
  s.ref.en = false; pfc_step(&s.p, &s.cfg, &s.ref, z, z, 400.0f, 400.0f, 0.0f, 10e-6f);
  bool off = !s.p.run && s.p.on[0] == 0.0f && s.p.on[1] == 0.0f && s.p.on[2] == 0.0f;
  s.ref.en = true; pfc_step(&s.p, &s.cfg, &s.ref, z, z, 400.0f, 400.0f, 0.0f, 10e-6f);
  bool ran = s.p.run;
  pfc_step(&s.p, &s.cfg, &s.ref, bad, z, 400.0f, 400.0f, 0.0f, 10e-6f);
  ck("pfc: disabled, or a non-finite sample, turns every switch off and resets the loop", off && ran && !s.p.run && s.p.on[0] == 0.0f);
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
  double lr, cr, lm, vbus, cap, vf, rt;
  double ilr, vcr, ilm, vo, t_in, t_per, f, duty; int sgn; bool cond, gate;
  double load_r, bat_e, bat_r; bool bat;
  double v_ref, i_ref, pk, pk_vo, pk_duty, iout;
  long edges, bad, off_periods, below_floor;
} lsim_t;

static void lsim_init(lsim_t *s) {   /* the 50 kW tank of record (tanks.mjs), banks parallel, a stiff 830 V bus */
  memset(s, 0, sizeof *s);
  llc_cfg_default(&s->c, 50); pmp_reg_cfg_default(&s->rc); pmp_reg_reset(&s->r);
  s->lr = 3.56e-6; s->cr = 11 * 33e-9; s->lm = 35.6e-6; s->vbus = 830.0; s->cap = 200e-6; s->vf = 1.0; s->rt = 0.02;
  llc_step(&s->l, &s->c, false, 0.0f, 400.0f, 0.0f);
  s->f = s->l.f_hz; s->t_per = 1.0 / s->f;
}

static void lsim_run(lsim_t *s, double sec, bool rec) {
  const double dt = 50e-9;
  for (long k = 0, steps = lround(sec / dt); k < steps; k++) {
    if (k % 2000 == 0) {   /* the 100 µs control period: the regulator and the modulator */
      double vout = s->iout > 0.0 ? s->vo - s->vf : s->vo;
      float u = pmp_reg_step(&s->r, &s->rc, true, (float)s->v_ref, (float)s->i_ref, (float)fmin(vout, s->vo), (float)s->iout,
                             500.0f, 166.7f, 100e-6f);
      llc_step(&s->l, &s->c, true, u, (float)s->vo, (float)(s->vo * s->iout));
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
    s->iout = s->bat ? fmax((s->vo - s->vf - s->bat_e) / s->bat_r, 0.0) : (s->vo > s->vf ? (s->vo - s->vf) / s->load_r : 0.0);
    s->vo += (irect - s->iout) / s->cap * dt;
    if (rec && fabs(s->ilr) > s->pk) { s->pk = fabs(s->ilr); s->pk_vo = s->vo; s->pk_duty = s->gate ? s->duty : -1.0; }
    s->t_in += dt;
  }
}

static void llc_tests(void) {
  { int ok = 1;
    for (int k = 0; k <= 250; k++) { double q = k * 0.01; if (llc_zvs_fn((float)q) < zvs_worst(q) - 2e-4) ok = 0; }
    ck("llc: the ZVS table never sits below the FHA tank's capacitive boundary at any tolerance corner (Q 0–2.5)", ok); }

  { llc_cfg_t c; llc_cfg_default(&c, 50); llc_t l;
    llc_step(&l, &c, true, 1.0f, 500.0f, 50e3f);
    bool corner = l.f_min_hz <= 0.5767f * c.fr_hz && fabsf(l.f_hz - l.f_min_hz) < 1.0f;
    llc_step(&l, &c, true, c.u_psm, 400.0f, 20e3f);
    bool at_max = fabsf(l.f_hz - c.fn_max * c.fr_hz) < 1.0f && l.duty == 1.0f && l.gate;
    llc_step(&l, &c, true, 0.5f * c.u_psm, 400.0f, 1e3f);
    bool half = fabsf(l.duty - 0.5f) < 1e-4f && fabsf(l.f_hz - c.fn_max * c.fr_hz) < 1.0f;
    llc_step(&l, &c, true, 0.07f * c.u_psm, 400.0f, 1e3f); bool b1 = l.burst && !l.gate;
    llc_step(&l, &c, true, 0.10f * c.u_psm, 400.0f, 1e3f); bool b2 = l.burst;
    llc_step(&l, &c, true, 0.13f * c.u_psm, 400.0f, 1e3f); bool b3 = !l.burst && l.gate;
    llc_step(&l, &c, true, 1.0f, 60.0f, 20e3f); bool heavy = l.f_min_hz >= 1.03f * 1.0525f * c.fr_hz - 1.0f;
    llc_step(&l, &c, false, 0.8f, 400.0f, 1e3f); bool stop = !l.gate;
    llc_step(&l, &c, true, NAN, 400.0f, 1e3f); bool nan_stop = !l.gate;
    ck("llc 50 kW: the floor at the 500 V-bank full-power corner is 0.55 fr, below the fn 0.577 that corner needs", corner);
    ck("llc: PFM hands over to phase shift at u_psm, duty is linear below, burst stops below 8 % and restarts above 12 %, the floor rises to 1.08 fr into a near-short, disable and NaN stop the bridge",
       at_max && half && b1 && b2 && b3 && heavy && stop && nan_stop); }

  { static lsim_t s; lsim_init(&s); s.load_r = 4.0; s.i_ref = 175.0;
    for (int k = 0; k < 2000; k++) { s.v_ref = fmin(400.0, 2000.0 * k * 100e-6); lsim_run(&s, 100e-6, true); }
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
    ck("llc 50 kW CC: 100 A into a 350 V battery (0.1 Ω) holds within ±2 A, under 30 A peak to peak (the E78 gains: 81 A)",
       fabs(sum / 500 - 100.0) < 2.0 && imax - imin < 30.0); }

  { /* E80: the §5.5 current-step targets through the documented shaper slews (up 1000 A/s, down i_rated / 0.08 s):
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
    /* the ≤ 2 % overshoot line of §5.5 is the HIL acceptance for the per-rating gains (§5.4, review R34 — the FHA-plant
       arrival overshoot here is ~26 A with the placeholder gains); this check owns what the structure guarantees:
       the ramp-dominated timing, and an overshoot bounded inside the F.15 fast row (130 % of rated for 2 ms) */
    ck("llc 50 kW CC step 10-90 % into a battery: t90 <= 150 ms up / <= 100 ms down; overshoot bounded under F.15 (2 % target = HIL gate, R34)",
       t_up > 0 && t_up <= 0.150 && t_dn > 0 && t_dn <= 0.100 && imax < 1.25 * 166.7); }

  { static lsim_t s; lsim_init(&s); s.bat = true; s.bat_e = 395.0; s.bat_r = 0.1; s.vo = 396.0; s.v_ref = 400.0; s.i_ref = 175.0;
    lsim_run(&s, 0.3, false);
    double vmin = 1e9, vmax = 0.0, imin = 1e9, imax = 0.0;
    for (int k = 0; k < 500; k++) {
      lsim_run(&s, 100e-6, true);
      vmin = fmin(vmin, s.vo - s.vf); vmax = fmax(vmax, s.vo - s.vf); imin = fmin(imin, s.iout); imax = fmax(imax, s.iout);
    }
    printf("      CV 400 V into a 395 V battery: %.2f–%.2f V · %.1f–%.1f A\n", vmin, vmax, imin, imax);
    ck("llc 50 kW CV into a battery (395 V, 0.1 Ω): the voltage holds within ±1 % and the current stays under F.15's slow row (170 A)",
       vmin > 396.0 && vmax < 404.0 && imax < 170.0); }

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

/* ================================================================ NVM on a RAM flash with power cuts */
#define PG 1024u
static uint8_t flash[2][PG];
static long budget = -1, progd = 0;   /* programmed bytes and erases left before the power fails (−1 = never) */
static bool dead = false;

bool nvm_port_read(uint8_t page, uint32_t off, uint8_t *p, uint32_t n) {
  if (page > 1u || off + n > PG) return false;
  memcpy(p, flash[page] + off, n);
  return true;
}
bool nvm_port_prog(uint8_t page, uint32_t off, const uint8_t *p, uint32_t n) {
  if (page > 1u || off + n > PG || dead) return false;
  for (uint32_t k = 0; k < n; k++) {
    if (budget == 0) { dead = true; return false; }
    if (budget > 0) budget--;
    flash[page][off + k] &= p[k];   /* flash: bits only clear */
    progd++;
  }
  return true;
}
bool nvm_port_erase(uint8_t page) {
  if (page > 1u || dead) return false;
  if (budget == 0) { dead = true; memset(flash[page], 0xFF, PG / 3); return false; }   /* cut part-way through the erase */
  if (budget > 0) budget--;
  memset(flash[page], 0xFF, PG);
  return true;
}
static void power(long b) { budget = b; dead = false; }
static void pay(uint8_t *b, uint8_t kind, uint32_t ver) { for (int k = 0; k < 40; k++) b[k] = (uint8_t)(kind * 31u + ver * 7u + (uint32_t)k); }

static void nvm_tests(void) {
  ck("nvm: CRC-32 check value 0xCBF43926", pmp_crc32((const uint8_t *)"123456789", 9) == 0xCBF43926u);
  nvm_t s, m;
  uint8_t a[40], b[40], old[40];
  memset(flash, 0xFF, sizeof flash); power(-1); nvm_mount(&s, 0u, PG);
  pay(a, 1, 1); bool put = nvm_put(&s, 1, a, 40, true);
  nvm_mount(&s, 0u, PG); bool got = nvm_get(&s, 1, b, 40) && memcmp(a, b, 40) == 0;
  long before = progd; bool same = nvm_put(&s, 1, a, 40, false) && progd == before;
  bool wrong = !nvm_get(&s, 1, b, 20) && !nvm_get(&s, 2, b, 40);
  ck("nvm: a blank part formats; a record survives a remount; an unchanged write programs nothing; a wrong length or kind reads nothing",
     put && got && same && wrong);

  { uint32_t ver[4] = { 0, 0, 0, 0 }, gen0 = s.page_seq; int ok = 1;
    for (uint32_t w = 0; w < 120; w++) {
      uint8_t kind = (uint8_t)(w % 4u); ver[kind]++;
      pay(a, kind, ver[kind]); if (!nvm_put(&s, kind, a, 40, true)) ok = 0;
      nvm_mount(&m, 0u, PG);
      for (uint8_t k = 0; k < 4; k++) if (ver[k]) { pay(a, k, ver[k]); if (!nvm_get(&m, k, b, 40) || memcmp(a, b, 40)) ok = 0; }
    }
    ck("nvm: 120 writes over four kinds compact the store repeatedly; every remount reads the newest of each", ok && s.page_seq >= gen0 + 5u); }

  { int ok = 1, cases = 0; static uint8_t snap[2][PG];
    memset(flash, 0xFF, sizeof flash); power(-1); nvm_mount(&s, 0u, PG);
    for (uint8_t k = 0; k < 4; k++) { pay(a, k, 1); nvm_put(&s, k, a, 40, true); }
    memcpy(snap, flash, sizeof flash);
    for (long cut = 0; cut <= 60; cut++, cases++) {
      memcpy(flash, snap, sizeof flash); power(-1); nvm_mount(&s, 0u, PG);
      pay(a, 1, 2); power(cut); bool r = nvm_put(&s, 1, a, 40, false); power(-1);
      nvm_mount(&m, 0u, PG); pay(old, 1, 1);
      bool v = nvm_get(&m, 1, b, 40) && (memcmp(b, a, 40) == 0 || (!r && memcmp(b, old, 40) == 0));
      for (uint8_t k = 0; k < 4; k++) if (k != 1) { pay(old, k, 1); if (!nvm_get(&m, k, b, 40) || memcmp(b, old, 40)) v = false; }
      pay(a, 3, 9); bool after = nvm_put(&m, 3, a, 40, true) && nvm_get(&m, 3, b, 40) && memcmp(a, b, 40) == 0;
      if (!v || !after) ok = 0;
    }
    ck("nvm: a power cut at every byte of an append leaves the old or the new record, the others intact, the store writable", ok && cases == 61); }

  { int ok = 1; long cases = 0; static uint8_t snap[2][PG]; uint32_t vv[4] = { 0, 0, 0, 0 }, w = 0;
    memset(flash, 0xFF, sizeof flash); power(-1); nvm_mount(&s, 0u, PG);
    while (s.wr + 52u <= PG) { uint8_t k = (uint8_t)(w++ % 4u); vv[k]++; pay(a, k, vv[k]); nvm_put(&s, k, a, 40, false); }
    memcpy(snap, flash, sizeof flash);
    for (long cut = 0; cut <= 240; cut++, cases++) {   /* erase · three copies · the new entry · header · old erase, and past it */
      memcpy(flash, snap, sizeof flash); power(-1); nvm_mount(&s, 0u, PG);
      pay(a, 2, vv[2] + 1u); power(cut); bool r = nvm_put(&s, 2, a, 40, true); power(-1);
      nvm_mount(&m, 0u, PG); pay(old, 2, vv[2]);
      bool v = nvm_get(&m, 2, b, 40) && (memcmp(b, a, 40) == 0 || (!r && memcmp(b, old, 40) == 0));
      for (uint8_t k = 0; k < 4; k++) if (k != 2) { pay(old, k, vv[k]); if (!nvm_get(&m, k, b, 40) || memcmp(b, old, 40)) v = false; }
      pay(a, 0, 77); bool after = nvm_put(&m, 0, a, 40, true) && nvm_get(&m, 0, b, 40) && memcmp(a, b, 40) == 0;
      if (!v || !after) ok = 0;
    }
    ck("nvm: a power cut at every step of a compaction leaves one complete generation (old or new record, the rest intact)", ok && cases == 241); }
}

int main(void) {
  meas_tests();
  nvm_tests();
  llc_tests();
  pfc_tests();
  printf("\nRESULT: %d/%d checks passed\n", checks - fails, checks);
  return fails ? 1 : 0;
}
