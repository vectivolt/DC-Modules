// polarity-audit.mts — every polarized part, pin-for-pin, from the BUILT netlists.
//
// Convention chain being enforced:
//   tscircuit lrPolarPins: pin1 = anode/pos, pin2 = cathode/neg (node_modules/@tscircuit/props)
//   kicad5 glyphs draw exactly that: CP straight "+" plate = pin 1, D anode triangle = pin 1,
//   and every sheet instance uses the single upright orientation matrix (nothing rotates).
// So a polarized part reads correctly on the PDF if and only if its pin 1 is wired to the
// electrically-positive/anode node. This gate makes the netlists prove that instance-by-instance:
//   - every 2-pin D* component and every electrolytic (parts-db mpn EL-/ELH-) must match a rule
//   - a polarized part with NO rule is itself a FAIL (nothing gets to hide)
//   - $1/$2 in a rule substitute the designator's capture groups, so a lane-A diode cannot
//     satisfy a lane-B rail
//
// Run: npx tsx calculations/polarity-audit.mts [report]   (report: print resolutions, no gate)
import { load, reach, type Board } from "./module-interconnect-audit.mts";
import { DB } from "./cost/parts-db.mjs";

const ROOT = process.cwd();
const REPORT = process.argv[2] === "report";

interface Check { net?: string; peer?: string }           // regex sources, $n substituted
interface Rule { m: RegExp; p1: Check; p2: Check }

// pin1 check | pin2 check — pin1 is the +/anode end in every rule below
const ACDC: Rule[] = [
  { m: /^CDT\d+$/, p1: { net: "^DCP$" }, p2: { net: "^MID$" } },        // split-link top half
  { m: /^CDB\d+$/, p1: { net: "^MID$" }, p2: { net: "^DCN$" } },        // split-link bottom half
  { m: /^CAUX(24|15)$/, p1: { net: "^V$1$" }, p2: { net: "^DGND$" } },  // aux rail reservoirs
  { m: /^CVCC$/, p1: { peer: "^UAUX\\.VCC$" }, p2: { net: "^DCN$" } },  // controller VCC reservoir (aux primary return = DCN)
  { m: /^D([ABC])(\d)T$/, p1: { net: "^PH$1$2$" }, p2: { net: "^DCP$" } },  // Vienna boost top
  { m: /^D([ABC])(\d)B$/, p1: { net: "^DCN$" }, p2: { net: "^PH$1$2$" } },  // Vienna boost bottom
  { m: /^D([ABC])(\d)C$/, p1: { net: "^PH$1$2$" }, p2: { peer: "^C[ABC]\\d+C\\." } }, // phase clamp into RCD cap
  { m: /^D([ABC])(\d)P$/, p1: { net: "^I_$1$2$" }, p2: { net: "^V3P3$" } }, // ADC clamp up
  { m: /^D([ABC])(\d)N$/, p1: { net: "^AGND$" }, p2: { net: "^I_$1$2$" } }, // ADC clamp down
  { m: /^DTVS(24|15)$/, p1: { net: "^DGND$" }, p2: { net: "^V$1$" } },  // unidirectional rail TVS
  { m: /^DAUX15$/, p1: { peer: "^TAUX\\." }, p2: { net: "^V15$" } }, // flyback secondary rectifier
  { m: /^DAUX24$/, p1: { peer: "^TAUX\\." }, p2: { peer: "^(CAUX24|RAUX24)\\.pin1$" } }, // E65: cathode feeds the reservoir, RAUX24 then V24
  { m: /^DAUXVC$/, p1: { peer: "^TAUX\\.AXA$" }, p2: { peer: "^UAUX\\.VCC$" } }, // VCC winding rectifier
  { m: /^DCLA$/, p1: { peer: "^TAUX\\.P2$" }, p2: { peer: "^CCLA\\." } },   // RCD clamp diode
  { m: /^DZAUX$/, p1: { peer: "^QAUXFB\\.B$" }, p2: { peer: "^RZFB\\." } }, // R4-3 zener: reverse-biased ref, cathode toward VCC via RZFB
];
const DCDC: Rule[] = [
  { m: /^DOUT$/, p1: { net: "^BKAP$" }, p2: { net: "^OUTP$" } },           // E67 output blocking diode: bank-A top → output
  { m: /^D(\d)([AB])[13](P[23])?$/, p1: { peer: "^T$1$2\\." }, p2: { net: "^BK$2P$" } }, // E68 sec. bridge top JBS (cell T1A → film-only bank)
  { m: /^D(\d)([AB])[24](P[23])?$/, p1: { net: "^BK$2N$" }, p2: { peer: "^T$1$2\\." } }, // E67 sec. bridge bottom JBS
  { m: /^D(\d)CP$/, p1: { net: "^I_RES$1$" }, p2: { net: "^V3P3$" } },
  { m: /^D(\d)CN$/, p1: { net: "^AGND$" }, p2: { net: "^I_RES$1$" } },
];
// DESAT steering chain (GateDrive cell, both boards): DST -> 100R (R5-B) -> S1 -> S2 -> drain.
// Anodes point at the driver, cathodes march toward the drain — the diodes block the HV node.
// R5-B moved the recognized anode peer one hop: it now faces the series resistor's far pin.
const DESAT_S1: Rule = { m: /^D(\w+)S1$/, p1: { peer: "^R$1DS\\.pin2$" }, p2: { peer: "^D$1S2\\.pin1$" } };
ACDC.push(
  DESAT_S1,
  { m: /^D([ABC])(\d)GS2$/, p1: { peer: "^D$1$2GS1\\.pin2$" }, p2: { net: "^PH$1$2$" } }, // pair drain = phase node
);
DCDC.push(
  DESAT_S1,
  { m: /^D(\d)HS2$/, p1: { peer: "^D$1HS1\\.pin2$" }, p2: { net: "^DCP$" } },   // high-side drain
  { m: /^D1LS2$/, p1: { peer: "^D1LS1\\.pin2$" }, p2: { net: "^SWA$" } },   // E67 full bridge: leg A switch node
  { m: /^D2LS2$/, p1: { peer: "^D2LS1\\.pin2$" }, p2: { net: "^SWB$" } },   // leg B switch node
);
const CARD: Rule[] = [];   // no polarized parts on the card today; a new one FAILs until ruled

