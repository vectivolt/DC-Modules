# Footprints

Refreshed 2026-09-06 by `calculations/footprint-gen.mjs`.

The `Footprint` field of every component names a land pattern. Where that pattern does not exist
in the EasyEDA library, EasyEDA's schematic DRC raises `lacks property Footprint`. Those are a PCB
library gap, **not** a connectivity or schematic defect — the sheets themselves report 0 errors
and 0 warnings.

## Drawn — 27 footprints, 647 of 696 instances

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

## Magnetics and the shunt — 9 footprints x 3 SKUs, 126 instances (2026-09-06)

Approximate envelopes so the PCB can be laid out now, with the real parts wound/made to that size
later. **The schematics do not move**: the footprint NAME is identical on every SKU, and each SKU's
file simply carries that SKU's geometry, so `kicad5/DC-Modules-footprints-<sku>.zip` is imported
alongside that SKU's schematic bundle.

Every core dimension is quoted from the design's own drawings — `docs/magnetics.md` D1/D2/D3/D4/D6/D7
and its CT section, plus `architecture.md` for the shunt current and `parts-db` for its 50 mV class.
Nothing here is invented; what is approximate is only the winding build and the lead exits:

* winding build adds 2 x 4 mm to a toroid OD
* lead hole = sqrt(4A/pi) + 1.2 mm from the conductor CSA in the drawing
* a toroid wound >= 300 deg has its start and end leads close together, so both leads of a winding
  sit at one angular position rather than diametrically opposite
* courtyard = finished OD + 2 mm

| footprint | 30 kW | 60 kW | 120 kW | pads |
|---|---|---|---|---|
| `L_Toroid_3xT79_26u_custom` (D1 PFC choke) | 3x OD79/ID49/H17, M6 bolt | same | same | 2 + bolt |
| `L_Toroid_trim_bin_custom` (D2 trim) | OD33 | same | same | 2 |
| `L_Toroid_sendust_per-SKU` (D6 DM choke) | OD47x24x18, 14 T | OD57x26x20, 11 T | 2x OD79x40x17, 8 T | 2 |
| `L_CMC_3ph_nanocryst_per-SKU` (D7 CM choke) | OD62, 3x 8 T, 10 mm² | OD80, 3x 7 T, 25 mm² | OD102, 3x 6 T, 50 mm² | 6 |
| `XFMR_3xPQ50-50_custom` (D3 LLC xfmr) | 3x PQ50/50, 4x M4 clamp | same | same | 7 |
| `XFMR_ETD34_custom` (D4 aux) | ETD34, 5.08 mm pins | same | same | 8 |
| `CT_window_100A_1-2500` | >= 9 mm busbar window | same | same | 2 |
| `CT_window_res_1-100` | 10 mm toroid | same | same | 2 |
| `SHUNT_4-terminal_manganin` | 100 A / 0.5 mΩ, 40x15, M5 | 200 A / 0.25 mΩ, 55x20, M6 | 400 A / 0.125 mΩ, 75x25, M8 | 4 |

**Pad count was checked against every symbol's pin count** — all nine match. That check exists
because the HF167F relay attempt failed exactly there: `Pin has no corresponding pad: 5, 6, 8`.

## Remaining — catalogue parts: 7 footprints, 49 instances

These exist in the LCSC catalogue; resolve each with `component_search` the way `QA01C` ->
`PWRM-TH_QA01C` (C2757491) was resolved. **A name match is not sufficient** — check pin/pad
correspondence per part. Pointing the HF167F relays at `RELAY-TH_HF167F-24-HF` (C2757422) was
rejected by DRC with `Pin has no corresponding pad: 5, 6, 8`, because the catalogue part is a
plain 4-pad SPST-NO relay while E30 needs the mirror-contact variant that carries `RELAY_FB_*`.

`RELAY_HFE82V_PCB` (16) · `FUSE_holder_RT28-32` (9) · `RELAY_HFE9_PCB` (6) ·
`RELAY_HF167F_PCB` (6) · `KEY-SMD_4P-L6.0-W6.0` (6) · `IND-SMD_L4.5-W3.2_CMC` (3) ·
`LED-SEG-TH_2DIG-0.56` (3)

**These need part SELECTION, not a lookup.** Every one is a class-spec p/n in `parts-db`
(`TACT-6x6`, `LED-2DIG-0.56CC`, `CMC-CAN-51uH`, `FUSE-gG-690V`, `HFE82V-M-CLASS`,
`HFE9-10A-1kV-M`), so there is no MPN to search on. Attempts on 2026-09-06 and what they showed:

| tried | result | why it was not assigned |
|---|---|---|
| HF167F relay -> `RELAY-TH_HF167F-24-HF` (C2757422) | DRC rejected | catalogue part is plain 4-pad SPST-NO; E30 needs the mirror-contact variant whose pins 5/6/8 drive `RELAY_FB_*` |
| tactile -> `TS-1088-AR02016` (C720477) | not assigned | that part is 3.9 x 3.0 mm; the design specifies a 6 x 6 mm body, so the land differs |

Both would have silently substituted a different part. The three relays are the awkward ones for
the same reason: E30 needs mirror-contact variants and the plain catalogue parts of the family
have a different pad count. Confirm the p/ns, then the lands follow.

