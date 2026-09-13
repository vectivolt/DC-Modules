<img src="assets/banner-verification.svg" alt="" width="100%"/>

# 🏁 End-to-End Validation Verdict

<sub>Verdicts by category from start-up to tolerances, with evidence and the honest open list</sub>

<p>
  <img src="https://img.shields.io/badge/status-LIVE__SPEC-2ea44f?style=flat-square" alt="status: live specification"/>
  <img src="https://img.shields.io/badge/rev-E61-f2b705?style=flat-square" alt="revision E61"/>
  <img src="https://img.shields.io/badge/updated-2026--09--13-8b949e?style=flat-square" alt="updated 2026-09-13"/>
</p>

> [!NOTE]
> **Purpose** — the end-to-end verdict by category, from start-up to tolerances, with the evidence behind each and
> the honest list of what only hardware can close.
>
> **Gate coupling** — summarizes the standing battery; the [verification matrix](verification-matrix.md) carries
> the requirement rows.

## At a glance — the verdicts today

| # | Category | Status | The deciding evidence |
|---:|---|---|---|
| 1 | Start-up | ✅ verified · 🔬 T-29 / T-32 | precharge t₉₅ 193 / 231 / 310 ms; NCP1252D aux cold start ≈ 5–6 s |
| 2 | Steady state | ✅ gated | grid 5,544 points, 0 failures, folds explicit |
| 3 | Transients and mode changes | ✅ gated · 🔬 T-07 | pre-insertion, two-stage exclusion, E12b gate; FW-R6 clamp on dips |
| 4 | Faults | ✅ gated · 🔬 T-30 | F.01 / F.11 ≥ 1.2 × simulated peaks; DESAT inside 75 % of SCWT |
| 5 | Saturation | ✅ gated | catalog-core D1; D2 fault flux ≤ 217 mT; D3 at 30 % of hot Bsat |
| 6 | Core and copper loss | ✅ gated · 🔬 T-31 | measured 3C95 surfaces; Rac/Rdc ≤ 1.35 on every winding |
| 7 | Thermal | ✅ gated · 🔬 T-04 | equilibria ≤ 107 °C; air 1.44–1.51 ×; coolant ΔT 4.8 K |
| 8 | Switch stress | ✅ gated · 🔬 T-01 | voltage margins ≤ 75 / 80 %; DPT-calibrated ring |
| 9 | Resonance and tank | ✅ gated · 🔬 T-25 | gain-worst corner at full power with ZVS; binned trim |
| 10 | Control stability | ✅ verified · 🔬 closed loop | PM 50.2°, GM 8.7 dB; FW-R7 bus floor |
| 11 | EMI | ✅ pre-compliance · 🔬 T-08 | DM margins + 4.9 / + 5.7 / + 5.6 dB; 150 kHz basis conservative |
| 12 | Insulation | ✅ specified · 🔬 T-14 | reinforced barriers, 4 kV hipot 100 %, PD sampling |
| 13 | Worst-case tolerances | ✅ gated | Monte-Carlo 6 × 10k; lot-trim; ± 1 % strap bands |
| 14 | Manufacturability | ✅ fixed | buildable windows on catalog formers; RFQ pack 0 missing fields; fast path |
| 15 | Commercial | ✅ benchmarked | peak η leads; full-load parity with SiC flagships; ₹830 / kW |
| 16 | Environment | ✅ specified · 🔬 T-32 | −30…+75 °C, ≤ 95 % RH, ≤ 2000 m, IP55 fans — competitor parity |
| 17 | Independent anchors | ✅ gated | Friedli–Kolar ± 0.7 %; Wolfspeed CRD-30DD12N-K −8 % |

## The E51 verdicts (record)

The customer's closing question: *are these modules practical, manufacturable, reliable and
commercially competitive — not simulations that fail later on magnetics, thermal or unrealistic
components?* Verdict per category, evidence cited; **V** = verified by executed calc/audit on
disk, **G** = standing gate re-runs every battery, **EVT** = needs hardware (test id from
`evt-plan.md`). This complements [`verification-matrix.md`](verification-matrix.md) and folds in the E51
magnetics findings; the E60 addendum below restates the categories that the coordination, copper and simulation
re-basis changed.

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

---

## E60 addendum — what the coordination, copper and simulation re-basis changed (2026-09-13)

> [!WARNING]
> **One piece of evidence behind the E51 verdicts was not physical.** The LLC ngspice deck behind "ZVS at all
> operating points" had no body diodes: legs swung to ±6 kV and its powers missed by −77…+71 %. It was withdrawn and
> rebuilt with body diodes, per-SKU tanks, power-solved operating points, a physicality guard and a tank fingerprint.
> The rebuilt deck confirms ZVS (64/64 edges on all 14 corners per SKU). It also exposed trip thresholds that sat
> below the real peaks, which are now fixed. Rows not listed below are unchanged.

