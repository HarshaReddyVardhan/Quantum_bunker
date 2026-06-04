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
  const port = 4200;
  const peerCount = 30;

  beforeAll(async () => {
    const setup = await setupApp();
    app = setup.app;
    server = setup.server;
    await new Promise<void>((resolve) => server.listen(port, resolve));
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

    // host joins
    const hostWs = new WebSocket(`ws://localhost:${port}/ws`);
    await new Promise((r) => hostWs.once('open', r));
    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await new Promise((r) => {
      const handler = (d: any) => {
        const msg = JSON.parse(d.toString());
        if (msg.type === 'joined') {
          hostWs.off('message', handler);
          r(undefined);
        }
      };
      hostWs.on('message', handler);
    });

    // spin up many peers in parallel
    const peers: WebSocket[] = [];
    const joinPromises = [];
    for (let i = 0; i < peerCount; i++) {
      const peerId = `peer-${i}`;
      joinPromises.push((async () => {
        const ws = new WebSocket(`ws://localhost:${port}/ws`);
        peers.push(ws);
        await new Promise((r) => ws.once('open', r));
        
        ws.send(JSON.stringify({ type: 'join', sessionId, peerId }));
        
        // Wait for pending response on peer
        await new Promise((r) => {
          const handler = (d: any) => {
            const msg = JSON.parse(d.toString());
            if (msg.type === 'pending') {
              ws.off('message', handler);
              r(undefined);
            }
          };
          ws.on('message', handler);
        });

        // Host accepts peer
        hostWs.send(JSON.stringify({ type: 'accept_join', peerId }));

        // Wait for joined response on peer
        await new Promise((r) => {
          const handler = (d: any) => {
            const msg = JSON.parse(d.toString());
            if (msg.type === 'joined') {
              ws.off('message', handler);
              r(undefined);
            }
          };
          ws.on('message', handler);
        });
      })());
    }

    await Promise.all(joinPromises);

    // host sends a message
    const envelope = { type: 'noise-message', sessionId, from: hostId, timestamp: Date.now(), nonce: 'n0', payload: 'stress-msg' };
    hostWs.send(JSON.stringify(envelope));

    // verify all peers receive it
    await Promise.all(
      peers.map((ws) =>
        new Promise<void>((resolve) => {
          const handler = (data: any) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'noise-message') {
              ws.off('message', handler);
              expect(msg.payload).toBe('stress-msg');
              resolve();
            }
          };
          ws.on('message', handler);
        })
      )
    );

    // cleanup
    hostWs.close();
    peers.forEach((ws) => ws.close());
  }, 30000);
});
