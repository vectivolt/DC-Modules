#!/usr/bin/env node
// fw-sign.mjs — signed firmware images for the module bootloader, and the boot test vectors. Node >= 18, node:crypto only.
// The layout is firmware/boot/image.h and the slot addresses come from firmware/port/gd32g553/flash_map.h: the bootloader
// verifies exactly what this tool signs.
//
//   keygen <dir>                         <dir>/private.pem and <dir>/public.pem. A production key is generated and kept offline
//                                        (HSM or an air-gapped machine); only its public half enters a bootloader build.
//   keys <public.pem> <id> [...]         prints the bootloader's key table (C)
//   sign <private.pem> <body.bin> <out.img> --slot A|B --version a.b.c.d --min a.b.c.d [--hw 0x1] [--key-id 0x...]
//                                        body.bin: the application linked for that slot, from its vector table on
//   verify <public.pem> <image> --slot A|B [--key-id 0x...] [--hw 0x1] [--baseline a.b.c.d]
//   vectors <private.pem> <key id>       prints firmware/test/boot_vectors.h: SHA-256 and ECDSA-P256 vectors checked against node's
//                                        OpenSSL and an independent BigInt implementation, and signed test images
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAP = fs.readFileSync(path.join(HERE, "../port/gd32g553/flash_map.h"), "utf8");
const def = (name) => {
  const m = MAP.match(new RegExp(`#define\\s+${name}\\s+(0x[0-9A-Fa-f]+)u`));
  if (!m) throw new Error(`flash_map.h has no ${name}`);
  return Number(m[1]);
};
const FM = { A: def("FM_SLOT_A"), B: def("FM_SLOT_B"), CAP: def("FM_SLOT_SIZE"), HDR: 0x200, SRAM_LO: 0x20000000, SRAM_HI: 0x20018000 };
const MAGIC = 0x49504d50;

// ---------------------------------------------------------------------------------------------------------- BigInt P-256
const P = 2n ** 256n - 2n ** 224n + 2n ** 192n + 2n ** 96n - 1n;
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
const G = [0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n, 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n];
const md = (a, m) => ((a % m) + m) % m;
function inv(a, m) {
  let [t, nt, r, nr] = [0n, 1n, m, md(a, m)];
  while (nr !== 0n) { const q = r / nr; [t, nt] = [nt, t - q * nt]; [r, nr] = [nr, r - q * nr]; }
  return md(t, m);
}
function padd(p1, p2) {   // affine; null is the point at infinity
  if (!p1) return p2;
  if (!p2) return p1;
  const [x1, y1] = p1, [x2, y2] = p2;
  let l;
  if (x1 === x2) {
    if (md(y1 + y2, P) === 0n) return null;
    l = md((3n * x1 * x1 - 3n) * inv(2n * y1, P), P);
  } else l = md((y2 - y1) * inv(x2 - x1, P), P);
  const x3 = md(l * l - x1 - x2, P);
  return [x3, md(l * (x1 - x3) - y1, P)];
}
function pmul(k, pt) { let r = null, a = pt; while (k > 0n) { if (k & 1n) r = padd(r, a); a = padd(a, a); k >>= 1n; } return r; }
const onCurve = ([x, y]) => x < P && y < P && md(y * y - (x * x * x - 3n * x + B), P) === 0n;
const big = (buf) => BigInt("0x" + (Buffer.from(buf).toString("hex") || "0"));
const b32 = (v) => Buffer.from(v.toString(16).padStart(64, "0"), "hex");
const sha = (b) => crypto.createHash("sha256").update(b).digest();

