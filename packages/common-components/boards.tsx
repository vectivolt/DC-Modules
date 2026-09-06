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
  DischargeCtl, PvGateDrive, Rail3V3, StudFP, RelayMFP, FilmBoxFP, DiscFP, Cm3FP, SnapInFP,
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
  // schematic sheet plan (layout-polish rev): EMI row y=36..48 · Vienna lanes x=4 col from y=24
  // down (14/row) · line-CT col x=40 · HV-sense col x=56 · DC-link/discharge col x=80 · control
  // row starts below the tallest column; cY is its baseline.
  const cY = Math.min(24 - 3 * lanes * 14, 26 - 3 * lanes * 4.5 - 8, -16) - 12;
  const dcBanks = nDcHalf <= 5 ? [[nDcHalf, 0]] : nDcHalf <= 10 ? [[5, 0], [nDcHalf - 5, 1]] : [[6, 0], [6, 1], [6, 2]];
    // ---------------------------------------------------------------------------------------------
  // PCB PLACEMENT (layout phase). Board 440 x 340: the rack fixes width at <=440 and leaves depth
  // free to 560, and at 420 x 300 the courtyard fill was 58.9 % -- the top of what a high-current
  // board can route. 40 mm of depth buys 19 % more area and drops the fill to ~50 %.
  //
  //   x -218..-142   LEFT COLUMN   AC entry, fuses, surge, then both CM chokes below
  //   x -137..+137   VIENNA ROW    three 89 x 161 cells, tops aligned at y +168
  //   x  142..218    RIGHT COLUMN  DC studs, discharge, isolated HV senses
  //   y -168..-12    BOTTOM        precharge, X/Y caps, DM chokes, DC link, control strip
  //
  // Power enters top-left, drops through the filter, crosses the Vienna row left to right, and
  // lands on the DC link below it. The control strip runs along the bottom edge, away from every
  // switching node, which is the §3 rule that outranks tidiness.
  const P = {
    // AC entry + protection + both CM chokes own the left column, x -218..-142, full height
    jacl: [176, 152, 128] as const, jaclX: -206, jpeY: 104,
    fuse: [176, 154, 132] as const, fuseX: -170,
    gdtX: -212, movX: -188, movpX: -162, surgeY: [80, 54, 28] as const,
    cmc1: [-180, -22] as const, cmc2: [-180, -100] as const,
    // Vienna row: 89 mm cells on a 95 mm pitch, tops aligned at y +188
    vp: [-95, 0, 95] as const, vpY: 93,
    // Power band, y +8..-150. The DC-link bank is 230 mm wide (5 caps at 40 mm pitch plus its
    // balance dividers), so it takes the right of the band and everything else takes the left.
    ivsX: -105, ivsY: [-20, -32, -44, -56, -68] as const, b5: [-105, -86] as const,
    cx1X: -46, cxY: [-20, -38, -56] as const, cx2X: -46, cx2Y: [-74, -92, -110] as const,
    // DM chokes, Y caps and the neutral-star dividers sit in the strip ABOVE the bank
    ldmX: 30, ldmY: [-8, -8, -8] as const, ldmStep: 32,
    cyX: 130, cyY: [-8, -8, -8] as const, cyStep: 30,
    rnsX: [30, 44] as const, rnsY: 6,
    kpreX: -110, kpre: [-130, -130] as const, rpre: [6, 6] as const,
    // right column, clear of the Vienna row (which ends at x 139.5)
    studX: 205, stud: [176, 150, 124] as const, qdis: [205, 76] as const,
    dschX: 172, dschY: 76, ctsX: 158, ctsY: [44, 10, -24] as const,
    fanX: 198, fanY: -108, ntcX: 192, ntcY: -145,
    // control strip along the bottom edge, end to end by real width
    ctlY: -172, mcuX: -121, swdX: -93, sfcX: -70, r3v3X: -26, auxX: 13,
    avmidX: 131, icX: 183,
  };

