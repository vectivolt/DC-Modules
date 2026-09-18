/*
    (c) 2025 Microchip Technology Inc. and its subsidiaries. You may use this
    software and any derivatives exclusively with Microchip products.

    THIS SOFTWARE IS SUPPLIED BY MICROCHIP "AS IS". NO WARRANTIES, WHETHER
    EXPRESS, IMPLIED OR STATUTORY, APPLY TO THIS SOFTWARE, INCLUDING ANY IMPLIED
    WARRANTIES OF NON-INFRINGEMENT, MERCHANTABILITY, AND FITNESS FOR A
    PARTICULAR PURPOSE, OR ITS INTERACTION WITH MICROCHIP PRODUCTS, COMBINATION
    WITH ANY OTHER PRODUCTS, OR USE IN ANY APPLICATION.

    IN NO EVENT WILL MICROCHIP BE LIABLE FOR ANY INDIRECT, SPECIAL, PUNITIVE,
    INCIDENTAL OR CONSEQUENTIAL LOSS, DAMAGE, COST OR EXPENSE OF ANY KIND
    WHATSOEVER RELATED TO THE SOFTWARE, HOWEVER CAUSED, EVEN IF MICROCHIP HAS
    BEEN ADVISED OF THE POSSIBILITY OR THE DAMAGES ARE FORESEEABLE. TO THE
    FULLEST EXTENT ALLOWED BY LAW, MICROCHIP'S TOTAL LIABILITY ON ALL CLAIMS IN
    ANY WAY RELATED TO THIS SOFTWARE WILL NOT EXCEED THE AMOUNT OF FEES, IF ANY,
    THAT YOU HAVE PAID DIRECTLY TO MICROCHIP FOR THIS SOFTWARE.

    MICROCHIP PROVIDES THIS SOFTWARE CONDITIONALLY UPON YOUR ACCEPTANCE OF THESE
    TERMS.
 */


#ifndef _DEV_TPBLPFC_TYPEDEF_H
#define	_DEV_TPBLPFC_TYPEDEF_H

#include <xc.h>
#include <stdint.h>

/**
 * ------------------------------------------------------------------------------
 * @brief Power controller states
 * ------------------------------------------------------------------------------
 */

/**
 * @brief Enumeration defining the states of the power controller.
 *
 * This enumeration defines the different operating states of the power controller
 * in the system.  Each state represents a specific stage in the power control sequence.
 */
typedef enum {
    PCS_INIT = 1,              ///< Initial state of the power controller.
    PCS_STANDBY = 3,           ///< Standby state, where the power controller is idle.
    PCS_PREDELAY_RELAYON = 4,  ///< State for pre-delay before turning on the relay.
    PCS_POSTDELAY_RELAYON = 7, ///< State for post-delay after turning on the relay.
    PCS_SOFT_START = 10,         ///< State for soft-start operation.
    PCS_UP_AND_RUNNING = 11,     ///< State when the power controller is fully operational.
    PCS_STALL_DEBUG = 12        ///< State for stall debug mode.
} PWR_CTRL_STATE_e;

/**
 * @brief External declaration of the power controller state variable.
 *
 * This global variable holds the current state of the power controller.
 * It allows other parts of the system to access and monitor the power
 * controller's operational state.
 */
extern PWR_CTRL_STATE_e pwr_ctrl_state;

/**
 * @brief Structure to hold analog measurement values.
 *
 * This structure is used to store various processed and raw analog
 * voltage and current readings from a sensor or signal conditioning circuit. 
 * It includes fields for raw data, rectified values, filtered results, and related
 * parameters.
 */
struct ANALOG_VALUES_s {
    int16_t Raw; ///< The raw, unprocessed ADC reading.
    int16_t Rectified; ///< The rectified value of the ADC reading.
    uint16_t Filtered; ///< The filtered value of the analog signal.
    int16_t Vin_div_Averaged2; ///< AC voltage feedforward term for the current loop.
    ///< It represents the instantaneous AC voltage divided by the average AC voltage,
    ///< providing a reference for the current control loop.
    int16_t Vin_div_Averaged2_Delayed; ///< A delayed version of the AC voltage feedforward term. This is needed for lead current compensation
    uint16_t FilterCounter; ///< A counter used in the filtering process.
    int16_t Offset; ///< An offset value applied to the analog reading
    uint16_t PreviousValue; ///< The previous filtered or processed value.
    int16_t AC; ///< The AC component of the analog signal (sense offset, which is a DC value, is removed)
};
/**
 * @brief Typedef for the ANALOG_VALUES_s structure.
 */
