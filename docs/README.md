# Documentation Index 📚

Governing documents + generated artifacts for the four-SKU module platform (register state
**E49**). Every claim traces to a runnable artifact — `calculations/run-all.sh` reproduces the
lot (battery: schematic/interconnect/polarity/stress audits · 218-check independent verifier ·
firmware 50/50).

## If you're new, read in this order

1. [`../README.md`](../README.md) — platform overview, results, audit trail, quickstart
2. [`architecture.md`](architecture.md) — the system at rev E49 (four SKUs, one brain)
3. [`assumptions.md`](assumptions.md) — decision register **E1–E49** (the "why" for everything)
4. [`../boards/README.md`](../boards/README.md) → per-SKU deep dives
5. [`schematic-drawing-set.md`](schematic-drawing-set.md) — the release sheets and their gates
6. [`simulation-report.md`](simulation-report.md) — what was executed, exactly

## Live specifications

| Document | One-liner |
|---|---|
| [`architecture.md`](architecture.md) | power path, control plane, protection map, family table — rev E49 |
| [`assumptions.md`](assumptions.md) | E1–E49 frozen decisions + external assumptions + fidelity policy |
| [`interconnect.md`](interconnect.md) | two-board sandwich, stud pillars, **40-way harness**, grounding, HMI spec |
| [`protection-thresholds.md`](protection-thresholds.md) | the F.xx fault table (HW/FW split, per-SKU timings) + the R4–R8 protection notes (DESAT direction, CMP allocation, two-phase discharge) |
| [`firmware-guide.md`](firmware-guide.md) | supervisory C core: design, API, HAL contract, boot identity, R5–R7 contracts |
| [`magnetics.md`](magnetics.md) | manufacturing drawings **D1–D7** + the per-variant tables (40/50 kW cores, turns, litz, bins) — E51 revs: D1-40/50 catalog-core re-issue, D3 window/construction fixes |
| [`magnetics-manufacturing-pack.md`](magnetics-manufacturing-pack.md) | **E51 RFQ pack**: one controlled spec sheet per magnetic (electricals, construction, insulation, parasitics, thermal, production tests) + core/litz/winder sourcing directory |
| [`competitive-benchmark-e51.md`](competitive-benchmark-e51.md) | **E51 benchmark** vs Wolfspeed/Microchip/Infineon/onsemi references + Infy/UUGreen/Tonhe modules (verified claims labeled) — SiC verdict, density gap, cost levers |
| [`final-validation-e51.md`](final-validation-e51.md) | **E51 end-to-end verdict**: startup→tolerances category table, evidence cited, honest open list (EVT/§K/RFQ/layout) |
| [`component-selection.md`](component-selection.md) | RFQ-ready part table, sourcing policy, second-source rules |
| [`control-card-scope.md`](control-card-scope.md) | the connector/HRTIMER/pin arithmetic behind the one-card design |
| [`can-protocol.md`](can-protocol.md) | CAN 2.0B application protocol (IDs, frames, CSU rules) |
| [`insulation-coordination.md`](insulation-coordination.md) | creepage/clearance classes + standards checklist |
| [`busbar-drawings.md`](busbar-drawings.md) | bulk-current paths, joint & torque schedule |
| [`thermal-report.md`](thermal-report.md) | loss budgets, sandwich cooling, corners, derating |
| [`aux-transformer-D4.md`](aux-transformer-D4.md) | aux flyback turns sheet (V-21 sim closure) |
| [`mcu-pin-allocation-gd32.md`](mcu-pin-allocation-gd32.md) | GD32G553 pin allocation — regenerates from `umod-pinmap.mts` (incl. the R7-A comparator-aware swap) |
| [`symbol-pin-map.md`](symbol-pin-map.md) | logical pin id → package pin per part (the R3/R4 subject — real vendor maps) |
| [`lcsc-status.md`](lcsc-status.md) | what the LCSC field means on every symbol; CLASS adjudication |
| [`footprints-to-draw.md`](footprints-to-draw.md) | land patterns named by the `Footprint` field; drawing status |
| [`pcb-floorplan.md`](pcb-floorplan.md) | PCB zone plan — section-to-zone map, barriers, airflow, outline budgets |
| [`schematic-drawing-set.md`](schematic-drawing-set.md) | the release drawing set — `kicad5/DC-Modules-<target>-SHIP.zip` ×6, labelling, gates |
| [`easyeda-transcription.md`](easyeda-transcription.md) | the EasyEDA face — payload route + tool-limit record (KiCad is the record) |
| [`bom-guide.md`](bom-guide.md) | how the BOM generates + category walkthrough + cost levers |
| [`bom-cost.md`](bom-cost.md) | **generated** cost roll-up + product ladder — do not hand-edit |
| [`dfm-production.md`](dfm-production.md) | assembly sequence, torque table, EOL test flow |
| [`evt-plan.md`](evt-plan.md) | the bench campaign this repo is staged for (T-01…T-25 + the R5–R8 additions) |
| [`verification-matrix.md`](verification-matrix.md) | requirement→evidence matrix + risk register |

## Historical records (dated, kept verbatim)

| Document | What it recorded |
|---|---|
| [`design-basis-report.md`](design-basis-report.md) | the Phase-1 design basis that started the program |
| [`design-review-production.md`](design-review-production.md) | adversarial review R1 — 15 blockers, same-day rev C closure |
| [`design-review-production-r2.md`](design-review-production-r2.md) | adversarial re-audit R2 — 7 new criticals inside the rev-C fixes, rev D closure |
| [`review-response-r3.md`](review-response-r3.md) | external PDF review R3 — pin-numbering, answered claim-by-claim |
| [`single-card-migration-plan.md`](single-card-migration-plan.md) | E40 (EXECUTED) — one brain per module: decision record + measured outcome |
| [`drc-erc-report.md`](drc-erc-report.md) | formal ERC snapshot of the rev-F builds |
| [`simulation-report.md`](simulation-report.md) | every executed run in §50 format — solver, netlists, tolerances, outcomes |

The five external review rounds **R4–R8** (2026-09-08/09) are recorded in the register rows
E45–E49 with their permanent gates in `calculations/review-checks.mjs` (R4-* … R8-*) and
`calculations/verify-independent.mjs` sections I/J.

## Generated data & plots

| Where | What |
|---|---|
| [`../calculations/out/`](../calculations/out/) | every CSV: envelope grid (6048 pts), Monte-Carlo, op-maps, tank, BOMs, busbars, LISN, loops, pin maps, D6 engine |
| [`../simulation-results/30kw/`](../simulation-results/30kw/) | DPT/LLC/aux/S-P metrics + SVG plots (family-wide cell results) |
| [`../spice/generated/`](../spice/generated/) | 40+ preserved ngspice netlists + raw waveform data |
