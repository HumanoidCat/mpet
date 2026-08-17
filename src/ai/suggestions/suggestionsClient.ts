/**
 * S6-T4 / S7-T2 · Cliente del worker del tutor (hilo principal). Dueño: Isaac.
 *
 * Mismo patrón que `asr/asrClient.ts`, `grammar/grammarClient.ts` y `tts/ttsClient.ts`,
 * ya validado tres veces: envuelve el intercambio de mensajes detrás de promesas y le
 * pone un identificador a cada petición para saber a cuál corresponde cada respuesta.
 *
 * Aquí hay una diferencia con los otros clientes: este worker atiende **dos tipos de
 * petición distintos** (`suggest` y `reply`), así que el registro de peticiones
 * pendientes guarda de qué tipo era cada una. Sin eso, una respuesta de sugerencias
 * podría resolver la promesa de una respuesta del tutor y el chat mostraría una lista
 * donde esperaba una frase.
 */

import {
  DEFAULT_SUGGESTIONS_CONFIG,
  type HistoryTurn,
  type SuggestionsConfigId,
  type SuggestionsRequest,
  type SuggestionsResponse,
} from './suggestionsProtocol';

export interface SuggestionsClient {
  init(onProgress?: (model: string, progress: number) => void): Promise<void>;
  /** Sugerencias de mejora para la frase. Puede devolver lista vacía. */
  suggest(text: string): Promise<string[]>;
  /**
   * Respuesta conversacional del tutor.
   *
   * `language` es el idioma del último turno del estudiante. En español el tutor
   * cambia de tarea: en vez de conversar, le da la frase en inglés que no supo decir
   * y sigue desde ahí.
   */
  reply(
    history: readonly HistoryTurn[],
    language?: 'en' | 'es',
    ingles?: string
  ): Promise<string>;
  dispose(): void;
}

export interface SuggestionsClientOptions {
  config?: SuggestionsConfigId;
}

type Pending =
  | { kind: 'suggest'; resolve: (s: string[]) => void; reject: (e: Error) => void }
  | { kind: 'reply'; resolve: (t: string) => void; reject: (e: Error) => void };

export function createSuggestionsClient(
  options: SuggestionsClientOptions = {}
): SuggestionsClient {
  const config = options.config ?? DEFAULT_SUGGESTIONS_CONFIG;

  const worker = new Worker(new URL('./suggestionsWorker.ts', import.meta.url), {
    type: 'module',
  });

  const pending = new Map<number, Pending>();
  let nextId = 0;
  let onProgress: ((model: string, progress: number) => void) | undefined;
  let readyResolve: (() => void) | null = null;
  let readyReject: ((e: Error) => void) | null = null;

  /** Rechaza todo lo pendiente. Se usa cuando el fallo no es de una petición concreta. */
  const failAll = (error: Error) => {
    readyReject?.(error);
    readyResolve = readyReject = null;
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  };

  worker.onmessage = (event: MessageEvent<SuggestionsResponse>) => {
    const msg = event.data;

    switch (msg.type) {
      case 'progress':
        onProgress?.(msg.model, msg.progress);
        break;

      case 'ready':
        readyResolve?.();
        readyResolve = readyReject = null;
        break;

      case 'suggestions': {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        // La comprobación del tipo no es paranoia: las dos respuestas viajan por el
        // mismo canal y confundirlas daría un error de tipos silencioso en runtime.
        if (p?.kind === 'suggest') p.resolve(msg.suggestions);
        else p?.reject(new Error('Respuesta de sugerencias para una petición que no lo era.'));
        break;
      }

      case 'reply': {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (p?.kind === 'reply') p.resolve(msg.text);
        else p?.reject(new Error('Respuesta del tutor para una petición que no lo era.'));
        break;
      }

      case 'error': {
        const error = new Error(msg.message);
        if (msg.id !== undefined) {
          pending.get(msg.id)?.reject(error);
          pending.delete(msg.id);
        } else {
          failAll(error);
        }
        break;
      }
    }
  };

  worker.onerror = (e) => failAll(new Error(`Worker del tutor falló: ${e.message}`));

  const send = (msg: SuggestionsRequest) => worker.postMessage(msg);

  return {
    init(progressCallback) {
      onProgress = progressCallback;
      return new Promise<void>((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
        send({ type: 'init', config });
      });
    },

    suggest(text) {
      return new Promise<string[]>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { kind: 'suggest', resolve, reject });
        send({ type: 'suggest', id, text });
      });
    },

    reply(history, language, ingles) {
      return new Promise<string>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { kind: 'reply', resolve, reject });
        // Se copia el historial a un array plano: lo que llega puede ser readonly y
        // `postMessage` necesita algo clonable.
        send({
          type: 'reply',
          id,
          history: [...history],
          ...(language ? { language } : {}),
          ...(ingles ? { ingles } : {}),
        });
      });
    },

    dispose() {
      worker.terminate();
      for (const p of pending.values()) {
        p.reject(new Error('Cliente del tutor cerrado antes de terminar.'));
      }
      pending.clear();
    },
  };
}
