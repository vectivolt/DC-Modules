<img src="assets/banner-verification.svg" alt="" width="100%"/>

# 📈 Simulation Report

<sub>The simulation-truth ledger — every executed run, its result, and what it may be used to claim</sub>

<p>
  <img src="https://img.shields.io/badge/status-EVIDENCE-1a9fb3?style=flat-square" alt="status: evidence record"/>
  <img src="https://img.shields.io/badge/rev-E81-f2b705?style=flat-square" alt="revision E81"/>
  <img src="https://img.shields.io/badge/updated-2026--09--17-8b949e?style=flat-square" alt="updated 2026-09-17"/>
</p>

> [!NOTE]
> **Purpose** — the simulation-truth ledger: every executed run that describes today's design (E67–E70), its result, and what
> it may be used to claim. Nothing in the documentation claims beyond it. How to run and read each tool:
> [simulation toolchain](simulation-toolchain.md); earlier runs on retired designs live in the git history.

## Ledger at a glance

| Evidence | Run | Result | Status |
|---|---|---|---|
| Device edge | double-pulse, per SKU at the REAL turn-off currents (LLC 91–165 A, Vienna 94–157 A), −3 V, drawn networks + the E81 snubber, 5 nH design loop (E81) | LLC 84–89 % of 1200 V repetitive / ≤ 89 % at the +6 % bus row · Vienna 76–85 % of 750 V · k_off 2.4–5.2 · k_sw 22–26 nJ/(V·A); every final row PASS at the E81 lines (85 % / 90 %), gated by `stress-audit [DPT]` · ± 40 % energy band | ✅ current (E81) |
| PFC control loops | analytical Bode + ngspice AC sweep | fc 2,976 Hz, PM 50.2° · voltage loop 15 Hz, PM 65° | ✅ current |
| PFC line cycle | averaged-switch 3-level Vienna | THD-40 0.59 / 0.74 / 1.05 % full power | ⛔ **superseded (E81 F-G-11)** — a 30 kW averaged deck on a retired law. The shipped number is the `hal_test` SIL's **0.76 / 0.65 / 0.69 %** per SKU |
| Vienna cycle by cycle | JS switched model, catalog L(i) | peaks 97.0 / 127.2 / 159.4 A with dips and a 20° jump | ✅ current |
| Filter and current loop | `pfc-control` with the star-X2 filter | modulus margin **0.66 / 0.61 / 0.54** at the shipped 15 µs delay (0.32 / 0.26 / 0.17 at 30 µs — why the single-update fallback is forbidden on 40 / 50 kW); 0.73 at 50 kW with the 4.7 µF / 4.7 Ω damper | ✅ current (E81) |
| Full-bridge LLC | power-solved ngspice per SKU, 32 corners, E81: non-linear Coss (371 nC at 800 V) + the per-die snubber, 20 V ZVS window, per-leg adaptive dead time | ZVS on every switch at every corner EXCEPT the registered weak-leg (leg A) exceptions — PAR200-I_max and PS150-I_max on every SKU, SER250 at the high-line bus floor on the 30 kW — where the leg's charge exceeds the energy its decaying current can move; the deck reports the residual and the grid folds those corners · worst tank peak 112.7 / 148.1 / 182.8 A | ✅ current (E81) |
| Tank tolerance | Monte-Carlo 10k per SKU on the E67 tanks | FHA peak gain p1 1.212–1.217 vs 1.205 · ZVS fail 0 % | ✅ current |
| CT front ends | ngspice at the E67 burdens | F.11 + race ADC peak ≤ 3.131 V | ✅ current |
| Precharge, discharge, bank bleed | ngspice per SKU | t95 193 / 231 / 310 ms · bus 1.99 / 2.39 / 3.19 s · banks 0.37 / 0.49 / 0.58 s | ✅ current |
| Precharge-bypass closure | JS switched model: D1 L(i), CMC leakage, rectifier, link | 200 / 218 / 280 A pk ≈ 1.5 ms · F.01 blanked 60 ms (E73) · relays, diodes, fuses inside their lines | ✅ current |
| Aux flyback | drawn-circuit ngspice per SKU, D4 rev E | 16 PASS rows + 1 recorded residual | ✅ current |
| Magnetics second opinion | PyOpenMagnetics 1.4.0 (MKF), by hand | Rdc ± 2.5 % · D3 copper × 1.29–1.32 of 1-D · class lines hold · 50 kW air D3 130 °C vs the 125 °C design line | 🟡 watch — first-article short-circuit R decides (T-31) |
| Envelope grid | averaged, temperature-iterated, E81 turn-off + DPT switching terms, 74 / 75 / 77 °C air base | 4,536 points · folds only at the 500 V series / 55 °C corner (30 kW 80–86 %, 50 kW-air 86–93 %) · max Tj 149 °C | ✅ current (E81) |
| Conducted pre-compliance | per-phase LISN ladder, **E81: the LLC bridge counted as a second CM source** | DM + 32.9 / + 30.6 / + 28.7 dB · CM **−8.7 dB as drawn → + 3.1 dB** at the 100 pF leg-node requirement and **+ 7.1 dB** at the 50 pF design target with CY1-3 at 10 nF | 🟡 estimate (Cp ASSUMED, T-13 / T-39) — never a compliance claim |
| System scenarios | JS FSM + C host suite | 26 / 26 · **291 checks** under ASan / UBSan (7 binaries) | ✅ current at logic fidelity (E81) |
| Series / parallel physics | ngspice closure deck | 205 A through a contact at a 2 V bank mismatch | ✅ current — why the relays close only at 0 A |

