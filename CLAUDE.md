# CLAUDE.md — Quantum Bunker

## What This Project Is

**Quantum Bunker** is a zero-knowledge, ephemeral, real-time messaging vault. The server is a blind relay — it never decrypts, logs, or stores message payloads. Sessions are in-memory only and auto-expire. Clients handle all cryptographic meaning; the server only routes opaque envelopes.

Full-stack TypeScript monorepo: React 19 frontend + Express/ws backend, single port, shared domain contracts.

---

## Architecture in One Page

```
src/
├── shared/contracts/v1/        ← Single source of truth for all types/schemas
│   ├── envelope.ts             ← RelayEnvelope, EnvelopeType
│   ├── events.ts               ← DomainEvent<T> union types
│   ├── session.ts              ← Session, SessionPeer, SessionStatus
│   └── schemas.ts              ← Zod schemas (validate at boundaries only)
│
├── backend/                    ← Hexagonal / Ports-and-Adapters
│   ├── entrypoints/
│   │   └── container.ts        ← DI wiring — the only place adapters are constructed
│   ├── application/
│   │   ├── ports/              ← Interfaces only (no implementations)
│   │   │   ├── session-store.port.ts
│   │   │   ├── relay-transport.port.ts
│   │   │   └── event-bus.port.ts
│   │   └── use-cases/          ← Pure business logic, depend only on ports
│   │       ├── create-session.use-case.ts
│   │       ├── relay-message.use-case.ts
│   │       └── cleanup-sessions.use-case.ts
│   ├── adapters/               ← Concrete implementations of ports
│   │   ├── store/in-memory-session.store.ts
│   │   ├── transport/ws.transport.ts
│   │   ├── events/event-emitter.bus.ts
│   │   └── logging/winston.logger.ts
│   └── core/
│       ├── constants.ts        ← All numeric limits live here
│       └── policies/relay.policy.ts  ← Validation rules for envelopes
│
├── App.tsx                     ← Root UI: home view + chat view
├── useSession.ts               ← Session lifecycle hook (create/join/refresh/destroy)
├── useRelay.ts                 ← WebSocket hook (connect/send/receive/receipts)
└── index.css                   ← Tailwind base

server.ts                       ← Express + Vite middleware + WS + cleanup scheduler
```

**Rule:** Use cases import only ports. Adapters import use cases and ports. Container imports everything. Nothing else imports adapters directly.

---

## Coding Standards

### TypeScript
- Strict mode always (`"strict": true` in tsconfig)
- No `any` — use `unknown` with a type guard if the shape is truly unknown
- Prefer `type` over `interface` for object shapes; use `interface` only when extension is intentional
- Exhaustive `switch` on discriminated unions — add a `default: assertNever(x)` guard
- No implicit returns in functions with meaningful return types

### Files & Modules
- One concept per file — use cases, ports, adapters are never bundled together
- File names: `kebab-case.ts`, never PascalCase for files
- Barrel files (`index.ts`) only where there are ≥3 exports from the same logical group
- Max ~200 lines per file; if longer, split by responsibility

### Functions
- Pure functions for all use-case logic (no side effects in use cases — emit events instead)
- Async functions return `Promise<T>`, never `Promise<any>`
- Guard clauses first, happy path last
- No functions longer than ~40 lines; extract named helpers

### Comments
- Write zero comments by default
- Only comment when the **why** is non-obvious: a hidden constraint, a policy choice, a protocol quirk
- Never comment what the code does — name it well instead

### Error Handling
- Use cases throw typed errors with a `code` field (e.g., `SESSION_NOT_FOUND`, `PEER_LIMIT_REACHED`)
- Transport adapters catch and translate to WS error frames or HTTP status codes
- Never swallow errors silently — at minimum, emit an `EnvelopeRejected` event

### React / Frontend
- Functional components only, no class components
- Custom hooks (`useSession`, `useRelay`) own all side effects; components stay declarative
- State that persists across hard refreshes → `sessionStorage` (session) or `localStorage` (preferences)
- No global state library — hooks pass data via props or context where needed
- Tailwind only — no inline `style={}` unless strictly dynamic (e.g., animation values)

---

## Domain Rules — Never Break These

1. **Zero-knowledge invariant**: The server MUST NOT log, inspect, or store `envelope.payload` contents. It is an opaque base64url blob. Log only metadata (type, byteSize, from, sessionId).

2. **Envelope contract is frozen**: Fields in `RelayEnvelope` are add-only. Removing or renaming a field is a breaking change requiring a new contract version (`v2/`). See ADR-003.

3. **Use cases own policy**: Rate limits, TTL logic, peer limits — all live in use cases or `relay.policy.ts`, never in adapters.

4. **Host authority**: Only the peer with `isHost: true` may accept/reject joins, kick peers, or destroy sessions. The server enforces this — it is not a UI-only guard.

5. **Nonce deduplication**: The frontend deduplicates messages by nonce. Never strip or regenerate nonces server-side.

