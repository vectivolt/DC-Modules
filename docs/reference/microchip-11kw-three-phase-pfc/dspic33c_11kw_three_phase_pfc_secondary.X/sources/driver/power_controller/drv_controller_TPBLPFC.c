/**
  @Company
    Microchip Technology Inc.

  @File Name
    Controller_pwrctrl_TPBLPFC.h

  @Summary
    This is the generated driver implementation file using PIC24 / dsPIC33 / PIC32MM MCUs

  @Description
    This source file provides Controller settings for average current mode and voltage mode controller.
    Generation Information :
        Product Revision  :  PIC24 / dsPIC33 / PIC32MM MCUs - 1.167.0
        Device            :  dsPIC33CK256MP506      
    The generated drivers are tested against the following:
        Compiler          :  XC16 v1.70
        MPLAB 	          :  MPLAB X v5.45
 */

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

#include "drv_controller_TPBLPFC.h"
#include "PFC_frameworkSetup.h"
#include "drv_pwrctrl_app_TPBLPFC.h"
#include "misc/useful_macros.h"

/**
 * @def CURRENT_COMP_OUT_MIN
 * @brief Minimum output value of the current compensator.
 *
 * This macro calculates the minimum output value of the current compensator.
 * It is derived by subtracting the 50% duty cycle value from the minimum duty cycle value.
 *
 * @ingroup pfc_hardware_params
 */
#define CURRENT_COMP_OUT_MIN     (DUTYCYCLE_MIN-DUTYCYCLE_50PERCENT)

/**
 * @def CURRENT_COMP_OUT_MAX
 * @brief Maximum output value of the current compensator.
 *
 * This macro calculates the maximum output value of the current compensator.
 * It is derived by subtracting the 50% duty cycle value from the maximum duty cycle value.
 *
 * @ingroup pfc_hardware_params
 */
#define CURRENT_COMP_OUT_MAX     (DUTYCYCLE_MAX-DUTYCYCLE_50PERCENT)


/**
 * @def MIDPOINT_COMP_OUT_MAX
 * @brief Calculates the maximum output value for the midpoint compensator in ADC units.
 *
 * @param MIDPOINT_COMP_OUT_MAX_AMPS The maximum current value for the midpoint compensator in Amperes.
 * @param IAC_SENSE_GAIN The gain of the current sensing circuit (V/A).
 *
 * @details This macro computes the maximum allowable output value for the midpoint
 * compensator. It converts an engineering unit (Amperes) to an ADC unit, then
 * applies a left shift for scaling to ensure that this value has the same scaling
 * as the current loop feedback and reference values
 *
 * The calculation involves:
 * 1. Converting the `MIDPOINT_COMP_OUT_MAX_AMPS` value from Amperes to ADC units
 * using the `UNITS_FROM_ENG_TO_ADC` macro, which takes the engineering value,
 * the current sense gain (`IAC_SENSE_GAIN`), and an offset (0.0).
 * 2. The result of this conversion is then left-shifted by 4 bits, effectively
 * multiplying it by 16, to provide additional resolution or scaling for the
 * compensator's output, to convert to same scaling as current loop compensators 
 * reference and feedback numbers
 *
 * @unit Iac at current sensor output, converted to ADC codes and scaled by 16
 *
 * @ingroup pfc_hardware_params
 */
#define MIDPOINT_COMP_OUT_MAX    ((UNITS_FROM_ENG_TO_ADC(MIDPOINT_COMP_OUT_MAX_AMPS,IAC_SENSE_GAIN,0.0))<<4)


// Define and declare global variables

/**
 * @brief 2P2Z compensator structure for voltage mode control.
 *
 * @note This variable holds the parameters and state of the 2P2Z compensator
 * used for controlling the output voltage (aka bus voltage) of the converter.
 */
SMPS_2P2Z_T VMC_2p2z;

