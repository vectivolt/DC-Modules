# E40 (PROPOSED) — Single Control Card per Module ("one brain, one source of truth")

**Status: PLAN — not yet executed.** Directive 2026-09-08: multiple cards per module create their
own problems; a module should be a single control system, and the cabinet CAN should carry fewer,
clearer voices. This document is the full migration plan with costs, pros and cons. Execution
begins only on "go"; until then the shipped design remains the audited two-card rev.

---

## 1. What changes, in one paragraph

Today a 30 kW module carries **two identical cards** (AC-DC role + DC-DC role, linked by UART).
After E40 it carries **one card** — same 120×80 concept, one 144-pin MCU — seated in the **DC-DC
board slot** (LLC PWM, output sensing, S/P relays, HMI and CAN stay local). The AC-DC board keeps
its drivers, hardware comparators and safety chain but loses its card slot; its control signals
(3× logic-level PWM @50 kHz, 11 analog senses, enables/faults, fan) cross on the inter-board
harness, which grows 16-way → ~40-way. The inter-card UART link dies. A module becomes **one CAN
node**; a 120 kW cabinet becomes **5 nodes** (4 modules + CSU) instead of 9. The CSU role is
unchanged — same new card p/n, third strap band, same carrier.

## 2. MCU selection (the "really capable, market standard" requirement)

Needs (from the built netlists, merged roles): **9 PWM channels / 6 complementary units · 22
analog channels · ~55–60 digital I/O · ~76 functional interface ways** → a **144-pin** package is
required (100-pin has ~80 usable I/O — this is the only reason today's part doesn't fit).

| Candidate | Family / school | Fit | Price @1k | Pros | Cons |
|---|---|---|---|---|---|
| **GD32G553ZET6 (144-LQFP)** ★ | same die as today, bigger package | HRTIMER 8×2 ✓ · 4 ADCs, channel count grows with package ✓ · I/O ✓ | ≈ ₹230 | 216 MHz M33 + TMU (more raw capability than the classic charger DSPs); **everything already verified carries over** — HRTIMER scheme, comparator-kill protection, pin-allocation methodology, firmware image, supply-chain policy; net BOM goes *down* (one ₹230 part replaces two ₹210 parts) | not the TI-DSP badge; GD-ecosystem tooling |
| TI TMS320F28P650DK (176-LQFP) | C2000 — *the* charger-module school (UUGP/Delta lineage) | 24 ePWM ✓ · 3 ADC ✓ · I/O ✓ | ≈ ₹500 | the literal market standard; CLA/CPU2 headroom; CMPSS hardware protection | full toolchain flip (C28x, CCS), redo of the entire pin-allocation doc + symbol + HAL plan, new vendor line outside the cost policy, +₹80 vs today's two MCUs |
| STM32G474ZET6 (144-LQFP) | ST HRTIM school | HRTIM 6×2 = 12 ch ✓ (exactly) · 5 ADCs ✓ | ≈ ₹380 | original of the G-class school; strong app notes | zero-margin on PWM channels; abandons the GD clone advantage while keeping its architecture; pricier |

★ **Recommendation: GD32G553ZET6.** "Really capable" is satisfied on the merits (216 MHz, FPU,
TMU, HRTIMER, windowed comparators — objectively above the F28004x-class parts inside most fielded
modules), "market standard" is satisfied by school (G4/G5-class HRTIM control is a mainstream
charger/OBC architecture), and it is the only candidate where the E35 HRTIMER decision, the R3
pin-methodology, the protection scheme and the one-image firmware **survive intact**. The TI part
is recorded here as the named alternate if the DSP badge ever becomes a customer requirement.

## 3. Target architecture

- **Card:** rev-2 control card, GD32G553ZET6, ~90-way interface (76 functional + rails), seated on
  the DC-DC board. Strap bands unchanged in concept: RATING 0 Ω = 30 kW module-controller,
  3.32 k = CSU (ROLE0 strap retires with the second slot).
- **Harness (E17 rev):** 16-way → **~40-way**: 3× PFC PWM (logic level — the NSI6611 drivers stay
  on the AC-DC board), 11 analog senses (CT×3, VAC×3, VBUS/VMID, temps), GATE_EN/FLT/EN/RDY,
  fan PWM/tach ×2, V15/GND, shield. Analog crossing the harness is the one real engineering risk —
  see cons.
- **Safety unchanged in principle:** both boards keep their hardware comparator kills, watchdog-AND
  `GATE_EN` chain and default-OFF pulldowns; harness loss ⇒ AC-DC board's gates die by hardware
  (no MCU needed for SAFE), DC-DC board's brain shuts its own side down.
