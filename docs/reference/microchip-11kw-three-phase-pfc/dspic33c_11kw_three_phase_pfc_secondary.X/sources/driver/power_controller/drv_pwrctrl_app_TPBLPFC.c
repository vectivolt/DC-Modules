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

#include "system/pins.h"
#include "cmp/cmp1.h"
#include "adc/adc_types.h"

#include "drv_controller_TPBLPFC.h"
#include "devices/dev_TPBLPFC_typedef.h"

#include "PFC_frameworkSetup.h"

#include "misc/MCC_add_on.h"
#include "pwm_hs/pwm.h"
#include "drv_pwrctrl_app_TPBLPFC.h"

// local function prototypes
static void VOUTaverging(void);
static void Handler_PHx(struct PHASE_VALUES_s* PhaseX, uint16_t PWMnr);
static void lead_current_comp_fifo_update(LEAD_CURRENT_COMP_FIFO_t* fifo);
static void lead_current_comp(struct PHASE_VALUES_s* PhaseX, uint16_t PWMnr);
static void Adaptive_Currentcontroller_Gain(void);

// FIFO structure used to stored delayed current loop reference information
LEAD_CURRENT_COMP_FIFO_t lead_current_comp_fifo;

/**
 * @fn             PWM_handler_PH123
 * @brief          Handles PWM updates for all three phases.
 *
 * @details        This function performs the following actions for each phase (1, 2, and 3):
 * - Calls the VOUTaveraging() function.
 * - Updates the voltage loop feed-forward FIFOs, these are used for lead current compensation
 * - Calls Handler_PHx() for each phase to update the PWMs
 *
 * @param          none
 * @return         none
 */
void PWM_handler_PH123(void)
{

    // note that if you like to signals on the DAC, uncomment following line 
    // DAC1DATH = (Phase_Values_PH1.Phase_Voltage.Rectified);           
  DAC1DATH = Vout_Control.Vout.FilterCounter << 3;
    VOUTaverging();

    // update FIFOs for Vac feed-forward    
    lead_current_comp_fifo_update(&lead_current_comp_fifo);

    //<<<<<<<<<<<  PHASE #1  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
    Handler_PHx(&Phase_Values_PH1, 1);

#ifndef SINGLE_PHASE_TEST
    //<<<<<<<<<<<  PHASE #2  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
    Handler_PHx(&Phase_Values_PH2, 2);

    //<<<<<<<<<<<  PHASE #3  <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
    Handler_PHx(&Phase_Values_PH3, 3);
#endif
}

/**
 * @fn             Handler_PHx
 * @brief          Handles PWM updates for a single phase.
 *
 * @details        This function performs the following actions for a given phase:
 * - Checks for AC voltage polarity change.
 * - Updates the VAC polarity status.
 * - Enables PWMs for the phase if conditions are met.
 * - Runs the voltage loop compensator (if enabled).
 * - Runs the Vbus midpoint compensator (if enabled).
 * - Runs the current loop compensator.
 * - Updates the PWM duty cycle.
 * - Calls the lead current compensation function.
 *
 * @param[in]    PhaseX    Pointer to the phase's data structure (Phase_Values_PH1, Phase_Values_PH2, or Phase_Values_PH3).
 * @param[in]    PWMnr     The PWM module number associated with the phase (1, 2, or 3).
 *
 * @return         none
 */
