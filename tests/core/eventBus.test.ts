import { describe, it, expect } from 'vitest';
import { createEventBus } from '../../src/core/eventBus';

describe('EventBus', () => {
  it('entrega eventos a los suscriptores del tipo correcto', () => {
    const bus = createEventBus();
    const seen: string[] = [];
    bus.on('recording-started', () => seen.push('started'));
    bus.emit({ type: 'recording-started' });
    bus.emit({ type: 'error', stage: 'asr', error: 'x' });
    expect(seen).toEqual(['started']);
  });

  it('unsubscribe deja de recibir eventos', () => {
    const bus = createEventBus();
    let n = 0;
    const off = bus.on('recording-started', () => n++);
    bus.emit({ type: 'recording-started' });
    off();
    bus.emit({ type: 'recording-started' });
    expect(n).toBe(1);
  });
});
