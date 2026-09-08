// 40kw DC-DC board (E41 variant): 6x33 nF resonant banks (per-cap current back to ~10 A),
// re-binned trim, three bank strings per side, RATING strap 1k.
import { DcDcBoard } from "../../packages/common-components/boards";
export default () => <DcDcBoard channels={1} pw={40} w={440} h={500} />;
