/**
 * Deteccion de idioma en el turno escrito.
 *
 * QUE PROTEGE: de esta funcion dependen tres ramas del turno —si se corrige la
 * gramatica, si se sugiere, y como responde el tutor—. Un falso positivo de espanol
 * apaga la ayuda en un turno donde servia, y lo hace en silencio: no da error, el
 * estudiante solo ve que no le corrigieron nada.
 *
 * Por eso los casos de "no debe marcar espanol" son mas que los otros: es la
 * direccion en la que equivocarse cuesta caro.
 */

import { describe, expect, it } from 'vitest';
import { detectarIdiomaEscrito } from '../../src/core/idiomaEscrito';

describe('detectarIdiomaEscrito', () => {
  it.each([
    'Quiero hablar sobre mi trabajo',
    'Hola, ¿cómo estás?',
    'No sé cómo se dice esto en inglés',
    'Mi nombre es Ana y soy enfermera',
    'Necesito ayuda con la pronunciación',
    'El niño pequeño',
  ])('reconoce el espanol: %s', (texto) => {
    expect(detectarIdiomaEscrito(texto)).toBe('es');
  });

  it.each([
    'I want to talk about my job',
    'Hello, how are you?',
    'My name is Ana and I am a nurse',
    'I need help with pronunciation',
    'The small boy went to the store yesterday',
    'What do you think about that?',
    'Can you help me please',
  ])('reconoce el ingles: %s', (texto) => {
    expect(detectarIdiomaEscrito(texto)).toBe('en');
  });

  it('un solo caracter exclusivo del espanol decide', () => {
    // No hay forma razonable de que aparezca una enye en una frase en ingles.
    expect(detectarIdiomaEscrito('The word is niño')).toBe('es');
    expect(detectarIdiomaEscrito('¿Really?')).toBe('es');
  });

  it('NO marca espanol por un nombre propio en una frase inglesa', () => {
    // Sin las palabras inglesas de contrapeso, "la" y "paz" arrastrarian esto
    // hacia el espanol y se apagaria la correccion sin motivo.
    expect(detectarIdiomaEscrito('I live in La Paz and I like it')).toBe('en');
    expect(detectarIdiomaEscrito('My favorite food is paella')).toBe('en');
  });

  it('ante la duda responde ingles', () => {
    // Texto sin ninguna palabra de las listas: no hay evidencia, y la falta de
    // evidencia no es evidencia de espanol.
    expect(detectarIdiomaEscrito('xyz abc')).toBe('en');
    expect(detectarIdiomaEscrito('')).toBe('en');
    expect(detectarIdiomaEscrito('   ')).toBe('en');
    expect(detectarIdiomaEscrito('12345')).toBe('en');
  });

  it('un empate se resuelve hacia el ingles', () => {
    // "the" (en) contra "que" (es): uno y uno. Un empate es duda, y la duda va
    // al ingles porque equivocarse hacia el espanol apaga la ayuda en silencio.
    expect(detectarIdiomaEscrito('the que')).toBe('en');
  });

  it('no le afectan mayusculas ni puntuacion', () => {
    expect(detectarIdiomaEscrito('QUIERO HABLAR')).toBe('es');
    expect(detectarIdiomaEscrito('¡Quiero, hablar!')).toBe('es');
    expect(detectarIdiomaEscrito('I WANT TO TALK')).toBe('en');
  });
});
