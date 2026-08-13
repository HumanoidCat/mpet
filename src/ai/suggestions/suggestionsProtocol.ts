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
 * ⚠️ NO LE PIDAS AL MODELO QUE ACTÚE COMO TUTOR, Y NO LE DES LÍNEAS `Tutor:` PARA
 * COPIAR. Dos incidentes en producción, los dos con la misma raíz — pedirle un papel
 * en vez de una tarea — llevaron hasta aquí:
 *
 * **I-09.** Con `"You are a friendly English tutor talking with a student…"`, ante
 * un simple "Hi, how are you?" el modelo devolvió una negativa memorizada de su
 * destilado: *"I'm sorry, but I cannot respond to this prompt as it goes against
 * OpenAI's use case policy…"*. En un proyecto 100 % offline, esa frase en pantalla
 * contradice la premisa del proyecto. Queda además un filtro en `cleanup.ts` por si
 * un modelo futuro repite el patrón.
 *
 * **I-10.** Con el prompt intercalando turnos `Student:` / `Tutor:`, el modelo
 * empezó a **copiar la última línea `Tutor:` que ya tenía delante** en vez de
 * generar una nueva — tres turnos seguidos de una conversación real recibieron
 * exactamente la misma respuesta. Diagnosticado así por Alejandro; el arreglo aquí
 * quita el problema de raíz por otra vía: si el prompt no contiene ninguna línea
 * `Tutor:`, no hay nada que copiar.
 *
 * **Medido, no solo intuido:** tres formulaciones sobre las mismas frases (ver
 * `docs/evidencias/s7/s7-t2-respuestas-del-tutor.md`). Cuanto más se le pide adoptar
 * un papel, más se activa el reflejo de negarse; el formato de diálogo es el peor de
 * los tres. Pidiéndole una **tarea concreta sobre la última frase del estudiante**,
 * responde al contenido:
 *
 *   "Well, I need to talk about signs." → "What do you think about the signs you mentioned?"
 *
 * **Lo que esto NO arregla — y por qué la solución sigue en `cleanup.ts`.** Incluso
 * con este prompt, el modelo no *conversa*: convierte la frase del estudiante en una
 * pregunta sobre lo mismo ("My name is Ana" → "What is your name?"). No es un fallo
 * de instrucción — se probaron prompts que se lo prohíben explícitamente y los
 * ignoró — es el límite de un T5 de instrucciones de este tamaño, entrenado para
 * parafrasear. `cleanTutorReply` detecta ese eco y lo sustituye. Esa capa es la que
 * sigue funcionando **si el modelo cambia**: filtra la salida, no depende de cómo se
 * construyó.
 */
export const TUTOR_INSTRUCTION = 'Write one friendly follow-up question about this sentence:';

/** Cuántos turnos de historia se recorren para encontrar el último del estudiante. */
export const HISTORY_TURNS = 4;

export interface HistoryTurn {
  role: 'user' | 'tutor';
  text: string;
}

/**
 * Arma el prompt del tutor a partir del historial.
 *
 * SOLO USA EL ÚLTIMO TURNO DEL ESTUDIANTE, nada del tutor. Se probó pasarle la
 * conversación entera con etiquetas `Student:` / `Tutor:` (I-10): fue la variante que
 * más negativas produjo, y la que dejaba una línea `Tutor:` para que el modelo la
 * copiara en vez de generar. Este modelo no mantiene hilo conversacional de todos
 * modos —es un T5 de instrucciones, no de chat— así que dialogar con "historial" no
 * mejora la respuesta, solo abre estas dos formas de romperse.
 *
 * `HISTORY_TURNS` acota cuánto hay que mirar hacia atrás para encontrar ese último
 * turno del estudiante en una conversación larga.
 */
export function buildTutorPrompt(
  history: readonly HistoryTurn[],
  turns: number = HISTORY_TURNS
): string {
  const recientes = history.slice(-turns);
  const ultimoDelEstudiante = [...recientes].reverse().find((m) => m.role === 'user');
  const frase = ultimoDelEstudiante?.text ?? '';
  return `${TUTOR_INSTRUCTION} "${frase}"`;
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
