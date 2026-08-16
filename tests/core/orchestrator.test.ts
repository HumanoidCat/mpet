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

/**
 * Espera a que terminen los calculos que corren fuera del turno: el puntaje de
 * pronunciacion y las sugerencias.
 *
 * POR QUE 400 ms Y NO 50: hasta el 16 de agosto las sugerencias se pedian ANTES
 * del `await` de la respuesta del tutor, asi que se solapaban con esos 400 ms y ya
 * habian terminado cuando el turno cerraba; 50 ms bastaban. Al invertir el orden
 * (I-11: la respuesta del tutor va primero porque comparten worker) las
 * sugerencias arrancan al final del turno y necesitan sus propios 300 ms del mock.
 *
 * El numero sale del mock, no del aire: `mockAIPipeline.suggest` espera 300 ms.
 * Se deja margen para no volver la suite sensible a la carga de la maquina.
 */
const dejarCorrerElPuntaje = () => new Promise((r) => setTimeout(r, 400));

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
    // Las sugerencias de esta prueba tardan 500 ms a proposito (200 propios + 300
    // del mock) y, desde I-11, arrancan cuando el turno ya termino en vez de
    // solaparse con la respuesta del tutor. Esperar 500 dejaba la prueba empatada
    // consigo misma: pasaba o fallaba segun la carga de la maquina.
    await new Promise((r) => setTimeout(r, 900));

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

/**
 * Tutor bilingue.
 *
 * QUE PROTEGEN: un turno en espanol recorre tres ramas distintas del orquestador, y
 * las tres existen porque los modelos de abajo son de solo ingles. Si alguna se cae,
 * el fallo no da error: produce basura en pantalla (una "correccion" de una frase en
 * espanol) o una respuesta que ignora que el estudiante no supo decirlo en ingles.
 */
describe('orquestador · turno en espanol', () => {
  it('NO corrige la gramatica de una frase en espanol', async () => {
    // El corrector es un T5 entrenado solo en ingles. Aplicarselo a una frase en
    // espanol no da una correccion mala, da basura, y el chat la resaltaria como si
    // fuera un error real del estudiante.
    const bus = createEventBus();
    const orch = createOrchestrator({
      audio: createMockAudioEngine(),
      ai: createMockAIPipeline({ language: 'es' }),
      bus,
    });

    const mensajes: ChatMessage[] = [];
    bus.on('message', (e) => mensajes.push(e.message));

    await orch.toggleMic();
    await orch.toggleMic();
    await dejarCorrerElPuntaje();

    const usuario = conversacion(mensajes).find((m) => m.role === 'user');
    expect(usuario).toBeDefined();
    // Sin ediciones: no se llamo al corrector, y el texto queda tal cual se dijo.
    expect(usuario!.correction?.edits).toEqual([]);
    expect(usuario!.correction?.corrected).toBe(usuario!.text);
  });

  it('NO pide sugerencias sobre una frase en espanol', async () => {
    // Las sugerencias son reescrituras en ingles: sobre una frase en espanol no
    // significan nada, por la misma razon que la correccion.
    const bus = createEventBus();
    const orch = createOrchestrator({
      audio: createMockAudioEngine(),
      ai: createMockAIPipeline({ language: 'es' }),
      bus,
    });

    const mensajes: ChatMessage[] = [];
    bus.on('message', (e) => mensajes.push(e.message));

    await orch.toggleMic();
    await orch.toggleMic();
    await dejarCorrerElPuntaje();

    const usuario = conversacion(mensajes).find((m) => m.role === 'user');
    expect(usuario!.suggestions).toBeUndefined();
  });

  it('le pasa el idioma al tutor, que responde ayudando a decirlo en ingles', async () => {
    const bus = createEventBus();
    const orch = createOrchestrator({
      audio: createMockAudioEngine(),
      ai: createMockAIPipeline({ language: 'es' }),
      bus,
    });

    const mensajes: ChatMessage[] = [];
    bus.on('message', (e) => mensajes.push(e.message));

    await orch.toggleMic();
    await orch.toggleMic();
    await dejarCorrerElPuntaje();

    const tutor = conversacion(mensajes).find((m) => m.role === 'tutor');
    expect(tutor).toBeDefined();
    // El mock solo devuelve esta frase cuando recibe language: 'es'. Si el
    // orquestador no le pasara el idioma, responderia la de ingles.
    expect(tutor!.text).toContain('In English:');
  });

  it('en ingles se sigue corrigiendo y sugiriendo, como antes', async () => {
    // La contraparte: el camino bilingue no debe apagar nada del camino normal.
    const { bus, orch } = setup();
    const mensajes: ChatMessage[] = [];
    bus.on('message', (e) => mensajes.push(e.message));

    await orch.toggleMic();
    await orch.toggleMic();
    await dejarCorrerElPuntaje();

    const usuario = conversacion(mensajes).find((m) => m.role === 'user');
    expect(usuario!.correction?.edits.length).toBeGreaterThan(0);
    expect(usuario!.suggestions?.length).toBeGreaterThan(0);
  });
});

