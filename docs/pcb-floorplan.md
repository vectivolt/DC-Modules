# PCB Floorplan Plan — sections first, then components (§30 rev B, two-board sandwich)

Status: **planning**. No PCB exists yet. This document fixes the *zones* — where each schematic
section lives on each board, which way power flows, where the isolation barriers run, and which
edges belong to the heatsinks — before any component is placed. Placement follows the zones; the
zones do not follow the placement.

Feasibility numbers are generated: `node calculations/floorplan-budget.mjs`.

Related: [interconnect.md](interconnect.md) (E17 sandwich), [insulation-coordination.md](insulation-coordination.md)
(creepage table), [thermal-report.md](thermal-report.md) (loss per block),
[magnetics.md](magnetics.md) (D1–D7 envelopes), [schematic-drawing-set.md](schematic-drawing-set.md)
(the 217 sections this maps).

---

## 0. Axis convention (from the hand sketch)

The sketch shows two boards, power entering one end of the AC-DC board and leaving the far end of
the DC-DC board, with the DC output, CAN and the display/buttons grouped on that far face. That
fixes a **straight-through module**, not a U-turn:

```
        REAR FACE                                                    FRONT FACE
   ┌───────────────┐                                            ┌───────────────┐
   │ 3φ AC studs   │                                            │ DC+ / DC− studs│
   │ PE stud       │                                            │ CAN H/L (iso)  │
   │ air EXHAUST   │                                            │ 2-digit display│
   │ fans          │                                            │ SET / ▲▼ buttons│
   └───────────────┘                                            │ air INLET+filter│
                                                                └───────────────┘

   X = 0 (rear) ────────────── power flow ──────────────────► X = L (front)
                              ◄───────── airflow ──────────────

   UPPER BOARD (DC-DC)   bus in → LLC legs → tanks → XFMR ║ JBS → banks → S/P → out
   ═══════════════════════════════════════════════════════════════════════════════
   inter-board TUNNEL    magnetics stand here, in the airstream
   ═══════════════════════════════════════════════════════════════════════════════
   LOWER BOARD (AC-DC)   AC entry → EMI → precharge → Vienna PFC → DC link → B2B studs
```

- **X** runs rear→front: the power-flow axis on both boards, and the airflow axis reversed.
- **Y** is board width, used for the lateral control/sensing strip.
- **Z** is the sandwich stack: lower extrusion / AC-DC board / tunnel / DC-DC board / upper extrusion.
- Power flows **rear→front on both boards**. The board-to-board handoff (DCP/DCN/PE M8 pillars) is
  therefore at the **front** of the AC-DC board and the **rear** of the DC-DC board — the two studs
  sets are at *different* X, connected by the pillar height, not stacked over each other. See §7.

### Why airflow opposes power flow

Air enters at the front (output/HMI face) and exhausts at the rear (AC face). Two reasons, both
measurable:

1. **Nothing downstream of the exhaust gets preheated.** The EMI filter dissipates 49 / 132 / 248 W
   ([thermal-report.md](thermal-report.md)) — the largest single airstream load on the AC-DC board.
   Placed at the exhaust it heats only the air leaving the box. Placed at the inlet it raises the
   inlet temperature of *every* magnetic and every electrolytic behind it.
2. **The life-limiting parts get the coldest air.** The 470 µF/450 V electrolytics set the module's
   service life (Arrhenius: ~2× life per 10 K cooler). The bank capacitors sit near the front on the
   DC-DC board; the DC-link bank sits mid-board on the AC-DC board. Both are ahead of the EMI filter
   and the PFC chokes in the airstream.

Front inlet also means the **filter and fans are at the service face**, and the enclosure runs at
positive pressure so dust enters only through the filter.

> **Open — needs a mechanical decision.** Push (fans at the front inlet) gives the fans the coldest,
> densest air and positive pressure, but costs front-panel area that the DC studs, CAN, display and
> buttons also want. Pull (fans at the rear) frees the front panel but runs the fans in the hottest
> air. At 120 kW this matters: 4× 120 mm fans is 480 mm of face width. Recommendation is **pull at
> the rear**, front panel = filter grille + connectors + HMI. Confirm before the enclosure drawing.

---

## 1. What the floorplan may not violate

These are frozen; the zones are built around them, not negotiated with them.

