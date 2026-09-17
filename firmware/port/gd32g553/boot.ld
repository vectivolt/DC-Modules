/* boot.ld — E80 bootloader image at FM_BOOT (0x0800 0000, 32 KB). Not signed (it is the root of trust); its vector
 * table is the power-on table. No TCM section — nothing here is deadline-critical. */
MEMORY
{
  FLASH (rx) : ORIGIN = 0x08000000, LENGTH = 32K
  RAM   (rw) : ORIGIN = 0x20000000, LENGTH = 0x13FC0
}
ENTRY(reset_handler)
SECTIONS
{
  .vectors : { KEEP(*(.vectors)) } > FLASH
  .text : { *(.text*) *(.rodata*) . = ALIGN(4); } > FLASH
  .ARM.exidx : { *(.ARM.exidx*) } > FLASH

  _siramfunc = LOADADDR(.ramfunc);
  .ramfunc : { . = ALIGN(4); _sramfunc = .; *(.ramfunc*); . = ALIGN(4); _eramfunc = .; } > RAM AT> FLASH

  _sidata = LOADADDR(.data);
  .data : { . = ALIGN(4); _sdata = .; *(.data*); . = ALIGN(4); _edata = .; } > RAM AT> FLASH
  .bss : { . = ALIGN(4); _sbss = .; *(.bss*) *(COMMON); . = ALIGN(4); _ebss = .; } > RAM

  .stack (NOLOAD) : {
    . = ALIGN(8);
    _sstack = ORIGIN(RAM) + LENGTH(RAM) - 8K;
    . = _sstack + 8K;
    _estack = .;
  } > RAM
  _estack_top = ORIGIN(RAM) + LENGTH(RAM);
  ASSERT(_ebss <= _sstack, "RAM overflow into the stack region")
}
