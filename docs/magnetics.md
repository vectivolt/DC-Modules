# Magnetics — Designs & Manufacturing Drawings (§11/§14/§49-14/15)

All values trace to `calculations/pfc/pfc-design.mjs` and `calculations/llc/llc-design.mjs`.
Acceptance limits are the production test spec (EOL §45). Material fits are catalog-class,
marked VERIFY (A3/A4) — first-article measurement closes them.

## D1 — PFC choke, 165 µH swing (p/n IND-PFC-165u) — qty 3/6/12 per SKU

| Item | Spec |
|---|---|
| Core | 3× stacked sendust toroid OD79/ID49/H17 mm, µ=26 (Kool Mµ-class; POCO/DMEGC equivalent, matched Ae·le·µ) |
| Winding | N = 36, flat-bundle 13.75 mm² Cu (7× 1.6 mm enameled parallel, or 2×(6×1) flat wire — winder's choice, Rdc governs), single layer spread ≥300° |
| Terminations | 2× ring-lug flying leads M5, 60 mm; polarity dot at start |
| L @ 0 A | 165 µH ±12% (100 kHz, 0.1 V) |
| L @ 78 A pk bias | ≥ 75 µH (pulse method; ACCEPTANCE) |
| Rdc | ≤ 11 mΩ @25 °C |
| Loss @ rated | 33.5 W calc (24 W @400 V line) — ΔT ≤ 45 °C over 55 °C ambient, thermocouple at inner bore |
| Isolation | winding–core 500 VAC/1 min (functional; core floats on mount) |
| Mount | center bolt M6 + silicone pad; mass ~0.9 kg |
| Hi-pot | none (line-potential part; board-level hipot covers) |

## D2 — Resonant trim inductor 4.3 µH ±5% (IND-TRIM-4u3) — qty 3/6/12

Single sendust toroid OD33 µ=60 class, N≈9, 10 mm² litz (800×0.1 mm). **REV B (from §37 Monte-Carlo):
four bin values 3.3/3.65/4.0/4.35 µH ±3% (rev D2 tank: Lr 7.0 µH); the bin is SELECTED against the mated transformer's measured
leakage so that Lr(total) = 7.3 µH ±3%** — rev-A independent tolerances failed peak-gain yield (17.7%).
Rac ≤ 6 mΩ @140 kHz; Irms 46 A; ΔT ≤ 40 °C. Kitting: transformer leakage label → trim bin pick at assembly.

## D3 — LLC section transformer 10 kW (XFMR-LLC-10K) — qty 3/6/12

| Item | Spec |
|---|---|
| Core | 3× PQ50/50 stacked, PC95/DMR95-class, **gapped for Lm = 65 µH ±10%** (center-leg grind, glue-stacked) |
| Turns | Np = 7, Ns1 = 7, Ns2 = 7 (1:1:1) |
| Primary | litz 1050×0.1 mm (10.4 mm²), 45.6 A rms design |
| Secondaries | 2× litz 460×0.1 mm TRIPLE-INSULATED (TIW), 22.2 A rms each |
| Interleave | S1 – P – S2 (leakage target ≤ 3 µH primary-referred; measured leakage recorded per unit) |
| Shield | 1-turn Cu foil between P and each S, flying lead → primary star (CM control §18/§39) |
| Insulation | pri↔sec REINFORCED: TIW + 2× 3.2 mm margin tape; pri↔core basic |
| Hi-pot | pri↔sec 4.0 kV DC 1 s 100%; pri↔core 2.5 kV; **PD sample test**: ≤10 pC @ 1.5 kV pk, 5/lot (§14) |
| Electrical accept | **Lm 65 µH ±7% (gap ground to AL target — rev B, §37 MC)**; leakage measured & labeled per unit (bin input, ±20% window acceptable); turns 1:1:1 ±0; Rdc P ≤ 2.0 mΩ, S ≤ 4.2 mΩ |
| Loss | 20.5 W calc at design point; hotspot ≤ +55 °C rise (thermocouple under margin tape, type-test) |
| Mount | 4× M4 clamp bar; mass ~1.6 kg |

## D4 — Aux flyback transformer (XFMR-AUX-FLY) — qty 1

EE19/EF20 class, PC40, primary 425 V-max input (fed DCP→MID, E20), 3 outputs: 24 V/0.8 A, 15 V/0.6 A, aux 15 V bias; pri↔sec reinforced TIW, hipot 3 kV; fsw ~65 kHz flyback DCM. Detailed turns sheet issued with aux SPICE validation (open item V-21).

## CM chokes (CMC-3PH-2mH) — qty 2

3-phase common-mode choke, nanocrystalline toroid OD62, 3× 8 turns 4 mm² (30 kW; 6 mm² 60 kW; 2×4 mm² parallel 120 kW — same core family), L_cm ≥ 2 mH @10 kHz, leakage (DM) ~9 µH doubles as DM filter stage. Hi-pot line–line functional via spacing; UL1446-class tape.

## CTs

- Line CT (CT-60A): 1:2500, ferrite, window ≥ 9 mm (busbar pass-through), 33 Ω burden → 0.79 V/55 A rms; linearity ≤1% to 150 A pk (OC observability); qty 3/6/12.
- Resonant CT (CT-RES): 1:100 on 10 mm toroid, in series with tank; 33 Ω burden → 0.33 V/A-primary·(1/100)·... calibrated at EOL; qty 3/6/12.


---

## D4 rev B — aux flyback transformer (E26)

Superseded rev A (EF20, half-bus). Now ETD29 PC95, 342–860 V input, 60 W: see the generated
[`aux-transformer-D4.md`](aux-transformer-D4.md) turns sheet. The primary sits at **bus potential**;
the pri→sec barrier is reinforced (TIW + 3 mm margin, hipot 4 kV) and is now the load-bearing
barrier for the E25 SELV control domain — flag it as a **safety-critical winding operation** in
the winder's traveler (100 % hipot, not sampled).

## D6 — DM line chokes (HR-9, new drawing)

The 3rd-stage DM chokes (`LDM1–3`, E22) carry the full line current and now get a real drawing:

| SKU | I_rms/line | I_pk (ripple incl.) | Core | Winding | L @ I_pk |
|---|---|---|---|---|---|
| 30 kW | 55 A | 82 A | 26µ sendust OD47×24×18 | 14 T × 2×AWG12 eq. flat | ≥ 22 µH ≥ 70 % roll-off point |
| 60 kW | 110 A | 158 A | 26µ sendust OD57×26×20 | 11 T × copper foil 0.3×20 | ≥ 22 µH |
| 120 kW | 220 A | 311 A | 26µ sendust OD79×40×17 ×2 stacked | 8 T × foil 0.5×25 | ≥ 22 µH |

Acceptance: L(I_pk) ≥ 15 µH (LISN margin recomputed at −3 dB worst-case — still ≥ +4 dB over the
E22 closure), ΔT ≤ 45 K at I_rms (foil), hipot winding–core 2.5 kV. Same vendor/traveler flow as D1.
