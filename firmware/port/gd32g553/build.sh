#!/bin/sh
# build.sh — the GD32G553 target build: bootloader ELF/bin + application ELFs for slot A and slot B, then the signed
# images (firmware/tools/fw-sign.mjs, development key firmware/boot/keys/dev). No vendor library: regs.h carries the
# register truth (UM Rev 1.3, cited line by line). -Werror; every warning is a defect.
# Usage: sh build.sh [out-dir]   (default firmware/port/gd32g553/out)
set -e
cd "$(dirname "$0")"
OUT="${1:-out}"
mkdir -p "$OUT"
FW=../..

CC="arm-none-eabi-gcc -mcpu=cortex-m33 -mthumb -mfpu=fpv5-sp-d16 -mfloat-abi=hard \
  -std=c99 -Os -g -ffunction-sections -fdata-sections -ffreestanding -fno-math-errno -fno-builtin-logf \
  -Wall -Wextra -Werror -I$FW -I. -Iinclude -DPMP_TARGET_GD32G553"
LD="-nostdlib -Wl,--gc-sections -Wl,--print-memory-usage"
LIBGCC=$(arm-none-eabi-gcc -mcpu=cortex-m33 -mthumb -mfpu=fpv5-sp-d16 -mfloat-abi=hard -print-libgcc-file-name)

CORE="$FW/core/fsm.c $FW/core/group.c $FW/core/ctl.c $FW/core/modapi.c"
PROTO="$FW/proto/frame.c $FW/proto/vmp.c $FW/proto/tonhe_v12.c $FW/proto/profile.c"
HAL="$FW/hal/app.c $FW/hal/pfc.c $FW/hal/llc.c $FW/hal/meas.c $FW/hal/nvm.c $FW/hal/evlog.c $FW/hal/dielim.c"
PORT="startup.c system.c hrtimer.c adc.c can.c nvmport.c lib.c"
BOOT="$FW/boot/sha256.c $FW/boot/p256.c $FW/boot/image.c $FW/boot/bootctl.c $FW/boot/svc.c $FW/boot/updater.c"

# compile to named objects first: the linker script places whole objects (pfc.o, llc.o …) into TCM by name,
# which silently fails on the compiler's temporary object names if sources go straight to the link.
OBJ="$OUT/obj"
mkdir -p "$OBJ"
APPOBJS=""
for f in $CORE $PROTO $HAL $FW/boot/bootctl.c port.c $PORT; do
  o="$OBJ/$(basename "$f" .c).o"
  $CC -c "$f" -o "$o"
  APPOBJS="$APPOBJS $o"
done
BOOTOBJS=""
for f in $BOOT boot_main.c; do
  o="$OBJ/boot_$(basename "$f" .c).o"
  $CC -c "$f" -o "$o"
  BOOTOBJS="$BOOTOBJS $o"
done
for f in $FW/hal/nvm.c $FW/proto/frame.c $PORT; do BOOTOBJS="$BOOTOBJS $OBJ/$(basename "$f" .c).o"; done

