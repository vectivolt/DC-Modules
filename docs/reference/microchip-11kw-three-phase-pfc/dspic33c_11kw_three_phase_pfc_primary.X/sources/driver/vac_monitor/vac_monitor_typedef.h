/**
 * @file vac_monitor_typedef.h
 * @brief This file defines the data types for the AC Voltage Monitor (VACM) module.
 *
 * @details This header file contains the definitions for various structures and
 * enumerations used by the AC Voltage Monitor. These types encapsulate the
 * status flags, fault flags, input voltage data, averaging buffers,
 * time-base information, and state machine operating states for the VACM module.
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
#ifndef VAC_MONITOR_DEVICE_DRIVER_TYPEDEF_H
#define	VAC_MONITOR_DEVICE_DRIVER_TYPEDEF_H

#include <xc.h> // include processor files - each processor file is guarded.
#include <stdint.h> // include standard integer data type header file
#include <stdbool.h> // include standard boolean data type header file
#include <dsp.h> // include standard DSP data type declarations header files

/**
 * @defgroup VACM_Typedefs AC Voltage Monitor Type Definitions
 * @brief Data types used by the AC Voltage Monitor (VACM) module.
 * @{
 */

/**
 * @brief Structure to hold the status flags of the AC voltage monitor.
 * @details This structure uses a union to allow both bit-level access to
 * individual status flags and a 16-bit word for read/write operations.
 * These flags indicate various real-time conditions of the AC input voltage.
 */
struct VACM_STATUS_s {

    union {

        struct {
            bool ac_drop : 1; ///< Bit 0: Flag indicating that an AC drop event may have occurred.
            bool dc_mode : 1; ///< Bit 1: 1 when Vin is DC, 0 when Vin is AC.
            bool ac_ok : 1; ///< Bit 2: Flag indicating the overall status of the AC line voltage (1 = OK, 0 = Not OK).
            bool zero_cross : 1; ///< Bit 3: Flag indicating that the input voltage is currently in the zero-crossing region.
            bool polarity_pos : 1; ///< Bit 4: Flag = 1 when AC input polarity is positive, 0 when negative.
            bool end_of_cycle : 1; ///< Bit 5: Flag indicating that the end of a half-cycle (zero-crossing) has just occurred.
            bool slope_pos : 1; ///< Bit 6: Flag = 1 when AC line slope is positive, 0 when negative.
            unsigned : 1; ///< Bit 7: Unused.
            unsigned : 1; ///< Bit 8: Unused.
            unsigned : 1; ///< Bit 9: Unused.
            unsigned : 1; ///< Bit 10: Unused.
            unsigned : 1; ///< Bit 11: Unused.
            unsigned : 1; ///< Bit 12: Unused.
            unsigned : 1; ///< Bit 13: Unused.
            unsigned : 1; ///< Bit 14: Unused.
            unsigned : 1; ///< Bit 15: Unused.
        } __attribute__((packed)) bits; // data structure for single bit addressing operations
        volatile uint16_t value; // buffer for 16-bit word read/write operations
    };
};

/**
 * @brief Typedef for the VACM_STATUS_s structure.
 */
typedef struct VACM_STATUS_s VACM_STATUS_t;

/**
 * @brief Structure to hold the fault flags of the AC voltage monitor.
 * @details This structure uses a union to allow both bit-level access to
 * individual fault flags and a 16-bit word for read/write operations.
 * These flags indicate various fault conditions detected in the AC input voltage.
 */
struct VACM_FAULT_s {

    union {

        struct {
            bool ov : 1; ///< Bit 0: Flag indicating that the magnitude of the line voltage is above the OV threshold.
            bool uv : 1; ///< Bit 1: Flag indicating that the magnitude of the line voltage is below the UV threshold.
            bool fmin : 1; ///< Bit 2: Flag indicating that the frequency of the line voltage is below the minimum allowed.
            bool fmax : 1; ///< Bit 3: Flag indicating that the frequency of the line voltage is above the maximum allowed.
            bool zc_timeout : 1; ///< Bit 4: Flag indicating that the system has spent too long in the zero-crossing region.
            unsigned : 1; ///< Bit 5: Unused.
            unsigned : 1; ///< Bit 6: Unused.
            unsigned : 1; ///< Bit 7: Unused.
            unsigned : 1; ///< Bit 8: Unused.
            unsigned : 1; ///< Bit 9: Unused.
            unsigned : 1; ///< Bit 10: Unused.
            unsigned : 1; ///< Bit 11: Unused.
            unsigned : 1; ///< Bit 12: Unused.
            unsigned : 1; ///< Bit 13: Unused.
            unsigned : 1; ///< Bit 14: Unused.
            unsigned : 1; ///< Bit 15: Unused.
        } __attribute__((packed)) bits; // data structure for single bit addressing operations
        uint16_t value; // buffer for 16-bit word read/write operations
    };
};

/**
 * @brief Typedef for the VACM_FAULT_s structure.
 */
typedef struct VACM_FAULT_s VACM_FAULT_t;

/**
 * @brief Structure to hold input voltage (Vin) related data for the AC monitor.
 */
