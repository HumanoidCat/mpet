import { describe, it, expect } from 'vitest';
import { createOrchestrator } from '../../src/core/orchestrator';
import { createEventBus } from '../../src/core/eventBus';
import { createMockAudioEngine } from '../../mocks/mockAudioEngine';
import { createMockAIPipeline } from '../../mocks/mockAIPipeline';
import type { ChatMessage } from '../../src/shared/contracts';

function setup() {
  const bus = createEventBus();
  const orch = createOrchestrator({
    audio: createMockAudioEngine(),
    ai: createMockAIPipeline(),
    bus,
  });
  return { bus, orch };
}

describe('Orchestrator v0 (S2-T7)', () => {
  it('arranca en idle', () => {
    const { orch } = setup();
    expect(orch.getState()).toBe('idle');
  });

  it('toggleMic pasa a recording y emite recording-started', async () => {
    const { bus, orch } = setup();
    let started = false;
    bus.on('recording-started', () => (started = true));

    await orch.toggleMic();

    expect(orch.getState()).toBe('recording');
    expect(started).toBe(true);
  });

  it('un turno completo emite transcripcion, mensaje de usuario con correccion y respuesta del tutor', async () => {
    const { bus, orch } = setup();
    const messages: ChatMessage[] = [];
    let transcribed = '';
    bus.on('message', (e) => messages.push(e.message));
    bus.on('transcription', (e) => (transcribed = e.result.text));

    await orch.toggleMic(); // empieza a grabar
    await orch.toggleMic(); // detiene y procesa

    expect(orch.getState()).toBe('idle');
    expect(transcribed.length).toBeGreaterThan(0);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].correction?.corrected).toContain('went');
    expect(messages[1].role).toBe('tutor');
    expect(messages[1].text.length).toBeGreaterThan(0);
  });

  it('init reporta progreso de carga de modelos', async () => {
    const { bus, orch } = setup();
    const progress: number[] = [];
    bus.on('model-progress', (e) => progress.push(e.progress));

    await orch.init();

    expect(progress.length).toBeGreaterThan(0);
    expect(progress[progress.length - 1]).toBe(1);
  });
});
