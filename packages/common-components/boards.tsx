// boards.tsx — AC-DC and DC-DC board generators for the two-board sandwich architecture
// (customer directive 2026-09-04; supersedes single-board §30 — see docs/assumptions.md E17).
// Lanes/channels parameterized: 30 kW = 1, 60 kW = 2, 120 kW = 4. Schematic-complete; PCB layout
// deliberately untuned. Pin maps below are the §20 no-silent-reuse artifact (asserted at build).
import {
  ViennaPhase, LlcHalfBridgeLeg, LlcSection, SplitDcLink, SeriesParallelRelayMatrix,
  HvDivider, CtSensor, NtcInput, ConfigHmi, ControlMcu, CoilDriver, InterconnectSignals,
  AuxPower, FanPort, IsolatedCan, OutputShunt, StudFP, Relay2PFP, FilmBoxFP, Cm3FP, SnapInFP,
} from "../power-primitives/cells";

const assertUniquePins = (label: string, entries: [string, number][]) => {
  const seen = new Map<number, string>();
  for (const [net, pin] of entries) {
    if ([10, 11, 14, 26, 27].includes(pin)) throw new Error(`${label}: pin ${pin} is a power/reset pin (${net})`);
    if (seen.has(pin)) throw new Error(`${label}: pin ${pin} reused by ${seen.get(pin)} and ${net}`);
    seen.set(pin, net);
  }
  return entries;
};