static void __inline__ Handler_PHx(struct PHASE_VALUES_s* PhaseX, uint16_t PWMnr)
{
    // check for AC voltage polarity change, this is required for output voltage averaging and for lead current compensation
    if (PhaseX->vac_status_flags.bits.VAC_Polarity != PhaseX->Control_Status_Flags.bits.VAC_Polarity_last)
    {
        PhaseX->Control_Status_Flags.bits.VAC_Polarity_Changed = 1;
    }
    else
    {
        PhaseX->Control_Status_Flags.bits.VAC_Polarity_Changed = 0;
    }
    PhaseX->Control_Status_Flags.bits.VAC_Polarity_last = PhaseX->vac_status_flags.bits.VAC_Polarity;

    if (PhaseX->vac_status_flags.bits.VAC_OK)
    {
        // check if the PWMs for this phase should be enabled
        // do this around a zero crossing where the input current is low
        // this is done by doing just after "polarity changed" flag is set
        // meaning that the AC voltage has just changed polarity
        if (PhaseX->Control_Status_Flags.bits.pwmStart)
        {
            // the "pwmStart" semaphore is set in the power controller state machine
            // during the startup sequence
            if (PhaseX->Control_Status_Flags.bits.VAC_Polarity_Changed)
            {
                // wait for a polarity change on this phase to enable the PWMs for this phase
                // this is required for clean startup
                PWM_OverrideLowDisable(PWMnr);
                PWM_OverrideHighDisable(PWMnr);

                PhaseX->current_compensator.Control_Freeze = 0; // unfreeze current loop compensator
                PhaseX->Control_Status_Flags.bits.pwmStart = 0; // PWMs are started, clear semaphore

            }
        }

        // voltage loop compensator
#ifdef VOLTAGE_LOOP
        if ((Vout_Control.Vout.FilterCounter == 1) && (PWMnr == 1))
        {
            // average Vout has just been computed (last pass), as Vout_Control.Vout.FilterCounter is set to 0
            // when the average is calculated
            // so now run the voltage loop as we have a fresh value
            SMPS_Controller2P2ZUpdate( &VMC_2p2z,
                                       &Vout_Control.Vout.Filtered,                    // feedback
                                       Vout_Control.Compensator.Reference_Internal,    // reference
                                       &Vout_Control.Compensator.output);
        }
#endif  // #ifdef VOLTAGE_LOOP

#ifdef ACTIVE_MIDPOINT_BALANCING_ENABLED
        // Vbus midpoint compensator
        // run it the next pass after the voltage loop
        if ((Vout_Control.Vout.FilterCounter == 2) && (PWMnr == 1))
        {
            SMPS_Controller2P2ZUpdate( &NEUTRAL_2p2z,
                                       &Vout_Control.Vout.Filtered,             // feedback
                                       Vout_Control.Vout_MidPoint.Filtered,     // reference                   
                                       &midpoint_comp_output);
        }         // feedback
#endif // #ifdef ACTIVE_MIDPOINT_BALANCING_ENABLED

        // current loop compensator
        // multiple AC read of input current by 16 to get more resolution from
        // the compensator calculations
        PhaseX->current_compensator.feedback = (PhaseX->Phase_Current.AC << 4);

        int32_t IAC_Reference_l;

#ifdef VOLTAGE_LOOP
        IAC_Reference_l = (__builtin_mulss(Vout_Control.Compensator.output, PhaseX->Phase_Voltage.Vin_div_Averaged2_Delayed));
#else
        IAC_Reference_l = (__builtin_mulss((Vout_Control.Compensator.Reference_Internal << 3), PhaseX->Phase_Voltage.Vin_div_Averaged2));
#endif
        PhaseX->current_compensator.reference = (IAC_Reference_l >> 14);

#ifdef ACTIVE_MIDPOINT_BALANCING_ENABLED
        // add the output of the mid-point compensator to the current loop compensator reference
        PhaseX->current_compensator.reference += midpoint_comp_output;
#endif // #ifdef ACTIVE_MIDPOINT_BALANCING_ENABLED

        if (!PhaseX->current_compensator.Control_Freeze)
        {

            if ((Vout_Control.Vout.FilterCounter == 3) && (PWMnr == 1))
            {
                Adaptive_Currentcontroller_Gain();
            }
            PHx_AVG_CM2p2z[PWMnr].KfactorCoeffsB = current_compensator_gain;

            // run the current loop compensator
            // note that this is slightly modified assembly to allow for adaptive gain
            // adaptive gain is set via the Q15 value of current_compensator_gain
            XFT_SMPS_Controller2P2ZUpdate( &PHx_AVG_CM2p2z[PWMnr],
                                           &PhaseX->current_compensator.feedback,
                                           PhaseX->current_compensator.reference,
                                           &(PhaseX->current_compensator.output));
        }

        // add offset equivalent to 50% duty cycle, compensator output should be AC value but needs to be offset
        // so it can be converted to an integer equivalent to a duty cycle that can be loaded into the
        // PGxDC register
        PhaseX->current_compensator.Duty_Cycle_PGxDC = (uint16_t) (PhaseX->current_compensator.output + DUTYCYCLE_50PERCENT);

        if (PhaseX->current_compensator.Duty_Cycle_PGxDC < DUTYCYCLE_MIN)
        {
            PhaseX->current_compensator.Duty_Cycle_PGxDC = DUTYCYCLE_MIN;
        }
        if (PhaseX->current_compensator.Duty_Cycle_PGxDC > DUTYCYCLE_MAX)
        {
            PhaseX->current_compensator.Duty_Cycle_PGxDC = DUTYCYCLE_MAX;
        }

        // update the actual duty cycle by setting the PGxDC registers based on the compensator output
        PWM_DutyCycleSet(PWMnr, PhaseX->current_compensator.Duty_Cycle_PGxDC);

    }

    lead_current_comp(PhaseX, PWMnr);   
}



