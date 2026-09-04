// mcu-matrix.mjs — Phase 2 formal MCU resource matrix (§20, risk R3).
// Computes REQUIRED resources per SKU and compares against ASSUMED-AVAILABLE GD32G553 resources.
// PROVENANCE: "avail" numbers are GD32G55x family-datasheet values as understood 2026-09 and are
// marked ASSUMED until cross-checked against the current GigaDevice datasheet revision; the
// pin-level table maps to STM32G474-compatible conventions (GD32G5 mirrors them) and MUST be
// re-verified pin-by-pin before schematic freeze. No pin is reused (§20).
// Run: node calculations/control/mcu-matrix.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
mkdirSync(OUT, { recursive: true });

const AVAIL = { // ASSUMED — verify against GD32G553 datasheet (R9)
  hrtimer_ch: 12,      // 6 counting units × 2 outputs
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
  line(name, "PFC", "HRTIM PWM ch", 3 * lanes, AVAIL.hrtimer_ch, "1 PWM/phase (common-source pair), lane phase-shift via timer units");
  line(name, "PFC", "ADC fast ch (I)", 3 * lanes, AVAIL.adc_units * 4, "per-lane phase currents, sampled every sw period");
  line(name, "PFC", "ADC slow ch (V+T)", 3 + 3 + 4, AVAIL.adc_ext_ch, "3 phase V, VBUS+/-/mid, 4 temps — sequencer-muxed");
  // sample-rate budget: each lane current at fsw (70 kHz) → 3*lanes*70k conversions/s
  const ksps = (3 * lanes * 70e3) / 1e3;
  line(name, "PFC", "ADC kSPS (I loops)", ksps, AVAIL.adc_units * AVAIL.adc_ksps_per_unit, "≥1 conv/ch/period @70 kHz");
  line(name, "PFC", "Comparators (OC+OVP)", lanes + 2, AVAIL.comparators, "1 lane-OC (3φ OR-ed ext.) + bus OVP + midpoint");
  line(name, "PFC", "DAC (thresholds)", 2, AVAIL.dac);
  line(name, "PFC", "Relay/fan/misc GPIO", 8, 20, "precharge, discharge, 2 fan PWM, 2 tach, kill, LED");
  // -------- MCU-LLC --------
  line(name, "LLC", "HRTIM PWM ch", 3 * ch, AVAIL.hrtimer_ch, "half-bridge pairs from complementary units, common PFM clock");
  line(name, "LLC", "SR PWM ch (if SR)", 4 * ch, AVAIL.adv_timer_ch, ch > 2 ? "SR NOT timer-driven at 120 kW → SR controller ICs or JBS (Phase 7)" : "");
  line(name, "LLC", "ADC fast ch (Ires)", ch, AVAIL.adc_units * 4, "1 protection-grade resonant I per channel (per-leg via ext. OR)");
  line(name, "LLC", "ADC slow ch", 2 + 2 + 4, AVAIL.adc_ext_ch, "Vout, Iout, VbankA/B, temps");
  line(name, "LLC", "Comparators", ch + 2, AVAIL.comparators, "per-channel resonant OC + output OVP + spare");
  line(name, "LLC", "CAN", 2, AVAIL.can, "1 ext isolated CAN2.0B + 1 internal link (CAN-FD internal)");
  line(name, "LLC", "Relay drives + readback", 5 + 3, 20, "K_SER, K_PAR_A/B, precharge, discharge + 3 sense");
  console.log("");
}
writeFileSync(join(OUT, "mcu-matrix.csv"), rows.map(r => r.join(",")).join("\n") + "\n");

