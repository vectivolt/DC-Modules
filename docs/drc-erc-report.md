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


## R6 — three program/status pins were floating (found 2026-09-06, FIXED)

Found by reading the emitted netlist back pin-by-pin during a working-zoom inspection pass, not
by ERC. ERC cannot catch these: an unbound pin is not an *error* to it, and all three parts had
every other pin correctly connected.

| part | pin | function | was | now |
|---|---|---|---|---|
| `NSI6611` (9 drivers/board) | 12 `RDY` | active-low open-drain power-good | floating — could not pull | wired-OR onto per-board `DRV_RDY`, one 10 k pull-up in `SafetyChain` |
| `TPS3430` (`USUPA/B`) | 2 `CWD`, 4 `CRST` | watchdog timeout, reset delay | floating — **window undefined** | timing caps to DGND, sized for the 10 ms window of E27/F.32 |
| `NCP1252A` (`UAUX`) | 4 `RT` | switching-frequency program | floating — **no defined Fsw** | `RAUXRT` to GND, sized for the 65 kHz DCM point of E26/D4 rev C |

The watchdog one is the serious one: `USUP` is the centrepiece of the E27/CB-10 safety chain, and
with its window pin floating the timeout it enforced was undefined.

**Values are flagged, components are not.** The exact capacitance-per-millisecond and the RT for
65 kHz come off the final datasheets (§K). The components, their nets and their pin bindings are
correct regardless, and that is the part that was actually missing — a floating program pin is a
defect, a to-be-confirmed value is a normal open item. Both are marked REVIEW.

**Why they survived so long.** `easyeda-pages.mjs` assigns components to sheet sections by
designator regex (E34). New designators matched nothing, so the first attempt at this fix built
cleanly, bound the pins, and then **silently dropped the four new parts off the sheets** — leaving
`CWD`/`CRST`/`RT` on single-pin nets, which is worse than the no-connect they replaced. Caught by
the zero-single-pin-net gate from R4. The section patterns now cover them and
`acdc/dcdc UNASSIGNED: none`.

New gates: `R3-RDY`, `R3-WDT`, `R3-RT` assert the parts exist in the source; `R3-BOUND-<sku>`
asserts the pins are actually bound in each SKU's emitted netlist, so a rebuild that misses a SKU
fails loudly.

30 kW after the fix: 615 components (608 + 7), 1763 pins **100.00%**, 0 single-pin nets,
0 ink collisions, layout gate passes.


## EasyEDA verification — confirmed in the app, 2026-09-06

Run against the real artifact in EasyEDA Pro V3.2.149, not against the source files.

| project | sheet | errors | warnings | fatal (footprint) |
|---|---|---|---|---|
| `DC Modules 30kW SHIP D.3 fp` | 30kw-acdc | **0** | **0** | 9 |
| | 30kw-dcdc | **0** | **0** | 14 |
| `DC Modules 60kW SHIP D.3` | 60kw-acdc | **0** | **0** | 9 |
| | 60kw-dcdc | **0** | **0** | 16 |
| `DC Modules 120kW SHIP D.3` | 120kw-acdc | **0** | **0** | 9 |
| | 120kw-dcdc | **0** | **0** | 20 |

**Zero errors and zero warnings on all six sheets — every board of every SKU.** The title block reads correctly in the app on
each: Rev D.3, Title, File, Comp and all four Comments populated, so a printed sheet identifies
its own SKU, board and sheet number.

**IMPORT ORDER MATTERS — import the footprint library FIRST, then the schematic.** EasyEDA binds
a component to its footprint *at schematic-import time*. Import the schematic first and every
custom footprint stays unbound no matter what you add to the library afterwards; re-importing the
schematic is the only way to bind them. Measured on 30 kW:

| order | fatal on acdc | fatal on dcdc |
|---|---|---|
| schematic only | 89 | 79 |
| schematic, then footprints | 89 | 73 |
| **footprints, then schematic** | **9** | **14** |

168 -> 23 across the module. The residue is the seven catalogue footprints still needing part
selection (three relays, fuse holder, tactile, CAN choke, 2-digit display).

Correct sequence per SKU:
1. `DC-Modules-footprints-<sku>.zip` -> **Extract Libraries**
2. `DC-Modules-<sku>-final.zip` -> **Import Document**

The 120 kW import first failed partway through its footprint library when the machine hit 100%
disk (`ENOSPC`, 10 of 27 footprints). Retried after ~470 MB was reclaimed and it completed
cleanly — the partial library was simply overwritten by repeating step 1.

Residual fatal errors are the seven catalogue footprints still needing part selection: three
relays (needing the mirror-contact p/ns), the fuse holder, a 6x6 tactile, the CAN common-mode
choke and the 2-digit display. Nothing else on any sheet.


## R8 — KPREA/KPREB specify a part family that cannot meet the requirement (found 2026-09-06, OPEN)

Found by going to the manufacturer datasheets for the footprints that LCSC could not resolve.
Two of the three relay families resolved cleanly (see R-notes in `lcsc-map.mjs`); the third did
not, and the reason is a real specification error rather than a missing land.

`KPREA` / `KPREB` carry the BOM p/n **`HFE9-10A-1kV-M`**. The Hongfa **HFE9** is a
*"MINIATURE HIGH POWER **LATCHING** RELAY"*. It fails the design in three independent ways:

