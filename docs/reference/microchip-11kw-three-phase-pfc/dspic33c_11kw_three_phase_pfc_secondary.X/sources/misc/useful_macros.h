/**
 * @file useful_macros.h
 * @brief This file contains various utility macros for common operations.
 *
 * @details This header file provides a collection of useful macros for
 * mathematical operations, bit manipulation, Q-format conversions,
 * time-to-tick conversions, RMS/peak/average conversions, PWM configuration,
 * and ADC unit conversions. These macros are designed to simplify
 * common calculations and configurations within the firmware.
 */

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

// This is a guard condition so that contents of this file are not included
// more than once.
#ifndef MACROS_H
#define	MACROS_H

#include <xc.h> // include processor files - each processor file is guarded.

/**
 * @defgroup Math_Macros Mathematical Utility Macros
 * @brief Macros for common mathematical operations.
 * @{
 */

/**
 * @def _rnd(a)
 * @brief Rounds a floating-point number to the nearest 16-bit signed integer.
 * @param a The floating-point number to round.
 * @return The rounded 16-bit signed integer value.
 * @details This macro implements a rounding function for floating-point numbers
 * to the nearest integer. It handles both positive and negative values by adding
 * 0.5 for positive numbers and subtracting 0.5 for negative numbers before
 * truncation.
 */
#define _rnd(a)    ((int16_t)((a)+((a)<0?-0.5:0.5)))

/**
 * @def _min(a,b)
 * @brief Determines the minimum of two values.
 * @param a The first value.
 * @param b The second value.
 * @return The minimum of the two values.
 * @details This macro compares two values and returns the smaller one.
 * It is a generic macro that can be used with any comparable data type.
 */
#define _min(a,b)  (((a)>(b)) ? (b):(a))

/**
 * @def _max(a,b)
 * @brief Determines the maximum of two values.
 * @param a The first value.
 * @param b The second value.
 * @return The maximum of the two values.
 * @details This macro compares two values and returns the larger one.
 * It is a generic macro that can be used with any comparable data type.
 */
#define _max(a,b)  (((a)>(b)) ? (a):(b))

/**
 * @def rnd(a)
 * @brief Rounds a floating-point number to the nearest 16-bit unsigned integer.
 * @param a The floating-point number to round.
 * @return The rounded 16-bit unsigned integer value.
 * @details This macro rounds a floating-point number to the nearest unsigned 16-bit integer.
 * It handles positive and negative numbers by adding 0.5 for positive values
 * and subtracting 0.5 for negative values before casting to `uint16_t`.
 * @ingroup public-macros
 */
#define rnd(a)      ((uint16_t)((a)+((a)<0?-0.5:0.5)))


/**
 * @def min(a,b)
 * @brief Determines the minimum of two unsigned 16-bit integers.
 * @param a The first unsigned 16-bit integer.
 * @param b The second unsigned 16-bit integer.
 * @return The minimum of the two unsigned 16-bit integers.
 * @details This macro compares two unsigned 16-bit integers and returns the smaller one.
 * @ingroup public-macros
 */
#define min(a,b)    ((uint16_t)(((a)>(b)) ? (b):(a)))

/**
 * @def max(a,b)
 * @brief Determines the maximum of two unsigned 16-bit integers.
 * @param a The first unsigned 16-bit integer.
 * @param b The second unsigned 16-bit integer.
 * @return The maximum of the two unsigned 16-bit integers.
 * @details This macro compares two unsigned 16-bit integers and returns the larger one.
 * @ingroup public-macros
 */
#define max(a,b)    ((uint16_t)(((a)>(b)) ? (a):(b)))

/**
 * @def _rnd_int32_t(a)
 * @brief Rounds a floating-point number to the nearest 32-bit signed integer.
 * @param a The floating-point number to round.
 * @return The rounded 32-bit signed integer value.
 * @details This macro implements a rounding function for floating-point numbers
 * to the nearest 32-bit signed integer. It handles both positive and negative values by adding
 * 0.5 for positive numbers and subtracting 0.5 for negative numbers before
 * truncation.
 */
