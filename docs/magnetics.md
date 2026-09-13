# Magnetics — Designs & Manufacturing Drawings (§11/§14/§49-14/15)

<p align="left"><img src="https://img.shields.io/badge/status-LIVE__SPEC-2ea44f?style=flat-square" alt="LIVE__SPEC"/> <img src="https://img.shields.io/badge/rev-E60-f2b705?style=flat-square" alt="rev"/> <img src="https://img.shields.io/badge/updated-2026--09--13-555?style=flat-square" alt="updated"/> <img src="https://img.shields.io/badge/gates-conductor--audit_·_current--coordination-2ea44f?style=flat-square" alt="gates"/></p>

> **Purpose** — Manufacturing drawings D1–D7 with acceptance lines + per-variant tables. RFQ sheets: magnetics-manufacturing-pack.md.
>
> **Gate coupling** — magnetics-rfq-audit (field completeness) · stress-audit D1/D2/D3/D6 families (computed) ·
> **E60:** [`conductor-audit`](../calculations/magnetics/conductor-audit.mjs) (Dowell/Sullivan AC copper at the simulated
> currents) · [`current-coordination`](../calculations/system/current-coordination.mjs) (CT burdens, trip classes, D2 fault flux).
>
> [!IMPORTANT]
> **E60 copper revision.** Earlier sizing used DC resistance ×1.15. At 140 kHz the proximity effect governs, and
> the simulated currents put four constructions outside their own Rac rows. The table below lists the as-drawn
> AC/DC ratio and loss beside the E60 build:
>
> | Part | As drawn | Computed Rac/Rdc · Cu at the worst corner | E60 construction | Result |
> |---|---|---|---|---|
> | D3 secondaries | Cu foil 0.20 / 0.25 / 0.30 mm, 7/6/5 layers | **5.3 / 5.1 / 6.7** · 18 / 42 / 59 W | foil **0.10 × 28 mm** (30 kW) · **0.127 × 28 mm** (40/50 kW) | 1.27 / 1.29 / 1.20 · 8.7 / 20.7 / 25 W |
> | D3 primaries | 0.1 mm-strand profiled litz | 1.63 / 1.51 / 1.55 | same copper area in **0.071 mm** strands | 1.32 / 1.26 / 1.28 |
> | D2-40 trim | 2× PQ50/50, N 5, 2000×0.1 | **4.3** · 13.6 W | **1× E70/33/32, N 5, 4150×0.071** (rev D, 0.54 kg) | Rac 2.29 mΩ · ΔT 32 K cont / 38 K SER |
> | D2-50 trim | 2× PQ50/50, N 6, 3000×0.1 | **11.7** · 45 W | **2× E70/33/32, N 3, 2500×0.1** (rev D, 1.1 kg — no single-set option held 40 K) | Rac 1.61 mΩ · ΔT 27 K cont / 31 K SER |
>
> D1 bundles (ripple 11 % of rms) and D2-30 (Rac 1.93 mΩ ≤ 4 mΩ, ΔT 36 K) stay as drawn. Guide:
> [`conductor-selection.md`](conductor-selection.md).


All values trace to `calculations/pfc/pfc-design.mjs` and `calculations/llc/llc-design.mjs`.
Acceptance limits are the production test spec (EOL §45). Material fits are catalog-class,
marked VERIFY (A3/A4) — first-article measurement closes them.

## D1 rev B — PFC choke, 165 µH swing (p/n IND-PFC-165u) — qty 3/6/12 per SKU

**Rev B (margin audit 2026-09-08, F4):** re-issued against the REAL catalog core and the
calculator's selected copper. Rev A specified 13.75 mm²/N=36, which fails its own Rdc line
(computes 12.05 mΩ vs ≤11) and — on the actual Magnetics 0077908A7 (AL 37 nH/T² ±8%, effective
Ae 2.27 cm², not the 2.62 cm² geometric idealisation) — lands L₀ at 144 µH, below the −12% floor,
and 71 µH at 78 A, below acceptance.

