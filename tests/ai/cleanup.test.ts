/**
 * S6-T4 / S7-T2 · Tests de la limpieza de salidas del modelo del tutor.
 *
 * Cada caso de aquí nació de una salida real del spike S6-T4, no de imaginar qué
 * podría pasar. Son los dos defectos que llegarían a la pantalla del estudiante si
 * el worker devolviera el texto del modelo tal cual.
 */

import { describe, expect, it } from 'vitest';
import {
  cleanSuggestions,
  cleanTutorReply,
  isSameSentence,
  stripWrappingQuotes,
} from '../../src/ai/suggestions/cleanup';

describe('stripWrappingQuotes', () => {
  it('quita las comillas que envuelven la respuesta', () => {
    // Salida literal del spike: el modelo devolvió las comillas dentro del texto.
    expect(stripWrappingQuotes('"What do you want to achieve with your English?"')).toBe(
      'What do you want to achieve with your English?'
    );
  });

  it('conserva las comillas que forman parte de la frase', () => {
    expect(stripWrappingQuotes('He said "hello" to me.')).toBe('He said "hello" to me.');
  });

  it('quita comillas anidadas', () => {
    expect(stripWrappingQuotes('"\'Hello\'"')).toBe('Hello');
  });

  it('quita también las comillas tipográficas', () => {
    expect(stripWrappingQuotes('“Good morning”')).toBe('Good morning');
  });

  it('no toca una frase sin comillas', () => {
    expect(stripWrappingQuotes('  What is your favorite food?  ')).toBe(
      'What is your favorite food?'
    );
  });

  it('aguanta una comilla suelta sin comerse nada', () => {
    expect(stripWrappingQuotes('"unbalanced')).toBe('"unbalanced');
  });
});

describe('isSameSentence', () => {
  it('ignora mayúsculas, espacios de más y el punto final', () => {
    expect(isSameSentence('I went to the beach', 'i went to the  beach.')).toBe(true);
  });

  it('distingue frases que de verdad cambian', () => {
    expect(
      isSameSentence(
        'I went to the beach yesterday with my family.',
        'Yesterday, I went to the beach with my family.'
      )
    ).toBe(false);
  });
});

describe('cleanSuggestions', () => {
  const original = 'My favorite food is rice with chicken.';

  it('descarta la sugerencia que repite la frase del estudiante', () => {
    // El caso más frecuente del spike: 5 de 8 devolvieron la frase sin tocar.
    const out = cleanSuggestions(original, [original, 'I love rice with chicken.']);
    expect(out).toEqual(['I love rice with chicken.']);
  });

  it('devuelve lista vacía cuando no hay nada que mejorar', () => {
    // Es un resultado honesto, no un error: la interfaz no muestra nada.
    expect(cleanSuggestions(original, [original, `"${original}"`])).toEqual([]);
  });

  it('quita las comillas de cada sugerencia', () => {
    const out = cleanSuggestions(original, ['"I adore rice with chicken."']);
    expect(out).toEqual(['I adore rice with chicken.']);
  });

  it('descarta las repetidas entre sí', () => {
    // Los dos prompts pueden llegar a la misma reescritura.
    const out = cleanSuggestions(original, ['I love rice.', 'i love rice']);
    expect(out).toEqual(['I love rice.']);
  });

  it('descarta las vacías', () => {
    expect(cleanSuggestions(original, ['', '   ', '""'])).toEqual([]);
  });

  it('conserva el orden de los prompts', () => {
    // El orden importa: la primera sugerencia es la de naturalidad y la segunda la
    // de vocabulario, y la interfaz las etiqueta por posición.
    const out = cleanSuggestions(original, ['Natural version.', 'Fancy version.']);
    expect(out).toEqual(['Natural version.', 'Fancy version.']);
  });
});

describe('cleanTutorReply', () => {
  it('quita comillas y junta los saltos de línea', () => {
    expect(cleanTutorReply('"That sounds great!\nWhat did you do there?"')).toBe(
      'That sounds great! What did you do there?'
    );
  });

  it('deja intacta una respuesta ya limpia', () => {
    expect(cleanTutorReply('What did you do yesterday?')).toBe('What did you do yesterday?');
  });
});
