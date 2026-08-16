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
  DEFAULT_SUGGESTIONS_CONFIG,
  FALLBACK_SUGGESTIONS_CONFIG,
  GEN_REPLY,
  GEN_SUGGEST,
  HISTORY_TURNS,
  SUGGESTIONS_CONFIGS,
  SUGGESTION_PROMPTS,
  TUTOR_INSTRUCTION,
  TUTOR_SYSTEM_ES,
  buildSuggestionPrompt,
  buildTutorMessages,
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

describe('buildTutorMessages · tutor de chat bilingue', () => {
  const historia = [
    { role: 'user' as const, text: 'Hello, my name is Ana.' },
    { role: 'tutor' as const, text: 'Nice to meet you, Ana! What do you do?' },
    { role: 'user' as const, text: 'I am a nurse.' },
  ];

  it('empieza con una instruccion de sistema', () => {
    const [primero] = buildTutorMessages(historia);
    expect(primero.role).toBe('system');
    expect(primero.content.length).toBeGreaterThan(0);
  });

  it('SI incluye los turnos anteriores del tutor, al contrario que el prompt de T5', () => {
    // Es la diferencia que justifica traer un modelo de chat: I-10 prohibio darle sus
    // respuestas a un T5 porque las copiaba, pero un modelo de chat las necesita para
    // recordar. Sin esto no hay memoria conversacional y el cambio de modelo no sirve
    // de nada.
    const out = buildTutorMessages(historia);
    const asistente = out.filter((m) => m.role === 'assistant');
    expect(asistente).toHaveLength(1);
    expect(asistente[0].content).toBe('Nice to meet you, Ana! What do you do?');
  });

  it('traduce el papel `tutor` a `assistant`, que es el que entiende el modelo', () => {
    const out = buildTutorMessages(historia);
    expect(out.some((m) => (m.role as string) === 'tutor')).toBe(false);
    expect(out.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
  });

  it('cambia la instruccion cuando el turno vino en espanol', () => {
    const en = buildTutorMessages(historia, 'en')[0].content;
    const es = buildTutorMessages(historia, 'es')[0].content;
    expect(es).not.toBe(en);
    expect(es).toBe(TUTOR_SYSTEM_ES);
  });

  it('la instruccion en espanol pide dar primero la frase en ingles', () => {
    // Es lo que hace util al tutor bilingue: el estudiante recurre al espanol porque
    // no le sale en ingles, asi que lo primero que necesita es esa frase.
    expect(TUTOR_SYSTEM_ES).toContain('In English:');
  });

  it('recorta el historial a la ventana de turnos', () => {
    const larga = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'tutor') as 'user' | 'tutor',
      text: `mensaje ${i}`,
    }));
    const out = buildTutorMessages(larga, 'en', 4);
    // 1 de sistema + 4 de conversacion.
    expect(out).toHaveLength(5);
    expect(out.at(-1)!.content).toBe('mensaje 19');
    expect(out.some((m) => m.content === 'mensaje 15')).toBe(false);
  });

  it('aguanta un historial vacio', () => {
    const out = buildTutorMessages([]);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe('system');
  });
});

describe('parametros de generacion', () => {
  it('las sugerencias son reproducibles y la conversacion no', () => {
    // No es una inconsistencia sino la decision central del arreglo de la
    // repeticion: una correccion que cambia cada vez confunde, una respuesta de
    // tutor que nunca cambia deja de ser una conversacion. La decodificacion voraz
    // es determinista por definicion, y era la causa que faltaba probar.
    expect(GEN_SUGGEST.do_sample).toBe(false);
    expect(GEN_REPLY.do_sample).toBe(true);
  });

  it('el muestreo esta acotado para no producir incoherencias', () => {
    // Muestrear sin limite es lo que produce disparates: `top_p` corta la cola de
    // tokens improbables y `temperature` mantiene la variedad en un rango util.
    expect(GEN_REPLY.temperature).toBeGreaterThan(0);
    expect(GEN_REPLY.temperature).toBeLessThanOrEqual(1);
    expect(GEN_REPLY.top_p).toBeGreaterThan(0.5);
    expect(GEN_REPLY.top_p).toBeLessThanOrEqual(1);
  });
});

describe('configuraciones', () => {
  it('los dos tamaños de LaMini siguen comparables entre sí', () => {
    // La comparación original del spike S6-T4, que sigue valiendo: se eligió el
    // grande porque el pequeño no ejecutaba la instrucción. Ya no son las únicas
    // dos configuraciones —D-18 añadió el modelo de chat— pero el argumento que
    // decidió entre ellas no cambia.
    expect(getSuggestionsConfig('grande-248m').expectedMB).toBeGreaterThan(
      getSuggestionsConfig('pequeno-77m').expectedMB
    );
  });

  it('ningún modelo va sin cuantizar: fp32 serían más de 1 GB', () => {
    expect(SUGGESTIONS_CONFIGS.every((c) => c.dtype !== 'fp32')).toBe(true);
  });

  it('ningún modelo usa 4 bits: D-05 lo midió más lento Y más pesado', () => {
    // ONNX Runtime sobre WebAssembly no tiene núcleos para enteros de 4 bits y
    // descuantiza en cada inferencia: 3.8× más lento y más espacio en caché,
    // medido en el corrector gramatical (D-05). En un modelo de chat el castigo
    // es peor todavía, porque genera token a token y lo paga en cada uno.
    //
    // Se probó q4 en el modelo del tutor el 16-ago y el turno se volvió lento de
    // forma perceptible. Esta prueba existe para que no vuelva a colarse.
    expect(SUGGESTIONS_CONFIGS.every((c) => c.dtype !== 'q4')).toBe(true);
  });

  it('las dos familias de modelo están representadas', () => {
    // El worker implementa dos caminos distintos (`seq2seq` y `chat`) y los dos
    // tienen que tener al menos una configuración, o uno de los dos sería código
    // muerto que nadie ejercita.
    const familias = new Set(SUGGESTIONS_CONFIGS.map((c) => c.kind));
    expect(familias).toEqual(new Set(['seq2seq', 'chat']));
  });

  it('la vuelta atrás apunta a una configuración que existe y no es la actual', () => {
    // Si esto se rompe, la marcha atrás documentada en D-18 deja de funcionar
    // justo cuando haría falta.
    expect(FALLBACK_SUGGESTIONS_CONFIG).not.toBe(DEFAULT_SUGGESTIONS_CONFIG);
    expect(() => getSuggestionsConfig(FALLBACK_SUGGESTIONS_CONFIG)).not.toThrow();
    expect(getSuggestionsConfig(FALLBACK_SUGGESTIONS_CONFIG).kind).toBe('seq2seq');
  });

  it('el modelo por defecto es de chat, que es lo que permite conversar', () => {
    expect(getSuggestionsConfig(DEFAULT_SUGGESTIONS_CONFIG).kind).toBe('chat');
  });

  it('falla con un identificador desconocido', () => {
    // @ts-expect-error se comprueba el error en tiempo de ejecución, no el tipo
    expect(() => getSuggestionsConfig('inventado')).toThrow();
  });
});
