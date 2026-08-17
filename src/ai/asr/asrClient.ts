/**
 * S2-T4 · Cliente del worker de ASR (hilo principal). Dueño: Isaac.
 *
 * QUÉ HACE: envuelve la comunicación por mensajes con el Web Worker detrás de una
 * API de promesas normal (`await transcribe(pcm)`).
 *
 * POR QUÉ: `postMessage` es asíncrono y sin correlación — mandas un mensaje y la
 * respuesta llega suelta por `onmessage`, sin saber a qué petición corresponde.
 * Aquí le ponemos un `id` a cada petición y guardamos su `resolve` pendiente, para
 * que quien lo use no tenga que pensar en hilos ni en mensajes.
 */

import type { SupportedLanguage, Transcription } from '@shared/contracts';
import {
  DEFAULT_ASR_DTYPE,
  DEFAULT_ASR_MODEL,
  type AsrDType,
  type AsrModelId,
  type AsrRequest,
  type AsrResponse,
} from './asrProtocol';

export interface AsrClient {
  /** Descarga/carga el modelo. `onProgress` reporta 0–1 (ver S2-T5). */
  init(onProgress?: (model: string, progress: number) => void): Promise<void>;
  /**
   * Transcribe PCM mono 16 kHz. Requiere `init()` previo.
   *
   * `language` fuerza el idioma en vez de detectarlo. Se usa en modo práctica, donde
   * ya se sabe que la frase objetivo está en inglés y dejar dudar al detector sobre
   * una palabra mal pronunciada solo añade una forma de fallar.
   */
  transcribe(
    pcm: Float32Array,
    language?: SupportedLanguage,
    alsoTranslate?: boolean
  ): Promise<Transcription>;
  /** Termina el worker y libera la memoria del modelo (~290 MB medidos en S1-T7). */
  dispose(): void;
}

export interface AsrClientOptions {
  model?: AsrModelId;
  dtype?: AsrDType;
}

interface Pending {
  resolve: (t: Transcription) => void;
  reject: (e: Error) => void;
}

export function createAsrClient(options: AsrClientOptions = {}): AsrClient {
  const model = options.model ?? DEFAULT_ASR_MODEL;
  const dtype = options.dtype ?? DEFAULT_ASR_DTYPE;

  // `new URL(..., import.meta.url)` es la forma que Vite entiende para empaquetar
  // el worker como módulo aparte. `type: 'module'` permite usar imports dentro.
  const worker = new Worker(new URL('./asrWorker.ts', import.meta.url), {
    type: 'module',
  });

  const pending = new Map<number, Pending>();
  let nextId = 0;
  let onProgress: ((model: string, progress: number) => void) | undefined;
  let readyResolve: (() => void) | null = null;
  let readyReject: ((e: Error) => void) | null = null;

  worker.onmessage = (event: MessageEvent<AsrResponse>) => {
    const msg = event.data;

    switch (msg.type) {
      case 'progress':
        onProgress?.(msg.model, msg.progress);
        break;

      case 'ready':
        readyResolve?.();
        readyResolve = readyReject = null;
        break;

      case 'result': {
        pending.get(msg.id)?.resolve(msg.result);
        pending.delete(msg.id);
        break;
      }

      case 'error': {
        const error = new Error(msg.message);
        if (msg.id !== undefined) {
          // Error de una transcripción concreta: solo falla esa promesa.
          pending.get(msg.id)?.reject(error);
          pending.delete(msg.id);
        } else {
          // Error de carga: falla el init y, por seguridad, todo lo pendiente.
          readyReject?.(error);
          readyResolve = readyReject = null;
          for (const p of pending.values()) p.reject(error);
          pending.clear();
        }
        break;
      }
    }
  };

  // Si el worker muere (p. ej. sin memoria), no dejamos promesas colgadas para
  // siempre: se rechazan con un mensaje entendible.
  worker.onerror = (e) => {
    const error = new Error(`Worker de ASR falló: ${e.message}`);
    readyReject?.(error);
    readyResolve = readyReject = null;
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  };

  const send = (msg: AsrRequest) => worker.postMessage(msg);

  return {
    init(progressCallback) {
      onProgress = progressCallback;
      return new Promise<void>((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
        send({ type: 'init', model, dtype });
      });
    },

    transcribe(pcm, language, alsoTranslate) {
      return new Promise<Transcription>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        // No transferimos el buffer (`[pcm.buffer]`) a propósito: al transferirlo
        // el hilo principal lo perdería, y el motor de audio de Fabrizio puede
        // seguir necesitando ese mismo PCM para el análisis de pronunciación.
        send({
          type: 'transcribe',
          id,
          pcm,
          ...(language ? { language } : {}),
          ...(alsoTranslate ? { alsoTranslate } : {}),
        });
      });
    },

    dispose() {
      worker.terminate();
      for (const p of pending.values()) {
        p.reject(new Error('Cliente de ASR cerrado antes de terminar.'));
      }
      pending.clear();
    },
  };
}
