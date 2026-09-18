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


#ifndef _DRV_PWRCTRL_APP_TPBLPFC_H
#define	_DRV_PWRCTRL_APP_TPBLPFC_H

#include <xc.h>
#include "misc/useful_macros.h"

/**
 * @def Gxx
 * @brief Curren Loop Gain value.
 *
 * adaptive Gain based on volatge loop output
 * which reflects the load
 *
 * @ingroup pfc_control_loop_params
 */
#define Load1H 6800
#define Load2L 6500
#define Load2H 14500
#define Load3L 14000
#define Load3H 21000
#define Load4L 20000
#define Load4H 28000
#define Load5L 27000

#define G1 ((uint16_t) (0.15 * 32767))
#define G2 ((uint16_t) (0.1 * 32767))
#define G3 ((uint16_t) (0.05 * 32767))
#define G4 ((uint16_t) (0.03 * 32767))
#define G5 ((uint16_t) (0.02 * 32767))


/**
 * @def PGxPER
 * @brief PWM period register value.
 *
 * This macro calculates the period register value for all PWM modules
 * based on the switching frequency (`FREQ_SW_HZ`) when PWM are 
 * high resolution, center-aligned mode.
 *
 * @ingroup pfc_hardware_params
 */
#define PGxPER         (PWM_HR_CENTER_ALIGNED_PGxPER(FREQ_SW_HZ))

/**
 * @def DUTYCYCLE_MIN
 * @brief Minimum duty cycle value for PWM.
 *
 * This macro calculates the minimum duty cycle value for the PWM module
 * based on the PWM period (`PGxPER`) and the minimum duty cycle percentage
 * (`DUTYCYCLE_MIN_PERCENT`), when PWMs are in high-resolution mode
 *
 * @ingroup pfc_hardware_params
 */
#define DUTYCYCLE_MIN    (PWM_HR_PGxDC(PGxPER, DUTYCYCLE_MIN_PERCENT))

/**
 * @def DUTYCYCLE_MAX
 * @brief Maximum duty cycle value for PWM.
 *
 * This macro calculates the maximum duty cycle value for the PWM module
 * based on the PWM period (`PGxPER`) and the minimum duty cycle percentage
 * when PWMs are in high resolution mode
 * (`DUTYCYCLE_MIN_PERCENT`). It represents 100% minus the minimum percentage.
 * It needs to be calculated this way due to the symmetry of the PWM switching
 * scheme (it is bipolar, so max duty when AC voltage = positive is min duty when
 * AC voltage is negative
 *
 * @ingroup pfc_hardware_params
 */
#define DUTYCYCLE_MAX    (PWM_HR_PGxDC(PGxPER, (100.0-DUTYCYCLE_MIN_PERCENT)))


/**
 * @def DUTYCYCLE_50PERCENT
 * @brief 50% duty cycle value for PWM period register.
 *
 * This macro calculates the value to be loaded into the PGxDC register
 * to acheieve a duty cycle of 50%, based on the PWM period register (`PGxPER`).
 *
 * @ingroup pfc_hardware_params
 */
#define DUTYCYCLE_50PERCENT     (PWM_HR_PGxDC(PGxPER, 50))


/**
 * @brief Handles PWM for phases 1, 2, and 3.
 *
 * This function is responsible for
 * handling Pulse Width Modulation (PWM) control for phases 1, 2, and 3.
 *
 * @param void This function does not take any parameters.
 *
 * @return void This function does not return any value.
 */

void PWM_handler_PH123(void);

/**
 * @brief Initializes the lead current compensator FIFO.
 *
 * This function initializes the First-In, First-Out (FIFO) buffers used for
 * the lead current compensator.
 *
 * @param void This function does not take any parameters.
 *
 * @return void This function does not return any value.
 */
void lead_current_comp_fifo_init(void);

#endif	/* _DRV_PWRCTRL_APP_TPBLPFC_H */

