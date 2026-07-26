/**
 * S2-T2 — Pruebas del preprocesamiento.
 *
 * El caso que resume la tarea: la misma frase dicha flojo y dicha fuerte debe
 * salir al mismo nivel, y un zumbido de 60 Hz no debe influir en esa decisión.
 */

import { describe, it, expect } from 'vitest';
import {
  rms,
  peak,
  rmsNormalize,
  normalizationGain,
  preprocess,
  designVoiceBandpass,
  StreamingPreprocessor,
  TARGET_RMS,
  MAX_NORMALIZATION_GAIN,
} from '../../src/audio/dsp/preprocess';
import { cascadeMagnitudeAt } from '../../src/audio/dsp/biquad';

function sine(freqHz: number, rate: number, seconds = 0.5, amp = 1): Float32Array {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / rate);
  return out;
}

/** Suma de señales del mismo largo (voz + ruido). */
function mezclar(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
  return out;
}

describe('Medidas de nivel (S2-T2)', () => {
  it('el RMS de un seno es su amplitud dividida por √2', () => {
    expect(rms(sine(300, 16000, 0.5, 1))).toBeCloseTo(Math.SQRT1_2, 3);
    expect(rms(sine(300, 16000, 0.5, 0.5))).toBeCloseTo(0.5 * Math.SQRT1_2, 3);
  });

  it('el RMS del silencio es cero y el de un buffer vacío también', () => {
    expect(rms(new Float32Array(100))).toBe(0);
    expect(rms(new Float32Array(0))).toBe(0);
  });

  it('el pico detecta la muestra más grande en valor absoluto', () => {
    expect(peak(Float32Array.from([0.1, -0.8, 0.3]))).toBeCloseTo(0.8);
  });
});

describe('Normalización RMS (S2-T2)', () => {
  it('lleva señales de distinto volumen al mismo nivel', () => {
    // La misma "frase" dicha flojo y dicha fuerte.
    const flojo = rmsNormalize(sine(300, 16000, 0.5, 0.02));
    const fuerte = rmsNormalize(sine(300, 16000, 0.5, 0.4));

    expect(rms(flojo)).toBeCloseTo(TARGET_RMS, 3);
    expect(rms(fuerte)).toBeCloseTo(TARGET_RMS, 3);
    // Que es el punto: el comparador de la Semana 6 las verá equivalentes.
    expect(rms(flojo)).toBeCloseTo(rms(fuerte), 5);
  });

  it('no amplifica el silencio hasta convertir el ruido en señal', () => {
    // Ruido de fondo del micrófono: sin tope, la ganancia sería ~7000.
    const casiSilencio = sine(300, 16000, 0.5, 0.00001);
    expect(normalizationGain(casiSilencio)).toBeLessThanOrEqual(MAX_NORMALIZATION_GAIN);
  });

  it('nunca satura: el pico se queda dentro de [-1, 1]', () => {
    // Señal ya alta: subirla al RMS objetivo la recortaría.
    const alta = sine(300, 16000, 0.5, 0.95);
    expect(peak(rmsNormalize(alta))).toBeLessThanOrEqual(1);
  });

  it('el silencio absoluto se deja como está', () => {
    const silencio = new Float32Array(1000);
    expect(normalizationGain(silencio)).toBe(1);
    expect(Array.from(rmsNormalize(silencio))).toEqual(Array.from(silencio));
  });

  it('no modifica el buffer de entrada', () => {
    const entrada = sine(300, 16000, 0.01, 0.5);
    const copia = Float32Array.from(entrada);
    rmsNormalize(entrada);
    expect(Array.from(entrada)).toEqual(Array.from(copia));
  });
});

