import { RelayEnvelope } from '../../../shared/contracts/v1/envelope';
import { RelayPolicy } from '../../core/policies/relay.policy';
import { ISessionStore } from '../ports/session-store.port';
import { IEventBus } from '../ports/event-bus.port';
import { IRelayTransport } from '../ports/relay-transport.port';

export class RelayMessage {
  constructor(
    private readonly store: ISessionStore,
    private readonly transport: IRelayTransport,
    private readonly eventBus: IEventBus
  ) {}

  async execute(envelope: RelayEnvelope): Promise<void> {
    const session = await this.store.get(envelope.sessionId);
    if (!session) {
      this.reject('Session not found', envelope);
      return;
    }

    const validation = RelayPolicy.validate(envelope);
    if (!validation.valid) {
      this.reject(validation.reason || 'Invalid envelope', envelope);
      return;
    }

    const destinationPeers = Object.keys(session.peers).filter(id => id !== envelope.from);
    if (destinationPeers.length === 0) {
      this.reject('Recipient not joined', envelope);
      return;
    }

    let relayed = false;
    for (const destId of destinationPeers) {
      if (this.transport.isPeerConnected(session.id, destId)) {
        await this.transport.send(session.id, destId, envelope);
        relayed = true;
      }
    }

    if (!relayed) {
      this.reject('Recipient offline', envelope);
      return;
    }

    await this.store.touch(session.id);

    this.eventBus.emit({
      type: 'MessageRelayed',
      sessionId: session.id,
      occurredAt: Date.now(),
      payload: {
        envelopeType: envelope.type,
        byteSize: JSON.stringify(envelope).length,
        from: envelope.from,
      },
    });
  }

  private reject(reason: string, envelope: RelayEnvelope) {
    this.eventBus.emit({
      type: 'EnvelopeRejected',
      sessionId: envelope.sessionId,
      occurredAt: Date.now(),
      payload: { reason, rawEnvelope: envelope },
    });
  }
}
