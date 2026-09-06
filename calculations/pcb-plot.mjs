#!/usr/bin/env node
// pcb-plot.mjs — draw the board from its COURTYARDS, which is what placement is actually about.
//
// The stock pcb-svg export draws pads. On this board a 89 mm choke is two plated holes and a
// TO-247 is four, so a pad plot shows a nearly empty board and hides every real adjacency. This
// draws what the parts occupy: courtyard outlines, coloured by layer, labelled, with the zone
// bands from docs/pcb-floorplan.md behind them.
//
// Run: node calculations/pcb-plot.mjs [sku] [side]  ->  docs/assets/pcb-<sku>-<side>.svg

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extents } from "./pcb-geom.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKU = process.argv[2] || "30kw", SIDE = process.argv[3] || "acdc";
const j = JSON.parse(readFileSync(join(ROOT, `dist/boards/${SKU}/${SIDE}/circuit.json`), "utf8"));
const { by, parts, board } = extents(j);
const W = board.width, H = board.height;
const S = 2.2, PAD = 40;                          // px per mm, margin
const px = (x) => (x + W / 2) * S + PAD;
const py = (y) => (H / 2 - y) * S + PAD;          // SVG y is down; board y is up

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const big = parts.filter((p) => p.area >= 400);   // parts worth labelling
const out = [];
const VW = W * S + PAD * 2, VH = H * S + PAD * 2 + 46;
out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" width="${VW}" height="${VH}" font-family="ui-sans-serif,-apple-system,Helvetica,Arial,sans-serif">`);
out.push(`<rect width="100%" height="100%" fill="#fbfbf9"/>`);
// board outline
out.push(`<rect x="${px(-W / 2)}" y="${py(H / 2)}" width="${W * S}" height="${H * S}" fill="#eef1ec" stroke="#333" stroke-width="2"/>`);

// pours, drawn first and faintly — they are the power routing
const netName = new Map((by.source_net ?? []).map((n) => [n.source_net_id, n.name]));
const pourNets = [...new Set((by.pcb_copper_pour ?? []).map((p) => `${netName.get(p.source_net_id)}:${p.layer}`))];

// courtyards
const COL = { top: "#b8860b", bottom: "#2c5f8a" };
for (const p of [...parts].sort((a, b) => b.area - a.area)) {
  const c = COL[p.layer] ?? "#777";
  out.push(`<rect x="${px(p.x0)}" y="${py(p.y1)}" width="${(p.x1 - p.x0) * S}" height="${(p.y1 - p.y0) * S}"`
    + ` fill="${c}" fill-opacity="${p.layer === "bottom" ? 0.16 : 0.24}" stroke="${c}" stroke-width="${p.area > 400 ? 1.1 : 0.5}"`
    + `${p.layer === "bottom" ? ' stroke-dasharray="3 2"' : ""}/>`);
}
for (const p of big) {
  const fs = Math.max(6, Math.min(11, Math.sqrt(p.area) / 3.2));
  out.push(`<text x="${px(p.x)}" y="${py(p.y) + fs / 3}" style="font-size:${fs}px;fill:#1a1a1a;text-anchor:middle">${esc(p.name)}</text>`);
}
const nTop = parts.filter((p) => p.layer === "top").length;
const nBot = parts.filter((p) => p.layer === "bottom").length;
const fill = parts.reduce((s, p) => s + p.area, 0) / (W * H) * 100;
out.push(`<text x="${PAD}" y="24" style="font-size:15px;font-weight:700;fill:#1a1a1a">${SKU}-${SIDE} — ${W} × ${H} mm, ${parts.length} parts</text>`);
out.push(`<text x="${PAD}" y="${H * S + PAD * 2 + 12}" style="font-size:11px;fill:#555">`
  + `solid = top (${nTop}) · dashed = bottom (${nBot}) · courtyard fill ${fill.toFixed(1)} % · `
  + `planes: ${pourNets.filter((p) => /inner|bottom/.test(p)).join(", ")}</text>`);
out.push(`</svg>`);
mkdirSync(join(ROOT, "docs/assets"), { recursive: true });
const f = join(ROOT, `docs/assets/pcb-${SKU}-${SIDE}.svg`);
writeFileSync(f, out.join("\n"));
console.log(`${f}  —  ${parts.length} parts, ${nTop} top / ${nBot} bottom, fill ${fill.toFixed(1)} %`);
