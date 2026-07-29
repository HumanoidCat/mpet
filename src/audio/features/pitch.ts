/**
 * S4-T4 — Detección de tono por autocorrelación (spike).
 *
 * Objetivo del spike: medir hasta dónde llega el método clásico y **dónde
 * falla**, porque esos fallos son exactamente lo que YIN corrige en S5-T1. No
 * es código definitivo: es la referencia contra la que se medirá YIN.
 *
 * Procedimiento:
 *
 *   1. Autocorrelación normalizada del frame (vía FFT, O(N log N)).
 *   2. Buscar el máximo en el rango de desfases que corresponde a voz humana:
 *      60–400 Hz son 40–267 muestras a 16 kHz.
 *   3. Refinar la posición del pico con interpolación parabólica.
 *   4. Declarar sonoro o sordo según la altura del pico.
 *
 * Limitación conocida del método, y motivo de existir de YIN: la autocorrelación
 * también presenta máximos en los **múltiplos** del periodo. Si el pico en 2T
 * supera ligeramente al de T —cosa que ocurre cuando el primer armónico domina
 * sobre la fundamental— el detector devuelve la mitad de la frecuencia real. Es
 * el clásico **error de octava**, y se cuantifica en las pruebas.
 */

import { PITCH_MAX_HZ, PITCH_MIN_HZ, SAMPLE_RATE } from '@shared/constants';
import {
  autocorrelationFft,
  normalizedAutocorrelation,
  parabolicOffset,
} from './autocorrelation';

export interface PitchOptions {
  sampleRate?: number;
  minHz?: number;
  maxHz?: number;
  /**
   * Altura mínima del pico normalizado para considerar el frame sonoro.
   * Por debajo se asume que no hay periodicidad (silencio, fricativa, ruido).
   */
  threshold?: number;
  /**
   * Fracción del pico más alto que basta para aceptar un candidato anterior.
   * Ver `detectPitch`: es lo que evita los errores de sub-armónico.
   */
  peakRatio?: number;
}

export interface PitchResult {
  /** Frecuencia fundamental estimada, en Hz. */
  hz: number;
  /** Altura del pico normalizado, en [0, 1]: qué tan periódico es el frame. */
  confidence: number;
  /** Periodo estimado en muestras, con parte fraccionaria. */
  periodSamples: number;
}

const DEFAULT_THRESHOLD = 0.5;

/**
 * Un candidato anterior se acepta si llega al 90 % del pico más alto. Bajarlo
 * dispara errores de octava hacia arriba (se elige un pico espurio temprano);
 * subirlo hasta 1 devuelve el problema del sub-armónico.
 */
const DEFAULT_PEAK_RATIO = 0.9;

/**
 * Estima la frecuencia fundamental de un frame. Devuelve `null` si el frame no
 * es suficientemente periódico, que es lo que el contrato `AudioFrame` espera
 * para los tramos sordos (`pitchHz: number | null`).
 *
 * Se espera un frame ya preprocesado (S2-T2): el pasa-altas elimina la continua,
 * que de otro modo domina la autocorrelación en todos los desfases.
 */
export function detectPitch(frame: Float32Array, options: PitchOptions = {}): PitchResult | null {
  const sampleRate = options.sampleRate ?? SAMPLE_RATE;
  const minHz = options.minHz ?? PITCH_MIN_HZ;
  const maxHz = options.maxHz ?? PITCH_MAX_HZ;
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const peakRatio = options.peakRatio ?? DEFAULT_PEAK_RATIO;

  // Frecuencia alta → periodo corto. El rango se invierte al pasar a desfases.
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.ceil(sampleRate / minHz);

  // Hace falta al menos un periodo completo del tono más grave que buscamos;
  // con dos, la autocorrelación tiene suficiente solapamiento para ser fiable.
  if (frame.length < 2 * minLag || minLag >= maxLag) return null;

  const lagLimit = Math.min(maxLag, frame.length - 1);
  const r = autocorrelationFft(frame, lagLimit);
  const rho = normalizedAutocorrelation(frame, r);

  // Máximo dentro del rango de voz. Se excluye el entorno de τ=0, donde la
  // autocorrelación siempre vale 1 por comparar la señal consigo misma.
  let maximoGlobal = -Infinity;
  for (let tau = minLag; tau <= lagLimit; tau++) {
    if (rho[tau] > maximoGlobal) maximoGlobal = rho[tau];
  }
  if (maximoGlobal < threshold) return null;

  // ⚠️ Quedarse con el máximo global es un error, y es el fallo clásico de este
  // método. Una señal de periodo T es igual de periódica en 2T, 3T…: ρ vale
  // ~1 en todos los múltiplos, y cuál gana lo decide el ruido de punto
  // flotante. Medido con un tono de 200 Hz: ρ[80] = ρ[160] = ρ[240] = 1.0000
  // y el máximo global caía en τ=240, reportando 66.7 Hz — un tercio de la
  // fundamental (error de sub-armónico).
  //
  // El periodo verdadero es el MENOR de esos desfases, así que se toma el
  // primer máximo local que alcance una fracción `peakRatio` del global.
  const objetivo = maximoGlobal * peakRatio;
  let mejorLag = -1;
  for (let tau = minLag; tau <= lagLimit; tau++) {
    const izquierda = tau > minLag ? rho[tau - 1] : -Infinity;
    const derecha = tau < lagLimit ? rho[tau + 1] : -Infinity;

    if (rho[tau] >= objetivo && rho[tau] > izquierda && rho[tau] >= derecha) {
      mejorLag = tau;
      break;
    }
  }

  if (mejorLag < 0) return null;
  const mejorValor = rho[mejorLag];

  // Refinamiento sub-muestra del vértice.
  let periodo = mejorLag;
  if (mejorLag > 0 && mejorLag < lagLimit) {
    periodo += parabolicOffset(rho[mejorLag - 1], rho[mejorLag], rho[mejorLag + 1]);
  }

  const hz = sampleRate / periodo;
  // La interpolación puede empujar el resultado fuera del rango pedido.
  if (hz < minHz || hz > maxHz) return null;

  return { hz, confidence: mejorValor, periodSamples: periodo };
}

/**
 * Estima el tono a lo largo de una señal, frame a frame. Devuelve `null` en los
 * frames sordos, de modo que el contorno resultante tiene huecos donde no hay
 * voz — que es la forma correcta de representarlo: interpolar sobre un silencio
 * inventaría un tono que nadie pronunció.
 */
export function pitchContour(
  pcm: Float32Array,
  frameSize: number,
  hopSize: number,
  options: PitchOptions = {}
): (PitchResult | null)[] {
  const salida: (PitchResult | null)[] = [];
  for (let inicio = 0; inicio + frameSize <= pcm.length; inicio += hopSize) {
    salida.push(detectPitch(pcm.subarray(inicio, inicio + frameSize), options));
  }
  return salida;
}