/**
 * @brief 2P2Z compensator structure for vbus midpoint voltage balance control.
 *
 * @note This variable holds the parameters and state of the 2P2Z compensator
 * used for balancing the vbus midpoint voltage in the converter.
 */
SMPS_2P2Z_T NEUTRAL_2p2z;

/**
 * @brief Array of 2P2Z compensator structures for phase current control.
 *
 * @note This array holds the parameters and states of the 2P2Z compensators
 * used for controlling the current in each of the three phases.  The
 * index 0 is unused, so valid indices are 1, 2, and 3.
 */
SMPS_2P2Z_T PHx_AVG_CM2p2z[4];

/**
 * @brief Error history buffer for Phase 1 current compensator.
 *
 * @note  Stores the past three error values used in the 2P2Z calculation.
 * Located in Y memory.
 */
int16_t PH1_AVG_CM2p2zErrorHistory[3] __attribute__((space(ymemory), far));

/**
 * @brief A coefficients for Phase 1 current compensator.
 *
 * @note Stores the 'A' coefficients of the 2P2Z compensator.
 * Located in X memory.
 */
int16_t PH1_AVG_CM2p2zACoefficients[2] __attribute__((space(xmemory)));

/**
 * @brief Control history buffer for Phase 1 current compensator.
 *
 * @note  Stores the past two output values of the 2P2Z compensator.
 * Located in Y memory.
 */
int16_t PH1_AVG_CM2p2zControlHistory[2] __attribute__((space(ymemory), far));

/**
 * @brief B coefficients for Phase 1 current compensator.
 *
 * @note Stores the 'B' coefficients of the 2P2Z compensator.
 * Located in X memory.
 */
int16_t PH1_AVG_CM2p2zBCoefficients[3] __attribute__((space(xmemory)));

/**
 * @brief Error history buffer for Phase 2 current compensator.
 *
 * @note Stores the past three error values used in the 2P2Z calculation.
 * Located in Y memory.
 */
int16_t PH2_AVG_CM2p2zErrorHistory[3] __attribute__((space(ymemory), far));

/**
 * @brief A coefficients for Phase 2 current compensator.
 *
 * @note Stores the 'A' coefficients of the 2P2Z compensator.
 * Located in X memory.
 */
int16_t PH2_AVG_CM2p2zACoefficients[2] __attribute__((space(xmemory)));

/**
 * @brief Control history buffer for Phase 2 current compensator.
 *
 * @note Stores the past two output values of the 2P2Z compensator.
 * Located in Y memory.
 */
int16_t PH2_AVG_CM2p2zControlHistory[2]__attribute__((space(ymemory), far));

/**
 * @brief B coefficients for Phase 2 current compensator.
 *
 * @note Stores the 'B' coefficients of the 2P2Z compensator.
 * Located in X memory.
 */
int16_t PH2_AVG_CM2p2zBCoefficients[3] __attribute__((space(xmemory)));

/**
 * @brief Error history buffer for Phase 3 current compensator.
 *
 * @note Stores the past three error values used in the 2P2Z calculation.
 * Located in Y memory.
 */
int16_t PH3_AVG_CM2p2zErrorHistory[3] __attribute__((space(ymemory), far));

/**
 * @brief A coefficients for Phase 3 current compensator.
 *
 * @note Stores the 'A' coefficients of the 2P2Z compensator.
 * Located in X memory.
 */
int16_t PH3_AVG_CM2p2zACoefficients[2] __attribute__((space(xmemory)));

/**
 * @brief Control history buffer for Phase 3 current compensator.
 *
 * @note Stores the past two output values of the 2P2Z compensator.
 * Located in Y memory.
 */
int16_t PH3_AVG_CM2p2zControlHistory[2] __attribute__((space(ymemory), far));

/**
 * @brief B coefficients for Phase 3 current compensator.
 *
 * @note Stores the 'B' coefficients of the 2P2Z compensator.
 * Located in X memory.
 */
int16_t PH3_AVG_CM2p2zBCoefficients[3] __attribute__((space(xmemory)));

