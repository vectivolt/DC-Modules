# Drawing set — the release schematics

**The deliverable is `kicad5/DC-Modules-<sku>-SHIP.zip`.** Three zips, one per SKU, each holding
the two board sheets plus the symbol library, description file and project file. They import into
EasyEDA Pro (and open in KiCad 5.1) as-is.

    node calculations/kicad5-gen.mjs           # all three SKUs, and re-packages the zips
    node calculations/kicad5-gen.mjs 30kw      # one SKU

Generation writes `kicad5/dc-modules-<sku>/` **and re-zips the SHIP archive in the same run.**
That is deliberate: the zips previously drifted a full day behind the sheets while every check on
the source still passed, because nothing checked the artefact anyone actually imports. Check the
deliverable, not only what it is built from.

`kicad5/archive/` holds 23 superseded zips. **Their names lie** — `-final`, `-r5`…`-r8`, `-v2`…`-v4`
are all older than the SHIP set. Import nothing from there.

## The six sheets

| Sheet | Symbols | Sections | Sheet size (mil) |
|---|---|---|---|
| 30 kW AC-DC | 304 | 31 | 42600 × 29050 |
| 30 kW DC-DC | 311 | 27 | 45600 × 26800 |
| 60 kW AC-DC | 403 | 36 | 44600 × 37050 |
| 60 kW DC-DC | 454 | 33 | 45600 × 35300 |
| 120 kW AC-DC | 603 | 45 | 54600 × 42300 |
| 120 kW DC-DC | 744 | 45 | 55600 × 47550 |

2819 symbols and 8049 connected pins over the set.

## Every sheet says what it is

A sheet printed alone still identifies itself. The title block carries the SKU, which board of the
pair, sheet *n* of 2, what the module is, and what that board contains:

    Title    DC-Modules 30 kW — AC-DC board (Vienna PFC)
    Rev      D.3
    Comp     DC-Modules 30 kW - board AC-DC (lower), sheet 1 of 2
    Comment1 Module 30 kW = two-board sandwich: sheet 1 AC-DC (lower) + sheet 2 DC-DC (upper),
             bolted DCP/DCN/PE studs + 16-way control harness
    Comment2 Content: 1x Vienna PFC cell + 1x 3-ph LLC cell
    Comment3 31 functional sections - 304 components - cross-section links are global net labels
    Comment4 Every component carries MPN + LCSC fields

Each sheet also carries a **SHEET INDEX** panel listing its functional groups and how many
sections each holds, and a **NET NAMING** panel giving the naming convention. Both sit in
otherwise-empty space, stacked in one void on the right.

Sections are titled `GROUP / SECTION` (`AC-SENSING / SENSE-VAC1`, `LLC-TANKS / TANK-2`), so the
group is readable from the title alone. The six groups per board:

| AC-DC board | DC-DC board |
|---|---|
| INPUT-EMI · VIENNA-PFC · DC-LINK · AC-SENSING · CONTROL · AUX-POWER | LLC-LEGS · LLC-TANKS · BANKS-SP · OUTPUT-SENSING · CONTROL · COMMS-HMI |

Section counts scale with the SKU: the 30 kW AC-DC sheet has 3 VIENNA-PFC sections, the 60 kW has
6, the 120 kW has 12 — one per cell, so the ×1 / ×2 / ×4 scaling is visible on the drawing.

## How the layout is built and held

Sections skyline-pack on a quantised column grid in signal-flow order, with frame tops and heights
snapped to a 250 mil Y grid so vertical gutters stay uniform. Inside a section, symbols align to
their **column's** widest label rather than their own, which is what stops identical parts
zig-zagging. Pins are ordered by name family, so a part's related pins are adjacent.

**Wires are pin stubs only.** Every cross-section link is a global net label — no wire leaves its
section frame anywhere in the set, and the longest wire on any sheet is 200 mil. Nets are named
for what they join (`UIVOA_VINP`, `RBALTA_M`, `RV1D_01`), not auto-numbered; 1144 `N_<side>_<n>`
names were eliminated.

## The checks, and what they currently measure

Each tool measures a property of the **emitted `.sch`**, so it audits the deliverable rather than
the intent. All six sheets currently pass every one:

| Tool | Checks | Current |
|---|---|---|
| `kicad5-verify.mjs` | every pin against an independently-built netlist | **8049 / 8049 correct, 0 wrong, 0 unconnected** |
| `kicad5-visual.mjs` | ink collisions: labels vs symbols vs field text | **0 collisions** |
| `alignment-audit.mjs` | FRAME-X/Y, SYM-X, PITCH, STUB near-misses | **no near-miss anywhere; 1 stub length** |
| `wiring-audit.mjs` | LONG, ESCAPE, CROSS, FLOW | **longest 200 mil, 0 escapes, 0 crossings, 1999/1999 flow** |
| `frame-padding.mjs` | inner padding of every section frame | **no overflow; min clearance L/R 221, T 65, B 205** |
| `void-audit.mjs` | worst **enclosed** hole per sheet (whitespace with drawing on both sides) | **worst 8.2 %** (limit 12 %) |
| `cell-uniformity.mjs` | every replicated cell identical to its twins | **21 legs, 21 tanks, 7+7+7 phases** |
| `review-checks.mjs` | the release gates (incl. LCSC, class and printed-value rules) | **all pass** |

