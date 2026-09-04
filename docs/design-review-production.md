# Production-Readiness Design Review — Independent Adversarial Audit 🔎

**Scope:** complete schematic set (6 boards), BOM, calculations, firmware interfaces, protection
architecture. **Explicitly excluded:** PCB placement/routing/stack-up (layout dependencies are
flagged in §P, not reviewed). **Method:** every claim below was verified against the schematic
*source* (`packages/power-primitives/cells.tsx`, `packages/common-components/boards.tsx`,
`calculations/cost/parts-db.mjs`), not against the documentation — the documentation describes
intent; this review audits what is actually drawn.

> [!IMPORTANT]
> **Status update (rev C, 2026-09-05):** every blocker and high/medium item below has been
> **implemented in schematic rev C** — cells v3 / boards v3 / parts-db rev C — same day. See the
> **Fix log** appendix at the bottom for the item-by-item mapping and evidence (rebuilds, rev-B aux
> simulation, per-fix source assertions in `calculations/review-checks.mjs`). The verdict recorded
> in §A is the verdict **at review time**; what remains open after rev C is the §K datasheet gate,
> ECO-1 (E23), and bench EVT (T-01…T-18) — hardware-domain by nature.

**Reviewer stance:** hostile. The design's own ERC (6/6 clean), simulation suite and firmware
tests were treated as *evidence about specific questions only* — ERC proves connectivity, not
electrical sense; the behavioral simulations abstracted exactly the blocks (aux control, enable
logic, sensing front-ends) where several of the defects below live. That is the meta-lesson of
this review: **every layer passed its own tests, and the design still contains 15 production
blockers.**

---

## A. Executive conclusion

> ## Production-ready: **NO**
> **Confidence: HIGH** (every blocker is verified in schematic source or by arithmetic shown in §F; none is speculative).
> The power-conversion core (Vienna + LLC + S/P concept, tank, magnetics, loops, protections *as specified*) is sound and well-verified. What fails review is the **support infrastructure as drawn**: AC filter capacitor ratings, bank capacitor ratings, the entire aux-power block, the enable/kill/watchdog chain, sensing front-ends (bias + isolation), precharge bypass rating, missing commutation capacitors on the AC-DC board, and manufacturing provisioning (SWD/boot). These are exactly the class of defects that pass simulation and ERC and then burn units in week one.

Major reasons, one line each:

1. AC "X" filter caps are rated **310 VAC across a 475 VAC line-line** — they fail in service.
2. Bank electrolytics are **450 V parts on a 525 V bank**.
3. Bank/output voltage dividers **galvanically breach the primary–secondary isolation barrier**.
4. `AGND` is referenced by every analog signal and is **connected to `DGND` nowhere**.
5. The aux flyback **cannot start or regulate as drawn** (FB tied to the 15 V rail, COMP/VCC/aux-winding unconnected), **cannot start below ≈ 424 VAC** (fed from the half-bus), and is **~2× undersized** for the relay+fan load.
6. The precharge bypass relay (8 A) **carries the full 55/110/220 A line current forever**.
7. The Vienna commutation film capacitors — the parts that make the DPT-frozen ≤10 nH loop physically possible — **were lost in the two-board split**: the AC-DC board has none.
8. The hardware kill chain doesn't exist as hardware: `GATE_EN` floats, `PWM_KILL` disables nothing, and there is **no external watchdog device** despite the protection table requiring one.

---

## B. Critical production blockers (15)

> Format: **Location · Component/Net · Problem → Why → Failure scenario → Evidence/calc → Fix → Severity**

### CB-1 · AC-DC board, EMI filter · `CX11–13`, `CX21–23` — X2 310 VAC across 475 VAC line-line
Delta-connected X caps see the full line-line voltage: 475 VAC max operating (spec E1), 523 VAC at +10 %. The specified part (`X2-2u2-310`, 310 VAC) is over its rated voltage by **53–69 % continuously**. X2 dielectric and its self-healing metallization are qualified to 310 VAC + defined transients; sustained 1.5× operation ends in thermal runaway/self-healing exhaustion → open (loss of filtering) or fire-risk failure mode. *Failure scenario:* any site at ≥400 VAC, weeks-to-months timescale; guaranteed at 440–475 VAC sites. **Fix:** X1-class 530 VAC (or X2 ≥ 480 VAC) delta caps, e.g. 2.2 µF/530 VAC X1 (BOM ~+₹25/pc), or re-arrange as wye with artificial neutral (3× X2 310 VAC line-to-star is then legitimate — and is what many 3-φ filters do; also fixes CY, see HR-7/MR-4). **Severity: CRITICAL.**

### CB-2 · DC-DC board · `CBA0–n`/`CBB0–n` — 450 V electrolytics on a 525 V bank
Banks A/B operate to 500 V (crossover) and 525 V (hysteresis top, E9); the schematic parallels 470 µF **450 V** snap-ins directly across each bank (`parts-db: ELH-470u450`, traces `CBAx → BKAP/BKAN`). 117 % of rated voltage → immediate overvoltage, vent/electrolyte failure within hours at the top of the window. *Evidence:* E9 rev B (bank ≤ 525 V) vs part rating 450 V. **Fix:** per bank, two series 470 µF/450 V strings with balance resistors (voltage headroom 900 V, matches the existing split-bus practice), or 500–600 V hybrid parts; update `SplitDcLink`-style cell for banks + BOM (+₹300–600/module). **Severity: CRITICAL.**

