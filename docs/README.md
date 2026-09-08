# Documentation Index 📚

Thirty-three governing documents + generated CSV/plot artifacts. Reading orders below; every claim in
these docs traces to a runnable artifact (`calculations/run-all.sh` reproduces the lot).

## If you're new, read in this order

1. [`../README.md`](../README.md) — platform overview, results, quickstart
2. [`architecture.md`](architecture.md) — the frozen system
3. [`assumptions.md`](assumptions.md) — decision register **E1–E39** (the "why" for everything)
4. [`../boards/README.md`](../boards/README.md) → per-SKU deep dives
5. [`simulation-report.md`](simulation-report.md) — what was executed, exactly
6. [`schematic-drawing-set.md`](schematic-drawing-set.md) — the release schematics and how to import them

## Full index

| Document | One-liner |
|---|---|
| [`design-basis-report.md`](design-basis-report.md) | the Phase-1 design basis that started the program (historical baseline) |
| [`architecture.md`](architecture.md) | frozen power path, control plane, protections map, scaling table |
| [`assumptions.md`](assumptions.md) | E1–E39 frozen decisions + external assumptions + fidelity policy |
| [`component-selection.md`](component-selection.md) | RFQ-ready candidate table, sourcing policy, rev-B parts deltas |
| [`interconnect.md`](interconnect.md) | two-board sandwich, stud pillars, 16-way harness, **HMI spec** |
| [`magnetics.md`](magnetics.md) | manufacturing drawings **D1–D7** (rev B/C set) + the **E41/E42 variant tables** (40 kW: 5-stack D1-40, N=5 trim, 2×E70 route · 50 kW liquid: N=22 D1-50, BIN6 trim, 3×E70, plate-bonded) |
| [`aux-transformer-D4.md`](aux-transformer-D4.md) | aux flyback turns sheet (generated with the V-21 sim closure) |
| [`simulation-report.md`](simulation-report.md) | every executed run in §50 format — solver, netlists, tolerances, outcomes |
| [`protection-thresholds.md`](protection-thresholds.md) | 32-row fault table (HW/FW split, timings, `F.xx` codes) — rev B |
| [`can-protocol.md`](can-protocol.md) | CAN 2.0B application protocol (IDs, frames, rules) |
| [`firmware-guide.md`](firmware-guide.md) | supervisory C firmware: design, API, porting, test harness |
| [`thermal-report.md`](thermal-report.md) | loss budgets 30/60/120, sandwich cooling, corners, derating |
| [`insulation-coordination.md`](insulation-coordination.md) | creepage/clearance classes + §47 standards checklist |
| [`busbar-drawings.md`](busbar-drawings.md) | bulk-current paths, joint & torque schedule (calc-backed) |
| [`bom-guide.md`](bom-guide.md) | how the BOM is generated + category walkthrough + cost levers |
| [`bom-cost.md`](bom-cost.md) | **generated** roll-up @100/1k/5k vs targets — do not hand-edit |
| [`dfm-production.md`](dfm-production.md) | assembly sequence, torque table, EOL test flow (§44/§45) |
| [`drc-erc-report.md`](drc-erc-report.md) | formal 6-board ERC report (generated from builds) |
| [`verification-matrix.md`](verification-matrix.md) | requirement→evidence matrix + risk register |
| `calculations/stress-audit.mjs` | **the zero-point-of-failure gate** — switch/diode/magnetic/protection acceptance checks across all THREE variants (incl. the E42 grid-shape + burden-rail families), in run-all |
| [`evt-plan.md`](evt-plan.md) | the bench campaign this repo is staged for (T-01…T-25) |
| [`design-review-production.md`](design-review-production.md) | **adversarial production review R1** — verdict NO at review time; rev C fix log: 15/15 blockers closed (+HR/MR) |
| [`design-review-production-r2.md`](design-review-production-r2.md) | **adversarial re-audit R2 of rev C** — NO again (7 new CBs incl. defects inside the rev-C fixes); falsification round + rev D fix log; gate = `review-checks.mjs` (60+ asserts incl. class checks) |
| [`schematic-drawing-set.md`](schematic-drawing-set.md) | **the release drawing set** — `kicad5/DC-Modules-<target>-SHIP.zip` (incl. control-card + cabinet), per-sheet labelling, the audits that gate it |
| [`pcb-floorplan.md`](pcb-floorplan.md) | **the PCB zone plan** — section-to-zone map for both boards, isolation barriers, device rails, airflow axis, and the feasibility budget that says which outlines fit |
| [`lcsc-status.md`](lcsc-status.md) | what the LCSC field means on every symbol; why `CLASS` is adjudicated, not unfinished |
| [`symbol-pin-map.md`](symbol-pin-map.md) | logical pin id → package pin, verified per part (the R3 subject) |
| [`mcu-pin-allocation-gd32.md`](mcu-pin-allocation-gd32.md) | GD32G553VET6 pin allocation — replaces the STM32-derived symbolic map |
| [`footprints-to-draw.md`](footprints-to-draw.md) | land patterns named by the `Footprint` field; which ones still need drawing |
| [`review-response-r3.md`](review-response-r3.md) | **external PDF review R3** — "do not manufacture" on pin numbering; every finding checked against netlist + datasheet |
| [`easyeda-transcription.md`](easyeda-transcription.md) | the EasyEDA face — frozen by directive (KiCad is the record); kept as the route + tool-limit record |
| [`control-card-scope.md`](control-card-scope.md) | **why one card caps at 60 kW DC-DC** — the connector/HRTIMER/pin arithmetic that made 120 kW a cabinet |
| [`single-card-migration-plan.md`](single-card-migration-plan.md) | **E40 (EXECUTED)** — one brain per module: the decision record, MCU matrix, measured outcome |

## Generated data & plots

| Where | What |
|---|---|
| [`../calculations/out/`](../calculations/out/) | every CSV: envelope grid (3024 pts), Monte-Carlo, op-maps, tank, BOMs, busbars, LISN, loops, pin maps |
| [`../simulation-results/30kw/`](../simulation-results/30kw/) | DPT/LLC/aux/S-P metrics + SVG plots (family-wide cell results) |
| [`../spice/generated/`](../spice/generated/) | 40+ preserved ngspice netlists + raw waveform data |
