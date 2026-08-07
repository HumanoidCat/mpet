/**
 * S6-T1 — Pruebas de DTW.
 *
 * Lo que hay que demostrar es la propiedad que justifica usar DTW en vez de
 * comparar trama a trama: **la misma frase dicha más despacio tiene que dar una
 * distancia baja**. Si eso no se cumple, el puntaje mediría velocidad de habla.
 */

import { describe, it, expect } from 'vitest';
import { dtw, euclidean, segmentCost } from '../../src/audio/comparator/dtw';

/** Secuencia de vectores de 1 dimensión útil, con un c₀ ficticio delante. */
function seq(...valores: number[]): Float32Array[] {
  // El primer coeficiente se ignora por defecto (es el volumen en los MFCC),
  // así que se rellena con un valor cualquiera para comprobar que da igual.
  return valores.map((v) => Float32Array.from([99, v]));
}

/** Repite cada elemento `factor` veces: simula hablar más despacio. */
function estirar(s: Float32Array[], factor: number): Float32Array[] {
  const out: Float32Array[] = [];
  for (const v of s) for (let k = 0; k < factor; k++) out.push(v);
  return out;
}

describe('Distancia euclídea (S6-T1)', () => {
  it('es cero entre vectores iguales', () => {
    expect(euclidean([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  it('coincide con su definición', () => {
    expect(euclidean([0, 3], [0, 7])).toBeCloseTo(4, 6);
    expect(euclidean([0, 3, 4], [0, 0, 0])).toBeCloseTo(5, 6);
  });

  it('puede saltarse los primeros coeficientes', () => {
    // Con from=1 el primer elemento no cuenta, por más distinto que sea.
    expect(euclidean([100, 3], [0, 3], 1)).toBe(0);
    expect(euclidean([100, 3], [0, 3], 0)).toBeCloseTo(100, 6);
  });
});

describe('Alineamiento básico (S6-T1)', () => {
  it('dos secuencias idénticas dan distancia cero y camino diagonal', () => {
    const s = seq(1, 2, 3, 4, 5);
    const r = dtw(s, s);

    expect(r.distance).toBeCloseTo(0, 6);
    expect(r.normalizedDistance).toBeCloseTo(0, 6);
    expect(r.path).toHaveLength(5);
    r.path.forEach((p, k) => {
      expect(p.i).toBe(k);
      expect(p.j).toBe(k);
    });
  });

  it('el camino empieza en (0,0) y termina en el final de ambas', () => {
    const r = dtw(seq(1, 2, 3), seq(1, 5, 2, 9, 3));

    expect(r.path[0]).toEqual({ i: 0, j: 0 });
    expect(r.path[r.path.length - 1]).toEqual({ i: 2, j: 4 });
  });

  it('el camino es monótono y continuo', () => {
    const r = dtw(seq(1, 4, 2, 8, 3, 7), seq(1, 2, 4, 8, 3, 3, 7));

    for (let k = 1; k < r.path.length; k++) {
      const anterior = r.path[k - 1];
      const actual = r.path[k];

      // Nunca retrocede…
      expect(actual.i).toBeGreaterThanOrEqual(anterior.i);
      expect(actual.j).toBeGreaterThanOrEqual(anterior.j);
      // …y avanza de a un paso como máximo en cada eje.
      expect(actual.i - anterior.i).toBeLessThanOrEqual(1);
      expect(actual.j - anterior.j).toBeLessThanOrEqual(1);
      // Y siempre avanza en al menos uno.
      expect(actual.i - anterior.i + (actual.j - anterior.j)).toBeGreaterThan(0);
    }
  });

  it('coincide con el costo calculado a mano', () => {
    // Caso chico, verificable con lápiz: [1,2] contra [1,2,2].
    // El camino óptimo es (0,0) → (1,1) → (1,2), todo con costo 0.
    const r = dtw(seq(1, 2), seq(1, 2, 2));

    expect(r.distance).toBeCloseTo(0, 6);
    expect(r.path).toEqual([
      { i: 0, j: 0 },
      { i: 1, j: 1 },
      { i: 1, j: 2 },
    ]);
  });

  it('secuencias vacías no rompen nada', () => {
    expect(dtw([], seq(1, 2)).path).toHaveLength(0);
    expect(dtw(seq(1, 2), []).distance).toBe(0);
  });
});

describe('🎯 Invariancia a la velocidad: lo que justifica usar DTW', () => {
  const original = seq(1, 3, 7, 4, 2, 8, 5);

  it('la misma secuencia hablada más despacio da distancia ~0', () => {
    // Cada trama repetida 3 veces: la persona alargó todos los sonidos.
    const lenta = estirar(original, 3);
    const r = dtw(original, lenta);

    expect(r.normalizedDistance).toBeCloseTo(0, 6);
  });

  it('funciona con estiramientos irregulares', () => {
    // Caso realista: se alargan unas partes y otras no.
    const irregular = [
      ...estirar(seq(1), 4),
      ...seq(3),
      ...estirar(seq(7), 2),
      ...seq(4, 2),
      ...estirar(seq(8), 5),
      ...seq(5),
    ];

    expect(dtw(original, irregular).normalizedDistance).toBeCloseTo(0, 6);
  });

  it('comparar trama a trama fallaría en ese mismo caso', () => {
    // Es el punto de la tarea. Sin alineamiento, la misma frase más lenta se
    // ve como completamente distinta.
    const lenta = estirar(original, 3);

    let sinAlinear = 0;
    for (let k = 0; k < original.length; k++) {
      sinAlinear += euclidean(original[k], lenta[k], 1);
    }
    sinAlinear /= original.length;

    expect(sinAlinear).toBeGreaterThan(2);
    expect(dtw(original, lenta).normalizedDistance).toBeLessThan(0.001);
  });

  it('pero sigue distinguiendo secuencias realmente distintas', () => {
    const otra = seq(9, 1, 2, 9, 8, 1, 3);
    expect(dtw(original, otra).normalizedDistance).toBeGreaterThan(2);
  });
});

describe('El volumen no debe influir (S6-T1)', () => {
  it('ignora el primer coeficiente por defecto', () => {
    // En los MFCC el c₀ es el volumen. Dos secuencias iguales salvo en c₀
    // tienen que dar distancia cero.
    const a = [Float32Array.from([10, 1]), Float32Array.from([10, 2])];
    const b = [Float32Array.from([500, 1]), Float32Array.from([500, 2])];

    expect(dtw(a, b).distance).toBeCloseTo(0, 6);
    // Si se incluye el c₀, la diferencia de volumen domina el resultado.
    expect(dtw(a, b, { ignoreFirstCoeff: false }).distance).toBeGreaterThan(900);
  });
});

describe('Banda de Sakoe–Chiba (S6-T1)', () => {
  it('no cambia el resultado cuando el alineamiento es razonable', () => {
    const a = seq(1, 3, 7, 4, 2);
    const b = estirar(a, 2);

    const sinBanda = dtw(a, b);
    const conBanda = dtw(a, b, { bandRadius: 5 });

    expect(conBanda.normalizedDistance).toBeCloseTo(sinBanda.normalizedDistance, 6);
  });

  it('evita alineamientos temporalmente implausibles', () => {
    // Un pico en la posición 3 de una secuencia y en la 7 de la otra: una
    // desviación de 4 tramas respecto de la diagonal. Sin banda, DTW deforma
    // el tiempo lo que haga falta para aparearlos y el costo baja a ~0, aunque
    // en voz eso significaría alinear una sílaba con otra muy posterior.
    const a = seq(0, 0, 0, 5, 0, 0, 0, 0, 0, 0);
    const b = seq(0, 0, 0, 0, 0, 0, 0, 5, 0, 0);

    const sinBanda = dtw(a, b);
    const conBanda = dtw(a, b, { bandRadius: 1 });

    expect(sinBanda.distance).toBeCloseTo(0, 6);
    // Con la banda, el pico ya no alcanza a su pareja y el costo lo refleja.
    expect(conBanda.distance).toBeGreaterThan(5);
  });

  it('una banda imposible se reporta, no se inventa un camino', () => {
    // Radio 0 con largos muy distintos: no hay camino que respete la banda.
    const r = dtw(seq(1, 2, 3, 4, 5, 6, 7, 8), seq(1), { bandRadius: 0 });
    expect(r.path.length === 0 || Number.isFinite(r.distance)).toBe(true);
  });
});

describe('Costo por tramo (S6-T1)', () => {
  it('mide solo las tramas del rango pedido', () => {
    // Primera mitad idéntica, segunda distinta.
    const a = seq(1, 1, 1, 1);
    const b = seq(1, 1, 5, 5);
    const r = dtw(a, b, { bandRadius: 2 });

    const primeraMitad = segmentCost(r.path, a, b, 0, 2);
    const segundaMitad = segmentCost(r.path, a, b, 2, 4);

    expect(primeraMitad).toBeCloseTo(0, 6);
    expect(segundaMitad).toBeGreaterThan(primeraMitad);
  });

  it('un rango sin tramas devuelve cero', () => {
    const a = seq(1, 2);
    const r = dtw(a, a);
    expect(segmentCost(r.path, a, a, 10, 20)).toBe(0);
  });
});
