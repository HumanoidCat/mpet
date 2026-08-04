/**
 * S5-T5 · Cliente del worker de síntesis de voz (hilo principal). Dueño: Isaac.
 * Mismo patrón que `asr/asrClient.ts` y `grammar/grammarClient.ts`, ya validado dos
 * veces: envuelve el intercambio de mensajes con el worker detrás de promesas
 * normales (`await speak(text)`), poniéndole un identificador a cada petición para
 * saber a cuál corresponde cada respuesta.
 */

import { SAMPLE_RATE } from '@shared/constants';
import { createPcmCache } from './pcmCache';
import {
  DEFAULT_TTS_CONFIG,
  type TtsConfigId,
  type TtsRequest,
  type TtsResponse,
} from './ttsProtocol';

export interface TtsClient {
  /** Descarga/carga el modelo. `onProgress` reporta 0–1 (ver S2-T5). */
  init(onProgress?: (model: string, progress: number) => void): Promise<void>;
  /** Sintetiza `text` y devuelve PCM mono a 16 kHz. Requiere `init()` previo. */
  speak(text: string): Promise<Float32Array>;
  /** Termina el worker y libera la memoria del modelo. */
  dispose(): void;
}

export interface TtsClientOptions {
  config?: TtsConfigId;
  /** Frases distintas que se guardan en caché. Ver `pcmCache.ts`. */
  cacheSize?: number;
}

interface Pending {
  /** El texto pedido, para poder guardarlo en la caché al llegar la respuesta. */
  text: string;
  resolve: (pcm: Float32Array) => void;
  reject: (e: Error) => void;
}

export function createTtsClient(options: TtsClientOptions = {}): TtsClient {
  const config = options.config ?? DEFAULT_TTS_CONFIG;
  const cache = createPcmCache(options.cacheSize);

  // `new URL(..., import.meta.url)` es la forma que Vite entiende para empaquetar
  // el worker como módulo aparte. `type: 'module'` permite usar imports dentro.
  const worker = new Worker(new URL('./ttsWorker.ts', import.meta.url), {
    type: 'module',
  });

  const pending = new Map<number, Pending>();
  let nextId = 0;
  let onProgress: ((model: string, progress: number) => void) | undefined;
  let readyResolve: (() => void) | null = null;
  let readyReject: ((e: Error) => void) | null = null;

  worker.onmessage = (event: MessageEvent<TtsResponse>) => {
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
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (!p) break;

        // Segunda comprobación de la frecuencia, ya con el audio en la mano. El
        // worker ya la valida al cargar; aquí se cubre el caso de que alguien
        // cambie el modelo por uno de otra frecuencia sin notarlo. El coste es una
        // comparación y evita que `App.tsx` reproduzca a destiempo y que los MFCC
        // de la referencia salgan desplazados frente a los del estudiante.
        if (msg.sampleRate !== SAMPLE_RATE) {
          p.reject(
            new Error(
              `El TTS devolvió audio a ${msg.sampleRate} Hz y se esperaban ${SAMPLE_RATE} Hz.`
            )
          );
          break;
        }
        // Se guarda ANTES de resolver para que la referencia quede fijada: MMS-TTS
        // devuelve un audio distinto en cada llamada (medido) y el comparador de
        // pronunciación necesita que la misma frase suene siempre igual.
        cache.set(p.text, msg.pcm);
        p.resolve(msg.pcm);
        break;
      }

      case 'error': {
        const error = new Error(msg.message);
        if (msg.id !== undefined) {
          // Error de una síntesis concreta: solo falla esa promesa.
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
    const error = new Error(`Worker de TTS falló: ${e.message}`);
    readyReject?.(error);
    readyResolve = readyReject = null;
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  };

  const send = (msg: TtsRequest) => worker.postMessage(msg);

  return {
    init(progressCallback) {
      onProgress = progressCallback;
      return new Promise<void>((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
        send({ type: 'init', config });
      });
    },

    speak(text) {
      // Frase ya sintetizada: se devuelve el mismo audio, sin volver a molestar al
      // worker. Además de fijar la referencia, hace que repetir "escuchar" sea
      // instantáneo en vez de costar los segundos que tarda la síntesis.
      const cached = cache.get(text);
      if (cached) return Promise.resolve(cached);

      return new Promise<Float32Array>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { text, resolve, reject });
        send({ type: 'speak', id, text });
      });
    },

    dispose() {
      worker.terminate();
      for (const p of pending.values()) {
        p.reject(new Error('Cliente de TTS cerrado antes de terminar.'));
      }
      pending.clear();
    },
  };
}
