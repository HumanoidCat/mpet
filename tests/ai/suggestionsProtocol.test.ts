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
    { role: 'user' as const, text: 'I went to the beach.' },
  ];

  it('pide una tarea concreta sobre la frase, sin pedirle que actúe de tutor', () => {
    // I-09: "You are a friendly English tutor…" disparaba negativas memorizadas del
    // destilado del modelo ante entradas tan simples como "Hi, how are you?".
    const out = buildTutorPrompt(historia);
    expect(out).toBe(`${TUTOR_INSTRUCTION} "I went to the beach."`);
  });

  it('NO usa formato de diálogo con líneas Tutor:', () => {
    // I-10: el modelo copiaba literalmente la última línea "Tutor:" que encontraba
    // en el prompt en vez de generar una respuesta nueva, y varios turnos seguidos
    // recibían la misma respuesta exacta. Sin esas líneas en el prompt, no hay nada
    // que copiar.
    const out = buildTutorPrompt(historia);
    expect(out).not.toContain('Student:');
    expect(out).not.toContain('Tutor:');
  });

  it('usa el último turno del ESTUDIANTE, no el último mensaje a secas', () => {
    // Si tomara el último mensaje del historial sin filtrar por rol, le pediría al
    // modelo una pregunta sobre su propia respuesta anterior.
    const out = buildTutorPrompt(historia);
    expect(out).toContain('I went to the beach.');
    expect(out).not.toContain('Hi! How are you?');
  });

  it('busca hacia atrás dentro de la ventana de turnos', () => {
    const larga = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'tutor') as 'user' | 'tutor',
      text: `mensaje ${i}`,
    }));
    // Con ventana 4 entran los índices 16-19; de esos, los pares (16, 18) son del
    // estudiante, y el más reciente es el 18.
    const out = buildTutorPrompt(larga, 4);
    expect(out).toContain('mensaje 18');
  });

  it('aguanta un historial vacío sin romperse', () => {
    expect(buildTutorPrompt([])).toBe(`${TUTOR_INSTRUCTION} ""`);
  });

  it('aguanta un historial sin ningún turno del estudiante', () => {
    const out = buildTutorPrompt([{ role: 'tutor', text: 'Hello!' }]);
    expect(out).not.toContain('Hello!');
    expect(out).toBe(`${TUTOR_INSTRUCTION} ""`);
  });

  it('dos frases distintas del estudiante producen prompts distintos', () => {
    // Antes del arreglo de I-10 esto no estaba garantizado: el prompt podía
    // colapsar a lo mismo si el modelo se enganchaba a copiar una línea Tutor: fija.
    const a = buildTutorPrompt([{ role: 'user', text: 'I like pizza.' }]);
    const b = buildTutorPrompt([{ role: 'user', text: 'I like sushi.' }]);
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
