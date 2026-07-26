/**
 * S2-T1 — Pruebas del remuestreo con señales sintéticas.
 *
 * Todo se valida contra señales generadas por código (senos de frecuencia
 * conocida): no hace falta micrófono, UI ni IA. La prueba central es la de
 * aliasing — compara nuestra cadena "filtrar y decimar" contra la decimación
 * ingenua, y mide cuánta energía falsa aparece en 7 kHz.
 */

import { describe, it, expect } from 'vitest';
import { designLowpassFir, groupDelay, filterOffline } from '../../src/audio/dsp/fir';
import { resample, StreamingResampler, designAntiAliasFilter } from '../../src/audio/dsp/resampler';

/** Seno de amplitud 1 muestreado a `rate` durante `seconds`. */
function sine(freqHz: number, rate: number, seconds = 1): Float32Array {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freqHz * i) / rate);
  return out;
}

/**
 * Amplitud de la componente de `freqHz` en la señal (correlación con seno y
 * coseno de esa frecuencia). Es un solo bin de DFT calculado a mano — la FFT
 * completa es la tarea S3-T1.
 */
function magnitudeAt(signal: Float32Array, freqHz: number, rate: number): number {
  let re = 0;
  let im = 0;
  const n = signal.length;
  for (let i = 0; i < n; i++) {
    const phase = (2 * Math.PI * freqHz * i) / rate;
    re += signal[i] * Math.cos(phase);
    im -= signal[i] * Math.sin(phase);
  }
  return (2 * Math.hypot(re, im)) / n;
}

/** Decimación sin filtrar: lo que NO hay que hacer. */
function decimateNaive(signal: Float32Array, factor: number): Float32Array {
  const out = new Float32Array(Math.floor(signal.length / factor));
  for (let i = 0; i < out.length; i++) out[i] = signal[i * factor];
  return out;
}

describe('FIR pasa-bajas por sinc enventanado (S2-T1)', () => {
  it('es simétrico, de largo impar y con ganancia 1 en DC', () => {
    const h = designLowpassFir(7200, 48000, 127);

    expect(h.length).toBe(127);
    expect(h.length % 2).toBe(1);
    expect(groupDelay(h)).toBe(63);

    // Simetría → fase lineal.
    for (let i = 0; i < h.length; i++) {
      expect(h[i]).toBeCloseTo(h[h.length - 1 - i], 6);
    }

    // Σh = 1: filtrar no cambia el nivel de la señal.
    const dcGain = h.reduce((a, b) => a + b, 0);
    expect(dcGain).toBeCloseTo(1, 6);
  });

  it('fuerza el nº de taps a impar', () => {
    expect(designLowpassFir(7200, 48000, 128).length).toBe(129);
  });

  it('deja pasar la banda de voz y rechaza lo que está sobre el corte', () => {
    const h = designLowpassFir(7200, 48000, 127);

    // Banda de paso: la voz sale prácticamente intacta.
    expect(magnitudeAt(filterOffline(sine(300, 48000), h), 300, 48000)).toBeCloseTo(1, 2);
    expect(magnitudeAt(filterOffline(sine(3400, 48000), h), 3400, 48000)).toBeCloseTo(1, 2);

    // Banda de rechazo: lo que provocaría aliasing queda atenuado > 40 dB.
    expect(magnitudeAt(filterOffline(sine(9000, 48000), h), 9000, 48000)).toBeLessThan(0.01);
    expect(magnitudeAt(filterOffline(sine(12000, 48000), h), 12000, 48000)).toBeLessThan(0.01);
  });

  it('no diseña filtro al subir de rate (no hay riesgo de plegado)', () => {
    expect(designAntiAliasFilter(16000, 48000)).toBeNull();
    expect(designAntiAliasFilter(48000, 16000)).not.toBeNull();
  });

  it('rechaza cortes fuera del rango válido', () => {
    expect(() => designLowpassFir(0, 48000)).toThrow(RangeError);
    expect(() => designLowpassFir(24000, 48000)).toThrow(RangeError);
  });
});

