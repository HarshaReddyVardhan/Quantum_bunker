export type DomainEventType =
  | 'SessionCreated'
  | 'PeerJoined'
  | 'PeerDisconnected'
  | 'MessageRelayed'
  | 'SessionExpired'
  | 'SessionClosed'
  | 'EnvelopeRejected';

export interface DomainEvent<T = any> {
  type: DomainEventType;
  sessionId: string;
  occurredAt: number;
  payload: T;
}

export interface MessageRelayedPayload {
  envelopeType: string;
  byteSize: number;
  from: string;
}

export interface EnvelopeRejectedPayload {
  reason: string;
  rawEnvelope?: any;
}