| requirement (E30 / schematic) | HFE9 actual | verdict |
|---|---|---|
| switch the bank rail, 1 kV class | **max switching voltage 250 VAC** | wrong voltage class |
| monostable coil, driven continuously by the ULN2803 on `COIL_KPRE*` | **latching** — 50 ms set/reset pulses, holds state with the coil unpowered | wrong drive, and it would not default open on power loss |
| mirror contact for `RELAY_FB_KPRE*` readback | contact form **1A or 1B only**, no auxiliary contact | the readback has nothing to read |

The schematic already draws all three requirements: `KPREA.4/6` on the bank rail, `KPREA.1/8` on
`V24`/`COIL_KPREA` (continuous drive), and `KPREA.3/5` on `RELAY_FB_KPREA`/`DGND` (the mirror).
So the drawing is right and the **part number is wrong** — `HFE9-10A-1kV-M` reads like a
requirement summary that was never checked against a real Hongfa part.

The latching behaviour is the safety-relevant one: a precharge bypass relay that holds its last
state through a power loss is the opposite of what a default-open precharge path needs.

**Suggested resolution** (needs sign-off, not guessing): re-specify against a family that already
has all three properties in its catalogue, both of which this session confirmed from datasheets —
`HFE82V-20` or `-40E` (1000 VDC class, `HA` auxiliary contact option, monostable) for the bank
side, or the `HF167F/024-HATF(764)` used for the AC-DC precharge bypass. Current through KPRE* is
limited by `RPREA`/`RPREB` (10 R 25 W pulse), so a 20-40 A frame is ample.

No footprint has been drawn for `RELAY_HFE9_PCB` — drawing a land for a part that cannot be used
would only make the error harder to see.


## R7 — isolated voltage senses have a floating output leg (found 2026-09-06, OPEN — needs a decision)

Found by `calculations/unwired-pins.mjs`, a new check that compares the pins a symbol DECLARES
against the pins any trace actually reaches in the built netlist. ERC cannot see this class of
defect: nothing is "unbound" from its point of view, because the pin was never asked to connect.

`ISOAMP_PINS` declares `pin6: "OUTN"`. `AMC1311`/`AMC1350` have a **differential** output, and
`IsoVSense` traces only `OUTP`. So on all eight isolated voltage senses —
`UIVV1/2/3` (line), `UIVBP`/`UIVBM` (bus, midpoint), `UIVOA`/`UIVOB`/`UIVOV` (bank, output) —
the negative output leg is floating.

**The design already does this correctly elsewhere.** `OutputShunt` routes `USHO.OUTN` to
`SNS_IOUTN` and into `ULLC.16`, so the current sense is read as a true differential pair. The
voltage senses are wired as if single-ended, but a single-ended reading needs a defined reference
and the floating leg does not provide one.

**Do NOT "fix" this by tying OUTN to AGND.** These outputs swing differentially about a
common mode near VDD2/2, so grounding one leg fights the output driver. The two real options are:

1. Route each `OUTN` to the MCU as the negative of a differential ADC pair, matching what
   `SNS_IOUT`/`SNS_IOUTN` already do — costs 8 more ADC inputs and a pin-map revision.
2. Terminate per the datasheet's single-ended application circuit, if that part supports one.

**The decision is now costed, so it only needs a yes.** The design's own precedent settles the
method: `SNS_IOUT` sits on PC0 (`ADC0_IN5`) and `SNS_IOUTN` on PC1 (`ADC0_IN6`) — two ordinary
single-ended channels on one ADC, subtracted in firmware, not a hardware differential pair. Doing
the same for the voltage senses costs:

| MCU | senses needing a second leg | extra ADC channels |
|---|---|---|
| `UPFC` | `SNS_VAC1/2/3`, `SNS_VBUSP`, `SNS_VMID` | 5 |
| `ULLC` | `SNS_VOUT`, `SNS_VBKA`, `SNS_VBKB` | 3 |

Both parts have room: `UPFC` has 61 of 100 pins allocated and `ULLC` 77, so 8 more ADC-capable
pins exist. The work is a pin-map revision plus a firmware subtract per channel — the same code
path `SNS_IOUT`/`SNS_IOUTN` already uses.

**What happens if it is left as-is:** a floating `VOUTN` is electrically safe — it is an output,
not an input — so nothing is damaged and nothing is unbound. The cost is measurement quality: the
ADC reads `VOUTP` against AGND, so it sees the part's ~1.44 V output common mode plus half the
differential swing, with the common-mode drift uncorrected. That is workable with a calibrated
offset in firmware, which may well be the right answer for bus and bank voltage. It is a
deliberate accuracy trade, and the point of R7 is that it should be made deliberately rather than
inherited from an untraced pin. Listed with the open MCU-architecture items in
`docs/assumptions.md`.

**The check is now standing.** `unwired-pins.mjs` reports, per SKU, every declared pin no trace
reaches, minus a KNOWN list where each exclusion carries its reason (explicit NC pins, spare AND
gate outputs, the shift-register cascade output, internally-paired tactile contacts, the CAN
shield, harness spares). 30 kW: 1930 declared pins, 185 unreached, 177 with a recorded reason,
**8 left to adjudicate — all of them this one finding.**

A first version of the check grepped the `.tsx` source and was wrong in both directions: it could
not see traces generated in a loop (`.USR1 > .${q}`), so it cried wolf over the entire HMI display
and shift register, and it matched pin names globally, so a pin wired on one part looked wired on
every part sharing a pin map — which is exactly how it MISSED `OUTN` at first. Working off the
built netlist removes both ambiguities.


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
