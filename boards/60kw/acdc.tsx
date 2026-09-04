// 60kw AC-DC board (lower): input, EMI, precharge, 2x Vienna lane(s), DC link, MCU-PFC, aux.
import { AcDcBoard } from "../../packages/common-components/boards";
export default () => <AcDcBoard lanes={2} w={460} h={420} />;