| Constraint | Value | Source |
|---|---|---|
| Board outlines | 420×300 + 460×320 / 460×420 + 520×420 / 560×600 + 640×620 mm | architecture.md §Scaling |
| Layers | 6, both boards | bom-guide.md |
| Semis to heatsinks | AC-DC semis → **lower** extrusion, DC-DC semis → **upper** extrusion, component faces inward | interconnect.md E17 |
| Magnetics | stand in the **inter-board tunnel**, in the primary airstream | interconnect.md E17 |
| B2B power | 3× M8 stud pairs DCP / DCN / PE, stud-stud creepage **≥14 mm**, ≤50 µΩ per joint | interconnect.md, busbar-drawings.md |
| B2B signal | 16-way, 300 mm **shielded** harness, shield to PE at the AC-DC end only | interconnect.md |
| Clearance / creepage | 300 Vrms 3.0/4.0 · 830 VDC bus 4.0/5.5 · 1000 VDC out 4.5/6.3 · **reinforced pri↔sec 8.0/12.6 + routed slots** | insulation-coordination.md |
| Y-caps | 3 line-PE + 2 output-PE, Y1 440 VAC class, only across defined barriers | insulation-coordination.md |
| CAN domain | CGND **floats**, 4 mm to everything, 1 MΩ ∥ 4.7 nF bleed to DGND | insulation-coordination.md |
| Bus busbar | DC+/DC− laminated pair ≤2 mm apart, ≤40 nH per 300 mm | busbar-drawings.md |
| Fans | 2 / 2 / 4 × 120×38 mm, ~110 Pa class | thermal-report.md |

---

## 2. Feasibility of the frozen outlines — run before trusting them

`calculations/floorplan-budget.mjs` asks two questions the outline alone cannot answer.

**EDGE.** Every power semiconductor is a TO-247 that must reach an outer extrusion, so it needs a
clamp-bar rail. Perimeter is a consumable resource:

| board | outline | TO-247 | rail needed | usable perimeter (70 %) | use |
|---|---|---|---|---|---|
| 30kw-acdc | 420×300 | 16 | 320 mm | 1008 mm | 32 % |
| 30kw-dcdc | 460×320 | 30 | 600 mm | 1092 mm | 55 % |
| 60kw-acdc | 460×420 | 31 | 620 mm | 1232 mm | 50 % |
| 60kw-dcdc | 520×420 | 60 | 1200 mm | 1316 mm | **91 %** |
| 120kw-acdc | 560×600 | 61 | 1220 mm | 1624 mm | 75 % |
| 120kw-dcdc | 640×620 | **120** | 2400 mm | 1764 mm | **136 % — impossible** |

**FILL.** Dominant parts only — magnetics, electrolytics, TO-247 rails, relays, shunt — before any
creepage, busbar, control or sensing copper: 48 / 47 % at 30 kW, 59 / 63 % at 60 kW, 68 / 70 % at
120 kW. The 55 % planning gate is exceeded on four of six boards.

### What this means

**A perimeter-only device rail is a 30 kW strategy.** It is marginal at 60 kW and arithmetically
impossible at 120 kW. Three ways out, in order of preference:

1. **Interior clamp rails.** Cut windows in the PCB over raised bosses on the extrusion; devices lie
   flat on the boss with leads bent up into the board at the window edge. This turns "edge" into "any
   straight run", and is what the density actually requires above 60 kW. Costs a machined (not plain
   extruded) heatsink face.
2. **Cut the device count.** 96 of the 120 devices on the 120 kW DC-DC board are 20 A secondary JBS,
   which are also the single largest loss in the module (1441 W). A 40 A-class part halves the count
   to 48 and the rail to 960 mm — inside the perimeter budget. The SR variant already costed in
   [thermal-report.md](thermal-report.md) (−854 W at 120 kW) does better still.
3. **Split the DC-DC board per cell.** 4× ~10 kW cards on a common output bus instead of one
   640×620 mm board. This also removes a separate problem: **640×620 mm exceeds the usable area of a
   standard 457×610 mm (18″×24″) production panel**, so the 120 kW pair as drawn is not a normal
   fab item. Worth confirming against a real fab quote before the outline is trusted.

> Recommendation: adopt **(1) interior rails** as the mechanical baseline for 60 and 120 kW, and
> raise **(2) the secondary rectifier count** as an electrical trade — it improves floorplan, loss
> and cost simultaneously. Treat **(3)** as the fallback if the fab panel check fails.

---

## 3. AC-DC board (lower) — zone plan

