# D4 turns sheet — rev B (generated with the E26/CB-5/6/7 closure)

Stage: 60 W-class DCM flyback, input 342–860 VDC (full unboosted bus), 65 kHz, Vor ≈ 120 V,
Ip clamp 1.8 A (CS 0.55 Ω → 1.0 V threshold), 1700 V SiC switch (33% headroom at 860 V + clamp).

Core **ETD29 PC95**, gapped to AL ≈ 158 nH/T²: Np = 59 (Lp 550 µH), N24 = 12 (n = 0.203),
N15 = 8 (n = 0.136), Naux(VCC) = 8. Bpk = Lp·Ip/(Np·Ae) = 550 µ·1.8/(59·76 mm²) ≈ 0.22 T (DCM
full swing — PC95 at 65 kHz, loss checked in thermal budget). DCM proof at Vin,min 342 V full
power: t_on = 2.9 µs + t_reset = 8.3 µs = 11.2 µs < 15.4 µs period ✓.

Insulation: primary is at bus potential — reinforced barrier pri→all secondaries (TIW secondaries
+ 3 mm margin tape), hipot 4 kV (E25 SELV control domain depends on this barrier). Aux(VCC)
winding is primary-side (DCN-referenced) — functional insulation only to primary, reinforced to
secondaries. Rev B — bench T-09 verifies UVLO/BR thresholds and thermal.