/**
 * @brief Error history buffer for voltage compensator.
 *
 * @note Stores the past three error values used in the 2P2Z calculation.
 * Located in Y memory.
 */
int16_t VMC_2p2zErrorHistory[3] __attribute__((space(ymemory), far));

/**
 * @brief A coefficients for voltage compensator.
 *
 * @note Stores the 'A' coefficients of the 2P2Z compensator.
 * Located in X memory.
 */
int16_t VMC_2p2zACoefficients[2] __attribute__((space(xmemory)));

/**
 * @brief Control history buffer for voltage compensator.
 *
 * @note Stores the past two output values of the 2P2Z compensator.
 * Located in Y memory.
 */
int16_t VMC_2p2zControlHistory[2] __attribute__((space(ymemory), far));

/**
 * @brief B coefficients for voltage compensator.
 *
 * @note Stores the 'B' coefficients of the 2P2Z compensator.
 * Located in X memory.
 */
int16_t VMC_2p2zBCoefficients[3] __attribute__((space(xmemory)));

/**
 * @brief Error history buffer for vbus midpoint voltage balance compensator.
 *
 * @note Stores the past three error values used in the 2P2Z calculation.
 * Located in Y memory.
 */
int16_t NEUTRAL_2p2zErrorHistory[3] __attribute__((space(ymemory), far));

/**
  * @brief A coefficients for vbus midpoint voltage balance compensator.
  *
  * @note Stores the 'A' coefficients of the 2P2Z compensator.
  * Located in X memory.
  */
int16_t NEUTRAL_2p2zACoefficients[2] __attribute__((space(xmemory)));

/**
 * @brief Control history buffer for vbus midpoint voltage balance compensator.
 *
 * @note Stores the past two output values of the 2P2Z compensator.
 * Located in Y memory.
 */
int16_t NEUTRAL_2p2zControlHistory[2] __attribute__((space(ymemory), far));

/**
 * @brief B coefficients for vbus midpoint voltage balance compensator.
 *
 * @note Stores the 'B' coefficients of the 2P2Z compensator.
 * Located in X memory.
 */
int16_t NEUTRAL_2p2zBCoefficients[3] __attribute__((space(xmemory)));

/**
 * @brief   Current loop compensator setup based on mode
 *
 * @param   none
 * @return  none
 *
 * @details This function initializes the 2P2Z compensators for the current control loops
 * of the PFC converter.  It sets up the pointers to the coefficient
 * and history buffers, and configures the compensator parameters based on
 * the HIGH_VOLTAGE macro.
 */
