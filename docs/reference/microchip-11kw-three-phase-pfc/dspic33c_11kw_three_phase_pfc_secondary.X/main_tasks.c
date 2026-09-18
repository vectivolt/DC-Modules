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

#include "mcc_generated_files/system/pins.h"
#include "mcc_generated_files/system/interrupt.h"

#include "sources/driver/msi/drv_msi.h"
#include "sources/devices/dev_TPBLPFC_typedef.h"
#include "sources/driver/power_controller/drv_pwrctrl_app_misc_TPBLPFC.h"
#include "sources/misc/MCC_add_on.h"
#include "pwm_hs/pwm.h"

#include "PFC_frameworkSetup.h"
#include "sources/driver/power_controller/drv_controller_TPBLPFC.h"

#include "misc/useful_macros.h"

/**
 * @brief Defines the call period for the state machine task.
 *
 * This constant defines the time interval, in seconds, at which the
 * state machine's main task or update function is intended to be called.
 * This period dictates the responsiveness and update frequency of the
 * state machine and the system it controls.
 */
#define STATE_MACHINE_CALL_PERIOD         (100.0e-6)  ///< Call period of the stat

/*******************************************************************************
 * @details static functions in main_task.c    
 *          functions are performance optimized inlined        
 *******************************************************************************/

static PWR_CTRL_STATE_e Init_StateHandler(void);
static PWR_CTRL_STATE_e StandBy_StateHandler(void);
static PWR_CTRL_STATE_e SoftStart_StateHandler(void);
static PWR_CTRL_STATE_e UpAndRunning_StateHandler(void);
static PWR_CTRL_STATE_e VACOK_Check(void);
static void start_control(void);

/**
 * @defgroup TimeStepDefinitions Time Step Definitions
 * @brief Defines time constants based on the `STATE_MACHINE_CALL_PERIOD` scheduler step.
 *
 * This module defines various time durations in terms of the number of
 * `STATE_MACHINE_CALL_PERIOD` intervals. This approach ensures that time-based
 * operations within the state machine are synchronized with the scheduler's
 * execution rate.
 */

/**
 * @brief Defines a 2-second time duration in terms of scheduler steps.
 * @ingroup TimeStepDefinitions
 */
#define T2_SECS                 ((uint16_t)(2.0/STATE_MACHINE_CALL_PERIOD))  ///< Equivalent to 2 seconds in scheduler ticks.

/**
 * @brief Defines a 1-second time duration in terms of scheduler steps.
 * @ingroup TimeStepDefinitions
 */
#define T1_SECS                 ((uint16_t)(1.0/STATE_MACHINE_CALL_PERIOD))  ///< Equivalent to 1 second in scheduler ticks.

/**
 * @brief Defines a 100-millisecond time duration in terms of scheduler steps.
 * @ingroup TimeStepDefinitions
 */
#define T100_mSECS             ((uint16_t)(100.0e-3/STATE_MACHINE_CALL_PERIOD)) ///< Equivalent to 100 milliseconds in scheduler ticks.

/**
 * @brief Defines the lower limit for the acceptable current sensor offset.
 * @ingroup TimeStepDefinitions
 *
 * This constant represents the lowest ADC code value that is considered
 * acceptable for the current sensor's offset. The ideal offset value is
 * typically around 2048 (corresponding to 1.65V at the ADC input).
 * Values below this limit might indicate a calibration issue or a sensor fault.
 * set the low limit to be 2% below the ideal value
 */
#define CURRENT_SENSOR_OFFSET_LOW_LIMIT     (UNITS_FROM_ENG_TO_ADC(IAC_SENSE_OFS*0.98, 1.0, 0.0))///< Lower acceptable ADC value for current sensor offset.

/**
 * @brief Defines the upper limit for the acceptable current sensor offset.
 * @ingroup TimeStepDefinitions
 *
 * This constant represents the highest ADC code value that is considered
 * acceptable for the current sensor's offset. The ideal offset value is
 * typically around 2048 (corresponding to 1.65V at the ADC input).
 * Values above this limit might indicate a calibration issue or a sensor fault.
 * set the high limit to be 2% above the ideal value
 */
