// boards.tsx v4 — R2 review closure (docs/design-review-production-r2.md, E32):
//   CB-17/18 Rail3V3 buck per board (DC-DC had NO 3.3 V source; LDO was thermally impossible)
//   CB-21 FLT_LLC → MCU-LLC pin 74 · HR-15 bank bleeders (2× DischargeCtl + FET + chains, pin 75)
//   HR-17 4 fan ports + pins 80–83 at 120 kW · HR-19 dual S/P relays at 120 kW (matrix `dual`)
//   HR-20 RNS star + bank balance → 2-series 47 k HV · MR-18 1 nF filter on OVP sense channels
//   E32 V24/V15 rail monitors → MCU-PFC pins 51/52
// boards.tsx v3 — AC-DC and DC-DC board generators for the two-board sandwich architecture
// (customer directive 2026-09-04; E17). Lanes/channels parameterized: 30 kW = 1, 60 kW = 2,
// 120 kW = 4. Schematic-complete; PCB layout deliberately untuned.
// v3 (2026-09-05) closes the production-review blockers (docs/design-review-production.md):
//   CB-1 X1-530/Y1-440 filter caps (parts-db) · CB-2 bank electrolytics 2-series strings (E29)
//   CB-4 AGND–DGND single-point tie per board + DGND→PE soft RC · CB-8 KPRE → 2× line-rated
//   power relays w/ mirror readback · CB-10 SafetyChain per board (WD + 3-input AND, E27)
//   CB-11 DischargeCtl (default-OFF, isolated, DCN-referenced) · CB-13 SwdPort per MCU
//   CB-14 LINK TX↔RX crossed on this side of the harness · CB-3/E25 IsoVSense isolated HV senses
//   HR-5 FLT pull-ups · HR-7 MOV+GDT L-PE surge path · MR-1 pulse resistors on axial footprints
// Pin maps below are the §20 no-silent-reuse artifact (asserted at build; numbers symbolic per A6).
import {
  ViennaPhase, LlcHalfBridgeLeg, LlcSection, SplitDcLink, SeriesParallelRelayMatrix,
  IsoVSense, Bias5Module, AnalogMid, CtSensor, NtcInput, ConfigHmi, ControlMcu, CoilDriver,
  InterconnectSignals, AuxPower, FanPort, IsolatedCan, OutputShunt, SafetyChain, SwdPort,
  DischargeCtl, PvGateDrive, Rail3V3, StudFP, RelayMFP, FilmBoxFP, Cm3FP, SnapInFP,
} from "../power-primitives/cells";

const assertUniquePins = (label: string, entries: [string, number][]) => {
  const seen = new Map<number, string>();
  for (const [net, pin] of entries) {
    // power/reset/analog-supply/SWD/BOOT pins are wired structurally — never map signals onto them
    if ([10, 11, 14, 19, 20, 26, 27, 28, 29, 100].includes(pin)) throw new Error(`${label}: pin ${pin} is a reserved structural pin (${net})`);
    if (seen.has(pin)) throw new Error(`${label}: pin ${pin} reused by ${seen.get(pin)} and ${net}`);
    seen.set(pin, net);
  }
  return entries;
};

