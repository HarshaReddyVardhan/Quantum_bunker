export const SESSION_LIMITS = {
  MAX_PEERS: 10,
  DEFAULT_TTL_MS: 15 * 60 * 1000, // 15 minutes
  MAX_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  RECONNECT_GRACE_MS: 30 * 1000, // 30 seconds
};

export const RELAY_LIMITS = {
  MAX_PAYLOAD_BYTES: 1024 * 1024, // 1MB
  TIMESTAMP_TOLERANCE_MS: 60 * 1000, // 1 minute drift allowed
  MSG_PER_SECOND_LIMIT: 10,
  CONN_PER_IP_LIMIT: 50,
  CONN_WINDOW_MS: 60 * 1000, // 1 minute
};

export const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
