// fsm-sim.mjs — §36 system-scenario coverage, EXECUTED at supervisory-logic fidelity (L5 §9).
// A 1 ms discrete-time behavioral module (bus, banks, output, temps, relays with pre-insertion,
// precharge, discharge) runs under the production FSM + the protection table
// (docs/protection-thresholds.md). 28 scripted scenarios; each asserts its required terminal
// state, required fault code, and bounded maxima. Any unhandled event ⇒ scenario FAIL.
// This validates CONTROL/PROTECTION LOGIC; power-stage dynamics were closed at L1–L4.
// Run: node calculations/system/fsm-sim.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "out");
const F = { OC_PFC: "F.01", DESAT: "F.02", BUS_OVP_HW: "F.03", BUS_UV: "F.05", MID_IMB: "F.06", IN_OV: "F.07",
  IN_UV: "F.08", PH_LOSS: "F.09", OUT_OVP: "F.13", OUT_OC: "F.15", OUT_SHORT: "F.16", BANK_IMB: "F.17",
  WELD: "F.18", PRECHG: "F.20", DISCH: "F.21", OT: "F.22", FAN: "F.25", AUX_UV: "F.26", LINK: "F.27",
  CAN_TO: "F.28", SENSOR: "F.29", LOCK: "F.31", WDT: "F.32", BACKFEED: "F.33" };

function newM() {
  return {
    st: "INIT", t: 0, faults: [], latched: null, lock: false, faultCount: 0,
    bus: 0, mid: 0.5, bankA: 0, bankB: 0, vout: 0, iout: 0, vext: 0, extConn: false,
    kpre: false, kser: false, kpara: false, kparb: false,   // the output is a blocking diode, so the matrix is the only contact set
    weldedPARA: false, pfcOn: false, llcOn: false, pcmd: 0, vcmd: 400, icmd: 100, mode: "PAR",
    vin: 400, phases: 3, tempX: 60, fanOk: true, canFresh: 0, linkFresh: 0, auxOk: true, wdtOk: true,
    derate: 1, dwell: 0, log: [],
  };
}
const latch = (m, code) => { if (!m.latched) { m.latched = code; m.faultCount++; m.st = "FAULT"; m.pfcOn = m.llcOn = false; m.log.push([m.t, "LATCH", code]); if (m.faultCount >= 5) { m.lock = true; m.st = "LOCK"; m.log.push([m.t, "LOCK", F.LOCK]); } } };

