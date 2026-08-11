import { describe, it, expect } from 'vitest';
import { createOrchestrator } from '../../src/core/orchestrator';
import { createEventBus } from '../../src/core/eventBus';
import { createMockAudioEngine } from '../../mocks/mockAudioEngine';
import { createMockAIPipeline } from '../../mocks/mockAIPipeline';
import { createMockScorer } from '../../mocks/mockScorer';
import type {
  AIPipeline,
  AudioEngine,
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

/** Espera a que terminen los calculos que corren fuera del turno. */
const dejarCorrerElPuntaje = () => new Promise((r) => setTimeout(r, 50));

/**
 * Reduce los eventos `message` a la conversacion resultante, colapsando por `id`
 * igual que hace la interfaz.
 *
 * El mismo mensaje se emite varias veces —al publicarse, al llegar el puntaje y
 * al llegar las sugerencias—, asi que contar emisiones mide el numero de
 * calculos asincronos y no el contenido del chat. Casi todas las pruebas quieren
 * lo segundo.
 */
function conversacion(eventos: ChatMessage[]): ChatMessage[] {
  const porId = new Map<string, ChatMessage>();
  for (const m of eventos) porId.set(m.id, m);
  return [...porId.values()];
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

    const chat = conversacion(messages);
    expect(orch.getState()).toBe('idle');
    expect(transcribed.length).toBeGreaterThan(0);
    expect(chat).toHaveLength(2);
    expect(chat[0].role).toBe('user');
    expect(chat[0].correction?.corrected).toContain('went');
    expect(chat[1].role).toBe('tutor');
    expect(chat[1].text.length).toBeGreaterThan(0);
  });

  it('sin comparador inyectado el turno funciona igual y no puntua', async () => {
    const { bus, orch } = setup();
    const messages: ChatMessage[] = [];
    bus.on('message', (e) => messages.push(e.message));

    // Con objetivo puesto, para que lo que se prueba sea la ausencia de
    // comparador y no la ausencia de frase objetivo.
    orch.setFraseObjetivo('I need a new ship');
    await orch.toggleMic();
    await orch.toggleMic();
    await dejarCorrerElPuntaje();

    const chat = conversacion(messages);
    expect(chat).toHaveLength(2);
    expect(chat[0].pronunciation).toBeUndefined();
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

    orch.setFraseObjetivo('I need a new ship');
    await orch.toggleMic();
    await orch.toggleMic();

    // El turno termino y la conversacion ya esta completa, con el sintetizador
    // todavia trabajando: esa es la razon de ser del calculo asincrono.
    expect(orch.getState()).toBe('idle');
    expect(conversacion(eventos)).toHaveLength(2);
    expect(eventos[0].pronunciation).toBeUndefined();

    await new Promise((r) => setTimeout(r, RETARDO_TTS + 200));

    // El puntaje reemite el MISMO mensaje, con el mismo id: la conversacion
    // sigue teniendo dos mensajes aunque se hayan emitido mas eventos.
    expect(conversacion(eventos)).toHaveLength(2);
    const puntuado = eventos.filter((m) => m.pronunciation !== undefined).at(-1)!;
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

    // Sin objetivo la prueba pasaria sin llegar nunca al sintetizador.
    orch.setFraseObjetivo('I need a new ship');
    await orch.toggleMic();
    await orch.toggleMic();
    await dejarCorrerElPuntaje();

    const chat = conversacion(eventos);
    expect(chat).toHaveLength(2);
    expect(chat.every((m) => m.pronunciation === undefined)).toBe(true);
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

    // Sin objetivo no se llamaria al comparador y no habria fallo que informar.
    orch.setFraseObjetivo('I need a new ship');
    await orch.toggleMic();
    await orch.toggleMic();
    await dejarCorrerElPuntaje();

    // Los dos mensajes del turno siguen ahi, sin puntaje inventado.
    const chat = conversacion(eventos);
    expect(chat).toHaveLength(2);
    expect(chat.every((m) => m.pronunciation === undefined)).toBe(true);
    expect(errores).toContain('pronunciation');
  });

  it('las sugerencias llegan despues del turno y se adjuntan al mensaje', async () => {
    const { bus, orch } = setup();
    const eventos: ChatMessage[] = [];
    bus.on('message', (e) => eventos.push(e.message));

    await orch.toggleMic();
    await orch.toggleMic();
    await dejarCorrerElPuntaje();

    const conSugerencias = eventos.filter((m) => m.suggestions !== undefined);
    expect(conSugerencias.length).toBeGreaterThan(0);
    expect(conSugerencias[0].role).toBe('user');
    expect(conSugerencias[0].id).toBe(eventos[0].id);
    expect(conSugerencias[0].suggestions!.length).toBeGreaterThan(0);
  });

  it('si el pipeline no sugiere nada, no se emite un mensaje vacio', async () => {
    // Es el estado real mientras S6-T4 esta pendiente: `suggest()` devuelve [].
    // Emitir igual mostraria una seccion de sugerencias en blanco.
    const sinSugerencias: AIPipeline = {
      ...createMockAIPipeline(),
      async suggest() {
        return [];
      },
    };
    const { bus, orch } = setup({ ai: sinSugerencias });
    const eventos: ChatMessage[] = [];
    bus.on('message', (e) => eventos.push(e.message));

    await orch.toggleMic();
    await orch.toggleMic();
    await dejarCorrerElPuntaje();

    expect(eventos.every((m) => m.suggestions === undefined)).toBe(true);
  });

  it('un fallo al sugerir se informa y no interrumpe la conversacion', async () => {
    const roto: AIPipeline = {
      ...createMockAIPipeline(),
      async suggest() {
        throw new Error('modelo de sugerencias caido');
      },
    };
    const { bus, orch } = setup({ ai: roto });
    const eventos: ChatMessage[] = [];
    const errores: string[] = [];
    bus.on('message', (e) => eventos.push(e.message));
    bus.on('error', (e) => errores.push(e.stage));

    await orch.toggleMic();
    await orch.toggleMic();
    await dejarCorrerElPuntaje();

    expect(errores).toContain('suggestions');
    expect(eventos[0].role).toBe('user');
    expect(eventos[1].role).toBe('tutor');
  });

  it('el puntaje y las sugerencias no se pisan entre si', async () => {
    // Los dos corren fuera del turno y actualizan el MISMO mensaje. Si cada uno
    // lo reconstruyera desde la copia que capturo al arrancar, el que terminara
    // segundo borraria el campo del primero. Se fuerza que las sugerencias
    // terminen despues del puntaje para que el orden sea siempre el mismo.
    const base = createMockAIPipeline();
    const sugerenciasLentas: AIPipeline = {
      ...base,
      async suggest(text: string) {
        await new Promise((r) => setTimeout(r, 200));
        return base.suggest(text);
      },
    };

    const { bus, orch } = setup({ scorer: createMockScorer(), ai: sugerenciasLentas });
    const eventos: ChatMessage[] = [];
    bus.on('message', (e) => eventos.push(e.message));

    orch.setFraseObjetivo('I need a new ship');
    await orch.toggleMic();
    await orch.toggleMic();
    await new Promise((r) => setTimeout(r, 500));

    const final = eventos.filter((m) => m.role === 'user').at(-1)!;
    expect(final.pronunciation).toBeDefined();
    expect(final.suggestions!.length).toBeGreaterThan(0);
    // Y lo que ya traia el turno sigue ahi.
    expect(final.correction?.corrected).toContain('went');
  });

  it('si falla al detener la captura, el boton no queda atrapado en grabando', async () => {
    // Sin esto el estado se quedaba en `recording`: la interfaz creia que seguia
    // grabando y no habia forma de salir sin recargar la pagina.
    const micRoto: AudioEngine = {
      ...createMockAudioEngine(),
      async stop() {
        throw new Error('el microfono se desconecto');
      },
    };
    const bus = createEventBus();
    const orch = createOrchestrator({ audio: micRoto, ai: createMockAIPipeline(), bus });
    const errores: string[] = [];
    bus.on('error', (e) => errores.push(e.stage));

    await orch.toggleMic();
    await orch.toggleMic();

    expect(orch.getState()).toBe('idle');
    expect(errores).toContain('capture');
  });

  it('una grabacion vacia no llega al reconocedor', async () => {
    // Pulsar y soltar sin hablar. Transcribir silencio cuesta segundos y el
    // reconocedor puede devolver texto inventado.
    const sinAudio: AudioEngine = {
      ...createMockAudioEngine(),
      async stop() {
        return new Float32Array(0);
      },
    };
    let transcribio = false;
    const ai: AIPipeline = {
      ...createMockAIPipeline(),
      async transcribe(pcm) {
        transcribio = true;
        return createMockAIPipeline().transcribe(pcm);
      },
    };
    const bus = createEventBus();
    const orch = createOrchestrator({ audio: sinAudio, ai, bus });
    const eventos: ChatMessage[] = [];
    bus.on('message', (e) => eventos.push(e.message));

    await orch.toggleMic();
    await orch.toggleMic();

    expect(transcribio).toBe(false);
    expect(eventos).toHaveLength(0);
    expect(orch.getState()).toBe('idle');
  });

  it('si no se reconoce nada, no se agrega un mensaje vacio al chat', async () => {
    const soloRuido: AIPipeline = {
      ...createMockAIPipeline(),
      async transcribe() {
        return { text: '   ', words: [] };
      },
    };
    const { bus, orch } = setup({ ai: soloRuido });
    const eventos: ChatMessage[] = [];
    bus.on('message', (e) => eventos.push(e.message));

    await orch.toggleMic();
    await orch.toggleMic();
    await dejarCorrerElPuntaje();

    expect(eventos).toHaveLength(0);
    expect(orch.getState()).toBe('idle');
  });

  it('sin frase objetivo no se puntua la pronunciacion (S9-T3)', async () => {
    // Es el error de diseno que Fabrizio destapo midiendo: se sintetizaba la
    // transcripcion, o sea la propia equivocacion del estudiante, y se comparaba
    // contra ella. Sin objetivo no existe una pronunciacion correcta, asi que no
    // se puntua. Mejor ningun numero que uno que mide parecido de timbre.
    const { bus, orch } = setup({ scorer: createMockScorer() });
    const eventos: ChatMessage[] = [];
    bus.on('message', (e) => eventos.push(e.message));

    expect(orch.getFraseObjetivo()).toBeNull();

    await orch.toggleMic();
    await orch.toggleMic();
    await new Promise((r) => setTimeout(r, 300));

    expect(eventos.every((m) => m.pronunciation === undefined)).toBe(true);
  });

  it('con frase objetivo se sintetiza el OBJETIVO, no lo que se dijo', async () => {
    // La referencia tiene que ser la pronunciacion correcta. Si se sintetizara la
    // transcripcion, el estudiante se compararia contra su propio error y el
    // puntaje no podria detectar una palabra mal dicha.
    const pedidas: string[] = [];
    const base = createMockAIPipeline();
    const espia: AIPipeline = {
      ...base,
      async speak(text: string) {
        pedidas.push(text);
        return base.speak(text);
      },
    };

    const { bus, orch } = setup({ scorer: createMockScorer(), ai: espia });
    const eventos: ChatMessage[] = [];
    bus.on('message', (e) => eventos.push(e.message));

    orch.setFraseObjetivo('I need a new ship');
    await orch.toggleMic();
    await orch.toggleMic();
    await new Promise((r) => setTimeout(r, 300));

    expect(pedidas).toContain('I need a new ship');
    const puntuado = eventos.filter((m) => m.pronunciation !== undefined);
    expect(puntuado.length).toBeGreaterThan(0);
  });

  it('la frase objetivo se limpia con null y con texto en blanco', async () => {
    const { orch } = setup();

    orch.setFraseObjetivo('  Please sit down  ');
    expect(orch.getFraseObjetivo()).toBe('Please sit down');

    orch.setFraseObjetivo('   ');
    expect(orch.getFraseObjetivo()).toBeNull();

    orch.setFraseObjetivo('otra');
    orch.setFraseObjetivo(null);
    expect(orch.getFraseObjetivo()).toBeNull();
  });

  it('un turno de practica adjunta la comparacion contra el objetivo', async () => {
    // El mock transcribe "Yesterday I go to the market". Se pide repetir otra
    // cosa, asi que casi todas las palabras del objetivo no se reconocen.
    const { bus, orch } = setup();
    const eventos: ChatMessage[] = [];
    bus.on('message', (e) => eventos.push(e.message));

    orch.setFraseObjetivo('I need a new ship');
    await orch.toggleMic();
    await orch.toggleMic();

    const usuario = eventos.find((m) => m.role === 'user')!;
    expect(usuario.target).toBe('I need a new ship');
    expect(usuario.targetMatch).toBeDefined();
    expect(usuario.targetMatch!.palabras).toHaveLength(5);
    expect(usuario.targetMatch!.noReconocidas).toBeGreaterThan(0);
  });

  it('en conversacion libre el mensaje no lleva objetivo ni comparacion', async () => {
    const { bus, orch } = setup();
    const eventos: ChatMessage[] = [];
    bus.on('message', (e) => eventos.push(e.message));

    await orch.toggleMic();
    await orch.toggleMic();

    const usuario = eventos.find((m) => m.role === 'user')!;
    expect(usuario.target).toBeUndefined();
    expect(usuario.targetMatch).toBeUndefined();
  });

  it('la comparacion contra el objetivo llega DENTRO del turno', async () => {
    // Es texto contra texto: no cuesta nada y debe llegar junto con la
    // correccion, no despues como el puntaje acustico.
    const { bus, orch } = setup();
    let primerMensaje: ChatMessage | null = null;
    bus.on('message', (e) => {
      if (!primerMensaje && e.message.role === 'user') primerMensaje = e.message;
    });

    orch.setFraseObjetivo('I need a new ship');
    await orch.toggleMic();
    await orch.toggleMic();

    expect(primerMensaje!.targetMatch).toBeDefined();
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
