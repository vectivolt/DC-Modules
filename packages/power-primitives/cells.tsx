// cells.tsx v3 — schematic-complete parameterized cells for the two-board (AC-DC / DC-DC) split.
// PCB layout intentionally NOT tuned (customer directive 2026-09-04): pcb coords are coarse grid
// only so builds succeed; schematic completeness + BOM accuracy are the deliverable.
// v3 (2026-09-05) closes the production-review blockers CB-1…CB-15 + HR list
// (docs/design-review-production.md, fix log in its appendix). Key deltas vs v2:
//   CB-12 driver CLAMP wired to gate · HR-6 PWM pulldowns · en is now a parameter (CB-10 chain)
//   CB-9 Vienna per-phase film commutation caps · E28 LLC node RC snubbers deleted (CV²f),
//   Vienna snubber 470p→100p 2 W · HR-3 clamp bleeder 5 W axial
//   CB-5/6/7 aux flyback complete + full-bus feed + 60 W (E26, D4 rev B)
//   CB-15/E31 bipolar senses biased to buffered AVMID + dual clamps
//   CB-3/E25 IsoVSense replaces HvDivider (all HV senses isolated, SELV control domain)
//   CB-11 discharge default-OFF via isolated opto driver (DCN-referenced bias)
//   E30 mirror-contact relays + readback nets · CB-13 SwdPort · CB-10 SafetyChain (WD + 3-in AND)
// Frozen electrical values: docs/assumptions.md E1–E31. Footprint dims: VERIFY vs vendor (§40).

export const TO247_4 = () => (
  <footprint>
    {["pin1", "pin2", "pin3", "pin4"].map((h, i) => (
      <platedhole key={h} portHints={[h]} pcbX={-3.81 + i * 2.54} pcbY={0} holeDiameter="1.8mm" outerDiameter="2.4mm" shape="circle" />
    ))}
  </footprint>
);
// diode package: port hints bind directly to diode anode/cathode (pin1=anode/pin2=cathode — VERIFY vs vendor)
export const TO247_2 = () => (
  <footprint>
    <platedhole portHints={["anode", "pin1"]} pcbX={-2.72} pcbY={0} holeDiameter="1.8mm" outerDiameter="2.4mm" shape="circle" />
    <platedhole portHints={["cathode", "pin2"]} pcbX={2.72} pcbY={0} holeDiameter="1.8mm" outerDiameter="2.4mm" shape="circle" />
  </footprint>
);
export const ChokeFP = () => (
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={-30} pcbY={-6} holeDiameter="2.5mm" outerDiameter="4mm" shape="circle" />
    <platedhole portHints={["pin2"]} pcbX={30} pcbY={-6} holeDiameter="2.5mm" outerDiameter="4mm" shape="circle" />
  </footprint>
);
export const Cm3FP = () => (
  <footprint>
    {["pin1", "pin2", "pin3", "pin4", "pin5", "pin6"].map((h, i) => (
      <platedhole key={h} portHints={[h]} pcbX={-25 + (i % 2) * 50} pcbY={-12 + Math.floor(i / 2) * 12} holeDiameter="2mm" outerDiameter="3.4mm" shape="circle" />
    ))}
  </footprint>
);
export const XfmrFP = () => (
  <footprint>
    {["pin1", "pin2", "pin3"].map((h, i) => (
      <platedhole key={h} portHints={[h]} pcbX={-8 + i * 8} pcbY={-20} holeDiameter="1.6mm" outerDiameter="2.6mm" shape="circle" />
    ))}
    {["pin4", "pin5", "pin6", "pin7"].map((h, i) => (
      <platedhole key={h} portHints={[h]} pcbX={-12 + i * 8} pcbY={20} holeDiameter="1.6mm" outerDiameter="2.6mm" shape="circle" />
    ))}
  </footprint>
);
export const SnapInFP = () => (
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={-5} pcbY={0} holeDiameter="2.1mm" outerDiameter="3.6mm" shape="circle" />
    <platedhole portHints={["pin2"]} pcbX={5} pcbY={0} holeDiameter="2.1mm" outerDiameter="3.6mm" shape="circle" />
  </footprint>
);
export const RelayFP = () => (
  <footprint>
    {["pin1", "pin2"].map((h, i) => (
      <platedhole key={h} portHints={[h]} pcbX={-8 + i * 16} pcbY={-12} holeDiameter="1.5mm" outerDiameter="2.5mm" shape="circle" />
    ))}
    {["pin3", "pin4"].map((h, i) => (
      <platedhole key={h} portHints={[h]} pcbX={-10 + i * 20} pcbY={8} holeDiameter="4.2mm" outerDiameter="8mm" shape="circle" />
    ))}
  </footprint>
);
// E30: relay with mirror (auxiliary) contact for weld/readback — coil pair, HV pair, mirror pair
export const RelayMFP = () => (
  <footprint>
    {["pin1", "pin2"].map((h, i) => (
      <platedhole key={h} portHints={[h]} pcbX={-8 + i * 16} pcbY={-12} holeDiameter="1.5mm" outerDiameter="2.5mm" shape="circle" />
    ))}
    {["pin3", "pin4"].map((h, i) => (
      <platedhole key={h} portHints={[h]} pcbX={-10 + i * 20} pcbY={8} holeDiameter="4.2mm" outerDiameter="8mm" shape="circle" />
    ))}
    {["pin5", "pin6"].map((h, i) => (
      <platedhole key={h} portHints={[h]} pcbX={-8 + i * 16} pcbY={-20} holeDiameter="1.2mm" outerDiameter="2.2mm" shape="circle" />
    ))}
  </footprint>
);
export const StudFP = () => (
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={0} pcbY={0} holeDiameter="8.5mm" outerDiameter="16mm" shape="circle" />
  </footprint>
);
export const FilmBoxFP = (pitch = 27.5) => (
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={-pitch / 2} pcbY={0} holeDiameter="1.2mm" outerDiameter="2.2mm" shape="circle" />
    <platedhole portHints={["pin2"]} pcbX={pitch / 2} pcbY={0} holeDiameter="1.2mm" outerDiameter="2.2mm" shape="circle" />
  </footprint>
);
export const ShuntFP = () => (
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={-10} pcbY={0} holeDiameter="4mm" outerDiameter="7mm" shape="circle" />
    <platedhole portHints={["pin2"]} pcbX={10} pcbY={0} holeDiameter="4mm" outerDiameter="7mm" shape="circle" />
    <platedhole portHints={["pin3"]} pcbX={-5} pcbY={4} holeDiameter="1.1mm" outerDiameter="2mm" shape="circle" />
    <platedhole portHints={["pin4"]} pcbX={5} pcbY={4} holeDiameter="1.1mm" outerDiameter="2mm" shape="circle" />
  </footprint>
);
export const TrimFP = () => (
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={-15} pcbY={0} holeDiameter="2.5mm" outerDiameter="4mm" shape="circle" />
    <platedhole portHints={["pin2"]} pcbX={15} pcbY={0} holeDiameter="2.5mm" outerDiameter="4mm" shape="circle" />
  </footprint>
);
export const CtFP = () => (
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={-5} pcbY={0} holeDiameter="1.1mm" outerDiameter="2mm" shape="circle" />
    <platedhole portHints={["pin2"]} pcbX={5} pcbY={0} holeDiameter="1.1mm" outerDiameter="2mm" shape="circle" />
  </footprint>
);
export const Seg2FP = () => (
  <footprint>
    {Array.from({ length: 10 }, (_, i) => (
      <platedhole key={i} portHints={[`pin${i + 1}`]} pcbX={-11.43 + (i % 5) * 5.08} pcbY={i < 5 ? -7.62 : 7.62} holeDiameter="0.9mm" outerDiameter="1.6mm" shape="circle" />
    ))}
  </footprint>
);
export const Lqfp100 = () => (
  <footprint>
    {Array.from({ length: 100 }, (_, i) => {
      const side = Math.floor(i / 25), k = i % 25, off = -6 + k * 0.5;
      const pos = side === 0 ? { x: -7.6, y: off, w: 1.2, h: 0.3 } : side === 1 ? { x: off, y: -7.6, w: 0.3, h: 1.2 }
        : side === 2 ? { x: 7.6, y: -off, w: 1.2, h: 0.3 } : { x: -off, y: 7.6, w: 0.3, h: 1.2 };
      return <smtpad key={i} portHints={[`pin${i + 1}`]} pcbX={pos.x} pcbY={pos.y} width={`${pos.w}mm`} height={`${pos.h}mm`} shape="rect" />;
    })}
  </footprint>
);
export const XfmrAuxFP = () => (
  <footprint>
    {Array.from({ length: 8 }, (_, i) => (
      <platedhole key={i} portHints={[`pin${i + 1}`]} pcbX={-9 + (i % 4) * 6} pcbY={i < 4 ? -6 : 6} holeDiameter="1.1mm" outerDiameter="2mm" shape="circle" />
    ))}
  </footprint>
);

const DRV_PINS = { pin1: "VIA", pin2: "GNDA", pin3: "PWM", pin4: "EN", pin5: "FLT", pin6: "RDY", pin7: "NC1", pin8: "NC2", pin9: "CLAMP", pin10: "VEE", pin11: "OUTL", pin12: "OUTH", pin13: "VCC2", pin14: "KSRC", pin15: "DST", pin16: "GND2" };
const ISOAMP_PINS = { pin1: "VDD1", pin2: "VINP", pin3: "VINN", pin4: "GND1", pin5: "GND2", pin6: "OUTN", pin7: "OUTP", pin8: "VDD2" };

