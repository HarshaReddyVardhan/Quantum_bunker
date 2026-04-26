# Product: Quantum Bunker

- **Goal**: Secure, ephemeral real-time messaging vaults.
- **Vault Hash**: The `sessionId` acts as a secure room ID.
- **Peer Identity**: `peerId` is a per-client identifier inside the vault.
- **Lifecycle**: Sessions expire automatically or are destroyed manually. Destroying drops all WebSockets and removes vault from memory.
- **Features**: Ephemeral messages, read receipts, anti-screenshot blur-to-reveal, app focus blackout.
