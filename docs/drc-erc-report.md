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


## R12 — RESOLVED 2026-09-06, and the residue was my own doing

`CVCC` resolves to **`EL-47u-35`**, land `CAP-TH_L6.3-W6.3-P2.50` — a 6.3 x 6.3 mm through-hole
electrolytic, which is the right part for a 47 uF 35 V flyback VCC reservoir.

That rule, `/^CVCC$/ -> EL-47u-35`, was **already in parts-db**, with its land already in
footprint-map. The original symptom was R13: the greedy `/^C\w+C$/` Vienna-clamp regex sat earlier
in a first-match-wins list and shadowed it, so CVCC was priced and landed as a 100 nF 250 V film
cap. Tightening that regex to `/^C[ABC]\d+C$/` was sufficient on its own — CVCC would have fallen
straight through to the correct rule.

**It did not, because I inserted a second `/^CVCC$/` rule ahead of it** pointing at a new
`FILM-47u-VCC` class, on the reasoning that a 47 uF film box is unbuildable and should be flagged
rather than silently priced. The observation was right; the action was wrong twice over. It
shadowed a correct pre-existing rule, and it replaced a sourceable classification with one that by
its own argument can never be sourced. Removed, along with the `FILM-47u-VCC` lcsc entry.

The lesson is the same one R9 taught an hour earlier: **before adding a rule, check whether the
repo already has one.** Both times the answer was already present and merely unreachable, and both
times adding something new made it worse rather than better.

Remaining, and genuinely open: `packages/power-primitives/cells.tsx:868` still declares
`footprint={FilmBoxFP(5)}` for CVCC. That does not affect the emitted schematic — footprint-map
governs the F2 field — but it is a source-level inconsistency of the same kind already recorded for
`LCAN`'s `soic8`, and should be corrected if the tscircuit PCB is ever used.

### original analysis
## R12 — 47 uF in a 5 mm film box is not a buildable part (found 2026-09-06, OPEN)

`CVCC` is declared `capacitance="47uF" footprint={FilmBoxFP(5)}` in
`packages/power-primitives/cells.tsx:868`. It is the aux flyback's VCC hold-up cap
(`CVCC.pin1 -> UAUX.VCC`, `pin2 -> DCN`).

A 5 mm-pitch film box tops out around 1-2.2 uF at low voltage. 47 uF of film in that body does not
exist. The value is almost certainly right for the job -- a flyback controller needs tens of uF to
hold VCC up through startup before the aux winding takes over -- so it is the *technology* that is
wrong, not the number: this wants an electrolytic (or a tantalum/polymer), not a film box.

Left as declared rather than silently converted, because changing a part's technology is a design
decision. Classed as `FILM-47u-VCC` / REVIEW so it cannot quietly inherit a film price or a film
land pattern while the question is open.

## R13 — over-broad designator regexes mis-classified 57+ parts (found 2026-09-06, FIXED)

Parts are matched to the cost/LCSC database by a first-match-wins list of designator regexes in
`calculations/cost/parts-db.mjs`. Three of them were written loosely enough to capture parts they
were never meant to describe:

| rule | intent | also captured |
|---|---|---|
| `/^R\w+(B\|CT)$/` -> `R1206-33R-1%` | 33 R CT burden | **every** resistor ending in `B` -- 19 per SKU, of which only `RA0B/RB0B/RC0B` are burdens. The 1 MOhm bleeders `RCGB` and `RPVBB` were priced as 1.5-cent burdens. |
| `/^R\w+DL$/` -> `R0805-prec-0.1%` | 0.1% divider bottom | `RQDL`, a 330 R opto anode current-limit resistor (`RQDL.pin2 -> UQD.ANO`) |
| `/^C\w+C$/` -> `FILM-100n-250` | Vienna RCD clamp | `CVCC`, the 47 uF aux VCC hold-up cap (see R12) |

This is invisible to ERC and to the schematic verifier -- the netlist is perfectly correct. It only
shows up in what the BOM *says* each part is: wrong tolerance, wrong voltage class, wrong price,
and a wrong land pattern for anything whose footprint is class-derived.

**How it was found:** by grouping every component by the rule that claimed it and flagging any
narrow class holding values more than a decade apart. Worth keeping as a habit -- a regex bug in a
lookup table produces a confidently wrong BOM, not an error.

**It also produced a bad fix earlier in the same session.** Two LCSC keys, `R1206-33R-1%|45.3k` and
`R1206-33R-1%|0R`, were added to satisfy the tail of unassigned parts. Those keys should never have
existed: a 33 R burden class has no 45.3 k member. The symptom was assigned a part number instead
of the cause being questioned. Both keys are removed.

