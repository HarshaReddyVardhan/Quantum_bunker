import { describe, it, expect } from 'vitest';
import { CreateSessionRequestSchema, RelayEnvelopeSchema } from '../../src/shared/contracts/v1/schemas';
import { EnvelopeType } from '../../src/shared/contracts/v1/envelope';
import { v4 as uuidv4 } from 'uuid';

describe('Domain Contracts - Schemas', () => {
  it('should accept valid CreateSessionRequests', () => {
    const validPayload = {
      name: 'Secret Vault',
      expiresInSeconds: 3600
    };
    const result = CreateSessionRequestSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('should reject invalid CreateSessionRequests', () => {
    const invalidPayload = {
      name: 'A'.repeat(65), // max 64
      expiresInSeconds: 10 // min 60
    };
    const result = CreateSessionRequestSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it('should parse valid RelayEnvelopes', () => {
    const validEnv = {
      sessionId: uuidv4(),
      from: 'peer-a',
      type: EnvelopeType.NOISE_MESSAGE,
      timestamp: Date.now(),
      nonce: 'unique-nonce-123',
      payload: 'SGVsbG8gV29ybGQ=' // base64 payload
    };
    const result = RelayEnvelopeSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
  });

  it('should reject oversized payloads in RelayEnvelopes', () => {
    const invalidEnv = {
      sessionId: uuidv4(),
      from: 'peer-a',
      type: EnvelopeType.NOISE_MESSAGE,
      timestamp: Date.now(),
      nonce: 'unique-nonce-123',
      payload: 'A'.repeat(16 * 1024 * 1024 + 1) // 16MB + 1 byte (over MAX_PAYLOAD_BYTES)
    };
    const result = RelayEnvelopeSchema.safeParse(invalidEnv);
    expect(result.success).toBe(false);
  });
});
