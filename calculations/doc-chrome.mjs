// doc-chrome.mjs — the ONE registry of documentation pages and the masthead/footer every page carries
// (E61 presentation standard). Generators import it so a regenerated page keeps its chrome;
// docs-lint asserts every tracked page is registered here and carries exactly this chrome.
import { dirname, relative } from "node:path";

export const REV = "E61";
export const UPDATED = "2026-09-14";

const STATUS = {
  OVERVIEW: ["0969da", "overview"], HUB: ["0969da", "navigation hub"], LIVE_SPEC: ["2ea44f", "live specification"],
  RFQ_PACK: ["b4642a", "RFQ pack"], WORK_INSTRUCTION: ["b4642a", "work instruction"], GENERATED: ["5f8fc0", "generated — do not hand-edit"],
  EVIDENCE: ["1a9fb3", "evidence record"], SOURCING_GUIDE: ["d19a00", "sourcing guide"], PARKED: ["8b949e", "parked phase"],
  HISTORICAL: ["6e7781", "historical record"],
};

// Reading order = footer prev/next order. [path, family, icon, title, subtitle, status, extra badges [label, message, color]]
export const PAGES = [
  ["README.md", "hero", "", "DC-Modules", "Engineering repository for the Vectivolt 30 / 40 / 50 kW SiC EV charging modules and the 100 / 150 kW products", "OVERVIEW"],
  ["docs/README.md", "platform", "🧭", "Documentation Hub", "Every governing document, what each one decides, and the order to read them in", "HUB"],
  ["docs/architecture.md", "platform", "🏗️", "Platform Architecture", "The module in one read — power path, control plane, protection layers, rails and the product family", "LIVE_SPEC"],
  ["docs/assumptions.md", "platform", "📒", "Decision Register", "Every frozen decision E1–E69, why it was taken, and the evidence that holds it", "LIVE_SPEC", [["gate", "stress--audit_·_review--checks", "2ea44f"]]],
  ["docs/interconnect.md", "platform", "🔌", "Two-Board Sandwich & Interconnect", "Stud pillars, the 40-way harness, grounding, discharge control and the HMI contract", "LIVE_SPEC", [["gate", "module--interconnect--audit", "2ea44f"]]],
  ["docs/control-card-scope.md", "platform", "🧠", "Control-Card Scope", "Why one card runs one module up to 50 kW — connector ways, HRTIMER units and MCU pins", "LIVE_SPEC", [["gate", "cardMap()_refuses_out--of--scope", "2ea44f"]]],
  ["docs/firmware-guide.md", "platform", "💾", "Firmware Guide", "The supervisory C99 core — state machine, fault ladder, HAL contract and the host-proven test suite", "LIVE_SPEC", [["host__sim", "60%2F60_ASan%2FUBSan", "2ea44f"]]],
  ["docs/can-protocol.md", "platform", "📡", "External CAN Protocol", "CAN 2.0B addressing, control and telemetry frames, and the rules a charger controller must follow", "LIVE_SPEC", [["codec", "can__proto.c_fuzzed", "2ea44f"]]],
  ["boards/README.md", "platform", "🧩", "Boards", "The four module SKUs, the control card, the 150 kW cabinet, and how the release sheets are produced", "OVERVIEW", [["labels", "6901_verified_·_6_targets", "2ea44f"]]],
  ["boards/README-product-structure.md", "platform", "🏢", "Product Structure", "Why the family is 30 / 40 / 50 kW modules plus 100 and 150 kW products — and the multi-module contract", "LIVE_SPEC"],
  ["boards/30kw/README.md", "platform", "📋", "30 kW Module Walkthrough", "The canonical board pair, cell by cell — every cell reused unchanged across the family", "LIVE_SPEC"],
  ["docs/protection-thresholds.md", "power", "🛡️", "Protection Thresholds", "The F.xx fault ladder — hardware-fast and supervisory rows, per-SKU windows and current classes", "LIVE_SPEC", [["gate", "review--checks_·_current--coordination", "2ea44f"]]],
  ["docs/current-coordination.md", "power", "⚡", "Current & Protection Coordination", "The worst simulated current in every magnetic and switch, against the trip, sensor and part that must handle it", "LIVE_SPEC", [["gate", "current--coordination_·_CLEAN", "2ea44f"]]],
  ["docs/thermal-report.md", "power", "🌡️", "Thermal Report", "Where every watt goes, how it leaves the box, and the temperatures that result", "LIVE_SPEC", [["grid", "4536_pts_·_0_fail_·_0_folds", "2ea44f"]]],
  ["docs/insulation-coordination.md", "power", "🧱", "Insulation Coordination", "The barrier map, creepage and clearance values, the standards matrix and the hipot plan", "LIVE_SPEC"],
  ["docs/busbar-drawings.md", "power", "🔩", "Busbar Drawings & Joint Spec", "Bulk-copper paths, sections, lengths, joints and the torque schedule", "GENERATED", [["owner", "busbar--calc.mjs", "5f8fc0"]]],
  ["docs/magnetics.md", "magnetics", "🧲", "Magnetics Drawings D1–D7", "Every custom magnetic — identity, construction, acceptance lines and the per-SKU variants", "LIVE_SPEC", [["gate", "mag--sync_·_rfq--audit_·_conductor--audit", "2ea44f"]]],
  ["docs/conductor-selection.md", "magnetics", "🧵", "Conductor Selection", "Which copper each winding uses and why — foil gauge, litz strand and AC resistance at 140 kHz", "LIVE_SPEC", [["gate", "conductor--audit_·_CLEAN", "2ea44f"]]],
  ["docs/magnetics-manufacturing-pack.md", "magnetics", "📦", "Magnetics RFQ Pack", "One quote-ready sheet per magnetic, with the sourcing directory and the first-article method", "RFQ_PACK", [["rfq--audit", "0_missing_fields", "2ea44f"]]],
  ["docs/magnetics-build-instructions.md", "magnetics", "🛠️", "Magnetics Build Instructions", "How each magnetic is actually made — lay-up, cut lengths, gapping, impregnation and hold points", "WORK_INSTRUCTION"],
  ["docs/magnetics-fmea-e58.md", "magnetics", "🔥", "Magnetics FMEA & Temperature Critique", "Runaway, cold start, saturation and every failure mode, computed on measured ferrite data", "LIVE_SPEC", [["gate", "temp--critique_·_CLEAN", "2ea44f"]]],
  ["docs/aux-transformer-D4.md", "magnetics", "🌀", "D4 Aux Flyback Transformer", "The rev D turns sheet for the 110 W full-bus auxiliary supply", "LIVE_SPEC", [["gate", "stress--audit_D4_Bpk", "2ea44f"]]],
  ["docs/simulation-toolchain.md", "verification", "🧪", "Simulation Toolchain", "Which tool proves what, how to run it, how to read the result, and where fidelity ends", "LIVE_SPEC", [["engine", "ngspice--46_·_node_20", "5f8fc0"]]],
  ["docs/simulation-report.md", "verification", "📈", "Simulation Report", "The simulation-truth ledger — every executed run, its result, and what it may be used to claim", "EVIDENCE"],
  ["docs/verification-matrix.md", "verification", "✅", "Verification Matrix & Risk Register", "Every requirement mapped to its evidence, and the risks still open", "LIVE_SPEC", [["verify--independent", "227%2F227", "2ea44f"]]],
  ["docs/evt-plan.md", "verification", "🔬", "EVT Test Plan", "The first-hardware campaign T-00…T-41, and the rule that lets bench results reopen a calculation", "LIVE_SPEC"],
  ["docs/final-validation-e51.md", "verification", "🏁", "End-to-End Validation Verdict", "Verdicts by category from start-up to tolerances, with evidence and the honest open list", "LIVE_SPEC"],
  ["docs/reliability-budget.md", "verification", "🛡️", "Reliability Budget", "Parts-count MTBF prediction with its basis declared, the wear-out clocks, and the no-single-point-of-darkness system view", "LIVE_SPEC", [["gate", "mtbf--budget_·_CONSISTENT", "2ea44f"]]],
  ["calculations/README.md", "verification", "🧮", "Calculations & Gates", "Every engine, audit and generator — and the one command that reproduces the design", "OVERVIEW", [["run--all", "exit_0", "2ea44f"]]],
  ["spice/README.md", "verification", "🖥️", "SPICE Simulation Suites", "The ngspice runners, what each one proves, and where its results land", "OVERVIEW"],
  ["docs/component-selection.md", "production", "🏷️", "Component Selection", "The part table, sourcing policy, second-source rules and the price basis", "LIVE_SPEC"],
  ["docs/bom-guide.md", "production", "📚", "BOM Guide", "How the BOM is generated from the built boards, and what each maturity status means", "LIVE_SPEC", [["gate", "bom--maturity_·_MATURE", "2ea44f"]]],
  ["docs/bom-cost.md", "production", "🧾", "BOM & Cost Roll-up", "Module and product cost from 100 pcs to 10k, and the ₹ / kW ladder", "GENERATED", [["owner", "bom--gen.mjs", "5f8fc0"]]],
  ["docs/lcsc-status.md", "production", "🔎", "LCSC Assignment Status", "Which parts carry an orderable LCSC number, which deliberately do not, and the lines still open before release", "LIVE_SPEC", [["sheets", "2662_instances_·_54%25_C--number_·_land--matched", "2ea44f"], ["gate", "bom--maturity_·_MATURE", "2ea44f"]]],
  ["docs/symbol-pin-map.md", "production", "📍", "Symbol → Package Pin Map", "Logical pin names on the schematic mapped to physical package pins, family by family", "GENERATED", [["owner", "pin--map--export.mjs", "5f8fc0"]]],
  ["docs/prototype-fast-path.md", "production", "🚀", "Prototype Fast Path", "Off-the-shelf parts and wind-in-house routes that cut the custom-magnetics lead time", "SOURCING_GUIDE", [["stock", "read_13_Sep_2026", "8b949e"]]],
  ["docs/dfm-production.md", "production", "🏭", "DFM & Production Flow", "Assembly sequence, kitting, torque schedule, end-of-line test and coating", "LIVE_SPEC"],
  ["docs/competitive-benchmark-e51.md", "production", "📊", "Competitive Benchmark", "Verified market position, the SiC verdict, the density gap, cost levers and harsh-environment parity", "LIVE_SPEC"],
  ["docs/benchmark-infypower-teardown.md", "production", "🩻", "InfyPower Teardown Benchmark", "Block-by-block audit of our architecture against the REG1K0135A2 40 kW SiC module teardown", "LIVE_SPEC", [["source", "chargerlab_·_read_2026--09--13", "8b949e"], ["verdict", "architecture_and_BOM_cloned_E67–E69_·_cost_gap_open", "d19a00"]]],
  ["docs/footprints-to-draw.md", "production", "✏️", "Footprints to Draw", "The land-pattern queue for the layout phase — what has a land, what must be drawn, what blocks entry", "PARKED", [["audit", "footprint--audit_·_E61_baseline", "8b949e"]]],
  ["docs/pcb-floorplan.md", "production", "🗺️", "PCB Floorplan Basis", "Zones, barriers and airflow — the layout-phase basis, parked since E36", "PARKED"],
  ["docs/history/README.md", "history", "🗄️", "Historical Records", "Dated records kept verbatim, and where their conclusions live now", "HISTORICAL"],
  ["docs/design-basis-report.md", "history", "🗄️", "Design Basis Report — Phase 1", "The original 30/60/120 kW design basis; superseded values carry arrow-notes", "HISTORICAL", [["record", "2026--09--04", "6e7781"]]],
  ["docs/design-review-production.md", "history", "🗄️", "Production Design Review R1", "The first adversarial audit — 15 blockers, all closed at rev C", "HISTORICAL", [["record", "2026--09--05", "6e7781"]]],
  ["docs/design-review-production-r2.md", "history", "🗄️", "Production Design Review R2", "The re-audit of schematic rev C — 7 critical blockers plus the HR/MR set, all closed at rev D", "HISTORICAL", [["record", "2026--09--05", "6e7781"]]],
  ["docs/history/review-response-r3.md", "history", "🗄️", "Review Response R3", "The answer to the external 30/60/120 kW PDF review — six real defects found and fixed", "HISTORICAL", [["record", "2026--09--06", "6e7781"]]],
  ["docs/history/single-card-migration-plan.md", "history", "🗄️", "Single-Card Migration Plan", "The E40 plan that moved each module to one control card — executed, kept as the decision record", "HISTORICAL", [["record", "2026--09--08", "6e7781"]]],
  ["docs/history/drc-erc-report.md", "history", "🗄️", "DRC / ERC Report", "The rev F electrical-rule snapshot of the tscircuit builds", "HISTORICAL", [["record", "2026--09--05", "6e7781"]]],
  ["docs/history/easyeda-transcription.md", "history", "🗄️", "EasyEDA Transcription Notes", "The superseded pin-by-pin transcription path, kept for the tool limits it recorded", "HISTORICAL", [["record", "2026--09--06", "6e7781"]]],
  ["docs/history/mcu-pin-allocation-gd32.md", "history", "🗄️", "GD32 Pin Allocation (R3)", "How the MCU allocation was first derived and audited; the live map is generated", "HISTORICAL", [["record", "R3", "6e7781"]]],
  ["docs/history/schematic-drawing-set.md", "history", "🗄️", "Schematic Drawing Set (card era)", "The pre-E56 drawing-set notes, superseded by the KiCad-native pipeline", "HISTORICAL", [["record", "2026--09--07", "6e7781"]]],
];

