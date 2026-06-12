export const SESSION_LIMITS = {
  MAX_PEERS: 10,
  DEFAULT_TTL_MS: 15 * 60 * 1000, // 15 minutes
  MAX_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  RECONNECT_GRACE_MS: 30 * 1000, // 30 seconds
  INACTIVITY_TTL_MS: 30 * 60 * 1000, // 30 minutes
  EMPTY_SESSION_TTL_MS: 5 * 60 * 1000, // 5 minutes
  MAX_PENDING_PEERS: 10,
};

export const RELAY_LIMITS = {
  // Sized to carry one ~5MB file after base64 + per-peer ratchet ciphertext
  // inflation (~1.8x). Group sends fan out per peer, so very large files in
  // large groups may exceed this and be rejected — that is the intended safety
  // valve protecting the in-memory relay from runaway memory use.
  MAX_PAYLOAD_BYTES: 16 * 1024 * 1024, // 16MB
  // Per-file raw byte cap (client-enforced before encryption). Supports short
  // videos; kept under MAX_PAYLOAD_BYTES to leave room for encoding overhead.
  MAX_FILE_BYTES: 5 * 1024 * 1024, // 5MB
  WS_MAX_FRAME_BYTES: 16 * 1024 * 1024 + 64 * 1024, // envelope payload + JSON overhead
  TIMESTAMP_TOLERANCE_MS: 60 * 1000, // 1 minute drift allowed
  MSG_PER_SECOND_LIMIT: 10,
  SOCKET_MSG_PER_SECOND_LIMIT: 20, // all frame types, incl. control messages
  CONN_PER_IP_LIMIT: parseInt(process.env.RELAY_CONN_PER_IP_LIMIT || '50', 10),
  CONN_WINDOW_MS: 60 * 1000, // 1 minute
  JOIN_TIMEOUT_MS: 10 * 1000, // socket must join within this or be dropped
  MAX_BUFFERED_BYTES: 24 * 1024 * 1024, // skip sends to backpressured sockets
  NONCE_CACHE_MAX: 50_000,
};

export const REST_LIMITS = {
  WINDOW_MS: 60 * 1000,
  SESSION_CREATE_PER_WINDOW: parseInt(process.env.REST_SESSION_CREATE_LIMIT || '10', 10),
  GENERAL_PER_WINDOW: parseInt(process.env.REST_GENERAL_LIMIT || '120', 10),
};

export const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
