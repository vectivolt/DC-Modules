// mcu-matrix.mjs — Phase 2 formal MCU resource matrix (§20, risk R3).
// Computes REQUIRED resources per SKU and compares against ASSUMED-AVAILABLE GD32G553 resources.
// PROVENANCE: HRTIMER and timer counts are CONFIRMED against GD32G553xx Datasheet Rev 2.0 (gate
// item A6, closed at R3 — docs/history/mcu-pin-allocation-gd32.md). The rest are still family-datasheet
// values as understood 2026-09.
// The pin-level table is NO LONGER STM32G474-derived: that assumption ("GD32G5 mirrors them") is
// what put FLT on pin 74 (VSS) and BOOT0 on pin 100 (VDD). The authoritative pin map is
// calculations/out/mcu-pin-allocation.json. No pin is reused (§20).
// Run: node calculations/control/mcu-matrix.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
mkdirSync(OUT, { recursive: true });

const AVAIL = { // ASSUMED — verify against GD32G553 datasheet (R9)
  // A6/R3: 8 slave units x 2 = 16 outputs, NOT the 6 units / 12 outputs previously assumed.
  // Note the units also matter, not just the outputs: a half-bridge leg driven as a COMPLEMENTARY
  // pair consumes one whole unit (the dead-time generator lives in the pair), so the LLC ceiling
  // is 8 legs by units before it is 16 outputs by channels.
  hrtimer_ch: 16, hrtimer_units: 8,
  adv_timer_ch: 8,     // spare advanced-timer channels for SR/aux PWM
  adc_units: 4, adc_ext_ch: 16, adc_ksps_per_unit: 4000e3 / 1e3, // ~4 MSPS/unit assumed
  comparators: 8, dac: 4, can: 2, usart: 5, spi: 3, gpio_lqfp100: 82,
};

const SKUS = [
  { name: "30kW", lanes: 1, ch: 1 },
  { name: "60kW", lanes: 2, ch: 2 },
  { name: "120kW", lanes: 4, ch: 4 },
];

const rows = [["sku","mcu","resource","required","available","margin","note"]];
const line = (s, m, res, req, av, note = "") => {
  rows.push([s, m, res, req, av, av - req, note]);
  const flag = av - req < 0 ? "  ✗ OVER" : av - req <= 1 ? "  ⚠ tight" : "";
  console.log(`${s.padEnd(7)} ${m.padEnd(8)} ${res.padEnd(26)} req=${String(req).padStart(3)}  avail=${String(av).padStart(3)}${flag} ${note}`);
};

for (const { name, lanes, ch } of SKUS) {
  // -------- MCU-PFC --------
  line(name, "PFC", "HRTIM PWM ch", 3 * lanes, AVAIL.hrtimer_ch, "1 PWM/phase (common-source pair) -- one OUTPUT each, so channels is the right limit here");
  line(name, "PFC", "ADC fast ch (I)", 3 * lanes, AVAIL.adc_units * 4, "per-lane phase currents, sampled every sw period");
  line(name, "PFC", "ADC slow ch (V+T)", 3 + 3 + 4, AVAIL.adc_ext_ch, "3 phase V, VBUS+/-/mid, 4 temps — sequencer-muxed");
  // sample-rate budget: each lane current at fsw (70 kHz) → 3*lanes*70k conversions/s
  const ksps = (3 * lanes * 70e3) / 1e3;
  line(name, "PFC", "ADC kSPS (I loops)", ksps, AVAIL.adc_units * AVAIL.adc_ksps_per_unit, "≥1 conv/ch/period @70 kHz");
  line(name, "PFC", "Comparators (OC+OVP)", lanes + 2, AVAIL.comparators, "1 lane-OC (3φ OR-ed ext.) + bus OVP + midpoint");
  line(name, "PFC", "DAC (thresholds)", 2, AVAIL.dac);
  line(name, "PFC", "Relay/fan/misc GPIO", 8, 20, "precharge, discharge, 2 fan PWM, 2 tach, kill, LED");
  // -------- MCU-LLC --------
  // Legs against UNITS, not outputs: one complementary pair = one slave unit (the dead-time
  // generator lives in the pair), so the ceiling is 8 legs even though there are 16 channels.
  // Comparing 12 legs against 16 channels reported 120 kW as fitting when it does not.
  line(name, "LLC", "HRTIM units (legs)", 3 * ch, AVAIL.hrtimer_units, "1 slave unit per half-bridge leg, complementary CH0/CH1 with hardware dead-time");
  line(name, "LLC", "HRTIM outputs (H+L)", 6 * ch, AVAIL.hrtimer_ch, "two gate signals per leg");
  line(name, "LLC", "SR PWM ch (if SR)", 4 * ch, AVAIL.adv_timer_ch, ch > 2 ? "SR NOT timer-driven at 120 kW → SR controller ICs or JBS (Phase 7)" : "");
  line(name, "LLC", "ADC fast ch (Ires)", ch, AVAIL.adc_units * 4, "1 protection-grade resonant I per channel (per-leg via ext. OR)");
  line(name, "LLC", "ADC slow ch", 2 + 2 + 4, AVAIL.adc_ext_ch, "Vout, Iout, VbankA/B, temps");
  line(name, "LLC", "Comparators", ch + 2, AVAIL.comparators, "per-channel resonant OC + output OVP + spare");
  line(name, "LLC", "CAN", 2, AVAIL.can, "1 ext isolated CAN2.0B + 1 internal link (CAN-FD internal)");
  line(name, "LLC", "Relay drives + readback", 5 + 3, 20, "K_SER, K_PAR_A/B, precharge, discharge + 3 sense");
  console.log("");
}
writeFileSync(join(OUT, "mcu-matrix.csv"), rows.map(r => r.join(",")).join("\n") + "\n");

