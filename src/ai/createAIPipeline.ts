/**
 * Implementación real del contrato `AIPipeline`. Dueño: Isaac (épica E3).
 *
 * ESTADO POR ETAPA (se completa semana a semana; ver `guias/isaac.md`):
 *   ✅ init      — S2-T4/S2-T5: carga Whisper en worker y reporta progreso
 *   ✅ transcribe — S2-T4: ASR real con timestamps por palabra
 *   ⏳ correctGrammar — S3-T3 (T5 cuantizado)
 *   ⏳ speak          — S5-T5 (SpeechT5)
 *   ⏳ suggest        — S6-T4 (LLM ligero)
 *   ⏳ reply          — S7-T2 (prompt de tutor)
 *
 * POR QUÉ LAS ETAPAS PENDIENTES NO LANZAN ERROR:
 * El orquestador (Alejandro) llama a `transcribe → correctGrammar → reply` en
 * cadena. Si las que faltan lanzaran excepción, integrar el ASR real rompería la
 * app entera y habría que esperar hasta la Semana 7 para probar nada. En su lugar
 * devuelven un "paso a través" neutro y bien documentado: la app sigue funcionando
 * de punta a punta y cada etapa se va sustituyendo sin tocar este contrato.
 */

import type { AIPipeline, Edit, Transcription } from '@shared/contracts';
import { createAsrClient, type AsrClientOptions } from './asr/asrClient';

export interface AIPipelineOptions extends AsrClientOptions {}

export function createAIPipeline(options: AIPipelineOptions = {}): AIPipeline {
  const asr = createAsrClient(options);

  return {
    async init(onProgress) {
      // El orquestador reenvía esto como evento `model-progress` al event bus,
      // y la UI (Monestel) lo pinta como barra de descarga.
      await asr.init((model, progress) => onProgress?.(model, progress));
    },

    transcribe(pcm: Float32Array): Promise<Transcription> {
      return asr.transcribe(pcm);
    },

    // ── Pendientes: paso a través temporal ───────────────────────────────────

    /** PENDIENTE S3-T3. Hoy devuelve el texto tal cual, sin correcciones. */
    async correctGrammar(text: string): Promise<{ corrected: string; edits: Edit[] }> {
      return { corrected: text, edits: [] };
    },

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
