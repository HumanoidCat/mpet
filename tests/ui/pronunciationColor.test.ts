import { describe, it, expect } from 'vitest';
import { scoreTier, scoreColor, TIER_COLOR } from '../../src/ui/feedback/pronunciationColor';

describe('scoreTier / scoreColor (S6-T3, umbrales de docs/04-plan-semanal.md)', () => {
  it('verde en >=80', () => {
    expect(scoreTier(80)).toBe('good');
    expect(scoreTier(100)).toBe('good');
    expect(scoreColor(80)).toBe(TIER_COLOR.good);
  });

  it('amarillo en 60-79', () => {
    expect(scoreTier(60)).toBe('ok');
    expect(scoreTier(79)).toBe('ok');
    expect(scoreColor(65)).toBe(TIER_COLOR.ok);
  });

  it('rojo en <60', () => {
    expect(scoreTier(59)).toBe('bad');
    expect(scoreTier(0)).toBe('bad');
    expect(scoreColor(10)).toBe(TIER_COLOR.bad);
  });
});
