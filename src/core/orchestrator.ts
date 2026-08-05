import type {
  AIPipeline,
  AudioEngine,
  ChatMessage,
  EventBus,
  PronunciationScorer,
  Transcription,
} from '@shared/contracts';

/**
 * Orquestador (S2-T7 + S6). Duenio: Alejandro.
 *
 * Cablea el flujo de un turno de conversacion:
 *   boton mic -> captura (AudioEngine) -> ASR -> gramatica -> mensajes al chat
 *                                             -> puntaje de pronunciacion (async)
 *                                             -> sugerencias (async)
 *
 * Los modulos llegan por inyeccion de dependencias: se sustituyen por mocks o
 * por los reales sin tocar este archivo.
 *
 * POR QUE EL PUNTAJE Y LAS SUGERENCIAS SE CALCULAN APARTE DEL TURNO
 * Puntuar exige sintetizar la frase de referencia, y una frase nueva tarda unos
 * diez segundos la primera vez (despues sale de la cache del TTS). Sugerir exige
 * generar texto con un modelo. El proyecto se comprometio a devolver
 * retroalimentacion en menos de dos segundos, que es el limite por debajo del
 * cual la correccion sigue siendo util al hablar. Por eso el turno responde con
 * transcripcion, correccion y respuesta del tutor, y lo demas llega cuando esta
 * listo.
 *
 * COMO LLEGAN A LA INTERFAZ
 * Se vuelve a emitir el MISMO mensaje, con el mismo `id`, ya con `pronunciation`
 * lleno. La interfaz actualiza el mensaje existente en vez de agregar uno nuevo.
 *
 * Se descarto un evento propio del tipo `{ pronunciation, messageId }`: mandaria
 * un delta, y un delta no se puede aplicar si el receptor todavia no tiene ese
 * mensaje. Reemitir el mensaje completo manda estado en vez de cambio, con lo
 * que la operacion es idempotente: repetir el evento no duplica ni corrompe.
 *
 * La semantica de alta-o-actualizacion esta documentada en `AppEvent`
 * (`src/shared/contracts.ts`), porque es la frontera que consume la interfaz.
 *
 * QUE TEXTO SE SINTETIZA COMO REFERENCIA
 * Lo que el usuario dijo, no la version corregida. El puntaje mide pronunciacion
 * y la gramatica ya la cubre el corrector por separado. Ademas, sintetizar la
 * frase corregida compararia dos secuencias de palabras distintas, que es
 * justamente lo que el alineamiento temporal no debe hacer.
 */

export type OrchestratorState = 'idle' | 'recording' | 'processing';

export interface Orchestrator {
  /** Estado actual del turno. */
  getState(): OrchestratorState;
  /** Alterna el microfono: idle -> grabando -> procesando -> idle. */
  toggleMic(): Promise<void>;
  /** Carga los modelos de IA (reporta progreso via event bus). */
  init(): Promise<void>;
}

interface Deps {
  audio: AudioEngine;
  ai: AIPipeline;
  bus: EventBus;
  /**
   * Opcional: si no se inyecta, el turno funciona igual y no se puntua. Permite
   * ejercitar el flujo de conversacion sin arrastrar el comparador.
   */
  scorer?: PronunciationScorer;
}

let nextId = 0;
const newId = () => `msg-${Date.now()}-${nextId++}`;

