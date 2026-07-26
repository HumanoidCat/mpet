/**
 * S3-T1 — Ventanas de análisis.
 *
 * La DFT supone que el frame se repite periódicamente hasta el infinito. Si la
 * señal no cabe un número entero de veces en el frame, los extremos no empalman
 * y ese salto artificial se reparte por todo el espectro: es la **fuga
 * espectral** (spectral leakage). Un tono puro deja de verse como una raya y
 * pasa a ensuciar decenas de bins vecinos.
 *
 * La solución es multiplicar el frame por una ventana que se desvanece en los
 * bordes, de modo que empalme suavemente consigo misma. Se paga con resolución:
 * el pico principal se ensancha. Es el compromiso de siempre entre poder
 * separar dos tonos cercanos y poder ver un tono débil junto a uno fuerte.
 *
 * Se usa Hann porque es el equilibrio habitual en análisis de voz: lóbulos
 * laterales 31 dB por debajo del principal, con un ancho de solo el doble del
 * de la ventana rectangular.
 */

/**
 * Ventana de Hann. La variante **periódica** (dividir entre N, no entre N−1) es
 * la correcta para análisis espectral: hace que la ventana empalme consigo
 * misma al repetirse, que es exactamente lo que la DFT asume.
 *
 *   w[n] = 0.5 · (1 − cos(2πn/N))
 */
export function hann(size: number, periodic = true): Float32Array {
  const divisor = periodic ? size : size - 1;
  const out = new Float32Array(size);
  for (let n = 0; n < size; n++) {
    out[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / divisor));
  }
  return out;
}

/**
 * Ventana de Hamming: lóbulos laterales más bajos que Hann cerca del pico
 * (−41 dB), pero decaen más despacio a lo lejos.
 */
export function hamming(size: number, periodic = true): Float32Array {
  const divisor = periodic ? size : size - 1;
  const out = new Float32Array(size);
  for (let n = 0; n < size; n++) {
    out[n] = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / divisor);
  }
  return out;
}

/**
 * Ventana de Blackman: lóbulos muy bajos (−58 dB) a costa de un pico principal
 * bastante más ancho. Útil cuando hay que ver algo débil junto a algo fuerte.
 */
export function blackman(size: number, periodic = true): Float32Array {
  const divisor = periodic ? size : size - 1;
  const out = new Float32Array(size);
  for (let n = 0; n < size; n++) {
    const x = (2 * Math.PI * n) / divisor;
    out[n] = 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x);
  }
  return out;
}

/** Ventana rectangular: no hacer nada. Existe para comparar contra ella. */
export function rectangular(size: number): Float32Array {
  return new Float32Array(size).fill(1);
}

export type WindowKind = 'hann' | 'hamming' | 'blackman' | 'rectangular';

const CONSTRUCTORES: Record<WindowKind, (size: number) => Float32Array> = {
  hann,
  hamming,
  blackman,
  rectangular,
};

export function createWindow(kind: WindowKind, size: number): Float32Array {
  return CONSTRUCTORES[kind](size);
}

/**
 * Ganancia coherente: la media de la ventana. Al enventanar se atenúa la señal
 * (Hann deja el 50 %), así que el espectro de amplitud hay que dividirlo entre
 * este número para recuperar la amplitud real del tono.
 */
export function coherentGain(window: Float32Array): number {
  let suma = 0;
  for (let n = 0; n < window.length; n++) suma += window[n];
  return suma / window.length;
}

/**
 * Aplica la ventana al frame. No modifica la entrada: el PCM original se sigue
 * necesitando para el pitch de la Semana 5, que trabaja sin enventanar.
 */
export function applyWindow(frame: Float32Array, window: Float32Array): Float32Array {
  const n = Math.min(frame.length, window.length);
  const out = new Float32Array(frame.length);
  for (let i = 0; i < n; i++) out[i] = frame[i] * window[i];
  return out;
}
