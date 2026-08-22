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

/**
 * Modelos admitidos para las dos tareas.
 *
 * Dos familias distintas, y la diferencia no es de tamaño sino de naturaleza:
 *
 * - **LaMini-Flan-T5** (`seq2seq`): recibe una cadena y devuelve una cadena. Es un T5
 *   de instrucciones — reescribe bien, dialoga mal. No tiene forma de recibir un
 *   historial: por construcción no puede recordar nada entre turnos.
 * - **Qwen2.5-Instruct** (`chat`): recibe un array de mensajes con papeles y devuelve
 *   otro mensaje. Está entrenado para conversar y es **multilingüe**, que es lo que
 *   hace posible el tutor bilingüe.
 */
export type SuggestionsModelId =
  | 'Xenova/LaMini-Flan-T5-248M'
  | 'Xenova/LaMini-Flan-T5-77M'
  | 'onnx-community/Qwen2.5-0.5B-Instruct';

/**
 * Cómo se le habla al modelo.
 *
 * Decide qué `pipeline` se carga y cómo se arma la entrada, así que no es un detalle
 * de configuración: los dos caminos son código distinto en el worker.
 */
export type SuggestionsModelKind = 'seq2seq' | 'chat';

/**
 * Cuantización.
 *
 * `q8` y no fp32, al revés que en el sintetizador. No es incoherencia: lo que el
 * spike de voz demostró es que cuantizar destroza el **audio**. En modelos de texto
 * q8 funciona — el corrector de gramática corre en q8 en producción y acierta 6 de 8
 * frases. Además fp32 aquí serían 1.1 GB, que no es una opción.
 */
export type SuggestionsDType = 'q8' | 'q4' | 'fp32';

export interface SuggestionsConfig {
  id: SuggestionsConfigId;
  label: string;
  model: SuggestionsModelId;
  kind: SuggestionsModelKind;
  dtype: SuggestionsDType;
  /** Descarga esperada en MB, sumando los archivos ONNX del Hub. */
  expectedMB: number;
  rationale: string;
}

