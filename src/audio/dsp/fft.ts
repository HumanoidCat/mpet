/**
 * S3-T1 — FFT radix-2 (Cooley–Tukey), implementada a mano.
 *
 * La DFT dice qué frecuencias componen un tramo de señal:
 *
 *   X[k] = Σ_{n=0}^{N-1} x[n] · e^{-j2πkn/N}
 *
 * Calculada así cuesta N² operaciones: para N = 512 son 262 144 multiplicaciones
 * complejas por frame, y a 62 frames por segundo el navegador no da abasto.
 *
 * La FFT explota que e^{-j2πkn/N} se repite: separando las muestras pares de
 * las impares, una DFT de N se arma con dos de N/2 más N sumas. Repitiendo la
 * división hasta llegar a pares de muestras quedan log₂N etapas de N
 * operaciones — 4 608 en vez de 262 144, **57 veces menos**.
 *
 * Esta es la implementación iterativa: primero se reordenan las muestras por
 * inversión de bits (el orden en que quedarían tras dividir recursivamente) y
 * después se recombinan en log₂N etapas de mariposas.
 *
 * Los factores de giro (twiddles) se precalculan una vez por tamaño. Acumularlos
 * multiplicando dentro del bucle sería más corto pero el error se va sumando
 * etapa a etapa, y aquí la precisión es justamente lo que hay que demostrar.
 */

/** ¿Es potencia de dos? La FFT radix-2 solo funciona con esos tamaños. */
export function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

/** Menor potencia de dos ≥ n. Sirve para decidir el relleno con ceros. */
export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Plan de FFT para un tamaño fijo. Precalcula la tabla de twiddles y los
 * índices de inversión de bits, que no dependen de los datos: se reutilizan en
 * cada frame del STFT.
 */
export class Fft {
  private readonly cosTable: Float64Array;
  private readonly sinTable: Float64Array;
  private readonly reversed: Uint32Array;

  constructor(readonly size: number) {
    if (!isPowerOfTwo(size)) {
      throw new RangeError(`El tamaño de la FFT debe ser potencia de dos, recibí ${size}`);
    }

    // Twiddles W_N^k = e^{-j2πk/N} para k = 0 … N/2−1.
    const half = size >> 1;
    this.cosTable = new Float64Array(half);
    this.sinTable = new Float64Array(half);
    for (let k = 0; k < half; k++) {
      const angle = (-2 * Math.PI * k) / size;
      this.cosTable[k] = Math.cos(angle);
      this.sinTable[k] = Math.sin(angle);
    }

    // Permutación por inversión de bits: la muestra n va a la posición que
    // resulta de leer sus log₂N bits al revés.
    this.reversed = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) {
        if (i & (1 << b)) r |= 1 << (bits - 1 - b);
      }
      this.reversed[i] = r;
    }
  }

  /** Reordena las muestras según la inversión de bits. */
  private permute(re: Float64Array, im: Float64Array): void {
    const { reversed, size } = this;
    for (let i = 0; i < size; i++) {
      const j = reversed[i];
      if (i < j) {
        const tr = re[i];
        re[i] = re[j];
        re[j] = tr;
        const ti = im[i];
        im[i] = im[j];
        im[j] = ti;
      }
    }
  }

  /**
   * Transformada directa, en el sitio: al volver, `re` e `im` contienen X[k].
   * Para una señal real basta con pasar `im` en ceros.
   */
  forward(re: Float64Array, im: Float64Array): void {
    const { size, cosTable, sinTable } = this;
    if (re.length !== size || im.length !== size) {
      throw new RangeError(`Los buffers deben medir ${size}, recibí ${re.length} y ${im.length}`);
    }

    this.permute(re, im);

    // log₂N etapas: se combinan bloques de 2, luego de 4, de 8…
    for (let len = 2; len <= size; len <<= 1) {
      const half = len >> 1;
      // Paso dentro de la tabla: el twiddle de esta etapa es W_N^{j·N/len}.
      const step = size / len;

      for (let inicio = 0; inicio < size; inicio += len) {
        for (let j = 0; j < half; j++) {
          const wRe = cosTable[j * step];
          const wIm = sinTable[j * step];

          const a = inicio + j;
          const b = a + half;

          // Mariposa: u ± W·v
          const vRe = re[b] * wRe - im[b] * wIm;
          const vIm = re[b] * wIm + im[b] * wRe;
          const uRe = re[a];
          const uIm = im[a];

          re[a] = uRe + vRe;
          im[a] = uIm + vIm;
          re[b] = uRe - vRe;
          im[b] = uIm - vIm;
        }
      }
    }
  }

  /**
   * Transformada inversa. Se apoya en la directa: conjugar, transformar,
   * conjugar y dividir por N devuelve la señal original.
   */
  inverse(re: Float64Array, im: Float64Array): void {
    for (let i = 0; i < im.length; i++) im[i] = -im[i];
    this.forward(re, im);

    const n = this.size;
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] = -im[i] / n;
    }
  }
}

