IMPORT THIS
  DC-Modules-30kw-SHIP.zip
  DC-Modules-60kw-SHIP.zip
  DC-Modules-120kw-SHIP.zip

Each is a KiCad 5.1 project (2 sheet .sch + .lib + .dcm + .pro + root .sch),
the format EasyEDA Pro's "Import > KiCad" accepts.
They are rebuilt automatically by calculations/kicad5-gen.mjs, so they always
match the sheets in dc-modules-<sku>/.

archive/ holds superseded zips from earlier iterations (final, r5..r8, v2..v4,
for-EasyEDA). Their names are misleading -- "final" is NOT final. Kept only so
nothing is lost; safe to delete.

2026-09-08 (E35/E36): the 120 kW single-board sheet set is RETIRED — 120 kW is a cabinet
(4x 30 kW / 2x 60 kW modules; cardMap() refuses 4 lanes since the card split). The last
pre-split set is archive/DC-Modules-120kw-SHIP-PRE-CARD-SPLIT-FINAL.zip — reference only,
it predates the E35 audit fixes (27R burden, D1/D2/D3/D6 magnetics revs, 80 A fuse).
