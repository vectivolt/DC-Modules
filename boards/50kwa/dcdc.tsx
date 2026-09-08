// 50kwa DC-DC board (E44 AIR variant): same tank/protection as the liquid E42 (8x27 nF, BIN6,
// 65 A pk / 95 A pk OC class, dual K_OUT, 4 bank strings) with the LLC half-bridges PARALLELED
// (2x SG2M per position, per-device 2.2 R gate R — per-package conduction quarters, air worst
// corner 99 C). RATING strap 15k (E24 rev G: 50 kW AIR band).
import { DcDcBoard } from "../../packages/common-components/boards";
export default () => <DcDcBoard channels={1} pw={50} air w={440} h={500} />;
