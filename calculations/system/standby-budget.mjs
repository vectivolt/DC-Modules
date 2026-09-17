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
const R47K = 47e3, R33K = 33e3, VBUS = 800, VLL = 400;
const VPH = VLL / Math.sqrt(3);

// E82 (M-10 / M-12): the link balance strings go BACK to 47 k (PS122WF4702T4E) and there is now ONE string per half per
// MODULE, not one per bank — so 4 elements on every SKU, not 4/8. The AC-sense star drops 47 k → 33 kΩ (R2512-33k-HV-AS)
// because it IS the X-capacitor bleed path and E68's third X stage pushed it past the 5 s line. Both families are counted
// from the RELEASE sheets by MPN, so a drawing that disagrees with this arithmetic fails here.
const count47k = (sku, side) => {
  const txt = readFileSync(join(ROOT, `kicad5/dc-modules-${sku}/${sku}-${side}.sch`), "utf8");
  const out = {};
  for (const blk of txt.split("$Comp").slice(1)) {
    if (!/F \d+ "(PS122WF4702T4E|R2512-33k-HV-AS)"[^\n]*"MPN"/.test(blk)) continue;
    const ref = blk.match(/F 0 "([^"]*)"/)[1];
    const fam = ref.replace(/\d+[A-Z]?$/, "");
    out[fam] = (out[fam] ?? 0) + 1;
  }
  return out;
};

// Registered exact terms — recomputed every run; drift fails the battery.
// E82 RE-REGISTERED (M-10 + M-12). Balance: one 2-series 47 k string per half per module on EVERY SKU = 188 kΩ full-link
// → 3.40 W at 800 V (0.85 W per element; 0.92 W at 830 V). E81's 22 k × two banks read 14.55 W on 40/50 kW — that is
// −11.2 W of standby on those SKUs and −3.9 W on the 30 kW, for a midpoint offset that F.06 / F.38 already watch.
// Star: 33 k → 2.42 W (was 1.70 W at 47 k), +0.72 W bought to get the X terminals inside the 5 s rule.
// Net per module vs E81: 30 kW −3.15 W · 40/50 kW −10.43 W.
const REG = { "30kw": { star: 2.42, bal: 3.40 }, "40kw": { star: 2.42, bal: 3.40 }, "50kw": { star: 2.42, bal: 3.40 }, "50kwa": { star: 2.42, bal: 3.40 } };
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
  ck(`${sku} AC sense star drawn`, nStar === 6, `RNS 33k positions = ${nStar} (expect 6: 3 phases × 2-series — E82 M-12)`);
  const linkFams = Object.keys(ac).filter((k) => /^RBAL/.test(k));
  const nLink = linkFams.reduce((a, k) => a + ac[k], 0);
  const expLink = 4;                           // E82 M-10: ONE balance network per module — cells.tsx `bal`, boards pass bal={k === 0}
  ck(`${sku} link balance strings drawn`, nLink === expLink, `RBAL* 47k positions = ${nLink} (expect ${expLink}: one 2-series string per half, first bank only — E82 M-10 reverts E81's per-bank pair)`);
  const rFull = (4 * R47K) / (nLink / 4);      // one set = 2 × (2-series 47k) = 188k across the link; extra sets would parallel
  const pBal = VBUS ** 2 / rFull;
  const pStar = 3 * (VPH ** 2 / (2 * R33K));
  const r = REG[sku];
  ck(`${sku} exact passive terms vs registered`, Math.abs(pBal - r.bal) < 0.05 && Math.abs(pStar - r.star) < 0.05,
    `star ${f(pStar)} W (reg ${r.bal ? r.star : "?"}) · link balancers ${f(pBal)} W (reg ${r.bal}) — F.21b passive bleed rides these same resistors`);
  const lo = pBal + pStar + EST.divider[0] + EST.aux[0] + EST.logic[0];
  const hi = pBal + pStar + EST.divider[1] + EST.aux[1] + EST.logic[1];
  const verdict = hi <= 10 ? "inside the target" : lo > 10 ? "OVER the target — lever needed" : "straddles the target — EVT T-00 measurement decides";
  console.log(`        ${sku} standby estimate ${f(lo, 1)}–${f(hi, 1)} W vs ≤10 W target → ${verdict}`);
}
console.log(`  levers if EVT reads high (registered E63/E64/E82, in order): aux burst/skip at no-load (biggest term),
  then the iso-sense divider chains. The link balance network is NO LONGER a lever — E82 (M-10) already took it from
  15.7 W (40/50 kW) to 3.7 W by fitting ONE string per module at 47 k, and the passive discharge rides these same
  resistors: 188 kΩ full-link now gives 321→60 V in 6.2 / 7.4 / 9.9 min (30 / 40 / 50 kW), and the 50 kW is the one
  that now sits closest to the 11 min label ceiling. Raising them again buys watts and spends discharge time.`);
console.log(fails ? `\n${fails} STANDBY BUDGET FAILURE(S)` : "\nSTANDBY BUDGET CONSISTENT — drawn network matches the registered arithmetic; target verdict awaits the EVT measurement");
process.exit(fails ? 1 : 0);
