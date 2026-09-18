/**
  Generated MCC_add_on.h file from MPLAB Code Configurator

  @Company
    Microchip Technology Inc.

  @File Name
    MCC_add_on.h

  @Summary
    This is the generated MCC_add_on.h using PIC24 / dsPIC33 / PIC32MM MCUs.

  @Description
    This source file provides main entry point for system initialization and application code development.
    Generation Information :
        Product Revision  :  PIC24 / dsPIC33 / PIC32MM MCUs - 1.170.0
        Device            :  dsPIC33CH512MP506S1
    The generated drivers are tested against the following:
        Compiler          :  XC16 v1.61
        MPLAB 	          :  MPLAB X v5.45
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

#ifndef MCC_ADD_ON_H
#define	MCC_ADD_ON_H

/*
 Section: Included Files
 */

#include <xc.h>

/**
  @Summary
    Enables the specific PWM Swap.

  @Description
    This routine is used to enable the specific PWM generator selected by the argument PWM_GENERATOR.

  @Param
    pwmIndex - PWM generator number.

  @Returns
    None
 
  @Example 
    <code>
    PWM_SwapEnable(PWM_GENERATOR_1);
    </code>
 */
inline static void PWM_SwapEnable(uint16_t pwmIndex) {
    switch (pwmIndex) {
        case 1:
            PG1IOCONLbits.SWAP = 1;
            break;
        case 2:
            PG2IOCONLbits.SWAP = 1;
            break;
        case 3:
            PG3IOCONLbits.SWAP = 1;
            break;
        default:break;
    }
}

/**
  @Summary
    Disables the specific PWM Swap.

  @Description
    This routine is used to enable the specific PWM generator selected by the argument PWM_GENERATOR.

  @Param
    pwmIndex - PWM generator number.

  @Returns
    None
 
  @Example 
    <code>
    PWM_SwapDisable(PWM_GENERATOR_1);
    </code>
 */
inline static void PWM_SwapDisable(uint16_t pwmIndex) {
    switch (pwmIndex) {
        case 1:
            PG1IOCONLbits.SWAP = 0;
            break;
        case 2:
            PG2IOCONLbits.SWAP = 0;
            break;
        case 3:
            PG3IOCONLbits.SWAP = 0;
            break;
        default:break;
    }
}

// Enum for the User Output Override Synchronization (OSYNC) modes
// Located in the PGxIOCONL register, bits 9:8

typedef enum {
    /**
     * @brief User output overrides are synchronized to the local PWM time base.
     *
     * Overrides take effect at the next Start-of-Cycle (SOC) event.
     * This is the **default setting upon reset** [3].
     * It is the **recommended mode for scheduling override updates with interrupts**,
     * providing maximum time to complete subsequent write operations [7, 8].
     * Used for the **host PWM Generator** when synchronizing overrides across multiple generators [5].
     */
    OSYNC_SYNC_TO_SOC = 0b00, // Also represented as 0x00 or 0

    /**
     * @brief User output overrides occur immediately.
     *
     * Overrides take effect as soon as possible after the data update request
     * (setting the UPDREQ bit) is processed [3, 4].
     * When using immediate updates, user software should **poll the UPDATE bit**
     * (PGxSTAT[9]) before writing new override values to ensure it is safe [7, 8].
     */
    OSYNC_IMMEDIATE = 0b01, // Also represented as 0x01 or 1

    /**
     * @brief User output overrides occur when specified by the UPDMOD[2:0] bits.
     *
     * This mode is used in **Client SOC** or **Client Immediate** modes
     * when synchronizing override updates across multiple PWM Generators,
     * where another generator acts as a host [3, 5].
     * The specific timing depends on the UPDMOD[2:0] setting in the PGxCONH register [3, 4, 7].
     * For client SOC mode specifically, UPDMOD = 0b0101 is used, and the updates occur
     * at the start of the next cycle if a host update request is received [5, 10, 11].
     */
    OSYNC_SYNC_TO_UPDMOD = 0b10, // Also represented as 0x02 or 2

    /**
     * @brief Reserved value for OSYNC.
     *
     * This value is listed as **Reserved** in the source [3].
     * It should generally **not be used** as its behavior is undefined [3].
     */
    OSYNC_RESERVED = 0b11 // Also represented as 0x03 or 3

} PWM_OSYNC_MODE_t;

/**
 * @brief Sets the output synchronization mode for a specified PWM generator.
 *
 * @param genNum The number of the PWM generator to configure (1 to 8).
 * @param OSYNC_value The desired output synchronization mode, as defined by the
 * `PWM_OSYNC_MODE_t` enumeration. This value determines whether the
 * PWM output is synchronized with other PWM outputs or operates asynchronously.
 */