```mermaid
xychart-beta
  title "Worst simulated tank peak vs the F.11 trip class (A peak)"
  x-axis ["30 kW", "40 kW", "50 kW liquid / air"]
  y-axis "A peak" 0 --> 250
  bar [112.7, 148.1, 182.8]
  bar [140, 180, 220]
```

Solver for every SPICE run: **ngspice-46 (KLU), `method=gear`** as the decks set it, macOS arm64. Generated netlists are kept under
`spice/generated/*.cir` (waveform `.out` files are git-ignored); result CSVs under `simulation-results/<sku>/`.

## 1. Device edge — `spice/double-pulse/dpt-run.mjs`

- Netlists `dpt-pfc750-*` and `dpt-llc1200-*` (13 cases each), timestep 0.25 ns: sweeps of Rg on / off, current, voltage, loop
  inductance, snubber and RCD clamp.
- Pass lines: Vds peak ≤ 75 % of rating including ring; Vgs within −8 … +22 V; freewheel Vgs peak < 2.5 V.
- **PFC 750 V: 523 V (70 %) at 425 V / 78 A** and 549 V (73 %) at + 10 % bus. **LLC 1200 V: 870 V (73 %) at 830 V**; the 880 V
  corner read 77 %, so the hardware OVP sits at 860 V (E2). Freewheel Vgs ≤ 2.05 V.
- What it drove: the parasitic split (2 nH package vs PCB loop), the RCD clamp, Rg off softening, and fsw 100 → 50 kHz.
- **Fidelity:** behavioural device models, ± 40 % switching-energy band — bench double-pulse T-01 recalibrates them.

## 2. PFC control loops — `calculations/pfc/pfc-control.mjs`

- Current loop, analytical Bode with the 1.5 · Tsw transport delay: **fc 2,976 Hz, PM 50.2°, GM 8.7 dB**; the ngspice AC sweep of the
  same loop reads fc 2,924 Hz, PM 50.6° — cross-check within 0.5°.
- Voltage loop by placement: fc 15 Hz, PM 65°.
- With the drawn E68b filter (CMC leakage, three star-X2 stages, Rd–Cd damper): modulus margin **0.65 / 0.61 / 0.54** at the 15 µs
  delay across grid inductance 0 / 30 / 100 µH; undamped the filter's LCL modes make the loop unstable, which is why the damper stays.
  Damper resistor 3.1 / 4.0 / 5.9 W.

## 3. PFC line cycle — `spice/pfc/pfc-phase-run.mjs`

