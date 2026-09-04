export default () => (
  <board width="60mm" height="40mm" routingDisabled>
    <chip
      name="Q1"
      footprint={
        <footprint>
          <platedhole portHints={["pin1"]} pcbX={-3.81} pcbY={0} holeDiameter="1.8mm" outerDiameter="3.2mm" shape="circle" />
          <platedhole portHints={["pin2"]} pcbX={-1.27} pcbY={0} holeDiameter="1.8mm" outerDiameter="3.2mm" shape="circle" />
          <platedhole portHints={["pin3"]} pcbX={1.27} pcbY={0} holeDiameter="1.8mm" outerDiameter="3.2mm" shape="circle" />
          <platedhole portHints={["pin4"]} pcbX={3.81} pcbY={0} holeDiameter="1.8mm" outerDiameter="3.2mm" shape="circle" />
        </footprint>
      }
      pinLabels={{ pin1: "G", pin2: "D", pin3: "S", pin4: "KS" }}
      pcbX={0} pcbY={10}
    />
    <resistor name="R1" resistance="4.7" footprint="0805" pcbX={-10} pcbY={0} />
    <capacitor name="C1" capacitance="470pF" footprint="0805" pcbX={10} pcbY={0} />
    <diode name="D1" footprint="smb" pcbX={0} pcbY={-10} />
    <trace from=".R1 > .pin2" to=".C1 > .pin1" />
    <trace from=".Q1 > .G" to=".R1 > .pin1" />
    <trace from=".Q1 > .D" to=".D1 > .anode" />
  </board>
);
