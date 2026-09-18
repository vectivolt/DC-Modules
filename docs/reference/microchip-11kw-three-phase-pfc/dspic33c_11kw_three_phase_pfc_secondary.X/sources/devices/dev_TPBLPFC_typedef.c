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

/**
  Section: Included Files
 */

#include <p33CH512MP506S1.h>
#include "PFC_frameworkSetup.h"
#include "dev_TPBLPFC_typedef.h"

#include "misc/useful_macros.h"

/**
 * @def VBUS_DEFAULT
 * @brief  Defines the default VBUS value in ADC units.
 *
 * @param VBUS_DEFAULT_VOLTS The default VBUS voltage value in volts.
 * @param VBUS_SENSE_GAIN The gain of the voltage sense circuit.
 *
 * @details This macro converts the default VBUS voltage from volts to ADC units.
 * It uses the VBUS sense gain to perform the conversion. The result is the
 * ADC representation of the default VBUS voltage.
 *
 * The formula used for the conversion is:
 *
 * \f[
 * VBUS_{ADC} = {VBUS_{Volts}}*{VBUS_{SenseGain}}
 * \f]
 *
 * Where:
 * - \f$ VBUS_{ADC} \f$ is the VBUS value in ADC units.
 * - \f$ VBUS_{Volts} \f$ is the VBUS voltage in volts (passed as \p VBUS_DEFAULT_VOLTS).
 * - \f$ VBUS_{SenseGain} \f$ is the gain of the voltage sense circuit (passed as \p VBUS_SENSE_GAIN).
 *
 * @note The '0.0' in the macro indicates an offset, it is not being used in the calculation as it is removed in firmware
 */
#define VBUS_DEFAULT    (UNITS_FROM_ENG_TO_ADC(VBUS_DEFAULT_VOLTS, VBUS_SENSE_GAIN, 0.0))

/**
 * @file
 * @brief  Documentation for various global variables and enums.
 */

/**
 * @defgroup Global_Variables Global Variables
 * @brief  This section documents the global variables used in the application.
 * @{
 */

/**
 * @var current_compensator_gain
 * @brief  A 16-bit unsigned integer that stores the adaptive gain factor.
 *
 * @details This variable is used to adjust the gain of the current control loop
 * The value 32767 corresponds to the maximum positive value for a Q15 number, 
 */
uint16_t current_compensator_gain = (uint16_t) (0.1 * 32767);

/**
 * @var midpoint_comp_output
 * @brief  A 16-bit signed integer that stores the output of the midpoint compensator.
 *
 * @details This variable holds the midpoint compensator output
 */
int16_t midpoint_comp_output = 0;

/**
 * @var Phase_Values_PH1, Phase_Values_PH2, Phase_Values_PH3
 * @brief  A structure of type PHASE_VALUES_t that stores phase-specific values for Phases 1, 2 and 3.
 * @details  This variable holds values specific to each phase, including current,
 * voltage, and other measurements.
 */
PHASE_VALUES_t Phase_Values_PH1, Phase_Values_PH2, Phase_Values_PH3;

/**
 * @var Vout_Control
 * @brief  A structure of type VMC_VALUES_t that stores output voltage control values.
 * @details This variable holds control parameters and measured values
 * related to the output voltage of the converter.
 */
VMC_VALUES_t Vout_Control;

/**
 * @var PFC_Flags
 * @brief  A structure of type PFC_FLAGS_t that stores flags related to power factor correction.
 * @details This variable contains boolean flags indicating the status of
 * various power factor correction operations.
 */
PFC_FLAGS_t PFC_Flags;

/**
 * @var pwr_ctrl_state
 * @brief  An enum of type PWR_CTRL_STATE_e that stores the power control state.
 * @details  This variable indicates the current state of the power control system.
 * It is initialized to PCS_INIT.
 */
PWR_CTRL_STATE_e pwr_ctrl_state = PCS_INIT; 