const byPath = new Map(PAGES.map((p, i) => [p[0], { i, path: p[0], family: p[1], icon: p[2], title: p[3], subtitle: p[4], status: p[5], badges: p[6] ?? [] }]));
export const page = (path) => byPath.get(path);
const up = (path, target) => relative(dirname(path), target) || ".";
const badge = (label, message, color, alt) => `<img src="https://img.shields.io/badge/${label}-${message}-${color}?style=flat-square" alt="${alt}"/>`;

export function masthead(path) {
  const p = page(path);
  if (!p) throw new Error(`doc-chrome: ${path} is not registered in PAGES`);
  const [color, words] = STATUS[p.status];
  const art = p.family === "hero"
    ? `<img src="${up(path, "docs/assets/hero.svg")}" alt="DC-Modules — 30, 40 and 50 kW SiC EV charging modules; 100 and 150 kW products" width="100%"/>`
    : `<img src="${up(path, `docs/assets/banner-${p.family}.svg`)}" alt="" width="100%"/>`;
  const badges = [
    badge("status", p.status.replace(/_/g, "__"), color, `status: ${words}`),
    p.status === "HISTORICAL" ? null : badge("rev", REV, "f2b705", `revision ${REV}`),
    p.status === "HISTORICAL" ? badge("indexed", REV, "8b949e", `indexed at ${REV}`) : badge("updated", UPDATED.replace(/-/g, "--"), "8b949e", `updated ${UPDATED}`),
    ...p.badges.map(([l, m, c]) => badge(l, m, c, `${l.replace(/--/g, "-").replace(/__/g, "_")}: ${decodeURIComponent(m).replace(/--/g, "-").replace(/__/g, "_").replace(/_/g, " ")}`)),
  ].filter(Boolean);
  return [
    art, "",
    `# ${p.icon ? `${p.icon} ` : ""}${p.title}`, "",
    `<sub>${p.subtitle}</sub>`, "",
    "<p>", ...badges.map((b) => `  ${b}`), "</p>",
  ].join("\n");
}

