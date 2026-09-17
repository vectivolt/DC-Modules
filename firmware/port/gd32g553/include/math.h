/* math.h — freestanding math for the target (Homebrew arm-none-eabi-gcc ships no newlib). Everything the firmware
 * calls maps to an FPU instruction or a builtin except logf (lib.c) and floor (below). -fno-math-errno lets sqrtf
 * compile to VSQRT; fminf/fmaxf compile to VMINNM/VMAXNM on the M33. */
#ifndef PORT_MATH_H
#define PORT_MATH_H
#define isfinite(x) __builtin_isfinite(x)
#define isnan(x) __builtin_isnan(x)
#define isinf(x) __builtin_isinf(x)
#define NAN __builtin_nanf("")
#define INFINITY __builtin_inff()
static inline float fabsf(float x) { return __builtin_fabsf(x); }
static inline float sqrtf(float x) { return __builtin_sqrtf(x); }
static inline float fminf(float a, float b) { return (a < b || __builtin_isnan(b)) ? a : b; }
static inline float fmaxf(float a, float b) { return (a > b || __builtin_isnan(b)) ? a : b; }
float logf(float x);   /* lib.c */
static inline double floor(double x) {   /* frame.c's round-half-up; |x| < 2^31 in every caller (saturating encoders) */
  long long i = (long long)x;
  return (x < 0.0 && (double)i != x) ? (double)(i - 1) : (double)i;
}
#endif