/**
 * Planes de FFT reutilizables, indexados por tamaño.
 *
 * Construir un `Fft` calcula la tabla de factores de giro y los índices de
 * inversión de bits, que solo dependen del tamaño. Las funciones que crean uno
 * por llamada —la autocorrelación y la función de diferencia de YIN— lo estaban
 * recalculando en cada trama, 62 veces por segundo, para tirarlo enseguida.
 *
 * El plan no guarda estado entre transformadas: `forward` e `inverse` trabajan
 * sobre los arreglos que reciben y solo leen las tablas. Por eso compartirlo
 * entre llamadas es seguro.
 */
const planes = new Map<number, Fft>();

/** Devuelve el plan de FFT de ese tamaño, creándolo la primera vez. */
export function getFft(size: number): Fft {
  let plan = planes.get(size);
  if (!plan) {
    plan = new Fft(size);
    planes.set(size, plan);
  }
  return plan;
}

/** Nº de bins únicos de una señal real: la otra mitad es su espejo conjugado. */
export function spectrumLength(fftSize: number): number {
  return fftSize / 2 + 1;
}

/** Frecuencia central del bin k, en Hz. */
export function binFrequency(k: number, fftSize: number, sampleRate: number): number {
  return (k * sampleRate) / fftSize;
}

/** Separación entre bins: la resolución en frecuencia del análisis. */
export function binWidth(fftSize: number, sampleRate: number): number {
  return sampleRate / fftSize;
}

/**
 * Espectro de amplitud de una señal real, en unidades de la señal: un seno de
 * amplitud A centrado en un bin da exactamente A.
 *
 * El factor 2/N sale de dos correcciones: 1/N normaliza la DFT, y el 2
 * recupera la energía del bin espejo de la mitad negativa. Los extremos (bin 0
 * y Nyquist) no tienen espejo, así que no llevan el 2.
 *
 * `windowGain` compensa la atenuación de la ventana (ver `coherentGain`).
 */
export function amplitudeSpectrum(
  re: Float64Array,
  im: Float64Array,
  windowGain = 1
): Float32Array {
  const n = re.length;
  const bins = spectrumLength(n);
  const out = new Float32Array(bins);

  const escala = 2 / (n * windowGain);
  for (let k = 0; k < bins; k++) {
    const esExtremo = k === 0 || k === n / 2;
    out[k] = Math.hypot(re[k], im[k]) * (esExtremo ? escala / 2 : escala);
  }
  return out;
}

/** Suelo en dB: por debajo de esto se considera silencio (evita −Infinity). */
export const SPECTRUM_FLOOR_DB = -120;

/** Espectro en decibelios, que es como lo consume la UI (`AudioFrame.fftDb`). */
export function toDb(amplitudes: Float32Array): Float32Array {
  const out = new Float32Array(amplitudes.length);
  for (let k = 0; k < amplitudes.length; k++) {
    out[k] = amplitudes[k] <= 0 ? SPECTRUM_FLOOR_DB : Math.max(SPECTRUM_FLOOR_DB, 20 * Math.log10(amplitudes[k]));
  }
  return out;
}

/**
 * Atajo para analizar un frame real: copia, transforma y devuelve amplitudes.
 * Si el frame es más corto que la FFT se rellena con ceros — no inventa
 * información, solo interpola el espectro en más bins.
 */
export function spectrumOf(frame: Float32Array, fft: Fft, windowGain = 1): Float32Array {
  const re = new Float64Array(fft.size);
  const im = new Float64Array(fft.size);
  re.set(frame.subarray(0, Math.min(frame.length, fft.size)));

  fft.forward(re, im);
  return amplitudeSpectrum(re, im, windowGain);
}

/** Índice del bin de mayor amplitud: la frecuencia dominante del frame. */
export function peakBin(spectrum: Float32Array): number {
  let mejor = 0;
  for (let k = 1; k < spectrum.length; k++) {
    if (spectrum[k] > spectrum[mejor]) mejor = k;
  }
  return mejor;
}
