// 50 kW liquid AC-DC board (lower): one B3M010C075Z per position on the coldplate clip mount (E68a),
// D1 5x T79 N=24, 160 A gG NH00 fuses, 250 A precharge bypass, 16-can split link, ZERO fans
// (sealed module; both extrusions are liquid coldplates), RATING strap 10k.
import { AcDcBoard } from "../../packages/common-components/boards";
export default () => <AcDcBoard lanes={1} pw={50} w={440} h={500} />;