| Item | Spec |
|---|---|
| Core | 3× stacked sendust toroid OD79/ID48/H17 mm, µ=26 — **Magnetics 0077908A7 or matched equivalent (Chang Sung KS / POCO / DMEGC), AL 37 nH/T² ±8% per core** — catalog rev 10/7/2021: **Ae 221 mm², le 196 mm**, Ve 43.4 cm³, DC-bias minimums 80 %@95 Oe / 50 %@205 Oe (E60 sync; the design roll-off fit 80 %@75 / 50 %@175 Oe stays the conservative basis) |
| Winding | **N = 39 nominal; winder trims ±1 turn per core lot** so both L lines below are met across the AL ±8% band (standard swing-choke practice — a fixed N misses the bias floor on a low-AL lot). Flat copper **3×(6×1 mm) = 18 mm²** on edge (alt: 9× 1.6 mm enameled 2-layer — Rdc governs), spread ≥300° |
| Terminations | 2× tinned flying leads, 60 mm, solder into the board's plated holes (§0.1 — resolves the rev-A ring-lug/hole conflict in favour of the board) |
| L @ 0 A | **168 µH nominal; accept 150–185 µH** (100 kHz, 0.1 V — brackets core AL ±8%) |
| L @ 78 A pk bias | ≥ 75 µH (pulse method; ACCEPTANCE — calc 77 µH on nominal AL) |
| Rdc | ≤ 11 mΩ @25 °C (calc 10.0 mΩ) |
| Core loss @ rated ripple | ≈ 2.4 W calc (ΔB ≈ 70 mT pp @ 50 kHz, A3 fit) — stated so the loss line is auditable |
| Loss @ rated | ≈ 35 W calc total (Cu 32.4 + Fe 2.4) — ΔT ≤ 45 °C over 55 °C ambient, thermocouple at inner bore (calc ≈ 36 °C) |
| Isolation | winding–core 500 VAC/1 min (functional; core floats on mount) |
| Mount | center bolt M6 + silicone pad + epoxy band; mass **~2.2 kg (computed — mag-sync gate, E59: core 0.96 + Cu 1.06 + build; the old ~1.0 was eyeballed)** |
| Hi-pot | none (line-potential part; board-level hipot covers) |

## D2 rev C — Resonant trim inductor bin set (IND-TRIM-BIN4) — qty 3/6/12

**Rev C (margin audit 2026-09-08, F1): core technology changed sendust → GAPPED FERRITE.** The
rev-B sendust toroid (OD33 µ60, N≈9) carries the full tank current — 46 A rms *sinusoidal* at
140 kHz — i.e. full AC flux swing, ±≈310 mT. On the design's own A3 sendust loss fit that is
**≈43 W of core loss in a 7 cm³ core** against a ~4 W/section tank budget, and at the 96 Oe peak
field the permeability falls to ~41%, so L swung 7.4→3 µH across every resonant cycle — the ±3%
bin concept cannot exist on a powder core at this operating point. **Powder cores are prohibited
in this slot** (they are for DC-bias + ripple duty, like D1/D6). No core-loss line existed in
rev B; every magnetic drawing now must state one.

| Item | Spec |
|---|---|
| Core | **2× stacked PQ50/50, PC95/DMR95/3C95-class (SAME core p/n as D3** — one more ferrite line-item, zero new supply chain) |
| Turns | **N = 4**, litz **1350×0.1 mm (10.6 mm² — E52 margin rev**: the frozen 1050×0.1 rode J 5.62 exactly at the 5.6 line; 1350 lands J 4.38 / ΔT ≈ 35 K **and is the same litz as the D3-30 primary — one spool covers both parts**) |
| Gap | total ≈ 3.3 mm, **distributed 2 positions per leg**, winding kept ≥5 mm clear of gaps (margin tape); **gap GROUND per bin** — same grind-to-AL process the D3 Lm already uses |
| Bins | four L values **3.3 / 3.65 / 4.0 / 4.35 µH ±3%** (grind targets ≈3.05/3.37/3.70/4.03 mm before fringing; grinding trims fringing out); bin SELECTED against the mated transformer's measured leakage so **Lr(total) = 7.0 µH ±3% (E7 rev D2)** |
| B_pk @ 65 A pk | ≤ 100 mT at the nominal 4.0 µH bin (calc 99 mT) — **E60: the bin-max 4.35 µH unit at the power-solved SER-250 peak (65.6 A) computes 109 mT**; runaway g 0.17 and ΔT 36 K hold on the measured basis (temp-critique/conductor-audit); fault flux at F.11 + race (129 A) 214 mT ≤ 217 mT |
| Core loss | ≈1.9 W typical op / ≈6.8 W at the worst envelope corner (bank 245–262 V SER, 46 A rms) — A4 fit |
| Rac | ≤ 4 mΩ @140 kHz — **E60 Sullivan: Fr 1.97 → 1.93 mΩ hot**, Cu 4.3 W at the simulated 47 A rms SER corner (the ×1.15 basis said 3.3 W); ΔT 36 K on the measured-3C95 core basis |
| Thermal | ΔT ≤ 40 K at 46 A rms continuous (calc ≈37 K worst corner), thermocouple on core leg |
| Hipot | winding→core 2.5 kV AC 1 min (functional — part sits at tank potential; the isolation barrier is elsewhere) |
| Mount | 2× M4 clamp bar (same hardware family as D3); 2 tinned litz flying leads into the board's plated holes |

Kitting unchanged: transformer leakage label → trim bin pick at assembly (DFM step 3). History:
rev A = single 4.3 µH ±5% (pre-MC); rev B = sendust bin set (R2 CB-22 — electrically frozen values
correct, core technology wrong). The frozen E7 rev D2 tank values are UNCHANGED by rev C.

