/**
 * Protocolo de mensajes y configuraciones del worker de TTS (síntesis de voz).
 * Dueño: Isaac (S4-T5 spike · S5-T5 worker). Mismo patrón que `asr/asrProtocol.ts`
 * y `grammar/grammarProtocol.ts`.
 *
 * Este archivo lo comparten el spike y el worker de producción a propósito: así el
 * spike mide exactamente las constantes que se van a usar, no una copia parecida.
 *
 * HAY DOS FAMILIAS DE MODELO EN JUEGO, y no por capricho: el spike S4-T5 demostró
 * que SpeechT5 solo es inteligible sin cuantizar, y sin cuantizar pesa 613 MB —
 * inviable para una app que ya descarga ~300 MB. La alternativa (VITS/MMS) es un
 * solo archivo de 114 MB. Ver `docs/evidencias/s4/s4-t5-tts-spike.md`.
 */

/**
 * Modelos de síntesis evaluados.
 *
 * Los dos primeros declaran salida a 16 kHz, la del proyecto. **Kokoro sale a 24 kHz
 * y hay que remuestrear**, que es la única diferencia de tratamiento que exige.
 */
export type TtsModelId =
  | 'Xenova/speecht5_tts'
  | 'Xenova/mms-tts-eng'
  | 'onnx-community/Kokoro-82M-v1.0-ONNX';

/**
 * Vocoder de SpeechT5 (espectrograma → onda). Es un **repositorio aparte**.
 *
 * OJO, ESTO NO ES UN DETALLE: el atajo `pipeline('text-to-speech', ...)` de
 * transformers.js carga este vocoder con `dtype: 'fp32'` escrito a fuego
 * (verificado en la versión instalada 3.8.1, `pipelines.js`, línea ~2943) y la
 * función `pipeline()` no reenvía uno propio. Es decir: pidiendo `dtype: 'q8'`
 * igual se descargan 55 MB de vocoder sin cuantizar. Por eso el spike arma las
 * piezas a mano (`SpeechT5ForTextToSpeech` + `SpeechT5HifiGan`): es la única
 * forma de decidir la cuantización del vocoder.
 *
 * VITS no necesita nada de esto: genera la onda de una sola pasada.
 */
export type TtsVocoderId = 'Xenova/speecht5_hifigan';

export const SPEECHT5_MODEL: TtsModelId = 'Xenova/speecht5_tts';
export const SPEECHT5_VOCODER: TtsVocoderId = 'Xenova/speecht5_hifigan';
export const VITS_MODEL: TtsModelId = 'Xenova/mms-tts-eng';

export type TtsDType = 'fp32' | 'q8';

export type TtsConfigId =
  | 'A-fp32'
  | 'B-mixto'
  | 'C-q8'
  | 'D-vits-fp32'
  | 'E-vits-q8'
  | 'F-kokoro-q8';

interface TtsConfigBase {
  id: TtsConfigId;
  label: string;
  /** Descarga esperada en MB según los archivos publicados en el Hub. */
  expectedMB: number;
  /** Por qué está en la comparación. */
  rationale: string;
}

/**
 * SpeechT5: tres piezas que se cuantizan por separado.
 *   - `encoder` (`encoder_model`)        — entiende el texto
 *   - `decoder` (`decoder_model_merged`) — genera el espectrograma, paso a paso
 *   - `vocoder` (repo aparte)            — convierte el espectrograma en sonido
 * Necesita además un vector de voz (ver `speakerEmbedding.ts`).
 */
export interface SpeechT5Config extends TtsConfigBase {
  engine: 'speecht5';
  model: 'Xenova/speecht5_tts';
  vocoder: TtsVocoderId;
  encoderDType: TtsDType;
  decoderDType: TtsDType;
  vocoderDType: TtsDType;
}

/**
 * VITS (MMS-TTS de Meta): un único archivo ONNX que va de texto a onda en una
 * sola pasada, sin vocoder aparte y sin vector de voz (la voz está fijada en los
 * pesos). Al no ser autorregresivo no genera el audio cuadro a cuadro, así que
 * la latencia no debería crecer igual con la longitud de la frase — el spike lo
 * mide, no lo damos por hecho.
 */