6. **Session state is ephemeral**: No database. If the server restarts, all sessions are gone. This is a feature, not a bug.

---

## All Features — Current State

### Session Lifecycle
- Create vault: POST `/api/sessions` → returns `{id, hostId, hostRecoveryToken, expiresAt}`
- Join vault: WebSocket `join` message → status `joined` (if host) or `pending` (awaiting approval)
- Host approves/rejects: `accept_join` / `reject_join` WS messages
- Refresh TTL: POST `/api/sessions/:id/refresh` (auto-called when TTL < 2 min)
- Destroy vault: DELETE `/api/sessions/:id` (requires `hostRecoveryToken`)
- Auto-cleanup: every 60s — expired TTL, 30min inactivity, 5min empty

### Messaging
- Send: `RelayEnvelope` over WebSocket → server fans out to all other peers
- Types: `PLAINTEXT`, `NOISE_MESSAGE`, `SIGNALING`, `PING`/`PONG`, `ACK`, `READ`, `EDIT`, `DELETE`, `FILE`
- ACK receipts: server sends `ACK` back to sender on relay
- Read receipts: peer sends `READ` envelope with original nonce
- Edit/delete: `EDIT` carries an encrypted `{target, text}` blob; `DELETE` carries the
  target nonce as opaque metadata. Both are author-bound (`env.from` must match the
  original sender) and applied client-side — the relay forwards them blindly.
- File/image/voice sharing: `FILE` carries an encrypted `FileAttachment` (base64 blob +
  metadata) over the same double-ratchet path as text. Raw size is client-capped at
  `MAX_FILE_BYTES`. Voice messages are just `audio/webm` files captured via MediaRecorder.
  See `src/file-transfer.ts` and `src/voice-record.ts`.
- Message search: client-side real-time keyword filter + highlight (see `src/message-search.ts`)
- Auto-disappear: messages vanish client-side after 5 minutes
- Rate limit: 10 messages/second per peer; 50 connections/minute per IP

### Access Control
- Peer limit: 10 per session
- Host recovery: UUID token to re-claim host on reconnect
- Host kick: `kick_peer` WS message removes a peer
- Group mode: automatically enabled when >2 peers join
- Peer token: per-session secret issued at admission; required to re-claim a `peerId`
- Whitelist (stateless): host issues an Ed25519-signed membership token for a member's
  public key; member presents token + a fresh possession proof on `join` and is
  auto-admitted with no host approval. The server holds only the host public key in
  the ephemeral session — no membership state is persisted. See `src/shared/membership.ts`.

### Session Persistence (Client)
- Active session: `sessionStorage` (survives page refresh, not tab close)
- Saved vaults: `localStorage` (reconnect history, recovery tokens)
- Theme preference: `localStorage`
- Join message: `localStorage`

### Security / Privacy UI
- Window blur blackout: chat obscured when app loses focus
- Message blur-to-reveal: hover/touch to read (optional)
- Anti-capture strobe (optional, CSS animation)
- Session decay countdown timer
- Copy vault hash button

### Logging & Observability
- Winston structured logger (backend)
- Domain events emitted on every state change
- Frontend: real-time event log panel, IO load indicator, latency display

---

## Limits Reference (`src/backend/core/constants.ts`)

| Constant | Value |
|---|---|
| `MAX_PEERS` | 10 |
| `DEFAULT_TTL_MS` | 15 minutes |
| `MAX_TTL_MS` | 24 hours |
| `RECONNECT_GRACE_MS` | 30 seconds |
| `MAX_PAYLOAD_BYTES` | 1 MB |
| `MAX_FILE_BYTES` | 256 KB (raw per-file cap, client-enforced before encryption) |
| `TIMESTAMP_TOLERANCE_MS` | 60 seconds |
| `MSG_PER_SECOND_LIMIT` | 10 |
| `CONN_PER_IP_LIMIT` | 50 |
| `CONN_WINDOW_MS` | 60 seconds |
| `CLEANUP_INTERVAL_MS` | 60 seconds |
| `INACTIVITY_TTL_MS` | 30 minutes |
| `EMPTY_SESSION_TTL_MS` | 5 minutes |
| `MAX_PENDING_PEERS` | 10 |
| `SOCKET_MSG_PER_SECOND_LIMIT` | 20 (all WS frame types) |
| `JOIN_TIMEOUT_MS` | 10 seconds |
| `MAX_BUFFERED_BYTES` | 4 MB (per-socket backpressure cutoff) |
| `WS_MAX_FRAME_BYTES` | 1 MB + 64 KB |
| `NONCE_CACHE_MAX` | 50,000 (server-side replay dedup) |
| `SESSION_CREATE_PER_WINDOW` | 10/min per IP (env `REST_SESSION_CREATE_LIMIT`) |
| `GENERAL_PER_WINDOW` | 120/min per IP (env `REST_GENERAL_LIMIT`) |

All changes to limits go in `constants.ts` only — never hardcode numbers elsewhere.

---

## HTTP API

