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


#ifndef _DRV_MSI_H
#define	_DRV_MSI_H

#include <xc.h> 

/**
 * ======================================================================================================================
 * @brief Function prototypes
 * ======================================================================================================================
 */

/**
 * @brief Sends a message using the master-slave interface FIFO.
 *
 * This function sends a message using the master-slave interface (MSI) First-In, First-Out (FIFO) mechanism.
 *
 * @param void This function takes no parameters.
 *
 * @return void This function does not return any value.
 */
void SendMSIFIFOMessage(void);

/**
 * @brief Receives a message using the master-slave interface.
 *
 * This function receives a message using the master-slave interface (MSI) mechanism.
 *
 * @param void This function takes no parameters.
 *
 * @return void This function does not return any value.
 */
void ReceiveMSIAMessage(void);

#endif	/* XC_HEADER_TEMPLATE_H */

