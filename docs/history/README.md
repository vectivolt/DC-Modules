# docs/history — dated records off the live path

<p align="left"><img src="https://img.shields.io/badge/status-HISTORICAL__RECORDS-555?style=flat-square" alt="historical"/> <img src="https://img.shields.io/badge/moved-E53_(2026--09--12)-f2b705?style=flat-square" alt="moved"/></p>

> [!NOTE]
> These documents are **kept verbatim** as decision/audit records. They describe superseded
> phases, pipelines or plans; the live truth is the register ([`../assumptions.md`](../assumptions.md))
> and the live docs indexed in [`../README.md`](../README.md). Register rows that referenced the
> old `docs/…` paths are immutable history — the files now live here. Full pre-E50 tree:
> branch `archive/pre-focus-E49`.

| Record | What it was | Superseded by |
|---|---|---|
| [`single-card-migration-plan.md`](single-card-migration-plan.md) | the E40 one-brain migration plan + measured outcome | executed — E40/E41/E42/E44 register rows; `control-card-scope.md` |
| [`review-response-r3.md`](review-response-r3.md) | external review R3 (pin numbering), answered claim-by-claim | A6 rev R3 closure; the R4–R8 rounds live in the register (E45–E49) |
| [`drc-erc-report.md`](drc-erc-report.md) | formal ERC snapshot of the rev-F builds | the standing battery (`run-all.sh` + `verify-independent.mjs`) |
| [`easyeda-transcription.md`](easyeda-transcription.md) | the EasyEDA payload route + tool-limit record | EasyEDA face FROZEN at E39; KiCad-5 set is the record |
| [`mcu-pin-allocation-gd32.md`](mcu-pin-allocation-gd32.md) | R3-era GD32 pin allocation (120 kW-sized) | `calculations/control/umod-pinmap.mts` → `umod-map.gen.ts` (single source, R7-A aware) |
| [`schematic-drawing-set.md`](schematic-drawing-set.md) | the composed-SVG drawing-set deliverable + its gates | `kicad5/DC-Modules-<target>-SHIP.zip` (E34 rev D.3) + `boards/README.md` |

Three more dated records **stay in `../`** because standing gates read them at those paths:
[`../design-review-production.md`](../design-review-production.md) (R1),
[`../design-review-production-r2.md`](../design-review-production-r2.md) (R2),
[`../design-basis-report.md`](../design-basis-report.md) (Phase-1 basis) — all banner-stamped.
