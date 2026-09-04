# Calculations — machine-readable engineering (§48) 🧮

Every number in the docs traces here. One command reproduces everything, including the firmware
verification:

```bash
sh calculations/run-all.sh
# → FIRMWARE LOGIC 33/33 OK
# → ALL CALCULATIONS REPRODUCED OK
```

| Module | Owns |
|---|---|
| `design-basis.mjs` | input currents, availability policy, first-pass sizing (Phase-1 baseline) |
| `pfc/pfc-design.mjs` | Vienna device currents (numeric integrals), Tj-iterated losses, sendust choke search, **fsw selection by system cost** |
| `pfc/pfc-control.mjs` | current/voltage loop design + ngspice AC cross-check (PM match within 0.4°) |
| `llc/llc-design.mjs` | tank synthesis rev D2 (joint Ln·Q solve), operating map, transformer stack, resonant-cap spec |
| `control/mcu-matrix.mjs` | MCU resource budget + pin map CSVs (the §20 artifact) |
| `thermal/loss-budget.mjs` | full loss budgets, JBS-vs-SR decision with sensitivity, heatsink Rth, derating curve |
| `busbar/busbar-calc.mjs` | every bulk path: J, R, ΔT, partial-L, Cu-vs-Al verdicts, joint schedule |
| `emi/lisn-precompliance.mjs` | conducted-emissions estimate (±20 dB) — found and closed the 150 kHz gap (E22) |
| `system/envelope-grid.mjs` | **§35 grid: 3×1008 points, 0 failures** |
| `system/monte-carlo.mjs` | **§37: 6 batches ×10k** — drove trim binning, Lm tolerance, hysteresis rev |
| `system/fsm-sim.mjs` | **§36: 26 scenarios** against the supervisory model |
| `cost/parts-db.mjs` + `cost/bom-gen.mjs` | the BOM factory (see docs/bom-guide.md) |
| `plot.mjs` | zero-dependency SVG plotter used by everything |

Outputs land in `out/` (CSVs committed — they are deliverables §49-12/21).
