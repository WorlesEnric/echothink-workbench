import type { EmittedEvent } from "../adapters.js";

export type DomainEventCallback = (event: EmittedEvent) => void | Promise<void>;

export interface DomainEventBus {
  emit(event: EmittedEvent): Promise<void>;
  subscribe(type: string, cb: DomainEventCallback): () => void;
  list?(): EmittedEvent[];
}

export class InMemoryDomainEventBus implements DomainEventBus {
  private readonly subscribers = new Map<string, Set<DomainEventCallback>>();
  private readonly events: EmittedEvent[] = [];

  async emit(event: EmittedEvent): Promise<void> {
    this.events.push(cloneEvent(event));
    const callbacks = this.subscribers.get(event.type);
    if (!callbacks) {
      return;
    }
    await Promise.all([...callbacks].map((cb) => cb(cloneEvent(event))));
  }

  subscribe(type: string, cb: DomainEventCallback): () => void {
    const callbacks = this.subscribers.get(type) ?? new Set<DomainEventCallback>();
    callbacks.add(cb);
    this.subscribers.set(type, callbacks);

    return () => {
      callbacks.delete(cb);
      if (callbacks.size === 0) {
        this.subscribers.delete(type);
      }
    };
  }

  list(): EmittedEvent[] {
    return this.events.map(cloneEvent);
  }

  reset(): void {
    this.events.length = 0;
    this.subscribers.clear();
  }
}

function cloneEvent(event: EmittedEvent): EmittedEvent {
  return JSON.parse(JSON.stringify(event)) as EmittedEvent;
}
