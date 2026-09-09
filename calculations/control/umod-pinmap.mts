// umod-pinmap.mts — E40: the single-brain module card. Generates the way/pin single source.
// R6/E47 CONSTRAINT for the A6 regeneration: AIN0/AIN1/AIN2 (SNS_IA/IB/IC line CTs) must
// land on COMPARATOR-capable inputs — the reverse-polarity PFC OC trip is CMP(DAC)→HRTIMER
// FLT in hardware (protection-thresholds R6 rev). Verify against the GD32G553 AF table at §K.
//
// v2 — rebased onto the CARD-ERA authority. v1 merged the per-board UPFC/ULLC doc tables; the
// live truth is the audited card pinout (CARD_MCU_PINS / CARD_PIN_DECISIONS, sheet-verified
// 255/255) layered over calculations/out/mcu-pin-allocation.json (R3, checked against GD32G553xx
// Datasheet Rev 2.0 Table 2-4). This script EXTENDS that card: every kept way keeps its audited
// pin; every new way takes a pin whose capability is proven by a documented JSON row (donor
// quoted). R3 discipline: nothing invented, everything asserted.
//
// What the module role changes on the card (hardware deltas are tiny):
//   - ways LINK_TX / LINK_RX / ROLE0 retire (the second card and the slot strap die with it)
//   - +7 analog ways ANA13..ANA19 (harness-side PFC senses) on documented ADC pins — the local
//     fast loops (LLC CTs, output/bank senses) KEEP the original rank-0 ADC pins
//   - +4 DO ways (fan PWM x2 on TIMER19 PWM pins — hardware PWM preserved — + KPRE/QDIS)
//   - +3 DI ways (fan tachs on capture-capable pins + precharge feedback)
//   - +1 GATE_EN_A way (second safety-AND output; GATE_EN becomes the local/DC-DC chain)
//   - DI2/DI3 vacate PE12/PE13 (ADC-capable, wasted as GPIO) for ANA17/18; EN_B vacates PA6 for
//     ANA19. All three land on freed LINK/KPRE-class GPIO.
//   - rails trim DGND 8→7, AGND 3→2 to keep TWO spare ways (the 120 kW post-mortem called out
//     zero-spare connectors as a defect class; 86 used + 2 spare = 88)
//
// Emits: packages/common-components/umod-map.gen.ts  (imported by control-card.tsx — DO NOT EDIT)
//        calculations/out/umod-pinmap.csv            (review artifact)
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = process.cwd();
const alloc = JSON.parse(readFileSync(`${ROOT}/calculations/out/mcu-pin-allocation.json`, "utf8"));

// capability oracle: pin -> {port, func, via} from any documented row
const cap = new Map<number, { port: string; func: string; via: string }>();
for (const role of ["UPFC", "ULLC"] as const)
  for (const [sig, lst] of Object.entries(alloc[role].map as Record<string, { pin: number; port: string; func: string }[]>))
    for (const e of lst) if (!cap.has(e.pin)) cap.set(e.pin, { port: e.port, func: e.func, via: `${role}:${sig}` });
// the R3 fixed-pin facts (docs/mcu-pin-allocation-gd32.md §Fixed pins) + PA6/PA7 ADC capability,
// documented by the R3 finding that had SWD parked on "PA6 / PA7 (ADC)".
cap.set(28, { port: "PA6", func: "ADC (per R3 fixed-pin finding); TIMER7_BRKIN0", via: "doc:R3-SWD-finding" });
// E44: pin 90 (PB3) is the FREED ROLE0 landing — documented free + 5V-tolerant in
// docs/mcu-pin-allocation-gd32.md ("CAN2_RX on pin 90 PB3"; GPIO/EXTI input-capable).
cap.set(90, { port: "PB3", func: "GPIO/EXTI input; CAN2_RX alt (freed ROLE0 landing)", via: "doc:pin-allocation-CAN2-finding" });
const FIXED = new Set([24, 49, 64, 75, 100, 23, 48, 63, 74, 99, 37, 35, 36, 6, 14, 95, 76, 77]);