- **CAN:** one node per module (single source of truth per module), CSU supervises 4 nodes.
  Claim-by-hearing, terminations, SGND conductor — all as E39.
- **SKU consequence:** the 2-lane 60 kW *reference* boards exceed any single MCU (12 LLC + 6 PFC
  channels) — they retire to the same status as the 120 kW pair. `BUILDABLE_SKUS = ["30kw"]`;
  the 60 kW **product** was already 2 × 30 kW and is unaffected.

## 4. Cost delta (@10k, per 30 kW module)

| Item | Δ |
|---|---|
| delete second card assembly | **−₹319** |
| delete one 88-way connector pair | **−₹120** |
| one ZET6 replaces two VET6 | **−₹190** |
| new ~90-way slot vs 88-way (like for like) | ≈ ₹0 |
| harness 16 → 40-way (shell + crimps + wire) | **+₹90** |
| **Net** | **≈ −₹540/module · −₹2.2k per 120 kW cabinet (~1.8 % of COGS)** |

(Bigger than the first estimate because the second MCU and its connector go away too.)

## 5. Pros and cons — complete and honest

**Pros**
1. **Single source of truth per module** — one FSM owns PFC+LLC+protection state; no inter-card
   link protocol, no link-loss corner cases (F.27 class shrinks), no cross-card state disagreement.
2. **CAN population halves** (9 → 5 nodes at 120 kW): simpler arbitration picture, simpler
   supervision, exactly the concern raised.
3. **Matches the dominant market construction** (single controller per module).
4. **BOM down ~₹540/module** — the largest clean lever found so far that doesn't touch margins.
5. Fewer parts to place, test, and stock; module EOL test drives one brain.
6. Firmware simplifies: the role-split image becomes one module image (+ CSU band); the UART link
   codec and its tests retire.

**Cons / risks (with mitigations)**
1. **Metering-grade analog crosses the harness** — the ±0.18 % accuracy chain (CT and VAC senses)
   now rides ~10 cm of cable. *Mitigation:* differential/AVMID-referenced sends (already the
   scheme), shielded pairs on the four metering-critical lines, accuracy re-verified in the sim
   deck at RFQ-cable parasitics; EVT gets an explicit harness-injection test. Residual risk: real.
2. **Reopens the frozen chain** E17 (harness), E35 (card), E37 (interconnect audit), E39 (cabinet
   sheet + CSU carrier straps) + pin-allocation regeneration for 144 pins. *Mitigation:* every one
   of those has a generator + a gate; the battery decides when it's done. Effort: ~3–5 working
   days of engineering + full re-audit before the PDFs move.
3. **One brain per module = single point of failure for that module's availability** (safety is
   unaffected — hardware chains stand). *Mitigation:* at 60/120 kW the cabinet degrades N−1 by
   design (E39); at standalone 30 kW this equals the market-standard exposure.
4. **AC-DC board loses local diagnostics** (it becomes a sensed peripheral). *Mitigation:* all its
   protections were hardware-fast anyway; supervisory visibility unchanged via the same senses.
5. New connector + card qualify from scratch (the 88-way pair had a probed history).
6. The 60 kW 2-lane reference boards retire — their per-SKU gates/BOM comparisons go with them.
7. Schedule risk before EVT: this is the wrong week to do it *if* EVT hardware were imminent — it
   is not, so the window is actually ideal (nothing physical exists yet).

## 6. Execution phases (each ends with the full battery green + a commit)

| Phase | Work | Size |
|---|---|---|
| B | Card rev-2: `control-card.tsx` merged role map (`cardMap("module")`), ZET6 symbol + 144-pin allocation regenerated via `mcu-matrix`, strap logic (RATING only), CSU band carried over | ~1 day |
| C | Boards: AC-DC slot → harness header, DC-DC hosts the single slot; `InterconnectSignals` 40-way rev; E17 doc rev | ~1 day |
| D | Audits + firmware: interconnect audit rewrite (single slot + 40-way semantics), polarity/verify untouched, firmware role-merge (fsm unchanged, link codec retired, suite target ≥45 checks), cabinet sheet strap/carrier update | ~1 day |
| E | Docs (E40 register FROZEN, scope doc rev, README rows), BOM regen, PDF sets, memory | ~½ day |

## 7. Go / no-go criteria

Go when: (a) this plan is approved; (b) the ZET6 (or the TI alternate) is confirmed as the
baseline; (c) it is accepted that the 60 kW reference boards retire. No-go triggers during
execution: merged pin allocation fails the generator's uniqueness asserts, or the accuracy deck
shows the harness-crossed metering cannot hold ±0.5 % spec with margin — either reverts to the
two-card rev (which remains tagged and shippable).
