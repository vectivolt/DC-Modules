# D4 turns sheet — rev C (generated with the E26 rev C / R2 CB-19/CB-20 closure)

Stage: **110 W-class** DCM flyback, input 342–860 VDC (full unboosted bus), 65 kHz, Vor ≈ 157 V,
Ip clamp 3.2 A (CS 0.31 Ω → 1.0 V threshold), 1700 V SiC switch (72 % at 860 V + clamp ring).
Sized for the per-SKU load matrix (R2 §J): 27–42 / 40–53 / **70–90 W** steady at 30/60/120 kW —
one p/n family-wide, ≥20 % corner margin at 120 kW (Lp +10 %, f −5 % worst).

Core **ETD34 PC95** (Ae 97.1 mm²), gapped to AL ≈ 239 nH/T²: Np = 38 (Lp 345 µH),
N24 = 6 (n = 0.158), N15 = 4 (n = 0.105), Naux(VCC) = 4. Bpk = Lp·Ip/(Np·Ae) =
345 µ·3.2/(38·97.1 mm²) ≈ **0.30 T** (DCM full swing — PC95 at 65 kHz, ~0.9 W core).
DCM proof at Vin,min 342 V full power: t_on = 3.2 µs + t_reset = 7.0 µs = 10.3 µs < 13.8 µs
usable ✓ (holds at Lp +10 %). Rectifiers (CB-19): PIV = Vo + 860·n ≈ **160 V (24 V) /
151 V (15 V/VCC)** + leakage ring → **400 V ultrafast** (UF-400V-3A SMC / US2G), never Schottky-100 V.

Insulation: primary is at bus potential — reinforced barrier pri→all secondaries (TIW secondaries
+ 3 mm margin tape), hipot 4 kV 100 % (E25 SELV control domain depends on this barrier). Aux(VCC)
winding is primary-side (DCN-referenced) — functional insulation only to primary, reinforced to
secondaries. Rev C — bench T-09 verifies NCP1252A UVLO/BO thresholds and thermal (T-18 at the
per-SKU load table).
