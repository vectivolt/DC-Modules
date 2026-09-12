# Magnetics Manufacturing Pack — RFQ-ready spec sheets (E51, 2026-09-12)

<p align="left"><img src="https://img.shields.io/badge/status-RFQ__PACK-b4642a?style=flat-square" alt="RFQ__PACK"/> <img src="https://img.shields.io/badge/rev-E52-f2b705?style=flat-square" alt="rev"/> <img src="https://img.shields.io/badge/updated-2026--09--12-555?style=flat-square" alt="updated"/></p>

> **Purpose** — One controlled spec sheet per magnetic — quote-ready: electricals, construction, insulation, parasitics, thermal, production tests, sourcing.
>
> **Gate coupling** — magnetics-rfq-audit: 0 missing fields · mag-sync (E59) pins every identity + computed mass. Build process: [`magnetics-build-instructions.md`](magnetics-build-instructions.md).


**Scope:** every magnetic on the 30 / 40 / 50 kW modules, one controlled sheet each, written so a
winding house can quote and build without asking questions. Electricals trace to
[`magnetics.md`](magnetics.md) (the design record) and the E51 recomputation; this pack adds the
drawing-control block, parasitic limits, construction/lay-up detail, and per-part production-test
tables that §0 of magnetics.md listed as open. Where the two disagree, **this pack is the newer
rev** and magnetics.md carries the history.

Drawing numbers: `PMP-MAG-<part>-<sku>` rev letter per row. Common requirements (§C below) apply
to every sheet. Insulation values follow [`insulation-coordination.md`](insulation-coordination.md)
(PD2 / material IIIa; reinforced pri↔sec = 12.6 mm creepage / 8.0 mm clearance / 4 kV DC hipot
100 %).

## C — Common requirements (all parts)

| Item | Requirement |
|---|---|
| Insulation system | **UL 1446-recognised SYSTEM, Class F (155 °C) minimum**; Class H (180 °C) for D3. Organic materials UL 94 V-0. |
| Thermal basis | Full power to +55 °C ambient, derate to +75 °C (A11). ΔT acceptance limits are per-sheet; thermocouple positions stated per-sheet. |
| Low-temp / environment | **A11 rev B (E52, registered):** operating −25…+55 °C full power (derate to +75), cold start ≥ −25 °C, storage/transport −40…+85 °C — quote adhesives/potting/litz bonding to −40 °C. Humidity 5–95 % RH non-condensing; boards are acrylic conformal-coated (E52 baseline) — parts must accept coated boards adjacent. |
| Vibration | 2 g 10–500 Hz sine sweep survival (bonded/banded construction; IEC 60068-2-6 class) — toroid stacks epoxy-banded, not tape-only. |
| Traceability | Lot + date code on every part, traceable to core lot and wire lot. First article: dimensional vs the mechanical row, full electrical vs the acceptance rows, cross-section/teardown for D3 and D4 (reinforced-barrier parts). |
| 100 % tests | Every acceptance-row electrical + every stated hipot, 100 % end-of-line at the winder. Sampled tests marked (S). |
| Packaging | Individually celled — computed masses (E59): D1 ≈ 2.2–3.0 kg · D3 ≈ 0.8–1.5 kg · D2 ≈ 0.45 kg; parts damage each other in bulk packing. |
| RoHS/REACH | Required; declare materials on first article. |

**Core / material / wire sourcing directory** (design intent — purchasing selects within class):

