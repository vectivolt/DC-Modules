# Magnetics Build Instructions — how each part is actually made (E59)

<p align="left"><img src="https://img.shields.io/badge/status-WORK__INSTRUCTIONS-b4642a?style=flat-square" alt="wi"/> <img src="https://img.shields.io/badge/rev-E60-f2b705?style=flat-square" alt="rev"/> <img src="https://img.shields.io/badge/AC_copper-conductor--audit-2ea44f?style=flat-square" alt="ac"/> <img src="https://img.shields.io/badge/pairs_with-manufacturing__pack-5f8fc0?style=flat-square" alt="pack"/></p>

> **Purpose** — the step-by-step *process* behind every RFQ sheet: winding sequence, lay-up
> order, computed wire cut lengths, tape schedules, termination prep, impregnation, and the
> in-process hold points. The [pack](magnetics-manufacturing-pack.md) says WHAT to build and
> accept; this document says HOW, so two different winding houses produce the same part.
> Masses, windows and floors referenced here are the gate-computed values (`mag-sync`,
> `temp-critique`, stress-audit) — nothing in this file is a new number source.
>
> [!IMPORTANT]
> **E60 copper revision is built here:** D3 secondaries on **0.10 × 28 mm** (30 kW) / **0.127 × 28 mm** (40/50 kW)
> foil, D3 primaries in **0.071 mm** strands, D2-40 on **1× E70 N 5 (4150×0.071)**, D2-50 on **2× E70 N 3
> (2500×0.1)**. Foil gauge and strand size are **electrical** parameters (Dowell/Sullivan, see
> [`conductor-selection.md`](conductor-selection.md)). A substitution at equal copper area is a construction change.
>
> Hold points are mandatory: **H1** after winding (pre-impregnation electricals) · **H2** after
> impregnation/cure (full acceptance row) · **H3** final (hipot + label). A part that fails H1
> is reworked before varnish — after varnish it is scrap. D3/D4 barrier steps are
> safety-critical traveler operations (100 % witnessed, never sampled).

## U — Universal process rules (all parts)

1. **Incoming**: cores per the pack's equivalence tests (AL band; sendust L(I) at −30/+25/
   +100 °C; ferrite lot cert vs the A4 loss line). Wire: litz continuity + strand count spot
   check (resistance per metre vs table); TIW/FIW spark-test cert on the reel.
2. **Litz handling**: minimum bend radius 5× bundle OD; never draw litz over a sharp edge
   (broken inner strands are invisible and shift Rac); serve ends with heat-shrink before
   cutting so the rope cannot bird-cage.
3. **Litz termination** (every litz part): strip serving 12 mm → solder-pot tin at
   **400 ±20 °C, 3–5 s** (Class 155 solderable PU; **Class 180 PU needs 420–440 °C** — follow the reel's
   solderability sheet) with rosin flux until strands wet through (enamel burns off in the pot, so no pre-strip);
   **0.071 mm strands (E60): 2–3 s** to avoid strand erosion. Wick excess; inspect the cut face: 100 % strands
   bonded, no dry core. TIW litz: strip the triple wall back **exactly to the drawing's strip
   window** with a thermal stripper — never a blade (nicked wall = failed barrier).
4. **Foil windings**: deburr slit edges (finger test + 10× visual); fold-back terminations
   (no soldered joint inside the winding body); interlayer insulation overhangs foil edge
   ≥2 mm both sides. **Never stack two foils in one turn position** — Dowell counts them as two
   layers; the gauge on the traveler (0.10 / 0.127 mm, ±8 %) is verified with a micrometer at goods-in.
5. **Tapes**: polyester Class F minimum (Class H system for D3): 3M 1350F-class interlayer,
   glass banding tape for stacks. Half-lap unless stated. No tape over a vent/thermocouple
   witness spot (marked on each drawing).
6. **Gap grinding (D2, D3, D4)**: grind the CENTRE leg only, both mating faces masked except
   the leg; measure AL on the assembled set after each pass with the drawing's turns-jig;
   stop inside the AL window (Lm ±7 % for D3; bin ±3 % for D2). Glue with the qualified
   Class-F epoxy, clamp, cure per epoxy sheet, RE-MEASURE after cure (cure shifts AL ~1 %).
