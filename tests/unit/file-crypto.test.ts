import { describe, it, expect } from 'vitest';
import { encryptFileData, decryptFileData, FileCipher } from '../../src/file-crypto';

const ciphers: FileCipher[] = ['AES-GCM', 'ChaCha20-Poly1305'];

describe('file-crypto password layer', () => {
  for (const algo of ciphers) {
    it(`${algo}: round-trips with the correct password`, async () => {
      const plaintext = new TextEncoder().encode('top secret video bytes');
      const { data, lock } = await encryptFileData(plaintext, 'hunter2', algo);
      expect(lock.algo).toBe(algo);
      const out = await decryptFileData(data, lock, 'hunter2');
      expect(out).not.toBeNull();
      expect(new TextDecoder().decode(out!)).toBe('top secret video bytes');
    });

    it(`${algo}: returns null for a wrong password`, async () => {
      const { data, lock } = await encryptFileData(new Uint8Array([1, 2, 3]), 'correct', algo);
      expect(await decryptFileData(data, lock, 'wrong')).toBeNull();
    });

    it(`${algo}: returns null when the ciphertext is tampered`, async () => {
      const { data, lock } = await encryptFileData(new Uint8Array([9, 9, 9, 9]), 'pw', algo);
      const corrupted = data.slice(0, -2) + (data.endsWith('A') ? 'B' : 'A') + '=';
      expect(await decryptFileData(corrupted, lock, 'pw')).toBeNull();
    });
  }

  it('uses a fresh salt and IV per encryption', async () => {
    const a = await encryptFileData(new Uint8Array([1]), 'pw', 'AES-GCM');
    const b = await encryptFileData(new Uint8Array([1]), 'pw', 'AES-GCM');
    expect(a.lock.salt).not.toBe(b.lock.salt);
    expect(a.lock.iv).not.toBe(b.lock.iv);
    expect(a.data).not.toBe(b.data);
  });
});
