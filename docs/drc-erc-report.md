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


## R5 — EasyEDA's KiCad importer mirrors symbols vertically (found 2026-09-06, FIXED)

**Defect (in EasyEDA, worked around here).** EasyEDA Pro's KiCad-legacy importer places a
symbol's pins at `(ux+px, uy+py)`. It does not apply the `1 0 0 -1` orientation matrix that maps
library Y-up to sheet Y-down, so every symbol comes in mirrored about its own Y axis.

**How it was found.** EasyEDA's schematic DRC warned that `SNS_IOUTN` was "a single network
connected to only one component pin", though the netlist gives it two (`ULLC.16`, `USHO.6`).
Zooming to `USHO` showed three pin rows on a two-pin-per-side symbol: a labelled chevron with no
wire, a working row, and a wired pin with no label.

**Proof, not inference.** Exporting EasyEDA's DRC log gave 90 floating pins on `30kw-dcdc`.
Four candidate transforms were scored against that list:

| Hypothesis | predicts | matches the 90 | extra |
|---|---|---|---|
| `(ux+px, uy-py)` — the KiCad matrix, what we assumed | 9 | 0 | 9 |
| **`(ux+px, uy+py)` — vertical mirror** | **99** | **90 / 90** | **9** |
| body-end shift outward by pin length | 943 | 90 | 853 |
| `(ux-px, uy-py)` — horizontal mirror | 335 | 46 | 289 |

The mirror hypothesis accounts for every reported pin, and its only 9 extras are exactly the 9
deliberate no-connect pins on that sheet, which carry no wire by design.

**Why it was nearly invisible.** Pins at library Y=0 are fixed points of the mirror, and 545 of
the sheet's pins sit there — so most of the schematic imported correctly. The rest landed at the
mirrored position, and where a symmetric symbol had another stub there, the pin bound to the
**wrong net with no warning**:

| | 30 kW acdc+dcdc, before the fix |
|---|---|
| pins on the correct net | 1116 |
| pins floating (DRC warns) | 165 |
| **pins silently on the WRONG net** | **454** |

The 454 were the real hazard: the 165 floating pins were the only part EasyEDA complained about.

**Fix.** `kicad5-gen.mjs` writes the `.lib` pre-mirrored about Y (`mirrorLibY`: pin `posy` and
orientation U/D, plus `S`/`C`/`P`/`A`/`F*` geometry). Mirroring twice is the identity, so EasyEDA
mirrors it back and the sheet renders and connects exactly as authored. `kicad5-verify.mjs` now
resolves pins at `(c.x+p.x, c.y+p.y)` — it checks what EasyEDA will actually see, rather than a
matrix convention EasyEDA ignores. That verifier is the standing gate.

After the fix, all pins land on their intended net under EasyEDA's transform: 30 kW 1735,
60 kW 2406, 120 kW 3788 — 100.00%, 0 floating, 0 wrong.

**Note for future format changes:** the file is now only "upside down" if opened in genuine
KiCad 5, which is a transport format here, not a deliverable. If EasyEDA ever fixes its importer,
drop `mirrorLibY` and revert the verifier to `c.y - p.y` together — they must move as a pair.


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