struct VACM_VIN_s {
    uint16_t* ptr_adcbuf; ///< Pointer to the register or variable where the raw ADC input voltage value is read from (e.g., ADCBUFx).
    uint16_t raw; ///< Raw ADC reading of the input voltage, before offset removal and rectification.
    uint16_t raw_prev; ///< Previous reading of the raw input voltage.
    uint16_t rectified; ///< Rectified input voltage, after offset removal.
    int16_t* ptr_offset; ///< Pointer to the offset voltage upon which the sensed input voltage sits before ADC digitization.
    uint16_t avg; ///< Average of the rectified input voltage over a half line cycle.
    uint16_t avg_prev; ///< Previous reading of the average rectified input voltage (over a half line cycle).
    uint16_t avg_sqrd; ///< Square of the average input voltage, used for feed-forward calculations.
    int16_t vloop_ff; ///< Voltage loop feed-forward term (Vin / Vavg^2).
    int16_t raw_ac; ///< Digital representation of the AC voltage value (offset subtracted and 180-degree phase shift corrected).
};

/**
 * @brief Typedef for the VACM_VIN_s structure.
 */
typedef struct VACM_VIN_s VACM_VIN_t;

/**
 * @brief Structure to store information needed at runtime for calculating the average of the rectified input voltage.
 */
struct VACM_AVGCALC_BUFFER_s {
    uint16_t counter; ///< Counter used for accumulating samples to compute the average of the rectified input voltage.
    uint16_t counter_reset; ///< When `avg_counter` reaches this value, the average is computed and the counter is reset.
    uint32_t acc; ///< Accumulator used for summing rectified input voltage samples for averaging.
};

/**
 * @brief Typedef for the VACM_AVGCALC_BUFFER_s structure.
 */
typedef struct VACM_AVGCALC_BUFFER_s VACM_AVGCALC_BUFFER_t;

/**
 * @brief Structure to hold time-base information related to line cycle and zero-crossing timing.
 */
struct VACM_TIMEBASE_s {
    uint16_t half_cycle; ///< Measured length of a half AC line cycle in IRQ ticks.
    uint16_t half_cycle_timer; ///< Timer used to measure the duration of a half AC line cycle.
    uint16_t startup_counter; ///< Counter used to track stable AC periods during startup synchronization.
    uint16_t zero_cross_timer; ///< Timer used to measure the duration spent in the zero-crossing region.
    uint16_t ac_drop_timer; ///< Timer used to measure the duration of an AC drop event.
    uint16_t vin_present_counter; ///< Counter used to confirm that some input voltage is continuously present after an AC drop.
    uint16_t dc_present_counter; ///< Counter used to determine if the input voltage is consistently above a DC acceptance threshold.
    uint16_t dc_loss_counter; ///< Counter used to determine if the input voltage consistently drops below a DC rejection threshold.
};

/**
 * @brief Typedef for the VACM_TIMEBASE_s structure.
 */
typedef struct VACM_TIMEBASE_s VACM_TIMEBASE_t;

/**
 * @brief Enumeration defining the operating states of the AC Voltage Monitor state machine.
 */
enum VACM_STATES_e {
    VACM_STATE_STANDBY = 0x00, ///< State #0: Initial state, waiting for a launch trigger or voltage presence.
    VACM_STATE_DCDETECT = 0x01, ///< State #1: Checking if the input voltage is DC or AC.
    VACM_STATE_DCMODE = 0x02, ///< State #2: Operating in DC mode, bypassing further AC analysis.
    VACM_STATE_WAIT_ZC = 0x03, ///< State #3: Waiting for the first zero crossing to synchronize with AC.
    VACM_STATE_ACSYNC = 0x04, ///< State #4: Startup synchronization on the first few zero crossings after AC is detected.
    VACM_STATE_ONLINE = 0x05, ///< State #5: Normal AC input operation.
    VACM_STATE_ACDROP = 0x06 ///< State #6: AC drop detected, monitoring for recovery or extended drop.
};

/**
 * @brief Typedef for the VACM_STATES_e enumeration.
 */
typedef enum VACM_STATES_e VACM_STATES_t;

/**
 * @brief Main AC Monitor data object data type declaration.
 * @details This structure encapsulates all the data and state variables for a
 * single phase of the AC Voltage Monitor. It includes status, fault, time-base,
 * input voltage, and averaging buffer information, along with the current
 * state of its internal state machine.
 */
struct VACM_s {
    VACM_STATES_t state; ///< Current state machine operating state ID.
    VACM_STATUS_t status; ///< AC monitor status flags.
    VACM_FAULT_t fault; ///< AC monitor fault flags.
    VACM_TIMEBASE_t timebase; ///< Information related to line cycle and zero-crossing timing.
    VACM_VIN_t vin; ///< Information related to input voltage measurements.
    VACM_AVGCALC_BUFFER_t avgcalc_buffer; ///< Buffer used to store information needed at runtime for calculating the average of rectified input voltage.
};

/**
 * @brief Typedef for the VACM_s structure.
 */
typedef struct VACM_s VACM_t;

/**
 * @}
 */ // End of VACM_Typedefs group

#endif	/* VAC_MONITOR_DEVICE_DRIVER_TYPEDEF_H */
