#!/usr/bin/env node
// port-pin-audit.mjs — E80 gate: the GD32G553 port's pin table (firmware/port/gd32g553/board.h) must agree with the card
// authority (packages/common-components/umod-map.gen.ts) net by net. The port claims PORT/PIN per net; this script maps
// PORT/PIN → LQFP100 pin number (datasheet Table 2-4, the facts-system §10 extraction) and diffs against UMOD_MCU_PINS +
// UMOD_MODULE_NETS. Any drift between the card generator and the firmware port fails the build.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UMOD_MCU_PINS, UMOD_MODULE_NETS, UMOD_INTERNAL } from "../../packages/common-components/umod-map.gen.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const boardH = readFileSync(join(ROOT, "firmware/port/gd32g553/board.h"), "utf8");

// LQFP100: "P<port><pin>" → package pin (datasheet Table 2-4; the rows this design touches)
const LQ = {
  PE2: 1, PE3: 2, PE4: 3, PE5: 4, PE6: 5, PC13: 7, PF9: 10, PF10: 11, PF0: 12, PF1: 13, PG10: 14,
  PC0: 15, PC1: 16, PC2: 17, PC3: 18, PF2: 19, PA0: 20, PA1: 21, PA2: 22, PA3: 25, PA4: 26, PA5: 27,
  PA6: 28, PA7: 29, PC4: 30, PC5: 31, PB0: 32, PB1: 33, PB2: 34, PE7: 38, PE8: 39, PE9: 40, PE10: 41,
  PE11: 42, PE12: 43, PE13: 44, PE14: 45, PE15: 46, PB10: 47, PB11: 50, PB12: 51, PB13: 52, PB14: 53,
  PB15: 54, PD8: 55, PD9: 56, PD10: 57, PD11: 58, PD12: 59, PD13: 60, PD14: 61, PD15: 62, PC6: 65,
  PC7: 66, PC8: 67, PC9: 68, PA8: 69, PA9: 70, PA10: 71, PA11: 72, PA12: 73, PA13: 76, PA14: 77,
  PA15: 78, PC10: 79, PC11: 80, PC12: 81, PD0: 82, PD1: 83, PD2: 84, PD3: 85, PD4: 86, PD5: 87,
  PD6: 88, PD7: 89, PB3: 90, PB4: 91, PB5: 92, PB6: 93, PB7: 94, PB8: 95, PB9: 96, PE0: 97, PE1: 98,
};

// board.h BP_<name> → the module net the card generator uses (umod way → net)
const NET = {
  I_RES: "I_RES1", VOUT: "SNS_VOUT", I_B0: "I_B0", VAC2: "SNS_VAC2", T_INLET: "T_INLET", IOUT: "SNS_IOUT",
  VAC1: "SNS_VAC1", I_C0: "I_C0", I_A0: "I_A0", AVMID: "AVMID", IOUTN: "SNS_IOUTN", VBKB: "SNS_VBKB",
  VBKA: "SNS_VBKA", VMID: "SNS_VMID", V24: "SNS_V24", RATING: "RATING", VAC3: "SNS_VAC3", V15: "SNS_V15",
  T_PFC: "T_PFC", T_LLC: "T_LLC", T_XFMR: "T_XFMR", VBUS: "SNS_VBUSP",
  L1H: "PWM_L1H", L1L: "PWM_L1L", L2H: "PWM_L2H", L2L: "PWM_L2L",
  PWM_A0: "PWM_A0", PWM_B0: "PWM_B0", PWM_C0: "PWM_C0", FLT: "FLT",
  FAN1: "FAN_PWM1", FAN2: "FAN_PWM2", KSER: "CTL_KSER", KPARA: "CTL_KPARA", KPARB: "CTL_KPARB",
  KPRE: "CTL_KPRE", QDIS: "CTL_QDIS", QDISBK: "CTL_QDISBK", EN_PFC: "EN_PFC", EN_LLC: "EN_LLC",
  DRV_RDY: "DRV_RDY", RLY_FB: "RELAY_FB_KPRE", TACH1: "FAN_TACH1", TACH2: "FAN_TACH2", TACH3: "FAN_TACH3",
  TACH4: "FAN_TACH4", CAN_RX: "CAN_RX", CAN_TX: "CAN_TX",
  HMI_DAT: "HMI_DAT", HMI_CLK: "HMI_CLK", HMI_LAT: "HMI_LAT", HMI_DIG1: "HMI_DIG1", HMI_DIG2: "HMI_DIG2",
  BTN1: "BTN1", BTN2: "BTN2",
};
const INTERNAL_NET = { WDI: "WDI" };   // card-internal signals: LQFP pin from UMOD_INTERNAL

// net → LQFP pin per the card authority (way carries the net; UMOD_MCU_PINS[way] is the pin)
const authority = {};
for (const [way, net] of Object.entries(UMOD_MODULE_NETS)) if (net && UMOD_MCU_PINS[way] != null) authority[net] = UMOD_MCU_PINS[way];

let fails = 0;
const bad = (m) => { console.log(`FAIL ${m}`); fails++; };

// parse "#define BP_<NAME>  P<port>, <pin>"
const claims = {};
for (const m of boardH.matchAll(/#define BP_(\w+)\s+P([A-F]), (\d+)/g)) claims[m[1]] = `P${m[2]}${m[3]}`;
if (Object.keys(claims).length < 50) bad(`board.h parse: only ${Object.keys(claims).length} pins found`);

let checked = 0;
for (const [bp, pname] of Object.entries(claims)) {
  const lq = LQ[pname];
  if (lq == null) { bad(`${bp}: ${pname} is not in the LQFP100 table`); continue; }
  const net = NET[bp] ?? INTERNAL_NET[bp];
  if (!net) { bad(`${bp}: no net mapping in this audit — add it`); continue; }
  const want = INTERNAL_NET[bp] ? UMOD_INTERNAL[net] : authority[net];
  if (want == null) { bad(`${bp}: the card authority carries no pin for net ${net}`); continue; }
  if (want !== lq) bad(`${bp} (${net}): port says ${pname} = LQFP ${lq}, umod-map says LQFP ${want}`);
  checked++;
}
// and the reverse: every card net with an MCU pin must be claimed by the port (except spares/null nets)
const claimedNets = new Set(Object.values(NET));
for (const [net, pin] of Object.entries(authority))
  if (!claimedNets.has(net)) bad(`card net ${net} (LQFP ${pin}) has no port claim`);

console.log(`port-pin-audit: ${checked} pins agree with umod-map.gen.ts${fails ? "" : " — PORT PIN TABLE CLEAN"}`);
process.exit(fails ? 1 : 0);
