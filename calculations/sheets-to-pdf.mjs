#!/usr/bin/env node
// sheets-to-pdf.mjs — render each composed board sheet to a single-page PDF.
//
// One PDF per board, named for the SKU and board, at the sheet's own aspect so nothing is
// cropped or rescaled. Vector in, vector out (headless Chrome print-to-PDF), so the drawing
// stays zoomable and text stays selectable.
//
// Output: boards/out-pdf/DC-Modules <SKU> <BOARD>.pdf
// Run:    node calculations/sheets-to-pdf.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "boards/out-pdf");
mkdirSync(OUT, { recursive: true });
const TMP = join(ROOT, ".pdf-tmp");
mkdirSync(TMP, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!existsSync(CHROME)) { console.error("Google Chrome not found — needed for SVG→PDF"); process.exit(1); }

// Source of record (2026-09-08): the AUDITED KiCad-5 sheets (kicad5-gen -> kicad5-preview SVGs
// in calculations/out/preview), not the tscircuit composed sheets — the kicad5 set is the one
// that passes pin-verify 100%, ink-collision, wiring and layout gates ("purely handcrafted").
// Run kicad5-preview for each SKU before this tool.
const BOARDS = [
  { k5: "30kw-acdc", name: "DC-Modules 30kW AC-DC (Vienna PFC)" },
  { k5: "30kw-dcdc", name: "DC-Modules 30kW DC-DC (3-phase LLC)" },
  { k5: "60kw-acdc", name: "DC-Modules 60kW AC-DC (Vienna PFC)" },
  { k5: "60kw-dcdc", name: "DC-Modules 60kW DC-DC (3-phase LLC)" },
  { k5: "control-card-card", name: "DC-Modules Control Card (GD32G553VET6)" },
]; // 120 kW retired: cabinet of 30/60 kW modules (E36)

const PX_PER_IN = 96;
for (const b of BOARDS) {
  const svgPath = join(ROOT, "calculations", "out", "preview", `${b.k5}.svg`);
  if (!existsSync(svgPath)) { console.log(`!! ${b.f}: no sheet`); continue; }
  let svg = readFileSync(svgPath, "utf8");
  // kicad5-preview letterboxes each sheet into a square with a matte band for eyeballing.
  // For print: crop the viewBox to the actual sheet rect (the #fffdf7 page) and drop the matte.
  const sm = svg.match(/<rect width="(\d+)" height="(\d+)" fill="#fffdf7"/);
  const [sw, sh] = [+sm[1], +sm[2]];
  const w = Math.round((sw + 300) / 10), h = Math.round((sh + 300) / 10);   // mil -> px (10 mil/px)
  svg = svg
    .replace(/viewBox="[^"]*" width="\d+" height="\d+"/, `viewBox="-150 -150 ${sw + 300} ${sh + 300}" width="${w}" height="${h}"`)
    .replace(/<rect x="0" y="-?\d+" width="\d+" height="\d+" fill="#e8e4d9"\/>/, "");

  // one page, exactly the sheet's size, no margin — @page in inches keeps Chrome honest
  const html = `<!doctype html><meta charset="utf-8"><title>${b.name}</title>
<style>
  @page { size: ${(w / PX_PER_IN).toFixed(3)}in ${(h / PX_PER_IN).toFixed(3)}in; margin: 0; }
  html,body { margin:0; padding:0; background:#fff; }
  svg { display:block; width:${w}px; height:${h}px; }
</style>
${svg}`;
  const htmlPath = join(TMP, `${b.k5}.html`);
  writeFileSync(htmlPath, html);

  const pdfPath = join(OUT, `${b.name}.pdf`);
  execFileSync(CHROME, [
    "--headless", "--disable-gpu", "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`,
  ], { stdio: ["ignore", "ignore", "pipe"], timeout: 180000 });

  const size = existsSync(pdfPath) ? (readFileSync(pdfPath).length / 1048576).toFixed(2) : "0";
  console.log(`${b.name}.pdf  ${w}×${h}px → ${(w / PX_PER_IN).toFixed(1)}×${(h / PX_PER_IN).toFixed(1)} in · ${size} MB`);
}
rmSync(TMP, { recursive: true, force: true });
console.log(`\n→ boards/out-pdf/`);
