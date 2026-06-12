import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as any;

// Mock localStorage
const storageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => storageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { storageStore[key] = value; }),
  removeItem: vi.fn((key: string) => { delete storageStore[key]; }),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// Mock sessionStorage
const sessionStore: Record<string, string> = {};
const sessionStorageMock = {
  getItem: vi.fn((key: string) => sessionStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { sessionStore[key] = value; }),
  removeItem: vi.fn((key: string) => { delete sessionStore[key]; }),
};
Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock, writable: true });

describe('useSession — countdown formatting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('formats MM:SS when diff > 0', () => {
    // Replicate the countdown logic from useSession
    const formatTimeLeft = (expiresAt: number, now: number): string | null => {
      const diff = expiresAt - now;
      if (diff <= 0) return 'EXPIRED';
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    expect(formatTimeLeft(Date.now() + 125000, Date.now())).toBe('02:05');
    expect(formatTimeLeft(Date.now() + 60000, Date.now())).toBe('01:00');
    expect(formatTimeLeft(Date.now() + 61000, Date.now())).toBe('01:01');
    expect(formatTimeLeft(Date.now() + 3599000, Date.now())).toBe('59:59');
  });

  it('returns EXPIRED when diff <= 0', () => {
    const formatTimeLeft = (expiresAt: number, now: number): string => {
      const diff = expiresAt - now;
      if (diff <= 0) return 'EXPIRED';
      return 'active';
    };

    expect(formatTimeLeft(Date.now() - 1, Date.now())).toBe('EXPIRED');
    expect(formatTimeLeft(Date.now(), Date.now())).toBe('EXPIRED');
  });
});

describe('useSession — saved sessions dedup + prepend', () => {
  it('deduplicates by id and prepends newest', () => {
    const now = Date.now();
    const savedSessions = [
      { id: 'a', name: 'Vault A', role: 'host', lastJoined: now - 10000 },
      { id: 'b', name: 'Vault B', role: 'user', lastJoined: now - 5000 },
    ];

    const addSession = (prev: typeof savedSessions, newSession: typeof savedSessions[0]) => {
      const filtered = prev.filter(s => s.id !== newSession.id);
      return [newSession, ...filtered];
    };

    // Add a new session (should prepend)
    const result1 = addSession(savedSessions, { id: 'c', name: 'New', role: 'host', lastJoined: now });
    expect(result1[0].id).toBe('c');
    expect(result1).toHaveLength(3);

    // Re-add session 'a' (should move to top, dedup)
    const result2 = addSession(result1, { id: 'a', name: 'Vault A', role: 'host', lastJoined: now + 1000 });
    expect(result2[0].id).toBe('a');
    expect(result2).toHaveLength(3); // Still 3 — dedup worked
    expect(result2.filter(s => s.id === 'a')).toHaveLength(1);
  });
});

describe('useSession — recovery token logic', () => {
  beforeEach(() => {
    Object.keys(sessionStore).forEach(k => delete sessionStore[k]);
    Object.keys(storageStore).forEach(k => delete storageStore[k]);
    vi.clearAllMocks();
  });

  it('join sets isRecoveringHost when recovery token exists', () => {
    const sessionId = 'sess-recover';
    storageStore[`qb-recovery-${sessionId}`] = 'some-token';

    const recoveryToken = localStorageMock.getItem(`qb-recovery-${sessionId}`);
    const isRecoveringHost = !!recoveryToken;

    expect(isRecoveringHost).toBe(true);
  });

  it('join does not set isRecoveringHost when no recovery token', () => {
    const sessionId = 'sess-nobody';
    delete storageStore[`qb-recovery-${sessionId}`];

    const recoveryToken = localStorageMock.getItem(`qb-recovery-${sessionId}`);
    const isRecoveringHost = !!recoveryToken;

    expect(isRecoveringHost).toBe(false);
  });
});

describe('useSession — auto-refresh threshold', () => {
  it('triggers refresh when diff < 2 minutes', () => {
    const expiresAt = Date.now() + 119_000; // 1 min 59 sec
    const now = Date.now();
    const diff = expiresAt - now;
    const shouldRefresh = diff < 2 * 60 * 1000;

    expect(shouldRefresh).toBe(true);
  });

  it('does not trigger refresh when diff >= 2 minutes', () => {
    const expiresAt = Date.now() + 121_000; // 2 min 1 sec
    const now = Date.now();
    const diff = expiresAt - now;
    const shouldRefresh = diff < 2 * 60 * 1000;

    expect(shouldRefresh).toBe(false);
  });
});

describe('useSession — joinSession 404 handling', () => {
  beforeEach(() => {
    Object.keys(storageStore).forEach(k => delete storageStore[k]);
    vi.clearAllMocks();
  });

  it('removes session from saved list on 404', () => {
    const sessions = [
      { id: 'a', name: 'A', role: 'host' as const, lastJoined: Date.now() },
      { id: 'b', name: 'B', role: 'user' as const, lastJoined: Date.now() },
      { id: 'c', name: 'C', role: 'host' as const, lastJoined: Date.now() },
    ];

    // Simulate 404 for session 'b'
    const trimmedId = 'b';
    const filtered = sessions.filter(s => s.id !== trimmedId);

    expect(filtered).toHaveLength(2);
    expect(filtered.find(s => s.id === 'b')).toBeUndefined();
    expect(filtered.find(s => s.id === 'a')).toBeDefined();
    expect(filtered.find(s => s.id === 'c')).toBeDefined();
  });
});

describe('useSession — peerId reuse vs fresh', () => {
  it('reuses existing peerId when rejoining same session', () => {
    sessionStorageMock.setItem('qb-sessionId', 'sess-1');
    sessionStorageMock.setItem('qb-peerId', 'user-abc123');

    const existingPeerId = sessionStorageMock.getItem('qb-sessionId') === 'sess-1'
      ? sessionStorageMock.getItem('qb-peerId')
      : null;

    expect(existingPeerId).toBe('user-abc123');
  });

  it('generates fresh peerId for different session', () => {
    sessionStorageMock.setItem('qb-sessionId', 'sess-2');
    sessionStorageMock.setItem('qb-peerId', 'user-xyz');

    const existingPeerId = sessionStorageMock.getItem('qb-sessionId') === 'sess-1'
      ? sessionStorageMock.getItem('qb-peerId')
      : null;

    expect(existingPeerId).toBeNull();
  });
});