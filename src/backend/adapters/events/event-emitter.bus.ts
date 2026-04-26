import { EventEmitter } from 'events';
import { IEventBus } from '../../application/ports/event-bus.port';
import { DomainEvent } from '../../../shared/contracts/v1/events';

export class EventEmitterBus implements IEventBus {
  private bus = new EventEmitter();

  emit(event: DomainEvent): void {
    this.bus.emit(event.type, event);
  }

  on(type: string, handler: (event: DomainEvent) => void): void {
    this.bus.on(type, handler);
  }
}
