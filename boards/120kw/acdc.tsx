// 120kw AC-DC board (lower): input, EMI, precharge, 4x Vienna lane(s), DC link, MCU-PFC, aux.
import { AcDcBoard } from "../../packages/common-components/boards";
export default () => <AcDcBoard lanes={4} w={560} h={600} />;
