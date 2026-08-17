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
 * DOS FAMILIAS DE MODELO, y el worker soporta las dos:
 *
 *   - **`seq2seq`** (LaMini-Flan-T5): cadena de entrada, cadena de salida. Fue el
 *     modelo original, elegido en el spike S6-T4. Reescribe bien y dialoga mal: no
 *     tiene forma de recibir un historial, así que por construcción no recuerda nada
 *     entre turnos. Detalle en `docs/evidencias/s6/s6-t4-modelo-tutor.md`.
 *   - **`chat`** (Qwen2.5-Instruct): recibe la conversación con papeles y devuelve un
 *     turno nuevo. Está entrenado para dialogar y es multilingüe, que es lo que hace
 *     posible el tutor bilingüe.
 *
 * CÓMO GENERA CADA TAREA: las sugerencias siguen siendo voraces (`do_sample: false`)
 * porque una corrección que cambia en cada intento confunde al estudiante. La
 * conversación pasa a muestreo, y eso **es el arreglo de la repetición**: la
 * decodificación voraz toma siempre el token más probable, así que ante entradas
 * parecidas devuelve la misma salida. Ver `GEN_SUGGEST` y `GEN_REPLY`.
 */

import { pipeline } from '@huggingface/transformers';
import { createRangedProgressAggregator, type RawProgressEvent } from '../model-cache/progress';
import { cleanSuggestions, cleanTutorReply } from './cleanup';
import {
  GEN_REPLY,
  GEN_SUGGEST,
  SUGGESTION_PROMPTS,
  buildSuggestionPrompt,
  buildTutorMessages,
  buildTutorPrompt,
  prefijoTraduccion,
  getSuggestionsConfig,
  type ChatTurn,
  type SuggestionsModelKind,
  type SuggestionsRequest,
  type SuggestionsResponse,
} from './suggestionsProtocol';

/** Un T5: cadena de entrada, cadena de salida. */
type Seq2SeqGenerator = (
  input: string,
  options?: Record<string, unknown>
) => Promise<Array<{ generated_text: string }>>;

/**
 * Un modelo de chat: array de mensajes de entrada, y de salida **la conversación
 * entera con el mensaje nuevo al final** — de ahí el `.at(-1)` al leer la respuesta.
 */
type ChatGenerator = (
  messages: ChatTurn[],
  options?: Record<string, unknown>
) => Promise<Array<{ generated_text: ChatTurn[] }>>;

let generator: Seq2SeqGenerator | ChatGenerator | null = null;
let kind: SuggestionsModelKind = 'seq2seq';

/**
 * Última respuesta dada y número de turno, para los chequeos de `cleanTutorReply`
 * (I-10: repetición; ver ese archivo). Vive en el worker porque es aquí donde se
 * decide si la respuesta sirve, antes de mandarla al hilo principal.
 */
let ultimaRespuesta: string | undefined;
let turno = 0;

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

/**
 * Techo para el tutor de chat.
 *
 * Un turno bilingüe necesita más que los 48 del T5: primero da la frase en inglés
 * que el estudiante no supo decir y después pregunta algo.
 *
 * PERO 96 ERAN DEMASIADOS. Con ese margen el modelo escribía párrafos de cinco
 * líneas sobre crecimiento personal en vez de conversar (visto el 17-ago), y eso
 * además se sintetiza con voz: unos 25 segundos de audio para escuchar. El techo no
 * es solo un límite de coste, es lo que fuerza el registro conversacional.
 *
 * 56 alcanzan para «In English: I want to talk about my job. What do you do for
 * work?», que es el turno bilingüe más largo previsto, y no para un ensayo.
 */
const MAX_TOKENS_REPLY_CHAT = 56;

/**
 * Genera a partir de una cadena. Solo válido con modelos `seq2seq`.
 *
 * `params` viaja explícito en vez de estar fijo aquí dentro porque las dos tareas
 * generan distinto a propósito: las sugerencias voraces (reproducibles) y la
 * conversación con muestreo (variada). Ver `GEN_SUGGEST` y `GEN_REPLY`.
 */
async function generateSeq2Seq(
  prompt: string,
  maxTokens: number,
  params: Record<string, unknown>
): Promise<string> {
  if (!generator) {
    throw new Error('El modelo del tutor no está cargado: llama a init() primero.');
  }
  if (kind !== 'seq2seq') {
    throw new Error('Se pidió generación de texto plano a un modelo de chat.');
  }
  const out = await (generator as Seq2SeqGenerator)(prompt, {
    ...params,
    max_new_tokens: maxTokens,
  });
  return (out?.[0]?.generated_text ?? '').trim();
}

