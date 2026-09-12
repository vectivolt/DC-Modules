# End-to-end validation verdict — 30/40/50 kW modules (E51 review, 2026-09-12)

<p align="left"><img src="https://img.shields.io/badge/status-LIVE__SPEC-2ea44f?style=flat-square" alt="LIVE__SPEC"/> <img src="https://img.shields.io/badge/rev-E52-f2b705?style=flat-square" alt="rev"/> <img src="https://img.shields.io/badge/updated-2026--09--12-555?style=flat-square" alt="updated"/></p>

> **Purpose** — End-to-end validation verdict by category — startup through tolerances — with evidence and the honest open list.
>
> **Gate coupling** — summarizes the standing battery; verification-matrix.md carries the requirement rows.


The customer's closing question: *are these modules practical, manufacturable, reliable and
commercially competitive — not simulations that fail later on magnetics, thermal or unrealistic
components?* Verdict per category, evidence cited; **V** = verified by executed calc/audit on
disk, **G** = standing gate re-runs every battery, **EVT** = needs hardware (test id from
`evt-plan.md`). This complements [`verification-matrix.md`](verification-matrix.md) (rev E49)
and folds in the E51 magnetics findings.

| # | Category | Verdict | Evidence / what changed at E51 |
|---|---|---|---|
| 1 | **Startup** | V/G + EVT | Precharge t95 = 230/276/368 ms vs 400 ms abort (E43); aux cold-start FIXED at R6-G (NCP1252-**D** + 220 µF — the drawn A-part could never start) ≈5–6 s, ~8 s low-line, boot supervision ≥10 s; EVT T-29 waveform. |
| 2 | **Steady state** | V/G | Envelope grid 6048 pts, 0 FAIL, all four SKUs; worst Tj 147 °C ≤150; per-point η/bus/fn/Ip recorded; corner folds are explicit FSM derate rows (commercial derating-curve shape). |
| 3 | **Transients / mode changes** | V/G + EVT | S/P flip: pre-insertion (E12/E13), two-stage hardware exclusion (R4-8/R5-D, truth-checked over 32 states), mirror readback, E12b closure gate, per-tick exclusion invariant in host_sim (50/50); bench T-07. |
| 4 | **Faults** | V/G + EVT | DESAT per switch (100 Ω series R, R5-B), line-CT→CMP→HRTIMER FLT µs-path with per-phase INDEPENDENT comparators (R7-A pin-ownership proven), reverse-polarity OC designated path (R6-C), watchdog now RESTARTS the brain (WDO≡NRST one-node proof, R5-A/R6-A), fuse/relay classes stress-gated. EVT: both-polarity SC timing vs SCWT. |
| 5 | **Saturation** | **V — recomputed at E51** | D1 rev B all SKUs on CATALOG AL 37±8 % with lot-trim (the E41/E42 selections missed their floors on the real core — fixed at N=26/24); D2 Bpk ≤100 mT gated; D3 Bpk now COMPUTED from volt-seconds per SKU (78/90/109 mT vs hot Bsat ~330 — the old gate was literally `true` and hid a ×1.8 doc error); D4 clamp-limited 0.30 T (EVT T-09); D6 crest-biased floors from the engine. |
| 6 | **Core loss** | **V — restated at E51** | D2 sendust→ferrite (E35) stands; D3 real numbers: 13/14.4/24.4 W Fe per section (the "108 mT identical" fiction is out of the register); D1 ~2 W Fe; loss-budget now carries per-SKU transformer rows (η restates ~97.3/97.0/96.8–96.9 full-load — still ≥1 pt ahead of verified Chinese peaks). |
| 7 | **Thermal runaway margin** | V/G | Grid Tj ceilings ≤150 °C (abs 175) at +55 °C worst corners; FSM OT ladder derate 0.6→trip 115 °C plate; magnetics ΔT acceptance lines all ≤45 K with E51 web-bond requirements on D1-50/D3-40/D3-50; Class F insulation floor (H for D3). |
| 8 | **Switch stress** | V/G + EVT | V-margins ≤75/80 % house rules every device class (stress-audit §1); DPT-calibrated ring (73 % @830 V); paralleled pairs symmetric gate branches (R5-E); DPT re-verify at EVT (A1 ±40 % band until vendor models). |
| 9 | **Resonance / tank** | V/G + EVT | fr 140 kHz ±4 % via binned trim compensating measured leakage (§37 MC yield basis); per-cap current AND Vrms-vs-f dielectric duty gated (E43); Bpk lines all SKUs; **E51: D3 leakage becomes a CONTROLLED parameter (3±0.7 µH via interleave spacer) so bins/tank stay frozen under the new construction; fixed-Lr study stays on EVT** (industry integrates leakage — our bins are the heavier flow). |
| 10 | **Control stability** | V + EVT | PFC loops PM 50.2° GM 8.7 dB (analytical + ngspice cross-check); LLC mode map ZVS all op points, FHA limits documented honestly (§9); closed-loop bench at EVT. |
| 11 | **EMI** | V(pre) + EVT | Per-variant LISN pre-compliance +4.9/+5.7/+5.6 dB DM margins on crest-biased chokes (E43 honesty rebuild); E51 D1-50 ripple restatement consumes ~0.4 dB of the 50 kW margin (≥+5.2 dB remains); CM: 2 mH×2 + Y network; **never claimed as compliance — chamber at EVT**. |
| 12 | **Insulation** | V/G + EVT | Reinforced pri↔sec: TIW/FIW barrier or margins (E51: not both), hipot 4 kV 100 % on D3/D4 as safety-critical traveler ops, PD sampling 10 pC; iso components ≥5 kVrms class; creepage table per insulation-coordination.md; DQ certs = §K. |
| 13 | **Worst-case tolerances** | V/G | §37 Monte Carlo drove the 1.38 gain requirement; RATING bands hold at ±1 % parts; AL ±8 % handled by lot-trim (E51 formalized for D1-40/50); discharge windows verified at drawn R/C with per-SKU string counts (R8-A correction absorbed). |
| 14 | **Manufacturability (the E51 focus)** | **FIXED where it was broken** | D3 was the platform's unbuildable part on ALL THREE SKUs (window studies: 142–294 % as drawn; one former didn't exist). Rev B constructions close at 75/88/91 % with compacted-profile litz + foil secondaries on catalog formers (30 kW keeps PQ 3-stack bobbinless). D1 flat-wire spec replaced by machine-windable round bundles. Every custom magnetic now has an RFQ-ready sheet with production tests ([`magnetics-manufacturing-pack.md`](magnetics-manufacturing-pack.md)); T57 core p/n closed (Chang Sung CH571060). Remaining honest burdens: D2 bin-kitting flow (EVT fixed-Lr study), custom 3-stack PQ fixture at 30 kW, D7-40/50 custom nanocrystalline winds. |
| 15 | **Commercial competitiveness** | See benchmark | [`competitive-benchmark-e51.md`](competitive-benchmark-e51.md): topology = current Wolfspeed/Microchip reference practice [verified]; efficiency leads the verified market band by ≥1 pt; density mid-pack (layout compression = #1 lever at E36 reopen); 30 kW BOM ₹30.7k vs the user's ₹35k buy benchmark; all-SiC KEPT (it is the only spec line beating incumbents, and SiC price erosion is verified structural). |

## What remains open (the honest list — all EVT/RFQ class, none schematic)

1. EVT set: T-01…T-29 + both-polarity SC timing, loaded PV-gate Vgs (R8-C), harness-injection
   metering (E40 risk), D4 clamp/thermal (T-09/T-18), powered tank validation (D2 bins + D3
   leakage curve on hardware), magnetics first-articles per the manufacturing pack.
2. §K datasheet/cert set: QA01C −4 V rail + reinforced certs, film-cap Vrms curves (O-8),
   supervisor package map (HR-13), MOV p/n, low-temp A11 floor.
3. RFQ set: 3 competitor factory quotes + one UR100040-SW/REG1K0100U teardown (closes the two
   research questions no public source answered: mainstream-SKU device tech and real internals).
4. Layout phase (E36 parked): density compression toward the verified 3.6 kW/L benchmark; the
   †-marked land patterns; magnetics keep-outs per the pack's §0.1 dimensions.

**Bottom line:** after E51 the known ways this platform could have "failed later because of
magnetics" — unbuildable transformer windows, a choke family selected on the wrong core model,
a flux-density fiction guarded by a `true` gate, an aux that could not cold-start (R6-G), powder
cores on resonant duty (E35) — are closed with executed fixes and computing gates, not notes.
The remaining risk is concentrated exactly where it should be at this phase: hardware
verification (EVT) and supplier first-articles.
