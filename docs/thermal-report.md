# Thermal Report (§29/§49-17/18) — rev B (two-board sandwich)

Sources: `calculations/thermal/loss-budget.mjs` → `out/loss-budget.csv`, `out/derating.csv`;
device Tj iteration in `calculations/pfc/pfc-design.mjs`. Status: calculated; chamber validation = EVT T-04.

## Loss budgets at rated point (400 VAC, ≥300 V out, JBS baseline)

| W | 30 kW | 60 kW | 120 kW |
|---|---|---|---|
| PFC semis | 158 | 316 | 632 |
| PFC magnetics | 72 | 145 | 289 |
| DC-link ESR | 12 | 24 | 48 |
| LLC primary | 33 | 67 | 133 |
| Transformers | 62 | 123 | 246 |
| Tank (Cr+trim) | 13 | 26 | 52 |
| Secondary JBS | 360 | 721 | 1441 |
| Busbar+shunt | 18 | 71 | 280 |
| Aux+gate | 32 | 46 | 74 |
| Fans | 20 | 20 | 40 |
| **Total** | **788** | **1542** | **3081** |
| **η** | **97.44%** | **97.49%** | **97.50%** |

Worst continuous corner (330 VAC full power): 30 kW = 871 W (semis-on-sink 620 W). SR variant saves 214/427/854 W (premium build, E11).

## Sandwich thermal architecture (E17)

Two extrusions form the outer faces; **AC-DC semis (12 TO-247 + 6 clamp diodes @30 kW) clamp to the lower extrusion, DC-DC semis (6 FET + 24 JBS) to the upper**; magnetics sit in the inter-board tunnel in the primary airstream (chokes 33.5 W each, transformers 20.5 W each — D1/D3 ΔT limits 45/55 °C). Front-to-back airflow through the tunnel + both finned faces; 2× 120×38 fans (4× at 120 kW) at ~110 Pa class operating point (A8 — fan selected on static-pressure curve at EVT).

Per-face sink requirement 30 kW: lower 315 W / upper 305 W → per-face Rth(s-a) ≤ 0.063 K/W — **easier than the single-board 0.032 K/W**: the split halves each sink's load (recorded benefit of E17).

## Junction temperatures (worst corner, Rth_ja 1.9 K/W per TO-247 position, A-class TIM)

PFC pair package: **Tj = 138 °C** (ceiling 150, E3 selection binding). LLC primary: ~112 °C. Secondary JBS: 1441/96 = 15 W/diode @120 kW → Tj ≈ 99 °C. Clamp diodes ≈ 78 °C.

## Corners & failures (§29)

| Case | Result |
|---|---|
| −20 °C cold start | Rds low, losses −18%; elyt ESR ×2.5 → ripple current derate: precharge + 60 s soft-power-limit 50% below −10 °C (FW-R3) |
| +55 °C | full power, Tj 138 max ✓ |
| +65 °C | derate to 70% (curve) → Tj ≈ 131 |
| +75 °C | derate 40% → Tj ≈ 121 |
| Blocked filter (50%) | airflow −30% → treat as +8 °C inlet penalty → derate curve shifts left (FW uses ΔT sink-inlet estimator) |
| One fan fail | derate 50% (F.25) — per-face flow asymmetric, worst face governs |
| Fan degradation −20% | +4 °C sink — inside margin |

Derating curve: 100% ≤55 °C → linear → 40% @75 °C → 0 @88 °C; plot `simulation-results/30kw/plots/derating-curve.svg`, data `calculations/out/derating.csv`.

Open: CFD/plenum check of tunnel back-pressure with 12 magnetics @120 kW (T-04 instrumented), TIM
process spec (phase-change pad 0.5 K·cm²/W class) in DFM flow.


---

## Rev C deltas (2026-09-05)

- **LLC node snubbers deleted (E28):** removes what would have been ≈ 45 W/leg of RC loss the
  rev-B budget never carried (the review corrected this) — no budget change, but the *risk* of a
  silent +135–540 W heat source is gone.
- **Vienna snubber re-size:** 100 pF/2 W → 0.86 W per phase actual (was 4.05 W on a 1 W part —
  scorch risk). Budget delta: −3.2 W per lane vs the notional 470 pF fit.
- **Vienna clamp bleeder:** 470 Ω now 5 W axial (worst-case 4.3 W measured basis in review §F-5) —
  rating fix, dissipation unchanged.
- **Aux stage (E26):** 60 W class at η ≈ 0.82 → ≈ 11 W dissipated in the aux corner at full
  aux load (was ≈ 4 W); the 1700 V switch gets the existing small-TO220 pad + airflow — add to the
  EVT thermography checklist (T-18).
- **Per-phase film caps (CB-9):** negligible dissipation; they *reduce* electrolytic ripple heating.
