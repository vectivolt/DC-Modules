// cabinet.tsx — the 120 kW cabinet as a schematic (E39).
//
// 120 kW = 4 × 30 kW modules + ONE coordinating MCU: the same control card p/n booting in the
// CSU strap role (RATING band 3.32 k → ~0.82 V, between the 0 V/30 kW and 1.65 V/60 kW codes).
// The card sits on a passive CSU carrier drawn here: 15 V DIN brick into the V15 ways, one strap
// resistor, done. CAN addressing is UID-claim in firmware, so the harness carries no address pins.
//
// Modules appear as interface blocks (their internals are the audited 30 kW sheets); this sheet
// is the cabinet interconnect of record: AC distribution, DC parallel bus, CAN chain with both
// 120 Ω terminations, PE bonding, and the CSU assembly. Netlist-only build (E36 — no PCB).
//
// Section map (E34: nets not wires, every component carries schSectionName):
//   AC-ENTRY   cabinet studs L1/L2/L3/PE → per-module feeds (module has its own 80 A gG fuse)
//   MODULES    MOD1..MOD4 interface blocks
//   DC-BUS     DCP/DCN parallel bus studs (modules parallel through their own K_OUT + E12b gate)
//   CAN-CHAIN  linear daisy chain, 120 Ω at BOTH ends (RT1 at CSU end, RT2 at MOD4 end),
//              shield bonded to PE at the CSU end only
//   CSU-CARRIER JCSU 88-way header (used ways only; the rest are NC on the carrier) + RRCSU strap
//              + PSU1 15 V DIN supply + the mated card's external pins (UCSU)
const MODS = [1, 2, 3, 4];

