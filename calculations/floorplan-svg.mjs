#!/usr/bin/env node
// floorplan-svg.mjs — draw the zone plan of docs/pcb-floorplan.md to scale.
//
// The zone table in the document says WHERE each section goes; this draws it, at the real board
// aspect ratio, so the plan can be read as a picture before anything is placed. Zone widths are the
// plan's own X-fractions (they are a design decision, not a measurement) but the board rectangles,
// the device-rail lengths and the fill figures come from the frozen outlines and the BOM, so a zone
// that does not fit shows up as a zone that does not fit.
//
// Run: node calculations/floorplan-svg.mjs [sku]   ->  docs/assets/floorplan-<sku>.svg

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKU = process.argv[2] || "30kw";

const BOARDS = {
  "30kw":  { acdc: [420, 300], dcdc: [460, 320], cells: 1 },
  "60kw":  { acdc: [460, 420], dcdc: [520, 420], cells: 2 },
  "120kw": { acdc: [560, 600], dcdc: [640, 620], cells: 4 },
};
const TO247 = { "30kw": [16, 30], "60kw": [31, 60], "120kw": [61, 120] };

// zones: [key, label, sections, x-fraction], drawn rear -> front
const ACDC = [
  ["entry", "AC ENTRY\n+ SURGE", "studs · fuses · MOV Δ · GDT", 0.10],
  ["emi",   "EMI FILTER",        "2× CM (D7) · DM (D6) · X/Y1", 0.16],
  ["pre",   "PRE-\nCHARGE",      "2× 33 Ω · bypass relay",      0.08],
  ["pfc",   "VIENNA PFC",        "N× 3 phase cells: D1 choke +\n5× TO-247 + RC/RCD clamp", 0.40],
  ["link",  "DC LINK",           "470 µF bank · film ·\ndischarge · B2B studs", 0.26],
];
const DCDC = [
  ["bus",   "BUS\nIN",     "film commutation",                    0.09],
  ["legs",  "LLC LEGS",    "3N half-bridges\n+ drivers",          0.20],
  ["tank",  "TANKS",       "Cr 4×46 nF\n+ D2 trim",               0.14],
  ["xfmr",  "XFMR ROW",    "3N× PQ50/50\n— ON THE BARRIER",       0.14],
  ["rect",  "RECTIFIERS\n+ BANKS", "JBS bridges ·\nbank caps",    0.20],
  ["sp",    "S/P\nMATRIX", "HV relays\n· bleeders",               0.11],
  ["out",   "OUTPUT",      "filter · shunt\n· DC± studs",         0.12],
];

