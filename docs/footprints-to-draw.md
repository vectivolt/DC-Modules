# Footprints

Refreshed 2026-09-06 by `calculations/footprint-gen.mjs`.

The `Footprint` field of every component names a land pattern. Where that pattern does not exist
in the EasyEDA library, EasyEDA's schematic DRC raises `lacks property Footprint`. Those are a PCB
library gap, **not** a connectivity or schematic defect — the sheets themselves report 0 errors
and 0 warnings.

## Drawn — 18 footprints, 521 of 696 instances

Emitted as KiCad `.kicad_mod` (a format EasyEDA Pro imports), packaged as
`kicad5/DC-Modules-footprints.zip`.

**Why this is not invented data.** Each name already carries the part's own dimensions from its
datasheet, and the land follows from them:

| family | what the name fixes | the one family constant |
|---|---|---|
| `CAP-TH_L..-W..-P..`, `RES-TH_L..-W..-P..` | body L x W, lead pitch | lead dia: 1.0 mm axial power resistors, 0.8 mm film caps above 10 mm pitch, 0.6 mm below |
| `CONN-TH_nP-P2.00_PH` | way count, pitch | JST PH contact -> 0.8 mm hole |
| `CONN-TH_nP-P3.00_MicroFit` | way count, pitch, dual row | Micro-Fit 3.0 contact -> 1.1 mm hole |
| `HDR-TH_nP-P2.54-V-M` | way count, pitch | 0.64 mm square post -> 1.0 mm hole |
| `DISC-..mm_RM..`, `GDT-..mm_RM..` | disc diameter, lead pitch | 0.8 mm leads |
| `TERM_Stud_M8`, `TERM_Tab_M4` | thread size | hole = thread + 0.4, ring pad per the stud |

Holes are lead + 0.3 mm (IPC-2222 class 2), pads hole + 2 x 0.45 mm annular, silkscreen the body,
courtyard 0.5 mm clear, pin 1 square. Every family constant above is stated in the generator and
is the single value to correct if a datasheet disagrees.

`KEY-SMD_4P-L6.0-W6.0` was deliberately NOT generated: "6.0 x 6.0" gives the body but a tactile
switch's four-pad layout varies by series, so the name does not determine the land.

## Remaining A — catalogue parts: 7 footprints, 49 instances

These exist in the LCSC catalogue; resolve each with `component_search` the way `QA01C` ->
`PWRM-TH_QA01C` (C2757491) was resolved. **A name match is not sufficient** — check pin/pad
correspondence per part. Pointing the HF167F relays at `RELAY-TH_HF167F-24-HF` (C2757422) was
rejected by DRC with `Pin has no corresponding pad: 5, 6, 8`, because the catalogue part is a
plain 4-pad SPST-NO relay while E30 needs the mirror-contact variant that carries `RELAY_FB_*`.

`RELAY_HFE82V_PCB` (16) · `FUSE_holder_RT28-32` (9) · `RELAY_HFE9_PCB` (6) ·
`RELAY_HF167F_PCB` (6) · `KEY-SMD_4P-L6.0-W6.0` (6) · `IND-SMD_L4.5-W3.2_CMC` (3) ·
`LED-SEG-TH_2DIG-0.56` (3)

The three relays are the awkward ones: E30 needs the **mirror-contact** variants, and the plain
catalogue parts of the same family have a different pad count (see the rejected HF167F attempt
above).

## Remaining B — genuinely custom: 9 footprints, 126 instances

No standard land exists. Pad geometry comes from the winder's or maker's drawing, and guessing it
would be fabricating manufacturing data. **This is the only group blocked on someone else.**

`CT_window_100A_1-2500` (21) · `CT_window_res_1-100` (21) · `L_Toroid_3xT79_26u_custom` (21) ·
`L_Toroid_trim_bin_custom` (21) · `XFMR_3xPQ50-50_custom` (21) · `L_Toroid_sendust_per-SKU` (9) ·
`L_CMC_3ph_nanocryst_per-SKU` (6) · `SHUNT_4-terminal_manganin` (3) · `XFMR_ETD34_custom` (3)