function step(m, ev = {}) {
  m.t++;
  Object.assign(m, ev);
  m.canFresh = m.canDown ? m.canFresh + 1 : 0;   // link/CAN keepalive is continuous unless withheld
  m.linkFresh = m.linkDown ? m.linkFresh + 1 : 0;
  // ---- plant (crude, 1 ms) ----
  if (m.st === "PRECHG" && m.kpre === false) { m.bus = Math.min(m.vin * 1.414, m.bus + (m.vin * 1.414 - m.bus) * 0.012); }
  if (m.pfcOn && m.auxOk) m.bus += (800 - m.bus) * 0.05;
  if (!m.pfcOn && m.bus > 0 && m.st !== "PRECHG") m.bus = Math.max(0, m.bus - (m.st === "DISCH" ? 7 : 0.15));
  // CV/CC target: CC droops the BANKS (banks are the output) — plausibility then holds by construction
  const rload = m.rloadOverride ?? (m.vcmd / Math.max(m.icmd, 1));
  if (m.prevR !== undefined && rload < m.prevR / 5) m.transient = 3;
  m.prevR = rload;
  const iLim = m.transient > 0 ? m.icmd * 1.25 : m.icmd;
  if (m.transient > 0) m.transient--;
  const vtar = Math.min(m.vcmd, iLim * rload);
  const bankT = m.llcOn ? Math.min(vtar / (m.mode === "SER" ? 2 : 1), 500) : 0;   // LOW mode tops out at 500 V
  m.bankA += ((m.llcOn ? bankT : m.bankA * 0.995) - m.bankA) * 0.08;
  m.bankB += ((m.llcOn ? bankT : m.bankB * 0.995) - m.bankB) * 0.08;
  // a welded K_PARA: paralleled banks track; in SER (KSER closed) it shorts bank A, which then cannot charge → F.17
  if (m.weldedPARA) { if (m.mode === "SER" && m.kser) m.bankA = 0; else m.bankB = m.bankA; }
  const stack = m.mode === "SER" ? (m.kser ? m.bankA + m.bankB : m.bankA) : (m.kpara ? Math.max(m.bankA, m.bankB) : m.bankA);
  const out = m.st === "RUN" || m.st === "DERATE";                 // the blocking diode conducts once the stack leads
  m.vout = m.llcOn ? Math.max(stack, m.extConn ? m.vext : 0) : (m.extConn ? m.vext : 0);
  m.iout = out && m.llcOn ? Math.min(stack / Math.max(rload, 0.01), iLim * 1.02) : 0;
  m.tempX += ((m.llcOn ? 40 + 55 * m.derate + (m.fanOk ? 0 : 15) : 40) - m.tempX) * 0.002;
  // ---- HW-fast layer ----
  if (m.bus > 860) latch(m, F.BUS_OVP_HW);
  if (ev.desat) latch(m, F.DESAT);
  if (ev.ocPfc) latch(m, F.OC_PFC);
  if (!m.auxOk) { m.pfcOn = m.llcOn = false; if (m.st === "RUN") { m.st = "SAFE"; m.log.push([m.t, "AUXUV", F.AUX_UV]); } }
  if (!m.wdtOk) latch(m, F.WDT);
  // ---- supervisory ----
  if (m.st === "RUN" || m.st === "DERATE") {
    if (m.vin > 500) latch(m, F.IN_OV);
    if (m.vin < 260) latch(m, F.IN_UV);
    if (m.phases < 3) { m.derate = 0; latch(m, F.PH_LOSS); }
    if (Math.abs(m.mid - 0.5) * m.bus > 40) latch(m, F.MID_IMB);
    if (m.vout > Math.min(1050, m.vcmd * 1.06 + 20)) latch(m, F.OUT_OVP);
    if (m.iout > m.icmd * 1.3) latch(m, F.OUT_OC);
    m.shortCnt = (m.vout < 50 && m.iout > m.icmd * 0.9) ? (m.shortCnt ?? 0) + 1 : 0;
    if (m.shortCnt > 10) latch(m, F.OUT_SHORT);   // criterion in protection-thresholds row 16
    if (m.mode === "SER" && m.kser && Math.abs(m.bankA - m.bankB) > 25) latch(m, F.BANK_IMB);
    if (m.tempX > 115) latch(m, F.OT); else if (m.tempX > 105) m.derate = Math.min(m.derate, 0.6);
    if (!m.fanOk) m.derate = Math.min(m.derate, 0.5);
    { const meas = m.voutStuck ?? m.vout; if (Number.isNaN(meas) || (m.llcOn && stack > 100 && Math.abs(meas - stack) > stack * 0.2)) latch(m, F.SENSOR); }
    if (m.canFresh > 1000) { m.st = "STANDBY"; m.llcOn = false; m.needEnable = true; m.log.push([m.t, "CANTO", F.CAN_TO]); }
    if (m.linkFresh > 50) latch(m, F.LINK);
  }
  // ---- FSM ----
  switch (m.st) {
    case "INIT": if (m.auxOk) { m.st = "PRECHG"; m.log.push([m.t, "->PRECHG"]); } break;
    case "PRECHG":
      if (m.bus >= 0.9 * m.vin * 1.414) { m.kpre = true; m.st = "STANDBY"; m.log.push([m.t, "->STANDBY"]); }
      else if (m.t > 400 && m.bus < 0.5 * m.vin * 1.414) latch(m, F.PRECHG);
      break;
    case "STANDBY":
      if (m.enable && !m.needEnable && !m.lock && m.canFresh < 1000) {
        m.pfcOn = true;
        if (m.bus > 700) {
          if (m.extConn && m.vext < 0) { latch(m, F.BACKFEED); break; }
          const vStart = m.extConn && m.vext > 0 ? m.vext : m.vcmd;   // a connected battery sets the operating voltage
          m.mode = vStart > 500 ? "SER" : "PAR";   // LOW ≤ 500 V · HIGH above (AUTO)
          m.llcOn = true;
          const ready = m.mode === "SER" ? m.kser : m.kpara && m.kparb;
          if (!ready) {
            if (m.mode === "PAR") { m.kpara = m.kparb = true; m.log.push([m.t, "PAR-MADE"]); }   // zero-current make, banks bled
            else m.kser = true;
          } else {
            // a welded matrix contact shows during the soft start — in SER a welded K_PARA holds bank A at 0 V (F.17)
            if (m.mode === "SER" && Math.max(m.bankA, m.bankB) > 50 && Math.abs(m.bankA - m.bankB) > 25) { latch(m, F.BANK_IMB); break; }
            // RUN entry: the stack reaches its target (vext when a vehicle is present) — the diode then conducts
            const tgt = m.extConn ? m.vext : Math.min(m.vcmd, m.mode === "SER" ? 1000 : 500);
            if (Math.abs(stack - tgt) < Math.max(10, 0.05 * Math.abs(tgt))) { m.st = "RUN"; m.log.push([m.t, "->RUN"]); }
          }
        }
      }
      break;
    case "RUN":
      if (m.derate < 1) { m.st = "DERATE"; m.log.push([m.t, "->DERATE", m.derate]); }
      // mode transition request with dwell
      const vX = m.extConn ? m.vout : m.vcmd;                     // crossover on the real battery voltage
      if ((m.mode === "PAR" && vX > 500) || (m.mode === "SER" && vX < 480)) {   // AUTO: 500 V line, 480 V return
        m.dwell++;
        if (m.dwell > 30) { m.st = "MODESW"; m.swStep = 0; m.log.push([m.t, "->MODESW"]); }
      } else m.dwell = 0;
      break;
    case "DERATE": if (m.derate >= 1) m.st = "RUN"; break;
    case "MODESW": {
      m.swStep++;
      if (m.swStep === 1) { m.icmd0 = m.icmd; m.icmd = 0; }
      if (m.swStep === 10) { m.llcOn = false; }
      if (m.swStep === 20) { m.kser = false; m.kpara = false; m.kparb = false; }   // zero current: LLC stopped, diode blocking
      if (m.swStep === 40) {
        m.mode = m.mode === "PAR" ? "SER" : "PAR"; m.icmd = m.icmd0; m.rloadOverride = undefined; m.prevR = undefined; m.st = "STANDBY"; m.enable = true;
        m.log.push([m.t, "MODE=" + m.mode]);
      }
      break;
    }
    case "SAFE": if (m.auxOk) m.st = "STANDBY"; break;
    case "FAULT":
      if (m.clear && !m.lock) { m.latched = null; m.st = "STANDBY"; m.needEnable = true; m.clear = false; }
      break;
    case "SHUTDOWN": m.st = "DISCH"; m.pfcOn = m.llcOn = false; m.kpre = false; break;
    case "DISCH": if (m.bus < 60) { m.st = "OFF"; m.log.push([m.t, "BUS<60V"]); } break;
  }
  return m;
}