function bnVerify(pub, hash, sig) {
  const Q = [big(pub.subarray(0, 32)), big(pub.subarray(32))], r = big(sig.subarray(0, 32)), s = big(sig.subarray(32)), e = big(hash);
  if (r <= 0n || r >= N || s <= 0n || s >= N || !onCurve(Q)) return false;
  const w = inv(s, N), X = padd(pmul(md(e * w, N), G), pmul(md(r * w, N), Q));
  return X !== null && md(X[0], N) === r;
}
function bnSign(d, hash) {
  const e = big(hash);
  for (;;) {
    const k = md(big(crypto.randomBytes(32)), N - 1n) + 1n;
    const r = md(pmul(k, G)[0], N);
    if (r === 0n) continue;
    const s = md(inv(k, N) * (e + r * d), N);
    if (s === 0n) continue;
    return Buffer.concat([b32(r), b32(s)]);
  }
}
const pubOf = (key) => {   // a public KeyObject as it is; a private key or a PEM through createPublicKey
  const k = key instanceof crypto.KeyObject && key.type === "public" ? key : crypto.createPublicKey(key);
  const j = k.export({ format: "jwk" });
  return Buffer.concat([Buffer.from(j.x, "base64url"), Buffer.from(j.y, "base64url")]);
};

// ---------------------------------------------------------------------------------------------------------------- images
const ver = (s) => {
  const p = String(s).split(".").map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) throw new Error(`version "${s}" is not a.b.c.d (0-255)`);
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
};
const slotBase = (slot) => { if (slot !== "A" && slot !== "B") throw new Error("--slot A or B"); return FM[slot]; };

export function buildImage(priv, keyId, body, slot, version, minVersion, hw) {
  const load = slotBase(slot) + FM.HDR;
  if (body.length < 0x40 || body.length > FM.CAP - FM.HDR) throw new Error(`body ${body.length} bytes: outside 64 .. ${FM.CAP - FM.HDR}`);
  const sp = body.readUInt32LE(0), reset = body.readUInt32LE(4) & ~1;
  if (sp < FM.SRAM_LO || sp > FM.SRAM_HI) throw new Error(`initial SP 0x${sp.toString(16)} is not in SRAM — not a vector table`);
  if (reset < load || reset >= load + body.length) throw new Error(`reset vector 0x${reset.toString(16)} is outside slot ${slot} — the body is linked for the other slot`);
  if (minVersion > version) throw new Error("the minimum version is above the version");
  const h = Buffer.alloc(FM.HDR, 0xff);
  h.writeUInt32LE(MAGIC, 0); h.writeUInt16LE(1, 4); h.writeUInt16LE(FM.HDR, 6);
  h.writeUInt32LE(body.length, 8); h.writeUInt32LE(load >>> 0, 12); h.writeUInt32LE(version >>> 0, 16);
  h.writeUInt32LE(minVersion >>> 0, 20); h.writeUInt32LE(hw >>> 0, 24); h.writeUInt32LE(keyId >>> 0, 28);
  sha(body).copy(h, 32);
  crypto.sign("sha256", h.subarray(0, 64), { key: priv, dsaEncoding: "ieee-p1363" }).copy(h, 64);
  return Buffer.concat([h, body]);
}

export function checkImage(pub, keyId, img, slot, hw = 1, baseline = 0) {   // image.c's order and codes
  if (img.length < FM.HDR) return 2;
  if (img.readUInt32LE(0) !== MAGIC || img.readUInt16LE(4) !== 1 || img.readUInt16LE(6) !== FM.HDR) return 1;
  const size = img.readUInt32LE(8), load = img.readUInt32LE(12), v = img.readUInt32LE(16), mv = img.readUInt32LE(20);
  if (size < 0x40 || size > Math.min(img.length, FM.CAP) - FM.HDR) return 2;
  if (load !== slotBase(slot) + FM.HDR) return 3;
  if ((img.readUInt32LE(24) & hw) === 0) return 4;
  if (v < baseline || mv > v) return 5;
  if (img.readUInt32LE(28) !== keyId >>> 0) return 6;
  if (!bnVerify(pub, sha(img.subarray(0, 64)), img.subarray(64, 128))) return 7;
  if (!sha(img.subarray(FM.HDR, FM.HDR + size)).equals(img.subarray(32, 64))) return 8;
  return 0;
}