void CurrentController_PwrCtrl_TPBLPFC_Init(void)
{
    uint16_t i_;

    // Initialize pointers for Phase 1 compensator
    PHx_AVG_CM2p2z[1].aCoefficients = &PH1_AVG_CM2p2zACoefficients[0]; // Set up pointer to derived coefficients
    PHx_AVG_CM2p2z[1].bCoefficients = &PH1_AVG_CM2p2zBCoefficients[0]; // Set up pointer to derived coefficients
    PHx_AVG_CM2p2z[1].controlHistory = &PH1_AVG_CM2p2zControlHistory[0]; // Set up pointer to controller history
    PHx_AVG_CM2p2z[1].errorHistory = &PH1_AVG_CM2p2zErrorHistory[0]; // Set up pointer to error history

    // Initialize pointers for Phase 2 compensator
    PHx_AVG_CM2p2z[2].aCoefficients = &PH2_AVG_CM2p2zACoefficients[0]; // Set up pointer to derived coefficients
    PHx_AVG_CM2p2z[2].bCoefficients = &PH2_AVG_CM2p2zBCoefficients[0]; // Set up pointer to derived coefficients
    PHx_AVG_CM2p2z[2].controlHistory = &PH2_AVG_CM2p2zControlHistory[0]; // Set up pointer to controller history
    PHx_AVG_CM2p2z[2].errorHistory = &PH2_AVG_CM2p2zErrorHistory[0]; // Set up pointer to error history

    // Initialize pointers for Phase 3 compensator
    PHx_AVG_CM2p2z[3].aCoefficients = &PH3_AVG_CM2p2zACoefficients[0]; // Set up pointer to derived coefficients
    PHx_AVG_CM2p2z[3].bCoefficients = &PH3_AVG_CM2p2zBCoefficients[0]; // Set up pointer to derived coefficients
    PHx_AVG_CM2p2z[3].controlHistory = &PH3_AVG_CM2p2zControlHistory[0]; // Set up pointer to controller history
    PHx_AVG_CM2p2z[3].errorHistory = &PH3_AVG_CM2p2zErrorHistory[0]; // Set up pointer to error history

#if HIGH_VOLTAGE == 0
    // Low voltage configuration
    for (i_ = 0; i_ < 4; i_++)
    {
        PHx_AVG_CM2p2z[i_].preShift = ICOMP3LV_COMP_2P2Z_PRESHIFT;     // Normalization shift for error amplifier results
        PHx_AVG_CM2p2z[i_].postScaler = ICOMP3LV_COMP_2P2Z_POSTSCALER;
        PHx_AVG_CM2p2z[i_].postShift = ICOMP3LV_COMP_2P2Z_POSTSHIFT;       // Normalization shift for control loop results to peripheral
        PHx_AVG_CM2p2z[i_].minOutput = CURRENT_COMP_OUT_MIN;
        PHx_AVG_CM2p2z[i_].maxOutput = CURRENT_COMP_OUT_MAX;
    }

    // Set coefficients for low voltage operation
    PH1_AVG_CM2p2zACoefficients[0] = ICOMP3LV_COMP_2P2Z_COEFF_A1;
    PH1_AVG_CM2p2zACoefficients[1] = ICOMP3LV_COMP_2P2Z_COEFF_A2;
    PH1_AVG_CM2p2zBCoefficients[0] = ICOMP3LV_COMP_2P2Z_COEFF_B0;
    PH1_AVG_CM2p2zBCoefficients[1] = ICOMP3LV_COMP_2P2Z_COEFF_B1;
    PH1_AVG_CM2p2zBCoefficients[2] = ICOMP3LV_COMP_2P2Z_COEFF_B2;

    PH2_AVG_CM2p2zACoefficients[0] = ICOMP3LV_COMP_2P2Z_COEFF_A1;
    PH2_AVG_CM2p2zACoefficients[1] = ICOMP3LV_COMP_2P2Z_COEFF_A2;
    PH2_AVG_CM2p2zBCoefficients[0] = ICOMP3LV_COMP_2P2Z_COEFF_B0;
    PH2_AVG_CM2p2zBCoefficients[1] = ICOMP3LV_COMP_2P2Z_COEFF_B1;
    PH2_AVG_CM2p2zBCoefficients[2] = ICOMP3LV_COMP_2P2Z_COEFF_B2;

    PH3_AVG_CM2p2zACoefficients[0] = ICOMP3LV_COMP_2P2Z_COEFF_A1;
    PH3_AVG_CM2p2zACoefficients[1] = ICOMP3LV_COMP_2P2Z_COEFF_A2;
    PH3_AVG_CM2p2zBCoefficients[0] = ICOMP3LV_COMP_2P2Z_COEFF_B0;
    PH3_AVG_CM2p2zBCoefficients[1] = ICOMP3LV_COMP_2P2Z_COEFF_B1;
    PH3_AVG_CM2p2zBCoefficients[2] = ICOMP3LV_COMP_2P2Z_COEFF_B2;
#endif

#if HIGH_VOLTAGE == 1
    // High voltage configuration
    for (i_ = 0; i_ < 4; i_++)
    {
        PHx_AVG_CM2p2z[i_].preShift = ICOMP3HV_COMP_2P2Z_PRESHIFT;     // Normalization shift for error amplifier results
        PHx_AVG_CM2p2z[i_].postScaler = ICOMP3HV_COMP_2P2Z_POSTSCALER;
        PHx_AVG_CM2p2z[i_].postShift = ICOMP3HV_COMP_2P2Z_POSTSHIFT;       // Normalization shift for control loop results to peripheral
        PHx_AVG_CM2p2z[i_].minOutput = CURRENT_COMP_OUT_MIN;
        PHx_AVG_CM2p2z[i_].maxOutput = CURRENT_COMP_OUT_MAX;
    }
    // Set coefficients for high voltage operation
    PH1_AVG_CM2p2zACoefficients[0] = ICOMP3HV_COMP_2P2Z_COEFF_A1;
    PH1_AVG_CM2p2zACoefficients[1] = ICOMP3HV_COMP_2P2Z_COEFF_A2;
    PH1_AVG_CM2p2zBCoefficients[0] = ICOMP3HV_COMP_2P2Z_COEFF_B0;
    PH1_AVG_CM2p2zBCoefficients[1] = ICOMP3HV_COMP_2P2Z_COEFF_B1;
    PH1_AVG_CM2p2zBCoefficients[2] = ICOMP3HV_COMP_2P2Z_COEFF_B2;

    PH2_AVG_CM2p2zACoefficients[0] = ICOMP3HV_COMP_2P2Z_COEFF_A1;
    PH2_AVG_CM2p2zACoefficients[1] = ICOMP3HV_COMP_2P2Z_COEFF_A2;
    PH2_AVG_CM2p2zBCoefficients[0] = ICOMP3HV_COMP_2P2Z_COEFF_B0;
    PH2_AVG_CM2p2zBCoefficients[1] = ICOMP3HV_COMP_2P2Z_COEFF_B1;
    PH2_AVG_CM2p2zBCoefficients[2] = ICOMP3HV_COMP_2P2Z_COEFF_B2;

    PH3_AVG_CM2p2zACoefficients[0] = ICOMP3HV_COMP_2P2Z_COEFF_A1;
    PH3_AVG_CM2p2zACoefficients[1] = ICOMP3HV_COMP_2P2Z_COEFF_A2;
    PH3_AVG_CM2p2zBCoefficients[0] = ICOMP3HV_COMP_2P2Z_COEFF_B0;
    PH3_AVG_CM2p2zBCoefficients[1] = ICOMP3HV_COMP_2P2Z_COEFF_B1;
    PH3_AVG_CM2p2zBCoefficients[2] = ICOMP3HV_COMP_2P2Z_COEFF_B2;
#endif

    // Initialize the 2P2Z controllers (clear history)
    SMPS_Controller2P2ZInitialize(&PHx_AVG_CM2p2z[1]);
    SMPS_Controller2P2ZInitialize(&PHx_AVG_CM2p2z[2]);
    SMPS_Controller2P2ZInitialize(&PHx_AVG_CM2p2z[3]);
}

