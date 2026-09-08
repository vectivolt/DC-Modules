// control-card.tsx — ONE control card: both converter roles, 30 and 60 kW, one part number.
//
// WHY A CARD. Not to save board area: the control cells measure 9 cm2 on the AC-DC board and
// 18 cm2 on the DC-DC, 1-3 % of component area. What it buys is (a) the control electronics leave
// the power/EMI environment, (b) one part number instead of six, (c) the MCU -- the most
// supply-volatile part in the module -- is isolated to a small board that can be re-spun without
// touching a 6-layer power PCB.
//
// WHY 30/60 kW AND NOT 120. A first cut tried to cover 120 kW too. Four independent adversarial
// reviews all rejected it, and for the same underlying reason rather than four different ones:
//
//   - the connector came out exactly 100/100 ways with zero spare
//   - both roles consumed every one of AIN0..AIN18, so there was no analogue headroom at all
//   - one T_PFC thermistor would serve 12 Vienna legs, and one FLT line 12 wired-OR driver faults
//   - PWM0..11 would have to be 12 INDEPENDENT timer channels in the AC-DC role and simultaneously
//     the H half of 12 COMPLEMENTARY pairs in the DC-DC role, on an already-saturated LQFP-100
//
// 120 kW was already established as not being a single module -- five independent measurements say
// so (secondary rail 234 %, 902 mm of board depth, over a standard fab panel, 560 mm of front face
// needed for 440, and 9.4 m/s of exhaust velocity). It is 2 x 60 kW or 4 x 30 kW in a cabinet. So
// the card only ever serves 30 and 60 kW, and at that scope it fits with room:
//
//        role          signals
//   30 kW AC-DC            33
//   30 kW DC-DC            45
//   60 kW AC-DC            39
//   60 kW DC-DC            54   <- sizes the card
//   superset (emitted)     59 signal + 17 power/return (incl. AGND_2, AVMID's Kelvin) = 76 of 88, 12 spare
export const CARD_SCOPE = ["30kw", "60kw"] as const;   // 120 kW is a multi-module cabinet
export const CARD_WAYS = 88;                            // 2 x 44, 0.1 in, keyed

// Signal groups. Where the two roles differ they are MUTUALLY EXCLUSIVE, so the pin is shared and
// firmware reassigns it from the ROLE straps: the AC-DC slot drives fans the DC-DC slot does not,
// the DC-DC slot drives the S/P relays, CAN and HMI the AC-DC slot does not.
export const CARD_SIGNALS = {
  pwm: 12,   // 6 Vienna phases (AC-DC 60 kW) or 6 LLC legs x H/L (DC-DC 60 kW)
  ain: 13,   // 6 current transformers + 7 voltage senses, whichever role
  temp: 2, avmid: 1, dout: 7, din: 6, safety: 5, link: 2, can: 2, hmi: 7, role: 2,
} as const;

// MANDATORY board-side obligations. Every one of these came out of the adversarial review and is
// a safety or correctness requirement, not a preference.
export const CARD_RULES = [
  // A card can be absent, unpowered, or seated but not yet booted. Nothing may be enabled in any
  // of those states, so the DEFAULT-OFF state is held by the POWER BOARD, not by the card.
  "board-side pull-downs on GATE_EN, EN_A, EN_B and all seven DO relay lines",
  // The AGND-to-DGND single-point tie moves ONTO the card. Leaving RAGTA or RAGTB populated on a
  // power board puts a second tie in parallel and creates exactly the ground loop it exists to
  // prevent -- so both must be deleted, not merely depopulated.
  "delete RAGTA and RAGTB from the power boards; the single-point tie lives on the card",
  // AVMID biases up to 6 sense networks on the far side of a connector. One way out and no return
  // reference makes the divider's mid-rail a function of connector drop.
  "AVMID gets its own Kelvin return way (AGND_2) alongside it",
  // The fault line is safety-critical and its pull-up sets the wired-OR's idle state. Splitting
  // pull-up and filter across the connector changes the fault timing.
  "FLT pull-up and filter stay TOGETHER, on the card, at the MCU end",
  // Rating is not deducible from role, and the card must not need a build variant per rating.
  "ROLE0 = role strap; ROLE1 = rating resistor code (0R = 30 kW, 10k = 60 kW) read on an ADC pin",
] as const;

