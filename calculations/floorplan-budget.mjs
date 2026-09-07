#!/usr/bin/env node
// floorplan-budget.mjs — does the frozen board outline actually FIT the sections?
//
// The schematic is closed; the PCB is not started. Before any placement work, two questions decide
// whether the frozen outlines (architecture.md §Scaling) are buildable at all:
//
//   EDGE   every power semiconductor is a TO-247 that must clamp to an outer extrusion, so it has
//          to sit on a board-edge rail. Edge length is therefore a CONSUMABLE RESOURCE, and the
//          question is whether the devices fit around the perimeter.
//   AREA   the dominant physical parts (magnetics, electrolytics, TO-247 rails, relays) consume
//          board area before a single trace exists. Above ~55 % dominant-part fill there is no
//          room left for creepage, busbars, control and sensing.
//
// Both are answered per board per SKU. Everything here traces to a document; the two numbers that
// are ENGINEERING CHOICES rather than measurements are RAIL_PITCH and USABLE_EDGE, both stated
// below and both the first thing to change if a fab or a mechanical drawing disagrees.
//
// Run: node calculations/floorplan-budget.mjs

// --- inputs, all traced -----------------------------------------------------------------------

// architecture.md §Scaling: "Board pair per SKU: 420×300+460×320 / 460×420+520×420 / 560×600+640×620"
const BOARDS = {
  "30kw":  { acdc: [420, 300], dcdc: [460, 320] },
  "60kw":  { acdc: [460, 420], dcdc: [520, 420] },
  "120kw": { acdc: [560, 600], dcdc: [640, 620] },
};

// TO-247 counts from calculations/out/bom-<sku>.csv (every line whose description says TO-247).
//
// The DC-DC count is SPLIT, and that split is the whole point. Primary FETs and secondary JBS sit on
// opposite sides of a reinforced barrier, so they cannot share a rail: their perimeters are two
// separate resources. Pooling them is a like-with-unlike comparison and it flatters the result --
// the first version of this script reported 30kw-dcdc at a comfortable 55 % when its secondary rail
// alone is at 96 %, and 60kw-dcdc at 91 % when its secondary is at 158 %.
const TO247 = {
  "30kw":  { acdc: 16, dcdc: 30,  dcdcPri: 6,  dcdcSec: 24 },   // 6 SG2M023120LJ + 24 C4D20120D
  "60kw":  { acdc: 31, dcdc: 60,  dcdcPri: 12, dcdcSec: 48 },
  "120kw": { acdc: 61, dcdc: 120, dcdcPri: 24, dcdcSec: 96 },
};
// Barrier position along X, from the zone plan in docs/pcb-floorplan.md §4 (bus .09 + legs .20 +
// tanks .14 + xfmr .14). Everything before it is primary, everything after it is secondary.
const BARRIER_X = 0.57;

// Dominant-area parts. Footprint envelopes from docs/footprints-to-draw.md (which states the build
// rule: a toroid's finished OD is core OD + 2×4 mm winding, courtyard = OD + 2 mm) and from
// docs/magnetics.md D1/D3/D6/D7. VERIFY marks an envelope that a first-article drawing must close.
const PARTS = {
  "30kw": {
    acdc: [
      ["D1 PFC choke",        3, 89, 89],   // 3× T79 stack: OD79 + 8 winding + 2 courtyard
      ["D6 DM choke",         1, 57, 57],   // OD47 + 8 + 2
      ["D7 CM choke ×2 stage", 2, 72, 72],  // OD62 + 8 + 2
      ["DC-link electrolytic", 10, 37, 37], // 470 µF/450 V snap-in, 35 mm dia + courtyard
      ["HF167F precharge bypass", 1, 52, 36],
    ],
    dcdc: [
      ["D3 LLC transformer",  3, 150, 60],  // VERIFY: 3× PQ50/50 stacked + bobbin + 4× M4 clamp
      ["D2 trim inductor",    3, 68, 56],   // D2 rev C: 2×PQ50/50 stack envelope (audit F1)
      ["bank electrolytic",   8, 37, 37],
      ["HFE82V HV relay",     5, 52, 36],   // S/P matrix + K_OUT + pre-insertion
      ["shunt 100 A",         1, 40, 15],
    ],
  },
};
// 60/120 kW scale the per-cell items ×2/×4; the filter chokes grow a core size instead of counting up
const SCALE = { "30kw": 1, "60kw": 2, "120kw": 4 };
const FILTER_OD = { "30kw": [57, 72], "60kw": [67, 90], "120kw": [2, 112] }; // [DM, CM] finished dia

