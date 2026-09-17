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
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "boards/out-pdf");
mkdirSync(OUT, { recursive: true });
const TMP = join(ROOT, ".pdf-tmp");
mkdirSync(TMP, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!existsSync(CHROME)) { console.error("Google Chrome not found — needed for SVG→PDF"); process.exit(1); }

// Source of record (2026-09-08): the AUDITED KiCad-5 sheets rendered by kicad5-print.mjs
// (calculations/out/print) — full glyph fidelity: real component symbols, pin names/numbers,
// net labels, junctions, frames and title block. Run kicad5-print for each SKU before this tool.
const BOARDS = [
  { k5: "30kw-acdc", name: "DC-Modules 30kW AC-DC (Vienna PFC)" },
  { k5: "30kw-dcdc", name: "DC-Modules 30kW DC-DC (full-bridge LLC)" },
  { k5: "40kw-acdc", name: "DC-Modules 40kW AC-DC (Vienna PFC)" },
  { k5: "40kw-dcdc", name: "DC-Modules 40kW DC-DC (full-bridge LLC)" },
  { k5: "50kw-acdc", name: "DC-Modules 50kW AC-DC (Vienna PFC, liquid)" },
  { k5: "50kw-dcdc", name: "DC-Modules 50kW DC-DC (full-bridge LLC, liquid)" },
  { k5: "50kwa-acdc", name: "DC-Modules 50kW-Air AC-DC (Vienna PFC)" },
  { k5: "50kwa-dcdc", name: "DC-Modules 50kW-Air DC-DC (full-bridge LLC)" },
  { k5: "control-card-card", name: "DC-Modules Control Card (GD32G553VET7)" },
];

const PX_PER_IN = 96;
// Chrome 152 headless writes the PDF and then does not exit, so wait for its "bytes written" line
// instead of the process; an isolated profile keeps it off the user's running browser.
const printPdf = (args) => new Promise((resolve, reject) => {
  const p = spawn(CHROME, args, { stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  const timer = setTimeout(() => { p.kill("SIGKILL"); reject(new Error(`Chrome print timed out\n${err.slice(-600)}`)); }, 180000);
  p.stderr.on("data", (d) => {
    err += d;
    if (/bytes written to file/.test(err)) { clearTimeout(timer); p.kill("SIGKILL"); resolve(); }
  });
  p.on("exit", () => { clearTimeout(timer); resolve(); });
});
for (const b of BOARDS) {
  const svgPath = join(ROOT, "calculations", "out", "print", `${b.k5}.svg`);
  if (!existsSync(svgPath)) { console.log(`!! ${b.f}: no sheet`); continue; }
  const svg = readFileSync(svgPath, "utf8");
  const m0 = svg.match(/width="(\d+)" height="(\d+)"/);
  const [w, h] = [+m0[1], +m0[2]];

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
  await printPdf([
    "--headless", "--disable-gpu", "--no-pdf-header-footer", "--no-first-run", `--user-data-dir=${join(TMP, "chrome-profile")}`,
    `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`,
  ]);

  const size = existsSync(pdfPath) ? (readFileSync(pdfPath).length / 1048576).toFixed(2) : "0";
  console.log(`${b.name}.pdf  ${w}×${h}px → ${(w / PX_PER_IN).toFixed(1)}×${(h / PX_PER_IN).toFixed(1)} in · ${size} MB`);
}
rmSync(TMP, { recursive: true, force: true });
console.log(`\n→ boards/out-pdf/`);