// ================= AC-DC BOARD =================
export const AcDcBoard = ({ lanes, w, h }: { lanes: number; w: number; h: number }) => {
  const phases = Array.from({ length: lanes }, (_, l) => ["A", "B", "C"].map(p => ({ id: `${p}${l}`, ac: `net.AC${p === "A" ? "1F" : p === "B" ? "2F" : "3"}` }))).flat();
  const nFans = lanes === 4 ? 4 : 2; // HR-17: thermal architecture is 2/2/4 fans — every fan gets its own header + monitored tach
  // MCU-PFC pin map (§20): PWM per phase, CT per phase, senses, temps, fans, link, safety chain
  const pfcPins: [string, number][] = [
    ...phases.map((p, i) => [`net.PWM_${p.id}`, 55 + i] as [string, number]),
    ...phases.map((p, i) => [`net.I_${p.id}`, 30 + i] as [string, number]),
    ["net.SNS_VAC1", 43], ["net.SNS_VAC2", 44], ["net.SNS_VAC3", 45],
    ["net.SNS_VBUSP", 46], ["net.SNS_VMID", 47],
    ["net.T_PFC", 48], ["net.T_INLET", 49],
    ["net.SNS_V24", 51], ["net.SNS_V15", 52],
    ...Array.from({ length: nFans }, (_, i) => [
      [`net.FAN_PWM${i + 1}`, i < 2 ? 76 + 2 * i : 80 + 2 * (i - 2)] as [string, number],
      [`net.FAN_TACH${i + 1}`, i < 2 ? 77 + 2 * i : 81 + 2 * (i - 2)] as [string, number],
    ]).flat(),
    ["net.LINK_TX", 68], ["net.LINK_RX", 69],
    ["net.WDI_PFC", 70], ["net.EN_PFC", 71],
    ["net.CTL_KPRE", 72], ["net.CTL_QDIS", 73], ["net.FLT_PFC", 74],
    ["net.RELAY_FB_KPRE", 50],
  ];
  assertUniquePins("MCU-PFC", pfcPins);
  const nDcHalf = lanes === 1 ? 5 : lanes === 2 ? 9 : 18;
  const dcBanks = nDcHalf <= 5 ? [[nDcHalf, 0]] : nDcHalf <= 10 ? [[5, 0], [nDcHalf - 5, 1]] : [[6, 0], [6, 1], [6, 2]];
  return (
    <board width={`${w}mm`} height={`${h}mm`} routingDisabled>
      {/* AC entry, protection, EMI (§26/§27): fuses → MOV Δ + MOV/GDT L-PE → CM1 → X → CM2 → X → Y */}
      {["ACL1", "ACL2", "ACL3", "PE"].map((n, i) => (
        <chip key={n} name={`J${n}`} footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={-w / 2 + 15} pcbY={h / 2 - 20 - i * 30} schX={-26} schY={-8 + i * 1.4} />
      ))}
      {[1, 2, 3].map(i => (
        <chip key={i} name={`F${i}`} footprint={FilmBoxFP(30)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={-w / 2 + 55} pcbY={h / 2 - 20 - (i - 1) * 25} schX={-24} schY={-8 + (i - 1) * 1.4} />
      ))}
      {[1, 2, 3].map(i => (
        <chip key={i} name={`MOV${i}`} footprint={FilmBoxFP(10)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={-w / 2 + 55} pcbY={h / 2 - 105 - (i - 1) * 15} schX={-24} schY={-3.5 + (i - 1) * 0.7} />
      ))}
      {/* HR-7: common-mode surge path — MOV + GDT in series, each line to PE */}
      {[1, 2, 3].map(i => (
        <chip key={`mp${i}`} name={`MOVP${i}`} footprint={FilmBoxFP(10)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={-w / 2 + 70} pcbY={h / 2 - 105 - (i - 1) * 15} schX={-23} schY={-3.5 + (i - 1) * 0.7} />
      ))}
      {[1, 2, 3].map(i => (
        <chip key={`g${i}`} name={`GDT${i}`} footprint={FilmBoxFP(10)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={-w / 2 + 85} pcbY={h / 2 - 105 - (i - 1) * 15} schX={-22.2} schY={-3.5 + (i - 1) * 0.7} />
      ))}
      <chip name="CMC1" footprint={<Cm3FP />} pinLabels={{ pin1: "A1", pin2: "B1", pin3: "A2", pin4: "B2", pin5: "A3", pin6: "B3" }} pcbX={-w / 2 + 105} pcbY={h / 2 - 35} schX={-22} schY={-7.4} />
      <chip name="CMC2" footprint={<Cm3FP />} pinLabels={{ pin1: "A1", pin2: "B1", pin3: "A2", pin4: "B2", pin5: "A3", pin6: "B3" }} pcbX={-w / 2 + 105} pcbY={h / 2 - 85} schX={-19} schY={-7.4} />
      {[1, 2, 3].map(i => (
        <capacitor key={`x1${i}`} name={`CX1${i}`} capacitance="2.2uF" footprint={FilmBoxFP(27.5)} pcbX={-w / 2 + 150} pcbY={h / 2 - 20 - (i - 1) * 22} schX={-20.5} schY={-8 + (i - 1) * 0.9} />
      ))}
      {[1, 2, 3].map(i => (
        <capacitor key={`x2${i}`} name={`CX2${i}`} capacitance="2.2uF" footprint={FilmBoxFP(27.5)} pcbX={-w / 2 + 150} pcbY={h / 2 - 90 - (i - 1) * 22} schX={-17.5} schY={-8 + (i - 1) * 0.9} />
      ))}
      {[1, 2, 3].map(i => (
        <capacitor key={`y${i}`} name={`CY${i}`} capacitance="4.7nF" footprint={FilmBoxFP(10)} pcbX={-w / 2 + 180} pcbY={h / 2 - 20 - (i - 1) * 15} schX={-16} schY={-8 + (i - 1) * 0.7} />
      ))}
      <trace from=".JACL1 > .P" to=".F1 > .A" />
      <trace from=".JACL2 > .P" to=".F2 > .A" />
      <trace from=".JACL3 > .P" to=".F3 > .A" />
      <trace from=".F1 > .B" to="net.LF1" />
      <trace from=".F2 > .B" to="net.LF2" />
      <trace from=".F3 > .B" to="net.LF3" />
      <trace from=".MOV1 > .A" to="net.LF1" />
      <trace from=".MOV1 > .B" to="net.LF2" />
      <trace from=".MOV2 > .A" to="net.LF2" />
      <trace from=".MOV2 > .B" to="net.LF3" />
      <trace from=".MOV3 > .A" to="net.LF3" />
      <trace from=".MOV3 > .B" to="net.LF1" />
      {[1, 2, 3].map(i => [
        <trace key={`mpa${i}`} from={`.MOVP${i} > .A`} to={`net.LF${i}`} />,
        <trace key={`mpb${i}`} from={`.MOVP${i} > .B`} to={`.GDT${i} > .A`} />,
        <trace key={`gb${i}`} from={`.GDT${i} > .B`} to="net.PE" />,
      ])}
      <trace from=".CMC1 > .A1" to="net.LF1" />
      <trace from=".CMC1 > .A2" to="net.LF2" />
      <trace from=".CMC1 > .A3" to="net.LF3" />
      <trace from=".CMC1 > .B1" to="net.AC1M" />
      <trace from=".CMC1 > .B2" to="net.AC2M" />
      <trace from=".CMC1 > .B3" to="net.AC3M" />
      <trace from=".CX11 > .pin1" to="net.AC1M" />
      <trace from=".CX11 > .pin2" to="net.AC2M" />
      <trace from=".CX12 > .pin1" to="net.AC2M" />
      <trace from=".CX12 > .pin2" to="net.AC3M" />
      <trace from=".CX13 > .pin1" to="net.AC3M" />
      <trace from=".CX13 > .pin2" to="net.AC1M" />
      <trace from=".CMC2 > .A1" to="net.AC1M" />
      <trace from=".CMC2 > .A2" to="net.AC2M" />
      <trace from=".CMC2 > .A3" to="net.AC3M" />
      <trace from=".CMC2 > .B1" to="net.AC1D" />
      <trace from=".CMC2 > .B2" to="net.AC2D" />
      <trace from=".CMC2 > .B3" to="net.AC3D" />
      {[1, 2, 3].map(i => (
        <chip key={`ldm${i}`} name={`LDM${i}`} footprint={FilmBoxFP(20)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={-w / 2 + 200} pcbY={h / 2 - 20 - (i - 1) * 18} schX={-15.2} schY={-8 + (i - 1) * 0.7} />
      ))}
      <trace from=".LDM1 > .A" to="net.AC1D" />
      <trace from=".LDM1 > .B" to="net.AC1" />
      <trace from=".LDM2 > .A" to="net.AC2D" />
      <trace from=".LDM2 > .B" to="net.AC2" />
      <trace from=".LDM3 > .A" to="net.AC3D" />
      <trace from=".LDM3 > .B" to="net.AC3" />
      <trace from=".CX21 > .pin1" to="net.AC1" />
      <trace from=".CX21 > .pin2" to="net.AC2" />
      <trace from=".CX22 > .pin1" to="net.AC2" />
      <trace from=".CX22 > .pin2" to="net.AC3" />
      <trace from=".CX23 > .pin1" to="net.AC3" />
      <trace from=".CX23 > .pin2" to="net.AC1" />
      <trace from=".CY1 > .pin1" to="net.AC1" />
      <trace from=".CY1 > .pin2" to="net.PE" />
      <trace from=".CY2 > .pin1" to="net.AC2" />
      <trace from=".CY2 > .pin2" to="net.PE" />
      <trace from=".CY3 > .pin1" to="net.AC3" />
      <trace from=".CY3 > .pin2" to="net.PE" />
      <trace from=".JPE > .P" to="net.PE" />
      {/* precharge (E14 rev): 33 Ω pulse resistors in L1/L2; CB-8: bypass = 2× line-rated power
          relays w/ mirror contacts (series readback chain — both-open proof before precharge) */}
      {["1", "2"].map((k, i) => (
        <chip key={k} name={`KPRE${k}`} footprint={<RelayMFP />} pinLabels={{ pin1: "C1", pin2: "C2", pin3: "A", pin4: "B", pin5: "M1", pin6: "M2" }} pcbX={-w / 2 + 220 + i * 30} pcbY={h / 2 - 25} schX={-14 + i * 1.6} schY={-8} />
      ))}
      <chip name="RPRE1" footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={-w / 2 + 220} pcbY={h / 2 - 55} schX={-14} schY={-6.6} />
      <chip name="RPRE2" footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={-w / 2 + 220} pcbY={h / 2 - 65} schX={-14} schY={-6} />
      <resistor name="RKFBP" resistance="10k" footprint="0603" pcbX={-w / 2 + 260} pcbY={h / 2 - 55} schX={-11} schY={-6.6} />
      <trace from="net.AC1" to=".RPRE1 > .A" />
      <trace from=".RPRE1 > .B" to="net.AC1F" />
      <trace from=".KPRE1 > .A" to="net.AC1" />
      <trace from=".KPRE1 > .B" to="net.AC1F" />
      <trace from="net.AC2" to=".RPRE2 > .A" />
      <trace from=".RPRE2 > .B" to="net.AC2F" />
      <trace from=".KPRE2 > .A" to="net.AC2" />
      <trace from=".KPRE2 > .B" to="net.AC2F" />
      <trace from=".KPRE1 > .C1" to="net.V24" />
      <trace from=".KPRE1 > .C2" to="net.COIL_KPRE" />
      <trace from=".KPRE2 > .C1" to="net.V24" />
      <trace from=".KPRE2 > .C2" to="net.COIL_KPRE" />
      <trace from=".KPRE1 > .M1" to="net.DGND" />
      <trace from=".KPRE1 > .M2" to=".KPRE2 > .M1" />
      <trace from=".KPRE2 > .M2" to="net.RELAY_FB_KPRE" />
      <trace from=".RKFBP > .pin1" to="net.V3P3" />
      <trace from=".RKFBP > .pin2" to="net.RELAY_FB_KPRE" />

      {/* Vienna lanes (film commutation caps now inside each phase — CB-9) */}
      {phases.map((p, i) => (
        <ViennaPhase key={p.id} id={p.id} ac={p.ac} dcp="net.DCP" dcn="net.DCN" mid="net.MID"
          pwm={`net.PWM_${p.id}`} flt="net.FLT_PFC" en="net.GATE_EN_A"
          x={-w / 2 + 60} y={h / 2 - 150 - i * 42} sx={-10} sy={-8 + i * 3.4} />
      ))}
      {/* per-phase line CTs (primary = line conductor through aperture; §19/E18) */}
      {phases.map((p, i) => (
        <CtSensor key={p.id} id={p.id} out={`net.I_${p.id}`} x={-w / 2 + 240} y={h / 2 - 150 - i * 42} sx={9} sy={-8 + i * 1} />
      ))}

      {/* DC link banks + balance */}
      {dcBanks.map(([n, k]) => (
        <SplitDcLink key={k} id={`${k}`} nPerHalf={n} dcp="net.DCP" dcn="net.DCN" mid="net.MID"
          x={-w / 2 + 140} y={-h / 2 + 120 + (k as number) * 100} sx={-4 + (k as number) * 5} sy={5.5} />
      ))}

      {/* discharge: 4× 160 Ω pulse resistors + 1200 V SiC FET.
          CB-11: default-OFF isolated drive (DischargeCtl), gate pulled down to DCN. */}
      {[0, 1, 2, 3].map(i => (
        <chip key={i} name={`RDIS${i}`} footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={w / 2 - 120 + i * 10} pcbY={-h / 2 + 30} schX={2 + i * 0.7} schY={7.5} />
      ))}
      <chip name="QDIS" footprint={<StudFP />} pinLabels={{ pin1: "TAB" }} pcbX={w / 2 - 60} pcbY={-h / 2 + 30} schX={5.4} schY={7.5} />
      <chip name="QDISF" footprint="to220" pinLabels={{ pin1: "G", pin2: "D", pin3: "S" }} pcbX={w / 2 - 75} pcbY={-h / 2 + 45} schX={4.6} schY={7.9} />
      <DischargeCtl ctl="net.CTL_QDIS" gateOut="net.G_QDIS" dcn="net.DCN" x={w / 2 - 100} y={-h / 2 + 55} sx={3.4} sy={8.3} />
      <trace from=".RDIS0 > .A" to="net.DCP" />
      <trace from=".RDIS0 > .B" to=".RDIS1 > .A" />
      <trace from=".RDIS1 > .B" to=".RDIS2 > .A" />
      <trace from=".RDIS2 > .B" to=".RDIS3 > .A" />
      <trace from=".RDIS3 > .B" to=".QDISF > .D" />
      <trace from=".QDISF > .S" to="net.DCN" />
      <trace from=".QDISF > .G" to="net.G_QDIS" />

      {/* sensing (E25: every HV sense isolated; SELV control domain preserved).
          AC senses reference a 3×(2×47 k) artificial star (HR-20: 2-series halves per-element
          V/W — 0.46 W & 152 Vrms each); bus senses reference DCN. NOTE: the star doubles as the
          X-cap bleed path (τ ≈ 0.42 s) — do not delete without replacing that function. */}
      {[1, 2, 3].map(i => [
        <resistor key={`nsa${i}`} name={`RNS${i}A`} resistance="47k" footprint="2512" pcbX={-w / 2 + 250} pcbY={-h / 2 + 100 - i * 6} schX={-25} schY={2 + i * 0.4} />,
        <resistor key={`nsb${i}`} name={`RNS${i}B`} resistance="47k" footprint="2512" pcbX={-w / 2 + 258} pcbY={-h / 2 + 100 - i * 6} schX={-24.5} schY={2 + i * 0.4} />,
      ])}
      {[1, 2, 3].map(i => [
        <trace key={`nt1${i}`} from={`.RNS${i}A > .pin1`} to={`net.AC${i}`} />,
        <trace key={`nt2${i}`} from={`.RNS${i}A > .pin2`} to={`.RNS${i}B > .pin1`} />,
        <trace key={`nt3${i}`} from={`.RNS${i}B > .pin2`} to="net.NSTAR" />,
      ])}
      <Bias5Module id="AC" p5="net.B5AC" com="net.NSTAR" x={-w / 2 + 250} y={-h / 2 + 110} sx={-25} sy={3.6} />
      <Bias5Module id="BUS" p5="net.B5BUS" com="net.DCN" x={-w / 2 + 250} y={-h / 2 + 120} sx={-23} sy={3.6} />
      <IsoVSense id="V1" hv="net.AC1" ref="net.NSTAR" biasP="net.B5AC" rBot="11.5k" out="net.SNS_VAC1" x={-w / 2 + 240} y={-h / 2 + 90} sx={-24} sy={4} />
      <IsoVSense id="V2" hv="net.AC2" ref="net.NSTAR" biasP="net.B5AC" rBot="11.5k" out="net.SNS_VAC2" x={-w / 2 + 240} y={-h / 2 + 80} sx={-24} sy={4.8} />
      <IsoVSense id="V3" hv="net.AC3" ref="net.NSTAR" biasP="net.B5AC" rBot="11.5k" out="net.SNS_VAC3" x={-w / 2 + 240} y={-h / 2 + 70} sx={-24} sy={5.6} />
      <IsoVSense id="BP" hv="net.DCP" ref="net.DCN" biasP="net.B5BUS" cf="1nF" out="net.SNS_VBUSP" x={-w / 2 + 240} y={-h / 2 + 60} sx={-24} sy={6.4} />
      <IsoVSense id="BM" hv="net.MID" ref="net.DCN" biasP="net.B5BUS" cf="1nF" out="net.SNS_VMID" x={-w / 2 + 240} y={-h / 2 + 50} sx={-24} sy={7.2} />
      <AnalogMid x={-w / 2 + 240} y={-h / 2 + 15} sx={-20} sy={8} />
      <NtcInput id="TPFC" out="net.T_PFC" x={-w / 2 + 240} y={-h / 2 + 35} sx={-24} sy={8} />
      <NtcInput id="TINL" out="net.T_INLET" x={-w / 2 + 240} y={-h / 2 + 25} sx={-22} sy={8} />

      {/* control: MCU-PFC + safety chain + SWD + coil driver + aux + fans + interconnect */}
      <ControlMcu id="PFC" x={-w / 2 + 60} y={-h / 2 + 60} sx={-14} sy={4} />
      <SafetyChain id="A" enLocal="net.EN_PFC" enRemote="net.EN_LLC" wdi="net.WDI_PFC" gateEn="net.GATE_EN_A"
        x={-w / 2 + 60} y={-h / 2 + 20} sx={-14} sy={6} />
      <SwdPort id="PFC" x={-w / 2 + 20} y={-h / 2 + 60} sx={-16} sy={4} />
      <trace from=".UPFC > .pin28" to="net.SWDIO_PFC" />
      <trace from=".UPFC > .pin29" to="net.SWCLK_PFC" />
      <trace from=".UPFC > .pin100" to="net.BOOT0_PFC" />
      <resistor name="RFLTA" resistance="4.7k" footprint="0603" pcbX={-w / 2 + 100} pcbY={-h / 2 + 20} schX={-12} schY={6} />
      <capacitor name="CFLTA" capacitance="1nF" footprint="0603" pcbX={-w / 2 + 106} pcbY={-h / 2 + 20} schX={-11.5} schY={6} />
      <trace from=".RFLTA > .pin1" to="net.V3P3" />
      <trace from=".RFLTA > .pin2" to="net.FLT_PFC" />
      <trace from=".CFLTA > .pin1" to="net.FLT_PFC" />
      <trace from=".CFLTA > .pin2" to="net.DGND" />
      {/* CB-4: analog/digital ground single-point tie + DGND→PE soft bond */}
      <resistor name="RAGTA" resistance="0" footprint="0805" pcbX={-w / 2 + 112} pcbY={-h / 2 + 20} schX={-11} schY={6.4} />
      <trace from=".RAGTA > .pin1" to="net.AGND" />
      <trace from=".RAGTA > .pin2" to="net.DGND" />
      <resistor name="RPET" resistance="1M" footprint="1206" pcbX={-w / 2 + 118} pcbY={-h / 2 + 20} schX={-10.5} schY={6.4} />
      <capacitor name="CPET" capacitance="4.7nF" footprint={FilmBoxFP(10)} pcbX={-w / 2 + 124} pcbY={-h / 2 + 20} schX={-10} schY={6.4} />
      <trace from=".RPET > .pin1" to="net.DGND" />
      <trace from=".RPET > .pin2" to="net.PE" />
      <trace from=".CPET > .pin1" to="net.DGND" />
      <trace from=".CPET > .pin2" to="net.PE" />
      <CoilDriver id="PA" ins={["net.CTL_KPRE", "net.DGND", "net.DGND", "net.DGND", "net.DGND", "net.DGND", "net.DGND", "net.DGND"]}
        outs={["net.COIL_KPRE", "net.NC_O2", "net.NC_O3", "net.NC_O4", "net.NC_O5", "net.NC_O6", "net.NC_O7A", "net.NC_O8A"]}
        x={-w / 2 + 130} y={-h / 2 + 60} sx={-11} sy={4} />
      <AuxPower dcp="net.DCP" dcn="net.DCN" x={-w / 2 + 130} y={-h / 2 + 30} sx={-11} sy={5.6} />
      <Rail3V3 id="A" x={-w / 2 + 190} y={-h / 2 + 30} sx={-8} sy={5.6} />
      {/* E32: rail monitors — firmware finally sees its own supplies (24 V: ÷7.8 → 3.08 V; 15 V: ÷5.7 → 2.63 V) */}
      <resistor name="RM24A" resistance="68k" footprint="0603" pcbX={-w / 2 + 210} pcbY={-h / 2 + 30} schX={-6.5} schY={5.6} />
      <resistor name="RM24B" resistance="10k" footprint="0603" pcbX={-w / 2 + 216} pcbY={-h / 2 + 30} schX={-6} schY={5.6} />
      <resistor name="RM15A" resistance="47k" footprint="0603" pcbX={-w / 2 + 210} pcbY={-h / 2 + 38} schX={-6.5} schY={6.1} />
      <resistor name="RM15B" resistance="10k" footprint="0603" pcbX={-w / 2 + 216} pcbY={-h / 2 + 38} schX={-6} schY={6.1} />
      <trace from=".RM24A > .pin1" to="net.V24" />
      <trace from=".RM24A > .pin2" to="net.SNS_V24" />
      <trace from=".RM24B > .pin1" to="net.SNS_V24" />
      <trace from=".RM24B > .pin2" to="net.AGND" />
      <trace from=".RM15A > .pin1" to="net.V15" />
      <trace from=".RM15A > .pin2" to="net.SNS_V15" />
      <trace from=".RM15B > .pin1" to="net.SNS_V15" />
      <trace from=".RM15B > .pin2" to="net.AGND" />
      {Array.from({ length: nFans }, (_, i) => (
        <FanPort key={i} id={`${i + 1}`} x={w / 2 - 40} y={-h / 2 + 80 - i * 15} sx={7} sy={4 + i * 0.8} />
      ))}
      <InterconnectSignals id="A" ltx="net.LINK_TX" lrx="net.LINK_RX" enA="net.EN_PFC" enB="net.EN_LLC"
        x={w / 2 - 40} y={-h / 2 + 110} sx={7} sy={5.8} />
      {/* MCU pin bindings (§20 map, asserted unique) */}
      {pfcPins.map(([net, pin]) => (
        <trace key={`${net}${pin}`} from={`.UPFC > .pin${pin}`} to={net} />
      ))}

      {/* DC bus studs to DC-DC board */}
      <chip name="JDCP" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={w / 2 - 20} pcbY={h / 2 - 30} schX={8} schY={-8} />
      <chip name="JDCN" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={w / 2 - 20} pcbY={h / 2 - 70} schX={8} schY={-7} />
      <chip name="JPEB" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={w / 2 - 20} pcbY={h / 2 - 110} schX={8} schY={-6} />
      <trace from=".JDCP > .P" to="net.DCP" />
      <trace from=".JDCN > .P" to="net.DCN" />
      <trace from=".JPEB > .P" to="net.PE" />
    </board>
  );
};

// ================= DC-DC BOARD =================
export const DcDcBoard = ({ channels, w, h }: { channels: number; w: number; h: number }) => {
  const legs = Array.from({ length: 3 * channels }, (_, i) => ({ id: `${i + 1}`, sw: `net.SW${i + 1}`, ch: Math.floor(i / 3) }));
  const secs = legs.map(l => ({ ...l, star: `net.STAR${l.ch}` }));
  const relayFb = ["KSER", "KPARA", "KPARB", "KOUT", "KPREA", "KPREB"];
  const llcPins: [string, number][] = [
    ...legs.map((l, i) => [`net.PWM_L${l.id}H`, 50 + 2 * i] as [string, number]),
    ...legs.map((l, i) => [`net.PWM_L${l.id}L`, 51 + 2 * i] as [string, number]),
    ...Array.from({ length: 3 * channels }, (_, i) => [`net.I_RES${i + 1}`, 30 + i] as [string, number]),
    ["net.SNS_VOUT", 96], ["net.SNS_IOUT", 97], ["net.SNS_VBKA", 98], ["net.SNS_VBKB", 99],
    ["net.SNS_IOUTN", 95],
    ["net.T_LLC", 42], ["net.T_XFMR", 43],
    ["net.LINK_TX", 44], ["net.LINK_RX", 45],
    ["net.WDI_LLC", 46], ["net.EN_LLC", 47],
    ["net.CAN_TX", 48], ["net.CAN_RX", 49],
    ["net.HMI_DAT", 88], ["net.HMI_CLK", 89], ["net.HMI_LAT", 90], ["net.HMI_DIG1", 91], ["net.HMI_DIG2", 92],
    ["net.BTN1", 93], ["net.BTN2", 94],
    ["net.CTL_KSER", 80], ["net.CTL_KPARA", 81], ["net.CTL_KPARB", 82], ["net.CTL_KOUT", 83], ["net.CTL_KPREA", 84], ["net.CTL_KPREB", 85],
    ["net.FLT_LLC", 74],      // CB-21: the LLC driver fault wire-OR finally reaches the MCU (mirrors FLT_PFC=74)
    ["net.CTL_QDISBK", 75],   // HR-15: commanded bank bleeders (both optos on one GPIO, ~12 mA)
    ...relayFb.map((k, i) => [`net.RELAY_FB_${k}`, 2 + i] as [string, number]),
  ];
  assertUniquePins("MCU-LLC", llcPins);
  const nBank = channels * 2;
  return (
    <board width={`${w}mm`} height={`${h}mm`} routingDisabled>
      {/* bus entry studs from AC-DC board + film commutation caps per leg */}
      <chip name="JDCP" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={-w / 2 + 20} pcbY={h / 2 - 30} schX={-26} schY={-8} />
      <chip name="JDCN" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={-w / 2 + 20} pcbY={h / 2 - 70} schX={-26} schY={-7} />
      <chip name="JPEB" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={-w / 2 + 20} pcbY={h / 2 - 110} schX={-26} schY={-6} />
      <trace from=".JDCP > .P" to="net.DCP" />
      <trace from=".JDCN > .P" to="net.DCN" />
      <trace from=".JPEB > .P" to="net.PE" />
      {Array.from({ length: 3 * channels }, (_, i) => (
        <capacitor key={i} name={`CF${i}`} capacitance="1uF" footprint={FilmBoxFP(27.5)} pcbX={-w / 2 + 60 + i * 35} pcbY={h / 2 - 20} schX={-24 + i * 0.8} schY={-8} />
      ))}
      {Array.from({ length: 3 * channels }, (_, i) => [
        <trace key={`p${i}`} from={`.CF${i} > .pin1`} to="net.DCP" />,
        <trace key={`n${i}`} from={`.CF${i} > .pin2`} to="net.DCN" />,
      ])}

      {/* LLC legs + sections */}
      {legs.map((l, i) => (
        <LlcHalfBridgeLeg key={l.id} id={l.id} bus="net.DCP" gnd="net.DCN" sw={l.sw}
          pwmH={`net.PWM_L${l.id}H`} pwmL={`net.PWM_L${l.id}L`} flt="net.FLT_LLC" en="net.GATE_EN_B"
          x={-w / 2 + 60} y={h / 2 - 70 - i * 44} sx={-16} sy={-7 + i * 4.6} />
      ))}
      {secs.map((s, i) => (
        <LlcSection key={s.id} id={s.id} sw={s.sw} star={s.star}
          bkAp="net.BKAP" bkAn="net.BKAN" bkBp="net.BKBP" bkBn="net.BKBN"
          ctOut={`net.I_RES${s.id}`}
          x={-w / 2 + 180} y={h / 2 - 70 - i * 44} sx={-8} sy={-7 + i * 2.2} />
      ))}

      {/* bank capacitors — E29/CB-2: two-series 450 V strings (900 V string rating vs ≤525 V bank)
          + shared string midpoints + balance dividers; film across each bank */}
      {Array.from({ length: nBank }, (_, i) => (
        <capacitor key={`at${i}`} name={`CBA${i}T`} capacitance="470uF" footprint={<SnapInFP />} pcbX={w / 2 - 160 + (i % 2) * 20} pcbY={h / 2 - 30 - Math.floor(i / 2) * 25} schX={4 + (i % 2) * 1} schY={-8 + Math.floor(i / 2) * 0.7} />
      ))}
      {Array.from({ length: nBank }, (_, i) => (
        <capacitor key={`ab${i}`} name={`CBA${i}B`} capacitance="470uF" footprint={<SnapInFP />} pcbX={w / 2 - 160 + (i % 2) * 20} pcbY={h / 2 - 42 - Math.floor(i / 2) * 25} schX={4 + (i % 2) * 1} schY={-7.65 + Math.floor(i / 2) * 0.7} />
      ))}
      {Array.from({ length: nBank }, (_, i) => (
        <capacitor key={`bt${i}`} name={`CBB${i}T`} capacitance="470uF" footprint={<SnapInFP />} pcbX={w / 2 - 110 + (i % 2) * 20} pcbY={h / 2 - 30 - Math.floor(i / 2) * 25} schX={7 + (i % 2) * 1} schY={-8 + Math.floor(i / 2) * 0.7} />
      ))}
      {Array.from({ length: nBank }, (_, i) => (
        <capacitor key={`bb${i}`} name={`CBB${i}B`} capacitance="470uF" footprint={<SnapInFP />} pcbX={w / 2 - 110 + (i % 2) * 20} pcbY={h / 2 - 42 - Math.floor(i / 2) * 25} schX={7 + (i % 2) * 1} schY={-7.65 + Math.floor(i / 2) * 0.7} />
      ))}
      {/* HR-20: 2-series 47 k per string half (bank ≤525 V → ≤131 V & 0.37 W per element) */}
      <resistor name="RBALTA1" resistance="47k" footprint="2512" pcbX={w / 2 - 180} pcbY={h / 2 - 30} schX={3.4} schY={-8} />
      <resistor name="RBALTA2" resistance="47k" footprint="2512" pcbX={w / 2 - 188} pcbY={h / 2 - 30} schX={3.1} schY={-8} />
      <resistor name="RBALBA1" resistance="47k" footprint="2512" pcbX={w / 2 - 180} pcbY={h / 2 - 42} schX={3.4} schY={-7.65} />
      <resistor name="RBALBA2" resistance="47k" footprint="2512" pcbX={w / 2 - 188} pcbY={h / 2 - 42} schX={3.1} schY={-7.65} />
      <resistor name="RBALTB1" resistance="47k" footprint="2512" pcbX={w / 2 - 90} pcbY={h / 2 - 30} schX={9} schY={-8} />
      <resistor name="RBALTB2" resistance="47k" footprint="2512" pcbX={w / 2 - 82} pcbY={h / 2 - 30} schX={9.3} schY={-8} />
      <resistor name="RBALBB1" resistance="47k" footprint="2512" pcbX={w / 2 - 90} pcbY={h / 2 - 42} schX={9} schY={-7.65} />
      <resistor name="RBALBB2" resistance="47k" footprint="2512" pcbX={w / 2 - 82} pcbY={h / 2 - 42} schX={9.3} schY={-7.65} />
      <capacitor name="CBAF" capacitance="1uF" footprint={FilmBoxFP(27.5)} pcbX={w / 2 - 160} pcbY={h / 2 - 20} schX={6} schY={-6.4} />
      <capacitor name="CBBF" capacitance="1uF" footprint={FilmBoxFP(27.5)} pcbX={w / 2 - 110} pcbY={h / 2 - 15} schX={8.4} schY={-6.4} />
      {Array.from({ length: nBank }, (_, i) => [
        <trace key={`ap${i}`} from={`.CBA${i}T > .pin1`} to="net.BKAP" />,
        <trace key={`am${i}`} from={`.CBA${i}T > .pin2`} to="net.BKAM" />,
        <trace key={`am2${i}`} from={`.CBA${i}B > .pin1`} to="net.BKAM" />,
        <trace key={`an${i}`} from={`.CBA${i}B > .pin2`} to="net.BKAN" />,
        <trace key={`bp${i}`} from={`.CBB${i}T > .pin1`} to="net.BKBP" />,
        <trace key={`bm${i}`} from={`.CBB${i}T > .pin2`} to="net.BKBM" />,
        <trace key={`bm2${i}`} from={`.CBB${i}B > .pin1`} to="net.BKBM" />,
        <trace key={`bn${i}`} from={`.CBB${i}B > .pin2`} to="net.BKBN" />,
      ])}
      <trace from=".RBALTA1 > .pin1" to="net.BKAP" />
      <trace from=".RBALTA1 > .pin2" to=".RBALTA2 > .pin1" />
      <trace from=".RBALTA2 > .pin2" to="net.BKAM" />
      <trace from=".RBALBA1 > .pin1" to="net.BKAM" />
      <trace from=".RBALBA1 > .pin2" to=".RBALBA2 > .pin1" />
      <trace from=".RBALBA2 > .pin2" to="net.BKAN" />
      <trace from=".RBALTB1 > .pin1" to="net.BKBP" />
      <trace from=".RBALTB1 > .pin2" to=".RBALTB2 > .pin1" />
      <trace from=".RBALTB2 > .pin2" to="net.BKBM" />
      <trace from=".RBALBB1 > .pin1" to="net.BKBM" />
      <trace from=".RBALBB1 > .pin2" to=".RBALBB2 > .pin1" />
      <trace from=".RBALBB2 > .pin2" to="net.BKBN" />
      <trace from=".CBAF > .pin1" to="net.BKAP" />
      <trace from=".CBAF > .pin2" to="net.BKAN" />
      <trace from=".CBBF > .pin1" to="net.BKBP" />
      <trace from=".CBBF > .pin2" to="net.BKBN" />

      {/* S/P matrix (mirror-contact relays + readback, E30) + coil driver.
          HR-19: at 120 kW the paralleled second relay per HV function is a real schematic
          instance (contacts + coil + series mirror), not a BOM multiplier. */}
      <SeriesParallelRelayMatrix bkAp="net.BKAP" bkAn="net.BKAN" bkBp="net.BKBP" bkBn="net.BKBN"
        outp="net.OUTP" outn="net.OUTN_SH" dual={channels === 4} x={w / 2 - 220} y={-h / 2 + 100} sx={2} sy={2} />
      {/* HR-15: commanded bank bleeders — banks otherwise hold ≤525 V for 3–14 min on the balance
          chains alone (bus discharge never touches them). One GPIO drives both optos; default-OFF
          like the bus chain (E19 rev B pattern). 4× 2.2 k 10 W axial per bank: τ ≈ 4–17 s,
          ≤65 J/resistor at 120 kW. F.21b supervision per protection-thresholds rev C. */}
      {[0, 1, 2, 3].map(i => (
        <chip key={`ba${i}`} name={`RBDA${i}`} footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={w / 2 - 240 + i * 10} pcbY={-h / 2 + 150} schX={0.5 + i * 0.7} schY={5.5} />
      ))}
      {[0, 1, 2, 3].map(i => (
        <chip key={`bb${i}`} name={`RBDB${i}`} footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={w / 2 - 240 + i * 10} pcbY={-h / 2 + 160} schX={0.5 + i * 0.7} schY={6.1} />
      ))}
      <chip name="QDISA" footprint="to220" pinLabels={{ pin1: "G", pin2: "D", pin3: "S" }} pcbX={w / 2 - 195} pcbY={-h / 2 + 150} schX={3.6} schY={5.5} />
      <chip name="QDISB" footprint="to220" pinLabels={{ pin1: "G", pin2: "D", pin3: "S" }} pcbX={w / 2 - 195} pcbY={-h / 2 + 160} schX={3.6} schY={6.1} />
      {/* ECO-2a (E33 rev B): PV drivers replace the opto+bias stacks — bleeders need ms-class
          default-OFF drive only; −₹204/module, two fewer floating supplies */}
      <PvGateDrive id="A" ctl="net.CTL_QDISBK" gateOut="net.G_QDISA" src="net.BKAN" x={w / 2 - 260} y={-h / 2 + 150} sx={-1.5} sy={5.5} />
      <PvGateDrive id="B" ctl="net.CTL_QDISBK" gateOut="net.G_QDISB" src="net.BKBN" x={w / 2 - 260} y={-h / 2 + 160} sx={-1.5} sy={6.1} />
      <trace from=".RBDA0 > .A" to="net.BKAP" />
      <trace from=".RBDA0 > .B" to=".RBDA1 > .A" />
      <trace from=".RBDA1 > .B" to=".RBDA2 > .A" />
      <trace from=".RBDA2 > .B" to=".RBDA3 > .A" />
      <trace from=".RBDA3 > .B" to=".QDISA > .D" />
      <trace from=".QDISA > .S" to="net.BKAN" />
      <trace from=".QDISA > .G" to="net.G_QDISA" />
      <trace from=".RBDB0 > .A" to="net.BKBP" />
      <trace from=".RBDB0 > .B" to=".RBDB1 > .A" />
      <trace from=".RBDB1 > .B" to=".RBDB2 > .A" />
      <trace from=".RBDB2 > .B" to=".RBDB3 > .A" />
      <trace from=".RBDB3 > .B" to=".QDISB > .D" />
      <trace from=".QDISB > .S" to="net.BKBN" />
      <trace from=".QDISB > .G" to="net.G_QDISB" />
      <CoilDriver id="LB" ins={["net.CTL_KSER", "net.CTL_KPARA", "net.CTL_KPARB", "net.CTL_KOUT", "net.CTL_KPREA", "net.CTL_KPREB", "net.DGND", "net.DGND"]}
        outs={["net.COIL_KSER", "net.COIL_KPARA", "net.COIL_KPARB", "net.COIL_KOUT", "net.COIL_KPREA", "net.COIL_KPREB", "net.NC_O7", "net.NC_O8"]}
        x={w / 2 - 260} y={-h / 2 + 40} sx={2} sy={5} />

      {/* output: shunt in negative, filter, studs, Y caps */}
      <OutputShunt inn="net.OUTN_SH" out="net.SNS_IOUT" outN="net.SNS_IOUTN" x={w / 2 - 120} y={-h / 2 + 60} sx={5.5} sy={2} />
      <capacitor name="COF1" capacitance="4.7uF" footprint={FilmBoxFP(37.5)} pcbX={w / 2 - 120} pcbY={-h / 2 + 40} schX={5.5} schY={3.4} />
      <capacitor name="COF2" capacitance="4.7uF" footprint={FilmBoxFP(37.5)} pcbX={w / 2 - 120} pcbY={-h / 2 + 30} schX={5.5} schY={4} />
      <capacitor name="CYO1" capacitance="4.7nF" footprint={FilmBoxFP(10)} pcbX={w / 2 - 60} pcbY={-h / 2 + 40} schX={7.5} schY={3.4} />
      <capacitor name="CYO2" capacitance="4.7nF" footprint={FilmBoxFP(10)} pcbX={w / 2 - 60} pcbY={-h / 2 + 30} schX={7.5} schY={4} />
      <chip name="JOUTP" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={w / 2 - 20} pcbY={-h / 2 + 70} schX={9} schY={2} />
      <chip name="JOUTN" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={w / 2 - 20} pcbY={-h / 2 + 30} schX={9} schY={3} />
      <trace from=".JOUTP > .P" to="net.OUTP" />
      <trace from=".JOUTN > .P" to="net.OUTN" />
      <trace from=".COF1 > .pin1" to="net.OUTP" />
      <trace from=".COF1 > .pin2" to="net.OUTN" />
      <trace from=".COF2 > .pin1" to="net.OUTP" />
      <trace from=".COF2 > .pin2" to="net.OUTN" />
      <trace from=".CYO1 > .pin1" to="net.OUTP" />
      <trace from=".CYO1 > .pin2" to="net.PE" />
      <trace from=".CYO2 > .pin1" to="net.OUTN" />
      <trace from=".CYO2 > .pin2" to="net.PE" />

      {/* sensing (E25: bank/output voltages isolated inside their own domains — CB-3 fix) */}
      <Bias5Module id="BKA" p5="net.B5BKA" com="net.BKAN" x={-w / 2 + 60} y={-h / 2 + 105} sx={-25} sy={3.4} />
      <Bias5Module id="BKB" p5="net.B5BKB" com="net.BKBN" x={-w / 2 + 60} y={-h / 2 + 98} sx={-23} sy={3.4} />
      <IsoVSense id="OA" hv="net.BKAP" ref="net.BKAN" biasP="net.B5BKA" cf="1nF" out="net.SNS_VBKA" x={-w / 2 + 60} y={-h / 2 + 90} sx={-24} sy={4} />
      <IsoVSense id="OB" hv="net.BKBP" ref="net.BKBN" biasP="net.B5BKB" cf="1nF" out="net.SNS_VBKB" x={-w / 2 + 60} y={-h / 2 + 80} sx={-24} sy={4.8} />
      <IsoVSense id="OV" hv="net.OUTP" ref="net.OUTN" biasP="net.B5OUT" cf="1nF" out="net.SNS_VOUT" x={-w / 2 + 60} y={-h / 2 + 70} sx={-24} sy={5.6} />
      <AnalogMid x={-w / 2 + 60} y={-h / 2 + 35} sx={-20} sy={6.4} />
      <NtcInput id="TLLC" out="net.T_LLC" x={-w / 2 + 60} y={-h / 2 + 55} sx={-24} sy={6.4} />
      <NtcInput id="TXFR" out="net.T_XFMR" x={-w / 2 + 60} y={-h / 2 + 45} sx={-22} sy={6.4} />

      {/* control: MCU-LLC + safety chain + SWD + CAN + HMI + interconnect */}
      <ControlMcu id="LLC" x={-w / 2 + 150} y={-h / 2 + 60} sx={-14} sy={4.4} />
      <Rail3V3 id="B" x={-w / 2 + 190} y={-h / 2 + 40} sx={-12} sy={5.4} />
      <SafetyChain id="B" enLocal="net.EN_LLC" enRemote="net.EN_PFC" wdi="net.WDI_LLC" gateEn="net.GATE_EN_B"
        x={-w / 2 + 150} y={-h / 2 + 95} sx={-14} sy={3} />
      <SwdPort id="LLC" x={-w / 2 + 110} y={-h / 2 + 60} sx={-16} sy={4.4} />
      <trace from=".ULLC > .pin28" to="net.SWDIO_LLC" />
      <trace from=".ULLC > .pin29" to="net.SWCLK_LLC" />
      <trace from=".ULLC > .pin100" to="net.BOOT0_LLC" />
      <resistor name="RFLTB" resistance="4.7k" footprint="0603" pcbX={-w / 2 + 190} pcbY={-h / 2 + 95} schX={-12} schY={3} />
      <capacitor name="CFLTB" capacitance="1nF" footprint="0603" pcbX={-w / 2 + 196} pcbY={-h / 2 + 95} schX={-11.5} schY={3} />
      <trace from=".RFLTB > .pin1" to="net.V3P3" />
      <trace from=".RFLTB > .pin2" to="net.FLT_LLC" />
      <trace from=".CFLTB > .pin1" to="net.FLT_LLC" />
      <trace from=".CFLTB > .pin2" to="net.DGND" />
      <resistor name="RAGTB" resistance="0" footprint="0805" pcbX={-w / 2 + 202} pcbY={-h / 2 + 95} schX={-11} schY={3.4} />
      <trace from=".RAGTB > .pin1" to="net.AGND" />
      <trace from=".RAGTB > .pin2" to="net.DGND" />
      <IsolatedCan x={-w / 2 + 230} y={-h / 2 + 60} sx={-10} sy={4.4} />
      <ConfigHmi x={-w / 2 + 230} y={-h / 2 + 25} sx={-10} sy={6.2} />
      {/* CB-14: this side of the harness crosses the link — LTX wire lands on this MCU's RX */}
      <InterconnectSignals id="B" ltx="net.LINK_RX" lrx="net.LINK_TX" enA="net.EN_PFC" enB="net.EN_LLC"
        x={-w / 2 + 150} y={-h / 2 + 20} sx={-14} sy={6.6} />
      {llcPins.map(([net, pin]) => (
        <trace key={`${net}${pin}`} from={`.ULLC > .pin${pin}`} to={net} />
      ))}
    </board>
  );
};
