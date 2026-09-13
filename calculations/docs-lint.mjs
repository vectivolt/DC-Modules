#!/usr/bin/env node
// docs-lint.mjs — E61 documentation gate. Every tracked Markdown file must:
//   · resolve every relative link, image and #anchor (GitHub heading slugs),
//   · be registered in doc-chrome.mjs and carry exactly its masthead (banner, H1, subtitle, badges) and footer,
//   · open every mermaid block with a diagram type GitHub renders.
// Run: node calculations/docs-lint.mjs
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES, footer, masthead, page } from "./doc-chrome.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MERMAID = /^(flowchart|graph|sequenceDiagram|stateDiagram-v2|classDiagram|erDiagram|pie|xychart-beta|quadrantChart|timeline|gantt|mindmap|journey)\b/;

const files = execFileSync("git", ["ls-files", "*.md"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean);
let fails = 0;
const fail = (f, msg) => { console.log(`  FAIL  ${f} — ${msg}`); fails++; };

// github-slugger: lowercase, drop everything but letters/marks/numbers/connector punctuation/space/hyphen, spaces → hyphens
const slug = (text) => text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
const plain = (h) => h.replace(/<[^>]+>/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_~]/g, (m) => (m === "_" ? "_" : ""));

const cache = new Map();
function parse(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const text = readFileSync(join(ROOT, rel), "utf8");
  const lines = text.split("\n");
  const anchors = new Set(), seen = new Map(), mermaid = [], body = [];
  let fence = null, block = [];
  for (const line of lines) {
    const f = line.match(/^\s*(```+|~~~+)\s*([\w-]*)/);
    if (f && !fence) { fence = { mark: f[1], lang: f[2] }; block = []; continue; }
    if (fence && line.trim().startsWith(fence.mark)) { if (fence.lang === "mermaid") mermaid.push(block.join("\n")); fence = null; continue; }
    if (fence) { block.push(line); continue; }
    body.push(line);
    const h = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (h) {
      const base = slug(plain(h[1]));
      const n = seen.get(base) ?? 0;
      anchors.add(n ? `${base}-${n}` : base);
      seen.set(base, n + 1);
    }
    for (const m of line.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) anchors.add(m[1].toLowerCase());
  }
  const out = { text, lines, anchors, mermaid, body: body.join("\n") };
  cache.set(rel, out);
  return out;
}

let links = 0, diagrams = 0;
for (const rel of files) {
  const doc = parse(rel);
  // ---- links and anchors
  const targets = [
    ...[...doc.body.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((m) => m[1]),
    ...[...doc.body.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]),
    ...[...doc.body.matchAll(/\bsrcset="([^"\s]+)/g)].map((m) => m[1]),
  ];
  for (const t of targets) {
    if (/^(https?:|mailto:|data:|tel:)/.test(t)) continue;
    links++;
    const [p, anchor] = t.split("#");
    const target = p ? normalize(join(dirname(rel), decodeURIComponent(p))) : rel;
    if (p && !existsSync(join(ROOT, target))) { fail(rel, `broken link → ${t}`); continue; }
    if (anchor && target.endsWith(".md") && statSync(join(ROOT, target)).isFile()) {
      if (!parse(target).anchors.has(decodeURIComponent(anchor).toLowerCase())) fail(rel, `missing anchor → ${t}`);
    }
  }
  // ---- chrome (masthead + footer come from the registry, so every page matches the standard exactly)
  if (!page(rel)) fail(rel, "not registered in calculations/doc-chrome.mjs PAGES");
  else {
    if (!doc.text.startsWith(masthead(rel) + "\n")) fail(rel, "masthead differs from doc-chrome (re-wrap the page)");
    if (!doc.text.trimEnd().endsWith(footer(rel))) fail(rel, "footer differs from doc-chrome (re-wrap the page)");
    if (doc.text.split(footer(rel)).length !== 2) fail(rel, "footer appears more than once");   // E61: README carried two
  }
  // ---- mermaid
  for (const m of doc.mermaid) {
    diagrams++;
    const first = m.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("%%")) ?? "";
    if (!MERMAID.test(first)) fail(rel, `mermaid block opens with "${first.slice(0, 40)}"`);
  }
}
for (const [p] of PAGES) if (!files.includes(p)) fail(p, "registered in doc-chrome but not tracked");
console.log(`\n${files.length} documents · ${links} relative links · ${diagrams} diagrams`);
console.log(fails ? `${fails} DOCUMENTATION FAILURE(S)` : "DOCS LINT CLEAN — every link resolves, every document carries its masthead and hub footer, every diagram renders");
process.exit(fails ? 1 : 0);
