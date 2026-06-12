import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import WebSocket from 'ws';
import { setupApp } from '../../server';
import { Application } from 'express';
import { EnvelopeType, RelayEnvelope } from '../../src/shared/contracts/v1/envelope';
import { RelayEnvelopeSchema } from '../../src/shared/contracts/v1/schemas';
import { v4 as uuidv4 } from 'uuid';

describe('E2E control frames (edit / delete / file)', () => {
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
      server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve(); });
    });
  });

  afterAll(() => {
    if (cleanupInterval) clearInterval(cleanupInterval);
    server.close();
  });

  const connectWs = (sessionId: string, peerId: string, recoveryToken?: string): Promise<WebSocket> =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'join', sessionId, peerId, hostRecoveryToken: recoveryToken }));
        ws.once('message', (data) => {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'joined' || parsed.type === 'pending') resolve(ws);
          else if (parsed.type === 'error') reject(new Error(parsed.message));
        });
      });
      ws.on('error', reject);
    });

  const nextEnvelopeOfType = (ws: WebSocket, type: EnvelopeType): Promise<RelayEnvelope> =>
    new Promise((resolve) => {
      const onMsg = (data: WebSocket.RawData) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === type) { ws.off('message', onMsg); resolve(parsed); }
      };
      ws.on('message', onMsg);
    });

  it('accepts the new envelope types in the wire schema', () => {
    for (const type of [EnvelopeType.EDIT, EnvelopeType.DELETE, EnvelopeType.FILE]) {
      const result = RelayEnvelopeSchema.safeParse({
        sessionId: uuidv4(), from: 'peer-a', type, timestamp: Date.now(),
        nonce: uuidv4(), payload: 'b3BhcXVl',
      });
      expect(result.success).toBe(true);
    }
  });

  it('relays EDIT and DELETE frames verbatim without inspecting them', async () => {
    const res = await request(app).post('/api/sessions').send({ name: 'Edit Vault', expiresInSeconds: 600 });
    const { sessionId, hostId, hostRecoveryToken } = res.body;

    const hostWs = await connectWs(sessionId, hostId, hostRecoveryToken);
    const peerId = 'peer-editor';
    const peerWs = await connectWs(sessionId, peerId);

    hostWs.send(JSON.stringify({ type: 'accept_join', peerId }));
    await new Promise<void>((resolve) => {
      const onMsg = (data: WebSocket.RawData) => {
        if (JSON.parse(data.toString()).type === 'joined') { peerWs.off('message', onMsg); resolve(); }
      };
      peerWs.on('message', onMsg);
    });

    // EDIT carries an opaque (here, ciphertext-shaped) blob; the server must
    // forward it untouched.
    const editEnvelope: RelayEnvelope = {
      sessionId, from: peerId, type: EnvelopeType.EDIT, timestamp: Date.now(),
      nonce: uuidv4(), payload: 'ZW5jcnlwdGVkLWVkaXQtYmxvYg==',
    };
    const editReceived = nextEnvelopeOfType(hostWs, EnvelopeType.EDIT);
    peerWs.send(JSON.stringify(editEnvelope));
    const gotEdit = await editReceived;
    expect(gotEdit.from).toBe(peerId);
    expect(gotEdit.payload).toBe(editEnvelope.payload);

    // DELETE carries the target nonce as opaque metadata.
    const targetNonce = 'original-message-nonce';
    const deleteEnvelope: RelayEnvelope = {
      sessionId, from: peerId, type: EnvelopeType.DELETE, timestamp: Date.now(),
      nonce: uuidv4(), payload: targetNonce,
    };
    const deleteReceived = nextEnvelopeOfType(hostWs, EnvelopeType.DELETE);
    peerWs.send(JSON.stringify(deleteEnvelope));
    const gotDelete = await deleteReceived;
    expect(gotDelete.from).toBe(peerId);
    expect(gotDelete.payload).toBe(targetNonce);

    hostWs.close();
    peerWs.close();
  });
});
