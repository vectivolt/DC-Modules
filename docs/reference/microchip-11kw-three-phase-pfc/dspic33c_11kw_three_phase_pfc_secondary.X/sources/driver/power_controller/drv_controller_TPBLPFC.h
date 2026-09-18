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


#ifndef DRV_CONTROLLER_PWRCTRL_TPBLPFC_H
#define	DRV_CONTROLLER_PWRCTRL_TPBLPFC_H

#include <xc.h> 
#include "smps_control.h"   
#include "icomp3lv/dcdt_generated_code/icomp3lv_dcdt.h"
#include "icomp3hv/dcdt_generated_code/icomp3hv_dcdt.h"
#include "vcomp3ph/dcdt_generated_code/vcomp3ph_dcdt.h"
#include "neutral/dcdt_generated_code/neutral_dcdt.h"

/**
 * @brief External declaration for VMC 2P2Z controller.
 *
 * External declaration of a 2-pole 2-zero (2P2Z) controller  for voltage mode controller.
 */
extern SMPS_2P2Z_T VMC_2p2z;

/**
 * @brief External declaration for NEUTRAL 2P2Z controller.
 *
 * External declaration of a 2-pole 2-zero (2P2Z) controller for neutral midpoint control.
 */
extern SMPS_2P2Z_T NEUTRAL_2p2z;

/**
  * @brief External declaration for average curent mode 2P2Z controller
  *
  * External declaration of a 2-pole 2-zero (2P2Z) controller for average current mode control
  * note that there is 1 per phase
  */
extern SMPS_2P2Z_T PHx_AVG_CM2p2z[4];

//======================================================================================================================
// @brief function prototypes
//======================================================================================================================

/**
 * @brief Initializes the current controller for PFC.
 *
 * This function initializes the parameters of the current controller used in the PFC.
 *
 * @param void No parameters are passed to this function.
 *
 * @return void This function does not return a value.
 */
void CurrentController_PwrCtrl_TPBLPFC_Init(void);

/**
 * @brief Initializes the voltage controller for PFC.
 *
 * This function initializes the parameters and states of the voltage controller used in the PFC.
 *
 * @param void No parameters are passed to this function.
 *
 * @return void This function does not return a value.
 */
void VoltageController_PwrCtrl_TPBLPFC_Init(void);

/**
 * @brief Initializes the output voltage midpoint balance controller for PFC.
 *
 * @param void No parameters are passed to this function.
 *
 * @return void This function does not return a value.
 */
void VbusMidpointController_PwrCtrl_TPBLPFC_Init(void);


#endif	/* DRV_CONTROLLER_PWRCTRL_TPBLPFC_H */

