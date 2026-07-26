/**
 * S2-T1 — Filtro FIR pasa-bajas por sinc enventanado.
 *
 * Es el filtro anti-aliasing que va ANTES de decimar. Si decimamos sin filtrar,
 * todo lo que esté por encima del Nyquist destino (8 kHz) se pliega dentro de
 * la banda útil y ya no hay forma de separarlo (ver `aliasFrequency` en
 * `sampling.ts`).
 *
 * Diseño: la respuesta ideal de un pasa-bajas es un sinc infinito en el tiempo.
 * Lo truncamos a `numTaps` coeficientes y lo multiplicamos por una ventana de
 * Hann para suavizar el corte — truncar en seco (ventana rectangular) produce
 * el fenómeno de Gibbs: rizado en la banda de paso y fugas en la de rechazo.
 *
 *   h[n] = 2 f_c · sinc(2 f_c (n - M/2)) · w[n],   w[n] = 0.5 - 0.5 cos(2πn/M)
 *
 * con f_c normalizada (ciclos/muestra) y M = numTaps - 1. Se usa numTaps impar
 * para que el retardo de grupo M/2 sea entero y el filtro sea de fase lineal:
 * todas las frecuencias se retrasan lo mismo, así que la forma de onda no se
 * distorsiona (importa para el pitch de la Semana 5).
 */

/** sinc normalizado: sin(πx)/(πx), con el límite sinc(0) = 1. */
function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

/**
 * Coeficientes de un pasa-bajas FIR con corte en `cutoffHz`.
 * `numTaps` se fuerza a impar (fase lineal con retardo entero).
 * Más taps = transición más abrupta, pero más costo por muestra.
 */
export function designLowpassFir(cutoffHz: number, sampleRate: number, numTaps = 127): Float32Array {
  if (cutoffHz <= 0 || cutoffHz >= sampleRate / 2) {
    throw new RangeError(`cutoffHz debe estar en (0, ${sampleRate / 2}), recibí ${cutoffHz}`);
  }
  const taps = numTaps % 2 === 0 ? numTaps + 1 : numTaps;
  const fc = cutoffHz / sampleRate; // frecuencia normalizada, ciclos/muestra
  const M = taps - 1;

  const h = new Float32Array(taps);
  let sum = 0;
  for (let n = 0; n < taps; n++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / M);
    const value = 2 * fc * sinc(2 * fc * (n - M / 2)) * hann;
    h[n] = value;
    sum += value;
  }

  // Normalizamos a ganancia 1 en DC (Σh = 1): el enventanado altera levemente
  // la ganancia, y no queremos que filtrar cambie el nivel de la señal — el
  // RMS es la base del VAD (S2-T3) y de la normalización (S2-T2).
  for (let n = 0; n < taps; n++) h[n] /= sum;
  return h;
}

/** Retardo de grupo en muestras de un FIR simétrico de fase lineal. */
export function groupDelay(coeffs: Float32Array): number {
  return (coeffs.length - 1) / 2;
}

/**
 * Filtro FIR con estado, para streaming: recuerda las últimas `numTaps - 1`
 * muestras entre bloques, de modo que filtrar por bloques dé exactamente lo
 * mismo que filtrar la señal completa. La salida sale retrasada `groupDelay`
 * muestras (inevitable en tiempo real; en offline se compensa).
 */
export class FirFilter {
  private readonly history: Float32Array;

  constructor(readonly coeffs: Float32Array) {
    this.history = new Float32Array(coeffs.length - 1);
  }

  get groupDelay(): number {
    return groupDelay(this.coeffs);
  }

  /** Convolución del bloque con los coeficientes. Salida del mismo largo. */
  process(block: Float32Array): Float32Array {
    const { coeffs, history } = this;
    const n = block.length;
    const taps = coeffs.length;
    const histLen = history.length;
    const out = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let k = 0; k < taps; k++) {
        const idx = i - k;
        acc += coeffs[k] * (idx >= 0 ? block[idx] : history[histLen + idx]);
      }
      out[i] = acc;
    }

    // Guardamos la cola del bloque como historia del siguiente.
    if (histLen > 0) {
      if (n >= histLen) {
        history.set(block.subarray(n - histLen));
      } else {
        history.copyWithin(0, n);
        history.set(block, histLen - n);
      }
    }
    return out;
  }

  reset(): void {
    this.history.fill(0);
  }
}

/**
 * Filtrado offline con el retardo de grupo compensado: la salida queda
 * alineada muestra a muestra con la entrada. Se usa para analizar buffers
 * completos (audio TTS de referencia, señales de prueba), donde no hay
 * restricción de tiempo real y el desfase estorbaría al comparar.
 */
export function filterOffline(signal: Float32Array, coeffs: Float32Array): Float32Array {
  const delay = groupDelay(coeffs);

  // Alargamos con `delay` ceros para vaciar la línea de retardo, filtramos de
  // una sola pasada y descartamos las primeras `delay` muestras (el transitorio
  // de entrada). Lo que queda está alineado con la señal original.
  const padded = new Float32Array(signal.length + delay);
  padded.set(signal);

  return new FirFilter(coeffs).process(padded).slice(delay);
}