- Averaged-switch 3-level Vienna on a stiff 30 µH / 20 mΩ grid with feed-forward, P control and midpoint balancing.
- **THD-40 0.59 / 0.74 / 1.05 % at full power, 2.55 % at 25 % load** (spec ≤ 5 %, stretch ≤ 3 %); midpoint deviation ≤ 6.7 V with
  imbalance; phase loss bounded at 59 A with the bus drooping to 640 V and THD 9.7 % → firmware foldback FW-R1.
- The EMI filter is not in this model; its effect on the loop is §2.

## 4. Vienna cycle by cycle — `calculations/pfc/vienna-switched.mjs`

- Catalog L(i) of the D1 stack at lot AL − 8 %, floating neutral, 30 % and 50 % dips, a 20° phase jump, high line.
- **Peaks 97.0 / 127.2 / 159.4 A** including transients — the F.01 basis. On the old 650 V bus floor high line reached 15–40 % THD;
  the line-tracking bus floor (FW-R7) brings it to 0.1 %.
- The 150 kHz band sits 0.7–1.2 dB under the LISN ripple basis, so that basis is conservative.

## 5. Full-bridge LLC — `spice/llc/llc-run.mjs` → `llc-envelope.mjs` → `llc-flux-post.mjs`

| Suite | Result |
|---|---|
| **Stress, power-solved per SKU** (12 corners + internal short + dead short) | worst tank peak **112.7 / 148.1 / 182.8 A** at SER 250 V on the 764 V bus; tank RMS 70.4 / 93.3 / 116 A inside the 78 / 100 / 120 A classes; **ZVS 64 / 64 and legs in rails on every corner**; gain-worst corner solved in PFM at 82.6–83.2 kHz |
| **20-point envelope** (bank voltage × load) | every point solved; magnetizing current, flux and iGSE factors written to `llc-flux.csv` for the magnetics gates |
| **Internal short** | kill peak at the F.11 crossing + 1 µs: 209.1 / 267.1 / 329.7 A; + 3 µs monitor peak 318.6 / 417.0 / 502.7 A |
| **FHA cross-check** (`llc-design.mjs`) | peak gain 1.233 / 1.229 / 1.226 at the gain-worst tolerance vs the M 1.205 mode edge |

Every result row carries the tank fingerprint (`FB n2/Lr…/Cr…/Lm…/Coss…`); a tank change without a re-run fails `current-coordination`.

## 6. Tolerance — `calculations/system/monte-carlo.mjs`

| Batch | Result |
|---|---|
| Tank per SKU (D2 ± 3 %, cell leakage ± 30 %, loop ± 20 %, Cr ± 5 %, Lm ± 7 %) | fr 135–145 kHz (1–99 %) · FHA peak gain p1 **1.217 / 1.214 / 1.212 / 1.212** vs 1.205 → 0 % fail · ZVS fail 0 % |
| D1 choke lot ± 8 % with ± 1 turn lot-trim | acceptance yield 100 % on the catalog-minimum curve |
| Output voltage chain | pre-calibration ± 0.7 % → **EOL 2-point calibration mandatory** → ± 0.18 % over ± 40 °C |
| Output current chain | ± 0.2 % after calibration |
| Dead time on the full-bridge legs | minimum margin 42.1 ns across 10k samples |

## 7. Protection front ends and energy decks

| Deck | Result |
|---|---|
| **CT front ends** (`spice/protection/ct-frontend.mjs`) | at the E67 burdens 0.47 / 0.36 / 0.30 Ω: comparator node within 12 mV of the computed F11_VH; F.11 + race ADC peak **3.120 / 3.124 / 3.131 V** (≤ 3.27 V); line chain F.01 + race 3.111 / 3.126 / 3.038 V; AVMID buffer ripple ≈ 0, clamp-pulse dip 1.639 V |
| **Precharge, discharge, bank bleed** (`spice/protection/prechg-disch.mjs`) | precharge t95 **193 / 231 / 310 ms** (Ipk ≤ 18.6 A, ≤ 180 J per resistor) · bus < 60 V in **1.99 / 2.39 / 3.19 s** vs 3 / 4 / 5 s · film-only banks < 60 V in **0.37 / 0.49 / 0.58 s** vs the F.21b windows |
| **Precharge-bypass closure** (`current-coordination.mjs` [INRUSH], E73) | closure at 90 % of line peak, 475 VAC stiff grid, instant swept every 2°: **200 / 218 / 280 A pk** through D1 for ≈ 1.5 ms, D1 down to 24 / 27 / 18 µH, bus to 726 / 725 / 722 V — above F.01, so the latch is blanked for 60 ms (FW-E73) and the relays, JBS and fuses carry RFQ lines sized to the pulse |
| **Aux flyback** (`spice/aux/aux-flyback.mjs`, D4 rev E) | per SKU at 340 / 560 / 860 V: V24 22.6–23.1 V, V15 ≥ 14.1 V, η 0.86–0.90; FB-open limit and V24 / V15 hard shorts bounded at ≤ 286 mT before the fault latch; the short at the V24 reservoir itself is recorded as a residual component-failure case |

