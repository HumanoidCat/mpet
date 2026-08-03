/**
 * S6-T2 — Pruebas del evaluador de pronunciación.
 *
 * Las señales son **frases de varias vocales**, no vocales sostenidas. Importa:
 * la normalización cepstral resta la media del enunciado, así que sobre un
 * sonido sostenido borraría toda la información. Un sonido sostenido tampoco es
 * el caso de uso — el evaluador compara palabras y frases.
 *
 * La métrica de RF-10 es que el puntaje discrimine casos por más de 20 puntos.
 */

import { describe, it, expect } from 'vitest';
import type { AudioFrame, WordAlign } from '../../src/shared/contracts';
import { mfccSequence, cepstralMeanNormalize } from '../../src/audio/features/mfcc';
import {
  createPronunciationScorer,
  distanceToScore,
  frameRangeForWord,
  defaultBandRadius,
  SCORE_SCALE,
} from '../../src/audio/comparator/scorer';

const RATE = 16000;
const FRAME = 512;
const HOP = 256;

/** Formantes aproximados de tres vocales. */
const A = [700, 1200, 2600];
const I = [300, 2300, 3000];
const U = [350, 800, 2400];

const SEG = 4000; // muestras por vocal (~250 ms)

function seno(f: number, n: number, amp = 1): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * f * i) / RATE);
  return out;
}

function vocal(f0: number, formantes: number[], n: number, amp = 1): Float32Array {
  const out = new Float32Array(n);
  for (let k = 1; k * f0 < RATE / 2; k++) {
    const f = f0 * k;
    let g = 0.05;
    for (const F of formantes) g += 1 / (1 + Math.pow((f - F) / 100, 2));
    const h = seno(f, n, amp * g);
    for (let i = 0; i < n; i++) out[i] += h[i];
  }
  return out;
}

