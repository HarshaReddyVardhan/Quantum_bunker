import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { setupApp } from '../../server';
import { Application } from 'express';

describe('Smoke Test - Core Flow', () => {
  let app: Application;
  let server: any;
  let port: number;

  beforeAll(async () => {
    const setup = await setupApp();
    app = setup.app;
    server = setup.server;
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  it('creates a session, host joins, sends a message, and peer receives it', async () => {
    console.log('[SMOKE TEST] Creating session...');
    const res = await (await import('supertest')).default(app)
      .post('/api/sessions')
      .send({ name: 'Smoke', expiresInSeconds: 300 });
    expect(res.status).toBe(201);
    const { sessionId, hostRecoveryToken, hostId } = res.body;
    console.log(`[SMOKE TEST] Session created: ${sessionId}, hostId: ${hostId}`);

    console.log('[SMOKE TEST] Connecting WebSockets...');
    const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const peerWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await Promise.all([
      new Promise((r) => hostWs.once('open', r)),
      new Promise((r) => peerWs.once('open', r)),
    ]);
    console.log('[SMOKE TEST] WebSockets connected. Host sending join...');

    const waitForMessage = (ws: WebSocket, type: string): Promise<any> => {
      return new Promise((resolve) => {
        const handler = (data: any) => {
          const parsed = JSON.parse(data.toString());
          console.log(`[SMOKE TEST] Received message type: ${parsed.type} on socket`);
          if (parsed.type === type) {
            ws.off('message', handler);
            resolve(parsed);
          }
        };
        ws.on('message', handler);
      });
    };

    // host joins
    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    console.log('[SMOKE TEST] Host join sent, waiting for joined confirmation...');
    await waitForMessage(hostWs, 'joined');
    console.log('[SMOKE TEST] Host joined successfully. Peer sending join...');

    // peer joins and is accepted by host
    const peerId = 'peer-smoke';
    peerWs.send(JSON.stringify({ type: 'join', sessionId, peerId }));
    console.log('[SMOKE TEST] Peer join sent, waiting for pending confirmation...');
    await waitForMessage(peerWs, 'pending');
    console.log('[SMOKE TEST] Peer is pending. Host sending accept_join...');
    
    // host accepts join
    hostWs.send(JSON.stringify({ type: 'accept_join', peerId }));
    console.log('[SMOKE TEST] Accept join sent, waiting for joined confirmation on peer...');
    await waitForMessage(peerWs, 'joined');
    console.log('[SMOKE TEST] Peer joined successfully. Host sending message...');

    // host sends a message
    const envelope = { type: 'noise-message', sessionId, from: hostId, timestamp: Date.now(), nonce: 'n0', payload: 'hello-smoke' };
    hostWs.send(JSON.stringify(envelope));
    console.log('[SMOKE TEST] Message sent, waiting for relay to peer...');
    const received = await waitForMessage(peerWs, 'noise-message');
    console.log('[SMOKE TEST] Message received on peer!');
    expect(received.payload).toBe('hello-smoke');

    hostWs.close();
    peerWs.close();
  });
});
