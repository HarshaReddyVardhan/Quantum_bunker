import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import request from 'supertest';
import { setupApp } from '../../server';
import { Application } from 'express';

const SESSION_COUNT = 150;
const GUESTS_PER_SESSION = 8; // guests per session (host + 8 guests = 9 total, within MAX_PEERS=10)
const TOTAL_CONNECTIONS = SESSION_COUNT * (1 + GUESTS_PER_SESSION); // 150 * 9 = 1350

describe('Load Test - Concurrent Sessions', () => {
  let app: Application;
  let server: any;
  let port: number;
  let cleanupInterval: ReturnType<typeof setInterval>;

  beforeAll(async () => {
    const setup = await setupApp();
    app = setup.app;
    server = setup.server;
    cleanupInterval = setup.cleanupInterval;
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as { port: number }).port;
        resolve();
      });
    });
  });

  afterAll(() => {
    clearInterval(cleanupInterval);
    server.close();
  });

  function openWs(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
  }

  function nextMessage(ws: WebSocket, predicate?: (m: any) => boolean): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for WS message')), 8000);
      const handler = (data: Buffer) => {
        const msg = JSON.parse(data.toString());
        if (!predicate || predicate(msg)) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(msg);
        }
      };
      ws.on('message', handler);
    });
  }

  it(`handles ${SESSION_COUNT} concurrent sessions with relay verification`, async () => {
    const allSockets: WebSocket[] = [];

    const sessionMeta = await Promise.all(
      Array.from({ length: SESSION_COUNT }, async (_, i) => {
        const res = await request(app)
          .post('/api/sessions')
          .send({ name: `load-${i}`, expiresInSeconds: 600 });
        expect(res.status).toBe(201);
        return res.body as { sessionId: string; hostId: string; hostRecoveryToken: string };
      })
    );

    await Promise.all(
      sessionMeta.map(async ({ sessionId, hostId, hostRecoveryToken }) => {
        // Host joins
        const hostWs = await openWs();
        allSockets.push(hostWs);
        hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
        await nextMessage(hostWs, m => m.type === 'joined');

        // Each guest connects; host auto-accepts each join_request
        const guestSockets: WebSocket[] = [];
        for (let g = 0; g < GUESTS_PER_SESSION; g++) {
          const guestId = `guest-${sessionId.slice(0, 8)}-${g}`;
          const guestWs = await openWs();
          allSockets.push(guestWs);
          guestSockets.push(guestWs);

          guestWs.send(JSON.stringify({ type: 'join', sessionId, peerId: guestId }));

          // Host receives the join_request and approves it
          const req = await nextMessage(hostWs, m => m.type === 'join_request');
          hostWs.send(JSON.stringify({ type: 'accept_join', peerId: req.peerId }));

          // Guest confirms joined
          const confirmation = await nextMessage(guestWs, m => m.type === 'joined');
          expect(confirmation.sessionId).toBe(sessionId);
        }

        // Each guest waits for a relay message
        const relayPromises = guestSockets.map(guestWs =>
          nextMessage(guestWs, m => m.type === 'noise-message')
        );

        // Host broadcasts one message
        const nonce = `n-${sessionId.slice(0, 8)}`;
        hostWs.send(JSON.stringify({
          type: 'noise-message',
          sessionId,
          from: hostId,
          timestamp: Date.now(),
          nonce,
          payload: 'bG9hZA',
        }));

        // All guests must receive it
        const received = await Promise.all(relayPromises);
        for (const msg of received) {
          expect(msg.nonce).toBe(nonce);
          expect(msg.from).toBe(hostId);
        }
      })
    );

    for (const ws of allSockets) {
      ws.close();
    }

    expect(allSockets).toHaveLength(TOTAL_CONNECTIONS);
  }, 120000);
});