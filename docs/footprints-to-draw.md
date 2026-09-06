# Footprints

Refreshed 2026-09-06 by `calculations/footprint-gen.mjs` + `docs` pass.

The `Footprint` field of every component names a land pattern. Where that pattern does not exist
in the EasyEDA library, EasyEDA's schematic DRC raises `lacks property Footprint`. Those are a PCB
library gap, **not** a connectivity or schematic defect — the sheets themselves report 0 errors
and 0 warnings.

## Drawn — 12 footprints, 456 instances

`calculations/footprint-gen.mjs` emits these as KiCad `.kicad_mod` (a format EasyEDA Pro imports),
packaged as `kicad5/DC-Modules-footprints.zip`.

**Why this is not invented data.** A name like `CAP-TH_L26.5-W11.0-P22.50` already carries the
part's body length, body width and lead pitch from its datasheet. The land follows: two pads on
the lead pitch, hole = lead + 0.3 mm (IPC-2222 class 2), pad = hole + 2 x 0.45 mm annular ring,
silkscreen the body outline, courtyard 0.5 mm clear. The one number *not* in the name is the lead
diameter, so it is stated per family in the generator and is the single value to correct if a
datasheet disagrees: 1.0 mm for axial power resistors, 0.8 mm for film caps above 10 mm pitch,
0.6 mm below.

| footprint | instances | land |
|---|---|---|
| `CAP-TH_L30.0-W30.0-P10.00` | 120 | pads +/-5.0, hole 1.1, body 30 x 30 |
| `CAP-TH_L31.5-W13.0-P27.50` | 111 | pads +/-13.75, hole 1.1, body 31.5 x 13 |
| `CAP-TH_L26.5-W11.0-P22.50` | 60 | pads +/-11.25, hole 1.1, body 26.5 x 11 |
| `RES-TH_L48.0-W8.0-P54.00` | 45 | pads +/-27.0, hole 1.3, body 48 x 8 (axial) |
| `TERM_Stud_M8` | 36 | 8.4 mm plated hole, 14 mm ring pad |
| `CAP-TH_L7.2-W3.5-P5.00` | 24 | pads +/-2.5, hole 0.9 |
| `RES-TH_L60.0-W9.0-P66.00` | 24 | pads +/-33.0, hole 1.3, body 60 x 9 (axial) |
| `CAP-TH_L11.0-W5.0-P10.00` | 18 | pads +/-5.0, hole 0.9 |
| `CAP-TH_L41.5-W20.0-P37.50` | 6 | pads +/-18.75, hole 1.1 |
| `CAP-TH_L8.0-W8.0-P3.50` | 6 | pads +/-1.75, hole 0.9 |
| `CAP-TH_L18.0-W5.0-P15.00` | 3 | pads +/-7.5, hole 1.1 |
| `TERM_Tab_M4` | 3 | 4.3 mm plated hole, 8 mm ring pad |

## Remaining A — catalogue parts: 13 footprints, 114 instances

These exist in the LCSC catalogue; resolve each with `component_search` the way `QA01C` ->
`PWRM-TH_QA01C` (C2757491) was resolved. **A name match is not sufficient** — check pin/pad
correspondence per part. Pointing the HF167F relays at `RELAY-TH_HF167F-24-HF` (C2757422) was
rejected by DRC with `Pin has no corresponding pad: 5, 6, 8`, because the catalogue part is a
plain 4-pad SPST-NO relay while E30 needs the mirror-contact variant that carries `RELAY_FB_*`.

`RELAY_HFE82V_PCB` (16) · `DISC-20mm_RM10` (18) · `CONN-TH_2P-P2.00_PH` (15) ·
`CONN-TH_4P-P2.00_PH` (11) · `FUSE_holder_RT28-32` (9) · `GDT-8mm_RM6` (9) ·
`RELAY_HF167F_PCB` (6) · `RELAY_HFE9_PCB` (6) · `CONN-TH_16P-P3.00_MicroFit` (6) ·
`HDR-TH_5P-P2.54-V-M` (6) · `KEY-SMD_4P-L6.0-W6.0` (6) · `IND-SMD_L4.5-W3.2_CMC` (3) ·
`LED-SEG-TH_2DIG-0.56` (3)

## Remaining B — genuinely custom: 9 footprints, 126 instances

No standard land exists. Pad geometry comes from the winder's or maker's drawing, and guessing it
would be fabricating manufacturing data. **This is the only group blocked on someone else.**

`CT_window_100A_1-2500` (21) · `CT_window_res_1-100` (21) · `L_Toroid_3xT79_26u_custom` (21) ·
`L_Toroid_trim_bin_custom` (21) · `XFMR_3xPQ50-50_custom` (21) · `L_Toroid_sendust_per-SKU` (9) ·
`L_CMC_3ph_nanocryst_per-SKU` (6) · `SHUNT_4-terminal_manganin` (3) · `XFMR_ETD34_custom` (3)