```
POST   /api/sessions               Create session (optional hostPublicKey enables whitelist)
GET    /api/sessions/:id           Get public metadata only (never tokens, hostId, or peers)
POST   /api/sessions/:id/refresh   Extend TTL (requires active participants)
DELETE /api/sessions/:id           Destroy (X-Host-Token header)
GET    /api/health                 Health check
```

---

## WebSocket Protocol (`/ws`)

**Client → Server:**
```
join             { sessionId, peerId, message?, hostRecoveryToken?, peerToken? }
accept_join      { sessionId, targetPeerId }       [host only]
reject_join      { sessionId, targetPeerId }       [host only]
kick_peer        { sessionId, targetPeerId }       [host only]
<RelayEnvelope>  Any envelope type for relay (from must match socket identity; PLAINTEXT refused)
```

**Server → Client:**
```
joined           { sessionId, peerId, isHost?, peerToken }
pending          { sessionId }
peer_update      { peers: SessionPeer[] }
join_request     { peerId, message }               [host only]
error            { code, message }
<RelayEnvelope>  Relayed message from another peer
```

---

## Domain Events

All events are `DomainEvent<T>` with `{ type, sessionId, occurredAt, payload }`:

| Event | Payload |
|---|---|
| `SessionCreated` | `{ expiresAt }` |
| `PeerJoined` | `{ peerId }` |
| `PeerDisconnected` | `{ peerId }` |
| `MessageRelayed` | `{ envelopeType, byteSize, from }` |
| `SessionExpired` | `{ reason, lastActivityAt }` |
| `SessionClosed` | `{}` |
| `EnvelopeRejected` | `{ reason, rawEnvelope }` |

---

## Testing

**Run all:** `npm test`  
**Watch:** `npm run test:watch`  
**UI:** `npm run test:ui`

### Test Layout
```
tests/
├── unit/           ← Use-case logic, schema validation (no I/O)
├── integration/    ← REST API (Supertest) + WS transport (real ws client)
├── e2e/            ← Full relay flow, two peers messaging
├── smoke/          ← Server boots, health endpoint responds
├── load/           ← Concurrent sessions/messages under expected load
└── stress/         ← Beyond limits, verify graceful degradation
```

### Rules
- Unit tests: mock ports, never real adapters
- Integration tests: real in-memory store, real Express, real WebSocket
- No mocking the database — there is no database; use the real in-memory store
- Each test file covers exactly one use case or adapter
- Test file names mirror source: `relay-message.use-case.ts` → `relay-message.test.ts`

---

## Git Workflow

```
main      ← production, protected, no direct commits
staging   ← pre-prod, merged from develop before release
develop   ← active development, branch from here
feature/* ← one feature per branch, PR into develop
```

- PR title: `feat:`, `fix:`, `refactor:`, `test:`, `docs:` prefix
- Squash merge into develop; merge commit into staging/main
- Never force-push main or staging

---

## Adding a Feature — Checklist

1. Does it change the envelope contract? → Update `shared/contracts/v1/` or create `v2/` and write an ADR
2. Does it add business logic? → New use case in `application/use-cases/`, with a port if it needs I/O
3. Does it add a new I/O mechanism? → New adapter in `adapters/`, register in `container.ts`
4. Does it add a new limit? → Add constant to `constants.ts` only
5. Does it change the WS protocol? → Update `events.md` and `ws.transport.ts`
6. Does it add UI? → New hook or component; no business logic in components
7. Write unit tests for use case, integration test for adapter
8. Update relevant doc file in `docs/` if behavior changes

---

## How Claude Should Behave in This Project

- Follow the hexagonal boundary strictly — never let adapters leak into use cases
- Always look up the type in `shared/contracts/v1/` before creating a new one
- All numeric limits come from `constants.ts` — never write a magic number
- When adding a WS message type, handle it in both `ws.transport.ts` (server) and `useRelay.ts` (client)
- When touching session logic, verify against the cleanup rules — sessions have three independent expiry conditions
- Prefer emitting a domain event over adding a log statement; the event bus logs automatically
- Do not add persistence (Redis, DB, file) unless explicitly requested — ephemerality is the design
- Do not add authentication (JWT, OAuth) — the host recovery token IS the auth mechanism
- Run `npm run lint` (tsc --noEmit) before declaring any backend change complete
- The frontend has no build step in dev — Vite serves it via Express middleware on port 3000

---

## Key Files Quick Reference

| What you need | Where to look |
|---|---|
| All type definitions | `src/shared/contracts/v1/` |
| All numeric limits | `src/backend/core/constants.ts` |
| Session business logic | `src/backend/application/use-cases/` |
| WS message handling (server) | `src/backend/adapters/transport/ws.transport.ts` |
| WS message handling (client) | `src/useRelay.ts` |
| Session REST + UI state | `src/useSession.ts` |
| DI wiring | `src/backend/entrypoints/container.ts` |
| Envelope validation rules | `src/backend/core/policies/relay.policy.ts` |
| Server entry point | `server.ts` |
| UI root | `src/App.tsx` |