const C = {
  entry: "#c05621", emi: "#2f7d5e", pre: "#8a6d1f", pfc: "#b8860b", link: "#2c5f8a",
  bus: "#2c5f8a", legs: "#b8860b", tank: "#8a6d1f", xfmr: "#7a3b8a", rect: "#2f7d5e",
  sp: "#a03030", out: "#c05621",
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const lines = (t, x, y, dy, cls) => t.split("\n")
  .map((l, i) => `<text x="${x}" y="${y + i * dy}" class="${cls}">${esc(l)}</text>`).join("");

const b = BOARDS[SKU];
const S = 0.95;                                   // mm -> px
const PAD = 62, GAP = 104, TOP = 196;
const wA = b.acdc[0] * S, hA = b.acdc[1] * S;
const wD = b.dcdc[0] * S, hD = b.dcdc[1] * S;
// The rail bar is allowed to overrun its track (that is the point), so the canvas has to be wide
// enough to contain the worst overrun or the failure runs off the page instead of being shown.
const railUse = (w, h, n) => (n * 20) / Math.round(2 * (w / S + h / S) * 0.7);
const barEnd = Math.max(
  wA - 8 + 8, wD - 8 + 8,
  (wA - 8) * railUse(wA, hA, TO247[SKU][0]) + 8,
  (wD - 8) * railUse(wD, hD, TO247[SKU][1]) + 8);
const W = PAD * 2 + 110 + Math.max(wA, wD, barEnd);   // +110 for the connector side labels
const H = TOP + hD + GAP + hA + 132;

const board = (x, y, w, h, zones, title, sub, nTO, barrierAfter, inConn, outConn) => {
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="board"/>`;
  out += `<text x="${x}" y="${y - 58}" class="btitle">${esc(title)}</text>`;
  out += `<text x="${x}" y="${y - 42}" class="bsub">${esc(sub)}</text>`;
  const ctrlH = h * 0.19;                          // control/sense strip along one long edge
  const zoneH = h - ctrlH;
  let cx = x, bx = null;
  for (const [k, label, detail, f] of zones) {
    const zw = w * f;
    out += `<rect x="${cx}" y="${y}" width="${zw}" height="${zoneH}" fill="${C[k]}" fill-opacity="0.16" stroke="${C[k]}" stroke-width="1.4"/>`;
    // 0.62 px of width per point of font size, the same measured constant frame-padding.mjs uses.
    // A zone too narrow for its own name gets a ROTATED label -- zones are tall, so it always fits,
    // and a rotated column label is what a floorplan drawing does anyway. Guessing at a smaller
    // font instead would produce text that fits and cannot be read.
    const widest = (t) => Math.max(...t.split("\n").map((l) => l.length));
    const fits = (t, size) => widest(t) * size * 0.62 < zw - 12;
    const cxm = cx + zw / 2, cym = y + zoneH / 2;
    if (fits(label, 11.5) && fits(detail, 9.5)) {
      const nL = label.split("\n").length, nD = detail.split("\n").length;
      const top = cym - (nL * 15 + 8 + nD * 12) / 2 + 7;
      out += lines(label, cxm, top, 15, "zl");
      out += lines(detail, cxm, top + nL * 15 + 8, 12, "zd");
    } else {
      out += `<g transform="translate(${cxm},${cym}) rotate(-90)">`
           + lines(label.replace(/\n/g, " "), 0, -7, 15, "zl")
           + lines(detail.replace(/\n/g, " · "), 0, 9, 12, "zd") + `</g>`;
    }
    cx += zw;
    if (k === barrierAfter) bx = cx;
  }
  // control strip
  out += `<rect x="${x}" y="${y + zoneH}" width="${w}" height="${ctrlH}" fill="#455" fill-opacity="0.13" stroke="#455" stroke-width="1.4"/>`;
  // Device-rail budget, drawn as a bar against the usable perimeter. Clamping the bar to the board
  // width would hide the one thing this drawing most needs to show: at 120 kW the DC-DC rail is
  // 136 % of the usable perimeter, so the bar MUST be allowed to overrun its track.
  const need = nTO * 20, have = Math.round(2 * (w / S + h / S) * 0.7);
  const use = need / have;
  const track = w - 8;                                    // the track represents `have`
  const barW = track * use;
  out += `<rect x="${x + 4}" y="${y - 11}" width="${track}" height="9" class="track"/>`;
  out += `<rect x="${x + 4}" y="${y - 11}" width="${barW}" height="9" class="${use > 1 ? "railbad" : "rail"}"/>`;
  if (use > 1) out += `<line x1="${x + 4 + track}" y1="${y - 15}" x2="${x + 4 + track}" y2="${y + 3}" class="limit"/>`;
  out += `<text x="${x + 4}" y="${y - 24}" class="${use > 1 ? "rlbad" : "rl"}">`
       + `device rail — ${nTO}× TO-247 @20 mm = ${need} mm vs ${have} mm usable perimeter`
       + ` = ${(use * 100).toFixed(0)}%${use > 1 ? "  ✗ DOES NOT FIT — needs interior rails or fewer devices" : ""}</text>`;
  // Connector blocks at the diagonal corners (§0). AC enters rear-LEFT, DC leaves front-RIGHT, and
  // in this plan view "left/right of the rack" is the vertical axis, so the diagonal shows as one
  // block high on the rear edge and one low on the front edge.
  const conn = (cxp, cyp, w2, h2, label, col) =>
    `<rect x="${cxp}" y="${cyp}" width="${w2}" height="${h2}" fill="${col}" fill-opacity="0.85" stroke="${col}" stroke-width="1.5"/>`
    + `<text x="${cxp + w2 / 2}" y="${cyp + h2 / 2}" style="font-size:9px;font-weight:700;fill:#fff;text-anchor:middle">${esc(label)}</text>`;
  if (inConn) out += conn(x - 14, y + zoneH * 0.10, 14, zoneH * 0.26, "", "#c05621")
                  + `<text x="${x - 20}" y="${y + zoneH * 0.23}" style="font-size:9.5px;font-weight:700;fill:#c05621;text-anchor:end">${esc(inConn)}</text>`;
  if (outConn) out += conn(x + w, y + zoneH * 0.64, 14, zoneH * 0.26, "", "#a03030")
                  + lines(outConn, x + w + 20, y + zoneH * 0.72, 12, "oc");
  return { svg: out, bx, zoneH, ctrlH };
};

const yD = TOP, yA = TOP + hD + GAP;
const xD = PAD + 62 + (Math.max(wA, wD) - wD) / 2, xA = PAD + 62 + (Math.max(wA, wD) - wA) / 2;

const D = board(xD, yD, wD, hD, DCDC, "DC-DC BOARD (upper)  ·  semis → upper extrusion",
  `${b.dcdc[0]}×${b.dcdc[1]} mm · ${DCDC.length} zones · barrier at the transformer row`, TO247[SKU][1], "xfmr",
  null, "DC± OUT\n+ CAN H/L");
const A = board(xA, yA, wA, hA, ACDC, "AC-DC BOARD (lower)  ·  semis → lower extrusion",
  `${b.acdc[0]}×${b.acdc[1]} mm · ${ACDC.length} zones · single-point control ground lives here`, TO247[SKU][0], null,
  "3φ AC IN", null);

// reinforced barrier on the DC-DC board
const barrier = `<line x1="${D.bx}" y1="${yD - 4}" x2="${D.bx}" y2="${yD + hD + 4}" class="barrier"/>`
  + `<text x="${D.bx}" y="${yD + hD + 20}" class="bar">reinforced barrier · 8.0 mm clearance / 12.6 mm creepage · slots through all 6 layers</text>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="ui-sans-serif,-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<style>
  .board{fill:#fbfbf9;stroke:#333;stroke-width:2}
  .btitle{font-size:15px;font-weight:700;fill:#1a1a1a}
  .bsub{font-size:11px;fill:#666}
  .zl{font-size:11.5px;font-weight:700;fill:#1a1a1a;text-anchor:middle}
  .zd{font-size:9.5px;fill:#555;text-anchor:middle}
  .rail{fill:#2f7d5e;opacity:.8}
  .railbad{fill:#a03030;opacity:.85}
  .track{fill:#ddd}
  .limit{stroke:#a03030;stroke-width:2}
  .rlbad{font-size:9px;fill:#a03030;font-weight:700}
  .rl{font-size:9px;fill:#a03030}
  .barrier{stroke:#7a3b8a;stroke-width:4;stroke-dasharray:9 4}
  .bar{font-size:9.5px;fill:#7a3b8a;text-anchor:middle}
  .face{font-size:11px;font-weight:700;fill:#1a1a1a}   /* no text-anchor: set per element */
  .fd{font-size:9.5px;fill:#555}                       /* no text-anchor: set per element */
  .flow{font-size:10.5px;font-weight:600}
  .cap{font-size:10px;fill:#666}
  .oc{font-size:9.5px;font-weight:700;fill:#a03030;text-anchor:start}
  text{dominant-baseline:middle}
</style>
<rect width="${W}" height="${H}" fill="#fff"/>
<text x="${PAD}" y="30" style="font-size:17px;font-weight:700">PCB floorplan — zone plan, ${SKU.replace("kw", " kW")} (drawn to board scale)</text>
<text x="${PAD}" y="50" class="cap">AC in and DC out DIAGONALLY OPPOSITE · power rear→front · air front→rear · 19-inch 3U card</text>

<text x="${PAD}" y="98" class="face" text-anchor="start">◀ REAR FACE</text>
<text x="${PAD}" y="116" class="fd" text-anchor="start">AC IN + PE (left quarter) · fans + EXHAUST</text>
<text x="${W - PAD}" y="98" class="face" text-anchor="end">FRONT FACE ▶</text>
<text x="${W - PAD}" y="116" class="fd" text-anchor="end">air INLET · display · DC± OUT + CAN (right quarter)</text>

${D.svg}
${barrier}
${A.svg}

<line x1="${PAD}" y1="${H - 74}" x2="${W - PAD}" y2="${H - 74}" stroke="#b8860b" stroke-width="2.5" marker-end="url(#ap)"/>
<text x="${PAD}" y="${H - 88}" class="flow" fill="#b8860b">power flow  ▶</text>
<line x1="${W - PAD}" y1="${H - 50}" x2="${PAD}" y2="${H - 50}" stroke="#2c5f8a" stroke-width="2.5" marker-end="url(#af)"/>
<text x="${W - PAD}" y="${H - 64}" class="flow" fill="#2c5f8a" text-anchor="end">◀  airflow (opposes power: EMI filter at the exhaust preheats nothing)</text>
<text x="${PAD}" y="${H - 24}" class="cap">Grey strip on each board = control + sensing, one long edge. On the DC-DC board it is primary-referenced and STOPS at the barrier — HMI and isolated CAN move to a front-panel daughter card.</text>
<defs>
  <marker id="ap" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0,9 3.5,0 7" fill="#b8860b"/></marker>
  <marker id="af" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0,9 3.5,0 7" fill="#2c5f8a"/></marker>
</defs>
</svg>
`;

mkdirSync(join(ROOT, "docs/assets"), { recursive: true });
const out = join(ROOT, `docs/assets/floorplan-${SKU}.svg`);
writeFileSync(out, svg);
console.log(`${out}  (${b.acdc[0]}×${b.acdc[1]} + ${b.dcdc[0]}×${b.dcdc[1]} mm, ${TO247[SKU][0]}+${TO247[SKU][1]} TO-247)`);

// one runnable check: the drawn zone fractions must sum to 1 or the picture lies about the board
for (const [name, z] of [["ACDC", ACDC], ["DCDC", DCDC]]) {
  const s = z.reduce((a, x) => a + x[3], 0);
  console.assert(Math.abs(s - 1) < 1e-9, `${name} zone fractions sum to ${s}, not 1`);
}
