/**
 * @copyright
 * (c) 2025 Microchip Technology Inc. and its subsidiaries. You may use this
 * software and any derivatives exclusively with Microchip products.
 *
 * THIS SOFTWARE IS SUPPLIED BY MICROCHIP "AS IS". NO WARRANTIES, WHETHER
 * EXPRESS, IMPLIED OR STATUTORY, APPLY TO THIS SOFTWARE, INCLUDING ANY IMPLIED
 * WARRANTIES OF NON-INFRINGEMENT, MERCHANTABILITY, AND FITNESS FOR A
 * PARTICULAR PURPOSE, OR ITS INTERACTION WITH MICROCHIP PRODUCTS, COMBINATION
 * WITH ANY OTHER PRODUCTS, OR USE IN ANY APPLICATION.
 *
 * IN NO EVENT WILL MICROCHIP BE LIABLE FOR ANY INDIRECT, SPECIAL, PUNITIVE,
 * INCIDENTAL OR CONSEQUENTIAL LOSS, DAMAGE, COST OR EXPENSE OF ANY KIND
 * WHATSOEVER RELATED TO THE SOFTWARE, HOWEVER CAUSED, EVEN IF MICROCHIP HAS
 * BEEN ADVISED OF THE POSSIBILITY OR THE DAMAGES ARE FORESEEABLE. TO THE
 * FULLEST EXTENT ALLOWED BY LAW, MICROCHIP'S TOTAL LIABILITY ON ALL CLAIMS IN
 * ANY WAY RELATED TO THIS SOFTWARE WILL NOT EXCEED THE AMOUNT OF FEES, IF ANY,
 * THAT YOU HAVE PAID DIRECTLY TO MICROCHIP FOR THIS SOFTWARE.
 *
 * MICROCHIP PROVIDES THIS SOFTWARE CONDITIONALLY UPON YOUR ACCEPTANCE OF THESE
 * TERMS.
 */

/**
 * @section Included_Files Included Files
 * @brief  This section lists the header files included in this file.
 */
#include <p33CH512MP506S1.h>
#include <stdlib.h>

#include "drv_adc.h"
#include "system/pins.h"
#include "main_core/main_core.h"

#include "driver/power_controller/drv_pwrctrl_app_misc_TPBLPFC.h"
#include "devices/dev_TPBLPFC_vac_monitor.h"

#include "devices/dev_TPBLPFC_typedef.h"
#include "driver/power_controller/drv_pwrctrl_app_TPBLPFC.h"
#include "PFC_frameworkSetup.h"

#include "driver/power_controller/drv_controller_TPBLPFC.h"

#include "x2cScope/X2CScope.h"

#include "misc/useful_macros.h"

/**
 * @defgroup Local_Defines Local Defines
 * @brief    This section defines the local macros used in this file.
 * @{
 */

/**
 * @def FAULT_IAC_OC
 * @brief  Defines the overcurrent fault threshold for the input AC current.
 *
 * @details This macro converts the fault current value (\p FAULT_IAC_OC_AMPS)
 * from amperes to ADC units using the current sense gain (\p IAC_SENSE_GAIN).
 * It is used for fault protection in the firmware.
 *
 */
#define FAULT_IAC_OC    (UNITS_FROM_ENG_TO_ADC(FAULT_IAC_OC_AMPS,IAC_SENSE_GAIN,0.0))

/**
 * @def FAULT_VBUS_OV
 * @brief  Defines the overvoltage fault threshold for the VBUS voltage.
 *
 * @details This macro converts the fault voltage value (\p FAULT_VBUS_OV_VOLTS)
 * from volts to ADC units using the voltage sense gain (\p VBUS_SENSE_GAIN).
 * It is used for fault protection in the firmware.
 *
 */
#define FAULT_VBUS_OV    (UNITS_FROM_ENG_TO_ADC(FAULT_VBUS_OV_VOLTS,VBUS_SENSE_GAIN,0.0))

/**
 * @}
 */

/**
 * @fn _ADCAN0Interrupt
 * @brief  ADC0 interrupt service routine.
 *
 * @details This function is the interrupt handler for the ADC0 interrupt.  It performs the following tasks:
 * - Sends a trigger to the isolated voltage acquisition board so that it will take a measurement of the AC voltages
 * - Changes the shared ADC channel to measure Vbus and triggers a new conversion.
 * - Reads the raw ADC values for phase currents 1, 2 and 3.
 * - Calculates the rectified and AC components of the phase currents.
 * - Checks for overcurrent faults on phases 1, 2, and 3, and if an overcurrent
 * is detected, it sets the corresponding fault flag, stops the PFC, and sets the stop flag.
 * - Changes shared ADC channel to Vbus midpoint and triggers a new conversion
 * - Reads the raw ADC value for Vbus from the shared core
 * - Checks for an overvoltage fault, and if detected, sets the
 * corresponding fault flag, stops the PFC, and sets the stop flag.
 * - Reads the AC voltage monitor data from the primary core (which is sent via mailbox B)
 * - Reads the raw ADC value for output voltage midpoint
 * - Calls the PWM handler 
 * - Updates the X2CScope data.
 *
 * @note The function uses the `UNITS_FROM_ENG_TO_ADC` macro, `pwr_ctrl_state`, `PFC_Flags`,
 * `Phase_Values_PH1`, `Phase_Values_PH2`, `Phase_Values_PH3`, `Vout_Control`,
 * `vac_monitor`, `MAIN_CORE_ProtocolRead`, `dev_vac_monitor()`, `PWM_handler_PH123()`,
 * and `X2CScope_Update()` functions, and the `ADCON3Lbits`, `ADSTATLbits`,
 * `ADCBUF0`, `ADCBUF1`, `ADCBUF10`, `ADCBUF13`, and `ADCBUF15` registers.
 */
