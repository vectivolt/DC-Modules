#!/usr/bin/env node
// schematic-compose.mjs — presentation-grade sheet composition.
//
// schematic-export.mjs frames each functional section but leaves it wherever the compiler put
// it, which reads as ragged: mismatched gutters, unaligned tops, large dead zones, and one
// sparse section dominating the sheet. This composer re-lays the drawing deliberately.
//
// The movable unit is a WIRE-CONNECTED CLUSTER, not a section. Components joined by a drawn
// wire form one rigid body; everything else is linked by net label and may be moved freely.
// That distinction matters: measuring found 126 wires (AC-DC) and 142 (DC-DC) crossing the
// named section boundaries, so translating whole sections would silently tear them. Clusters
// cannot be torn by construction, and packing at cluster granularity also removes the
// whitespace *inside* a section, which is what made the old sheet look accidental.
//
// Layout: clusters shelf-packed inside their section frame; section frames skyline-packed on
// the sheet in signal-flow order with uniform gutters. (Shelf rows at sheet level left a tall
// gap under every short section — 46% fill; the skyline packer lifts that to ~60%.)
//
// Output: boards/<sku>/out/<side>-sheet.svg
// Run: node calculations/schematic-compose.mjs [30kw/acdc ...]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { convertCircuitJsonToSchematicSvg } = require("circuit-to-svg");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
import { SECTIONS, SHEET_TITLES } from "./schematic-sections.mjs";

const CGUT = 26;       // gutter between clusters inside a section
const GUT = 44;        // gutter between section frames
const PAD = 15;        // padding inside a section frame
const TITLE_H = 26;    // head-room inside a frame for its title
const MARGIN = 54;     // sheet margin inside the border
const TB_H = 96;       // title block height

/** Split an SVG fragment into its top-level elements (depth- and quote-aware). */
function topLevel(s) {
  const out = [];
  let depth = 0, start = -1, i = 0;
  while (i < s.length) {
    if (s[i] !== "<") { i++; continue; }
    if (s.startsWith("<!--", i)) { i = s.indexOf("-->", i) + 3; continue; }
    const close = s[i + 1] === "/";
    let j = i + 1, q = null;
    for (; j < s.length; j++) {
      const ch = s[j];
      if (q) { if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; continue; }
      if (ch === ">") break;
    }
    const selfClose = s[j - 1] === "/";
    if (depth === 0 && !close) start = i;
    if (!close && !selfClose) depth++;
    else if (close) depth--;
    if (depth === 0 && start >= 0) { out.push(s.slice(start, j + 1)); start = -1; }
    i = j + 1;
  }
  return out;
}

/** Bounding box of an element from every coordinate literal it carries. */
function bbox(el) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const eat = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  };
  const attr = (a, k) => { const r = a.match(new RegExp(`\\s${k}="(-?[\\d.e-]+)"`)); return r ? +r[1] : NaN; };
  for (const m of el.matchAll(/\sd="([^"]+)"/g)) {
    const n = m[1].match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)?.map(Number) ?? [];
    for (let k = 0; k + 1 < n.length; k += 2) eat(n[k], n[k + 1]);
  }
  for (const m of el.matchAll(/<(?:rect|text|tspan|image|use)\b([^>]*)>/g)) {
    const x = attr(m[1], "x"), y = attr(m[1], "y"), w = attr(m[1], "width"), h = attr(m[1], "height");
    if (Number.isFinite(x) && Number.isFinite(y)) { eat(x, y); eat(x + (w || 0), y + (h || 0)); }
  }
  for (const m of el.matchAll(/<(?:circle|ellipse)\b([^>]*)>/g)) {
    const cx = attr(m[1], "cx"), cy = attr(m[1], "cy"), r = attr(m[1], "r") || attr(m[1], "rx") || 0;
    if (Number.isFinite(cx) && Number.isFinite(cy)) { eat(cx - r, cy - r); eat(cx + r, cy + r); }
  }
  for (const m of el.matchAll(/<line\b([^>]*)>/g)) {
    eat(attr(m[1], "x1"), attr(m[1], "y1")); eat(attr(m[1], "x2"), attr(m[1], "y2"));
  }
  if (!Number.isFinite(x0)) return null;
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const shelf = (items, gut, aspect = 1.6) => {                 // → rows[], each item gets .X/.Y
  const area = items.reduce((a, s) => a + (s.w + gut) * (s.h + gut), 0);
  const target = Math.max(Math.sqrt(area * aspect), Math.max(...items.map((s) => s.w)));
  const rows = []; let row = [], rw = 0;
  for (const s of items) {
    if (row.length && rw + gut + s.w > target) { rows.push(row); row = []; rw = 0; }
    row.push(s); rw += (row.length > 1 ? gut : 0) + s.w;
  }
  if (row.length) rows.push(row);
  return rows;
};

