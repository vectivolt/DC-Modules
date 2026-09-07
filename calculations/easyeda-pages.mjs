// easyeda-pages.mjs — convert the compiled tscircuit netlists (dist/boards/30kw/*/circuit.json)
// into per-page EasyEDA Copilot payloads: functional pages, blocks with reading flow, every pin
// carrying its net as signal_name, plus a part-resolution hint (MPN/search query from parts-db).
// The 30 kW pair is the complete electrical design; 60/120 kW replicate the same cells ×2/×4.
// Output: calculations/out/easyeda/{acdc,dcdc}-<page>.json + a part-resolution worklist.
// Run: node calculations/easyeda-pages.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DB } from "./cost/parts-db.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "calculations", "out", "easyeda");
mkdirSync(OUT, { recursive: true });

// ---- functional pages: page → ordered blocks → designator regexes (first match wins) ----
// SKU under generation. 30 kW has one Vienna lane and three LLC legs; 60/120 kW replicate the
// same cells x2/x4, so the lane- and leg-indexed blocks must be discovered from the netlist
// rather than hard-coded, or every lane above 0 silently vanishes from the drawing.
const SKU = process.argv[2] || "30kw";
// 30 kW keeps the historical path so nothing downstream breaks; new SKUs get their own dir
const OUT_SKU = SKU === "30kw" ? OUT : join(OUT, SKU);
mkdirSync(OUT_SKU, { recursive: true });


/** sorted unique capture-group values present in the design, e.g. Vienna lanes or LLC legs */
const idxOf = (names, re) => [...new Set(names.map((n) => n.match(re)?.[1]).filter((x) => x != null))]
  .sort((a, b) => Number(a) - Number(b));

/** Vienna: one block per (phase, lane) — 3 at 30 kW, 6 at 60 kW, 12 at 120 kW */
const viennaBlocks = (names) => idxOf(names, /^LA(\d)$/).flatMap((n) =>
  ["A", "B", "C"].map((ph) => [`PHASE-${ph}${n}`, [
    new RegExp(`^L${ph}${n}$`), new RegExp(`^Q${ph}${n}[AB]$`), new RegExp(`^D${ph}${n}[TBC]$`),
    new RegExp(`^C${ph}${n}(FP|FN|SN|C)$`), new RegExp(`^R${ph}${n}(SN|C)$`),
    new RegExp(`^U${ph}${n}G$`), new RegExp(`^PS${ph}${n}G$`),
    new RegExp(`^R${ph}${n}G(ON|OFF|GS|PD)$`), new RegExp(`^D${ph}${n}GS[12]$`),
    new RegExp(`^C${ph}${n}G(BL|B1|B2)$`)]]));

/** line CTs: one block per lane */
const lineCtBlocks = (names) => idxOf(names, /^CTA(\d)$/).map((n) =>
  [`LINE-CTS-${n}`, [new RegExp(`^CT[ABC]${n}$`), new RegExp(`^R[ABC]${n}[BF]$`),
    new RegExp(`^C[ABC]${n}F$`), new RegExp(`^D[ABC]${n}[PN]$`)]]);

/** DC-link capacitor banks: one block per lane (CDT0x/CDB0x + its balance resistors) */
const dcLinkBlocks = (names) => idxOf(names, /^CDT(\d)\d$/).map((n) =>
  [`LINK-BANK-${n}`, [new RegExp(`^CD[TB]${n}\\d$`), new RegExp(`^RBAL[TB]${n}[AB]$`)]]);

/** LLC half-bridge legs: 3 at 30 kW, 6 at 60 kW, 12 at 120 kW */
const legBlocks = (names) => idxOf(names, /^Q(\d+)H$/).map((n) =>
  [`LEG-${n}`, [new RegExp(`^(Q|U|PS|R|D|C)${n}[HL]`)]]);