Also uniform across the set: one symbol orientation, four text sizes, two frame widths per sheet,
400/500 mil gaps, and 229/229 titled boxes at a single (60, 160) inset. The two notes panels on
each sheet share an exact left and right edge with a uniform 750 mil gap, so they read as one
block rather than two strays.

### What working-zoom inspection changed

Sheet-zoom review cannot read a value field — a symbol is a few pixels wide. Rendering tiles with
`kicad5-detail.mjs` and reading them found three things no metric had:

- **67 symbols printed an internal `-class` suffix.** `AMC1311-class` under an IC reads as a
  placeholder nobody finished, and contradicts the specific C-number in the same symbol.
- **246 resistors printed a unitless number** — `4.7`, `220`, `33` — on sheets whose other
  resistors read `10k` and `475k`. 4.7 Ω and 4.7 kΩ were one glance apart. Ohms now take the same
  trailing-suffix style: `4.7R`, `220R`, `2R`.
- **19 ORDERABLE parts named a class instead of the part** in their MPN field (see
  `docs/lcsc-status.md`).
- **11 designators hid their per-SKU rating.** F1/F2/F3 printed the same `FUSE-gG-690V` on the
  63 A, 125 A and 250 A boards; worse, the 120 kW sheet printed `HF167F-80A-M` on a **250 A** relay
  and `CER-25W-AX` on a **50 W** resistor — a specific wrong rating, and exactly the per-SKU
  difference a reader needs to tell the three boards apart. A per-SKU override now changes what the
  sheet says, gated as `SKU-VALUE-MATCHES-PART`.

Both printed-text rules are gated as `SHEET-VALUE-TEXT`. The formatter is display-only and
deliberately separate from `c.value`, which is the key into the value-addressed LCSC map.

One inconsistency is knowingly left: `DAUX15` prints `US2G` while `DAUX24` prints `UF-400V-3A`.
The value field carries a class descriptor wherever the design specifies by class, and that is
usually the more informative thing to print — `PP-46n-1200` says more than a part code. Making the
two diodes match would mean editing the cell source and rebuilding the boards for a cosmetic gain;
their MPN and BOM lines already agree (`US2G` / `US3M`).

### The whitespace, and what fixed it

A full visual pass finds no misalignment, collision or stray. What it did find was **whitespace
where a short column ends early** — measured by `void-audit.mjs`, which scores the worst *enclosed*
hole rather than the largest empty rectangle. That distinction is the point: a sheet's single
biggest empty area is usually at the paper edge, where it reads as margin. The hole that looks
wrong is the narrower one with drawing on **both** sides.

The cause was the notes panels. They were right-aligned inside their void so a wide bottom-right
slot would not strand them mid-sheet — but on a void much wider than the panel that opens a gap
between the last circuit column and the notes. Abutting them to the *content* side instead pushes
the slack outward to the paper edge:

| | 30 kW AC | 30 kW DC | 60 kW AC | 60 kW DC | 120 kW AC | 120 kW DC |
|---|---|---|---|---|---|---|
| before | 4.6 % | 5.4 % | **8.2 %** | 5.6 % | 3.2 % | 1.3 % |
| after | 4.6 % | 4.0 % | **4.6 %** | 4.9 % | 3.2 % | 1.2 % |

Worst across the set **8.2 % → 4.9 %**; every sheet improved or held and none regressed, which was
the condition for keeping it. Confirmed by eye as well as by the metric: the notes now continue the
last column instead of floating alone with a hole beside them. The gate stays at 12 % so a future
packing change that opens a real hole still fails.

## Working on the layout

Two rules, both learned the expensive way:

**Placement edits are safe; geometry and scoring edits cascade.** Changing sheet height, the score
weights or the void maths reshuffles the whole packing and can wreck two sheets to improve one. If
you must touch scoring, sweep the weight and read `largest void` per sheet — that number has
tracked the eye better than fill percentage or raggedness every time.

**Two changes were tested and reverted on the evidence**, and are recorded so they are not retried
blind: reweighting raggedness (the metric improved 20350 → 8500, the sheet looked visibly worse,
voids went 8 % → 15 %), and a fixed bottom index strip (perfectly consistent, but it cost two
sheets their void gate).

## Related

- `docs/lcsc-status.md` — what the LCSC field on every symbol means
- `docs/easyeda-transcription.md` — the older pin-by-pin EasyEDA path and why it was abandoned
- `calculations/schematic-compose.mjs` — the earlier SVG composer, superseded by this set
