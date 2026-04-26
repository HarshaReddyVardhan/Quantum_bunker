import { DomainEvent } from '../../../shared/contracts/v1/events';

export interface IEventBus {
  emit(event: DomainEvent): void;
  on(type: string, handler: (event: DomainEvent) => void): void;
}