/** LLC resonant tanks + rectifiers, one per leg */
const tankBlocks = (names) => idxOf(names, /^L(\d+)T$/).map((n) =>
  [`TANK-${n}`, [new RegExp(`^C${n}R\\d$`), new RegExp(`^L${n}T$`), new RegExp(`^T${n}$`),
    new RegExp(`^D${n}[AB][1-4]$`), new RegExp(`^CT${n}$`), new RegExp(`^R${n}C[TF]$`),
    new RegExp(`^C${n}CF$`), new RegExp(`^D${n}C[PN]$`)]]);

const PAGES = {
  acdc: [
    ["INPUT-EMI", [
      ["AC-ENTRY", [/^JACL\d$/, /^JPE$/, /^F[123]$/]],
      ["SURGE", [/^MOV[123]$/, /^MOVP[123]$/, /^GDT[123]$/]],
      ["EMI-FILTER", [/^CMC[12]$/, /^CX\d\d$/, /^CY[123]$/, /^LDM[123]$/]],
      ["PRECHARGE", [/^KPRE[12]$/, /^RPRE[12]$/, /^RKFBP$/]],
    ], ["AC-ENTRY", "SURGE", "EMI-FILTER", "PRECHARGE"]],
    ["VIENNA-PFC", [
      ["PHASE-A", [/^LA0$/, /^QA0[AB]$/, /^DA0[TBC]$/, /^CA0(FP|FN|SN|C)$/, /^RA0(SN|C)$/, /^UA0G$/, /^PSA0G$/, /^RA0G(ON|OFF|GS|PD)$/, /^DA0GS[12]$/, /^CA0G(BL|B1|B2)$/]],
      ["PHASE-B", [/^LB0$/, /^QB0[AB]$/, /^DB0[TBC]$/, /^CB0(FP|FN|SN|C)$/, /^RB0(SN|C)$/, /^UB0G$/, /^PSB0G$/, /^RB0G(ON|OFF|GS|PD)$/, /^DB0GS[12]$/, /^CB0G(BL|B1|B2)$/]],
      ["PHASE-C", [/^LC0$/, /^QC0[AB]$/, /^DC0[TBC]$/, /^CC0(FP|FN|SN|C)$/, /^RC0(SN|C)$/, /^UC0G$/, /^PSC0G$/, /^RC0G(ON|OFF|GS|PD)$/, /^DC0GS[12]$/, /^CC0G(BL|B1|B2)$/]],
    ], ["PHASE-A", "PHASE-B", "PHASE-C"]],
    ["DC-LINK", [
      ["LINK-BANK", [/^CD[TB]0\d$/, /^RBAL[TB]0[AB]$/]],
      ["DISCHARGE", [/^RDIS\d$/, /^QDISF?$/, /^UQD$/, /^PSQD$/, /^RQD(L|G|PD)$/]],
      ["BUS-STUDS", [/^JDC[PN]$/, /^JPEB$/]],
    ], ["LINK-BANK", "DISCHARGE", "BUS-STUDS"]],
    ["AC-SENSING", [
      ["STAR", [/^RNS\d[AB]$/]],
      ["SENSE-VAC1", [/^RV1D\d$/, /^RV1DL$/, /^CV1DF$/, /^UIVV1$/]],
      ["SENSE-VAC2", [/^RV2D\d$/, /^RV2DL$/, /^CV2DF$/, /^UIVV2$/]],
      ["SENSE-VAC3", [/^RV3D\d$/, /^RV3DL$/, /^CV3DF$/, /^UIVV3$/]],
      ["SENSE-VBUS", [/^RBPD\d$/, /^RBPDL$/, /^CBPDF$/, /^UIVBP$/]],
      ["SENSE-VMID", [/^RBMD\d$/, /^RBMDL$/, /^CBMDF$/, /^UIVBM$/]],
      ["ISO-BIAS", [/^PS5(AC|BUS)$/]],
      ["LINE-CTS", [/^CT[ABC]0$/, /^R[ABC]0[BF]$/, /^C[ABC]0F$/, /^D[ABC]0[PN]$/]],
      ["ANALOG-MID", [/^RAV[HLIF]$/, /^CAV[MOF]$/, /^UAVB$/]],
      ["NTC", [/^JT(PFC|INL)$/, /^RT(PFC|INL)P$/, /^CT(PFC|INL)F$/]],
    ], ["STAR", "SENSE-VAC1", "SENSE-VAC2", "SENSE-VAC3", "SENSE-VBUS", "SENSE-VMID", "ISO-BIAS", "LINE-CTS", "ANALOG-MID", "NTC"]],
    ["CONTROL", [
      // card-split (E35): the MCU/SWD/safety-chain/3V3 moved to the control card; the power board
      // keeps the 88-way interface, its default-OFF pull-downs, the strap, and the local drivers.
      ["CARD-IF", [/^JA$/, /^RPD\d$/, /^RROLE$/]],
      ["GROUNDING", [/^RPET$/, /^CPET$/]],
      ["COIL-DRIVER", [/^UPA$/]],
      ["RAIL-MON", [/^RM(24|15)[AB]$/]],
    ], ["CARD-IF", "GROUNDING", "COIL-DRIVER", "RAIL-MON"]],
    ["AUX-POWER", [
      ["FLYBACK", [/^UAUX$/, /^QAUX$/, /^RAUX(CS|G|RT|ST[12])$/, /^RCSF$/, /^CCSF$/, /^TAUX$/, /^RBR(1A|1B|2)$/, /^RFB[12]$/, /^RCOMP$/, /^CCOMP$/, /^DCLA$/, /^CCLA$/, /^RCLA[12]$/]],
      ["RAILS", [/^DAUX(24|15|VC)$/, /^CAUX(24|15)$/, /^CVCC$/, /^DTVS(24|15)$/]],
      ["BUCK-3V3", [/^UBKA$/, /^LBKA$/, /^CBK[IO]A$/, /^CBSTA$/, /^RBKF[12]A$/]],
      ["FANS", [/^JFAN\d$/, /^RFT\d$/]],
      ["INTERCONNECT", [/^JICA$/, /^RAL(TX|RX|TS|RS)$/]],
    ], ["FLYBACK", "RAILS", "BUCK-3V3", "FANS", "INTERCONNECT"]],
  ],
  dcdc: [
    ["LLC-LEGS", [
      ["BUS-IN", [/^JDC[PN]$/, /^JPEB$/, /^CF\d+$/]],
      ["LEG-1", [/^(Q|U|PS|R|D|C)1[HL]/]],
      ["LEG-2", [/^(Q|U|PS|R|D|C)2[HL]/]],
      ["LEG-3", [/^(Q|U|PS|R|D|C)3[HL]/]],
    ], ["BUS-IN", "LEG-1", "LEG-2", "LEG-3"]],
    ["LLC-TANKS", [
      ["TANK-1", [/^C1R\d$/, /^L1T$/, /^T1$/, /^D1[AB][1-4]$/, /^CT1$/, /^R1C[TF]$/, /^C1CF$/, /^D1C[PN]$/]],
      ["TANK-2", [/^C2R\d$/, /^L2T$/, /^T2$/, /^D2[AB][1-4]$/, /^CT2$/, /^R2C[TF]$/, /^C2CF$/, /^D2C[PN]$/]],
      ["TANK-3", [/^C3R\d$/, /^L3T$/, /^T3$/, /^D3[AB][1-4]$/, /^CT3$/, /^R3C[TF]$/, /^C3CF$/, /^D3C[PN]$/]],
    ], ["TANK-1", "TANK-2", "TANK-3"]],
    ["BANKS-SP", [
      ["BANK-A", [/^CBA\d[TB]$/, /^RBALT?A[12]$/, /^RBALBA[12]$/, /^CBAF$/]],
      ["BANK-B", [/^CBB\d[TB]$/, /^RBALT?B[12]$/, /^RBALBB[12]$/, /^CBBF$/]],
      ["SP-MATRIX", [/^K(SER|PARA|PARB|OUT|PREA|PREB)2?$/, /^RKPU/, /^RPRE[AB]$/]],
      ["BLEEDERS", [/^RBD[AB]\d$/, /^QDIS[AB]$/, /^UPV[AB]$/, /^RPV[LB][AB]$/]],
    ], ["BANK-A", "BANK-B", "SP-MATRIX", "BLEEDERS"]],
    ["OUTPUT-SENSING", [
      ["OUTPUT", [/^RSHO$/, /^USHO$/, /^PSSH$/, /^COF[12]$/, /^CYO[12]$/, /^JOUT[PN]$/]],
      ["SENSE-VBKA", [/^ROAD\d$/, /^ROADL$/, /^COADF$/, /^UIVOA$/]],
      ["SENSE-VBKB", [/^ROBD\d$/, /^ROBDL$/, /^COBDF$/, /^UIVOB$/]],
      ["SENSE-VOUT", [/^ROVD\d$/, /^ROVDL$/, /^COVDF$/, /^UIVOV$/]],
      ["ISO-BIAS", [/^PS5BK[AB]$/]],
      ["ANALOG-MID", [/^RAV[HLIF]$/, /^CAV[MOF]$/, /^UAVB$/]],
      ["NTC", [/^JT(LLC|XFR)$/, /^RT(LLC|XFR)P$/, /^CT(LLC|XFR)F$/]],
    ], ["OUTPUT", "SENSE-VBKA", "SENSE-VBKB", "SENSE-VOUT", "ISO-BIAS", "ANALOG-MID", "NTC"]],
    ["CONTROL", [
      // card-split (E35): see the AC-DC CONTROL note — board keeps interface + pull-downs + strap.
      ["CARD-IF", [/^JB$/, /^RPDB\d$/, /^RROLEB$/]],
      ["COIL-DRIVER", [/^ULB$/]],
      ["INTERCONNECT", [/^JICB$/, /^RBL(TX|RX|TS|RS)$/]],
    ], ["CARD-IF", "COIL-DRIVER", "INTERCONNECT"]],
    ["COMMS-HMI", [
      ["CAN", [/^UCAN$/, /^PSCAN$/, /^LCAN$/, /^JCAN$/, /^RTERM$/, /^JTERM$/, /^TVSCAN$/, /^RCGB$/, /^CCGB$/]],
      ["HMI", [/^DISP1$/, /^USR1$/, /^RSEG\d$/, /^QDIG[12]$/, /^RDIG[12]$/, /^SW[12]$/, /^RSW[12]$/, /^CSW[12]$/]],
    ], ["CAN", "HMI"]],
  ],
};