inline static void PWM_set_override_sync_mode(uint16_t pwmIndex, PWM_OSYNC_MODE_t OSYNC_value) {
    if (OSYNC_value <= 3) {
        switch (pwmIndex) {
            case 1:
                /** @brief Sets the output synchronization mode for PWM Generator 1. */
                PG1IOCONLbits.OSYNC = OSYNC_value;
                break;
            case 2:
                /** @brief Sets the output synchronization mode for PWM Generator 2. */
                PG2IOCONLbits.OSYNC = OSYNC_value;
                break;
            case 3:
                /** @brief Sets the output synchronization mode for PWM Generator 3. */
                PG3IOCONLbits.OSYNC = OSYNC_value;
                break;
            case 4:
                /** @brief Sets the output synchronization mode for PWM Generator 4. */
                PG4IOCONLbits.OSYNC = OSYNC_value;
                break;
            case 5:
                /** @brief Sets the output synchronization mode for PWM Generator 5. */
                PG5IOCONLbits.OSYNC = OSYNC_value;
                break;
            case 6:
                /** @brief Sets the output synchronization mode for PWM Generator 6. */
                PG6IOCONLbits.OSYNC = OSYNC_value;
                break;
            case 7:
                /** @brief Sets the output synchronization mode for PWM Generator 7. */
                PG7IOCONLbits.OSYNC = OSYNC_value;
                break;
            case 8:
                /** @brief Sets the output synchronization mode for PWM Generator 8. */
                PG8IOCONLbits.OSYNC = OSYNC_value;
                break;
            default:
                /** @brief Handles invalid PWM generator numbers.
                 * @details No action is taken if an invalid generator number is provided.
                 * It might be beneficial to add error handling or logging for such cases
                 * in a production environment.
                 */
                break;
        }
    }
}

/**
 * @brief Configures the postscaler for ADC Trigger 1 of a specified PWM generator.
 *
 * @param pwmIndex The index of the PWM generator to configure (1 to 8).
 * @param divideBy The division factor for the ADC Trigger 1 signal. The ADC trigger
 * signal will be generated every `divideBy` PWM cycles. This value must be
 * between 1 and 32, inclusive.
 *
 * @details This function sets the `ADTR1PS[4:0]` control bits within the `PGxEVTL`
 * register 1 for the specified PWM generator. The `ADTR1PS` bits scale down the
 * rate at which the PWM Generator's ADC Trigger 1 signal is generated. This allows
 * the trigger to occur less frequently than the PWM cycle, enabling an ADC conversion
 * (or triggering another peripheral) only after a defined number of PWM cycles.
 *
 * A `divideBy` value of 1 means the ADC Trigger 1 signal is generated on every
 * PWM cycle. A value of 2 means it's generated every two PWM cycles, and so on,
 * up to a maximum division by 32. The function performs a bounds check on the
 * `divideBy` parameter to ensure it's within the valid range.
 */
inline static void PWM_AdcTrig1_PostScale(uint16_t pwmIndex, uint16_t divideBy) {
    if ((divideBy >= 1) && (divideBy <= 32)) {
        uint16_t postScalar = divideBy - 1; // ADTR1PS value is divideBy - 1
        switch (pwmIndex) {
            case 1:
                /** @brief Sets the ADTR1PS for PWM Generator 1. */
                PG1EVTLbits.ADTR1PS = postScalar;
                break;
            case 2:
                /** @brief Sets the ADTR1PS for PWM Generator 2. */
                PG2EVTLbits.ADTR1PS = postScalar;
                break;
            case 3:
                /** @brief Sets the ADTR1PS for PWM Generator 3. */
                PG3EVTLbits.ADTR1PS = postScalar;
                break;
            case 4:
                /** @brief Sets the ADTR1PS for PWM Generator 4. */
                PG4EVTLbits.ADTR1PS = postScalar;
                break;
            case 5:
                /** @brief Sets the ADTR1PS for PWM Generator 5. */
                PG5EVTLbits.ADTR1PS = postScalar;
                break;
            case 6:
                /** @brief Sets the ADTR1PS for PWM Generator 6. */
                PG6EVTLbits.ADTR1PS = postScalar;
                break;
            case 7:
                /** @brief Sets the ADTR1PS for PWM Generator 7. */
                PG7EVTLbits.ADTR1PS = postScalar;
                break;
            case 8:
                /** @brief Sets the ADTR1PS for PWM Generator 8. */
                PG8EVTLbits.ADTR1PS = postScalar;
                break;
            default:
                /** @brief Handles invalid PWM generator index.
                 * @details No action is taken if the provided pwmIndex is out of the valid range (1-8).
                 * Consider adding error handling or logging for such cases in a production environment.
                 */
                break;

        };
    };
}

#endif	/* MCC_ADD_ON_H */

