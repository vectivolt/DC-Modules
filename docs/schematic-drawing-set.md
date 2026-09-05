# Drawing set — composed schematic sheets (release artefact)

One sheet per board, six boards, generated from the built netlists. This is the
presentation-grade drawing set: `calculations/schematic-compose.mjs`.

    node calculations/schematic-compose.mjs            # all six boards
    node calculations/schematic-compose.mjs 30kw/acdc  # one board

Output: `boards/<sku>/out/<side>-sheet.svg`. The command exits non-zero if any check fails, so
it can gate a release.

| Sheet | Symbols | Sections | Clusters | Size |
|---|---|---|---|---|
| 30 kW AC-DC | 300 | 16 | 77 | 2776 × 3015 |
| 30 kW DC-DC | 308 | 17 | 99 | 2735 × 2780 |
| 60 kW AC-DC | 399 | 16 | 102 | 3661 × 3505 |
| 60 kW DC-DC | 451 | 17 | 154 | 3406 × 3624 |
| 120 kW AC-DC | 599 | 16 | 158 | 4899 × 5526 |
| 120 kW DC-DC | 741 | 17 | 262 | 4310 × 4937 |

## How the sheet is composed

`schematic-export.mjs` (the older exporter, still present) draws a frame around each functional
section but leaves it wherever the compiler placed it. That reads as ragged: mismatched
gutters, unaligned tops, large dead zones, and one sparse section dominating the sheet.

The composer re-lays the drawing instead. **The movable unit is a wire-connected cluster, not a
named section.** Components joined by a drawn wire form one rigid body; everything else is
linked by net label and can move freely.

That distinction is load-bearing, and it is not what E34 implies. Measuring the rendered output
found **126 wires on the AC-DC board and 142 on the DC-DC board crossing the named section
boundaries** — so translating whole sections, which was the obvious approach, silently tore
them. Clusters cannot be torn by construction. Packing at cluster granularity also removes the
whitespace *inside* a section, which is what made the old sheet look accidental.

Layout: clusters shelf-pack inside their section frame; frames skyline-pack on the sheet in
signal-flow order with uniform gutters. Sheet-level shelf rows left a tall gap under every short
section (46 % fill); the skyline packer lifts that to ~60 %.

## Checks the composer enforces (build fails on any of them)

- no two section frames overlap;
- no two clusters overlap inside a frame;
- every element is placed — no strays outside a section;
- every symbol is claimed by a named section;
- no title-block text crosses the divider or the box edge.

## Title block

Each sheet identifies itself when printed alone: SKU, which board of the pair (AC-DC lower /
DC-DC upper), sheet *n* of 2, and how that board scales across the set (30 kW = 1× cells,
60 kW = 2×, 120 kW = 4×), plus rev, date, and where the LCSC numbers live. The block sizes
itself to its text — a fixed width clipped the longer SKU titles.

## LCSC assignment

`calculations/cost/lcsc-map.mjs` covers **all 97 parts-db entries**, and the BOM CSVs carry
`lcsc` + `lcsc_status` columns. Statuses are kept apart deliberately, because a purchasable part
number must never be guessed:

| Status | Count | Meaning |
|---|---|---|
| ORDERABLE | 39 | specific LCSC part meeting the design rating |
| SECOND-SOURCE | 2 | equivalent found, different die/rating — requalify |
| REVIEW | 10 | **library part does not yet meet the stated rating** — resolve before release |
| CLASS | 39 | design specifies a rating, not a part; purchasing selects |
| CUSTOM | 3 | custom magnetics, no catalogue equivalent |

The ten REVIEW lines are the actionable ones (e.g. the MOV is a 350 VAC part against a 550 VAC
requirement; the isolated 5 V module is basic-rated where rev D calls for reinforced). They are
flagged rather than silently accepted.

## Known cosmetic item

Three net labels render as `C1R0_pin2` / `C2R0_pin2` / `C3R0_pin2` — the resonant-cap junction
in each LLC tank has no explicit net name, so tscircuit falls back to naming it after a pin. The
fix belongs in `cells.tsx` (name the node), which needs a board rebuild; it is cosmetic only and
the connectivity is correct.