| # | Category | E60 verdict | What changed |
|---|---|---|---|
| 2 | **Steady state** | V/G | Grid re-based to per-SKU tanks with the S/P hysteresis band evaluated: **5,544 pts, 0 FAIL**. Its "65/48 A pk" ceilings were rms, now tank classes 46.4/61.9/77.3 A rms. Secondary JBS joined the fold loop. The SER 500 V band binds every SKU, with 93 % folds |
| 3 | **Transients** | V/G + EVT | Cycle-by-cycle Vienna: dips and a 20° phase jump add only 2.6–3 A **with** the FW-R6 reference clamp (without it +43 %). host_sim **54/54** |
| 4 | **Faults** | **V — coordination closed at E60** | Every hardware trip ≥ 1.2 × the simulated worst peak: **F.01 120/155/195 A pk** (22/18/13 Ω) and **F.11 85/115/145 A pk** (1.2/0.91/0.75 Ω). Both are observable through the simulated 3 µs races. **DESAT blanks 22 pF LLC / 47 pF Vienna**: worst response 1.44 / 2.21 µs inside 75 % of the SiC SCWT class (the as-drawn 100 pF computed 3.39 µs on the LLC). EVT T-30 measures it |
| 5 | **Saturation** | V/G | D2 fault flux at F.11 + race **211 / 181 / 153 / 154 mT** ≤ 60 % Bsat(130 °C) = 217 mT on the E60 geometry. D1 at F.01 on the soft-saturated catalog curve at AL −8 % stays observable (µ ≥ 0.15) |
| 6 | **Core + copper loss** | **V — copper added at E60** | Dowell/Sullivan at the simulated currents: the E51 foils (0.20/0.25/0.30 mm) computed Rac/Rdc 5.1–6.7, and D2-50 PQ50 litz had Fr 11.7 (45 W). Now foils **0.10/0.127/0.127 mm**, **0.071 mm litz**, **D2-40 = 1× E70 N5**, **D2-50 = 2× E70 N3**: Rac/Rdc ≤ 1.35, ΔT ≤ 40 K. T-31 first-article Rac |
| 7 | **Thermal** | V/G | Magnetics equilibria restated with AC copper: D3 **102–107 °C** (≥93 K from runaway). Loss budget re-based on the power-solved LLC current: η **97.19 / 96.92 / 96.68 / 96.82 %**, loss 866–1,717 W. Air margins 1.44–1.51×, coolant ΔT 4.8 K |
| 9 | **Resonance / tank** | V/G | Gain-worst tolerance corner (Lr +3 %, Cr −5 %, Lm +7 %) reaches full power at 77–82 kHz with ZVS on every SKU. Tank rms classes hold on nominal + tolerance corners. The ±3/5 % mismatch corner (+8 % peak) is the EOL current-sharing reject |
| 10 | **Control** | V + EVT | FW-R7 line-tracking bus floor. On a 650 V bus, 475/500 VAC simulated 15–40 % THD, reduced to 0.1 % with the floor. FW-R8: SER start only above 525 V |
| 11 | **EMI** | V(pre) + EVT | Cycle-by-cycle 150 kHz band content is 0.7–1.2 dB **below** the LISN basis, so the D6 floors are conservative (unchanged) |
| 14 | **Manufacturability** | V + fast path | Constructions re-issued for copper (pack, build instructions, drawings). Prototype fast path with stocked cores and formers plus catalog D6/D7/CT/aux routes ([`prototype-fast-path.md`](prototype-fast-path.md)) |
| 15 | **Commercial** | See benchmark | Full-load η now **at parity** with the SiC flagships' ≥97 % claim and ahead of the mainstream band. Peak 98.45–98.58 % |
| 16 | **Environment (A11 rev C)** | V(spec) + EVT | Matched to the published competitor envelope (Infypower / UUGreen / Tonhe product pages): cold floor **−30 °C** (−40 °C-category DC-link cans, magnetics cold check at −30 °C, T-32 cold soak), IP55 fans, ≤2000 m, 95 % RH. Input range above 475 VAC flagged for a product decision ([`competitive-benchmark-e51.md`](competitive-benchmark-e51.md) §7) |
| 17 | **Independent anchors** | V/G | Cycle-by-cycle Vienna vs Friedli–Kolar closed forms **±0.7 %**; LLC deck vs the measured Wolfspeed CRD-30DD12N-K worst tank current **−8 % pk / −6 % rms** (`verify-independent` §K, 226 checks) |

**Added to the open list:** T-30 (both-polarity SC timing at the new blanks against vendor tSC; the SCWT classes
are baselined until then), T-31 (first-article Rac at 140 kHz including the D3 open-secondary fringing check, CT
saturation at the E60 burdens), T-32 (−30 °C cold soak), a FEMMT run of the D3 S1 foil at PAR-525, an SR-332
MTBF prediction (competitors publish 300–500 kh), and the terrestrial-neutron FIT of 1200 V SiC at 830 V / 2000 m.
([`simulation-toolchain.md`](simulation-toolchain.md) §6)

---

<div align="center">
<sub><a href="evt-plan.md">← EVT Test Plan</a> &nbsp;·&nbsp; <a href="README.md">🧭 Documentation hub</a> &nbsp;·&nbsp; <a href="reliability-budget.md">Reliability Budget →</a></sub>

<sub>Vectivolt DC-Modules · documentation rev E61 · every number reproduces with <code>sh calculations/run-all.sh</code></sub>
</div>