| Class | Primary | Alternates (qualified equivalents) |
|---|---|---|
| Sendust (Kool Mµ-class) toroids 26µ/60µ | Magnetics Inc 0077908A7 (T79 26µ), 0077439A7 (T48 60µ) | Chang Sung (KR) CS series · POCO (CN) KS series · DMEGC sendust — **AL and roll-off curve must match the Magnetics part within ±8 % / anchors in A3** |
| T57 60µ toroid (OD57/ID26/H20) | **Chang Sung CH571060** (High Flux µ60; cross: Magnetics 58192-A2) — the core Microchip's 30 kW Vienna reference runs at 46 A rms/140 kHz (deep-research verified 2026-09-12) | POCO KS-571060-class sendust — High Flux rides HIGHER than the sendust design anchors (better bias, Bsat 1.5 T), so the D6 floors only gain margin; sample-measure L(I) before PO either way |
| PC95-class MnZn ferrite (PQ50/50, E70/33/32, ETD34) | TDK PC95 / Ferroxcube 3C95 | DMEGC DMR95/DMR96A · TDG · Acme — loss ≤ A4 fit (396 mW/cm³ @100 kHz/±200 mT/100 °C; DMEGC PQ50/50 DMR95 guarantees ≤23.95 W/set = 580 max / ~300 typ kW/m³ at that point — verified from the DMEGC datasheet 2026-09-12). **Vendor PQ50/50 geometries differ** (DMEGC Ae 363.8 mm² vs Ferroxcube/TDK 328): the gap is ground to an AL target, so geometry substitution is absorbed — but re-check Bpk if the winder proposes the larger-Ae part. Cosmo Ferrites (India) = N87-class only; PC95-class stays import (recorded) |
| E70 formers | TDK **B66372B2000T001** (2-set stack, AN 389 mm², lN 230.5 mm) · B66372B1000T001 (1-set) | mechanically-equivalent CN former tooling — dimensioned per TDK drawing, Class F material |
| Litz (served, compacted/profile) | Elektrisola (incl. Elektrisola India for bare litz) | Pack Litz · New England Wire — 0.1 mm strands (grade 1), profile/compacted rectangular where the sheet says so |
| TIW / FIW barrier | Furukawa TEX-E (TIW) · FIW per IEC 60317-56 | Rubadue Tri-Ins. — TIW on litz = served litz inside extruded triple wall |
| Nanocrystalline CMC cores | VAC VITROPERM 500F (T60006 class) | King Magnetics · Qingdao Yunlu · AT&M — Schaffner RT8131-63-2M8 is the 30 kW catalog part |
| CTs | Talema ACX-1100 (line) / AS-404 (resonant), Salem India | ZEMCT/HCT class (line) · Coilcraft CST2010-100L (resonant) |
| Winding houses (10k modules/yr ⇒ ~30k D1+D3 pcs/yr each) | Talema Salem (toroids/CTs, India) · EV-magnetics houses CN (Sumida-class, POCO winding service) | second source mandatory before MP; the D3/D4 reinforced barrier makes the winder a SAFETY-CRITICAL supplier (traveler flag) |

---

## PMP-MAG-D1-30 rev B — PFC swing choke, 165 µH class (`IND-PFC-165u`) — qty 3

| Row | Spec |
|---|---|
| Function / circuit | Vienna PFC phase inductor, 50 kHz boost duty, DC-bias + ripple (swing design) |
| Core | **3× Magnetics 0077908A7** stacked (Kool Mµ 26µ toroid OD79.4/ID48.4/H17.15; AL 37 nH/T² ±8 % per core; epoxy-band the stack) |
| Winding | **N = 39 nominal, winder trims ±1 turn per core lot** so both L rows hold across AL ±8 %. Conductor: **9× 1.6 mm enameled round in parallel (18 mm², 2-layer)** — PRIMARY construction (machine-windable); 3×(6×1 mm) flat on edge is the ALTERNATE only if hand-wound; spread ≥300° |
| Electrical acceptance (100 %) | L₀ @0.1 V/100 kHz: **150–185 µH** · **L @78 A pk (pulse method) ≥ 75 µH** · Rdc ≤ 11 mΩ @25 °C |
| Operating point (info) | 54.9 A rms / 77.7 A pk + 21.4 A pp ripple @50 kHz; Cu 32–34 W + Fe ~2 W; J 3.05 A/mm² |
| Parasitics | SRF ≥ 500 kHz (≥10× fsw) · winding–core capacitance no spec (functional) |
| Insulation | winding–core 500 VAC 1 min (functional; part floats on mount); Class F system |
| Thermal | ΔT ≤ 45 K at 54.9 A rms in 2 m/s airflow; thermocouple at inner bore |
| Mechanical | finished ⌀ ≤ 87 mm × H ≤ 62 mm; M6 centre bolt + silicone pad; 2× tinned flying leads 60 mm into plated holes ⌀6.0 mm; mass **~2.2 kg (computed — mag-sync, E59)** |
| Production test | 100 %: L₀, L@78 A (pulse), Rdc, 500 VAC. (S) 1/lot: L(I) curve 0–100 A, ΔT type-test 1/first article |

