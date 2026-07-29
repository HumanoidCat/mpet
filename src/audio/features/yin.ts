/**
 * S5-T1 — YIN: detección de frecuencia fundamental.
 *
 * De Cheveigné & Kawahara (2002), *YIN, a fundamental frequency estimator for
 * speech and music*, JASA 111(4).
 *
 * El spike de S4-T4 dejó demostrado qué hay que arreglar. La autocorrelación
 * simple estima tonos puros con 0.008 Hz de error —muy por debajo del objetivo
 * de 3 Hz— pero **falla de octava** cuando la fundamental es débil frente a su
 * primer armónico: para una voz de 100 Hz responde 200 Hz, y la confianza que
 * reporta (0.96) no delata el error. En voz real ese caso es común.
 *
 * YIN ataca justamente eso con cuatro pasos:
 *
 *   1. **Función de diferencia** en vez de autocorrelación. Mide cuánto se
 *      DIFERENCIA la señal de sí misma desplazada:
 *
 *        d[τ] = Σ_j ( x[j] − x[j+τ] )²
 *
 *      Buscar mínimos en vez de máximos evita el sesgo hacia desfases cortos
 *      que tiene la autocorrelación cuando la amplitud varía dentro del frame.
 *
 *   2. **Normalización por la media acumulada** — el paso decisivo:
 *
 *        d'[τ] = d[τ] / [ (1/τ) · Σ_{j=1..τ} d[j] ]
 *
 *      Cada desfase se compara contra el promedio de todos los anteriores. Un
 *      múltiplo del periodo ya no compite de igual a igual con el periodo
 *      verdadero: al llegar a 2T el promedio acumulado ya incluye el mínimo
 *      profundo de T, así que d'[2T] queda más alto que d'[T].
 *
 *   3. **Umbral absoluto.** Se toma el PRIMER desfase que baja del umbral, no
 *      el mínimo global. Sin esto, un múltiplo ligeramente más profundo volvería
 *      a ganar — que es exactamente el error de sub-armónico que se encontró en
 *      el spike.
 *
 *   4. **Interpolación parabólica** del mínimo, para precisión sub-muestra.
 */

import { PITCH_MAX_HZ, PITCH_MIN_HZ, SAMPLE_RATE } from '@shared/constants';
import { crossCorrelationFft, parabolicOffset } from './autocorrelation';
import type { PitchResult } from './pitch';

export interface YinOptions {
  sampleRate?: number;
  minHz?: number;
  maxHz?: number;
  /**
   * Umbral de aperiodicidad. El valor del artículo original es 0.1: se acepta
   * un desfase cuando la señal difiere de sí misma menos del 10 % de lo que
   * difiere en promedio. Subirlo detecta más voz pero admite más errores.
   */
  threshold?: number;
}

/** Umbral del artículo original de de Cheveigné & Kawahara. */
export const YIN_PAPER_THRESHOLD = 0.1;

/**
 * Umbral que usa el proyecto: **0.02**, no el 0.1 del artículo. La diferencia
 * está medida, no elegida a ojo.
 *
 * El caso patológico del spike S4-T4 —una voz de 100 Hz con el segundo armónico
 * 6.7 veces más fuerte que la fundamental— produce dos valles:
 *
 *   d'[80]  = 0.04369   ← el armónico, un periodo FALSO
 *   d'[160] = 0.00000   ← el periodo verdadero
 *
 * La normalización por media acumulada hace bien su trabajo: separa los dos
 * valles por varios órdenes de magnitud. Lo que perdía la estimación era el
 * umbral: con 0.1, el valle falso también cae por debajo, y como la regla es
 * quedarse con el *primero*, ganaba el armónico. El artículo asume que el
 * submúltiplo no baja del umbral, cosa que deja de cumplirse cuando la
 * fundamental es mucho más débil que su armónico.
 *
 * Medido sobre las señales de prueba, hay un hueco amplio donde ubicarlo:
 *
 * | Señal | d' en el periodo verdadero |
 * |---|---:|
 * | Tonos puros y voz con armónicos (peor caso) | 7.75 × 10⁻⁴ |
 * | Tono con ruido de amplitud 0.2 | 0.0246 |
 * | **Valle falso del armónico** | **0.0437** |
 *
 * 0.02 queda 26 veces por encima del peor caso limpio —así que no rechaza voz
 * legítima— y 2.2 veces por debajo del valle falso, que queda descartado.
 *
 * ⚠️ **El costo es tolerancia al ruido.** Con 0.02 se aceptan señales hasta un
 * ruido de amplitud ~0.18 (unos 15 dB de relación señal/ruido); con 0.1 se
 * llegaría a ~0.35. La calibración se hizo con señales sintéticas: con voz real
 * grabada el valor puede necesitar ajuste, y está anotado para S8-T2.
 */
export const YIN_THRESHOLD = 0.02;

/**
 * Función de diferencia d[τ], calculada con FFT en vez de por fuerza bruta.
 *
 * Desarrollando el cuadrado, la suma se descompone en tres términos:
 *
 *   d[τ] = Σ_j x[j]² + Σ_j x[j+τ]² − 2·Σ_j x[j]·x[j+τ]
 *
 * Los dos primeros salen de sumas acumuladas de cuadrados (coste lineal) y el
 * tercero es una correlación cruzada, que la FFT resuelve en O(N log N). El
 * cálculo directo costaría O(W · maxLag) — para un frame de 1024, unas 262 mil
 * operaciones por trama contra unas 20 mil.
 */
