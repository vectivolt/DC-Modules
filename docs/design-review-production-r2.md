# Production-Readiness Design Review R2 — Independent Re-Audit of Schematic Rev C 🔎

**Date:** 2026-09-05 · **Target:** schematic rev C (cells v3 / boards v3 / parts-db rev C — the
state that closed all 15 blockers of `design-review-production.md`).
**Scope:** complete schematic set (6 boards), BOM/parts-db, calculations, simulations, protection
architecture, magnetics drawings, docs coherence. **Excluded:** PCB placement/routing/stack-up
(layout dependencies flagged in §P only, per standing directive).
**Method:** every claim verified against source (`cells.tsx` v3, `boards.tsx` v3, `parts-db.mjs`
rev C), the built netlists (`boards/*/out/*-netlist.txt`, `dist/boards/*/*/circuit.json`), the
generated D-drawings and the executed simulation set — never against the documentation's claims
about itself. All arithmetic below re-derived independently (§F).

**Reviewer stance:** hostile, as before. The rev C fix set and its closure gate
(`review-checks.mjs`, 31/31 PASS) were treated as *evidence about the 15 old defects only*. The
gate is a set of inverted greps — it proves the old defects stayed fixed, and proves nothing about
defects the first review did not find, or defects the fixes themselves introduced. Both kinds
exist.

---

## A. Executive conclusion

> ## Production-ready: **NO**
> **Confidence: HIGH** — every blocker below is verified in schematic source or built netlist, or by arithmetic shown in §F from the design's own frozen numbers (D2/D3/D4 drawings, E-register, protection table). None is speculative.
>
> The rev C closure was real work and most of it is verified good here (§M lists 20+ fixes that re-check clean, including several I attacked hard: link crossover, discharge default-OFF, E27 boot-float behavior, X-cap bleed via the sense star). But the re-audit finds **7 new critical blockers and 8 high-risk items**, concentrated in exactly the pattern the first review warned about: blocks that were *revised* under review pressure (aux, sensing front-ends, safety chain) and blocks that were *never re-swept after SKU scaling* (aux budget, pulse energies, timings, EMI-filter copper, fans, paralleled relays).

Major reasons, one line each:

