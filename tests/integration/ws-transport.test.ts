import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { WebSocket } from 'ws';
import { setupApp } from '../../server';
import { Application } from 'express';
import {
  generateIdentity,
  issueMembershipToken,
  createJoinProof,
  encodeToken,
} from '../../src/shared/membership';

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
    const { sessionId, hostId, hostRecoveryToken } = res.body;

    const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const peerWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await Promise.all([
      new Promise((r) => hostWs.once('open', r)),
      new Promise((r) => peerWs.once('open', r)),
    ]);
    // host joins (host authority requires the recovery token)
    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
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

  it('should reject claiming an admitted peerId without its peer token', async () => {
    const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'Hijack', expiresInSeconds: 600 });
    const { sessionId, hostId, hostRecoveryToken } = res.body;

    const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => hostWs.once('open', r));
    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await waitForMessage(hostWs, 'joined');

    // Attacker knows the public hostId but holds no credential
    const attackerWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => attackerWs.once('open', r));
    attackerWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId }));
    const err = await waitForMessage(attackerWs, 'error');
    expect(err.code).toBe('INVALID_PEER_TOKEN');

    hostWs.close();
    attackerWs.close();
  });

  it('should reject envelopes whose from field does not match the socket identity', async () => {
    const res = await (await import('supertest')).default(app).post('/api/sessions').send({ name: 'Spoof', expiresInSeconds: 600 });
    const { sessionId, hostId, hostRecoveryToken } = res.body;

    const hostWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => hostWs.once('open', r));
    hostWs.send(JSON.stringify({ type: 'join', sessionId, peerId: hostId, hostRecoveryToken }));
    await waitForMessage(hostWs, 'joined');

    hostWs.send(JSON.stringify({
      type: 'noise-message', sessionId, from: 'somebody-else',
      timestamp: Date.now(), nonce: 'spoof-1', payload: 'x',
    }));
    const err = await waitForMessage(hostWs, 'error');
    expect(err.code).toBe('SENDER_MISMATCH');
    hostWs.close();
  });

  it('auto-admits a whitelisted member with no host approval', async () => {
    const host = generateIdentity();
    const member = generateIdentity();

    const res = await (await import('supertest')).default(app)
      .post('/api/sessions')
      .send({ name: 'Whitelist', expiresInSeconds: 600, hostPublicKey: host.publicKey });
    const { sessionId } = res.body;

    const token = encodeToken(issueMembershipToken(host.secretKey, member.publicKey, sessionId));
    const peerId = 'member-1';
    const proof = createJoinProof(member, sessionId, peerId, 'mn-1');

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ type: 'join', sessionId, peerId, membershipToken: token, joinProof: proof }));
    const joined = await waitForMessage(ws, 'joined');
    expect(joined.viaMembership).toBe(true);
    expect(joined.peerToken).toBeDefined();
    ws.close();
  });

  it('rejects a membership join whose proof key was not whitelisted', async () => {
    const host = generateIdentity();
    const member = generateIdentity();
    const impostor = generateIdentity();

    const res = await (await import('supertest')).default(app)
      .post('/api/sessions')
      .send({ name: 'Whitelist2', expiresInSeconds: 600, hostPublicKey: host.publicKey });
    const { sessionId } = res.body;

    // Token vouches for `member`, but the impostor signs the proof with their key.
    const token = encodeToken(issueMembershipToken(host.secretKey, member.publicKey, sessionId));
    const peerId = 'member-2';
    const forgedProof = createJoinProof(impostor, sessionId, peerId, 'mn-2');

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ type: 'join', sessionId, peerId, membershipToken: token, joinProof: forgedProof }));
    const err = await waitForMessage(ws, 'error');
    expect(err.code).toBe('INVALID_MEMBERSHIP');
    ws.close();
  });

  it('a captured membership join cannot be replayed to impersonate a member', async () => {
    const host = generateIdentity();
    const member = generateIdentity();

    const res = await (await import('supertest')).default(app)
      .post('/api/sessions')
      .send({ name: 'Whitelist3', expiresInSeconds: 600, hostPublicKey: host.publicKey });
    const { sessionId } = res.body;

    const token = encodeToken(issueMembershipToken(host.secretKey, member.publicKey, sessionId));
    const proof = createJoinProof(member, sessionId, 'member-3', 'mn-3');

    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws1.once('open', r));
    ws1.send(JSON.stringify({ type: 'join', sessionId, peerId: 'member-3', membershipToken: token, joinProof: proof }));
    await waitForMessage(ws1, 'joined');

    // An attacker who captured the join frame replays it verbatim on a fresh
    // socket. Once admitted, that identity is bound to its peer token (which the
    // attacker never saw), so the replay is rejected.
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws2.once('open', r));
    ws2.send(JSON.stringify({ type: 'join', sessionId, peerId: 'member-3', membershipToken: token, joinProof: proof }));
    const err = await waitForMessage(ws2, 'error');
    expect(['INVALID_PEER_TOKEN', 'INVALID_MEMBERSHIP']).toContain(err.code);
    ws1.close();
    ws2.close();
  });

  it('rejects a reused join-proof nonce for a not-yet-admitted member', async () => {
    const host = generateIdentity();
    const member = generateIdentity();

    const res = await (await import('supertest')).default(app)
      .post('/api/sessions')
      .send({ name: 'WhitelistNonce', expiresInSeconds: 600, hostPublicKey: host.publicKey });
    const { sessionId } = res.body;

    const token = encodeToken(issueMembershipToken(host.secretKey, member.publicKey, sessionId));

    // First admission consumes nonce 'shared-nonce'.
    const proof1 = createJoinProof(member, sessionId, 'member-x', 'shared-nonce');
    const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws1.once('open', r));
    ws1.send(JSON.stringify({ type: 'join', sessionId, peerId: 'member-x', membershipToken: token, joinProof: proof1 }));
    await waitForMessage(ws1, 'joined');

    // A different peer id (never admitted) presenting the same nonce is blocked
    // by the proof-nonce guard.
    const proof2 = createJoinProof(member, sessionId, 'member-y', 'shared-nonce');
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((r) => ws2.once('open', r));
    ws2.send(JSON.stringify({ type: 'join', sessionId, peerId: 'member-y', membershipToken: token, joinProof: proof2 }));
    const err = await waitForMessage(ws2, 'error');
    expect(err.code).toBe('INVALID_MEMBERSHIP');
    ws1.close();
    ws2.close();
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