const elMpn = (des: string) => DB.find((r: any) => r.m.test(des))?.mpn ?? "";
const isPolarCap = (des: string) => /^ELH?-/.test(elMpn(des));

let fails = 0;
const bad = (m: string) => { console.log(`  FAIL  ${m}`); fails++; };

function subst(src: string, mm: RegExpMatchArray) {
  return new RegExp(src.replace(/\$(\d)/g, (_, d) => mm[+d] ?? ""));
}
function checkPin(b: Board, comp: string, pin: 1 | 2, c: Check, mm: RegExpMatchArray): string | null {
  const key = `${comp}.pin${pin}`;
  const net = reach(b, key);
  const g = b.groupOfPin.get(key);
  const peers = (g ? b.pinsOfGroup.get(g) ?? [] : []).filter((k) => k !== key);
  if (c.net && net && subst(c.net, mm).test(net)) return null;
  if (c.peer && peers.some((k) => subst(c.peer!, mm).test(k))) return null;
  return `net=${net ?? "?"} peers=[${peers.slice(0, 4).join(", ")}]`;
}

function audit(b: Board, rules: Rule[], tag: string) {
  let okCount = 0, seen = 0;
  for (const comp of [...b.pinCount.keys()].sort()) {
    const polar = ((b.pinCount.get(comp) ?? 0) === 2 && /^D/.test(comp)) || isPolarCap(comp);
    if (!polar) continue;
    seen++;
    const rule = rules.find((r) => r.m.test(comp));
    if (!rule) { bad(`${tag} ${comp}: polarized part with NO polarity rule`); continue; }
    const mm = comp.match(rule.m)!;
    const e1 = checkPin(b, comp, 1, rule.p1, mm);
    const e2 = checkPin(b, comp, 2, rule.p2, mm);
    if (REPORT) console.log(`  ${comp.padEnd(8)} pin1 ${e1 ? "✗ " + e1 : "ok"} | pin2 ${e2 ? "✗ " + e2 : "ok"}`);
    if (e1) bad(`${tag} ${comp}: pin1 (+/anode) wrong — ${e1}`);
    if (e2) bad(`${tag} ${comp}: pin2 (−/cathode) wrong — ${e2}`);
    if (!e1 && !e2) okCount++;
  }
  console.log(`  ok    ${tag}: ${okCount}/${seen} polarized parts verified (+/anode on pin 1)`);
}

for (const sku of ["30kw", "40kw", "50kw", "50kwa"]) {   // E40 + E41 + E42 liquid + E44 air
  console.log(`\n== polarity — ${sku} ==`);
  const ac = load(`${ROOT}/dist/boards/${sku}/acdc/circuit.json`);
  const dc = load(`${ROOT}/dist/boards/${sku}/dcdc/circuit.json`);
  if (!ac || !dc) { bad(`${sku}: missing board build(s)`); continue; }
  audit(ac, ACDC, `${sku}/acdc`);
  audit(dc, DCDC, `${sku}/dcdc`);
}
console.log(`\n== polarity — control card ==`);
const card = load(`${ROOT}/dist/boards/control-card/circuit.json`);
if (card) audit(card, CARD, "card"); else bad("card: missing build");

console.log(fails ? `\n${fails} POLARITY FAILURE(S)` : `\nPOLARITY CLEAN — every +/anode is on pin 1 as the glyphs draw it`);
process.exit(fails ? 1 : 0);
