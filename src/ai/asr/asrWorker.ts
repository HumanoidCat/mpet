/// <reference lib="webworker" />
/**
 * S2-T4 · Web Worker de ASR (Whisper + transformers.js). Dueño: Isaac.
 *
 * POR QUÉ UN WORKER (y no el hilo principal):
 * La inferencia de Whisper tarda ~1.5 s por cada 5 s de audio (medido en S1-T7).
 * Si eso corriera en el hilo principal, la interfaz se congelaría ese tiempo
 * completo: no se repintaría el waveform, el botón no respondería, y la PWA
 * parecería colgada. Un worker corre en paralelo y deja la UI fluida. Es además
 * requisito explícito del equipo ("cada modelo corre en un Web Worker").
 *
 * RESPONSABILIDAD: solo transcribir. No sabe nada de gramática, chat ni UI.
 */

import { pipeline } from '@huggingface/transformers';
import type { Transcription, WordAlign } from '@shared/contracts';
import { createProgressAggregator, type RawProgressEvent } from '../model-cache/progress';
import type { AsrRequest, AsrResponse } from './asrProtocol';

// El tipado del pipeline de transformers.js es genérico; lo guardamos como
// función invocable porque solo necesitamos llamarlo con el audio.
type AsrPipeline = (
  audio: Float32Array,
  options?: Record<string, unknown>
) => Promise<{ text: string; chunks?: WhisperChunk[] }>;

/** Trozo con marca de tiempo que devuelve Whisper con `return_timestamps: 'word'`. */
interface WhisperChunk {
  text: string;
  /** [inicio, fin] en segundos. `fin` puede venir null en el último trozo. */
  timestamp: [number, number | null];
}

let asr: AsrPipeline | null = null;

const post = (msg: AsrResponse) => (self as DedicatedWorkerGlobalScope).postMessage(msg);

/**
 * Convierte los trozos de Whisper al tipo `WordAlign` del contrato compartido.
 *
 * POR QUÉ importa: Fabrizio necesita estos tiempos por palabra para alinear el
 * audio del usuario con la referencia y puntuar la pronunciación (S6-T2). Es la
 * frontera exacta entre mi módulo y el suyo, definida en `contracts.ts`.
 */
function toWordAlign(chunks: WhisperChunk[] | undefined): WordAlign[] {
  if (!chunks) return [];
  return chunks
    .map((c) => {
      const [start, end] = c.timestamp;
      return {
        word: c.text.trim(),
        start,
        // Si Whisper no cierra el último trozo, usamos el inicio como fin para
        // no romper la invariante `start <= end` que asumen los consumidores.
        end: end ?? start,
      };
    })
    .filter((w) => w.word.length > 0 && Number.isFinite(w.start));
}

self.onmessage = async (event: MessageEvent<AsrRequest>) => {
  const msg = event.data;

  try {
    if (msg.type === 'init') {
      const aggregator = createProgressAggregator((progress) =>
        post({ type: 'progress', model: msg.model, progress })
      );

      // Sin casts en las opciones a propósito: así TypeScript verifica de verdad
      // que `dtype` y `progress_callback` existen en la API de transformers.js v3.
      // (v4 es un salto mayor con API distinta; el proyecto está fijado en ^3.8.1
      //  para que el código coincida con las mediciones del spike S1-T7.)
      const loaded = await pipeline('automatic-speech-recognition', msg.model, {
        dtype: msg.dtype,
        progress_callback: (e) => aggregator.handle(e as RawProgressEvent),
      });
      asr = loaded as unknown as AsrPipeline;

      aggregator.complete(); // cierra la barra en 100% aunque viniera de caché
      post({ type: 'ready', model: msg.model });
      return;
    }

    if (msg.type === 'transcribe') {
      if (!asr) throw new Error('El modelo ASR no está cargado: llama a init() primero.');

      // `return_timestamps: 'word'` pide los tiempos por palabra. Cuesta un poco
      // más de inferencia, pero sin ellos el módulo de pronunciación (Fabrizio)
      // no puede alinear nada, así que es obligatorio para el contrato.
      const out = await asr(msg.pcm, { return_timestamps: 'word' });

      const result: Transcription = {
        text: (out.text ?? '').trim(),
        words: toWordAlign(out.chunks),
      };
      post({ type: 'result', id: msg.id, result });
    }
  } catch (err) {
    post({
      type: 'error',
      id: msg.type === 'transcribe' ? msg.id : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
