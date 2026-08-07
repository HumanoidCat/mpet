/// <reference lib="webworker" />
/**
 * S6-T4 / S7-T2 · Web Worker de sugerencias y respuesta del tutor. Dueño: Isaac.
 *
 * QUÉ PRODUCE, con un solo modelo y dos instrucciones distintas:
 *   - `suggest(text)` → cómo mejorar la frase del estudiante (S6-T4)
 *   - `reply(history)` → la respuesta conversacional del tutor (S7-T2)
 *
 * POR QUÉ UN WORKER: cada generación tarda entre 1.3 y 2.3 s (medido en el spike
 * S6-T4), y un turno completo son tres generaciones. En el hilo principal la interfaz
 * quedaría congelada varios segundos por turno. Es además requisito del equipo.
 *
 * POR QUÉ ESTE MODELO: el spike comparó los dos tamaños de LaMini-Flan-T5. El de 77M
 * (93 MiB) no ejecuta la instrucción, la parafrasea, y ninguna de sus cuatro
 * respuestas fue utilizable; el de 248M (265 MiB) devolvió las cuatro coherentes y
 * terminadas en pregunta. Detalle en `docs/evidencias/s6/s6-t4-modelo-tutor.md`.
 *
 * DECODIFICACIÓN VORAZ (`do_sample: false`), igual que el corrector de gramática: con
 * muestreo aleatorio la misma frase daría sugerencias distintas en cada intento y el
 * estudiante no entendería por qué cambian. Reproducible es mejor que variado.
 */

import { pipeline } from '@huggingface/transformers';
import { createRangedProgressAggregator, type RawProgressEvent } from '../model-cache/progress';
import { cleanSuggestions, cleanTutorReply } from './cleanup';
import {
  SUGGESTION_PROMPTS,
  buildSuggestionPrompt,
  buildTutorPrompt,
  getSuggestionsConfig,
  type SuggestionsRequest,
  type SuggestionsResponse,
} from './suggestionsProtocol';

type Generator = (
  input: string,
  options?: Record<string, unknown>
) => Promise<Array<{ generated_text: string }>>;

let generator: Generator | null = null;

const post = (msg: SuggestionsResponse) =>
  (self as DedicatedWorkerGlobalScope).postMessage(msg);

/**
 * Techo de tokens por generación.
 *
 * Distinto para cada tarea a propósito: una sugerencia es una frase reescrita, así
 * que no debería pasar mucho de la longitud original; la respuesta del tutor es más
 * corta todavía porque la instrucción le pide una sola frase. Poner un techo bajo no
 * es solo ahorro: evita que el modelo se enrolle si pierde el hilo de la instrucción.
 */
const MAX_TOKENS_SUGGESTION = 64;
const MAX_TOKENS_REPLY = 48;

async function generate(prompt: string, maxTokens: number): Promise<string> {
  if (!generator) {
    throw new Error('El modelo del tutor no está cargado: llama a init() primero.');
  }
  const out = await generator(prompt, {
    do_sample: false,
    max_new_tokens: maxTokens,
  });
  return (out?.[0]?.generated_text ?? '').trim();
}

self.onmessage = async (event: MessageEvent<SuggestionsRequest>) => {
  const msg = event.data;

  try {
    if (msg.type === 'init') {
      const config = getSuggestionsConfig(msg.config);

      // El progreso se reparte en tramos por la misma razón que en el TTS: los
      // archivos pequeños de configuración llegan completos antes que los pesos, y
      // sin repartir la barra saltaba al 100% de golpe (incidencia I-04).
      const progress = createRangedProgressAggregator(0, 1, (p) =>
        post({ type: 'progress', model: config.model, progress: p })
      );

      const loaded = await pipeline('text2text-generation', config.model, {
        dtype: config.dtype,
        progress_callback: (e) => progress.handle(e as RawProgressEvent),
      });
      progress.complete();
      generator = loaded as unknown as Generator;

      post({ type: 'ready', model: config.model });
      return;
    }

    if (msg.type === 'suggest') {
      // Una generación por instrucción fija. Van en secuencia y no en paralelo: es
      // el mismo modelo, así que lanzarlas a la vez no acelera nada y multiplica el
      // pico de memoria.
      const raw: string[] = [];
      for (const prompt of SUGGESTION_PROMPTS) {
        raw.push(await generate(buildSuggestionPrompt(prompt, msg.text), MAX_TOKENS_SUGGESTION));
      }

      // Se descartan las que repiten la frase del estudiante: es el caso más
      // frecuente (5 de 8 en el spike) y mostrarlas sería ruido. Lista vacía es un
      // resultado honesto: no había nada que mejorar.
      post({ type: 'suggestions', id: msg.id, suggestions: cleanSuggestions(msg.text, raw) });
      return;
    }

    if (msg.type === 'reply') {
      const text = await generate(buildTutorPrompt(msg.history), MAX_TOKENS_REPLY);
      post({ type: 'reply', id: msg.id, text: cleanTutorReply(text) });
    }
  } catch (err) {
    post({
      type: 'error',
      id: msg.type === 'init' ? undefined : msg.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