1. The **resonant-current front-end is mis-scaled ~15×**: 46 A rms through a 1:100 CT into a 33 Ω burden = 15 V rms at a 3.3 V ADC front-end and 7 W in a 0.25 W resistor — measurement, resonant OCP (F.11) and the burden resistor itself are all destroyed at first full load.
2. The **DC-DC board has no 3.3 V supply at all** — the net `V3P3` on that board has ~30 consumers (MCU-LLC, safety chain B, CAN, HMI, iso-amp outputs) and zero sources; the interconnect spec promised a "local 3.3 LDO there" that was never drawn.
3. The 3.3 V architecture that *does* exist (AMS1117 SOT-223 fed from 15 V) dissipates **2.9–4.1 W at 30 kW** — thermal-shutdown territory even at bench idle.
4. All three **aux flyback output rectifiers are 100 V parts seeing 130–199 V PIV** (from the design's own D4 rev B turns ratios) — they avalanche at high line; a 342 V bench bring-up won't see it.
5. The frozen **60 W aux stage cannot carry the 60/120 kW load** it must feed (≈50 W available vs ≈45–55 W at 60 kW and ≈70–95 W at 120 kW) — CB-7 was closed for the 30 kW case only.
6. **`FLT_LLC` lands on no MCU pin** — every LLC driver fault/DESAT event is invisible to MCU-LLC; the bridge keeps clocking asymmetrically into a transformer while one leg is soft-off (flux-walk → saturation, with F.11 also dead per item 1).
7. The **LLC tank as drawn is the rev-D tank, not the frozen/Monte-Carlo-validated rev-D2 tank** (176 nF + fixed 4.3 µH trim vs 185.4 nF + binned trim): the §37 yield fix — the most-engineered value chain in the design — is not implemented in schematic or BOM.

And the structural finding: **the closure gate has no regression breadth.** `review-checks.mjs`
asserts the 15 old fixes and nothing else; five of the seven new blockers were introduced or left
exposed *by* rev C changes and are invisible to it. §Q includes a required gate extension.

---

## B. Critical production blockers (7 new — numbering continues from R1's CB-15)

> Format: **Location · Component/Net · Problem → Why → Failure scenario → Evidence/calc → Fix → Severity**

### CB-16 · DC-DC board, every `LlcSection` · resonant CT burden `R{n}CT` = 33 Ω — front-end mis-scaled ~15×
Design resonant current is **46 A rms / ~65 A pk** per section (D2: "Irms 46 A"; D3 primary 45.6 A rms; sim 42.3 A). CT 1:100 → 0.46 A rms secondary into the drawn 33 Ω burden = **15.2 V rms (±21 V pk)** superimposed on the 1.65 V AVMID bias, and **P = 0.46²·33 = 7.0 W in a 0.25 W 1206** (28×) — the burden resistor burns open within seconds at load, after which the CT secondary is open (unclamped kV-class CT voltage). Before it burns: the ADC clamp diodes conduct most of every cycle (≈5 mA/channel average pumped *into* the 3.3 V rail through `D{n}CP` — up to ~60 mA at 120 kW, enough to pump up a lightly-loaded rail the LDO cannot sink), the I_RES measurement is meaningless, and **F.11 (resonant OC, 70 A pk) can never be represented**: 70 A pk × 0.33 V/A = 23.1 V equivalent at a comparator whose window ends at 3.3 V. The 33 Ω value is correct for the **line** CTs (1:2500 → 0.79 V/55 A ✓) and was blanket-pasted onto the resonant family; `magnetics.md` line "0.33 V/A-primary·(1/100)·…" literally trails off mid-calculation, and `firmware-guide.md` hard-codes N=100 with the same 33 Ω. *Fix:* resonant burden **2.0 Ω 1 W 2512** (0.46 A → 0.92 V rms, ±1.3 V pk ✓; F.11 at 70 A pk → 1.40 V above AVMID = 3.05 V at the comparator ✓; P = 0.42 W ✓); update parts-db (separate pattern from `R\w+B$`), firmware scale constant, and add the value assert to the gate. **Severity: CRITICAL** (protection + measurement + a burning resistor, on every SKU).

### CB-17 · DC-DC board · `net.V3P3` — no 3.3 V source exists on the board
Verified in source and built netlist: DC-DC `V3P3` members are all consumers — `ULLC` VDD pins 11/27, six-to-24 driver `VIA` pins, `USR1` (HMI), `UCAN` VDD1, `USHO`/`UIV*` VDD2, `UAVB`, `UAND B`/`USUPB`, every pull-up — and **nothing generates the rail**: `AuxPower` (which contains the only `U3V3`) is instantiated on the AC-DC board only, and the 16-way harness carries V24/V15/GND but **no 3.3 V pin**. `interconnect.md` §harness even specifies "+15 V | bias/logic feed for DC-DC board (**local 3.3 LDO there**)" — the LDO was never drawn. As built, MCU-LLC never boots: no LLC control, no CAN, no HMI, no safety chain B logic supply (gates stay disabled — safe, but the module is a brick). ERC can't see it (the net is well-populated), and the review gate doesn't check rail sourcing. *Fix:* add a 3.3 V regulator cell on the DC-DC board fed from V15 (see CB-18 for what kind), or add a fused 3.3 V harness pair (worse: IR drop + 1 A-class contacts). One cell + one instantiation. **Severity: CRITICAL (total functional failure of half the module; trivially found at T-00, but T-00 is after fab).**

### CB-18 · both boards · `U3V3` = AMS1117-3.3 (SOT-223) fed from 15 V — 2.9–4.1 W linear dissipation
3.3 V load at 30 kW AC-DC ≈ 0.25–0.35 A (MCU ~130 mA, 9× driver VIA, 5 iso-amp VDD2, AVMID, logic, pull-ups); P = (15 − 3.3) × I = **2.9–4.1 W** in a SOT-223 whose realistic θja (~60–90 K/W on a practical pour) gives **ΔT ≈ +175–370 K** → thermal shutdown at bench idle, guaranteed at 55 °C ambient. At 120 kW the combined-board 3.3 V load approaches 0.6–0.9 A → up to ~10 W — not a linear-regulator problem at all. The DC-DC regulator that CB-17 adds has the same math. *Fix:* per board, a small 15 V→3.3 V sync buck (MP2451/TPS54202 class, ~₹15, 2 passives + L) or add a 5 V secondary to D4 and LDO from 5 V (adds a winding — buck is cheaper). Update D4/aux budget accordingly. **Severity: CRITICAL** (control plane brown-out/cycling under exactly the conditions — warm enclosure, full driver load — that bench bring-up at 25 °C partially masks).

### CB-19 · AC-DC board, aux block · `DAUX24`/`DAUX15`/`DAUXVC` = SS310 (100 V Schottky) at 130–199 V PIV
From the design's own D4 rev B turns sheet (Np 59, N24 12, N15 8, Naux 8) at V_bus,max = 860 V:
D24 PIV = 24 + 860·(12/59) = **199 V**; D15 = 15 + 860·(8/59) = **132 V**; DVC = ~14 + 860·(8/59) = **130 V** — all *before* the un-snubbed secondary leakage spike (+20–40 %, → ~250 V on D24). The specified SS310 is a **100 V** part: it avalanches on the first switching cycle at high bus. The killer property: at a 342–560 V bench feed, D24 sees 94–139 V — SS310 *survives or marginally avalanches* at low line, so bring-up passes and every unit dies (aux short → module dead, possibly QAUX with it) the first time the bus commands 800+ V. *Fix:* D24 → 300 V ultrafast (ES3F/US3M class, SMC for the 1.8 A pull-in case); D15/DVC → 200–300 V (ES2G/US2J); add small RC across D24 if ring exceeds 300 V at T-09. Update parts-db + aux sim diode models. **Severity: CRITICAL (fleet-wide latent failure with a bench-invisible signature — the classic kind).**

### CB-20 · aux stage sizing vs SKU (E26/CB-7 re-opened) · 60 W stage vs ≈50/≈90 W demand at 60/120 kW
The rev C aux was validated at a **fixed 54 W** (24 V: 0.5→1.8 A step + 15 V: 0.8 A = 12 W — that V15 figure is hard-coded as `RL15 18.75` in `aux-flyback.mjs`). The real V15 load *scales with channel count*: each QA01C gate-bias module draws ~0.7–0.95 W input (LLC channel: Qg·22 V·140 kHz ≈ 0.6 W + driver secondary quiescent, ÷η)... at 120 kW that is **36 modules ≈ 26–34 W**, plus 6–7 iso-5 V modules, the opto bias, and both 3.3 V regulators' input power (CB-17/18) → V15 ≈ **36–44 W**; V24 adds 4 fans (24–44 W) + economized coils (~8 W incl. the qtyMul-2 relay pairs) → **total ≈ 70–95 W steady, ~100 W+ at pull-in**, against a stage whose DCM ceiling is ½·550 µH·1.8²·65 kHz = **57.9 W throughput (≈50–54 W deliverable, less at Lp/f tolerance corners)**. 60 kW sits at ≈40–53 W demand — zero margin at the hot corner; the design's own §J budget line ("aux must deliver ≥45/55/90 W peak") already exceeded the frozen 60 W at 120 kW when E26 was written. Symptom: 24 V sags at relay pull-in with fans at speed → relays drop → cascade — the exact CB-7 failure, now SKU-shaped. *Fix:* size the aux per SKU (e.g., common ETD34/39 design at Ip 2.6 A / Lp 380 µH / CS 0.38 Ω → ~128 W ceiling, one p/n, cost +₹40–60), or keep 60 W for 30 kW and fit a second stage / dedicated fan supply at 60/120 kW; then re-run the aux deck with a **per-SKU V15+V24 load model** (not 18.75 Ω), and re-check D4 core/Bpk at the new Ip. **Severity: CRITICAL for 120 kW, HIGH for 60 kW, PASS for 30 kW.**

### CB-21 · DC-DC board · `net.FLT_LLC` — driver fault wire-OR lands on no MCU pin
Verified in source and netlist: `FLT_LLC` connects the 6–24 LLC driver `FLT` outputs and the rev-C pull-up `RFLTB`/`CFLTB` — and **appears nowhere in `llcPins`**; MCU-LLC has no fault input. (The AC-DC twin is correct: `FLT_PFC` → pin 74.) Consequence chain: any LLC DESAT/UVLO event soft-offs *one channel locally* while MCU-LLC — blind — keeps clocking the other legs and the PFM loop compensates; the affected section's transformer sees asymmetric volt-seconds → flux-walk toward saturation → primary current runaway on a leg whose resonant OCP is *also* dead (CB-16). F.12/F.02-class latching, the firmware-guide contract ("firmware sees it as F.32 on the FLT path"), and fault-snapshot capture are all unimplementable on the LLC side. *Fix:* one line — add `["net.FLT_LLC", 75]` (or any free pin) to `llcPins` — plus the firmware latch mapping. Add "every FLT net reaches an MCU pin" to the gate. **Severity: CRITICAL (a wire; but its absence disables the LLC hardware-fault layer, compounding CB-16).**

### CB-22 · DC-DC board · LLC tank as drawn = rev D, not the frozen rev D2 (E7) that Monte-Carlo validated
Drawn/priced: Cr = 4×**44 nF** = 176 nF (`cells.tsx` literal + mpn `PP-44n-1200` — whose *description* says "46 nF") and trim = **single-value 4.3 µH ±5 %** (`IND-TRIM-4u3`). Frozen E7 rev D2 and everything downstream of §37 (MC yield 0.01 % fail, capability 1.39 vs requirement 1.36, EOL gain-cal, the re-run LLC op-point deck) use **Cr 185.4 nF (4×46 nF ±5 %) + Lr 7.0 µH via *binned* trim (D2 rev B: 3.3/3.65/4.0/4.35 µH ±3 % selected against measured transformer leakage)**. The drawn combination lands on fr ≈ 140.5 kHz (coincidentally fine) but with Z0 +4.7 % and Ln −4 % — and the whole point of rev D2 was that the yield margin is only **1.39/1.36 = +2.2 %**: the drawn tank re-spends more than the margin the MC iteration bought, and the *binning mechanism itself* (4 bin p/ns + kitting rule, DFM step 3 depends on it) does not exist in the BOM — one fixed 4.3 µH part is priced. This is the HR-10 failure mode (schematic/BOM diverging from the frozen decision) on the design's most-engineered value chain. *Fix:* cells → 46 nF; parts-db → `PP-46n-1200` + four `IND-TRIM-*` bin lines (or one line with bin note the winder can execute); align D3 note (Lm 65 vs E7's 63 µH — pick one); add literal-value asserts for Cr/trim/Lm to the gate; re-state D2's "Lr(total) 7.3 µH" acceptance vs E7's 7.0 (one of them is stale — resolve, don't average). **Severity: CRITICAL as a frozen-decision integrity failure** (bench nominal will pass; tolerance-corner units will re-fail §37 exactly as rev A did).

---

## C. High-risk issues (8 new)

| # | Location · item | Problem / evidence | Fix |
|---|---|---|---|
| HR-13 | `SafetyChain` · `USUP{A,B}` watchdog | Symbol is a 3-pin SOT-23 (WDI/GND/WDO) — **no VDD, no window-set pins**. TPS3430 (the priced part) is SOT-23-**6** (VDD, GND, WDI, WDO, SET0/1 or CWD/RST). As drawn the safety chain's centerpiece is unpowered and its window undefined; footprint mismatch also stops SMT. The `CSF` 100 nF sits orphaned beside it | Redraw 6-pin: VDD→V3P3 + 100 nF, SET pins per 10 ms window (F.32), WDO open-drain → existing 10 k pull-up. Add to gate |
| HR-14 | Precharge/discharge timing + pulse energy vs SKU | All constants are 30 kW-derived and SKU-invariant while C scales ×1.8/×3.6: **precharge t95 ≈ 160/288/576 ms vs F.20's fixed 400 ms abort** (120 kW false-aborts every start; 60 kW marginal at low line/cold); **discharge to <60 V ≈ 2.0/3.6/7.2 s vs F.21's 4 s and EOL's 2.5 s** (false discharge-fail at 120 kW); pulse energy per resistor ≈ 133/239/**477 J** (precharge) and 106/191/**382 J** (discharge) on one 25 W ceramic p/n with no SKU override — beyond typical 25 W-class single-pulse capability at 120 kW | Scale per SKU: firmware constants (F.20/F.21) from a per-SKU table; resistors → 2× parallel network at 120 kW (or per-SKU p/n in skuOverrides like the relays got); re-state EOL step 5 windows per SKU; T-05 per SKU |
| HR-15 | Bank energy after shutdown · no bank discharge function | Active discharge exists for the **bus only**. Banks (≤525 V, 470–1880 µF each) bleed solely through the 200 k balance chains: **τ = 94–376 s → 3.4–13.6 min to <60 V**. The §47 checklist line "touch-discharge: bus <60 V in ≤2 s" silently excludes the banks; T-12-style service and any enclosure access meet charged banks minutes after off | Decide explicitly: (a) commanded bank bleed (e.g., FET + 4×2.2 k chain per bank, reuse `DischargeCtl` pattern, ~₹150), or (b) LLC pre-discharge into the bus is impossible (unidirectional) — so if passive-only, add the 62477 label/tool-access route *and* re-write the checklist honestly; F.21 should supervise banks too |
| HR-16 | `Bias5Module` = B1505S-2WR2 (1.5 kVDC test, functional grade) as the mains/bus/output→SELV **bias barrier** | E25 made the control domain SELV; the AMC1311/1350 signal path is reinforced (5 kVrms) but each domain's **bias feed crosses the same barrier through a 1.5 kV uncertified module** (PS5AC bridges SELV↔AC mains star; PS5BUS↔DCN at 830 V; PS5BKA/B/PSSH↔1000 V-class output domain). `insulation-coordination.md` rev C itself requires these modules "reinforced-rated for their domain's working voltage" — the priced part cannot meet its own requirement (1.5 kV test ≈ no margin over 1 kV working, no reinforced cert) | Replace all six positions with reinforced-rated 15→5 V parts (MORNSUN QA/URB-D/G-series ≥4 kV test with cert, ~+₹30–60/pos); same audit for the 36 QA01C gate-bias positions (their barrier parallels NSI6611's reinforced one) and PSQD; make it a named §K line with the required certificate class, not a generic "verify" |
| HR-17 | 120 kW fans · 4 fans, 2 headers, dead harness pins | Thermal architecture and mechLines say **4 fans at 120 kW**; the AC-DC board instantiates exactly 2 `FanPort`s at every SKU, the pin map has FAN_PWM/TACH 1–2 only, and the harness pins reserved for "120 kW rear fans" (11/12 FPWM/FTACH) are **unwired in rev C** `InterconnectSignals`. Y-cabling two fans per header leaves 2 of 4 tachs invisible → F.25 blind to half the cooling, at the SKU with the least thermal margin | Parameterize `FanPort` count by SKU (4 headers at 120 kW; pins 76–79 + 2 more GPIO exist), or wire pins 11/12 through to 2 DC-DC-mounted headers; either way every fan gets a monitored tach |
| HR-18 | `CMC1/2` CM chokes · not per-SKU; copper melts at 120 kW; filter losses unbudgeted | One p/n family-wide; the D-spec winding (4/6/8 mm² at 55/110/220 A) runs at **13.8/18.3/27.5 A/mm²** → ≈ 9.7/26/**77 W per phase-winding** (≈29/77/**231 W per choke**) — a fire at 120 kW, a hotspot at 60. None of this (nor the LDM ≈9 W×3) appears in `loss-budget.csv` ("PFC magnetics" = the 3 D1 chokes only), so η claims are ~0.2–0.4 pt optimistic | Give the CM chokes the D6 treatment: per-SKU drawing (foil/busbar winding at 60/120 kW, ΔT acceptance), skuOverride pricing, and an EMI-filter line in the loss budget; re-emit η table |
| HR-19 | 120 kW S/P relays · `qtyMul: 2` phantom parallel relays | The architecture and skuOverrides say 2×200 A paralleled for KOUT/KSER/KPARA/KPARB at 120 kW — but qtyMul only doubles the BOM count. **No second schematic instance exists**: no coil wiring (paralleled coils would push one ULN channel to ~500 mA at pull-in), no mirror readback for the second contact, no sharing provision (unballasted paralleled contacts at 400 A: worst-case ~65/35 split → 260 A on a 200 A contact) | Instantiate the pair at 120 kW (parameterize `SeriesParallelRelayMatrix`), each coil on its own ULN channel, mirrors ANDed or separately read; specify contact-resistance-matched pairs or derate to 250 A-class contacts; this is HR-10's lesson — BOM≠schematic is never a multiplier |
| HR-20 | Bus balance / star resistors · continuous stress on single 2512s | `RBALT/RBALB` (100 k across each 415 V half-bus): **1.72 W continuous** and 415 VDC on one 2512 — the 3 W p/n survives on paper but sits at ~+100–150 K self-heat 24/7 with no HV type specified (the db's HV pattern covers only RAUXST/RBR/RCLA); `RNS1–3` (artificial star): 0.91 W and 302 Vrms each. Long-term drift/open here = midpoint imbalance (F.06) or dead AC sensing | 2-series 2512 per position (halves V and W per element, ~₹2), explicit HV/anti-surge series in the db; same doubling for bank balancers (0.69 W/262 V — warm but passable) |

## D. Medium-risk issues (15 new)

| # | Item | Problem | Fix |
|---|---|---|---|
| MR-11 | `AnalogMid` buffer | TLV9061-class op-amp driving **10 µF directly** — unity-gain follower into 100× its rated cap load ⇒ oscillation; every bipolar measurement rides on AVMID | 1–4.7 Ω isolation R with DC feedback after it (dual-feedback), or cap-load-stable buffer; verify with the CT front-end SPICE |
| MR-12 | MCU mpn `GD32G553RET6` | **R = LQFP64** in GD32 nomenclature; symbol/pin map is LQFP100 (VET6) — BOM orders the wrong package | mpn → GD32G553VET6 (subject to A6); add to §K |
| MR-13 | `UAUX` mpn UCC28C43 vs drawn application | UCC28C43 has **RT/CT (undrawn ⇒ no oscillator) and no BR pin**; the drawn circuit (VCC startup-Rs, BO pin, fixed 65 kHz) *is* the NCP1252B65 application — primary and alt are swapped | mpn → NCP1252B65; keep UCC28C43 only with an RT/CT + external-BO rework note |
| MR-14 | Harness current at 120 kW | JST PHD contacts ≈ 1 A: V15 ≈ 1.9 A and GND return (V24+V15) ≈ 2.2–3.2 A over 2 pins each → up to 1.6 A/contact | Assign spares 14/15 as GND, uprate to 2 A-class contacts (PHDR/Micro-Fit), or move DC-DC bias load down (CB-20 fix interacts) |
| MR-15 | Bank string balance vs electrolytic leakage | 2.6 mA balance current vs 450 V snap-in leakage that can reach mA-class per parallel group at 85–105 °C — string midpoint can walk toward >450 V on the leakier half over months | Recompute with vendor leakage-vs-T; likely 47 k/3 W per position (+0.8 W/bank), or accept with EVT leakage-matching evidence |
| MR-16 | LLC gate resistors `R{n}ON` 1206 | ~0.2 W dissipation (Qg ≈ 200 nC × 22 V × 140 kHz, on-edge share) on a 0.25 W part = 80 % | Specify 0.5 W-rated 1206 (or 2×0805); PFC side fine |
| MR-17 | Aux rails have no OVP | FB/upper-divider single fault (RFB1 open) → max duty → V24→~30 V+ (fans, coils) and V15→~20 V (QA01C max input!) — cascade destroys the entire bias/driver population | SMBJ26A on V24, SMBJ16A on V15 (₹8 total); IC VCC-OVP per O-3 is not a substitute |
| MR-18 | F.03/F.13 "<10 µs" HW OVP latency claims | The 10 nF/6.8 k divider filter in `IsoVSense` = τ 68 µs + AMC1311 BW → real path ≈ 100–200 µs. Physically consequence-free (dV/dt at OVP is slow) but the protection table is wrong as written and T-06 would "fail" it | Reduce C{n}DF to 1 nF on OVP-participating channels or re-state the table latencies honestly |
| MR-19 | Vienna clamp bleeder margin | 4.3 W worst on 5 W axial = 86 % — wirewound surface >200 °C sustained at the 330 V corner | 2× 240 Ω 5 W series (or 10 W part); it's 3 resistors/SKU-lane |
| MR-20 | `KPRE1/2` coils at 120 kW | Two 250 A-class relay coils (~250 mA each at 24 V) on **one** ULN channel ≈ 500 mA = the channel limit before derating | Split across two ULN inputs (7 spare) with one GPIO; or PWM-hold earlier |
| MR-21 | OT coverage at 60/120 kW | One NTC per zone total (T_XFMR = 1 sensor for up to 12 transformers, T_LLC for 24 legs) — a failing unit 3 boards away from the sensor is unprotected; §24's "all temperature zones" overstates | Either accept + document (delete the claim), or per-channel NTC mux (GD32 has ADC headroom; +₹60 at 120 kW) |
| MR-22 | HMI buttons ESD | Panel-actuated buttons wire straight to MCU pins 93/94 (10 k pull-up only) — contact-discharge path to the MCU | 1 k series + 100 nF (or TVS array) at SW1/SW2 |
| MR-23 | `QAUX` 1700 V SiC "TO-220" | 1700 V SiC in genuine TO-220 is a thin market (most are TO-247/TO-263-7); creepage across TO-220 pins at 860 V + clamp is also marginal | Footprint to TO-247 (fits either), part per §K |
| MR-24 | Resonant Cr film AC stress | ~300 Vrms at 140 kHz across each 1200 VDC PP cap — near typical PP corona/thermal limits at that frequency | Add Vrms@f to the §K film-cap line (O-8); Faratronic pulse-grade curve check |
| MR-25 | KPRE contact insulation class | HF167F-class relays are 277/480 VAC parts; across-open-contact sees up to ~660 V pk during the precharge transient and 475 VAC system spacing applies | Confirm contact-gap withstand + insulation group in the §K relay line (alongside the HFE82V items) |

## E. Low-risk improvements

Local 100 k pulldown on each board's **own** EN input to the AND (currently only the *remote* EN has one — boot-float today is saved by the remote pulldown + WD, but a floating CMOS input on a safety gate is poor hygiene) · `QAUX` gate 100 k pulldown for the multi-second VCC-charge window · CGND↔DGND 1 MΩ ∥ 4.7 nF static bleed on the floating CAN domain · ground harness spares 14/15 (also solves MR-14 partially) · the promised CB-14 series 100 Ω on LINK_TX/RX were never fitted (pull-ups only) · V24/V15 divider taps to spare ADC pins (rails are currently invisible to firmware; T-00 measures what the product then never can) · `QDIS` tab stud (TAB-M4) — FET tab is at drain potential up to 850 V; isolated-mount note before someone bonds it to PE · standby arithmetic: passive drain (balancers 3.4 W + startup/BR 0.8 W + dividers ~1 W) + aux idle ≈ 11–13 W vs the <10 W spec — restate or thin the balancers (interacts with HR-15/CB-11) · doc drift: `architecture.md` still carries the rev-B tank (178 nF/4.3 µH/65 µH) and single-aux text, `interconnect.md` still contains the stale pre-rev-C E19 "pull-up to V15" paragraph above its own rev-C correction, `insulation-coordination.md` says "Y2" where rev C fitted Y1, D3 says Lm 65 vs E7's 63 µH · `mcu-pinmap.csv` is the pre-E18 version (shunt+NSI1200 phase sensing, PA14/PA15 link = SWD pins) — regenerate at A6 or delete to stop it misleading.

---

## F. Key verification calculations (all independently re-derived)

1. **Resonant burden (CB-16):** 46 A rms /100 × 33 Ω = **15.2 V rms**; P = 0.46² × 33 = **7.0 W** (0.25 W part). F.11: 70 A pk → 23.1 V-equivalent vs 3.3 V window. Required burden ≤ 1.65 V/0.70 A = **2.36 Ω** → 2.0 Ω: 0.92 V rms, 0.42 W, F.11 at 3.05 V ✓.
2. **DC-DC 3.3 V (CB-17):** netlist `V3P3` member list = consumers only; harness = V24/V15/GND; `U3V3` on AC-DC only. Zero-source net.
3. **LDO dissipation (CB-18):** (15 − 3.3) V × 0.25–0.35 A = **2.9–4.1 W**; SOT-223 at 60–90 K/W → +175–370 K. At 120 kW combined ≈ 0.6–0.9 A → 7–10.5 W.
4. **Aux diode PIV (CB-19):** D24 = 24 + 860×12/59 = **199 V**; D15 = 15 + 860×8/59 = **132 V**; DVC ≈ 14 + 117 = **130 V**; all on 100 V parts, pre-spike.
5. **Aux ceiling vs demand (CB-20):** ½·550 µ·1.8²·65 k = **57.9 W** throughput (≈50–54 W out; tolerance corner ≈47 W). Demand (steady, hot): 30 kW ≈ 27–42 W ✓ · 60 kW ≈ 40–53 W (≈0 margin) · 120 kW ≈ **70–95 W** ✗. V15 alone at 120 kW: 36 gate modules × 0.7–0.95 W + 7 iso modules + 2 bucks ≈ 36–44 W vs the 12 W the sim modeled.
6. **Tank divergence (CB-22):** drawn 176 nF + 7.3 µH → fr 140.5 kHz, Z0 = 6.44 Ω (+4.7 % vs 6.15), Ln = 63/7.3 = 8.63 (−4 %); MC-validated margin = 1.39/1.36 = **+2.2 %** — consumed by the parameter shift before component tolerances even apply.
7. **Precharge scaling (HR-14):** C_eq = 1.175/2.115/4.23 mF; E@475 VAC (672 V pk) = ½CV² = 265/477/**955 J** total → 133/239/**477 J per resistor**; t95 (scaled from the executed 160 ms run) ≈ 160/288/**576 ms** vs F.20 = 400 ms fixed.
8. **Discharge scaling (HR-14):** t(<60 V) = ln(850/60)·640·C = **2.0/3.6/7.2 s** vs F.21 = 4 s, EOL = 2.5 s; per-resistor 106/191/**382 J**.
9. **Bank bleed (HR-15):** τ = 200 k×C_bank = 94 s (30 kW, 470 µF) → 204 s to 60 V from 525; 120 kW (1880 µF) → 376 s → **816 s**.
10. **CM choke copper (HR-18):** mean turn ≈ 92 mm → R ≈ 3.2/2.1/1.6 mΩ per winding → per choke ≈ **29/77/231 W**; J = 13.8/18.3/**27.5 A/mm²**.
11. **Balance/star resistors (HR-20):** 415²/100 k = **1.72 W**; 302²/100 k = **0.91 W** — continuous, single 2512 each.
12. **Line CT front-end sanity (unchanged-good):** 55 A rms → 0.73 V rms; F.01 at 105 A pk → 1.39 V above AVMID = 3.04 V pin ✓ inside rail with clamp margin — the CB-15 fix *works* for the 1:2500 family, which is what made the 1:100 copy-through invisible.
13. **Aux clamp (good):** Vc ≈ √(½Llk·Ip²·f·R) ≈ 230 V on 1200 V parts; startup Rs 0.77 W max on 2× HV 2512 ✓; BR divider ratio 178.8:1 → 330 V brown-in at a 1.85 V threshold — consistent with NCP1252-class (supports MR-13).
14. **OVP latency (MR-18):** 6.8 k ∥ 3.81 M × 10 nF → τ = 68 µs; ≈150 µs to comparator vs "<10 µs" table claim; bus dV/dt at trip ≈ 18 V/ms → overshoot ≈ 2–3 V (benign, but the table is wrong).

## G. Simulation findings (and their blind spots, round 2)

Executed set re-inventoried (all preserved, all genuinely run): DPT 26 cases, loops, averaged
line-cycle, LLC op-points **at rev D2 values** (185.4 nF — not the drawn 176 nF: the validated
tank and the drawn tank differ, CB-22), S/P mismatch, envelope grid 3024 pts, MC 6 batches, aux
rev B 342/560/850 V, LISN estimate, FSM 26 + C-suite 33/33. **New blind spots demonstrated:**
(a) the aux deck's V15 load is a fixed 18.75 Ω — the one load that scales with SKU (CB-20);
(b) the aux deck's ideal-diode models (`DSCH` N=1.05) have no PIV — CB-19 was invisible;
(c) no deck ever exercised the resonant *sensing* chain (CB-16) — sims probe tank current
directly; (d) precharge/discharge runs exist for 30 kW only (HR-14). **Required additions before
fab:** aux rev C deck with per-SKU load tables + real diode PIV + rectifier models; CT front-end
deck (burden + AVMID buffer stability, MR-11); precharge/discharge at all three C values against
the F.20/F.21 constants; LLC op-point re-run at the *as-drawn* tank or (better) fix CB-22 and
keep the D2 deck authoritative.

## H. Thermal findings

New heat sources the budget must absorb or the design must remove: U3V3 linear losses (CB-18 —
remove via buck), resonant burdens 7 W×3–12 (CB-16 — removed by re-scaling to 0.4 W×n), CM choke
copper 58/154/**462 W** per module pair (HR-18 — must be re-wound, not budgeted), LDM ≈26 W/module
unbudgeted, RNS/RBAL ~5 W standing, aux stage at the true 60/120 kW load (η 0.82 → 12–20 W
dissipated, TO-220 + clamp resistors). Post-fix, `loss-budget.mjs` needs an EMI-filter line and an
aux line per SKU; η headline drops ~0.15–0.35 pt at 30 kW pending HR-18's re-wind. Existing semi
budgets (Tj ≤ 139 °C grid-wide) stand — nothing in this review touches the power-path device math.

## I. Magnetics findings

D1/D3/D4-revB internally consistent (D4 DCM proof and Bpk 0.22 T re-checked ✓). **D2 is the
problem child:** its rev-B text simultaneously states bins ±3 % for a 7.0 µH rev-D2 tank *and* an
Lr(total) = 7.3 µH ±3 % acceptance — while the BOM prices the old single-value 4.3 µH ±5 % part
(CB-22). CM chokes need a real drawing with per-SKU windings and thermal acceptance (HR-18); D6
(LDM) is good and is the template. Aux transformer must be re-sheeted if CB-20 changes Ip/Lp.
CT-RES needs its burden spec finished (the "…" in magnetics.md) — 2.0 Ω, and the EOL cal note
updated.

## J. Power budget & power tree

Boot chain re-verified: HV → startup Rs → VCC → aux → V15/V24 → (3.3 V…CB-17/18) → MCUs → EN
chain — sound *once CB-17/18 exist*. The tree's single structural weakness remains the single aux
feeding both boards (accepted, driver-UVLO fail-safe ✓ — and now actually wired, E27 verified).
Budget table this review derives (steady, hot, worst — replaces §J of R1):

| Rail | 30 kW | 60 kW | 120 kW | Provisioned |
|---|---|---|---|---|
| V24 (fans+coils econ.) | 14–24 W | 16–26 W | 31–53 W | — |
| V15 (gate + iso modules + 3V3 bucks) | 13–18 W | 23–27 W | 36–44 W | — |
| **Total demand** | **27–42 W** | **40–53 W** | **70–95 W** | **≈50–54 W (E26)** |

Verdict: 30 kW ✓ · 60 kW marginal (fails at pull-in + hot) · 120 kW ✗ (CB-20).

## K. Datasheet-compliance findings

§K gate of R1 stands; this review **adds as blocking**: aux rectifier PIV class (CB-19 — no longer
a "verify", a re-select); NCP1252B65 as the primary aux controller mpn (MR-13); GD32G553**V**ET6
(MR-12); TPS3430 true pinout/window-set (HR-13); B1505S replacement with certified reinforced
bias modules + certificate class for QA01C/PSQD (HR-16); HF167F contact insulation at 475 VAC
system (MR-25); QA01C output topology — the drawn P18/COM/N4 dual-rail symbol vs the priced
single-18 V suffix: **the −4 V off-rail exists nowhere as priced** and the zener-split network is
not drawn — resolve part or draw the split (this endangers the DPT-frozen E5/E6 −4 V off-bias and
its crosstalk margin); 1700 V TO-220 availability (MR-23); Cr film Vrms@140 kHz (MR-24); PHD
contact rating (MR-14).

## L. BOM & component-selection findings

The BOM machinery itself remains sound (0 unmatched, schematic-exact quantities). Selection/encoding
defects found: `PP-44n-1200` mpn vs "46 nF" description vs 44 nF drawn (CB-22); `IND-TRIM-4u3`
single p/n vs D2 bins (CB-22); `SS310` (CB-19); `AMS1117` (CB-18); `UCC28C43` (MR-13);
`GD32G553RET6` (MR-12); `B1505S` (HR-16); qtyMul-2 phantom relays (HR-19); `RAUXCS` (0.55 Ω 1206
CS, ~0.2 W avg + pulse) falls through to the generic "small-signal 0402–0805" catch-all — give it
a real 1206 0.5 W 1 % line; resonant burden needs its own pattern (CB-16); CER-25W with no SKU
scaling (HR-14); no CMC skuOverride (HR-18). Cost impact of this review's fixes (rough): +₹250–500
(30 kW) / +₹500–900 (60 kW) / +₹1.5–2.5 k (120 kW — fans, relay pair, CM chokes, aux upsize
dominate) — small against the standing R12 gap but must go into the next regen.
*Post-fix actuals (rev D BOM regen, 100 % matched): **+₹1,174 / +₹1,675 / +₹2,589** → COGS
₹37,240 / ₹63,090 / ₹117,422 @1k. The delta over the estimate is the reinforced bias-module set
(HR-16, 6–7 positions ×₹50) and the bank-bleed subsystems (E33) — safety bought with BOM, again.
R12 restated in bom-cost.md.*

## M. Reference-design comparison & re-verified rev C fixes

Rev C items this review re-attacked and found **correct**: link TX↔RX crossover (pin-by-pin ✓);
discharge default-OFF incl. opto orientation, DCN-referenced bias, gate pulldown ✓; E27 chain
truth-table under every boot/reset/harness-loss combination (incl. the floating-local-EN corner —
safe via remote pulldown + WD) ✓; precharge 3-wire loop coverage (R in L1+L2, every L-L pair sees
≥1 R) ✓; KPRE series-mirror both-open proof ✓; Vienna phase films, orientation, RCD clamp topology
✓; DESAT diode chains (orientation, 2×1 kV) ✓; AVMID scheme *for line CTs* ✓; X1/Y1 classes ✓;
MOV+GDT L-PE ✓; SWD/BOOT/NRST ✓; CLAMP-to-gate ✓; PWM pulldowns ✓; ULN spares grounded ✓; bank
2-series strings + shared midpoints ✓; X-cap bleed exists implicitly through the RNS star (τ ≈
0.44 s ✓ — a nice accident, worth a schematic note so nobody deletes RNS). Against reference
practice, the *new* deviations: commercial modules carry per-SKU aux stages and per-SKU EMI filter
copper (this design doesn't yet — CB-20/HR-18); ST/Infineon LLC references always land driver FLT
on a µC fault input (CB-21); every production flyback app note matches rectifier PIV to Vor
(CB-19). Justified deviations from R1 all stand.

## N. Fault/stress matrix — delta rows (R1 legacy rows unchanged; its 13 FAIL rows now PASS as drawn, except where noted)

| Condition | Expected | Predicted as-drawn | Highest stress | Verdict |
|---|---|---|---|---|
| First full LLC load, any SKU | I_RES telemetry + F.11 armed | burden 7 W → open; clamps pump 3V3; F.11 unrepresentable | R{n}CT, then CT sec. | **FAIL (CB-16)** |
| Power-up, DC-DC board | MCU-LLC boots | no 3.3 V source — board dead | — | **FAIL (CB-17)** |
| Bench idle, 25 °C | rails stable | AC-DC 3.3 V LDO at 2.9–4.1 W → thermal cycling | U3V3 | **FAIL (CB-18)** |
| First 800 V bus command | aux runs | DAUX24/15/VC avalanche (PIV 130–199 V vs 100 V) | aux diodes | **FAIL (CB-19)** |
| 120 kW: relays pull in, fans 100 %, hot | 24 V holds | demand ≈90 W vs ≈52 W stage → collapse cascade | TAUX/QAUX | **FAIL (CB-20)** |
| LLC DESAT on one leg | F.12 latch, controlled stop | driver soft-off invisible; flux-walk w/ dead F.11 | T{n}, Q{n}H/L | **FAIL (CB-21)** |
| Tolerance-corner unit at gain limit | bank_max met (§37) | drawn tank ≠ validated tank; +2.2 % margin spent | tank | **FAIL (CB-22)** |
| 120 kW precharge @400 ms gate | STANDBY | t95 ≈ 576 ms → F.20 false-abort every start | RPRE | **FAIL (HR-14)** |
| 120 kW discharge check @4 s | <60 V | 7.2 s → F.21 false-fail; 477/382 J pulses on 25 W parts | RPRE/RDIS | **FAIL (HR-14)** |
| Enclosure access 60 s after off | touch-safe | banks at ≤525 V for 3–14 min | CBA/CBB | **FAIL (HR-15)** |
| Hipot/leakage audit of bias barriers | reinforced everywhere | B1505S 1.5 kV functional across mains/bus/output→SELV | PS5* | **FAIL (HR-16)** |
| 120 kW, one rear fan stalls | F.25 derate | tach unmonitored (Y-cable) / header absent | magnetics | **FAIL (HR-17)** |
| 120 kW CM choke at 220 A, 55 °C | ΔT ≤ 45 K | ≈231 W in one choke (27.5 A/mm²) | CMC1/2 | **FAIL (HR-18)** |
| 120 kW 400 A via paralleled KOUT | shared ≤200 A each | unballasted split ~65/35 → 260 A one contact; 2nd relay not drawn | KOUT pair | **FAIL (HR-19)** |
| Aux FB single-fault open | contained | V24→30 V+, V15→20 V into all modules | whole bias plane | **FAIL (MR-17)** |
| WD window at boot / SMT | per TPS3430 | 3-pin unpowered symbol; footprint mismatch | USUP | **FAIL (HR-13)** |
| MCU reset w/ bus charged (T-12 case) | discharge OFF, cool | re-verified OFF ✓ (E19 rev B correct) | — | PASS |
| Harness unplugged live | both boards gate-off | re-verified via E27 chain ✓ | — | PASS |

## O. Unverified assumptions / missing information (adds to R1's O-1…O-10)

O-11 QA01C output topology (+18/−4 split) and certified insulation class · O-12 bank-string ripple
current share vs film caps at burst/PS modes (no bank-ripple calc exists — run it) · O-13 SQP/CER
25 W single-pulse J-capability curves (HR-14 sizing) · O-14 electrolytic leakage-vs-T spread for
MR-15 · O-15 Y1 caps at 1000 VDC working (output-PE) — carried from O-7, still open · O-16 fan
p/n 3.3 V-PWM threshold (MR-9 carry-over) · O-17 HFE82V/HF167F mirror-contact isolation + contact
insulation classes · O-18 GD32G553 real pin map (A6) — note the current numeric maps collide with
G474-convention VDD/VSS at pins 49/50, 74/75, 99/100, so a full re-map + regenerated
reserved-pin assert is expected, not a delta · O-19 AMC1350 offset/gain vs the firmware "gain
0.41" constant · O-20 PHD contact rating (1 A vs 2 A variants).

## P. Layout-dependent follow-ups (adds to R1's P-1…P-11)

P-12 AVMID star routing + buffer placement (MR-11 fix is layout-coupled) · P-13 resonant CT
aperture + 2 Ω burden Kelvin at the ADC side · P-14 buck regulators (CB-18) — switch-node keep-out
from AVMID/iso-amp outputs · P-15 CM choke re-wind (HR-18) → new footprints at 60/120 kW ·
P-16 paralleled KOUT pair symmetric busbar (HR-19) · P-17 QDIS FET tab isolation vs its mount stud
· P-18 aux rectifier thermal pads (SMC) · P-19 fan header placement per airflow zone at 120 kW.

## Q. Production-readiness checklist

| Category | Verdict |
|---|---|
| Power topology & tank *values as frozen* | **FAIL** (CB-22 — drawn ≠ frozen; physics itself PASS) |
| Magnetics D1/D3/D4 | **PASS** (D2 **FAIL** — binning not in BOM; CMC **FAIL** — HR-18) |
| Semiconductor stress (DPT-based, power path) | **PASS** |
| Passive ratings — power path films/electrolytics | **PASS** (rev C fixes verified) |
| Passive ratings — resistors under continuous HV | **WARNING** (HR-20, MR-16, MR-19) |
| Aux power block | **FAIL** (CB-19/20; CB-5/6 wiring itself verified ✓) |
| 3.3 V / rail architecture | **FAIL** (CB-17/18) |
| Sensing front-ends | **FAIL** (CB-16; line-CT path PASS; MR-11) |
| Protection paths reaching the MCUs | **FAIL** (CB-21; PFC side PASS) |
| Protection constants vs SKU | **FAIL** (HR-14) |
| Enable/kill/watchdog chain | **WARNING** (logic verified PASS; HR-13 symbol/part FAIL) |
| Discharge & stored energy | **WARNING** (bus PASS incl. E19 rev B re-verify; banks FAIL — HR-15) |
| Isolation architecture | **WARNING** (signal path PASS; bias-feed barrier FAIL — HR-16) |
| SKU scaling completeness (fans/relays/aux/filters/timings) | **FAIL** (CB-20, HR-14/17/18/19) |
| Inter-board interconnect | **PASS** (30 kW) / **WARNING** (120 kW — MR-14) |
| EMC schematic level | **PASS-est.** (unchanged; HR-18 is thermal, not filtering) |
| Firmware/logic layer | **PASS** (33/33 stands; needs CB-16/21 + HR-14 constants to be *connectable*) |
| Manufacturing provisioning | **PASS** (CB-13/MR-1 verified; MR-12 mpn to fix) |
| BOM machinery | **PASS** (selections per §L to fix) |
| Docs coherence | **WARNING** (§E drift list) |
| Datasheet closure (§K + additions) | **NOT VERIFIED** (gate, expanded) |
| **Review regression gate** | **FAIL as a process** — extend `review-checks.mjs` with: rail-source assert per board per rail; every `FLT_*`/`RELAY_FB_*`/CTL net present in a pin map; literal-value asserts for Cr/trim/burden(res vs line)/balance-R wattage; per-SKU constant table cross-check (F.20/F.21/pulse-E vs C(SKU)); mpn-suffix lint (package letter vs footprint) |

## R. Top remaining risks

**Top 10 real-world failure modes (post-R2 ranking):** 1. resonant burden burnout + dead F.11 at first load (CB-16) · 2. DC-DC board dead / 3.3 V collapse (CB-17/18) · 3. aux rectifier avalanche at first high-line (CB-19) · 4. 120 kW aux collapse cascade (CB-20) · 5. LLC flux-walk with invisible driver faults (CB-21+CB-16 compound) · 6. tolerance-corner gain shortfall re-opening §37 (CB-22) · 7. 120 kW never completes precharge / fails discharge supervision (HR-14) · 8. CM choke thermal event at 60/120 kW (HR-18) · 9. service contact with charged banks (HR-15) · 10. bias-barrier insulation finding at certification (HR-16).

**Top 10 most-likely-overlooked (the next reviewer's list):** the QA01C −4 V rail question (§K/O-11) · AnalogMid oscillation (MR-11) · aux FB-open rail OVP (MR-17) · harness GND return current (MR-14) · string balance vs hot leakage (MR-15) · F.03/F.13 latency claims (MR-18) · phantom qtyMul relays pattern elsewhere (audit *every* qtyMul) · `RAUXCS` catch-all misclassification (§L) · the stale `mcu-pinmap.csv` misleading A6 closure · standby-power spec vs passive drain (§E).

**What blocks production:** CB-16…CB-22, HR-13…HR-20, the §K expanded gate, ECO-1 (unchanged), EVT T-01…T-18 (with T-05/T-11 made per-SKU).

**Pass-prototype-fail-production candidates:** CB-19 (low-line bench passes), CB-18 (25 °C bench passes, 55 °C enclosure doesn't), CB-22 (nominal-value prototypes pass; tolerance-corner production units don't), MR-15 (fresh caps balance; aged hot caps walk), MR-16 (gate resistors age at 80 %), HR-19 (relay pairs share fine until contact resistance diverges with wear).

**Month/year field-return candidates:** HR-20 resistor drift → F.06 nuisance trips · MR-15 string walk → single-cap OV vent (a slow CB-2) · CM choke insulation aging at HR-18 temperatures · MR-22 button ESD accumulation · aux diodes surviving at 199 V/200 V-class replacement with zero margin if the fix under-specifies (use 300 V).

**First-prototype tests before production approval (beyond T-01…T-18):** (i) resonant front-end at full tank current with the corrected burden — verify F.11 trip at 70±5 A (extends T-17); (ii) V3P3 load/thermal survey both boards at 55 °C (extends T-00); (iii) aux at *per-SKU* worst load with diode PIV scope capture at 850 V bus (extends T-18); (iv) FLT_LLC injection → F.12 latch timing (extends T-06); (v) per-SKU precharge/discharge timing vs F.20/F.21 (extends T-05/T-11); (vi) bank-voltage decay profile + service-access interlock validation; (vii) CM choke thermography at rated line current per SKU (extends T-04); (viii) gain-capability EOL cal on deliberate worst-bin tank builds (validates CB-22 fix).

---

### Verification round (same day, on request: "double-confirm those issues")

Every finding was re-attacked with independent evidence before any fix — netlist-level greps of
the built boards, the design's own D-drawings/turns sheets, the firmware source (not its docs),
and re-derived arithmetic. Outcome:

- **CONFIRMED (no change):** CB-16, CB-17, CB-18, CB-19, CB-20, CB-21, CB-22, HR-13, HR-15,
  HR-16, HR-17, HR-18, HR-19, MR-11…MR-19, MR-22…MR-25. Strengthened along the way: CB-18 also
  violates the AMS1117's 15 V input maximum on a 15 V rail; MR-13 deepened — with the priced
  UCC28C43 the BR divider connects to a nonexistent pin, and with NCP1252's real 1.0 V BO
  threshold the drawn 27 k bottom resistor set brown-in at ≈179 V, not the documented 330 V.
- **PARTIALLY RETRACTED — HR-14:** `fsm.c:78` aborts precharge only if *t > 400 ms AND bus < 50 %*
  — tolerant at every SKU as coded; the "F.20 false-abort at 120 kW" sub-claim was wrong (the
  protection-table *wording* was what misdescribed the implementation). The falsification pass
  then found the inverse defect: **F.21 was documented but had no implementation at all** (no
  timer, `FC_DISCH` never latched). Pulse-energy scaling and per-SKU EOL windows stood.
- **DOWNGRADED:** MR-20 (dual KPRE coils ≈420 mA pull-in on a 500 mA ULN channel — acceptable
  with economization; note kept), MR-21 (per-zone NTC coverage — documented limitation, not
  redesigned; owner decision recorded).

### Resolution (schematic rev D — cells v4 / boards v4 / parts-db rev D, same day)

| Finding | Resolution | Evidence |
|---|---|---|
| CB-16 | resonant burden 2.0 Ω 1 W 2512 + dedicated db line + firmware scale + F.11 note | build ✓, gate R2-CB16 |
| CB-17 | `Rail3V3` sync-buck cell instantiated on BOTH boards | netlist: DC-DC V3P3 sourced; gate R2-CB17/CLASS-RAIL |
| CB-18 | LDO deleted; TPS54202-class buck (≈0.4 W vs 2.9–4.1 W) | gate R2-CB18 |
| CB-19 | 400 V ultrafast rectifiers (UF-400V-3A SMC / US2G); sim diodes now carry BV=400 | aux rev C deck; gate R2-CB19 |
| CB-20 | E26 rev C: single 110 W stage family-wide (Lp 345 µH, Ip 3.2 A, ETD34, D4 rev C) | **aux-flyback.mjs rev C: 9/9 PASS at per-SKU loads, 107 W delivered** |
| CB-21 | `FLT_LLC` → MCU-LLC pin 74 | netlist: pin74→FLT_LLC verified; gate R2-CB21 + class check |
| CB-22 | Cr 46 nF drawn; D2 bin set in BOM; D3 Lm 63 µH; stale 7.3 µH line corrected | gate R2-CB22; T-25 added |
| HR-13 | 6-pin watchdog symbol (VDD + SET straps + decoupling moved to VDD) | gate R2-HR13 |
| HR-14 | 50 W pulse variants @120 kW (skuOverrides); **F.21 implemented in fsm.c** (`disch_ms` + per-SKU `PMP_DISCH_TO_MS`); F.20 row re-worded to match the (correct) code; per-SKU EOL windows | firmware **33/33**; gate R2-HR14 |
| HR-15 | E33: commanded bank bleeders (2× DischargeCtl + 1200 V FET + 4× 2.2 k 10 W each), one GPIO (pin 75); F.21b row; §47 restated honestly | build ✓; gate R2-HR15; T-21 |
| HR-16 | all iso-5V positions → reinforced-class mpn (≥5 kVrms test) + certificate line in §K; QA01C/PSQD audit noted | gate R2-HR16 |
| HR-17 | `nFans` = 4 @120 kW, four headers, pins 80–83 | gate R2-HR17 |
| HR-18 | D7 drawing (per-SKU foil windings, ΔT acceptance) + skuOverrides + EMI-filter loss line (η −0.16 pt restated) | gate R2-HR18 |
| HR-19 | matrix `dual` at 120 kW: real second instances, shared coils (≈140 mA/channel), series mirrors on the same FB nets; qtyMul retired | gate R2-HR19; T-24 |
| HR-20 | 2-series 47 k HV anti-surge everywhere (bus/bank balance + star) | gate R2-HR20 |
| MR-11…MR-22 | dual-feedback AVMID buffer · VET6 mpn · NCP1252A + BR 15 k (brown-in ≈322 V) · Micro-Fit harness + GND spares + link series R · leakage sizing → O-14/§K · 0.5 W gate resistors · rail TVS · 1 nF OVP filters + honest latency row · 10 W bleeder · button caps | gates R2-MR* |
| Low items | local-EN pulldown, QAUX gate pulldown, CGND bleed, rail monitors (pins 51/52), doc-drift fixes (architecture tank/aux, interconnect E19 text, insulation Y1, D2/D3 values, stale rev-B aux text) | source + docs |

**Post-fix evidence chain:** six boards rebuilt (0 netlist port errors; placement warnings remain
deliberately ignored per directive) · extended gate ALL PASS (R1 31 + R2 ~30 incl. class asserts)
· aux rev C sim 9/9 · firmware 33/33 · BOM regenerated (see bom-cost.md rev D totals). Still open
by nature: §K datasheet gate (expanded per §K above), ECO-1, bench EVT T-01…T-25.

### Reviewer's closing statement

Rev C fixed what R1 found — genuinely: I re-verified the fixes adversarially and most survive
(§M). What rev C could not do is find what R1 *missed*, and its closure gate was built only to
hold the fixed ground. The seven new blockers cluster in two families: **copy-through defects
inside the fix set itself** (the 33 Ω burden cloned onto a 15×-hotter CT; a bias-module p/n that
contradicts the insulation doc written the same day; an LDO asked to burn 4 W; rectifiers priced
before the turns sheet existed) and **the 30 kW design silently standing in for the 60/120 kW
one** (aux, fans, timings, pulse energies, filter copper, paralleled relays). Every one has a
cheap, local fix; none needs architecture. Fix CB-16…22 + the HR list, extend the gate so these
*classes* can't regress, regenerate BOM/docs/η, re-run the four decks in §G — then this design is
ready to spend money on boards. The power conversion core has now survived two hostile audits
without a scratch; the support infrastructure needed a second pass, and got one.
