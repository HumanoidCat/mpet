import { describe, it, expect } from 'vitest';
import { buildSegments, buildPronunciationSegments } from '../../src/ui/chat/highlight';
import type { Edit, WordScore } from '../../src/shared/contracts';

describe('buildSegments (S3-T4, highlights de gramatica)', () => {
  it('texto sin errores produce solo segmentos planos', () => {
    const segs = buildSegments('I went home', []);
    expect(segs).toHaveLength(3);
    expect(segs.every((s) => s.kind === 'plain')).toBe(true);
  });

  it('un error produce par tachado + correccion en su posicion', () => {
    const edits: Edit[] = [
      { index: 1, original: 'goed', corrected: 'went', type: 'grammar' },
    ];
    const segs = buildSegments('I goed home', edits);
    expect(segs).toHaveLength(4);
    expect(segs[0]).toEqual({ kind: 'plain', text: 'I' });
    expect(segs[1]).toEqual({ kind: 'error', text: 'goed' });
    expect(segs[2]).toEqual({ kind: 'fix', text: 'went' });
    expect(segs[3]).toEqual({ kind: 'plain', text: 'home' });
  });

  it('multiples errores se resaltan todos', () => {
    const edits: Edit[] = [
      { index: 0, original: 'Me', corrected: 'I', type: 'grammar' },
      { index: 2, original: 'runned', corrected: 'ran', type: 'grammar' },
    ];
    const segs = buildSegments('Me have runned', edits);
    const errors = segs.filter((s) => s.kind === 'error');
    const fixes = segs.filter((s) => s.kind === 'fix');
    expect(errors).toHaveLength(2);
    expect(fixes.map((f) => f.text)).toEqual(['I', 'ran']);
  });

  it('maneja espacios multiples sin romper indices', () => {
    const edits: Edit[] = [
      { index: 1, original: 'goed', corrected: 'went', type: 'grammar' },
    ];
    const segs = buildSegments('I  goed   home', edits);
    expect(segs[1].kind).toBe('error');
  });
});

describe('buildPronunciationSegments (S6-T3, puntaje por palabra en el chat)', () => {
  function word(word: string, score: number): WordScore {
    return { word, start: 0, end: 0, score };
  }

  it('empareja cada palabra del texto con su puntaje por posicion', () => {
    const words: WordScore[] = [word('I', 90), word('went', 45), word('home', 80)];
    const segs = buildPronunciationSegments('I went home', words);
    expect(segs).toEqual([
      { text: 'I', score: 90 },
      { text: 'went', score: 45 },
      { text: 'home', score: 80 },
    ]);
  });

  it('palabras del texto sin puntaje quedan en null en vez de romper', () => {
    const words: WordScore[] = [word('I', 90)];
    const segs = buildPronunciationSegments('I went home', words);
    expect(segs[0]).toEqual({ text: 'I', score: 90 });
    expect(segs[1]).toEqual({ text: 'went', score: null });
    expect(segs[2]).toEqual({ text: 'home', score: null });
  });

  it('maneja espacios multiples sin romper indices', () => {
    const words: WordScore[] = [word('I', 90), word('went', 45)];
    const segs = buildPronunciationSegments('I   went', words);
    expect(segs).toHaveLength(2);
    expect(segs[1].score).toBe(45);
  });
});
