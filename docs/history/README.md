<img src="../assets/banner-history.svg" alt="" width="100%"/>

# 🗄️ Historical Records

<sub>Dated records kept verbatim, and where their conclusions live now</sub>

<p>
  <img src="https://img.shields.io/badge/status-HISTORICAL-6e7781?style=flat-square" alt="status: historical record"/>
  <img src="https://img.shields.io/badge/indexed-E61-8b949e?style=flat-square" alt="indexed at E61"/>
</p>

> [!NOTE]
> **Kept verbatim as decision and audit records.** These pages describe superseded phases, pipelines and plans.
> The live truth is the [decision register](../assumptions.md) and the pages indexed in the
> [documentation hub](../README.md). Register rows that cite the old `docs/…` paths are immutable history — the
> files now live here. The full pre-E50 tree is on the `archive/pre-focus-E49` branch.

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

---

<div align="center">
<sub><a href="../pcb-floorplan.md">← PCB Floorplan Basis</a> &nbsp;·&nbsp; <a href="../README.md">🧭 Documentation hub</a> &nbsp;·&nbsp; <a href="../design-basis-report.md">Design Basis Report — Phase 1 →</a></sub>

<sub>Vectivolt DC-Modules · documentation rev E61 · every number reproduces with <code>sh calculations/run-all.sh</code></sub>
</div>
