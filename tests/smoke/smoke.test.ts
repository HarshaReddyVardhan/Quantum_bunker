import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { setupApp } from '../../server';
import { Application } from 'express';

describe('Smoke Test - Core Flow', () => {
  let app: Application;
  let server: any;
  const port = 4100;

  beforeAll(async () => {
    const setup = await setupApp();
    app = setup.app;
    server = setup.server;
    await new Promise<void>((resolve) => server.listen(port, resolve));
  });

  afterAll(() => {
    server.close();
  });

  it('creates a session, host joins, sends a message, and peer receives it', async () => {
    // create session via API
    const res = await (await import('supertest')).default(app)
      .post('/api/sessions')
      .send({ name: 'Smoke', expiresInSeconds: 300 });
    expect(res.status).toBe(201);
    const { sessionId, hostRecoveryToken, hostId } = res.body;

    const hostWs = new WebSocket(`ws://localhost:${port}/ws`);
    const peerWs = new WebSocket(`ws://localhost:${port}/ws`);
    
    await Promise.all([
      new Promise((r) => hostWs.once('open', r)),
      new Promise((r) => peerWs.once('open', r)),
    ]);

    // host joins
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

    // peer joins
    const peerId = 'peer-smoke';
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

    // Host accepts peer
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

    // host sends a message
    const envelope = { type: 'noise-message', sessionId, from: hostId, timestamp: Date.now(), nonce: 'n0', payload: 'hello-smoke' };
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
    expect(received.payload).toBe('hello-smoke');

    hostWs.close();
    peerWs.close();
  });
});
