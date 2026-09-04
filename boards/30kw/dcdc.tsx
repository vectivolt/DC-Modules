// 30kw DC-DC board (upper): 1x 3-phase LLC channel(s), banks, S/P matrix, output, MCU-LLC, CAN, HMI.
import { DcDcBoard } from "../../packages/common-components/boards";
export default () => <DcDcBoard channels={1} w={460} h={320} />;
