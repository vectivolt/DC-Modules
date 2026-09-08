// umod-pinmap.mts — E40 Phase B: generate the merged 30 kW single-brain ("UMOD") pin allocation.
//
// R3 discipline: every pin number, port and capability is TAKEN FROM the datasheet-derived tables
// in docs/mcu-pin-allocation-gd32.md (UPFC + ULLC + Fixed pins). This script never invents a pin:
// it merges the two 30 kW role subsets and resolves every collision by a documented move onto a
// pin freed by the dropped lanes/legs (donor row quoted per move), then ASSERTS uniqueness,
// fixed-pin avoidance and capability matching (analog → ADC-capable donor, PWM → HRTIMER ST pin).
//
// Architecture improvement recorded as part of E40: ALL NINE PWMs sit on HRTIMER units — PFC
// keeps ST0CH0/CH1 + ST1CH0 exactly as documented; the three LLC legs take the ST2/ST4/ST6
// channel-pairs freed by lanes 1–3 — hardware dead-time per leg and ONE merged fault line on
// HRTIMER_FLT7/PC4 (the doc's own recommended free pin) killing every switch.
//
// Run: npx tsx calculations/control/umod-pinmap.mts   → calculations/out/umod-pinmap.csv + checks
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = process.cwd();
const doc = readFileSync(`${ROOT}/docs/mcu-pin-allocation-gd32.md`, "utf8");
const upfc = doc.slice(doc.indexOf("## UPFC"), doc.indexOf("## ULLC"));
const ullc = doc.slice(doc.indexOf("## ULLC"));

