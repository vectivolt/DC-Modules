# SPICE — models, runners, preserved netlists ⚡

Engine: **ngspice-46** (`brew install ngspice`). Every runner generates its decks into
`generated/` (netlists `*.cir` are committed — §49-11 traceability), executes them, computes
metrics in JS from the raw waveforms, and writes CSVs + SVG plots into `../simulation-results/`.
Raw waveform dumps (`*.out`, hundreds of MB) are git-ignored — re-run any suite to regenerate.

| Runner | What it proves | Key outputs |
|---|---|---|
| `double-pulse/dpt-run.mjs` | device-edge truth: overshoot/dv-dt/Eon/Eoff across Rg/I/V/loop/snubber/clamp sweeps — froze the E5/E6 gate networks and re-selected fsw | `dpt-*-metrics.csv`, waveform plots |
| `pfc/pfc-phase-run.mjs` | 3-φ line-cycle behavior (averaged-switch fidelity, documented): THD-40, midpoint balance, phase-loss, precharge/discharge sizing | `pfc-phase-runs.csv` |
| `llc/llc-run.mjs` | **E60 rev — per-SKU, power-solved** 3-φ LLC (body diodes, star at mid-bus): 14 corners incl. tolerance/mismatch/gain-worst, internal-short race, dead short; **physicality guard** (legs in rails) + **tank fingerprint** | `<sku>/llc-stress.csv` · `llc-stress-summary.json` · `plots/llc-worst-corner.svg` |
| `llc/sp-transition.mjs` | why hard bank-paralleling is banned (205 A @2 V mismatch) → E12 pre-insertion | `sp-transition.csv` |
| `aux/aux-flyback.mjs` | aux supply start/regulation/cross-reg at 342/560/850 V **per product SKU (30/40/50L/50A — E60)**, incl. the CS-clamp lesson | `aux-flyback.csv` (no longer writes the D4 sheet) |
| `protection/ct-frontend.mjs` | AVMID stability + **per-SKU resonant and line CT chains at the E60 burdens/thresholds/race peaks** | `ct-frontend.csv` |
| `protection/prechg-disch.mjs` | precharge / discharge / bank bleed **per product SKU** vs F.20/F.21/F.21b | `prechg-disch-sku.csv` |

`models/sic-behavioral.lib` — behavioral VDMOS/JBS fits with a full provenance header: what they
approximate, what they don't, and why vendor-encrypted PSpice models can't run here (§8). The
±40 % switching-energy band is carried through every downstream decision and closes at bench DPT (T-01).

> [!WARNING]
> **E60:** the pre-E60 LLC op-point deck modelled switches without body diodes (legs swung ±6 kV on a 650 V bus); its
> results were withdrawn and its decks deleted. Every runner that produces power-stage evidence must clamp its
> switch nodes physically; `llc-run.mjs` now fails a corner whose legs leave the rails. How to run and read the
> suites: [`../docs/simulation-toolchain.md`](../docs/simulation-toolchain.md).