export interface VitsConfig extends TtsConfigBase {
  engine: 'vits';
  model: 'Xenova/mms-tts-eng';
  dtype: TtsDType;
}

/**
 * Voces de Kokoro que usa el proyecto.
 *
 * Kokoro exige nombrar una voz en cada síntesis: la voz no está en los pesos como en
 * MMS-TTS, viene de un vector aparte. Se listan solo las americanas porque el
 * proyecto enseña inglés estadounidense y el reconocedor es `whisper-tiny.en`;
 * mezclar acentos metería una variable en el puntaje de pronunciación que nadie
 * quiere medir.
 *
 * `af_heart` es la única con calificación **A** en la tabla oficial de voces, y es la
 * que se usó para medir el banco de 14+5 palabras (1 fallo de 14 contra los 7 de
 * MMS-TTS). Cambiar de voz invalidaría esa medición.
 */
export type KokoroVoice = 'af_heart' | 'af_bella' | 'am_michael' | 'am_fenrir';

/**
 * Kokoro-82M: sintetizador con vector de voz separado de los pesos.
 *
 * DOS DIFERENCIAS DE TRATAMIENTO respecto a MMS-TTS, las dos obligatorias:
 *   1. **Sale a 24 kHz.** Hay que remuestrear a 16 antes de devolver el PCM, o la
 *      referencia sonaría con el tono alterado y sus MFCC no serían comparables con
 *      los del estudiante. Se usa `resample()` del módulo de audio, que ya lo
 *      resuelve con filtro antisolapamiento y tiene pruebas propias.
 *   2. **Hay que nombrar la voz** en cada llamada.
 *
 * A cambio: falla 1 de 14 palabras trampa donde MMS-TTS falla 7, es **determinista**
 * —dos síntesis del mismo texto dan muestras idénticas, lo que elimina el suelo de
 * 49.5 que MMS-TTS le imponía al puntaje (R03) y cierra R16— y cuantizado pesa menos
 * (88.1 MiB medidos contra 109.0). Evidencia: `docs/evidencias/s7/d12-kokoro-decision-final.md`.
 */
export interface KokoroConfig extends TtsConfigBase {
  engine: 'kokoro';
  model: 'onnx-community/Kokoro-82M-v1.0-ONNX';
  dtype: TtsDType;
  voice: KokoroVoice;
  /** Frecuencia nativa del modelo, de la que hay que remuestrear. */
  nativeSampleRate: 24000;
}

export type TtsConfig = SpeechT5Config | VitsConfig | KokoroConfig;

/**
 * Configuraciones que compara el spike S4-T5.
 *
 * Tamaños tomados de los archivos del Hub (consultados el 3-ago-2026):
 *   speecht5  encoder_model         342.8 MB · quantized  88.4 MB
 *   speecht5  decoder_model_merged  244.5 MB · quantized  71.1 MB
 *   hifigan   model                  55.4 MB · quantized  18.3 MB
 *   mms-tts-eng model               114.3 MB · quantized  38.4 MB
 *
 * No se evalúa q4: la decisión D-05 ya lo descartó por medición en el corrector
 * gramatical (3.8× más lento y más pesado), y aquí corre el mismo motor.
 */
