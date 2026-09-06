# LCSC assignment status

Generated 2026-09-06. Every component on every sheet carries an `LCSC` field. This documents what
the four possible values mean and, for `CLASS`, **why** — so the remainder reads as adjudicated
rather than unfinished.

| status | components | share |
|---|---|---|
| real C-number | 1672 | 59% |
| `CLASS` | 1113 | 39% |
| `CUSTOM` | 30 | 1% |
| `REVIEW` | 4 | 0% |

Sheet and BOM are cross-checked: 100 distinct MPNs on the 30 kW sheets, **0 mismatches**, and no
MPN carries two different numbers.

## Why CLASS is not "unfinished"

For most of these the class **is** the specification, and substituting a generic catalogue part
would silently drop a rating the design depends on. Two attempts proved the point and were both
reverted:

- gate resistor `R1206-RG-0.5W` -> `RC1206FR-074R7L` (C137258) is **250 mW**, half the specified
  rating, on the resistor that takes the gate-drive pulse.
- relay `HF167F-80A-M` -> `RELAY-TH_HF167F-24-HF` (C2757422): EasyEDA's DRC rejected it,
  `Pin has no corresponding pad: 5, 6, 8` — the catalogue part is a plain SPST-NO and E30 needs
  the mirror-contact variant.

### Class IS the spec — 866 instances
Safety-certified (`X1-2u2-530`, `Y1-4n7-440` — must carry the certification, not just the value) ·
voltage-class film (`PP-46n-1200`, `PP-1u-1100`, `PP-1u-600`, `PP-4u7-1200`, `PP-10n-1200`,
`FILM-100n-250`, `C1812-100p-1k`) · anti-surge HV (`HV73-475k-1%`, `R2512-47k-HV-AS`,
`R2512-HV`) · pulse/power resistors (`R1206-RG-0.5W`, `CER-2k2-10W-AX`, `WW-470R-10W`,
`CER-25W-AX`, `CER-50W-AX`, `SQP-10R-25W`, `R2512-10R-2W`, `R2512-2R0-1W-1%`,
`R1206-R31-1%-0.5W`) · 0.1% precision dividers (`R0805-prec-0.1%` — a 1% part would drop the
tolerance the divider exists for) · DC-link electrolytics (`ELH-470u450` — selected by ripple
current and endurance, not by capacitance).

### No catalogue part exists — 90 instances
Custom magnetics (`IND-PFC-165u`, `IND-TRIM-BIN4`, `DM-22u-SKU`) and mechanical terminals
(`STUD-M8`, `TAB-M4`).

### Genuinely just not looked up yet — 157 instances
The long tail of ordinary values in `R-small` / `MLCC-small` / `R1206-33R-1%` that no lookup has
been done for (each is 3-15 instances). Resolve them the same way as the ones already done: read
the part back from EasyEDA's LCSC catalogue with `component_search` and add a `LCSC_BY_VALUE`
entry keyed on `family|value`. **This is the only part of the LCSC column that is genuinely
outstanding work rather than a recorded decision.**

## How value-resolution works

A per-MPN map cannot express these: `R-small` covers 10k, 1k, 100R, 100k and more, and
`MLCC-small` covers 100nF, 10nF, 1nF and 220pF. So `LCSC_BY_VALUE` in `calculations/cost/lcsc-map.mjs`
is keyed on `family|value` and consulted by BOTH the schematic generator and `bom-gen`, using the
same engineering-notation formatter on each side so the keys match. `bom-gen` splits a generic
family into per-value lines wherever a catalogue part exists — `R-small` is genuinely several
different orderable parts.

Every entry was read back from EasyEDA's own LCSC catalogue via `component_search`. None is from
memory.
