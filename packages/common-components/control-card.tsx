// control-card.tsx — ONE control card, ONE MCU per module. A single part number serves the 30 / 40 / 50 kW modules;
// the card seats in the module's DC-DC slot and reads the module rating from the RATING strap.
//
// WHY A CARD: the control electronics leave the power / EMI environment, one part number replaces many, and the MCU —
// the most supply-volatile part in the module — sits on a small board that can be re-spun without touching a power PCB.
//
// WHY ONE CARD PER MODULE: one GD32G553VET7 carries both converters (calculations/control/umod-pinmap.mts — every PWM on
// an HRTIMER unit, 22 analogue channels). The card sits in the DC-DC slot, so the LLC fast loops, the S/P relays, the
// HMI and CAN stay local, and the PFC bundle (3 × 50 kHz logic-level PWM, the AC-side senses, enables) crosses the
// 40-way inter-board harness. One brain means no link protocol inside a module and one CAN node per module.
//
// WHY A MODULE STOPS AT 50 kW: a two-lane machine needs about twice the PWM and analogue count — past this card on both.
// Higher-power chargers parallel modules, each with its own card; docs/control-card-scope.md carries the arithmetic.
import { UMOD_WAYS, UMOD_MODULE_NETS, UMOD_MCU_PINS, UMOD_INTERNAL } from "./umod-map.gen";

export const CARD_SCOPE = ["30kw", "40kw", "50kw", "50kwa"] as const;   // the module SKUs one card controls alone (slot: 88 ways, 2 × 44, 0.1 in, keyed)

// MANDATORY board-side obligations — every one is a safety or correctness requirement.
export const CARD_RULES = [
  // A card can be absent, unpowered, or seated but not yet booted. Nothing may be enabled in any
  // of those states, so the DEFAULT-OFF state is held by the POWER BOARDS, not by the card:
  // pull-downs on both GATE_EN chains, both EN lines, every relay drive, and the three PFC PWM
  // lines at their receiving end of the harness.
  "board-side pull-downs on GATE_EN_A/GATE_EN_B, EN lines, relay drives, and harness PWM lines",
  // The AGND-to-DGND single-point tie lives ON the card; a second tie on a power board creates
  // exactly the ground loop it exists to prevent.
  "the single-point AGND-DGND tie lives on the card; no RAGT* on the power boards",
  // AVMID biases sense networks on the far side of two connectors; its Kelvin return (AGND_2 on
  // the slot, the adjacent AGND way on the harness) rides beside it.
  "AVMID travels with its Kelvin return on BOTH the slot and the harness",
  // The fault line is safety-critical and its pull-up sets the wired-OR's idle state.
  "the single merged FLT wired-OR is pulled up and filtered ON the card, at the MCU end",
  // Identity is ONE resistor code on an ADC pin — no build variants, no slot strap, one firmware image:
  //   0 R -> 30 kW · 1 k -> 40 kW · 10 k -> 50 kW liquid · 15 k -> 50 kW air · 3.32 k -> reserved · open -> no host, fault
  "RATING strap: 0R = 30 kW, 1k = 40 kW, 10k = 50 kW liquid, 15k = 50 kW air, 3.32k = reserved, open = fault",
] as const;

// ---------------------------------------------------------------------------------------------
// THE PIN MAP — generated single source (calculations/control/umod-pinmap.mts). One function
// serves both sides of the slot so they can never drift: the DC-DC board calls role "module",
// the card itself calls role "card" (generic: way name == net name).
export const cardMap = (role: "module" | "card") => {
  if (role === "card") {
    // Generic side. AGND_2 is AVMID's Kelvin return: netlist-wise it lands on the card's AGND at
    // the AnalogMid ground (the Kelvin property is a routing rule, recorded in CARD_RULES).
    // Spare ways carry nothing.
    return UMOD_WAYS.map(([w]) =>
      [w, w === "AGND_2" ? "net.AGND" : /^SPARE/.test(w) ? null : `net.${w}`] as [string, string | null]);
  }
  if (role === "module")
    return UMOD_WAYS.map(([w]) =>
      [w, UMOD_MODULE_NETS[w] ? `net.${UMOD_MODULE_NETS[w]}` : null] as [string, string | null]);
  throw new Error(`cardMap: unknown role "${role}" — the module has one card (roles: "module" | "card")`);
};

// THE MCU PIN MAP — GD32G553VET7, LQFP-100. GENERATED (umod-pinmap.mts); every way sits on a pin whose
// alternate function the datasheet documents for that use.
export const CARD_MCU_PINS: Record<string, number> = UMOD_MCU_PINS;

// MCU pins that never reach the connector: the watchdog kick, boot strap and debug port live on
// the card with the SWD header.
export const CARD_INTERNAL: Record<string, [number, string]> = {
  WDI: [UMOD_INTERNAL.WDI, "net.WDI"],
  BOOT0: [UMOD_INTERNAL.BOOT0, "net.BOOT0_CARD"],
  SWDIO: [UMOD_INTERNAL.SWDIO, "net.SWDIO_CARD"],
  SWCLK: [UMOD_INTERNAL.SWCLK, "net.SWCLK_CARD"],
};

// The PWM electrical contract. The full-bridge LLC takes two complementary HRTIMER pairs (leg 1 = PWM0 / PWM6,
// leg 2 = PWM1 / PWM7); the three Vienna phases are single-ended (PWM3 / 4 / 5); one HRTIMER fault input gates them all.
export const CARD_PWM_CONTRACT = {
  llc: [["PWM0", "PWM6"], ["PWM1", "PWM7"]],
  pfc: ["PWM3", "PWM4", "PWM5"],
  spare: ["PWM2", "PWM8", "PWM9", "PWM10", "PWM11"],
} as const;
