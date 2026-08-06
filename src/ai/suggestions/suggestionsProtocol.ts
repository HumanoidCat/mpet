/**
 * Protocolo y prompts del worker de sugerencias y respuesta del tutor.
 * Dueño: Isaac (S6-T4 sugerencias · S7-T2 respuesta conversacional).
 *
 * POR QUÉ LAS DOS TAREAS COMPARTEN UN SOLO WORKER: son el mismo modelo con
 * instrucciones distintas. Cargar dos copias de un T5 para pedirle dos cosas
 * distintas duplicaría cientos de MB de descarga y de memoria sin ganar nada.
 *
 * QUÉ MODELO: un T5 ajustado a instrucciones (familia Flan). No es un LLM de chat:
 * no mantiene personalidad ni razona, pero hace bien "reescribe esta frase así" y
 * "responde a esto en una línea", que es exactamente lo que necesita el tutor. A
 * cambio pesa una fracción de lo que pesaría un modelo conversacional de verdad.
 *
 * Este archivo lo comparten el spike y el worker a propósito: el spike mide las
 * constantes reales, no una copia parecida.
 */

/** Los dos tamaños que compara el spike S6-T4. */
export type SuggestionsModelId =
  | 'Xenova/LaMini-Flan-T5-248M'
  | 'Xenova/LaMini-Flan-T5-77M';

/**
 * Cuantización.
 *
 * `q8` y no fp32, al revés que en el sintetizador. No es incoherencia: lo que el
 * spike de voz demostró es que cuantizar destroza el **audio**. En modelos de texto
 * q8 funciona — el corrector de gramática corre en q8 en producción y acierta 6 de 8
 * frases. Además fp32 aquí serían 1.1 GB, que no es una opción.
 */
export type SuggestionsDType = 'q8' | 'fp32';

export interface SuggestionsConfig {
  id: SuggestionsConfigId;
  label: string;
  model: SuggestionsModelId;
  dtype: SuggestionsDType;
  /** Descarga esperada en MB, sumando los archivos ONNX del Hub. */
  expectedMB: number;
  rationale: string;
}

export type SuggestionsConfigId = 'grande-248m' | 'pequeno-77m';

/**
 * Tamaños tomados de los archivos del Hub (consultados el 4-ago-2026):
 *   LaMini-Flan-T5-248M  encoder_quantized 110.5 MB · decoder_merged_quantized 164.7 MB
 *   LaMini-Flan-T5-77M   encoder_quantized  35.8 MB · decoder_merged_quantized  59.3 MB
 *
 * El contexto que decide: la primera descarga de la aplicación son hoy ~303 MiB tras
 * la carga bajo demanda (S7-T4). El modelo grande añadiría casi un 90 % sobre eso;
 * el pequeño, un 32 %. Por eso el peso pesa tanto como la calidad en esta elección.
 */
export const SUGGESTIONS_CONFIGS: readonly SuggestionsConfig[] = [
  {
    id: 'grande-248m',
    label: 'Grande · LaMini-Flan-T5-248M q8',
    model: 'Xenova/LaMini-Flan-T5-248M',
    dtype: 'q8',
    expectedMB: 278,
    rationale:
      'El modelo que proponía el plan. Con 248M de parámetros debería dar ' +
      'respuestas de tutor coherentes, pero pesa casi tanto como el corrector de ' +
      'gramática entero (241 MiB).',
  },
  {
    id: 'pequeno-77m',
    label: 'Pequeño · LaMini-Flan-T5-77M q8',
    model: 'Xenova/LaMini-Flan-T5-77M',
    dtype: 'q8',
    expectedMB: 98,
    rationale:
      'Casi tres veces más liviano. La duda es si con 77M de parámetros las ' +
      'respuestas salen genéricas o incoherentes: eso es lo que el spike mide.',
  },
] as const;

export function getSuggestionsConfig(id: SuggestionsConfigId): SuggestionsConfig {
  const found = SUGGESTIONS_CONFIGS.find((c) => c.id === id);
  if (!found) throw new Error(`Configuración de sugerencias desconocida: ${id}`);
  return found;
}