# application: one link per slot (execute in place — the load address is part of the signed header)
for SLOT in A B; do
  BASE=$( [ "$SLOT" = A ] && echo 0x0800C000 || echo 0x08040000 )
  sed "s/@SLOT_BASE@/$BASE/" app.ld.in > "$OUT/app_$SLOT.ld"
  arm-none-eabi-gcc -mcpu=cortex-m33 -mthumb -mfpu=fpv5-sp-d16 -mfloat-abi=hard $LD -T "$OUT/app_$SLOT.ld" \
    $APPOBJS "$LIBGCC" -o "$OUT/app_$SLOT.elf" 2> "$OUT/app_$SLOT.mem"
  cat "$OUT/app_$SLOT.mem"
  arm-none-eabi-objcopy -O binary "$OUT/app_$SLOT.elf" "$OUT/app_$SLOT.body"
  # TCM audit (§3.5): nothing the three control interrupts execute or read lives in flash. The disassembly of the TCM
  # region is walked from pfc_ctl_isr / hrtimer_mt_isr / hrtimer_flt_isr along every branch; a reachable function that
  # branches out of TCM, calls through a register, or holds a literal pointing into flash (a table, a function, a veneer)
  # fails the build. Scoped to the control path on purpose: the RAM-resident flash primitives legitimately hold flash
  # addresses as data. (A static inline helper at -Os once landed in flash with a veneer in TCM to reach it, and the LLC's
  # ZVS table sat in flash for two revisions — both invisible to a symbol-name check.)
  arm-none-eabi-objdump -d --start-address=0x10000000 --stop-address=0x10008000 "$OUT/app_$SLOT.elf" > "$OUT/app_$SLOT.tcm.dis"
  ESC=$(awk '
    /^[0-9a-f]+ <[^>]*>:/ { fn = $2; gsub(/[<>:]/, "", fn); next }
    /^ *[0-9a-f]+:/ { for (i = 2; i <= NF; i++) {
        if ($i ~ /^b[a-z]*(\.[nw])?$/ && length($(i+1)) == 8 && $(i+1) ~ /^[0-9a-f]+$/) {
          tgt = $(i+2); gsub(/[<>]/, "", tgt); sub(/\+0x[0-9a-f]+$/, "", tgt)
          if ($(i+1) ~ /^1000/) calls[fn] = calls[fn] " " tgt; else esc[fn] = esc[fn] "\n  " fn ": " $i " " $(i+1) " " $(i+2) }
        if ($i == "blx" && $(i+1) ~ /^r[0-9]+$/) esc[fn] = esc[fn] "\n  " fn ": blx " $(i+1) " (indirect call)"
        if ($i == ".word" && $(i+1) ~ /^0x08/) esc[fn] = esc[fn] "\n  " fn ": literal " $(i+1) " points into flash" } }
    END { n = split("pfc_ctl_isr hrtimer_mt_isr hrtimer_flt_isr", q, " "); for (k = 1; k <= n; k++) seen[q[k]] = 1
          head = 1; tail = n
          while (head <= tail) { f = q[head++]; m = split(calls[f], t, " "); for (k = 1; k <= m; k++) if (t[k] != "" && !(t[k] in seen)) { seen[t[k]] = 1; q[++tail] = t[k] } }
          for (f in seen) { if (!(f in reach)) reach[f] = 1; if (f in esc) printf "%s", esc[f] }
          printf "\n  (%d functions reachable from the control interrupts)\n", tail > "/dev/stderr" }' "$OUT/app_$SLOT.tcm.dis")
  if [ -n "$ESC" ]; then echo "TCM AUDIT FAILED (slot $SLOT) — the control path reaches into flash:$ESC"; exit 1; fi
  echo "TCM AUDIT OK (slot $SLOT): no branch, indirect call or pointer from the control path into flash"
done

# bootloader
arm-none-eabi-gcc -mcpu=cortex-m33 -mthumb -mfpu=fpv5-sp-d16 -mfloat-abi=hard $LD -T boot.ld \
  $BOOTOBJS "$LIBGCC" -o "$OUT/boot.elf" 2> "$OUT/boot.mem"
cat "$OUT/boot.mem"
arm-none-eabi-objcopy -O binary "$OUT/boot.elf" "$OUT/boot.bin"

arm-none-eabi-size "$OUT/boot.elf" "$OUT/app_A.elf" "$OUT/app_B.elf"

# signed images. PRODUCTION=1 signs with PMP_SIGN_KEY and refuses the development key — the key table
# compiled into the bootloader (keys_dev.h) and the key that signs the image must both be production or both be dev,
# and nothing else in the build distinguishes them. A production bootloader is built the same way with PMP_KEYS
# pointing at the production table; key rotation needs no PKI: the bootloader selects the key by key_id from that table
# (boot/image.c), so a production table carries the live key and a spare whose private half never leaves the offline store.
V="${PMP_FW_VERSION:-1.0.0.1}"
KEY="${PMP_SIGN_KEY:-$FW/boot/keys/dev/private.pem}"
if [ "${PRODUCTION:-0}" = 1 ]; then
  case "$KEY" in *keys/dev/*) echo "build.sh: PRODUCTION=1 refuses the development signing key ($KEY)" >&2; exit 1;; esac
  [ -f "$KEY" ] || { echo "build.sh: PRODUCTION=1 needs PMP_SIGN_KEY=<production private key>" >&2; exit 1; }
  if grep -q '0xDE0' "$FW/boot/keys_dev.h"; then
    echo "build.sh: PRODUCTION=1 refuses a bootloader whose key table is still the development one" >&2
    echo "  regenerate firmware/boot/keys_dev.h from the production PUBLIC keys:" >&2
    echo "  node firmware/tools/fw-sign.mjs keys prod1.pem 0x00000001 prod2.pem 0x00000002 > firmware/boot/keys_dev.h" >&2
    exit 1
  fi
fi
if [ -f "$KEY" ]; then
  for SLOT in A B; do
    node "$FW/tools/fw-sign.mjs" sign "$KEY" "$OUT/app_$SLOT.body" "$OUT/app_$SLOT.img" \
      --slot "$SLOT" --version "$V" --min 1.0.0.0
  done
else
  echo "images NOT signed: no key at $KEY (private keys are never committed — create a development key with"
  echo "  node firmware/tools/fw-sign.mjs keygen firmware/boot/keys/dev   and rebuild keys_dev.h as firmware/boot/keys/.gitignore describes)"
fi
echo "TARGET BUILD OK"
