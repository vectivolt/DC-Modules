// 30kw AC-DC board (lower): input, EMI, precharge, 1x Vienna lane(s), DC link, MCU-PFC, aux.
import { AcDcBoard } from "../../packages/common-components/boards";
export default () => <AcDcBoard lanes={1} w={440} h={500} />;