typedef struct ANALOG_VALUES_s ANALOG_VALUES_t;

/**
 * @defgroup VBUS_Reference_Setpoints Vout Reference Set Points
 * @brief Defines a structure to manage the voltage loop input and output
 *
 * This module defines a structure (`VBUS_COMP_s`) to hold the set point, 
 * target set point, and output of the voltage loop compensator.
 */

/**
 * @brief Structure defining the reference, target, and compensator output for Vout.
 *
 * This structure is used to store the internal reference, the user-defined
 * reference target, and the output of the voltage loop compensator.
 */
struct VBUS_COMP_s {
    uint16_t Reference_Internal; ///< actual reference value for the output voltage.
    uint16_t Reference_Set;    ///< target reference value for the output voltage.
    int16_t output;             ///< Output of the voltage loop compensator.
};
/**
 * @brief Typedef for the VBUS_COMP_s structure.
 */
typedef struct VBUS_COMP_s VBUS_COMP_t;

/**
 * @defgroup CurrentControlLoopValues Current Control Loop Values
 * @brief Defines a structure to hold values related to the current control loop compensator.
 *
 * This module defines a structure (`IAC_COMP_s`) to store parameters and
 * variables used in the current control loop compensator, such as duty cycle register value,
 * output, reference, feedback, and a control freeze flag.
 */

/**
 * @brief Structure defining the values for the current control loop compensator.
 */
struct IAC_COMP_s {
    uint16_t Duty_Cycle_PGxDC; ///< The value written to the PWM Generator x Duty Cycle Register (PGxDC) to control the PWM duty cycle.
    ///< In center-aligned mode with high resolution, the relationship between the desired
    ///< duty cycle (0.0 to 1.0) and the PGxDC register value is
    ///< PGxDC = (PGxPER + 8) * Duty Cycle.
    ///< Where:
    ///<   - PGxPER is the 16-bit PWM Generator x Period Register.                                         
    ///<   - Duty Cycle is a fractional value between 0.0 and 1.0 (representing 0% to 100%).                                         
    int16_t output; ///< The output value of the current control loop compensator.
    int16_t reference; ///< The reference value for the current loop compensator.
    int16_t feedback; ///< The feedback value of the current being controlled.
    unsigned Control_Freeze : 1; ///< A bitfield flag to freeze or disable the current loop compensator
    ///< When set, the control loop's output will be held at a constant value.
};
/**
 * @brief Typedef for the IAC_COMP_s structure.
 */
typedef struct IAC_COMP_s IAC_COMP_t;

/**
 * @defgroup PowerControllerStatusFlags Power Controller Status Flags
 * @brief Defines a structure to hold status flags for the power controller.
 *
 * This module defines a structure (`CONTROL_STATUS_FLAGS_s`) that uses a union
 * to provide both bit-level access to individual status flags and a 16-bit
 * value for easy read/write operations. These flags indicate various conditions
 * and states of the power controller.
 */

/**
 * @brief Structure defining the power controller status flags.
 */
struct CONTROL_STATUS_FLAGS_s {
    union {
        struct {
            unsigned VAC_Polarity_last : 1;      ///< Bit 0: Stores the last detected polarity of the VAC input.
            unsigned Stop : 1;                   ///< Bit 1: Flag indicating a stop condition for the power controller operation.
            unsigned Fault : 1;                  ///< Bit 2: General fault indicator for the power controller.
            unsigned VAC_Polarity_Changed : 1;  ///< Bit 3: Flag that is set when a change in the VAC input polarity is detected.
            unsigned pwmStart : 1;                ///< Bit 4: Semaphore to initiate PWM signals at the zero crossing of the AC voltage, preventing overcurrent faults during startup.
        } __attribute__((packed)) bits;
        uint16_t value;                         ///< Buffer for 16-bit word read/write operations of the entire flag set.
    };
};