/**
* @var vac_monitor
* @brief A structure of type VAC_MONITOR_s that stores AC voltage monitoring data.
* @details This variable holds information related to the monitoring of the
* AC input voltage
*/
VAC_MONITOR_s vac_monitor;

/**
 * @brief Initializes the power control module and related data structures.
 *
 * This function performs the initialization of various components within the
 * power control system. This includes resetting filter counters, filtered values,
 * raw readings, rectified values, and averaged input voltages for the reference
 * potentiometer and the output voltage (Vout). It also initializes control
 * references, phase voltage and current measurements for three phases (PH1, PH2, PH3),
 * control status flags for each phase, and controller values. Finally, it resets
 * common PFC flags and sets the Stop bit.
 *
 * @details The function initializes the following:
 * - Reference set potentiometer readings and filters.
 * - Output voltage (Vout) readings, filters, previous value, and voltage loop output.
 * - Mid-point voltage (Vout_MidPoint) readings and filters.
 * - Control reference values, setting the initial reference to the configured `VOUT_REF`.
 * - Phase voltage and current readings and filters for phases 1, 2, and 3.
 * - Control status flags for each phase, including polarity tracking, relay status,
 * stop and fault flags, polarity change detection, and PWM start flag.
 * - Controller values for each phase, such as duty cycle set value, IAC references,
 * control freeze status, and IAC output.
 * - Common PFC flags, ensuring all flags are cleared and the Stop bit is initially set.
 *
 * @note This function should be called once at the beginning of the program execution
 * to ensure the power control system starts in a known and safe state.
 *
 * @param void No input parameters.
 * @return void No return value.
 *
 */

