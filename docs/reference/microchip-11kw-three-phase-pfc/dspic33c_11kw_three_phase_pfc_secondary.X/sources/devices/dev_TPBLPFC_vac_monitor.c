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

#include "dev_TPBLPFC_vac_monitor.h"

#include "dev_TPBLPFC_typedef.h"

#include <stdlib.h>

/**
 * @brief Connects raw AC voltage monitor data to phase voltage and control status values.
 *
 * This function reads raw data from the `vac_monitor` structure and assigns specific
 * data points to the raw, rectified, and averaged voltage values for each of the three phases
 * (PH1, PH2, PH3). It also extracts and assigns the AC control status flags for each phase.
 *
 * @param void This function takes no parameters.
 *
 * @return void This function does not return any value.
 *
 * @note This function assumes that the `vac_monitor` structure is populated with the
 * correct and up-to-date data from the AC voltage monitor via a mailbox, data sent from AC
 * monitor running on the primary core
 * 
 * The data is interpreted according to a specific mapping:
 * - Indices 0-2: Raw AC voltage of PH1-PH3.
 * - Indices 3-5: voltage feed-forward terms of PH1-PH3.
 * - Bits within index 6: Control status flags for each phase.
 */
void dev_vac_monitor(void)
{
    Phase_Values_PH1.Phase_Voltage.Raw = vac_monitor.Data[0];
    Phase_Values_PH1.Phase_Voltage.Rectified = (uint16_t) (abs(Phase_Values_PH1.Phase_Voltage.Raw));
    Phase_Values_PH1.Phase_Voltage.Vin_div_Averaged2 = (int16_t) vac_monitor.Data[3];

    Phase_Values_PH2.Phase_Voltage.Raw = vac_monitor.Data[1];
    Phase_Values_PH2.Phase_Voltage.Rectified = (uint16_t) (abs(Phase_Values_PH2.Phase_Voltage.Raw));
    Phase_Values_PH2.Phase_Voltage.Vin_div_Averaged2 = (int16_t) vac_monitor.Data[4];

    Phase_Values_PH3.Phase_Voltage.Raw = vac_monitor.Data[2];
    Phase_Values_PH3.Phase_Voltage.Rectified = (uint16_t) (abs(Phase_Values_PH3.Phase_Voltage.Raw));
    Phase_Values_PH3.Phase_Voltage.Vin_div_Averaged2 = (int16_t) vac_monitor.Data[5];

    Phase_Values_PH1.vac_status_flags.value = (vac_monitor.Data[6] & 0x001F);
    Phase_Values_PH2.vac_status_flags.value = ((vac_monitor.Data[6] >> 5) & 0x001F);
    Phase_Values_PH3.vac_status_flags.value = ((vac_monitor.Data[6] >> 10) & 0x001F);
}

//------------------------------------------------------------------------------
//------------------------------------------------------------------------------

/**
 End of File
 */