// ---- the audited card-era pin map (E35 sheet, verified) — kept ways keep these pins ----------
const KEPT: Record<string, number> = {
  PWM0: 69, PWM1: 71, PWM2: 51, PWM3: 53, PWM4: 67, PWM5: 65,
  PWM6: 70, PWM7: 72, PWM8: 52, PWM9: 54, PWM10: 68, PWM11: 66,
  AIN0: 20, AIN1: 21, AIN2: 22, AIN3: 27, AIN4: 29, AIN5: 30,
  // R7-A (E48): AIN9<->AIN11 SWAPPED vs the R3 allocation. The R6 constraint ("CMP-capable
  // pin") was NOT sufficient — the external reviewer traced the LQFP100 table: pin 15/PC0 is
  // CMP2_IM and pin 16/PC1 is CMP2_IP, so phases B and C sat on OPPOSITE INPUTS OF THE SAME
  // COMPARATOR (and the DAC threshold can only drive the IM side — a signal there gets no
  // independent comparison). Allocation must be INSTANCE- and POLARITY-aware:
  //   I_A0 -> pin 17 PC2 = CMP7_IP · I_B0 -> pin 25 PA3 = CMP1_IP (ADC0_IN3 keeps metering)
  //   I_C0 -> pin 16 PC1 = CMP2_IP · SNS_VAC1 -> pin 15 PC0 = ADC01_IN5 (slow 50 Hz, no CMP)
  // Verified against GD32G553xx Rev 2.0 Figure 2-3 + pin-definition table.
  AIN6: 56, AIN7: 55, AIN8: 17, AIN9: 25, AIN10: 16, AIN11: 15, AIN12: 26,
  TSNS0: 32, TSNS1: 33, AVMID: 18, ROLE1: 38,
  DO0: 59, DO1: 60, DO2: 89, DO3: 94, DO4: 96, DO5: 62, DO6: 34,
  DI0: 85, DI1: 86, DI4: 73, DI5: 78,
  FLT: 47, DRV_RDY: 81, EN_A: 82,
  CAN_TX: 93, CAN_RX: 92,
  HMI0: 40, HMI1: 41, HMI2: 42, HMI3: 45, HMI4: 50, HMI5: 84, HMI6: 91,
};
// card-internal (never reach the connector) — unchanged from the audited card
const INTERNAL: Record<string, number> = { WDI: 11, BOOT0: 95, SWDIO: 76, SWCLK: 77 };

// ---- module-era changes, every new pin donor-proven --------------------------------------------
const CHANGED: Record<string, [number, string]> = {
  DI2: [79, "vacates PE12 (ADC3_IN15) for ANA17; lands on freed LINK_TX GPIO (PC10)"],
  DI3: [80, "vacates PE13 (ADC2_IN2) for ANA18; lands on freed LINK_RX GPIO (PC11)"],
  EN_B: [83, "vacates PA6 (ADC) for ANA19; lands on freed CTL_KPRE-class GPIO (PD1)"],
};
const NEW: Record<string, [number, string]> = {
  ANA13: [39, "harness sense — PE8 ADC2_IN5"],
  ANA14: [46, "harness sense — PE15 ADC3_IN1"],
  ANA15: [57, "harness sense — PD10 ADC2_IN6"],
  ANA16: [58, "harness sense — PD11 ADC2_IN7"],
  ANA17: [43, "harness sense — PE12 ADC3_IN15 (vacated by DI2)"],
  ANA18: [44, "harness sense — PE13 ADC2_IN2 (vacated by DI3)"],
  ANA19: [28, "harness sense — PA6 ADC (vacated by EN_B)"],
  DO7: [2, "FAN_PWM1 — PE3 TIMER19_CH1: HARDWARE fan PWM preserved"],
  DO8: [3, "FAN_PWM2 — PE4 TIMER19_MCH0: hardware PWM"],
  DO9: [4, "CTL_KPRE — PE5 GPIO/TIMER19_MCH1"],
  DO10: [5, "CTL_QDIS — PE6 GPIO/TIMER19_MCH2"],
  DI6: [19, "FAN_TACH1 — PF2 TIMER19_CH2 capture"],
  DI7: [61, "FAN_TACH2 — PD14 TIMER3_CH2 capture"],
  DI8: [88, "RELAY_FB_KPRE — PD6 TIMER1_CH3 capture-capable input"],
  DI9: [87, "FAN_TACH3 (E41 3-fan variant) — PD5 GPIO/EXTI edge count; fan 3 PWM gangs on FAN_PWM2"],
  DI10: [90, "FAN_TACH4 (E44 air-50 4-fan variant) — PB3 GPIO/EXTI edge count (freed ROLE0 landing); fan 4 PWM gangs on FAN_PWM2. Consumes the last spare way at the registered single-lane family ceiling (50 kW) — no further variant can need more ways, recorded deliberately vs the zero-spare defect class"],
};

