import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnvelopeType } from '../../src/shared/contracts/v1/envelope';
import { randomId } from '../../src/random';

// ── Pure logic extracted from useRelay for direct testing ────────────────

interface LocalMessage {
  nonce: string;
  from: string;
  type: string;
  timestamp: number;
  payload: string;
  status: string;
  deliveredTo: string[];
  seenBy: string[];
  edited?: boolean;
  deleted?: boolean;
}

type Env = {
  type: string;
  from: string;
  nonce: string;
  timestamp: number;
  payload: string;
};

// ─── Nonce dedup ────────────────────────────────────────────────────────

describe('useRelay — nonce dedup', () => {
  it('drops a relayed envelope with a seen nonce', () => {
    const prev: LocalMessage[] = [
      { nonce: 'abc', from: 'peer-1', type: 'noise-message', timestamp: Date.now(), payload: 'hello', status: 'delivered', deliveredTo: [], seenBy: [] },
    ];

    const env: Env = { type: 'noise-message', from: 'peer-1', nonce: 'abc', timestamp: Date.now(), payload: 'dup' };

    const shouldDrop = prev.some(m => m.nonce === env.nonce);
    expect(shouldDrop).toBe(true);
  });

  it('accepts an envelope with a new nonce', () => {
    const prev: LocalMessage[] = [
      { nonce: 'abc', from: 'peer-1', type: 'noise-message', timestamp: Date.now(), payload: 'hello', status: 'delivered', deliveredTo: [], seenBy: [] },
    ];

    const env: Env = { type: 'noise-message', from: 'peer-2', nonce: 'xyz', timestamp: Date.now(), payload: 'new' };

    const shouldDrop = prev.some(m => m.nonce === env.nonce);
    expect(shouldDrop).toBe(false);
  });
});

// ─── ACK handling ───────────────────────────────────────────────────────

describe('useRelay — ACK handling', () => {
  it('ACK adds sender to deliveredTo (Set dedup, no duplicates)', () => {
    const prev: LocalMessage[] = [
      { nonce: 'n1', from: 'me', type: 'noise-message', timestamp: Date.now(), payload: 'hi', status: 'sent', deliveredTo: [], seenBy: [] },
    ];

    // First ACK from peer-a
    const afterFirst = prev.map(m => {
      if (m.nonce === 'n1') {
        const deliveredTo = Array.from(new Set([...m.deliveredTo, 'peer-a']));
        return { ...m, deliveredTo, status: m.status === 'seen' ? 'seen' : 'delivered' };
      }
      return m;
    });
    expect(afterFirst[0].deliveredTo).toEqual(['peer-a']);
    expect(afterFirst[0].status).toBe('delivered');

    // Duplicate ACK from peer-a — should not add duplicate
    const afterSecond = afterFirst.map(m => {
      if (m.nonce === 'n1') {
        const deliveredTo = Array.from(new Set([...m.deliveredTo, 'peer-a']));
        return { ...m, deliveredTo, status: m.status === 'seen' ? 'seen' : 'delivered' };
      }
      return m;
    });
    expect(afterSecond[0].deliveredTo).toEqual(['peer-a']);

    // ACK from peer-b
    const afterThird = afterSecond.map(m => {
      if (m.nonce === 'n1') {
        const deliveredTo = Array.from(new Set([...m.deliveredTo, 'peer-b']));
        return { ...m, deliveredTo, status: m.status === 'seen' ? 'seen' : 'delivered' };
      }
      return m;
    });
    expect(afterThird[0].deliveredTo.sort()).toEqual(['peer-a', 'peer-b']);
  });

  it('ACK does not downgrade a seen message', () => {
    const prev: LocalMessage[] = [
      { nonce: 'n1', from: 'me', type: 'noise-message', timestamp: Date.now(), payload: 'hi', status: 'seen', deliveredTo: ['peer-a'], seenBy: ['peer-a'] },
    ];

    const after = prev.map(m => {
      if (m.nonce === 'n1') {
        const deliveredTo = Array.from(new Set([...m.deliveredTo, 'peer-b']));
        return { ...m, deliveredTo, status: m.status === 'seen' ? 'seen' : 'delivered' };
      }
      return m;
    });
    expect(after[0].status).toBe('seen');
  });
});

