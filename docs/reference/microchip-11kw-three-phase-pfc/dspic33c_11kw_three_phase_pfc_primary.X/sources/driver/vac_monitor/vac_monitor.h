/**
 * @file vac_monitor.h
 * @brief This file provides the API and configuration macros for the AC Voltage Monitor (VACM).
 *
 * @details This header file defines the public interface for the AC Voltage Monitor
 * module, including configuration macros for frequency, voltage thresholds (UV/OV),
 * and various timeouts related to zero-crossing and AC drop detection. It also
 * declares the main state machine function and reset functions for the VACM objects.
 *
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

// This is a guard condition so that contents of this file are not included
// more than once.
#ifndef VAC_MONITOR_H
#define	VAC_MONITOR_H

#include <xc.h> // include processor files - each processor file is guarded.
#include "vac_monitor_typedef.h"
#include "../../../revision.h"
#include "PFC_frameworkSetup.h"
#include "misc/useful_macros.h"

/**
 * @defgroup VACM_Public_Macros Public Configuration Macros for AC Voltage Monitor
 * @brief Macros for configuring the AC Voltage Monitor thresholds and timings.
 * @{
 */

/**
 * @def FCALL_AC_MONITOR
 * @brief Frequency at which the AC monitor code is executed (in Hertz).
 * @details To measure time (e.g., zero-cross timeout), the firmware needs to know
 * the frequency at which the AC monitor state machine(s) are called. This macro
 * sets that frequency.
 * @warning Usually, the AC monitor state machines are called from a periodic interrupt.
 * This frequency is typically set by the calling firmware, which is outside the scope
 * of this project. If the call frequency is changed in the calling firmware, it must
 * also be updated here to ensure correct timing.
 */
#if ADC_ISR_TO_FSW_RATIO == 1
#define FCALL_AC_MONITOR         (1.0/10.0e-6)
#else // only other value is 2
#define FCALL_AC_MONITOR         (1.0/20.0e-6)
#endif

/**
 * @def FREQ_VAC_MIN_HZ
 * @brief Minimum acceptable AC line frequency (in Hertz).
 * @details The AC OK flag is cleared if the measured AC line frequency drops below this value.
 */
#define FREQ_VAC_MIN_HZ                   (40.0)

/**
 * @def FREQ_VAC_MAX_HZ
 * @brief Maximum acceptable AC line frequency (in Hertz).
 * @details The AC OK flag is cleared if the measured AC line frequency exceeds this value.
 */
#define FREQ_VAC_MAX_HZ                   (65.0)

/**
 * @def VAC_UV_TRIG_VOLTS
 * @brief Input under-voltage (UV) trigger threshold (in Volts).
 * @details This threshold is based on the average of the rectified AC input voltage (not RMS),
 * computed once per half line cycle. The AC OK flag is cleared if Vin drops below this threshold.
 */
#if HIGH_VOLTAGE == 1
#define VAC_UV_TRIG_VOLTS               (60.0)
#else
#define VAC_UV_TRIG_VOLTS               (8.0)
#endif // #if HIGH_VOLTAGE == 1

/**
 * @def VAC_UV_HYS_VOLTS
 * @brief Input under-voltage (UV) hysteresis (in Volts).
 * @details The Vin UV fault is cleared if Vin goes back above (`VAC_UV_TRIG_VOLTS + VAC_UV_HYS_VOLTS`) Volts.
 * This value is based on the average of the rectified AC input voltage (not RMS).
 */
#define VAC_UV_HYS_VOLTS                (2.0)

/**
 * @def VAC_OV_TRIG_VOLTS
 * @brief Input over-voltage (OV) trigger threshold (in Volts).
 * @details This threshold is based on the average of the rectified AC input voltage (not RMS),
 * computed once per half line cycle. The AC OK flag is cleared if Vin goes above this threshold.
 */
#if HIGH_VOLTAGE == 1
#define VAC_OV_TRIG_VOLTS               (350.0)
#else
#define VAC_OV_TRIG_VOLTS               (80.0)
#endif // #if HIGH_VOLTAGE == '1'

/**
 * @def VAC_OV_HYS_VOLTS
 * @brief Input over-voltage (OV) hysteresis (in Volts).
 * @details The Vin OV fault is cleared if Vin goes back below (`VAC_OV_TRIG_VOLTS - VAC_OV_HYS_VOLTS`) Volts.
 * This value is based on the average of the rectified AC input voltage (not RMS).
 */
