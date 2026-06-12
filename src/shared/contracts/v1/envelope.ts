export enum EnvelopeType {
  PLAINTEXT = 'plaintext',
  NOISE_MESSAGE = 'noise-message',
  SIGNALING = 'signaling',
  PING = 'ping',
  PONG = 'pong',
  ACK = 'ack',
  READ = 'read',
  EDIT = 'edit',
  DELETE = 'delete',
  FILE = 'file',
}

export interface RelayEnvelope {
  sessionId: string;
  from: string; // Peer identifier (e.g., 'peer-a' or 'peer-b')
  type: EnvelopeType;
  timestamp: number;
  nonce: string; // Anti-replay identifier
  payload: string; // Base64url encoded opaque blob
}
