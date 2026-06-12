import { describe, it, expect } from 'vitest';
import {
  bytesEqual,
  toBase64,
  fromBase64,
  utf8,
  fromUtf8,
  hkdf,
  sha256,
  CipherState,
  HASHLEN,
  EMPTY,
} from '../../src/crypto/noise-primitives';

describe('bytesEqual — constant-time comparison', () => {
  it('returns true for equal arrays', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    expect(bytesEqual(a, b)).toBe(true);
  });

  it('returns false for different lengths', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2]);
    expect(bytesEqual(a, b)).toBe(false);
  });

  it('returns false for single-bit flip', () => {
    const a = new Uint8Array([0x00, 0xff, 0xaa]);
    const b = new Uint8Array([0x00, 0xfe, 0xaa]); // differ at byte 1
    expect(bytesEqual(a, b)).toBe(false);
  });

  it('returns true for empty arrays', () => {
    expect(bytesEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });

  it('returns false when one array is empty', () => {
    expect(bytesEqual(new Uint8Array([1]), new Uint8Array(0))).toBe(false);
  });
});

describe('base64 round-trip', () => {
  it('round-trips arbitrary bytes', () => {
    const original = new Uint8Array([0x00, 0xff, 0x7f, 0x80, 0x41]);
    const encoded = toBase64(original);
    const decoded = fromBase64(encoded);
    expect(decoded).toEqual(original);
  });

  it('round-trips empty array', () => {
    const encoded = toBase64(new Uint8Array(0));
    const decoded = fromBase64(encoded);
    expect(decoded).toEqual(new Uint8Array(0));
  });

  it('round-trips text encoded to bytes', () => {
    const text = 'Hello, Quantum Bunker!';
    const bytes = utf8(text);
    const encoded = toBase64(bytes);
    const decoded = fromBase64(encoded);
    expect(fromUtf8(decoded)).toBe(text);
  });
});

describe('utf8 / fromUtf8', () => {
  it('round-trips ASCII', () => {
    const s = 'hello world';
    expect(fromUtf8(utf8(s))).toBe(s);
  });

  it('round-trips Unicode', () => {
    const s = 'Noise_XX_25519_ChaChaPoly_SHA256\u00e9\u2603';
    expect(fromUtf8(utf8(s))).toBe(s);
  });
});

describe('sha256', () => {
  it('produces 32-byte output', () => {
    const hash = sha256(utf8('test'));
    expect(hash).toHaveLength(32);
  });

  it('is deterministic', () => {
    const a = sha256(utf8('test'));
    const b = sha256(utf8('test'));
    expect(bytesEqual(a, b)).toBe(true);
  });

  it('differs for different inputs', () => {
    const a = sha256(utf8('test'));
    const b = sha256(utf8('TEST'));
    expect(bytesEqual(a, b)).toBe(false);
  });
});

describe('hkdf (Noise-style)', () => {
  const ck = new Uint8Array(32).fill(0x01); // chaining key
  const ikm = utf8('input key material');

  it('returns 2 outputs of HASHLEN bytes each', () => {
    const outputs = hkdf(ck, ikm, 2);
    expect(outputs).toHaveLength(2);
    expect(outputs[0]).toHaveLength(HASHLEN);
    expect(outputs[1]).toHaveLength(HASHLEN);
  });

  it('returns 3 outputs of HASHLEN bytes each', () => {
    const outputs = hkdf(ck, ikm, 3);
    expect(outputs).toHaveLength(3);
    expect(outputs[0]).toHaveLength(HASHLEN);
    expect(outputs[1]).toHaveLength(HASHLEN);
    expect(outputs[2]).toHaveLength(HASHLEN);
  });

  it('is deterministic', () => {
    const a = hkdf(ck, ikm, 2);
    const b = hkdf(ck, ikm, 2);
    expect(bytesEqual(a[0], b[0])).toBe(true);
    expect(bytesEqual(a[1], b[1])).toBe(true);
  });

  it('produces different outputs for different chaining keys', () => {
    const ck2 = new Uint8Array(32).fill(0x02);
    const a = hkdf(ck, ikm, 2);
    const b = hkdf(ck2, ikm, 2);
    expect(bytesEqual(a[0], b[0])).toBe(false);
  });

  it('outputs differ from each other', () => {
    const outputs = hkdf(ck, ikm, 3);
    expect(bytesEqual(outputs[0], outputs[1])).toBe(false);
    expect(bytesEqual(outputs[0], outputs[2])).toBe(false);
    expect(bytesEqual(outputs[1], outputs[2])).toBe(false);
  });

  // Verify HKDF determinism and output uniqueness (no specific known-answer
  // for Noise-style HKDF since it's byte-compatible with RFC 5869 with empty
  // info, but the underlying @stablelib/hkdf already passes RFC vectors).
  it('produces consistent outputs for known inputs', () => {
    const ck = new Uint8Array(32).fill(0xaa);
    const ikm = utf8('Noise_XX_25519_ChaChaPoly_SHA256');
    const outputs1 = hkdf(ck, ikm, 3);
    const outputs2 = hkdf(ck, ikm, 3);
    expect(bytesEqual(outputs1[0], outputs2[0])).toBe(true);
    expect(bytesEqual(outputs1[1], outputs2[1])).toBe(true);
    expect(bytesEqual(outputs1[2], outputs2[2])).toBe(true);
  });
});