return (
    <board width={`${w}mm`} height={`${h}mm`} routingDisabled schTraceAutoLabelEnabled schMaxTraceDistance={0}>
      {/* AC entry, protection, EMI (§26/§27): fuses → MOV Δ + MOV/GDT L-PE → CM1 → X → CM2 → X → Y */}
      {["ACL1", "ACL2", "ACL3", "PE"].map((n, i) => (
        <chip key={n} name={`J${n}`} footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={P.jaclX} pcbY={i < 3 ? P.jacl[i] : P.jpeY} schX={i < 3 ? 0 : 20} schY={i < 3 ? 46 - i * 3 : 37} />
      ))}
      {[1, 2, 3].map(i => (
        <chip key={i} name={`F${i}`} footprint={FilmBoxFP(30, [48, 16])} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={P.fuseX} pcbY={P.fuse[i - 1]} schX={5} schY={46 - (i - 1) * 3} />
      ))}
      {[1, 2, 3].map(i => (
        <chip key={i} name={`MOV${i}`} footprint={DiscFP(10, 20)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={P.movX} pcbY={P.surgeY[i - 1]} schX={10} schY={46 - (i - 1) * 3} />
      ))}
      {/* HR-7: common-mode surge path — MOV + GDT in series, each line to PE */}
      {[1, 2, 3].map(i => (
        <chip key={`mp${i}`} name={`MOVP${i}`} footprint={DiscFP(10, 20)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={P.movpX} pcbY={P.surgeY[i - 1]} schX={15} schY={46 - (i - 1) * 3} />
      ))}
      {[1, 2, 3].map(i => (
        <chip key={`g${i}`} name={`GDT${i}`} footprint={DiscFP(6, 8)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={P.gdtX} pcbY={P.surgeY[i - 1]} schX={20} schY={46 - (i - 1) * 3} />
      ))}
      <chip name="CMC1" footprint={<Cm3FP />} pinLabels={{ pin1: "A1", pin2: "B1", pin3: "A2", pin4: "B2", pin5: "A3", pin6: "B3" }} pcbX={P.cmc1[0]} pcbY={P.cmc1[1]} schX={26} schY={43} schSectionName="EMI" />
      <chip name="CMC2" footprint={<Cm3FP />} pinLabels={{ pin1: "A1", pin2: "B1", pin3: "A2", pin4: "B2", pin5: "A3", pin6: "B3" }} pcbX={P.cmc2[0]} pcbY={P.cmc2[1]} schX={36} schY={43} schSectionName="EMI" />
      {[1, 2, 3].map(i => (
        <capacitor key={`x1${i}`} name={`CX1${i}`} capacitance="2.2uF" footprint={FilmBoxFP(27.5)} pcbX={P.cx1X} pcbY={P.cxY[i - 1]} schX={31} schY={46 - (i - 1) * 3} schSectionName="EMI" />
      ))}
      {[1, 2, 3].map(i => (
        <capacitor key={`x2${i}`} name={`CX2${i}`} capacitance="2.2uF" footprint={FilmBoxFP(27.5)} pcbX={P.cx2X} pcbY={P.cx2Y[i - 1]} schX={46} schY={46 - (i - 1) * 3} schSectionName="EMI" />
      ))}
      {[1, 2, 3].map(i => (
        <capacitor key={`y${i}`} name={`CY${i}`} capacitance="4.7nF" footprint={FilmBoxFP(10)} pcbX={P.cyX + (i - 1) * P.cyStep} pcbY={P.cyY[i - 1]} schX={51} schY={46 - (i - 1) * 3} />
      ))}
      <trace from=".JACL1 > .P" to=".F1 > .A" />
      <trace from=".JACL2 > .P" to=".F2 > .A" />
      <trace from=".JACL3 > .P" to=".F3 > .A" />
      <trace from=".F1 > .B" to="net.LF1" schDisplayLabel="LF1" />
      <trace from=".F2 > .B" to="net.LF2" schDisplayLabel="LF2" />
      <trace from=".F3 > .B" to="net.LF3" schDisplayLabel="LF3" />
      <trace from=".MOV1 > .A" to="net.LF1" schDisplayLabel="LF1" />
      <trace from=".MOV1 > .B" to="net.LF2" schDisplayLabel="LF2" />
      <trace from=".MOV2 > .A" to="net.LF2" schDisplayLabel="LF2" />
      <trace from=".MOV2 > .B" to="net.LF3" schDisplayLabel="LF3" />
      <trace from=".MOV3 > .A" to="net.LF3" schDisplayLabel="LF3" />
      <trace from=".MOV3 > .B" to="net.LF1" schDisplayLabel="LF1" />
      {[1, 2, 3].map(i => [
        <trace key={`mpa${i}`} from={`.MOVP${i} > .A`} to={`net.LF${i}`} schDisplayLabel={`LF${i}`} />,
        <trace key={`mpb${i}`} from={`.MOVP${i} > .B`} to={`.GDT${i} > .A`} />,
        <trace key={`gb${i}`} from={`.GDT${i} > .B`} to="net.PE" schDisplayLabel="PE" />,
      ])}
      <trace from=".CMC1 > .A1" to="net.LF1" schDisplayLabel="LF1" />
      <trace from=".CMC1 > .A2" to="net.LF2" schDisplayLabel="LF2" />
      <trace from=".CMC1 > .A3" to="net.LF3" schDisplayLabel="LF3" />
      <trace from=".CMC1 > .B1" to="net.AC1M" schDisplayLabel="AC1M" />
      <trace from=".CMC1 > .B2" to="net.AC2M" schDisplayLabel="AC2M" />
      <trace from=".CMC1 > .B3" to="net.AC3M" schDisplayLabel="AC3M" />
      <trace from=".CX11 > .pin1" to="net.AC1M" schDisplayLabel="AC1M" />
      <trace from=".CX11 > .pin2" to="net.AC2M" schDisplayLabel="AC2M" />
      <trace from=".CX12 > .pin1" to="net.AC2M" schDisplayLabel="AC2M" />
      <trace from=".CX12 > .pin2" to="net.AC3M" schDisplayLabel="AC3M" />
      <trace from=".CX13 > .pin1" to="net.AC3M" schDisplayLabel="AC3M" />
      <trace from=".CX13 > .pin2" to="net.AC1M" schDisplayLabel="AC1M" />
      <trace from=".CMC2 > .A1" to="net.AC1M" schDisplayLabel="AC1M" />
      <trace from=".CMC2 > .A2" to="net.AC2M" schDisplayLabel="AC2M" />
      <trace from=".CMC2 > .A3" to="net.AC3M" schDisplayLabel="AC3M" />
      <trace from=".CMC2 > .B1" to="net.AC1D" schDisplayLabel="AC1D" />
      <trace from=".CMC2 > .B2" to="net.AC2D" schDisplayLabel="AC2D" />
      <trace from=".CMC2 > .B3" to="net.AC3D" schDisplayLabel="AC3D" />
      {[1, 2, 3].map(i => (
        <inductor key={`ldm${i}`} name={`LDM${i}`} inductance="22uH" footprint={FilmBoxFP(20)} pcbX={P.ldmX + (i - 1) * P.ldmStep} pcbY={P.ldmY[i - 1]} schX={41} schY={46 - (i - 1) * 3} schSectionName="EMI" />
      ))}
      <trace from=".LDM1 > .pin1" to="net.AC1D" schDisplayLabel="AC1D" />
      <trace from=".LDM1 > .pin2" to="net.AC1" schDisplayLabel="AC1" />
      <trace from=".LDM2 > .pin1" to="net.AC2D" schDisplayLabel="AC2D" />
      <trace from=".LDM2 > .pin2" to="net.AC2" schDisplayLabel="AC2" />
      <trace from=".LDM3 > .pin1" to="net.AC3D" schDisplayLabel="AC3D" />
      <trace from=".LDM3 > .pin2" to="net.AC3" schDisplayLabel="AC3" />
      <trace from=".CX21 > .pin1" to="net.AC1" schDisplayLabel="AC1" />
      <trace from=".CX21 > .pin2" to="net.AC2" schDisplayLabel="AC2" />
      <trace from=".CX22 > .pin1" to="net.AC2" schDisplayLabel="AC2" />
      <trace from=".CX22 > .pin2" to="net.AC3" schDisplayLabel="AC3" />
      <trace from=".CX23 > .pin1" to="net.AC3" schDisplayLabel="AC3" />
      <trace from=".CX23 > .pin2" to="net.AC1" schDisplayLabel="AC1" />
      <trace from=".CY1 > .pin1" to="net.AC1" schDisplayLabel="AC1" />
      <trace from=".CY1 > .pin2" to="net.PE" schDisplayLabel="PE" />
      <trace from=".CY2 > .pin1" to="net.AC2" schDisplayLabel="AC2" />
      <trace from=".CY2 > .pin2" to="net.PE" schDisplayLabel="PE" />
      <trace from=".CY3 > .pin1" to="net.AC3" schDisplayLabel="AC3" />
      <trace from=".CY3 > .pin2" to="net.PE" schDisplayLabel="PE" />
      <trace from=".JPE > .P" to="net.PE" schDisplayLabel="PE" />
      {/* precharge (E14 rev): 33 Ω pulse resistors in L1/L2; CB-8: bypass = 2× line-rated power
          relays w/ mirror contacts (series readback chain — both-open proof before precharge) */}
      {["1", "2"].map((k, i) => (
        <chip key={k} name={`KPRE${k}`} footprint={<RelayMFP />} pinLabels={{ pin1: "C1", pin2: "C2", pin3: "A", pin4: "B", pin5: "M1", pin6: "M2" }} pcbX={P.kpreX + (k - 1) * 60} pcbY={P.kpre[k - 1]} schX={58} schY={46 - i * 4} />
      ))}
      <chip name="RPRE1" footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={70} pcbY={P.rpre[0]} schX={62.5} schY={46} schSectionName="PRECHG" />
      <chip name="RPRE2" footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={104} pcbY={P.rpre[1]} schX={62.5} schY={42} schSectionName="PRECHG" />
      <resistor name="RKFBP" resistance="10k" footprint="0603" pcbX={138} pcbY={P.rpre[1]} schX={67} schY={44} schSectionName="PRECHG" />
      <trace from="net.AC1" to=".RPRE1 > .A" schDisplayLabel="AC1" />
      <trace from=".RPRE1 > .B" to="net.AC1F" schDisplayLabel="AC1F" />
      <trace from=".KPRE1 > .A" to="net.AC1" schDisplayLabel="AC1" />
      <trace from=".KPRE1 > .B" to="net.AC1F" schDisplayLabel="AC1F" />
      <trace from="net.AC2" to=".RPRE2 > .A" schDisplayLabel="AC2" />
      <trace from=".RPRE2 > .B" to="net.AC2F" schDisplayLabel="AC2F" />
      <trace from=".KPRE2 > .A" to="net.AC2" schDisplayLabel="AC2" />
      <trace from=".KPRE2 > .B" to="net.AC2F" schDisplayLabel="AC2F" />
      <trace from=".KPRE1 > .C1" to="net.V24" schDisplayLabel="V24" />
      <trace from=".KPRE1 > .C2" to="net.COIL_KPRE" schDisplayLabel="COIL_KPRE" />
      <trace from=".KPRE2 > .C1" to="net.V24" schDisplayLabel="V24" />
      <trace from=".KPRE2 > .C2" to="net.COIL_KPRE" schDisplayLabel="COIL_KPRE" />
      <trace from=".KPRE1 > .M1" to="net.DGND" schDisplayLabel="DGND" />
      <trace from=".KPRE1 > .M2" to=".KPRE2 > .M1" />
      <trace from=".KPRE2 > .M2" to="net.RELAY_FB_KPRE" schDisplayLabel="RELAY_FB_KPRE" />
      <trace from=".RKFBP > .pin1" to="net.V3P3" schDisplayLabel="V3P3" />
      <trace from=".RKFBP > .pin2" to="net.RELAY_FB_KPRE" schDisplayLabel="RELAY_FB_KPRE" />

      {/* Vienna lanes (film commutation caps now inside each phase — CB-9) */}
      {phases.map((p, i) => (
        <ViennaPhase key={p.id} id={p.id} ac={p.ac} dcp="net.DCP" dcn="net.DCN" mid="net.MID"
          pwm={`net.PWM_${p.id}`} flt="net.FLT_PFC" en="net.GATE_EN_A"
          x={P.vp[i % 3]} y={P.vpY - Math.floor(i / 3) * 172} sx={4} sy={24 - i * 14} />
      ))}
      {/* per-phase line CTs (primary = line conductor through aperture; §19/E18) */}
      {phases.map((p, i) => (
        <CtSensor key={p.id} id={p.id} out={`net.I_${p.id}`} x={P.ctsX} y={P.ctsY[i % 3]} sx={40} sy={26 - i * 4.5} />
      ))}

      {/* DC link banks + balance */}
      {dcBanks.map(([n, k]) => (
        <SplitDcLink key={-62} id={`${k}`} nPerHalf={n} dcp="net.DCP" dcn="net.DCN" mid="net.MID"
          x={0} y={-62} sx={10} sy={-62} />
      ))}

      {/* discharge: 4× 160 Ω pulse resistors + 1200 V SiC FET.
          CB-11: default-OFF isolated drive (DischargeCtl), gate pulled down to DCN. */}
      {[0, 1, 2, 3].map(i => (
        <chip key={i} name={`RDIS${i}`} footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={P.dschX - 30} pcbY={P.qdis[1] - 34 - i * 11} schX={80 + i * 2.4} schY={-2} schSectionName="DISCH" />
      ))}
      <chip name="QDIS" footprint={<StudFP />} pinLabels={{ pin1: "TAB" }} pcbX={P.qdis[0]} pcbY={P.qdis[1]} schX={93} schY={-2} schSectionName="DISCH" />
      <chip name="QDISF" footprint="to220" pinLabels={{ pin1: "G", pin2: "D", pin3: "S" }} pcbX={P.dschX} pcbY={P.qdis[1]} schX={90} schY={-2} schSectionName="DISCH" />
      <DischargeCtl ctl="net.CTL_QDIS" gateOut="net.G_QDIS" dcn="net.DCN" x={P.dschX} y={P.dschY} sx={83} sy={-7} />
      <trace from=".RDIS0 > .A" to="net.DCP" schDisplayLabel="DCP" />
      <trace from=".RDIS0 > .B" to=".RDIS1 > .A" />
      <trace from=".RDIS1 > .B" to=".RDIS2 > .A" />
      <trace from=".RDIS2 > .B" to=".RDIS3 > .A" />
      <trace from=".RDIS3 > .B" to=".QDISF > .D" />
      <trace from=".QDISF > .S" to="net.DCN" schDisplayLabel="DCN" />
      <trace from=".QDISF > .G" to="net.G_QDIS" />

      {/* sensing (E25: every HV sense isolated; SELV control domain preserved).
          AC senses reference a 3×(2×47 k) artificial star (HR-20: 2-series halves per-element
          V/W — 0.46 W & 152 Vrms each); bus senses reference DCN. NOTE: the star doubles as the
          X-cap bleed path (τ ≈ 0.42 s) — do not delete without replacing that function. */}
      {[1, 2, 3].map(i => [
        <resistor key={`nsa${i}`} name={`RNS${i}A`} resistance="47k" footprint="2512" pcbX={P.rnsX[0]} pcbY={P.rnsY - i * 7} schX={56} schY={32 - i * 1.6} schSectionName="SENSE" />,
        <resistor key={`nsb${i}`} name={`RNS${i}B`} resistance="47k" footprint="2512" pcbX={P.rnsX[1]} pcbY={P.rnsY - i * 7} schX={58.4} schY={32 - i * 1.6} schSectionName="SENSE" />,
      ])}
      {[1, 2, 3].map(i => [
        <trace key={`nt1${i}`} from={`.RNS${i}A > .pin1`} to={`net.AC${i}`} schDisplayLabel={`AC${i}`} />,
        <trace key={`nt2${i}`} from={`.RNS${i}A > .pin2`} to={`.RNS${i}B > .pin1`} />,
        <trace key={`nt3${i}`} from={`.RNS${i}B > .pin2`} to="net.NSTAR" schDisplayLabel="NSTAR" />,
      ])}
      <Bias5Module id="AC" p5="net.B5AC" com="net.NSTAR" x={P.b5[0]} y={P.b5[1]} sx={62} sy={30.4} />
      <Bias5Module id="BUS" p5="net.B5BUS" com="net.DCN" x={P.b5[0]} y={P.b5[1] - 14} sx={66} sy={30.4} />
      <IsoVSense id="V1" hv="net.AC1" ref="net.NSTAR" biasP="net.B5AC" rBot="11.5k" out="net.SNS_VAC1" x={P.ivsX} y={P.ivsY[0]} sx={56} sy={24} />
      <IsoVSense id="V2" hv="net.AC2" ref="net.NSTAR" biasP="net.B5AC" rBot="11.5k" out="net.SNS_VAC2" x={P.ivsX} y={P.ivsY[1]} sx={56} sy={19.5} />
      <IsoVSense id="V3" hv="net.AC3" ref="net.NSTAR" biasP="net.B5AC" rBot="11.5k" out="net.SNS_VAC3" x={P.ivsX} y={P.ivsY[2]} sx={56} sy={15} />
      <IsoVSense id="BP" hv="net.DCP" ref="net.DCN" biasP="net.B5BUS" cf="1nF" out="net.SNS_VBUSP" x={P.ivsX} y={P.ivsY[3]} sx={56} sy={10.5} />
      <IsoVSense id="BM" hv="net.MID" ref="net.DCN" biasP="net.B5BUS" cf="1nF" out="net.SNS_VMID" x={P.ivsX} y={P.ivsY[4]} sx={56} sy={6} />
      <AnalogMid x={P.avmidX} y={P.ctlY} sx={56} sy={-2} />
      <NtcInput id="TPFC" out="net.T_PFC" x={P.ntcX} y={P.ntcY} sx={56} sy={-6.5} />
      <NtcInput id="TINL" out="net.T_INLET" x={P.ntcX} y={P.ntcY - 8} sx={68} sy={-6.5} />

      {/* control: MCU-PFC + safety chain + SWD + coil driver + aux + fans + interconnect */}
      <ControlMcu id="PFC" x={P.mcuX} y={P.ctlY} sx={4} sy={cY} />
      <SafetyChain id="A" enLocal="net.EN_PFC" enRemote="net.EN_LLC" wdi="net.WDI_PFC" gateEn="net.GATE_EN_A"
        x={P.sfcX} y={P.ctlY} sx={23} sy={cY - 8} />
      <SwdPort id="PFC" x={P.swdX} y={P.ctlY} sx={16} sy={cY} />
      <trace from=".UPFC > .pin28" to="net.SWDIO_PFC" schDisplayLabel="SWDIO_PFC" />
      <trace from=".UPFC > .pin29" to="net.SWCLK_PFC" schDisplayLabel="SWCLK_PFC" />
      <trace from=".UPFC > .pin100" to="net.BOOT0_PFC" schDisplayLabel="BOOT0_PFC" />
      <resistor name="RFLTA" resistance="4.7k" footprint="0603" pcbX={P.swdX + 0 - 14} pcbY={P.ctlY - 22} schX={23} schY={cY - 12.5} schSectionName="SAFETY" />
      <capacitor name="CFLTA" capacitance="1nF" footprint="0603" pcbX={P.swdX + 6 - 14} pcbY={P.ctlY - 22} schX={25.5} schY={cY - 12.5} schSectionName="SAFETY" />
      <trace from=".RFLTA > .pin1" to="net.V3P3" schDisplayLabel="V3P3" />
      <trace from=".RFLTA > .pin2" to="net.FLT_PFC" schDisplayLabel="FLT_PFC" />
      <trace from=".CFLTA > .pin1" to="net.FLT_PFC" schDisplayLabel="FLT_PFC" />
      <trace from=".CFLTA > .pin2" to="net.DGND" schDisplayLabel="DGND" />
      {/* CB-4: analog/digital ground single-point tie + DGND→PE soft bond */}
      <resistor name="RAGTA" resistance="0" footprint="0805" pcbX={P.swdX + 12 - 14} pcbY={P.ctlY - 22} schX={4} schY={cY - 14} schSectionName="BOND" />
      <trace from=".RAGTA > .pin1" to="net.AGND" schDisplayLabel="AGND" />
      <trace from=".RAGTA > .pin2" to="net.DGND" schDisplayLabel="DGND" />
      <resistor name="RPET" resistance="1M" footprint="1206" pcbX={P.swdX + 18 - 14} pcbY={P.ctlY - 22} schX={6.5} schY={cY - 14} schSectionName="BOND" />
      <capacitor name="CPET" capacitance="4.7nF" footprint={FilmBoxFP(10)} pcbX={P.swdX + 26 - 14} pcbY={P.ctlY - 22} schX={9} schY={cY - 14} schSectionName="BOND" />
      <trace from=".RPET > .pin1" to="net.DGND" schDisplayLabel="DGND" />
      <trace from=".RPET > .pin2" to="net.PE" schDisplayLabel="PE" />
      <trace from=".CPET > .pin1" to="net.DGND" schDisplayLabel="DGND" />
      <trace from=".CPET > .pin2" to="net.PE" schDisplayLabel="PE" />
      <CoilDriver id="PA" ins={["net.CTL_KPRE", "net.DGND", "net.DGND", "net.DGND", "net.DGND", "net.DGND", "net.DGND", "net.DGND"]}
        outs={["net.COIL_KPRE", "net.NC_O2", "net.NC_O3", "net.NC_O4", "net.NC_O5", "net.NC_O6", "net.NC_O7A", "net.NC_O8A"]}
        x={-w / 2 + 130} y={-h / 2 + 60} sx={26} sy={cY} />
      <AuxPower dcp="net.DCP" dcn="net.DCN" x={P.auxX} y={P.ctlY} sx={40} sy={cY - 2} />
      <Rail3V3 id="A" x={P.r3v3X} y={P.ctlY} sx={64} sy={cY} />
      {/* E32: rail monitors — firmware finally sees its own supplies (24 V: ÷7.8 → 3.08 V; 15 V: ÷5.7 → 2.63 V) */}
      <resistor name="RM24A" resistance="68k" footprint="0603" pcbX={P.r3v3X + 0 + 26} pcbY={P.ctlY - 22 + 0} schX={64} schY={cY - 4} schSectionName="MON" />
      <resistor name="RM24B" resistance="10k" footprint="0603" pcbX={P.r3v3X + 6 + 26} pcbY={P.ctlY - 22 + 0} schX={66.5} schY={cY - 4} schSectionName="MON" />
      <resistor name="RM15A" resistance="47k" footprint="0603" pcbX={P.r3v3X + 0 + 26} pcbY={P.ctlY - 22 + 7} schX={64} schY={cY - 5.5} schSectionName="MON" />
      <resistor name="RM15B" resistance="10k" footprint="0603" pcbX={P.r3v3X + 6 + 26} pcbY={P.ctlY - 22 + 7} schX={66.5} schY={cY - 5.5} schSectionName="MON" />
      <trace from=".RM24A > .pin1" to="net.V24" schDisplayLabel="V24" />
      <trace from=".RM24A > .pin2" to="net.SNS_V24" schDisplayLabel="SNS_V24" />
      <trace from=".RM24B > .pin1" to="net.SNS_V24" schDisplayLabel="SNS_V24" />
      <trace from=".RM24B > .pin2" to="net.AGND" schDisplayLabel="AGND" />
      <trace from=".RM15A > .pin1" to="net.V15" schDisplayLabel="V15" />
      <trace from=".RM15A > .pin2" to="net.SNS_V15" schDisplayLabel="SNS_V15" />
      <trace from=".RM15B > .pin1" to="net.SNS_V15" schDisplayLabel="SNS_V15" />
      <trace from=".RM15B > .pin2" to="net.AGND" schDisplayLabel="AGND" />
      {Array.from({ length: nFans }, (_, i) => (
        <FanPort key={i} id={`${i + 1}`} x={P.fanX} y={P.fanY - i * 16} sx={74} sy={cY - i * 3} />
      ))}
      <InterconnectSignals id="A" ltx="net.LINK_TX" lrx="net.LINK_RX" enA="net.EN_PFC" enB="net.EN_LLC"
        x={P.icX} y={P.ctlY} sx={92} sy={33} />
      {/* MCU pin bindings (§20 map, asserted unique) */}
      {pfcPins.map(([net, pin]) => (
        <trace key={`${net}${pin}`} from={`.UPFC > .pin${pin}`} to={net} />
      ))}

      {/* DC bus studs to DC-DC board */}
      <chip name="JDCP" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={P.studX} pcbY={P.stud[0]} schX={98} schY={46} schSectionName="INPUT" />
      <chip name="JDCN" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={P.studX} pcbY={P.stud[1]} schX={98} schY={43} schSectionName="INPUT" />
      <chip name="JPEB" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={P.studX} pcbY={P.stud[2]} schX={98} schY={40} schSectionName="INPUT" />
      <trace from=".JDCP > .P" to="net.DCP" schDisplayLabel="DCP" />
      <trace from=".JDCN > .P" to="net.DCN" schDisplayLabel="DCN" />
      <trace from=".JPEB > .P" to="net.PE" schDisplayLabel="PE" />
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
  // schematic sheet plan: bus row y=40..48 · LLC legs x=2 col (16/row from y=24) · sections x=30
  // · banks/matrix/bleeders x=58 · output+senses x=84 · control row below everything at cYd.
  const cYd = Math.min(24 - (3 * channels - 1) * 16 - 9.5, -25) - 10;
  return (
    <board width={`${w}mm`} height={`${h}mm`} routingDisabled schTraceAutoLabelEnabled schMaxTraceDistance={0}>
      {/* bus entry studs from AC-DC board + film commutation caps per leg */}
      <chip name="JDCP" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={-w / 2 + 20} pcbY={h / 2 - 30} schX={0} schY={46} schSectionName="INPUT" />
      <chip name="JDCN" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={-w / 2 + 20} pcbY={h / 2 - 70} schX={0} schY={43} schSectionName="INPUT" />
      <chip name="JPEB" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={-w / 2 + 20} pcbY={h / 2 - 110} schX={0} schY={40} schSectionName="INPUT" />
      <trace from=".JDCP > .P" to="net.DCP" schDisplayLabel="DCP" />
      <trace from=".JDCN > .P" to="net.DCN" schDisplayLabel="DCN" />
      <trace from=".JPEB > .P" to="net.PE" schDisplayLabel="PE" />
      {Array.from({ length: 3 * channels }, (_, i) => (
        <capacitor key={i} name={`CF${i}`} capacitance="1uF" footprint={FilmBoxFP(27.5)} pcbX={-w / 2 + 60 + i * 35} pcbY={h / 2 - 20} schX={6 + i * 2.4} schY={44} />
      ))}
      {Array.from({ length: 3 * channels }, (_, i) => [
        <trace key={`p${i}`} from={`.CF${i} > .pin1`} to="net.DCP" schDisplayLabel="DCP" />,
        <trace key={`n${i}`} from={`.CF${i} > .pin2`} to="net.DCN" schDisplayLabel="DCN" />,
      ])}

      {/* LLC legs + sections */}
      {legs.map((l, i) => (
        <LlcHalfBridgeLeg key={l.id} id={l.id} bus="net.DCP" gnd="net.DCN" sw={l.sw}
          pwmH={`net.PWM_L${l.id}H`} pwmL={`net.PWM_L${l.id}L`} flt="net.FLT_LLC" en="net.GATE_EN_B"
          x={-w / 2 + 60} y={h / 2 - 70 - i * 44} sx={2} sy={24 - i * 16} />
      ))}
      {secs.map((s, i) => (
        <LlcSection key={s.id} id={s.id} sw={s.sw} star={s.star}
          bkAp="net.BKAP" bkAn="net.BKAN" bkBp="net.BKBP" bkBn="net.BKBN"
          ctOut={`net.I_RES${s.id}`}
          x={-w / 2 + 180} y={h / 2 - 70 - i * 44} sx={30} sy={24 - i * 16} />
      ))}

      {/* bank capacitors — E29/CB-2: two-series 450 V strings (900 V string rating vs ≤525 V bank)
          + shared string midpoints + balance dividers; film across each bank */}
      {Array.from({ length: nBank }, (_, i) => (
        <capacitor key={`at${i}`} name={`CBA${i}T`} capacitance="470uF" footprint={<SnapInFP />} pcbX={w / 2 - 160 + (i % 2) * 20} pcbY={h / 2 - 30 - Math.floor(i / 2) * 25} schX={58 + i * 2.2} schY={27} />
      ))}
      {Array.from({ length: nBank }, (_, i) => (
        <capacitor key={`ab${i}`} name={`CBA${i}B`} capacitance="470uF" footprint={<SnapInFP />} pcbX={w / 2 - 160 + (i % 2) * 20} pcbY={h / 2 - 42 - Math.floor(i / 2) * 25} schX={58 + i * 2.2} schY={24.2} />
      ))}
      {Array.from({ length: nBank }, (_, i) => (
        <capacitor key={`bt${i}`} name={`CBB${i}T`} capacitance="470uF" footprint={<SnapInFP />} pcbX={w / 2 - 110 + (i % 2) * 20} pcbY={h / 2 - 30 - Math.floor(i / 2) * 25} schX={58 + i * 2.2} schY={17} />
      ))}
      {Array.from({ length: nBank }, (_, i) => (
        <capacitor key={`bb${i}`} name={`CBB${i}B`} capacitance="470uF" footprint={<SnapInFP />} pcbX={w / 2 - 110 + (i % 2) * 20} pcbY={h / 2 - 42 - Math.floor(i / 2) * 25} schX={58 + i * 2.2} schY={14.2} />
      ))}
      {/* HR-20: 2-series 47 k per string half (bank ≤525 V → ≤131 V & 0.37 W per element) */}
      <resistor name="RBALTA1" resistance="47k" footprint="2512" pcbX={w / 2 - 180} pcbY={h / 2 - 30} schX={58 + nBank * 2.2 + 1.5} schY={28} schSectionName="BANKS" />
      <resistor name="RBALTA2" resistance="47k" footprint="2512" pcbX={w / 2 - 188} pcbY={h / 2 - 30} schX={58 + nBank * 2.2 + 1.5} schY={26.6} schSectionName="BANKS" />
      <resistor name="RBALBA1" resistance="47k" footprint="2512" pcbX={w / 2 - 180} pcbY={h / 2 - 42} schX={58 + nBank * 2.2 + 1.5} schY={25.2} schSectionName="BANKS" />
      <resistor name="RBALBA2" resistance="47k" footprint="2512" pcbX={w / 2 - 188} pcbY={h / 2 - 42} schX={58 + nBank * 2.2 + 1.5} schY={23.8} schSectionName="BANKS" />
      <resistor name="RBALTB1" resistance="47k" footprint="2512" pcbX={w / 2 - 90} pcbY={h / 2 - 30} schX={58 + nBank * 2.2 + 1.5} schY={18} schSectionName="BANKS" />
      <resistor name="RBALTB2" resistance="47k" footprint="2512" pcbX={w / 2 - 82} pcbY={h / 2 - 30} schX={58 + nBank * 2.2 + 1.5} schY={16.6} schSectionName="BANKS" />
      <resistor name="RBALBB1" resistance="47k" footprint="2512" pcbX={w / 2 - 90} pcbY={h / 2 - 42} schX={58 + nBank * 2.2 + 1.5} schY={15.2} schSectionName="BANKS" />
      <resistor name="RBALBB2" resistance="47k" footprint="2512" pcbX={w / 2 - 82} pcbY={h / 2 - 42} schX={58 + nBank * 2.2 + 1.5} schY={13.8} schSectionName="BANKS" />
      <capacitor name="CBAF" capacitance="1uF" footprint={FilmBoxFP(27.5)} pcbX={w / 2 - 160} pcbY={h / 2 - 20} schX={58 + nBank * 2.2 + 5} schY={27} schSectionName="BANKS" />
      <capacitor name="CBBF" capacitance="1uF" footprint={FilmBoxFP(27.5)} pcbX={w / 2 - 110} pcbY={h / 2 - 15} schX={58 + nBank * 2.2 + 5} schY={17} schSectionName="BANKS" />
      {Array.from({ length: nBank }, (_, i) => [
        <trace key={`ap${i}`} from={`.CBA${i}T > .pin1`} to="net.BKAP" schDisplayLabel="BKAP" />,
        <trace key={`am${i}`} from={`.CBA${i}T > .pin2`} to="net.BKAM" schDisplayLabel="BKAM" />,
        <trace key={`am2${i}`} from={`.CBA${i}B > .pin1`} to="net.BKAM" schDisplayLabel="BKAM" />,
        <trace key={`an${i}`} from={`.CBA${i}B > .pin2`} to="net.BKAN" schDisplayLabel="BKAN" />,
        <trace key={`bp${i}`} from={`.CBB${i}T > .pin1`} to="net.BKBP" schDisplayLabel="BKBP" />,
        <trace key={`bm${i}`} from={`.CBB${i}T > .pin2`} to="net.BKBM" schDisplayLabel="BKBM" />,
        <trace key={`bm2${i}`} from={`.CBB${i}B > .pin1`} to="net.BKBM" schDisplayLabel="BKBM" />,
        <trace key={`bn${i}`} from={`.CBB${i}B > .pin2`} to="net.BKBN" schDisplayLabel="BKBN" />,
      ])}
      <trace from=".RBALTA1 > .pin1" to="net.BKAP" schDisplayLabel="BKAP" />
      <trace from=".RBALTA1 > .pin2" to=".RBALTA2 > .pin1" />
      <trace from=".RBALTA2 > .pin2" to="net.BKAM" schDisplayLabel="BKAM" />
      <trace from=".RBALBA1 > .pin1" to="net.BKAM" schDisplayLabel="BKAM" />
      <trace from=".RBALBA1 > .pin2" to=".RBALBA2 > .pin1" />
      <trace from=".RBALBA2 > .pin2" to="net.BKAN" schDisplayLabel="BKAN" />
      <trace from=".RBALTB1 > .pin1" to="net.BKBP" schDisplayLabel="BKBP" />
      <trace from=".RBALTB1 > .pin2" to=".RBALTB2 > .pin1" />
      <trace from=".RBALTB2 > .pin2" to="net.BKBM" schDisplayLabel="BKBM" />
      <trace from=".RBALBB1 > .pin1" to="net.BKBM" schDisplayLabel="BKBM" />
      <trace from=".RBALBB1 > .pin2" to=".RBALBB2 > .pin1" />
      <trace from=".RBALBB2 > .pin2" to="net.BKBN" schDisplayLabel="BKBN" />
      <trace from=".CBAF > .pin1" to="net.BKAP" schDisplayLabel="BKAP" />
      <trace from=".CBAF > .pin2" to="net.BKAN" schDisplayLabel="BKAN" />
      <trace from=".CBBF > .pin1" to="net.BKBP" schDisplayLabel="BKBP" />
      <trace from=".CBBF > .pin2" to="net.BKBN" schDisplayLabel="BKBN" />

      {/* S/P matrix (mirror-contact relays + readback, E30) + coil driver.
          HR-19: at 120 kW the paralleled second relay per HV function is a real schematic
          instance (contacts + coil + series mirror), not a BOM multiplier. */}
      <SeriesParallelRelayMatrix bkAp="net.BKAP" bkAn="net.BKAN" bkBp="net.BKBP" bkBn="net.BKBN"
        outp="net.OUTP" dual={channels === 4} x={w / 2 - 220} y={-h / 2 + 100} sx={58} sy={4} />
      {/* HR-15: commanded bank bleeders — banks otherwise hold ≤525 V for 3–14 min on the balance
          chains alone (bus discharge never touches them). One GPIO drives both optos; default-OFF
          like the bus chain (E19 rev B pattern). 4× 2.2 k 10 W axial per bank: τ ≈ 4–17 s,
          ≤65 J/resistor at 120 kW. F.21b supervision per protection-thresholds rev C. */}
      {[0, 1, 2, 3].map(i => (
        <chip key={`ba${i}`} name={`RBDA${i}`} footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={w / 2 - 240 + i * 10} pcbY={-h / 2 + 150} schX={58 + i * 2.4} schY={-19} schSectionName="BLEED" />
      ))}
      {[0, 1, 2, 3].map(i => (
        <chip key={`bb${i}`} name={`RBDB${i}`} footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={w / 2 - 240 + i * 10} pcbY={-h / 2 + 160} schX={58 + i * 2.4} schY={-23} schSectionName="BLEED" />
      ))}
      <chip name="QDISA" footprint="to220" pinLabels={{ pin1: "G", pin2: "D", pin3: "S" }} pcbX={w / 2 - 195} pcbY={-h / 2 + 150} schX={69.5} schY={-19} schSectionName="BLEED" />
      <chip name="QDISB" footprint="to220" pinLabels={{ pin1: "G", pin2: "D", pin3: "S" }} pcbX={w / 2 - 195} pcbY={-h / 2 + 160} schX={69.5} schY={-23} schSectionName="BLEED" />
      {/* ECO-2a (E33 rev B): PV drivers replace the opto+bias stacks — bleeders need ms-class
          default-OFF drive only; −₹204/module, two fewer floating supplies */}
      <PvGateDrive id="A" ctl="net.CTL_QDISBK" gateOut="net.G_QDISA" src="net.BKAN" x={w / 2 - 260} y={-h / 2 + 150} sx={75.5} sy={-19} />
      <PvGateDrive id="B" ctl="net.CTL_QDISBK" gateOut="net.G_QDISB" src="net.BKBN" x={w / 2 - 260} y={-h / 2 + 160} sx={75.5} sy={-23} />
      <trace from=".RBDA0 > .A" to="net.BKAP" schDisplayLabel="BKAP" />
      <trace from=".RBDA0 > .B" to=".RBDA1 > .A" />
      <trace from=".RBDA1 > .B" to=".RBDA2 > .A" />
      <trace from=".RBDA2 > .B" to=".RBDA3 > .A" />
      <trace from=".RBDA3 > .B" to=".QDISA > .D" />
      <trace from=".QDISA > .S" to="net.BKAN" schDisplayLabel="BKAN" />
      <trace from=".QDISA > .G" to="net.G_QDISA" />
      <trace from=".RBDB0 > .A" to="net.BKBP" schDisplayLabel="BKBP" />
      <trace from=".RBDB0 > .B" to=".RBDB1 > .A" />
      <trace from=".RBDB1 > .B" to=".RBDB2 > .A" />
      <trace from=".RBDB2 > .B" to=".RBDB3 > .A" />
      <trace from=".RBDB3 > .B" to=".QDISB > .D" />
      <trace from=".QDISB > .S" to="net.BKBN" schDisplayLabel="BKBN" />
      <trace from=".QDISB > .G" to="net.G_QDISB" />
      <CoilDriver id="LB" ins={["net.CTL_KSER", "net.CTL_KPARA", "net.CTL_KPARB", "net.CTL_KOUT", "net.CTL_KPREA", "net.CTL_KPREB", "net.DGND", "net.DGND"]}
        outs={["net.COIL_KSER", "net.COIL_KPARA", "net.COIL_KPARB", "net.COIL_KOUT", "net.COIL_KPREA", "net.COIL_KPREB", "net.NC_O7", "net.NC_O8"]}
        x={w / 2 - 260} y={-h / 2 + 40} sx={42} sy={cYd} />

      {/* output: shunt in negative, filter, studs, Y caps */}
      <OutputShunt inn="net.BKBN" out="net.SNS_IOUT" outN="net.SNS_IOUTN" x={w / 2 - 120} y={-h / 2 + 60} sx={86} sy={27} />
      <capacitor name="COF1" capacitance="4.7uF" footprint={FilmBoxFP(37.5)} pcbX={w / 2 - 120} pcbY={-h / 2 + 40} schX={86} schY={21.5} schSectionName="OUTPUT" />
      <capacitor name="COF2" capacitance="4.7uF" footprint={FilmBoxFP(37.5)} pcbX={w / 2 - 120} pcbY={-h / 2 + 30} schX={88.5} schY={21.5} schSectionName="OUTPUT" />
      <capacitor name="CYO1" capacitance="4.7nF" footprint={FilmBoxFP(10)} pcbX={w / 2 - 60} pcbY={-h / 2 + 40} schX={91} schY={21.5} schSectionName="OUTPUT" />
      <capacitor name="CYO2" capacitance="4.7nF" footprint={FilmBoxFP(10)} pcbX={w / 2 - 60} pcbY={-h / 2 + 30} schX={93.5} schY={21.5} schSectionName="OUTPUT" />
      <chip name="JOUTP" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={w / 2 - 20} pcbY={-h / 2 + 70} schX={98} schY={28} schSectionName="OUTPUT" />
      <chip name="JOUTN" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={w / 2 - 20} pcbY={-h / 2 + 30} schX={98} schY={25} schSectionName="OUTPUT" />
      <trace from=".JOUTP > .P" to="net.OUTP" schDisplayLabel="OUTP" />
      <trace from=".JOUTN > .P" to="net.OUTN" schDisplayLabel="OUTN" />
      <trace from=".COF1 > .pin1" to="net.OUTP" schDisplayLabel="OUTP" />
      <trace from=".COF1 > .pin2" to="net.OUTN" schDisplayLabel="OUTN" />
      <trace from=".COF2 > .pin1" to="net.OUTP" schDisplayLabel="OUTP" />
      <trace from=".COF2 > .pin2" to="net.OUTN" schDisplayLabel="OUTN" />
      <trace from=".CYO1 > .pin1" to="net.OUTP" schDisplayLabel="OUTP" />
      <trace from=".CYO1 > .pin2" to="net.PE" schDisplayLabel="PE" />
      <trace from=".CYO2 > .pin1" to="net.OUTN" schDisplayLabel="OUTN" />
      <trace from=".CYO2 > .pin2" to="net.PE" schDisplayLabel="PE" />

      {/* sensing (E25: bank/output voltages isolated inside their own domains — CB-3 fix) */}
      <Bias5Module id="BKA" p5="net.B5BKA" com="net.BKAN" x={-w / 2 + 60} y={-h / 2 + 105} sx={84} sy={16} />
      <Bias5Module id="BKB" p5="net.B5BKB" com="net.BKBN" x={-w / 2 + 60} y={-h / 2 + 98} sx={88} sy={16} />
      <IsoVSense id="OA" hv="net.BKAP" ref="net.BKAN" biasP="net.B5BKA" cf="1nF" out="net.SNS_VBKA" x={-w / 2 + 60} y={-h / 2 + 90} sx={84} sy={12} />
      <IsoVSense id="OB" hv="net.BKBP" ref="net.BKBN" biasP="net.B5BKB" cf="1nF" out="net.SNS_VBKB" x={-w / 2 + 60} y={-h / 2 + 80} sx={84} sy={7.5} />
      <IsoVSense id="OV" hv="net.OUTP" ref="net.OUTN" biasP="net.B5OUT" cf="1nF" out="net.SNS_VOUT" x={-w / 2 + 60} y={-h / 2 + 70} sx={84} sy={3} />
      <AnalogMid x={-w / 2 + 60} y={-h / 2 + 35} sx={84} sy={-6} />
      <NtcInput id="TLLC" out="net.T_LLC" x={-w / 2 + 60} y={-h / 2 + 55} sx={84} sy={-10.5} />
      <NtcInput id="TXFR" out="net.T_XFMR" x={-w / 2 + 60} y={-h / 2 + 45} sx={94} sy={-10.5} />

      {/* control: MCU-LLC + safety chain + SWD + CAN + HMI + interconnect */}
      <ControlMcu id="LLC" x={-w / 2 + 150} y={-h / 2 + 60} sx={2} sy={cYd} />
      <Rail3V3 id="B" x={-w / 2 + 190} y={-h / 2 + 40} sx={32} sy={cYd} />
      <SafetyChain id="B" enLocal="net.EN_LLC" enRemote="net.EN_PFC" wdi="net.WDI_LLC" gateEn="net.GATE_EN_B"
        x={-w / 2 + 150} y={-h / 2 + 95} sx={23} sy={cYd - 8} />
      <SwdPort id="LLC" x={-w / 2 + 110} y={-h / 2 + 60} sx={16} sy={cYd} />
      <trace from=".ULLC > .pin28" to="net.SWDIO_LLC" schDisplayLabel="SWDIO_LLC" />
      <trace from=".ULLC > .pin29" to="net.SWCLK_LLC" schDisplayLabel="SWCLK_LLC" />
      <trace from=".ULLC > .pin100" to="net.BOOT0_LLC" schDisplayLabel="BOOT0_LLC" />
      <resistor name="RFLTB" resistance="4.7k" footprint="0603" pcbX={-w / 2 + 190} pcbY={-h / 2 + 95} schX={23} schY={cYd - 12.5} schSectionName="SAFETY" />
      <capacitor name="CFLTB" capacitance="1nF" footprint="0603" pcbX={-w / 2 + 196} pcbY={-h / 2 + 95} schX={25.5} schY={cYd - 12.5} schSectionName="SAFETY" />
      <trace from=".RFLTB > .pin1" to="net.V3P3" schDisplayLabel="V3P3" />
      <trace from=".RFLTB > .pin2" to="net.FLT_LLC" schDisplayLabel="FLT_LLC" />
      <trace from=".CFLTB > .pin1" to="net.FLT_LLC" schDisplayLabel="FLT_LLC" />
      <trace from=".CFLTB > .pin2" to="net.DGND" schDisplayLabel="DGND" />
      <resistor name="RAGTB" resistance="0" footprint="0805" pcbX={-w / 2 + 202} pcbY={-h / 2 + 95} schX={4} schY={cYd - 14} schSectionName="BOND" />
      <trace from=".RAGTB > .pin1" to="net.AGND" schDisplayLabel="AGND" />
      <trace from=".RAGTB > .pin2" to="net.DGND" schDisplayLabel="DGND" />
      <IsolatedCan x={-w / 2 + 230} y={-h / 2 + 60} sx={48} sy={cYd} />
      <ConfigHmi x={-w / 2 + 230} y={-h / 2 + 25} sx={63} sy={cYd} />
      {/* CB-14: this side of the harness crosses the link — LTX wire lands on this MCU's RX */}
      <InterconnectSignals id="B" ltx="net.LINK_RX" lrx="net.LINK_TX" enA="net.EN_PFC" enB="net.EN_LLC"
        x={-w / 2 + 150} y={-h / 2 + 20} sx={84} sy={cYd} />
      {llcPins.map(([net, pin]) => (
        <trace key={`${net}${pin}`} from={`.ULLC > .pin${pin}`} to={net} />
      ))}
    </board>
  );
};
