import { useCallback, useState } from 'react';
import {
  KeyPairB64,
  MembershipToken,
  issueMembershipToken,
  encodeToken,
  decodeToken,
} from './shared/membership';
import { MEMBER_KEY, HOST_KEY, TOKENS_KEY, loadIdentity, loadTokens } from './membership-store';

// Manages the two long-lived Ed25519 identities (this device as a member, and —
// when hosting — as a vault issuer) plus the wallet of membership tokens the
// user has been granted. Everything lives in localStorage; nothing is sent to
// the server except the host public key (at vault creation) and, at join time,
// the token + a fresh possession proof.
export function useMembership() {
  const [memberIdentity] = useState<KeyPairB64>(() => loadIdentity(MEMBER_KEY));
  const [hostIdentity] = useState<KeyPairB64>(() => loadIdentity(HOST_KEY));
  const [tokens, setTokens] = useState<Record<string, string>>(() => loadTokens());

  const persistTokens = useCallback((next: Record<string, string>) => {
    setTokens(next);
    try {
      localStorage.setItem(TOKENS_KEY, JSON.stringify(next));
    } catch {
      // ignore storage failure
    }
  }, []);

  // Host action: mint an invite for a member's public key, scoped to a vault.
  const issueInvite = useCallback((memberPublicKey: string, sessionId: string, ttlMs?: number): string => {
    const token = issueMembershipToken(hostIdentity.secretKey, memberPublicKey.trim(), sessionId, ttlMs);
    return encodeToken(token);
  }, [hostIdentity]);

  // Member action: store an invite received out-of-band, keyed by its vault.
  const saveToken = useCallback((encoded: string): MembershipToken | null => {
    const token = decodeToken(encoded.trim());
    if (!token) return null;
    persistTokens({ ...tokens, [token.claims.sid]: encoded.trim() });
    return token;
  }, [tokens, persistTokens]);

  const tokenFor = useCallback((sessionId: string): string | null => {
    return tokens[sessionId] || null;
  }, [tokens]);

  const forgetToken = useCallback((sessionId: string) => {
    const next = { ...tokens };
    delete next[sessionId];
    persistTokens(next);
  }, [tokens, persistTokens]);

  return {
    memberIdentity,
    hostPublicKey: hostIdentity.publicKey,
    memberPublicKey: memberIdentity.publicKey,
    tokens,
    issueInvite,
    saveToken,
    tokenFor,
    forgetToken,
  };
}
