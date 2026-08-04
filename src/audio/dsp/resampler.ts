/**
 * S2-T1 — Remuestreo a 16 kHz.
 *
 * El micrófono entrega 48 kHz (medido en S1-T6) y Whisper exige 16 kHz.
 * El proceso tiene dos pasos y el orden no es negociable:
 *
 *   1. Filtrar pasa-bajas a 7 200 Hz (`antiAliasCutoffHz`), por debajo del
 *      Nyquist destino de 8 kHz, dejando margen para la transición del filtro.
 *   2. Tomar 1 de cada `factor` muestras (48 000 / 16 000 = 3, decimación exacta).
 *
 * Si se invierte el orden no hay nada que hacer: al decimar, una componente de
 * 9 kHz aparece indistinguible de una de 7 kHz reales (`aliasFrequency`) y
 * ningún filtro posterior puede separarlas. `tests/audio/resampler.test.ts`
 * mide justamente eso.
 *
 * Para relaciones no enteras (44 100 → 16 000, factor 2.75625) el paso 2 no es
 * "saltar muestras" sino leer en posiciones fraccionarias, con interpolación
 * lineal entre las dos muestras vecinas.
 */

import { SAMPLE_RATE } from '@shared/constants';
import { antiAliasCutoffHz, chooseResampleStrategy } from './sampling';
import { designLowpassFir, FirFilter, filterOffline } from './fir';

/** Nº de coeficientes del FIR anti-aliasing (impar, fase lineal). */
export const ANTI_ALIAS_TAPS = 127;

/**
 * Diseña el filtro anti-aliasing para ir de `fromRate` a `toRate`.
 * El corte se calcula sobre el rate MENOR: es el que impone el Nyquist
 * limitante. Al subir de rate (toRate > fromRate) no hay riesgo de plegado —
 * la señal ya está limitada en banda — y el filtro no hace falta.
 */
export function designAntiAliasFilter(
  fromRate: number,
  toRate: number = SAMPLE_RATE,
  numTaps: number = ANTI_ALIAS_TAPS
): Float32Array | null {
  if (toRate >= fromRate) return null;
  return designLowpassFir(antiAliasCutoffHz(toRate), fromRate, numTaps);
}

/**
 * Lee `filtered` en posiciones fraccionarias separadas `step` muestras,
 * interpolando linealmente. Con `step` entero el `frac` es 0 y la operación
 * degenera en decimación exacta (se toma la muestra tal cual, sin mezclar).
 *
 * `prev` es la última muestra del bloque anterior, necesaria cuando la posición
 * de lectura cae entre bloques (streaming). Devuelve también la posición
 * sobrante, rebasada al inicio del siguiente bloque.
 */
function readAtStep(
  filtered: Float32Array,
  step: number,
  startPos: number,
  prev: number
): { out: Float32Array; nextPos: number } {
  const n = filtered.length;
  const out: number[] = [];

  let pos = startPos;
  for (;;) {
    const i = Math.floor(pos);
    // Para interpolar necesitamos la muestra i+1; si cae fuera del bloque,
    // paramos y dejamos la posición pendiente para la próxima llamada.
    if (i + 1 > n - 1) break;
    const a = i < 0 ? prev : filtered[i];
    const b = filtered[i + 1];
    const frac = pos - i;
    out.push(a + (b - a) * frac);
    pos += step;
  }

  return { out: Float32Array.from(out), nextPos: pos - n };
}

/**
 * Remuestrea un buffer completo (offline). Para audio ya grabado: el TTS de
 * referencia, señales sintéticas de prueba o el PCM final de una grabación.
 */
export function resample(
  input: Float32Array,
  fromRate: number,
  toRate: number = SAMPLE_RATE,
  numTaps: number = ANTI_ALIAS_TAPS
): Float32Array {
  const strategy = chooseResampleStrategy(fromRate, toRate);
  if (strategy.kind === 'none') return input.slice();

  const coeffs = designAntiAliasFilter(fromRate, toRate, numTaps);
  // Offline compensamos el retardo de grupo: la salida queda alineada con la
  // entrada, cosa que importa al comparar contra la referencia (DTW, S6-T1).
  const filtered = coeffs ? filterOffline(input, coeffs) : input;

  // `prev = 0`: offline arrancamos en pos 0, nunca se lee antes del bloque.
  return readAtStep(filtered, strategy.factor, 0, 0).out;
}

