# Thermal Report (§29/§49-17/18) — rev D (R2/HR-18 closure: EMI filter budgeted)

Sources: `calculations/thermal/loss-budget.mjs` → `out/loss-budget.csv`, `out/derating.csv`;
device Tj iteration in `calculations/pfc/pfc-design.mjs`. Status: calculated; chamber validation = EVT T-04/T-23.

## Loss budgets at rated point (400 VAC, ≥300 V out, JBS baseline) — regenerated rev D

| W | 30 kW | 60 kW | 120 kW |
|---|---|---|---|
| PFC semis | 158 | 317 | 634 |
| PFC magnetics (D1 rev B, audit F4) | 75 | 150 | 301 |
| DC-link ESR | 12 | 24 | 48 |
| LLC primary | 57 | 114 | 228 |
| Transformers | 62 | 123 | 246 |
| Tank (Cr+trim — D2 rev C gapped ferrite fits this line; the audited sendust rev B would have been ~43 W/section) | 13 | 26 | 52 |
| Secondary JBS | 360 | 721 | 1441 |
| Busbar+shunt | 2 | 7 | 28 |
| **EMI filter (D6 rev B + D7 — audit F7 re-gauged every D6 winding to ≤5.6 A/mm²)** | **41** | **63** | **127** |
| Aux+gate (E26 rev C per-SKU load) | 38 | 56 | 92 |
| Fans | 20 | 20 | 40 |
| **Total** | **838** | **1621** | **3237** |
| **η** | **97.28%** | **97.37%** | **97.37%** |

Spec check: peak η ≥97 % still MET at every SKU (rev-D2 restatement after the audit: the D6
rev-B copper *improves* 60/120 kW to 97.37%). Worst continuous corner (330 VAC full power):
30 kW ≈ **930 W** (filter at I² ≈ ×1.35; heatsink-mounted semis 620 W unchanged → Rth
requirement unchanged, the filter heat is airstream-borne, not sink-borne). SR variant saves
214/427/854 W (premium build, E11). D6 rev B (audit F7) holds every winding at ≤5.6 A/mm², so
the ΔT ≤ 45 K acceptance now has calculated margin (30 kW: ≈34 K) instead of being a
first-article coin-flip; T-23 thermography still confirms.

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

## Rev D deltas (2026-09-05, R2 re-audit closure)

- **EMI-filter losses now budgeted** (R2 HR-18): executed — see the regenerated table above
  (CMC at D7 windings 23/33/72 W + LDM as-drawn 26/98/176 W per module). η headline moves to
  **97.26/97.27/97.29 %** (still ≥97 spec everywhere).
- **3.3 V rail** (CB-17/18): sync buck per board ≈ 0.4 W each (the deleted 15 V-fed SOT-223 LDO
  would have dissipated 2.9–4.1 W — thermal-shutdown territory before the enclosure even warmed).
- **Aux rev C (110 W)**: at the 120 kW worst load ≈ 84 W out, η ≈ 0.85 → ≈15 W in the aux corner
  (QAUX ≈ 4–5 W with clip + airflow, D24 ≈ 2.6 W on SMC pad, clamp Rs ≈ 1.2 W) — T-18
  thermography at the per-SKU load table.
- **Resonant burdens** (CB-16): 0.42 W × 3–12 on 1 W 2512 (the mis-scaled 33 Ω would have burned
  7 W in a 0.25 W 1206 — self-clearing within seconds at first load).
- **Balance/star resistors** (HR-20): ≤0.92 W per element after 2-series split (was 1.72 W on
  single parts, 24/7).
- **Bank bleeders** (E33): pulse duty only — ≤65 J/resistor per discharge at 120 kW on 10 W
  wirewound; no steady heat.
