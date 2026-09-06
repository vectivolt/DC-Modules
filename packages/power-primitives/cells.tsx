// cells.tsx v4 — schematic-complete parameterized cells for the two-board (AC-DC / DC-DC) split.
// v4 (2026-09-05, R2 review closure — docs/design-review-production-r2.md, register E32/E26-revC):
//   CB-16 resonant CT burden 33→2.0 Ω 2512 (46 A rms/1:100 scaling) · CB-22 Cr 44→46 nF (rev D2 tank)
//   CB-18 Rail3V3 sync-buck cell replaces the 15 V-fed LDO (fitted per board — CB-17)
//   CB-19/20 aux rev C: 110 W all SKUs (Lp 490 µH, Ip 3.0 A @ 0.33 Ω, 50 kHz, D4 rev C), 400 V
//   rectifiers, rail TVS (MR-17), QAUX gate pulldown, NCP1252 BR divider re-sized (MR-13)
//   HR-13 watchdog symbol → 6-pin (VDD + window straps) · HR-15 DischargeCtl gets id param (bank bleeders)
//   HR-20 balance/star resistors → 2-series HV · MR-11 AnalogMid dual-feedback + isolation R
//   MR-18 IsoVSense filter parameterized (1 nF on OVP channels) · MR-22 button caps · CGND soft bond
//   MR-14 link series 100 Ω + harness spares→GND · E27 local-EN pulldown hygiene
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

// ---------------------------------------------------------------------------------------------
// COURTYARDS. Every custom footprint below was pads-only, so tscircuit had no body to collide:
// 93 components on 30kw-acdc raised pcb_component_missing_courtyard_warning, and a TO-247 SiC
// MOSFET reported a 10.0 x 2.4 mm extent against a real 15.9 x 5.0 mm package. Overlap checking
// against pad extents is checking the wrong thing, so placement could not be trusted at all.
//
// These are the SAME envelopes already used by calculations/floorplan-budget.mjs and encoded in
// the generated land-pattern names (CAP-TH_L26.5-W11.0-P22.50 states body 26.5 x 11.0 on a 22.5
// pitch), so nothing here is a new number. The toroid rule is the one in docs/footprints-to-draw.md:
// finished OD = core OD + 2x4 mm winding, courtyard = OD + 2 mm.
//
// Pad geometry is deliberately NOT changed here. Where a body is much larger than its pad span
// (MOV disc on a 10 mm pitch, fuse holder on 30 mm) the courtyard now states the truth and the
// DRC will say so -- that is a footprint-pitch question for §40 vendor verification, and silently
// moving pads to hide it would be worse than showing it.
const CY = { top: "top" } as const;
// film/box body by lead pitch, straight from the generated .kicad_mod names
const FILM_BODY: Record<number, [number, number]> = {
  3.5: [8.0, 8.0], 5: [7.2, 3.5], 10: [11.0, 5.0], 15: [18.0, 5.0],
  22.5: [26.5, 11.0], 27.5: [31.5, 13.0], 30: [31.5, 13.0], 37.5: [41.5, 20.0],
};

export const TO247_4 = () => (
  <footprint>
    {["pin1", "pin2", "pin3", "pin4"].map((h, i) => (
      <platedhole key={h} portHints={[h]} pcbX={-3.81 + i * 2.54} pcbY={0} holeDiameter="1.8mm" outerDiameter="2.4mm" shape="circle" />
    ))}
  
    <courtyardrect pcbX={0} pcbY={0} width="16.4mm" height="5.5mm" />
    </footprint>
);
// diode package: port hints bind directly to diode anode/cathode (pin1=anode/pin2=cathode — VERIFY vs vendor)
export const TO247_2 = () => (
  <footprint>
    <platedhole portHints={["anode", "pin1"]} pcbX={-2.72} pcbY={0} holeDiameter="1.8mm" outerDiameter="2.4mm" shape="circle" />
    <platedhole portHints={["cathode", "pin2"]} pcbX={2.72} pcbY={0} holeDiameter="1.8mm" outerDiameter="2.4mm" shape="circle" />
  
    <courtyardrect pcbX={0} pcbY={0} width="16.4mm" height="5.5mm" />
    </footprint>
);
export const ChokeFP = () => (
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={-30} pcbY={-6} holeDiameter="2.5mm" outerDiameter="4mm" shape="circle" />
    <platedhole portHints={["pin2"]} pcbX={30} pcbY={-6} holeDiameter="2.5mm" outerDiameter="4mm" shape="circle" />
  
    <courtyardcircle pcbX={0} pcbY={0} radius="44.5mm" />
    </footprint>
);
export const Cm3FP = () => (
  <footprint>
    {["pin1", "pin2", "pin3", "pin4", "pin5", "pin6"].map((h, i) => (
      <platedhole key={h} portHints={[h]} pcbX={-25 + (i % 2) * 50} pcbY={-12 + Math.floor(i / 2) * 12} holeDiameter="2mm" outerDiameter="3.4mm" shape="circle" />
    ))}
  
    <courtyardcircle pcbX={0} pcbY={0} radius="36mm" />
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
  
    <courtyardrect pcbX={0} pcbY={0} width="40mm" height="35mm" />
    </footprint>
);
export const SnapInFP = () => (
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={-5} pcbY={0} holeDiameter="2.1mm" outerDiameter="3.6mm" shape="circle" />
    <platedhole portHints={["pin2"]} pcbX={5} pcbY={0} holeDiameter="2.1mm" outerDiameter="3.6mm" shape="circle" />
  
    <courtyardcircle pcbX={0} pcbY={0} radius="18.5mm" />
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
  
    <courtyardrect pcbX={0} pcbY={-2} width="52mm" height="36mm" />
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
  
    <courtyardrect pcbX={0} pcbY={-2} width="52mm" height="36mm" />
    </footprint>
);
export const StudFP = () => (
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={0} pcbY={0} holeDiameter="8.5mm" outerDiameter="16mm" shape="circle" />
  
    <courtyardrect pcbX={0} pcbY={0} width="20mm" height="20mm" />
    </footprint>
);
export const FilmBoxFP = (pitch = 27.5, body?: [number, number]) => {
  const [bl, bw] = body ?? FILM_BODY[pitch] ?? [pitch + 4, 6];
  return (
    <footprint>
      <platedhole portHints={["pin1"]} pcbX={-pitch / 2} pcbY={0} holeDiameter="1.2mm" outerDiameter="2.2mm" shape="circle" />
      <platedhole portHints={["pin2"]} pcbX={pitch / 2} pcbY={0} holeDiameter="1.2mm" outerDiameter="2.2mm" shape="circle" />
      <courtyardrect pcbX={0} pcbY={0} width={`${bl}mm`} height={`${bw}mm`} />
    </footprint>
  );
};
// Disc parts on a 2-lead land: the BODY is the diameter, not the lead pitch. S20K550 is a 20 mm
// MOV disc on a 10 mm pitch and GDT-3k5-20kA an 8 mm disc on 6 mm -- both were drawn as small
// film boxes, which is how three MOVs could sit 15 mm apart without anything complaining.
export const DiscFP = (pitch: number, dia: number) => (
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={-pitch / 2} pcbY={0} holeDiameter="1.2mm" outerDiameter="2.2mm" shape="circle" />
    <platedhole portHints={["pin2"]} pcbX={pitch / 2} pcbY={0} holeDiameter="1.2mm" outerDiameter="2.2mm" shape="circle" />
    <courtyardcircle pcbX={0} pcbY={0} radius={`${dia / 2 + 1}mm`} />
  </footprint>
);
export const ShuntFP = () => (
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={-10} pcbY={0} holeDiameter="4mm" outerDiameter="7mm" shape="circle" />
    <platedhole portHints={["pin2"]} pcbX={10} pcbY={0} holeDiameter="4mm" outerDiameter="7mm" shape="circle" />
    <platedhole portHints={["pin3"]} pcbX={-5} pcbY={4} holeDiameter="1.1mm" outerDiameter="2mm" shape="circle" />
    <platedhole portHints={["pin4"]} pcbX={5} pcbY={4} holeDiameter="1.1mm" outerDiameter="2mm" shape="circle" />
  
    <courtyardrect pcbX={0} pcbY={2} width="40mm" height="15mm" />
    </footprint>
);
export const TrimFP = () => (
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={-15} pcbY={0} holeDiameter="2.5mm" outerDiameter="4mm" shape="circle" />
    <platedhole portHints={["pin2"]} pcbX={15} pcbY={0} holeDiameter="2.5mm" outerDiameter="4mm" shape="circle" />
  
    <courtyardcircle pcbX={0} pcbY={0} radius="22.5mm" />
    </footprint>
);
export const CtFP = () => (
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={-5} pcbY={0} holeDiameter="1.1mm" outerDiameter="2mm" shape="circle" />
    <platedhole portHints={["pin2"]} pcbX={5} pcbY={0} holeDiameter="1.1mm" outerDiameter="2mm" shape="circle" />
  
    <courtyardrect pcbX={0} pcbY={0} width="25mm" height="25mm" />
    </footprint>
);
export const Seg2FP = () => (
  <footprint>
    {Array.from({ length: 10 }, (_, i) => (
      <platedhole key={i} portHints={[`pin${i + 1}`]} pcbX={-11.43 + (i % 5) * 5.08} pcbY={i < 5 ? -7.62 : 7.62} holeDiameter="0.9mm" outerDiameter="1.6mm" shape="circle" />
    ))}
  
    <courtyardrect pcbX={0} pcbY={0} width="25mm" height="19mm" />
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
  
    <courtyardrect pcbX={0} pcbY={0} width="16mm" height="16mm" />
    </footprint>
);
export const XfmrAuxFP = () => (
  <footprint>
    {Array.from({ length: 8 }, (_, i) => (
      <platedhole key={i} portHints={[`pin${i + 1}`]} pcbX={-9 + (i % 4) * 6} pcbY={i < 4 ? -6 : 6} holeDiameter="1.1mm" outerDiameter="2mm" shape="circle" />
    ))}
  
    {/* ETD34 aux flyback: 35 x 30 body incl. bobbin and clip */}
    <courtyardrect pcbX={0} pcbY={0} width="35mm" height="30mm" />
    </footprint>
);

const DRV_PINS = { pin1: "VIA", pin2: "GNDA", pin3: "PWM", pin4: "EN", pin5: "FLT", pin6: "RDY", pin7: "NC1", pin8: "NC2", pin9: "CLAMP", pin10: "VEE", pin11: "OUTL", pin12: "OUTH", pin13: "VCC2", pin14: "KSRC", pin15: "DST", pin16: "GND2" };
const ISOAMP_PINS = { pin1: "VDD1", pin2: "VINP", pin3: "VINN", pin4: "GND1", pin5: "GND2", pin6: "OUTN", pin7: "OUTP", pin8: "VDD2" };

