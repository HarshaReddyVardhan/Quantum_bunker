# Running Quantum Bunker as a Tor Hidden Service

## What this gives you

- Clients connect via a `.onion` address — no clearnet exposure required.
- Tor Browser works out of the box; no client-side proxy config needed.
- The server's IP is never revealed to peers.
- End-to-end transport encryption provided by Tor (circuit encryption + TLS at the app layer if you add it).

The zero-knowledge invariant is unchanged: the server still never sees message payloads.

---

## Prerequisites

- `tor` installed and running (`apt install tor` / `brew install tor`)
- Quantum Bunker running on `localhost:3000`

---

## Tor daemon configuration

Add to `/etc/tor/torrc` (or `~/.torrc` on macOS):

```
HiddenServiceDir /var/lib/tor/quantum-bunker/
HiddenServicePort 80 127.0.0.1:3000
```

Restart Tor:

```bash
sudo systemctl restart tor
```

Read your `.onion` hostname:

```bash
cat /var/lib/tor/quantum-bunker/hostname
# e.g. abc123xyz.onion
```

---

## Environment variables

| Variable | Example | Purpose |
|---|---|---|
| `TOR_MODE` | `true` | Disables IP-based rate limiting (all Tor traffic arrives from `127.0.0.1`, so per-IP limits would block all peers at once) |
| `ONION_ADDRESS` | `abc123xyz.onion` | Adds the `.onion` origin to CORS and CSP `connect-src` automatically |

Set both when launching the server:

```bash
TOR_MODE=true ONION_ADDRESS=abc123xyz.onion node server.js
```

Or in a `.env` file:

```
TOR_MODE=true
ONION_ADDRESS=abc123xyz.onion
NODE_ENV=production
```

---

## Sharing the address

Send peers your `.onion` address and the session vault hash:

```
http://abc123xyz.onion/#<vault-hash>
```

Peers must use Tor Browser (or any SOCKS5-capable client pointed at `127.0.0.1:9050`) to resolve `.onion` addresses.

---

## Rate limiting in Tor mode

When `TOR_MODE=true`:

- **IP-based connection rate limiting** (WS, HTTP) is disabled — all connections arrive from `127.0.0.1` so per-IP limits are meaningless.
- **Per-session message limits** still apply (`MSG_PER_SECOND_LIMIT`, `SOCKET_MSG_PER_SECOND_LIMIT`).
- **Peer count limits** still apply (`MAX_PEERS`).

If you need to re-enable IP limiting for a semi-public clearnet + hidden-service dual deployment, keep `TOR_MODE` unset and configure `TRUST_PROXY=true` + a reverse proxy that sets `X-Forwarded-For`.

---

## Optional: nginx reverse proxy in front of Bunker

This lets you serve HTTPS over clearnet on port 443 while Tor maps port 80 → port 3000.

```nginx
server {
    listen 3000;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

With nginx in the path, set `TRUST_PROXY=true` so the server can read `X-Forwarded-For` for logging (non-rate-limit) purposes.

---

## Security notes

- `TOR_MODE=true` should only be set when the server is not reachable from the public internet directly. If the process binds to `0.0.0.0`, firewall port 3000 from external access:
  ```bash
  ufw deny 3000
  ```
- Tor provides anonymity at the transport layer, not at the application layer. Peers can still be de-anonymized if they share identifying information in message payloads.
- The hidden service's private key lives in `HiddenServiceDir`. Back it up — losing it means losing the `.onion` address permanently.
