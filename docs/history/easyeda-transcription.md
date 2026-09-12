# EasyEDA transcription of the 30 kW schematics (status: PARTIAL — do not treat as authoritative)

> **2026-09-06 update — this path is superseded.** The release drawing set is now the KiCad-5
> import set, `kicad5/DC-Modules-<sku>-SHIP.zip` (see `docs/schematic-drawing-set.md`). That is
> **option (b) below realised**: a file-based import instead of pin-by-pin port placement, which
> sidesteps blockers 1-3 entirely. It lands 8053/8053 pins correct where this pin-by-pin
> transcription peaked at 94.08 %.
>
> Keep this document for the tool limitations it records — they are reproducible, they are why
> the approach was abandoned, and anyone who tries the MCP route again will hit them.

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


## 2026-09-06 findings

**One extract call per functional block is the only reliable recipe.** The single page that ever
came back 100 % correct (`dcdc-LLC-TANKS`) was applied as three calls of exactly one complete
block each. Mixing two blocks in a call, or splitting one block across calls, corrupts net-port
placement — and a split block also draws two boxes for one section. `easyeda-apply-gen.mjs` now
emits one chunk per block (58 blocks over 12 pages, all ≤ 24 components) in signal-flow order.

**Deleting a page does not free its components.** After the 12 pages were deleted and recreated,
the new pages came up carrying orphaned components from the deleted ones, which EasyEDA then
auto-renamed on collision (`RV1D8`–`RV1D15`, `UIVV4` — designators that exist nowhere in the
design). A verify pass measured 139 extra, 170 missing, 154 wrong nets. Treat page deletion as
unsafe, and always re-verify with `easyeda-verify.mjs` afterwards rather than trusting the tool.

**A fatal DRC error anywhere blocks netlist export for the whole schematic.** The symptom is
`"Failed export netlist"` on *every* page of that schematic, including reads; `sync_current_document`
does not clear it. It was located by bisection (deleting one page cleared it) — this build's DRC
reports counts only, not locations, so bisection is the only tool available.

**Current state.** Superseded by the KiCad-5 import path; neither EasyEDA project produced by
this route was fabrication-ready. The workspace was cleaned on 2026-09-06 from 37 projects to 17:
the three `SHIP D.3` projects (30 kW fp, 60 kW, 120 kW) imported from the SHIP zips were kept, 20
superseded DC-Modules revisions were deleted, and `LEV OBC` plus all 13 non-DC-Modules projects
were left untouched. `easyeda-verify.mjs` still runs if you need the exact outstanding defects of
the old transcription.
