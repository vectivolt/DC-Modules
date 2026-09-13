// llc-envelope.mjs — E65: the D3/D2 MAGNETICS ENVELOPE of the 3-phase LLC, power-solved in ngspice.
//
// Why it exists: every D3 flux and core-loss check before E65 was evaluated at resonance
// (140 kHz, 415 V half-cycle → ~108 mT). The E60 power-solved decks show the LLC running BELOW
// resonance at the top of each S/P range — 77–88 kHz at 500–525 V per bank, full power — where the
// magnetizing current peaks at 18–25 A and the transformer flux reaches 150–230 mT. Flux there is
// volt-second pinned by the reflected bank voltage over a longer half-period, and the ferrite loss
// rises 2–3× the resonant-point basis. This runner maps that region (bank voltage × load) so the
// thermal gate and the firmware SOA table read SIMULATED operating points, not the resonant point.
//
// Electrically SER and PAR are identical per bank at the same bank voltage and total power (each
// bank carries P/(2·Vbank) in both modes), so the envelope is bank voltage × power fraction.
// Same deck, same power solver, same physicality guard and tank fingerprint as llc-run.mjs.
// Run: node spice/llc/llc-envelope.mjs [sku ...]   (≈10–15 min per SKU; SKUs can run in parallel)
import { solve } from "./llc-run.mjs";
import { TANKS, fingerprint } from "../../calculations/llc/tanks.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESROOT = join(HERE, "..", "..", "simulation-results");
const f = (x, d = 2) => (Number.isFinite(x) ? Number(x.toFixed(d)) : "NaN");

export const ENVELOPE_BANKS = [425, 450, 475, 500, 525];
export const ENVELOPE_LOADS = [1.0, 0.85, 0.7, 0.55];
const HDR = ["bank_V", "bus_V", "P_frac", "P_target_W", "P_sim_W", "P_err_pct", "mode", "fsw_kHz", "Im_pk_A", "Ip_rms_A", "Ip_pk_A", "Isec_rms_A", "Vcr_ac_pk_V", "ZVS", "legs_in_rails"];

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const skus = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TANKS);
  for (const sku of skus) {
    const t = { ...TANKS[sku], sku };
    const RES = join(RESROOT, sku);
    mkdirSync(RES, { recursive: true });
    const rows = [HDR];
    console.log(`\n=== ${sku} magnetics envelope: ${fingerprint(sku)} fr=${f(t.fr / 1e3, 1)} kHz ===`);
    for (const bank of ENVELOPE_BANKS) {
      for (const frac of ENVELOPE_LOADS) {
        const P = t.P * frac;
        const s = solve(`ENV${bank}-${Math.round(frac * 100)}`, t, { VBANK: bank, P });
        const err = (100 * (s.P - P)) / P;
        rows.push([bank, f(s.VBUS, 0), frac, f(P, 0), f(s.P, 0), f(err, 1), s.mode, f(s.fsw / 1e3, 1), f(s.imPk, 1), f(s.ipRms, 1), f(s.ipPk, 1), f(s.isRms, 1), f(s.vcrAc, 0), s.zvs, s.legOk ? "YES" : "NO"]);
        console.log(`bank ${bank} V · ${Math.round(frac * 100)} % · ${s.mode} fsw ${f(s.fsw / 1e3, 1)} kHz · P ${f(s.P / 1e3, 2)}/${f(P / 1e3, 2)} kW · Im ${f(s.imPk, 1)} A · Ip ${f(s.ipRms, 1)} A rms · ZVS ${s.zvs} · legs ${s.legOk ? "ok" : "OUT OF RAILS"}`);
      }
    }
    writeFileSync(join(RES, "llc-envelope.csv"),
      `# E65 ngspice-46 power-solved LLC magnetics envelope; ${fingerprint(sku)}; bank × load at bus=min(830,max(650,2·bank/0.95))\n` +
      rows.map((r) => r.join(",")).join("\n") + "\n");
    console.log(`→ simulation-results/${sku}/llc-envelope.csv`);
  }
}