33 sections at 30 kW. Bands run across the board along X; the control/sense strip runs along one
long edge in Y.

```
 REAR ═══════════════════════════════ AC-DC BOARD ══════════════════════════════ FRONT
 (AC in, exhaust)                                                        (to B2B pillars)

 ┌──────────┬──────────────┬─────────┬──────────────────────────┬─────────────┐
 │ Z1       │ Z2           │ Z3      │ Z4  VIENNA PFC POWER     │ Z5 DC LINK  │
 │ AC ENTRY │ EMI FILTER   │ PRE-    │  ×N lanes of 3 phases    │             │
 │ + SURGE  │              │ CHARGE  │                          │             │
 ├──────────┴──────────────┴─────────┴──────────────────────────┴─────────────┤
 │ Z6 AC-SENSING pods (local to each measured node)                            │
 ├─────────────────────────────────────────────────────────────────────────────┤
 │ Z7 CONTROL STRIP  ·  Z8 AUX POWER            (one long edge, full length)   │
 └─────────────────────────────────────────────────────────────────────────────┘
   ▲ device rail (lower extrusion) along the opposite long edge + interior rails
```

| Zone | Sections | Contents | Placement rule |
|---|---|---|---|
| **Z1 AC ENTRY** | `INPUT-EMI / AC-ENTRY`, `INPUT-EMI / SURGE` | AC studs, fuses, MOV Δ, GDT | Hard against the rear face. Studs on the face; fuses and MOV in the first 40 mm. |
| **Z2 EMI FILTER** | `INPUT-EMI / EMI-FILTER` | 2× 3-φ CM choke (D7), DM choke (D6), X caps, 3× Y1 to PE | **Full-width band. No switching copper on any layer behind, beside or beneath it.** Its own PE reference island, bonded to chassis at one point on the rear face. Input side and output side of the filter must not face each other. |
| **Z3 PRECHARGE** | `INPUT-EMI / PRECHARGE` | 2× 33 Ω, HF167F bypass relay, mirror contact | Between filter and PFC. Resistors need their own thermal space — they are pulse-rated, not continuous. |
| **Z4 VIENNA PFC** | `VIENNA-PFC / PHASE-A/B/C` ×N | per phase: D1 choke, common-source SiC pair, 2× JBS to rails, RC + RCD clamp | **One phase = one contiguous cell**: choke in the tunnel, its 5 TO-247 on the adjacent rail segment, clamp and snubber inside the cell. Cells repeat along Y for the 3 phases, along X for the N lanes. Hot loop (device pair + clamp + local film cap) closed inside the cell, target < 5 mm² loop area. |
| **Z5 DC LINK** | `DC-LINK / LINK-BANK-n`, `DISCHARGE`, `BUS-STUDS` | 2×(5…18)× 470 µF, film, 640 Ω discharge FET, DCP/DCN/PE M8 pillars | Front band. Electrolytics in the coolest available air on this board. Split-bus midpoint stays on this board. Pillars on the front edge, ≥14 mm stud-stud. |
| **Z6 AC-SENSING** | `LINE-CTS`, `SENSE-VAC1/2/3`, `SENSE-VBUS`, `SENSE-VMID`, `ANALOG-MID`, `ISO-BIAS`, `NTC`, `STAR` | line CTs, 8× series 1206 HV dividers, iso amps | **Sense pod at the measured node, not at the MCU.** Divider + iso-amp sit at the HV node; only the isolated output travels to the control strip. Line CTs at Z1, bus/mid dividers at Z5. `STAR` = the analog star point, one location, on the control strip. NTC ×2: one at the *inlet* (front, per interconnect.md T_INLET), one on the heatsink. |
| **Z7 CONTROL** | `CONTROL / MCU`, `SAFETY`, `SWD`, `COIL-DRIVER`, `GROUNDING`, `RAIL-MON` | GD32G553, 74HC11 interlock, SWD header, ULN2803A, single-point control-ground bond | Continuous strip along one long edge, full board length. **`GROUNDING` defines the single-point control-ground bond for the whole module** (interconnect.md) — fix its location first; everything else references it. SWD header reachable with the sandwich closed, or at least with only the top extrusion off. |
| **Z8 AUX POWER** | `AUX-POWER / FLYBACK`, `RAILS`, `BUCK-3V3`, `FANS`, `INTERCONNECT` | bus-fed flyback (D4 ETD34, 1700 V SiC), ±15/24/5 V rails, 3V3 buck, fan headers, JICA | At the control-strip end nearest the B2B pillars — the flyback is bus-fed from DCP→MID, so it wants to be near Z5, and `INTERCONNECT` wants to be near the harness exit. Fan headers at the rear (fans are at the exhaust). |