export function differenceFunction(
  x: Float32Array,
  maxLag: number,
  windowSize: number
): Float64Array {
  // Acumulado de cuadrados: energia[k] = Σ_{i<k} x[i]²
  const energia = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) energia[i + 1] = energia[i] + x[i] * x[i];

  // Σ_j x[j]·x[j+τ] con j recorriendo solo la ventana de referencia.
  const correlacion = crossCorrelationFft(x.subarray(0, windowSize), x, maxLag);

  const d = new Float64Array(maxLag + 1);
  const energiaVentana = energia[windowSize];

  for (let tau = 0; tau <= maxLag; tau++) {
    const fin = Math.min(tau + windowSize, x.length);
    const energiaDesplazada = energia[fin] - energia[tau];
    // Puede quedar levemente negativo por redondeo; se acota en cero.
    d[tau] = Math.max(0, energiaVentana + energiaDesplazada - 2 * correlacion[tau]);
  }
  return d;
}

/**
 * Diferencia normalizada por la media acumulada (paso 2 de YIN).
 *
 * Por convención d'[0] = 1, de modo que el desfase cero —donde la señal es
 * trivialmente idéntica a sí misma— nunca resulte candidato.
 */
export function cumulativeMeanNormalizedDifference(d: Float64Array): Float64Array {
  const out = new Float64Array(d.length);
  out[0] = 1;

  let acumulado = 0;
  for (let tau = 1; tau < d.length; tau++) {
    acumulado += d[tau];
    // d'[τ] = d[τ] · τ / Σ_{j≤τ} d[j]
    out[tau] = acumulado > 0 ? (d[tau] * tau) / acumulado : 1;
  }
  return out;
}

/**
 * Busca el desfase del periodo (paso 3): el **primer** mínimo local que baja
 * del umbral, no el más profundo.
 *
 * Si ninguno baja del umbral se devuelve el mínimo global del rango, y queda a
 * criterio de quien llama si su valor es aceptable. Eso permite distinguir
 * "hay un periodo claro" de "esto es lo mejor que encontré".
 */
export function absoluteThreshold(
  dPrime: Float64Array,
  minLag: number,
  maxLag: number,
  threshold: number
): { lag: number; belowThreshold: boolean } {
  for (let tau = minLag; tau <= maxLag; tau++) {
    if (dPrime[tau] >= threshold) continue;

    // Se desciende hasta el fondo de este mínimo: el primer punto que cruza el
    // umbral no suele ser el más bajo del valle.
    let fondo = tau;
    while (fondo + 1 <= maxLag && dPrime[fondo + 1] < dPrime[fondo]) fondo++;
    return { lag: fondo, belowThreshold: true };
  }

  let mejor = minLag;
  for (let tau = minLag + 1; tau <= maxLag; tau++) {
    if (dPrime[tau] < dPrime[mejor]) mejor = tau;
  }
  return { lag: mejor, belowThreshold: false };
}

/**
 * Estima la frecuencia fundamental de un frame con YIN. Devuelve `null` en los
 * tramos sordos, igual que `detectPitch`, para poder intercambiarse con él.
 *
 * `confidence` es 1 − d'[τ]: cuánto de periódica resultó la señal. A diferencia
 * de la confianza del método por autocorrelación, esta **sí baja** cuando la
 * estimación es dudosa, porque mide aperiodicidad y no altura de un pico.
 */
export function detectPitchYin(frame: Float32Array, options: YinOptions = {}): PitchResult | null {
  const sampleRate = options.sampleRate ?? SAMPLE_RATE;
  const minHz = options.minHz ?? PITCH_MIN_HZ;
  const maxHz = options.maxHz ?? PITCH_MAX_HZ;
  const threshold = options.threshold ?? YIN_THRESHOLD;

  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.ceil(sampleRate / minHz);
  if (minLag >= maxLag) return null;

  // La ventana de referencia y el desplazamiento máximo tienen que caber en el
  // frame: hacen falta al menos dos periodos del tono más grave buscado.
  const windowSize = frame.length - maxLag;
  if (windowSize < minLag) return null;

  const d = differenceFunction(frame, maxLag, windowSize);
  const dPrime = cumulativeMeanNormalizedDifference(d);

  const { lag, belowThreshold } = absoluteThreshold(dPrime, minLag, maxLag, threshold);
  if (!belowThreshold) return null;

  // Interpolación parabólica del mínimo. La misma fórmula del vértice sirve
  // para máximos y mínimos; lo único que cambia es el signo de la curvatura.
  let periodo = lag;
  if (lag > minLag && lag < maxLag) {
    periodo += parabolicOffset(dPrime[lag - 1], dPrime[lag], dPrime[lag + 1]);
  }

  const hz = sampleRate / periodo;
  if (hz < minHz || hz > maxHz) return null;

  return {
    hz,
    confidence: Math.max(0, Math.min(1, 1 - dPrime[lag])),
    periodSamples: periodo,
  };
}

/**
 * Contorno de tono con YIN, frame a frame. Igual que `pitchContour` pero con el
 * estimador definitivo: devuelve `null` en los tramos sordos en lugar de
 * interpolar sobre ellos.
 */
export function yinContour(
  pcm: Float32Array,
  frameSize: number,
  hopSize: number,
  options: YinOptions = {}
): (PitchResult | null)[] {
  const salida: (PitchResult | null)[] = [];
  for (let inicio = 0; inicio + frameSize <= pcm.length; inicio += hopSize) {
    salida.push(detectPitchYin(pcm.subarray(inicio, inicio + frameSize), options));
  }
  return salida;
}