export const CARD_ROLE = { acdc: [0, 0], dcdc: [1, 0] } as const;

// ---------------------------------------------------------------------------------------------
// THE PIN MAP. One function generates it for either slot, so the two sides of the connector can
// never drift: the power board calls it with its own role and lane count, the card calls it to
// know what each way carries. Unused ways come back null and are simply not traced -- that is what
// lets one pinout serve both roles.
export const cardMap = (role, lanes = 1) => {
  // The CARD side is role-agnostic: every way carries the generic net of the same name, and the
  // role mapping happens on the power-board side. Without this branch the card would silently wire
  // itself to one role's net names and only work in one slot.
  if (role === "card") {
    // Derived from the SIZING role -- 60 kW DC-DC, the configuration this card is built to cover
    // (54 signals; see the table above). This used to read lanes=4, a 120 kW map, and only worked
    // because every way group is a fixed-length loop so the way NAMES do not vary with lane count.
    // It was deriving the card's own pinout from a configuration the card cannot serve.
    const generic = cardMap("dcdc", 2).map(([p]) => p);
    // AGND_2 is AVMID's Kelvin RETURN: on the card it must land on the card's AGND at the
    // buffer's ground (module-interconnect audit: a literal net.AGND_2 touched nothing on the
    // card — a dead way pretending to be a Kelvin). The Kelvin property is a routing rule
    // (single tie at the AnalogMid ground), recorded in CARD_RULES; netlist-wise it is AGND.
    return generic.map((p) => [p, p === "AGND_2" ? "net.AGND" : `net.${p}`]);
  }
  const ac = role === "acdc";
  const ph = Array.from({ length: lanes * 3 }, (_, i) =>
    `${["A", "B", "C"][i % 3]}${Math.floor(i / 3)}`);          // A0,B0,C0,A1,...
  const legs = Array.from({ length: lanes * 3 }, (_, i) => i + 1);

  // SCOPE GUARD. Without this the map does not run short at 4 lanes -- it silently TRUNCATES,
  // because every group below is a fixed-length `for` loop over a longer source array. At 120 kW
  // that produced 12 high-side gate signals and ZERO low-side (every LLC leg with a floating
  // bottom switch), and dropped SNS_VBUSP, SNS_VMID, SNS_IOUT and two of the three mains phase
  // senses -- the bus regulation, the Vienna midpoint balance and the output current loop. Every
  // one of those is a plausible-looking netlist that builds, exports, and does not work.
  // Refusing is the only safe behaviour: this card is a 30/60 kW part (see CARD_SCOPE).
  const needPwm = ac ? ph.length : legs.length * 2;
  const needAin = ph.length + 5;
  if (needPwm > CARD_SIGNALS.pwm || needAin > CARD_SIGNALS.ain) {
    const short = [
      needPwm > CARD_SIGNALS.pwm ? `PWM needs ${needPwm}, card has ${CARD_SIGNALS.pwm}` : null,
      needAin > CARD_SIGNALS.ain ? `AIN needs ${needAin}, card has ${CARD_SIGNALS.ain}` : null,
    ].filter(Boolean).join("; ");
    throw new Error(
      `control card is out of scope for ${lanes} lane(s) (${lanes * 3} ${ac ? "Vienna phases" : "LLC legs"}): ${short}. ` +
      `CARD_SCOPE is ${CARD_SCOPE.join("/")} -- higher ratings are multi-module cabinets, not one board pair.`);
  }
  const nFans = lanes === 4 ? 4 : 2;
  const m = [];
  const put = (pin, net) => m.push([pin, net ?? null]);

  // gate drive: one channel per Vienna phase, or a complementary pair per LLC leg
  for (let i = 0; i < 12; i++)
    put(`PWM${i}`, ac
      ? (ph[i] ? `net.PWM_${ph[i]}` : null)
      : (i < legs.length ? `net.PWM_L${legs[i]}H` : legs[i - 6] ? `net.PWM_L${legs[i - 6]}L` : null));
  // analogue: current transformers first, then the voltage/current senses
  const acAin = [...ph.map((p) => `net.I_${p}`), "net.SNS_VAC1", "net.SNS_VAC2", "net.SNS_VAC3",
                 "net.SNS_VBUSP", "net.SNS_VMID"];
  const dcAin = [...legs.map((l) => `net.I_RES${l}`), "net.SNS_VBKA", "net.SNS_VBKB",
                 "net.SNS_VOUT", "net.SNS_IOUT", "net.SNS_IOUTN"];
  const ain = ac ? acAin : dcAin;
  for (let i = 0; i < 13; i++) put(`AIN${i}`, ain[i] ?? null);
  put("TSNS0", ac ? "net.T_PFC" : "net.T_LLC");
  put("TSNS1", ac ? "net.T_INLET" : "net.T_XFMR");
  put("AVMID", "net.AVMID");
  // CARD_RULES: AVMID's Kelvin return rides the adjacent way, so the mid-rail the sense networks
  // divide against is not a function of connector drop through the shared AGND returns.
  put("AGND_2", "net.AGND");
  // digital out: fans + precharge + discharge in the AC-DC slot, the S/P relay set in the DC-DC
  const acDo = [...Array.from({ length: nFans }, (_, i) => `net.FAN_PWM${i + 1}`),
                "net.CTL_KPRE", "net.CTL_QDIS"];
  const dcDo = ["net.CTL_KSER", "net.CTL_KPARA", "net.CTL_KPARB", "net.CTL_KOUT",
                "net.CTL_KPREA", "net.CTL_KPREB", "net.CTL_QDISBK"];
  for (let i = 0; i < 7; i++) put(`DO${i}`, (ac ? acDo : dcDo)[i] ?? null);
  const acDi = [...Array.from({ length: nFans }, (_, i) => `net.FAN_TACH${i + 1}`), "net.RELAY_FB_KPRE"];
  const dcDi = ["net.RELAY_FB_KSER", "net.RELAY_FB_KPARA", "net.RELAY_FB_KPARB",
                "net.RELAY_FB_KOUT", "net.RELAY_FB_KPREA", "net.RELAY_FB_KPREB"];
  for (let i = 0; i < 6; i++) put(`DI${i}`, (ac ? acDi : dcDi)[i] ?? null);
  // safety and identity
  put("GATE_EN", ac ? "net.GATE_EN_A" : "net.GATE_EN_B");
  put("FLT", ac ? "net.FLT_PFC" : "net.FLT_LLC");
  put("EN_A", "net.EN_PFC");
  put("EN_B", "net.EN_LLC");
  // WDI is NOT a connector way. The MCU kicks the supervisor and the supervisor drops GATE_EN;
  // both live on the card, and GATE_EN is what the power board actually needs to see. Exposing WDI
  // gave every power board a one-endpoint stub way that no audit could ever clear. See
  // CARD_INTERNAL below.
  put("DRV_RDY", "net.DRV_RDY");
  put("LINK_TX", "net.LINK_TX");
  put("LINK_RX", "net.LINK_RX");
  put("CAN_TX", ac ? null : "net.CAN_TX");
  put("CAN_RX", ac ? null : "net.CAN_RX");
  // The HMI block's own net names, in way order. These were `net.HMI0..6` -- names nothing on
  // the board ever used, so all seven ways arrived at a display block that was still waiting on
  // HMI_DAT/CLK/LAT and left BTN1/BTN2 with no path to the MCU at all.
  const hmiNets = ["net.HMI_DAT", "net.HMI_CLK", "net.HMI_LAT", "net.HMI_DIG1", "net.HMI_DIG2",
                   "net.BTN1", "net.BTN2"];
  for (let i = 0; i < 7; i++) put(`HMI${i}`, ac ? null : hmiNets[i]);
  // ROLE0 identifies the slot, ROLE1 is a rating resistor code read on an ADC pin
  put("ROLE0", ac ? "net.DGND" : null);
  put("ROLE1", "net.RATING");
  // power and return. AVMID gets AGND_2 beside it as its Kelvin return (CARD_RULES).
  // No V24 and no PE. The card's only input rail is V15 (Rail3V3 bucks it to 3V3, which the card
  // then exports); every 24 V load -- relay coils -- lives on the power boards and is fed from the
  // aux supply directly. PE had no consumer on the card either. Three ways that reached nothing.
  for (const p of ["V15", "V15", "V3P3", "V3P3", "V3P3",
                   "DGND", "DGND", "DGND", "DGND", "DGND", "DGND", "DGND", "DGND",
                   "AGND", "AGND", "AGND"]) put(p, `net.${p}`);
  return m;
};

