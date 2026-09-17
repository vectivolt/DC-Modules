// cells.tsx — the schematic-complete, parameterized cells the AC-DC and DC-DC boards are built
// from: footprints, the Vienna phase, the LLC leg and tank, the filters and banks, the S/P matrix,
// every sense and bias chain, the safety chain, the aux flyback and the card interface. Each cell
// owns its own local decoupling, pull-downs and default-OFF discipline, so a board that
// instantiates it cannot forget them.
// PCB coordinates are a coarse grid only, enough for the build to succeed; schematic completeness
// and BOM accuracy are the deliverable. Frozen electrical values live in docs/assumptions.md.
// Footprint dimensions: VERIFY against the vendor drawing at §40 before release.

// ---------------------------------------------------------------------------------------------
// COURTYARDS. Every custom footprint below carries one, because a pads-only footprint gives
// tscircuit no body to collide: overlap checking against pad extents checks the wrong thing, and
// placement cannot be trusted at all (a TO-247 SiC MOSFET reads as a 10.0 x 2.4 mm extent against
// a real 15.9 x 5.0 mm package). The envelopes are the SAME ones encoded in the generated
// land-pattern names (CAP-TH_L26.5-W11.0-P22.50 states body 26.5 x 11.0 on a 22.5 pitch), so no
// number here is new. Toroid rule: finished OD = core OD + 2x4 mm winding, courtyard = OD + 2 mm.
//
// Pad geometry is deliberately NOT tuned to match. Where a body is much larger than its pad span
// (MOV disc on a 10 mm pitch, fuse holder on 30 mm) the courtyard states the truth and the DRC
// says so -- that is a footprint-pitch question for §40 vendor verification, and silently moving
// pads to hide it would be worse than showing it.
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
  // D1 rev B: holes sized for the 18 mm² flat-Cu flying leads (drill 6.0 / pad 6.9,
  // magnetics §0.1 †).
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={-30} pcbY={-6} holeDiameter="6mm" outerDiameter="6.9mm" shape="circle" />
    <platedhole portHints={["pin2"]} pcbX={30} pcbY={-6} holeDiameter="6mm" outerDiameter="6.9mm" shape="circle" />
    {/* ⌀98 courtyard, not the bare core: the FINISHED D1 measures ⌀92 (30 kW) / ⌀94 (40–50 kW)
        over the banding and the clamp cap. (Whether D1 clears the 62 mm tunnel is a MECHANICAL
        decision — D1 sits outside it — and not a question about this land.) */}
    <courtyardcircle pcbX={0} pcbY={0} radius="49mm" />
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
// D3 rev D cell: P1 P2 SH on the primary edge, SA SB on the secondary edge (≥ reinforced creepage across the body)
export const XfmrCellFP = () => (
  <footprint>
    {["pin1", "pin2", "pin3"].map((h, i) => (
      <platedhole key={h} portHints={[h]} pcbX={-8 + i * 8} pcbY={-20} holeDiameter="2.6mm" outerDiameter="3.6mm" shape="circle" />
    ))}
    {["pin4", "pin5"].map((h, i) => (
      <platedhole key={h} portHints={[h]} pcbX={-6 + i * 12} pcbY={20} holeDiameter="2.6mm" outerDiameter="3.6mm" shape="circle" />
    ))}
    <courtyardrect pcbX={0} pcbY={0} width="78mm" height="72mm" />
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
// relay with an auxiliary contact for weld/readback — coil pair, HV pair, auxiliary pair
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
// output blocking diode: 2-terminal insulated-base module (M5 screw terminals, 34 mm span — MDD/DSEI class)
export const DiodeModFP = () => (
  <footprint>
    <platedhole portHints={["anode", "pin1"]} pcbX={-17} pcbY={0} holeDiameter="5.5mm" outerDiameter="10mm" shape="circle" />
    <platedhole portHints={["cathode", "pin2"]} pcbX={17} pcbY={0} holeDiameter="5.5mm" outerDiameter="10mm" shape="circle" />
    <courtyardrect pcbX={0} pcbY={0} width="94mm" height="36mm" />
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
  // D2 resonant-inductor land: 30 mm lead span, drill 4.44 / pad 5.34 for the litz flying leads
  // (magnetics §0.1 †), 68 × 56 courtyard. VERIFY at §40 against the D2 rev F build (a gapped
  // 2× E70/33/32 set with 15.7–23.6 mm² litz): this envelope and hole size come from a smaller
  // former, so the land is the open item, not the drawing.
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={-15} pcbY={0} holeDiameter="4.44mm" outerDiameter="5.34mm" shape="circle" />
    <platedhole portHints={["pin2"]} pcbX={15} pcbY={0} holeDiameter="4.44mm" outerDiameter="5.34mm" shape="circle" />
    <courtyardrect pcbX={0} pcbY={0} width="68mm" height="56mm" />
    </footprint>
);
export const CtFP = () => (
  // Resonant CT (CT1): a small pass-through window part on its own 10 mm pin row.
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={-5} pcbY={0} holeDiameter="1.1mm" outerDiameter="2mm" shape="circle" />
    <platedhole portHints={["pin2"]} pcbX={5} pcbY={0} holeDiameter="1.1mm" outerDiameter="2mm" shape="circle" />
  
    <courtyardrect pcbX={0} pcbY={0} width="25mm" height="25mm" />
    </footprint>
);
// The LINE CTs are a different part class from the resonant CT and have their OWN land — do not
// put them on CtFP. ACX-1100 is a ⌀42 mm body and the ACX-1150 class is 38.1 × 38.1 mm on a
// 33.0 mm pin row, so CtFP's 10 mm pin row inside a 25 × 25 courtyard fits neither: the burden and
// both clamp diodes would sit under the CT body and the 40/50 kW part would not fit at all.
// One land covers both: 33 mm pin row, ⌀45 courtyard, with CtSensor's measurement row clear of it.
export const CtLineFP = () => (
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={-16.5} pcbY={0} holeDiameter="1.1mm" outerDiameter="2mm" shape="circle" />
    <platedhole portHints={["pin2"]} pcbX={16.5} pcbY={0} holeDiameter="1.1mm" outerDiameter="2mm" shape="circle" />
    <courtyardcircle pcbX={0} pcbY={0} radius="22.5mm" />
  </footprint>
);
// Radial aluminium-can land. CAUX24/CAUX15/CVCC are 220 µF/35 V electrolytics — a ⌀8 × 11.5 mm can
// on a 3.5 mm lead pitch — and belong here, not on a film-box land, whose courtyard is a fraction
// of the real body and hides the collision from DRC. They are the only electrolytics outside the
// DC link, and their BOM line carries the same −40 °C / 105 °C / ≥2000 h grade as the link cans.
export const RadialFP = (pitch = 3.5, dia = 8) => (
  <footprint>
    <platedhole portHints={["pin1"]} pcbX={-pitch / 2} pcbY={0} holeDiameter="0.8mm" outerDiameter="1.8mm" shape="circle" />
    <platedhole portHints={["pin2"]} pcbX={pitch / 2} pcbY={0} holeDiameter="0.8mm" outerDiameter="1.8mm" shape="circle" />
    <courtyardcircle pcbX={0} pcbY={0} radius={`${dia / 2 + 0.5}mm`} />
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
  
    {/* aux flyback land: 35 x 30 body incl. bobbin and clip. VERIFY at §40 — D4 rev E is an
        ETD44, whose bobbin-and-clip envelope is larger than this courtyard. */}
    <courtyardrect pcbX={0} pcbY={0} width="35mm" height="30mm" />
    </footprint>
);

// NSI6611ASC pin map, per the NSI66x1A-Q1 datasheet (rev 1.2, Table 1.1): driver side pins 1-8,
// input side 9-16. Note there is NO separate source-sense pin — GND2 (pin 3) IS the driver-side
// ground and Kelvin reference — and pin 16 is TEST, not a bias return.
const DRV_PINS = { pin1: "ASC", pin2: "DST", pin3: "GND2", pin4: "OUTH", pin5: "VCC2", pin6: "OUTL", pin7: "CLAMP", pin8: "VEE", pin9: "GND1", pin10: "INP", pin11: "INN", pin12: "RDY", pin13: "FLT", pin14: "EN", pin15: "VCC1", pin16: "TEST" };
const ISOAMP_PINS = { pin1: "VDD1", pin2: "VINP", pin3: "VINN", pin4: "GND1", pin5: "GND2", pin6: "OUTN", pin7: "OUTP", pin8: "VDD2" };

// ---------- isolated gate-bias module, **+15 / −3 V**. Not +18 V: the registered second source
// (C3M0021120K class) is rated V_GS −4/+15 V STATIC with a +19 V transient absolute maximum, and
// a real gate loop adds 1–3 V of overshoot on top of the steady level — at 18 V that lands
// straight through the absolute maximum. The vendor short-circuit-withstand classes the DESAT
// budget is graded against are 15 V numbers too, and 15 V cuts Q_g·ΔV by 14 %, which is what the
// bias module's own power margin needs. A packaged module p/n, not a custom transformer, so the
// card is buildable from catalogue parts.
export const BiasModule = ({ id, sec = "DRIVE", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <chip name={`PS${id}`} footprint="pinrow5" pinLabels={{ pin1: "VIN", pin2: "GND", pin3: "P15", pin4: "COM", pin5: "N3" }} pcbX={x} pcbY={y} schX={sx} schY={sy} schSectionName={sec} />
);
// 5 V isolated bias module (iso-amp primary-side supplies; PSCAN/PSSH pattern)
export const Bias5Module = ({ id, p5, com, sec = "SENSE", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`b5${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip layer={lay} name={`PS5${id}`} footprint="pinrow5" pinLabels={{ pin1: "VIN", pin2: "GND", pin3: "P5", pin4: "COM", pin5: "NC" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <trace from={`.PS5${id} > .VIN`} to="net.V15" schDisplayLabel="V15" />
    <trace from={`.PS5${id} > .GND`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.PS5${id} > .P5`} to={p5} schDisplayLabel={p5.replace("net.", "")} />
    <trace from={`.PS5${id} > .COM`} to={com} schDisplayLabel={com.replace("net.", "")} />
    {/* bulk on the floating 5 V — the iso-amps hanging off this module carry only their own
        100 nF, so the 1 µF reservoir lives here at the source. */}
    <capacitor layer={lay} name={`C5B${id}`} capacitance="1uF" footprint="0805" pcbX={8} pcbY={0} schX={2.4} schY={-1} schSectionName={sec} />
    <trace from={`.C5B${id} > .pin1`} to={p5} schDisplayLabel={p5.replace("net.", "")} />
    <trace from={`.C5B${id} > .pin2`} to={com} schDisplayLabel={com.replace("net.", "")} />
  </group>
);

// ---------- one isolated driver channel, fully wired: bias, DESAT (2× 1 kV diodes + blanking),
// split Rg on/off (DPT-frozen), gate pulldown, Kelvin return, PWM/EN/FLT nets. The CLAMP pin is
// tied to the gate so the Miller clamp is active (VERIFY the application circuit against the final
// NSI6611 datasheet); the 10 k PWM pulldown holds the input low through MCU reset; `en` is a
// parameter so each board can feed its own safety chain in.
// Schematic envelope: 13 wide × 6 tall, origin = driver IC centre.
// Logic/PWM enters left, gate network exits right, DESAT chain top-right, bias row below.
export const DriverCh = ({ id, pwm, flt, gate, kelvin, desatNode, rgOn, rgOff, en, cBlank, sec = "DRIVE", x = 0, y = 0, sx = 0, sy = 0, lay = "top" }: any) => (
  <group name={`drv${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* PCB, ordered by the driver's OWN pin geometry (SOIC-16W, body 7.5 x 10.3, pins at x +/-2.15):
        primary pins face LEFT, secondary pins face RIGHT, and everything is placed by which pin it
        serves rather than by what fits.

          x  -8   RGPD    input pull-down, on the primary side with the PWM pin
          x  +6   CB1/CB2 bias decoupling -- 2.9 mm from VCC2/GND2/VEE2. For a SiC gate driver's
                  bias rail, a cap 16 mm away is the same as no cap at all: the loop that supplies
                  the gate charge is this loop.
          x +12   RGON/RGOFF gate resistors, immediately after OUTH/OUTL
          x +18   DESAT blanking cap and its series diodes
          x +30   isolated bias module, the only bulky part, pushed to the far end
        The whole channel is 50 x 16 and sits directly behind its own two switches. */}
    <chip layer={lay} name={`U${id}`} footprint="soic16" pinLabels={DRV_PINS} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <resistor layer={lay} name={`R${id}PD`} resistance="10k" footprint="0603" pcbX={-8} pcbY={0} schX={-2.6} schY={-1.2} schSectionName={sec} />
    {/* VCC1 local bypass — every supply pin on this channel carries one, including the
        primary-side logic rail. */}
    <capacitor layer={lay} name={`C${id}BV`} capacitance="100nF" footprint="0603" pcbX={-8} pcbY={5} schX={-2.6} schY={-2.4} schSectionName={sec} />
    {/* Bias decoupling goes on the OPPOSITE side, directly beneath the driver's secondary pin row
        (pins sit at x +2.15), sized and rotated to STRADDLE the pins they decouple.

        VCC2 and GND2 are 3.81 mm apart, which an 0805's 1.9 mm pad span cannot reach but a 1206's
        2.6 mm span does: rotated 90 deg and centred between them, CB1 lands 0.6 mm from each pad.
        GND2 to VEE is 7.61 mm -- no chip capacitor bridges that -- so CB2 is placed tight to VEE,
        the pin whose loop carries the turn-off current, and its GND2 return goes through copper
        rather than a long trace. Side by side on the top layer they end up 16 mm out, which for a
        SiC driver's bias rail is the same as not fitting them at all. */}
    <capacitor layer="bottom" name={`C${id}B1`} capacitance="1uF" footprint="1206" pcbRotation={270} pcbX={2.6} pcbY={2.54} schX={1.2} schY={-2.5} schSectionName={sec} />
    <capacitor layer="bottom" name={`C${id}B2`} capacitance="1uF" footprint="1206" pcbRotation={270} pcbX={2.6} pcbY={-4.47} schX={2.5} schY={-2.5} schSectionName={sec} />
    <resistor layer={lay} name={`R${id}ON`} resistance={rgOn} footprint="1206" pcbX={7.5} pcbY={1.6} schX={2.6} schY={0.9} schSectionName={sec} />
    <resistor layer={lay} name={`R${id}OFF`} resistance={rgOff} footprint="1206" pcbX={7.5} pcbY={-1.6} schX={2.6} schY={-0.4} schSectionName={sec} />
    <resistor layer={lay} name={`R${id}GS`} resistance="10k" footprint="0805" pcbX={8} pcbY={-5.5} schX={4.2} schY={-0.4} schSectionName={sec} />
    {/* The DESAT blank is PER STAGE and has no safe default: the NSI66x1A worst response
        (blank + 200 ns LEB + 300 ns sense-to-OUT + soft-off) must sit inside 75 % of that
        switch's short-circuit withstand, and the soft-off term 0.6·Q_g/I_STO scales with the dies
        one channel drives. LLC 18 pF → 1.33 µs with the two dies of a 40/50 kW position, inside
        the 1.5 µs line (75 % of a 2 µs withstand), and ZVS turn-on tolerates the short blank;
        the 0.47 µs minimum blank it leaves is just above the 0.4 µs noise floor, which makes the
        ZVS turn-on transient a named EVT bench check. Vienna 47 pF → 2.21 µs against 4.2 µs, with
        ≥ 0.8 µs of blank for its hard turn-on. An IGBT-style 100 pF computes 3.39 µs and is far
        too slow here. The withstand classes are quoted at a 15 V gate, which is what the bias
        module supplies. */}
    <capacitor layer={lay} name={`C${id}BL`} capacitance={cBlank} footprint="0603" pcbX={14} pcbY={-4.5} schX={1.4} schY={1.9} schSectionName={sec} />
    {/* 100 Ω in series with the DESAT pin (standard NSI66x1 practice) — it limits the pin current
        during the switch-node dv/dt kick and the diode-capacitance discharge. The blanking cap
        stays driver-side of it, directly on DST–Kelvin. */}
    <resistor layer={lay} name={`R${id}DS`} resistance="100" footprint="0603" pcbX={10} pcbY={4.5} schX={1.6} schY={2.9} schSectionName={sec} />
    <diode layer={lay} name={`D${id}S1`} footprint="sma" pcbX={16} pcbY={4.5} schX={2.7} schY={2.2} schSectionName={sec} />
    <diode layer={lay} name={`D${id}S2`} footprint="sma" pcbX={24} pcbY={4.5} schX={4.7} schY={2.2} schSectionName={sec} />
    <BiasModule id={id} sec={sec} x={31} y={0} sx={-0.6} sy={-2.6} />
    <trace from={`.U${id} > .VCC1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.U${id} > .GND1`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.C${id}BV > .pin1`} to={`.U${id} > .VCC1`} />
    <trace from={`.C${id}BV > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    {/* input-side ties per datasheet: IN- grounded (non-inverting use) and TEST to GND1. TEST is
        an INPUT-side pin — putting the driver-side bias COM on it crosses the isolation barrier.
        ASC (driver side) ties inactive to GND2/Kelvin. */}
    <trace from={`.U${id} > .INN`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.U${id} > .TEST`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.U${id} > .ASC`} to={kelvin} />
    <trace from={`.U${id} > .INP`} to={pwm} schDisplayLabel={pwm.replace("net.", "")} />
    <trace from={`.R${id}PD > .pin1`} to={pwm} schDisplayLabel={pwm.replace("net.", "")} />
    <trace from={`.R${id}PD > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.U${id} > .EN`} to={en} schDisplayLabel={en.replace("net.", "")} />
    <trace from={`.U${id} > .FLT`} to={flt} schDisplayLabel={flt.replace("net.", "")} />
    {/* RDY (pin 12) is an active-low OPEN-DRAIN power-good and must not be left floating. All
        channels wired-OR onto one per-board DRV_RDY net — the net is low unless EVERY driver's
        secondary bias is up — and the single 10 k pull-up lives in SafetyChain, one per board,
        not one per channel. */}
    <trace from={`.U${id} > .RDY`} to="net.DRV_RDY" schDisplayLabel="DRV_RDY" />
    <trace from={`.PS${id} > .VIN`} to="net.V15" schDisplayLabel="V15" />
    <trace from={`.PS${id} > .GND`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.PS${id} > .P15`} to={`.U${id} > .VCC2`} />
    {/* STRUCTURAL: the bias 0 V, the driver GND2 and the FET Kelvin source are ONE node. Float
        the bias COM on its own net and the gate amplitude and the UVLO have no defined source
        reference at all. */}
    <trace from={`.PS${id} > .COM`} to={kelvin} />
    <trace from={`.U${id} > .GND2`} to={kelvin} />
    <trace from={`.PS${id} > .N3`} to={`.U${id} > .VEE`} />
    <trace from={`.C${id}B1 > .pin1`} to={`.U${id} > .VCC2`} />
    <trace from={`.C${id}B1 > .pin2`} to={kelvin} />
    <trace from={`.C${id}B2 > .pin1`} to={kelvin} maxLength="12mm" />
    <trace from={`.C${id}B2 > .pin2`} to={`.U${id} > .VEE`} />
    <trace from={`.U${id} > .OUTH`} to={`.R${id}ON > .pin1`} />
    <trace from={`.R${id}ON > .pin2`} to={gate} />
    <trace from={`.U${id} > .OUTL`} to={`.R${id}OFF > .pin1`} />
    <trace from={`.R${id}OFF > .pin2`} to={gate} />
    <trace from={`.U${id} > .CLAMP`} to={gate} />
    <trace from={`.R${id}GS > .pin1`} to={gate} />
    <trace from={`.R${id}GS > .pin2`} to={kelvin} />
    <trace from={`.U${id} > .DST`} to={`.R${id}DS > .pin1`} />
    <trace from={`.R${id}DS > .pin2`} to={`.D${id}S1 > .anode`} />
    <trace from={`.D${id}S1 > .cathode`} to={`.D${id}S2 > .anode`} />
    <trace from={`.D${id}S2 > .cathode`} to={desatNode} schDisplayLabel={desatNode.replace("net.", "")} />
    <trace from={`.C${id}BL > .pin1`} to={`.U${id} > .DST`} />
    <trace from={`.C${id}BL > .pin2`} to={kelvin} />
  </group>
);

// ---------- Vienna phase: choke + common-source pair (ONE driver ch) + boost JBS + RC + RCD clamp.
// The per-phase film commutation caps DCP–MID / MID–DCN live INSIDE this cell, at the leg pins
// (§P-1): they are what holds the commutation loop to the inductance the DPT-frozen gate drive
// assumes. The RC snubber resistor is a 3 W pulse-proof part (C·V²·f = 2.84 W per phase at the
// 750 V-class swing and 50 kHz); the clamp bleeder is a 10 W wirewound at 4.3 W worst case.
export const ViennaPhase = ({ id, ac, dcp, dcn, mid, pwm, flt, en, ind = "165uH", mirrorClamp = false, sec = "PFC", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`vp${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* PCB envelope 89 x 163, origin at the cell centre, so three phases tile side by side in
        273 mm. Run the parts out in one line from the choke instead and the cell is 175 mm wide
        and hangs off the board.

        The choke is the whole story: at 89 mm across it is wider than everything else in the cell
        put together, so it sets the cell width and everything else fits underneath it.

          y +50   D1 choke (89 dia)
          y -14   DEVICE RAIL - every TO-247 in one line at 18 mm pitch, which is what §5's
                  ridge needs: a rail is only a rail if the devices share one Y.
          y -34   gate-drive channel, directly behind its two switches
          y -46   commutation films, then snubber and clamp below
        Power flows top-to-bottom inside the cell; the cell as a whole flows left-to-right.

        LAYOUT RULE (DFM, binding on the layout phase): the VIENNA LEG COMMUTATION LOOP —
        C{id}FP/C{id}FN → Q{id}A/Q{id}B → D{id}T/D{id}B and back — must measure **≤ 7 nH**,
        MEASURED AT T-59. Every over-voltage row the decks report (76–79 % of 750 V at 30/40 kW,
        82 % on both 50 kW SKUs, all with the 330 pF snubber) is RUN AT 7 nH; at 20 nH the same
        deck reads 95 %. The loop is a design variable, not a layout preference — which is why the
        films are inside this cell and belong at the leg pins. The mirrored clamp below is
        populated where the measured unclamped polarity needs it. */}
    <inductor name={`L${id}`} inductance={ind} footprint={<ChokeFP />} pcbX={0} pcbY={50} schX={0} schY={0} schSectionName={sec} />
    {/* ONE common-source pair per phase on every SKU — single dies on a ceramic-insulated clip
        mount, 0.8 K/W j→sink. A paralleled second pair is what a 1.9 K/W pad basis would need;
        on the clip mount the thermal grid holds 114 / 116 / 135 °C at 40 / 50 L / 50 A with one
        die per position. */}
    <chip name={`Q${id}A`} footprint={<TO247_4 />} pinLabels={{ pin1: "G", pin2: "D", pin3: "S", pin4: "KS" }} pcbX={-36} pcbY={-14} schX={3} schY={0} schSectionName={sec} />
    <chip name={`Q${id}B`} footprint={<TO247_4 />} pinLabels={{ pin1: "G", pin2: "D", pin3: "S", pin4: "KS" }} pcbX={-18} pcbY={-14} schX={6} schY={0} schSectionName={sec} />
    {/* PER-DIE de-Q: each die of the common-source pair sits behind its OWN 1 Ω gate resistor.
        Tie the two 5–6 nF C_iss gates straight onto net.G_{id} and they form an undamped LC loop
        at 50–200 MHz through the package lead inductance — and the DPT models one device, so no
        simulation covers the V_GS overshoot that loop can put against the +19 V transient
        maximum. Same practice LlcHalfBridgeLeg applies to its paralleled positions. ₹1.2/module. */}
    <resistor name={`RG${id}A1`} resistance="1" footprint="0805" pcbX={-44} pcbY={-26} schX={2} schY={0.9} schSectionName={sec} />
    <resistor name={`RG${id}B1`} resistance="1" footprint="0805" pcbX={-26} pcbY={-26} schX={5} schY={0.9} schSectionName={sec} />
    <DriverCh id={`${id}G`} cBlank="47pF" pwm={pwm} flt={flt} en={en} gate={`net.G_${id}`} kelvin={`net.KS_${id}`} desatNode={`net.PH${id}`} rgOn="4.7" rgOff="4.7" sec={sec} x={-20} y={-30} sx={4.5} sy={-6.5} />
    <diode name={`D${id}T`} footprint={<TO247_2 />} pcbX={0} pcbY={-14} schX={9.5} schY={1.4} schSectionName={sec} />
    <diode name={`D${id}B`} footprint={<TO247_2 />} pcbX={18} pcbY={-14} schX={9.5} schY={-1.4} schSectionName={sec} />
    <capacitor name={`C${id}FP`} capacitance="1uF" footprint={FilmBoxFP(22.5)} pcbX={-30} pcbY={-2} schX={12.5} schY={1.4} schSectionName={sec} />
    <capacitor name={`C${id}FN`} capacitance="1uF" footprint={FilmBoxFP(22.5)} pcbX={2} pcbY={-2} schX={12.5} schY={-1.4} schSectionName={sec} />
    <resistor name={`R${id}SN`} resistance="10" footprint="2512" pcbX={26} pcbY={-24} schX={15.5} schY={0.7} schSectionName={sec} />
    {/* 330 pF is the value a SINGLE-polarity clamp needs. At 100 pF the unclamped half-cycle
        reaches 78 % of 750 V at 30 kW and 85–89 % at 50 kW; 330 pF costs +6 W of CV²f across the
        module and buys that margin back without adding a second clamp stage. */}
    <capacitor name={`C${id}SN`} capacitance="330pF" footprint="1812" pcbX={26} pcbY={-31} schX={15.5} schY={-0.7} schSectionName={sec} />
    <diode name={`D${id}C`} footprint={<TO247_2 />} pcbX={36} pcbY={-14} schX={18.5} schY={1.4} schSectionName={sec} />
    <capacitor name={`C${id}C`} capacitance="100nF" footprint={FilmBoxFP(5)} pcbX={40} pcbY={-24} schX={18.5} schY={-1.4} schSectionName={sec} />
    <chip name={`R${id}C`} footprint={FilmBoxFP(54, [48, 8])} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={2} pcbY={-48} schX={21.5} schY={0} schSectionName={sec} />
    {/* MIRRORED RCD CLAMP. The main clamp is single-polarity — PH → D{id}C → C{id}C → DCP — so it
        catches the positive half-cycle only. On the negative half-cycle PH swings BELOW DCN with
        nothing to catch it, and the DPT at the real currents reads that polarity at 81–92 % of
        750 V on a 10 nH loop against 71–78 % clamped. The mirror is the same network reflected to
        the lower rail: DCN → D{id}CM → C{id}CM, bled by R{id}CM.
        The LAND IS ON EVERY SKU (one PCB); population is per SKU and lives in parts-db's
        MIRROR_CLAMP table — POPULATED on 50 kW liquid and air, DNP at 30/40 kW — carried as
        qtyMul so the BOM tells the truth. */}
    {mirrorClamp ? [
      <diode key="dcm" name={`D${id}CM`} footprint={<TO247_2 />} pcbX={54} pcbY={-14} schX={18.5} schY={-3.2} schSectionName={sec} />,
      <capacitor key="ccm" name={`C${id}CM`} capacitance="100nF" footprint={FilmBoxFP(5)} pcbX={58} pcbY={-24} schX={18.5} schY={-4.6} schSectionName={sec} />,
      <chip key="rcm" name={`R${id}CM`} footprint={FilmBoxFP(54, [48, 8])} pinLabels={{ pin1: "A", pin2: "B" }} pcbX={2} pcbY={-60} schX={21.5} schY={-3.9} schSectionName={sec} />,
      <trace key="t1" from={`.D${id}CM > .cathode`} to={`net.PH${id}`} />,
      <trace key="t2" from={`.D${id}CM > .anode`} to={`.C${id}CM > .pin1`} />,
      <trace key="t3" from={`.C${id}CM > .pin2`} to={dcn} schDisplayLabel={dcn.replace("net.", "")} />,
      <trace key="t4" from={`.R${id}CM > .A`} to={`.C${id}CM > .pin1`} />,
      <trace key="t5" from={`.R${id}CM > .B`} to={dcn} schDisplayLabel={dcn.replace("net.", "")} />,
    ] : null}
    <trace from={ac} to={`.L${id} > .pin1`} schDisplayLabel={ac.replace("net.", "")} />
    <trace from={`.L${id} > .pin2`} to={`net.PH${id}`} />
    <trace from={`.Q${id}A > .D`} to={`net.PH${id}`} />
    <trace from={`.RG${id}A1 > .pin1`} to={`net.G_${id}`} />
    <trace from={`.RG${id}A1 > .pin2`} to={`.Q${id}A > .G`} />
    <trace from={`.Q${id}A > .KS`} to={`net.KS_${id}`} />
    <trace from={`.Q${id}A > .S`} to={`.Q${id}B > .S`} />
    <trace from={`.Q${id}B > .KS`} to={`net.KS_${id}`} />
    <trace from={`.RG${id}B1 > .pin1`} to={`net.G_${id}`} />
    <trace from={`.RG${id}B1 > .pin2`} to={`.Q${id}B > .G`} />
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

// ---------- LLC half-bridge leg: 2 FETs (or 2 paralleled positions) + 2 driver channels.
// There are NO node-to-ground RC snubbers here: a ZVS topology needs none, and CV²f at 140 kHz is
// untenable (≈45 W for 470 pF at 830 V). Ringing is contained by the DPT-frozen gate drive, the
// per-die drain-source C_s below and the ≤ 5 nH bridge loop (§P-2).
export const LlcHalfBridgeLeg = ({ id, bus, gnd, sw, pwmH, pwmL, flt, en, par = 1, snub = "470pF", sec = "LLC", x = 0, y = 0, sx = 0, sy = 0 }: any) => {
  // `par` dies per position: the paralleled devices SHARE the one driver channel — a per-device
  // 2.2 Ω gate resistor off the shared gate net, a shared Kelvin, and DESAT watching the common
  // drain node. Same practice as the Vienna pair's per-die gate resistors.
  const np = par === true ? 2 : Number(par) || 1, extra = Array.from({ length: np - 1 }, (_, k) => k + 2);
  return (
  <group name={`leg${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 24 × 15: half-bridge devices stacked at right, the two driver channels in two clean rows to the left (H above L).

        LAYOUT RULE (DFM, binding on the layout phase): the LLC BRIDGE COMMUTATION LOOP —
        entry film bank → Q{id}H → Q{id}L → back — must measure **≤ 5 nH, MEASURED AT T-59**:
        laminated board-to-board bus, and the CF# bridge films AT THE PACKAGE PINS, not on a stub.
        The DPT rows that justify R_g,off = 0 Ω and the per-die C_s are RUN AT 5 nH, and C_s's own
        loop inductance subtracts directly from its effect — a snubber on a stub is not one.

        CM RULE (DFM, binding, T-13 measures): LLC LEG-NODE-TO-PE CAPACITANCE ≤ 100 pF TOTAL,
        design target 50 pF. The leg nodes swing 830 V at 83–203 kHz, so every picofarad from them
        to earth is current in the CISPR measurement and in the Y-capacitor balance — the LLC
        bridge is counted as a CM source, and the driver island moves ~3.5 A per transition.
        Build rule: a SHIELDED thermal interface under the LLC dies — a copper shield layer on the
        Al2O3 pad, RETURNED TO DCN, not to the heatsink — and the leg nodes on the smallest tab
        area that carries the current. An unshielded pad under four TO-247 tabs is the single
        largest leg-to-PE capacitance in the module. */}
    <chip name={`Q${id}H`} footprint={<TO247_4 />} pinLabels={{ pin1: "G", pin2: "D", pin3: "S", pin4: "KS" }} pcbX={0} pcbY={0} schX={17} schY={1.4} schSectionName={sec} />
    <chip name={`Q${id}L`} footprint={<TO247_4 />} pinLabels={{ pin1: "G", pin2: "D", pin3: "S", pin4: "KS" }} pcbX={18} pcbY={0} schX={17} schY={-5.6} schSectionName={sec} />
    {extra.map((k) => [
      <chip key={`h${k}`} name={`Q${id}H${k}`} footprint={<TO247_4 />} pinLabels={{ pin1: "G", pin2: "D", pin3: "S", pin4: "KS" }} pcbX={0} pcbY={9 * (k - 1)} schX={17 + 3 * (k - 1)} schY={1.4} schSectionName={sec} />,
      <chip key={`l${k}`} name={`Q${id}L${k}`} footprint={<TO247_4 />} pinLabels={{ pin1: "G", pin2: "D", pin3: "S", pin4: "KS" }} pcbX={18} pcbY={9 * (k - 1)} schX={17 + 3 * (k - 1)} schY={-5.6} schSectionName={sec} />,
      <resistor key={`rh${k}`} name={`RG${id}H${k}`} resistance="2.2" footprint="0805" pcbX={-8} pcbY={9 * (k - 1)} schX={16 + 3 * (k - 1)} schY={0.4} schSectionName={sec} />,
      <resistor key={`rl${k}`} name={`RG${id}L${k}`} resistance="2.2" footprint="0805" pcbX={10} pcbY={9 * (k - 1)} schX={16 + 3 * (k - 1)} schY={-6.6} schSectionName={sec} />,
      <capacitor key={`ch${k}`} name={`C${id}HOS${k}`} capacitance={snub} footprint="1206" pcbX={4} pcbY={9 * (k - 1) + 4} schX={19 + 3 * (k - 1)} schY={2.4} schSectionName={sec} />,
      <capacitor key={`cl${k}`} name={`C${id}LOS${k}`} capacitance={snub} footprint="1206" pcbX={22} pcbY={9 * (k - 1) + 4} schX={19 + 3 * (k - 1)} schY={-4.6} schSectionName={sec} />,
      <trace key={`ch${k}a`} from={`.C${id}HOS${k} > .pin1`} to={`.Q${id}H${k} > .D`} />,
      <trace key={`ch${k}b`} from={`.C${id}HOS${k} > .pin2`} to={`.Q${id}H${k} > .S`} />,
      <trace key={`cl${k}a`} from={`.C${id}LOS${k} > .pin1`} to={`.Q${id}L${k} > .D`} />,
      <trace key={`cl${k}b`} from={`.C${id}LOS${k} > .pin2`} to={`.Q${id}L${k} > .S`} />,
      <trace key={`h${k}g`} from={`.RG${id}H${k} > .pin1`} to={`net.GH_${id}`} />,
      <trace key={`h${k}g2`} from={`.RG${id}H${k} > .pin2`} to={`.Q${id}H${k} > .G`} />,
      <trace key={`h${k}d`} from={`.Q${id}H${k} > .D`} to={bus} schDisplayLabel={bus.replace("net.", "")} />,
      <trace key={`h${k}s`} from={`.Q${id}H${k} > .S`} to={sw} schDisplayLabel={sw.replace("net.", "")} />,
      <trace key={`h${k}k`} from={`.Q${id}H${k} > .KS`} to={`net.KH_${id}`} />,
      <trace key={`l${k}g`} from={`.RG${id}L${k} > .pin1`} to={`net.GL_${id}`} />,
      <trace key={`l${k}g2`} from={`.RG${id}L${k} > .pin2`} to={`.Q${id}L${k} > .G`} />,
      <trace key={`l${k}d`} from={`.Q${id}L${k} > .D`} to={sw} schDisplayLabel={sw.replace("net.", "")} />,
      <trace key={`l${k}s`} from={`.Q${id}L${k} > .S`} to={gnd} schDisplayLabel={gnd.replace("net.", "")} />,
      <trace key={`l${k}k`} from={`.Q${id}L${k} > .KS`} to={`net.KL_${id}`} />,
    ])}
    {/* a matching 2.2 Ω on the FIRST device of each paralleled position too — every die in a
        paralleled position must see the same gate impedance (see ViennaPhase) */}
    {np > 1 ? <resistor name={`RG${id}H1`} resistance="2.2" footprint="0805" pcbX={-8} pcbY={0} schX={16} schY={0.4} schSectionName={sec} /> : null}
    {np > 1 ? <resistor name={`RG${id}L1`} resistance="2.2" footprint="0805" pcbX={26} pcbY={0} schX={16} schY={-6.6} schSectionName={sec} /> : null}
    {/* TURN-OFF SNUBBER: ONE 1 kV C0G 1206 drain–source at the PACKAGE PINS of every die. Without
        it (2.2 Ω off-gate, no C_s) the channel runs k_off 13–15 nJ/(V·A) — 1.43× the datasheet —
        and drives the 30 kW SER-250 die to 211–248 °C. With C_s fitted and R_g,off = 0 Ω the
        turn-off loss collapses 8–20× and V_ds,pk drops 84 → 77 %, because C_s is a SNUBBER and not
        only a soft-switching aid. Its own loop inductance subtracts directly from that effect, so
        "at the package pins" is the spec, not a layout preference. C_s is bounded ABOVE by the
        ZVS budget at PS150-Imax (t_dead = n_die·(Q_oss + C_s·V)/I_toff) and by the L_loop–C_s ring
        above ~2.2 nF — the per-SKU value comes from tanks.mjs `cs`, which verify-independent
        mirrors as a [SYNC] check so a tank change cannot drift it. Duty is trivial: I_rms ≈ 0.6 A,
        ≈11 mW per part, and in ZVS the stored charge is recovered (no CV²f term). */}
    <capacitor name={`C${id}HOS1`} capacitance={snub} footprint="1206" pcbX={4} pcbY={4} schX={19} schY={2.4} schSectionName={sec} />
    <capacitor name={`C${id}LOS1`} capacitance={snub} footprint="1206" pcbX={22} pcbY={4} schX={19} schY={-4.6} schSectionName={sec} />
    <trace from={`.C${id}HOS1 > .pin1`} to={`.Q${id}H > .D`} />
    <trace from={`.C${id}HOS1 > .pin2`} to={`.Q${id}H > .S`} />
    <trace from={`.C${id}LOS1 > .pin1`} to={`.Q${id}L > .D`} />
    <trace from={`.C${id}LOS1 > .pin2`} to={`.Q${id}L > .S`} />
    {/* R_g,off = 0 Ω on the LLC channels: OUTL goes straight to the gate and the driver's own
        R_OL 0.3 Ω is the whole off-path. It is only safe WITH C_s fitted — bare, 0 Ω pushes the
        un-snubbed peak 71 → 77 % and the gate undershoot to −5.6…−6.7 V against the −8 V transient
        maximum, while with C_s it is strictly better on every axis (69/76/77 % of 1200 V,
        undershoot −5.4 V). The 1206 land stays so a bench re-fit can put a resistor back. */}
    <DriverCh id={`${id}H`} cBlank="18pF" pwm={pwmH} flt={flt} en={en} gate={`net.GH_${id}`} kelvin={`net.KH_${id}`} desatNode={bus} rgOn="4.7" rgOff="0" sec={sec} x={0} y={16} sx={4.5} sy={1.4} />
    <DriverCh id={`${id}L`} cBlank="18pF" pwm={pwmL} flt={flt} en={en} gate={`net.GL_${id}`} kelvin={`net.KL_${id}`} desatNode={sw} rgOn="4.7" rgOff="0" sec={sec} x={54} y={16} sx={4.5} sy={-5.6} />
    <trace from={`.Q${id}H > .D`} to={bus} schDisplayLabel={bus.replace("net.", "")} />
    <trace from={`.Q${id}H > .S`} to={sw} schDisplayLabel={sw.replace("net.", "")} />
    {np > 1 ? [
      <trace key="h1a" from={`.RG${id}H1 > .pin1`} to={`net.GH_${id}`} />,
      <trace key="h1b" from={`.RG${id}H1 > .pin2`} to={`.Q${id}H > .G`} />,
    ] : <trace from={`.Q${id}H > .G`} to={`net.GH_${id}`} />}
    <trace from={`.Q${id}H > .KS`} to={`net.KH_${id}`} />
    <trace from={`.Q${id}L > .D`} to={sw} schDisplayLabel={sw.replace("net.", "")} />
    <trace from={`.Q${id}L > .S`} to={gnd} schDisplayLabel={gnd.replace("net.", "")} />
    {np > 1 ? [
      <trace key="l1a" from={`.RG${id}L1 > .pin1`} to={`net.GL_${id}`} />,
      <trace key="l1b" from={`.RG${id}L1 > .pin2`} to={`.Q${id}L > .G`} />,
    ] : <trace from={`.Q${id}L > .G`} to={`net.GL_${id}`} />}
    <trace from={`.Q${id}L > .KS`} to={`net.KL_${id}`} />
    <trace from={`net.KH_${id}`} to={sw} schDisplayLabel={sw.replace("net.", "")} />
    <trace from={`net.KL_${id}`} to={gnd} schDisplayLabel={gnd.replace("net.", "")} />
  </group>
  );
};

// ---------- full-bridge LLC tank: Cr bank → external Lr → two series-primary transformer cells →
// one SiC rectifier bridge per bank. The resonant CT's return and burden are biased to AVMID
// (VREF/2) because the tank current is bipolar; a series R and dual clamp protect the ADC net.
export const LlcTank = ({ crN = 9, crVal = "33nF", lr = "4.07uH", ctBurden = "0.36", dPar = 2, swA, swB, rAp, bkAn, rBp, bkBn, ctOut, vh = "net.F11_VH", vl = "net.F11_VL", flt = "net.FLT", shield = "net.DCN", sec = "TANK", x = 0, y = 0, sx = 0, sy = 0 }: any) => {
  const pos = [1, 2, 3, 4], par = Array.from({ length: dPar }, (_, k) => (k ? `P${k + 1}` : ""));
  return (
  <group name="tank" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 26 × 12: tank L→R (Cr bank → Lr → T1A + T1B → rectifier bridges), resonant-CT measurement chain on its own row.
        ONE bridge (legs SWA/SWB) drives the whole tank. The transformer is two identical E70-stack cells with primaries in
        SERIES (D3 rev D) because the one-bridge copper does not fit a single E70 window and nothing taller fits the tunnel;
        each cell's secondary (S1 ∥ S2 halves around its primary) feeds one bank. */}
    {Array.from({ length: crN }, (_, i) => (
      <capacitor key={i} name={`C1R${i}`} capacitance={crVal} footprint={FilmBoxFP(27.5)} pcbX={(i % 2) * 36 - 18} pcbY={-Math.floor(i / 2) * 16} schX={(i % 3) * 1.5 - 1.5} schY={3 - Math.floor(i / 3) * 1.4} schSectionName={sec} />
    ))}
    <inductor name="L1R" inductance={lr} footprint={<TrimFP />} pcbX={0} pcbY={-100} schX={3.5} schY={3} schSectionName={sec} />
    <chip name="T1A" footprint={<XfmrCellFP />} pinLabels={{ pin1: "P1", pin2: "P2", pin3: "SH", pin4: "SA", pin5: "SB" }} pcbX={-40} pcbY={-152} schX={7} schY={2} schSectionName={sec} />
    <chip name="T1B" footprint={<XfmrCellFP />} pinLabels={{ pin1: "P1", pin2: "P2", pin3: "SH", pin4: "SA", pin5: "SB" }} pcbX={40} pcbY={-152} schX={7} schY={-1.8} schSectionName={sec} />
    {["A", "B"].flatMap((bk, j) => pos.flatMap((p) => par.map((q, k) => (
      <diode key={`${bk}${p}${q}`} name={`D1${bk}${p}${q}`} footprint={<TO247_2 />} pcbX={-27 + (p - 1) * 18} pcbY={-196 - (j * dPar + k) * 22} schX={11 + (p - 1) * 2.4} schY={j ? -1 - k * 1.2 : 3 - k * 1.2} schSectionName={sec} />
    ))))}
    {/* measurement row: CT → burden → RC filter → clamps.
        F.11 = 140/180/220 A pk at 30/40/50 kW (1.2× the power-solved worst tank peak, the PSM-at-f_max 764 V-bus corner)
        on a 0.47/0.36/0.30 Ω burden — the post-short race reaches 328/417/503 A 3 µs after the bank collapse, and the
        burden is sized so that monitor peak still lands on the ADC rail (current-coordination gates it). */}
    <chip name="CT1" footprint={<CtFP />} pinLabels={{ pin1: "S1", pin2: "S2" }} pcbX={0} pcbY={-52} schX={0} schY={-6} schSectionName={sec} />
    <resistor name="R1CT" resistance={ctBurden} footprint="2512" pcbX={34} pcbY={-44} schX={2.6} schY={-6} schSectionName={sec} />
    <resistor name="R1CF" resistance="1k" footprint="0603" pcbX={34} pcbY={-54} schX={4.6} schY={-6} schSectionName={sec} />
    <capacitor name="C1CF" capacitance="220pF" footprint="0603" pcbX={34} pcbY={-64} schX={6.6} schY={-7} schSectionName={sec} />
    <diode name="D1CP" footprint="sod323" pcbX={46} pcbY={-44} schX={7.2} schY={-5.2} schSectionName={sec} />
    <diode name="D1CN" footprint="sod323" pcbX={46} pcbY={-54} schX={9.6} schY={-5.2} schSectionName={sec} />
    {/* F.11 WINDOW COMPARATOR, BOTH POLARITIES: an internal rectifier short can drive the tank current NEGATIVE first, and
        a single positive threshold then fires late. Dual 40 ns comparator: A trips above F11_VH, B below F11_VL; push-pull
        outputs diode-OR (BAT54A common anode) onto the FLT wire-OR = HRTIMER_FLT2 — a hardware kill of every output in
        < 1 µs that needs no MCU comparator pin (the on-chip CMP path stays as the secondary). */}
    <chip name="U1W" footprint="soic8" pinLabels={{ pin1: "OUTA", pin2: "INAN", pin3: "INAP", pin4: "GND", pin5: "INBP", pin6: "INBN", pin7: "OUTB", pin8: "VCC" }} pcbX={58} pcbY={-49} schX={13} schY={-6.2} schSectionName={sec} />
    <chip name="D1W" footprint="sot23" pinLabels={{ pin1: "K1", pin2: "K2", pin3: "A" }} pcbX={68} pcbY={-49} schX={17} schY={-5.8} schSectionName={sec} />
    <capacitor name="C1WB" capacitance="100nF" footprint="0603" pcbX={58} pcbY={-58} schX={13} schY={-8.4} schSectionName={sec} />
    {/* AVMID needs its OWN bypass on this board. The 1:100 resonant CT's secondary return AND its
        burden return both land on AVMID — 0.46 A rms at full tank load, 1.4–2.2 A pk at the F.11
        trip — while the card's CAVO 10 µF reservoir is two connectors and ≈100 nH away (88 Ω at
        140 kHz). 8.8 mΩ between the two returns injects 4 mV rms onto the reference that ALSO
        biases the three line CTs on the other board = 0.45 A of apparent line current; and since
        the F.11 thresholds are ratiometric from V3P3 while the signal is referenced to AVMID, any
        AVMID movement is a direct threshold error.
        Layout rule: CT return and burden return adjacent, this cap between them. */}
    <capacitor name="C1AVM" capacitance="1uF" footprint="0805" pcbX={40} pcbY={-64} schX={4.6} schY={-7} schSectionName={sec} />
    <trace from=".C1AVM > .pin1" to="net.AVMID" schDisplayLabel="AVMID" />
    <trace from=".C1AVM > .pin2" to="net.AGND" schDisplayLabel="AGND" />
    {/* The TLV3202 class has NO internal hysteresis, and F.11 is a latched HARDWARE kill of every
        PWM output, so chatter is not survivable. 1 MΩ positive feedback from each output to its
        own + input gives 3.3 × R_thev/1 M = 4.6 mV ≈ 1 A of primary current against a
        140/180/220 A threshold: enough to stop chatter when I_RES1 dwells on the threshold,
        negligible against the trip itself. */}
    <resistor name="R1WHA" resistance="1M" footprint="0805" pcbX={66} pcbY={-42} schX={15} schY={-4.6} schSectionName={sec} />
    <resistor name="R1WHB" resistance="1M" footprint="0805" pcbX={66} pcbY={-56} schX={15} schY={-7.8} schSectionName={sec} />
    <trace from=".R1WHA > .pin1" to=".U1W > .OUTA" />
    <trace from=".R1WHA > .pin2" to=".U1W > .INAP" />
    <trace from=".R1WHB > .pin1" to=".U1W > .OUTB" />
    <trace from=".R1WHB > .pin2" to=".U1W > .INBP" />
    <trace from=".U1W > .INAN" to={ctOut} schDisplayLabel={ctOut.replace("net.", "")} />
    <trace from=".U1W > .INAP" to={vh} schDisplayLabel={vh.replace("net.", "")} />
    <trace from=".U1W > .INBP" to={ctOut} schDisplayLabel={ctOut.replace("net.", "")} />
    <trace from=".U1W > .INBN" to={vl} schDisplayLabel={vl.replace("net.", "")} />
    <trace from=".U1W > .OUTA" to=".D1W > .K1" />
    <trace from=".U1W > .OUTB" to=".D1W > .K2" />
    <trace from=".D1W > .A" to={flt} schDisplayLabel={flt.replace("net.", "")} />
    <trace from=".U1W > .VCC" to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from=".U1W > .GND" to="net.AGND" schDisplayLabel="AGND" />
    <trace from=".C1WB > .pin1" to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from=".C1WB > .pin2" to="net.AGND" schDisplayLabel="AGND" />
    {Array.from({ length: crN }, (_, i) => [
      <trace key={`a${i}`} from={swA} to={`.C1R${i} > .pin1`} schDisplayLabel={swA.replace("net.", "")} />,
      <trace key={`b${i}`} from={`.C1R${i} > .pin2`} to=".L1R > .pin1" />,
    ])}
    <trace from=".L1R > .pin2" to=".T1A > .P1" />
    <trace from=".T1A > .P2" to=".T1B > .P1" />
    <trace from=".T1B > .P2" to={swB} schDisplayLabel={swB.replace("net.", "")} />
    {/* each cell's P–S electrostatic shield returns to an HF-stiff PRIMARY rail (DCN, decoupled by the DC link) */}
    <trace from=".T1A > .SH" to={shield} schDisplayLabel={shield.replace("net.", "")} />
    <trace from=".T1B > .SH" to={shield} schDisplayLabel={shield.replace("net.", "")} />
    <trace from=".CT1 > .S1" to="net.CTB1" />
    <trace from=".CT1 > .S2" to="net.AVMID" schDisplayLabel="AVMID" />
    <trace from=".R1CT > .pin1" to="net.CTB1" />
    <trace from=".R1CT > .pin2" to="net.AVMID" schDisplayLabel="AVMID" />
    <trace from=".R1CF > .pin1" to="net.CTB1" />
    <trace from=".R1CF > .pin2" to={ctOut} schDisplayLabel={ctOut.replace("net.", "")} />
    <trace from=".C1CF > .pin1" to={ctOut} schDisplayLabel={ctOut.replace("net.", "")} />
    <trace from=".C1CF > .pin2" to="net.AVMID" schDisplayLabel="AVMID" />
    <trace from=".D1CP > .anode" to={ctOut} schDisplayLabel={ctOut.replace("net.", "")} />
    <trace from=".D1CP > .cathode" to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from=".D1CN > .anode" to="net.AGND" schDisplayLabel="AGND" />
    <trace from=".D1CN > .cathode" to={ctOut} schDisplayLabel={ctOut.replace("net.", "")} />
    {/* Each rectifier bridge feeds its bank node, with BankFilter's film bank straight across it: one bridge gives no
        interleave cancellation, so each bank carries the full 30/39/49 A rms at 2·fsw (ngspice) and the film is what
        takes it. */}
    {[["A", "T1A", rAp, bkAn], ["B", "T1B", rBp, bkBn]].flatMap(([bk, t, bp, bn]) => par.flatMap((q) => [
      <trace key={`${bk}1a${q}`} from={`.D1${bk}1${q} > .anode`} to={`.${t} > .SA`} />,
      <trace key={`${bk}1c${q}`} from={`.D1${bk}1${q} > .cathode`} to={bp} schDisplayLabel={bp.replace("net.", "")} />,
      <trace key={`${bk}2c${q}`} from={`.D1${bk}2${q} > .cathode`} to={`.${t} > .SA`} />,
      <trace key={`${bk}2a${q}`} from={`.D1${bk}2${q} > .anode`} to={bn} schDisplayLabel={bn.replace("net.", "")} />,
      <trace key={`${bk}3a${q}`} from={`.D1${bk}3${q} > .anode`} to={`.${t} > .SB`} />,
      <trace key={`${bk}3c${q}`} from={`.D1${bk}3${q} > .cathode`} to={bp} schDisplayLabel={bp.replace("net.", "")} />,
      <trace key={`${bk}4c${q}`} from={`.D1${bk}4${q} > .cathode`} to={`.${t} > .SB`} />,
      <trace key={`${bk}4a${q}`} from={`.D1${bk}4${q} > .anode`} to={bn} schDisplayLabel={bn.replace("net.", "")} />,
    ]))}
  </group>
  );
};

// ---------- split DC link
export const SplitDcLink = ({ id = "", nPerHalf, dcp, dcn, mid, bal = true, sec = "DCLINK", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`dclink${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope (2·n + 6) × 6: top half-bank row above the midpoint, bottom row below,
        balance dividers in their own column at right. */}
    {Array.from({ length: nPerHalf }, (_, i) => (
      <capacitor key={`t${i}`} name={`CDT${id}${i}`} capacitance="470uF" footprint={<SnapInFP />} pcbX={i * 40} pcbY={0} schX={i * 2} schY={1.4} schSectionName={sec} />
    ))}
    {Array.from({ length: nPerHalf }, (_, i) => (
      <capacitor key={`b${i}`} name={`CDB${id}${i}`} capacitance="470uF" footprint={<SnapInFP />} pcbX={i * 40} pcbY={-45} schX={i * 2} schY={-1.4} schSectionName={sec} />
    ))}
    {/* BALANCE: 2× 47 k in SERIES per half, so no single 2512 sees more than ≈208 V or its full
        power — and ONE network per MODULE (`bal`; the boards fit it on the first bank only).
        Sizing: a formed can at 83 % of rated voltage leaks ≈ 0.3–0.5 mA hot, so the realistic
        imbalance across 5–8 cans is ≤ ≈ 1.2 mA (the RFQ line bounds it at ≤ 0.5 mA per can at
        85 °C / 415 V). Against 4.4 mA of bleed that is ≤ 56 V of midpoint offset on a link sitting
        at the rectified crest (283–336 V per half) with the stages off; whenever the Vienna runs
        it balances the midpoint actively. Cost 0.92 W per element (46 % of a 2 W part), 3.7 W per
        module at 830 V on every SKU. Do not size this network off the datasheet LEAKAGE LIMIT —
        that route lands on a 22 k network at 3.9 W per half, fitted twice on the two-bank boards.
        Firmware owns the rest: F.06 / F.38 watch the midpoint in every energised state. */}
    {bal ? [
      <resistor key="rbta" name={`RBALT${id}A`} resistance="47k" footprint="2512" pcbX={0} pcbY={-22.5} schX={nPerHalf * 2 + 1} schY={2.1} schSectionName={sec} />,
      <resistor key="rbtb" name={`RBALT${id}B`} resistance="47k" footprint="2512" pcbX={24} pcbY={-22.5} schX={nPerHalf * 2 + 1} schY={0.7} schSectionName={sec} />,
      <resistor key="rbba" name={`RBALB${id}A`} resistance="47k" footprint="2512" pcbX={56} pcbY={-22.5} schX={nPerHalf * 2 + 1} schY={-0.7} schSectionName={sec} />,
      <resistor key="rbbb" name={`RBALB${id}B`} resistance="47k" footprint="2512" pcbX={80} pcbY={-22.5} schX={nPerHalf * 2 + 1} schY={-2.1} schSectionName={sec} />,
    ] : null}
    {Array.from({ length: nPerHalf }, (_, i) => [
      <trace key={`tt${i}`} from={`.CDT${id}${i} > .pin1`} to={dcp} schDisplayLabel={dcp.replace("net.", "")} />,
      <trace key={`tm${i}`} from={`.CDT${id}${i} > .pin2`} to={mid} schDisplayLabel={mid.replace("net.", "")} />,
      <trace key={`bm${i}`} from={`.CDB${id}${i} > .pin1`} to={mid} schDisplayLabel={mid.replace("net.", "")} />,
      <trace key={`bn${i}`} from={`.CDB${id}${i} > .pin2`} to={dcn} schDisplayLabel={dcn.replace("net.", "")} />,
    ])}
    {bal ? [
      <trace key="b1" from={`.RBALT${id}A > .pin1`} to={dcp} schDisplayLabel={dcp.replace("net.", "")} />,
      <trace key="b2" from={`.RBALT${id}A > .pin2`} to={`.RBALT${id}B > .pin1`} />,
      <trace key="b3" from={`.RBALT${id}B > .pin2`} to={mid} schDisplayLabel={mid.replace("net.", "")} />,
      <trace key="b4" from={`.RBALB${id}A > .pin1`} to={mid} schDisplayLabel={mid.replace("net.", "")} />,
      <trace key="b5" from={`.RBALB${id}A > .pin2`} to={`.RBALB${id}B > .pin1`} />,
      <trace key="b6" from={`.RBALB${id}B > .pin2`} to={dcn} schDisplayLabel={dcn.replace("net.", "")} />,
    ] : null}
  </group>
);

// ---------- bank filter, one per bank: a FILM-ONLY bank, nF × 2.2 µF 630 V straight across the
// rectifier output, with no filter choke and no electrolytic. The film alone takes the 2·fsw
// ripple of the full-bridge rectifier (≤ 10 A rms per part at the simulated corners), and the
// count is set by 0.5 % RMS output ripple at the 150 V / Imax PSM corner.
export const BankFilter = ({ id, bkp, bkn, nF = 10, sec = "BANKS", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`bank${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {Array.from({ length: nF }, (_, i) => (
      <capacitor key={`f${i}`} name={`CF${id}${i}`} capacitance="2.2uF" footprint={FilmBoxFP(27.5)} pcbX={(i % 7) * 34} pcbY={-Math.floor(i / 7) * 36} schX={(i % 7) * 1.6} schY={-Math.floor(i / 7) * 2.2} schSectionName={sec} />
    ))}
    {Array.from({ length: nF }, (_, i) => [
      <trace key={`fp${i}`} from={`.CF${id}${i} > .pin1`} to={bkp} schDisplayLabel={bkp.replace("net.", "")} />,
      <trace key={`fn${i}`} from={`.CF${id}${i} > .pin2`} to={bkn} schDisplayLabel={bkn.replace("net.", "")} />,
    ])}
  </group>
);

// ---------- series/parallel matrix: PCB power relays switched at ZERO current (mode changes
// happen only in standby, with the LLC stopped) plus a series blocking diode on the output. The
// diode is what makes a battery or a paralleled module unable to back-feed, so the output needs no
// matched-voltage make and the contacts need no mirror readback: a welded matrix contact shows up
// as a bank imbalance at the next SER start (F.17).
export const SeriesParallelRelayMatrix = ({ bkAp, bkAn, bkBp, bkBn, outp, sec = "SPMATRIX", x = 0, y = 0, sx = 0, sy = 0 }: any) => {
  const contacts: Record<string, [string, string]> = { KSER: [bkAn, bkBp], KPARA: [bkAp, bkBp], KPARB: [bkAn, bkBn] };
  return (
  <group name="spmatrix" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {Object.keys(contacts).map((k, i) => (
      <chip key={k} name={k} footprint={<RelayFP />} pinLabels={{ pin1: "C1", pin2: "C2", pin3: "A", pin4: "B" }} pcbX={i * 58} pcbY={0} schX={i * 6} schY={0} schSectionName={sec} />
    ))}
    {Object.entries(contacts).map(([k, [a, b]]) => [
      <trace key={`c1${k}`} from={`.${k} > .C1`} to="net.V24" schDisplayLabel="V24" />,
      <trace key={`c2${k}`} from={`.${k} > .C2`} to={`net.COIL_${k}`} schDisplayLabel={`COIL_${k}`} />,
      <trace key={`a${k}`} from={`.${k} > .A`} to={a} schDisplayLabel={a.replace("net.", "")} />,
      <trace key={`b${k}`} from={`.${k} > .B`} to={b} schDisplayLabel={b.replace("net.", "")} />,
    ])}
    <diode name="DOUT" footprint={<DiodeModFP />} pcbX={0} pcbY={-40} schX={18} schY={0} schSectionName={sec} />
    <trace from=".DOUT > .anode" to={bkAp} schDisplayLabel={bkAp.replace("net.", "")} />
    <trace from=".DOUT > .cathode" to={outp} schDisplayLabel={outp.replace("net.", "")} />
  </group>
  );
};

// ---------- relay-coil driver (8-ch darlington array, COM clamp to 24 V). Unused inputs to DGND.
export const CoilDriver = ({ id, ins, outs, sec = "COILS", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`uln${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip layer={lay} name={`U${id}`} footprint="soic18" pinLabels={{ pin1: "IN1", pin2: "IN2", pin3: "IN3", pin4: "IN4", pin5: "IN5", pin6: "IN6", pin7: "IN7", pin8: "IN8", pin9: "GND", pin10: "COM", pin11: "OUT8", pin12: "OUT7", pin13: "OUT6", pin14: "OUT5", pin15: "OUT4", pin16: "OUT3", pin17: "OUT2", pin18: "OUT1" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    {ins.map((n, i) => <trace key={`i${i}`} from={`.U${id} > .IN${i + 1}`} to={n} />)}
    {outs.map((n, i) => <trace key={`o${i}`} from={`.U${id} > .OUT${i + 1}`} to={n} />)}
    <trace from={`.U${id} > .GND`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.U${id} > .COM`} to="net.V24" schDisplayLabel="V24" />
  </group>
);

// ---------- isolated HV voltage sense: an 8× 1206 divider chain referenced INSIDE the measured
// domain, an iso voltage-sense amp (AMC1311-class unipolar / AMC1350-class ±bipolar for AC) and an
// isolated 5 V floating-side bias. Nothing resistive crosses the barrier.
// biasP: floating-side rail node (share one Bias5Module per domain). outN optional.
// `cf` parameterizes the input filter — channels that feed a hardware OVP comparator
// (bus/bank/output) use 1 nF (pole ≈ 23 kHz → trip path ≈ 10–20 µs); AC metering keeps 10 nF.
// `aRet` is the COLD-side analogue return, and each board passes the ground its own 3.3 V supply
// returns to: the AC-DC board passes DGND (its local buck), the DC-DC board, which hosts the card,
// passes AGND. Hard-wiring every channel to AGND puts ≈32 mA of iso-amp secondary current from the
// five AC-DC parts onto ONE harness way, across to the card, through RAGTC and back over five
// harness DGND ways — a ≈0.6 m loop under every AC, bus and midpoint sense. Harness way 26 is
// AVMID's Kelvin return and nothing else.
export const IsoVSense = ({ id, hv, ref, out, outN, biasP, rBot = "6.8k", cf = "10nF", aRet = "net.AGND", sec = "SENSE", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`ivs${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* The 8-element divider runs as ONE unbroken string and its LENGTH IS ITS INSULATION: each
        1206 drops about 100 V, and the 6 mm pitch is the working-voltage spacing between elements.
        It must never be folded into two rows to save width -- a serpentine brings the 800 V end
        back alongside the low end and puts the full string voltage across one row gap.

        So it stays 69 mm long and runs VERTICALLY instead, 10 mm wide, which is the same string
        with the same spacing in a shape that fits beside the filter block. High end at the top,
        iso-amp at the bottom: the descent down the column is the descent in potential. */}
    {Array.from({ length: 8 }, (_, i) => (
      <resistor layer={lay} key={i} name={`R${id}D${i}`} resistance="475k" footprint="1206" pcbX={0} pcbY={-i * 6} schX={i * 1.4} schY={1} schSectionName={sec} />
    ))}
    <resistor layer={lay} name={`R${id}DL`} resistance={rBot} footprint="0805" pcbX={0} pcbY={-50} schX={10.5} schY={-1} schSectionName={sec} />
    <capacitor layer={lay} name={`C${id}DF`} capacitance={cf} footprint="0805" pcbX={0} pcbY={-56} schX={12} schY={-1} schSectionName={sec} />
    <chip layer={lay} name={`UIV${id}`} footprint="soic8" pinLabels={ISOAMP_PINS} pcbX={0} pcbY={-64} schX={15} schY={0} schSectionName={sec} />
    {/* 100 nF at the pins on BOTH supplies of the AMC-class iso-amp; the 1 µF bulk lives on the
        bias module (hot side) and on the board rail (cold side). */}
    <capacitor layer={lay} name={`C${id}VA`} capacitance="100nF" footprint="0603" pcbX={-7} pcbY={-64} schX={13} schY={1.6} schSectionName={sec} />
    <capacitor layer={lay} name={`C${id}VB`} capacitance="100nF" footprint="0603" pcbX={7} pcbY={-64} schX={17} schY={1.6} schSectionName={sec} />
    <trace from={`.C${id}VA > .pin1`} to={`.UIV${id} > .VDD1`} />
    <trace from={`.C${id}VA > .pin2`} to={ref} schDisplayLabel={ref.replace("net.", "")} />
    <trace from={`.C${id}VB > .pin1`} to={`.UIV${id} > .VDD2`} />
    <trace from={`.C${id}VB > .pin2`} to={aRet} schDisplayLabel={aRet.replace("net.", "")} />
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
    <trace from={`.UIV${id} > .GND2`} to={aRet} schDisplayLabel={aRet.replace("net.", "")} />
    {/* 100 Ω between the iso-amp output and the line to the ADC. The card carries 1 nF at every analogue pin — the SAR's
        charge reservoir for a 132 ns aperture at the END of a harness or a connector — and an iso-amp output must not
        drive that capacitance bare. 100 Ω · 1 nF = 0.1 µs: invisible to every loop and to the 23 kHz trip channels.
        ₹0.3 per channel. */}
    <resistor layer={lay} name={`R${id}O`} resistance="100" footprint="0603" pcbX={10} pcbY={-64} schX={17} schY={-1} schSectionName={sec} />
    <trace from={`.UIV${id} > .OUTP`} to={`.R${id}O > .pin1`} />
    <trace from={`.R${id}O > .pin2`} to={out} schDisplayLabel={out.replace("net.", "")} />
    {outN ? <trace from={`.UIV${id} > .OUTN`} to={outN} /> : null}
  </group>
);

// ---------- F.11 window thresholds: ONE ratiometric ladder from V3P3. AVMID is V3P3/2, so a
// window built from the same rail stays centred on the signal whatever the rail does.
// VH/VL = AVMID ± F.11·Rburden/100, set per SKU by rMid. Envelope 6 × 5.
export const F11Window = ({ rOut, rMid, sec = "SENSE", x = 0, y = 0, sx = 0, sy = 0, lay = "bottom" }: any) => (
  <group name="f11win" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <resistor layer={lay} name="RF11H" resistance={rOut} footprint="0603" pcbX={0} pcbY={0} schX={0} schY={1.8} schSectionName={sec} />
    <resistor layer={lay} name="RF11M" resistance={rMid} footprint="0603" pcbX={0} pcbY={5} schX={0} schY={0} schSectionName={sec} />
    <resistor layer={lay} name="RF11L" resistance={rOut} footprint="0603" pcbX={0} pcbY={10} schX={0} schY={-1.8} schSectionName={sec} />
    <capacitor layer={lay} name="CF11H" capacitance="100nF" footprint="0603" pcbX={6} pcbY={0} schX={2.8} schY={0.9} schSectionName={sec} />
    <capacitor layer={lay} name="CF11L" capacitance="100nF" footprint="0603" pcbX={6} pcbY={10} schX={2.8} schY={-0.9} schSectionName={sec} />
    <trace from=".RF11H > .pin1" to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from=".RF11H > .pin2" to="net.F11_VH" schDisplayLabel="F11_VH" />
    <trace from=".RF11M > .pin1" to="net.F11_VH" schDisplayLabel="F11_VH" />
    <trace from=".RF11M > .pin2" to="net.F11_VL" schDisplayLabel="F11_VL" />
    <trace from=".RF11L > .pin1" to="net.F11_VL" schDisplayLabel="F11_VL" />
    <trace from=".RF11L > .pin2" to="net.AGND" schDisplayLabel="AGND" />
    <trace from=".CF11H > .pin1" to="net.F11_VH" schDisplayLabel="F11_VH" />
    <trace from=".CF11H > .pin2" to="net.AGND" schDisplayLabel="AGND" />
    <trace from=".CF11L > .pin1" to="net.F11_VL" schDisplayLabel="F11_VL" />
    <trace from=".CF11L > .pin2" to="net.AGND" schDisplayLabel="AGND" />
  </group>
);

// ---------- buffered mid-rail: the VREF/2 source every bipolar CT and sense return is biased to.
// Dual-feedback buffer — 4.7 Ω isolates the 10 µF reservoir from the op-amp, because no bare
// op-amp is stable into 10 µF; DC feedback via 10 k from AVMID keeps the accuracy, AC feedback via
// the local 100 pF keeps the stability. Standard cap-load topology, layout note P-12.
export const AnalogMid = ({ sec = "SENSE", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name="avmid" pcbX={x} pcbY={y} schX={sx} schY={sy} schTraceAutoLabelEnabled schMaxTraceDistance={0}>
    {/* Envelope 12 × 5. CAVF 2.2 nF: its corner (≈7 kHz) must sit BELOW the outer-loop
        crossover (~30 kHz with a 10 MHz op-amp into 10 µF) or the buffer still rings — found
        by the ct-frontend.mjs deck, which runs both topologies as regression evidence. */}
    <resistor layer={lay} name="RAVH" resistance="10k" footprint="0603" pcbX={0} pcbY={0} schX={0} schY={1.2} schSectionName={sec} />
    <resistor layer={lay} name="RAVL" resistance="10k" footprint="0603" pcbX={0} pcbY={5} schX={0} schY={-1.2} schSectionName={sec} />
    <capacitor layer={lay} name="CAVM" capacitance="100nF" footprint="0603" pcbX={6} pcbY={5} schX={2.6} schY={0} schSectionName={sec} />
    <chip layer={lay} name="UAVB" footprint="soic8" pinLabels={{ pin1: "OUT", pin2: "INN", pin3: "INP", pin4: "VN", pin5: "NC1", pin6: "NC2", pin7: "NC3", pin8: "VP" }} pcbX={12} pcbY={0} schX={5.4} schY={0.4} schSectionName={sec} />
    <resistor layer={lay} name="RAVI" resistance="4.7" footprint="0603" pcbX={18} pcbY={0} schX={8.8} schY={0.4} schSectionName={sec} />
    <resistor layer={lay} name="RAVF" resistance="10k" footprint="0603" pcbX={18} pcbY={6} schX={8.8} schY={-1.8} schSectionName={sec} />
    <capacitor layer={lay} name="CAVF" capacitance="2.2nF" footprint="0603" pcbX={12} pcbY={6} schX={6.6} schY={2.4} schSectionName={sec} />
    <capacitor layer={lay} name="CAVO" capacitance="10uF" footprint="0805" pcbX={24} pcbY={5} schX={11} schY={-0.8} schSectionName={sec} />
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
    {/* op-amp supply bypass at the pin — the divider's CAVM decouples AVREF_MID, not VP */}
    <capacitor layer={lay} name="CAVB" capacitance="100nF" footprint="0603" pcbX={12} pcbY={-6} schX={4.2} schY={2.4} schSectionName={sec} />
    <trace from=".CAVB > .pin1" to=".UAVB > .VP" />
    <trace from=".CAVB > .pin2" to="net.AGND" schDisplayLabel="AGND" />
    <trace from=".CAVO > .pin1" to="net.AVMID" schDisplayLabel="AVMID" />
    <trace from=".CAVO > .pin2" to="net.AGND" schDisplayLabel="AGND" />
  </group>
);

// ---------- line CT sensor: the burden and the CT return are biased to AVMID (the line current is
// bipolar) and the ADC line is clamped to both rails.
export const CtSensor = ({ id, out, burden = "22", aRet = "net.AGND", sec = "CT", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`cts${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* PCB: the line CT body is ⌀42 / 38.1 mm across, so the land is CtLineFP (33 mm pin row,
        ⌀45 courtyard) and the burden/filter/clamp row sits clear of it.
        Envelope 85 × 45, one measurement row per phase. */}
    <chip layer={lay} name={`CT${id}`} footprint={<CtLineFP />} pinLabels={{ pin1: "S1", pin2: "S2" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    {/* The burden is what decides how far the over-current protection can SEE, so it is sized per
        SKU against the same 1.62 V-above-AVMID rail budget: 22 / 18 / 13 Ω at 30 / 40 / 50 kW on a
        1:2500 CT. F.01 is 120 / 155 / 195 A pk (1.2× the cycle-by-cycle Vienna worst peak
        including dips and phase jumps), and these burdens keep the D1 soft-saturation 3 µs race
        observable to 184 / 225 / 311 A. Raise the burden and the top of the protection range
        clips at the ADC instead of being measured. */}
    <resistor layer={lay} name={`R${id}B`} resistance={burden} footprint="1206" pcbX={34} pcbY={0} schX={2.2} schY={0} schSectionName={sec} />
    {/* 200 Ω, not 1 k: with the 1 nF below, 1 k gives the front end τ = 1 µs of lag, which the
        F.01 trip race does not model and which lets the fault peak run 7–9 % past 0.8·I_DM
        (183 A at 30 kW, 223 A at 40 kW). 200 Ω puts τ at 200 ns and the anti-alias corner at
        796 kHz — still well below the 2.5 MSPS aperture, still above every signal the ADC chain
        uses. */}
    <resistor layer={lay} name={`R${id}F`} resistance="200" footprint="0603" pcbX={44} pcbY={0} schX={4} schY={0} schSectionName={sec} />
    <capacitor layer={lay} name={`C${id}F`} capacitance="1nF" footprint="0603" pcbX={54} pcbY={0} schX={5.6} schY={-1.2} schSectionName={sec} />
    <diode layer={lay} name={`D${id}P`} footprint="sod323" pcbX={34} pcbY={26} schX={6.6} schY={1.2} schSectionName={sec} />
    <diode layer={lay} name={`D${id}N`} footprint="sod323" pcbX={44} pcbY={26} schX={9} schY={1.2} schSectionName={sec} />
    <trace from={`.CT${id} > .S1`} to={`.R${id}B > .pin1`} />
    <trace from={`.CT${id} > .S2`} to="net.AVMID" schDisplayLabel="AVMID" />
    <trace from={`.R${id}B > .pin2`} to="net.AVMID" schDisplayLabel="AVMID" />
    <trace from={`.R${id}F > .pin1`} to={`.R${id}B > .pin1`} />
    <trace from={`.R${id}F > .pin2`} to={out} schDisplayLabel={out.replace("net.", "")} />
    <trace from={`.C${id}F > .pin1`} to={out} schDisplayLabel={out.replace("net.", "")} />
    <trace from={`.C${id}F > .pin2`} to="net.AVMID" schDisplayLabel="AVMID" />
    <trace from={`.D${id}P > .anode`} to={out} schDisplayLabel={out.replace("net.", "")} />
    <trace from={`.D${id}P > .cathode`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.D${id}N > .anode`} to={aRet} schDisplayLabel={aRet.replace("net.", "")} />
    <trace from={`.D${id}N > .cathode`} to={out} schDisplayLabel={out.replace("net.", "")} />
  </group>
);

// ---------- NTC input (remote sensor header + bias + filter; unipolar — no mid-rail needed)
export const NtcInput = ({ id, out, aRet = "net.AGND", sec = "SENSE", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`ntc${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 8 × 3 */}
    <chip layer={lay} name={`J${id}`} footprint="pinrow2" pinLabels={{ pin1: "P1", pin2: "P2" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <resistor layer={lay} name={`R${id}P`} resistance="10k" footprint="0603" pcbX={8} pcbY={0} schX={2.4} schY={1.2} schSectionName={sec} />
    <capacitor layer={lay} name={`C${id}F`} capacitance="100nF" footprint="0603" pcbX={14} pcbY={0} schX={4.4} schY={-0.6} schSectionName={sec} />
    <trace from={`.J${id} > .P1`} to={out} schDisplayLabel={out.replace("net.", "")} />
    <trace from={`.J${id} > .P2`} to={aRet} schDisplayLabel={aRet.replace("net.", "")} />
    <trace from={`.R${id}P > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.R${id}P > .pin2`} to={out} schDisplayLabel={out.replace("net.", "")} />
    <trace from={`.C${id}F > .pin1`} to={out} schDisplayLabel={out.replace("net.", "")} />
    <trace from={`.C${id}F > .pin2`} to={aRet} schDisplayLabel={aRet.replace("net.", "")} />
  </group>
);

// ---------- hardware safety chain, one per MODULE (it lives on the control card):
// each converter's gate-enable = AND(its own MCU EN, the watchdog verdict WDO), with a 100 k
// pulldown on every EN input and a 10 k pullup on WDO, and a 10 k pulldown on each output — so the
// gates are default-DISABLED for any missing, floating or in-reset condition.
// USUP is the external WINDOWED watchdog (protection rows 24/30): SET0 low + SET1 high + CWD open
// select the fixed 2.22–23.375 ms window that the firmware's 10 ms kick sits inside. The spare AND
// gate's inputs tie low.
export const SafetyChain = ({ id, enA, enB, wdi, gateEnA, gateEnB, nrst, sec = "SAFETY", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => {
  // When `nrst` is given it REPLACES the WDO net name outright — ONE name on every pin. Merging
  // net.WDO_id onto nrst with a pin-less net-to-net trace is electrically the same node, but the
  // drawing then shows two disconnected label groups and reads as "watchdog not connected to
  // reset". The netlist being right is not enough; the deliverable face has to be right too.
  const wdoNet = nrst ?? `net.WDO_${id}`;
  const wdoLbl = wdoNet.replace("net.", "");
  return (
  <group name={`sfc${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy} schTraceAutoLabelEnabled schMaxTraceDistance={0}>
    {/* Envelope 12 × 6: watchdog left, AND gate right, straps/pulls in a tidy bottom row */}
    {/* TPS3430, DRC = VSON-10 + thermal pad (datasheet Table 5-1): 1 VDD1 · 2 CWD · 3 SET0 ·
        4 CRST · 5 GND · 6 SET1 · 7 WDI · 8 WDO · 9 NC · 10 VDD2. The datasheet is explicit that
        "the device will not function properly if VDD1 and VDD2 are not externally connected",
        which is why VDD2 is bonded to VDD1 below. */}
    <chip layer={lay} name={`USUP${id}`} footprint="dfn10" pinLabels={{ pin1: "VDD", pin2: "CWD", pin3: "SET0", pin4: "CRST", pin5: "GND", pin6: "SET1", pin7: "WDI", pin8: "WDO", pin9: "NC", pin10: "VDD2" }} pcbX={0} pcbY={0} schX={0} schY={0.6} schSectionName={sec} />
    <chip layer={lay} name={`UAND${id}`} footprint="soic14" pinLabels={{ pin1: "A1", pin2: "B1", pin3: "A2", pin4: "B2", pin5: "C2", pin6: "Y2", pin7: "GND", pin8: "Y3", pin9: "A3", pin10: "B3", pin11: "C3", pin12: "Y1", pin13: "C1", pin14: "VCC" }} pcbX={14} pcbY={0} schX={4.5} schY={0.6} schSectionName={sec} />
    <resistor layer={lay} name={`RWPU${id}`} resistance="10k" footprint="0603" pcbX={0} pcbY={8} schX={0} schY={-2} schSectionName={sec} />
    <resistor layer={lay} name={`RENR${id}`} resistance="100k" footprint="0603" pcbX={7} pcbY={8} schX={1.6} schY={-2} schSectionName={sec} />
    <resistor layer={lay} name={`RENL${id}`} resistance="100k" footprint="0603" pcbX={7} pcbY={13} schX={3.2} schY={-2} schSectionName={sec} />
    <resistor layer={lay} name={`RGPD${id}`} resistance="10k" footprint="0603" pcbX={28} pcbY={8} schX={7.5} schY={-2} schSectionName={sec} />
    {/* VDD (-2.15, -0.63) and GND (+2.15, +0.63) sit on OPPOSITE sides of this package, 4.48 mm
        apart, so no chip capacitor reaches both from beside it. On the OTHER LAYER, centred on the
        package, a 1206's pads land 1.06 mm from each -- which is why this cap is on the far side
        rather than somewhere alongside, where it would be a cap that is not there. */}
    <capacitor layer={lay === "bottom" ? "top" : "bottom"} name={`CSF${id}`} capacitance="100nF" footprint="1206" pcbX={0} pcbY={0} schX={6} schY={-2} schSectionName={sec} />
    {/* FIXED-WINDOW mode, and therefore NO CWD capacitor. A CWD cap sets the window from a
        tolerance-bearing RC, and a 1 nF part puts the early boundary at ~15–18 ms — ahead of the
        firmware's 10 ms kick, so every CORRECT kick lands in the prohibited early window. SET0 low
        + SET1 high + CWD OPEN give the datasheet's fixed window instead: a kick is valid after
        2.22 ms and before 23.375 ms, with no capacitor tolerance in it. CRST (reset stretch) keeps
        its 1 nF. Contract: the bootloader also kicks every ~10 ms from power-up, through chunked
        image verification; EVT T-48 scopes WDI/WDO/NRST over temperature. */}
    <capacitor layer={lay} name={`CRST${id}`} capacitance="1nF" footprint="0603" pcbX={-6} pcbY={3.4} schX={7.5} schY={-3.2} schSectionName={sec} />
    <trace from={`.CRST${id} > .pin1`} to={`.USUP${id} > .CRST`} />
    <trace from={`.CRST${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    {/* the single pull-up for the wired-OR driver power-good chain (see DriverCh) */}
    <resistor name={`RRDY${id}`} resistance="10k" footprint="0603" pcbX={28} pcbY={13} schX={9} schY={-3.2} schSectionName={sec} />
    <trace from={`.RRDY${id} > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.RRDY${id} > .pin2`} to="net.DRV_RDY" schDisplayLabel="DRV_RDY" />
    <trace from={`.USUP${id} > .WDI`} to={wdi} schDisplayLabel={wdi.replace("net.", "")} />
    <trace from={`.USUP${id} > .GND`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.USUP${id} > .VDD`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.USUP${id} > .SET0`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.USUP${id} > .SET1`} to="net.V3P3" schDisplayLabel="V3P3" />   {/* fixed-window strap */}
    <trace from={`.USUP${id} > .VDD2`} to="net.V3P3" schDisplayLabel="V3P3" />   {/* VDD2 MUST be tied to VDD1 externally */}
    {/* WDI is floating out of reset and the TPS3430 is FALLING-EDGE triggered, so coupled noise
        could otherwise supply spurious kicks. A static level supplies no edges and the window
        still times out. TPWDI is the fixture probe point — the ATE kicks the watchdog there. */}
    <resistor layer={lay} name={`RWDI${id}`} resistance="10k" footprint="0603" pcbX={-6} pcbY={8} schX={1.6} schY={-3.2} schSectionName={sec} />
    <trace from={`.RWDI${id} > .pin1`} to={wdi} schDisplayLabel={wdi.replace("net.", "")} />
    <trace from={`.RWDI${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    <chip layer={lay} name={`TPWDI${id}`} footprint="pinrow1" pinLabels={{ pin1: "P" }} pcbX={-12} pcbY={8} schX={3.2} schY={-3.2} schSectionName={sec} />
    <trace from={`.TPWDI${id} > .P`} to={wdi} schDisplayLabel={wdi.replace("net.", "")} />
    <trace from={`.CSF${id} > .pin1`} to={`.USUP${id} > .VDD`} />
    <trace from={`.RENL${id} > .pin1`} to={enB} schDisplayLabel={enB.replace("net.", "")} />
    <trace from={`.RENL${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    {/* The WDO→NRST leg goes through a 0 Ω LINK, because with WDO wire-ORed straight onto NRST a
        blank chip resets 23 ms after power-up and SWD programming never completes. LIFTING THE
        LINK IS NOT THE PRODUCTION METHOD — a board shipped with it out has silently lost the
        RESET half of the safety function. The fixture pogo-pins TPWDI and toggles it every ≈10 ms
        for the SWD session (WDI is otherwise held low by RWDI, and the MCU pin is high-Z under
        reset), so WDO stays high and NRST stays released with RWDOL fitted; lifting it is a
        bench-debug convenience on EVT boards only. The SAFETY path is deliberately UPSTREAM of
        the link — RWPU and both AND inhibits sit on WDO_{id} — so even a board shipped with the
        link out still gates its drivers on the watchdog verdict. */}
    <resistor layer={lay} name={`RWDOL${id}`} resistance="0" footprint="0603" pcbX={-6} pcbY={-6} schX={2.6} schY={-0.8} schSectionName={sec} />
    <trace from={`.USUP${id} > .WDO`} to={`net.WDO_${id}`} schDisplayLabel={`WDO_${id}`} />
    <trace from={`.RWDOL${id} > .pin1`} to={`net.WDO_${id}`} schDisplayLabel={`WDO_${id}`} />
    <trace from={`.RWDOL${id} > .pin2`} to={wdoNet} schDisplayLabel={wdoLbl} />
    <trace from={`.RWPU${id} > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.RWPU${id} > .pin2`} to={`net.WDO_${id}`} schDisplayLabel={`WDO_${id}`} />
    {/* A hung MCU is RESTARTED, not merely inhibited: WDO (open-drain) rides the MCU NRST network
        (SwdPort 100 n + MCU 10 k pull-up ∥ RWPU) while the AND path clamps the gates for as long
        as WDO is low. Firmware contract: EN and relay GPIOs never use retention through reset;
        the watchdog window must exceed boot-to-first-kick (§K); PG10-NRST must stay in NRST mode
        (no option-byte remap). */}
    {/* AND-gate VCC bypass — CSF serves the supervisor, not this package */}
    <capacitor layer={lay} name={`CAND${id}`} capacitance="100nF" footprint="0603" pcbX={14} pcbY={8} schX={4.5} schY={-3.2} schSectionName={sec} />
    <trace from={`.CAND${id} > .pin1`} to={`.UAND${id} > .VCC`} />
    <trace from={`.CAND${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.RENR${id} > .pin1`} to={enA} schDisplayLabel={enA.replace("net.", "")} />
    <trace from={`.RENR${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    {/* ONE brain, TWO gated chains: gate 1 = EN_B AND WDO -> local (DC-DC) GATE_EN;
        gate 2 = EN_A AND WDO -> harness (AC-DC) GATE_EN_A. The third inputs tie high so each
        output is exactly (its EN) AND (watchdog verdict); gate 3 stays spare. */}
    <trace from={`.UAND${id} > .A1`} to={enB} schDisplayLabel={enB.replace("net.", "")} />
    <trace from={`.UAND${id} > .B1`} to={`net.WDO_${id}`} schDisplayLabel={`WDO_${id}`} />
    <trace from={`.UAND${id} > .C1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.UAND${id} > .Y1`} to={gateEnB} schDisplayLabel={gateEnB.replace("net.", "")} />
    <trace from={`.UAND${id} > .A2`} to={enA} schDisplayLabel={enA.replace("net.", "")} />
    <trace from={`.UAND${id} > .B2`} to={`net.WDO_${id}`} schDisplayLabel={`WDO_${id}`} />
    <trace from={`.UAND${id} > .C2`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.UAND${id} > .Y2`} to={gateEnA} schDisplayLabel={gateEnA.replace("net.", "")} />
    <trace from={`.RGPD${id} > .pin1`} to={gateEnB} schDisplayLabel={gateEnB.replace("net.", "")} />
    <trace from={`.RGPD${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    <resistor layer={lay} name={`RGPA${id}`} resistance="10k" footprint="0603" pcbX={28} pcbY={18} schX={9} schY={-2} schSectionName={sec} />
    <trace from={`.RGPA${id} > .pin1`} to={gateEnA} schDisplayLabel={gateEnA.replace("net.", "")} />
    <trace from={`.RGPA${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    {/* gate 3 is the spare — its inputs tie low so nothing floats */}
    {["A3", "B3", "C3"].map(p => (
      <trace key={p} from={`.UAND${id} > .${p}`} to="net.DGND" schDisplayLabel="DGND" />
    ))}
    <trace from={`.UAND${id} > .VCC`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.UAND${id} > .GND`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.CSF${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
  </group>
  );
};

// ---------- SWD/boot provisioning for the MCU: 5-pin header + BOOT0 strap + NRST cap
export const SwdPort = ({ id, sec = "SWD", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`swd${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy} schTraceAutoLabelEnabled schMaxTraceDistance={0}>
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

// ---------- discharge control: default-OFF and isolated. The output stage is biased by a
// DCN-referenced isolated module and its gate is pulled down to DCN, so an MCU that is in reset,
// dead or unprogrammed leaves the discharge OFF. Commanded discharge covers normal shutdown and
// FSM SAFE entry; the passive bleed is the balance network.
// `id` lets the cell be instantiated more than once (bus discharge on the AC-DC board, bank
// bleeders on the DC-DC board); `dcn` is the measured domain's negative rail (DCN / BKAN / BKBN).
export const DischargeCtl = ({ id = "", ctl, gateOut, dcn, sec = "DISCH", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`dsch${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 10 × 4.5: LED in from the left, opto center, bias module below, gate net right */}
    {/* Toshiba TLP152, SO-6 (datasheet §4): 1 Anode · 2 NC · 3 Cathode · 4 GND(VEE) · 5 VO ·
        6 VCC — six pins, so an 8-pin map lands the LED cathode on a no-connect and the commanded
        discharge never operates at all.
        `ctl` is the LED SINK net (a spare ULN2803 channel on the same board) and the LED is fed
        from V15 through 1.2 k: worst case (13.5 − 1.95 − 1.1)/1200 = 8.7 mA, best case 11.6 mA /
        0.16 W on a 1206 (64 %). A 330 Ω GPIO feed would give only IF 3.2–5.2 mA against
        IFLH(max) 7.5 mA — outside the guaranteed-on region. Default-OFF still comes from the
        board's 10 k on CTL_QDIS plus the ULN input threshold. */}
    <chip name={`UQD${id}`} footprint="soic6" pinLabels={{ pin1: "ANO", pin2: "NC1", pin3: "CAT", pin4: "VEE", pin5: "OUT", pin6: "VCC" }} pcbX={0} pcbY={0} schX={0} schY={0.6} schSectionName={sec} />
    <chip name={`PSQD${id}`} footprint="pinrow5" pinLabels={{ pin1: "VIN", pin2: "GND", pin3: "P15", pin4: "COM", pin5: "N3" }} pcbX={0} pcbY={10} schX={0} schY={-1.8} schSectionName={sec} />
    <resistor name={`RQDL${id}`} resistance="1.2k" footprint="1206" pcbX={-10} pcbY={0} schX={-2.4} schY={0.6} schSectionName={sec} />
    <resistor name={`RQDG${id}`} resistance="100" footprint="0805" pcbX={12} pcbY={0} schX={2.6} schY={0.6} schSectionName={sec} />
    <resistor name={`RQDPD${id}`} resistance="10k" footprint="0805" pcbX={12} pcbY={6} schX={4.2} schY={-0.8} schSectionName={sec} />
    <trace from={`.RQDL${id} > .pin1`} to="net.V15" schDisplayLabel="V15" />
    <trace from={`.RQDL${id} > .pin2`} to={`.UQD${id} > .ANO`} />
    <trace from={`.UQD${id} > .CAT`} to={ctl} schDisplayLabel={ctl.replace("net.", "")} />
    <trace from={`.PSQD${id} > .VIN`} to="net.V15" schDisplayLabel="V15" />
    <trace from={`.PSQD${id} > .GND`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.PSQD${id} > .P15`} to={`.UQD${id} > .VCC`} />
    <trace from={`.PSQD${id} > .COM`} to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    {/* opto-driver floating bias bypass at the pins */}
    <capacitor name={`CQD${id}`} capacitance="100nF" footprint="0603" pcbX={-6} pcbY={6} schX={1.2} schY={-0.8} schSectionName={sec} />
    <trace from={`.CQD${id} > .pin1`} to={`.UQD${id} > .VCC`} />
    <trace from={`.CQD${id} > .pin2`} to={`.UQD${id} > .VEE`} />
    <trace from={`.UQD${id} > .VEE`} to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    <trace from={`.UQD${id} > .OUT`} to={`.RQDG${id} > .pin1`} />
    <trace from={`.RQDG${id} > .pin2`} to={gateOut} />
    <trace from={`.RQDPD${id} > .pin1`} to={gateOut} />
    <trace from={`.RQDPD${id} > .pin2`} to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
  </group>
);

// ---------- photovoltaic gate drive: a VOM1271-class PV driver for the bank bleeders —
// default-OFF isolation, ms-class turn-on, no floating supply.
// The ONLY point on this part's datasheet (Rev 1.9) with GUARANTEED minimums is
// IF = 10 mA (Voc ≥ 7.8 V, Isc ≥ 6.0 µA), so the drive is designed to that point and nowhere
// else: at ~5 mA no minimum exists at all, and the guaranteed load-line chord into a 1 MΩ gate
// load computes 3.4 V, below threshold. The LEDs are fed from V15 through 1 k / 2010 — ≥10 mA
// held down to the 13.5 V rail floor with VF(max) 1.6 + Vce 0.2 + 1 % R, 15.3 mA / 0.24 W at the
// 16.5 V corner (31 % of the 0.75 W part) — with their cathodes on the shared PV_SINK switched by
// the board's QPVD low-side NPN, because a GPIO cannot source 2 × 10 mA. The gate bleed is
// 6.8 MΩ: worst-case chord V = Isc·R·Voc/(Voc+Isc·R) = 6.55 V, minus ≤0.7 V of 100 nA-class gate
// leakage ⇒ ≥5.8 V at the gate against Vth ≤3.5 V plus 2 V of margin. The integrated turn-off
// does the active discharge; 6.8 M is the belt-and-braces bleed.
// NOT for the bus discharge (QDISF keeps the fast opto+bias chain) and never for switching gates.
export const PvGateDrive = ({ id, gateOut, src, sec = "BLEED", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`pvg${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 8 × 2.5 */}
    {/* Vishay VOM1271, SOP-4 (datasheet rev 1.9, doc 83469): pins 5–8 DO NOT EXIST, so an 8-pin
        map leaves VN/VP — the PV output that drives the bleeder gate — unconnected in copper.
        1 Anode · 2 Cathode · 3 out− · 4 out+ (the pin 3/4 NAMES confirm at RFQ against Vishay's
        pin-description page; the package itself is datasheet-confirmed). */}
    <chip name={`UPV${id}`} footprint="soic4" pinLabels={{ pin1: "ANO", pin2: "CAT", pin3: "VN", pin4: "VP" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <resistor name={`RPVL${id}`} resistance="1k" footprint="2010" pcbX={-10} pcbY={0} schX={-2.4} schY={0} schSectionName={sec} />
    <resistor name={`RPVB${id}`} resistance="6.8M" footprint="0805" pcbX={10} pcbY={0} schX={2.6} schY={0} schSectionName={sec} />
    <trace from={`.RPVL${id} > .pin1`} to="net.V15" schDisplayLabel="V15" />
    <trace from={`.RPVL${id} > .pin2`} to={`.UPV${id} > .ANO`} />
    <trace from={`.UPV${id} > .CAT`} to="net.PV_SINK" schDisplayLabel="PV_SINK" />
    <trace from={`.UPV${id} > .VP`} to={gateOut} />
    <trace from={`.UPV${id} > .VN`} to={src} schDisplayLabel={src.replace("net.", "")} />
    <trace from={`.RPVB${id} > .pin1`} to={gateOut} />
    <trace from={`.RPVB${id} > .pin2`} to={src} schDisplayLabel={src.replace("net.", "")} />
  </group>
);

// ---------- HMI: 2 buttons + a 2-digit 7-segment display; 74HC595 segments and 2 NPN digit
// drivers, multiplexed by the MCU over 3 SPI-style lines + 2 digit lines + 2 button GPIO.
export const ConfigHmi = ({ sec = "HMI", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name="hmi" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* Envelope 20 × 9: shift register → segment-resistor ladder → display, digit drivers
        below the display, button cluster in its own column at right */}
    <chip name="DISP1" footprint={<Seg2FP />} pinLabels={{ pin1: "SA", pin2: "SB", pin3: "SC", pin4: "SD", pin5: "SE", pin6: "SF", pin7: "SG", pin8: "DP", pin9: "DIG1", pin10: "DIG2" }} pcbX={0} pcbY={0} schX={8.5} schY={0} schSectionName={sec} />
    <chip name="USR1" footprint="soic16" pinLabels={{ pin1: "QB", pin2: "QC", pin3: "QD", pin4: "QE", pin5: "QF", pin6: "QG", pin7: "QH", pin8: "GND", pin9: "QHS", pin10: "SRCLR", pin11: "SRCLK", pin12: "RCLK", pin13: "OE", pin14: "SER", pin15: "QA", pin16: "VCC" }} pcbX={0} pcbY={22} schX={0} schY={0} schSectionName={sec} />
    {Array.from({ length: 8 }, (_, i) => (
      <resistor key={i} name={`RSEG${i}`} resistance="220" footprint="0603" pcbX={32 + i * 5} pcbY={-12} schX={4.5} schY={3.5 - i * 1} schSectionName={sec} />
    ))}
    {["1", "2"].map((d, i) => (
      <chip key={d} name={`QDIG${d}`} footprint="sot23" pinLabels={{ pin1: "B", pin2: "E", pin3: "C" }} pcbX={32 + i * 8} pcbY={22} schX={8.5 + i * 2.6} schY={-3.4} schSectionName={sec} />
    ))}
    {["1", "2"].map((d, i) => (
      <resistor key={d} name={`RDIG${d}`} resistance="2.2k" footprint="0603" pcbX={32 + i * 8} pcbY={28} schX={7 + i * 2.6} schY={-4.8} schSectionName={sec} />
    ))}
    {["1", "2"].map((d, i) => (
      <chip key={d} name={`SW${d}`} footprint="pushbutton" pinLabels={{ pin1: "P1", pin2: "P2", pin3: "P3", pin4: "P4" }} pcbX={80 + i * 15} pcbY={0} schX={14.5} schY={1.4 - i * 3.2} schSectionName={sec} />
    ))}
    {["1", "2"].map((d, i) => (
      <resistor key={d} name={`RSW${d}`} resistance="10k" footprint="0603" pcbX={80 + i * 15} pcbY={8} schX={17} schY={2.4 - i * 3.2} schSectionName={sec} />
    ))}
    {/* the buttons are panel-actuated, so each gets an ESD/bounce cap at the MCU net */}
    {["1", "2"].map((d, i) => (
      <capacitor key={`c${d}`} name={`CSW${d}`} capacitance="100nF" footprint="0603" pcbX={80 + i * 15} pcbY={14} schX={17} schY={0.6 - i * 3.2} schSectionName={sec} />
    ))}
    <trace from=".USR1 > .VCC" to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from=".USR1 > .GND" to="net.DGND" schDisplayLabel="DGND" />
    {/* shift-register supply bypass — CSW1/2 are button filters, not this */}
    <capacitor name="CSR1" capacitance="100nF" footprint="0603" pcbX={8} pcbY={22} schX={-2} schY={-1.6} schSectionName={sec} />
    <trace from=".CSR1 > .pin1" to=".USR1 > .VCC" />
    <trace from=".CSR1 > .pin2" to="net.DGND" schDisplayLabel="DGND" />
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
    {/* HMI_CLK / HMI_LAT cross the card connector, so without these pulls the 74HC595's SRCLK and
        RCLK float whenever the card is absent or in reset — CMOS crowbar current and garbage on a
        display whose OE is hard-tied low, so the outputs are always live. A clock and a latch
        that cannot float keep the register quiet; the data line is then harmless. */}
    <resistor name="RHPD1" resistance="10k" footprint="0603" pcbX={-8} pcbY={28} schX={-2} schY={-3.2} schSectionName={sec} />
    <resistor name="RHPD2" resistance="10k" footprint="0603" pcbX={-8} pcbY={34} schX={-2} schY={-4.4} schSectionName={sec} />
    <trace from=".RHPD1 > .pin1" to="net.HMI_CLK" schDisplayLabel="HMI_CLK" />
    <trace from=".RHPD1 > .pin2" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".RHPD2 > .pin1" to="net.HMI_LAT" schDisplayLabel="HMI_LAT" />
    <trace from=".RHPD2 > .pin2" to="net.DGND" schDisplayLabel="DGND" />
  </group>
);

// ---------- MCU + decoupling + reset. VDDA/VREF+ are fed through a FERRITE BEAD (FB{id}A — a
// 600 Ω @100 MHz part; its drawn VALUE is the bead's DC resistance, not a 0 Ω link) plus local
// caps. The BOOT0 and SWD nets are bound at board level.
export const ControlMcu = ({ id, sec = "CONTROL", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`mcu${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy} schTraceAutoLabelEnabled schMaxTraceDistance={0}>
    {/* GD32G553VET7, LQFP-100. The supply/reset pins below are DATASHEET FACTS (Rev 2.0 Table 2-4,
        via docs/mcu-pin-allocation-gd32.md), not choices:
          VDD  24 49 64 75 100     VSS  23 48 63 74 99
          VDDA 37   VSSA 35   VREFP 36   VBAT 6   NRST 14   BOOT0 95   SWDIO 76   SWCLK 77
        Do not carry a supply-pin map over from another part. On an STM32G474 these rails sit on
        11/27/10/26/19/20; on THIS part every one of those is ordinary I/O (pin 20 PA0/ADC0_IN0,
        26 PA4, 27 PA5, 11 PF10) and every one of them carries a real signal in CARD_MCU_PINS, so
        the foreign map would short AIN0 to VDDA, AIN3 to V3P3, AIN12 to DGND and WDI to V3P3. */}
    <chip layer={lay} name={`U${id}`} footprint={<Lqfp100 />} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    {/* One 100 nF per VDD/VSS pair -- five pairs, five caps, each beside its own pin. */}
    {[0, 1, 2, 3, 4].map(i => (
      <capacitor layer={lay} key={i} name={`C${id}D${i}`} capacitance="100nF" footprint="0402" pcbX={-9 + i * 5} pcbY={11} schX={-4.5 + i * 2.6} schY={-6.6} schSectionName={sec} />
    ))}
    <resistor layer={lay} name={`R${id}RST`} resistance="10k" footprint="0402" pcbX={16} pcbY={11} schX={9.4} schY={-6.6} schSectionName={sec} />
    {/* THE CRYSTAL IS NOT OPTIONAL. The module's only external interface is isolated CAN, and
        classic CAN needs the SUM of both nodes' clock errors inside the resynchronisation jump
        width (≤0.5 % per node in practice, ±1.58 % absolute worst case). The GD32 IRC8M is
        ±2–3 % over −40…+105 °C — 5× the ISO 11898-1 budget at 16 tq / SJW 2. 8 MHz ±30 ppm on
        pins 12/13 (OSC_IN / OSC_OUT) + 2 × 12 pF C0G + a 1 MΩ feedback resistor, ground guard
        under the can; OSC32 (pins 8/9) stays unfitted, there being no RTC requirement. Card-only:
        no connector, harness or power-board impact. Firmware pairs this with
        PORT_HXTAL_HZ = 8 MHz. ₹10/module. */}
    <chip layer={lay} name={`X${id}`} footprint="crystal" pinLabels={{ pin1: "X1", pin2: "G1", pin3: "X2", pin4: "G2" }} pcbX={-22} pcbY={-11} schX={-9} schY={-6.6} schSectionName={sec} />
    <capacitor layer={lay} name={`C${id}X1`} capacitance="12pF" footprint="0402" pcbX={-27} pcbY={-15} schX={-11} schY={-8.2} schSectionName={sec} />
    <capacitor layer={lay} name={`C${id}X2`} capacitance="12pF" footprint="0402" pcbX={-17} pcbY={-15} schX={-7} schY={-8.2} schSectionName={sec} />
    <resistor layer={lay} name={`R${id}XF`} resistance="1M" footprint="0805" pcbX={-22} pcbY={-6} schX={-9} schY={-5} schSectionName={sec} />
    <trace from={`.X${id} > .X1`} to={`net.OSCIN_${id}`} schDisplayLabel={`OSCIN_${id}`} />
    <trace from={`.X${id} > .X2`} to={`net.OSCOUT_${id}`} schDisplayLabel={`OSCOUT_${id}`} />
    <trace from={`.X${id} > .G1`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.X${id} > .G2`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.U${id} > .pin12`} to={`net.OSCIN_${id}`} schDisplayLabel={`OSCIN_${id}`} />
    <trace from={`.U${id} > .pin13`} to={`net.OSCOUT_${id}`} schDisplayLabel={`OSCOUT_${id}`} />
    <trace from={`.C${id}X1 > .pin1`} to={`net.OSCIN_${id}`} schDisplayLabel={`OSCIN_${id}`} />
    <trace from={`.C${id}X1 > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.C${id}X2 > .pin1`} to={`net.OSCOUT_${id}`} schDisplayLabel={`OSCOUT_${id}`} />
    <trace from={`.C${id}X2 > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.R${id}XF > .pin1`} to={`net.OSCIN_${id}`} schDisplayLabel={`OSCIN_${id}`} />
    <trace from={`.R${id}XF > .pin2`} to={`net.OSCOUT_${id}`} schDisplayLabel={`OSCOUT_${id}`} />
    <resistor layer={lay} name={`FB${id}A`} resistance="0.05" footprint="0805" pcbX={-15} pcbY={11} schX={-4.5} schY={-8.2} schSectionName={sec} />
    <capacitor layer={lay} name={`C${id}A1`} capacitance="1uF" footprint="0603" pcbX={-15} pcbY={16} schX={-1.9} schY={-8.2} schSectionName={sec} />
    <capacitor layer={lay} name={`C${id}A2`} capacitance="100nF" footprint="0402" pcbX={-10} pcbY={16} schX={0.7} schY={-8.2} schSectionName={sec} />
    <capacitor layer={lay} name={`C${id}VR`} capacitance="100nF" footprint="0402" pcbX={-5} pcbY={16} schX={3.3} schY={-8.2} schSectionName={sec} />
    {[0, 1, 2, 3, 4].map(i => [
      <trace key={`p${i}`} from={`.C${id}D${i} > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />,
      <trace key={`g${i}`} from={`.C${id}D${i} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />,
    ])}
    {[24, 49, 64, 75, 100].map(p => (
      <trace key={`vdd${p}`} from={`.U${id} > .pin${p}`} to="net.V3P3" schDisplayLabel="V3P3" />
    ))}
    {[23, 48, 63, 74, 99].map(p => (
      <trace key={`vss${p}`} from={`.U${id} > .pin${p}`} to="net.DGND" schDisplayLabel="DGND" />
    ))}
    {/* VBAT must be SUPPLIED, not grounded: Table 4-3 gives 1.71 V minimum, and grounding it
        unpowers the backup domain, which takes PC13/PC14/PC15 with it. */}
    <trace from={`.U${id} > .pin6`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.FB${id}A > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.FB${id}A > .pin2`} to={`net.VDDA_${id}`} schDisplayLabel={`VDDA_${id}`} />
    <trace from={`.U${id} > .pin37`} to={`net.VDDA_${id}`} schDisplayLabel={`VDDA_${id}`} />
    {/* VREFP tied to the filtered analogue supply; there is no VREFN pin -- it is internally
        strapped to VSSA. VSSA returns to AGND, which meets DGND once, at RAGTC on the card.
        Drawn as a short local wire to the adjacent pin 37 so the sheet shows ONE VDDA chip
        rather than two stacked ones. */}
    <trace from={`.U${id} > .pin36`} to={`.U${id} > .pin37`} />
    <trace from={`.C${id}VR > .pin1`} to={`net.VDDA_${id}`} schDisplayLabel={`VDDA_${id}`} />
    <trace from={`.C${id}VR > .pin2`} to="net.AGND" schDisplayLabel="AGND" />
    <trace from={`.U${id} > .pin35`} to="net.AGND" schDisplayLabel="AGND" />
    <trace from={`.C${id}A1 > .pin1`} to={`net.VDDA_${id}`} schDisplayLabel={`VDDA_${id}`} />
    <trace from={`.C${id}A1 > .pin2`} to="net.AGND" schDisplayLabel="AGND" />
    <trace from={`.C${id}A2 > .pin1`} to={`net.VDDA_${id}`} schDisplayLabel={`VDDA_${id}`} />
    <trace from={`.C${id}A2 > .pin2`} to="net.AGND" schDisplayLabel="AGND" />
    <trace from={`.R${id}RST > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.R${id}RST > .pin2`} to={`net.NRST_${id}`} schDisplayLabel={`NRST_${id}`} />
    <trace from={`.U${id} > .pin14`} to={`net.NRST_${id}`} schDisplayLabel={`NRST_${id}`} />
  </group>
);

// ---------- inter-board signal harness, 40-way: the whole PFC bundle crosses here, while the
// power goes over the DCP/DCN/PE studs. The module's one brain sits in the DC-DC slot, so this
// harness carries to and from the AC-DC board: 3× logic-level 50 kHz PFC PWM, 12 senses (CTs,
// VAC, bus, rails, temps), AVMID with its Kelvin AGND beside it, fans, precharge/discharge drives
// and feedback, EN_PFC, the GATE_EN_A chain, the merged FLT wired-OR, DRV_RDY, V15/V24 power and
// five returns. Positions are fixed by the map the boards pass in (single source:
// umod-pinmap.mts HARNESS40); SHLD bonds to PE at the AC-DC end only.
// Straight through: no TX/RX pair, no crossover, no link protocol — one brain per module.
export const Interconnect40 = ({ id, map, shldTo = null, sec = "HARNESS", x = 0, y = 0, sx = 0, sy = 0, lay = "bottom" }: any) => (
  <group name={`ic${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip layer={lay} name={`JIC${id}`} footprint="pinrow40"
      pinLabels={Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`pin${i + 1}`, `W${i + 1}`]))}
      pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    {map.filter(([, net]: [number, string | null]) => net && net !== "SHLD").map(([pos, net]: [number, string]) => (
      <trace key={pos} from={`.JIC${id} > .W${pos}`} to={`net.${net}`} schDisplayLabel={net} />
    ))}
    {shldTo ? <trace from={`.JIC${id} > .W40`} to={shldTo} schDisplayLabel={shldTo.replace("net.", "")} /> : null}
  </group>
);

// ---------- aux flyback. calculations/magnetics/d4-flyback.mjs computes every value below from
// the drawn parts and the NCP1252 D-version limits — change a part here and re-run it.
//  · fed from the FULL unboosted bus (DCP→DCN): runs 321 V brown-out … 860 V (OVP corner), brown-in ≥ 345 V
//  · 1700 V SiC switch, **110 W class on all SKUs** (Lp 345 µH ±5 %, cycle-by-cycle limit via the
//    0.28 Ω CS sense, 65 kHz DCM, Vor ≈ 157 V, ETD44, Np 38 / N24 6 / N15 4 / Naux 4 — D4 rev E).
//    ONE p/n across the family, with ≥20 % corner margin on the worst SKU's steady load.
//    DCM proof: t_on 3.2 µs + t_reset 7.0 µs = 10.3 µs < 13.8 µs usable @342 V full load.
//  · the CS sense resistor and its filter are a pair: a 470 pF CCSF adds 453 ns of lag, which with
//    tILIM lets the limit current overshoot to 5.1 A = 113 % of Bsat(130 °C). 0.28 Ω + 100 pF
//    reads 71 %.
//  · DCLA is a 1700 V SiC Schottky because it blocks Vbus + Vc ≈ 1.3 kV; RCLA is 3 × 11 k 2 W in
//    series so Vc stays ≤ ~470 V at the limit current with 5 µH of leakage (QAUX ≤ 80 %).
//  · output rectifiers are 400 V ultrafast (PIV ≈ 160/152/151 V plus the leakage ring — a 100 V
//    Schottky avalanches at high bus); SMBJ TVS on both rails.
//  · the BO divider (2 × 1.2 M / 7.5 k) is sized for the 1.0 V BO threshold: brown-out 321 V, and
//    the IBO hysteresis across that value puts brown-in at 345 V. A higher-impedance divider
//    raises brown-in with it.
//  · RAUX24 50 mΩ puts every V24 fault behind ≥100 mΩ of loop, so a hard short cannot ratchet D4
//    into saturation before the 10–20 ms fault latch.
//  · TAUX pins 1–4 are the primary side, 5–8 the SELV side, one bobbin row each.
//  · relay-coil PWM hold economization is firmware's job; it halves the 24 V steady demand.
export const AuxPower = ({ dcp, dcn, sec = "AUX", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name="aux" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    {/* NCP1252 pin map, datasheet rev 9 Table 1: FB=1, BO=2, CS=3, RT=4, GND=5, DRV=6, VCC=7,
        SS=8. Note pin 8 is SOFT-START, not a compensation node. */}
    <chip name="UAUX" footprint="soic8" pinLabels={{ pin1: "FB", pin2: "BO", pin3: "CS", pin4: "RT", pin5: "GND", pin6: "DRV", pin7: "VCC", pin8: "SS" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <chip name="QAUX" footprint="to220" pinLabels={{ pin1: "G", pin2: "D", pin3: "S" }} pcbX={22} pcbY={0} schX={5} schY={-1.2} schSectionName={sec} />
    <resistor name="RAUXCS" resistance="0.28" footprint="1206" pcbX={22} pcbY={8} schX={5} schY={-2.8} schSectionName={sec} />
    <resistor name="RAUXG" resistance="100k" footprint="0603" pcbX={28} pcbY={4} schX={3.2} schY={-2.2} schSectionName={sec} />
    <resistor name="RCSF" resistance="1k" footprint="0603" pcbX={16} pcbY={8} schX={6.8} schY={-2.8} schSectionName={sec} />
    <capacitor name="CCSF" capacitance="100pF" footprint="0603" pcbX={16} pcbY={12} schX={8.4} schY={-3.6} schSectionName={sec} />
    {/* Pin allocation is an INSULATION decision: the bus-side terminals P1/P2/AXA/AXB own one bobbin row and the SELV
        S24A/S24B/S15A/S15B the other. Interleaving them (S24A beside P1, AXA beside S15A) gives a 1.98 mm pad gap
        against the 8.0 / 12.6 mm reinforced design values. The land pattern follows at layout (open item). */}
    <chip name="TAUX" footprint={<XfmrAuxFP />} pinLabels={{ pin1: "P1", pin2: "P2", pin3: "AXA", pin4: "AXB", pin5: "S24A", pin6: "S24B", pin7: "S15A", pin8: "S15B" }} pcbX={48} pcbY={0} schX={7.5} schY={0.8} schSectionName={sec} />
    <diode name="DAUX24" footprint="smb" pcbX={72} pcbY={0} schX={11} schY={2.4} schSectionName={sec} />
    <diode name="DAUX15" footprint="smb" pcbX={72} pcbY={8} schX={11} schY={0.8} schSectionName={sec} />
    <diode name="DAUXVC" footprint="smb" pcbX={72} pcbY={16} schX={11} schY={-0.8} schSectionName={sec} />
    {/* radial aluminium-can land (⌀8 × 11.5 mm, 3.5 mm pitch) — these are electrolytics, not film boxes */}
    <capacitor name="CAUX24" capacitance="220uF" footprint={RadialFP()} pcbX={84} pcbY={0} schX={13.4} schY={2.4} schSectionName={sec} />
    <capacitor name="CAUX15" capacitance="220uF" footprint={RadialFP()} pcbX={84} pcbY={12} schX={13.4} schY={0.8} schSectionName={sec} />
    <capacitor name="CVCC" capacitance="220uF" footprint={RadialFP()} pcbX={84} pcbY={24} schX={13.4} schY={-0.8} schSectionName={sec} />
    <diode name="DTVS24" footprint="smb" pcbX={98} pcbY={0} schX={15.8} schY={2.4} schSectionName={sec} />
    <diode name="DTVS15" footprint="smb" pcbX={108} pcbY={0} schX={15.8} schY={0.8} schSectionName={sec} />
    <resistor name="RAUXST1" resistance="470k" footprint="2512" pcbX={0} pcbY={10} schX={-0.9} schY={3.4} schSectionName={sec} />
    <resistor name="RAUXST2" resistance="470k" footprint="2512" pcbX={10} pcbY={10} schX={0.9} schY={3.4} schSectionName={sec} />
    <resistor name="RBR1A" resistance="1.2M" footprint="2512" pcbX={0} pcbY={16} schX={-0.9} schY={-3.4} schSectionName={sec} />
    <resistor name="RBR1B" resistance="1.2M" footprint="2512" pcbX={10} pcbY={16} schX={0.9} schY={-3.4} schSectionName={sec} />
    <resistor name="RBR2" resistance="7.5k" footprint="0603" pcbX={22} pcbY={16} schX={2.7} schY={-3.4} schSectionName={sec} />
    {/* REGULATION SIGN: the NCP1252 FB pin has an internal pull-up and HIGH FB = MORE demand, so
        a plain VCC→FB divider is POSITIVE feedback and the rails run up to the TVS clamps. The
        classic opto-emulating primary-side loop closes it the right way round: VCC (the aux
        winding tracks the outputs) exceeds VZ+VBE ≈ 15.7 V → QAUXFB conducts → FB is pulled LOW
        → demand is cut. At the D4 rev E turns that puts V24 = 15.7 × 6/4 ≈ 23.5 V and V15 ≈ 15 V
        after the rectifier drops. */}
    <diode name="DZAUX" footprint="sod123" pcbX={-10} pcbY={0} schX={-3} schY={1.2} schSectionName={sec} />
    <resistor name="RZFB" resistance="2.2k" footprint="0603" pcbX={-10} pcbY={5} schX={-4.6} schY={1.2} schSectionName={sec} />
    <chip name="QAUXFB" footprint="sot23" pinLabels={{ pin1: "B", pin2: "E", pin3: "C" }} pcbX={-10} pcbY={10} schX={-3} schY={0} schSectionName={sec} />
    <resistor name="RBEFB" resistance="10k" footprint="0603" pcbX={-16} pcbY={10} schX={-4.6} schY={0} schSectionName={sec} />
    <capacitor name="CFBF" capacitance="1nF" footprint="0603" pcbX={-10} pcbY={15} schX={-3} schY={-1.2} schSectionName={sec} />
    <capacitor name="CAUXSS" capacitance="100nF" footprint="0603" pcbX={-16} pcbY={15} schX={-4.6} schY={-1.2} schSectionName={sec} />
    <diode name="DCLA" footprint="smb" pcbX={76} pcbY={-8} schX={4.5} schY={3.4} schSectionName={sec} />
    <capacitor name="CCLA" capacitance="10nF" footprint={FilmBoxFP(15)} pcbX={94} pcbY={-8} schX={6.3} schY={3.4} schSectionName={sec} />
    <resistor name="RCLA1" resistance="11k" footprint="2512" pcbX={114} pcbY={-8} schX={8.1} schY={3.4} schSectionName={sec} />
    <resistor name="RCLA2" resistance="11k" footprint="2512" pcbX={126} pcbY={-8} schX={9.9} schY={3.4} schSectionName={sec} />
    <resistor name="RCLA3" resistance="11k" footprint="2512" pcbX={138} pcbY={-8} schX={11.7} schY={3.4} schSectionName={sec} />
    <resistor name="RAUX24" resistance="0.05" footprint="2512" pcbX={90} pcbY={0} schX={14.6} schY={3.4} schSectionName={sec} />
    {/* V24 PRELOAD. V24 = 6/4 × (VCC + VF,aux) − VF,24 ≈ 24.0 V at load, but at ZERO V24 load
        (relays de-energised, fans off — the normal standby state) peak charging pushes it to
        ≈25–26.5 V, against a 26.4 V HF167F maximum coil voltage and 26.4 V-class 24 V fans.
        4.7 k / 1 W = 5.1 mA, 0.12 W. The rail TVS standoffs are chosen ABOVE that maximum
        (SMBJ18A on V15, SMBJ28A on V24): a standoff below the rail's normal maximum is a heater,
        not a clamp, and both parts are gross-FB-failure clamps, not rail regulation. */}
    <resistor name="RPL24" resistance="4.7k" footprint="2512" pcbX={98} pcbY={8} schX={16.6} schY={3.4} schSectionName={sec} />
    <trace from=".RPL24 > .pin1" to="net.V24" schDisplayLabel="V24" />
    <trace from=".RPL24 > .pin2" to="net.DGND" schDisplayLabel="DGND" />
    {/* HV startup: DCP → 2× 470 k → VCC reservoir; aux winding takes over via DAUXVC */}
    <trace from=".RAUXST1 > .pin1" to={dcp} schDisplayLabel={dcp.replace("net.", "")} />
    <trace from=".RAUXST1 > .pin2" to=".RAUXST2 > .pin1" />
    <trace from=".RAUXST2 > .pin2" to=".UAUX > .VCC" />
    <trace from=".CVCC > .pin1" to=".UAUX > .VCC" />
    {/* 100 n ceramic AT the VCC pin. The 220 µF beside it is the COLD-START budget, and it is
        sized for the D-version of the controller: no 120 ms pre-start delay and 5 V of UVLO
        hysteresis, so a worst-case startup drain of ≈5.6 mA for ~60 ms of soft-start and takeover
        = 336 µC needs C ≥ 67 µF. The A-suffix part hiccups forever instead: 1.0 V of hysteresis ÷
        ~0.8–1.7 mA net drain = 28–60 ms against its own 120 ms mandatory delay. */}
    <capacitor name="CVCCB" capacitance="100nF" footprint="0603" pcbX={78} pcbY={16} schX={12.4} schY={-1.8} schSectionName={sec} />
    <trace from=".CVCCB > .pin1" to=".UAUX > .VCC" />
    <trace from=".CVCCB > .pin2" to=".UAUX > .GND" />
    <trace from=".CVCC > .pin2" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    <trace from=".TAUX > .AXA" to=".DAUXVC > .anode" />
    <trace from=".DAUXVC > .cathode" to=".UAUX > .VCC" />
    <trace from=".TAUX > .AXB" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    {/* controller ground/reference + VIN sense pin parked on VCC rail (IC-internal HV sense unused) */}
    <trace from=".UAUX > .GND" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    {/* RT (pin 4) SETS the switching frequency — leave it floating and the stage has no defined
        Fsw at all. From the NCP1252 datasheet Rev 9 Table 3 (43 kΩ → 100 kHz, 8.5 kΩ → 500 kHz,
        so f ≈ 4300/RT[kΩ] kHz): 66.5 kΩ 1 % ≈ 64.7 kHz, the 65 kHz D4 point, with the ±5 % jitter
        already inside the corner margin and DCmax comfortably above the 23 % worst DCM t_on. */}
    <resistor name="RAUXRT" resistance="66.5k" footprint="0603" pcbX={4} pcbY={22} schX={2} schY={-3} schSectionName={sec} />
    <trace from=".RAUXRT > .pin1" to=".UAUX > .RT" />
    <trace from=".RAUXRT > .pin2" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    {/* brown-in program: full-bus divider → BO — brown-out VBO·(1+Rup/Rlo) = 321 V, brown-in adds IBO·Rup = 24 V */}
    <trace from=".RBR1A > .pin1" to={dcp} schDisplayLabel={dcp.replace("net.", "")} />
    <trace from=".RBR1A > .pin2" to=".RBR1B > .pin1" />
    <trace from=".RBR1B > .pin2" to=".UAUX > .BO" />
    <trace from=".RBR2 > .pin1" to=".UAUX > .BO" />
    <trace from=".RBR2 > .pin2" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    {/* primary-side regulation: the zener + NPN sense the VCC/aux rail, which tracks the secondaries */}
    <trace from=".RZFB > .pin1" to=".UAUX > .VCC" />
    <trace from=".RZFB > .pin2" to=".DZAUX > .cathode" />
    <trace from=".DZAUX > .anode" to=".QAUXFB > .B" />
    <trace from=".RBEFB > .pin1" to=".QAUXFB > .B" />
    <trace from=".RBEFB > .pin2" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    <trace from=".QAUXFB > .E" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    <trace from=".QAUXFB > .C" to=".UAUX > .FB" />
    <trace from=".CFBF > .pin1" to=".UAUX > .FB" />
    <trace from=".CFBF > .pin2" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    <trace from=".CAUXSS > .pin1" to=".UAUX > .SS" />
    <trace from=".CAUXSS > .pin2" to={dcn} schDisplayLabel={dcn.replace("net.", "")} />
    {/* power stage: primary + RCD clamp + gated switch + filtered CS */}
    <trace from=".TAUX > .P1" to={dcp} schDisplayLabel={dcp.replace("net.", "")} />
    <trace from=".QAUX > .D" to=".TAUX > .P2" />
    <trace from=".DCLA > .anode" to=".TAUX > .P2" />
    <trace from=".DCLA > .cathode" to=".CCLA > .pin1" />
    <trace from=".CCLA > .pin2" to={dcp} schDisplayLabel={dcp.replace("net.", "")} />
    <trace from=".RCLA1 > .pin1" to=".CCLA > .pin1" />
    <trace from=".RCLA1 > .pin2" to=".RCLA2 > .pin1" />
    <trace from=".RCLA2 > .pin2" to=".RCLA3 > .pin1" />
    <trace from=".RCLA3 > .pin2" to={dcp} schDisplayLabel={dcp.replace("net.", "")} />
    <trace from=".UAUX > .DRV" to=".QAUX > .G" />
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
    <trace from=".DAUX24 > .cathode" to=".CAUX24 > .pin1" />
    <trace from=".RAUX24 > .pin1" to=".CAUX24 > .pin1" />
    <trace from=".RAUX24 > .pin2" to="net.V24" schDisplayLabel="V24" />
    <trace from=".TAUX > .S24B" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".TAUX > .S15A" to=".DAUX15 > .anode" />
    <trace from=".DAUX15 > .cathode" to="net.V15" schDisplayLabel="V15" />
    <trace from=".TAUX > .S15B" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".CAUX24 > .pin2" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".CAUX15 > .pin1" to="net.V15" schDisplayLabel="V15" />
    <trace from=".CAUX15 > .pin2" to="net.DGND" schDisplayLabel="DGND" />
    {/* rail clamps — a single FB or divider fault otherwise drives V24 → 30 V+ and V15 → 20 V
        into every coil, fan and bias module. SMBJ28A / SMBJ18A class. */}
    <trace from=".DTVS24 > .cathode" to="net.V24" schDisplayLabel="V24" />
    <trace from=".DTVS24 > .anode" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".DTVS15 > .cathode" to="net.V15" schDisplayLabel="V15" />
    <trace from=".DTVS15 > .anode" to="net.DGND" schDisplayLabel="DGND" />
  </group>
);

// ---------- 3.3 V rail: a 15 V → 3.3 V SYNCHRONOUS BUCK, one per board that needs V3P3.
// A linear regulator is not an option here: it burns 2.9–4.1 W off a 15 V rail and goes into
// thermal shutdown, and an AMS1117-class part is at or over its Vin limit on 15 V anyway.
// TPS54202-class: FB 0.596 V reference → 45.3 k / 10 k = 3.296 V.
export const Rail3V3 = ({ id = "", sec = "AUX", x = 0, y = 0, sx = 0, sy = 0 , lay = "bottom" }: any) => (
  <group name={`r3v3${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy} schTraceAutoLabelEnabled schMaxTraceDistance={0}>
    {/* TPS54202 is orderable ONLY as DDC = SOT-23-6 (datasheet SLVSD26C Table 4-1): 1 GND · 2 SW ·
        3 VIN · 4 FB · 5 EN · 6 BOOT. An SOIC-8 land rotates VIN/GND/SW by three positions — V15
        onto GND, DGND onto SW, the inductor onto VIN — and every 3.3 V rail in the module is dead
        at first power-up. Traces address by NAME, so only the numbering and the land matter. */}
    <chip layer={lay} name={`UBK${id}`} footprint="sot23_6" pinLabels={{ pin1: "GND", pin2: "SW", pin3: "VIN", pin4: "FB", pin5: "EN", pin6: "BST" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <inductor layer={lay} name={`LBK${id}`} inductance="10uH" footprint={FilmBoxFP(10)} pcbX={14} pcbY={0} schX={3} schY={0.6} schSectionName={sec} />
    <capacitor layer={lay} name={`CBKI${id}`} capacitance="10uF" footprint="0805" pcbX={-8} pcbY={4} schX={-2.6} schY={0.8} schSectionName={sec} />
    <capacitor layer={lay} name={`CBKO${id}`} capacitance="22uF" footprint="0805" pcbX={22} pcbY={4} schX={5.4} schY={0.6} schSectionName={sec} />
    <capacitor layer={lay} name={`CBST${id}`} capacitance="100nF" footprint="0603" pcbX={8} pcbY={-6} schX={1.8} schY={1.9} schSectionName={sec} />
    <resistor layer={lay} name={`REN1${id}`} resistance="100k" footprint="0603" pcbX={-14} pcbY={-6} schX={-2.6} schY={-1.2} schSectionName={sec} />
    <resistor layer={lay} name={`REN2${id}`} resistance="27k" footprint="0603" pcbX={-14} pcbY={-12} schX={-2.6} schY={-2.4} schSectionName={sec} />
    <resistor layer={lay} name={`RBKF1${id}`} resistance="45.3k" footprint="0603" pcbX={14} pcbY={8} schX={3} schY={-1.2} schSectionName={sec} />
    <resistor layer={lay} name={`RBKF2${id}`} resistance="10k" footprint="0603" pcbX={20} pcbY={8} schX={4.6} schY={-1.2} schSectionName={sec} />
    <trace from={`.UBK${id} > .VIN`} to="net.V15" schDisplayLabel="V15" />
    {/* EN must NOT be tied to 15 V — the TPS54202 EN absolute maximum is 7 V. This divider puts
        EN at 3.19 V, inside the 5.5 V recommended maximum, and doubles as UVLO: with a ~1.2 V
        enable threshold the converter starts once V15 ≥ ~5.7 V. */}
    <trace from={`.REN1${id} > .pin1`} to="net.V15" schDisplayLabel="V15" />
    <trace from={`.REN1${id} > .pin2`} to={`.UBK${id} > .EN`} />
    <trace from={`.REN2${id} > .pin1`} to={`.UBK${id} > .EN`} />
    <trace from={`.REN2${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
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

// ---------- fan header + tach pullup (the fan p/n must accept 3.3 V PWM — it is a BOM line)
export const FanPort = ({ id, pwmNet, sec = "FANS", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name={`fan${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name={`JFAN${id}`} footprint="pinrow4" pinLabels={{ pin1: "GND", pin2: "V24", pin3: "TACH", pin4: "PWM" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <resistor name={`RFT${id}`} resistance="10k" footprint="0603" pcbX={12} pcbY={0} schX={2.8} schY={0} schSectionName={sec} />
    <trace from={`.JFAN${id} > .GND`} to="net.DGND" schDisplayLabel="DGND" />
    <trace from={`.JFAN${id} > .V24`} to="net.V24" schDisplayLabel="V24" />
    <trace from={`.JFAN${id} > .TACH`} to={`net.FAN_TACH${id}`} schDisplayLabel={`FAN_TACH${id}`} />
    {/* `pwmNet` gangs the later fans onto FAN_PWM2: two hardware PWM channels drive three or four
        fans, while every tach stays separately monitored */}
    <trace from={`.JFAN${id} > .PWM`} to={pwmNet ?? `net.FAN_PWM${id}`} schDisplayLabel={(pwmNet ?? `net.FAN_PWM${id}`).replace("net.", "")} />
    <trace from={`.RFT${id} > .pin1`} to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from={`.RFT${id} > .pin2`} to={`net.FAN_TACH${id}`} schDisplayLabel={`FAN_TACH${id}`} />
    {/* A floating PWM pin runs most 4-wire fans at 100 %. Four 24 V fans at 7–14 W each (the
        160 m³/h class the air budget assumes; the BOM line pins ≤ 14 W) plus their start surge,
        on a 110 W aux, through the ≈5–6 s cold start before firmware takes over, is enough to
        brown the aux out before the MCU boots on the 50 kW-air SKU — a restart loop. 10 k to DGND
        gives a defined 0 % at boot; the module cannot overheat in the first 6 s from cold, and the
        NTC-driven F.22–F.24 derates plus the F.25 fan-fail row cover the running case. The
        zero-fan liquid SKU applies the same principle to its TACH inputs (RFDT*). */}
    <resistor name={`RFPD${id}`} resistance="10k" footprint="0603" pcbX={12} pcbY={8} schX={2.8} schY={-1.4} schSectionName={sec} />
    <trace from={`.RFPD${id} > .pin1`} to={pwmNet ?? `net.FAN_PWM${id}`} schDisplayLabel={(pwmNet ?? `net.FAN_PWM${id}`).replace("net.", "")} />
    <trace from={`.RFPD${id} > .pin2`} to="net.DGND" schDisplayLabel="DGND" />
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
    {/* CGND static bleed — a floating CAN domain accumulates charge on an unterminated cable */}
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
    {/* transceiver supply bypass on BOTH isolation domains + bulk on the module-fed side */}
    <capacitor name="CCV1" capacitance="100nF" footprint="0603" pcbX={-8} pcbY={6} schX={-1.6} schY={-1.2} schSectionName={sec} />
    <trace from=".CCV1 > .pin1" to=".UCAN > .VDD1" />
    <trace from=".CCV1 > .pin2" to="net.DGND" schDisplayLabel="DGND" />
    <capacitor name="CCV2" capacitance="100nF" footprint="0603" pcbX={8} pcbY={6} schX={1.6} schY={-1.4} schSectionName={sec} />
    <trace from=".CCV2 > .pin1" to=".UCAN > .VDD2" />
    <trace from=".CCV2 > .pin2" to="net.CGND" schDisplayLabel="CGND" />
    <capacitor name="CCB5" capacitance="1uF" footprint="0805" pcbX={14} pcbY={12} schX={2.6} schY={-3.4} schSectionName={sec} />
    <trace from=".CCB5 > .pin1" to=".PSCAN > .P5" />
    <trace from=".CCB5 > .pin2" to="net.CGND" schDisplayLabel="CGND" />
    <trace from=".UCAN > .CANH" to=".LCAN > .A1" />
    <trace from=".UCAN > .CANL" to=".LCAN > .A2" />
    <trace from=".LCAN > .B1" to=".JCAN > .CANH" />
    <trace from=".LCAN > .B2" to=".JCAN > .CANL" />
    <trace from=".JCAN > .SGND" to="net.CGND" schDisplayLabel="CGND" />
    {/* The cable-screen pin is BONDED, not left floating — a shield terminal with no bond does
        nothing. CGND already carries its own RCGB 1 MΩ / CCGB 4.7 nF bleed-and-bond pair to DGND,
        so bonding the screen there gives the cable CM current a return without a PE loop. */}
    <trace from=".JCAN > .SHLD" to="net.CGND" schDisplayLabel="CGND" />
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

// ---------- output shunt (manganin, Kelvin) + iso amp with floating-side bias. BOTH iso-amp
// outputs are routed so firmware can take the true differential, and the PSSH 5 V rail also feeds
// the output-domain OV IsoVSense.
export const OutputShunt = ({ inn, out, outN, sec = "OUTPUT", x = 0, y = 0, sx = 0, sy = 0 }: any) => (
  <group name="oshunt" pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name="RSHO" footprint={<ShuntFP />} pinLabels={{ pin1: "A", pin2: "B", pin3: "KA", pin4: "KB" }} pcbX={0} pcbY={0} schX={0} schY={0} schSectionName={sec} />
    <chip name="USHO" footprint="soic8" pinLabels={ISOAMP_PINS} pcbX={36} pcbY={0} schX={3.6} schY={0} schSectionName={sec} />
    <chip name="PSSH" footprint="pinrow5" pinLabels={{ pin1: "VIN", pin2: "GND", pin3: "P5", pin4: "COM", pin5: "NC" }} pcbX={36} pcbY={14} schX={3.6} schY={-2.2} schSectionName={sec} />
    <trace from={inn} to=".RSHO > .A" schDisplayLabel={inn.replace("net.", "")} />
    <trace from=".RSHO > .B" to="net.OUTN" schDisplayLabel="OUTN" />
    {/* POLARITY: return current flows OUTN→B→A→BKBN, so KA sits LOW of KB when delivering.
        VINP on KB and VINN on KA is what makes positive output current read POSITIVE — the
        firmware sign convention and every bring-up check follow this orientation. */}
    <trace from=".USHO > .VINP" to=".RSHO > .KB" />
    <trace from=".USHO > .VINN" to=".RSHO > .KA" />
    <trace from=".PSSH > .VIN" to="net.V15" schDisplayLabel="V15" />
    <trace from=".PSSH > .GND" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".PSSH > .P5" to="net.B5OUT" schDisplayLabel="B5OUT" />
    <trace from=".USHO > .VDD1" to="net.B5OUT" schDisplayLabel="B5OUT" />
    <trace from=".PSSH > .COM" to=".USHO > .GND1" />
    <trace from=".USHO > .GND1" to=".RSHO > .KB" />
    <trace from=".USHO > .VDD2" to="net.V3P3" schDisplayLabel="V3P3" />
    <trace from=".USHO > .GND2" to="net.AGND" schDisplayLabel="AGND" />
    {/* shunt iso-amp bypass on both sides + bulk on the module-fed B5OUT rail */}
    <capacitor name="CSH1" capacitance="100nF" footprint="0603" pcbX={30} pcbY={7} schX={2} schY={1.6} schSectionName={sec} />
    <trace from=".CSH1 > .pin1" to=".USHO > .VDD1" />
    <trace from=".CSH1 > .pin2" to=".USHO > .GND1" />
    <capacitor name="CSH2" capacitance="100nF" footprint="0603" pcbX={42} pcbY={7} schX={5.4} schY={1.6} schSectionName={sec} />
    <trace from=".CSH2 > .pin1" to=".USHO > .VDD2" />
    <trace from=".CSH2 > .pin2" to="net.AGND" schDisplayLabel="AGND" />
    <capacitor name="CSHB" capacitance="1uF" footprint="0805" pcbX={30} pcbY={14} schX={1} schY={-2.2} schSectionName={sec} />
    <trace from=".CSHB > .pin1" to="net.B5OUT" schDisplayLabel="B5OUT" />
    <trace from=".CSHB > .pin2" to=".USHO > .GND1" />
    {/* the same 100 Ω output isolation as IsoVSense, on both legs of the differential pair */}
    <resistor name="RSHOP" resistance="100" footprint="0603" pcbX={46} pcbY={-4} schX={6.4} schY={0.6} schSectionName={sec} />
    <resistor name="RSHON" resistance="100" footprint="0603" pcbX={46} pcbY={4} schX={6.4} schY={-0.6} schSectionName={sec} />
    <trace from=".USHO > .OUTP" to=".RSHOP > .pin1" />
    <trace from=".RSHOP > .pin2" to={out} schDisplayLabel={out.replace("net.", "")} />
    <trace from=".USHO > .OUTN" to=".RSHON > .pin1" />
    <trace from=".RSHON > .pin2" to={outN || "net.SNS_IOUTN"} schDisplayLabel="SNS_IOUTN" />
  </group>
);

// ---------------------------------------------------------------------------------------------
// CONTROL-CARD INTERFACE. One card part number serves every module in the family; see
// packages/common-components/control-card.tsx for how it is sized and why a module stops at 50 kW.
//
// The connector IS the interface: the same 88-way part appears on the DC-DC board and on the card,
// and each side traces its own pins to its own nets — the card's ways carry generic names, the
// board's carry module nets, and cardMap() generates both so they cannot drift apart.
export const Card88FP = () => (
  <footprint>
    {Array.from({ length: 44 }, (_, i) => [
      <platedhole key={`a${i}`} portHints={[`pin${i * 2 + 1}`]} pcbX={-54.6 + i * 2.54} pcbY={-1.27}
        holeDiameter="1mm" outerDiameter="1.8mm" shape="circle" />,
      <platedhole key={`b${i}`} portHints={[`pin${i * 2 + 2}`]} pcbX={-54.6 + i * 2.54} pcbY={1.27}
        holeDiameter="1mm" outerDiameter="1.8mm" shape="circle" />,
    ]).flat()}
    <courtyardrect pcbX={0} pcbY={0} width="116mm" height="10mm" />
  </footprint>
);

// Either side of the interface. `map` is a list of [pinLabel, net] for THIS side -- unused ways
// are simply not traced, which is what lets one 88-way pinout serve both the card and its host.
export const CardConnector = ({ id = "CARD", map, x = 0, y = 0, sx = 0, sy = 0, sec = "CARD" }: any) => (
  <group name={`card${id}`} pcbX={x} pcbY={y} schX={sx} schY={sy}>
    <chip name={`J${id}`} footprint={<Card88FP />}
      pinLabels={Object.fromEntries(map.map(([p]: any, i: number) => [`pin${i + 1}`, p]))}
      schX={0} schY={0} schSectionName={sec} />
    {map.map(([p, n]: any, i: number) =>
      n ? <trace key={i} from={`.J${id} > .${p}`} to={n} schDisplayLabel={String(n).replace("net.", "")} /> : null)}
  </group>
);