7. **Impregnation**: vacuum varnish (Class F polyester or better), 2 dip-vacuum cycles
   (≤5 mbar, 10 min each), drain, bake per varnish sheet (typ. 120 °C ≥2 h). Mask: terminations,
   thermocouple witness spots, any coldplate bond face (bond faces must stay varnish-free for
   the gap-pad).
8. **Marking**: p/n · rev · lot/date · serial; D3 adds the measured leakage label; D2 adds the
   bin letter. Laser or indelible label rated Class F.
9. **ESD/cleanliness**: ferrite halves are brittle — padded fixtures only; no dropped core is
   ever used (invisible cracks change AL and loss).

---

## D1 family — PFC swing chokes (sendust toroid stacks)

**Parts**: D1-30 (3× 0077908A7, N=39±1, 9×1.6 mm bundle) · D1-40 (5-stack, N=26±1,
13×1.6 mm or 8×2.0 mm) · D1-50 (5-stack, N=24±1, same bundle as -40).

| Step | Instruction |
|---|---|
| 1. Stack | Dry-stack the cores on the arbor, faces cleaned; epoxy-bond faces (thin, full ring); cure clamped. **Band** the cured stack with 2 turns glass tape. Stack heights: 51 mm (30 kW) / 86 mm (40/50). |
| 2. Wrap | 1 layer 0.13 mm polyester over the full stack (winding-to-core functional insulation + abrasion base). |
| 3. Bundle prep | Cut the parallel bundle: **30 kW: 9 wires × 7.5 m** · **40 kW: 13 × 5.7 m (or 8×2.0 mm × 5.7 m)** · **50 kW: same, 5.3 m** (= MLT × N × 1.05 + 2×150 mm leads). Tape the bundle every 150 mm so it winds as one conductor. |
| 4. Wind | Machine toroid winder (shuttle loaded with the taped bundle) or two-operator hand wind for the 5-stacks. **N per the lot-trim card** (the incoming AL measurement sets 39±1 / 26±1 / 24±1). Spread ≥300°, single layer where it fits, second layer completes the count symmetrically; keep the start/finish exits 25–35 mm apart. |
| 5. Leads | Twist each exit bundle, serve with heat-shrink, tin per U3, trim to 60 mm from the core face. |
| 6. **H1** | L₀ @100 kHz/0.1 V inside the lot window (150–185 / 106–135 / 98–124 µH) · Rdc row · turns count photo. |
| 7. Impregnate | Per U7 (the varnish also locks the bundle). |
| 8. Finish | Silicone pad + centre-bolt hardware kitted; ≥3 kg stacks (40/50) get the two-point banding straps. **H2**: L₀ re-check + **L @ Ipk pulse test** (75/61/45 µH floors) · **H3**: 500 VAC winding-core, label. |

## D2 family — resonant trim inductors (gapped PQ50/50 pair, binned)

| Step | Instruction |
|---|---|
| 1. Pre-grind | Assemble the 2-core stack UNGAPPED on the winding fixture (no catalog former — the taped-tube fixture IS the former); measure baseline AL. |
| 2. Grind to bin | Grind centre legs toward the bin target (3.05–4.03 mm class total, distributed 2 positions/leg); iterate grind→assemble→measure with the N-turn jig until inside the ordered bin ±3 %. Glue, clamp, cure, re-measure (U6). |
| 3. Wrap | Margin tape both chamber ends so the winding stays **≥5 mm from every gap face**; 1 layer 0.13 mm over the legs. |
| 4. Wind | **D2-30:** 0.9 m of 1350×0.1, N = 4 spread evenly across the centre-leg window; tape each turn's crossing. **D2-40/50 (E60 rev D) — see the E70 table below.** |
| 5. Leads | Tin per U3, 60 mm flying leads. **H1**: L @140 kHz inside bin, Rdc. |
| 6. Finish | Impregnate (U7, gap faces already glued — mask nothing but leads); fit the **stainless slotted clamp bars (E58 rule: non-magnetic, ≥8 mm from gap faces, no closed loop)**. **H2**: L re-check @140 kHz + Rac ≤ row · **H3**: 2.5 kV winding→core, bin letter + label. |

### D2-40 / D2-50 rev D (E60) — gapped E70/33/32 builds