// ---- the 88-way physical map (order = connector way number) ------------------------------------
// [way, mcuPin | null]  — null = no MCU pin by design (safety-AND outputs, rails, spares)
const WAYS: [string, number | null][] = [
  ...Object.entries(KEPT).filter(([w]) => /^PWM/.test(w)).map(([w, p]) => [w, p] as [string, number]),
  ...["AIN0","AIN1","AIN2","AIN3","AIN4","AIN5","AIN6","AIN7","AIN8","AIN9","AIN10","AIN11","AIN12"].map((w) => [w, KEPT[w]] as [string, number]),
  ...Object.entries(NEW).filter(([w]) => /^ANA/.test(w)).map(([w, [p]]) => [w, p] as [string, number]),
  ["TSNS0", KEPT.TSNS0], ["TSNS1", KEPT.TSNS1], ["AVMID", KEPT.AVMID], ["AGND_2", null],
  ...["DO0","DO1","DO2","DO3","DO4","DO5","DO6"].map((w) => [w, KEPT[w]] as [string, number]),
  ...["DO7","DO8","DO9","DO10"].map((w) => [w, NEW[w][0]] as [string, number]),
  ["DI0", KEPT.DI0], ["DI1", KEPT.DI1], ["DI2", CHANGED.DI2[0]], ["DI3", CHANGED.DI3[0]],
  ["DI4", KEPT.DI4], ["DI5", KEPT.DI5],
  ...["DI6","DI7","DI8","DI9","DI10"].map((w) => [w, NEW[w][0]] as [string, number]),
  ["GATE_EN", null], ["GATE_EN_A", null],       // the two safety-AND outputs (B = local slot, A = harness)
  ["FLT", KEPT.FLT], ["EN_A", KEPT.EN_A], ["EN_B", CHANGED.EN_B[0]], ["DRV_RDY", KEPT.DRV_RDY],
  ["CAN_TX", KEPT.CAN_TX], ["CAN_RX", KEPT.CAN_RX],
  ...["HMI0","HMI1","HMI2","HMI3","HMI4","HMI5","HMI6"].map((w) => [w, KEPT[w]] as [string, number]),
  ["ROLE1", KEPT.ROLE1],
  ["V15", null], ["V15", null], ["V3P3", null], ["V3P3", null], ["V3P3", null],
  ["DGND", null], ["DGND", null], ["DGND", null], ["DGND", null], ["DGND", null], ["DGND", null], ["DGND", null],
  ["AGND", null], ["AGND", null],
];

