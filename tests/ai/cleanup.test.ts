/**
 * S6-T4 / S7-T2 · Tests de la limpieza de salidas del modelo del tutor.
 *
 * Cada caso de aquí nació de una salida real del spike S6-T4, no de imaginar qué
 * podría pasar. Son los dos defectos que llegarían a la pantalla del estudiante si
 * el worker devolviera el texto del modelo tal cual.
 */

import { describe, expect, it } from 'vitest';
import {
  PREGUNTAS_DE_SEGUIMIENTO,
  RESPUESTA_DE_RESERVA,
  cleanSuggestions,
  cleanTutorReply,
  esEco,
  esRechazoMemorizado,
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

  it('sustituye la negativa memorizada que devolvio el modelo en la demo', () => {
    // Salida literal ante la entrada "Hi, how are you?".
    const salidaReal =
      "I'm sorry, but I cannot respond to this prompt as it goes against OpenAI's " +
      'use case policy on generating inappropriate or offensive content.';
    expect(cleanTutorReply(salidaReal)).toBe(RESPUESTA_DE_RESERVA);
  });

  it('sustituye una respuesta vacia en vez de dejar la burbuja en blanco', () => {
    expect(cleanTutorReply('   ')).toBe(RESPUESTA_DE_RESERVA);
  });

  // Regresion del 17-ago, vista en la aplicacion desplegada: ante «I went to the
  // beach last weekend with my family» el modelo devolvio esa misma frase con la
  // etiqueta de papel delante. Dos defectos en una sola respuesta.
  it('quita la etiqueta de papel que filtra el modelo', () => {
    expect(cleanTutorReply('Assistant: That sounds lovely! Which beach?')).toBe(
      'That sounds lovely! Which beach?'
    );
    expect(cleanTutorReply('AI: Nice! Tell me more.')).toBe('Nice! Tell me more.');
    expect(cleanTutorReply('Tutor: What did you do there?')).toBe('What did you do there?');
  });

  it('NO toca la palabra si no es una etiqueta al principio', () => {
    // Una frase legitima que mencione la palabra no debe mutilarse.
    expect(cleanTutorReply('My assistant: she is very kind. Who helps you?')).toBe(
      'My assistant: she is very kind. Who helps you?'
    );
  });

  it('sustituye una copia literal de la frase del estudiante', () => {
    // `esEco` no lo atrapaba: busca ecos en forma de pregunta, y esto es una
    // repeticion tal cual. Es el caso exacto que se vio en produccion.
    const dicho = 'I went to the beach last weekend with my family';
    const salida = cleanTutorReply(`Assistant: ${dicho}.`, { studentUtterance: dicho });
    expect(salida).not.toContain('Assistant');
    expect(PREGUNTAS_DE_SEGUIMIENTO).toContain(salida);
  });

  it('sin contexto, no comprueba repeticion ni eco (compatibilidad con I-09)', () => {
    // Las pruebas de I-09 llaman a cleanTutorReply con un solo argumento; con la
    // firma extendida eso tiene que seguir funcionando igual.
    expect(cleanTutorReply('What did you do yesterday?')).toBe('What did you do yesterday?');
  });

  it('sustituye la respuesta identica a la anterior (I-10, red de seguridad)', () => {
    // La causa raiz de I-10 (copiar una linea Tutor: del prompt) se quito en
    // buildTutorPrompt; este chequeo cubre una repeticion que viniera de cualquier
    // otra causa.
    const out = cleanTutorReply('What is the topic of discussion?', {
      previousReply: 'What is the topic of discussion?',
    });
    expect(out).not.toBe('What is the topic of discussion?');
    expect(PREGUNTAS_DE_SEGUIMIENTO).toContain(out);
  });

  it('no sustituye si la respuesta es distinta de la anterior', () => {
    const out = cleanTutorReply('What did you do next?', {
      previousReply: 'What is your name?',
    });
    expect(out).toBe('What did you do next?');
  });

  it('sustituye el eco de la frase del estudiante', () => {
    const out = cleanTutorReply('What is your name?', {
      studentUtterance: 'Hi! My name is Ana.',
    });
    expect(PREGUNTAS_DE_SEGUIMIENTO).toContain(out);
  });

  it('no sustituye una pregunta que sí aporta algo nuevo', () => {
    const buena = 'What do you think about the signs you mentioned?';
    expect(cleanTutorReply(buena, { studentUtterance: 'I need to talk about signs.' })).toBe(
      buena
    );
  });

  it('la pregunta de reserva rota con el turno, para no repetirse ella misma', () => {
    const a = cleanTutorReply('', { turno: 0 });
    const b = cleanTutorReply('', { turno: 1 });
    // Ambas caen en RESPUESTA_DE_RESERVA porque vienen vacías (I-09): ese caso no
    // rota. La rotación por turno se prueba directamente sobre las de seguimiento.
    expect(a).toBe(RESPUESTA_DE_RESERVA);
    expect(b).toBe(RESPUESTA_DE_RESERVA);
    const c = cleanTutorReply('x', { previousReply: 'x', turno: 0 });
    const d = cleanTutorReply('x', { previousReply: 'x', turno: 1 });
    expect(c).not.toBe(d);
  });
});

