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
| `review-checks.mjs` | the release gates (incl. LCSC and class rules) | **all pass** |

Also uniform across the set: one symbol orientation, four text sizes, two frame widths per sheet,
400/500 mil gaps, and 229/229 titled boxes at a single (60, 160) inset.

**The whole output is a pure function of the source.** Regenerating reproduces the sheets *and the
zips* byte for byte, so `git status` after a rebuild is a real staleness gate — if nothing is
modified, the committed deliverable is current. Two things had to be pinned to get there, and both
were previously blind spots rather than cosmetic:

- the sheet `Date` came from `new Date()`, so every regeneration rewrote all six sheets and real
  drift could not be told from date churn. It is now pinned to `DATE` alongside `REV`; bump it with
  the revision.
- a zip stores each member's mtime, so an identical-content rebuild still produced different bytes.
  Member times are pinned and platform extra-fields dropped (`zip -qX`).

Running `kicad5-gen.mjs` with no argument also used to build **only 30 kW** while printing a
confident success line, leaving the other two SKUs stale. No argument now means all three.

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
