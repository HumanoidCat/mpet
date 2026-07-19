import type {
  AIPipeline,
  AudioEngine,
  ChatMessage,
  EventBus,
} from '@shared/contracts';

/**
 * Orquestador v0 (S2-T7). Duenio: Alejandro.
 *
 * Cablea el flujo de un turno de conversacion:
 *   boton mic -> captura (AudioEngine) -> ASR -> gramatica -> mensajes al chat
 *
 * Los modulos llegan por inyeccion de dependencias: hoy son mocks,
 * y se sustituyen por los reales sin tocar este archivo.
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
}

let nextId = 0;
const newId = () => `msg-${Date.now()}-${nextId++}`;

export function createOrchestrator({ audio, ai, bus }: Deps): Orchestrator {
  let state: OrchestratorState = 'idle';
  const history: ChatMessage[] = [];

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