## D3 — LLC section transformer 10 kW (XFMR-LLC-10K) — qty 3 per module

> **E51 window study + construction rev (2026-09-12).** A clean-room re-check against real
> catalog windows found the as-drawn litz+TIW+**margin** constructions do not wind: this 30 kW
> part computed **142–172 %** of its available window, the 40 kW 9:9:9 route **242–294 %** of
> its named former, the 50 kW 3-set route needed a former that does not exist. Fixes: (1) the
> construction below is revised to **compacted/profile rectangular litz primary + copper-foil
> secondaries with a TIW/FIW barrier** — TIW **or** 3.2 mm margins, never both (the double
> barrier was eating ~18 % of the window for no credit); with it this 30 kW wind closes at
> **~75 %** of the bobbinless 3-stack window (E8 stands); (2) the 40/50 variants move to
> 2×E70 sets at 6:6:6 / 5:5:5 (their rows below); (3) **leakage is a controlled parameter**
> (interleave spacer sets it): target **3 ±0.7 µH** primary-referred so the frozen D2 bins and
> Lr = 7.0/6.5/6.0 µH per-SKU tanks stay untouched. Winder deliverable adds a leakage
> first-article curve (spacer thickness → measured leakage) before production release.

| Item | Spec |
|---|---|
| Core | 3× PQ50/50 stacked, PC95/DMR95-class, **gapped for Lm = 63 µH (E7 rev D2)** (center-leg grind, glue-stacked) |
| Turns | Np = 7, Ns1 = 7, Ns2 = 7 — **7:7:7** (ratio 1:1:1) |
| Primary | **compacted/profiled litz ≥9.8 mm² Cu in 0.071 mm strands (≈2475×0.071 — E60)**, 47 A rms simulated worst — the 0.1 mm-strand build computed Sullivan Rac/Rdc 1.63 against the 1.35 row; audit F5 history: the rev-A "1050×0.1" was 8.25 mm² |
| Secondaries | **copper foil 0.10 × 28 mm, 7 layers each (E60 Dowell optimum)** with the TIW/FIW barrier system — 22.9 A rms each simulated worst; the E51 0.20 mm foil computed Rac/Rdc 5.3 (17.9 W vs 8.7 W) |
| Interleave | S1 – P – S2 (leakage target ≤ 3 µH primary-referred; measured leakage recorded per unit) |
| Shield | 1-turn Cu foil between P and each S, flying lead → primary star (CM control §18/§39) |
| Insulation | pri↔sec REINFORCED: TIW + 2× 3.2 mm margin tape; pri↔core basic |
| Hi-pot | pri↔sec 4.0 kV DC 1 s 100%; pri↔core 2.5 kV; **PD sample test**: ≤10 pC @ 1.5 kV pk, 5/lot (§14) |
| Electrical accept | **Lm 63 µH ±7% (gap ground to AL target — rev B, §37 MC; E7 rev D2 value, R2 doc-alignment)**; leakage measured & labeled per unit (bin input, ±20% window acceptable); turns 1:1:1 ±0; Rdc P ≤ 2.0 mΩ, **S ≤ 5.6 mΩ** (E60 0.10 mm foil; calc 5.05) · **Rac/Rdc ≤ 1.35 @140 kHz (calc 1.27 S / 1.32 P)** |
| Loss | Fe 13 W (A4; measured-3C95 basis 7.6) + **Cu 10.2 W at the continuous-worst simulated corner** (E60; 14.1 W at the SER-band corner, transient-only since FW-R8) → hot equilibrium 102 °C at 55 °C inlet; hotspot ≤ +55 °C rise (thermocouple under margin tape, type-test) |
| Mount | 4× M4 clamp bar; mass **~0.75 kg (computed, E60 — thinner secondary foil)** |

## D4 — Aux flyback transformer (XFMR-AUX-FLY) — qty 1

**SUPERSEDED — see D4 rev C below.** Kept for history: rev A was EF20/half-bus, rev B ETD29/60 W.
Do not quote from this section.

EE19/EF20 class, PC40, primary 425 V-max input (fed DCP→MID, E20), 3 outputs: 24 V/0.8 A, 15 V/0.6 A, aux 15 V bias; pri↔sec reinforced TIW, hipot 3 kV; fsw ~65 kHz flyback DCM. Detailed turns sheet issued with aux SPICE validation (open item V-21).

## D7 — CM chokes (CMC-3PH-2mH-SKU) — qty 2, **per-SKU winding (R2 HR-18, new drawing)**

The rev-B "same core family, 4–8 mm² wire" spec ran the copper at **13.8 / 18.3 / 27.5 A/mm²**
(≈29 / 77 / 231 W per choke — a thermal event at 120 kW, and none of it was in the loss budget).
Rated windings, D6-style:

| SKU | I_rms/line | Core | Winding | Cu loss/choke (calc) |
|---|---|---|---|---|
| 30 kW | 55 A | nanocrystalline OD62 | 3× 8 T, 10 mm² foil 0.3×33 | ≈ 11 W |
| 60 kW | 110 A | OD80 | 3× 7 T, 25 mm² foil 0.5×50 | ≈ 16 W |
| 120 kW | 220 A | OD102 (or 2× OD80 stacked) | 3× 6 T, 50 mm² foil/busbar | ≈ 36 W |

L_cm ≥ 2 mH @10 kHz all SKUs; leakage (DM) ~9 µH doubles as DM filter stage (re-verify at the new
turns at EMI rev). ΔT ≤ 45 K at I_rms acceptance (thermocouple, like D1/D6). Hi-pot line–line
functional via spacing; UL1446-class tape. **Loss budget: EMI-filter line added (thermal-report
rev D) — these losses existed before, they were just unbudgeted.**

**Catalog adoption @30 kW (margin audit 2026-09-08):** Schaffner **RT8131-63-2M8** (vertical:
RT8531-63-2M8) — 3-line, 63 A @60 °C, 2.8 mH, 600 VAC, nanocrystalline, PCB-mount, Digi-Key
stocked — qualifies as a drop-in for the 30 kW winding (55.9 A worst). Qualify at EMI rev; this
custom drawing then becomes the second source (Schaffner is single-source post-TE-acquisition;
custom-wind fallback cores: VAC T60006 via Mouser singles, or King Magnetics rings). 60/120 kW
reference windings stay custom — nothing in any catalog reaches 110/220 A at ≥2 mH.

## CT — current transformers — qty 3/6/12 each — **CATALOG PARTS (audit 2026-09-08)**

- Line CT: **Talema ACX-1100** (2500:1, 100 A, ±1%, Ø14.6 mm window, 4 kV hipot, PCB pins — made
  at Talema Salem, India; closes the CT-100A REVIEW line). Burden on PCB **27 Ω → 0.59 V/55 A rms;
  150 A pk OC observability = 1.62 V above AVMID, inside the 3.3 V ADC rail** (R3 fix landed —
  the drawn 33 Ω put 150 A pk at 3.63 V, clipping the top of the protection range). Linearity
  ≤1% to 150 A pk. qty 3/6/12.
- Resonant CT: **Talema AS-404** (1:100, 50 A, 1500 V·µs, 20–200 kHz, Ø8 mm pass-through — the tank conductor
  is the primary, so tank-potential insulation rides the tank wire). **E60: Coilcraft CST2010-100L is NOT an
  equivalent** (47 A at ~40 K rise, built-in SMT primary, 1.5 kVrms). **E60 burden 1.2 Ω → 12 mV/A: F.11 85 A pk
  = 2.67 V at the comparator, observable to 135 A through the 3 µs internal-short race** (the CB-16 2.0 Ω/70 A pk
  class sat AT the 30 kW operating peak); 40 kW 80 A class on 0.91 Ω (F.11 115 A pk; catalog option AS-407 1:500
  with a 4.55 Ω burden), 50 kW 100 A class on 0.75 Ω (F.11 145 A pk); calibrated at EOL; qty 3/6/12.

**Acceptance (both CTs).** Turns ratio ±0.5 %, 100 %. Secondary Rdc recorded per unit (it feeds the
EOL gain calibration). Phase shift ≤ 1° **at the operating frequency — 50/60 Hz for the line CT but
140 kHz for CT-RES**: the resonant CT is a switching-frequency part and a line-frequency core will
not serve it. Isolation busbar↔secondary 2.5 kV AC 1 min for the line CT (it sits on a line-potential
busbar); the resonant CT is tank-referenced, functional insulation only. Saturation: the line CT must not
saturate below 150 A peak, CT-RES below 100 A peak — that is the overcurrent observability limit,
so it is an acceptance test and not a typical. **ΔT ≤ 30 K** at rated primary current. The burden
resistor is on the PCB, not in the part (33 Ω line, 2.0 Ω resonant) — quote the CT bare.


---

## D4 rev C — aux flyback transformer (E26 rev C) — **superseded by rev D (E52): core ETD34 → ETD39**

> **Rev D (E52, 2026-09-12):** same electricals (Lp 345 µH, Np 38/6/4/4, AL 239, clamp 3.2 A,
> NCP1252D), core one size up — the ETD34 ran Bpk 0.30 T ≈ 85 % of hot Bsat at Lp +10 % + clamp;
> ETD39 (Ae 125 mm²) lands 0.233 T / 66 % at tolerance. Order code **XFMR-AUX-FLY-D**; turns
> sheet: [`aux-transformer-D4.md`](aux-transformer-D4.md). The rev-C text below stands as the
> electrical record.

