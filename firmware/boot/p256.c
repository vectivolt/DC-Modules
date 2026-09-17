/* p256.c — see p256.h. Constants: p, n and their Montgomery companions (R = 2^256) computed with BigInt and cross-checked by
 * boot_test through every signature it verifies. */
#include "p256.h"
#include <stddef.h>
#include <string.h>

typedef struct { const uint32_t *m, *r2, *one; uint32_t minv; } mod_t;   /* modulus · R² mod m · R mod m · −m⁻¹ mod 2^32 */
typedef struct { uint32_t x[8], y[8], z[8]; } pt_t;                     /* Jacobian, Montgomery form; z = 0 is infinity */

static const uint32_t P[8] = { 0xFFFFFFFFu, 0xFFFFFFFFu, 0xFFFFFFFFu, 0x00000000u, 0x00000000u, 0x00000000u, 0x00000001u, 0xFFFFFFFFu };
static const uint32_t P_R2[8] = { 0x00000003u, 0x00000000u, 0xFFFFFFFFu, 0xFFFFFFFBu, 0xFFFFFFFEu, 0xFFFFFFFFu, 0xFFFFFFFDu, 0x00000004u };
static const uint32_t P_ONE[8] = { 0x00000001u, 0x00000000u, 0x00000000u, 0xFFFFFFFFu, 0xFFFFFFFFu, 0xFFFFFFFFu, 0xFFFFFFFEu, 0x00000000u };
static const uint32_t N[8] = { 0xFC632551u, 0xF3B9CAC2u, 0xA7179E84u, 0xBCE6FAADu, 0xFFFFFFFFu, 0xFFFFFFFFu, 0x00000000u, 0xFFFFFFFFu };
static const uint32_t N_R2[8] = { 0xBE79EEA2u, 0x83244C95u, 0x49BD6FA6u, 0x4699799Cu, 0x2B6BEC59u, 0x2845B239u, 0xF3D95620u, 0x66E12D94u };
static const uint32_t N_ONE[8] = { 0x039CDAAFu, 0x0C46353Du, 0x58E8617Bu, 0x43190552u, 0x00000000u, 0x00000000u, 0xFFFFFFFFu, 0x00000000u };
static const uint32_t B_M[8] = { 0x29C4BDDFu, 0xD89CDF62u, 0x78843090u, 0xACF005CDu, 0xF7212ED6u, 0xE5A220ABu, 0x04874834u, 0xDC30061Du };
static const uint32_t GX_M[8] = { 0x18A9143Cu, 0x79E730D4u, 0x5FEDB601u, 0x75BA95FCu, 0x77622510u, 0x79FB732Bu, 0xA53755C6u, 0x18905F76u };
static const uint32_t GY_M[8] = { 0xCE95560Au, 0xDDF25357u, 0xBA19E45Cu, 0x8B4AB8E4u, 0xDD21F325u, 0xD2E88688u, 0x25885D85u, 0x8571FF18u };
static const uint32_t ONE[8] = { 1u, 0u, 0u, 0u, 0u, 0u, 0u, 0u };
static const mod_t MP = { P, P_R2, P_ONE, 0x00000001u }, MN = { N, N_R2, N_ONE, 0xEE00BC4Fu };

