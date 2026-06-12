import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CleanupSessions } from '../../src/backend/application/use-cases/cleanup-sessions.use-case';
import { InMemorySessionStore } from '../../src/backend/adapters/store/in-memory-session.store';
import { EventEmitterBus } from '../../src/backend/adapters/events/event-emitter.bus';
import { SessionStatus } from '../../src/shared/contracts/v1/session';
import { SESSION_LIMITS } from '../../src/backend/core/constants';

function makeSession(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: 'sess-expired',
    createdAt: now - 20000,
    expiresAt: now - 10000,
    lastActivityAt: now - 20000,
    status: SessionStatus.ACTIVE,
    peers: {},
    pendingPeers: {},
    hostId: 'host-1',
    hostRecoveryToken: 'token',
    maxPeers: 10,
    participantCount: 0,
    emptySince: now - 20000,
    ...overrides,
  };
}

describe('CleanupSessions Use Case', () => {
  let store: InMemorySessionStore;
  let eventBus: EventEmitterBus;
  let cleanupSessions: CleanupSessions;

  beforeEach(() => {
    store = new InMemorySessionStore();
    eventBus = new EventEmitterBus();
    cleanupSessions = new CleanupSessions(store, eventBus);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should remove expired sessions and emit SessionExpired event', async () => {
    const now = Date.now();
    const expiredSession = makeSession();
    await store.save(expiredSession);

    const activeSession = { ...expiredSession, id: 'sess-active', expiresAt: now + 10000 };
    await store.save(activeSession);

    const spy = vi.spyOn(eventBus, 'emit');

    // Simulate time passing slightly to ensure Date.now() > expiresAt
    vi.setSystemTime(now + 100);

    await cleanupSessions.execute();

    const storedExpired = await store.get('sess-expired');
    const storedActive = await store.get('sess-active');

    expect(storedExpired).toBeNull();
    expect(storedActive).toBeDefined();

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'SessionExpired',
      sessionId: 'sess-expired',
      payload: expect.objectContaining({ reason: 'TTL_EXPIRED' }),
    }));
  });

  // ── Reason mapping ─────────────────────────────────────────────────────

  it('emits INACTIVITY_TIMEOUT when session is inactive but not TTL-expired', async () => {
    const now = Date.now();
    const session = makeSession({
      id: 'inactive-sess',
      expiresAt: now + 3600_000, // far future — not TTL-expired
      lastActivityAt: now - SESSION_LIMITS.INACTIVITY_TTL_MS - 1000, // but inactive
      participantCount: 1, // not empty
      emptySince: null,
    });
    await store.save(session);

    const spy = vi.spyOn(eventBus, 'emit');
    await cleanupSessions.execute();

    const evt = spy.mock.calls.find(
      (c: any[]) => c[0]?.sessionId === 'inactive-sess'
    );
    expect(evt).toBeDefined();
    expect(evt![0]).toMatchObject({
      type: 'SessionExpired',
      sessionId: 'inactive-sess',
      payload: { reason: 'INACTIVITY_TIMEOUT' },
    });
  });

  it('emits TTL_EXPIRED when session is past its expiration', async () => {
    const now = Date.now();
    const session = makeSession({
      id: 'ttl-sess',
      expiresAt: now - 1000,
      lastActivityAt: now - 1000, // recently active
    });
    await store.save(session);

    const spy = vi.spyOn(eventBus, 'emit');
    vi.setSystemTime(now + 100);
    await cleanupSessions.execute();

    const evt = spy.mock.calls.find(
      (c: any[]) => c[0]?.sessionId === 'ttl-sess'
    );
    expect(evt).toBeDefined();
    expect(evt![0]).toMatchObject({
      type: 'SessionExpired',
      sessionId: 'ttl-sess',
      payload: { reason: 'TTL_EXPIRED' },
    });
  });

  // ── Multi-session sweep ────────────────────────────────────────────────

  it('emits one event per deleted session when several expire in one sweep', async () => {
    const now = Date.now();
    const s1 = makeSession({ id: 's1', expiresAt: now - 2000 });
    const s2 = makeSession({
      id: 's2',
      expiresAt: now + 3600_000,
      lastActivityAt: now - SESSION_LIMITS.INACTIVITY_TTL_MS - 2000,
      participantCount: 1,
      emptySince: null,
    });
    const s3 = makeSession({ id: 's3', expiresAt: now + 3600_000, lastActivityAt: now });
    await store.save(s1);
    await store.save(s2);
    await store.save(s3);

    const spy = vi.spyOn(eventBus, 'emit');
    await cleanupSessions.execute();

    const sessionIds = spy.mock.calls.map((c: any[]) => c[0]?.sessionId).filter(Boolean);
    expect(sessionIds).toContain('s1');
    expect(sessionIds).toContain('s2');
    expect(sessionIds).not.toContain('s3');
    expect(spy.mock.calls.length).toBe(2);
  });

  it('does not emit any events when nothing is cleaned up', async () => {
    const now = Date.now();
    const session = makeSession({
      expiresAt: now + 3600_000,
      lastActivityAt: now,
    });
    await store.save(session);

    const spy = vi.spyOn(eventBus, 'emit');
    await cleanupSessions.execute();
    expect(spy).not.toHaveBeenCalled();
  });
});