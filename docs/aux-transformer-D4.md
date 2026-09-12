# D4 turns sheet — rev D (E52 saturation-margin re-core; electricals of rev C unchanged)

<p align="left"><img src="https://img.shields.io/badge/status-LIVE__SPEC-2ea44f?style=flat-square" alt="LIVE__SPEC"/> <img src="https://img.shields.io/badge/rev-E52-f2b705?style=flat-square" alt="rev"/> <img src="https://img.shields.io/badge/updated-2026--09--12-555?style=flat-square" alt="updated"/></p>

> **Purpose** — D4 rev D turns sheet (ETD39, E52) — electricals of rev C unchanged, saturation margin doubled.
>
> **Gate coupling** — stress-audit computes the Bpk line each run.


Stage: **110 W-class** DCM flyback, input 342–860 VDC (full unboosted bus), 65 kHz, Vor ≈ 157 V,
Ip clamp 3.2 A (CS 0.31 Ω → 1.0 V threshold), 1700 V SiC switch (72 % at 860 V + clamp ring).
Sized for the per-SKU load matrix (R2 §J), one p/n family-wide, ≥20 % corner margin at the worst
load (Lp +10 %, f −5 % worst).

Core **ETD39 PC95** (Ae 125 mm² — **rev D, E52**: the rev-C ETD34's Bpk 0.30 T reached ~85 % of
hot Bsat at Lp +10 % + clamp; ETD39 puts the same electricals at **Bpk = Lp·Ip/(Np·Ae) =
345 µ·3.2/(38·125 mm²) ≈ 0.233 T (0.256 at Lp +10 %) = 66 % at tolerance**), gapped to
AL ≈ 239 nH/T² (unchanged): Np = 38 (Lp 345 µH), N24 = 6 (n = 0.158), N15 = 4 (n = 0.105),
Naux(VCC) = 4. Core loss ~0.4 W (larger Ve at lower B — down from ~0.9 W).
DCM proof at Vin,min 342 V full power is **Lp-based and unchanged**: t_on 3.2 µs + t_reset
7.0 µs = 10.3 µs < 13.8 µs usable ✓ (holds at Lp +10 %); the aux SPICE matrix (9/9 PASS) is
likewise Lp-based and unaffected. Rectifiers (CB-19): PIV ≈ 160 V (24 V) / 151 V (15 V/VCC) +
leakage ring → **400 V ultrafast** (UF-400V-3A SMC / US2G), never Schottky-100 V.

Insulation: primary is at bus potential — reinforced barrier pri→all secondaries (TIW
secondaries + 3 mm margin tape), hipot 4 kV 100 % (E25 SELV control domain depends on this
barrier — safety-critical traveler flag). Aux(VCC) winding is primary-side (DCN-referenced) —
functional insulation only to primary, reinforced to secondaries. Winding window: ETD39 former
AN ≈ 177 mm² relaxes the rev-C fill; Rdc limits unchanged (primary ≤ 900 mΩ, 24 V ≤ 60 mΩ,
15 V ≤ 45 mΩ, aux ≤ 45 mΩ) — the +15 % MLT sits inside them. Controller = NCP1252**D**
(14 V on / 9 V off, R6-G); bench T-09 verifies clamp thresholds, T-18 thermal at the per-SKU
load table; cold-start waveform is EVT T-29.

History: rev A EF20/half-bus · rev B ETD29/60 W (R2 CB-20) · rev C ETD34/110 W (E26 rev C) ·
**rev D ETD39 (E52)** — order code **XFMR-AUX-FLY-D**.