function unir(...partes: Float32Array[]): Float32Array {
  const out = new Float32Array(partes.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of partes) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** "Frase": una secuencia de vocales, como una palabra real. */
function frase(f0: number, vocales: number[][], amp = 1, duracion = SEG): Float32Array {
  return unir(...vocales.map((v) => vocal(f0, v, duracion, amp)));
}

/** Convierte PCM en los `AudioFrame` que consume el contrato. */
function analizar(pcm: Float32Array): AudioFrame[] {
  const mfccs = mfccSequence(pcm, FRAME, HOP, { sampleRate: RATE });
  return mfccs.map((mfcc, i) => ({
    pcm: new Float32Array(0),
    fftDb: new Float32Array(0),
    pitchHz: null,
    energy: 0,
    mfcc: Array.from(mfcc),
    t: (i * HOP + FRAME / 2) / RATE,
  }));
}

const scorer = createPronunciationScorer();

describe('Curva distancia → puntaje (S6-T2)', () => {
  it('la distancia cero da 100', () => {
    expect(distanceToScore(0)).toBeCloseTo(100, 6);
  });

  it('decrece de forma monótona y nunca sale de [0, 100]', () => {
    let anterior = 101;
    for (const d of [0, 1, 5, 10, 20, 50, 200, 1000]) {
      const s = distanceToScore(d);
      expect(s).toBeLessThan(anterior);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
      anterior = s;
    }
  });

  it('una distancia infinita da cero, no NaN', () => {
    expect(distanceToScore(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('la escala controla la exigencia', () => {
    // Con escala menor, la misma distancia puntúa peor.
    expect(distanceToScore(10, 5)).toBeLessThan(distanceToScore(10, 40));
  });

  it('cae más rápido cerca de cero que lejos', () => {
    // Es la razón de usar exponencial: distinguir bien entre lo muy bueno y lo
    // bueno importa más que entre lo malo y lo peor.
    const cercaDeCero = distanceToScore(0) - distanceToScore(5);
    const lejos = distanceToScore(40) - distanceToScore(45);
    expect(cercaDeCero).toBeGreaterThan(lejos * 3);
  });
});

describe('Normalización cepstral (S6-T2)', () => {
  it('deja la media de cada coeficiente en cero', () => {
    const secuencia = mfccSequence(frase(120, [A, I, U]), FRAME, HOP, { sampleRate: RATE });
    const normalizada = cepstralMeanNormalize(secuencia);

    for (let k = 0; k < normalizada[0].length; k++) {
      let suma = 0;
      for (const t of normalizada) suma += t[k];
      expect(suma / normalizada.length).toBeCloseTo(0, 3);
    }
  });

  it('conserva la variación dentro del enunciado', () => {
    // Lo que se resta es la componente constante, no la que cambia entre
    // fonemas — que es justamente la información útil.
    const secuencia = mfccSequence(frase(120, [A, I, U]), FRAME, HOP, { sampleRate: RATE });
    const normalizada = cepstralMeanNormalize(secuencia);

    const rango = (s: Float32Array[], k: number) => {
      const vs = s.map((t) => t[k]);
      return Math.max(...vs) - Math.min(...vs);
    };
    expect(rango(normalizada, 2)).toBeCloseTo(rango(secuencia, 2), 3);
  });

  it('una secuencia vacía no rompe nada', () => {
    expect(cepstralMeanNormalize([])).toEqual([]);
  });
});

describe('🎯 Puntaje global: lo que exige RF-10', () => {
  const referencia = analizar(frase(120, [A, I, U]));

  it('la pronunciación idéntica da 100', async () => {
    const r = await scorer.score(referencia, referencia, []);
    expect(r.overall).toBeCloseTo(100, 1);
  });

  it('hablar más fuerte no cambia el puntaje', async () => {
    const masFuerte = analizar(frase(120, [A, I, U], 1.5));
    const r = await scorer.score(masFuerte, referencia, []);
    expect(r.overall).toBeGreaterThan(95);
  });

  it('hablar más despacio no cambia el puntaje', async () => {
    // La misma frase con vocales un 50 % más largas: lo absorbe la DTW.
    const masLento = analizar(frase(120, [A, I, U], 1, Math.round(SEG * 1.5)));
    const r = await scorer.score(masLento, referencia, []);
    expect(r.overall).toBeGreaterThan(90);
  });

  it('otra voz que pronuncia bien sigue puntuando alto', async () => {
    // El caso decisivo: la referencia siempre es un TTS, o sea otra voz.
    const otraVoz = analizar(frase(180, [A, I, U]));
    const muyOtraVoz = analizar(frase(220, [A, I, U]));

    expect((await scorer.score(otraVoz, referencia, [])).overall).toBeGreaterThan(70);
    expect((await scorer.score(muyOtraVoz, referencia, [])).overall).toBeGreaterThan(65);
  });

  it('pronunciar otra cosa baja el puntaje', async () => {
    const otroTexto = analizar(frase(120, [A, U, I])); // vocales intercambiadas
    expect((await scorer.score(otroTexto, referencia, [])).overall).toBeLessThan(50);
  });

  it('MÉTRICA RF-10: separa bien de mal por más de 20 puntos', async () => {
    // Peor caso de "bien pronunciado": otra voz bastante distinta.
    const peorBien = (await scorer.score(analizar(frase(220, [A, I, U])), referencia, [])).overall;
    // Mejor caso de "mal pronunciado": texto distinto, misma voz.
    const mejorMal = (await scorer.score(analizar(frase(120, [A, U, I])), referencia, [])).overall;

    expect(peorBien - mejorMal).toBeGreaterThan(20);
  });

  it('sin normalización cepstral las dos clases se solapan', async () => {
    // Documenta por qué la CMN no es opcional en este proyecto.
    const sinCmn = createPronunciationScorer({ cepstralMeanNormalization: false });

    const bienOtraVoz = (await sinCmn.score(analizar(frase(220, [A, I, U])), referencia, []))
      .overall;
    const malMismaVoz = (await sinCmn.score(analizar(frase(120, [A, U, I])), referencia, []))
      .overall;

    // Sin CMN, pronunciar BIEN con otra voz puntúa PEOR que pronunciar mal.
    expect(bienOtraVoz).toBeLessThan(malMismaVoz);
  });
});

describe('Puntaje por palabra (S6-T2)', () => {
  const palabras: WordAlign[] = [
    { word: 'one', start: 0.0, end: 0.25 },
    { word: 'two', start: 0.25, end: 0.5 },
    { word: 'three', start: 0.5, end: 0.75 },
  ];

  it('devuelve un puntaje por cada palabra recibida', async () => {
    const señal = analizar(frase(120, [A, I, U]));
    const r = await scorer.score(señal, señal, palabras);

    expect(r.words).toHaveLength(3);
    expect(r.words.map((w) => w.word)).toEqual(['one', 'two', 'three']);
    for (const w of r.words) expect(w.score).toBeCloseTo(100, 0);
  });

  it('conserva los tiempos que vinieron del reconocedor', async () => {
    const señal = analizar(frase(120, [A, I, U]));
    const r = await scorer.score(señal, señal, palabras);

    expect(r.words[1].start).toBe(0.25);
    expect(r.words[1].end).toBe(0.5);
  });

  it('una palabra mal pronunciada no arrastra a las demás', async () => {
    // La referencia dice a-i-u; el usuario dice a-A-u: solo falla la del medio.
    const referencia = analizar(frase(120, [A, I, U]));
    const usuario = analizar(frase(120, [A, A, U]));

    const r = await scorer.score(usuario, referencia, palabras);

    // La segunda palabra puntúa claramente peor que la primera.
    expect(r.words[1].score).toBeLessThan(r.words[0].score);
  });

  it('sin palabras devuelve la lista vacía pero el puntaje global', async () => {
    const señal = analizar(frase(120, [A, I, U]));
    const r = await scorer.score(señal, señal, []);

    expect(r.words).toEqual([]);
    expect(r.overall).toBeCloseTo(100, 1);
  });

  it('una palabra fuera del rango de tiempo no recibe cero', async () => {
    // Un timestamp raro del ASR no debe castigar al usuario.
    const señal = analizar(frase(120, [A, I, U]));
    const fuera: WordAlign[] = [{ word: 'ghost', start: 99, end: 100 }];

    const r = await scorer.score(señal, señal, fuera);
    expect(r.words[0].score).toBeCloseTo(r.overall, 6);
  });
});

describe('Mapeo de palabras a tramas (S6-T2)', () => {
  const frames = analizar(frase(120, [A, I, U]));

  it('encuentra las tramas dentro del intervalo', () => {
    const { from, to } = frameRangeForWord(frames, { word: 'x', start: 0.25, end: 0.5 });

    expect(to).toBeGreaterThan(from);
    expect(frames[from].t).toBeGreaterThanOrEqual(0.25);
    expect(frames[to - 1].t).toBeLessThan(0.5);
  });

  it('un intervalo sin tramas devuelve un rango vacío', () => {
    const { from, to } = frameRangeForWord(frames, { word: 'x', start: 50, end: 60 });
    expect(to).toBe(from);
  });
});

describe('Casos límite y configuración (S6-T2)', () => {
  it('sin audio no se inventa un puntaje', async () => {
    const señal = analizar(frase(120, [A, I, U]));

    const sinUsuario = await scorer.score([], señal, [{ word: 'a', start: 0, end: 1 }]);
    expect(sinUsuario.overall).toBe(0);
    expect(sinUsuario.words[0].score).toBe(0);

    expect((await scorer.score(señal, [], [])).overall).toBe(0);
  });

  it('reporta la distancia DTW cruda para depuración', async () => {
    const señal = analizar(frase(120, [A, I, U]));
    const r = await scorer.score(señal, señal, []);

    expect(r.dtwDistance).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(r.dtwDistance)).toBe(true);
  });

  it('la escala se puede ajustar', async () => {
    const referencia = analizar(frase(120, [A, I, U]));
    const otro = analizar(frase(120, [A, U, I]));

    const exigente = createPronunciationScorer({ scale: 5 });
    const indulgente = createPronunciationScorer({ scale: 60 });

    const a = (await exigente.score(otro, referencia, [])).overall;
    const b = (await indulgente.score(otro, referencia, [])).overall;
    expect(a).toBeLessThan(b);
  });

  it('el radio de banda por defecto crece con la frase', () => {
    expect(defaultBandRadius(10, 10)).toBe(10); // mínimo
    expect(defaultBandRadius(200, 200)).toBe(30); // 15 %
    expect(defaultBandRadius(100, 400)).toBe(60); // usa la más larga
  });

  it('la constante de escala es la calibrada', () => {
    expect(SCORE_SCALE).toBe(20);
  });
});
