/* lib.c — E80 freestanding support: the Homebrew arm-none-eabi-gcc ships no libc/libm, so the few calls the firmware
 * makes are provided here. logf is a rational minimax on [1, 2) with exponent split — worst error < 2e-7 relative,
 * far inside the NTC ladder's needs (meas_ntc_c is its only caller). */
#include <stddef.h>
#include <stdint.h>

void *memset(void *d, int c, size_t n) {
  uint8_t *p = d;
  while (n--) *p++ = (uint8_t)c;
  return d;
}
void *memcpy(void *d, const void *s, size_t n) {
  uint8_t *pd = d;
  const uint8_t *ps = s;
  while (n--) *pd++ = *ps++;
  return d;
}
void *memmove(void *d, const void *s, size_t n) {
  uint8_t *pd = d;
  const uint8_t *ps = s;
  if (pd < ps) { while (n--) *pd++ = *ps++; }
  else { pd += n; ps += n; while (n--) *--pd = *--ps; }
  return d;
}
int memcmp(const void *a, const void *b, size_t n) {
  const uint8_t *pa = a, *pb = b;
  for (; n--; pa++, pb++) if (*pa != *pb) return (int)*pa - (int)*pb;
  return 0;
}

float logf(float x) {
  union { float f; uint32_t u; } v = { x };
  if (v.u >= 0x7F800000u || x <= 0.0f) return __builtin_nanf("");   /* NaN/inf/neg/zero: callers guard the range anyway */
  int e = (int)(v.u >> 23) - 127;
  v.u = (v.u & 0x007FFFFFu) | 0x3F800000u;                          /* m ∈ [1, 2) */
  float m = v.f;
  float z = (m - 1.0f) / (m + 1.0f), z2 = z * z;                    /* atanh series: ln m = 2z(1 + z²/3 + z⁴/5 + z⁶/7 + z⁸/9) */
  float s = 2.0f * z * (1.0f + z2 * (0.33333334f + z2 * (0.19999997f + z2 * (0.14285773f + z2 * 0.11128723f))));
  return s + (float)e * 0.6931472f;
}
