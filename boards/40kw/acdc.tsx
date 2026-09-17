// 40 kW AC-DC board (lower): as 30 kW with one SIC-750V-15mR die per position, D1 5x T79 N=26,
// 125 A gG fuses, 12-can split link, 3 fans, RATING strap 1k.
import { AcDcBoard } from "../../packages/common-components/boards";
export default () => <AcDcBoard lanes={1} pw={40} w={440} h={500} />;
