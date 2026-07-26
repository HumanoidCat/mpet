/**
 * Implementación real del contrato `AIPipeline`. Dueño: Isaac (épica E3).
 *
 * ESTADO POR ETAPA (se completa semana a semana; ver `guias/isaac.md`):
 *   ✅ init           — S2-T4/S2-T5: carga los modelos en workers y reporta progreso
 *   ✅ transcribe     — S2-T4: ASR real con timestamps por palabra
 *   ✅ correctGrammar — S3-T3: T5 cuantizado + diff palabra a palabra
 *   ⏳ speak          — S5-T5 (SpeechT5)
 *   ⏳ suggest        — S6-T4 (LLM ligero)
 *   ⏳ reply          — S7-T2 (prompt de tutor)
 *
 * POR QUÉ LAS ETAPAS PENDIENTES NO LANZAN ERROR:
 * El orquestador (Alejandro) llama a `transcribe → correctGrammar → reply` en
 * cadena. Si las que faltan lanzaran excepción, integrar lo ya hecho rompería la app
 * entera. En su lugar devuelven un valor neutro y documentado: la app funciona de
 * punta a punta y cada etapa se sustituye sin tocar este contrato.
 */

import type { AIPipeline, Edit, Transcription } from '@shared/contracts';
import { createAsrClient, type AsrClientOptions } from './asr/asrClient';
import { createGrammarClient, type GrammarClientOptions } from './grammar/grammarClient';

export interface AIPipelineOptions {
  asr?: AsrClientOptions;
  grammar?: GrammarClientOptions;
}

export function createAIPipeline(options: AIPipelineOptions = {}): AIPipeline {
  const asr = createAsrClient(options.asr);
  const grammar = createGrammarClient(options.grammar);

  return {
    async init(onProgress) {
      // Carga SECUENCIAL, no en paralelo, a propósito: cada modelo ocupa cientos de
      // MB (el ASR midió ~290 MB de heap en S1-T7). Cargarlos a la vez dispararía el
      // pico de memoria y competirían por el ancho de banda, alargando la primera
      // corrida. El ASR va primero porque es el que se necesita antes en cada turno.
      //
      // El orquestador reenvía cada reporte como evento `model-progress`, y como el
      // callback incluye el nombre del modelo, la UI puede mostrar cuál va cargando.
      const report = (model: string, progress: number) => onProgress?.(model, progress);
      await asr.init(report);
      await grammar.init(report);
    },

    transcribe(pcm: Float32Array): Promise<Transcription> {
      return asr.transcribe(pcm);
    },

    correctGrammar(text: string): Promise<{ corrected: string; edits: Edit[] }> {
      return grammar.correct(text);
    },

    // ── Pendientes: paso a través temporal ───────────────────────────────────

    /** PENDIENTE S6-T4. Sin sugerencias todavía: lista vacía. */
    async suggest(): Promise<string[]> {
      return [];
    },

    /** PENDIENTE S7-T2. Respuesta fija para que el chat no quede mudo. */
    async reply(): Promise<string> {
      return 'Got it! (respuesta del tutor pendiente — S7-T2)';
    },

    /** PENDIENTE S5-T5. Devuelve silencio: el reproductor no falla, no suena nada. */
    async speak(): Promise<Float32Array> {
      return new Float32Array(0);
    },
  };
}