// --- target envelope: a 19-inch rack module, because that is what the market ships ---------------
//
// Commercial EV fast-charge power modules are 19-inch rack cards. That fixes WIDTH and HEIGHT and
// leaves DEPTH as the only free dimension -- which inverts the usual instinct to draw a wide, shallow
// board. A board wider than the rack does not become a product no matter how well it is laid out.
const RACK = {
  widthMax: 440,     // mm usable between 19-inch rails for a 3U chassis (482.6 mm nominal face)
  depthMax: 560,     // mm typical maximum module depth in this class
  heightU: 133.35,   // mm 3U
};

// The FRONT face carries the fans plus the display and switch; the REAR face carries AC in and
// DC out + CAN at diagonally opposite corners. So the front face is a width budget of its own, and
// it is an independent check on whether a rating fits one module.
const FANS = { "30kw": 2, "60kw": 2, "120kw": 4 };   // thermal-report.md
const LOSS = { "30kw": 844, "60kw": 1684, "120kw": 3347 };  // W total, thermal-report.md rev D

// Rear-face air budget. Both HV connectors now sit on the REAR face, which is also the exhaust, so
// they take vent area away from the air. Two corners of four: the connectors occupy roughly one
// quarter of the face each, leaving half for venting.
const CONN_FACE = [180, 60];   // mm each connector zone (AC studs / DC+CAN plug) on a 3U face
const GRILLE_OPEN = 0.40;      // perforated grille open-area fraction
const AIR_DT = 20;             // K rise inlet-to-exhaust; 55 C ambient in, ~75 C out
const CP = 1005, RHO = 1.2;    // J/kg.K, kg/m^3
const FAN_SIZE = 120;                                // mm; 120 is the largest that fits a 3U face
const HMI_WIDTH = 80;                                // mm for the 2-digit display + switch cluster

// Height stack-up of the sandwich, outer face to outer face. The tunnel is set by the TALLEST part
// standing in it, which is the D1 choke: 3 stacked H17 toroids = 51 mm of core plus the winding
// build. Everything else here is a mechanical allowance, labelled so it can be argued with.
// Two variants, because the device-mounting choice changes the height.
//   FLAT   TO-247 lying on the extrusion under the board -> needs an 8 mm gap on each side
//   RIDGE  TO-247 STANDING on a front-to-back ridge, reached through a slot in the PCB, so the
//          device body rises into the tunnel (which already has 62 mm for the chokes) and the board
//          can sit almost on the extrusion. Saves 12 mm, and that is the difference at 3U.
const STACK_FLAT = [
  ["heatsink fins (lower)",  20],
  ["extrusion base (lower)",  6],
  ["device + clamp gap",      8],
  ["AC-DC board",           2.4],
  ["tunnel — D1 choke",      62],
  ["DC-DC board",           2.4],
  ["device + clamp gap",      8],
  ["extrusion base (upper)",  6],
  ["heatsink fins (upper)",  20],
];
const STACK_RIDGE = STACK_FLAT.map(([k, v]) => [k, k === "device + clamp gap" ? 2 : v]);
const STACK = STACK_RIDGE;

// --- the two engineering choices --------------------------------------------------------------

const RAIL_PITCH = 20;   // mm between TO-247 centres on a clamp bar. Body is 15.9 mm wide; 20 mm is
                         // the practical bar pitch with a clamp finger between devices. Raising this
                         // for creepage between devices at different potential makes EDGE worse.
const USABLE_EDGE = 0.7; // fraction of the perimeter a device rail may occupy. The rest is corners
                         // (no clamp purchase), the AC studs, the DC output studs, the B2B pillars
                         // and the harness exit. 0.7 is deliberately generous.

const FILL_LIMIT = 0.55; // dominant-part area fraction above which there is no room for creepage,
                         // busbar, control and sensing. Not a standard — a planning gate.

// --- compute ------------------------------------------------------------------------------------

const partsFor = (sku, side) => {
  const n = SCALE[sku];
  const [dm, cm] = FILTER_OD[sku];
  return PARTS["30kw"][side].map(([name, qty, w, h]) => {
    if (name.startsWith("D6")) return [name, sku === "120kw" ? 2 : 1, sku === "120kw" ? 89 : dm, sku === "120kw" ? 89 : dm];
    if (name.startsWith("D7")) return [name, 2, cm, cm];
    return [name, qty * n, w, h];                       // everything else is per-cell
  });
};

