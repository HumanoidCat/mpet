import { describe, it, expect } from 'vitest';
import { createMockScorer } from '../../mocks/mockScorer';

describe('Mock PronunciationScorer (contrato)', () => {
  it('devuelve puntaje 0-100 global y por palabra', async () => {
    const scorer = createMockScorer();
    const words = [
      { word: 'hello', start: 0, end: 0.4 },
      { word: 'world', start: 0.4, end: 0.9 },
    ];
    const r = await scorer.score([], [], words);
    expect(r.overall).toBeGreaterThanOrEqual(0);
    expect(r.overall).toBeLessThanOrEqual(100);
    expect(r.words).toHaveLength(2);
  });
});