**Fixed:** rules tightened to `/^R[ABC]\d+B$/`, `/^R\w{2}DL$/`, `/^C[ABC]\d+C$/`, with `CVCC`
given its own class. Every designator still matches a rule (checked), and narrow classes are now
value-consistent. Gate `R13-CLASS` in `calculations/review-checks.mjs` fails the build if any
narrow class ever holds more distinct values than its spec allows.

## R11 — RESOLVED 2026-09-06: the frozen spec already answers it, and the answer is "no Y part"

`CCGB` takes a generic 4.7 nF 1206 X7R, **C107208**. That is what the design originally had, and it
is correct.

The question was whether CGND-DGND crosses a SAFETY barrier. The project's own frozen requirement
answers it: **E25** (`docs/assumptions.md`, FROZEN) establishes one touch-safe SELV control domain,
and `docs/architecture.md:76` states it plainly — *"the control domain is touch-safe SELV, so the
HMI/SWD/fans/CAN need no additional barriers."*

So CAN sits INSIDE the SELV domain. The isolated transceiver and isolated supply are there to break
a ground loop to an off-board charger controller whose ground may sit at a different potential —
**functional** isolation, not a safety barrier. A Y-class part is not required, and the RC bridge is
doing exactly the common-mode job it is shaped for.

This closes the last of R8-R12 and, like R8, R9 and R12 before it, the answer was already in the
repository. The earlier note reasoned from an internal inconsistency — every OTHER barrier-crossing
cap here is Y1-rated — which was a sound observation and the wrong conclusion, because those
crossings (AC-PE, DGND-PE, output-PE) really are safety barriers and this one is not. Consistency
with a pattern is weaker evidence than the requirement that defines the domain.

### original analysis
## R11 — partially actioned 2026-09-06

`CCGB` now has its own part class, `MLCC-Y-CGND` (REVIEW), instead of falling under the generic
`MLCC-small`. That does not answer the question below — it makes it structural, so the part can no
longer silently inherit a generic 50 V X7R the moment someone assigns that class a number.

Note the fix is not only a class change: `CPET`, the DGND-PE barrier cap, is declared with
`FilmBoxFP(10)` while `CCGB` is declared `footprint="1206"`. A Y1 4.7 nF 440 VAC part is a
through-hole film box, not a 1206 SMD, so adopting the Y class means changing the land too.

### the question, unchanged
## R11 — the CAN barrier-bridging capacitor is not safety-rated (found 2026-09-06, OPEN)

`CCGB` (4.7 nF) and `RCGB` bridge **CGND to DGND**. CGND is a genuinely isolated domain — its only
other members are `UCAN.GND2` (isolated transceiver secondary), `PSCAN.-Vo` (isolated supply
output), `JCAN.SGND` and `TVSCAN.C`. So this RC sits **across a galvanic isolation barrier**, which
is standard practice for common-mode control.

The inconsistency: every other barrier-crossing capacitor in this design is Y1 safety-rated
(`Y1-4n7-440`) — `CYO1`/`CYO2` (output to PE), `CPET` (DGND to PE), `CY1`/`CY2`/`CY3` (AC to PE).
`CCGB` alone is classed as a generic `MLCC-small` and would land as an ordinary 50 V X7R.

A generic MLCC across an isolation barrier is not safety-rated: if it fails short — the normal MLCC
failure mode — the isolation is defeated. Y-class parts are specified precisely because they are
qualified to fail open.

**Not asserted as a defect, because it depends on what the barrier separates.** If the CAN side is
SELV-to-SELV the isolation is functional and a generic part may be acceptable; if CGND can sit at a
different potential (a long bus run to the charger controller, or any fault case that lifts it) then
it must be Y-rated. The design isolates CAN deliberately and Y-rates everything else that crosses a
barrier, so the consistent answer is a Y capacitor — `Y1-4n7-440` is already in the BOM at the same
4.7 nF value, so it costs a line change, not a new part.

No LCSC number assigned to `MLCC-small|4.7nF` for this reason; it stays CLASS until the barrier's
role is confirmed.


## R9 — RESOLVED 2026-09-06: per-SKU fuse class wired through, and the reason it never took effect

The analysis below was already correct and already written down. What was missing was that nothing
acted on it: `skuOverrides` set only a PRICE for `F1`/`F2`/`F3` (90/210/480), never an `mpn`, so
all three SKUs still resolved to the base `FUSE-gG-690V` and inherited the 32 A holder. `KPRE1`/
`KPRE2` two lines away already did it correctly with `HF167F-80A-M`/`-120A-M`/`-250A-M`.

Now each SKU carries its own class -- `FUSE-gG-690V-63A` / `-125A` / `-250A` -- and the holder
follows: RT28-63 (30 kW), NH00 (60 kW), NH01 (120 kW). The 120 kW answer is the one the note
predicted: 250 A leaves the RT28 range entirely and becomes an NH blade class, a mounting change.

