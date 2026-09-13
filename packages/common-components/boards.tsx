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
  Interconnect40, AuxPower, FanPort, IsolatedCan, OutputShunt, SafetyChain, SwdPort,
  DischargeCtl, PvGateDrive, Rail3V3, StudFP, RelayMFP, FilmBoxFP, DiscFP, Cm3FP, SnapInFP,
  CardConnector,
} from "../power-primitives/cells";
import { cardMap, CARD_MCU_PINS, CARD_INTERNAL } from "./control-card";
import { HARNESS40 } from "./umod-map.gen";

// Schematic/net work does not need copper, and routing these boards takes 10+ minutes each.
// TSCI_NO_ROUTE=1 builds the netlist only, so connectivity checks run in seconds.
const NO_ROUTE = process.env.TSCI_NO_ROUTE === "1";


// ================= AC-DC BOARD =================
export const AcDcBoard = ({ lanes, w, h, pw = 30, air = false }: { lanes: number; w: number; h: number; pw?: number; air?: boolean }) => {
  const phases = Array.from({ length: lanes }, (_, l) => ["A", "B", "C"].map(p => ({ id: `${p}${l}`, ac: `net.AC${p === "A" ? "1F" : p === "B" ? "2F" : "3"}` }))).flat();
  const nFans = pw === 50 ? (air ? 4 : 0) : pw === 40 ? 3 : lanes === 4 ? 4 : 2; // HR-17 (+E41/E42/E44): 2 @30, 3 @40, ZERO @50-liquid (sealed), FOUR @50-air (E44: 1,580 W at the family's ~395 W/fan density; fans 3+4 gang FAN_PWM2), 4 @120-ref
  // MCU-PFC pin map (§20): PWM per phase, CT per phase, senses, temps, fans, link, safety chain
  // (the pre-card MCU pin tables lived here; E40 single source is umod-pinmap.mts)
  const nDcHalf = pw === 50 ? 8 : pw === 40 ? 6 : lanes === 1 ? 5 : lanes === 2 ? 9 : 18;   // E41: 12 cans @40 · E42: 16 @50 (ripple ∝ I)
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
  // The Vienna block grows with the rating: 3 phases at 30 kW, 6 at 60 kW, tiled 3-across in rows
  // of 172 mm. Everything below it has to move down by the same amount, so the band origins are
  // COMPUTED from the row count rather than fixed -- a fixed table silently stacked the second row
  // of phases on top of the DC-link bank at 60 kW.
  const vpRows = Math.ceil((lanes * 3) / 3);
  const bandTop = 93 - 66 - (vpRows - 1) * 172 - 12;   // first free y below the Vienna block
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
    ivs: [-57, -46, -35, -24, -13] as const, ivsY: -2, b5: [-50, -80] as const,
    // FILTER BLOCK. The CM chokes, X caps, Y caps and DM chokes are ONE filter and belong in one
    // contiguous block, immediately downstream of the CM chokes in the left column. They were
    // spread over 260 mm of board -- CM at x -180, X caps at -46, DM at +20 -- which is not a
    // filter, it is three parts that happen to be on the same net. This also fills the 120 x 125 mm
    // of dead board that sat beside the CM chokes.
    cx1X: -120, cxY: [-4, -22, -40].map((d) => bandTop + d) as any, cx2X: -120, cx2Y: [-60, -78, -96].map((d) => bandTop + d) as any,
    // DM chokes, Y caps and the neutral-star dividers sit in the strip ABOVE the bank
    ldmX: -78, ldmY: [-60, -78, -96].map((d) => bandTop + d) as any,
    cyX: -78, cyY: [-4, -22, -40].map((d) => bandTop + d) as any,
    rnsX: [-48, -34] as const, rnsY: -24,
    kpreX: 40, kpre: [bandTop, bandTop] as any, rpre: [-60, -76] as const,
    // right column, clear of the Vienna row (which ends at x 139.5)
    studX: 205, stud: [176, 150, 124] as const, qdis: [205, 76] as const,
    dschX: 172, dschY: 76, ctsX: 158, ctsY: [44, 10, -24] as const,
    fanX: 198, fanY: -140, ntcX: 190, ntcY: -145,
    // control strip along the bottom edge, end to end by real width
    cardX: 0, cardY: -226, ctlY: -172, mcuX: -123, swdX: -94, sfcX: -65, r3v3X: -20, auxX: 20,
    avmidX: 40, icX: 120, auxRowY: -148,
  };

