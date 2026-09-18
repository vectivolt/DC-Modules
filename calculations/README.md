<img src="../docs/assets/banner-verification.svg" alt="" width="100%"/>

# 🧮 Calculations & Gates

<sub>Every engine, audit and generator — and the one command that reproduces the design</sub>

<p>
  <img src="https://img.shields.io/badge/status-OVERVIEW-0969da?style=flat-square" alt="status: overview"/>
  <img src="https://img.shields.io/badge/rev-E84-f2b705?style=flat-square" alt="revision E84"/>
  <img src="https://img.shields.io/badge/updated-2026--09--18-8b949e?style=flat-square" alt="updated 2026-09-18"/>
  <img src="https://img.shields.io/badge/run--all-exit_0-2ea44f?style=flat-square" alt="run-all: exit 0"/>
</p>

> [!NOTE]
> **Purpose** — every number in the documentation traces to a runnable tool in this directory, and one command
> reproduces the lot. The directory holds exactly the tools the production path uses: design engines, standing
> gates, the release-sheet pipeline (it ends at KiCad), the sheet-QA suite, the BOM factory and the documentation
> generators.

```bash
sh calculations/run-all.sh
```

## At a glance

| | |
|---|---|
| **One command** | `sh calculations/run-all.sh` — **exit 0** end to end; every gate runs as its own command so none can pass silently |
| **What it produces** | the design CSVs in `out/`, the four module BOM pages, the four module magnetics pages, the busbar and pin-map pages |
| **Standing gates** | stress-audit **163** · current-coordination **107** · review-checks **162** · mag-sync 52 · magnetics-envelope 30 · fw-constants-sync 30 · fault-energy 24 · conductor-audit 18 · temp-critique 11 · repo-hygiene 7 |
| **Clean-room check** | `verify-independent` **243 / 243** — its own netlist parser and its own physics |
| **Firmware** | `sh firmware/run_tests.sh` — **334 checks** under ASan/UBSan across seven binaries; `port-pin-audit` holds 56 port pins against the card generator |
| **Documentation** | `docs-lint` — 41 registered pages, every link, anchor, masthead, footer and mermaid type |

## 1. The battery, in the order it runs

```mermaid
flowchart TB
  subgraph ENG["1 · Engines"]
    direction LR
    DB["design-basis"] --> PFC["pfc-design · pfc-control"] --> LLC["llc-design"] --> LOSS["loss-budget"]
    LOSS --> GRID["envelope-grid<br/>4,536 pts"] --> VS["vienna-switched"] --> MC["monte-carlo"] --> FSM["fsm-sim 26/26"]
    FSM --> DM["dm-choke-design"] --> LISN["lisn-precompliance"]
  end
  subgraph BOM["2 · BOM factory"]
    direction LR
    BG["bom-gen → bom-cost + 4 module BOM pages"] --> BM["bom-maturity"]
  end
  subgraph STR["3 · Structure audits"]
    direction LR
    SC["schematic-check"] --> MIA["module-interconnect-audit"] --> PA["polarity-audit"]
  end
  subgraph PHY["4 · Physics gates"]
    direction LR
    SA["stress-audit"] --> TC["temp-critique"] --> CA["conductor-audit"] --> ME["magnetics-envelope"] --> FE["fault-energy"] --> CC["current-coordination"] --> MD["mag-docs → 4 module magnetics pages"] --> MS["mag-sync"] --> RFQ["magnetics-rfq-audit"] --> SBY["standby-budget"] --> MTB["mtbf-budget"]
  end
  subgraph IND["5 · Independent, hygiene and documentation"]
    direction LR
    VI["verify-independent 243"] --> FP["footprint-audit"] --> RH["repo-hygiene"] --> RC["review-checks"] --> DL["docs-lint 41 pages"]
  end
  FW["6 · port-pin-audit · fw-constants-sync<br/>run_tests.sh 334 checks · 7 binaries<br/>GD32G553 target build"]
  ENG --> BOM --> STR --> PHY --> IND --> FW
  style PHY stroke:#d19a00,stroke-width:2px
  style IND stroke:#2ea44f,stroke-width:2px
```

## 2. Engines — the design truth

