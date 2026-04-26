import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RelayMessage } from '../../src/backend/application/use-cases/relay-message.use-case';
import { InMemorySessionStore } from '../../src/backend/adapters/store/in-memory-session.store';
import { EventEmitterBus } from '../../src/backend/adapters/events/event-emitter.bus';
import { IRelayTransport } from '../../src/backend/application/ports/relay-transport.port';
import { RelayEnvelope, EnvelopeType } from '../../src/shared/contracts/v1/envelope';
import { SessionStatus } from '../../src/shared/contracts/v1/session';
import { RELAY_LIMITS } from '../../src/backend/core/constants';

class FakeTransport implements IRelayTransport {
  connectedPeers: Record<string, string[]> = {};
  sentMessages: any[] = [];

  isPeerConnected(sessionId: string, peerId: string): boolean {
    return this.connectedPeers[sessionId]?.includes(peerId) ?? false;
  }

  async send(sessionId: string, peerId: string, payload: any): Promise<void> {
    this.sentMessages.push({ sessionId, peerId, payload });
  }
  
  disconnectSession(sessionId: string): void {}
}

describe('RelayMessage Use Case', () => {
  let store: InMemorySessionStore;
  let transport: FakeTransport;
  let eventBus: EventEmitterBus;
  let relayMessage: RelayMessage;

  beforeEach(() => {
    store = new InMemorySessionStore();
    transport = new FakeTransport();
    eventBus = new EventEmitterBus();
    relayMessage = new RelayMessage(store, transport, eventBus);
  });

  it('should reject if session does not exist', async () => {
    const spy = vi.spyOn(eventBus, 'emit');
    const envelope: RelayEnvelope = {
      sessionId: 'fake-id',
      from: 'peer-a',
      type: EnvelopeType.NOISE_MESSAGE,
      timestamp: Date.now(),
      nonce: 'n1',
      payload: 'abc'
    };

    await relayMessage.execute(envelope);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'EnvelopeRejected',
      payload: expect.objectContaining({ reason: 'Session not found' })
    }));
  });

  it('should reject if timestamp drift is too large', async () => {
    const session = {
      id: 'sess-1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
      lastActivityAt: Date.now(),
      status: SessionStatus.ACTIVE,
      peers: { 'peer-a': { id: 'peer-a', joinedAt: Date.now(), lastSeenAt: Date.now() } },
      pendingPeers: {},
      hostId: 'peer-a',
      hostRecoveryToken: 'token',
      maxPeers: 10,
      participantCount: 1,
      emptySince: Date.now()
    };
    await store.save(session);

    const spy = vi.spyOn(eventBus, 'emit');
    const envelope: RelayEnvelope = {
      sessionId: 'sess-1',
      from: 'peer-a',
      type: EnvelopeType.NOISE_MESSAGE,
      timestamp: Date.now() - RELAY_LIMITS.TIMESTAMP_TOLERANCE_MS - 1000,
      nonce: 'n1',
      payload: 'abc'
    };

    await relayMessage.execute(envelope);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'EnvelopeRejected',
      payload: expect.objectContaining({ reason: 'Timestamp drift too large' })
    }));
  });

  it('should relay message to connected peers', async () => {
    const session = {
      id: 'sess-1',
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
      lastActivityAt: Date.now(),
      status: SessionStatus.ACTIVE,
      peers: { 
        'peer-a': { id: 'peer-a', joinedAt: Date.now(), lastSeenAt: Date.now() },
        'peer-b': { id: 'peer-b', joinedAt: Date.now(), lastSeenAt: Date.now() }
      },
      pendingPeers: {},
      hostId: 'peer-a',
      hostRecoveryToken: 'token',
      maxPeers: 10,
      participantCount: 2,
      emptySince: Date.now()
    };
    await store.save(session);
    transport.connectedPeers['sess-1'] = ['peer-b'];

    const spy = vi.spyOn(eventBus, 'emit');
    const envelope: RelayEnvelope = {
      sessionId: 'sess-1',
      from: 'peer-a',
      type: EnvelopeType.NOISE_MESSAGE,
      timestamp: Date.now(),
      nonce: 'n1',
      payload: 'abc'
    };

    await relayMessage.execute(envelope);

    expect(transport.sentMessages.length).toBe(1);
    expect(transport.sentMessages[0].peerId).toBe('peer-b');
    
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'MessageRelayed',
      payload: expect.objectContaining({ from: 'peer-a' })
    }));
  });
});
