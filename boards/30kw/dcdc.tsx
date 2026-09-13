// 30 kW DC-DC board (upper): full-bridge LLC (E67) with one SG2M023120LJ per position, 7x33 nF + D2 rev F
// 5.16 uH, two D3 rev D cells, JBS bank bridges, film-only banks 9x2.2 uF (E68c), S/P relays, DOUT, card slot.
import { DcDcBoard } from "../../packages/common-components/boards";
export default () => <DcDcBoard channels={1} w={440} h={500} />;
