import { describe, it, expect } from 'vitest';
import { isOfferer, shouldUseP2P } from '../../src/transport/webrtc-mesh';

describe('isOfferer', () => {
  it('makes the lexicographically-smaller peer the offerer', () => {
    expect(isOfferer('peer-a', 'peer-b')).toBe(true);
    expect(isOfferer('peer-b', 'peer-a')).toBe(false);
  });

  it('agrees with the inverse on the other side (exactly one offerer per pair)', () => {
    expect(isOfferer('peer-a', 'peer-c')).not.toBe(isOfferer('peer-c', 'peer-a'));
  });
});

describe('shouldUseP2P', () => {
  const connected = (ids: string[]) => (id: string) => ids.includes(id);

  it('is false when there are no other peers', () => {
    expect(shouldUseP2P([], connected([]))).toBe(false);
  });

  it('is true only when every other peer has an open channel', () => {
    expect(shouldUseP2P(['peer-b'], connected(['peer-b']))).toBe(true);
    expect(shouldUseP2P(['peer-b', 'peer-c'], connected(['peer-b', 'peer-c']))).toBe(true);
  });

  it('is false when any peer lacks a channel (avoids mixed-mode duplicate delivery)', () => {
    expect(shouldUseP2P(['peer-b', 'peer-c'], connected(['peer-b']))).toBe(false);
    expect(shouldUseP2P(['peer-b'], connected([]))).toBe(false);
  });
});
