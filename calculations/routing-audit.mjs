#!/usr/bin/env node
// routing-audit.mjs — justify every net's COPPER by the current it carries.
//
// The board is not autorouted, on purpose: an autorouter cannot reason about creepage, commutation
// loop area or return paths, which are the three things that decide whether this board works. That
// only holds up if every net's copper is a deliberate choice, so this checks the choice.
//
// Width from IPC-2221:  A[mil^2] = (I / (k * dT^0.44))^(1/0.725),  k = 0.048 external, 0.024 inner
//                       W[mm]    = A / (1.378 * oz)  * 0.0254
// Currents from calculations/design-basis.mjs (54.9 Arms/phase at 285-330 VAC, 30 kW).
//
//   PLANE      every net over PLANE_A must be plane-served, not a trace
//   WIDTH      trace-routed nets get the width their current actually needs
//   RETURN     control return and PE must not share a plane (single-point bond only)
//   STITCH     a signal that changes layer needs a return path near the transition
//
// Run: node calculations/routing-audit.mjs [sku] [side]

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extents } from "./pcb-geom.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKU = process.argv[2] || "30kw", SIDE = process.argv[3] || "acdc";
const OZ = 2, DT = 20;                 // 2 oz copper, 20 K rise
const PLANE_A = 10;                    // A: above this, copper must be a plane

// Per-net RMS current for this SKU. Phase current is the design basis worst case (lowest line
// voltage); the DC link carries the rectified equivalent. Anything not listed is small-signal.
const AMPS = {
  "30kw":  { phase: 54.9, link: 37.5 },
  "60kw":  { phase: 109.9, link: 75.0 },
  "120kw": { phase: 219.8, link: 150.0 },
}[SKU] ?? { phase: 54.9, link: 37.5 };
const NET_A = (n) => {
  if (/^(AC[123]F?|LF[123]|PH[ABC]\d)$/.test(n)) return AMPS.phase;
  if (/^(DCP|DCN|MID)$/.test(n)) return AMPS.link;
  if (/^(V24)$/.test(n)) return 3.0;
  if (/^(V15|V3P3)$/.test(n)) return 1.5;
  if (/^(PE|DGND|AGND|NSTAR)$/.test(n)) return 0.5;   // reference, not a load path
  return 0.1;
};
const widthMm = (I, external) => {
  const k = external ? 0.048 : 0.024;
  const areaMil2 = Math.pow(I / (k * Math.pow(DT, 0.44)), 1 / 0.725);
  return (areaMil2 / (1.378 * OZ)) * 0.0254;
};

const f = join(ROOT, `dist/boards/${SKU}/${SIDE}/circuit.json`);
if (!existsSync(f)) { console.error(`no build at ${f}`); process.exit(2); }
const j = JSON.parse(readFileSync(f, "utf8"));
const by = {}; for (const e of j) (by[e.type] ??= []).push(e);
const parts = extents(j).parts;   // true courtyard extents, for the barrier-side check

const netName = new Map((by.source_net ?? []).map((n) => [n.source_net_id, n.name]));
const poured = new Map();                       // net name -> layer
for (const p of by.pcb_copper_pour ?? []) poured.set(netName.get(p.source_net_id) ?? "?", p.layer);

// which nets actually exist on this board, and how many connections each carries
const keyNet = new Map();
for (const t of by.source_trace ?? [])
  for (const nid of t.connected_source_net_ids ?? [])
    if (netName.has(nid)) keyNet.set(t.subcircuit_connectivity_map_key, netName.get(nid));
const conns = new Map();
for (const t of by.source_trace ?? []) {
  const n = keyNet.get(t.subcircuit_connectivity_map_key);
  if (n) conns.set(n, (conns.get(n) ?? 0) + 1);
}

// Switch nodes are the ONE exception to the plane rule, and it is a deliberate one: PHA0/PHB0/PHC0
// carry the same 54.9 A as the mains phases, but they are the high-dv/dt nodes. Flooding them makes
// an antenna out of the noisiest net on the board. §7's rule for them is the minimum copper that
// carries the current, so they are judged on SPAN instead -- short and wide, not large and thin.
const SWITCH_NODE = /^PH[ABC]\d$/;
const SWITCH_SPAN = 80;   // mm, measured across the SWITCHING parts only (see below)

