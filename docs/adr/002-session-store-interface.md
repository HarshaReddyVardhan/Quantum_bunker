# ADR-002 — Session Store Interface and In-Memory Implementation

**Status:** Accepted  
**Date:** 2026-04-25  
**Deciders:** AI Assistant

---

## Context

Session state must be tracked server-side to route WebSocket messages to the
correct peer. The original plan used a raw `JavaScript Map` directly inside
business logic. This:

1. Couples routing logic to a specific data structure.
2. Makes unit testing require real `Map` state.
3. Prevents horizontal scaling without rewriting the relay service.
4. Makes Redis adoption a full refactor instead of a config swap.

---

## Decision

All session access goes through the `ISessionStore` port interface.
No code outside `adapters/store/` may directly instantiate or reference
`InMemorySessionStore` or any `Map`.

**Phase 1 implementation:** `InMemorySessionStore` — `Map<string, Session>`.  
**Phase 3 swap:** `RedisSessionStore` — same interface, zero use-case changes.

**Binding rule:** `new Map`, `new InMemorySessionStore`, or any direct store
construction may only appear in `entrypoints/container.ts`. Use-cases receive
the store as a constructor parameter.

---

## Consequences

**Positive:**
- Use-cases are fully unit-testable with a mock `ISessionStore`.
- Redis adoption is a 1-file adapter change.
- Horizontal scaling becomes possible when `RedisSessionStore` ships.
- Explicit `shutdown()` method enables graceful drain on `SIGTERM`.

**Negative:**
- Async interface (`Promise<void>`) is heavier than synchronous `Map` for
  in-memory use — negligible in practice (<1 µs overhead per call).
