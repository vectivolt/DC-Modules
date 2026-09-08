// 50kwa AC-DC board (E44 AIR variant): the UPGRADED-30 path at 50 kW — same 1-lane structure,
// same engine selections as the liquid E42 (103 uH choke, 160 A gG NH00, 250 A precharge,
// 16-can link, revved tank class), cooled by heatsink extrusions + FOUR fans (fans 3+4 gang
// FAN_PWM2; every tach monitored — TACH4 on the E44 way W39/pin 90).
import { AcDcBoard } from "../../packages/common-components/boards";
export default () => <AcDcBoard lanes={1} pw={50} air w={440} h={500} />;
