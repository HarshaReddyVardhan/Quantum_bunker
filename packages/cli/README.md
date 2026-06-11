# quantum-bunker (CLI)

Terminal client for [Quantum Bunker](../../README.md) — join zero-knowledge,
ephemeral, **end-to-end-encrypted** messaging vaults straight from your shell.
No browser required.

The CLI speaks the exact same wire protocol as the web app: it runs the
**Noise XX** handshake and **Double Ratchet** per peer, so a terminal user and a
browser user in the same vault are fully interoperable and the relay still never
sees plaintext.

## Usage

```bash
# Join an existing vault by hash
npx quantum-bunker join <hash> --name neo

# …or paste a full share link
npx quantum-bunker join "https://bunker.example/?vault=<hash>"

# Spin up a new vault and drop into it as host
npx quantum-bunker create --name host
```

### Options

| Flag | Description |
|---|---|
| `-s, --server <url>` | Relay server. Defaults to `$QB_SERVER` or `http://localhost:3000`. A full share URL pins the server automatically. |
| `-n, --name <alias>` | Display name shown to other peers. |
| `--token <token>` | Host recovery token — re-claim host on reconnect. |
| `--no-join` | (`create` only) Print the hash without entering the chat. |
| `-h, --help` / `-v, --version` | Help / version. |

`$QB_SERVER` and `$NO_COLOR` are honored.

### In-chat commands

```
/peers            list connected peers
/verify           show key fingerprints & safety numbers
/accept <id>      approve a pending join   (host only)
/reject <id>      deny a pending join      (host only)
/kick <id>        remove a peer            (host only)
/quit             leave the vault
```

Type anything else to send it as an encrypted message. Messages are only sent
once the secure channel with every peer is established (`end-to-end encrypted`
status line).

## How it interoperates

- Connects to the relay's `/ws` endpoint and joins with a random `user-xxxxxx`
  peer id (guests await host approval, exactly like the web client).
- Wraps Noise handshake frames in `SIGNALING` envelopes and per-peer ratchet
  ciphertext in `NOISE_MESSAGE` envelopes — byte-identical to `src/useRelay.ts`.
- The relay falls back from P2P to WS relay automatically when a peer (this CLI)
  has no WebRTC data channel, so no WebRTC stack is needed here.

## Development

```bash
npm install
npm run dev -- join <hash>   # run from source via tsx
npm run build                # emit dist/ for publishing
```

The crypto in `src/crypto/` is vendored from the main app's `src/crypto/`
(unchanged logic) so the package is self-contained and publishable on its own.
The envelope contract is frozen (add-only), making the vendored copies safe.