/**
 * @fn             VOUTaveraging
 * @brief          Computes averaged values for output voltage 
 *                 Computes averaged values for output voltage midpoint
 *                 Averages ADC readings of current sensor outputs at startup
 *                 for current sensor offset calibration
 *
 * @details        This function calculates the average of the output voltage
 * (Vout), the output voltage midpoint, and the offset of the 3 phase currents, 
 * by accumulating samples over a period, averaging them, and then resetting the
 * accumulation (accumulate and dump). It also includes logic related to zero-crossing
 * detection for AC voltage input.
 *
 * The function performs the following actions:
 *
 * 1.  **Increment Filter Counters:**
 * -   Increments counters for Vout, midpoint voltage (Vout_MidPoint),
 * and phase currents (Phase_Current) for each phase. These counters
 * track the number of raw samples accumulated for averaging.
 *
 * 2.  **Accumulate Raw Voltage Samples:**
 * -   Adds the raw Vout and Vout_MidPoint values to their respective
 * summation variables (`VoutAVGsum` and `VoutMidpointAVGsum`).
 *
 * 3.  **Zero-Crossing Detection (Voltage):**
 * -   Conditionally increments `vac_pol_changed_counter` and
 * `PHxvac_pol_changed_counter` (for each phase) when the
 * `VAC_Polarity_Changed` flag is set in the phase's control status.
 * This logic is used to detect AC voltage zero crossings.
 *
 * 4.  **Compute Averaged Voltages:**
 * -   Calculates the filtered Vout and Vout_MidPoint values when
 * either of the following conditions is met:
 * -   A zero crossing has been detected
 * (`vac_pol_changed_counter > 0` and
 * `Vout_Control.Vout.FilterCounter > 1`).
 * -   A large number of samples (8000) have been accumulated,
 * even without a zero crossing (to handle DC input).
 * -   The filtered voltage is calculated by dividing the accumulated
 * sum by the number of samples (minus 1). The summation variable
 * and counters are reset after the averaging.
 *
 * 5.  **Compute Phase Current Offsets (During Initialization):**
 * -   If the power control state is `PCS_INIT` (indicating
 * initialization), the function calculates the average offset
 * for each phase current.
 * -   The raw phase current values are accumulated in
 * `PHxAVGCurrentOffset`.
 * -   The average offset is calculated when either of the following
 * is true:
 * -   More than one zero crossing has been detected for the
 * phase's current and the current filter counter is greater
 * than 1.
 * -   A large number of samples (4000) have been accumulated.
 * -   The offset is calculated by dividing the accumulated sum
 * by the number of samples (minus 1). The summation variable
 * and counters are reset after the averaging.
 *
 * @note The function uses the `__builtin_divud` intrinsic for unsigned
 * integer division, which is optimized for the target
 * architecture. The magic numbers (8000 and 4000) 
 * represent a large enough sample window when the input voltage is DC. 
 * The function does not calculate a moving average,
 * but instead accumulates samples, calculates the average,
 * and resets the accumulation (this is also know as "accumulate and dump")
 */

