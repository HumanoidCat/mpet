/**
 * S6-T4 / S7-T2 · Tests de la construcción de prompts del tutor.
 *
 * QUÉ PROTEGEN: el prompt es lo único que separa "responde en una frase y preguntá
 * algo" de un párrafo interminable, y lo único que convierte un historial de chat en
 * algo que un T5 entiende. Un espacio de más o un rol mal escrito degrada la salida
 * sin dar ningún error, así que se fija aquí.
 */

import { describe, expect, it } from 'vitest';
import {
  HISTORY_TURNS,
  SUGGESTIONS_CONFIGS,
  SUGGESTION_PROMPTS,
  TUTOR_INSTRUCTION,
  buildSuggestionPrompt,
  buildTutorPrompt,
  getSuggestionsConfig,
} from '../../src/ai/suggestions/suggestionsProtocol';

describe('buildSuggestionPrompt', () => {
  it('pone la instrucción antes de la frase', () => {
    const p = SUGGESTION_PROMPTS[0];
    const out = buildSuggestionPrompt(p, 'I go to school.');

    expect(out.startsWith(p.instruction)).toBe(true);
    expect(out).toContain('Sentence: I go to school.');
  });

  it('cada prompt pide algo distinto', () => {
    // Si dos instrucciones fueran iguales, la lista de sugerencias tendría
    // entradas repetidas y el estudiante vería lo mismo dos veces.
    const instrucciones = SUGGESTION_PROMPTS.map((p) => p.instruction);
    expect(new Set(instrucciones).size).toBe(instrucciones.length);
  });

  it('todos los prompts piden solo la frase, sin explicaciones', () => {
    // Sin esto el modelo devuelve "Sure! Here is a better version: ..." y la
    // interfaz mostraría esa cháchara como si fuera la sugerencia.
    for (const p of SUGGESTION_PROMPTS) {
      expect(p.instruction.toLowerCase()).toContain('only');
    }
  });
});

describe('buildTutorPrompt', () => {
  const historia = [
    { role: 'user' as const, text: 'Hello.' },
    { role: 'tutor' as const, text: 'Hi! How are you?' },
    { role: 'user' as const, text: 'I am fine.' },
  ];

  it('traduce los roles a etiquetas que el modelo entiende', () => {
    const out = buildTutorPrompt(historia);
    expect(out).toContain('Student: Hello.');
    expect(out).toContain('Tutor: Hi! How are you?');
  });

  it('empieza con la instrucción y termina invitando a hablar al tutor', () => {
    const out = buildTutorPrompt(historia);
    expect(out.startsWith(TUTOR_INSTRUCTION)).toBe(true);
    // El prompt tiene que cortar en "Tutor:" para que el modelo complete ahí y no
    // se ponga a inventar también el turno del estudiante.
    expect(out.endsWith('\nTutor:')).toBe(true);
  });

  it('recorta el historial a los últimos turnos', () => {
    // La latencia crece con la entrada, y una conversación larga haría el prompt
    // enorme sin mejorar la respuesta.
    const larga = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'tutor') as 'user' | 'tutor',
      text: `mensaje ${i}`,
    }));
    const out = buildTutorPrompt(larga, 4);

    expect(out).toContain('mensaje 19');
    expect(out).toContain('mensaje 16');
    expect(out).not.toContain('mensaje 15');
  });

  it('aguanta un historial vacío sin romperse', () => {
    const out = buildTutorPrompt([]);
    expect(out).toContain(TUTOR_INSTRUCTION);
    expect(out.endsWith('Tutor:')).toBe(true);
  });

  it('usa 4 turnos por defecto', () => {
    expect(HISTORY_TURNS).toBe(4);
  });
});

describe('configuraciones', () => {
  it('compara exactamente los dos tamaños en juego', () => {
    expect(SUGGESTIONS_CONFIGS).toHaveLength(2);
    expect(getSuggestionsConfig('grande-248m').expectedMB).toBeGreaterThan(
      getSuggestionsConfig('pequeno-77m').expectedMB
    );
  });

  it('las dos usan q8: fp32 serían más de 1 GB', () => {
    expect(SUGGESTIONS_CONFIGS.every((c) => c.dtype === 'q8')).toBe(true);
  });

  it('falla con un identificador desconocido', () => {
    // @ts-expect-error se comprueba el error en tiempo de ejecución, no el tipo
    expect(() => getSuggestionsConfig('inventado')).toThrow();
  });
});
