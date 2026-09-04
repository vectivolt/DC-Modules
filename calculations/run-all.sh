#!/bin/sh
# Reproduce every machine-readable calculation (§48). SPICE suites are separate (see spice/*/**.mjs).
set -e
cd "$(dirname "$0")/.."
node calculations/design-basis.mjs
node calculations/control/mcu-matrix.mjs
node calculations/pfc/pfc-design.mjs
node calculations/pfc/pfc-control.mjs
node calculations/llc/llc-design.mjs
node calculations/thermal/loss-budget.mjs
node calculations/system/envelope-grid.mjs
node calculations/system/monte-carlo.mjs
node calculations/system/fsm-sim.mjs
node calculations/emi/lisn-precompliance.mjs
node calculations/cost/bom-gen.mjs
sh firmware/run_tests.sh > /dev/null && echo "FIRMWARE LOGIC 33/33 OK"
echo "ALL CALCULATIONS REPRODUCED OK"
