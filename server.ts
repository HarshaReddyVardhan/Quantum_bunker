import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import { createServer as createViteServer } from 'vite';
import { createContainer } from './src/backend/entrypoints/container';
import { CreateSessionRequestSchema } from './src/shared/contracts/v1/schemas';
import { CLEANUP_INTERVAL_MS } from './src/backend/core/constants';

export async function setupApp() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const PORT = 3000;

  const container = createContainer(wss);

  // Background Tasks
  const cleanupInterval = setInterval(() => {
    container.cleanupSessions.execute().catch(err => {
      console.error('Cleanup task failed:', err);
    });
  }, CLEANUP_INTERVAL_MS);

  app.use(cors());
  app.use(helmet({
    contentSecurityPolicy: false, // Disable for dev environment iframe
  }));
  app.use(express.json());

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  app.post('/api/sessions', async (req, res) => {
    try {
      const result = CreateSessionRequestSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error.issues });
      }

      const session = await container.createSession.execute(result.data.expiresInSeconds, result.data.name);
      console.log(`[API] Created session: ${session.id}`);
      res.status(201).json({
        sessionId: session.id,
        name: session.name,
        expiresAt: session.expiresAt,
        publicKey: 'placeholder-phase-2',
        hostId: session.hostId,
        hostRecoveryToken: session.hostRecoveryToken
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/sessions/:id', async (req, res) => {
    const id = req.params.id.trim();
    const session = await container.store.get(id);
    if (!session) {
      console.warn(`[API] Session not found: ${id}`);
      return res.status(404).json({ error: 'Session not found' });
    }
    console.log(`[API] Fetched session: ${id}`);
    res.json(session);
  });

  app.post('/api/sessions/:id/refresh', async (req, res) => {
    const session = await container.store.get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Extend session by another 15 mins (or whatever the default is), up to max TTL
    const extension = 15 * 60 * 1000;
    const newExpiresAt = Math.min(Date.now() + extension, session.createdAt + 24 * 60 * 60 * 1000);
    session.expiresAt = newExpiresAt;
    session.lastActivityAt = Date.now();
    
    await container.store.save(session);
    
    res.json({
      sessionId: session.id,
      expiresAt: session.expiresAt
    });
  });

  app.delete('/api/sessions/:id', async (req, res) => {
    const id = req.params.id;
    const session = await container.store.get(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const hostToken = req.headers['x-host-token'];
    if (session.hostRecoveryToken !== hostToken) {
      return res.status(403).json({ error: 'Only the host can destroy the session' });
    }
    await container.store.delete(id);
    container.transport.disconnectSession(id);
    console.log(`[API] Destroyed session: ${id}`);
    res.status(204).send();
  });

  // Vite middleware for development (skip in test environments)
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return { app, server, wss, container, PORT, cleanupInterval };
}

async function startServer() {
  const { server, PORT } = await setupApp();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Quantum Bunker running on http://0.0.0.0:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
