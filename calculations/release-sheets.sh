#!/bin/sh
# release-sheets.sh — the release-sheet pipeline as one command: build every board netlist, generate the KiCad-5 sheets,
# verify every connected pin against an independent netlist, run the sheet-QA suite, print and bind the PDFs.
# Run after any change to the schematic source (packages/, boards/) or to a BOM description (parts-db feeds the sheet
# payloads):   sh calculations/release-sheets.sh          ≈ 15 min; the board builds are the slow part
# Order matters: pages and netlists before kicad5-gen, prints before PDFs.
set -e
cd "$(dirname "$0")/.."
LOG=$(mktemp -d)
for sku in 30kw 40kw 50kw 50kwa; do
  for side in acdc dcdc; do
    echo "== build $sku/$side"
    TSCI_NO_ROUTE=1 npx tsci build "boards/$sku/$side.tsx" --ignore-placement-drc --ignore-routing-drc > "$LOG/$sku-$side.log" 2>&1 \
      || { echo "BUILD FAILED: $sku/$side"; tail -20 "$LOG/$sku-$side.log"; exit 1; }
    if grep -q "could not find port" "$LOG/$sku-$side.log"; then echo "UNRESOLVED PORT in $sku/$side"; grep "could not find port" "$LOG/$sku-$side.log" | head -5; exit 1; fi
  done
done
echo "== build control-card"
TSCI_NO_ROUTE=1 npx tsci build boards/control-card.tsx --ignore-placement-drc --ignore-routing-drc > "$LOG/card.log" 2>&1 || { echo "BUILD FAILED: control-card"; tail -20 "$LOG/card.log"; exit 1; }
for sku in 30kw 40kw 50kw 50kwa control-card; do
  echo "== sheets $sku"
  node calculations/sheet-pages.mjs "$sku" > "$LOG/pages-$sku.log" || { cat "$LOG/pages-$sku.log"; exit 1; }
  node calculations/sheet-netlist-gen.mjs "$sku" | tail -1
  node calculations/kicad5-gen.mjs "$sku" | tail -1
  node calculations/kicad5-verify.mjs "$sku" > "$LOG/verify-$sku.log" || { tail -20 "$LOG/verify-$sku.log"; echo "PIN VERIFICATION FAILED: $sku"; exit 1; }
  tail -2 "$LOG/verify-$sku.log"
done
node calculations/footprint-gen.mjs | head -1
node calculations/kicad5-visual.mjs | tail -3
node calculations/alignment-audit.mjs | tail -1
node calculations/wiring-audit.mjs | tail -1
node calculations/cell-uniformity.mjs | tail -1
for sku in 30kw 40kw 50kw 50kwa control-card; do node calculations/kicad5-print.mjs "$sku" | tail -1; done
node calculations/sheets-to-pdf.mjs | tail -2
echo "RELEASE SHEETS REGENERATED — now run: sh calculations/run-all.sh"