const rows = [];
for (const sku of Object.keys(BOARDS)) {
  for (const side of ["acdc", "dcdc"]) {
    const [W, H] = BOARDS[sku][side];
    const area = W * H, perim = 2 * (W + H);
    const n = TO247[sku][side];
    const railNeed = n * RAIL_PITCH;
    const railHave = perim * USABLE_EDGE;

    // Per-domain rail budget on the DC-DC board. Each side of the barrier owns the two long-edge
    // runs within its own X span, plus its one end face.
    let dom = null;
    if (side === "dcdc") {
      const priHave = (2 * W * BARRIER_X + H) * USABLE_EDGE;
      const secHave = (2 * W * (1 - BARRIER_X) + H) * USABLE_EDGE;
      dom = {
        pri: { n: TO247[sku].dcdcPri, need: TO247[sku].dcdcPri * RAIL_PITCH, have: priHave },
        sec: { n: TO247[sku].dcdcSec, need: TO247[sku].dcdcSec * RAIL_PITCH, have: secHave },
      };
      dom.pri.use = dom.pri.need / dom.pri.have;
      dom.sec.use = dom.sec.need / dom.sec.have;
    }

    const parts = partsFor(sku, side);
    let partArea = 0;
    for (const [, qty, w, h] of parts) partArea += qty * w * h;
    partArea += n * RAIL_PITCH * 25;                    // TO-247 rail depth 25 mm incl. lead bend

    rows.push({
      sku, side, W, H, area, perim, n, railNeed, railHave,
      edgeUse: railNeed / railHave, partArea, fill: partArea / area, dom,
    });
  }
}

// --- report ---------------------------------------------------------------------------------------

const pct = (x) => (x * 100).toFixed(0) + "%";
console.log(`board          outline     area cm²  TO-247   rail mm / usable   edge use   part fill`);
let fail = 0;
for (const r of rows) {
  const edgeBad = r.edgeUse > 1, fillBad = r.fill > FILL_LIMIT;
  if (edgeBad || fillBad) fail++;
  console.log(
    `${(r.sku + "-" + r.side).padEnd(14)} ${String(r.W).padStart(3)}×${String(r.H).padEnd(3)}`
    + ` ${String(Math.round(r.area / 100)).padStart(9)}`
    + ` ${String(r.n).padStart(7)}`
    + ` ${String(r.railNeed).padStart(9)} /${String(Math.round(r.railHave)).padStart(6)}`
    + ` ${(edgeBad ? "FAIL " : "ok   ") + pct(r.edgeUse).padStart(5)}`
    + ` ${(fillBad ? "FAIL " : "ok   ") + pct(r.fill).padStart(5)}`);
  if (r.dom) {
    for (const [k, d] of [["primary", r.dom.pri], ["secondary", r.dom.sec]]) {
      const bad = d.use > 1;
      if (bad) fail++;
      console.log(`   └ ${k.padEnd(10)} ${String(d.n).padStart(3)} devices`
        + ` ${String(d.need).padStart(6)} mm /${String(Math.round(d.have)).padStart(6)} mm`
        + `   ${bad ? "FAIL " : "ok   "}${pct(d.use).padStart(5)}   (cannot share a rail across the barrier)`);
    }
  }
}

console.log(`\nEDGE: TO-247 need ${RAIL_PITCH} mm of clamp-bar pitch each and must reach an outer`
  + `\n      extrusion, so they compete for perimeter. Usable perimeter taken as ${pct(USABLE_EDGE)}.`);
console.log(`FILL: dominant parts only (magnetics, electrolytics, TO-247 rails, relays, shunt).`
  + `\n      Gate ${pct(FILL_LIMIT)} — above it there is no area left for creepage, busbar and control.`);

// one runnable check: the resource that breaks first must be the one the plan calls out
const secs = rows.filter((r) => r.dom).map((r) => ({ sku: r.sku, ...r.dom.sec }));
const worst = secs.reduce((a, b) => (b.use > a.use ? b : a));
console.assert(secs.every((x) => x.use > 0.9),
  "expected the secondary rectifier rail to be at or over budget on EVERY SKU");
console.log(`\nbinding constraint is the SECONDARY RECTIFIER RAIL, on every SKU:`);
for (const x of secs) console.log(`   ${x.sku.padEnd(6)} ${String(x.n).padStart(3)} JBS  ${pct(x.use)}`);
console.log(`worst: ${worst.sku} at ${pct(worst.use)} — ${worst.n} × 20 A JBS is the part count that`
  + ` breaks the floorplan,\nand it is also the largest single loss in the module.`);


// --- envelope ------------------------------------------------------------------------------------

