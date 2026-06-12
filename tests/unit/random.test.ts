import { describe, it, expect } from 'vitest';
import { randomId } from '../../src/random';

describe('randomId', () => {
  it('default 9 bytes produces 18 hex characters', () => {
    const id = randomId();
    expect(id).toHaveLength(18);
    expect(/^[0-9a-f]{18}$/.test(id)).toBe(true);
  });

  it('custom byte length produces 2x hex characters', () => {
    expect(randomId(4)).toHaveLength(8);
    expect(randomId(16)).toHaveLength(32);
    expect(randomId(1)).toHaveLength(2);
  });

  it('preserves leading-zero bytes (0x0a becomes "0a", not "a")', () => {
    // We can't force crypto.getRandomValues to return zeros, but we can
    // verify padStart is used by checking that every character pair
    // is exactly 2 chars wide for many iterations.
    for (let i = 0; i < 100; i++) {
      const id = randomId(9);
      expect(id).toHaveLength(18);
      // Each hex pair should be exactly 2 chars
      for (let j = 0; j < 18; j += 2) {
        expect(id.substring(j, j + 2)).toMatch(/^[0-9a-f]{2}$/);
      }
    }
  });

  it('generates unique values across calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(randomId());
    }
    // All 1000 should be unique
    expect(ids.size).toBe(1000);
  });

  it('zero bytes produces empty string', () => {
    expect(randomId(0)).toBe('');
  });
});