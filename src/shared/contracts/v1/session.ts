export enum SessionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CLOSED = 'closed',
}

export interface SessionPeer {
  id: string;
  joinedAt: number;
  lastSeenAt: number;
  token?: string;
}

export interface PublicSessionInfo {
  id: string;
  name?: string;
  createdAt: number;
  expiresAt: number;
  status: SessionStatus;
  participantCount: number;
  maxPeers: number;
}

export interface Session {
  id: string;
  name?: string;
  createdAt: number;
  expiresAt: number;
  lastActivityAt: number;
  hostId: string;
  hostRecoveryToken: string;
  hostPublicKey?: string; // Ed25519 trust anchor for the membership whitelist
  peers: Record<string, SessionPeer>;
  pendingPeers: Record<string, { id: string; message: string; requestedAt: number }>;
  status: SessionStatus;
  maxPeers: number;
  participantCount: number;
  emptySince: number | null;
  isGroup?: boolean;
}

export interface CreateSessionRequest {
  name?: string;
  expiresInSeconds?: number;
}

export interface CreateSessionResponse {
  sessionId: string;
  name?: string;
  expiresAt: number;
  publicKey: string; // Placeholder for Phase 2
  hostId: string;
  hostRecoveryToken: string;
}

export interface JoinSessionResponse {
  sessionId: string;
  peerId: string;
  status: SessionStatus;
}