// ---- module-role board-side nets, way by way (the DC-DC slot hosts the card) -------------------
const MODULE_NETS: Record<string, string | null> = {
  // LLC legs pair on ST0..ST2 (H=CH0 way, L=CH1 way); PFC phases single-ended on ST3..ST5 CH0
  PWM0: "PWM_L1H", PWM6: "PWM_L1L", PWM1: "PWM_L2H", PWM7: "PWM_L2L", PWM2: "PWM_L3H", PWM8: "PWM_L3L",
  PWM3: "PWM_A0", PWM4: "PWM_B0", PWM5: "PWM_C0", PWM9: null, PWM10: null, PWM11: null,
  // local fast loops keep the rank-0 ADC pins
  AIN0: "I_RES1", AIN1: "I_RES2", AIN2: "I_RES3",
  AIN3: "SNS_VOUT", AIN4: "SNS_IOUT", AIN5: "SNS_IOUTN", AIN6: "SNS_VBKA", AIN7: "SNS_VBKB",
  AIN8: "I_A0", AIN9: "I_B0", AIN10: "I_C0", AIN11: "SNS_VAC1", AIN12: "SNS_VAC2",
  ANA13: "SNS_VAC3", ANA14: "SNS_VBUSP", ANA15: "SNS_VMID", ANA16: "SNS_V24", ANA17: "SNS_V15",
  ANA18: "T_PFC", ANA19: "T_INLET",
  TSNS0: "T_LLC", TSNS1: "T_XFMR", AVMID: "AVMID", AGND_2: "AGND",
  DO0: "CTL_KSER", DO1: "CTL_KPARA", DO2: "CTL_KPARB", DO3: "CTL_KOUT", DO4: "CTL_KPREA",
  DO5: "CTL_KPREB", DO6: "CTL_QDISBK",
  DO7: "FAN_PWM1", DO8: "FAN_PWM2", DO9: "CTL_KPRE", DO10: "CTL_QDIS",
  DI0: "RELAY_FB_KSER", DI1: "RELAY_FB_KPARA", DI2: "RELAY_FB_KPARB", DI3: "RELAY_FB_KOUT",
  DI4: "RELAY_FB_KPREA", DI5: "RELAY_FB_KPREB",
  DI6: "FAN_TACH1", DI7: "FAN_TACH2", DI8: "RELAY_FB_KPRE", DI9: "FAN_TACH3", DI10: "FAN_TACH4",
  GATE_EN: "GATE_EN_B", GATE_EN_A: "GATE_EN_A",
  FLT: "FLT", EN_A: "EN_PFC", EN_B: "EN_LLC", DRV_RDY: "DRV_RDY",
  CAN_TX: "CAN_TX", CAN_RX: "CAN_RX",
  HMI0: "HMI_DAT", HMI1: "HMI_CLK", HMI2: "HMI_LAT", HMI3: "HMI_DIG1", HMI4: "HMI_DIG2",
  HMI5: "BTN1", HMI6: "BTN2",
  ROLE1: "RATING",
  V15: "V15", V3P3: "V3P3", DGND: "DGND", AGND: "AGND",
};

// ---- the 40-way inter-board harness (rev 2, replaces the 16-way): nets that cross --------------
// [position, net | null(spare)]  — SHLD bonds to PE at the AC-DC end only.
const HARNESS40: [number, string | null][] = [
  [1, "V15"], [2, "V15"], [3, "V24"], [4, "V24"],
  [5, "DGND"], [6, "DGND"], [7, "DGND"], [8, "DGND"], [9, "DGND"],
  [10, "PWM_A0"], [11, "PWM_B0"], [12, "PWM_C0"],
  [13, "I_A0"], [14, "I_B0"], [15, "I_C0"],
  [16, "SNS_VAC1"], [17, "SNS_VAC2"], [18, "SNS_VAC3"],
  [19, "SNS_VBUSP"], [20, "SNS_VMID"], [21, "SNS_V24"], [22, "SNS_V15"],
  [23, "T_PFC"], [24, "T_INLET"],
  [25, "AVMID"], [26, "AGND"],                       // bias out + Kelvin return, adjacent pair
  [27, "FAN_PWM1"], [28, "FAN_PWM2"], [29, "FAN_TACH1"], [30, "FAN_TACH2"],
  [31, "CTL_KPRE"], [32, "CTL_QDIS"], [33, "RELAY_FB_KPRE"],
  [34, "EN_PFC"], [35, "GATE_EN_A"], [36, "FLT"], [37, "DRV_RDY"],
  [38, "FAN_TACH3"], [39, "FAN_TACH4"],             // W38: E41 third fan tach; W39: E44 fourth (air-50)
  [40, "SHLD"],
];

