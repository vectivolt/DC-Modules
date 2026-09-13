// evidence.mjs — a gate's printed check rows, kept as a machine-readable evidence file.
// Every gate prints `  ok    [TAG] name — detail` (or FAIL / info). captureEvidence() records those rows as the gate runs
// and writes calculations/out/evidence/<gate>.json when it exits, so documentation generators quote the gate's own result
// instead of copying numbers by hand.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "out", "evidence");
const ROW = /^\s{2}(ok|FAIL|info)\s+\[([^\]]+)\]\s+(.*)$/;

export function captureEvidence(gate) {
  const rows = [], log = console.log;
  console.log = (...args) => {
    for (const line of args.map(String).join(" ").split("\n")) {
      const m = line.match(ROW);
      if (!m) continue;
      // an info row reads "<subject>: <text>"; a check row reads "<name> — <detail>"
      const c = m[1] === "info" ? m[3].match(/^([^:—]{1,40}):\s(.*)$/) : null;
      const i = m[3].indexOf(" — ");
      rows.push(c ? { status: m[1], tag: m[2], name: c[1].trim(), detail: c[2].trim() }
        : { status: m[1], tag: m[2], name: (i < 0 ? m[3] : m[3].slice(0, i)).trim(), detail: i < 0 ? "" : m[3].slice(i + 3).trim() });
    }
    log(...args);
  };
  process.on("exit", (code) => {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, `${gate}.json`), JSON.stringify({ gate, exit: code, rows }, null, 1) + "\n");
  });
}