## 8. System — grid, EMI and scenarios

- **Envelope grid** (`system/envelope-grid.mjs`): 4 SKUs × 6 input voltages × 8 output voltages × 7 loads × 3 temperatures =
  **4,536 points**, every point passing or a **registered fold** (E81): the 500 V series / 55 °C corner derates (30 kW 80–86 %,
  50 kW-air 86–93 %) and the 150 V phase-shift corner is registered **NOT SUSTAINABLE** on the two-die SKUs (F-L-1); max Tj outside
  that set **149 °C** on the clip-mount basis.
- **Conducted pre-compliance** (`emi/lisn-precompliance.mjs`, ± 20 dB estimate): the drawn per-phase star-X2 ladder holds DM margin
  **+ 32.9 / + 30.6 / + 28.7 dB** against the E65 filter's 19.6 / 19.1 / 18.4 dB. **E81 re-derived CM with the LLC bridge counted as a
  second source** (its fundamental sits inside the band above 150 kHz): **−8.7 dB as drawn → + 3.1 dB** at the 100 pF leg-node
  requirement and **+ 7.1 dB** at the 50 pF design target, with CY1-3 raised to 10 nF. The analytic ladder flips sign between 200 and
  600 pF of switch-node capacitance, so the chamber (T-08, T-39) arbitrates.
- **Scenario suite** (`system/fsm-sim.mjs`, C `firmware/test/host_sim.c`): **26 / 26** scripted scenarios — start-up chain, load steps,
  CV ↔ CC, open and short, back-feed, phase loss, swell and sag, OVP, midpoint, output-mode changes, welded relay, fan fail, OT, stuck
  sensor, aux collapse, DESAT, watchdog, CAN timeout, shutdown discharge, 5-fault lockout — and **291 host checks** under ASan /
  UBSan across seven binaries, including the output-mode latch and hysteresis and a 1M-frame malformed-input fuzz.
- **Series / parallel physics** (`spice/llc/sp-transition.mjs`): closing a parallel contact across a 2 / 5 / 10 / 20 V bank mismatch
  drives 205 / 512 / 1,023 / 2,047 A — the reason the E67 relays only ever close in standby at zero current.

## 9. What simulation does not close

Real switching energy and ring (T-01), both-polarity short-circuit timing (T-30), thermal chamber and fold behaviour (T-04, T-23),
the EMI chamber (T-08, T-39), first-article magnetics — short-circuit R against the 1-D … MKF bracket, leakage, fr (T-31, T-34) — the clip-mount Rth (T-38), the die pulse
class (T-41), relay life and partial discharge. These are hardware by nature; nothing else remains unrun.

> [!TIP]
> **How this page is checked** — the result CSVs under `simulation-results/<sku>/` are read by `current-coordination` and `magnetics-envelope` in `run-all`; a deck that changed without a re-run fails on its fingerprint.

---

<div align="center">
<sub><a href="simulation-toolchain.md">← Simulation Toolchain</a> &nbsp;·&nbsp; <a href="README.md">🧭 Documentation hub</a> &nbsp;·&nbsp; <a href="verification-matrix.md">Verification Matrix & Risk Register →</a></sub>

<sub>Vectivolt DC-Modules · documentation rev E81 · every number reproduces with <code>sh calculations/run-all.sh</code></sub>
</div>