**The deeper bug this exposed.** The schematic resolved footprints through `c.mpn` -- the page
JSON's BASE class -- while resolving part numbers through `partOf()`, which applies `skuOverrides`.
Two different paths for the same component, so every per-SKU FOOTPRINT override in the project was
dead code. Fixing `fpFor(c.designator, c.mpn)` to `fpFor(c.designator, mpn)` changed more than the
fuses on 120 kW:

| designator | was | now |
|---|---|---|
| F1-F3 | `FUSE_holder_RT28-32` | `FUSE_holder_NH01` |
| KPRE1/KPRE2 | `RELAY_HF167F_PCB` | `RELAY_contactor_250A_stud` |
| 6 resistors | `RES-TH_L60.0-W9.0-P66.00` | `RES-TH_L75.0-W12.0-P82.00` |

A 250 A contactor was carrying a PCB relay land, and six higher-wattage resistors were carrying the
smaller SKU's body. Those mappings existed and were correct; nothing ever reached them.

**A mistake of mine while fixing it, worth recording.** I added RT28-125 / NH1-bolted mappings for
the 125 A and 250 A classes without checking that correct `NH00`/`NH01` mappings already existed one
line below. In a flat object the later key wins, so mine were both redundant and duplicate keys --
the same defect gated as `SYNTAX-DUPKEY` for lcsc-map a commit earlier. Removed, and gate
`SYNTAX-FPDUP` now covers footprint-map. Its key scan is deliberately not line-anchored: a
line-anchored scan found only one of the two duplicates I had just introduced.

### original analysis
## R9 — the AC input fuse holder is under-rated on every SKU (found 2026-09-06, OPEN)

Same datasheet pass as R8. `F1`/`F2`/`F3` carry footprint `FUSE_holder_RT28-32`. The CHINT
**RT28-32** is a DIN-rail fuse holder for **10 x 38 mm** links rated **2-32 A** (AC 690 V /
DC 500 V). The design's own fuse ratings are:

| SKU | line current | fuse (lcsc-map) | RT28-32 limit | verdict |
|---|---|---|---|---|
| 30 kW | 55 A | **63 A** gG 690 VAC | 32 A | **2x over** |
| 60 kW | 110 A | **125 A** gG 690 VAC | 32 A | **4x over** |
| 120 kW | 220 A | **250 A** gG 690 VAC | 32 A | **8x over** |

The 690 VAC voltage class is right; only the current rating and body size are wrong. A 63 A gG
link is 14 x 51 mm and physically will not fit a 10 x 38 holder.

**Correct holders within the same family**, by fuse size:

| link | holder | max |
|---|---|---|
| 10 x 38 | RT28-32 | 32 A |
| 14 x 51 | **RT28-63** | 63 A |
| 22 x 58 | **RT28-125** | 125 A |

So 30 kW wants RT28-63 and 60 kW wants RT28-125. **120 kW at 250 A exceeds the RT28 range
entirely** and needs a different class — NH-type blade (NH1, to 250 A) or a bolted-tag fuse.
That is a size and mounting change, not a substitution.

**It is also not a PCB part.** RT28 is DIN-rail mounted, so there is no board land for it at all;
the AC input fusing is a panel component and the board should present terminals that wire to it —
the same situation as the HFE82V contactor in R8. `FUSE_holder_RT28-32` as a PCB footprint name
is misleading on both counts.

No footprint drawn, for the same reason as R8: a land for a part that cannot be used would hide
the error rather than surface it.


## R8 — RESOLVED 2026-09-06: part number corrected, drawing unchanged

`KPREA`/`KPREB` now carry **`HFE82V-20-M-CLASS`** instead of `HFE9-10A-1kV-M`.

The analysis below stands and is the reason: the drawing wires `COM2`/`NO2` for the
`RELAY_FB_KPRE*` readback and drives the coil from a ULN2803 as a monostable, and the Hongfa HFE9
is a miniature LATCHING relay, 250 VAC max, contact form 1A/1B with no auxiliary. It fails all
three requirements, so **the drawing was right and the part number was wrong** — this is a BOM
correction, not a design change, and no schematic edit was needed.

The replacement is the HFE82V family already used for `KSER`/`KPARA`/`KPARB`/`KOUT`, at a 20 A
rating suited to pre-insertion rather than the 200-400 A bank rating. Ordering code follows the
bank part: `HFE82V-20W/1000-24-HA-C5-1`.

Still to CONFIRM before ordering (kept at REVIEW): that a 20 A rating exists in the HFE82V
catalogue with the `HA` auxiliary option, and whether it is a PCB or stud/harness part — the bank
parts are M6 screw terminals with a flying coil/aux harness. Price Rs 300/1k is scaled from the
Rs 460 bank part, not a quote.

Side effect: `RELAY_HFE9_PCB` is no longer referenced by any sheet, so that undrawn footprint is
moot rather than blocked.

### original analysis
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