static bool is_zero(const uint32_t *a) { uint32_t x = 0u; for (int i = 0; i < 8; i++) x |= a[i]; return x == 0u; }
static int cmp(const uint32_t *a, const uint32_t *b) {
  for (int i = 7; i >= 0; i--) if (a[i] != b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}
static uint32_t add(uint32_t *r, const uint32_t *a, const uint32_t *b) {   /* returns the carry */
  uint64_t c = 0u;
  for (int i = 0; i < 8; i++) { c += (uint64_t)a[i] + b[i]; r[i] = (uint32_t)c; c >>= 32; }
  return (uint32_t)c;
}
static uint32_t sub(uint32_t *r, const uint32_t *a, const uint32_t *b) {   /* returns the borrow */
  uint64_t br = 0u;
  for (int i = 0; i < 8; i++) { uint64_t d = (uint64_t)a[i] - b[i] - br; r[i] = (uint32_t)d; br = (d >> 32) & 1u; }
  return (uint32_t)br;
}
static void mod_add(uint32_t *r, const uint32_t *a, const uint32_t *b, const mod_t *m) {   /* a, b < m */
  uint32_t t[8];
  if (add(t, a, b) || cmp(t, m->m) >= 0) sub(t, t, m->m);
  memcpy(r, t, sizeof t);
}
static void mod_sub(uint32_t *r, const uint32_t *a, const uint32_t *b, const mod_t *m) {
  uint32_t t[8];
  if (sub(t, a, b)) add(t, t, m->m);
  memcpy(r, t, sizeof t);
}
/* a·b·R⁻¹ mod m for a, b < m (CIOS); the result stays below m */
static void mont_mul(uint32_t *r, const uint32_t *a, const uint32_t *b, const mod_t *m) {
  uint32_t t[10] = { 0u };
  for (int i = 0; i < 8; i++) {
    uint64_t c = 0u;
    for (int j = 0; j < 8; j++) { c += (uint64_t)t[j] + (uint64_t)a[j] * b[i]; t[j] = (uint32_t)c; c >>= 32; }
    c += t[8]; t[8] = (uint32_t)c; t[9] = (uint32_t)(c >> 32);
    uint32_t u = t[0] * m->minv;
    c = ((uint64_t)t[0] + (uint64_t)u * m->m[0]) >> 32;
    for (int j = 1; j < 8; j++) { c += (uint64_t)t[j] + (uint64_t)u * m->m[j]; t[j - 1] = (uint32_t)c; c >>= 32; }
    c += t[8]; t[7] = (uint32_t)c;
    t[8] = t[9] + (uint32_t)(c >> 32);
  }
  if (t[8] || cmp(t, m->m) >= 0) sub(t, t, m->m);
  memcpy(r, t, 8u * sizeof t[0]);
}
static void to_mont(uint32_t *r, const uint32_t *a, const mod_t *m) { mont_mul(r, a, m->r2, m); }
static void from_mont(uint32_t *r, const uint32_t *a, const mod_t *m) { mont_mul(r, a, ONE, m); }
static void mont_inv(uint32_t *r, const uint32_t *a, const mod_t *m, void (*poll)(void)) {   /* a^(m−2), Montgomery form in and out; a ≠ 0 */
  static const uint32_t TWO[8] = { 2u, 0u, 0u, 0u, 0u, 0u, 0u, 0u };
  uint32_t e[8], x[8];
  sub(e, m->m, TWO);
  memcpy(x, m->one, sizeof x);
  for (int i = 255; i >= 0; i--) {
    mont_mul(x, x, x, m);
    if ((e[i / 32] >> (i % 32)) & 1u) mont_mul(x, x, a, m);
    if (poll && (i & 15) == 0) poll();                 /* E82 (LV-1): ≤ 32 Montgomery products between services */
  }
  memcpy(r, x, sizeof x);
}

/* dbl-2001-b (a = −3) */
static void pt_dbl(pt_t *r, const pt_t *p) {
  if (is_zero(p->z)) { *r = *p; return; }
  const mod_t *m = &MP;
  uint32_t delta[8], gamma[8], beta[8], alpha[8], t1[8], t2[8];
  pt_t o;
  mont_mul(delta, p->z, p->z, m);
  mont_mul(gamma, p->y, p->y, m);
  mont_mul(beta, p->x, gamma, m);
  mod_sub(t1, p->x, delta, m); mod_add(t2, p->x, delta, m); mont_mul(alpha, t1, t2, m);
  mod_add(t1, alpha, alpha, m); mod_add(alpha, t1, alpha, m);                               /* α = 3(X − δ)(X + δ) */
  mont_mul(o.x, alpha, alpha, m);
  mod_add(t1, beta, beta, m); mod_add(t1, t1, t1, m);                                       /* 4β */
  mod_add(t2, t1, t1, m); mod_sub(o.x, o.x, t2, m);                                         /* X3 = α² − 8β */
  mod_add(o.z, p->y, p->z, m); mont_mul(o.z, o.z, o.z, m); mod_sub(o.z, o.z, gamma, m); mod_sub(o.z, o.z, delta, m);
  mod_sub(t1, t1, o.x, m); mont_mul(o.y, alpha, t1, m);
  mont_mul(t2, gamma, gamma, m); mod_add(t2, t2, t2, m); mod_add(t2, t2, t2, m); mod_add(t2, t2, t2, m);
  mod_sub(o.y, o.y, t2, m);                                                                 /* Y3 = α(4β − X3) − 8γ² */
  *r = o;
}

/* add-2007-bl, with the exceptional cases: P = Q doubles, P = −Q is infinity */
static void pt_add(pt_t *r, const pt_t *p, const pt_t *q) {
  if (is_zero(p->z)) { *r = *q; return; }
  if (is_zero(q->z)) { *r = *p; return; }
  const mod_t *m = &MP;
  uint32_t z1z1[8], z2z2[8], u1[8], u2[8], s1[8], s2[8], h[8], i[8], j[8], rr[8], v[8], t[8];
  pt_t o;
  mont_mul(z1z1, p->z, p->z, m); mont_mul(z2z2, q->z, q->z, m);
  mont_mul(u1, p->x, z2z2, m); mont_mul(u2, q->x, z1z1, m);
  mont_mul(t, q->z, z2z2, m); mont_mul(s1, p->y, t, m);
  mont_mul(t, p->z, z1z1, m); mont_mul(s2, q->y, t, m);
  mod_sub(h, u2, u1, m); mod_sub(rr, s2, s1, m);
  if (is_zero(h)) {
    if (is_zero(rr)) pt_dbl(r, p);
    else memset(r, 0, sizeof *r);
    return;
  }
  mod_add(i, h, h, m); mont_mul(i, i, i, m);                                                /* I = (2H)² */
  mont_mul(j, h, i, m);                                                                     /* J = H·I */
  mod_add(rr, rr, rr, m);                                                                   /* r = 2(S2 − S1) */
  mont_mul(v, u1, i, m);                                                                    /* V = U1·I */
  mont_mul(o.x, rr, rr, m); mod_sub(o.x, o.x, j, m); mod_sub(o.x, o.x, v, m); mod_sub(o.x, o.x, v, m);
  mod_sub(t, v, o.x, m); mont_mul(o.y, rr, t, m);
  mont_mul(t, s1, j, m); mod_add(t, t, t, m); mod_sub(o.y, o.y, t, m);
  mod_add(o.z, p->z, q->z, m); mont_mul(o.z, o.z, o.z, m); mod_sub(o.z, o.z, z1z1, m); mod_sub(o.z, o.z, z2z2, m);
  mont_mul(o.z, o.z, h, m);
  *r = o;
}

static void be_to_w(uint32_t *w, const uint8_t *b) {
  for (int i = 0; i < 8; i++) {
    const uint8_t *q = b + 28 - 4 * i;
    w[i] = (uint32_t)q[0] << 24 | (uint32_t)q[1] << 16 | (uint32_t)q[2] << 8 | q[3];
  }
}

bool p256_verify(const uint8_t pub[64], const uint8_t hash[32], const uint8_t sig[64]) {
  return p256_verify_poll(pub, hash, sig, NULL);
}

bool p256_verify_poll(const uint8_t pub[64], const uint8_t hash[32], const uint8_t sig[64], void (*poll)(void)) {
  uint32_t r[8], s[8], e[8], qx[8], qy[8], t[8], u[8], w[8], u1[8], u2[8];
  be_to_w(r, sig); be_to_w(s, sig + 32); be_to_w(e, hash); be_to_w(qx, pub); be_to_w(qy, pub + 32);
  if (is_zero(r) || is_zero(s) || cmp(r, N) >= 0 || cmp(s, N) >= 0) return false;
  if (cmp(qx, P) >= 0 || cmp(qy, P) >= 0) return false;

  pt_t q, g, x, tab[4];
  to_mont(q.x, qx, &MP); to_mont(q.y, qy, &MP); memcpy(q.z, P_ONE, sizeof q.z);
  mont_mul(t, q.y, q.y, &MP);                                                               /* the key lies on y² = x³ − 3x + b */
  mont_mul(u, q.x, q.x, &MP); mont_mul(u, u, q.x, &MP);
  mod_sub(u, u, q.x, &MP); mod_sub(u, u, q.x, &MP); mod_sub(u, u, q.x, &MP); mod_add(u, u, B_M, &MP);
  if (cmp(t, u) != 0) return false;

  if (cmp(e, N) >= 0) sub(e, e, N);                                                         /* e < 2^256 < 2n */
  to_mont(w, s, &MN); mont_inv(w, w, &MN, poll);                                                  /* w = s⁻¹ */
  to_mont(u1, e, &MN); mont_mul(u1, u1, w, &MN); from_mont(u1, u1, &MN);                   /* u1 = e·w */
  to_mont(u2, r, &MN); mont_mul(u2, u2, w, &MN); from_mont(u2, u2, &MN);                   /* u2 = r·w */

  memcpy(g.x, GX_M, sizeof g.x); memcpy(g.y, GY_M, sizeof g.y); memcpy(g.z, P_ONE, sizeof g.z);
  memset(&tab[0], 0, sizeof tab[0]); tab[1] = g; tab[2] = q; pt_add(&tab[3], &g, &q);
  memset(&x, 0, sizeof x);
  for (int i = 255; i >= 0; i--) {
    pt_dbl(&x, &x);
    unsigned k = ((u1[i / 32] >> (i % 32)) & 1u) | (((u2[i / 32] >> (i % 32)) & 1u) << 1);
    if (k) pt_add(&x, &x, &tab[k]);
    if (poll) poll();                                  /* E82 (LV-1): one ladder step ≈ 50 k instructions ≈ 0.4 ms */
  }
  if (is_zero(x.z)) return false;
  mont_inv(t, x.z, &MP, poll); mont_mul(t, t, t, &MP); mont_mul(t, x.x, t, &MP); from_mont(t, t, &MP);   /* affine x = X / Z² */
  if (cmp(t, N) >= 0) sub(t, t, N);
  return cmp(t, r) == 0;
}
