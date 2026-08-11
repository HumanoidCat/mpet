import { describe, it, expect } from 'vitest';
import { compararConObjetivo, normalizarParaComparar } from '../../src/core/fraseObjetivo';

/**
 * La senal independiente del hablante (S9-T3).
 *
 * El puntaje acustico no puede detectar una palabra mal pronunciada: el efecto de
 * quien habla pesa unas seis veces mas que el error. El reconocedor si, porque
 * esta entrenado con miles de voces y el error acaba apareciendo en el texto.
 *
 * Los casos de abajo salen de las grabaciones reales de la calibracion.
 */

describe('normalizarParaComparar', () => {
  it('ignora mayusculas y puntuacion, que las pone el reconocedor', () => {
    // Mismo criterio que el diferenciador de gramatica (D-06): capitalizacion y
    // signos los genera el modelo, no el hablante.
    expect(normalizarParaComparar('I need a new ship!')).toEqual([
      'i', 'need', 'a', 'new', 'ship',
    ]);
    expect(normalizarParaComparar('  Please,   sit   down.  ')).toEqual([
      'please', 'sit', 'down',
    ]);
  });

  it('conserva el apostrofo, que si distingue palabras', () => {
    // "well" y "we'll" son palabras distintas y se pronuncian distinto.
    expect(normalizarParaComparar("we'll")).toEqual(["we'll"]);
  });

  it('un texto vacio no produce palabras', () => {
    expect(normalizarParaComparar('   ')).toEqual([]);
  });
});

describe('compararConObjetivo', () => {
  it('repetir la frase exacta no marca nada', () => {
    const r = compararConObjetivo('I need a new ship', 'I need a new ship');

    expect(r.noReconocidas).toBe(0);
    expect(r.aciertos).toBe(1);
    expect(r.palabras.every((p) => !p.noReconocida)).toBe(true);
  });

  it('detecta la palabra cambiada y solo esa', () => {
    // Caso real de la calibracion: se pidio "ship" y el reconocedor oyo "sheep".
    const r = compararConObjetivo('I need a new ship', 'I need a new sheep');

    expect(r.noReconocidas).toBe(1);
    expect(r.palabras.map((p) => p.noReconocida)).toEqual([false, false, false, false, true]);
    expect(r.palabras[4].palabra).toBe('ship');
  });

  it('no se deja engañar por mayusculas ni signos', () => {
    expect(compararConObjetivo('Please sit down here', 'please, SIT down here!').noReconocidas).toBe(0);
  });

  it('una palabra que se parte en dos desalinea el resto, y eso se marca', () => {
    // Caso real: se pidio "seat" y el reconocedor oyo "see it", que ademas corre
    // todo lo que viene detras. Marcar solo la primera seria mentir sobre lo que
    // el reconocedor entendio.
    const r = compararConObjetivo('Please seat down here', 'Please see it down here');

    expect(r.noReconocidas).toBeGreaterThan(0);
    expect(r.palabras[0].noReconocida).toBe(false);
  });

  it('si falta una palabra al final, se marca como no reconocida', () => {
    const r = compararConObjetivo('I need a new ship', 'I need a new');

    expect(r.noReconocidas).toBe(1);
    expect(r.palabras[4].noReconocida).toBe(true);
  });

  it('si el reconocedor no oyo nada, todo el objetivo queda sin reconocer', () => {
    const r = compararConObjetivo('I need a new ship', '');

    expect(r.noReconocidas).toBe(5);
    expect(r.aciertos).toBe(0);
  });

  it('un objetivo vacio da acierto total en vez de fallo total', () => {
    // No hay nada que acertar; marcarlo como 0 lo mostraria en rojo sin motivo.
    const r = compararConObjetivo('', 'lo que sea');

    expect(r.palabras).toHaveLength(0);
    expect(r.aciertos).toBe(1);
  });

  it('la fraccion de aciertos es proporcional al objetivo', () => {
    const r = compararConObjetivo('one two three four', 'one dos three cuatro');

    expect(r.noReconocidas).toBe(2);
    expect(r.aciertos).toBeCloseTo(0.5, 6);
  });
});
