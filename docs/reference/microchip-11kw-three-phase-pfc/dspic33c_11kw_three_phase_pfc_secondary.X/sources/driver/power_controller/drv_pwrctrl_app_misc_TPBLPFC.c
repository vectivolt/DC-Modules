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

#include <xc.h>
#include <stdint.h>

#include "system/pins.h"

#include "drv_controller_TPBLPFC.h"
#include "devices/dev_TPBLPFC_typedef.h"
#include "PFC_frameworkSetup.h"
#include "misc/MCC_add_on.h"
#include "pwm_hs/pwm.h"

#include "driver/power_controller/drv_pwrctrl_app_TPBLPFC.h"

/**
 * @fn             Drv_PwrCtrl_TPBLPFC_Init
 * @brief          Initializes the controller and switch ports.
 *
 * @details        This function performs the followinginitializations:
 * - Initializes the current controller.
 * - Initializes the voltage controller.
 * - Initializes the Vbus midpoint controller.
 * - Enables the PWM generators for phases 1, 2, and 3.
 * - Initializes the lead current compensator FIFO.
 * - Resets the internal voltage reference for Vout control.
 *
 * @param          none
 * @return         none
 */
void Drv_PwrCtrl_TPBLPFC_Init(void)
{
    CurrentController_PwrCtrl_TPBLPFC_Init();
    VoltageController_PwrCtrl_TPBLPFC_Init();
    VbusMidpointController_PwrCtrl_TPBLPFC_Init();

    PWM_GeneratorEnable(PH1_PWM);
    PWM_GeneratorEnable(PH2_PWM);
    PWM_GeneratorEnable(PH3_PWM);

    lead_current_comp_fifo_init();

    Vout_Control.Compensator.Reference_Internal = 0;
}

/**
 * @fn             Drv_PwrCtrl_TPBLPFC_Stop
 * @brief          Disables PWMs (switch ports).
 *
 * @details        This function disables the PWM generators and related
 * control settings.  Specifically, it performs the following actions:
 * - Resets the PWM start flags for phases 1, 2, and 3 for a clean start the next time
 * - Freezes the current compensators for phases 1, 2, and 3.
 * - Resets the output of the current compensators for phases 1, 2, and 3.
 * - Disables the high and low outputs for PWM generators 1, 2, and 3.
 * - Sets the duty cycle of PWM generators 1, 2, and 3 to 0.
 *
 * @param          none
 * @return         none
 */
void Drv_PwrCtrl_TPBLPFC_Stop(void)
{
    Phase_Values_PH1.Control_Status_Flags.bits.pwmStart = 0;
    Phase_Values_PH2.Control_Status_Flags.bits.pwmStart = 0;
    Phase_Values_PH3.Control_Status_Flags.bits.pwmStart = 0;

    Phase_Values_PH1.current_compensator.Control_Freeze = 1;
    Phase_Values_PH2.current_compensator.Control_Freeze = 1;
    Phase_Values_PH3.current_compensator.Control_Freeze = 1;

    Phase_Values_PH1.current_compensator.output = 0;
    Phase_Values_PH2.current_compensator.output = 0;
    Phase_Values_PH3.current_compensator.output = 0;
    
    // note that setting PWM_OverrideHighEnable() and PWM_OverrideLowEnable()
    // disables the PWM output, because we have set OVRDAT to 0 then 
    // the PWM outputs are set to 0
    PWM_OverrideHighEnable(PH1_PWM); 
    PWM_OverrideLowEnable(PH1_PWM); 
    PWM_DutyCycleSet(PH1_PWM, 0);
    PWM_OverrideHighEnable(PH2_PWM); 
    PWM_OverrideLowEnable(PH2_PWM); 
    PWM_DutyCycleSet(PH2_PWM, 0);
    PWM_OverrideHighEnable(PH3_PWM); 
    PWM_OverrideLowEnable(PH3_PWM); 
    PWM_DutyCycleSet(PH3_PWM, 0);
}


/**
 * @fn             Softstart_reference
 * @brief          Softstart ramp for Vout.
 *
 * @details        This function implements a soft-start ramp for the output
 * voltage (Vout).  It gradually increases or decreases the internal
 * reference voltage until it reaches the setpoint, controlling the
 * rate of change.
 *
 * The function uses a counter (`SoftstartCounter`) and a ramp speed
 * (`SOFT_START_STEP`) to control the ramp rate. The function
 * checks if the internal reference is below or above the setpoint
 * and increments or decrements it accordingly.
 *
 * @return         The current power control state.  The function returns
 * `PCS_UP_AND_RUNNING` when the soft-start ramp is complete
 * (i.e., when the internal reference reaches the setpoint).
 */
#define SOFT_START_STEP         (4)
#define SOFT_START_DELAY        (30)

PWR_CTRL_STATE_e Softstart_reference(void)
{
    static uint16_t SoftstartCounter = 0;
    static PWR_CTRL_STATE_e returnvalue = 1;

    if (++SoftstartCounter > SOFT_START_DELAY)
    {
        if (Vout_Control.Compensator.Reference_Internal <= Vout_Control.Compensator.Reference_Set)
        {
            // target reference is greater than reference, so increase reference until its >= target reference
            if ((Vout_Control.Compensator.Reference_Internal + SOFT_START_STEP) < Vout_Control.Compensator.Reference_Set)
            {
                Vout_Control.Compensator.Reference_Internal += SOFT_START_STEP;
                returnvalue = pwr_ctrl_state;
            }
            else
            {
                // reference is >= target. Set reference = target in case it overruns and change to next state
                Vout_Control.Compensator.Reference_Internal = Vout_Control.Compensator.Reference_Set;
                returnvalue = PCS_UP_AND_RUNNING;
            }
        }
        else
        {
            // target reference is less than reference, so decrease reference until its >= target reference
            if ((Vout_Control.Compensator.Reference_Internal - SOFT_START_STEP) > Vout_Control.Compensator.Reference_Set)
            {
                Vout_Control.Compensator.Reference_Internal -= SOFT_START_STEP;
                returnvalue = pwr_ctrl_state;
            }
            else
            {
                // reference is <= target. Set reference = target in case it overruns and change to next state
                Vout_Control.Compensator.Reference_Internal = Vout_Control.Compensator.Reference_Set;
                returnvalue = PCS_UP_AND_RUNNING;
            }
        }

        SoftstartCounter = 0;
    }
    else
    {
        returnvalue = pwr_ctrl_state;
    }

    return returnvalue;
}
