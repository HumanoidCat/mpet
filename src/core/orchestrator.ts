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
 *
 * Los modulos llegan por inyeccion de dependencias: se sustituyen por mocks o
 * por los reales sin tocar este archivo.
 *
 * POR QUE EL PUNTAJE SE CALCULA APARTE DEL TURNO
 * Puntuar exige sintetizar la frase de referencia, y una frase nueva tarda unos
 * diez segundos la primera vez (despues sale de la cache del TTS). El proyecto
 * se comprometio a devolver retroalimentacion en menos de dos segundos, que es
 * el limite por debajo del cual la correccion sigue siendo util al hablar.
 * Por eso el turno responde con transcripcion, correccion y respuesta del tutor,
 * y el puntaje llega cuando esta listo.
 *
 * COMO LLEGA EL PUNTAJE A LA INTERFAZ
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

      const [userFrames, referenceFrames] = await Promise.all([
        audio.analyze(pcm),
        audio.analyze(referencePcm),
      ]);

      const pronunciation = await scorer.score(
        userFrames,
        referenceFrames,
        transcription.words
      );

      // Se construye un mensaje nuevo en vez de mutar el publicado: el historial
      // se reemplaza en su sitio y la interfaz recibe un objeto distinto, que es
      // lo que necesita React para redibujar.
      const puntuado: ChatMessage = { ...message, pronunciation };
      const i = history.findIndex((m) => m.id === message.id);
      if (i !== -1) history[i] = puntuado;

      // Mismo `id`: la interfaz actualiza el mensaje en vez de agregar otro.
      bus.emit({ type: 'message', message: puntuado });
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
      const transcription = await ai.transcribe(pcm);
      bus.emit({ type: 'transcription', result: transcription });

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

      // Sin `await`: el turno no espera al puntaje (ver cabecera).
      void scorePronunciation(userMsg, pcm, transcription);

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
      const pcm = await audio.stop();
      bus.emit({ type: 'recording-stopped', pcm });
      await processTurn(pcm);
    },
  };
}