| Step | D2-40 (`IND-TRIM-E70-40`) | D2-50 (`IND-TRIM-E70-50`) |
|---|---|---|
| 1. Core + former | 1× E70/33/32 set, single-set former **B66372B1000T001** | 2× E70/33/32 sets, stack former **B66372B2000T001** |
| 2. Gap | **distributed, 3 positions** on the centre leg (spacers or ground steps). Grind to AL **128 / 140 / 152 nH/T²** for bins 3.2 / 3.5 / 3.8 µH | same method, AL **311 / 333 / 356 nH/T²** for bins 2.8 / 3.0 / 3.2 µH |
| 3. Wrap | build **≥8 mm radial clearance** over the gap plane (margin tape), 1 layer 0.13 mm over the leg | same |
| 4. Wind | **1.15 m of 4150×0.071**, N = 5, single layer spread across the 41 mm window | **1.0 m of 2500×0.1**, N = 3, single layer spread across the window |
| 5. **H1** | L @140 kHz inside the bin ±3 % · Rdc · **(first article) Rac @140 kHz ≤ 2.6 mΩ** | L in bin · Rdc · **(FA) Rac ≤ 2.0 mΩ** |
| 6. Finish | impregnate (U7) · stainless slotted clamps ≥8 mm from gap faces · **H2** L re-check · **H3** 2.5 kV winding→core, bin label | same · ≥1 kg: centre clamp + 2-point banding |

## D3 family — LLC section transformers (the safety-critical build)

**D3-30**: bobbinless 3× PQ50/50 stack, 7:7:7. **D3-40**: 2× E70 sets on B66372B2000 former,
6:6:6. **D3-50**: same former, 5:5:5. Construction: **compacted/profile litz primary +
copper-foil secondaries with the TIW/FIW barrier system** (barrier = TIW/FIW OR margins —
per the pack, never both).

Cut lengths: pri **30: 1.25 m** of profiled **2475×0.071** · **40: 1.9 m** of **3486×0.071** · **50: 1.65 m** of
**4370×0.071** (E60 strand size — same copper area as the E51 0.1 mm builds); secondary foil per winding
**30: 0.90 m of 0.10×28** · **40: 1.5 m of 0.127×28** · **50: 1.25 m of 0.127×28** (E60 Dowell gauges — the E51
0.20/0.25/0.30 mm foils computed Rac/Rdc 5–7); shields 2× (MLT + 15 mm) foil with a 100 mm lead tail.

