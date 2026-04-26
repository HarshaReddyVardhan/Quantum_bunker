import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CleanupSessions } from '../../src/backend/application/use-cases/cleanup-sessions.use-case';
import { InMemorySessionStore } from '../../src/backend/adapters/store/in-memory-session.store';
import { EventEmitterBus } from '../../src/backend/adapters/events/event-emitter.bus';
import { SessionStatus } from '../../src/shared/contracts/v1/session';

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
    const expiredSession = {
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
      emptySince: now - 20000
    };
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
      payload: expect.objectContaining({ reason: 'TTL_EXPIRED' })
    }));
  });
});
