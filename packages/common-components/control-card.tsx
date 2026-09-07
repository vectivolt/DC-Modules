// control-card.tsx — ONE control card. Both roles, all three ratings, one part number.
//
// The card plugs into either power board like a memory module. Saving board area is NOT the reason:
// the control cells are 9 cm2 on the AC-DC board and 18 cm2 on the DC-DC, about 1-3 % of component
// area. What it actually buys:
//
//   1. The control electronics leave the power/EMI environment. On the power boards these cells
//      must be kept 12 mm from every dv/dt node and 10 mm from every magnetic; on a card they are
//      simply somewhere else, behind a connector.
//   2. ONE part number instead of six -- built, qualified and stocked once for AC-DC and DC-DC at
//      30, 60 and 120 kW.
//   3. The MCU, the most supply-volatile part in the module, is isolated to a small board that can
//      be re-spun without touching a 6-layer 440 x 500 power PCB.
//
// SIZING IT HONESTLY. The card must fit the WORST case, which is the 120 kW DC-DC board, not the
// 30 kW one it will most often sit in. Measured signal counts from the built netlists:
//
//            AC-DC   DC-DC
//    30 kW      29      38
//    60 kW      35      47
//   120 kW      51      65     <- sizes the connector
//
// The two roles overlap heavily and are mutually exclusive in the places they differ -- the AC-DC
// slot uses fan channels the DC-DC slot does not, the DC-DC slot uses S/P relay drives and CAN the
// AC-DC slot does not -- so those pins are SHARED and reassigned by firmware from the ROLE straps.
// That is what keeps one pinout viable across both:
//
//   24  PWM          12 Vienna phases (AC-DC 120 kW) or 12 LLC legs x H/L (DC-DC 120 kW)
//   19  analogue in  12 current transformers + 7 voltage senses, whichever role
//    2  temperature
//    7  digital out  fans + precharge + discharge (AC-DC) OR the S/P relay set (DC-DC)
//    6  digital in   tach + relay mirror (AC-DC) OR relay mirror x6 (DC-DC)
//    2  link         inter-board TX/RX
//    5  safety       enable, watchdog, gate-enable, fault
//    2  CAN          DC-DC slot only; idle in the AC-DC slot
//    2  ROLE         strapped ON THE POWER BOARD, so one card suits any slot with no build variant
//   -- 69 signals, plus 12 power and return ways = 81. An 88-way (2 x 44) connector carries it
//      with 7 spare; at 30 kW roughly half the ways are simply unused, which is the price of one
//      card instead of six and is far cheaper than a second part number.
export const CARD_SIGNALS = {
  pwm: 24, ain: 19, temp: 2, dout: 7, din: 6, link: 2, safety: 5, can: 2, role: 2,
  power: ["V24", "V24", "V15", "V15", "V3P3", "DGND", "DGND", "DGND", "DGND", "AGND", "AGND", "PE"],
} as const;
export const CARD_WAYS = 88;                       // 2 x 44, 0.1 in, keyed
export const CARD_ROLE = { acdc: [0, 0], dcdc: [0, 1] } as const;

// What each slot actually drives, so the power board straps ROLE and firmware maps the pins.
export const ROLE_MAP = {
  acdc: { pwm: "one per Vienna phase", dout: "fan PWM x4, precharge x2, discharge", din: "fan tach x4, relay mirror", can: "idle" },
  dcdc: { pwm: "per LLC leg, high and low", dout: "S/P relay set x7", din: "relay mirror x6", can: "active" },
} as const;