export const TTS_CONFIGS: readonly TtsConfig[] = [
  {
    id: 'A-fp32',
    label: 'A · SpeechT5 todo fp32',
    engine: 'speecht5',
    model: 'Xenova/speecht5_tts',
    vocoder: 'Xenova/speecht5_hifigan',
    encoderDType: 'fp32',
    decoderDType: 'fp32',
    vocoderDType: 'fp32',
    expectedMB: 643,
    rationale:
      'La única configuración de SpeechT5 que resultó inteligible en la escucha ' +
      'del 3-ago. Se conserva como referencia de calidad: a 613 MB reales es ' +
      'inviable para la app, que ya descarga ~300 MB, y además falló al cargar ' +
      'tres veces seguidas.',
  },
  {
    id: 'B-mixto',
    label: 'B · SpeechT5 q8 + vocoder fp32',
    engine: 'speecht5',
    model: 'Xenova/speecht5_tts',
    vocoder: 'Xenova/speecht5_hifigan',
    encoderDType: 'q8',
    decoderDType: 'q8',
    vocoderDType: 'fp32',
    expectedMB: 215,
    rationale:
      'Hipótesis descartada: dejar intacto el vocoder no salvó la calidad (peor ' +
      'que A al oído) y encima resultó 2.4–3.3× más lento que C.',
  },
  {
    id: 'C-q8',
    label: 'C · SpeechT5 todo q8',
    engine: 'speecht5',
    model: 'Xenova/speecht5_tts',
    vocoder: 'Xenova/speecht5_hifigan',
    encoderDType: 'q8',
    decoderDType: 'q8',
    vocoderDType: 'q8',
    expectedMB: 178,
    rationale: 'Descartada: el audio resultó ininteligible en la escucha del 3-ago.',
  },
  {
    id: 'D-vits-fp32',
    label: 'D · MMS-TTS (VITS) fp32',
    engine: 'vits',
    model: 'Xenova/mms-tts-eng',
    dtype: 'fp32',
    expectedMB: 114,
    rationale:
      'Alternativa a SpeechT5 tras el resultado de la escucha. Un solo archivo ' +
      'sin cuantizar: 5.6× más liviano que A, sin vocoder aparte y sin vector de ' +
      'voz. Si es inteligible, resuelve calidad y peso a la vez.',
  },
  {
    id: 'E-vits-q8',
    label: 'E · MMS-TTS (VITS) q8',
    engine: 'vits',
    model: 'Xenova/mms-tts-eng',
    dtype: 'q8',
    expectedMB: 38,
    rationale:
      'El extremo liviano. Se mide para saber si VITS aguanta la cuantización ' +
      'mejor que SpeechT5, no porque se espere que sí.',
  },
  {
    id: 'F-kokoro-q8',
    label: 'F · Kokoro-82M q8',
    engine: 'kokoro',
    model: 'onnx-community/Kokoro-82M-v1.0-ONNX',
    dtype: 'q8',
    voice: 'af_heart',
    nativeSampleRate: 24000,
    // 88.1 MiB **medidos** sobre caché real en el spike de D-12, no leídos de la
    // ficha del Hub. La propuesta original estimaba 325 MB sin cuantizar; medirlo
    // cambió la decisión, y por eso aquí la cifra es la medida.
    expectedMB: 88,
    rationale:
      'Adoptado por D-17. Falla 1 de 14 palabras trampa donde MMS-TTS falla 7, ' +
      'acierta las 5 de control donde MMS-TTS falla 2, es determinista (elimina el ' +
      'suelo de 49.5 del puntaje, R03, y cierra R16) y cuantizado pesa menos que ' +
      'MMS-TTS. Cuesta remuestrear de 24 a 16 kHz y una dependencia nueva.',
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
 * **Kokoro desde D-17.** El umbral para pedir el cambio se fijó antes de medir
 * —5 fallos o más de 14 abrían el `shared-change`— y MMS-TTS dio 7. Medido Kokoro
 * con el mismo banco: 1 de 14. La decisión y sus condiciones están en D-12 y D-17.
 *
 * VUELTA ATRÁS: `'D-vits-fp32'` devuelve el worker a MMS-TTS. Sigue implementado y
 * probado; lo único que se pierde es la calidad y el determinismo.
 */
export const DEFAULT_TTS_CONFIG: TtsConfigId = 'F-kokoro-q8';

/** Config anterior, por si hay que volver atrás sin buscar el identificador. */
export const FALLBACK_TTS_CONFIG: TtsConfigId = 'D-vits-fp32';

// ── Mensajes entre el hilo principal y el worker ─────────────────────────────

export type TtsRequest =
  | { type: 'init'; config: TtsConfigId }
  | { type: 'speak'; id: number; text: string };

export type TtsResponse =
  | { type: 'progress'; model: string; progress: number }
  | { type: 'ready'; model: string }
  /** PCM mono a 16 kHz, listo para reproducir y para el comparador de pronunciación. */
  | { type: 'result'; id: number; pcm: Float32Array; sampleRate: number }
  | { type: 'error'; id?: number; message: string };
