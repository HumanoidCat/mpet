/**
 * S8-T2 — Casos límite de la cadena de audio.
 *
 * Tres familias, que son las que nombra el plan: ruido ambiental, frases largas
 * y silencios. Cada prueba o bien fija un comportamiento correcto, o bien
 * documenta una limitación que se decidió no resolver, con su razón.
 */

import { describe, it, expect } from 'vitest';
import { preprocess } from '../../src/audio/dsp/preprocess';
import { detectSpeech, trimToSpeech } from '../../src/audio/dsp/vad';
import {
  detectVoicedSpeech,
  trimToVoicedSpeech,
  voicedRatio,
} from '../../src/audio/features/voiceDetection';
import { detectPitchYin } from '../../src/audio/features/yin';
import { mfccSequence } from '../../src/audio/features/mfcc';
import { dtw } from '../../src/audio/comparator/dtw';
import { createPronunciationScorer, defaultBandRadius } from '../../src/audio/comparator/scorer';
import { resample } from '../../src/audio/dsp/resampler';

const RATE = 16000;

function seno(f: number, n: number, amp = 1): Float32Array {
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = amp * Math.sin((2 * Math.PI * f * i) / RATE);
  return o;
}

/** Voz sintética: fundamental con armónicos decrecientes. */
function voz(f0: number, n: number, amp = 1): Float32Array {
  const o = new Float32Array(n);
  for (let k = 1; k * f0 < RATE / 2; k++) {
    const h = seno(f0 * k, n, amp / k);
    for (let i = 0; i < n; i++) o[i] += h[i];
  }
  return o;
}

function ruido(n: number, amp = 1, semilla = 7): Float32Array {
  const o = new Float32Array(n);
  let s = semilla;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    o[i] = ((s / 0x7fffffff) * 2 - 1) * amp;
  }
  return o;
}

function unir(...ps: Float32Array[]): Float32Array {
  const o = new Float32Array(ps.reduce((n, p) => n + p.length, 0));
  let x = 0;
  for (const p of ps) {
    o.set(p, x);
    x += p.length;
  }
  return o;
}

function mezclar(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) o[i] = a[i] + (b[i] ?? 0);
  return o;
}

const opciones = { sampleRate: RATE };

describe('🎯 Ruido ambiental (S8-T2)', () => {
  it('DOCUMENTADO: el VAD por energía confunde ruido con habla', () => {
    // Limitación anotada desde S2-T3, aquí cuantificada. El mecanismo: con
    // ruido estacionario todas las tramas tienen casi la misma energía, así
    // que el piso estimado queda 25 dB por debajo por el tope de seguridad y
    // absolutamente todo supera el umbral.
    const soloRuido = preprocess(ruido(2 * RATE, 0.05), RATE);
    const segmentos = detectSpeech(soloRuido, opciones);

    const duracion = segmentos.reduce((t, s) => t + (s.endSample - s.startSample), 0) / RATE;
    expect(duracion).toBeGreaterThan(1.5); // detecta casi los 2 s como habla
  });

  it('la periodicidad separa voz de ruido con margen amplio', () => {
    const soloRuido = preprocess(ruido(2 * RATE, 0.05), RATE);
    const soloVoz = preprocess(voz(120, 2 * RATE), RATE);

    expect(voicedRatio(soloRuido, 0, soloRuido.length, opciones)).toBe(0);
    expect(voicedRatio(soloVoz, 0, soloVoz.length, opciones)).toBeGreaterThan(0.4);
  });

  it('el detector robusto descarta el ruido a cualquier nivel', () => {
    for (const nivel of [0.005, 0.05, 0.2, 0.5]) {
      const soloRuido = preprocess(ruido(2 * RATE, nivel), RATE);
      expect(detectVoicedSpeech(soloRuido, opciones)).toHaveLength(0);
    }
  });

  it('y sigue encontrando la voz que hay que encontrar', () => {
    const senal = preprocess(unir(new Float32Array(RATE / 2), voz(120, RATE), new Float32Array(RATE / 2)), RATE);
    const segmentos = detectVoicedSpeech(senal, opciones);

    expect(segmentos).toHaveLength(1);
    expect(segmentos[0].startTime).toBeCloseTo(0.5, 1);
  });

  it('encuentra la voz aunque haya ruido de fondo encima', () => {
    // Caso realista: se graba en un cuarto con ventilador.
    const conRuido = preprocess(
      mezclar(unir(new Float32Array(RATE / 2), voz(120, RATE), new Float32Array(RATE / 2)), ruido(2 * RATE, 0.02)),
      RATE
    );

    expect(detectVoicedSpeech(conRuido, opciones).length).toBeGreaterThanOrEqual(1);
  });

  it('DOCUMENTADO: un tono puro sostenido sí pasa el filtro', () => {
    // Limitación que sobrevive: un zumbido de 200 Hz es periódico, así que la
    // prueba de periodicidad no lo distingue de una vocal sostenida.
    // Distinguirlos exigiría mirar la estructura de formantes.
    const zumbido = preprocess(seno(200, 2 * RATE, 0.2), RATE);
    expect(detectVoicedSpeech(zumbido, opciones).length).toBeGreaterThan(0);
  });

  it('el recorte robusto no pierde audio si no detecta nada', () => {
    // Más vale mandar ruido al reconocedor que perder la frase del usuario.
    const soloRuido = preprocess(ruido(RATE, 0.05), RATE);
    expect(trimToVoicedSpeech(soloRuido, opciones).length).toBe(soloRuido.length);
  });
});