| Step | Instruction |
|---|---|
| 1. Core prep | Grind the centre leg to the Lm AL target (63 µH ±7 % at the part's N — jig-measured) **equally on every set (E60: 3 positions on the PQ 3-stack, 2 on the E70 2-set, ≤0.5 mm each — the innermost S1 foil must never face one large gap)**, glue-stack (30 kW: the 3-set stack on the winding fixture; 40/50: standard 2-set into the B2000 former), cure, re-measure. |
| 2. Base wrap | Former/fixture tube: 1 layer barrier tape. Mark the three winding zones. |
| 3. **S1** | Wind secondary-1 foil, N turns edge-aligned, interlayer 0.05 mm film each turn, fold-back start/finish tails exiting the SAME side (bank A side). Overwrap 2 layers barrier tape. |
| 4. Shield 1 | 1 turn Cu foil, ends insulated from each other (NO shorted turn — overlap gap 3 mm taped), lead tail out to the primary-star side. Overwrap 1 layer. |
| 5. **Spacer** | Wind the LEAKAGE SPACER — plain polyester build-up to the thickness on the leakage card (first-article curve sets it; target total leakage 3 ±0.7 µH). This spacer is a controlled dimension: gauge it. |
| 6. **P** | Primary profiled litz, N turns in one layer (7/6/5), even tension (profiled litz kinks — use the guided shuttle), both tails tinned per U3 and dressed to the primary side. Overwrap 1 layer. |
| 7. Spacer 2 + Shield 2 + **S2** | Mirror of steps 5→4→3 (spacer, shield with tail to star, S2 foil with tails to bank-B side). Final overwrap 2 layers. |
| 8. **H1** (pre-varnish, all of): | turns ratio 1:1:1 exact (ratiometer) · Lm in window · **leakage @140 kHz measured → write the unit's leakage on the traveler** (this drives the D2 bin at kitting AND the spacer feedback loop) · Rdc all three (E60 lines: S ≤ 5.6 / 7.5 / 6.3 mΩ) · polarity dots verified against the drawing · **first article: Rac/Rdc @140 kHz ≤ 1.35 per winding** (shorted-secondary method). |
| 9. Impregnate | U7. Bond-face masked on 40/50 (the clamp face that takes the web gap-pad). |
| 10. Terminate | Foil tails to the pin/lug pattern (§0.1), litz tails tinned-trimmed; clamp bars fitted (E58 stainless/slotted rule). |
| 11. **H2/H3** | Full acceptance row: Lm, leakage re-check (varnish shifts it ≤2 % — the label states the POST-varnish value), Rdc, **hipot pri↔sec 4.0 kV DC 1 s — 100 %, witnessed, logged** (SAFETY-CRITICAL: this barrier is the SELV domain's life), pri↔core 2.5 kV, PD sample 5/lot @1.5 kV pk ≤10 pC, leakage label + serial. |

> [!WARNING]
> The leakage spacer is the ONLY tuning element. Never "fix" a leakage miss by re-tensioning
> or squeezing the finished winding — scrap the lay-up and correct the spacer card. The
> first-article spacer→leakage curve (3 builds at 3 thicknesses) is a deliverable **before**
> production release.

## D4 — aux flyback (ETD39, the other safety-critical barrier)

| Step | Instruction |
|---|---|
| 1 | Grind/glue the set to AL 239 nH/T² (jig at Np=38); ETD39 8-pin former. |
| 2 | **Primary first**: 38 turns of 0.5 mm (or 2×0.35 bifilar), 2 layers, 0.05 mm interlayer; tails to pins 1/2. Overwrap 2 layers + **3 mm margin tape both flange ends** (margins + TIW here — this stage keeps the classic double system because the window allows it). |
| 3 | Secondaries in order **N24 (6 T) → N15 (4 T) → Naux (4 T)** — TIW throughout, each winding spread across the full width, tails to their pin pairs; 1 wrap between windings. Aux is primary-side referenced but wound in the secondary stack: its FUNCTIONAL insulation to pri is the margin system — its position in the stack does not relax the pri barrier. |
| 4 | **H1**: Lp 345 µH ±10 % · ratio each secondary · Rdc ×4 · polarity per drawing. |
| 5 | Impregnate (U7) → **H2/H3**: Lp, leakage ≤12 µH, **hipot 4 kV pri↔all-secondaries 100 % witnessed**, PD sample, label. |

## D6 family — DM chokes (sendust/High-Flux toroid stacks, foil or bundle)

Stack + band per D1 step 1 (2× T48 / 2× T57 / 3× T57); wrap; wind **N = 7/8/8** of foil
0.5×40 fed through the bore on a foil shuttle (cut lengths 0.75/1.0/1.2 m) — or the 6× AWG12
bundle alternative where the winder lacks a foil shuttle; leads folded, tinned (foil: fold-back
lug). **H1** L₀; impregnate; **H2** the CREST-BIASED pulse test (L @ 82/109/136 A pk ≥
7.0/9.2/11.8 µH floors — this pulse test is the part's reason to exist) · Rdc; **H3** 2.5 kV
winding→core, label. 50 kW parts: mask the web bond face.

## D7 family — 3-phase CM chokes (nanocrystalline, 40/50 kW customs)

Nanocrystalline cores are strain-sensitive: **never remove the core case**; all winding on the
cased toroid. Three sectored windings at 120°, sector gaps ≥3 mm taped walls (the line-line
functional insulation AND the deliberate DM leakage element): 8 T foil per phase
(≥13.3 / ≥17 mm²), cut ~0.9 m each. **H1**: L_cm @10 kHz ≥2 mH, three Rdc matched ±5 %,
**measured DM leakage recorded** (the LISN model consumes it). NO vacuum impregnation on
nanocrystalline (varnish ingress into the case degrades µ — surface seal only). **H2/H3**:
winding-winding + winding-core 2.5 kV, label. 30 kW buys Schaffner RT8131-63-2M8 — no build.

## Test-order summary (why this order)

Ratio/Lm/leakage BEFORE varnish (reworkable) → varnish → acceptance electricals (the shipped
values) → hipot/PD LAST (a hipot before varnish stresses un-supported insulation and can
create the weakness it is looking for) → label. Every measured-per-unit value (D3 leakage,
D2 bin) is written at final test, from the post-varnish measurement.
