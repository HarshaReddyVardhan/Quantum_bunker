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
