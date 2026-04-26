# ADR-005 — Typed Domain Events for Metrics, Logging, and Extension Hooks

**Status:** Accepted  
**Date:** 2026-04-25  
**Deciders:** AI Assistant

---

## Context

Logging, metrics, and future hooks (presence, audit trails, alerts) are
triggered by the same moments: session created, peer joined, message relayed,
session expired. Without a formal mechanism, these become direct calls inside
use-cases — coupling application logic to infrastructure and violating ADR-004.

---

## Decision

Use-cases emit typed `DomainEvent` objects via the `IEventBus` port.
Infrastructure adapters subscribe to events and handle their own side effects.

**Defined events:** `SessionCreated`, `PeerJoined`, `PeerDisconnected`,
`MessageRelayed`, `SessionExpired`, `SessionClosed`, `EnvelopeRejected`.  
All types live in `shared/contracts/v1/events.ts`.

---

## Consequences

**Positive:**
- Use-cases have zero infrastructure imports — fully unit-testable.
- New observers attach via `eventBus.on()` — no use-case edits.
- Metrics and logging are opt-out; disabling them changes nothing.
- Maps cleanly to future external event streams (Redis pub/sub, etc.).

**Negative:**
- Slightly more indirection — a log line is 2 hops instead of 1.
- Event type list must stay in sync with use-case emissions.
