# ADR-004 — Hexagonal-Lite Module Boundary Rules

**Status:** Accepted  
**Date:** 2026-04-25  
**Deciders:** AI Assistant

---

## Context

In a flat `services/` + `routes/` structure, HTTP logic, WebSocket logic,
storage logic, and domain logic gradually bleed into each other.
The route handler starts making direct `Map` calls, the WS adapter starts
applying session policies, the logger gets passed into domain objects.

---

## Decision

The backend uses a **4-layer hex-lite architecture** with a strict
one-directional dependency rule:

```
core → application → adapters → entrypoints
```

| Layer | May import | May NOT import |
|---|---|---|
| `core/` | `shared/contracts/v1/` types only | application, adapters, entrypoints, Node libs |
| `application/` | `core/`, port interfaces | adapter implementations, Express, ws, Winston |
| `adapters/` | `application/`, `core/`, npm infra libs | entrypoints |
| `entrypoints/` | Everything (composition root) | — |

---

## Consequences

**Positive:**
- Use-cases testable without any infrastructure.
- New transports (gRPC, etc.) are adapters — core unchanged.
- New storage backend is an adapter — relay logic unchanged.
- Clear placement for every type of code.

**Negative:**
- More files than a flat structure.
- New contributors need to understand the model.
