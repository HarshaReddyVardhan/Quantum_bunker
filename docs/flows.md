# Core Flows

## Session Lifecycle
1. User A creates session (Host).
2. Backend returns `sessionId`, `hostRecoveryToken`, etc.
3. User A shares `sessionId`.
4. User B joins session -> `join_request` via WS.
5. Host accepts/rejects.
6. Both open WS with `sessionId` + `peerId`.

## Messaging
1. Peer sends `RelayEnvelope` (NOISE; plaintext relay is refused).
2. Server validates (no payload inspection; `from` must match the socket identity; duplicate nonces are dropped) -> forwards to target/others.
3. Receiver replies with `ACK` (delivered) and `READ` (seen) envelopes.
4. Each valid message refreshes session inactivity timer.

## Destruction
- Grace period (e.g., 5 mins) after last user leaves.
- Or explicit destroy by Host.
