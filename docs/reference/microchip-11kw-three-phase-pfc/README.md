<picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/microchip_logo_white_red.png">
	<source media="(prefers-color-scheme: light)" srcset="images/microchip_logo_black_red.png">
    <img alt="Microchip Logo." src="images/microchip_logo_black_red.png">
</picture> 

## 11KW Three Phase PFC Demonstration Application

<p><center><a target="_blank" rel="nofollow">
<p>
<img src="images/11kw-board.jpg" alt="11KW Three Phase PFC Demonstration Board" width="600">
</a>
</center>
</p>

<p>
<center>
<a target="_blank" rel="nofollow">
11KW Three Phase PFC Demonstration Board
</a>
</center>
</p>

---

## Summary

The 11kW Three-Phase PFC Demonstration Application is a modular, high-performance development platform designed for rapid prototyping and code development with Microchip’s dsPIC33C and dsPIC33A Digital Signal Controllers and SiC FETs. Targeted mainly at automotive On-Board Chargers (OBCs), it is also suitable for industrial and telecom applications needing high-power AC/DC or DC/AC conversion from three-phase AC mains. The system uses a voltage-doubler topology for efficient AC-to-DC conversion, connecting a three-phase, four-wire AC source to the input and a DC load to the output.

The platform includes separate boards for filtering, protection, sensing, and power conversion, and communicates with a PC via an isolated CAN bus. The dsPIC33CH512MP506 DP-PIM serves as the main controller, running real-time control algorithms, monitoring system parameters, and managing protections. During Power Factor Correction (PFC) operation, an inner current control loop ensures sinusoidal, in-phase input currents for high power factor and low distortion, while an outer voltage control loop maintains the desired DC output. 

---

## Related Documentation

__Hardware Documentation__

