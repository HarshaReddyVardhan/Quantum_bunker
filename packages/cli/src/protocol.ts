// Mirror of src/shared/contracts/v1/envelope.ts — kept local so the CLI package
// is self-contained and publishable on its own. The envelope contract is frozen
// (add-only), so this copy is safe to pin.

export const EnvelopeType = {
  PLAINTEXT: 'plaintext',
  NOISE_MESSAGE: 'noise-message',
  SIGNALING: 'signaling',
  PING: 'ping',
  PONG: 'pong',
  ACK: 'ack',
  READ: 'read',
} as const;

export type EnvelopeTypeValue = (typeof EnvelopeType)[keyof typeof EnvelopeType];

export interface RelayEnvelope {
  sessionId: string;
  from: string;
  type: EnvelopeTypeValue;
  timestamp: number;
  nonce: string;
  payload: string;
}

export function newNonce(): string {
  return Math.random().toString(36).substring(2, 11);
}

export function randomPeerId(): string {
  return `user-${Math.random().toString(36).substring(2, 8)}`;
}
