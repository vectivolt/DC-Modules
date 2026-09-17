/* sha256.c — see sha256.h. */
#include "sha256.h"
#include <string.h>

static const uint32_t K[64] = {
  0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u, 0x3956c25bu, 0x59f111f1u, 0x923f82a4u, 0xab1c5ed5u,
  0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u, 0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u,
  0xe49b69c1u, 0xefbe4786u, 0x0fc19dc6u, 0x240ca1ccu, 0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
  0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u, 0xc6e00bf3u, 0xd5a79147u, 0x06ca6351u, 0x14292967u,
  0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u, 0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u,
  0xa2bfe8a1u, 0xa81a664bu, 0xc24b8b70u, 0xc76c51a3u, 0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
  0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u, 0x391c0cb3u, 0x4ed8aa4au, 0x5b9cca4fu, 0x682e6ff3u,
  0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u, 0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u };

#define ROR(x, k) (((x) >> (k)) | ((x) << (32 - (k))))

static void block(uint32_t *h, const uint8_t *b) {
  uint32_t w[64];
  for (int i = 0; i < 16; i++) w[i] = (uint32_t)b[4 * i] << 24 | (uint32_t)b[4 * i + 1] << 16 | (uint32_t)b[4 * i + 2] << 8 | b[4 * i + 3];
  for (int i = 16; i < 64; i++)
    w[i] = w[i - 16] + (ROR(w[i - 15], 7) ^ ROR(w[i - 15], 18) ^ (w[i - 15] >> 3)) + w[i - 7] +
           (ROR(w[i - 2], 17) ^ ROR(w[i - 2], 19) ^ (w[i - 2] >> 10));
  uint32_t a = h[0], bb = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
  for (int i = 0; i < 64; i++) {
    uint32_t t1 = hh + (ROR(e, 6) ^ ROR(e, 11) ^ ROR(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i];
    uint32_t t2 = (ROR(a, 2) ^ ROR(a, 13) ^ ROR(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c));
    hh = g; g = f; f = e; e = d + t1; d = c; c = bb; bb = a; a = t1 + t2;
  }
  h[0] += a; h[1] += bb; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
}

void sha256_init(sha256_t *s) {
  static const uint32_t H0[8] = { 0x6a09e667u, 0xbb67ae85u, 0x3c6ef372u, 0xa54ff53au, 0x510e527fu, 0x9b05688cu, 0x1f83d9abu, 0x5be0cd19u };
  memcpy(s->h, H0, sizeof H0);
  s->bytes = 0u; s->n = 0u;
}

void sha256_update(sha256_t *s, const uint8_t *p, size_t n) {
  s->bytes += n;
  while (n > 0u) {
    if (s->n == 0u && n >= 64u) { block(s->h, p); p += 64; n -= 64u; continue; }
    size_t k = 64u - s->n < n ? 64u - s->n : n;
    memcpy(s->buf + s->n, p, k);
    s->n += (uint32_t)k; p += k; n -= k;
    if (s->n == 64u) { block(s->h, s->buf); s->n = 0u; }
  }
}

void sha256_final(sha256_t *s, uint8_t out[32]) {
  uint64_t bits = s->bytes * 8u;
  uint8_t pad = 0x80u;
  sha256_update(s, &pad, 1u);
  pad = 0u;
  while (s->n != 56u) sha256_update(s, &pad, 1u);
  uint8_t len[8];
  for (int i = 0; i < 8; i++) len[i] = (uint8_t)(bits >> (56 - 8 * i));
  sha256_update(s, len, 8u);
  for (int i = 0; i < 8; i++) {
    out[4 * i] = (uint8_t)(s->h[i] >> 24); out[4 * i + 1] = (uint8_t)(s->h[i] >> 16);
    out[4 * i + 2] = (uint8_t)(s->h[i] >> 8); out[4 * i + 3] = (uint8_t)s->h[i];
  }
}

void sha256(const uint8_t *p, size_t n, uint8_t out[32]) {
  sha256_t s;
  sha256_init(&s);
  sha256_update(&s, p, n);
  sha256_final(&s, out);
}