describe('esEco', () => {
  it('detecta la pregunta que pide justo lo que el estudiante acaba de decir', () => {
    // Los tres casos medidos en la conversación simulada de diez turnos.
    expect(esEco('What is your name?', 'Hi! My name is Ana.')).toBe(true);
    expect(
      esEco('What is your favorite beach?', 'My favorite beach is Manuel Antonio.')
    ).toBe(true);
    expect(esEco('Do you like the beach?', 'Do you like the beach?')).toBe(true); // el loro
  });

  it('deja pasar la pregunta que aporta una palabra de contenido nueva', () => {
    expect(esEco('What is your profession?', 'I work as a nurse.')).toBe(false);
    expect(
      esEco(
        'What do you think about the signs you mentioned?',
        'Well, I need to talk about signs.'
      )
    ).toBe(false);
  });

  it('trata como eco una pregunta sin ninguna palabra de contenido', () => {
    expect(esEco('What about it?', 'I went to the beach.')).toBe(true);
  });
});

describe('esRechazoMemorizado', () => {
  it.each([
    "I'm sorry, but I cannot respond to this prompt as it goes against OpenAI's use case policy.",
    'As an AI language model, I do not have personal opinions.',
    'I cannot generate inappropriate content.',
    'This request goes against our content policy.',
  ])('reconoce la negativa: %s', (salida) => {
    expect(esRechazoMemorizado(salida)).toBe(true);
  });

  it.each([
    'What did you do yesterday?',
    'That sounds great! Where did you go?',
    // No debe confundirse con una conversacion legitima sobre politica o disculpas.
    "I'm sorry to hear that. What happened?",
    'My policy at work is to arrive early. What about yours?',
    'I cannot swim very well. Can you?',
  ])('no marca una respuesta legitima: %s', (salida) => {
    expect(esRechazoMemorizado(salida)).toBe(false);
  });
});

describe('esEco — contra la transcripción real capturada en producción', () => {
  // Los 10 pares exactos que devolvió el modelo real (LaMini-Flan-T5-248M, worker de
  // produccion) en una conversacion simulada de diez turnos, ANTES de este arreglo.
  // Es la evidencia de que "el tutor no conversa": convertia cada frase del
  // estudiante en una pregunta sobre lo mismo. Se capturaron en vivo en esta misma
  // sesion de trabajo, no se inventaron para el test.
  //
  // Verificados campo a campo contra el algoritmo real (no adivinados): las 6 filas
  // marcadas `true` son las que el eco atrapa; las 4 `false` son preguntas que, pese
  // a sonar repetitivas al oído, sí introducen al menos una palabra de contenido
  // nueva ("profession", "difficulty of the task", "work schedule" — "work" no es
  // "worked" para la comparación literal, "kind of activities... usually").
  const transcripcionReal: Array<[estudiante: string, tutorViejo: string, esperado: boolean]> = [
    ['Hi! My name is Ana.', 'What is your name?', true],
    ['I am from Costa Rica.', 'Where are you from?', true],
    ['I work as a nurse.', 'What is your profession?', false],
    ['It is hard but I like it.', 'What do you think about the difficulty of the task?', false],
    ['Yesterday I worked twelve hours.', 'What is your current work schedule?', false],
    ['I was very tired.', 'What did you do when you were tired?', true],
    ['On weekends I go to the beach.', 'What kind of activities do you usually do on weekends?', false],
    ['My favorite beach is Manuel Antonio.', 'What is your favorite beach?', true],
    ['Do you like the beach?', 'Do you like the beach?', true], // el loro exacto
    ['What is your favorite food?', 'What is your favorite food?', true], // el loro exacto
  ];

  it.each(transcripcionReal)(
    'estudiante: "%s" · tutor (viejo): "%s" · eco esperado: %s',
    (estudiante, tutorViejo, esperado) => {
      expect(esEco(tutorViejo, estudiante)).toBe(esperado);
    }
  );

  it('detecta exactamente los 6 ecos reales, sin marcar como eco las 4 preguntas legítimas', () => {
    // El número no se redondea a favor: 6 de 10 es el resultado medido, no una meta.
    // Las 4 que sobreviven (perfil de trabajo, dificultad de la tarea, horario,
    // actividades de fin de semana) aportan contenido nuevo aunque giren sobre el
    // mismo tema — exactamente el comportamiento que se quiere: sustituir el "loro"
    // y el eco de un dato puntual, no cualquier pregunta relacionada.
    const detectados = transcripcionReal.filter(([e, t]) => esEco(t, e)).length;
    expect(detectados).toBe(6);
  });
});