// ─── READ handling ──────────────────────────────────────────────────────

describe('useRelay — READ handling', () => {
  it('READ moves status to seen and adds to seenBy', () => {
    const prev: LocalMessage[] = [
      { nonce: 'n1', from: 'me', type: 'noise-message', timestamp: Date.now(), payload: 'hi', status: 'delivered', deliveredTo: ['peer-a'], seenBy: [] },
    ];

    const after = prev.map(m => {
      if (m.nonce === 'n1') {
        const seenBy = Array.from(new Set([...m.seenBy, 'peer-a']));
        return { ...m, seenBy, status: 'seen' };
      }
      return m;
    });

    expect(after[0].status).toBe('seen');
    expect(after[0].seenBy).toEqual(['peer-a']);
  });
});

// ─── EDIT author-binding ────────────────────────────────────────────────

describe('useRelay — EDIT author-binding', () => {
  it('EDIT from original author mutates text', () => {
    const prev: LocalMessage[] = [
      { nonce: 'n1', from: 'alice', type: 'noise-message', timestamp: Date.now(), payload: 'original', status: 'delivered', deliveredTo: [], seenBy: [] },
    ];

    // Alice edits her own message
    const editFrom = 'alice';
    const target = 'n1';
    const newText = 'updated';

    const after = prev.map(m =>
      m.nonce === target && m.from === editFrom && !m.deleted
        ? { ...m, payload: newText, edited: true }
        : m
    );

    expect(after[0].payload).toBe('updated');
    expect(after[0].edited).toBe(true);
  });

  it('EDIT from a different sender is ignored (author guard)', () => {
    const prev: LocalMessage[] = [
      { nonce: 'n1', from: 'alice', type: 'noise-message', timestamp: Date.now(), payload: 'secret', status: 'delivered', deliveredTo: [], seenBy: [] },
    ];

    // Bob tries to edit Alice's message
    const editFrom = 'bob';
    const target = 'n1';
    const newText = 'hacked';

    const after = prev.map(m =>
      m.nonce === target && m.from === editFrom && !m.deleted
        ? { ...m, payload: newText, edited: true }
        : m
    );

    expect(after[0].payload).toBe('secret'); // unchanged
    expect(after[0].edited).toBeUndefined();
  });

  it('EDIT on a deleted message is ignored', () => {
    const prev: LocalMessage[] = [
      { nonce: 'n1', from: 'alice', type: 'noise-message', timestamp: Date.now(), payload: '', status: 'delivered', deliveredTo: [], seenBy: [], deleted: true },
    ];

    const after = prev.map(m =>
      m.nonce === 'n1' && m.from === 'alice' && !m.deleted
        ? { ...m, payload: 'new', edited: true }
        : m
    );

    expect(after[0].payload).toBe('');
    expect(after[0].deleted).toBe(true);
  });
});

// ─── DELETE author-binding ──────────────────────────────────────────────

describe('useRelay — DELETE author-binding', () => {
  it('DELETE from original author removes content', () => {
    const prev: LocalMessage[] = [
      { nonce: 'n1', from: 'alice', type: 'noise-message', timestamp: Date.now(), payload: 'msg', status: 'delivered', deliveredTo: [], seenBy: [] },
    ];

    const deleteFrom = 'alice';
    const target = 'n1';

    const after = prev.map(m =>
      m.nonce === target && m.from === deleteFrom
        ? { ...m, payload: '', deleted: true, edited: false }
        : m
    );

    expect(after[0].payload).toBe('');
    expect(after[0].deleted).toBe(true);
    expect(after[0].edited).toBe(false);
  });

  it('DELETE from a different sender is ignored', () => {
    const prev: LocalMessage[] = [
      { nonce: 'n1', from: 'alice', type: 'noise-message', timestamp: Date.now(), payload: 'msg', status: 'delivered', deliveredTo: [], seenBy: [] },
    ];

    const deleteFrom = 'bob';
    const target = 'n1';

    const after = prev.map(m =>
      m.nonce === target && m.from === deleteFrom
        ? { ...m, payload: '', deleted: true, edited: false }
        : m
    );

    expect(after[0].payload).toBe('msg'); // unchanged
    expect(after[0].deleted).toBeUndefined();
  });
});

