/**
 * Implementación real del contrato `AIPipeline`. Dueño: Isaac (épica E3).
 *
 * ESTADO POR ETAPA (se completa semana a semana; ver `guias/isaac.md`):
 *   ✅ init           — S2-T4/S2-T5: carga los modelos en workers y reporta progreso
 *   ✅ transcribe     — S2-T4: ASR real con timestamps por palabra
 *   ✅ correctGrammar — S3-T3: T5 cuantizado + diff palabra a palabra
 *   ✅ speak          — S5-T5: MMS-TTS, PCM de referencia a 16 kHz
 *   ✅ suggest        — S6-T4: prompts fijos, generación reproducible
 *   ✅ reply          — S7-T2: tutor bilingüe con modelo de chat y muestreo
 *
 * El contrato queda completo: ya no hay etapas de paso a través. Durante semanas las
 * pendientes devolvieron valores neutros —lista vacía, frase fija, silencio— para que
 * el orquestador pudiera integrar lo ya hecho sin que la aplicación reventara; ese
 * andamio ya no hace falta.
 *
 * QUÉ SE CARGA CUÁNDO (S7-T4):
 *   `init()`      → reconocedor y corrector, ~303 MiB. Son los que hacen falta en
 *                   cuanto el estudiante abre la boca.
 *   bajo demanda  → sintetizador (109 MiB) al pedir audio, y modelo del tutor
 *                   en el primer turno de conversación.
 *
 * ⚠️ EL PESO DEL TUTOR ESTÁ SIN MEDIR desde que pasó a ser un modelo de chat. El de
 * antes ocupaba 265 MiB medidos; del nuevo solo se conoce la ficha del Hub, y este
 * proyecto ya se llevó un susto con eso (D-12: Kokoro se estimó en 325 MB y
 * cuantizado medía 88). **Hay que medir la descarga real antes de dar por bueno el
 * cambio**, y comprobar que la latencia del turno sigue dentro del presupuesto de
 * D-15. Si no sale, la vuelta atrás es una constante:
 * `DEFAULT_SUGGESTIONS_CONFIG` en `suggestions/suggestionsProtocol.ts`.
 */

import type {
  AIPipeline,
  ChatMessage,
  Edit,
  SupportedLanguage,
  Transcription,
} from '@shared/contracts';
import { createAsrClient, type AsrClientOptions } from './asr/asrClient';
import { createGrammarClient, type GrammarClientOptions } from './grammar/grammarClient';
import { createLazyLoader } from './lazy';
import {
  createSuggestionsClient,
  type SuggestionsClientOptions,
} from './suggestions/suggestionsClient';
import { createTtsClient, type TtsClientOptions } from './tts/ttsClient';

export interface AIPipelineOptions {
  asr?: AsrClientOptions;
  grammar?: GrammarClientOptions;
  tts?: TtsClientOptions;
  suggestions?: SuggestionsClientOptions;
}