describe('Frases largas (S8-T2)', () => {
  it('el costo del DTW crece con el cuadrado, pero cabe en el presupuesto', () => {
    // 10 s de frase: 624x624 tramas. El presupuesto del proyecto es 2 s por
    // turno, y el comparador corre una sola vez por turno.
    const a = mfccSequence(voz(120, 10 * RATE), 512, 256, opciones);
    const b = mfccSequence(voz(140, 10 * RATE), 512, 256, opciones);

    const t0 = performance.now();
    const r = dtw(a, b, { bandRadius: defaultBandRadius(a.length, b.length) });
    const ms = performance.now() - t0;

    expect(a.length).toBeGreaterThan(600);
    expect(ms).toBeLessThan(500); // holgado: medido en ~18 ms
    expect(Number.isFinite(r.normalizedDistance)).toBe(true);
  });

  it('una frase larga no degrada el puntaje frente a una corta', () => {
    // La normalización por el largo del camino es lo que lo consigue: sin
    // ella, una frase larga acumularía más costo y puntuaría peor.
    const scorer = createPronunciationScorer();
    const analizar = (pcm: Float32Array) =>
      mfccSequence(pcm, 512, 256, opciones).map((m, i) => ({
        pcm: new Float32Array(0),
        fftDb: new Float32Array(0),
        pitchHz: null,
        energy: 0,
        mfcc: Array.from(m),
        t: (i * 256) / RATE,
      }));

    const corta = analizar(voz(120, RATE));
    const larga = analizar(voz(120, 8 * RATE));

    return Promise.all([
      scorer.score(corta, corta, []),
      scorer.score(larga, larga, []),
    ]).then(([a, b]) => {
      expect(a.overall).toBeCloseTo(b.overall, 0);
    });
  });

  it('el VAD separa frases dentro de una grabación larga', () => {
    // Tres frases con pausas de 1 s: tienen que salir tres segmentos.
    const pausa = () => new Float32Array(RATE);
    const senal = preprocess(
      unir(pausa(), voz(120, RATE), pausa(), voz(140, RATE), pausa(), voz(110, RATE), pausa()),
      RATE
    );

    expect(detectVoicedSpeech(senal, opciones)).toHaveLength(3);
  });
});

describe('Silencios y señales degeneradas (S8-T2)', () => {
  const degenerados: [string, Float32Array][] = [
    ['todo ceros', new Float32Array(RATE)],
    ['más corta que un frame', voz(120, 100)],
    ['una sola muestra', new Float32Array(1)],
    ['vacía', new Float32Array(0)],
    ['saturada en 1.0', new Float32Array(RATE).fill(1)],
    ['continua pura', new Float32Array(RATE).fill(0.5)],
  ];

  for (const [nombre, senal] of degenerados) {
    it(`no rompe ni produce NaN con: ${nombre}`, () => {
      const p = preprocess(senal, RATE);

      expect(Array.from(p).every(Number.isFinite)).toBe(true);
      expect(() => detectSpeech(p, opciones)).not.toThrow();
      expect(() => trimToSpeech(p, opciones)).not.toThrow();
      expect(() => detectVoicedSpeech(p, opciones)).not.toThrow();

      for (const trama of mfccSequence(p, 512, 256, opciones)) {
        expect(Array.from(trama).every(Number.isFinite)).toBe(true);
      }
      expect(() => resample(senal, 48000, 16000)).not.toThrow();
    });
  }

  it('el silencio no produce segmentos de habla', () => {
    expect(detectVoicedSpeech(preprocess(new Float32Array(2 * RATE), RATE), opciones)).toHaveLength(0);
  });

  it('la continua pura se elimina y no se detecta como habla', () => {
    // El pasa-altas de 80 Hz la quita por completo: no queda energía.
    const p = preprocess(new Float32Array(RATE).fill(0.5), RATE);
    expect(detectSpeech(p, opciones)).toHaveLength(0);
  });

  it('una señal saturada no produce tono ni coeficientes inválidos', () => {
    const p = preprocess(new Float32Array(RATE).fill(1), RATE);

    expect(detectPitchYin(p.subarray(0, 512), opciones)).toBeNull();
    for (const trama of mfccSequence(p, 512, 256, opciones)) {
      expect(Array.from(trama).every(Number.isFinite)).toBe(true);
    }
  });

  it('el comparador con audio vacío devuelve cero, no NaN', async () => {
    const scorer = createPronunciationScorer();
    const r = await scorer.score([], [], []);

    expect(r.overall).toBe(0);
    expect(Number.isFinite(r.dtwDistance)).toBe(true);
  });
});