### CB-3 · DC-DC board · `HvDivider OA/OB/OV` — resistive dividers breach the isolation barrier
`boards.tsx:294–296`: bank A+, bank B+ and OUT+ are sensed by plain 3.81 MΩ divider chains **returned to `net.AGND` — a primary-referenced control ground**. The output domain is galvanically isolated from the primary by the LLC transformers (reinforced barrier, §33); these three dividers puncture it with a resistive path. Consequences: (a) the barrier is no longer reinforced — hipot at 4 kV drives ~1 mA through the chains and the "isolation" fails any 62477-1 assessment; (b) with the output floating as designed, the measured values are meaningless (return path is parasitic); (c) touch/leakage current budget broken. The output *current* sense got this right (NSI1200 + isolated bias); the voltage senses did not. **Fix:** sense bank/output voltages **on the secondary side** — per channel: divider referenced to `BKAN`/`OUTN` into an isolated amplifier (NSI1200-class) with an isolated bias set (same pattern as `OutputShunt`), digital side to the MCU. 3 channels → +₹350–420/module. **Severity: CRITICAL (safety + function).**

### CB-4 · both boards · `net.AGND` — floating analog reference
`AGND` is the return for every CT burden, NTC, divider filter and iso-amp output (dozens of pins), and **no component or trace ever joins `AGND` to `DGND`** (verified by exhaustive grep). ERC cannot flag this — both nets are well-populated. As drawn, every analog measurement floats. **Fix:** single-point tie (0 Ω link footprint per board, placed at the MCU ADC ground per layout note §P-3), plus explicit star policy in the schematic. **Severity: CRITICAL** (trivial fix, total functional failure if missed).

### CB-5 · AC-DC board, aux block · `UAUX/TAUX` — the flyback cannot work as drawn
Verified: the only control connection is `UAUX.FB → net.V15` (**the raw 15 V rail into a ~1.25–2.5 V FB reference** → controller sees massive overvoltage → zero duty forever). `COMP` — unconnected (no compensation: even with a divider, unstable/undefined). `VCC` — unconnected (the IC has no supply path; `RAUXST → VIN` maps to no real NCP1252-class pin function). `BR` (brown-out program) — floating. `TAUX.AXA/AXB` (the self-supply winding) — unconnected. This block was validated only by a *behavioral* SPICE controller (documented), which is precisely why the wiring defects survived. **Fix:** complete the standard current-mode flyback application circuit: HV start-up into `VCC` (resistor or depletion-FET), `VCC` reservoir + aux-winding rectifier feed, FB divider 15 V→ref (e.g., 100 k/9.1 k for 1.25 V ref, or TL431+opto if the chosen IC is primary-reg only — pick per final IC), type-II RC on COMP, BR divider setting start ≥ the CB-6 fix's input floor. **Severity: CRITICAL.**

