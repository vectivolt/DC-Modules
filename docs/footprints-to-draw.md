# Footprints that must be drawn

EasyEDA raises a fatal DRC error for any component without a footprint. On import, **26 of our
footprint names matched EasyEDA's stock library and cleared 194 components (fatal 300 -> 106).**
The rest are through-hole and custom packages with no stock equivalent.

These are deliberately NOT auto-assigned. EasyEDA's library does contain names that would make
the DRC pass -- `RES-TH_12R_2W`, `CAP-TH_BD25.4-P10.00-D2.3-FD` -- but using them would put a 2 W
axial land pattern under a 25 W wirewound, and a 25.4 mm can under a 30 mm snap-in. That is
fabricated manufacturing data, so each is listed here with its real package instead.

| Footprint to draw | Instances (all SKUs) | Parts |
|---|---|---|
| `CAP-TH_L30.0-W30.0-P10.00` | 120 | 470uF |
| `CAP-TH_L31.5-W13.0-P27.50` | 111 | 1uF, 46nF |
| `` | 69 | CT-100A-1:2500, 33, HFE82V-20-M-CLASS, CT-RES-1:100 |
| `PWRM-TH_QA01C` | 66 | QA01C |
| `CAP-TH_L26.5-W11.0-P22.50` | 60 | 2.2uF, 1uF |
| `RES-TH_L48.0-W8.0-P54.00` | 45 | WW-470R-10W, CER-2k2-10W-AX |
| `TERM_Stud_M8` | 36 | STUD-M8 |
| `RES-TH_L60.0-W9.0-P66.00` | 24 | CER-25W-AX, SQP-10R-25W |
| `R0603` | 24 | 220 |
| `L_Toroid_3xT79_26u_custom` | 21 | IND-PFC-165u |
| `CAP-TH_L7.2-W3.5-P5.00` | 21 | 100nF |
| `L_Toroid_trim_bin_custom` | 21 | IND-TRIM-BIN4 |
| `XFMR_3xPQ50-50_custom` | 21 | XFMR-LLC-10K |
| `SIP-4_iso-module` | 18 | ISO5V-RFC-6K |
| `CAP-TH_L11.0-W5.0-P10.00` | 18 | 4.7nF |
| `DISC-20mm_RM10` | 18 | S20K550 |
| `RELAY_HFE82V_PCB` | 16 | HFE82V-M-CLASS |
| `CONN-TH_2P-P2.00_PH` | 15 | PH-2 |
| `CONN-TH_4P-P2.00_PH` | 11 | PH-4-FAN, PH-4 |
| `FUSE_holder_22x58` | 9 | FUSE-gG-690V |
| `GDT-8mm_RM6` | 9 | GDT-3k5-20kA |
| `L_Toroid_sendust_per-SKU` | 9 | DM-22u-SKU |
| `CAP-TH_L8.0-W8.0-P3.50` | 6 | 220uF |
| `CONN-TH_16P-P3.00_MicroFit` | 6 | MICROFIT3-16 |
| `HDR-TH_5P-P2.54-V-M` | 6 | HDR-1x5-2.54 |
| `L_CMC_3ph_nanocryst_per-SKU` | 6 | CMC-3PH-2mH-SKU |
| `RELAY_HF167F_PCB` | 6 | HF167F-80A-M |
| `KEY-SMD_4P-L6.0-W6.0` | 6 | TACT-6x6 |
| `CAP-TH_L41.5-W20.0-P37.50` | 6 | 4.7uF |
| `XFMR_ETD34_custom` | 3 | XFMR-AUX-FLY-C |
| `CAP-TH_L18.0-W5.0-P15.00` | 3 | 10nF |
| `CAP-TH_L6.3-W6.3-P2.50` | 3 | 47uF |
| `TERM_Tab_M4` | 3 | TAB-M4 |
| `IND-SMD_L4.5-W3.2_CMC` | 3 | CMC-CAN-51uH |
| `LED-SEG-TH_2DIG-0.56` | 3 | LED-2DIG-0.56CC |
| `SHUNT_4-terminal_manganin` | 3 | SHUNT-MANG |

**36 footprints, 825 component instances across 30/60/120 kW.**

PCB layout is out of scope by standing directive, so these are specifications, not omissions.
