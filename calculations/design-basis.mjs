// design-basis.mjs — the input side of the design basis: line current and available power per module over the input window.
// Full power holds down to V_FULL; below it the module runs at constant input current, so available power falls with the line
// (86 % at 285 VAC). That is a deliberate trade: sizing the front end for full power at 285 VAC would cost about 16 % more SiC,
// copper and EMI filter for a corner the grid rarely visits.
// Run: node calculations/design-basis.mjs   → calculations/out/input-currents.csv
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out");
mkdirSync(OUT, { recursive: true });

const ETA = 0.965;      // sizing efficiency: conservative against the ≈ 97 % the loss budget computes, so line currents err high
const PF = 0.99;        // rated-operation power factor
const V_FULL = 330;     // full-power floor, VAC line-line
const SKUS = [{ name: "30kW", P: 30e3 }, { name: "40kW", P: 40e3 }, { name: "50kW", P: 50e3 }];   // the 50 kW air and liquid modules share one front end
const VLIST = [285, 300, 330, 400, 415, 450, 475];
const LOADS = [0.25, 0.5, 0.75, 1.0];
const f = (x, d = 1) => Number(x.toFixed(d));

const pAvail = (P, V) => (V >= V_FULL ? P : (P * V) / V_FULL);
const iLine = (Pout, V) => Pout / ETA / (Math.sqrt(3) * V * PF);

const rows = [["sku", "VLL_V", "load_frac", "Pout_W", "Pin_W", "Iline_Arms", "Ipk_A"]];
for (const s of SKUS) for (const V of VLIST) for (const load of LOADS) {
  const Pout = pAvail(s.P, V) * load, I = iLine(Pout, V);
  rows.push([s.name, V, load, f(Pout, 0), f(Pout / ETA, 0), f(I, 2), f(I * Math.SQRT2, 2)]);
}
writeFileSync(join(OUT, "input-currents.csv"), rows.map((r) => r.join(",")).join("\n") + "\n");

console.log("=== INPUT CURRENT AT 100 % OF THE AVAILABLE POWER (A rms per phase) ===");
console.log("VLL(V)  " + SKUS.map((s) => s.name.padStart(8)).join(""));
for (const V of VLIST)
  console.log(String(V).padEnd(8) + SKUS.map((s) => f(iLine(pAvail(s.P, V), V), 1).toString().padStart(8)).join("")
    + (V < V_FULL ? `   (available power ${f(100 * pAvail(1, V), 0)} %)` : ""));
console.log("→ calculations/out/input-currents.csv");
