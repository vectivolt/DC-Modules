#!/bin/sh
# Build & run the firmware verification under Address/UB sanitizers with -Werror; any failure, warning or sanitizer
# report exits non-zero.
#   host_sim    — the supervisory core (fsm.c + group.c): the 26 §36 scenarios, E60–E78 checks, every-tick invariants
#   ctl_test    — the reference shaper and regulator kernel (ctl.c)
#   proto_test  — TonHe V1.2 and VMP 2.0 conformance and fuzz, and one core driven through both profiles (E78)
#   hal_test    — the portable real-time HAL on cycle-by-cycle Vienna and LLC plants, measurement, power-cut-safe NVM (E79)
set -e
cd "$(dirname "$0")"
CC="cc -std=c99 -Wall -Wextra -Werror -O1 -fsanitize=address,undefined -fno-sanitize-recover=undefined"
$CC core/fsm.c core/group.c test/host_sim.c -o /tmp/pmp_host_sim -lm
$CC core/ctl.c test/ctl_test.c -o /tmp/pmp_ctl_test -lm
$CC core/fsm.c core/group.c core/ctl.c core/modapi.c proto/frame.c proto/vmp.c proto/tonhe_v12.c proto/profile.c \
    test/proto_test.c -o /tmp/pmp_proto_test -lm
$CC hal/pfc.c hal/llc.c hal/meas.c hal/nvm.c core/ctl.c core/fsm.c test/hal_test.c -o /tmp/pmp_hal_test -lm
/tmp/pmp_host_sim
/tmp/pmp_ctl_test
/tmp/pmp_proto_test
/tmp/pmp_hal_test
