/**
 * S5-T2 — MFCC: coeficientes cepstrales en escala mel.
 *
 * Son las características con las que el comparador de la Semana 6 decide si dos
 * pronunciaciones se parecen. La cadena completa es:
 *
 *   frame → ventana → FFT → |X|² → banco mel (26) → log → DCT → 13 coeficientes
 *
 * Cada paso descarta algo que **no** debería influir en la comparación:
 *
 *   · El **banco mel** agrupa 257 bins en 26 bandas repartidas según la
 *     percepción. Borra los armónicos individuales —que dependen del tono de
 *     quien habla— y conserva la envolvente, que es lo que define el fonema.
 *   · El **logaritmo** convierte el producto en suma. La voz es la fuente
 *     glotal filtrada por el tracto vocal, y en el espectro eso es un producto;
 *     al tomar log, fuente y filtro se separan en sumandos. Además hace que un
 *     cambio de volumen sea un desplazamiento constante, no un factor.
 *   · La **DCT** descorrelaciona: las bandas mel vecinas se solapan y están muy
 *     correlacionadas entre sí. Tras la DCT la información se concentra en los
 *     primeros coeficientes, así que bastan 13 de 26, y el comparador puede
 *     tratar las dimensiones como independientes.
 *
 * El resultado de esa cadena: **c₁…c₁₂ no cambian si el usuario habla más
 * fuerte** — el volumen queda encerrado en c₀. Es la propiedad que hace que el
 * puntaje mida pronunciación y no intensidad, y está verificada en las pruebas.
 */

import { FFT_SIZE, N_MEL_FILTERS, N_MFCC, SAMPLE_RATE } from '@shared/constants';
import { Fft, spectrumLength } from '../dsp/fft';
import { applyWindow, coherentGain, createWindow, type WindowKind } from '../dsp/window';
import { applyMelFilterbank, melFilterbank, type MelFilterbank } from './mel';

/** Piso de energía antes del logaritmo, para no evaluar log(0). */
export const MEL_FLOOR = 1e-10;

export interface MfccOptions {
  sampleRate?: number;
  fftSize?: number;
  /** Nº de bandas del banco mel. */
  nFilters?: number;
  /** Nº de coeficientes que se conservan. */
  nCoeffs?: number;
  fMin?: number;
  fMax?: number;
  windowKind?: WindowKind;
}

/**
 * DCT-II ortonormal, la misma convención que `scipy.fft.dct(..., norm='ortho')`
 * que usa librosa:
 *
 *   y[k] = f_k · Σ_n x[n] · cos( π·k·(2n+1) / (2N) )
 *
 * con f₀ = √(1/N) y f_k = √(2/N) para k > 0. La normalización ortonormal es la
 * que conserva la energía, de modo que la distancia entre dos vectores de MFCC
 * signifique lo mismo que en el dominio original — condición necesaria para que
 * la DTW de la Semana 6 tenga sentido métrico.
 *
 * Se calcula por definición: con N = 26 son 338 multiplicaciones por trama, tres
 * órdenes por debajo de la FFT que ya se hizo. No compensa optimizarla.
 */
export function dct2(input: Float32Array, nCoeffs: number): Float32Array {
  const N = input.length;
  const out = new Float32Array(nCoeffs);

  const escala0 = Math.sqrt(1 / N);
  const escalaK = Math.sqrt(2 / N);

  for (let k = 0; k < nCoeffs; k++) {
    let suma = 0;
    for (let n = 0; n < N; n++) {
      suma += input[n] * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * N));
    }
    out[k] = suma * (k === 0 ? escala0 : escalaK);
  }
  return out;
}

/**
 * Logaritmo de las energías mel, en decibelios: 10·log₁₀(E).
 *
 * Se usa dB (factor 10, no 20) porque la entrada ya es **potencia**. Coincide
 * con `librosa.power_to_db(..., ref=1.0, top_db=None)`.
 */
export function logMelEnergies(melEnergies: Float32Array): Float32Array {
  const out = new Float32Array(melEnergies.length);
  for (let m = 0; m < melEnergies.length; m++) {
    out[m] = 10 * Math.log10(Math.max(MEL_FLOOR, melEnergies[m]));
  }
  return out;
}

/**
 * Extractor de MFCC con el banco de filtros y la ventana precalculados: no
 * dependen de los datos, así que se construyen una vez y se reutilizan en cada
 * trama.
 */
export class MfccExtractor {
  readonly sampleRate: number;
  readonly fftSize: number;
  readonly nCoeffs: number;
  readonly bank: MelFilterbank;

  private readonly window: Float32Array;
  private readonly windowGain: number;
  private readonly fft: Fft;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly power: Float32Array;