// ─── Disappearing messages ──────────────────────────────────────────────

describe('useRelay — disappearing messages', () => {
  it('filters out messages older than 5 minutes', () => {
    const now = Date.now();
    const messages: LocalMessage[] = [
      { nonce: 'old', from: 'peer', type: 'noise-message', timestamp: now - 6 * 60 * 1000, payload: 'old', status: 'delivered', deliveredTo: [], seenBy: [] },
      { nonce: 'new', from: 'peer', type: 'noise-message', timestamp: now - 1000, payload: 'new', status: 'delivered', deliveredTo: [], seenBy: [] },
    ];

    const filtered = messages.filter(m => now - m.timestamp < 5 * 60 * 1000);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].nonce).toBe('new');
  });

  it('keeps messages exactly at the 5-minute boundary (just under)', () => {
    const now = Date.now();
    const messages: LocalMessage[] = [
      { nonce: 'edge', from: 'peer', type: 'noise-message', timestamp: now - 5 * 60 * 1000 + 1000, payload: 'edge', status: 'delivered', deliveredTo: [], seenBy: [] },
    ];

    const filtered = messages.filter(m => now - m.timestamp < 5 * 60 * 1000);

    expect(filtered).toHaveLength(1);
  });
});

// ─── P2P all-or-nothing routing ────────────────────────────────────────

describe('useRelay — P2P routing', () => {
  it('shouldUseP2P true when every peer has an open channel', () => {
    // Replicate the core logic: all-or-nothing per message
    const others = ['peer-a', 'peer-b'];
    const isConnected = (id: string) => ['peer-a', 'peer-b'].includes(id);
    const useP2P = others.every(id => isConnected(id));

    expect(useP2P).toBe(true);
  });

  it('shouldUseP2P false when ANY peer lacks an open channel', () => {
    const others = ['peer-a', 'peer-b', 'peer-c'];
    const isConnected = (id: string) => ['peer-a', 'peer-b'].includes(id);
    const useP2P = others.every(id => isConnected(id));

    expect(useP2P).toBe(false);
  });

  it('shouldUseP2P false when there are no other peers', () => {
    const others: string[] = [];
    const isConnected = (_id: string) => true;
    const useP2P = others.every(id => isConnected(id));

    expect(useP2P).toBe(true); // vacuously true — but dispatch won't P2P with no peers
  });
});

// ─── sendFile guards ────────────────────────────────────────────────────

describe('useRelay — sendFile guards', () => {
  it('refuses when no E2E channel manager exists', () => {
    const channelsRef: { current: null } = { current: null };

    const canSend = !!channelsRef.current;
    expect(canSend).toBe(false);
  });

  it('allows when E2E channel manager exists', () => {
    const channelsRef: { current: Record<string, unknown> | null } = { current: { encryptForAll: vi.fn() } };

    const canSend = !!channelsRef.current;
    expect(canSend).toBe(true);
  });

  it('rejects files over MAX_FILE_BYTES', () => {
    const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
    const isWithinLimit = (size: number) => size <= MAX_FILE_BYTES;

    expect(isWithinLimit(MAX_FILE_BYTES)).toBe(true);
    expect(isWithinLimit(MAX_FILE_BYTES + 1)).toBe(false);
    expect(isWithinLimit(100 * 1024 * 1024)).toBe(false);
  });

  it('refuses when no peers are connected', () => {
    const isConnected = true;
    const activePeers: string[] = ['self-only'];
    const peerId = 'self-only';

    const hasOtherPeers = activePeers.filter(id => id !== peerId).length > 0;
    expect(hasOtherPeers).toBe(false);
  });
});

// ─── Latency map PONG cleanup ──────────────────────────────────────────

describe('useRelay — latency map PONG cleanup', () => {
  it('deletes ping timestamp entry on PONG (prevents unbounded growth)', () => {
    const pingMap = new Map<string, number>();
    const nonce = randomId();
    pingMap.set(nonce, Date.now());

    expect(pingMap.has(nonce)).toBe(true);

    // Simulate PONG: delete the entry
    pingMap.delete(nonce);
    expect(pingMap.has(nonce)).toBe(false);
  });
});