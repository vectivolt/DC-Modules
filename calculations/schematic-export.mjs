// schematic-export.mjs — renders each built board's schematic to SVG with PROFESSIONAL
// sectionization (layout-polish goal, 2026-09-05): titled section frames computed from the
// actual component positions, plus a title block. The frames are injected between the
// background and the circuit layer using the SVG's own real-to-screen transform, so they are
// exact, not eyeballed. Output: boards/<sku>/out/<side>-schematic.svg
// Run (after tsci builds): node calculations/schematic-export.mjs [30kw/acdc ...]
import { SECTIONS } from "./schematic-sections.mjs";
import { labelLongTraces } from "./sch-longtrace-labels.mjs";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { convertCircuitJsonToSchematicSvg } = require("circuit-to-svg");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// SECTIONS now come from the shared module (schematic-sections.mjs) — the comment there
// promised exporter and composer cannot drift; the exporter keeping its own copy broke that.

// Default set = buildable boards + the control card (single-segment target -> dist/boards/<name>).
// 120 kW retired: cabinet product (E36); its board pair no longer builds.
const targets = process.argv.slice(2).length ? process.argv.slice(2)
  : ["30kw/acdc", "30kw/dcdc", "60kw/acdc", "60kw/dcdc", "control-card"];

for (const t of targets) {
  const [sku, side] = t.split("/");
  const p = side ? join(ROOT, "dist", "boards", sku, side, "circuit.json")
                 : join(ROOT, "dist", "boards", sku, "circuit.json");
  if (!existsSync(p)) { console.log(`!! ${t}: no build`); continue; }
  const j = labelLongTraces(JSON.parse(readFileSync(p, "utf8")));
  const srcById = new Map(j.filter(e => e.type === "source_component").map(c => [c.source_component_id, c.name]));
  const comps = j.filter(e => e.type === "schematic_component").map(c => ({
    name: srcById.get(c.source_component_id) ?? "?",
    x: c.center?.x ?? 0, y: c.center?.y ?? 0, w: c.size?.width ?? 1, h: c.size?.height ?? 1,
  }));
  // sheet aspect → render size
  const xs = comps.map(c => c.x), ys = comps.map(c => c.y);
  const sw = Math.max(...xs) - Math.min(...xs) + 20, sh = Math.max(...ys) - Math.min(...ys) + 20;
  const W = 3200, H = Math.round(W * sh / sw);
  let svg = convertCircuitJsonToSchematicSvg(j, { width: W, height: H });
  const m = svg.match(/data-real-to-screen-transform="matrix\(([-\d.e]+),0,0,([-\d.e]+),([-\d.e]+),([-\d.e]+)\)"/);
  if (!m) { console.log(`!! ${t}: no transform found`); continue; }
  const M = 70; // canvas margin so outer section frames + titles never clip
  const [s, sy2, tx, ty] = [+m[1], +m[2], +m[3], +m[4]];
  const px = (x) => s * x + tx + M, py = (y) => sy2 * y + ty + M;
  // expand the canvas: grow the root svg, repaint the background full-size, translate the circuit
  // (canvas is finalized after frames are computed — see below)
  const fs = Math.max(10, s * 0.9); // section title font px
  const frameBoxes = [];
  const assigned = new Set();
  for (const [title, re] of SECTIONS[side ?? sku] ?? []) {
    const members = comps.filter(c => !assigned.has(c.name) && re.test(c.name));
    if (!members.length) continue;
    members.forEach(c => assigned.add(c.name));
    const pad = 1.2, padTop = 2.4; // extra head-room inside the frame for its title
    const x0 = Math.min(...members.map(c => c.x - c.w / 2)) - pad, x1 = Math.max(...members.map(c => c.x + c.w / 2)) + pad;
    const y0 = Math.min(...members.map(c => c.y - c.h / 2)) - pad, y1 = Math.max(...members.map(c => c.y + c.h / 2)) + padTop;
    frameBoxes.push({ title, X: px(x0), Y: py(y1), Wd: px(x1) - px(x0), Ht: py(y0) - py(y1) });
  }
  let frames = `<g class="section-frames" style="font-family: sans-serif;">`;
  for (const f of frameBoxes) {
    // shrink the title into the frame so narrow sections never spill onto a neighbour
    const fsUse = Math.max(9, Math.min(fs, (f.Wd - 14) / (0.62 * f.title.length)));
    frames += `<rect x="${f.X.toFixed(1)}" y="${f.Y.toFixed(1)}" width="${f.Wd.toFixed(1)}" height="${f.Ht.toFixed(1)}" rx="6" fill="none" stroke="#7a8aa0" stroke-width="1.6" stroke-dasharray="7,4"/>`;
    frames += `<text x="${(f.X + 8).toFixed(1)}" y="${(f.Y + fsUse + 5).toFixed(1)}" font-size="${fsUse.toFixed(1)}" font-weight="bold" fill="#40506a" letter-spacing="1">${f.title.replace(/&/g, "&amp;")}</text>`;
  }
  const un = comps.filter(c => !assigned.has(c.name)).map(c => c.name);
  frames += `</g>`;
  // canvas must contain every frame AND every net label — extend right/bottom as needed
  const labels = j.filter(e => e.type === "schematic_net_label").map(l => ({
    x: l.center?.x ?? l.anchor_position?.x ?? 0, y: l.center?.y ?? l.anchor_position?.y ?? 0,
    w: 0.7 + 0.13 * String(l.text ?? "").length,
  }));
  const maxFX = Math.max(W + 2 * M, ...frameBoxes.map(f => f.X + f.Wd + 16), ...labels.map(l => px(l.x + l.w) + 12)) + 130;
  const maxFY = Math.max(H + 2 * M, ...frameBoxes.map(f => f.Y + f.Ht + 16), ...labels.map(l => py(l.y - 0.5) + 12)) + 30;
  // title block (bottom-right)
  const date = new Date().toISOString().slice(0, 10);
  const tb = `<g class="title-block" style="font-family: sans-serif;">
<rect x="${Math.ceil(maxFX) - 470}" y="${Math.ceil(maxFY) - 84}" width="460" height="74" fill="#ffffff" stroke="#40506a" stroke-width="1.6"/>
<text x="${Math.ceil(maxFX) - 458}" y="${Math.ceil(maxFY) - 58}" font-size="20" font-weight="bold" fill="#1c2127">DC-Modules — ${sku.toUpperCase()} ${side === "acdc" ? "AC-DC board" : "DC-DC board"}</text>
<text x="${Math.ceil(maxFX) - 458}" y="${Math.ceil(maxFY) - 36}" font-size="14" fill="#40506a">schematic rev D.1 · generated ${date} · calculations/schematic-export.mjs</text>
<text x="${Math.ceil(maxFX) - 458}" y="${Math.ceil(maxFY) - 18}" font-size="12" fill="#7a8aa0">register: docs/assumptions.md E1–E33 · gate: review-checks.mjs + schematic-check.mjs</text>
</g>`;
  svg = svg.replace(`width="${W}" height="${H}"`, `width="${Math.ceil(maxFX)}" height="${Math.ceil(maxFY)}"`);
  svg = svg.replace(/<rect class="boundary" x="0" y="0" width="\d+" height="\d+"\/>/,
    `<rect class="boundary" x="0" y="0" width="${Math.ceil(maxFX)}" height="${Math.ceil(maxFY)}"/><g transform="translate(${M},${M})">`);
  svg = svg.replace("</svg>", `</g>${frames}${tb}</svg>`);
  const outDir = side ? join(ROOT, "boards", sku, "out") : join(ROOT, "boards", "out");
  mkdirSync(outDir, { recursive: true });
  const outName = side ?? sku;
  writeFileSync(join(outDir, `${outName}-schematic.svg`), svg);
  console.log(`${t}: ${comps.length} symbols → ${outName}-schematic.svg (${W}×${H})${un.length ? `  [unsectioned: ${un.slice(0, 8).join(",")}${un.length > 8 ? ` +${un.length - 8}` : ""}]` : "  [all sectioned]"}`);
}