export function createAIPipeline(options: AIPipelineOptions = {}): AIPipeline {
  const asr = createAsrClient(options.asr);
  const grammar = createGrammarClient(options.grammar);
  const tts = createTtsClient(options.tts);
  const suggestions = createSuggestionsClient(options.suggestions);

  // Se guarda el callback de progreso que llega en `init()` porque el sintetizador se
  // carga más tarde, cuando ya nadie nos lo va a volver a pasar: sin esto, esa
  // descarga de 109 MB ocurriría sin que la interfaz pudiera avisar de nada.
  let reportProgress: ((model: string, progress: number) => void) | undefined;

  const ttsLoader = createLazyLoader(() =>
    tts.init((model, progress) => reportProgress?.(model, progress))
  );

  // El modelo del tutor también va bajo demanda, pero por una razón distinta que el
  // sintetizador: no es que se use poco —`reply()` interviene en cada turno— sino que
  // son 265 MiB que no hacen falta para la pantalla inicial. Lo que se gana es que la
  // primera carga no espere por ellos, no ahorrarlos. Medido en el spike S6-T4.
  const suggestionsLoader = createLazyLoader(() =>
    suggestions.init((model, progress) => reportProgress?.(model, progress))
  );

  return {
    async init(onProgress) {
      // Carga SECUENCIAL, no en paralelo, a propósito: cada modelo ocupa cientos de
      // MB (el ASR midió ~290 MB de heap en S1-T7). Cargarlos a la vez dispararía el
      // pico de memoria y competirían por el ancho de banda, alargando la primera
      // corrida. El ASR va primero porque es el que se necesita antes en cada turno.
      //
      // El orquestador reenvía cada reporte como evento `model-progress`, y como el
      // callback incluye el nombre del modelo, la UI puede mostrar cuál va cargando.
      //
      // EL TTS YA NO SE CARGA AQUÍ (S7-T4). Un turno empieza con el estudiante
      // hablando, así que el reconocedor y el corrector sí hacen falta desde el
      // principio; el sintetizador solo cuando se pulsa "escuchar", y hay usuarios
      // que no lo pulsan nunca. Sacarlo de aquí baja la primera descarga de ~411 a
      // ~303 MiB. El precio es una espera la primera vez que se pide audio, y por eso
      // el progreso de esa carga se sigue reportando por este mismo callback.
      reportProgress = onProgress;
      const report = (model: string, progress: number) => reportProgress?.(model, progress);
      await asr.init(report);
      await grammar.init(report);
    },

    transcribe(
      pcm: Float32Array,
      language?: SupportedLanguage,
      alsoTranslate?: boolean
    ): Promise<Transcription> {
      return asr.transcribe(pcm, language, alsoTranslate);
    },

    correctGrammar(text: string): Promise<{ corrected: string; edits: Edit[] }> {
      return grammar.correct(text);
    },

    /**
     * S5-T5 · Audio de referencia de la frase, como PCM mono a 16 kHz.
     *
     * Lo consumen dos módulos: `App.tsx` lo reproduce (con botón de 0.7× para
     * escucharlo despacio) y el comparador de pronunciación extrae sus MFCC para
     * alinearlos contra la voz del estudiante. Por eso el contrato devuelve las
     * muestras y no reproduce por su cuenta.
     */
    async speak(text: string): Promise<Float32Array> {
      // Carga perezosa: la primera llamada descarga el modelo, las siguientes no
      // pagan nada. Si dos frases se piden a la vez antes de terminar la carga, las
      // dos esperan a la MISMA descarga (ver `lazy.ts`).
      await ttsLoader.ensure();
      return tts.speak(text);
    },

    /**
     * S6-T4 · Sugerencias de mejora para la frase del estudiante.
     *
     * Puede devolver **lista vacía**, y no es un error: significa que el modelo no
     * encontró nada que mejorar. Es preferible a mostrar una "sugerencia" que repite
     * palabra por palabra lo que el estudiante acaba de decir, que era el caso más
     * frecuente antes de filtrarlas (5 de 8 en el spike S6-T4).
     */
    async suggest(text: string): Promise<string[]> {
      await suggestionsLoader.ensure();
      return suggestions.suggest(text);
    },

    /**
     * S7-T2 · Respuesta conversacional del tutor.
     *
     * Del historial solo viajan el rol y el texto. No es solo eficiencia: un
     * `ChatMessage` lleva dentro el resultado de pronunciación con sus arrays de
     * audio, y mandar todo eso al worker en cada turno sería copiar megabytes que el
     * modelo no mira.
     */
    async reply(
      history: ChatMessage[],
      language?: SupportedLanguage,
      ingles?: string
    ): Promise<string> {
      await suggestionsLoader.ensure();
      return suggestions.reply(
        history.map((m) => ({ role: m.role, text: m.text })),
        language,
        ingles
      );
    },
  };
}