## PMP-MAG-D1-40 rev B (E51) — PFC swing choke 40 kW (`IND-PFC-116u-40`) — qty 3

As D1-30 except:

| Row | Spec |
|---|---|
| Core | **5× 0077908A7** stacked (same p/n; stack H ≈ 86 mm, epoxy-banded) |
| Winding | **N = 26 ±1 lot-trim**, conductor 25.8 mm² class = **8× 2.0 mm or 13× 1.6 mm enameled round**, 2-layer, spread ≥300° |
| Electrical acceptance | L₀ **106–135 µH** (lot-trim window; 116 nominal) · **L @104 A pk ≥ 61 µH** · Rdc ≤ 7.0 mΩ |
| Operating point | 73.3 A rms / 103.6 A pk + 27.5 A pp @50 kHz; ~39 W; J 2.84; ΔT calc 30 K |
| Mechanical | ⌀ ≤ 87 × H ≤ 100 mm; M6 centre bolt; drill 6.0/pad 6.9; mass **~3.0 kg (computed, E59)** — ≥3 kg stacks take the centre bolt PLUS two-point epoxy banding to standoffs (2 g rule) |
| Note | **Rev B re-issued on the CATALOG core** — the E41 N=23 selection came from a geometric-Ae model and misses its floors on the real part (E51). Any equivalent core must match AL 37 ±8 % AND the 26µ roll-off anchors. |

## PMP-MAG-D1-50 rev B (E51) — PFC swing choke 50 kW (`IND-PFC-107u-50`) — qty 3

As D1-40 except:

| Row | Spec |
|---|---|
| Winding | **N = 24 ±1 lot-trim**, 25.8 mm² |
| Electrical acceptance | L₀ **98–124 µH** (107 nominal) · **L @129.5 A pk ≥ 45 µH** · Rdc ≤ 6.5 mΩ |
| Mass | **~2.9 kg (computed, E59)** — centre bolt + two-point banding |
| Operating point | 91.6 A rms / 129.5 A pk + 36.2 A pp @50 kHz; ~57 W; J 3.55; ΔT calc 41 K convective |
| Cooling interface | **gap-pad bond of the stack face to the coldplate/extrusion web** (E42/E44 practice) — flatness of the bonded face ≤ 0.5 mm; convective ΔT row is the acceptance gate, the bond is the mechanism |
| Note | dIpp basis restated 36.2 A pp at E51 (catalog core; D6-50 floor restated 11.8 µH — met at 12.9). 6-stack variant (holds 34.8 A pp) on record but declined pending tunnel-height check. |

## PMP-MAG-D2-30 rev C — resonant trim inductor bin set (`IND-TRIM-BIN4`) — qty 3

