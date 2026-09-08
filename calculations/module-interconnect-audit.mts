// module-interconnect-audit.mts — the "did we leave common sense at the door" gate.
//
// Walks one MODULE (acdc board + dcdc board + control card, from the BUILT netlists) across every
// physical interface and asserts both sides of each boundary exist and agree:
//
//   1. DCP / DCN / PE stud pillars       — present with real pins on BOTH boards
//   2. 16-way JICA<->JICB harness        — pin-for-pin semantic table incl. the deliberate
//                                          TX/RX crossover on the DC-DC side; one-sided wires flagged
//   3. 88-way JA/JB <-> JCARD card slots — for BOTH roles: every way the role map expects is wired
//                                          on the board AND lands on real electronics on the card;
//                                          ways wired on one side only are flagged; power-way audit
//   4. RATING strap                      — the resistor code the card reads at boot must encode the
//                                          SKU (0R = 30 kW, 10k = 60 kW). Found hardcoded 0R on all
//                                          boards: a 60 kW machine identifying as 30 kW.
//
// Run: npx tsx calculations/module-interconnect-audit.mts [30kw|60kw]   (default: both)
import { readFileSync, existsSync } from "node:fs";
const ROOT = process.cwd();
const { cardMap } = await import(ROOT + "/packages/common-components/control-card.tsx");

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
 * lines, MR-14). Resolve: direct net, else hop once across any 2-pin component in the group. */
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

for (const sku of process.argv[2] ? [process.argv[2]] : ["30kw", "60kw"]) {
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

  // ---- 2. 16-way harness ----
  // expected: [pin, acdc net, dcdc net] — rev C/D semantics, TX/RX crossed on the DC-DC side
  const HARNESS: [number, string | null, string | null][] = [
    [1, "V24", "V24"], [2, "V24", "V24"], [3, "GND", "GND"], [4, "GND", "GND"],
    [5, "V15", "V15"], [6, "V15", "V15"],
    [7, "LINK_TX", "LINK_RX"], [8, "LINK_RX", "LINK_TX"],
    [9, "EN_PFC", "EN_PFC"], [10, "EN_LLC", "EN_LLC"],
    [11, null, null], [12, null, null], [13, null, null],   // reserved (MR-2) / spares->GND rev D
    [14, "GND", "GND"], [15, "GND", "GND"], [16, "PE", "PE"],
  ];
  const hpin = (b: Board, j: string, n: number) =>
    b.netOfPin.get(`${j}.pin${n}`) ?? b.netOfPin.get(`${j}.${["V24A","V24B","GNDA","GNDB","V15A","V15B","LTX","LRX","EN","KILL","FPWM","FTACH","TINL","SP1","SP2","SHLD"][n-1]}`);
  // control-ground name differs per board generator; accept GND/DGND as the same rail here
  const gnd = (x?: string) => (x === "DGND" ? "GND" : x);
  for (const [n, ae, de] of HARNESS) {
    const av = gnd(hpin(ac, "JICA", n) ?? reach(ac, "JICA." + ["V24A","V24B","GNDA","GNDB","V15A","V15B","LTX","LRX","EN","KILL","FPWM","FTACH","TINL","SP1","SP2","SHLD"][n-1]));
    const dv = gnd(hpin(dc, "JICB", n) ?? reach(dc, "JICB." + ["V24A","V24B","GNDA","GNDB","V15A","V15B","LTX","LRX","EN","KILL","FPWM","FTACH","TINL","SP1","SP2","SHLD"][n-1]));
    if (ae === null) {
      if (av || dv) warn(`harness pin ${n}: reserved but wired (acdc=${av ?? "-"} dcdc=${dv ?? "-"})`);
      continue;
    }
    if (av !== ae || dv !== de) bad(`harness pin ${n}: expected ${ae}/${de}, drawn ${av ?? "OPEN"}/${dv ?? "OPEN"}`);
  }
  ok("harness: 16-way semantics checked (incl. TX/RX crossover)");

  // ---- 3. the two 88-way card slots ----
  for (const [role, b, jname] of [["acdc", ac, "JA"], ["dcdc", dc, "JB"]] as const) {
    const roleWays: [string, string | null][] = cardMap(role, lanes).map(([w, n]: any) => [w, n]);
    let wired = 0, deadBoard = 0, deadCard = 0;
    for (let i = 0; i < roleWays.length; i++) {
      const [way, roleNet] = roleWays[i];
      const boardNet = b.netOfPin.get(`${jname}.${way}`);
      const cardNet = card.netOfPin.get(`JCARD.${way}`);
      const expBoard = roleNet ? roleNet.replace("net.", "") : null;
      if (expBoard) {
        if (!boardNet) { bad(`${role} way ${i + 1} ${way}: role expects ${expBoard}, board side OPEN`); continue; }
        if (boardNet !== expBoard) { bad(`${role} way ${i + 1} ${way}: role expects ${expBoard}, board has ${boardNet}`); continue; }
        // the board net must reach real electronics, not just the connector
        const others = (b.pinsOfNet.get(boardNet) ?? []).filter((k) => !k.startsWith(jname + "."));
        if (others.length === 0) deadBoard++, bad(`${role} way ${way}: net ${boardNet} touches ONLY the connector on the board`);
        // and the card side must land on something (MCU pin, pull-up, buffer...)
        if (!cardNet) deadCard++, bad(`${role} way ${way}: card side OPEN for an expected signal`);
        else {
          const con = (card.pinsOfNet.get(cardNet) ?? []).filter((k) => !k.startsWith("JCARD."));
          if (con.length === 0) deadCard++, bad(`${role} way ${way}: card net ${cardNet} touches only the connector`);
        }
        wired++;
      } else if (boardNet) {
        // board wired a way the role map says is unused
        warn(`${role} way ${way}: board wires ${boardNet} but the role map has it unused`);
      }
    }
    if (deadBoard + deadCard === 0)
      ok(`${role}<->card: ${wired} expected ways verified end-to-end (${roleWays.filter(([, n]) => n).length} in role map)`);
    else
      console.log(`        ${role}<->card: ${wired} ways checked, ${deadBoard + deadCard} dead-ended (see FAILs)`);
  }

  // ---- 4. RATING strap encodes the SKU ----
  const want = lanes === 2 ? "10000" : "0";
  for (const [b, r] of [[ac, "RROLE"], [dc, "RROLEB"]] as const) {
    const v = b.val.get(r);
    const num = v === undefined ? undefined : String(Math.round(Number(v)));
    if (num !== want) bad(`${r}: RATING strap is ${v ?? "MISSING"}, ${sku} needs ${want === "0" ? "0R" : "10k"} (card reads the wrong power class)`);
    else ok(`${r}: RATING strap ${want === "0" ? "0R" : "10k"} — card will identify ${sku}`);
  }
}

