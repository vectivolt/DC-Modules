# EasyEDA transcription of the 30 kW schematics (status: PARTIAL — do not treat as authoritative)

**The authoritative electrical design remains the tscircuit source** (`packages/`, `boards/`,
compiled to `dist/boards/*/*/circuit.json`) and the BOM/gate scripts under `calculations/`.
The EasyEDA project is a *transcription* of that netlist, and as of 2026-09-06 it is **94.08 %
pin-accurate (1622 / 1724 connected pins), not 100 %**. Do not fabricate from it and do not
re-import it back over the tscircuit source.

## What exists

EasyEDA Pro project **"DC Modules"** (`ff6743cf44fe496d924b7acc19851117`), personal workspace:

| Schematic | Pages | Components |
|---|---|---|
| Schematic1 (AC-DC 30 kW) | INPUT-EMI, VIENNA-PFC, DC-LINK, AC-SENSING, CONTROL, AUX-POWER | 300 |
| Schematic2 (DC-DC 30 kW) | LLC-LEGS, LLC-TANKS, BANKS-SP, OUTPUT-SENSING, CONTROL, COMMS-HMI | 308 |

607 of 608 components are placed (USR1, the HMI 74HC595, never took). The 30 kW board pair is
the complete electrical design; 60 kW and 120 kW replicate the same cells ×2 / ×4.

Page UUIDs are recorded in `calculations/easyeda-apply-gen.mjs` (`PAGE_UUIDS`).

## Pipeline

    dist/boards/30kw/{acdc,dcdc}/circuit.json
      -> calculations/easyeda-pages.mjs      # netlist -> 12 per-page payloads (blocks, nets, NC pins)
      -> calculations/easyeda-apply-gen.mjs  # payloads -> apply chunks, with per-part pin remaps
      -> (EasyEDA Copilot MCP: extract_circuit_on_current_page)
      -> calculations/easyeda-verify.mjs     # readback vs intent diff + repair plans

`calculations/out/easyeda/part-uuid-map.json` holds the LCSC `part_uuid` chosen for each of the
91 part families, with probe notes. Several are deliberate stand-ins (no library symbol exists
for the custom magnetics, the 3-phase CMC, or the mirror-contact relays) — those notes matter
for anyone continuing this work.

**Verification is not optional here.** The MCP's own `applied_check: "MATCH"` is unreliable: it
reported MATCH for writes that the saved page does not contain. Only
`calculations/easyeda-verify.mjs`, which diffs a fresh read-back against intent, tells the truth.

    node calculations/easyeda-apply-gen.mjs   # regenerate apply chunks
    node calculations/easyeda-verify.mjs      # diff readback/ vs apply/, emit fix/ repair plans

## Known blockers in this EasyEDA extension build

These are tool limitations, not design errors. All were reproduced deliberately:

1. **No `measure-symbols` support.** Every plan runs on *estimated* symbol geometry. Net ports
   then land a pin off on multi-pin symbols — e.g. CMC1.5 picked up pin 6's net, JFAN1.2 picked
   up pin 3's. This is the root cause of most residual errors.
2. **A second pin of one component cannot join a net another of its pins already carries.**
   Verified: a lone `external_connect` of `UPFC.26 -> DGND` (with `UPFC.10` already on DGND)
   returned MATCH, saved, and read back empty. Dense symbols (LQFP100, SO-16 gate drivers,
   SOP-8 isolators) lose their duplicated GND/VCC pins this way.
3. **`beautify_schematic_on_current_page` corrupts nets.** It re-routes and silently drops or
   merges connections that were previously correct. **Do not call it on this project.**
4. **Writes can land on the wrong page** if `open_document` is not re-issued before every
   operation, and stray components can leak between pages.
5. The DC-DC pages entered a persistent `"Failed export netlist"` state that survived
   `sync_current_document` + reopen; it needs the EasyEDA desktop app restarted.

## Residual defects (87 wrong nets, 5 NC violations, 1 missing part)

Run `node calculations/easyeda-verify.mjs` for the current, exact list — it prints per page and
writes machine-readable repair plans to `calculations/out/easyeda/fix/`. Clusters as of the last
run: `UPFC`/`ULLC` (LQFP100 supply and link pins), `U*H`/`U*L`/`UC0G` (NSI6611 gate drivers,
including a `GH_3` ghost-net merge on the LLC leg-3 block), the `PS*`/`UIV*` isolated bias and
sense chains, `CMC2`, and the HMI display segments.

## To finish this properly

Either (a) update the EasyEDA Copilot extension to a build that supports `measure_symbols_on_current_page`,
re-measure, and re-run apply + verify to a clean `PASS`; or (b) import the netlist through a
file-based path (EasyEDA netlist import) instead of pin-by-pin port placement. Option (b) sidesteps
blockers 1–3 entirely and is the better bet for a design this size.