/**
 * @brief Typedef for the CONTROL_STATUS_FLAGS_s structure.
 */
typedef struct CONTROL_STATUS_FLAGS_s CONTROL_STATUS_FLAGS_t;

/**
 * @defgroup ACControlPhaseStatusFlags AC Control Phase Status Flags
 * @brief Defines a structure to hold status flags specific to an AC control phase.
 * Note that this data comes from the AC monitor module and is sent to the secondary core via a mailbox from the primary core
 * 
 * This module defines a structure (`VAC_STATUS_FLAGS_s`) that uses
 * a union to provide both bit-level access to individual status flags for an
 * AC control phase and a 16-bit value for easy read/write operations.
 */
struct VAC_STATUS_FLAGS_s {

    union {

        struct {
            unsigned VACdrop : 1; ///< Bit 0: Indicates a drop out of the AC voltage for the phase.
            unsigned VDC_Input_Voltage : 1; ///< Bit 1: Indicates the presence or status of a DC input voltage relevant to the phase control.
            unsigned VAC_OK : 1; ///< Bit 2: Indicates if the AC input for the phase is within acceptable frequency, amplitude and stability limits.
            unsigned Zero_Cross_Range : 1; ///< Bit 3: Indicates if the AC voltage is within the zero-crossing detection range.
            unsigned VAC_Polarity : 1; ///< Bit 4: Indicates the current polarity of the AC input voltage for the phase.
        } __attribute__((packed)) bits;
        uint16_t value; ///< Buffer for 16-bit word read/write operations of the entire flag set.
    };
};
/**
 * @brief Typedef for the VAC_STATUS_FLAGS_s structure.
 */
typedef struct VAC_STATUS_FLAGS_s VAC_STATUS_FLAGS_t;

//------------------------------------------------------------------------------
// Values for the individual 3 phase
//------------------------------------------------------------------------------

/**
 * @defgroup PhaseValues Phase Specific Values
 * @brief Defines a structure to hold various values and flags associated with a particular AC phase.
 *
 * This module defines a structure (`PHASE_VALUES_s`) that encapsulates analog
 * measurements (voltage and current), control status flags, current compensator
 * values, and VAC status flags for a single phase
 */

/**
 * @brief Structure defining the values and flags for an AC phase.
 */
struct PHASE_VALUES_s {
    ANALOG_VALUES_t Phase_Voltage; ///< Structure holding AC voltage measurements and related data for the phase.
    ANALOG_VALUES_t Phase_Current; ///< Structure holding AC current measurements and related data for the phase.
    CONTROL_STATUS_FLAGS_t Control_Status_Flags; ///< Structure holding control status flags specific to this phase.
    IAC_COMP_t current_compensator; ///< Structure holding values related to the current control loop for this phase.
    VAC_STATUS_FLAGS_t vac_status_flags; ///< Structure holding AC voltage status flags for this phase.
};
/**
 * @brief Typedef for the PHASE_VALUES_s structure.
 */
typedef struct PHASE_VALUES_s PHASE_VALUES_t;

/**
 * @brief External declarations of the phase values structures for each of the three phases.
 *
 * These global variables provide access to the specific values and flags
 * for Phase 1, Phase 2, and Phase 3 of the system.
 *
 * @ingroup PhaseValues
 */
extern PHASE_VALUES_t Phase_Values_PH1; ///< Structure holding values for Phase 1.
extern PHASE_VALUES_t Phase_Values_PH2; ///< Structure holding values for Phase 2.
extern PHASE_VALUES_t Phase_Values_PH3; ///< Structure holding values for Phase 3.

/**
 * @defgroup OuterVoltageLoopValues Values for the Outer Voltage Loop
 * @brief Defines a structure to hold values related to the outer voltage control loop.
 *
 * This module defines a structure (`VMC_VALUES_s`) to store analog measurements
 * (output voltage, midpoint voltage, potentiometer), and compensator values
 * used in the outer voltage control loop.
 */