| Tool | Owns |
|---|---|
| `design-basis.mjs` | line current and available power per module over the input window |
| `pfc/pfc-design.mjs` | Vienna device losses and the D1 choke search on the **catalog core** |
| `pfc/pfc-control.mjs` | current and voltage loops with an ngspice AC cross-check |
| `pfc/vienna-switched.mjs` | **cycle-by-cycle** 3-φ Vienna — catalog L(i), floating neutral, dips, phase jump, high line; D1 ripple, iGSE core loss, switch-end peak |
| `magnetics/d1-choke.mjs` | the D1 PFC choke model — datasheet MLT, strand-resolved ripple copper, wound surfaces, air ∥ bond thermal |
| `magnetics/d1-fd.mjs` | 2-D eddy-current anchor for the D1 bundles → `out/d1-fd.csv`, fingerprinted per build |
| `llc/llc-design.mjs` | tank synthesis (joint Ln · Q solve), operating map, first-pass transformer basis |
| `llc/tanks.mjs` | **the one per-SKU tank table** — Lr, Cr, Lm, Coss, snubber and turn-off coefficient — with the fingerprint every LLC result carries |
| `emi/dm-choke-design.mjs` | the D7 CM-choke engine per SKU |
| `emi/lisn-precompliance.mjs` | conducted-emissions tendency per variant |
| `thermal/loss-budget.mjs` | loss budgets from the power-solved LLC current, JBS vs SR, derating |
| `thermal/mount.mjs` | the one device-mounting basis every Tj engine reads — clip-mounted TO-247 on Al2O3 |
| `system/envelope-grid.mjs` | the 4-SKU envelope grid — **4,536 points**, every point passing, some carrying a registered thermal fold |
| `system/monte-carlo.mjs` · `system/fsm-sim.mjs` | tolerance batches (N = 10k) · the scenario suite, 26/26 |
| `busbar/busbar-calc.mjs` | bulk-copper paths and the joint schedule → `docs/busbar-drawings.md` |
| `control/umod-pinmap.mts` | **single source** for the card map, harness and MCU pins → `umod-map.gen.ts` |
| `plot.mjs` | zero-dependency SVG plotter used by the engines |

## 3. Standing gates

| Gate | Proves | Checks |
|---|---|---:|
| `cost/bom-maturity.mjs` | every BOM line resolves to an orderable, class, direct, custom or tracked-review status; `bom-gen` itself refuses a line with no status | — |
| `schematic-check.mjs` | 0 symbol overlaps on every built SKU pair | — |
| `module-interconnect-audit.mts` | studs · all 40 harness ways · the 88-way slot · RATING straps | — |
| `polarity-audit.mts` | every polarized part has its + / anode on pin 1, proven from the netlist | — |
| `stress-audit.mjs` | every device, magnetic, pulse part and protection class against its own line, including the `[DPT]` device-edge rows | 162 |
| `magnetics/temp-critique.mjs` | hot equilibria, runaway distance, cold start, saturation at temperature on measured 3C95 | 11 |
| `magnetics/conductor-audit.mjs` | Dowell / Sullivan AC copper at the simulated currents | 18 |
| `magnetics/magnetics-envelope.mjs` | D2 / D3 flux, core and copper loss and the two-node thermal network at every power-solved corner | 30 |
| `magnetics/mag-sync.mjs` | one magnetics identity table asserted across the magnetics docs, parts-db, the KiCad panel and boards.tsx; computed masses | 52 |
| `system/fault-energy.mjs` | stored energy, wire vs fuse, surge, air and coolant budget | 24 |
| `system/current-coordination.mjs` | simulated peaks vs trips, observability, per-die fault pulse, DESAT vs SCWT, fault flux, film banks, D_OUT, the Vienna's own link-capacitor current | 107 |
| `system/standby-budget.mjs` | the drawn HV passive network (parsed off the sheets) vs the registered standby arithmetic and the ≤ 10 W target | — |
| `reliability/mtbf-budget.mjs` | parts-count MTBF prediction vs the registered table — a BOM change that moves reliability re-registers consciously | — |
| `verify-independent.mjs` | clean-room recompute — own netlist parser, own physics, external anchors (§K) | 243 |
| `footprint-audit.mjs` | the naming queue stays CLOSED — zero unnamed packages, zero MPN / land conflicts | 0 · 0 |
| `repo-hygiene.mjs` | nothing that is no longer produced, referenced or buildable is still tracked — ignored files, orphaned decks, unused lands, dead parts-db and LCSC rows, repeated keys in the lookup tables, and derived result files that are older than their inputs | 10 |
| `review-checks.mjs` | every audit and review closure, as an assertion against the page or engine that must still carry it | 154 |
| `docs-lint.mjs` | every link and anchor resolves, page chrome matches `doc-chrome.mjs`, diagrams render | 41 pages |
| `magnetics-rfq-audit.mjs` | every magnetic drawing on the module pages complete enough to order | 0 missing |
| `control/port-pin-audit.mjs` | the GD32G553 port's pin table against the card generator | 56 pins |
| `control/fw-constants-sync.mjs` | every ADC scale, tank constant, loss coefficient and link C the firmware types by hand, against the source that owns it — the only gate that reads `hal/*.c`; it also holds the derating curve and the derated thermal corner to the firmware's law | 30 rows |
| `magnetics/mkf-crosscheck.py` *(by hand, Python 3.12 venv with PyOpenMagnetics 1.4.0)* | every custom magnetic re-made in OpenMagnetics MKF: D1 toroid Rdc and Kool Mµ DC bias, D2 / D3 Rdc, gap fringing, 2-D copper and thermal, D4 gap and copper, D7 permeability; evidence quoted by the module pages | Rdc ± 5 % · class lines |

