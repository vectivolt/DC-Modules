DC-Modules release schematics (KiCad 5.1 legacy format)
=========================================================

FIVE RELEASE TARGETS - one SHIP zip each
  DC-Modules-30kw-SHIP.zip          30 kW module      AC-DC + DC-DC sheets
  DC-Modules-40kw-SHIP.zip          40 kW module      AC-DC + DC-DC sheets
  DC-Modules-50kw-SHIP.zip          50 kW liquid      AC-DC + DC-DC sheets
  DC-Modules-50kwa-SHIP.zip         50 kW air         AC-DC + DC-DC sheets
  DC-Modules-control-card-SHIP.zip  control card (GD32G553VET7), one per module

Each zip holds the root .sch, the board sheets, the symbol library (.lib + .dcm)
and the .pro file. KiCad 6 and later open the legacy format by converting it on load.
The design face ends here: there is no PCB layout and no other CAD export in this repository.

HOW THEY ARE MADE (never hand-edit - regenerate)
  node calculations/sheet-pages.mjs <target>     REQUIRED FIRST: reads dist netlists into page tables
  node calculations/sheet-netlist-gen.mjs <target>
  node calculations/kicad5-gen.mjs <target>      writes dc-modules-<target>/ AND re-zips the SHIP file
  node calculations/kicad5-verify.mjs <target>   re-derives every pin from the files; must read 100 %
  node calculations/kicad5-print.mjs <target>
  node calculations/sheets-to-pdf.mjs            the 9 PDFs in boards/out-pdf/

  kicad5-verify must read 100 % on every target - the current pin count is in the
  repository overview (README.md) status table.
  Every component carries MPN and LCSC fields - statuses and sourcing rules in docs/bom-guide.md.

footprints/
  The land patterns the sheets name, generated from the dimensions in each name
  (node calculations/footprint-gen.mjs). node calculations/footprint-audit.mjs checks that
  every sheet part names a package and that every value-row MPN matches its land.
  Wound magnetics, current transformers and the shunt have no standard land: theirs come
  from the maker's drawing (docs/magnetics-<sku>.md) when layout opens.

The repository carries the four module SKUs and their control card only.
