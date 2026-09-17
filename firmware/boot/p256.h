/* p256.h — E80 ECDSA over NIST P-256 (FIPS 186-4, SEC 1 §4.1.4), verification only. Portable C99, no heap.
 * Variable time on purpose: every input is public (the public key, the image hash, the signature); nothing secret is handled.
 * Montgomery arithmetic on 8 × 32-bit limbs for both the field and the group order, Jacobian points, Shamir's trick for
 * u1·G + u2·Q with every exceptional addition (equal points, opposite points, the point at infinity) handled.
 * boot_test checks it against node's OpenSSL and an independent BigInt implementation: valid signatures, high-s, mutated
 * hashes and signatures, r or s of 0, n or above, a key off the curve or out of the field, Q = G, Q = −G, e ≥ n and e ≡ 0. */
#ifndef PMP_P256_H
#define PMP_P256_H
#include <stdbool.h>
#include <stdint.h>

/* pub: X ‖ Y, 64 bytes big-endian (uncompressed, no 0x04 prefix) · hash: the 32-byte digest of the signed data ·
   sig: r ‖ s, 64 bytes big-endian (IEEE P1363) */
bool p256_verify(const uint8_t pub[64], const uint8_t hash[32], const uint8_t sig[64]);
#endif