// -------------------------------------------------------------------------------------------------------------- C output
const hex = (buf, indent = "  ") => {
  const out = [];
  for (let i = 0; i < buf.length; i += 16) out.push(indent + [...buf.subarray(i, i + 16)].map((x) => `0x${x.toString(16).padStart(2, "0")}`).join(", ") + ",");
  return out.join("\n");
};
const u32 = (x) => `0x${(x >>> 0).toString(16).toUpperCase().padStart(8, "0")}u`;
const opt = (args, name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };

function keysTable(pairs, title) {
  let s = `/* ${title} — GENERATED by firmware/tools/fw-sign.mjs keys. DO NOT EDIT. */\n`;
  s += `static const img_key_t BOOT_KEYS[] = {\n`;
  for (const [pem, id] of pairs) s += `  { ${u32(Number(id))}, {\n${hex(pubOf(fs.readFileSync(pem)), "    ")}\n  } },\n`;
  return s + `};\n#define BOOT_N_KEYS ((uint32_t)(sizeof BOOT_KEYS / sizeof BOOT_KEYS[0]))\n`;
}

function vectors(privPem, keyIdArg) {
  const priv = crypto.createPrivateKey(fs.readFileSync(privPem)), pub = pubOf(priv), keyId = Number(keyIdArg);
  let o = "/* boot_vectors.h — GENERATED by firmware/tools/fw-sign.mjs vectors. DO NOT EDIT.\n";
  o += " * SHA-256 digests from node's OpenSSL; ECDSA-P256 vectors each checked here against an independent BigInt implementation\n";
  o += " * (node-signed and BigInt-signed, high-s, mutations, out-of-range r and s, bad keys, special keys and digests); signed images\n";
  o += " * under the development key for image.c, bootctl.c and the service protocol. */\n";
  o += "typedef struct { uint16_t len; const uint8_t *msg; uint8_t digest[32]; } bv_sha_t;\n";
  o += "typedef struct { const char *what; uint8_t pub[64], hash[32], sig[64]; bool ok; } bv_ecdsa_t;\n";
  o += "typedef struct { const char *what; char slot; uint32_t len; const uint8_t *img; } bv_img_t;\n\n";

  const msgs = [Buffer.from("abc"), Buffer.alloc(0), ...[1, 55, 56, 63, 64, 65, 111, 119, 120, 1000].map((n) => Buffer.from(Array.from({ length: n }, (_, i) => (i * 7 + 3) & 255)))];
  msgs.forEach((m, i) => { o += `static const uint8_t BV_MSG${i}[] = {\n${m.length ? hex(m) : "  0x00,"}\n};\n`; });
  o += `static const bv_sha_t BV_SHA[] = {\n${msgs.map((m, i) => `  { ${m.length}u, BV_MSG${i}, {\n${hex(sha(m), "    ")}\n  } },`).join("\n")}\n};\n\n`;

  const ev = [];
  const add = (what, q, hash, sig, ok) => {
    if (bnVerify(q, hash, sig) !== ok) throw new Error(`the BigInt reference disagrees with the expectation: ${what}`);
    ev.push({ what, q, hash, sig, ok });
  };
  const rs = (r, s) => Buffer.concat([b32(r), b32(s)]);
  for (let i = 0; i < 16; i++) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const q = pubOf(publicKey), msg = crypto.randomBytes(1 + ((i * 37) % 200)), hash = sha(msg);
    const sig = crypto.sign("sha256", msg, { key: privateKey, dsaEncoding: "ieee-p1363" });
    add(`node-signed ${i}`, q, hash, sig, true);
    const d = big(Buffer.from(privateKey.export({ format: "jwk" }).d, "base64url"));
    const s2 = bnSign(d, hash);
    if (!crypto.verify("sha256", msg, { key: publicKey, dsaEncoding: "ieee-p1363" }, s2)) throw new Error("node rejects the BigInt signer");
    add(`BigInt-signed ${i}`, q, hash, s2, true);
    if (i < 4) {
      const R = big(sig.subarray(0, 32)), S = big(sig.subarray(32));
      add(`high-s ${i}`, q, hash, rs(R, N - S), true);
      const h1 = Buffer.from(hash); h1[31 - i] ^= 1 << i; add(`hash bit flip ${i}`, q, h1, sig, false);
      const r1 = Buffer.from(sig); r1[i] ^= 0x80; add(`r bit flip ${i}`, q, hash, r1, false);
      const s1 = Buffer.from(sig); s1[63 - i] ^= 1; add(`s bit flip ${i}`, q, hash, s1, false);
      add(`r and s swapped ${i}`, q, hash, rs(S, R), false);
    }
    if (i === 0) {
      const R = big(sig.subarray(0, 32)), S = big(sig.subarray(32));
      add("another key", pubOf(crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey), hash, sig, false);
      const off = Buffer.from(q); off[63] ^= 1; add("key off the curve", off, hash, sig, false);
      add("key x = p", Buffer.concat([b32(P), q.subarray(32)]), hash, sig, false);
      add("key all zero", Buffer.alloc(64), hash, sig, false);
      add("r = 0", q, hash, rs(0n, S), false); add("s = 0", q, hash, rs(R, 0n), false);
      add("r = n", q, hash, rs(N, S), false); add("s = n", q, hash, rs(R, N), false);
      add("r = s = 2^256 - 1", q, hash, rs(2n ** 256n - 1n, 2n ** 256n - 1n), false);
    }
  }
  for (const [what, d] of [["Q = G (d = 1)", 1n], ["Q = -G (d = n - 1)", N - 1n], ["Q = 2G (d = 2)", 2n]]) {
    const Q = pmul(d, G), q = Buffer.concat([b32(Q[0]), b32(Q[1])]), hash = sha(Buffer.from(what));
    add(what, q, hash, bnSign(d, hash), true);
  }
  const dd = md(big(crypto.randomBytes(32)), N - 1n) + 1n, Qd = pmul(dd, G), qd = Buffer.concat([b32(Qd[0]), b32(Qd[1])]);
  for (const [what, e] of [["e = n + 5", N + 5n], ["e = 2^256 - 1", 2n ** 256n - 1n], ["e = n (u1 = 0)", N], ["e = 0 (u1 = 0)", 0n]]) {
    const hash = b32(e), sig = bnSign(dd, hash);
    add(what, qd, hash, sig, true);
    const bad = Buffer.from(hash); bad[31] ^= 1; add(`${what}, digest mutated`, qd, bad, sig, false);
  }
  o += `static const bv_ecdsa_t BV_ECDSA[] = {\n${ev.map((v) => `  { "${v.what}", {\n${hex(v.q, "    ")}\n  }, {\n${hex(v.hash, "    ")}\n  }, {\n${hex(v.sig, "    ")}\n  }, ${v.ok} },`).join("\n")}\n};\n\n`;

  const body = (slot, n, seed) => {
    const b = Buffer.alloc(n);
    for (let i = 0; i < n; i++) b[i] = (i * 13 + seed) & 255;
    b.writeUInt32LE(0x20014000, 0); b.writeUInt32LE((FM[slot] + FM.HDR + 0x101) >>> 0, 4);
    return b;
  };
  const foreign = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey;
  const imgs = [
    ["A_V1", "A", buildImage(priv, keyId, body("A", 700, 7), "A", ver("1.0.0.1"), ver("1.0.0.0"), 1), 0],
    ["B_V2", "B", buildImage(priv, keyId, body("B", 700, 9), "B", ver("1.1.0.0"), ver("1.1.0.0"), 1), 0],
    ["A_V09", "A", buildImage(priv, keyId, body("A", 700, 11), "A", ver("0.9.0.0"), ver("0.9.0.0"), 1), 0],
    ["B_HW2", "B", buildImage(priv, keyId, body("B", 700, 13), "B", ver("1.2.0.0"), ver("1.0.0.0"), 2), 4],
    ["B_FOREIGN", "B", buildImage(foreign, keyId, body("B", 700, 15), "B", ver("1.2.0.0"), ver("1.0.0.0"), 1), 7],
    ["B_UNKNOWN_KEY", "B", buildImage(foreign, 0x12345678, body("B", 700, 17), "B", ver("1.2.0.0"), ver("1.0.0.0"), 1), 6],
    ["B_BIG", "B", buildImage(priv, keyId, body("B", 2600, 19), "B", ver("1.2.0.0"), ver("1.0.0.0"), 1), 0],
  ];
  for (const [name, slot, img, want] of imgs) {
    const got = checkImage(pub, keyId, img, slot);
    if (got !== want) throw new Error(`image ${name}: the reference check gives ${got}, expected ${want}`);
    o += `static const uint8_t BV_IMG_${name}[] = {\n${hex(img)}\n};\n`;
  }
  o += `#define BV_KEY_ID ${u32(keyId)}\n`;
  o += `static const uint8_t BV_PUB[64] = {\n${hex(pub)}\n};\n`;
  o += `enum { ${imgs.map(([n]) => `BV_${n}`).join(", ")} };\n`;
  o += `static const bv_img_t BV_IMG[] = {\n${imgs.map(([n, slot, img]) => `  { "${n}", '${slot}', ${img.length}u, BV_IMG_${n} },`).join("\n")}\n};\n`;
  return o;
}

