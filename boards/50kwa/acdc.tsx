// 50 kW air AC-DC board (lower): the liquid board's electrical content cooled by heatsink extrusions and
// FOUR fans (fans 3+4 gang FAN_PWM2; TACH4 on harness way W39), RATING strap 15k.
import { AcDcBoard } from "../../packages/common-components/boards";
export default () => <AcDcBoard lanes={1} pw={50} air w={440} h={500} />;