static void __inline__ VOUTaverging(void)
{
    static uint32_t VoutAVGsum, VoutMidpointAVGsum;
    static uint32_t PH1AVGCurrentOffset, PH2AVGCurrentOffset, PH3AVGCurrentOffset;
    static uint16_t vac_pol_changed_counter;
    static uint16_t PH1vac_pol_changed_counter, PH2vac_pol_changed_counter, PH3vac_pol_changed_counter;

    Vout_Control.Vout.FilterCounter++;
    Vout_Control.Vout_MidPoint.FilterCounter++;
    Phase_Values_PH1.Phase_Current.FilterCounter++;
    Phase_Values_PH2.Phase_Current.FilterCounter++;
    Phase_Values_PH3.Phase_Current.FilterCounter++;

    VoutAVGsum += Vout_Control.Vout.Raw;
    VoutMidpointAVGsum += Vout_Control.Vout_MidPoint.Raw;

    //<<< only testing >>>
    if (Phase_Values_PH1.Control_Status_Flags.bits.VAC_Polarity_Changed)
    {
        vac_pol_changed_counter++;
        PH1vac_pol_changed_counter++;
    }
    if (Phase_Values_PH2.Control_Status_Flags.bits.VAC_Polarity_Changed)
    {
        vac_pol_changed_counter++;
        PH2vac_pol_changed_counter++;
    }
    if (Phase_Values_PH3.Control_Status_Flags.bits.VAC_Polarity_Changed)
    {
        vac_pol_changed_counter++;
        PH3vac_pol_changed_counter++;
    }

    // compute the average value of Vbus at every zero crossing (so at 50Hz, this is at every 3.33ms for 3 phase)
    // also allow for the fact that Vin might be DC
    // do the same for the midpoint voltage reading
    if (((vac_pol_changed_counter > 0) && (Vout_Control.Vout.FilterCounter > 1)) || (Vout_Control.Vout.FilterCounter > 8000))
    {
        Vout_Control.Vout.PreviousValue = Vout_Control.Vout.Filtered; //<< check slope of Vout change
        Vout_Control.Vout.Filtered = (uint16_t) (__builtin_divud(VoutAVGsum, Vout_Control.Vout.FilterCounter - 1));
        VoutAVGsum = 0;
        vac_pol_changed_counter = 0;
        Vout_Control.Vout.FilterCounter = 0;

        Vout_Control.Vout_MidPoint.Filtered = (uint16_t) (__builtin_divud(VoutMidpointAVGsum, Vout_Control.Vout_MidPoint.FilterCounter - 1));
        VoutMidpointAVGsum = 0;
        Vout_Control.Vout_MidPoint.FilterCounter = 0;
    }

    // after power up during initialization the current sensor calibration is done
    if (pwr_ctrl_state == PCS_INIT)
    {
        PH1AVGCurrentOffset += Phase_Values_PH1.Phase_Current.Raw;
        PH2AVGCurrentOffset += Phase_Values_PH2.Phase_Current.Raw;
        PH3AVGCurrentOffset += Phase_Values_PH3.Phase_Current.Raw;

        // average current readings over 1 full AC line period
        // also allow for the fact that input might be DC
        if (((PH1vac_pol_changed_counter > 1) && (Phase_Values_PH1.Phase_Current.FilterCounter > 1)) || (Phase_Values_PH1.Phase_Current.FilterCounter > 4000))
        {
            Phase_Values_PH1.Phase_Current.Offset = (uint16_t) (__builtin_divud(PH1AVGCurrentOffset, Phase_Values_PH1.Phase_Current.FilterCounter - 1));
            PH1AVGCurrentOffset = 0;
            PH1vac_pol_changed_counter = 0;
            Phase_Values_PH1.Phase_Current.FilterCounter = 0;
        }
        if (((PH2vac_pol_changed_counter > 1) && (Phase_Values_PH2.Phase_Current.FilterCounter > 1)) || (Phase_Values_PH2.Phase_Current.FilterCounter > 4000))
        {
            Phase_Values_PH2.Phase_Current.Offset = (uint16_t) (__builtin_divud(PH2AVGCurrentOffset, Phase_Values_PH2.Phase_Current.FilterCounter - 1));
            PH2AVGCurrentOffset = 0;
            PH2vac_pol_changed_counter = 0;
            Phase_Values_PH2.Phase_Current.FilterCounter = 0;
        }
        if (((PH3vac_pol_changed_counter > 1) && (Phase_Values_PH3.Phase_Current.FilterCounter > 1)) || (Phase_Values_PH3.Phase_Current.FilterCounter > 4000))
        {
            Phase_Values_PH3.Phase_Current.Offset = (uint16_t) (__builtin_divud(PH3AVGCurrentOffset, Phase_Values_PH3.Phase_Current.FilterCounter - 1));
            PH3AVGCurrentOffset = 0;
            PH3vac_pol_changed_counter = 0;
            Phase_Values_PH3.Phase_Current.FilterCounter = 0;
        }
    }
}

