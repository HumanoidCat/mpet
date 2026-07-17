import type { AppEvent, EventBus } from '@shared/contracts';

/** Event bus mínimo tipado. Dueño: Alejandro. */
export function createEventBus(): EventBus {
  const listeners = new Map<string, Set<(e: AppEvent) => void>>();
  return {
    emit(e) {
      listeners.get(e.type)?.forEach((cb) => cb(e));
    },
    on(type, cb) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      const set = listeners.get(type)!;
      set.add(cb as (e: AppEvent) => void);
      return () => set.delete(cb as (e: AppEvent) => void);
    },
  };
}
