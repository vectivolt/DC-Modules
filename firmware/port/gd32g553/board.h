/* board.h — E80 the E40 module card on the GD32G553VET7 (LQFP100). One table owns every pin; the
 * calculations/control/port-pin-audit.mjs gate diffs it against packages/common-components/umod-map.gen.ts, so the card
 * generator and this port cannot drift apart. Pin evidence: datasheet Table 2-4 (facts-system §10); AF numbers from the
 * datasheet AF tables (HRTIMER pins AF13 except PC8 = AF3; TIMER19 PE3/PE4 = AF6; TIMER3 PD12/PD13 = AF2; CAN1 PB5/PB6 = AF9). */
#ifndef PORT_BOARD_H
#define PORT_BOARD_H
#include "regs.h"

/* build configuration */
#ifndef PORT_HXTAL_HZ
#define PORT_HXTAL_HZ 0u          /* the drawn card has no crystal (HW-REC-4); 0 = IRC8M PLL. With a crystal fitted set
                                     8/12/16/20/24 MHz and the PLL and CAN clock derive from it. */
#endif
#define PORT_SYSCLK_HZ 216000000u
#define PORT_CANCLK_HZ  48000000u /* CK_PLLQ = 432 MHz VCO / 9 — with PORT_HXTAL_HZ 0 this is IRC8M-derived (±2.5 %),
                                     outside CAN's ~±0.5 % need: HW-REC-4 stands; the bus runs best-effort until the
                                     crystal lands (docs/firmware-architecture.md §10). */

/* PIN(port, pin) → one row of the table below */
typedef struct { uint8_t port, pin, mode, af; } board_pin_t;
enum { PM_AN = 0, PM_IN, PM_IN_PU, PM_OUT, PM_AF, PM_AF_OD };

/* -------- analog (mode PM_AN; ADC instance/channel in adc.c) — umod ways in comments */
#define BP_I_RES    PA, 0     /* AIN0  · ADC01_IN0  */
#define BP_VOUT     PA, 1     /* AIN3  · ADC01_IN1 · CMP0_IP */
#define BP_I_B0     PA, 3     /* AIN9  · ADC0_IN3  · CMP1_IP */
#define BP_VAC2     PA, 4     /* AIN12 · ADC1_IN15 (DAC0_OUT0 stays internal: MODE0 = 011) */
#define BP_T_INLET  PA, 6     /* ANA19 · ADC1_IN2  */
#define BP_IOUT     PA, 7     /* AIN4  · ADC1_IN3  */
#define BP_VAC1     PC, 0     /* AIN11 · ADC01_IN5 */
#define BP_I_C0     PC, 1     /* AIN10 · ADC01_IN6 · CMP2_IP */
#define BP_I_A0     PC, 2     /* AIN8  · ADC01_IN7 · CMP7_IP */
#define BP_AVMID    PC, 3     /* AVMID · ADC01_IN8 (bias readback) */
#define BP_IOUTN    PC, 4     /* AIN5  · ADC1_IN4  */
#define BP_VBKB     PD, 8     /* AIN7  · ADC3_IN11 */
#define BP_VBKA     PD, 9     /* AIN6  · ADC3_IN12 */
#define BP_VMID     PD, 10    /* ANA15 · ADC23_IN6 */
#define BP_V24      PD, 11    /* ANA16 · ADC23_IN7 */
#define BP_RATING   PE, 7     /* ROLE1 · ADC2_IN3  */
#define BP_VAC3     PE, 8     /* ANA13 · ADC23_IN5 */
#define BP_V15      PE, 12    /* ANA17 · ADC2_IN14 */
#define BP_T_PFC    PE, 13    /* ANA18 · ADC2_IN2  */
#define BP_T_LLC    PB, 0     /* TSNS0 · ADC2_IN11 */
#define BP_T_XFMR   PB, 1     /* TSNS1 · ADC2_IN0  */
#define BP_VBUS     PB, 13    /* ANA14 · ADC2_IN4 · CMP4_IP */

/* -------- HRTIMER outputs and fault pin */
#define BP_L1H      PA, 8     /* PWM0 · ST0CH0 AF13 */
#define BP_L1L      PA, 9     /* PWM6 · ST0CH1 AF13 */
#define BP_L2H      PA, 10    /* PWM1 · ST1CH0 AF13 */
#define BP_L2L      PA, 11    /* PWM7 · ST1CH1 AF13 */
#define BP_PWM_A0   PB, 14    /* PWM3 · ST3CH0 AF13 */
#define BP_PWM_B0   PC, 8     /* PWM4 · ST4CH0 AF3  */
#define BP_PWM_C0   PC, 6     /* PWM5 · ST5CH0 AF13 */
#define BP_FLT      PB, 10    /* FLT  · HRTIMER_FLT2 AF13 (wire-OR, active LOW: 4.7 k pull-up, drivers pull down) */

/* -------- fan and relay PWM */
#define BP_FAN1     PE, 3     /* DO7 · TIMER19_CH1 AF6 */
#define BP_FAN2     PE, 4     /* DO8 · TIMER19_MCH0 AF6 */
#define BP_KSER     PD, 12    /* DO0 · TIMER3_CH0 AF2 (economizer PWM) */
#define BP_KPARA    PD, 13    /* DO1 · TIMER3_CH1 AF2 (economizer PWM) */

/* -------- plain digital */
#define BP_KPARB    PD, 7     /* DO2 · GPIO (no timer on this pin: coil held at full duty — E80 port note) */
#define BP_KPRE     PE, 5     /* DO9 · GPIO (TIMER19_MCH1 candidate; enable PWM hold at bring-up once MCH1 mapping is confirmed) */
#define BP_QDIS     PE, 6     /* DO10 · GPIO (opto LED, not a coil) */
#define BP_QDISBK   PB, 2     /* DO6 · GPIO */
#define BP_EN_PFC   PD, 0     /* EN_A into the GATE_EN_A safety AND */
#define BP_EN_LLC   PD, 1     /* EN_B into the GATE_EN safety AND */
#define BP_DRV_RDY  PC, 12    /* wired-OR driver power-good, pull-up on the board */
#define BP_RLY_FB   PD, 6     /* DI8 · RELAY_FB_KPRE (series mirror chain, high = both mains open → invert) */
#define BP_WDI      PF, 10    /* internal · TPS3430 WDI: a FALLING edge every 10 ms (fixed window 2.22–23.375 ms, HR-02) */
#define BP_TACH1    PF, 2     /* DI6 · EXTI2  */
#define BP_TACH2    PD, 14    /* DI7 · EXTI14 */
#define BP_TACH3    PD, 5     /* DI9 · EXTI5  */
#define BP_TACH4    PB, 3     /* DI10 · EXTI3 */
#define BP_CAN_RX   PB, 5     /* CAN1_RX AF9 */
#define BP_CAN_TX   PB, 6     /* CAN1_TX AF9 */
#define BP_HMI_DAT  PE, 9
#define BP_HMI_CLK  PE, 10
#define BP_HMI_LAT  PE, 11
#define BP_HMI_DIG1 PE, 14
#define BP_HMI_DIG2 PB, 11
#define BP_BTN1     PD, 2     /* pressed = low (pull-up) */
#define BP_BTN2     PB, 4

void board_gpio_init(void);
static inline void pin_set(uint8_t port, uint8_t pin, int v) { GPIO_BOP(port) = BIT(pin) << (v ? 0 : 16); }
static inline int pin_get(uint8_t port, uint8_t pin) { return (GPIO_ISTAT(port) >> pin) & 1u; }
#endif