/**
 * @brief Structure defining the values for the outer voltage loop.
 */
struct VMC_VALUES_s {
    ANALOG_VALUES_t Vout; ///< Structure holding analog measurements and related data for the output voltage.
    ANALOG_VALUES_t Vout_MidPoint; ///< Structure holding analog measurements and related data for the midpoint voltage.
    VBUS_COMP_t Compensator; ///< Structure holding values related to the voltage compensator in the outer loop.
};
/**
 * @brief Typedef for the VMC_VALUES_s structure.
 */
typedef struct VMC_VALUES_s VMC_VALUES_t;

/**
 * @brief External declaration of the outer voltage loop values structure.
 *
 * This global variable provides access to the various analog measurements and
 * compensator values used for controlling the output voltage (Vout).
 *
 * @ingroup OuterVoltageLoopValues
 */
extern VMC_VALUES_t Vout_Control;

/**
 * @defgroup PFC_Flags PFC Common Flags
 * @brief Defines a structure to hold common Power Factor Correction (PFC) flags.
 *
 * This module defines a structure (`PFC_FLAGS_s`) that uses a union to provide
 * both bit-level access to individual flags and a 32-bit value for easy read/write
 * operations. These flags represent the current status and operating mode of the PFC.
 */

/**
 * @brief Structure defining the common PFC flags.
 */
struct PFC_FLAGS_s {

    union {

        struct {
            unsigned Run : 1; ///< Bit 0: Indicates if the PFC is currently running.
            unsigned Stop : 1; ///< Bit 1: Indicates a stop condition for the PFC.
            unsigned Fault : 1; ///< Bit 2: Indicates a general fault condition in the PFC.
            unsigned OC_PH1 : 1; ///< Bit 3: Over Current flag for Phase 1.
            unsigned OC_PH2 : 1; ///< Bit 4: Over Current flag for Phase 2.
            unsigned OC_PH3 : 1; ///< Bit 5: Over Current flag for Phase 3.
            unsigned OV_Vout : 1; ///< Bit 6: Over Voltage flag for the output voltage (Vout).
            // Run Modes
            unsigned AC_AVGCM_no_VMC_3_PH_reverse : 1; ///< Bit 7: AC input, Average Current Mode Control without Voltage Mode Control, 3-Phase, reverse power flow.
            unsigned AC_PFC_1_PH : 1; ///< Bit 8: AC input, Power Factor Correction, 1-Phase operation.
            unsigned AC_PFC_3_PH : 1; ///< Bit 9: AC input, Power Factor Correction, 3-Phase operation.
            unsigned AC_AVGCM_no_VMC_1_PH : 1; ///< Bit 10: AC input, Average Current Mode Control without Voltage Mode Control, 1-Phase.
            unsigned DC_AVGCM_no_VMC_1_PH : 1; ///< Bit 11: DC input, Average Current Mode Control without Voltage Mode Control, 1-Phase.
            unsigned DC_Boost_1_PH : 1; ///< Bit 12: DC input, Boost converter operation, 1-Phase.
            unsigned AC_AVGCM_no_VMC_1_PH_reverse : 1; ///< Bit 13: AC input, Average Current Mode Control without Voltage Mode Control, 1-Phase, reverse power flow.
            unsigned DC_AVGCM_no_VMC_1_PH_reverse : 1; ///< Bit 14: DC input, Average Current Mode Control without Voltage Mode Control, 1-Phase, reverse power flow.
            unsigned AC_Interleaved_PFC_1PH : 1; ///< Bit 15: AC input, Interleaved Single-Phase Power Factor Correction (two boost legs running in parallel).
        } __attribute__((packed)) bits;
        uint32_t value; ///< Buffer for 32-bit word read/write operations of the entire flag set.
    };
};
/**
 * @brief Typedef for the PFC_FLAGS_s structure.
 */
typedef struct PFC_FLAGS_s PFC_FLAGS_t;

/**
 * @brief External declaration of the common PFC flags structure.
 *
 * This global variable provides access to the common PFC status and mode flags.
 * Other parts of the system can read and modify these flags to control
 * the behavior of the PFC.
 *
 * @ingroup PFC_Flags
 */
