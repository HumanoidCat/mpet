/**
 * I-07 · Tests de la conversión de números a letras antes de sintetizar.
 *
 * DE DÓNDE SALE: el conteo de pronunciación (S7-T4) midió que MMS-TTS no dice cifras.
 * Con `$25` el reconocedor no oyó un número equivocado sino nada, tres de tres veces.
 * Como precios, horas y fechas son contenido básico de una clase de inglés, el hueco
 * mudo caía justo en lo que el estudiante tenía que aprender.
 */

import { describe, expect, it } from 'vitest';
import {
  anioEnLetras,
  normalizeForSpeech,
  numeroEnLetras,
  ordinalEnLetras,
} from '../../src/ai/tts/textNormalization';

describe('numeroEnLetras', () => {
  it('cubre los casos que el inglés escribe distinto', () => {
    expect(numeroEnLetras(0)).toBe('zero');
    expect(numeroEnLetras(7)).toBe('seven');
    expect(numeroEnLetras(13)).toBe('thirteen'); // los adolescentes son irregulares
    expect(numeroEnLetras(20)).toBe('twenty');
    expect(numeroEnLetras(25)).toBe('twenty-five');
    expect(numeroEnLetras(100)).toBe('one hundred');
    expect(numeroEnLetras(101)).toBe('one hundred one');
    expect(numeroEnLetras(999)).toBe('nine hundred ninety-nine');
  });

  it('arma miles y millones', () => {
    expect(numeroEnLetras(1000)).toBe('one thousand');
    expect(numeroEnLetras(2500)).toBe('two thousand five hundred');
    expect(numeroEnLetras(1_000_000)).toBe('one million');
  });

  it('deja pasar lo que no sabe decir en vez de inventar', () => {
    // Fuera de alcance declarado. Devolver la cifra es peor que decirla, pero mucho
    // mejor que decir algo incorrecto con seguridad.
    expect(numeroEnLetras(1_000_000_000)).toBe('1000000000');
  });

  it('maneja negativos', () => {
    expect(numeroEnLetras(-5)).toBe('minus five');
  });
});

describe('ordinalEnLetras', () => {
  it('respeta los ordinales irregulares', () => {
    expect(ordinalEnLetras(1)).toBe('first');
    expect(ordinalEnLetras(2)).toBe('second');
    expect(ordinalEnLetras(3)).toBe('third');
    expect(ordinalEnLetras(5)).toBe('fifth');
    expect(ordinalEnLetras(9)).toBe('ninth');
    expect(ordinalEnLetras(12)).toBe('twelfth');
  });

  it('solo cambia la última palabra en los compuestos', () => {
    expect(ordinalEnLetras(21)).toBe('twenty-first');
    expect(ordinalEnLetras(23)).toBe('twenty-third');
  });

  it('convierte las decenas terminadas en y', () => {
    expect(ordinalEnLetras(20)).toBe('twentieth');
    expect(ordinalEnLetras(30)).toBe('thirtieth');
  });

  it('usa th para los regulares', () => {
    expect(ordinalEnLetras(4)).toBe('fourth');
    expect(ordinalEnLetras(11)).toBe('eleventh');
  });
});

describe('anioEnLetras', () => {
  it('parte el año por la mitad, como se habla', () => {
    // Nadie dice "one thousand nine hundred ninety-eight" hablando.
    expect(anioEnLetras(1998)).toBe('nineteen ninety-eight');
    expect(anioEnLetras(1850)).toBe('eighteen fifty');
  });

  it('dice "oh" en los años terminados en cifra baja', () => {
    expect(anioEnLetras(1905)).toBe('nineteen oh five');
  });

  it('dice los siglos redondos como siglos', () => {
    expect(anioEnLetras(1900)).toBe('nineteen hundred');
  });

  it('los años 2000 a 2009 se dicen enteros', () => {
    expect(anioEnLetras(2005)).toBe('two thousand five');
  });

  it('vuelve a partir por mitades a partir de 2010', () => {
    expect(anioEnLetras(2026)).toBe('twenty twenty-six');
  });
});

describe('normalizeForSpeech', () => {
  it('resuelve el caso que originó todo', () => {
    // La frase exacta del banco de pruebas de S7-T4, donde no se oía nada.
    expect(normalizeForSpeech('It costs $25 and starts at 8:30 in the morning.')).toBe(
      'It costs twenty-five dollars and starts at eight thirty in the morning.'
    );
  });

  it('dice el dinero con sus centavos', () => {
    expect(normalizeForSpeech('$1.50')).toBe('one dollar fifty cents');
    expect(normalizeForSpeech('$1')).toBe('one dollar'); // singular
    expect(normalizeForSpeech('$25.05')).toBe('twenty-five dollars five cents');
  });

  it('reconoce el dinero ANTES que los decimales', () => {
    // Si el orden de las reglas se invirtiera, saldría "twenty-five point five zero".
    expect(normalizeForSpeech('It costs $25.50')).toBe(
      'It costs twenty-five dollars fifty cents'
    );
  });

  it('dice las horas como se hablan', () => {
    expect(normalizeForSpeech('at 8:00')).toBe("at eight o'clock");
    expect(normalizeForSpeech('at 8:05')).toBe('at eight oh five');
    expect(normalizeForSpeech('at 12:45')).toBe('at twelve forty-five');
  });

  it('no dice como hora lo que no es una hora, pero igual lo pronuncia', () => {
    // 25:60 no es una hora válida, así que no se dice "veinticinco en punto". Pero
    // los dígitos NO se dejan intactos: dejarlos sería dejar silencio, que es el
    // fallo que esta pieza existe para arreglar. La regla final de enteros actúa de
    // red: se oye "twenty-five sixty", que es imperfecto pero audible.
    expect(normalizeForSpeech('the score was 25:60')).toBe(
      'the score was twenty-five:sixty'
    );
  });

  it('convierte porcentajes y ordinales', () => {
    expect(normalizeForSpeech('50% of them')).toBe('fifty percent of them');
    expect(normalizeForSpeech('the 3rd of May')).toBe('the third of May');
    expect(normalizeForSpeech('my 21st birthday')).toBe('my twenty-first birthday');
  });

  it('dice los años como años', () => {
    expect(normalizeForSpeech('I was born in 1998.')).toBe(
      'I was born in nineteen ninety-eight.'
    );
  });

  it('dice los decimales dígito a dígito', () => {
    expect(normalizeForSpeech('pi is 3.14')).toBe('pi is three point one four');
  });

  it('deja intacto un texto sin números', () => {
    const frase = 'I went to the beach yesterday with my family.';
    expect(normalizeForSpeech(frase)).toBe(frase);
  });

  it('convierte varios números en la misma frase', () => {
    expect(normalizeForSpeech('I have 2 cats and 3 dogs.')).toBe(
      'I have two cats and three dogs.'
    );
  });
});