export function footer(path) {
  const p = page(path);
  const prev = PAGES[p.i - 1], next = PAGES[p.i + 1];
  const link = (q, text) => `<a href="${up(path, q[0])}">${text}</a>`;
  const parts = [
    prev ? link(prev, `← ${prev[3]}`) : null,
    path === "README.md" ? null : path === "docs/README.md" ? link(PAGES[0], "🏠 Repository overview") : `<a href="${up(path, "docs/README.md")}">🧭 Documentation hub</a>`,
    next ? link(next, `${next[3]} →`) : null,
  ].filter(Boolean);
  return ["---", "", '<div align="center">', `<sub>${parts.join(" &nbsp;·&nbsp; ")}</sub>`, "", `<sub>Vectivolt DC-Modules · documentation rev ${REV} · every number reproduces with <code>sh calculations/run-all.sh</code></sub>`, "</div>"].join("\n");
}

// Strip any existing masthead/footer from a page body and wrap it in the current chrome.
export function wrap(path, text) {
  let lines = text.replace(/\r/g, "").split("\n");
  const h1 = lines.findIndex((l) => /^# \S/.test(l));
  if (h1 >= 0 && h1 < 40) {
    let i = h1 + 1;
    const skip = (l) => l.trim() === "" || /^<sub>.*<\/sub>$/.test(l.trim());
    while (i < lines.length && skip(lines[i])) i++;
    if (/^<p[ >]/.test(lines[i]?.trim() ?? "") && /shields\.io|<p>$|<p align/.test(lines[i])) {
      while (i < lines.length && !/<\/p>/.test(lines[i])) i++;
      i++;
    }
    lines = lines.slice(i);
  }
  let body = lines.join("\n").replace(/^\s+/, "");
  const f = body.lastIndexOf('\n---\n\n<div align="center">');
  if (f >= 0 && /Documentation hub/.test(body.slice(f))) body = body.slice(0, f);
  body = body.replace(/^> \*\*Purpose\*\*/, "> [!NOTE]\n> **Purpose**").trimEnd();
  return `${masthead(path)}\n\n${body}\n\n${footer(path)}\n`;
}