#define CURRENT_SENSOR_OFFSET_HIGH_LIMIT (UNITS_FROM_ENG_TO_ADC(IAC_SENSE_OFS*1.02, 1.0, 0.0)) ///< Upper acceptable ADC value for current sensor offset.

/**
 * @defgroup StaticVariables Static Variables
 * @brief Defines static variables used within the module.
 *
 * This module defines static variables that are used internally within the
 * current source file to maintain state or timing information.
 */

/**
 * @brief Static variable to track time delays related to relay operation.
 * @ingroup StaticVariables
 *
 * This counter is used to time delays both before and after the main power
 * relay is activated during the startup sequence. It is initialized to
 * `T2_SECS`, which represents a 2-second delay.
 */
static uint16_t RelayTimeCounter = T2_SECS;

/**
 * @brief Static variable to track the duration of the current sensor calibration phase.
 * @ingroup StaticVariables
 *
 * This counter defines the time window during which the offset values of the
 * current sensors are measured and averaged. It is initialized to `T2_SECS`,
 * indicating a 2-second calibration period.
 */
static uint16_t CalibrationTimeCounter = T2_SECS;

/**
 * @fn          void Tasks_100us()
 * @brief       100us scheduler tasks
 * @param       none
 * @return      none
 * @details     task which runs every 100us
 * contains CAN read and write handlers (indirectly via primary core)
 * and PFC power controller state machine
 *
 */

void Tasks_100us(void)
{
    // read contents of mailbox A.
    // CAN handler runs on the primary core
    // when a CAN message is received by the primary core from the PBV GUI
    // the CAN handler on the primary core places the received CAN message in
    // mailbox A where it is processed by the secondary core firmware
    ReceiveMSIAMessage();

    // A 32-word FIFO is used to send data from the secondary core to the primary core
    // this is important PFC information (voltages, currents) which is ultimately
    // displayed on the PBV GUI for the user
    if ((SI1FIFOCSbits.SWFEN) && (SI1FIFOCSbits.SWFEMPTY))
    {
        SendMSIFIFOMessage();
    }
    //<<----------------------------------------------------------------------


    // PFC power controller state machine
    switch (pwr_ctrl_state)
    {
            //<<--------------------------------------------------------------------
        case PCS_INIT:
            // waiting for initial conditions to be met before proceeding
            // proceed from here only if AC OK flag is set for all 3 phases, and
            // if current sensor calibration for all 3 phases passes
            pwr_ctrl_state = Init_StateHandler();

            break;

            //<<--------------------------------------------------------------------
        case PCS_STANDBY:
            // wait here until PBV GUI tells the PFC to start
            // or if AUTO_START is defined, go ahead when all AC OK flags are set
            pwr_ctrl_state = StandBy_StateHandler();
            RelayTimeCounter = T1_SECS;

            break;

            //<<--------------------------------------------------------------------
        case PCS_PREDELAY_RELAYON:
            // delay state before turning on the relay
            if ((RelayTimeCounter--) == 0)
            {
                RelayTimeCounter = T100_mSECS;
                RELAY_SetHigh(); // Relay ON
                pwr_ctrl_state = PCS_POSTDELAY_RELAYON;
            }

            break;

            //<<--------------------------------------------------------------------
        case PCS_POSTDELAY_RELAYON:
            // delay state after turning on the relay
            // after this delay has elapsed, start control
            if (RelayTimeCounter-- == 0)
            {
                start_control();

#ifndef VOLTAGE_LOOP
                // no voltage loop, so only current loops active
                Vout_Control.Compensator.Reference_Internal = 0;
#endif // #ifndef VOLTAGE_LOOP

                pwr_ctrl_state = PCS_SOFT_START;
            }

            break;

            //<<--------------------------------------------------------------------
        case PCS_SOFT_START:

            pwr_ctrl_state = SoftStart_StateHandler();
            pwr_ctrl_state = Softstart_reference();
        
            break;

            //<<--------------------------------------------------------------------
        case PCS_UP_AND_RUNNING:

            pwr_ctrl_state = UpAndRunning_StateHandler();

            break;

            //<<--------------------------------------------------------------------
        case PCS_STALL_DEBUG:
            //stall when VACOK is false (whatever phase) or if current sensor calibration fails
            Nop();

            break;

            //<<--------------------------------------------------------------------
        default:

            break;
    }
    //<<----------------------------------------------------------------------

    pwr_ctrl_state = VACOK_Check();


}