export function createOrchestrator({ audio, ai, bus, scorer }: Deps): Orchestrator {
  let state: OrchestratorState = 'idle';
  const history: ChatMessage[] = [];

  /**
   * Aplica un cambio a un mensaje ya publicado y lo vuelve a emitir.
   *
   * POR QUE SE LEE DEL HISTORIAL Y NO DE UNA COPIA CAPTURADA
   * Dos calculos corren fuera del turno sobre el mismo mensaje: el puntaje de
   * pronunciacion y las sugerencias. Si cada uno reconstruyera el mensaje a
   * partir de la copia que recibio al arrancar, el que terminara segundo
   * borraria el campo del primero, porque su copia no lo tiene. Leyendo del
   * historial en el momento de aplicar, los dos cambios se acumulan.
   *
   * Se construye un objeto nuevo en vez de mutar el existente: la interfaz
   * necesita una referencia distinta para redibujar.
   */
  function actualizarMensaje(id: string, cambio: Partial<ChatMessage>): void {
    const i = history.findIndex((m) => m.id === id);
    if (i === -1) return;

    const actualizado: ChatMessage = { ...history[i], ...cambio };
    history[i] = actualizado;
    // Mismo `id`: la interfaz actualiza el mensaje en vez de agregar otro.
    bus.emit({ type: 'message', message: actualizado });
  }

  /**
   * Pide sugerencias para lo que dijo el estudiante y las adjunta al mensaje.
   *
   * Fuera del turno, por lo mismo que el puntaje: generar texto con un modelo
   * tarda mas de lo que el proyecto se comprometio a esperar. Si el pipeline
   * todavia no las implementa devuelve lista vacia y no se emite nada, que es
   * mejor que mostrar una seccion de sugerencias en blanco.
   */
  async function suggest(message: ChatMessage, texto: string): Promise<void> {
    if (texto.trim().length === 0) return;

    try {
      const suggestions = await ai.suggest(texto);
      if (suggestions.length === 0) return;
      actualizarMensaje(message.id, { suggestions });
    } catch (err) {
      bus.emit({
        type: 'error',
        stage: 'suggestions',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Puntua la pronunciacion y actualiza el mensaje ya publicado.
   *
   * Se ejecuta fuera del turno a proposito (ver cabecera). Los fallos no
   * interrumpen la conversacion: se informan por el bus y el mensaje se queda
   * sin puntaje, que es honesto, en vez de mostrar un numero inventado.
   */
  async function scorePronunciation(
    message: ChatMessage,
    pcm: Float32Array,
    transcription: Transcription
  ): Promise<void> {
    // Sin comparador, sin palabras reconocidas o sin audio no hay nada que medir.
    if (!scorer || transcription.words.length === 0 || pcm.length === 0) return;

    try {
      const referencePcm = await ai.speak(transcription.text);
      // El sintetizador puede no estar disponible todavia: devuelve vacio y se
      // omite el puntaje en silencio, sin ensuciar el chat con un error.
      if (referencePcm.length === 0) return;

      // Las dos senales tienen que recorrer la MISMA cadena, o el puntaje mide
      // la diferencia entre las dos rutas en vez de la pronunciacion. El PCM del
      // usuario sale de `stop()` y ya viene acondicionado; el del sintetizador
      // viene crudo. Se declara cada caso en vez de suponerlo (ver
      // `AnalyzeOptions`): el acondicionamiento no es idempotente.
      const [userFrames, referenceFrames] = await Promise.all([
        audio.analyze(pcm, { conditioned: true }),
        audio.analyze(referencePcm),
      ]);

      const pronunciation = await scorer.score(
        userFrames,
        referenceFrames,
        transcription.words
      );

      actualizarMensaje(message.id, { pronunciation });
    } catch (err) {
      bus.emit({
        type: 'error',
        stage: 'pronunciation',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function processTurn(pcm: Float32Array): Promise<void> {
    state = 'processing';
    try {
      // Grabacion vacia: el usuario pulso y solto sin hablar, o la captura no
      // entrego muestras. Pasarla por el reconocedor cuesta segundos y puede
      // devolver texto inventado, que es peor que no responder nada.
      if (pcm.length === 0) return;

      const transcription = await ai.transcribe(pcm);
      bus.emit({ type: 'transcription', result: transcription });

      // Nada reconocible: silencio o ruido de fondo. Se sale sin agregar un
      // mensaje vacio al chat ni pedirle al tutor que responda a nada.
      if (transcription.text.trim().length === 0) return;

      const correction = await ai.correctGrammar(transcription.text);

      const userMsg: ChatMessage = {
        id: newId(),
        role: 'user',
        text: transcription.text,
        correction,
        ts: Date.now(),
      };
      history.push(userMsg);
      bus.emit({ type: 'message', message: userMsg });

      // Sin `await`: el turno no espera ni al puntaje ni a las sugerencias, y
      // los dos actualizan el mismo mensaje cuando terminan (ver cabecera).
      void scorePronunciation(userMsg, pcm, transcription);
      void suggest(userMsg, transcription.text);

      const replyText = await ai.reply(history);
      const tutorMsg: ChatMessage = {
        id: newId(),
        role: 'tutor',
        text: replyText,
        ts: Date.now(),
      };
      history.push(tutorMsg);
      bus.emit({ type: 'message', message: tutorMsg });
    } catch (err) {
      bus.emit({
        type: 'error',
        stage: 'pipeline',
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      state = 'idle';
    }
  }

  return {
    getState: () => state,

    async init() {
      await ai.init((model, progress) => {
        bus.emit({ type: 'model-progress', model, progress });
      });
    },

    async toggleMic() {
      if (state === 'processing') return; // ignorar clicks durante proceso

      if (state === 'idle') {
        await audio.start();
        state = 'recording';
        bus.emit({ type: 'recording-started' });
        return;
      }

      // state === 'recording'
      let pcm: Float32Array;
      try {
        pcm = await audio.stop();
      } catch (err) {
        // Si detener la captura falla y el estado se queda en `recording`, el
        // boton del microfono queda atrapado: la interfaz cree que sigue
        // grabando y el usuario no tiene forma de salir sin recargar. Volver a
        // `idle` deja la aplicacion utilizable aunque se pierda esa grabacion.
        state = 'idle';
        bus.emit({
          type: 'error',
          stage: 'capture',
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      bus.emit({ type: 'recording-stopped', pcm });
      await processTurn(pcm);
    },
  };
}