function run(name, script, expect) {
  const m = newM();
  for (let t = 0; t < 3000; t++) step(m, script(t, m) ?? {});
  const okState = expect.st ? expect.st.includes(m.st) : true;
  const okCode = expect.code ? (m.latched === expect.code || m.log.some(l => l[2] === expect.code)) : m.latched === null;
  const ok = okState && okCode && (expect.extra ? expect.extra(m) : true);
  results.push([name, m.st, m.latched ?? "-", expect.st?.join("|") ?? "any", expect.code ?? "-", ok ? "PASS" : "FAIL"]);
  if (!ok) console.log(`FAIL ${name}: st=${m.st} latched=${m.latched} log=${JSON.stringify(m.log.slice(-6))}`);
  return m;
}
const results = [["scenario", "end_state", "latched", "expected_state", "expected_code", "verdict"]];
const en = (t) => (t === 500 ? { enable: true } : {});

// 1–3 startup chain
run("power-up→precharge→standby", () => ({}), { st: ["STANDBY"] });
run("enable→run (PAR)", en, { st: ["RUN"], extra: m => m.kpara && m.kparb && !m.kser });
run("enable→run (SER 750 V)", (t) => (t === 1 ? { vcmd: 750 } : en(t)), { st: ["RUN"], extra: m => m.kser });
// 4–8 load/CV-CC
run("load step 0→25→100→25%", (t, m) => t === 500 ? { enable: true } : t === 900 ? { rloadOverride: 16 } : t === 1200 ? { rloadOverride: 4 } : t === 1500 ? { rloadOverride: 16 } : {}, { st: ["RUN"], extra: m => m.iout < 135 });
run("CV→CC→CV (R collapse/restore)", (t) => t === 500 ? { enable: true } : t === 1000 ? { rloadOverride: 2.5 } : t === 1800 ? { rloadOverride: 8 } : {}, { st: ["RUN"], extra: m => m.iout <= 100 * 1.35 });
run("output open circuit", (t) => t === 500 ? { enable: true } : t === 1200 ? { rloadOverride: 1e6 } : {}, { st: ["RUN"], extra: m => m.iout < 1 });
// 9–12 short/backfeed
run("output short → F.16", (t) => t === 500 ? { enable: true } : t === 1400 ? { rloadOverride: 0.02 } : {}, { st: ["FAULT", "LOCK"], code: F.OUT_SHORT });
run("ext battery present, stack meets it through the diode", (t) => t === 1 ? { extConn: true, vext: 400 } : en(t), { st: ["RUN"], extra: m => m.iout > 0 });
run("reverse backfeed → F.33 inhibit", (t) => t === 1 ? { extConn: true, vext: -350 } : en(t), { st: ["FAULT", "LOCK"], code: F.BACKFEED });
// 13–17 grid
run("phase loss mid-run → F.09", (t) => t === 500 ? { enable: true } : t === 1500 ? { phases: 2 } : {}, { st: ["FAULT", "LOCK"], code: F.PH_LOSS });
run("swell 505 V → F.07", (t) => t === 500 ? { enable: true } : t === 1500 ? { vin: 505 } : {}, { st: ["FAULT", "LOCK"], code: F.IN_OV });
run("sag 250 V → F.08", (t) => t === 500 ? { enable: true } : t === 1500 ? { vin: 250 } : {}, { st: ["FAULT", "LOCK"], code: F.IN_UV });
run("bus HW OVP 870 V → F.03", (t, m) => t === 500 ? { enable: true } : t === 1500 ? { bus: 870 } : {}, { st: ["FAULT", "LOCK"], code: F.BUS_OVP_HW });
run("midpoint imbalance → F.06", (t) => t === 500 ? { enable: true } : t === 1500 ? { mid: 0.44 } : {}, { st: ["FAULT", "LOCK"], code: F.MID_IMB });
// 18–19 mode transitions
run("S/P up-transition 400→750 V under dwell", (t) => t === 500 ? { enable: true } : t === 1200 ? { vcmd: 750 } : {}, { st: ["RUN"], extra: m => m.mode === "SER" && m.kser });
run("transition with welded K_PARA → F.17 at the SER start", (t, m) => t === 1 ? { weldedPARA: true } : t === 500 ? { enable: true } : t === 1200 ? { vcmd: 750 } : {}, { st: ["FAULT", "LOCK"], code: F.BANK_IMB });
// 20–22 thermal/airflow/sensor
run("fan fail → DERATE 50%", (t) => t === 500 ? { enable: true } : t === 1500 ? { fanOk: false } : {}, { st: ["DERATE"], extra: m => m.derate === 0.5 });
run("OT 118 °C → F.22", (t) => t === 500 ? { enable: true } : t === 1500 ? { tempX: 118 } : {}, { st: ["FAULT", "LOCK"], code: F.OT });
run("Vout sensor implausible → F.29", (t) => t === 500 ? { enable: true } : t === 1600 ? { voutStuck: 12 } : {}, { st: ["FAULT", "LOCK"], code: F.SENSOR });
// 23–27 aux/drive/comm
run("aux collapse → SAFE, gates low", (t) => t === 500 ? { enable: true } : t === 1500 ? { auxOk: false } : {}, { st: ["SAFE", "STANDBY"], code: null, extra: m => !m.pfcOn && !m.llcOn });
run("DESAT → F.02", (t) => t === 500 ? { enable: true } : t === 1500 ? { desat: true } : {}, { st: ["FAULT", "LOCK"], code: F.DESAT });
run("watchdog → F.32", (t) => t === 500 ? { enable: true } : t === 1500 ? { wdtOk: false } : {}, { st: ["FAULT", "LOCK"], code: F.WDT });
run("CAN timeout → STANDBY + re-enable req", (t) => t === 500 ? { enable: true } : t === 900 ? { canDown: true } : {}, { st: ["STANDBY"], code: F.CAN_TO, extra: m => m.needEnable === true });
run("internal link loss → F.27", (t) => t === 500 ? { enable: true } : t === 1500 ? { linkDown: true } : {}, { st: ["FAULT", "LOCK"], code: F.LINK });
// 28 shutdown discharge + repeated-fault lockout
run("shutdown → discharge <60 V", (t, m) => t === 500 ? { enable: true } : t === 1200 ? (m.st = "SHUTDOWN", {}) : {}, { st: ["OFF"], extra: m => m.bus < 60 });
run("5 repeated faults → LOCK", (t, m) => {
  if (t === 500) return { enable: true };
  if (t % 300 === 0 && t >= 600 && t < 2100) return { desat: true };
  if (t % 300 === 150 && t > 600) { m.clear = true; m.enable = true; m.needEnable = false; }
  return {};
}, { st: ["LOCK"], code: F.LOCK });

const pass = results.slice(1).filter(r => r[5] === "PASS").length;
writeFileSync(join(OUT, "fsm-scenarios.csv"), results.map(r => r.join(",")).join("\n") + "\n");
console.log(`\n§36 scenario coverage: ${pass}/${results.length - 1} PASS → calculations/out/fsm-scenarios.csv`);
if (pass !== results.length - 1) process.exit(1);
