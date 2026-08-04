/**
 * CONTRATOS ENTRE MÓDULOS — My Personal English Teacher
 * ─────────────────────────────────────────────────────
 * Este archivo es la frontera entre los 4 módulos. Se congela al final
 * de la Semana 1. Cambiarlo requiere PR con etiqueta `shared-change`
 * aprobado por Alejandro + el dueño del módulo afectado.
 *
 * Dueños: core=Alejandro · audio=Fabrizio · ai=Isaac · ui=Monestel
 */

// ── Audio (Fabrizio) ─────────────────────────────────────────────
/** Frame de análisis emitido ~30 veces/segundo para visualización. */
export interface AudioFrame {
  /** PCM mono normalizado [-1, 1] del frame actual */
  pcm: Float32Array;
  /** Magnitud del espectro (mitad positiva de la FFT), en dB */
  fftDb: Float32Array;
  /** Pitch fundamental en Hz, o null si no hay voz (unvoiced) */
  pitchHz: number | null;
  /** Energía RMS del frame */
  energy: number;
  /** 13 coeficientes MFCC del frame */
  mfcc: number[];
  /** Timestamp en segundos desde el inicio de la grabación */
  t: number;
}

export interface AnalyzeOptions {
  /**
   * Declara si el PCM ya pasó por el acondicionamiento de S2-T2 (pasa-altas de
   * 80 Hz y normalización RMS). Por defecto `false`: `analyze` acondiciona.
   *
   * POR QUE ESTO ES EXPLICITO Y NO UNA SUPOSICION
   * El comparador de pronunciación mide la distancia entre dos análisis, así que
   * ambas señales tienen que haber recorrido exactamente la misma cadena. El PCM
   * que devuelve `stop()` ya viene acondicionado; el que devuelve `speak()` del
   * sintetizador, no. Sin este parámetro las dos ramas recorrían cadenas
   * distintas y el puntaje cargaba un sesgo que no venía del hablante.
   *
   * Medido sobre una vocal sintética comparada contra sí misma, donde lo
   * correcto es 100:
   *
   * | Referencia | Sin declarar (antes) | Declarando (ahora) |
   * |---|---:|---:|
   * | Limpia                   | 99.28 | 100.00 |
   * | Con offset de continua   | 96.56 |  99.99 |
   * | Con retumbe de 40 Hz     | 89.30 |  96.98 |
   *
   * El caso del retumbe se comía 10.7 puntos de los 31 de margen que RF-10 exige
   * entre la peor pronunciación buena y la mejor mala. Y el tamaño del sesgo
   * dependía de qué entregara el sintetizador, que no controlamos.
   *
   * El residuo de 3 puntos de la última fila no es un defecto de esta corrección:
   * a 40 Hz el pasa-altas atenúa pero no elimina, así que queda algo de retumbe
   * que sí es una diferencia real entre las dos señales. Lo que se corrige aquí
   * es el sesgo de ruta, no el ruido que traiga la referencia.
   *
   * Importante: el acondicionamiento NO es idempotente. Aplicar el pasa-altas
   * dos veces cuesta 0.72 puntos sobre la misma señal, por eso el parámetro
   * declara el estado en vez de acondicionar siempre por las dudas.
   */
  conditioned?: boolean;
}

export interface AudioEngine {
  /** Pide permiso de micrófono e inicia captura a 16 kHz mono. */
  start(): Promise<void>;
  /** Detiene la captura y devuelve el PCM completo (16 kHz), ya acondicionado. */
  stop(): Promise<Float32Array>;
  /** Suscripción a frames de análisis en tiempo real. Devuelve unsubscribe. */
  onFrame(cb: (frame: AudioFrame) => void): () => void;
  /** Analiza un buffer offline (p. ej. audio TTS de referencia). */
  analyze(pcm: Float32Array, opts?: AnalyzeOptions): Promise<AudioFrame[]>;
}

// ── Pronunciación (Fabrizio + Isaac) ─────────────────────────────
export interface WordAlign {
  word: string;
  /** segundos, según timestamps del ASR */
  start: number;
  end: number;
}

export interface WordScore extends WordAlign {
  /** 0 (malo) – 100 (excelente) */
  score: number;
}

export interface PronunciationResult {
  /** Puntaje global 0–100 */
  overall: number;
  words: WordScore[];
  /** Distancia DTW cruda, para depuración/evidencias */
  dtwDistance: number;
}

export interface PronunciationScorer {
  score(
    user: AudioFrame[],
    reference: AudioFrame[],
    words: WordAlign[]
  ): Promise<PronunciationResult>;
}

// ── IA (Isaac) ───────────────────────────────────────────────────
export interface Edit {
  /** índice de palabra en el texto original */
  index: number;
  original: string;
  corrected: string;
  type: 'grammar' | 'spelling' | 'word-choice';
}

export interface Transcription {
  text: string;
  words: WordAlign[];
}

export interface AIPipeline {
  /** Descarga/carga modelos. Reporta progreso 0–1 por modelo. */
  init(onProgress?: (model: string, p: number) => void): Promise<void>;
  transcribe(pcm: Float32Array): Promise<Transcription>;
  correctGrammar(text: string): Promise<{ corrected: string; edits: Edit[] }>;
  suggest(text: string): Promise<string[]>;
  /** Respuesta conversacional del tutor. */
  reply(history: ChatMessage[]): Promise<string>;
  /** Sintetiza voz; devuelve PCM 16 kHz para reproducir y comparar. */
  speak(text: string): Promise<Float32Array>;
}

// ── Conversación / Core (Alejandro) ──────────────────────────────
export interface ChatMessage {
  id: string;
  role: 'user' | 'tutor';
  text: string;
  correction?: { corrected: string; edits: Edit[] };
  suggestions?: string[];
  pronunciation?: PronunciationResult;
  ts: number;
}

export type AppEvent =
  | { type: 'recording-started' }
  | { type: 'recording-stopped'; pcm: Float32Array }
  | { type: 'frame'; frame: AudioFrame }
  | { type: 'transcription'; result: Transcription }
  /**
   * Alta O actualizacion de un mensaje, segun el `id`. Quien lo consuma debe
   * reemplazar el mensaje existente con ese `id` y agregarlo solo si no existe.
   *
   * Se emite mas de una vez para el mismo mensaje porque el puntaje de
   * pronunciacion se calcula despues del turno (ver `src/core/orchestrator.ts`):
   * primero llega el mensaje sin `pronunciation` y luego el mismo con el
   * puntaje. Se manda el mensaje completo y no un delta para que la operacion
   * sea idempotente: repetir el evento no duplica ni corrompe nada.
   */
  | { type: 'message'; message: ChatMessage }
  | { type: 'model-progress'; model: string; progress: number }
  | { type: 'error'; stage: string; error: string };

export interface EventBus {
  emit(e: AppEvent): void;
  on<T extends AppEvent['type']>(
    type: T,
    cb: (e: Extract<AppEvent, { type: T }>) => void
  ): () => void;
}
