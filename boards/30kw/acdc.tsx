// 30 kW AC-DC board (lower): 80 A gG fuses, MOV/GDT, EMI (2 CMC + three X2 star stages), precharge,
// Vienna PFC with one SIC-750V-20mR die per position on the clip mount, D1 3x T79 N=39,
// 10-can split link, aux flyback, 3 fans, RATING strap 0 R.
import { AcDcBoard } from "../../packages/common-components/boards";
export default () => <AcDcBoard lanes={1} w={440} h={500} />;
