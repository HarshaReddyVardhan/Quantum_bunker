import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { safeEqual, trustProxy, torMode, onionAddress, clientIp, isAllowedOrigin } from '../../src/backend/core/security';
import { IncomingMessage } from 'http';

function makeReq(overrides: {
  headers?: Record<string, string | string[]>;
  remoteAddress?: string;
} = {}): IncomingMessage {
  return {
    headers: overrides.headers ?? {},
    socket: { remoteAddress: overrides.remoteAddress ?? '1.2.3.4' },
  } as unknown as IncomingMessage;
}

describe('safeEqual', () => {
  it('returns true for identical strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
  });

  it('returns false for different strings', () => {
    expect(safeEqual('abc', 'xyz')).toBe(false);
  });

  it('returns false when either value is empty', () => {
    expect(safeEqual('', 'abc')).toBe(false);
    expect(safeEqual('abc', '')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
  });

  it('returns false for non-string inputs', () => {
    expect(safeEqual(null, 'abc')).toBe(false);
    expect(safeEqual('abc', undefined)).toBe(false);
    expect(safeEqual(123 as any, '123')).toBe(false);
  });

  it('is not fooled by type coercion tricks', () => {
    expect(safeEqual('0', false as any)).toBe(false);
  });
});

describe('trustProxy', () => {
  beforeEach(() => { delete process.env.TRUST_PROXY; });
  afterEach(() => { delete process.env.TRUST_PROXY; });

  it('returns false when unset', () => {
    expect(trustProxy()).toBe(false);
  });

  it('returns true for "true"', () => {
    process.env.TRUST_PROXY = 'true';
    expect(trustProxy()).toBe(true);
  });

  it('returns true for "1"', () => {
    process.env.TRUST_PROXY = '1';
    expect(trustProxy()).toBe(true);
  });

  it('returns false for other values', () => {
    process.env.TRUST_PROXY = 'yes';
    expect(trustProxy()).toBe(false);
  });
});

describe('torMode', () => {
  beforeEach(() => { delete process.env.TOR_MODE; });
  afterEach(() => { delete process.env.TOR_MODE; });

  it('returns false when unset', () => {
    expect(torMode()).toBe(false);
  });

  it('returns true for "true"', () => {
    process.env.TOR_MODE = 'true';
    expect(torMode()).toBe(true);
  });

  it('returns true for "1"', () => {
    process.env.TOR_MODE = '1';
    expect(torMode()).toBe(true);
  });
});

describe('onionAddress', () => {
  beforeEach(() => { delete process.env.ONION_ADDRESS; });
  afterEach(() => { delete process.env.ONION_ADDRESS; });

  it('returns null when unset', () => {
    expect(onionAddress()).toBeNull();
  });

  it('returns the trimmed address when set', () => {
    process.env.ONION_ADDRESS = '  abcdef1234567890.onion  ';
    expect(onionAddress()).toBe('abcdef1234567890.onion');
  });
});

describe('clientIp', () => {
  beforeEach(() => { delete process.env.TRUST_PROXY; });
  afterEach(() => { delete process.env.TRUST_PROXY; });

  it('returns socket address when proxy not trusted', () => {
    const req = makeReq({
      headers: { 'x-forwarded-for': '10.0.0.1' },
      remoteAddress: '1.2.3.4',
    });
    expect(clientIp(req)).toBe('1.2.3.4');
  });

  it('returns first X-Forwarded-For entry when proxy trusted', () => {
    process.env.TRUST_PROXY = 'true';
    const req = makeReq({
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
      remoteAddress: '127.0.0.1',
    });
    expect(clientIp(req)).toBe('10.0.0.1');
  });

  it('handles array X-Forwarded-For header', () => {
    process.env.TRUST_PROXY = 'true';
    const req = makeReq({
      headers: { 'x-forwarded-for': ['10.0.0.5', '10.0.0.6'] },
      remoteAddress: '127.0.0.1',
    });
    expect(clientIp(req)).toBe('10.0.0.5');
  });

  it('falls back to socket address when header absent and proxy trusted', () => {
    process.env.TRUST_PROXY = 'true';
    const req = makeReq({ remoteAddress: '5.6.7.8' });
    expect(clientIp(req)).toBe('5.6.7.8');
  });

  it('returns "unknown" when socket has no remoteAddress', () => {
    const req = { headers: {}, socket: {} } as unknown as IncomingMessage;
    expect(clientIp(req)).toBe('unknown');
  });
});

describe('isAllowedOrigin', () => {
  beforeEach(() => { delete process.env.ALLOWED_ORIGINS; });
  afterEach(() => { delete process.env.ALLOWED_ORIGINS; });

  it('permits when no origin header (non-browser / CLI)', () => {
    expect(isAllowedOrigin(undefined, 'localhost:3000')).toBe(true);
  });

  it('allows matching host when no allowlist configured', () => {
    expect(isAllowedOrigin('http://localhost:3000', 'localhost:3000')).toBe(true);
  });

  it('rejects mismatched host when no allowlist configured', () => {
    expect(isAllowedOrigin('http://evil.example.com', 'localhost:3000')).toBe(false);
  });

  it('allows origins in the allowlist', () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com,https://other.example.com';
    expect(isAllowedOrigin('https://app.example.com', 'anything')).toBe(true);
  });

  it('rejects origins not in the allowlist', () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com';
    expect(isAllowedOrigin('https://evil.example.com', 'anything')).toBe(false);
  });

  it('rejects malformed origin strings when no allowlist', () => {
    expect(isAllowedOrigin('not-a-url', 'localhost:3000')).toBe(false);
  });

  it('allowlist entries are trimmed', () => {
    process.env.ALLOWED_ORIGINS = '  https://app.example.com  ';
    expect(isAllowedOrigin('https://app.example.com', 'anything')).toBe(true);
  });
});