### AC-DC rules that outrank tidiness

- The **EMI filter band is sacred**. If a zone has to shrink, it is not this one. Any switching-node
  copper that passes behind the filter defeats it, and no amount of component quality recovers it.
- **Each Vienna phase is a self-contained cell.** A phase's choke, switch pair, rail diodes and
  clamp belong together; interleaved lanes repeat the cell, they do not interleave its parts.
- The **midpoint** is a sensed node with a balancing loop — it must be a low-impedance plane region,
  not a trace, and its sense tap must be Kelvin.
- **Line CTs must see only line current** — keep them out of the fringing field of the DM/CM chokes
  they sit next to (§6).

---

## 4. DC-DC board (upper) — zone plan

28 sections at 30 kW. **This board is cut in two by a reinforced isolation barrier** (8.0 mm
clearance / 12.6 mm creepage + routed slots). Everything else is secondary to that line.

```
 REAR ═══════════════════════════════ DC-DC BOARD ══════════════════════════════ FRONT
 (from B2B pillars)                                                   (DC out, CAN, HMI, inlet)

 ┌────────┬──────────────┬─────────┬═══════════╦─────────────┬──────────┬────────────┐
 │ Y1     │ Y2 LLC LEGS  │ Y3      │ Y4 XFMR   ║ Y5 SECONDARY│ Y6 S/P   │ Y7 OUTPUT  │
 │ BUS IN │  ×3N legs    │ TANKS   │ ROW       ║ RECTIFIERS  │ MATRIX   │            │
 │        │              │         │ (barrier) ║ + BANKS     │          │            │
 ├────────┴──────────────┴─────────┴═══════════╬─────────────┴──────────┴────────────┤
 │ Y8 CONTROL STRIP (primary-referenced)       ║  Y9 secondary sense pods (isolated)  │
 └─────────────────────────────────────────────╩──────────────────────────────────────┘
   PRIMARY  ◄────────────── reinforced barrier ──────────────►  SECONDARY
   ▲ primary device rail (upper extrusion)      ▲ secondary device rail — ≥8 mm apart in air
                                                              Y10 HMI/CAN = front daughter card
```

| Zone | Sections | Contents | Placement rule |
|---|---|---|---|
| **Y1 BUS IN** | `LLC-LEGS / BUS-IN` | film commutation caps, B2B stud landing | Rear edge, directly at the pillars. Film caps between the pillars and the first leg — the bus loop starts here. |
| **Y2 LLC LEGS** | `LLC-LEGS / LEG-n` (3 per channel) | SiC half-bridge pairs + NSI6611 drivers + DESAT | **One leg = one cell**: 2 TO-247 on the rail, driver within 15 mm of the gate pins, bootstrap/iso bias local. Legs repeat along Y for the 3 phases, along X for the N channels. Gate loop and power loop both closed inside the cell. |
| **Y3 TANKS** | `LLC-TANKS / TANK-n` | 4× 46 nF 1200 V PP + D2 trim inductor | Immediately after its leg. The tank carries the full resonant current — it is a *power* zone, not a passive one. Trim inductor is a gapped toroid: see §6. |
| **Y4 TRANSFORMER ROW** | (D3 ×3 per channel) | 3× PQ50/50 stacked, TIW secondaries, 1-turn Cu shield to primary star | **This row *is* the barrier.** Cores straddle the routed slot; primary pins on the primary side, secondary pins on the secondary side, nothing crossing. Shield lead returns to the primary star only. |
| **Y5 SECONDARY RECTIFIERS + BANKS** | `BANKS-SP / BANK-A`, `BANK-B` | 2× JBS bridge per section, bank electrolytics + film | Secondary side. Bridges on the secondary device rail; bank caps in the coolest air (front-ward). Banks A and B float — treat **both** at 1000 V class to PE and to each other. |
| **Y6 S/P MATRIX** | `BANKS-SP / SP-MATRIX`, `BLEEDERS` | K_PAR_A/B + 10 Ω pre-insertion, K_SER, K_OUT, commanded bleeders | Guarded island — insulation-coordination.md calls this out explicitly. Relay lugs are M6 busbar joints, not PCB pads. Mirror contacts routed as a separate readback group. |
| **Y7 OUTPUT** | `OUTPUT-SENSING / OUTPUT` | output filter, 4-terminal manganin shunt, DC± studs | Front face. **Kelvin taps on the shunt are untouchable** — no other copper in their loop. OUT± keeps 6.3 mm to chassis everywhere. |
| **Y8 CONTROL** | `CONTROL / MCU`, `SAFETY`, `SWD`, `COIL-DRIVER`, `GROUNDING`, `BUCK-3V3`, `INTERCONNECT` | MCU-LLC, interlock, relay coil driver, 15→3.3 V buck, JICB | Strip along one long edge, **primary side only, stopping at the barrier**. Primary-referenced because its rails arrive over the harness from the AC-DC board's single-point ground. Relay *coils* are driven from here; relay *contacts* are secondary — the relay body is itself a barrier component. |
| **Y9 SECONDARY SENSE** | `OUTPUT-SENSING / SENSE-VBKA/VBKB/VOUT`, `ANALOG-MID`, `ISO-BIAS`, `NTC` | bank/output dividers, iso-shunt amp, isolated bias | Pods on the **secondary** side at their measured nodes, each with its own isolated bias, each crossing the barrier once through its isolator. No secondary-referenced signal reaches the MCU un-isolated. |
| **Y10 HMI + CAN** | `COMMS-HMI / HMI`, `COMMS-HMI / CAN` | 2-digit display, 74HC595 + digit mux, 2 buttons, isolated CAN + floating CGND | **Front-panel daughter card — see below.** |

