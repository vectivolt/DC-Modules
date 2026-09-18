#!/bin/sh
# Reproduce every machine-readable calculation (§48). SPICE suites are separate (see spice/*/**.mjs);
# their result CSVs are pinned by tank fingerprint — current-coordination FAILS if a tank changes without a re-run.
set -e   # a gate on an `a && b` line cannot trip set -e — every gate runs as its own command
cd "$(dirname "$0")/.."
node calculations/design-basis.mjs
node calculations/pfc/pfc-design.mjs
node calculations/llc/llc-design.mjs
# the D7 engine reads the simulated crest, the filter-stability check reads both chokes, loss-budget reads all three
node calculations/pfc/vienna-switched.mjs
node calculations/emi/dm-choke-design.mjs
node calculations/pfc/pfc-control.mjs
node calculations/thermal/loss-budget.mjs
node calculations/system/envelope-grid.mjs
node calculations/magnetics/d1-fd.mjs
node calculations/system/monte-carlo.mjs
node calculations/system/fsm-sim.mjs
node calculations/emi/lisn-precompliance.mjs
node calculations/cost/bom-gen.mjs
node calculations/cost/bom-maturity.mjs
# check EVERY built SKU pair — a 30 kW-only run hides a 40 kW JB×CBAF overlap
SKPAIRS=""
for s in 30kw 40kw 50kw 50kwa; do
  if [ -f "dist/boards/$s/acdc/circuit.json" ]; then SKPAIRS="$SKPAIRS $s/acdc $s/dcdc"; fi
done
if [ -n "$SKPAIRS" ]; then node calculations/schematic-check.mjs $SKPAIRS; fi
if [ -f dist/boards/control-card/circuit.json ]; then npx tsx calculations/module-interconnect-audit.mts; fi
npx tsx calculations/polarity-audit.mts
node calculations/stress-audit.mjs
node calculations/magnetics/temp-critique.mjs
node calculations/magnetics/conductor-audit.mjs
node calculations/magnetics/magnetics-envelope.mjs
node calculations/system/fault-energy.mjs
node calculations/system/current-coordination.mjs
# the four module magnetics pages are written from the gate evidence above; mag-sync and the RFQ audit then check them
node calculations/magnetics/mag-docs.mjs
node calculations/magnetics/mag-sync.mjs
node calculations/magnetics-rfq-audit.mjs
node calculations/system/standby-budget.mjs > /dev/null
echo "STANDBY BUDGET CONSISTENT"
node calculations/reliability/mtbf-budget.mjs > /dev/null
echo "MTBF BUDGET CONSISTENT"
node calculations/verify-independent.mjs
node calculations/footprint-audit.mjs > /dev/null
echo "FOOTPRINT AUDIT CLEAN (0 unnamed - 0 mismatched)"
# the last two generated pages outside the battery — regenerated here so a chrome or revision change never strands them
node calculations/busbar/busbar-calc.mjs > /dev/null
node calculations/pin-map-export.mjs > /dev/null
node calculations/docs-lint.mjs
RC_LOG=$(mktemp); node calculations/review-checks.mjs > "$RC_LOG" || { grep "^FAIL" "$RC_LOG"; exit 1; }
echo "REVIEW CHECKS PASS — $(grep -c "^PASS" "$RC_LOG") closure assertions"
node calculations/repo-hygiene.mjs
npx tsx calculations/control/port-pin-audit.mjs
# the ONLY gate that reads hal/*.c against the hardware source — ADC scales, tank constants, link C
node calculations/control/fw-constants-sync.mjs
# the banner COUNTS what ran, so it can never quote a number typed at the last revision
FW_LOG=$(mktemp); sh firmware/run_tests.sh > "$FW_LOG"
FW_N=$(grep -c '^PASS' "$FW_LOG")
echo "FIRMWARE LOGIC OK — $FW_N checks across $(grep -c '^RESULT' "$FW_LOG") binaries ($(grep '^RESULT' "$FW_LOG" | sed 's/RESULT: \([0-9]*\)\/.*/\1/' | paste -sd'+' -)), sanitizers fatal"; rm -f "$FW_LOG"
# every check count a page or badge types by hand must be the one that just ran — a stale 336 outlived two revisions once
STALE=$( { grep -rhoE '[0-9]+_checks' README.md docs calculations/doc-chrome.mjs; grep -rhoE '\*?\*?[0-9]+ checks\*?\*? ?(under|across|\|)' README.md docs; } | grep -oE '[0-9]+' | sort -u | grep -vx "$FW_N" || true)
[ -z "$STALE" ] || { echo "STALE CHECK COUNT — a page or badge says $(echo $STALE | tr ' ' ',') checks, the suite ran $FW_N"; exit 1; }
echo "CHECK COUNTS IN SYNC — every page and badge says $FW_N"
# the GD32G553 target cross-build (register-level port, no vendor library) — runs where the bare-metal GCC exists
if command -v arm-none-eabi-gcc > /dev/null 2>&1; then
  sh firmware/port/gd32g553/build.sh > /dev/null 2>&1
  echo "TARGET BUILD OK — bootloader + slot A/B images in firmware/port/gd32g553/out (signed when a signing key is present)"
fi
echo "ALL CALCULATIONS REPRODUCED OK"
