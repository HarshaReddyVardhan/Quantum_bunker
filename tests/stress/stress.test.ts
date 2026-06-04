import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { setupApp } from '../../server';
import { Application } from 'express';

/**
 * Stress test: Simulate many concurrent peers sending messages in a single session.
 * Verifies that the server correctly routes messages without dropping or errors.
 */
describe('Stress Test - Concurrent Messaging', () => {
  let app: Application;
  let server: any;
  let port: number;
  const peerCount = 8;

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

  it('handles many peers messaging concurrently', async () => {
    // create a session
    const res = await (await import('supertest')).default(app)
      .post('/api/sessions')
      .send({ name: 'Stress', expiresInSeconds: 600 });
    expect(res.status).toBe(201);
    const { sessionId, hostRecoveryToken, hostId } = res.body;

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

    // host joins
    const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => hostWs.once('open', r));
    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await waitForMessage(hostWs, 'joined');

    // spin up many peers
    const peers: WebSocket[] = [];
    for (let i = 0; i < peerCount; i++) {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      peers.push(ws);
      await new Promise((r) => ws.once('open', r));
      const peerId = `peer-${i}`;
      ws.send(JSON.stringify({ type: 'join', sessionId, peerId }));
      await waitForMessage(ws, 'pending');
      
      // Host accepts peer
      hostWs.send(JSON.stringify({ type: 'accept_join', peerId }));
      await waitForMessage(ws, 'joined');
    }

    // each peer sends a message
    const envelope = { type: 'noise-message', sessionId, from: hostId, timestamp: Date.now(), nonce: 'n0', payload: 'stress-msg' };
    hostWs.send(JSON.stringify(envelope));

    // verify all peers receive it
    await Promise.all(
      peers.map((ws) => waitForMessage(ws, 'noise-message').then((msg) => {
        expect(msg.payload).toBe('stress-msg');
      }))
    );

    // cleanup
    hostWs.close();
    peers.forEach((ws) => ws.close());
  });
});
