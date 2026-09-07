// SUPERSEDED — this rating is a MULTI-MODULE cabinet, not a single board pair.
//
// Kept buildable for reference and for the cell library it exercises, but it is not a product
// outline. Measured against the cells as actually placed (Vienna 89 x 161, LLC section 83 x 225):
//
//            AC-DC depth            DC-DC one-row width
//   30 kW      356 mm  fits           261 mm  fits
//   60 kW      528 mm  fits           528 mm  TOO WIDE for a 440 mm rack card
//  120 kW      872 mm  over           1062 mm too wide
//
// The DC-DC board is the binding constraint. Six LLC sections will not tile across a 440 mm card,
// and two rows break the single horizontal isolation barrier AND exceed the 560 mm depth class.
// Independently corroborated by the commercial survey: Wolfspeed's own 60 kW LLC PCBA is 490 mm
// long and does not fit a 19-inch rack either.
//
// So the MODULE is 30 kW, and the rating is how many go in the cabinet: 60 kW = 2, 120 kW = 4.
// That is also what the platform architecture already said -- "one repeatable ~10 kW cell pair
// instantiated 3/6/12x" -- and what docs/pcb-floorplan.md §2 concluded from five other
// measurements before any board was placed.
// 60kw DC-DC board (upper): 2x 3-phase LLC channel(s), banks, S/P matrix, output, MCU-LLC, CAN, HMI.
import { DcDcBoard } from "../../packages/common-components/boards";
export default () => <DcDcBoard channels={2} w={440} h={500} />;
