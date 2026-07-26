import {
  createMicCapture,
  type MicCapture,
  type CaptureStats,
} from '@audio/capture/micCapture';
import { StreamingPreprocessor, preprocess } from '@audio/dsp/preprocess';
import { Fft, spectrumOf, toDb, spectrumLength } from '@audio/dsp/fft';
import { hann, coherentGain, applyWindow } from '@audio/dsp/window';
import { SAMPLE_RATE, FFT_SIZE, N_MFCC } from '@shared/constants';
import type { AudioEngine, AudioFrame } from '@shared/contracts';

/**
 * S3-T5 · Adaptador entre el modulo DSP y el contrato `AudioEngine`.
 * Duenio: Alejandro (integracion).
 *
 * POR QUE EXISTE
 * El modulo de audio (Fabrizio) expone `MicCapture`, que entrega bloques de PCM
 * ya remuestreados a 16 kHz con filtro anti-aliasing. El resto de la aplicacion
 * consume `AudioEngine`, que entrega `AudioFrame` con espectro y caracteristicas.
 * Este adaptador une ambos: no reimplementa DSP, solo compone las piezas que ya
 * existen y estan probadas (148 pruebas en `tests/audio/`).
 *
 * CADENA DE PROCESAMIENTO POR BLOQUE
 *   microfono 48 kHz
 *     -> FIR anti-aliasing 7.2 kHz + decimacion x3   (S2-T1, resampler)
 *     -> pasa-banda 80-8000 Hz + normalizacion RMS   (S2-T2, StreamingPreprocessor)
 *     -> ventana de Hann + FFT radix-2 -> dB         (S3-T1, fft/window)
 *     -> AudioFrame para el visualizador
 *
 * CAMPOS TODAVIA VACIOS DEL FRAME
 *   pitchHz -> null      hasta S5-T1 (YIN)
 *   mfcc    -> ceros     hasta S5-T2 (banco mel + DCT)
 * Se declaran asi a proposito en lugar de inventar valores: el visualizador
 * dibuja lo que existe y las funciones pendientes se notan como ausentes, no
 * como datos falsos.
 */

/** Ventana y su ganancia coherente se calculan una vez, no por bloque. */
const WINDOW = hann(FFT_SIZE);
const WINDOW_GAIN = coherentGain(WINDOW);
const EMPTY_MFCC = new Array<number>(N_MFCC).fill(0);

export interface DspAudioEngine extends AudioEngine {
  /** Estadisticas de captura del modulo DSP (rate real, muestras, latencia). */
  stats(): CaptureStats | null;
}

export function createDspAudioEngine(): DspAudioEngine {
  let capture: MicCapture | null = null;
  let pre: StreamingPreprocessor | null = null;
  let fft: Fft | null = null;
  let elapsed = 0;
  const subs = new Set<(f: AudioFrame) => void>();
  let unsubscribeBlocks: (() => void) | null = null;

  /** Convierte un bloque de PCM ya filtrado en un frame de analisis. */
  function toFrame(pcm: Float32Array): AudioFrame {
    elapsed += pcm.length / SAMPLE_RATE;

    // Energia RMS del bloque (la usa el indicador de nivel y, mas adelante, el VAD).
    let sum = 0;
    for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
    const energy = Math.sqrt(sum / Math.max(1, pcm.length));

    // Espectro: se toma el ultimo tramo de FFT_SIZE muestras del bloque.
    // Si el bloque es mas corto, spectrumOf rellena con ceros.
    const frame = pcm.length >= FFT_SIZE ? pcm.subarray(pcm.length - FFT_SIZE) : pcm;
    const windowed = applyWindow(
      frame.length === FFT_SIZE ? frame : padTo(frame, FFT_SIZE),
      WINDOW
    );
    const fftDb = fft
      ? toDb(spectrumOf(windowed, fft, WINDOW_GAIN))
      : new Float32Array(spectrumLength(FFT_SIZE));

    return {
      pcm,
      fftDb,
      pitchHz: null, // S5-T1
      energy,
      mfcc: EMPTY_MFCC, // S5-T2
      t: elapsed,
    };
  }

  return {
    async start() {
      elapsed = 0;
      fft = new Fft(FFT_SIZE);
      pre = new StreamingPreprocessor(SAMPLE_RATE);
      capture = createMicCapture({ targetRate: SAMPLE_RATE });

      unsubscribeBlocks = capture.onBlock((raw) => {
        // Filtrado y normalizacion en vivo, bloque a bloque.
        const clean = pre ? pre.process(raw) : raw;
        const frame = toFrame(clean);
        subs.forEach((cb) => cb(frame));
      });

      await capture.start();
    },

    async stop() {
      unsubscribeBlocks?.();
      unsubscribeBlocks = null;
      const raw = capture ? await capture.stop() : new Float32Array(0);
      capture = null;
      pre = null;
      // Para el enunciado completo si conviene recalcular la ganancia sobre todo
      // el audio: aqui ya se conoce la frase entera, a diferencia del vivo.
      return raw.length > 0 ? preprocess(raw, SAMPLE_RATE) : raw;
    },

    onFrame(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },

    /** Analisis offline de un buffer (por ejemplo, el audio de referencia del TTS). */
    async analyze(pcm: Float32Array) {
      const local = new Fft(FFT_SIZE);
      const previous = fft;
      fft = local;
      const saved = elapsed;
      elapsed = 0;
      const frames: AudioFrame[] = [];
      for (let i = 0; i + FFT_SIZE <= pcm.length; i += FFT_SIZE) {
        frames.push(toFrame(pcm.subarray(i, i + FFT_SIZE)));
      }
      fft = previous;
      elapsed = saved;
      return frames;
    },

    stats() {
      return capture ? capture.stats() : null;
    },
  };
}

/** Rellena con ceros hasta `size` (la FFT necesita el tamano exacto). */
function padTo(pcm: Float32Array, size: number): Float32Array {
  const out = new Float32Array(size);
  out.set(pcm.subarray(0, Math.min(pcm.length, size)));
  return out;
}