#define _rnd_int32_t(a)    ((int32_t)((a)+((a)<0?-0.5:0.5)))

/**
 * @}
 */ // End of Math_Macros group

/**
 * @defgroup Byte_Manipulation_Macros Byte Manipulation Macros
 * @brief Macros for extracting bytes from a word.
 * @{
 */

/**
 * @def WordLowByte(word)
 * @brief Extracts the low byte from a 16-bit word.
 * @param word The 16-bit word.
 * @return The low byte (uint8_t) of the word.
 */
#define WordLowByte(word)   ((uint8_t) (word & 0x00FF))

/**
 * @def WordHighByte(word)
 * @brief Extracts the high byte from a 16-bit word.
 * @param word The 16-bit word.
 * @return The high byte (uint8_t) of the word.
 */
#define WordHighByte(word)  ((uint8_t) (word >> 8))

/**
 * @}
 */ // End of Byte_Manipulation_Macros group

/**
 * @defgroup Q_Format_Macros Q-Format Conversion Macros
 * @brief Macros for Q-format conversions.
 * @{
 */

/**
 * @def QFORMAT_SHIFT(value)
 * @brief Calculates the optimal Q-format shift for a given positive floating-point value.
 * @param value The positive floating-point value for which to determine the Q-format shift.
 * @return The Q-format shift value (number of fractional bits) to achieve maximum resolution
 * within a 15-bit representation.
 * @details This macro determines the optimal Q-format shift for a given positive floating-point
 * value. It finds the largest possible shift that keeps the integer part of the Q-format
 * number within the 15-bit range, thus maximizing the fractional resolution. The result
 * is a value between 0 and 15.
 */
#define QFORMAT_SHIFT(value)  ((value) < ((float)(1<<0)) ? (15) : \
                              ((value) < ((float)(1<<1)) ? (14) : \
                              ((value) < ((float)(1<<2)) ? (13) : \
                              ((value) < ((float)(1<<3)) ? (12) : \
                              ((value) < ((float)(1<<4)) ? (11) : \
                              ((value) < ((float)(1<<5)) ? (10) : \
                              ((value) < ((float)(1<<6)) ? (9) : \
                              ((value) < ((float)(1<<7)) ? (8) : \
                              ((value) < ((float)(1<<8)) ? (7) : \
                              ((value) < ((float)(1<<9)) ? (6) : \
                              ((value) < ((float)(1<<10)) ? (5) : \
                              ((value) < ((float)(1<<11)) ? (4) : \
                              ((value) < ((float)(1<<13)) ? (3) : \
                              ((value) < ((float)(1<<13)) ? (2) : \
                              ((value) < ((float)(1<<14)) ? (1) : (0))))))))))))))))

/**
 * @}
 */ // End of Q_Format_Macros group

/**
 * @defgroup Time_Conversion_Macros Time and Unit Conversion Macros
 * @brief Macros for converting time and various units.
 * @{
 */

/**
 * @def TIME_TO_TICKS(time, tick_period)
 * @brief Converts time in seconds to counter ticks.
 * @param time The time value in seconds (float).
 * @param tick_period The period of one tick in seconds (float).
 * @return The number of counter ticks (int16_t).
 */
#define TIME_TO_TICKS(time, tick_period)    (_rnd(time/tick_period))

/**
 * @def RMS_TO_PEAK
 * @brief Conversion factor from RMS value to peak value for a sine wave.
 * @details This macro defines the constant for converting an RMS (Root Mean Square)
 * value to a peak value for a sinusoidal waveform (approximately $\sqrt{2}$).
 */
#define RMS_TO_PEAK           (1.414213562)

/**
 * @def AVG_TO_RMS
 * @brief Conversion factor from average value to RMS value for a full-wave rectified sine wave.
 * @details This macro defines the constant for converting an average value to an RMS value
 * for a full-wave rectified sinusoidal waveform (approximately $\frac{\pi}{2\sqrt{2}} \approx 1.11$).
 */