## 4. Release-sheet pipeline — KiCad-5 is the record

```mermaid
flowchart LR
  SP["sheet-pages.mjs &lt;sku&gt;"] --> SNG["sheet-netlist-gen.mjs &lt;sku&gt;"] --> K5["kicad5-gen.mjs &lt;sku&gt;<br/>sheets + SHIP zip"] --> KV{"kicad5-verify.mjs"} --> KP["kicad5-print.mjs &lt;sku&gt;"] --> PDF["sheets-to-pdf.mjs<br/>boards/out-pdf/"]
  style KV stroke:#2ea44f,stroke-width:2.5px
```

One command runs the whole pipeline — board builds, sheets, pin verification, the sheet-QA suite, prints and PDFs:

```bash
sh calculations/release-sheets.sh      # ≈ 20 min; run it after any change to the schematic source or to a BOM description
```

> [!IMPORTANT]
> **Order matters.** Sheet pages and netlist generation must re-run after any parts-db value, mpn or description
> change (descriptions feed the sheet payloads), and prints must run before PDFs. `sheets-to-pdf` waits for
> headless Chrome's write confirmation rather than its exit, because Chrome does not exit after printing.

## 5. Sheet-QA suite — measures the emitted `.sch`, not the intent

| Tool | Measures |
|---|---|
| `kicad5-verify.mjs` | every connected pin against an independent netlist — **7,409 / 7,409 across five targets** |
| `kicad5-visual.mjs` | ink collisions |
| `alignment-audit.mjs` · `wiring-audit.mjs` · `frame-padding.mjs` · `void-audit.mjs` | near-miss alignment · wiring rules · frame padding · worst enclosed hole |
| `cell-uniformity.mjs` | every replicated cell identical to its twins (per-SKU families) |
| `kicad5-preview.mjs` · `kicad5-detail.mjs` | sheet and tile renders for eye review |
| `footprint-gen.mjs` · `footprint-map.mjs` | the drawn lands the footprint audit and the land-aware part resolver read |

## 6. BOM factory and documentation generators

| Tool | Writes |
|---|---|
| `cost/parts-db.mjs` | the classifier, per-SKU overrides and mechanical lines |
| `cost/bom-gen.mjs` | `out/bom-<sku>.csv`, [`docs/bom-cost.md`](../docs/bom-cost.md) and the four module BOM pages ([30 kW](../docs/bom-30kw.md) …) (generated) |
| `magnetics/mag-docs.mjs` | the four module magnetics pages ([30 kW](../docs/magnetics-30kw.md) …) from the gate evidence (generated) |
| `evidence.mjs` | captures every gate's printed check rows into `out/evidence/<gate>.json` for the generators |
| `cost/lcsc-map.mjs` · `cost/lcsc-from-build.mjs` | LCSC assignments and their statuses |
| `pin-map-export.mjs` | [`docs/symbol-pin-map.md`](../docs/symbol-pin-map.md) (generated) |
| `busbar/busbar-calc.mjs` | [`docs/busbar-drawings.md`](../docs/busbar-drawings.md) (generated) |
| `doc-chrome.mjs` | the page registry: banner, title, badges and footer for all 41 documentation pages |

Outputs land in `out/`; the CSVs are committed because documents cite them.

> [!TIP]
> **How this page is checked** — itself — `sh calculations/run-all.sh` is the gate, and it exits non-zero if any engine, audit, generator or the firmware suite fails.

---

<div align="center">
<sub><a href="../docs/reliability-budget.md">← Reliability Budget</a> &nbsp;·&nbsp; <a href="../docs/README.md">🧭 Documentation hub</a> &nbsp;·&nbsp; <a href="../spice/README.md">SPICE Simulation Suites →</a></sub>

<sub>Vectivolt DC-Modules · documentation rev E84 · every number reproduces with <code>sh calculations/run-all.sh</code></sub>
</div>