#define VAC_OV_HYS_VOLTS                (2.0)

/**
 * @def ZC_TIMEOUT_SECS
 * @brief Zero-crossing timeout (in seconds).
 * @details If the input voltage remains in the zero-crossing region for longer than this time,
 * the AC OK flag is cleared, indicating a potential issue.
 */
#define ZC_TIMEOUT_SECS             (2.0e-3)

/**
 * @def ZC_TMIN_SECS
 * @brief Minimum zero-crossing time (in seconds).
 * @details When the zero-crossing region is entered (zero-cross flag set), the system
 * will remain in this region for at least this amount of time, even if exit
 * conditions are otherwise satisfied. This provides hysteresis for zero-crossing detection.
 */
#define ZC_TMIN_SECS                (100.0e-6)

/**
 * @def AC_DROP_TIMEOUT_SECS
 * @brief AC drop timeout (in seconds).
 * @details This defines the maximum allowable duration for an AC drop event before
 * the AC OK flag is reset. An AC drop is detected when:
 * - The AC input voltage drops below the zero-crossing threshold.
 * - The phase's state machine is in the `VACM_STATE_ONLINE` state.
 */
#define AC_DROP_TIMEOUT_SECS           (25.0e-3)

/**
 * @}
 */ // End of VACM_Public_Macros group

/**
 * @defgroup VACM_Private_Macros Private Conversion Macros for AC Voltage Monitor
 * @brief Macros for converting SI units to firmware-specific integer values.
 * @details These macros convert the public configuration values from SI units (Volts, Hz, seconds)
 * into integer values suitable for use by the firmware's internal timers and comparisons.
 * These macros should generally not need to be modified by the end user.
 * @{
 */

/**
 * @def DC_ACCEPTANCE_PERIOD_TICKS
 * @brief DC acceptance period in IRQ ticks.
 * @details If Vin is above the UV trigger threshold and its value does not change
 * significantly over a period equivalent to two full line cycles, the signal
 * is considered to be DC. This period is measured by a software timer incremented
 * each time the AC monitor state machine is called.
 */
#define DC_ACCEPTANCE_PERIOD_TICKS      (rnd(FCALL_AC_MONITOR * 40.0e-3))

/**
 * @def FREQ_VAC_MIN_TICKS
 * @brief Minimum AC line frequency (in Hertz) converted to IRQ ticks.
 * @details This macro calculates the number of IRQ ticks corresponding to the
 * period of 1 / `FREQ_VAC_MIN_HZ`.
 */
#define FREQ_VAC_MIN_TICKS                 (rnd(FCALL_AC_MONITOR / FREQ_VAC_MIN_HZ))

/**
 * @def FREQ_VAC_MAX_TICKS
 * @brief Maximum AC line frequency (in Hertz) converted to IRQ ticks.
 * @details This macro calculates the number of IRQ ticks corresponding to the
 * period of 1 / `FREQ_VAC_MAX_HZ`.
 */
#define FREQ_VAC_MAX_TICKS                 (rnd(FCALL_AC_MONITOR / FREQ_VAC_MAX_HZ))

/**
 * @def ZC_TIMEOUT_TICKS
 * @brief Zero-crossing timeout (in seconds) converted to IRQ ticks.
 */
#define ZC_TIMEOUT_TICKS           (rnd(FCALL_AC_MONITOR * ZC_TIMEOUT_SECS))

/**
 * @def ZC_TMIN_TICKS
 * @brief Minimum zero-crossing time (in seconds) converted to IRQ ticks.
 */
#define ZC_TMIN_TICKS          (rnd(FCALL_AC_MONITOR * ZC_TMIN_SECS))

/**
 * @def AC_DROP_TIMEOUT_TICKS
 * @brief AC drop timeout (in seconds) converted to IRQ ticks.
 */
#define AC_DROP_TIMEOUT_TICKS     (rnd(FCALL_AC_MONITOR * AC_DROP_TIMEOUT_SECS))

// ADC thresholds corresponding to UV and OV levels
// These are compared to the averaged rectified AC values.

