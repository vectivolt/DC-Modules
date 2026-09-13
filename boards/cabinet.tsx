// cabinet.tsx — the 150 kW cabinet as a schematic (E39 structure · E55 re-base 3 × 50 kW · E66 no CSU).
//
// 150 kW = 3 × 50 kW modules (liquid 50kw or air 50kwa — same interface). E66: the cabinet supervisor (a control card in
// a strap role on a DIN-supplied carrier) is DELETED — it was a single point of failure for all three modules, and the
// 100 kW already ran without one. The charger controller is the group master for BOTH products: it broadcasts GROUP_SET
// (demand + membership bitmap) and every module card runs the same share law (firmware/core/group.c). 100 kW = this
// sheet without MOD3. The 60/80/120 kW compositions are RETIRED at E55 — the ladder is 30/40/50/100/150.
//
// Modules appear as interface blocks (their internals are the audited module sheets); this sheet is the cabinet
// interconnect of record: AC distribution, DC parallel bus, the CAN trunk with fixed terminations at both ends, PE
// bonding and the controller port. Netlist-only build (E36 — no PCB).
//
// Section map (E34: nets not wires, every component carries schSectionName):
//   AC-ENTRY   cabinet studs L1/L2/L3/PE → per-module feeds (each 50 kW module carries its own 160 A gG NH00 protection)
//   MODULES    MOD1..MOD3 interface blocks
//   DC-BUS     DCP/DCN parallel bus studs (modules parallel through their own K_OUT + E12b gate)
//   CAN-CHAIN  one trunk, RT1 120 Ω fixed at the controller end, RT2 120 Ω fixed at the far end; every module JCAN is a
//              short drop with its own termination jumper OFF — pulling a module for N−1 service leaves exactly two
//   CTRL-PORT  the charger controller's CAN port (A13 interface block) + the single shield-to-PE bond and the single
//              SGND reference, both at the controller end
const MODS = [1, 2, 3];

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

    {/* ---- the three 50 kW modules (50kw liquid / 50kwa air — same interface), pins only ---- */}
    {MODS.map((n) => (
      <chip key={n} name={`MOD${n}`} value="PMP-50KW-MODULE" footprint="pinrow10"
        pinLabels={{ pin1: "L1", pin2: "L2", pin3: "L3", pin4: "PE", pin5: "OUTP", pin6: "OUTN", pin7: "CANH", pin8: "CANL", pin9: "SGND", pin10: "SHLD" }}
        schPortArrangement={{ leftSide: { direction: "top-to-bottom", pins: ["L1", "L2", "L3", "PE"] }, rightSide: { direction: "top-to-bottom", pins: ["OUTP", "OUTN", "CANH", "CANL", "SGND", "SHLD"] } }}
        pcbX={40 + n * 30} pcbY={40} schX={14 + ((n - 1) % 2) * 14} schY={42 - Math.floor((n - 1) / 2) * 9} schSectionName="MODULES" />
    ))}
    {MODS.map((n) => [
      <trace key={`l1${n}`} from={`.MOD${n} > .L1`} to="net.AC_L1" schDisplayLabel="AC_L1" />,
      <trace key={`l2${n}`} from={`.MOD${n} > .L2`} to="net.AC_L2" schDisplayLabel="AC_L2" />,
      <trace key={`l3${n}`} from={`.MOD${n} > .L3`} to="net.AC_L3" schDisplayLabel="AC_L3" />,
      <trace key={`pe${n}`} from={`.MOD${n} > .PE`} to="net.PE" schDisplayLabel="PE" />,
      <trace key={`dp${n}`} from={`.MOD${n} > .OUTP`} to="net.BUS_P" schDisplayLabel="BUS_P" />,
      <trace key={`dn${n}`} from={`.MOD${n} > .OUTN`} to="net.BUS_N" schDisplayLabel="BUS_N" />,
      <trace key={`sg${n}`} from={`.MOD${n} > .SGND`} to="net.CAN_SGND" schDisplayLabel="CAN_SGND" />,
      <trace key={`ch${n}`} from={`.MOD${n} > .CANH`} to="net.CANH" schDisplayLabel="CANH" />,
      <trace key={`cl${n}`} from={`.MOD${n} > .CANL`} to="net.CANL" schDisplayLabel="CANL" />,
      <trace key={`sh${n}`} from={`.MOD${n} > .SHLD`} to="net.CAN_SHLD" schDisplayLabel="CAN_SHLD" />,
    ])}

    {/* ---- DC parallel bus studs ---- */}
    <chip name="JCABDP" value="STUD-M8" footprint="pinrow1" pinLabels={{ pin1: "P" }} pcbX={200} pcbY={0} schX={46} schY={46} schSectionName="DC-BUS" />
    <chip name="JCABDN" value="STUD-M8" footprint="pinrow1" pinLabels={{ pin1: "P" }} pcbX={208} pcbY={0} schX={46} schY={43} schSectionName="DC-BUS" />
    <trace from=".JCABDP > .P" to="net.BUS_P" schDisplayLabel="BUS_P" />
    <trace from=".JCABDN > .P" to="net.BUS_N" schDisplayLabel="BUS_N" />

    {/* ---- CAN trunk terminations: fixed, one at each END of the trunk (RT1 controller end, RT2 far end) — module
        jumpers OFF in cabinet builds (E66) ---- */}
    <resistor name="RT1" resistance="120" footprint="0603" pcbX={100} pcbY={80} schX={4} schY={24} schSectionName="CAN-CHAIN" />
    <resistor name="RT2" resistance="120" footprint="0603" pcbX={110} pcbY={80} schX={8} schY={24} schSectionName="CAN-CHAIN" />
    <trace from=".RT1 > .pin1" to="net.CANH" schDisplayLabel="CANH" />
    <trace from=".RT1 > .pin2" to="net.CANL" schDisplayLabel="CANL" />
    <trace from=".RT2 > .pin1" to="net.CANH" schDisplayLabel="CANH" />
    <trace from=".RT2 > .pin2" to="net.CANL" schDisplayLabel="CANL" />

    {/* ---- controller port (E66): the charger controller is the group master (GROUP_SET 0x12) — no cabinet card ---- */}
    <chip name="CTRL1" value="CHARGER-CONTROLLER-CAN-PORT" footprint="pinrow4" pinLabels={{ pin1: "CANH", pin2: "CANL", pin3: "SGND", pin4: "SHLD" }}
      schPortArrangement={{ rightSide: { direction: "top-to-bottom", pins: ["CANH", "CANL", "SGND", "SHLD"] } }}
      pcbX={90} pcbY={120} schX={30} schY={25} schSectionName="CTRL-PORT" />
    <trace from=".CTRL1 > .CANH" to="net.CANH" schDisplayLabel="CANH" />
    <trace from=".CTRL1 > .CANL" to="net.CANL" schDisplayLabel="CANL" />
    <trace from=".CTRL1 > .SGND" to="net.CTRL_SGND" schDisplayLabel="CTRL_SGND" />
    <trace from=".CTRL1 > .SHLD" to="net.CAN_SHLD" schDisplayLabel="CAN_SHLD" />
    {/* the CAN domain is ISOLATED per module card (NSI1042/CGND): the trunk carries the SGND reference conductor between
        all drops and it is referenced ONCE, to the controller's transceiver ground, through this liftable 0 R */}
    <resistor name="RSGB" resistance="0" footprint="0603" pcbX={140} pcbY={120} schX={36} schY={19} schSectionName="CTRL-PORT" />
    <trace from=".RSGB > .pin1" to="net.CAN_SGND" schDisplayLabel="CAN_SGND" />
    <trace from=".RSGB > .pin2" to="net.CTRL_SGND" schDisplayLabel="CTRL_SGND" />
    {/* shield bonded to PE at the controller end ONLY (single-point, liftable 0 R bond) */}
    <resistor name="RSHB" resistance="0" footprint="0603" pcbX={130} pcbY={120} schX={32} schY={19} schSectionName="CTRL-PORT" />
    <trace from=".RSHB > .pin1" to="net.CAN_SHLD" schDisplayLabel="CAN_SHLD" />
    <trace from=".RSHB > .pin2" to="net.PE" schDisplayLabel="PE" />
  </board>
);
