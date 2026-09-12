# LCSC assignment status

<p align="left"><img src="https://img.shields.io/badge/status-GENERATED-5f8fc0?style=flat-square" alt="GENERATED"/> <img src="https://img.shields.io/badge/rev-E52-f2b705?style=flat-square" alt="rev"/> <img src="https://img.shields.io/badge/updated-2026--09--12-555?style=flat-square" alt="updated"/></p>

> **Purpose** — LCSC coverage per BOM line (ORDERABLE/CLASS/REVIEW/CUSTOM). Regenerated — do not hand-edit.


Every component on every sheet carries an `LCSC` field, and every BOM line carries `lcsc` +
`lcsc_status`. This documents what the values mean and — for `CLASS` — **why**, so the remainder
reads as adjudicated rather than unfinished.

Regenerate the counts below from the shipped sheets, never by hand:

    node calculations/kicad5-verify.mjs        # sheets
    node calculations/cost/bom-gen.mjs         # BOM lines

## On the sheets — 2819 component instances

| status | instances | share | meaning |
|---|---|---|---|
| real C-number | 2256 | 80 % | orderable LCSC part |
| `CLASS` | 507 | 18 % | buy to the class spec; the class **is** the specification |
| `CUSTOM` | 30 | 1 % | made to drawing — no catalogue equivalent exists |
| `REVIEW` | 26 | 1 % | catalogue part does not yet meet the stated rating |

Sheet and BOM are cross-checked: no MPN carries two different numbers.

**The ordinary-value tail is closed.** An earlier revision of this doc listed 157 instances of
`R-small` / `MLCC-small` / `R1206-33R-1%` as "genuinely just not looked up yet". Those are done —
14 further parts were read back from EasyEDA's LCSC catalogue via `component_search` and keyed
into `LCSC_BY_VALUE`, taking real-number coverage from 59 % to 80 %. Every MPN still marked
`CLASS` below is a deliberate class specification, not a lookup nobody got round to.

## Why CLASS is not "unfinished" — 507 instances, 22 MPNs

Substituting a generic catalogue part would silently drop a rating the design depends on. Two
attempts proved the point and were both reverted:

- gate resistor `R1206-RG-0.5W` → `RC1206FR-074R7L` (C137258) is **250 mW**, half the specified
  rating, on the resistor that takes the gate-drive pulse.
- relay `HF167F-80A-M` → `RELAY-TH_HF167F-24-HF` (C2757422): EasyEDA's DRC rejected it,
  `Pin has no corresponding pad: 5, 6, 8` — the catalogue part is a plain SPST-NO and E30 needs
  the mirror-contact variant.

| Category | Parts (instances) |
|---|---|
| DC-link electrolytics — chosen by ripple current and endurance, not capacitance | `ELH-470u450` (120) |
| Voltage-class film | `PP-46n-1200` (84) · `PP-1u-600` (42) · `PP-1u-1100` (27) · `FILM-100n-250` (21) · `PP-4u7-1200` (6) · `PP-10n-1200` (3) |
| Custom magnetics by drawing | `IND-PFC-*` per SKU (D1) · `IND-TRIM-BIN4/5/6` (D2) · `DM-CHOKE-30/40/50` (D6 rev C) |
| Pulse / power resistors | `CER-2k2-10W-AX` · `WW-470R-10W` · `CER-25W/50W-33R-AX` (precharge) · `CER-25W/50W-160R-AX` (discharge) · `SQP-10R-25W` — value-carrying codes since R5-G |
| Anti-surge HV | `R2512-HV` (18) |
| Safety-certified — must carry the certification, not just the value | `X1-2u2-530` (18) |
| Mechanical terminals | `STUD-M8` (36) · `TAB-M4` (3) |
| Per-SKU fuse class | `FUSE-gG-690V-80A` (product, 22×58 — audit F6) / `-125A` / `-250A` (reference boards) (3 each) |

## CUSTOM — 30 instances, 3 MPNs

`XFMR-LLC-10K` (21) · `CMC-3PH-2mH-SKU` (6) · `XFMR-AUX-FLY-C` (3). Made to the drawings in
`docs/magnetics.md`; there is no catalogue equivalent to look up.

## REVIEW — the actionable list

On the sheets, `REVIEW` is the four relay classes with no acceptable catalogue part yet:
`HFE82V-M-CLASS` (16) · `HFE82V-20-M-CLASS` (6) · `HF167F-250A-M` (2) · `HF167F-120A-M` (2).