// ---------- isolated gate-bias module (+18/−4). HR-10: reverted to packaged module p/n for
// buildability (custom E23 transformer deferred to cost-ECO-1; C_io ≤ 10 pF spec in D5 when it runs).
export const BiasModule = ({ id, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <chip name={`PS${id}`} footprint="pinrow5" pinLabels={{ pin1: "VIN", pin2: "GND", pin3: "P18", pin4: "COM", pin5: "N4" }} pcbX={x} pcbY={y} schX={sx} schY={sy} />
);
// 5 V isolated bias module (iso-amp primary-side supplies; PSCAN/PSSH pattern)
export const Bias5Module = ({ id, p5, com, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`b5${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name={`PS5${id}`} footprint="pinrow5" pinLabels={{ pin1: "VIN", pin2: "GND", pin3: "P5", pin4: "COM", pin5: "NC" }} pcbX={0} pcbY={0} schX={0} schY={0} />
    <trace from={`.PS5${id} > .VIN`} to="net.V15" />
    <trace from={`.PS5${id} > .GND`} to="net.DGND" />
    <trace from={`.PS5${id} > .P5`} to={p5} />
    <trace from={`.PS5${id} > .COM`} to={com} />
  </group>
);

// ---------- one isolated driver channel, fully wired: bias, DESAT (2× 1 kV diodes + blanking),
// split Rg on/off (DPT-frozen E5/E6), gate pulldown, Kelvin return, PWM/EN/FLT nets.
// v3: CLAMP pin tied to gate (CB-12, Miller clamp active — VERIFY app circuit vs final NSI6611 DS),
// 10 k PWM pulldown (HR-6, defined low during MCU reset), en parameterized (CB-10 per-board chain).
export const DriverCh = ({ id, pwm, flt, gate, kelvin, desatNode, rgOn, rgOff, en, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`drv${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name={`U${id}`} footprint="soic16" pinLabels={DRV_PINS} pcbX={0} pcbY={0} schX={0} schY={0} />
    <BiasModule id={id} x={0} y={12} sx={0} sy={1.6} />
    <resistor name={`R${id}ON`} resistance={rgOn} footprint="1206" pcbX={16} pcbY={0} schX={1.6} schY={-0.4} />
    <resistor name={`R${id}OFF`} resistance={rgOff} footprint="1206" pcbX={16} pcbY={5} schX={1.6} schY={0.2} />
    <resistor name={`R${id}GS`} resistance="10k" footprint="0805" pcbX={16} pcbY={10} schX={1.6} schY={0.8} />
    <resistor name={`R${id}PD`} resistance="10k" footprint="0603" pcbX={-10} pcbY={6} schX={-1} schY={0.4} />
    <diode name={`D${id}S1`} footprint="sma" pcbX={28} pcbY={0} schX={2.6} schY={-0.8} />
    <diode name={`D${id}S2`} footprint="sma" pcbX={34} pcbY={0} schX={3.2} schY={-0.8} />
    <capacitor name={`C${id}BL`} capacitance="100pF" footprint="0603" pcbX={28} pcbY={6} schX={2.6} schY={-0.2} />
    <capacitor name={`C${id}B1`} capacitance="1uF" footprint="0805" pcbX={6} pcbY={12} schX={0.7} schY={1.6} />
    <capacitor name={`C${id}B2`} capacitance="1uF" footprint="0805" pcbX={12} pcbY={12} schX={1.3} schY={1.6} />
    <trace from={`.U${id} > .VIA`} to="net.V3P3" />
    <trace from={`.U${id} > .GNDA`} to="net.DGND" />
    <trace from={`.U${id} > .PWM`} to={pwm} />
    <trace from={`.R${id}PD > .pin1`} to={pwm} />
    <trace from={`.R${id}PD > .pin2`} to="net.DGND" />
    <trace from={`.U${id} > .EN`} to={en} />
    <trace from={`.U${id} > .FLT`} to={flt} />
    <trace from={`.PS${id} > .VIN`} to="net.V15" />
    <trace from={`.PS${id} > .GND`} to="net.DGND" />
    <trace from={`.PS${id} > .P18`} to={`.U${id} > .VCC2`} />
    <trace from={`.PS${id} > .COM`} to={`.U${id} > .GND2`} />
    <trace from={`.PS${id} > .N4`} to={`.U${id} > .VEE`} />
    <trace from={`.C${id}B1 > .pin1`} to={`.U${id} > .VCC2`} />
    <trace from={`.C${id}B1 > .pin2`} to={`.U${id} > .GND2`} />
    <trace from={`.C${id}B2 > .pin1`} to={`.U${id} > .GND2`} />
    <trace from={`.C${id}B2 > .pin2`} to={`.U${id} > .VEE`} />
    <trace from={`.U${id} > .OUTH`} to={`.R${id}ON > .pin1`} />
    <trace from={`.R${id}ON > .pin2`} to={gate} />
    <trace from={`.U${id} > .OUTL`} to={`.R${id}OFF > .pin1`} />
    <trace from={`.R${id}OFF > .pin2`} to={gate} />
    <trace from={`.U${id} > .CLAMP`} to={gate} />
    <trace from={`.R${id}GS > .pin1`} to={gate} />
    <trace from={`.R${id}GS > .pin2`} to={kelvin} />
    <trace from={`.U${id} > .KSRC`} to={kelvin} />
    <trace from={`.U${id} > .DST`} to={`.D${id}S1 > .anode`} />
    <trace from={`.D${id}S1 > .cathode`} to={`.D${id}S2 > .anode`} />
    <trace from={`.D${id}S2 > .cathode`} to={desatNode} />
    <trace from={`.C${id}BL > .pin1`} to={`.U${id} > .DST`} />
    <trace from={`.C${id}BL > .pin2`} to={`.U${id} > .GND2`} />
  </group>
);

// ---------- Vienna phase: choke + common-source pair (ONE driver ch) + boost JBS + RC + RCD clamp
// v3: per-phase film commutation caps DCP–MID / MID–DCN (CB-9 — restores the ≤10 nH loop premise
// behind the DPT-frozen drive; §P-1 layout note: at the leg pins), snubber C 470p→100p with 2 W R
// (E28 corrected CV²f = 0.86 W), clamp bleeder to 5 W axial (HR-3, 4.3 W worst-case).
export const ViennaPhase = ({ id, ac, dcp, dcn, mid, pwm, flt, en, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`vp${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name={`L${id}`} footprint={<ChokeFP />} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={0} pcbY={0} schX={-3} schY={0} />
    <chip name={`Q${id}A`} footprint={<TO247_4 />} pinLabels={{ pin1: "G", pin2: "D", pin3: "S", pin4: "KS" }} pcbX={70} pcbY={0} schX={0} schY={0.6} />
    <chip name={`Q${id}B`} footprint={<TO247_4 />} pinLabels={{ pin1: "G", pin2: "D", pin3: "S", pin4: "KS" }} pcbX={82} pcbY={0} schX={1.4} schY={0.6} />
    <DriverCh id={`${id}G`} pwm={pwm} flt={flt} en={en} gate={`net.G_${id}`} kelvin={`net.KS_${id}`} desatNode={`net.PH${id}`} rgOn="4.7" rgOff="4.7" x={70} y={16} sx={-1} sy={2.2} />
    <diode name={`D${id}T`} footprint={<TO247_2 />} pcbX={104} pcbY={0} schX={2.8} schY={-0.6} />
    <diode name={`D${id}B`} footprint={<TO247_2 />} pcbX={104} pcbY={10} schX={2.8} schY={1.6} />
    <capacitor name={`C${id}FP`} capacitance="1uF" footprint={FilmBoxFP(22.5)} pcbX={94} pcbY={-10} schX={2.1} schY={-1.4} />
    <capacitor name={`C${id}FN`} capacitance="1uF" footprint={FilmBoxFP(22.5)} pcbX={94} pcbY={20} schX={2.1} schY={2.4} />
    <resistor name={`R${id}SN`} resistance="10" footprint="2512" pcbX={118} pcbY={0} schX={3.7} schY={0.2} />
    <capacitor name={`C${id}SN`} capacitance="100pF" footprint="1812" pcbX={118} pcbY={6} schX={3.7} schY={0.8} />
    <diode name={`D${id}C`} footprint={<TO247_2 />} pcbX={132} pcbY={0} schX={4.5} schY={-0.6} />
    <capacitor name={`C${id}C`} capacitance="100nF" footprint={FilmBoxFP(15)} pcbX={132} pcbY={10} schX={5.2} schY={-0.6} />
    <chip name={`R${id}C`} footprint={FilmBoxFP(20)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={132} pcbY={18} schX={5.9} schY={-0.6} />
    <trace from={ac} to={`.L${id} > .A`} />
    <trace from={`.L${id} > .B`} to={`net.PH${id}`} />
    <trace from={`.Q${id}A > .D`} to={`net.PH${id}`} />
    <trace from={`.Q${id}A > .G`} to={`net.G_${id}`} />
    <trace from={`.Q${id}A > .KS`} to={`net.KS_${id}`} />
    <trace from={`.Q${id}A > .S`} to={`.Q${id}B > .S`} />
    <trace from={`.Q${id}B > .KS`} to={`net.KS_${id}`} />
    <trace from={`.Q${id}B > .G`} to={`net.G_${id}`} />
    <trace from={`.Q${id}B > .D`} to={mid} />
    <trace from={`.D${id}T > .anode`} to={`net.PH${id}`} />
    <trace from={`.D${id}T > .cathode`} to={dcp} />
    <trace from={`.D${id}B > .cathode`} to={`net.PH${id}`} />
    <trace from={`.D${id}B > .anode`} to={dcn} />
    <trace from={`.C${id}FP > .pin1`} to={dcp} />
    <trace from={`.C${id}FP > .pin2`} to={mid} />
    <trace from={`.C${id}FN > .pin1`} to={mid} />
    <trace from={`.C${id}FN > .pin2`} to={dcn} />
    <trace from={`.R${id}SN > .pin1`} to={`net.PH${id}`} />
    <trace from={`.R${id}SN > .pin2`} to={`.C${id}SN > .pin1`} />
    <trace from={`.C${id}SN > .pin2`} to={mid} />
    <trace from={`.D${id}C > .anode`} to={`net.PH${id}`} />
    <trace from={`.D${id}C > .cathode`} to={`.C${id}C > .pin1`} />
    <trace from={`.C${id}C > .pin2`} to={dcp} />
    <trace from={`.R${id}C > .A`} to={`.C${id}C > .pin1`} />
    <trace from={`.R${id}C > .B`} to={dcp} />
  </group>
);

// ---------- LLC half-bridge leg: 2 FETs + 2 driver channels.
// v3/E28: node RC snubbers DELETED — ZVS topology needs none and CV²f at 140 kHz (≈45 W for
// 470 pF/830 V) is untenable; ringing containment is the DPT-frozen gate drive + ≤15 nH loop (§P-2).
export const LlcHalfBridgeLeg = ({ id, bus, gnd, sw, pwmH, pwmL, flt, en, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`leg${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name={`Q${id}H`} footprint={<TO247_4 />} pinLabels={{ pin1: "G", pin2: "D", pin3: "S", pin4: "KS" }} pcbX={0} pcbY={0} schX={0} schY={0} />
    <chip name={`Q${id}L`} footprint={<TO247_4 />} pinLabels={{ pin1: "G", pin2: "D", pin3: "S", pin4: "KS" }} pcbX={12} pcbY={0} schX={0} schY={2.2} />
    <DriverCh id={`${id}H`} pwm={pwmH} flt={flt} en={en} gate={`net.GH_${id}`} kelvin={`net.KH_${id}`} desatNode={bus} rgOn="4.7" rgOff="2.2" x={0} y={16} sx={-4.5} sy={0} />
    <DriverCh id={`${id}L`} pwm={pwmL} flt={flt} en={en} gate={`net.GL_${id}`} kelvin={`net.KL_${id}`} desatNode={sw} rgOn="4.7" rgOff="2.2" x={44} y={16} sx={-4.5} sy={2.2} />
    <trace from={`.Q${id}H > .D`} to={bus} />
    <trace from={`.Q${id}H > .S`} to={sw} />
    <trace from={`.Q${id}H > .G`} to={`net.GH_${id}`} />
    <trace from={`.Q${id}H > .KS`} to={`net.KH_${id}`} />
    <trace from={`.Q${id}L > .D`} to={sw} />
    <trace from={`.Q${id}L > .S`} to={gnd} />
    <trace from={`.Q${id}L > .G`} to={`net.GL_${id}`} />
    <trace from={`.Q${id}L > .KS`} to={`net.KL_${id}`} />
    <trace from={`net.KH_${id}`} to={sw} />
    <trace from={`net.KL_${id}`} to={gnd} />
  </group>
);

// ---------- LLC section: 4× Cr ∥ + trim Lr + resonant CT + transformer + dual JBS bridges
// v3/CB-15: CT return + burden biased to AVMID (VREF/2), series R + dual clamp into the ADC net.
export const LlcSection = ({ id, sw, star, bkAp, bkAn, bkBp, bkBn, ctOut, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`sec${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {[0, 1, 2, 3].map(i => (
      <capacitor key={i} name={`C${id}R${i}`} capacitance="44nF" footprint={FilmBoxFP(27.5)} pcbX={0} pcbY={i * 8} schX={0} schY={i * 0.4} />
    ))}
    <chip name={`L${id}T`} footprint={<TrimFP />} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={40} pcbY={0} schX={1.3} schY={0} />
    <chip name={`CT${id}`} footprint={<CtFP />} pinLabels={{ pin1: "S1", pin2: "S2" }} pcbX={40} pcbY={10} schX={1.3} schY={0.8} />
    <resistor name={`R${id}CT`} resistance="33" footprint="1206" pcbX={52} pcbY={10} schX={2} schY={0.8} />
    <resistor name={`R${id}CF`} resistance="1k" footprint="0603" pcbX={58} pcbY={10} schX={2.5} schY={0.8} />
    <capacitor name={`C${id}CF`} capacitance="1nF" footprint="0603" pcbX={64} pcbY={14} schX={2.9} schY={1.2} />
    <diode name={`D${id}CP`} footprint="sod323" pcbX={64} pcbY={6} schX={2.9} schY={0.3} />
    <diode name={`D${id}CN`} footprint="sod323" pcbX={70} pcbY={6} schX={3.3} schY={0.3} />
    <chip name={`T${id}`} footprint={<XfmrFP />} pinLabels={{ pin1: "P1", pin2: "P2", pin3: "SH", pin4: "S1A", pin5: "S1B", pin6: "S2A", pin7: "S2B" }} pcbX={80} pcbY={10} schX={3} schY={0.4} />
    {["A1", "A2", "A3", "A4"].map((d, i) => (
      <diode key={d} name={`D${id}${d}`} footprint={<TO247_2 />} pcbX={110 + i * 12} pcbY={0} schX={4.6 + i * 0.8} schY={0} />
    ))}
    {["B1", "B2", "B3", "B4"].map((d, i) => (
      <diode key={d} name={`D${id}${d}`} footprint={<TO247_2 />} pcbX={110 + i * 12} pcbY={12} schX={4.6 + i * 0.8} schY={1.2} />
    ))}
    {[0, 1, 2, 3].map(i => [
      <trace key={`a${i}`} from={sw} to={`.C${id}R${i} > .pin1`} />,
      <trace key={`b${i}`} from={`.C${id}R${i} > .pin2`} to={`.L${id}T > .A`} />,
    ])}
    <trace from={`.L${id}T > .B`} to={`.T${id} > .P1`} />
    <trace from={`.T${id} > .P2`} to={star} />
    <trace from={`.T${id} > .SH`} to={star} />
    <trace from={`.CT${id} > .S1`} to={`net.CTB${id}`} />
    <trace from={`.CT${id} > .S2`} to="net.AVMID" />
    <trace from={`.R${id}CT > .pin1`} to={`net.CTB${id}`} />
    <trace from={`.R${id}CT > .pin2`} to="net.AVMID" />
    <trace from={`.R${id}CF > .pin1`} to={`net.CTB${id}`} />
    <trace from={`.R${id}CF > .pin2`} to={ctOut} />
    <trace from={`.C${id}CF > .pin1`} to={ctOut} />
    <trace from={`.C${id}CF > .pin2`} to="net.AVMID" />
    <trace from={`.D${id}CP > .anode`} to={ctOut} />
    <trace from={`.D${id}CP > .cathode`} to="net.V3P3" />
    <trace from={`.D${id}CN > .anode`} to="net.AGND" />
    <trace from={`.D${id}CN > .cathode`} to={ctOut} />
    <trace from={`.D${id}A1 > .anode`} to={`.T${id} > .S1A`} />
    <trace from={`.D${id}A1 > .cathode`} to={bkAp} />
    <trace from={`.D${id}A2 > .cathode`} to={`.T${id} > .S1A`} />
    <trace from={`.D${id}A2 > .anode`} to={bkAn} />
    <trace from={`.D${id}A3 > .anode`} to={`.T${id} > .S1B`} />
    <trace from={`.D${id}A3 > .cathode`} to={bkAp} />
    <trace from={`.D${id}A4 > .cathode`} to={`.T${id} > .S1B`} />
    <trace from={`.D${id}A4 > .anode`} to={bkAn} />
    <trace from={`.D${id}B1 > .anode`} to={`.T${id} > .S2A`} />
    <trace from={`.D${id}B1 > .cathode`} to={bkBp} />
    <trace from={`.D${id}B2 > .cathode`} to={`.T${id} > .S2A`} />
    <trace from={`.D${id}B2 > .anode`} to={bkBn} />
    <trace from={`.D${id}B3 > .anode`} to={`.T${id} > .S2B`} />
    <trace from={`.D${id}B3 > .cathode`} to={bkBp} />
    <trace from={`.D${id}B4 > .cathode`} to={`.T${id} > .S2B`} />
    <trace from={`.D${id}B4 > .anode`} to={bkBn} />
  </group>
);

// ---------- split DC link
export const SplitDcLink = ({ id = "", nPerHalf, dcp, dcn, mid, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`dclink${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {Array.from({ length: nPerHalf }, (_, i) => (
      <capacitor key={`t${i}`} name={`CDT${id}${i}`} capacitance="470uF" footprint={<SnapInFP />} pcbX={i * 40} pcbY={0} schX={i * 0.8} schY={0} />
    ))}
    {Array.from({ length: nPerHalf }, (_, i) => (
      <capacitor key={`b${i}`} name={`CDB${id}${i}`} capacitance="470uF" footprint={<SnapInFP />} pcbX={i * 40} pcbY={-45} schX={i * 0.8} schY={1.2} />
    ))}
    <resistor name={`RBALT${id}`} resistance="100k" footprint="2512" pcbX={nPerHalf * 40} pcbY={0} schX={nPerHalf * 0.8} schY={0} />
    <resistor name={`RBALB${id}`} resistance="100k" footprint="2512" pcbX={nPerHalf * 40} pcbY={-45} schX={nPerHalf * 0.8} schY={1.2} />
    {Array.from({ length: nPerHalf }, (_, i) => [
      <trace key={`tt${i}`} from={`.CDT${id}${i} > .pin1`} to={dcp} />,
      <trace key={`tm${i}`} from={`.CDT${id}${i} > .pin2`} to={mid} />,
      <trace key={`bm${i}`} from={`.CDB${id}${i} > .pin1`} to={mid} />,
      <trace key={`bn${i}`} from={`.CDB${id}${i} > .pin2`} to={dcn} />,
    ])}
    <trace from={`.RBALT${id} > .pin1`} to={dcp} />
    <trace from={`.RBALT${id} > .pin2`} to={mid} />
    <trace from={`.RBALB${id} > .pin1`} to={mid} />
    <trace from={`.RBALB${id} > .pin2`} to={dcn} />
  </group>
);

// ---------- S/P matrix incl. pre-insertion aux relays + K_OUT (E12); coils to CoilDriver nets
// v3/E30: mirror-contact relays; per-relay readback net (10 k pull-up, closed-main → mirror open).
// HR-12: pre-insertion resistors are pulse-rated axial (94 J single-fault case documented).
export const SeriesParallelRelayMatrix = ({ bkAp, bkAn, bkBp, bkBn, outp, outn, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name="spmatrix" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {["KSER", "KPARA", "KPARB", "KOUT", "KPREA", "KPREB"].map((k, i) => (
      <chip key={k} name={k} footprint={<RelayMFP />} pinLabels={{ pin1: "C1", pin2: "C2", pin3: "A", pin4: "B", pin5: "M1", pin6: "M2" }} pcbX={(i % 3) * 40} pcbY={Math.floor(i / 3) * 35} schX={(i % 3) * 2} schY={Math.floor(i / 3) * 1.4} />
    ))}
    {["KSER", "KPARA", "KPARB", "KOUT", "KPREA", "KPREB"].map((k, i) => (
      <resistor key={`r${k}`} name={`RKPU${k}`} resistance="10k" footprint="0603" pcbX={(i % 3) * 40 + 20} pcbY={Math.floor(i / 3) * 35 + 15} schX={(i % 3) * 2 + 1} schY={Math.floor(i / 3) * 1.4 + 0.7} />
    ))}
    <chip name="RPREA" footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={130} pcbY={0} schX={6.4} schY={0} />
    <chip name="RPREB" footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={130} pcbY={35} schX={6.4} schY={1.4} />
    {["KSER", "KPARA", "KPARB", "KOUT", "KPREA", "KPREB"].map(k => [
      <trace key={`c1${k}`} from={`.${k} > .C1`} to="net.V24" />,
      <trace key={`c2${k}`} from={`.${k} > .C2`} to={`net.COIL_${k}`} />,
      <trace key={`m1${k}`} from={`.${k} > .M1`} to="net.DGND" />,
      <trace key={`m2${k}`} from={`.${k} > .M2`} to={`net.RELAY_FB_${k}`} />,
      <trace key={`pu${k}`} from={`.RKPU${k} > .pin1`} to="net.V3P3" />,
      <trace key={`pu2${k}`} from={`.RKPU${k} > .pin2`} to={`net.RELAY_FB_${k}`} />,
    ])}
    <trace from=".KSER > .A" to={bkAn} />
    <trace from=".KSER > .B" to={bkBp} />
    <trace from=".KPARA > .A" to={bkAp} />
    <trace from=".KPARA > .B" to={bkBp} />
    <trace from=".KPARB > .A" to={bkAn} />
    <trace from=".KPARB > .B" to={bkBn} />
    <trace from=".KPREA > .A" to={bkAp} />
    <trace from=".KPREA > .B" to=".RPREA > .A" />
    <trace from=".RPREA > .B" to={bkBp} />
    <trace from=".KPREB > .A" to={bkAn} />
    <trace from=".KPREB > .B" to=".RPREB > .A" />
    <trace from=".RPREB > .B" to={bkBn} />
    <trace from=".KOUT > .A" to={bkAp} />
    <trace from=".KOUT > .B" to={outp} />
    <trace from={bkBn} to={outn} />
  </group>
);

// ---------- relay-coil driver (8-ch darlington array, COM clamp to 24 V). Unused inputs to DGND (MR-8).
export const CoilDriver = ({ id, ins, outs, x = 0, y = 0, sx = 0, sy = 0 }: { id: string; ins: string[]; outs: string[]; x?: number; y?: number; sx?: number; sy?: number }) => (
  <group name={`uln${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name={`U${id}`} footprint="soic18" pinLabels={{ pin1: "IN1", pin2: "IN2", pin3: "IN3", pin4: "IN4", pin5: "IN5", pin6: "IN6", pin7: "IN7", pin8: "IN8", pin9: "GND", pin10: "COM", pin11: "OUT8", pin12: "OUT7", pin13: "OUT6", pin14: "OUT5", pin15: "OUT4", pin16: "OUT3", pin17: "OUT2", pin18: "OUT1" }} pcbX={0} pcbY={0} schX={0} schY={0} />
    {ins.map((n, i) => <trace key={`i${i}`} from={`.U${id} > .IN${i + 1}`} to={n} />)}
    {outs.map((n, i) => <trace key={`o${i}`} from={`.U${id} > .OUT${i + 1}`} to={n} />)}
    <trace from={`.U${id} > .GND`} to="net.DGND" />
    <trace from={`.U${id} > .COM`} to="net.V24" />
  </group>
);

// ---------- isolated HV voltage sense (E25, replaces the barrier-breaching resistive HvDivider —
// CB-3): 8× 1206 divider chain referenced INSIDE the measured domain + iso voltage-sense amp
// (AMC1311-class unipolar / AMC1350-class ±bipolar for AC) + isolated 5 V floating-side bias.
// biasP/biasG: floating-side rail nodes (share one Bias5Module per domain). outN optional.
export const IsoVSense = ({ id, hv, ref, out, outN, biasP, rBot = "6.8k", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`ivs${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {Array.from({ length: 8 }, (_, i) => (
      <resistor key={i} name={`R${id}D${i}`} resistance="475k" footprint="1206" pcbX={i * 6} pcbY={0} schX={i * 0.6} schY={0} />
    ))}
    <resistor name={`R${id}DL`} resistance={rBot} footprint="0805" pcbX={50} pcbY={5} schX={4.9} schY={0.5} />
    <capacitor name={`C${id}DF`} capacitance="10nF" footprint="0805" pcbX={56} pcbY={5} schX={5.5} schY={0.5} />
    <chip name={`UIV${id}`} footprint="soic8" pinLabels={ISOAMP_PINS} pcbX={64} pcbY={0} schX={6.2} schY={0} />
    <trace from={hv} to={`.R${id}D0 > .pin1`} />
    {Array.from({ length: 7 }, (_, i) => (
      <trace key={i} from={`.R${id}D${i} > .pin2`} to={`.R${id}D${i + 1} > .pin1`} />
    ))}
    <trace from={`.R${id}D7 > .pin2`} to={`.R${id}DL > .pin1`} />
    <trace from={`.R${id}DL > .pin2`} to={ref} />
    <trace from={`.C${id}DF > .pin1`} to={`.R${id}DL > .pin1`} />
    <trace from={`.C${id}DF > .pin2`} to={ref} />
    <trace from={`.UIV${id} > .VINP`} to={`.R${id}DL > .pin1`} />
    <trace from={`.UIV${id} > .VINN`} to={ref} />
    <trace from={`.UIV${id} > .GND1`} to={ref} />
    <trace from={`.UIV${id} > .VDD1`} to={biasP} />
    <trace from={`.UIV${id} > .VDD2`} to="net.V3P3" />
    <trace from={`.UIV${id} > .GND2`} to="net.AGND" />
    <trace from={`.UIV${id} > .OUTP`} to={out} />
    {outN ? <trace from={`.UIV${id} > .OUTN`} to={outN} /> : null}
  </group>
);

// ---------- buffered mid-rail (E31/CB-15): VREF/2 source for every bipolar CT/sense return
export const AnalogMid = ({ x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name="avmid" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <resistor name="RAVH" resistance="10k" footprint="0603" pcbX={0} pcbY={0} schX={0} schY={0} />
    <resistor name="RAVL" resistance="10k" footprint="0603" pcbX={0} pcbY={5} schX={0} schY={0.5} />
    <capacitor name="CAVM" capacitance="100nF" footprint="0603" pcbX={6} pcbY={5} schX={0.6} schY={0.5} />
    <chip name="UAVB" footprint="soic8" pinLabels={{ pin1: "OUT", pin2: "INN", pin3: "INP", pin4: "VN", pin5: "NC1", pin6: "NC2", pin7: "NC3", pin8: "VP" }} pcbX={12} pcbY={0} schX={1.2} schY={0} />
    <capacitor name="CAVO" capacitance="10uF" footprint="0805" pcbX={22} pcbY={5} schX={2} schY={0.5} />
    <trace from=".RAVH > .pin1" to="net.V3P3" />
    <trace from=".RAVH > .pin2" to="net.AVREF_MID" />
    <trace from=".RAVL > .pin1" to="net.AVREF_MID" />
    <trace from=".RAVL > .pin2" to="net.AGND" />
    <trace from=".CAVM > .pin1" to="net.AVREF_MID" />
    <trace from=".CAVM > .pin2" to="net.AGND" />
    <trace from=".UAVB > .INP" to="net.AVREF_MID" />
    <trace from=".UAVB > .INN" to="net.AVMID" />
    <trace from=".UAVB > .OUT" to="net.AVMID" />
    <trace from=".UAVB > .VP" to="net.V3P3" />
    <trace from=".UAVB > .VN" to="net.AGND" />
    <trace from=".CAVO > .pin1" to="net.AVMID" />
    <trace from=".CAVO > .pin2" to="net.AGND" />
  </group>
);

// ---------- line/lane CT sensor (E18) — v3/CB-15: burden + return biased to AVMID, dual clamps
export const CtSensor = ({ id, out, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`cts${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name={`CT${id}`} footprint={<CtFP />} pinLabels={{ pin1: "S1", pin2: "S2" }} pcbX={0} pcbY={0} schX={0} schY={0} />
    <resistor name={`R${id}B`} resistance="33" footprint="1206" pcbX={12} pcbY={0} schX={0.9} schY={0} />
    <resistor name={`R${id}F`} resistance="1k" footprint="0603" pcbX={20} pcbY={0} schX={1.7} schY={0} />
    <capacitor name={`C${id}F`} capacitance="1nF" footprint="0603" pcbX={26} pcbY={4} schX={2.3} schY={0.5} />
    <diode name={`D${id}P`} footprint="sod323" pcbX={12} pcbY={6} schX={0.9} schY={0.7} />
    <diode name={`D${id}N`} footprint="sod323" pcbX={18} pcbY={6} schX={1.4} schY={0.7} />
    <trace from={`.CT${id} > .S1`} to={`.R${id}B > .pin1`} />
    <trace from={`.CT${id} > .S2`} to="net.AVMID" />
    <trace from={`.R${id}B > .pin2`} to="net.AVMID" />
    <trace from={`.R${id}F > .pin1`} to={`.R${id}B > .pin1`} />
    <trace from={`.R${id}F > .pin2`} to={out} />
    <trace from={`.C${id}F > .pin1`} to={out} />
    <trace from={`.C${id}F > .pin2`} to="net.AVMID" />
    <trace from={`.D${id}P > .anode`} to={out} />
    <trace from={`.D${id}P > .cathode`} to="net.V3P3" />
    <trace from={`.D${id}N > .anode`} to="net.AGND" />
    <trace from={`.D${id}N > .cathode`} to={out} />
  </group>
);

// ---------- NTC input (remote sensor header + bias + filter; unipolar — no mid-rail needed)
export const NtcInput = ({ id, out, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`ntc${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name={`J${id}`} footprint="pinrow2" pinLabels={{ pin1: "P1", pin2: "P2" }} pcbX={0} pcbY={0} schX={0} schY={0} />
    <resistor name={`R${id}P`} resistance="10k" footprint="0603" pcbX={8} pcbY={0} schX={0.8} schY={0} />
    <capacitor name={`C${id}F`} capacitance="100nF" footprint="0603" pcbX={14} pcbY={0} schX={1.4} schY={0.4} />
    <trace from={`.J${id} > .P1`} to={out} />
    <trace from={`.J${id} > .P2`} to="net.AGND" />
    <trace from={`.R${id}P > .pin1`} to="net.V3P3" />
    <trace from={`.R${id}P > .pin2`} to={out} />
    <trace from={`.C${id}F > .pin1`} to={out} />
    <trace from={`.C${id}F > .pin2`} to="net.AGND" />
  </group>
);

// ---------- hardware safety chain (CB-10/E27), one per board:
// GATE_EN_x = AND(own-MCU EN, other-MCU EN via harness w/ 100 k pulldown, watchdog WDO w/ 10 k pullup)
// → 10 k pulldown on the output: gates default-DISABLED for any missing/floating/reset condition.
// USUP = external windowed watchdog (protection rows 24/30); spare AND gates' inputs tied low.
export const SafetyChain = ({ id, enLocal, enRemote, wdi, gateEn, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`sfc${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name={`USUP${id}`} footprint="sot23" pinLabels={{ pin1: "WDI", pin2: "GND", pin3: "WDO" }} pcbX={0} pcbY={0} schX={0} schY={0} />
    <chip name={`UAND${id}`} footprint="soic14" pinLabels={{ pin1: "A1", pin2: "B1", pin3: "A2", pin4: "B2", pin5: "C2", pin6: "Y2", pin7: "GND", pin8: "Y3", pin9: "A3", pin10: "B3", pin11: "C3", pin12: "Y1", pin13: "C1", pin14: "VCC" }} pcbX={14} pcbY={0} schX={1.4} schY={0} />
    <resistor name={`RWPU${id}`} resistance="10k" footprint="0603" pcbX={0} pcbY={8} schX={0} schY={0.8} />
    <resistor name={`RENR${id}`} resistance="100k" footprint="0603" pcbX={7} pcbY={8} schX={0.7} schY={0.8} />
    <resistor name={`RGPD${id}`} resistance="10k" footprint="0603" pcbX={28} pcbY={8} schX={2.6} schY={0.8} />
    <capacitor name={`CSF${id}`} capacitance="100nF" footprint="0603" pcbX={20} pcbY={8} schX={2} schY={0.8} />
    <trace from={`.USUP${id} > .WDI`} to={wdi} />
    <trace from={`.USUP${id} > .GND`} to="net.DGND" />
    <trace from={`.USUP${id} > .WDO`} to={`net.WDO_${id}`} />
    <trace from={`.RWPU${id} > .pin1`} to="net.V3P3" />
    <trace from={`.RWPU${id} > .pin2`} to={`net.WDO_${id}`} />
    <trace from={`.RENR${id} > .pin1`} to={enRemote} />
    <trace from={`.RENR${id} > .pin2`} to="net.DGND" />
    <trace from={`.UAND${id} > .A1`} to={enLocal} />
    <trace from={`.UAND${id} > .B1`} to={enRemote} />
    <trace from={`.UAND${id} > .C1`} to={`net.WDO_${id}`} />
    <trace from={`.UAND${id} > .Y1`} to={gateEn} />
    <trace from={`.RGPD${id} > .pin1`} to={gateEn} />
    <trace from={`.RGPD${id} > .pin2`} to="net.DGND" />
    {["A2", "B2", "C2", "A3", "B3", "C3"].map(p => (
      <trace key={p} from={`.UAND${id} > .${p}`} to="net.DGND" />
    ))}
    <trace from={`.UAND${id} > .VCC`} to="net.V3P3" />
    <trace from={`.UAND${id} > .GND`} to="net.DGND" />
    <trace from={`.CSF${id} > .pin1`} to="net.V3P3" />
    <trace from={`.CSF${id} > .pin2`} to="net.DGND" />
  </group>
);

// ---------- SWD/boot provisioning per MCU (CB-13/HR-11): 5-pin header + BOOT0 strap + NRST cap
export const SwdPort = ({ id, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`swd${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name={`JSWD${id}`} footprint="pinrow5" pinLabels={{ pin1: "VCC", pin2: "DIO", pin3: "CLK", pin4: "RST", pin5: "GND" }} pcbX={0} pcbY={0} schX={0} schY={0} />
    <resistor name={`R${id}BOOT`} resistance="10k" footprint="0603" pcbX={14} pcbY={0} schX={1.2} schY={0} />
    <capacitor name={`C${id}RST`} capacitance="100nF" footprint="0603" pcbX={14} pcbY={6} schX={1.2} schY={0.6} />
    <trace from={`.JSWD${id} > .VCC`} to="net.V3P3" />
    <trace from={`.JSWD${id} > .DIO`} to={`net.SWDIO_${id}`} />
    <trace from={`.JSWD${id} > .CLK`} to={`net.SWCLK_${id}`} />
    <trace from={`.JSWD${id} > .RST`} to={`net.NRST_${id}`} />
    <trace from={`.JSWD${id} > .GND`} to="net.DGND" />
    <trace from={`.R${id}BOOT > .pin1`} to={`net.BOOT0_${id}`} />
    <trace from={`.R${id}BOOT > .pin2`} to="net.DGND" />
    <trace from={`.C${id}RST > .pin1`} to={`net.NRST_${id}`} />
    <trace from={`.C${id}RST > .pin2`} to="net.DGND" />
  </group>
);

// ---------- discharge control (CB-11 rework): default-OFF, isolated. MCU sources the opto LED
// (active-high, 330 Ω from GPIO); output stage biased by a DCN-referenced isolated module; 10 k
// gate pulldown to DCN ⇒ MCU reset/dead/unprogrammed = discharge OFF. Passive bleed = balancers
// (τ documented, E19 rev B); commanded discharge covers normal shutdown + FSM SAFE entry.
export const DischargeCtl = ({ ctl, gateOut, dcn, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name="dsch" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name="UQD" footprint="soic8" pinLabels={{ pin1: "ANO", pin2: "CAT", pin3: "NC1", pin4: "NC2", pin5: "VEE", pin6: "OUT", pin7: "NC3", pin8: "VCC" }} pcbX={0} pcbY={0} schX={0} schY={0} />
    <chip name="PSQD" footprint="pinrow5" pinLabels={{ pin1: "VIN", pin2: "GND", pin3: "P18", pin4: "COM", pin5: "N4" }} pcbX={0} pcbY={10} schX={0} schY={1} />
    <resistor name="RQDL" resistance="330" footprint="0603" pcbX={-10} pcbY={0} schX={-1} schY={0} />
    <resistor name="RQDG" resistance="100" footprint="0805" pcbX={12} pcbY={0} schX={1.2} schY={0} />
    <resistor name="RQDPD" resistance="10k" footprint="0805" pcbX={12} pcbY={6} schX={1.2} schY={0.6} />
    <trace from={ctl} to=".RQDL > .pin1" />
    <trace from=".RQDL > .pin2" to=".UQD > .ANO" />
    <trace from=".UQD > .CAT" to="net.DGND" />
    <trace from=".PSQD > .VIN" to="net.V15" />
    <trace from=".PSQD > .GND" to="net.DGND" />
    <trace from=".PSQD > .P18" to=".UQD > .VCC" />
    <trace from={`.PSQD > .COM`} to={dcn} />
    <trace from=".UQD > .VEE" to={dcn} />
    <trace from=".UQD > .OUT" to=".RQDG > .pin1" />
    <trace from=".RQDG > .pin2" to={gateOut} />
    <trace from=".RQDPD > .pin1" to={gateOut} />
    <trace from=".RQDPD > .pin2" to={dcn} />
  </group>
);

// ---------- HMI (user req 2026-09-04): 2 buttons + 2-digit 7-seg; 74HC595 segments,
// 2 NPN digit drivers, multiplexed by MCU-LLC (3 SPI-style + 2 digit + 2 button GPIO).
export const ConfigHmi = ({ x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name="hmi" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name="DISP1" footprint={<Seg2FP />} pinLabels={{ pin1: "SA", pin2: "SB", pin3: "SC", pin4: "SD", pin5: "SE", pin6: "SF", pin7: "SG", pin8: "DP", pin9: "DIG1", pin10: "DIG2" }} pcbX={0} pcbY={0} schX={0} schY={0} />
    <chip name="USR1" footprint="soic16" pinLabels={{ pin1: "QB", pin2: "QC", pin3: "QD", pin4: "QE", pin5: "QF", pin6: "QG", pin7: "QH", pin8: "GND", pin9: "QHS", pin10: "SRCLR", pin11: "SRCLK", pin12: "RCLK", pin13: "OE", pin14: "SER", pin15: "QA", pin16: "VCC" }} pcbX={0} pcbY={22} schX={0} schY={2} />
    {Array.from({ length: 8 }, (_, i) => (
      <resistor key={i} name={`RSEG${i}`} resistance="220" footprint="0603" pcbX={32 + i * 5} pcbY={0} schX={2 + i * 0.4} schY={0.9} />
    ))}
    {["1", "2"].map((d, i) => (
      <chip key={d} name={`QDIG${d}`} footprint="sot23" pinLabels={{ pin1: "B", pin2: "E", pin3: "C" }} pcbX={32 + i * 8} pcbY={10} schX={2 + i} schY={1.5} />
    ))}
    {["1", "2"].map((d, i) => (
      <resistor key={d} name={`RDIG${d}`} resistance="2.2k" footprint="0603" pcbX={32 + i * 8} pcbY={16} schX={2 + i} schY={2} />
    ))}
    {["1", "2"].map((d, i) => (
      <chip key={d} name={`SW${d}`} footprint="pushbutton" pinLabels={{ pin1: "P1", pin2: "P2", pin3: "P3", pin4: "P4" }} pcbX={80 + i * 15} pcbY={0} schX={6 + i * 1.2} schY={0} />
    ))}
    {["1", "2"].map((d, i) => (
      <resistor key={d} name={`RSW${d}`} resistance="10k" footprint="0603" pcbX={80 + i * 15} pcbY={8} schX={6 + i * 1.2} schY={0.9} />
    ))}
    <trace from=".USR1 > .VCC" to="net.V3P3" />
    <trace from=".USR1 > .GND" to="net.DGND" />
    <trace from=".USR1 > .OE" to="net.DGND" />
    <trace from=".USR1 > .SRCLR" to="net.V3P3" />
    <trace from=".USR1 > .SER" to="net.HMI_DAT" />
    <trace from=".USR1 > .SRCLK" to="net.HMI_CLK" />
    <trace from=".USR1 > .RCLK" to="net.HMI_LAT" />
    {["QA", "QB", "QC", "QD", "QE", "QF", "QG", "QH"].map((q, i) => (
      <trace key={q} from={`.USR1 > .${q}`} to={`.RSEG${i} > .pin1`} />
    ))}
    {["SA", "SB", "SC", "SD", "SE", "SF", "SG", "DP"].map((sPin, i) => (
      <trace key={sPin} from={`.RSEG${i} > .pin2`} to={`.DISP1 > .${sPin}`} />
    ))}
    <trace from=".QDIG1 > .C" to=".DISP1 > .DIG1" />
    <trace from=".QDIG2 > .C" to=".DISP1 > .DIG2" />
    <trace from=".QDIG1 > .E" to="net.DGND" />
    <trace from=".QDIG2 > .E" to="net.DGND" />
    <trace from=".RDIG1 > .pin1" to="net.HMI_DIG1" />
    <trace from=".RDIG1 > .pin2" to=".QDIG1 > .B" />
    <trace from=".RDIG2 > .pin1" to="net.HMI_DIG2" />
    <trace from=".RDIG2 > .pin2" to=".QDIG2 > .B" />
    <trace from=".SW1 > .P1" to="net.BTN1" />
    <trace from=".SW1 > .P3" to="net.DGND" />
    <trace from=".RSW1 > .pin1" to="net.V3P3" />
    <trace from=".RSW1 > .pin2" to="net.BTN1" />
    <trace from=".SW2 > .P1" to="net.BTN2" />
    <trace from=".SW2 > .P3" to="net.DGND" />
    <trace from=".RSW2 > .pin1" to="net.V3P3" />
    <trace from=".RSW2 > .pin2" to="net.BTN2" />
  </group>
);

// ---------- MCU + decoupling + reset — v3: VDDA/VREF+ fed via ferrite + local caps (MR-7);
// BOOT0/SWD nets bound at board level (CB-13). Pin numbers symbolic pending A6 datasheet closure.
export const ControlMcu = ({ id, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`mcu${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name={`U${id}`} footprint={<Lqfp100 />} pcbX={0} pcbY={0} schX={0} schY={0} />
    {[0, 1, 2, 3].map(i => (
      <capacitor key={i} name={`C${id}D${i}`} capacitance="100nF" footprint="0402" pcbX={-9 + i * 6} pcbY={11} schX={-1 + i * 0.5} schY={1.6} />
    ))}
    <resistor name={`R${id}RST`} resistance="10k" footprint="0402" pcbX={15} pcbY={11} schX={1.4} schY={1.6} />
    <resistor name={`FB${id}A`} resistance="0" footprint="0805" pcbX={-15} pcbY={11} schX={-1.6} schY={1.6} />
    <capacitor name={`C${id}A1`} capacitance="1uF" footprint="0603" pcbX={-15} pcbY={16} schX={-1.6} schY={2.1} />
    <capacitor name={`C${id}A2`} capacitance="100nF" footprint="0402" pcbX={-10} pcbY={16} schX={-1.1} schY={2.1} />
    {[0, 1, 2, 3].map(i => [
      <trace key={`p${i}`} from={`.C${id}D${i} > .pin1`} to="net.V3P3" />,
      <trace key={`g${i}`} from={`.C${id}D${i} > .pin2`} to="net.DGND" />,
    ])}
    <trace from={`.U${id} > .pin11`} to="net.V3P3" />
    <trace from={`.U${id} > .pin10`} to="net.DGND" />
    <trace from={`.U${id} > .pin27`} to="net.V3P3" />
    <trace from={`.U${id} > .pin26`} to="net.DGND" />
    <trace from={`.FB${id}A > .pin1`} to="net.V3P3" />
    <trace from={`.FB${id}A > .pin2`} to={`net.VDDA_${id}`} />
    <trace from={`.U${id} > .pin19`} to={`net.VDDA_${id}`} />
    <trace from={`.U${id} > .pin20`} to={`net.VDDA_${id}`} />
    <trace from={`.C${id}A1 > .pin1`} to={`net.VDDA_${id}`} />
    <trace from={`.C${id}A1 > .pin2`} to="net.DGND" />
    <trace from={`.C${id}A2 > .pin1`} to={`net.VDDA_${id}`} />
    <trace from={`.C${id}A2 > .pin2`} to="net.DGND" />
    <trace from={`.R${id}RST > .pin1`} to="net.V3P3" />
    <trace from={`.R${id}RST > .pin2`} to={`net.NRST_${id}`} />
    <trace from={`.U${id} > .pin14`} to={`net.NRST_${id}`} />
  </group>
);

// ---------- board-to-board signal harness (16-way) — power goes via DCP/DCN/PE studs.
// v3: link/enable nets are parameters so the DC-DC side CROSSES TX↔RX (CB-14) and each board
// exports its own MCU enable while receiving the other's (E27). Shield bonded to PE.
export const InterconnectSignals = ({ id, ltx, lrx, enA, enB, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`ic${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name={`JIC${id}`} footprint="pinrow16" pinLabels={{ pin1: "V24A", pin2: "V24B", pin3: "GNDA", pin4: "GNDB", pin5: "V15A", pin6: "V15B", pin7: "LTX", pin8: "LRX", pin9: "EN", pin10: "KILL", pin11: "FPWM", pin12: "FTACH", pin13: "TINL", pin14: "SP1", pin15: "SP2", pin16: "SHLD" }} pcbX={0} pcbY={0} schX={0} schY={0} />
    <resistor name={`R${id}LTX`} resistance="10k" footprint="0603" pcbX={20} pcbY={0} schX={1.8} schY={0} />
    <resistor name={`R${id}LRX`} resistance="10k" footprint="0603" pcbX={20} pcbY={5} schX={1.8} schY={0.5} />
    <trace from={`.JIC${id} > .V24A`} to="net.V24" />
    <trace from={`.JIC${id} > .V24B`} to="net.V24" />
    <trace from={`.JIC${id} > .GNDA`} to="net.DGND" />
    <trace from={`.JIC${id} > .GNDB`} to="net.DGND" />
    <trace from={`.JIC${id} > .V15A`} to="net.V15" />
    <trace from={`.JIC${id} > .V15B`} to="net.V15" />
    <trace from={`.JIC${id} > .LTX`} to={ltx} />
    <trace from={`.JIC${id} > .LRX`} to={lrx} />
    <trace from={`.R${id}LTX > .pin1`} to="net.V3P3" />
    <trace from={`.R${id}LTX > .pin2`} to={ltx} />
    <trace from={`.R${id}LRX > .pin1`} to="net.V3P3" />
    <trace from={`.R${id}LRX > .pin2`} to={lrx} />
    <trace from={`.JIC${id} > .EN`} to={enA} />
    <trace from={`.JIC${id} > .KILL`} to={enB} />
    <trace from={`.JIC${id} > .SHLD`} to="net.PE" />
  </group>
);

// ---------- aux flyback — v3 (E26/D4 rev B): closes CB-5/6/7.
//  · fed from the FULL unboosted bus (DCP→DCN): 342 V (285 VAC cold start) … 860 V (OVP corner)
//  · 1700 V SiC switch, 60 W deliverable (Lp 550 µH, Ip clamp 1.8 A via 0.55 Ω CS, 65 kHz DCM)
//  · complete controller application: 2×470 k HV startup into VCC, aux-winding self-supply,
//    FB divider from the aux rail (primary-side regulation), type-II COMP, brown-in divider on BR
//    (starts ≥ ~330 V), RC-filtered CS (V-21 chatter fix), RCD clamp on the primary.
//  · relay-coil PWM hold economization is firmware (halves 24 V steady demand — E26).
export const AuxPower = ({ dcp, dcn, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name="aux" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name="UAUX" footprint="soic8" pinLabels={{ pin1: "VIN", pin2: "GND", pin3: "FB", pin4: "COMP", pin5: "CS", pin6: "GATE", pin7: "VCC", pin8: "BR" }} pcbX={0} pcbY={0} schX={0} schY={0} />
    <chip name="QAUX" footprint="to220" pinLabels={{ pin1: "G", pin2: "D", pin3: "S" }} pcbX={22} pcbY={0} schX={1.4} schY={0} />
    <resistor name="RAUXCS" resistance="0.55" footprint="1206" pcbX={22} pcbY={8} schX={1.4} schY={0.9} />
    <resistor name="RCSF" resistance="1k" footprint="0603" pcbX={16} pcbY={8} schX={0.9} schY={0.9} />
    <capacitor name="CCSF" capacitance="470pF" footprint="0603" pcbX={16} pcbY={12} schX={0.9} schY={1.3} />
    <chip name="TAUX" footprint={<XfmrAuxFP />} pinLabels={{ pin1: "P1", pin2: "P2", pin3: "S24A", pin4: "S24B", pin5: "S15A", pin6: "S15B", pin7: "AXA", pin8: "AXB" }} pcbX={48} pcbY={0} schX={2.6} schY={0} />
    <diode name="DAUX24" footprint="smb" pcbX={72} pcbY={0} schX={4.2} schY={-0.5} />
    <diode name="DAUX15" footprint="smb" pcbX={72} pcbY={8} schX={4.2} schY={0.5} />
    <diode name="DAUXVC" footprint="smb" pcbX={72} pcbY={16} schX={4.2} schY={1.5} />
    <capacitor name="CAUX24" capacitance="220uF" footprint={FilmBoxFP(5)} pcbX={84} pcbY={0} schX={5} schY={-0.5} />
    <capacitor name="CAUX15" capacitance="220uF" footprint={FilmBoxFP(5)} pcbX={84} pcbY={8} schX={5} schY={0.5} />
    <capacitor name="CVCC" capacitance="47uF" footprint={FilmBoxFP(5)} pcbX={84} pcbY={16} schX={5} schY={1.5} />
    <chip name="U3V3" footprint="sot223" pinLabels={{ pin1: "IN", pin2: "GND", pin3: "OUT", pin4: "TAB" }} pcbX={98} pcbY={0} schX={5.8} schY={0} />
    <capacitor name="C3V3" capacitance="10uF" footprint="0805" pcbX={108} pcbY={0} schX={6.6} schY={0.4} />
    <resistor name="RAUXST1" resistance="470k" footprint="2512" pcbX={0} pcbY={10} schX={0} schY={0.9} />
    <resistor name="RAUXST2" resistance="470k" footprint="2512" pcbX={6} pcbY={10} schX={0.5} schY={0.9} />
    <resistor name="RBR1A" resistance="2.4M" footprint="2512" pcbX={0} pcbY={16} schX={0} schY={1.4} />
    <resistor name="RBR1B" resistance="2.4M" footprint="2512" pcbX={6} pcbY={16} schX={0.5} schY={1.4} />
    <resistor name="RBR2" resistance="27k" footprint="0603" pcbX={12} pcbY={16} schX={1} schY={1.4} />
    <resistor name="RFB1" resistance="100k" footprint="0603" pcbX={-10} pcbY={0} schX={-1} schY={0} />
    <resistor name="RFB2" resistance="10k" footprint="0603" pcbX={-10} pcbY={5} schX={-1} schY={0.5} />
    <resistor name="RCOMP" resistance="10k" footprint="0603" pcbX={-10} pcbY={10} schX={-1} schY={1} />
    <capacitor name="CCOMP" capacitance="100nF" footprint="0603" pcbX={-10} pcbY={15} schX={-1} schY={1.5} />
    <diode name="DCLA" footprint="smb" pcbX={34} pcbY={-8} schX={2} schY={-0.9} />
    <capacitor name="CCLA" capacitance="10nF" footprint={FilmBoxFP(15)} pcbX={44} pcbY={-8} schX={2.7} schY={-0.9} />
    <resistor name="RCLA1" resistance="47k" footprint="2512" pcbX={54} pcbY={-8} schX={3.4} schY={-0.9} />
    <resistor name="RCLA2" resistance="47k" footprint="2512" pcbX={60} pcbY={-8} schX={3.9} schY={-0.9} />
    {/* HV startup: DCP → 2× 470 k → VCC reservoir; aux winding takes over via DAUXVC */}
    <trace from=".RAUXST1 > .pin1" to={dcp} />
    <trace from=".RAUXST1 > .pin2" to=".RAUXST2 > .pin1" />
    <trace from=".RAUXST2 > .pin2" to=".UAUX > .VCC" />
    <trace from=".CVCC > .pin1" to=".UAUX > .VCC" />
    <trace from=".CVCC > .pin2" to={dcn} />
    <trace from=".TAUX > .AXA" to=".DAUXVC > .anode" />
    <trace from=".DAUXVC > .cathode" to=".UAUX > .VCC" />
    <trace from=".TAUX > .AXB" to={dcn} />
    {/* controller ground/reference + VIN sense pin parked on VCC rail (IC-internal HV sense unused) */}
    <trace from=".UAUX > .GND" to={dcn} />
    <trace from=".UAUX > .VIN" to=".UAUX > .VCC" />
    {/* brown-in program: full-bus divider → BR (start ≈ 330 V, hysteresis per IC) */}
    <trace from=".RBR1A > .pin1" to={dcp} />
    <trace from=".RBR1A > .pin2" to=".RBR1B > .pin1" />
    <trace from=".RBR1B > .pin2" to=".UAUX > .BR" />
    <trace from=".RBR2 > .pin1" to=".UAUX > .BR" />
    <trace from=".RBR2 > .pin2" to={dcn} />
    {/* primary-side regulation: FB divider from the VCC/aux rail (tracks secondaries); type-II COMP */}
    <trace from=".RFB1 > .pin1" to=".UAUX > .VCC" />
    <trace from=".RFB1 > .pin2" to=".UAUX > .FB" />
    <trace from=".RFB2 > .pin1" to=".UAUX > .FB" />
    <trace from=".RFB2 > .pin2" to={dcn} />
    <trace from=".RCOMP > .pin1" to=".UAUX > .COMP" />
    <trace from=".RCOMP > .pin2" to=".UAUX > .FB" />
    <trace from=".CCOMP > .pin1" to=".UAUX > .COMP" />
    <trace from=".CCOMP > .pin2" to={dcn} />
    {/* power stage: primary + RCD clamp + gated switch + filtered CS */}
    <trace from=".TAUX > .P1" to={dcp} />
    <trace from=".QAUX > .D" to=".TAUX > .P2" />
    <trace from=".DCLA > .anode" to=".TAUX > .P2" />
    <trace from=".DCLA > .cathode" to=".CCLA > .pin1" />
    <trace from=".CCLA > .pin2" to={dcp} />
    <trace from=".RCLA1 > .pin1" to=".CCLA > .pin1" />
    <trace from=".RCLA1 > .pin2" to=".RCLA2 > .pin1" />
    <trace from=".RCLA2 > .pin2" to={dcp} />
    <trace from=".UAUX > .GATE" to=".QAUX > .G" />
    <trace from=".QAUX > .S" to=".RAUXCS > .pin1" />
    <trace from=".RAUXCS > .pin2" to={dcn} />
    <trace from=".RCSF > .pin1" to=".RAUXCS > .pin1" />
    <trace from=".RCSF > .pin2" to=".UAUX > .CS" />
    <trace from=".CCSF > .pin1" to=".UAUX > .CS" />
    <trace from=".CCSF > .pin2" to={dcn} />
    {/* secondaries */}
    <trace from=".TAUX > .S24A" to=".DAUX24 > .anode" />
    <trace from=".DAUX24 > .cathode" to="net.V24" />
    <trace from=".TAUX > .S24B" to="net.DGND" />
    <trace from=".TAUX > .S15A" to=".DAUX15 > .anode" />
    <trace from=".DAUX15 > .cathode" to="net.V15" />
    <trace from=".TAUX > .S15B" to="net.DGND" />
    <trace from=".CAUX24 > .pin1" to="net.V24" />
    <trace from=".CAUX24 > .pin2" to="net.DGND" />
    <trace from=".CAUX15 > .pin1" to="net.V15" />
    <trace from=".CAUX15 > .pin2" to="net.DGND" />
    <trace from=".U3V3 > .IN" to="net.V15" />
    <trace from=".U3V3 > .GND" to="net.DGND" />
    <trace from=".U3V3 > .OUT" to="net.V3P3" />
    <trace from=".C3V3 > .pin1" to="net.V3P3" />
    <trace from=".C3V3 > .pin2" to="net.DGND" />
  </group>
);

// ---------- fan header + tach pullup (fan p/n must accept 3.3 V PWM — MR-9, BOM note)
export const FanPort = ({ id, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`fan${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name={`JFAN${id}`} footprint="pinrow4" pinLabels={{ pin1: "GND", pin2: "V24", pin3: "TACH", pin4: "PWM" }} pcbX={0} pcbY={0} schX={0} schY={0} />
    <resistor name={`RFT${id}`} resistance="10k" footprint="0603" pcbX={12} pcbY={0} schX={1} schY={0} />
    <trace from={`.JFAN${id} > .GND`} to="net.DGND" />
    <trace from={`.JFAN${id} > .V24`} to="net.V24" />
    <trace from={`.JFAN${id} > .TACH`} to={`net.FAN_TACH${id}`} />
    <trace from={`.JFAN${id} > .PWM`} to={`net.FAN_PWM${id}`} />
    <trace from={`.RFT${id} > .pin1`} to="net.V3P3" />
    <trace from={`.RFT${id} > .pin2`} to={`net.FAN_TACH${id}`} />
  </group>
);

// ---------- isolated CAN 2.0B + CM choke + switchable termination + TVS
export const IsolatedCan = ({ x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name="canif" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name="UCAN" footprint="soic8" pinLabels={{ pin1: "TXD", pin2: "GND1", pin3: "RXD", pin4: "VDD1", pin5: "VDD2", pin6: "CANL", pin7: "CANH", pin8: "GND2" }} pcbX={0} pcbY={0} schX={0} schY={0} />
    <chip name="PSCAN" footprint="pinrow5" pinLabels={{ pin1: "VIN", pin2: "GND", pin3: "P5", pin4: "COM", pin5: "NC" }} pcbX={0} pcbY={10} schX={0} schY={1} />
    <chip name="LCAN" footprint="soic8" pinLabels={{ pin1: "A1", pin2: "A2", pin3: "N1", pin4: "N2", pin5: "N3", pin6: "N4", pin7: "B2", pin8: "B1" }} pcbX={22} pcbY={0} schX={1.6} schY={0} />
    <chip name="JCAN" footprint="pinrow4" pinLabels={{ pin1: "CANH", pin2: "CANL", pin3: "SGND", pin4: "SHLD" }} pcbX={44} pcbY={0} schX={3.2} schY={0} />
    <resistor name="RTERM" resistance="120" footprint="1206" pcbX={32} pcbY={8} schX={2.3} schY={0.8} />
    <chip name="JTERM" footprint="pinrow2" pinLabels={{ pin1: "P1", pin2: "P2" }} pcbX={32} pcbY={14} schX={2.3} schY={1.3} />
    <chip name="TVSCAN" footprint="sot23" pinLabels={{ pin1: "A", pin2: "B", pin3: "C" }} pcbX={44} pcbY={8} schX={3.2} schY={0.8} />
    <trace from=".UCAN > .TXD" to="net.CAN_TX" />
    <trace from=".UCAN > .RXD" to="net.CAN_RX" />
    <trace from=".UCAN > .VDD1" to="net.V3P3" />
    <trace from=".UCAN > .GND1" to="net.DGND" />
    <trace from=".PSCAN > .VIN" to="net.V15" />
    <trace from=".PSCAN > .GND" to="net.DGND" />
    <trace from=".PSCAN > .P5" to=".UCAN > .VDD2" />
    <trace from=".PSCAN > .COM" to="net.CGND" />
    <trace from=".UCAN > .GND2" to="net.CGND" />
    <trace from=".UCAN > .CANH" to=".LCAN > .A1" />
    <trace from=".UCAN > .CANL" to=".LCAN > .A2" />
    <trace from=".LCAN > .B1" to=".JCAN > .CANH" />
    <trace from=".LCAN > .B2" to=".JCAN > .CANL" />
    <trace from=".JCAN > .SGND" to="net.CGND" />
    <trace from=".RTERM > .pin1" to=".JTERM > .P1" />
    <trace from=".JTERM > .P2" to=".LCAN > .B1" />
    <trace from=".RTERM > .pin2" to=".LCAN > .B2" />
    <trace from=".TVSCAN > .A" to=".LCAN > .B1" />
    <trace from=".TVSCAN > .B" to=".LCAN > .B2" />
    <trace from=".TVSCAN > .C" to="net.CGND" />
  </group>
);

// ---------- output shunt (manganin, Kelvin) + iso amp with floating-side bias.
// v3: OUTN routed too (MR-6 — firmware takes the true differential; PSSH 5 V rail also feeds
// the OV IsoVSense on the output domain).
export const OutputShunt = ({ inn, out, outN, x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name="oshunt" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name="RSHO" footprint={<ShuntFP />} pinLabels={{ pin1: "A", pin2: "B", pin3: "KA", pin4: "KB" }} pcbX={0} pcbY={0} schX={0} schY={0} />
    <chip name="USHO" footprint="soic8" pinLabels={ISOAMP_PINS} pcbX={20} pcbY={0} schX={1.6} schY={0} />
    <chip name="PSSH" footprint="pinrow5" pinLabels={{ pin1: "VIN", pin2: "GND", pin3: "P5", pin4: "COM", pin5: "NC" }} pcbX={20} pcbY={10} schX={1.6} schY={1} />
    <trace from={inn} to=".RSHO > .A" />
    <trace from=".RSHO > .B" to="net.OUTN" />
    <trace from=".USHO > .VINP" to=".RSHO > .KA" />
    <trace from=".USHO > .VINN" to=".RSHO > .KB" />
    <trace from=".PSSH > .VIN" to="net.V15" />
    <trace from=".PSSH > .GND" to="net.DGND" />
    <trace from=".PSSH > .P5" to="net.B5OUT" />
    <trace from=".USHO > .VDD1" to="net.B5OUT" />
    <trace from=".PSSH > .COM" to=".USHO > .GND1" />
    <trace from=".USHO > .GND1" to=".RSHO > .KB" />
    <trace from=".USHO > .VDD2" to="net.V3P3" />
    <trace from=".USHO > .GND2" to="net.AGND" />
    <trace from=".USHO > .OUTP" to={out} />
    <trace from={outN ? ".USHO > .OUTN" : ".USHO > .OUTN"} to={outN || "net.SNS_IOUTN"} />
  </group>
);
