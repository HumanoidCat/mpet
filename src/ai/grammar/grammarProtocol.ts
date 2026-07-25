/**
 * Protocolo de mensajes entre el hilo principal y el Web Worker de gramática.
 * Dueño: Isaac (S3-T3). Mismo patrón ya validado en `asr/asrProtocol.ts`.
 */

import type { Edit } from '@shared/contracts';

/** Modelo T5 de corrección gramatical (ONNX, compatible con transformers.js). */
export type GrammarModelId = 'Xenova/t5-base-grammar-correction';

export type GrammarDType = 'q8' | 'q4' | 'fp32';

/**
 * Prefijo que espera el modelo.
 *
 * IMPORTANTE: el modelo base `vennify/t5-base-grammar-correction` se entrenó con el
 * prefijo `"grammar: "` delante de cada entrada. La ficha de la conversión ONNX de
 * Xenova lo omite en su ejemplo, pero los pesos son los mismos, así que sin prefijo
 * la corrección se degrada. Se deja configurable por si un spike demuestra lo contrario.
 */
export const GRAMMAR_PREFIX = 'grammar: ';

export type GrammarRequest =
  | { type: 'init'; model: GrammarModelId; dtype: GrammarDType }
  | { type: 'correct'; id: number; text: string };

export type GrammarResponse =
  | { type: 'progress'; model: string; progress: number }
  | { type: 'ready'; model: string }
  | { type: 'result'; id: number; corrected: string; edits: Edit[] }
  | { type: 'error'; id?: number; message: string };

export const DEFAULT_GRAMMAR_MODEL: GrammarModelId = 'Xenova/t5-base-grammar-correction';
export const DEFAULT_GRAMMAR_DTYPE: GrammarDType = 'q8';
