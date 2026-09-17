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
