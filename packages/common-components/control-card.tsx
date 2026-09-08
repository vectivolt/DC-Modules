// control-card.tsx — ONE control card, ONE brain per module (E40). Single p/n, three homes:
// the module's DC-DC slot (role "module"), and the cabinet CSU carrier (RATING band 3.32 k).
//
// WHY A CARD (unchanged since E35): the control electronics leave the power/EMI environment,
// one part number instead of many, and the MCU — the most supply-volatile part in the module —
// is isolated to a small board that can be re-spun without touching a 6-layer power PCB.
//
// WHY ONE CARD PER MODULE (E40, directive 2026-09-08). The two-card split (AC-DC role + DC-DC
// role + inter-card UART) created its own problems: two brains per module with a link protocol
// between them, nine CAN nodes in a 120 kW cabinet, and a way/pin budget spent twice. The merged
// 30 kW single-brain fits the SAME GD32G553VET6 with margin (see calculations/control/
// umod-pinmap.mts — 73 pins used of 82 usable, 22 analog, all nine PWMs on HRTIMER units), so the
// second card bought nothing physics demanded. The card seats in the DC-DC slot — the LLC fast
// loops, S/P relays, HMI and CAN stay local — and the PFC bundle (3× 50 kHz logic-level PWM,
// 12 senses, enables) crosses the 40-way inter-board harness.
//
// WHY NOT 60/120 kW ON ONE BRAIN. A 60 kW two-lane machine needs 18 PWM / ~30 analog — past this
// card on both counts — and 120 kW fails earlier still (board fabrication, magnetics, protection
// wire-length). Higher ratings are cabinets of 30 kW modules; the CSU is this same card strapped
// into its third identity. docs/control-card-scope.md carries the arithmetic.
import { UMOD_WAYS, UMOD_MODULE_NETS, UMOD_MCU_PINS, UMOD_INTERNAL } from "./umod-map.gen";

export const CARD_SCOPE = ["30kw"] as const;   // the module rating this card controls alone
export const CARD_WAYS = 88;                   // 2 x 44, 0.1 in, keyed — 86 used + 2 spare

export const CARD_SIGNALS = {
  pwm: 12,     // ways PWM0..11; the module role drives 9 (3 LLC pairs + 3 PFC singles), 3 spare
  analog: 22,  // AIN0..12 + ANA13..19 + TSNS0..1 — local fast loops keep the rank-0 ADC pins
  dout: 11, din: 9, safety: 6, can: 2, hmi: 7, rating: 1,
} as const;

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
  // Identity is ONE resistor code on an ADC pin — no build variants, no slot strap:
  //   0 R -> 30 kW module controller · 3.32 k (~0.82 V) -> cabinet CSU · open -> no host, fault
  "RATING strap: 0R = module, 3.32k = CSU, open = fault (E24 rev D)",
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
  throw new Error(
    `cardMap: role "${role}" retired by E40 — the module is single-brain (roles: "module" | "card"). ` +
    `The acdc/dcdc split cards and their LINK protocol no longer exist.`);
};

// THE MCU PIN MAP — GD32G553VET6, LQFP-100. GENERATED (umod-pinmap.mts); every kept way keeps its
// E35 sheet-audited pin, every extension sits on a documented-capability donor pin (R3 rule).
export const CARD_MCU_PINS: Record<string, number> = UMOD_MCU_PINS;

// MCU pins that never reach the connector: the watchdog kick, boot strap and debug port live on
// the card with the SWD header.
export const CARD_INTERNAL: Record<string, [number, string]> = {
  WDI: [UMOD_INTERNAL.WDI, "net.WDI"],
  BOOT0: [UMOD_INTERNAL.BOOT0, "net.BOOT0_CARD"],
  SWDIO: [UMOD_INTERNAL.SWDIO, "net.SWDIO_CARD"],
  SWCLK: [UMOD_INTERNAL.SWCLK, "net.SWCLK_CARD"],
};

// Connector ways generated by hardware ON the card (safety-AND outputs), with no MCU pin by design.
export const CARD_NO_MCU_PIN = ["GATE_EN", "GATE_EN_A"] as const;

// E35 HRTIMER pairing, retained as the normative PWM electrical contract (unchanged pins):
//   LLC legs = complementary pairs on ST0..ST2 (H = PWM0/1/2 ways, L = PWM6/7/8 ways)
//   PFC phases = single-ended on ST3..ST5 CH0 (PWM3/4/5 ways) — one HRTIMER fault gates all nine.
export const CARD_PWM_CONTRACT = {
  llc: [["PWM0", "PWM6"], ["PWM1", "PWM7"], ["PWM2", "PWM8"]],
  pfc: ["PWM3", "PWM4", "PWM5"],
  spare: ["PWM9", "PWM10", "PWM11"],
} as const;
