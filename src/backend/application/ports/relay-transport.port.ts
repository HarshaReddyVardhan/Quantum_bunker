import { RelayEnvelope } from '../../../shared/contracts/v1/envelope';

export interface IRelayTransport {
  send(sessionId: string, peerId: string, envelope: RelayEnvelope): Promise<void>;
  sendToMany(sessionId: string, peerIds: string[], envelope: RelayEnvelope): Promise<string[]>;
  isPeerConnected(sessionId: string, peerId: string): boolean;
  disconnectSession(sessionId: string): void;
}
