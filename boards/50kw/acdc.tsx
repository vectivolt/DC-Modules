// 50kw AC-DC board (E42 LIQUID variant): same 1-lane structure as 40 kW, +25% current —
// paralleled PFC pairs, 103 uH choke (5x T79 26u, N=22, engine @50 kHz), 160 A gG NH00 fuses,
// 250 A-class precharge bypass, 16-can link, ZERO fans (sealed module, both extrusions are
// liquid coldplates; magnetics gap-pad-bonded to the plate webs).
import { AcDcBoard } from "../../packages/common-components/boards";
export default () => <AcDcBoard lanes={1} pw={50} w={440} h={500} />;
