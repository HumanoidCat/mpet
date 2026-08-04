import { describe, it, expect } from 'vitest';
import {
  resumirSesion,
  createMemorySessionStore,
  createSessionStore,
} from '../../src/core/sessionStore';
import type { ChatMessage, PronunciationResult } from '../../src/shared/contracts';

/**
 * Pruebas de S5-T6 (persistencia de sesiones).
 *
 * No se prueba IndexedDB: no existe en Node y la suite corre en `environment:
 * 'node'`. Lo que si se prueba entero es `resumirSesion`, que es donde estan las
 * decisiones que pueden salir mal, y el contrato del almacen contra la version en
 * memoria. La plomeria de IndexedDB se verifica en el navegador, igual que la
 * captura de microfono.
 */

let secuencia = 0;

function puntaje(overall: number): PronunciationResult {
  return { overall, words: [], dtwDistance: 0 };
}

function usuario(text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `u-${secuencia++}`,
    role: 'user',
    text,
    ts: 1000 + secuencia * 1000,
    ...extra,
  };
}

function tutor(text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `t-${secuencia++}`,
    role: 'tutor',
    text,
    ts: 1000 + secuencia * 1000,
    ...extra,
  };
}

describe('resumirSesion', () => {
  it('una sesion sin turnos del usuario no se resume', () => {
    // Abrir la aplicacion y no hablar no es una sesion de practica.
    expect(resumirSesion('s1', [])).toBeNull();
    expect(resumirSesion('s1', [tutor('Hello!')])).toBeNull();
  });

  it('cuenta solo los turnos y las palabras del estudiante', () => {
    // Lo que dice el tutor no es practica del estudiante: contarlo inflaria
    // las cifras de la pantalla de progreso.
    const r = resumirSesion('s1', [
      usuario('I go to the market'), // 5
      tutor('Nice! Tell me more about it please'),
      usuario('yesterday'), // 1
    ])!;

    expect(r.userTurns).toBe(2);
    expect(r.words).toBe(6);
  });

  it('el rango temporal cubre toda la sesion, no solo al usuario', () => {
    const r = resumirSesion('s1', [
      usuario('hola', { ts: 500 }),
      tutor('hi', { ts: 900 }),
      usuario('adios', { ts: 700 }),
    ])!;

    expect(r.startedAt).toBe(500);
    expect(r.endedAt).toBe(900);
  });

  it('promedia, y saca mejor y peor, solo de los turnos puntuados', () => {
    // El puntaje llega despues del turno, asi que es normal que algunos
    // mensajes no lo tengan todavia. Esos no deben arrastrar la media.
    const r = resumirSesion('s1', [
      usuario('one', { pronunciation: puntaje(90) }),
      usuario('two'), // sin puntaje
      usuario('three', { pronunciation: puntaje(60) }),
    ])!;

    expect(r.pronunciationAvg).toBe(75);
    expect(r.pronunciationBest).toBe(90);
    expect(r.pronunciationWorst).toBe(60);
  });

  it('sin ningun puntaje devuelve null y no cero', () => {
    // Cero significaria "pronuncio pesimo". La verdad es que no se midio, y la
    // pantalla de progreso tiene que poder distinguir las dos cosas.
    const r = resumirSesion('s1', [usuario('hello')])!;

    expect(r.pronunciationAvg).toBeNull();
    expect(r.pronunciationBest).toBeNull();
    expect(r.pronunciationWorst).toBeNull();
  });

  it('cuenta como corregido solo el turno que trae ediciones', () => {
    const r = resumirSesion('s1', [
      usuario('I goed', {
        correction: {
          corrected: 'I went',
          edits: [{ index: 1, original: 'goed', corrected: 'went', type: 'grammar' }],
        },
      }),
      usuario('I went', { correction: { corrected: 'I went', edits: [] } }),
      usuario('sin corrector'),
    ])!;

    expect(r.correctedTurns).toBe(1);
  });

  it('no cuenta palabras en un texto vacio o en blanco', () => {
    const r = resumirSesion('s1', [usuario('   '), usuario('hola')])!;
    expect(r.words).toBe(1);
  });
});

describe('Almacen de sesiones', () => {
  it('guardar y recuperar devuelve los mensajes intactos', async () => {
    const store = createMemorySessionStore();
    const mensajes = [usuario('hello', { pronunciation: puntaje(80) }), tutor('hi')];

    const guardada = await store.save('s1', mensajes);

    expect(guardada).not.toBeNull();
    expect(guardada!.userTurns).toBe(1);
    expect((await store.get('s1'))!.messages).toHaveLength(2);
  });

  it('guardar dos veces la misma sesion actualiza en vez de duplicar', async () => {
    // Se guarda en cada turno, asi que la operacion tiene que ser idempotente.
    const store = createMemorySessionStore();

    await store.save('s1', [usuario('uno')]);
    await store.save('s1', [usuario('uno'), usuario('dos')]);

    const lista = await store.list();
    expect(lista).toHaveLength(1);
    expect(lista[0].userTurns).toBe(2);
  });

  it('una sesion sin turnos del usuario no se guarda', async () => {
    const store = createMemorySessionStore();

    expect(await store.save('s1', [tutor('hola')])).toBeNull();
    expect(await store.list()).toHaveLength(0);
  });

  it('list devuelve de la mas reciente a la mas antigua y sin los mensajes', async () => {
    const store = createMemorySessionStore();
    await store.save('vieja', [usuario('a', { ts: 100 })]);
    await store.save('nueva', [usuario('b', { ts: 9000 })]);

    const lista = await store.list();

    expect(lista.map((s) => s.id)).toEqual(['nueva', 'vieja']);
    // El resumen viaja sin los mensajes: la pantalla de progreso lista muchas
    // sesiones y no necesita cargar la conversacion de cada una.
    expect('messages' in lista[0]).toBe(false);
  });

  it('get de una sesion inexistente devuelve null', async () => {
    expect(await createMemorySessionStore().get('no-existe')).toBeNull();
  });

  it('remove y clear vacian el historial', async () => {
    const store = createMemorySessionStore();
    await store.save('s1', [usuario('a')]);
    await store.save('s2', [usuario('b')]);

    await store.remove('s1');
    expect(await store.list()).toHaveLength(1);

    await store.clear();
    expect(await store.list()).toHaveLength(0);
  });

  it('sin IndexedDB cae al almacen en memoria en vez de romper', async () => {
    // Es el caso de la navegacion privada de algunos navegadores. En Node
    // tampoco existe IndexedDB, asi que esta prueba ejercita justo esa rama.
    const store = createSessionStore();
    expect(await store.save('s1', [usuario('hola')])).not.toBeNull();
  });
});
