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

#ifndef _DRV_PWRCTRL_APP_MISC_TPBLPFC_H_
#define	_DRV_PWRCTRL_APP_MISC_TPBLPFC_H_

#include <xc.h> // include processor files - each processor file is guarded.  

#include "devices/dev_TPBLPFC_typedef.h"

/**
 * @brief Ramp the voltage loop reference value for soft-start.
 *
 * @param void This function does not take any parameters.
 *
 * @return PWR_CTRL_STATE_e Returns the power control state during soft-start.
 */
PWR_CTRL_STATE_e Softstart_reference(void);

/**
 * @brief Initializes the driver for Power Control .
 *
 * @param void This function does not take any parameters.
 *
 * @return void This function does not return a value.
 */
void Drv_PwrCtrl_TPBLPFC_Init(void);

/**
 * @brief Stops power switching
 *
 *
 * @param void This function does not take any parameters.
 *
 * @return void This function does not return a value.
 */
void Drv_PwrCtrl_TPBLPFC_Stop(void);

#endif	