Superseded rev A (EF20, half-bus) and rev B (ETD29, 60 W — R2 CB-20: lost to the per-SKU load).
Now **ETD34 PC95, 342–860 V input, 110 W class, one p/n family-wide**: see the generated
[`aux-transformer-D4.md`](aux-transformer-D4.md) turns sheet (Np 38 / N24 6 / N15 4 / Naux 4,
Bpk 0.30 T). The primary sits at **bus potential**; the pri→sec barrier is reinforced (TIW + 3 mm
margin, hipot 4 kV) and is the load-bearing barrier for the E25 SELV control domain — flag it as a
**safety-critical winding operation** in the winder's traveler (100 % hipot, not sampled).

Qty **1 per module**, all ratings (one aux supply per module; 110 W class covers the 120 kW worst
load at ≥20 % corner margin). Thermal acceptance: **ΔT ≤ 45 K** at the per-SKU load, thermocouple
on the outside of the primary margin tape — same method as D1/D3. Rdc: primary ≤ 900 mΩ,
24 V ≤ 60 mΩ, 15 V ≤ 45 mΩ, aux ≤ 45 mΩ (bench T-18 confirms against the loss budget).

## D6 — DM line chokes (DM-22u-SKU) — qty 3 per module, one per phase (HR-9, new drawing)

The 3rd-stage DM chokes (`LDM1–3`, E22) carry the full line current and now get a real drawing:

**Rev C (E43 full-family verification, 2026-09-08): ENGINE-designed —
`calculations/emi/dm-choke-design.mjs`.** The rev-B electricals were inherited from E22
("22 µH") and were never bias-checked: on the platform's own conservative roll-off anchors the
drawn 14 T on ONE OD47 core computes **~12 µH at ZERO bias (not 22) and 7–8 µH at the 82 A
crest** — under the 15 µH LISN floor on *either* material reading, at every SKU (the engine
prints this as its control row). A DM choke rides the line-frequency crest: its BIASED
inductance is what attenuates the 50 kHz ripple at the worst emission moment. Rev C fixes the
stage two-sided: **CX2 trio 2.2 → 4.7 µF X1** (attenuation is L·C — the cap is the cheap half;
X-bleed τ 0.66 s ≤ 1 s) and per-variant engine chokes against **equal-margin floors**
L_floor = 15 µH × (ΔI_variant/21.4) × (2.2/4.7):

| SKU | I_rms | I_pk (crest) | Floor | Core (engine) | Winding (engine) | L0 → L @ I_pk | Cu loss | ΔT |
|---|---|---|---|---|---|---|---|---|
| 30 kW | 55.9 A | 82 A | 7.0 µH | **2× T48 60µ** (77439-class stack) | **7 T × foil 0.5×40 (20 mm²)**, J 2.8 | 13.7 → **7.4 µH** | 2.4 W | 12 K |
| 40 kW | 73.3 A | 109 A | 9.2 µH | **2× T57 60µ** (OD57/26/20) | **8 T × foil 26.4 mm²**, J 2.8 | 22.9 → **10.5 µH** | 4.4 W | 14 K |
| 50 kW | 91.6 A | 136 A | 11.4 µH | **3× T57 60µ** | **8 T × foil 26.4 mm²**, J 3.5 | 34.4 → **12.9 µH** | 8.1 W | 19 K (plate-bonded in the sealed module) |

