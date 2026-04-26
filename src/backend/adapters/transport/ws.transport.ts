import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { IRelayTransport } from '../../application/ports/relay-transport.port';
import { RelayEnvelope } from '../../../shared/contracts/v1/envelope';
import { IEventBus } from '../../application/ports/event-bus.port';
import { RelayMessage } from '../../application/use-cases/relay-message.use-case';
import { RelayEnvelopeSchema } from '../../../shared/contracts/v1/schemas';
import { ISessionStore } from '../../application/ports/session-store.port';
import { SessionStatus } from '../../../shared/contracts/v1/session';
import { RELAY_LIMITS } from '../../core/constants';

export class WsTransport implements IRelayTransport {
  private connections = new Map<string, WebSocket>(); // "sessionId:peerId" -> socket
  private messageCounters = new Map<string, { count: number; lastReset: number }>();
  private ipCounters = new Map<string, { count: number; lastReset: number }>();

  constructor(
    private readonly wss: WebSocketServer,
    private readonly eventBus: IEventBus,
    private readonly store: ISessionStore,
    private relayMessage?: RelayMessage // Set after initialization
  ) {
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
  }

  setRelayMessage(relayMessage: RelayMessage) {
    this.relayMessage = relayMessage;
  }

  private checkIpLimit(req: IncomingMessage): boolean {
    const ip = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const counter = this.ipCounters.get(ip) || { count: 0, lastReset: now };

    if (now - counter.lastReset > RELAY_LIMITS.CONN_WINDOW_MS) {
      counter.count = 1;
      counter.lastReset = now;
    } else {
      counter.count++;
    }

    this.ipCounters.set(ip, counter);

    return counter.count <= RELAY_LIMITS.CONN_PER_IP_LIMIT;
  }

  private checkMessageLimit(sessionId: string, peerId: string): boolean {
    const key = `${sessionId}:${peerId}`;
    const now = Date.now();
    const counter = this.messageCounters.get(key) || { count: 0, lastReset: now };

    if (now - counter.lastReset > 1000) {
      counter.count = 1;
      counter.lastReset = now;
    } else {
      counter.count++;
    }

    this.messageCounters.set(key, counter);

    return counter.count <= RELAY_LIMITS.MSG_PER_SECOND_LIMIT;
  }

