// 120kw DC-DC board (upper): 4x 3-phase LLC channel(s), banks, S/P matrix, output, MCU-LLC, CAN, HMI.
import { DcDcBoard } from "../../packages/common-components/boards";
export default () => <DcDcBoard channels={4} w={640} h={620} />;
