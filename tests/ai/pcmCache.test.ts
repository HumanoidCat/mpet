/**
 * S5-T5 · Tests de la caché de audio de referencia.
 *
 * POR QUÉ EXISTE ESTA CACHÉ: al ejecutar el worker real, la misma frase devolvió
 * audios distintos en cada llamada (53 760, 55 040 y 57 088 muestras). VITS muestrea
 * ruido a propósito para variar la prosodia, y no se puede desactivar. Como este
 * audio es la referencia contra la que se puntúa la pronunciación del estudiante,
 * dejarlo cambiar significaría que la misma pronunciación saca puntajes distintos.
 */

import { describe, expect, it } from 'vitest';
import { createPcmCache } from '../../src/ai/tts/pcmCache';

const pcm = (...values: number[]) => new Float32Array(values);

describe('createPcmCache', () => {
  it('devuelve el mismo audio para la misma frase', () => {
    const cache = createPcmCache();
    cache.set('hello', pcm(0.1, 0.2, 0.3));

    expect(Array.from(cache.get('hello')!)).toEqual([
      0.10000000149011612, 0.20000000298023224, 0.30000001192092896,
    ]);
  });

  it('no conoce frases que no se guardaron', () => {
    const cache = createPcmCache();
    expect(cache.get('hello')).toBeUndefined();
  });

  it('distingue frases que solo cambian en algo mínimo', () => {
    // La clave es el texto exacto: "ship" y "sheep" son justamente el par mínimo
    // que el equipo usará para el puntaje de pronunciación (S6-T7).
    const cache = createPcmCache();
    cache.set('ship', pcm(1));
    cache.set('sheep', pcm(2));

    expect(cache.get('ship')![0]).toBe(1);
    expect(cache.get('sheep')![0]).toBe(2);
  });

  it('aísla lo guardado de quien lo escribió', () => {
    // El PCM viaja a dos consumidores (reproductor y comparador). Si compartieran
    // el mismo objeto, una modificación de cualquiera corrompería la referencia.
    const cache = createPcmCache();
    const original = pcm(0.5, 0.5);
    cache.set('hello', original);

    original[0] = 999;
    expect(cache.get('hello')![0]).toBe(0.5);
  });

  it('aísla lo guardado de quien lo lee', () => {
    const cache = createPcmCache();
    cache.set('hello', pcm(0.5, 0.5));

    const first = cache.get('hello')!;
    first[0] = 999;
    expect(cache.get('hello')![0]).toBe(0.5);
  });

  it('desaloja la frase más antigua al llenarse', () => {
    const cache = createPcmCache(2);
    cache.set('a', pcm(1));
    cache.set('b', pcm(2));
    cache.set('c', pcm(3));

    expect(cache.size).toBe(2);
    expect(cache.get('a')).toBeUndefined(); // la más antigua se fue
    expect(cache.get('b')).toBeDefined();
    expect(cache.get('c')).toBeDefined();
  });

  it('renueva la edad de una frase al volver a guardarla', () => {
    const cache = createPcmCache(2);
    cache.set('a', pcm(1));
    cache.set('b', pcm(2));
    cache.set('a', pcm(9)); // 'a' vuelve a ser la más reciente
    cache.set('c', pcm(3));

    expect(cache.get('a')![0]).toBe(9);
    expect(cache.get('b')).toBeUndefined(); // ahora la más antigua era 'b'
  });

  it('rechaza tamaños imposibles', () => {
    expect(() => createPcmCache(0)).toThrow();
    expect(() => createPcmCache(-1)).toThrow();
    expect(() => createPcmCache(1.5)).toThrow();
  });
});