#define AVG_TO_RMS            (1.11)

/**
 * @def RMS_TO_AVG
 * @brief Conversion factor from RMS value to average value for a full-wave rectified sine wave.
 * @details This macro defines the constant for converting an RMS value to an average value
 * for a full-wave rectified sinusoidal waveform (approximately $\frac{1}{1.11}$).
 */
#define RMS_TO_AVG            (1.0/AVG_TO_RMS)

/**
 * @}
 */ // End of Time_Conversion_Macros group

/**
 * @defgroup PWM_Configuration_Macros PWM Configuration Macros
 * @brief Macros for configuring High-Resolution PWM modules.
 * @{
 */

/**
 * @def PWM_HR_EDGE_ALIGNED_PGxPER(freq_hz)
 * @brief Calculates the PWM period register value for high-resolution, edge-aligned mode.
 * @param freq_hz The desired PWM frequency in Hz (float).
 * @return The 16-bit integer value to be loaded into the PWMxPER register.
 * @details This macro calculates the period register value for a high-resolution
 * edge-aligned PWM, assuming a PWM clock frequency of 4 GHz (8 * 500 MHz).
 * The formula used is: `(8 * 500e6) / freq_hz - 8`.
 */
#define PWM_HR_EDGE_ALIGNED_PGxPER(freq_hz)     ((uint16_t)(_rnd_int32_t((8.0*500.0e+6)/(float)freq_hz)-8.0))

/**
 * @def PWM_HR_PGxDC(PGxPER, duty_percent)
 * @brief Calculates the PWM duty cycle register value for high-resolution modes.
 * @param PGxPER The value loaded into the PWMxPER register.
 * @param duty_percent The desired duty cycle in percent (0-100, float).
 * @return The 16-bit integer value to be loaded into the PGxDC register.
 * @details This macro converts a duty cycle percentage into the corresponding
 * integer value for the PGxDC register. The duty_percent parameter should be
 * between 0 and 100.
 */
#define PWM_HR_PGxDC(PGxPER, duty_percent)      ((uint16_t)(_rnd_int32_t((PGxPER+8)*(duty_percent/100.0))))

/**
 * @def PWM_HR_PGxTRIGy(trigger_offset)
 * @brief Converts a trigger offset in seconds to an integer for the PGxTRIGy register.
 * @param trigger_offset The desired trigger offset in seconds (float).
 * @return The 16-bit integer value to be loaded into the PGxTRIGy register.
 * @details This macro converts a time-based trigger offset into the corresponding
 * integer value for the PGxTRIGy register, assuming a PWM clock frequency of 4 GHz.
 */
#define PWM_HR_PGxTRIGy(trigger_offset)         ((uint16_t)(_rnd_int32_t(8.0*500.0e+6*trigger_offset)))

/**
 * @def PWM_HR_PGxDTy(dead_time)
 * @brief Converts dead time in seconds to an integer for the PGxDTy register.
 * @param dead_time The desired dead time in seconds (float).
 * @return The 16-bit integer value to be loaded into the PGxDTy register.
 * @details This macro converts a dead time value in seconds into the corresponding
 * integer value for the PGxDTy register, assuming a PWM clock frequency of 4 GHz.
 */
#define PWM_HR_PGxDTy(dead_time)                ((uint16_t)(_rnd_int32_t(8.0*500.0e+6*dead_time)))

/**
 * @def PWM_HR_CENTER_ALIGNED_PGxPER(freq_hz)
 * @brief Calculates the PWM period register value for high-resolution, center-aligned mode.
 * @param freq_hz The desired PWM frequency in Hz (float).
 * @return The 16-bit integer value to be loaded into the PWMxPER register.
 * @details This macro calculates the period register value for a high-resolution
 * center-aligned PWM, assuming a PWM clock frequency of 2 GHz (4 * 500 MHz).
 * The formula used is: `(4 * 500e6) / freq_hz - 8`.
 */