void Init_pwr_ctrl(void)
{
    //Vout -----------------------------------------------------------------------
    Vout_Control.Vout.FilterCounter = 0;
    Vout_Control.Vout.Filtered = 0;
    Vout_Control.Vout.Raw = 0;
    Vout_Control.Vout.Rectified = 0;
    Vout_Control.Vout.Vin_div_Averaged2 = 0;
    Vout_Control.Vout.PreviousValue = 0;
    Vout_Control.Compensator.output = 0;

    Vout_Control.Vout_MidPoint.FilterCounter = 0;
    Vout_Control.Vout_MidPoint.Filtered = 0;
    Vout_Control.Vout_MidPoint.Raw = 0;

    //Control reference ----------------------------------------------------------
    Vout_Control.Compensator.Reference_Set = VBUS_DEFAULT;
    Vout_Control.Compensator.Reference_Internal = 0;

    //PH1 voltages ---------------------------------------------------------------
    Phase_Values_PH1.Phase_Voltage.FilterCounter = 0;
    Phase_Values_PH1.Phase_Voltage.Filtered = 0;
    Phase_Values_PH1.Phase_Voltage.Raw = 0;
    Phase_Values_PH1.Phase_Voltage.Rectified = 0;
    Phase_Values_PH1.Phase_Voltage.Vin_div_Averaged2 = 0;

    //PH1 currents ---------------------------------------------------------------
    Phase_Values_PH1.Phase_Current.FilterCounter = 0;
    Phase_Values_PH1.Phase_Current.Filtered = 0;
    Phase_Values_PH1.Phase_Current.Raw = 0;
    Phase_Values_PH1.Phase_Current.Rectified = 0;
    Phase_Values_PH1.Phase_Current.Vin_div_Averaged2 = 0;

    //PH1 flags ------------------------------------------------------------------
    Phase_Values_PH1.Control_Status_Flags.bits.VAC_Polarity_last = 0;
    Phase_Values_PH1.Control_Status_Flags.bits.Stop = 0;
    Phase_Values_PH1.Control_Status_Flags.bits.Fault = 0;
    Phase_Values_PH1.Control_Status_Flags.bits.VAC_Polarity_Changed = 0;
    Phase_Values_PH1.Control_Status_Flags.bits.pwmStart = 0;

    //PH1 controller numbers -----------------------------------------------------
    Phase_Values_PH1.current_compensator.Duty_Cycle_PGxDC = 0;
    Phase_Values_PH1.current_compensator.reference = 0;

    Phase_Values_PH1.current_compensator.Control_Freeze = 1;
    Phase_Values_PH1.current_compensator.output = 0;

    //PH2 voltages ---------------------------------------------------------------
    Phase_Values_PH2.Phase_Voltage.FilterCounter = 0;
    Phase_Values_PH2.Phase_Voltage.Filtered = 0;
    Phase_Values_PH2.Phase_Voltage.Raw = 0;
    Phase_Values_PH2.Phase_Voltage.Rectified = 0;
    Phase_Values_PH2.Phase_Voltage.Vin_div_Averaged2 = 0;

    //PH2 currents ---------------------------------------------------------------
    Phase_Values_PH2.Phase_Current.FilterCounter = 0;
    Phase_Values_PH2.Phase_Current.Filtered = 0;
    Phase_Values_PH2.Phase_Current.Raw = 0;
    Phase_Values_PH2.Phase_Current.Rectified = 0;
    Phase_Values_PH2.Phase_Current.Vin_div_Averaged2 = 0;

    //PH2 flags ------------------------------------------------------------------
    Phase_Values_PH2.Control_Status_Flags.bits.VAC_Polarity_last = 0;
    Phase_Values_PH2.Control_Status_Flags.bits.Stop = 0;
    Phase_Values_PH2.Control_Status_Flags.bits.Fault = 0;
    Phase_Values_PH2.Control_Status_Flags.bits.VAC_Polarity_Changed = 0;
    Phase_Values_PH2.Control_Status_Flags.bits.pwmStart = 0;

    //PH2 controller numbers -----------------------------------------------------
    Phase_Values_PH2.current_compensator.Duty_Cycle_PGxDC = 0;
    Phase_Values_PH2.current_compensator.reference = 0;
    Phase_Values_PH2.current_compensator.Control_Freeze = 1;
    Phase_Values_PH2.current_compensator.output = 0;
    //----------------------------------------------------------------------------

    //PH3 voltages ---------------------------------------------------------------
    Phase_Values_PH3.Phase_Voltage.FilterCounter = 0;
    Phase_Values_PH3.Phase_Voltage.Filtered = 0;
    Phase_Values_PH3.Phase_Voltage.Raw = 0;
    Phase_Values_PH3.Phase_Voltage.Rectified = 0;
    Phase_Values_PH3.Phase_Voltage.Vin_div_Averaged2 = 0;

    //PH3 currents ---------------------------------------------------------------
    Phase_Values_PH3.Phase_Current.FilterCounter = 0;
    Phase_Values_PH3.Phase_Current.Filtered = 0;
    Phase_Values_PH3.Phase_Current.Raw = 0;
    Phase_Values_PH3.Phase_Current.Rectified = 0;
    Phase_Values_PH3.Phase_Current.Vin_div_Averaged2 = 0;

    //PH3 flags ------------------------------------------------------------------
    Phase_Values_PH3.Control_Status_Flags.bits.VAC_Polarity_last = 0;
    Phase_Values_PH3.Control_Status_Flags.bits.Stop = 0;
    Phase_Values_PH3.Control_Status_Flags.bits.Fault = 0;
    Phase_Values_PH3.Control_Status_Flags.bits.VAC_Polarity_Changed = 0;
    Phase_Values_PH3.Control_Status_Flags.bits.pwmStart = 0;

    //PH3 controller numbers -----------------------------------------------------
    Phase_Values_PH3.current_compensator.Duty_Cycle_PGxDC = 0;
    Phase_Values_PH3.current_compensator.reference = 0;
    Phase_Values_PH3.current_compensator.Control_Freeze = 1;
    Phase_Values_PH3.current_compensator.output = 0;

    //PFC common Flags
    PFC_Flags.value = 0x00000000;
    PFC_Flags.bits.Stop = 1;
}

//------------------------------------------------------------------------------
//------------------------------------------------------------------------------

/**
 End of File
 */

