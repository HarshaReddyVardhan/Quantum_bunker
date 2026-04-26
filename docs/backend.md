# Backend

- **Stack**: Express, WebSockets (ws), TypeScript, tsx.
- **Validation**: Strict validation with Zod.
- **State**: In-memory session store (`Map`).
- **Cleanup**: Auto-cleanup tasks run periodically (e.g., `CLEANUP_INTERVAL_MS`).
- **Zero-Knowledge**: Never log or store plain message payloads.
- **Routes**: `/api/sessions` for create/get/refresh/delete. `/ws` for real-time.
