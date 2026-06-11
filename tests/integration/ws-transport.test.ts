import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { WebSocket } from 'ws';
import { setupApp } from '../../server';
import { Application } from 'express';

describe('WebSocket Transport Integration', () => {
  let app: Application;
  let server: any;
  let wss: any;
  let cleanupInterval: any;
  const port = 4000; // avoid conflict with dev server

  beforeAll(async () => {
    const setup = await setupApp();
    app = setup.app;
    server = setup.server;
    wss = setup.wss;
    cleanupInterval = setup.cleanupInterval;
    // force listen on a different port for tests
    await new Promise<void>((resolve) => server.listen(port, resolve));
  });

  afterAll(() => {
    if (cleanupInterval) clearInterval(cleanupInterval);
    server.close();
  });

  it('should allow host to join and create session via API then WS handshake', async () => {
    // create session via API
    const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'WS Test', expiresInSeconds: 600 });
    expect(res.status).toBe(201);
    const { sessionId, hostRecoveryToken, hostId } = res.body;

    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    await new Promise((resolve) => ws.once('open', resolve));

    // send join as host (with recovery token)
    ws.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    const joinedMsg = await new Promise<any>((resolve) => ws.once('message', (data) => resolve(JSON.parse(data.toString()))));
    expect(joinedMsg.type).toBe('joined');
    expect(joinedMsg.isHost).toBe(true);
    ws.close();
  });

  it('should broadcast messages between peers and enforce rate limit', async () => {
    // create session
    const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'RateLimit', expiresInSeconds: 600 });
    const { sessionId, hostId } = res.body;

    const hostWs = new WebSocket(`ws://localhost:${port}/ws`);
    const peerWs = new WebSocket(`ws://localhost:${port}/ws`);
    await Promise.all([
      new Promise((r) => hostWs.once('open', r)),
      new Promise((r) => peerWs.once('open', r)),
    ]);
    // host joins
    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId }));
    await new Promise((r) => hostWs.once('message', () => r(undefined)));
    // peer joins (will be pending then accepted)
    const peerId = 'peer-b';
    peerWs.send(JSON.stringify({ type: 'join', sessionId, peerId }));
    
    // Wait for pending message
    await new Promise((r) => {
      const handler = (d: any) => {
        const msg = JSON.parse(d.toString());
        if (msg.type === 'pending') {
          peerWs.off('message', handler);
          r(undefined);
        }
      };
      peerWs.on('message', handler);
    });

    // host accepts join
    hostWs.send(JSON.stringify({ type: 'accept_join', peerId }));
    
    // Wait for joined message on peer
    await new Promise((r) => {
      const handler = (d: any) => {
        const msg = JSON.parse(d.toString());
        if (msg.type === 'joined') {
          peerWs.off('message', handler);
          r(undefined);
        }
      };
      peerWs.on('message', handler);
    });

    // send a valid message from host
    const envelope = { type: 'noise-message', sessionId, from: hostId, timestamp: Date.now(), nonce: 'n1', payload: 'hello' };
    hostWs.send(JSON.stringify(envelope));
    
    const received = await new Promise<any>((resolve) => {
      const handler = (d: any) => {
        const msg = JSON.parse(d.toString());
        if (msg.type === 'noise-message') {
          peerWs.off('message', handler);
          resolve(msg);
        }
      };
      peerWs.on('message', handler);
    });
    expect(received.type).toBe('noise-message');
    expect((received as any).payload).toBe('hello');

    // exceed message rate limit (simulate > MSG_PER_SECOND_LIMIT)
    for (let i = 0; i < 101; i++) {
      hostWs.send(JSON.stringify({ ...envelope, nonce: `n${i}` }));
    }
    const rateError = await new Promise<any>((resolve) => {
      const handler = (d: any) => {
        const msg = JSON.parse(d.toString());
        if (msg.type === 'error' && msg.code === 'RATE_LIMIT_EXCEEDED') {
          hostWs.off('message', handler);
          resolve(msg);
        }
      };
      hostWs.on('message', handler);
    });
    expect(rateError.type).toBe('error');
    expect(rateError.code).toBe('RATE_LIMIT_EXCEEDED');
    hostWs.close();
    peerWs.close();
  });

  it('destroying a session should close all sockets', async () => {
    const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'Destroy', expiresInSeconds: 600 });
    const { sessionId, hostId, hostRecoveryToken } = res.body;
    
    const ws1 = new WebSocket(`ws://localhost:${port}/ws`);
    const ws2 = new WebSocket(`ws://localhost:${port}/ws`);

    await Promise.all([new Promise(r => ws1.once('open', r)), new Promise(r => ws2.once('open', r))]);
    
    ws1.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await new Promise(r => {
      const h = (d: any) => {
        const msg = JSON.parse(d.toString());
        if (msg.type === 'joined') {
          ws1.off('message', h);
          r(undefined);
        }
      };
      ws1.on('message', h);
    });
    
    ws2.send(JSON.stringify({ type: 'join', sessionId, peerId: 'peer-x' }));
    await new Promise(r => {
      const h = (d: any) => {
        const msg = JSON.parse(d.toString());
        if (msg.type === 'pending') {
          ws2.off('message', h);
          r(undefined);
        }
      };
      ws2.on('message', h);
    });
    
    // destroy via API
    const del = await (await import('supertest')).default(app).delete(`/api/sessions/${sessionId}`).set('x-host-token', hostRecoveryToken);
    expect(del.status).toBe(204);
    
    // both sockets should receive close event
    await Promise.all([
      new Promise<void>((resolve) => ws1.once('close', () => resolve())),
      new Promise<void>((resolve) => ws2.once('close', () => resolve())),
    ]);
  });
});
