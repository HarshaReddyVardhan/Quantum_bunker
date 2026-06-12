import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadIdentity,
  loadTokens,
  buildJoinCredentials,
  MEMBER_KEY,
  HOST_KEY,
  TOKENS_KEY,
} from '../../src/membership-store';
import { decodeToken } from '../../src/shared/membership';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// Re-import after mock is set (membership-store uses localStorage at module level)
// Actually, the functions call localStorage directly each time, so this is fine.

describe('loadIdentity', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('returns stored identity when present and valid', () => {
    const identity = { publicKey: 'pub1', secretKey: 'sec1' };
    localStorageMock.setItem(MEMBER_KEY, JSON.stringify(identity));

    const result = loadIdentity(MEMBER_KEY);
    expect(result.publicKey).toBe('pub1');
    expect(result.secretKey).toBe('sec1');
  });

  it('generates a new identity when storage is empty', () => {
    const result = loadIdentity(MEMBER_KEY);
    expect(result.publicKey).toBeDefined();
    expect(result.publicKey).toBeDefined();
    expect(typeof result.publicKey).toBe('string');
    expect(result.publicKey.length).toBeGreaterThan(0);
    expect(result.secretKey).toBeDefined();
    expect(typeof result.secretKey).toBe('string');
    expect(result.secretKey.length).toBeGreaterThan(0);
    // Should persist the newly generated identity
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      MEMBER_KEY,
      expect.any(String)
    );
  });

  it('regenerates on corrupt JSON', () => {
    localStorageMock.setItem(MEMBER_KEY, '{bad json!!!');
    const result = loadIdentity(MEMBER_KEY);
    expect(result.publicKey).toBeDefined();
    // Should have re-persisted
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      MEMBER_KEY,
      expect.any(String)
    );
  });

  it('MEMBER_KEY and HOST_KEY produce independent identities', () => {
    const member = loadIdentity(MEMBER_KEY);
    const host = loadIdentity(HOST_KEY);
    expect(member.publicKey).not.toBe(host.publicKey);
    expect(member.secretKey).not.toBe(host.secretKey);
  });
});

describe('loadTokens', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('returns stored tokens when present', () => {
    const tokens = { 'sess-1': 'token-abc', 'sess-2': 'token-xyz' };
    localStorageMock.setItem(TOKENS_KEY, JSON.stringify(tokens));

    const result = loadTokens();
    expect(result).toEqual(tokens);
  });

  it('returns empty object when nothing is stored', () => {
    const result = loadTokens();
    expect(result).toEqual({});
  });

  it('returns empty object on corrupt JSON', () => {
    localStorageMock.setItem(TOKENS_KEY, 'not json');
    const result = loadTokens();
    expect(result).toEqual({});
  });
});

describe('buildJoinCredentials', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('returns null when no token exists for the session', () => {
    const result = buildJoinCredentials('sess-unknown', 'peer-1');
    expect(result).toBeNull();
  });

  it('returns token + join proof when a token exists', () => {
    // First load an identity to populate the member key
    const member = loadIdentity(MEMBER_KEY);

    // Store a token for the session
    const tokens = { 'sess-1': 'encoded-token-value' };
    localStorageMock.setItem(TOKENS_KEY, JSON.stringify(tokens));

    const result = buildJoinCredentials('sess-1', 'peer-1');
    expect(result).not.toBeNull();
    expect(result!.membershipToken).toBe('encoded-token-value');
    expect(result!.joinProof).toBeDefined();
    expect(result!.joinProof.peerId).toBe('peer-1');
    expect(result!.joinProof.sessionId).toBe('sess-1');
  });
});

describe('useMembership helpers (direct)', () => {
  // Test decodeToken rejection of malformed tokens (called by saveToken)
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('decodeToken returns null for empty string', () => {
    expect(decodeToken('')).toBeNull();
  });

  it('decodeToken returns null for non-base64 garbage', () => {
    expect(decodeToken('!!!not-valid!!!')).toBeNull();
  });

  it('decodeToken returns null for random base64 that is not a valid token', () => {
    // "AAAA" is valid base64 but won't decode to a valid MembershipToken
    expect(decodeToken('AAAA')).toBeNull();
  });
});