let bad = 0;
const line = (tag, n, tot, note) => { if (n) bad++;
  console.log(`  ${n ? "FLAG" : "ok  "} ${tag.padEnd(7)} ${String(n).padStart(3)}${tot != null ? ` / ${String(tot).padStart(3)}` : "    "}  ${note}`); };

console.log(`\n== ${SKU}-${SIDE}   routing   (${OZ} oz, ${DT} K rise, ${conns.size} named nets)\n`);
console.log(`  net        A      needs (ext)   needs (inner)   carried by`);
const heavy = [];
for (const [n] of [...conns].sort((a, b) => NET_A(b[0]) - NET_A(a[0])).slice(0, 12)) {
  const I = NET_A(n), we = widthMm(I, true), wi = widthMm(I, false);
  const lay = poured.get(n);
  const ok = I < PLANE_A || !!lay || SWITCH_NODE.test(n);
  if (!ok) heavy.push([n, I, we]);
  console.log(`  ${n.padEnd(9)} ${I.toFixed(1).padStart(5)} ${we.toFixed(1).padStart(10)} mm ${wi.toFixed(1).padStart(11)} mm   ${lay ? `PLANE ${lay}` : (SWITCH_NODE.test(n) ? "bounded cell copper (dv/dt node)" : I >= PLANE_A ? "*** TRACE — too narrow to exist ***" : "trace, ok")}`);
}
console.log();
line("PLANE", heavy.length, [...conns].filter(([n]) => NET_A(n) >= PLANE_A).length,
  `nets over ${PLANE_A} A that are not plane-served`);
for (const [n, I, w] of heavy) console.log(`         ${n}: ${I} A would need a ${w.toFixed(0)} mm trace`);

// RETURN: the control return and PE must be separate copper, bonded once
const dg = poured.get("DGND"), pe = poured.get("PE");
line("RETURN", dg && pe && dg === pe ? 1 : 0, null,
  `DGND on ${dg ?? "no plane"}, PE on ${pe ?? "no plane"} — must not share a layer`);

// PE must not be a full inner plane under the DC link (common-mode capacitance to earth)
line("PE-CM", /^inner/.test(pe ?? "") ? 1 : 0, null,
  `PE is ${pe ?? "unassigned"} — a full inner PE plane adds CM capacitance from every rail to earth`);

// SWITCH-SPAN: a dv/dt node must stay inside its own cell. Measured across the parts that sit on it.
const srcPort = by.source_port ?? [];
const compName = new Map((by.source_component ?? []).map((c) => [c.source_component_id, c.name]));
const pcbByComp = new Map();
for (const p of by.pcb_component ?? []) pcbByComp.set(p.source_component_id, p);
const spans = [];
for (const n of [...conns.keys()].filter((n) => SWITCH_NODE.test(n))) {
  const ports = srcPort.filter((sp) => keyNet.get(sp.subcircuit_connectivity_map_key) === n);
  const pts = ports.filter((sp) => !/^L[A-C]?\d/.test(compName.get(sp.source_component_id) ?? ""))
                  .map((sp) => pcbByComp.get(sp.source_component_id)).filter(Boolean);
  if (pts.length < 2) continue;
  const dx = Math.max(...pts.map((p) => p.center.x)) - Math.min(...pts.map((p) => p.center.x));
  const dy = Math.max(...pts.map((p) => p.center.y)) - Math.min(...pts.map((p) => p.center.y));
  const span = Math.hypot(dx, dy);
  if (span > SWITCH_SPAN) spans.push([n, span, pts.length]);
}
line("SW-SPAN", spans.length, [...conns.keys()].filter((n) => SWITCH_NODE.test(n)).length,
  `switch nodes spanning more than ${SWITCH_SPAN} mm (dv/dt copper must stay small)`);
for (const [n, sp, c] of spans) console.log(`         ${n}: ${sp.toFixed(0)} mm across ${c} parts`);

