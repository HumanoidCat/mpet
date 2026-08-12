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

  it('traduce los turnos del estudiante a la etiqueta que el modelo entiende', () => {
    const out = buildTutorPrompt(historia);
    expect(out).toContain('Student: Hello.');
    expect(out).toContain('Student: I am fine.');
  });

  // Regresión de incidencia I-09 (11-ago-2026): en producción, con dos turnos o
  // más, el modelo copiaba la última línea "Tutor: ..." del prompt en vez de
  // generar una respuesta nueva, y devolvía siempre la misma frase sin importar
  // lo que dijera el estudiante. La causa era que el prompt incluía las
  // respuestas anteriores del propio tutor. Este caso falla si alguien vuelve a
  // incluirlas.
  it('no incluye las respuestas anteriores del tutor en el prompt', () => {
    const out = buildTutorPrompt(historia);
    expect(out).not.toContain('Tutor: Hi! How are you?');
    // La única aparición de "Tutor:" debe ser el corte final donde el modelo
    // tiene que completar, no una línea con contenido detrás.
    const apariciones = out.split('Tutor:').length - 1;
    expect(apariciones).toBe(1);
  });

  it('empieza con la instrucción y termina invitando a hablar al tutor', () => {
    const out = buildTutorPrompt(historia);
    expect(out.startsWith(TUTOR_INSTRUCTION)).toBe(true);
    // El prompt tiene que cortar en "Tutor:" para que el modelo complete ahí y no
    // se ponga a inventar también el turno del estudiante.
    expect(out.endsWith('\nTutor:')).toBe(true);
  });

  it('recorta el historial a los últimos turnos antes de filtrar por rol', () => {
    // La latencia crece con la entrada, y una conversación larga haría el prompt
    // enorme sin mejorar la respuesta. El recorte se aplica sobre el historial
    // completo (con ambos roles) y después se descartan los turnos del tutor,
    // así que un mensaje del estudiante fuera de la ventana no debe aparecer
    // aunque haya turnos de tutor de por medio dentro de la ventana.
    const larga = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'tutor') as 'user' | 'tutor',
      text: `mensaje ${i}`,
    }));
    // Los últimos 4 turnos son los índices 16 (user), 17 (tutor), 18 (user), 19 (tutor).
    const out = buildTutorPrompt(larga, 4);

    expect(out).toContain('mensaje 18'); // último turno del estudiante, dentro de la ventana
    expect(out).toContain('mensaje 16'); // turno del estudiante, dentro de la ventana
    expect(out).not.toContain('mensaje 19'); // es del tutor: nunca debe aparecer
    expect(out).not.toContain('mensaje 14'); // turno del estudiante, fuera de la ventana
  });

  it('aguanta un historial vacío sin romperse', () => {
    const out = buildTutorPrompt([]);
    expect(out).toContain(TUTOR_INSTRUCTION);
    expect(out.endsWith('Tutor:')).toBe(true);
  });

  it('aguanta un historial de un solo turno del estudiante', () => {
    // Caso real: el primer mensaje de una conversación, sin respuestas previas
    // del tutor que puedan servir de fuente de copia.
    const out = buildTutorPrompt([{ role: 'user', text: 'Hi, how are you?' }]);
    expect(out).toContain('Student: Hi, how are you?');
    expect(out.endsWith('\nTutor:')).toBe(true);
  });

  it('turnos del estudiante distintos producen prompts distintos', () => {
    // No es una prueba de que el modelo responda distinto (eso requiere el
    // modelo cargado), pero si el prompt de entrada es idéntico para preguntas
    // distintas, el modelo no tiene ninguna posibilidad de variar la salida.
    const a = buildTutorPrompt([{ role: 'user', text: 'How are you doing?' }]);
    const b = buildTutorPrompt([{ role: 'user', text: 'Can you help me please?' }]);
    expect(a).not.toBe(b);
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
