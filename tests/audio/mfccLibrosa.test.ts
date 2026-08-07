/**
 * RF-09 — Verificación cruzada de los MFCC contra librosa.
 *
 * La métrica del curso para este requisito es "error menor al 5 % frente a
 * librosa". Esta prueba la cierra.
 *
 * Sigue la resolución sobre dependencias (D-07): **librosa no se agrega al
 * proyecto**. Se ejecutó una vez fuera del repositorio con
 * `fixtures/generar_referencia_librosa.py`, se exportaron los coeficientes de
 * referencia a JSON, y ese archivo se versiona. Ni el proyecto ni el navegador
 * incorporan nada nuevo.
 *
 * Qué demuestra y qué no: esto verifica **interoperabilidad** —que nuestros
 * coeficientes sean intercambiables con los de la literatura—, no corrección.
 * La corrección ya la cubre la validación de cada etapa contra su definición,
 * que es una referencia más fuerte porque no depende de que la biblioteca esté
 * bien.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MfccExtractor } from '../../src/audio/features/mfcc';

const RUTA = join(__dirname, 'fixtures', 'mfcc-librosa.json');
const hayFixture = existsSync(RUTA);

interface Referencia {
  _librosa: string;
  parametros: {
    sampleRate: number;
    fftSize: number;
    nMels: number;
    nMfcc: number;
    htk: boolean;
  };
  casos: Record<string, number[]>;
}

const RATE = 16000;

function seno(f: number, n: number, amp = 1): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * f * i) / RATE);
  return out;
}

/** Misma síntesis que usa el generador en Python. */
function vocal(f0: number, formantes: number[], n: number): Float32Array {
  const out = new Float32Array(n);
  for (let k = 1; k * f0 < RATE / 2; k++) {
    const f = f0 * k;
    let g = 0.05;
    for (const F of formantes) g += 1 / (1 + Math.pow((f - F) / 100, 2));
    const h = seno(f, n, g);
    for (let i = 0; i < n; i++) out[i] += h[i];
  }
  return out;
}

/**
 * Generador de Park-Miller (MINSTD), identico al del script de Python.
 *
 * Se usa el multiplicador 16807 y no el clasico 1103515245 que emplean las
 * demas pruebas. El motivo es la comparacion entre lenguajes: JavaScript
 * guarda los enteros como numeros de doble precision, asi que un producto que
 * supere 2^53 pierde precision, mientras que Python trabaja con precision
 * arbitraria. Con el multiplicador clasico las dos secuencias divergen desde la
 * segunda muestra, y la comparacion enfrentaria senales distintas -- fue
 * justamente lo que aparecio al correr esta verificacion por primera vez.
 */
function ruido(n: number, amp = 1, semilla = 3): Float32Array {
  const out = new Float32Array(n);
  let s = semilla;
  for (let i = 0; i < n; i++) {
    s = (s * 16807) % 2147483647;
    out[i] = ((s / 2147483647) * 2 - 1) * amp;
  }
  return out;
}

const N = 512;
const SENALES: Record<string, Float32Array> = {
  tono_1000hz: seno(1000, N),
  tono_440hz: seno(440, N),
  vocal_a: vocal(120, [700, 1200, 2600], N),
  vocal_i: vocal(120, [300, 2300, 3000], N),
  vocal_u: vocal(120, [350, 800, 2400], N),
  ruido: ruido(N),
};

describe.skipIf(!hayFixture)('RF-09 · MFCC contra librosa', () => {
  const referencia: Referencia = hayFixture
    ? JSON.parse(readFileSync(RUTA, 'utf-8'))
    : ({} as Referencia);

  it('el fixture se generó con los parámetros del proyecto', () => {
    // Cuatro parámetros de librosa no son obvios y, mal puestos, harían fallar
    // la comparación por razones que no son un error real. Se verifican aquí
    // para que un fixture regenerado con otros valores no pase inadvertido.
    expect(referencia.parametros.sampleRate).toBe(16000);
    expect(referencia.parametros.fftSize).toBe(512);
    expect(referencia.parametros.nMels).toBe(26);
    expect(referencia.parametros.nMfcc).toBe(13);
    expect(referencia.parametros.htk).toBe(true); // no la variante de Slaney

    console.log(`\n  Referencia generada con librosa ${referencia._librosa}`);
  });

  it('MÉTRICA RF-09: el error es menor al 5 % en todos los casos', () => {
    const extractor = new MfccExtractor({ sampleRate: RATE, fftSize: N });

    console.log('\n== Error relativo contra librosa ==');
    console.log('  ' + 'caso'.padEnd(14) + 'error medio'.padStart(13) + 'error máx'.padStart(12));

    let peorGlobal = 0;

    for (const [nombre, esperado] of Object.entries(referencia.casos)) {
      const obtenido = extractor.process(SENALES[nombre]);
      expect(obtenido).toHaveLength(esperado.length);

      // El error se mide relativo a la escala de los coeficientes del caso, no
      // coeficiente a coeficiente: los MFCC pasan por cero, y ahí un error
      // relativo puntual se dispara sin que la diferencia sea significativa.
      const escala = Math.max(...esperado.map(Math.abs));
      const errores = esperado.map((v, k) => Math.abs(obtenido[k] - v) / escala);

      const medio = errores.reduce((s, e) => s + e, 0) / errores.length;
      const maximo = Math.max(...errores);
      peorGlobal = Math.max(peorGlobal, maximo);

      console.log(
        '  ' +
          nombre.padEnd(14) +
          `${(100 * medio).toFixed(3)} %`.padStart(13) +
          `${(100 * maximo).toFixed(3)} %`.padStart(12)
      );

      expect(maximo).toBeLessThan(0.05);
    }

    console.log(`\n  Peor error de todos los casos: ${(100 * peorGlobal).toFixed(3)} %`);
    console.log('  Métrica exigida por RF-09: menos del 5 %');
  });

  it('coincide también en el coeficiente cero, que lleva el volumen', () => {
    // c0 es el que más magnitud tiene y el que acumularía cualquier diferencia
    // sistemática en la escala del logaritmo o en la normalización de la DCT.
    const extractor = new MfccExtractor({ sampleRate: RATE, fftSize: N });

    for (const [nombre, esperado] of Object.entries(referencia.casos)) {
      const obtenido = extractor.process(SENALES[nombre]);
      const error = Math.abs(obtenido[0] - esperado[0]) / Math.abs(esperado[0]);
      expect(error).toBeLessThan(0.05);
    }
  });
});

describe.skipIf(hayFixture)('RF-09 · sin la referencia de librosa', () => {
  it('indica cómo generarla', () => {
    // Ver tests/audio/fixtures/README.md y el encabezado del generador.
    expect(hayFixture).toBe(false);
  });
});
