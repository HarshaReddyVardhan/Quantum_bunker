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
    await new Promise((r) => hostWs.once('message', () => r(undefined)));

    // spin up many peers
    const peers: WebSocket[] = [];
    for (let i = 0; i < peerCount; i++) {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      peers.push(ws);
      await new Promise((r) => ws.once('open', r));
      ws.send(JSON.stringify({ type: 'join', sessionId, peerId: `peer-${i}` }));
      await new Promise((r) => ws.once('message', () => r(undefined)));
    }

    // each peer sends a message
    const envelope = { type: 'NOISE_MESSAGE', sessionId, from: hostId, timestamp: Date.now(), nonce: 'n0', payload: 'stress-msg' };
    hostWs.send(JSON.stringify(envelope));

    // verify all peers receive it
    await Promise.all(
      peers.map((ws) =>
        new Promise<void>((resolve) =>
          ws.once('message', (data) => {
            const msg = JSON.parse(data.toString());
            expect(msg.type).toBe('NOISE_MESSAGE');
            expect(msg.payload).toBe('stress-msg');
            resolve();
          })
        )
      )
    );

    // cleanup
    hostWs.close();
    peers.forEach((ws) => ws.close());
  });
});
