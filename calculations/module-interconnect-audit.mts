// module-interconnect-audit.mts — the "did we leave common sense at the door" gate.
//
// Walks one MODULE (acdc board + dcdc board + control card, from the BUILT netlists) across every
// physical interface and asserts both sides of each boundary exist and agree:
//
//   1. DCP / DCN / PE stud pillars   — present with real pins on BOTH boards
//   2. 40-way harness               — straight-through against the single source HARNESS40; SHLD bonded at the
//                                      AC-DC end only; one-sided wires flagged
//   3. the 88-way card slot          — every way the module role map expects is wired on the board AND lands on
//                                      real electronics on the card; ways wired on one side only are flagged
//   4. RATING strap                  — the resistor code the card reads at boot encodes the SKU
//                                      (0R = 30 kW · 1k = 40 kW · 10k = 50 kW liquid · 15k = 50 kW air)
//
// Run: npx tsx calculations/module-interconnect-audit.mts [30kw|40kw|50kw|50kwa]   (default: all four)
import { readFileSync, existsSync } from "node:fs";
const ROOT = process.cwd();
const { cardMap } = await import(ROOT + "/packages/common-components/control-card.tsx");
const { HARNESS40 } = await import(ROOT + "/packages/common-components/umod-map.gen.ts");

export type Net = string;
export interface Board { netOfPin: Map<string, Net>; pinsOfNet: Map<Net, string[]>; comps: Set<string>; val: Map<string, string>;
  groupOfPin: Map<string, string>; pinsOfGroup: Map<string, string[]>; pinCount: Map<string, number>; }

export function load(path: string): Board | null {
  if (!existsSync(path)) return null;
  const j = JSON.parse(readFileSync(path, "utf8"));
  const nets = new Map<string, string>();
  for (const e of j) if (e.type === "source_net") nets.set(e.source_net_id, e.name);
  const compName = new Map<string, string>();
  const val = new Map<string, string>();
  const comps = new Set<string>();
  for (const e of j) if (e.type === "source_component") {
    compName.set(e.source_component_id, e.name); comps.add(e.name);
    if (e.resistance !== undefined) val.set(e.name, String(e.resistance));
  }
  const portKey = new Map<string, string>();   // port_id -> "COMP.pinname"
  for (const e of j) if (e.type === "source_port")
    portKey.set(e.source_port_id, `${compName.get(e.source_component_id)}.${e.name ?? e.pin_number}`);
  // union-find over traces; groups that touch an explicit net get its name
  const parent = new Map<string, string>();
  const find = (x: string): string => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  for (const p of portKey.keys()) parent.set(p, p);
  const groupNet = new Map<string, string>();
  for (const t of j) if (t.type === "source_trace") {
    const ps: string[] = t.connected_source_port_ids ?? [];
    for (let i = 1; i < ps.length; i++) { const a = find(ps[0]), b = find(ps[i]); if (a !== b) parent.set(a, b); }
    for (const nid of t.connected_source_net_ids ?? []) if (ps.length) groupNet.set(find(ps[0]), nets.get(nid)!);
  }
  for (const [g, n] of [...groupNet]) groupNet.set(find(g), n);
  const netOfPin = new Map<string, Net>();
  const pinsOfNet = new Map<Net, string[]>();
  const groupOfPin = new Map<string, string>();
  const pinsOfGroup = new Map<string, string[]>();
  const pinCount = new Map<string, number>();
  for (const [pid, key] of portKey) {
    const comp = key.split(".")[0];
    pinCount.set(comp, (pinCount.get(comp) ?? 0) + 1);
    const g = find(pid);
    groupOfPin.set(key, g);
    (pinsOfGroup.get(g) ?? pinsOfGroup.set(g, []).get(g)!).push(key);
    const n = groupNet.get(g);
    if (!n) continue;
    netOfPin.set(key, n);
    (pinsOfNet.get(n) ?? pinsOfNet.set(n, []).get(n)!).push(key);
  }
  return { netOfPin, pinsOfNet, comps, val, groupOfPin, pinsOfGroup, pinCount };
}

/* A connector pin may reach its named net THROUGH a series element (the 100 R on the link
 * lines). Resolve: direct net, else hop once across any 2-pin component in the group. */
export function reach(b: Board, pinKey: string): Net | undefined {
  const direct = b.netOfPin.get(pinKey);
  if (direct) return direct;
  const g = b.groupOfPin.get(pinKey);
  if (!g) return undefined;
  for (const peer of b.pinsOfGroup.get(g) ?? []) {
    if (peer === pinKey) continue;
    const [comp, pin] = peer.split(".");
    if ((b.pinCount.get(comp) ?? 0) !== 2) continue;
    const other = [...b.netOfPin.keys()].find((k) => k.startsWith(comp + ".") && k !== peer);
    if (other) { const n = b.netOfPin.get(other); if (n) return n; }
  }
  return undefined;
}

