DC-Modules release schematics (KiCad 5.1 legacy format)
=========================================================

SIX RELEASE TARGETS - one SHIP zip each
  DC-Modules-30kw-SHIP.zip          30 kW module      AC-DC + DC-DC sheets
  DC-Modules-40kw-SHIP.zip          40 kW module      AC-DC + DC-DC sheets
  DC-Modules-50kw-SHIP.zip          50 kW liquid      AC-DC + DC-DC sheets
  DC-Modules-50kwa-SHIP.zip         50 kW air         AC-DC + DC-DC sheets
  DC-Modules-control-card-SHIP.zip  control card (GD32G553VET7), one per module
  DC-Modules-cabinet-SHIP.zip       150 kW cabinet    3 x 50 kW modules + CSU

Each zip holds the root .sch, the board sheets, the symbol library (.lib + .dcm)
and the .pro file. KiCad 6 and later open the legacy format by converting it on load.

HOW THEY ARE MADE (never hand-edit - regenerate)
  node calculations/sheet-pages.mjs <target>
  node calculations/sheet-netlist-gen.mjs <target>
  node calculations/kicad5-gen.mjs <target>      writes dc-modules-<target>/ AND re-zips the SHIP file
  node calculations/kicad5-verify.mjs <target>   re-derives every pin from the files; must read 100.00 %
  node calculations/kicad5-print.mjs <target>
  node calculations/sheets-to-pdf.mjs            the 10 PDFs in boards/out-pdf/

  Pins verified at E61: 30 kW 1764 · 40 kW 1850 · 50 kW 1874 · 50 kW air 1938 · card 291 · cabinet 67
  Every component carries MPN and LCSC fields - see docs/lcsc-status.md.

footprints/
  Land patterns for the layout phase, parked since E36. The top-level .kicad_mod files
  are generated from the dimensions in their names (calculations/footprint-gen.mjs).
  The per-SKU folders (30kw / 60kw / 120kw) hold APPROXIMATE envelopes for the retired
  30/60/120 kW set - regenerate them from the RFQ pack before layout.
  Queue and blockers: docs/footprints-to-draw.md (node calculations/footprint-audit.mjs).

The retired 60 kW and 120 kW single-board sheet sets are not on main; the pre-E50
tree, including them, is on the archive/pre-focus-E49 branch.