#define PWM_HR_CENTER_ALIGNED_PGxPER(freq_hz)     ((uint16_t)(_rnd_int32_t((4.0*500.0e+6)/(float)freq_hz)-8.0))

/**
 * @brief  Generates a 16-bit value for configuring a high-resolution,
 * center-aligned PWM trigger, based on a period and percentage.
 *
 * @param pgxper The PWM period value (15 bits).  This represents the
 * full period of the PWM waveform.
 * @param percent The duty cycle percentage (0-100).  This determines
 * the trigger point within the PWM period.
 *
 * @return A 16-bit value where:
 * - Bits [14:0] are calculated as pgxper * 2 * (percent % 50) / 100.
 * - Bit 15 is set to 1 if percent is > 50, and 0 otherwise.
 *
 * @details This macro calculates a trigger point for a high-resolution,
 * center-aligned PWM. The trigger point is positioned within
 * the PWM period based on the provided percentage.
 *
 * The macro performs the following operations:
 * 1. Calculates the trigger point by multiplying the PWM period
 * (`pgxper`) by 2, then by the result of the modulo operation
 * of `percent` by 50, and finally dividing by 100. This results
 * in a count value for the lower 15 bits of the register.
 * 2. Checks if the duty cycle percentage (`percent`) is greater
 * than 50.
 * 3. If `percent` is > 50, the macro sets bit 15 of the result
 * to 1 using a bitwise OR operation, indicating the trigger should
 * occur in the second half (CAHALF=1) of the Center-Aligned cycle.
 * Otherwise, bit 15 is cleared (implicitly, as the initial value is 0),
 * indicating the first half (CAHALF=0).
 *
 * @note The user is responsible for ensuring that `pgxper` and `percent`
 * are within their valid ranges. Specifically, `pgxper` should
 * fit within 15 bits, and `percent` should be between 0 and 100.
 * In High-Resolution mode, bits [2:0] of the PGxTRIGy registers
 * are forced to '0' by hardware, meaning the effective resolution
 * of the trigger value is coarser (multiples of 8 HR clocks).
 * User software should limit the maximum time base count period
 * (`pgxper`) to 0x7FFF (15 bits) in Center-Aligned modes to ensure
 * proper operation of the Trigger registers.
 */
#define PWM_HR_CENTER_ALIGNED_PGxTRIG(pgxper, percent) \
    (((uint16_t)((float)pgxper * 2.0 * ((float)(percent % 50) / 100.0))) | (((uint16_t)(percent) >= 50) << 15))

/**
 * @}
 */ // End of PWM_Configuration_Macros group

/**
 * @defgroup ADC_Conversion_Macros ADC Conversion Macros
 * @brief Macros for converting engineering units to ADC thresholds.
 * @{
 */

/**
 * @def UNITS_FROM_ENG_TO_ADC(threshold, gain, offset)
 * @brief Converts a threshold from engineering units (volts, amps) to ADC codes.
 * @param threshold The threshold value in engineering units (e.g., Volts, Amps).
 * @param gain The gain of the sensing circuit (e.g., V/V or V/A).
 * @param offset The offset of the sensing circuit (e.g., Volts).
 * @return The integer ADC code corresponding to the threshold.
 * @details This macro calculates the integer ADC code from a given threshold
 * in engineering units (e.g., Volts or Amps), considering the gain and offset
 * of the sensing circuit. The conversion assumes a 3.3V reference and a 12-bit ADC (4096 counts).
 * The formula used is: `((threshold * gain) + offset) / 3.3 * 4096`.
 */
#define UNITS_FROM_ENG_TO_ADC(threshold, gain, offset)       (_rnd((((float)threshold*(float)gain) + (float)offset)/3.3*4096.0))

/**
 * @}
 */ // End of ADC_Conversion_Macros group

#endif	/* MACROS_H */