/**
 * @brief   Voltage loop compensator setup based on mode
 *
 * @param   none
 * @return  none
 *
 * @details This function initializes the 2P2Z compensator for the voltage control loop
 * of the PFC converter. It sets up the pointers to the coefficient
 * and history buffers, and configures the compensator parameters 
 */
void VoltageController_PwrCtrl_TPBLPFC_Init(void)
{
    // Initialize pointers for the voltage compensator
    VMC_2p2z.aCoefficients = &VMC_2p2zACoefficients[0]; // Set up pointer to derived coefficients
    VMC_2p2z.bCoefficients = &VMC_2p2zBCoefficients[0]; // Set up pointer to derived coefficients
    VMC_2p2z.controlHistory = &VMC_2p2zControlHistory[0]; // Set up pointer to controller history
    VMC_2p2z.errorHistory = &VMC_2p2zErrorHistory[0]; // Set up pointer to error history

    VMC_2p2z.preShift = VCOMP3PH_COMP_2P2Z_PRESHIFT;   // Normalization shift for error amplifier results
    VMC_2p2z.postScaler = VCOMP3PH_COMP_2P2Z_POSTSCALER;
    VMC_2p2z.postShift = VCOMP3PH_COMP_2P2Z_POSTSHIFT;     // Normalization shift for control loop results to peripheral
    VMC_2p2z.minOutput = VCOMP3PH_COMP_2P2Z_MIN_CLAMP;
    VMC_2p2z.maxOutput = VCOMP3PH_COMP_2P2Z_MAX_CLAMP;
    // Set coefficients
    VMC_2p2zACoefficients[0] = VCOMP3PH_COMP_2P2Z_COEFF_A1;
    VMC_2p2zACoefficients[1] = VCOMP3PH_COMP_2P2Z_COEFF_A2;
    VMC_2p2zBCoefficients[0] = VCOMP3PH_COMP_2P2Z_COEFF_B0;
    VMC_2p2zBCoefficients[1] = VCOMP3PH_COMP_2P2Z_COEFF_B1;
    VMC_2p2zBCoefficients[2] = VCOMP3PH_COMP_2P2Z_COEFF_B2;

    SMPS_Controller2P2ZInitialize(&VMC_2p2z); // Clear histories
}

