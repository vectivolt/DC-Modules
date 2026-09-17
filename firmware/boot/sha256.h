/* sha256.h — SHA-256 (FIPS 180-4). Portable C99, no heap. The bootloader hashes the image body and the signed header with
 * it; boot_test checks it against node's OpenSSL on vectors across the one- and two-block padding boundaries. */
#ifndef PMP_SHA256_H
#define PMP_SHA256_H
#include <stddef.h>
#include <stdint.h>

typedef struct { uint32_t h[8]; uint64_t bytes; uint8_t buf[64]; uint32_t n; } sha256_t;

void sha256_init(sha256_t *s);
void sha256_update(sha256_t *s, const uint8_t *p, size_t n);
void sha256_final(sha256_t *s, uint8_t out[32]);
void sha256(const uint8_t *p, size_t n, uint8_t out[32]);
#endif
