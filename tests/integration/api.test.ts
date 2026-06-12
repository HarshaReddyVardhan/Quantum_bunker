import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupApp } from '../../server';
import { Application } from 'express';

describe('HTTP API Integration Tests', () => {
  let app: Application;
  let server: any;
  let cleanupInterval: any;

  beforeAll(async () => {
    const setup = await setupApp();
    app = setup.app;
    server = setup.server;
    cleanupInterval = setup.cleanupInterval;
  });

  afterAll(() => {
    if (cleanupInterval) clearInterval(cleanupInterval);
    server.close();
  });

  it('should get health status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('should create a new session', async () => {
    const res = await request(app)
      .post('/api/sessions')
      .send({ name: 'Integration Vault', expiresInSeconds: 600 });
      
    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBeDefined();
    expect(res.body.hostRecoveryToken).toBeDefined();
    expect(res.body.name).toBe('Integration Vault');
  });

  it('should fetch an existing session', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Fetch Vault', expiresInSeconds: 600 });
      
    const sessionId = createRes.body.sessionId;

    const getRes = await request(app).get(`/api/sessions/${sessionId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(sessionId);
    expect(getRes.body.name).toBe('Fetch Vault');
  });

  it('must never expose secrets or peer identities in session metadata', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Leak Check', expiresInSeconds: 600 });

    const getRes = await request(app).get(`/api/sessions/${createRes.body.sessionId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.hostRecoveryToken).toBeUndefined();
    expect(getRes.body.hostId).toBeUndefined();
    expect(getRes.body.peers).toBeUndefined();
    expect(getRes.body.pendingPeers).toBeUndefined();
  });

  it('should refuse to refresh a session with no active participants', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Refresh Vault', expiresInSeconds: 600 });

    const refreshRes = await request(app).post(`/api/sessions/${createRes.body.sessionId}/refresh`);
    expect(refreshRes.status).toBe(409);
  });

  it('should return 404 for unknown session', async () => {
    const getRes = await request(app).get('/api/sessions/unknown-id');
    expect(getRes.status).toBe(404);
  });

  it('should allow host to destroy session', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Destroy Vault', expiresInSeconds: 600 });
      
    const sessionId = createRes.body.sessionId;
    const hostToken = createRes.body.hostRecoveryToken;

    const delRes = await request(app)
      .delete(`/api/sessions/${sessionId}`)
      .set('x-host-token', hostToken);
      
    expect(delRes.status).toBe(204);

    const getRes = await request(app).get(`/api/sessions/${sessionId}`);
    expect(getRes.status).toBe(404);
  });

  it('should block non-host from destroying session', async () => {
    const createRes = await request(app)
      .post('/api/sessions')
      .send({ name: 'Secure Vault', expiresInSeconds: 600 });
      
    const sessionId = createRes.body.sessionId;

    const delRes = await request(app)
      .delete(`/api/sessions/${sessionId}`)
      .set('x-host-token', 'invalid-token');
      
    expect(delRes.status).toBe(403);
    
    const getRes = await request(app).get(`/api/sessions/${sessionId}`);
    expect(getRes.status).toBe(200);
  });
});
