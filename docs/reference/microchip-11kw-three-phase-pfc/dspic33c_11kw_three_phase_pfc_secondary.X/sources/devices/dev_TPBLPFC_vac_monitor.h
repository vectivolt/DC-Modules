
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


#ifndef _DEV_TPBLPFC_VAC_MONITOR_H
#define	_DEV_TPBLPFC_VAC_MONITOR_H

#include <xc.h> 

/**
 * @brief Connects raw AC voltage monitor data to phase voltage and control status values.
 *
 * This function reads key data from the AC voltage monitor and assigns specific
 * data points to the raw, rectified, and averaged voltage values for each of the three phases
 * (PH1, PH2, PH3). It also extracts and assigns the AC control status flags for each phase.
 * note that the AC voltage monitor runs on the primary core. It sends key data to the 
 * secondary core via mailbox B. This key data is read from mailbox B into local secondary core
 * variables in this function
 *
 * @param void This function takes no parameters.
 *
 * @return void This function does not return any value.
 */
void dev_vac_monitor(void);

#endif	/* _DEV_TPBLPFC_VAC_MONITOR_H */

