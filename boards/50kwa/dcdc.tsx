// 50 kW air DC-DC board (upper): electrically identical to the liquid board (E68a single-die clip mount).
import { DcDcBoard } from "../../packages/common-components/boards";
export default () => <DcDcBoard channels={1} pw={50} air w={440} h={500} />;
