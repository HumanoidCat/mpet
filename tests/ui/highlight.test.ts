import { describe, it, expect } from 'vitest';
import { buildSegments } from '../../src/ui/chat/highlight';
import type { Edit } from '../../src/shared/contracts';

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
