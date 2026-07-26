/**
 * S3-T1 — STFT: transformada de Fourier de tiempo corto.
 *
 * Una sola FFT dice qué frecuencias hay en la señal, pero no cuándo. Para voz
 * eso no sirve: la frase "cat" y la frase "tac" tienen prácticamente el mismo
 * espectro global y son palabras distintas.
 *
 * La STFT resuelve el problema troceando la señal en frames cortos y
 * transformando cada uno por separado. El resultado es una matriz
 * tiempo × frecuencia — el **espectrograma** — que es la entrada de todo lo que
 * viene después: MFCC (Semana 5) y el comparador DTW (Semana 6).
 *
 * El tamaño del frame es un compromiso que no tiene solución óptima
 * (es el principio de incertidumbre aplicado a señales):
 *
 *   · Frames largos → buena resolución en frecuencia, mala en tiempo.
 *   · Frames cortos → se ve bien cuándo pasa algo, pero no a qué frecuencia.
 *
 * Con FRAME_SIZE = 512 a 16 kHz quedan 32 ms por frame y 31.25 Hz por bin:
 * suficiente para separar formantes y lo bastante corto para seguir la
 * evolución de una sílaba. El solape del 50 % (HOP_SIZE = 256) evita perder lo
 * que caiga en los bordes, donde la ventana atenúa la señal.
 */

import { FFT_SIZE, FRAME_SIZE, HOP_SIZE, SAMPLE_RATE } from '@shared/constants';
import { Fft, amplitudeSpectrum, binWidth, spectrumLength, toDb } from './fft';
import { applyWindow, coherentGain, createWindow, type WindowKind } from './window';

export interface StftOptions {
  sampleRate?: number;
  /** Muestras por frame de análisis. */
  frameSize?: number;
  /** Avance entre frames (frameSize/2 = 50 % de solape). */
  hopSize?: number;
  /** Tamaño de la FFT; si supera al frame, se rellena con ceros. */
  fftSize?: number;
  windowKind?: WindowKind;
}

export interface Stft {
  /** Un espectro de amplitud por frame. */
  frames: Float32Array[];
  /** Bins por frame (mitad positiva del espectro). */
  binCount: number;
  /** Separación entre bins, en Hz: la resolución en frecuencia. */
  binHz: number;
  /** Salto entre frames, en segundos: la resolución temporal. */
  hopSeconds: number;
  /** Instante central de cada frame, en segundos. */
  times: Float32Array;
}

/**
 * Trocea, enventana y transforma. Los frames incompletos del final se
 * descartan: rellenarlos con ceros metería un salto artificial en la señal y
 * ensuciaría justo el último espectro.
 */
export function stft(pcm: Float32Array, options: StftOptions = {}): Stft {
  const sampleRate = options.sampleRate ?? SAMPLE_RATE;
  const frameSize = options.frameSize ?? FRAME_SIZE;
  const hopSize = options.hopSize ?? HOP_SIZE;
  const fftSize = options.fftSize ?? Math.max(FFT_SIZE, frameSize);
  const windowKind = options.windowKind ?? 'hann';

  const window = createWindow(windowKind, frameSize);
  const gain = coherentGain(window);
  const fft = new Fft(fftSize);

  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);

  const frames: Float32Array[] = [];
  const times: number[] = [];

  for (let inicio = 0; inicio + frameSize <= pcm.length; inicio += hopSize) {
    const enventanado = applyWindow(pcm.subarray(inicio, inicio + frameSize), window);

    // Los buffers se reutilizan entre frames; hay que limpiarlos porque el
    // relleno con ceros de la FFT quedó sobrescrito por la transformada anterior.
    re.fill(0);
    im.fill(0);
    re.set(enventanado);

    fft.forward(re, im);
    frames.push(amplitudeSpectrum(re, im, gain));
    // El frame representa mejor su punto medio que su inicio.
    times.push((inicio + frameSize / 2) / sampleRate);
  }

  return {
    frames,
    binCount: spectrumLength(fftSize),
    binHz: binWidth(fftSize, sampleRate),
    hopSeconds: hopSize / sampleRate,
    times: Float32Array.from(times),
  };
}

/** El mismo espectrograma en decibelios, que es como se dibuja y se compara. */
export function spectrogramDb(analysis: Stft): Float32Array[] {
  return analysis.frames.map(toDb);
}

/**
 * Analizador con estado, para la captura en vivo: acumula las muestras que
 * llegan y emite un espectro cada vez que junta un frame completo. Guarda el
 * sobrante entre llamadas, así que los frames no dependen de dónde caigan los
 * límites de bloque del AudioWorklet.
 */
export class StreamingStft {
  private readonly frameSize: number;
  private readonly hopSize: number;
  private readonly window: Float32Array;
  private readonly gain: number;
  private readonly fft: Fft;
  private readonly re: Float64Array;
  private readonly im: Float64Array;

  private pending = new Float32Array(0);
  private muestrasProcesadas = 0;

  constructor(private readonly options: StftOptions = {}) {
    this.frameSize = options.frameSize ?? FRAME_SIZE;
    this.hopSize = options.hopSize ?? HOP_SIZE;
    const fftSize = options.fftSize ?? Math.max(FFT_SIZE, this.frameSize);

    this.window = createWindow(options.windowKind ?? 'hann', this.frameSize);
    this.gain = coherentGain(this.window);
    this.fft = new Fft(fftSize);
    this.re = new Float64Array(fftSize);
    this.im = new Float64Array(fftSize);
  }

  get binHz(): number {
    return binWidth(this.fft.size, this.options.sampleRate ?? SAMPLE_RATE);
  }

  get binCount(): number {
    return spectrumLength(this.fft.size);
  }

  /** Devuelve un espectro por cada frame completo que se haya podido formar. */
  process(block: Float32Array): Float32Array[] {
    const buffer = new Float32Array(this.pending.length + block.length);
    buffer.set(this.pending);
    buffer.set(block, this.pending.length);

    const salida: Float32Array[] = [];
    let offset = 0;
    while (offset + this.frameSize <= buffer.length) {
      salida.push(this.analizar(buffer.subarray(offset, offset + this.frameSize)));
      offset += this.hopSize;
      this.muestrasProcesadas += this.hopSize;
    }

    this.pending = buffer.slice(offset);
    return salida;
  }

  private analizar(frame: Float32Array): Float32Array {
    const enventanado = applyWindow(frame, this.window);
    this.re.fill(0);
    this.im.fill(0);
    this.re.set(enventanado);

    this.fft.forward(this.re, this.im);
    return amplitudeSpectrum(this.re, this.im, this.gain);
  }

  /** Instante, en segundos, del próximo frame que se emita. */
  get currentTime(): number {
    return this.muestrasProcesadas / (this.options.sampleRate ?? SAMPLE_RATE);
  }

  reset(): void {
    this.pending = new Float32Array(0);
    this.muestrasProcesadas = 0;
  }
}
