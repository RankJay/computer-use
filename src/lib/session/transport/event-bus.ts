import type { RuntimeEvent } from "@/lib/session/events";

export type EventBusListener = (event: RuntimeEvent) => void;

export type EventBus = {
  emit: (event: RuntimeEvent) => void;
  subscribe: (listener: EventBusListener) => () => void;
};

export function createEventBus(): EventBus {
  const listeners = new Set<EventBusListener>();

  return {
    emit(event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
