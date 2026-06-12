# Events

- **Domain Events**: Handled via `IEventBus`.
- **Core Events**:
  - `SessionCreated`
  - `MessageRelayed`
  - `EnvelopeRejected` — `rawEnvelope.payload` is always redacted before emission (zero-knowledge invariant; the event bus logs automatically)
  - `PeerJoined`
  - `SessionExpired`
- **WS Envelopes**:
  - `join`, `joined`, `pending`, `peer_update`, `join_request`, `accept_join`, `reject_join`, `kick_peer`, `error`
  - `EnvelopeType.ACK`, `EnvelopeType.READ`, `EnvelopeType.NOISE_MESSAGE` (`PLAINTEXT` exists in the frozen contract but the relay refuses to forward it)

## Join authentication

- `join` accepts `hostRecoveryToken` (claims host authority) and `peerToken` (re-claims an admitted peer identity).
- `joined` returns a `peerToken` issued at admission. Clients must present it to rejoin with the same `peerId`; a bare `peerId` proves nothing.
- Envelope `from` must match the socket's authenticated peer identity; mismatches are rejected with `SENDER_MISMATCH`.

## Stateless whitelist

- Create a vault with `hostPublicKey` (Ed25519, base64url) to enable the whitelist.
- The host issues a `MembershipToken` (signs a member public key + vault id). The member stores it and, on `join`, sends `membershipToken` + a `joinProof` (member-signed `sessionId|peerId|timestamp|nonce`).
- The server verifies both signatures against the session's `hostPublicKey`, dedupes the proof nonce, and auto-admits (`joined` with `viaMembership: true`) — no host approval, nothing persisted. Failures return `INVALID_MEMBERSHIP`.
- Pure crypto lives in `src/shared/membership.ts`; client identity/token wallet in `src/useMembership.ts` + `src/membership-store.ts`.