### The HMI/CAN problem, and the fix

The control strip is primary-referenced and stops at the barrier. The display, buttons and CAN
connector are on the **front** face, which is past the secondary zone. Running primary-referenced
logic the length of the board, over or beside the floating banks and the 1000 V output, is the
worst wire in the module.

**Put the HMI and the isolated CAN transceiver on a small front-panel daughter card**, joined to the
main board by a shielded ribbon routed in the tunnel along the board edge — above copper, not across
it — entering the main board on the primary side at the control strip. Then:

- no SELV logic exists anywhere past the barrier on the main board;
- the CAN isolator sits on the daughter card, so the floating CGND domain and its 4 mm keep-out are
  contained to that card and its connector;
- the display window, button actuators and CAN access are all on one part that the enclosure already
  has to align ([dfm-production.md](dfm-production.md) step 7);
- the ribbon is a defined, testable crossing instead of a long uncontrolled one.

Cost: one extra small PCB and one connector pair. It is the cheapest item in this document and it
removes the hardest routing problem on the board.

### The shared extrusion is an isolation path

Primary FETs and secondary JBS bolt to **the same upper extrusion**. That extrusion must be
**PE-bonded**, so the structure is primary→pad→PE and secondary→pad→PE — two basic barriers in
series, not one reinforced gap. Consequences:

- each device's insulating pad must be qualified against its own barrier to PE, and the hipot plan
  must test both, not just one;
- the **primary and secondary device rails must be separated in air on the extrusion**. 8 mm is the
  reinforced clearance minimum; align the rail gap with the PCB barrier slot and take ≥20 mm so the
  mechanical and electrical barriers are the same line;
- the extrusion's PE bond is a safety conductor — spec it (bond strap, ≥25 A per the EOL earth-bond
  test), do not rely on the mounting screws.

---

## 5. MOSFET and heatsink strategy

The sketch's note — *"better to place the mosfets in the boundary so that we can attach proper
heatsink"* — is right, with one qualification the numbers force.

**Rail rules (all SKUs)**

1. **Devices sit on rails, never in the field.** A rail is a straight run of TO-247 at 20 mm pitch
   with a continuous clamp bar over the tabs, M4 at 1.2 N·m, phase-change TIM 0.5 K·cm²/W class,
   torque pattern centre-out ([dfm-production.md](dfm-production.md) step 5).
2. **A rail segment belongs to one cell.** Vienna phase = 5 devices = 100 mm. LLC leg = 2 devices =
   40 mm. Secondary bridge = 8 devices = 160 mm. Do not mix cells on a segment; the hot loop must
   close inside the cell.
3. **The gate driver is on the board directly behind its rail segment**, within 15 mm of the gate
   pins, with its own local bias. Gate and Kelvin-source returns run as a pair, never split.
