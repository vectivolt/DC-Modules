# Calculations — machine-readable engineering

<p align="left"><img src="https://img.shields.io/badge/status-LIVE__TOOLING-2ea44f?style=flat-square" alt="live"/> <img src="https://img.shields.io/badge/rev-E54-f2b705?style=flat-square" alt="rev"/> <img src="https://img.shields.io/badge/battery-run--all_·_222%2F222_·_50%2F50-2ea44f?style=flat-square" alt="battery"/></p>

> **Purpose** — every number in the docs traces to a runnable tool here; one command reproduces
> the lot. E54 cleaned this directory to exactly the tools the production path uses: engines,
> gates, the release pipeline, and the sheet-QA suite. Superseded faces (old KiCad exporter,
> composed-SVG set, EasyEDA in-app verify) and the parked layout tools live on branch
> `archive/pre-focus-E49`.

```bash
sh calculations/run-all.sh   # → 222/222 · stress clean · FIRMWARE LOGIC 50/50 OK · ALL CALCULATIONS REPRODUCED OK
```

## Engines (design truth)

| Tool | Owns |
|---|---|
| `design-basis.mjs` | input currents, availability policy, first-pass sizing |
| `pfc/pfc-design.mjs` | Vienna device losses + D1 choke search on the **catalog core** (E51) |
| `pfc/pfc-control.mjs` | current/voltage loops + ngspice AC cross-check |
| `llc/llc-design.mjs` | tank synthesis (Ln·Q joint solve), op map, transformer basis |
| `emi/dm-choke-design.mjs` | D6 engine — crest-biased floors per variant (E43) |
| `emi/lisn-precompliance.mjs` | conducted-emissions tendency per variant |
| `thermal/loss-budget.mjs` | loss budgets (E51 real per-SKU transformer rows), JBS-vs-SR, derating |
| `system/envelope-grid.mjs` | the 4-SKU envelope grid (4032 pts, 0 fail) |
| `system/monte-carlo.mjs` · `system/fsm-sim.mjs` | §37 tolerance batches · §36 scenario suite |
| `busbar/busbar-calc.mjs` | bulk-copper paths, joint schedule (active SKUs) |
| `control/umod-pinmap.mts` | **single source** for card map / harness / MCU pins → `umod-map.gen.ts` |
| `control/mcu-matrix.mjs` | MCU resource budget CSVs |
| `plot.mjs` | zero-dependency SVG plotter used by the engines |

## Standing gates (in `run-all.sh`)

| Gate | Proves |
|---|---|
| `schematic-check.mjs` | 0 symbol overlaps, every built SKU pair |
| `module-interconnect-audit.mts` | studs · all 40 harness ways · 88-way slot · RATING straps · cabinet section |
| `polarity-audit.mts` | every polarized part +/anode on pin 1 (netlist-proven) |
| `stress-audit.mjs` | every device/magnetic/protection class vs its own line — **D1/D2/D3/D4 computed from catalog constants** (E51/E52) |
| `verify-independent.mjs` | 218 clean-room checks (own parser, own physics, R4–R8 sections) |
| `review-checks.mjs` | 140+ asserts: R1…R8 + E35…E53 closures (run after any schematic edit) |
| `magnetics-rfq-audit.mjs` | every magnetic drawing carries its full ordering pack |

## Release pipeline (KiCad-5 face = the record)

`sheet-pages.mjs <sku>` → `sheet-netlist-gen.mjs <sku>` → `kicad5-gen.mjs <sku>` (sheets +
SHIP zip, `schematic-sections.mjs` shared tables) → `kicad5-print.mjs <sku>` (print-fidelity
SVGs) → `sheets-to-pdf.mjs` (the five release PDF sets in `boards/out-pdf/`).
**Order matters** (E56: the EasyEDA app layer is fully removed — these are internal netlist stages; KiCad is the terminal face): pages+netlist-gen must rerun after any parts-db value/mpn change, prints before
PDFs — the gates catch staleness (SKU-VALUE, APPLY-COMPLETE).

## Sheet-QA suite (measures the emitted `.sch`, not the intent)

| Tool | Measures |
|---|---|
| `kicad5-verify.mjs` | every pin vs an independent netlist (**7794+/7794+ across six targets**) |
| `kicad5-visual.mjs` | ink collisions | 
| `alignment-audit.mjs` · `wiring-audit.mjs` · `frame-padding.mjs` · `void-audit.mjs` | near-miss alignment · wiring rules · frame padding · worst enclosed hole |
| `cell-uniformity.mjs` | every replicated cell identical to its twins (per-SKU families, E50) |
| `kicad5-preview.mjs` · `kicad5-detail.mjs` | sheet/tile renders for eye review |
| `footprint-gen.mjs` · `footprint-map.mjs` | magnetics §0.1 land-pattern source († queue for layout reopen) |

## BOM factory

`cost/parts-db.mjs` (classifier + skuOverrides + mech) → `cost/bom-gen.mjs` (tiers, ladder →
`docs/bom-cost.md`, generator-owned) · `cost/lcsc-map.mjs` + `cost/lcsc-from-build.mjs` ·
`pin-map-export.mjs` → `docs/symbol-pin-map.md`.

Outputs land in `out/` (CSVs committed — they are cited deliverables).
