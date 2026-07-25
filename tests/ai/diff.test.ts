import { describe, it, expect } from 'vitest';
import { diffWords, classifyEdit, normalize, tokenize } from '../../src/ai/grammar/diff';

/**
 * S3-T3 · Tests del diff palabra a palabra.
 * Lógica pura: no necesita modelo ni navegador.
 */
describe('diffWords', () => {
  it('detecta una sustitución y su posición en el texto original', () => {
    const edits = diffWords('I goed to the store', 'I went to the store');
    expect(edits).toHaveLength(1);
    expect(edits[0]).toEqual({
      index: 1,
      original: 'goed',
      corrected: 'went',
      type: 'grammar',
    });
  });

  it('no reporta cambios cuando el texto ya es correcto', () => {
    expect(diffWords('I went to the store', 'I went to the store')).toEqual([]);
  });

  it('clasifica como ortografía cuando las palabras se parecen', () => {
    const edits = diffWords('I recieve it', 'I receive it');
    expect(edits).toHaveLength(1);
    expect(edits[0].type).toBe('spelling');
  });

  it('detecta una palabra insertada', () => {
    const edits = diffWords('I go school', 'I go to school');
    expect(edits).toHaveLength(1);
    expect(edits[0].original).toBe('');
    expect(edits[0].corrected).toBe('to');
    expect(edits[0].index).toBe(2); // se inserta antes de "school"
  });

  it('detecta una palabra eliminada', () => {
    const edits = diffWords('I have has it', 'I have it');
    expect(edits).toHaveLength(1);
    expect(edits[0].original).toBe('has');
    expect(edits[0].corrected).toBe('');
    expect(edits[0].index).toBe(2);
  });

  it('agrupa un bloque contiguo emparejando sustituciones', () => {
    const edits = diffWords('she do not likes it', 'she does not like it');
    // "do"->"does" (índice 1) y "likes"->"like" (índice 3)
    expect(edits).toHaveLength(2);
    expect(edits[0]).toMatchObject({ index: 1, original: 'do', corrected: 'does' });
    expect(edits[1]).toMatchObject({ index: 3, original: 'likes', corrected: 'like' });
  });

  it('ignora diferencias de mayúsculas y puntuación', () => {
    // Decisión documentada en diff.ts: evita inundar la UI de marcas triviales.
    expect(diffWords('hello world', 'Hello world.')).toEqual([]);
  });

  it('maneja texto vacío sin romperse', () => {
    expect(diffWords('', '')).toEqual([]);
    expect(diffWords('', 'hello')).toHaveLength(1);
  });
});

describe('classifyEdit', () => {
  it('trata inserciones y eliminaciones como gramática', () => {
    expect(classifyEdit('', 'to')).toBe('grammar');
    expect(classifyEdit('has', '')).toBe('grammar');
  });

  it('distingue typo de cambio gramatical', () => {
    expect(classifyEdit('recieve', 'receive')).toBe('spelling');
    expect(classifyEdit('goed', 'went')).toBe('grammar');
  });

  // Casos reales que destapó el spike S3-T3: se parecen mucho entre sí, así que
  // la similitud sola los clasificaba mal como 'spelling'.
  it('trata las palabras funcionales como gramática aunque se parezcan', () => {
    expect(classifyEdit("don't", "doesn't")).toBe('grammar');
    expect(classifyEdit('is', 'are')).toBe('grammar');
    expect(classifyEdit('have', 'has')).toBe('grammar');
  });

  it('trata el cambio de número (-s/-es) como gramática', () => {
    expect(classifyEdit('breads', 'bread')).toBe('grammar');
    expect(classifyEdit('box', 'boxes')).toBe('grammar');
  });
});

describe('utilidades', () => {
  it('tokenize numera las palabras en orden', () => {
    expect(tokenize('a b  c')).toEqual([
      { word: 'a', index: 0 },
      { word: 'b', index: 1 },
      { word: 'c', index: 2 },
    ]);
  });

  it('normalize quita puntuación de los extremos y baja a minúsculas', () => {
    expect(normalize('Hello,')).toBe('hello');
    expect(normalize('"world".')).toBe('world');
    expect(normalize("don't")).toBe("don't");
  });
});
