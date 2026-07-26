/**
 * S2-T2 — Filtros biquad (IIR de segundo orden).
 *
 * A diferencia del FIR de S2-T1, un biquad logra un corte parecido con solo 5
 * coeficientes en vez de 127, porque realimenta la salida:
 *
 *   y[n] = b0·x[n] + b1·x[n-1] + b2·x[n-2] − a1·y[n-1] − a2·y[n-2]
 *
 * El precio es que la fase no es lineal (cada frecuencia se retrasa distinto) y
 * que puede volverse inestable si los polos se salen del círculo unitario. Para
 * el pasa-banda de preprocesamiento eso no molesta: interesa quitar energía
 * fuera de la banda de voz, no preservar la forma de onda exacta. Donde sí
 * importa la fase (el remuestreo de S2-T1, que alimenta al comparador) se usó
 * FIR.
 *
 * Coeficientes según el "Audio EQ Cookbook" de Robert Bristow-Johnson, la
 * referencia estándar para biquads de audio.
 */

/** Coeficientes normalizados con a0 = 1. */
export interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** Q = 1/√2 → respuesta de Butterworth: lo más plana posible en la banda de paso. */
export const BUTTERWORTH_Q = Math.SQRT1_2;

function assertCutoff(cutoffHz: number, sampleRate: number): void {
  if (cutoffHz <= 0 || cutoffHz >= sampleRate / 2) {
    throw new RangeError(
      `cutoffHz debe estar en (0, ${sampleRate / 2}) — el Nyquist de ${sampleRate} Hz — pero recibí ${cutoffHz}`
    );
  }
}

/** Términos comunes a todos los diseños del cookbook. */
function omega(cutoffHz: number, sampleRate: number, q: number) {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  return { cosW0: Math.cos(w0), alpha: Math.sin(w0) / (2 * q) };
}

/** Pasa-altas de segundo orden: −12 dB/octava por debajo del corte. */
export function designHighpass(
  cutoffHz: number,
  sampleRate: number,
  q: number = BUTTERWORTH_Q
): BiquadCoeffs {
  assertCutoff(cutoffHz, sampleRate);
  const { cosW0, alpha } = omega(cutoffHz, sampleRate, q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 + cosW0) / 2) / a0,
    b1: (-(1 + cosW0)) / a0,
    b2: ((1 + cosW0) / 2) / a0,
    a1: (-2 * cosW0) / a0,
    a2: (1 - alpha) / a0,
  };
}

/** Pasa-bajas de segundo orden: −12 dB/octava por encima del corte. */
export function designLowpass(
  cutoffHz: number,
  sampleRate: number,
  q: number = BUTTERWORTH_Q
): BiquadCoeffs {
  assertCutoff(cutoffHz, sampleRate);
  const { cosW0, alpha } = omega(cutoffHz, sampleRate, q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 - cosW0) / 2) / a0,
    b1: (1 - cosW0) / a0,
    b2: ((1 - cosW0) / 2) / a0,
    a1: (-2 * cosW0) / a0,
    a2: (1 - alpha) / a0,
  };
}

/**
 * Ganancia del filtro a una frecuencia, evaluando |H(e^{jω})| sobre el círculo
 * unitario. Sirve para verificar el diseño sin tener que filtrar señales de
 * prueba (y para levantar la tabla de respuesta en frecuencia de la evidencia).
 */
export function magnitudeAt(c: BiquadCoeffs, freqHz: number, sampleRate: number): number {
  const w = (2 * Math.PI * freqHz) / sampleRate;
  const cos1 = Math.cos(w);
  const sin1 = Math.sin(w);
  const cos2 = Math.cos(2 * w);
  const sin2 = Math.sin(2 * w);

  // z^-1 = cos(ω) − j·sin(ω);  z^-2 = cos(2ω) − j·sin(2ω)
  const numRe = c.b0 + c.b1 * cos1 + c.b2 * cos2;
  const numIm = -(c.b1 * sin1 + c.b2 * sin2);
  const denRe = 1 + c.a1 * cos1 + c.a2 * cos2;
  const denIm = -(c.a1 * sin1 + c.a2 * sin2);

  return Math.hypot(numRe, numIm) / Math.hypot(denRe, denIm);
}

/** Ganancia en decibelios: 20·log₁₀|H|. */
export function magnitudeDb(c: BiquadCoeffs, freqHz: number, sampleRate: number): number {
  return 20 * Math.log10(magnitudeAt(c, freqHz, sampleRate));
}

/**
 * Biquad con estado, en forma directa II transpuesta. Es la forma preferida en
 * punto flotante: solo necesita dos variables de estado y acumula menos error
 * numérico que la directa I.
 */
export class Biquad {
  private s1 = 0;
  private s2 = 0;

  constructor(readonly coeffs: BiquadCoeffs) {}

  process(block: Float32Array): Float32Array {
    const { b0, b1, b2, a1, a2 } = this.coeffs;
    const out = new Float32Array(block.length);
    let { s1, s2 } = this;

    for (let i = 0; i < block.length; i++) {
      const x = block[i];
      const y = b0 * x + s1;
      s1 = b1 * x - a1 * y + s2;
      s2 = b2 * x - a2 * y;
      out[i] = y;
    }

    this.s1 = s1;
    this.s2 = s2;
    return out;
  }

  reset(): void {
    this.s1 = 0;
    this.s2 = 0;
  }
}

/**
 * Cascada de biquads: la respuesta total es el producto de las individuales.
 * Un pasa-banda se arma encadenando un pasa-altas y un pasa-bajas.
 */
export class BiquadCascade {
  private readonly stages: Biquad[];

  constructor(readonly coeffs: BiquadCoeffs[]) {
    this.stages = coeffs.map((c) => new Biquad(c));
  }

  process(block: Float32Array): Float32Array {
    return this.stages.reduce((signal, stage) => stage.process(signal), block);
  }

  reset(): void {
    this.stages.forEach((s) => s.reset());
  }
}

/** Ganancia total de una cascada: el producto de las ganancias de cada etapa. */
export function cascadeMagnitudeAt(
  coeffs: BiquadCoeffs[],
  freqHz: number,
  sampleRate: number
): number {
  return coeffs.reduce((gain, c) => gain * magnitudeAt(c, freqHz, sampleRate), 1);
}
