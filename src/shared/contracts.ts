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

export interface AudioEngine {
  /** Pide permiso de micrófono e inicia captura a 16 kHz mono. */
  start(): Promise<void>;
  /** Detiene la captura y devuelve el PCM completo (16 kHz). */
  stop(): Promise<Float32Array>;
  /** Suscripción a frames de análisis en tiempo real. Devuelve unsubscribe. */
  onFrame(cb: (frame: AudioFrame) => void): () => void;
  /** Analiza un buffer offline (p. ej. audio TTS de referencia). */
  analyze(pcm: Float32Array): Promise<AudioFrame[]>;
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