### CB-6 · architecture E20 · aux input range — cold-start deadlock below ≈ 424 VAC
Aux feeds from DCP→MID = **half** the *unboosted* rectified bus at cold start: at 400 VAC, ½·√2·400 = **283 V**; at 285 VAC, **201 V** — both below the flyback's designed 300 V minimum. The module's boot chain is: passive precharge → aux → MCU → PFC boost; with aux dead below ~424 VAC input, **the module never boots at nominal Indian grid voltage**. (At full 830 V bus the feed is 415 V — the design point that hid the cold-start case.) **Fix options:** (i) redesign flyback for 180–430 V input (4.8:1 — heavy but feasible in DCM), (ii) feed from the **full** unboosted bus, 400–850 V range, with a 1200 V-class switch (reverses E20's FET saving — accept it), or (iii) small line-side house supply. Recommend (ii) + CB-5 rework as one package. **Severity: CRITICAL (no-boot at nominal line).**

### CB-7 · aux block sizing — 24 V rail budget exceeded (up to 2.4× at 120 kW)
Load reality: relay coils (HFE82-class ≈ 1.3–1.7 W each: 30 kW carries 6 HV coils + KPRE; 120 kW carries 10 incl. paralleled pairs) + fans (120×38 ≈ 6–11 W each: 2/2/4) + harness feed. Worst-case hold: 30 kW ≈ 26 W, 120 kW ≈ **45 W** on 24 V alone; design provided 24 V/0.8 A (19 W) and the DCM stage's own ceiling is ½·L·Ip²·f = ½·1.2 mH·0.85²·65 kHz ≈ **28 W total** for all rails. Symptom: 24 V collapses when relays pull in with fans at speed → relays drop → cascade. **Fix:** re-rate aux to ≥60 W deliverable (Ip clamp ≈ 1.6 A, Lp ≈ 0.55 mH, FET/CS resize, D4 rev), add relay coil PWM-hold economizers (halves hold power — cheap firmware+RC), recompute in the aux deck with the real IC model. **Severity: CRITICAL.**

### CB-8 · AC-DC board · `KPRE` (HF115F-2Z, 8 A) — bypass relay in the main current path
After precharge, both poles of KPRE **carry the full phase current continuously**: 55 A (30 kW), 110 A, 220 A. An 8/16 A relay welds/burns immediately at first full load. *(The precharge study E14b sized the resistors correctly and never revisited the bypass rating.)* **Fix:** per line, a properly rated bypass: 80 A-class power relay/contactor per resistor line at 30/60 kW; at 120 kW use paralleled 120 A relays or move to DC-side precharge (single path, one 200 A DC contactor — trade study 30 min). BOM +₹450/900/1800. Also add the "bypass never closed" interlock check (already implicit in F.20 timing) and the CB-8-weld single-fault note (MR-5). **Severity: CRITICAL.**

### CB-9 · AC-DC board · missing Vienna commutation film capacitors
Verified: the AC-DC board contains **zero film capacitors** — the 1 µF/900 V commutation caps exist only on the DC-DC board (`CF0–2`, for the LLC legs). The Vienna phase legs commutate 78 A at 9 ns against… five snap-in electrolytics with ~20 nH ESL each, distributed centimeters away. The entire DPT-frozen drive design (E5: ≤10 nH loop, 70 % V_DS) **presumes a local film cap at each phase leg**; without them, overshoot returns to the un-clamped 100 %+ regime the DPT explicitly rejected. **Fix:** add per-phase-leg film caps on the AC-DC board — per phase: 1× 1 µF/500 V film DCP→MID and 1× MID→DCN adjacent to the leg (or 1× 800 V-class DCP→DCN per phase pair), ×lanes; update `ViennaPhase` cell + BOM (+₹330/660/1320). **Severity: CRITICAL** (device-destroying, and invisible until hardware).

### CB-10 · both boards · gate-enable / kill / watchdog chain is not implemented in hardware
Verified: (a) `GATE_EN` drives the `EN` of all 9/18/36 driver channels and has **no pull-up/-down anywhere** — at MCU reset/boot the entire gate-driver population has a floating enable; (b) `PWM_KILL` exists as two MCU pins and a harness wire and **is connected to nothing that stops gates**; (c) the protection table rows 24/30 require a driver-UVLO/kill chain and an **independent watchdog** — no watchdog/supervisor component exists in the schematic. **Fix:** define the chain concretely: `GATE_EN` = open-drain wired-AND (both MCUs + external supervisor + latch-comparator output) with 10 k pull-**down** at every driver cluster (default-disabled), buffered per board; external windowed watchdog/supervisor IC (TPS3430/MAX6753-class) whose output is one of the wired-AND masters; retire the separate `PWM_KILL` net into this chain (or keep it as the cross-board member of the AND). ~₹60 + 8 resistors per module. **Severity: CRITICAL (safety layer exists only on paper).**

### CB-11 · AC-DC board · discharge "fail-engaged" logic (E19) burns the discharge resistors
As drawn, `QDISF` gate is pulled **up** to V15; the ULN (MCU-driven) must actively hold discharge OFF. Any condition where aux is up and the MCU is not actively driving — held in reset, SWD programming session, boot loop, firmware crash-loop before WD recovery — engages 850 V across 640 Ω = **1129 W into four 25 W resistors** (calc §F-6): >100 J each within 0.4 s, destruction in seconds during e.g. a programming session with the bus charged. **Fix:** invert to default-OFF (10 k pull-down; drive the gate from a proper push-pull or PNP-high-side stage since ULN is sink-only), keep commanded + watchdog-supervised discharge, and cover the "control dead with bus charged" case by (i) the supervisor of CB-10 issuing a *timed* discharge pulse, and (ii) reducing passive bleed τ: split each 100 k balancer into 2×47 k/2 W (≈2× faster passive bleed, +3.4 W standby at 800 V — still meets <10 W idle only marginally: re-budget or accept 62477's ≤ 1-min-with-label route; decide explicitly). **Severity: CRITICAL (fire risk in normal factory/service workflows).**

### CB-12 · all driver channels · NSI6611 `CLAMP` (pin 9) floating
Verified: `DRV_PINS` defines CLAMP; no trace ever references it. A floating Miller-clamp pin means, at best, no active Miller clamping (the crosstalk margin in the DPT — V_gs,fw ≤ 2.05 V vs 2.5 V — was computed *with* clamping assumed available) and, at worst, undefined driver behavior depending on the IC's pin definition. **Fix:** tie CLAMP to the gate node per datasheet application (or to VEE if the clamp function is internal-auto in the final variant — resolve with the actual NSI6611 datasheet, see §O). One trace per `DriverCh`. **Severity: CRITICAL** (parasitic turn-on of a 750 V/1200 V bridge is a fire, and the fix is a wire).

### CB-13 · both boards · no programming/debug/boot provisioning
Verified: no SWD/JTAG connector, no BOOT0 strap resistors, no UART-boot access anywhere in the schematic; the EOL flow (dfm-production.md step 4, "MCU program+boot") is physically impossible as drawn. **Fix:** per MCU: 2×5 1.27 mm SWD header (or TC2030 pads — layout note), BOOT0 10 k pull-down + test pad, NRST on the header; gate the headers behind the LV-only test state (§45). **Severity: CRITICAL (manufacturing blocker).**

### CB-14 · interconnect harness · UART link has no TX↔RX crossover
Verified: both boards wire `JIC.LTX → net.LINK_TX` and `JIC.LRX → net.LINK_RX`, and each MCU's map binds its **own transmitter** to `LINK_TX`. Straight-through harness ⇒ TX-drives-TX contention and RX listens to RX: the safety-relevant internal link (50 ms timeout → F.27) is dead on every unit. **Fix:** cross in the harness definition (pin 7↔8 at one end) *or* rename nets on one generator (`LINK_TX→LINK_RX` swap on `DcDcBoard`) — one line; add series 100 Ω + defined idle pull-ups to both lines while at it. **Severity: CRITICAL (trivial fix; guaranteed field-stop if missed).**

### CB-15 · sensing front-ends · bipolar signals driven into a unipolar ADC without bias or negative clamping
Three families, same defect (verified in `CtSensor`, `HvDivider` usage for VAC):
- **Line CTs** (3–12×): burden across S1–S2 with S2 at AGND → **±0.79 V bipolar** at the ADC pin; only a *positive* clamp diode fitted. Negative half-cycles inject current through the MCU's substrate diode every cycle (latch-up/lifetime risk, and half the waveform unreadable — the RMS/OC computations assumed in firmware can't work).
- **Resonant CTs** (3–12×): same, at 140 kHz.
- **AC voltage dividers** (`SNS_VAC1–3`): ±0.48 V bipolar into the ADC, same injection.
**Fix:** per channel: reference the burden/divider bottom to a **1.65 V bias rail** (one buffered VREF/2 source per board + returns), add series 1 k + dual BAT54S clamp to 3V3/AGND; rescale firmware conversion. (Bus/bank/output DC senses are unipolar — unaffected.) ~₹40/module. **Severity: CRITICAL (measurement layer + MCU stress).**

---

## C. High-risk issues (12)

| # | Location · item | Problem / evidence | Fix |
|---|---|---|---|
| HR-1 | DC-DC `CF0–n` 1 µF **900 V** film across the bus | 830 V cont. = **92 %** of rating; 860 V OVP = 95.5 %. Film DC derating practice ≤ 80–85 % for life | 1100–1200 V film (or 2× 550 V series). +₹15/pc |
| HR-2 | LLC leg snubbers `R{leg}SN` 10 Ω **1 W** 2512 | Edge-energy calc (§F-4): ≈ **2.8 W** at 140 kHz hard corners (PS mode edges) | 3–5 W TO-126/axial or split 2× 4.7 Ω 2512; recount in loss budget |
| HR-3 | Vienna RCD clamp bleeders `R{ph}C` 470 Ω **1 W** 2512 | Ring-energy transfer ≈ **4.3 W** at full load (§F-5, matches DPT-era estimate that specified 5 W) | 470 Ω 5 W wirewound; footprint change |
| HR-4 | Relay contact readback absent | Firmware `relay_fb[]` + fault F.19 have **no source hardware**; weld detect falls back to voltage-divergence only (needs CB-3 fix to even work) | Specify HFE82V **with auxiliary mirror contact** variant; wire aux contacts via 24 V→divider→GPIO ×6; or formally delete F.19 and re-baseline docs |
| HR-5 | `FLT_PFC`/`FLT_LLC` wire-OR | Open-drain fault outputs of 9–36 drivers share a net with **no pull-up** | 4.7 k to 3V3 per net + RC deglitch |
| HR-6 | Driver `PWM` inputs | No pulldowns; input state during MCU reset depends on unverified NSI6611 internal termination (§O-2) | 10 k pull-down per PWM net (cheap insurance regardless) |
| HR-7 | Surge front-end is line-line only | MOV Δ exists; **no L-PE path** (only 4.7 nF Y). IEC 61000-4-5 CM 2–4 kV will find the insulation instead | Add 3× (MOV 550 VAC + GDT 3.5 kV in series) L-PE; sizes per §27 calc at EMI rev |
| HR-8 | Output film `COF1/2` 4.7 µF 1100 V | 1000 V service = 91 % | 1200/1300 V film |
| HR-9 | `LDM1–3` DM chokes, ₹38 toroid | Carry full line current (55–220 A rms); no drawing exists; sat/thermal unproven at 78–311 A pk | Create drawing **D6** (per-SKU winding, 26µ sendust, sat ≥ 1.5×Ipk); re-cost (~₹60–180) |
| HR-10 | E23 bias distribution not in schematic | BOM prices a multi-secondary bias transformer + driver; schematic still shows only per-channel 5-pin modules — **unbuildable from drawings**; also bias barrier C_io at 46 V/ns on floating channels needs a spec (≤10 pF/winding + CM choke on V15 feed) | Draw the bias subsystem (driver IC, transformer symbol w/ N windings, per-channel rect/filter) or revert BOM to QA01C modules for EVT build; add C_io spec to D5 |
| HR-11 | MCU reset/boot robustness | NRST: pull-up only (no cap, no supervisor); no brown-out strategy stated; GD32 BOOT0 floating (also CB-13) | 100 nF on NRST + supervisor (can be the CB-10 device), BOOT0 strap |
| HR-12 | Pre-insertion resistors 10 Ω 10 W | Single-fault (sequence error/stuck relay) pre-insertion across ΔV = 500 V → 94 J vs ~50 J capability (§F-7); aux relay sees 50 A make | SQP-25 W pulse type + firmware double-interlock (ΔV check *before* KPREA/B close — exists; add hardware-timer cap on pre-insert dwell) |

## D. Medium-risk issues (10)

| # | Item | Problem | Fix |
|---|---|---|---|
| MR-1 | Precharge/discharge resistors: BOM "25 W ceramic" on **2512 footprints** | BOM/footprint contradiction → assembly stop | Axial/TO-220 ceramic footprints; already flagged in db note — execute |
| MR-2 | `T_INLET` analog node shared across harness | Two 10 k biases in parallel across two grounds → curve error + noise | Send inlet temp over LINK instead; delete harness pin 13 usage |
| MR-3 | HV divider chains: surge + ADC source-Z | 4 kV surge ≈ 500 V/1206 (marginal pulse rating, MOV-clamped); source Z ≈ 6.8 kΩ needs long sample time | Anti-surge 1206 series (KOA HV73V-class); fix ADC sample config note in firmware guide |
| MR-4 | Y-cap class & leakage | CY 300 VAC on 274 V L-PE nominal is legal but thin at 475 V systems (transients); leakage w/ 3× 4.7 nF ≈ 0.4 mA balanced, ~1.1 mA single-phase-loss | Y1/Y2 440 VAC class; verify §leakage vs 62477 (fixed install allows w/ PE spec — document) |
| MR-5 | KPRE-welded single fault → un-precharged energize | Half-cycle surge est. 600–900 A through 40 A JBS (non-rep surge maybe 210–400 A) → diode loss | Detect at t=0 (bus already high before precharge command) + accept residual, or add NTC in series with R path; record decision |
| MR-6 | NSI1200 outputs used single-ended | OUTN floating; CMRR/accuracy loss | Route OUTP/OUTN to ADC differential pair or add diff-to-SE op-amp stage |
| MR-7 | MCU analog supply | VDDA fed from digital 3V3, no ferrite/no VREF caps in schematic | LC on VDDA + 1 µF/100 nF at VREF+ |
| MR-8 | ULN2803 unused inputs (NC_U* nets) | Floating inputs on darlington array (weak but spec-untidy) | Tie spare INs to DGND |
| MR-9 | 4-wire fan PWM at 3.3 V | Intel spec nominal 5 V; most fans accept 3.3 V (VIH 2.0) — unit-to-unit variation risk | 5 V push (transistor) or validated fan p/n note in BOM |
| MR-10 | Tactile switch pin pairing / display p/n pinout | Footprint pairing (1-3 vs 1-2) and 7-seg pin map are generic | Verify against selected MPNs at BOM freeze |

## E. Low-risk improvements

Driver `RDY` pins unused (add test pads); `NC1/NC2` on driver symbol to be confirmed against final pinout; add bleeder across `CCL` clamp caps notation (RCL exists ✓); label the AGND/DGND star point on the schematic explicitly once CB-4 is fixed; add DNP 0 Ω options for CT burden trim; magnetics doc references "D1–D5" while D5 (bias transformer) doesn't exist yet (create with HR-10); harness spare pins → ground; version/date title-block discipline when moving to release CAD.

---

## F. Key verification calculations

1. **X2 stress (CB-1):** V_LL,max = 475 V +10 % = 523 VAC vs 310 VAC rating → **169 %**. Even at nominal 415 V: 134 %. FAIL by inspection.
2. **Bank cap stress (CB-2):** V_bank,max = 525 V (E9) vs 450 V → **117 %**, plus ripple. FAIL.
3. **Aux cold-start (CB-6):** feed = ½·√2·V_LL: 285 V→201 V, 400 V→283 V, 424 V→300 V (=flyback V_in,min) → **no boot below ≈424 VAC**.
4. **LLC snubber R power (HR-2):** per edge E ≈ R·C²·V²/t_edge = 10·(470 p)²·830²/150 n ≈ 10 µJ; ×2 edges×140 kHz ≈ **2.8 W** (worst PS/hard corners; ZVS nominal less — rating must cover worst).
5. **Clamp bleeder (HR-3):** ring energy ½·L_loop·I² ·f = ½·14 n·78²·50 k ≈ 2.1 W nominal, ≈ **4.3 W** at 330 V corner ring estimate (DPT-era) → 1 W part FAIL.
6. **Discharge abuse (CB-11):** 850²/640 = **1129 W** total → 282 W per 25 W resistor; energy to burn ≈ seconds. Programming-with-bus-up is a *normal* factory scenario. FAIL as drawn.
7. **Pre-insertion single-fault (HR-12):** E = ½·C_series·ΔV² = ½·0.75 mF·500² ≈ **94 J** vs ~50 J (10 W ceramic pulse) → FAIL single-fault.
8. **Aux budget (CB-7):** 120 kW hold: 8 HV coils×1.5 W + KPRE 0.9 W + 4 fans×9 W + logic/senses 6 W ≈ **55 W demand** vs 19 W provisioned / 28 W stage ceiling. FAIL.
9. **KPRE contact (CB-8):** I_line = 55/110/220 A vs 8 A → **690–2750 %**. FAIL.
10. **CT ADC swing (CB-15):** 55 A rms /2500 × 33 Ω = 0.73 V rms → **±1.03 V pk** at the pin; −1 V beyond the −0.3 V abs-max injection limit every half cycle. FAIL.
11. **Film derating (HR-1/8):** 830/900 = 92 %; 1000/1100 = 91 % — vs 80–85 % practice → margin FAIL (not abs-max FAIL).
12. **Passive bleed (CB-11 fix input):** present 2×100 k → τ = 200 k·1.175 mF ≈ 235 s → ~10 min to <60 V. Confirms passive path alone cannot meet any touch-safe expectation; active discharge integrity is safety-relevant.

## G. Simulation findings (and their blind spots)

Executed suites (all preserved): DPT (drive spec, k_sw), averaged line-cycle (THD 0.59–1.05 %),
LLC op-points (ZVS everywhere, boost margin), S/P mismatch (pre-insertion mandate), aux behavioral
(startup/cross-reg), grid 3024-pt, Monte-Carlo (rev-D2 iteration), 26-scenario FSM, C-firmware
33/33. **Blind spots now demonstrated by this review:** behavioral abstractions validated *intent*
while the schematic diverged (aux control wiring CB-5, enable chain CB-10, sensing bias CB-15);
component-rating checks were performed for semiconductors and magnetics but not re-swept for
passives after architecture changes (CB-1/2, HR-1/8 arrived with the two-board and bank-window
revisions). **Proposed additional sims after fixes:** aux flyback with the real IC model
(startup at 201 V/850 V feed, brown-out), Vienna leg switching with electrolytic-only vs film-fitted
bus model (quantifies CB-9), CT front-end SPICE with bias network (linearity + OC step), bias-barrier
CM current (C_io × 46 V/ns) into the V15 rail.

## H. Thermal findings

Existing budgets stand (semis 620 W on sink @30 kW worst, Rth ≤ 0.063 K/W per face after E17,
Tj ≤ 139 °C grid-wide). **New from this review:** HR-2/HR-3 resistor overloads (2.8 W & 4.3 W on
1 W parts — will scorch), CB-11 discharge-resistor abuse case, CB-7 aux FET at ~2× design power,
LDM chokes unanalyzed (HR-9). Post-fix, rerun `loss-budget.mjs` including snubber/bleeder real
ratings (adds ≈ 25–30 W to the 30 kW budget — η impact ≈ −0.1 pt, absorbable).

## I. Magnetics findings

D1 choke, D2 binned trim, D3 transformer (Lm ±7 %, PD-sampled), D4 aux (needs rework with CB-5/6/7),
CM chokes: specs coherent with calc chain. **Gaps:** D5 (bias transformer, HR-10) and D6 (LDM DM
chokes, HR-9) drawings do not exist; CT apertures (line CTs must pass busbar/wire — layout/mech
note §P-6); aux transformer re-spec after CB-7 (energy ×2 → EF25 class, new turns sheet).

## J. Power budget & power tree

Boot chain verified conceptually sound (passive precharge → aux → MCU → PFC) **but broken by CB-6**.
24 V/15 V/3.3 V tree: single aux source = single point of failure for both boards *by design*
(accepted, since loss of aux = safe gate-low state via driver UVLO — CB-10 must make that chain
real). Budget table (post-fix targets): 24 V: 30/60/120 kW = 26/32/55 W; 15 V (bias + iso feeds):
9/16/30 W; 3.3 V: 2 W. Aux must deliver ≥ 45/55/90 W peak (coil pull-in) → re-spec per CB-7 with
PWM-hold economization to halve steady demand. Standby <10 W target survives only with fans off,
relays open, display sleeping — restate as "idle, output disabled" in the spec sheet.

## K. Datasheet-compliance findings

This program runs on **behavioral/class-level part definitions with declared assumptions (A1–A9)**
— acceptable pre-RFQ, but this review formally converts the following into *blocking datasheet
verifications* (no fab release before closure): NSI6611 true pinout/CLAMP/DESAT network & input
termination (CB-12, HR-6); NCP1252-vs-alternative real pin functions (CB-5); HFE82V make/break/
carry ratings + mirror-contact variant (CB-8/HR-4, A5); GD32G553 pin map/BOOT0/VDDA topology
(CB-13, HR-11, A6); B1505S/bias C_io (HR-10); fan PWM VIH (MR-9); X1/Y1 cap series selection
(CB-1/MR-4); film cap DC-derating curves (HR-1/8).

## L. BOM & component-selection findings

Generated BOM is internally consistent with the schematic (that machinery works) — the failures
are *selection* failures now encoded in `parts-db.mjs`: X2-310 (CB-1), ELH-450 V on banks (CB-2),
HF115F-2Z (CB-8), PP-1u-900 on the bus (HR-1), COF-1100 (HR-8), LDM ₹38 (HR-9), CER-25W on 2512
(MR-1), plus the E23 schematic/BOM divergence (HR-10). Single-source customs (D1/D3) carry
drawings — OK. Lifecycle: all majors active (A-grade check at RFQ). **Action:** fix parts-db in
the same change-set as the schematic fixes so the BOM regenerates correctly (est. net BOM impact
of all fixes: ≈ +₹1.4 k / +₹2.1 k / +₹3.9 k — update R12 economics accordingly).

## M. Reference-design comparison

Against ST STDES-30KWVRECT / -30KWLLC / -60KWLLCWR and commercial module practice (NIUERA/UUGP class):

| Reference practice | This design | Verdict |
|---|---|---|
| Film commutation caps at every fast leg | LLC ✓ / **Vienna ✗ (CB-9)** | restore |
| Aux from wide-range dedicated supply w/ HV startup cell | half-bus feed, no startup cell (CB-5/6) | rework |
| Precharge bypass = power contactor / NTC+contactor | 8 A relay (CB-8) | rework |
| Phase/bipolar senses biased to VREF/2 | direct to ADC (CB-15) | restore |
| Secondary-side isolated V-sense | primary-referenced dividers (CB-3) | restore |
| SWD/boot straps + test pads always present | absent (CB-13) | restore |
| Miller-clamp pin tied per datasheet | floating (CB-12) | restore |
| External supervisor/watchdog on power stages | none (CB-10) | restore |
| X1/field-rated delta caps on 3-φ 480 V inputs | X2-310 (CB-1) | restore |
Justified deviations (kept): common-source Vienna pair w/ single driver; CT-based current sensing; JBS secondary; leakage-binned trim inductors; two-board sandwich (directive).

## N. Fault/stress matrix (delta rows added by this review; full legacy matrix in verification-matrix.md)

| Condition | Expected | Predicted as-drawn | Highest stress | Verdict |
|---|---|---|---|---|
| 475 VAC continuous | filter nominal | X2 caps beyond rating (CB-1) | CX* | **FAIL** |
| Bank at 525 V (hysteresis top) | normal | electrolytic OV (CB-2) | CBA/CBB | **FAIL** |
| Cold start @ 285–420 VAC | boot | aux never starts (CB-6) | — | **FAIL** |
| All relays + fans engaged, hot | hold | 24 V collapse (CB-7) | aux FET/xfmr | **FAIL** |
| First full-load minute | run | KPRE contacts weld/burn (CB-8) | KPRE | **FAIL** |
| Vienna hard turn-off @78 A | ≤75 % V_DS | clamp reference impossible w/o film caps (CB-9) | Q_pfc | **FAIL** |
| MCU held in reset, bus charged | safe idle | discharge resistors burn (CB-11) | RDIS | **FAIL** |
| MCU boot glitch on GATE_EN | gates off | floating EN (CB-10) | bridges | **FAIL** |
| Hipot 4 kV pri↔sec | <10 µA class | ~1 mA via OA/OB/OV (CB-3) | dividers | **FAIL** |
| Negative CT half-cycle | measured | ADC substrate injection (CB-15) | MCU | **FAIL** |
| Link frame exchange | CRC ok | TX contention (CB-14) | — | **FAIL** |
| Surge L-PE 2 kV | clamped | only 4.7 nF Y present (HR-7) | insulation | **FAIL** |
| Pre-insert @ ΔV=500 V (fault) | survive once | 94 J vs 50 J (HR-12) | RPREA/B | **FAIL (single-fault)** |
| Legacy matrix rows (grid/MC/FSM/S-P/DPT/aux-behavioral) | — | as previously reported | — | PASS at declared fidelity |

## O. Unverified assumptions / missing information (beyond A1–A9)

O-1 NSI6611 exact pinout & CLAMP/DESAT application network · O-2 driver input internal termination ·
O-3 flyback IC final selection (pin functions differ across "NCP1252-class") · O-4 HFE82V carry/break/
mirror-contact data · O-5 GD32 BOOT0/VDDA/NRST specifics · O-6 fan PWM input threshold · O-7 X1/Y1
series availability at 530/440 VAC in the chosen vendor · O-8 film-cap DC-life derating curves ·
O-9 bias-transformer C_io achievable · O-10 CT linearity at 150 A pk. Each is assigned to the
RFQ/datasheet gate (§K) — none may survive to fab.

## P. Layout-dependent follow-ups (flagged, not reviewed)

P-1 ≤10 nH Vienna loops **after CB-9 parts exist** (film cap at pins) · P-2 ≤15 nH LLC loops ·
P-3 AGND–DGND single-point star at ADC (after CB-4) · P-4 creepage per insulation-coordination.md
(esp. around the CB-3 replacement iso-sense parts and S/P matrix) · P-5 divider chain linear
spacing (surge) · P-6 CT apertures & busbar pass-through mechanics · P-7 Kelvin routing of shunt ·
P-8 gate-loop symmetry per §32 · P-9 bias-transformer winding separation (C_io) · P-10 SWD header
keep-outs · P-11 stud-pillar torque/current interfaces per busbar-drawings.md.

## Q. Production-readiness checklist

| Category | Verdict |
|---|---|
| Power topology & tank design | **PASS** |
| Magnetics D1–D3 | **PASS** (D4 rework; D5/D6 missing → **FAIL**) |
| Semiconductor stress (SiC, DPT-based) | **PASS** (conditional on CB-9 restoration) |
| Passive voltage ratings (X caps, bank caps, bus/output film) | **FAIL** (CB-1, CB-2, HR-1, HR-8) |
| Aux power block | **FAIL** (CB-5/6/7) |
| Precharge/discharge | **FAIL** (CB-8, CB-11; resistors/energy PASS) |
| Sensing front-ends | **FAIL** (CB-3, CB-4, CB-15; shunt path PASS) |
| Gate-drive channels | **FAIL** (CB-12; Rg/bias values PASS) |
| Enable/kill/watchdog protection chain | **FAIL** (CB-10) |
| Inter-board interconnect | **FAIL** (CB-14; power pillars PASS) |
| EMC schematic level | **WARNING** (HR-7 L-PE surge; DM/CM filter values PASS-est.) |
| Control loops & firmware logic | **PASS** (33/33; needs relay_fb resolution HR-4) |
| Manufacturing provisioning (program/test) | **FAIL** (CB-13, MR-1) |
| BOM machinery & traceability | **PASS** (selections per L to fix) |
| Isolation architecture | **FAIL** until CB-3 (concept otherwise PASS) |
| Documentation coherence | **WARNING** (HR-10, D5/D6, F.19) |
| Datasheet closure | **NOT VERIFIED** (§K gate defined) |

## R. Top remaining risks & required first-prototype tests

**Top 10 real-world failure modes (post-review ranking):** 1. X2 cap failure at 440–475 V sites (CB-1) · 2. bank electrolytic venting at 500–525 V outputs (CB-2) · 3. no-boot at ≤420 VAC (CB-6) · 4. KPRE burn at first load (CB-8) · 5. Vienna overshoot device loss without film caps (CB-9) · 6. discharge-resistor fire during programming (CB-11) · 7. gate-enable float glitch at boot (CB-10) · 8. hipot/leakage failure via sense dividers (CB-3) · 9. aux collapse under relay+fan load (CB-7) · 10. field intermittency from CT substrate injection (CB-15).

**Top 10 most-likely-overlooked (found here — the next reviewer's list):** driver CLAMP float · AGND tie · TX/RX crossover · FLT pull-ups · BOOT0 float · snubber/bleeder wattage · Y-cap class · pre-insert single-fault energy · NSI1200 single-ended use · T_INLET double-bias.

**Production blockers:** CB-1…CB-15 (§B) + HR-10/HR-9 drawings + §K datasheet gate.

**Pass-prototype-fail-production candidates:** film/electrolytic derating (HR-1/8, CB-2 at units that never see >450 V in bring-up), X2 at labs testing only at 400 V (CB-1), fan PWM threshold spread (MR-9), 74HC-series lot variation on display brightness, KPRE surviving *light-load* prototype testing (CB-8), relay coil economization absence cooking coils in hot enclosures.

**Month/year field-return candidates:** electrolytic ripple life at 60/120 kW bank duty, snubber/bleeder resistor thermal aging (HR-2/3), CM choke thermal at 220 A (verify at T-04), repeated pre-insertion cycles, CT clamp diode wear from injection (until CB-15 fixed).

**Mandatory first-prototype tests (beyond evt-plan.md T-01…T-10):** (i) cold-start matrix 285–475 VAC × bus-charged/discharged (CB-6 verification), (ii) programming-session thermal watch on discharge chain, (iii) filter-cap thermal soak at 475 VAC 48 h, (iv) hipot + leakage current *with sense chains fitted*, (v) KPRE thermography at rated current, (vi) gate-enable glitch capture through 1000 power cycles, (vii) CT front-end linearity ±150 A, (viii) aux load-dump: all relays pull-in + fans 100 % at 65 °C.

---

### Reviewer's closing statement

The converter *physics* of this platform is genuinely strong — the tank, the drive spec, the S/P
safety concept, the tolerance work and the firmware logic survived adversarial re-derivation.
What this review found is the classic failure pattern of simulation-first programs: **the blocks
that were modeled behaviorally, revised late (two-board split, bank-window change), or assumed
"standard" (aux, enables, sensing bias, filter ratings) are exactly where the fifteen blockers
live.** Every blocker has a concrete, low-cost fix (aggregate BOM impact ≈ +₹1.4–3.9 k/module,
well inside the existing R12 discussion). Fix CB-1…CB-15 + HR list, regenerate BOM/docs, close
the §K datasheet gate — *then* this design is ready to spend money on boards.


---

# Appendix — Fix log (schematic rev C, 2026-09-05)

Every item mapped to its implemented change. Evidence classes: **B** = six-board rebuild 0 netlist
errors; **S** = `spice/aux/aux-flyback.mjs` rev B (342/560/850 V PASS); **G** = source assertion in
`calculations/review-checks.mjs`; **D** = doc/drawing updated.

| Item | Resolution | Where | Evidence |
|---|---|---|---|
| CB-1 | X1 2.2 µF **530 VAC** delta caps; Y1 440 VAC | parts-db `CX*/CY*` | G/D |
| CB-2 | 2-series 450 V strings + midpoints + balance (E29) | boards `CBA*T/B`, `RBAL[TB][AB]` | B/G |
| CB-3 | bank/output senses → **IsoVSense** in-domain + iso 5 V bias (E25) | cells `IsoVSense`, boards OA/OB/OV | B/G |
| CB-4 | AGND–DGND 0 Ω tie per board + DGND→PE 1 MΩ∥4.7 nF | boards `RAGTA/RAGTB/RPET/CPET` | B/G |
| CB-5 | full flyback application: HV startup→VCC, aux-winding self-supply, FB divider, COMP, BR, RC-filtered CS, RCD clamp | cells `AuxPower` v3 | B/S/G |
| CB-6 | full-bus feed 342–860 V, 1700 V switch (E26) | `AuxPower dcp→DCP/dcn→DCN`, parts-db QAUX | S/G |
| CB-7 | 60 W stage (Lp 550 µH, Ip 1.8 A) + coil PWM-hold economization | D4 rev B + firmware-guide | S/D |
| CB-8 | 2× line-rated power relays w/ mirror (80/120/250 A per SKU) | boards `KPRE1/2`, skuOverrides | B/G |
| CB-9 | per-phase 1 µF/600 V films DCP–MID & MID–DCN | cells `ViennaPhase C*FP/C*FN` | B/G |
| CB-10 | SafetyChain per board: windowed WD + 3-in AND + pulldowns; PWM_KILL retired (E27) | cells `SafetyChain`, boards, pin maps | B/G |
| CB-11 | default-OFF isolated discharge (opto + DCN bias + 10 k pulldown) — E19 rev B | cells `DischargeCtl`, boards | B/G |
| CB-12 | driver CLAMP → gate on every channel | cells `DriverCh` | B/G |
| CB-13 | SWD header + BOOT0 strap + NRST cap per MCU | cells `SwdPort`, boards pin28/29/100 | B/G |
| CB-14 | link crossed in DC-DC net map + idle pullups | boards `InterconnectSignals id=B ltx/lrx` | B/G |
| CB-15 | AVMID (buffered VREF/2) bias for CT/burden returns + series R + dual clamps | cells `AnalogMid/CtSensor/LlcSection` | B/G |
| HR-1 | bus/bank film → 1100 V | parts-db `CF*/CB[AB]F` | G |
| HR-2 | LLC node snubbers **deleted** (E28 — corrected physics: C·V²·f) | cells `LlcHalfBridgeLeg` | B/G |
| HR-3 | clamp bleeder 470 Ω **5 W axial** | cells `R*C` chip + parts-db | B/G |
| HR-4 | mirror contacts + RELAY_FB_* to MCU pins (E30) | matrix + boards + firmware-guide | B/G |
| HR-5 | FLT pullups 4.7 k + 1 nF per board | boards `RFLT[AB]` | B/G |
| HR-6 | PWM 10 k pulldown per channel | cells `R*PD` | B/G |
| HR-7 | 3× MOV 550 VAC + GDT 3.5 kV L→PE | boards `MOVP*/GDT*` | B/G |
| HR-8 | output film → 1200 V | parts-db `COF*` | G |
| HR-9 | D6 drawing + per-SKU rated/priced DM chokes | magnetics.md D6, skuOverrides | D/G |
| HR-10 | bias = packaged modules in BOTH schematic & BOM; E23 → ECO-1 | parts-db `PS*`, biasCommon 0 | G/D |
| HR-11 | NRST cap + BOOT0 strap; WD per board doubles as supervisor | SwdPort/SafetyChain | B/G |
| HR-12 | pre-insertion R → SQP 25 W pulse axial + dwell cap note | matrix `RPREA/B` + parts-db | B/G |
| MR-1 | precharge/discharge R on axial footprints | boards `RPRE1/2`, `RDIS*` chips | B/G |
| MR-2 | T_INLET no longer crosses the harness (link telemetry instead) | interconnect.md rev C | D |
| MR-3 | anti-surge divider resistors + ADC sample-time note | parts-db + firmware-guide | G/D |
| MR-4 | Y1 440 VAC class | parts-db | G |
| MR-5 | KPRE-welded single fault: detect-at-t0 + accept residual — recorded | protection F.20 context (verification-matrix) | D |
| MR-6 | NSI1200 OUTN routed → software differential | cells `OutputShunt`, LLC pin 95 | B/G |
| MR-7 | VDDA/VREF+ ferrite + caps | cells `ControlMcu` | B/G |
| MR-8 | ULN spare inputs grounded | boards CoilDriver ins | B/G |
| MR-9 | fan p/n constrained to 3.3 V-PWM-compatible | parts-db/mech note | D |
| MR-10 | switch/display pinout VERIFY at BOM freeze | parts-db desc | D |

**Residual open (by nature, not omission):** §K datasheet verifications (O-1…O-10 + iso-amp
domain ratings + mirror-contact isolation), ECO-1 (E23 bias transformer), bench EVT T-01…T-18,
PCB layout follow-ups §P (layout re-opens later per directive).