// ------------------------------------------------------------------------------------------------------------------ main
const [cmd, ...args] = process.argv.slice(2);
if (cmd === "keygen") {
  const dir = args[0];
  if (!dir) throw new Error("keygen <dir>");
  fs.mkdirSync(dir, { recursive: true });
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  if (fs.existsSync(path.join(dir, "private.pem"))) throw new Error(`${dir}/private.pem exists — refusing to replace a key`);
  fs.writeFileSync(path.join(dir, "private.pem"), privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  fs.writeFileSync(path.join(dir, "public.pem"), publicKey.export({ type: "spki", format: "pem" }));
  console.log(`P-256 key pair written to ${dir}`);
} else if (cmd === "keys") {
  const pairs = [];
  for (let i = 0; i + 1 < args.length; i += 2) pairs.push([args[i], args[i + 1]]);
  if (!pairs.length) throw new Error("keys <public.pem> <id> [...]");
  process.stdout.write(keysTable(pairs, "keys"));
} else if (cmd === "sign") {
  const [privPem, bodyPath, outPath] = args;
  const priv = crypto.createPrivateKey(fs.readFileSync(privPem));
  const img = buildImage(priv, Number(opt(args, "--key-id", "0xDE000001")), fs.readFileSync(bodyPath), opt(args, "--slot"),
    ver(opt(args, "--version")), ver(opt(args, "--min")), Number(opt(args, "--hw", "0x1")));
  const bad = checkImage(pubOf(priv), Number(opt(args, "--key-id", "0xDE000001")), img, opt(args, "--slot"), Number(opt(args, "--hw", "0x1")));
  if (bad) throw new Error(`self-check of the signed image failed: ${bad}`);
  fs.writeFileSync(outPath, img);
  console.log(`${outPath}: slot ${opt(args, "--slot")} · ${img.length} bytes · version ${opt(args, "--version")} · min ${opt(args, "--min")}`);
} else if (cmd === "verify") {
  const [pubPem, imgPath] = args;
  const r = checkImage(pubOf(fs.readFileSync(pubPem)), Number(opt(args, "--key-id", "0xDE000001")), fs.readFileSync(imgPath), opt(args, "--slot"),
    Number(opt(args, "--hw", "0x1")), opt(args, "--baseline") ? ver(opt(args, "--baseline")) : 0);
  console.log(r === 0 ? "IMAGE OK" : `IMAGE REJECTED: code ${r} (image.h IMG_E_*)`);
  process.exit(r === 0 ? 0 : 1);
} else if (cmd === "vectors") {
  process.stdout.write(vectors(args[0], args[1]));
} else {
  console.log("usage: fw-sign.mjs keygen | keys | sign | verify | vectors (see the header of this file)");
  process.exit(2);
}
