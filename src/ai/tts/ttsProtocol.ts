/**
 * Protocolo de mensajes y configuraciones del worker de TTS (síntesis de voz).
 * Dueño: Isaac (S4-T5 spike · S5-T5 worker). Mismo patrón que `asr/asrProtocol.ts`
 * y `grammar/grammarProtocol.ts`.
 *
 * Este archivo lo comparten el spike y el worker de producción a propósito: así el
 * spike mide exactamente las constantes que se van a usar, no una copia parecida.
 */

/** Modelo de síntesis (texto → espectrograma). ONNX, vía transformers.js. */
export type TtsModelId = 'Xenova/speecht5_tts';

/**
 * Vocoder (espectrograma → onda de audio). Es un **repositorio aparte**.
 *
 * OJO, ESTO NO ES UN DETALLE: el atajo `pipeline('text-to-speech', ...)` de
 * transformers.js carga este vocoder con `dtype: 'fp32'` escrito a fuego
 * (verificado en la versión instalada 3.8.1, `pipelines.js`, línea ~2943) y la
 * función `pipeline()` no reenvía uno propio. Es decir: pidiendo `dtype: 'q8'`
 * igual se descargan 55 MB de vocoder sin cuantizar. Por eso el worker arma las
 * piezas a mano (`SpeechT5ForTextToSpeech` + `SpeechT5HifiGan`): es la única
 * forma de decidir la cuantización del vocoder.
 */
export type TtsVocoderId = 'Xenova/speecht5_hifigan';

export const DEFAULT_TTS_MODEL: TtsModelId = 'Xenova/speecht5_tts';
export const DEFAULT_TTS_VOCODER: TtsVocoderId = 'Xenova/speecht5_hifigan';

export type TtsDType = 'fp32' | 'q8';

/**
 * Una configuración de cuantización a evaluar.
 *
 * SpeechT5 no es un modelo sino tres piezas que se cuantizan por separado:
 *   - `encoder`  (`encoder_model`)        — entiende el texto
 *   - `decoder`  (`decoder_model_merged`) — genera el espectrograma, paso a paso
 *   - `vocoder`  (repo aparte)            — convierte el espectrograma en sonido
 */
export interface TtsConfig {
  id: TtsConfigId;
  label: string;
  encoder: TtsDType;
  decoder: TtsDType;
  vocoder: TtsDType;
  /** Descarga esperada en MB, sumando los tres archivos ONNX del Hub. */
  expectedMB: number;
  /** Por qué está en la comparación. */
  rationale: string;
}

export type TtsConfigId = 'A-fp32' | 'B-mixto' | 'C-q8';

/**
 * Las tres configuraciones que compara el spike S4-T5.
 *
 * Los tamaños salen de los propios archivos del Hub (consultados el 3-ago-2026):
 *   encoder_model            342.8 MB · encoder_model_quantized             88.4 MB
 *   decoder_model_merged     244.5 MB · decoder_model_merged_quantized      71.1 MB
 *   hifigan model             55.4 MB · hifigan model_quantized             18.3 MB
 *
 * No se evalúa q4: la decisión D-05 ya lo descartó por medición en el corrector
 * gramatical (3.8× más lento y más pesado, porque ONNX sobre WASM no tiene
 * núcleos de 4 bits y descuantiza en cada inferencia). El mismo motor corre aquí.
 */
export const TTS_CONFIGS: readonly TtsConfig[] = [
  {
    id: 'A-fp32',
    label: 'A · todo fp32 (referencia de calidad)',
    encoder: 'fp32',
    decoder: 'fp32',
    vocoder: 'fp32',
    expectedMB: 643,
    rationale:
      'Lo que recomienda la ficha oficial ("las versiones sin cuantizar son más ' +
      'precisas"). Sirve de patrón de calidad contra el que comparar al oído; ' +
      'a 643 MB es inviable para la app, que ya baja ~300 MB.',
  },
  {
    id: 'B-mixto',
    label: 'B · encoder y decoder q8, vocoder fp32',
    encoder: 'q8',
    decoder: 'q8',
    vocoder: 'fp32',
    expectedMB: 215,
    rationale:
      'El vocoder es la pieza que convierte el espectrograma en onda: es donde ' +
      'la cuantización se oye como ruido metálico o zumbido. Cuantizar solo las ' +
      'dos piezas grandes ahorra el 89% del peso dejando intacta la que suena.',
  },
  {
    id: 'C-q8',
    label: 'C · todo q8 (mínimo peso)',
    encoder: 'q8',
    decoder: 'q8',
    vocoder: 'q8',
    expectedMB: 178,
    rationale:
      'El más liviano. Si suena igual que B, se queda con él: son 37 MB menos ' +
      'sobre una descarga inicial que ya es el riesgo abierto del proyecto (S7-T4).',
  },
] as const;

export function getTtsConfig(id: TtsConfigId): TtsConfig {
  const found = TTS_CONFIGS.find((c) => c.id === id);
  if (!found) throw new Error(`Configuración de TTS desconocida: ${id}`);
  return found;
}

/**
 * Configuración por defecto del worker.
 *
 * ⚠️ PROVISIONAL hasta que el spike S4-T5 se ejecute y se escuchen los WAV. El
 * valor razonado antes de medir es B (vocoder intacto), pero eso es una hipótesis,
 * no un resultado: si C suena igual, este valor cambia a 'C-q8' y se documenta en
 * `docs/evidencias/s4/s4-t5-tts-spike.md`.
 */
export const DEFAULT_TTS_CONFIG: TtsConfigId = 'B-mixto';

// ── Mensajes entre el hilo principal y el worker ─────────────────────────────

export type TtsRequest =
  | { type: 'init'; model: TtsModelId; vocoder: TtsVocoderId; config: TtsConfigId }
  | { type: 'speak'; id: number; text: string };

export type TtsResponse =
  | { type: 'progress'; model: string; progress: number }
  | { type: 'ready'; model: string }
  /** PCM mono a 16 kHz, listo para reproducir y para el comparador de pronunciación. */
  | { type: 'result'; id: number; pcm: Float32Array; sampleRate: number }
  | { type: 'error'; id?: number; message: string };
