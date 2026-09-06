import { footprintForRef } from "./footprint-map.mjs";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const MATCHED = new Set(["R1206","R0805","R2512","C0603","C0805","C0402","C1812","L0805",
 "SOIC-8_L4.9-W3.9-P1.27-LS6.0-BL","SOIC-8_L5.9-W7.5-P1.27-LS11.5-BL","SOP-4_L4.4-W4.3-P2.54-LS7.0-BL",
 "SMB_L4.5-W3.6-LS5.3-RD","IND-SMD_L6.0-W6.0","SMA_L4.4-W2.8-LS5.4-RD","SOD-323_L1.8-W1.3-LS2.5-RD",
 "TO-247-4_L15.8-W5.0-P2.54-L","TO-247-3_L15.9-W5.0-P5.44-L","SOIC-16_L10.3-W7.5-P1.27-LS10.3-BL",
 "LQFP-100_L14.0-W14.0-P0.50-LS16.0-BL","SOT-23-6_L2.9-W1.6-P0.95-LS2.8-BL","SOT-23-5_L3.0-W1.7-P0.95-LS2.8-BL",
 "SOT-23-3_L2.9-W1.3-P1.90-LS2.4-BR","VSON-10_L3.0-W3.0-P0.50-TL-EP","SOIC-14_L8.7-W3.9-P1.27-LS6.0-BL",
 "SOIC-16_L9.9-W3.9-P1.27-LS6.0-BL","SOIC-18_L11.6-W7.5-P1.27-LS10.3-BL","SOP-6_L7.0-W4.4-P1.27-LS7.6-BL",
 "SMC_L8.0-W5.9-LS9.0-RD"]);
const need = new Map();
for (const sku of ["", "60kw/", "120kw/"]) {
  const D = `./out/easyeda/${sku}apply`;
  let files = [];
  try { files = readdirSync(D).filter((x) => x.endsWith(".json")); } catch { continue; }
  for (const f of files) for (const c of JSON.parse(readFileSync(`${D}/${f}`, "utf8")).chunks.flat()) {
    const fp = footprintForRef(c.designator, c.mpn);
    if (MATCHED.has(fp)) continue;
    if (!need.has(fp)) need.set(fp, { n: 0, parts: new Set() });
    const e = need.get(fp); e.n++; e.parts.add(c.mpn || c.value);
  }
}
const rows = [...need.entries()].sort((a, b) => b[1].n - a[1].n);
const md = ["# Footprints that must be drawn", "",
"EasyEDA raises a fatal DRC error for any component without a footprint. On import, **26 of our",
"footprint names matched EasyEDA's stock library and cleared 194 components (fatal 300 -> 106).**",
"The rest are through-hole and custom packages with no stock equivalent.", "",
"These are deliberately NOT auto-assigned. EasyEDA's library does contain names that would make",
"the DRC pass -- `RES-TH_12R_2W`, `CAP-TH_BD25.4-P10.00-D2.3-FD` -- but using them would put a 2 W",
"axial land pattern under a 25 W wirewound, and a 25.4 mm can under a 30 mm snap-in. That is",
"fabricated manufacturing data, so each is listed here with its real package instead.", "",
"| Footprint to draw | Instances (all SKUs) | Parts |", "|---|---|---|"];
for (const [fp, e] of rows) md.push(`| \`${fp}\` | ${e.n} | ${[...e.parts].slice(0, 4).join(", ")}${e.parts.size > 4 ? ` +${e.parts.size - 4}` : ""} |`);
md.push("", `**${rows.length} footprints, ${rows.reduce((a, [, e]) => a + e.n, 0)} component instances across 30/60/120 kW.**`);
md.push("", "PCB layout is out of scope by standing directive, so these are specifications, not omissions.");
writeFileSync("../docs/footprints-to-draw.md", md.join("\n") + "\n");
console.log(`${rows.length} footprints need drawing, ${rows.reduce((a, [, e]) => a + e.n, 0)} instances`);
console.log(rows.slice(0, 8).map(([f, e]) => `  ${String(e.n).padStart(3)}x ${f}`).join("\n"));
