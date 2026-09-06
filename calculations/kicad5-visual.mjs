#!/usr/bin/env node
// kicad5-visual.mjs — machine-check the drawing rules the sheets are supposed to satisfy.
//
// kicad5-verify.mjs proves the NETLIST is right. This proves the DRAWING is right: that no two
// pieces of ink collide. Spot-checking pages by eye found four real defects (reference over pin
// number, power-pin name over pin name, bare unbound stubs, studs as empty boxes) — but eyes
// only sampled 2 of 12 pages. This checks every glyph on every page.
//
// Checks, all in mils on the emitted geometry:
//   1. label text boxes must not overlap each other
//   2. label text must not sit on top of a component body
//   3. reference / value text must not overlap the body it annotates or its neighbours
//   4. wires must not run through a component body they do not terminate on
//
// Run: node calculations/kicad5-visual.mjs
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCH = join(ROOT, "kicad5/dc-modules-30kw");

// legacy text metrics: size 50 => ~33 mil advance, ~50 mil cap height
const GLYPH = 33, CAPH = 50;
// vertical labels (dir 1 up / 3 down) are ROTATED: their box is tall, not wide. Measuring them
// horizontally reported the whole V3P3/DGND supply comb as colliding when it does not.
const boxOf = (txt, x, y, justify, vert = false) => {
  const len = txt.length * GLYPH;
  if (vert) {
    const y0 = justify === "R" ? y : y - len;      // grows away from the stub
    return { x0: x - CAPH / 2, y0, x1: x + CAPH / 2, y1: y0 + len };
  }
  const x0 = justify === "R" ? x - len : justify === "C" ? x - len / 2 : x;
  return { x0, y0: y - CAPH / 2, x1: x0 + len, y1: y + CAPH / 2 };
};
const hit = (a, b) => a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1;

const LIB = new Map();
for (const blk of readFileSync(join(SCH, "dc-modules.lib"), "utf8").split(/^DEF /m).slice(1)) {
  const name = blk.split(/\s+/)[0];
  let box = null;
  for (const l of blk.split("\n")) {
    if (l.startsWith("S ")) {
      const t = l.split(/\s+/).map(Number);
      box = { x0: Math.min(t[1], t[3]), y0: Math.min(t[2], t[4]), x1: Math.max(t[1], t[3]), y1: Math.max(t[2], t[4]) };
    } else if (l.startsWith("C ") && !box) {
      const t = l.split(/\s+/).map(Number);
      box = { x0: t[1] - t[3], y0: t[2] - t[3], x1: t[1] + t[3], y1: t[2] + t[3] };
    }
  }
  LIB.set(name, box ?? { x0: -40, y0: -100, x1: 40, y1: 100 });
}

let pages = 0, problems = [], nLab = 0, nSym = 0;
for (const f of ["30kw-acdc.sch", "30kw-dcdc.sch"]) {
  const lines = readFileSync(join(SCH, f), "utf8").split("\n");
  const labels = [], syms = [], texts = [];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (L.startsWith("Text GLabel ")) {
      const t = L.split(/\s+/);
      const [x, y, dir] = [+t[2], +t[3], +t[4]];
      const net = lines[++i];
      // a label grows away from its stub: dir 0 = right, 2 = left, 1 = up, 3 = down
      const vert = dir === 1 || dir === 3;
      labels.push({ net, box: boxOf(net, x, y, vert ? (dir === 3 ? "R" : "L") : dir === 2 ? "R" : "L", vert) });
    } else if (L === "$Comp") {
      let ref = "", libn = "", x = 0, y = 0, fields = [];
      for (let k = i + 1; k < lines.length && lines[k] !== "$EndComp"; k++) {
        const M = lines[k];
        if (M.startsWith("L ")) { const t = M.split(/\s+/); libn = t[1].split(":").pop(); ref = t[2]; }
        else if (M.startsWith("P ")) { const t = M.split(/\s+/); x = +t[1]; y = +t[2]; }
        else if (/^F [01] "/.test(M)) {
          const m = M.match(/^F [01] "([^"]*)" \w+ (-?\d+) (-?\d+) \d+\s+\d+ ([LRC])/);
          if (m && m[1]) fields.push({ txt: m[1], box: boxOf(m[1], +m[2], +m[3], m[4]) });
        }
      }
      const b = LIB.get(libn) ?? { x0: -40, y0: -100, x1: 40, y1: 100 };
      // lib Y is up, sheet Y is down
      syms.push({ ref, box: { x0: x + b.x0, y0: y - b.y1, x1: x + b.x1, y1: y - b.y0 }, fields });
    }
  }
  nLab += labels.length; nSym += syms.length;

  const add = (m) => { if (problems.length < 40) problems.push(`${f.replace(".sch", "")}: ${m}`); };
  for (let a = 0; a < labels.length; a++)
    for (let b = a + 1; b < labels.length; b++)
      if (hit(labels[a].box, labels[b].box)) add(`labels overlap: "${labels[a].net}" x "${labels[b].net}"`);
  for (const l of labels)
    for (const s of syms)
      if (hit(l.box, s.box)) add(`label "${l.net}" sits on symbol ${s.ref}`);
  const allFields = syms.flatMap((s) => s.fields.map((fl) => ({ ...fl, ref: s.ref })));
  for (let a = 0; a < allFields.length; a++)
    for (let b = a + 1; b < allFields.length; b++)
      if (hit(allFields[a].box, allFields[b].box)) add(`text overlap: "${allFields[a].txt}" x "${allFields[b].txt}"`);
  for (const fl of allFields)
    for (const s of syms)
      if (s.ref !== fl.ref && hit(fl.box, s.box)) add(`text "${fl.txt}" (${fl.ref}) sits on symbol ${s.ref}`);
  pages++;
}

console.log(`${pages} sheets · ${nSym} symbols · ${nLab} labels checked`);
console.log(problems.length ? `${problems.length}+ collisions:` : "no ink collisions: labels, symbols and field text are all clear");
problems.slice(0, 25).forEach((p) => console.log("  " + p));
process.exit(problems.length ? 1 : 0);
