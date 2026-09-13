#!/usr/bin/env node
// standby-budget.mjs — E64 standing gate: the module's AC-present standby input power, computed
// from the DRAWN resistor network (parsed off the release sheets, not from memory) plus the aux
// chain, against the <=10 W competitor-parity target adopted at E63 (InfyPower REG family [D]).
//
// What it asserts (hard):
//   - the sheet really carries the expected passive HV network per SKU: 3-phase sense star of
//     2-series 47k per phase, and the link balance strings (1 set at 30 kW, 2 paralleled at
//     40/50 — the R8-A arithmetic), all as PS122WF4702T4E positions;
//   - the exact passive terms recompute to the registered values (drift guard: an edit to the
//     balance network that silently changes standby or the F.21b passive-bleed times fails here).
// What it reports (informational until EVT): aux-chain idle is an ESTIMATE band until T-00
// measures it — the target verdict is therefore a band, not a pass/fail, by design.
// Run: node calculations/system/standby-budget.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const R47K = 47e3, VBUS = 800, VLL = 400;
const VPH = VLL / Math.sqrt(3);

const count47k = (sku, side) => {
  const txt = readFileSync(join(ROOT, `kicad5/dc-modules-${sku}/${sku}-${side}.sch`), "utf8");
  const out = {};
  for (const blk of txt.split("$Comp").slice(1)) {
    if (!/F \d+ "PS122WF4702T4E"[^\n]*"MPN"/.test(blk)) continue;
    const ref = blk.match(/F 0 "([^"]*)"/)[1];
    const fam = ref.replace(/\d+[A-Z]?$/, "");
    out[fam] = (out[fam] ?? 0) + 1;
  }
  return out;
};

// Registered exact terms (E64) — recomputed every run; drift fails the battery.
const REG = { "30kw": { star: 1.70, bal: 3.40 }, "40kw": { star: 1.70, bal: 6.81 }, "50kw": { star: 1.70, bal: 6.81 }, "50kwa": { star: 1.70, bal: 6.81 } };
// Estimate band [W at the AC input] until EVT T-00 measures them (R2-era arithmetic, E63):
const EST = { divider: [0.4, 1.2],   // iso-sense HV dividers (475k-class chains, bus + banks-at-0 + output-at-0)
              aux:     [3.0, 6.0],   // NCP1252D flyback no-load + bias (no skip mode on the D-suffix)
              logic:   [2.0, 3.0] }; // card + CAN + iso-amps through the aux at light-load efficiency

let fails = 0;
const ck = (name, ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${name} — ${msg}`); if (!ok) fails++; };
const f = (x, d = 2) => Number(x.toFixed(d));

console.log("=== STANDBY BUDGET (E64) — AC present, output off, fans off ===");
for (const sku of ["30kw", "40kw", "50kw", "50kwa"]) {
  const ac = count47k(sku, "acdc");
  const nStar = ac.RNS ?? 0;
  ck(`${sku} AC sense star drawn`, nStar === 6, `RNS 47k positions = ${nStar} (expect 6: 3 phases × 2-series)`);
  const linkFams = Object.keys(ac).filter((k) => /^RBAL/.test(k));
  const nLink = linkFams.reduce((a, k) => a + ac[k], 0);
  const expLink = sku === "30kw" ? 4 : 8;      // R8-A: one balance set at 30 kW, two paralleled at 40/50
  ck(`${sku} link balance strings drawn`, nLink === expLink, `RBAL* 47k positions = ${nLink} (expect ${expLink})`);
  const rFull = (4 * R47K) / (nLink / 4);      // each set = 2×(2-series 47k) = 188k across the link; sets parallel
  const pBal = VBUS ** 2 / rFull;
  const pStar = 3 * (VPH ** 2 / (2 * R47K));
  const r = REG[sku];
  ck(`${sku} exact passive terms vs registered`, Math.abs(pBal - r.bal) < 0.05 && Math.abs(pStar - r.star) < 0.05,
    `star ${f(pStar)} W (reg ${r.bal ? r.star : "?"}) · link balancers ${f(pBal)} W (reg ${r.bal}) — F.21b passive bleed rides these same resistors`);
  const lo = pBal + pStar + EST.divider[0] + EST.aux[0] + EST.logic[0];
  const hi = pBal + pStar + EST.divider[1] + EST.aux[1] + EST.logic[1];
  const verdict = hi <= 10 ? "inside the target" : lo > 10 ? "OVER the target — lever needed" : "straddles the target — EVT T-00 measurement decides";
  console.log(`        ${sku} standby estimate ${f(lo, 1)}–${f(hi, 1)} W vs ≤10 W target → ${verdict}`);
}
// E55 products: N modules (E66: the 150 kW has no cabinet base any more — the CSU card and its DIN supply are deleted).
for (const [name, n, lo1, hi1] of [["100kw air (2×50a)", 2, 13.9, 18.7], ["150kw air (3×50a)", 3, 13.9, 18.7]]) {
  const cab = [0, 0];
  console.log(`        ${name} standby estimate ${f(n * lo1 + cab[0], 1)}–${f(n * hi1 + cab[1], 1)} W (${n} × module${cab[0] ? " + cabinet base" : ""}) — the same module levers scale it`);
}
console.log(`  levers if EVT reads high (registered E63/E64, in order): aux burst/skip at no-load (biggest term),
  then rescale the 40/50 kW link balance pairs 47k→82k (−2.9 W; passive bleed 3.7/5.0 → 6.4/8.6 min, still
  inside the 10-minute label; the 30 kW stays at 47k — its passive bleed is already 6.2 min).`);
console.log(fails ? `\n${fails} STANDBY BUDGET FAILURE(S)` : "\nSTANDBY BUDGET CONSISTENT — drawn network matches the registered arithmetic; target verdict awaits the EVT measurement");
process.exit(fails ? 1 : 0);