// ---------------------------------------------------------------------------------------------
// THE MCU PIN MAP — GD32G553VET6, LQFP-100.
//
// GENERATED. Do not hand-edit: run `npx tsx calculations/card-pinmap-gen.mts` and paste. The
// source of truth is calculations/out/mcu-pin-allocation.json (the R3 allocation, checked against
// GD32G553xx Datasheet Rev 2.0 Table 2-4).
//
// This replaces a map derived from the PRE-SPLIT board netlists, which were themselves built on
// STM32G474 conventions. docs/assumptions.md A6 records what that cost: `FLT` on pin 74 (VSS) and
// BOOT0 on pin 100 (VDD) -- two hard shorts -- plus SWD on ADC pins and VDDA unconnected. The
// derived map reproduced the FLT-on-74 short exactly, because a netlist is a faithful record of a
// wrong decision.
//
// Two maps had to become one. UPFC and ULLC were allocated independently and disagree on 27 of the
// 29 signals they share, so the merge rule decides real capability:
//
//   SUPERSET RULE -- where the roles want different PERIPHERALS on a way, take the pin whose
//   peripheral is the superset. A timer pin falls back to plain GPIO; a plain GPIO never becomes a
//   capture input. Taking the DC-DC pin blindly would have cost the AC-DC role hardware fan PWM
//   (DO0/DO1) and hardware tach capture (DI0/DI1) -- four functions silently downgraded.
//   Otherwise the DC-DC pin wins: it is the sizing role (77 signals / 87 landings vs 61 / 69).
//
// GATE_EN has NO entry and that is correct: it is the safety AND gate's output, generated on the
// card and sent out. Firmware is not its author. See CARD_NO_MCU_PIN.
export const CARD_MCU_PINS: Record<string, number> = {
  // gate drive — ALL on the HRTIMER (decision 2026-09-08, audit F8 / scope §6): each LLC leg is
  //   one slave unit in complementary mode (H=CHx0, L=CHx1) → hardware dead-time per leg; the six
  //   Vienna phases take ST0..5 CH0 in the AC-DC role. The TIMER0/7/19 plan this replaces left
  //   4 of 12 legs without a hardware break input (PA6 one-AF conflict).
  PWM0: 69, PWM1: 71, PWM2: 51, PWM3: 53, PWM4: 67, PWM5: 65,
  PWM6: 70, PWM7: 72, PWM8: 52, PWM9: 54, PWM10: 68, PWM11: 66,
  // analogue — ADC pins. AIN11/AIN12 are expansion, unused at 30/60 kW
  AIN0: 20, AIN1: 21, AIN2: 22, AIN3: 27, AIN4: 29, AIN5: 30,
  AIN6: 56, AIN7: 55, AIN8: 17, AIN9: 15, AIN10: 16, AIN11: 25,
  AIN12: 26, TSNS0: 32, TSNS1: 33, AVMID: 18, ROLE1: 38,
  // digital out — relay drive (DC-DC) / fan PWM (AC-DC). DO0/DO1 keep TIMER3 channels so the
  //   AC-DC role gets HARDWARE fan PWM instead of bit-banging
  DO0: 59, DO1: 60, DO2: 89, DO3: 94, DO4: 96, DO5: 62,
  DO6: 34,
  // digital in — relay feedback (DC-DC) / fan tach (AC-DC). DI0/DI1 keep TIMER1 capture channels;
  //   DI2/DI3 displaced to plain GPIO by HRTIMER ST1 (they are slow relay-feedback reads)
  DI0: 85, DI1: 86, DI2: 43, DI3: 44, DI4: 73, DI5: 78,
  // safety + link. FLT = PB10/HRTIMER_FLT2 gates every PWM in hardware (24 ns); its 3.3 V
  //   wired-OR pull-up lives on the card (RFLTC), satisfying PB10's non-5VT rating by construction.
  FLT: 47, DRV_RDY: 81, EN_A: 82, EN_B: 28, LINK_TX: 87, LINK_RX: 88,
  CAN_TX: 93, CAN_RX: 92,
  // HMI — display shift register, digit drives, two buttons (HMI0..3 displaced to freed
  //   advanced-timer pins by the HRTIMER outputs)
  HMI0: 40, HMI1: 41, HMI2: 42, HMI3: 45, HMI4: 50, HMI5: 84,
  HMI6: 91,
  // identity straps
  ROLE0: 90,
};

