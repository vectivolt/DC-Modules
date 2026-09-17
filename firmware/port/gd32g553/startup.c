/* startup.c — E80 vectors and reset for both images (Cortex-M33; vector table per UM Table 5-2, facts files).
 * Reset: paint the stack, copy .data, zero .bss, copy .ramfunc into TCM (0x1000 0000 — always mapped, no enable bit),
 * copy the vector table into RAM and point VTOR there, then main. Any unhandled fault forces every HRTIMER output off
 * and the enables low, then waits for the watchdog: gates are low by hardware through reset and boot (§3.3). */
#include "regs.h"
#include "flash_map.h"   /* E82 (G-14): the journal window nmi_handler is allowed to absorb an ECC fault in */
#include <stdint.h>
typedef __UINTPTR_TYPE__ uintptr_t;

extern uint32_t _estack_top[];
extern uint32_t _sidata[], _sdata[], _edata[];
extern uint32_t _sbss[], _ebss[];
extern uint32_t _siramfunc[], _sramfunc[], _eramfunc[];
extern uint32_t _sstack[], _estack[];
int main(void);
static void vtor_to_ram(void);   /* defined with VECTORS at the foot of the file */

/* E82 (M-20): the slot the bootloader entered. SCB_VTOR used to be that address all the way through, and port.c reads
   it to find the running image's header; once the table moves to RAM it no longer is, so it is captured here. */
uint32_t port_slot_vtor;

void reset_handler(void) {
  uint32_t *pe = (uint32_t *)((uintptr_t)_estack - 64u);   /* spare the live frame the paint loop itself runs on */
  for (uint32_t *p = _sstack; p < pe; p++) *p = 0xA5A5A5A5u;
  uint32_t *s = _sidata;
  for (uint32_t *d = _sdata; d < _edata;) *d++ = *s++;
  for (uint32_t *d = _sbss; d < _ebss;) *d++ = 0u;
  s = _siramfunc;
  for (uint32_t *d = _sramfunc; d < _eramfunc;) *d++ = *s++;
  /* E82 (M-20): the ISR BODIES were already in TCM, but exception ENTRY reads the vector table, and on an image running
     from slot A that table shares flash bank 0 with the NVM journal, the boot record and the event log. UM §2.3.4: RWW
     is bank-granular — "while a read operation is performed in a bank, the OTHER bank can be accessed for another
     operation" — so every journal append (80 µs per double word, ds Table 4-25) and every log page erase (1–20 ms)
     stalled interrupt entry for the whole operation. An evlog flush during a fault storm could therefore freeze the
     100 kHz loop for milliseconds with the Vienna PWM held at its last duty, and SysTick could not run either, so no
     WDI edge went out. The copy lives in ordinary SRAM0 rather than TCM: what matters is only that it is not on the
     flash bus, and .bss needs no linker-script region, so the BOOTLOADER image (boot.ld, no TCM) gets the same
     protection from this one file. The bootloader's jump contract is untouched: it still loads MSP and VTOR from the
     slot and enters here, and port_slot_vtor captures that address before this overwrites it. */
  port_slot_vtor = SCB_VTOR;
  vtor_to_ram();
  __asm volatile ("dsb\n isb");
  main();
  for (;;) {}
}

void default_handler(void) {
  HRT_CHOUTDIS = 0xFFFFu;                       /* every output to idle-inactive */
  GPIO_BOP(PD) = (BIT(0) | BIT(1)) << 16;       /* EN_PFC / EN_LLC low */
  for (;;) {}                                   /* no WDI kicks: the TPS3430 resets through NRST */
}

/* E82 (G-14): two-bit flash ECC faults absorbed since reset, saturating. Also the loop guard — see nmi_handler. */
volatile uint8_t port_flash_ecc;
#define FLASH_ECC_BUDGET 16u

