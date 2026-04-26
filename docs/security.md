# Security & Privacy

- **Zero-knowledge backend**: Server sees envelopes but not contents.
- **Anti-capture**: 
  - UI blackout when window loses focus.
  - Optional message-level blur (strobe/blur animation scoped strictly to text bubbles).
- **Access Control**: Host accepts/rejects joins. Host recovery tokens via `localStorage`.
- **TTL**: Messages disappear client-side after 5 minutes.