describe('CipherState', () => {
  const key = sha256(utf8('test-key'));

  it('hasKey returns false without a key', () => {
    const cs = new CipherState();
    expect(cs.hasKey()).toBe(false);
  });

  it('hasKey returns true after initializeKey', () => {
    const cs = new CipherState();
    cs.initializeKey(key);
    expect(cs.hasKey()).toBe(true);
  });

  it('encryptWithAd encrypts and returns ciphertext longer than plaintext', () => {
    const cs = new CipherState();
    cs.initializeKey(key);
    const plaintext = utf8('hello world');
    const ad = utf8('associated data');
    const ciphertext = cs.encryptWithAd(ad, plaintext);
    // ChaCha20-Poly1305 adds 16-byte tag
    expect(ciphertext.length).toBe(plaintext.length + 16);
  });

  it('decryptWithAd recovers the original plaintext', () => {
    const cs = new CipherState();
    cs.initializeKey(key);
    const plaintext = utf8('secret message');
    const ciphertext = cs.encryptWithAd(EMPTY, plaintext);

    const cs2 = new CipherState();
    cs2.initializeKey(key);
    const decrypted = cs2.decryptWithAd(EMPTY, ciphertext);
    expect(bytesEqual(decrypted, plaintext)).toBe(true);
  });

  it('nonce auto-increments on encrypt', () => {
    const cs = new CipherState();
    cs.initializeKey(key);
    const p1 = utf8('msg1');
    const p2 = utf8('msg2');
    const c1 = cs.encryptWithAd(EMPTY, p1);
    const c2 = cs.encryptWithAd(EMPTY, p2);
    // Same plaintext with different nonces => different ciphertexts
    const cs2 = new CipherState();
    cs2.initializeKey(key);
    const c1b = cs2.encryptWithAd(EMPTY, utf8('msg1'));
    const c2b = cs2.encryptWithAd(EMPTY, utf8('msg2'));
    expect(bytesEqual(c1, c1b)).toBe(true);
    // c1 and c2 should differ because different nonces + different plaintexts
    expect(bytesEqual(c1, c2)).toBe(false);
  });

  it('out-of-order decrypt throws NOISE_DECRYPT_FAILED', () => {
    const cs = new CipherState();
    cs.initializeKey(key);
    const p1 = utf8('msg1');
    const p2 = utf8('msg2');
    cs.encryptWithAd(EMPTY, p1);
    const c2 = cs.encryptWithAd(EMPTY, p2);

    // Fresh state: decrypt c2 first (nonce 1 expected, got nonce 0 ciphertext)
    const cs2 = new CipherState();
    cs2.initializeKey(key);
    // Current nonce = 0 but c2 was encrypted with nonce = 1
    expect(() => cs2.decryptWithAd(EMPTY, c2)).toThrow('NOISE_DECRYPT_FAILED');
  });

  it('decrypt fails with wrong key', () => {
    const cs = new CipherState();
    cs.initializeKey(key);
    const ciphertext = cs.encryptWithAd(EMPTY, utf8('msg'));

    const wrongKey = sha256(utf8('wrong-key'));
    const cs2 = new CipherState();
    cs2.initializeKey(wrongKey);
    expect(() => cs2.decryptWithAd(EMPTY, ciphertext)).toThrow('NOISE_DECRYPT_FAILED');
  });

  it('decrypt fails with tampered ciphertext', () => {
    const cs = new CipherState();
    cs.initializeKey(key);
    const ciphertext = cs.encryptWithAd(EMPTY, utf8('msg'));

    // Tamper with the last byte (part of tag)
    const tampered = new Uint8Array(ciphertext);
    tampered[tampered.length - 1] ^= 0x01;

    const cs2 = new CipherState();
    cs2.initializeKey(key);
    expect(() => cs2.decryptWithAd(EMPTY, tampered)).toThrow('NOISE_DECRYPT_FAILED');
  });

  it('passes through plaintext when no key is set', () => {
    const cs = new CipherState();
    const plaintext = utf8('unencrypted');
    const result = cs.encryptWithAd(EMPTY, plaintext);
    expect(bytesEqual(result, plaintext)).toBe(true);
  });

  it('passes through ciphertext when no key is set (decrypt)', () => {
    const cs = new CipherState();
    const ciphertext = utf8('some-data');
    const result = cs.decryptWithAd(EMPTY, ciphertext);
    expect(bytesEqual(result, ciphertext)).toBe(true);
  });
});