/**
 * Orden de las llamadas dentro del turno.
 *
 * QUE PROTEGE: las sugerencias y la respuesta del tutor salen del MISMO worker y
 * del MISMO modelo, asi que se atienden una detras de otra. Si las sugerencias se
 * piden primero, la respuesta que el estudiante esta esperando queda detras de dos
 * generaciones que nadie espera. No da error: solo hace el turno mas lento, que es
 * la clase de defecto que no se ve en una prueba de contenido.
 */
describe('orquestador · orden del turno', () => {
  it('pide la respuesta del tutor ANTES que las sugerencias', async () => {
    const orden: string[] = [];
    const base = createMockAIPipeline();
    const ai: AIPipeline = {
      ...base,
      async suggest(text) {
        orden.push('suggest');
        return base.suggest(text);
      },
      async reply(history, language) {
        orden.push('reply');
        return base.reply(history, language);
      },
    };

    const { orch } = setup({ ai });
    await orch.toggleMic();
    await orch.toggleMic();
    await dejarCorrerElPuntaje();

    expect(orden).toContain('reply');
    expect(orden).toContain('suggest');
    expect(orden.indexOf('reply')).toBeLessThan(orden.indexOf('suggest'));
  });
});

/**
 * Turno escrito.
 *
 * QUE PROTEGE: escribir es una via alternativa para practicar gramatica, no un
 * reemplazo del microfono. Las dos diferencias con el turno hablado —no pasa por el
 * reconocedor y no puntua pronunciacion— son deliberadas, y si alguna se pierde el
 * fallo es silencioso: o se gasta el reconocedor sin motivo, o aparece un puntaje
 * de pronunciacion calculado sobre un audio que no existe.
 */
describe('orquestador · turno escrito', () => {
  it('NO llama al reconocedor: el texto ya viene escrito', async () => {
    let transcribeLlamado = false;
    const base = createMockAIPipeline();
    const ai: AIPipeline = {
      ...base,
      async transcribe(pcm, language) {
        transcribeLlamado = true;
        return base.transcribe(pcm, language);
      },
    };

    const { orch } = setup({ ai });
    await orch.submitText('I want to practice my English');
    await dejarCorrerElPuntaje();

    expect(transcribeLlamado).toBe(false);
  });

  it('NO puntua pronunciacion: no hay audio que comparar', async () => {
    let scorerLlamado = false;
    const scorer: PronunciationScorer = {
      async score(...args) {
        scorerLlamado = true;
        return createMockScorer().score(...args);
      },
    };

    const { orch } = setup({ scorer });
    await orch.submitText('I want to practice my English');
    await dejarCorrerElPuntaje();

    expect(scorerLlamado).toBe(false);
  });

  it('SI corrige la gramatica y pide sugerencias, que es para lo que sirve', async () => {
    const { bus, orch } = setup();
    const mensajes: ChatMessage[] = [];
    bus.on('message', (e) => mensajes.push(e.message));

    await orch.submitText('I goed to the store yesterday');
    await dejarCorrerElPuntaje();

    const usuario = conversacion(mensajes).find((m) => m.role === 'user');
    expect(usuario).toBeDefined();
    expect(usuario!.correction?.edits.length).toBeGreaterThan(0);
    expect(usuario!.suggestions?.length).toBeGreaterThan(0);
  });

  it('el tutor responde igual que en un turno hablado', async () => {
    const { bus, orch } = setup();
    const mensajes: ChatMessage[] = [];
    bus.on('message', (e) => mensajes.push(e.message));

    await orch.submitText('Hello there');
    await dejarCorrerElPuntaje();

    const tutor = conversacion(mensajes).find((m) => m.role === 'tutor');
    expect(tutor).toBeDefined();
    expect(tutor!.text.length).toBeGreaterThan(0);
  });

  it('ignora texto vacio o solo espacios', async () => {
    const { bus, orch } = setup();
    const mensajes: ChatMessage[] = [];
    bus.on('message', (e) => mensajes.push(e.message));

    await orch.submitText('   ');
    await orch.submitText('');
    await dejarCorrerElPuntaje();

    expect(mensajes).toHaveLength(0);
  });

  it('detecta el espanol escrito y se salta la correccion', async () => {
    // Misma regla que en el turno hablado: el corrector es de solo ingles.
    const { bus, orch } = setup();
    const mensajes: ChatMessage[] = [];
    bus.on('message', (e) => mensajes.push(e.message));

    await orch.submitText('Quiero hablar sobre mi trabajo');
    await dejarCorrerElPuntaje();

    const usuario = conversacion(mensajes).find((m) => m.role === 'user');
    expect(usuario!.correction?.edits).toEqual([]);
    expect(usuario!.suggestions).toBeUndefined();
  });

  it('el texto queda en el historial para el turno siguiente', async () => {
    // Sin esto el tutor no tendria memoria de lo escrito y la conversacion se
    // partiria en dos segun se hable o se escriba.
    const historias: number[] = [];
    const base = createMockAIPipeline();
    const ai: AIPipeline = {
      ...base,
      async reply(history, language) {
        historias.push(history.length);
        return base.reply(history, language);
      },
    };

    const { orch } = setup({ ai });
    await orch.submitText('Hello there');
    await dejarCorrerElPuntaje();
    await orch.submitText('How are you');
    await dejarCorrerElPuntaje();

    // El segundo turno ve mas historial que el primero.
    expect(historias).toHaveLength(2);
    expect(historias[1]).toBeGreaterThan(historias[0]);
  });
});
