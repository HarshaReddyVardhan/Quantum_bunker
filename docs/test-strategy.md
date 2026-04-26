# Quantum Bunker Test Strategy

## Overview
This document outlines the testing strategy for the Quantum Bunker project, prioritizing security, ephemeral guarantees, and deterministic behavior without flaky sleeps.

## Objectives
1. **Zero Logging Guarantee:** Server must never log or store decrypted payloads.
2. **Ephemeral Sessions:** Destroyed or expired sessions must instantly drop all sockets and clear memory.
3. **Robust Delivery:** Message receipts and WebSocket reconnects must work deterministically.
4. **Anti-Abuse:** Rate limits, origin validation, and authorization bypasses must be covered.

## Test Matrix

| Feature / Risk | Unit (Vitest) | Integration (Vitest/Supertest) | E2E (Vitest-WS) | Security (Vitest) |
|---|---|---|---|---|
| Domain/Schemas | X | | | |
| EventBus & Hooks | X | | | |
| Session Lifecycle | X | X | X | |
| WS Handshake | | X | | X |
| Payload Relaying | | X | X | |
| Auth/Authz & Kick | X | X | | X |
| IDOR / Spoofing | | | | X |
| Cleanup Jobs | X | X | | |
| Rate Limits / Spam | | | | X |
| Cross-Session Leakage | | X | X | X |

## Test Types & Tools

- **Unit:** `vitest`. Isolated business logic, schemas, adapters with fakes. Fast execution.
- **Integration:** `vitest` + `supertest` + internal WS clients. Test route wiring, DI containers, and memory stores.
- **E2E / Relaying:** Multi-client flows (Host + Peers) exchanging messages and receipts locally over WebSockets without a real browser to keep CI fast. 
- **Security / Abuse:** Fuzzing inputs, unauthorized joins, impersonation, forging receipts, and logging interceptors.

## Guidelines
- **Fake Timers:** Always use `vi.useFakeTimers()` for expiry logic.
- **Cleanup:** Clear memory stores, EventBus listeners, and sockets after every test using `afterEach`.
- **No Sleeps:** Await specific events rather than arbitrary `setTimeout`.
- **Mocks vs Fakes:** Use fakes for memory stores and DI adapters. Mock the logger to assert zero-knowledge.

## Additional Test Types
- **Smoke Tests:** Quick sanity checks that the core flow (session creation, host join, message relay) works. Implemented in `tests/smoke/`.
- **Stress Tests:** Simulate many concurrent peers (e.g., 30) sending messages in a single session to validate routing under load. Implemented in `tests/stress/`.
- **Load Tests:** Use worker threads to create a large number of connections (e.g., 200) and assess server stability under high volume. Implemented in `tests/load/`.
