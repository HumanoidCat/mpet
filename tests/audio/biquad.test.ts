/**
 * S2-T2 — Pruebas de los filtros biquad.
 *
 * La respuesta en frecuencia se verifica de dos formas independientes: con la
 * fórmula analítica |H(e^{jω})| y filtrando senos reales. Que ambas coincidan
 * confirma que los coeficientes y la implementación están de acuerdo.
 */

import { describe, it, expect } from 'vitest';
import {
  designHighpass,
  designLowpass,
  magnitudeAt,
  magnitudeDb,
  cascadeMagnitudeAt,
  Biquad,
  BiquadCascade,
} from '../../src/audio/dsp/biquad';

function sine(freqHz: number, rate: number, seconds = 0.5): Float32Array {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freqHz * i) / rate);
  return out;
}

/** Amplitud medida sobre la segunda mitad, ya pasado el transitorio del IIR. */
function amplitude(signal: Float32Array): number {
  let max = 0;
  for (let i = Math.floor(signal.length / 2); i < signal.length; i++) {
    const abs = Math.abs(signal[i]);
    if (abs > max) max = abs;
  }
  return max;
}

describe('Diseño de biquads (S2-T2)', () => {
  it('el pasa-altas de 80 Hz deja pasar la voz y corta el zumbido eléctrico', () => {
    const hp = designHighpass(80, 16000);

    // Continua: eliminada por completo (el offset del micrófono).
    expect(magnitudeAt(hp, 0, 16000)).toBeCloseTo(0, 6);

    // Coincide con la fórmula del Butterworth de 2º orden, |H| = r²/√(1+r⁴)
    // con r = f/fc. A 50 Hz (zumbido europeo) r = 0.625 → −8.8 dB.
    const butterworthHp = (f: number) => {
      const r = (f / 80) ** 2;
      return 20 * Math.log10(r / Math.sqrt(1 + r * r));
    };
    expect(magnitudeDb(hp, 50, 16000)).toBeCloseTo(butterworthHp(50), 1);
    expect(magnitudeDb(hp, 50, 16000)).toBeLessThan(-8.5);
    expect(magnitudeDb(hp, 60, 16000)).toBeLessThan(-6); // zumbido americano

    // En el corte, −3 dB por definición de Butterworth.
    expect(magnitudeDb(hp, 80, 16000)).toBeCloseTo(-3, 0);
    // Banda de voz: intacta.
    expect(magnitudeAt(hp, 300, 16000)).toBeCloseTo(1, 1);
    expect(magnitudeAt(hp, 3400, 16000)).toBeCloseTo(1, 2);
  });

  it('el pasa-bajas atenúa por encima del corte a −12 dB/octava', () => {
    const lp = designLowpass(200, 16000);

    expect(magnitudeAt(lp, 20, 16000)).toBeCloseTo(1, 2);
    expect(magnitudeDb(lp, 200, 16000)).toBeCloseTo(-3, 0);

    // Segundo orden ⇒ ~12 dB menos por cada duplicación de frecuencia. La
    // asíntota se mide lejos de Nyquist (800 y 1600 Hz, con fs = 16 kHz):
    // ver la prueba siguiente sobre por qué cerca de Nyquist ya no se cumple.
    const unaOctava = magnitudeDb(lp, 800, 16000);
    const dosOctavas = magnitudeDb(lp, 1600, 16000);
    expect(dosOctavas - unaOctava).toBeCloseTo(-12, 0);
  });

  it('cerca de Nyquist cae más rápido que la asíntota (warping bilineal)', () => {
    const lp = designLowpass(1000, 16000);

    // Entre 2 y 4 kHz la caída supera los 12 dB/octava teóricos: el diseño
    // por transformada bilineal comprime todo el eje de frecuencias dentro
    // de [0, Nyquist], y la respuesta se anula exactamente en Nyquist.
    const pendiente = magnitudeDb(lp, 4000, 16000) - magnitudeDb(lp, 2000, 16000);
    expect(pendiente).toBeLessThan(-12);

    // En Nyquist el numerador se cancela: ganancia nula, no una asíntota.
    expect(magnitudeAt(lp, 8000, 16000)).toBeCloseTo(0, 6);
  });

  it('rechaza cortes en el Nyquist o fuera de rango (biquad degenerado)', () => {
    // A 16 kHz un pasa-bajas en 8000 Hz pondría los polos sobre el círculo
    // unitario: el filtro dejaría de ser estable.
    expect(() => designLowpass(8000, 16000)).toThrow(RangeError);
    expect(() => designHighpass(0, 16000)).toThrow(RangeError);
    expect(() => designLowpass(9000, 16000)).toThrow(RangeError);
  });
});

describe('Aplicación del filtro (S2-T2)', () => {
  it('filtrar senos reales coincide con la respuesta teórica', () => {
    const hp = designHighpass(80, 16000);

    for (const f of [50, 200, 1000]) {
      const medida = amplitude(new Biquad(hp).process(sine(f, 16000)));
      expect(medida).toBeCloseTo(magnitudeAt(hp, f, 16000), 1);
    }
  });

  it('elimina el offset de continua del micrófono', () => {
    // Voz de 300 Hz montada sobre un offset de +0.5.
    const conOffset = sine(300, 16000);
    for (let i = 0; i < conOffset.length; i++) conOffset[i] += 0.5;

    const salida = new Biquad(designHighpass(80, 16000)).process(conOffset);

    // La media de la segunda mitad vuelve a cero: el offset desapareció.
    let suma = 0;
    const desde = Math.floor(salida.length / 2);
    for (let i = desde; i < salida.length; i++) suma += salida[i];
    expect(suma / (salida.length - desde)).toBeCloseTo(0, 2);
  });

  it('procesar por bloques da lo mismo que de una sola vez', () => {
    const entrada = sine(300, 16000, 0.1);

    const enteroDeUnaVez = new Biquad(designHighpass(80, 16000)).process(entrada);

    const porBloques = new Biquad(designHighpass(80, 16000));
    const partes: number[] = [];
    for (let i = 0; i < entrada.length; i += 128) {
      partes.push(...porBloques.process(entrada.subarray(i, i + 128)));
    }

    for (let i = 0; i < partes.length; i++) {
      expect(partes[i]).toBeCloseTo(enteroDeUnaVez[i], 6);
    }
  });

  it('reset borra el estado del filtro', () => {
    const f = new Biquad(designHighpass(80, 16000));
    const entrada = sine(300, 16000, 0.05);

    const primera = f.process(entrada);
    f.reset();
    const segunda = f.process(entrada);

    expect(Array.from(segunda)).toEqual(Array.from(primera));
  });

  it('la cascada multiplica las respuestas de sus etapas', () => {
    const etapas = [designHighpass(80, 16000), designLowpass(4000, 16000)];

    // Dentro de la banda pasa; fuera, cae por ambos lados.
    expect(cascadeMagnitudeAt(etapas, 1000, 16000)).toBeCloseTo(1, 1);
    expect(cascadeMagnitudeAt(etapas, 50, 16000)).toBeLessThan(0.4);
    expect(cascadeMagnitudeAt(etapas, 7000, 16000)).toBeLessThan(0.4);

    const medida = amplitude(new BiquadCascade(etapas).process(sine(1000, 16000)));
    expect(medida).toBeCloseTo(cascadeMagnitudeAt(etapas, 1000, 16000), 1);
  });
});
