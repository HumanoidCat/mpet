import {
  createMicCapture,
  type MicCapture,
  type CaptureStats,
} from '@audio/capture/micCapture';
import { StreamingPreprocessor, preprocess } from '@audio/dsp/preprocess';
import { Fft, spectrumOf, toDb } from '@audio/dsp/fft';
import { hann, coherentGain, applyWindow } from '@audio/dsp/window';
import { detectPitchYin } from '@audio/features/yin';
import { MfccExtractor } from '@audio/features/mfcc';
import { SAMPLE_RATE, FRAME_SIZE, HOP_SIZE, FFT_SIZE } from '@shared/constants';
import type { AnalyzeOptions, AudioEngine, AudioFrame } from '@shared/contracts';

/**
 * S3-T5 · Adaptador entre el modulo DSP y el contrato `AudioEngine`.
 * Duenio: Alejandro (integracion).
 *
 * POR QUE EXISTE
 * El modulo de audio (Fabrizio) expone `MicCapture`, que entrega bloques de PCM
 * ya remuestreados a 16 kHz con filtro anti-aliasing. El resto de la aplicacion
 * consume `AudioEngine`, que entrega `AudioFrame` con espectro y caracteristicas.
 * Este adaptador une ambos: no reimplementa DSP, solo compone las piezas que ya
 * existen y estan probadas en `tests/audio/`.
 *
 * POR QUE HAY UN ACUMULADOR DE TRAMAS (incidencia I-03)
 * El AudioWorklet entrega bloques de 1024 muestras a 48 kHz, que tras la
 * decimacion x3 quedan en 341 muestras a 16 kHz, frente a un tamano de trama de
 * 512. La version anterior rellenaba la diferencia con 171 ceros y aplicaba la
 * ventana de Hann sobre la trama ya rellena: la senal quedaba multiplicada solo
 * por el tramo inicial de la ventana, mientras la correccion por ganancia
 * coherente dividia por la ganancia de la ventana completa. El espectro salia
 * un 20 % por debajo (0.8021 medido frente a 1.0 real) y se emitia una trama por
 * bloque (46/s) en vez de una por salto (62.5/s).
 *
 * `FrameAccumulator` guarda el sobrante entre llamadas, de modo que las tramas
 * dejan de depender de donde caigan los limites de bloque del worklet. Es la
 * misma estrategia de `StreamingStft` (Fabrizio); aqui se acumula la trama y no
 * el espectro porque el tono y los MFCC necesitan la senal en el dominio del
 * tiempo, sin enventanar. La prueba en `tests/core/audioEngineAdapter.test.ts`
 * verifica que el espectro resultante coincide con `StreamingStft` muestra a
 * muestra, para que las dos rutas no puedan divergir.
 *
 * CADENA DE PROCESAMIENTO
 *   microfono 48 kHz
 *     -> FIR anti-aliasing 7.2 kHz + decimacion x3   (S2-T1, resampler)
 *     -> pasa-banda 80-8000 Hz + normalizacion RMS   (S2-T2, StreamingPreprocessor)
 *     -> acumulacion en tramas de 512 con salto 256  (I-03)
 *     -> por trama: Hann + FFT -> dB                 (S3-T1, fft/window)
 *                   YIN -> tono fundamental          (S5-T1, yin)
 *                   banco mel + DCT -> MFCC          (S5-T2, mfcc)
 *     -> AudioFrame
 */

/** Ventana y su ganancia coherente se calculan una vez, no por trama. */
const WINDOW = hann(FFT_SIZE);
const WINDOW_GAIN = coherentGain(WINDOW);

/** Trama de analisis con el instante en que empieza, en segundos. */
export interface TimedFrame {
  samples: Float32Array;
  t: number;
}

/**
 * Acumula las muestras que llegan y entrega una trama completa por cada salto,
 * conservando el sobrante entre llamadas.
 *
 * El instante se asigna al emitir cada trama, no al terminar el bloque: una
 * sola llamada a `push` puede producir varias tramas, y todas tienen que llevar
 * su propio tiempo.
 */
export class FrameAccumulator {
  private pending = new Float32Array(0);
  private emitted = 0;

  constructor(
    private readonly frameSize: number = FRAME_SIZE,
    private readonly hopSize: number = HOP_SIZE
  ) {}

