# DRC / ERC Report (§49-23) — generated from tsci builds, rev F (schematic rev D.1, 2026-09-05)

Rev F: the three DC-DC boards rebuilt after ECO-2a (PV-driver bank bleeders replacing the
opto+bias stacks) — again 0 netlist port errors each (`UPVA/UPVB` in, `PSQDA/B·UQDA/B` out,
verified in circuit JSON); AC-DC boards unchanged from the rev-D build.

Scope note: PCB-layout DRC (placement/clearance/routing) is **N/A by customer directive** —
this report covers schematic/netlist ERC: port binding, pin-label validity, MCU pin-map asserts,
connectivity completeness. Regenerate: `tsci build boards/<sku>/<side>.tsx`.

| Board | Netlist port errors | Invalid pin/label errors | MCU pin-map assert | Build |
|---|---|---|---|---|
| 30kw/acdc | 0 | 0 | PASS (no throw) | CLEAN |
| 30kw/dcdc | 0 | 0 | PASS (no throw) | CLEAN |
| 60kw/acdc | 0 | 0 | PASS (no throw) | CLEAN |
| 60kw/dcdc | 0 | 0 | PASS (no throw) | CLEAN |
| 120kw/acdc | 0 | 0 | PASS (no throw) | CLEAN |
| 120kw/dcdc | 0 | 0 | PASS (no throw) | CLEAN |

Residual (non-blocking) notices: coarse-grid placement warnings (courtyard overlaps / pad
clearance) — deliberately ignored per the 2026-09-04 layout directive; designator-prefix style
suggestions; React 'key' runtime notice — cosmetic, no electrical meaning.

Overall: **ALL SIX BOARDS ERC-CLEAN** at rev D (cells v4 / boards v4: R2 closure — resonant
burdens, per-board 3.3 V bucks, FLT_LLC pin, bank bleeders, dual 120 kW relays, 4-fan scaling,
2-series balance/star, aux rev C — all in the netlists; spot-proofs in the R2 fix log). ERC scope
caveat stands, twice-proven now: ERC proves connectivity, not electrical sense — the
electrical-sense gate is `calculations/review-checks.mjs` (R1 31 + R2 set, ALL PASS incl. class
asserts) + the simulation set (incl. aux rev C 9/9) + the §K datasheet gate (open by nature).

## Schematic-layout gate (rev D.2, E34 — 2026-09-05)

The sheets themselves are now a verified artifact:

| Check | Tool | Result |
|---|---|---|
| Symbol-overlap count per board | `node calculations/schematic-check.mjs <sku>/<side>` | **0 on every board** (was ~290/board before the E34 re-layout) |
| Cross-section wiring policy | `schSectionName` on every component + `schMaxTraceDistance={0}` | cross-section nets render as named labels; longest remaining wire ≤ ~17 units (local, intra-section) vs 37+ before |
| Sectioned release sheets | `node calculations/schematic-export.mjs` | `boards/<sku>/out/<side>-schematic.svg` — titled dashed frames per functional section (computed from real geometry, never eyeballed), title block, auto-fit canvas |

Regenerate after any schematic edit: `tsci build` the board(s) → `schematic-check` (must stay 0)
→ `schematic-export`. New cells/sections must declare a schematic envelope (comment in the cell)
and a `schSectionName`, per E34.
