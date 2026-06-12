import { z } from 'zod';
import { EnvelopeType } from './envelope';

export const RelayEnvelopeSchema = z.object({
  sessionId: z.string().uuid(),
  from: z.string().min(1).max(64),
  type: z.nativeEnum(EnvelopeType),
  timestamp: z.number().int().positive(),
  nonce: z.string().min(1).max(128),
  payload: z.string().max(1024 * 1024), // 1MB limit for now
});

export const CreateSessionRequestSchema = z.object({
  name: z.string().max(64).optional(),
  expiresInSeconds: z.number().int().min(60).max(3600 * 24).optional(),
  hostPublicKey: z.string().min(1).max(128).optional(),
});