/**
 * @brief   Vbus Balancer loop compensator setup based on mode
 *
 * @param   none
 * @return  none
 *
 * @details This function initializes the 2P2Z compensator for the vBus midpoint balance control loop
 * of the TPBL PFC converter. It sets up the pointers to the coefficient
 * and history buffers, and configures the compensator parameters.
 */
void VbusMidpointController_PwrCtrl_TPBLPFC_Init(void)
{
    // Initialize pointers for the vbus midpoint voltage balance compensator
    NEUTRAL_2p2z.aCoefficients = &NEUTRAL_2p2zACoefficients[0]; // Set up pointer to derived coefficients
    NEUTRAL_2p2z.bCoefficients = &NEUTRAL_2p2zBCoefficients[0]; // Set up pointer to derived coefficients
    NEUTRAL_2p2z.controlHistory = &NEUTRAL_2p2zControlHistory[0]; // Set up pointer to controller history
    NEUTRAL_2p2z.errorHistory = &NEUTRAL_2p2zErrorHistory[0]; // Set up pointer to error history

    NEUTRAL_2p2z.preShift = NEUTRAL_COMP_2P2Z_PRESHIFT;   // Normalization shift for error amplifier results
    NEUTRAL_2p2z.postScaler = NEUTRAL_COMP_2P2Z_POSTSCALER;
    NEUTRAL_2p2z.postShift = NEUTRAL_COMP_2P2Z_POSTSHIFT;     // Normalization shift for control loop results to peripheral
    
//    NEUTRAL_2p2z.minOutput = NEUTRAL_COMP_2P2Z_MIN_CLAMP;    //TODO: remove
//    NEUTRAL_2p2z.maxOutput = NEUTRAL_COMP_2P2Z_MAX_CLAMP;    //TODO: remove    
    NEUTRAL_2p2z.minOutput = -MIDPOINT_COMP_OUT_MAX;      //TODO: replace
    NEUTRAL_2p2z.maxOutput = MIDPOINT_COMP_OUT_MAX;       //TODO: replace

    NEUTRAL_2p2zACoefficients[0] = NEUTRAL_COMP_2P2Z_COEFF_A1;
    NEUTRAL_2p2zACoefficients[1] = NEUTRAL_COMP_2P2Z_COEFF_A2;
    NEUTRAL_2p2zBCoefficients[0] = NEUTRAL_COMP_2P2Z_COEFF_B0;
    NEUTRAL_2p2zBCoefficients[1] = NEUTRAL_COMP_2P2Z_COEFF_B1;
    NEUTRAL_2p2zBCoefficients[2] = NEUTRAL_COMP_2P2Z_COEFF_B2;

    SMPS_Controller2P2ZInitialize(&NEUTRAL_2p2z); // Clear histories
}