// THE PIN DECISION (2026-09-08, audit E35 / scope §6) — single source of truth, imported by BOTH
// calculations/card-pinmap-gen.mts (which applies it) and card-pinmap-reconcile.mts (which shows
// its cost against the naive two-map merge). See the gen script for the full rationale block.
export const CARD_PIN_DECISIONS: Record<string, [number, string]> = {
  PWM0: [69, "PA8 HRTIMER_ST0CH0"], PWM6: [70, "PA9 HRTIMER_ST0CH1"],
  PWM1: [71, "PA10 HRTIMER_ST1CH0"], PWM7: [72, "PA11 HRTIMER_ST1CH1"],
  PWM2: [51, "PB12 HRTIMER_ST2CH0"], PWM8: [52, "PB13 HRTIMER_ST2CH1"],
  PWM3: [53, "PB14 HRTIMER_ST3CH0"], PWM9: [54, "PB15 HRTIMER_ST3CH1"],
  PWM4: [67, "PC8 HRTIMER_ST4CH0"], PWM10: [68, "PC9 HRTIMER_ST4CH1"],
  PWM5: [65, "PC6 HRTIMER_ST5CH0"], PWM11: [66, "PC7 HRTIMER_ST5CH1"],
  FLT: [47, "PB10 HRTIMER_FLT2 — 3.3 V wired-OR on card, non-5VT satisfied"],
  EN_B: [28, "PA6 GPIO input — vacated 47 for FLT"],
  DI2: [43, "PC5 GPIO — displaced by ST1CH0"], DI3: [44, "PB0 GPIO — displaced by ST1CH1"],
  HMI0: [40, "PC0 GPIO — displaced by ST3CH1"], HMI1: [41, "PC1 GPIO — displaced by ST2CH1"],
  HMI2: [42, "PC2 GPIO — displaced by ST2CH0"], HMI3: [45, "PB1 GPIO — displaced by ST3CH0"],
};

// MCU pins that deliberately never reach the connector: pin, and the card-local net it lands on.
// WDI runs from the MCU to the on-card supervisor -- the power board sees the supervisor's verdict
// on GATE_EN, not the kick. The debug and boot pins are datasheet-fixed and stay on the card with
// the SWD header. Every one of these was previously an MCU pin wired to NOTHING: the MCU had no
// BOOT0 strap (boot mode undefined) and no SWD (unprogrammable) after it moved onto the card.
//   WDI  takes the ULLC pin 11 (PF10), NOT the UPFC pin 84 (PD2) -- PD2 is HMI5/BTN1 on this card.
export const CARD_INTERNAL: Record<string, [number, string]> = {
  WDI:   [11, "net.WDI"],           // -> USUPCARD.WDI, the watchdog kick
  BOOT0: [95, "net.BOOT0_CARD"],    // PB8, sampled at reset; 10k pulldown in SwdPort
  SWDIO: [76, "net.SWDIO_CARD"],    // PA13, fixed
  SWCLK: [77, "net.SWCLK_CARD"],    // PA14, fixed
};

// Connector ways generated by hardware ON the card, with no MCU pin by design.
export const CARD_NO_MCU_PIN = ["GATE_EN"] as const;