/**
 * Fijado por el spike S6-T4 (4-ago-2026): el 248M.
 *
 * El pequeño no era una alternativa más barata sino inservible: con 77M de parámetros
 * no ejecuta la instrucción, la parafrasea ("The native English speaker would say it
 * is a favorite food"), y ninguna de las cuatro respuestas del tutor fue utilizable.
 * Cuando la salida no se le puede enseñar a un estudiante, ahorrar 172 MiB no es un
 * ahorro. Evidencia: docs/evidencias/s6/s6-t4-modelo-tutor.md
 */
export const DEFAULT_SUGGESTIONS_CONFIG: SuggestionsConfigId = 'grande-248m';

// ── Prompts fijos ────────────────────────────────────────────────────────────

/**
 * Instrucciones para `suggest(text)`, que devuelve una lista.
 *
 * POR QUÉ VARIOS PROMPTS FIJOS Y NO UNA GENERACIÓN CON MUESTREO ALEATORIO: con
 * muestreo, dos ejecuciones de la misma frase darían sugerencias distintas y el
 * estudiante no entendería por qué. Con instrucciones fijas cada sugerencia tiene un
 * propósito declarado —una es sobre naturalidad, otra sobre vocabulario— y el
 * resultado es reproducible, que además es lo que pide la tarea S6-T4.
 */
export interface SuggestionPrompt {
  id: string;
  /** Qué le aporta al estudiante. Puede mostrarse en la interfaz. */
  label: string;
  instruction: string;
}

export const SUGGESTION_PROMPTS: readonly SuggestionPrompt[] = [
  {
    id: 'naturalidad',
    label: 'Más natural',
    instruction:
      'Rewrite the following sentence the way a native English speaker would say it. ' +
      'Answer with the rewritten sentence only.',
  },
  {
    id: 'vocabulario',
    label: 'Vocabulario más rico',
    instruction:
      'Rewrite the following sentence using more advanced vocabulary, keeping the same ' +
      'meaning. Answer with the rewritten sentence only.',
  },
] as const;

export function buildSuggestionPrompt(prompt: SuggestionPrompt, text: string): string {
  return `${prompt.instruction}\n\nSentence: ${text}`;
}

/**
 * Instrucción para `reply(history)`, la respuesta conversacional del tutor (S7-T2).
 *
 * Pide explícitamente una sola frase y una pregunta de vuelta. Sin lo primero el
 * modelo se enrolla y el chat deja de parecer una conversación; sin lo segundo el
 * intercambio se muere y el estudiante deja de hablar, que es justo lo contrario de
 * lo que busca la aplicación.
 */
export const TUTOR_INSTRUCTION =
  'You are a friendly English tutor talking with a student. ' +
  'Reply in one short sentence and end with a question to keep the conversation going.';

/** Cuántos turnos de historia se le pasan al modelo. */
export const HISTORY_TURNS = 4;

export interface HistoryTurn {
  role: 'user' | 'tutor';
  text: string;
}

/**
 * Arma el prompt del tutor a partir del historial.
 *
 * POR QUÉ SE RECORTA: el T5 tiene una ventana de contexto limitada y la latencia
 * crece con la entrada. Cuatro turnos bastan para que la respuesta tenga sentido sin
 * que el prompt se vuelva enorme en una conversación larga.
 */
export function buildTutorPrompt(
  history: readonly HistoryTurn[],
  turns: number = HISTORY_TURNS
): string {
  const recent = history.slice(-turns);
  const conversation = recent
    .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.text}`)
    .join('\n');
  return `${TUTOR_INSTRUCTION}\n\n${conversation}\nTutor:`;
}

// ── Mensajes entre el hilo principal y el worker ─────────────────────────────

export type SuggestionsRequest =
  | { type: 'init'; config: SuggestionsConfigId }
  | { type: 'suggest'; id: number; text: string }
  | { type: 'reply'; id: number; history: HistoryTurn[] };

export type SuggestionsResponse =
  | { type: 'progress'; model: string; progress: number }
  | { type: 'ready'; model: string }
  | { type: 'suggestions'; id: number; suggestions: string[] }
  | { type: 'reply'; id: number; text: string }
  | { type: 'error'; id?: number; message: string };
