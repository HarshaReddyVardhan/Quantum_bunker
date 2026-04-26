import { WebSocketServer } from 'ws';
import { InMemorySessionStore } from '../adapters/store/in-memory-session.store';
import { EventEmitterBus } from '../adapters/events/event-emitter.bus';
import { WsTransport } from '../adapters/transport/ws.transport';
import { CreateSession } from '../application/use-cases/create-session.use-case';
import { RelayMessage } from '../application/use-cases/relay-message.use-case';
import { CleanupSessions } from '../application/use-cases/cleanup-sessions.use-case';
import { setupLogging } from '../adapters/logging/winston.logger';

export function createContainer(wss: WebSocketServer) {
  const store = new InMemorySessionStore();
  const eventBus = new EventEmitterBus();
  
  setupLogging(eventBus);

  const transport = new WsTransport(wss, eventBus, store);
  
  const createSession = new CreateSession(store, eventBus);
  const relayMessage = new RelayMessage(store, transport, eventBus);
  const cleanupSessions = new CleanupSessions(store, eventBus);

  transport.setRelayMessage(relayMessage);

  return {
    createSession,
    relayMessage,
    cleanupSessions,
    store,
    transport,
    eventBus
  };
}
