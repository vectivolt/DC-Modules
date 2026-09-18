<img src="../assets/banner-verification.svg" alt="" width="100%"/>

# 📚 Reference Library

<sub>The public reference designs and firmwares kept in the repository — what each is, where it came from, its licence and what it proved</sub>

<p>
  <img src="https://img.shields.io/badge/status-EVIDENCE-1a9fb3?style=flat-square" alt="status: evidence record"/>
  <img src="https://img.shields.io/badge/rev-E85-f2b705?style=flat-square" alt="revision E85"/>
  <img src="https://img.shields.io/badge/updated-2026--09--19-8b949e?style=flat-square" alt="updated 2026-09-19"/>
</p>

The public reference designs and firmwares this project measured itself against, kept in the repository so that no future
question depends on a vendor download, a login or a mirror that has gone away. Every folder holds the material as
received (or a trimmed source snapshot with the upstream commit recorded), a text companion where the original is a PDF,
and the upstream licence. Nothing here is built, linked or run by the project: it is evidence, read at source level, and
the conclusions drawn from it live on the [firmware verification plan](../firmware-verification.md#5-reference-firmware-cross-check).

> [!IMPORTANT]
> These files are third-party material kept for internal engineering reference under their own terms (below). The
> Microchip and NXP snapshots are licensed for use with those vendors' devices; the ST kit documents and binaries fall
> under ST's evaluation-board licence, which forbids redistribution and reverse engineering; TI's guide is © TI. Keep
> the repository private, do not copy code from these snapshots into the firmware, and re-read the licence before any
> other use.

## 1. What is here

| Folder | Reference | Source and version | Licence | What it was used for |
|---|---|---|---|---|
| `st-stdes-30kwvrect/` | **ST STDES-30KWVRECT** — 30 kW three-phase Vienna PFC rectifier on STM32G474RE, 400 V AC, 800 V DC, 70 kHz, 2 × SCTWA90N65G2V-4 per switch, STPSC40H12C diodes, STGAP2SICS drivers | data brief DB4697 Rev 1, BOM and schematic Rev 1 (April 2022) as received from ST; `firmware/stsw-30kwvrect-v1.0-binaries.zip` = the STSW-30KWVRECT V1.0 package as ST ships it (an IAR ELF and its hex — ST publishes no source); `UM3011-getting-started-text-extract.txt` = the user manual's design, control, state-machine and protection chapters (UM3011 Rev 1) | ST evaluation-board licence (printed in the schematic and BOM PDFs) | the closest public match to this front end: its protection table (Table 7), inrush and latching-relay sequence, sensing chains and state machine are compared row by row on the verification plan |
| `st-stsw-viennarect/` | ST STSW-VIENNARECT — the earlier Vienna rectifier demonstration firmware (an STM8 / STNRG388A digital-controller binary) | `stsw-viennarect-stm8-binary.zip` as received from ST | ST software licence | kept for completeness; a binary for another controller family, not read |
| `ti-tidm-1000/` | **TI TIDM-1000** — Vienna rectifier three-phase PFC reference design on C2000 (TIDUCJ0C design guide) | `tiducj0c-vienna-rectifier-design-guide.pdf` fetched from ti.com on 2026-09-19, with its text; the firmware itself ships inside the C2000Ware Digital Power SDK behind a login and is not here | © Texas Instruments | CMPSS comparator trips, the manual `clearTrip` restart, the four incremental build levels, the midpoint balance loop |
| `microchip-11kw-three-phase-pfc/` | **Microchip 11 kW three-phase SiC PFC** demonstration firmware (dsPIC33C, dual core) | github.com/microchip-pic-avr-examples/11kw-three-phase-pfc-demonstration-application, commit in `COMMIT`, application sources only (generated MCC files, images, hex and project files dropped) | Microchip licence (`LICENSE.txt`: use with Microchip products) | the per-phase AC monitor, relay pre- and post-delays, the ADC-interrupt trips, the zero-crossing PWM start, the restart policy |
| `microchip-totem-pole-pfc/` | Microchip single-phase totem-pole PFC demonstration firmware (dsPIC33CH) | github.com/microchip-pic-avr-examples/dspic33ch-power-totem-pole-demonstration-application-single-phase, commit in `COMMIT`, application sources only | Microchip licence | the same AC monitor and power-controller framework in its single-phase form |
| `microchip-llc50w/` | **Microchip interleaved LLC** firmware with active current sharing (dsPIC33C) | github.com/microchip-pic-avr-examples/llc50w-power-voltage-mode-control-with-active-current-sharing, commit in `COMMIT`, application sources only | Microchip licence | the generic fault object (threshold, hysteresis, set and clear counts), the comparator over-current path, the frequency-sweep soft start, SR gating |
| `nxp-hbllc/` | **NXP half-bridge LLC** reference (MC56F83783) | github.com/nxp-appcodehub/an-hbllc_mc56f8xxxx, commit in `COMMIT`, `Sources/` only | NXP LA_OPT software licence (`LICENSE.txt`: use with NXP products) | the fault rules, the staged overload timers, hardware versus software over-current restart, burst by duty hysteresis, the inter-MCU message watchdog |
| `pfcontroller/` | PFController — a three-phase PFC controller on STM32F7 | github.com/StanKarpikov/PFController, commit in `COMMIT`, `firmware/application`, `middleware` and `hardware/BSP` only | no licence file upstream; author's terms apply | a plain state machine with 1 ms protection checks and persistence, manual fault-block clearing |
| `vmcharger/` | VMCharger — EMotorWerks' Arduino DC charger | github.com/valerun/VMCharger, commit in `COMMIT`, the V12 and V14.4 sketches | no licence file upstream; author's terms apply | power-on sensor checks, mains detection, session and CV time-outs |

## 2. What was not obtainable

- The STSW-30KWVRECT source: ST ships binaries only. The user manual's protection table and state machine stand in for it.
- The TIDM-1000 firmware: inside TI's C2000Ware Digital Power SDK, behind a login.
- ST's UM2720 (the STEVAL-DPSLLCK1 LLC firmware manual): st.com did not answer the fetch.
- Production charger-module firmware (InfyPower, UUGreen, Huawei): not public.

## 3. The standards the module is judged against

Not reproduced here (paid texts); listed so the edge-case checklist has its sources: NB/T 33001-2018 (off-board conductive
charger requirements) and NB/T 33008.1-2018 (its inspection and test specification); IEC 61851-23 (DC charging station);
IEC 61851-21-2 (EMC); IEC 61000-4-11 and IEC 61000-4-34 (voltage dips, short interruptions and variations — the class 3
profile is in EVT row T-49); IEC 62477-1 (safety of power electronic converter systems).

## 4. Adding to this library

Keep the material as received when it is a document or a vendor package; take a source snapshot without generated code,
images or binaries when it is a repository, and record the commit and the origin URL in `COMMIT`. Add the licence file.
Write the row above and the conclusions on the verification plan, never in the firmware. Third-party markdown under this
folder is exempt from the documentation lint; this page is not.

---

<div align="center">
<sub><a href="../firmware-verification.md">← Firmware Verification Plan</a> &nbsp;·&nbsp; <a href="../README.md">🧭 Documentation hub</a> &nbsp;·&nbsp; <a href="../reliability-budget.md">Reliability Budget →</a></sub>

<sub>Vectivolt DC-Modules · documentation rev E85 · every number reproduces with <code>sh calculations/run-all.sh</code></sub>
</div>
