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

## R4 — output return path broken (found 2026-09-06, FIXED)

Found by an EasyEDA schematic-DRC warning ("single network connected to only one component pin")
while inspecting the imported 30 kW sheets, then confirmed against the netlist.

**Defect.** `SeriesParallelRelayMatrix` closed the output negative with

    <trace from={bkBn} to={outn} ... />        // packages/power-primitives/cells.tsx

Both endpoints are `net.*` selectors. A tscircuit `<trace>` joins **ports**, not nets, so a
net-to-net trace binds nothing and fails silently — no ERC error, because no port is left
unbound. Result: `OUTN_SH` carried exactly one pin (`RSHO.1`, the output shunt's A terminal) and
the bank-negative rail `BKBN` never reached it. The DC output return path dead-ended at the
shunt, and the output current sense read a node with no current in it.

Every other board built ERC-clean because ERC checks port binding, not whether a net has ≥2 pins.

**Fix.** The bond is plain copper, not a switched contact, so the shunt input simply *is* the
bank-negative rail: `OutputShunt inn="net.BKBN"` (was `net.OUTN_SH`); the no-op trace and the
now-dead `outn` prop are removed. Path is now `BKBN → RSHO.1 → RSHO.2 → OUTN → JOUTN` with the
Kelvin taps `RSHO.3/.4` feeding `USHO`, unchanged.

**Sweep.** `cells.tsx:445` was the only net-to-net trace in the codebase — every other
`from={net}` pairs with a real port. Single bug, not a pattern. Shared cell, so all three SKUs
were affected and all three are fixed by the one change.

**New standing check.** Single-pin nets are now a gate, not a coincidence: the design must have
**zero** nets with fewer than two pins. 30 kW: was 1, now **0**.

| Board | single-pin nets before | after |
|---|---|---|
| 30kw acdc+dcdc | 1 (`OUTN_SH`) | **0** |


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