export default () => (
  <board width="400mm" height="300mm" routingDisabled>
    {/* ---- AC entry studs ---- */}
    <chip name="JCABL1" value="STUD-M8" footprint="pinrow1" pinLabels={{ pin1: "P" }} pcbX={0} pcbY={0} schX={2} schY={46} schSectionName="AC-ENTRY" />
    <chip name="JCABL2" value="STUD-M8" footprint="pinrow1" pinLabels={{ pin1: "P" }} pcbX={8} pcbY={0} schX={2} schY={43} schSectionName="AC-ENTRY" />
    <chip name="JCABL3" value="STUD-M8" footprint="pinrow1" pinLabels={{ pin1: "P" }} pcbX={16} pcbY={0} schX={2} schY={40} schSectionName="AC-ENTRY" />
    <chip name="JCABPE" value="STUD-M8" footprint="pinrow1" pinLabels={{ pin1: "P" }} pcbX={24} pcbY={0} schX={2} schY={37} schSectionName="AC-ENTRY" />
    <trace from=".JCABL1 > .P" to="net.AC_L1" schDisplayLabel="AC_L1" />
    <trace from=".JCABL2 > .P" to="net.AC_L2" schDisplayLabel="AC_L2" />
    <trace from=".JCABL3 > .P" to="net.AC_L3" schDisplayLabel="AC_L3" />
    <trace from=".JCABPE > .P" to="net.PE" schDisplayLabel="PE" />

    {/* ---- the four 30 kW modules, interface pins only ---- */}
    {MODS.map((n) => (
      <chip key={n} name={`MOD${n}`} value="PMP-30KW-MODULE" footprint="pinrow9"
        pinLabels={{ pin1: "L1", pin2: "L2", pin3: "L3", pin4: "PE", pin5: "DCP", pin6: "DCN", pin7: "CANH", pin8: "CANL", pin9: "SHLD" }}
        schPortArrangement={{ leftSide: { direction: "top-to-bottom", pins: ["L1", "L2", "L3", "PE"] }, rightSide: { direction: "top-to-bottom", pins: ["DCP", "DCN", "CANH", "CANL", "SHLD"] } }}
        pcbX={40 + n * 30} pcbY={40} schX={14 + ((n - 1) % 2) * 14} schY={42 - Math.floor((n - 1) / 2) * 9} schSectionName="MODULES" />
    ))}
    {MODS.map((n) => [
      <trace key={`l1${n}`} from={`.MOD${n} > .L1`} to="net.AC_L1" schDisplayLabel="AC_L1" />,
      <trace key={`l2${n}`} from={`.MOD${n} > .L2`} to="net.AC_L2" schDisplayLabel="AC_L2" />,
      <trace key={`l3${n}`} from={`.MOD${n} > .L3`} to="net.AC_L3" schDisplayLabel="AC_L3" />,
      <trace key={`pe${n}`} from={`.MOD${n} > .PE`} to="net.PE" schDisplayLabel="PE" />,
      <trace key={`dp${n}`} from={`.MOD${n} > .DCP`} to="net.DCP_BUS" schDisplayLabel="DCP_BUS" />,
      <trace key={`dn${n}`} from={`.MOD${n} > .DCN`} to="net.DCN_BUS" schDisplayLabel="DCN_BUS" />,
      <trace key={`ch${n}`} from={`.MOD${n} > .CANH`} to="net.CANH" schDisplayLabel="CANH" />,
      <trace key={`cl${n}`} from={`.MOD${n} > .CANL`} to="net.CANL" schDisplayLabel="CANL" />,
      <trace key={`sh${n}`} from={`.MOD${n} > .SHLD`} to="net.CAN_SHLD" schDisplayLabel="CAN_SHLD" />,
    ])}

    {/* ---- DC parallel bus studs ---- */}
    <chip name="JCABDP" value="STUD-M8" footprint="pinrow1" pinLabels={{ pin1: "P" }} pcbX={200} pcbY={0} schX={46} schY={46} schSectionName="DC-BUS" />
    <chip name="JCABDN" value="STUD-M8" footprint="pinrow1" pinLabels={{ pin1: "P" }} pcbX={208} pcbY={0} schX={46} schY={43} schSectionName="DC-BUS" />
    <trace from=".JCABDP > .P" to="net.DCP_BUS" schDisplayLabel="DCP_BUS" />
    <trace from=".JCABDN > .P" to="net.DCN_BUS" schDisplayLabel="DCN_BUS" />

    {/* ---- CAN chain terminations (one per end of the daisy chain) ---- */}
    <resistor name="RT1" resistance="120" footprint="0603" pcbX={100} pcbY={80} schX={4} schY={24} schSectionName="CAN-CHAIN" />
    <resistor name="RT2" resistance="120" footprint="0603" pcbX={110} pcbY={80} schX={8} schY={24} schSectionName="CAN-CHAIN" />
    <trace from=".RT1 > .pin1" to="net.CANH" schDisplayLabel="CANH" />
    <trace from=".RT1 > .pin2" to="net.CANL" schDisplayLabel="CANL" />
    <trace from=".RT2 > .pin1" to="net.CANH" schDisplayLabel="CANH" />
    <trace from=".RT2 > .pin2" to="net.CANL" schDisplayLabel="CANL" />

    {/* ---- CSU carrier: 15 V feed + strap into the 88-way header; the mated card joins CAN ---- */}
    <chip name="PSU1" value="PSU-15V-DIN" footprint="pinrow5" pinLabels={{ pin1: "L", pin2: "N", pin3: "PE", pin4: "V15P", pin5: "V15N" }}
      schPortArrangement={{ leftSide: { direction: "top-to-bottom", pins: ["L", "N", "PE"] }, rightSide: { direction: "top-to-bottom", pins: ["V15P", "V15N"] } }}
      pcbX={0} pcbY={120} schX={16} schY={26} schSectionName="CSU-CARRIER" />
    <trace from=".PSU1 > .L" to="net.AC_L1" schDisplayLabel="AC_L1" />
    <trace from=".PSU1 > .N" to="net.AC_L2" schDisplayLabel="AC_L2" />
    <trace from=".PSU1 > .PE" to="net.PE" schDisplayLabel="PE" />
    <trace from=".PSU1 > .V15P" to="net.V15" schDisplayLabel="V15" />
    <trace from=".PSU1 > .V15N" to="net.DGND" schDisplayLabel="DGND" />

    {/* used ways of the 88-way carrier header; every other way is NC on the carrier (card-side
        pulldowns keep the safety/EN inputs defined — that is what the card's RPD bank is for) */}
    <chip name="JCSU" value="CONN-CARD-88-H" footprint="pinrow7" pinLabels={{ pin1: "V15A", pin2: "V15B", pin3: "GNDA", pin4: "GNDB", pin5: "GNDC", pin6: "ROLE0", pin7: "ROLE1" }}
      schPortArrangement={{ leftSide: { direction: "top-to-bottom", pins: ["V15A", "V15B", "GNDA", "GNDB", "GNDC", "ROLE0", "ROLE1"] } }}
      pcbX={40} pcbY={120} schX={26} schY={26} schSectionName="CSU-CARRIER" />
    <trace from=".JCSU > .V15A" to="net.V15" schDisplayLabel="V15" />
    <trace from=".JCSU > .V15B" to="net.V15" schDisplayLabel="V15" />
    <trace from=".JCSU > .GNDA" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".JCSU > .GNDB" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".JCSU > .GNDC" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".JCSU > .ROLE1" to="net.ROLE1" schDisplayLabel="ROLE1" />
    {/* ROLE0 left open on the carrier — the card's own 10 k pullup reads it high; the CSU band on
        ROLE1 makes ROLE0 a don't-care at boot (E24 rev C) */}

    {/* CSU RATING strap: 3.32 k against the card's 10 k pullup → ~0.82 V = the CSU band */}
    <resistor name="RRCSU" resistance="3.32k" footprint="0603" pcbX={60} pcbY={120} schX={26} schY={21} schSectionName="CSU-CARRIER" />
    <trace from=".RRCSU > .pin1" to="net.ROLE1" schDisplayLabel="ROLE1" />
    <trace from=".RRCSU > .pin2" to="net.DGND" schDisplayLabel="DGND" />

    {/* the mated control card, external pins as seen by the cabinet: 88-way power/strap side
        (1:1 with JCSU) and its own JCAN joining the cabinet bus */}
    <chip name="UCSU" value="CONTROL-CARD-CSU" footprint="pinrow11"
      pinLabels={{ pin1: "V15A", pin2: "V15B", pin3: "GNDA", pin4: "GNDB", pin5: "GNDC", pin6: "ROLE0", pin7: "ROLE1", pin8: "CANH", pin9: "CANL", pin10: "SGND", pin11: "SHLD" }}
      schPortArrangement={{ leftSide: { direction: "top-to-bottom", pins: ["V15A", "V15B", "GNDA", "GNDB", "GNDC", "ROLE0", "ROLE1"] }, rightSide: { direction: "top-to-bottom", pins: ["CANH", "CANL", "SGND", "SHLD"] } }}
      pcbX={90} pcbY={120} schX={36} schY={25} schSectionName="CSU-CARRIER" />
    <trace from=".UCSU > .V15A" to="net.V15" schDisplayLabel="V15" />
    <trace from=".UCSU > .V15B" to="net.V15" schDisplayLabel="V15" />
    <trace from=".UCSU > .GNDA" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".UCSU > .GNDB" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".UCSU > .GNDC" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".UCSU > .ROLE1" to="net.ROLE1" schDisplayLabel="ROLE1" />
    <trace from=".UCSU > .CANH" to="net.CANH" schDisplayLabel="CANH" />
    <trace from=".UCSU > .CANL" to="net.CANL" schDisplayLabel="CANL" />
    <trace from=".UCSU > .SGND" to="net.DGND" schDisplayLabel="DGND" />
    <trace from=".UCSU > .SHLD" to="net.CAN_SHLD" schDisplayLabel="CAN_SHLD" />
    {/* shield bonded to PE at the CSU end ONLY (single-point, liftable 0 R bond) */}
    <resistor name="RSHB" resistance="0" footprint="0603" pcbX={130} pcbY={120} schX={36} schY={19} schSectionName="CSU-CARRIER" />
    <trace from=".RSHB > .pin1" to="net.CAN_SHLD" schDisplayLabel="CAN_SHLD" />
    <trace from=".RSHB > .pin2" to="net.PE" schDisplayLabel="PE" />
  </board>
);
