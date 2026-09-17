#!/bin/sh
# Build & run the firmware verification under Address/UB sanitizers with -Werror; any failure, warning or sanitizer
# report exits non-zero.
#   host_sim    — the supervisory core (fsm.c + group.c): the 26 §36 scenarios, E60–E78 checks, every-tick invariants
#   ctl_test    — the reference shaper and regulator kernel (ctl.c)
#   proto_test  — TonHe V1.2 and VMP 2.0 conformance and fuzz, and one core driven through both profiles (E78)
#   hal_test    — the portable real-time HAL on cycle-by-cycle Vienna and LLC plants, measurement, power-cut-safe NVM (E79)
#   app_test    — the module application end to end: interrupts, the 1 ms sequence, TonHe V1.2, faults, NVM, CAN (E79)
#   boot_test   — SHA-256, ECDSA-P256, the signed image, the boot decision and the update protocol on RAM flash (E80)
#   e81_test    — the E81 review's own checks: the adaptive LLC dead time and demand map, the fsm rows F-A-7/11 and
#                 F-E-02/05/06/07/09/13, the per-rating fan count and fault channels, and the TonHe/VMP protocol fixes
set -e
cd "$(dirname "$0")"
CC="cc -std=c99 -Wall -Wextra -Werror -O1 -fsanitize=address,undefined -fno-sanitize-recover=undefined"
CORE="core/fsm.c core/group.c core/ctl.c core/modapi.c"
PROTO="proto/frame.c proto/vmp.c proto/tonhe_v12.c proto/profile.c"
HAL="hal/pfc.c hal/llc.c hal/meas.c hal/nvm.c hal/evlog.c hal/dielim.c"
BOOT="boot/sha256.c boot/p256.c boot/image.c boot/bootctl.c boot/svc.c boot/updater.c"
$CC $BOOT hal/nvm.c proto/frame.c test/boot_test.c -o /tmp/pmp_boot_test -lm
/tmp/pmp_boot_test
$CC core/fsm.c core/group.c test/host_sim.c -o /tmp/pmp_host_sim -lm
$CC core/ctl.c test/ctl_test.c -o /tmp/pmp_ctl_test -lm
$CC $CORE $PROTO test/proto_test.c -o /tmp/pmp_proto_test -lm
$CC $HAL core/ctl.c core/fsm.c test/hal_test.c -o /tmp/pmp_hal_test -lm
$CC -I. hal/app.c $HAL $CORE $PROTO test/app_test.c -o /tmp/pmp_app_test -lm
$CC -I. hal/app.c $HAL $CORE $PROTO boot/image.c boot/sha256.c boot/p256.c test/e81_test.c -o /tmp/pmp_e81_test -lm
/tmp/pmp_host_sim
/tmp/pmp_ctl_test
/tmp/pmp_proto_test
/tmp/pmp_hal_test
/tmp/pmp_app_test
/tmp/pmp_e81_test
