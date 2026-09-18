
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
#include "main_core/main_core.h"
#include "devices/dev_TPBLPFC_typedef.h"
#include "../../../revision.h"
#include "misc/useful_macros.h"
#include "misc/MCC_add_on.h"
#include "pwm_hs/pwm.h"
#include "PFC_frameworkSetup.h"
#include "system/pins.h"

/**
 * @def VBUS_MAX
 * @brief Maximum DC bus voltage.
 *
 * @details This macro defines the maximum allowable DC bus voltage.  It
 * is calculated using the `UNITS_FROM_ENG_TO_ADC` macro, which converts
 * the voltage value from engineering units (Volts) to ADC units.
 * The conversion uses the DC bus voltage sense gain.
 */
#define VBUS_MAX    ((UNITS_FROM_ENG_TO_ADC(VBUS_MAX_VOLTS,VBUS_SENSE_GAIN,0.0)))

//------------------------------------------------------------------------------

/**
 * @var pMSIAdata
 * @brief Array to store data received from the primary core via MSI.
 *
 * @details This array is used to buffer the data transmitted from the
 * primary core to the secondary core through the Mailbox A (MSIA)
 * interface.  The data is typically command and control information.
 */
uint16_t pMSIAdata[16];

/*******************************************************************************
 * @fn      ReceiveMSIAMessage
 * @brief   Receives and processes messages from the primary core.
 *
 * @details This function handles incoming messages from the primary core,
 * received via Mailbox A (MSIA). It parses the command ID and control
 * byte to determine the appropriate action.  The function supports
 * commands to start/stop the PFC stage and to change the output voltage
 * setpoint.
 *
 * The function performs the following actions:
 * 1.  Reads data from Mailbox A using `MAIN_CORE_ProtocolRead`.
 * 2.  Extracts the command ID and control byte from the received data.
 * 3.  If the command ID is 0x55, it controls the PFC start/stop:
 * -   If the control byte is 0x00, it stops the PFC (`PFC_Flags.bits.Run = 0`, `PFC_Flags.bits.Stop = 1`).
 * -   If the control byte is 0x01, it starts the PFC (`PFC_Flags.bits.Run = 1`, `PFC_Flags.bits.Stop = 0`).
 * 4.  If the command ID is 0xEF, it changes the output voltage setpoint:
 * -   It updates `Vout_Control.Compensator.Reference_Set` with the received value.
 * -   It ensures the new setpoint does not exceed `VBUS_MAX`.
 * 5.  If the command ID is 0xDC, it updates the current compensator gain.
 * 6.  Resets the command data in `pMSIAdata`.
 *
 * @note The function uses the `MAIN_CORE_ProtocolRead` function, the `PFC_Flags` and `Vout_Control` global variables, and the `VBUS_MAX` macro.
 */
void ReceiveMSIAMessage(void)
{
    if (MAIN_CORE_ProtocolRead(MSI1_ProtocolA, &pMSIAdata[0]))
    {
        uint8_t command_id = (uint8_t) ((pMSIAdata[0] & 0xFF00) >> 8);
        uint8_t control_byte = (uint8_t) (pMSIAdata[0] & 0x00FF);

        // turn PFC stage on or off
        if (command_id == 0x55) 
        {
            if (control_byte == 0x00) // stop PFC
            {
                if (PFC_Flags.bits.Run)
                {
                    PFC_Flags.bits.Run = 0;
                    PFC_Flags.bits.Stop = 1;
                }
            }
            else if (control_byte == 0x01) // start PFC
            {
                if (!PFC_Flags.bits.Run)
                {
                    PFC_Flags.bits.Run = 1;
                    PFC_Flags.bits.Stop = 0;
                }
            }
            pMSIAdata[0] = 0;
        }
        // change output voltage setpoint
        else if (command_id == 0xEF) 
        {
            Vout_Control.Compensator.Reference_Set = pMSIAdata[1];
            if (Vout_Control.Compensator.Reference_Set > VBUS_MAX)
            {
                Vout_Control.Compensator.Reference_Set = VBUS_MAX;
            }

            pMSIAdata[0] = 0;
            pMSIAdata[1] = 0;
        }
        // change current loop compensator gain
        else if (command_id == 0xDC)
        {
            current_compensator_gain = pMSIAdata[1];
        }    
    }
}

/*******************************************************************************
 * @fn      SendMSIFIFOMessage
 * @brief   Sends data to the primary core via a FIFO.
 *
 * @details This function transmits data from the secondary core to the
 * primary core using a First-In-First-Out (FIFO) buffer. The data is
 * then sent from the primary core to the Power Board Visualizer (PBV)
 * GUI via CAN. The data includes current compensation values, firmware
 * revision information, ADC readings, and system status.
 *
 * The function performs the following actions:
 * 1.  Increments a tick counter.
 * 2.  Every 50 ticks, it writes the following data to the SWMRFDATA register:
 * -   Leading current compensator offsets (3 words).
 * -   Firmware revision (major and minor versions).
 * -   Patch number and high voltage flag.
 * -   Unused words (2 words).
 * -   Voltage loop output.
 * -   PFC state machine state.
 * -   Status flags.
 * -   Midpoint and output voltage ADC readings (filtered).
 * -   Padding words to fill the 32-word FIFO.
 * 3.  Resets the tick counter.
 *
 * @note The function uses the `lead_current_comp_fifo`, `MAJOR`, `MINOR`, `PATCH`, `HIGHVOLTAGE`, 
 * `Vout_Control`, `pwr_ctrl_state`, and `PFC_Flags` global variables, and the `SWMRFDATA` register.
 */
void SendMSIFIFOMessage(void)
{
    static uint16_t TickCounter_ = 0;

    if (++TickCounter_ > 50)
    {
        SWMRFDATA = lead_current_comp_fifo.read_offset[0]; // word 0
        SWMRFDATA = lead_current_comp_fifo.read_offset[1]; // word 1
        SWMRFDATA = lead_current_comp_fifo.read_offset[2]; // word 2

        // word 3, major and minor firmware revision
        SWMRFDATA = (uint16_t) ((MAJOR << 8) + MINOR);

        // word 4, patch and high voltage flag
        SWMRFDATA = (uint16_t) ((PATCH << 8) + HIGHVOLTAGE);

        // word 5, not used
        SWMRFDATA = 0;

        // word 6, not used
        SWMRFDATA = 0;

        // word 7, voltage loop output
        SWMRFDATA = Vout_Control.Compensator.output;

        // word 8, PFC state machine state variable (de-coded for power board visualizer GUI)
        SWMRFDATA = (1 << ((uint16_t) pwr_ctrl_state - 1));

        // word 9, status flags
        SWMRFDATA = PFC_Flags.value;

        // word 10, midpoint ADC reading(filtered)
        SWMRFDATA = Vout_Control.Vout_MidPoint.Filtered;

        // word 11, output voltage ADC reading (filtered)
        SWMRFDATA = Vout_Control.Vout.Filtered;

        // FIFO is 32 words wide, all words needs to be filled up to initiate transmission to primary core
        for ( uint16_t i_ = 12; i_ < 32; i_++)
        {
            SWMRFDATA = i_;
        }

        TickCounter_ = 0;
    }
}

//------------------------------------------------------------------------------
//------------------------------------------------------------------------------

/**
 End of File
 */