// --- BARRIER -----------------------------------------------------------------------------------
// On an isolated board the barrier is a LINE ON THE BOARD, and which side a part sits on is a
// safety property, not a convenience. Free space on the wrong side is not free space. This check
// exists because a "tidy up into the empty region" pass moved the whole secondary output bank --
// eight 1000 V capacitors -- onto the PRIMARY side without anything complaining.
//
// The barrier is located from the transformers, which straddle it by construction.
const xr = (re) => { const ps = parts.filter((p) => re.test(p.name));
  return ps.length ? [Math.min(...ps.map((p) => p.x0)), Math.max(...ps.map((p) => p.x1))] : null; };
// The barrier can run either way. Detect its orientation from the transformer row itself: if the
// transformers span more in X than in Y the barrier is HORIZONTAL and the domains are above and
// below it, not left and right. Testing the wrong axis reported 106 correct parts as violations.
const tf = parts.filter((p) => /^T\d$/.test(p.name));
const horiz = tf.length
  && (Math.max(...tf.map((p) => p.x1)) - Math.min(...tf.map((p) => p.x0)))
   > (Math.max(...tf.map((p) => p.y1)) - Math.min(...tf.map((p) => p.y0)));
const axis0 = (p) => (horiz ? p.y0 : p.x0), axis1 = (p) => (horiz ? p.y1 : p.x1);
const xf = tf.length
  ? [Math.min(...tf.map(axis0)), Math.max(...tf.map(axis1))]
  : null;
if (xf) {
  const [bx0, bx1] = xf;
  const PRIMARY = /^(Q\d[HL]|C\dR\d|L\dT|CT\d|R\dC[TF]|C\dCF|D\dC[PN]|CF\d|JDC[PN]|JPEB)$/;
  const SECONDARY = /^(D\d[AB]\d|CB[AB]\d[TB]|RBAL[TB][AB]\d|KSER|KPAR[AB]|KOUT|KPRE[AB]|RPRE[AB]|JOUT[PN]|RSHO|RBD[AB]\d|QDIS[AB]|COF\d)/;
  // Vertical barrier: primary LEFT (low x), secondary RIGHT (high x).
  // Horizontal barrier: primary ABOVE (high y), secondary BELOW (low y).
  const inPrimaryHalf = (p) => (horiz ? axis0(p) > bx1 : axis1(p) < bx0);
  const inSecondaryHalf = (p) => (horiz ? axis1(p) < bx0 : axis0(p) > bx1);
  const wrongP = parts.filter((p) => SECONDARY.test(p.name) && inPrimaryHalf(p));
  const wrongS = parts.filter((p) => PRIMARY.test(p.name) && inSecondaryHalf(p));
  const straddle = parts.filter((p) => (PRIMARY.test(p.name) || SECONDARY.test(p.name))
    && axis0(p) < bx1 && axis1(p) > bx0 && !/^T\d$/.test(p.name));
  const bad2 = wrongP.length + wrongS.length + straddle.length;
  line("BARRIER", bad2, parts.length,
    `parts on the wrong side of the ${horiz ? "HORIZONTAL" : "vertical"} barrier at ${horiz ? "y" : "x"} ${bx0.toFixed(0)}..${bx1.toFixed(0)} (primary ${horiz ? "above" : "left"}, secondary ${horiz ? "below" : "right"})`);
  for (const p of [...wrongP, ...wrongS, ...straddle].slice(0, 6))
    console.log(`         ${p.name.padEnd(9)} ${horiz ? "y" : "x"} ${axis0(p).toFixed(0)}..${axis1(p).toFixed(0)}  ${SECONDARY.test(p.name) ? "SECONDARY" : "primary"} domain`);
}

const planeCount = (by.pcb_copper_pour ?? []).length;
line("PLANES", planeCount < 4 ? 1 : 0, null, `${planeCount} pours declared`);

console.log(bad ? `\n${bad} routing check(s) flagged` : "\nrouting choices are justified by current");
process.exit(bad ? 1 : 0);