void __attribute__((__interrupt__, auto_psv)) _ADCAN0Interrupt(void)
{
    TP4_DPPIM_RD13_SetHigh();
    
    // set isolated voltage acquisition board trigger
    ACmonitorTrigger_SetHigh(); // used to measure ISR execution time

    // set shared ADC channel to Vbus and trigger a new conversion
    ADCON3Lbits.CNVCHSEL = 10; // change ADC channel
    ADCON3Lbits.CNVRTCH = 1; // trigger conversion

    // phase 1 AC current
    Phase_Values_PH1.Phase_Current.Raw = (int16_t) ADCBUF0;
    Phase_Values_PH1.Phase_Current.Rectified = abs((int16_t) (Phase_Values_PH1.Phase_Current.Raw - Phase_Values_PH1.Phase_Current.Offset)); //phase voltage - offset=VCC/2
    Phase_Values_PH1.Phase_Current.AC = Phase_Values_PH1.Phase_Current.Raw - Phase_Values_PH1.Phase_Current.Offset;
    
    // clear isolated voltage acquisition board trigger
    ACmonitorTrigger_SetLow();
    
    if ((Phase_Values_PH1.Phase_Current.Rectified > FAULT_IAC_OC) && (pwr_ctrl_state > PCS_PREDELAY_RELAYON)) 
    {
        PFC_Flags.bits.OC_PH1 = 1;
        PFC_Flags.bits.Run = 0;
        PFC_Flags.bits.Stop = 1;

        Drv_PwrCtrl_TPBLPFC_Stop();
    }
    
    DAC1DATH = (Phase_Values_PH1.Phase_Current.AC<<3) + 2048; // TODO: remove

    // phase 2 AC current
    Phase_Values_PH2.Phase_Current.Raw = (int16_t) ADCBUF1; 
    Phase_Values_PH2.Phase_Current.Rectified = abs((int16_t) (Phase_Values_PH2.Phase_Current.Raw - Phase_Values_PH2.Phase_Current.Offset));
    Phase_Values_PH2.Phase_Current.AC = Phase_Values_PH2.Phase_Current.Raw - Phase_Values_PH2.Phase_Current.Offset;

    
    if ((Phase_Values_PH2.Phase_Current.Rectified > FAULT_IAC_OC) && (pwr_ctrl_state > PCS_PREDELAY_RELAYON)) 
    {
        PFC_Flags.bits.OC_PH2 = 1;
        PFC_Flags.bits.Run = 0;
        PFC_Flags.bits.Stop = 1;

        Drv_PwrCtrl_TPBLPFC_Stop();
    }

    // phase 3 AC current
    Phase_Values_PH3.Phase_Current.Raw = (int16_t) ADCBUF13; 
    Phase_Values_PH3.Phase_Current.Rectified = abs((int16_t) (Phase_Values_PH3.Phase_Current.Raw - Phase_Values_PH3.Phase_Current.Offset));
    Phase_Values_PH3.Phase_Current.AC = Phase_Values_PH3.Phase_Current.Raw - Phase_Values_PH3.Phase_Current.Offset;

    if ((Phase_Values_PH3.Phase_Current.Rectified > FAULT_IAC_OC) && (pwr_ctrl_state > PCS_PREDELAY_RELAYON)) 
    {
        PFC_Flags.bits.OC_PH3 = 1;
        PFC_Flags.bits.Run = 0;
        PFC_Flags.bits.Stop = 1;

        Drv_PwrCtrl_TPBLPFC_Stop();
    }

    //<< shared core Vbus input is ready because of latency from trigger to here
    //<< from min. 450ns (measured)), AD is 270ns
    Vout_Control.Vout.Raw = ADCBUF10;
    
    // Vbus midpoint ADC: set shared ADC to measure this, trigger conversion
    ADCON3Lbits.CNVCHSEL = 15; // change ADC channel
    ADCON3Lbits.CNVRTCH = 1; // trigger conversion

    if ((Vout_Control.Vout.Raw > FAULT_VBUS_OV)) 
    {
        PFC_Flags.bits.OV_Vout = 1;
        PFC_Flags.bits.Run = 0;
        PFC_Flags.bits.Stop = 1;

        Drv_PwrCtrl_TPBLPFC_Stop();
    }

    // parse the AC voltage monitor data.
    // the AC voltage monitor is run on the primary core
    // the key data is sent by the AC voltage monitor firmware block
    // to the secondary core via Mailbox B
    // the function dev_vac_monitor() pulls this data into the secondary core
    // phase structure objects
    if (MAIN_CORE_ProtocolRead(MSI1_ProtocolB, &(vac_monitor.Data[0])))
    {
        dev_vac_monitor();
    }

    //< Vbus midpoint
    while (!ADSTATLbits.AN15RDY);
    Vout_Control.Vout_MidPoint.Raw = ADCBUF15;
    //#endif

    ADCON3Lbits.CNVCHSEL = 13; // change ADC channel back to phase 3 current, triggered by TRIGA at half of the on-time

    PWM_handler_PH123();

#if ADC_ISR_TO_FSW_RATIO == 2
    // only run x2c scope if ISR is running at 20us
    // as to run ISR at 10us x2c scope must be removed
    // because of time constraints
    X2CScope_Update();
#endif

    IFS5bits.ADCAN0IF = 0; //clear the channel_ANA0 interrupt flag

    TP4_DPPIM_RD13_SetLow();  // used to measure ISR execution time

}