return (
    <board routingDisabled={NO_ROUTE} width={`${w}mm`} height={`${h}mm`} layers={6} thickness="2.4mm" autorouter="auto-local"
      nominalTraceWidth="0.3mm" minViaEdgeToPadEdgeClearance="0.3mm"
      minViaHoleEdgeToViaHoleEdgeClearance="0.45mm"
      schTraceAutoLabelEnabled schMaxTraceDistance={0}
      minTraceWidth="0.25mm" minViaHoleDiameter="0.4mm" minViaPadDiameter="0.7mm"
      minTraceToPadEdgeClearance="0.2mm" minPadEdgeToPadEdgeClearance="0.12mm"
      minBoardEdgeClearance="1mm">
      {/* STACKUP (§7). 6 layers, 2.4 mm, 2 oz outers. The board carries 39-156 A, so the power
          nets are POURS, never traces: L2 is the mains-referenced return and PE reference, L3/L4
          are the DC-link rails, and the two outers carry the local power geometry plus signal.
          Clearances are set well above the fab minimum because creepage, not etch capability, is
          what sets spacing on a 1000 V board -- the reinforced barrier is enforced separately. */}
      <net name="DCP" isForPower />
      <net name="DCN" isForPower />
      <net name="MID" isForPower />
      <net name="PE" isGround />
      <net name="DGND" isGround />
      <net name="AGND" isGround />
      <net name="V24" isForPower />
      <net name="V15" isForPower />
      <net name="V3P3" isForPower />
      {/* PLANE ASSIGNMENT. This is a THREE-LEVEL converter, so the DC link is DCP / MID / DCN and
          the midpoint carries real phase current -- it needs a plane as much as the rails do, and
          an earlier assignment that gave inner2 to DCN and left MID as a trace had it wrong.

            inner1  DCP    positive rail
            inner2  MID    3-level midpoint, between the two rails so both couple to it evenly
            inner3  DCN    negative rail
            inner4  DGND   control return, referenced once to PE at the single-point bond

          PE is deliberately NOT a full inner plane: it is a chassis reference, and a full PE plane
          under the DC link would add common-mode capacitance from every rail straight to earth,
          which is current in the CISPR measurement. It is a perimeter pour on the bottom instead,
          tied at the mounting standoffs.

          Nothing high-current is ever a "trace": above ~10 A the copper is a plane or a pour. */}
      <copperpour connectsTo="net.DCP" layer="inner1" boardEdgeMargin="1.2mm" />
      <copperpour connectsTo="net.MID" layer="inner2" boardEdgeMargin="1.2mm" />
      <copperpour connectsTo="net.DCN" layer="inner3" boardEdgeMargin="1.2mm" />
      <copperpour connectsTo="net.DGND" layer="inner4" boardEdgeMargin="1.2mm" />
      <copperpour connectsTo="net.PE" layer="bottom" boardEdgeMargin="1.2mm" />
      {/* The mains phases carry 54.9 Arms at 30 kW. IPC-2221 wants a 24.7 mm external trace for
          that on 2 oz -- which is not a trace, it is a busbar -- so each phase gets TOP-LAYER
          copper instead. They are 50 Hz nets, so flooding them is harmless; the parts that carry
          them (studs, fuses, MOVs, CM chokes) all sit on the top layer in the left column, so the
          copper lands exactly where the current already is.

          The switch nodes PHA0/PHB0/PHC0 are deliberately NOT poured. They carry the same current
          but they are the high-dv/dt nodes: their copper is an antenna, and §7's rule is the
          minimum area that carries the current. They get bounded heavy copper inside their own
          Vienna cell, which is a hand-drawn shape, not a flood. */}
      {["AC1", "AC2", "AC3"].map((n) => (
        <copperpour key={n} connectsTo={`net.${n}`} layer="top" boardEdgeMargin="1.2mm" />
      ))}
      {["LF1", "LF2", "LF3"].map((n) => (
        <copperpour key={n} connectsTo={`net.${n}`} layer="top" boardEdgeMargin="1.2mm" />
      ))}
      {["AC1F", "AC2F", "AC3F"].map((n) => (
        <copperpour key={n} connectsTo={`net.${n}`} layer="top" boardEdgeMargin="1.2mm" />
      ))}
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
      {/* E43: CX2 trio 2.2 → 4.7 µF X1 (all variants) — the 3rd DM stage attenuates as L·C and
          the cap is the cheap half: the crest-biased D6 rev + this cap hold ≥ +4.9 dB conducted
          margin at every variant (lisn-precompliance per-variant block). X-bleed τ 0.42 → 0.66 s
          through the RNS star — still inside the 1 s pluggable-discharge rule. */}
      {[1, 2, 3].map(i => (
        <capacitor key={`x2${i}`} name={`CX2${i}`} capacitance="4.7uF" footprint={FilmBoxFP(27.5)} pcbX={P.cx2X} pcbY={P.cx2Y[i - 1]} schX={46} schY={46 - (i - 1) * 3} schSectionName="EMI" />
      ))}
      {[1, 2, 3].map(i => (
        <capacitor key={`y${i}`} name={`CY${i}`} capacitance="4.7nF" footprint={FilmBoxFP(10)} pcbX={P.cyX} pcbY={P.cyY[i - 1]} schX={51} schY={46 - (i - 1) * 3} />
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
      {/* E43: D6 is engine-designed per variant (dm-choke-design.mjs) — the inherited "22 µH"
          could not exist at the line crest on the drawn core (7–8 µH at 82 A pk vs the 15 µH
          LISN floor). Values are the engine L0 (crest-biased Lpk meets each variant's floor). */}
      {[1, 2, 3].map(i => (
        <inductor key={`ldm${i}`} name={`LDM${i}`} inductance={pw === 50 ? "34uH" : pw === 40 ? "23uH" : "14uH"} footprint={FilmBoxFP(20)} pcbX={P.ldmX} pcbY={P.ldmY[i - 1]} schX={41} schY={46 - (i - 1) * 3} schSectionName="EMI" />
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
        <chip key={k} name={`KPRE${k}`} footprint={<RelayMFP />} pinLabels={{ pin1: "C1", pin2: "C2", pin3: "A", pin4: "B", pin5: "M1", pin6: "M2" }} pcbX={P.kpreX + (k - 1) * 58} pcbY={P.kpre[k - 1]} schX={58} schY={46 - i * 4} />
      ))}
      <chip name="RPRE1" footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={140} pcbY={-140} schX={62.5} schY={46} schSectionName="PRECHG" />
      <chip name="RPRE2" footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={174} pcbY={-140} schX={62.5} schY={42} schSectionName="PRECHG" />
      <resistor name="RKFBP" resistance="10k" footprint="0603" pcbX={196} pcbY={-92} schX={67} schY={44} schSectionName="PRECHG" />
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

      {/* E40: THIS BOARD HAS NO CARD SLOT. The module's one brain seats in the DC-DC slot; the
          PFC bundle crosses the 40-way harness (Interconnect40 below, map = HARNESS40). What this
          board keeps is the default-OFF discipline: every line the harness can float must read
          OFF here — both control lines AND the three logic-level PWM inputs. */}
      {["GATE_EN_A", "EN_PFC", "CTL_KPRE", "CTL_QDIS", "PWM_A0", "PWM_B0", "PWM_C0"].map((n, i) => (
        <resistor key={n} name={`RPD${i}`} resistance="10k" footprint="0603"
          pcbX={P.cardX - 50 + i * 8} pcbY={P.cardY - 10} schX={70 + i * 2} schY={23} schSectionName="CARD" />
      ))}
      {["GATE_EN_A", "EN_PFC", "CTL_KPRE", "CTL_QDIS", "PWM_A0", "PWM_B0", "PWM_C0"].map((n, i) => [
        <trace key={`a${i}`} from={`.RPD${i} > .pin1`} to={`net.${n}`} schDisplayLabel={n} />,
        <trace key={`b${i}`} from={`.RPD${i} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />,
      ])}

      {/* Vienna lanes (film commutation caps now inside each phase — CB-9) */}
      {phases.map((p, i) => (
        <ViennaPhase key={p.id} id={p.id} ac={p.ac} dcp="net.DCP" dcn="net.DCN" mid="net.MID"
          ind={pw === 50 ? "107uH" : pw === 40 ? "116uH" : "165uH"} par={pw >= 40}   /* E51: 40/50 kW D1 re-issued on the CATALOG core (AL 37) — N=26/24, L0 116/107 uH */
          pwm={`net.PWM_${p.id}`} flt="net.FLT" en="net.GATE_EN_A"
          x={P.vp[i % 3]} y={P.vpY - Math.floor(i / 3) * 172} sx={4} sy={24 - i * 14} />
      ))}
      {/* per-phase line CTs (primary = line conductor through aperture; §19/E18) */}
      {phases.map((p, i) => (
        <CtSensor key={p.id} id={p.id} out={`net.I_${p.id}`} burden={pw === 50 ? "13" : pw === 40 ? "18" : "22"} x={P.ctsX} y={P.ctsY[i % 3]} sx={40} sy={26 - i * 4.5} />
      ))}

      {/* DC link banks + balance. key/pos were constant across instances (audit, 60/120 kW
          reference boards): duplicate React keys can silently drop siblings, and the fixed x/sx
          stacked bank 2/3 on bank 1. Offsets are placement-phase coarse; the key is the fix. */}
      {dcBanks.map(([n, k]) => (
        <SplitDcLink key={k} id={`${k}`} nPerHalf={n} dcp="net.DCP" dcn="net.DCN" mid="net.MID"
          x={14 + k * 96} y={-62} sx={10 + k * 14} sy={-62} />
      ))}

      {/* discharge: 4× 160 Ω pulse resistors + 1200 V SiC FET.
          CB-11: default-OFF isolated drive (DischargeCtl), gate pulled down to DCN. */}
      {[0, 1, 2, 3].map(i => (
        <chip key={i} name={`RDIS${i}`} footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={200} pcbY={-5 - i * 11} schX={80 + i * 2.4} schY={-2} schSectionName="DISCH" />
      ))}
      <chip name="QDIS" footprint={<StudFP />} pinLabels={{ pin1: "TAB" }} pcbX={P.qdis[0]} pcbY={P.qdis[1]} schX={93} schY={-2} schSectionName="DISCH" />
      <chip name="QDISF" footprint="to220" pinLabels={{ pin1: "G", pin2: "D", pin3: "S" }} pcbX={P.dschX - 14} pcbY={P.qdis[1] + 18} schX={90} schY={-2} schSectionName="DISCH" />
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
      <IsoVSense id="V1" hv="net.AC1" ref="net.NSTAR" biasP="net.B5AC" rBot="11.5k" out="net.SNS_VAC1" x={P.ivs[0]} y={P.ivsY} sx={56} sy={24} />
      <IsoVSense id="V2" hv="net.AC2" ref="net.NSTAR" biasP="net.B5AC" rBot="11.5k" out="net.SNS_VAC2" x={P.ivs[1]} y={P.ivsY} sx={56} sy={19.5} />
      <IsoVSense id="V3" hv="net.AC3" ref="net.NSTAR" biasP="net.B5AC" rBot="11.5k" out="net.SNS_VAC3" x={P.ivs[2]} y={P.ivsY} sx={56} sy={15} />
      <IsoVSense id="BP" hv="net.DCP" ref="net.DCN" biasP="net.B5BUS" cf="1nF" out="net.SNS_VBUSP" x={P.ivs[3]} y={P.ivsY} sx={56} sy={10.5} />
      <IsoVSense id="BM" hv="net.MID" ref="net.DCN" biasP="net.B5BUS" cf="1nF" out="net.SNS_VMID" x={P.ivs[4]} y={P.ivsY} sx={56} sy={6} />
      
      <NtcInput id="TPFC" out="net.T_PFC" x={P.ntcX} y={P.ntcY} sx={56} sy={-6.5} />
      <NtcInput id="TINL" out="net.T_INLET" x={P.ntcX} y={P.ntcY - 8} sx={68} sy={-6.5} />

      {/* control: MCU-PFC + safety chain + SWD + coil driver + aux + fans + interconnect */}
      {/* CB-4: analog/digital ground single-point tie + DGND→PE soft bond */}
      <resistor name="RPET" resistance="1M" footprint="1206" pcbX={-18} pcbY={-148} schX={6.5} schY={cY - 14} schSectionName="BOND" />
      <capacitor name="CPET" capacitance="4.7nF" footprint={FilmBoxFP(10)} pcbX={0} pcbY={-148} schX={9} schY={cY - 14} schSectionName="BOND" />
      <trace from=".RPET > .pin1" to="net.DGND" schDisplayLabel="DGND" />
      <trace from=".RPET > .pin2" to="net.PE" schDisplayLabel="PE" />
      <trace from=".CPET > .pin1" to="net.DGND" schDisplayLabel="DGND" />
      <trace from=".CPET > .pin2" to="net.PE" schDisplayLabel="PE" />
      <CoilDriver id="PA" ins={["net.CTL_KPRE", "net.DGND", "net.DGND", "net.DGND", "net.DGND", "net.DGND", "net.DGND", "net.DGND"]}
        outs={["net.COIL_KPRE", "net.NC_O2", "net.NC_O3", "net.NC_O4", "net.NC_O5", "net.NC_O6", "net.NC_O7A", "net.NC_O8A"]}
        x={-w / 2 + 130} y={-h / 2 + 60} sx={26} sy={cY} />
      <AuxPower dcp="net.DCP" dcn="net.DCN" x={P.auxX} y={P.ctlY} sx={40} sy={cY - 2} />
      {/* R4-5 (external review): since E40 removed this board's card slot, V3P3 here was a
          FLOATING ISLAND — iso-amp secondaries, CT clamps, tach pull-ups and the KPRE feedback
          pull-up had no 3.3 V source (the harness carries V15/V24 only). Local sync buck,
          same CB-17/18 cell the card uses. */}
      <Rail3V3 id="A" x={P.r3v3X} y={P.ctlY} sx={62} sy={cY + 2.5} />
      
      {/* E32: rail monitors — firmware finally sees its own supplies (24 V: ÷7.8 → 3.08 V; 15 V: ÷5.7 → 2.63 V) */}
      <resistor name="RM24A" resistance="82k" footprint="0603" pcbX={40} pcbY={-128} schX={64} schY={cY - 4} schSectionName="MON" />
      <resistor name="RM24B" resistance="10k" footprint="0603" pcbX={54} pcbY={-128} schX={66.5} schY={cY - 4} schSectionName="MON" />
      <resistor name="RM15A" resistance="47k" footprint="0603" pcbX={68} pcbY={-128} schX={64} schY={cY - 5.5} schSectionName="MON" />
      <resistor name="RM15B" resistance="10k" footprint="0603" pcbX={82} pcbY={-128} schX={66.5} schY={cY - 5.5} schSectionName="MON" />
      <trace from=".RM24A > .pin1" to="net.V24" schDisplayLabel="V24" />
      <trace from=".RM24A > .pin2" to="net.SNS_V24" schDisplayLabel="SNS_V24" />
      <trace from=".RM24B > .pin1" to="net.SNS_V24" schDisplayLabel="SNS_V24" />
      <trace from=".RM24B > .pin2" to="net.AGND" schDisplayLabel="AGND" />
      <trace from=".RM15A > .pin1" to="net.V15" schDisplayLabel="V15" />
      <trace from=".RM15A > .pin2" to="net.SNS_V15" schDisplayLabel="SNS_V15" />
      <trace from=".RM15B > .pin1" to="net.SNS_V15" schDisplayLabel="SNS_V15" />
      <trace from=".RM15B > .pin2" to="net.AGND" schDisplayLabel="AGND" />
      {Array.from({ length: nFans }, (_, i) => (
        <FanPort key={i} id={`${i + 1}`} pwmNet={i >= 2 ? "net.FAN_PWM2" : undefined} x={P.fanX} y={P.fanY - i * 16} sx={74} sy={cY - i * 3} />
      ))}
      {/* E42 (50 kW liquid, zero fans): the harness still carries the three tach ways (same
          HARNESS40 p/n on every variant). With no FanPort pull-ups fitted, the MCU tach inputs
          would float — a defined-LOW here makes an accidental read report "fan stopped", the
          fail-safe direction, instead of noise. PWM1/2 stay MCU-driven (defined by the card). */}
      {nFans === 0 ? [1, 2, 3, 4].map(i => (
        <resistor key={`fdt${i}`} name={`RFDT${i}`} resistance="10k" footprint="0603"
          pcbX={P.fanX} pcbY={P.fanY - (i - 1) * 10} schX={74 + (i - 1) * 2.4} schY={cY} schSectionName="FANS" />
      )) : null}
      {nFans === 0 ? [1, 2, 3, 4].map(i => [
        <trace key={`fdta${i}`} from={`.RFDT${i} > .pin1`} to={`net.FAN_TACH${i}`} schDisplayLabel={`FAN_TACH${i}`} />,
        <trace key={`fdtb${i}`} from={`.RFDT${i} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />,
      ]) : null}
      <Interconnect40 id="A" map={HARNESS40} shldTo="net.PE"
        x={P.icX} y={P.auxRowY} sx={92} sy={33} />
      {/* MCU pin bindings (§20 map, asserted unique) */}
      {/* MCU pin-map traces moved to the control card; the connector carries these nets now. */}

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
export const DcDcBoard = ({ channels, w, h, pw = 30, air = false }: { channels: number; w: number; h: number; pw?: number; air?: boolean }) => {
  const legs = Array.from({ length: 3 * channels }, (_, i) => ({ id: `${i + 1}`, sw: `net.SW${i + 1}`, ch: Math.floor(i / 3) }));
  const secs = legs.map(l => ({ ...l, star: `net.STAR${l.ch}` }));
  const relayFb = ["KSER", "KPARA", "KPARB", "KOUT", "KPREA", "KPREB"];
  const nBank = pw === 50 ? 4 : pw === 40 ? 3 : channels * 2;   // E41: 3 strings/bank @133 A · E42: 4 @167 A (per-string ≤42 A, same class use as 40)
  // schematic sheet plan: bus row y=40..48 · LLC legs x=2 col (16/row from y=24) · sections x=30
  // · banks/matrix/bleeders x=58 · output+senses x=84 · control row below everything at cYd.
  const cYd = Math.min(24 - (3 * channels - 1) * 16 - 9.5, -25) - 10;
    // ---------------------------------------------------------------------------------------------
  // PCB PLACEMENT. Board 440 x 380, matching the AC-DC card so one extrusion and one rack slot
  // serve both. Primary on the left, secondary on the right, and the reinforced barrier runs
  // vertically THROUGH the LlcSection cells at the transformer row -- everything else is arranged
  // so that nothing has to cross it except the transformers themselves.
  //
  //   x -220..-129   LLC half-bridge legs, one per section, each behind its own transformer
  //   x -120..  50   LLC sections: tank -> transformer (THE BARRIER) -> rectifier -> bank
  //   x -120..  51   S/P relay matrix, directly under the banks it switches
  //   x   55.. 218   output shunt, studs and the isolated output senses
  //   y -190..-150   control strip, primary-referenced, along the bottom edge
  const Q = {
    // ---------------------------------------------------------------------------------------
    // HORIZONTAL BARRIER. The transformers form a band across the board at y ~21..56; primary is
    // above it, secondary below. A vertical barrier left the secondary only 138 mm of a 440 mm
    // rack card and jammed every output part into a strip while half the board sat empty -- this
    // way both domains get the full width.
    //
    //   y 250..215  LLC half-bridge legs, one above each section
    //   y 197.. 60  primary chain: resonant films -> CT -> trim inductor
    //   y  56.. 21  TRANSFORMERS -- the barrier band
    //   y -29..-250 secondary: rectifiers, banks, S/P matrix, output
    //   x 155..220  control column, primary-referenced, up the right side
    // ---------------------------------------------------------------------------------------
    sec: [-100, 0, 100] as const, secY: 190,
    leg: [-180, -60, 60] as const, legY: 224,
    busX: -208, bus: [170, 130, 90] as const,
    cfX: -166, cfStep: 0, cfY: 190,
    // secondary band
    bankX: [-180, -138, -96, -54] as const, bankY: [-60, -102, -144, -186] as const,
    spm: [60, -140] as const,
    balA: [-200, -188, -176, -164] as const, balB: [-152, -140, -128, -116] as const, balY: -244,
    shunt: [-80, -232] as const, outX: 208, out: [-200, -232] as const,
    cofX: 10, cof: [-206, -234] as const,
    rbdX: 164, rbdStep: 0, rbdA: -60, rbdB: -134, qdis: [-30, -210] as const,
    ivs: [186, 198, 210] as const, ivsY: -60, b5: [-16, -150] as const,
    // control column, primary side, right edge
    cardX: -30, cardY: -182,
    mcuX: 176, mcuY: 223, swdY: 200, sfcX: 176, sfcY: 177, r3v3X: 176, r3v3Y: 156,
    icX: 160, icY: 135, canX: 160, canY: 112, hmiX: 96, ctlY: 223,
    avmidX: 176, avmidY: 92, ntcX: 176, ntcY: 78,
  };



return (
    <board routingDisabled={NO_ROUTE} width={`${w}mm`} height={`${h}mm`} layers={6} thickness="2.4mm" autorouter="auto-local"
      nominalTraceWidth="0.3mm" minViaEdgeToPadEdgeClearance="0.3mm"
      minViaHoleEdgeToViaHoleEdgeClearance="0.45mm"
      schTraceAutoLabelEnabled schMaxTraceDistance={0}
      minTraceWidth="0.25mm" minViaHoleDiameter="0.4mm" minViaPadDiameter="0.7mm"
      minTraceToPadEdgeClearance="0.2mm" minPadEdgeToPadEdgeClearance="0.12mm"
      minBoardEdgeClearance="1mm">
      {/* PLANES, BOUNDED BY THE BARRIER. This board is isolated, so a full-layer pour is not an
          option: a plane that crosses the transformer band defeats the very barrier it crosses.
          Each pour is clipped to its own domain -- primary above y 60, secondary below y 17 --
          which leaves the 43 mm transformer band with no copper on any layer.

            inner1  DCP  (primary)   |  OUTP  (secondary)
            inner2  DCN  (primary)   |  OUTN  (secondary)
            inner3  DGND (primary control return)
            inner4  BKAN (secondary bank return)
          PE is a bottom perimeter pour, not an inner plane, for the same common-mode reason as on
          the AC-DC board. */}
      <net name="DCP" isForPower /><net name="DCN" isForPower /><net name="DGND" isGround />
      <net name="OUTP" isForPower /><net name="OUTN" isForPower />
      <net name="BKAN" isGround /><net name="PE" isGround />
      {[["DCP", "inner1"], ["DCN", "inner2"], ["DGND", "inner3"]].map(([n, l]) => (
        <copperpour key={n} connectsTo={`net.${n}`} layer={l} boardEdgeMargin="1.2mm"
          outline={[{ x: -216, y: 246 }, { x: 216, y: 246 }, { x: 216, y: 60 }, { x: -216, y: 60 }]} />
      ))}
      {[["OUTP", "inner1"], ["OUTN", "inner2"], ["BKAN", "inner4"]].map(([n, l]) => (
        <copperpour key={n} connectsTo={`net.${n}`} layer={l} boardEdgeMargin="1.2mm"
          outline={[{ x: -216, y: 17 }, { x: 216, y: 17 }, { x: 216, y: -246 }, { x: -216, y: -246 }]} />
      ))}
      <copperpour connectsTo="net.PE" layer="bottom" boardEdgeMargin="1.2mm" />
      {/* bus entry studs from AC-DC board + film commutation caps per leg */}
      <chip name="JDCP" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={Q.busX} pcbY={Q.bus[0]} schX={0} schY={46} schSectionName="INPUT" />
      <chip name="JDCN" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={Q.busX} pcbY={Q.bus[1]} schX={0} schY={43} schSectionName="INPUT" />
      <chip name="JPEB" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={Q.busX} pcbY={Q.bus[2]} schX={0} schY={40} schSectionName="INPUT" />
      <trace from=".JDCP > .P" to="net.DCP" schDisplayLabel="DCP" />
      <trace from=".JDCN > .P" to="net.DCN" schDisplayLabel="DCN" />
      <trace from=".JPEB > .P" to="net.PE" schDisplayLabel="PE" />
      {Array.from({ length: 3 * channels }, (_, i) => (
        <capacitor key={i} name={`CF${i}`} capacitance="1uF" footprint={FilmBoxFP(27.5)} pcbX={Q.cfX} pcbY={Q.cfY - i * 26} schX={6 + i * 2.4} schY={44} />
      ))}
      {Array.from({ length: 3 * channels }, (_, i) => [
        <trace key={`p${i}`} from={`.CF${i} > .pin1`} to="net.DCP" schDisplayLabel="DCP" />,
        <trace key={`n${i}`} from={`.CF${i} > .pin2`} to="net.DCN" schDisplayLabel="DCN" />,
      ])}

      {/* CONTROL CARD INTERFACE — same 88-way part and the same generator as the AC-DC slot. */}
      <CardConnector id="B" map={cardMap("module")} x={Q.cardX} y={Q.cardY} sx={70} sy={30} />
      {/* CARD_RULES: default-OFF held by the BOARD. Seven relay lines plus the enables. */}
      {["GATE_EN_B", "EN_LLC", "CTL_KSER", "CTL_KPARA", "CTL_KPARB", "CTL_KOUT", "CTL_KPREA", "CTL_KPREB", "CTL_QDISBK"].map((n, i) => (
        <resistor key={n} name={`RPDB${i}`} resistance="10k" footprint="0603"
          pcbX={Q.cardX - 60 + i * 8} pcbY={Q.cardY - 10} schX={70 + i * 2} schY={23} schSectionName="CARD" />
      ))}
      {["GATE_EN_B", "EN_LLC", "CTL_KSER", "CTL_KPARA", "CTL_KPARB", "CTL_KOUT", "CTL_KPREA", "CTL_KPREB", "CTL_QDISBK"].map((n, i) => [
        <trace key={`a${i}`} from={`.RPDB${i} > .pin1`} to={`net.${n}`} schDisplayLabel={n} />,
        <trace key={`b${i}`} from={`.RPDB${i} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />,
      ])}
      {/* RATING is the card's ONE identity strap (E24 rev F): 0R = 30 kW · 1k = 40 kW ·
          10k = 50 kW liquid (the stale two-card-era 10k→"60 kW" mapping is retired — no
          single-brain 60 exists, E40) · 3.32k = cabinet CSU · open = no host, fault. */}
      <resistor name="RROLEB" resistance={pw === 50 ? (air ? "15k" : "10k") : pw === 40 ? "1k" : "0"} footprint="0603" pcbX={Q.cardX + 54} pcbY={Q.cardY - 10} schX={90} schY={23} schSectionName="CARD" />
      <trace from=".RROLEB > .pin1" to="net.RATING" schDisplayLabel="RATING" />
      <trace from=".RROLEB > .pin2" to="net.DGND" schDisplayLabel="DGND" />

      {/* LLC legs + sections */}
      {legs.map((l, i) => (
        <LlcHalfBridgeLeg key={l.id} id={l.id} bus="net.DCP" gnd="net.DCN" sw={l.sw}
          x={Q.leg[i % 3]} y={Q.legY}
          pwmH={`net.PWM_L${l.id}H`} pwmL={`net.PWM_L${l.id}L`} flt="net.FLT" en="net.GATE_EN_B"
          par={pw === 50 && air}
          sx={2} sy={24 - i * 16} />
      ))}
      {secs.map((s, i) => (
        <LlcSection key={s.id} id={s.id} sw={s.sw} star={s.star}
          crN={pw === 50 ? 8 : pw === 40 ? 6 : 4} crVal={pw === 50 ? "27nF" : pw === 40 ? "33nF" : "46nF"} trim={pw === 50 ? "5.65uH" : pw === 40 ? "6.15uH" : "6.65uH"} ctBurden={pw === 50 ? "0.68" : pw === 40 ? "0.82" : "1.0"}
          x={Q.sec[i % 3]} y={Q.secY}
          bkAp="net.BKAP" bkAn="net.BKAN" bkBp="net.BKBP" bkBn="net.BKBN"
          ctOut={`net.I_RES${s.id}`}
          sx={30} sy={24 - i * 16} />
      ))}

      {/* bank capacitors — E29/CB-2: two-series 450 V strings (900 V string rating vs ≤525 V bank)
          + shared string midpoints + balance dividers; film across each bank */}
      {Array.from({ length: nBank }, (_, i) => (
        <capacitor key={`at${i}`} name={`CBA${i}T`} capacitance="470uF" footprint={<SnapInFP />} pcbX={Q.bankX[i % 4]} pcbY={Q.bankY[0] - Math.floor(i / 4) * 220} schX={58 + i * 2.2} schY={27} />
      ))}
      {Array.from({ length: nBank }, (_, i) => (
        <capacitor key={`ab${i}`} name={`CBA${i}B`} capacitance="470uF" footprint={<SnapInFP />} pcbX={Q.bankX[i % 4]} pcbY={Q.bankY[1] - Math.floor(i / 4) * 220} schX={58 + i * 2.2} schY={24.2} />
      ))}
      {Array.from({ length: nBank }, (_, i) => (
        <capacitor key={`bt${i}`} name={`CBB${i}T`} capacitance="470uF" footprint={<SnapInFP />} pcbX={Q.bankX[i % 4]} pcbY={Q.bankY[2] - Math.floor(i / 4) * 220} schX={58 + i * 2.2} schY={17} />
      ))}
      {Array.from({ length: nBank }, (_, i) => (
        <capacitor key={`bb${i}`} name={`CBB${i}B`} capacitance="470uF" footprint={<SnapInFP />} pcbX={Q.bankX[i % 4]} pcbY={Q.bankY[3] - Math.floor(i / 4) * 220} schX={58 + i * 2.2} schY={14.2} />
      ))}
      {/* HR-20: 2-series 47 k per string half (bank ≤525 V → ≤131 V & 0.37 W per element) */}
      <resistor name="RBALTA1" resistance="47k" footprint="2512" pcbX={Q.balA[0]} pcbY={Q.balY} schX={58 + nBank * 2.2 + 1.5} schY={28} schSectionName="BANKS" />
      <resistor name="RBALTA2" resistance="47k" footprint="2512" pcbX={Q.balA[1]} pcbY={Q.balY} schX={58 + nBank * 2.2 + 1.5} schY={26.6} schSectionName="BANKS" />
      <resistor name="RBALBA1" resistance="47k" footprint="2512" pcbX={Q.balA[2]} pcbY={Q.balY} schX={58 + nBank * 2.2 + 1.5} schY={25.2} schSectionName="BANKS" />
      <resistor name="RBALBA2" resistance="47k" footprint="2512" pcbX={Q.balA[3]} pcbY={Q.balY} schX={58 + nBank * 2.2 + 1.5} schY={23.8} schSectionName="BANKS" />
      <resistor name="RBALTB1" resistance="47k" footprint="2512" pcbX={Q.balB[0]} pcbY={Q.balY} schX={58 + nBank * 2.2 + 1.5} schY={18} schSectionName="BANKS" />
      <resistor name="RBALTB2" resistance="47k" footprint="2512" pcbX={Q.balB[1]} pcbY={Q.balY} schX={58 + nBank * 2.2 + 1.5} schY={16.6} schSectionName="BANKS" />
      <resistor name="RBALBB1" resistance="47k" footprint="2512" pcbX={Q.balB[2]} pcbY={Q.balY} schX={58 + nBank * 2.2 + 1.5} schY={15.2} schSectionName="BANKS" />
      <resistor name="RBALBB2" resistance="47k" footprint="2512" pcbX={Q.balB[3]} pcbY={Q.balY} schX={58 + nBank * 2.2 + 1.5} schY={13.8} schSectionName="BANKS" />
      {/* schY 20.2: at the 40 kW bank count the computed x (69.6) sits in JB's column, and one
          row lower is the RPDB pull-down row — the film cap stacks above its twin CBBF instead
          (found by running the overlap check on every SKU pair, not just the 30 kW battery pair). */}
      <capacitor name="CBAF" capacitance="1uF" footprint={FilmBoxFP(27.5)} pcbX={-180} pcbY={-224} schX={58 + nBank * 2.2 + 5} schY={20.2} schSectionName="BANKS" />
      <capacitor name="CBBF" capacitance="1uF" footprint={FilmBoxFP(27.5)} pcbX={-120} pcbY={-224} schX={58 + nBank * 2.2 + 5} schY={17} schSectionName="BANKS" />
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
        outp="net.OUTP" dual={channels === 4} dualOut={pw === 50} x={Q.spm[0]} y={Q.spm[1]} sx={58} sy={4} />
      {/* HR-15: commanded bank bleeders — banks otherwise hold ≤525 V for 3–14 min on the balance
          chains alone (bus discharge never touches them). One GPIO drives both optos; default-OFF
          like the bus chain (E19 rev B pattern). 4× 2.2 k 10 W axial per bank: τ ≈ 4–17 s,
          ≤65 J/resistor at 120 kW. F.21b supervision per protection-thresholds rev C. */}
      {[0, 1, 2, 3].map(i => (
        <chip key={`ba${i}`} name={`RBDA${i}`} footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={Q.rbdX} pcbY={Q.rbdA - i * 15} schX={58 + i * 2.4} schY={-19} schSectionName="BLEED" />
      ))}
      {[0, 1, 2, 3].map(i => (
        <chip key={`bb${i}`} name={`RBDB${i}`} footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={Q.rbdX} pcbY={Q.rbdB - i * 15} schX={58 + i * 2.4} schY={-23} schSectionName="BLEED" />
      ))}
      <chip name="QDISA" footprint="to220" pinLabels={{ pin1: "G", pin2: "D", pin3: "S" }} pcbX={Q.qdis[0]} pcbY={Q.qdis[1]} schX={69.5} schY={-19} schSectionName="BLEED" />
      <chip name="QDISB" footprint="to220" pinLabels={{ pin1: "G", pin2: "D", pin3: "S" }} pcbX={Q.qdis[0]} pcbY={Q.qdis[1] - 30} schX={69.5} schY={-23} schSectionName="BLEED" />
      {/* ECO-2a (E33 rev B): PV drivers replace the opto+bias stacks — bleeders need ms-class
          default-OFF drive only; −₹204/module, two fewer floating supplies */}
      <PvGateDrive id="A" gateOut="net.G_QDISA" src="net.BKAN" x={w / 2 - 260} y={-h / 2 + 150} sx={75.5} sy={-19} />
      <PvGateDrive id="B" gateOut="net.G_QDISB" src="net.BKBN" x={w / 2 - 260} y={-h / 2 + 160} sx={75.5} sy={-23} />
      {/* R7-B: one low-side NPN switches both PV LEDs at the guaranteed 10 mA point from V15
          (a GPIO cannot source 2×11 mA); base pulldown keeps the bleeders default-OFF through
          reset exactly as the old GPIO-direct drive did. */}
      <chip name="QPVD" footprint="sot23" pinLabels={{ pin1: "B", pin2: "E", pin3: "C" }} pcbX={w / 2 - 280} pcbY={-h / 2 + 170} schX={73} schY={-21.4} schSectionName="BLEED" />
      <resistor name="RPVDB" resistance="4.7k" footprint="0603" pcbX={w / 2 - 290} pcbY={-h / 2 + 170} schX={71} schY={-21.4} schSectionName="BLEED" />
      <resistor name="RPVDP" resistance="10k" footprint="0603" pcbX={w / 2 - 290} pcbY={-h / 2 + 178} schX={71} schY={-22.6} schSectionName="BLEED" />
      <trace from="net.CTL_QDISBK" to=".RPVDB > .pin1" schDisplayLabel="CTL_QDISBK" />
      <trace from=".RPVDB > .pin2" to=".QPVD > .B" />
      <trace from=".RPVDP > .pin1" to=".QPVD > .B" />
      <trace from=".RPVDP > .pin2" to="net.DGND" schDisplayLabel="DGND" />
      <trace from=".QPVD > .E" to="net.DGND" schDisplayLabel="DGND" />
      <trace from=".QPVD > .C" to="net.PV_SINK" schDisplayLabel="PV_SINK" />
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
      {/* R4-8 (external review): KSER+KPARA / KSER+KPARB are destructive (bank short). Firmware
          break-before-make + mirror readback (E30/F.18) already guard it; this adds a HARDWARE
          layer: one 74HC02 gates the KSER coil command with NOR logic so KSER_STG1 =
          CTL_KSER AND NOT(CTL_KPARA OR CTL_KPARB). A firmware/driver fault that asserts both
          can no longer energize the forbidden pair. R5-D extends the exclusion to the
          pre-insertion contacts with a second stage below. */}
      <chip name="UEXCL" footprint="soic14" pinLabels={{ pin1: "Y1", pin2: "A1", pin3: "B1", pin4: "Y2", pin5: "A2", pin6: "B2", pin7: "GND", pin8: "A3", pin9: "B3", pin10: "Y3", pin11: "A4", pin12: "B4", pin13: "Y4", pin14: "VCC" }} pcbX={70} pcbY={-236} schX={38} schY={cYd} schSectionName="COILS" />
      <trace from=".UEXCL > .VCC" to="net.V3P3" schDisplayLabel="V3P3" />
      <trace from=".UEXCL > .GND" to="net.DGND" schDisplayLabel="DGND" />
      {/* G1: A = NOR(KPARA, KPARB) — high only when both parallel commands are OFF */}
      <trace from=".UEXCL > .A1" to="net.CTL_KPARA" schDisplayLabel="CTL_KPARA" />
      <trace from=".UEXCL > .B1" to="net.CTL_KPARB" schDisplayLabel="CTL_KPARB" />
      {/* G2: NOT(KSER) */}
      <trace from=".UEXCL > .A2" to="net.CTL_KSER" schDisplayLabel="CTL_KSER" />
      <trace from=".UEXCL > .B2" to="net.CTL_KSER" schDisplayLabel="CTL_KSER" />
      {/* G3: NOT(A) */}
      <trace from=".UEXCL > .A3" to=".UEXCL > .Y1" />
      <trace from=".UEXCL > .B3" to=".UEXCL > .Y1" />
      {/* G4: KSER_STG1 = NOR(NOT KSER, NOT A) = KSER AND A */}
      <trace from=".UEXCL > .A4" to=".UEXCL > .Y2" />
      <trace from=".UEXCL > .B4" to=".UEXCL > .Y3" />
      <trace from=".UEXCL > .Y4" to="net.KSER_STG1" schDisplayLabel="KSER_STG1" />
      {/* R5-D second stage: the PRE-INSERTION contacts join the exclusion. KPREA/KPREB bridge
          the banks through 10 Ω — closed against KSER they put the series stack across those
          resistors (94 J single-fault class, HR-12). U2.G1 = B = NOR(KPREA,KPREB); G2/G3
          invert; G4 = NOR(¬STG1, ¬B) = STG1 AND B, so
            KSER_GATED = KSER ∧ ¬(KPARA∨KPARB) ∧ ¬(KPREA∨KPREB).
          Sequencing (ramp → open → 20 ms release → weld-check → flip) stays firmware's job in
          fsm.c ST_MODESW; this layer only makes the forbidden STATES unreachable. */}
      <chip name="UEXCL2" footprint="soic14" pinLabels={{ pin1: "Y1", pin2: "A1", pin3: "B1", pin4: "Y2", pin5: "A2", pin6: "B2", pin7: "GND", pin8: "A3", pin9: "B3", pin10: "Y3", pin11: "A4", pin12: "B4", pin13: "Y4", pin14: "VCC" }} pcbX={70} pcbY={-248} schX={34} schY={cYd} schSectionName="COILS" />
      <trace from=".UEXCL2 > .VCC" to="net.V3P3" schDisplayLabel="V3P3" />
      <trace from=".UEXCL2 > .GND" to="net.DGND" schDisplayLabel="DGND" />
      <trace from=".UEXCL2 > .A1" to="net.CTL_KPREA" schDisplayLabel="CTL_KPREA" />
      <trace from=".UEXCL2 > .B1" to="net.CTL_KPREB" schDisplayLabel="CTL_KPREB" />
      <trace from=".UEXCL2 > .A2" to="net.KSER_STG1" schDisplayLabel="KSER_STG1" />
      <trace from=".UEXCL2 > .B2" to="net.KSER_STG1" schDisplayLabel="KSER_STG1" />
      <trace from=".UEXCL2 > .A3" to=".UEXCL2 > .Y1" />
      <trace from=".UEXCL2 > .B3" to=".UEXCL2 > .Y1" />
      <trace from=".UEXCL2 > .A4" to=".UEXCL2 > .Y2" />
      <trace from=".UEXCL2 > .B4" to=".UEXCL2 > .Y3" />
      <trace from=".UEXCL2 > .Y4" to="net.KSER_GATED" schDisplayLabel="KSER_GATED" />
      {/* R5-C: local VCC bypass for both exclusion gates */}
      <capacitor name="CEXCL" capacitance="100nF" footprint="0603" pcbX={64} pcbY={-236} schX={37} schY={cYd - 3} schSectionName="COILS" />
      <trace from=".CEXCL > .pin1" to=".UEXCL > .VCC" />
      <trace from=".CEXCL > .pin2" to="net.DGND" schDisplayLabel="DGND" />
      <capacitor name="CEXCL2" capacitance="100nF" footprint="0603" pcbX={64} pcbY={-248} schX={34} schY={cYd - 3} schSectionName="COILS" />
      <trace from=".CEXCL2 > .pin1" to=".UEXCL2 > .VCC" />
      <trace from=".CEXCL2 > .pin2" to="net.DGND" schDisplayLabel="DGND" />
      <CoilDriver id="LB" ins={["net.KSER_GATED", "net.CTL_KPARA", "net.CTL_KPARB", "net.CTL_KOUT", "net.CTL_KPREA", "net.CTL_KPREB", "net.DGND", "net.DGND"]}
        outs={["net.COIL_KSER", "net.COIL_KPARA", "net.COIL_KPARB", "net.COIL_KOUT", "net.COIL_KPREA", "net.COIL_KPREB", "net.NC_O7", "net.NC_O8"]}
        x={40} y={-236} sx={42} sy={cYd} />

      {/* output: shunt in negative, filter, studs, Y caps */}
      <OutputShunt inn="net.BKBN" out="net.SNS_IOUT" outN="net.SNS_IOUTN" x={Q.shunt[0]} y={Q.shunt[1]} sx={86} sy={27} />
      <capacitor name="COF1" capacitance="4.7uF" footprint={FilmBoxFP(37.5)} pcbX={Q.cofX} pcbY={Q.cof[0]} schX={86} schY={21.5} schSectionName="OUTPUT" />
      <capacitor name="COF2" capacitance="4.7uF" footprint={FilmBoxFP(37.5)} pcbX={Q.cofX} pcbY={Q.cof[1]} schX={88.5} schY={21.5} schSectionName="OUTPUT" />
      <capacitor name="CYO1" capacitance="4.7nF" footprint={FilmBoxFP(10)} pcbX={w / 2 - 60} pcbY={-h / 2 + 40} schX={91} schY={21.5} schSectionName="OUTPUT" />
      <capacitor name="CYO2" capacitance="4.7nF" footprint={FilmBoxFP(10)} pcbX={w / 2 - 60} pcbY={-h / 2 + 30} schX={93.5} schY={21.5} schSectionName="OUTPUT" />
      <chip name="JOUTP" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={Q.outX} pcbY={Q.out[0]} schX={98} schY={28} schSectionName="OUTPUT" />
      <chip name="JOUTN" footprint={<StudFP />} pinLabels={{ pin1: "P" }} pcbX={Q.outX} pcbY={Q.out[1]} schX={98} schY={25} schSectionName="OUTPUT" />
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
      <Bias5Module id="BKA" p5="net.B5BKA" com="net.BKAN" x={Q.b5[0]} y={Q.b5[1]} sx={84} sy={16} />
      <Bias5Module id="BKB" p5="net.B5BKB" com="net.BKBN" x={Q.b5[0]} y={Q.b5[1] - 16} sx={88} sy={16} />
      <IsoVSense id="OA" hv="net.BKAP" ref="net.BKAN" biasP="net.B5BKA" cf="1nF" out="net.SNS_VBKA" x={Q.ivs[0]} y={Q.ivsY} sx={84} sy={12} />
      <IsoVSense id="OB" hv="net.BKBP" ref="net.BKBN" biasP="net.B5BKB" cf="1nF" out="net.SNS_VBKB" x={Q.ivs[1]} y={Q.ivsY} sx={84} sy={7.5} />
      <IsoVSense id="OV" hv="net.OUTP" ref="net.OUTN" biasP="net.B5OUT" cf="1nF" out="net.SNS_VOUT" x={Q.ivs[2]} y={Q.ivsY} sx={84} sy={3} />
      
      <NtcInput id="TLLC" out="net.T_LLC" x={Q.ntcX} y={Q.ntcY} sx={84} sy={-10.5} />
      <NtcInput id="TXFR" out="net.T_XFMR" x={Q.ntcX} y={Q.ntcY - 10} sx={94} sy={-10.5} />

      {/* control: MCU-LLC + safety chain + SWD + CAN + HMI + interconnect */}
      <IsolatedCan x={Q.canX} y={Q.canY} sx={48} sy={cYd} />
      <ConfigHmi x={Q.hmiX} y={-228} sx={63} sy={cYd} />
      {/* straight-through harness — no crossover, no link (E40) */}
      <Interconnect40 id="B" map={HARNESS40}
        x={Q.mcuX} y={Q.icY} sx={84} sy={cYd} />
      {/* MCU pin-map traces moved to the control card; the connector carries these nets. */}
    </board>
  );
};

// ================= CONTROL CARD =================
// One card, both converter roles, 30 and 60 kW. See packages/common-components/control-card.tsx for
// how it was sized and why 120 kW is out of scope.
//
// The card is deliberately ROLE-AGNOSTIC: its MCU is wired to GENERIC nets (PWM0..11, AIN0..12,
// DO0..6 ...) and the connector does the role mapping on the POWER BOARD side. That is what lets
// one card serve either slot -- the card has no idea which converter it is driving until firmware
// reads the ROLE straps at boot.
export const ControlCard = ({ w = 120, h = 80 }: { w?: number; h?: number }) => {
  const map = cardMap("card");                       // generic side: pin name == net name
  return (
    <board routingDisabled={NO_ROUTE} autorouter="auto-local" width={`${w}mm`} height={`${h}mm`} layers={4} thickness="1.6mm"
      schTraceAutoLabelEnabled schMaxTraceDistance={0}
      minTraceWidth="0.15mm" minViaHoleDiameter="0.3mm" minPadEdgeToPadEdgeClearance="0.12mm"
      minBoardEdgeClearance="1mm">
      {/* 4 layers is enough: this board carries no current worth naming. inner1 is a solid DGND
          reference under the MCU and the analogue chains, inner2 is V3P3. */}
      {/* Deliberately NOT isForPower/isGround (presentation, E34/audit): power-class nets render
          as rail/ground glyphs with ROUTED WIRES to them, which wraps the 100-pin MCU symbol in
          long wire loops. Plain nets render as inline label chips at every pin — the handcrafted
          convention this drawing set uses. Net identity (pours, connectivity) is by NAME. */}
      <net name="V3P3" />
      <net name="V24" />
      <net name="V15" />
      <net name="DGND" />
      <net name="AGND" />
      <copperpour connectsTo="net.DGND" layer="inner1" boardEdgeMargin="1.2mm" />
      <copperpour connectsTo="net.V3P3" layer="inner2" boardEdgeMargin="1.2mm" />

      <ControlMcu id="CARD" x={0} y={8} sx={0} sy={0} lay="top" />
      <SwdPort id="CARD" x={-30} y={-18} sx={0} sy={-12} lay="top" />
      {/* R5-A: nrst ties the watchdog WDO onto the MCU reset network (wire-OR) — a hung MCU is
          restarted, not merely inhibited-then-re-enabled. See SafetyChain for the contract. */}
      <SafetyChain id="CARD" enA="net.EN_A" enB="net.EN_B" wdi="net.WDI"
        gateEnA="net.GATE_EN_A" gateEnB="net.GATE_EN" nrst="net.NRST_CARD"
        x={10} y={-18} sx={18} sy={-12} lay="top" />
      <Rail3V3 id="CARD" x={24} y={8} sx={18} sy={0} lay="top" />
      <AnalogMid x={-52} y={-32} sx={0} sy={-20} lay="top" />

      {/* The connector. Same 88-way part as the power board; here every way carries the generic
          net of the same name, so the two sides line up by construction. */}
      <CardConnector id="CARD" map={map} x={0} y={30} sx={40} sy={0} />

      {/* THE MCU PIN MAP. Without this the MCU is an island: every connector way sits on a net
          with exactly one endpoint, the router has nothing to route, and the board still builds.
          It did build, for a while -- the pin-map traces were emitted by the power boards before
          the card existed and were dropped with the MCUs, leaving 55 dead ways. */}
      {Object.entries(CARD_MCU_PINS).map(([way, pin]) => (
        <trace key={way} from={`.UCARD > .pin${pin}`} to={`net.${way}`} schDisplayLabel={way} />
      ))}
      {/* Card-only MCU pins. Without these the MCU has no watchdog kick, no boot strap and no
          debug port -- all three were left behind on the power boards when the MCU moved. */}
      {Object.entries(CARD_INTERNAL).map(([sig, [pin, net]]) => (
        <trace key={sig} from={`.UCARD > .pin${pin}`} to={net} schDisplayLabel={sig} />
      ))}

      {/* CARD_RULES: the FLT pull-up and its filter stay TOGETHER at the MCU end -- splitting a
          safety-critical wired-OR's pull-up across a connector changes its idle state and timing. */}
      <resistor name="RFLTC" resistance="4.7k" footprint="0603" pcbX={40} pcbY={-32} schX={30} schY={-20} schSectionName="SAFETY" />
      <capacitor name="CFLTC" capacitance="1nF" footprint="0603" pcbX={46} pcbY={-32} schX={32} schY={-20} schSectionName="SAFETY" />
      <trace from=".RFLTC > .pin1" to="net.V3P3" schDisplayLabel="V3P3" />
      <trace from=".RFLTC > .pin2" to="net.FLT" schDisplayLabel="FLT" />
      <trace from=".CFLTC > .pin1" to="net.FLT" schDisplayLabel="FLT" />
      <trace from=".CFLTC > .pin2" to="net.DGND" schDisplayLabel="DGND" />

      {/* CARD_RULES: the AGND-to-DGND single-point tie lives HERE and nowhere else. RAGTA and
          RAGTB are deleted from both power boards -- a second tie in parallel is the ground loop
          this exists to prevent. */}
      <resistor name="RAGTC" resistance="0" footprint="0805" pcbX={40} pcbY={-24} schX={30} schY={-16} schSectionName="BOND" />
      <trace from=".RAGTC > .pin1" to="net.AGND" schDisplayLabel="AGND" />
      <trace from=".RAGTC > .pin2" to="net.DGND" schDisplayLabel="DGND" />

      {/* RATING (way ROLE1) is the card's one identity strap, pulled up HERE and coded on the
          host: 0R = module controller · 3.32k = cabinet CSU · open = fault (E24 rev D). */}
      <resistor name="RROLE1" resistance="10k" footprint="0603" pcbX={46} pcbY={-16} schX={32} schY={-12} schSectionName="ID" />
      <trace from=".RROLE1 > .pin1" to="net.V3P3" schDisplayLabel="V3P3" />
      <trace from=".RROLE1 > .pin2" to="net.ROLE1" schDisplayLabel="ROLE1" />
    </board>
  );
};
