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
  return randomHex(9);
}

export function randomPeerId(): string {
  return `user-${randomHex(6)}`;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}