const targets = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const list = targets.length ? targets
  : ["30kw/acdc", "30kw/dcdc", "60kw/acdc", "60kw/dcdc", "120kw/acdc", "120kw/dcdc"];

let failures = 0;
for (const t of list) {
  const [sku, side] = t.split("/");
  const p = join(ROOT, "dist", "boards", sku, side, "circuit.json");
  if (!existsSync(p)) { console.log(`!! ${t}: no build at ${p}`); failures++; continue; }
  const j = JSON.parse(readFileSync(p, "utf8"));

  const srcById = new Map(j.filter((e) => e.type === "source_component").map((c) => [c.source_component_id, c.name]));
  const comps = j.filter((e) => e.type === "schematic_component");
  const compName = new Map(comps.map((c) => [c.schematic_component_id, srcById.get(c.source_component_id) ?? "?"]));

  const W = 3200;
  const xs = comps.map((c) => c.center?.x ?? 0), ys = comps.map((c) => c.center?.y ?? 0);
  const H = Math.round(W * ((Math.max(...ys) - Math.min(...ys) + 20) / (Math.max(...xs) - Math.min(...xs) + 20)));
  const raw = convertCircuitJsonToSchematicSvg(j, { width: W, height: H });

  // ---- wire graph → clusters (union-find over components joined by a drawn wire) ----
  const ports = new Map(j.filter((e) => e.type === "schematic_port")
    .map((pt) => [pt.schematic_port_id, pt]));
  const parent = new Map(comps.map((c) => [c.schematic_component_id, c.schematic_component_id]));
  const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };

  const traceOwner = new Map();  // schematic_trace_id → a component id in its cluster
  for (const tr of j.filter((e) => e.type === "schematic_trace")) {
    const ids = String(tr.source_trace_id ?? "").match(/schematic_port_\d+/g) ?? [];
    const cs = [...new Set(ids.map((id) => ports.get(id)?.schematic_component_id).filter(Boolean))];
    for (let k = 1; k < cs.length; k++) union(cs[0], cs[k]);
    if (cs.length) traceOwner.set(tr.schematic_trace_id, cs[0]);
  }

  // ---- assign every SVG element to a cluster ----
  const headEnd = raw.indexOf(">") + 1;
  const head = raw.slice(0, headEnd);
  const els = topLevel(raw.slice(headEnd, raw.lastIndexOf("</svg>")));

  const clusters = new Map();   // root component id → cluster
  const clusterOf = (rootId) => {
    if (!clusters.has(rootId)) clusters.set(rootId, { root: rootId, els: [], names: [] });
    return clusters.get(rootId);
  };
  let styleEl = "", unplaced = 0;
  const loose = [];
  for (const el of els) {
    if (el.startsWith("<style")) { styleEl += el; continue; }
    if (/^<rect[^>]*class="(?:schematic-)?boundary"/.test(el)) continue;
    if (/^<g[^>]*\/>$/.test(el) || /^<g[^>]*>\s*<\/g>$/.test(el)) continue;
    const b = bbox(el);
    if (!b) { unplaced++; continue; }
    const cid = el.match(/data-schematic-component-id="([^"]+)"/)?.[1];
    const tid = el.match(/data-schematic-trace-id="([^"]+)"/)?.[1];
    let owner = cid ?? (tid ? traceOwner.get(tid) : undefined);
    if (owner && parent.has(owner)) {
      const c = clusterOf(find(owner));
      c.els.push({ el, b });
      if (cid) c.names.push(compName.get(cid) ?? "?");
    } else loose.push({ el, b });            // net labels, ports, free text — placed by proximity
  }
  for (const c of clusters.values()) {
    const bs = c.els.map((e) => e.b);
    c.box = { x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)),
              x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) };
  }
  // loose elements join the nearest cluster so labels travel with the circuit they annotate
  for (const item of loose) {
    let best = null, bd = Infinity;
    for (const c of clusters.values()) {
      const dx = Math.max(c.box.x0 - item.b.cx, 0, item.b.cx - c.box.x1);
      const dy = Math.max(c.box.y0 - item.b.cy, 0, item.b.cy - c.box.y1);
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = c; }
    }
    if (best) best.els.push(item); else unplaced++;
  }
  for (const c of clusters.values()) {
    const bs = c.els.map((e) => e.b);
    c.box = { x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)),
              x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) };
    c.w = c.box.x1 - c.box.x0; c.h = c.box.y1 - c.box.y0;
  }

  // ---- clusters → named sections (majority vote of member designators) ----
  const order = (SECTIONS[side] ?? []).map(([title]) => title);
  const rank = new Map(order.map((tl, i) => [tl, i]));
  const sectionOf = (names) => {
    for (const [title, re] of SECTIONS[side] ?? []) if (names.some((n) => re.test(n))) return title;
    return null;
  };
  const secMap = new Map();
  const unsectioned = [];
  for (const c of clusters.values()) {
    const title = sectionOf(c.names) ?? "MISCELLANEOUS";
    if (title === "MISCELLANEOUS" && c.names.length) unsectioned.push(...c.names);
    if (!secMap.has(title)) secMap.set(title, { title, clusters: [] });
    secMap.get(title).clusters.push(c);
  }
  const secs = [...secMap.values()].sort((a, b) => (rank.get(a.title) ?? 999) - (rank.get(b.title) ?? 999));

  // ---- pack clusters inside each section, then sections on the sheet ----
  for (const s of secs) {
    s.clusters.sort((a, b) => (a.box.y0 - b.box.y0) || (a.box.x0 - b.box.x0));  // reading order
    const rows = shelf(s.clusters, CGUT, 2.1);
    let cy = 0, maxW = 0;
    for (const r of rows) {
      let cx = 0;
      for (const c of r) { c.X = cx; c.Y = cy; cx += c.w + CGUT; }
      maxW = Math.max(maxW, cx - CGUT);
      cy += Math.max(...r.map((c) => c.h)) + CGUT;
    }
    s.inner = { w: maxW, h: cy - CGUT };
    s.w = s.inner.w + 2 * PAD;
    s.h = s.inner.h + 2 * PAD + TITLE_H;
  }
  // Skyline packing: shelf rows leave a tall gap under every short section (measured 46% sheet
  // fill). This drops each section into the lowest spot it fits, in signal-flow order, so the
  // sheet stays dense while still reading left-to-right and top-to-bottom.
  const totalArea = secs.reduce((a, s) => a + (s.w + GUT) * (s.h + GUT), 0);
  const sheetW = Math.max(Math.sqrt(totalArea * 1.30), Math.max(...secs.map((s) => s.w)));
  const sky = [{ x: 0, w: sheetW, y: 0 }];
  const yOver = (x, w) => {
    let y = 0;
    for (const seg of sky) {
      if (seg.x + seg.w <= x || seg.x >= x + w) continue;
      y = Math.max(y, seg.y);
    }
    return y;
  };
  const addSky = (x, w, y) => {
    const next = [];
    for (const seg of sky) {
      if (seg.x + seg.w <= x || seg.x >= x + w) { next.push(seg); continue; }
      if (seg.x < x) next.push({ x: seg.x, w: x - seg.x, y: seg.y });
      if (seg.x + seg.w > x + w) next.push({ x: x + w, w: seg.x + seg.w - (x + w), y: seg.y });
    }
    next.push({ x, w, y });
    next.sort((a, b) => a.x - b.x);
    sky.length = 0; sky.push(...next);
  };
  for (const s of secs) {
    const w = s.w + GUT, h = s.h + GUT;
    const xsCand = [0, ...sky.map((seg) => seg.x), ...sky.map((seg) => seg.x + seg.w)]
      .filter((x) => x + w <= sheetW + 0.01).sort((a, b) => a - b);
    let bx = 0, by = Infinity;
    for (const x of xsCand) { const y = yOver(x, w); if (y < by - 0.01) { by = y; bx = x; } }
    if (!Number.isFinite(by)) { by = yOver(0, w); bx = 0; }
    s.X = MARGIN + bx; s.Y = MARGIN + by;
    addSky(bx, w, by + h);
  }
  const usedH = Math.max(...sky.map((seg) => seg.y));
  const totalW = sheetW + 2 * MARGIN - GUT, totalH = usedH - GUT + MARGIN + TB_H;

  // ---- emit ----
  const date = new Date().toISOString().slice(0, 10);
  const title = SHEET_TITLES[`${sku}/${side}`] ?? `${sku.toUpperCase()} ${side.toUpperCase()}`;
  let out = head.replace(/width="\d+" height="\d+"/, `width="${Math.ceil(totalW)}" height="${Math.ceil(totalH)}"`);
  let g = styleEl
    + `<rect class="boundary" x="0" y="0" width="${Math.ceil(totalW)}" height="${Math.ceil(totalH)}" fill="#f7f5ee"/>`
    + `<g class="sheet-border"><rect x="${MARGIN / 2}" y="${MARGIN / 2}" width="${(totalW - MARGIN).toFixed(1)}" height="${(totalH - MARGIN).toFixed(1)}" fill="none" stroke="#40506a" stroke-width="2"/></g>`;

  for (const s of secs) {
    g += `<g class="section" data-section="${esc(s.title)}">`;
    g += `<rect x="${s.X.toFixed(1)}" y="${s.Y.toFixed(1)}" width="${s.w.toFixed(1)}" height="${s.h.toFixed(1)}" rx="8" fill="#ffffff" fill-opacity="0.6" stroke="#8493a8" stroke-width="1.5"/>`;
    g += `<path d="M ${(s.X + 8).toFixed(1)} ${s.Y.toFixed(1)} h ${(s.w - 16).toFixed(1)} a 8 8 0 0 1 8 8 v ${TITLE_H - 8} h ${(-s.w).toFixed(1)} v ${-(TITLE_H - 8)} a 8 8 0 0 1 8 -8 z" fill="#e8ecf3"/>`;
    const fs = Math.max(11, Math.min(17, (s.w - 20) / (0.60 * s.title.length)));
    g += `<text x="${(s.X + 11).toFixed(1)}" y="${(s.Y + TITLE_H - 8).toFixed(1)}" font-size="${fs.toFixed(1)}" font-weight="700" fill="#26324a" letter-spacing="0.8" font-family="sans-serif">${esc(s.title)}</text>`;
    for (const c of s.clusters) {
      const dx = s.X + PAD + c.X - c.box.x0, dy = s.Y + PAD + TITLE_H + c.Y - c.box.y0;
      g += `<g transform="translate(${dx.toFixed(3)},${dy.toFixed(3)})">${c.els.map((e) => e.el).join("")}</g>`;
    }
    g += `</g>`;
  }

  const tbW = 640, tbX = totalW - MARGIN - tbW, tbY = totalH - MARGIN - TB_H + 10;
  g += `<g class="title-block" font-family="sans-serif">
<rect x="${tbX.toFixed(1)}" y="${tbY.toFixed(1)}" width="${tbW}" height="${TB_H - 10}" fill="#ffffff" stroke="#40506a" stroke-width="2"/>
<line x1="${tbX.toFixed(1)}" y1="${(tbY + 34).toFixed(1)}" x2="${(tbX + tbW).toFixed(1)}" y2="${(tbY + 34).toFixed(1)}" stroke="#40506a" stroke-width="1"/>
<text x="${(tbX + 14).toFixed(1)}" y="${(tbY + 24).toFixed(1)}" font-size="19" font-weight="700" fill="#1c2127">${esc(title)}</text>
<text x="${(tbX + 14).toFixed(1)}" y="${(tbY + 52).toFixed(1)}" font-size="12.5" fill="#40506a">Rev D.1 · ${secs.length} sections · ${clusters.size} wired clusters · ${comps.length} symbols · ${date}</text>
<text x="${(tbX + 14).toFixed(1)}" y="${(tbY + 70).toFixed(1)}" font-size="11.5" fill="#7a8aa0">Wires are intra-cluster only; every cross-section link is a net label. LCSC part numbers: docs/bom.</text>
</g>`;

  out += g + "</svg>";
  const outDir = join(ROOT, "boards", sku, "out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${side}-sheet.svg`), out);

  // ---- self-checks ----
  let bad = 0;
  for (let a = 0; a < secs.length; a++) for (let b = a + 1; b < secs.length; b++) {
    const p1 = secs[a], p2 = secs[b];
    if (p1.X < p2.X + p2.w && p2.X < p1.X + p1.w && p1.Y < p2.Y + p2.h && p2.Y < p1.Y + p1.h) {
      console.log(`   !! frames overlap: ${p1.title} × ${p2.title}`); bad++;
    }
  }
  for (const s of secs) for (let a = 0; a < s.clusters.length; a++) for (let b = a + 1; b < s.clusters.length; b++) {
    const c1 = s.clusters[a], c2 = s.clusters[b];
    if (c1.X < c2.X + c2.w && c2.X < c1.X + c1.w && c1.Y < c2.Y + c2.h && c2.Y < c1.Y + c1.h) {
      console.log(`   !! clusters overlap inside ${s.title}`); bad++;
    }
  }
  if (unplaced) { console.log(`   !! ${unplaced} element(s) could not be placed`); bad++; }
  if (unsectioned.length) console.log(`   !! unsectioned: ${[...new Set(unsectioned)].slice(0, 10).join(",")}`);
  if (bad) failures++;
  console.log(`${t}: ${comps.length} symbols · ${clusters.size} clusters · ${secs.length} sections · ${Math.ceil(totalW)}×${Math.ceil(totalH)} → ${side}-sheet.svg${bad ? `  [${bad} PROBLEM(S)]` : "  [clean]"}`);
}
process.exit(failures ? 1 : 0);