// Pin-level assignment table — rev D (2026-09-05): regenerated to mirror the boards.tsx numeric
// maps (the §20 build-asserted artifact), which are the authority. Numbers are SYMBOLIC on
// G474-style conventions pending A6 closure against the real GD32G553VET6 datasheet — the
// assertUniquePins reserved list [10,11,14,19,20,26,27,28,29,100] and every number below MUST be
// regenerated at A6 (real VDD/VSS sit at 49/50, 74/75, 99 on some LQFP100 parts). The pre-rev-D
// version of this table (PA-port conventions, shunt+NSI1200 phase sensing, PA14/15 link = SWD
// pins, PA11 CAN conflict) predated E18/E25/rev C-D and was retired as misleading.
const pins = [
  ["mcu","signal","pin(symbolic)","dir","notes"],
  ["PFC","PWM_<phase> (A0 B0 C0 A1 ...)","55+i (55-66 @120kW)","out","HRTIM; one PWM per Vienna phase (E4)"],
  ["PFC","I_<phase> line CT","30+i (30-41 @120kW)","in","AVMID-biased burden 33R 1:2500 (E18/CB-15)"],
  ["PFC","SNS_VAC1..3","43-45","in","AMC1350-class iso amps vs artificial star (E25)"],
  ["PFC","SNS_VBUSP / SNS_VMID","46 / 47","in","AMC1311-class 0-2V; 1nF fast filter (F.03 - MR-18)"],
  ["PFC","T_PFC / T_INLET","48 / 49","in","NTC (inlet read here only; shared over link - MR-2)"],
  ["PFC","RELAY_FB_KPRE","50","in","KPRE1+KPRE2 series mirrors (high = both mains open)"],
  ["PFC","SNS_V24 / SNS_V15","51 / 52","in","rail monitors /7.8 and /5.7 (rev D)"],
  ["PFC","LINK_TX / LINK_RX","68 / 69","io","internal UART CRC16+seq"],
  ["PFC","WDI_PFC / EN_PFC","70 / 71","out","E27 chain (WD kick; enable into both SafetyChains)"],
  ["PFC","CTL_KPRE / CTL_QDIS","72 / 73","out","ULN in1; bus-discharge opto LED (default-OFF E19revB)"],
  ["PFC","FLT_PFC","74","in","driver FLT wire-OR (4.7k pullup)"],
  ["PFC","FAN_PWM/TACH 1-2","76-79","io","all SKUs"],
  ["PFC","FAN_PWM/TACH 3-4","80-83","io","120 kW only (HR-17)"],
  ["PFC","(structural) VDD/VSS 10 11 26 27 · NRST 14 · VDDA 19 20 · SWD 28 29 · BOOT0 100","-","-","reserved in assertUniquePins"],
  ["LLC","PWM_L<n>H / PWM_L<n>L","50+2i / 51+2i (50-73 @120kW)","out","HRTIM complementary pairs"],
  ["LLC","I_RES<n> resonant CT","30+i (30-41 @120kW)","in","AVMID-biased burden 2.0R 1:100 (CB-16)"],
  ["LLC","T_LLC / T_XFMR","42 / 43","in","NTC"],
  ["LLC","LINK_TX / LINK_RX","44 / 45","io","crossed to harness on this side (CB-14)"],
  ["LLC","WDI_LLC / EN_LLC","46 / 47","out","E27 chain"],
  ["LLC","CAN_TX / CAN_RX","48 / 49","io","external isolated CAN"],
  ["LLC","FLT_LLC","74","in","driver FLT wire-OR (rev D - CB-21)"],
  ["LLC","CTL_QDISBK","75","out","both bank-bleed PV-driver LEDs (E33 revB, ~12 mA)"],
  ["LLC","CTL_KSER..CTL_KPREB","80-85","out","ULN inputs"],
  ["LLC","HMI DAT/CLK/LAT/DIG1/DIG2/BTN1/BTN2","88-94","io","E21"],
  ["LLC","SNS_IOUTN/VOUT/IOUT/VBKA/VBKB","95-99","in","iso amps; OV/OA/OB carry the 1nF fast filter"],
  ["LLC","RELAY_FB KSER/KPARA/KPARB/KOUT/KPREA/KPREB","2-7","in","mirrors (120kW: series pairs - HR-19)"],
  ["LLC","(structural) VDD/VSS 10 11 26 27 · NRST 14 · VDDA 19 20 · SWD 28 29 · BOOT0 100","-","-","reserved in assertUniquePins"],
];
writeFileSync(join(OUT, "mcu-pinmap.csv"), pins.map(r => r.join(",")).join("\n") + "\n");
console.log("Pin map (rev D, mirrors boards.tsx; symbolic pending A6) → out/mcu-pinmap.csv");