extern PFC_FLAGS_t PFC_Flags;

/**
 * @brief Structure to hold AC voltage monitor data.
 *
 * This structure is used to store data received from the AC voltage monitor.
 * It contains an array to hold the received 16-bit data.
 */
typedef struct {
    uint16_t Data[8]; ///< Array to store 8 words (16-bit values) from the AC voltage monitor.
} VAC_MONITOR_s;

/**
 * @brief External declaration of the AC voltage monitor data structure.
 *
 * This global variable provides access to the latest AC voltage monitor data.
 * The data is sent from the primary core to the secondary core via a mailbox.
 */
extern VAC_MONITOR_s vac_monitor;


/**
 * @brief External declaration of the adaptive gain factor for the current loop.
 *
 * This global variable holds a Q15 number (fractional value between 0 and 1)
 * that is used as a multiplier for the current loop gain. This allows for
 * adaptive adjustment of the current control loop response at runtime
 */
extern uint16_t current_compensator_gain;

/**
 * @brief External declaration of the output of the midpoint compensator.
 *
 * This global variable holds the output value calculated by the midpoint
 * compensator. This output is used to adjust the DC offset of the current loop
 * compensators (same value used for all 3 compensators) to maintain the desired Vbus midpoint voltage
 */
extern int16_t midpoint_comp_output;

/**
 * @defgroup LEAD_CURRENT_COMP_FIFO Lead Current Compensation FIFO
 * @brief Defines the structure and constants for the lead current compensation FIFO.
 *
 * This module implements a First-In, First-Out (FIFO) buffer used for lead current
 * compensation in a three-phase system. It allows for storing and retrieving
 * historical current reference data for each phase, enabling power factor improvement
 */

/**
 * @brief Defines the length (number of elements) for each lead current compensation FIFO.
 * @ingroup LEAD_CURRENT_COMP_FIFO
 */
#define LEAD_CURRENT_COMP_FIFO_LENGTH         (256)    ///< Length of each FIFO buffer.

/**
 * @brief Defines the width (number of independent FIFOs) for the lead current compensation.
 * @ingroup LEAD_CURRENT_COMP_FIFO
 */
#define LEAD_CURRENT_COMP_FIFO_WIDTH          (3)      ///< One FIFO for each of the three phases.

/**
 * @brief Structure definition for the lead current compensation FIFO.
 * @ingroup LEAD_CURRENT_COMP_FIFO
 */
struct LEAD_CURRENT_COMP_FIFO_s {
    int16_t head; ///< Index where new data will be written.
    int16_t read_offset[LEAD_CURRENT_COMP_FIFO_WIDTH]; ///< Offset from the head to the data that will be read.
    ///< This determines the delay of the compensated current reference.
    int16_t data[LEAD_CURRENT_COMP_FIFO_WIDTH][LEAD_CURRENT_COMP_FIFO_LENGTH]; ///< 2D array storing the FIFO data.
    ///< Rows represent the three phases, and columns the historical data.
    int16_t* ptr_source[LEAD_CURRENT_COMP_FIFO_WIDTH]; ///< Array of pointers to the new current loop reference data for each of the three phases.
    int16_t* ptr_destination[LEAD_CURRENT_COMP_FIFO_WIDTH]; ///< Array of pointers to the destination variable where the delayed data will be written for each phase.
};

typedef struct LEAD_CURRENT_COMP_FIFO_s LEAD_CURRENT_COMP_FIFO_t;

extern LEAD_CURRENT_COMP_FIFO_t lead_current_comp_fifo;


//------------------------------------------------------------------------------
// Function Prototypes
//------------------------------------------------------------------------------

/**
 * @brief Initializes the power control module.
 *
 * This function performs the necessary initialization steps for the
 * power control system. This may include setting initial values for
 * control variables, configuring peripherals, and setting up the
 * initial state of the power stage.
 *
 * @param void No input parameters.
 * @return void No return value.
 */
void Init_pwr_ctrl(void);

#endif	/* _DEV_TPBLPFC_TYPEDEF_H */