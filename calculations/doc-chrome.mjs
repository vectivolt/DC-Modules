// doc-chrome.mjs — the ONE registry of documentation pages and the masthead/footer every page carries
// (E61 presentation standard). Generators import it so a regenerated page keeps its chrome;
// docs-lint asserts every tracked page is registered here and carries exactly this chrome.
import { dirname, relative } from "node:path";

export const REV = "E71";
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
  ["docs/assumptions.md", "platform", "📒", "Decision Register", "Every frozen decision E1–E71, why it was taken, and the evidence that holds it", "LIVE_SPEC", [["gate", "stress--audit_·_review--checks", "2ea44f"]]],
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
  ["docs/magnetics.md", "magnetics", "🧲", "Magnetics Hub", "How every magnetic is designed, proven, built and accepted — methods, materials, the common parts and the four module pages", "LIVE_SPEC", [["gate", "mag--sync_·_rfq--audit_·_magnetics--envelope", "2ea44f"]]],
  ["docs/magnetics-30kw.md", "magnetics", "🧲", "30 kW Module Magnetics", "Every magnetic on the 30 kW module — drawing, gate proof, build, tests, prototype route and cost", "GENERATED", [["owner", "mag--docs.mjs", "5f8fc0"]]],
  ["docs/magnetics-40kw.md", "magnetics", "🧲", "40 kW Module Magnetics", "Every magnetic on the 40 kW module — drawing, gate proof, build, tests, prototype route and cost", "GENERATED", [["owner", "mag--docs.mjs", "5f8fc0"]]],
  ["docs/magnetics-50kw.md", "magnetics", "🧲", "50 kW Liquid Module Magnetics", "Every magnetic on the 50 kW liquid module — drawing, gate proof, build, tests, prototype route and cost", "GENERATED", [["owner", "mag--docs.mjs", "5f8fc0"]]],
  ["docs/magnetics-50kwa.md", "magnetics", "🧲", "50 kW Air Module Magnetics", "Every magnetic on the 50 kW air module — drawing, gate proof, build, tests, prototype route and cost", "GENERATED", [["owner", "mag--docs.mjs", "5f8fc0"]]],
  ["docs/simulation-toolchain.md", "verification", "🧪", "Simulation Toolchain", "Which tool proves what, how to run it, how to read the result, and where fidelity ends", "LIVE_SPEC", [["engine", "ngspice--46_·_node_20", "5f8fc0"]]],
  ["docs/simulation-report.md", "verification", "📈", "Simulation Report", "The simulation-truth ledger — every executed run, its result, and what it may be used to claim", "EVIDENCE"],
  ["docs/verification-matrix.md", "verification", "✅", "Verification Matrix & Risk Register", "Every requirement mapped to its evidence, and the risks still open", "LIVE_SPEC", [["verify--independent", "227%2F227", "2ea44f"]]],
  ["docs/evt-plan.md", "verification", "🔬", "EVT Test Plan", "The first-hardware campaign T-00…T-41, and the rule that lets bench results reopen a calculation", "LIVE_SPEC"],
  ["docs/reliability-budget.md", "verification", "🛡️", "Reliability Budget", "Parts-count MTBF prediction with its basis declared, the wear-out clocks, and the no-single-point-of-darkness system view", "LIVE_SPEC", [["gate", "mtbf--budget_·_CONSISTENT", "2ea44f"]]],
  ["calculations/README.md", "verification", "🧮", "Calculations & Gates", "Every engine, audit and generator — and the one command that reproduces the design", "OVERVIEW", [["run--all", "exit_0", "2ea44f"]]],
  ["spice/README.md", "verification", "🖥️", "SPICE Simulation Suites", "The ngspice runners, what each one proves, and where its results land", "OVERVIEW"],
  ["docs/bom-cost.md", "production", "🧾", "BOM & Cost Roll-up", "Module and product cost from 100 pcs to 10k, and the ₹ / kW ladder", "GENERATED", [["owner", "bom--gen.mjs", "5f8fc0"]]],
  ["docs/bom-30kw.md", "production", "🧾", "30 kW Module BOM", "Every line of the 30 kW module — cost by schematic section, SKU-specific parts and sourcing status", "GENERATED", [["owner", "bom--gen.mjs", "5f8fc0"]]],
  ["docs/bom-40kw.md", "production", "🧾", "40 kW Module BOM", "Every line of the 40 kW module — cost by schematic section, SKU-specific parts and sourcing status", "GENERATED", [["owner", "bom--gen.mjs", "5f8fc0"]]],
  ["docs/bom-50kw.md", "production", "🧾", "50 kW Liquid Module BOM", "Every line of the 50 kW liquid module — cost by schematic section, SKU-specific parts and sourcing status", "GENERATED", [["owner", "bom--gen.mjs", "5f8fc0"]]],
  ["docs/bom-50kwa.md", "production", "🧾", "50 kW Air Module BOM", "Every line of the 50 kW air module — cost by schematic section, SKU-specific parts and sourcing status", "GENERATED", [["owner", "bom--gen.mjs", "5f8fc0"]]],
  ["docs/bom-guide.md", "production", "📚", "BOM Guide", "How the BOM is generated from the built boards, and what each maturity status means", "LIVE_SPEC", [["gate", "bom--maturity_·_MATURE", "2ea44f"]]],
  ["docs/symbol-pin-map.md", "production", "📍", "Symbol → Package Pin Map", "Logical pin names on the schematic mapped to physical package pins, family by family", "GENERATED", [["owner", "pin--map--export.mjs", "5f8fc0"]]],
  ["docs/dfm-production.md", "production", "🏭", "DFM & Production Flow", "Assembly sequence, kitting, torque schedule, end-of-line test and coating", "LIVE_SPEC"],
  ["docs/benchmark-infypower-teardown.md", "production", "🩻", "InfyPower Teardown Benchmark", "Block-by-block audit of our architecture against the REG1K0135A2 40 kW SiC module teardown", "LIVE_SPEC", [["source", "chargerlab_·_read_2026--09--13", "8b949e"], ["verdict", "architecture_and_BOM_cloned_E67–E69_·_cost_gap_open", "d19a00"]]],
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
  if (f >= 0 && /Documentation hub|documentation rev/.test(body.slice(f))) body = body.slice(0, f);
  body = body.replace(/^> \*\*Purpose\*\*/, "> [!NOTE]\n> **Purpose**").trimEnd();
  return `${masthead(path)}\n\n${body}\n\n${footer(path)}\n`;
}