// ================= AC-DC BOARD =================
export const AcDcBoard = ({ lanes, w, h }: { lanes: number; w: number; h: number }) => {
  const phases = Array.from({ length: lanes }, (_, l) => ["A", "B", "C"].map(p => ({ id: `${p}${l}`, ac: `net.AC${p === "A" ? "1F" : p === "B" ? "2F" : "3"}` }))).flat();
  // MCU-PFC pin map (§20): PWM per phase, CT per phase, AC/bus senses, temps, fans, link, safety
  const pfcPins: [string, number][] = [
    ...phases.map((p, i) => [`net.PWM_${p.id}`, 55 + i] as [string, number]),
    ...phases.map((p, i) => [`net.I_${p.id}`, 30 + i] as [string, number]),
    ["net.SNS_VAC1", 43], ["net.SNS_VAC2", 44], ["net.SNS_VAC3", 45],
    ["net.SNS_VBUSP", 46], ["net.SNS_VMID", 47],
    ["net.T_PFC", 48], ["net.T_INLET", 49],
    ["net.FAN_PWM1", 76], ["net.FAN_TACH1", 77], ["net.FAN_PWM2", 78], ["net.FAN_TACH2", 79],
    ["net.LINK_TX", 68], ["net.LINK_RX", 69], ["net.PWM_KILL", 70], ["net.GATE_EN", 71],
    ["net.CTL_KPRE", 72], ["net.CTL_QDIS", 73], ["net.FLT_PFC", 74],
  ];
  assertUniquePins("MCU-PFC", pfcPins);
  const nDcHalf = lanes === 1 ? 5 : lanes === 2 ? 9 : 18;
  const dcBanks = nDcHalf <= 5 ? [[nDcHalf, 0]] : nDcHalf <= 10 ? [[5, 0], [nDcHalf - 5, 1]] : [[6, 0], [6, 1], [6, 2]];
  return (
    <board width={`${w}mm`} height={`${h}mm`} routingDisabled>
      {/* AC entry, protection, EMI (§26/§27): fuses → MOV Δ → CM stage 1 → X → CM stage 2 → X → Y */}
      {["ACL1", "ACL2", "ACL3", "PE"].map((n, i) => (
        <chip key={n} name={`J${n}`} footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={-w / 2 + 15} pcbY={h / 2 - 20 - i * 30} schX={-26} schY={-8 + i * 1.4} />
      ))}
      {[1, 2, 3].map(i => (
        <chip key={i} name={`F${i}`} footprint={FilmBoxFP(30)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={-w / 2 + 55} pcbY={h / 2 - 20 - (i - 1) * 25} schX={-24} schY={-8 + (i - 1) * 1.4} />
      ))}
      {[1, 2, 3].map(i => (
        <chip key={i} name={`MOV${i}`} footprint={FilmBoxFP(10)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={-w / 2 + 55} pcbY={h / 2 - 105 - (i - 1) * 15} schX={-24} schY={-3.5 + (i - 1) * 0.7} />
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
      {/* fuses → LFx; MOV delta on LFx; CM1; X1 on ACxM; CM2; X2+Y on ACx final */}
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
      {/* precharge (E14 rev): 33 Ω in L1 and L2, 2-pole bypass; every line-line loop sees ≥1 R */}
      <chip name="KPRE" footprint={<Relay2PFP />} pinLabels={{ pin1: "C1", pin2: "C2", pin3: "A1", pin4: "B1", pin5: "A2", pin6: "B2" }} pcbX={-w / 2 + 220} pcbY={h / 2 - 25} schX={-14} schY={-8} />
      <resistor name="RPRE1" resistance="33" footprint="2512" pcbX={-w / 2 + 220} pcbY={h / 2 - 55} schX={-14} schY={-6.6} />
      <resistor name="RPRE2" resistance="33" footprint="2512" pcbX={-w / 2 + 220} pcbY={h / 2 - 65} schX={-14} schY={-6} />
      <trace from="net.AC1" to=".RPRE1 > .pin1" />
      <trace from=".RPRE1 > .pin2" to="net.AC1F" />
      <trace from=".KPRE > .A1" to="net.AC1" />
      <trace from=".KPRE > .B1" to="net.AC1F" />
      <trace from="net.AC2" to=".RPRE2 > .pin1" />
      <trace from=".RPRE2 > .pin2" to="net.AC2F" />
      <trace from=".KPRE > .A2" to="net.AC2" />
      <trace from=".KPRE > .B2" to="net.AC2F" />
      <trace from=".KPRE > .C1" to="net.V24" />
      <trace from=".KPRE > .C2" to="net.COIL_KPRE" />

      {/* Vienna lanes */}
      {phases.map((p, i) => (
        <ViennaPhase key={p.id} id={p.id} ac={p.ac} dcp="net.DCP" dcn="net.DCN" mid="net.MID"
          pwm={`net.PWM_${p.id}`} flt="net.FLT_PFC"
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

      {/* discharge: 4× 160 Ω + 1200 V SiC FET, ULN-driven with V15 pull-up (inverted; doc E19) */}
      {[0, 1, 2, 3].map(i => (
        <resistor key={i} name={`RDIS${i}`} resistance="160" footprint="2512" pcbX={w / 2 - 120 + i * 10} pcbY={-h / 2 + 30} schX={2 + i * 0.7} schY={7.5} />
      ))}
      <chip name="QDIS" footprint={<StudFP />} pinLabels={{ pin1: "TAB" }} pcbX={w / 2 - 60} pcbY={-h / 2 + 30} schX={5.4} schY={7.5} />
      <chip name="QDISF" footprint="to220" pinLabels={{ pin1: "G", pin2: "D", pin3: "S" }} pcbX={w / 2 - 75} pcbY={-h / 2 + 45} schX={4.6} schY={7.9} />
      <resistor name="RQDG" resistance="100" footprint="0805" pcbX={w / 2 - 90} pcbY={-h / 2 + 55} schX={4} schY={8.3} />
      <resistor name="RQDPU" resistance="10k" footprint="0805" pcbX={w / 2 - 100} pcbY={-h / 2 + 55} schX={3.4} schY={8.3} />
      <trace from=".RDIS0 > .pin1" to="net.DCP" />
      <trace from=".RDIS0 > .pin2" to=".RDIS1 > .pin1" />
      <trace from=".RDIS1 > .pin2" to=".RDIS2 > .pin1" />
      <trace from=".RDIS2 > .pin2" to=".RDIS3 > .pin1" />
      <trace from=".RDIS3 > .pin2" to=".QDISF > .D" />
      <trace from=".QDISF > .S" to="net.DCN" />
      <trace from=".RQDG > .pin1" to="net.COIL_QDIS" />
      <trace from=".RQDG > .pin2" to=".QDISF > .G" />
      <trace from=".RQDPU > .pin1" to="net.V15" />
      <trace from=".RQDPU > .pin2" to=".QDISF > .G" />

      {/* sensing: AC dividers + bus dividers */}
      <HvDivider id="V1" hv="net.AC1" lv="net.SNS_VAC1" gnd="net.AGND" x={-w / 2 + 240} y={-h / 2 + 90} sx={-24} sy={4} />
      <HvDivider id="V2" hv="net.AC2" lv="net.SNS_VAC2" gnd="net.AGND" x={-w / 2 + 240} y={-h / 2 + 80} sx={-24} sy={4.8} />
      <HvDivider id="V3" hv="net.AC3" lv="net.SNS_VAC3" gnd="net.AGND" x={-w / 2 + 240} y={-h / 2 + 70} sx={-24} sy={5.6} />
      <HvDivider id="BP" hv="net.DCP" lv="net.SNS_VBUSP" gnd="net.AGND" x={-w / 2 + 240} y={-h / 2 + 60} sx={-24} sy={6.4} />
      <HvDivider id="BM" hv="net.MID" lv="net.SNS_VMID" gnd="net.AGND" x={-w / 2 + 240} y={-h / 2 + 50} sx={-24} sy={7.2} />
      <NtcInput id="TPFC" out="net.T_PFC" x={-w / 2 + 240} y={-h / 2 + 35} sx={-24} sy={8} />
      <NtcInput id="TINL" out="net.T_INLET" x={-w / 2 + 240} y={-h / 2 + 25} sx={-22} sy={8} />

      {/* control: MCU-PFC + coil driver + aux + fans + interconnect */}
      <ControlMcu id="PFC" x={-w / 2 + 60} y={-h / 2 + 60} sx={-14} sy={4} />
      <CoilDriver id="PA" ins={["net.CTL_KPRE", "net.CTL_QDIS", "net.NC_U1", "net.NC_U2", "net.NC_U3", "net.NC_U4", "net.NC_U5", "net.NC_U6"]}
        outs={["net.COIL_KPRE", "net.COIL_QDIS", "net.NC_O1", "net.NC_O2", "net.NC_O3", "net.NC_O4", "net.NC_O5", "net.NC_O6"]}
        x={-w / 2 + 130} y={-h / 2 + 60} sx={-11} sy={4} />
      <AuxPower dcp="net.DCP" dcn="net.DCN" x={-w / 2 + 130} y={-h / 2 + 30} sx={-11} sy={5.6} />
      <FanPort id="1" x={w / 2 - 40} y={-h / 2 + 80} sx={7} sy={4} />
      <FanPort id="2" x={w / 2 - 40} y={-h / 2 + 65} sx={7} sy={4.8} />
      <InterconnectSignals id="A" x={w / 2 - 40} y={-h / 2 + 110} sx={7} sy={5.8} />
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
  const llcPins: [string, number][] = [
    ...legs.map((l, i) => [`net.PWM_L${l.id}H`, 50 + 2 * i] as [string, number]),
    ...legs.map((l, i) => [`net.PWM_L${l.id}L`, 51 + 2 * i] as [string, number]),
    ...Array.from({ length: 3 * channels }, (_, i) => [`net.I_RES${i + 1}`, 30 + i] as [string, number]),
    ["net.SNS_VOUT", 96], ["net.SNS_IOUT", 97], ["net.SNS_VBKA", 98], ["net.SNS_VBKB", 99],
    ["net.T_LLC", 42], ["net.T_XFMR", 43],
    ["net.LINK_TX", 44], ["net.LINK_RX", 45], ["net.PWM_KILL", 46], ["net.GATE_EN", 47],
    ["net.CAN_TX", 48], ["net.CAN_RX", 49],
    ["net.HMI_DAT", 88], ["net.HMI_CLK", 89], ["net.HMI_LAT", 90], ["net.HMI_DIG1", 91], ["net.HMI_DIG2", 92],
    ["net.BTN1", 93], ["net.BTN2", 94],
    ["net.CTL_KSER", 80], ["net.CTL_KPARA", 81], ["net.CTL_KPARB", 82], ["net.CTL_KOUT", 83], ["net.CTL_KPREA", 84], ["net.CTL_KPREB", 85],
  ];
  assertUniquePins("MCU-LLC", llcPins);
  const nBank = channels * 2;
  return (
    <board width={`${w}mm`} height={`${h}mm`} routingDisabled>
      {/* bus entry studs from AC-DC board + film commutation caps per channel */}
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
          pwmH={`net.PWM_L${l.id}H`} pwmL={`net.PWM_L${l.id}L`} flt="net.FLT_LLC"
          x={-w / 2 + 60} y={h / 2 - 70 - i * 44} sx={-16} sy={-7 + i * 4.6} />
      ))}
      {secs.map((s, i) => (
        <LlcSection key={s.id} id={s.id} sw={s.sw} star={s.star}
          bkAp="net.BKAP" bkAn="net.BKAN" bkBp="net.BKBP" bkBn="net.BKBN"
          ctOut={`net.I_RES${s.id}`}
          x={-w / 2 + 180} y={h / 2 - 70 - i * 44} sx={-8} sy={-7 + i * 2.2} />
      ))}

      {/* bank capacitors: electrolytic + film per bank */}
      {Array.from({ length: nBank }, (_, i) => (
        <capacitor key={`a${i}`} name={`CBA${i}`} capacitance="470uF" footprint={<SnapInFP />} pcbX={w / 2 - 160 + (i % 2) * 20} pcbY={h / 2 - 30 - Math.floor(i / 2) * 25} schX={4 + (i % 2) * 1} schY={-8 + Math.floor(i / 2) * 0.7} />
      ))}
      {Array.from({ length: nBank }, (_, i) => (
        <capacitor key={`b${i}`} name={`CBB${i}`} capacitance="470uF" footprint={<SnapInFP />} pcbX={w / 2 - 110 + (i % 2) * 20} pcbY={h / 2 - 30 - Math.floor(i / 2) * 25} schX={7 + (i % 2) * 1} schY={-8 + Math.floor(i / 2) * 0.7} />
      ))}
      <capacitor name="CBAF" capacitance="1uF" footprint={FilmBoxFP(27.5)} pcbX={w / 2 - 160} pcbY={h / 2 - 20} schX={6} schY={-6.4} />
      <capacitor name="CBBF" capacitance="1uF" footprint={FilmBoxFP(27.5)} pcbX={w / 2 - 110} pcbY={h / 2 - 15} schX={8.4} schY={-6.4} />
      {Array.from({ length: nBank }, (_, i) => [
        <trace key={`ap${i}`} from={`.CBA${i} > .pin1`} to="net.BKAP" />,
        <trace key={`an${i}`} from={`.CBA${i} > .pin2`} to="net.BKAN" />,
        <trace key={`bp${i}`} from={`.CBB${i} > .pin1`} to="net.BKBP" />,
        <trace key={`bn${i}`} from={`.CBB${i} > .pin2`} to="net.BKBN" />,
      ])}
      <trace from=".CBAF > .pin1" to="net.BKAP" />
      <trace from=".CBAF > .pin2" to="net.BKAN" />
      <trace from=".CBBF > .pin1" to="net.BKBP" />
      <trace from=".CBBF > .pin2" to="net.BKBN" />

      {/* S/P matrix + coil driver */}
      <SeriesParallelRelayMatrix bkAp="net.BKAP" bkAn="net.BKAN" bkBp="net.BKBP" bkBn="net.BKBN"
        outp="net.OUTP" outn="net.OUTN_SH" x={w / 2 - 220} y={-h / 2 + 100} sx={2} sy={2} />
      <CoilDriver id="LB" ins={["net.CTL_KSER", "net.CTL_KPARA", "net.CTL_KPARB", "net.CTL_KOUT", "net.CTL_KPREA", "net.CTL_KPREB", "net.NC_U7", "net.NC_U8"]}
        outs={["net.COIL_KSER", "net.COIL_KPARA", "net.COIL_KPARB", "net.COIL_KOUT", "net.COIL_KPREA", "net.COIL_KPREB", "net.NC_O7", "net.NC_O8"]}
        x={w / 2 - 260} y={-h / 2 + 40} sx={2} sy={5} />

      {/* output: shunt in negative, filter, studs, Y caps */}
      <OutputShunt inn="net.OUTN_SH" out="net.SNS_IOUT" x={w / 2 - 120} y={-h / 2 + 60} sx={5.5} sy={2} />
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

      {/* sensing */}
      <HvDivider id="OA" hv="net.BKAP" lv="net.SNS_VBKA" gnd="net.AGND" x={-w / 2 + 60} y={-h / 2 + 90} sx={-24} sy={4} />
      <HvDivider id="OB" hv="net.BKBP" lv="net.SNS_VBKB" gnd="net.AGND" x={-w / 2 + 60} y={-h / 2 + 80} sx={-24} sy={4.8} />
      <HvDivider id="OV" hv="net.OUTP" lv="net.SNS_VOUT" gnd="net.AGND" x={-w / 2 + 60} y={-h / 2 + 70} sx={-24} sy={5.6} />
      <NtcInput id="TLLC" out="net.T_LLC" x={-w / 2 + 60} y={-h / 2 + 55} sx={-24} sy={6.4} />
      <NtcInput id="TXFR" out="net.T_XFMR" x={-w / 2 + 60} y={-h / 2 + 45} sx={-22} sy={6.4} />

      {/* control: MCU-LLC + CAN + HMI + interconnect */}
      <ControlMcu id="LLC" x={-w / 2 + 150} y={-h / 2 + 60} sx={-14} sy={4.4} />
      <IsolatedCan x={-w / 2 + 230} y={-h / 2 + 60} sx={-10} sy={4.4} />
      <ConfigHmi x={-w / 2 + 230} y={-h / 2 + 25} sx={-10} sy={6.2} />
      <InterconnectSignals id="B" x={-w / 2 + 150} y={-h / 2 + 20} sx={-14} sy={6.6} />
      {llcPins.map(([net, pin]) => (
        <trace key={`${net}${pin}`} from={`.ULLC > .pin${pin}`} to={net} />
      ))}
    </board>
  );
};
