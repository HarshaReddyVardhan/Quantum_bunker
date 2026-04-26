import winston from 'winston';
import { IEventBus } from '../../application/ports/event-bus.port';

export function setupLogging(eventBus: IEventBus) {
  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
      new winston.transports.Console({
        format: winston.format.simple(),
      }),
    ],
  });

  eventBus.on('SessionCreated', (e) => logger.info(`SessionCreated: ${e.sessionId}`));
  eventBus.on('MessageRelayed', (e) => logger.info(`MessageRelayed: ${e.sessionId}`, e.payload));
  eventBus.on('EnvelopeRejected', (e) => logger.warn(`EnvelopeRejected: ${e.sessionId}`, e.payload));
  eventBus.on('PeerJoined', (e) => logger.info(`PeerJoined: ${e.sessionId} ${e.payload.peerId}`));
  eventBus.on('SessionExpired', (e) => logger.info(`SessionExpired: ${e.sessionId} - Reason: ${e.payload.reason}`));
}