Verified end-to-end: `lisn-precompliance.mjs` now runs each variant's own ripple source through
its own crest-biased L and the 4.7 µF stage — **worst DM margins +4.9 / +5.7 / +5.6 dB**
(the old model's "+4 dB" was computed on the impossible flat 22 µH). Acceptance: L(I_pk) ≥ the
variant floor on the conservative anchors (real cores ride higher), ΔT ≤ 45 K at I_rms, J ≤ 5.6,
fill ≤ 40 %, hipot winding–core 2.5 kV. Same vendor/traveler flow as D1. (The rev-B 60/120 kW
rows are retired with their reference boards.)

---

# §0 — Ordering pack: what every drawing above still needs

All seven magnetics are custom-by-drawing, so **the drawing is the part**. The sections above are
complete *electrically*; a winder also needs the mechanical envelope, the terminations, the
insulation system, the acceptance regime and the traceability that decides whether a delivered unit
is good. Where those are absent the winder substitutes their own assumptions and you find out at
first article. `calculations/magnetics-rfq-audit.mjs` checks these fields are present.

## 0.1 Mechanical envelope and terminations — the board is already laid out to these

These come from `calculations/footprint-gen.mjs` (`MAGNETICS`), which is what the PCB land patterns
were generated from. **Every toroid is PCB through-hole**: the winding leads are soldered directly
into plated holes sized for the conductor. Drill is `√(4·CSA/π) + 1.2 mm`, pad = drill + 0.9 mm.

**Audit 2026-09-08: rows marked (†) changed conductor or construction — their drills/keep-outs
differ from the land patterns already generated; re-run `footprint-gen.mjs` before layout freeze.**

| drawing | core OD/ID/H (mm) | leads | conductor | drill / pad (mm) | max footprint ⌀ | mounting |
|---|---|---|---|---|---|---|
| D1 PFC choke † | 79 / 48 / 17 ×3 stacked (H 51) | 2 | 18 mm² (3×6×1 flat) | 6.0 / 6.9 | 87 | **M6 centre bolt** + silicone pad |
| D2 trim inductor † | 2× PQ50/50 stack (50×64×35) | 2 | 8.25 mm² litz | 4.44 / 5.34 | **68 × 56 envelope** | **2× M4 clamp bar** |
| D6 DM choke 30 kW † | 47 / 24 / 18 | 2 | 9.9 mm² | 4.75 / 5.65 | 55 | bonded |
| D6 DM choke 60 kW † | 57 / 26 / 20 | 2 | 20 mm² foil | 6.25 / 7.15 | 65 | bonded |
| D6 DM choke 120 kW † | 79 / 40 / 17 ×2 (H 34) | 2 | 40 mm² foil | 8.34 / 9.24 | 87 | bonded |
| D7 CM choke 30 kW | 62 / 32 / 25 | **6** (3 windings) | 10 mm² foil | 3.97 / 4.87 | 70 | bonded |
| D7 CM choke 60 kW | 80 / 45 / 30 | **6** | 25 mm² foil | 6.04 / 6.94 | 88 | bonded |
| D7 CM choke 120 kW | 102 / 60 / 35 | **6** | 50 mm² foil | 8.38 / 9.28 | 110 | bonded |
| D3 LLC transformer | 3× PQ50/50 | 7 pins @ 10 mm | ≥9.8 mm² litz (F5) | bobbin pins | 96 × 50 × 50 | **4× M4 clamp bar** |
| D4 rev C aux flyback | ETD34 | 8 pins @ 5.08 mm | 0.8 mm² | bobbin pins | 35 × 26 × 25 | bobbin pins only |
| Line CT (Talema ACX-1100) | 42 dia / Ø14.6 window | 4 PCB pins | catalog part | per Talema drawing | 44 | PCB pins; busbar through window |
| Resonant CT (Talema AS-404) | case w/ Ø8 pass-through | 2 PCB pins | catalog part | per Talema drawing | 26 | PCB pins; tank wire is the primary |

The "max footprint ⌀" is core OD + 8 mm, the winding-build allowance the land patterns reserve.
**A finished part wider than this does not fit its keep-out** — it is an acceptance dimension, not
a guide.

> **RESOLVED (D1 rev B, audit 2026-09-08).** Rev A said *"ring-lug flying leads M5"* while the
> board gives two plated holes — a ring lug cannot land in a hole. Decided for the board:
> **tinned flying leads, 60 mm, soldered into the plated holes**; the D1 rev B table above now
> says exactly that, and the holes grow to 6.0 mm for the 18 mm² conductor (†).

## 0.2 Thermal class — derived, and it rules out Class B

Ambient envelope is **full power to +55 °C, derating to +75 °C** (A11, spec §2). Applying each
drawing's own rise limit at the *derated* ambient:

| drawing | rise limit | hotspot at +55 °C | at +75 °C derated | minimum class |
|---|---|---|---|---|
| D1, D6, D7 | ΔT ≤ 45 K | 100 °C | 120 °C | **F (155 °C)** |
| D2 | ΔT ≤ 40 K | 95 °C | 115 °C | **F** |
| D3 | hotspot ≤ +55 K | 110 °C | 130 °C | **F**, H preferred |

**Class B (130 °C) has no margin anywhere and is negative for D3 at the derated corner.** Specify
a **Class F (155 °C) insulation system minimum**, UL 1446 recognised as a system (not as individual
materials), H (180 °C) for D3.

## 0.3 Still open — the winder will ask, and these are not ours to assume

- ~~**Low-temperature limit.**~~ **Closed:** A11 rev B (E52) registered −25 °C, and **A11 rev C (E60)** raised it to
  competitor parity: operating and cold start ≥ −30 °C, storage −40 °C. Litz bonding, tape adhesion and
  varnish are quoted to −40 °C.
- **Humidity / condensation and any conformal or vacuum-impregnation requirement.**
- **Vibration and shock class**, which decides whether the toroids need bonding or banding beyond
  the silicone pad.

## 0.4 Acceptance, traceability and compliance — applies to every drawing

- **100 % electrical test** of the acceptance line in each section. Sampled tests are called out
  individually (D3 partial discharge, 5/lot).
- **100 % hipot** where a drawing states one. D3 and D4 rev C carry the reinforced primary↔secondary
  barrier that the SELV control domain depends on: flag both in the winder's traveler as a
  **safety-critical winding operation — 100 %, never sampled**.
- **Per-unit measured-value labelling where a downstream step consumes it.** D3's measured leakage
  selects the D2 trim bin at kitting (DFM step 3). A D3 delivered without its leakage label is
  unusable even if electrically perfect.
- **Lot code and date code** on every part, traceable to core lot and wire lot.
- **First article**: dimensional report against §0.1, full electrical against the acceptance line,
  and a cross-section or teardown for the two reinforced-barrier parts.
- **RoHS / REACH**; all organic materials UL 94 V-0.
- **Packaging**: individually separated — the toroids are heavy enough (computed, E59: D1 ≈ 2.2–3.0 kg, D3 ≈ 0.8–1.5 kg)
  to damage neighbours in bulk packing.
- **Drawing control**: every section above needs a drawing number, revision and date before it is
  sent out. D2, D3 and D4 have already been revised (rev B / rev D2 / rev C) and the revisions are
  recorded in prose rather than in a controlled block.

## E41 variant drawings (40 kW module — deltas only, everything else per the rev B/C set)

| Drawing | 40 kW variant | Acceptance |
|---|---|---|
| **D1-40 rev B (E51)** PFC choke | **5×** 0077908A7 stack (same core p/n), **N = 26 ±1 lot-trim**, wire 25.8 mm² class (J 2.84) — **re-issued on the CATALOG core (AL 37 ±8%, Ae 2.27 cm²)**: the E41 N=23 was the engine's geometric-Ae output and computes L0 98 µH / 55 µH @104 A on the real part, missing its own floor and inflating the D6/LISN ripple basis to 32 A pp | L0 **116 µH** nom, accept **106–135** (lot-trim window) · **L@104 A pk ≥ 61 µH** · dIpp ≤ 28 A nom · Rdc ≤ 7.0 mΩ · ΔT ≤ 45 K (calc 30) · fill 36 % |
| **D2-40 rev D (E60)** resonant trim `IND-TRIM-E70-40` | **1× E70/33/32 gapped (N97/PC95-class, single-set former B66372B1000T001), N = 5**, bins 3.2/3.5/3.8 µH ±3 % by distributed gap grind (AL 128/140/152 nH/T²), **litz 4150×0.071 mm (16.4 mm²)** — the E43 2× PQ50/50 N 5 / 2000×0.1 route computed Sullivan Rac/Rdc 4.3 (13.6 W at the SER corner; the DC×1.15 model said 4.3 W) | Bpk 97 mT at the simulated 87.4 A pk · fault flux 181 mT ≤ 217 · **Rac ≤ 2.6 mΩ @140 kHz (calc 2.29)** · **ΔT 32 K continuous / 38 K SER corner** ≤ 40 · mass ~0.55 kg |
| **D3-40 rev B (E51)** transformer | 2× E70/33/32 sets on TDK stack former **B66372B2000T001** (AN 389 mm², lN 230.5 mm — datasheet Oct-2024), **6:6:6**, compacted-profile litz primary (**E60: ≈3486×0.071 mm**) + **Cu-foil TIW-barrier secondaries (E60: 0.127 × 28 mm, Rac/Rdc 1.29; the 0.25 mm foil computed 5.1)**, leakage ENGINEERED to 3 ±0.7 µH (interleave spacer = the knob; measured & labeled per unit, bins unchanged) | **The registered 9:9:9 was unbuildable**: its litz+TIW+margin wind demands ~2.4× the former window (window study, E51), and the "Bpk 108 mT identical" claim was a ×1.8 error (9:9:9 ran 60 mT). Rev B: **Bpk 90 mT** · Fe 14.4 + Cu 19.9 ≈ 34 W/section (real-MLT) · window 88 % of AN · hotspot ≤ +55 K WITH clamp-to-extrusion web bond (type-test) |
| **D6-40** | **rev C engine row (see D6 section): 2× T57 60µ, N=8, foil 26.4 mm²** — constant-J alone was NOT enough, the core bias was the binder | L(109 A pk) = 10.5 µH ≥ 9.2 floor · 4.4 W · ΔT 14 K |
| **D7-40** | same construction, CSA × 4/3 at constant J ≤ 5.6 A/mm² | ΔT acceptance carried; custom wind (63 A catalog part out of range) |
| CTs | line: **E60 → 150 A class (Talema ACX-1150) on 18 Ω** — F.01 155 A pk + 50 A race needs linearity past the ACX-1100's ~179 A · resonant: **80 A-class 1:100 on 0.91 Ω** (F.11 115 A pk) | no saturation below 1.25 × (F.xx + race) at 25 °C, or demonstrated at 85 °C |

## E42 variant drawings (50 kW LIQUID module — deltas only; sealed, magnetics plate-bonded)

Every magnetic below is **gap-pad-bonded to the coldplate webs** (the sealed module has no
airflow); the convective ΔT figures stay as the conservative acceptance gates, the plate bond is
the mechanism that beats them — plate thermal RFQ verifies.

| Drawing | 50 kW variant | Acceptance |
|---|---|---|
| **D1-50 rev B (E51)** PFC choke | **5× T79 26µ** (same core p/n as D1-40), **N = 24 ±1 lot-trim**, wire 25.8 mm² (J 3.55) — **re-issued on the CATALOG core**: the E42 N=22 was geometric-Ae output (90 µH real, 44 µH @129.5 A); on catalog AL **no N on the 5-stack** holds both the 34.8 A pp basis and the 0.40 swing floor, so the basis is restated honestly | L0 **107 µH** nom, accept **98–124** · **L@129.5 A pk ≥ 45 µH** · **dIpp basis restated 36.2 A pp nom** (D6-50 equal-margin floor restates to 11.8 µH — the built D6-50 delivers 12.9; LISN DM margin stays ≥ +5.2 dB) · swing 0.405 ≥ 0.40 · ΔT ≤ 45 K (calc 41; plate/web-bonded per E42/E44) |
| **D2-50 rev D (E60)** resonant trim `IND-TRIM-E70-50` | **2× E70/33/32 gapped, N = 3**, bins **2.8/3.0/3.2 µH** ±3 % (AL 311/333/356 nH/T²), **litz 2500×0.1 mm (19.6 mm²)** — the E44 2× PQ50/50 N 6 / 3000×0.1 route computed **Sullivan Rac/Rdc 11.7 → 45 W at the SER corner** (DC model: 5.4 W); no strand count on the PQ50 held 40 K, the 41 mm E70 window and N 3 cut the winding field 2.6× | Bpk 85 mT at the simulated 108.8 A pk · fault flux 154 mT · **Rac ≤ 2.0 mΩ (calc 1.61)** · Cu 9.4 W + Fe 7.1 W → **ΔT 31 K** ≤ 40 — ONE drawing serves liquid AND air · mass ~1.1 kg |
| **D3-50 rev B (E51)** transformer | **2× E70/33/32 sets** on the SAME B66372B2000T001 former as D3-40, **5:5:5**, compacted-profile litz primary (**E60: ≈4370×0.071 mm**) + Cu-foil TIW-barrier secondaries (**E60: 0.127 × 28 mm, Rac/Rdc 1.20; the 0.30 mm foil computed 6.7**), leakage engineered 3 ±0.7 µH | **The registered 3×E70 route required a 3-set former that DOES NOT EXIST** (TDK offers 1- and 2-set only) and still demanded ~1.2× its window; and while its N·Ae matched the 40 kW's, both ran 60 mT — the "108 mT" transcription was a ×1.8 error. Rev B: **Bpk 109 mT** (30 kW class) · Fe 24.4 + Cu 20.7 ≈ 45 W/section · window 91 % · **transformer clamp bonds to coldplate/extrusion web MANDATORY** (the D2-50/D1-50 bond practice) · hotspot ≤ +55 K with bond (type-test) |
| **D6-50** | **rev C engine row (see D6 section): 3× T57 60µ, N=8, foil 26.4 mm²** | L(136 A pk) = 12.9 µH ≥ 11.4 floor · 8.1 W · ΔT 19 K plate-bonded |
| **D7-50** | same construction, CSA × 5/3 at constant J ≤ 5.6 A/mm² | ΔT acceptance carried; custom wind 95 A |
| CTs | line: **150 A-class 2500:1 — Talema ACX-1150** (linear to 200 A at 33 Ω; own 38.1 mm land), **E60 burden 13 Ω** (F.01 195 A pk, observable to 311 A) · resonant: **100 A-class 1:100 on 0.75 Ω** (2 W part; F.11 145 A pk, observable to 216 A) | the E42 21.5 Ω / 1.6 Ω burdens saw only to 187 A / 104 A — current-coordination gate carries the per-SKU race proof |

## E44 variant note (50 kW AIR module — same magnetics set as E42)

The air twin (`50kwa`) uses the **identical D1-50 / D2-50 / D3-50 / D6-50 / D7-50 set** — the
classes were set by current, not coolant, and `skuOverrides["50kwa"] = {...skuOverrides["50kw"]}`
enforces it. Air-specific notes: D1-50's 37 K and D6-50's 19 K convective figures now sit in
real fan airflow (conservative); D2-50's E44 litz rev (3000×0.1) exists precisely so one trim
drawing serves both coolings at ≤40 K. The only new POWER part on the air twin is silicon, not
magnetic: 6× paralleled LLC FETs (E44 register row).