/**
 * @fn          static __inline__ PWR_CTRL_STATE_e Init_StateHandler(void)
 * @brief       Power controller state handler for `PCS_INIT`.
 *
 * @param       void No input parameters.
 * @return      PWR_CTRL_STATE_e The next power controller state.
 *
 * @details     This state is the initial state of the power controller. It waits
 * for the following conditions to be met before transitioning to the
 * `PCS_STANDBY` state:
 * - AC input voltage is within the acceptable range (`VAC_OK` flag is set)
 * for all three phases (or the single tested phase if `SINGLE_PHASE_TEST`
 * is defined).
 * - The current sensor offset calibration is valid for all three phases
 * (or the single tested phase). This is checked after a delay determined
 * by `CalibrationTimeCounter`. The acceptable offset range is defined
 * by `CURRENT_SENSOR_OFFSET_LOW_LIMIT` and `CURRENT_SENSOR_OFFSET_HIGH_LIMIT`.
 *
 * If the AC input is not OK, the state remains `PCS_INIT`. If the AC input
 * is OK but the current sensor calibration fails after the timeout, the state
 * transitions to `PCS_STALL_DEBUG`, indicating a critical error that likely
 * requires a system reset.
 */
static __inline__ PWR_CTRL_STATE_e Init_StateHandler(void)
{
    static PWR_CTRL_STATE_e returnvalue = PCS_INIT; // Initialize return value to the current state

#ifndef SINGLE_PHASE_TEST
    // Check if AC OK for all three phases
    if ((Phase_Values_PH1.vac_status_flags.bits.VAC_OK) &&
            (Phase_Values_PH2.vac_status_flags.bits.VAC_OK) &&
            (Phase_Values_PH3.vac_status_flags.bits.VAC_OK))
#else
    //<<< L1 single phase test: Check if AC OK for phase 1 only
    if (Phase_Values_PH1.vac_status_flags.bits.VAC_OK)
#endif
    {
        // Wait for the calibration time to elapse
        if ((CalibrationTimeCounter--) == 0)
        {
#ifndef SINGLE_PHASE_TEST
            // Check if current sensor offsets are within the acceptable range for all three phases
            if (((Phase_Values_PH1.Phase_Current.Offset > CURRENT_SENSOR_OFFSET_LOW_LIMIT) || (Phase_Values_PH1.Phase_Current.Offset < CURRENT_SENSOR_OFFSET_HIGH_LIMIT)) &&
                    ((Phase_Values_PH2.Phase_Current.Offset > CURRENT_SENSOR_OFFSET_LOW_LIMIT) || (Phase_Values_PH2.Phase_Current.Offset < CURRENT_SENSOR_OFFSET_HIGH_LIMIT)) &&
                    ((Phase_Values_PH3.Phase_Current.Offset > CURRENT_SENSOR_OFFSET_LOW_LIMIT) || (Phase_Values_PH3.Phase_Current.Offset < CURRENT_SENSOR_OFFSET_HIGH_LIMIT)))
#else
            //<<< L1 single phase test: Check if current sensor offset is within the acceptable range for phase 1
            if ((Phase_Values_PH1.Phase_Current.Offset > CURRENT_SENSOR_OFFSET_LOW_LIMIT) || (Phase_Values_PH1.Phase_Current.Offset < CURRENT_SENSOR_OFFSET_HIGH_LIMIT))
#endif
            {
                returnvalue = PCS_STANDBY; // Calibration successful, proceed to standby
            }
            else
            {
                returnvalue = PCS_STALL_DEBUG; // Calibration failed, go to stall state
            }
        }
        else
        {
            returnvalue = PCS_INIT; // Wait for calibration time
        }
    }
    else
    {
        returnvalue = PCS_INIT; // Wait for AC OK
    }

    return returnvalue;
}

