/* flash_map.h — E80 the GD32G553VET7 flash map (512 KB). Every region is a whole number of 4 KB, so the map holds with the
 * dual-bank 1 KB pages and the single-bank 2 KB pages alike. The slots execute in place, one per bank.
 * firmware/tools/fw-sign.mjs reads FM_SLOT_A, FM_SLOT_B and FM_SLOT_SIZE from this file — it is the only copy of the map. */
#ifndef PMP_FLASH_MAP_H
#define PMP_FLASH_MAP_H
#define FM_FLASH_BASE    0x08000000u
#define FM_FLASH_SIZE    0x00080000u
#define FM_BANK1         0x08040000u
#define FM_BOOT          0x08000000u   /* bootloader, 32 KB */
#define FM_BOOT_SIZE     0x00008000u
#define FM_BOOTCTL       0x08008000u   /* boot control journal (bootctl.h), two pages */
#define FM_BOOTCTL_SIZE  0x00001000u
#define FM_NVM           0x08009000u   /* application records journal (hal/nvm.h), two pages */
#define FM_NVM_SIZE      0x00001000u
#define FM_EVLOG         0x0800A000u   /* event log ring (hal/evlog.h) */
#define FM_EVLOG_SIZE    0x00002000u
#define FM_SLOT_A        0x0800C000u   /* 208 KB, bank 0 */
#define FM_SLOT_B        0x08040000u   /* 208 KB, bank 1 */
#define FM_SLOT_SIZE     0x00034000u
#define FM_RESERVED      0x08074000u   /* 48 KB, bank 1, unused */
/* no-init RAM shared by the bootloader and the application (boot_handoff_t), the last 64 bytes of SRAM0 */
#define FM_HANDOFF       0x20013FC0u
#endif
