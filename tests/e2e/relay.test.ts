import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import WebSocket from 'ws';
import { setupApp } from '../../server';
import { Application } from 'express';
import { EnvelopeType, RelayEnvelope } from '../../src/shared/contracts/v1/envelope';
import { v4 as uuidv4 } from 'uuid';

describe('E2E WebSocket Relay', () => {
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

  const connectWs = (sessionId: string, peerId: string, role: string): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?sessionId=${sessionId}&peerId=${peerId}&role=${role}`);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  };

  it('should allow two peers to connect and exchange messages', async () => {
    // 1. Create Session
    const res = await request(app)
      .post('/api/sessions')
      .send({ name: 'E2E Vault', expiresInSeconds: 600 });
    
    const sessionId = res.body.sessionId;
    const hostId = res.body.hostId;

    // 2. Connect Host
    const hostWs = await connectWs(sessionId, hostId, 'host');
    
    // 3. Connect Peer
    const peerId = 'peer-test';
    const peerWs = await connectWs(sessionId, peerId, 'participant');

    // 4. Send Message from Peer to Host
    const msgPromise = new Promise<any>((resolve) => {
      hostWs.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === EnvelopeType.NOISE_MESSAGE) resolve(parsed);
      });
    });

    const envelope: RelayEnvelope = {
      sessionId,
      from: peerId,
      type: EnvelopeType.NOISE_MESSAGE,
      timestamp: Date.now(),
      nonce: uuidv4(),
      payload: 'SGVsbG8gSG9zdA=='
    };

    peerWs.send(JSON.stringify(envelope));

    const receivedMsg = await msgPromise;
    expect(receivedMsg.from).toBe(peerId);
    expect(receivedMsg.payload).toBe('SGVsbG8gSG9zdA==');

    hostWs.close();
    peerWs.close();
  });

  it('should drop sockets instantly when session is destroyed', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ name: 'Destroy Test Vault', expiresInSeconds: 600 });
    
    const sessionId = res.body.sessionId;
    const hostToken = res.body.hostRecoveryToken;

    const hostWs = await connectWs(sessionId, res.body.hostId, 'host');
    
    const closePromise = new Promise<void>((resolve) => {
      hostWs.on('close', () => resolve());
    });

    await request(app)
      .delete(`/api/sessions/${sessionId}`)
      .set('x-host-token', hostToken);

    await closePromise; // Should resolve if socket is force-closed
    expect(hostWs.readyState).toBe(WebSocket.CLOSED);
  });
});
