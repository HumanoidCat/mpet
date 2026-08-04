/**
 * S4-T5 · Vector de voz embebido para SpeechT5 (solo lo usa el spike).
 *
 * QUÉ PROTEGE ESTE TEST: el vector va guardado como texto en base64 dentro del
 * código. Un carácter perdido en un merge, un reformateo automático o un salto de
 * línea mal metido no darían error de compilación: darían una voz distinta, o
 * ruido. Como de este vector dependen las mediciones de SpeechT5 que quedaron
 * documentadas en la evidencia, el test las mantiene reproducibles.
 */

import { describe, expect, it } from 'vitest';
import {
  SPEAKER_EMBEDDING_DIM,
  loadSpeakerEmbedding,
} from '../../src/ai/spike-s4-t5/speakerEmbedding';

describe('Vector de voz de SpeechT5 (S4-T5)', () => {
  it('tiene los 512 valores que espera el modelo', () => {
    const vec = loadSpeakerEmbedding();
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(SPEAKER_EMBEDDING_DIM);
  });

  it('conserva la norma L2 = 1 del x-vector original', () => {
    // Los x-vectors de SpeechBrain vienen normalizados. Si la decodificación se
    // corrompiera (base64 truncado, orden de bytes equivocado), la norma se iría
    // lejos de 1 aunque la longitud siguiera cuadrando.
    const vec = loadSpeakerEmbedding();
    const norm = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
    expect(norm).toBeCloseTo(1, 4);
  });

  it('empieza con los valores exactos del archivo descargado del Hub', () => {
    // Huella digital: comparación contra los primeros valores leídos del
    // `speaker_embeddings.bin` original. Detecta que el vector se haya sustituido
    // por otro (otra voz) sin actualizar la documentación.
    const vec = loadSpeakerEmbedding();
    expect(vec[0]).toBeCloseTo(-0.07573085, 7);
    expect(vec[1]).toBeCloseTo(-0.02737029, 7);
    expect(vec[2]).toBeCloseTo(0.01493302, 7);
  });

  it('no devuelve valores no finitos', () => {
    // Un NaN dentro del vector se propaga a todo el espectrograma y produce
    // silencio absoluto, que es difícil de diagnosticar escuchando.
    const vec = loadSpeakerEmbedding();
    expect(vec.every((v) => Number.isFinite(v))).toBe(true);
  });
});
