// 50 kW liquid DC-DC board (upper): full-bridge LLC with two SG2M023120LJ per position, 11x33 nF + D2 rev F
// 3.28 uH, film-only banks 14x2.2 uF, DOUT, RATING strap 10k.
import { DcDcBoard } from "../../packages/common-components/boards";
export default () => <DcDcBoard channels={1} pw={50} w={440} h={500} />;