// Importable by sibling audits (polarity-audit) — the runner only fires when executed directly.
function main() {
let fails = 0, warns = 0;
const bad = (m: string) => { console.log(`  FAIL  ${m}`); fails++; };
const warn = (m: string) => { console.log(`  warn  ${m}`); warns++; };
const ok = (m: string) => console.log(`  ok    ${m}`);

const card = load(`${ROOT}/dist/boards/control-card/circuit.json`);
if (!card) { console.log("no card build — run tsci build boards/control-card.tsx"); process.exit(1); }

// which card-connector way carries which generic net, in pin order (the contract)
const genericWays: [string, string | null][] = cardMap("card").map(([w, n]: any) => [w, n]);

const RATING_CODE: Record<string, string> = { "30kw": "0", "40kw": "1000", "50kw": "10000", "50kwa": "15000" };   // E24 rev G bands (10k = 50 liquid · 15k = 50 AIR)
for (const sku of process.argv[2] ? [process.argv[2]] : ["30kw", "40kw", "50kw", "50kwa"]) {
  console.log(`\n== module interconnect — ${sku} ==`);
  const lanes = sku === "60kw" ? 2 : 1;
  const ac = load(`${ROOT}/dist/boards/${sku}/acdc/circuit.json`);
  const dc = load(`${ROOT}/dist/boards/${sku}/dcdc/circuit.json`);
  if (!ac || !dc) { bad(`${sku}: missing board build(s)`); continue; }

  // ---- 1. stud pillars ----
  for (const [net, a, d] of [["DCP", "JDCP", "JDCP"], ["DCN", "JDCN", "JDCN"], ["PE", "JPEB", "JPEB"]] as const) {
    const an = ac.netOfPin.get(`${a}.pin1`) ?? [...ac.netOfPin].find(([k]) => k.startsWith(a + "."))?.[1];
    const dn = dc.netOfPin.get(`${d}.pin1`) ?? [...dc.netOfPin].find(([k]) => k.startsWith(d + "."))?.[1];
    if (an === net && dn === net) ok(`stud ${net}: bolted path present on both boards`);
    else bad(`stud ${net}: acdc=${an ?? "MISSING"} dcdc=${dn ?? "MISSING"}`);
  }

  // ---- 2. 40-way harness: straight-through, single source HARNESS40 ----
  const gnd = (x?: string) => (x === "DGND" ? "GND" : x);
  let hOk = 0;
  for (const [pos, net] of HARNESS40 as [number, string | null][]) {
    const av = ac.netOfPin.get(`JICA.W${pos}`);
    const dv = dc.netOfPin.get(`JICB.W${pos}`);
    if (!net) { if (av || dv) warn(`harness W${pos}: spare but wired (${av ?? "-"}/${dv ?? "-"})`); continue; }
    if (net === "SHLD") {
      if (av !== "PE") bad(`harness W${pos} SHLD: AC-DC end must bond PE, has ${av ?? "OPEN"}`);
      if (dv) warn(`harness W${pos} SHLD: DC-DC end should float, has ${dv}`);
      continue;
    }
    if (gnd(av) !== gnd(net) || gnd(dv) !== gnd(net))
      bad(`harness W${pos}: expected ${net} both ends, drawn ${av ?? "OPEN"}/${dv ?? "OPEN"}`);
    else hOk++;
  }
  ok(`harness: ${hOk} nets verified across all 40 ways (straight-through, SHLD bonded at AC-DC)`);

  // ---- 3. the single 88-way card slot (the DC-DC board hosts the module's one brain) ----
  {
    const roleWays: [string, string | null][] = cardMap("module").map(([w, n]: any) => [w, n]);
    let wired = 0, dead = 0;
    for (const [way, roleNet] of roleWays) {
      const boardNet = dc.netOfPin.get(`JB.${way}`);
      const cardNet = card.netOfPin.get(`JCARD.${way}`);
      const expBoard = roleNet ? roleNet.replace("net.", "") : null;
      if (expBoard) {
        if (!boardNet) { dead++, bad(`module way ${way}: expects ${expBoard}, board side OPEN`); continue; }
        if (boardNet !== expBoard) { dead++, bad(`module way ${way}: expects ${expBoard}, board has ${boardNet}`); continue; }
        const others = (dc.pinsOfNet.get(boardNet) ?? []).filter((k) => !k.startsWith("JB."));
        if (others.length === 0) dead++, bad(`module way ${way}: net ${boardNet} touches ONLY the connector on the board`);
        if (!cardNet) dead++, bad(`module way ${way}: card side OPEN for an expected signal`);
        else {
          const con = (card.pinsOfNet.get(cardNet) ?? []).filter((k) => !k.startsWith("JCARD."));
          if (con.length === 0) dead++, bad(`module way ${way}: card net ${cardNet} touches only the connector`);
        }
        wired++;
      } else if (boardNet) warn(`module way ${way}: board wires ${boardNet} but the role map has it unused`);
    }
    if (dead === 0) ok(`module<->card: ${wired} expected ways verified end-to-end (single slot)`);
    else console.log(`        module<->card: ${wired} checked, ${dead} dead-ended (see FAILs)`);
  }

  // ---- 4. RATING strap: the SKU code the card reads at boot (3.32k band reserved, open = fault) ----
  {
    const v = dc.val.get("RROLEB");
    const num = v === undefined ? undefined : String(Math.round(Number(v)));
    const want = RATING_CODE[sku];
    if (num !== want) bad(`RROLEB: RATING strap is ${v ?? "MISSING"}, ${sku} codes ${want === "0" ? "0R" : want + "R"}`);
    else ok(`RROLEB: RATING strap ${want === "0" ? "0R" : want + "R"} — the card boots as the ${sku} module controller`);
  }
}


console.log(fails ? `\n${fails} INTERCONNECT FAILURE(S), ${warns} warning(s)` : `\nMODULE INTERCONNECT CLEAN (${warns} warning(s))`);
process.exit(fails ? 1 : 0);
}
if (process.argv[1]?.includes("module-interconnect-audit")) main();