/**
 * @fn             void lead_current_comp_fifo_init(void)
 * @brief          Initializes the lead current compensation FIFO.
 *
 * @details        This function initializes the FIFO structure used for lead current compensation.
 * It sets the head pointer to 0, initializes the read offsets for each phase to 0,
 * and assigns the source and destination pointers for the phase voltage data
 * for each phase (PH1, PH2, PH3).  The source pointers point to the
 * `Vin_div_Averaged2` member of the `Phase_Voltage` structure within the
 * `Phase_Values_PHx` structure, and the destination pointers point to the
 * `Vin_div_Averaged2_Delayed` member.
 *
 * @param          none
 * @return         none
 */
void lead_current_comp_fifo_init(void)
{
    lead_current_comp_fifo.head = 0;

    lead_current_comp_fifo.read_offset[0] = 0;
    lead_current_comp_fifo.read_offset[1] = 0;
    lead_current_comp_fifo.read_offset[2] = 0;

    lead_current_comp_fifo.ptr_source[0] = (int16_t*) & Phase_Values_PH1.Phase_Voltage.Vin_div_Averaged2;
    lead_current_comp_fifo.ptr_source[1] = (int16_t*) & Phase_Values_PH2.Phase_Voltage.Vin_div_Averaged2;
    lead_current_comp_fifo.ptr_source[2] = (int16_t*) & Phase_Values_PH3.Phase_Voltage.Vin_div_Averaged2;

    lead_current_comp_fifo.ptr_destination[0] = (int16_t*) & Phase_Values_PH1.Phase_Voltage.Vin_div_Averaged2_Delayed;
    lead_current_comp_fifo.ptr_destination[1] = (int16_t*) & Phase_Values_PH2.Phase_Voltage.Vin_div_Averaged2_Delayed;
    lead_current_comp_fifo.ptr_destination[2] = (int16_t*) & Phase_Values_PH3.Phase_Voltage.Vin_div_Averaged2_Delayed;
}

/**
 * @fn             lead_current_comp_fifo_update
 * @brief          Updates the lead current compensation FIFO.
 *
 * @details        This function updates the FIFO buffer used for lead current compensation.
 * It increments the head pointer, handles wrap-around, calculates the index
 * for retrieving delayed data, clamps the delay offset, updates the FIFO
 * with new data, and retrieves the delayed data.
 *
 * @param[in,out]  fifo  Pointer to the LEAD_CURRENT_COMP_FIFO_t structure.  The
 * function modifies the contents of this structure.
 * @return         none
 */
static void __inline__ lead_current_comp_fifo_update(LEAD_CURRENT_COMP_FIFO_t* fifo)
{
    // increment the new data pointer, and check for wrapping
    fifo->head++;
    if (fifo->head >= LEAD_CURRENT_COMP_FIFO_LENGTH)
    {
        fifo->head = 0;
    }

    // index of where to retrieve the delayed data from
    int16_t index_delayed_data[LEAD_CURRENT_COMP_FIFO_WIDTH];

    // clamp delay between 0 and LEAD_CURRENT_COMP_FIFO_LENGTH-1
    // note that the delay is the same for each of the FIFOs
    for (uint16_t i = 0; i < LEAD_CURRENT_COMP_FIFO_WIDTH; i++)
    {
        if (fifo->read_offset[i] > (LEAD_CURRENT_COMP_FIFO_LENGTH - 1))
        {
            fifo->read_offset[i] = (LEAD_CURRENT_COMP_FIFO_LENGTH - 1);
        }

        index_delayed_data[i] = fifo->head - fifo->read_offset[i];

        // check for wrap
        if (index_delayed_data[i] < 0)
        {
            index_delayed_data[i] = LEAD_CURRENT_COMP_FIFO_LENGTH + index_delayed_data[i];
        }

        // update FIFO with new data
        fifo->data[i][fifo->head] = *(fifo->ptr_source[i]);

        // retrieve delayed data
        *(fifo->ptr_destination[i]) = fifo->data[i][index_delayed_data[i]];
    }
}

