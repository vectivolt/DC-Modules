/* port.h — the port's internal interfaces (application and bootloader builds share system/gpio/can/nvm/flash). */
#ifndef PORT_PORT_H
#define PORT_PORT_H
#include "regs.h"
#include "board.h"
#include "../../hal/app.h"

extern uint32_t port_reset_cause;   /* RCU_RSTSCK snapshot (BIT(29) FWDGT · BIT(28) SW · BIT(27) POR · BIT(26) pin) */
extern uint32_t port_slot_vtor;     /* the slot the bootloader entered — SCB_VTOR points into RAM */

void system_init(void);
void delay_us(uint32_t us);
void fwdgt_start(void);
void fwdgt_kick(void);
void wdi_pulse(void);
void port_kick_grant(uint8_t n);   /* buy n watchdog services (10 ms each) — tick() and bounded flash waits only */
void port_reboot(void);

void hrtimer_init(void);
void cmpdac_init(void);
void cmpdac_thresholds(const float dac_v[APP_DAC_COUNT]);
void hrtimer_pfc_apply(const app_pfc_out_t *o);
void hrtimer_llc_apply(const app_llc_out_t *o);
uint16_t hrtimer_fault_read_clear(void);
bool hrtimer_trip_pending(void);               /* a fault flag the fault ISR has not taken yet — set in the kill's own clock domain */
void hrtimer_all_off(void);                    /* every power output disabled, now */

void adc_init(void);
uint16_t adc_read_once(unsigned adc, uint8_t ch);
uint16_t adc_vrefint_read(void);               /* ADC3_IN20 at 28.5 µs — boot only, before adc_init() */
void adc_read_pfc(app_pfc_adc_t *s, float *ires, float *vout, float *iout, float *iout_n,
                  float *t_inlet, float *vbka, float *vbkb, float *v24);
void adc_read_slow(float *t_pfc, float *t_llc, float *t_xfmr, float *v15, float *avmid);
float adc_ires_now(void);                      /* freshest completed I_RES, for the fault ISR */

void can_init(uint32_t bitrate, int listen_only);
extern uint8_t can_bitrate_bad;                /* the requested bit rate had no timing table (ran 250 k) */
uint8_t can_rx(pmp_frame_t *dst, uint8_t max);
int can_tx_ready(void);
void can_tx(const pmp_frame_t *f);
uint8_t can_state(void);
extern uint16_t can_rx_congested;         /* can.c — drains that found all eight RX mailboxes occupied */
void can_restart(void);

void pwm_out_init(void);                       /* TIMER19 fans · TIMER3 matrix-coil economizer */
void pwm_fan(float d1, float d2);
void pwm_relay(const float duty[APP_RLY_COUNT]);

uint32_t nvm_port_page_size(void);

#define RAMFUNC __attribute__((section(".ramfunc"), noinline))
#endif