4. **Primary and secondary rails on the DC-DC extrusion are ≥20 mm apart**, aligned to the PCB
   barrier slot (§4).
5. **Perimeter first, interior rails when perimeter runs out** — 60 and 120 kW need interior rails
   (windows over machined bosses). Interior rails are *better* electrically: they shorten the path
   from the device to its DC-link capacitor. They cost a machined heatsink face.

**Mounting orientation.** Two options; pick one and hold it family-wide:

| | tab down on the extrusion, leads bent up | device standing, tab clamped to a vertical wall |
|---|---|---|
| board area | window in the PCB per rail | narrow strip at the board edge only |
| thermal | direct, short path, whole tab on the sink | direct, but the wall must be part of the extrusion |
| assembly | insert → bend → clamp; loose-fit then clamp per DFM step 2 | insert vertical, clamp bar horizontal |
| interior rails | **possible** | not possible |
| verdict | **recommended** — it is the only option that scales to 120 kW | fine at 30 kW only |

---

## 6. Magnetics placement

All magnetics stand in the **inter-board tunnel** in the primary airstream (E17). They are the
tallest parts and they set the sandwich height.

| Part | Qty | Envelope | Loss | ΔT limit |
|---|---|---|---|---|
| D1 PFC choke | 3/6/12 | ⌀89 mm finished, M6 centre bolt, ~0.9 kg | 33.5 W each | 45 K |
| D3 LLC transformer | 3/6/12 | 3× PQ50/50 + 4× M4 clamp | 20.5 W each | 55 K hotspot |
| D2 trim inductor | 3/6/12 | ⌀45 mm | in tank budget | 40 K |
| D6 DM choke | 1 (2 @120 kW) | ⌀57 / 67 / 89 mm | in filter budget | 45 K |
| D7 CM choke | 2 stages | ⌀72 / 90 / 112 mm | in filter budget | 45 K |

**Rules**

1. **Gapped cores are field sources; distributed-gap toroids are not.** D3 is centre-leg ground for
   Lm = 63 µH and D2 is a gapped sendust toroid — both radiate. D1, D6 and D7 are distributed-gap
   sendust/nanocrystalline and are comparatively quiet. So the keep-out budget goes to the
   transformers and trim inductors, not the chokes.
2. **No small-signal copper within one core height of a gapped core**, and orient the gap axis so
   its fringing field is perpendicular to any nearby sense loop. This is a hard constraint against
   the resonant CTs, which sit close to the tank by necessity.
3. **Mechanical mount, not solder mount.** D1 is 0.9 kg on an M6 centre bolt into a standoff, with a
   silicone pad; the winding leads are M5 ring lugs, torque 5 N·m. The PCB carries no D1 mass.
4. **Airstream, not wake.** Arrange chokes and transformers so no magnetic sits directly downstream
   of another wherever the board allows; where it cannot be avoided, the downstream part must be the
   one with the larger ΔT margin (transformer 55 K > choke 45 K).
5. **The transformer row is on the isolation barrier** and its position is therefore fixed by §4,
   not by thermal preference. The chokes have the freedom; the transformers do not.
6. **Height check.** D1 finished height plus clearance sets the tunnel, and the tunnel sets module
   height. This is the number to compare against commercial modules — pending research, treat the
   tunnel as the module's defining dimension and design the extrusion fin depth around what is left.

---

## 7. Board-to-board interface

- **Power:** DCP / DCN / PE M8 stud pairs on pillars. They are at the **front of the AC-DC board**
  and the **rear of the DC-DC board**, so the pillars are not vertical — the pair is offset in X by
  the difference in board length. Either accept an angled/stepped pillar, or set the boards' X
  origins so the two stud sets align vertically. **Aligning them is worth the outline change**:
  vertical M8 pillars are a bolted joint the EOL milliohm test can verify, an angled one is not.
- **Loop area:** DCP and DCN pillars adjacent and as close as ≥14 mm stud-stud creepage allows, so
  the board-to-board bus is a laminated pair, not a loop. Target ≤40 nH per 300 mm carries over from
  [busbar-drawings.md](busbar-drawings.md).
- **PE pillar** is the module's structural earth between the two extrusions — it also carries the
  extrusion PE bond of §4.
- **Signal:** 16-way shielded harness, shield to PE at the AC-DC end only. Route it along the
  control-strip edge of both boards, physically separated from the DCP/DCN pillars — the harness
  carries the hardware kill line and the internal link, and a bus transient coupled into either is a
  module-level fault.

