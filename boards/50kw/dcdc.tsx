// 50kw DC-DC board (E42 LIQUID variant): 8x27 nF resonant banks (per-cap ~9.7 A of the 12 A
// line), BIN6 3.0 uH trim (N=6), tank protection class revved (65 A pk envelope / 95 A pk OC /
// 100 A-class resonant CTs), four bank strings per side, DUAL K_OUT (2x 200 A, series-mirror
// readback), 3x E70 transformer stacks, RATING strap 10k.
import { DcDcBoard } from "../../packages/common-components/boards";
export default () => <DcDcBoard channels={1} pw={50} w={440} h={500} />;
