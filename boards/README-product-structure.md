# Product structure

**The module is 30 kW.** Higher ratings are cabinets of 30 kW modules, not bigger boards.

|  | AC-DC depth | DC-DC single-row width | verdict |
|---|---|---|---|
| 30 kW | 356 mm | 261 mm | **fits a 3U rack card** |
| 60 kW | 528 mm | 528 mm | DC-DC too wide for 440 mm |
| 120 kW | 872 mm | 1062 mm | far over |

Measured from the cells as actually placed — Vienna phase 89 × 161 mm, LLC section 83 × 225 mm.
The DC-DC board is the binding constraint: six LLC sections will not tile across a 440 mm rack card,
and two rows break the single horizontal isolation barrier *and* exceed the 560 mm depth class.

This is the same conclusion `docs/pcb-floorplan.md` §2 reached from five independent measurements
before anything was placed (secondary device rail at 234 %, 902 mm of board depth, over a standard
fab panel, 560 mm of front face needed in 440, 9.4 m/s exhaust velocity) — and the same one the
commercial survey reached: Wolfspeed's 60 kW LLC PCBA is 490 mm long and does not fit a 19-inch
rack either.

## What ships

| board | outline | parts | state |
|---|---|---|---|
| `30kw/acdc` | 440 × 500 | 271 | placement clean, EMI/thermal pass, planes assigned |
| `30kw/dcdc` | 440 × 500 | 282 | placement clean, barrier-bounded planes, BARRIER 0 |
| `control-card` | 120 × 80 | 43 | clean; one card serves both roles |

`60kw/` and `120kw/` are kept buildable for reference and because they exercise the cell library at
higher lane counts, but they are not product outlines.