  private async handleConnection(ws: WebSocket, req: IncomingMessage) {
    if (!this.checkIpLimit(req)) {
      ws.send(JSON.stringify({ type: 'error', code: 'RATE_LIMIT_EXCEEDED', message: 'Connection rate limit exceeded' }));
      ws.close(1008, 'Rate limit exceeded');
      return;
    }

    let currentPeerId: string | null = null;
    let currentSessionId: string | null = null;

    ws.on('message', async (data) => {
      try {
        const raw = JSON.parse(data.toString());
        
        // Initial handshake to join session
        if (raw.type === 'join') {
          const sessionId = raw.sessionId?.trim();
          const peerId = raw.peerId?.trim();
          
          if (!sessionId || !peerId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Missing sessionId or peerId' }));
            return;
          }

          const session = await this.store.get(sessionId);
          
          if (!session) {
            ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }));
            return;
          }

          if (Object.keys(session.peers).length >= session.maxPeers && !session.peers[peerId]) {
            ws.send(JSON.stringify({ type: 'error', message: 'Session full' }));
            return;
          }

          currentPeerId = peerId;
          currentSessionId = sessionId;
          const connKey = `${sessionId}:${peerId}`;

          // Host Recovery check
          const providedRecoveryToken = raw.hostRecoveryToken;
          if (providedRecoveryToken && providedRecoveryToken === session.hostRecoveryToken) {
            // Reclaiming host status
            session.hostId = peerId; // Update hostId to the new peerId if it changed
            this.connections.set(connKey, ws);
            session.peers[peerId] = { id: peerId, joinedAt: Date.now(), lastSeenAt: Date.now() };
            session.participantCount = (session.participantCount || 0) + 1;
            if (session.participantCount > 2) {
              session.isGroup = true;
            }
            session.emptySince = null;
            session.status = SessionStatus.ACTIVE;
            await this.store.save(session);
            
            ws.send(JSON.stringify({ type: 'joined', sessionId, peerId, isHost: true }));
            this.broadcastPeerUpdate(session);
            return;
          }

          if (peerId === session.hostId || session.peers[peerId]) {
            // Host or already accepted peer joining
            this.connections.set(connKey, ws);
            session.peers[peerId] = { id: peerId, joinedAt: Date.now(), lastSeenAt: Date.now() };
            session.participantCount = (session.participantCount || 0) + 1;
            if (session.participantCount > 2) {
              session.isGroup = true;
            }
            session.emptySince = null;
            session.status = SessionStatus.ACTIVE;
            await this.store.save(session);
            
            ws.send(JSON.stringify({ type: 'joined', sessionId, peerId }));
            this.broadcastPeerUpdate(session);
            return;
          }

          // Guest requesting join
          const hostKey = `${sessionId}:${session.hostId}`;
          const hostWs = this.connections.get(hostKey);

          if (!hostWs || hostWs.readyState !== WebSocket.OPEN) {
             ws.send(JSON.stringify({ type: 'error', message: 'Host is offline' }));
             return;
          }

          session.pendingPeers = session.pendingPeers || {};
          session.pendingPeers[peerId] = { id: peerId, message: raw.message || 'Wants to join', requestedAt: Date.now() };
          await this.store.save(session);

          this.connections.set(connKey, ws); // Keep connection alive but restricted
          hostWs.send(JSON.stringify({ type: 'join_request', peerId, message: raw.message || 'Wants to join' }));
          ws.send(JSON.stringify({ type: 'pending', message: 'Waiting for host approval...' }));
          return;
        }

        if (raw.type === 'accept_join') {
          if (!currentSessionId || !currentPeerId) return;
          const session = await this.store.get(currentSessionId);
          if (!session || session.hostId !== currentPeerId) return;

          const targetPeer = raw.peerId;
          if (session.pendingPeers && session.pendingPeers[targetPeer]) {
            delete session.pendingPeers[targetPeer];
            session.peers[targetPeer] = { id: targetPeer, joinedAt: Date.now(), lastSeenAt: Date.now() };
            session.participantCount = (session.participantCount || 0) + 1;
            if (session.participantCount > 2) {
              session.isGroup = true;
            }
            session.emptySince = null;
            await this.store.save(session);

            const targetKey = `${currentSessionId}:${targetPeer}`;
            const targetWs = this.connections.get(targetKey);
            if (targetWs) {
               targetWs.send(JSON.stringify({ type: 'joined', sessionId: currentSessionId, peerId: targetPeer }));
            }
            this.broadcastPeerUpdate(session);
          }
          return;
        }

        if (raw.type === 'reject_join') {
          if (!currentSessionId || !currentPeerId) return;
          const session = await this.store.get(currentSessionId);
          if (!session || session.hostId !== currentPeerId) return;

          const targetPeer = raw.peerId;
          if (session.pendingPeers && session.pendingPeers[targetPeer]) {
            delete session.pendingPeers[targetPeer];
            await this.store.save(session);

            const targetKey = `${currentSessionId}:${targetPeer}`;
            const targetWs = this.connections.get(targetKey);
            if (targetWs) {
               targetWs.send(JSON.stringify({ type: 'error', message: 'Join rejected by host' }));
               targetWs.close(1008, 'Join rejected');
               this.connections.delete(targetKey);
            }
          }
          return;
        }

        if (raw.type === 'kick_peer') {
          if (!currentSessionId || !currentPeerId) return;
          const session = await this.store.get(currentSessionId);
          if (!session || session.hostId !== currentPeerId || !session.isGroup) return;

          const targetPeer = raw.peerId;
          if (session.peers[targetPeer] && targetPeer !== session.hostId) {
            delete session.peers[targetPeer];
            session.participantCount = Math.max(0, session.participantCount - 1);
            if (session.participantCount === 0) {
              session.emptySince = Date.now();
            }
            await this.store.save(session);

            const targetKey = `${currentSessionId}:${targetPeer}`;
            const targetWs = this.connections.get(targetKey);
            if (targetWs) {
               targetWs.send(JSON.stringify({ type: 'error', message: 'You have been kicked by the host' }));
               targetWs.close(1008, 'Kicked by host');
               this.connections.delete(targetKey);
            }
            this.broadcastPeerUpdate(session);
          }
          return;
        }

        // Regular relay
        if (this.relayMessage) {
          if (currentPeerId && currentSessionId && !this.checkMessageLimit(currentSessionId, currentPeerId)) {
            ws.send(JSON.stringify({ type: 'error', code: 'RATE_LIMIT_EXCEEDED', message: 'Message rate limit exceeded' }));
            return;
          }
          const session = await this.store.get(currentSessionId!);
          if (!session || !session.peers[currentPeerId!]) {
             ws.send(JSON.stringify({ type: 'error', message: 'Not authorized or pending' }));
             return;
          }
          const result = RelayEnvelopeSchema.safeParse(raw);
          if (result.success) {
            await this.relayMessage.execute(result.data);
          } else {
             ws.send(JSON.stringify({ type: 'error', message: 'Invalid envelope', details: result.error.issues }));
          }
        }

      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', async () => {
      if (currentPeerId && currentSessionId) {
        const connKey = `${currentSessionId}:${currentPeerId}`;
        this.connections.delete(connKey);
        
        const session = await this.store.get(currentSessionId);
        if (session && session.peers[currentPeerId]) {
          session.participantCount = Math.max(0, (session.participantCount || 1) - 1);
          if (session.participantCount === 0) {
            session.emptySince = Date.now();
          }
          await this.store.save(session);
          this.broadcastPeerUpdate(session);
        }

        this.eventBus.emit({
          type: 'PeerDisconnected',
          sessionId: currentSessionId,
          occurredAt: Date.now(),
          payload: { peerId: currentPeerId }
        });
      }
    });
  }

  private broadcastPeerUpdate(session: any) {
    const peers = Object.keys(session.peers).filter(id => this.isPeerConnected(session.id, id));
    for (const peerId of peers) {
      const connKey = `${session.id}:${peerId}`;
      const ws = this.connections.get(connKey);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'peer_update', peers, isGroup: !!session.isGroup }));
      }
    }
  }

  async send(sessionId: string, peerId: string, envelope: RelayEnvelope): Promise<void> {
    const connKey = `${sessionId}:${peerId}`;
    const ws = this.connections.get(connKey);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(envelope));
    }
  }

  isPeerConnected(sessionId: string, peerId: string): boolean {
    const connKey = `${sessionId}:${peerId}`;
    const ws = this.connections.get(connKey);
    return ws ? ws.readyState === WebSocket.OPEN : false;
  }

  disconnectSession(sessionId: string): void {
    for (const [key, ws] of this.connections.entries()) {
      if (key.startsWith(`${sessionId}:`)) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', message: 'Session destroyed' }));
          ws.close(1008, 'Session destroyed');
        }
        this.connections.delete(key);
      }
    }
  }
}