- [3.8kW/7.6kW dsPIC33C Totem Pole Demonstration Application Landing Page](https://www.microchip.com/en-us/tools-resources/reference-designs/3-8kw-7-6kw-dspic33c-totem-pole-development-application)
- [3.8kW/7.6kW dsPIC33C Totem Pole Demonstration Application User's Guide](https://www.microchip.com/DS70005569)
- [3.8kW/7.6kW dsPIC33C Totem Pole Demonstration Application Operation Mode Guide: PFC and Grid-Tied Inverter](https://www.microchip.com/DS70005568)
- [Isolated Voltage Acquisition Board User’s Guide](https://www.microchip.com/DS70005524)

__Target Device Documentation__

- [dsPIC33CH512MP508 Family Data Sheet](https://www.microchip.com/DS70005371)
- [dsPIC33CK256MP508 Family Silicon Errata and Data Sheet Clarification](https://www.microchip.com/DS80000796B)
- [dsPIC33AK512MPS512 Family Data Sheet](https://www.microchip.com/DS70005591)
- [dsPIC33AK512MPS512 Family Silicon Errata and Data Sheet Clarification](https://www.microchip.com/DS80001162)

__Please always check for the latest data sheets on the respective product websites:__

- [dsPIC33CK256MP508 Family](https://www.microchip.com/dsPIC33CK256MP508)
- [dsPIC33AK512MPS512 Family](https://www.microchip.com/dsPIC33AK512MPS512)

---

## Software Used 

- [Power Board Visualizer GUI](https://www.microchip.com/en-us/software-library/power_board_visualizer)
- [MPLAB&reg; X IDE v6.20](https://www.microchip.com/en-us/tools-resources/develop/mplab-x-ide)
- [MPLAB&reg; XC-DSC Compiler v3.10](https://www.microchip.com/en-us/tools-resources/develop/mplab-xc-compilers/xc-dsc)
- [Microchip Code Configurator v5.5.1](https://www.microchip.com/mplab/mplab-code-configurator)
- [Digital Compensator Design Tool](https://www.microchip.com/developmenttools/ProductDetails/DCDT)

---

## Hardware Used

- 11kW Three-phase Demonstration Application Board
   - Power Board
   - AC common mode input filter
   - Inrush control (Relays and NTCs)
   - AC differential mode filter
   - Current Sensors
   - Output Filter

   
<p><center><a target="_blank" rel="nofollow">
<p>
<img src="images/system-view.jpg" alt="System View with Board Connections" width="800">
</a>
</center>
</p>

<p>
<center>
<a target="_blank" rel="nofollow">
System View with Board Connections
</a>
</center>
</p>

---

## Firmware Directory Structure
The main directory structure for this project is summarized below.

	├───dspic33c_11kw_three_phase_pfc_primary.X	          11KW three-phase PFC primary core project 
	├───dspic33c_11kw_three_phase_pfc_secondary.X		  11KW three-phase PFC secondary core project 
	├───images						  Images for the Readme 
	├───power_board_visualizer_xmls				  Power Board Visualizer Projects
	├───pre_compiled_hex_files				  Pre compiled Hex file for  11KW three-phase PFC
	└───sources_common					  Common Sources between both projects

The Primary Core handles system-level management tasks such as configuration, communication (via CAN and SPI), and AC voltage monitoring. In contrast, the Secondary Core is dedicated to real-time power control, including execution of the PFC state machine, processing ADC interrupts, performing main power regulation functions, and managing communication between the two cores. The directory structure for both <i>dspic33c_11kw_three_phase_pfc_primary.X</i> and <i>dspic33c_11kw_three_phase_pfc_secondary.X</i> is illustrated in the image below.
<p><center><a target="_blank" rel="nofollow">
<p>
<img src="images/mplab-projects.png" alt="Primary and Secondary MPLABX Project Folder Directories" width="800">
</a>
</center>
</p>

<p>
<center>
<a target="_blank" rel="nofollow">
Primary and Secondary MPLABX Project Folder Directories
</a>
</center>
</p>

---

## Important Files

This project structure shows the source code organization for a three-phase PFC (Power Factor Correction) application using Microchip’s dsPIC33CH microcontroller. The project is divided into two main parts: primary and secondary, each with its own set of files and folders.

- <i>Important Files:</i>
	- Primary Core
		- PFC_frameworkSetUp.h: Contains user macro defines settings related to the operating mode of the three-phase PFC, including voltage configuration, midpoint balancing, and start-up behavior
		- drv_dma.c: Handles SPI messages received via SPI/DMA, triggering an ISR. The AC voltage monitor runs within this ISR every 10 microseconds as a high-priority task.
		- vac_monitor.c: Contains the main logic for AC voltage monitoring.
		- drv_can.c: Manages CAN communication between the PBV and dsPIC.
		- main.c: Includes initialization routines and a timer-driven scheduler.

	- Secondary Core
		- main_tasks.c: Implements the PFC (Power Factor Correction) state machine.
		- main.c: Contains initialization code and a timer-driven scheduler.
		- drv_adc.c: ADC interrupt service routine executes every 10 microseconds at high priority, triggered after core 0 completes conversion (for AC phase 1 current). Main power control tasks are performed here.
		- drv_pwrctrl_app_TPBLPFC.c: Houses the primary power control functions.
		- drv_msi.c: Manages communication functions between the primary and secondary cores.

---


## Control Loop Setup using DCDT tool

<p><center><a target="_blank" rel="nofollow">
<p>
<img src="images/dcdt_icomp.jpg" alt="DCDT Current Loop Control Configuration" width="800">
</a>
</center>
</p>

<p>
<center>
<a target="_blank" rel="nofollow">
DCDT Current Loop Control Configuration
</a>
</center>
</p>

MPLABX DCDT Tool is a software utility within MPLABX used for designing and generating digital control loop systems.
DCDT is utilized in this project to generate the control loop systems. In this project, two separate current control loops were configured for High Voltage (HV) and Low Voltage (LV) operation, while the voltage loop remains the same for both operations.

To open the settings of the DCDT for these control loops:

1. In MPLABX, navigate to <i>Tools > Embedded > Digital Compensator Design Tool</i>.
2. Open an existing project. There are four options to choose from in this project:
	- icomp3hv: Current loop for high voltage operation
	- icomp3lv: Current loop for low voltage operation
	- neutral: Control loop that balances the voltage of the voltage doubler
	- vcomp3ph: Voltage loop for high and low voltage operation
3. Click on the Compensator Box in the Single-Loop configuration to see or modify the location of Poles and Zeroes.
4. If you wish to regenerate the code, navigate to <i>Output Report > Generate Code</i>.
5. The control loop generated files can be found in the Header Files of the <i>dspic33c_11kw_three_phase_pfc_secondary.X</i> MPLAB project, within the <i>DCDT Generated Files folder</i>.

Kindly refer to the official MPLABX DCDT documentation or your internal project guidelines for further details and best practices.

---
## Adaptive Gain Control 

Adaptive gain control in Power Factor Correction (PFC) systems dynamically adjusts the controller gain based on load conditions to optimize performance and minimize distortion.

The output of the 11kW three-phase PFC voltage regulator is influenced by the load. To maintain optimal Total Harmonic Distortion (THD), even at low loads, the gain of the current regulator must be adjusted accordingly. The default setting for the gain coefficients of this demonstration board is established at a value of 5, meaning that a gain of 1 corresponds to a multiplication factor of 0.2. This approach was chosen because our fixed-point engine efficiently processes Q15 values, which have a range from 0 to 1. The gain factor is applied to all B-coefficients, and the 2p2z assembler code has been extended to include a multiplication in the numerator for this purpose. Gain factors for specific load conditions were empirically determined in the application, and these values are used to derive a linear equation that defines the load-dependent gain adjustment.

<p><center><a target="_blank" rel="nofollow">
<p>
<img src="images/adaptive-gain-contrrol.png" alt="Adaptive Gain Control for 11KW Three Phase PFC Demonstration Board" width="800">
</a>
</center>
</p>

<p>
<center>
<a target="_blank" rel="nofollow">
Adaptive Gain Control for 11KW Three Phase PFC Demonstration Board
</a>
</center>
</p>

---

## Microcontroller Management System for Three Phase

<p><center><a target="_blank" rel="nofollow">
<p>
<img src="images/firmware-interconnection.png" alt="Microcontroller Management System for Three Phase PFC" width="800">
</a>
</center>
</p>

<p>
<center>
<a target="_blank" rel="nofollow">
Microcontroller Management System for Three Phase PFC
</a>
</center>
</p>

This diagram represents a power management system that uses several microcontrollers and boards to monitor and control electrical parameters. The system starts with an Isolated Voltage Acquisition Board, which uses a dsPIC33CK microcontroller to sample three voltage inputs (VL1, VL2, VL3) and sends this data via SPI to the Main Power Board. The Main Power Board features a dual-core dsPIC33CH microcontroller. 

Its primary core is responsible for communication tasks, such as handling CAN messages to and from a PC, unpacking SPI messages, and monitoring input voltages. It also manages data transfer between internal mailboxes and communicates with a secondary microcontroller (PIC16) over I2C. The secondary core of the dsPIC33CH focuses on real-time power control, including power factor correction (PFC), current and voltage loop regulation, and overcurrent protection, all managed through high-priority interrupt routines. The Main Power Board also includes a PIC16 microcontroller, which monitors temperature and voltage rails, controls fan speed, and manages PWM outputs for isolated 5V rails and the fan drive. 

The diagram uses color coding to distinguish between high-priority (green) and low-priority (yellow) processes, ensuring that time-critical tasks like current sampling and overcurrent checks are handled promptly, while less urgent tasks like background loops and state machines are managed with lower priority. This architecture allows for efficient, reliable power management and communication within the system.


---
## CPU Load / Timing

<p><center><a target="_blank" rel="nofollow">
<p>
<img src="images/timing.png" alt="Microcontroller Management System for Three Phase PFC" width="800">
</a>
</center>
</p>

<p>
<center>
<a target="_blank" rel="nofollow">
Three Phase PFC Execution Timing 
</a>
</center>
</p>

This oscilloscope waveform, displays four signal traces and several annotated points of interest for the the execution time of the three phase PFC firmware. The yellow trace (C1) represents the ADC_ISR signal, which indicates when the ADC interrupt service routine is triggered. The green trace (C2), labeled TP129, signals the execution of different tasks within the ISR. Each transition or pulse on TP129 corresponds to a specific task being called, with standard task durations of approximately 5.6 microseconds. Notably, when the Voltage Loop or the Midpoint Compensator Loop is called within the Phase #1 handler, the execution time is about 6.2 microseconds, and when the Adaptive Gain Calculation is called, the execution time is about 5.7 microseconds. 


---
## Low Voltage Operation

The firmware allows the user to operate the demonstration board in low voltage mode. Specifically, when #define HIGH_VOLTAGE is set to 0, <code>#define HIGH_VOLTAGE 0</code>,  in the PFC_frameworkSetup.h file of the dspic33ch_totem_pole_three_phase_secondary project, the Power Factor Correction (PFC) system is configured for low voltage operation. This setting ensures that the firmware uses parameters and protections appropriate for low voltage conditions, optimizing the system’s performance and safety when operating.

Additionally, it is important to use the correct Power Board visualizer designed for low voltage to ensure accurate monitoring and control. This can be found in the folder directory <i>power-board-visualizer-xmls/LV-3PH-newboards.xml</i>.

---
## X2C Scope 

X2Cscope is a powerful tool for real-time debugging and control loop analysis in this application, allowing users to visualize critical signals (like AC voltages, currents, and control loop outputs) with high temporal resolution. This facilitates rapid tuning and troubleshooting without intrusive probing. However, X2Cscope is disabled by default in the firmware; enabling it requires increasing the main ISR period from 10µs to 20µs, which may slightly reduce input current THD performance.

The X2C Scope can be enabled by setting the #define ADC_ISR_TO_FSW_RATIO is set to 2, <code>#define ADC_ISR_TO_FSW_RATIO (2)</code>, in the PFC_frameworkSetup.h file of the dspic33ch_totem_pole_three_phase_secondary project.

---
## MCC Melody Code Generation Changes

Using MCC Melody to configure peripherals can present some challenges. For example, when configuring the SPI interface, it was necessary to implement manual workarounds to achieve the required timing or data handling for the PFC control loop. These customizations are not preserved by MCC and can be easily overwritten if the code is regenerated.

Take care when regenerating code using MCC, as this process may overwrite any manual modifications made to the generated files. To avoid losing important modifications, carefully review and merge changes after each code generation cycle.

---
## Programming Hex File using available hex files

In this example ICD4 is being used, but any of the available debuggers/programmers can be used.

1. Open MPLAB X IPE
2. Select the device on DP-PIM : dsPIC33CH512MP506 (not S1)
3. Memory Model : Single Partition
4. Connect computer to ICD4 via USB cable, connect ICD4 to 6 pin header on DP-PIM via RJ11 cable and RJ11 to ICSP adapter.
5. Power the dpPIM through a microUSB cable.
6. Click connect on the MPLAB X IPE
7. Wait for the device to connect
8. Navigate to the folder pre_compiled_hex_files, and select the correct hex file
9. Click program
10. Wait for the program/verify complete message.
11. Disconnect programmer from Digital Power Plug-in Module.

---


&copy; 2025, Microchip Technology Inc.



