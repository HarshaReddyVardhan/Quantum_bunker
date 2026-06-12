import {
  KeyPairB64,
  generateIdentity,
  createJoinProof,
} from './shared/membership';
import { randomId } from './random';

export const MEMBER_KEY = 'qb-member-identity';
export const HOST_KEY = 'qb-host-identity';
export const TOKENS_KEY = 'qb-membership-tokens';

export function loadIdentity(storageKey: string): KeyPairB64 {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) return JSON.parse(stored) as KeyPairB64;
  } catch {
    // fall through to generate
  }
  const id = generateIdentity();
  try {
    localStorage.setItem(storageKey, JSON.stringify(id));
  } catch {
    // storage unavailable — identity stays in memory for this session
  }
  return id;
}

export function loadTokens(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch {
    // ignore
  }
  return {};
}

// Builds the join-time whitelist credentials for a vault if this device holds a
// membership token for it: the stored token plus a freshly signed possession
// proof. Returns null when no token exists (normal host-approval join).
export function buildJoinCredentials(
  sessionId: string,
  peerId: string
): { membershipToken: string; joinProof: ReturnType<typeof createJoinProof> } | null {
  const tokens = loadTokens();
  const membershipToken = tokens[sessionId];
  if (!membershipToken) return null;
  const member = loadIdentity(MEMBER_KEY);
  const joinProof = createJoinProof(member, sessionId, peerId, randomId());
  return { membershipToken, joinProof };
}
