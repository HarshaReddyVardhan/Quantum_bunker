import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { WebSocket } from 'ws';
import { setupApp } from '../../server';
import { Application } from 'express';

describe('WebSocket Transport Integration', () => {
  let app: Application;
  let server: any;
  let wss: any;
  let cleanupInterval: any;
  let port: number;

  beforeAll(async () => {
    const setup = await setupApp();
    app = setup.app;
    server = setup.server;
    wss = setup.wss;
    cleanupInterval = setup.cleanupInterval;
    // force listen on a different port for tests
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

  it('should allow host to join and create session via API then WS handshake', async () => {
    // create session via API
    const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'WS Test', expiresInSeconds: 600 });
    expect(res.status).toBe(201);
    const { sessionId, hostRecoveryToken, hostId } = res.body;

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((resolve) => ws.once('open', resolve));

    // send join as host (with recovery token)
    ws.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    const joinedMsg = await waitForMessage(ws, 'joined');
    expect(joinedMsg.isHost).toBe(true);
    ws.close();
  });

  it('should broadcast messages between peers and enforce rate limit', async () => {
    // create session
    const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'RateLimit', expiresInSeconds: 600 });
    const { sessionId, hostId } = res.body;

    const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const peerWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await Promise.all([
      new Promise((r) => hostWs.once('open', r)),
      new Promise((r) => peerWs.once('open', r)),
    ]);
    // host joins
    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId }));
    await waitForMessage(hostWs, 'joined');
    // peer joins (will be pending then accepted)
    const peerId = 'peer-b';
    peerWs.send(JSON.stringify({ type: 'join', sessionId, peerId }));
    await waitForMessage(peerWs, 'pending');
    // host accepts join
    hostWs.send(JSON.stringify({ type: 'accept_join', peerId }));
    await waitForMessage(peerWs, 'joined');

    // send a valid message from host
    const envelope = { type: 'noise-message', sessionId, from: hostId, timestamp: Date.now(), nonce: 'n1', payload: 'hello' };
    hostWs.send(JSON.stringify(envelope));
    const received = await waitForMessage(peerWs, 'noise-message');
    expect(received.payload).toBe('hello');

    // exceed message rate limit (simulate > MSG_PER_SECOND_LIMIT)
    for (let i = 0; i < 101; i++) {
      hostWs.send(JSON.stringify({ ...envelope, nonce: `n${i}` }));
    }
    const rateError = await waitForMessage(hostWs, 'error');
    expect(rateError.code).toBe('RATE_LIMIT_EXCEEDED');
    hostWs.close();
    peerWs.close();
  });

  it('destroying a session should close all sockets', async () => {
    const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'Destroy', expiresInSeconds: 600 });
    const { sessionId, hostId, hostRecoveryToken } = res.body;
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await Promise.all([new Promise(r => ws1.once('open', r)), new Promise(r => ws2.once('open', r))]);
    ws1.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await waitForMessage(ws1, 'joined');
    ws2.send(JSON.stringify({ type: 'join', sessionId, peerId: 'peer-x' }));
    await waitForMessage(ws2, 'pending');
    const closePromise1 = new Promise<void>((resolve) => ws1.once('close', () => resolve()));
    const closePromise2 = new Promise<void>((resolve) => ws2.once('close', () => resolve()));
    // destroy via API
    const del = await (await import('supertest')).default(app).delete(`/api/sessions/${sessionId}`).set('x-host-token', hostRecoveryToken);
    expect(del.status).toBe(204);
    // both sockets should receive close event
    await Promise.all([closePromise1, closePromise2]);
  });
});
