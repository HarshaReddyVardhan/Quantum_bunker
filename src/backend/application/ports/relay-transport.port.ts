import { RelayEnvelope } from '../../../shared/contracts/v1/envelope';

export interface IRelayTransport {
  send(sessionId: string, peerId: string, envelope: RelayEnvelope): Promise<void>;
  isPeerConnected(sessionId: string, peerId: string): boolean;
  disconnectSession(sessionId: string): void;
}
