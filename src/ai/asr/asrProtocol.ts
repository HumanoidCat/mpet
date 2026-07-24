/**
 * Protocolo de mensajes entre el hilo principal y el Web Worker de ASR.
 * Dueño: Isaac (S2-T4).
 *
 * POR QUÉ un archivo aparte: el worker y su cliente viven en hilos distintos y
 * no pueden compartir objetos, solo mensajes serializados. Tener los tipos en un
 * único sitio evita que se desincronicen (un typo aquí = un bug mudo en runtime).
 */

import type { Transcription } from '@shared/contracts';

/** Modelos ASR admitidos. `tiny.en` validado en el spike S1-T7 (RTF ≈ 0.3). */
export type AsrModelId = 'Xenova/whisper-tiny.en' | 'Xenova/whisper-base.en';

/** Nivel de cuantización. q8 fue el medido en S1-T7: 41 MB, buena precisión. */
export type AsrDType = 'q8' | 'q4' | 'fp32';

/** Mensajes que el hilo principal envía AL worker. */
export type AsrRequest =
  | { type: 'init'; model: AsrModelId; dtype: AsrDType }
  | { type: 'transcribe'; id: number; pcm: Float32Array };

/** Mensajes que el worker devuelve al hilo principal. */
export type AsrResponse =
  | { type: 'progress'; model: string; progress: number }
  | { type: 'ready'; model: string }
  | { type: 'result'; id: number; result: Transcription }
  | { type: 'error'; id?: number; message: string };

/** Config por defecto: lo que el spike S1-T7 demostró viable. */
export const DEFAULT_ASR_MODEL: AsrModelId = 'Xenova/whisper-tiny.en';
export const DEFAULT_ASR_DTYPE: AsrDType = 'q8';
