# ADR-006 — Feature Extension Policy

**Status:** Accepted  
**Date:** 2026-04-25  
**Deciders:** AI Assistant

---

## Context

As features are added, the natural instinct is to grow `RelayMessage` or
`CreateSession` to accommodate them. ADR-004 prevents this technically, but
teams need an explicit policy for *how* to add features — not just what's
forbidden.

---

## Decision

Every new feature must pass this gate before any code is written:

### Gate

| Question | If YES |
|---|---|
| Does it change the wire protocol? | Update `shared/contracts/v1/` first (or create `v2/` if breaking). Commit before implementation. |
| Does it change domain rules? | Add/modify a policy in `core/policies/`. |
| Does it change behavior? | Add a new use-case in `application/use-cases/`. Never modify an existing use-case. |
| Does it need new infrastructure? | Add adapter in `adapters/`. Wire only in `entrypoints/container.ts`. |
| Does it cross boundaries in a new way? | Write an ADR first. No implementation without it. |

**Binding rule:** No feature may be implemented by editing an existing use-case
to "also handle" new behavior. Features are additive only.
Existing use-cases are **open for extension via events, closed for modification**.