// ---------- isolated gate-bias module (+18/−4). HR-10: reverted to packaged module p/n for
// buildability (custom E23 transformer deferred to cost-ECO-1; C_io ≤ 10 pF spec in D5 when it runs).
export const BiasModule = ({ id, sec = "DRIVE", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <chip name={`PS${id}`} footprint="pinrow5" pinLabels={{ pin1: "VIN", pin2: "GND", pin3: "P18", pin4: "COM", pin5: "N4" }} pcbX={x} pcbY={y} schX={sx} schY={sy} schSectionName={sec} />
);
// 5 V isolated bias module (iso-amp primary-side supplies; PSCAN/PSSH pattern)
export const Bias5Module = ({ id, p5, com, sec = "SENSE", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`b5${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip layer={lay} name={`PS5${id}`} footprint="pinrow5" pinLabels={{ pin1: "VIN", pin2: "GND", pin3: "P5", pin4: "COM", pin5: "NC" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <trace from={`.PS5${id} > .VIN`} to="net.V15" schDisplayLabel="V15" />
    <trace from={`.PS5${id} > .GND`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.PS5${id} > .P5`} to={p5} schDisplayLabel={p5.replace("net.", "")} />
    <trace from={`.PS5${id} > .COM`} to={com} schDisplayLabel={com.replace("net.", "")} />
  </group>
);

// ---------- one isolated driver channel, fully wired: bias, DESAT (2× 1 kV diodes + blanking),
// split Rg on/off (DPT-frozen E5/E6), gate pulldown, Kelvin return, PWM/EN/FLT nets.
// v3: CLAMP pin tied to gate (CB-12, Miller clamp active — VERIFY app circuit vs final NSI6611 DS),
// 10 k PWM pulldown (HR-6, defined low during MCU reset), en parameterized (CB-10 per-board chain).
// Schematic envelope (layout-polish rev): 13 wide × 6 tall, origin = driver IC center.
// Logic/PWM enters left, gate network exits right, DESAT chain top-right, bias row below.
export const DriverCh = ({ id, pwm, flt, gate, kelvin, desatNode, rgOn, rgOff, en, sec = "DRIVE", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`drv${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name={`U${id}`} footprint="soic16" pinLabels={DRV_PINS} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <BiasModule id={id} sec={sec} x={-4} y={-14} sx={-0.6} sy={-2.6} />
    <resistor name={`R${id}ON`} resistance={rgOn} footprint="1206" pcbX={16} pcbY={0} schX={2.6} schY={0.9} schSectionName={sec} />
    <resistor name={`R${id}OFF`} resistance={rgOff} footprint="1206" pcbX={16} pcbY={-5} schX={2.6} schY={-0.4} schSectionName={sec} />
    <resistor name={`R${id}GS`} resistance="10k" footprint="0805" pcbX={26} pcbY={-10} schX={4.2} schY={-0.4} schSectionName={sec} />
    <resistor name={`R${id}PD`} resistance="10k" footprint="0603" pcbX={-10} pcbY={-6} schX={-2.6} schY={-1.2} schSectionName={sec} />
    <diode name={`D${id}S1`} footprint="sma" pcbX={28} pcbY={0} schX={2.7} schY={2.2} schSectionName={sec} />
    <diode name={`D${id}S2`} footprint="sma" pcbX={34} pcbY={-6} schX={4.7} schY={2.2} schSectionName={sec} />
    <capacitor name={`C${id}BL`} capacitance="100pF" footprint="0603" pcbX={28} pcbY={-6} schX={1.4} schY={1.9} schSectionName={sec} />
    <capacitor name={`C${id}B1`} capacitance="1uF" footprint="0805" pcbX={14} pcbY={-11} schX={1.2} schY={-2.5} schSectionName={sec} />
    <capacitor name={`C${id}B2`} capacitance="1uF" footprint="0805" pcbX={14} pcbY={-15} schX={2.5} schY={-2.5} schSectionName={sec} />
    <trace from={`.U${id} > .VIA`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.U${id} > .GNDA`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.U${id} > .PWM`} to={pwm} schDisplayLabel={pwm.replace("net.", "")} />
    <trace from={`.R${id}PD > .pin1`} to={pwm} schDisplayLabel={pwm.replace("net.", "")} />
    <trace from={`.R${id}PD > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.U${id} > .EN`} to={en} schDisplayLabel={en.replace("net.", "")} />
    <trace from={`.U${id} > .FLT`} to={flt} schDisplayLabel={flt.replace("net.", "")} />
    {/* R3: RDY (physical pin 12) is an active-low OPEN-DRAIN power-good and was left floating, so
        it could neither pull low nor be read. All channels wired-OR onto one per-board DRV_RDY
        net (the conventional use: the net is low unless EVERY driver's secondary bias is up); the
        single 10 k pull-up lives in SafetyChain, one per board, not one per channel. */}
    <trace from={`.U${id} > .RDY`} to="net.DRV_RDY" schDisplayLabel="DRV_RDY" />
    <trace from={`.PS${id} > .VIN`} to="net.V15" schDisplayLabel="V15" />
    <trace from={`.PS${id} > .GND`} to="net.DGND" schDisplayLabel="DGND" />
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
    <trace from={`.D${id}S2 > .cathode`} to={desatNode} schDisplayLabel={desatNode.replace("net.", "")} />
    <trace from={`.C${id}BL > .pin1`} to={`.U${id} > .DST`} />
    <trace from={`.C${id}BL > .pin2`} to={`.U${id} > .GND2`} />
  </group>
);

// ---------- Vienna phase: choke + common-source pair (ONE driver ch) + boost JBS + RC + RCD clamp
// v3: per-phase film commutation caps DCP–MID / MID–DCN (CB-9 — restores the ≤10 nH loop premise
// behind the DPT-frozen drive; §P-1 layout note: at the leg pins), snubber C 470p→100p with 2 W R
// (E28 corrected CV²f = 0.86 W), clamp bleeder to 5 W axial (HR-3, 4.3 W worst-case).
export const ViennaPhase = ({ id, ac, dcp, dcn, mid, pwm, flt, en, sec = "PFC", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`vp${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* PCB envelope 89 x 163, origin at the cell centre. The old layout ran the parts out in one
        200 mm line from the choke, which put the cell 175 mm wide and hung it 27 mm off the board.
        Three phases now tile side by side in 273 mm.

        The choke is the whole story: at 89 mm across it is wider than everything else in the cell
        put together, so it sets the cell width and everything else fits underneath it.

          y +50   D1 choke (89 dia)
          y -14   DEVICE RAIL - all five TO-247 in one line at 18 mm pitch, which is what §5's
                  ridge needs: a rail is only a rail if the devices share one Y.
          y -34   gate-drive channel, directly behind its two switches
          y -46   commutation films, then snubber and clamp below
        Power flows top-to-bottom inside the cell; the cell as a whole flows left-to-right. */}
    <inductor name={`L${id}`} inductance="165uH" footprint={<ChokeFP />} pcbX={0} pcbY={50} schX={0} schY={0} schSectionName={sec} />
    <chip name={`Q${id}A`} footprint={<TO247_4 />} pinLabels={{ pin1: "G", pin2: "D", pin3: "S", pin4: "KS" }} pcbX={-36} pcbY={-14} schX={3} schY={0} schSectionName={sec} />
    <chip name={`Q${id}B`} footprint={<TO247_4 />} pinLabels={{ pin1: "G", pin2: "D", pin3: "S", pin4: "KS" }} pcbX={-18} pcbY={-14} schX={6} schY={0} schSectionName={sec} />
    <DriverCh id={`${id}G`} pwm={pwm} flt={flt} en={en} gate={`net.G_${id}`} kelvin={`net.KS_${id}`} desatNode={`net.PH${id}`} rgOn="4.7" rgOff="4.7" sec={sec} x={-20} y={-30} sx={4.5} sy={-6.5} />
    <diode name={`D${id}T`} footprint={<TO247_2 />} pcbX={0} pcbY={-14} schX={9.5} schY={1.4} schSectionName={sec} />
    <diode name={`D${id}B`} footprint={<TO247_2 />} pcbX={18} pcbY={-14} schX={9.5} schY={-1.4} schSectionName={sec} />
    <capacitor name={`C${id}FP`} capacitance="1uF" footprint={FilmBoxFP(22.5)} pcbX={-30} pcbY={-2} schX={12.5} schY={1.4} schSectionName={sec} />
    <capacitor name={`C${id}FN`} capacitance="1uF" footprint={FilmBoxFP(22.5)} pcbX={2} pcbY={-2} schX={12.5} schY={-1.4} schSectionName={sec} />
    <resistor name={`R${id}SN`} resistance="10" footprint="2512" pcbX={30} pcbY={-56} schX={15.5} schY={0.7} schSectionName={sec} />
    <capacitor name={`C${id}SN`} capacitance="100pF" footprint="1812" pcbX={30} pcbY={-64} schX={15.5} schY={-0.7} schSectionName={sec} />
    <diode name={`D${id}C`} footprint={<TO247_2 />} pcbX={36} pcbY={-14} schX={18.5} schY={1.4} schSectionName={sec} />
    <capacitor name={`C${id}C`} capacitance="100nF" footprint={FilmBoxFP(5)} pcbX={34} pcbY={-74} schX={18.5} schY={-1.4} schSectionName={sec} />
    <chip name={`R${id}C`} footprint={FilmBoxFP(54, [48, 8])} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={-8} pcbY={-76} schX={21.5} schY={0} schSectionName={sec} />
    <trace from={ac} to={`.L${id} > .pin1`} schDisplayLabel={ac.replace("net.", "")} />
    <trace from={`.L${id} > .pin2`} to={`net.PH${id}`} />
    <trace from={`.Q${id}A > .D`} to={`net.PH${id}`} />
    <trace from={`.Q${id}A > .G`} to={`net.G_${id}`} />
    <trace from={`.Q${id}A > .KS`} to={`net.KS_${id}`} />
    <trace from={`.Q${id}A > .S`} to={`.Q${id}B > .S`} />
    <trace from={`.Q${id}B > .KS`} to={`net.KS_${id}`} />
    <trace from={`.Q${id}B > .G`} to={`net.G_${id}`} />
    <trace from={`.Q${id}B > .D`} to={mid} schDisplayLabel={mid.replace("net.", "")} />
    <trace from={`.D${id}T > .anode`} to={`net.PH${id}`} />
    <trace from={`.D${id}T > .cathode`} to={dcp} schDisplayLabel={dcp.replace("net.", "")} />
    <trace from={`.D${id}B > .cathode`} to={`net.PH${id}`} />
    <trace from={`.D${id}B > .anode`} to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    <trace from={`.C${id}FP > .pin1`} to={dcp} schDisplayLabel={dcp.replace("net.", "")} />
    <trace from={`.C${id}FP > .pin2`} to={mid} schDisplayLabel={mid.replace("net.", "")} />
    <trace from={`.C${id}FN > .pin1`} to={mid} schDisplayLabel={mid.replace("net.", "")} />
    <trace from={`.C${id}FN > .pin2`} to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    <trace from={`.R${id}SN > .pin1`} to={`net.PH${id}`} />
    <trace from={`.R${id}SN > .pin2`} to={`.C${id}SN > .pin1`} />
    <trace from={`.C${id}SN > .pin2`} to={mid} schDisplayLabel={mid.replace("net.", "")} />
    <trace from={`.D${id}C > .anode`} to={`net.PH${id}`} />
    <trace from={`.D${id}C > .cathode`} to={`.C${id}C > .pin1`} />
    <trace from={`.C${id}C > .pin2`} to={dcp} schDisplayLabel={dcp.replace("net.", "")} />
    <trace from={`.R${id}C > .A`} to={`.C${id}C > .pin1`} />
    <trace from={`.R${id}C > .B`} to={dcp} schDisplayLabel={dcp.replace("net.", "")} />
  </group>
);

// ---------- LLC half-bridge leg: 2 FETs + 2 driver channels.
// v3/E28: node RC snubbers DELETED — ZVS topology needs none and CV²f at 140 kHz (≈45 W for
// 470 pF/830 V) is untenable; ringing containment is the DPT-frozen gate drive + ≤15 nH loop (§P-2).
export const LlcHalfBridgeLeg = ({ id, bus, gnd, sw, pwmH, pwmL, flt, en, sec = "LLC", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`leg${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 24 × 15: half-bridge pair stacked at right, its two driver channels in two
        clean rows to the left (H above L, matching the bridge order). */}
    <chip name={`Q${id}H`} footprint={<TO247_4 />} pinLabels={{ pin1: "G", pin2: "D", pin3: "S", pin4: "KS" }} pcbX={0} pcbY={0} schX={17} schY={1.4} schSectionName={sec} />
    <chip name={`Q${id}L`} footprint={<TO247_4 />} pinLabels={{ pin1: "G", pin2: "D", pin3: "S", pin4: "KS" }} pcbX={12} pcbY={0} schX={17} schY={-5.6} schSectionName={sec} />
    <DriverCh id={`${id}H`} pwm={pwmH} flt={flt} en={en} gate={`net.GH_${id}`} kelvin={`net.KH_${id}`} desatNode={bus} rgOn="4.7" rgOff="2.2" sec={sec} x={0} y={16} sx={4.5} sy={1.4} />
    <DriverCh id={`${id}L`} pwm={pwmL} flt={flt} en={en} gate={`net.GL_${id}`} kelvin={`net.KL_${id}`} desatNode={sw} rgOn="4.7" rgOff="2.2" sec={sec} x={44} y={16} sx={4.5} sy={-5.6} />
    <trace from={`.Q${id}H > .D`} to={bus} schDisplayLabel={bus.replace("net.", "")} />
    <trace from={`.Q${id}H > .S`} to={sw} schDisplayLabel={sw.replace("net.", "")} />
    <trace from={`.Q${id}H > .G`} to={`net.GH_${id}`} />
    <trace from={`.Q${id}H > .KS`} to={`net.KH_${id}`} />
    <trace from={`.Q${id}L > .D`} to={sw} schDisplayLabel={sw.replace("net.", "")} />
    <trace from={`.Q${id}L > .S`} to={gnd} schDisplayLabel={gnd.replace("net.", "")} />
    <trace from={`.Q${id}L > .G`} to={`net.GL_${id}`} />
    <trace from={`.Q${id}L > .KS`} to={`net.KL_${id}`} />
    <trace from={`net.KH_${id}`} to={sw} schDisplayLabel={sw.replace("net.", "")} />
    <trace from={`net.KL_${id}`} to={gnd} schDisplayLabel={gnd.replace("net.", "")} />
  </group>
);

// ---------- LLC section: 4× Cr ∥ + trim Lr + resonant CT + transformer + dual JBS bridges
// v3/CB-15: CT return + burden biased to AVMID (VREF/2), series R + dual clamp into the ADC net.
export const LlcSection = ({ id, sw, star, bkAp, bkAn, bkBp, bkBn, ctOut, sec = "TANK", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`sec${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 26 × 12: tank L→R (Cr bank → trim → transformer → dual rectifier bridges),
        resonant-CT measurement chain on its own row below the tank. */}
    {[0, 1, 2, 3].map(i => (
      <capacitor key={i} name={`C${id}R${i}`} capacitance="46nF" footprint={FilmBoxFP(27.5)} pcbX={0} pcbY={i * 8} schX={0} schY={3 - i * 1.4} schSectionName={sec} />
    ))}
    <inductor name={`L${id}T`} inductance="4uH" footprint={<TrimFP />} pcbX={40} pcbY={0} schX={3} schY={3} schSectionName={sec} />
    <chip name={`T${id}`} footprint={<XfmrFP />} pinLabels={{ pin1: "P1", pin2: "P2", pin3: "SH", pin4: "S1A", pin5: "S1B", pin6: "S2A", pin7: "S2B" }} pcbX={80} pcbY={10} schX={7} schY={1.5} schSectionName={sec} />
    {["A1", "A2", "A3", "A4"].map((d, i) => (
      <diode key={d} name={`D${id}${d}`} footprint={<TO247_2 />} pcbX={110 + i * 12} pcbY={0} schX={11 + i * 2.4} schY={3} schSectionName={sec} />
    ))}
    {["B1", "B2", "B3", "B4"].map((d, i) => (
      <diode key={d} name={`D${id}${d}`} footprint={<TO247_2 />} pcbX={110 + i * 12} pcbY={12} schX={11 + i * 2.4} schY={0.6} schSectionName={sec} />
    ))}
    {/* measurement row: CT → burden → RC filter → clamps (CB-16 values) */}
    <chip name={`CT${id}`} footprint={<CtFP />} pinLabels={{ pin1: "S1", pin2: "S2" }} pcbX={40} pcbY={10} schX={0} schY={-3.4} schSectionName={sec} />
    <resistor name={`R${id}CT`} resistance="2" footprint="2512" pcbX={52} pcbY={10} schX={2.6} schY={-3.4} schSectionName={sec} />
    <resistor name={`R${id}CF`} resistance="1k" footprint="0603" pcbX={58} pcbY={10} schX={4.6} schY={-3.4} schSectionName={sec} />
    <capacitor name={`C${id}CF`} capacitance="220pF" footprint="0603" pcbX={64} pcbY={14} schX={6.6} schY={-4.4} schSectionName={sec} />
    <diode name={`D${id}CP`} footprint="sod323" pcbX={64} pcbY={6} schX={7.2} schY={-2.6} schSectionName={sec} />
    <diode name={`D${id}CN`} footprint="sod323" pcbX={70} pcbY={6} schX={9.6} schY={-2.6} schSectionName={sec} />
    {[0, 1, 2, 3].map(i => [
      <trace key={`a${i}`} from={sw} to={`.C${id}R${i} > .pin1`} schDisplayLabel={sw.replace("net.", "")} />,
      <trace key={`b${i}`} from={`.C${id}R${i} > .pin2`} to={`.L${id}T > .pin1`} />,
    ])}
    <trace from={`.L${id}T > .pin2`} to={`.T${id} > .P1`} />
    <trace from={`.T${id} > .P2`} to={star} schDisplayLabel={star.replace("net.", "")} />
    <trace from={`.T${id} > .SH`} to={star} schDisplayLabel={star.replace("net.", "")} />
    <trace from={`.CT${id} > .S1`} to={`net.CTB${id}`} />
    <trace from={`.CT${id} > .S2`} to="net.AVMID" schDisplayLabel="AVMID" />
    <trace from={`.R${id}CT > .pin1`} to={`net.CTB${id}`} />
    <trace from={`.R${id}CT > .pin2`} to="net.AVMID" schDisplayLabel="AVMID" />
    <trace from={`.R${id}CF > .pin1`} to={`net.CTB${id}`} />
    <trace from={`.R${id}CF > .pin2`} to={ctOut} schDisplayLabel={ctOut.replace("net.", "")} />
    <trace from={`.C${id}CF > .pin1`} to={ctOut} schDisplayLabel={ctOut.replace("net.", "")} />
    <trace from={`.C${id}CF > .pin2`} to="net.AVMID" schDisplayLabel="AVMID" />
    <trace from={`.D${id}CP > .anode`} to={ctOut} schDisplayLabel={ctOut.replace("net.", "")} />
    <trace from={`.D${id}CP > .cathode`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.D${id}CN > .anode`} to="net.AGND" schDisplayLabel="AGND" />
    <trace from={`.D${id}CN > .cathode`} to={ctOut} schDisplayLabel={ctOut.replace("net.", "")} />
    <trace from={`.D${id}A1 > .anode`} to={`.T${id} > .S1A`} />
    <trace from={`.D${id}A1 > .cathode`} to={bkAp} schDisplayLabel={bkAp.replace("net.", "")} />
    <trace from={`.D${id}A2 > .cathode`} to={`.T${id} > .S1A`} />
    <trace from={`.D${id}A2 > .anode`} to={bkAn} schDisplayLabel={bkAn.replace("net.", "")} />
    <trace from={`.D${id}A3 > .anode`} to={`.T${id} > .S1B`} />
    <trace from={`.D${id}A3 > .cathode`} to={bkAp} schDisplayLabel={bkAp.replace("net.", "")} />
    <trace from={`.D${id}A4 > .cathode`} to={`.T${id} > .S1B`} />
    <trace from={`.D${id}A4 > .anode`} to={bkAn} schDisplayLabel={bkAn.replace("net.", "")} />
    <trace from={`.D${id}B1 > .anode`} to={`.T${id} > .S2A`} />
    <trace from={`.D${id}B1 > .cathode`} to={bkBp} schDisplayLabel={bkBp.replace("net.", "")} />
    <trace from={`.D${id}B2 > .cathode`} to={`.T${id} > .S2A`} />
    <trace from={`.D${id}B2 > .anode`} to={bkBn} schDisplayLabel={bkBn.replace("net.", "")} />
    <trace from={`.D${id}B3 > .anode`} to={`.T${id} > .S2B`} />
    <trace from={`.D${id}B3 > .cathode`} to={bkBp} schDisplayLabel={bkBp.replace("net.", "")} />
    <trace from={`.D${id}B4 > .cathode`} to={`.T${id} > .S2B`} />
    <trace from={`.D${id}B4 > .anode`} to={bkBn} schDisplayLabel={bkBn.replace("net.", "")} />
  </group>
);

// ---------- split DC link
export const SplitDcLink = ({ id = "", nPerHalf, dcp, dcn, mid, sec = "DCLINK", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`dclink${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope (2·n + 6) × 6: top half-bank row above the midpoint, bottom row below,
        balance dividers in their own column at right. */}
    {Array.from({ length: nPerHalf }, (_, i) => (
      <capacitor key={`t${i}`} name={`CDT${id}${i}`} capacitance="470uF" footprint={<SnapInFP />} pcbX={i * 40} pcbY={0} schX={i * 2} schY={1.4} schSectionName={sec} />
    ))}
    {Array.from({ length: nPerHalf }, (_, i) => (
      <capacitor key={`b${i}`} name={`CDB${id}${i}`} capacitance="470uF" footprint={<SnapInFP />} pcbX={i * 40} pcbY={-45} schX={i * 2} schY={-1.4} schSectionName={sec} />
    ))}
    {/* HR-20: 2-series 47 k HV per half — halves per-element V (≈208 V) and W (≈0.92 W on 3 W) */}
    <resistor name={`RBALT${id}A`} resistance="47k" footprint="2512" pcbX={0} pcbY={-22.5} schX={nPerHalf * 2 + 1} schY={2.1} schSectionName={sec} />
    <resistor name={`RBALT${id}B`} resistance="47k" footprint="2512" pcbX={24} pcbY={-22.5} schX={nPerHalf * 2 + 1} schY={0.7} schSectionName={sec} />
    <resistor name={`RBALB${id}A`} resistance="47k" footprint="2512" pcbX={56} pcbY={-22.5} schX={nPerHalf * 2 + 1} schY={-0.7} schSectionName={sec} />
    <resistor name={`RBALB${id}B`} resistance="47k" footprint="2512" pcbX={80} pcbY={-22.5} schX={nPerHalf * 2 + 1} schY={-2.1} schSectionName={sec} />
    {Array.from({ length: nPerHalf }, (_, i) => [
      <trace key={`tt${i}`} from={`.CDT${id}${i} > .pin1`} to={dcp} schDisplayLabel={dcp.replace("net.", "")} />,
      <trace key={`tm${i}`} from={`.CDT${id}${i} > .pin2`} to={mid} schDisplayLabel={mid.replace("net.", "")} />,
      <trace key={`bm${i}`} from={`.CDB${id}${i} > .pin1`} to={mid} schDisplayLabel={mid.replace("net.", "")} />,
      <trace key={`bn${i}`} from={`.CDB${id}${i} > .pin2`} to={dcn} schDisplayLabel={dcn.replace("net.", "")} />,
    ])}
    <trace from={`.RBALT${id}A > .pin1`} to={dcp} schDisplayLabel={dcp.replace("net.", "")} />
    <trace from={`.RBALT${id}A > .pin2`} to={`.RBALT${id}B > .pin1`} />
    <trace from={`.RBALT${id}B > .pin2`} to={mid} schDisplayLabel={mid.replace("net.", "")} />
    <trace from={`.RBALB${id}A > .pin1`} to={mid} schDisplayLabel={mid.replace("net.", "")} />
    <trace from={`.RBALB${id}A > .pin2`} to={`.RBALB${id}B > .pin1`} />
    <trace from={`.RBALB${id}B > .pin2`} to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
  </group>
);

// ---------- S/P matrix incl. pre-insertion aux relays + K_OUT (E12); coils to CoilDriver nets
// v3/E30: mirror-contact relays; per-relay readback net (10 k pull-up, closed-main → mirror open).
// HR-12: pre-insertion resistors are pulse-rated axial (94 J single-fault case documented).
// v4/HR-19: `dual` (120 kW) instantiates the paralleled second relay per HV function that the
// architecture/skuOverrides always specified: contacts paralleled, coils share the COIL_ net
// (2× ~70 mA on one ULN channel), mirrors in SERIES with the primary's → RELAY_FB reads
// "both mains open" (same semantics as the KPRE chain). Sharing note: contact-R-matched pairs
// or 250 A-class contacts — §K; symmetric busbar per layout note P-16.
export const SeriesParallelRelayMatrix = ({ bkAp, bkAn, bkBp, bkBn, outp, dual = false, sec = "SPMATRIX", x = 0, y = 0, sx = 0, sy = 0 }: any) => {
  const HV = ["KSER", "KPARA", "KPARB", "KOUT"];
  const contacts: Record<string, [string, string]> = { KSER: [bkAn, bkBp], KPARA: [bkAp, bkBp], KPARB: [bkAn, bkBn], KOUT: [bkAp, outp] };
  return (
  <group name="spmatrix" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 22 × 14 (single) / 22 × 22 (dual): relays in a 3-column grid, each with its
        readback pull-up beside it; pre-insertion resistors in their own column at right. */}
    {["KSER", "KPARA", "KPARB", "KOUT", "KPREA", "KPREB"].map((k, i) => (
      <chip key={k} name={k} footprint={<RelayMFP />} pinLabels={{ pin1: "C1", pin2: "C2", pin3: "A", pin4: "B", pin5: "M1", pin6: "M2" }} pcbX={(i % 3) * 40} pcbY={Math.floor(i / 3) * 35} schX={(i % 3) * 6} schY={-Math.floor(i / 3) * 5} schSectionName={sec} />
    ))}
    {dual ? HV.map((k, i) => (
      <chip key={`${k}2`} name={`${k}2`} footprint={<RelayMFP />} pinLabels={{ pin1: "C1", pin2: "C2", pin3: "A", pin4: "B", pin5: "M1", pin6: "M2" }} pcbX={(i % 3) * 40} pcbY={80 + Math.floor(i / 3) * 35} schX={(i % 3) * 6} schY={-10 - Math.floor(i / 3) * 5} schSectionName={sec} />
    )) : null}
    {["KSER", "KPARA", "KPARB", "KOUT", "KPREA", "KPREB"].map((k, i) => (
      <resistor key={`r${k}`} name={`RKPU${k}`} resistance="10k" footprint="0603" pcbX={(i % 3) * 40 + 20} pcbY={Math.floor(i / 3) * 35 + 15} schX={(i % 3) * 6 + 2.6} schY={-Math.floor(i / 3) * 5 + 1.6} schSectionName={sec} />
    ))}
    <chip name="RPREA" footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={130} pcbY={0} schX={17} schY={0} schSectionName={sec} />
    <chip name="RPREB" footprint={FilmBoxFP(25)} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={130} pcbY={35} schX={17} schY={-5} schSectionName={sec} />
    {["KSER", "KPARA", "KPARB", "KOUT", "KPREA", "KPREB"].map(k => [
      <trace key={`c1${k}`} from={`.${k} > .C1`} to="net.V24" schDisplayLabel="V24" />,
      <trace key={`c2${k}`} from={`.${k} > .C2`} to={`net.COIL_${k}`} schDisplayLabel={`COIL_${k}`} />,
      <trace key={`m1${k}`} from={`.${k} > .M1`} to="net.DGND" schDisplayLabel="DGND" />,
      <trace key={`pu${k}`} from={`.RKPU${k} > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />,
      <trace key={`pu2${k}`} from={`.RKPU${k} > .pin2`} to={`net.RELAY_FB_${k}`} schDisplayLabel={`RELAY_FB_${k}`} />,
    ])}
    {/* mirror chain: single → M2 to FB; dual → M2 into the pair relay's mirror, then FB */}
    {["KPREA", "KPREB"].map(k => (
      <trace key={`m2${k}`} from={`.${k} > .M2`} to={`net.RELAY_FB_${k}`} schDisplayLabel={`RELAY_FB_${k}`} />
    ))}
    {HV.map(k => dual ? [
      <trace key={`m2${k}`} from={`.${k} > .M2`} to={`.${k}2 > .M1`} />,
      <trace key={`m3${k}`} from={`.${k}2 > .M2`} to={`net.RELAY_FB_${k}`} schDisplayLabel={`RELAY_FB_${k}`} />,
      <trace key={`c12${k}`} from={`.${k}2 > .C1`} to="net.V24" schDisplayLabel="V24" />,
      <trace key={`c22${k}`} from={`.${k}2 > .C2`} to={`net.COIL_${k}`} schDisplayLabel={`COIL_${k}`} />,
      <trace key={`a2${k}`} from={`.${k}2 > .A`} to={contacts[k][0]} schDisplayLabel={contacts[k][0].replace("net.", "")} />,
      <trace key={`b2${k}`} from={`.${k}2 > .B`} to={contacts[k][1]} schDisplayLabel={contacts[k][1].replace("net.", "")} />,
    ] : [
      <trace key={`m2${k}`} from={`.${k} > .M2`} to={`net.RELAY_FB_${k}`} schDisplayLabel={`RELAY_FB_${k}`} />,
    ])}
    <trace from=".KSER > .A" to={bkAn} schDisplayLabel={bkAn.replace("net.", "")} />
    <trace from=".KSER > .B" to={bkBp} schDisplayLabel={bkBp.replace("net.", "")} />
    <trace from=".KPARA > .A" to={bkAp} schDisplayLabel={bkAp.replace("net.", "")} />
    <trace from=".KPARA > .B" to={bkBp} schDisplayLabel={bkBp.replace("net.", "")} />
    <trace from=".KPARB > .A" to={bkAn} schDisplayLabel={bkAn.replace("net.", "")} />
    <trace from=".KPARB > .B" to={bkBn} schDisplayLabel={bkBn.replace("net.", "")} />
    <trace from=".KPREA > .A" to={bkAp} schDisplayLabel={bkAp.replace("net.", "")} />
    <trace from=".KPREA > .B" to=".RPREA > .A" />
    <trace from=".RPREA > .B" to={bkBp} schDisplayLabel={bkBp.replace("net.", "")} />
    <trace from=".KPREB > .A" to={bkAn} schDisplayLabel={bkAn.replace("net.", "")} />
    <trace from=".KPREB > .B" to=".RPREB > .A" />
    <trace from=".RPREB > .B" to={bkBn} schDisplayLabel={bkBn.replace("net.", "")} />
    <trace from=".KOUT > .A" to={bkAp} schDisplayLabel={bkAp.replace("net.", "")} />
    <trace from=".KOUT > .B" to={outp} schDisplayLabel={outp.replace("net.", "")} />
  </group>
  );
};

// ---------- relay-coil driver (8-ch darlington array, COM clamp to 24 V). Unused inputs to DGND (MR-8).
export const CoilDriver = ({ id, ins, outs, sec = "COILS", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`uln${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip layer={lay} name={`U${id}`} footprint="soic18" pinLabels={{ pin1: "IN1", pin2: "IN2", pin3: "IN3", pin4: "IN4", pin5: "IN5", pin6: "IN6", pin7: "IN7", pin8: "IN8", pin9: "GND", pin10: "COM", pin11: "OUT8", pin12: "OUT7", pin13: "OUT6", pin14: "OUT5", pin15: "OUT4", pin16: "OUT3", pin17: "OUT2", pin18: "OUT1" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    {ins.map((n, i) => <trace key={`i${i}`} from={`.U${id} > .IN${i + 1}`} to={n} />)}
    {outs.map((n, i) => <trace key={`o${i}`} from={`.U${id} > .OUT${i + 1}`} to={n} />)}
    <trace from={`.U${id} > .GND`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.U${id} > .COM`} to="net.V24" schDisplayLabel="V24" />
  </group>
);

// ---------- isolated HV voltage sense (E25, replaces the barrier-breaching resistive HvDivider —
// CB-3): 8× 1206 divider chain referenced INSIDE the measured domain + iso voltage-sense amp
// (AMC1311-class unipolar / AMC1350-class ±bipolar for AC) + isolated 5 V floating-side bias.
// biasP/biasG: floating-side rail nodes (share one Bias5Module per domain). outN optional.
// v4/MR-18: `cf` parameterizes the input filter — channels that feed a hardware OVP comparator
// (bus/bank/output) use 1 nF (pole ≈ 23 kHz → trip path ≈ 10–20 µs); AC metering keeps 10 nF.
export const IsoVSense = ({ id, hv, ref, out, outN, biasP, rBot = "6.8k", cf = "10nF", sec = "SENSE", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`ivs${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 18 × 4: divider chain across the top, bottom-leg RC + iso-amp below-right */}
    {Array.from({ length: 8 }, (_, i) => (
      <resistor layer={lay} key={i} name={`R${id}D${i}`} resistance="475k" footprint="1206" pcbX={i * 6} pcbY={0} schX={i * 1.4} schY={1} schSectionName={sec} />
    ))}
    <resistor layer={lay} name={`R${id}DL`} resistance={rBot} footprint="0805" pcbX={50} pcbY={5} schX={10.5} schY={-1} schSectionName={sec} />
    <capacitor layer={lay} name={`C${id}DF`} capacitance={cf} footprint="0805" pcbX={56} pcbY={5} schX={12} schY={-1} schSectionName={sec} />
    <chip layer={lay} name={`UIV${id}`} footprint="soic8" pinLabels={ISOAMP_PINS} pcbX={64} pcbY={0} schX={15} schY={0} schSectionName={sec} />
    <trace from={hv} to={`.R${id}D0 > .pin1`} schDisplayLabel={hv.replace("net.", "")} />
    {Array.from({ length: 7 }, (_, i) => (
      <trace key={i} from={`.R${id}D${i} > .pin2`} to={`.R${id}D${i + 1} > .pin1`} />
    ))}
    <trace from={`.R${id}D7 > .pin2`} to={`.R${id}DL > .pin1`} />
    <trace from={`.R${id}DL > .pin2`} to={ref} schDisplayLabel={ref.replace("net.", "")} />
    <trace from={`.C${id}DF > .pin1`} to={`.R${id}DL > .pin1`} />
    <trace from={`.C${id}DF > .pin2`} to={ref} schDisplayLabel={ref.replace("net.", "")} />
    <trace from={`.UIV${id} > .VINP`} to={`.R${id}DL > .pin1`} />
    <trace from={`.UIV${id} > .VINN`} to={ref} schDisplayLabel={ref.replace("net.", "")} />
    <trace from={`.UIV${id} > .GND1`} to={ref} schDisplayLabel={ref.replace("net.", "")} />
    <trace from={`.UIV${id} > .VDD1`} to={biasP} schDisplayLabel={biasP.replace("net.", "")} />
    <trace from={`.UIV${id} > .VDD2`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.UIV${id} > .GND2`} to="net.AGND" schDisplayLabel="AGND" />
    <trace from={`.UIV${id} > .OUTP`} to={out} schDisplayLabel={out.replace("net.", "")} />
    {outN ? <trace from={`.UIV${id} > .OUTN`} to={outN} /> : null}
  </group>
);

// ---------- buffered mid-rail (E31/CB-15): VREF/2 source for every bipolar CT/sense return.
// v4/MR-11: dual-feedback buffer — 4.7 Ω isolates the 10 µF reservoir from the op-amp (no bare
// op-amp is stable into 10 µF); DC feedback via 10 k from AVMID (accuracy), AC feedback via
// 100 pF local (stability). Standard cap-load topology, layout note P-12.
export const AnalogMid = ({ sec = "SENSE", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name="avmid" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 12 × 5. CAVF 2.2 nF: its corner (≈7 kHz) must sit BELOW the outer-loop
        crossover (~30 kHz with a 10 MHz op-amp into 10 µF) or the buffer still rings — found
        by the ct-frontend.mjs deck, which runs both topologies as regression evidence. */}
    <resistor layer={lay} name="RAVH" resistance="10k" footprint="0603" pcbX={0} pcbY={0} schX={0} schY={1.2} schSectionName={sec} />
    <resistor layer={lay} name="RAVL" resistance="10k" footprint="0603" pcbX={0} pcbY={5} schX={0} schY={-1.2} schSectionName={sec} />
    <capacitor layer={lay} name="CAVM" capacitance="100nF" footprint="0603" pcbX={6} pcbY={5} schX={1.6} schY={0} schSectionName={sec} />
    <chip layer={lay} name="UAVB" footprint="soic8" pinLabels={{ pin1: "OUT", pin2: "INN", pin3: "INP", pin4: "VN", pin5: "NC1", pin6: "NC2", pin7: "NC3", pin8: "VP" }} pcbX={12} pcbY={0} schX={4} schY={0.4} schSectionName={sec} />
    <resistor layer={lay} name="RAVI" resistance="4.7" footprint="0603" pcbX={18} pcbY={0} schX={7} schY={0.4} schSectionName={sec} />
    <resistor layer={lay} name="RAVF" resistance="10k" footprint="0603" pcbX={18} pcbY={6} schX={7} schY={-1.4} schSectionName={sec} />
    <capacitor layer={lay} name="CAVF" capacitance="2.2nF" footprint="0603" pcbX={12} pcbY={6} schX={5.5} schY={2.2} schSectionName={sec} />
    <capacitor layer={lay} name="CAVO" capacitance="10uF" footprint="0805" pcbX={24} pcbY={5} schX={9} schY={-0.8} schSectionName={sec} />
    <trace from=".RAVH > .pin1" to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from=".RAVH > .pin2" to="net.AVREF_MID" />
    <trace from=".RAVL > .pin1" to="net.AVREF_MID" />
    <trace from=".RAVL > .pin2" to="net.AGND" schDisplayLabel="AGND" />
    <trace from=".CAVM > .pin1" to="net.AVREF_MID" />
    <trace from=".CAVM > .pin2" to="net.AGND" schDisplayLabel="AGND" />
    <trace from=".UAVB > .INP" to="net.AVREF_MID" />
    <trace from=".UAVB > .OUT" to=".RAVI > .pin1" />
    <trace from=".RAVI > .pin2" to="net.AVMID" schDisplayLabel="AVMID" />
    <trace from=".RAVF > .pin1" to="net.AVMID" schDisplayLabel="AVMID" />
    <trace from=".RAVF > .pin2" to=".UAVB > .INN" />
    <trace from=".CAVF > .pin1" to=".UAVB > .OUT" />
    <trace from=".CAVF > .pin2" to=".UAVB > .INN" />
    <trace from=".UAVB > .VP" to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from=".UAVB > .VN" to="net.AGND" schDisplayLabel="AGND" />
    <trace from=".CAVO > .pin1" to="net.AVMID" schDisplayLabel="AVMID" />
    <trace from=".CAVO > .pin2" to="net.AGND" schDisplayLabel="AGND" />
  </group>
);

// ---------- line/lane CT sensor (E18) — v3/CB-15: burden + return biased to AVMID, dual clamps
export const CtSensor = ({ id, out, sec = "CT", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`cts${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* PCB: the CT body is 25 mm across, so the burden and clamps sit to its RIGHT, not on top
        of it. Envelope 57 × 25, one measurement row per phase. */}
    <chip layer={lay} name={`CT${id}`} footprint={<CtFP />} pinLabels={{ pin1: "S1", pin2: "S2" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <resistor layer={lay} name={`R${id}B`} resistance="33" footprint="1206" pcbX={24} pcbY={0} schX={2.2} schY={0} schSectionName={sec} />
    <resistor layer={lay} name={`R${id}F`} resistance="1k" footprint="0603" pcbX={34} pcbY={0} schX={4} schY={0} schSectionName={sec} />
    <capacitor layer={lay} name={`C${id}F`} capacitance="1nF" footprint="0603" pcbX={44} pcbY={0} schX={5.6} schY={-1.2} schSectionName={sec} />
    <diode layer={lay} name={`D${id}P`} footprint="sod323" pcbX={24} pcbY={9} schX={6.6} schY={1.2} schSectionName={sec} />
    <diode layer={lay} name={`D${id}N`} footprint="sod323" pcbX={34} pcbY={9} schX={9} schY={1.2} schSectionName={sec} />
    <trace from={`.CT${id} > .S1`} to={`.R${id}B > .pin1`} />
    <trace from={`.CT${id} > .S2`} to="net.AVMID" schDisplayLabel="AVMID" />
    <trace from={`.R${id}B > .pin2`} to="net.AVMID" schDisplayLabel="AVMID" />
    <trace from={`.R${id}F > .pin1`} to={`.R${id}B > .pin1`} />
    <trace from={`.R${id}F > .pin2`} to={out} schDisplayLabel={out.replace("net.", "")} />
    <trace from={`.C${id}F > .pin1`} to={out} schDisplayLabel={out.replace("net.", "")} />
    <trace from={`.C${id}F > .pin2`} to="net.AVMID" schDisplayLabel="AVMID" />
    <trace from={`.D${id}P > .anode`} to={out} schDisplayLabel={out.replace("net.", "")} />
    <trace from={`.D${id}P > .cathode`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.D${id}N > .anode`} to="net.AGND" schDisplayLabel="AGND" />
    <trace from={`.D${id}N > .cathode`} to={out} schDisplayLabel={out.replace("net.", "")} />
  </group>
);

// ---------- NTC input (remote sensor header + bias + filter; unipolar — no mid-rail needed)
export const NtcInput = ({ id, out, sec = "SENSE", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`ntc${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 8 × 3 */}
    <chip layer={lay} name={`J${id}`} footprint="pinrow2" pinLabels={{ pin1: "P1", pin2: "P2" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <resistor layer={lay} name={`R${id}P`} resistance="10k" footprint="0603" pcbX={8} pcbY={0} schX={2.4} schY={1.2} schSectionName={sec} />
    <capacitor layer={lay} name={`C${id}F`} capacitance="100nF" footprint="0603" pcbX={14} pcbY={0} schX={4.4} schY={-0.6} schSectionName={sec} />
    <trace from={`.J${id} > .P1`} to={out} schDisplayLabel={out.replace("net.", "")} />
    <trace from={`.J${id} > .P2`} to="net.AGND" schDisplayLabel="AGND" />
    <trace from={`.R${id}P > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.R${id}P > .pin2`} to={out} schDisplayLabel={out.replace("net.", "")} />
    <trace from={`.C${id}F > .pin1`} to={out} schDisplayLabel={out.replace("net.", "")} />
    <trace from={`.C${id}F > .pin2`} to="net.AGND" schDisplayLabel="AGND" />
  </group>
);

// ---------- hardware safety chain (CB-10/E27), one per board:
// GATE_EN_x = AND(own-MCU EN, other-MCU EN via harness w/ 100 k pulldown, watchdog WDO w/ 10 k pullup)
// → 10 k pulldown on the output: gates default-DISABLED for any missing/floating/reset condition.
// USUP = external windowed watchdog (protection rows 24/30); spare AND gates' inputs tied low.
// v4/HR-13: watchdog symbol corrected to the real 6-pin device class (TPS3430: VDD/GND/WDI/WDO/
// window-set straps) — the v3 3-pin symbol had no supply. SET straps to DGND = datasheet default
// window; final strap per A6/§K. RENL: local-EN 100 k pulldown (E27 hygiene — no floating CMOS
// input on the safety AND while the local MCU is in reset).
export const SafetyChain = ({ id, enLocal, enRemote, wdi, gateEn, sec = "SAFETY", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`sfc${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 12 × 6: watchdog left, AND gate right, straps/pulls in a tidy bottom row */}
    <chip layer={lay} name={`USUP${id}`} footprint="soic8" pinLabels={{ pin1: "WDI", pin2: "GND", pin3: "SET0", pin4: "SET1", pin5: "WDO", pin6: "VDD", pin7: "CWD", pin8: "CRST" }} pcbX={0} pcbY={0} schX={0} schY={0.6} schSectionName={sec} />
    <chip layer={lay} name={`UAND${id}`} footprint="soic14" pinLabels={{ pin1: "A1", pin2: "B1", pin3: "A2", pin4: "B2", pin5: "C2", pin6: "Y2", pin7: "GND", pin8: "Y3", pin9: "A3", pin10: "B3", pin11: "C3", pin12: "Y1", pin13: "C1", pin14: "VCC" }} pcbX={14} pcbY={0} schX={4.5} schY={0.6} schSectionName={sec} />
    <resistor layer={lay} name={`RWPU${id}`} resistance="10k" footprint="0603" pcbX={0} pcbY={8} schX={0} schY={-2} schSectionName={sec} />
    <resistor layer={lay} name={`RENR${id}`} resistance="100k" footprint="0603" pcbX={7} pcbY={8} schX={1.6} schY={-2} schSectionName={sec} />
    <resistor layer={lay} name={`RENL${id}`} resistance="100k" footprint="0603" pcbX={7} pcbY={13} schX={3.2} schY={-2} schSectionName={sec} />
    <resistor layer={lay} name={`RGPD${id}`} resistance="10k" footprint="0603" pcbX={28} pcbY={8} schX={7.5} schY={-2} schSectionName={sec} />
    <capacitor layer={lay} name={`CSF${id}`} capacitance="100nF" footprint="0603" pcbX={20} pcbY={8} schX={6} schY={-2} schSectionName={sec} />
    {/* R3: CWD (physical 2) programs the watchdog timeout and CRST (physical 4) the reset delay.
        Both were floating, which leaves the window UNDEFINED — the safety chain's centerpiece
        would not have had a defined timeout. Sized for the 10 ms window of E27/F.32.
        VALUE REVIEW: the C-per-ms constant comes from the final TPS3430 datasheet (§K); the
        components and their nets are correct regardless of the final capacitance. */}
    <capacitor layer={lay} name={`CWD${id}`} capacitance="1nF" footprint="0603" pcbX={20} pcbY={13} schX={6} schY={-3.2} schSectionName={sec} />
    <capacitor layer={lay} name={`CRST${id}`} capacitance="1nF" footprint="0603" pcbX={24} pcbY={13} schX={7.5} schY={-3.2} schSectionName={sec} />
    <trace from={`.CWD${id} > .pin1`} to={`.USUP${id} > .CWD`} />
    <trace from={`.CWD${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.CRST${id} > .pin1`} to={`.USUP${id} > .CRST`} />
    <trace from={`.CRST${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    {/* the single per-board pull-up for the wired-OR driver power-good chain (see DriverCh) */}
    <resistor name={`RRDY${id}`} resistance="10k" footprint="0603" pcbX={28} pcbY={13} schX={9} schY={-3.2} schSectionName={sec} />
    <trace from={`.RRDY${id} > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.RRDY${id} > .pin2`} to="net.DRV_RDY" schDisplayLabel="DRV_RDY" />
    <trace from={`.USUP${id} > .WDI`} to={wdi} schDisplayLabel={wdi.replace("net.", "")} />
    <trace from={`.USUP${id} > .GND`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.USUP${id} > .VDD`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.USUP${id} > .SET0`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.USUP${id} > .SET1`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.CSF${id} > .pin1`} to={`.USUP${id} > .VDD`} />
    <trace from={`.RENL${id} > .pin1`} to={enLocal} schDisplayLabel={enLocal.replace("net.", "")} />
    <trace from={`.RENL${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.USUP${id} > .WDO`} to={`net.WDO_${id}`} />
    <trace from={`.RWPU${id} > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.RWPU${id} > .pin2`} to={`net.WDO_${id}`} />
    <trace from={`.RENR${id} > .pin1`} to={enRemote} schDisplayLabel={enRemote.replace("net.", "")} />
    <trace from={`.RENR${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.UAND${id} > .A1`} to={enLocal} schDisplayLabel={enLocal.replace("net.", "")} />
    <trace from={`.UAND${id} > .B1`} to={enRemote} schDisplayLabel={enRemote.replace("net.", "")} />
    <trace from={`.UAND${id} > .C1`} to={`net.WDO_${id}`} />
    <trace from={`.UAND${id} > .Y1`} to={gateEn} schDisplayLabel={gateEn.replace("net.", "")} />
    <trace from={`.RGPD${id} > .pin1`} to={gateEn} schDisplayLabel={gateEn.replace("net.", "")} />
    <trace from={`.RGPD${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    {["A2", "B2", "C2", "A3", "B3", "C3"].map(p => (
      <trace key={p} from={`.UAND${id} > .${p}`} to="net.DGND" schDisplayLabel="DGND" />
    ))}
    <trace from={`.UAND${id} > .VCC`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.UAND${id} > .GND`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.CSF${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
  </group>
);

// ---------- SWD/boot provisioning per MCU (CB-13/HR-11): 5-pin header + BOOT0 strap + NRST cap
export const SwdPort = ({ id, sec = "SWD", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`swd${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 7 × 3 */}
    <chip layer={lay} name={`JSWD${id}`} footprint="pinrow5" pinLabels={{ pin1: "VCC", pin2: "DIO", pin3: "CLK", pin4: "RST", pin5: "GND" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <resistor layer={lay} name={`R${id}BOOT`} resistance="10k" footprint="0603" pcbX={14} pcbY={0} schX={2.6} schY={0.7} schSectionName={sec} />
    <capacitor layer={lay} name={`C${id}RST`} capacitance="100nF" footprint="0603" pcbX={14} pcbY={6} schX={2.6} schY={-0.7} schSectionName={sec} />
    <trace from={`.JSWD${id} > .VCC`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.JSWD${id} > .DIO`} to={`net.SWDIO_${id}`} schDisplayLabel={`SWDIO_${id}`} />
    <trace from={`.JSWD${id} > .CLK`} to={`net.SWCLK_${id}`} schDisplayLabel={`SWCLK_${id}`} />
    <trace from={`.JSWD${id} > .RST`} to={`net.NRST_${id}`} schDisplayLabel={`NRST_${id}`} />
    <trace from={`.JSWD${id} > .GND`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.R${id}BOOT > .pin1`} to={`net.BOOT0_${id}`} schDisplayLabel={`BOOT0_${id}`} />
    <trace from={`.R${id}BOOT > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.C${id}RST > .pin1`} to={`net.NRST_${id}`} schDisplayLabel={`NRST_${id}`} />
    <trace from={`.C${id}RST > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
  </group>
);

// ---------- discharge control (CB-11 rework): default-OFF, isolated. MCU sources the opto LED
// (active-high, 330 Ω from GPIO); output stage biased by a DCN-referenced isolated module; 10 k
// gate pulldown to DCN ⇒ MCU reset/dead/unprogrammed = discharge OFF. Passive bleed = balancers
// (τ documented, E19 rev B); commanded discharge covers normal shutdown + FSM SAFE entry.
// v4/HR-15: id param so the cell instantiates more than once (bus discharge on AC-DC, bank
// bleeders on DC-DC). dcn = the measured domain's negative rail (DCN / BKAN / BKBN).
export const DischargeCtl = ({ id = "", ctl, gateOut, dcn, sec = "DISCH", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`dsch${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 10 × 4.5: LED in from the left, opto center, bias module below, gate net right */}
    <chip name={`UQD${id}`} footprint="soic8" pinLabels={{ pin1: "ANO", pin2: "CAT", pin3: "NC1", pin4: "NC2", pin5: "VEE", pin6: "OUT", pin7: "NC3", pin8: "VCC" }} pcbX={0} pcbY={0} schX={0} schY={0.6} schSectionName={sec} />
    <chip name={`PSQD${id}`} footprint="pinrow5" pinLabels={{ pin1: "VIN", pin2: "GND", pin3: "P18", pin4: "COM", pin5: "N4" }} pcbX={0} pcbY={10} schX={0} schY={-1.8} schSectionName={sec} />
    <resistor name={`RQDL${id}`} resistance="330" footprint="0603" pcbX={-10} pcbY={0} schX={-2.4} schY={0.6} schSectionName={sec} />
    <resistor name={`RQDG${id}`} resistance="100" footprint="0805" pcbX={12} pcbY={0} schX={2.6} schY={0.6} schSectionName={sec} />
    <resistor name={`RQDPD${id}`} resistance="10k" footprint="0805" pcbX={12} pcbY={6} schX={4.2} schY={-0.8} schSectionName={sec} />
    <trace from={ctl} to={`.RQDL${id} > .pin1`} schDisplayLabel={ctl.replace("net.", "")} />
    <trace from={`.RQDL${id} > .pin2`} to={`.UQD${id} > .ANO`} />
    <trace from={`.UQD${id} > .CAT`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.PSQD${id} > .VIN`} to="net.V15" schDisplayLabel="V15" />
    <trace from={`.PSQD${id} > .GND`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.PSQD${id} > .P18`} to={`.UQD${id} > .VCC`} />
    <trace from={`.PSQD${id} > .COM`} to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    <trace from={`.UQD${id} > .VEE`} to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    <trace from={`.UQD${id} > .OUT`} to={`.RQDG${id} > .pin1`} />
    <trace from={`.RQDG${id} > .pin2`} to={gateOut} />
    <trace from={`.RQDPD${id} > .pin1`} to={gateOut} />
    <trace from={`.RQDPD${id} > .pin2`} to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
  </group>
);

// ---------- photovoltaic gate drive (ECO-2a, E33 rev B): VOM1271-class PV driver for the bank
// bleeders — the bleeder needs default-OFF isolation and ms-class turn-on only, so the opto +
// DCN-referenced bias-module stack (₹137/bank) is over-built; the PV driver (₹35) needs NO
// floating supply. Output ~8.4 V open-circuit: enough to enhance the SiC bleeder FET at its
// 60 mA operating point (Rds elevated at Vgs 8 V — irrelevant at I²R ≈ mW). Integrated
// turn-off circuit; RGB bleed for belt-and-braces default-OFF. NOT for the bus discharge
// (QDISF keeps the fast opto+bias chain) and never for switching gates.
export const PvGateDrive = ({ id, ctl, gateOut, src, sec = "BLEED", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`pvg${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 8 × 2.5 */}
    <chip name={`UPV${id}`} footprint="soic8" pinLabels={{ pin1: "ANO", pin2: "CAT", pin3: "NC1", pin4: "NC2", pin5: "VN", pin6: "NC3", pin7: "NC4", pin8: "VP" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <resistor name={`RPVL${id}`} resistance="330" footprint="0603" pcbX={-10} pcbY={0} schX={-2.4} schY={0} schSectionName={sec} />
    <resistor name={`RPVB${id}`} resistance="1M" footprint="0805" pcbX={10} pcbY={0} schX={2.6} schY={0} schSectionName={sec} />
    <trace from={ctl} to={`.RPVL${id} > .pin1`} schDisplayLabel={ctl.replace("net.", "")} />
    <trace from={`.RPVL${id} > .pin2`} to={`.UPV${id} > .ANO`} />
    <trace from={`.UPV${id} > .CAT`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.UPV${id} > .VP`} to={gateOut} />
    <trace from={`.UPV${id} > .VN`} to={src} schDisplayLabel={src.replace("net.", "")} />
    <trace from={`.RPVB${id} > .pin1`} to={gateOut} />
    <trace from={`.RPVB${id} > .pin2`} to={src} schDisplayLabel={src.replace("net.", "")} />
  </group>
);

// ---------- HMI (user req 2026-09-04): 2 buttons + 2-digit 7-seg; 74HC595 segments,
// 2 NPN digit drivers, multiplexed by MCU-LLC (3 SPI-style + 2 digit + 2 button GPIO).
export const ConfigHmi = ({ sec = "HMI", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name="hmi" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 20 × 9: shift register → segment-resistor ladder → display, digit drivers
        below the display, button cluster in its own column at right */}
    <chip name="DISP1" footprint={<Seg2FP />} pinLabels={{ pin1: "SA", pin2: "SB", pin3: "SC", pin4: "SD", pin5: "SE", pin6: "SF", pin7: "SG", pin8: "DP", pin9: "DIG1", pin10: "DIG2" }} pcbX={0} pcbY={0} schX={8.5} schY={0} schSectionName={sec} />
    <chip name="USR1" footprint="soic16" pinLabels={{ pin1: "QB", pin2: "QC", pin3: "QD", pin4: "QE", pin5: "QF", pin6: "QG", pin7: "QH", pin8: "GND", pin9: "QHS", pin10: "SRCLR", pin11: "SRCLK", pin12: "RCLK", pin13: "OE", pin14: "SER", pin15: "QA", pin16: "VCC" }} pcbX={0} pcbY={22} schX={0} schY={0} schSectionName={sec} />
    {Array.from({ length: 8 }, (_, i) => (
      <resistor key={i} name={`RSEG${i}`} resistance="220" footprint="0603" pcbX={32 + i * 5} pcbY={0} schX={4.5} schY={3.5 - i * 1} schSectionName={sec} />
    ))}
    {["1", "2"].map((d, i) => (
      <chip key={d} name={`QDIG${d}`} footprint="sot23" pinLabels={{ pin1: "B", pin2: "E", pin3: "C" }} pcbX={32 + i * 8} pcbY={10} schX={8.5 + i * 2.6} schY={-3.4} schSectionName={sec} />
    ))}
    {["1", "2"].map((d, i) => (
      <resistor key={d} name={`RDIG${d}`} resistance="2.2k" footprint="0603" pcbX={32 + i * 8} pcbY={16} schX={7 + i * 2.6} schY={-4.8} schSectionName={sec} />
    ))}
    {["1", "2"].map((d, i) => (
      <chip key={d} name={`SW${d}`} footprint="pushbutton" pinLabels={{ pin1: "P1", pin2: "P2", pin3: "P3", pin4: "P4" }} pcbX={80 + i * 15} pcbY={0} schX={14.5} schY={1.4 - i * 3.2} schSectionName={sec} />
    ))}
    {["1", "2"].map((d, i) => (
      <resistor key={d} name={`RSW${d}`} resistance="10k" footprint="0603" pcbX={80 + i * 15} pcbY={8} schX={17} schY={2.4 - i * 3.2} schSectionName={sec} />
    ))}
    {/* MR-22: panel-actuated buttons — ESD/bounce cap at the MCU net */}
    {["1", "2"].map((d, i) => (
      <capacitor key={`c${d}`} name={`CSW${d}`} capacitance="100nF" footprint="0603" pcbX={80 + i * 15} pcbY={14} schX={17} schY={0.6 - i * 3.2} schSectionName={sec} />
    ))}
    <trace from=".USR1 > .VCC" to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from=".USR1 > .GND" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".USR1 > .OE" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".USR1 > .SRCLR" to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from=".USR1 > .SER" to="net.HMI_DAT" schDisplayLabel="HMI_DAT" />
    <trace from=".USR1 > .SRCLK" to="net.HMI_CLK" schDisplayLabel="HMI_CLK" />
    <trace from=".USR1 > .RCLK" to="net.HMI_LAT" schDisplayLabel="HMI_LAT" />
    {["QA", "QB", "QC", "QD", "QE", "QF", "QG", "QH"].map((q, i) => (
      <trace key={q} from={`.USR1 > .${q}`} to={`.RSEG${i} > .pin1`} />
    ))}
    {["SA", "SB", "SC", "SD", "SE", "SF", "SG", "DP"].map((sPin, i) => (
      <trace key={sPin} from={`.RSEG${i} > .pin2`} to={`.DISP1 > .${sPin}`} />
    ))}
    <trace from=".QDIG1 > .C" to=".DISP1 > .DIG1" />
    <trace from=".QDIG2 > .C" to=".DISP1 > .DIG2" />
    <trace from=".QDIG1 > .E" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".QDIG2 > .E" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".RDIG1 > .pin1" to="net.HMI_DIG1" schDisplayLabel="HMI_DIG1" />
    <trace from=".RDIG1 > .pin2" to=".QDIG1 > .B" />
    <trace from=".RDIG2 > .pin1" to="net.HMI_DIG2" schDisplayLabel="HMI_DIG2" />
    <trace from=".RDIG2 > .pin2" to=".QDIG2 > .B" />
    <trace from=".SW1 > .P1" to="net.BTN1" schDisplayLabel="BTN1" />
    <trace from=".SW1 > .P3" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".RSW1 > .pin1" to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from=".RSW1 > .pin2" to="net.BTN1" schDisplayLabel="BTN1" />
    <trace from=".SW2 > .P1" to="net.BTN2" schDisplayLabel="BTN2" />
    <trace from=".SW2 > .P3" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".RSW2 > .pin1" to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from=".RSW2 > .pin2" to="net.BTN2" schDisplayLabel="BTN2" />
    <trace from=".CSW1 > .pin1" to="net.BTN1" schDisplayLabel="BTN1" />
    <trace from=".CSW1 > .pin2" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".CSW2 > .pin1" to="net.BTN2" schDisplayLabel="BTN2" />
    <trace from=".CSW2 > .pin2" to="net.DGND" schDisplayLabel="DGND" />
  </group>
);

// ---------- MCU + decoupling + reset — v3: VDDA/VREF+ fed via ferrite + local caps (MR-7);
// BOOT0/SWD nets bound at board level (CB-13). Pin numbers symbolic pending A6 datasheet closure.
export const ControlMcu = ({ id, sec = "CONTROL", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`mcu${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 10 × 16: the LQFP100 symbol is 0.4×10.2 with pins fanning both sides — give it
        a full column; decoupling + reset + VDDA filter parts in a tidy row beneath it */}
    <chip layer={lay} name={`U${id}`} footprint={<Lqfp100 />} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    {[0, 1, 2, 3].map(i => (
      <capacitor layer={lay} key={i} name={`C${id}D${i}`} capacitance="100nF" footprint="0402" pcbX={-9 + i * 6} pcbY={11} schX={-3 + i * 1.6} schY={-6.6} schSectionName={sec} />
    ))}
    <resistor layer={lay} name={`R${id}RST`} resistance="10k" footprint="0402" pcbX={15} pcbY={11} schX={3.6} schY={-6.6} schSectionName={sec} />
    <resistor layer={lay} name={`FB${id}A`} resistance="0" footprint="0805" pcbX={-15} pcbY={11} schX={-3} schY={-8} schSectionName={sec} />
    <capacitor layer={lay} name={`C${id}A1`} capacitance="1uF" footprint="0603" pcbX={-15} pcbY={16} schX={-1.4} schY={-8} schSectionName={sec} />
    <capacitor layer={lay} name={`C${id}A2`} capacitance="100nF" footprint="0402" pcbX={-10} pcbY={16} schX={0.2} schY={-8} schSectionName={sec} />
    {[0, 1, 2, 3].map(i => [
      <trace key={`p${i}`} from={`.C${id}D${i} > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />,
      <trace key={`g${i}`} from={`.C${id}D${i} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />,
    ])}
    <trace from={`.U${id} > .pin11`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.U${id} > .pin10`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.U${id} > .pin27`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.U${id} > .pin26`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.FB${id}A > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.FB${id}A > .pin2`} to={`net.VDDA_${id}`} schDisplayLabel={`VDDA_${id}`} />
    <trace from={`.U${id} > .pin19`} to={`net.VDDA_${id}`} schDisplayLabel={`VDDA_${id}`} />
    <trace from={`.U${id} > .pin20`} to={`net.VDDA_${id}`} schDisplayLabel={`VDDA_${id}`} />
    <trace from={`.C${id}A1 > .pin1`} to={`net.VDDA_${id}`} schDisplayLabel={`VDDA_${id}`} />
    <trace from={`.C${id}A1 > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.C${id}A2 > .pin1`} to={`net.VDDA_${id}`} schDisplayLabel={`VDDA_${id}`} />
    <trace from={`.C${id}A2 > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.R${id}RST > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.R${id}RST > .pin2`} to={`net.NRST_${id}`} schDisplayLabel={`NRST_${id}`} />
    <trace from={`.U${id} > .pin14`} to={`net.NRST_${id}`} schDisplayLabel={`NRST_${id}`} />
  </group>
);

// ---------- board-to-board signal harness (16-way) — power goes via DCP/DCN/PE studs.
// v3: link/enable nets are parameters so the DC-DC side CROSSES TX↔RX (CB-14) and each board
// exports its own MCU enable while receiving the other's (E27). Shield bonded to PE.
export const InterconnectSignals = ({ id, ltx, lrx, enA, enB, sec = "HARNESS", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`ic${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 9 × 5: header left, link series/pull network in two rows at right */}
    <chip layer={lay} name={`JIC${id}`} footprint="pinrow16" pinLabels={{ pin1: "V24A", pin2: "V24B", pin3: "GNDA", pin4: "GNDB", pin5: "V15A", pin6: "V15B", pin7: "LTX", pin8: "LRX", pin9: "EN", pin10: "KILL", pin11: "FPWM", pin12: "FTACH", pin13: "TINL", pin14: "SP1", pin15: "SP2", pin16: "SHLD" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <resistor layer={lay} name={`R${id}LTX`} resistance="10k" footprint="0603" pcbX={30} pcbY={0} schX={5.4} schY={1.4} schSectionName={sec} />
    <resistor layer={lay} name={`R${id}LRX`} resistance="10k" footprint="0603" pcbX={30} pcbY={5} schX={5.4} schY={-1.4} schSectionName={sec} />
    {/* v4: the CB-14 fix note promised series 100 Ω on both link lines — now fitted */}
    <resistor layer={lay} name={`R${id}LTS`} resistance="100" footprint="0603" pcbX={38} pcbY={0} schX={3.4} schY={1.4} schSectionName={sec} />
    <resistor layer={lay} name={`R${id}LRS`} resistance="100" footprint="0603" pcbX={38} pcbY={5} schX={3.4} schY={-1.4} schSectionName={sec} />
    <trace from={`.JIC${id} > .V24A`} to="net.V24" schDisplayLabel="V24" />
    <trace from={`.JIC${id} > .V24B`} to="net.V24" schDisplayLabel="V24" />
    <trace from={`.JIC${id} > .GNDA`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.JIC${id} > .GNDB`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.JIC${id} > .V15A`} to="net.V15" schDisplayLabel="V15" />
    <trace from={`.JIC${id} > .V15B`} to="net.V15" schDisplayLabel="V15" />
    <trace from={`.JIC${id} > .LTX`} to={`.R${id}LTS > .pin1`} />
    <trace from={`.R${id}LTS > .pin2`} to={ltx} schDisplayLabel={ltx.replace("net.", "")} />
    <trace from={`.JIC${id} > .LRX`} to={`.R${id}LRS > .pin1`} />
    <trace from={`.R${id}LRS > .pin2`} to={lrx} schDisplayLabel={lrx.replace("net.", "")} />
    <trace from={`.R${id}LTX > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.R${id}LTX > .pin2`} to={ltx} schDisplayLabel={ltx.replace("net.", "")} />
    <trace from={`.R${id}LRX > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.R${id}LRX > .pin2`} to={lrx} schDisplayLabel={lrx.replace("net.", "")} />
    <trace from={`.JIC${id} > .EN`} to={enA} schDisplayLabel={enA.replace("net.", "")} />
    <trace from={`.JIC${id} > .KILL`} to={enB} schDisplayLabel={enB.replace("net.", "")} />
    {/* MR-14: spares carry extra GND — the 2-pin return was the harness's weakest link at 120 kW */}
    <trace from={`.JIC${id} > .SP1`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.JIC${id} > .SP2`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.JIC${id} > .SHLD`} to="net.PE" schDisplayLabel="PE" />
  </group>
);

// ---------- aux flyback — v4 (E26 rev C / D4 rev C): closes CB-19/CB-20 on top of CB-5/6/7.
//  · fed from the FULL unboosted bus (DCP→DCN): 342 V (285 VAC cold start) … 860 V (OVP corner)
//  · 1700 V SiC switch, **110 W class all SKUs** (Lp 345 µH, Ip clamp 3.2 A via 0.31 Ω CS,
//    65 kHz DCM, Vor ≈ 157 V, ETD34, Np 38 / N24 6 / N15 4 / Naux 4 — D4 rev C; single p/n keeps
//    commonization and covers the 120 kW worst load ≈ 84 W steady with ≥20 % corner margin;
//    DCM proof: t_on 3.2 µs + t_reset 7.0 µs = 10.3 µs < 13.8 µs usable @342 V full load)
//  · CB-19: output rectifiers are 400 V ultrafast (PIV ≈ 160/152/151 V + leakage ring — the
//    100 V Schottkys of rev B avalanche at high bus); MR-17: SMBJ TVS on both rails
//  · controller application = NCP1252A 65 kHz (MR-13): VCC startup Rs, BO divider re-sized for
//    the 1.0 V BO threshold (brown-in ≈ 322 V), aux-winding self-supply, primary-side FB, COMP,
//    RC-filtered CS, primary RCD clamp, gate pulldown on QAUX for the VCC-charge window.
//  · relay-coil PWM hold economization is firmware (halves 24 V steady demand — E26).
export const AuxPower = ({ dcp, dcn, sec = "AUX", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name="aux" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name="UAUX" footprint="soic8" pinLabels={{ pin1: "VIN", pin2: "GND", pin3: "FB", pin4: "COMP", pin5: "CS", pin6: "GATE", pin7: "VCC", pin8: "BR", pin9: "RT" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <chip name="QAUX" footprint="to220" pinLabels={{ pin1: "G", pin2: "D", pin3: "S" }} pcbX={22} pcbY={0} schX={5} schY={-1.2} schSectionName={sec} />
    <resistor name="RAUXCS" resistance="0.31" footprint="1206" pcbX={22} pcbY={8} schX={5} schY={-2.8} schSectionName={sec} />
    <resistor name="RAUXG" resistance="100k" footprint="0603" pcbX={28} pcbY={4} schX={3.2} schY={-2.2} schSectionName={sec} />
    <resistor name="RCSF" resistance="1k" footprint="0603" pcbX={16} pcbY={8} schX={6.8} schY={-2.8} schSectionName={sec} />
    <capacitor name="CCSF" capacitance="470pF" footprint="0603" pcbX={16} pcbY={12} schX={8.4} schY={-3.6} schSectionName={sec} />
    <chip name="TAUX" footprint={<XfmrAuxFP />} pinLabels={{ pin1: "P1", pin2: "P2", pin3: "S24A", pin4: "S24B", pin5: "S15A", pin6: "S15B", pin7: "AXA", pin8: "AXB" }} pcbX={48} pcbY={0} schX={7.5} schY={0.8} schSectionName={sec} />
    <diode name="DAUX24" footprint="smb" pcbX={72} pcbY={0} schX={11} schY={2.4} schSectionName={sec} />
    <diode name="DAUX15" footprint="smb" pcbX={72} pcbY={8} schX={11} schY={0.8} schSectionName={sec} />
    <diode name="DAUXVC" footprint="smb" pcbX={72} pcbY={16} schX={11} schY={-0.8} schSectionName={sec} />
    <capacitor name="CAUX24" capacitance="220uF" footprint={FilmBoxFP(5)} pcbX={84} pcbY={0} schX={13.4} schY={2.4} schSectionName={sec} />
    <capacitor name="CAUX15" capacitance="220uF" footprint={FilmBoxFP(5)} pcbX={84} pcbY={8} schX={13.4} schY={0.8} schSectionName={sec} />
    <capacitor name="CVCC" capacitance="47uF" footprint={FilmBoxFP(5)} pcbX={84} pcbY={16} schX={13.4} schY={-0.8} schSectionName={sec} />
    <diode name="DTVS24" footprint="smb" pcbX={98} pcbY={0} schX={15.8} schY={2.4} schSectionName={sec} />
    <diode name="DTVS15" footprint="smb" pcbX={108} pcbY={0} schX={15.8} schY={0.8} schSectionName={sec} />
    <resistor name="RAUXST1" resistance="470k" footprint="2512" pcbX={0} pcbY={10} schX={-0.9} schY={3.4} schSectionName={sec} />
    <resistor name="RAUXST2" resistance="470k" footprint="2512" pcbX={10} pcbY={10} schX={0.9} schY={3.4} schSectionName={sec} />
    <resistor name="RBR1A" resistance="2.4M" footprint="2512" pcbX={0} pcbY={16} schX={-0.9} schY={-3.4} schSectionName={sec} />
    <resistor name="RBR1B" resistance="2.4M" footprint="2512" pcbX={10} pcbY={16} schX={0.9} schY={-3.4} schSectionName={sec} />
    <resistor name="RBR2" resistance="15k" footprint="0603" pcbX={22} pcbY={16} schX={2.7} schY={-3.4} schSectionName={sec} />
    <resistor name="RFB1" resistance="118k" footprint="0603" pcbX={-10} pcbY={0} schX={-3} schY={1.2} schSectionName={sec} />
    <resistor name="RFB2" resistance="10k" footprint="0603" pcbX={-10} pcbY={5} schX={-3} schY={0} schSectionName={sec} />
    <resistor name="RCOMP" resistance="10k" footprint="0603" pcbX={-10} pcbY={10} schX={-3} schY={-1.2} schSectionName={sec} />
    <capacitor name="CCOMP" capacitance="100nF" footprint="0603" pcbX={-10} pcbY={15} schX={-4.6} schY={-1.2} schSectionName={sec} />
    <diode name="DCLA" footprint="smb" pcbX={76} pcbY={-8} schX={4.5} schY={3.4} schSectionName={sec} />
    <capacitor name="CCLA" capacitance="10nF" footprint={FilmBoxFP(15)} pcbX={94} pcbY={-8} schX={6.3} schY={3.4} schSectionName={sec} />
    <resistor name="RCLA1" resistance="47k" footprint="2512" pcbX={114} pcbY={-8} schX={8.1} schY={3.4} schSectionName={sec} />
    <resistor name="RCLA2" resistance="47k" footprint="2512" pcbX={126} pcbY={-8} schX={9.9} schY={3.4} schSectionName={sec} />
    {/* HV startup: DCP → 2× 470 k → VCC reservoir; aux winding takes over via DAUXVC */}
    <trace from=".RAUXST1 > .pin1" to={dcp} schDisplayLabel={dcp.replace("net.", "")} />
    <trace from=".RAUXST1 > .pin2" to=".RAUXST2 > .pin1" />
    <trace from=".RAUXST2 > .pin2" to=".UAUX > .VCC" />
    <trace from=".CVCC > .pin1" to=".UAUX > .VCC" />
    <trace from=".CVCC > .pin2" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    <trace from=".TAUX > .AXA" to=".DAUXVC > .anode" />
    <trace from=".DAUXVC > .cathode" to=".UAUX > .VCC" />
    <trace from=".TAUX > .AXB" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    {/* controller ground/reference + VIN sense pin parked on VCC rail (IC-internal HV sense unused) */}
    <trace from=".UAUX > .GND" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    <trace from=".UAUX > .VIN" to=".UAUX > .VCC" />
    {/* R3: RT (physical 4) sets the switching frequency and was floating, so the frequency-setting
        element was simply absent — the stage had no defined Fsw. Sized for the 65 kHz DCM design
        point of E26/D4 rev C. VALUE REVIEW: the exact RT for 65 kHz comes off the NCP1252A
        RT-vs-Fsw curve (§K); the component and its net are correct regardless. */}
    <resistor name="RAUXRT" resistance="100k" footprint="0603" pcbX={4} pcbY={22} schX={2} schY={-3} schSectionName={sec} />
    <trace from=".RAUXRT > .pin1" to=".UAUX > .RT" />
    <trace from=".RAUXRT > .pin2" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    {/* brown-in program: full-bus divider → BR (start ≈ 330 V, hysteresis per IC) */}
    <trace from=".RBR1A > .pin1" to={dcp} schDisplayLabel={dcp.replace("net.", "")} />
    <trace from=".RBR1A > .pin2" to=".RBR1B > .pin1" />
    <trace from=".RBR1B > .pin2" to=".UAUX > .BR" />
    <trace from=".RBR2 > .pin1" to=".UAUX > .BR" />
    <trace from=".RBR2 > .pin2" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    {/* primary-side regulation: FB divider from the VCC/aux rail (tracks secondaries); type-II COMP */}
    <trace from=".RFB1 > .pin1" to=".UAUX > .VCC" />
    <trace from=".RFB1 > .pin2" to=".UAUX > .FB" />
    <trace from=".RFB2 > .pin1" to=".UAUX > .FB" />
    <trace from=".RFB2 > .pin2" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    <trace from=".RCOMP > .pin1" to=".UAUX > .COMP" />
    <trace from=".RCOMP > .pin2" to=".UAUX > .FB" />
    <trace from=".CCOMP > .pin1" to=".UAUX > .COMP" />
    <trace from=".CCOMP > .pin2" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    {/* power stage: primary + RCD clamp + gated switch + filtered CS */}
    <trace from=".TAUX > .P1" to={dcp} schDisplayLabel={dcp.replace("net.", "")} />
    <trace from=".QAUX > .D" to=".TAUX > .P2" />
    <trace from=".DCLA > .anode" to=".TAUX > .P2" />
    <trace from=".DCLA > .cathode" to=".CCLA > .pin1" />
    <trace from=".CCLA > .pin2" to={dcp} schDisplayLabel={dcp.replace("net.", "")} />
    <trace from=".RCLA1 > .pin1" to=".CCLA > .pin1" />
    <trace from=".RCLA1 > .pin2" to=".RCLA2 > .pin1" />
    <trace from=".RCLA2 > .pin2" to={dcp} schDisplayLabel={dcp.replace("net.", "")} />
    <trace from=".UAUX > .GATE" to=".QAUX > .G" />
    <trace from=".RAUXG > .pin1" to=".QAUX > .G" />
    <trace from=".RAUXG > .pin2" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    <trace from=".QAUX > .S" to=".RAUXCS > .pin1" />
    <trace from=".RAUXCS > .pin2" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    <trace from=".RCSF > .pin1" to=".RAUXCS > .pin1" />
    <trace from=".RCSF > .pin2" to=".UAUX > .CS" />
    <trace from=".CCSF > .pin1" to=".UAUX > .CS" />
    <trace from=".CCSF > .pin2" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    {/* secondaries */}
    <trace from=".TAUX > .S24A" to=".DAUX24 > .anode" />
    <trace from=".DAUX24 > .cathode" to="net.V24" schDisplayLabel="V24" />
    <trace from=".TAUX > .S24B" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".TAUX > .S15A" to=".DAUX15 > .anode" />
    <trace from=".DAUX15 > .cathode" to="net.V15" schDisplayLabel="V15" />
    <trace from=".TAUX > .S15B" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".CAUX24 > .pin1" to="net.V24" schDisplayLabel="V24" />
    <trace from=".CAUX24 > .pin2" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".CAUX15 > .pin1" to="net.V15" schDisplayLabel="V15" />
    <trace from=".CAUX15 > .pin2" to="net.DGND" schDisplayLabel="DGND" />
    {/* MR-17: rail clamps — a single FB/divider fault otherwise drives V24→30 V+/V15→20 V into
        every coil, fan and bias module. SMBJ26A / SMBJ16A class. */}
    <trace from=".DTVS24 > .cathode" to="net.V24" schDisplayLabel="V24" />
    <trace from=".DTVS24 > .anode" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".DTVS15 > .cathode" to="net.V15" schDisplayLabel="V15" />
    <trace from=".DTVS15 > .anode" to="net.DGND" schDisplayLabel="DGND" />
  </group>
);

// ---------- 3.3 V rail (CB-17/CB-18): 15 V → 3.3 V synchronous buck, one per board.
// Replaces the v3 SOT-223 LDO (2.9–4.1 W linear loss = thermal shutdown; AMS1117 Vin max = 15 V
// was also at/over its operating limit on a 15 V rail). TPS54202-class: FB 0.596 V ref →
// 45.3 k / 10 k = 3.296 V. The DC-DC board previously had NO 3.3 V source at all (CB-17).
export const Rail3V3 = ({ id = "", sec = "AUX", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`r3v3${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip layer={lay} name={`UBK${id}`} footprint="soic8" pinLabels={{ pin1: "VIN", pin2: "GND", pin3: "SW", pin4: "FB", pin5: "EN", pin6: "BST", pin7: "NC1", pin8: "NC2" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <inductor layer={lay} name={`LBK${id}`} inductance="10uH" footprint={FilmBoxFP(10)} pcbX={14} pcbY={0} schX={3} schY={0.6} schSectionName={sec} />
    <capacitor layer={lay} name={`CBKI${id}`} capacitance="10uF" footprint="0805" pcbX={-8} pcbY={4} schX={-2.6} schY={0.8} schSectionName={sec} />
    <capacitor layer={lay} name={`CBKO${id}`} capacitance="22uF" footprint="0805" pcbX={22} pcbY={4} schX={5.4} schY={0.6} schSectionName={sec} />
    <capacitor layer={lay} name={`CBST${id}`} capacitance="100nF" footprint="0603" pcbX={8} pcbY={-6} schX={1.8} schY={1.9} schSectionName={sec} />
    <resistor layer={lay} name={`RBKF1${id}`} resistance="45.3k" footprint="0603" pcbX={14} pcbY={8} schX={3} schY={-1.2} schSectionName={sec} />
    <resistor layer={lay} name={`RBKF2${id}`} resistance="10k" footprint="0603" pcbX={20} pcbY={8} schX={4.6} schY={-1.2} schSectionName={sec} />
    <trace from={`.UBK${id} > .VIN`} to="net.V15" schDisplayLabel="V15" />
    <trace from={`.UBK${id} > .EN`} to="net.V15" schDisplayLabel="V15" />
    <trace from={`.UBK${id} > .GND`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.CBKI${id} > .pin1`} to="net.V15" schDisplayLabel="V15" />
    <trace from={`.CBKI${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.UBK${id} > .SW`} to={`.LBK${id} > .pin1`} />
    <trace from={`.CBST${id} > .pin1`} to={`.UBK${id} > .BST`} />
    <trace from={`.CBST${id} > .pin2`} to={`.UBK${id} > .SW`} />
    <trace from={`.LBK${id} > .pin2`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.CBKO${id} > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.CBKO${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.RBKF1${id} > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.RBKF1${id} > .pin2`} to={`.UBK${id} > .FB`} />
    <trace from={`.RBKF2${id} > .pin1`} to={`.UBK${id} > .FB`} />
    <trace from={`.RBKF2${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
  </group>
);

// ---------- fan header + tach pullup (fan p/n must accept 3.3 V PWM — MR-9, BOM note)
export const FanPort = ({ id, sec = "FANS", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`fan${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name={`JFAN${id}`} footprint="pinrow4" pinLabels={{ pin1: "GND", pin2: "V24", pin3: "TACH", pin4: "PWM" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <resistor name={`RFT${id}`} resistance="10k" footprint="0603" pcbX={12} pcbY={0} schX={2.8} schY={0} schSectionName={sec} />
    <trace from={`.JFAN${id} > .GND`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.JFAN${id} > .V24`} to="net.V24" schDisplayLabel="V24" />
    <trace from={`.JFAN${id} > .TACH`} to={`net.FAN_TACH${id}`} schDisplayLabel={`FAN_TACH${id}`} />
    <trace from={`.JFAN${id} > .PWM`} to={`net.FAN_PWM${id}`} schDisplayLabel={`FAN_PWM${id}`} />
    <trace from={`.RFT${id} > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.RFT${id} > .pin2`} to={`net.FAN_TACH${id}`} schDisplayLabel={`FAN_TACH${id}`} />
  </group>
);

// ---------- isolated CAN 2.0B + CM choke + switchable termination + TVS
export const IsolatedCan = ({ sec = "CAN", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name="canif" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name="UCAN" footprint="soic8" pinLabels={{ pin1: "TXD", pin2: "GND1", pin3: "RXD", pin4: "VDD1", pin5: "VDD2", pin6: "CANL", pin7: "CANH", pin8: "GND2" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <chip name="PSCAN" footprint="pinrow5" pinLabels={{ pin1: "VIN", pin2: "GND", pin3: "P5", pin4: "COM", pin5: "NC" }} pcbX={0} pcbY={10} schX={0} schY={-2.2} schSectionName={sec} />
    <chip name="LCAN" footprint="soic8" pinLabels={{ pin1: "A1", pin2: "A2", pin3: "N1", pin4: "N2", pin5: "N3", pin6: "N4", pin7: "B2", pin8: "B1" }} pcbX={22} pcbY={0} schX={3.6} schY={0} schSectionName={sec} />
    <chip name="JCAN" footprint="pinrow4" pinLabels={{ pin1: "CANH", pin2: "CANL", pin3: "SGND", pin4: "SHLD" }} pcbX={44} pcbY={0} schX={7.6} schY={0} schSectionName={sec} />
    <resistor name="RTERM" resistance="120" footprint="1206" pcbX={32} pcbY={8} schX={5.6} schY={-1.6} schSectionName={sec} />
    <chip name="JTERM" footprint="pinrow2" pinLabels={{ pin1: "P1", pin2: "P2" }} pcbX={32} pcbY={14} schX={3.8} schY={-1.6} schSectionName={sec} />
    <chip name="TVSCAN" footprint="sot23" pinLabels={{ pin1: "A", pin2: "B", pin3: "C" }} pcbX={44} pcbY={8} schX={7.6} schY={-1.6} schSectionName={sec} />
    {/* v4: CGND static bleed — floating CAN domain accumulates charge on unterminated cable */}
    <resistor name="RCGB" resistance="1M" footprint="1206" pcbX={10} pcbY={16} schX={2} schY={-2.2} schSectionName={sec} />
    <capacitor name="CCGB" capacitance="4.7nF" footprint="1206" pcbX={16} pcbY={16} schX={5.6} schY={-2.8} schSectionName={sec} />
    <trace from=".UCAN > .TXD" to="net.CAN_TX" schDisplayLabel="CAN_TX" />
    <trace from=".UCAN > .RXD" to="net.CAN_RX" schDisplayLabel="CAN_RX" />
    <trace from=".UCAN > .VDD1" to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from=".UCAN > .GND1" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".PSCAN > .VIN" to="net.V15" schDisplayLabel="V15" />
    <trace from=".PSCAN > .GND" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".PSCAN > .P5" to=".UCAN > .VDD2" />
    <trace from=".PSCAN > .COM" to="net.CGND" schDisplayLabel="CGND" />
    <trace from=".UCAN > .GND2" to="net.CGND" schDisplayLabel="CGND" />
    <trace from=".UCAN > .CANH" to=".LCAN > .A1" />
    <trace from=".UCAN > .CANL" to=".LCAN > .A2" />
    <trace from=".LCAN > .B1" to=".JCAN > .CANH" />
    <trace from=".LCAN > .B2" to=".JCAN > .CANL" />
    <trace from=".JCAN > .SGND" to="net.CGND" schDisplayLabel="CGND" />
    <trace from=".RTERM > .pin1" to=".JTERM > .P1" />
    <trace from=".JTERM > .P2" to=".LCAN > .B1" />
    <trace from=".RTERM > .pin2" to=".LCAN > .B2" />
    <trace from=".TVSCAN > .A" to=".LCAN > .B1" />
    <trace from=".TVSCAN > .B" to=".LCAN > .B2" />
    <trace from=".TVSCAN > .C" to="net.CGND" schDisplayLabel="CGND" />
    <trace from=".RCGB > .pin1" to="net.CGND" schDisplayLabel="CGND" />
    <trace from=".RCGB > .pin2" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".CCGB > .pin1" to="net.CGND" schDisplayLabel="CGND" />
    <trace from=".CCGB > .pin2" to="net.DGND" schDisplayLabel="DGND" />
  </group>
);

// ---------- output shunt (manganin, Kelvin) + iso amp with floating-side bias.
// v3: OUTN routed too (MR-6 — firmware takes the true differential; PSSH 5 V rail also feeds
// the OV IsoVSense on the output domain).
export const OutputShunt = ({ inn, out, outN, sec = "OUTPUT", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name="oshunt" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name="RSHO" footprint={<ShuntFP />} pinLabels={{ pin1: "A", pin2: "B", pin3: "KA", pin4: "KB" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <chip name="USHO" footprint="soic8" pinLabels={ISOAMP_PINS} pcbX={20} pcbY={0} schX={3.6} schY={0} schSectionName={sec} />
    <chip name="PSSH" footprint="pinrow5" pinLabels={{ pin1: "VIN", pin2: "GND", pin3: "P5", pin4: "COM", pin5: "NC" }} pcbX={20} pcbY={10} schX={3.6} schY={-2.2} schSectionName={sec} />
    <trace from={inn} to=".RSHO > .A" schDisplayLabel={inn.replace("net.", "")} />
    <trace from=".RSHO > .B" to="net.OUTN" schDisplayLabel="OUTN" />
    <trace from=".USHO > .VINP" to=".RSHO > .KA" />
    <trace from=".USHO > .VINN" to=".RSHO > .KB" />
    <trace from=".PSSH > .VIN" to="net.V15" schDisplayLabel="V15" />
    <trace from=".PSSH > .GND" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".PSSH > .P5" to="net.B5OUT" schDisplayLabel="B5OUT" />
    <trace from=".USHO > .VDD1" to="net.B5OUT" schDisplayLabel="B5OUT" />
    <trace from=".PSSH > .COM" to=".USHO > .GND1" />
    <trace from=".USHO > .GND1" to=".RSHO > .KB" />
    <trace from=".USHO > .VDD2" to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from=".USHO > .GND2" to="net.AGND" schDisplayLabel="AGND" />
    <trace from=".USHO > .OUTP" to={out} schDisplayLabel={out.replace("net.", "")} />
    <trace from={outN ? ".USHO > .OUTN" : ".USHO > .OUTN"} to={outN || "net.SNS_IOUTN"} schDisplayLabel="SNS_IOUTN" />
  </group>
);
