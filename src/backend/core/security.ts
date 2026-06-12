import { createHash, timingSafeEqual, randomUUID } from 'crypto';
import { IncomingMessage } from 'http';

export function safeEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function newToken(): string {
  return randomUUID();
}

export function trustProxy(): boolean {
  return process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';
}

// When TOR_MODE is enabled the server is exposed solely via a Tor hidden
// service. All TCP connections arrive from localhost (127.0.0.1), so
// per-IP rate limiting based on the remote address is meaningless and
// would wrongly throttle all peers simultaneously.
export function torMode(): boolean {
  return process.env.TOR_MODE === 'true' || process.env.TOR_MODE === '1';
}

// The v3 .onion hostname (without scheme/port) set via ONION_ADDRESS is
// added automatically to CORS allowed origins and the CSP connect-src
// directive so the app works correctly when loaded from a hidden service.
export function onionAddress(): string | null {
  return process.env.ONION_ADDRESS?.trim() || null;
}

export function clientIp(req: IncomingMessage): string {
  if (trustProxy()) {
    const forwarded = req.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (first) return first.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

export function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true; // non-browser clients (CLI, tests) send no Origin
  const allowlist = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
  if (allowlist.length > 0) return allowlist.includes(origin);
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