describe('Pasa-banda de voz (S2-T2)', () => {
  it('a 16 kHz el borde superior lo impone el Nyquist, no un filtro', () => {
    // 8 000 Hz es exactamente el Nyquist de 16 kHz: no hay nada que filtrar
    // por encima, y un biquad ahí sería inestable. Queda una sola etapa.
    expect(designVoiceBandpass(16000)).toHaveLength(1);

    // A 48 kHz sí hay banda por encima de 8 kHz, así que aparecen las dos.
    expect(designVoiceBandpass(48000)).toHaveLength(2);
  });

  it('deja la banda fonética intacta y ataca lo de abajo', () => {
    const banda = designVoiceBandpass(16000);

    expect(cascadeMagnitudeAt(banda, 0, 16000)).toBeCloseTo(0, 6); // continua
    expect(cascadeMagnitudeAt(banda, 60, 16000)).toBeLessThan(0.5); // zumbido
    expect(cascadeMagnitudeAt(banda, 300, 16000)).toBeCloseTo(1, 1); // F0
    expect(cascadeMagnitudeAt(banda, 3400, 16000)).toBeCloseTo(1, 2); // formantes
    expect(cascadeMagnitudeAt(banda, 7000, 16000)).toBeCloseTo(1, 2); // fricativas
  });
});

describe('Preprocesamiento completo (S2-T2)', () => {
  it('el zumbido de 60 Hz no altera el nivel al que queda la voz', () => {
    const voz = sine(300, 16000, 0.5, 0.1);
    const zumbido = sine(60, 16000, 0.5, 0.3); // ruido 3× más fuerte que la voz

    const limpia = preprocess(voz, 16000);
    const contaminada = preprocess(mezclar(voz, zumbido), 16000);

    // Filtrar ANTES de normalizar es lo que hace que el zumbido no cuente:
    // si el orden fuera el inverso, inflaría el RMS y dejaría la voz más baja.
    expect(rms(contaminada)).toBeCloseTo(rms(limpia), 2);
    expect(rms(contaminada)).toBeCloseTo(TARGET_RMS, 2);
  });

  it('deja la señal al RMS objetivo sin saturar', () => {
    const salida = preprocess(sine(300, 16000, 0.5, 0.03), 16000);

    expect(rms(salida)).toBeCloseTo(TARGET_RMS, 2);
    expect(peak(salida)).toBeLessThanOrEqual(1);
  });
});

describe('Preprocesamiento en vivo (S2-T2)', () => {
  it('converge al nivel objetivo conforme avanza la frase', () => {
    const p = new StreamingPreprocessor(16000);
    const entrada = sine(300, 16000, 1, 0.02);

    const bloques: Float32Array[] = [];
    for (let i = 0; i < entrada.length; i += 512) {
      bloques.push(p.process(entrada.subarray(i, i + 512)));
    }

    // El RMS suavizado tarda unos bloques en estabilizarse: el último tramo
    // ya debe estar cerca del objetivo.
    expect(rms(bloques[bloques.length - 1])).toBeCloseTo(TARGET_RMS, 1);
  });

  it('la ganancia varía poco entre bloques consecutivos (sin bombeo)', () => {
    const p = new StreamingPreprocessor(16000);
    const entrada = sine(300, 16000, 1, 0.05);

    const ganancias: number[] = [];
    for (let i = 0; i < entrada.length; i += 512) {
      p.process(entrada.subarray(i, i + 512));
      ganancias.push(p.gain);
    }

    // Normalizar cada bloque por separado daría saltos bruscos; el suavizado
    // los mantiene por debajo del 25 % de un bloque al siguiente.
    for (let i = 2; i < ganancias.length; i++) {
      const cambio = Math.abs(ganancias[i] - ganancias[i - 1]) / ganancias[i - 1];
      expect(cambio).toBeLessThan(0.25);
    }
  });

  it('no amplifica el silencio', () => {
    const p = new StreamingPreprocessor(16000);
    const salida = p.process(new Float32Array(512));

    expect(peak(salida)).toBe(0);
    expect(p.gain).toBeLessThanOrEqual(MAX_NORMALIZATION_GAIN);
  });

  it('reset deja el preprocesador como recién creado', () => {
    const p = new StreamingPreprocessor(16000);
    const entrada = sine(300, 16000, 0.05, 0.05);

    const primera = p.process(entrada);
    p.reset();
    const segunda = p.process(entrada);

    expect(Array.from(segunda)).toEqual(Array.from(primera));
  });
});
