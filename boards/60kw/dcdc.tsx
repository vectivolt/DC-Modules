// 60kw DC-DC board (upper): 2x 3-phase LLC channel(s), banks, S/P matrix, output, MCU-LLC, CAN, HMI.
import { DcDcBoard } from "../../packages/common-components/boards";
export default () => <DcDcBoard channels={2} w={520} h={420} />;
