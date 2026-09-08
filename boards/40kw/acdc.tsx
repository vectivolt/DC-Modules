// 40kw AC-DC board (E41 variant): same 1-lane structure as 30 kW, +33% current —
// paralleled PFC pairs, 113 uH choke, 125 A gG input class, 12-can link, 3 fans.
import { AcDcBoard } from "../../packages/common-components/boards";
export default () => <AcDcBoard lanes={1} pw={40} w={440} h={500} />;
