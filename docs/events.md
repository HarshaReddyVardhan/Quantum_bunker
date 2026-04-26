# Events

- **Domain Events**: Handled via `IEventBus`.
- **Core Events**:
  - `SessionCreated`
  - `MessageRelayed`
  - `EnvelopeRejected`
  - `PeerJoined`
  - `SessionExpired`
- **WS Envelopes**:
  - `join`, `joined`, `pending`, `peer_update`, `join_request`, `accept_join`, `reject_join`, `error`
  - `EnvelopeType.ACK`, `EnvelopeType.READ`, `EnvelopeType.PLAINTEXT`, `EnvelopeType.NOISE_MESSAGE`
