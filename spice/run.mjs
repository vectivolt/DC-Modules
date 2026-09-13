// run.mjs — ngspice batch runner + wrdata parser. Every generated netlist is persisted to
// spice/generated/<name>.cir for traceability (§49-11, §50). Solver: ngspice-46, method=gear.
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SPICE_DIR = dirname(fileURLToPath(import.meta.url));
const GEN = join(SPICE_DIR, "generated");
mkdirSync(GEN, { recursive: true });

// Runs a deck whose .control block ends with `wrdata <name>.out <vars...>` and `quit`.
// Returns { t, cols: { varLabel: Float64Array }, log, deckPath }.
export function runDeck(name, deckText, varLabels, { timeoutMs = 300000 } = {}) {
  const deckPath = join(GEN, `${name}.cir`);
  const outPath = join(GEN, `${name}.out`);
  writeFileSync(deckPath, deckText);
  const proc = spawnSync("ngspice", ["-b", deckPath], { cwd: GEN, timeout: timeoutMs, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const log = (proc.stdout || "") + (proc.stderr || "");
  return parse(name, outPath, log, varLabels, deckPath);
}
// E65: parallel variant (the aux matrix runs 17 drawn-circuit decks); also returns every `.meas` result by lower-case name
export function runDeckAsync(name, deckText, varLabels, { timeoutMs = 900000 } = {}) {
  const deckPath = join(GEN, `${name}.cir`);
  const outPath = join(GEN, `${name}.out`);
  writeFileSync(deckPath, deckText);
  return new Promise((resolve, reject) => {
    const proc = spawn("ngspice", ["-b", deckPath], { cwd: GEN, timeout: timeoutMs });
    let log = "";
    proc.stdout.on("data", (d) => (log += d)); proc.stderr.on("data", (d) => (log += d));
    proc.on("close", () => { try { resolve(parse(name, outPath, log, varLabels, deckPath)); } catch (e) { reject(e); } });
  });
}
function parse(name, outPath, log, varLabels, deckPath) {
  if (!existsSync(outPath)) throw new Error(`ngspice failed for ${name}:\n${log.slice(-3000)}`);
  if (/Timestep too small|simulation\(s\) aborted|fatal/i.test(log)) throw new Error(`ngspice ABORTED for ${name}:\n${log.split("\n").filter(l => /error|abort|too small/i.test(l)).join("\n")}`);
  const meas = Object.fromEntries([...log.matchAll(/^(\w+)\s+=\s+([-+\d.eE]+)/gm)].map((m) => [m[1].toLowerCase(), +m[2]]));
  const raw = readFileSync(outPath, "utf8").trim().split("\n");
  const nv = varLabels.length;
  const t = [], cols = Object.fromEntries(varLabels.map(v => [v, []]));
  for (const line of raw) {
    const p = line.trim().split(/\s+/).map(Number);
    if (p.length < 2 * nv || p.some(Number.isNaN)) continue;
    t.push(p[0]);
    for (let i = 0; i < nv; i++) cols[varLabels[i]].push(p[2 * i + 1]);
  }
  return { t, cols, log, deckPath, meas };
}

export const trapz = (t, y, t0 = -Infinity, t1 = Infinity) => {
  let s = 0;
  for (let i = 1; i < t.length; i++)
    if (t[i - 1] >= t0 && t[i] <= t1) s += 0.5 * (y[i] + y[i - 1]) * (t[i] - t[i - 1]);
  return s;
};
export const maxIn = (t, y, t0, t1, abs = false) => {
  let m = -Infinity;
  for (let i = 0; i < t.length; i++)
    if (t[i] >= t0 && t[i] <= t1) m = Math.max(m, abs ? Math.abs(y[i]) : y[i]);
  return m;
};
export const minIn = (t, y, t0, t1) => {
  let m = Infinity;
  for (let i = 0; i < t.length; i++)
    if (t[i] >= t0 && t[i] <= t1) m = Math.min(m, y[i]);
  return m;
};
// max |dy/dt| over window, smoothed across ~win seconds
export const maxSlew = (t, y, t0, t1, win = 2e-9) => {
  let m = 0, j = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] < t0 || t[i] > t1) continue;
    while (t[i] - t[j] > win) j++;
    if (i > j) m = Math.max(m, Math.abs((y[i] - y[j]) / (t[i] - t[j])));
  }
  return m;
};