// ---- 5. the 120 kW cabinet sheet (E39): 4 modules + one CSU card on the CAN chain ----
const cab = load(`${ROOT}/dist/boards/cabinet/circuit.json`);
if (cab) {
  console.log(`\n== cabinet interconnect — 120 kW ==`);
  const pinsOn = (net: string) => cab.pinsOfNet.get(net) ?? [];
  const has = (net: string, key: string) => pinsOn(net).includes(key);
  // every module drop + the CSU card + exactly the two chain terminations
  for (const net of ["CANH", "CANL"] as const) {
    const want = [1, 2, 3, 4].map((n) => `MOD${n}.${net}`).concat([`UCSU.${net}`]);
    const missing = want.filter((k) => !has(net, k));
    const rts = pinsOn(net).filter((k) => /^RT[12]\./.test(k));
    if (missing.length) bad(`cabinet ${net}: missing drops ${missing.join(", ")}`);
    else if (rts.length !== 2) bad(`cabinet ${net}: ${rts.length} termination pins (need both RT1 and RT2)`);
    else ok(`cabinet ${net}: 4 modules + CSU + 2 terminations`);
  }
  for (const [r, v] of [["RT1", "120"], ["RT2", "120"], ["RRCSU", "3320"], ["RSHB", "0"]] as const) {
    const got = cab.val.get(r); const num = got === undefined ? undefined : String(Math.round(Number(got)));
    if (num !== v) bad(`cabinet ${r}: value ${got ?? "MISSING"}, want ${v}`); else ok(`cabinet ${r} = ${v} Ω`);
  }
  // CSU feed: PSU 15 V reaches both V15 ways of the header AND the card; grounds common
  const v15ok = ["PSU1.V15P", "JCSU.V15A", "JCSU.V15B", "UCSU.V15A", "UCSU.V15B"].every((k) => has("V15", k));
  const gndok = ["PSU1.V15N", "JCSU.GNDA", "JCSU.GNDB", "JCSU.GNDC", "UCSU.SGND"].every((k) => has("DGND", k));
  v15ok ? ok("cabinet CSU: PSU 15 V feeds header + card") : bad("cabinet CSU: V15 feed incomplete");
  gndok ? ok("cabinet CSU: grounds common (incl. card SGND)") : bad("cabinet CSU: ground net incomplete");
  // RATING strap forms the CSU band against the card pullup
  const roleok = ["JCSU.ROLE1", "UCSU.ROLE1", "RRCSU.pin1"].every((k) => has("ROLE1", k));
  roleok ? ok("cabinet CSU: ROLE1 strap in place (3.32 k → CSU band)") : bad("cabinet CSU: ROLE1 strap net wrong");
  // per-module AC + DC bus
  for (const n of [1, 2, 3, 4]) {
    const okm = has("AC_L1", `MOD${n}.L1`) && has("AC_L2", `MOD${n}.L2`) && has("AC_L3", `MOD${n}.L3`)
      && has("PE", `MOD${n}.PE`) && has("DCP_BUS", `MOD${n}.DCP`) && has("DCN_BUS", `MOD${n}.DCN`);
    okm ? ok(`cabinet MOD${n}: AC feed + PE + DC bus`) : bad(`cabinet MOD${n}: AC/PE/DC wiring incomplete`);
  }
  // shield: all drops on CAN_SHLD, bonded to PE through the single 0 R link
  const shok = [1, 2, 3, 4].every((n) => has("CAN_SHLD", `MOD${n}.SHLD`)) && has("CAN_SHLD", "UCSU.SHLD")
    && has("CAN_SHLD", "RSHB.pin1") && has("PE", "RSHB.pin2");
  shok ? ok("cabinet shield: chained + single-point PE bond via RSHB") : bad("cabinet shield: bond/drops wrong");
  // cabinet studs exist
  for (const j of ["JCABL1", "JCABL2", "JCABL3", "JCABPE", "JCABDP", "JCABDN"])
    if (![...cab.netOfPin.keys()].some((k) => k.startsWith(j + "."))) bad(`cabinet stud ${j} missing`);
} else console.log("\n(cabinet build absent — cabinet checks skipped)");

console.log(fails ? `\n${fails} INTERCONNECT FAILURE(S), ${warns} warning(s)` : `\nMODULE INTERCONNECT CLEAN (${warns} warning(s))`);
process.exit(fails ? 1 : 0);
}
if (process.argv[1]?.includes("module-interconnect-audit")) main();