/**
 * Decimador polifásico para relaciones enteras (S7-T4, optimización).
 *
 * El camino directo filtra el bloque completo y después se queda con una de
 * cada `factor` muestras. Eso calcula `factor` veces más productos de los que
 * se usan: para 48 → 16 kHz, dos de cada tres salidas del filtro se tiran.
 *
 * La versión polifásica evalúa el FIR **solo en las posiciones que se
 * conservan**. El resultado es idéntico —es la misma convolución, en menos
 * puntos— y el costo baja por el factor de decimación. Es la razón por la que
 * en multitasa nunca se filtra y luego se decima por separado.
 *
 * Emite exactamente en las mismas posiciones que el camino genérico, de modo
 * que la optimización no cambia ni una muestra de la salida.
 */
class PolyphaseDecimator {
  private readonly history: Float64Array;
  /** Posición dentro del próximo bloque donde toca la siguiente salida. */
  private phase = 0;

  constructor(
    private readonly coeffs: Float32Array,
    private readonly factor: number
  ) {
    // Se guardan `taps` muestras y no `taps - 1`: la fase puede quedar en −1,
    // y la salida en esa posición necesita la entrada desde −1 hasta −taps.
    // Con una muestra menos se leería fuera del arreglo y saldría NaN.
    this.history = new Float64Array(coeffs.length);
  }

  process(block: Float32Array): Float32Array {
    const { coeffs, factor, history } = this;
    const taps = coeffs.length;
    const histLen = history.length;
    const n = block.length;

    // Mismo criterio de parada que el camino genérico: se emite mientras la
    // posición no pase de n-2. Así ambos caminos producen las mismas muestras.
    const salida: number[] = [];
    let i = this.phase;
    for (; i <= n - 2; i += factor) {
      let acc = 0;
      for (let k = 0; k < taps; k++) {
        const idx = i - k;
        acc += coeffs[k] * (idx >= 0 ? block[idx] : history[histLen + idx]);
      }
      salida.push(acc);
    }
    this.phase = i - n;

    // La cola del bloque queda como historia del siguiente.
    if (histLen > 0) {
      if (n >= histLen) {
        history.set(block.subarray(n - histLen));
      } else {
        history.copyWithin(0, n);
        history.set(block, histLen - n);
      }
    }
    return Float32Array.from(salida);
  }

  reset(): void {
    this.history.fill(0);
    this.phase = 0;
  }
}

/**
 * Remuestreador con estado, para la captura en vivo. Mantiene la historia del
 * FIR y la fase fraccionaria entre bloques, así que procesar por bloques da el
 * mismo resultado que procesar la señal entera (salvo el retardo de grupo, que
 * en tiempo real no se compensa: son ~1.3 ms a 48 kHz con 127 taps).
 *
 * Con relación entera usa el camino polifásico, que calcula solo las muestras
 * que se conservan; con relación fraccionaria, el genérico con interpolación.
 */
export class StreamingResampler {
  private readonly filter: FirFilter | null;
  private readonly polyphase: PolyphaseDecimator | null;
  private readonly step: number;
  /** Posición de lectura relativa al inicio del bloque actual. */
  private pos = 0;
  /** Última muestra filtrada del bloque anterior (para interpolar a caballo). */
  private prev = 0;

  constructor(
    readonly fromRate: number,
    readonly toRate: number = SAMPLE_RATE,
    numTaps: number = ANTI_ALIAS_TAPS
  ) {
    const coeffs = designAntiAliasFilter(fromRate, toRate, numTaps);
    this.filter = coeffs ? new FirFilter(coeffs) : null;
    this.step = chooseResampleStrategy(fromRate, toRate).factor;

    // El camino polifásico solo aplica cuando la relación es entera y hay
    // filtro que aplicar (es decir, cuando se está bajando de frecuencia).
    this.polyphase =
      coeffs && Number.isInteger(this.step) && this.step > 1
        ? new PolyphaseDecimator(coeffs, this.step)
        : null;
  }

  /** Retardo introducido por el filtro anti-aliasing, en milisegundos. */
  get latencyMs(): number {
    return this.filter ? (this.filter.groupDelay / this.fromRate) * 1000 : 0;
  }

  /**
   * Procesa un bloque al rate de entrada y devuelve las muestras que
   * correspondan al rate de salida. El largo varía entre llamadas (128
   * muestras a 48 kHz no dan un número entero de muestras a 16 kHz siempre).
   */
  process(block: Float32Array): Float32Array {
    if (block.length === 0) return new Float32Array(0);
    if (this.step === 1) return block.slice();
    if (this.polyphase) return this.polyphase.process(block);

    const filtered = this.filter ? this.filter.process(block) : block;
    const { out, nextPos } = readAtStep(filtered, this.step, this.pos, this.prev);

    this.pos = nextPos;
    this.prev = filtered[filtered.length - 1];
    return out;
  }

  reset(): void {
    this.filter?.reset();
    this.polyphase?.reset();
    this.pos = 0;
    this.prev = 0;
  }
}
