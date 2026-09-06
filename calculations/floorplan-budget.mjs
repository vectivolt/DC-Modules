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

// TO-247 counts from calculations/out/bom-<sku>.csv (every line whose description says TO-247)
const TO247 = {
  "30kw":  { acdc: 16, dcdc: 30 },
  "60kw":  { acdc: 31, dcdc: 60 },
  "120kw": { acdc: 61, dcdc: 120 },
};

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
      ["D2 trim inductor",    3, 45, 45],   // OD33 + 8 + 2
      ["bank electrolytic",   8, 37, 37],
      ["HFE82V HV relay",     5, 52, 36],   // S/P matrix + K_OUT + pre-insertion
      ["shunt 100 A",         1, 40, 15],
    ],
  },
};
// 60/120 kW scale the per-cell items ×2/×4; the filter chokes grow a core size instead of counting up
const SCALE = { "30kw": 1, "60kw": 2, "120kw": 4 };
const FILTER_OD = { "30kw": [57, 72], "60kw": [67, 90], "120kw": [2, 112] }; // [DM, CM] finished dia

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

    const parts = partsFor(sku, side);
    let partArea = 0;
    for (const [, qty, w, h] of parts) partArea += qty * w * h;
    partArea += n * RAIL_PITCH * 25;                    // TO-247 rail depth 25 mm incl. lead bend

    rows.push({
      sku, side, W, H, area, perim, n, railNeed, railHave,
      edgeUse: railNeed / railHave, partArea, fill: partArea / area,
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
}

console.log(`\nEDGE: TO-247 need ${RAIL_PITCH} mm of clamp-bar pitch each and must reach an outer`
  + `\n      extrusion, so they compete for perimeter. Usable perimeter taken as ${pct(USABLE_EDGE)}.`);
console.log(`FILL: dominant parts only (magnetics, electrolytics, TO-247 rails, relays, shunt).`
  + `\n      Gate ${pct(FILL_LIMIT)} — above it there is no area left for creepage, busbar and control.`);

// one runnable check: the resource that breaks first must be the one the plan calls out
const worstEdge = rows.reduce((a, b) => (b.edgeUse > a.edgeUse ? b : a));
console.assert(worstEdge.sku === "120kw" && worstEdge.side === "dcdc",
  "expected the 120 kW DC-DC board to be the binding edge constraint");
console.log(`\nbinding edge constraint: ${worstEdge.sku}-${worstEdge.side} at ${pct(worstEdge.edgeUse)}`
  + ` of usable perimeter (${worstEdge.n} devices)`);

console.log(fail ? `\n${fail} board(s) over a planning gate — see docs/pcb-floorplan.md` : `\nall boards within gates`);
process.exit(0);