type Row = { pin: number; port: string; fn: string; tag: string; name: string };
function table(sec: string, tag: string): Row[] {
  const out: Row[] = [];
  for (const m of sec.matchAll(/\|\s*`([^`]+)`\s*\|\s*(\d+)\s*\|\s*(P[A-G]\d+)\s*\|\s*([^|]+)\|/g))
    out.push({ name: m[1].trim(), pin: +m[2], port: m[3], fn: m[4].trim(), tag });
  return out;
}
const ROWS = [...table(upfc, "UPFC"), ...table(ullc, "ULLC")];
const byName = (tag: string, n: string): Row => {
  const r = ROWS.find((x) => x.tag === tag && x.name === n);
  if (!r) throw new Error(`doc missing ${tag}:${n}`);
  return r;
};
const donorByPin = (pin: number): Row => {
  const r = ROWS.find((x) => x.pin === pin);
  if (!r) throw new Error(`no documented row uses pin ${pin} — cannot prove capability`);
  return r;
};

const FIXED = new Set([24, 49, 64, 75, 100, 23, 48, 63, 74, 99, 37, 35, 36, 6, 14, 95, 76, 77]);

type Alloc = { sig: string; pin: number; port: string; fn: string; how: string };
const out: Alloc[] = [];
const keep = (tag: string, ...names: string[]) => {
  for (const n of names) { const r = byName(tag, n); out.push({ sig: n, pin: r.pin, port: r.port, fn: r.fn, how: `keep ${tag}` }); }
};
const moveTo = (sig: string, srcTag: string, pin: number, why: string, needs?: RegExp) => {
  byName(srcTag, sig); // signal must exist in its source table
  const d = donorByPin(pin);
  if (needs && !needs.test(d.fn)) throw new Error(`${sig}: donor pin ${pin} (${d.fn}) lacks ${needs}`);
  out.push({ sig, pin, port: d.port, fn: d.fn, how: `moved: ${why} [donor ${d.tag}:${d.name}]` });
};

// ---- PFC side: lane 0 exactly as documented (incl. precharge relay feedback) ----
keep("UPFC",
  "PWM_A0", "PWM_B0", "PWM_C0", "I_A0", "I_B0", "I_C0",
  "SNS_VAC1", "SNS_VAC2", "SNS_VAC3", "SNS_VBUSP", "SNS_VMID", "SNS_V24", "SNS_V15",
  "T_PFC", "T_INLET", "FAN_PWM1", "FAN_TACH1", "FAN_PWM2", "FAN_TACH2",
  "CTL_KPRE", "CTL_QDIS", "EN_PFC", "WDI_PFC", "RELAY_FB_KPRE");
// single merged fault line (wired-OR on the boards) — the doc audit's recommended free pin
out.push({ sig: "FLT", pin: 30, port: "PC4", fn: "HRTIMER_FLT7 (5V tolerant) — doc audit fix", how: "merged FLT_PFC+FLT_LLC" });

// ---- LLC legs onto the freed HRTIMER channel-pairs ----
moveTo("PWM_L1H", "ULLC", 51, "leg1 H = ST2CH0", /HRTIMER_ST/);
moveTo("PWM_L1L", "ULLC", 52, "leg1 L = ST2CH1", /HRTIMER_ST/);
moveTo("PWM_L2H", "ULLC", 67, "leg2 H = ST4CH0", /HRTIMER_ST/);
moveTo("PWM_L2L", "ULLC", 68, "leg2 L = ST4CH1", /HRTIMER_ST/);
moveTo("PWM_L3H", "ULLC", 97, "leg3 H = ST6CH0", /HRTIMER_ST/);
moveTo("PWM_L3L", "ULLC", 98, "leg3 L = ST6CH1", /HRTIMER_ST/);

// ---- LLC sensing: collisions vacate onto ADC-capable pins freed by lanes 1..3 / legs 4..12 ----
moveTo("I_RES1", "ULLC", 38, "PA0 stays I_A0", /ADC/);
moveTo("I_RES2", "ULLC", 42, "PA1 stays I_B0", /ADC/);
keep("ULLC", "I_RES3");                       // PA2: PFC's I_C2 dropped, pin uncontested
moveTo("SNS_IOUT", "ULLC", 43, "PC0 stays SNS_VMID", /ADC/);
moveTo("SNS_IOUTN", "ULLC", 44, "PC1 stays SNS_VAC3", /ADC/);
moveTo("SNS_VOUT", "ULLC", 46, "PC2 stays SNS_VAC1", /ADC/);
keep("ULLC", "SNS_VBKA", "SNS_VBKB");
moveTo("T_LLC", "ULLC", 57, "PB0 stays I_C0", /ADC/);
moveTo("T_XFMR", "ULLC", 58, "PB1 stays SNS_V15", /ADC/);

// ---- LLC digital: keeps where uncontested, moves onto freed timer/link pins ----
keep("ULLC",
  "HMI_DAT", "HMI_DIG1", "HMI_DIG2",
  "CTL_KOUT", "CTL_KPREA", "CTL_KPREB", "CTL_KPARB", "CTL_QDISBK",
  "EN_LLC", "WDI_LLC", "CAN_TX", "CAN_RX",
  "RELAY_FB_KOUT", "RELAY_FB_KPREA", "RELAY_FB_KPREB");
moveTo("CTL_KSER", "ULLC", 2, "PD1 stays CTL_KPRE");
moveTo("CTL_KPARA", "ULLC", 3, "PD4 stays FAN_TACH2");
moveTo("HMI_LAT", "ULLC", 4, "PB12 is now PWM_L1H");
moveTo("HMI_CLK", "ULLC", 5, "PB13 is now PWM_L1L");
moveTo("RELAY_FB_KSER", "ULLC", 79, "PA8 stays PWM_A0; LINK dies with the second card");
moveTo("RELAY_FB_KPARA", "ULLC", 80, "PA9 stays PWM_B0; LINK dies");
moveTo("RELAY_FB_KPARB", "ULLC", 88, "PA10 stays PWM_C0");
moveTo("BTN1", "ULLC", 7, "PD2 stays WDI_PFC (UPFC)");    // PC13 freed by the FLT merge
moveTo("BTN2", "ULLC", 19, "PD3 stays FAN_TACH1 (UPFC)");

// ---- asserts ----
const seen = new Map<number, string>();
let fails = 0;
for (const a of out) {
  if (FIXED.has(a.pin)) { console.log(`FAIL ${a.sig}: pin ${a.pin} is a fixed pin`); fails++; }
  if (seen.has(a.pin)) { console.log(`FAIL ${a.sig}: pin ${a.pin} already carries ${seen.get(a.pin)}`); fails++; }
  seen.set(a.pin, a.sig);
}
const analog = out.filter((a) => /ADC/.test(a.fn));
const hrt = out.filter((a) => /HRTIMER_ST/.test(a.fn));
if (analog.length < 22) { console.log(`FAIL analog count ${analog.length} < 22`); fails++; }
if (hrt.length !== 9) { console.log(`FAIL HRTIMER PWM count ${hrt.length} != 9`); fails++; }
if (out.length > 100 - FIXED.size) { console.log(`FAIL ${out.length} > usable pins`); fails++; }

// ---- emit ----
out.sort((a, b) => a.pin - b.pin);
writeFileSync(`${ROOT}/calculations/out/umod-pinmap.csv`,
  "signal,pin,port,capability,how\n" + out.map((a) => `${a.sig},${a.pin},${a.port},"${a.fn}","${a.how}"`).join("\n") + "\n");
console.log(`UMOD allocation: ${out.length} signals on VET6 (${analog.length} analog, ${hrt.length} HRTIMER PWM)`);
console.log(`usable pins remaining: ${100 - FIXED.size - out.length}`);
console.log(fails ? `${fails} ALLOCATION FAILURE(S)` : "UMOD PINMAP CLEAN — every pin documented, no collisions");
process.exit(fails ? 1 : 0);
