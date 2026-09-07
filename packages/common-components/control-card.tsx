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
//   superset (shared)      56   + 20 power/return = 76 of 88 ways, 12 spare
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
    const generic = cardMap("dcdc", 4).map(([p]) => p);
    return generic.map((p) => [p, `net.${p}`]);
  }
  const ac = role === "acdc";
  const ph = Array.from({ length: lanes * 3 }, (_, i) =>
    `${["A", "B", "C"][i % 3]}${Math.floor(i / 3)}`);          // A0,B0,C0,A1,...
  const legs = Array.from({ length: lanes * 3 }, (_, i) => i + 1);
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
  put("WDI", ac ? "net.WDI_PFC" : "net.WDI_LLC");
  put("LINK_TX", "net.LINK_TX");
  put("LINK_RX", "net.LINK_RX");
  put("CAN_TX", ac ? null : "net.CAN_TX");
  put("CAN_RX", ac ? null : "net.CAN_RX");
  for (let i = 0; i < 7; i++) put(`HMI${i}`, ac ? null : `net.HMI${i}`);
  // ROLE0 identifies the slot, ROLE1 is a rating resistor code read on an ADC pin
  put("ROLE0", ac ? "net.DGND" : null);
  put("ROLE1", "net.RATING");
  // power and return. AVMID gets AGND_2 beside it as its Kelvin return (CARD_RULES).
  for (const p of ["V24", "V24", "V15", "V15", "V3P3", "V3P3", "V3P3",
                   "DGND", "DGND", "DGND", "DGND", "DGND", "DGND", "DGND", "DGND",
                   "AGND", "AGND", "AGND", "PE"]) put(p, `net.${p}`);
  return m;
};