  constructor(options: MfccOptions = {}) {
    this.sampleRate = options.sampleRate ?? SAMPLE_RATE;
    this.fftSize = options.fftSize ?? FFT_SIZE;
    this.nCoeffs = options.nCoeffs ?? N_MFCC;

    const nFilters = options.nFilters ?? N_MEL_FILTERS;
    const fMin = options.fMin ?? 0;
    const fMax = options.fMax ?? this.sampleRate / 2;

    this.bank = melFilterbank(nFilters, this.fftSize, this.sampleRate, fMin, fMax);
    this.window = createWindow(options.windowKind ?? 'hann', this.fftSize);
    this.windowGain = coherentGain(this.window);
    this.fft = new Fft(this.fftSize);
    this.re = new Float64Array(this.fftSize);
    this.im = new Float64Array(this.fftSize);
    this.power = new Float32Array(spectrumLength(this.fftSize));
  }

  /** Espectro de potencia |X[k]|² de una trama, ya enventanada y corregida. */
  powerSpectrum(frame: Float32Array): Float32Array {
    const enventanado = applyWindow(
      frame.length === this.fftSize ? frame : ajustar(frame, this.fftSize),
      this.window
    );

    this.re.fill(0);
    this.im.fill(0);
    this.re.set(enventanado);
    this.fft.forward(this.re, this.im);

    const n = this.fftSize;
    const escala = 2 / (n * this.windowGain);
    for (let k = 0; k < this.power.length; k++) {
      const esExtremo = k === 0 || k === n / 2;
      const amplitud = Math.hypot(this.re[k], this.im[k]) * (esExtremo ? escala / 2 : escala);
      this.power[k] = amplitud * amplitud;
    }
    return this.power;
  }

  /** Energías del banco mel de una trama, antes del logaritmo. */
  melSpectrum(frame: Float32Array): Float32Array {
    return applyMelFilterbank(this.powerSpectrum(frame), this.bank);
  }

  /** Los `nCoeffs` coeficientes de una trama. */
  process(frame: Float32Array): Float32Array {
    return dct2(logMelEnergies(this.melSpectrum(frame)), this.nCoeffs);
  }
}

/** Recorta o rellena con ceros hasta el tamaño exacto de la FFT. */
function ajustar(frame: Float32Array, size: number): Float32Array {
  const out = new Float32Array(size);
  out.set(frame.subarray(0, Math.min(frame.length, size)));
  return out;
}

/**
 * Normalización cepstral por media (CMN): a cada trama se le resta el promedio
 * de la secuencia, coeficiente a coeficiente.
 *
 * Es la técnica estándar para comparar voces distintas. Lo que diferencia a dos
 * hablantes que dicen lo mismo es, sobre todo, una **inclinación espectral
 * constante** a lo largo del enunciado —el largo de su tracto vocal, su tono, el
 * micrófono que usan—. Esa componente constante es justo la media, así que
 * restarla deja lo que varía dentro de la frase, que es la secuencia de fonemas.
 *
 * En este proyecto no es opcional: la referencia la genera un TTS, así que
 * usuario y referencia son **siempre** voces distintas. Medido sobre frases de
 * tres vocales (evidencia S6):
 *
 * | | Peor caso "bien pronunciado" | Mejor caso "mal pronunciado" |
 * |---|---:|---:|
 * | Sin CMN | 39.39 | 11.66 — **las clases se solapan** |
 * | Con CMN | 6.45 | 17.91 — separadas 2.8× |
 *
 * Sin CMN el evaluador puntuaría peor una pronunciación correcta dicha con otra
 * voz que una equivocada dicha con la misma voz.
 *
 * ⚠️ **No aplicar a sonidos sostenidos.** Si la secuencia es un único fonema
 * mantenido, la media *es* la señal y restarla deja casi cero: se pierde toda la
 * información. CMN sirve cuando el enunciado contiene varios sonidos distintos,
 * que es el caso de cualquier palabra o frase real.
 */
export function cepstralMeanNormalize(sequence: Float32Array[]): Float32Array[] {
  if (sequence.length === 0) return [];

  const nCoeffs = sequence[0].length;
  const media = new Float64Array(nCoeffs);
  for (const trama of sequence) {
    for (let k = 0; k < nCoeffs; k++) media[k] += trama[k];
  }
  for (let k = 0; k < nCoeffs; k++) media[k] /= sequence.length;

  return sequence.map((trama) => Float32Array.from(trama, (v, k) => v - media[k]));
}

/** MFCC de una sola trama. Para varias conviene reutilizar `MfccExtractor`. */
export function mfcc(frame: Float32Array, options: MfccOptions = {}): Float32Array {
  return new MfccExtractor(options).process(frame);
}

/**
 * Secuencia de MFCC a lo largo de una señal: una trama cada `hopSize` muestras.
 * Es la matriz que consume la DTW de S6-T1.
 */
export function mfccSequence(
  pcm: Float32Array,
  frameSize: number,
  hopSize: number,
  options: MfccOptions = {}
): Float32Array[] {
  const extractor = new MfccExtractor({ fftSize: frameSize, ...options });
  const salida: Float32Array[] = [];

  for (let inicio = 0; inicio + frameSize <= pcm.length; inicio += hopSize) {
    salida.push(extractor.process(pcm.subarray(inicio, inicio + frameSize)));
  }
  return salida;
}