---

## 8. Stackup and copper plan (6 layers, both boards)

| Layer | Function | Notes |
|---|---|---|
| L1 | power components + power copper + control components | 2 oz min; heavy-current shapes, not traces |
| L2 | reference: control GND under the control strip, **PE island under the EMI filter**, secondary GND under the secondary zone | segmented by domain, never a single global plane |
| L3 | DCP plane in the bus region; signal elsewhere | |
| L4 | DCN plane in the bus region; signal elsewhere | L3/L4 as a close-coupled pair gives the bus its low inductance |
| L5 | signal routing, gate/Kelvin pairs | |
| L6 | power return copper, thermal spreading | 2 oz min |

**Non-negotiable:** **every layer carries the isolation barrier.** A plane that crosses the barrier
on an inner layer defeats a barrier that looks correct on the top. The routed slots called for in
[insulation-coordination.md](insulation-coordination.md) go through all six layers, and the DRC must
have a rule that proves it rather than a designer who remembers it.

**Domain rule:** reference copper is partitioned by *component placement*, not by cutting slots in a
plane you then route across. Four references exist and must never be bridged except at their defined
single points: PE (chassis), primary control GND (bonded once, on the AC-DC board), secondary/output
GND, and the floating CGND.

---

## 9. Verify from each side

The check that finds the defect is the one performed from the viewpoint where the defect is visible.
Six viewpoints, each with its own question.

| View | The question | What it catches |
|---|---|---|
| **Top of each board** | does the power flow read left-to-right without doubling back? Is each cell contiguous? | cells split across zones, tangled bus |
| **Bottom of each board** | is there switching copper behind the EMI filter, the sense pods or the control strip? Does any plane cross the barrier? | the classic invisible EMI-filter defeat |
| **Rear face** | AC studs, PE, fan cutouts, exhaust area — is the AC entry clear of everything else, and is the exhaust unobstructed by magnetics? | connector collision, blocked exhaust |
| **Front face** | DC studs, CAN, display window, button actuators, filter grille — do they all fit the face, with the fan decision from §0 resolved? | front-panel overcommit (the 120 kW fan-vs-connector clash) |
| **Both long sides** | are the device rails continuous and clamp-accessible with the sandwich assembled? Can a clamp bar actually be torqued? | rails that cannot be assembled |
| **Sandwich closed (Z)** | tallest part vs tunnel height; harness and pillar routing; SWD and test-point access; airflow path unobstructed end to end | the assembly-order failure that only appears at mate |

**Per-board gate list, to be automated the way the schematic gates were:**

1. no switching-node copper within the EMI filter's footprint on any layer — geometric check
2. barrier slot continuous through all 6 layers, ≥8.0 mm clearance / ≥12.6 mm creepage — DRC rule
3. every creepage class from [insulation-coordination.md](insulation-coordination.md) as its own net-class rule
4. every TO-247 on a rail; every rail segment single-cell; every driver ≤15 mm from its gate pins
5. every gapped-core keep-out honoured against small-signal nets
6. Kelvin pairs (shunt, midpoint, source-sense) unbroken and un-shared
7. dominant-part fill and edge use inside the §2 gates — `floorplan-budget.mjs`
8. thermal: every rail's device count × per-device loss vs that face's Rth budget

---

## 10. Open items

| # | Item | Why it blocks | Owner |
|---|---|---|---|
| 1 | Fan push-vs-pull and front-panel budget (§0) | sets the front face and the 120 kW fan/connector clash | mechanical |
| 2 | Interior clamp rails vs secondary device-count reduction (§2) | 120 kW DC-DC is impossible without one of them | electrical + mechanical |
| 3 | 640×620 mm vs fab panel limit (§2) | the 120 kW pair may not be a standard fab item | fab RFQ |
| 4 | B2B pillar alignment — change an outline to make the pillars vertical? (§7) | bolted-joint verifiability | mechanical |
| 5 | HMI/CAN daughter card (§4) | removes the only long SELV run; needs a part number | electrical |
| 6 | D3 transformer finished envelope (VERIFY in `floorplan-budget.mjs`) | the fill numbers move with it | magnetics vendor |
| 7 | Commercial reference dimensions — module envelope, power density, airflow | tells us whether these outlines are competitive or oversized | research (in progress) |