At BOM level the status is wider — 17 lines on 30/60 kW, 21 on 120 kW — because it also covers
parts that **do** have a C-number but still need requalification before release:

| Part | LCSC | Why it is flagged |
|---|---|---|
| `S20K550` | C317868 | MOV rating vs the Δ line-line + GDT-to-PE surge path |
| `GDT-3k5-20kA` | C9900081756 | 3.5 kV L-PE surge path (HR-7) |
| `CT-100A-1:2500` | C94571 | 63.95 A rms/cell at 285 V low line — class check |
| `CT-RES-1:100` | C94571 | resonant CT, same toroid family |
| `ISO5V-RFC-6K` | C20613048 | reinforced rating required by E25 |
| `QA01C-18` | C2757491 | iso gate-bias module, +18/−3 (R4-6; E23 rev B module decision) |
| `SHUNT-50MV-100A/133A/167A` | C508584 | manganin shunt, rated current in the order code per SKU (R5-G) |
| `PS122WF4702T4E` | C2793932 | **zero stock / pre-sale** — sourcing risk, not a rating problem |
| `TACT-6x6` | C318884 | body size unresolved — candidates rejected at 3.9×3.0 and 5.2×5.2 mm |
| `LED-2DIG-0.56CC` | C9900021773 | segment pin map not validated against a chosen part |
| the four relay classes | — | no catalogue part meets E30's mirror-contact requirement |

`SECOND-SOURCE` (2 lines) are the SiC MOSFETs `SG2M023120LJ` (C5713523) and `B3M010C075Z`
(C5713521) — equivalent found, different die, requalify before switching.

## ORDERABLE must name the part, not the class

`ORDERABLE` means a specific part **was** chosen. Nineteen entries still showed the *class* as
their MPN while their C-number resolved to a different, real part named only in a source note — so
the sheet read `SICJBS-1200-40` / `C7435099` where the thing actually purchased is a
**GC4D20120D**, and the aux 15 V and 24 V rectifiers looked like unrelated parts (`US2G` vs
`UF-400V-3A`) when they are a matched pair, `US2G` and `US3M`.

Found by reading a rendered sheet at working zoom; no existing check compared the MPN field against
what its own LCSC number resolves to. The convention was already established — 51 entries carried
`mpn:` — these had simply been missed. All nineteen now name the real part on the sheet and in the
BOM: `US3M` · `STTH112U` · `GC4D10120H` · `C4D20120D` · `GC4D20120D` · `C2M1000170D` ·
`IMW120R350M1H` · `B2B-PH-K-S` · `B4B-PH-K-S` · `PZ254V-11-05P` · `ACT45B-510-2P-TL003` ·
`GZ2012D601TF` · `TPS54202DDCR` · `TPS3430WDRCR` · `TLV9061IDBVR` · `AMC1311DWVR` ·
`AMC1350QDWVRQ1` · `TLP152`.

No footprint changed — all 2819 verified identical before and after, because `footprintForRef`
falls back to the class when the real MPN has no land of its own. Gated as `LCSC-CLASS-MPN` in
`review-checks.mjs`, negative-tested both ways.

**Two entries were mis-statused and are now REVIEW**, because each carried `ORDERABLE` over a note
describing an unresolved problem:

- `TACT-6x6` (C318884) — two candidate series were checked and **both rejected on body size**; the
  design specifies 6.0 × 6.0 mm. Calling that orderable hid an open selection.
- `LED-2DIG-0.56CC` (C9900021773) — the segment pin map has never been validated against a chosen
  part; only 3 of 10 pins agree with the industry-standard 5621AS pinout.

## How value-resolution works

A per-MPN map cannot express these: `R-small` covers 10k, 1k, 100R, 100k and more, and
`MLCC-small` covers 100nF, 10nF, 1nF and 220pF. So `LCSC_BY_VALUE` in
`calculations/cost/lcsc-map.mjs` is keyed on `family|value` and consulted by **both** the schematic
generator and `bom-gen`, using the same engineering-notation formatter on each side so the keys
match. `bom-gen` splits a generic family into per-value lines wherever a catalogue part exists —
`R-small` is genuinely several different orderable parts.

Two failure modes in that map are now gated by `review-checks.mjs`, because both failed silently:
duplicate object keys (four `note:` entries were being overwritten) and a rule whose regex shadows
a more specific one further down the first-match-wins table.

Every entry was read back from EasyEDA's own LCSC catalogue via `component_search`. None is from
memory.