/** Genera a partir de una conversación con papeles. Solo válido con modelos `chat`. */
async function generateChat(
  messages: ChatTurn[],
  maxTokens: number,
  params: Record<string, unknown>
): Promise<string> {
  if (!generator) {
    throw new Error('El modelo del tutor no está cargado: llama a init() primero.');
  }
  if (kind !== 'chat') {
    throw new Error('Se pidió generación conversacional a un modelo que no es de chat.');
  }
  const out = await (generator as ChatGenerator)(messages, {
    ...params,
    max_new_tokens: maxTokens,
  });
  // La salida es la conversación completa; el turno nuevo es el último.
  return (out?.[0]?.generated_text?.at(-1)?.content ?? '').trim();
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

      // Dos familias, dos pipelines distintos de transformers.js. `text-generation`
      // es el que acepta un array de mensajes y aplica la plantilla de chat del
      // propio tokenizador; `text2text-generation` es el de los T5.
      const loaded =
        config.kind === 'chat'
          ? await pipeline('text-generation', config.model, {
              dtype: config.dtype,
              progress_callback: (e) => progress.handle(e as RawProgressEvent),
            })
          : await pipeline('text2text-generation', config.model, {
              dtype: config.dtype,
              progress_callback: (e) => progress.handle(e as RawProgressEvent),
            });
      progress.complete();
      generator = loaded as unknown as Seq2SeqGenerator | ChatGenerator;
      kind = config.kind;

      post({ type: 'ready', model: config.model });
      return;
    }

    if (msg.type === 'suggest') {
      // Una generación por instrucción fija. Van en secuencia y no en paralelo: es
      // el mismo modelo, así que lanzarlas a la vez no acelera nada y multiplica el
      // pico de memoria.
      const raw: string[] = [];
      for (const prompt of SUGGESTION_PROMPTS) {
        // ⚠️ LA FRASE DEL ESTUDIANTE VA COMO **DATO**, NUNCA COMO MENSAJE DE USUARIO.
        //
        // Es el mismo texto que le llega al T5, en una sola cadena. Ponerlo como
        // `{ role: 'user' }` parece lo natural en un modelo de chat, y es
        // exactamente lo que rompió las sugerencias (17-ago): el modelo recibía la
        // frase como si el estudiante se la estuviera diciendo A ÉL, y su reflejo de
        // contestar le ganaba a la instrucción de reescribir.
        //
        // Se nota sobre todo con preguntas. Ante «What do you think about learning
        // languages?» devolvía «Of course, I think it's fascinating! Learning a new
        // language can be...» —una respuesta— en vez de una reescritura de la
        // pregunta. Con frases declarativas acertaba, lo que hacía el fallo
        // intermitente y difícil de ver.
        //
        // Metiendo la frase entrecomillada dentro del turno de usuario, junto a la
        // instrucción, deja de ser algo a lo que responder y pasa a ser el material
        // sobre el que trabajar. El cierre `Rewritten sentence:` marca dónde tiene
        // que empezar a escribir.
        raw.push(
          kind === 'chat'
            ? await generateChat(
                [
                  {
                    role: 'system',
                    content:
                      'You rewrite sentences. You never answer them, never comment on ' +
                      'them, and never add explanations. You output one sentence only.',
                  },
                  {
                    role: 'user',
                    content: `${prompt.instruction}\n\nSentence: "${msg.text}"\n\nRewritten sentence:`,
                  },
                ],
                MAX_TOKENS_SUGGESTION,
                GEN_SUGGEST
              )
            : await generateSeq2Seq(
                buildSuggestionPrompt(prompt, msg.text),
                MAX_TOKENS_SUGGESTION,
                GEN_SUGGEST
              )
        );
      }

      // Se descartan las que repiten la frase del estudiante: es el caso más
      // frecuente (5 de 8 en el spike) y mostrarlas sería ruido. Lista vacía es un
      // resultado honesto: no había nada que mejorar.
      post({ type: 'suggestions', id: msg.id, suggestions: cleanSuggestions(msg.text, raw) });
      return;
    }

    if (msg.type === 'reply') {
      const idioma = msg.language ?? 'en';

      // Un modelo de chat recibe el historial completo con papeles: es lo que le
      // permite recordar entre turnos. Un T5 recibe solo la última frase, porque
      // darle sus propias respuestas fue la causa de I-10.
      const crudo =
        kind === 'chat'
          ? await generateChat(
              buildTutorMessages(msg.history, idioma),
              MAX_TOKENS_REPLY_CHAT,
              GEN_REPLY
            )
          : await generateSeq2Seq(buildTutorPrompt(msg.history), MAX_TOKENS_REPLY, GEN_REPLY);

      // El último turno del estudiante hace falta dos veces: para armar el prompt
      // (buildTutorPrompt) y para que cleanTutorReply pueda detectar si la respuesta
      // es un eco de esa misma frase (I-10 / el defecto de "no conversa").
      const ultimoDelEstudiante = [...msg.history].reverse().find((m) => m.role === 'user');

      const text = cleanTutorReply(crudo, {
        // El detector de eco compara palabra a palabra contra lo que dijo el
        // estudiante, y eso solo tiene sentido si los dos están en el mismo idioma.
        // En un turno en español la respuesta va en inglés a propósito —es la ayuda
        // para traducir— así que compararlas marcaría como eco algo que no lo es.
        studentUtterance: idioma === 'es' ? undefined : ultimoDelEstudiante?.text,
        previousReply: ultimaRespuesta,
        turno: turno++,
      });
      ultimaRespuesta = text;

      // La frase en inglés la antepone el código, no el modelo. Es exactamente lo
      // que tradujo el reconocedor, sin pasar por un modelo que pudiera
      // reformularla o inventarla — y es lo que permite que el tutor no necesite
      // saber español, que era lo único que obligaba a un modelo multilingüe.
      const conTraduccion =
        msg.ingles && idioma === 'es' ? `${prefijoTraduccion(msg.ingles)} ${text}` : text;

      post({ type: 'reply', id: msg.id, text: conTraduccion });
    }
  } catch (err) {
    post({
      type: 'error',
      id: msg.type === 'init' ? undefined : msg.id,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
