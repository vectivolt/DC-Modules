/*
© [2025] Microchip Technology Inc. and its subsidiaries.

    Subject to your compliance with these terms, you may use Microchip 
    software and any derivatives exclusively with Microchip products. 
    You are responsible for complying with 3rd party license terms  
    applicable to your use of 3rd party software (including open source  
    software) that may accompany Microchip software. SOFTWARE IS ?AS IS.? 
    NO WARRANTIES, WHETHER EXPRESS, IMPLIED OR STATUTORY, APPLY TO THIS 
    SOFTWARE, INCLUDING ANY IMPLIED WARRANTIES OF NON-INFRINGEMENT,  
    MERCHANTABILITY, OR FITNESS FOR A PARTICULAR PURPOSE. IN NO EVENT 
    WILL MICROCHIP BE LIABLE FOR ANY INDIRECT, SPECIAL, PUNITIVE, 
    INCIDENTAL OR CONSEQUENTIAL LOSS, DAMAGE, COST OR EXPENSE OF ANY 
    KIND WHATSOEVER RELATED TO THE SOFTWARE, HOWEVER CAUSED, EVEN IF 
    MICROCHIP HAS BEEN ADVISED OF THE POSSIBILITY OR THE DAMAGES ARE 
    FORESEEABLE. TO THE FULLEST EXTENT ALLOWED BY LAW, MICROCHIP?S 
    TOTAL LIABILITY ON ALL CLAIMS RELATED TO THE SOFTWARE WILL NOT 
    EXCEED AMOUNT OF FEES, IF ANY, YOU PAID DIRECTLY TO MICROCHIP FOR 
    THIS SOFTWARE.
 */

#define FCY 100000000UL
#include <libpic30.h>

#include "mcc_generated_files/system/system.h"
#include "mcc_generated_files/system/pins.h"
#include "mcc_generated_files/timer/tmr1.h"
#include "sources/devices/dev_TPBLPFC_typedef.h"
#include "sources/driver/power_controller/drv_pwrctrl_app_misc_TPBLPFC.h"
#include "main.h"
#include "misc/MCC_add_on.h"
#include "pwm_hs/pwm.h"
#include "mcc_generated_files/pwm_hs/pwm.h"

#include "sources/x2cScope/X2CScope.h"

#include "PFC_frameworkSetup.h"
#include "misc/useful_macros.h"

/**
 * @brief Configures PWM for non-melody operation.
 *
 * This function covers additional configuration of the PWM generators
 * for settings that are not covered by MCC melody
 * It sets the override synchronization
 * mode, ADC trigger post-scaling, ADC trigger point, and
 * enables phase swapping.
 *
 * @param void This function does not take any parameters.
 *
 * @return void This function does not return any value.
 */
void PWM_non_melody_config(void);

/**
 * @brief Main function for the PFC application.
 *
 * This is the entry point of the program for the Power Factor Correction (PFC)
 * application. It initializes the system, configures the PWM, initializes peripherals,
 * starts the timer used to invoke the 100us scheduler, and enters the main loop.
 *
 */

int main(void)
{         
    // Initialize the peripherals
    SYSTEM_Initialize();

    // Additional PWM settings not covered by Melody
    PWM_non_melody_config();

#if ADC_ISR_TO_FSW_RATIO == 2
    // Initialize X2CScope if ADC ISR is running at 2x switching frequency.
    X2CScope_Init();
#endif

    // Initialize power control.
    Init_pwr_ctrl();

    // Initialize the driver for the Totem Pole Bridgeless PFC.
    Drv_PwrCtrl_TPBLPFC_Init();

    // Start Timer 1 for 100us scheduler.
    TMR1_Start();

    // Set AC_PFC_3_PH flag to indicate 3-phase AC PFC operation.
    PFC_Flags.bits.AC_PFC_3_PH = 1;

    // Main loop.
    while (1)
    {
        // Check if Timer 1 interrupt flag is set (100us scheduler).
        if (IFS0bits.T1IF)
        {
            // Execute 100us tasks.
            Tasks_100us();

            // Clear Timer 1 interrupt flag.
            IFS0bits.T1IF = 0;
        }
#if ADC_ISR_TO_FSW_RATIO == 2
        // Only run X2CScope communication if ISR is running at 2x lower than switching frequency (20us).
        // Running ISR at 10us with X2CScope is not feasible due to time constraints.
        X2CScope_Communicate();
#endif
    }
}


/**
 * @brief Configures PWM settings that are not covered by Melody MCC GUI
 *
 * Covers configuration that is not in the scope of MCC Melody as per the code release.
 * Sets override sync mode, ADC trigger post-scaling, ADC trigger point,
 * and enables phase swapping.
 */
void PWM_non_melody_config(void)
{
    PWM_set_override_sync_mode(PWM_GENERATOR_1, OSYNC_SYNC_TO_SOC);
    PWM_set_override_sync_mode(PWM_GENERATOR_2, OSYNC_SYNC_TO_SOC);
    PWM_set_override_sync_mode(PWM_GENERATOR_3, OSYNC_SYNC_TO_SOC);

#if ADC_ISR_TO_FSW_RATIO == 2
    // setup ADC trigger to occur on every 2nd PWM cycle
    // this means an ISR execution frequency of 50kHz
    // when ADC_ISR_TO_FSW_RATIO == 1, then the control is run on a PWM cycle by cycle basis
    // (so every 10us)
    PWM_AdcTrig1_PostScale(PWM_GENERATOR_1, 2);
    PWM_AdcTrig1_PostScale(PWM_GENERATOR_2, 2);
    PWM_AdcTrig1_PostScale(PWM_GENERATOR_3, 2);
#endif

    // set location of the ADC trigger in relation to the PWM cycle
    // this value will be loaded into PWM TRIGA register to set the offset of the 
    // ADC trigger relative to the start of the PWM cycle
    // we want it at 50% as we are always running in CCM, and in CCM, the average current
    // is at the midpoint of the PWM on-time
    // in center aligned mode, the formula is as described in the macro PWM_HR_CENTER_ALIGNED_PGxTRIG
    // (see useful_macros.h). Briefly, the relationship between the offset of the ADC trigger as a percentage 
    // of switching period, and the value to be loaded into the PGxPER register, is as follows 
    // TRIGy[14:0] = (2 * PGxPER * (percent % 50) / 100), where percent is a value between 0 and 100, and 
    // "%" means the modulus (so 60 % 50 = 10 for example)
    // TRIGy[15] = 0 if percent <= 50, otherwise TRIGy[15] = 1
    // setting TRIGA = MPER means that the trigger will be placed right at the 50% mark
    PWM_TriggerCompareValueSet(PWM_GENERATOR_1, MPER);

    // set SWAP flags for all three phases
    PWM_SwapEnable(PWM_GENERATOR_1);
    PWM_SwapEnable(PWM_GENERATOR_2);
    PWM_SwapEnable(PWM_GENERATOR_3);
}