/**
 * @def VAC_UV_TRIG_ADC
 * @brief Under-voltage (UV) trigger threshold converted from Volts to ADC codes.
 * @details This macro converts the `VAC_UV_TRIG_VOLTS` value into the corresponding
 * ADC code. It assumes an ADC reference voltage of 3.3V and a 12-bit ADC (4096 counts).
 */
#define VAC_UV_TRIG_ADC           (rnd((VAC_UV_TRIG_VOLTS*VAC_SENSE_GAIN)/3.3*4096))

/**
 * @def VAC_UV_CLR_ADC
 * @brief Under-voltage (UV) clear threshold converted from Volts to ADC codes.
 * @details This macro converts the UV clear voltage (`VAC_UV_TRIG_VOLTS + VAC_UV_HYS_VOLTS`)
 * into the corresponding ADC code for firmware use. It assumes an ADC reference
 * voltage of 3.3V and a 12-bit ADC (4096 counts).
 */
#define VAC_UV_CLR_ADC            (rnd(((VAC_UV_TRIG_VOLTS + VAC_UV_HYS_VOLTS)*VAC_SENSE_GAIN)/3.3*4096))

/**
 * @def VAC_OV_TRIG_ADC
 * @brief Over-voltage (OV) trigger threshold converted from Volts to ADC codes.
 * @details This macro converts the `VAC_OV_TRIG_VOLTS` value into the corresponding
 * ADC code. It assumes an ADC reference voltage of 3.3V and a 12-bit ADC (4096 counts).
 */
#define VAC_OV_TRIG_ADC           (rnd((VAC_OV_TRIG_VOLTS*VAC_SENSE_GAIN)/3.3*4096))

/**
 * @def VAC_OV_CLR_ADC
 * @brief Over-voltage (OV) clear threshold converted from Volts to ADC codes.
 * @details This macro converts the OV clear voltage (`VAC_OV_TRIG_VOLTS - VAC_OV_HYS_VOLTS`)
 * into the corresponding ADC code for firmware use. It assumes an ADC reference
 * voltage of 3.3V and a 12-bit ADC (4096 counts).
 */
#define VAC_OV_CLR_ADC            (rnd(((VAC_OV_TRIG_VOLTS - VAC_OV_HYS_VOLTS)*VAC_SENSE_GAIN)/3.3*4096))

/**
 * @}
 */ // End of VACM_Private_Macros group

//------------------------------------------------------------------------------
// Public function declarations
//------------------------------------------------------------------------------

/**
 * @brief Resets the appropriate members of a phase monitor object.
 * @details This function clears the accumulator, counter, average voltage,
 * all status flags, and various time-base timers within the provided
 * `VACM_s` object. It is typically called before transitioning to the
 * `VACM_STATE_STANDBY` state to ensure a clean reset.
 * @param[in,out] vacm_obj Pointer to the `VACM_s` (phase monitor) object to be reset.
 * @return None
 */
void vacm_reset_phase_monitor_object(struct VACM_s* vacm_obj);

/**
 * @brief Top-level state machine for the AC Voltage Monitor.
 * @details This function is the main entry point for the AC Voltage Monitor
 * state machine. It is called periodically (e.g., every ISR pass) for each
 * phase. It first captures the input voltage and updates the voltage loop
 * feed-forward term, then executes the handler for the current state.
 * @param[in,out] vacm_obj Pointer to the `VACM_s` (phase monitor) object for which the state machine is to be run.
 * @return None
 */
void vacm_state_machine(struct VACM_s* vacm_obj);

/**
 * @brief Resets the state variable of the AC Voltage Monitor state machine.
 * @details This function sets the state of the provided `VACM_s` object
 * back to `VACM_STATE_STANDBY`.
 * @param[in,out] vacm_obj Pointer to the `VACM_s` (phase monitor) object whose state machine is to be reset.
 * @return None
 */
void vacm_reset_state_machine(struct VACM_s* vacm_obj);

//------------------------------------------------------------------------------
// External variables
//------------------------------------------------------------------------------
/**
 * @brief External declaration for phase 1 AC Voltage Monitor data.
 */
extern VACM_t phase1;
/**
 * @brief External declaration for phase 2 AC Voltage Monitor data.
 */
extern VACM_t phase2;
/**
 * @brief External declaration for phase 3 AC Voltage Monitor data.
 */
extern VACM_t phase3;


#endif	/* VAC_MONITOR_H */
