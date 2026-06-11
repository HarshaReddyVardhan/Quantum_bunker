import { describe, it, expect } from 'vitest';
import { parseIceServers } from '../../src/transport/ice-config';

describe('parseIceServers', () => {
  it('defaults to an empty list (no third-party STUN)', () => {
    expect(parseIceServers(undefined)).toEqual([]);
    expect(parseIceServers('')).toEqual([]);
    expect(parseIceServers('   ')).toEqual([]);
  });

  it('parses a comma-separated URL list', () => {
    expect(parseIceServers('stun:a.example:3478, turn:b.example:3478')).toEqual([
      { urls: ['stun:a.example:3478', 'turn:b.example:3478'] },
    ]);
  });

  it('parses a JSON array of RTCIceServer objects', () => {
    const json = JSON.stringify([
      { urls: 'stun:a.example' },
      { urls: ['turn:b.example'], username: 'u', credential: 'p' },
    ]);
    expect(parseIceServers(json)).toEqual([
      { urls: 'stun:a.example' },
      { urls: ['turn:b.example'], username: 'u', credential: 'p' },
    ]);
  });

  it('falls back to empty on malformed JSON', () => {
    expect(parseIceServers('[not json')).toEqual([]);
    expect(parseIceServers('[1, 2, 3]')).toEqual([]); // entries without `urls`
    expect(parseIceServers('{"urls":"x"}')).toEqual([{ urls: ['{"urls":"x"}'] }]); // non-array treated as URL token
  });
});