/**
 * @fn             lead_current_comp
 * @brief          Adjusts the delay of the current compensator reference based on AC current lead/lag.
 *
 * @details        This function analyzes the phase relationship between AC current and AC voltage
 * at the zero-crossing point of the AC voltage.  It then adjusts the delay of the
 * current compensator reference to improve power factor.
 *
 * The function performs the following actions:
 * -   Checks for an AC voltage polarity change (negative to positive transition).
 * -   If a transition occurs, it checks the sign of the AC current:
 * -   If the current is significantly positive, it indicates that the AC current is
 * leading the AC voltage.  In this case, the function increases the delay
 * in the current loop reference by incrementing the corresponding
 * `lead_current_comp_fifo.read_offset`.
 * -   If the current is significantly negative, it indicates that the AC current is
 * lagging the AC voltage.  In this case, the function decreases the delay
 * in the current loop reference by decrementing the corresponding
 * `lead_current_comp_fifo.read_offset`.
 * -   If the current is close to zero (within a small hysteresis band), no adjustment
 * is made.
 * -   The function then clamps the `lead_current_comp_fifo.read_offset` value to ensure it
 * remains within the valid range of 0 to `LEAD_CURRENT_COMP_FIFO_LENGTH - 1`.
 *
 * @param[in,out]  PhaseX  Pointer to the PHASE_VALUES_s structure for the current phase.
 * This structure contains the AC current and voltage information.
 * @param[in]      PWMnr   The PWM module number associated with the current phase (1, 2, or 3).
 * This is used to index the correct `read_offset` in the `lead_current_comp_fifo`.
 *
 * @return         none
 */
static void __inline__ lead_current_comp(struct PHASE_VALUES_s* PhaseX, uint16_t PWMnr)
{
    // at Vac zero crossing (negative to positive transition), check current
    // if PF = 1, it should be zero
    // if current is leading voltage, then current will be > 0
    // in this case, add more delay to the current compensator reference by 
    // increasing the value of lead_current_comp_fifo.read_offset[i]. 
    // if current is lagging voltage, then current will be < 0
    // in this case, reduce the delay to the current compensator reference by
    // decreasing the value of lead_current_comp_fifo.read_offset[i]

    if (PhaseX->Control_Status_Flags.bits.VAC_Polarity_Changed)
    {
        // Vac polarity has changed
        if (PhaseX->vac_status_flags.bits.VAC_Polarity)
        {
            // negative to positive transition of AC voltage
            if (PhaseX->Phase_Current.AC > 4) // added some hysteresis!
            {
                // current is already positive thus
                // AC current leading AC voltage. Delay current loop reference by more
                lead_current_comp_fifo.read_offset[PWMnr - 1]++;
            }
            else if (PhaseX->Phase_Current.AC < -4) // added some hysteresis!
            {
                // current is negative while voltage is going positive
                // AC current lagging AC voltage. Delay current loop reference by less
                lead_current_comp_fifo.read_offset[PWMnr - 1]--;
            }
            else
            {
                // current is between hysteresis levels - do nothing
            }

            // clamp lead_current_comp_fifo.read_offset to between 0 and LEAD_CURRENT_COMP_FIFO_LENGTH-1
            if (lead_current_comp_fifo.read_offset[PWMnr - 1] <= 0)
            {
                lead_current_comp_fifo.read_offset[PWMnr - 1] = 0;
            }
            else if (lead_current_comp_fifo.read_offset[PWMnr - 1] >= (LEAD_CURRENT_COMP_FIFO_LENGTH - 1))
            {
                lead_current_comp_fifo.read_offset[PWMnr - 1] = (LEAD_CURRENT_COMP_FIFO_LENGTH - 1);
            }
        }
    }
}

#define M_HIGHLINE 0.15
#define GAINSLOPE_HIGHLINE  (uint16_t)(M_HIGHLINE * 32767)
#define GAINOFFSET_HIGHLINE (uint16_t)(0.16 * 32767)
#define MIN_GAIN_FACTOR (uint16_t)(0.02 * 32767)
#define MAX_GAIN_FACTOR (uint16_t)(0.15 * 32767)

static void __inline__ Adaptive_Currentcontroller_Gain(void)
{
  uint32_t mul01;
  uint16_t mul02;

  mul01 = ((uint32_t) Vout_Control.Compensator.output * GAINSLOPE_HIGHLINE);
  mul02 = (uint16_t) (mul01 >> 15);
  current_compensator_gain = GAINOFFSET_HIGHLINE - mul02;

  if (current_compensator_gain < MIN_GAIN_FACTOR)
    current_compensator_gain = MIN_GAIN_FACTOR;
}
