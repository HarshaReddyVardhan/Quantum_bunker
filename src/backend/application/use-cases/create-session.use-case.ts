import { v4 as uuidv4 } from 'uuid';
import { Session, SessionStatus } from '../../../shared/contracts/v1/session';
import { SESSION_LIMITS } from '../../core/constants';
import { ISessionStore } from '../ports/session-store.port';
import { IEventBus } from '../ports/event-bus.port';

export class CreateSession {
  constructor(
    private readonly store: ISessionStore,
    private readonly eventBus: IEventBus
  ) {}

  async execute(expiresInSeconds?: number, name?: string): Promise<Session> {
    const ttl = expiresInSeconds 
      ? expiresInSeconds * 1000 
      : SESSION_LIMITS.DEFAULT_TTL_MS;
    
    const actualTtl = Math.min(ttl, SESSION_LIMITS.MAX_TTL_MS);
    
    const hostId = `host-${Math.random().toString(36).substring(2, 8)}`;
    const hostRecoveryToken = uuidv4();
    const sess: Session = {
      id: uuidv4(),
      name,
      createdAt: Date.now(),
      expiresAt: Date.now() + actualTtl,
      lastActivityAt: Date.now(),
      hostId,
      hostRecoveryToken,
      peers: {
        [hostId]: { id: hostId, joinedAt: Date.now(), lastSeenAt: Date.now() }
      },
      pendingPeers: {},
      status: SessionStatus.PENDING,
      maxPeers: SESSION_LIMITS.MAX_PEERS,
      participantCount: 0,
      emptySince: Date.now(),
    };

    await this.store.save(sess);

    this.eventBus.emit({
      type: 'SessionCreated',
      sessionId: sess.id,
      occurredAt: sess.createdAt,
      payload: { expiresAt: sess.expiresAt },
    });

    return sess;
  }
}
