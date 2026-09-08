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

const BOARDS = [
  { f: "30kw/acdc", name: "DC-Modules 30kW AC-DC (Vienna PFC)" },
  { f: "30kw/dcdc", name: "DC-Modules 30kW DC-DC (3-phase LLC)" },
  { f: "60kw/acdc", name: "DC-Modules 60kW AC-DC (Vienna PFC)" },
  { f: "60kw/dcdc", name: "DC-Modules 60kW DC-DC (3-phase LLC)" },
  { f: "control-card", name: "DC-Modules Control Card (GD32G553VET6)" },
]; // 120 kW retired: cabinet of 30/60 kW modules (E36)

const PX_PER_IN = 96;
for (const b of BOARDS) {
  const [sku, side] = b.f.split("/");
  const svgPath = side ? join(ROOT, "boards", sku, "out", `${side}-sheet.svg`)
                       : join(ROOT, "boards", "out", `${sku}-sheet.svg`);
  if (!existsSync(svgPath)) { console.log(`!! ${b.f}: no sheet`); continue; }
  const svg = readFileSync(svgPath, "utf8");
  const m = svg.match(/width="(\d+)" height="(\d+)"/);
  const [w, h] = [+m[1], +m[2]];

  // one page, exactly the sheet's size, no margin — @page in inches keeps Chrome honest
  const html = `<!doctype html><meta charset="utf-8"><title>${b.name}</title>
<style>
  @page { size: ${(w / PX_PER_IN).toFixed(3)}in ${(h / PX_PER_IN).toFixed(3)}in; margin: 0; }
  html,body { margin:0; padding:0; background:#fff; }
  svg { display:block; width:${w}px; height:${h}px; }
</style>
${svg}`;
  const htmlPath = join(TMP, `${sku}-${side}.html`);
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
