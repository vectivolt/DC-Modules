/* dielim.h — the die-temperature observer behind the operating-point fold. Portable C99, no HAL.
 *
 * WHY. The thermal grid (calculations/system/envelope-grid.mjs) holds every junction at ≤ 150 °C only by FOLDING the
 * available current at a handful of corners — the 500 V series corner on a hot day, low line on a high link, and above all
 * phase shift at low output voltage, where the weak bridge leg turns on hard against the link and burns a LOAD-INDEPENDENT
 * 60–130 W per die. The FSM's derate ladder cannot stand in for that fold: the ladder reads a heatsink NTC, and none of
 * these corners heats the sink first — the die runs 80–170 K above a base that is still at 75 °C, so the ladder never
 * moves. Without an observer nothing in the firmware knows the operating point at all, and sub-200 V delivery on the
 * two-die SKUs becomes a spec limit that any charge controller can simply command past.
 *
 * WHAT. The grid's own closed-form losses, evaluated forward every millisecond for the point in force (bank and link
 * volts, switching frequency, phase-shift duty, tank and line current) into a first-order junction estimate above the
 * MEASURED base temperature. The fold is proportional across the last DIELIM_BAND_K below DIELIM_TJ_C, so a load-dependent
 * loss settles at the current that holds the junction in that band — the grid's fold, found by the module itself.
 * A junction the fold cannot cool (the load-independent term alone is over budget) DECLINES: the fold goes to 1 and stays
 * there until the stage is stopped — without the latch the bridge would idle into burst, cool, deliver, and cycle for ever.
 * An observer, not a static map, because every start crosses deep phase shift for a few hundred milliseconds on its way up
 * to the pack voltage: a ceiling read from the instantaneous point declined the start itself.
 *
 * Every coefficient is a copy of a number that lives in calculations/ (tanks.mjs, thermal/mount.mjs, the DPT result files);
 * calculations/control/fw-constants-sync.mjs fails the build when the two drift apart — including the weak-leg residual
 * map, which must sit at or above every phase-shift row the SPICE deck commits (simulation-results/<sku>/llc-stress.csv)
 * at the dead times THIS firmware programs. T-58 (leg-node probe) is the bench row that relaxes it. */
#ifndef PMP_DIELIM_H
#define PMP_DIELIM_H
#include <stdbool.h>
#include <stdint.h>

#define DIELIM_TJ_C      150.0f    /* the grid's junction ceiling (abs max 175 °C) */
#define DIELIM_BAND_K      8.0f    /* the fold works from 142 °C to 150 °C. Narrow on purpose: the grid folds ABOVE 150 °C, so a corner
                                      it lists at 100 % (a die at 135–149 °C) must not lose more than a few percent here; wide enough
                                      that the estimate's ripple (line-cycle current, burst gating) does not chatter the availability */
#define DIELIM_DECLINE_S   0.2f    /* a fold at 1 must hold this long before it declines: the τ 0.5 s estimate overshoots on a load step at a hot corner */
#define DIELIM_TAU_S       0.5f    /* junction → base: TO-247 on Al2O3 + grease reaches ≈ 70 % in 0.3–0.5 s */
#define DIELIM_RDS_TC    0.0054f   /* R_DS(on) slope per K from 25 °C — C3M0021120K rev 4: 21 → 38 mΩ at 175 °C */

typedef struct {
  float rth_kpw;            /* mount.mjs: junction → the base the NTC reads, 0.80 air · 0.65 liquid */
  /* LLC die (tanks.mjs TANKS[sku], DIES["23m"]) */
  float llc_rds25;          /* 0.023 Ω */
  float llc_koff;           /* J/(V·A): 3.4 / 5.3 / 4.0 nJ with the drawn snubber and R_g,off */
  float llc_cs_f;           /* drain-source snubber per die */
  float llc_qoss800_c;      /* output charge at 800 V */
  uint8_t llc_par;          /* dies per bridge position */
  float wl_m0, wl_slope;    /* weak-leg residual, as a fraction of the link, against the tank gain M = n·V_bank/V_bus:
                               r = slope · (m0 − M), 0…1. It is a function of GAIN because that is what sets how far the
                               zero state lets the tank current decay; anchors: llc-stress.csv Vres_A (see dielim.c) */
  /* Vienna die (envelope-grid.mjs SKUS[].rdsP, KSW from the DPT finals) */
  float pfc_rds25;          /* per die of the common-source pair: 0.020 / 0.015 / 0.010 Ω */
  float pfc_ksw;            /* J/(V·A) at the half link: ≤ 20 nJ on every SKU */
  float pfc_fsw_hz;         /* 50 kHz */
} dielim_cfg_t;

typedef struct {
  float tj_llc, tj_pfc;     /* junction estimates, °C */
  float over_s;             /* seconds the LLC fold has sat at 1 — the decline latches after DIELIM_DECLINE_S, not on one sample */
  bool declined;            /* the LLC fold reached 1 with the stage running: held until dielim_reset */
} dielim_t;

void dielim_cfg_default(dielim_cfg_t *c, uint16_t kw, bool liquid);
void dielim_reset(dielim_t *d);   /* a stopped stage: the estimates fall back onto the base, a declined point is forgotten */

/* Worst-die dissipation, W. v_bank: ONE bank; duty 1 = PFM; i_tank: tank rms (A); running false = the bridge is not switching. */
float dielim_llc_w(const dielim_cfg_t *c, float v_bank, float v_bus, float f_hz, float duty, float i_tank, bool running, float tj_c);
float dielim_pfc_w(const dielim_cfg_t *c, float vin_ll, float v_bus, float i_line_rms, bool running, float tj_c);

/* One step of dt seconds. t_llc / t_pfc: the zone NTCs. Returns the fold 0 (none) … 1 (declined); anything non-finite in
   reads as "no information": the estimate holds and the fold stays where it was — the NTC ladder and the hardware trips
   stand behind this, so a broken input must not stop a healthy module. */
float dielim_step(dielim_t *d, const dielim_cfg_t *c, float w_llc, float t_llc, float w_pfc, float t_pfc, float dt);
#endif