describe('Remuestreo offline 48 kHz → 16 kHz (S2-T1)', () => {
  it('produce un tercio de las muestras', () => {
    expect(resample(sine(1000, 48000, 1), 48000, 16000).length).toBe(16000);
    expect(resample(sine(1000, 48000, 0.5), 48000, 16000).length).toBe(8000);
  });

  it('conserva frecuencia y amplitud de un tono de la banda de voz', () => {
    const out = resample(sine(1000, 48000), 48000, 16000);

    expect(magnitudeAt(out, 1000, 16000)).toBeCloseTo(1, 2);
    // Nada relevante en otras frecuencias.
    expect(magnitudeAt(out, 2000, 16000)).toBeLessThan(0.01);
  });

  it('si ya estamos a 16 kHz devuelve una copia intacta', () => {
    const input = sine(440, 16000, 0.01);
    const out = resample(input, 16000, 16000);

    expect(Array.from(out)).toEqual(Array.from(input));
    expect(out).not.toBe(input);
  });

  it('maneja la relación no entera 44.1 kHz → 16 kHz', () => {
    const out = resample(sine(1000, 44100), 44100, 16000);

    expect(out.length).toBe(16000);
    expect(magnitudeAt(out, 1000, 16000)).toBeCloseTo(1, 1);
  });
});

describe('Anti-aliasing: por qué el filtro va ANTES de decimar (S2-T1)', () => {
  // Un tono de 9 kHz supera el Nyquist destino (8 kHz). Al decimar ÷3 se
  // pliega a |((9000 + 8000) mod 16000) - 8000| = 7000 Hz, donde es
  // indistinguible de una fricativa real.
  const tono9k = sine(9000, 48000);

  it('la decimación ingenua inventa un tono de 7 kHz que no existía', () => {
    const alias = magnitudeAt(decimateNaive(tono9k, 3), 7000, 16000);
    expect(alias).toBeGreaterThan(0.9); // prácticamente toda la energía se plegó
  });

  it('filtrar antes de decimar elimina ese fantasma', () => {
    const alias = magnitudeAt(resample(tono9k, 48000, 16000), 7000, 16000);
    expect(alias).toBeLessThan(0.01); // > 40 dB por debajo de la ingenua
  });
});

describe('StreamingResampler: captura en vivo (S2-T1)', () => {
  it('procesar por bloques da el mismo resultado que de una sola vez', () => {
    const input = sine(1000, 48000, 0.2);

    const enBloque = new StreamingResampler(48000, 16000).process(input);

    // Mismo remuestreador alimentado en bloques de 128 (lo que da el worklet).
    const porBloques = new StreamingResampler(48000, 16000);
    const partes: number[] = [];
    for (let i = 0; i < input.length; i += 128) {
      partes.push(...porBloques.process(input.subarray(i, i + 128)));
    }

    // La independencia del tamaño de bloque es lo que garantiza que la fase
    // fraccionaria y la historia del FIR se conservan entre callbacks.
    expect(partes.length).toBe(enBloque.length);
    for (let i = 0; i < partes.length; i++) {
      expect(partes[i]).toBeCloseTo(enBloque[i], 6);
    }
  });

  it('conserva el tono al remuestrear en vivo', () => {
    const r = new StreamingResampler(48000, 16000);
    const out = r.process(sine(1000, 48000));

    expect(out.length).toBeGreaterThan(15900);
    expect(magnitudeAt(out, 1000, 16000)).toBeCloseTo(1, 1);
  });

  it('no toca la señal si el rate ya coincide', () => {
    const input = sine(440, 16000, 0.01);
    expect(Array.from(new StreamingResampler(16000, 16000).process(input))).toEqual(
      Array.from(input)
    );
  });

  it('el retardo del filtro es despreciable frente a la latencia objetivo', () => {
    // 63 muestras de retardo de grupo a 48 kHz ≈ 1.3 ms.
    expect(new StreamingResampler(48000, 16000).latencyMs).toBeCloseTo(1.31, 1);
  });

  it('reset deja el filtro sin historia previa', () => {
    const r = new StreamingResampler(48000, 16000);
    const input = sine(1000, 48000, 0.05);

    const primera = r.process(input);
    r.reset();
    const segunda = r.process(input);

    expect(Array.from(segunda)).toEqual(Array.from(primera));
  });
});