// nets drawn as wires (path carries meaning) — everything else crossing blocks becomes a name
const WIRE_NETS = [/^PH[ABC]0$/, /^G_/, /^KS_/, /^GH_/, /^GL_/, /^KH_/, /^KL_/, /^CTB\d$/, /^NSTAR$/, /^AVREF_MID$/, /^SW\d$/, /^STAR\d$/, /^BKAM$/, /^BKBM$/, /^G_QDIS/];
const RAILS = ["V3P3", "V15", "V24", "DGND", "AGND", "PE", "DCP", "DCN", "MID", "AVMID", "BKAP", "BKAN", "BKBP", "BKBN", "OUTP", "OUTN", "CGND", "B5OUT"];

const f2 = (x) => JSON.stringify(x);
for (const side of ["acdc", "dcdc"]) {
  const j = JSON.parse(readFileSync(join(ROOT, "dist", "boards", SKU, side, "circuit.json"), "utf8"));
  const comps = j.filter(e => e.type === "source_component");
  const ports = j.filter(e => e.type === "source_port");
  const nets = new Map(j.filter(e => e.type === "source_net").map(n => [n.source_net_id, n.name]));
  const traces = j.filter(e => e.type === "source_trace");
  // port → net: union-find over trace port groups + explicit net ids
  const portNet = new Map();
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
  for (const p of ports) parent.set(p.source_port_id, p.source_port_id);
  const groupNet = new Map();
  for (const t of traces) {
    const ps = t.connected_source_port_ids ?? [];
    for (let i = 1; i < ps.length; i++) uni(ps[0], ps[i]);
    for (const nid of t.connected_source_net_ids ?? []) if (ps.length) groupNet.set(find(ps[0]), nets.get(nid));
  }
  for (const [g, n] of [...groupNet]) groupNet.set(find(g), n);
  // synthesize stable names for anonymous local junctions (≥2 ports, no explicit net)
  const groupSize = new Map();
  for (const p of ports) { const r = find(p.source_port_id); groupSize.set(r, (groupSize.get(r) ?? 0) + 1); }
  // These used to be numbered N_ACDC_1..n. A global ordinal tells the reader nothing, and they are
  // 62% of every net on the board (1144 of 1848), so most of the drawing's labels said nothing at
  // all. Name each junction after what it actually joins: an IC pin if it touches one (UAUX_VCC),
  // otherwise the shared stem of the parts in series (RBALTA1+RBALTA2 -> RBALTA_M).
  // Names must be board-wide and unique: EasyEDA merges net labels BY NAME, so a collision would
  // silently short two nets. Seeded with every explicit net name and uniquified on write.
  const compName = new Map(comps.map((c) => [c.source_component_id, c.name]));
  const pinCount = new Map();
  for (const p of ports) pinCount.set(p.source_component_id, (pinCount.get(p.source_component_id) ?? 0) + 1);
  const groupPorts = new Map();
  for (const p of ports) {
    const r = find(p.source_port_id);
    if (!groupPorts.has(r)) groupPorts.set(r, []);
    groupPorts.get(r).push(p);
  }
  const used = new Set([...nets.values()].filter(Boolean));
  const clean = (t) => String(t).replace(/[^A-Za-z0-9_]/g, "").slice(0, 22);
  const uniq = (base) => {
    const b = base || "NET";
    let n = b, i = 1;
    while (used.has(n)) n = `${b}_${++i}`;
    used.add(n);
    return n;
  };
  const anonNets = new Set();
  for (const [r, ps] of groupPorts) {
    if (groupNet.has(r) || ps.length < 2) continue;
    const ds = [...new Set(ps.map((p) => compName.get(p.source_component_id)).filter(Boolean))].sort();
    if (!ds.length) continue;
    const icPort = ps.find((p) => (pinCount.get(p.source_component_id) ?? 0) >= 3 && p.name);
    let base;
    if (icPort) base = `${compName.get(icPort.source_component_id)}_${clean(icPort.name)}`;
    else {
      const pref = ds.reduce((a, b) => {
        let i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) i++;
        return a.slice(0, i);
      });
      base = pref.length >= 3 ? `${pref}_M` : ds.slice(0, 2).join("_");
      // A SERIES CHAIN shares one stem across every tap: RV1D0..RV1D7 gave seven junctions all
      // called RV1D_M, uniquified to RV1D_M_2..RV1D_M_7 -- a counter that hides the one fact worth
      // knowing. When the plain stem is taken, name the tap after the two parts it sits between,
      // so RV1D_01 is unmistakably the node joining RV1D0 to RV1D1.
      if (pref.length >= 3 && used.has(clean(base)) && ds.length === 2) {
        const tails = ds.map((d) => d.slice(pref.length)).filter(Boolean);
        if (tails.length === 2) base = `${pref}_${tails.join("")}`;
      }
    }
    const nm = uniq(clean(base));
    groupNet.set(r, nm);
    anonNets.add(nm);
  }
  for (const p of ports) {
    const n = groupNet.get(find(p.source_port_id));
    if (n) portNet.set(p.source_port_id, n);
  }
  // per-component pin lists
  const byComp = new Map();
  for (const p of ports) {
    const arr = byComp.get(p.source_component_id) ?? [];
    arr.push(p); byComp.set(p.source_component_id, arr);
  }
  const eng = (x, unit) => {
    if (!(x > 0)) return "";
    const p = [[1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "u"], [1e-9, "n"], [1e-12, "p"]];
    for (const [m, s] of p) if (x >= m * 0.9999) return `${Number((x / m).toPrecision(3))}${s}${unit}`;
    return `${x}${unit}`;
  };
  const partInfo = (name, c) => {
    const rule = DB.find(r => r.m.test(name));
    const v = c.ftype === "simple_resistor" ? (Number(c.resistance) === 0 ? "0R" : eng(Number(c.resistance), "")) : c.ftype === "simple_capacitor" ? eng(Number(c.capacitance), "F") : (rule?.mpn ?? name);
    return { value: String(v).replace(/[^\x20-\x7E]/g, "") || (rule?.mpn ?? name), query: rule ? `${rule.mpn} ${rule.desc.split("(")[0]}`.slice(0, 80) : name, mpn: rule?.mpn ?? null };
  };
  const seen = new Set();
  const pagesOut = [];
  // 30 kW has one Vienna lane and three LLC legs; 60/120 kW replicate them x2/x4. Expand the
  // indexed blocks from the netlist so no lane above 0 is silently dropped on the bigger SKUs.
  const names = comps.map((c) => c.name);
  const pagesForSide = PAGES[side].map(([page, blocks, flow]) => {
    let bl = blocks, fl = flow;
    const swap = (title, gen) => {
      const made = gen(names);
      if (!made.length) return;
      const at = bl.findIndex(([b]) => b === title || b.startsWith(title));
      const keep = bl.filter(([b]) => !(b === title || b.startsWith(title)));
      bl = at < 0 ? [...keep, ...made] : [...keep.slice(0, at), ...made, ...keep.slice(at)];
      fl = [...fl.filter((b) => !(b === title || b.startsWith(title))), ...made.map(([b]) => b)];
    };
    if (page === "VIENNA-PFC") { bl = []; fl = []; swap("PHASE", viennaBlocks); }
    if (page === "AC-SENSING") swap("LINE-CTS", lineCtBlocks);
    if (page === "DC-LINK") swap("LINK-BANK", dcLinkBlocks);
    if (page === "LLC-LEGS") swap("LEG-", legBlocks);
    if (page === "LLC-TANKS") { bl = []; fl = []; swap("TANK-", tankBlocks); }
    return [page, bl, fl];
  });
  for (const [page, blocks, flow] of pagesForSide) {
    const members = [];
    for (const c of comps) {
      if (seen.has(c.name) || /^NC_/.test(c.name)) continue;
      for (const [bname, regexes] of blocks) {
        if (regexes.some(r => r.test(c.name))) {
          const allPins = (byComp.get(c.source_component_id) ?? []).map(p => ({
            pin_number: p.pin_number ?? p.name, name: p.name ?? String(p.pin_number),
            signal_name: (portNet.get(p.source_port_id) ?? "").replace(/^NC_.*/, ""),
          }));
          const pins = allPins.filter(p => p.signal_name);
          const nc = allPins.filter(p => !p.signal_name).map(p => p.pin_number);
          members.push({ designator: c.name, block_name: bname, pins, nc_pins: nc, ...partInfo(c.name, c) });
          seen.add(c.name);
          break;
        }
      }
    }
    // suggested planner overrides: anonymous junctions and known-local nets are wires; PE is ground-class
    const pageNets = new Set(members.flatMap(m => m.pins.map(p => p.signal_name)).filter(Boolean));
    const styleOv = {};
    for (const n of pageNets) if (anonNets.has(n) || WIRE_NETS.some(r => r.test(n))) styleOv[n] = "wire";
    const classOv = pageNets.has("PE") ? { PE: "ground" } : {};
    const perBlock = {};
    for (const m of members) perBlock[m.block_name] = (perBlock[m.block_name] ?? 0) + 1;
    pagesOut.push({ page, flow, count: members.length, perBlock, components: members });
    writeFileSync(join(OUT_SKU, `${side}-${page}.json`), JSON.stringify({ page, flow, net_style_overrides: styleOv, net_class_overrides: classOv, components: members }, null, 1));
  }
  const missed = comps.filter(c => !seen.has(c.name) && !/^NC_/.test(c.name)).map(c => c.name);
  for (const p of pagesOut) console.log(`${side}/${p.page} (${p.count}): ${Object.entries(p.perBlock).map(([b, n]) => `${b}=${n}`).join(" ")}`);
  console.log(`${side} UNASSIGNED: ${missed.length ? missed.join(",") : "none"}`);
}
console.log(`→ ${OUT}/`);
