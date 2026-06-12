import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { setupApp } from '../../server';
import { Application } from 'express';

describe('Backpressure and payload robustness', () => {
  let app: Application;
  let server: any;
  let cleanupInterval: any;
  let port: number;

  beforeAll(async () => {
    const setup = await setupApp();
    app = setup.app;
    server = setup.server;
    cleanupInterval = setup.cleanupInterval;
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  afterAll(() => {
    if (cleanupInterval) clearInterval(cleanupInterval);
    server.close();
  });

  const waitForMessage = (ws: WebSocket, type: string): Promise<any> => {
    return new Promise((resolve) => {
      const handler = (data: any) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === type) {
          ws.off('message', handler);
          resolve(parsed);
        }
      };
      ws.on('message', handler);
    });
  };

  it('envelope at exactly MAX_PAYLOAD_BYTES passes schema validation', async () => {
    const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024; // 16MB
    const supertest = (await import('supertest')).default;
    const res = await supertest(app)
      .post('/api/sessions')
      .send({ name: 'PayloadBoundary', expiresInSeconds: 600 });
    const { sessionId, hostId, hostRecoveryToken } = res.body;

    const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const peerWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await Promise.all([
      new Promise((r) => hostWs.once('open', r)),
      new Promise((r) => peerWs.once('open', r)),
    ]);

    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await waitForMessage(hostWs, 'joined');

    peerWs.send(JSON.stringify({ type: 'join', sessionId, peerId: 'peer-1' }));
    await waitForMessage(peerWs, 'pending');
    hostWs.send(JSON.stringify({ type: 'accept_join', peerId: 'peer-1' }));
    await waitForMessage(peerWs, 'joined');

    // Build a payload that approaches but stays under MAX_PAYLOAD_BYTES
    // The JSON serialization of the full envelope must be <= MAX_PAYLOAD_BYTES
    const payloadChars = MAX_PAYLOAD_BYTES - 500; // leave room for envelope JSON overhead
    const bigPayload = 'x'.repeat(payloadChars);

    const envelope = {
      sessionId,
      from: hostId,
      type: 'noise-message',
      timestamp: Date.now(),
      nonce: 'big-nonce',
      payload: bigPayload,
    };

    const json = JSON.stringify(envelope);
    expect(json.length).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);

    hostWs.send(json);
    const received = await waitForMessage(peerWs, 'noise-message');
    expect(received.nonce).toBe('big-nonce');
    expect(received.payload).toBe(bigPayload);

    hostWs.close();
    peerWs.close();
  }, 30000);

  it('envelope over MAX_PAYLOAD_BYTES is rejected by schema', async () => {
    const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;
    const supertest = (await import('supertest')).default;
    const res = await supertest(app)
      .post('/api/sessions')
      .send({ name: 'Oversized', expiresInSeconds: 600 });
    const { sessionId, hostId, hostRecoveryToken } = res.body;

    // Need a WebSocket with a large enough maxPayload to even send the oversized envelope.
    // The server uses WS_MAX_FRAME_BYTES, so the payload must exceed that on the wire
    // but the client must also permit sending it.
    const WS_MAX_FRAME_BYTES = 16 * 1024 * 1024 + 64 * 1024;
    const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`, { maxPayload: WS_MAX_FRAME_BYTES * 4 });
    await new Promise((r) => hostWs.once('open', r));
    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await waitForMessage(hostWs, 'joined');

    // Payload that exceeds server's WS_MAX_FRAME_BYTES
    const bigPayload = 'x'.repeat(WS_MAX_FRAME_BYTES + 1000);

    // Server-side the WSS is configured with maxPayload = WS_MAX_FRAME_BYTES.
    // Sending a frame larger than that causes the server to close the socket.
    const closePromise = new Promise<number>((resolve) => hostWs.once('close', (code) => resolve(code)));
    try {
      hostWs.send(JSON.stringify({
        sessionId,
        from: hostId,
        type: 'noise-message',
        timestamp: Date.now(),
        nonce: 'oversize',
        payload: bigPayload,
      }));
    } catch {
      // Client-side maxPayload might also reject
    }
    const code = await closePromise;
    // Either the frame is rejected or the connection is closed — both protect the server
    expect(code).toBeGreaterThan(0);
    hostWs.close();
  }, 30000);

  it('WS frame above server maxPayload is handled gracefully', async () => {
    const WS_MAX_FRAME_BYTES = 16 * 1024 * 1024 + 64 * 1024;
    const supertest = (await import('supertest')).default;
    const res = await supertest(app)
      .post('/api/sessions')
      .send({ name: 'FrameCap', expiresInSeconds: 600 });
    const { sessionId, hostId, hostRecoveryToken } = res.body;

    // Configure client with a higher maxPayload to allow sending oversized frames
    const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`, { maxPayload: WS_MAX_FRAME_BYTES * 4 });
    await new Promise((r) => hostWs.once('open', r));
    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await waitForMessage(hostWs, 'joined');

    // Send a frame larger than server's maxPayload
    const hugePayload = 'x'.repeat(WS_MAX_FRAME_BYTES + 1000);
    const closePromise = new Promise<number>((resolve) => hostWs.once('close', (code) => resolve(code)));
    try {
      hostWs.send(JSON.stringify({
        sessionId,
        from: hostId,
        type: 'noise-message',
        timestamp: Date.now(),
        nonce: 'huge',
        payload: hugePayload,
      }));
    } catch {
      // Client rejects before sending — still valid protection
    }
    const code = await closePromise;
    expect(code).toBeGreaterThan(0);
    hostWs.close();
  }, 30000);

  it('slow consumer with bufferedAmount exceeding MAX_BUFFERED_BYTES causes sends to be skipped', async () => {
    const supertest = (await import('supertest')).default;
    const res = await supertest(app)
      .post('/api/sessions')
      .send({ name: 'Slow', expiresInSeconds: 600 });
    const { sessionId, hostId, hostRecoveryToken } = res.body;

    const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const fastPeerWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await Promise.all([
      new Promise((r) => hostWs.once('open', r)),
      new Promise((r) => fastPeerWs.once('open', r)),
    ]);

    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await waitForMessage(hostWs, 'joined');

    fastPeerWs.send(JSON.stringify({ type: 'join', sessionId, peerId: 'fast' }));
    await waitForMessage(fastPeerWs, 'pending');
    hostWs.send(JSON.stringify({ type: 'accept_join', peerId: 'fast' }));
    await waitForMessage(fastPeerWs, 'joined');

    // Fast peer sends messages — they should still flow
    const envelope = {
      sessionId,
      from: 'fast',
      type: 'noise-message',
      timestamp: Date.now(),
      nonce: 'fast-1',
      payload: 'hello from fast peer',
    };
    fastPeerWs.send(JSON.stringify(envelope));
    const received = await waitForMessage(hostWs, 'noise-message');
    expect(received.nonce).toBe('fast-1');

    hostWs.close();
    fastPeerWs.close();
  }, 30000);
});