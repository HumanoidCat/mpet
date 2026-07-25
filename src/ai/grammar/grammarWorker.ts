/// <reference lib="webworker" />
/**
 * S3-T3 · Web Worker de corrección gramatical (T5 + transformers.js). Dueño: Isaac.
 *
 * POR QUÉ UN WORKER: mismo motivo que el ASR (S2-T4). Un T5 generando tokens bloquea
 * el hilo principal el tiempo que dure la generación; en un worker la UI sigue viva.
 *
 * RESPONSABILIDAD: recibir texto, devolver texto corregido + la lista de `Edit`
 * palabra a palabra que la UI usa para pintar los resaltados.
 */

import { pipeline } from '@huggingface/transformers';
import { createProgressAggregator, type RawProgressEvent } from '../model-cache/progress';
import { diffWords } from './diff';
import { GRAMMAR_PREFIX, type GrammarRequest, type GrammarResponse } from './grammarProtocol';

type Text2TextPipeline = (
  input: string,
  options?: Record<string, unknown>
) => Promise<Array<{ generated_text: string }>>;

let corrector: Text2TextPipeline | null = null;

const post = (msg: GrammarResponse) => (self as DedicatedWorkerGlobalScope).postMessage(msg);

self.onmessage = async (event: MessageEvent<GrammarRequest>) => {
  const msg = event.data;

  try {
    if (msg.type === 'init') {
      const aggregator = createProgressAggregator((progress) =>
        post({ type: 'progress', model: msg.model, progress })
      );

      const loaded = await pipeline('text2text-generation', msg.model, {
        dtype: msg.dtype,
        progress_callback: (e) => aggregator.handle(e as RawProgressEvent),
      });
      corrector = loaded as unknown as Text2TextPipeline;

      aggregator.complete();
      post({ type: 'ready', model: msg.model });
      return;
    }

    if (msg.type === 'correct') {
      if (!corrector) {
        throw new Error('El modelo de gramática no está cargado: llama a init() primero.');
      }

      const input = msg.text.trim();
      if (!input) {
        post({ type: 'result', id: msg.id, corrected: '', edits: [] });
        return;
      }

      const output = await corrector(GRAMMAR_PREFIX + input, {
        // Generación determinista: para corregir gramática no queremos creatividad,
        // queremos la misma salida ante la misma entrada (y así los tests y las
        // evidencias son reproducibles).
        do_sample: false,
        max_new_tokens: 128,
      });

      const corrected = (output?.[0]?.generated_text ?? '').trim();

      // Si el modelo devuelve vacío o algo inservible, preferimos no romper el turno
      // de conversación: se deja el texto original sin marcar cambios.
      const safeCorrected = corrected.length > 0 ? corrected : input;

      post({
        type: 'result',
        id: msg.id,
        corrected: safeCorrected,
        edits: diffWords(input, safeCorrected),
      });
    }
  } catch (err) {
    post({
      type: 'error',
      id: msg.type === 'correct' ? msg.id : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
