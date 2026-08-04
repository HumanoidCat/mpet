import { describe, it, expect } from 'vitest';
import { createOrchestrator } from '../../src/core/orchestrator';
import { createEventBus } from '../../src/core/eventBus';
import { createMockAudioEngine } from '../../mocks/mockAudioEngine';
import { createMockAIPipeline } from '../../mocks/mockAIPipeline';
import { createMockScorer } from '../../mocks/mockScorer';
import type {
  AIPipeline,
  ChatMessage,
  PronunciationScorer,
} from '../../src/shared/contracts';

function setup(extra: { scorer?: PronunciationScorer; ai?: AIPipeline } = {}) {
  const bus = createEventBus();
  const orch = createOrchestrator({
    audio: createMockAudioEngine(),
    ai: extra.ai ?? createMockAIPipeline(),
    bus,
    scorer: extra.scorer,
  });
  return { bus, orch };
}

/** Espera a que se vacie la cola de microtareas del puntaje asincrono. */
const dejarCorrerElPuntaje = () => new Promise((r) => setTimeout(r, 50));

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

  it('sin comparador inyectado el turno funciona igual y no puntua', async () => {
    const { bus, orch } = setup();
    const messages: ChatMessage[] = [];
    bus.on('message', (e) => messages.push(e.message));

    await orch.toggleMic();
    await orch.toggleMic();
    await dejarCorrerElPuntaje();

    expect(messages).toHaveLength(2);
    expect(messages[0].pronunciation).toBeUndefined();
  });

  it('el turno responde sin esperar al puntaje, que llega despues (S6)', async () => {
    // Sintetizar una frase nueva tarda unos 10 s con el modelo real. Aqui se
    // simula con un retardo controlado: si el turno esperara al puntaje, no
    // podria terminar antes de que ese retardo se cumpla.
    const RETARDO_TTS = 300;
    const base = createMockAIPipeline();
    const lento: AIPipeline = {
      ...base,
      async speak(text: string) {
        await new Promise((r) => setTimeout(r, RETARDO_TTS));
        return base.speak(text);
      },
    };

    const { bus, orch } = setup({ scorer: createMockScorer(), ai: lento });
    const eventos: ChatMessage[] = [];
    bus.on('message', (e) => eventos.push(e.message));

    await orch.toggleMic();
    await orch.toggleMic();

    // El turno termino y la conversacion ya esta completa, con el sintetizador
    // todavia trabajando: esa es la razon de ser del calculo asincrono.
    expect(orch.getState()).toBe('idle');
    expect(eventos).toHaveLength(2);
    expect(eventos[0].pronunciation).toBeUndefined();

    await new Promise((r) => setTimeout(r, RETARDO_TTS + 200));

    // El puntaje reemite el MISMO mensaje, con el mismo id.
    expect(eventos).toHaveLength(3);
    const puntuado = eventos[2];
    expect(puntuado.id).toBe(eventos[0].id);
    expect(puntuado.role).toBe('user');
    expect(puntuado.pronunciation).toBeDefined();
    expect(puntuado.pronunciation!.overall).toBeGreaterThanOrEqual(0);
    expect(puntuado.pronunciation!.overall).toBeLessThanOrEqual(100);
  });

  it('si el sintetizador no devuelve audio, se omite el puntaje sin ensuciar el chat', async () => {
    // Es el estado del pipeline real mientras una etapa esta declarada pendiente.
    const sinVoz: AIPipeline = {
      ...createMockAIPipeline(),
      async speak() {
        return new Float32Array(0);
      },
    };
    const { bus, orch } = setup({ scorer: createMockScorer(), ai: sinVoz });
    const eventos: ChatMessage[] = [];
    const errores: string[] = [];
    bus.on('message', (e) => eventos.push(e.message));
    bus.on('error', (e) => errores.push(e.stage));

    await orch.toggleMic();
    await orch.toggleMic();
    await dejarCorrerElPuntaje();

    expect(eventos).toHaveLength(2);
    expect(errores).toHaveLength(0);
  });

  it('un fallo al puntuar se informa y no interrumpe la conversacion', async () => {
    const roto: PronunciationScorer = {
      async score() {
        throw new Error('comparador caido');
      },
    };
    const { bus, orch } = setup({ scorer: roto });
    const eventos: ChatMessage[] = [];
    const errores: string[] = [];
    bus.on('message', (e) => eventos.push(e.message));
    bus.on('error', (e) => errores.push(e.stage));

    await orch.toggleMic();
    await orch.toggleMic();
    await dejarCorrerElPuntaje();

    // Los dos mensajes del turno siguen ahi, sin puntaje inventado.
    expect(eventos).toHaveLength(2);
    expect(eventos[0].pronunciation).toBeUndefined();
    expect(errores).toContain('pronunciation');
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
