// 40 kW DC-DC board (upper): full-bridge LLC with two SG2M023120LJ per position,
// 9x33 nF + D2 rev F 3.99 uH, film-only banks 12x2.2 uF, DOUT.
import { DcDcBoard } from "../../packages/common-components/boards";
export default () => <DcDcBoard channels={1} pw={40} w={440} h={500} />;
