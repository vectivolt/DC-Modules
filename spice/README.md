# SPICE — models, runners, preserved netlists ⚡

Engine: **ngspice-46** (`brew install ngspice`). Every runner generates its decks into
`generated/` (netlists `*.cir` are committed — §49-11 traceability), executes them, computes
metrics in JS from the raw waveforms, and writes CSVs + SVG plots into `../simulation-results/`.
Raw waveform dumps (`*.out`, hundreds of MB) are git-ignored — re-run any suite to regenerate.

| Runner | What it proves | Key outputs |
|---|---|---|
| `double-pulse/dpt-run.mjs` | device-edge truth: overshoot/dv-dt/Eon/Eoff across Rg/I/V/loop/snubber/clamp sweeps — froze the E5/E6 gate networks and re-selected fsw | `dpt-*-metrics.csv`, waveform plots |
| `pfc/pfc-phase-run.mjs` | 3-φ line-cycle behavior (averaged-switch fidelity, documented): THD-40, midpoint balance, phase-loss, precharge/discharge sizing | `pfc-phase-runs.csv` |
| `llc/llc-run.mjs` | full 3-leg switching LLC at map corners: **ZVS at every edge**, boost margin, PS mode | `llc-oppoints.csv` |
| `llc/sp-transition.mjs` | why hard bank-paralleling is banned (205 A @2 V mismatch) → E12 pre-insertion | `sp-transition.csv` |
| `aux/aux-flyback.mjs` | aux supply start/regulation/cross-reg at 300–425 V, incl. the CS-clamp lesson | `aux-flyback.csv`, D4 turns sheet |

`models/sic-behavioral.lib` — behavioral VDMOS/JBS fits with a full provenance header: what they
approximate, what they don't, and why vendor-encrypted PSpice models can't run here (§8). The
±40 % switching-energy band is carried through every downstream decision and closes at bench DPT (T-01).
