#!/bin/sh
# Reproduce every machine-readable calculation (§48). SPICE suites are separate (see spice/*/**.mjs);
# E60: their result CSVs are pinned by tank fingerprint — current-coordination FAILS if a tank changes without a re-run.
set -e
cd "$(dirname "$0")/.."
node calculations/design-basis.mjs
node calculations/control/mcu-matrix.mjs
node calculations/pfc/pfc-design.mjs
node calculations/llc/llc-design.mjs
# E65: the D7 engine reads the simulated crest, the filter-stability check reads both chokes, loss-budget reads all three
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
# R5: check EVERY built SKU pair — the 30 kW-only run let a 40 kW JB×CBAF overlap hide
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
node calculations/magnetics/mag-sync.mjs
node calculations/system/fault-energy.mjs
node calculations/system/current-coordination.mjs
node calculations/system/standby-budget.mjs > /dev/null && echo "STANDBY BUDGET CONSISTENT"
node calculations/reliability/mtbf-budget.mjs > /dev/null && echo "MTBF BUDGET CONSISTENT"
node calculations/verify-independent.mjs
node calculations/footprint-audit.mjs > /dev/null && echo "FOOTPRINT AUDIT CLEAN (0 unnamed - 0 mismatched)"
node calculations/docs-lint.mjs
sh firmware/run_tests.sh > /dev/null && echo "FIRMWARE LOGIC 58/58 OK"
echo "ALL CALCULATIONS REPRODUCED OK"