/**
 * @fn          static __inline__ PWR_CTRL_STATE_e StandBy_StateHandler(void)
 * @brief       Power controller state handler for `PCS_STANDBY`.
 *
 * @param       void No input parameters.
 * @return      PWR_CTRL_STATE_e The next power controller state.
 *
 * @details     In this state, the power controller is waiting for a signal to start
 * the PFC operation. The start condition can be triggered in two ways:
 * - Automatically, if the `AUTO_START` preprocessor definition is enabled and
 * the AC input voltage is detected as OK (`VAC_OK` flag is set) for all
 * three phases. 
 * - Via a command from the PBV GUI (via a CAN message), which sets
 * the `PFC_Flags.bits.Run` flag. This is the more usual route of the two ways
 *
 * Upon receiving the start signal, the function resets various fault flags
 * and status flags. It then transitions to the
 * `PCS_PREDELAY_RELAYON` state to begin the relay activation sequence.
 *
 * If the start condition is not met, the system remains in the `PCS_STANDBY` state.
 */
static __inline__ PWR_CTRL_STATE_e StandBy_StateHandler(void)
{
    static PWR_CTRL_STATE_e returnvalue = PCS_STANDBY; // Initialize return value

#ifdef AUTO_START // Start PFC automatically without CAN GUI
    if ((Phase_Values_PH1.vac_status_flags.bits.VAC_OK) &&
            (Phase_Values_PH2.vac_status_flags.bits.VAC_OK) &&
            (Phase_Values_PH3.vac_status_flags.bits.VAC_OK))
    {
#else   // Normal operation, when PBV GUI is used
    if (PFC_Flags.bits.Run)
    {
#endif  // #ifdef AUTO_START
        PFC_Flags.bits.Fault = 0;
        PFC_Flags.bits.OC_PH1 = 0;
        PFC_Flags.bits.OC_PH2 = 0;
        PFC_Flags.bits.OC_PH3 = 0;
        PFC_Flags.bits.Stop = 0;
        PFC_Flags.bits.OV_Vout = 0;

        Phase_Values_PH1.Control_Status_Flags.bits.VAC_Polarity_last = Phase_Values_PH1.vac_status_flags.bits.VAC_Polarity = 0;
        Phase_Values_PH2.Control_Status_Flags.bits.VAC_Polarity_last = Phase_Values_PH2.vac_status_flags.bits.VAC_Polarity = 0;
        Phase_Values_PH3.Control_Status_Flags.bits.VAC_Polarity_last = Phase_Values_PH3.vac_status_flags.bits.VAC_Polarity = 0;

        returnvalue = PCS_PREDELAY_RELAYON;
    }
    else
    {
        returnvalue = PCS_STANDBY; // Remain in standby state
    }

    return returnvalue;
}

/**
 * @fn          static __inline__ void start_control(void)
 * @brief       Initializes the control loops and enables PWM output.
 *
 * @param       void No input parameters.
 * @return      void No return value.
 *
 * @details     This function is called to initialize the various control compensators
 * and prepare the system for active power control. It performs the following steps:
 * - Disables global interrupts to ensure atomic initialization of the compensators.
 * - Initializes the 2-Pole 2-Zero (2P2Z) controllers for the current loops of each
 * phase (Phase 1, Phase 2, and Phase 3). This involves clearing their internal
 * history and setting initial conditions. The `PHx_AVG_CM2p2z` structures 
 * hold the coefficients and state variables for these controllers.
 * - Initializes the 2P2Z controller for the output bus voltage (`VMC_2p2z`).
 * - Initializes the 2P2Z controller for the passive midpoint compensator
 * (`NEUTRAL_2p2z`).
 * - Sets the initial reference value for the output bus voltage compensator to whatver the
 * average value of the bus voltage (`Vout_Control.Vout.Filtered`) is. This
 * ensures a smooth transition into the voltage control mode.
 * - Resets the output of the current loop compensators for all three phases to zero.
 * - Enables the PWM outputs for all three phases by setting the `pwmStart` bit in
 * the `Control_Status_Flags` for each phase. These semaphores are used in
 * conjunction with zero-crossing detection to ensure that PWM switching begins
 * synchronously with the AC voltage, preventing potential overcurrent faults at startup.
 * - Re-enables global interrupts after the initialization is complete.
 */
static __inline__ void start_control(void)
{
    // Disable interrupts while initializing compensators for data integrity
    INTERRUPT_GlobalDisable();

    // Initialize the 2P2Z controller for the current loop of Phase 1
    SMPS_Controller2P2ZInitialize(&PHx_AVG_CM2p2z[1]);
    // Initialize the 2P2Z controller for the current loop of Phase 2
    SMPS_Controller2P2ZInitialize(&PHx_AVG_CM2p2z[2]);
    // Initialize the 2P2Z controller for the current loop of Phase 3
    SMPS_Controller2P2ZInitialize(&PHx_AVG_CM2p2z[3]);

    // Initialize the 2P2Z controller for the output bus voltage control loop
    SMPS_Controller2P2ZInitialize(&VMC_2p2z);
    // Initialize the 2P2Z controller for the passive midpoint balancing control loop
    SMPS_Controller2P2ZInitialize(&NEUTRAL_2p2z);

    // Set the initial reference for the output voltage compensator to the current filtered Vout
    Vout_Control.Compensator.Reference_Internal = Vout_Control.Vout.Filtered;

    // Preset the output of the current compensators for all phases to zero
    Phase_Values_PH1.current_compensator.output = 0;
    Phase_Values_PH2.current_compensator.output = 0;
    Phase_Values_PH3.current_compensator.output = 0;

    // Enable PWM output for all three phases using start semaphores.
    // These semaphores are likely used with zero-crossing detection to synchronize
    // PWM start and prevent AC overcurrent faults.
    Phase_Values_PH1.Control_Status_Flags.bits.pwmStart = 1;
    Phase_Values_PH2.Control_Status_Flags.bits.pwmStart = 1;
    Phase_Values_PH3.Control_Status_Flags.bits.pwmStart = 1;

    // Re-enable global interrupts after critical initializations
    INTERRUPT_GlobalEnable();
}

/**
 * @fn          static __inline__ PWR_CTRL_STATE_e SoftStart_StateHandler(void)
 * @brief       Power controller state handler for `PCS_SOFT_START`.
 *
 * @param       void No input parameters.
 * @return      PWR_CTRL_STATE_e The next power controller state.
 *
 * @details     This state manages the soft-start process of the power converter.
 * During soft start, the system gradually increases the output voltage setpoint
 * to its target operating point, preventing abrupt changes and potential stress
 * on the components.
 *
 * If the `Run` flag remains set, the soft-start process is active, and the
 * state machine remains in the `PCS_SOFT_START` state. The actual ramping of the
 * output (voltage or current) is handled elsewhere in the code, in a separate 
 * soft-start control function.
 */
static __inline__ PWR_CTRL_STATE_e SoftStart_StateHandler(void)
{
    static PWR_CTRL_STATE_e returnvalue = PCS_SOFT_START; // Initialize return value to the current state

    // Check if the PFC run flag is cleared (stop command)
    if (!PFC_Flags.bits.Run)
    {
        // Initiate shutdown sequence
        Drv_PwrCtrl_TPBLPFC_Stop(); // Call driver stop function
        RELAY_SetLow(); // Turn off the main power relay

        returnvalue = PCS_STANDBY; // Transition to standby state
    }
    else
    {
        returnvalue = pwr_ctrl_state; // Continue soft start, remain in the current state
    }

    return returnvalue;
}

/**
 * @fn          static __inline__ PWR_CTRL_STATE_e UpAndRunning_StateHandler(void)
 * @brief       Power controller state handler for `PCS_UP_AND_RUNNING`.
 *
 * @param       void No input parameters.
 * @return      PWR_CTRL_STATE_e The next power controller state.
 *
 * @details     This state represents the normal operating mode of the power
 * converter, where it actively regulates the output voltage or current.
 *
 * The function first checks if the `Run` flag in `PFC_Flags` is cleared. If it
 * is, a stop command has been received, and the function initiates a shutdown
 * sequence:
 *
 * If the `Run` flag is still set, the function then checks if the internal
 * output voltage reference (`Vout_Control.Compensator.Reference_Internal`) is
 * different from the setpoint reference (`Vout_Control.Compensator.Reference_Set`).
 * If these references are not equal, it indicates a change in the desired output
 * voltage, and the state machine transitions back to `PCS_SOFT_START` to
 * implement a smooth change to the new setpoint.
 *
 * If the `Run` flag is set and the internal reference matches the setpoint
 * reference, the system remains in the `PCS_UP_AND_RUNNING` state, continuing
 * normal operation.
 */
static __inline__ PWR_CTRL_STATE_e UpAndRunning_StateHandler(void)
{
    static PWR_CTRL_STATE_e returnvalue = PCS_UP_AND_RUNNING; // Initialize return value

    // Check for stop command
    if (!PFC_Flags.bits.Run)
    {
        // Initiate shutdown
        Drv_PwrCtrl_TPBLPFC_Stop();
        RELAY_SetLow();

        returnvalue = PCS_STANDBY; // Transition to standby
    }
        // Check if the internal voltage reference differs from the setpoint
    else if (Vout_Control.Compensator.Reference_Internal != Vout_Control.Compensator.Reference_Set)
    {
        returnvalue = PCS_SOFT_START; // Transition back to soft start to handle new setpoint
    }
    else
    {
        returnvalue = PCS_UP_AND_RUNNING; // Continue normal operation
    }

    return returnvalue;
}

/**
 * @fn          static __inline__ PWR_CTRL_STATE_e VACOK_Check(void)
 * @brief       Checks the AC input voltage status and potentially triggers a fault.
 *
 * @param       void No input parameters.
 * @return      PWR_CTRL_STATE_e The next power controller state.
 *
 * @details     This function monitors the `VAC_OK` status flags for all active
 * input phases. It is called periodically to ensure that the AC input remains
 * within acceptable limits during operation (after the initial relay has been
 * turned on, indicated by `pwr_ctrl_state > PCS_PREDELAY_RELAYON`).
 *
 * If the system is operating (i.e., past the pre-relay-on delay) and the `VAC_OK`
 * flag for any of the active phases becomes false:
 * - The main power relay is turned off using `RELAY_SetLow()`.
 * - The `Drv_PwrCtrl_TPBLPFC_Stop()` function is called to initiate a controlled
 * stop of the power switching.
 * - The power controller state is transitioned to `PCS_STALL_DEBUG`, indicating
 * a fault condition.
 * - The `Run` flag in `PFC_Flags` is cleared to stop normal operation.
 * - The `Stop` flag in `PFC_Flags` is set to indicate that a stop has been
 * triggered due to a fault.
 *
 * If the system is not yet operating (before or during the relay turn-on sequence)
 * or if the `VAC_OK` flags for all active phases remain true, the function returns
 * the current power controller state, indicating no change in state.
 *
 * @note The number of phases checked depends on the `SINGLE_PHASE_TEST` preprocessor
 * definition. In normal operation, all three phases are checked. In single-phase
 * test mode, only Phase 1 is monitored.
 */
static __inline__ PWR_CTRL_STATE_e VACOK_Check(void)
{
    static PWR_CTRL_STATE_e returnvalue = PCS_INIT; // Initialize return value (though it's updated)

    // Only check VAC OK status after the relay turn-on sequence has started
    if (pwr_ctrl_state > PCS_PREDELAY_RELAYON)
    {
#ifndef SINGLE_PHASE_TEST
        // Check VAC OK status for all three phases
        if ((!Phase_Values_PH1.vac_status_flags.bits.VAC_OK) ||
                (!Phase_Values_PH2.vac_status_flags.bits.VAC_OK) ||
                (!Phase_Values_PH3.vac_status_flags.bits.VAC_OK))
#else
        // Check VAC OK status for the single tested phase (Phase 1)
        if ((!Phase_Values_PH1.vac_status_flags.bits.VAC_OK))
#endif
        {
            RELAY_SetLow(); // Turn off the main power relay
            Drv_PwrCtrl_TPBLPFC_Stop(); // Initiate driver stop
            returnvalue = PCS_STALL_DEBUG; // Transition to stall debug state
            PFC_Flags.bits.Run = 0; // Clear the run flag
            PFC_Flags.bits.Stop = 1; // Set the stop flag
        }
        else
        {
            returnvalue = pwr_ctrl_state; // AC OK, maintain current state
        }
    }
    else
    {
        returnvalue = pwr_ctrl_state; // Before relay on, maintain current state
    }

    return returnvalue;
}

//------------------------------------------------------------------------------
//------------------------------------------------------------------------------


/**
 End of File
 */