// Pin-level assignment table (30 kW shown; 60/120 add lane/channel columns on same units).
// CONVENTION: STM32G474-compatible port mapping, TO BE VERIFIED against GD32G553 datasheet.
const pins = [
  ["MCU","signal","peripheral","pin(conv.)","direction","notes"],
  ["PFC","PWM_PHA","HRTIM_CHA1","PA8","out","lane0 phase A gate (pair)"],
  ["PFC","PWM_PHB","HRTIM_CHB1","PA10","out","lane0 phase B"],
  ["PFC","PWM_PHC","HRTIM_CHC1","PB12","out","lane0 phase C"],
  ["PFC","PWM_PHA_L1","HRTIM_CHD1","PB14","out","lane1 (60/120 kW) 180°"],
  ["PFC","PWM_PHB_L1","HRTIM_CHE1","PC8","out","lane1"],
  ["PFC","PWM_PHC_L1","HRTIM_CHF1","PC6","out","lane1"],
  ["PFC","I_PHA0..","ADC1_IN1..3","PA0,PA1,PA2","in","lane0 currents, shunt+NSI1200"],
  ["PFC","I_L1..","ADC2_IN1..3","PA4,PA5,PA6","in","lane1 currents"],
  ["PFC","VAB,VBC,VCA","ADC3_IN","PB0,PB1,PB2","in","divider+RC"],
  ["PFC","VBUS+,VBUS-,VMID","ADC4_IN","PC0,PC1,PC2","in","HV dividers"],
  ["PFC","TEMP1..4","ADC3_IN slow","PC3,PC4,PC5,PB11","in","NTC"],
  ["PFC","OC_KILL","COMP1→HRTIM FLT1","PB3","in","hardware PWM kill"],
  ["PFC","BUS_OVP","COMP2→FLT2","PB4","in",""],
  ["PFC","PRECHG,DISCHG","GPIO","PB5,PB6","out","relay drivers"],
  ["PFC","FAN_PWM1/2,TACH1/2","TIM3 CH1/2, TIM4 CH1/2","PB7,PB8,PB9,PA3","io",""],
  ["PFC","LINK_TX/RX","USART2","PA14,PA15","io","internal link, CRC+seq"],
  ["LLC","PWM_LEG1_H/L","HRTIM_CHA1/2","PA8,PA9","out","channel0 leg1"],
  ["LLC","PWM_LEG2_H/L","HRTIM_CHB1/2","PA10,PA11","out",""],
  ["LLC","PWM_LEG3_H/L","HRTIM_CHC1/2","PB12,PB13","out",""],
  ["LLC","CH1 legs (60/120)","HRTIM_CHD/E/F","PB14,PB15,PC8,PC9,PC6,PC7","out","channel1"],
  ["LLC","I_RES_CH0..3","ADC1/2_IN","PA0,PA1,PA4,PA5","in","resonant CT burden"],
  ["LLC","VOUT,IOUT","ADC3_IN1/2","PB0,PB1","in","iso ΣΔ / shunt"],
  ["LLC","VBANK_A/B","ADC4_IN1/2","PC0,PC1","in","iso amps"],
  ["LLC","RES_OC,OUT_OVP","COMP1/2→FLT1/2","PB3,PB4","in","PWM kill"],
  ["LLC","K_SER,K_PAR_A,K_PAR_B","GPIO","PB5,PB6,PB7","out","relay coil drivers"],
  ["LLC","K_SENSE_1..3","GPIO in","PB8,PB9,PB10","in","contact readback"],
  ["LLC","CAN_EXT","CAN1 TX/RX","PA12,PA11→remap PD0/PD1","io","VERIFY remap — PA11 conflict flagged, resolve on datasheet"],
  ["LLC","CAN_INT","CAN2/USART2","PA14,PA15","io","internal link"],
  ["LLC","ENABLE_IN,FAULT_OUT","GPIO","PC10,PC11","io",""],
];
writeFileSync(join(OUT, "mcu-pinmap.csv"), pins.map(r => r.join(",")).join("\n") + "\n");
console.log("Pin map (convention-mapped, VERIFY vs datasheet) → out/mcu-pinmap.csv");
console.log("Known conflict flagged: LLC CAN1 default pins overlap HRTIM CHB — resolve via remap at datasheet check.");
