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

## Drawing set — generation and audit

The release schematics are `kicad5/DC-Modules-<sku>-SHIP.zip`; see `docs/schematic-drawing-set.md`.

| Script | Owns |
|---|---|
| `kicad5-gen.mjs` | **the release sheets** — packing, framing, labelling; re-zips the SHIP archive in the same run |
| `kicad5-verify.mjs` | every pin vs an independently-built netlist (**8049/8049**, 0 wrong, 0 unconnected) |
| `kicad5-visual.mjs` | ink collisions between labels, symbols and field text |
| `alignment-audit.mjs` | near-miss alignment: FRAME-X/Y, SYM-X, PITCH, STUB |
| `wiring-audit.mjs` | wiring rules: LONG, ESCAPE (no wire leaves a frame), CROSS, FLOW |
| `frame-padding.mjs` | inner padding of every section frame — catches content that floats or overflows |
| `void-audit.mjs` | worst **enclosed** hole per sheet — whitespace with drawing on both sides, which is what reads as a hole rather than a margin |
| `cell-uniformity.mjs` | proves every replicated cell (LLC leg, tank, Vienna phase) is identical to its twins — found R14 |
| `review-checks.mjs` | the release gates, including LCSC class and shadowed-rule checks |
| `kicad5-preview.mjs` / `kicad5-detail.mjs` | render sheets/tiles for visual inspection |

Each audit reads the **emitted `.sch`**, so it measures the deliverable rather than the intent.
All six sheets currently pass all of them.

Superseded but kept: `schematic-compose.mjs` (SVG composer), `easyeda-pages.mjs` /
`easyeda-apply-gen.mjs` / `easyeda-verify.mjs` (the pin-by-pin EasyEDA MCP route — see
`docs/easyeda-transcription.md` for why it was abandoned).
