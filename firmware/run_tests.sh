#!/bin/sh
# Build & run the production-logic verification (26 §36 scenarios + CAN codec + 100k fuzz)
# under Address/UB sanitizers. Exit non-zero on any failure.
set -e
cd "$(dirname "$0")"
cc -std=c99 -Wall -Wextra -Werror -O1 -fsanitize=address,undefined \
   core/fsm.c core/can_proto.c core/csu.c test/host_sim.c -o /tmp/pmp_host_sim -lm
/tmp/pmp_host_sim