export type SuggestionsConfigId = 'grande-248m' | 'pequeno-77m' | 'chat-qwen-05b';

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
    kind: 'seq2seq',
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
    kind: 'seq2seq',
    dtype: 'q8',
    expectedMB: 98,
    rationale:
      'Casi tres veces más liviano. La duda es si con 77M de parámetros las ' +
      'respuestas salen genéricas o incoherentes: eso es lo que el spike mide.',
  },
  {
    id: 'chat-qwen-05b',
    label: 'Chat bilingüe · Qwen2.5-0.5B-Instruct q8',
    model: 'onnx-community/Qwen2.5-0.5B-Instruct',
    kind: 'chat',
    // ⚠️ q8 Y NO q4, aunque q4 pesaría menos. **D-05 lo midió en este mismo motor**:
    // la variante de 4 bits resultó 3.8 veces más lenta Y más pesada en caché,
    // porque ONNX Runtime sobre WebAssembly no tiene núcleos para enteros de 4 bits
    // y descuantiza en cada inferencia.
    //
    // En un modelo de chat el castigo es mucho peor que en el corrector donde se
    // midió: aquel descuantizaba una vez por frase, este genera **token a token**,
    // así que paga esa penalización en cada uno de los hasta 96 tokens de la
    // respuesta. Se probó q4 el 16-ago y el turno se volvió notoriamente lento.
    dtype: 'q8',
    // Medido (13-ago-2026): la descarga real da ≈495 MiB, así que esta cifra sí
    // coincidía con la ficha del Hub — a diferencia de Kokoro en D-12, que se
    // estimó en 325 MB y medido pesaba 88. PERO medir esto destapó dos problemas
    // serios, no solo el peso: el archivo no queda en caché (se re-descarga
    // completo en cada carga de página, verificado dos veces) y la latencia de
    // reply() salió en ~17 s de media (10× la referencia de LaMini, 1.7 s).
    // Detalle completo: docs/evidencias/s8/d18-qwen-peso-latencia-medidos.md
    expectedMB: 500,
    rationale:
      'Modelo de chat de verdad y multilingüe: recibe el historial con papeles y ' +
      'está entrenado para usarlo, así que puede recordar entre turnos y responder ' +
      'preguntas de contenido — dos cosas que un T5 de instrucciones no puede hacer ' +
      'ni en principio. Es además lo que hace posible el tutor bilingüe: LaMini solo ' +
      'sabe inglés. En 8 bits por D-05: en este motor, 4 bits es más lento y más pesado.',
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

/**
 * POR QUÉ SE VOLVIÓ AL MODELO RÁPIDO (17-ago), y qué lo hizo posible.
 *
 * El modelo de chat multilingüe se adoptó para que el tutor pudiera atender a un
 * estudiante que recurre al español. Medido en la aplicación desplegada, costaba
 * **7 a 16 segundos por respuesta** —cinco turnos cronometrados— además de
 * escribir párrafos en vez de conversar.
 *
 * Lo que se vio al revisarlo es que **el tutor no necesitaba saber español**: lo
 * único que hacía falta era traducir lo que el estudiante dijo. Y eso ya sabía
 * hacerlo un modelo que estaba cargado desde el principio — Whisper multilingüe
 * tiene una tarea `translate` que devuelve inglés a partir de cualquier idioma.
 *
 * Con la traducción resuelta en el reconocedor, al tutor le llega siempre inglés
 * y puede volver a ser el T5 rápido. **El bilingüe no se pierde: se resuelve
 * antes y más barato.**
 *
 * La configuración de chat se conserva seleccionable, con sus mediciones, porque
 * el día que la latencia de un modelo así sea aceptable en el navegador aporta
 * algo que el T5 no puede dar: memoria entre turnos.
 */

/**
 * La configuración de chat, que se mantiene seleccionable a propósito.
 *
 * **No la usa ningún camino de producción**: el worker soporta las dos familias y
 * esta constante existe para que la alternativa quede declarada, con sus
 * mediciones, junto a la que sí corre. Cambiar de una a otra es cambiar
 * `DEFAULT_SUGGESTIONS_CONFIG` y nada más — el resto de la cadena no se entera.
 *
 * Lo que la descartó está medido dos veces, de forma independiente: 7 a 16 s por
 * respuesta en la aplicación desplegada, y ~17 s de media en el spike de peso y
 * latencia, que además encontró que el modelo **no queda en caché** y se
 * re-descarga en cada carga de página. Ese segundo hallazgo la descalifica por sí
 * solo, porque compromete el funcionamiento sin conexión.
 *
 * Se conserva porque la idea no era mala: un modelo de chat aporta memoria entre
 * turnos, que un T5 no puede dar ni en principio. El día que uno así responda en
 * tiempo razonable en el navegador, la vuelta es una línea.
 * Evidencia: `docs/evidencias/s8/d18-qwen-peso-latencia-medidos.md`.
 */
export const FALLBACK_SUGGESTIONS_CONFIG: SuggestionsConfigId = 'chat-qwen-05b';

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

/**
 * ⚠️ LA FRASE VA ENTRECOMILLADA Y EL PROMPT TERMINA EN «Rewritten sentence:».
 *
 * Sin esas dos cosas, cuando la frase del estudiante es una **pregunta**, el modelo
 * la contesta en vez de reescribirla. Verificado en producción el 17-ago con
 * *«What do you think about learning languages?»*: las dos sugerencias que salieron
 * fueron respuestas a la pregunta, no reescrituras de ella.
 *
 * Las comillas marcan dónde empieza y acaba el dato, y la etiqueta final le dice al
 * modelo qué tiene que escribir a continuación. Es la misma forma que ya usa la rama
 * de chat del worker, por la misma razón.
 *
 * El filtro de `cleanup.ts` sigue haciendo falta: esto reduce el fallo, no lo elimina.
 */
export function buildSuggestionPrompt(prompt: SuggestionPrompt, text: string): string {
  return `${prompt.instruction}\n\nSentence: "${text}"\n\nRewritten sentence:`;
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

// ── Tutor bilingüe con modelo de chat ────────────────────────────────────────

/**
 * Un mensaje tal como lo espera un modelo de chat.
 *
 * `assistant` y no `tutor`: es el papel que entiende la plantilla de chat del modelo.
 * Traducir de `HistoryTurn` a esto es justamente el trabajo de `buildTutorMessages`.
 */
export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Instrucción de sistema del tutor bilingüe.
 *
 * POR QUÉ AQUÍ SÍ SE LE DA UN PAPEL, cuando `TUTOR_INSTRUCTION` advierte de no
 * hacerlo: aquella advertencia vale para LaMini-Flan-T5, donde pedir un papel
 * disparaba negativas memorizadas (I-09). Un modelo de chat tiene un lugar
 * *previsto* para la instrucción de sistema y está entrenado para recibirla ahí; es
 * al revés, no dársela es lo que produce respuestas erráticas. Se conservan las dos
 * porque el proyecto admite las dos familias de modelo.
 *
 * QUÉ HACE BILINGÜE AL TUTOR: la regla del español. Un principiante que todavía no
 * consigue armar la frase en inglés se queda mudo si la aplicación no lo entiende, y
 * esa es exactamente la barrera que el proyecto existe para bajar. Cuando el
 * estudiante recurre al español, el tutor no lo corrige por hacerlo: le da la frase
 * en inglés y sigue conversando.
 *
 * El límite de una o dos frases no es estético. La respuesta se sintetiza con voz y
 * se escucha entera: un párrafo se vuelve un audio largo que el estudiante no espera.
 */
export const TUTOR_SYSTEM_EN =
  'You are a friendly English conversation partner. Follow these rules exactly:\n' +
  '1. Reply with AT MOST two short sentences. Never write a paragraph.\n' +
  '2. React to what the student said, then ask them ONE question about it.\n' +
  '3. Never repeat the student sentence back to them.\n' +
  '4. Never explain, define, or give advice about learning. Just chat.\n\n' +
  'Examples of the style:\n' +
  'Student: I went to the beach last weekend with my family.\n' +
  'You: That sounds lovely! Which beach did you go to?\n' +
  'Student: What do you think about learning languages?\n' +
  'You: I think it opens a lot of doors. Which one are you finding hardest?\n' +
  'Student: My name is Ana and I am a nurse.\n' +
  'You: Nice to meet you, Ana! What kind of nursing do you do?';

/**
 * Variante para cuando el turno del estudiante vino en español.
 *
 * Se cambia la instrucción entera en vez de añadir una línea porque el modelo es
 * pequeño: cuanto más corta y directa la orden, más la sigue. Aquí lo importante es
 * que la ayuda en inglés vaya **primero** — es lo que el estudiante necesita para
 * poder seguir— y que no se le regañe por haber usado el español.
 */
export const TUTOR_SYSTEM_ES =
  'You are a friendly English conversation partner. The student could not say this in ' +
  'English yet, so you are given what they meant, already in English. Follow these rules:\n' +
  '1. Reply with AT MOST two short sentences.\n' +
  '2. React to what they meant, then ask ONE question about it.\n' +
  '3. Never mention Spanish, translating, or that they struggled.\n\n' +
  'Example:\n' +
  'Student meant: I want to talk about my job.\n' +
  'You: Sure, let us talk about work! What do you do?';

/**
 * Cómo se le muestra al estudiante la frase en inglés que no supo decir.
 *
 * POR QUÉ NO LO ESCRIBE EL MODELO. Antes se le pedía al tutor que tradujera y
 * conversara a la vez, y para eso hacía falta un modelo de chat multilingüe: 7
 * segundos por turno medidos. Ahora la traducción la hace el reconocedor, que ya
 * está cargado y sabe hacerlo, y esta línea la presenta.
 *
 * Además de rápido es más fiable: el texto es exactamente lo que tradujo Whisper,
 * sin pasar por un modelo que podría reformularlo o inventarlo.
 */
export function prefijoTraduccion(ingles: string): string {
  return `In English: «${ingles}»`;
}

/**
 * Arma la conversación para un modelo de chat.
 *
 * A DIFERENCIA DE `buildTutorPrompt`, AQUÍ SÍ SE PASA EL HISTORIAL COMPLETO. La
 * prohibición que impuso I-10 —no darle al modelo sus propias respuestas— era una
 * mitigación para un modelo que copiaba lo que tuviera delante. Un modelo de chat
 * está entrenado para recibir sus turnos anteriores con el papel `assistant`, y sin
 * ellos no puede recordar nada: perdería justamente la capacidad por la que se lo
 * trae. La protección contra la repetición no desaparece, se mueve a donde
 * corresponde: `cleanTutorReply` sigue comparando contra la respuesta anterior.
 *
 * El recorte a `turns` se mantiene por la razón de siempre: la latencia crece con la
 * entrada, y el modelo tiene una ventana de contexto finita.
 */
export function buildTutorMessages(
  history: readonly HistoryTurn[],
  language: 'en' | 'es' = 'en',
  turns: number = HISTORY_TURNS
): ChatTurn[] {
  const recientes = history.slice(-turns);
  return [
    { role: 'system', content: language === 'es' ? TUTOR_SYSTEM_ES : TUTOR_SYSTEM_EN },
    ...recientes.map(
      (m): ChatTurn => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      })
    ),
  ];
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

// ── Parámetros de generación ─────────────────────────────────────────────────

/**
 * Cómo genera cada tarea, y por qué **no** son iguales.
 *
 * Hasta ahora las dos usaban decodificación voraz (`do_sample: false`). Para las
 * sugerencias es lo correcto y se mantiene: con muestreo, la misma frase daría una
 * sugerencia distinta en cada intento y el estudiante no entendería por qué cambia.
 * Reproducible es mejor que variado cuando lo que se muestra es una corrección.
 *
 * **Para conversar es justo al revés, y es la causa que faltaba probar.** La
 * decodificación voraz toma siempre el token más probable, así que ante entradas
 * parecidas produce salidas idénticas — es determinista por definición. Eso explica
 * las respuestas repetidas que se vieron en producción con LaMini y también las que
 * Isaac encontró al medir SmolLM2, donde 4 de 6 respuestas salieron iguales carácter
 * por carácter. Él lo dejó anotado como sospecha —*«reconsiderar si el límite es la
 * decodificación voraz en sí y no el modelo»*— y probó `repetition_penalty` y
 * `no_repeat_ngram_size`, que son parches sobre el síntoma: penalizan repetir sin
 * quitar el determinismo. Muestrear sí lo quita.
 *
 * Los valores son los habituales para diálogo corto: `temperature` 0.7 da variedad
 * sin incoherencia, y `top_p` 0.9 corta la cola de tokens improbables, que es de
 * donde sale el disparate cuando se muestrea sin límite.
 *
 * Queda por medir en la aplicación real si esto basta por sí solo. Es barato de
 * comprobar: hablar tres veces seguidas y ver si las respuestas difieren.
 */
export const GEN_SUGGEST = {
  do_sample: false,
} as const;

export const GEN_REPLY = {
  do_sample: true,
  temperature: 0.7,
  top_p: 0.9,
} as const;

// ── Mensajes entre el hilo principal y el worker ─────────────────────────────

export type SuggestionsRequest =
  | { type: 'init'; config: SuggestionsConfigId }
  | { type: 'suggest'; id: number; text: string }
  | {
      type: 'reply';
      id: number;
      history: HistoryTurn[];
      /** Idioma del último turno del estudiante; decide qué instrucción se usa. */
      language?: 'en' | 'es';
      /** Traducción al inglés hecha por el reconocedor, si el turno vino en español. */
      ingles?: string;
    };

export type SuggestionsResponse =
  | { type: 'progress'; model: string; progress: number }
  | { type: 'ready'; model: string }
  | { type: 'suggestions'; id: number; suggestions: string[] }
  | { type: 'reply'; id: number; text: string }
  | { type: 'error'; id?: number; message: string };
