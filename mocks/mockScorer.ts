import type { PronunciationScorer } from '@shared/contracts';

/** Mock del comparador acústico (dueño real: Fabrizio). */
export function createMockScorer(): PronunciationScorer {
  return {
    async score(_user, _reference, words) {
      const scored = words.map((w, i) => ({ ...w, score: i === 1 ? 45 : 80 + (i % 3) * 5 }));
      const overall = Math.round(scored.reduce((a, w) => a + w.score, 0) / scored.length);
      return { overall, words: scored, dtwDistance: 12.34 };
    },
  };
}
