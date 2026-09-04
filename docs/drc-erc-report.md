# DRC / ERC Report (§49-23) — generated from tsci builds, rev D (schematic rev C, 2026-09-05)

Scope note: PCB-layout DRC (placement/clearance/routing) is **N/A by customer directive** —
this report covers schematic/netlist ERC: port binding, pin-label validity, MCU pin-map asserts,
connectivity completeness. Regenerate: `tsci build boards/<sku>/<side>.tsx`.

| Board | Netlist port errors | Invalid pin/label errors | MCU pin-map assert | Build |
|---|---|---|---|---|
| 30kw/acdc | 0 | 0 | PASS (no throw) | CLEAN |
| 30kw/dcdc | 0 | 0 | PASS (no throw) | CLEAN |
| 60kw/acdc | 0 | 0 | PASS (no throw) | CLEAN |
| 60kw/dcdc | 0 | 0 | PASS (no throw) | CLEAN |
| 120kw/acdc | 0 | 0 | PASS (no throw) | CLEAN |
| 120kw/dcdc | 0 | 0 | PASS (no throw) | CLEAN |

Residual (non-blocking) notices: designator-prefix style suggestions (J/F on <chip>),
React 'key' prop notice from the runtime — cosmetic, no electrical meaning.

Overall: **ALL SIX BOARDS ERC-CLEAN** — regenerated after the production-review closure rebuild
(cells v3 / boards v3: safety chain, iso senses, bank strings, SWD, discharge rework, link
crossover all in the netlists). ERC scope caveat stands as documented in the review §G: ERC proves
connectivity, not electrical sense — the electrical-sense gate is `calculations/review-checks.mjs`
(31/31 PASS) + the simulation set.
