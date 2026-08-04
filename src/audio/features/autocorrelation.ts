/**
 * S4-T4 — Autocorrelación.
 *
 * La autocorrelación mide cuánto se parece una señal a sí misma desplazada τ
 * muestras:
 *
 *   r[τ] = Σ_n x[n] · x[n+τ]
 *
 * Si la señal es periódica con periodo T, al desplazarla exactamente T muestras
 * vuelve a coincidir consigo misma y r[τ] presenta un máximo. Esa es la base de
 * la detección de tono: encontrar el primer máximo lejos del origen da el
 * periodo, y su inverso es la frecuencia fundamental.
 *
 * Se implementan dos caminos que deben dar el mismo resultado:
 *
 *   · El directo, O(N²), que es la definición literal.
 *   · El de la FFT, O(N log N), vía el teorema de Wiener–Khinchin: la
 *     autocorrelación es la transformada inversa del espectro de potencia.
 *
 * Que ambos coincidan valida el camino rápido contra la definición, igual que
 * se hizo con la FFT en S3-T1.
 */

import { getFft, nextPowerOfTwo } from '../dsp/fft';

/**
 * Autocorrelación por definición. Devuelve r[τ] para τ = 0 … maxLag.
 *
 * Es la versión **sesgada**: a medida que τ crece, menos muestras se solapan y
 * la suma tiene menos términos, así que r[τ] decae aunque la señal sea
 * perfectamente periódica. Ese decaimiento es una propiedad del estimador, no
 * de la señal, y hay que tenerlo en cuenta al buscar el pico.
 */
export function autocorrelation(x: Float32Array, maxLag?: number): Float64Array {
  const n = x.length;
  const lags = Math.min(maxLag ?? n - 1, n - 1);
  const r = new Float64Array(lags + 1);

  for (let tau = 0; tau <= lags; tau++) {
    let suma = 0;
    for (let i = 0; i < n - tau; i++) suma += x[i] * x[i + tau];
    r[tau] = suma;
  }
  return r;
}

/**
 * Autocorrelación vía FFT (teorema de Wiener–Khinchin):
 *
 *   r = IFFT( |FFT(x)|² )
 *
 * El relleno con ceros hasta al menos 2N es imprescindible: sin él la FFT
 * calcularía la autocorrelación **circular**, que supone que la señal se repite
 * y contamina los desfases grandes con muestras del otro extremo del frame.
 */
export function autocorrelationFft(x: Float32Array, maxLag?: number): Float64Array {
  const n = x.length;
  const lags = Math.min(maxLag ?? n - 1, n - 1);

  const size = nextPowerOfTwo(2 * n);
  const fft = getFft(size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  re.set(x);

  fft.forward(re, im);

  // Espectro de potencia: |X[k]|² = X[k]·conj(X[k]), que es real.
  for (let k = 0; k < size; k++) {
    re[k] = re[k] * re[k] + im[k] * im[k];
    im[k] = 0;
  }

  fft.inverse(re, im);

  return Float64Array.from(re.subarray(0, lags + 1));
}

/**
 * Correlación cruzada por FFT: cc[τ] = Σ_j a[j] · b[j+τ], para τ = 0 … maxLag.
 *
 * Se apoya en que correlacionar equivale a multiplicar por el conjugado en
 * frecuencia: cc = IFFT( conj(A) · B ). YIN la necesita porque su función de
 * diferencia compara una ventana fija contra el resto del frame, no el frame
 * entero contra sí mismo.
 */
export function crossCorrelationFft(
  a: Float32Array,
  b: Float32Array,
  maxLag: number
): Float64Array {
  const size = nextPowerOfTwo(a.length + b.length);
  const fft = getFft(size);

  const reA = new Float64Array(size);
  const imA = new Float64Array(size);
  const reB = new Float64Array(size);
  const imB = new Float64Array(size);
  reA.set(a);
  reB.set(b);

  fft.forward(reA, imA);
  fft.forward(reB, imB);

  // conj(A)·B = (reA − j·imA)(reB + j·imB)
  for (let k = 0; k < size; k++) {
    const re = reA[k] * reB[k] + imA[k] * imB[k];
    const im = reA[k] * imB[k] - imA[k] * reB[k];
    reA[k] = re;
    imA[k] = im;
  }

  fft.inverse(reA, imA);
  return Float64Array.from(reA.subarray(0, maxLag + 1));
}

/**
 * Autocorrelación normalizada al intervalo [−1, 1], corrigiendo el sesgo del
 * solapamiento decreciente. Cada desfase se divide entre la energía de los dos
 * tramos que realmente se comparan:
 *
 *   ρ[τ] = r[τ] / √( Σ_{n<N-τ} x[n]² · Σ_{n<N-τ} x[n+τ]² )
 *
 * Así ρ[τ] = 1 significa "coincidencia perfecta" con independencia de cuántas
 * muestras se solapen, y el valor sirve directamente como medida de confianza.
 * Las sumas se calculan con acumulados previos, de modo que el costo total es
 * lineal en el número de desfases.
 */
export function normalizedAutocorrelation(
  x: Float32Array,
  r: Float64Array
): Float64Array {
  const n = x.length;

  // energiaPrefijo[i] = Σ_{j<i} x[j]²
  const energiaPrefijo = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) energiaPrefijo[i + 1] = energiaPrefijo[i] + x[i] * x[i];

  const out = new Float64Array(r.length);
  for (let tau = 0; tau < r.length; tau++) {
    const solape = n - tau;
    if (solape <= 0) break;

    // Energía de x[0 … N−τ) y de x[τ … N), los dos tramos comparados.
    const energiaA = energiaPrefijo[solape];
    const energiaB = energiaPrefijo[n] - energiaPrefijo[tau];

    const denominador = Math.sqrt(energiaA * energiaB);
    out[tau] = denominador > 0 ? r[tau] / denominador : 0;
  }
  return out;
}

/**
 * Interpolación parabólica alrededor de un máximo discreto.
 *
 * El pico real casi nunca cae justo en una muestra: con 16 kHz y un tono de
 * 200 Hz el periodo son 80 muestras, y el desfase entero más cercano puede
 * errar hasta media muestra, lo que a esa frecuencia son ~1.2 Hz. Ajustar una
 * parábola por los tres puntos alrededor del máximo recupera la posición
 * fraccionaria del vértice.
 *
 * Devuelve el desplazamiento respecto del índice entero, en (−0.5, 0.5).
 */
export function parabolicOffset(y0: number, y1: number, y2: number): number {
  // Vértice de la parábola que pasa por (−1, y0), (0, y1), (1, y2):
  //
  //   x* = (y0 − y2) / (2·(y0 − 2y1 + y2))
  //
  // El denominador es negativo en un máximo (la parábola abre hacia abajo).
  const curvatura = y0 - 2 * y1 + y2;
  if (curvatura === 0) return 0;

  const offset = (y0 - y2) / (2 * curvatura);
  // Un desplazamiento fuera de media muestra indica que el máximo no era tal.
  return Math.abs(offset) <= 0.5 ? offset : 0;
}