void nmi_handler(void) {                        /* HXTAL clock monitor: hardware already fell back to IRC8M */
  if (RCU_INT & BIT(7)) RCU_INT |= BIT(23);     /* clear CKMIF; the PLL is re-locked from IRC8M by system_init after reset */
  /* E82 (G-14): a power cut inside a double-word program leaves that 64-bit row "in an indeterminate state" (UM §2.3.8),
     and the next read of it is a two-bit ECC error: FMC_ECCCS ECCDET0 (31) and SYSCFG_STAT FLASHECCIF (2) set, and an
     NMI is generated (UM §2.3.2) — there is no enable bit to turn it off. Both journals are appended exactly when power
     is failing (fault → log → brown-out), so this is a field event, and falling into default_handler() would reset the
     card, re-read the same row at the next mount and loop for ever — the bootloader reads the boot record through this
     same handler, so it bricks. Returning instead hands the reader the uncorrectable bytes, its CRC rejects them, and
     hal/nvm.h's "torn entry" rule takes over, which is the documented behaviour.
     Returning is only safe for a DATA row. ECCADDR (18:0) is the faulting byte offset from FM_FLASH_BASE — UM §2.3.2
     records a bank-1 access as the user address 0x0804 0000, i.e. an offset of 0x4 0000 — so a fault in an image or in
     the bootloader still falls through to the reset, and an encoding that is not this one lands outside the window and
     degrades to exactly today's behaviour rather than to "keep running on corrupt code".
     FLASH_ECC_BUDGET is the loop guard. A mount reads a bad row two or three times before the journal stops at it, so a
     healthy recovery costs a handful; if the part were to re-execute the faulting load instead (the UM does not say the
     NMI is imprecise, though a prefetch-buffer fault with no owning instruction — §2.3.2 note 5 — cannot be precise),
     the budget is spent at once and the card resets. Never an unbounded NMI storm, whichever it is. */
  if (FMC_ECCCS & BIT(31)) {
    uint32_t a = FM_FLASH_BASE + (FMC_ECCCS & 0x7FFFFu);
    FMC_ECCCS = BIT(31) | BIT(30);              /* rc_w1; clearing ECCDET0 clears SYSCFG_STAT FLASHECCIF too (note 4) */
    SYSCFG_STAT = BIT(2);
    if (a >= FM_BOOTCTL && a < FM_EVLOG + FM_EVLOG_SIZE && port_flash_ecc < FLASH_ECC_BUDGET) {
      port_flash_ecc++;
      return;
    }
    if (port_flash_ecc < 0xFFu) port_flash_ecc++;
  }
  default_handler();
}

#define WEAK_ISR(name) void name(void) __attribute__((weak, alias("default_handler")))
WEAK_ISR(hardfault_handler); WEAK_ISR(memmanage_handler); WEAK_ISR(busfault_handler); WEAK_ISR(usagefault_handler);
WEAK_ISR(svc_handler); WEAK_ISR(pendsv_handler); WEAK_ISR(systick_isr);
WEAK_ISR(exti2_isr); WEAK_ISR(exti3_isr); WEAK_ISR(exti5_isr); WEAK_ISR(exti14_isr);
WEAK_ISR(hrtimer_mt_isr); WEAK_ISR(pfc_ctl_isr); WEAK_ISR(hrtimer_flt_isr);
/* E82 (M-28): the LVD fires through EXTI line 16 on IRQ 1. default_handler is the whole response — every HRTIMER
   output to idle-inactive, both stage enables low, then spin without a WDI edge so the TPS3430 resets the card. */
WEAK_ISR(lvd_isr);

static void exti5_9_isr(void) { if (EXTI_PD & BIT(5)) exti5_isr(); else EXTI_PD = EXTI_PD & 0x3E0u; }
static void exti10_15_isr(void) { if (EXTI_PD & BIT(14)) exti14_isr(); else EXTI_PD = EXTI_PD & 0xFC00u; }

typedef void (*vec_t)(void);
__attribute__((section(".vectors"), used))
static const vec_t VECTORS[16 + 130] = {
  (vec_t)_estack_top, reset_handler, nmi_handler, hardfault_handler,
  memmanage_handler, busfault_handler, usagefault_handler, 0, 0, 0, 0,
  svc_handler, 0, 0, pendsv_handler, systick_isr,
  /* IRQ 0.. */
  [16 + 1] = lvd_isr,            /* LVD / VAVD / VOVD / VUVD through EXTI (E82 M-28) */
  [16 + 8] = exti2_isr,          /* EXTI2 */
  [16 + 9] = exti3_isr,          /* EXTI3 */
  [16 + 13] = pfc_ctl_isr,       /* DMA0 channel2 global: ADC2 end of sequence = 100 kHz Vienna control (E82 M-21) */
  [16 + 23] = exti5_9_isr,       /* EXTI5–9 */
  [16 + 40] = exti10_15_isr,     /* EXTI10–15 */
  [16 + 67] = hrtimer_mt_isr,    /* HRTIMER interrupt0: master (10 kHz LLC tick) */
  [16 + 76] = hrtimer_flt_isr,   /* HRTIMER interrupt9: faults */
};

/* VTOR needs the table aligned to a power of two at least as large as it: 146 entries × 4 = 584 B → 1 KB. The copy is a
   plain word loop and runs after the .bss zeroing above it. */
static uint32_t vram[256] __attribute__((aligned(1024)));
static void vtor_to_ram(void) {
  const uint32_t *v = (const uint32_t *)VECTORS;
  for (uint32_t k = 0u; k < sizeof VECTORS / sizeof VECTORS[0]; k++) vram[k] = v[k];
  SCB_VTOR = (uint32_t)vram;
}
