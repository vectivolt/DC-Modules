/* startup.c — E80 vectors and reset for both images (Cortex-M33; vector table per UM Table 5-2, facts files).
 * Reset: paint the stack, copy .data, zero .bss, copy .ramfunc into TCM (0x1000 0000 — always mapped, no enable bit),
 * then main. Any unhandled fault forces every HRTIMER output off and the enables low, then waits for the watchdog:
 * gates are low by hardware through reset and boot (§3.3). */
#include "regs.h"
#include <stdint.h>
typedef __UINTPTR_TYPE__ uintptr_t;

extern uint32_t _estack_top[];
extern uint32_t _sidata[], _sdata[], _edata[];
extern uint32_t _sbss[], _ebss[];
extern uint32_t _siramfunc[], _sramfunc[], _eramfunc[];
extern uint32_t _sstack[], _estack[];
int main(void);

void reset_handler(void) {
  uint32_t *pe = (uint32_t *)((uintptr_t)_estack - 64u);   /* spare the live frame the paint loop itself runs on */
  for (uint32_t *p = _sstack; p < pe; p++) *p = 0xA5A5A5A5u;
  uint32_t *s = _sidata;
  for (uint32_t *d = _sdata; d < _edata;) *d++ = *s++;
  for (uint32_t *d = _sbss; d < _ebss;) *d++ = 0u;
  s = _siramfunc;
  for (uint32_t *d = _sramfunc; d < _eramfunc;) *d++ = *s++;
  __asm volatile ("dsb\n isb");
  main();
  for (;;) {}
}

void default_handler(void) {
  HRT_CHOUTDIS = 0xFFFFu;                       /* every output to idle-inactive */
  GPIO_BOP(PD) = (BIT(0) | BIT(1)) << 16;       /* EN_PFC / EN_LLC low */
  for (;;) {}                                   /* no WDI kicks: the TPS3430 resets through NRST */
}

void nmi_handler(void) {                        /* HXTAL clock monitor: hardware already fell back to IRC8M */
  if (RCU_INT & BIT(7)) RCU_INT |= BIT(23);     /* clear CKMIF; the PLL is re-locked from IRC8M by system_init after reset */
  default_handler();
}

#define WEAK_ISR(name) void name(void) __attribute__((weak, alias("default_handler")))
WEAK_ISR(hardfault_handler); WEAK_ISR(memmanage_handler); WEAK_ISR(busfault_handler); WEAK_ISR(usagefault_handler);
WEAK_ISR(svc_handler); WEAK_ISR(pendsv_handler); WEAK_ISR(systick_isr);
WEAK_ISR(exti2_isr); WEAK_ISR(exti3_isr); WEAK_ISR(exti5_isr); WEAK_ISR(exti14_isr);
WEAK_ISR(hrtimer_mt_isr); WEAK_ISR(hrtimer_st3_isr); WEAK_ISR(hrtimer_flt_isr);

static void exti5_9_isr(void) { if (EXTI_PD & BIT(5)) exti5_isr(); else EXTI_PD = EXTI_PD & 0x3E0u; }
static void exti10_15_isr(void) { if (EXTI_PD & BIT(14)) exti14_isr(); else EXTI_PD = EXTI_PD & 0xFC00u; }

typedef void (*vec_t)(void);
__attribute__((section(".vectors"), used))
static const vec_t VECTORS[16 + 130] = {
  (vec_t)_estack_top, reset_handler, nmi_handler, hardfault_handler,
  memmanage_handler, busfault_handler, usagefault_handler, 0, 0, 0, 0,
  svc_handler, 0, 0, pendsv_handler, systick_isr,
  /* IRQ 0.. */
  [16 + 8] = exti2_isr,          /* EXTI2 */
  [16 + 9] = exti3_isr,          /* EXTI3 */
  [16 + 23] = exti5_9_isr,       /* EXTI5–9 */
  [16 + 40] = exti10_15_isr,     /* EXTI10–15 */
  [16 + 67] = hrtimer_mt_isr,    /* HRTIMER interrupt0: master (10 kHz LLC tick) */
  [16 + 71] = hrtimer_st3_isr,   /* HRTIMER interrupt4: ST3 (100 kHz Vienna control) */
  [16 + 76] = hrtimer_flt_isr,   /* HRTIMER interrupt9: faults */
};