const stackH = STACK.reduce((a, [, v]) => a + v, 0);
const stackFlat = STACK_FLAT.reduce((a, [, v]) => a + v, 0);
console.log(`\nENVELOPE — 19-inch 3U rack module (${RACK.widthMax} mm usable width, ${RACK.depthMax} mm max depth, ${RACK.heightU} mm high)`);
console.log(`\nheight stack-up, outer face to outer face:`);
for (const [k, v] of STACK) console.log(`   ${k.padEnd(26)} ${String(v).padStart(5)} mm`);
console.log(`   ${"TOTAL".padEnd(26)} ${stackH.toFixed(1).padStart(5)} mm  vs 3U ${RACK.heightU} mm`
  + `  -> ${stackH <= RACK.heightU ? `ok, ${(RACK.heightU - stackH).toFixed(1)} mm spare` : `OVER by ${(stackH - RACK.heightU).toFixed(1)} mm`}`);
console.log(`   the tunnel (D1 choke, 3 stacked H17 toroids) is ${Math.round(62 / stackH * 100)} % of the height — it is the driving part`);
console.log(`   flat-mounted devices instead of ridge-mounted would be ${stackFlat} mm — ${(stackFlat - RACK.heightU).toFixed(1)} mm OVER 3U.`
  + `\n   Standing the devices on front-to-back ridges is what buys the ${(stackFlat - stackH).toFixed(0)} mm.`);

console.log(`\nboard footprint re-proportioned to the rack: width is FIXED, depth is the free dimension.`);
console.log(`board          as drawn    area cm²   at <=${RACK.widthMax} mm wide      verdict`);
let envFail = 0;
for (const r of rows) {
  const depthNeeded = r.area / RACK.widthMax;
  const ok = depthNeeded <= RACK.depthMax;
  if (!ok) envFail++;
  console.log(`${(r.sku + "-" + r.side).padEnd(14)} ${String(r.W).padStart(3)}×${String(r.H).padEnd(3)}`
    + ` ${String(Math.round(r.area / 100)).padStart(9)}`
    + `   ${RACK.widthMax}×${String(Math.ceil(depthNeeded)).padEnd(4)}`
    + `   ${r.W > RACK.widthMax ? "as drawn TOO WIDE" : "width ok        "}`
    + `   ${ok ? "fits 3U rack" : `DOES NOT FIT — needs ${Math.ceil(depthNeeded)} mm depth`}`);
}
console.log(`\nFRONT FACE — fans + display + switch, in ${RACK.widthMax} mm of usable width:`);
for (const sku of Object.keys(BOARDS)) {
  const need = FANS[sku] * FAN_SIZE + HMI_WIDTH;
  const ok = need <= RACK.widthMax;
  if (!ok) envFail++;
  console.log(`   ${sku.padEnd(6)} ${FANS[sku]}× ${FAN_SIZE} mm fan + ${HMI_WIDTH} mm HMI`
    + ` = ${String(need).padStart(4)} mm   ${ok ? "ok" : `FAIL — ${need - RACK.widthMax} mm over a ${RACK.widthMax} mm face`}`);
}
console.log(`   (a 120 mm fan is the largest that clears a ${RACK.heightU} mm 3U opening)`);

console.log(`\nREAR FACE — the exhaust, minus the two corner connectors (${CONN_FACE[0]}×${CONN_FACE[1]} mm each):`);
const faceArea = RACK.widthMax * RACK.heightU;
const ventArea = faceArea - 2 * CONN_FACE[0] * CONN_FACE[1];
for (const sku of Object.keys(BOARDS)) {
  const mdot = LOSS[sku] / (CP * AIR_DT);            // kg/s
  const q = mdot / RHO;                              // m^3/s
  const cfm = q * 2118.88;
  const vel = q / (ventArea * GRILLE_OPEN / 1e6);    // m/s through the open grille area
  const ok = vel <= 6;                               // above ~6 m/s the grille dominates the loss
  if (!ok) envFail++;
  console.log(`   ${sku.padEnd(6)} ${String(LOSS[sku]).padStart(4)} W at ΔT ${AIR_DT} K -> ${cfm.toFixed(0).padStart(3)} CFM`
    + `   through ${Math.round(ventArea * GRILLE_OPEN)} mm² open  =  ${vel.toFixed(1)} m/s   ${ok ? "ok" : "FAIL — grille too restrictive"}`);
}
console.log(`   vent area ${Math.round(ventArea)} mm² of a ${Math.round(faceArea)} mm² face`
  + ` (${Math.round(ventArea / faceArea * 100)} % free after the connectors), ${Math.round(GRILLE_OPEN * 100)} % grille open area`);

console.log(`\nWidth is the binding dimension and depth is nearly free, so a board that does not fit should`
  + `\nbe made NARROWER AND DEEPER before it is made bigger. ${envFail} board(s) cannot be made to fit at all.`);

console.log(fail ? `\n${fail} board(s) over a planning gate — see docs/pcb-floorplan.md` : `\nall boards within gates`);
process.exit(0);