| Row | Spec |
|---|---|
| Function | LLC external resonant inductor, **full AC swing** 46.4 A rms sinusoidal @140 kHz, tank potential |
| Core | 2× stacked PQ50/50, **PC95/DMR95/3C95-class** (powder cores PROHIBITED in this slot — E35); bobbinless taped assembly (no catalog 2-stack former exists — tooling is the winder's fixture, not a former) |
| Winding | N = 4, litz **1350×0.1 mm served (10.6 mm² Cu — E52: J 4.38, same litz as the D3-30 primary, one spool)**, winding kept ≥5 mm clear of gaps (margin tape) |
| Gap / bins | total ≈3.3 mm distributed 2 positions/leg, **ground per bin**: 3.3 / 3.65 / 4.0 / 4.35 µH ±3 % @140 kHz 0.1 V. Bin SELECTED at kitting against the mated transformer's leakage label → Lr(total) = 7.0 µH ±3 % |
| Flux / loss | Bpk ≤ 100 mT @65.6 A pk (bin-max) · Fe ≈ 7 W worst-corner + Cu ≈ 3.3 W |
| Parasitics | Rac ≤ 4 mΩ @140 kHz · SRF ≥ 700 kHz (≥5× fr) · winding–core C ≤ 100 pF |
| Insulation | winding→core hipot 2.5 kV AC 1 min (functional — barrier is elsewhere); Class F |
| Thermal | ΔT ≤ 40 K at 46.4 A rms continuous (calc 38 worst corner); thermocouple on core leg |
| Mechanical | 68 × 56 envelope, 2× M4 clamp bar — **non-magnetic stainless (A2/A4), slotted over the gap plane, no closed conductive loop, ≥8 mm from any gap face (E58 fringing-eddy rule)**; 2 tinned litz flying leads, drill 4.44/pad 5.34 |
| Production test | 100 %: L@bin (140 kHz), Rdc, hipot, bin label. (S) Rac @140 kHz 5/lot, ΔT first-article |

## PMP-MAG-D2-40 rev C — trim bin set 40 kW (`IND-TRIM-BIN5-40`) — qty 3

As D2-30 except: **N = 5**, bins **3.2 / 3.5 / 3.8 µH ±3 %**, litz **2000×0.1 mm (15.7 mm²)**;
Bpk ≤ 100 mT @87.5 A pk (calc 93); 61.9 A rms; ΔT ≤ 40 K (calc 35); Rac ≤ 3 mΩ.

## PMP-MAG-D2-50 rev C — trim bin set 50 kW (`IND-TRIM-BIN6-50`) — qty 3

As D2-30 except: **N = 6**, bins **2.8 / 3.0 / 3.2 µH ±3 %**, litz **3000×0.1 mm (23.6 mm²)**;
Bpk ≤ 100 mT @109.3 A pk (calc 83); 77.3 A rms; ΔT ≤ 40 K (calc 33) — one drawing serves the
liquid AND air 50 (plate bond belt-and-suspenders on the sealed module).

## PMP-MAG-D3-30 rev C (E51 construction) — LLC transformer 10 kW (`XFMR-LLC-10K`) — qty 3

| Row | Spec |
|---|---|
| Function | LLC section transformer, 10.2 kW, 140 kHz square-wave excitation, 415 V half-cycle volt-seconds (1.48 mVs), bidirectional flux |
| Ratio / magnetizing | **7 : 7 : 7 exactly** (Np : Ns1 : Ns2) · **Lm = 63 µH ±7 %** (centre-leg grind to AL 1.286 µH/T², glue-stacked) · leakage **3 ±0.7 µH primary-referred — ENGINEERED, see lay-up** |
| Core | 3× PQ50/50 sets PC95-class, bobbinless 3-stack (no catalog stacked former — winder fixture; centre posts aligned, grind on centre legs only) |
| Windings (E51 construction rev) | Primary: **compacted/profile rectangular litz ≥9.8 mm² Cu** (e.g. 1250×0.1 profiled). Secondaries: **copper foil ≥4.9 mm²/turn equivalent (0.20 × 28 mm foil), 7 turns each**, TIW/FIW barrier wrap OR 3.2 mm margins — **never both** (double barrier ate 18 % of the window; window closes at ~75 % with this construction). Lay-up S1–spacer–P–spacer–S2; **spacer thickness is the leakage knob** (first-article curve: spacer → measured leakage, then frozen) |
| Shield | 1-turn Cu foil between P and each S, flying lead → primary star |
| Insulation | pri↔sec **REINFORCED**: TIW/FIW barrier (solid-insulation route per IEC 62477-1) or margin construction; hipot **4.0 kV DC 1 s 100 %**; pri↔core 2.5 kV; **PD sample ≤10 pC @1.5 kV pk, 5/lot**; Class H preferred; creepage over surface 12.6 mm where margins used |
| Electrical acceptance (100 %) | turns 1:1:1 exact · Lm 63 µH ±7 % @10 kHz 0.1 V · **leakage measured @140 kHz and LABELED per unit** (kitting input — a part without its label is unusable) · Rdc P ≤ 2.0 mΩ, S ≤ 4.2 mΩ each |
| Parasitics | Rac/Rdc ≤ 1.35 @140 kHz (interleave keeps proximity down) · **C(pri↔sec) ≤ 150 pF with shield grounded** · C(pri self) ≤ 60 pF |
| Loss / thermal | ~21 W at design point (Fe 13 + Cu 8) · hotspot ≤ +55 K, thermocouple under barrier wrap (type-test); clamp in airflow |
| Mechanical | ≤ 96 × 50 × 52 mm; 4× M4 clamp bar — **non-magnetic stainless, slotted, ≥8 mm from any gap face (E58)**; 7 flying litz/foil terminations onto pins @10 mm pitch; mass **~0.8 kg (computed, E59)** |
| Production test | 100 %: ratio, Lm, leakage+label, Rdc×3, hipot 4 kV, pri-core 2.5 kV. (S): PD 5/lot, Rac 5/lot, thermal first-article + yearly |

## PMP-MAG-D3-40 rev B (E51) — LLC transformer 13.6 kW (`XFMR-LLC-2E70-40`) — qty 3

As D3-30 except:

| Row | Spec |
|---|---|
| Core / former | **2× E70/33/32 core sets** (TDK B66371, PC95/N97/DMR95-class) on stack former **B66372B2000T001** (AN 389 mm², lN 230.5 mm) — catalog former, Class F |
| Turns / flux | **6 : 6 : 6** · Bpk 90 mT · Lm 63 µH ±7 % (grind to AL 1.75 µH/T²) |
| Windings | Primary compacted litz ≥13.8 mm² (e.g. 1750×0.1 profiled) · secondaries foil 0.25 × 28 mm, 6 turns each · window 88 % — **the registered 9:9:9 litz+TIW+margin wind demands ~2.4× this former's window; do not quote it** |
| Loss / thermal | ~34 W/section (Fe 14 + Cu 20) · hotspot ≤ +55 K WITH clamp bonded to extrusion web (gap pad) — bond is part of the module assembly, flatness ≤0.5 mm on the bonded face |
| Mass | **~1.45 kg (computed, E59)** |
| Acceptance deltas | Rdc P ≤ 2.4 mΩ · S ≤ 5.2 mΩ · leakage 3 ±0.7 µH labeled |

## PMP-MAG-D3-50 rev B (E51) — LLC transformer 17 kW (`XFMR-LLC-2E70-50`) — qty 3

As D3-40 except: **5 : 5 : 5** (Bpk 109 mT — the 30 kW class) · primary ≥17.3 mm² compacted litz ·
secondaries foil 0.30 × 28 mm · window 91 % · ~45 W/section (Fe 24 + Cu 21) · **web bond
MANDATORY on both 50 variants** · Lm grind AL 2.52 µH/T² · Rdc P ≤ 1.9 mΩ / S ≤ 4.4 mΩ.
(The registered 3×E70 route is withdrawn: its 3-set former does not exist as a catalog part and
the wind still computed ~1.2× window.)

## PMP-MAG-D4 rev D (E52) — aux flyback transformer (`XFMR-AUX-FLY-D`) — qty 1

| Row | Spec |
|---|---|
| Function | 110 W-class DCM flyback, 342–860 VDC input, 65 kHz, Vor ≈ 157 V, Ip clamp 3.2 A |
| Core | **ETD39 PC95-class** (rev D, E52 saturation-margin re-core), gapped to **AL 239 nH/T²** (centre leg) — electricals identical to rev C |
| Windings | Np 38 (345 µH ±10 %) / N24 = 6 / N15 = 4 / Naux = 4; primary 0.5 mm (2×0.35 bifilar OK); secondaries TIW 0.8 mm² class; margin 3 mm (ETD39 former AN ≈ 177 mm² — fill relaxed vs rev C) |
| Flux | **Bpk 0.233 T @clamp (0.256 at Lp+10 %) vs PC95 hot Bsat ~0.39 — 66 % at tolerance** (rev C ETD34 ran 85 %); clamp-limited; **EVT T-09 verifies clamp before BOM freeze** |
| Insulation | pri at BUS potential → pri↔ALL secondaries REINFORCED (TIW + 3 mm margin), **hipot 4 kV 100 % — SAFETY-CRITICAL traveler flag** (E25 SELV depends on it); aux winding = primary-side, functional to pri, reinforced to secs |
| Acceptance | Lp 345 µH ±10 % · turns exact · Rdc: pri ≤ 900 mΩ / 24 V ≤ 60 mΩ / 15 V ≤ 45 mΩ / aux ≤ 45 mΩ · hipot 4 kV · leakage ≤ 12 µH (clamp energy) |
| Parasitics | C(pri↔sec) ≤ 50 pF · SRF(pri) ≥ 650 kHz (10× fsw) |
| Thermal | ΔT ≤ 45 K at 110 W throughput; thermocouple on primary margin tape |
| Mechanical | ETD34 8-pin former, 5.08 mm pitch, PCB pins |
| Production test | 100 %: Lp, turns, Rdc×4, hipot 4 kV. (S): leakage 5/lot, PD 5/lot @1.2 kV, thermal first-article |

## PMP-MAG-D6-30/40/50 rev C — DM line chokes (`DM-CHOKE-30/-40/-50`) — qty 3 each

Engine-designed (`emi/dm-choke-design.mjs`); acceptance = **crest-biased inductance**, which is
what attenuates at the worst emission moment:

| p/n | Core | Winding | L₀ | **L @ crest (acceptance)** | Loss | ΔT |
|---|---|---|---|---|---|---|
| DM-CHOKE-30 | 2× T48 60µ (0077439A7) | N=7, foil 0.5×40 (20 mm²) — through-bore strip wind, or 6× AWG12 bundle alt | 13.7 µH | **≥ 7.0 µH @ 82 A pk** | 2.4 W | ≤ 45 K (calc 12) |
| DM-CHOKE-40 | 2× T57 60µ (RFQ p/n) | N=8, 26.4 mm² foil/bundle | 22.9 µH | **≥ 9.2 µH @ 109 A pk** | 4.4 W | calc 14 K |
| DM-CHOKE-50 | 3× T57 60µ | N=8, 26.4 mm² | 34.4 µH | **≥ 11.8 µH @ 136 A pk** (E51 restated floor; built part delivers 12.9) | 8.1 W | calc 19 K, web-bonded on the 50s |

Common: J ≤ 5.6 · bare-Cu fill ≤ 40 % · hipot winding–core 2.5 kV · bonded mount · flying leads
into plated holes (drill per magnetics.md §0.1). Production test 100 %: L₀, L@crest (pulse), Rdc,
hipot. **T57 core p/n must be sample-verified for AL + roll-off before PO (E51 sourcing gap).**

## PMP-MAG-D7-40/-50 rev A — 3-phase CM chokes (`CMC-3PH-2mH-SKU`) — qty 2 each

| Row | Spec |
|---|---|
| Function | 3-line common-mode choke, 2 stages/module, 475 VAC system |
| Core | nanocrystalline toroid (VITROPERM 500F-class): 40 kW OD62-class · 50 kW OD80-class |
| Windings | 3× sectored windings, foil/flat: 40 kW ≥ 13.3 mm² (75 A class, J ≤ 5.6) · 50 kW ≥ 17 mm² (95 A class) |
| Electrical acceptance | **L_cm ≥ 2 mH @10 kHz** each choke · leakage(DM) 6–12 µH (feeds the DM budget — measure and report) · line-line functional insulation via sector spacing ≥ 3 mm + UL1446 tape |
| Hipot | winding–winding 2.5 kV AC 1 min · winding–core 2.5 kV |
| Thermal | ΔT ≤ 45 K at 73.3 / 91.6 A rms; thermocouple between phases |
| Mechanical | finished ⌀ ≤ 70 / 88 mm; bonded base + band; 6 leads into plated holes |
| Production test | 100 %: L_cm @10 kHz, Rdc ×3 matched ±5 %, hipot. (S) leakage LDM 5/lot, ΔT first-article |
| 30 kW note | catalog **Schaffner RT8131-63-2M8** (63 A, 2.8 mH) qualifies at 55.9 A — this drawing (wound at 10 mm²) is its second source |

## CT buy specs (catalog — quote bare, burden lives on the PCB)

| Part | Spec to quote | Acceptance |
|---|---|---|
| Line CT — Talema ACX-1100 (30/40 kW) · 150 A 2500:1 class (50 kW, RFQ) | 2500:1, ±1 %, Ø14.6 window, 4 kV hipot, PCB pins | ratio ±0.5 % 100 % · no sat below 150 A pk (187 A pk @50 kW class) — **acceptance at 25 °C carries a ×1.25 factor OR is demonstrated at 85 °C core (E58: CT core Bsat falls with temperature; the OC observability ceiling must hold hot)** · phase ≤1° @50/60 Hz · sec Rdc recorded per unit (EOL cal input) · ΔT ≤ 30 K |
| Resonant CT — Talema AS-404 (30 kW) · 80 A-class (40 kW) · 100 A-class (50 kW) | 1:100, 20–200 kHz, Ø8 pass-through (tank wire = primary) | ratio ±0.5 % **at 140 kHz** · no sat below 100 A pk (×1.25 at 25 °C or shown at 85 °C — E58) · ΔT ≤ 30 K at rated tank current — a line-frequency core does NOT serve this slot |

## Build & validation method (applies to quotes)

1. **First article (every p/n):** dimensional vs mechanical row → full electrical vs acceptance →
   L(I) or leakage curve as stated → thermal type-test at the operating row → **thermal shock
   IEC 60068-2-14 Na, 5 cycles −40 ↔ +125 °C, then re-test the electrical row (E58 — litz bonds,
   gap glue, banding)** → cross-section for D3/D4 (barrier photos in the FA report).
2. **D3 leakage-engineering step (one-time per variant):** wind 3 units at 3 spacer thicknesses,
   measure leakage @140 kHz, freeze the spacer for 3±0.7 µH, record the curve in the FA report.
   Then production leakage spread feeds the existing D2 bin-kitting flow unchanged.
3. **Sendust equivalence (any non-Magnetics core):** measure L(I) 0→1.3×Ipk on 5 cores/lot vs the
   A3 anchors — **at −25 °C, +25 °C and +100 °C (E58: the design carries a ±3 % µ temperature band;
   a material outside it fails equivalence even if the 25 °C curve matches)**; a lot outside ±8 % AL or softer roll-off is rejected — the drawings lot-trim ±1
   turn, they do not absorb material substitution.
4. **Production:** 100 %-test rows above; SPC on Lm/leakage (D3) and L₀ (D1) — drift beyond ±1σ
   band from FA triggers core-lot review.
5. **EVT hooks that gate BOM freeze:** T-09/T-18 (D4 clamp + thermal) · powered tank validation
   (D2 bins + D3 leakage on real hardware) · harness-injection metering test (E40 risk) ·
   both-polarity SC timing (R5-K/R6-C) · loaded PV-gate Vgs (R8-C).