  /** Devuelve una trama por cada salto completo que se haya podido formar. */
  push(block: Float32Array): TimedFrame[] {
    const buffer = new Float32Array(this.pending.length + block.length);
    buffer.set(this.pending);
    buffer.set(block, this.pending.length);

    const out: TimedFrame[] = [];
    let offset = 0;
    while (offset + this.frameSize <= buffer.length) {
      out.push({
        samples: buffer.slice(offset, offset + this.frameSize),
        t: (this.emitted * this.hopSize) / SAMPLE_RATE,
      });
      offset += this.hopSize;
      this.emitted++;
    }

    this.pending = buffer.slice(offset);
    return out;
  }

  /** Instante de inicio, en segundos, de la proxima trama que se emita. */
  get nextFrameTime(): number {
    return (this.emitted * this.hopSize) / SAMPLE_RATE;
  }

  reset(): void {
    this.pending = new Float32Array(0);
    this.emitted = 0;
  }
}

export interface DspAudioEngine extends AudioEngine {
  /** Estadisticas de captura del modulo DSP (rate real, muestras, latencia). */
  stats(): CaptureStats | null;
}

/** Analiza una trama ya formada y la entrega como `AudioFrame`. */
function analizarTrama(
  frame: Float32Array,
  t: number,
  fft: Fft,
  mfcc: MfccExtractor
): AudioFrame {
  // Energia RMS de la trama: la usa el indicador de nivel y el VAD.
  let suma = 0;
  for (let i = 0; i < frame.length; i++) suma += frame[i] * frame[i];
  const energy = Math.sqrt(suma / Math.max(1, frame.length));

  // Espectro: la ventana se aplica sobre la trama completa, sin relleno.
  const fftDb = toDb(spectrumOf(applyWindow(frame, WINDOW), fft, WINDOW_GAIN));

  // Tono y MFCC consumen la trama SIN enventanar: YIN trabaja sobre la senal en
  // el dominio del tiempo, y `MfccExtractor` aplica su propia ventana.
  const tono = detectPitchYin(frame, { sampleRate: SAMPLE_RATE });

  return {
    pcm: frame,
    fftDb,
    pitchHz: tono ? tono.hz : null,
    energy,
    mfcc: Array.from(mfcc.process(frame)),
    t,
  };
}

export function createDspAudioEngine(): DspAudioEngine {
  let capture: MicCapture | null = null;
  let pre: StreamingPreprocessor | null = null;
  let fft: Fft | null = null;
  let mfcc: MfccExtractor | null = null;
  let frames: FrameAccumulator | null = null;
  const subs = new Set<(f: AudioFrame) => void>();
  let unsubscribeBlocks: (() => void) | null = null;

  return {
    async start() {
      fft = new Fft(FFT_SIZE);
      mfcc = new MfccExtractor({ sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE });
      frames = new FrameAccumulator();
      pre = new StreamingPreprocessor(SAMPLE_RATE);
      capture = createMicCapture({ targetRate: SAMPLE_RATE });

      unsubscribeBlocks = capture.onBlock((raw) => {
        if (!pre || !fft || !mfcc || !frames) return;
        // Filtrado y normalizacion en vivo, bloque a bloque.
        const limpio = pre.process(raw);
        for (const { samples, t } of frames.push(limpio)) {
          const frame = analizarTrama(samples, t, fft, mfcc);
          subs.forEach((cb) => cb(frame));
        }
      });

      await capture.start();
    },

    async stop() {
      unsubscribeBlocks?.();
      unsubscribeBlocks = null;
      const raw = capture ? await capture.stop() : new Float32Array(0);
      capture = null;
      pre = null;
      fft = null;
      mfcc = null;
      frames = null;
      // Para el enunciado completo conviene recalcular la ganancia sobre todo el
      // audio: aqui ya se conoce la frase entera, a diferencia del vivo.
      return raw.length > 0 ? preprocess(raw, SAMPLE_RATE) : raw;
    },

    onFrame(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },

    /**
     * Analisis offline de un buffer (por ejemplo, el audio de referencia del TTS).
     *
     * Acondiciona la senal salvo que el llamador declare que ya lo esta. Ver
     * `AnalyzeOptions` en los contratos: el comparador exige que las dos senales
     * hayan recorrido la misma cadena, y el acondicionamiento no es idempotente.
     */
    async analyze(pcm: Float32Array, opts?: AnalyzeOptions) {
      const senal = opts?.conditioned ? pcm : preprocess(pcm, SAMPLE_RATE);
      const fftLocal = new Fft(FFT_SIZE);
      const mfccLocal = new MfccExtractor({ sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE });
      const acumulador = new FrameAccumulator();

      return acumulador
        .push(senal)
        .map(({ samples, t }) => analizarTrama(samples, t, fftLocal, mfccLocal));
    },

    stats() {
      return capture ? capture.stats() : null;
    },
  };
}