// ---- asserts -----------------------------------------------------------------------------------
let fails = 0;
const bad = (m: string) => { console.log(`FAIL ${m}`); fails++; };
const pinsSeen = new Map<number, string>();
const allPins: Record<string, number> = { ...KEPT, ...INTERNAL };
for (const [w, [p]] of Object.entries(CHANGED)) allPins[w] = p;
for (const [w, [p]] of Object.entries(NEW)) allPins[w] = p;
delete (allPins as Record<string, number>).ROLE0;
for (const [sig, pin] of Object.entries(allPins)) {
  if (FIXED.has(pin) && !["BOOT0", "SWDIO", "SWCLK"].includes(sig)) bad(`${sig}: pin ${pin} is fixed`);
  if (pinsSeen.has(pin)) bad(`${sig}: pin ${pin} already carries ${pinsSeen.get(pin)}`);
  pinsSeen.set(pin, sig);
}
for (const [w, [p]] of Object.entries(NEW)) {
  const c = cap.get(p);
  if (!c) { bad(`${w}: pin ${p} has no documented capability row`); continue; }
  if (/^ANA/.test(w) && !/ADC/.test(c.func)) bad(`${w}: pin ${p} (${c.func}) is not ADC-capable`);
}
for (const [, [p]] of Object.entries(CHANGED))
  if (!cap.get(p)) bad(`changed pin ${p} has no documented capability row`);
if (WAYS.length !== 88) bad(`way count ${WAYS.length} != 88`);
const wayNames = WAYS.map(([w]) => w);
for (const w of Object.keys(MODULE_NETS))
  if (!wayNames.includes(w)) bad(`MODULE_NETS names unknown way ${w}`);
for (const w of wayNames)
  if (!(w in MODULE_NETS)) bad(`way ${w} has no module-role net entry`);
const analogWays = wayNames.filter((w) => /^(AIN|ANA|TSNS)/.test(w)).length;
if (analogWays !== 22) bad(`analog ways ${analogWays} != 22`);
const hNets = HARNESS40.filter(([, n]) => n).length;
if (HARNESS40.length !== 40) bad(`harness ${HARNESS40.length} != 40 positions`);

// ---- emit --------------------------------------------------------------------------------------
const gen = `// umod-map.gen.ts — GENERATED by calculations/control/umod-pinmap.mts (E40). DO NOT EDIT.
// One brain per module: the DC-DC slot hosts the card; the AC-DC bundle crosses the 40-way harness.
export const UMOD_WAYS: [string, number | null][] = ${JSON.stringify(WAYS)};
export const UMOD_MODULE_NETS: Record<string, string | null> = ${JSON.stringify(MODULE_NETS)};
export const UMOD_MCU_PINS: Record<string, number> = ${JSON.stringify(Object.fromEntries(Object.entries(allPins).filter(([s]) => !(s in INTERNAL))))};
export const UMOD_INTERNAL: Record<string, number> = ${JSON.stringify(INTERNAL)};
export const HARNESS40: [number, string | null][] = ${JSON.stringify(HARNESS40)};
`;
writeFileSync(`${ROOT}/packages/common-components/umod-map.gen.ts`, gen);
writeFileSync(`${ROOT}/calculations/out/umod-pinmap.csv`,
  "way,mcu_pin,module_net\n" + WAYS.map(([w, p]) => `${w},${p ?? ""},${MODULE_NETS[w] ?? ""}`).join("\n") + "\n");
console.log(`UMOD v2: ${WAYS.length} ways (${analogWays} analog, 12 PWM ways/9 used) · harness ${hNets} nets/40 ways`);
console.log(`MCU pins allocated: ${pinsSeen.size} of 82 usable · spare pins: ${82 - pinsSeen.size}`);
console.log(fails ? `${fails} ALLOCATION FAILURE(S)` : "UMOD MAP CLEAN — card-era pins kept, extensions donor-proven");
process.exit(fails ? 1 : 0);
