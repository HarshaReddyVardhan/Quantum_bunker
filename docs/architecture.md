# Architecture

- **Pattern**: Clean Architecture / Ports & Adapters.
- **DI**: `src/backend/entrypoints/container.ts` is the central Dependency Injection wiring point.
- **Cross-cutting**: `EventBus/EventEmitterBus` used for system events.
- **Contracts**: Shared schemas/types in `src/shared/contracts`.
- **Use Cases**: Core business logic in `src/backend/application/use-cases`.
- **Ports**: Interfaces in `src/backend/application/ports`.
- **Adapters**: Implementations in `src/backend/adapters`.
