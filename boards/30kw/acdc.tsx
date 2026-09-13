// 30 kW AC-DC board (lower): gG fuses, MOV/GDT, InfyPower-style EMI (2 CMC + star X2, E68b), precharge,
// Vienna PFC with one SIC-750V-20mR die per position on the clip mount (E68a/E69a), D1 3x T79 N=39,
// 10-can split link, aux flyback, 2 fans, RATING strap 0 R.
import { AcDcBoard } from "../../packages/common-components/boards";
export default () => <AcDcBoard lanes={1} w={440} h={500} />;
